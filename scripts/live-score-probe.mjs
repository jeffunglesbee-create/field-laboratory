// THE LIVE SCORE ON A SOCCER CARD, ON THE DEPLOYED PAGE, AT REAL TIME, FROM A RUNNER.
// docs/CC-CMD-2026-11-11-soccer-live-scores.md, Task 8 and its Done condition.
//
// `live-score-render-check.mjs` drives a card through a mocked feed at a fake clock: wiring. It cannot prove the one thing a
// reader sees: a real match in play, on the page that is live, with the score the relay serves at that moment. This does.
//
// IT CANNOT RUN ON EVERY DAY. A card shows a live score only while a lab-covered soccer match is in play, so a run at any other
// time answers NOTHING-TO-JUDGE, which is NOT a pass and exits non-zero: an honest "no live game" is worth more than a green line
// that never saw one. The first lab-covered matches after this was written: 2026-11-11 EFL Trophy 19:00Z, 2026-11-17 EFL Trophy 19:00Z, the
// 2026-11-19 ET MLS matches, 2026-11-20 Bundesliga / Ligue 1 / La Liga, 2026-11-21 EPL 12:30Z.
//
// WHAT IT DOES. Opens `<site>/?date=<ET day>` in a real Chromium with no mock and no fake clock and watches it for a period
// (default 70 s, so a 60 s tick has fired). It records every request the PAGE makes to `/v2/games` and every 200 body the page
// received, in order. Then it reads every soccer card and judges each against the LAST reading the page itself received for that
// game: a card can only show what the page was told, and a second fetch from the runner is a different instant (a clock moves every
// minute), so comparing the two would fail a correct card. The runner's own fetch of the feed is used for one thing only: a game it
// sees `live` that the page never received a reading for is a failure, so a page that never polled cannot pass by having nothing to
// compare. The card carries only the archive row's id (`data-game-id`, e.g. `2026-10-10-mls-stl-la`, read from
// data/context-2026-10-10.json), NOT an ESPN id, so the probe reads `/context/date/<day>` itself and joins
// card id -> `espn_event_id` -> the feed's `espnEventId`. A card whose row has no ESPN id is counted as unjoined, not skipped.
//   - the page was told `live`: the card says In progress, shows that score, shows that clock as its note, no forecast, and is
//     not `Scheduled` or `Start time passed`;
//   - told `final` and the archive has not finalised it: In progress with the Full time note and the final score, or Final;
//   - told `pre`: not In progress.
// `scheduledAfterKickoff` is true when ANY soccer card reads `Scheduled ...` while the feed says it is live or over: the bug this
// feature exists to remove (Man Utd v Aston Villa, 2026-11-08).
//
// WHAT IT DOES NOT SAY (Rule 91). That a score is right: the card is compared with what the relay served, and the feed's accuracy
// is ESPN's. It reports `checked N of M soccer cards` where it is read; a card with no ESPN id or no reading is counted, not judged.
//
// Usage:  node scripts/live-score-probe.mjs --self-test
//         URL=https://field-laboratory.jeffunglesbee.workers.dev node scripts/live-score-probe.mjs [--date YYYY-MM-DD] [--watch 70]
//         The automated path is .github/workflows/live-score-probe.yml.

import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { createChecks, finish, isMain, fieldDay } from './checks.mjs'

const SITE = (process.env.URL || 'https://field-laboratory.jeffunglesbee.workers.dev').replace(/\/+$/, '')
export const RELAY = 'https://field-relay-nba.jeffunglesbee.workers.dev'

/** The laboratory's soccer sports by label (src/Desk.fs `sportMeta`, `IsSoccer = true`), spelled out. */
export const SOCCER = [
  'MLS', 'EFL Cup', 'La Liga', 'EPL', 'Ligue 1', 'Serie A', 'Bundesliga',
  'UEFA Champions League', 'UEFA Champions League Qualifying', 'UEFA Europa League', 'UEFA Europa League Qualifying',
  'UEFA Europa Conference League', 'UEFA Europa Conference League Qualifying', 'FIFA World Cup', 'EFL Trophy', 'FA Cup',
]

