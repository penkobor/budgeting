import { motion } from 'framer-motion'
import { ArrowLeft, AlertTriangle, Sliders } from 'lucide-react'
import { occKey, type DistributionResult, type PlannedOccurrence } from '@/lib/projection'
import { formatMoney } from '@/lib/utils'

export interface RebalanceSelection {
  ruleId: string // for one-off: 'tx:<txId>'
  occurrenceDate: string
  newAmount: number // post-trim amount; 0 → skip / delete
  delta: number // positive: amount subtracted from original
  isOneOff?: boolean
  transactionId?: string
}

interface RebalanceStepProps {
  candidates: PlannedOccurrence[]
  overage: number
  currency: string
  // Lifted state
  selected: Set<string>
  setSelected: (next: Set<string>) => void
  mode: 'even' | 'manual'
  setMode: (m: 'even' | 'manual') => void
  manualDeltas: Map<string, number>
  setManualDeltas: (next: Map<string, number>) => void
  evenResult: DistributionResult
  totalCovered: number
}

/**
 * Step 2 inside AddTransactionDialog. Pure presentation — all state lifted
 * to the parent so the parent's footer knows coverage status.
 */
export function RebalanceStep({
  candidates,
  overage,
  currency,
  selected,
  setSelected,
  mode,
  setMode,
  manualDeltas,
  setManualDeltas,
  evenResult,
  totalCovered,
}: RebalanceStepProps) {
  const fullyCovered = totalCovered >= overage - 0.005
  const remainingToCover = Math.max(0, overage - totalCovered)

  return (
    <motion.div
      key="rebalance"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col"
    >
      <div className="rounded-2xl border border-negative/30 bg-negative/5 p-3 mb-3 flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-negative/15 text-negative grid place-items-center shrink-0">
          <AlertTriangle className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold">
            This will exceed your goal by {formatMoney(overage, currency)}
          </div>
          <div className="text-xs text-fg-subtle mt-0.5">
            Pick planned expenses below to trim and absorb the overage.
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-3 gap-2">
        <div className="text-xs text-fg-subtle min-w-0">
          To cover:{' '}
          <span
            className={`stat-num font-semibold ${fullyCovered ? 'text-positive' : 'text-fg'}`}
          >
            {formatMoney(totalCovered, currency)}
          </span>
          {' / '}
          <span className="stat-num">{formatMoney(overage, currency)}</span>
          {!fullyCovered && (
            <span className="text-negative ml-1 stat-num">
              · short {formatMoney(remainingToCover, currency)}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setMode(mode === 'even' ? 'manual' : 'even')}
          className="text-xs text-fg-muted hover:text-fg flex items-center gap-1 shrink-0"
        >
          <Sliders className="w-3 h-3" />
          {mode === 'even' ? 'Adjust manually' : 'Auto-distribute'}
        </button>
      </div>

      {candidates.length === 0 ? (
        <div className="rounded-xl bg-bg-elev p-4 text-sm text-fg-subtle text-center">
          No future planned expenses this month. You can still save the
          transaction; the goal will show as exceeded until you adjust it.
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-bg-card overflow-hidden">
          {candidates.map((c) => {
            const k = occKey(c.ruleId, c.date)
            const isSelected = selected.has(k)
            const evenDelta = evenResult.deltas.get(k) ?? 0
            const manualDelta = manualDeltas.get(k) ?? 0
            const delta = mode === 'even' ? evenDelta : manualDelta
            const isExcluded = mode === 'even' && evenResult.excluded.has(k) && isSelected
            const newAmount = Math.max(0, Math.round((c.amount - delta) * 100) / 100)

            return (
              <li
                key={k}
                className={`flex items-center gap-3 px-3 py-2.5 transition-colors ${
                  isSelected ? 'bg-accent/5' : ''
                }`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={(e) => {
                    const next = new Set(selected)
                    if (e.target.checked) next.add(k)
                    else {
                      next.delete(k)
                      if (mode === 'manual' && manualDeltas.has(k)) {
                        const m = new Map(manualDeltas)
                        m.delete(k)
                        setManualDeltas(m)
                      }
                    }
                    setSelected(next)
                  }}
                  className="w-5 h-5 rounded-md accent-accent shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{c.ruleName}</div>
                  <div className="text-[0.6875rem] text-fg-subtle stat-num">
                    {c.date} · was {formatMoney(c.amount, currency)}
                  </div>
                </div>

                {isSelected && mode === 'manual' ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs text-fg-subtle">−</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={String(manualDelta || '')}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^\d.,]/g, '').replace(',', '.')
                        const n = Number(v)
                        const clamped = Number.isFinite(n) ? Math.min(Math.max(0, n), c.amount) : 0
                        const next = new Map(manualDeltas)
                        if (clamped > 0) next.set(k, Math.round(clamped * 100) / 100)
                        else next.delete(k)
                        setManualDeltas(next)
                      }}
                      className="w-20 text-right text-sm stat-num bg-bg-elev rounded-md px-2 py-1 outline-none focus:ring-1 focus:ring-accent/60"
                      placeholder="0"
                    />
                  </div>
                ) : isSelected && delta > 0 ? (
                  <div className="text-right shrink-0">
                    <div className="text-xs text-negative stat-num">
                      −{formatMoney(delta, currency)}
                    </div>
                    <div className="text-[0.6875rem] text-fg-subtle stat-num">
                      → {formatMoney(newAmount, currency)}
                    </div>
                  </div>
                ) : isExcluded ? (
                  <div className="text-[0.6875rem] text-fg-subtle italic shrink-0">fully used</div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </motion.div>
  )
}

export function RebalanceStepFooter({
  fullyCovered,
  applying,
  onApply,
  onSaveAnyway,
  onBack,
}: {
  fullyCovered: boolean
  applying?: boolean
  onApply: () => void
  onSaveAnyway: () => void
  onBack: () => void
}) {
  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="btn-ghost flex items-center"
        aria-label="Back"
      >
        <ArrowLeft className="w-4 h-4" />
        <span className="hidden md:inline ml-1">Back</span>
      </button>
      <button type="button" onClick={onSaveAnyway} className="btn-outline">
        Save anyway
      </button>
      <button
        type="button"
        onClick={onApply}
        disabled={!fullyCovered || applying}
        className="btn-primary"
      >
        {applying ? 'Applying…' : 'Apply & save'}
      </button>
    </>
  )
}
