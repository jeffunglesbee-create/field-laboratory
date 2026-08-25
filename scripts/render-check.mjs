// Renders the laboratory page in a real headless browser and asserts the values
// that actually came out of the decoders.
//
// This is deliberately not "the build succeeded". It checks that real decoded
// values reached real DOM nodes, and it fails on any page or console error —
// a blank section with no console error is the hardest failure mode to diagnose
// in this project, so silence is treated as suspicious rather than fine.

import { existsSync } from 'node:fs'
import { chromium } from 'playwright'
import { all as weatherVenues } from '../build/Venues.js'
import { forecastUrl, coordinates } from '../build/Weather.js'
import { createChecks } from './checks.mjs'

const URL = process.env.URL || 'http://localhost:8080/'

// The weather chips fill from a LIVE Open-Meteo call. api.open-meteo.com has gone
// unreachable from GitHub-hosted runners for stretches (weather-live-check names
// the runs), and when it does, the chips cannot fill through no fault of the page
// — yet these assertions would fail hard and turn main red, blocking the deploy
// on a third-party outage. `weather-live-check` already resolved this exact split:
// tolerate unreachability in verify, nowhere else, and only ever for a probe that
// actually failed to reach the service. `--tolerate-unreachable` is passed by
// verify.yml's live render step and by no other job, so a broken chip while
// Open-Meteo IS reachable stays a hard failure everywhere.
const TOLERATE = process.argv.includes('--tolerate-unreachable')

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

// `domcontentloaded`, not `networkidle`. schedule-live-check.mjs made this same
// change and left the general question open in its own words: "whether the live
// page is ever reliably network-idle now that it fetches per card is a real
// question, and it is recorded in the outbox rather than settled by this
// change." live-check run 32614377552 settles it — page.goto timed out at 30s
// on `networkidle` against the deployed URL, in a run where deploy-landed had
// just passed 9/9, so the site was up and answering. A page whose every card
// fires its own weather fetch does not reach "500ms with no connections", and
// waiting for it is waiting for a condition this check does not need.
//
// The bounded waitForFunction on #decode-status directly below is this
// script's real precondition and is unchanged, so dropping networkidle
// removes a redundant wait rather than weakening the check.
await page.goto(URL, { waitUntil: 'domcontentloaded' })
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
  // The section heading carries the registry label. Read here so the score
  // assertion below can hold each card to the rule for ITS class rather than
  // to one rule that has to be loose enough for both.
  sport: n.closest('.sport-group')?.getAttribute('data-sport'),
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
  // Same URL as the goto above, so the same reasoning applies — and the
  // bounded waitForSelector on .desk-card directly below is already the real
  // precondition here.
  await sim.goto(`${URL}${URL.includes('?') ? '&' : '?'}simulate=1`, { waitUntil: 'domcontentloaded' })
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

// --- the weather chip, against the REAL service ------------------------------
//
// Read here, BEFORE the browser closes; asserted below, where `check` exists.
// The first version read it after `browser.close()` and every unpinned run
// crashed on `page.$$eval` — the same mistake made in nav-check an hour earlier
// and written up, then repeated. It hid because `check()` only pushes and
// `summarize()` prints, so the crash produced NO output at all, and because a
// pinned run skips this block entirely: `npm run check` and `check:hard` were
// green while `check:live` could not start.
//
// `new global.URL` because `URL` is shadowed by this file's own const at the
// top — the bare constructor throws here.
const pinned = new global.URL(URL).searchParams.has('data')

let cardVenues = []
let known = new Set()
let expected = 0
let chips = []
let filled = []
let waitErr = null

// Relay values that occupy the `venue` column without naming a venue.
//
// Measured 2026-08-25: `/context/date/2026-08-25` at 05:25 UTC served exactly
// one game — an MLS Leagues Cup quarterfinal, `games.regular` empty — carrying
// `venue: "TBC"`. A weather chip for TBC is impossible in PRINCIPLE, not
// missing from the table: there is no such place, and the fixture's venue has
// not been decided.
//
// Treating that as a coverage gap failed verify 137 on a change that touched
// no venue code, and would fail again on every thin early-morning slate. The
// three states below are the same discipline this repo applies everywhere
// else: covered, genuinely uncovered, and nothing to observe.
const PLACEHOLDER_VENUES = new Set(['TBC', 'TBD', '—', '-', ''])
const realVenues = vs => [...new Set(vs)].filter(v => !PLACEHOLDER_VENUES.has((v || '').trim()))

