import { useState } from 'react'
import { useMonthlyOpening, useSetMonthlyOpening, useSettings, useUpdateSettings } from '@/hooks/queries'
import { useAuth } from '@/hooks/useAuth'
import { useUi } from '@/store/ui'
import { monthKey } from '@/lib/utils'
import { seedAprilFromNumbers } from '@/lib/seed'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'

export function SettingsPage() {
  const { data: settings } = useSettings()
  const update = useUpdateSettings()
  const { theme, setTheme } = useUi()
  const { user } = useAuth()
  const qc = useQueryClient()

  const today = new Date()
  const [month, setMonth] = useState(monthKey(new Date(today.getFullYear(), today.getMonth(), 1)))
  const { data: opening } = useMonthlyOpening(month)
  const setOpening = useSetMonthlyOpening()
  const [openingValue, setOpeningValue] = useState('')
  const [seedMsg, setSeedMsg] = useState<string | null>(null)
  const [seedErr, setSeedErr] = useState<string | null>(null)
  const [seeding, setSeeding] = useState(false)

  const seed = async () => {
    setSeeding(true); setSeedErr(null); setSeedMsg(null)
    try {
      await seedAprilFromNumbers()
      setSeedMsg('Seeded! April 2026 is loaded.')
      qc.invalidateQueries()
    } catch (e: unknown) {
      setSeedErr(e instanceof Error ? e.message : 'Seed failed')
    } finally {
      setSeeding(false)
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

      <section className="card p-4 md:p-5 space-y-3 md:space-y-4">
        <h2 className="font-semibold">Opening balance</h2>
        <p className="text-sm text-fg-muted">Set the starting balance for a given month — used as the anchor for the running balance.</p>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 md:items-end">
          <div>
            <div className="label mb-1.5">Month</div>
            <input type="month" className="input stat-num" value={month.slice(0, 7)}
              onChange={(e) => setMonth(`${e.target.value}-01`)} />
          </div>
          <div>
            <div className="label mb-1.5">Balance</div>
            <input
              className="input stat-num"
              inputMode="decimal"
              placeholder={opening ? String(opening.opening_balance) : '0'}
              value={openingValue}
              onChange={(e) => setOpeningValue(e.target.value)}
            />
          </div>
          <button
            onClick={async () => {
              const n = parseFloat(openingValue.replace(',', '.'))
              if (!Number.isNaN(n)) {
                await setOpening.mutateAsync({ month, opening_balance: n })
                setOpeningValue('')
              }
            }}
            className="btn-primary md:self-end"
          >
            Save
          </button>
        </div>
        {opening && (
          <div className="text-xs text-fg-subtle stat-num">
            Current: {opening.opening_balance}
            {(opening as { derived_from?: string }).derived_from && (
              <span className="text-fg-muted ml-2">
                · auto-derived from {(opening as { derived_from?: string }).derived_from}
              </span>
            )}
          </div>
        )}
      </section>

      <section className="card p-4 md:p-5 space-y-3">
        <h2 className="font-semibold">Seed sample data</h2>
        <p className="text-sm text-fg-muted">Loads your April 2026 Numbers spreadsheet (Fixed payments + daily ledger). Only works on an empty account.</p>
        <button onClick={seed} disabled={seeding} className="btn-outline">
          {seeding ? 'Seeding…' : 'Import April 2026'}
        </button>
        {seedMsg && <div className="text-sm text-positive bg-positive/10 border border-positive/20 rounded-xl px-3 py-2">{seedMsg}</div>}
        {seedErr && <div className="text-sm text-negative bg-negative/10 border border-negative/20 rounded-xl px-3 py-2">{seedErr}</div>}
      </section>
    </div>
  )
}
