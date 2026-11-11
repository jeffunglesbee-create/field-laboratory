// THE LIVE SCORE, DRIVEN THROUGH A REAL CARD IN A REAL BROWSER.
// docs/CC-CMD-2026-11-11-soccer-live-scores.md, Task 6.
//
// The F# suite proves the pure half (`LiveScore.foldReading`, `liveNoteFor`, `Scoreboard.statusTextWith`) at explicit
// instants. This proves what it cannot: that the PAGE folds a reading over the card's state, that the score, the status
// and the live note nodes read what it returns, and that a card the archive has finalised is never taken back.
//
// HOW. A card of the committed 2026-10-10 slate is put in the state the archive would have for a match in play (`Scheduled`:
// no score, the start time behind us) with the page's own test affordance `__labSetState`, and then told what the live feed
// said with `__labSetReading`, the way the poll does through `CardHandle.SetReading`. The clock is fixed at 12:00Z, between
// the 11:30Z and 14:00Z kickoffs (`page.clock.setFixedTime` fixes `Date.now()` only; timers keep running), so "the start time
// has passed" is a fact about a real row and not a flag.
//
// WHAT THIS DOES NOT PROVE. That the poll asks the right route at the right moments, and that the feed's real body decodes:
// those need the poll and a real body, and have their own scenarios when they exist. The numbers here are the test's own.
//
// Usage:  node scripts/live-score-render-check.mjs --self-test
//         URL=http://localhost:8080 node scripts/live-score-render-check.mjs   (the server must be up: node scripts/serve.mjs)

import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { createChecks, isMain, finish } from './checks.mjs'

const BASE = (process.env.URL || 'http://localhost:8080').replace(/\/+$/, '')
const SLATE = `${BASE}/?data=context-2026-10-10&simulate=1`
/** Between the 11:30Z and 14:00Z kickoffs of the committed slate. */
const AT = '2026-10-10T12:00:00Z'

const RELAY = 'https://field-relay-nba.jeffunglesbee.workers.dev'
/** The UNPINNED page's routes, spelled out in full on purpose (a typo in the page's own constant must not be forgiven). */
export const ROUTES = {
  slate: `${RELAY}/context/date/2026-10-10`,
  standings: `${RELAY}/espn-standings/soccer/eng.1/standings`,
  feed: `${RELAY}/v2/games?sport=epl&date=2026-10-10`,
}
const UNPINNED = `${BASE}/?date=2026-10-10&simulate=1`
/** Arsenal v Leeds' ESPN event id in the committed slate (src reads it as `espn_event_id`). */
const ARSENAL_LEEDS_ESPN = '401879268'

const EARLY = 'Arsenal v Leeds' // kicked off 11:30Z, finalised in the capture
const LATE = 'Chelsea v Bournemouth' // kicks off 14:00Z

/** The laboratory's soccer sports by their label, spelled out (src/Desk.fs `sportMeta`, `IsSoccer = true`). A card of one of these carries the live node; no other card does. */
export const SOCCER = [
  'MLS', 'EFL Cup', 'La Liga', 'EPL', 'Ligue 1', 'Serie A', 'Bundesliga',
  'UEFA Champions League', 'UEFA Champions League Qualifying', 'UEFA Europa League', 'UEFA Europa League Qualifying',
  'UEFA Europa Conference League', 'UEFA Europa Conference League Qualifying', 'FIFA World Cup', 'EFL Trophy', 'FA Cup',
]

/** The page's words, spelled out in full on purpose: a typo in the page must not be forgiven by a check that derives the same string. */
export const WORDS = {
  passed: 'Start time passed, no score served',
  inProgress: 'In progress',
  finalOvertime: 'Final / OT',
  preKickoff: 'Scheduled 2026-10-10T14:00Z (parsed 14:00)',
  fullTime: 'Full time',
  unavailable: 'live score unavailable',
}

