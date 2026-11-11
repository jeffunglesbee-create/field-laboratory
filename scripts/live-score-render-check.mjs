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
// WHAT THIS DOES NOT PROVE. That the feed's real bodies decode: the Suite does that, on the three bodies captured 2026-11-11 (live, half time, final). The first part of this file drives a
// card through `__labSetReading`; the unpinned scenarios further down run the poll against a mocked relay and a fake clock and observe its route, its
// day, its period, its timers, one request per key, its deadline and its window. The numbers in both are the test's own.
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
  halfTime: 'Half time',
  fullTime: 'Full time',
  unavailable: 'live score unavailable',
}

/** What differs between a card as read and as wanted. Empty means it is as wanted. Only the keys in `want` are compared. */
export const mismatches = (card, want) =>
  Object.keys(want).filter(k => card[k] !== want[k]).map(k => `${k}: "${card[k]}" is not "${want[k]}"`)

/** A scripted /v2/games body for the one game of the mocked slate. The KEYS are those of two real probes (2026-11-11); the values are
 *  this test's own. The keys of a game in play were captured 2026-11-11 (the Suite holds the real bodies); a scripted body here carries only the keys the page reads. */
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
      why: c.querySelector('[data-testid="live"]')?.getAttribute('data-why') ?? null,
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
  // What the node LOOKS like, not just what it says (review 2026-11-11, semantics F8: it had no CSS rule, so it read larger and brighter than
  // the status line above it, and a check that reads textContent cannot see that).
  const lookOf = (pg, teams) =>
    pg.evaluate(t => {
      const c = [...document.querySelectorAll('.desk-card')].find(x => x.querySelector('.desk-card__teams')?.textContent === t)
      const st = getComputedStyle(c.querySelector('[data-testid="status"]'))
      const lv = getComputedStyle(c.querySelector('[data-testid="live"]'))
      return { statusFont: st.fontSize, liveFont: lv.fontSize, statusOpacity: st.opacity, liveOpacity: lv.opacity, liveDisplay: lv.display, liveTabular: lv.fontVariantNumeric }
    }, teams)
  const first = await readCard(page, EARLY)
  check('a card the archive has finalised reads Final, with no live note',
    mismatches(first, { status: 'Final', score: '2–1', live: '' }).length === 0, JSON.stringify(first))
  const quiet = await lookOf(page, EARLY)
  check('...and the empty live node takes no line', quiet.liveDisplay === 'none', JSON.stringify(quiet))

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
  const look = await lookOf(page, EARLY)
  check('...and the clock is set like the status line it sits under: same size, same opacity, tabular figures',
    look.liveFont === look.statusFont && look.liveOpacity === look.statusOpacity && /tabular-nums/.test(look.liveTabular) && look.liveDisplay !== 'none', JSON.stringify(look))
  check('...with no forecast and no drama text on a card in play',
    mismatches(inPlay, { forecast: 'none', drama: '' }).length === 0, JSON.stringify(inPlay))

  // Half time (owner approved 2026-11-11). Captured 19:54Z: at the break the feed's state stays `live` and its clock reads `45'+3'`; `situation.isHalftime` says so.
  await setReading(page, EARLY, 'halftime', 3, 0)
  const half = await settle(page, EARLY, { live: WORDS.halfTime })
  check('a half-time reading keeps the card In progress with the score and says Half time',
    mismatches(half, { score: '3–0', status: WORDS.inProgress, live: WORDS.halfTime }).length === 0, JSON.stringify(half))
  check('...and opens nothing: no drama text, no forecast, no reason attribute', mismatches(half, { drama: '', forecast: 'none' }).length === 0 && half.why === null, JSON.stringify(half))

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
  // Fix-review round 3 (defence F5): the guard was checked with a live reading only; a half-time or full-time reading must not take a finalised card back either.
  for (const kind of ['halftime', 'fulltime']) {
    await setReading(page, EARLY, kind, 1, 0)
    await page.waitForTimeout(150)
    const held = await readCard(page, EARLY)
    check(`a card the archive has finalised is not taken back by a ${kind} reading either: Final / OT, its score, no note`,
      mismatches(held, { status: WORDS.finalOvertime, score: '7–4', live: '' }).length === 0, JSON.stringify(held))
  }
  // Fix-review 2026-11-11 (card F8, defence F22): the `Final _, _ -> ""` arm of `liveWhyFor` is reached on a real page only through the state the card's effect hands it, and the Suite pins the
  // pure function alone: the effect reading a constant instead of the card's state passed every check. A card the archive has finalised (after extra time here: `Final / OT`) is told the feed failed,
  // and must carry neither a note nor a reason. The reading is then shown to have been held all along: give the card back to the archive and the same reading's reason appears.
  await setReading(page, EARLY, 'unavailable')
  await page.waitForTimeout(150)
  const finalUnavailable = await readCard(page, EARLY)
  check('a card the archive has finalised, told the feed failed, carries no note and no reason: Final / OT, an empty live node, no data-why',
    mismatches(finalUnavailable, { status: WORDS.finalOvertime, score: '7–4', live: '' }).length === 0 && finalUnavailable.why === null, JSON.stringify(finalUnavailable))
  await setState(page, EARLY, 'scheduled')
  const finalGivenBack = await settle(page, EARLY, { live: WORDS.unavailable })
  check('...and the reading was there all along: once the archive no longer says Final the same reading says unavailable, with its reason',
    mismatches(finalGivenBack, { live: WORDS.unavailable }).length === 0 && finalGivenBack.why === 'test', JSON.stringify(finalGivenBack))

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

  // ── a card drawn BEFORE kickoff and read AFTER it ─────────────────────────
  // Every scenario above fixes the clock before the page loads, so no card was ever drawn early and read late. That is exactly the
  // card a reader has: the page opened at 12:00Z, the match at 14:00Z, and a poll answering at 14:05Z that the feed has nothing for.
  // The answer leaves the archive's state untouched, so the card must still re-read the clock (review 2026-11-11, semantics F1: it
  // kept `Scheduled <iso>` and its forecast beside a note saying the score was unavailable).
  {
    const ctx2 = await browser.newContext({ viewport: { width: 1000, height: 1400 } })
    const pg = await ctx2.newPage()
    const errs2 = []
    pg.on('pageerror', e => errs2.push(`pageerror: ${e.message}`))
    await pg.clock.setFixedTime(AT)
    await pg.goto(SLATE, { waitUntil: 'networkidle' })
    await pg.waitForSelector('.desk-card', { timeout: 15_000 })
    // The committed capture has this match finalised; the archive state is set to Scheduled at 12:00Z, which is what the page drew.
    await setState(pg, LATE, 'scheduled')
    await settle(pg, LATE, { status: WORDS.preKickoff })
    await pg.waitForFunction(i => document.querySelectorAll('.desk-card')[i]?.querySelector('[data-testid="forecast"]')?.getAttribute('data-forecast') === 'model',
      await index(pg, LATE), { timeout: 5000 }).catch(() => {})
    const drawn = await readCard(pg, LATE)
    check('at 12:00Z, before its 14:00Z kickoff, the card reads Scheduled with the model line',
      mismatches(drawn, { status: WORDS.preKickoff, score: '—', forecast: 'model' }).length === 0, JSON.stringify(drawn))
    await pg.clock.setFixedTime('2026-10-10T14:05:00Z')
    await setReading(pg, LATE, 'unavailable')
    const late = await settle(pg, LATE, { status: WORDS.passed })
    check('after kickoff, a feed that failed leaves the card saying the start time passed, not Scheduled, with the reason beside it',
      mismatches(late, { status: WORDS.passed, score: '—', live: WORDS.unavailable }).length === 0, JSON.stringify(late))
    check('...and the model line is gone: a forecast is drawn only before kickoff',
      mismatches(late, { forecast: 'none' }).length === 0, JSON.stringify(late))
    await setReading(pg, LATE, 'none')
    const none = await settle(pg, LATE, { live: '' })
    check('a feed with nothing for the game (no reading) reads the same: start time passed, no forecast, no note',
      mismatches(none, { status: WORDS.passed, forecast: 'none', live: '' }).length === 0, JSON.stringify(none))
    check('no page errors on that card', errs2.length === 0, errs2.join(' | '))
    await ctx2.close()
  }

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

    check('...and the reason rides on the card as data-why, the feed\'s own status (the words stay the same)', typeof third.why === 'string' && third.why.includes('503'), JSON.stringify(third.why))

    await pg.evaluate(() => Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }))
    await pg.clock.fastForward(60_000)
    await pg.waitForTimeout(300)
    check('a hidden tab asks for nothing', feedRequests.length === 3, String(feedRequests.length))

    await pg.evaluate(() => Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }))
    await pg.clock.fastForward(60_000)
    const fourth = await settle(pg, EARLY, { score: '3–0' })
    check('a visible tab asks again at the next tick and the card is live again',
      feedRequests.length === 4 && mismatches(fourth, { score: '3–0', live: "70'" }).length === 0, JSON.stringify({ n: feedRequests.length, card: fourth }))
    check('...and the reason is gone with the unavailable note: no data-why on a card that reads a clock', fourth.why === null, JSON.stringify(fourth.why))

    await pg.clock.fastForward(60_000)
    const fifth = await settle(pg, EARLY, { live: WORDS.unavailable })
    check('a body that is not JSON is said on the card in words, never a blank',
      feedRequests.length === 5 && mismatches(fifth, { live: WORDS.unavailable, status: WORDS.passed }).length === 0, JSON.stringify({ n: feedRequests.length, card: fifth }))
    check('...and its reason says the body was unreadable', typeof fifth.why === 'string' && fifth.why.startsWith('unreadable'), JSON.stringify(fifth.why))

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

  // ── the poll across two leagues, re-renders, a held answer and its period ──────────────────────────────────────
  // Review 2026-11-11 (poll S9/S16, S17, S18, S22): the selection of cards an answer is told, the timer's clearing, the in-flight guard and the
  // period were each defended by a text scan only, and every one survived a one-line break. These observe the page instead. The page's own
  // `setInterval`/`clearInterval` are wrapped before it loads, so what is counted is the intervals that are alive, and the delay they were given.
  {
    const RAYO = '401882849'
    const mk = () => {
      const slate = JSON.parse(readFileSync('data/context-2026-10-10.json', 'utf8'))
      slate.games.regular = slate.games.regular.filter(g => [ARSENAL_LEEDS_ESPN, RAYO].includes(String(g.espn_event_id)))
        .map(g => ({ ...g, start_time: '2026-10-10T11:30Z', home_score: null, away_score: null, finalized_at: null }))
      slate.games.postseason = []
      return slate
    }
    const feedFor = (key, id, home, away, clock, situation) => JSON.stringify({ sport: key, date: '2026-10-10', count: 1, games: [{ id: `espn:${id}`, espnEventId: id, sport: key, state: 'live', start: '2026-10-10T11:30Z',
      home: { name: 'H', abbr: 'H', score: home }, away: { name: 'A', abbr: 'A', score: away }, clock, periodNum: 1, periodLabel: '', situation: situation === undefined ? null : situation, matchEvents: [], streams: [] }] })
    const FEEDS = { epl: feedFor('epl', ARSENAL_LEEDS_ESPN, 1, 0, "34'"), laliga: feedFor('laliga', RAYO, 2, 2, "50'") }
    const routesFor = async (pg, slate, onFeed) => {
      await pg.route(ROUTES.slate, r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(slate) }))
      await pg.route(`${RELAY}/context/date/2026-10-09`, r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...slate, date: '2026-10-09', games: { regular: [], postseason: [] } }) }))
      await pg.route(ROUTES.standings, r => r.fulfill({ contentType: 'application/json', body: readFileSync('data/standings-eng1-2026-11-08.json', 'utf8') }))
      await pg.route(url => url.href.startsWith(`${RELAY}/v2/games`), onFeed)
    }
    const instrument = pg => pg.addInitScript(() => {
      window.__iv = { alive: new Set(), delays: [] }
      const si = window.setInterval.bind(window), ci = window.clearInterval.bind(window)
      window.setInterval = (fn, d, ...rest) => { const id = si(fn, d, ...rest); window.__iv.alive.add(id); window.__iv.delays.push(d); return id }
      window.clearInterval = id => { window.__iv.alive.delete(id); return ci(id) }
    })
    const alive = pg => pg.evaluate(() => window.__iv.alive.size)

    // (a) two leagues, each card told its own league's answer, and the timers across re-renders
    {
      const ctx = await browser.newContext({ viewport: { width: 1000, height: 1400 } })
      const pg = await ctx.newPage()
      const errs = []
      pg.on('pageerror', e => errs.push(e.message))
      const asked = []
      await routesFor(pg, mk(), r => {
        const key = new URL(r.request().url()).searchParams.get('sport')
        asked.push(key)
        return r.fulfill({ contentType: 'application/json', body: FEEDS[key] ?? JSON.stringify({ games: [] }) })
      })
      // The fake clock first, then the wrapper: init scripts run in registration order, and the clock replaces the timer functions it finds.
      await pg.clock.install({ time: new Date(AT) })
      await instrument(pg)
      await pg.goto(UNPINNED, { waitUntil: 'networkidle' })
      await pg.waitForSelector('.desk-card', { timeout: 15_000 })
      const epl = await settle(pg, EARLY, { score: '1–0' })
      const liga = await settle(pg, 'Rayo v Athletic', { score: '2–2' })
      check('two soccer leagues in their windows are asked once each, and every card is told its OWN league\'s answer',
        [...asked].sort().join() === 'epl,laliga' && mismatches(epl, { score: '1–0', live: "34'", status: WORDS.inProgress }).length === 0 && mismatches(liga, { score: '2–2', live: "50'", status: WORDS.inProgress }).length === 0,
        JSON.stringify({ asked, epl, liga }))
      check('...and neither card reads `live score unavailable` because the other league\'s feed had no game for it',
        epl.live !== WORDS.unavailable && liga.live !== WORDS.unavailable)
      const iv = await pg.evaluate(() => ({ alive: window.__iv.alive.size, delays: window.__iv.delays }))
      check('the poll holds ONE timer, and the delay the page gave it is the named period, 60000 ms',
        iv.alive === 1 && iv.delays.length >= 1 && iv.delays.includes(60000) && iv.delays.every(d => d >= 60000), JSON.stringify(iv))
      await pg.click('#prev-day')
      await pg.waitForFunction(() => document.querySelectorAll('.desk-card').length === 0, null, { timeout: 8000 }).catch(() => {})
      check('re-rendering to a day with no soccer card clears the timer: none alive', (await alive(pg)) === 0, String(await alive(pg)))
      await pg.click('#today')
      await pg.waitForSelector('.desk-card', { timeout: 8000 })
      await settle(pg, EARLY, { score: '1–0' })
      check('...and coming back to a day with cards in their window arms exactly one, not two', (await alive(pg)) === 1, String(await alive(pg)))
      await pg.clock.fastForward(3 * 60 * 60 * 1000 + 60_000)
      await pg.waitForTimeout(300)
      check('once every window has passed the timer is cleared: none alive', (await alive(pg)) === 0, String(await alive(pg)))
      check('no page errors across the re-renders', errs.length === 0, errs.join(' | '))
      await ctx.close()
    }

    // (b) an answer held across a tick: one request per key at a time, and the next tick asks again once it is answered. The held request is released well inside the deadline
    // (`LivePollTimeoutMs`, longer than the period on purpose: see src/LiveScore.fs), so the page's one-request-per-key guard is what keeps epl from being asked at the first tick.
    {
      const ctx = await browser.newContext({ viewport: { width: 1000, height: 1400 } })
      const pg = await ctx.newPage()
      let release
      const gate = new Promise(res => { release = res })
      const n = { epl: 0, laliga: 0 }
      await routesFor(pg, mk(), async r => {
        const key = new URL(r.request().url()).searchParams.get('sport')
        const i = n[key]++
        if (key === 'epl' && i === 0) await gate
        return r.fulfill({ contentType: 'application/json', body: FEEDS[key] ?? JSON.stringify({ games: [] }) })
      })
      await pg.clock.install({ time: new Date(AT) })
      await pg.goto(UNPINNED, { waitUntil: 'commit' })
      await pg.waitForSelector('.desk-card', { timeout: 15_000 })
      await pg.waitForTimeout(500)
      const atLoad = { ...n }
      await pg.clock.fastForward(60_000)
      await pg.waitForTimeout(250)
      const held = { ...n }
      release()
      await settle(pg, EARLY, { score: '1–0' })
      await pg.clock.fastForward(60_000)
      await pg.waitForTimeout(400)
      check('a request still unanswered holds its key: one tick later the page has not asked for epl again, while laliga, answered, is asked',
        atLoad.epl === 1 && held.epl === 1 && held.laliga === atLoad.laliga + 1, JSON.stringify({ atLoad, held }))
      check('...and once it is answered the next tick asks for it again', n.epl === 2, JSON.stringify({ held, after: n }))
      await ctx.close()
    }

    // (c) a request that NEVER answers (review 2026-11-11, poll S4 and S18): without a deadline the key stayed held for the life of the page, the card said nothing, and no later
    // tick asked again. The deadline is `AbortSignal.timeout`, which the fake clock DOES drive (measured 2026-11-11: a fetch given `AbortSignal.timeout(15000)` rejected with
    // `TimeoutError` after `clock.fastForward(60000)`), and its length is read from src/LiveScore.fs so this check follows the constant.
    // Fix-review 2026-11-11 (poll F23): the first version only knew the request was still open at 60 s and cut by 91 s, so a signal of 65 s, or any value from 60 s to about 94 s, passed. The
    // installed clock keeps running in real time unless it is paused (a checkpoint a second before the deadline failed 4 runs in 5 in a reviewer's replica, on the real-time drift), so the clock is PAUSED once the request is
    // in flight and moved only by `runFor`: the time the request has been open is then known exactly (`e` below, from the page's own `Date.now()` at the request and at the pause), and the
    // request must be open two seconds before its deadline and cut two seconds after it. Measured on 6 runs with 0.5 to 2.5 s of real-time drift before the pause (scratch, 2026-11-11): the same
    // answer every time. The band is the clock's own: a signal 5 s short or 10 s long fails (table entries `poll-deadline-signal-*`).
    {
      const DEADLINE_MS = Number(readFileSync('src/LiveScore.fs', 'utf8').match(/let LivePollTimeoutMs = (\d+)/)?.[1])
      const TICK_PAST = 65_000, BAND = 2_000
      const ctx = await browser.newContext({ viewport: { width: 1000, height: 1400 } })
      const pg = await ctx.newPage()
      let release
      const gate = new Promise(res => { release = res })
      const n = { epl: 0, laliga: 0 }
      let t0 = null
      await routesFor(pg, mk(), async r => {
        const key = new URL(r.request().url()).searchParams.get('sport')
        const i = n[key]++
        if (key === 'epl' && i === 0) { t0 = await pg.evaluate(() => Date.now()); await gate; return r.abort().catch(() => {}) }
        return r.fulfill({ contentType: 'application/json', body: FEEDS[key] ?? JSON.stringify({ games: [] }) })
      })
      await pg.clock.install({ time: new Date(AT) })
      await pg.goto(UNPINNED, { waitUntil: 'commit' })
      await pg.waitForSelector('.desk-card', { timeout: 15_000 })
      for (let i = 0; t0 === null && i < 100; i++) await pg.waitForTimeout(50)
      const before = await readCard(pg, EARLY)
      const tNow = await pg.evaluate(() => Date.now())
      await pg.clock.pauseAt(new Date(tNow + 1))
      const e = tNow + 1 - t0
      const geometryOk = Number.isFinite(DEADLINE_MS) && t0 !== null && e >= 0 && e < 10_000 && DEADLINE_MS >= TICK_PAST + 2 * BAND
      let insideDeadline = null, askedInside = null, justBefore = null, cut = null
      if (geometryOk) {
        await pg.clock.runFor(TICK_PAST - e)
        await pg.waitForTimeout(250)
        insideDeadline = await readCard(pg, EARLY)
        askedInside = n.epl
        await pg.clock.runFor(DEADLINE_MS - BAND - TICK_PAST)
        await pg.waitForTimeout(250)
        justBefore = await readCard(pg, EARLY)
        await pg.clock.runFor(2 * BAND)
        cut = await settle(pg, EARLY, { live: WORDS.unavailable })
      }
      check('a request that never answers is held through the tick after it and until two seconds before its deadline, and is cut two seconds after it with the card saying so rather than staying silent',
        geometryOk && before.live !== WORDS.unavailable && insideDeadline.live !== WORDS.unavailable && askedInside === 1 && justBefore.live !== WORDS.unavailable && cut.live === WORDS.unavailable,
        JSON.stringify({ DEADLINE_MS, openForMs: e, before: before?.live, insideDeadline: insideDeadline?.live, askedInside, justBefore: justBefore?.live, cut: cut?.live }))
      check('...and the reason says the feed did not answer', typeof cut?.why === 'string' && cut.why.startsWith('the feed did not answer'), JSON.stringify(cut?.why))
      if (geometryOk) await pg.clock.runFor(60_000)
      await pg.waitForTimeout(400)
      const again = await settle(pg, EARLY, { score: '1–0' })
      check('...and the next tick asks for that key again and the card is told the score: the stalled request did not pin the key', n.epl === 2 && again.score === '1–0' && again.why === null, JSON.stringify({ asked: n.epl, score: again.score, why: again.why }))
      release()
      await ctx.close()
    }

    // (f) THE DAY ASKED is the day of the cards drawn, not the URL's (review 2026-11-11, poll S5; fix-review poll F1 and defence F20). `start()` has no generation guard, so two overlapping navigations can
    // leave one day's slate drawn under another day's URL. Here the URL says 2026-10-10 and the slate it is answered with says 2026-10-09: the feed must be asked for the 9th. Every scenario above serves a slate
    // whose `date` equals the URL's, so the two days were indistinguishable and a poll that asked for the URL's day (at the call, or inside the poll) passed.
    {
      const ctx = await browser.newContext({ viewport: { width: 1000, height: 1400 } })
      const pg = await ctx.newPage()
      const errs = []
      pg.on('pageerror', e => errs.push(e.message))
      const asked = []
      await routesFor(pg, { ...mk(), date: '2026-10-09' }, r => {
        const u = new URL(r.request().url())
        asked.push(`${u.searchParams.get('sport')}:${u.searchParams.get('date')}`)
        return r.fulfill({ contentType: 'application/json', body: FEEDS[u.searchParams.get('sport')] ?? JSON.stringify({ games: [] }) })
      })
      await pg.clock.install({ time: new Date(AT) })
      await pg.goto(UNPINNED, { waitUntil: 'networkidle' })
      await pg.waitForSelector('.desk-card', { timeout: 15_000 })
      await settle(pg, EARLY, { score: '1–0' })
      check('a slate dated the 9th, drawn under a URL for the 10th, is asked for the 9th: every request carries the date of the cards, never the URL\'s',
        asked.length === 2 && [...asked].sort().join() === 'epl:2026-10-09,laliga:2026-10-09', JSON.stringify(asked))
      check('no page errors when the slate\'s day and the URL\'s differ', errs.length === 0, errs.join(' | '))
      await ctx.close()
    }

    // (g) a slate that carries no date asks for nothing (fix-review poll F1 and defence F21). The relay turns an empty `date` into the UTC day, which is the wrong day after 19:00 Eastern, so the page
    // does not ask; the cards are still drawn, and no timer is armed for a poll that will not run.
    {
      const ctx = await browser.newContext({ viewport: { width: 1000, height: 1400 } })
      const pg = await ctx.newPage()
      const errs = []
      pg.on('pageerror', e => errs.push(e.message))
      const asked = []
      const noDate = mk()
      delete noDate.date
      await routesFor(pg, noDate, r => { asked.push(r.request().url()); return r.fulfill({ contentType: 'application/json', body: FEEDS.epl }) })
      await pg.clock.install({ time: new Date(AT) })
      await instrument(pg)
      await pg.goto(UNPINNED, { waitUntil: 'networkidle' })
      await pg.waitForSelector('.desk-card', { timeout: 15_000 })
      for (let i = 0; i < 2; i++) {
        await pg.clock.fastForward(60_000)
        await pg.waitForTimeout(250)
      }
      const drawn = await readCard(pg, EARLY)
      check('a slate with no date draws its cards and asks the feed for nothing, at load or across two ticks, with no timer armed',
        drawn !== null && asked.length === 0 && (await alive(pg)) === 0, JSON.stringify({ drawn: drawn?.status, asked, alive: await alive(pg) }))
      check('no page errors on a slate with no date', errs.length === 0, errs.join(' | '))
      await ctx.close()
    }

    // Fix-review 2026-11-11 (defence F18, F19): every scenario above starts its cards at 11:30Z with the clock at 12:00Z, so no card of a polled league was ever AHEAD of its
    // kickoff, and the lower bound of the window was defended by nothing the browser ran. These two put a same-league card hours ahead of its kickoff.
    // Chelsea v Bournemouth (EPL, 14:00Z in the committed slate) is that card; the clock is the same 12:00Z.
    const CHELSEA = '401878775'
    const mkAhead = ids => {
      const slate = JSON.parse(readFileSync('data/context-2026-10-10.json', 'utf8'))
      slate.games.regular = slate.games.regular.filter(g => ids.includes(String(g.espn_event_id)))
        .map(g => ({ ...g, home_score: null, away_score: null, finalized_at: null }))
      slate.games.postseason = []
      return slate
    }

    // (d) a card whose kickoff is ahead is not asked about, and the poll is armed so the silence is not an absence of timer: it asks once the window opens
    {
      const ctx = await browser.newContext({ viewport: { width: 1000, height: 1400 } })
      const pg = await ctx.newPage()
      const errs = []
      pg.on('pageerror', e => errs.push(e.message))
      const asked = []
      await routesFor(pg, mkAhead([CHELSEA]), r => {
        asked.push(new URL(r.request().url()).searchParams.get('sport'))
        return r.fulfill({ contentType: 'application/json', body: feedFor('epl', CHELSEA, 0, 0, "1'") })
      })
      await pg.clock.install({ time: new Date(AT) })
      await instrument(pg)
      await pg.goto(UNPINNED, { waitUntil: 'networkidle' })
      await pg.waitForSelector('.desk-card', { timeout: 15_000 })
      await pg.waitForTimeout(400)
      for (let i = 0; i < 3; i++) {
        await pg.clock.fastForward(60_000)
        await pg.waitForTimeout(250)
      }
      const beforeKickoff = asked.length
      const armed = await alive(pg)
      await pg.clock.fastForward(2 * 60 * 60 * 1000)
      const inPlay = await settle(pg, LATE, { score: '0–0' })
      check('a card two hours before its kickoff is not asked about, at load or across three ticks, while the poll is armed',
        beforeKickoff === 0 && armed === 1, JSON.stringify({ beforeKickoff, armed }))
      check('...and once the clock is past its kickoff the next tick asks once and the card is told the score',
        asked.length === 1 && mismatches(inPlay, { score: '0–0', live: "1'", status: WORDS.inProgress }).length === 0, JSON.stringify({ asked, card: inPlay }))
      check('no page errors with a card ahead of its window', errs.length === 0, errs.join(' | '))
      await ctx.close()
    }

    // (e) a failed feed is told only the cards inside their window: the card in play says so, a card of the same league hours ahead says nothing
    {
      const ctx = await browser.newContext({ viewport: { width: 1000, height: 1400 } })
      const pg = await ctx.newPage()
      const errs = []
      pg.on('pageerror', e => errs.push(e.message))
      await routesFor(pg, mkAhead([ARSENAL_LEEDS_ESPN, CHELSEA]), r => r.fulfill({ status: 503, body: 'down' }))
      await pg.clock.install({ time: new Date(AT) })
      await pg.goto(UNPINNED, { waitUntil: 'networkidle' })
      await pg.waitForSelector('.desk-card', { timeout: 15_000 })
      const inWindow = await settle(pg, EARLY, { live: WORDS.unavailable })
      await pg.waitForTimeout(300)
      const ahead = await readCard(pg, LATE)
      check('a 503 is told to the card in its window and not to a card of the same league two hours before its kickoff: no note, no reason',
        inWindow.live === WORDS.unavailable && ahead.live === '' && ahead.why === null, JSON.stringify({ inWindow: inWindow.live, ahead: { live: ahead.live, why: ahead.why } }))
      check('no page errors when the feed fails beside a card ahead of its window', errs.length === 0, errs.join(' | '))
      await ctx.close()
    }

    // (h) half time through the poll, from added time in play to the break to the second half. The flag is per SPORT FEED here (the other league's game in play keeps its clock; per game within one
    // feed is the Suite's), and `isStoppage` is NOT `isHalftime` (fix-review round 3, defence F3): the relay sets them independently and every captured body had them equal, so the first answer is
    // added time with the ball in play (`45'+2'`, stoppage true, half time false) and must read as its clock. The break itself reads `45'+3'` with both true (captured 2026-11-11), which on its own
    // reads as stoppage time in play; the owner approved a `Half time` note.
    {
      const ctx = await browser.newContext({ viewport: { width: 1000, height: 1400 } })
      const pg = await ctx.newPage()
      const errs = []
      pg.on('pageerror', e => errs.push(e.message))
      const n = { epl: 0 }
      const bodies = [
        feedFor('epl', ARSENAL_LEEDS_ESPN, 3, 0, "45'+2'", { elapsed: 45, isStoppage: true, isHalftime: false }),
        feedFor('epl', ARSENAL_LEEDS_ESPN, 3, 0, "45'+3'", { elapsed: 45, isStoppage: true, isHalftime: true }),
        feedFor('epl', ARSENAL_LEEDS_ESPN, 3, 0, "46'", { elapsed: 46, isStoppage: false, isHalftime: false }),
      ]
      await routesFor(pg, mk(), r => {
        const key = new URL(r.request().url()).searchParams.get('sport')
        if (key === 'epl') return r.fulfill({ contentType: 'application/json', body: bodies[Math.min(n.epl++, bodies.length - 1)] })
        return r.fulfill({ contentType: 'application/json', body: FEEDS[key] ?? JSON.stringify({ games: [] }) })
      })
      await pg.clock.install({ time: new Date(AT) })
      await pg.goto(UNPINNED, { waitUntil: 'networkidle' })
      await pg.waitForSelector('.desk-card', { timeout: 15_000 })
      const inAddedTime = await settle(pg, EARLY, { live: "45'+2'" })
      check('a game in added time of the first half, ball in play (stoppage true, half time false), reads its clock and not Half time',
        mismatches(inAddedTime, { score: '3–0', status: WORDS.inProgress, live: "45'+2'" }).length === 0, JSON.stringify(inAddedTime))
      await pg.clock.fastForward(60_000)
      const atBreak = await settle(pg, EARLY, { live: WORDS.halfTime })
      const other = await settle(pg, 'Rayo v Athletic', { score: '2–2' })
      check('one tick later the same game at the break reads Half time with its score, not the clock `45\'+3\'`, and the other league\'s game in play keeps its clock',
        mismatches(atBreak, { score: '3–0', status: WORDS.inProgress, live: WORDS.halfTime }).length === 0 && mismatches(other, { live: "50'", status: WORDS.inProgress }).length === 0, JSON.stringify({ atBreak, other }))
      await pg.clock.fastForward(60_000)
      const resumed = await settle(pg, EARLY, { live: "46'" })
      check('...and one tick later, with the flag clear, the note is the clock again', n.epl === 3 && mismatches(resumed, { score: '3–0', live: "46'", status: WORDS.inProgress }).length === 0 && resumed.why === null, JSON.stringify({ asked: n.epl, resumed }))
      check('no page errors across half time', errs.length === 0, errs.join(' | '))
      await ctx.close()
    }
  }

  await browser.close()
  finish(summarize())
}
