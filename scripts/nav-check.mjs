// Drives the two things the pinned render checks structurally cannot: sport
// grouping across more than one sport, and real date navigation.
//
// Why a separate probe rather than more assertions in render-check.mjs:
//
//   1. Both committed captures are single-sport (AFL, MLB). Grouping "works" on
//      them in the sense that one group renders — which is exactly the shape a
//      broken grouping would also produce.
//   2. Both render checks load `?data=<capture>`, which PINS the page to one
//      committed day and deliberately disables the date controls. They can
//      never exercise navigation, by design.
//
// So this probe intercepts the relay at the network layer and serves slates it
// controls. That buys three things: it runs offline (this sandbox cannot reach
// *.workers.dev, and route interception never touches the network), no synthetic
// payload is ever committed into data/ or shipped in public/, and the game
// records themselves stay real — they are read out of the two committed
// captures and recombined, not invented.
//
// The invariant under test is the one that survives environment differences:
// after any navigation, the number of cards on screen must equal the number of
// games the decoder just reported. A slate that fails to tear down shows as
// cards > decoded, which is the ambient-panel skeleton failure this repo has
// now hit twice.
//
// This probe was mutation-tested rather than assumed. Deleting the two teardown
// lines from Program.fs and re-running took it from 18/18 to 11/18: cards
// accumulated 4 -> 6 -> 12 -> 16 -> 18 while the status line still read
// "decoded 2". Worth naming what stayed green through all of that — "no page or
// console errors" passed on every run. Nothing throws when a slate fails to
// tear down, which is why this needed a counting assertion and not error
// monitoring.
//
// One caveat, so the coverage is not overstated: the DOM assertions prove the
// `mount.innerHTML <- ""` reset. `disposePrevious()` governs effect LIFETIME,
// and a leaked effect updating a detached node is invisible from the DOM — it
// is not covered here, and is kept on the reasoning that a signal graph nobody
// disposes is a leak whether or not a test can see it.

import { readFileSync, existsSync } from 'node:fs'
import { chromium } from 'playwright'
import { createChecks, finish } from './checks.mjs'

const ROOT = new URL('..', import.meta.url).pathname
const URL_BASE = process.env.URL || 'http://localhost:8080/'

const read = name => JSON.parse(readFileSync(`${ROOT}data/${name}.json`, 'utf8'))
const AFL = read('context-2026-05-15').games.regular
const MLB = read('games-2026-08-09').games.regular

const pad = n => String(n).padStart(2, '0')
const iso = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
const shift = (base, days) => {
  const d = new Date(`${base}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return iso(d)
}

// The anchor is whatever date the PAGE asks for first, not a date computed
// here. Those are two different clocks — this script's Node process and the
// browser's `Desk.fieldToday()` — and a run that straddles a day boundary would
// have them disagree by a day. Keying a fixed date map off the local clock
// would then serve a 404 for the date the page actually wanted, and the page
// would quietly fall back to the committed capture, leaving every assertion
// below measuring the wrong slate. Taking the date from the request cannot
// drift, because there is only one clock involved.
let anchor = null

// Slate sizes deliberately differ by day. A slate that renders without tearing
// the previous one down produces a card count that is the SUM of the days
// visited, so unequal sizes make that unmistakable rather than a coincidence
// of two same-sized days lining up.
const slateFor = date => {
  if (date === anchor) return [...AFL, ...MLB] // 4 games, 2 sports
  return date > anchor ? MLB : AFL             // 2 games, 1 sport
}

const errors = []
const unrouted = []

const sessionChromium = '/opt/pw-browsers/chromium'
const browser = await chromium.launch(
  existsSync(sessionChromium) ? { executablePath: sessionChromium } : {}
)
const page = await browser.newPage()

page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))
page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`) })

// The page talks to TWO relay routes now: the slate, and the analytics bundle
// behind the Field's Pick tab. This stub was written when there was only one,
// and the second went straight to the network — which in this sandbox is a
// console error, and on a runner would be a real request from a test that
// claims to need no egress.
//
// Served as an empty bundle rather than a rich one: this check is about date
// navigation, and the pick panel's own assertions live in tab-check.mjs.
// scripts/pick-live-check.mjs is what exercises the real route.
await page.route('**/analytics/newspaper/**', route =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ date: 'stub', pick: null }),
  }))

