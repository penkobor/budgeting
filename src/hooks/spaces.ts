import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useUi } from '@/store/ui'
import type {
  Space,
  SpaceInsert,
  SpaceMember,
  SpaceCategory,
  SpaceCategoryInsert,
  SpaceInvite,
} from '@/lib/db.types'

/** If the deleted/left space is the current one, snap back to Personal. */
function clearCurrentSpaceIfMatches(id: string) {
  const { currentSpaceId, setCurrentSpaceId } = useUi.getState()
  if (currentSpaceId === id) setCurrentSpaceId(null)
}

// =====================================================================
// Spaces
// =====================================================================

export function useSpaces() {
  return useQuery({
    queryKey: ['spaces'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('spaces')
        .select('*')
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as Space[]
    },
  })
}

export function useSpace(spaceId: string | null | undefined) {
  return useQuery({
    queryKey: ['spaces', spaceId],
    enabled: !!spaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('spaces')
        .select('*')
        .eq('id', spaceId!)
        .single()
      if (error) throw error
      return data as Space
    },
  })
}

export function useCreateSpace() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { name: string; currency?: string }) => {
      // RLS policy on `spaces` INSERT requires `owner_user_id = auth.uid()`.
      // The column has `default auth.uid()`, but we set it explicitly from the
      // client to avoid PostgREST edge cases where the default is not applied
      // before the WITH CHECK evaluation in production.
      const { data: userData, error: userErr } = await supabase.auth.getUser()
      if (userErr) throw userErr
      const uid = userData.user?.id
      if (!uid) throw new Error('not authenticated')
      const payload: SpaceInsert = {
        name: input.name,
        currency: input.currency ?? 'EUR',
        owner_user_id: uid,
      }
      const { data, error } = await supabase
        .from('spaces')
        .insert(payload)
        .select()
        .single()
      if (error) throw error
      return data as Space
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['spaces'] })
      qc.invalidateQueries({ queryKey: ['space_members'] })
    },
  })
}

export function useUpdateSpace() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; name?: string; currency?: string }) => {
      const { id, ...patch } = input
      const { data, error } = await supabase
        .from('spaces')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as Space
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['spaces'] })
      qc.invalidateQueries({ queryKey: ['spaces', vars.id] })
    },
  })
}

export function useDeleteSpace() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('spaces').delete().eq('id', id)
      if (error) throw error
      return id
    },
    onSuccess: (id) => {
      clearCurrentSpaceIfMatches(id)
      // Many things change: shared tx become personal, recurring rules detach, etc.
      qc.invalidateQueries({ queryKey: ['spaces'] })
      qc.invalidateQueries({ queryKey: ['space_members'] })
      qc.invalidateQueries({ queryKey: ['space_categories'] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['recurring_rules'] })
    },
  })
}

// =====================================================================
// Members
// =====================================================================

export function useSpaceMembers(spaceId: string | null | undefined) {
  return useQuery({
    queryKey: ['space_members', spaceId],
    enabled: !!spaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('space_members')
        .select('*')
        .eq('space_id', spaceId!)
        .order('joined_at')
      if (error) throw error
      return data as SpaceMember[]
    },
  })
}

export function useLeaveSpace() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (spaceId: string) => {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId) throw new Error('not authenticated')
      const { error } = await supabase
        .from('space_members')
        .delete()
        .eq('space_id', spaceId)
        .eq('user_id', userId)
      if (error) throw error
      return spaceId
    },
    onSuccess: (spaceId) => {
      clearCurrentSpaceIfMatches(spaceId)
      qc.invalidateQueries({ queryKey: ['spaces'] })
      qc.invalidateQueries({ queryKey: ['space_members'] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['recurring_rules'] })
    },
  })
}

export function useKickMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { spaceId: string; userId: string }) => {
      const { error } = await supabase
        .from('space_members')
        .delete()
        .eq('space_id', input.spaceId)
        .eq('user_id', input.userId)
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['space_members', vars.spaceId] })
    },
  })
}

