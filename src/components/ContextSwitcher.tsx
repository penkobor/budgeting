import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, Check, Plus, User, Users, Settings as SettingsIcon } from 'lucide-react'
import { useUi } from '@/store/ui'
import { useSpaces } from '@/hooks/spaces'
import { cn } from '@/lib/utils'

interface ContextSwitcherProps {
  variant?: 'sidebar' | 'header'
}

/**
 * Switches between Personal and any Joint space context. The selected
 * `currentSpaceId` lives in `useUi` (zustand, persisted) and downstream
 * screens (Dashboard, Ledger, Recurring, time-lenses) read it to filter.
 */
export function ContextSwitcher({ variant = 'sidebar' }: ContextSwitcherProps) {
  const navigate = useNavigate()
  const { currentSpaceId, setCurrentSpaceId } = useUi()
  const { data: spaces = [] } = useSpaces()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click / escape
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // If the persisted currentSpaceId no longer maps to a known space, snap to Personal.
  useEffect(() => {
    if (!currentSpaceId) return
    if (spaces.length === 0) return
    if (!spaces.some((s) => s.id === currentSpaceId)) setCurrentSpaceId(null)
  }, [spaces, currentSpaceId, setCurrentSpaceId])

  const current = currentSpaceId ? spaces.find((s) => s.id === currentSpaceId) : null
  const isJoint = !!current

  const triggerClass =
    variant === 'sidebar'
      ? cn(
          'w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border transition-colors',
          isJoint
            ? 'bg-accent/10 text-accent border-accent/30'
            : 'bg-bg-elev text-fg border-border hover:bg-bg-elev/70'
        )
      : cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors glass',
          isJoint ? 'text-accent border-accent/30' : 'text-fg border-border'
        )

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((v) => !v)} className={triggerClass} aria-expanded={open} aria-haspopup="listbox">
        {isJoint ? <Users className="w-4 h-4 shrink-0" /> : <User className="w-4 h-4 shrink-0" />}
        <span className="truncate flex-1 text-left">{isJoint ? `Joint: ${current!.name}` : 'Personal'}</span>
        <ChevronDown className={cn('w-3.5 h-3.5 opacity-60 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          role="listbox"
          className={cn(
            'absolute z-50 min-w-[14rem] rounded-2xl border border-border bg-bg-card shadow-2xl backdrop-blur p-1.5',
            variant === 'sidebar' ? 'left-0 right-0 top-full mt-1' : 'right-0 top-full mt-1.5 max-h-[60vh] overflow-auto'
          )}
        >
          <button
            onClick={() => {
              setCurrentSpaceId(null)
              setOpen(false)
            }}
            className={cn(
              'w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm hover:bg-bg-elev',
              !isJoint && 'bg-bg-elev'
            )}
            role="option"
            aria-selected={!isJoint}
          >
            <User className="w-4 h-4" />
            <span className="flex-1 text-left">Personal</span>
            {!isJoint && <Check className="w-4 h-4 text-accent" />}
          </button>

          {spaces.length > 0 && <div className="my-1 h-px bg-border" />}

          {spaces.map((s) => {
            const active = s.id === currentSpaceId
            return (
              <div key={s.id} className={cn('flex items-center rounded-xl', active && 'bg-bg-elev')}>
                <button
                  onClick={() => {
                    setCurrentSpaceId(s.id)
                    setOpen(false)
                  }}
                  className="flex-1 flex items-center gap-2 px-3 py-2 text-sm hover:bg-bg-elev rounded-xl"
                  role="option"
                  aria-selected={active}
                >
                  <Users className="w-4 h-4" />
                  <span className="flex-1 text-left truncate">{s.name}</span>
                  {active && <Check className="w-4 h-4 text-accent" />}
                </button>
                <button
                  onClick={() => {
                    setOpen(false)
                    navigate(`/spaces/${s.id}`)
                  }}
                  className="p-2 mr-1 rounded-lg text-fg-subtle hover:bg-bg-elev hover:text-fg"
                  aria-label={`Manage ${s.name}`}
                  title="Manage space"
                >
                  <SettingsIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            )
          })}

          <div className="my-1 h-px bg-border" />
          <button
            onClick={() => {
              setOpen(false)
              navigate('/settings')
            }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-fg-muted hover:bg-bg-elev hover:text-fg"
          >
            <Plus className="w-4 h-4" />
            <span className="flex-1 text-left">{spaces.length === 0 ? 'Create a space…' : 'Manage spaces…'}</span>
          </button>
        </div>
      )}
    </div>
  )
}
