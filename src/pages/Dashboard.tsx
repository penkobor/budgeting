import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine,
} from 'recharts'
import { ArrowDownRight, ArrowUpRight, TrendingUp, TrendingDown, Target } from 'lucide-react'
import {
  useCategories, useMonthlyOpening, useRecurringRules, useSettings, useTransactionsInRange, useInsertTransactions,
} from '@/hooks/queries'
import { daysInMonth, formatMoney, isoDate, monthKey } from '@/lib/utils'
import { expandRuleInRange } from '@/lib/recurring'

export function Dashboard() {
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
  const insertTx = useInsertTransactions()

  const catMap = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories])
  const txLabel = (t: { description: string | null; category_id: string | null }) =>
    t.description?.trim() || (t.category_id ? catMap[t.category_id]?.name : null) || 'Untitled'

  const currency = settings?.currency ?? 'CZK'

  // Derive planned occurrences from recurring rules that aren't yet in transactions
  const ruleInstances = useMemo(() => {
    const rangeFrom = new Date(fromIso + 'T00:00:00')
    const rangeTo = new Date(toIso + 'T00:00:00')
    const items: Array<{ rule_id: string; date: string; amount: number; description: string; categoryId: string | null }> = []
    for (const r of rules) {
      const dates = expandRuleInRange(r, rangeFrom, rangeTo)
      for (const d of dates) {
        items.push({
          rule_id: r.id,
          date: d,
          amount: r.kind === 'income' ? r.amount : -r.amount,
          description: r.name,
          categoryId: r.category_id,
        })
      }
    }
    return items
  }, [rules, fromIso, toIso])

  const missingRuleInstances = useMemo(() => {
    const have = new Set(
      txs.filter((t) => t.recurring_rule_id).map((t) => `${t.recurring_rule_id}|${t.occurred_on}`)
    )
    return ruleInstances.filter((i) => !have.has(`${i.rule_id}|${i.date}`))
  }, [ruleInstances, txs])

  // Build daily series: planned (forecast) vs actual
  const series = useMemo(() => {
    const opening0 = opening?.opening_balance ?? 0
    const byDayPlanned: Record<number, number> = {}
    const byDayActual: Record<number, number> = {}
    const byDayIncomePlanned: Record<number, number> = {}
    const byDayIncomeActual: Record<number, number> = {}
    const byDayExpensePlanned: Record<number, number> = {}
    const byDayExpenseActual: Record<number, number> = {}

    for (const t of txs) {
      const d = parseInt(t.occurred_on.slice(8, 10), 10)
      byDayPlanned[d] = (byDayPlanned[d] ?? 0) + Number(t.amount)
      if (!t.planned) byDayActual[d] = (byDayActual[d] ?? 0) + Number(t.amount)
      if (Number(t.amount) > 0) {
        byDayIncomePlanned[d] = (byDayIncomePlanned[d] ?? 0) + Number(t.amount)
        if (!t.planned) byDayIncomeActual[d] = (byDayIncomeActual[d] ?? 0) + Number(t.amount)
      } else {
        byDayExpensePlanned[d] = (byDayExpensePlanned[d] ?? 0) - Number(t.amount)
        if (!t.planned) byDayExpenseActual[d] = (byDayExpenseActual[d] ?? 0) - Number(t.amount)
      }
    }
    // include rule projections as planned-only forecast
    for (const inst of missingRuleInstances) {
      const d = parseInt(inst.date.slice(8, 10), 10)
      byDayPlanned[d] = (byDayPlanned[d] ?? 0) + inst.amount
      if (inst.amount > 0) byDayIncomePlanned[d] = (byDayIncomePlanned[d] ?? 0) + inst.amount
      else byDayExpensePlanned[d] = (byDayExpensePlanned[d] ?? 0) - inst.amount
    }

    const todayDate = today.getDate()
    const sameMonth = cursor.getFullYear() === today.getFullYear() && cursor.getMonth() === today.getMonth()
    const cutoff = sameMonth ? todayDate : lastDay

    const arr: Array<{ day: number; forecast: number; actual: number | null }> = []
    let forecast = opening0
    let actual = opening0
    for (let d = 1; d <= lastDay; d++) {
      forecast += byDayPlanned[d] ?? 0
      if (d <= cutoff) actual += byDayActual[d] ?? 0
      arr.push({
        day: d,
        forecast: Math.round(forecast),
        actual: d <= cutoff ? Math.round(actual) : null,
      })
    }

    const totalIncomePlanned = Object.values(byDayIncomePlanned).reduce((a, b) => a + b, 0)
    const totalIncomeActual = Object.values(byDayIncomeActual).reduce((a, b) => a + b, 0)
    const totalExpensePlanned = Object.values(byDayExpensePlanned).reduce((a, b) => a + b, 0)
    const totalExpenseActual = Object.values(byDayExpenseActual).reduce((a, b) => a + b, 0)

    const projectedEnd = arr[arr.length - 1]?.forecast ?? opening0
    const profit = projectedEnd - opening0
    return {
      arr,
      opening: opening0,
      todayDay: cutoff,
      sameMonth,
      totals: {
        incomePlanned: totalIncomePlanned,
        incomeActual: totalIncomeActual,
        expensePlanned: totalExpensePlanned,
        expenseActual: totalExpenseActual,
        projectedEnd,
        profit,
        currentActual: arr[cutoff - 1]?.actual ?? opening0,
        currentForecast: arr[cutoff - 1]?.forecast ?? opening0,
      },
    }
  }, [txs, missingRuleInstances, opening, cursor, lastDay, today])

  const onTrack = series.totals.currentActual !== null
    ? series.totals.currentActual >= series.totals.currentForecast
    : true
  const drift = series.totals.currentActual - series.totals.currentForecast

  const monthLabel = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const realiseAll = async () => {
    if (missingRuleInstances.length === 0) return
    await insertTx.mutateAsync(missingRuleInstances.map((i) => ({
      occurred_on: i.date,
      amount: i.amount,
      description: i.description,
      category_id: i.categoryId,
      planned: true,
      recurring_rule_id: i.rule_id,
    })))
  }

  return (
    <div className="p-4 md:p-8 space-y-4 md:space-y-6 max-w-7xl mx-auto">
      <header className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <div className="label">Overview</div>
          <h1 className="text-2xl md:text-3xl font-semibold mt-0.5">{monthLabel}</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} className="btn-outline">←</button>
          <button onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))} className="btn-outline">Today</button>
          <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} className="btn-outline">→</button>
        </div>
      </header>

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <Kpi
          label="Current balance"
          value={formatMoney(series.totals.currentActual, currency)}
          sub={series.sameMonth ? `As of day ${series.todayDay}` : 'End of month'}
          tone="default"
        />
        <Kpi
          label="On track?"
          value={onTrack ? 'Yes' : 'Behind'}
          sub={`${drift >= 0 ? '+' : ''}${formatMoney(drift, currency)} vs plan`}
          tone={onTrack ? 'positive' : 'negative'}
          icon={onTrack ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
        />
        <Kpi
          label="Projected end"
          value={formatMoney(series.totals.projectedEnd, currency)}
          sub={`Profit ${formatMoney(series.totals.profit, currency)}`}
          tone={series.totals.profit >= 0 ? 'positive' : 'negative'}
          icon={<Target className="w-4 h-4" />}
        />
        <Kpi
          label="Spent / Earned"
          value={formatMoney(series.totals.expenseActual, currency)}
          sub={`Income ${formatMoney(series.totals.incomeActual, currency)}`}
          tone="default"
        />
      </div>

      {/* Chart */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="card p-4 md:p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="label">Forecast vs actual</div>
            <h2 className="font-semibold mt-0.5">Running balance</h2>
          </div>
          <div className="flex gap-3 text-xs">
            <Legend swatch="bg-accent" label="Forecast" />
            <Legend swatch="bg-positive" label="Actual" />
          </div>
        </div>
        <div className="h-72">
          <ResponsiveContainer>
            <AreaChart data={series.arr} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="forecast" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="actual" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgb(var(--positive))" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="rgb(var(--positive))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgb(var(--border))" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="day" stroke="rgb(var(--fg-subtle))" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="rgb(var(--fg-subtle))" fontSize={11} tickLine={false} axisLine={false} width={70}
                     tickFormatter={(v) => formatMoney(v, currency).replace(/[^\d-]/g, '').slice(0, 6)} />
              <Tooltip content={<ChartTooltip currency={currency} />} />
              <ReferenceLine y={series.opening} stroke="rgb(var(--border-strong))" strokeDasharray="4 4" />
              <Area type="monotone" dataKey="forecast" stroke="rgb(var(--accent))" strokeWidth={2} fill="url(#forecast)" />
              <Area type="monotone" dataKey="actual" stroke="rgb(var(--positive))" strokeWidth={2} fill="url(#actual)" connectNulls={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </motion.section>

      {/* Pending recurring */}
      {missingRuleInstances.length > 0 && (
        <section className="card p-4 md:p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0">
              <div className="label">Upcoming this month</div>
              <h2 className="font-semibold mt-0.5">{missingRuleInstances.length} expected recurring {missingRuleInstances.length === 1 ? 'payment' : 'payments'}</h2>
              <p className="text-xs text-fg-muted mt-1">
                These are recurring rules that haven’t been recorded yet. Tap “Add all to ledger” once they actually happen — each becomes a real transaction in the running balance.
              </p>
            </div>
            <button onClick={realiseAll} disabled={insertTx.isPending} className="btn-primary shrink-0">
              {insertTx.isPending ? 'Adding…' : 'Add all to ledger'}
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {missingRuleInstances.slice(0, 9).map((i) => (
              <div key={`${i.rule_id}-${i.date}`} className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl border border-border bg-bg-elev/50">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{i.description}</div>
                  <div className="text-xs text-fg-subtle stat-num">{i.date}</div>
                </div>
                <div className={`stat-num text-sm ${i.amount >= 0 ? 'text-positive' : 'text-negative'}`}>
                  {formatMoney(i.amount, currency)}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Today’s items */}
      <section className="card p-4 md:p-5">
        <div className="label mb-2">Today &amp; upcoming</div>
        <h2 className="font-semibold mb-3">Next 7 days</h2>
        <UpcomingList
          items={[
            ...txs.map((t) => ({
              date: t.occurred_on, amount: Number(t.amount),
              description: txLabel(t), planned: t.planned, _txId: t.id,
            })),
            ...missingRuleInstances.map((i) => ({
              date: i.date, amount: i.amount, description: i.description, planned: true, _txId: undefined,
            })),
          ]}
          fromIso={isoDate(today)}
          currency={currency}
        />
      </section>
    </div>
  )
}

function Kpi({ label, value, sub, tone = 'default', icon }: {
  label: string; value: string; sub?: string;
  tone?: 'default' | 'positive' | 'negative'; icon?: React.ReactNode
}) {
  const toneClass =
    tone === 'positive' ? 'text-positive' : tone === 'negative' ? 'text-negative' : 'text-fg'
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="card p-3 md:p-4"
    >
      <div className="flex items-center justify-between">
        <div className="label">{label}</div>
        {icon && <span className={toneClass}>{icon}</span>}
      </div>
      <div className={`mt-1.5 md:mt-2 text-xl md:text-2xl font-semibold stat-num ${toneClass}`}>{value}</div>
      {sub && <div className="text-[11px] md:text-xs text-fg-subtle mt-1 stat-num">{sub}</div>}
    </motion.div>
  )
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-fg-muted">
      <span className={`w-2.5 h-2.5 rounded-full ${swatch}`} />
      {label}
    </span>
  )
}

interface ChartTooltipProps {
  active?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[]
  label?: number
  currency: string
}
function ChartTooltip({ active, payload, label, currency }: ChartTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl bg-bg-card/95 backdrop-blur border border-border px-3 py-2 shadow-soft text-xs">
      <div className="font-medium mb-1">Day {label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 stat-num">
          <span className="w-2 h-2 rounded-full" style={{ background: p.stroke }} />
          <span className="capitalize text-fg-muted">{p.dataKey}</span>
          <span className="ml-auto">{formatMoney(p.value ?? 0, currency)}</span>
        </div>
      ))}
    </div>
  )
}