if (!pinned) {
  known = new Set(Array.from(weatherVenues).map(v => v.Name))
  cardVenues = await page.$$eval('.desk-card[data-venue]',
    ns => ns.map(n => n.getAttribute('data-venue')))
  expected = cardVenues.filter(v => known.has(v)).length

  // The wait is UNCONDITIONAL and its failure is NAMED. A swallowed timeout is
  // a check that cannot fail, and `.catch(() => {})` is how one is written.
  await page.waitForFunction(
    n => [...document.querySelectorAll('.desk-card__wx')]
           .filter(e => (e.textContent || '').trim() !== '').length === n,
    expected, { timeout: 20_000 }).catch(e => { waitErr = e.message })

  chips = await page.$$eval('.desk-card__wx',
    ns => ns.map(n => ({ t: (n.textContent || '').trim(), title: n.getAttribute('title') })))
  filled = chips.filter(c => c.t !== '')
}

// Attribute empty chips: if they did not fill, was Open-Meteo reachable at all?
// A direct probe — Fenway Park, the same coordinate weather-live-check uses — so
// "the service is down" is DISTINGUISHED from "the page rendered no chip while the
// service was up". Only the former is tolerated, and only when the flag is set;
// the latter is a real regression and stays a failure. The probe runs solely when
// there is an empty-chip failure to explain, so a healthy slate pays nothing.
let openMeteoDown = false
if (!pinned && (waitErr !== null || filled.length < expected)) {
  const probe = coordinates(42.3467, -71.0972)
  try {
    const r = await fetch(forecastUrl(probe), { signal: AbortSignal.timeout(15_000) })
    openMeteoDown = !r.ok
  } catch { openMeteoDown = true }
}

await browser.close()

const { check, summarize } = createChecks()

// The venue predicate, enumerated, BEFORE anything is decided through it.
//
// A skip that is wrong in the loosening direction is invisible: it prints a
// warning and passes. So the case that must keep FAILING is asserted here
// explicitly — a real venue absent from the table is a coverage gap and stays
// one. These are pure and cost nothing; they run on every slate, including the
// ones where the skip never fires.
const VENUE_CASES = [
  [['TBC'], 0, 'the 2026-08-25 slate: one Leagues Cup fixture, venue TBC'],
  [['TBC', 'Fenway Park'], 1, 'a placeholder beside a real venue is still observable'],
  [[], 0, 'an empty slate'],
  [['Some Unlisted Park'], 1, 'a real venue absent from the table IS a coverage gap'],
  [[null, '  TBD  '], 0, 'null and surrounding whitespace are placeholders too'],
]
const venueWrong = VENUE_CASES.filter(([vs, want]) => realVenues(vs).length !== want)
check('the placeholder-venue predicate holds on every enumerated case',
  venueWrong.length === 0,
  venueWrong.map(([vs, want, why]) => `${why}: ${realVenues(vs).length} real, want ${want}`).join('; ')
    || `${VENUE_CASES.length} cases`)

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
// A CONTEST card's score slot. Unchanged rule, narrowed subject.
//
// This assertion used to cover every card, and verify run 135 failed it on
// `BMW Championship · R4  Wyndham Clark -17` — correctly. A non-contest card's
// score slot carries a leaderboard line, not a scoreline, and the old rule
// encoded the premise the `NotAContest` Matchup case exists to break. Widening
// it to `|| anything` would have deleted the check; splitting it keeps both
// halves strict.
const NON_CONTEST = new Set(['golf'])
const contestCards = cards.filter(c => !NON_CONTEST.has(c.sport))
const eventCards = cards.filter(c => NON_CONTEST.has(c.sport))

// The classification itself, asserted before anything is asserted THROUGH it.
// `closest('.sport-group')` returning null would give every card an undefined
// sport, which `NON_CONTEST.has` reports as false — so a golf card would be
// silently reclassified as a contest and the split below would prove nothing.
// `renderSlate` is the only path that mounts a `.desk-card` and it always nests
// them in a `.sport-group`; this is that fact under test rather than assumed.
check('every card resolved the sport of its section',
  cards.every(c => typeof c.sport === 'string' && c.sport !== ''),
  `${cards.filter(c => !c.sport).length} of ${cards.length} card(s) with no resolvable section`)

