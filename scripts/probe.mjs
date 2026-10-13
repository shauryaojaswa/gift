import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
for (const slug of process.argv.slice(2)) {
  errors.length = 0
  await page.goto(`http://localhost:4173/store/${slug}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  const text = (await page.locator('body').innerText()).replace(/\n+/g, ' | ').slice(0, 300)
  const buttons = await page.locator('button').allTextContents()
  console.log(`--- /store/${slug}`);
  console.log('  text: ' + text);
  console.log('  buttons: ' + JSON.stringify(buttons));
  console.log('  errors: ' + JSON.stringify(errors.slice(0, 5)));
}
await browser.close()
