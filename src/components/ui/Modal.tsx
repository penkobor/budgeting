import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'

interface ModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

export function Modal({ open, onOpenChange, title, description, children, footer, size = 'md' }: ModalProps) {
  const sizeClass = { sm: 'md:max-w-sm', md: 'md:max-w-md', lg: 'md:max-w-2xl' }[size]
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm animate-fade-in z-40" />
        <Dialog.Content
          className={`fixed z-50 glass animate-sheet-up md:animate-slide-up
                      max-md:inset-x-0 max-md:bottom-0 max-md:rounded-t-3xl max-md:rounded-b-none max-md:pb-[max(env(safe-area-inset-bottom),16px)] max-md:px-5 max-md:pt-2 max-md:max-h-[85vh] max-md:overflow-y-auto
                      md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[92vw] md:rounded-2xl md:p-6 ${sizeClass}`}
        >
          {/* Drag handle (mobile only) */}
          <div className="md:hidden mx-auto mt-1 mb-3 w-9 h-1 rounded-full bg-fg-subtle/40" aria-hidden />

          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="min-w-0">
              {title && <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>}
              {description && <Dialog.Description className="text-sm text-fg-muted mt-1">{description}</Dialog.Description>}
            </div>
            <Dialog.Close className="btn-ghost p-1.5 rounded-lg shrink-0" aria-label="Close">
              <X className="w-4 h-4" />
            </Dialog.Close>
          </div>
          <div>{children}</div>
          {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
