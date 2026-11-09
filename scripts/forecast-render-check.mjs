// THE MODEL'S FORECAST ON AN EPL CARD, DRIVEN IN A REAL BROWSER.
// docs/CC-CMD-2026-09-11-epl-forecaster-phase1.md.
//
// The F# suite proves the decision (`CardForecast.lineFor`) at fixed instants and
// the decoder on the real table. This proves what the suite cannot: that the PAGE
// asks the decision at the right moments, with the right inputs, and draws what
// it returns — the state flip reaches the node, the table's arrival reaches the
// node, a failed request is drawn as a refusal, and a slate with no EPL card
// spends no request.
//
// WHY A FIXED CLOCK. Every card of every committed capture is in the past, so
// `lineFor` correctly draws nothing on any of them at real time: the kickoff has
// passed. `page.clock.setFixedTime` fixes `Date.now()` and `new Date()` only —
// timers keep running — which is exactly the one input the decision reads. It is
// the real code path at a chosen instant, not a test-only bypass; the F# suite
// proves the same guard from the other side with explicit `now` arguments.
//
// WHAT THE NUMBERS ARE AND ARE NOT. The pinned slate is 2026-10-10 and the
// committed table is 2026-11-08, so a card flipped to Scheduled here is a
// fixture scored against a table that already contains its result. That is
// HINDSIGHT, and these numbers say nothing about the model's accuracy; they
// prove wiring only. The real forecast first appears on a live card on
// 2026-11-21 (matchday 11, the next EPL fixtures in the archive).
//
// The expected strings below were worked INDEPENDENTLY of the F#, in JavaScript,
// from the committed table with the constants in src/Forecast.fs, and match what
// the page printed. A change to the model moves them; that is meant to fail here
// until `METHOD_TAG` and these strings are answered together. Re-worked for
// `table-v2` (home +0.42, scale 1.14, draw 0.27) on 2026-11-09, from the table
// alone, before the page was run against them.
//
// Usage:  node scripts/forecast-render-check.mjs --self-test
//         URL=http://localhost:8080 node scripts/forecast-render-check.mjs
//         (the server must be up: node scripts/serve.mjs)

