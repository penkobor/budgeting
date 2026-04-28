import { useMemo, useState, useRef, useCallback } from 'react'
import { Share2, Loader2, Loader, Plus } from 'lucide-react'
import { motion, type PanInfo } from 'framer-motion'
import {
  useCategories,
  useRecurringOverridesInRange,
  useRecurringRules,
  useSettings,
  useTransactionsInRange,
} from '@/hooks/queries'
import {
  useShareLink,
  buildShareUrl,
  useRedistributeShared,
  type RedistributePayload,
} from '@/hooks/share'
import { expandRuleInRange } from '@/lib/recurring'
import { effectiveOccurrenceAmount } from '@/lib/projection'
import { formatMoney, isoDate } from '@/lib/utils'
import { pushToast } from '@/components/ui/Toast'
import { Modal } from '@/components/ui/Modal'
import type { Category, RecurringOverride, RecurringRule, Transaction } from '@/lib/db.types'

/**
 * BUDG-022 — Shared Lens (owner-only).
 *
 * Phases 1–4: read-only view + same-month / cross-month DnD redistribute +
 * drop-on-empty-zone create + recurring sources via single-occurrence
 * `recurring_overrides`.
 *
 * Drop kinds:
 *  - row: instant atomic redistribute via `redistribute_shared`.
 *  - dropzone: opens a modal to capture date + description for the new event.
 *
 * Source kinds:
 *  - tx: writes `tx_updates`.
 *  - recurring: writes `override_upserts` (single occurrence only — see Plan).
 */
