import { useEffect, useState } from 'react'
import { Modal } from './ui/Modal'
import { useCategories, useUpsertTransaction } from '@/hooks/queries'
import { isoDate } from '@/lib/utils'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialDate?: string
  initialAmount?: number
  initialDescription?: string
  initialCategoryId?: string | null
  /**
   * When set, the saved transaction is linked to this recurring rule for that
   * specific date — effectively overriding the rule's default for one
   * occurrence without touching the template.
   */
  initialRecurringRuleId?: string | null
  editId?: string
}

export function AddTransactionDialog({
  open, onOpenChange,
  initialDate, initialAmount, initialDescription, initialCategoryId,
  initialRecurringRuleId, editId,
}: Props) {
  const { data: categories } = useCategories()
  const upsert = useUpsertTransaction()

  const [date, setDate] = useState(initialDate ?? isoDate(new Date()))
  const [amount, setAmount] = useState(String(initialAmount ?? ''))
  const [description, setDescription] = useState(initialDescription ?? '')
  const [categoryId, setCategoryId] = useState<string | ''>(initialCategoryId ?? '')
  const [kind, setKind] = useState<'expense' | 'income'>(
    (initialAmount ?? -1) >= 0 ? 'income' : 'expense'
  )

  useEffect(() => {
    if (open) {
      setDate(initialDate ?? isoDate(new Date()))
      setAmount(initialAmount !== undefined ? String(Math.abs(initialAmount)) : '')
      setDescription(initialDescription ?? '')
      setCategoryId(initialCategoryId ?? '')
      setKind((initialAmount ?? -1) >= 0 ? 'income' : 'expense')
    }
  }, [open, initialDate, initialAmount, initialDescription, initialCategoryId])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = parseFloat(amount.replace(',', '.'))
    if (Number.isNaN(n) || n <= 0) return
    const signed = kind === 'income' ? Math.abs(n) : -Math.abs(n)
    await upsert.mutateAsync({
      id: editId,
      occurred_on: date,
      amount: signed,
      description: description || null,
      category_id: categoryId || null,
      recurring_rule_id: initialRecurringRuleId ?? null,
      // App is a planning tool now — we don't track actual-vs-planned anymore.
      // We always write `planned: true` to satisfy the legacy NOT NULL column.
      planned: true,
      confirmed_at: null,
    })
    onOpenChange(false)
  }

  const filteredCats = (categories ?? []).filter((c) => c.kind === kind)

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={editId ? 'Edit transaction' : 'Add transaction'}
      description="Press ⌘+Enter to save"
      footer={
        <>
          <button type="button" onClick={() => onOpenChange(false)} className="btn-ghost">Cancel</button>
          <button type="submit" form="add-tx-form" disabled={upsert.isPending} className="btn-primary">
            {upsert.isPending ? 'Saving…' : editId ? 'Save' : 'Add'}
          </button>
        </>
      }
    >
      <form id="add-tx-form" onSubmit={submit} className="space-y-4" onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit(e as React.FormEvent)
      }}>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setKind('expense')}
            className={`btn flex-1 ${kind === 'expense' ? 'bg-negative/10 text-negative border border-negative/30' : 'btn-outline'}`}
          >
            Expense
          </button>
          <button
            type="button"
            onClick={() => setKind('income')}
            className={`btn flex-1 ${kind === 'income' ? 'bg-positive/10 text-positive border border-positive/30' : 'btn-outline'}`}
          >
            Income
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="min-w-0">
            <div className="label mb-1.5">Amount</div>
            <input
              className="input stat-num text-lg"
              inputMode="decimal"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="min-w-0">
            <div className="label mb-1.5">Date</div>
            <input
              className="input stat-num"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>

        <div>
          <div className="label mb-1.5">Description</div>
          <input
            className="input"
            placeholder="e.g. Groceries at Albert"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div>
          <div className="label mb-1.5">Category</div>
          <select
            className="input"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">— uncategorised —</option>
            {filteredCats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

      </form>
    </Modal>
  )
}
