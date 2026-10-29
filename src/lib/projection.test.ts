import { describe, expect, it } from 'vitest'
import {
  computeProjectedEndBalance,
  dailyTotals,
  distributeEvenly,
  type PlannedOccurrence,
} from './projection'
import type { RecurringRule } from './db.types'

function occ(ruleId: string, date: string, amount: number): PlannedOccurrence {
  return { ruleId, ruleName: ruleId, date, amount }
}

function rule(partial: Partial<RecurringRule> & Pick<RecurringRule, 'id' | 'name' | 'amount' | 'kind' | 'frequency'>): RecurringRule {
  return {
    user_id: 'u',
    starts_on: '2026-01-01',
    active: true,
    day_of_month: null,
    day_of_week: null,
    month_of_year: null,
    interval_days: null,
    category_id: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...partial,
  } as RecurringRule
}

describe('computeProjectedEndBalance', () => {
  it('counts past-but-unrealised recurring occurrences (no time-based skip)', () => {
    // Today is 2026-04-27. Rent rule fires every 1st of the month, 25k.
    // No transaction exists for 2026-04-01. The projection MUST still
    // include that 25k so it matches the running balance shown in
    // Ledger / TodayLens / MonthLens (which all include past unrealised
    // recurring).
    const rentRule = rule({
      id: 'rent',
      name: 'Rent',
      amount: 25000,
      kind: 'expense',
      frequency: 'monthly',
      day_of_month: 1,
    })
    const today = new Date('2026-04-27T12:00:00Z')
    const projected = computeProjectedEndBalance(
      '2026-04-01',
      100000, // opening balance
      [], // no transactions yet
      [rentRule],
      [],
      today,
    )
    // 100k opening - 25k rent = 75k projected end
    expect(projected).toBe(75000)
  })

  it('skips occurrences that have a matching realised transaction', () => {
    const rentRule = rule({
      id: 'rent',
      name: 'Rent',
      amount: 25000,
      kind: 'expense',
      frequency: 'monthly',
      day_of_month: 1,
    })
    const today = new Date('2026-04-27T12:00:00Z')
    const projected = computeProjectedEndBalance(
      '2026-04-01',
      100000,
      [
        {
          id: 't1',
          user_id: 'u',
          occurred_on: '2026-04-01',
          amount: -25000,
          recurring_rule_id: 'rent',
          description: null,
          category_id: null,
          planned: true,
          confirmed_at: null,
          created_at: '2026-04-01T00:00:00Z',
          updated_at: '2026-04-01T00:00:00Z',
        } as never,
      ],
      [rentRule],
      [],
      today,
    )
    expect(projected).toBe(75000)
  })

  it('honours skip overrides (skipped: true)', () => {
    const rentRule = rule({
      id: 'rent',
      name: 'Rent',
      amount: 25000,
      kind: 'expense',
      frequency: 'monthly',
      day_of_month: 1,
    })
    const today = new Date('2026-04-27T12:00:00Z')
    const projected = computeProjectedEndBalance(
      '2026-04-01',
      100000,
      [],
      [rentRule],
      [
        {
          id: 'o1',
          user_id: 'u',
          recurring_rule_id: 'rent',
          occurrence_date: '2026-04-01',
          amount_override: null,
          skipped: true,
          created_at: '2026-04-01T00:00:00Z',
        } as never,
      ],
      today,
    )
    // Rent skipped via override → projected stays at 100k
    expect(projected).toBe(100000)
  })

  it('honours amount overrides (amount_override < rule.amount)', () => {
    const rentRule = rule({
      id: 'rent',
      name: 'Rent',
      amount: 25000,
      kind: 'expense',
      frequency: 'monthly',
      day_of_month: 1,
    })
    const today = new Date('2026-04-27T12:00:00Z')
    const projected = computeProjectedEndBalance(
      '2026-04-01',
      100000,
      [],
      [rentRule],
      [
        {
          id: 'o1',
          user_id: 'u',
          recurring_rule_id: 'rent',
          occurrence_date: '2026-04-01',
          amount_override: 20000,
          skipped: false,
          created_at: '2026-04-01T00:00:00Z',
        } as never,
      ],
      today,
    )
    // 100k opening - 20k (overridden rent) = 80k
    expect(projected).toBe(80000)
  })
})