check('every contest card has a real score or an explicit scheduled dash',
  contestCards.every(c => /\d+–\d+/.test(c.score) || c.score === '—'),
  contestCards.map(c => c.score).join(' | ') || 'no contest cards on this slate')

// The NEGATIVE half, and the one that matters. An event card must never show a
// contest scoreline: `home_score`/`away_score` on a PGA Tour row are the top
// two players of a leaderboard, so an `N–N` in this slot would be a fabricated
// tie between two sides that do not exist.
check('no event card shows a contest scoreline',
  eventCards.every(c => c.score && c.score.trim() !== '' && !/\d+–\d+/.test(c.score)),
  eventCards.map(c => `${c.sport}: ${JSON.stringify(c.score)}`).join(' | ')
    || 'no event cards on this slate')

// And it must not claim to be scheduled once the row records completion. A
// non-contest never reaches Final through the contest state machine, so this
// read "Scheduled — no start time" on a finished round until 2026-08-25.
check('no event card calls a completed round scheduled',
  eventCards.every(c => !/Scheduled/i.test(c.status || '')),
  eventCards.map(c => `${c.sport}: ${JSON.stringify(c.status)}`).join(' | ')
    || 'no event cards on this slate')
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
// --- the weather chip, asserted ---------------------------------------------
//
// `expected === 0` is a VACUOUS pass and is asserted against directly. With no
// known venue on the slate, `filled.length === expected` is 0 === 0 and all
// three checks below go green having proven nothing — and they fail together,
// in agreement, because a chip can only ever fill for a venue the table
// carries. That is the shape this repo keeps rediscovering, so the coverage of
// the table is a check in its own right rather than a precondition nobody
// states.
if (!pinned) {
  // A slate can carry venues that are not venues. `real` is the denominator:
  // without it, "no venue on this slate is in the table" and "this slate names
  // no venue at all" are the same failure, and only the first is one.
  const real = realVenues(cardVenues)
  const observable = real.length > 0

  // The venue-table coverage is independent of Open-Meteo — it is about the table,
  // not the service — so it is asserted whether or not the service answered.
  if (!observable) {
    // Loud, and never a silent pass. The count is printed so a slate that is
    // quietly ALL placeholders for days is visible rather than inferred.
    console.log('::warning::no card on this slate names a real venue ' +
      `(${cardVenues.length} card(s): ${[...new Set(cardVenues)].join(', ') || 'none with a venue'}) — ` +
      'the venue-table and weather-chip checks are skipped. A placeholder venue has no ' +
      'weather reading in principle, so this is nothing to observe, not a coverage gap.')
  } else {
  check('the venue table covers at least one venue on this slate', expected > 0,
    `${real.join(', ')} — none of them in the ${known.size}-entry table`)

  if (TOLERATE && openMeteoDown) {
    // Open-Meteo unreachable from this runner. The chips could not fill through no
    // fault of the page, so the four live-weather assertions are SKIPPED — loudly,
    // as a warning, never a silent pass. Tolerated here only because verify passes
    // the flag; every other job asserts, and a broken chip with the service UP is
    // never reached by this branch (openMeteoDown is set only on a failed probe).
    console.log('::warning::Open-Meteo unreachable from this runner — the four live weather-chip ' +
      `checks are skipped (${expected} known venue(s) on this slate, ${filled.length} chip(s) filled). ` +
      'This is a third-party outage, not a page defect; verify is not gated on it.')
  } else {
    check('the chips all filled within the wait', waitErr === null, waitErr)
    check('every card whose venue the table knows carries a live chip',
      expected > 0 && filled.length === expected,
      `${expected} known venue(s) on this slate, ${filled.length} chip(s) filled`)
    // Anchored and whole-string: `includes('61')` would accept 161°F, and a bare
    // prefix would accept a chip that had grown a stray suffix.
    check('every live chip reads as a temperature and nothing else',
      filled.length > 0 &&
      filled.every(c => /^-?\d+°F( · (rain|snow or sleet|rain and ice))?$/.test(c.t)),
      JSON.stringify(filled.slice(0, 3)))
    check('every live chip carries a real roof caveat',
      filled.length > 0 &&
      filled.every(c => /open air|fixed roof|retractable roof/.test(c.title || '')),
      JSON.stringify(filled.slice(0, 3)))
  }
  } // end: this slate names at least one real venue
}

process.exit(summarize() === 0 ? 0 : 1)
