import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Ellipsis, Plus, Search, type LucideIcon } from 'lucide-react'
import { PRIMARY_NAV, SECONDARY_NAV } from './nav'
import { useUi } from '@/store/ui'
import { cn } from '@/lib/utils'
import { useState, useEffect } from 'react'
import { AddTransactionDialog } from './AddTransactionDialog'
import { CommandPalette } from './CommandPalette'

const MOBILE_TABS = [...PRIMARY_NAV, { to: '/more', label: 'More', icon: Ellipsis }] as const

export function Layout() {
  const { setPaletteOpen } = useUi()
  const [addOpen, setAddOpen] = useState(false)
  const { pathname } = useLocation()

  // A new page starts at the top, not at the previous page's scroll offset.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  // Global hotkeys: Cmd/Ctrl+K palette, N quick-add
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(true)
      } else if (e.key.toLowerCase() === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT' && !(e.target as HTMLElement)?.isContentEditable) {
          e.preventDefault()
          setAddOpen(true)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setPaletteOpen])

  return (
    <div className="min-h-screen flex">
      {/* Sidebar (desktop only) */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col sticky top-0 h-screen bg-bg-elev/40 border-r border-border/60">
        <div className="px-5 pt-6 pb-4 flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-[9px] bg-fg text-bg grid place-items-center text-[13px] font-semibold">
            B
          </div>
          <div className="font-semibold tracking-[-0.01em]">Budget</div>
        </div>

        <div className="px-3">
          <button onClick={() => setAddOpen(true)} className="btn-primary w-full !justify-start">
            <Plus className="w-4 h-4" /> Add entry
            <kbd className="ml-auto text-[11px] opacity-60">N</kbd>
          </button>
        </div>

        <nav className="px-3 pt-5 flex-1 overflow-y-auto space-y-6">
          <div className="space-y-0.5">
            {PRIMARY_NAV.map((item) => <SidebarLink key={item.to} {...item} />)}
          </div>
          <div className="space-y-0.5">
            <div className="px-3 pb-1.5 text-[12px] font-medium text-fg-subtle">More</div>
            {SECONDARY_NAV.map((item) => <SidebarLink key={item.to} {...item} quiet />)}
          </div>
        </nav>

        <div className="p-3">
          <button
            onClick={() => setPaletteOpen(true)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-fg-muted hover:bg-bg-elev hover:text-fg transition-colors"
          >
            <Search className="w-4 h-4" /> Search
            <kbd className="ml-auto text-[11px] text-fg-subtle">⌘K</kbd>
          </button>
        </div>
      </aside>

      {/* Mobile: floating tab bar + separate add button, iOS 26 style */}
      <div className="md:hidden fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pointer-events-none">
        <div className="flex items-end gap-3">
          <nav className="glass flex-1 rounded-full grid grid-cols-4 p-1 pointer-events-auto">
            {MOBILE_TABS.map(({ to, label, icon: Icon, ...rest }) => (
              <NavLink
                key={to}
                to={to}
                end={'end' in rest ? rest.end : false}
                className={({ isActive }) =>
                  cn(
                    'flex flex-col items-center justify-center gap-0.5 h-[52px] rounded-full text-[10px] font-medium transition-colors',
                    isActive ? 'text-fg bg-fg/[0.07]' : 'text-fg-muted',
                  )
                }
              >
                <Icon className="w-[22px] h-[22px]" strokeWidth={1.8} />
                {label}
              </NavLink>
            ))}
          </nav>
          <button
            onClick={() => setAddOpen(true)}
            className="pointer-events-auto w-[60px] h-[60px] shrink-0 rounded-full bg-fg text-bg grid place-items-center shadow-[0_8px_24px_-6px_rgb(0_0_0/0.35)]"
            aria-label="Add entry"
          >
            <Plus className="w-6 h-6" strokeWidth={2.2} />
          </button>
        </div>
      </div>

      <main className="flex-1 min-w-0 pt-[calc(env(safe-area-inset-top)+12px)] pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:pt-0 md:pb-0">
        <Outlet />
      </main>

      <AddTransactionDialog open={addOpen} onOpenChange={setAddOpen} />
      <CommandPalette onAdd={() => setAddOpen(true)} />
    </div>
  )
}

function SidebarLink({
  to, label, icon: Icon, end, quiet,
}: { to: string; label: string; icon: LucideIcon; end?: boolean; quiet?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 px-3 rounded-lg text-sm transition-colors',
          quiet ? 'py-1.5' : 'py-2 font-medium',
          isActive ? 'bg-fg/[0.07] text-fg' : 'text-fg-muted hover:bg-bg-elev hover:text-fg',
        )
      }
    >
      <Icon className="w-4 h-4" strokeWidth={1.8} />
      {label}
    </NavLink>
  )
}
