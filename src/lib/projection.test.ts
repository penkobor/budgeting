import { describe, expect, it } from 'vitest'
import { distributeEvenly, type PlannedOccurrence } from './projection'

function occ(ruleId: string, date: string, amount: number): PlannedOccurrence {
  return { ruleId, ruleName: ruleId, date, amount }
}

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
    // 10 cents across 3 items should land at 0.04, 0.03, 0.03 (or any
    // permutation summing to 0.10). The total covered must be exact.
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
