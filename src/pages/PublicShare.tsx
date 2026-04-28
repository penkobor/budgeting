import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2, Share2 } from 'lucide-react'
import { usePublicShare, type PublicSharePayload } from '@/hooks/share'
import { expandRuleInRange } from '@/lib/recurring'
import { formatMoney, isoDate } from '@/lib/utils'

/**
 * BUDG-021 — public read-only share page at `/share/:slug` (HashRouter →
 * `#/share/<slug>`). Mounted OUTSIDE the auth gate so visitors don't need to
 * sign in.
 *
 * Renders a narrative view of the owner's `is_shared = true` transactions and
 * recurring-rule occurrences, grouped by year-month. Each month also shows a
 * total spend so viewers can read at a glance "in May Boris plans 20 000".
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

  return (
    <div className="min-h-screen bg-bg text-fg pb-20">
      <header className="px-4 md:px-8 pt-[max(env(safe-area-inset-top),24px)] pb-6 border-b border-border bg-bg-elev/30">
        <div className="max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wider text-fg-subtle">
            <Share2 className="w-3 h-3" /> Public share
          </div>
          <h1 className="text-2xl md:text-3xl font-semibold mt-1.5 break-words">
            <span className="text-accent">{payload.display_name}</span>
            <span className="text-fg-muted"> plans:</span>
          </h1>
          <p className="text-xs md:text-sm text-fg-muted mt-2 max-w-prose">
            Read-only view of marked-as-shared entries. Refresh to see updates.
          </p>
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
              <div className="text-xs text-fg-subtle">
                Total: <span className="stat-num font-medium text-negative">{formatMoney(m.totalExpense, 'EUR')}</span>
                {m.totalIncome > 0 && (
                  <>
                    {' · '}<span className="stat-num font-medium text-positive">+{formatMoney(m.totalIncome, 'EUR')}</span>
                  </>
                )}
              </div>
            </header>
            <ul className="divide-y divide-border -mx-4 md:-mx-5">
              {m.entries.map((e) => (
                <li key={e.key} className="px-4 md:px-5 py-2.5 flex items-baseline gap-3 text-sm">
                  <span className="stat-num text-xs text-fg-subtle shrink-0 w-16">{e.dateLabel}</span>
                  <span className="flex-1 min-w-0 truncate">
                    {e.label}
                    {e.recurring && (
                      <span className="ml-1.5 text-[10px] uppercase tracking-wider text-fg-subtle">recurring</span>
                    )}
                  </span>
                  <span
                    className={`stat-num font-medium shrink-0 ${e.amount >= 0 ? 'text-positive' : 'text-negative'}`}
                  >
                    {e.amount >= 0 ? '+' : '−'}{formatMoney(Math.abs(e.amount), 'EUR')}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
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
  totalIncome: number
  totalExpense: number
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
        g = { key: ym, label, entries: [], totalIncome: 0, totalExpense: 0 }
        map.set(ym, g)
      }
      return g
    }

    for (const t of payload.transactions) {
      const ym = t.occurred_on.slice(0, 7)
      const g = ensure(ym)
      const amount = Number(t.amount)
      const e: Entry = {
        key: `tx:${t.id}`,
        date: t.occurred_on,
        dateLabel: shortDate(t.occurred_on),
        label: t.description?.trim() || 'Untitled entry',
        amount,
        recurring: false,
      }
      g.entries.push(e)
      if (amount >= 0) g.totalIncome += amount
      else g.totalExpense += -amount
    }

    for (const r of payload.recurring_rules) {
      const fakeRule = {
        ...r,
        // expandRuleInRange expects RecurringRule shape — ours matches.
      } as unknown as Parameters<typeof expandRuleInRange>[0]
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
        if (signed >= 0) g.totalIncome += signed
        else g.totalExpense += -signed
      }
    }

    // Sort within each month, then sort months ascending starting from current month.
    const cutoff = isoDate(today).slice(0, 7)
    const groups = Array.from(map.values())
      .filter((g) => g.key >= cutoff || g.entries.some((e) => e.date >= isoDate(today)))
      .sort((a, b) => a.key.localeCompare(b.key))
    for (const g of groups) {
      g.entries.sort((a, b) => a.date.localeCompare(b.date))
      g.totalExpense = Math.round(g.totalExpense * 100) / 100
      g.totalIncome = Math.round(g.totalIncome * 100) / 100
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
