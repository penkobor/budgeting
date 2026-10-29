import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, ListChecks, Plus, Repeat, Share2, X } from 'lucide-react'
import {
  useCategories, useMonthlyOpening, useRecurringOverridesInRange, useRecurringRules,
  useSettings, useTransactionsInRange,
} from '@/hooks/queries'
import { daysInMonth, formatMoney, isoDate, monthKey } from '@/lib/utils'
import { expandRuleInRange } from '@/lib/recurring'
import { effectiveOccurrenceAmount } from '@/lib/projection'
import { AddTransactionDialog } from '@/components/AddTransactionDialog'
import { Modal } from '@/components/ui/Modal'
import type { Transaction } from '@/lib/db.types'

export function Ledger() {
  const today = new Date()
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const monthIso = monthKey(cursor)
  const lastDay = daysInMonth(cursor.getFullYear(), cursor.getMonth())
  const fromIso = monthIso
  const toIso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const { data: settings } = useSettings()
  const { data: opening } = useMonthlyOpening(monthIso)
  const { data: txs = [] } = useTransactionsInRange(fromIso, toIso)
  const { data: rules = [] } = useRecurringRules()
  const { data: overrides = [] } = useRecurringOverridesInRange(fromIso, toIso)
  const { data: personalCategories = [] } = useCategories()

  const currency = settings?.currency ?? 'CZK'
  const catMap = useMemo(
    () => Object.fromEntries(personalCategories.map((c) => [c.id, c])),
    [personalCategories],
  )

  const txCat = (t: Transaction) => {
    const c = t.category_id ? catMap[t.category_id] : undefined
    return c ? { id: c.id, name: c.name, color: c.color } : null
  }
  const txDescription = (t: Transaction) =>
    t.description?.trim() || txCat(t)?.name || 'Untitled'

  // Group transactions by day
  const byDay = useMemo(() => {
    const map: Record<number, Transaction[]> = {}
    for (const t of txs) {
      const d = parseInt(t.occurred_on.slice(8, 10), 10)
      ;(map[d] ??= []).push(t)
    }
    return map
  }, [txs])

  // Pending rule instances (forecast only, not yet realised). Per-day overrides
  // (skipped / amount_override) are applied so the running balance matches
  // the projection used by goal trigger and rebalance flow.
  const pendingByDay = useMemo(() => {
    const have = new Set(txs.filter((t) => t.recurring_rule_id).map((t) => `${t.recurring_rule_id}|${t.occurred_on}`))
    const map: Record<number, Array<{ rule_id: string; amount: number; originalAmount: number; overridden: boolean; description: string; categoryId: string | null }>> = {}
    const f = new Date(fromIso + 'T00:00:00')
    const tt = new Date(toIso + 'T00:00:00')
    for (const r of rules) {
      for (const d of expandRuleInRange(r, f, tt)) {
        if (have.has(`${r.id}|${d}`)) continue
        const eff = effectiveOccurrenceAmount(r, d, overrides)
        if (eff == null) continue // skipped via override
        const original = r.kind === 'income' ? r.amount : -r.amount
        const day = parseInt(d.slice(8, 10), 10)
        ;(map[day] ??= []).push({
          rule_id: r.id,
          amount: eff,
          originalAmount: original,
          overridden: Math.abs(eff - original) > 0.005,
          description: r.name,
          categoryId: r.category_id,
        })
      }
    }
    return map
  }, [rules, overrides, txs, fromIso, toIso])

  // Build rows with running balance — we no longer track actual-vs-planned;
  // every transaction is a single 'plan' entry. Pending rule instances still
  // flow into the running balance (so totals match Dashboard / Forecast) and
  // are surfaced in the expanded row as editable templated entries (editing
  // creates a per-day override without touching the rule itself).
  const rows = useMemo(() => {
    const opening0 = opening?.opening_balance ?? 0
    const arr: Array<{
      day: number;
      date: string;
      runningBalance: number;
      income: number;
      expense: number;
      txs: Transaction[];
      pending: Array<{ rule_id: string; amount: number; originalAmount: number; overridden: boolean; description: string; categoryId: string | null }>;
    }> = []
    let balance = opening0
    for (let d = 1; d <= lastDay; d++) {
      const dayTxs = byDay[d] ?? []
      const dayPending = pendingByDay[d] ?? []
      let dayDelta = 0
      let inc = 0, exp = 0
      for (const t of dayTxs) {
        const a = Number(t.amount)
        dayDelta += a
        if (a >= 0) inc += a
        else exp += -a
      }
      for (const p of dayPending) {
        dayDelta += p.amount
        if (p.amount >= 0) inc += p.amount
        else exp += -p.amount
      }
      balance += dayDelta
      arr.push({
        day: d,
        date: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        runningBalance: Math.round(balance),
        income: inc,
        expense: exp,
        txs: dayTxs,
        pending: dayPending,
      })
    }
    return arr
  }, [byDay, pendingByDay, opening, cursor, lastDay])

  const monthLabel = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  // Edit dialog state
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [editingPending, setEditingPending] = useState<
    | { rule_id: string; date: string; amount: number; description: string; categoryId: string | null }
    | null
  >(null)
  const [addForDate, setAddForDate] = useState<string | null>(null)

  // Collapsible day rows. By default only today (or last day of past months) is expanded.
  const sameMonthAsToday =
    cursor.getFullYear() === today.getFullYear() && cursor.getMonth() === today.getMonth()
  const defaultExpandedDay = sameMonthAsToday ? today.getDate() : 1
  const [expandedDays, setExpandedDays] = useState<Set<number>>(
    () => new Set([defaultExpandedDay]),
  )

  // Reset expanded set when navigating to a different month
  useEffect(() => {
    setExpandedDays(new Set([defaultExpandedDay]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthIso])

  const toggleDay = (day: number) => {
    setExpandedDays((prev) => {
      const next = new Set(prev)
      if (next.has(day)) next.delete(day)
      else next.add(day)
      return next
    })
  }

  // ── Selection mode ──
  // User can flip on selection mode to mark arbitrary days, then open a
  // summary sheet that aggregates totals by category + lists every entry.
  const [selectMode, setSelectMode] = useState(false)
  const [selectedDays, setSelectedDays] = useState<Set<number>>(() => new Set())
  const [summaryOpen, setSummaryOpen] = useState(false)

  // Reset selection when switching months / leaving select mode.
  useEffect(() => {
    setSelectedDays(new Set())
    setSelectMode(false)
  }, [monthIso])

  const toggleSelect = (day: number) => {
    setSelectedDays((prev) => {
      const next = new Set(prev)
      if (next.has(day)) next.delete(day)
      else next.add(day)
      return next
    })
  }

  // Build the summary payload from currently-selected days.
  const summary = useMemo(() => {
    const sortedDays = Array.from(selectedDays).sort((a, b) => a - b)
    const selectedRows = rows.filter((r) => selectedDays.has(r.day))
    let income = 0, expense = 0
    type Item = { key: string; date: string; amount: number; description: string; categoryId: string | null }
    const items: Item[] = []
    const byCat = new Map<string, number>() // category_id (or '__uncat__') → expense (positive)
    for (const r of selectedRows) {
      for (const t of r.txs) {
        const amt = Number(t.amount)
        if (amt >= 0) income += amt
        else expense += -amt
        const cat = txCat(t)
        items.push({
          key: `tx-${t.id}`,
          date: r.date,
          amount: amt,
          description: txDescription(t),
          categoryId: cat?.id ?? null,
        })
        if (amt < 0) {
          const k = cat?.id ?? '__uncat__'
          byCat.set(k, (byCat.get(k) ?? 0) + -amt)
        }
      }
      // Recurring rule instances are now included in the selection
      // summary too — they're visible everywhere else (Ledger expanded
      // row, Today / Week / Month lenses), so the summary should reflect
      // the same totals.
      for (const p of r.pending) {
        if (p.amount >= 0) income += p.amount
        else expense += -p.amount
        items.push({
          key: `rule-${p.rule_id}-${r.day}`,
          date: r.date,
          amount: p.amount,
          description: p.description,
          categoryId: p.categoryId,
        })
        if (p.amount < 0) {
          const k = p.categoryId ?? '__uncat__'
          byCat.set(k, (byCat.get(k) ?? 0) + -p.amount)
        }
      }
    }
    const categories = Array.from(byCat.entries())
      .map(([id, amount]) => ({
        id,
        name:
          id === '__uncat__'
            ? 'Uncategorised'
            : catMap[id]?.name ?? 'Unknown',
        color:
          id === '__uncat__'
            ? null
            : catMap[id]?.color ?? null,
        amount,
      }))
      .sort((a, b) => b.amount - a.amount)
    return {
      days: sortedDays,
      itemCount: items.length,
      items: items.sort((a, b) => a.date.localeCompare(b.date)),
      income,
      expense,
      net: income - expense,
      categories,
    }
  }, [rows, selectedDays, catMap])

  // Auto-scroll today's row into view when on the current month
  const todayRowRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!sameMonthAsToday) return
    // Wait for layout, then scroll the row into a comfortable position.
    const id = window.setTimeout(() => {
      todayRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 100)
    return () => window.clearTimeout(id)
  }, [sameMonthAsToday, monthIso])


  const todayIso = isoDate(today)
  const shiftMonth = (n: number) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1))

  return (
    <div className="max-w-4xl mx-auto pb-32 md:pb-16 max-md:-mt-[calc(env(safe-area-inset-top)+12px)]">
      {/* Sticky header: the month and its controls stay reachable while scrolling. */}
      <header className="sticky top-0 z-20 px-4 md:px-10 pt-[calc(env(safe-area-inset-top)+20px)] md:pt-10 pb-3 bg-bg/85 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3">
          <h1 className="page-title truncate">{monthLabel}</h1>
          <div className="flex items-center gap-1 shrink-0">
            {!sameMonthAsToday && (
              <button
                onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
                className="btn-tinted !rounded-full !py-1.5 text-[13px]"
              >
                Today
              </button>
            )}
            <button onClick={() => shiftMonth(-1)} className="icon-btn" aria-label="Previous month">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button onClick={() => shiftMonth(1)} className="icon-btn" aria-label="Next month">
              <ChevronRight className="w-5 h-5" />
            </button>
            <button
              onClick={() => {
                if (selectMode) setSelectedDays(new Set())
                setSelectMode(!selectMode)
              }}
              className={`icon-btn ${selectMode ? '!bg-fg !text-bg' : ''}`}
              aria-pressed={selectMode}
              title={selectMode ? 'Done selecting' : 'Select days to summarise'}
            >
              {selectMode ? <X className="w-[18px] h-[18px]" /> : <ListChecks className="w-[18px] h-[18px]" />}
            </button>
          </div>
        </div>
        {selectMode && (
          <div className="text-[13px] text-fg-muted mt-1">
            {selectedDays.size === 0 ? 'Tap days to add them to a summary.' : `${selectedDays.size} selected`}
          </div>
        )}
      </header>

      <div className="px-4 md:px-10 mt-2">
        <div className="card overflow-hidden">
          {rows.map((row) => {
            // Use the LOCAL date here — today.toISOString().slice(0,10) returns
            // the UTC date, which can disagree with the user's local date right
            // around midnight.
            const isToday = row.date === todayIso
            const isPast = row.date < todayIso
            const date = new Date(row.date + 'T00:00:00')
            const isWeekend = date.getDay() === 0 || date.getDay() === 6
            const expanded = expandedDays.has(row.day)
            const isSelected = selectedDays.has(row.day)
            const names = [...row.txs.map(txDescription), ...row.pending.map((p) => p.description)]
            const onRowTap = () => (selectMode ? toggleSelect(row.day) : toggleDay(row.day))

            return (
              <div
                key={row.day}
                ref={isToday ? todayRowRef : undefined}
                className={`border-b border-border/70 last:border-b-0 transition-colors ${
                  isSelected ? 'bg-fg/[0.06]' : isToday ? 'bg-fg/[0.035]' : ''
                }`}
              >
                <button
                  type="button"
                  onClick={onRowTap}
                  aria-expanded={selectMode ? undefined : expanded}
                  aria-pressed={selectMode ? isSelected : undefined}
                  data-no-press
                  className="w-full grid grid-cols-[44px_1fr_auto] md:grid-cols-[52px_1fr_150px_130px] items-center gap-3 md:gap-4 px-4 py-3 text-left hover:bg-bg-elev/40 transition-colors"
                >
                  {/* Day: weekday over date; today gets a filled badge, selection a check. */}
                  <span className="flex flex-col items-center leading-none">
                    <span className={`text-[11px] font-medium ${isWeekend ? 'text-fg-subtle' : 'text-fg-muted'}`}>
                      {date.toLocaleDateString('en-US', { weekday: 'short' })}
                    </span>
                    <span
                      className={`mt-1 w-8 h-8 grid place-items-center rounded-full stat-num text-[15px] font-semibold ${
                        isSelected
                          ? 'bg-fg text-bg'
                          : isToday
                            ? 'bg-fg text-bg'
                            : isPast
                              ? 'text-fg-subtle'
                              : 'text-fg'
                      }`}
                    >
                      {isSelected ? <Check className="w-4 h-4" /> : row.day}
                    </span>
                  </span>

                  <span className="min-w-0">
                    <span
                      className={`block stat-num text-[15px] font-semibold truncate ${
                        row.runningBalance < 0 ? 'text-negative' : isPast ? 'text-fg-muted' : 'text-fg'
                      }`}
                    >
                      {formatMoney(row.runningBalance, currency)}
                    </span>
                    <span className="block text-[13px] text-fg-subtle truncate mt-0.5">
                      {names.length > 0 ? names.join(' · ') : 'Nothing planned'}
                    </span>
                  </span>

                  {/* Mobile: day flow stacked on the right, only what's non-zero. */}
                  <span className="md:hidden text-right stat-num text-[14px] leading-tight">
                    {row.expense > 0 && <span className="block">−{formatMoney(row.expense, currency)}</span>}
                    {row.income > 0 && <span className="block text-positive">+{formatMoney(row.income, currency)}</span>}
                  </span>
                  <span className="hidden md:block text-right stat-num text-[14px] text-positive">
                    {row.income > 0 ? `+${formatMoney(row.income, currency)}` : ''}
                  </span>
                  <span className="hidden md:block text-right stat-num text-[14px]">
                    {row.expense > 0 ? `−${formatMoney(row.expense, currency)}` : ''}
                  </span>
                </button>

                {expanded && !selectMode && (
                  <div className="pl-[76px] md:pl-[84px] pr-4 pb-3 -mt-1 space-y-0.5">
                    {row.txs.map((t) => {
                      const cat = txCat(t)
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setEditing(t)}
                          data-no-press
                          className="w-full flex items-center gap-2.5 py-1.5 px-2 -mx-2 rounded-lg text-left hover:bg-bg-elev/60 active:bg-bg-elev transition-colors"
                        >
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: cat?.color ?? 'rgb(var(--border-strong))' }} />
                          <span className="truncate text-[14px] flex-1">{txDescription(t)}</span>
                          {t.is_shared && <Share2 className="w-3.5 h-3.5 text-fg-subtle shrink-0" aria-label="Shared" />}
                          <span className={`stat-num text-[14px] shrink-0 ${Number(t.amount) >= 0 ? 'text-positive' : 'text-fg-muted'}`}>
                            {formatMoney(Number(t.amount), currency)}
                          </span>
                        </button>
                      )
                    })}
                    {row.pending.map((p) => (
                      <button
                        key={`${p.rule_id}-${row.day}`}
                        type="button"
                        onClick={() =>
                          setEditingPending({
                            rule_id: p.rule_id,
                            date: row.date,
                            amount: p.amount,
                            description: p.description,
                            categoryId: p.categoryId,
                          })
                        }
                        data-no-press
                        title="Recurring — editing changes this day only"
                        className="w-full flex items-center gap-2.5 py-1.5 px-2 -mx-2 rounded-lg text-left hover:bg-bg-elev/60 active:bg-bg-elev transition-colors"
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: p.categoryId ? catMap[p.categoryId]?.color ?? 'rgb(var(--border-strong))' : 'rgb(var(--border-strong))' }}
                        />
                        <span className="truncate text-[14px] flex-1">{p.description}</span>
                        <Repeat className="w-3.5 h-3.5 text-fg-subtle shrink-0" aria-label="Recurring" />
                        <span className={`stat-num text-[14px] shrink-0 ${p.amount >= 0 ? 'text-positive' : 'text-fg-muted'}`}>
                          {formatMoney(p.amount, currency)}
                          {p.overridden && (
                            <span className="ml-1.5 text-fg-subtle line-through text-[12px]">
                              {formatMoney(p.originalAmount, currency)}
                            </span>
                          )}
                        </span>
                      </button>
                    ))}
                    <button
                      onClick={() => setAddForDate(row.date)}
                      data-no-press
                      className="flex items-center gap-2.5 py-1.5 px-2 -mx-2 rounded-lg text-[14px] text-fg-muted hover:text-fg hover:bg-bg-elev/60 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add entry
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {editing && (
        <AddTransactionDialog
          open={!!editing}
          onOpenChange={(o) => { if (!o) setEditing(null) }}
          editId={editing.id}
          initialDate={editing.occurred_on}
          initialAmount={Number(editing.amount)}
          initialDescription={editing.description ?? ''}
          initialCategoryId={editing.category_id}
          initialIsShared={editing.is_shared}
          initialRecurringRuleId={editing.recurring_rule_id ?? null}
        />
      )}
      {editingPending && (
        <AddTransactionDialog
          open={!!editingPending}
          onOpenChange={(o) => { if (!o) setEditingPending(null) }}
          initialDate={editingPending.date}
          initialAmount={editingPending.amount}
          initialDescription={editingPending.description}
          initialCategoryId={editingPending.categoryId}
          initialRecurringRuleId={editingPending.rule_id}
        />
      )}
      {addForDate && (
        <AddTransactionDialog
          open={!!addForDate}
          onOpenChange={(o) => { if (!o) setAddForDate(null) }}
          initialDate={addForDate}
        />
      )}

      {/* Floating "Summary" button — sits next to the FAB. Only shows when at
          least one day is selected. The FAB lives in the Layout (right-4),
          so we anchor this button further left to leave room for it. */}
      {selectMode && selectedDays.size > 0 && (
        <button
          type="button"
          onClick={() => setSummaryOpen(true)}
          className="fixed z-40 left-1/2 -translate-x-1/2 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] md:bottom-8 rounded-full px-5 h-12 grid place-items-center bg-fg text-bg font-medium shadow-[0_8px_24px_-6px_rgb(0_0_0/0.35)]"
          aria-label={`Open summary for ${selectedDays.size} selected days`}
          data-no-press
        >
          <span className="inline-flex items-center gap-2 text-sm">
            <ListChecks className="w-5 h-5" />
            Summary · {selectedDays.size}
          </span>
        </button>
      )}

      <Modal
        open={summaryOpen}
        onOpenChange={setSummaryOpen}
        title="Summary"
        description={`${summary.days.length} day${summary.days.length === 1 ? '' : 's'} · ${summary.itemCount} ${summary.itemCount === 1 ? 'entry' : 'entries'}`}
        size="lg"
      >
        <div className="space-y-5">
          {/* Top totals */}
          <div className="grid grid-cols-3 gap-3">
            <div className="card p-3">
              <div className="label">Income</div>
              <div className="stat-num text-lg font-semibold text-positive mt-1">
                +{formatMoney(summary.income, currency)}
              </div>
            </div>
            <div className="card p-3">
              <div className="label">Spending</div>
              <div className="stat-num text-lg font-semibold text-negative mt-1">
                −{formatMoney(summary.expense, currency)}
              </div>
            </div>
            <div className="card p-3">
              <div className="label">Net</div>
              <div className={`stat-num text-lg font-semibold mt-1 ${summary.net >= 0 ? 'text-positive' : 'text-negative'}`}>
                {formatMoney(summary.net, currency)}
              </div>
            </div>
          </div>

          {/* By category */}
          <div>
            <div className="label mb-2">By category</div>
            {summary.categories.length === 0 ? (
              <div className="text-sm text-fg-subtle">No spending in selected days.</div>
            ) : (
              <div className="divide-y divide-border">
                {summary.categories.map((c) => {
                  const pct = summary.expense > 0 ? (c.amount / summary.expense) * 100 : 0
                  return (
                    <div key={c.id} className="py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: c.color ?? 'rgb(var(--fg-subtle))' }}
                          />
                          <span className="text-sm font-medium truncate">{c.name}</span>
                        </div>
                        <span className="stat-num text-sm font-semibold tabular-nums">
                          {formatMoney(c.amount, currency)}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1 rounded-full bg-bg-elev overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: c.color ?? 'rgb(var(--fg-subtle))',
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* All entries */}
          <div>
            <div className="label mb-2">All entries</div>
            {summary.items.length === 0 ? (
              <div className="text-sm text-fg-subtle">Nothing in selected days.</div>
            ) : (
              <div className="divide-y divide-border">
                {summary.items.map((i) => (
                  <div key={i.key} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{i.description}</div>
                      <div className="text-[11px] text-fg-subtle stat-num">{i.date}</div>
                    </div>
                    <div className={`stat-num text-sm ${i.amount >= 0 ? 'text-positive' : 'text-negative'}`}>
                      {formatMoney(i.amount, currency)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  )
}
