import { Link } from 'react-router-dom'
import { Tags, ChevronRight } from 'lucide-react'
import { useSettings, useUpdateSettings } from '@/hooks/queries'
import { useAuth } from '@/hooks/useAuth'
import { useUi } from '@/store/ui'
import { supabase } from '@/lib/supabase'
import { APP_VERSION, BUILD_SHA, BUILD_TIME, formatBuildTime } from '@/lib/version'

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
