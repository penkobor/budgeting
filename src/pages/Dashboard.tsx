import { useSearchParams } from 'react-router-dom'
import { Sun, Calendar, CalendarDays, TrendingUp, ShoppingBag } from 'lucide-react'
import { TodayLens } from './lenses/TodayLens'
import { WeekLens } from './lenses/WeekLens'
import { MonthLens } from './lenses/MonthLens'
import { ForecastLens } from './lenses/ForecastLens'
import { PlanLens } from './lenses/PlanLens'

const LENSES = [
  { id: 'today', label: 'Today', icon: Sun },
  { id: 'week', label: 'Week', icon: Calendar },
  { id: 'month', label: 'Month', icon: CalendarDays },
  { id: 'forecast', label: 'Forecast', icon: TrendingUp },
  { id: 'plan', label: 'Plan', icon: ShoppingBag },
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
    const next = new URLSearchParams(params)
    if (id === 'today') next.delete('lens')
    else next.set('lens', id)
    setParams(next, { replace: true })
  }

  return (
    <div className="p-4 md:p-8 space-y-4 md:space-y-6 max-w-7xl mx-auto">
      {/* Period switcher — floating liquid-glass pills (no bar bg, each chip is its own glass element) */}
      <div className="sticky top-0 z-30 -mx-4 md:-mx-8 px-4 md:px-8 py-2 -mt-4 md:-mt-8 mb-2 pointer-events-none">
        <div className="flex gap-2 overflow-x-auto -mx-1 px-1 py-1 pointer-events-auto">
          {LENSES.map(({ id, label, icon: Icon }) => {
            const active = lens === id
            return (
              <button
                key={id}
                onClick={() => setLens(id)}
                className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-medium transition-all ${active ? '!bg-white !text-bg !border-white/0 shadow-soft' : 'glass text-fg hover:text-fg'}`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {lens === 'today' && <TodayLens />}
      {lens === 'week' && <WeekLens />}
      {lens === 'month' && <MonthLens />}
      {lens === 'forecast' && <ForecastLens />}
      {lens === 'plan' && <PlanLens />}
    </div>
  )
}
