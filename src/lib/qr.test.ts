import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import jsQR from 'jsqr'
import { PNG } from 'pngjs'
import {
  generateQrPng,
  generateQrSvg,
  getCampaignUrl,
  QR_PNG_WIDTH,
  QR_SVG_WIDTH,
} from './qr'

/**
 * Printable QR contract: every artefact (PNG and SVG) must be print-sized and
 * decode to exactly `https://jriq.in/{slug}` - the canonical builder's output,
 * never an admin path, a legacy /store/ path or a preview host.
 *
 * rasterizeQrSvg rebuilds the pixel grid from the symbol's module runs (the
 * qrcode library's crispEdges path format) so the vector bytes themselves are
 * decoded by jsQR, exactly as a phone camera would read the printed symbol.
 */
function rasterizeQrSvg(svg: string): {
  data: Uint8ClampedArray
  width: number
  height: number
} {
  const vb = /viewBox="0 0 (\d+) (\d+)"/.exec(svg)
  expect(vb).not.toBeNull()
  const modules = Number(vb![1])
  expect(Number(vb![2])).toBe(modules)

  const dark: boolean[][] = Array.from({ length: modules }, () =>
    Array<boolean>(modules).fill(false),
  )
  const d = /<path stroke="[^"]*" d="([^"]*)"/.exec(svg)?.[1] ?? ''
  expect(d.length).toBeGreaterThan(0)

  const tokens = d.match(/[Mmh][^Mmh]*/g) ?? []
  let x = 0
  let y = 0
  for (const token of tokens) {
    const op = token[0]
    const nums = token
      .slice(1)
      .trim()
      .split(/[\s,]+/)
      .map(Number)
    if (op === 'M') {
      x = nums[0]
      y = nums[1]
    } else if (op === 'm') {
      x += nums[0]
      y += nums[1]
    } else if (op === 'h') {
      const row = Math.floor(y)
      const start = Math.floor(x)
      for (let i = 0; i < nums[0]; i += 1) {
        if (dark[row]) dark[row][start + i] = true
      }
      x += nums[0]
    }
  }

  const scale = 8
  const size = modules * scale
  const data = new Uint8ClampedArray(size * size * 4)
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      const on = dark[Math.floor(py / scale)][Math.floor(px / scale)]
      const o = (py * size + px) * 4
      data[o] = on ? 0x49 : 0xff
      data[o + 1] = on ? 0x25 : 0xfd
      data[o + 2] = on ? 0x2d : 0xf9
      data[o + 3] = 255
    }
  }
  return { data, width: size, height: size }
}

describe('printable QR artefacts', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_PUBLIC_APP_URL', 'https://jriq.in')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('builds the canonical campaign URL exactly', () => {
    expect(getCampaignUrl('sample-shop')).toBe('https://jriq.in/sample-shop')
    expect(getCampaignUrl('kalyan-jewellers')).toBe('https://jriq.in/kalyan-jewellers')
  })

  it('PNG artefact is print-sized and decodes to exactly the campaign URL', async () => {
    const dataUrl = await generateQrPng(getCampaignUrl('sample-shop'))
    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true)

    const png = PNG.sync.read(Buffer.from(dataUrl.split(',')[1], 'base64'))
    expect(png.width).toBe(QR_PNG_WIDTH)
    expect(png.height).toBe(QR_PNG_WIDTH)
    expect(png.width).toBeGreaterThanOrEqual(1000)

    const decoded = jsQR(
      new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length),
      png.width,
      png.height,
    )
    expect(decoded?.data).toBe('https://jriq.in/sample-shop')
  })

  it('SVG artefact is print-sized and decodes to exactly the campaign URL', async () => {
    const svg = await generateQrSvg(getCampaignUrl('another-shop'))
    expect(svg).toContain(`width="${QR_SVG_WIDTH}"`)
    expect(QR_SVG_WIDTH).toBeGreaterThanOrEqual(1000)

    const raster = rasterizeQrSvg(svg)
    const decoded = jsQR(raster.data, raster.width, raster.height)
    expect(decoded?.data).toBe('https://jriq.in/another-shop')
  })
})
