// Full-page captures of the site: desktop 1440 and mobile 390, with reduced
// motion so every demo shows its poster (never a frame caught mid-change).
// Usage: node capturar.mjs [url] [outdir]
import { chromium } from 'playwright-core'

const url = process.argv[2] || 'http://localhost:5310/'
const out = process.argv[3] || new URL('./capturas/', import.meta.url).pathname
const exe = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const browser = await chromium.launch({ executablePath: exe })
for (const [name, w, h] of [['escritorio-1280', 1280, 800], ['movil-390', 390, 844]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, reducedMotion: 'reduce' })
  const page = await ctx.newPage()
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${out}${name}.png`, fullPage: true })
  console.log(`${out}${name}.png`)
  await ctx.close()
}
await browser.close()
