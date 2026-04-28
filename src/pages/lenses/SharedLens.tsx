import { useMemo } from 'react'
import { Share2, Loader2 } from 'lucide-react'
import {
  useRecurringRules,
  useSettings,
  useTransactionsInRange,
} from '@/hooks/queries'
import { useShareLink, buildShareUrl } from '@/hooks/share'
import { expandRuleInRange } from '@/lib/recurring'
import { formatMoney, isoDate } from '@/lib/utils'
import type { RecurringRule, Transaction } from '@/lib/db.types'

/**
 * BUDG-022 — Shared Lens (owner-only).
 *
 * Mirrors the public `/share/:slug` page but lives inside the authenticated
 * owner app. Phase 1 is read-only — verifies the data shape matches the public
 * page exactly. Drag-and-drop redistribution lands in Phase 2.
 *
 * Visibility: this lens is rendered from Dashboard only when the user is
 * authenticated (Dashboard itself sits behind the auth Gate), so no extra
 * check is needed. A non-owner authenticated user could in theory navigate
 * here if they had the slug, but they would only see THEIR own shared
 * entries — `useTransactionsInRange` is RLS-scoped to `auth.uid()`.
 */
export function SharedLens() {
  const { data: settings } = useSettings()
  const currency = settings?.currency ?? 'CZK'
  const { data: shareLink, isLoading: shareLoading } = useShareLink()

  // Pull a wide horizon so cross-month redistribute (Phase 3) sees neighbors.
  const horizon = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const start = new Date(today.getFullYear(), today.getMonth(), 1)
    const end = new Date(today.getFullYear(), today.getMonth() + 6 + 1, 0)
    return { fromIso: isoDate(start), toIso: isoDate(end), today }
  }, [])

  const { data: txs = [], isLoading: txLoading } = useTransactionsInRange(
    horizon.fromIso,
    horizon.toIso,
  )
  const { data: rules = [], isLoading: rulesLoading } = useRecurringRules()

  const sharedTxs = useMemo(() => txs.filter((t) => t.is_shared), [txs])
  const sharedRules = useMemo(
    () => rules.filter((r) => r.is_shared && r.active),
    [rules],
  )

  const months = useMonthGrouping({
    sharedTxs,
    sharedRules,
    today: horizon.today,
    horizonEnd: new Date(horizon.toIso + 'T00:00:00'),
  })

  const totalIncome = months.reduce((s, m) => s + m.totalIncome, 0)
  const totalExpense = months.reduce((s, m) => s + m.totalExpense, 0)
  const eventCount = months.reduce((s, m) => s + m.entries.length, 0)

  if (shareLoading || txLoading || rulesLoading) {
    return (
      <div className="grid place-items-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-fg-subtle" />
      </div>
    )
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <header className="card p-4 md:p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wider text-fg-subtle">
              <Share2 className="w-3 h-3" /> Shared bag
            </div>
            <h2 className="font-semibold text-lg mt-1">
              {eventCount} event{eventCount === 1 ? '' : 's'} across {months.length} month
              {months.length === 1 ? '' : 's'}
            </h2>
            <p className="text-xs text-fg-muted mt-1">
              Anything marked <em>Show on my public share page</em> appears here and
              {' '}
              {shareLink ? (
                <>
                  on{' '}
                  <a
                    className="underline text-accent"
                    href={buildShareUrl(shareLink.slug)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {buildShareUrl(shareLink.slug)}
                  </a>
                </>
              ) : (
                'will appear on your public share page once you enable it in Settings.'
              )}
            </p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[11px] uppercase tracking-wider text-fg-subtle">Total</div>
            {totalExpense > 0 && (
              <div className="stat-num font-semibold text-negative">
                {formatMoney(totalExpense, currency)}
              </div>
            )}
            {totalIncome > 0 && (
              <div className="stat-num text-sm text-positive">
                +{formatMoney(totalIncome, currency)}
              </div>
            )}
          </div>
        </div>
      </header>

      {months.length === 0 && (
        <div className="card p-8 text-center text-sm text-fg-muted">
          Nothing shared yet. Mark a transaction or recurring rule with{' '}
          <em>Show on my public share page</em> to populate this view.
        </div>
      )}

      {months.map((m) => (
        <section key={m.key} className="card p-4 md:p-5 space-y-3">
          <header className="flex items-baseline justify-between gap-3">
            <h3 className="font-semibold capitalize">{m.label}</h3>
            <div className="text-xs text-fg-subtle">
              Total:{' '}
              <span className="stat-num font-medium text-negative">
                {formatMoney(m.totalExpense, currency)}
              </span>
              {m.totalIncome > 0 && (
                <>
                  {' · '}
                  <span className="stat-num font-medium text-positive">
                    +{formatMoney(m.totalIncome, currency)}
                  </span>
                </>
              )}
            </div>
          </header>
          <ul className="divide-y divide-border -mx-4 md:-mx-5">
            {m.entries.map((e) => (
              <li
                key={e.key}
                className="px-4 md:px-5 py-2.5 flex items-baseline gap-3 text-sm"
              >
                <span className="stat-num text-xs text-fg-subtle shrink-0 w-16">
                  {e.dateLabel}
                </span>
                <span className="flex-1 min-w-0 truncate">
                  {e.label}
                  {e.recurring && (
                    <span className="ml-1.5 text-[10px] uppercase tracking-wider text-fg-subtle">
                      recurring
                    </span>
                  )}
                </span>
                <span
                  className={`stat-num font-medium shrink-0 ${
                    e.amount >= 0 ? 'text-positive' : 'text-negative'
                  }`}
                >
                  {e.amount >= 0 ? '+' : '−'}
                  {formatMoney(Math.abs(e.amount), currency)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

interface Entry {
  key: string
  source: 'tx' | 'recurring'
  sourceId: string
  occurrenceDate?: string // for recurring entries — the projected date
  date: string
  dateLabel: string
  label: string
  amount: number // signed: positive income, negative expense
  recurring: boolean
}

interface MonthGroup {
  key: string
  label: string
  entries: Entry[]
  totalIncome: number
  totalExpense: number
}

function useMonthGrouping(args: {
  sharedTxs: Transaction[]
  sharedRules: RecurringRule[]
  today: Date
  horizonEnd: Date
}): MonthGroup[] {
  const { sharedTxs, sharedRules, today, horizonEnd } = args
  return useMemo(() => {
    const map = new Map<string, MonthGroup>()
    const ensure = (ym: string): MonthGroup => {
      let g = map.get(ym)
      if (!g) {
        const [y, m] = ym.split('-').map(Number)
        const label = new Date(y, m - 1, 1).toLocaleDateString(undefined, {
          month: 'long',
          year: 'numeric',
        })
        g = { key: ym, label, entries: [], totalIncome: 0, totalExpense: 0 }
        map.set(ym, g)
      }
      return g
    }

    for (const t of sharedTxs) {
      const ym = t.occurred_on.slice(0, 7)
      const g = ensure(ym)
      const amount = Number(t.amount)
      g.entries.push({
        key: `tx:${t.id}`,
        source: 'tx',
        sourceId: t.id,
        date: t.occurred_on,
        dateLabel: shortDate(t.occurred_on),
        label: t.description?.trim() || 'Untitled entry',
        amount,
        recurring: false,
      })
      if (amount >= 0) g.totalIncome += amount
      else g.totalExpense += -amount
    }

    for (const r of sharedRules) {
      const dates = expandRuleInRange(r, today, horizonEnd)
      for (const d of dates) {
        const ym = d.slice(0, 7)
        const g = ensure(ym)
        const signed = r.kind === 'income' ? Number(r.amount) : -Number(r.amount)
        g.entries.push({
          key: `r:${r.id}:${d}`,
          source: 'recurring',
          sourceId: r.id,
          occurrenceDate: d,
          date: d,
          dateLabel: shortDate(d),
          label: r.name,
          amount: signed,
          recurring: true,
        })
        if (signed >= 0) g.totalIncome += signed
        else g.totalExpense += -signed
      }
    }

    const cutoff = isoDate(today).slice(0, 7)
    const groups = Array.from(map.values())
      .filter(
        (g) =>
          g.key >= cutoff || g.entries.some((e) => e.date >= isoDate(today)),
      )
      .sort((a, b) => a.key.localeCompare(b.key))
    for (const g of groups) {
      g.entries.sort((a, b) => a.date.localeCompare(b.date))
      g.totalExpense = Math.round(g.totalExpense * 100) / 100
      g.totalIncome = Math.round(g.totalIncome * 100) / 100
    }
    return groups
  }, [sharedTxs, sharedRules, today, horizonEnd])
}

function shortDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