export function SharedLens() {
  const { data: settings } = useSettings()
  const currency = settings?.currency ?? 'CZK'
  const { data: shareLink, isLoading: shareLoading } = useShareLink()
  const { data: categories = [] } = useCategories()
  const expenseCategories = useMemo(
    () => categories.filter((c) => c.kind !== 'income'),
    [categories],
  )
  const [quickAddOpen, setQuickAddOpen] = useState(false)

  const horizon = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const start = new Date(today.getFullYear(), today.getMonth(), 1)
    const end = new Date(today.getFullYear(), today.getMonth() + 6 + 1, 0)
    return { fromIso: isoDate(start), toIso: isoDate(end), today }
  }, [])

  const { data: txs = [], isLoading: txLoading } = useTransactionsInRange(
    horizon.fromIso,
    horizon.toIso,
  )
  const { data: rules = [], isLoading: rulesLoading } = useRecurringRules()
  const { data: overrides = [] } = useRecurringOverridesInRange(
    horizon.fromIso,
    horizon.toIso,
  )
  const redistribute = useRedistributeShared()

  const sharedTxs = useMemo(() => txs.filter((t) => t.is_shared), [txs])
  const sharedRules = useMemo(
    () => rules.filter((r) => r.is_shared && r.active),
    [rules],
  )

  const baseMonths = useMonthGrouping({
    sharedTxs,
    sharedRules,
    overrides,
    today: horizon.today,
    horizonEnd: new Date(horizon.toIso + 'T00:00:00'),
  })

  const months = useMemo(() => {
    if (baseMonths.length === 0) {
      const ym = isoDate(horizon.today).slice(0, 7)
      const [y, m] = ym.split('-').map(Number)
      const label = new Date(y, m - 1, 1).toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
      })
      return [
        { key: ym, label, entries: [], totalIncome: 0, totalExpense: 0 },
      ] as MonthGroup[]
    }
    const lastKey = baseMonths[baseMonths.length - 1].key
    const [yy, mm] = lastKey.split('-').map(Number)
    const next = new Date(yy, mm, 1)
    const nextKey = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
    const nextLabel = next.toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    })
    return [
      ...baseMonths,
      { key: nextKey, label: nextLabel, entries: [], totalIncome: 0, totalExpense: 0 },
    ]
  }, [baseMonths, horizon.today])

  const totalIncome = months.reduce((s, m) => s + m.totalIncome, 0)
  const totalExpense = months.reduce((s, m) => s + m.totalExpense, 0)
  const eventCount = months.reduce((s, m) => s + m.entries.length, 0)

  const [dragSrc, setDragSrc] = useState<Entry | null>(null)
  const [dragTargetKey, setDragTargetKey] = useState<string | null>(null)
  const [transferN, setTransferN] = useState<number>(0)
  const [createDraft, setCreateDraft] = useState<CreateDraft | null>(null)

  // Phase 5 — long-press picker mode for touch.
  const [pickerSrc, setPickerSrc] = useState<Entry | null>(null)
  const [pickerRowTarget, setPickerRowTarget] = useState<Entry | null>(null)

  const enterPickerMode = useCallback((entry: Entry) => {
    setPickerSrc(entry)
    setPickerRowTarget(null)
  }, [])

  const cancelPicker = useCallback(() => {
    setPickerSrc(null)
    setPickerRowTarget(null)
  }, [])

  const onDragStart = useCallback((entry: Entry) => {
    setDragSrc(entry)
    setDragTargetKey(null)
    setTransferN(0)
  }, [])

  const onDrag = useCallback(
    (event: MouseEvent | TouchEvent | PointerEvent, _info: PanInfo) => {
      if (!dragSrc) return
      const point =
        'touches' in event && event.touches.length > 0
          ? event.touches[0]
          : (event as PointerEvent | MouseEvent)
      const x = (point as MouseEvent).clientX ?? 0
      const y = (point as MouseEvent).clientY ?? 0
      const el = document.elementFromPoint(x, y)
      const dropEl = el?.closest<HTMLElement>('[data-share-row], [data-share-dropzone]')
      const targetKey =
        dropEl?.dataset.shareRow ??
        (dropEl?.dataset.shareDropzone ? `dropzone:${dropEl.dataset.shareDropzone}` : null)
      setDragTargetKey((prev) => (prev !== targetKey ? targetKey : prev))
    },
    [dragSrc],
  )

  const allEntries = useMemo(
    () => months.flatMap((m) => m.entries),
    [months],
  )

  const onDragEnd = useCallback(async () => {
    const src = dragSrc
    const targetKey = dragTargetKey
    const n = transferN
    setDragSrc(null)
    setDragTargetKey(null)
    setTransferN(0)
    if (!src || !targetKey) return

    if (targetKey.startsWith('dropzone:')) {
      const ym = targetKey.slice('dropzone:'.length)
      const [y, m] = ym.split('-').map(Number)
      const firstOfMonth = new Date(y, m - 1, 1)
      const today = new Date(horizon.today)
      const seedDate = firstOfMonth >= today ? firstOfMonth : today
      setCreateDraft({
        src,
        ym,
        amount: n > 0 ? n : Math.abs(src.amount),
        occurredOn: isoDate(seedDate),
        description: src.label,
      })
      return
    }

    if (n <= 0) return
    const dst = allEntries.find((e) => e.key === targetKey)
    if (!dst) return
    if (!isValidPair(src, dst)) {
      pushToast(
        'Targets must be transactions or recurring rows of the same income/expense kind',
        'error',
      )
      return
    }
    const max = Math.abs(src.amount)
    const safeN = Math.min(n, max)
    const sign = src.amount >= 0 ? 1 : -1 // shared kind sign
    const newSrc = src.amount + (-sign * safeN) // pull toward zero
    const newDst = dst.amount + (sign * safeN) // push further from zero

    const payload: RedistributePayload = mergePayload(
      deltaPayload(src, newSrc),
      deltaPayload(dst, newDst),
    )
    try {
      await redistribute.mutateAsync(payload)
      pushToast(`Moved ${formatMoney(safeN, currency)}`, 'success')
    } catch (e) {
      pushToast((e as Error).message, 'error')
    }
  }, [dragSrc, dragTargetKey, transferN, allEntries, redistribute, currency, horizon.today])

  if (shareLoading || txLoading || rulesLoading) {
    return (
      <div className="grid place-items-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-fg-subtle" />
      </div>
    )
  }

  const sliderMonthKey =
    dragSrc && months.find((mm) => mm.entries.some((e) => e.key === dragSrc.key))?.key

  const targetIsValidRow =
    !!dragSrc &&
    !!dragTargetKey &&
    !dragTargetKey.startsWith('dropzone:') &&
    allEntries.some((e) => e.key === dragTargetKey && isValidPair(dragSrc, e))

  const targetIsDropzone =
    !!dragSrc && !!dragTargetKey && dragTargetKey.startsWith('dropzone:')

  return (
    <div className="space-y-4 md:space-y-6">
      <header className="card p-4 md:p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wider text-fg-subtle">
              <Share2 className="w-3 h-3" /> Shared bag
            </div>
            <h2 className="font-semibold text-lg mt-1">
              {eventCount} event{eventCount === 1 ? '' : 's'} across {baseMonths.length} month
              {baseMonths.length === 1 ? '' : 's'}
            </h2>
            <p className="text-xs text-fg-muted mt-1">
              Drag a row's amount onto another shared row (any month, same kind), onto a
              recurring occurrence, or onto a "+ new shared event" tile. On touch devices
              long-press a chip then tap a target.{' '}
              {shareLink ? (
                <>
                  Public:{' '}
                  <a
                    className="underline text-accent"
                    href={buildShareUrl(shareLink.slug)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {buildShareUrl(shareLink.slug)}
                  </a>
                </>
              ) : (
                'Enable a public link in Settings → Share my plans to publish.'
              )}
            </p>
          </div>
          <div className="flex items-start gap-3 shrink-0">
            <button
              className="btn-primary inline-flex items-center gap-1.5 text-xs"
              onClick={() => setQuickAddOpen(true)}
            >
              <Plus className="w-3.5 h-3.5" />
              Add shared event
            </button>
            <div className="text-right">
            <div className="text-[11px] uppercase tracking-wider text-fg-subtle">Total</div>
            {totalExpense > 0 && (
              <div className="stat-num font-semibold text-negative">
                {formatMoney(totalExpense, currency)}
              </div>
            )}
            {totalIncome > 0 && (
              <div className="stat-num text-sm text-positive">
                +{formatMoney(totalIncome, currency)}
              </div>
            )}
            </div>
          </div>
        </div>
      </header>

      {baseMonths.length === 0 && (
        <div className="card p-8 text-center text-sm text-fg-muted">
          Nothing shared yet. Mark a transaction or recurring rule with{' '}
          <em>Show on my public share page</em> to populate this view.
        </div>
      )}

      {months.map((m) => (
        <section key={m.key} className="card p-4 md:p-5 space-y-3">
          <header className="flex items-baseline justify-between gap-3">
            <h3 className="font-semibold capitalize">{m.label}</h3>
            <div className="text-xs text-fg-subtle">
              {m.totalExpense > 0 && (
                <>
                  Total:{' '}
                  <span className="stat-num font-medium text-negative">
                    {formatMoney(m.totalExpense, currency)}
                  </span>
                </>
              )}
              {m.totalIncome > 0 && (
                <>
                  {m.totalExpense > 0 ? ' · ' : ''}
                  <span className="stat-num font-medium text-positive">
                    +{formatMoney(m.totalIncome, currency)}
                  </span>
                </>
              )}
            </div>
          </header>
          {m.entries.length > 0 && (
            <ul className="divide-y divide-border -mx-4 md:-mx-5">
              {m.entries.map((e) => {
                const isSrc = (dragSrc?.key === e.key) || (pickerSrc?.key === e.key)
                const isHover = dragTargetKey === e.key && dragSrc?.key !== e.key
                const validHere = !!dragSrc && isHover && isValidPair(dragSrc, e)
                const pickerValid =
                  !!pickerSrc && pickerSrc.key !== e.key && isValidPair(pickerSrc, e)
                const pickerDimmed = !!pickerSrc && !pickerValid && pickerSrc.key !== e.key
                return (
                  <li
                    key={e.key}
                    data-share-row={e.key}
                    onClick={() => {
                      if (pickerValid) setPickerRowTarget(e)
                    }}
                    className={`px-4 md:px-5 py-2.5 flex items-baseline gap-3 text-sm transition-colors ${
                      validHere ? 'bg-accent/10' : ''
                    } ${isHover && !validHere ? 'bg-negative/10' : ''} ${
                      pickerValid ? 'bg-accent/5 ring-1 ring-inset ring-accent/40 cursor-pointer' : ''
                    } ${pickerDimmed ? 'opacity-40' : ''}`}
                  >
                    <span className="stat-num text-xs text-fg-subtle shrink-0 w-16">
                      {e.dateLabel}
                    </span>
                    <span className="flex-1 min-w-0 truncate">
                      {e.label}
                      {e.recurring && (
                        <span className="ml-1.5 text-[10px] uppercase tracking-wider text-fg-subtle">
                          recurring
                        </span>
                      )}
                      {e.overridden && (
                        <span className="ml-1.5 text-[10px] uppercase tracking-wider text-accent">
                          adjusted
                        </span>
                      )}
                    </span>
                    <DragChip
                      entry={e}
                      currency={currency}
                      pending={redistribute.isPending && isSrc}
                      disableDrag={!!pickerSrc}
                      onDragStart={() => onDragStart(e)}
                      onDrag={onDrag}
                      onDragEnd={onDragEnd}
                      onLongPress={() => enterPickerMode(e)}
                    />
                  </li>
                )
              })}
            </ul>
          )}

          <div
            data-share-dropzone={m.key}
            onClick={() => {
              if (!pickerSrc) return
              const [yy, mm] = m.key.split('-').map(Number)
              const firstOfMonth = new Date(yy, mm - 1, 1)
              const today = new Date(horizon.today)
              const seedDate = firstOfMonth >= today ? firstOfMonth : today
              setCreateDraft({
                src: pickerSrc,
                ym: m.key,
                amount: Math.abs(pickerSrc.amount),
                occurredOn: isoDate(seedDate),
                description: pickerSrc.label,
              })
              setPickerSrc(null)
            }}
            className={`mt-1 rounded-xl border-2 border-dashed p-3 text-center text-xs transition-colors ${
              dragTargetKey === `dropzone:${m.key}`
                ? 'border-accent bg-accent/10 text-accent'
                : pickerSrc
                  ? 'border-accent/60 text-accent cursor-pointer hover:bg-accent/10'
                  : 'border-border text-fg-subtle hover:bg-bg-elev/40'
            }`}
          >
            <Plus className="inline w-3.5 h-3.5 -mt-0.5 mr-1" />
            {pickerSrc
              ? 'Tap to create a new shared event here'
              : dragSrc
                ? 'Drop here to create a new shared event'
                : 'Drag (or long-press) a chip and pick a target zone'}
          </div>

          {dragSrc && sliderMonthKey === m.key && (
            <TransferSlider
              src={dragSrc}
              currency={currency}
              value={transferN}
              onChange={setTransferN}
              targetSelected={targetIsValidRow}
              targetIsDropzone={targetIsDropzone}
            />
          )}
        </section>
      ))}

      {pickerSrc && (
        <div className="fixed bottom-0 inset-x-0 z-40 bg-bg-elev/95 backdrop-blur border-t border-border p-3 flex items-center gap-3 shadow-lg">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-fg-subtle">
              Picking from
            </div>
            <div className="text-sm truncate">
              {pickerSrc.label}{' '}
              <span className="stat-num font-medium">
                {pickerSrc.amount >= 0 ? '+' : '−'}
                {formatMoney(Math.abs(pickerSrc.amount), currency)}
              </span>
            </div>
            <div className="text-[11px] text-fg-subtle mt-0.5">
              Tap a highlighted row or drop zone to receive
            </div>
          </div>
          <button className="btn-ghost" onClick={cancelPicker}>
            Cancel
          </button>
        </div>
      )}

      {pickerSrc && pickerRowTarget && (
        <TransferToRowModal
          src={pickerSrc}
          dst={pickerRowTarget}
          currency={currency}
          onCancel={() => setPickerRowTarget(null)}
          onConfirm={async (n) => {
            const max = Math.abs(pickerSrc.amount)
            const safeN = Math.min(n, max)
            const sign = pickerSrc.amount >= 0 ? 1 : -1
            const newSrc = pickerSrc.amount + (-sign * safeN)
            const newDst = pickerRowTarget.amount + (sign * safeN)
            const payload = mergePayload(
              deltaPayload(pickerSrc, newSrc),
              deltaPayload(pickerRowTarget, newDst),
            )
            try {
              await redistribute.mutateAsync(payload)
              pushToast(`Moved ${formatMoney(safeN, currency)}`, 'success')
              setPickerRowTarget(null)
              setPickerSrc(null)
            } catch (e) {
              pushToast((e as Error).message, 'error')
            }
          }}
        />
      )}

      {quickAddOpen && (
        <QuickAddSharedModal
          currency={currency}
          today={isoDate(horizon.today)}
          categories={expenseCategories}
          onCancel={() => setQuickAddOpen(false)}
          onConfirm={async (vals) => {
            const magnitude = Math.abs(vals.amount)
            if (magnitude <= 0) return
            const payload: RedistributePayload = {
              tx_inserts: [
                {
                  occurred_on: vals.occurredOn,
                  amount: -magnitude,
                  description: vals.description.trim() || null,
                  category_id: vals.categoryId || null,
                  planned: true,
                },
              ],
            }
            try {
              await redistribute.mutateAsync(payload)
              pushToast(`Added shared expense ${formatMoney(magnitude, currency)}`, 'success')
              setQuickAddOpen(false)
            } catch (e) {
              pushToast((e as Error).message, 'error')
            }
          }}
        />
      )}

      {createDraft && (
        <CreateFromDropModal
          draft={createDraft}
          currency={currency}
          onCancel={() => setCreateDraft(null)}
          onConfirm={async (vals) => {
            const src = createDraft.src
            const safeN = Math.min(Math.abs(vals.amount), Math.abs(src.amount))
            const sign = src.amount >= 0 ? 1 : -1
            const newSrc = src.amount + (-sign * safeN)
            const insertAmount = sign * safeN
            const srcDelta = deltaPayload(src, newSrc)
            const payload: RedistributePayload = {
              ...srcDelta,
              tx_inserts: [
                {
                  occurred_on: vals.occurredOn,
                  amount: insertAmount,
                  description: vals.description.trim() || null,
                  planned: true,
                },
              ],
            }
            try {
              await redistribute.mutateAsync(payload)
              pushToast(`Created and moved ${formatMoney(safeN, currency)}`, 'success')
              setCreateDraft(null)
            } catch (e) {
              pushToast((e as Error).message, 'error')
            }
          }}
        />
      )}
    </div>
  )
}