// Open-Meteo, stubbed. The scoreboard now affixes a weather chip to each card,
// which means an unpinned page reaches a THIRD party — and this probe is
// deliberately offline. Stubbing it here rather than letting the product avoid
// the network is the right split: the real service is exercised by
// scripts/weather-live-check.mjs on a runner, in both directions.
//
// A fixed 61°F dry reading, so the assertion below is about the WIRING, not
// about today's weather.
// statsapi, stubbed for the same reason and with the same shape rule.
//
// The Stats tab fetches the MLB schedule for the pitcher and records rows, and
// this probe navigates by `?date=` rather than pinning `?data=`, which is
// exactly the configuration where that fetch runs. Left unrouted it escapes to
// the real network, and in the agent sandbox that is a proxy 403 —
// ERR_TUNNEL_CONNECTION_FAILED on the console, and the "no page or console
// errors" check red for a reason that has nothing to do with navigation.
//
// A real recorded response, not an invented one: the same capture the F# suite
// decodes, byte-verified against production's blob sha. The stub therefore
// asserts the WIRING, not today's schedule — and its venue is Camden Yards,
// which no date in this probe's slate plays at, so the rows correctly do not
// appear and nothing here depends on them.
const recordedSchedule = JSON.parse(
  readFileSync('data/statsapi-schedule-2026-06-29.json', 'utf8'))
await page.route(url => url.hostname === 'statsapi.mlb.com', route =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ dates: [ { games: recordedSchedule.games } ] }),
  }))

await page.route(url => url.hostname === 'api.open-meteo.com', route =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      timezone: 'America/New_York',
      elevation: 5,
      current: {
        temperature_2m: 61.0, apparent_temperature: 60.0,
        precipitation: 0.0, rain: 0.0,
        wind_speed_10m: 7.0, wind_direction_10m: 200, wind_gusts_10m: 11.0,
      },
    }),
  }))

await page.route('**/context/date/**', route => {
  const date = new global.URL(route.request().url()).pathname.split('/').pop()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    // The page asked for something that is not a date. Recorded rather than
    // served, so a malformed URL fails loudly instead of being papered over
    // with a valid-looking slate.
    unrouted.push(date)
    return route.fulfill({ status: 404, body: 'not served by nav-check' })
  }
  if (anchor === null) anchor = date
  const games = slateFor(date)
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    // The real relay sends this, which is the only reason the deployed page can
    // fetch it cross-origin at all. Fulfilled responses are still CORS-checked,
    // so omitting it would fail the fetch and mask what is being tested.
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({ ok: true, date, games: { regular: games, postseason: [] } }),
  })
})

/** Waits for the decode line to settle on a specific date, then reads the DOM. */
const settleOn = async date => {
  await page.waitForFunction(
    d => {
      const el = document.getElementById('decode-status')
      return el && /^decoded \d+ game/.test(el.textContent || '') && el.textContent.includes(d)
    },
    date,
    { timeout: 15_000 }
  )
  return page.evaluate(() => ({
    status: document.getElementById('decode-status')?.textContent,
    viewed: document.getElementById('viewed-date')?.textContent,
    url: location.search,
    cards: document.querySelectorAll('.desk-card').length,
    ids: [...document.querySelectorAll('.desk-card')].map(n => n.getAttribute('data-game-id')),
    groups: [...document.querySelectorAll('.sport-group')].map(s => ({
      sport: s.getAttribute('data-sport'),
      title: s.querySelector('.sport-group__title')?.textContent,
      cards: s.querySelectorAll('.desk-card').length,
    })),
  }))
}

const decodedCount = s => Number((s || '').match(/^decoded (\d+) game/)?.[1] ?? NaN)

// --- initial load: multi-sport day ------------------------------------------

await page.goto(URL_BASE, { waitUntil: 'networkidle' })
await page.waitForFunction(() => {
  const el = document.getElementById('decode-status')
  return el && /^decoded \d+ game/.test(el.textContent || '')
}, null, { timeout: 15_000 })

// Set by the route handler during that first fetch. Every date below is
// derived from it, so this script and the page can never be a day apart.
const TODAY = anchor
const TOMORROW = shift(TODAY, 1)
const YESTERDAY = shift(TODAY, -1)

