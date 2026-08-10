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
// Wait for the status line to be filled, NOT for a card. A card may legitimately
// not exist on an empty live slate, and waiting for one would throw before a
// single assertion ran — turning "no games today" into an unexplained crash.
await page.waitForFunction(
  () => {
    const el = document.getElementById('decode-status')
    return el && el.textContent && el.textContent !== 'decoding…'
  },
  { timeout: 15_000 }
)

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
const transition = { ran: false, before: null, after: null, error: null, skipped: false }
try {
  if (cards.length === 0) {
    // Nothing to drive. Only reachable on a genuinely empty live slate.
    transition.skipped = true
    throw new Error('no cards to transition')
  }
  const sim = await browser.newPage()
  sim.on('pageerror', e => errors.push(`pageerror(sim): ${e.message}`))
  await sim.goto(`${URL}${URL.includes('?') ? '&' : '?'}simulate=1`, { waitUntil: 'networkidle' })
  await sim.waitForSelector('.desk-card', { timeout: 10_000 })

  const sample = () => sim.$eval('.desk-card', n => ({
    score: n.querySelector('[data-testid="score"]')?.textContent,
    status: n.querySelector('[data-testid="status"]')?.textContent,
    drama: n.querySelector('[data-testid="drama"]')?.textContent,
  }))

  transition.before = await sample()
  await sim.evaluate(() => window.__labSetState(0, 'final'))
  transition.after = await sample()
  // Drive the same card BACK to live. ADR-002's amnesty zone permits the raw
  // drama number post-game only, so the number must disappear again here. The
  // compiler already makes the leak unwriteable; this asserts the rendered
  // result, because a gate nobody exercises is a claim rather than a guard.
  await sim.evaluate(() => window.__labSetState(0, 'inprogress'))
  transition.live = await sample()
  transition.ran = true
  await sim.close()
} catch (e) {
  transition.error = e.message
}

await browser.close()

const { check, summarize } = createChecks()

check('decode status reports success', /^decoded \d+ game/.test(status || ''), status)
// Stronger than "at least one card", and correct on a genuinely empty day:
// the number of cards must equal the number of games the decoder reported.
// A mismatch means decode and render disagree, which "at least one" would miss
// entirely — and this also lets the live check run on an off-season date
// without a zero-game slate reading as a failure.
const decodedCount = Number((status || '').match(/^decoded (\d+) game/)?.[1] ?? NaN)
check('card count matches decoded game count',
  Number.isFinite(decodedCount) && cards.length === decodedCount,
  `decoded ${decodedCount}, rendered ${cards.length}`)
check('units demo rendered as a percentage', /\d+%/.test(units || ''), units)
check('no card shows a malformed nested payload',
  !cards.some(c => /MALFORMED/.test(`${c.drama} ${c.odds}`)),
  cards.map(c => c.drama).join(' | '))
check('every card has a real score or an explicit scheduled dash',
  cards.every(c => /\d+–\d+/.test(c.score) || c.score === '—'),
  cards.map(c => c.score).join(' | '))
check('state transition ran', transition.ran || transition.skipped,
  transition.skipped ? 'skipped — empty slate' : (transition.error || 'ok'))
check('score updates on state change',
  transition.skipped || (transition.ran && transition.before.score !== transition.after.score),
  `${transition.before?.score} -> ${transition.after?.score}`)
// The regression guard. Before the fix this was the failing line: the score
// moved and the status did not.
check('status updates with it (no stale node)',
  transition.skipped || (transition.ran && transition.after.status === 'Final / OT'),
  `${transition.before?.status} -> ${transition.after?.status}`)
// --- ADR-002 amnesty gate ----------------------------------------------------
// The bright-line rule: a raw composite drama number may be displayed post-game
// only. Before the gate, `dramaText` took the whole Game and ran for every card
// regardless of state, so a live game carrying a drama_arc rendered its peak —
// severity CRITICAL by FIELD's own classification.
check('no drama peak displayed while live',
  transition.skipped || (transition.ran && !/peak/.test(transition.live?.drama || '')),
  `live drama slot: "${transition.live?.drama}"`)
// The complement, so the gate cannot pass by simply hiding everything forever.
// Skipped honestly when the sampled card has no arc to show in the first place.
check('drama peak returns post-game',
  transition.skipped || !/arc/.test(transition.after?.drama || '') ||
    /peak/.test(transition.after?.drama || ''),
  `post-game drama slot: "${transition.after?.drama}"`)

// --- Odds Story --------------------------------------------------------------
check('every card fills its odds slot', cards.every(c => (c.odds || '').trim().length > 0),
  cards.map(c => `"${c.odds}"`).join(' | '))

// Verifies the NOT SEQUENCED classification from outside the type system: the
// card prints both timestamps, so the claim can be checked against them. A card
// that flagged a genuine sequence as unsequenced would pass every internal test
// and fail here.
const unsequenced = cards
  .map(c => (c.odds || '').match(/NOT SEQUENCED \(([^ ]+) vs ([^)]+)\)/))
  .filter(Boolean)
check('every NOT SEQUENCED card really is out of sequence',
  unsequenced.every(([, open, close]) => Date.parse(close) <= Date.parse(open)),
  unsequenced.map(([, o, c]) => `${o} -> ${c}`).join(' | ') || 'none on this slate')

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
console.log(`          ->  ${transition.after?.score} [${transition.after?.status}]`)
console.log(`drama slot:   post-game "${transition.after?.drama}"`)
console.log(`          ->  live      "${transition.live?.drama}"\n`)
process.exit(summarize() === 0 ? 0 : 1)
