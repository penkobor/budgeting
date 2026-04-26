import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.auth.getSession()
      if (cancelled) return
      if (data.session) {
        setSession(data.session)
        setLoading(false)
        return
      }
      // No session → auto sign-in anonymously (single-user PWA, no email/password friction).
      const { data: anon, error } = await supabase.auth.signInAnonymously()
      if (cancelled) return
      if (error) {
        console.error('Anonymous sign-in failed:', error.message)
        setLoading(false)
        return
      }
      setSession(anon.session)
      setLoading(false)
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  return { session, user: session?.user ?? null, loading }
}