const first = await settleOn(TODAY)

// --- forward, back, and home ------------------------------------------------
await page.click('#next-day')
const next = await settleOn(TOMORROW)

await page.click('#prev-day')
await settleOn(TODAY)
await page.click('#prev-day')
const prev = await settleOn(YESTERDAY)

// The Today button asks for today in FIELD's canonical zone, not UTC. Between
// 00:00 and 04:00 UTC those differ, so comparing against a UTC date here would
// fail this check for four hours a night — the same window the FieldDay type
// exists to close.
await page.click('#today')
const browserToday = await page.evaluate(() => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const g = t => parts.find(x => x.type === t).value
  return `${g('year')}-${g('month')}-${g('day')}`
})
const home = await settleOn(browserToday)

// The back button changes the URL without a load. Nothing re-renders unless
// popstate is handled explicitly, so this asserts the handler is real.
await page.goBack()
const back = await settleOn(YESTERDAY)

// --- the weather chip on a card ---------------------------------------------
//
// The card is rendered synchronously and the reading arrives later, so this is
// the one assertion that the async fill actually reaches the DOM. Without it,
// `fillCards` could silently match nothing — a selector typo, a renamed class,
// a venue the table does not carry — and every other check would stay green,
// because an empty slot is indistinguishable from "no reading" by design.
//
// Read before the browser closes; asserted below, where `check` exists.
//
// The wait is on FILLED chips, not on slots existing. Slots are rendered
// synchronously by Scoreboard.fs, so waiting for one to exist waits for nothing
// — the wait returned on the first poll and the assertions raced the fetch.
// Under a 1.2s stub delay the old form went red with three of its four checks
// vacuously green.
//
// The timeout is captured into a named check rather than swallowed. A
// `.catch(() => {})` is how a check that cannot fail gets written.
let chipWaitErr = null
await page.waitForFunction(
  n => [...document.querySelectorAll('.desk-card__wx')]
         .filter(e => (e.textContent || '').trim() !== '').length === n,
  back.cards, { timeout: 5000 }).catch(e => { chipWaitErr = e.message })
const chips = await page.$$eval('.desk-card__wx',
  ns => ns.map(n => ({ text: (n.textContent || '').trim(), title: n.getAttribute('title') })))
const filledChips = chips.filter(c => c.text !== '')

// The WET direction. The stub above serves a dry reading, so three of
// `cardChip`'s four branches had never rendered — and "no precipitation named"
// is a claim that passes trivially when nothing is falling. Re-route to a rainy
// payload and navigate again; `weatherLoaded <- false` on every render means the
// fetch really is repeated.
const WET_DAY = shift(YESTERDAY, -1)
await page.route(url => url.hostname === 'api.open-meteo.com', route =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      timezone: 'America/New_York',
      elevation: 5,
      current: {
        temperature_2m: 61.0, apparent_temperature: 60.0,
        precipitation: 2.0, rain: 2.0,
        wind_speed_10m: 7.0, wind_direction_10m: 200, wind_gusts_10m: 11.0,
      },
    }),
  }))
await page.click('#prev-day')
const wet = await settleOn(WET_DAY)
let wetWaitErr = null
await page.waitForFunction(
  n => [...document.querySelectorAll('.desk-card__wx')]
         .filter(e => (e.textContent || '').trim() !== '').length === n,
  wet.cards, { timeout: 5000 }).catch(e => { wetWaitErr = e.message })
const wetChips = (await page.$$eval('.desk-card__wx',
  ns => ns.map(n => (n.textContent || '').trim()))).filter(t => t !== '')

await browser.close()

const { check, summarize } = createChecks()

check('every relay request was a well-formed date', unrouted.length === 0,
  `unrouted: ${unrouted.join(', ')}`)

// --- grouping ---------------------------------------------------------------
check('a multi-sport slate renders one section per sport',
  first.groups.length === 2,
  `${first.groups.length} section(s): ${first.groups.map(g => g.sport).join(', ')}`)
check('every card lands inside a sport section',
  first.groups.reduce((n, g) => n + g.cards, 0) === first.cards,
  `${first.groups.reduce((n, g) => n + g.cards, 0)} grouped vs ${first.cards} total`)