import { mkdirSync, readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { createChecks, isMain, finish } from './checks.mjs'

const BASE = (process.env.URL || 'http://localhost:8080').replace(/\/+$/, '')
const SLATE = `${BASE}/?data=context-2026-10-10&simulate=1`
const NO_EPL_SLATE = `${BASE}/?data=context-2026-05-15&simulate=1`
const TABLE_URL = '**/data/standings-eng1-2026-11-08.json'
const TABLE_FILE = 'data/standings-eng1-2026-11-08.json'
const SLATE_FILE = 'data/context-2026-10-10.json'

/** The UNPINNED page's routes, spelled out in full on purpose: a typo in the
 *  page's own constant must not be forgiven by a check that derives the same
 *  string from the same source. */
export const RELAY = 'https://field-relay-nba.jeffunglesbee.workers.dev'
export const RELAY_STANDINGS = `${RELAY}/espn-standings/soccer/eng.1/standings`
export const RELAY_SLATE = `${RELAY}/context/date/2026-10-10`
const UNPINNED = `${BASE}/?date=2026-10-10&simulate=1`

/** Before every kickoff on 2026-10-10, and between the 11:30Z and 14:00Z ones. */
const BEFORE_ALL = '2026-10-10T09:00:00Z'
const AFTER_FIRST = '2026-10-10T12:00:00Z'

/** The full statement of the model, as `Forecast.METHOD` states it. */
const METHOD = 'table-v2: ppg + 0.25*gdpg + 0.10*gfpg, home +0.42, scale 1.14, draw 0.27 for every match'

const ARSENAL_LEEDS = 'Arsenal v Leeds'
const CHELSEA_BOURNEMOUTH = 'Chelsea v Bournemouth'
const MAN_UNITED_SPURS = 'Man United v Spurs'

const EXPECTED = {
  [ARSENAL_LEEDS]: 'model table-v2 — Arsenal 62% · draw 27% · Leeds 11%',
  [CHELSEA_BOURNEMOUTH]: 'model table-v2 — Chelsea 46% · draw 27% · Bournemouth 27%',
  [MAN_UNITED_SPURS]: 'model table-v2 — no forecast: not in the standings table: Man United',
}

/** Words the ruling for this feature forbids: a difference from the market is never shown. */
export const BANNED = ['edge', 'value', 'gap', 'vs market', 'pts']

export const bannedWordsIn = text => {
  const lower = String(text).toLowerCase()
  return BANNED.filter(w => lower.includes(w))
}

/** The requests that asked for the table. */
export const standingsRequestsIn = urls => urls.filter(u => u.includes('standings'))

/** The requests made for exactly this URL. */
export const requestsFor = (urls, url) => urls.filter(u => u === url)

/** Requests that left the origin the page was served from. */
export const offOrigin = (urls, base) => urls.filter(u => !u.startsWith(base) && !u.startsWith('data:') && !u.startsWith('blob:'))

// --- self-test ---------------------------------------------------------------

const SELF_TEST = isMain(import.meta.url) && process.argv.includes('--self-test')

if (SELF_TEST) {
  const { check, summarize } = createChecks()
  const model = EXPECTED[ARSENAL_LEEDS]

  check('the ruling\'s vocabulary is not on a model line', bannedWordsIn(model).length === 0, model)
  check('a line that names an edge is caught', bannedWordsIn('model table-v2 — Arsenal 62% · edge +12').includes('edge'))
  check('a line that names a gap to the market is caught', bannedWordsIn('model — gap to market').includes('gap'))
  check('a line that names points is caught', bannedWordsIn('model — +12 pts').includes('pts'))

  const reqs = ['http://localhost:8080/data/standings-eng1-2026-11-08.json', 'http://localhost:8080/index.html']
  check('one request for the table is counted as one', standingsRequestsIn(reqs).length === 1)
  check('a page that asked for nothing is counted as nothing', standingsRequestsIn(['http://localhost:8080/index.html']).length === 0)
  check('a request to another origin is reported', offOrigin([...reqs, 'https://field-relay-nba.jeffunglesbee.workers.dev/espn-standings/soccer/eng.1/standings'], 'http://localhost:8080').length === 1)
  check('same-origin requests are not', offOrigin(reqs, 'http://localhost:8080').length === 0)

  check('the relay routes are spelled out in full, not derived',
    RELAY_STANDINGS === 'https://field-relay-nba.jeffunglesbee.workers.dev/espn-standings/soccer/eng.1/standings' &&
    RELAY_SLATE === 'https://field-relay-nba.jeffunglesbee.workers.dev/context/date/2026-10-10')
  check('a request for the committed table is told apart from one for the relay\'s',
    requestsFor(['http://localhost:8080/data/standings-eng1-2026-11-08.json', RELAY_STANDINGS], RELAY_STANDINGS).length === 1 &&
    requestsFor(['http://localhost:8080/data/standings-eng1-2026-11-08.json'], RELAY_STANDINGS).length === 0)
  check('three pinned strings, each distinct', new Set(Object.values(EXPECTED)).size === 3)
  check('only the two joined clubs carry a number', Object.values(EXPECTED).filter(t => /\d+%/.test(t)).length === 2)

  finish(summarize())
}

// --- live --------------------------------------------------------------------

/** Every card, with what its forecast node rendered. Booleans, strings and counts only. */
const readCards = page =>
  page.evaluate(() =>
    [...document.querySelectorAll('.desk-card')].map((c, i) => {
      const f = c.querySelector('[data-testid="forecast"]')
      return {
        i,
        teams: c.querySelector('.desk-card__teams')?.textContent ?? '',
        sport: c.closest('section.sport-group')?.getAttribute('data-sport') ?? '',
        market: c.querySelector('[data-testid="winprob"]')?.textContent ?? null,
        // The model's line sits under the market's: document order, not styling.
        afterMarket: f
          ? (c.querySelector('[data-testid="winprob"]')?.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
          : null,
        hasNode: !!f,
        kind: f?.getAttribute('data-forecast') ?? null,
        method: f?.getAttribute('data-method') ?? null,
        text: f?.textContent ?? null,
        displayed: f ? getComputedStyle(f).display !== 'none' : false,
      }
    }))

const cardNamed = async (page, teams) => {
  const found = (await readCards(page)).find(c => c.teams === teams && c.sport === 'EPL')
  if (!found) throw new Error(`no EPL card reads "${teams}" on this slate`)
  return found.i
}

const flip = async (page, teams, state) => {
  const i = await cardNamed(page, teams)
  await page.evaluate(([index, name]) => window.__labSetState(index, name), [i, state])
  return i
}

/** Wait for one card's node to carry `kind`, or say what it carried instead. */
const waitKind = async (page, teams, kind, timeout = 5000) => {
  const i = await cardNamed(page, teams)
  try {
    await page.waitForFunction(
      ([index, want]) =>
        document.querySelectorAll('.desk-card')[index]
          ?.querySelector('[data-testid="forecast"]')?.getAttribute('data-forecast') === want,
      [i, kind], { timeout })
    return null
  } catch {
    return (await readCards(page)).find(c => c.i === i)
  }
}

const freshPage = async (browser, nowIso, errors) => {
  const context = await browser.newContext({ viewport: { width: 1000, height: 1400 } })
  const page = await context.newPage()
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`) })
  const requests = []
  page.on('request', r => requests.push(r.url()))
  await page.clock.setFixedTime(nowIso)
  return { context, page, requests }
}

const load = async (page, url) => {
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForSelector('.desk-card', { timeout: 15_000 })
}

if (isMain(import.meta.url) && !SELF_TEST) {
  const { check, summarize } = createChecks()
  const errors = []
  const browser = await chromium.launch(
    process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {})
  const realTable = readFileSync(TABLE_FILE, 'utf8')

  // ── A. before every kickoff ───────────────────────────────────────────────
  {
    const { context, page, requests } = await freshPage(browser, BEFORE_ALL, errors)
    await load(page, SLATE)

    const initial = await readCards(page)
    const epl = initial.filter(c => c.sport === 'EPL')
    check('the slate has six EPL cards', epl.length === 6, `${epl.length}: ${epl.map(c => c.teams).join(' | ')}`)
    check('every EPL card carries the forecast node and no other card does',
      epl.every(c => c.hasNode) && initial.filter(c => c.hasNode).length === epl.length,
      JSON.stringify({ eplWithNode: epl.filter(c => c.hasNode).length, anyNode: initial.filter(c => c.hasNode).length }))
    check('a Final EPL card draws nothing on first paint, node empty and out of the layout',
      epl.every(c => c.kind === 'none' && c.text === '' && c.displayed === false),
      JSON.stringify(epl.map(c => [c.teams, c.kind, c.text, c.displayed])))

    // The table must have ARRIVED before "still nothing" means anything. Flipping
    // one card and watching it draw a number is the proof that it has.
    await flip(page, ARSENAL_LEEDS, 'scheduled')
    const arrived = await waitKind(page, ARSENAL_LEEDS, 'model')
    const arsenal = (await readCards(page)).find(c => c.teams === ARSENAL_LEEDS)
    check('a Scheduled EPL card before kickoff draws the model\'s number, from the committed table',
      arrived === null && arsenal.text === EXPECTED[ARSENAL_LEEDS],
      JSON.stringify(arrived ?? arsenal))
    check('the node carries the full statement of the model beside the number',
      arsenal.method === METHOD, String(arsenal.method))
    check('a line that draws is in the layout, after the market line in the card',
      arsenal.displayed === true && arsenal.afterMarket === true, JSON.stringify([arsenal.displayed, arsenal.afterMarket]))

    const others = (await readCards(page)).filter(c => c.sport === 'EPL' && c.teams !== ARSENAL_LEEDS)
    check('with the table loaded, the five Final cards still draw nothing',
      others.length === 5 && others.every(c => c.kind === 'none' && c.text === ''),
      JSON.stringify(others.map(c => [c.teams, c.kind])))

    await flip(page, CHELSEA_BOURNEMOUTH, 'scheduled')
    const chelsea = await waitKind(page, CHELSEA_BOURNEMOUTH, 'model')
    const chelseaCard = (await readCards(page)).find(c => c.teams === CHELSEA_BOURNEMOUTH)
    check('a second joined fixture draws its own number, not the first one\'s',
      chelsea === null && chelseaCard.text === EXPECTED[CHELSEA_BOURNEMOUTH],
      JSON.stringify(chelsea ?? chelseaCard))

    await flip(page, MAN_UNITED_SPURS, 'scheduled')
    const refused = await waitKind(page, MAN_UNITED_SPURS, 'clubs-not-in-table')
    const refusedCard = (await readCards(page)).find(c => c.teams === MAN_UNITED_SPURS)
    check('a club the table spells differently ("Man United") is refused by name on a real archive row',
      refused === null && refusedCard.text === EXPECTED[MAN_UNITED_SPURS] && refusedCard.method === null,
      JSON.stringify(refused ?? refusedCard))

    // Both directions: the flip back reaches the node, and a card in play has none.
    await flip(page, ARSENAL_LEEDS, 'inprogress')
    const inPlay = await waitKind(page, ARSENAL_LEEDS, 'none')
    const inPlayCard = (await readCards(page)).find(c => c.teams === ARSENAL_LEEDS)
    check('a card that goes in play loses its forecast',
      inPlay === null && inPlayCard.text === '' && inPlayCard.method === null && inPlayCard.displayed === false,
      JSON.stringify(inPlay ?? inPlayCard))

    await flip(page, ARSENAL_LEEDS, 'scheduled')
    await waitKind(page, ARSENAL_LEEDS, 'model')
    await flip(page, ARSENAL_LEEDS, 'final')
    const finished = await waitKind(page, ARSENAL_LEEDS, 'none')
    const finishedCard = (await readCards(page)).find(c => c.teams === ARSENAL_LEEDS)
    check('a card that finishes loses its forecast: the table now holds its result',
      finished === null && finishedCard.text === '' && finishedCard.method === null,
      JSON.stringify(finished ?? finishedCard))

    const texts = (await readCards(page)).filter(c => c.hasNode).map(c => c.text ?? '')
    const flagged = texts.flatMap(t => bannedWordsIn(t))
    check('no EPL card names an edge, a value or a gap to the market',
      flagged.length === 0, flagged.join(', '))

    // The market line is still the market line, beside the model's.
    const winprob = (await readCards(page)).filter(c => c.sport === 'EPL').map(c => c.market)
    check('the market line is untouched and unlabelled by this feature',
      winprob.length === 6 && winprob.every(t => t !== null && t.startsWith('win prob —')), JSON.stringify(winprob))

    // Pull only, observed rather than read: a quiet interval after the flips.
    await page.waitForTimeout(1500)
    const standings = standingsRequestsIn(requests)
    check('the table was asked for exactly once, however many cards changed and however long the page sat',
      standings.length === 1, JSON.stringify(standings))
    check('a pinned page reached nothing but its own origin',
      offOrigin(requests, BASE).length === 0, JSON.stringify(offOrigin(requests, BASE)))

    // The screenshot a reader can look at: the EPL group with every card flipped.
    mkdirSync('outbox', { recursive: true })
    for (const teams of [CHELSEA_BOURNEMOUTH, MAN_UNITED_SPURS, ARSENAL_LEEDS]) await flip(page, teams, 'scheduled')
    await page.waitForFunction(() =>
      [...document.querySelectorAll('[data-testid="forecast"]')].filter(n => n.textContent !== '').length >= 3)
    const group = await page.$('section.sport-group[data-sport="EPL"]')
    const box = await group.evaluate(el => {
      const r = el.getBoundingClientRect()
      return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height }
    })
    await page.screenshot({ path: 'outbox/forecast-card-pinned.png', fullPage: true, clip: box })
    console.log('  screenshot: outbox/forecast-card-pinned.png')
    await context.close()
  }

  // ── B. a clock between two kickoffs ───────────────────────────────────────
  {
    const { context, page } = await freshPage(browser, AFTER_FIRST, errors)
    await load(page, SLATE)
    await flip(page, ARSENAL_LEEDS, 'scheduled')
    await flip(page, CHELSEA_BOURNEMOUTH, 'scheduled')
    const later = await waitKind(page, CHELSEA_BOURNEMOUTH, 'model')
    const cards = await readCards(page)
    const early = cards.find(c => c.teams === ARSENAL_LEEDS)
    check('at 12:00Z a Scheduled card that kicked off at 11:30Z draws nothing',
      early.kind === 'none' && early.text === '', JSON.stringify(early))
    check('...while a 14:00Z kickoff on the same page still draws its forecast',
      later === null, JSON.stringify(later))
    await context.close()
  }

  // ── C. a slate with no EPL card ───────────────────────────────────────────
  {
    const { context, page, requests } = await freshPage(browser, BEFORE_ALL, errors)
    await load(page, NO_EPL_SLATE)
    const cards = await readCards(page)
    check('a slate with no EPL card renders cards', cards.length > 0, String(cards.length))
    check('...none of them carries a forecast node', cards.every(c => !c.hasNode),
      JSON.stringify(cards.filter(c => c.hasNode).map(c => c.teams)))
    check('...and the table is not asked for', standingsRequestsIn(requests).length === 0,
      JSON.stringify(standingsRequestsIn(requests)))
    await context.close()
  }

  // ── D. the table cannot be had ────────────────────────────────────────────
  // Its own error list. The browser reports the 503 this scenario injects on
  // purpose as a console error, so D cannot share the list the other scenarios
  // must leave empty — and it is not filtered out of that list by message,
  // because a filter on "Failed to load resource" would also hide a real 404 in
  // A. D asserts the exact set instead: this one report and nothing else.
  {
    const errorsD = []
    const { context, page } = await freshPage(browser, BEFORE_ALL, errorsD)
    await page.route(TABLE_URL, route => route.fulfill({ status: 503, body: 'down' }))
    await load(page, SLATE)
    await flip(page, ARSENAL_LEEDS, 'scheduled')
    const failed = await waitKind(page, ARSENAL_LEEDS, 'standings-unavailable')
    const card = (await readCards(page)).find(c => c.teams === ARSENAL_LEEDS)
    check('a failed table request is drawn as a refusal carrying the status it failed with, not as nothing',
      failed === null && /^model table-v2 — no forecast: standings unavailable \(503\b/.test(card.text) && card.method === null,
      JSON.stringify(failed ?? card))
    check('...and never falls back to a table that was not asked for', !/\d+%/.test(card.text), card.text)
    check('...the only console error is the browser\'s own report of the 503 this scenario injected',
      errorsD.length === 1 && /status of 503/.test(errorsD[0]), JSON.stringify(errorsD))
    await context.close()
  }

  // ── E. the table is not the table ─────────────────────────────────────────
  {
    const { context, page } = await freshPage(browser, BEFORE_ALL, errors)
    await page.route(TABLE_URL, route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
    await load(page, SLATE)
    await flip(page, ARSENAL_LEEDS, 'scheduled')
    const failed = await waitKind(page, ARSENAL_LEEDS, 'standings-unavailable')
    const card = (await readCards(page)).find(c => c.teams === ARSENAL_LEEDS)
    check('a body that is not a standings table is refused as unreadable',
      failed === null && /unreadable/.test(card.text) && !/\d+%/.test(card.text),
      JSON.stringify(failed ?? card))
    await context.close()
  }

  // ── F. the table is late ──────────────────────────────────────────────────
  {
    const { context, page } = await freshPage(browser, BEFORE_ALL, errors)
    let held = null
    await page.route(TABLE_URL, route => { held = route })
    await page.goto(SLATE, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.desk-card', { timeout: 15_000 })
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="forecast"]').length > 0)
    await flip(page, ARSENAL_LEEDS, 'scheduled')
    const pending = await waitKind(page, ARSENAL_LEEDS, 'standings-pending')
    const card = (await readCards(page)).find(c => c.teams === ARSENAL_LEEDS)
    check('while the table is on its way the card says so', pending === null && card.text === 'model table-v2 — standings loading',
      JSON.stringify(pending ?? card))
    check('...and the request was held, not answered', held !== null)
    if (held) {
      await held.fulfill({ status: 200, contentType: 'application/json', body: realTable })
      const arrived = await waitKind(page, ARSENAL_LEEDS, 'model')
      const after = (await readCards(page)).find(c => c.teams === ARSENAL_LEEDS)
      check('when the table arrives the same card draws its number with no reload',
        arrived === null && after.text === EXPECTED[ARSENAL_LEEDS], JSON.stringify(arrived ?? after))
    }
    await context.close()
  }

  // ── G. a card with no market price ────────────────────────────────────────
  // The headline claim of the feature: a model needs no price to exist. Every
  // EPL card in the committed capture is priced, so the unpriced card is made
  // here by serving the capture with ONE game's odds removed — both fields the
  // market line reads (`Desk.bestOdds`: closing, then opening). The other
  // priced card on the same page is the control: it must keep its market line,
  // and the unpriced card's forecast must be byte-identical to the one it drew
  // in A with a price beside it. The number does not depend on the price.
  {
    const { context, page } = await freshPage(browser, BEFORE_ALL, errors)
    await page.route('**/data/context-2026-10-10.json', async route => {
      const response = await route.fetch()
      const payload = await response.json()
      const games = [...payload.games.regular, ...payload.games.postseason]
      const target = games.filter(g => g.sport === 'EPL' && g.home === 'Arsenal' && g.away === 'Leeds')
      if (target.length !== 1) throw new Error(`expected one Arsenal v Leeds in the capture, found ${target.length}`)
      target[0].opening_odds = null
      target[0].closing_odds = null
      await route.fulfill({ response, json: payload })
    })
    await load(page, SLATE)
    await flip(page, ARSENAL_LEEDS, 'scheduled')
    await flip(page, CHELSEA_BOURNEMOUTH, 'scheduled')
    const unpriced = await waitKind(page, ARSENAL_LEEDS, 'model')
    const priced = await waitKind(page, CHELSEA_BOURNEMOUTH, 'model')
    const cards = await readCards(page)
    const alone = cards.find(c => c.teams === ARSENAL_LEEDS)
    const control = cards.find(c => c.teams === CHELSEA_BOURNEMOUTH)
    check('a card with no market price draws no market line (the setup holds)',
      alone.market === '', JSON.stringify(alone.market))
    check('...and still shows the model, labelled by where it came from',
      unpriced === null && alone.kind === 'model' && alone.text.startsWith('model table-v2 — ') && alone.method === METHOD,
      JSON.stringify(unpriced ?? alone))
    check('...with exactly the number it showed beside a market price in A',
      alone.text === EXPECTED[ARSENAL_LEEDS], alone.text)
    check('the priced card beside it keeps both lines, market first',
      priced === null && control.market.startsWith('win prob — ') && control.afterMarket === true
        && control.text === EXPECTED[CHELSEA_BOURNEMOUTH],
      JSON.stringify(priced ?? control))
    await context.close()
  }

  // ── H. the UNPINNED page, on its live path ───────────────────────────────
  // Every scenario above is pinned to a capture, so none of them executes the
  // branch of `standingsUrl` a real reader takes. Here the page is unpinned and
  // the network is routed: the slate and the table are answered from the
  // committed captures AT THE RELAY'S OWN URLS, and every other off-origin
  // request is answered with an empty object so nothing real is reached. What
  // this proves is the URL the live page asks and that it asks nothing else for
  // the table; it does not prove the relay serves it (that was probed once, on
  // 2026-11-08, and is re-proved on the deployed page after every deploy).
  {
    const slateBody = readFileSync(SLATE_FILE, 'utf8')
    const errorsH = []
    const { context, page, requests } = await freshPage(browser, BEFORE_ALL, errorsH)
    await page.route(url => !url.href.startsWith(BASE),
      route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
    await page.route(RELAY_SLATE, route => route.fulfill({ status: 200, contentType: 'application/json', body: slateBody }))
    await page.route(RELAY_STANDINGS, route => route.fulfill({ status: 200, contentType: 'application/json', body: realTable }))
    await load(page, UNPINNED)
    await flip(page, ARSENAL_LEEDS, 'scheduled')
    const live = await waitKind(page, ARSENAL_LEEDS, 'model')
    const card = (await readCards(page)).find(c => c.teams === ARSENAL_LEEDS)
    check('an unpinned page asks the relay for the table at its route, once',
      requestsFor(requests, RELAY_STANDINGS).length === 1, JSON.stringify(standingsRequestsIn(requests)))
    check('...and never reads the committed table in its place',
      requests.filter(u => u.includes('/data/standings-eng1')).length === 0,
      JSON.stringify(requests.filter(u => u.includes('/data/standings-eng1'))))
    check('...and draws the model\'s number from what the relay served',
      live === null && card.text === EXPECTED[ARSENAL_LEEDS], JSON.stringify(live ?? card))
    check('...with no uncaught error on the unpinned path',
      errorsH.filter(e => e.startsWith('pageerror:')).length === 0, errorsH.join(' | '))
    await context.close()
  }

  // ── I. the live table cannot be had ──────────────────────────────────────
  // The one a quiet substitution would hide: the relay fails and the card must
  // say so, not draw last week's committed table under today's date.
  {
    const slateBody = readFileSync(SLATE_FILE, 'utf8')
    const { context, page, requests } = await freshPage(browser, BEFORE_ALL, [])
    await page.route(url => !url.href.startsWith(BASE),
      route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
    await page.route(RELAY_SLATE, route => route.fulfill({ status: 200, contentType: 'application/json', body: slateBody }))
    await page.route(RELAY_STANDINGS, route => route.fulfill({ status: 503, body: 'down' }))
    await load(page, UNPINNED)
    await flip(page, ARSENAL_LEEDS, 'scheduled')
    const failed = await waitKind(page, ARSENAL_LEEDS, 'standings-unavailable')
    const card = (await readCards(page)).find(c => c.teams === ARSENAL_LEEDS)
    check('a failed LIVE table is a refusal on the card, never the committed table under today\'s date',
      failed === null && /\(503\b/.test(card.text) && !/\d+%/.test(card.text), JSON.stringify(failed ?? card))
    check('...and the committed table was not requested to cover for it',
      requests.filter(u => u.includes('/data/standings-eng1')).length === 0)
    await context.close()
  }

  check('no page or console errors in scenarios A, B, C, E, F and G (D is asserted above to the exact message; H asserts uncaught errors only)',
    errors.length === 0, errors.join(' | '))

  await browser.close()
  finish(summarize())
}
