import { useId, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Target, CheckCircle2, AlertTriangle, Plus, Pencil } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import {
  useMonthlyGoal,
  useMonthlyGoalsInRange,
  useUpsertMonthlyGoals,
  useDeleteMonthlyGoal,
} from '@/hooks/queries'
import { formatMoney, goalMonths } from '@/lib/utils'
import { pushToast } from '@/components/ui/Toast'

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
  const { data: goal, isLoading, isError } = useMonthlyGoal(yearMonth)
  const upsert = useUpsertMonthlyGoals()
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
        disabled={isLoading || isError}
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
        aria-haspopup="dialog"
      >
        <div className="flex items-center justify-between">
          <div className="label flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5" />
            Monthly goal
          </div>
          <span className="flex items-center gap-2 text-xs text-fg-muted">
            {status === 'on-track' && <CheckCircle2 className="w-4 h-4 text-positive" />}
            {status === 'over' && <AlertTriangle className="w-4 h-4 text-negative" />}
            {goal ? <Pencil className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {goal ? 'Edit' : 'Set goal'}
          </span>
        </div>

        {isLoading ? (
          <div className="mt-2 h-7 w-32 rounded-md bg-bg-elev animate-pulse" />
        ) : isError ? (
          <div className="mt-2 text-sm text-negative" role="alert">Could not load this month’s goal. Try refreshing.</div>
        ) : !goal ? (
          <>
            <div className="mt-1.5 text-xl md:text-2xl font-semibold">Set a goal</div>
            <div className="text-[11px] md:text-xs text-fg-subtle mt-1">
              Choose the balance you want to keep at the end of {monthLabel(yearMonth)}.
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
            <div className="text-xs text-fg-muted mt-1">Target balance · {monthLabel(yearMonth)}</div>
            <div className="text-[11px] md:text-xs text-fg-subtle mt-1 stat-num">
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

      {editing && (
        <GoalEditSheet
          key={yearMonth}
          open
          onOpenChange={setEditing}
          yearMonth={yearMonth}
          currentAmount={goal ? Number(goal.amount) : null}
          currency={currency}
          pending={upsert.isPending || del.isPending}
          onSave={async (amount, months) => {
            await upsert.mutateAsync(months.map((year_month) => ({ year_month, amount })))
            pushToast(months.length === 1 ? 'Monthly goal saved' : `Goals saved for ${months.length} months`)
            setEditing(false)
          }}
          onClear={async () => {
            await del.mutateAsync(yearMonth)
            pushToast('Monthly goal cleared')
            setEditing(false)
          }}
        />
      )}
    </>
  )
}

function monthLabel(yearMonth: string) {
  const [y, m] = yearMonth.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

interface GoalEditSheetProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  yearMonth: string
  currentAmount: number | null
  currency: string
  pending: boolean
  onSave: (amount: number, months: string[]) => Promise<void>
  onClear: () => Promise<void>
}

function GoalEditSheet({ open, onOpenChange, yearMonth, currentAmount, currency, pending, onSave, onClear }: GoalEditSheetProps) {
  const formId = useId()
  const [value, setValue] = useState(currentAmount != null ? String(currentAmount) : '')
  const [through, setThrough] = useState(yearMonth)
  const [error, setError] = useState<string | null>(null)
  const months = goalMonths(yearMonth, through)
  const { data: existing = [], isPending: loadingGoals, isError: goalsError } = useMonthlyGoalsInRange(
    yearMonth, through, months.length > 1,
  )
  const numeric = Number(value.replace(/\s/g, '').replace(',', '.'))
  const valid = Number.isFinite(numeric) && numeric > 0 && numeric <= 999999999999.99 && /^\d+(\.\d{1,2})?$/.test(String(numeric))
  const rangeReady = months.length === 1 || (!loadingGoals && !goalsError)
  const [y, m] = yearMonth.split('-').map(Number)
  const maxMonth = new Date(y, m + 10, 1)
  const maxThrough = `${maxMonth.getFullYear()}-${String(maxMonth.getMonth() + 1).padStart(2, '0')}`

  async function save() {
    if (!valid || !months.length || !rangeReady || pending) return
    setError(null)
    try {
      await onSave(numeric, months)
    } catch {
      setError('Could not save your goals. Your changes are still here — please try again.')
    }
  }

  async function clear() {
    if (pending) return
    setError(null)
    try {
      await onClear()
    } catch {
      setError('Could not clear this goal. Please try again.')
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => { if (!pending) onOpenChange(next) }}
      title={currentAmount != null ? 'Edit monthly goal' : 'Set monthly goal'}
      footer={
        <>
          {currentAmount != null && (
            <button type="button" onClick={clear} disabled={pending} className="btn-outline text-negative mr-auto">
              Clear this month
            </button>
          )}
          <button type="submit" form={formId} disabled={!valid || !months.length || !rangeReady || pending} className="btn-primary">
            {pending ? 'Saving…' : months.length > 1 ? `Save ${months.length} goals` : 'Save goal'}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={(e) => { e.preventDefault(); void save() }} className="space-y-4">
        <div>
          <div className="label">Target balance at the end of</div>
          <div className="font-semibold mt-0.5">{monthLabel(yearMonth)}</div>
        </div>
        <label className="block">
          <span className="label">Amount ({currency})</span>
          <input
            type="text"
            inputMode="decimal"
            value={value}
            disabled={pending}
            onChange={(e) => setValue(e.target.value.replace(/[^\d.,\s]/g, ''))}
            placeholder="0"
            className="mt-1 w-full text-2xl md:text-3xl font-semibold stat-num bg-bg-elev rounded-xl px-4 py-3 outline-none ring-1 ring-transparent focus:ring-border-strong transition-shadow"
          />
        </label>
        <label className="block">
          <span className="label">Apply the same goal through</span>
          <select value={through} disabled={pending}
            onChange={(e) => setThrough(e.target.value)} className="input mt-1 w-full">
            {goalMonths(yearMonth, maxThrough).map((month) => (
              <option key={month} value={month}>{monthLabel(month)}{month === yearMonth ? ' · only this month' : ''}</option>
            ))}
          </select>
        </label>
        <div className="text-xs text-fg-muted space-y-2" aria-live="polite">
          {!months.length ? (
            <p role="alert" className="text-negative">Choose a range of 1–12 months starting in {monthLabel(yearMonth)}.</p>
          ) : months.length === 1 ? (
            <p>Only {monthLabel(yearMonth)} will change. Other months keep their goals.</p>
          ) : loadingGoals ? (
            <p>Checking existing goals…</p>
          ) : goalsError ? (
            <p role="alert" className="text-negative">Could not load existing goals. Reopen this editor to try again.</p>
          ) : (
            <>
              <p>{months.length} months: {monthLabel(yearMonth)} – {monthLabel(through)}. Existing goals in this range will be replaced.</p>
              <ul className="space-y-1 max-h-36 overflow-y-auto">
                {months.map((month) => {
                  const previous = existing.find((g) => g.year_month === month)
                  return <li key={month} className="flex justify-between gap-3">
                    <span>{monthLabel(month)}</span>
                    <span className="stat-num">{previous ? formatMoney(Number(previous.amount), currency) : 'Not set'} → {valid ? formatMoney(numeric, currency) : '…'}</span>
                  </li>
                })}
              </ul>
            </>
          )}
        </div>
        <p className="text-xs text-fg-muted leading-relaxed">
          This is the balance you want to keep, including assets marked “include in balance”.
          Goals are used for warnings and optional expense rebalancing. Changing a goal does not change the forecast or your transactions.
        </p>
        {error && <p role="alert" className="text-sm text-negative">{error}</p>}
      </form>
    </Modal>
  )
}
