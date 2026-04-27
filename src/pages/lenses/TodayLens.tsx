import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  Wallet,
} from 'lucide-react'
import {
  useCategories,
  useDeleteTransaction,
  useMonthlyOpening,
  useRecurringRules,
  useSettings,
  useTransactionsInRange,
} from '@/hooks/queries'
import { formatMoney, isoDate, monthKey, daysInMonth } from '@/lib/utils'
import { expandRuleInRange } from '@/lib/recurring'
import { AddTransactionDialog } from '@/components/AddTransactionDialog'
import type { Transaction } from '@/lib/db.types'

function addDays(d: Date, n: number) {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  out.setDate(out.getDate() + n)
  return out
}

/**
 * "Planned for the day" lens. Defaults to today; user can flip to neighboring
 * days with the chevrons. Shows the day's planned transactions, recurring
 * instances, totals, the running balance, and inline edit/delete actions
 * matching the Ledger.
 */
export function TodayLens() {
  const [dayOffset, setDayOffset] = useState(0)
  const today = useMemo(() => new Date(), [])
  const viewed = useMemo(() => addDays(today, dayOffset), [today, dayOffset])
  const viewedIso = isoDate(viewed)
  const monthIso = monthKey(viewed)
  const lastDay = daysInMonth(viewed.getFullYear(), viewed.getMonth())
  const toIso = `${viewed.getFullYear()}-${String(viewed.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const { data: settings } = useSettings()
  const { data: opening } = useMonthlyOpening(monthIso)
  const { data: txs = [] } = useTransactionsInRange(monthIso, toIso)
  const { data: rules = [] } = useRecurringRules()
  const { data: categories = [] } = useCategories()
  const deleteTx = useDeleteTransaction()
  const currency = settings?.currency ?? 'CZK'
  const catMap = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c])),
    [categories],
  )

  const [editingTx, setEditingTx] = useState<Transaction | null>(null)
  const [editingPending, setEditingPending] = useState<
    | { rule_id: string; date: string; amount: number; description: string; categoryId: string | null }
    | null
  >(null)

  const dayTxs = useMemo(() => txs.filter((t) => t.occurred_on === viewedIso), [txs, viewedIso])

  const dayRuleHits = useMemo(() => {
    const out: Array<{ rule_id: string; amount: number; description: string; categoryId: string | null }> = []
    const d = new Date(viewedIso + 'T00:00:00')
    const realisedKeys = new Set(
      txs
        .filter((t) => t.recurring_rule_id && t.occurred_on === viewedIso)
        .map((t) => t.recurring_rule_id),
    )
    for (const r of rules) {
      if (realisedKeys.has(r.id)) continue
      for (const _ of expandRuleInRange(r, d, d)) {
        out.push({
          rule_id: r.id,
          amount: r.kind === 'income' ? r.amount : -r.amount,
          description: r.name,
          categoryId: r.category_id,
        })
      }
    }
    return out
  }, [rules, txs, viewedIso])

  const dayExpense = useMemo(() => {
    let sum = 0
    for (const t of dayTxs) if (Number(t.amount) < 0) sum += -Number(t.amount)
    for (const i of dayRuleHits) if (i.amount < 0) sum += -i.amount
    return sum
  }, [dayTxs, dayRuleHits])

  const dayIncome = useMemo(() => {
    let sum = 0
    for (const t of dayTxs) if (Number(t.amount) > 0) sum += Number(t.amount)
    for (const i of dayRuleHits) if (i.amount > 0) sum += i.amount
    return sum
  }, [dayTxs, dayRuleHits])

  const balance = useMemo(() => {
    const opening0 = opening?.opening_balance ?? 0
    let running = opening0
    const cutoffDay = viewed.getDate()
    const realisedKeys = new Set(
      txs.filter((t) => t.recurring_rule_id).map((t) => `${t.recurring_rule_id}|${t.occurred_on}`),
    )
    for (let day = 1; day <= cutoffDay; day++) {
      const dIso = `${monthIso.slice(0, 8)}${String(day).padStart(2, '0')}`
      for (const t of txs) {
        if (t.occurred_on === dIso) running += Number(t.amount)
      }
      const d = new Date(dIso + 'T00:00:00')
      for (const r of rules) {
        for (const _ of expandRuleInRange(r, d, d)) {
          if (realisedKeys.has(`${r.id}|${dIso}`)) continue
          running += r.kind === 'income' ? r.amount : -r.amount
        }
      }
    }
    return running
  }, [txs, rules, opening, monthIso, viewed])

  type Item =
    | {
        key: string
        amount: number
        description: string
        recurring: false
        tx: Transaction
      }
    | {
        key: string
        amount: number
        description: string
        recurring: true
        ruleId: string
        categoryId: string | null
      }

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [
      ...dayTxs.map<Item>((t) => ({
        key: `tx-${t.id}`,
        amount: Number(t.amount),
        description:
          t.description?.trim() ||
          (t.category_id ? catMap[t.category_id]?.name : null) ||
          'Untitled',
        recurring: false,
        tx: t,
      })),
      ...dayRuleHits.map<Item>((i) => ({
        key: `rule-${i.rule_id}`,
        amount: i.amount,
        description: i.description,
        recurring: true,
        ruleId: i.rule_id,
        categoryId: i.categoryId,
      })),
    ]
    return out.sort((a, b) => a.amount - b.amount)
  }, [dayTxs, dayRuleHits, catMap])

  const dayLabel = viewed.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  const offsetLabel =
    dayOffset === 0
      ? 'Today'
      : dayOffset === 1
        ? 'Tomorrow'
        : dayOffset === -1
          ? 'Yesterday'
          : dayOffset > 0
            ? `In ${dayOffset} days`
            : `${Math.abs(dayOffset)} days ago`
  const balanceLabel =
    dayOffset === 0
      ? 'Current balance'
      : dayOffset > 0
        ? 'Projected balance'
        : 'Balance on this day'

  return (
    <div className="space-y-4 md:space-y-6">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="label">{offsetLabel}</div>
          <h1 className="text-2xl md:text-3xl font-semibold mt-0.5 truncate">{dayLabel}</h1>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setDayOffset((d) => d - 1)}
            className="btn-outline w-9 h-9 px-0 grid place-items-center"
            aria-label="Previous day"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          {dayOffset !== 0 && (
            <button
              type="button"
              onClick={() => setDayOffset(0)}
              className="btn-outline text-xs px-2.5"
            >
              Today
            </button>
          )}
          <button
            type="button"
            onClick={() => setDayOffset((d) => d + 1)}
            className="btn-outline w-9 h-9 px-0 grid place-items-center"
            aria-label="Next day"
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
        <div className="label mb-1">
          Planned {dayOffset === 0 ? 'for today' : 'for this day'}
        </div>
        <div
          className={`stat-num font-semibold text-4xl md:text-5xl ${
            dayExpense === 0 ? 'text-fg-muted' : 'text-fg'
          }`}
        >
          {formatMoney(dayExpense, currency)}
        </div>
        <div className="text-xs md:text-sm text-fg-subtle mt-2 stat-num">
          {dayExpense === 0 && dayIncome === 0 ? (
            'Nothing planned.'
          ) : (
            <>
              Income +{formatMoney(dayIncome, currency)} · Net{' '}
              {formatMoney(dayIncome - dayExpense, currency)}
            </>
          )}
        </div>
      </motion.section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
        <Mini
          label={balanceLabel}
          value={formatMoney(balance, currency)}
          icon={<Wallet className="w-4 h-4" />}
        />
      </div>

      <section className="card p-4 md:p-5">
        <div className="label mb-2">
          What's on for {dayOffset === 0 ? 'today' : 'this day'}
        </div>
        <h2 className="font-semibold mb-3">
          {items.length === 0
            ? 'Nothing planned'
            : `${items.length} ${items.length === 1 ? 'item' : 'items'}`}
        </h2>
        {items.length > 0 && (
          <div className="divide-y divide-border">
            {items.map((i) => (
              <div
                key={i.key}
                className="group flex items-center justify-between gap-3 py-2"
              >
                <div className="min-w-0 flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${
                      i.amount >= 0
                        ? 'bg-positive/10 text-positive'
                        : 'bg-negative/10 text-negative'
                    }`}
                  >
                    {i.amount >= 0 ? (
                      <ArrowUpRight className="w-4 h-4" />
                    ) : (
                      <ArrowDownRight className="w-4 h-4" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate flex items-center gap-2">
                      <span className="truncate">{i.description}</span>
                      {i.recurring && (
                        <span className="text-[10px] text-fg-subtle uppercase tracking-wider shrink-0">
                          recurring
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div
                    className={`stat-num text-sm ${
                      i.amount >= 0 ? 'text-positive' : 'text-negative'
                    }`}
                  >
                    {formatMoney(i.amount, currency)}
                  </div>
                  <div className="flex items-center gap-1 max-md:opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    {i.recurring ? (
                      <button
                        onClick={() =>
                          setEditingPending({
                            rule_id: i.ruleId,
                            date: viewedIso,
                            amount: i.amount,
                            description: i.description,
                            categoryId: i.categoryId,
                          })
                        }
                        className="btn-ghost !p-1.5"
                        title="Edit for this day (creates a per-day override, doesn't change the rule)"
                        aria-label="Edit recurring entry for this day"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => setEditingTx(i.tx)}
                          className="btn-ghost !p-1.5"
                          title="Edit"
                          aria-label="Edit entry"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm('Delete this entry?')) {
                              deleteTx.mutate(i.tx.id)
                            }
                          }}
                          className="btn-ghost !p-1.5 text-negative"
                          title="Delete"
                          aria-label="Delete entry"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Edit dialogs */}
      <AddTransactionDialog
        open={!!editingTx}
        onOpenChange={(o) => !o && setEditingTx(null)}
        initialDate={editingTx?.occurred_on}
        initialAmount={editingTx ? Number(editingTx.amount) : undefined}
        initialDescription={editingTx?.description ?? undefined}
        initialCategoryId={editingTx?.category_id ?? null}
        editId={editingTx?.id}
      />
      <AddTransactionDialog
        open={!!editingPending}
        onOpenChange={(o) => !o && setEditingPending(null)}
        initialDate={editingPending?.date}
        initialAmount={editingPending?.amount}
        initialDescription={editingPending?.description}
        initialCategoryId={editingPending?.categoryId ?? null}
        initialRecurringRuleId={editingPending?.rule_id ?? null}
      />
    </div>
  )
}

function Mini({
  label,
  value,
  sub,
  tone = 'default',
  icon,
}: {
  label: string
  value: string
  sub?: string
  tone?: 'default' | 'positive' | 'negative'
  icon?: React.ReactNode
}) {
  const toneClass =
    tone === 'positive' ? 'text-positive' : tone === 'negative' ? 'text-negative' : 'text-fg'
  return (
    <div className="card p-3 md:p-4">
      <div className="flex items-center justify-between">
        <div className="label">{label}</div>
        {icon && <span className={toneClass}>{icon}</span>}
      </div>
      <div
        className={`mt-1.5 md:mt-2 text-lg md:text-xl font-semibold stat-num ${toneClass}`}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] md:text-xs text-fg-subtle mt-1">{sub}</div>}
    </div>
  )
}