export interface SpaceMemberProfile {
  user_id: string
  email: string | null
}

/**
 * Returns (user_id, email) for every member of the given space.
 * Backed by `get_space_member_profiles` SECURITY DEFINER RPC, which
 * checks that the caller is a member.
 */
export function useSpaceMemberProfiles(spaceId: string | null | undefined) {
  return useQuery({
    queryKey: ['space_member_profiles', spaceId],
    enabled: !!spaceId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_space_member_profiles', { p_space_id: spaceId! })
      if (error) throw error
      return (data ?? []) as SpaceMemberProfile[]
    },
  })
}

// =====================================================================
// Space categories
// =====================================================================

export function useSpaceCategories(spaceId: string | null | undefined) {
  return useQuery({
    queryKey: ['space_categories', spaceId],
    enabled: !!spaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('space_categories')
        .select('*')
        .eq('space_id', spaceId!)
        .order('sort_order')
        .order('name')
      if (error) throw error
      return data as SpaceCategory[]
    },
  })
}

export function useUpsertSpaceCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (c: SpaceCategoryInsert & { id?: string }) => {
      const { data, error } = await supabase
        .from('space_categories')
        .upsert(c)
        .select()
        .single()
      if (error) throw error
      return data as SpaceCategory
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['space_categories', vars.space_id] })
    },
  })
}

export function useDeleteSpaceCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; spaceId: string }) => {
      const { error } = await supabase
        .from('space_categories')
        .delete()
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['space_categories', vars.spaceId] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['recurring_rules'] })
    },
  })
}

// =====================================================================
// Invites
// =====================================================================

const DEFAULT_INVITE_TTL_DAYS = 7

export function useSpaceInvites(spaceId: string | null | undefined) {
  return useQuery({
    queryKey: ['space_invites', spaceId],
    enabled: !!spaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('space_invites')
        .select('*')
        .eq('space_id', spaceId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as SpaceInvite[]
    },
  })
}

function generateInviteToken(): string {
  // URL-safe ~22-char token (16 random bytes → base64url).
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function useGenerateInvite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { spaceId: string; ttlDays?: number }) => {
      const ttl = input.ttlDays ?? DEFAULT_INVITE_TTL_DAYS
      const expiresAt = new Date(Date.now() + ttl * 24 * 60 * 60 * 1000).toISOString()
      // RLS WITH CHECK on space_invites requires `created_by = auth.uid()`.
      // We set it explicitly (the column default is `auth.uid()`, but mirror
      // the same defensive pattern as `useCreateSpace`).
      const { data: userData, error: userErr } = await supabase.auth.getUser()
      if (userErr) throw userErr
      const uid = userData.user?.id
      if (!uid) throw new Error('not authenticated')
      const { data, error } = await supabase
        .from('space_invites')
        .insert({
          space_id: input.spaceId,
          token: generateInviteToken(),
          expires_at: expiresAt,
          created_by: uid,
        })
        .select()
        .single()
      if (error) throw error
      return data as SpaceInvite
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['space_invites', vars.spaceId] })
    },
  })
}

export function useRevokeInvite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; spaceId: string }) => {
      const { error } = await supabase.from('space_invites').delete().eq('id', input.id)
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['space_invites', vars.spaceId] })
    },
  })
}

export function useConsumeInvite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (token: string) => {
      const { data, error } = await supabase.rpc('consume_space_invite', { p_token: token })
      if (error) throw error
      return data as Space
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['spaces'] })
      qc.invalidateQueries({ queryKey: ['space_members'] })
    },
  })
}

/**
 * Build the absolute invite URL for sharing.
 * Uses HashRouter convention: `https://host/#/invite/<token>`.
 */
export function buildInviteUrl(token: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const base = typeof window !== 'undefined' ? window.location.pathname : '/'
  return `${origin}${base}#/invite/${token}`
}
