import { Pencil, Trash2 } from 'lucide-react'
import type { MouseEvent } from 'react'

/**
 * Standard Edit + Delete affordance for list rows.
 *
 * - 44 \u00d7 44 pt hit areas via `.icon-btn` (HIG iOS minimum).
 * - Always visible on mobile; on desktop the parent `group` reveals on hover
 *   if `revealOnHover` is true (default). Pages that already show actions
 *   inline on desktop can pass `revealOnHover={false}`.
 * - `onDelete` is called only after the parent confirms; this component does
 *   not own the confirmation flow (use `useConfirm()` upstream).
 */
export function RowActions({
  onEdit,
  onDelete,
  revealOnHover = true,
  size = 'md',
}: {
  onEdit?: () => void
  onDelete?: () => void
  revealOnHover?: boolean
  /** `sm` keeps a smaller visual size while preserving 44pt hit area. */
  size?: 'sm' | 'md'
}) {
  const stop = (e: MouseEvent) => {
    e.stopPropagation()
  }
  const iconClass = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'
  const wrapperClass = revealOnHover
    ? 'flex items-center gap-1 max-md:opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity'
    : 'flex items-center gap-1'

  return (
    <div className={wrapperClass} onClick={stop}>
      {onEdit && (
        <button
          type="button"
          onClick={(e) => {
            stop(e)
            onEdit()
          }}
          className="icon-btn"
          aria-label="Edit"
          title="Edit"
        >
          <Pencil className={iconClass} />
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            stop(e)
            onDelete()
          }}
          className="icon-btn-destructive"
          aria-label="Delete"
          title="Delete"
        >
          <Trash2 className={iconClass} />
        </button>
      )}
    </div>
  )
}
