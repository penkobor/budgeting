import type { RecurringRule } from './db.types'
import { isoDate } from './utils'

/**
 * Expand a recurring rule into ISO dates that fall within [from, to] (inclusive).
 * Supports: monthly (day_of_month), weekly (day_of_week), yearly (month_of_year + day_of_month),
 * custom (every interval_days from starts_on).
 */
export function expandRuleInRange(rule: RecurringRule, from: Date, to: Date): string[] {
  if (!rule.active) return []
  const start = new Date(rule.starts_on + 'T00:00:00')
  const end = rule.ends_on ? new Date(rule.ends_on + 'T00:00:00') : null

  const lo = new Date(Math.max(from.getTime(), start.getTime()))
  const hi = end ? new Date(Math.min(to.getTime(), end.getTime())) : to
  if (lo > hi) return []

  const out: string[] = []

  if (rule.frequency === 'monthly' && rule.day_of_month) {
    const cursor = new Date(lo.getFullYear(), lo.getMonth(), 1)
    while (cursor <= hi) {
      const dim = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
      const day = Math.min(rule.day_of_month, dim)
      const occ = new Date(cursor.getFullYear(), cursor.getMonth(), day)
      if (occ >= lo && occ <= hi && occ >= start) out.push(isoDate(occ))
      cursor.setMonth(cursor.getMonth() + 1)
    }
  } else if (rule.frequency === 'weekly' && rule.day_of_week !== null && rule.day_of_week !== undefined) {
    const cursor = new Date(lo)
    while (cursor.getDay() !== rule.day_of_week) cursor.setDate(cursor.getDate() + 1)
    while (cursor <= hi) {
      if (cursor >= start) out.push(isoDate(cursor))
      cursor.setDate(cursor.getDate() + 7)
    }
  } else if (rule.frequency === 'yearly' && rule.month_of_year && rule.day_of_month) {
    for (let y = lo.getFullYear(); y <= hi.getFullYear(); y++) {
      const dim = new Date(y, rule.month_of_year, 0).getDate()
      const day = Math.min(rule.day_of_month, dim)
      const occ = new Date(y, rule.month_of_year - 1, day)
      if (occ >= lo && occ <= hi && occ >= start) out.push(isoDate(occ))
    }
  } else if (rule.frequency === 'custom' && rule.interval_days) {
    const cursor = new Date(start)
    while (cursor < lo) cursor.setDate(cursor.getDate() + rule.interval_days)
    while (cursor <= hi) {
      out.push(isoDate(cursor))
      cursor.setDate(cursor.getDate() + rule.interval_days)
    }
  }

  return out
}

export function describeRule(rule: RecurringRule): string {
  switch (rule.frequency) {
    case 'monthly':
      return `Monthly · day ${rule.day_of_month}`
    case 'weekly':
      return `Weekly · ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][rule.day_of_week ?? 0]}`
    case 'yearly':
      return `Yearly · ${rule.month_of_year}/${rule.day_of_month}`
    case 'custom':
      return `Every ${rule.interval_days} days`
    default:
      return rule.frequency
  }
}
