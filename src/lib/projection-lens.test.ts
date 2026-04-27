/**
 * Integration test mirroring exactly what Ledger / TodayLens / WeekLens do
 * to verify that an override is applied to a rule occurrence.
 */
import { describe, expect, it } from 'vitest'
import { effectiveOccurrenceAmount, findOverride } from './projection'
import { expandRuleInRange } from './recurring'
import type { RecurringRule, RecurringOverride } from './db.types'

const routineryRule = {
  id: '67b341ac-6031-425d-9d0f-96d14b167d5d',
  user_id: 'u',
  name: 'Routinery',
  amount: 109,
  kind: 'expense',
  frequency: 'monthly',
  day_of_month: 28,
  day_of_week: null,
  month_of_year: null,
  interval_days: null,
  category_id: null,
  starts_on: '2026-01-01',
  ends_on: null,
  notes: null,
  active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
} as unknown as RecurringRule

const routineryOverride = {
  id: '43957f39-ad44-4b79-be04-876f2b10e6cb',
  user_id: 'u',
  recurring_rule_id: '67b341ac-6031-425d-9d0f-96d14b167d5d',
  occurrence_date: '2026-04-28',
  // Supabase returns numeric(14,2) as string. Mirror that here.
  amount_override: '107.00',
  skipped: false,
  created_at: '2026-04-27T12:12:36.424842+00:00',
} as unknown as RecurringOverride

describe('lens integration: override applies to recurring occurrence', () => {
  it('expandRuleInRange yields 2026-04-28 for monthly day-28 rule in April 2026', () => {
    const from = new Date('2026-04-01T00:00:00')
    const to = new Date('2026-04-30T00:00:00')
    const dates = expandRuleInRange(routineryRule, from, to)
    expect(dates).toContain('2026-04-28')
  })

  it('findOverride matches by rule id + ISO date', () => {
    const o = findOverride(routineryRule.id, '2026-04-28', [routineryOverride])
    expect(o).toBeDefined()
    expect(o?.amount_override).toBe('107.00')
  })

  it('effectiveOccurrenceAmount returns overridden amount even when amount_override is a string', () => {
    const eff = effectiveOccurrenceAmount(routineryRule, '2026-04-28', [routineryOverride])
    // expense → negative; 107 (not 109)
    expect(eff).toBe(-107)
  })

  it('replicates Ledger pendingByDay logic end-to-end', () => {
    const overrides = [routineryOverride]
    const have = new Set<string>() // no realised tx
    const f = new Date('2026-04-01T00:00:00')
    const t = new Date('2026-04-30T00:00:00')
    const map: Record<number, { amount: number; originalAmount: number; overridden: boolean }[]> = {}
    for (const r of [routineryRule]) {
      for (const d of expandRuleInRange(r, f, t)) {
        if (have.has(`${r.id}|${d}`)) continue
        const eff = effectiveOccurrenceAmount(r, d, overrides)
        if (eff == null) continue
        const original = r.kind === 'income' ? r.amount : -r.amount
        const day = parseInt(d.slice(8, 10), 10)
        ;(map[day] ??= []).push({
          amount: eff,
          originalAmount: original,
          overridden: Math.abs(eff - original) > 0.005,
        })
      }
    }
    expect(map[28]).toHaveLength(1)
    expect(map[28][0].amount).toBe(-107)
    expect(map[28][0].originalAmount).toBe(-109)
    expect(map[28][0].overridden).toBe(true)
  })
})