/** The archive's rows (`/context/date` body, `games.regular` + `games.postseason`) as `row.id -> String(espn_event_id)`. A row with no ESPN id is absent. */
export const espnByRowId = ctx =>
  new Map([...(ctx?.games?.regular ?? []), ...(ctx?.games?.postseason ?? [])]
    .filter(r => r && r.id != null && r.espn_event_id != null)
    .map(r => [String(r.id), String(r.espn_event_id)]))

/** The ESPN id for a card's `data-game-id`, or null when the archive row carries none. */
export const espnIdOfCard = (gameId, byRowId) => byRowId.get(String(gameId ?? '')) ?? null

const arrow = (h, a) => `${h}–${a}`

/** One card against the LAST reading the page itself received for its game. Returns { kind, ok, reason }.
 *  The page's own response is the oracle, not a second fetch from the runner: a second fetch is a different instant, and a clock
 *  moves every minute, so comparing the two would fail a correct card. `last` is { state, home, away, clock }. */
export const judgeCard = (card, last) => {
  const bad = reason => ({ kind: last.state, ok: false, reason })
  const inProgress = card.status === 'In progress'
  if (last.state === 'live') {
    if (!inProgress) return bad(`the feed says live and the card says "${card.status}"`)
    if (card.score !== arrow(last.home, last.away)) return bad(`the card shows ${card.score}, the feed ${arrow(last.home, last.away)}`)
    if (card.live !== (last.clock || '')) return bad(`the card's clock note is "${card.live}", the feed's "${last.clock || ''}"`)
    if (card.forecast !== null && card.forecast !== 'none') return bad(`a card in play carries a forecast (${card.forecast})`)
    return { kind: 'live', ok: true, reason: '' }
  }
  if (last.state === 'final') {
    if (inProgress && card.live === 'Full time' && card.score === arrow(last.home, last.away)) return { kind: 'final', ok: true, reason: '' }
    if (/^Final/.test(card.status)) return { kind: 'final', ok: true, reason: '' }
    return bad(`the feed says final and the card says "${card.status}" with note "${card.live}" and score ${card.score}`)
  }
  if (last.state === 'pre') {
    if (inProgress) return bad('the feed says pre and the card says In progress')
    return { kind: 'pre', ok: true, reason: '' }
  }
  return bad(`the feed's state "${last.state}" is not one the page reads`)
}

/** The probe's verdict over every soccer card.
 *   cards      read from the DOM;  byRowId   archive row id -> ESPN id (from /context/date);
 *   pageReads  ESPN id -> the games the PAGE received from /v2/games, in order (its own responses);
 *   runnerLive the ESPN ids the RUNNER's own fetch of the feed says are live (an independent view);
 *   requests   the page's requests to /v2/games. */
export const judge = ({ cards, byRowId, pageReads, runnerLive, requests }) => {
  const rows = cards.map(c => {
    const id = espnIdOfCard(c.gameId, byRowId)
    if (id === null) return { ...c, espnId: null, kind: 'unjoined', ok: true, reason: '' }
    const reads = pageReads[id] ?? []
    if (reads.length === 0) {
      return runnerLive.has(id)
        ? { ...c, espnId: id, kind: 'live-unread', ok: false, reason: 'the feed says live and the page never received a reading for it' }
        : { ...c, espnId: id, kind: 'no-reading', ok: true, reason: '' }
    }
    return { ...c, espnId: id, ...judgeCard(c, reads[reads.length - 1]) }
  })
  const live = rows.filter(r => r.kind === 'live')
  const violations = rows.filter(r => !r.ok)
  // Reported, not a verdict of its own: a card that reads Scheduled while its game is live or over is already a violation above
  // (judgeCard fails it, or the game is live-unread), so a second FAIL line here could never be the one that fires.
  const scheduledAfterKickoff = rows.some(r => (r.kind === 'live' || r.kind === 'live-unread' || r.kind === 'final') && /^Scheduled /.test(r.status))
  const judged = rows.filter(r => r.kind !== 'unjoined' && r.kind !== 'no-reading').length
  const out = {
    cardState: live.length ? live[0].status : null,
    scoreMatchesFeed: live.length > 0 && live.every(r => r.ok),
    forecastAbsent: live.length > 0 && live.every(r => r.forecast === null || r.forecast === 'none'),
    scheduledAfterKickoff,
    fullTimeMarker: rows.some(r => r.live === 'Full time'),
    requestsToV2Games: requests.length,
    checked: `checked ${judged} of ${rows.length} soccer cards against the page's own last /v2/games reading (${rows.filter(r => r.kind === 'unjoined').length} with no ESPN id, ${rows.filter(r => r.kind === 'no-reading').length} with no reading); ${live.length} live`,
    rows,
  }
  if (violations.length) return { verdict: 'FAIL', reasons: violations.map(v => `${v.teams}: ${v.reason}`), ...out }
  if (live.length === 0) return { verdict: 'NOTHING-TO-JUDGE', reasons: ['no lab-covered soccer game is live on this slate'], ...out }
  if (requests.length === 0) return { verdict: 'FAIL', reasons: ['a game is live and the page made no request to /v2/games'], ...out }
  return { verdict: 'PASS', reasons: [], ...out }
}

