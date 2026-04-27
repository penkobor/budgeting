import { useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight } from 'lucide-react'
import {
  useCategories,
  useDeleteRule,
  useRecurringRules,
  useUpcomingRecurringOverrides,
  useUpsertRule,
} from '@/hooks/queries'
import { useSettings } from '@/hooks/queries'
import { useSpace, useSpaceCategories } from '@/hooks/spaces'
import { useUi } from '@/store/ui'
import { Modal } from '@/components/ui/Modal'
import { describeRule, expandRuleInRange } from '@/lib/recurring'
import { formatMoney, isoDate } from '@/lib/utils'
import type { RecurringRule } from '@/lib/db.types'

export function RecurringPage() {
  const currentSpaceId = useUi((s) => s.currentSpaceId)
  const spaceOpts = currentSpaceId ? { spaceId: currentSpaceId } : undefined
  const { data: rules = [] } = useRecurringRules(spaceOpts)
  const { data: settings } = useSettings()
  const { data: upcomingOverrides = [] } = useUpcomingRecurringOverrides()
  const { data: space } = useSpace(currentSpaceId)
  const upsert = useUpsertRule()
  const del = useDeleteRule()
  const currency = settings?.currency ?? 'CZK'

  // Group upcoming overrides by rule id for the trim-count badge.
  const overridesByRule = useMemo(() => {
    const map: Record<string, { trimmed: number; skipped: number }> = {}
    for (const o of upcomingOverrides) {
      const slot = (map[o.recurring_rule_id] ??= { trimmed: 0, skipped: 0 })
      if (o.skipped) slot.skipped += 1
      else slot.trimmed += 1
    }
    return map
  }, [upcomingOverrides])

  const [editing, setEditing] = useState<RecurringRule | null>(null)
  const [adding, setAdding] = useState(false)

  // Per-rule monthly add-up: expand into a representative 30-day window starting today
  // (avoids edge effects of varying month lengths and gives a stable “per month” figure).
  const monthlyByRule = useMemo(() => {
    const today = new Date()
    const from = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const to = new Date(from); to.setDate(to.getDate() + 29)
    const map: Record<string, { count: number; total: number }> = {}
    for (const r of rules) {
      const occurrences = expandRuleInRange(r, from, to).length
      map[r.id] = { count: occurrences, total: occurrences * r.amount }
    }
    return map
  }, [rules])

  const totals = useMemo(() => {
    let income = 0, expense = 0
    for (const r of rules) {
      if (!r.active) continue
      const v = monthlyByRule[r.id]?.total ?? 0
      if (r.kind === 'income') income += v
      else expense += v
    }
    return { income, expense, net: income - expense }
  }, [rules, monthlyByRule])

  return (
    <div className="p-4 md:p-8 space-y-4 md:space-y-6 max-w-5xl mx-auto">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="label">Fixed payments</div>
          <h1 className="text-2xl md:text-3xl font-semibold mt-0.5">
            Recurring rules{currentSpaceId && space ? <span className="text-fg-muted"> · {space.name}</span> : null}
          </h1>
          <p className="text-xs md:text-sm text-fg-muted mt-1.5 max-w-prose">
            {currentSpaceId
              ? `Shared rules for ${space?.name ?? 'this space'} — visible to every member and folded into the joint ledger automatically.`
              : 'Templates for payments and income that repeat — rent, subscriptions, salary. They flow into your forecast and the running balance automatically.'}
          </p>
        </div>
        <button onClick={() => setAdding(true)} className="btn-primary shrink-0"><Plus className="w-4 h-4" /> Add rule</button>
      </header>

      <div className="card divide-y divide-border">
        {rules.length === 0 && (
          <div className="p-8 text-center text-sm text-fg-muted">
            {currentSpaceId
              ? `No shared recurring rules in ${space?.name ?? 'this space'} yet. Add one to track joint subscriptions or repeating bills.`
              : 'No recurring rules yet. Add one to auto-fill your monthly fixed payments.'}
          </div>
        )}
        {rules.map((r) => {
          const monthly = monthlyByRule[r.id]
          const trimInfo = overridesByRule[r.id]
          return (
          <div key={r.id} className="flex items-center gap-3 p-4">
            <button
              onClick={() => upsert.mutate({ ...r, active: !r.active })}
              className={`shrink-0 ${r.active ? 'text-positive' : 'text-fg-subtle'}`}
              title={r.active ? 'Active' : 'Paused'}
            >
              {r.active ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
            </button>
            <div className="min-w-0 flex-1">
              <div className="font-medium truncate flex items-center gap-2">
                <span className="truncate">{r.name}</span>
                {trimInfo && (trimInfo.trimmed + trimInfo.skipped) > 0 && (
                  <span
                    className="shrink-0 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-accent/10 text-accent"
                    title={`${trimInfo.trimmed} trimmed, ${trimInfo.skipped} skipped (upcoming overrides from rebalance)`}
                  >
                    {trimInfo.skipped > 0 && trimInfo.trimmed === 0
                      ? `${trimInfo.skipped}× skipped`
                      : trimInfo.trimmed > 0 && trimInfo.skipped === 0
                        ? `${trimInfo.trimmed}× trimmed`
                        : `${trimInfo.trimmed + trimInfo.skipped}× adjusted`}
                  </span>
                )}
              </div>
              <div className="text-xs text-fg-subtle">
                {describeRule(r)}
                {monthly && monthly.count > 1 && (
                  <span className="ml-2 text-fg-muted">
                    · adds up to {formatMoney(monthly.total, currency)} / month
                    <span className="text-fg-subtle"> ({monthly.count}×)</span>
                  </span>
                )}
                {monthly && monthly.count <= 1 && r.frequency !== 'monthly' && r.frequency !== 'yearly' && (
                  <span className="ml-2 text-fg-muted">· ~{formatMoney(monthly.total, currency)} / month</span>
                )}
              </div>
            </div>
            <div className={`stat-num font-semibold ${r.kind === 'income' ? 'text-positive' : 'text-negative'}`}>
              {r.kind === 'income' ? '+' : '−'}{formatMoney(r.amount, currency)}
            </div>
            <div className="flex gap-1">
              <button onClick={() => setEditing(r)} className="btn-ghost !p-2"><Pencil className="w-4 h-4" /></button>
              <button onClick={() => { if (confirm('Delete this rule?')) del.mutate(r.id) }} className="btn-ghost !p-2 text-negative"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
          )
        })}
      </div>

      {rules.length > 0 && (
        <div className="card p-4 grid grid-cols-3 gap-3 text-sm">
          <div>
            <div className="label">Income / mo</div>
            <div className="stat-num font-semibold text-positive mt-0.5">+{formatMoney(totals.income, currency)}</div>
          </div>
          <div>
            <div className="label">Expense / mo</div>
            <div className="stat-num font-semibold text-negative mt-0.5">−{formatMoney(totals.expense, currency)}</div>
          </div>
          <div>
            <div className="label">Net / mo</div>
            <div className={`stat-num font-semibold mt-0.5 ${totals.net >= 0 ? 'text-positive' : 'text-negative'}`}>
              {totals.net >= 0 ? '+' : ''}{formatMoney(totals.net, currency)}
            </div>
          </div>
        </div>
      )}

      {(adding || editing) && (
        <RuleForm
          rule={editing}
          spaceId={currentSpaceId}
          open={adding || !!editing}
          onClose={() => { setAdding(false); setEditing(null) }}
        />
      )}
    </div>
  )
}

function RuleForm({ rule, spaceId, open, onClose }: { rule: RecurringRule | null; spaceId: string | null; open: boolean; onClose: () => void }) {
  const upsert = useUpsertRule()
  const { data: personalCategories = [] } = useCategories()
  const { data: spaceCategories = [] } = useSpaceCategories(spaceId)

  const [name, setName] = useState(rule?.name ?? '')
  const [amount, setAmount] = useState(String(rule?.amount ?? ''))
  const [kind, setKind] = useState<'income' | 'expense'>(rule?.kind === 'income' ? 'income' : 'expense')
  const [frequency, setFrequency] = useState<RecurringRule['frequency']>(rule?.frequency ?? 'monthly')
  const [dayOfMonth, setDayOfMonth] = useState(String(rule?.day_of_month ?? new Date().getDate()))
  const [dayOfWeek, setDayOfWeek] = useState(String(rule?.day_of_week ?? 1))
  const [monthOfYear, setMonthOfYear] = useState(String(rule?.month_of_year ?? 1))
  const [intervalDays, setIntervalDays] = useState(String(rule?.interval_days ?? 7))
  const [categoryId, setCategoryId] = useState(
    (spaceId ? rule?.space_category_id : rule?.category_id) ?? '',
  )
  const [startsOn, setStartsOn] = useState(rule?.starts_on ?? isoDate(new Date()))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const a = parseFloat(amount.replace(',', '.'))
    if (!name || Number.isNaN(a) || a <= 0) return
    await upsert.mutateAsync({
      id: rule?.id,
      name,
      amount: a,
      kind,
      frequency,
      day_of_month: frequency === 'monthly' || frequency === 'yearly' ? parseInt(dayOfMonth, 10) : null,
      day_of_week: frequency === 'weekly' ? parseInt(dayOfWeek, 10) : null,
      month_of_year: frequency === 'yearly' ? parseInt(monthOfYear, 10) : null,
      interval_days: frequency === 'custom' ? parseInt(intervalDays, 10) : null,
      // CHECK constraint: (space_id IS NULL) = (space_category_id IS NULL).
      // category_id is mutually exclusive with the space columns.
      category_id: spaceId ? null : (categoryId || null),
      space_id: spaceId,
      space_category_id: spaceId ? (categoryId || null) : null,
      starts_on: startsOn,
      active: rule?.active ?? true,
    })
    onClose()
  }

  const cats = spaceId
    ? spaceCategories
    : personalCategories.filter((c) => c.kind === kind)

  return (
    <Modal
      open={open}
      onOpenChange={(o) => { if (!o) onClose() }}
      title={rule ? 'Edit rule' : 'New recurring rule'}
      size="md"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button type="submit" form="rule-form" className="btn-primary" disabled={upsert.isPending}>
            {upsert.isPending ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <form id="rule-form" onSubmit={submit} className="space-y-4">
        <div className="flex gap-2">
          <button type="button" onClick={() => setKind('expense')} className={`btn flex-1 ${kind === 'expense' ? 'bg-negative/10 text-negative border border-negative/30' : 'btn-outline'}`}>Expense</button>
          <button type="button" onClick={() => setKind('income')} className={`btn flex-1 ${kind === 'income' ? 'bg-positive/10 text-positive border border-positive/30' : 'btn-outline'}`}>Income</button>
        </div>

        <div>
          <div className="label mb-1.5">Name</div>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="label mb-1.5">Amount</div>
            <input className="input stat-num" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <div>
            <div className="label mb-1.5">Category</div>
            <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">— none —</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        <div>
          <div className="label mb-1.5">Repeats</div>
          <select className="input" value={frequency} onChange={(e) => setFrequency(e.target.value as RecurringRule['frequency'])}>
            <option value="monthly">Monthly</option>
            <option value="weekly">Weekly</option>
            <option value="yearly">Yearly</option>
            <option value="custom">Every N days</option>
          </select>
        </div>

        {frequency === 'monthly' && (
          <div>
            <div className="label mb-1.5">Day of month (1–31)</div>
            <input type="number" min={1} max={31} className="input stat-num" value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} />
          </div>
        )}
        {frequency === 'weekly' && (
          <div>
            <div className="label mb-1.5">Day of week</div>
            <div className="grid grid-cols-7 gap-1.5">
              {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((label, i) => {
                const active = parseInt(dayOfWeek, 10) === i
                const isWeekend = i === 0 || i === 6
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setDayOfWeek(String(i))}
                    className={`py-2 rounded-lg text-xs font-medium border transition-colors ${active ? 'bg-accent text-accent-fg border-accent' : isWeekend ? 'border-border text-amber-400 hover:border-border-strong' : 'border-border text-fg-muted hover:text-fg hover:border-border-strong'}`}
                  >
                    {label.slice(0, 1)}
                  </button>
                )
              })}
            </div>
            <div className="text-[11px] text-fg-subtle mt-1.5">
              Repeats every {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][parseInt(dayOfWeek, 10)] ?? 'Monday'}.
            </div>
          </div>
        )}
        {frequency === 'yearly' && (
          <div className="grid grid-cols-2 gap-3">
            <div><div className="label mb-1.5">Month</div>
              <input type="number" min={1} max={12} className="input stat-num" value={monthOfYear} onChange={(e) => setMonthOfYear(e.target.value)} /></div>
            <div><div className="label mb-1.5">Day</div>
              <input type="number" min={1} max={31} className="input stat-num" value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} /></div>
          </div>
        )}
        {frequency === 'custom' && (
          <div>
            <div className="label mb-1.5">Every N days</div>
            <input type="number" min={1} className="input stat-num" value={intervalDays} onChange={(e) => setIntervalDays(e.target.value)} />
          </div>
        )}

        <div>
          <div className="label mb-1.5">Starts on</div>
          <input type="date" className="input stat-num" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
        </div>
      </form>
    </Modal>
  )
}
