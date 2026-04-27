import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  useCategories, useMonthlyOpening, useRecurringOverridesInRange, useRecurringRules, useSettings, useTransactionsInRange,
} from '@/hooks/queries'
import { useSpaceCategories } from '@/hooks/spaces'
import { useUi } from '@/store/ui'
import { formatMoney, isoDate, monthKey } from '@/lib/utils'
import { expandRuleInRange } from '@/lib/recurring'
import { effectiveOccurrenceAmount } from '@/lib/projection'

function addDays(d: Date, n: number) {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  return out
}

/** Monday of the calendar week containing `d` (locale-independent). */
function startOfWeekMon(d: Date) {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  // JS getDay(): Sun=0, Mon=1 … Sat=6. Mondays as week-start: 0..6 → 6,0,1,2,3,4,5
  const offset = (out.getDay() + 6) % 7
  out.setDate(out.getDate() - offset)
  return out
}

/**
 * "Planned this week" lens — Monday-aligned 7-day window. Use the chevrons to
 * flip between calendar weeks and check upcoming category spend (mirrors the
 * user's bank sub-accounts).
 */
export function WeekLens() {
  const currentSpaceId = useUi((s) => s.currentSpaceId)
  const spaceOpts = currentSpaceId ? { spaceId: currentSpaceId } : undefined
  const [weekOffset, setWeekOffset] = useState(0)
  const today = useMemo(() => new Date(), [])
  const start = useMemo(() => addDays(startOfWeekMon(today), weekOffset * 7), [today, weekOffset])
  const end = useMemo(() => addDays(start, 6), [start])
  const startIso = isoDate(start)
  const endIso = isoDate(end)
  const monthIso = monthKey(today)
  // Always pull a wide enough range that the month-opening anchor + the active
  // week window are both covered — ledger entries before today still need to
  // be reflected so the chart matches the rest of the app.
  const fromIso = monthIso < startIso ? monthIso : startIso
  const nextMonthEnd = new Date(start.getFullYear(), start.getMonth() + 2, 0)
  const toIso = endIso > isoDate(nextMonthEnd) ? endIso : isoDate(nextMonthEnd)

  const { data: settings } = useSettings()
  const { data: opening } = useMonthlyOpening(monthIso)
  const { data: txs = [] } = useTransactionsInRange(fromIso, toIso, spaceOpts)
  const { data: rules = [] } = useRecurringRules(spaceOpts)
  const { data: overrides = [] } = useRecurringOverridesInRange(fromIso, toIso)
  const { data: personalCategories = [] } = useCategories()
  const { data: spaceCategories = [] } = useSpaceCategories(currentSpaceId)
  const categories = currentSpaceId ? spaceCategories : personalCategories
  const currency = settings?.currency ?? 'CZK'
  const catMap = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c])),
    [categories],
  )

  // Build the canonical list of items in the [start, end] window. Mirrors
  // the Ledger: manual ledger entries + recurring-rule instances (the rule
  // contributes a default occurrence per day, deduped against any manual
  // override that links back via recurring_rule_id).
  const items = useMemo(() => {
    const out: Array<{ key: string; date: string; amount: number; description: string; categoryId: string | null; recurring: boolean; originalAmount?: number; overridden?: boolean }> = []
    for (const t of txs) {
      if (t.occurred_on >= startIso && t.occurred_on <= endIso) {
        const catId = currentSpaceId ? t.space_category_id : t.category_id
        out.push({
          key: `tx-${t.id}`,
          date: t.occurred_on,
          amount: Number(t.amount),
          description: t.description?.trim() || (catId ? catMap[catId]?.name : null) || 'Untitled',
          categoryId: catId ?? null,
          recurring: false,
        })
      }
    }
    for (const r of rules) {
      const dates = expandRuleInRange(r, start, end)
      for (const dIso of dates) {
        if (txs.some((t) => t.recurring_rule_id === r.id && t.occurred_on === dIso)) continue
        const eff = effectiveOccurrenceAmount(r, dIso, overrides)
        if (eff == null) continue
        const original = r.kind === 'income' ? r.amount : -r.amount
        out.push({
          key: `rule-${r.id}-${dIso}`,
          date: dIso,
          amount: eff,
          description: r.name,
          categoryId: (currentSpaceId ? r.space_category_id : r.category_id) ?? null,
          recurring: true,
          originalAmount: original,
          overridden: Math.abs(eff - original) > 0.005,
        })
      }
    }
    return out.sort((a, b) => a.date.localeCompare(b.date))
  }, [txs, rules, overrides, startIso, endIso, start, end, catMap, currentSpaceId])

  // Per-day totals (derived from the same items list)
  const days = useMemo(() => {
    const out: Array<{
      date: string; label: string; isToday: boolean;
      expense: number; income: number;
    }> = []
    const todayIso = isoDate(today)
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i)
      const dIso = isoDate(d)
      let expense = 0, income = 0
      for (const it of items) {
        if (it.date !== dIso) continue
        if (it.amount < 0) expense += -it.amount
        else income += it.amount
      }
      out.push({
        date: dIso,
        label: d.toLocaleDateString(undefined, { weekday: 'short' }),
        isToday: dIso === todayIso,
        expense,
        income,
      })
    }
    return out
  }, [items, start, today])

  const totalExpense = days.reduce((a, d) => a + d.expense, 0)
  const totalIncome = days.reduce((a, d) => a + d.income, 0)

  // Category breakdown (expenses only — mirrors how the user funds bank sub-accounts)
  const byCategory = useMemo(() => {
    const totals = new Map<string, number>()
    for (const it of items) {
      if (it.amount >= 0) continue
      const key = it.categoryId ?? '__uncategorised__'
      totals.set(key, (totals.get(key) ?? 0) + -it.amount)
    }
    return Array.from(totals.entries())
      .map(([id, amount]) => ({
        id,
        name: id === '__uncategorised__' ? 'Uncategorised' : catMap[id]?.name ?? 'Unknown',
        color: id === '__uncategorised__' ? null : catMap[id]?.color ?? null,
        amount,
      }))
      .sort((a, b) => b.amount - a.amount)
  }, [items, catMap])

  const chartData = days.map((d) => ({
    label: d.label,
    expense: Math.round(d.expense),
  }))

  // Header label: "This week" / "Next week" / "Last week" / "+N weeks" / "−N weeks"
  const offsetLabel =
    weekOffset === 0 ? 'This week' :
    weekOffset === 1 ? 'Next week' :
    weekOffset === -1 ? 'Last week' :
    weekOffset > 0 ? `+${weekOffset} weeks` : `${weekOffset} weeks`

  // Suppress unused-variable warning for opening (chosen to keep the hook for future use)
  void opening

  return (
    <div className="space-y-4 md:space-y-6">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="label">{offsetLabel}</div>
          <h1 className="text-2xl md:text-3xl font-semibold mt-0.5 truncate">
            {start.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} — {end.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
          </h1>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setWeekOffset((w) => w - 1)}
            className="btn-outline w-9 h-9 px-0 grid place-items-center"
            aria-label="Previous week"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          {weekOffset !== 0 && (
            <button
              type="button"
              onClick={() => setWeekOffset(0)}
              className="btn-outline text-xs px-2.5"
            >
              Today
            </button>
          )}
          <button
            type="button"
            onClick={() => setWeekOffset((w) => w + 1)}
            className="btn-outline w-9 h-9 px-0 grid place-items-center"
            aria-label="Next week"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </header>

      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="card p-5 md:p-7"
      >
        <div className="label mb-1">Planned</div>
        <div className="stat-num font-semibold text-4xl md:text-5xl">
          {formatMoney(totalExpense, currency)}
        </div>
        <div className="text-xs md:text-sm text-fg-subtle mt-2 stat-num">
          Income {formatMoney(totalIncome, currency)} · Net {formatMoney(totalIncome - totalExpense, currency)}
        </div>
      </motion.section>

      <section className="card p-4 md:p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="label">Daily plan</div>
            <h2 className="font-semibold mt-0.5">Expense by day</h2>
          </div>
          <div className="flex gap-3 text-xs">
            <Legend swatch="bg-negative" label="Expense" />
          </div>
        </div>
        <div className="h-48">
          <ResponsiveContainer>
            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="weekExp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgb(var(--negative))" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="rgb(var(--negative))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgb(var(--border))" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" stroke="rgb(var(--fg-subtle))" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="rgb(var(--fg-subtle))" fontSize={11} tickLine={false} axisLine={false} width={60} />
              <Tooltip contentStyle={{ background: 'rgb(var(--bg-card))', border: '1px solid rgb(var(--border))', borderRadius: 12 }} />
              <Area type="monotone" dataKey="expense" stroke="rgb(var(--negative))" strokeWidth={2} fill="url(#weekExp)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* By category — sub-account funding helper */}
      <section className="card p-4 md:p-5">
        <div className="label mb-1">By category</div>
        <h2 className="font-semibold mb-3">Fund your sub-accounts</h2>
        {byCategory.length === 0 ? (
          <div className="text-sm text-fg-subtle">No expenses planned this week.</div>
        ) : (
          <div className="divide-y divide-border">
            {byCategory.map((c) => {
              const pct = totalExpense > 0 ? (c.amount / totalExpense) * 100 : 0
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
                  <div className="text-sm font-medium truncate flex items-center gap-2">
                    <span className="truncate">{i.description}</span>
                    {i.recurring && (
                      <span className="text-[10px] text-fg-subtle uppercase tracking-wider shrink-0">recurring</span>
                    )}
                    {i.recurring && i.overridden && (
                      <span
                        className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-accent/10 text-accent shrink-0"
                        title={`Trimmed from ${formatMoney(i.originalAmount ?? 0, currency)} via rebalance`}
                      >
                        trimmed
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-fg-subtle stat-num">
                    {i.date}
                    {i.recurring && i.overridden && (
                      <>
                        {' · was '}
                        <span className="line-through">{formatMoney(i.originalAmount ?? 0, currency)}</span>
                      </>
                    )}
                  </div>
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
