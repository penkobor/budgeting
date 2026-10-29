import { expect, it } from 'vitest'
import type { RecurringRule } from './db.types'
import { expandRuleInRange } from './recurring'
import { computeProjectedEndBalance } from './projection'

const old = { id: 'old', active: true, amount: 600, kind: 'expense', frequency: 'monthly',
  day_of_month: 15, starts_on: '2026-01-01', ends_on: '2026-10-31' } as RecurringRule

it('keeps the old price in October and applies only the new price from November', () => {
  const next = { ...old, id: 'new', amount: 750, starts_on: '2026-11-01', ends_on: null }
  const rules = [old, next]
  expect(computeProjectedEndBalance('2026-10-01', 20000, [], rules, [])).toBe(19400)
  expect(computeProjectedEndBalance('2026-11-01', 19400, [], rules, [])).toBe(18650)
})

it('stops future occurrences while keeping a payment on the end date itself', () => {
  const rule = { ...old, day_of_month: 31 }
  expect(expandRuleInRange(rule, new Date(2026, 9, 1), new Date(2026, 10, 30))).toEqual(['2026-10-31'])
  expect(computeProjectedEndBalance('2026-11-01', 19400, [], [rule], [])).toBe(19400)
})
