import { Command } from 'cmdk'
import { useNavigate } from 'react-router-dom'
import { useUi } from '@/store/ui'
import {
  LayoutDashboard, Table, Repeat, Tags, Settings as SettingsIcon,
  Plus, Moon, Sun, LogOut, Search,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useEffect } from 'react'

interface CommandPaletteProps {
  onAdd: () => void
}

export function CommandPalette({ onAdd }: CommandPaletteProps) {
  const open = useUi((s) => s.paletteOpen)
  const setOpen = useUi((s) => s.setPaletteOpen)
  const toggleTheme = useUi((s) => s.toggleTheme)
  const theme = useUi((s) => s.theme)
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  if (!open) return null

  const go = (path: string) => {
    setOpen(false)
    navigate(path)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] animate-fade-in" onClick={() => setOpen(false)}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <Command
        className="relative w-[92vw] max-w-xl card overflow-hidden animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 border-b border-border">
          <Search className="w-4 h-4 text-fg-subtle" />
          <Command.Input
            autoFocus
            placeholder="Search or jump to…"
            className="flex-1 bg-transparent py-3.5 text-sm placeholder:text-fg-subtle outline-none"
          />
          <kbd className="text-[0.625rem] font-mono text-fg-subtle">ESC</kbd>
        </div>
        <Command.List className="max-h-80 overflow-y-auto p-2">
          <Command.Empty className="py-8 text-center text-sm text-fg-muted">No results.</Command.Empty>

          <Command.Group heading="Actions" className="text-xs text-fg-subtle px-2 pb-1 pt-2 [&_[cmdk-group-heading]]:label">
            <Item onSelect={() => { setOpen(false); onAdd() }} icon={<Plus className="w-4 h-4" />} label="Add transaction" hint="N" />
            <Item onSelect={toggleTheme} icon={theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />} label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} />
            <Item onSelect={async () => { await supabase.auth.signOut() }} icon={<LogOut className="w-4 h-4" />} label="Sign out" />
          </Command.Group>

          <Command.Group heading="Go to">
            <Item onSelect={() => go('/')} icon={<LayoutDashboard className="w-4 h-4" />} label="Dashboard" />
            <Item onSelect={() => go('/ledger')} icon={<Table className="w-4 h-4" />} label="Ledger" />
            <Item onSelect={() => go('/recurring')} icon={<Repeat className="w-4 h-4" />} label="Recurring" />
            <Item onSelect={() => go('/categories')} icon={<Tags className="w-4 h-4" />} label="Categories" />
            <Item onSelect={() => go('/settings')} icon={<SettingsIcon className="w-4 h-4" />} label="Settings" />
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  )
}

function Item({ onSelect, icon, label, hint }: { onSelect: () => void; icon: React.ReactNode; label: string; hint?: string }) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm cursor-pointer
                 data-[selected=true]:bg-accent/10 data-[selected=true]:text-accent
                 transition-colors"
    >
      <span className="text-fg-muted">{icon}</span>
      <span className="flex-1">{label}</span>
      {hint && <kbd className="text-[0.625rem] font-mono text-fg-subtle">{hint}</kbd>}
    </Command.Item>
  )
}
