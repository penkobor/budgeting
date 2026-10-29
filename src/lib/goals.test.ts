import { describe, expect, it } from 'vitest'
import { goalMonths, monthKey, yearMonthKey } from './utils'

describe('monthly goal dates', () => {
  it('uses the same goal key across the dashboard, distinct from an opening date', () => {
    const date = new Date(2026, 9, 29)
    expect(yearMonthKey(date)).toBe('2026-10')
    expect(monthKey(date)).toBe('2026-10-01')
  })

  it('includes both ends and handles a year boundary', () => {
    expect(goalMonths('2026-10', '2027-01')).toEqual(['2026-10', '2026-11', '2026-12', '2027-01'])
    expect(goalMonths('2026-10', '2026-10')).toEqual(['2026-10'])
    expect(goalMonths('2026-10', '2027-09')).toHaveLength(12)
  })

  it.each([
    ['2026-10', '2026-09'], ['2026-10', '2027-10'],
    ['2026-10', ''], ['2026-10-01', '2026-10'], ['2026-10', '2026-13'],
  ])('rejects invalid or unbounded edits: %s to %s', (from, through) => {
    expect(goalMonths(from, through)).toEqual([])
  })
})