// ---------- Payload assembly helpers ----------

/**
 * Build the partial payload that turns `entry`'s effective amount into
 * `newAmount` (signed). For tx → `tx_updates`. For recurring → single-
 * occurrence `override_upserts`. Magnitude == 0 marks the override as skipped.
 */
function deltaPayload(entry: Entry, newAmount: number): RedistributePayload {
  if (entry.source === 'tx') {
    return { tx_updates: [{ id: entry.sourceId, amount: newAmount }] }
  }
  // recurring
  const magnitude = Math.abs(newAmount)
  return {
    override_upserts: [
      {
        recurring_rule_id: entry.sourceId,
        occurrence_date: entry.occurrenceDate!,
        amount_override: magnitude === 0 ? null : magnitude,
        skipped: magnitude === 0,
      },
    ],
  }
}

function mergePayload(
  a: RedistributePayload,
  b: RedistributePayload,
): RedistributePayload {
  return {
    tx_updates: [...(a.tx_updates ?? []), ...(b.tx_updates ?? [])],
    tx_inserts: [...(a.tx_inserts ?? []), ...(b.tx_inserts ?? [])],
    override_upserts: [...(a.override_upserts ?? []), ...(b.override_upserts ?? [])],
  }
}

interface CreateDraft {
  src: Entry
  ym: string
  amount: number
  occurredOn: string
  description: string
}

