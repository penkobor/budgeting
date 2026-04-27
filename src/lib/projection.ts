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
  // `today` is currently unused — past-but-unrealised recurring occurrences
  // are intentionally treated as "still going to land" to match Ledger /
  // MonthLens running balance. The parameter is kept on the signature for
  // back-compat with call sites that pass an explicit clock.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _today: Date = new Date()
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

  // 2. add unrealised recurring occurrences for the WHOLE month, not just
  //    `today → monthEnd`. Past-but-unrealised occurrences are how the rest
  //    of the app (Ledger running balance, MonthLens series, TodayLens
  //    balance) treats recurring rules: if the rule fired on day N and no
  //    matching transaction exists, we still assume it will land. Anything
  //    else creates a mismatch between the goal trigger and the displayed
  //    projected end-of-month balance.
  for (const rule of rules) {
    const dates = expandRuleInRange(rule, monthStart, monthEnd)
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
 * to absorb a goal overage. Returns:
 *   - recurring rule occurrences from today through end-of-month (with overrides applied)
 *   - one-off transactions dated > today within the month with a negative amount
 *     (i.e. future-dated expenses that are not linked to a recurring rule)
 *
 * Sorted by date ascending.
 */
export type PlannedOccurrence = {
  ruleId: string // for one-off rows this is `tx:<transactionId>`
  ruleName: string
  date: string
  amount: number // positive expense amount
  /** True for one-off transactions; false for recurring rule occurrences. */
  isOneOff?: boolean
  /** For one-off rows, the underlying transaction id. */
  transactionId?: string
}

export function listFuturePlannedExpenses(
  monthIso: string,
  rules: RecurringRule[],
  overrides: RecurringOverride[],
  transactions: Transaction[] = [],
  today: Date = new Date()
): PlannedOccurrence[] {
  const monthStart = new Date(monthIso + 'T00:00:00')
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0)
  const from = today > monthStart ? today : monthStart
  const fromIso = from.toISOString().slice(0, 10)
  const monthEndIso = monthEnd.toISOString().slice(0, 10)

  const out: PlannedOccurrence[] = []

  // 1. Recurring rule occurrences in the future window of this month.
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

  // 2. One-off transactions dated in the future window with negative amount.
  //    These are not linked to a recurring rule. Treat them as candidates too.
  for (const t of transactions) {
    if (t.recurring_rule_id) continue // handled via overrides
    if (t.occurred_on < fromIso || t.occurred_on > monthEndIso) continue
    const amt = Number(t.amount)
    if (amt >= 0) continue // income or zero
    const positive = -amt
    out.push({
      ruleId: `tx:${t.id}`,
      ruleName: t.description?.trim() || 'Planned expense',
      date: t.occurred_on,
      amount: positive,
      isOneOff: true,
      transactionId: t.id,
    })
  }

  out.sort((a, b) => a.date.localeCompare(b.date) || a.ruleName.localeCompare(b.ruleName))
  return out
}

/**
 * Even-distribution algorithm with clamping.
 *
 * Given a set of selected planned-expense occurrences and a total overage to
 * cover, return how much to subtract from each. Items that would go ≤ 0 are
 * auto-excluded; the leftover is redistributed across the remaining items.
 *
 * Returns:
 *  - `deltas`: Map<occurrenceKey, amountSubtracted>  (positive numbers, ≤ original amount)
 *  - `excluded`: keys that were auto-excluded because they couldn't absorb their share
 *  - `covered`: how much of `overage` was actually absorbed
 *  - `leftover`: overage − covered (≥ 0; should be 0 if total selected amount ≥ overage)
 */
export type PlannedOccurrenceKey = string // `${ruleId}|${date}`
export const occKey = (ruleId: string, date: string): PlannedOccurrenceKey => `${ruleId}|${date}`

export interface DistributionResult {
  deltas: Map<PlannedOccurrenceKey, number>
  excluded: Set<PlannedOccurrenceKey>
  covered: number
  leftover: number
}

export function distributeEvenly(
  items: PlannedOccurrence[],
  overage: number
): DistributionResult {
  const deltas = new Map<PlannedOccurrenceKey, number>()
  const excluded = new Set<PlannedOccurrenceKey>()
  if (overage <= 0 || items.length === 0) {
    return { deltas, excluded, covered: 0, leftover: Math.max(0, overage) }
  }

  // Round to cents.
  const cents = Math.round(overage * 100)
  let remaining = cents
  let pool = items.map((i) => ({
    key: occKey(i.ruleId, i.date),
    capCents: Math.round(i.amount * 100), // can't subtract more than the full amount
  }))

  // Iterate: split evenly across pool; any item whose share exceeds its cap
  // contributes its full cap and is removed; remaining = overage − contributions;
  // re-split across the survivors. Stops when stable or pool empty.
  while (pool.length > 0 && remaining > 0) {
    const share = Math.floor(remaining / pool.length)
    if (share === 0) break

    const overflowed: typeof pool = []
    let absorbedThisPass = 0

    for (const item of pool) {
      const take = Math.min(share, item.capCents)
      if (take >= item.capCents) {
        // exhausted — record full cap and exclude from further passes
        deltas.set(item.key, (deltas.get(item.key) ?? 0) + item.capCents)
        absorbedThisPass += item.capCents
        excluded.add(item.key)
      } else {
        deltas.set(item.key, (deltas.get(item.key) ?? 0) + take)
        absorbedThisPass += take
        item.capCents -= take
        overflowed.push(item)
      }
    }

    remaining -= absorbedThisPass
    if (overflowed.length === pool.length && absorbedThisPass === 0) break
    pool = overflowed
  }

  // Distribute the last few cents to whoever can still absorb them.
  if (remaining > 0 && pool.length > 0) {
    for (const item of pool) {
      if (remaining === 0) break
      const take = Math.min(item.capCents, remaining)
      if (take > 0) {
        deltas.set(item.key, (deltas.get(item.key) ?? 0) + take)
        remaining -= take
      }
    }
  }

  // Convert back to currency
  const out = new Map<PlannedOccurrenceKey, number>()
  let coveredCents = 0
  deltas.forEach((c, k) => {
    out.set(k, c / 100)
    coveredCents += c
  })

  return {
    deltas: out,
    excluded,
    covered: coveredCents / 100,
    leftover: Math.max(0, (cents - coveredCents) / 100),
  }
}
