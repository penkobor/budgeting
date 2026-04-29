import { Link } from 'react-router-dom'
import { useState } from 'react'
import { Tags, ChevronRight, Share2, Copy, Check } from 'lucide-react'
import { useSettings, useUpdateSettings } from '@/hooks/queries'
import { useAuth } from '@/hooks/useAuth'
import { useUi } from '@/store/ui'
import { supabase } from '@/lib/supabase'
import { getHapticsPreference, isHapticsSupported, setHapticsEnabled, haptics } from '@/lib/haptics'
import { APP_VERSION, BUILD_SHA, BUILD_TIME, formatBuildTime } from '@/lib/version'
import { useShareLink, useUpsertShareLink, useDisableShareLink, buildShareUrl } from '@/hooks/share'
import { pushToast } from '@/components/ui/Toast'

export function SettingsPage() {
  const { data: settings } = useSettings()
  const update = useUpdateSettings()
  const { theme, setTheme } = useUi()
  const { user } = useAuth()

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
        <HapticsToggle />
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

      <ShareLinkSection />

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
    </div>
  )
}

function ShareLinkSection() {
  const { data: link, isLoading } = useShareLink()
  const upsert = useUpsertShareLink()
  const disable = useDisableShareLink()
  const [draftName, setDraftName] = useState('')
  const [copied, setCopied] = useState(false)

  const enabled = !!link
  const url = link ? buildShareUrl(link.slug) : null

  const onEnable = async () => {
    const name = draftName.trim()
    if (!name) {
      pushToast('Enter a name to show on the public page', 'error')
      return
    }
    try {
      await upsert.mutateAsync({ display_name: name })
      pushToast('Share link enabled')
      setDraftName('')
    } catch (err) {
      pushToast((err as Error).message, 'error')
    }
  }

  const onSaveName = async () => {
    const name = draftName.trim()
    if (!name || name === link?.display_name) return
    try {
      await upsert.mutateAsync({ display_name: name })
      pushToast('Display name updated')
    } catch (err) {
      pushToast((err as Error).message, 'error')
    }
  }

  const onDisable = async () => {
    if (!confirm('Disable the share link? The current URL will stop working.')) return
    try {
      await disable.mutateAsync()
      pushToast('Share link disabled')
    } catch (err) {
      pushToast((err as Error).message, 'error')
    }
  }

  const onCopy = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      pushToast((err as Error).message, 'error')
    }
  }

  return (
    <section className="card p-4 md:p-5 space-y-3 md:space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-accent/10 text-accent grid place-items-center shrink-0">
          <Share2 className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold">Share my plans</h2>
          <div className="text-xs text-fg-subtle">
            Read-only public page of entries you’ve marked as shared
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-fg-muted">Loading…</div>
      ) : !enabled ? (
        <div className="space-y-2">
          <div className="label mb-1">Display name</div>
          <input
            className="input"
            placeholder="e.g. Boris"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            maxLength={80}
          />
          <p className="text-[11px] text-fg-subtle">
            Visitors will see “{draftName.trim() || 'Your name'} plans:” as the page header.
          </p>
          <button onClick={onEnable} className="btn-primary w-full" disabled={upsert.isPending}>
            {upsert.isPending ? 'Enabling…' : 'Enable share link'}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <div className="label mb-1">Display name</div>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                defaultValue={link.display_name}
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={onSaveName}
                maxLength={80}
              />
            </div>
          </div>
          <div>
            <div className="label mb-1">Public URL</div>
            <div className="flex gap-2">
              <input
                className="input flex-1 stat-num text-xs"
                value={url ?? ''}
                readOnly
                onFocus={(e) => e.currentTarget.select()}
              />
              <button onClick={onCopy} className="btn-outline shrink-0" aria-label="Copy URL">
                {copied ? <Check className="w-4 h-4 text-positive" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-fg-subtle mt-1.5">
              Anyone with this link can view entries you’ve marked as shared. No password.
            </p>
          </div>
          <button onClick={onDisable} className="btn-outline w-full text-negative" disabled={disable.isPending}>
            {disable.isPending ? 'Disabling…' : 'Disable share link'}
          </button>
        </div>
      )}
    </section>
  )
}

function HapticsToggle() {
  const supported = isHapticsSupported()
  const [enabled, setEnabled] = useState(getHapticsPreference())

  const toggle = () => {
    const next = !enabled
    setEnabled(next)
    setHapticsEnabled(next)
    if (next) haptics.medium()
  }

  return (
    <div>
      <div className="label mb-1.5">Haptic feedback</div>
      <button
        onClick={toggle}
        disabled={!supported}
        className={`btn w-full ${enabled && supported ? 'bg-accent/10 text-accent border border-accent/30' : 'btn-outline'}`}
      >
        {!supported ? 'Not supported on this device' : enabled ? 'On — tap to disable' : 'Off — tap to enable'}
      </button>
      <p className="text-xs text-fg-subtle mt-1">
        Light vibration on every button tap. Works on Android &amp; most desktop browsers; iOS Safari has no Web API for the Taptic Engine.
      </p>
    </div>
  )
}
