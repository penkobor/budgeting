import { useEffect, useMemo, useRef, useState } from 'react'
import { Beer, ChevronRight, ListChecks, Pencil, Square, SquareCheckBig, Trash2, X } from 'lucide-react'
import {
  useCategories, useDeleteTransaction, useMonthlyOpening, useRecurringRules,
  useSettings, useTransactionsInRange, useUpsertTransaction,
} from '@/hooks/queries'
import { daysInMonth, formatMoney, monthKey } from '@/lib/utils'
import { expandRuleInRange } from '@/lib/recurring'
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
  const { data: categories = [] } = useCategories()
  const upsertTx = useUpsertTransaction()
  const deleteTx = useDeleteTransaction()

  const currency = settings?.currency ?? 'CZK'
  const catMap = Object.fromEntries(categories.map((c) => [c.id, c]))

  // Group transactions by day
  const byDay = useMemo(() => {
    const map: Record<number, Transaction[]> = {}
    for (const t of txs) {
      const d = parseInt(t.occurred_on.slice(8, 10), 10)
      ;(map[d] ??= []).push(t)
    }
    return map
  }, [txs])

  // Pending rule instances (forecast only, not yet realised)
  const pendingByDay = useMemo(() => {
    const have = new Set(txs.filter((t) => t.recurring_rule_id).map((t) => `${t.recurring_rule_id}|${t.occurred_on}`))
    const map: Record<number, Array<{ rule_id: string; amount: number; description: string; categoryId: string | null }>> = {}
    const f = new Date(fromIso + 'T00:00:00')
    const tt = new Date(toIso + 'T00:00:00')
    for (const r of rules) {
      for (const d of expandRuleInRange(r, f, tt)) {
        if (have.has(`${r.id}|${d}`)) continue
        const day = parseInt(d.slice(8, 10), 10)
        ;(map[day] ??= []).push({
          rule_id: r.id,
          amount: r.kind === 'income' ? r.amount : -r.amount,
          description: r.name,
          categoryId: r.category_id,
        })
      }
    }
    return map
  }, [rules, txs, fromIso, toIso])

  // Build rows with running balance — we no longer track actual-vs-planned;
  // every transaction is a single 'plan' entry.
  const rows = useMemo(() => {
    const opening0 = opening?.opening_balance ?? 0
    const arr: Array<{
      day: number;
      date: string;
      runningBalance: number;
      income: number;
      expense: number;
      txs: Transaction[];
      pending: Array<{ rule_id: string; amount: number; description: string; categoryId: string | null }>;
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
        items.push({
          key: `tx-${t.id}`,
          date: r.date,
          amount: amt,
          description: t.description?.trim() || (t.category_id ? catMap[t.category_id]?.name : null) || 'Untitled',
          categoryId: t.category_id ?? null,
        })
        if (amt < 0) {
          const k = t.category_id ?? '__uncat__'
          byCat.set(k, (byCat.get(k) ?? 0) + -amt)
        }
      }
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
        name: id === '__uncat__' ? 'Uncategorised' : catMap[id]?.name ?? 'Unknown',
        color: id === '__uncat__' ? null : catMap[id]?.color ?? null,
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

  const realisePending = async (date: string, p: { rule_id: string; amount: number; description: string; categoryId: string | null }) => {
    await upsertTx.mutateAsync({
      occurred_on: date,
      amount: p.amount,
      description: p.description,
      category_id: p.categoryId,
      recurring_rule_id: p.rule_id,
      planned: true,
    })
  }

  return (
    <div className="p-4 md:p-8 space-y-4 md:space-y-6 max-w-7xl mx-auto pb-32">
      <header className="sticky top-0 z-30 -mx-4 md:-mx-8 px-4 md:px-8 py-3 -mt-4 md:-mt-8 mb-2 flex flex-wrap items-center gap-3 justify-between pointer-events-none">
        <div className="pointer-events-auto">
          <div className="label">Ledger</div>
          <h1 className="text-xl md:text-3xl font-semibold mt-0.5">{monthLabel}</h1>
        </div>
        <div className="flex gap-2 items-center pointer-events-auto">
          {selectMode ? (
            <>
              <span className="text-xs text-fg-muted stat-num px-1">
                {selectedDays.size} selected
              </span>
              <button
                onClick={() => { setSelectMode(false); setSelectedDays(new Set()) }}
                className="glass btn"
                title="Exit selection"
              >
                <X className="w-4 h-4" />
                <span className="hidden md:inline">Done</span>
              </button>
            </>
          ) : (
            <button
              onClick={() => setSelectMode(true)}
              className="glass btn"
              title="Select days to summarise"
            >
              <ListChecks className="w-4 h-4" />
              <span className="hidden md:inline">Select</span>
            </button>
          )}
          <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} className="glass btn">←</button>
          <button onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))} className="glass btn">Today</button>
          <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} className="glass btn">→</button>
        </div>
      </header>

      {selectMode && selectedDays.size === 0 && (
        <div className="text-xs text-fg-muted text-center -mt-2">
          Tap any day to add it to the summary.
        </div>
      )}

      <div className="card overflow-hidden">
        {/* Header row */}
        <div className="hidden md:grid grid-cols-[60px_140px_1fr_140px_140px] gap-3 px-4 py-2.5 border-b border-border text-xs label sticky top-[64px] bg-bg-card z-10">
          <div>Day</div>
          <div className="text-right">Balance</div>
          <div>Entries</div>
          <div className="text-right text-positive">Income</div>
          <div className="text-right text-negative">Spending</div>
        </div>

        {rows.map((row) => {
          const isToday = row.date === today.toISOString().slice(0, 10)
          const isPast = new Date(row.date) < new Date(today.toISOString().slice(0, 10))
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
                  <Beer aria-hidden className="absolute -top-1 -right-1 w-3 h-3 text-amber-400 drop-shadow" />
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
                {row.txs.map((t) => (
                  <div key={t.id} className="group flex items-center gap-2 text-sm min-w-0">
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: t.category_id ? catMap[t.category_id]?.color ?? '#888' : '#888' }}
                    />
                    <span className="truncate text-fg">{t.description?.trim() || (t.category_id ? catMap[t.category_id]?.name : null) || 'Untitled'}</span>
                    <span className={`stat-num text-xs ml-1 ${Number(t.amount) >= 0 ? 'text-positive' : 'text-negative'}`}>
                      {formatMoney(Number(t.amount), currency)}
                    </span>
                    <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setEditing(t)} className="btn-ghost !p-1" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => deleteTx.mutate(t.id)} className="btn-ghost !p-1 text-negative" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                ))}
                {row.pending.map((p) => (
                  <div key={`${p.rule_id}-${row.day}`} className="flex items-center gap-2 text-sm min-w-0 text-fg-muted italic">
                    <span className="w-1.5 h-1.5 rounded-full bg-fg-subtle shrink-0" />
                    <span className="truncate">{p.description}</span>
                    <span className={`stat-num text-xs ml-1 ${p.amount >= 0 ? 'text-positive' : 'text-negative'}`}>
                      {formatMoney(p.amount, currency)}
                    </span>
                    <button onClick={() => realisePending(row.date, p)} title="Add this expected recurring entry to the ledger as a real transaction" className="ml-auto chip hover:border-accent hover:text-accent !text-[10px]">
                      add to ledger
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => setAddForDate(row.date)}
                  className="text-[11px] text-fg-subtle hover:text-accent transition-colors"
                >
                  + add entry
                </button>
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
