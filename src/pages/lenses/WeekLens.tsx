import { useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  useCategories, useMonthlyOpening, useRecurringRules, useSettings, useTransactionsInRange,
} from '@/hooks/queries'
import { formatMoney, isoDate, monthKey } from '@/lib/utils'
import { expandRuleInRange } from '@/lib/recurring'

function addDays(d: Date, n: number) {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  return out
}

/**
 * "Left to spend this week" lens.
 * Uses today + next 6 days. Treats each day's planned expense as a budget,
 * sums (planned − actual)≥0 across the 7-day window.
 */
export function WeekLens() {
  const today = useMemo(() => new Date(), [])
  const start = today
  const end = addDays(today, 6)
  const startIso = isoDate(start)
  const endIso = isoDate(end)
  // Need to load both current and (potentially) next month if window crosses a boundary
  const monthIso = monthKey(today)
  const fromIso = monthIso < startIso ? monthIso : startIso
  // Always cover end of next month for safety:
  const nextMonthEnd = new Date(today.getFullYear(), today.getMonth() + 2, 0)
  const toIso = isoDate(nextMonthEnd)

  const { data: settings } = useSettings()
  const { data: opening } = useMonthlyOpening(monthIso)
  const { data: txs = [] } = useTransactionsInRange(fromIso, toIso)
  const { data: rules = [] } = useRecurringRules()
  const { data: categories = [] } = useCategories()
  const currency = settings?.currency ?? 'CZK'
  const catMap = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories])

  // Build per-day stats over the 7-day window
  const days = useMemo(() => {
    const out: Array<{
      date: string; label: string; isToday: boolean;
      plannedExpense: number; actualExpense: number;
      plannedIncome: number; actualIncome: number;
    }> = []
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i)
      const dIso = isoDate(d)
      let pe = 0, ae = 0, pi = 0, ai = 0
      for (const t of txs) {
        if (t.occurred_on !== dIso) continue
        const amt = Number(t.amount)
        if (amt < 0) {
          pe += -amt
          if (!t.planned) ae += -amt
        } else {
          pi += amt
          if (!t.planned) ai += amt
        }
      }
      // recurring instances
      for (const r of rules) {
        const dates = expandRuleInRange(r, d, d)
        for (const _ of dates) {
          const realised = txs.some((t) => t.recurring_rule_id === r.id && t.occurred_on === dIso)
          if (realised) continue
          if (r.kind === 'income') pi += r.amount
          else pe += r.amount
        }
      }
      out.push({
        date: dIso,
        label: d.toLocaleDateString(undefined, { weekday: 'short' }),
        isToday: dIso === isoDate(today),
        plannedExpense: pe,
        actualExpense: ae,
        plannedIncome: pi,
        actualIncome: ai,
      })
    }
    return out
  }, [txs, rules, start, today])

  const leftToSpendWeek = days.reduce((acc, d) => acc + Math.max(0, d.plannedExpense - d.actualExpense), 0)
  const totalPlannedExpense = days.reduce((a, d) => a + d.plannedExpense, 0)
  const totalActualExpense = days.reduce((a, d) => a + d.actualExpense, 0)

  // Items in window
  const items = useMemo(() => {
    const out: Array<{ key: string; date: string; amount: number; description: string; planned: boolean }> = []
    for (const t of txs) {
      if (t.occurred_on >= startIso && t.occurred_on <= endIso) {
        out.push({
          key: `tx-${t.id}`,
          date: t.occurred_on,
          amount: Number(t.amount),
          description: t.description?.trim() || (t.category_id ? catMap[t.category_id]?.name : null) || 'Untitled',
          planned: t.planned,
        })
      }
    }
    for (const r of rules) {
      const dates = expandRuleInRange(r, start, end)
      for (const dIso of dates) {
        if (txs.some((t) => t.recurring_rule_id === r.id && t.occurred_on === dIso)) continue
        out.push({
          key: `rule-${r.id}-${dIso}`,
          date: dIso,
          amount: r.kind === 'income' ? r.amount : -r.amount,
          description: r.name,
          planned: true,
        })
      }
    }
    return out.sort((a, b) => a.date.localeCompare(b.date))
  }, [txs, rules, startIso, endIso, start, end, catMap])

  const chartData = days.map((d) => ({
    label: d.label,
    planned: Math.round(d.plannedExpense),
    actual: Math.round(d.actualExpense),
  }))

  // Suppress unused-variable warning for opening (chosen to keep the hook for future use)
  void opening

  return (
    <div className="space-y-4 md:space-y-6">
      <header>
        <div className="label">Next 7 days</div>
        <h1 className="text-2xl md:text-3xl font-semibold mt-0.5">{start.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} — {end.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</h1>
      </header>

      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="card p-5 md:p-7"
      >
        <div className="label mb-1">Left to spend this week</div>
        <div className="stat-num font-semibold text-4xl md:text-5xl">
          {formatMoney(leftToSpendWeek, currency)}
        </div>
        <div className="text-xs md:text-sm text-fg-subtle mt-2 stat-num">
          Plan {formatMoney(totalPlannedExpense, currency)} · spent {formatMoney(totalActualExpense, currency)}
        </div>
      </motion.section>

      <section className="card p-4 md:p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="label">Daily plan</div>
            <h2 className="font-semibold mt-0.5">Planned vs spent</h2>
          </div>
          <div className="flex gap-3 text-xs">
            <Legend swatch="bg-accent" label="Planned" />
            <Legend swatch="bg-negative" label="Spent" />
          </div>
        </div>
        <div className="h-48">
          <ResponsiveContainer>
            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="weekPlan" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="weekAct" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgb(var(--negative))" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="rgb(var(--negative))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgb(var(--border))" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" stroke="rgb(var(--fg-subtle))" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="rgb(var(--fg-subtle))" fontSize={11} tickLine={false} axisLine={false} width={60} />
              <Tooltip contentStyle={{ background: 'rgb(var(--bg-card))', border: '1px solid rgb(var(--border))', borderRadius: 12 }} />
              <Area type="monotone" dataKey="planned" stroke="rgb(var(--accent))" strokeWidth={2} fill="url(#weekPlan)" />
              <Area type="monotone" dataKey="actual" stroke="rgb(var(--negative))" strokeWidth={2} fill="url(#weekAct)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="card p-4 md:p-5">
        <div className="label mb-2">Items</div>
        <h2 className="font-semibold mb-3">{items.length} {items.length === 1 ? 'entry' : 'entries'}</h2>
        {items.length === 0 ? (
          <div className="text-sm text-fg-subtle">Nothing planned.</div>
        ) : (
          <div className="divide-y divide-border">
            {items.map((i) => (
              <div key={i.key} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{i.description}</div>
                  <div className="text-xs text-fg-subtle stat-num">{i.date}{i.planned && <span className="ml-2 chip !py-0 !px-1.5 !text-[10px]">planned</span>}</div>
                </div>
                <div className={`stat-num text-sm ${i.amount >= 0 ? 'text-positive' : 'text-negative'}`}>
                  {formatMoney(i.amount, currency)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
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
