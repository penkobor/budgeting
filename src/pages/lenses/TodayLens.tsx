import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Repeat, Plus, FilePen, Scale, CheckCircle2, Trash2, X } from 'lucide-react'
import {
  useAssets,
  useCategories,
  useDeleteDraft,
  useDeleteDraftsForDate,
  useDraftTransactions,
  useInsertTransactions,
  useMonthlyOpening,
  useRecurringOverridesInRange,
  useRecurringRules,
  useSettings,
  useTransactionsInRange,
} from '@/hooks/queries'
import { formatMoney, isoDate, monthKey, daysInMonth, cn } from '@/lib/utils'
import { expandRuleInRange } from '@/lib/recurring'
import { dailyTotals, effectiveOccurrenceAmount } from '@/lib/projection'
import { AddTransactionDialog } from '@/components/AddTransactionDialog'
import { BalanceOutDialog } from '@/components/BalanceOutDialog'
import { GoalAlertRibbon } from '@/components/GoalAlertRibbon'
import { pushToast } from '@/components/ui/Toast'
import type { Transaction, TransactionInsert } from '@/lib/db.types'

const UPCOMING_DAYS = 7

function addDays(d: Date, n: number) {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  out.setDate(out.getDate() + n)
  return out
}

function monthEndIso(d: Date) {
  return isoDate(new Date(d.getFullYear(), d.getMonth(), daysInMonth(d.getFullYear(), d.getMonth())))
}

type Item =
  | { key: string; amount: number; description: string; categoryId: string | null; recurring: false; tx: Transaction }
  | {
      key: string
      amount: number
      description: string
      categoryId: string | null
      recurring: true
      ruleId: string
      originalAmount: number
      overridden: boolean
    }

/**
 * Today: what is planned for the day, the balance after it, and the next
 * few days at a glance. Day chevrons move through the calendar; tapping an
 * entry opens it for editing.
 */
