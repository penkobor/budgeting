import { useState } from 'react'
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight } from 'lucide-react'
import { useCategories, useDeleteRule, useRecurringRules, useUpsertRule } from '@/hooks/queries'
import { useSettings } from '@/hooks/queries'
import { Modal } from '@/components/ui/Modal'
import { describeRule } from '@/lib/recurring'
import { formatMoney, isoDate } from '@/lib/utils'
import type { RecurringRule } from '@/lib/db.types'

export function RecurringPage() {
  const { data: rules = [] } = useRecurringRules()
  const { data: settings } = useSettings()
  const upsert = useUpsertRule()
  const del = useDeleteRule()
  const currency = settings?.currency ?? 'CZK'

  const [editing, setEditing] = useState<RecurringRule | null>(null)
  const [adding, setAdding] = useState(false)

  return (
    <div className="p-4 md:p-8 space-y-4 md:space-y-6 max-w-5xl mx-auto">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="label">Fixed payments</div>
          <h1 className="text-2xl md:text-3xl font-semibold mt-0.5">Recurring rules</h1>
          <p className="text-xs md:text-sm text-fg-muted mt-1.5 max-w-prose">
            Templates for payments and income that repeat — rent, subscriptions, salary. They appear in your forecast automatically; tap <span className="text-fg font-medium">Add to ledger</span> in the Dashboard or Ledger to record them as actual transactions when they happen.
          </p>
        </div>
        <button onClick={() => setAdding(true)} className="btn-primary shrink-0"><Plus className="w-4 h-4" /> Add rule</button>
      </header>

      <div className="card divide-y divide-border">
        {rules.length === 0 && (
          <div className="p-8 text-center text-sm text-fg-muted">
            No recurring rules yet. Add one to auto-fill your monthly fixed payments.
          </div>
        )}
        {rules.map((r) => (
          <div key={r.id} className="flex items-center gap-3 p-4">
            <button
              onClick={() => upsert.mutate({ ...r, active: !r.active })}
              className={`shrink-0 ${r.active ? 'text-positive' : 'text-fg-subtle'}`}
              title={r.active ? 'Active' : 'Paused'}
            >
              {r.active ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
            </button>
            <div className="min-w-0 flex-1">
              <div className="font-medium truncate">{r.name}</div>
              <div className="text-xs text-fg-subtle">{describeRule(r)}</div>
            </div>
            <div className={`stat-num font-semibold ${r.kind === 'income' ? 'text-positive' : 'text-negative'}`}>
              {r.kind === 'income' ? '+' : '−'}{formatMoney(r.amount, currency)}
            </div>
            <div className="flex gap-1">
              <button onClick={() => setEditing(r)} className="btn-ghost !p-2"><Pencil className="w-4 h-4" /></button>
              <button onClick={() => { if (confirm('Delete this rule?')) del.mutate(r.id) }} className="btn-ghost !p-2 text-negative"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        ))}
      </div>

      {(adding || editing) && (
        <RuleForm
          rule={editing}
          open={adding || !!editing}
          onClose={() => { setAdding(false); setEditing(null) }}
        />
      )}
    </div>
  )
}

function RuleForm({ rule, open, onClose }: { rule: RecurringRule | null; open: boolean; onClose: () => void }) {
  const upsert = useUpsertRule()
  const { data: categories = [] } = useCategories()

  const [name, setName] = useState(rule?.name ?? '')
  const [amount, setAmount] = useState(String(rule?.amount ?? ''))
  const [kind, setKind] = useState<'income' | 'expense'>(rule?.kind === 'income' ? 'income' : 'expense')
  const [frequency, setFrequency] = useState<RecurringRule['frequency']>(rule?.frequency ?? 'monthly')
  const [dayOfMonth, setDayOfMonth] = useState(String(rule?.day_of_month ?? new Date().getDate()))
  const [dayOfWeek, setDayOfWeek] = useState(String(rule?.day_of_week ?? 1))
  const [monthOfYear, setMonthOfYear] = useState(String(rule?.month_of_year ?? 1))
  const [intervalDays, setIntervalDays] = useState(String(rule?.interval_days ?? 7))
  const [categoryId, setCategoryId] = useState(rule?.category_id ?? '')
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
      category_id: categoryId || null,
      starts_on: startsOn,
      active: rule?.active ?? true,
    })
    onClose()
  }

  const cats = categories.filter((c) => c.kind === kind)

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
