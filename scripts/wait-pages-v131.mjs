// Wait for the GitHub Pages /gift/ fallback to serve the current release.
// Success = the Pages-served bundle set contains this release's markers
// (invoice field placeholder + approved jewellery sentence + the baked
// canonical campaign host (VITE_PUBLIC_APP_URL pin)).
//
// The markers live in the lazily-imported chunks (CustomerFlow / lib), never in
// the entry bundle of a chunked build - so the whole served chunk set is
// fetched and scanned, not just the entry.
const STALE = 'index-DayxwhG_.js'
const deadline = Date.now() + Number(process.argv[2] ?? 15) * 60 * 1000
const MARKERS = ['Invoice or bill number', 'I really liked the jewellery designs.', 'https://jriq.in']
const ORIGIN = 'https://shauryaojaswa.github.io/gift'
let last = ''

while (Date.now() < deadline) {
  try {
    const res = await fetch(`${ORIGIN}/`, { cache: 'no-store' })
    const body = await res.text()
    const bundle = /assets\/(index-[A-Za-z0-9_-]+\.js)/.exec(body)?.[1] ?? 'none'
    last = `status=${res.status} bundle=${bundle}`
    if (bundle !== STALE && bundle !== 'none' && body.includes('JRIQ')) {
      // collect the served chunk set: filenames referenced by the HTML and by
      // every fetched chunk (dynamic-import specifiers are bare filenames)
      const seen = new Set()
      const queue = [...body.matchAll(/assets\/([A-Za-z0-9_.-]+\.js)/g)].map((m) => m[1])
      const chunkRe = /([A-Za-z0-9_.-]+-[A-Za-z0-9_-]{8,}\.js)/g
      let text = ''
      while (queue.length) {
        const name = queue.shift()
        if (seen.has(name)) continue
        seen.add(name)
        const js = await fetch(`${ORIGIN}/assets/${name}`, { cache: 'no-store' })
          .then((r) => (r.ok ? r.text() : ''))
          .catch(() => '')
        text += js
        for (const m of js.matchAll(chunkRe)) if (!seen.has(m[1])) queue.push(m[1])
      }
      const missing = MARKERS.filter((m) => !text.includes(m))
      if (missing.length === 0) {
        console.log(`PASS  Pages serves release bundle ${bundle} (${seen.size} chunks scanned, all ${MARKERS.length} markers present)`)
        process.exit(0)
      }
      last += ` chunks=${seen.size} markers-missing=${missing.join(' | ')}`
    }
    console.log(`WAIT  ${last}`)
  } catch (err) {
    console.log(`WAIT  fetch error: ${err.message}`)
  }
  await new Promise((r) => setTimeout(r, 30000))
}
console.log(`FAIL  Pages release bundle not published in time (last: ${last})`)
process.exit(1)
