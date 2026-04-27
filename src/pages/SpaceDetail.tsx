import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ChevronLeft,
  Pencil,
  Plus,
  Trash2,
  Copy,
  Link2,
  LogOut,
  AlertTriangle,
} from 'lucide-react'
import {
  useSpace,
  useUpdateSpace,
  useDeleteSpace,
  useSpaceMembers,
  useSpaceMemberProfiles,
  useKickMember,
  useLeaveSpace,
  useSpaceCategories,
  useUpsertSpaceCategory,
  useDeleteSpaceCategory,
  useSpaceInvites,
  useGenerateInvite,
  useRevokeInvite,
  buildInviteUrl,
} from '@/hooks/spaces'
import { useAuth } from '@/hooks/useAuth'
import { Modal } from '@/components/ui/Modal'
import { pushToast } from '@/components/ui/Toast'
import type { SpaceCategory, SpaceInvite } from '@/lib/db.types'

export function SpaceDetailPage() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const { data: space, isLoading: spaceLoading, error: spaceError } = useSpace(id)
  const { data: members = [] } = useSpaceMembers(id)
  const { data: profiles = [] } = useSpaceMemberProfiles(id)
  const profileByUserId = new Map(profiles.map((p) => [p.user_id, p.email]))
  const { data: categories = [] } = useSpaceCategories(id)
  const { data: invites = [] } = useSpaceInvites(id)

  const updateSpace = useUpdateSpace()
  const deleteSpace = useDeleteSpace()
  const kickMember = useKickMember()
  const leaveSpace = useLeaveSpace()
  const upsertCategory = useUpsertSpaceCategory()
  const deleteCategory = useDeleteSpaceCategory()
  const generateInvite = useGenerateInvite()
  const revokeInvite = useRevokeInvite()

  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingCat, setEditingCat] = useState<SpaceCategory | null>(null)
  const [addingCat, setAddingCat] = useState(false)
  const [deletingCat, setDeletingCat] = useState<SpaceCategory | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [confirmingLeave, setConfirmingLeave] = useState(false)
  const [kickTarget, setKickTarget] = useState<string | null>(null)

  if (spaceLoading) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto text-sm text-fg-muted">Loading…</div>
    )
  }
  if (spaceError || !space) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-3">
        <Link to="/settings" className="btn-ghost inline-flex"><ChevronLeft className="w-4 h-4" /> Back</Link>
        <div className="card p-4 text-sm text-negative">
          {spaceError ? (spaceError as Error).message : 'Space not found.'}
        </div>
      </div>
    )
  }

  const isOwner = user?.id === space.owner_user_id
  const now = Date.now()
  const activeInvites = invites.filter((i) => !i.used_at && new Date(i.expires_at).getTime() > now)
  const inactiveInvites = invites.filter((i) => i.used_at || new Date(i.expires_at).getTime() <= now)

  const openRename = () => {
    setNewName(space.name)
    setRenaming(true)
  }
  const submitRename = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = newName.trim()
    if (!name || name === space.name) {
      setRenaming(false)
      return
    }
    try {
      await updateSpace.mutateAsync({ id: space.id, name })
      pushToast('Renamed')
      setRenaming(false)
    } catch (err) {
      pushToast((err as Error).message, 'error')
    }
  }

  const onCopy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(buildInviteUrl(token))
      pushToast('Invite link copied')
    } catch {
      pushToast('Could not copy link', 'error')
    }
  }

  const onGenerate = async () => {
    try {
      const inv = await generateInvite.mutateAsync({ spaceId: space.id })
      try {
        await navigator.clipboard.writeText(buildInviteUrl(inv.token))
        pushToast('Invite created and link copied')
      } catch {
        pushToast('Invite created')
      }
    } catch (err) {
      pushToast((err as Error).message, 'error')
    }
  }

  const onRevoke = async (inv: SpaceInvite) => {
    try {
      await revokeInvite.mutateAsync({ id: inv.id, spaceId: space.id })
      pushToast('Invite revoked')
    } catch (err) {
      pushToast((err as Error).message, 'error')
    }
  }

  const onKick = async () => {
    if (!kickTarget) return
    try {
      await kickMember.mutateAsync({ spaceId: space.id, userId: kickTarget })
      pushToast('Member removed')
      setKickTarget(null)
    } catch (err) {
      pushToast((err as Error).message, 'error')
    }
  }

  const onDeleteSpace = async () => {
    try {
      await deleteSpace.mutateAsync(space.id)
      pushToast('Space deleted')
      navigate('/settings')
    } catch (err) {
      pushToast((err as Error).message, 'error')
    }
  }

  const onLeave = async () => {
    try {
      await leaveSpace.mutateAsync(space.id)
      pushToast('Left space')
      navigate('/settings')
    } catch (err) {
      pushToast((err as Error).message, 'error')
    }
  }

  const onCategorySubmit = async (input: { id?: string; name: string; color: string; icon: string | null }) => {
    try {
      await upsertCategory.mutateAsync({
        id: input.id,
        space_id: space.id,
        name: input.name,
        color: input.color,
        icon: input.icon,
      })
      pushToast('Saved')
      setAddingCat(false)
      setEditingCat(null)
    } catch (err) {
      pushToast((err as Error).message, 'error')
    }
  }

  const onCategoryDelete = async () => {
    if (!deletingCat) return
    try {
      await deleteCategory.mutateAsync({ id: deletingCat.id, spaceId: space.id })
      pushToast('Category deleted')
      setDeletingCat(null)
    } catch (err) {
      pushToast((err as Error).message, 'error')
    }
  }

  return (
    <div className="p-4 md:p-8 space-y-4 md:space-y-6 max-w-2xl mx-auto">
      <header className="flex items-center gap-2">
        <Link to="/settings" className="btn-ghost !p-2" aria-label="Back">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl md:text-3xl font-semibold flex-1 truncate">{space.name}</h1>
        {isOwner && (
          <button onClick={openRename} className="btn-ghost !p-2" aria-label="Rename">
            <Pencil className="w-4 h-4" />
          </button>
        )}
      </header>

      <section className="card p-4 md:p-5 space-y-3">
        <h2 className="font-semibold">Members</h2>
        <div className="divide-y divide-border -mx-4 md:-mx-5">
          {members.map((m) => {
            const isSelf = m.user_id === user?.id
            const isOwnerRow = m.role === 'owner'
            const email = profileByUserId.get(m.user_id) ?? null
            const displayName = isSelf ? 'You' : email ?? `${m.user_id.slice(0, 8)}…`
            const initial = (email ?? (isSelf ? user?.email ?? '?' : m.user_id)).charAt(0).toUpperCase()
            return (
              <div key={m.user_id} className="flex items-center gap-3 px-4 md:px-5 py-3">
                <div className="w-9 h-9 rounded-full bg-bg-elev grid place-items-center text-sm font-medium shrink-0">
                  {initial}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{displayName}</div>
                  {!isSelf && email && <div className="text-xs text-fg-subtle truncate">{email}</div>}
                </div>
                <span className={`text-[11px] uppercase tracking-wide px-1.5 py-0.5 rounded ${isOwnerRow ? 'bg-accent/15 text-accent' : 'bg-bg-elev text-fg-muted'}`}>
                  {m.role}
                </span>
                {isOwner && !isOwnerRow && !isSelf && (
                  <button onClick={() => setKickTarget(m.user_id)} className="btn-ghost !p-2 text-negative" aria-label="Remove">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </section>

      <section className="card p-4 md:p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Categories</h2>
          <button onClick={() => setAddingCat(true)} className="btn-outline">
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>
        <div className="divide-y divide-border -mx-4 md:-mx-5">
          {categories.length === 0 && (
            <div className="px-4 md:px-5 py-3 text-sm text-fg-muted">No categories yet</div>
          )}
          {categories.map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-4 md:px-5 py-3">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ background: c.color }} />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{c.name}</div>
                {c.icon && <div className="text-xs text-fg-subtle truncate">{c.icon}</div>}
              </div>
              <button onClick={() => setEditingCat(c)} className="btn-ghost !p-2" aria-label="Edit">
                <Pencil className="w-4 h-4" />
              </button>
              <button onClick={() => setDeletingCat(c)} className="btn-ghost !p-2 text-negative" aria-label="Delete">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </section>

      {isOwner && (
        <section className="card p-4 md:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Invites</h2>
            <button onClick={onGenerate} className="btn-primary" disabled={generateInvite.isPending}>
              <Link2 className="w-4 h-4" /> Generate
            </button>
          </div>
          <div className="divide-y divide-border -mx-4 md:-mx-5">
            {activeInvites.length === 0 && (
              <div className="px-4 md:px-5 py-3 text-sm text-fg-muted">No active invites</div>
            )}
            {activeInvites.map((inv) => (
              <div key={inv.id} className="flex items-center gap-3 px-4 md:px-5 py-3">
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-xs truncate">{buildInviteUrl(inv.token)}</div>
                  <div className="text-xs text-fg-subtle">{formatExpiry(inv.expires_at)}</div>
                </div>
                <button onClick={() => onCopy(inv.token)} className="btn-ghost !p-2" aria-label="Copy">
                  <Copy className="w-4 h-4" />
                </button>
                <button onClick={() => onRevoke(inv)} className="btn-ghost !p-2 text-negative" aria-label="Revoke">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          {inactiveInvites.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-fg-muted">Used / expired ({inactiveInvites.length})</summary>
              <div className="mt-2 divide-y divide-border -mx-4 md:-mx-5">
                {inactiveInvites.map((inv) => (
                  <div key={inv.id} className="flex items-center gap-3 px-4 md:px-5 py-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-xs truncate text-fg-subtle">{inv.token}</div>
                      <div className="text-xs text-fg-subtle">
                        {inv.used_at ? `used ${formatRelative(inv.used_at)}` : `expired ${formatRelative(inv.expires_at)}`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </section>
      )}

      <section className="card p-4 md:p-5 space-y-3 border border-negative/30">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-negative" />
          <h2 className="font-semibold">Danger zone</h2>
        </div>
        {isOwner ? (
          <button onClick={() => setConfirmingDelete(true)} className="btn-outline text-negative border-negative/40 hover:bg-negative/10">
            <Trash2 className="w-4 h-4" /> Delete space
          </button>
        ) : (
          <button onClick={() => setConfirmingLeave(true)} className="btn-outline text-negative border-negative/40 hover:bg-negative/10">
            <LogOut className="w-4 h-4" /> Leave space
          </button>
        )}
      </section>

      <Modal
        open={renaming}
        onOpenChange={setRenaming}
        title="Rename space"
        footer={
          <>
            <button type="button" onClick={() => setRenaming(false)} className="btn-ghost">Cancel</button>
            <button type="submit" form="rename-space-form" className="btn-primary">Save</button>
          </>
        }
      >
        <form id="rename-space-form" onSubmit={submitRename} className="space-y-3">
          <div>
            <div className="label mb-1.5">Name</div>
            <input className="input" autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} required />
          </div>
        </form>
      </Modal>

      {(addingCat || editingCat) && (
        <CategoryForm
          cat={editingCat}
          open={addingCat || !!editingCat}
          onClose={() => { setAddingCat(false); setEditingCat(null) }}
          onSubmit={onCategorySubmit}
        />
      )}

      <Modal
        open={!!deletingCat}
        onOpenChange={(o) => { if (!o) setDeletingCat(null) }}
        title="Delete category?"
        footer={
          <>
            <button type="button" onClick={() => setDeletingCat(null)} className="btn-ghost">Cancel</button>
            <button type="button" onClick={onCategoryDelete} className="btn-primary bg-negative hover:bg-negative">Delete</button>
          </>
        }
      >
        <p className="text-sm text-fg-muted">
          {deletingCat && `"${deletingCat.name}" will be removed. Transactions tagged with it will lose this tag.`}
        </p>
      </Modal>

      <Modal
        open={!!kickTarget}
        onOpenChange={(o) => { if (!o) setKickTarget(null) }}
        title="Remove member?"
        footer={
          <>
            <button type="button" onClick={() => setKickTarget(null)} className="btn-ghost">Cancel</button>
            <button type="button" onClick={onKick} className="btn-primary bg-negative hover:bg-negative">Remove</button>
          </>
        }
      >
        <p className="text-sm text-fg-muted">
          They will lose access to this space's transactions.
        </p>
      </Modal>

      <Modal
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title="Delete this space?"
        footer={
          <>
            <button type="button" onClick={() => setConfirmingDelete(false)} className="btn-ghost">Cancel</button>
            <button type="button" onClick={onDeleteSpace} className="btn-primary bg-negative hover:bg-negative">Delete</button>
          </>
        }
      >
        <p className="text-sm text-fg-muted">
          Transactions tagged in this space will become personal. Members will lose access. This cannot be undone.
        </p>
      </Modal>

      <Modal
        open={confirmingLeave}
        onOpenChange={setConfirmingLeave}
        title="Leave this space?"
        footer={
          <>
            <button type="button" onClick={() => setConfirmingLeave(false)} className="btn-ghost">Cancel</button>
            <button type="button" onClick={onLeave} className="btn-primary bg-negative hover:bg-negative">Leave</button>
          </>
        }
      >
        <p className="text-sm text-fg-muted">
          You will lose access to all shared transactions in this space. Your past transactions remain in your personal ledger.
        </p>
      </Modal>
    </div>
  )
}

const PALETTE = [
  '#10b981', '#22c55e', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6',
  '#ec4899', '#f43f5e', '#ef4444', '#f97316', '#f59e0b', '#94a3b8',
]

function CategoryForm({ cat, open, onClose, onSubmit }: {
  cat: SpaceCategory | null
  open: boolean
  onClose: () => void
  onSubmit: (input: { id?: string; name: string; color: string; icon: string | null }) => Promise<void>
}) {
  const [name, setName] = useState(cat?.name ?? '')
  const [color, setColor] = useState(cat?.color ?? PALETTE[0])
  const [icon, setIcon] = useState(cat?.icon ?? '')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    await onSubmit({ id: cat?.id, name: name.trim(), color, icon: icon.trim() || null })
  }

  return (
    <Modal
      open={open}
      onOpenChange={(o) => { if (!o) onClose() }}
      title={cat ? 'Edit category' : 'New category'}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button type="submit" form="space-category-form" className="btn-primary">Save</button>
        </>
      }
    >
      <form id="space-category-form" onSubmit={submit} className="space-y-4">
        <div>
          <div className="label mb-1.5">Name</div>
          <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <div className="label mb-1.5">Color</div>
          <div className="flex items-center gap-3">
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-10 h-10 rounded-lg bg-transparent border border-border cursor-pointer" />
            <input className="input flex-1 font-mono text-xs" value={color} onChange={(e) => setColor(e.target.value)} />
          </div>
        </div>
        <div>
          <div className="label mb-1.5">Icon (optional)</div>
          <input className="input" value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="emoji or name" />
        </div>
      </form>
    </Modal>
  )
}

function formatExpiry(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return 'expired'
  const days = Math.floor(ms / 86_400_000)
  const hours = Math.floor((ms % 86_400_000) / 3_600_000)
  if (days > 0) return `expires in ${days}d ${hours}h`
  const mins = Math.floor((ms % 3_600_000) / 60_000)
  if (hours > 0) return `expires in ${hours}h ${mins}m`
  return `expires in ${mins}m`
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return 'just now'
  const mins = Math.floor(ms / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
