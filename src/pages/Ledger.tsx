import { useMemo, useState } from 'react'
import { Check, Pencil, Trash2 } from 'lucide-react'
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

  // Build rows with running balance
  const rows = useMemo(() => {
    const opening0 = opening?.opening_balance ?? 0
    const arr: Array<{
      day: number;
      date: string;
      runningForecast: number;
      runningActual: number | null;
      incomePlanned: number;
      incomeActual: number;
      expensePlanned: number;
      expenseActual: number;
      txs: Transaction[];
      pending: Array<{ rule_id: string; amount: number; description: string; categoryId: string | null }>;
    }> = []
    let forecast = opening0
    let actual = opening0
    const sameMonth = cursor.getFullYear() === today.getFullYear() && cursor.getMonth() === today.getMonth()
    const cutoff = sameMonth ? today.getDate() : lastDay
    for (let d = 1; d <= lastDay; d++) {
      const dayTxs = byDay[d] ?? []
      const dayPending = pendingByDay[d] ?? []
      let dayForecast = 0
      let dayActual = 0
      let incPlan = 0, incAct = 0, expPlan = 0, expAct = 0
      for (const t of dayTxs) {
        const a = Number(t.amount)
        dayForecast += a
        if (!t.planned) dayActual += a
        if (a >= 0) { incPlan += a; if (!t.planned) incAct += a }
        else { expPlan += -a; if (!t.planned) expAct += -a }
      }
      for (const p of dayPending) {
        dayForecast += p.amount
        if (p.amount >= 0) incPlan += p.amount
        else expPlan += -p.amount
      }
      forecast += dayForecast
      if (d <= cutoff) actual += dayActual
      arr.push({
        day: d,
        date: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        runningForecast: Math.round(forecast),
        runningActual: d <= cutoff ? Math.round(actual) : null,
        incomePlanned: incPlan,
        incomeActual: incAct,
        expensePlanned: expPlan,
        expenseActual: expAct,
        txs: dayTxs,
        pending: dayPending,
      })
    }
    return arr
  }, [byDay, pendingByDay, opening, cursor, lastDay, today])

  const monthLabel = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  // Edit dialog state
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [addForDate, setAddForDate] = useState<string | null>(null)

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

  const confirm = async (t: Transaction) => {
    await upsertTx.mutateAsync({
      id: t.id,
      occurred_on: t.occurred_on,
      amount: Number(t.amount),
      description: t.description,
      category_id: t.category_id,
      recurring_rule_id: t.recurring_rule_id,
      planned: false,
      confirmed_at: new Date().toISOString(),
    })
  }

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
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
          const onTrackForDay = row.runningActual !== null && row.runningActual >= row.runningForecast
          return (
            <div
              key={row.day}
              className={`grid md:grid-cols-[60px_140px_1fr_140px_140px] gap-3 px-4 py-3 border-b border-border last:border-b-0 transition-colors ${isToday ? 'bg-accent/5' : 'hover:bg-bg-elev/40'}`}
            >
              <div className="flex items-center">
                <div className={`w-7 h-7 grid place-items-center rounded-lg text-xs font-semibold stat-num ${isToday ? 'bg-accent text-accent-fg' : isPast ? 'bg-bg-elev text-fg-muted' : 'border border-border text-fg-muted'}`}>
                  {row.day}
                </div>
              </div>

              <div className="md:text-right space-y-0.5">
                <div className={`stat-num font-semibold ${row.runningActual !== null ? (onTrackForDay ? 'text-positive' : 'text-negative') : 'text-fg'}`}>
                  {formatMoney(row.runningActual ?? row.runningForecast, currency)}
                </div>
                {row.runningActual !== null && row.runningActual !== row.runningForecast && (
                  <div className="text-[11px] text-fg-subtle stat-num">
                    plan {formatMoney(row.runningForecast, currency)}
                  </div>
                )}
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
                    <span className={`truncate ${t.planned ? 'text-fg-muted italic' : 'text-fg'}`}>{t.description ?? '—'}</span>
                    <span className={`stat-num text-xs ml-1 ${Number(t.amount) >= 0 ? 'text-positive' : 'text-negative'}`}>
                      {formatMoney(Number(t.amount), currency)}
                    </span>
                    <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {t.planned && (
                        <button onClick={() => confirm(t)} title="Mark confirmed" className="btn-ghost !p-1">
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      )}
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
                    <button onClick={() => realisePending(row.date, p)} className="ml-auto chip hover:border-accent hover:text-accent !text-[10px]">
                      generate
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

              <div className="md:text-right stat-num text-sm">
                {row.incomePlanned > 0 ? (
                  <div className="text-positive">{formatMoney(row.incomePlanned, currency)}</div>
                ) : <div className="text-fg-subtle">—</div>}
                {row.incomeActual !== row.incomePlanned && row.incomeActual > 0 && (
                  <div className="text-[11px] text-fg-subtle">act {formatMoney(row.incomeActual, currency)}</div>
                )}
              </div>
              <div className="md:text-right stat-num text-sm">
                {row.expensePlanned > 0 ? (
                  <div className="text-negative">{formatMoney(row.expensePlanned, currency)}</div>
                ) : <div className="text-fg-subtle">—</div>}
                {row.expenseActual !== row.expensePlanned && row.expenseActual > 0 && (
                  <div className="text-[11px] text-fg-subtle">act {formatMoney(row.expenseActual, currency)}</div>
                )}
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
          initialPlanned={editing.planned}
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
