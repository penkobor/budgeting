import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Table, Repeat, Coins, Settings as SettingsIcon, Moon, Sun, LogOut, Plus, Command } from 'lucide-react'
import { useUi } from '@/store/ui'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import { AddTransactionDialog } from './AddTransactionDialog'
import { CommandPalette } from './CommandPalette'
import { useEffect } from 'react'

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/ledger', label: 'Ledger', icon: Table },
  { to: '/recurring', label: 'Recurring', icon: Repeat },
  { to: '/assets', label: 'Assets', icon: Coins },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
]

export function Layout() {
  const { theme, toggleTheme, setPaletteOpen } = useUi()
  const navigate = useNavigate()
  const [addOpen, setAddOpen] = useState(false)

  // Global hotkeys: Cmd/Ctrl+K palette, N quick-add
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(true)
      } else if (e.key.toLowerCase() === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !(e.target as HTMLElement)?.isContentEditable) {
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
      <aside className="hidden md:flex w-64 flex-col border-r border-border bg-bg-elev/50 backdrop-blur-sm">
        <div className="px-5 py-5 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-accent to-positive grid place-items-center text-accent-fg font-bold">
            ₿
          </div>
          <div>
            <div className="font-semibold leading-tight">Budget</div>
            <div className="text-[11px] text-fg-subtle leading-tight">plan · track · profit</div>
          </div>
        </div>
        <nav className="px-3 py-2 flex-1">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-accent/10 text-accent border border-accent/20'
                    : 'text-fg-muted hover:bg-bg-elev hover:text-fg border border-transparent'
                )
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 space-y-2 border-t border-border">
          <button onClick={() => setAddOpen(true)} className="btn-primary w-full">
            <Plus className="w-4 h-4" /> Quick add
            <kbd className="ml-auto text-[10px] opacity-70 font-mono">N</kbd>
          </button>
          <button onClick={() => setPaletteOpen(true)} className="btn-outline w-full">
            <Command className="w-4 h-4" /> Command
            <kbd className="ml-auto text-[10px] opacity-70 font-mono">⌘K</kbd>
          </button>
          <div className="flex gap-2">
            <button onClick={toggleTheme} className="btn-ghost flex-1" aria-label="Toggle theme">
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              onClick={async () => {
                await supabase.auth.signOut()
                navigate('/')
              }}
              className="btn-ghost flex-1"
              aria-label="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile bottom nav — floating Liquid Glass pill, concentric with iPhone screen curve */}
      <nav
        className="glass md:hidden fixed bottom-0 inset-x-4 z-30 rounded-[44px] mb-[calc(max(env(safe-area-inset-bottom),6px)-4px)] overflow-hidden"
      >
        <div className="grid grid-cols-5">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center py-2.5 text-[10px] gap-0.5 transition-colors',
                  isActive ? 'text-accent' : 'text-fg-muted'
                )
              }
            >
              <Icon className="w-5 h-5" />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Mobile FAB — Liquid Glass, sits above bottom nav + home indicator */}
      <button
        onClick={() => setAddOpen(true)}
        className="glass md:hidden fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 w-14 h-14 rounded-full text-accent grid place-items-center active:scale-95"
        aria-label="Add transaction"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* Main (mobile: padded for Dynamic Island + bottom nav; desktop: no extra padding) */}
      <main className="flex-1 min-w-0 pt-[max(env(safe-area-inset-top),12px)] pb-[calc(5rem+env(safe-area-inset-bottom))] md:pt-0 md:pb-0">
        <Outlet />
      </main>

      <AddTransactionDialog open={addOpen} onOpenChange={setAddOpen} />
      <CommandPalette onAdd={() => setAddOpen(true)} />
    </div>
  )
}
