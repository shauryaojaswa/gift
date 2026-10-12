import { ApiDataProvider } from './api'
import { SupabaseDataProvider } from './supabase'
import { createSupabaseClient } from '../supabase'
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
export { ApiDataProvider } from './api'

let provider: DataProvider | null = null

export function getDataProvider(): DataProvider {
  if (provider) return provider
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (url && key) {
    provider = new SupabaseDataProvider(createSupabaseClient(url, key))
  } else {
    // The platform API is the default backend (multi-tenant).
    provider = new ApiDataProvider()
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
