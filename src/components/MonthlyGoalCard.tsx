import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Target, CheckCircle2, AlertTriangle, Plus } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import {
  useMonthlyGoal,
  useUpsertMonthlyGoal,
  useDeleteMonthlyGoal,
} from '@/hooks/queries'
import { formatMoney } from '@/lib/utils'

interface MonthlyGoalCardProps {
  yearMonth: string // 'YYYY-MM'
  projectedEnd: number
  currency: string
}

/**
 * Goal hero card for MonthLens.
 * - Not-set: CTA to set a goal.
 * - On-track: green check + "On track to end at <projected>".
 * - Over-by-N: red alert + delta.
 * Tap card → edit sheet (number input + Save/Clear).
 */
export function MonthlyGoalCard({ yearMonth, projectedEnd, currency }: MonthlyGoalCardProps) {
  const { data: goal, isLoading } = useMonthlyGoal(yearMonth)
  const upsert = useUpsertMonthlyGoal()
  const del = useDeleteMonthlyGoal()
  const [editing, setEditing] = useState(false)

  const status = useMemo(() => {
    if (!goal) return 'not-set' as const
    return projectedEnd >= Number(goal.amount) ? 'on-track' : 'over'
  }, [goal, projectedEnd])

  const delta = goal ? projectedEnd - Number(goal.amount) : 0

  return (
    <>
      <motion.button
        type="button"
        onClick={() => setEditing(true)}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        whileTap={{ scale: 0.985 }}
        className={[
          'card p-4 md:p-5 w-full text-left transition-colors',
          status === 'on-track' && 'ring-1 ring-positive/30',
          status === 'over' && 'ring-1 ring-negative/40',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label={goal ? 'Edit monthly goal' : 'Set monthly goal'}
      >
        <div className="flex items-center justify-between">
          <div className="label flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5" />
            Monthly goal
          </div>
          {status === 'on-track' && <CheckCircle2 className="w-4 h-4 text-positive" />}
          {status === 'over' && <AlertTriangle className="w-4 h-4 text-negative" />}
          {status === 'not-set' && <Plus className="w-4 h-4 text-fg-subtle" />}
        </div>

        {isLoading ? (
          <div className="mt-2 h-7 w-32 rounded-md bg-bg-elev animate-pulse" />
        ) : !goal ? (
          <>
            <div className="mt-1.5 text-xl md:text-2xl font-semibold">Set a goal</div>
            <div className="text-[0.6875rem] md:text-xs text-fg-subtle mt-1">
              Target end-of-month balance — we’ll help you stay on track.
            </div>
          </>
        ) : (
          <>
            <div
              className={`mt-1.5 text-xl md:text-2xl font-semibold stat-num ${
                status === 'on-track' ? 'text-positive' : 'text-negative'
              }`}
            >
              {formatMoney(Number(goal.amount), currency)}
            </div>
            <div className="text-[0.6875rem] md:text-xs text-fg-subtle mt-1 stat-num">
              {status === 'on-track'
                ? `On track — projected ${formatMoney(projectedEnd, currency)}`
                : `Short by ${formatMoney(Math.abs(delta), currency)} — projected ${formatMoney(
                    projectedEnd,
                    currency,
                  )}`}
            </div>
          </>
        )}
      </motion.button>

      <GoalEditSheet
        open={editing}
        onOpenChange={setEditing}
        yearMonth={yearMonth}
        currentAmount={goal ? Number(goal.amount) : null}
        currency={currency}
        onSave={async (amount) => {
          await upsert.mutateAsync({ year_month: yearMonth, amount })
          setEditing(false)
        }}
        onClear={async () => {
          await del.mutateAsync(yearMonth)
          setEditing(false)
        }}
      />
    </>
  )
}

interface GoalEditSheetProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  yearMonth: string
  currentAmount: number | null
  currency: string
  onSave: (amount: number) => void | Promise<void>
  onClear: () => void | Promise<void>
}

function GoalEditSheet({
  open,
  onOpenChange,
  yearMonth,
  currentAmount,
  currency,
  onSave,
  onClear,
}: GoalEditSheetProps) {
  const [value, setValue] = useState<string>(currentAmount != null ? String(currentAmount) : '')

  // Reset value when sheet opens for a different month or currentAmount changes
  useEffect(() => {
    if (open) setValue(currentAmount != null ? String(currentAmount) : '')
  }, [open, currentAmount])

  const numeric = Number(value.replace(',', '.'))
  const valid = Number.isFinite(numeric) && numeric > 0

  const monthLabel = useMemo(() => {
    const [y, m] = yearMonth.split('-').map(Number)
    return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }, [yearMonth])

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={currentAmount != null ? 'Edit monthly goal' : 'Set monthly goal'}
      size="sm"
      footer={
        <>
          {currentAmount != null && (
            <button type="button" onClick={onClear} className="btn-outline text-negative">
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={() => valid && onSave(numeric)}
            disabled={!valid}
            className="btn-primary"
          >
            Save
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <div className="label">Target balance at end of</div>
          <div className="font-semibold mt-0.5">{monthLabel}</div>
        </div>

        <label className="block">
          <span className="label">Amount ({currency})</span>
          <input
            type="text"
            inputMode="decimal"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/[^\d.,]/g, ''))}
            placeholder="0"
            className="mt-1 w-full text-title-1 md:text-large-title font-semibold stat-num bg-bg-elev rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-accent/60"
          />
        </label>

        <p className="text-xs text-fg-subtle leading-relaxed">
          The app will warn you when an expense pushes the projected end-of-month
          balance below this number, and offer to trim future planned expenses to
          stay on track.
        </p>
      </div>
    </Modal>
  )
}
