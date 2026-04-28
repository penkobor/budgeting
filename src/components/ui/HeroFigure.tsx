import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * The dominant figure on a lens \u2014 the most important number on the page.
 * Per HIG: "make the most important content the most prominent."
 *
 * - Eyebrow (small uppercase tracking label, e.g. "Today \u00b7 28 Apr") above the
 *   number.
 * - Hero number using the `text-hero` token (42pt) on `md+`, scaled down on
 *   mobile. Always `stat-num` (tabular monospace).
 * - Optional sublabel below for context (e.g. "+\u20ac\u200a45.20 vs yesterday").
 */
export function HeroFigure({
  eyebrow,
  value,
  sublabel,
  tone = 'default',
  className,
}: {
  eyebrow?: ReactNode
  value: ReactNode
  sublabel?: ReactNode
  tone?: 'default' | 'positive' | 'negative'
  className?: string
}) {
  const toneClass =
    tone === 'positive' ? 'text-positive' : tone === 'negative' ? 'text-negative' : 'text-fg'

  return (
    <div className={cn('flex flex-col items-start gap-1', className)}>
      {eyebrow && (
        <div className="text-footnote uppercase tracking-wider text-fg-muted">{eyebrow}</div>
      )}
      <div
        className={cn(
          'stat-num font-bold tracking-tight leading-none',
          'text-[2rem] md:text-hero',
          toneClass,
        )}
      >
        {value}
      </div>
      {sublabel && <div className="text-callout text-fg-muted mt-0.5">{sublabel}</div>}
    </div>
  )
}
