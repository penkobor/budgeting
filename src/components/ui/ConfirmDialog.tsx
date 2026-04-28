import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { Modal } from './Modal'
import { haptics } from '@/lib/haptics'

/**
 * App-wide confirm dialog using our Modal (so destructive prompts stop using
 * the OS-chrome `window.confirm()` which clashes with the rest of the UI).
 *
 * Usage:
 *   const confirm = useConfirm()
 *   if (await confirm({ title: 'Delete this transaction?', destructive: true })) {
 *     deleteTx.mutate(id)
 *   }
 */

export interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Renders the confirm button in red and adds a heavy haptic on confirm. */
  destructive?: boolean
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext)
  if (!fn) throw new Error('useConfirm must be used inside <ConfirmDialogProvider>')
  return fn
}

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [opts, setOpts] = useState<ConfirmOptions | null>(null)
  const resolverRef = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback<ConfirmFn>((options) => {
    setOpts(options)
    setOpen(true)
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve
    })
  }, [])

  const handle = useCallback(
    (value: boolean) => {
      setOpen(false)
      if (value && opts?.destructive) haptics.heavy()
      const r = resolverRef.current
      resolverRef.current = null
      if (r) r(value)
    },
    [opts],
  )

  const value = useMemo(() => confirm, [confirm])

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Modal
        open={open}
        onOpenChange={(o) => {
          if (!o) handle(false)
        }}
        title={opts?.title}
        description={opts?.description}
        size="sm"
        footer={
          <>
            <button type="button" onClick={() => handle(false)} className="btn-ghost">
              {opts?.cancelLabel ?? 'Cancel'}
            </button>
            <button
              type="button"
              onClick={() => handle(true)}
              className={
                opts?.destructive
                  ? 'btn bg-negative text-white hover:bg-negative/90 shadow-soft'
                  : 'btn-primary'
              }
            >
              {opts?.confirmLabel ?? (opts?.destructive ? 'Delete' : 'Confirm')}
            </button>
          </>
        }
      >
        {opts?.description && (
          <p className="text-fg-muted text-callout">{opts.description}</p>
        )}
      </Modal>
    </ConfirmContext.Provider>
  )
}