/** Only PASS is green: a verdict of NOTHING-TO-JUDGE or FAIL is a non-zero exit (CC-CMD Task 8, "NOTHING-TO-JUDGE stays red"). */
export const exitCodeOf = verdict => (verdict === 'PASS' ? 0 : 1)

// --- self-test ---------------------------------------------------------------

const SELF_TEST = isMain(import.meta.url) && process.argv.includes('--self-test')

if (SELF_TEST) {
  const { check, summarize } = createChecks()
  const ID_A = '2026-11-11-eflt-bar-old', ID_B = '2026-11-11-eflt-shw-acc', ID_C = '2026-11-11-eflt-xxx-yyy'
  const byRowId = new Map([[ID_A, '401911177'], [ID_B, '401906340']])
  const card = (o = {}) => ({ gameId: ID_A, teams: 'Barnsley v Oldham', sport: 'EFL Trophy', score: '1–0', status: 'In progress', live: "34'", forecast: null, ...o })
  const live = (o = {}) => ({ state: 'live', home: 1, away: 0, clock: "34'", ...o })
  const pre = { state: 'pre', home: 0, away: 0, clock: "0'" }
  const final = { state: 'final', home: 2, away: 1, clock: "90'" }
  const SCHED = 'Scheduled 2026-11-11T19:00Z (parsed 19:00)'
  const j = (c, g) => judgeCard(c, g)

  const ctx = { games: { regular: [{ id: ID_A, espn_event_id: 401911177 }, { id: 'no-espn', espn_event_id: null }], postseason: [{ id: ID_B, espn_event_id: '401906340' }] } }
  const m = espnByRowId(ctx)
  check('the archive rows become row id -> ESPN id, regular and postseason, numbers as strings, null ids absent',
    m.get(ID_A) === '401911177' && m.get(ID_B) === '401906340' && !m.has('no-espn') && m.size === 2)
  check('a body with no games gives an empty map, not a throw', espnByRowId({}).size === 0 && espnByRowId(null).size === 0)
  check('a card id is joined through the map; an unknown id or null is null', espnIdOfCard(ID_A, m) === '401911177' && espnIdOfCard(ID_C, m) === null && espnIdOfCard(null, m) === null)

  check('a live game shown as the feed says is ok', j(card(), live()).ok === true && j(card(), live()).kind === 'live')
  check('a live game the card calls Scheduled is a failure', j(card({ status: SCHED }), live()).ok === false)
  check('a live game the card says the start time passed for is a failure', j(card({ status: 'Start time passed, no score served' }), live()).ok === false)
  check('a wrong score is a failure', j(card({ score: '0–1' }), live()).ok === false)
  check('a wrong clock is a failure: the page\'s own reading is exact, no slack', j(card({ live: "35'" }), live()).ok === false)
  check('a missing clock note when the feed has a clock is a failure', j(card({ live: '' }), live()).ok === false)
  check('a feed with no clock and a card with no note is ok', j(card({ live: '' }), live({ clock: '' })).ok === true)
  check('a forecast on a card in play is a failure', j(card({ forecast: 'model' }), live()).ok === false)
  check('a final game the archive has not finalised is In progress with Full time and the final score', j(card({ live: 'Full time', score: '2–1' }), final).ok === true)
  check('...with the wrong score it is a failure', j(card({ live: 'Full time', score: '0–0' }), final).ok === false)
  check('a final game the archive has finalised is Final', j(card({ status: 'Final', live: '' }), final).ok === true)
  check('a final game that still reads Scheduled is a failure', j(card({ status: SCHED, live: '' }), final).ok === false)
  check('a pre game that reads In progress is a failure', j(card(), pre).ok === false)
  check('a pre game that reads Scheduled is ok', j(card({ status: SCHED, live: '' }), pre).ok === true)
  check('a feed state the page does not read is a failure, named', /suspended/.test(j(card(), { state: 'suspended', home: 0, away: 0, clock: '' }).reason))

  const v = (cards, o = {}) => judge({ cards, byRowId, pageReads: { 401911177: [live()] }, runnerLive: new Set(['401911177']), requests: ['r'], ...o })
  check('a live card shown right, with a request, is a PASS with the Done condition\'s booleans',
    (r => r.verdict === 'PASS' && r.cardState === 'In progress' && r.scoreMatchesFeed && r.forecastAbsent && !r.scheduledAfterKickoff && r.requestsToV2Games === 1)(v([card()])))
  check('only the LAST reading the page received is judged: an older live reading is not',
    v([card({ status: 'Final', live: '' })], { pageReads: { 401911177: [live(), final] } }).verdict === 'NOTHING-TO-JUDGE')
  check('no live game on the page is NOTHING-TO-JUDGE, not a pass',
    v([card({ status: SCHED, live: '' })], { pageReads: { 401911177: [pre] }, runnerLive: new Set() }).verdict === 'NOTHING-TO-JUDGE')
  check('a live game and no request to the feed is a FAIL', v([card()], { requests: [] }).verdict === 'FAIL')
  check('a game the runner sees live and the page never read is a FAIL naming it, and cannot hide as no reading',
    (r => r.verdict === 'FAIL' && /never received/.test(r.reasons[0]))(v([card({ status: SCHED, live: '' })], { pageReads: {} })))
  check('...and it sets scheduledAfterKickoff when the card reads Scheduled', v([card({ status: SCHED, live: '' })], { pageReads: {} }).scheduledAfterKickoff === true)
  check('a card that reads Scheduled while the page was told live sets scheduledAfterKickoff and FAILs',
    (r => r.verdict === 'FAIL' && r.scheduledAfterKickoff)(v([card({ status: SCHED })])))
  check('one bad card among good ones is a FAIL naming it',
    (r => r.verdict === 'FAIL' && /Sheffield/.test(r.reasons[0]))(v([card(), card({ gameId: ID_B, teams: 'Sheffield Wed v Accrington', score: '9–9' })], { pageReads: { 401911177: [live()], 401906340: [live()] } })))
  check('the coverage line says checked N of M where it is read, and what it did not judge',
    /^checked 1 of 3 soccer cards .*\(1 with no ESPN id, 1 with no reading\); 1 live$/.test(v([card(), card({ gameId: ID_C, teams: 'No id' }), card({ gameId: ID_B, teams: 'No reading' })]).checked))
  check('fullTimeMarker is seen on any card that says Full time', v([card({ live: 'Full time', score: '2–1' })], { pageReads: { 401911177: [final] }, runnerLive: new Set() }).fullTimeMarker === true && v([card()]).fullTimeMarker === false)
  check('only PASS exits 0: FAIL and NOTHING-TO-JUDGE are red, an unknown verdict is red', exitCodeOf('PASS') === 0 && exitCodeOf('FAIL') === 1 && exitCodeOf('NOTHING-TO-JUDGE') === 1 && exitCodeOf(undefined) === 1)
  check('sixteen soccer labels, each distinct', SOCCER.length === 16 && new Set(SOCCER).size === 16)
  finish(summarize())
}

