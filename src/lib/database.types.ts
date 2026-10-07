export type Database = {
  public: {
    Tables: {
      stores: {
        Row: {
          id: string
          slug: string
          name: string
          subtitle: string | null
          logo_url: string | null
          primary_color: string | null
          secondary_color: string | null
          google_review_url: string | null
          campaign_badge: string | null
          min_spin_amount: number
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          slug: string
          name: string
          subtitle?: string | null
          logo_url?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          google_review_url?: string | null
          campaign_badge?: string | null
          min_spin_amount?: number
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          slug?: string
          name?: string
          subtitle?: string | null
          logo_url?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          google_review_url?: string | null
          campaign_badge?: string | null
          min_spin_amount?: number
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      rewards: {
        Row: {
          id: string
          store_id: string
          name: string
          description: string | null
          claim_code_prefix: string | null
          validity_text: string | null
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          store_id: string
          name: string
          description?: string | null
          claim_code_prefix?: string | null
          validity_text?: string | null
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          store_id?: string
          name?: string
          description?: string | null
          claim_code_prefix?: string | null
          validity_text?: string | null
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      reward_tiers: {
        Row: {
          id: string
          store_id: string
          min_amount: number
          max_amount: number | null
          reward_id: string
          target_segment: number
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          store_id: string
          min_amount: number
          max_amount?: number | null
          reward_id: string
          target_segment: number
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          store_id?: string
          min_amount?: number
          max_amount?: number | null
          reward_id?: string
          target_segment?: number
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      submissions: {
        Row: {
          id: string
          store_id: string
          customer_name: string
          customer_phone: string
          purchase_amount: number
          reward_id: string
          reward_label: string
          reward_description: string | null
          coupon_code: string | null
          review_cta_shown: boolean
          review_cta_clicked: boolean
          created_at: string
        }
        Insert: {
          id?: string
          store_id: string
          customer_name: string
          customer_phone: string
          purchase_amount: number
          reward_id: string
          reward_label: string
          reward_description?: string | null
          coupon_code?: string | null
          review_cta_shown?: boolean
          review_cta_clicked?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          store_id?: string
          customer_name?: string
          customer_phone?: string
          purchase_amount?: number
          reward_id?: string
          reward_label?: string
          reward_description?: string | null
          coupon_code?: string | null
          review_cta_shown?: boolean
          review_cta_clicked?: boolean
          created_at?: string
        }
        Relationships: []
      }
      store_admins: {
        Row: {
          id: string
          store_id: string
          user_id: string
          email: string
          role: string
          created_at: string
        }
        Insert: {
          id?: string
          store_id: string
          user_id: string
          email: string
          role?: string
          created_at?: string
        }
        Update: {
          id?: string
          store_id?: string
          user_id?: string
          email?: string
          role?: string
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
  }
}
