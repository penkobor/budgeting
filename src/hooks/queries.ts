import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type {
  Category,
  CategoryInsert,
  RecurringRule,
  RecurringRuleInsert,
  Transaction,
  TransactionInsert,
  MonthlyOpening,
  Settings,
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
export function useRecurringRules() {
  return useQuery({
    queryKey: ['recurring_rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recurring_rules')
        .select('*')
        .order('name')
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
export function useTransactionsInRange(fromIso: string, toIso: string) {
  return useQuery({
    queryKey: ['transactions', fromIso, toIso],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .gte('occurred_on', fromIso)
        .lte('occurred_on', toIso)
        .order('occurred_on')
        .order('created_at')
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
      const { data, error } = await supabase
        .from('monthly_openings')
        .select('*')
        .eq('month', monthIso)
        .maybeSingle()
      if (error) throw error
      return data as MonthlyOpening | null
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

// ---------- Settings ----------
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
