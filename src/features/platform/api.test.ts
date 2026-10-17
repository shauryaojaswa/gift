import { describe, expect, it, vi } from 'vitest'
import { createShop, uploadShopLogo, type PlatformClient } from './api'

/**
 * New-shop wizard logo path tests (final merged brief):
 * - a logo is OPTIONAL: creating a shop without one must never send a logo
 *   URL (the shop then uses its own no-logo fallback)
 * - a provided logo URL is passed to create_shop untouched
 * - the wizard's logo upload shares the global logo rules (type/size) and
 *   rejects bad files before any storage write
 */

function fakeFile(type: string, size: number): File {
  return { type, size, name: 'logo' } as unknown as File
}

function makeClient(overrides?: { rpcData?: unknown; rpcError?: { message: string } | null }) {
  const rpc = vi.fn().mockResolvedValue({
    data:
      overrides?.rpcData ??
      {
        shop_id: 'shop-1',
        shop_slug: 'shreejwellers',
        shop_name: 'Shree Jewellers',
        customer_path: '/shreejwellers',
        owner_link_status: 'pending',
      },
    error: overrides?.rpcError ?? null,
  })
  const upload = vi.fn().mockResolvedValue({ error: null })
  const getPublicUrl = vi.fn().mockReturnValue({
    data: { publicUrl: 'https://cdn.example.com/store-logos/new-shops/abc.png' },
  })
  const from = vi.fn(() => ({ upload, getPublicUrl }))
  const client = { rpc, storage: { from } } as unknown as PlatformClient
  return { client, rpc, upload, getPublicUrl, from }
}

describe('createShop (optional-logo wizard path)', () => {
  it('creates a shop WITHOUT any logo URL when none is provided', async () => {
    const { client, rpc } = makeClient()
    const result = await createShop(client, {
      name: 'Shree Jewellers',
      slug: 'shreejwellers',
      ownerEmail: 'owner@example.com',
    })
    expect(rpc).toHaveBeenCalledTimes(1)
    const args = rpc.mock.calls[0][1] as Record<string, unknown>
    expect(args.p_logo_url).toBeUndefined()
    expect(result).toEqual({
      shopId: 'shop-1',
      shopSlug: 'shreejwellers',
      shopName: 'Shree Jewellers',
      customerPath: '/shreejwellers',
      ownerLinkStatus: 'pending',
    })
  })

  it('passes a provided logo URL through to create_shop untouched', async () => {
    const { client, rpc } = makeClient()
    const url = 'https://cdn.example.com/store-logos/new-shops/abc.png'
    await createShop(client, {
      name: 'Shree Jewellers',
      slug: 'shreejwellers',
      ownerEmail: 'owner@example.com',
      logoUrl: url,
    })
    const args = rpc.mock.calls[0][1] as Record<string, unknown>
    expect(args.p_logo_url).toBe(url)
  })

  it('surfaces create_shop errors instead of pretending the shop was created', async () => {
    const { client } = makeClient({ rpcError: { message: 'slug already taken' } })
    await expect(
      createShop(client, { name: 'X', slug: 'x', ownerEmail: 'a@b.c' }),
    ).rejects.toThrow(/slug already taken/)
  })
})

describe('uploadShopLogo (wizard logo file)', () => {
  it('accepts a valid image, uploads it under new-shops/ and returns the public URL', async () => {
    const { client, upload, getPublicUrl } = makeClient()
    const url = await uploadShopLogo(client, fakeFile('image/png', 1024))
    expect(upload).toHaveBeenCalledTimes(1)
    const [path] = upload.mock.calls[0]
    expect(path).toMatch(/^new-shops\/[0-9a-f-]{36}\.png$/)
    expect(url).toBe('https://cdn.example.com/store-logos/new-shops/abc.png')
    expect(getPublicUrl).toHaveBeenCalledWith(path)
  })

  it('rejects bad files with the shared logo rules BEFORE any storage write', async () => {
    const { client, upload } = makeClient()
    await expect(uploadShopLogo(client, fakeFile('image/gif', 1024))).rejects.toThrow(/JPG, PNG or WebP/)
    await expect(uploadShopLogo(client, fakeFile('image/png', 0))).rejects.toThrow(/JPG, PNG or WebP/)
    await expect(
      uploadShopLogo(client, fakeFile('image/png', 6 * 1024 * 1024)),
    ).rejects.toThrow(/JPG, PNG or WebP/)
    expect(upload).not.toHaveBeenCalled()
  })

  it('propagates storage upload failures', async () => {
    const upload = vi.fn().mockResolvedValue({ error: { message: 'bucket denied' } })
    const from = vi.fn(() => ({ upload, getPublicUrl: vi.fn() }))
    const client = { rpc: vi.fn(), storage: { from } } as unknown as PlatformClient
    await expect(uploadShopLogo(client, fakeFile('image/png', 1024))).rejects.toThrow(/bucket denied/)
  })
})