/** What differs between a card as read and as wanted. Empty means it is as wanted. Only the keys in `want` are compared. */
export const mismatches = (card, want) =>
  Object.keys(want).filter(k => card[k] !== want[k]).map(k => `${k}: "${card[k]}" is not "${want[k]}"`)

/** A scripted /v2/games body for the one game of the mocked slate. The KEYS are those of two real probes (2026-11-11); the values are
 *  this test's own. The keys of a game in play are not yet captured from the relay, so what a live game carries is this test's assumption. */
export const feedBody = (state, home, away, clock) =>
  JSON.stringify({
    sport: 'epl', date: '2026-10-10', count: 1,
    games: [{ id: `espn:${ARSENAL_LEEDS_ESPN}`, espnEventId: ARSENAL_LEEDS_ESPN, sport: 'epl', league: 'EPL', state, start: '2026-10-10T11:30Z',
      home: { name: 'Arsenal', abbr: 'ARS', score: home }, away: { name: 'Leeds United', abbr: 'LEE', score: away },
      clock, periodNum: 1, periodLabel: "", situation: null, matchEvents: [], streams: [] }],
  })

// --- self-test ---------------------------------------------------------------

const SELF_TEST = isMain(import.meta.url) && process.argv.includes('--self-test')

if (SELF_TEST) {
  const { check, summarize } = createChecks()
  const card = { score: '1–0', status: 'In progress', live: "34'" }

  check('a card as wanted has no mismatch', mismatches(card, { score: '1–0', status: 'In progress', live: "34'" }).length === 0)
  check('a wrong score is caught', mismatches(card, { score: '0–1' }).length === 1)
  check('a wrong status is caught', mismatches(card, { status: 'Scheduled' }).length === 1)
  check('a missing live node (null) is not an empty note', mismatches({ ...card, live: null }, { live: '' }).length === 1)
  check('only the keys asked about are compared', mismatches(card, { score: '1–0' }).length === 0)
  check('sixteen soccer labels, each distinct', SOCCER.length === 16 && new Set(SOCCER).size === 16)
  check('the words are spelled out, and each is distinct', new Set(Object.values(WORDS)).size === Object.values(WORDS).length)
  check('the pre-kickoff string is the one the 2026-11-21 probe parses (it starts "Scheduled ")', /^Scheduled (\S+)/.test(WORDS.preKickoff))
  check('the post-kickoff string does not start with "Scheduled"', !WORDS.passed.startsWith('Scheduled'))
  check('the feed route is spelled out in full, with the sport key and the ET day',
    ROUTES.feed === 'https://field-relay-nba.jeffunglesbee.workers.dev/v2/games?sport=epl&date=2026-10-10' && UNPINNED.includes('date=2026-10-10'))
  check('a scripted feed body names the game by its ESPN event id', feedBody('live', 1, 0, "34'").includes(`"espnEventId":"${ARSENAL_LEEDS_ESPN}"`))
  check('a scripted feed body for another state differs', feedBody('final', 2, 1, "90'+4'") !== feedBody('live', 1, 0, "34'"))

  finish(summarize())
}

// --- live --------------------------------------------------------------------

const readCard = (page, teams) =>
  page.evaluate(t => {
    const cards = [...document.querySelectorAll('.desk-card')]
    const i = cards.findIndex(c => c.querySelector('.desk-card__teams')?.textContent === t)
    if (i < 0) return null
    const c = cards[i]
    const txt = id => c.querySelector(`[data-testid="${id}"]`)?.textContent ?? null
    return {
      i,
      teams: t,
      sport: c.closest('section.sport-group')?.getAttribute('data-sport') ?? '',
      score: txt('score'),
      status: txt('status'),
      live: txt('live'),
      drama: txt('drama'),
      forecast: c.querySelector('[data-testid="forecast"]')?.getAttribute('data-forecast') ?? null,
    }
  }, teams)

const index = async (page, teams) => {
  const c = await readCard(page, teams)
  if (!c) throw new Error(`no card reads "${teams}" on this slate`)
  return c.i
}

