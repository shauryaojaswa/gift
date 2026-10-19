import fs from 'node:fs'
import QRCode from 'qrcode'

const out = []
const url = 'https://jriq.in/sample-shop'

const svg = await QRCode.toString(url, { type: 'svg', width: 1024, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#49252d', light: '#fffdf9' } })
out.push('svg-length=' + svg.length)
out.push('svg-head=' + svg.slice(0, 400).replace(/\n/g, ' '))

const dataUrl = await QRCode.toDataURL(url, { width: 1200, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#49252d', light: '#fffdf9' } })
out.push('png-dataurl-length=' + dataUrl.length)

for (const mod of ['jsqr', 'pngjs', 'playwright']) {
  try {
    await import(mod)
    out.push(mod + '=present')
  } catch {
    out.push(mod + '=missing')
  }
}

fs.writeFileSync('logs/probe-qr.txt', out.join('\n'), 'ascii')
console.log('probed')
