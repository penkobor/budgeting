export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      assets: {
        Row: {
          created_at: string
          id: string
          include_in_balance: boolean
          name: string
          notes: string | null
          type: Database["public"]["Enums"]["asset_type"]
          updated_at: string
          user_id: string
          value: number
        }
        Insert: {
          created_at?: string
          id?: string
          include_in_balance?: boolean
          name: string
          notes?: string | null
          type?: Database["public"]["Enums"]["asset_type"]
          updated_at?: string
          user_id?: string
          value?: number
        }
        Update: {
          created_at?: string
          id?: string
          include_in_balance?: boolean
          name?: string
          notes?: string | null
          type?: Database["public"]["Enums"]["asset_type"]
          updated_at?: string
          user_id?: string
          value?: number
        }
        Relationships: []
      }
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
        Update: {
          color?: string
          created_at?: string
          icon?: string | null
          id?: string
          kind?: string
          name?: string
          sort_order?: number
          user_id?: string
        }
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
        Update: {
          amount?: number
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
          year_month?: string
        }
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
        Update: {
          created_at?: string
          id?: string
          month?: string
          opening_balance?: number
          user_id?: string
        }
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
        Update: {
          amount_override?: number | null
          created_at?: string
          id?: string
          occurrence_date?: string
          recurring_rule_id?: string
          skipped?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_overrides_recurring_rule_id_fkey"
            columns: ["recurring_rule_id"]
            isOneToOne: false
            referencedRelation: "recurring_rules"
            referencedColumns: ["id"]
          },
        ]
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
          space_category_id: string | null
          space_id: string | null
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
          space_category_id?: string | null
          space_id?: string | null
          starts_on: string
          user_id?: string
        }
        Update: {
          active?: boolean
          amount?: number
          category_id?: string | null
          created_at?: string
          day_of_month?: number | null
          day_of_week?: number | null
          ends_on?: string | null
          frequency?: string
          id?: string
          interval_days?: number | null
          kind?: string
          month_of_year?: number | null
          name?: string
          notes?: string | null
          space_category_id?: string | null
          space_id?: string | null
          starts_on?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_rules_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_rules_space_category_id_fkey"
            columns: ["space_category_id"]
            isOneToOne: false
            referencedRelation: "space_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_rules_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
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
        Update: {
          currency?: string
          locale?: string
          theme?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      space_categories: {
        Row: {
          color: string
          created_at: string
          icon: string | null
          id: string
          name: string
          sort_order: number
          space_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          sort_order?: number
          space_id: string
        }
        Update: {
          color?: string
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          sort_order?: number
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_categories_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      space_invites: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string
          id: string
          space_id: string
          token: string
          used_at: string | null
          used_by_user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string
          expires_at: string
          id?: string
          space_id: string
          token: string
          used_at?: string | null
          used_by_user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          space_id?: string
          token?: string
          used_at?: string | null
          used_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "space_invites_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      space_members: {
        Row: {
          joined_at: string
          role: string
          space_id: string
          user_id: string
        }
        Insert: {
          joined_at?: string
          role?: string
          space_id: string
          user_id: string
        }
        Update: {
          joined_at?: string
          role?: string
          space_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_members_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      spaces: {
        Row: {
          created_at: string
          currency: string
          id: string
          name: string
          owner_user_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          name: string
          owner_user_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          name?: string
          owner_user_id?: string
          updated_at?: string
        }
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
          space_category_id: string | null
          space_id: string | null
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
          space_category_id?: string | null
          space_id?: string | null
          user_id?: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          confirmed_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          occurred_on?: string
          planned?: boolean
          recurring_rule_id?: string | null
          space_category_id?: string | null
          space_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_recurring_rule_id_fkey"
            columns: ["recurring_rule_id"]
            isOneToOne: false
            referencedRelation: "recurring_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_space_category_id_fkey"
            columns: ["space_category_id"]
            isOneToOne: false
            referencedRelation: "space_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_rebalance: {
        Args: { overrides: Json; tx: Json; tx_updates?: Json }
        Returns: {
          amount: number
          category_id: string | null
          confirmed_at: string | null
          created_at: string
          description: string | null
          id: string
          occurred_on: string
          planned: boolean
          recurring_rule_id: string | null
          space_category_id: string | null
          space_id: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      consume_space_invite: {
        Args: { p_token: string }
        Returns: {
          created_at: string
          currency: string
          id: string
          name: string
          owner_user_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "spaces"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_space_member_profiles: {
        Args: { p_space_id: string }
        Returns: {
          email: string
          user_id: string
        }[]
      }
      my_space_ids: { Args: never; Returns: string[] }
    }
    Enums: {
      asset_type: "gold" | "stocks" | "crypto" | "cash" | "other"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      asset_type: ["gold", "stocks", "crypto", "cash", "other"],
    },
  },
} as const


// Convenience aliases (manually maintained alongside generated Database type)
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
export type Asset = Database['public']['Tables']['assets']['Row']
export type AssetInsert = Database['public']['Tables']['assets']['Insert']
export type AssetType = Database['public']['Enums']['asset_type']

// BUDG-020 — Spaces
export type Space = Database['public']['Tables']['spaces']['Row']
export type SpaceInsert = Database['public']['Tables']['spaces']['Insert']
export type SpaceMember = Database['public']['Tables']['space_members']['Row']
export type SpaceMemberInsert = Database['public']['Tables']['space_members']['Insert']
export type SpaceCategory = Database['public']['Tables']['space_categories']['Row']
export type SpaceCategoryInsert = Database['public']['Tables']['space_categories']['Insert']
export type SpaceInvite = Database['public']['Tables']['space_invites']['Row']
export type SpaceInviteInsert = Database['public']['Tables']['space_invites']['Insert']
