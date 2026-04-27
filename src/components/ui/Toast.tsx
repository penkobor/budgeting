import { useEffect } from 'react'
import { create } from 'zustand'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, AlertTriangle, X } from 'lucide-react'

export type ToastTone = 'success' | 'error' | 'info'

interface Toast {
  id: number
  message: string
  tone: ToastTone
  ttl: number
}

interface ToastState {
  items: Toast[]
  push: (message: string, tone?: ToastTone, ttl?: number) => void
  dismiss: (id: number) => void
}

let _seq = 0

const useToastStore = create<ToastState>((set) => ({
  items: [],
  push: (message, tone = 'success', ttl = 3500) => {
    const id = ++_seq
    set((s) => ({ items: [...s.items, { id, message, tone, ttl }] }))
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((t) => t.id !== id) })),
}))

/** Imperative helper so non-component code (callbacks) can show a toast. */
export function pushToast(message: string, tone: ToastTone = 'success', ttl = 3500) {
  useToastStore.getState().push(message, tone, ttl)
}

/**
 * Toast container. Mount once near the app root; renders the stack of
 * toasts at the top-center on mobile and bottom-right on desktop.
 */
export function ToastHost() {
  const items = useToastStore((s) => s.items)
  const dismiss = useToastStore((s) => s.dismiss)

  return (
    <div
      className="fixed z-[80] pointer-events-none flex flex-col gap-2 px-3
        top-[max(env(safe-area-inset-top),0.75rem)] left-0 right-0 items-center
        md:top-auto md:bottom-4 md:right-4 md:left-auto md:items-end"
    >
      <AnimatePresence>
        {items.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </AnimatePresence>
    </div>
  )
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, toast.ttl)
    return () => clearTimeout(timer)
  }, [onDismiss, toast.ttl])

  const Icon = toast.tone === 'error' ? AlertTriangle : CheckCircle2
  const toneClass =
    toast.tone === 'error'
      ? 'bg-negative/10 ring-negative/30 text-negative'
      : toast.tone === 'info'
        ? 'bg-accent/10 ring-accent/30 text-accent'
        : 'bg-positive/10 ring-positive/30 text-positive'

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.97 }}
      transition={{ duration: 0.18 }}
      className="pointer-events-auto card flex items-start gap-3 p-3 max-w-sm w-full md:w-auto"
      role="status"
      aria-live="polite"
    >
      <div className={`w-7 h-7 rounded-lg grid place-items-center ring-1 ${toneClass} shrink-0`}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="text-sm text-fg flex-1 min-w-0 leading-snug">{toast.message}</div>
      <button
        onClick={onDismiss}
        className="btn-ghost !p-1 text-fg-subtle"
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  )
}
