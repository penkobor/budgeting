import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { expandRuleInRange } from '@/lib/recurring'
import type {
  Category,
  CategoryInsert,
  RecurringRule,
  RecurringRuleInsert,
  SpaceCategory,
  Transaction,
  TransactionInsert,
  MonthlyOpening,
  MonthlyGoal,
  MonthlyGoalInsert,
  RecurringOverride,
  RecurringOverrideInsert,
  Settings,
  Asset,
  AssetInsert,
} from '@/lib/db.types'

// ---------- Categories ----------
export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('sort_order')
        .order('name')
      if (error) throw error
      return data as Category[]
    },
  })
}

export function useUpsertCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (c: CategoryInsert & { id?: string }) => {
      const { data, error } = await supabase.from('categories').upsert(c).select().single()
      if (error) throw error
      return data as Category
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  })
}

export function useDeleteCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('categories').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  })
}

// ---------- Recurring rules ----------
/**
 * Recurring rules query.
 * - No opts (legacy): personal-only (`space_id IS NULL`).
 * - `{ spaceId: '<uuid>' }`: rules of that space (RLS scoped to members).
 * - `{ spaceId: null }`: explicit personal-only.
 */
export function useRecurringRules(opts?: { spaceId?: string | null }) {
  const spaceId = opts?.spaceId ?? null
  const scope = opts === undefined || spaceId === null ? 'personal' : spaceId
  return useQuery({
    queryKey: ['recurring_rules', { spaceId: scope }],
    queryFn: async () => {
      let q = supabase.from('recurring_rules').select('*').order('name')
      if (spaceId) q = q.eq('space_id', spaceId)
      else q = q.is('space_id', null)
      const { data, error } = await q
      if (error) throw error
      return data as RecurringRule[]
    },
  })
}

export function useUpsertRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (r: RecurringRuleInsert & { id?: string }) => {
      const { data, error } = await supabase.from('recurring_rules').upsert(r).select().single()
      if (error) throw error
      return data as RecurringRule
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recurring_rules'] }),
  })
}

export function useDeleteRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('recurring_rules').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recurring_rules'] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}

// ---------- Transactions ----------
/**
 * Transactions query.
 * - No opts (legacy): own personal tx only (`space_id IS NULL`, RLS already
 *   restricts to current user).
 * - `{ spaceId: '<uuid>' }`: shared tx of that space (any member, via RLS).
 * - `{ spaceId: null }`: explicit personal-only.
 * - `{ includeOwnShared: true }`: own personal + own shared. Used by the
 *   personal Ledger which renders shared rows inline with a Space badge.
 */
export function useTransactionsInRange(
  fromIso: string,
  toIso: string,
  opts?: { spaceId?: string | null; includeOwnShared?: boolean },
) {
  const spaceId = opts?.spaceId ?? null
  const includeOwnShared = opts?.includeOwnShared ?? false
  const scope =
    opts === undefined
      ? 'personal'
      : spaceId
        ? `space:${spaceId}`
        : includeOwnShared
          ? 'own-all'
          : 'personal'
  return useQuery({
    queryKey: ['transactions', fromIso, toIso, { scope }],
    queryFn: async () => {
      let q = supabase
        .from('transactions')
        .select('*')
        .gte('occurred_on', fromIso)
        .lte('occurred_on', toIso)
        .order('occurred_on')
        .order('created_at')
      if (spaceId) {
        q = q.eq('space_id', spaceId)
      } else if (includeOwnShared) {
        const { data: u } = await supabase.auth.getUser()
        if (u.user) q = q.eq('user_id', u.user.id)
      } else {
        q = q.is('space_id', null)
      }
      const { data, error } = await q
      if (error) throw error
      return data as Transaction[]
    },
  })
}

export function useUpsertTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (t: TransactionInsert & { id?: string }) => {
      const { data, error } = await supabase.from('transactions').upsert(t).select().single()
      if (error) throw error
      return data as Transaction
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  })
}

