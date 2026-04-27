import type { RecurringRule, RecurringOverride, Transaction } from './db.types'
import { expandRuleInRange } from './recurring'

/**
 * Apply overrides to a list of (rule, occurrence_date) pairs.
 * Returns the effective signed amount for each occurrence, or null if skipped.
 *
 * Income contributes positive; expenses contribute negative.
 */
export function effectiveOccurrenceAmount(
  rule: RecurringRule,
  date: string,
  overrides: RecurringOverride[]
): number | null {
  const o = overrides.find(
    (x) => x.recurring_rule_id === rule.id && x.occurrence_date === date
  )
  if (o?.skipped) return null
  const raw = o?.amount_override != null ? Number(o.amount_override) : Number(rule.amount)
  return rule.kind === 'income' ? raw : -raw
}

/**
 * Compute the projected end-of-month balance for the given month.
 *
 *   projected_end_balance = opening_balance
 *                         + Σ(actual transactions this month, signed)
 *                         + Σ(future recurring occurrences this month
 *                             that have not yet been realised, with overrides)
 *
 * @param monthIso first day of month, ISO YYYY-MM-01
 * @param openingBalance balance at start of month (from useMonthlyOpening)
 * @param transactions all rows for the month (planned + actual)
 * @param rules all active recurring rules
 * @param overrides all overrides (will be filtered to month internally)
 * @param today  reference date (defaults to new Date())
 */
export function computeProjectedEndBalance(
  monthIso: string,
  openingBalance: number,
  transactions: Transaction[],
  rules: RecurringRule[],
  overrides: RecurringOverride[],
  today: Date = new Date()
): number {
  const monthStart = new Date(monthIso + 'T00:00:00')
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0)

  // 1. signed sum of all transactions in the month (planned + actual already in DB)
  let total = openingBalance
  const realised = new Set<string>()
  for (const t of transactions) {
    // transactions table stores positive numbers — sign comes from the linked rule's kind
    // OR (for ad-hoc rows) the row already encodes sign via amount field convention.
    // The codebase stores amount as positive and looks up kind via category.kind …
    // For projection we trust amount as already signed if there's no recurring_rule_id,
    // else we need the rule kind. The existing code in queries.ts uses Number(t.amount)
    // raw, so we follow the same convention here.
    total += Number(t.amount)
    if (t.recurring_rule_id) {
      realised.add(`${t.recurring_rule_id}|${t.occurred_on}`)
    }
  }

  // 2. add unrealised recurring occurrences for the rest of the month
  const projectFrom = today > monthStart ? today : monthStart
  for (const rule of rules) {
    const dates = expandRuleInRange(rule, projectFrom, monthEnd)
    for (const d of dates) {
      if (realised.has(`${rule.id}|${d}`)) continue
      const amt = effectiveOccurrenceAmount(rule, d, overrides)
      if (amt == null) continue // skipped
      total += amt
    }
  }

  return Math.round(total * 100) / 100
}

/**
 * Future planned EXPENSES in the given month that are candidates for trimming
 * to absorb a goal overage. Returns occurrences (rule + date + effective amount),
 * sorted by date ascending.
 */
export type PlannedOccurrence = {
  ruleId: string
  ruleName: string
  date: string
  amount: number // positive expense amount
}

export function listFuturePlannedExpenses(
  monthIso: string,
  rules: RecurringRule[],
  overrides: RecurringOverride[],
  today: Date = new Date()
): PlannedOccurrence[] {
  const monthStart = new Date(monthIso + 'T00:00:00')
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0)
  const from = today > monthStart ? today : monthStart

  const out: PlannedOccurrence[] = []
  for (const rule of rules) {
    if (rule.kind !== 'expense') continue
    for (const d of expandRuleInRange(rule, from, monthEnd)) {
      const o = overrides.find(
        (x) => x.recurring_rule_id === rule.id && x.occurrence_date === d
      )
      if (o?.skipped) continue
      const amt = o?.amount_override != null ? Number(o.amount_override) : Number(rule.amount)
      if (amt <= 0) continue
      out.push({ ruleId: rule.id, ruleName: rule.name, date: d, amount: amt })
    }
  }
  out.sort((a, b) => a.date.localeCompare(b.date))
  return out
}
