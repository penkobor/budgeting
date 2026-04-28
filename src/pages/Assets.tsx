import { useState } from 'react'
import { Plus, Coins, TrendingUp, Bitcoin, Wallet, Box } from 'lucide-react'
import { useAssets, useUpsertAsset, useDeleteAsset, useSettings } from '@/hooks/queries'
import { Modal } from '@/components/ui/Modal'
import { RowActions } from '@/components/ui/RowActions'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { formatMoney } from '@/lib/utils'
import type { Asset, AssetType } from '@/lib/db.types'

const ASSET_TYPES: { id: AssetType; label: string; icon: typeof Coins }[] = [
  { id: 'gold', label: 'Gold', icon: Coins },
  { id: 'stocks', label: 'Stocks', icon: TrendingUp },
  { id: 'crypto', label: 'Crypto', icon: Bitcoin },
  { id: 'cash', label: 'Cash', icon: Wallet },
  { id: 'other', label: 'Other', icon: Box },
]

const iconFor = (t: AssetType) => ASSET_TYPES.find((x) => x.id === t)?.icon ?? Box
const labelFor = (t: AssetType) => ASSET_TYPES.find((x) => x.id === t)?.label ?? 'Other'

export function AssetsPage() {
  const { data: assets = [] } = useAssets()
  const { data: settings } = useSettings()
  const upsert = useUpsertAsset()
  const del = useDeleteAsset()
  const confirm = useConfirm()
  const [editing, setEditing] = useState<Asset | null>(null)
  const [adding, setAdding] = useState(false)

  const currency = settings?.currency ?? 'CZK'
  const includedTotal = assets.reduce(
    (s, a) => s + (a.include_in_balance ? Number(a.value) : 0),
    0
  )
  const grandTotal = assets.reduce((s, a) => s + Number(a.value), 0)

  return (
    <div className="p-4 md:p-8 space-y-4 md:space-y-6 max-w-3xl mx-auto">
      <header className="flex items-center justify-between">
        <div>
          <div className="label">Wealth</div>
          <h1 className="text-title-1 md:text-large-title font-semibold mt-0.5">Assets</h1>
        </div>
        <button onClick={() => setAdding(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> Add
        </button>
      </header>

      {assets.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="card p-4">
            <div className="label">Counted in balance</div>
            <div className="text-xl md:text-2xl font-semibold stat-num mt-1 text-positive">
              {formatMoney(includedTotal, currency)}
            </div>
          </div>
          <div className="card p-4">
            <div className="label">Total</div>
            <div className="text-xl md:text-2xl font-semibold stat-num mt-1">
              {formatMoney(grandTotal, currency)}
            </div>
          </div>
        </div>
      )}

      <div className="card divide-y divide-border">
        {assets.length === 0 && (
          <div className="p-8 text-center text-sm text-fg-muted">
            No assets yet. Tap <span className="text-fg">Add</span> to track gold, stocks, crypto, cash, or anything else.
          </div>
        )}
        {assets.map((a) => {
          const Icon = iconFor(a.type)
          return (
            <div key={a.id} className="group flex items-center gap-3 p-4">
              <div className="w-9 h-9 rounded-xl bg-accent/10 text-accent grid place-items-center shrink-0">
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate flex items-center gap-2">
                  {a.name}
                  {!a.include_in_balance && (
                    <span className="text-[0.625rem] uppercase tracking-wide bg-fg-muted/10 text-fg-muted px-1.5 py-0.5 rounded">
                      excluded
                    </span>
                  )}
                </div>
                <div className="text-xs text-fg-subtle">{labelFor(a.type)}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-semibold stat-num">{formatMoney(Number(a.value), currency)}</div>
                <button
                  type="button"
                  onClick={() =>
                    upsert.mutate({
                      id: a.id,
                      name: a.name,
                      type: a.type,
                      value: a.value,
                      notes: a.notes,
                      include_in_balance: !a.include_in_balance,
                    })
                  }
                  className={`text-[0.6875rem] mt-0.5 ${a.include_in_balance ? 'text-accent' : 'text-fg-muted'}`}
                >
                  {a.include_in_balance ? 'In balance' : 'Excluded'}
                </button>
              </div>
              <RowActions
                onEdit={() => setEditing(a)}
                onDelete={async () => {
                  const ok = await confirm({
                    title: `Delete asset “${a.name}”?`,
                    description: 'This is a manual asset entry. Removing it does not affect transactions.',
                    destructive: true,
                  })
                  if (ok) del.mutate(a.id)
                }}
              />
            </div>
          )
        })}
      </div>

      {(adding || editing) && (
        <AssetForm
          asset={editing}
          open={adding || !!editing}
          onClose={() => {
            setAdding(false)
            setEditing(null)
          }}
          onSubmit={async (a) => {
            await upsert.mutateAsync(a)
            setAdding(false)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function AssetForm({
  asset,
  open,
  onClose,
  onSubmit,
}: {
  asset: Asset | null
  open: boolean
  onClose: () => void
  onSubmit: (a: {
    id?: string
    name: string
    type: AssetType
    value: number
    notes: string | null
    include_in_balance: boolean
  }) => Promise<void>
}) {
  const [name, setName] = useState(asset?.name ?? '')
  const [type, setType] = useState<AssetType>(asset?.type ?? 'other')
  const [value, setValue] = useState(asset ? String(asset.value) : '')
  const [notes, setNotes] = useState(asset?.notes ?? '')
  const [includeInBalance, setIncludeInBalance] = useState(asset?.include_in_balance ?? true)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = parseFloat(value.replace(',', '.'))
    if (!name.trim() || Number.isNaN(n) || n < 0) return
    await onSubmit({
      id: asset?.id,
      name: name.trim(),
      type,
      value: n,
      notes: notes.trim() ? notes.trim() : null,
      include_in_balance: includeInBalance,
    })
  }

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
      title={asset ? 'Edit asset' : 'New asset'}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button type="submit" form="asset-form" className="btn-primary">
            Save
          </button>
        </>
      }
    >
      <form id="asset-form" onSubmit={submit} className="space-y-4">
        <div>
          <div className="label mb-1.5">Name</div>
          <input
            className="input"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Gold bar, AAPL, BTC, Savings"
            required
          />
        </div>
        <div>
          <div className="label mb-1.5">Type</div>
          <div className="grid grid-cols-5 gap-1.5">
            {ASSET_TYPES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setType(id)}
                className={`flex flex-col items-center gap-1 py-2 rounded-xl text-[0.6875rem] transition-all ${
                  type === id
                    ? 'bg-accent/10 text-accent border border-accent/30'
                    : 'border border-border text-fg-muted hover:text-fg'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="label mb-1.5">Value</div>
          <input
            className="input stat-num"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="0"
            required
          />
        </div>
        <div>
          <div className="label mb-1.5">Notes</div>
          <input
            className="input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="optional"
          />
        </div>
        <label className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border cursor-pointer">
          <div>
            <div className="font-medium text-sm">Include in current balance</div>
            <div className="text-xs text-fg-muted">When on, this asset's value adds to your displayed balance.</div>
          </div>
          <input
            type="checkbox"
            checked={includeInBalance}
            onChange={(e) => setIncludeInBalance(e.target.checked)}
            className="w-5 h-5 accent-accent shrink-0"
          />
        </label>
      </form>
    </Modal>
  )
}
