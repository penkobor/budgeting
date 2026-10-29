import { expect, it } from 'vitest'
import type { RecurringOverride, RecurringRule, Transaction } from './db.types'
import { computeProjectedEndBalance, summarizeProjectionFlows } from './projection'

const rule = {
  id: 'food', active: true, amount: 100, kind: 'expense', frequency: 'custom', interval_days: 1,
  starts_on: '2026-10-01', ends_on: null,
} as RecurringRule
const tx = (date: string, amount: number, planned = false, recurring_rule_id: string | null = null) => (
  { occurred_on: date, amount, planned, recurring_rule_id } as Transaction
)

it('explains a month using actuals, plans and deduplicated recurring payments', () => {
  const transactions = [tx('2026-10-01', 1000), tx('2026-10-02', -80, false, rule.id), tx('2026-10-20', -200, true)]
  const overrides = [
    { id: 'skip', user_id: 'u', created_at: '', recurring_rule_id: rule.id, occurrence_date: '2026-10-03', skipped: true, amount_override: null },
    { id: 'trim', user_id: 'u', created_at: '', recurring_rule_id: rule.id, occurrence_date: '2026-10-04', amount_override: 50, skipped: false },
  ] satisfies RecurringOverride[]
  const flows = summarizeProjectionFlows('2026-10-01', '2026-10-31', transactions, [rule], overrides)
  expect(flows).toEqual({ actualNet: 920, plannedNet: -200, recurringNet: -2850 })
  expect(5000 + flows.actualNet + flows.plannedNet + flows.recurringNet + 300).toBe(
    computeProjectedEndBalance('2026-10-01', 5000, transactions, [rule], overrides, new Date(2026, 9, 29), 300),
  )
})

it('includes the terminal day once and excludes transactions outside the displayed range', () => {
  const transactions = [
    tx('2026-09-30', 999), tx('2026-11-01', -75, true, rule.id), tx('2026-11-02', 888),
  ]
  const flows = summarizeProjectionFlows('2026-10-01', '2026-11-01', transactions, [rule], [])
  expect(flows).toEqual({ actualNet: 0, plannedNet: -75, recurringNet: -3100 })
})