function UpcomingList({ items, fromIso, currency }: {
  items: Array<{ date: string; amount: number; description: string; planned: boolean }>;
  fromIso: string; currency: string
}) {
  const start = new Date(fromIso + 'T00:00:00')
  const end = new Date(start); end.setDate(end.getDate() + 7)
  const filtered = items
    .filter((i) => {
      const d = new Date(i.date + 'T00:00:00')
      return d >= start && d < end
    })
    .sort((a, b) => a.date.localeCompare(b.date))
  if (filtered.length === 0) {
    return <div className="text-sm text-fg-subtle">Nothing scheduled.</div>
  }
  return (
    <div className="divide-y divide-border">
      {filtered.map((i, idx) => (
        <div key={idx} className="flex items-center justify-between gap-3 py-2">
          <div className="min-w-0 flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg grid place-items-center ${i.amount >= 0 ? 'bg-positive/10 text-positive' : 'bg-negative/10 text-negative'}`}>
              {i.amount >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{i.description}</div>
              <div className="text-xs text-fg-subtle stat-num">
                {i.date}{i.planned && <span className="ml-2 chip !py-0 !px-1.5 !text-[10px]">planned</span>}
              </div>
            </div>
          </div>
          <div className={`stat-num text-sm ${i.amount >= 0 ? 'text-positive' : 'text-negative'}`}>
            {formatMoney(i.amount, currency)}
          </div>
        </div>
      ))}
    </div>
  )
}
