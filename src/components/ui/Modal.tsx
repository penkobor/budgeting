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
  const sizeClass = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl' }[size]
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm animate-fade-in z-40" />
        <Dialog.Content
          className={`fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[92vw] ${sizeClass}
                      card p-6 animate-slide-up`}
        >
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              {title && <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>}
              {description && <Dialog.Description className="text-sm text-fg-muted mt-1">{description}</Dialog.Description>}
            </div>
            <Dialog.Close className="btn-ghost p-1.5 rounded-lg" aria-label="Close">
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
