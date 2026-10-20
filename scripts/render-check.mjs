// Renders the laboratory page in a real headless browser and asserts the values
// that actually came out of the decoders.
//
// This is deliberately not "the build succeeded". It checks that real decoded
// values reached real DOM nodes, and it fails on any page or console error —
// a blank section with no console error is the hardest failure mode to diagnose
// in this project, so silence is treated as suspicious rather than fine.

import { existsSync } from 'node:fs'
import { chromium } from 'playwright'
import { all as weatherVenues, isIndoorArena } from '../build/Venues.js'
import { forecastUrl, coordinates } from '../build/Weather.js'
import { requestCapMs, slateDeadlineMs } from '../build/WeatherView.js'
import { createChecks, finish } from './checks.mjs'

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
// WHICH BUILD IS THIS. `build-site.mjs` writes the commit to `public/version.txt`
// and the deployed worker serves it, so the answer is one fetch away and was
// never asked.
//
// It cost a wrong conclusion today. verify tests the DEPLOYED site, and deploy
// is a separate workflow that runs AFTER verify: run 33076464112 passed at
// 13:24:12 and `f7c0248`'s deploy did not start until 13:24:29, so the run that
// was read as "preconnect works, 22/22" had measured the build from BEFORE
// preconnect. The first run that provably tested it, 33076823553 at 13:28:41,
// failed. The same confound produced the false start of this session's weather
// investigation at run 159.
//
// Printed on every run and carried into the chip failure, so no future reading
// of these numbers has to reconstruct which bytes produced them.
let builtFrom = 'unreadable'
try {
  const r = await fetch(new global.URL(URL).origin + '/version.txt',
                        { signal: AbortSignal.timeout(10_000) })
  if (r.ok) builtFrom = (await r.text()).trim().slice(0, 7)
  else builtFrom = `version.txt -> HTTP ${r.status}`
} catch (e) { builtFrom = `version.txt unreachable — ${e.message}` }

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
let pageAccount = ''
let wxTiming = ''
let wxRequests = []

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

// Attribute an empty-chip failure FROM THE PAGE'S OWN WINDOW.
//
// The node probe below cannot do this, and render-check has said so since the
// day it was written: it is one request "after the 20s wait has already elapsed,
// and a service that refused a burst can answer a single late request perfectly
// well." On 2026-09-01 that became the failure — runs 244, 245 and 250 died with
// every page request timed out and the probe answering HTTP 200, so the
// tolerance branch built for exactly this outage never fired and a third-party
// condition gated the deploy.
//
// `probe-open-meteo-egress` measured why re-probing cannot fix it: chromium
// bursts eight concurrent requests to the host in 202-510ms from the same runner
// image, so it is neither the network stack nor concurrency. The host recovers
// faster than a probe fired six seconds later can catch, which `WeatherView.fs`
// already documents it doing inside a single page load. A later probe measures a
// later moment. It is the wrong instrument, not a badly-tuned one.
//
// So the evidence is the page's own resource entries, which say three things
// that together attribute the failure without a second request. Measured on the
// browser that runs this check (run 33561942089, at the real origin):
//
//   an entry for EVERY request    : 9/9 to the real host
//   an entry for a TIMED-OUT req  : YES — status 0, 4000ms
//   name carries the query string : YES
//   responseStatus present        : YES  (200 answered, 0 never-answered)
//
// `responseStatus` is NOT gated by the absent `Timing-Allow-Origin` the way the
// connection phases are, which is the fact the whole mechanism turns on.
//
// This is NARROWER than the probe it replaces, not wider. A page requesting a
// malformed URL, or aborting its own requests in 50ms, currently reaches the
// tolerance branch whenever the host happens to be slow. Neither does here.
// NOT exported. This file runs at module scope — it launches a browser and
// exits — so exporting anything makes `check:import-purity` import it and the
// import terminates the importing process. The enumerated cases below are in
// this same file and nothing outside it needs these, so local is correct
// rather than a workaround.
const HOST_SILENT = 'host-silent'
const PAGE_AT_FAULT = 'page'

/**
 * `{ verdict, why }` from the page's Open-Meteo resource entries.
 *
 * `requests`: `{ url, start, ms, status }` per entry, straight from
 * PerformanceResourceTiming. `expectedUrls`: what `forecastUrl` produces for the
 * venues on this slate that the table knows.
 */