export function useInsertTransactions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (rows: TransactionInsert[]) => {
      if (rows.length === 0) return [] as Transaction[]
      const { data, error } = await supabase.from('transactions').insert(rows).select()
      if (error) throw error
      return data as Transaction[]
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  })
}

export function useDeleteTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('transactions').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  })
}

// ---------- Monthly openings ----------
export function useMonthlyOpening(monthIso: string) {
  return useQuery({
    queryKey: ['monthly_opening', monthIso],
    queryFn: async () => {
      // 1. Walk all anchors (explicit openings) once and pick the latest one
      //    whose month is <= monthIso. That row is the truth.
      const { data: openings, error: oErr } = await supabase
        .from('monthly_openings')
        .select('*')
        .lte('month', monthIso)
        .order('month', { ascending: true })
      if (oErr) throw oErr
      const anchor = (openings ?? [])[(openings ?? []).length - 1] as MonthlyOpening | undefined
      if (!anchor) return null
      // If the anchor IS the requested month, we're done.
      if (anchor.month === monthIso) return anchor
      // 2. Otherwise the effective opening for monthIso = the *projected* (planned)
      //    running balance at the end of the previous month. That means:
      //      anchor.opening_balance
      //      + Σ all transactions (planned + actual) between anchor.month and monthIso (exclusive)
      //      + Σ recurring-rule instances over the same range that are NOT already
      //        materialised as a transaction (avoiding double-count).
      const [txsRes, rulesRes] = await Promise.all([
        supabase
          .from('transactions')
          .select('amount,occurred_on,recurring_rule_id')
          .is('space_id', null)
          .gte('occurred_on', anchor.month)
          .lt('occurred_on', monthIso),
        supabase
          .from('recurring_rules')
          .select('*')
          .is('space_id', null),
      ])
      if (txsRes.error) throw txsRes.error
      if (rulesRes.error) throw rulesRes.error
      const txs = txsRes.data ?? []
      const rules = (rulesRes.data ?? []) as RecurringRule[]
      const txSum = txs.reduce((s, t) => s + Number(t.amount), 0)
      const realised = new Set(
        txs.filter((t) => t.recurring_rule_id).map((t) => `${t.recurring_rule_id}|${t.occurred_on}`),
      )
      const rangeFrom = new Date(anchor.month + 'T00:00:00')
      const rangeTo = new Date(monthIso + 'T00:00:00')
      rangeTo.setDate(rangeTo.getDate() - 1) // inclusive end-of-prev-month
      let pendingSum = 0
      for (const r of rules) {
        for (const d of expandRuleInRange(r, rangeFrom, rangeTo)) {
          if (realised.has(`${r.id}|${d}`)) continue
          pendingSum += r.kind === 'income' ? r.amount : -r.amount
        }
      }
      return {
        ...anchor,
        month: monthIso,
        opening_balance: anchor.opening_balance + txSum + pendingSum,
        derived_from: anchor.month,
      } as MonthlyOpening & { derived_from?: string }
    },
  })
}

export function useSetMonthlyOpening() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ month, opening_balance }: { month: string; opening_balance: number }) => {
      const { data, error } = await supabase
        .from('monthly_openings')
        .upsert({ month, opening_balance }, { onConflict: 'user_id,month' })
        .select()
        .single()
      if (error) throw error
      return data as MonthlyOpening
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['monthly_opening'] }),
  })
}

// ---------- Monthly goals (BUDG-012) ----------
export function useMonthlyGoal(yearMonth: string) {
  return useQuery({
    queryKey: ['monthly_goal', yearMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('monthly_goals')
        .select('*')
        .eq('year_month', yearMonth)
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as MonthlyGoal | null
    },
  })
}

export function useUpsertMonthlyGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (g: MonthlyGoalInsert) => {
      const { data, error } = await supabase
        .from('monthly_goals')
        .upsert(g, { onConflict: 'user_id,year_month' })
        .select()
        .single()
      if (error) throw error
      return data as MonthlyGoal
    },
    onSuccess: (g) => qc.invalidateQueries({ queryKey: ['monthly_goal', g.year_month] }),
  })
}

