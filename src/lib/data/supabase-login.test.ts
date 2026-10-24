import { describe, expect, it, vi } from 'vitest'
import { SupabaseDataProvider } from './supabase'

/**
 * Shop-name login IDs ("BCY Jewellers Private Limited") resolve to the auth
 * account's e-mail on the BACKEND (resolve_admin_login) - the client holds no
 * mapping and no credential. E-mail sign-ins keep their existing zero-extra-
 * round-trip path. These tests pin the resolution contract and the fact that
 * the password only ever reaches the authentication provider.
 */

type StubClient = {
  rpc: ReturnType<typeof vi.fn>
  auth: { signInWithPassword: ReturnType<typeof vi.fn> }
}

function makeProvider(overrides: Partial<StubClient> = {}): {
  provider: SupabaseDataProvider
  stub: StubClient
} {
  const stub: StubClient = {
    rpc: vi.fn(async () => ({ data: 'owner@bcy.test', error: null })),
    auth: {
      signInWithPassword: vi.fn(async () => ({ error: null })),
    },
    ...overrides,
  }
  const provider = new SupabaseDataProvider(
    stub as unknown as ConstructorParameters<typeof SupabaseDataProvider>[0],
  )
  return { provider, stub }
}

describe('signInAdmin - shop-name login IDs', () => {
  it('resolves a login ID through the backend and signs in with the returned e-mail', async () => {
    const { provider, stub } = makeProvider()
    const res = await provider.signInAdmin('BCY Jewellers Private Limited', 'Haridwar')
    expect(res).toEqual({ ok: true })
    expect(stub.rpc).toHaveBeenCalledWith('resolve_admin_login', {
      p_login_id: 'BCY Jewellers Private Limited',
    })
    expect(stub.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'owner@bcy.test',
      password: 'Haridwar',
    })
  })

  it('trims the typed login ID before resolution', async () => {
    const { provider, stub } = makeProvider()
    await provider.signInAdmin('  BCY Jewellers Private Limited  ', 'Haridwar')
    expect(stub.rpc).toHaveBeenCalledWith('resolve_admin_login', {
      p_login_id: 'BCY Jewellers Private Limited',
    })
  })

  it('never guesses: an unknown login ID fails generically without a sign-in attempt', async () => {
    const { provider, stub } = makeProvider({
      rpc: vi.fn(async () => ({ data: null, error: null })),
    })
    const res = await provider.signInAdmin('Unknown Shop', 'whatever')
    expect(res.ok).toBe(false)
    expect(res.error).toBe('Invalid login ID or password')
    expect(stub.auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('fails closed when resolution itself errors (no e-mail, no credential leaked)', async () => {
    const { provider, stub } = makeProvider({
      rpc: vi.fn(async () => ({ data: null, error: { message: 'boom' } })),
    })
    const res = await provider.signInAdmin('BCY Jewellers Private Limited', 'Haridwar')
    expect(res.ok).toBe(false)
    expect(res.error).toBe('Unable to sign in with those credentials')
    expect(stub.auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('passes e-mail logins straight to the auth provider without resolution', async () => {
    const { provider, stub } = makeProvider()
    const res = await provider.signInAdmin('owner@bcy.test', 'Haridwar')
    expect(res).toEqual({ ok: true })
    expect(stub.rpc).not.toHaveBeenCalled()
    expect(stub.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'owner@bcy.test',
      password: 'Haridwar',
    })
  })

  it('surfaces the auth provider verdict for a wrong password', async () => {
    const { provider } = makeProvider({
      auth: {
        signInWithPassword: vi.fn(async () => ({
          error: { message: 'Invalid login credentials' },
        })),
      },
    })
    const res = await provider.signInAdmin('BCY Jewellers Private Limited', 'wrong')
    expect(res).toEqual({ ok: false, error: 'Invalid login credentials' })
  })
})
