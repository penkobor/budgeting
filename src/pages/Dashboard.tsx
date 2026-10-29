import { Navigate, useSearchParams } from 'react-router-dom'
import { TodayLens } from './lenses/TodayLens'

/** Where the old `/?lens=…` links now live. */
const LEGACY_LENS_ROUTES: Record<string, string> = {
  week: '/week',
  month: '/plan',
  forecast: '/plan?view=forecast',
  plan: '/plan?view=purchases',
  shared: '/shared',
}

export function Dashboard() {
  const [params] = useSearchParams()
  const legacy = LEGACY_LENS_ROUTES[params.get('lens') ?? '']
  if (legacy) return <Navigate to={legacy} replace />

  return (
    <div className="px-4 py-5 md:px-10 md:py-10 max-w-3xl mx-auto">
      <TodayLens />
    </div>
  )
}

/** Wraps a lens that used to live behind a Dashboard chip as its own page. */
export function LensPage({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-5 md:px-10 md:py-10 space-y-6 md:space-y-8 max-w-4xl mx-auto">{children}</div>
}
