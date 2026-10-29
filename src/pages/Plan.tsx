import { useSearchParams } from 'react-router-dom'
import { MonthLens } from './lenses/MonthLens'
import { ForecastLens } from './lenses/ForecastLens'
import { PlanLens } from './lenses/PlanLens'
import { Segmented } from '@/components/ui/Segmented'

const VIEWS = [
  { value: 'month', label: 'This month' },
  { value: 'forecast', label: 'Forecast' },
  { value: 'purchases', label: 'Purchases' },
] as const

type View = typeof VIEWS[number]['value']

function isView(v: string | null): v is View {
  return VIEWS.some((x) => x.value === v)
}

/** Plan tab: the month and its goal, the long-range forecast, and big purchases. */
export function PlanPage() {
  const [params, setParams] = useSearchParams()
  const param = params.get('view')
  const view: View = isView(param) ? param : 'month'

  return (
    <div className="px-4 py-5 md:px-10 md:py-10 space-y-6 md:space-y-8 max-w-4xl mx-auto">
      <Segmented
        value={view}
        onChange={(v) => setParams(v === 'month' ? {} : { view: v }, { replace: true })}
        options={VIEWS}
        className="max-w-md"
      />
      {view === 'month' && <MonthLens />}
      {view === 'forecast' && <ForecastLens />}
      {view === 'purchases' && <PlanLens />}
    </div>
  )
}
