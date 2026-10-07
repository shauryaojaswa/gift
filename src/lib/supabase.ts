import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

export function createSupabaseClient(
  supabaseUrl: string,
  supabaseKey: string,
) {
  return createClient<Database>(supabaseUrl, supabaseKey, {
    auth: {
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      autoRefreshToken: true,
      persistSession: true,
    },
    global: {
      headers: { 'x-client-info': 'gift-customer-flow' },
    },
  })
}

export type { Database }
