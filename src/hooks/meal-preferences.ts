import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { MealPreferences, MealPreferencesInsert } from '@/lib/db.types'

export function useMealPreferences() {
  return useQuery({
    queryKey: ['meal_preferences'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meal_preferences')
        .select('*')
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as MealPreferences | null
    },
  })
}

export function useUpsertMealPreferences() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (prefs: MealPreferencesInsert) => {
      const { data, error } = await supabase
        .from('meal_preferences')
        .upsert(prefs, { onConflict: 'user_id' })
        .select()
        .single()
      if (error) throw error
      return data as MealPreferences
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meal_preferences'] }),
  })
}
