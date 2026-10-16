// Free-tier keep-alive (see docs/FINAL_HANDOVER.md "Keep-alive"). Issues ONE
// authenticated read-only query against the production project so the project
// registers activity. Use ONLY when there has been no organic traffic for
// ~5 days. Never writes, never prints key values.
//
// Env (injected at runtime, never committed):
//   SUPABASE_URL (production), SUPABASE_ANON_KEY (or SUPABASE_SERVICE_KEY)
// Usage:
//   node scripts/keepalive.mjs
import { createClient } from '@supabase/supabase-js'

const URL_ = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
if (!URL_ || !KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_ANON_KEY (or SUPABASE_SERVICE_KEY)')
  process.exit(2)
}
if (!URL_.includes('awshkiwqkuubkhecszzk')) {
  console.error(`Refusing to run: ${URL_} is not the production project`)
  process.exit(2)
}

const client = createClient(URL_, KEY, { auth: { persistSession: false } })
const { count, error } = await client.from('stores').select('id', { count: 'exact', head: true })
if (error) {
  console.log(`KEEPALIVE ${new Date().toISOString()} error ${String(error.message).slice(0, 120)}`)
  process.exit(1)
}
console.log(`KEEPALIVE ${new Date().toISOString()} ok stores=${count}`)