const attributeWeather = ({ requests, expectedUrls }) => {
  if (!Array.isArray(requests)) throw new TypeError('attributeWeather: requests is required')
  if (!(expectedUrls instanceof Set)) throw new TypeError('attributeWeather: expectedUrls must be a Set')

  // No request at all is the page's failure, not the host's. There is nothing
  // for a host to be silent about.
  if (requests.length === 0)
    return { verdict: PAGE_AT_FAULT, why: 'no Open-Meteo request was made at all' }

  const sameQuery = (a, b) => {
    const q = (u) => {
      try {
        const x = new global.URL(u)
        return x.origin + x.pathname + '?' +
          [...x.searchParams.entries()].map(([k, v]) => `${k}=${v}`).sort().join('&')
      } catch { return null }
    }
    const qa = q(a)
    return qa !== null && qa === q(b)
  }
  const unexplained = requests.filter(r => ![...expectedUrls].some(u => sameQuery(r.url, u)))
  if (unexplained.length)
    return { verdict: PAGE_AT_FAULT,
             why: `requested ${unexplained.length} URL(s) the venue table does not explain, e.g. ${unexplained[0].url}` }

  const answered = requests.filter(r => r.status > 0)
  if (answered.length)
    return { verdict: PAGE_AT_FAULT,
             why: `${answered.length} request(s) received a response (${[...new Set(answered.map(r => r.status))].join(', ')})` }

  // WHAT IS DELIBERATELY NOT ASKED HERE: whether the page ran each request to the
  // budget it was entitled to.
  //
  // It was, in the first version of this function, and the rule was wrong. A
  // request the PAGE abandons early and one the NETWORK refuses early are the
  // same resource entry — `status 0`, short duration. `probe-open-meteo-egress`
  // measured both shapes: a dead hostname ends in 13ms and a request aborted at
  // its cap ends at 4000ms, and neither carries a status. A refusal is the
  // clearest possible third-party failure, so a rule that reads "short" as "the
  // page gave up" fails exactly the case this branch exists to tolerate — and the
  // dev sandbox, which refuses Open-Meteo at the proxy, is that case.
  //
  // A page that shrinks its own timeout is therefore NOT caught here. It is
  // caught by `check:weather-burst`, which drives the wave, budget and retry
  // logic against mocked timings and asserts them directly ("...and it is asked
  // exactly twice, never more", "a 429 is NOT retried"). That is the right place
  // for it: those are properties of the code, not of a live slate.
  const first = Math.min(...requests.map(r => r.start))
  const span = Math.max(...requests.map(r => r.start + r.ms)) - first
  return { verdict: HOST_SILENT,
           why: `${requests.length} request(s) over ${span}ms, none received any response ` +
                `(the slate's budget is ${slateDeadlineMs}ms, each request's cap ${requestCapMs}ms)` }
}

