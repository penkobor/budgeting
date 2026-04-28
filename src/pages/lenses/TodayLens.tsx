import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Wallet,
} from 'lucide-react'
import {
  useAssets,
  useCategories,
  useDeleteTransaction,
  useMonthlyOpening,
  useRecurringOverridesInRange,
  useRecurringRules,
  useSettings,
  useTransactionsInRange,
} from '@/hooks/queries'
import { formatMoney, isoDate, monthKey, daysInMonth } from '@/lib/utils'
import { expandRuleInRange } from '@/lib/recurring'
import { effectiveOccurrenceAmount } from '@/lib/projection'
import { AddTransactionDialog } from '@/components/AddTransactionDialog'
import { RowActions } from '@/components/ui/RowActions'
import { SwipeableRow } from '@/components/ui/SwipeableRow'
import { HeroFigure } from '@/components/ui/HeroFigure'
import { useConfirm } from '@/components/ui/ConfirmDialog'
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
  const { data: overrides = [] } = useRecurringOverridesInRange(monthIso, toIso)
  const { data: personalCategories = [] } = useCategories()
  const categories = personalCategories
  const { data: assets = [] } = useAssets()
  const deleteTx = useDeleteTransaction()
  const confirm = useConfirm()
  const currency = settings?.currency ?? 'CZK'
  const assetBoost = useMemo(
    () => assets.reduce((s, a) => s + (a.include_in_balance ? Number(a.value) : 0), 0),
    [assets],
  )
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
    const out: Array<{
      rule_id: string
      amount: number
      originalAmount: number
      overridden: boolean
      description: string
      categoryId: string | null
    }> = []
    const d = new Date(viewedIso + 'T00:00:00')
    const realisedKeys = new Set(
      txs
        .filter((t) => t.recurring_rule_id && t.occurred_on === viewedIso)
        .map((t) => t.recurring_rule_id),
    )
    for (const r of rules) {
      if (realisedKeys.has(r.id)) continue
      for (const dIso of expandRuleInRange(r, d, d)) {
        const eff = effectiveOccurrenceAmount(r, dIso, overrides)
        if (eff == null) continue
        const original = r.kind === 'income' ? r.amount : -r.amount
        out.push({
          rule_id: r.id,
          amount: eff,
          originalAmount: original,
          overridden: Math.abs(eff - original) > 0.005,
          description: r.name,
          categoryId: r.category_id,
        })
      }
    }
    return out
  }, [rules, overrides, txs, viewedIso])

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
          const eff = effectiveOccurrenceAmount(r, dIso, overrides)
          if (eff == null) continue
          running += eff
        }
      }
    }
    return running
  }, [txs, rules, overrides, opening, monthIso, viewed])

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
        originalAmount: number
        overridden: boolean
      }

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [
      ...dayTxs.map<Item>((t) => {
        const catId = t.category_id
        return {
          key: `tx-${t.id}`,
          amount: Number(t.amount),
          description:
            t.description?.trim() ||
            (catId ? catMap[catId]?.name : null) ||
            'Untitled',
          recurring: false,
          tx: t,
        }
      }),
      ...dayRuleHits.map<Item>((i) => ({
        key: `rule-${i.rule_id}`,
        amount: i.amount,
        description: i.description,
        recurring: true,
        ruleId: i.rule_id,
        categoryId: i.categoryId,
        originalAmount: i.originalAmount,
        overridden: i.overridden,
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
          <h1 className="text-title-1 md:text-large-title font-semibold mt-0.5 truncate">{dayLabel}</h1>
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
        <HeroFigure
          eyebrow={`Planned ${dayOffset === 0 ? 'for today' : 'for this day'}`}
          value={
            <span className={dayExpense === 0 ? 'text-fg-muted' : undefined}>
              {formatMoney(dayExpense, currency)}
            </span>
          }
          sublabel={
            dayExpense === 0 && dayIncome === 0 ? (
              'Nothing planned.'
            ) : (
              <span className="stat-num">
                Income +{formatMoney(dayIncome, currency)} · Net{' '}
                {formatMoney(dayIncome - dayExpense, currency)}
              </span>
            )
          }
        />
      </motion.section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
        <Mini
          label={balanceLabel}
          value={formatMoney(balance + assetBoost, currency)}
          icon={<Wallet className="w-4 h-4" />}
          sub={
            assetBoost > 0
              ? `cash ${formatMoney(balance, currency)} + assets ${formatMoney(assetBoost, currency)}`
              : undefined
          }
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
          <div className="divide-y divide-border -mx-5 md:-mx-7">
            {items.map((i) => {
              const editAction = i.recurring
                ? () =>
                    setEditingPending({
                      rule_id: i.ruleId,
                      date: viewedIso,
                      amount: i.amount,
                      description: i.description,
                      categoryId: i.categoryId,
                    })
                : () => setEditingTx(i.tx)
              const deleteAction = i.recurring
                ? undefined
                : async () => {
                    const ok = await confirm({
                      title: 'Delete this entry?',
                      description: i.description
                        ? `“${i.description}” will be removed permanently.`
                        : 'This entry will be removed permanently.',
                      destructive: true,
                    })
                    if (ok) deleteTx.mutate(i.tx.id)
                  }
              return (
                <SwipeableRow
                  key={i.key}
                  onEdit={editAction}
                  onDelete={deleteAction}
                >
                  <div className="group flex items-center justify-between gap-3 px-5 md:px-7 py-2">
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
                            <span className="text-[0.625rem] text-fg-subtle uppercase tracking-wider shrink-0">
                              recurring
                            </span>
                          )}
                          {i.recurring && i.overridden && (
                            <span
                              className="text-[0.625rem] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-accent/10 text-accent shrink-0"
                              title={`Trimmed from ${formatMoney(i.originalAmount, currency)} via rebalance`}
                            >
                              trimmed
                            </span>
                          )}
                        </div>
                        {i.recurring && i.overridden && (
                          <div className="text-[0.6875rem] text-fg-subtle stat-num mt-0.5">
                            was <span className="line-through">{formatMoney(i.originalAmount, currency)}</span>
                          </div>
                        )}
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
                      {/* Desktop hover-revealed actions; mobile uses the swipe gesture. */}
                      <div className="hidden md:block">
                        <RowActions
                          onEdit={editAction}
                          onDelete={deleteAction}
                          size="sm"
                        />
                      </div>
                    </div>
                  </div>
                </SwipeableRow>
              )
            })}
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
      {sub && <div className="text-[0.6875rem] md:text-xs text-fg-subtle mt-1">{sub}</div>}
    </div>
  )
}
