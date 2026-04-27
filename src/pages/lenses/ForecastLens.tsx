import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Sliders } from 'lucide-react'
import {
  Area, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine, Line, ComposedChart,
} from 'recharts'
import { useAssets, useMonthlyOpening, useRecurringOverridesInRange, useRecurringRules, useSettings, useTransactionsInRange } from '@/hooks/queries'
import { formatMoney, monthKey } from '@/lib/utils'
import { expandRuleInRange } from '@/lib/recurring'
import { effectiveOccurrenceAmount } from '@/lib/projection'

type Horizon = 1 | 3 | 6 | 12

/**
 * Multi-month forecast based purely on recurring rules + current opening balance.
 * "Scenarios" panel layers a salary delta and an expense % delta on top so the
 * user can ask "what if I get a raise" or "what if I cut spending by 15%".
 */
export function ForecastLens() {
  const [horizon, setHorizon] = useState<Horizon>(6)
  const [salaryDelta, setSalaryDelta] = useState(0)
  const [spendDeltaPct, setSpendDeltaPct] = useState(0)

  const today = useMemo(() => new Date(), [])
  const monthIso = monthKey(today)

  const { data: settings } = useSettings()
  const { data: opening } = useMonthlyOpening(monthIso)
  const { data: rules = [] } = useRecurringRules()
  const currency = settings?.currency ?? 'CZK'

  // Pull every ledger entry within the visible horizon so the forecast
  // reacts to manual edits (additions, deletions, modifications) just like
  // any other lens.
  const horizonStart = useMemo(() => new Date(today.getFullYear(), today.getMonth(), 1), [today])
  const horizonEnd = useMemo(() => new Date(today.getFullYear(), today.getMonth() + horizon, 0), [today, horizon])
  const fromIso = horizonStart.toISOString().slice(0, 10)
  const toIso = horizonEnd.toISOString().slice(0, 10)
  const { data: txs = [] } = useTransactionsInRange(fromIso, toIso)
  const { data: overrides = [] } = useRecurringOverridesInRange(fromIso, toIso)
  const { data: assets = [] } = useAssets()
  const assetBoost = useMemo(
    () => assets.reduce((s, a) => s + (a.include_in_balance ? Number(a.value) : 0), 0),
    [assets],
  )

  // Build month-by-month projection
  const series = useMemo(() => {
    const out: Array<{
      label: string; iso: string;
      baselineBalance: number; scenarioBalance: number;
      monthlyIncome: number; monthlyExpense: number;
    }> = []
    const opening0 = opening?.opening_balance ?? 0
    let baseline = opening0
    let scenario = opening0
    // Pre-bucket transactions by YYYY-MM and a Set of realised rule|date
    // pairs so we don't double-count a recurring rule already entered as a tx.
    const txByMonth: Record<string, typeof txs> = {}
    const realised = new Set<string>()
    for (const t of txs) {
      const ym = t.occurred_on.slice(0, 7)
      ;(txByMonth[ym] ??= []).push(t)
      if (t.recurring_rule_id) realised.add(`${t.recurring_rule_id}|${t.occurred_on}`)
    }
    for (let i = 0; i < horizon; i++) {
      const monthStart = new Date(today.getFullYear(), today.getMonth() + i, 1)
      const monthEnd = new Date(today.getFullYear(), today.getMonth() + i + 1, 0)
      const ym = monthStart.toISOString().slice(0, 7)
      let income = 0, expense = 0
      // 1. Ledger entries (manual + already-materialised recurring) for this month
      for (const t of (txByMonth[ym] ?? [])) {
        const amt = Number(t.amount)
        if (amt > 0) income += amt
        else expense += -amt
      }
      // 2. Recurring rule instances that are NOT yet in the ledger
      for (const r of rules) {
        for (const d of expandRuleInRange(r, monthStart, monthEnd)) {
          if (realised.has(`${r.id}|${d}`)) continue
          const eff = effectiveOccurrenceAmount(r, d, overrides)
          if (eff == null) continue // skipped via override
          if (eff >= 0) income += eff
          else expense += -eff
        }
      }
      const baselineDelta = income - expense
      const scenarioDelta = (income + salaryDelta) - expense * (1 + spendDeltaPct / 100)
      baseline += baselineDelta
      scenario += scenarioDelta
      out.push({
        label: monthStart.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }),
        iso: ym,
        baselineBalance: Math.round(baseline),
        scenarioBalance: Math.round(scenario),
        monthlyIncome: income,
        monthlyExpense: expense,
      })
    }
    return out
  }, [rules, overrides, opening, today, horizon, salaryDelta, spendDeltaPct, txs])

  const last = series[series.length - 1]
  const opening0 = opening?.opening_balance ?? 0
  const scenarioActive = salaryDelta !== 0 || spendDeltaPct !== 0

  return (
    <div className="space-y-4 md:space-y-6">
      <header>
        <div className="label">Forecast</div>
        <h1 className="text-2xl md:text-3xl font-semibold mt-0.5">Where you're heading</h1>
      </header>

      {/* Horizon chips */}
      <div className="flex gap-2 overflow-x-auto -mx-1 px-1">
        {([1, 3, 6, 12] as Horizon[]).map((h) => (
          <button
            key={h}
            onClick={() => setHorizon(h)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${horizon === h ? 'bg-accent text-accent-fg border-accent' : 'border-border text-fg-muted hover:text-fg hover:border-border-strong'}`}
          >
            {h} {h === 1 ? 'month' : 'months'}
          </button>
        ))}
      </div>

      {/* Headline */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="card p-5 md:p-7"
      >
        <div className="label mb-1">Projected balance · {last?.label}</div>
        <div className={`stat-num font-semibold text-3xl md:text-4xl ${(scenarioActive ? (last?.scenarioBalance ?? 0) : (last?.baselineBalance ?? 0)) + assetBoost >= opening0 + assetBoost ? 'text-positive' : 'text-negative'}`}>
          {formatMoney((scenarioActive ? last?.scenarioBalance ?? 0 : last?.baselineBalance ?? 0) + assetBoost, currency)}
        </div>
        <div className="text-xs md:text-sm text-fg-subtle mt-2 stat-num">
          From opening {formatMoney(opening0 + assetBoost, currency)}
          {scenarioActive && (
            <> · baseline {formatMoney((last?.baselineBalance ?? 0) + assetBoost, currency)}</>
          )}
          {assetBoost > 0 && (
            <> · incl. assets {formatMoney(assetBoost, currency)}</>
          )}
        </div>
      </motion.section>

      {/* Chart */}
      <section className="card p-4 md:p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="label">Projection</div>
            <h2 className="font-semibold mt-0.5">Running balance over {horizon} {horizon === 1 ? 'month' : 'months'}</h2>
          </div>
          <div className="flex gap-3 text-xs">
            <Legend swatch="bg-accent" label="Scenario" />
            <Legend swatch="bg-fg-subtle" label="Baseline" />
          </div>
        </div>
        <div className="h-72">
          <ResponsiveContainer>
            <ComposedChart data={series} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="scenarioFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgb(var(--border))" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" stroke="rgb(var(--fg-subtle))" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="rgb(var(--fg-subtle))" fontSize={11} tickLine={false} axisLine={false} width={70}
                     tickFormatter={(v) => formatMoney(v, currency).replace(/[^\d-]/g, '').slice(0, 6)} />
              <Tooltip contentStyle={{ background: 'rgb(var(--bg-card))', border: '1px solid rgb(var(--border))', borderRadius: 12 }} />
              <ReferenceLine y={opening0} stroke="rgb(var(--border-strong))" strokeDasharray="4 4" />
              <Area type="monotone" dataKey="scenarioBalance" name="Scenario" stroke="rgb(var(--accent))" strokeWidth={2} fill="url(#scenarioFill)" />
              <Line type="monotone" dataKey="baselineBalance" name="Baseline" stroke="rgb(var(--fg-subtle))" strokeWidth={1.5} strokeDasharray="5 4" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Scenarios */}
      <section className="card p-4 md:p-5">
        <div className="flex items-center gap-2 mb-3">
          <Sliders className="w-4 h-4 text-accent" />
          <h2 className="font-semibold">Scenarios — what if?</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
          <div>
            <div className="label mb-1.5">Salary delta (per month)</div>
            <input
              className="input stat-num"
              inputMode="decimal"
              placeholder="0"
              value={salaryDelta || ''}
              onChange={(e) => {
                const n = parseFloat(e.target.value.replace(',', '.'))
                setSalaryDelta(Number.isNaN(n) ? 0 : n)
              }}
            />
            <div className="text-[11px] text-fg-subtle mt-1">
              {salaryDelta === 0 ? 'No change.' : `${salaryDelta > 0 ? '+' : ''}${formatMoney(salaryDelta, currency)} added each month.`}
            </div>
          </div>
          <div>
            <div className="label mb-1.5">Spending delta (% of recurring expenses)</div>
            <input
              className="input stat-num"
              inputMode="decimal"
              placeholder="0"
              value={spendDeltaPct || ''}
              onChange={(e) => {
                const n = parseFloat(e.target.value.replace(',', '.'))
                setSpendDeltaPct(Number.isNaN(n) ? 0 : n)
              }}
            />
            <div className="text-[11px] text-fg-subtle mt-1">
              {spendDeltaPct === 0 ? 'No change.' : `Recurring spend ${spendDeltaPct > 0 ? 'up' : 'down'} ${Math.abs(spendDeltaPct)}%.`}
            </div>
          </div>
        </div>
        {scenarioActive && (
          <button
            onClick={() => { setSalaryDelta(0); setSpendDeltaPct(0) }}
            className="btn-ghost mt-3 text-xs"
          >
            Reset to baseline
          </button>
        )}
      </section>

      {/* Per-month breakdown */}
      <section className="card p-4 md:p-5">
        <div className="label mb-2">Month by month</div>
        <h2 className="font-semibold mb-3">Recurring activity</h2>
        <div className="divide-y divide-border">
          {series.map((m) => {
            const net = m.monthlyIncome - m.monthlyExpense
            return (
              <div key={m.iso} className="grid grid-cols-[1fr_auto_auto] gap-3 py-2 items-baseline">
                <div className="text-sm font-medium">{m.label}</div>
                <div className="stat-num text-xs text-fg-subtle">
                  <span className="text-positive">+{formatMoney(m.monthlyIncome, currency)}</span>
                  <span className="mx-1">·</span>
                  <span className="text-negative">−{formatMoney(m.monthlyExpense, currency)}</span>
                </div>
                <div className={`stat-num text-sm ${net >= 0 ? 'text-positive' : 'text-negative'}`}>
                  {net >= 0 ? '+' : ''}{formatMoney(net, currency)}
                </div>
              </div>
            )
          })}
        </div>
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
