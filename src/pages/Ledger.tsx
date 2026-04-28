import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, ListChecks, Square, SquareCheckBig, X } from 'lucide-react'
import {
  useCategories, useDeleteTransaction, useMonthlyOpening, useRecurringOverridesInRange, useRecurringRules,
  useSettings, useTransactionsInRange,
} from '@/hooks/queries'
import { daysInMonth, formatMoney, isoDate, monthKey } from '@/lib/utils'
import { expandRuleInRange } from '@/lib/recurring'
import { effectiveOccurrenceAmount } from '@/lib/projection'
import { AddTransactionDialog } from '@/components/AddTransactionDialog'
import { Modal } from '@/components/ui/Modal'
import { RowActions } from '@/components/ui/RowActions'
import { SwipeableRow } from '@/components/ui/SwipeableRow'
import { useConfirm } from '@/components/ui/ConfirmDialog'
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
  const deleteTx = useDeleteTransaction()
  const confirm = useConfirm()

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


  return (
    <div className="p-4 md:p-8 space-y-4 md:space-y-6 max-w-7xl mx-auto pb-32">
      {/* Title: normal flow, scrolls away with content */}
      <div>
        <div className="label">Ledger</div>
        <h1 className="text-title-2 md:text-large-title font-semibold mt-0.5">{monthLabel}</h1>
      </div>

      {/* Floating glass pill toolbar — sticky relative to the page wrapper so
          it stays pinned for the whole scroll range, not just while the title
          is still visible. */}
      <div className="sticky top-[calc(env(safe-area-inset-top)+0.125rem)] md:top-4 z-30 flex justify-end pointer-events-none">
        <div className="flex gap-2 items-center pointer-events-auto">
          {selectMode ? (
            <>
              <span className="glass !rounded-full px-3 h-9 inline-flex items-center text-xs text-fg-muted stat-num">
                {selectedDays.size} selected
              </span>
              <button
                onClick={() => { setSelectMode(false); setSelectedDays(new Set()) }}
                className="glass btn !rounded-full !h-9 !w-9 !p-0 md:!w-auto md:!px-3.5"
                title="Exit selection"
              >
                <X className="w-4 h-4" />
                <span className="hidden md:inline">Done</span>
              </button>
            </>
          ) : (
            <button
              onClick={() => setSelectMode(true)}
              className="glass btn !rounded-full !h-9 !w-9 !p-0 md:!w-auto md:!px-3.5"
              title="Select days to summarise"
            >
              <ListChecks className="w-4 h-4" />
              <span className="hidden md:inline">Select</span>
            </button>
          )}
          <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} className="glass btn !rounded-full !h-9 !w-9 !p-0">←</button>
          <button onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))} className="glass btn !rounded-full !h-9">Today</button>
          <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} className="glass btn !rounded-full !h-9 !w-9 !p-0">→</button>
        </div>
      </div>

      {selectMode && selectedDays.size === 0 && (
        <div className="text-xs text-fg-muted text-center -mt-2">
          Tap any day to add it to the summary.
        </div>
      )}

      <div className="card overflow-hidden">
        {rows.map((row) => {
          // Use the LOCAL date here — today.toISOString().slice(0,10) returns
          // the UTC date, which can disagree with the user's local date right
          // around midnight (e.g. CEST 00:30 → UTC still on the previous day),
          // making yesterday's row light up as "today".
          const todayIso = isoDate(today)
          const isToday = row.date === todayIso
          const isPast = row.date < todayIso
          const dow = new Date(row.date + 'T00:00:00').getDay()
          const isWeekend = dow === 0 || dow === 6
          const expanded = expandedDays.has(row.day)
          const entryCount = row.txs.length + row.pending.length
          const isSelected = selectedDays.has(row.day)
          const bgClass = isSelected
            ? 'bg-accent/10 hover:bg-accent/15'
            : isToday ? 'bg-accent/5' : isWeekend ? 'bg-bg-elev/30 hover:bg-bg-elev/50' : 'hover:bg-bg-elev/40'

          // Reused day-badge cluster (chevron + numbered button, OR checkbox in select mode)
          const DayBadge = (
            <div className="flex items-center gap-1.5">
              {selectMode ? (
                <button
                  type="button"
                  onClick={() => toggleSelect(row.day)}
                  aria-pressed={isSelected}
                  aria-label={isSelected ? 'Deselect day' : 'Select day'}
                  className={`shrink-0 w-6 h-6 grid place-items-center rounded-md transition-colors ${isSelected ? 'bg-accent text-accent-fg' : 'text-fg-subtle hover:text-fg hover:bg-bg-elev'}`}
                >
                  {isSelected ? <SquareCheckBig className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => toggleDay(row.day)}
                  aria-expanded={expanded}
                  aria-label={expanded ? 'Collapse day' : 'Expand day'}
                  className="shrink-0 w-6 h-6 grid place-items-center rounded-md text-fg-subtle hover:text-fg hover:bg-bg-elev transition-colors"
                >
                  <ChevronRight className={`w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                </button>
              )}
              <button
                type="button"
                onClick={() => selectMode ? toggleSelect(row.day) : toggleDay(row.day)}
                className={`relative w-7 h-7 grid place-items-center rounded-lg text-xs font-semibold stat-num transition-transform active:scale-95 ${isSelected ? 'bg-accent text-accent-fg ring-2 ring-accent/40' : isToday ? 'bg-accent text-accent-fg' : isPast ? 'bg-bg-elev text-fg-muted' : 'border border-border text-fg-muted'}`}
                title={selectMode ? (isSelected ? 'Deselect' : 'Select') : (expanded ? 'Collapse' : 'Expand')}
              >
                {row.day}
                {isWeekend && !isToday && !isSelected && (
                  <span
                    aria-hidden
                    className="absolute -top-1.5 -right-1.5 text-[0.625rem] leading-none drop-shadow pointer-events-none"
                    style={{ filter: 'saturate(1.1)' }}
                  >
                    🍻
                  </span>
                )}
              </button>
            </div>
          )

          // Collapsed compact layout — matches design feedback 2
          if (!expanded) {
            return (
              <div
                key={row.day}
                ref={isToday ? todayRowRef : undefined}
                className={`grid grid-cols-[auto_1fr_auto_auto] md:grid-cols-[60px_1fr_120px_120px] gap-3 px-4 py-3 border-b border-border last:border-b-0 transition-colors ${bgClass}`}
              >
                {DayBadge}
                <button
                  type="button"
                  onClick={() => selectMode ? toggleSelect(row.day) : toggleDay(row.day)}
                  className="min-w-0 text-left"
                >
                  <div className={`font-semibold stat-num truncate ${row.runningBalance === 0 ? 'text-fg-muted' : row.runningBalance > 0 ? 'text-fg' : 'text-negative'}`}>
                    {formatMoney(row.runningBalance, currency)}
                  </div>
                  <div className="text-xs text-fg-subtle">
                    {entryCount > 0
                      ? <>{entryCount} {entryCount === 1 ? 'entry' : 'entries'} · tap to expand</>
                      : <span className="hover:text-accent transition-colors">no entries · tap to add</span>}
                  </div>
                </button>
                <div className="text-right stat-num text-sm self-center">
                  {row.income > 0
                    ? <span className="text-positive">+{formatMoney(row.income, currency)}</span>
                    : <span className="text-fg-subtle">—</span>}
                </div>
                <div className="text-right stat-num text-sm self-center">
                  {row.expense > 0
                    ? <span className="text-negative">−{formatMoney(row.expense, currency)}</span>
                    : <span className="text-fg-subtle">—</span>}
                </div>
              </div>
            )
          }

          // Expanded full layout — keeps balance column + per-entry rows
          return (
            <div
              key={row.day}
              ref={isToday ? todayRowRef : undefined}
              className={`grid md:grid-cols-[60px_140px_1fr_140px_140px] gap-3 px-4 py-3 border-b border-border last:border-b-0 transition-colors ${bgClass}`}
            >
              {DayBadge}

              <div className="md:text-right space-y-0.5">
                <div className={`stat-num font-semibold ${row.runningBalance >= 0 ? 'text-fg' : 'text-negative'}`}>
                  {formatMoney(row.runningBalance, currency)}
                </div>
              </div>

              <div className="space-y-1.5 min-w-0">
                {row.txs.length === 0 && row.pending.length === 0 && (
                  <button
                    onClick={() => setAddForDate(row.date)}
                    className="text-xs text-fg-subtle hover:text-accent transition-colors"
                  >
                    + add entry
                  </button>
                )}
                {row.txs.map((t) => {
                  const cat = txCat(t)
                  const editAction = () => setEditing(t)
                  const deleteAction = async () => {
                    const ok = await confirm({
                      title: 'Delete this entry?',
                      description: txDescription(t)
                        ? `“${txDescription(t)}” will be removed permanently.`
                        : 'This entry will be removed permanently.',
                      destructive: true,
                    })
                    if (ok) deleteTx.mutate(t.id)
                  }
                  return (
                    <SwipeableRow
                      key={t.id}
                      onEdit={editAction}
                      onDelete={deleteAction}
                    >
                      <div className="group flex items-center gap-2 text-sm min-w-0 px-1 py-1">
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: cat?.color ?? '#888' }}
                        />
                        <span className="truncate text-fg">{txDescription(t)}</span>
                        {t.is_shared && (
                          <span
                            className="shrink-0 text-[0.625rem] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-accent/10 text-accent"
                            title="Visible on your public share page"
                          >
                            shared
                          </span>
                        )}
                        <span className={`stat-num text-xs ml-1 ${Number(t.amount) >= 0 ? 'text-positive' : 'text-negative'}`}>
                          {formatMoney(Number(t.amount), currency)}
                        </span>
                        <div className="ml-auto hidden md:block">
                          <RowActions onEdit={editAction} onDelete={deleteAction} size="sm" />
                        </div>
                      </div>
                    </SwipeableRow>
                  )
                })}
                {row.pending.map((p) => (
                  <div
                    key={`${p.rule_id}-${row.day}`}
                    className="group flex items-center gap-2 text-sm min-w-0 text-fg-muted"
                    title="From a recurring rule — edit to override for this day only."
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0 ring-1 ring-border"
                      style={{ background: p.categoryId ? catMap[p.categoryId]?.color ?? 'transparent' : 'transparent' }}
                    />
                    <span className="truncate">{p.description}</span>
                    <span className="text-[0.625rem] text-fg-subtle uppercase tracking-wider shrink-0">recurring</span>
                    {p.overridden && (
                      <span
                        className="text-[0.625rem] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-accent/10 text-accent shrink-0"
                        title={`Trimmed from ${formatMoney(p.originalAmount, currency)} via rebalance`}
                      >
                        trimmed
                      </span>
                    )}
                    <span className={`stat-num text-xs ml-1 ${p.amount >= 0 ? 'text-positive' : 'text-negative'}`}>
                      {formatMoney(p.amount, currency)}
                      {p.overridden && (
                        <span className="ml-1 text-fg-subtle line-through text-[0.625rem]">
                          {formatMoney(p.originalAmount, currency)}
                        </span>
                      )}
                    </span>
                    <div className="ml-auto">
                      <RowActions
                        onEdit={() => setEditingPending({
                          rule_id: p.rule_id,
                          date: row.date,
                          amount: p.amount,
                          description: p.description,
                          categoryId: p.categoryId,
                        })}
                        size="sm"
                      />
                    </div>
                  </div>
                ))}
                {(row.txs.length > 0 || row.pending.length > 0) && (
                  <button
                    onClick={() => setAddForDate(row.date)}
                    className="text-[0.6875rem] text-fg-subtle hover:text-accent transition-colors"
                  >
                    + add entry
                  </button>
                )}
              </div>

              <div className="hidden md:block md:text-right stat-num text-sm">
                {row.income > 0 ? (
                  <div className="text-positive">{formatMoney(row.income, currency)}</div>
                ) : <div className="text-fg-subtle">—</div>}
              </div>
              <div className="hidden md:block md:text-right stat-num text-sm">
                {row.expense > 0 ? (
                  <div className="text-negative">{formatMoney(row.expense, currency)}</div>
                ) : <div className="text-fg-subtle">—</div>}
              </div>
            </div>
          )
        })}
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
          className="fixed z-40 right-[5.75rem] bottom-[calc(5rem+env(safe-area-inset-bottom))] md:right-24 md:bottom-6 glass rounded-full px-4 h-14 grid place-items-center text-accent font-medium shadow-soft active:scale-95"
          aria-label={`Open summary for ${selectedDays.size} selected days`}
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
                      <div className="text-[0.6875rem] text-fg-subtle stat-num">{i.date}</div>
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
