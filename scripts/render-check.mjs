// Renders the laboratory page in a real headless browser and asserts the values
// that actually came out of the decoders.
//
// This is deliberately not "the build succeeded". It checks that real decoded
// values reached real DOM nodes, and it fails on any page or console error —
// a blank section with no console error is the hardest failure mode to diagnose
// in this project, so silence is treated as suspicious rather than fine.

import { existsSync } from 'node:fs'
import { chromium } from 'playwright'
import { createChecks } from './checks.mjs'

const URL = process.env.URL || 'http://localhost:8080/'

const errors = []
// Chromium lives in two different places depending on where this runs. The
// cloud session image ships one at /opt/pw-browsers/chromium whose build number
// does not match the pinned playwright package, so default resolution there
// looks for a directory that does not exist. A CI runner has no such image and
// resolves its own installed browser correctly. Prefer the session's copy when
// it is genuinely present, otherwise let playwright decide.
const sessionChromium = '/opt/pw-browsers/chromium'
const browser = await chromium.launch(
  existsSync(sessionChromium) ? { executablePath: sessionChromium } : {}
)
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

// --- state transition -------------------------------------------------------
// The initial paint is not enough. A previous version of this check passed 6/6
// over a real bug: the score node was reactive and the status node was not, so
// a game reaching Final rendered a final score labelled "In progress". Nothing
// that only samples the first render can catch that. This drives a real
// transition and asserts every state-derived node moves together.
const transition = { ran: false, before: null, after: null, error: null }
try {
  const sim = await browser.newPage()
  sim.on('pageerror', e => errors.push(`pageerror(sim): ${e.message}`))
  await sim.goto(`${URL}${URL.includes('?') ? '&' : '?'}simulate=1`, { waitUntil: 'networkidle' })
  await sim.waitForSelector('.desk-card', { timeout: 10_000 })

  const sample = () => sim.$eval('.desk-card', n => ({
    score: n.querySelector('[data-testid="score"]')?.textContent,
    status: n.querySelector('[data-testid="status"]')?.textContent,
  }))

  transition.before = await sample()
  await sim.evaluate(() => window.__labSetState(0, 'final'))
  transition.after = await sample()
  transition.ran = true
  await sim.close()
} catch (e) {
  transition.error = e.message
}

await browser.close()

const { check, summarize } = createChecks()

check('decode status reports success', /^decoded \d+ game/.test(status || ''), status)
check('at least one card rendered', cards.length > 0, `${cards.length} card(s)`)
check('units demo rendered as a percentage', /\d+%/.test(units || ''), units)
check('no card shows a malformed nested payload',
  !cards.some(c => /MALFORMED/.test(`${c.drama} ${c.odds}`)),
  cards.map(c => c.drama).join(' | '))
check('every card has a real score or an explicit scheduled dash',
  cards.every(c => /\d+–\d+/.test(c.score) || c.score === '—'),
  cards.map(c => c.score).join(' | '))
check('state transition ran', transition.ran, transition.error || 'ok')
check('score updates on state change',
  transition.ran && transition.before.score !== transition.after.score,
  `${transition.before?.score} -> ${transition.after?.score}`)
// The regression guard. Before the fix this was the failing line: the score
// moved and the status did not.
check('status updates with it (no stale node)',
  transition.ran && transition.after.status === 'Final / OT',
  `${transition.before?.status} -> ${transition.after?.status}`)
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
console.log(`transition:   ${transition.before?.score} [${transition.before?.status}]`)
console.log(`          ->  ${transition.after?.score} [${transition.after?.status}]\n`)
process.exit(summarize() === 0 ? 0 : 1)