export function TodayLens() {
  const [dayOffset, setDayOffset] = useState(0)
  const today = useMemo(() => new Date(), [])
  const viewed = useMemo(() => addDays(today, dayOffset), [today, dayOffset])
  const viewedIso = isoDate(viewed)
  const lastUpcoming = addDays(viewed, UPCOMING_DAYS)
  const monthIso = monthKey(viewed)
  const nextMonthIso = monthKey(lastUpcoming)
  const toIso = monthEndIso(lastUpcoming)

  const { data: settings } = useSettings()
  const { data: opening } = useMonthlyOpening(monthIso)
  const { data: nextOpening } = useMonthlyOpening(nextMonthIso)
  const { data: txs = [] } = useTransactionsInRange(monthIso, toIso)
  const { data: rules = [] } = useRecurringRules()
  const { data: overrides = [] } = useRecurringOverridesInRange(monthIso, toIso)
  const { data: categories = [] } = useCategories()
  const { data: assets = [] } = useAssets()
  const currency = settings?.currency ?? 'CZK'
  const assetBoost = useMemo(
    () => assets.reduce((s, a) => s + (a.include_in_balance ? Number(a.value) : 0), 0),
    [assets],
  )
  const catMap = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories])

  const [editingTx, setEditingTx] = useState<Transaction | null>(null)
  const [editingPending, setEditingPending] = useState<
    { rule_id: string; date: string; amount: number; description: string; categoryId: string | null } | null
  >(null)
  const [addOpen, setAddOpen] = useState(false)
  const [draftOpen, setDraftOpen] = useState(false)
  const [balanceOutOpen, setBalanceOutOpen] = useState(false)

  // Day totals for the viewed month and, when the upcoming strip crosses
  // into the next month, for that month too (each from its own opening).
  const days = useMemo(() => {
    const out = dailyTotals(monthIso, opening?.opening_balance ?? 0, txs, rules, overrides)
    if (nextMonthIso !== monthIso) {
      out.push(...dailyTotals(nextMonthIso, nextOpening?.opening_balance ?? 0, txs, rules, overrides))
    }
    return new Map(out.map((d) => [d.date, d]))
  }, [monthIso, nextMonthIso, opening, nextOpening, txs, rules, overrides])

  const todayTotals = days.get(viewedIso)
  const dayExpense = todayTotals?.expense ?? 0
  const dayIncome = todayTotals?.income ?? 0
  const balance = todayTotals?.balance ?? 0

  const upcoming = useMemo(
    () =>
      Array.from({ length: UPCOMING_DAYS }, (_, i) => {
        const d = addDays(viewed, i + 1)
        return { offset: dayOffset + i + 1, date: d, totals: days.get(isoDate(d)) }
      }),
    [viewed, dayOffset, days],
  )

  const items = useMemo<Item[]>(() => {
    const dayTxs = txs.filter((t) => t.occurred_on === viewedIso)
    const realised = new Set(dayTxs.map((t) => t.recurring_rule_id).filter(Boolean))
    const out: Item[] = dayTxs.map((t) => ({
      key: `tx-${t.id}`,
      amount: Number(t.amount),
      description: t.description?.trim() || (t.category_id ? catMap[t.category_id]?.name : null) || 'Untitled',
      categoryId: t.category_id,
      recurring: false,
      tx: t,
    }))
    const d = new Date(viewedIso + 'T00:00:00')
    for (const r of rules) {
      if (realised.has(r.id)) continue
      for (const dIso of expandRuleInRange(r, d, d)) {
        const eff = effectiveOccurrenceAmount(r, dIso, overrides)
        if (eff == null) continue
        const original = r.kind === 'income' ? r.amount : -r.amount
        out.push({
          key: `rule-${r.id}`,
          amount: eff,
          description: r.name,
          categoryId: r.category_id,
          recurring: true,
          ruleId: r.id,
          originalAmount: original,
          overridden: Math.abs(eff - original) > 0.005,
        })
      }
    }
    return out.sort((a, b) => a.amount - b.amount)
  }, [txs, rules, overrides, viewedIso, catMap])

  const weekday = viewed.toLocaleDateString('en-US', { weekday: 'long' })
  const dateLabel = viewed.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
  const relative =
    dayOffset === 0 ? 'Today' : dayOffset === 1 ? 'Tomorrow' : dayOffset === -1 ? 'Yesterday' : weekday
  const isPast = dayOffset < 0

  const openItem = (i: Item) => {
    if (i.recurring) {
      setEditingPending({
        rule_id: i.ruleId,
        date: viewedIso,
        amount: i.amount,
        description: i.description,
        categoryId: i.categoryId,
      })
    } else {
      setEditingTx(i.tx)
    }
  }

  return (
    <div className="space-y-8 md:space-y-10">
      <header className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="label">{relative === weekday ? dateLabel : `${weekday}, ${dateLabel}`}</div>
          <h1 className="page-title mt-0.5 truncate">{relative}</h1>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {dayOffset !== 0 && (
            <button type="button" onClick={() => setDayOffset(0)} className="btn-tinted !rounded-full !py-1.5 text-[13px]">
              Today
            </button>
          )}
          <button type="button" onClick={() => setDayOffset((d) => d - 1)} className="icon-btn" aria-label="Previous day">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button type="button" onClick={() => setDayOffset((d) => d + 1)} className="icon-btn" aria-label="Next day">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </header>

      <GoalAlertRibbon />

      {/* Hero — the one number this screen is about. */}
      <motion.section
        key={viewedIso}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', bounce: 0, duration: 0.35 }}
      >
        <div className="label">{isPast ? 'Was planned' : 'Planned to spend'}</div>
        <div className={cn('hero-num text-[56px] md:text-[72px] mt-2', dayExpense === 0 && 'text-fg-subtle')}>
          {formatMoney(dayExpense, currency)}
        </div>
        <div className="mt-4 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[15px]">
          <span className="text-fg-muted">
            Balance after {dayOffset === 0 ? 'today' : 'this day'}{' '}
            <span className={cn('stat-num font-medium', balance + assetBoost < 0 ? 'text-negative' : 'text-fg')}>
              {formatMoney(balance + assetBoost, currency)}
            </span>
          </span>
          {dayIncome > 0 && (
            <span className="text-fg-muted">
              Income <span className="stat-num font-medium text-positive">+{formatMoney(dayIncome, currency)}</span>
            </span>
          )}
        </div>
        {assetBoost > 0 && (
          <div className="text-[13px] text-fg-subtle mt-1 stat-num">
            Cash {formatMoney(balance, currency)} + assets {formatMoney(assetBoost, currency)}
          </div>
        )}
      </motion.section>

      {/* Next days — how the plan is spread over the coming week. */}
      <section>
        <div className="label mb-3">Next {UPCOMING_DAYS} days</div>
        <div className="-mx-4 px-4 -my-2 py-2 md:-mx-1 md:px-1 flex gap-2 overflow-x-auto snap-x scroll-px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {upcoming.map(({ offset, date, totals }) => {
            const spend = totals?.expense ?? 0
            const weekend = date.getDay() === 0 || date.getDay() === 6
            return (
              <button
                key={offset}
                type="button"
                onClick={() => setDayOffset(offset)}
                className="snap-start shrink-0 w-[116px] text-left rounded-2xl bg-bg-card ring-1 ring-border/70 px-3 py-3 hover:ring-border-strong transition-shadow"
              >
                <div className={cn('text-[12px] font-medium', weekend ? 'text-fg-subtle' : 'text-fg-muted')}>
                  {date.toLocaleDateString('en-US', { weekday: 'short' })} {date.getDate()}
                </div>
                <div className={cn('stat-num text-[15px] font-semibold mt-1.5 truncate', spend === 0 && 'text-fg-subtle')}>
                  {spend === 0 ? '—' : formatMoney(spend, currency)}
                </div>
                <div
                  className={cn(
                    'stat-num text-[12px] mt-0.5 truncate',
                    totals && totals.balance + assetBoost < 0 ? 'text-negative' : 'text-fg-subtle',
                  )}
                >
                  {totals ? formatMoney(totals.balance + assetBoost, currency) : ''}
                </div>
              </button>
            )
          })}
        </div>
      </section>

      {/* The day's entries */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <div className="label">Entries</div>
          {items.length > 0 && <div className="text-[13px] text-fg-subtle">{items.length}</div>}
        </div>
        <div className="card overflow-hidden">
          {items.map((i) => {
            const cat = i.categoryId ? catMap[i.categoryId] : undefined
            return (
              <button
                key={i.key}
                type="button"
                onClick={() => openItem(i)}
                data-no-press
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left border-b border-border/70 hover:bg-bg-elev/50 active:bg-bg-elev transition-colors"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: cat?.color ?? 'rgb(var(--border-strong))' }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] truncate">{i.description}</span>
                  {(cat || i.recurring) && (
                    <span className="flex items-center gap-1.5 text-[12px] text-fg-subtle mt-0.5">
                      {i.recurring && <Repeat className="w-3 h-3" aria-label="Recurring" />}
                      {cat && cat.name !== i.description && <span className="truncate">{cat.name}</span>}
                      {i.recurring && i.overridden && (
                        <span className="stat-num">
                          · was <span className="line-through">{formatMoney(Math.abs(i.originalAmount), currency)}</span>
                        </span>
                      )}
                    </span>
                  )}
                </span>
                <span className={cn('stat-num text-[15px] font-medium shrink-0', i.amount >= 0 ? 'text-positive' : 'text-fg')}>
                  {i.amount >= 0 ? '+' : '−'}
                  {formatMoney(Math.abs(i.amount), currency)}
                </span>
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            data-no-press
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left text-[15px] text-fg-muted hover:bg-bg-elev/50 active:bg-bg-elev transition-colors"
          >
            <Plus className="w-4 h-4" />
            {items.length === 0 ? 'Nothing planned — add an entry' : 'Add entry'}
          </button>
        </div>

        <div className="flex gap-2 mt-3">
          <button type="button" onClick={() => setDraftOpen(true)} className="btn-ghost !px-3 text-[13px] text-fg-muted">
            <FilePen className="w-4 h-4" /> Draft
          </button>
          <button type="button" onClick={() => setBalanceOutOpen(true)} className="btn-ghost !px-3 text-[13px] text-fg-muted">
            <Scale className="w-4 h-4" /> Balance out
          </button>
        </div>
      </section>

      <DraftSection viewedIso={viewedIso} currency={currency} catMap={catMap} />

      <AddTransactionDialog
        open={!!editingTx}
        onOpenChange={(o) => !o && setEditingTx(null)}
        initialDate={editingTx?.occurred_on}
        initialAmount={editingTx ? Number(editingTx.amount) : undefined}
        initialDescription={editingTx?.description ?? undefined}
        initialCategoryId={editingTx?.category_id ?? null}
        initialIsShared={editingTx?.is_shared}
        initialRecurringRuleId={editingTx?.recurring_rule_id ?? null}
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
      <AddTransactionDialog open={addOpen} onOpenChange={setAddOpen} initialDate={viewedIso} />
      <AddTransactionDialog open={draftOpen} onOpenChange={setDraftOpen} initialDate={viewedIso} isDraft />
      <BalanceOutDialog open={balanceOutOpen} onOpenChange={setBalanceOutOpen} />
    </div>
  )
}

function DraftSection({
  viewedIso,
  currency,
  catMap,
}: {
  viewedIso: string
  currency: string
  catMap: Record<string, { name: string }>
}) {
  const { data: allDrafts = [] } = useDraftTransactions()
  const deleteDraft = useDeleteDraft()
  const deleteDraftsForDate = useDeleteDraftsForDate()
  const insertTxs = useInsertTransactions()

  const dayDrafts = useMemo(
    () => allDrafts.filter((d) => d.occurred_on === viewedIso),
    [allDrafts, viewedIso],
  )

  const draftTotal = useMemo(
    () => dayDrafts.reduce((sum, d) => sum + Number(d.amount), 0),
    [dayDrafts],
  )

  const commitDrafts = async () => {
    const rows: TransactionInsert[] = dayDrafts.map((d) => ({
      occurred_on: d.occurred_on,
      amount: Number(d.amount),
      description: d.description,
      category_id: d.category_id,
      is_shared: false,
      recurring_rule_id: null,
      planned: true,
      confirmed_at: null,
    }))
    await insertTxs.mutateAsync(rows)
    await deleteDraftsForDate.mutateAsync(viewedIso)
    pushToast(`${dayDrafts.length} draft${dayDrafts.length === 1 ? '' : 's'} added to ledger`)
  }

  if (dayDrafts.length === 0) return null

  return (
    <motion.section initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex items-baseline justify-between mb-3">
        <div className="label">Drafts</div>
        <div className="stat-num text-[13px] text-fg-subtle">{formatMoney(draftTotal, currency)}</div>
      </div>
      <div className="card overflow-hidden">
        {dayDrafts.map((d) => (
          <div key={d.id} className="group flex items-center gap-3 px-4 py-3.5 border-b border-border/70">
            <span className="w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-fg-subtle" />
            <span className="min-w-0 flex-1 text-[15px] truncate text-fg-muted">
              {d.description?.trim() || (d.category_id ? catMap[d.category_id]?.name : null) || 'Untitled'}
            </span>
            <span className={cn('stat-num text-[15px] shrink-0', d.amount >= 0 ? 'text-positive' : 'text-fg-muted')}>
              {formatMoney(d.amount, currency)}
            </span>
            <button
              onClick={() => deleteDraft.mutate(d.id)}
              className="icon-btn !w-8 !h-8 -mr-2 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
              aria-label="Remove draft"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2 p-3">
          <button onClick={() => deleteDraftsForDate.mutate(viewedIso)} className="btn-ghost text-[13px] flex-1 text-fg-muted">
            <Trash2 className="w-4 h-4" />
            Clear
          </button>
          <button
            onClick={commitDrafts}
            disabled={insertTxs.isPending || deleteDraftsForDate.isPending}
            className="btn-primary text-[13px] flex-1"
          >
            <CheckCircle2 className="w-4 h-4" />
            {insertTxs.isPending ? 'Adding…' : 'Add to ledger'}
          </button>
        </div>
      </div>
    </motion.section>
  )
}
