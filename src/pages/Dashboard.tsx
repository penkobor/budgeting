import { useSearchParams } from 'react-router-dom'
import { Sun, Calendar, CalendarDays, TrendingUp } from 'lucide-react'
import { TodayLens } from './lenses/TodayLens'
import { WeekLens } from './lenses/WeekLens'
import { MonthLens } from './lenses/MonthLens'
import { ForecastLens } from './lenses/ForecastLens'

const LENSES = [
  { id: 'today', label: 'Today', icon: Sun },
  { id: 'week', label: 'Week', icon: Calendar },
  { id: 'month', label: 'Month', icon: CalendarDays },
  { id: 'forecast', label: 'Forecast', icon: TrendingUp },
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
      {/* Period switcher — sticky just under the safe-area inset */}
      <div className="flex gap-2 overflow-x-auto -mx-1 px-1 sticky top-0 bg-bg/85 backdrop-blur z-20 py-2 -my-2">
        {LENSES.map(({ id, label, icon: Icon }) => {
          const active = lens === id
          return (
            <button
              key={id}
              onClick={() => setLens(id)}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${active ? 'bg-accent text-accent-fg border-accent' : 'border-border text-fg-muted hover:text-fg hover:border-border-strong'}`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          )
        })}
      </div>

      {lens === 'today' && <TodayLens />}
      {lens === 'week' && <WeekLens />}
      {lens === 'month' && <MonthLens />}
      {lens === 'forecast' && <ForecastLens />}
    </div>
  )
}