const PLACEHOLDER_VENUES = new Set(['TBC', 'TBD', '—', '-', ''])
const realVenues = vs => [...new Set(vs)].filter(v => !PLACEHOLDER_VENUES.has((v || '').trim()))
// The real venues that SHOULD have weather: every one that is not a recorded
// indoor arena. (No table entry is an arena: Suite's "no table venue is also
// recorded as an indoor arena" holds that.) An arena has no weather by design, so an NHL/NBA-only slate is
// nothing to observe. A stadium the table lacks stays observable, and so stays
// a coverage gap. docs/CC-CMD-2026-10-20-live-slate-venue-coverage.md
const observableVenues = vs => realVenues(vs).filter(v => !isIndoorArena(v))

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

  // The page's OWN account of why, read before the browser closes.
  //
  // verify 159 (2026-08-27) reported "13 known venue(s) on this slate, 0
  // chip(s) filled" and could say nothing further, because that is all this
  // script measured. The page knew more: `fetchOne` writes "Fenway Park: HTTP
  // 429" per request. `EveryFetchFailed` used to drop those on the floor and
  // now carries them into `.wx-error__why`, so the failure can name its own
  // cause instead of leaving the next session to guess at it.
  if (filled.length < expected) {
    pageAccount = (await page.$$eval('#panel-weather .wx-error, #panel-weather .wx-error__why, ' +
      '#panel-weather .wx-partial, #panel-weather .wx-empty, #panel-weather .wx-idle',
      ns => ns.map(n => (n.textContent || '').trim()).filter(Boolean))).join(' | ')
  }

  // The browser's own timing for every Open-Meteo request, which is the arbiter
  // for why chips go missing.
  //
  // The page's failure reasons say a request timed out; they cannot say whether
  // the ones that SUCCEEDED were fast or slow, and that difference is the whole
  // diagnosis. Two runs lost exactly one wave's worth of chips — the first —
  // while later waves answered comfortably (33034815620: 13 venues in waves of
  // 4/4/4/1, four lost; 33076011728: 6 venues in waves of 4/2, four lost).
  // Raising the cap 4s -> 8s moved the failures from 4001ms to 8000ms and fixed
  // none, which is the shape of a connection-setup cost rather than a slow
  // service. This line is what confirms or refutes that on the next run.
  //
  // `startTime` and `duration` only. The connection phases (domainLookupStart,
  // connectEnd, secureConnectionStart) read ZERO for a cross-origin resource
  // unless the server sends `Timing-Allow-Origin`, and Open-Meteo does not — so
  // reporting them would be reporting zeroes as measurements. Start time
  // separates the waves and duration is what each one cost, which is enough to
  // tell "wave 1 was slow" from "everything was slow".
  //
  // `responseStatus` and the full `name` are captured alongside, because the
  // attribution above needs WHICH url and WHETHER anything answered, and both
  // were measured usable on this browser for a cross-origin resource with no
  // Timing-Allow-Origin.
  wxRequests = await page.evaluate(() =>
    performance.getEntriesByType('resource')
      .filter(e => e.name.includes('open-meteo'))
      .map(e => ({
        url: e.name,
        start: Math.round(e.startTime),
        ms: Math.round(e.duration),
        status: e.responseStatus ?? 0,
      })))
  wxTiming = wxRequests.map(r => `${r.start}+${r.ms}ms`).join(' ')
}