const setState = async (page, teams, name) => {
  const i = await index(page, teams)
  await page.evaluate(([n, s]) => window.__labSetState(n, s), [i, name])
}

const setReading = async (page, teams, kind, home = 0, away = 0, clock = '') => {
  const i = await index(page, teams)
  await page.evaluate(([n, k, h, a, c]) => window.__labSetReading(n, k, h, a, c), [i, kind, home, away, clock])
}

/** Wait until a card reads as wanted, or return what it read instead. */
const settle = async (page, teams, want, timeout = 4000) => {
  const end = Date.now() + timeout
  let card
  do {
    card = await readCard(page, teams)
    if (card && mismatches(card, want).length === 0) return card
    await page.waitForTimeout(50)
  } while (Date.now() < end)
  return card
}

if (isMain(import.meta.url) && !SELF_TEST) {
  const { check, summarize } = createChecks()
  const errors = []
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {})
  const context = await browser.newContext({ viewport: { width: 1000, height: 1400 } })
  const page = await context.newPage()
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`) })
  const requests = []
  page.on('request', r => requests.push(r.url()))
  await page.clock.setFixedTime(AT)
  await page.goto(SLATE, { waitUntil: 'networkidle' })
  await page.waitForSelector('.desk-card', { timeout: 15_000 })

  // ── the structure ────────────────────────────────────────────────────────
  const cards = await page.evaluate(() =>
    [...document.querySelectorAll('.desk-card')].map(c => ({
      sport: c.closest('section.sport-group')?.getAttribute('data-sport') ?? '',
      hasLive: !!c.querySelector('[data-testid="live"]'),
      live: c.querySelector('[data-testid="live"]')?.textContent ?? null,
    })))
  const soccer = cards.filter(c => SOCCER.includes(c.sport))
  const others = cards.filter(c => !SOCCER.includes(c.sport))
  check('every card of a soccer sport has the live node, and it is empty at first paint',
    soccer.length > 0 && soccer.every(c => c.hasLive && c.live === ''), JSON.stringify({ soccer: soccer.length, withNode: soccer.filter(c => c.hasLive).length }))
  check('no card of any other sport has one, so their structure is unchanged',
    others.length > 0 && others.every(c => !c.hasLive), JSON.stringify({ others: others.length, withNode: others.filter(c => c.hasLive).map(c => c.sport) }))
  const first = await readCard(page, EARLY)
  check('a card the archive has finalised reads Final, with no live note',
    mismatches(first, { status: 'Final', score: '2–1', live: '' }).length === 0, JSON.stringify(first))

  // ── a match in play whose score the archive does not have ────────────────
  await setState(page, EARLY, 'scheduled')
  const archive = await settle(page, EARLY, { status: WORDS.passed })
  check('an unscored row whose start time has passed says so, and does not read Scheduled',
    mismatches(archive, { status: WORDS.passed, score: '—' }).length === 0, JSON.stringify(archive))

  await setReading(page, EARLY, 'live', 1, 0, "34'")
  const inPlay = await settle(page, EARLY, { score: '1–0' })
  check('a live reading gives the card the feed\'s score and In progress',
    mismatches(inPlay, { score: '1–0', status: WORDS.inProgress }).length === 0, JSON.stringify(inPlay))
  check('...and the feed\'s clock beside it', mismatches(inPlay, { live: "34'" }).length === 0, JSON.stringify(inPlay))
  check('...with no forecast and no drama text on a card in play',
    mismatches(inPlay, { forecast: 'none', drama: '' }).length === 0, JSON.stringify(inPlay))

  await setReading(page, EARLY, 'fulltime', 2, 1)
  const full = await settle(page, EARLY, { live: WORDS.fullTime })
  check('a full-time reading keeps the card In progress with the final score and says Full time',
    mismatches(full, { score: '2–1', status: WORDS.inProgress, live: WORDS.fullTime }).length === 0, JSON.stringify(full))
  check('...and does not open the drama slot: only the archive says a game is over', mismatches(full, { drama: '' }).length === 0, JSON.stringify(full))

  await setReading(page, EARLY, 'unavailable')
  const gone = await settle(page, EARLY, { live: WORDS.unavailable })
  check('an unavailable reading says so in words and gives the card back to the archive\'s answer',
    mismatches(gone, { status: WORDS.passed, score: '—', live: WORDS.unavailable }).length === 0, JSON.stringify(gone))

  await setReading(page, EARLY, 'none')
  const back = await settle(page, EARLY, { live: '' })
  check('no reading clears the note', mismatches(back, { live: '', status: WORDS.passed }).length === 0, JSON.stringify(back))

  // ── the archive wins ─────────────────────────────────────────────────────
  await setState(page, EARLY, 'final')
  await setReading(page, EARLY, 'live', 0, 0, "1'")
  const kept = await settle(page, EARLY, { status: WORDS.finalOvertime })
  check('a card the archive has finalised is never taken back by a reading: Final, its score, no note',
    mismatches(kept, { status: WORDS.finalOvertime, score: '7–4', live: '' }).length === 0, JSON.stringify(kept))

  // ── a card whose kickoff is still ahead ──────────────────────────────────
  await setState(page, LATE, 'scheduled')
  const ahead = await settle(page, LATE, { status: WORDS.preKickoff })
  check('a Scheduled card before kickoff keeps its status byte for byte',
    mismatches(ahead, { status: WORDS.preKickoff, score: '—' }).length === 0, JSON.stringify(ahead))
  await page.waitForFunction(i => document.querySelectorAll('.desk-card')[i]?.querySelector('[data-testid="forecast"]')?.getAttribute('data-forecast') === 'model',
    await index(page, LATE), { timeout: 5000 }).catch(() => {})
  const modelled = await readCard(page, LATE)
  await setReading(page, LATE, 'live', 1, 0, "3'")
  const lost = await settle(page, LATE, { forecast: 'none' })
  check('a card that a reading puts in play loses its forecast, as one that goes in play does',
    modelled.forecast === 'model' && mismatches(lost, { forecast: 'none', status: WORDS.inProgress, score: '1–0' }).length === 0,
    JSON.stringify({ before: modelled.forecast, after: lost }))

  // ── the page asked for nothing ───────────────────────────────────────────
  check('a pinned page makes no request to the live feed (there is no poll on it)',
    requests.filter(u => u.includes('/v2/games')).length === 0, JSON.stringify(requests.filter(u => u.includes('/v2/games'))))
  check('no page or console errors', errors.length === 0, errors.join(' | '))

  await context.close()

  // ── the poll, on an UNPINNED page, with the relay's routes mocked ─────────
  // The slate is the committed one reduced to Arsenal v Leeds, with its score and finalisation removed so the archive says what
  // it said for Man Utd v Aston Villa on 2026-11-08: no score, the start time behind us. The feed is scripted, one body per tick.
  // The clock is a FAKE one (`clock.install`): timers are controlled, so a 60 s tick is `fastForward`, not a wait.
  {
    const slate = JSON.parse(readFileSync('data/context-2026-10-10.json', 'utf8'))
    slate.games.regular = slate.games.regular.filter(g => String(g.espn_event_id) === ARSENAL_LEEDS_ESPN)
      .map(g => ({ ...g, home_score: null, away_score: null, finalized_at: null }))
    slate.games.postseason = []
    const errors2 = []
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 1400 } })
    const pg = await ctx.newPage()
    pg.on('pageerror', e => errors2.push(`pageerror: ${e.message}`))
    const feedRequests = []
    const script = [feedBody('live', 1, 0, "34'"), feedBody('final', 2, 1, "90'+4'"), 'FAIL', feedBody('live', 3, 0, "70'"), 'GARBAGE']
    await pg.route(ROUTES.slate, r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(slate) }))
    await pg.route(ROUTES.standings, r => r.fulfill({ contentType: 'application/json', body: readFileSync('data/standings-eng1-2026-11-08.json', 'utf8') }))
    await pg.route(url => url.href.startsWith(`${RELAY}/v2/games`), r => {
      feedRequests.push(r.request().url())
      const body = script[Math.min(feedRequests.length - 1, script.length - 1)]
      if (body === 'FAIL') return r.fulfill({ status: 503, body: 'down' })
      if (body === 'GARBAGE') return r.fulfill({ contentType: 'text/html', body: '<html>maintenance</html>' })
      return r.fulfill({ contentType: 'application/json', body })
    })
    await pg.clock.install({ time: new Date(AT) })
    await pg.goto(UNPINNED, { waitUntil: 'networkidle' })
    await pg.waitForSelector('.desk-card', { timeout: 15_000 })

    const first = await settle(pg, EARLY, { score: '1–0' })
    check('an unpinned page with a card in its window asks the feed once at load, for the sport key and the ET day',
      feedRequests.length === 1 && feedRequests[0] === ROUTES.feed, JSON.stringify(feedRequests))
    check('...and the card shows the feed\'s live score, In progress and the feed\'s clock',
      mismatches(first, { score: '1–0', status: WORDS.inProgress, live: "34'" }).length === 0, JSON.stringify(first))

    await pg.clock.fastForward(60_000)
    const second = await settle(pg, EARLY, { live: WORDS.fullTime })
    check('one tick later it asks again, once, and a final feed game reads Full time (the archive has not finalised it)',
      feedRequests.length === 2 && mismatches(second, { score: '2–1', status: WORDS.inProgress, live: WORDS.fullTime }).length === 0,
      JSON.stringify({ n: feedRequests.length, card: second }))

    await pg.clock.fastForward(60_000)
    const third = await settle(pg, EARLY, { live: WORDS.unavailable })
    check('a feed that answers 503 is said on the card in words, and the card goes back to the archive\'s answer',
      feedRequests.length === 3 && mismatches(third, { live: WORDS.unavailable, status: WORDS.passed, score: '—' }).length === 0,
      JSON.stringify({ n: feedRequests.length, card: third }))

    await pg.evaluate(() => Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }))
    await pg.clock.fastForward(60_000)
    await pg.waitForTimeout(300)
    check('a hidden tab asks for nothing', feedRequests.length === 3, String(feedRequests.length))

    await pg.evaluate(() => Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }))
    await pg.clock.fastForward(60_000)
    const fourth = await settle(pg, EARLY, { score: '3–0' })
    check('a visible tab asks again at the next tick and the card is live again',
      feedRequests.length === 4 && mismatches(fourth, { score: '3–0', live: "70'" }).length === 0, JSON.stringify({ n: feedRequests.length, card: fourth }))

    await pg.clock.fastForward(60_000)
    const fifth = await settle(pg, EARLY, { live: WORDS.unavailable })
    check('a body that is not JSON is said on the card in words, never a blank',
      feedRequests.length === 5 && mismatches(fifth, { live: WORDS.unavailable, status: WORDS.passed }).length === 0, JSON.stringify({ n: feedRequests.length, card: fifth }))

    await pg.clock.fastForward(3 * 60 * 60 * 1000)
    await pg.waitForTimeout(300)
    const afterWindow = feedRequests.length
    await pg.clock.fastForward(60_000)
    await pg.clock.fastForward(60_000)
    await pg.waitForTimeout(300)
    check('once the card\'s window (three hours after the start) has passed the poll stops: no request at the next ticks',
      feedRequests.length === afterWindow, JSON.stringify({ afterWindow, now: feedRequests.length }))
    check('no page errors on the unpinned page', errors2.length === 0, errors2.join(' | '))
    await ctx.close()
  }

  await browser.close()
  finish(summarize())
}
