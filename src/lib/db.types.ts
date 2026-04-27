export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: { PostgrestVersion: '14.5' }
  public: {
    Tables: {
      categories: {
        Row: {
          color: string
          created_at: string
          icon: string | null
          id: string
          kind: string
          name: string
          sort_order: number
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          icon?: string | null
          id?: string
          kind?: string
          name: string
          sort_order?: number
          user_id?: string
        }
        Update: Partial<Database['public']['Tables']['categories']['Insert']>
        Relationships: []
      }
      monthly_openings: {
        Row: {
          created_at: string
          id: string
          month: string
          opening_balance: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          month: string
          opening_balance: number
          user_id?: string
        }
        Update: Partial<Database['public']['Tables']['monthly_openings']['Insert']>
        Relationships: []
      }
      monthly_goals: {
        Row: {
          amount: number
          created_at: string
          id: string
          updated_at: string
          user_id: string
          year_month: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
          year_month: string
        }
        Update: Partial<Database['public']['Tables']['monthly_goals']['Insert']>
        Relationships: []
      }
      recurring_overrides: {
        Row: {
          amount_override: number | null
          created_at: string
          id: string
          occurrence_date: string
          recurring_rule_id: string
          skipped: boolean
          user_id: string
        }
        Insert: {
          amount_override?: number | null
          created_at?: string
          id?: string
          occurrence_date: string
          recurring_rule_id: string
          skipped?: boolean
          user_id?: string
        }
        Update: Partial<Database['public']['Tables']['recurring_overrides']['Insert']>
        Relationships: []
      }
      recurring_rules: {
        Row: {
          active: boolean
          amount: number
          category_id: string | null
          created_at: string
          day_of_month: number | null
          day_of_week: number | null
          ends_on: string | null
          frequency: string
          id: string
          interval_days: number | null
          kind: string
          month_of_year: number | null
          name: string
          notes: string | null
          starts_on: string
          user_id: string
        }
        Insert: {
          active?: boolean
          amount: number
          category_id?: string | null
          created_at?: string
          day_of_month?: number | null
          day_of_week?: number | null
          ends_on?: string | null
          frequency: string
          id?: string
          interval_days?: number | null
          kind?: string
          month_of_year?: number | null
          name: string
          notes?: string | null
          starts_on: string
          user_id?: string
        }
        Update: Partial<Database['public']['Tables']['recurring_rules']['Insert']>
        Relationships: []
      }
      settings: {
        Row: {
          currency: string
          locale: string
          theme: string
          updated_at: string
          user_id: string
        }
        Insert: {
          currency?: string
          locale?: string
          theme?: string
          updated_at?: string
          user_id?: string
        }
        Update: Partial<Database['public']['Tables']['settings']['Insert']>
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          category_id: string | null
          confirmed_at: string | null
          created_at: string
          description: string | null
          id: string
          occurred_on: string
          planned: boolean
          recurring_rule_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          category_id?: string | null
          confirmed_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          occurred_on: string
          planned?: boolean
          recurring_rule_id?: string | null
          user_id?: string
        }
        Update: Partial<Database['public']['Tables']['transactions']['Insert']>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      apply_rebalance: {
        Args: { tx: Json; overrides: Json; tx_updates?: Json }
        Returns: Database['public']['Tables']['transactions']['Row']
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

export type Category = Database['public']['Tables']['categories']['Row']
export type CategoryInsert = Database['public']['Tables']['categories']['Insert']
export type RecurringRule = Database['public']['Tables']['recurring_rules']['Row']
export type RecurringRuleInsert = Database['public']['Tables']['recurring_rules']['Insert']
export type Transaction = Database['public']['Tables']['transactions']['Row']
export type TransactionInsert = Database['public']['Tables']['transactions']['Insert']
export type MonthlyOpening = Database['public']['Tables']['monthly_openings']['Row']
export type MonthlyGoal = Database['public']['Tables']['monthly_goals']['Row']
export type MonthlyGoalInsert = Database['public']['Tables']['monthly_goals']['Insert']
export type RecurringOverride = Database['public']['Tables']['recurring_overrides']['Row']
export type RecurringOverrideInsert = Database['public']['Tables']['recurring_overrides']['Insert']
export type Settings = Database['public']['Tables']['settings']['Row']
