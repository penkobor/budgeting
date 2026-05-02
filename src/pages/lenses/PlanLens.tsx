import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, Trash2, ShoppingBag, Send, CalendarClock } from 'lucide-react'
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  useAssets,
  useCategories,
  useDeleteTransaction,
  useInsertTransactions,
  useMonthlyOpening,
  useRecurringOverridesInRange,
  useRecurringRules,
  useSettings,
  useTransactionsInRange,
  useUpsertTransaction,
} from '@/hooks/queries'
import { formatMoney, isoDate, monthKey } from '@/lib/utils'
import { expandRuleInRange } from '@/lib/recurring'
import { effectiveOccurrenceAmount } from '@/lib/projection'
import type { Transaction } from '@/lib/db.types'

type Draft = {
  id: string
  label: string
  amount: number // positive number, treated as expense
  date: string // ISO yyyy-mm-dd
  isShared?: boolean
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
  const { data: categories = [] } = useCategories()
  const insert = useInsertTransactions()
  const deleteTx = useDeleteTransaction()
  const upsertTx = useUpsertTransaction()
  const currency = settings?.currency ?? 'CZK'

  const catMap = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c])),
    [categories],
  )

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
  const { data: overrides = [] } = useRecurringOverridesInRange(fromIso, toIso)
  const { data: assets = [] } = useAssets()
  const assetBoost = useMemo(
    () => assets.reduce((s, a) => s + (a.include_in_balance ? Number(a.value) : 0), 0),
    [assets],
  )

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
  const [newShared, setNewShared] = useState(false)

  // Inline amount edit state for the upcoming-ledger list.
  // We store the raw string so partial edits (e.g. "1.") don't bounce.
  const [inlineEdit, setInlineEdit] = useState<{ id: string; value: string } | null>(null)
  const inlineInputRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    if (inlineEdit) {
      inlineInputRef.current?.focus()
      inlineInputRef.current?.select()
    }
  }, [inlineEdit?.id])

  function commitInlineEdit(t: Transaction) {
    if (!inlineEdit || inlineEdit.id !== t.id) return
    const parsed = Number(inlineEdit.value.replace(',', '.'))
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setInlineEdit(null)
      return
    }
    const nextAmount = -Math.abs(parsed)
    if (Math.abs(nextAmount - Number(t.amount)) < 0.005) {
      setInlineEdit(null)
      return
    }
    upsertTx.mutate(
      {
        id: t.id,
        amount: nextAmount,
        occurred_on: t.occurred_on,
        description: t.description,
        category_id: t.category_id,
        recurring_rule_id: t.recurring_rule_id,
        planned: t.planned,
        is_shared: t.is_shared,
      } as never,
      { onSettled: () => setInlineEdit(null) },
    )
  }

  // Upcoming one-off (non-recurring) expenses already on the ledger.
  // Source of truth = transactions table (same hook Ledger uses).
  // Filter: future-dated (>= today), expense (amount < 0), not generated
  // from a recurring rule. These are the "big nonstandard" purchases that
  // are easy to lose track of.
  const upcomingNonRecurring = useMemo(() => {
    const todayIso = isoDate(today)
    return txs
      .filter(
        (t) =>
          !t.recurring_rule_id &&
          Number(t.amount) < 0 &&
          t.occurred_on >= todayIso,
      )
      .slice()
      .sort((a, b) => a.occurred_on.localeCompare(b.occurred_on))
  }, [txs, today])

  const upcomingTotal = useMemo(
    () => upcomingNonRecurring.reduce((s, t) => s + Math.abs(Number(t.amount)), 0),
    [upcomingNonRecurring],
  )

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
        isShared: newShared,
      },
    ])
    setNewLabel('')
    setNewAmount('')
    setNewDate(isoDate(today))
    setNewShared(false)
  }

  function toggleDraftShared(id: string) {
    setDrafts((prev) =>
      prev.map((d) => (d.id === id ? { ...d, isShared: !d.isShared } : d)),
    )
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
        is_shared: d.isShared ?? false,
      } as never,
    ])
    removeDraft(d.id)
  }

  /**
   * Build daily running balance arrays for baseline (no drafts) and with drafts.
   * Day-by-day so we can spot the *lowest* balance, not just month-end.
   * Also samples month-end snapshots for the chart.
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
    // Recurring instances over horizon, deduped against ledger, with overrides applied.
    for (const r of rules) {
      for (const d of expandRuleInRange(r, horizonStart, horizonEnd)) {
        if (realised.has(`${r.id}|${d}`)) continue
        const eff = effectiveOccurrenceAmount(r, d, overrides)
        if (eff == null) continue // skipped via override
        txByDay[d] = (txByDay[d] ?? 0) + eff
      }
    }
    const draftByDay: Record<string, number> = {}
    for (const d of drafts) {
      draftByDay[d.date] = (draftByDay[d.date] ?? 0) - Math.abs(d.amount)
    }

    let baseline = opening0
    let withDrafts = opening0
    // Track the running lows only over dates >= today. Initialise to +Inf so
    // the first "ahead" day always seeds them, regardless of opening balance.
    let lowestBaseline = Number.POSITIVE_INFINITY
    let lowestWith = Number.POSITIVE_INFINITY
    const todayIso = isoDate(today)
    let lowestWithDate = todayIso

    // Pre-compute the last day of each month in the horizon for sampling
    const monthEnds = new Set<string>()
    for (let i = 1; i <= horizonMonths; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() + i, 0)
      monthEnds.add(isoDate(d))
    }
    const series: Array<{ label: string; iso: string; baseline: number; withDrafts: number }> = []

    const cursor = new Date(horizonStart)
    const endTs = horizonEnd.getTime()
    while (cursor.getTime() <= endTs) {
      const iso = isoDate(cursor)
      baseline += txByDay[iso] ?? 0
      withDrafts += (txByDay[iso] ?? 0) + (draftByDay[iso] ?? 0)
      // Only track "lowest balance ahead" from today onwards — past dips are
      // history, not something the user can act on.
      if (iso >= todayIso) {
        if (baseline < lowestBaseline) lowestBaseline = baseline
        if (withDrafts < lowestWith) {
          lowestWith = withDrafts
          lowestWithDate = iso
        }
      }
      if (monthEnds.has(iso)) {
        series.push({
          label: cursor.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }),
          iso,
          baseline: Math.round(baseline),
          withDrafts: Math.round(withDrafts),
        })
      }
      cursor.setDate(cursor.getDate() + 1)
    }

    // Defensive: if horizon ended before today (shouldn't happen with current
    // setup), fall back to the final balance.
    if (!Number.isFinite(lowestBaseline)) lowestBaseline = baseline
    if (!Number.isFinite(lowestWith)) lowestWith = withDrafts

    return {
      opening: opening0,
      endBaseline: baseline,
      endWith: withDrafts,
      lowestBaseline,
      lowestWith,
      lowestWithDate,
      totalDrafts: drafts.reduce((s, d) => s + Math.abs(d.amount), 0),
      series,
    }
  }, [opening, txs, rules, overrides, drafts, horizonStart, horizonEnd, today])

  const impact = projection.endWith - projection.endBaseline // negative if drafts hurt
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
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card p-5 md:p-6 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="label">Drafted total</div>
            <div className="stat-num text-2xl md:text-3xl font-semibold mt-1">
              {formatMoney(projection.totalDrafts, currency)}
            </div>
            <div className="text-xs text-fg-muted mt-1">
              {drafts.length} item{drafts.length === 1 ? '' : 's'}
              {impact < 0 && (
                <>
                  {' · '}
                  <span className="text-negative">
                    −{formatMoney(Math.abs(impact), currency)} impact
                  </span>
                </>
              )}
            </div>
          </div>
          <div>
            <div className="label">Lowest balance ahead</div>
            <div
              className={`stat-num text-2xl md:text-3xl font-semibold mt-1 ${projection.lowestWith + assetBoost < 0 ? 'text-negative' : ''}`}
            >
              {formatMoney(projection.lowestWith + assetBoost, currency)}
            </div>
            <div className="text-xs text-fg-muted mt-1">
              on {lowestDateLabel}
              {assetBoost > 0 && (
                <> · incl. assets {formatMoney(assetBoost, currency)}</>
              )}
            </div>
          </div>
        </div>

        {/* Forecast: baseline vs with-drafts (month-end snapshots) */}
        <div className="h-56 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={projection.series} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="rgb(var(--border))" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: 'rgb(var(--fg-muted))', fontSize: 11 }}
                axisLine={{ stroke: 'rgb(var(--border))' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: 'rgb(var(--fg-muted))', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={56}
                tickFormatter={(v: number) =>
                  Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`
                }
              />
              <Tooltip
                contentStyle={{
                  background: 'rgb(var(--bg-card))',
                  border: '1px solid rgb(var(--border))',
                  borderRadius: 12,
                  fontSize: 12,
                }}
                formatter={(v, name) => [formatMoney(Number(v), currency), String(name)]}
              />
              <Line
                type="monotone"
                dataKey="baseline"
                name="Without drafts"
                stroke="rgb(var(--fg-muted))"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="withDrafts"
                name="With drafts"
                stroke="rgb(var(--accent))"
                strokeWidth={2.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center justify-center gap-4 text-xs text-fg-muted -mt-2">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-0.5 border-t-2 border-dashed border-fg-muted" />
            Without drafts
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-0.5 bg-accent" />
            With drafts
          </span>
        </div>
      </motion.div>

      {/* Upcoming non-recurring ledger expenses */}
      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="label">Upcoming on the ledger</div>
            <h2 className="text-lg md:text-xl font-semibold mt-0.5">One-off planned expenses</h2>
            <p className="text-fg-muted text-xs md:text-sm mt-1">
              Future-dated entries already in the ledger that aren't recurring.
              Edit or delete them here — changes apply to the same source as Ledger.
            </p>
          </div>
          {upcomingNonRecurring.length > 0 && (
            <div className="text-right shrink-0">
              <div className="label">Total</div>
              <div className="stat-num text-base md:text-lg font-semibold text-negative mt-0.5">
                −{formatMoney(upcomingTotal, currency)}
              </div>
              <div className="text-[11px] text-fg-muted">
                {upcomingNonRecurring.length} item{upcomingNonRecurring.length === 1 ? '' : 's'}
              </div>
            </div>
          )}
        </div>

        {upcomingNonRecurring.length === 0 ? (
          <div className="card p-8 text-center text-fg-muted">
            <CalendarClock className="w-8 h-8 mx-auto mb-2 opacity-60" />
            <div className="text-sm">
              No future one-off expenses on the ledger. Big purchases you add to the
              ledger with a future date will show up here.
            </div>
          </div>
        ) : (
          <div className="card divide-y divide-border overflow-hidden">
            {upcomingNonRecurring.map((t) => {
              const cat = t.category_id ? catMap[t.category_id] : undefined
              const label = t.description?.trim() || cat?.name || 'Untitled'
              const amt = Math.abs(Number(t.amount))
              return (
                <div key={t.id} className="p-4 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{label}</div>
                    <div className="text-xs text-fg-muted flex items-center gap-2 mt-0.5">
                      <span className="stat-num">
                        {new Date(t.occurred_on).toLocaleDateString(undefined, {
                          day: 'numeric',
                          month: 'short',
                          year: '2-digit',
                        })}
                      </span>
                      {cat && (
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: cat.color ?? 'rgb(var(--fg-subtle))' }}
                          />
                          {cat.name}
                        </span>
                      )}
                    </div>
                  </div>
                  {inlineEdit?.id === t.id ? (
                    <input
                      ref={inlineInputRef}
                      className="input stat-num text-right font-semibold tabular-nums w-28 !py-1.5"
                      inputMode="decimal"
                      value={inlineEdit.value}
                      onChange={(e) =>
                        setInlineEdit({ id: t.id, value: e.target.value })
                      }
                      onBlur={() => commitInlineEdit(t)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          commitInlineEdit(t)
                        } else if (e.key === 'Escape') {
                          e.preventDefault()
                          setInlineEdit(null)
                        }
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setInlineEdit({ id: t.id, value: String(amt) })}
                      className="stat-num font-semibold tabular-nums text-negative hover:underline decoration-dotted underline-offset-4"
                      title="Tap to edit amount"
                    >
                      −{formatMoney(amt, currency)}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => deleteTx.mutate(t.id)}
                    className="btn-ghost text-fg-muted"
                    aria-label="Delete transaction"
                    title="Delete"
                    disabled={deleteTx.isPending}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </section>

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
        <label className="flex items-center gap-2.5 rounded-xl border border-border p-3 cursor-pointer">
          <input
            type="checkbox"
            checked={newShared}
            onChange={(e) => setNewShared(e.target.checked)}
            className="w-4 h-4"
          />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">Show on my public share page when committed</div>
            <div className="text-[11px] text-fg-subtle">
              Anyone with your share link can see this entry. Toggle in Settings.
            </div>
          </div>
        </label>
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
                  <div className="text-xs text-fg-muted flex items-center gap-2 mt-0.5">
                    <span className="stat-num">
                      {new Date(d.date).toLocaleDateString(undefined, {
                        day: 'numeric',
                        month: 'short',
                        year: '2-digit',
                      })}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleDraftShared(d.id)}
                      className={`text-[11px] px-1.5 py-0.5 rounded-full border transition-colors ${
                        d.isShared
                          ? 'border-accent/40 bg-accent/10 text-accent'
                          : 'border-border text-fg-subtle hover:text-fg'
                      }`}
                      title={d.isShared ? 'Will be shared on commit — click to unshare' : 'Click to mark as shared on commit'}
                    >
                      {d.isShared ? 'Shared' : 'Private'}
                    </button>
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
