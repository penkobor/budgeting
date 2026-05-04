import { supabase } from './supabase'
import { expandRuleInRange } from './recurring'
import { effectiveOccurrenceAmount } from './projection'
import { isoDate } from './utils'
import type {
  Asset,
  Category,
  MonthlyGoal,
  MonthlyOpening,
  RecurringOverride,
  RecurringRule,
  Settings,
  Transaction,
} from './db.types'

interface ExportData {
  settings: Settings
  categories: Category[]
  transactions: Transaction[]
  recurringRules: RecurringRule[]
  overrides: RecurringOverride[]
  assets: Asset[]
  goals: MonthlyGoal[]
  openings: MonthlyOpening[]
}

async function fetchAllData(): Promise<ExportData> {
  const [
    settingsRes,
    categoriesRes,
    transactionsRes,
    rulesRes,
    overridesRes,
    assetsRes,
    goalsRes,
    openingsRes,
  ] = await Promise.all([
    supabase.from('settings').select('*').maybeSingle(),
    supabase.from('categories').select('*').order('sort_order').order('name'),
    supabase.from('transactions').select('*').order('occurred_on', { ascending: false }),
    supabase.from('recurring_rules').select('*').order('name'),
    supabase.from('recurring_overrides').select('*'),
    supabase.from('assets').select('*'),
    supabase.from('monthly_goals').select('*').order('year_month', { ascending: false }),
    supabase.from('monthly_openings').select('*').order('month', { ascending: false }),
  ])

  for (const r of [settingsRes, categoriesRes, transactionsRes, rulesRes, overridesRes, assetsRes, goalsRes, openingsRes]) {
    if (r.error) throw r.error
  }

  return {
    settings: (settingsRes.data ?? { currency: 'CZK', locale: 'en', theme: 'dark' }) as Settings,
    categories: (categoriesRes.data ?? []) as Category[],
    transactions: (transactionsRes.data ?? []) as Transaction[],
    recurringRules: (rulesRes.data ?? []) as RecurringRule[],
    overrides: (overridesRes.data ?? []) as RecurringOverride[],
    assets: (assetsRes.data ?? []) as Asset[],
    goals: (goalsRes.data ?? []) as MonthlyGoal[],
    openings: (openingsRes.data ?? []) as MonthlyOpening[],
  }
}

function fmtAmount(amount: number, currency: string): string {
  return `${amount >= 0 ? '+' : ''}${amount.toFixed(2)} ${currency}`
}

function monthLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
}

function groupByMonth(txs: Transaction[]): Map<string, Transaction[]> {
  const map = new Map<string, Transaction[]>()
  for (const tx of txs) {
    const key = tx.occurred_on.slice(0, 7) // YYYY-MM
    const arr = map.get(key) ?? []
    arr.push(tx)
    map.set(key, arr)
  }
  return map
}

function computeOpeningForMonth(
  monthIso: string,
  openings: MonthlyOpening[],
  transactions: Transaction[],
  rules: RecurringRule[],
  overrides: RecurringOverride[],
): number | null {
  // Find best anchor
  const sorted = [...openings].sort((a, b) => a.month.localeCompare(b.month))
  const anchor = sorted.filter((o) => o.month <= monthIso).pop()
  if (!anchor) return null
  if (anchor.month === monthIso) return anchor.opening_balance

  const rangeFrom = new Date(anchor.month + 'T00:00:00')
  const rangeTo = new Date(monthIso + 'T00:00:00')
  rangeTo.setDate(rangeTo.getDate() - 1)

  const txSum = transactions
    .filter((t) => t.occurred_on >= anchor.month && t.occurred_on < monthIso)
    .reduce((s, t) => s + t.amount, 0)

  const realised = new Set(
    transactions
      .filter((t) => t.recurring_rule_id && t.occurred_on >= anchor.month && t.occurred_on < monthIso)
      .map((t) => `${t.recurring_rule_id}|${t.occurred_on}`),
  )

  let pendingSum = 0
  for (const r of rules) {
    for (const d of expandRuleInRange(r, rangeFrom, rangeTo)) {
      if (realised.has(`${r.id}|${d}`)) continue
      const eff = effectiveOccurrenceAmount(r, d, overrides)
      if (eff == null) continue
      pendingSum += eff
    }
  }

  return anchor.opening_balance + txSum + pendingSum
}

