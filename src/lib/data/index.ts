import { LocalDataProvider } from './local'
import { SupabaseDataProvider } from './supabase'
import { createSupabaseClient } from '../supabase'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../database.types'
import type { DataProvider } from './types'
import type { StoreConfig } from '../../types'
import { ALL_STORES, JOLLY_ENTERPRISES } from '../stores'

export type {
  AdminSession,
  AdminStats,
  CreateSubmissionInput,
  DataProvider,
  ListOptions,
  ListResult,
  StorePatch,
  SubmissionRecord,
} from './types'

export { LocalDataProvider } from './local'
export { SupabaseDataProvider } from './supabase'

let provider: DataProvider | null = null
let client: SupabaseClient<Database> | null = null

/**
 * The shared Supabase client (same auth session as the data provider).
 * Returns null in demo mode — Supabase-backed features (platform admin,
 * gift selection) are unavailable without a configured project.
 */
export function getSupabaseClient(): SupabaseClient<Database> | null {
  if (client) return client
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null
  client = createSupabaseClient(url, key)
  return client
}

export function getDataProvider(): DataProvider {
  if (provider) return provider
  const shared = getSupabaseClient()
  if (shared) {
    provider = new SupabaseDataProvider(shared)
  } else {
    provider = new LocalDataProvider()
  }
  return provider
}

export function resetDataProvider(force = false): void {
  if (force) provider = null
}

export async function resolveStore(slug: string): Promise<StoreConfig | null> {
  return getDataProvider().getStoreConfig(slug)
}

export { ALL_STORES, JOLLY_ENTERPRISES }
