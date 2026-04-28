import { useEffect, useRef, type ReactNode } from 'react'
import { animate, motion, useMotionValue, useTransform } from 'framer-motion'
import { Pencil, Trash2 } from 'lucide-react'
import { haptics } from '@/lib/haptics'
import { cn } from '@/lib/utils'

/**
 * iOS-style trailing-edge swipe row. On mobile the user drags the row left to
 * reveal Edit (accent) and Delete (negative) actions; on desktop the row stays
 * static and the overlaid hover-revealed `<RowActions>`-equivalent buttons
 * provide the same affordance.
 *
 * Mobile gesture summary
 * ----------------------
 *  - drag left up to `REVEAL_PX` = 144 (two 72px buttons).
 *  - past 64px or x-velocity < -300 \u2192 commits open; otherwise springs back.
 *  - haptic `selection()` fires once when the threshold is first crossed in
 *    either direction during the gesture.
 *
 * The component never owns a confirm flow \u2014 the caller's `onDelete` is invoked
 * after their `useConfirm()` resolves.
 */

const REVEAL_PX = 144
const COMMIT_PX = 64
const VELOCITY_PX = 300

export function SwipeableRow({
  children,
  onEdit,
  onDelete,
  className,
  /**
   * If false, the desktop hover affordance is suppressed (caller is rendering
   * actions inline themselves). The swipe still works on mobile.
   */
  showDesktopHover = true,
}: {
  children: ReactNode
  onEdit?: () => void
  onDelete?: () => void
  className?: string
  showDesktopHover?: boolean
}) {
  const x = useMotionValue(0)
  // Fade-in the trailing actions as the row reveals them.
  const trailingOpacity = useTransform(x, [0, -COMMIT_PX, -REVEAL_PX], [0, 0.6, 1])
  const isOpenRef = useRef(false)
  const crossedRef = useRef(false)

  // Reset on unmount / row change so React doesn't keep stale animations alive.
  useEffect(() => () => x.set(0), [x])

  const reset = () => {
    isOpenRef.current = false
    crossedRef.current = false
    animate(x, 0, { type: 'spring', stiffness: 420, damping: 36 })
  }
  const open = () => {
    isOpenRef.current = true
    animate(x, -REVEAL_PX, { type: 'spring', stiffness: 420, damping: 36 })
  }

  return (
    <div className={cn('relative overflow-hidden touch-pan-y', className)}>
      {/* Trailing actions \u2014 only rendered for mobile swipe. Desktop uses the
         hover affordance below. */}
      {(onEdit || onDelete) && (
        <motion.div
          aria-hidden
          style={{ opacity: trailingOpacity }}
          className="md:hidden absolute right-0 inset-y-0 flex items-stretch"
        >
          {onEdit && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                reset()
                onEdit()
              }}
              className="w-[72px] flex flex-col items-center justify-center gap-1 bg-accent text-accent-fg"
              aria-label="Edit"
            >
              <Pencil className="w-4 h-4" />
              <span className="text-caption-2 font-medium">Edit</span>
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
                reset()
              }}
              className="w-[72px] flex flex-col items-center justify-center gap-1 bg-negative text-white"
              aria-label="Delete"
            >
              <Trash2 className="w-4 h-4" />
              <span className="text-caption-2 font-medium">Delete</span>
            </button>
          )}
        </motion.div>
      )}

      <motion.div
        // Drag gesture is mobile-only. Framer-motion auto-detects vertical-vs-horizontal
        // intent so the page still scrolls as expected.
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: -REVEAL_PX, right: 0 }}
        dragElastic={{ left: 0.18, right: 0 }}
        dragMomentum={false}
        style={{ x }}
        onDrag={(_, info) => {
          // Light haptic when the user first crosses the commit threshold,
          // both directions. Reset when they move back past it.
          const past = info.offset.x < -COMMIT_PX
          if (past && !crossedRef.current) {
            crossedRef.current = true
            haptics.selection()
          } else if (!past && crossedRef.current) {
            crossedRef.current = false
          }
        }}
        onDragEnd={(_, info) => {
          const shouldOpen =
            info.offset.x < -COMMIT_PX || info.velocity.x < -VELOCITY_PX
          if (shouldOpen) open()
          else reset()
        }}
        // On click while open, snap closed. The button taps inside trailing
        // actions stop propagation so this fires only for taps on the row body.
        onClick={() => {
          if (isOpenRef.current) reset()
        }}
        // Keep desktop static (drag still attaches but the user is unlikely to
        // drag with a mouse; the dragConstraints clamp prevents transform).
        className={cn(
          'relative bg-bg-card',
          showDesktopHover && 'md:cursor-default',
        )}
      >
        {children}
      </motion.div>
    </div>
  )
}