function CreateFromDropModal(props: {
  draft: CreateDraft
  currency: string
  onCancel: () => void
  onConfirm: (vals: { amount: number; occurredOn: string; description: string }) => Promise<void>
}) {
  const { draft, currency, onCancel, onConfirm } = props
  const [amount, setAmount] = useState(draft.amount)
  const [occurredOn, setOccurredOn] = useState(draft.occurredOn)
  const [description, setDescription] = useState(draft.description)
  const [busy, setBusy] = useState(false)
  const max = Math.abs(draft.src.amount)
  return (
    <Modal
      open
      onOpenChange={(o) => !o && !busy && onCancel()}
      title="New shared event from drop"
      description={`Peel off some money from "${draft.src.label}" into a new shared event.`}
      footer={
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            className="btn-primary"
            disabled={busy || amount <= 0 || amount > max}
            onClick={async () => {
              setBusy(true)
              try {
                await onConfirm({ amount, occurredOn, description })
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy ? <Loader className="w-4 h-4 animate-spin" /> : 'Create & move'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="text-xs uppercase tracking-wider text-fg-subtle">Amount</label>
          <div className="flex items-center gap-3 mt-1">
            <input
              type="range"
              min={0}
              max={max}
              step={Math.max(1, Math.round(max / 100))}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="flex-1 accent-accent"
            />
            <span className="stat-num font-medium text-fg shrink-0 min-w-20 text-right">
              {formatMoney(amount, currency)}
            </span>
          </div>
          <div className="text-[11px] text-fg-subtle mt-1">
            Source remaining after move:{' '}
            <span className="stat-num">{formatMoney(Math.max(0, max - amount), currency)}</span>
          </div>
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-fg-subtle">Date</label>
          <input
            type="date"
            value={occurredOn}
            onChange={(e) => setOccurredOn(e.target.value)}
            className="input mt-1 w-full"
          />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-fg-subtle">Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Birthday gift"
            className="input mt-1 w-full"
          />
        </div>
      </div>
    </Modal>
  )
}

function DragChip(props: {
  entry: Entry
  currency: string
  pending: boolean
  disableDrag?: boolean
  onDragStart: () => void
  onDrag: (e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => void
  onDragEnd: () => void
  onLongPress: () => void
}) {
  const { entry, currency, pending, disableDrag, onDragStart, onDrag, onDragEnd, onLongPress } = props
  const ref = useRef<HTMLSpanElement | null>(null)
  const longPressTimerRef = useRef<number | null>(null)
  const longPressOriginRef = useRef<{ x: number; y: number } | null>(null)
  const longPressFiredRef = useRef(false)

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    longPressOriginRef.current = null
  }, [])

  return (
    <motion.span
      ref={ref}
      drag={disableDrag ? false : 'x'}
      dragSnapToOrigin
      dragElastic={0.2}
      onPointerDown={(e) => {
        longPressFiredRef.current = false
        longPressOriginRef.current = { x: e.clientX, y: e.clientY }
        cancelLongPress()
        longPressTimerRef.current = window.setTimeout(() => {
          longPressFiredRef.current = true
          longPressTimerRef.current = null
          onLongPress()
        }, 500)
      }}
      onPointerMove={(e) => {
        const o = longPressOriginRef.current
        if (!o) return
        const dx = e.clientX - o.x
        const dy = e.clientY - o.y
        if (dx * dx + dy * dy > 36) cancelLongPress()
      }}
      onPointerUp={cancelLongPress}
      onPointerCancel={cancelLongPress}
      onPointerLeave={cancelLongPress}
      onDragStart={() => {
        cancelLongPress()
        if (!longPressFiredRef.current) onDragStart()
      }}
      onDrag={onDrag}
      onDragEnd={onDragEnd}
      whileDrag={{ scale: 1.1, zIndex: 50 }}
      className={`stat-num font-medium shrink-0 select-none px-2 py-0.5 rounded-md cursor-grab active:cursor-grabbing bg-bg-elev hover:bg-bg-elev/80 ${
        entry.amount >= 0 ? 'text-positive' : 'text-negative'
      }`}
      title="Drag onto another row — or long-press to enter pick-mode"
    >
      {pending ? (
        <Loader className="w-3.5 h-3.5 animate-spin inline" />
      ) : (
        <>
          {entry.amount >= 0 ? '+' : '−'}
          {formatMoney(Math.abs(entry.amount), currency)}
        </>
      )}
    </motion.span>
  )
}

function TransferToRowModal(props: {
  src: Entry
  dst: Entry
  currency: string
  onCancel: () => void
  onConfirm: (n: number) => Promise<void>
}) {
  const { src, dst, currency, onCancel, onConfirm } = props
  const max = Math.abs(src.amount)
  const [n, setN] = useState(Math.round(max / 2))
  const [busy, setBusy] = useState(false)
  const sign = src.amount >= 0 ? 1 : -1
  const newSrc = src.amount + (-sign * n)
  const newDst = dst.amount + (sign * n)
  return (
    <Modal
      open
      onOpenChange={(o) => !o && !busy && onCancel()}
      title="Move shared amount"
      description={`Pull from "${src.label}" into "${dst.label}".`}
      footer={
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            className="btn-primary"
            disabled={busy || n <= 0 || n > max}
            onClick={async () => {
              setBusy(true)
              try {
                await onConfirm(n)
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy ? <Loader className="w-4 h-4 animate-spin" /> : `Move ${formatMoney(n, currency)}`}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={max}
            step={Math.max(1, Math.round(max / 100))}
            value={n}
            onChange={(e) => setN(Number(e.target.value))}
            className="flex-1 accent-accent"
            autoFocus
          />
          <span className="stat-num font-medium tabular-nums text-fg shrink-0 min-w-20 text-right">
            {formatMoney(n, currency)}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-lg bg-bg-elev p-2">
            <div className="text-fg-subtle">{src.label} after</div>
            <div className="stat-num font-medium">
              {newSrc >= 0 ? '+' : '−'}
              {formatMoney(Math.abs(newSrc), currency)}
            </div>
          </div>
          <div className="rounded-lg bg-bg-elev p-2">
            <div className="text-fg-subtle">{dst.label} after</div>
            <div className="stat-num font-medium">
              {newDst >= 0 ? '+' : '−'}
              {formatMoney(Math.abs(newDst), currency)}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}

function TransferSlider(props: {
  src: Entry
  currency: string
  value: number
  onChange: (n: number) => void
  targetSelected: boolean
  targetIsDropzone: boolean
}) {
  const { src, currency, value, onChange, targetSelected, targetIsDropzone } = props
  const max = Math.abs(src.amount)
  const step = Math.max(1, Math.round(max / 100))
  const active = targetSelected || targetIsDropzone
  return (
    <div
      className={`pointer-events-auto rounded-xl px-3 py-2 text-xs flex items-center gap-3 transition-colors ${
        active
          ? 'bg-accent/10 border border-accent/30'
          : 'bg-bg-elev border border-border opacity-80'
      }`}
    >
      <span className="text-fg-subtle shrink-0">
        {targetIsDropzone
          ? 'Release to choose date / description'
          : targetSelected
            ? 'Transfer'
            : 'Hover a row or drop zone'}
      </span>
      <input
        type="range"
        min={0}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-accent"
        disabled={!targetSelected && !targetIsDropzone}
      />
      <span className="stat-num font-medium tabular-nums text-fg shrink-0 min-w-16 text-right">
        {formatMoney(value, currency)}
      </span>
    </div>
  )
}

function isValidPair(a: Entry, b: Entry): boolean {
  if (a.key === b.key) return false
  // Same income/expense kind: both >=0 or both <0.
  if ((a.amount >= 0) !== (b.amount >= 0)) return false
  return true
}

interface Entry {
  key: string
  source: 'tx' | 'recurring'
  sourceId: string
  occurrenceDate?: string
  date: string
  dateLabel: string
  label: string
  amount: number
  recurring: boolean
  overridden: boolean
  monthKey: string
}

interface MonthGroup {
  key: string
  label: string
  entries: Entry[]
  totalIncome: number
  totalExpense: number
}

function useMonthGrouping(args: {
  sharedTxs: Transaction[]
  sharedRules: RecurringRule[]
  overrides: RecurringOverride[]
  today: Date
  horizonEnd: Date
}): MonthGroup[] {
  const { sharedTxs, sharedRules, overrides, today, horizonEnd } = args
  return useMemo(() => {
    const map = new Map<string, MonthGroup>()
    const ensure = (ym: string): MonthGroup => {
      let g = map.get(ym)
      if (!g) {
        const [y, m] = ym.split('-').map(Number)
        const label = new Date(y, m - 1, 1).toLocaleDateString(undefined, {
          month: 'long',
          year: 'numeric',
        })
        g = { key: ym, label, entries: [], totalIncome: 0, totalExpense: 0 }
        map.set(ym, g)
      }
      return g
    }

    for (const t of sharedTxs) {
      const ym = t.occurred_on.slice(0, 7)
      const g = ensure(ym)
      const amount = Number(t.amount)
      g.entries.push({
        key: `tx:${t.id}`,
        source: 'tx',
        sourceId: t.id,
        date: t.occurred_on,
        dateLabel: shortDate(t.occurred_on),
        label: t.description?.trim() || 'Untitled entry',
        amount,
        recurring: false,
        overridden: false,
        monthKey: ym,
      })
      if (amount >= 0) g.totalIncome += amount
      else g.totalExpense += -amount
    }

    for (const r of sharedRules) {
      const dates = expandRuleInRange(r, today, horizonEnd)
      for (const d of dates) {
        const eff = effectiveOccurrenceAmount(r, d, overrides)
        if (eff === null) continue // skipped — hide from lens
        const ym = d.slice(0, 7)
        const g = ensure(ym)
        const ovr = overrides.find(
          (o) => o.recurring_rule_id === r.id && o.occurrence_date === d,
        )
        g.entries.push({
          key: `r:${r.id}:${d}`,
          source: 'recurring',
          sourceId: r.id,
          occurrenceDate: d,
          date: d,
          dateLabel: shortDate(d),
          label: r.name,
          amount: eff,
          recurring: true,
          overridden: !!ovr && ovr.amount_override != null,
          monthKey: ym,
        })
        if (eff >= 0) g.totalIncome += eff
        else g.totalExpense += -eff
      }
    }

    const cutoff = isoDate(today).slice(0, 7)
    const groups = Array.from(map.values())
      .filter(
        (g) =>
          g.key >= cutoff || g.entries.some((e) => e.date >= isoDate(today)),
      )
      .sort((a, b) => a.key.localeCompare(b.key))
    for (const g of groups) {
      g.entries.sort((a, b) => a.date.localeCompare(b.date))
      g.totalExpense = Math.round(g.totalExpense * 100) / 100
      g.totalIncome = Math.round(g.totalIncome * 100) / 100
    }
    return groups
  }, [sharedTxs, sharedRules, overrides, today, horizonEnd])
}

function shortDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function QuickAddSharedModal(props: {
  currency: string
  today: string
  categories: Category[]
  onCancel: () => void
  onConfirm: (vals: {
    amount: number
    occurredOn: string
    description: string
    categoryId: string | null
  }) => Promise<void>
}) {
  const { currency, today, categories, onCancel, onConfirm } = props
  const [amount, setAmount] = useState<number>(0)
  const [occurredOn, setOccurredOn] = useState<string>(today)
  const [description, setDescription] = useState<string>('')
  const [categoryId, setCategoryId] = useState<string>('')
  const [busy, setBusy] = useState(false)
  return (
    <Modal
      open
      onOpenChange={(o) => !o && !busy && onCancel()}
      title="Add shared event"
      description="Creates a planned shared expense visible on your public link and in your own ledger."
      footer={
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            className="btn-primary"
            disabled={busy || amount <= 0}
            onClick={async () => {
              setBusy(true)
              try {
                await onConfirm({
                  amount,
                  occurredOn,
                  description,
                  categoryId: categoryId || null,
                })
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy ? <Loader className="w-4 h-4 animate-spin" /> : 'Create'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="text-xs uppercase tracking-wider text-fg-subtle">
            Amount ({currency})
          </label>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={amount === 0 ? '' : amount}
            onChange={(e) => setAmount(Number(e.target.value) || 0)}
            placeholder="0"
            className="input mt-1 w-full stat-num text-lg"
            autoFocus
          />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-fg-subtle">Date</label>
          <input
            type="date"
            value={occurredOn}
            onChange={(e) => setOccurredOn(e.target.value)}
            className="input mt-1 w-full"
          />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-fg-subtle">Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Dinner with friends"
            className="input mt-1 w-full"
          />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-fg-subtle">
            Category (optional)
          </label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="input mt-1 w-full"
          >
            <option value="">— None —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </Modal>
  )
}
