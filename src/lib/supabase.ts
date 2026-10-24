import { PostgrestClient } from '@supabase/postgrest-js'
import { GoTrueClient } from '@supabase/auth-js'
import type { StorageClient } from '@supabase/storage-js'
// TYPE-only import of the barrel: it is erased at build time, so it costs no
// bundle bytes - only the runtime imports above do.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

/**
 * Minimal browser client for Supabase.
 *
 * The application needs exactly three surfaces:
 *   - PostgREST : table reads/writes and every RPC (reward engine, store
 *                  settings, platform operations),
 *   - GoTrue    : sign-in, sign-out and session restore,
 *   - Storage   : the shop-owner logo upload (one admin-only call path).
 *
 * `@supabase/supabase-js` is a barrel whose SupabaseClient constructs a
 * Realtime client (plus its Phoenix websocket stack) and the Storage client
 * for EVERY page - including the customer storefront, which uses neither.
 * Assembling the client from the sub-clients keeps that dead weight out of
 * the entry chunk; Storage is imported on demand by the logo upload only.
 *
 * Behaviour deliberately identical to `createClient`:
 *   - the session storage key stays `sb-<project-host>-auth-token`, so
 *     sessions that exist today keep working across this change,
 *   - PostgREST calls carry `apikey` plus the CURRENT session bearer token
 *     (row-level security scopes every vendor read/write by auth.uid()),
 *   - the custom `x-client-info` header is preserved on all calls.
 */

type TypedClient = SupabaseClient<Database>

/** Storage path encoding, matching @supabase/storage-js exactly. */
const encodeStoragePath = (path: string) => path.split('/').map(encodeURIComponent).join('/')

export interface SupabaseStorageBucket {
  upload(
    path: string,
    file: File | Blob | ArrayBuffer,
    options?: { contentType?: string; cacheControl?: string; upsert?: boolean },
  ): Promise<{ data: { path: string; fullPath: string } | null; error: { message: string } | null }>
  getPublicUrl(path: string): { data: { publicUrl: string } }
}

export interface SupabaseClientLike {
  auth: GoTrueClient
  from: TypedClient['from']
  rpc: TypedClient['rpc']
  storage: { from(bucket: string): SupabaseStorageBucket }
}

export function createSupabaseClient(supabaseUrl: string, supabaseKey: string): SupabaseClientLike {
  const base = new URL(supabaseUrl.endsWith('/') ? supabaseUrl : `${supabaseUrl}/`)
  const headers = { apikey: supabaseKey, 'x-client-info': 'gift-customer-flow' }

  const auth = new GoTrueClient({
    url: new URL('auth/v1', base).href,
    headers,
    // Same key createClient would use, so existing sessions survive.
    storageKey: `sb-${base.hostname.split('.')[0]}-auth-token`,
    autoRefreshToken: true,
    persistSession: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  })

  // PostgREST calls must carry the CURRENT session token - RLS scopes every
  // vendor read/write by auth.uid(), so an unauthenticated call would simply
  // see no rows.
  const authedFetch: typeof fetch = async (input, init) => {
    const requestHeaders = new Headers(init?.headers)
    if (!requestHeaders.has('apikey')) requestHeaders.set('apikey', supabaseKey)
    const { data } = await auth.getSession()
    const token = data.session?.access_token
    requestHeaders.set('Authorization', token ? `Bearer ${token}` : `Bearer ${supabaseKey}`)
    return fetch(input, { ...init, headers: requestHeaders })
  }

  const rest = new PostgrestClient(new URL('rest/v1', base).href, {
    headers,
    schema: 'public',
    fetch: authedFetch,
  }) as unknown as {
    from: (relation: string) => unknown
    rpc: (fn: string, args?: unknown) => unknown
  }

  // Storage is needed only by the logo upload: load it on first use so it
  // never lands in the entry chunk.
  let storageClient: Promise<StorageClient> | null = null
  const loadStorage = () => {
    storageClient ??= import('@supabase/storage-js').then(
      ({ StorageClient }) => new StorageClient(new URL('storage/v1', base).href, headers, authedFetch),
    )
    return storageClient
  }

  return {
    auth,
    from: ((relation: string) => rest.from(relation)) as unknown as TypedClient['from'],
    rpc: ((fn: string, args?: Record<string, unknown>) =>
      rest.rpc(fn, args)) as unknown as TypedClient['rpc'],
    storage: {
      from(bucket: string): SupabaseStorageBucket {
        return {
          async upload(path, file, options) {
            const storage = await loadStorage()
            return storage.from(bucket).upload(path, file, options)
          },
          getPublicUrl(path) {
            return {
              data: {
                // The public URL is <base>/storage/v1/object/public/<bucket>/<path>
                // - the bucket segment is part of the object path.
                publicUrl: encodeURI(
                  `${base.href}storage/v1/object/public/${encodeStoragePath(`${bucket}/${path}`)}`,
                ),
              },
            }
          },
        }
      },
    },
  }
}

export type { Database }
