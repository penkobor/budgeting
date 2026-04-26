import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { motion, useDragControls } from 'framer-motion'

interface ModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

/**
 * Responsive dialog:
 *  - Mobile (< md): native iOS-style bottom sheet with sticky header (drag handle + title + close),
 *    scrollable body, and an optional sticky footer that respects the home-indicator safe-area.
 *    Swipe-down on the header dismisses the sheet.
 *  - Desktop (md+): centred glass dialog (previous look).
 */
export function Modal({ open, onOpenChange, title, description, children, footer, size = 'md' }: ModalProps) {
  const sizeClass = { sm: 'md:max-w-sm', md: 'md:max-w-md', lg: 'md:max-w-2xl' }[size]
  const dragControls = useDragControls()

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/55 backdrop-blur-sm animate-fade-in z-40" />
        <Dialog.Content asChild>
          <motion.div
            drag={typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches ? 'y' : false}
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_e, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) onOpenChange(false)
            }}
            className={[
              'fixed z-50 flex flex-col outline-none',
              // Mobile bottom sheet
              'max-md:inset-x-0 max-md:bottom-0 max-md:max-h-[88vh]',
              'max-md:bg-bg-card max-md:rounded-t-3xl max-md:shadow-[0_-12px_40px_-8px_rgba(0,0,0,0.5)]',
              'max-md:animate-sheet-up',
              // Desktop centred dialog
              'md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[92vw]',
              'md:glass md:rounded-2xl md:p-6 md:animate-slide-up',
              sizeClass,
            ].join(' ')}
          >
            {/* Mobile sticky header — drag-zone for swipe-to-dismiss */}
            <div
              className="md:hidden sticky top-0 z-10 bg-bg-card/95 backdrop-blur-md rounded-t-3xl px-5 pt-2 pb-3 border-b border-border touch-none cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => dragControls.start(e)}
            >
              <div className="mx-auto mb-3 w-9 h-1 rounded-full bg-fg-subtle/40" aria-hidden />
              <div className="flex items-center justify-between gap-3 min-h-[28px]">
                <div className="w-10" aria-hidden />
                {title && <Dialog.Title className="font-semibold text-base text-center flex-1 truncate">{title}</Dialog.Title>}
                <Dialog.Close
                  className="w-10 h-10 -mr-2 grid place-items-center rounded-full text-fg-muted hover:bg-bg-elev active:scale-95 transition"
                  aria-label="Close"
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <X className="w-5 h-5" />
                </Dialog.Close>
              </div>
            </div>

            {/* Desktop header */}
            <div className="hidden md:flex items-start justify-between gap-4 mb-4">
              <div className="min-w-0">
                {title && <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>}
                {description && <Dialog.Description className="text-sm text-fg-muted mt-1">{description}</Dialog.Description>}
              </div>
              <Dialog.Close className="btn-ghost p-1.5 rounded-lg shrink-0" aria-label="Close">
                <X className="w-4 h-4" />
              </Dialog.Close>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto max-md:px-5 max-md:py-4 [-webkit-overflow-scrolling:touch]">
              {children}
            </div>

            {/* Sticky footer when provided */}
            {footer && (
              <div className="max-md:sticky max-md:bottom-0 max-md:bg-bg-card/95 max-md:backdrop-blur-md max-md:border-t max-md:border-border max-md:px-5 max-md:pt-3 max-md:pb-[max(env(safe-area-inset-bottom),12px)] md:mt-6 flex justify-end gap-2">
                {footer}
              </div>
            )}

            {/* Mobile-only bottom safe-area when no footer */}
            {!footer && <div className="md:hidden h-[max(env(safe-area-inset-bottom),12px)]" aria-hidden />}
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
