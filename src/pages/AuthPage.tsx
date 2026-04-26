import { useState } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { Loader2, Mail } from 'lucide-react'

export function AuthPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'magic' | 'password'>('magic')
  const [signup, setSignup] = useState(false)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null); setMsg(null); setLoading(true)
    try {
      if (mode === 'magic') {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: window.location.origin + window.location.pathname },
        })
        if (error) throw error
        setMsg('Check your inbox for the magic link ✨')
      } else if (signup) {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setMsg('Account created. Check your email to confirm, or sign in.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen grid place-items-center p-6 bg-gradient-to-br from-bg via-bg to-accent/5">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm card p-8"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-accent to-positive grid place-items-center text-accent-fg font-bold text-lg">₿</div>
          <div>
            <div className="font-semibold text-lg leading-tight">Budget</div>
            <div className="text-xs text-fg-subtle">plan · track · profit</div>
          </div>
        </div>

        <h1 className="text-xl font-semibold mb-1">Welcome back</h1>
        <p className="text-sm text-fg-muted mb-6">
          {mode === 'magic' ? 'Sign in with a magic link.' : signup ? 'Create your account.' : 'Sign in with password.'}
        </p>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <div className="label mb-1.5">Email</div>
            <input
              className="input"
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          {mode === 'password' && (
            <div>
              <div className="label mb-1.5">Password</div>
              <input
                className="input"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={signup ? 'new-password' : 'current-password'}
              />
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
            {mode === 'magic' ? 'Send magic link' : signup ? 'Create account' : 'Sign in'}
          </button>
        </form>

        {msg && <div className="mt-4 text-sm text-positive bg-positive/10 border border-positive/20 rounded-xl px-3 py-2">{msg}</div>}
        {err && <div className="mt-4 text-sm text-negative bg-negative/10 border border-negative/20 rounded-xl px-3 py-2">{err}</div>}

        <div className="mt-6 pt-4 border-t border-border text-xs text-fg-muted flex items-center justify-between">
          <button onClick={() => setMode(mode === 'magic' ? 'password' : 'magic')} className="hover:text-fg">
            {mode === 'magic' ? 'Use password instead' : 'Use magic link instead'}
          </button>
          {mode === 'password' && (
            <button onClick={() => setSignup(!signup)} className="hover:text-fg">
              {signup ? 'Have an account? Sign in' : 'Create account'}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  )
}
