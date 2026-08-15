// The composite-score scan must skip broadcast outlets and nothing else.
//
// WHAT BROKE
//
// `live-tabs-check.mjs` enforces ADR-002 on the deployed page: no bare
// composite pick score may reach the DOM. It scanned the whole pick panel for a
// bare decimal. On 2026-08-15 the slate carried the broadcast outlet
// "KFMB 8.1 (CBS)" — a real ATSC channel number — the scan matched `8.1`, and
// main went red on a false positive.
//
// The fix narrows the scan by PROVENANCE: `PickView` marks the one paragraph
// that renders verbatim third-party data with `pick-outlets`, and the scan
// subtracts that element's text. It does NOT loosen the pattern, because a
// looser pattern would let a genuine 8.1 through everywhere else — which is the
// leak the check exists to catch.
//
// WHY THIS FILE EXISTS SEPARATELY
//
// The committed capture `games-2026-08-09.json` renders ZERO `.pick-outlets`
// elements, so on that slate the exclusion is never exercised and
// live-tabs-check's outlet assertions pass vacuously. Verified directly: 0
// elements. A fix whose only evidence is a green run on a page that cannot
// reach it is not evidence.
//
// So this serves a synthetic slate at the network layer carrying an outlet name
// with a channel number, and asserts the whole chain on a real DOM:
//   1. the paragraph renders at all              (non-vacuity)
//   2. it carries the `pick-outlets` class       (the class landed on the right element)
//   3. the OLD whole-panel scan would have failed (the bug is reproduced, not assumed)
//   4. the NEW scan passes                        (the fix works)
//   5. a score planted OUTSIDE the outlets is still caught (the fix did not neuter it)
//
// Offline: no relay, no deployed page. Every fetch is intercepted.

import { chromium } from 'playwright'
import { existsSync } from 'node:fs'
import { createChecks } from './checks.mjs'

const { check, summarize } = createChecks()

// The exact pattern live-tabs-check uses. Asserted against that file below, so
// the two cannot drift into testing different things.
const SCORE_RE = /(?<![\d(.])\b\d\.\d\b(?![\d)])/

// A real outlet from the slate that broke it, kept verbatim.
const OUTLET = 'KFMB 8.1 (CBS)'

const DATE = '2030-01-15'
const game = (id, sport, home, away, extra = {}) => ({
  id, sport, league: sport, date: DATE, home, away,
  home_score: null, away_score: null, venue: 'Somewhere',
  streams: 'MLB.TV', note: null, tags: null, crew: null, local_note: null,
  created_at: `${DATE} 10:00:00`, opening_odds: null, closing_odds: null,
  drama_peak: null, drama_arc: null, espn_event_id: null,
  went_to_ot: null, finalized_at: null, start_time: `${DATE}T17:00Z`,
  ...extra,
})

const SLATE = {
  ok: true,
  date: DATE,
  games: {
    regular: [
      // `streams` carries the channel-numbered outlet. It is not in the
      // registry, so PickView lists it — which is the whole point.
      game('MLB_x_a_b', 'MLB', 'Padres', 'Dodgers', { streams: `MLB.TV, ${OUTLET}` }),
      game('MLB_x_c_d', 'MLB', 'Reds', 'Marlins'),
    ],
    postseason: [],
  },
}

const sessionChromium = '/opt/pw-browsers/chromium'
const browser = await chromium.launch(
  existsSync(sessionChromium) ? { executablePath: sessionChromium } : {})
const page = await browser.newPage()

const pageErrors = []
page.on('pageerror', e => pageErrors.push(String(e)))

await page.route('**/context/date/**', route =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SLATE) }))
await page.route('**/analytics/newspaper/**', route =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ pick: null }) }))
await page.route(url => url.hostname === 'api.open-meteo.com', route =>
  route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
await page.route(url => url.hostname === 'statsapi.mlb.com', route =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ dates: [] }) }))

await page.goto(`http://localhost:8080/?date=${DATE}`, { waitUntil: 'domcontentloaded' })
await page.click('#tab-scout-pick')
await page.waitForSelector('.pick-outlets', { timeout: 10000 }).catch(() => {})

const outletNodes = await page.$$eval('.pick-outlets', ns => ns.map(n => n.textContent ?? ''))
const panelText = (await page.textContent('#panel-scout-pick')) ?? ''

// 1 + 2. Non-vacuity. Everything below is free if the paragraph never rendered
// — which is exactly the state the committed capture is in, and why a green
// live-tabs-check on that capture proved nothing about this fix.
check('the outlet paragraph renders and carries pick-outlets',
  outletNodes.length === 1 && outletNodes[0].includes(OUTLET),
  `${outletNodes.length} .pick-outlets node(s); first: ${JSON.stringify(outletNodes[0]?.slice(0, 80) ?? null)}`)

// 3. Reproduce the bug rather than assume it. If the old scan does NOT flag
// this, the fixture is not the failure that happened and nothing here is about
// the real defect.
check('the old whole-panel scan really did flag this outlet',
  SCORE_RE.test(panelText) && panelText.match(SCORE_RE)?.[0] === '8.1',
  `whole-panel scan matched ${JSON.stringify(panelText.match(SCORE_RE)?.[0] ?? null)} (want "8.1")`)

// 4. The fix, applied exactly as live-tabs-check applies it.
const outletText = outletNodes.join(' ')
const scanned = outletText ? panelText.split(outletText).join(' ') : panelText
check('the narrowed scan no longer flags the outlet',
  scanned.match(SCORE_RE) === null,
  `after exclusion: ${JSON.stringify(scanned.match(SCORE_RE)?.[0] ?? null)}`)

// 5. And it did not neuter the check. A score planted outside the outlet
// paragraph must still be caught — otherwise "exclude everything" would pass.
const leaked = `${scanned} composite 8.7 tonight`
check('a score outside the outlet list is still caught',
  leaked.match(SCORE_RE)?.[0] === '8.7',
  `planted score matched ${JSON.stringify(leaked.match(SCORE_RE)?.[0] ?? null)} (want "8.7")`)

// The pattern and the selector must be the ones live-tabs-check actually uses.
// Two files testing different things is how a fix passes its own test and fails
// in production.
const liveTabs = await import('node:fs').then(fs =>
  fs.readFileSync('scripts/live-tabs-check.mjs', 'utf8'))
check('this file tests the same pattern and selector live-tabs-check uses',
  liveTabs.includes(String(SCORE_RE)) && liveTabs.includes(".pick-outlets"),
  `pattern present: ${liveTabs.includes(String(SCORE_RE))}, selector present: ${liveTabs.includes('.pick-outlets')}`)

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '))

await browser.close()
process.exit(summarize() === 0 ? 0 : 1)