// Attribute empty chips: if they did not fill, was Open-Meteo reachable at all?
// A direct probe — Fenway Park, the same coordinate weather-live-check uses — so
// "the service is down" is DISTINGUISHED from "the page rendered no chip while the
// service was up". Only the former is tolerated, and only when the flag is set;
// the latter is a real regression and stays a failure. The probe runs solely when
// there is an empty-chip failure to explain, so a healthy slate pays nothing.
let openMeteoDown = false
// The probe's STATUS, not just its verdict. `!r.ok` collapses 429, 503 and a
// thrown connection error into one boolean, and those are the three things the
// probe exists to tell apart. It is also worth reading literally: this probe is
// one request from node, after the 20s wait has already elapsed, and a service
// that refused a burst can answer a single late request perfectly well. So it
// reports what it saw and does not pretend to have measured the page's fate.
let probeSaw = 'not probed'
if (!pinned && (waitErr !== null || filled.length < expected)) {
  const probe = coordinates(42.3467, -71.0972)
  try {
    const r = await fetch(forecastUrl(probe), { signal: AbortSignal.timeout(15_000) })
    openMeteoDown = !r.ok
    probeSaw = `HTTP ${r.status}`
  } catch (e) { openMeteoDown = true; probeSaw = `unreachable — ${e.message}` }
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
// The attribution, enumerated, BEFORE anything is decided through it — the same
// discipline the venue predicate gets directly below, and for the same reason: a
// tolerance that is wrong in the loosening direction prints a warning and passes.
// The cases that must keep FAILING are the ones written first.
const U = (lat, lon) => forecastUrl(coordinates(lat, lon))
const FENWAY = U(42.3467, -71.0972)
const WRIGLEY = U(41.9484, -87.6553)
const EXPECTED = new Set([FENWAY, WRIGLEY])
// Run 250's actual shape: two waves, the second budget-clamped, nothing answered.
const RUN_250 = [
  { url: FENWAY, start: 642, ms: 8000, status: 0 },
  { url: WRIGLEY, start: 642, ms: 8000, status: 0 },
  { url: FENWAY, start: 8643, ms: 6000, status: 0 },
  { url: WRIGLEY, start: 8644, ms: 5999, status: 0 },
]
const ATTRIB_CASES = [
  [{ requests: RUN_250, expectedUrls: EXPECTED }, HOST_SILENT,
   "run 250's own shape: two waves, the second budget-clamped, nothing answered"],
  [{ requests: [], expectedUrls: EXPECTED }, PAGE_AT_FAULT,
   'NO REQUEST AT ALL is the page, not the host — there is nothing to be silent about'],
  [{ requests: [{ url: FENWAY, start: 642, ms: 8000, status: 200 }], expectedUrls: EXPECTED }, PAGE_AT_FAULT,
   'THE HOST ANSWERED AND NO CHIP FILLED — the regression this must never tolerate'],
  [{ requests: [{ url: FENWAY, start: 642, ms: 8000, status: 429 }], expectedUrls: EXPECTED }, PAGE_AT_FAULT,
   'a 429 is the host TALKING, not the host silent'],
  [{ requests: [{ url: U(1.0, 2.0), start: 642, ms: 8000, status: 0 }], expectedUrls: EXPECTED }, PAGE_AT_FAULT,
   'a coordinate no venue on this slate explains'],
  [{ requests: [{ url: 'https://api.open-meteo.com/v1/forecast?latitude=42.3467', start: 1, ms: 8000, status: 0 }], expectedUrls: EXPECTED }, PAGE_AT_FAULT,
   'the right host and place with the WRONG FIELDS is not the right request'],
  [{ requests: [{ url: FENWAY, start: 642, ms: 13, status: 0 }], expectedUrls: EXPECTED }, HOST_SILENT,
   'A REFUSAL IN 13ms IS THE HOST, NOT THE PAGE — the sandbox and a dead DNS both look like this'],
  [{ requests: [{ url: FENWAY, start: 0, ms: 8000, status: 0 },
                { url: WRIGLEY, start: 13000, ms: 900, status: 0 }], expectedUrls: EXPECTED }, HOST_SILENT,
   'a late wave with almost no budget left is entitled to abort early'],
]
const attribWrong = ATTRIB_CASES.filter(([input, want]) => attributeWeather(input).verdict !== want)
check('the weather attribution holds on every enumerated case',
  attribWrong.length === 0,
  attribWrong.map(([input, want, why]) => `${why}: got ${attributeWeather(input).verdict}, want ${want}`).join('; ')
    || `${ATTRIB_CASES.length} cases`)

// The arena predicate, enumerated the same way and for the same reason: the
// cases that must keep FAILING are written first.
const ARENA_CASES = [
  [['Pitbull Stadium'], 1, 'a stadium the table lacks IS a coverage gap, never an arena'],
  [['Bell Centre', 'Pitbull Stadium'], 1, 'an arena beside an uncovered stadium: the stadium still counts'],
  [['Some Unlisted Arena'], 1, 'an unrecorded name is not indoor, whatever it is called'],
  [['Bell Centre', 'Madison Square Garden'], 0, 'the 2026-10-20 NHL/NBA arenas: nothing to observe'],
  [['TBC', 'Frost Bank Center'], 0, 'a placeholder beside an arena: nothing to observe'],
  [['Bell Centre', 'Anfield'], 1, 'an arena beside a table venue: the table venue counts'],
]
const arenaWrong = ARENA_CASES.filter(([vs, want]) => observableVenues(vs).length !== want)
check('the indoor-arena predicate holds on every enumerated case',
  arenaWrong.length === 0,
  arenaWrong.map(([vs, want, why]) => `${why}: ${observableVenues(vs).length} observable, want ${want}`).join('; ')
    || `${ARENA_CASES.length} cases`)

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
console.log(`built from:    ${builtFrom}`)
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
  // The timings, printed on EVERY live run and not only on a failing one.
  //
  // They were first shipped inside the chip failure's detail string, which meant
  // the arbiter went silent exactly when the thing it was built to attribute
  // started working: run 33076464112 passed 22/22 with the render step down from
  // 23s to 2s, and the only evidence that preconnect was the cause was the step
  // DURATION — an inference, not the measurement. That is the silent-success
  // shape this repo keeps finding, committed inside the instrument meant to
  // catch it. A measurement that only speaks on failure cannot confirm a fix.
  console.log(`open-meteo (start+duration): ${wxTiming || 'no request recorded'}\n`)

  // A slate can carry venues that are not venues. `real` is the denominator:
  // without it, "no venue on this slate is in the table" and "this slate names
  // no venue at all" are the same failure, and only the first is one.
  const real = realVenues(cardVenues)
  const outdoor = observableVenues(cardVenues)
  const observable = outdoor.length > 0

  // The venue-table coverage is independent of Open-Meteo — it is about the table,
  // not the service — so it is asserted whether or not the service answered.
  if (real.length > 0 && !observable) {
    // Every real venue is a recorded indoor arena. Loud, never a silent pass,
    // and the list is printed so an arena recorded by mistake is visible.
    console.log('::warning::every real venue on this slate is a recorded indoor arena ' +
      `(${real.length}: ${real.join(', ')}) — the venue-table and weather-chip checks are ` +
      'skipped. An arena has no weather by design, so this is nothing to observe, not a coverage gap.')
  } else if (!observable) {
    // Loud, and never a silent pass. The count is printed so a slate that is
    // quietly ALL placeholders for days is visible rather than inferred.
    console.log('::warning::no card on this slate names a real venue ' +
      `(${cardVenues.length} card(s): ${[...new Set(cardVenues)].join(', ') || 'none with a venue'}) — ` +
      'the venue-table and weather-chip checks are skipped. A placeholder venue has no ' +
      'weather reading in principle, so this is nothing to observe, not a coverage gap.')
  } else {
  check('the venue table covers at least one venue on this slate', expected > 0,
    `${outdoor.join(', ')} — none of them in the ${known.size}-entry table ` +
    `(${real.length - outdoor.length} recorded indoor arena(s) not counted)`)

  // What the page SHOULD have asked for: the venues on this slate the table
  // knows, through the same `forecastUrl` the page calls. Built from the venue
  // records rather than from the page, so a page requesting the wrong place
  // cannot define its own expectation.
  const byName = new Map(Array.from(weatherVenues).map(v => [v.Name, v]))
  const expectedUrls = new Set(cardVenues.filter(v => known.has(v))
    .map(n => forecastUrl(byName.get(n).Where)))
  // ONLY WHEN THERE IS A FAILURE TO ATTRIBUTE.
  //
  // Computed unconditionally in the first version of this, and verify run 254
  // showed why that is wrong: the chips filled, both live checks passed, and the
  // line printed was `attribution: page — 14 request(s) received a response (200)
  // and no chip filled`. Every clause of that is true except the last, and the
  // last is the one that makes it a finding. An instrument that reports a fault
  // on a healthy run is the same collapse it was written to prevent, one level
  // up: `page` meant both "the host answered and nothing rendered" and "the host
  // answered and everything is fine".
  //
  // The node probe it replaces had this right — "the probe runs solely when there
  // is an empty-chip failure to explain, so a healthy slate pays nothing" — and
  // the condition here is the same one.
  const unexplained = waitErr !== null || filled.length < expected
  const attribution = unexplained
    ? attributeWeather({ requests: wxRequests, expectedUrls })
    : { verdict: null, why: 'not computed — every expected chip filled' }
  if (unexplained) console.log(`attribution: ${attribution.verdict} — ${attribution.why}\n`)

  if (TOLERATE && attribution.verdict === HOST_SILENT) {
    // The page asked for the right URLs, ran every request to the budget it was
    // entitled to, and received no response at all. The chips could not fill
    // through no fault of the page, so the four live-weather assertions are
    // SKIPPED — loudly, as a warning, never a silent pass. Tolerated only because
    // verify passes the flag; every other job asserts.
    //
    // A broken chip while the host is ANSWERING never reaches this branch, and
    // neither does a malformed URL or a page that abandons its own requests —
    // which the probe this replaced would both have tolerated whenever the host
    // happened to be slow.
    console.log('::warning::Open-Meteo answered nothing during the page\'s window — the four live ' +
      `weather-chip checks are skipped (${expected} known venue(s) on this slate, ${filled.length} chip(s) ` +
      `filled; ${attribution.why}; the late node probe saw ${probeSaw}, which is a later moment and not ` +
      `evidence about the page's window; the page reported: ${pageAccount || 'nothing'}). ` +
      'This is a third-party outage, not a page defect; verify is not gated on it.')
  } else {
    check('the chips all filled within the wait', waitErr === null, waitErr)
    check('every card whose venue the table knows carries a live chip',
      expected > 0 && filled.length === expected,
      `${expected} known venue(s) on this slate, ${filled.length} chip(s) filled. ` +
      `Attribution from the page's own window: ${attribution.verdict} — ${attribution.why}. ` +
      `A late node probe saw: ${probeSaw} (a later moment, not evidence about the page's window). ` +
      `The page reported: ${pageAccount || '(nothing — the panel said nothing at all)'}. ` +
      `Request timings (start+duration): ${wxTiming || '(no Open-Meteo request was made at all)'}. ` +
      `Page built from: ${builtFrom}`)
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

finish(summarize())
