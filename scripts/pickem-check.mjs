// Pick'em, driven in a real browser against a synthetic multi-sport slate.
//
// Both committed captures are single-sport and two games long, so neither can
// reach the sport chips, the counts, a decided pick, a draw, or the row layout.
// This intercepts the relay at the network layer — the same technique
// nav-check.mjs uses, and it needs no egress — and serves a slate built to hit
// every case at once:
//
//   * four sports, so the chips and their counts are real
//   * "Rockies @ Diamondbacks", the exact fixture whose row breaks on the
//     production screen, so the layout claim is tested on the value that broke it
//   * a finished game, so a pick can be graded
//   * a DRAWN game, so the not-a-boolean case is exercised
//   * a game in progress, which must never grade
//
// Usage:  node scripts/pickem-check.mjs

import { chromium } from 'playwright'
import { existsSync } from 'node:fs'
import { createChecks, fieldDay } from './checks.mjs'

const { check, summarize } = createChecks()
// The slate's date, which MUST be in the future.
//
// A past date sweeps every fixture to Final through the date-passed rule, and
// then "in progress reads LIVE" gets CORRECT, "a 0-0 fixture that has not
// kicked off reads PENDING" gets DRAWN, and the banner counts a slate that no
// longer exists. All three assert about game states the page can no longer be
// in.
//
// This was the literal '2026-08-12', with a comment saying it was "deliberately
// a future date". That was true when it was written and stopped being true at
// midnight ET on the 13th — at which point main went red, for a reason nothing
// in the diff explains, because no diff caused it.
//
// Third time this repo has found that shape: `GATE_DAY` in the gate's outbox
// row, `NOW` in zone-check, and now this. Derived from the FIELD day rather
// than pinned, so it cannot expire again. Noon UTC to stay clear of the DST
// boundary when adding a day.
const DATE = (() => {
  const d = new Date(`${fieldDay()}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
})()

const game = (id, sport, home, away, extra = {}) => ({
  id, sport, league: sport, date: DATE, home, away,
  home_score: null, away_score: null, venue: 'Somewhere',
  streams: 'MLB.TV', note: null, tags: null, crew: null, local_note: null,
  created_at: `${DATE} 10:00:00`, opening_odds: null, closing_odds: null,
  drama_peak: null, drama_arc: null, espn_event_id: null,
  went_to_ot: null, finalized_at: null, start_time: `${DATE}T17:00Z`,
  ...extra,
})

// NOTE: `games` is keyed regular/postseason, NOT by sport — the sport lives on
// each game. The first version of this fixture grouped by sport, decoded to
// zero games, and the panel dutifully rendered "0 game(s) on the slate" without
// erroring. Worth recording: a wrong-shaped fixture produced a plausible empty
// page rather than a failure.
const SLATE = {
  ok: true,
  date: DATE,
  games: {
    regular: [
      // The row that wraps in production. Kept verbatim.
      game('MLB_x_rockies_diamondbacks', 'MLB', 'Diamondbacks', 'Rockies'),
      game('MLB_x_mets_braves', 'MLB', 'Braves', 'Mets'),
      // Finished: home 5, away 2, so Home is the winning side.
      game('MLB_x_reds_phillies', 'MLB', 'Phillies', 'Reds',
        { home_score: 5, away_score: 2, finalized_at: `${DATE} 22:00:00` }),
      // In progress. A pick here must read LIVE and must never be graded, even
      // though a score exists and one side is ahead.
      // Started, unfinished. The start_time must be in the PAST for this to be
      // in progress — DATE is deliberately a future date so nothing is swept up
      // by the date-passed rule, so kickoff has to be pinned explicitly.
      game('MLB_x_rays_athletics', 'MLB', 'Athletics', 'Rays',
        { home_score: 3, away_score: 1, start_time: '2020-01-01T00:00Z' }),
      game('WNBA_x_a_b', 'WNBA', 'Aces', 'Liberty'),
      // A draw. Neither correct nor wrong — forcing it into a boolean would
      // grade every drawn game as a loss.
      game('MLS_x_c_d', 'MLS', 'Union', 'Fire',
        { home_score: 1, away_score: 1, finalized_at: `${DATE} 22:00:00` }),
      game('EFL_x_e_f', 'EFL Cup', 'Arsenal', 'Chelsea'),
      // Placeholder zeroes on a fixture that has not kicked off. This is
      // field-playground's live CFL bug in fixture form: its route writes 0 for
      // all 47 unplayed fixtures, and a status derived from score PRESENCE
      // reads every one of them as live.
      game('MLB_x_unplayed_zeroes', 'MLB', 'Mariners', 'Angels',
        { home_score: 0, away_score: 0, start_time: '2099-01-01T00:00Z' }),
    ],
    postseason: [],
  },
  briefs: [], series: [], standings: [],
}

const sessionChromium = '/opt/pw-browsers/chromium'
const browser = await chromium.launch(
  existsSync(sessionChromium) ? { executablePath: sessionChromium } : {})
const page = await browser.newPage({ viewport: { width: 900, height: 1200 } })

const pageErrors = []
page.on('pageerror', e => pageErrors.push(String(e)))

await page.route('**/context/date/**', route =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SLATE) }))
await page.route('**/analytics/newspaper/**', route =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ pick: null }) }))

const open = async () => {
  await page.goto(`http://localhost:8080/?date=${DATE}`, { waitUntil: 'networkidle' })
  await page.click('#tab-pickem')
}
await open()

const banner = () => page.textContent('.pk-banner')
const chips = () => page.$$eval('.pk-sport', cs => cs.map(c => c.textContent.trim()))
const rowIds = () => page.$$eval('#panel-pickem .pk-row', rs => rs.map(r => r.dataset.game))

// --- the sport chips ---------------------------------------------------------

const chipText = await chips()
check('every sport on the slate gets a chip', chipText.length === 4,
  `chips: ${JSON.stringify(chipText)}`)

check('chips carry their game counts',
  chipText.some(c => /MLB\s*5/.test(c)) && chipText.some(c => /WNBA\s*1/.test(c)),
  `chips: ${JSON.stringify(chipText)}`)

check('one sport chip is selected',
  (await page.$$eval('.pk-sport[aria-selected="true"]', cs => cs.length)) === 1,
  'the sport chips are a tablist and exactly one is current')

// The production screen shows 18 across the chips and 12 in the banner, with
// nothing saying they count different things.
const legend = await page.textContent('.pk-legend')
check('the legend says what each number counts',
  /Chips count games/.test(legend) && /counts picks/.test(legend),
  `legend: ${legend}`)

check('the banner counts games while nothing is picked',
  /No picks yet — 8 game\(s\)/.test(await banner()),
  `banner: ${await banner()}`)

// --- switching sports --------------------------------------------------------

await page.click('.pk-sport:has-text("WNBA")')
check('selecting a sport swaps the rows', (await rowIds()).length === 1,
  `rows: ${JSON.stringify(await rowIds())}`)
check('the banner still counts the WHOLE slate, not the selected sport',
  /8 game\(s\)/.test(await banner()),
  `banner scoped to one tab would change as you browse: ${await banner()}`)

await page.click('.pk-sport:has-text("MLB")')

// --- the row layout, on the value that breaks in production ------------------

// Same visual line = the chip did not wrap. Compared per row rather than
// against a constant, so this holds at any font size.
const wrapReport = await page.$$eval('#panel-pickem .pk-row', rows =>
  rows.map(r => {
    const matchup = r.querySelector('.pk-row__matchup').getBoundingClientRect()
    const chip = r.querySelector('.pk-chip').getBoundingClientRect()
    return {
      game: r.dataset.game,
      // Centres within a couple of pixels means one line.
      offset: Math.abs((matchup.top + matchup.height / 2) - (chip.top + chip.height / 2)),
      text: r.querySelector('.pk-row__matchup').textContent,
    }
  }))

const wrapped = wrapReport.filter(r => r.offset > 3)
check('no row pushes its status chip onto a second line',
  wrapped.length === 0,
  `wrapped: ${wrapped.map(w => `${w.text} (${w.offset.toFixed(1)}px)`).join(', ')}`)

check('the Rockies @ Diamondbacks row specifically stays on one line',
  wrapReport.find(r => /Diamondbacks/.test(r.text))?.offset <= 3,
  'this is the exact fixture whose row breaks on the production screen')

// --- picking -----------------------------------------------------------------

const rowFor = id => `#panel-pickem .pk-row[data-game="${id}"]`
const chipOf = async id => (await page.textContent(`${rowFor(id)} .pk-chip`)).trim()

check('an unpicked game reads NO PICK', await chipOf('MLB_x_mets_braves') === 'NO PICK',
  `chip: ${await chipOf('MLB_x_mets_braves')}`)

await page.click(`${rowFor('MLB_x_mets_braves')} .pk-side >> nth=0`)
check('picking a side marks it pending',
  await chipOf('MLB_x_mets_braves') === 'PENDING',
  `chip: ${await chipOf('MLB_x_mets_braves')}`)

check('the chosen side is announced, not only coloured',
  (await page.getAttribute(`${rowFor('MLB_x_mets_braves')} .pk-side >> nth=0`, 'aria-pressed')) === 'true',
  'aria-pressed is what makes this control mean anything to a screen reader')

check('the banner switches to counting picks',
  /1 of your 1 pick\(s\) still pending or live/.test(await banner()),
  `banner: ${await banner()}`)

// A misclick must be undoable — "no pick" is a state the model already has.
await page.click(`${rowFor('MLB_x_mets_braves')} .pk-side >> nth=0`)
check('clicking the chosen side again clears the pick',
  await chipOf('MLB_x_mets_braves') === 'NO PICK',
  `chip: ${await chipOf('MLB_x_mets_braves')}`)

// --- grading -----------------------------------------------------------------

// Finished game, home won 5-2. Home is the second button (away is listed first
// for MLB's "Away @ Home" reading).
await page.click(`${rowFor('MLB_x_reds_phillies')} .pk-side >> nth=1`)
check('picking the winner of a finished game reads CORRECT',
  await chipOf('MLB_x_reds_phillies') === 'CORRECT',
  `chip: ${await chipOf('MLB_x_reds_phillies')}`)

await page.click(`${rowFor('MLB_x_reds_phillies')} .pk-side >> nth=0`)
check('picking the loser reads WRONG',
  await chipOf('MLB_x_reds_phillies') === 'WRONG',
  `chip: ${await chipOf('MLB_x_reds_phillies')}`)

// THE INVARIANT. This game has a score and a leader, and it is still going.
await page.click(`${rowFor('MLB_x_rays_athletics')} .pk-side >> nth=1`)
const liveChip = await chipOf('MLB_x_rays_athletics')
check('a pick on a game IN PROGRESS reads LIVE, never CORRECT or WRONG',
  liveChip === 'LIVE',
  `chip: ${liveChip} — the leader of an unfinished game is not a winner`)

// A draw is neither.
await page.click('.pk-sport:has-text("MLS")')
await page.click(`${rowFor('MLS_x_c_d')} .pk-side >> nth=0`)
check('a pick on a DRAWN game is neither correct nor wrong',
  await chipOf('MLS_x_c_d') === 'DRAWN',
  `chip: ${await chipOf('MLS_x_c_d')} — a boolean would grade every draw as a loss`)

check('the banner reports right, wrong and drawn separately',
  /1 right, 0 wrong|0 right, 1 wrong/.test(await banner()) && /drawn/.test(await banner()),
  `banner: ${await banner()}`)

// --- status comes from kickoff, not from a score existing --------------------

await page.click('.pk-sport:has-text("MLB")')
await page.click(`${rowFor('MLB_x_unplayed_zeroes')} .pk-side >> nth=0`)
check('a 0-0 fixture that has not kicked off reads PENDING, not LIVE',
  await chipOf('MLB_x_unplayed_zeroes') === 'PENDING',
  `chip: ${await chipOf('MLB_x_unplayed_zeroes')} — placeholder zeroes were read as a live scoreline`)

// --- the sport chips are a real tablist, not a row of buttons ----------------

await page.click('.pk-sport:has-text("EFL Cup")')
await page.focus('.pk-sport[aria-selected="true"]')
await page.keyboard.press('ArrowRight')
const afterArrow = await page.$eval('.pk-sport[aria-selected="true"]', c => c.textContent)
check('ArrowRight moves between sport chips',
  !/EFL Cup/.test(afterArrow),
  `still on ${afterArrow} — the chips carried role="tab" but responded to clicks only`)

await page.keyboard.press('End')
const afterEnd = await page.$eval('.pk-sport[aria-selected="true"]', c => c.textContent)
check('End jumps to the last sport chip', /WNBA/.test(afterEnd), `landed on ${afterEnd}`)

await page.click('.pk-sport:has-text("MLS")')

// --- persistence -------------------------------------------------------------

const before = await banner()
await open()
check('picks survive a reload', (await banner()) === before,
  `before: ${before}\n      → after:  ${await banner()}`)

check('no page errors throughout', pageErrors.length === 0, pageErrors.join(' | '))

await browser.close()
process.exit(summarize() === 0 ? 0 : 1)
