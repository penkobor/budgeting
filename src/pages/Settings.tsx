import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Tags, ChevronRight, Users, Plus } from 'lucide-react'
import { useSettings, useUpdateSettings } from '@/hooks/queries'
import { useAuth } from '@/hooks/useAuth'
import { useUi } from '@/store/ui'
import { supabase } from '@/lib/supabase'
import { APP_VERSION, BUILD_SHA, BUILD_TIME, formatBuildTime } from '@/lib/version'
import { useSpaces, useCreateSpace } from '@/hooks/spaces'
import { Modal } from '@/components/ui/Modal'
import { pushToast } from '@/components/ui/Toast'

export function SettingsPage() {
  const { data: settings } = useSettings()
  const update = useUpdateSettings()
  const { theme, setTheme } = useUi()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data: spaces = [] } = useSpaces()
  const createSpace = useCreateSpace()
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCurrency, setNewCurrency] = useState('')

  const openCreate = () => {
    setNewName('')
    setNewCurrency(settings?.currency ?? 'EUR')
    setCreating(true)
  }

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    try {
      const space = await createSpace.mutateAsync({ name, currency: newCurrency.trim() || 'EUR' })
      pushToast('Space created')
      setCreating(false)
      navigate(`/spaces/${space.id}`)
    } catch (err) {
      pushToast((err as Error).message, 'error')
    }
  }

  return (
    <div className="p-4 md:p-8 space-y-4 md:space-y-6 max-w-2xl mx-auto">
      <header>
        <div className="label">Account</div>
        <h1 className="text-2xl md:text-3xl font-semibold mt-0.5">Settings</h1>
      </header>

      <section className="card p-4 md:p-5 space-y-3 md:space-y-4">
        <h2 className="font-semibold">Profile</h2>
        <div className="text-sm text-fg-muted">Signed in as <span className="text-fg font-medium">{user?.email}</span></div>
        <button onClick={() => supabase.auth.signOut()} className="btn-outline">Sign out</button>
      </section>

      <section className="card p-4 md:p-5 space-y-3 md:space-y-4">
        <h2 className="font-semibold">Preferences</h2>
        <div>
          <div className="label mb-1.5">Currency</div>
          <input
            className="input max-w-[10rem]"
            defaultValue={settings?.currency ?? 'CZK'}
            placeholder="CZK"
            onBlur={(e) => {
              const code = e.target.value.trim()
              if (!code) {
                e.target.value = settings?.currency ?? 'CZK'
                return
              }
              update.mutate({ currency: code })
            }}
          />
          <p className="text-xs text-fg-subtle mt-1">ISO code preferred (CZK, EUR…); custom symbols like Kč also work — they'll just be appended after the amount.</p>
        </div>
        <div>
          <div className="label mb-1.5">Theme</div>
          <div className="flex gap-2">
            <button onClick={() => setTheme('dark')} className={`btn flex-1 ${theme === 'dark' ? 'bg-accent/10 text-accent border border-accent/30' : 'btn-outline'}`}>Dark</button>
            <button onClick={() => setTheme('light')} className={`btn flex-1 ${theme === 'light' ? 'bg-accent/10 text-accent border border-accent/30' : 'btn-outline'}`}>Light</button>
          </div>
        </div>
      </section>

      <section className="card p-0 overflow-hidden">
        <Link
          to="/categories"
          className="flex items-center gap-3 p-4 md:p-5 hover:bg-bg-elev/50 transition-colors"
        >
          <div className="w-9 h-9 rounded-xl bg-accent/10 text-accent grid place-items-center shrink-0">
            <Tags className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium">Categories</div>
            <div className="text-xs text-fg-subtle">Tags &amp; colors for transactions</div>
          </div>
          <ChevronRight className="w-4 h-4 text-fg-subtle" />
        </Link>
      </section>

      <section className="card p-4 md:p-5 space-y-3 md:space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-accent/10 text-accent grid place-items-center shrink-0">
            <Users className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold">Shared spaces</h2>
            <div className="text-xs text-fg-subtle">Budgets shared with others</div>
          </div>
        </div>
        <div className="divide-y divide-border -mx-4 md:-mx-5">
          {spaces.length === 0 && (
            <div className="px-4 md:px-5 py-3 text-sm text-fg-muted">No shared spaces yet</div>
          )}
          {spaces.map((s) => (
            <Link
              key={s.id}
              to={`/spaces/${s.id}`}
              className="flex items-center gap-3 px-4 md:px-5 py-3 hover:bg-bg-elev/50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{s.name}</div>
              </div>
              <span className="text-[11px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-bg-elev text-fg-muted">
                {s.currency}
              </span>
              <ChevronRight className="w-4 h-4 text-fg-subtle" />
            </Link>
          ))}
        </div>
        <button onClick={openCreate} className="btn-outline w-full">
          <Plus className="w-4 h-4" /> Create space
        </button>
      </section>

      <section className="card p-4 md:p-5 space-y-1.5">
        <h2 className="font-semibold">Build</h2>
        <p className="text-xs text-fg-subtle stat-num leading-relaxed">
          v{APP_VERSION} · <span title="Git commit short SHA">{BUILD_SHA}</span>
          <br />
          <span className="text-fg-muted" title={BUILD_TIME}>built {formatBuildTime()}</span>
        </p>
        <p className="text-[11px] text-fg-muted">
          Use this to confirm a fresh deploy landed — the SHA changes on every commit.
        </p>
      </section>

      <Modal
        open={creating}
        onOpenChange={setCreating}
        title="New space"
        footer={
          <>
            <button type="button" onClick={() => setCreating(false)} className="btn-ghost">Cancel</button>
            <button type="submit" form="create-space-form" className="btn-primary" disabled={createSpace.isPending}>
              {createSpace.isPending ? 'Creating…' : 'Create'}
            </button>
          </>
        }
      >
        <form id="create-space-form" onSubmit={submitCreate} className="space-y-4">
          <div>
            <div className="label mb-1.5">Name</div>
            <input className="input" autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} required placeholder="Family budget" />
          </div>
          <div>
            <div className="label mb-1.5">Currency</div>
            <input className="input max-w-[10rem]" value={newCurrency} onChange={(e) => setNewCurrency(e.target.value)} placeholder="EUR" />
          </div>
        </form>
      </Modal>
    </div>
  )
}
