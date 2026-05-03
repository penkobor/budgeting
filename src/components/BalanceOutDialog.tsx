import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Scale } from 'lucide-react'
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
  useMonthlyGoal,
  useMonthlyOpening,
  useRecurringOverridesInRange,
  useRecurringRules,
  useSettings,
  useTransactionsInRange,
  useUpsertTransaction,
} from '@/hooks/queries'
import { formatMoney, isoDate, monthKey, daysInMonth } from '@/lib/utils'
import { expandRuleInRange } from '@/lib/recurring'
import {
  computeProjectedEndBalance,
  distributeEvenly,
  effectiveOccurrenceAmount,
  listFuturePlannedExpenses,
  occKey,
  type PlannedOccurrence,
} from '@/lib/projection'
import type { TransactionInsert, RecurringOverrideInsert } from '@/lib/db.types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Step = 'balance-input' | 'rebalance'

export function BalanceOutDialog({ open, onOpenChange }: Props) {
  const today = useMemo(() => new Date(), [])
  const todayIso = isoDate(today)
  const monthIso = monthKey(today)
  const yearMonth = monthIso.slice(0, 7)
  const lastDay = daysInMonth(today.getFullYear(), today.getMonth())
  const toIso = `${yearMonth}-${String(lastDay).padStart(2, '0')}`

  const { data: settings } = useSettings()
  const { data: opening } = useMonthlyOpening(monthIso)
  const { data: txs = [] } = useTransactionsInRange(monthIso, toIso)
  const { data: rules = [] } = useRecurringRules()
  const { data: overrides = [] } = useRecurringOverridesInRange(monthIso, toIso)
  const { data: assets = [] } = useAssets()
  const { data: goal } = useMonthlyGoal(yearMonth)
  const upsertTx = useUpsertTransaction()
  const applyRebalanceMutation = useApplyRebalance()
  const currency = settings?.currency ?? 'CZK'

  const assetBoost = useMemo(
    () => assets.reduce((s, a) => s + (a.include_in_balance ? Number(a.value) : 0), 0),
    [assets],
  )

  // Compute the planned balance for end of today (same as TodayLens)
  const plannedBalance = useMemo(() => {
    const opening0 = opening?.opening_balance ?? 0
    let running = opening0
    const cutoffDay = today.getDate()
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
  }, [txs, rules, overrides, opening, monthIso, today])

  // UI state
  const [step, setStep] = useState<Step>('balance-input')
  const [actualBalance, setActualBalance] = useState('')

  // Rebalance state
  const [pendingTx, setPendingTx] = useState<TransactionInsert | null>(null)
  const [overage, setOverage] = useState(0)
  const [candidates, setCandidates] = useState<PlannedOccurrence[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [mode, setMode] = useState<'even' | 'manual'>('even')
  const [manualDeltas, setManualDeltas] = useState<Map<string, number>>(new Map())

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep('balance-input')
      setActualBalance('')
      setPendingTx(null)
      setOverage(0)
      setCandidates([])
      setSelected(new Set())
      setMode('even')
      setManualDeltas(new Map())
    }
  }, [open])

  const evenResult = useMemo(() => {
    const items = candidates.filter((c) => selected.has(occKey(c.ruleId, c.date)))
    return distributeEvenly(items, overage)
  }, [candidates, selected, overage])

  useEffect(() => {
    if (mode === 'manual' && manualDeltas.size === 0) {
      const seed = new Map<string, number>()
      evenResult.deltas.forEach((v, k) => seed.set(k, v))
      if (seed.size > 0) setManualDeltas(seed)
    }
  }, [mode])

  const totalCovered = useMemo(() => {
    if (mode === 'even') return evenResult.covered
    let sum = 0
    manualDeltas.forEach((v) => (sum += v))
    return Math.round(sum * 100) / 100
  }, [mode, evenResult, manualDeltas])

  const fullyCovered = totalCovered >= overage - 0.005

  // Computed difference
  const parsedActual = parseFloat(actualBalance.replace(',', '.'))
  const isValidInput = Number.isFinite(parsedActual) && parsedActual >= 0
  const diff = isValidInput ? plannedBalance - parsedActual : 0
  // diff > 0 → actual is lower → expense (spent more than planned)
  // diff < 0 → actual is higher → income (spent less than planned)

  const persistTransactionAndClose = async (tx: TransactionInsert) => {
    await upsertTx.mutateAsync(tx)
    onOpenChange(false)
  }

  const submit = async () => {
    if (!isValidInput || Math.abs(diff) < 0.01) return
    const signed = diff > 0 ? -Math.abs(diff) : Math.abs(diff)
    const txPayload: TransactionInsert = {
      occurred_on: todayIso,
      amount: signed,
      description: 'Balancing out',
      category_id: null,
      is_shared: false,
      recurring_rule_id: null,
      planned: true,
      confirmed_at: null,
    }

    // Check goal overage for expenses
    if (signed < 0 && goal && todayIso.startsWith(yearMonth)) {
      const txsWithNew = [
        ...txs,
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
        const cands = listFuturePlannedExpenses(monthIso, rules, overrides, txs)
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
        ? `Balanced · trimmed ${trimmed} planned ${trimmed === 1 ? 'expense' : 'expenses'} to keep your goal`
        : 'Balanced out successfully',
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
  const applying = upsertTx.isPending || applyRebalanceMutation.isPending
  const title = isRebalance ? 'Rebalance to stay on track' : 'Balance out'

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      footer={
        isRebalance ? (
          <RebalanceStepFooter
            fullyCovered={fullyCovered}
            applying={applying}
            onApply={applyRebalance}
            onSaveAnyway={saveAnyway}
            onBack={() => setStep('balance-input')}
          />
        ) : (
          <>
            <button type="button" onClick={() => onOpenChange(false)} className="btn-ghost">
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!isValidInput || Math.abs(diff) < 0.01 || applying}
              className="btn-primary"
            >
              {applying ? 'Saving…' : 'Balance out'}
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
          <motion.div
            key="balance-input"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-5"
          >
            {/* Planned balance display */}
            <div className="card p-4 space-y-1 bg-bg-elev/50">
              <div className="label">Planned balance (end of today)</div>
              <div className="stat-num text-2xl font-semibold">
                {formatMoney(plannedBalance + assetBoost, currency)}
              </div>
              {assetBoost > 0 && (
                <div className="text-[11px] text-fg-subtle">
                  cash {formatMoney(plannedBalance, currency)} + assets {formatMoney(assetBoost, currency)}
                </div>
              )}
            </div>

            {/* Actual balance input */}
            <div>
              <div className="label mb-1.5">Actual balance right now</div>
              <div className="relative">
                <Scale className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted" />
                <input
                  className="input stat-num text-lg pl-10"
                  inputMode="decimal"
                  placeholder="0"
                  value={actualBalance}
                  onChange={(e) => setActualBalance(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="text-xs text-fg-subtle mt-1.5">
                Enter your actual account balance. The system will compute the difference.
              </div>
            </div>

            {/* Computed diff preview */}
            {isValidInput && Math.abs(diff) >= 0.01 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="card p-4 space-y-1"
              >
                <div className="label">Adjustment needed</div>
                <div className={`stat-num text-xl font-semibold ${diff > 0 ? 'text-negative' : 'text-positive'}`}>
                  {diff > 0 ? '−' : '+'}{formatMoney(Math.abs(diff), currency)}
                </div>
                <div className="text-xs text-fg-subtle">
                  {diff > 0
                    ? 'You spent more than planned — will record as expense.'
                    : 'You have more than planned — will record as income.'}
                </div>
              </motion.div>
            )}

            {isValidInput && Math.abs(diff) < 0.01 && parsedActual > 0 && (
              <div className="card p-4 text-center text-fg-muted text-sm">
                Your balance matches the plan — no adjustment needed.
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  )
}
