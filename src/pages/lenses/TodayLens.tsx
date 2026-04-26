import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { ArrowDownRight, ArrowUpRight, Wallet, TrendingDown } from 'lucide-react'
import {
  useCategories, useMonthlyOpening, useRecurringRules, useSettings, useTransactionsInRange,
} from '@/hooks/queries'
import { formatMoney, isoDate, monthKey, daysInMonth } from '@/lib/utils'
import { expandRuleInRange } from '@/lib/recurring'

/**
 * "Left to spend today" lens.
 * Pulls from the monthly ledger: planned today (transactions flagged planned + un-realized recurring),
 * minus what's actually been recorded today (non-planned transactions).
 */
export function TodayLens() {
  const today = useMemo(() => new Date(), [])
  const todayIso = isoDate(today)
  const monthIso = monthKey(today)
  const lastDay = daysInMonth(today.getFullYear(), today.getMonth())
  const toIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const { data: settings } = useSettings()
  const { data: opening } = useMonthlyOpening(monthIso)
  const { data: txs = [] } = useTransactionsInRange(monthIso, toIso)
  const { data: rules = [] } = useRecurringRules()
  const { data: categories = [] } = useCategories()
  const currency = settings?.currency ?? 'CZK'
  const catMap = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories])

  // Recurring instances for today only
  const todayRuleHits = useMemo(() => {
    const out: Array<{ rule_id: string; amount: number; description: string; categoryId: string | null }> = []
    const d = new Date(todayIso + 'T00:00:00')
    for (const r of rules) {
      const dates = expandRuleInRange(r, d, d)
      for (const _ of dates) {
        out.push({
          rule_id: r.id,
          amount: r.kind === 'income' ? r.amount : -r.amount,
          description: r.name,
          categoryId: r.category_id,
        })
      }
    }
    // exclude already realised
    const realisedKeys = new Set(txs.filter((t) => t.recurring_rule_id && t.occurred_on === todayIso).map((t) => t.recurring_rule_id))
    return out.filter((i) => !realisedKeys.has(i.rule_id))
  }, [rules, txs, todayIso])

  // Today's transactions
  const todayTxs = useMemo(() => txs.filter((t) => t.occurred_on === todayIso), [txs, todayIso])

  // Planned expense today = sum of negative planned amounts in today's txs + negative recurring instances for today
  const plannedExpense = useMemo(() => {
    let sum = 0
    for (const t of todayTxs) if (Number(t.amount) < 0) sum += Math.abs(Number(t.amount))
    for (const i of todayRuleHits) if (i.amount < 0) sum += Math.abs(i.amount)
    return sum
  }, [todayTxs, todayRuleHits])

  // Actual (already-recorded) expense today = negative non-planned amounts
  const actualExpense = useMemo(() => {
    let sum = 0
    for (const t of todayTxs) if (Number(t.amount) < 0 && !t.planned) sum += Math.abs(Number(t.amount))
    return sum
  }, [todayTxs])

  // Headline figure: how much of today's plan is still available to spend
  const leftToSpend = Math.max(0, plannedExpense - actualExpense)

  // "On pace" — current actual vs running forecast through today
  const balance = useMemo(() => {
    const opening0 = opening?.opening_balance ?? 0
    let actual = opening0
    let forecast = opening0
    const cutoffDay = today.getDate()
    for (let day = 1; day <= cutoffDay; day++) {
      const dIso = `${monthIso.slice(0, 8)}${String(day).padStart(2, '0')}`
      for (const t of txs) {
        if (t.occurred_on === dIso) {
          forecast += Number(t.amount)
          if (!t.planned) actual += Number(t.amount)
        }
      }
    }
    return { actual, forecast }
  }, [txs, opening, monthIso, today])

  // Today's planned items (transactions + recurring) — for the list
  const items = useMemo(() => {
    const out = [
      ...todayTxs.map((t) => ({
        key: `tx-${t.id}`,
        amount: Number(t.amount),
        description: t.description?.trim() || (t.category_id ? catMap[t.category_id]?.name : null) || 'Untitled',
        planned: t.planned,
      })),
      ...todayRuleHits.map((i) => ({
        key: `rule-${i.rule_id}`,
        amount: i.amount,
        description: i.description,
        planned: true,
      })),
    ]
    return out.sort((a, b) => a.amount - b.amount)
  }, [todayTxs, todayRuleHits, catMap])

  const todayLabel = today.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="space-y-4 md:space-y-6">
      <header>
        <div className="label">Today</div>
        <h1 className="text-2xl md:text-3xl font-semibold mt-0.5">{todayLabel}</h1>
      </header>

      {/* Hero "Left to spend today" */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="card p-5 md:p-7"
      >
        <div className="label mb-1">Left to spend today</div>
        <div className={`stat-num font-semibold text-4xl md:text-5xl ${leftToSpend === 0 ? 'text-fg-muted' : 'text-fg'}`}>
          {formatMoney(leftToSpend, currency)}
        </div>
        <div className="text-xs md:text-sm text-fg-subtle mt-2 stat-num">
          {plannedExpense === 0 ? (
            'Nothing planned today.'
          ) : (
            <>
              Plan {formatMoney(plannedExpense, currency)} · spent {formatMoney(actualExpense, currency)}
            </>
          )}
        </div>
      </motion.section>

      {/* Mini KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <Mini label="Current balance" value={formatMoney(balance.actual, currency)} icon={<Wallet className="w-4 h-4" />} />
        <Mini
          label="Drift vs plan"
          value={`${balance.actual - balance.forecast >= 0 ? '+' : ''}${formatMoney(balance.actual - balance.forecast, currency)}`}
          tone={balance.actual >= balance.forecast ? 'positive' : 'negative'}
          icon={<TrendingDown className="w-4 h-4" />}
        />
        <Mini label="Income today" value={formatMoney(todayTxs.filter((t) => Number(t.amount) > 0 && !t.planned).reduce((a, t) => a + Number(t.amount), 0), currency)} tone="positive" />
        <Mini label="Spent today" value={formatMoney(actualExpense, currency)} tone={actualExpense > 0 ? 'negative' : 'default'} />
      </div>

      {/* What's planned */}
      <section className="card p-4 md:p-5">
        <div className="label mb-2">What's on for today</div>
        <h2 className="font-semibold mb-3">{items.length === 0 ? 'Nothing planned' : `${items.length} ${items.length === 1 ? 'item' : 'items'}`}</h2>
        {items.length > 0 && (
          <div className="divide-y divide-border">
            {items.map((i) => (
              <div key={i.key} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0 flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg grid place-items-center ${i.amount >= 0 ? 'bg-positive/10 text-positive' : 'bg-negative/10 text-negative'}`}>
                    {i.amount >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{i.description}</div>
                    <div className="text-xs text-fg-subtle">
                      {i.planned ? 'Planned' : 'Recorded'}
                    </div>
                  </div>
                </div>
                <div className={`stat-num text-sm ${i.amount >= 0 ? 'text-positive' : 'text-negative'}`}>
                  {formatMoney(i.amount, currency)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function Mini({ label, value, sub, tone = 'default', icon }: {
  label: string; value: string; sub?: string;
  tone?: 'default' | 'positive' | 'negative'; icon?: React.ReactNode
}) {
  const toneClass = tone === 'positive' ? 'text-positive' : tone === 'negative' ? 'text-negative' : 'text-fg'
  return (
    <div className="card p-3 md:p-4">
      <div className="flex items-center justify-between">
        <div className="label">{label}</div>
        {icon && <span className={toneClass}>{icon}</span>}
      </div>
      <div className={`mt-1.5 md:mt-2 text-lg md:text-xl font-semibold stat-num ${toneClass}`}>{value}</div>
      {sub && <div className="text-[11px] md:text-xs text-fg-subtle mt-1">{sub}</div>}
    </div>
  )
}
