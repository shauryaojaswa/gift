// Wait for the GitHub Pages fallback to serve the refreshed build.
// The stale pre-v1.1.0 deployment serves bundle index-DayxwhG_.js; the
// refreshed CI build publishes a different bundle whose JS carries the
// v1.1.x+ marker strings. Polls read-only until then (or times out).
const STALE = 'index-DayxwhG_.js'
const MARKER = 'belongs to another shop'
const deadline = Date.now() + Number(process.argv[2] ?? 15) * 60 * 1000
let last = ''

while (Date.now() < deadline) {
  try {
    const res = await fetch('https://shauryaojaswa.github.io/gift/', { cache: 'no-store' })
    const body = await res.text()
    const bundle = /assets\/(index-[A-Za-z0-9_-]+\.js)/.exec(body)?.[1] ?? 'none'
    last = `status=${res.status} bundle=${bundle} jriq=${body.includes('JRIQ')}`
    if (bundle !== STALE && bundle !== 'none' && body.includes('JRIQ')) {
      const js = await fetch(`https://shauryaojaswa.github.io/gift/assets/${bundle}`, {
        cache: 'no-store',
      }).then((r) => r.text())
      if (js.includes(MARKER)) {
        console.log(`PASS  Pages serves refreshed bundle ${bundle} (markers present)`)
        process.exit(0)
      }
      last += ' markers=ABSENT'
    }
    console.log(`WAIT  ${last}`)
  } catch (err) {
    console.log(`WAIT  fetch error: ${err.message}`)
  }
  await new Promise((r) => setTimeout(r, 30000))
}
console.log(`FAIL  Pages not refreshed in time (last: ${last})`)
process.exit(1)