export function buildLlmMarkdown(data: ExportData): string {
  const { settings, categories, transactions, recurringRules, overrides, assets, goals, openings } = data
  const currency = settings.currency ?? 'CZK'
  const today = isoDate(new Date())
  const currentMonth = today.slice(0, 7)
  const catMap = new Map(categories.map((c) => [c.id, c]))

  const lines: string[] = []
  const push = (...ls: string[]) => lines.push(...ls)

  // ─── Header ───
  push(`# Personal Budget Export`)
  push(``)
  push(`> Generated on ${today} for LLM analysis. Currency: **${currency}**.`)
  push(``)

  // ─── Current Month Snapshot ───
  const currentMonthTxs = transactions.filter((t) => t.occurred_on.startsWith(currentMonth))
  const opening = computeOpeningForMonth(currentMonth + '-01', openings, transactions, recurringRules, overrides)
  const currentGoal = goals.find((g) => g.year_month === currentMonth + '-01')

  push(`## Current Month: ${monthLabel(currentMonth + '-01')}`)
  push(``)
  if (opening != null) push(`- **Opening balance:** ${fmtAmount(opening, currency)}`)
  if (currentGoal) push(`- **Monthly goal (target end balance):** ${currentGoal.amount.toFixed(2)} ${currency}`)

  const income = currentMonthTxs.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  const expenses = currentMonthTxs.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0)
  const net = income + expenses
  push(`- **Income this month (realised):** ${fmtAmount(income, currency)}`)
  push(`- **Expenses this month (realised):** ${expenses.toFixed(2)} ${currency}`)
  push(`- **Net this month (realised):** ${fmtAmount(net, currency)}`)
  if (opening != null) push(`- **Current balance (opening + net):** ${(opening + net).toFixed(2)} ${currency}`)

  // Upcoming recurring this month
  const todayDate = new Date(today + 'T00:00:00')
  const monthEnd = new Date(Number(currentMonth.slice(0, 4)), Number(currentMonth.slice(5, 7)), 0)
  const upcoming: { name: string; amount: number; date: string }[] = []
  for (const rule of recurringRules) {
    if (!rule.active) continue
    const occurrences = expandRuleInRange(rule, todayDate, monthEnd)
    for (const d of occurrences) {
      // Skip if already realised
      const alreadyTx = currentMonthTxs.some(
        (t) => t.recurring_rule_id === rule.id && t.occurred_on === d,
      )
      if (alreadyTx) continue
      const eff = effectiveOccurrenceAmount(rule, d, overrides)
      if (eff == null) continue
      upcoming.push({ name: rule.name, amount: eff, date: d })
    }
  }
  if (upcoming.length > 0) {
    push(``)
    push(`### Upcoming recurring (rest of month)`)
    push(`| Date | Name | Amount |`)
    push(`|------|------|--------|`)
    for (const u of upcoming.sort((a, b) => a.date.localeCompare(b.date))) {
      push(`| ${u.date} | ${u.name} | ${fmtAmount(u.amount, currency)} |`)
    }
    const projNet = upcoming.reduce((s, u) => s + u.amount, 0)
    push(`| | **Total upcoming** | **${fmtAmount(projNet, currency)}** |`)
    if (opening != null) {
      const projEnd = opening + net + projNet
      push(``)
      push(`**Projected end-of-month balance:** ${projEnd.toFixed(2)} ${currency}`)
      if (currentGoal) {
        const diff = projEnd - currentGoal.amount
        push(`**vs goal:** ${diff >= 0 ? '✅' : '⚠️'} ${fmtAmount(diff, currency)} ${diff >= 0 ? 'surplus' : 'deficit'}`)
      }
    }
  }
  push(``)

  // ─── Recurring Rules ───
  push(`## Recurring Rules`)
  push(``)
  const activeRules = recurringRules.filter((r) => r.active)
  const incomeRules = activeRules.filter((r) => r.kind === 'income')
  const expenseRules = activeRules.filter((r) => r.kind === 'expense')

  if (incomeRules.length > 0) {
    push(`### Income`)
    push(`| Name | Amount | Frequency | Category | Notes |`)
    push(`|------|--------|-----------|----------|-------|`)
    for (const r of incomeRules) {
      const cat = r.category_id ? catMap.get(r.category_id)?.name ?? '' : ''
      const freq = describeFrequency(r)
      push(`| ${r.name} | ${fmtAmount(r.amount, currency)} | ${freq} | ${cat} | ${r.notes ?? ''} |`)
    }
    push(``)
  }
  if (expenseRules.length > 0) {
    push(`### Expenses`)
    push(`| Name | Amount | Frequency | Category | Notes |`)
    push(`|------|--------|-----------|----------|-------|`)
    for (const r of expenseRules) {
      const cat = r.category_id ? catMap.get(r.category_id)?.name ?? '' : ''
      const freq = describeFrequency(r)
      push(`| ${r.name} | ${fmtAmount(-r.amount, currency)} | ${freq} | ${cat} | ${r.notes ?? ''} |`)
    }
    const totalRecurringExpense = expenseRules.reduce((s, r) => s + r.amount, 0)
    push(``)
    push(`**Total monthly recurring expenses (approximate):** ${totalRecurringExpense.toFixed(2)} ${currency}/month`)
    push(``)
  }

  const inactiveRules = recurringRules.filter((r) => !r.active)
  if (inactiveRules.length > 0) {
    push(`### Inactive/Paused Rules`)
    push(`| Name | Kind | Amount | Notes |`)
    push(`|------|------|--------|-------|`)
    for (const r of inactiveRules) {
      push(`| ${r.name} | ${r.kind} | ${r.amount.toFixed(2)} ${currency} | ${r.notes ?? ''} |`)
    }
    push(``)
  }

  // ─── Assets ───
  if (assets.length > 0) {
    push(`## Assets`)
    push(``)
    push(`| Name | Type | Value | Included in Balance | Notes |`)
    push(`|------|------|-------|---------------------|-------|`)
    for (const a of assets) {
      push(`| ${a.name} | ${a.type} | ${a.value.toFixed(2)} ${currency} | ${a.include_in_balance ? 'Yes' : 'No'} | ${a.notes ?? ''} |`)
    }
    const totalAssets = assets.reduce((s, a) => s + a.value, 0)
    const liquidAssets = assets.filter((a) => a.include_in_balance).reduce((s, a) => s + a.value, 0)
    push(``)
    push(`**Total asset value:** ${totalAssets.toFixed(2)} ${currency}`)
    push(`**Liquid (included in balance):** ${liquidAssets.toFixed(2)} ${currency}`)
    push(``)
  }

  // ─── Monthly Goals History ───
  if (goals.length > 0) {
    push(`## Monthly Goals History`)
    push(``)
    push(`| Month | Target End Balance |`)
    push(`|-------|--------------------|`)
    for (const g of goals) {
      const label = monthLabel(g.year_month)
      push(`| ${label} | ${g.amount.toFixed(2)} ${currency} |`)
    }
    push(``)
  }

  // ─── Categories ───
  push(`## Categories`)
  push(``)
  push(`| Name | Kind | Color |`)
  push(`|------|------|-------|`)
  for (const c of categories) {
    push(`| ${c.name} | ${c.kind} | ${c.color} |`)
  }
  push(``)

  // ─── Category Spending Breakdown (current month) ───
  push(`## Spending by Category (${monthLabel(currentMonth + '-01')})`)
  push(``)
  const catSpending = new Map<string, number>()
  for (const tx of currentMonthTxs) {
    if (tx.amount >= 0) continue
    const catName = tx.category_id ? catMap.get(tx.category_id)?.name ?? 'Uncategorised' : 'Uncategorised'
    catSpending.set(catName, (catSpending.get(catName) ?? 0) + tx.amount)
  }
  if (catSpending.size > 0) {
    const sorted = [...catSpending.entries()].sort((a, b) => a[1] - b[1])
    push(`| Category | Spent |`)
    push(`|----------|-------|`)
    for (const [name, amount] of sorted) {
      push(`| ${name} | ${amount.toFixed(2)} ${currency} |`)
    }
    push(``)
  } else {
    push(`_No expenses recorded this month yet._`)
    push(``)
  }

  // ─── Transaction History (all months) ───
  push(`## Transaction History`)
  push(``)
  const grouped = groupByMonth(transactions)
  const sortedMonths = [...grouped.keys()].sort((a, b) => b.localeCompare(a))

  for (const month of sortedMonths) {
    const txs = grouped.get(month)!
    const mIncome = txs.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0)
    const mExpenses = txs.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0)

    push(`### ${monthLabel(month + '-01')} (income: ${fmtAmount(mIncome, currency)}, expenses: ${mExpenses.toFixed(2)} ${currency}, net: ${fmtAmount(mIncome + mExpenses, currency)})`)
    push(``)
    push(`| Date | Description | Category | Amount | Recurring | Shared |`)
    push(`|------|-------------|----------|--------|-----------|--------|`)
    for (const tx of txs) {
      const cat = tx.category_id ? catMap.get(tx.category_id)?.name ?? '' : ''
      const desc = tx.description ?? ''
      const rec = tx.recurring_rule_id ? '✓' : ''
      const shared = tx.is_shared ? '✓' : ''
      push(`| ${tx.occurred_on} | ${desc} | ${cat} | ${fmtAmount(tx.amount, currency)} | ${rec} | ${shared} |`)
    }
    push(``)
  }

  // ─── Overrides ───
  const activeOverrides = overrides.filter((o) => o.skipped || o.amount_override != null)
  if (activeOverrides.length > 0) {
    push(`## Active Recurring Overrides`)
    push(``)
    push(`These are one-time modifications to recurring rules (trimmed amounts or skipped occurrences):`)
    push(``)
    push(`| Rule | Date | Override Amount | Skipped |`)
    push(`|------|------|----------------|---------|`)
    for (const o of activeOverrides) {
      const rule = recurringRules.find((r) => r.id === o.recurring_rule_id)
      const ruleName = rule?.name ?? o.recurring_rule_id
      push(`| ${ruleName} | ${o.occurrence_date} | ${o.amount_override != null ? o.amount_override.toFixed(2) + ' ' + currency : '—'} | ${o.skipped ? 'Yes' : 'No'} |`)
    }
    push(``)
  }

  // ─── Context for LLM ───
  push(`---`)
  push(``)
  push(`## Context for AI Advisor`)
  push(``)
  push(`- This is a personal budget tracker.`)
  push(`- Positive amounts = income, negative amounts = expenses.`)
  push(`- "Recurring rules" are auto-generated transactions (salary, subscriptions, etc).`)
  push(`- "Monthly goal" = the target end-of-month balance the user wants to maintain.`)
  push(`- "Opening balance" = balance at the start of the month.`)
  push(`- "Planned" transactions are future entries that haven't been confirmed yet.`)
  push(`- "Shared" transactions are visible on the user's public share page.`)
  push(`- Assets with "include_in_balance = Yes" contribute to the effective balance.`)
  push(`- Overrides allow temporarily changing or skipping a single recurring occurrence.`)
  push(``)
  push(`Please analyse my financial situation and provide actionable advice.`)

  return lines.join('\n')
}

function describeFrequency(rule: RecurringRule): string {
  switch (rule.frequency) {
    case 'monthly':
      return `Monthly (day ${rule.day_of_month})`
    case 'weekly':
      return `Weekly (${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][rule.day_of_week ?? 0]})`
    case 'yearly':
      return `Yearly (${rule.month_of_year}/${rule.day_of_month})`
    case 'custom':
      return `Every ${rule.interval_days} days`
    default:
      return rule.frequency
  }
}

export async function exportForLlm(): Promise<void> {
  const data = await fetchAllData()
  const markdown = buildLlmMarkdown(data)

  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `budget-export-${isoDate(new Date())}.md`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
