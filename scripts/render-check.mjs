// Renders the laboratory page in a real headless browser and asserts the values
// that actually came out of the decoders.
//
// This is deliberately not "the build succeeded". It checks that real decoded
// values reached real DOM nodes, and it fails on any page or console error —
// a blank section with no console error is the hardest failure mode to diagnose
// in this project, so silence is treated as suspicious rather than fine.

import { chromium } from 'playwright'

const URL = process.env.URL || 'http://localhost:8080/'

const errors = []
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage()

page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))
page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`) })

await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForSelector('.desk-card', { timeout: 10_000 })

const status = await page.textContent('#decode-status')
const units = await page.textContent('#units-demo')
const cards = await page.$$eval('.desk-card', nodes => nodes.map(n => ({
  id: n.getAttribute('data-game-id'),
  teams: n.querySelector('.desk-card__teams')?.textContent,
  score: n.querySelector('[data-testid="score"]')?.textContent,
  status: n.querySelector('[data-testid="status"]')?.textContent,
  drama: n.querySelector('[data-testid="drama"]')?.textContent,
  odds: n.querySelector('.desk-card__odds')?.textContent,
})))

await browser.close()

const checks = []
const check = (name, pass, detail) => checks.push({ name, pass, detail })

check('decode status reports success', /^decoded \d+ game/.test(status || ''), status)
check('at least one card rendered', cards.length > 0, `${cards.length} card(s)`)
check('units demo rendered as a percentage', /\d+%/.test(units || ''), units)
check('no card shows a malformed nested payload',
  !cards.some(c => /MALFORMED/.test(`${c.drama} ${c.odds}`)),
  cards.map(c => c.drama).join(' | '))
check('every card has a real score or an explicit scheduled dash',
  cards.every(c => /\d+–\d+/.test(c.score) || c.score === '—'),
  cards.map(c => c.score).join(' | '))
check('no page or console errors', errors.length === 0, errors.join('; ') || 'none')

console.log(`\nURL: ${URL}`)
console.log(`decode-status: ${status}`)
console.log(`units-demo:    ${units}\n`)
for (const c of cards) {
  console.log(`  ${c.id}`)
  console.log(`    ${c.teams}  ${c.score}  [${c.status}]`)
  console.log(`    ${c.drama}  |  ${c.odds}`)
}
console.log()
for (const c of checks) {
  console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${c.pass ? '' : `\n      → ${c.detail}`}`)
}

const failed = checks.filter(c => !c.pass)
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
process.exit(failed.length === 0 ? 0 : 1)
