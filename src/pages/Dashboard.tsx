import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Sun, Calendar, CalendarDays, TrendingUp, ShoppingBag, Share2 } from 'lucide-react'
import { TodayLens } from './lenses/TodayLens'
import { WeekLens } from './lenses/WeekLens'
import { MonthLens } from './lenses/MonthLens'
import { ForecastLens } from './lenses/ForecastLens'
import { PlanLens } from './lenses/PlanLens'
import { SharedLens } from './lenses/SharedLens'
import { GoalAlertRibbon } from '@/components/GoalAlertRibbon'
import { haptics } from '@/lib/haptics'

const LENSES = [
  { id: 'today', label: 'Today', icon: Sun },
  { id: 'week', label: 'Week', icon: Calendar },
  { id: 'month', label: 'Month', icon: CalendarDays },
  { id: 'forecast', label: 'Forecast', icon: TrendingUp },
  { id: 'plan', label: 'Plan', icon: ShoppingBag },
  { id: 'shared', label: 'Shared', icon: Share2 },
] as const

type LensId = typeof LENSES[number]['id']

function isLens(v: string | null): v is LensId {
  return !!v && (LENSES as readonly { id: string }[]).some((l) => l.id === v)
}

export function Dashboard() {
  const [params, setParams] = useSearchParams()
  const param = params.get('lens')
  const lens: LensId = isLens(param) ? param : 'today'

  const setLens = (id: LensId) => {
    if (id !== lens) haptics.selection()
    const next = new URLSearchParams(params)
    if (id === 'today') next.delete('lens')
    else next.set('lens', id)
    setParams(next, { replace: true })
  }

  return (
    <div className="p-4 md:p-8 space-y-4 md:space-y-6 max-w-7xl mx-auto">
      {/* Lens switcher — HIG-style segmented control: a single glass track with a
         sliding accent pill that animates between segments via framer-motion's
         shared `layoutId`. Wraps to a horizontal scroller on narrow viewports
         since six segments don't fit on a phone width. */}
      <div className="sticky top-[max(env(safe-area-inset-top),0px)] md:top-0 z-30 -mx-4 md:-mx-8 px-4 md:px-8 py-2 -mt-4 md:-mt-8 mb-2 pointer-events-none">
        <div className="pointer-events-auto inline-flex glass rounded-full p-1 gap-0.5 max-w-full overflow-x-auto">
          {LENSES.map(({ id, label, icon: Icon }) => {
            const active = lens === id
            return (
              <button
                key={id}
                onClick={() => setLens(id)}
                aria-pressed={active}
                className={`relative shrink-0 inline-flex items-center gap-1.5 px-3.5 min-h-[36px] rounded-full text-callout font-medium transition-colors ${
                  active ? 'text-accent-fg' : 'text-fg-muted hover:text-fg'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="lens-pill"
                    className="absolute inset-0 rounded-full bg-accent shadow-soft"
                    transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                    aria-hidden
                  />
                )}
                <span className="relative z-10 inline-flex items-center gap-1.5">
                  <Icon className="w-4 h-4" />
                  {label}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {lens !== 'month' && <GoalAlertRibbon />}

      {lens === 'today' && <TodayLens />}
      {lens === 'week' && <WeekLens />}
      {lens === 'month' && <MonthLens />}
      {lens === 'forecast' && <ForecastLens />}
      {lens === 'plan' && <PlanLens />}
      {lens === 'shared' && <SharedLens />}
    </div>
  )
}
