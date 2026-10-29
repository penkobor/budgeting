import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatMoney(value: number, currency = 'CZK', locale = 'en-US') {
  const sign = value < 0 ? '-' : ''
  const abs = Math.abs(value)
  const maximumFractionDigits = abs % 1 === 0 ? 0 : 2
  // Compact pretty: no decimals if integer.
  // Guard against invalid ISO-4217 codes (e.g. user typed "Kč" instead of
  // "CZK") — Intl.NumberFormat throws RangeError which would crash the app.
  try {
    const fmt = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits,
      minimumFractionDigits: 0,
    })
    return sign + fmt.format(abs).replace('-', '')
  } catch {
    const fmt = new Intl.NumberFormat(locale, {
      maximumFractionDigits,
      minimumFractionDigits: 0,
    })
    return `${sign}${fmt.format(abs)} ${currency}`
  }
}

export function formatNumber(value: number, locale = 'en-US') {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)
}

export function isoDate(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function monthKey(d: Date) {
  return `${yearMonthKey(d)}-01`
}

/** Monthly goals use YYYY-MM; openings and date ranges use YYYY-MM-01. */
export function yearMonthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Inclusive, bounded range for one atomic monthly-goal update. */
export function goalMonths(from: string, through: string): string[] {
  if (![from, through].every((m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m))) return []
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = through.split('-').map(Number)
  const count = (ty - fy) * 12 + tm - fm + 1
  if (count < 1 || count > 12) return []
  return Array.from({ length: count }, (_, i) => {
    const month = fm - 1 + i
    return `${fy + Math.floor(month / 12)}-${String(month % 12 + 1).padStart(2, '0')}`
  })
}

export function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}
