export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

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
          wheel_label: string | null
          description: string | null
          voucher_value: number | null
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
          wheel_label?: string | null
          description?: string | null
          voucher_value?: number | null
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
          wheel_label?: string | null
          description?: string | null
          voucher_value?: number | null
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
          reward_claim_code_prefix: string | null
          reward_validity_text: string | null
          reward_wheel_label: string | null
          reward_voucher_value: number | null
          assigned_tier_id: string | null
          assigned_tier_min_amount: number | null
          assigned_tier_max_amount: number | null
          target_segment: number | null
          request_id: string | null
          coupon_code: string | null
          collection_status: 'awaiting' | 'collected'
          collected_at: string | null
          collected_by: string | null
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
          reward_claim_code_prefix?: string | null
          reward_validity_text?: string | null
          reward_wheel_label?: string | null
          reward_voucher_value?: number | null
          assigned_tier_id?: string | null
          assigned_tier_min_amount?: number | null
          assigned_tier_max_amount?: number | null
          target_segment?: number | null
          request_id?: string | null
          coupon_code?: string | null
          collection_status?: 'awaiting' | 'collected'
          collected_at?: string | null
          collected_by?: string | null
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
          reward_claim_code_prefix?: string | null
          reward_validity_text?: string | null
          reward_wheel_label?: string | null
          reward_voucher_value?: number | null
          assigned_tier_id?: string | null
          assigned_tier_min_amount?: number | null
          assigned_tier_max_amount?: number | null
          target_segment?: number | null
          request_id?: string | null
          coupon_code?: string | null
          collection_status?: 'awaiting' | 'collected'
          collected_at?: string | null
          collected_by?: string | null
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
    Functions: {
      submit_customer_entry: {
        Args: {
          p_store_slug: string
          p_request_id: string
          p_customer_name: string
          p_customer_phone: string
          p_purchase_amount: number
          p_review_cta_shown: boolean
          p_review_cta_clicked: boolean
        }
        Returns: {
          submission_id: string
          claim_code: string
          reward: {
            id: string
            name: string
            wheel_label: string | null
            description: string
            voucher_value: number | null
            claim_code_prefix: string | null
            validity_text: string | null
            active: boolean
          }
          tier: {
            id: string
            min_amount: number
            max_amount: number | null
            reward_id: string
            target_segment: number
            active: boolean
          }
        }[]
      }
      mark_submission_collected: {
        Args: { p_submission_id: string }
        Returns: undefined
      }
      save_store_tiers: {
        Args: { p_tiers: Json }
        Returns: undefined
      }
    }
    Enums: { [_ in never]: never }
  }
}
