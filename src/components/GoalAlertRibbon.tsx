import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, ChevronRight } from 'lucide-react'
import {
  useAssets,
  useMonthlyGoal,
  useMonthlyOpening,
  useTransactionsInRange,
  useRecurringRules,
  useRecurringOverridesInRange,
  useSettings,
} from '@/hooks/queries'
import { computeProjectedEndBalance } from '@/lib/projection'
import { daysInMonth, formatMoney, monthKey } from '@/lib/utils'

/**
 * Sticky ribbon shown across Dashboard lenses when the current month's
 * projected end-of-month balance is below the user's goal. Tapping the
 * ribbon flips Dashboard to the Month lens where the user can edit the
 * goal or review the budget.
 */
export function GoalAlertRibbon() {
  const today = new Date()
  const monthIso = monthKey(today)
  const lastDay = daysInMonth(today.getFullYear(), today.getMonth())
  const toIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const { data: settings } = useSettings()
  const { data: goal } = useMonthlyGoal(monthIso)
  const { data: opening } = useMonthlyOpening(monthIso)
  const { data: txs = [] } = useTransactionsInRange(monthIso, toIso)
  const { data: rules = [] } = useRecurringRules()
  const { data: overrides = [] } = useRecurringOverridesInRange(monthIso, toIso)
  const { data: assets = [] } = useAssets()

  const currency = settings?.currency ?? 'CZK'
  const assetBoost = useMemo(
    () => assets.reduce((s, a) => s + (a.include_in_balance ? Number(a.value) : 0), 0),
    [assets],
  )

  const projectedEnd = useMemo(() => {
    return computeProjectedEndBalance(
      monthIso,
      opening?.opening_balance ?? 0,
      txs,
      rules,
      overrides,
      today,
      assetBoost,
    )
  }, [monthIso, opening, txs, rules, overrides, today, assetBoost])

  const overBy = goal ? Number(goal.amount) - projectedEnd : 0
  const showRibbon = !!goal && overBy > 0

  return (
    <AnimatePresence>
      {showRibbon && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="rounded-xl bg-negative/10 ring-1 ring-negative/30 text-fg flex items-center gap-3 p-3 md:p-3.5"
        >
          <div className="w-8 h-8 rounded-lg grid place-items-center bg-negative/15 text-negative shrink-0">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">
              You're projected to miss your monthly goal by{' '}
              <span className="stat-num">{formatMoney(overBy, currency)}</span>
            </div>
            <div className="text-[0.6875rem] md:text-xs text-fg-muted mt-0.5 stat-num">
              Goal {formatMoney(Number(goal!.amount), currency)} · projected{' '}
              {formatMoney(projectedEnd, currency)}
            </div>
          </div>
          <Link
            to="/?lens=month"
            className="btn-ghost shrink-0 !px-2.5 !py-1.5 text-xs flex items-center gap-1"
          >
            Review
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
