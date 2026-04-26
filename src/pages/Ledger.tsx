import { useEffect, useMemo, useRef, useState } from 'react'
import { Beer, ChevronRight, Pencil, Trash2 } from 'lucide-react'
import {
  useCategories, useDeleteTransaction, useMonthlyOpening, useRecurringRules,
  useSettings, useTransactionsInRange, useUpsertTransaction,
} from '@/hooks/queries'
import { daysInMonth, formatMoney, monthKey } from '@/lib/utils'
import { expandRuleInRange } from '@/lib/recurring'
import { AddTransactionDialog } from '@/components/AddTransactionDialog'
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
    <div className="p-4 md:p-8 space-y-4 md:space-y-6 max-w-7xl mx-auto">
      <header className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <div className="label">Ledger</div>
          <h1 className="text-2xl md:text-3xl font-semibold mt-0.5">{monthLabel}</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} className="btn-outline">←</button>
          <button onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))} className="btn-outline">Today</button>
          <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} className="btn-outline">→</button>
        </div>
      </header>

      <div className="card overflow-hidden">
        {/* Header row */}
        <div className="hidden md:grid grid-cols-[60px_140px_1fr_140px_140px] gap-3 px-4 py-2.5 border-b border-border text-xs label sticky top-0 bg-bg-card z-10">
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
          const bgClass = isToday ? 'bg-accent/5' : isWeekend ? 'bg-bg-elev/30 hover:bg-bg-elev/50' : 'hover:bg-bg-elev/40'

          // Reused day-badge cluster (chevron + numbered button)
          const DayBadge = (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => toggleDay(row.day)}
                aria-expanded={expanded}
                aria-label={expanded ? 'Collapse day' : 'Expand day'}
                className="shrink-0 w-6 h-6 grid place-items-center rounded-md text-fg-subtle hover:text-fg hover:bg-bg-elev transition-colors"
              >
                <ChevronRight className={`w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''}`} />
              </button>
              <button
                type="button"
                onClick={() => toggleDay(row.day)}
                className={`relative w-7 h-7 grid place-items-center rounded-lg text-xs font-semibold stat-num transition-transform active:scale-95 ${isToday ? 'bg-accent text-accent-fg' : isPast ? 'bg-bg-elev text-fg-muted' : 'border border-border text-fg-muted'}`}
                title={expanded ? 'Collapse' : 'Expand'}
              >
                {row.day}
                {isWeekend && !isToday && (
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
                  onClick={() => toggleDay(row.day)}
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
    </div>
  )
}
