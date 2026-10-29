import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { SECONDARY_NAV } from '@/components/nav'

/** Mobile "More" tab: an iOS Settings-style grouped list of secondary pages. */
export function MorePage() {
  return (
    <div className="px-4 py-5 space-y-5 max-w-xl mx-auto">
      <h1 className="page-title">More</h1>
      <div className="card overflow-hidden divide-y divide-border/70">
        {SECONDARY_NAV.map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to} className="flex items-center gap-3.5 px-4 h-[52px] active:bg-bg-elev transition-colors">
            <span className="w-8 h-8 rounded-[9px] bg-bg-elev grid place-items-center text-fg-muted">
              <Icon className="w-[18px] h-[18px]" strokeWidth={1.8} />
            </span>
            <span className="flex-1 text-[15px]">{label}</span>
            <ChevronRight className="w-4 h-4 text-fg-subtle" />
          </Link>
        ))}
      </div>
    </div>
  )
}
