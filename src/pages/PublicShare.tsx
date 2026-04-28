import { useMemo, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2, Share2, Calculator, X } from 'lucide-react'
import { usePublicShare, type PublicSharePayload } from '@/hooks/share'
import { expandRuleInRange } from '@/lib/recurring'
import { formatMoney, isoDate } from '@/lib/utils'

/**
 * BUDG-021 — public read-only share page at `/share/:slug` (HashRouter →
 * `#/share/<slug>`). Mounted OUTSIDE the auth gate so visitors don't need to
 * sign in.
 *
 * Renders a narrative view of the owner's `is_shared = true` transactions and
 * recurring-rule occurrences, grouped by year-month. A calculator mode lets
 * the visitor tap rows to compute a running total in a floating bubble.
 */
export function PublicSharePage() {
  const { slug } = useParams<{ slug: string }>()
  const { data, isLoading, error } = usePublicShare(slug)

  if (isLoading) {
    return (
      <div className="min-h-screen grid place-items-center bg-bg">
        <Loader2 className="w-6 h-6 animate-spin text-fg-subtle" />
      </div>
    )
  }
  if (error) {
    return <CenteredMessage title="Could not load share" subtitle={(error as Error).message} />
  }
  if (!data) {
    return <CenteredMessage title="Share not found" subtitle="The link may have been disabled." />
  }
  return <PublicShareView payload={data} />
}

function PublicShareView({ payload }: { payload: PublicSharePayload }) {
  const months = useMonthGrouping(payload)
  const currency = payload.currency || 'CZK'

  const [calcMode, setCalcMode] = useState(false)
  const [calcSelected, setCalcSelected] = useState<Set<string>>(new Set())
  const toggleCalcSelected = useCallback((key: string) => {
    setCalcSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])
  const exitCalcMode = useCallback(() => {
    setCalcMode(false)
    setCalcSelected(new Set())
  }, [])
  const allEntries = useMemo(() => months.flatMap((m) => m.entries), [months])

  return (
    <div className="min-h-screen bg-bg text-fg pb-24">
      <header className="px-4 md:px-8 pt-[max(env(safe-area-inset-top),24px)] pb-6 border-b border-border bg-bg-elev/30">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wider text-fg-subtle">
                <Share2 className="w-3 h-3" /> Public share
              </div>
              <h1 className="text-2xl md:text-3xl font-semibold mt-1.5 break-words">
                <span className="text-accent">{payload.display_name}</span>
                <span className="text-fg-muted"> plans:</span>
              </h1>
              <p className="text-xs md:text-sm text-fg-muted mt-2 max-w-prose">
                Read-only view of marked-as-shared entries.{' '}
                {calcMode
                  ? 'Tap rows to add them up in the floating bubble.'
                  : 'Refresh to see updates.'}
              </p>
            </div>
            <button
              className={`btn-ghost inline-flex items-center gap-1.5 text-xs shrink-0 ${
                calcMode ? 'ring-1 ring-accent text-accent' : ''
              }`}
              onClick={() => (calcMode ? exitCalcMode() : setCalcMode(true))}
              title="Calculator mode — tap rows to sum"
            >
              <Calculator className="w-3.5 h-3.5" />
              {calcMode ? 'Exit' : 'Calc'}
            </button>
          </div>
        </div>
      </header>

      <main className="px-4 md:px-8 pt-6 max-w-2xl mx-auto space-y-6">
        {months.length === 0 && (
          <div className="card p-8 text-center text-sm text-fg-muted">
            Nothing shared yet.
          </div>
        )}
        {months.map((m) => (
          <section key={m.key} className="card p-4 md:p-5 space-y-3">
            <header className="flex items-baseline justify-between gap-3">
              <h2 className="font-semibold capitalize">{m.label}</h2>
            </header>
            <ul className="divide-y divide-border -mx-4 md:-mx-5">
              {m.entries.map((e) => {
                const selected = calcMode && calcSelected.has(e.key)
                return (
                  <li
                    key={e.key}
                    onClick={() => {
                      if (calcMode) toggleCalcSelected(e.key)
                    }}
                    className={`px-4 md:px-5 py-2.5 flex items-baseline gap-3 text-sm transition-colors ${
                      calcMode ? 'cursor-pointer' : ''
                    } ${selected ? 'bg-accent/15 ring-1 ring-inset ring-accent/40' : ''}`}
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
                )
              })}
            </ul>
          </section>
        ))}
      </main>

      {calcMode && (
        <CalculatorBubble
          selected={calcSelected}
          entries={allEntries}
          currency={currency}
          onClear={() => setCalcSelected(new Set())}
          onExit={exitCalcMode}
        />
      )}
    </div>
  )
}