describe('distributeEvenly', () => {
  it('returns zero deltas when overage is 0', () => {
    const items = [occ('a', '2026-05-01', 100)]
    const r = distributeEvenly(items, 0)
    expect(r.covered).toBe(0)
    expect(r.leftover).toBe(0)
    expect(r.deltas.size).toBe(0)
    expect(r.excluded.size).toBe(0)
  })

  it('returns leftover when there are no items', () => {
    const r = distributeEvenly([], 50)
    expect(r.covered).toBe(0)
    expect(r.leftover).toBe(50)
  })

  it('splits the overage evenly across two same-sized items', () => {
    const items = [occ('a', '2026-05-01', 100), occ('b', '2026-05-02', 100)]
    const r = distributeEvenly(items, 40)
    expect(r.covered).toBe(40)
    expect(r.leftover).toBe(0)
    expect(r.deltas.get('a|2026-05-01')).toBe(20)
    expect(r.deltas.get('b|2026-05-02')).toBe(20)
    expect(r.excluded.size).toBe(0)
  })

  it('caps a small item at its full amount and pushes the rest onto larger items', () => {
    const items = [occ('a', '2026-05-01', 5), occ('b', '2026-05-02', 100)]
    const r = distributeEvenly(items, 30)
    expect(r.covered).toBe(30)
    expect(r.deltas.get('a|2026-05-01')).toBe(5)
    expect(r.deltas.get('b|2026-05-02')).toBe(25)
    expect(r.excluded.has('a|2026-05-01')).toBe(true)
  })

  it('reports leftover when total available is less than the overage', () => {
    const items = [occ('a', '2026-05-01', 10), occ('b', '2026-05-02', 15)]
    const r = distributeEvenly(items, 100)
    expect(r.covered).toBe(25)
    expect(r.leftover).toBeCloseTo(75, 5)
    expect(r.excluded.size).toBe(2)
  })

  it('handles cent rounding without losing or creating money', () => {
    const items = [
      occ('a', '2026-05-01', 1),
      occ('b', '2026-05-02', 1),
      occ('c', '2026-05-03', 1),
    ]
    const r = distributeEvenly(items, 0.1)
    expect(r.covered).toBeCloseTo(0.1, 5)
    expect(r.leftover).toBe(0)
    let sum = 0
    for (const v of r.deltas.values()) sum += v
    expect(sum).toBeCloseTo(0.1, 5)
  })

  it('never assigns a delta greater than the item amount', () => {
    const items = [
      occ('a', '2026-05-01', 5),
      occ('b', '2026-05-02', 7),
      occ('c', '2026-05-03', 9),
    ]
    const r = distributeEvenly(items, 50)
    for (const item of items) {
      const d = r.deltas.get(`${item.ruleId}|${item.date}`) ?? 0
      expect(d).toBeLessThanOrEqual(item.amount + 1e-9)
    }
  })
})


describe('dailyTotals', () => {
  it('builds running balances from transactions and unrealised recurring occurrences', () => {
    const rent = rule({ id: 'rent', name: 'Rent', amount: 1000, kind: 'expense', frequency: 'monthly', day_of_month: 2 })
    const salary = rule({ id: 'salary', name: 'Salary', amount: 5000, kind: 'income', frequency: 'monthly', day_of_month: 3 })
    const txs = [
      { id: 'a', occurred_on: '2026-04-01', amount: -200, recurring_rule_id: null },
      // Realised salary — the rule occurrence on the 3rd must not count twice.
      { id: 'b', occurred_on: '2026-04-03', amount: 4800, recurring_rule_id: 'salary' },
      { id: 'c', occurred_on: '2026-05-01', amount: -999, recurring_rule_id: null },
    ] as never

    const days = dailyTotals('2026-04-01', 10_000, txs, [rent, salary], [])

    expect(days).toHaveLength(30)
    expect(days[0]).toEqual({ date: '2026-04-01', income: 0, expense: 200, balance: 9800 })
    expect(days[1]).toEqual({ date: '2026-04-02', income: 0, expense: 1000, balance: 8800 })
    expect(days[2]).toEqual({ date: '2026-04-03', income: 4800, expense: 0, balance: 13_600 })
    expect(days[29].balance).toBe(13_600)
  })

  it('applies overrides and drops skipped occurrences', () => {
    const gym = rule({ id: 'gym', name: 'Gym', amount: 300, kind: 'expense', frequency: 'monthly', day_of_month: 5 })
    const coffee = rule({ id: 'coffee', name: 'Coffee', amount: 50, kind: 'expense', frequency: 'monthly', day_of_month: 6 })
    const overrides = [
      { recurring_rule_id: 'gym', occurrence_date: '2026-04-05', amount_override: 100, skipped: false },
      { recurring_rule_id: 'coffee', occurrence_date: '2026-04-06', amount_override: null, skipped: true },
    ] as never

    const days = dailyTotals('2026-04-01', 0, [], [gym, coffee], overrides)

    expect(days[4].expense).toBe(100)
    expect(days[5].expense).toBe(0)
    expect(days[29].balance).toBe(-100)
  })
})