check('section headings carry the sport and its count',
  first.groups.every(g => g.title === `${g.sport} · ${g.cards}`),
  first.groups.map(g => g.title).join(' | '))
// Two sports of equal size fall back to name order, which is the only tiebreak
// that does not depend on the order the relay happened to return them in.
check('sections are ordered deterministically (size desc, then name)',
  first.groups.map(g => g.sport).join(',') === 'AFL,MLB',
  first.groups.map(g => `${g.sport}:${g.cards}`).join(' '))
check('a single-sport slate renders exactly one section',
  next.groups.length === 1 && next.groups[0].sport === 'MLB',
  next.groups.map(g => g.sport).join(', '))

// --- navigation -------------------------------------------------------------
check('next-day advances the URL date', next.url.includes(TOMORROW), next.url)
check('prev-day steps back past today', prev.url.includes(YESTERDAY), prev.url)
check('today returns to the current FIELD-zone date', home.url.includes(browserToday),
  `${home.url} vs browser ${browserToday}`)
check('the viewed-date readout tracks the slate',
  first.viewed === TODAY && next.viewed === TOMORROW && prev.viewed === YESTERDAY,
  `${first.viewed} / ${next.viewed} / ${prev.viewed}`)
check('the back button re-renders (popstate is handled)',
  back.url.includes(YESTERDAY) && back.groups.length === 1 && back.groups[0].sport === 'AFL',
  `${back.url} -> ${back.groups.map(g => g.sport).join(', ')}`)

// --- teardown: the regression this probe exists for --------------------------
// Every navigation must leave exactly the new slate behind. Before the
// disposePrevious()/innerHTML reset, this is where a stale render shows up:
// 4 cards from today plus 2 from tomorrow, under a status line saying 2.
for (const [label, snap] of [['initial', first], ['after next', next],
                             ['after prev', prev], ['after today', home],
                             ['after back', back]]) {
  check(`card count matches decoded count — ${label}`,
    snap.cards === decodedCount(snap.status),
    `decoded ${decodedCount(snap.status)}, rendered ${snap.cards}`)
}
check('no game is rendered twice after navigating',
  new Set(back.ids).size === back.ids.length,
  back.ids.join(', '))

check('no page or console errors', errors.length === 0, errors.join('; ') || 'none')

console.log(`\nURL: ${URL_BASE}`)
console.log(`dates: ${YESTERDAY} <- ${TODAY} -> ${TOMORROW}\n`)
for (const [label, snap] of [['initial', first], ['next', next], ['prev', prev],
                             ['today', home], ['back', back]]) {
  console.log(`  ${label.padEnd(8)} ${snap.url}`)
  console.log(`           ${snap.status}`)
  console.log(`           ${snap.groups.map(g => `${g.sport}(${g.cards})`).join(' ') || '—'}`)
}
console.log()
check('every chip filled within the wait', chipWaitErr === null, chipWaitErr)
// EVERY card, not "at least one". Blanking one of two chips passed the old
// form; this turns it red.
check('every card on the slate carries a weather chip',
  filledChips.length === back.cards,
  `${back.cards} card(s), ${chips.length} slot(s), ${filledChips.length} filled`)
check('the chip shows the stubbed temperature',
  filledChips.length === back.cards && filledChips.every(c => /^61°F/.test(c.text)),
  JSON.stringify(filledChips.slice(0, 3)))
check('a dry reading names no precipitation',
  filledChips.length === back.cards && filledChips.every(c => !/rain|snow|ice/.test(c.text)),
  JSON.stringify(filledChips.slice(0, 3)))
check('every filled chip carries a real roof caveat',
  filledChips.length === back.cards &&
  filledChips.every(c => /open air|fixed roof|retractable roof/.test(c.title || '')),
  'a chip without its caveat is the display walking past the honest limit')
// The other direction: a WET reading must say so. Without this, "names no
// precipitation" is satisfied by a chip that can never name any.
check('the chips refilled within the wait after re-routing', wetWaitErr === null, wetWaitErr)
check('a wet reading names precipitation on the chip',
  wetChips.length === wet.cards && wetChips.every(t => /^61°F · rain$/.test(t)),
  `${wet.cards} card(s), ${wetChips.length} filled: ${JSON.stringify(wetChips)}`)


finish(summarize())
