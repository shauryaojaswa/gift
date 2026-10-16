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
    PostgrestVersion: "14.18"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      gift_catalog: {
        Row: {
          active: boolean
          claim_code_prefix: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          name: string
          updated_at: string
          validity_text: string | null
          voucher_value: number | null
          wheel_label: string
        }
        Insert: {
          active?: boolean
          claim_code_prefix?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          updated_at?: string
          validity_text?: string | null
          voucher_value?: number | null
          wheel_label: string
        }
        Update: {
          active?: boolean
          claim_code_prefix?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          updated_at?: string
          validity_text?: string | null
          voucher_value?: number | null
          wheel_label?: string
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          id: string
          store_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          store_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_audit_logs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_policies: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      public_submission_rate_limits: {
        Row: {
          phone_digest: string
          store_id: string
          submission_count: number
          window_started_at: string
        }
        Insert: {
          phone_digest: string
          store_id: string
          submission_count: number
          window_started_at: string
        }
        Update: {
          phone_digest?: string
          store_id?: string
          submission_count?: number
          window_started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_submission_rate_limits_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      reward_tiers: {
        Row: {
          active: boolean
          created_at: string
          id: string
          max_amount: number | null
          min_amount: number
          reward_id: string | null
          store_id: string
          target_segment: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          max_amount?: number | null
          min_amount: number
          reward_id?: string | null
          store_id: string
          target_segment: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          max_amount?: number | null
          min_amount?: number
          reward_id?: string | null
          store_id?: string
          target_segment?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_tiers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_tiers_store_id_reward_id_fkey"
            columns: ["store_id", "reward_id"]
            isOneToOne: false
            referencedRelation: "rewards"
            referencedColumns: ["store_id", "id"]
          },
        ]
      }
      rewards: {
        Row: {
          active: boolean
          catalog_gift_id: string | null
          claim_code_prefix: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          store_id: string
          updated_at: string
          validity_text: string | null
          voucher_value: number | null
          wheel_label: string
        }
        Insert: {
          active?: boolean
          catalog_gift_id?: string | null
          claim_code_prefix?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          store_id: string
          updated_at?: string
          validity_text?: string | null
          voucher_value?: number | null
          wheel_label: string
        }
        Update: {
          active?: boolean
          catalog_gift_id?: string | null
          claim_code_prefix?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          store_id?: string
          updated_at?: string
          validity_text?: string | null
          voucher_value?: number | null
          wheel_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "rewards_catalog_gift_id_fkey"
            columns: ["catalog_gift_id"]
            isOneToOne: false
            referencedRelation: "gift_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rewards_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_admins: {
        Row: {
          created_at: string
          email: string
          id: string
          role: string
          store_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          role?: string
          store_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          role?: string
          store_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_admins_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_owner_invitations: {
        Row: {
          created_at: string
          email: string
          id: string
          invited_by: string | null
          linked_at: string | null
          status: string
          store_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          invited_by?: string | null
          linked_at?: string | null
          status?: string
          store_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          invited_by?: string | null
          linked_at?: string | null
          status?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_owner_invitations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_subscriptions: {
        Row: {
          billing_interval: string | null
          cancelled_at: string | null
          created_at: string
          id: string
          monthly_price_paise: number | null
          notes: string | null
          payment_status: string
          plan_id: string | null
          plan_name_snapshot: string | null
          renewal_at: string | null
          started_at: string | null
          status: string
          store_id: string
          trial_ends_at: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          billing_interval?: string | null
          cancelled_at?: string | null
          created_at?: string
          id?: string
          monthly_price_paise?: number | null
          notes?: string | null
          payment_status?: string
          plan_id?: string | null
          plan_name_snapshot?: string | null
          renewal_at?: string | null
          started_at?: string | null
          status?: string
          store_id: string
          trial_ends_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          billing_interval?: string | null
          cancelled_at?: string | null
          created_at?: string
          id?: string
          monthly_price_paise?: number | null
          notes?: string | null
          payment_status?: string
          plan_id?: string | null
          plan_name_snapshot?: string | null
          renewal_at?: string | null
          started_at?: string | null
          status?: string
          store_id?: string
          trial_ends_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "store_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_subscriptions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          active: boolean
          campaign_badge: string | null
          created_at: string
          google_review_url: string | null
          id: string
          logo_url: string | null
          min_spin_amount: number
          name: string
          primary_color: string | null
          published_at: string | null
          secondary_color: string | null
          slug: string
          status: string
          subtitle: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          campaign_badge?: string | null
          created_at?: string
          google_review_url?: string | null
          id?: string
          logo_url?: string | null
          min_spin_amount?: number
          name: string
          primary_color?: string | null
          published_at?: string | null
          secondary_color?: string | null
          slug: string
          status?: string
          subtitle?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          campaign_badge?: string | null
          created_at?: string
          google_review_url?: string | null
          id?: string
          logo_url?: string | null
          min_spin_amount?: number
          name?: string
          primary_color?: string | null
          published_at?: string | null
          secondary_color?: string | null
          slug?: string
          status?: string
          subtitle?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      submissions: {
        Row: {
          assigned_tier_id: string | null
          assigned_tier_max_amount: number | null
          assigned_tier_min_amount: number | null
          collected_at: string | null
          collected_by: string | null
          collection_status: string
          coupon_code: string | null
          created_at: string
          customer_name: string
          customer_phone: string
          id: string
          purchase_amount: number
          request_id: string | null
          review_cta_clicked: boolean
          review_cta_shown: boolean
          reward_claim_code_prefix: string | null
          reward_description: string | null
          reward_id: string
          reward_label: string
          reward_validity_text: string | null
          reward_voucher_value: number | null
          reward_wheel_label: string | null
          store_id: string
          target_segment: number | null
        }
        Insert: {
          assigned_tier_id?: string | null
          assigned_tier_max_amount?: number | null
          assigned_tier_min_amount?: number | null
          collected_at?: string | null
          collected_by?: string | null
          collection_status?: string
          coupon_code?: string | null
          created_at?: string
          customer_name: string
          customer_phone: string
          id?: string
          purchase_amount: number
          request_id?: string | null
          review_cta_clicked?: boolean
          review_cta_shown?: boolean
          reward_claim_code_prefix?: string | null
          reward_description?: string | null
          reward_id: string
          reward_label: string
          reward_validity_text?: string | null
          reward_voucher_value?: number | null
          reward_wheel_label?: string | null
          store_id: string
          target_segment?: number | null
        }
        Update: {
          assigned_tier_id?: string | null
          assigned_tier_max_amount?: number | null
          assigned_tier_min_amount?: number | null
          collected_at?: string | null
          collected_by?: string | null
          collection_status?: string
          coupon_code?: string | null
          created_at?: string
          customer_name?: string
          customer_phone?: string
          id?: string
          purchase_amount?: number
          request_id?: string | null
          review_cta_clicked?: boolean
          review_cta_shown?: boolean
          reward_claim_code_prefix?: string | null
          reward_description?: string | null
          reward_id?: string
          reward_label?: string
          reward_validity_text?: string | null
          reward_voucher_value?: number | null
          reward_wheel_label?: string | null
          store_id?: string
          target_segment?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "submissions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_store_id_reward_id_fkey"
            columns: ["store_id", "reward_id"]
            isOneToOne: false
            referencedRelation: "rewards"
            referencedColumns: ["store_id", "id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          active: boolean
          billing_interval: string
          created_at: string
          id: string
          limits: Json
          name: string
          price_paise: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          billing_interval: string
          created_at?: string
          id?: string
          limits?: Json
          name: string
          price_paise: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          billing_interval?: string
          created_at?: string
          id?: string
          limits?: Json
          name?: string
          price_paise?: number
          updated_at?: string
        }
        Relationships: []
      }
      tier_gift_options: {
        Row: {
          active: boolean
          created_at: string
          id: string
          reward_id: string
          store_id: string
          tier_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          reward_id: string
          store_id: string
          tier_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          reward_id?: string
          store_id?: string
          tier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tier_gift_options_store_id_reward_id_fkey"
            columns: ["store_id", "reward_id"]
            isOneToOne: false
            referencedRelation: "rewards"
            referencedColumns: ["store_id", "id"]
          },
          {
            foreignKeyName: "tier_gift_options_store_id_tier_id_fkey"
            columns: ["store_id", "tier_id"]
            isOneToOne: false
            referencedRelation: "reward_tiers"
            referencedColumns: ["store_id", "id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_save_store_tiers: {
        Args: { p_store_id: string; p_tiers: Json }
        Returns: undefined
      }
      create_shop: {
        Args: {
          p_logo_url?: string
          p_name: string
          p_owner_email: string
          p_slug: string
          p_tiers?: Json
        }
        Returns: {
          customer_path: string
          owner_link_status: string
          shop_id: string
          shop_name: string
          shop_slug: string
        }[]
      }
      get_store_gift_pool: {
        Args: { p_store_slug: string }
        Returns: {
          gift_description: string
          gift_name: string
          reward_id: string
          tier_id: string
          voucher_value: number
          wheel_label: string
        }[]
      }
      is_platform_admin: { Args: never; Returns: boolean }
      is_store_admin: { Args: { p_store_id: string }; Returns: boolean }
      is_store_campaign_active: {
        Args: { p_store_id: string }
        Returns: boolean
      }
      link_store_owner: {
        Args: { p_email: string; p_store_id: string }
        Returns: string
      }
      mark_submission_collected: {
        Args: { p_submission_id: string }
        Returns: undefined
      }
      save_store_gift_options: {
        Args: { p_catalog_gift_ids: string[]; p_tier_id: string }
        Returns: undefined
      }
      save_store_tiers: { Args: { p_tiers: Json }; Returns: undefined }
      set_store_status: {
        Args: { p_status: string; p_store_id: string }
        Returns: undefined
      }
      submit_customer_entry: {
        Args: {
          p_customer_name: string
          p_customer_phone: string
          p_purchase_amount: number
          p_request_id: string
          p_review_cta_clicked?: boolean
          p_review_cta_shown?: boolean
          p_store_slug: string
        }
        Returns: {
          claim_code: string
          reward: Json
          submission_id: string
          tier: Json
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
