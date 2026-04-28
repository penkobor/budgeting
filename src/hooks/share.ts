import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ShareLink } from '@/lib/db.types'

/**
 * BUDG-021 — Public share page hooks.
 *
 * One share-link per user (PK = user_id). The slug is the unguessable URL key
 * for `/share/:slug`. The `display_name` is shown to viewers ("Boris plans:").
 */

// 16-char base32-ish slug (a–z + 2–9, ambiguous chars dropped). ~80 bits of
// entropy — fine for an opt-in publish surface.
const SLUG_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789' // no i, l, o, 0, 1
function generateSlug(): string {
  const out: string[] = []
  const buf = new Uint8Array(16)
  crypto.getRandomValues(buf)
  for (let i = 0; i < buf.length; i++) {
    out.push(SLUG_ALPHABET[buf[i] % SLUG_ALPHABET.length])
  }
  return out.join('')
}

export function useShareLink() {
  return useQuery({
    queryKey: ['share_link'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('share_links')
        .select('*')
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as ShareLink | null
    },
  })
}

export function useUpsertShareLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { display_name: string; slug?: string }) => {
      const { data: u } = await supabase.auth.getUser()
      if (!u.user) throw new Error('Not authenticated')
      const { data: existing } = await supabase
        .from('share_links')
        .select('*')
        .maybeSingle()
      const slug = existing?.slug ?? input.slug ?? generateSlug()
      const { data, error } = await supabase
        .from('share_links')
        .upsert(
          { user_id: u.user.id, slug, display_name: input.display_name },
          { onConflict: 'user_id' },
        )
        .select()
        .single()
      if (error) throw error
      return data as ShareLink
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['share_link'] }),
  })
}

export function useDisableShareLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser()
      if (!u.user) throw new Error('Not authenticated')
      const { error } = await supabase.from('share_links').delete().eq('user_id', u.user.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['share_link'] }),
  })
}

export interface PublicSharePayload {
  display_name: string
  currency: string
  transactions: {
    id: string
    amount: number
    occurred_on: string
    description: string | null
    planned: boolean
    confirmed_at: string | null
    category_id: string | null
  }[]
  recurring_rules: {
    id: string
    name: string
    amount: number
    kind: string
    frequency: string
    interval_days: number | null
    day_of_month: number | null
    day_of_week: number | null
    month_of_year: number | null
    starts_on: string
    ends_on: string | null
    active: boolean
    notes: string | null
    category_id: string | null
  }[]
}

export function usePublicShare(slug: string | undefined) {
  return useQuery({
    queryKey: ['public_share', slug],
    enabled: !!slug,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_public_share', { p_slug: slug! })
      if (error) throw error
      return (data ?? null) as PublicSharePayload | null
    },
  })
}

export function buildShareUrl(slug: string): string {
  if (typeof window === 'undefined') return `#/share/${slug}`
  const { origin, pathname } = window.location
  return `${origin}${pathname}#/share/${slug}`
}

// BUDG-022 — atomic redistribution. See ADR-004 for the contract.
export interface RedistributePayload {
  tx_updates?: { id: string; amount: number }[]
  tx_inserts?: {
    occurred_on: string
    amount: number
    description?: string | null
    category_id?: string | null
    recurring_rule_id?: string | null
    planned?: boolean
  }[]
  override_upserts?: {
    recurring_rule_id: string
    occurrence_date: string
    amount_override: number | null
    skipped?: boolean
  }[]
}

export function useRedistributeShared() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: RedistributePayload) => {
      const { error } = await supabase.rpc('redistribute_shared', {
        payload: payload as unknown as never,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['recurring_overrides'] })
      qc.invalidateQueries({ queryKey: ['public_share'] })
    },
  })
}
