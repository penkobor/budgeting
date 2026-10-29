import { cn } from '@/lib/utils'

interface SegmentedProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: ReadonlyArray<{ value: T; label: string }>
  className?: string
}

/** iOS-style segmented control: a sunken track with one raised thumb. */
export function Segmented<T extends string>({ value, onChange, options, className }: SegmentedProps<T>) {
  return (
    <div role="tablist" className={cn('flex p-[3px] rounded-[11px] bg-bg-elev', className)}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            data-no-press
            className={cn(
              'flex-1 min-w-0 truncate rounded-[9px] px-3 py-1.5 text-[13px] font-medium transition-colors',
              active ? 'bg-bg-card text-fg shadow-[0_1px_3px_rgb(0_0_0/0.12)]' : 'text-fg-muted hover:text-fg',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
