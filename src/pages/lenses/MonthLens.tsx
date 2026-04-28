import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine,
} from 'recharts'
import { ArrowDownRight, ArrowUpRight, Target } from 'lucide-react'
import {
  useAssets, useCategories, useMonthlyOpening, useRecurringOverridesInRange, useRecurringRules, useSettings, useTransactionsInRange,
} from '@/hooks/queries'
import { daysInMonth, formatMoney, isoDate, monthKey } from '@/lib/utils'
import { expandRuleInRange } from '@/lib/recurring'
import { effectiveOccurrenceAmount } from '@/lib/projection'
import { MonthlyGoalCard } from '@/components/MonthlyGoalCard'

export function MonthLens() {
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
  const categories = personalCategories
  const { data: assets = [] } = useAssets()
  const assetBoost = useMemo(
    () => assets.reduce((s, a) => s + (a.include_in_balance ? Number(a.value) : 0), 0),
    [assets],
  )

  const catMap = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories])
  const txLabel = (t: { description: string | null; category_id: string | null }) => {
    const catId = t.category_id
    return t.description?.trim() || (catId ? catMap[catId]?.name : null) || 'Untitled'
  }

  const currency = settings?.currency ?? 'CZK'

  const ruleInstances = useMemo(() => {
    const rangeFrom = new Date(fromIso + 'T00:00:00')
    const rangeTo = new Date(toIso + 'T00:00:00')
    const items: Array<{ rule_id: string; date: string; amount: number; description: string; categoryId: string | null }> = []
    for (const r of rules) {
      const dates = expandRuleInRange(r, rangeFrom, rangeTo)
      for (const d of dates) {
        // Apply per-day overrides (skip / trim) so projected end matches
        // computeProjectedEndBalance after a rebalance is applied.
        const eff = effectiveOccurrenceAmount(r, d, overrides)
        if (eff == null) continue // skipped
        items.push({
          rule_id: r.id,
          date: d,
          amount: eff,
          description: r.name,
          categoryId: r.category_id,
        })
      }
    }
    return items
  }, [rules, overrides, fromIso, toIso])

  const missingRuleInstances = useMemo(() => {
    const have = new Set(
      txs.filter((t) => t.recurring_rule_id).map((t) => `${t.recurring_rule_id}|${t.occurred_on}`)
    )
    return ruleInstances.filter((i) => !have.has(`${i.rule_id}|${i.date}`))
  }, [ruleInstances, txs])

  const series = useMemo(() => {
    const opening0 = opening?.opening_balance ?? 0
    const byDay: Record<number, number> = {}
    const byDayIncome: Record<number, number> = {}
    const byDayExpense: Record<number, number> = {}

    for (const t of txs) {
      const d = parseInt(t.occurred_on.slice(8, 10), 10)
      const amt = Number(t.amount)
      byDay[d] = (byDay[d] ?? 0) + amt
      if (amt > 0) byDayIncome[d] = (byDayIncome[d] ?? 0) + amt
      else byDayExpense[d] = (byDayExpense[d] ?? 0) - amt
    }
    for (const inst of missingRuleInstances) {
      const d = parseInt(inst.date.slice(8, 10), 10)
      byDay[d] = (byDay[d] ?? 0) + inst.amount
      if (inst.amount > 0) byDayIncome[d] = (byDayIncome[d] ?? 0) + inst.amount
      else byDayExpense[d] = (byDayExpense[d] ?? 0) - inst.amount
    }

    const todayDate = today.getDate()
    const sameMonth = cursor.getFullYear() === today.getFullYear() && cursor.getMonth() === today.getMonth()
    const cutoff = sameMonth ? todayDate : lastDay

    const arr: Array<{ day: number; balance: number }> = []
    let running = opening0
    for (let d = 1; d <= lastDay; d++) {
      running += byDay[d] ?? 0
      arr.push({
        day: d,
        balance: Math.round(running),
      })
    }

    const totalIncome = Object.values(byDayIncome).reduce((a, b) => a + b, 0)
    const totalExpense = Object.values(byDayExpense).reduce((a, b) => a + b, 0)

    const projectedEnd = arr[arr.length - 1]?.balance ?? opening0
    const profit = projectedEnd - opening0
    return {
      arr,
      opening: opening0,
      todayDay: cutoff,
      sameMonth,
      totals: {
        income: totalIncome,
        expense: totalExpense,
        net: totalIncome - totalExpense,
        projectedEnd,
        profit,
        currentBalance: arr[cutoff - 1]?.balance ?? opening0,
      },
    }
  }, [txs, missingRuleInstances, opening, cursor, lastDay, today])

  const monthLabel = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  return (
    <div className="space-y-4 md:space-y-6">
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

      <MonthlyGoalCard
        yearMonth={`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`}
        projectedEnd={series.totals.projectedEnd + assetBoost}
        currency={currency}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <Kpi
          label="Current balance"
          value={formatMoney(series.totals.currentBalance + assetBoost, currency)}
          sub={
            assetBoost > 0
              ? `cash ${formatMoney(series.totals.currentBalance, currency)} + assets ${formatMoney(assetBoost, currency)}`
              : series.sameMonth
                ? `As of day ${series.todayDay}`
                : 'End of month'
          }
          tone="default"
        />
        <Kpi
          label="Net"
          value={formatMoney(series.totals.net, currency)}
          sub="Income − expense"
          tone={series.totals.net >= 0 ? 'positive' : 'negative'}
        />
        <Kpi
          label="Projected end"
          value={formatMoney(series.totals.projectedEnd + assetBoost, currency)}
          sub={`Profit ${formatMoney(series.totals.profit, currency)}`}
          tone={series.totals.profit >= 0 ? 'positive' : 'negative'}
          icon={<Target className="w-4 h-4" />}
        />
        <Kpi
          label="Spent / Earned"
          value={formatMoney(series.totals.expense, currency)}
          sub={`Income ${formatMoney(series.totals.income, currency)}`}
          tone="default"
        />
      </div>

      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="card p-4 md:p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="label">Month</div>
            <h2 className="font-semibold mt-0.5">Running balance</h2>
          </div>
          <div className="flex gap-3 text-xs">
            <Legend swatch="bg-accent" label="Balance" />
          </div>
        </div>
        <div className="h-72">
          <ResponsiveContainer>
            <AreaChart data={series.arr} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="balance" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgb(var(--border))" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="day" stroke="rgb(var(--fg-subtle))" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="rgb(var(--fg-subtle))" fontSize={11} tickLine={false} axisLine={false} width={70}
                     tickFormatter={(v) => formatMoney(v, currency).replace(/[^\d-]/g, '').slice(0, 6)} />
              <Tooltip content={<ChartTooltip currency={currency} />} />
              <ReferenceLine y={series.opening} stroke="rgb(var(--border-strong))" strokeDasharray="4 4" />
              <Area type="monotone" dataKey="balance" stroke="rgb(var(--accent))" strokeWidth={2} fill="url(#balance)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </motion.section>

      <section className="card p-4 md:p-5">
        <div className="label mb-2">Today &amp; upcoming</div>
        <h2 className="font-semibold mb-3">Next 7 days</h2>
        <UpcomingList
          items={[
            ...txs.map((t) => ({
              date: t.occurred_on,
              amount: Number(t.amount),
              description: txLabel(t),
              recurring: false,
            })),
            ...missingRuleInstances.map((i) => ({
              date: i.date,
              amount: i.amount,
              description: i.description,
              recurring: true,
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
  const toneClass = tone === 'positive' ? 'text-positive' : tone === 'negative' ? 'text-negative' : 'text-fg'
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
  items: Array<{ date: string; amount: number; description: string; recurring?: boolean }>;
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
              <div className="text-sm font-medium truncate flex items-center gap-2">
                <span className="truncate">{i.description}</span>
                {i.recurring && (
                  <span className="text-[10px] text-fg-subtle uppercase tracking-wider shrink-0">recurring</span>
                )}
              </div>
              <div className="text-xs text-fg-subtle stat-num">{i.date}</div>
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
