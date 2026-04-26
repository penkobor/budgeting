import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, Trash2, ShoppingBag, Send } from 'lucide-react'
import {
  useInsertTransactions,
  useMonthlyOpening,
  useRecurringRules,
  useSettings,
  useTransactionsInRange,
} from '@/hooks/queries'
import { formatMoney, isoDate, monthKey } from '@/lib/utils'
import { expandRuleInRange } from '@/lib/recurring'

type Draft = {
  id: string
  label: string
  amount: number // positive number, treated as expense
  date: string // ISO yyyy-mm-dd
}

const STORAGE_KEY = 'plan-drafts-v1'

function loadDrafts(): Draft[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((d) => d && typeof d.id === 'string') as Draft[]
  } catch {
    return []
  }
}

/**
 * PlanLens — "what if I make these big purchases?".
 *
 * Drafts are stored in localStorage so they survive reloads but never hit the DB
 * until the user explicitly commits one (or all) to the ledger.
 * The headline numbers show how much these planned drafts shave off the
 * end-of-horizon balance and what the lowest balance dip will be.
 */
export function PlanLens() {
  const today = useMemo(() => new Date(), [])
  const monthIso = monthKey(today)

  const { data: settings } = useSettings()
  const { data: opening } = useMonthlyOpening(monthIso)
  const { data: rules = [] } = useRecurringRules()
  const insert = useInsertTransactions()
  const currency = settings?.currency ?? 'CZK'

  // Same 12-month horizon ForecastLens uses for the longest view.
  const horizonMonths = 12
  const horizonStart = useMemo(() => new Date(today.getFullYear(), today.getMonth(), 1), [today])
  const horizonEnd = useMemo(
    () => new Date(today.getFullYear(), today.getMonth() + horizonMonths, 0),
    [today]
  )
  const fromIso = horizonStart.toISOString().slice(0, 10)
  const toIso = horizonEnd.toISOString().slice(0, 10)
  const { data: txs = [] } = useTransactionsInRange(fromIso, toIso)

  // Drafts (local-only)
  const [drafts, setDrafts] = useState<Draft[]>(() => loadDrafts())
  useEffect(() => {
    if (typeof window !== 'undefined')
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts))
  }, [drafts])

  // New-draft form
  const [newLabel, setNewLabel] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [newDate, setNewDate] = useState(isoDate(today))

  function addDraft(e: React.FormEvent) {
    e.preventDefault()
    const amt = Number(newAmount)
    if (!amt || amt <= 0) return
    setDrafts((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        label: newLabel.trim() || 'Big purchase',
        amount: amt,
        date: newDate,
      },
    ])
    setNewLabel('')
    setNewAmount('')
    setNewDate(isoDate(today))
  }

  function removeDraft(id: string) {
    setDrafts((prev) => prev.filter((d) => d.id !== id))
  }

  async function commitDraft(d: Draft) {
    await insert.mutateAsync([
      {
        amount: -Math.abs(d.amount),
        occurred_on: d.date,
        description: d.label,
        planned: true,
        category_id: null,
      },
    ])
    removeDraft(d.id)
  }

  /**
   * Build daily running balance arrays for baseline (no drafts) and with drafts.
   * Day-by-day so we can spot the *lowest* balance, not just month-end.
   */
  const projection = useMemo(() => {
    const opening0 = opening?.opening_balance ?? 0
    // map of yyyy-mm-dd -> signed delta from existing ledger
    const txByDay: Record<string, number> = {}
    const realised = new Set<string>()
    for (const t of txs) {
      txByDay[t.occurred_on] = (txByDay[t.occurred_on] ?? 0) + Number(t.amount)
      if (t.recurring_rule_id) realised.add(`${t.recurring_rule_id}|${t.occurred_on}`)
    }
    // Recurring instances over horizon, deduped against ledger
    for (const r of rules) {
      for (const d of expandRuleInRange(r, horizonStart, horizonEnd)) {
        if (realised.has(`${r.id}|${d}`)) continue
        const sign = r.kind === 'income' ? 1 : -1
        txByDay[d] = (txByDay[d] ?? 0) + sign * r.amount
      }
    }
    const draftByDay: Record<string, number> = {}
    for (const d of drafts) {
      draftByDay[d.date] = (draftByDay[d.date] ?? 0) - Math.abs(d.amount)
    }

    let baseline = opening0
    let withDrafts = opening0
    let lowestBaseline = baseline
    let lowestWith = withDrafts
    let lowestWithDate = isoDate(horizonStart)

    const cursor = new Date(horizonStart)
    const endTs = horizonEnd.getTime()
    while (cursor.getTime() <= endTs) {
      const iso = isoDate(cursor)
      baseline += txByDay[iso] ?? 0
      withDrafts += (txByDay[iso] ?? 0) + (draftByDay[iso] ?? 0)
      if (baseline < lowestBaseline) lowestBaseline = baseline
      if (withDrafts < lowestWith) {
        lowestWith = withDrafts
        lowestWithDate = iso
      }
      cursor.setDate(cursor.getDate() + 1)
    }

    return {
      opening: opening0,
      endBaseline: baseline,
      endWith: withDrafts,
      lowestBaseline,
      lowestWith,
      lowestWithDate,
      totalDrafts: drafts.reduce((s, d) => s + Math.abs(d.amount), 0),
    }
  }, [opening, txs, rules, drafts, horizonStart, horizonEnd])

  const impact = projection.endWith - projection.endBaseline // negative if drafts hurt
  const horizonLabel = horizonEnd.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
  const lowestDateLabel = new Date(projection.lowestWithDate).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
  })

  return (
    <div className="space-y-4 md:space-y-6">
      <header>
        <div className="label">Plan</div>
        <h1 className="text-2xl md:text-3xl font-semibold mt-0.5">Big purchases</h1>
        <p className="text-fg-muted text-sm mt-1">
          Sketch out major spends and see how they reshape the next 12 months. Stays local until you
          commit it to the ledger.
        </p>
      </header>

      {/* Impact summary */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card p-5 md:p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <div className="label">Drafted total</div>
            <div className="stat-num text-2xl md:text-3xl font-semibold mt-1">
              {formatMoney(projection.totalDrafts, currency)}
            </div>
            <div className="text-xs text-fg-muted mt-1">{drafts.length} item{drafts.length === 1 ? '' : 's'}</div>
          </div>
          <div>
            <div className="label">Balance by {horizonLabel}</div>
            <div className="stat-num text-2xl md:text-3xl font-semibold mt-1">
              {formatMoney(projection.endWith, currency)}
            </div>
            <div className={`text-xs mt-1 ${impact < 0 ? 'text-negative' : 'text-fg-muted'}`}>
              {impact < 0
                ? `${formatMoney(Math.abs(impact), currency)} less than without drafts`
                : 'Same as without drafts'}
            </div>
          </div>
          <div>
            <div className="label">Lowest balance ahead</div>
            <div
              className={`stat-num text-2xl md:text-3xl font-semibold mt-1 ${projection.lowestWith < 0 ? 'text-negative' : ''}`}
            >
              {formatMoney(projection.lowestWith, currency)}
            </div>
            <div className="text-xs text-fg-muted mt-1">on {lowestDateLabel}</div>
          </div>
        </div>
      </motion.div>

      {/* Add new draft */}
      <form onSubmit={addDraft} className="card p-4 md:p-5 space-y-3">
        <div className="label">Add a planned purchase</div>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_140px_160px_auto] gap-3">
          <input
            className="input"
            placeholder="e.g. iPhone 17 Pro"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
          />
          <input
            className="input stat-num"
            inputMode="decimal"
            placeholder="Amount"
            value={newAmount}
            onChange={(e) => setNewAmount(e.target.value)}
            required
          />
          <input
            className="input stat-num"
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
          />
          <button type="submit" className="btn-primary justify-center">
            <Plus className="w-4 h-4" />
            Add draft
          </button>
        </div>
      </form>

      {/* Drafts list */}
      {drafts.length === 0 ? (
        <div className="card p-8 text-center text-fg-muted">
          <ShoppingBag className="w-8 h-8 mx-auto mb-2 opacity-60" />
          <div className="text-sm">No drafts yet. Add a planned purchase above.</div>
        </div>
      ) : (
        <div className="card divide-y divide-border overflow-hidden">
          {drafts
            .slice()
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((d) => (
              <div key={d.id} className="p-4 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{d.label}</div>
                  <div className="text-xs text-fg-muted">
                    {new Date(d.date).toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'short',
                      year: '2-digit',
                    })}
                  </div>
                </div>
                <div className="stat-num font-semibold tabular-nums text-negative">
                  −{formatMoney(d.amount, currency)}
                </div>
                <button
                  type="button"
                  onClick={() => commitDraft(d)}
                  className="btn-outline text-xs"
                  title="Add to ledger"
                  disabled={insert.isPending}
                >
                  <Send className="w-3.5 h-3.5" />
                  Commit
                </button>
                <button
                  type="button"
                  onClick={() => removeDraft(d.id)}
                  className="btn-ghost text-fg-muted"
                  aria-label="Remove draft"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}