// --- live --------------------------------------------------------------------

export const readCards = page =>
  page.evaluate(soccer =>
    [...document.querySelectorAll('.desk-card')]
      .filter(c => soccer.includes(c.closest('section.sport-group')?.getAttribute('data-sport') ?? ''))
      .map(c => {
        const txt = id => c.querySelector(`[data-testid="${id}"]`)?.textContent ?? null
        return {
          gameId: c.getAttribute('data-game-id'),
          teams: c.querySelector('[data-testid="teams"]')?.textContent ?? '',
          sport: c.closest('section.sport-group')?.getAttribute('data-sport') ?? '',
          score: txt('score'), status: txt('status'), live: txt('live') ?? '',
          forecast: c.querySelector('[data-testid="forecast"]')?.getAttribute('data-forecast') ?? null,
        }
      }), SOCCER)

/** The games of a `/v2/games` body, reduced to what the page reads. */
export const gamesOf = body =>
  (body?.games ?? []).map(g => ({ espnId: String(g.espnEventId), state: g.state, home: g.home?.score ?? null, away: g.away?.score ?? null, clock: g.clock ?? '' }))

const getJson = async url => {
  const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'field-laboratory-live-score-probe' }, signal: AbortSignal.timeout(20000) })
  return { status: r.status, body: await r.json() }
}

