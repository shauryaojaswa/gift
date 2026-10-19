// Wait for the GitHub Pages /gift/ fallback to serve the v1.3.1 refresh.
// Success = the Pages-served entry bundle contains this release's markers
// (invoice field placeholder + approved jewellery sentence) and the baked
// canonical campaign host (VITE_PUBLIC_APP_URL pin).
const STALE = 'index-DayxwhG_.js'
const deadline = Date.now() + Number(process.argv[2] ?? 15) * 60 * 1000
const MARKERS = ['Invoice or bill number', 'I really liked the jewellery designs.', 'https://jriq.in']
let last = ''

while (Date.now() < deadline) {
  try {
    const res = await fetch('https://shauryaojaswa.github.io/gift/', { cache: 'no-store' })
    const body = await res.text()
    const bundle = /assets\/(index-[A-Za-z0-9_-]+\.js)/.exec(body)?.[1] ?? 'none'
    last = `status=${res.status} bundle=${bundle}`
    if (bundle !== STALE && bundle !== 'none' && body.includes('JRIQ')) {
      const js = await fetch(`https://shauryaojaswa.github.io/gift/assets/${bundle}`, {
        cache: 'no-store',
      }).then((r) => r.text())
      const missing = MARKERS.filter((m) => !js.includes(m))
      if (missing.length === 0) {
        console.log(`PASS  Pages serves v1.3.1 bundle ${bundle} (all ${MARKERS.length} markers present)`)
        process.exit(0)
      }
      last += ` markers-missing=${missing.join(' | ')}`
    }
    console.log(`WAIT  ${last}`)
  } catch (err) {
    console.log(`WAIT  fetch error: ${err.message}`)
  }
  await new Promise((r) => setTimeout(r, 30000))
}
console.log(`FAIL  Pages v1.3.1 not published in time (last: ${last})`)
process.exit(1)