export function useDeleteMonthlyGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (yearMonth: string) => {
      const { error } = await supabase.from('monthly_goals').delete().eq('year_month', yearMonth)
      if (error) throw error
    },
    onSuccess: (_, yearMonth) => qc.invalidateQueries({ queryKey: ['monthly_goal', yearMonth] }),
  })
}

// ---------- Recurring overrides (BUDG-012) ----------
export function useRecurringOverridesInRange(fromIso: string, toIso: string) {
  return useQuery({
    queryKey: ['recurring_overrides', fromIso, toIso],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recurring_overrides')
        .select('*')
        .gte('occurrence_date', fromIso)
        .lte('occurrence_date', toIso)
      if (error) throw error
      return (data ?? []) as RecurringOverride[]
    },
  })
}

/**
 * All recurring overrides for upcoming occurrences (>= today).
 * Used on Recurring page to show "trimmed" badges per rule.
 */
export function useUpcomingRecurringOverrides() {
  const todayIso = new Date().toISOString().slice(0, 10)
  return useQuery({
    queryKey: ['recurring_overrides', 'upcoming', todayIso],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recurring_overrides')
        .select('*')
        .gte('occurrence_date', todayIso)
      if (error) throw error
      return (data ?? []) as RecurringOverride[]
    },
  })
}

export function useUpsertRecurringOverrides() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (rows: RecurringOverrideInsert[]) => {
      if (rows.length === 0) return [] as RecurringOverride[]
      const { data, error } = await supabase
        .from('recurring_overrides')
        .upsert(rows, { onConflict: 'recurring_rule_id,occurrence_date' })
        .select()
      if (error) throw error
      return data as RecurringOverride[]
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recurring_overrides'] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}

export function useDeleteRecurringOverride() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('recurring_overrides').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recurring_overrides'] }),
  })
}

// ---------- Atomic apply_rebalance RPC (BUDG-012 Phase 4) ----------
export interface TxUpdate {
  id: string
  new_amount: number // 0 = delete the planned tx; >0 = set tx.amount = -new_amount
}

export interface ApplyRebalancePayload {
  tx: TransactionInsert
  overrides: RecurringOverrideInsert[]
  tx_updates?: TxUpdate[]
}

export function useApplyRebalance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ tx, overrides, tx_updates = [] }: ApplyRebalancePayload) => {
      const { data, error } = await supabase.rpc('apply_rebalance', {
        tx: tx as unknown as never,
        overrides: overrides as unknown as never,
        tx_updates: tx_updates as unknown as never,
      })
      if (error) throw error
      return data as Transaction
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['recurring_overrides'] })
    },
  })
}

// ---------- Settings ----------
/**
 * All `space_categories` rows visible to the current user via RLS
 * (i.e. categories of every space the user is a member of). Used by the
 * personal Ledger to colour the Space badge on own-shared rows.
 */
export function useAllSpaceCategoriesForMe() {
  return useQuery({
    queryKey: ['space_categories', 'all-mine'],
    queryFn: async () => {
      const { data, error } = await supabase.from('space_categories').select('*')
      if (error) throw error
      return data as SpaceCategory[]
    },
  })
}

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('settings').select('*').maybeSingle()
      if (error) throw error
      return (data ?? { currency: 'CZK', locale: 'en', theme: 'dark' }) as Settings
    },
  })
}

export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (patch: Partial<Settings>) => {
      const { data: u } = await supabase.auth.getUser()
      if (!u.user) throw new Error('not signed in')
      const { data, error } = await supabase
        .from('settings')
        .upsert({ user_id: u.user.id, ...patch })
        .select()
        .single()
      if (error) throw error
      return data as Settings
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  })
}

// ---------- Assets (BUDG-013) ----------
export function useAssets() {
  return useQuery({
    queryKey: ['assets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('assets')
        .select('*')
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as Asset[]
    },
  })
}

export function useUpsertAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (asset: AssetInsert) => {
      const { data, error } = await supabase
        .from('assets')
        .upsert(asset)
        .select()
        .single()
      if (error) throw error
      return data as Asset
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assets'] }),
  })
}

export function useDeleteAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('assets').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assets'] }),
  })
}