if (isMain(import.meta.url) && !SELF_TEST) {
  const args = process.argv.slice(2)
  const arg = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined }
  const date = arg('--date') || fieldDay(new Date())
  const watch = Number(arg('--watch') ?? 70)
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {})
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 1500 } })).newPage()

  // The page's own traffic to the feed: every request, and every 200 body it received, in order. This is the oracle a card is
  // judged against: the card can only show what the page was told.
  const requests = []
  const responses = []
  const pending = []
  page.on('request', r => { if (r.url().startsWith(`${RELAY}/v2/games`)) requests.push(r.url()) })
  page.on('response', r => {
    if (!r.url().startsWith(`${RELAY}/v2/games`)) return
    pending.push(r.json().then(body => responses.push({ url: r.url(), status: r.status(), games: gamesOf(body) }), () => responses.push({ url: r.url(), status: r.status(), games: [] })))
  })
  const errors = []
  page.on('pageerror', e => errors.push(e.message))

  await page.goto(`${SITE}/?date=${date}`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.desk-card', { timeout: 20_000 })
  await page.waitForTimeout(watch * 1000)
  await Promise.all(pending)
  const cards = await readCards(page)

  // The archive rows the page joined on, read the way the page reads them, so a card's id can be taken to an ESPN id.
  const ctx = await getJson(`${RELAY}/context/date/${date}`)
  const byRowId = espnByRowId(ctx.body)
  // The runner's own, independent look at the feed for every key the page asked about.
  const keys = [...new Set(requests.map(u => new URL(u).searchParams.get('sport')))].filter(Boolean)
  const runner = (await Promise.all(keys.map(k => getJson(`${RELAY}/v2/games?sport=${k}&date=${date}`)))).flatMap(r => gamesOf(r.body))
  const runnerLive = new Set(runner.filter(g => g.state === 'live').map(g => g.espnId))
  const pageReads = {}
  for (const r of responses) if (r.status === 200) for (const g of r.games) (pageReads[g.espnId] ??= []).push(g)

  const result = judge({ cards, byRowId, pageReads, runnerLive, requests })

  mkdirSync('outbox', { recursive: true })
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-') + 'Z'
  const shot = `outbox/live-score-${date}-${stamp}.png`
  await page.screenshot({ path: shot, fullPage: true })
  let deployed = null
  try { deployed = (await (await fetch(`${SITE}/version.txt`)).text()).trim() } catch { /* the manifest says null */ }
  const manifest = {
    site: SITE, date, probedAt: new Date().toISOString(), deployed, watchSeconds: watch, feedKeys: keys, errors,
    contextStatus: ctx.status, archiveRowsWithEspnId: byRowId.size,
    pageResponses: responses.map(r => ({ url: r.url, status: r.status, games: r.games.length })),
    runnerLiveEspnIds: [...runnerLive], screenshot: shot, ...result,
  }
  const out = `outbox/live-score-manifest-${date}-${stamp}.json`
  writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n')
  await browser.close()

  console.log(`${result.verdict}  ${result.checked}; requests to /v2/games: ${requests.length}; manifest ${out}`)
  for (const r of result.reasons) console.log(`  - ${r}`)
  // Only PASS is green. NOTHING-TO-JUDGE exits 1 too, as forecast-live-probe's does: a run that saw no game in play proved nothing,
  // and a green job would say it did (CC-CMD Task 8: "NOTHING-TO-JUDGE stays red").
  process.exit(exitCodeOf(result.verdict))
}
