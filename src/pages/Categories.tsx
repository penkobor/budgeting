import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useCategories, useDeleteCategory, useUpsertCategory } from '@/hooks/queries'
import { Modal } from '@/components/ui/Modal'
import { RowActions } from '@/components/ui/RowActions'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import type { Category } from '@/lib/db.types'

const PALETTE = [
  '#10b981', '#22c55e', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6',
  '#ec4899', '#f43f5e', '#ef4444', '#f97316', '#f59e0b', '#94a3b8',
]

export function CategoriesPage() {
  const { data: categories = [] } = useCategories()
  const upsert = useUpsertCategory()
  const del = useDeleteCategory()
  const confirm = useConfirm()
  const [editing, setEditing] = useState<Category | null>(null)
  const [adding, setAdding] = useState(false)

  return (
    <div className="p-4 md:p-8 space-y-4 md:space-y-6 max-w-3xl mx-auto">
      <header className="flex items-center justify-between">
        <div>
          <div className="label">Categories</div>
          <h1 className="text-title-1 md:text-large-title font-semibold mt-0.5">Tags &amp; colors</h1>
        </div>
        <button onClick={() => setAdding(true)} className="btn-primary"><Plus className="w-4 h-4" /> Add</button>
      </header>

      <div className="card divide-y divide-border">
        {categories.length === 0 && <div className="p-8 text-center text-sm text-fg-muted">No categories yet.</div>}
        {categories.map((c) => (
          <div key={c.id} className="group flex items-center gap-3 p-4">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ background: c.color }} />
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{c.name}</div>
              <div className="text-xs text-fg-subtle capitalize">{c.kind}</div>
            </div>
            <RowActions
              onEdit={() => setEditing(c)}
              onDelete={async () => {
                const ok = await confirm({
                  title: 'Delete this category?',
                  description: `“${c.name}” will be removed. Existing transactions keep their amounts but lose this label.`,
                  destructive: true,
                })
                if (ok) del.mutate(c.id)
              }}
            />
          </div>
        ))}
      </div>

      {(adding || editing) && (
        <CategoryForm
          cat={editing}
          open={adding || !!editing}
          onClose={() => { setAdding(false); setEditing(null) }}
          onSubmit={async (c) => {
            await upsert.mutateAsync(c)
            setAdding(false); setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function CategoryForm({ cat, open, onClose, onSubmit }: {
  cat: Category | null; open: boolean; onClose: () => void;
  onSubmit: (c: Partial<Category> & { name: string }) => Promise<void>
}) {
  const [name, setName] = useState(cat?.name ?? '')
  const [kind, setKind] = useState<'expense' | 'income'>(cat?.kind === 'income' ? 'income' : 'expense')
  const [color, setColor] = useState(cat?.color ?? PALETTE[0])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name) return
    await onSubmit({ id: cat?.id, name, kind, color })
  }

  return (
    <Modal
      open={open}
      onOpenChange={(o) => { if (!o) onClose() }}
      title={cat ? 'Edit category' : 'New category'}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button type="submit" form="category-form" className="btn-primary">Save</button>
        </>
      }
    >
      <form id="category-form" onSubmit={submit} className="space-y-4">
        <div>
          <div className="label mb-1.5">Name</div>
          <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setKind('expense')} className={`btn flex-1 ${kind === 'expense' ? 'bg-negative/10 text-negative border border-negative/30' : 'btn-outline'}`}>Expense</button>
          <button type="button" onClick={() => setKind('income')} className={`btn flex-1 ${kind === 'income' ? 'bg-positive/10 text-positive border border-positive/30' : 'btn-outline'}`}>Income</button>
        </div>
        <div>
          <div className="label mb-1.5">Color</div>
          <div className="flex flex-wrap gap-2">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-lg transition-all ${color === c ? 'ring-2 ring-accent ring-offset-2 ring-offset-bg-card scale-110' : 'hover:scale-105'}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
      </form>
    </Modal>
  )
}
