import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Modal } from './ui/Modal'
import { pushToast } from './ui/Toast'
import {
  RebalanceStep,
  RebalanceStepFooter,
  type RebalanceSelection,
} from './RebalanceStep'
import {
  useApplyRebalance,
  useAssets,
  useCategories,
  useMonthlyGoal,
  useMonthlyOpening,
  useRecurringOverridesInRange,
  useRecurringRules,
  useSettings,
  useTransactionsInRange,
  useUpsertTransaction,
} from '@/hooks/queries'
import { isoDate } from '@/lib/utils'
import {
  computeProjectedEndBalance,
  distributeEvenly,
  listFuturePlannedExpenses,
  occKey,
  type PlannedOccurrence,
} from '@/lib/projection'
import type { TransactionInsert, RecurringOverrideInsert } from '@/lib/db.types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialDate?: string
  initialAmount?: number
  initialDescription?: string
  initialCategoryId?: string | null
  initialRecurringRuleId?: string | null
  initialIsShared?: boolean
  editId?: string
}

type Step = 'form' | 'rebalance'

export function AddTransactionDialog({
  open,
  onOpenChange,
  initialDate,
  initialAmount,
  initialDescription,
  initialCategoryId,
  initialRecurringRuleId,
  initialIsShared,
  editId,
}: Props) {
  const { data: categories } = useCategories()
  const { data: settings } = useSettings()
  const upsertTx = useUpsertTransaction()
  const applyRebalanceMutation = useApplyRebalance()

  const [date, setDate] = useState(initialDate ?? isoDate(new Date()))
  const [amount, setAmount] = useState(String(initialAmount ?? ''))
  const [description, setDescription] = useState(initialDescription ?? '')
  const [categoryId, setCategoryId] = useState<string | ''>(initialCategoryId ?? '')
  const [isShared, setIsShared] = useState<boolean>(initialIsShared ?? false)
  const [kind, setKind] = useState<'expense' | 'income'>(
    (initialAmount ?? -1) >= 0 ? 'income' : 'expense',
  )

  const [step, setStep] = useState<Step>('form')
  const [pendingTx, setPendingTx] = useState<TransactionInsert | null>(null)
  const [overage, setOverage] = useState(0)
  const [candidates, setCandidates] = useState<PlannedOccurrence[]>([])

  // Rebalance step state (lifted)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [mode, setMode] = useState<'even' | 'manual'>('even')
  const [manualDeltas, setManualDeltas] = useState<Map<string, number>>(new Map())

  const yearMonth = date.slice(0, 7)
  const monthIso = `${yearMonth}-01`
  const fromIso = monthIso
  const lastDay = new Date(
    Number(yearMonth.slice(0, 4)),
    Number(yearMonth.slice(5, 7)),
    0,
  ).getDate()
  const toIso = `${yearMonth}-${String(lastDay).padStart(2, '0')}`

  const { data: goal } = useMonthlyGoal(yearMonth)
  const { data: opening } = useMonthlyOpening(monthIso)
  const { data: monthTxs = [] } = useTransactionsInRange(fromIso, toIso)
  const { data: rules = [] } = useRecurringRules()
  const { data: overrides = [] } = useRecurringOverridesInRange(fromIso, toIso)
  const { data: assets = [] } = useAssets()
  const assetBoost = assets.reduce(
    (s, a) => s + (a.include_in_balance ? Number(a.value) : 0),
    0,
  )

  const currency = settings?.currency ?? 'CZK'

  useEffect(() => {
    if (open) {
      setDate(initialDate ?? isoDate(new Date()))
      setAmount(initialAmount !== undefined ? String(Math.abs(initialAmount)) : '')
      setDescription(initialDescription ?? '')
      setCategoryId(initialCategoryId ?? '')
      setIsShared(initialIsShared ?? false)
      setKind((initialAmount ?? -1) >= 0 ? 'income' : 'expense')
      setStep('form')
      setPendingTx(null)
      setOverage(0)
      setCandidates([])
      setSelected(new Set())
      setMode('even')
      setManualDeltas(new Map())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialDate, initialAmount, initialDescription, initialCategoryId, initialIsShared])

  const filteredCats = (categories ?? []).filter((c) => c.kind === kind)

  // Even-distribution result based on currently selected candidates
  const evenResult = useMemo(() => {
    const items = candidates.filter((c) => selected.has(occKey(c.ruleId, c.date)))
    return distributeEvenly(items, overage)
  }, [candidates, selected, overage])

  // When the user flips into manual mode, seed deltas from the even result.
  useEffect(() => {
    if (mode === 'manual' && manualDeltas.size === 0) {
      const seed = new Map<string, number>()
      evenResult.deltas.forEach((v, k) => seed.set(k, v))
      if (seed.size > 0) setManualDeltas(seed)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  const totalCovered = useMemo(() => {
    if (mode === 'even') return evenResult.covered
    let sum = 0
    manualDeltas.forEach((v) => (sum += v))
    return Math.round(sum * 100) / 100
  }, [mode, evenResult, manualDeltas])

  const fullyCovered = totalCovered >= overage - 0.005

  const persistTransactionAndClose = async (tx: TransactionInsert) => {
    await upsertTx.mutateAsync(tx)
    onOpenChange(false)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = parseFloat(amount.replace(',', '.'))
    if (Number.isNaN(n) || n <= 0) return
    const signed = kind === 'income' ? Math.abs(n) : -Math.abs(n)
    const txPayload: TransactionInsert = {
      id: editId,
      occurred_on: date,
      amount: signed,
      description: description || null,
      category_id: categoryId || null,
      is_shared: isShared,
      recurring_rule_id: initialRecurringRuleId ?? null,
      planned: true,
      confirmed_at: null,
    }

    const isEdit = !!editId
    if (
      kind === 'expense' &&
      !isEdit &&
      goal &&
      date.startsWith(yearMonth)
    ) {
      const txsWithNew = [
        ...monthTxs,
        { ...txPayload, id: '__pending__' } as never,
      ]
      const openingBalance = opening?.opening_balance ?? 0
      const projected = computeProjectedEndBalance(
        monthIso,
        openingBalance,
        txsWithNew,
        rules,
        overrides,
        new Date(),
        assetBoost,
      )
      const goalAmount = Number(goal.amount)
      if (projected < goalAmount) {
        const cands = listFuturePlannedExpenses(monthIso, rules, overrides, monthTxs)
        setOverage(Math.round((goalAmount - projected) * 100) / 100)
        setCandidates(cands)
        setPendingTx(txPayload)
        setSelected(new Set())
        setMode('even')
        setManualDeltas(new Map())
        setStep('rebalance')
        return
      }
    }

    await persistTransactionAndClose(txPayload)
  }

  const buildSelections = (): RebalanceSelection[] => {
    const deltas = mode === 'even' ? evenResult.deltas : manualDeltas
    const out: RebalanceSelection[] = []
    deltas.forEach((delta, k) => {
      if (delta <= 0) return
      const c = candidates.find((x) => occKey(x.ruleId, x.date) === k)
      if (!c) return
      const newAmount = Math.max(0, Math.round((c.amount - delta) * 100) / 100)
      out.push({
        ruleId: c.ruleId,
        occurrenceDate: c.date,
        newAmount,
        delta,
        isOneOff: c.isOneOff,
        transactionId: c.transactionId,
      })
    })
    return out
  }

  const applyRebalance = async () => {
    if (!pendingTx) return
    const selections = buildSelections()
    const overrideRows: RecurringOverrideInsert[] = selections
      .filter((s) => !s.isOneOff)
      .map((s) => ({
        recurring_rule_id: s.ruleId,
        occurrence_date: s.occurrenceDate,
        amount_override: s.newAmount > 0 ? s.newAmount : null,
        skipped: s.newAmount === 0,
      }))
    const txUpdates = selections
      .filter((s) => s.isOneOff && s.transactionId)
      .map((s) => ({ id: s.transactionId as string, new_amount: s.newAmount }))
    await applyRebalanceMutation.mutateAsync({
      tx: pendingTx,
      overrides: overrideRows,
      tx_updates: txUpdates,
    })
    const trimmed = selections.filter((s) => s.delta > 0).length
    pushToast(
      trimmed > 0
        ? `Saved · trimmed ${trimmed} planned ${trimmed === 1 ? 'expense' : 'expenses'} to keep your goal`
        : 'Saved with rebalance',
    )
    onOpenChange(false)
  }

  const saveAnyway = async () => {
    if (!pendingTx) return
    if (
      typeof window !== 'undefined' &&
      !window.confirm('This will exceed your monthly goal. Save anyway?')
    ) {
      return
    }
    await persistTransactionAndClose(pendingTx)
  }

  const isRebalance = step === 'rebalance'
  const title = isRebalance
    ? 'Rebalance to stay on track'
    : editId
      ? 'Edit transaction'
      : 'Add transaction'
  const applying = upsertTx.isPending || applyRebalanceMutation.isPending

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={isRebalance ? undefined : 'Press ⌘+Enter to save'}
      footer={
        isRebalance ? (
          <RebalanceStepFooter
            fullyCovered={fullyCovered}
            applying={applying}
            onApply={applyRebalance}
            onSaveAnyway={saveAnyway}
            onBack={() => setStep('form')}
          />
        ) : (
          <>
            <button type="button" onClick={() => onOpenChange(false)} className="btn-ghost">
              Cancel
            </button>
            <button
              type="submit"
              form="add-tx-form"
              disabled={upsertTx.isPending}
              className="btn-primary"
            >
              {upsertTx.isPending ? 'Saving…' : editId ? 'Save' : 'Add'}
            </button>
          </>
        )
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        {isRebalance ? (
          <RebalanceStep
            key="rebalance"
            candidates={candidates}
            overage={overage}
            currency={currency}
            selected={selected}
            setSelected={setSelected}
            mode={mode}
            setMode={setMode}
            manualDeltas={manualDeltas}
            setManualDeltas={setManualDeltas}
            evenResult={evenResult}
            totalCovered={totalCovered}
          />
        ) : (
          <motion.form
            key="form"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            id="add-tx-form"
            onSubmit={submit}
            className="space-y-4"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit(e as React.FormEvent)
            }}
          >
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setKind('expense')}
                className={`btn flex-1 ${kind === 'expense' ? 'bg-negative/10 text-negative border border-negative/30' : 'btn-outline'}`}
              >
                Expense
              </button>
              <button
                type="button"
                onClick={() => setKind('income')}
                className={`btn flex-1 ${kind === 'income' ? 'bg-positive/10 text-positive border border-positive/30' : 'btn-outline'}`}
              >
                Income
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="min-w-0">
                <div className="label mb-1.5">Amount</div>
                <input
                  className="input stat-num text-lg"
                  inputMode="decimal"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="min-w-0">
                <div className="label mb-1.5">Date</div>
                <input
                  className="input stat-num"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
            </div>

            <div>
              <div className="label mb-1.5">Description</div>
              <input
                className="input"
                placeholder="e.g. Groceries at Albert"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div>
              <div className="label mb-1.5">Category</div>
              <select
                className="input"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">— uncategorised —</option>
                {filteredCats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2.5 rounded-xl border border-border p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isShared}
                onChange={(e) => setIsShared(e.target.checked)}
                className="w-4 h-4"
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">Show on my public share page</div>
                <div className="text-[11px] text-fg-subtle">
                  Anyone with your share link can see this entry. Toggle in Settings.
                </div>
              </div>
            </label>
          </motion.form>
        )}
      </AnimatePresence>
    </Modal>
  )
}