function CalculatorBubble(props: {
  selected: Set<string>
  entries: Entry[]
  currency: string
  onClear: () => void
  onExit: () => void
}) {
  const { selected, entries, currency, onClear, onExit } = props
  const sum = useMemo(() => {
    let s = 0
    for (const e of entries) if (selected.has(e.key)) s += e.amount
    return s
  }, [entries, selected])
  const count = selected.size
  return (
    <div className="fixed bottom-4 right-4 z-40 max-w-[calc(100vw-2rem)]">
      <div className="card shadow-lg p-3 flex items-center gap-3 bg-bg-elev/95 backdrop-blur border border-accent/40">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-fg-subtle">
            Calculator
          </div>
          <div className="text-xs text-fg-muted">{count} selected</div>
          <div
            className={`stat-num text-lg font-semibold tabular-nums ${
              sum > 0 ? 'text-positive' : sum < 0 ? 'text-negative' : 'text-fg'
            }`}
          >
            {sum >= 0 ? '+' : '−'}
            {formatMoney(Math.abs(sum), currency)}
          </div>
        </div>
        {count > 0 && (
          <button className="btn-ghost text-xs" onClick={onClear} title="Clear selection">
            Clear
          </button>
        )}
        <button className="btn-ghost p-1.5" onClick={onExit} title="Exit calculator mode">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

interface Entry {
  key: string
  date: string
  dateLabel: string
  label: string
  amount: number // signed: positive income, negative expense
  recurring: boolean
}

interface MonthGroup {
  key: string // YYYY-MM
  label: string // "May 2026"
  entries: Entry[]
}

function useMonthGrouping(payload: PublicSharePayload): MonthGroup[] {
  return useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    // Project recurring rules for the next 6 months from today.
    const horizonEnd = new Date(today.getFullYear(), today.getMonth() + 6 + 1, 0)

    const map = new Map<string, MonthGroup>()
    const ensure = (ym: string): MonthGroup => {
      let g = map.get(ym)
      if (!g) {
        const [y, m] = ym.split('-').map(Number)
        const label = new Date(y, m - 1, 1).toLocaleDateString(undefined, {
          month: 'long',
          year: 'numeric',
        })
        g = { key: ym, label, entries: [] }
        map.set(ym, g)
      }
      return g
    }

    for (const t of payload.transactions) {
      const ym = t.occurred_on.slice(0, 7)
      const g = ensure(ym)
      const amount = Number(t.amount)
      g.entries.push({
        key: `tx:${t.id}`,
        date: t.occurred_on,
        dateLabel: shortDate(t.occurred_on),
        label: t.description?.trim() || 'Untitled entry',
        amount,
        recurring: false,
      })
    }

    for (const r of payload.recurring_rules) {
      const fakeRule = r as unknown as Parameters<typeof expandRuleInRange>[0]
      const dates = expandRuleInRange(fakeRule, today, horizonEnd)
      for (const d of dates) {
        const ym = d.slice(0, 7)
        const g = ensure(ym)
        const signed = r.kind === 'income' ? Number(r.amount) : -Number(r.amount)
        g.entries.push({
          key: `r:${r.id}:${d}`,
          date: d,
          dateLabel: shortDate(d),
          label: r.name,
          amount: signed,
          recurring: true,
        })
      }
    }

    const cutoff = isoDate(today).slice(0, 7)
    const groups = Array.from(map.values())
      .filter((g) => g.key >= cutoff || g.entries.some((e) => e.date >= isoDate(today)))
      .sort((a, b) => a.key.localeCompare(b.key))
    for (const g of groups) {
      g.entries.sort((a, b) => a.date.localeCompare(b.date))
    }
    return groups
  }, [payload])
}

function shortDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function CenteredMessage({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="min-h-screen grid place-items-center bg-bg p-6 text-center">
      <div className="max-w-sm space-y-2">
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle && <p className="text-sm text-fg-muted">{subtitle}</p>}
      </div>
    </div>
  )
}
