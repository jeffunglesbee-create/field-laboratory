// THE LIVE SCORE ON A CARD, ON THE DEPLOYED PAGE, AT REAL TIME, FROM A RUNNER.
// docs/CC-CMD-2026-11-11-soccer-live-scores.md, Task 8 and its Done condition; and, from 2026-11-22 (owner: NBA, NHL and the other sports are needed), every sport the page asks the feed about:
// the sixteen soccer labels and NBA, WNBA, NHL, MLB, NFL, CFB and AFL (`LABEL_TO_KEY`). A card is joined by ESPN event id, or, for NHL whose feed carries none, by the two club names.
//
// `live-score-render-check.mjs` drives a card through a mocked feed at a fake clock: wiring. It cannot prove the one thing a
// reader sees: a real match in play, on the page that is live, with the score the relay serves at that moment. This does.
//
// IT CANNOT RUN ON EVERY DAY. A card shows a live score only while a game of a covered sport is in play, so a run at any other
// time answers NOTHING-TO-JUDGE, which is NOT a pass and exits non-zero: an honest "no live game" is worth more than a green line
// that never saw one. The first lab-covered matches after this was written: 2026-11-11 EFL Trophy 19:00Z, 2026-11-17 EFL Trophy
// 19:00Z, the 2026-11-19 ET MLS matches, 2026-11-20 Bundesliga / Ligue 1 / La Liga, 2026-11-21 EPL 12:30Z.
//
// WHAT IT DOES. Opens `<site>/?date=<ET day>` in a real Chromium with no mock and no fake clock and watches it for a period
// (default 70 s, so a 60 s tick has fired). It records, in order, every /v2/games poll the PAGE makes and how each ended: a body
// the page's own decoder would accept (strict, as src/LiveFeed.fs), an HTTP error, an unreadable body, or no answer at all. Then it
// reads every live-score card (soccer, NBA, WNBA, NHL, MLB, NFL, CFB, AFL) and judges it against what the page was LAST told for that card's game: a card can only show what the
// page was told, and a second fetch from the runner is a different instant (a clock moves every minute).
//
// THE RUNNER'S OWN VIEW exists for one thing, and it is derived from the CARDS, not from the page's requests (a page that never
// polls makes no request, and a view keyed on requests would then see nothing and read "no game is live" in exactly the failure
// the probe exists for): for every sport key a card maps to (`LABEL_TO_KEY`), the runner fetches the feed itself, and a game
// it sees `live` that the page never received a reading for is a FAIL (`live-unread`).
//
// A card is joined card id -> archive row (`/context/date`, read by the runner) -> `espn_event_id` -> the feed's `espnEventId`.
// The card carries only the archive row's id (`2026-10-10-mls-stl-la` or `EPL_2026-10-10_e401879268`), so the join goes through the
// row, never through the spelling of the id. The row also gives the start time, which is the poll's window (kickoff to +3 h): a
// card outside it is never handed a reading by the page and is counted, not judged.
//
// WHAT IT SAYS ABOUT A CARD, given the page's last answer for its game:
//   - a good body with the game `live`: In progress, that score, that clock as the note, no forecast, never Scheduled / Start time passed;
//   - `final` and the archive has not finalised it: In progress with the Full time note and the final score, or Final;
//   - `pre`: not In progress;
//   - the last poll FAILED after an earlier one succeeded, or the body has no such game: the note says the score is unavailable;
//   - the page NEVER received a reading for a game the runner sees live: FAIL (a dead poll, a blocked route, a window that never opened).
// And the page itself must be on the LIVE slate: `#decode-status` is `ok`, not the committed capture the page falls back to.
//
// WHAT IT DOES NOT SAY (Rule 91). That a score is right: the card is compared with what the relay served, and the feed's accuracy is
// ESPN's. It reports `checked N of M live-score cards` where it is read; a card with no ESPN id, outside its window or with no reading
// is counted, not judged. `forecastChecked` says how many live cards even carry a forecast node (only EPL does): `forecastAbsent`
// over zero cards is null, not true.
//
// The glue (listeners, readCards, the manifest, the verdict) is `probe()`, run by `--e2e` against the local page with the relay's
// routes mocked, so it has run before it ever runs against the relay. What `--e2e` cannot show is the real relay's bodies.
//
// Usage:  node scripts/live-score-probe.mjs --self-test            (pure logic, no browser)
//         node scripts/live-score-probe.mjs --e2e                  (the glue, against the local page; needs `node scripts/serve.mjs`)
//         URL=https://field-laboratory.jeffunglesbee.workers.dev PROBE_DATE=YYYY-MM-DD PROBE_WATCH=70 node scripts/live-score-probe.mjs
//         The automated path is .github/workflows/live-score-probe.yml.

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { createChecks, finish, isMain, fieldDay } from './checks.mjs'
import { sameClub } from './probe-espn-id-collisions.mjs'

const SITE = (process.env.URL || 'https://field-laboratory.jeffunglesbee.workers.dev').replace(/\/+$/, '')
export const RELAY = 'https://field-relay-nba.jeffunglesbee.workers.dev'

/** The laboratory's soccer sports by label, and the relay's /v2/games key for each (src/LiveScore.fs `liveSportKey`). Derived from nothing:
 *  `scripts/check-live-probe-keys.mjs` compares it with the compiled registry on every push, so a sport added there fails there. */
export const LABEL_TO_KEY = {
  'EPL': 'epl', 'MLS': 'mls', 'La Liga': 'laliga', 'Serie A': 'seriea', 'Bundesliga': 'bundesliga', 'Ligue 1': 'ligue1',
  'UEFA Champions League': 'ucl', 'UEFA Champions League Qualifying': 'uclqual', 'UEFA Europa League': 'europa',
  'UEFA Europa League Qualifying': 'europaqual', 'UEFA Europa Conference League': 'conference',
  'UEFA Europa Conference League Qualifying': 'conferencequal', 'FIFA World Cup': 'wc26', 'EFL Cup': 'eflcup',
  'EFL Trophy': 'efltrophy', 'FA Cup': 'facup',
  // Owner, 2026-11-22: the other sports the relay's /v2/games serves.
  'NBA': 'nba', 'WNBA': 'wnba', 'NHL': 'nhl', 'MLB': 'mlb', 'NFL': 'nfl', 'CFB': 'cfb', 'AFL': 'afl',
}
/** The sixteen soccer labels, spelled out (src/Desk.fs `IsSoccer`). */
export const SOCCER = [
  'EPL', 'MLS', 'La Liga', 'Serie A', 'Bundesliga', 'Ligue 1', 'UEFA Champions League', 'UEFA Champions League Qualifying', 'UEFA Europa League',
  'UEFA Europa League Qualifying', 'UEFA Europa Conference League', 'UEFA Europa Conference League Qualifying', 'FIFA World Cup', 'EFL Cup', 'EFL Trophy', 'FA Cup',
]
export const OTHER_LIVE = ['NBA', 'WNBA', 'NHL', 'MLB', 'NFL', 'CFB', 'AFL']
export const LIVE_LABELS = [...SOCCER, ...OTHER_LIVE]
/** The labels whose card shows the AWAY score first (src/Desk.fs `Matchup = AwayAtHome`); soccer and AFL are home first. `scripts/check-live-probe-keys.mjs` holds this to the compiled registry. */
export const AWAY_FIRST = new Set(['NBA', 'WNBA', 'NHL', 'MLB', 'NFL', 'CFB'])

/** The page's words, spelled out in full on purpose (a typo in the page must not be forgiven by a check that derives the same string). */
export const WORDS = { inProgress: 'In progress', halfTime: 'Half time', fullTime: 'Full time', gameOver: 'Game over', unavailable: 'live score unavailable' }
/** The poll's window after a start time, by label (src/LiveScore.fs `liveWindowFor`; `scripts/check-live-probe-keys.mjs` holds the table to it): soccer 3 h, NBA, WNBA, NHL and AFL 3.5 h, NFL 4 h, MLB and CFB 4.5 h. */
export const WINDOW_H = { NBA: 3.5, WNBA: 3.5, NHL: 3.5, AFL: 3.5, NFL: 4, MLB: 4.5, CFB: 4.5 }
export const windowMsOf = label => (WINDOW_H[label] ?? 3) * 3600_000
/** The word for a game the feed says is over and the archive has not finalised: soccer keeps the owner's `Full time`, every other sport says `Game over`. */
export const overWordOf = label => (SOCCER.includes(label) ? WORDS.fullTime : WORDS.gameOver)
/** A card whose window opened this recently may not have been asked yet: the next tick is up to a minute away. */
export const JUST_OPENED_MS = 90_000

const arrow = (h, a) => `${h}–${a}`
/** The score as the card draws it: the away score first for NBA, WNBA, NHL, MLB, NFL and CFB (`AwayAtHome`), the home score first otherwise. */
export const arrowFor = (label, h, a) => (AWAY_FIRST.has(label) ? arrow(a, h) : arrow(h, a))

// --- reading the feed the way the page does ----------------------------------

// The page's `wholeScore` (src/LiveFeed.fs): a JSON number that is whole, from 0 to the largest int32, or nothing. A numeric string is NOT one, and neither is a negative number.
const intOrNull = v =>
  v === undefined || v === null ? { ok: true, v: null } : typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 2147483647 ? { ok: true, v } : { ok: false }

/** A team of a game: nothing, null, or an object (not an array). The page reads `home.score` through a path, and a team that is a string, a number or a list is an
 *  error there (`Decode.Optional.At` accepts a null or absent team and nothing else). Held to the page's decoder by `scripts/check-live-probe-keys.mjs`. */
const teamOk = t => t === undefined || t === null || (typeof t === 'object' && !Array.isArray(t))

/** The page's `situation.isHalftime` (src/LiveFeed.fs `IsHalftime`): `situation` is absent, null or an object (not a string, a number or a list), and the flag in it is absent, null or a boolean.
 *  Absent, null and false all read false. Held to the page's decoder by `scripts/check-live-probe-keys.mjs`. */
const halftimeOf = s => {
  if (s === undefined || s === null) return { ok: true, v: false }
  if (typeof s !== 'object' || Array.isArray(s)) return { ok: false }
  const f = s.isHalftime
  return f === undefined || f === null ? { ok: true, v: false } : typeof f === 'boolean' ? { ok: true, v: f } : { ok: false }
}

/** A `/v2/games` body as `src/LiveFeed.fs` `decodeFeed` reads it: a `games` list, every game an object with a string `state`, an `espnEventId` that is a string, absent or null, and
 *  (when there is no id) BOTH club names as strings (NHL: the feed has no ESPN id and is joined by name); a score is an integer or absent, a clock and a period label strings or absent. ONE bad game
 *  fails the whole feed, as it does on the page. Held to the page's decoder by `scripts/check-live-probe-keys.mjs`. */
export const decodeFeed = body => {
  if (!body || typeof body !== 'object' || !Array.isArray(body.games)) return { ok: false, why: 'no games list' }
  const games = []
  const optString = v => v === undefined || v === null || typeof v === 'string'
  for (const g of body.games) {
    if (!g || typeof g !== 'object') return { ok: false, why: 'a game is not an object' }
    if (!optString(g.espnEventId)) return { ok: false, why: 'a game has an espnEventId that is not a string' }
    if (typeof g.state !== 'string') return { ok: false, why: 'a game has no string state' }
    if (!teamOk(g.home) || !teamOk(g.away)) return { ok: false, why: 'a team is not an object' }
    if (!optString(g.home?.name) || !optString(g.away?.name)) return { ok: false, why: 'a club name is not a string' }
    const h = intOrNull(g.home?.score), a = intOrNull(g.away?.score)
    if (!h.ok || !a.ok) return { ok: false, why: 'a score is not a whole number from 0 to the int32 maximum' }
    if (g.clock !== undefined && g.clock !== null && typeof g.clock !== 'string') return { ok: false, why: 'a clock is not a string' }
    if (!optString(g.periodLabel)) return { ok: false, why: 'a periodLabel is not a string' }
    const ht = halftimeOf(g.situation)
    if (!ht.ok) return { ok: false, why: 'situation is not an object, or isHalftime is not a boolean' }
    const espnId = g.espnEventId ?? null, homeName = g.home?.name ?? null, awayName = g.away?.name ?? null
    if (espnId === null && (homeName === null || awayName === null)) return { ok: false, why: 'a game with neither an espnEventId nor both team names cannot be joined to a card' }
    games.push({ espnId, homeName, awayName, periodLabel: g.periodLabel ?? null, state: g.state, home: h.v, away: a.v, clock: g.clock ?? '', halftime: ht.v })
  }
  return { ok: true, games }
}

/** The archive rows of a `/context/date` body (`games.regular` + `games.postseason`) as `row id -> { espnId, startMs, home, away }`. A row with no ESPN id is absent. The club names are for the games the feed gives no id (NHL). */
export const rowsOf = ctx =>
  new Map([...(ctx?.games?.regular ?? []), ...(ctx?.games?.postseason ?? [])]
    .filter(r => r && r.id != null && r.espn_event_id != null)
    .map(r => [String(r.id), { espnId: String(r.espn_event_id), startMs: Date.parse(r.start_time ?? ''), home: r.home ?? '', away: r.away ?? '' }]))

/** The game of a decoded feed a row is, or `undefined` (src/LiveFeed.fs `readingFor`): by ESPN event id; failing that, the ONE game with no id whose two club names match the row's, home to home and away to away
 *  (`sameClub`: the subset test or initials, which is what the page's `Desk.sameTeam` is). Two such games is no join: the page says so on the card. */
export const gameFor = (games, row) => {
  const byId = games.find(g => g.espnId !== null && g.espnId === row.espnId)
  if (byId) return byId
  const named = games.filter(g => g.espnId === null && g.homeName !== null && g.awayName !== null && sameClub(row.home, g.homeName) && sameClub(row.away, g.awayName))
  return named.length === 1 ? named[0] : undefined
}

// --- judging a card ------------------------------------------------------------

/** Does the card show the score the page was told? */
export const scoreMatches = (card, last) => card.score === arrowFor(card.sport, last.home, last.away)
/** Is the card free of a forecast? `none` is the page's own word for an EPL card with no line to draw, and no node at all is `null`. */
export const forecastFree = card => card.forecast === null || card.forecast === 'none'

/** The note the page draws beside the score for a game in play (src/LiveFeed.fs `liveClockText`). Soccer: the feed's clock, verbatim. Other sports: the period and the clock, `Q2 6:17`, `P2 10:11`;
 *  baseball says the inning alone, `Top 5` / `Bot 7` for the relay's `T5` / `B7`, and the clock only when it has no inning. Empty when the feed carried neither. Held to the page by the Suite and the render check. */
export const liveNoteOf = (label, g) => {
  const clock = g.clock ?? ''
  if (SOCCER.includes(label)) return clock
  let period = g.periodLabel ?? ''
  if (label === 'MLB' && /^[TB]\d/.test(period)) period = (period[0] === 'T' ? 'Top ' : 'Bot ') + period.slice(1)
  if (period && label === 'MLB') return period
  return period && clock ? `${period} ${clock}` : period || clock
}

/** One card against the game the page was last told about. Returns { kind, ok, reason }. The card's `sport` is its label, which decides the score order, the note and the word for a finished game. */
export const judgeCard = (card, last) => {
  const label = card.sport
  // `post` is the relay's closing word for every ESPN sport but NBA; the page reads it as `final`, and so is it recorded.
  const kind = last.state === 'post' ? 'final' : last.state
  const bad = reason => ({ kind, ok: false, reason })
  const inProgress = card.status === WORDS.inProgress
  const scoreless = last.home === null || last.away === null
  const over = last.state === 'final' || last.state === 'post'
  // A game the archive has finalised is Final and carries no live note, whatever the feed says (the archive wins): judged before anything the feed says.
  if (/^Final/.test(card.status)) return card.live === '' ? { kind: 'final', ok: true, reason: '' } : bad(`the card is Final and carries the note "${card.live}"`)
  // A live or final game the feed serves with no score: the page reads it as `LiveUnavailable` and says so, on every sport.
  if ((last.state === 'live' || over) && scoreless)
    return card.live === WORDS.unavailable ? { kind: 'feed-unavailable', ok: true, reason: '' } : bad(`the feed says ${last.state} and carries no score, and the card's note is "${card.live}", not "${WORDS.unavailable}"`)
  if (last.state === 'live') {
    if (!inProgress) return bad(`the feed says live and the card says "${card.status}"`)
    if (!scoreMatches(card, last)) return bad(`the card shows ${card.score}, the feed ${arrowFor(label, last.home, last.away)}`)
    // At half time the feed's clock still reads the first half's last minute (`45'+3'`) and the page says `Half time` instead (owner approved 2026-11-11), on whatever sport the feed flags it.
    const want = last.halftime ? WORDS.halfTime : liveNoteOf(label, last)
    if (card.live !== want) return bad(`the card's note is "${card.live}", ${last.halftime ? 'the feed says half time' : `the feed's clock reads "${want}"`}`)
    if (!forecastFree(card)) return bad(`a card in play carries a forecast (${card.forecast})`)
    return { kind: 'live', ok: true, reason: '' }
  }
  // The over word is Full time for soccer and Game over for the rest.
  if (over) {
    if (inProgress && card.live === overWordOf(label) && scoreMatches(card, last)) return { kind: 'final', ok: true, reason: '' }
    return bad(`the feed says ${last.state} and the card says "${card.status}" with note "${card.live}" and score ${card.score}`)
  }
  if (last.state === 'pre') {
    if (inProgress) return bad('the feed says pre and the card says In progress')
    return card.live === '' ? { kind: 'pre', ok: true, reason: '' } : bad(`the feed says pre and the card carries the note "${card.live}"`)
  }
  // A state word the page does not read: the page says `live score unavailable` (src/LiveFeed.fs `readingFor`), and that is the right card; anything else is not.
  return card.live === WORDS.unavailable ? { kind: 'feed-unavailable', ok: true, reason: '' } : bad(`the feed's state "${last.state}" is not one the page reads, and the card's note is "${card.live}", not "${WORDS.unavailable}"`)
}

/** The kinds a card can have, in the manifest: what was judged, and what was counted without being judged. */
const NOT_JUDGED = new Set(['unjoined', 'out-of-window', 'no-reading'])

/**
 * The probe's verdict over every card of a sport the page asks the feed about. Pure.
 *   cards        read from the DOM: { gameId, teams, sport, score, status, live, forecast }
 *   rows         archive row id -> { espnId, startMs, home, away }   (`rowsOf`)
 *   outcomes     the page's /v2/games polls in order: { key, status, decoded }  (decoded: `decodeFeed`'s answer, or { ok: false, why })
 *   runner       { ok, why: [string], live: [{ key, ...game }] }: the runner's own look, keyed from the cards; every game the feeds serve `live`, with the sport key it came from
 *   requests     how many /v2/games requests the page made
 *   nowMs        the instant the cards were read
 *   decodeStatus { state, text } of the page's `#decode-status`
 */
export const judge = ({ cards, rows, outcomes, runner, requests, nowMs, decodeStatus }) => {
  const byKey = {}
  for (const o of outcomes) (byKey[o.key] ??= []).push(o)
  const rowsOut = cards.map(c => {
    const key = LABEL_TO_KEY[c.sport]
    const row = rows.get(String(c.gameId ?? ''))
    if (!row) return { ...c, espnId: null, kind: 'unjoined', ok: true, reason: '' }
    const id = row.espnId
    const outs = byKey[key] ?? []
    const read = o => o.decoded.ok && gameFor(o.decoded.games, row) !== undefined
    // A game the runner sees live that the page never received a reading for, in or out of its window, whatever the polls did.
    // The page does not ask about a card the archive has finalised (src/LiveScore.fs `pollableAt` reads `Final` as nothing to do), so a Final card has no reading to be missing: it is judged below.
    if (!/^Final/.test(c.status) && gameFor(runner.live.filter(g => g.key === key), row) !== undefined && !outs.some(read)) {
      const ok = outs.filter(o => o.decoded.ok).length
      return { ...c, espnId: id, kind: 'live-unread', ok: false, reason: `the feed says live and the page never received a reading for it (${outs.length} poll(s) of ${key}, ${ok} readable)` }
    }
    const inWindow = Number.isFinite(row.startMs) && nowMs >= row.startMs && nowMs <= row.startMs + windowMsOf(c.sport)
    if (!inWindow) return { ...c, espnId: id, kind: 'out-of-window', ok: true, reason: '' }
    const last = outs.at(-1)
    // Observed 2026-11-22 19:52Z (outbox/live-score-manifest-2026-11-22-20261122-1953Z.json): a La Liga card the archive had finalised, inside its three hours, read `never-asked` and failed the run, though the page is
    // right not to ask about it. Final with no live note is a correct card whatever the feed was asked.
    if (!last && /^Final/.test(c.status))
      return c.live === '' ? { ...c, espnId: id, kind: 'final', ok: true, reason: '' } : { ...c, espnId: id, kind: 'final', ok: false, reason: `the card is Final and carries the note "${c.live}"` }
    if (!last) {
      if (nowMs - row.startMs <= JUST_OPENED_MS) return { ...c, espnId: id, kind: 'no-reading', ok: true, reason: '' }
      return { ...c, espnId: id, kind: 'never-asked', ok: false, reason: `the card is in its live window and the page never asked the feed for ${key}` }
    }
    const game = last.decoded.ok ? gameFor(last.decoded.games, row) : undefined
    if (!game) {
      // The page's last poll failed, or its body has no such game: its own words are "live score unavailable".
      const why = last.decoded.ok ? 'the feed has no game for this card' : `the last poll failed (${last.decoded.why})`
      return c.live === WORDS.unavailable
        ? { ...c, espnId: id, kind: 'feed-unavailable', ok: true, reason: '' }
        : { ...c, espnId: id, kind: 'feed-unavailable', ok: false, reason: `${why} and the card's note is "${c.live}", not "${WORDS.unavailable}"` }
    }
    // A game the page's own polls read `live` and then `pre`: a started game does not un-start. The relay serves a football break or a baseball delay as `pre` (its adapters read only an
    // in-progress status as `live`; not yet read from a body), and the page, which reads `pre` as no reading, puts the card back on what the archive says. That is what a viewer sees, so it is named.
    if (game.state === 'pre' && outs.some(o => o.decoded.ok && gameFor(o.decoded.games, row)?.state === 'live'))
      return { ...c, espnId: id, kind: 'regressed', ok: false, reason: `the feed said this game was live and then pre (a break or a delay the relay serves as pre); the card says "${c.status}"` }
    return { ...c, espnId: id, ...judgeCard(c, game) }
  })

  // A live game with no ESPN id (NHL) that NO card of its sport claims by name. The runner's view and the page both join by name, so a name the matcher cannot pair is invisible to both:
  // the card says `live score unavailable`, which is the page's own answer for a game it cannot join. Counted and, beside a card of that sport saying so, a FAIL.
  const claimedBy = g => rowsOut.some(r => LABEL_TO_KEY[r.sport] === g.key && r.gameId != null && rows.get(String(r.gameId)) && gameFor([g], rows.get(String(r.gameId))) === g)
  const unclaimed = (runner.live ?? []).filter(g => g.espnId === null && !claimedBy(g))
  const unclaimedWithCard = unclaimed.filter(g => rowsOut.some(r => LABEL_TO_KEY[r.sport] === g.key && r.kind === 'feed-unavailable'))
  const live = rowsOut.filter(r => r.kind === 'live')
  const violations = rowsOut.filter(r => !r.ok)
  const withNode = live.filter(r => r.forecast !== null)
  const judged = rowsOut.filter(r => !NOT_JUDGED.has(r.kind)).length
  const count = k => rowsOut.filter(r => r.kind === k).length
  const scheduledAfterKickoff = rowsOut.some(r => (r.kind === 'live' || r.kind === 'live-unread' || r.kind === 'final') && /^(Scheduled |Start time passed)/.test(r.status))
  const fields = {
    cardState: live.length ? live[0].status : null,
    scoreMatchesFeed: live.length > 0 && live.every(r => scoreMatches(r, outcomesGame(byKey, r, rows))),
    // Over the live cards that HAVE a forecast node (EPL only). Zero such cards is null: nothing was checked, which is not "absent".
    forecastChecked: withNode.length,
    forecastAbsent: withNode.length === 0 ? null : withNode.every(r => r.forecast === 'none'),
    scheduledAfterKickoff,
    fullTimeMarker: rowsOut.some(r => r.live === WORDS.fullTime),
    gameOverMarker: rowsOut.some(r => r.live === WORDS.gameOver),
    runnerLiveUnclaimed: unclaimed.map(g => ({ key: g.key, home: g.homeName, away: g.awayName })),
    halfTimeMarker: rowsOut.some(r => r.live === WORDS.halfTime),
    requestsToV2Games: requests,
    checked: `checked ${judged} of ${rowsOut.length} live-score cards against the page's own last /v2/games answer (${count('unjoined')} with no ESPN id, ${count('out-of-window')} outside their window, ${count('no-reading')} with no reading yet); ${live.length} live; ${unclaimed.length} live id-less feed game(s) no card claims`,
    rows: rowsOut,
  }
  const reasons = []
  if (decodeStatus?.state !== 'ok') reasons.push(`the page is not showing the live slate: #decode-status is "${decodeStatus?.state ?? 'absent'}": ${decodeStatus?.text ?? ''}`.trim())
  for (const v of violations) reasons.push(`${v.teams}: ${v.reason}`)
  for (const g of unclaimedWithCard) reasons.push(`the ${g.key} feed has a live game, ${g.awayName} at ${g.homeName}, that no ${g.key} card joins by name, beside a ${g.key} card saying "${WORDS.unavailable}"`)
  let verdict
  if (reasons.length) verdict = 'FAIL'
  else if (!runner.ok) { verdict = 'UNVERIFIED'; reasons.push(...runner.why) }
  else if (live.length === 0) { verdict = 'NOTHING-TO-JUDGE'; reasons.push('no game of a sport the page asks the feed about is live on this slate') }
  else verdict = 'PASS'
  const out = { verdict, reasons, ...fields }
  out.doneCondition = doneConditionOf(out)
  return out
}

/** The game the page was last told about for a live row (it was judged against it, so it exists). */
const outcomesGame = (byKey, card, rows) => gameFor(byKey[LABEL_TO_KEY[card.sport]].at(-1).decoded.games, rows.get(String(card.gameId)))

/** The CC-CMD's Done condition for a manifest: a PASS, a live card In progress, its score the feed's, no forecast on a card that has the node,
 *  and no card reading Scheduled / Start time passed while its game is live or over. One definition, here, so a FAIL with all four booleans
 *  true cannot satisfy it. */
export const doneConditionOf = m =>
  m.verdict === 'PASS' && m.cardState === WORDS.inProgress && m.scoreMatchesFeed === true && m.forecastAbsent !== false && m.scheduledAfterKickoff === false && m.requestsToV2Games > 0

/** Only PASS is green: a verdict of NOTHING-TO-JUDGE, UNVERIFIED, ERROR or FAIL is a non-zero exit (CC-CMD Task 8, "NOTHING-TO-JUDGE stays red"). */
export const exitCodeOf = verdict => (verdict === 'PASS' ? 0 : 1)

/** `--date` is a day, `--watch` a bounded number of seconds; anything else is a usage error (exit 2), as forecast-live-probe's is. */
export const argsOf = ({ date, watch }, today) => {
  const d = date || today
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return { error: `--date wants YYYY-MM-DD, got ${JSON.stringify(date)}` }
  const w = watch === undefined || watch === '' ? 70 : Number(watch)
  if (!Number.isFinite(w) || w < 5 || w > 600) return { error: `--watch wants seconds between 5 and 600, got ${JSON.stringify(watch)}` }
  return { date: d, watch: w }
}

// --- self-test ---------------------------------------------------------------

const SELF_TEST = isMain(import.meta.url) && process.argv.includes('--self-test')
const E2E = isMain(import.meta.url) && process.argv.includes('--e2e')

if (SELF_TEST) {
  const { check, summarize } = createChecks()
  const ROW_A = 'EPL_2026-11-21_e401911177', ROW_B = '2026-11-21-epl-mci-ful', ROW_C = '2026-11-21-epl-xxx-yyy'
  const T0 = Date.parse('2026-11-21T12:30Z')
  const NOW = T0 + 34 * 60_000
  const rows = new Map([[ROW_A, { espnId: '401911177', startMs: T0 }], [ROW_B, { espnId: '401906340', startMs: T0 }]])
  const rowsNoStartB = new Map([[ROW_A, { espnId: '401911177', startMs: T0 }], [ROW_B, { espnId: '401906340', startMs: NaN }]])
  const card = (o = {}) => ({ gameId: ROW_A, teams: 'Barnsley v Oldham', sport: 'EPL', score: '1–0', status: 'In progress', live: "34'", forecast: 'none', ...o })
  const game = (o = {}) => ({ espnId: '401911177', state: 'live', home: 1, away: 0, clock: "34'", ...o })
  const body = games => ({ ok: true, games })
  const poll = (games, key = 'epl') => ({ key, status: 200, decoded: body(games) })
  const failed = (key = 'epl') => ({ key, status: null, decoded: { ok: false, why: 'request failed' } })
  const SCHED = 'Scheduled 2026-11-21T12:30Z (parsed 12:30)'
  const PASSED = 'Start time passed, no score served'
  const okStatus = { state: 'ok', text: 'decoded 7 game(s)' }
  const runnerOk = (...ids) => ({ ok: true, why: [], live: ids.map(id => ({ key: 'epl', espnId: id, homeName: null, awayName: null })) })
  const runnerBlind = why => ({ ok: false, why, live: [] })
  const run = (o = {}) => judge({ cards: [card()], rows, outcomes: [poll([game()])], runner: runnerOk('401911177'), requests: 1, nowMs: NOW, decodeStatus: okStatus, ...o })
  const j = (c, g) => judgeCard(c, g)

  // the decoder, as the page's
  check('a good body decodes, scores and clock read as the page reads them',
    (d => d.ok && d.games[0].home === 1 && d.games[0].clock === "34'")(decodeFeed({ games: [{ espnEventId: '1', state: 'live', home: { score: 1 }, away: { score: 0 }, clock: "34'" }] })))
  check('a game with no score and no clock decodes with null scores and an empty clock, as Optional does',
    (d => d.ok && d.games[0].home === null && d.games[0].clock === '')(decodeFeed({ games: [{ espnEventId: '1', state: 'pre' }] })))
  check('a body with no games list is not a feed', decodeFeed({}).ok === false && decodeFeed(null).ok === false && decodeFeed({ games: {} }).ok === false)
  check('ONE bad game fails the whole feed, as the page does: no espnEventId, a numeric id, no state, a string score, a numeric clock, a null game',
    [{ state: 'live' }, { espnEventId: 1, state: 'live' }, { espnEventId: '1' }, { espnEventId: '1', state: 'live', home: { score: '1' } }, { espnEventId: '1', state: 'live', clock: 34 }, null]
      .every(g => decodeFeed({ games: [{ espnEventId: '2', state: 'pre' }, g] }).ok === false))
  // Review 2026-11-11 (decoder S7, S11): the probe and the page disagreed on these. `scripts/check-live-probe-keys.mjs` now holds this decoder to the compiled one on a shared battery.
  const feedWith = t => decodeFeed({ games: [{ espnEventId: '1', state: 'live', ...t }] })
  check('a score over the int32 range fails the feed on either side, as it does on the page; the largest int32 does not',
    [{ home: { score: 2147483648 } }, { away: { score: 2147483648 } }].every(t => feedWith(t).ok === false) && [{ home: { score: 2147483647 } }, { away: { score: 2147483647 } }].every(t => feedWith(t).ok === true))
  // Fix-review 2026-11-11 (decoder F6, defence F24): the lower bound is 0, and nothing pinned it. Every bad value of the home side's checks is held against the AWAY side too (decoder F5: the away
  // line was a separate call site no body ever put a bad value on).
  check('a negative score fails the feed on either side, and a zero does not',
    [{ home: { score: -1 } }, { away: { score: -1 } }, { away: { score: -2147483649 } }].every(t => feedWith(t).ok === false) && [{ home: { score: 0 } }, { away: { score: 0 } }].every(t => feedWith(t).ok === true))
  check('a numeric-string, fractional or boolean score on the AWAY side fails the feed, as on the home side',
    [{ away: { score: '0' } }, { away: { score: 1.5 } }, { away: { score: true } }].every(t => feedWith({ home: { score: 1 }, ...t }).ok === false))
  // Half time: the page's `situation.isHalftime` (src/LiveFeed.fs), held to it by `scripts/check-live-probe-keys.mjs`.
  check('the half-time flag is read from `situation`: true reads true; absent, null, a null situation and false read false',
    feedWith({ situation: { isHalftime: true } }).games[0].halftime === true
      && [{}, { situation: null }, { situation: {} }, { situation: { isHalftime: null } }, { situation: { isHalftime: false } }].every(t => feedWith(t).games[0].halftime === false))
  check('a flag that is not a boolean, or a `situation` that is a string, a number or a list, fails the feed, as on the page',
    [{ situation: { isHalftime: 'true' } }, { situation: { isHalftime: 1 } }, { situation: 'x' }, { situation: 5 }, { situation: [] },
      { situation: false }, { situation: 0 }, { situation: '' }, { situation: { isHalftime: 0 } }, { situation: { isHalftime: '' } }].every(t => feedWith(t).ok === false))
  check('added time in play (stoppage true, half time false) is not half time; the break (both true) is',
    feedWith({ situation: { isStoppage: true, isHalftime: false } }).games[0].halftime === false && feedWith({ situation: { isStoppage: true, isHalftime: true } }).games[0].halftime === true)
  check('a team that is a string, a number or a list fails the feed, a null or absent one does not',
    [{ home: 'x' }, { home: 5 }, { home: [] }, { away: 'x' }].every(t => decodeFeed({ games: [{ espnEventId: '1', state: 'live', ...t }] }).ok === false)
      && [{ home: null }, {}, { home: {} }].every(t => decodeFeed({ games: [{ espnEventId: '1', state: 'live', ...t }] }).ok === true))
  check('gamesOf-equivalent reading: the live game of two is found by its ESPN id', decodeFeed({ games: [{ espnEventId: '9', state: 'pre' }, { espnEventId: '1', state: 'live', home: { score: 2 }, away: { score: 2 }, clock: "80'" }] }).games.find(g => g.espnId === '1').home === 2)

  // rows and ids
  const ctx = { games: { regular: [{ id: ROW_A, espn_event_id: 401911177, start_time: '2026-11-21T12:30Z' }, { id: 'no-espn', espn_event_id: null }], postseason: [{ id: ROW_B, espn_event_id: '401906340', start_time: null }] } }
  const m = rowsOf(ctx)
  check('the archive rows become row id -> ESPN id and start, regular and postseason, numbers as strings, null ids absent',
    m.get(ROW_A).espnId === '401911177' && m.get(ROW_A).startMs === T0 && m.get(ROW_B).espnId === '401906340' && !m.has('no-espn') && m.size === 2)
  check('a row with no start time has no start (never in a window)', Number.isNaN(m.get(ROW_B).startMs))
  check('a body with no games gives an empty map, not a throw', rowsOf({}).size === 0 && rowsOf(null).size === 0)

  // one card against the page's last answer
  check('a live game shown as the page was told is ok', j(card(), game()).ok === true && j(card(), game()).kind === 'live')
  check('a live game the card calls Scheduled is a failure', j(card({ status: SCHED }), game()).ok === false)
  check('a live game the card says the start time passed for is a failure', j(card({ status: PASSED }), game()).ok === false)
  check('a wrong score is a failure', j(card({ score: '0–1' }), game()).ok === false)
  check('a wrong clock is a failure: the page\'s own answer is exact, no slack', j(card({ live: "35'" }), game()).ok === false)
  check('a missing clock note when the feed has a clock is a failure', j(card({ live: '' }), game()).ok === false)
  check('a feed with no clock and a card with no note is ok', j(card({ live: '' }), game({ clock: '' })).ok === true)
  check('a forecast on a card in play is a failure: the page\'s forecast word is `model`', j(card({ forecast: 'model' }), game()).ok === false)
  check('the page\'s own word for an EPL card with no line, `none`, is NOT a forecast, and no node at all is not either',
    j(card({ forecast: 'none' }), game()).ok === true && j(card({ forecast: null }), game()).ok === true)
  // Half time (owner approved 2026-11-11; captured 19:54Z: the feed's state stays `live`, its clock reads `45'+3'`, and `situation.isHalftime` is true).
  const half = game({ home: 3, away: 0, clock: "45'+3'", halftime: true })
  check('a game the feed says is at half time is ok when the card says Half time with the score', j(card({ live: 'Half time', score: '3–0' }), half).ok === true)
  check('...and the feed\'s clock beside it is a failure: the card must say Half time, not stoppage time', j(card({ live: "45'+3'", score: '3–0' }), half).ok === false)
  check('...and a card that says Half time while the feed does not is a failure', j(card({ live: 'Half time' }), game()).ok === false)
  check('...and no note at all at half time is a failure', j(card({ live: '', score: '3–0' }), half).ok === false)
  const fin = game({ state: 'final', home: 2, away: 1, clock: "90'" })
  check('a final game the archive has not finalised is In progress with the Full time note and the final score', j(card({ live: 'Full time', score: '2–1' }), fin).ok === true)
  check('...with the wrong score it is a failure', j(card({ live: 'Full time', score: '0–0' }), fin).ok === false)
  check('...and In progress without the Full time note is a failure: the owner\'s second ruling', j(card({ live: '', score: '2–1' }), fin).ok === false && j(card({ live: "90'", score: '2–1' }), fin).ok === false)
  check('a final game the archive has finalised is Final', j(card({ status: 'Final', live: '' }), fin).ok === true && j(card({ status: 'Final / OT', live: '' }), fin).ok === true)
  check('a final game that still reads Scheduled or Start time passed is a failure', j(card({ status: SCHED, live: '' }), fin).ok === false && j(card({ status: PASSED, live: '' }), fin).ok === false)
  const pre = game({ state: 'pre', home: 0, away: 0, clock: "0'" })
  check('a pre game that reads In progress is a failure', j(card(), pre).ok === false)
  check('a pre game that reads Scheduled or Start time passed is ok', j(card({ status: SCHED, live: '' }), pre).ok === true && j(card({ status: PASSED, live: '' }), pre).ok === true)
  check('a feed state the page does not read is a failure, named', /suspended/.test(j(card(), game({ state: 'suspended' })).reason))

  // Other sports (owner 2026-11-22): the score is AWAY first for NBA, WNBA, NHL, MLB, NFL and CFB; the note is the period and the clock; a finished game says Game over; a flagged break says Half time on any sport.
  const nba = (o = {}) => game({ espnId: '401910024', home: 58, away: 60, periodLabel: 'Q2', clock: '6:17', ...o })
  const nbaCard = (o = {}) => card({ sport: 'NBA', teams: 'Trail Blazers @ Knicks', score: '60–58', live: 'Q2 6:17', forecast: null, ...o })
  check('NBA in play: the away score first, the period and the clock as the note, is ok', j(nbaCard(), nba()).ok === true && j(nbaCard(), nba()).kind === 'live')
  check('...the home score first is a failure (the card draws away first), and so is the clock alone or the period alone',
    j(nbaCard({ score: '58–60' }), nba()).ok === false && j(nbaCard({ live: '6:17' }), nba()).ok === false && j(nbaCard({ live: 'Q2' }), nba()).ok === false)
  check('the same game for a soccer label reads home first with the clock alone: the order and the note follow the label, not the shape of the body',
    j(card({ sport: 'EPL', score: '58–60', live: '6:17' }), nba({ periodLabel: 'Q2' })).ok === true)
  check('NHL: `P2 10:11`, away first', j(nbaCard({ sport: 'NHL', score: '2–1', live: 'P2 10:11' }), nba({ home: 1, away: 2, periodLabel: 'P2', clock: '10:11' })).ok === true)
  check('a period with no clock is the period alone (the feed between periods)', j(nbaCard({ live: 'Q3' }), nba({ periodLabel: 'Q3', clock: '' })).ok === true && j(nbaCard({ live: 'Q3' }), nba({ periodLabel: 'Q3', clock: '0:00' })).ok === false)
  const mlb = (o = {}) => nba({ home: 3, away: 5, periodLabel: 'T5', clock: '', ...o })
  const mlbCard = (o = {}) => nbaCard({ sport: 'MLB', teams: 'Mets @ Braves', score: '5–3', live: 'Top 5', ...o })
  check('MLB: the relay\'s T5 / B7 read Top 5 / Bot 7, the inning alone even when a clock is present, and the clock when there is no inning',
    j(mlbCard(), mlb()).ok === true && j(mlbCard({ live: 'Bot 7' }), mlb({ periodLabel: 'B7' })).ok === true && j(mlbCard(), mlb({ clock: '2:00' })).ok === true
      && j(mlbCard({ live: '2:00' }), mlb({ periodLabel: '', clock: '2:00' })).ok === true && j(mlbCard({ live: 'T5' }), mlb()).ok === false && j(mlbCard({ live: 'Mid 5' }), mlb({ periodLabel: 'Mid 5' })).ok === true)
  check('a finished game of another sport is In progress with Game over and the final score, not Full time; `post` is read as final',
    j(nbaCard({ live: 'Game over', score: '99–97' }), nba({ state: 'final', home: 97, away: 99 })).ok === true
      && j(nbaCard({ live: 'Game over', score: '99–97' }), nba({ state: 'post', home: 97, away: 99 })).ok === true
      && j(nbaCard({ live: 'Full time', score: '99–97' }), nba({ state: 'final', home: 97, away: 99 })).ok === false
      && j(card({ live: 'Game over', score: '2–1' }), fin).ok === false && j(nbaCard({ live: 'Game over', score: '97–99' }), nba({ state: 'final', home: 97, away: 99 })).ok === false)
  check('a game the archive has finalised is Final on any sport', j(nbaCard({ status: 'Final', live: '' }), nba({ state: 'post' })).ok === true)
  check('a half-time flag reads Half time on any sport; the period and clock beside it is a failure',
    j(nbaCard({ live: 'Half time' }), nba({ halftime: true })).ok === true && j(nbaCard(), nba({ halftime: true })).ok === false)
  check('a live or final game with no score is unavailable on any sport: the card must say so, and the stale score is a failure',
    ['live', 'final', 'post'].every(st => j(nbaCard({ live: WORDS.unavailable, score: '—' }), nba({ state: st, home: null })).ok === true && j(nbaCard(), nba({ state: st, away: null })).ok === false))
  check('liveNoteOf is the page\'s note: soccer the clock, others period and clock, MLB the inning',
    liveNoteOf('EPL', { clock: "34'", periodLabel: '1H' }) === "34'" && liveNoteOf('NBA', { clock: '6:17', periodLabel: 'Q2' }) === 'Q2 6:17' && liveNoteOf('NBA', { clock: '', periodLabel: '' }) === ''
      && liveNoteOf('MLB', { clock: '', periodLabel: 'B7' }) === 'Bot 7' && liveNoteOf('MLB', { clock: '1:00', periodLabel: '' }) === '1:00')

  // The join: by ESPN id, failing that the ONE id-less game whose two club names match, home to home and away to away (NHL).
  const nhlRow = { espnId: '401892758', startMs: T0, home: 'Bruins', away: 'Capitals' }
  const nhl = (o = {}) => ({ espnId: null, homeName: 'Boston Bruins', awayName: 'Washington Capitals', periodLabel: 'P2', state: 'live', home: 1, away: 2, clock: '10:11', halftime: false, ...o })
  check('gameFor finds a game by ESPN id, and an id-less game by its two club names', gameFor([game()], { espnId: '401911177' }) !== undefined && gameFor([nhl()], nhlRow) !== undefined)
  check('...never an id-less game with the clubs swapped, one club different, or no names; never when two id-less games match; the id wins over the names',
    gameFor([nhl({ homeName: 'Washington Capitals', awayName: 'Boston Bruins' })], nhlRow) === undefined && gameFor([nhl({ awayName: 'Edmonton Oilers' })], nhlRow) === undefined
      && gameFor([nhl({ homeName: null, awayName: null })], nhlRow) === undefined && gameFor([nhl(), nhl()], nhlRow) === undefined
      && gameFor([nhl(), nhl({ espnId: '401892758', home: 9 })], nhlRow).home === 9 && gameFor([nhl({ espnId: '1' })], nhlRow) === undefined)
  const NHL_ID = 'NHL_2026-11-21_e401892758'
  const nhlRows = new Map([[NHL_ID, nhlRow]])
  const nhlCard = { gameId: NHL_ID, teams: 'Capitals @ Bruins', sport: 'NHL', score: '2–1', status: 'In progress', live: 'P2 10:11', forecast: null }
  const runnerOf = (key, ...games) => ({ ok: true, why: [], live: games.map(g => ({ key, ...g })) })
  const rN = judge({ cards: [nhlCard], rows: nhlRows, outcomes: [poll([nhl()], 'nhl')], runner: runnerOf('nhl', nhl()), requests: 1, nowMs: NOW, decodeStatus: okStatus })
  check('an NHL card is joined to its id-less feed game by name, judged away first with `P2 10:11`, and passes', rN.verdict === 'PASS' && rN.rows[0].kind === 'live' && rN.scoreMatchesFeed === true && rN.doneCondition === true, JSON.stringify(rN.rows[0]))
  check('an NHL game the runner sees live that the page never read is a FAIL, found by name',
    (r => r.verdict === 'FAIL' && r.rows[0].kind === 'live-unread')(judge({ cards: [{ ...nhlCard, status: PASSED, live: '' }], rows: nhlRows, outcomes: [], runner: runnerOf('nhl', nhl()), requests: 0, nowMs: NOW, decodeStatus: okStatus })))
  // The runner's live games are matched within the card's own sport key: an id-less game live in the NHL feed whose names happen to be a soccer row's is not a game the EPL poll should have read.
  const rowsNamed = new Map([[ROW_A, { espnId: '401911177', startMs: T0, home: 'Barnsley', away: 'Oldham' }]])
  const noGameYet = { cards: [card({ status: PASSED, live: WORDS.unavailable, score: '—' })], rows: rowsNamed, outcomes: [poll([game({ espnId: '9' })])], requests: 1, nowMs: NOW, decodeStatus: okStatus }
  check('the runner\'s live games are per sport key: an NHL game with a soccer row\'s two names is not a live game of the EPL feed, while the same game in the EPL feed IS one the page failed to read',
    judge({ ...noGameYet, runner: runnerOf('nhl', nhl({ homeName: 'Barnsley', awayName: 'Oldham' })) }).rows[0].kind === 'feed-unavailable'
      && judge({ ...noGameYet, runner: runnerOf('epl', nhl({ homeName: 'Barnsley', awayName: 'Oldham' })) }).rows[0].kind === 'live-unread')
  // Review 2026-11-22 (probe parity): the page folds a Final archive row and a `pre` game back to the archive, and the probe judges them as strictly; an unread state word is the page's `live score unavailable`;
  // `post` is recorded as `final`; a game seen live and then `pre` is named; and an id-less live game no card claims is counted and, beside a card saying unavailable, a FAIL.
  check('a Final card carries no live note: Final with a leftover note is a failure, Final with none is ok whatever state the feed is in (the archive wins)',
    j(nbaCard({ status: 'Final', live: 'Q4 0:00', score: '99–97' }), nba({ state: 'post', home: 97, away: 99 })).ok === false
      && ['live', 'final', 'post', 'pre'].every(st => j(nbaCard({ status: 'Final', live: '', score: '99–97' }), nba({ state: st })).ok === true))
  check('a pre game with a leftover note on a Scheduled card is a failure, and with none is ok', j(card({ status: SCHED, live: "34'" }), pre).ok === false && j(card({ status: SCHED, live: '' }), pre).ok === true)
  check('a state word the page does not read is right when the card says live score unavailable, wrong otherwise',
    j(card({ status: PASSED, live: WORDS.unavailable, score: '—' }), game({ state: 'suspended' })).ok === true && j(card(), game({ state: 'suspended' })).ok === false)
  check('`post` is recorded as final: an NFL card still Scheduled after a `post` game is a failure that scheduledAfterKickoff sees',
    (r => r.verdict === 'FAIL' && r.scheduledAfterKickoff === true && r.rows[0].kind === 'final')(
      judge({ cards: [nbaCard({ sport: 'NFL', status: PASSED, live: '', score: '—' })], rows: new Map([[ROW_A, { espnId: '401910024', startMs: T0, home: 'H', away: 'A' }]]), outcomes: [poll([nba({ state: 'post', home: 17, away: 20 })], 'nfl')], runner: runnerOk(), requests: 1, nowMs: NOW, decodeStatus: okStatus })))
  const regress = (...states) => judge({ cards: [card({ status: PASSED, live: '', score: '—' })], rows, outcomes: states.map(st => poll([game({ state: st, home: 1, away: 0 })])), runner: runnerOk(), requests: states.length, nowMs: NOW, decodeStatus: okStatus })
  check('a game read live and then pre is named as a regression and fails; pre alone, and live alone, are not that',
    (r => r.verdict === 'FAIL' && r.rows[0].kind === 'regressed' && /live and then pre/.test(r.reasons[0]))(regress('live', 'pre')) && regress('pre', 'pre').rows[0].kind === 'pre'
      && regress('pre', 'live').rows[0].kind !== 'regressed')
  const nhlOut = { cards: [{ ...nhlCard, status: PASSED, live: WORDS.unavailable, score: '—' }], outcomes: [poll([nhl()], 'nhl')], requests: 1, nowMs: NOW, decodeStatus: okStatus }
  const stranger = nhl({ homeName: 'Utah Mammoth', awayName: 'Boston Bruins' })
  check('an id-less live game no card claims is counted; beside a card of that sport saying unavailable it fails, naming it; a claimed game or no card of the sport is not a failure',
    (r => r.verdict === 'FAIL' && r.runnerLiveUnclaimed.length === 1 && /Utah Mammoth/.test(r.reasons.join()) && /1 live id-less feed game\(s\) no card claims/.test(r.checked))(judge({ ...nhlOut, outcomes: [poll([stranger], 'nhl')], rows: nhlRows, runner: runnerOf('nhl', stranger) }))
      && judge({ ...nhlOut, rows: nhlRows, runner: runnerOf('nhl', nhl()) }).runnerLiveUnclaimed.length === 0
      && judge({ ...nhlOut, rows: new Map(), runner: runnerOf('nhl', stranger) }).runnerLiveUnclaimed.length === 1)
  check('the join is the page\'s sameClub: initials join (NYR with New York Rangers), a subset joins, two different clubs do not',
    gameFor([nhl({ homeName: 'New York Rangers', awayName: 'Carolina Hurricanes' })], { espnId: '1', home: 'NYR', away: 'Hurricanes' }) !== undefined
      && gameFor([nhl()], { espnId: '1', home: 'Bruins', away: 'Capitals' }) !== undefined && gameFor([nhl()], { espnId: '1', home: 'Bruins', away: 'Oilers' }) === undefined)
  // 2026-11-22 (the first deployed-page manifest): a card the archive has finalised is never asked about, so no poll for its key is correct; it is Final with no live note, or it fails.
  check('a Final card in its window that the page never asked about is correct (the page does not ask about a finalised card), not never-asked; with a live note it fails',
    (r => r.rows[0].kind === 'final' && r.rows[0].ok === true && r.verdict !== 'FAIL')(run({ cards: [card({ status: 'Final', live: '', score: '1–0' })], outcomes: [], runner: runnerOk() }))
      && (r => r.rows[0].kind === 'final' && r.rows[0].ok === false && r.verdict === 'FAIL')(run({ cards: [card({ status: 'Final', live: "34'", score: '1–0' })], outcomes: [], runner: runnerOk() })))
  check('...and a Final card is not live-unread when the runner sees its game live (the page does not ask about it)',
    run({ cards: [card({ status: 'Final', live: '', score: '1–0' })], outcomes: [], runner: runnerOk('401911177') }).rows[0].kind === 'final')
  // Windows are per sport (src/LiveScore.fs `liveWindowFor`): NFL 4 h, MLB and CFB 4.5 h, NBA, WNBA, NHL, AFL 3.5 h, soccer 3 h.
  const at = (label, hours) => judge({ cards: [card({ sport: label, gameId: ROW_A })], rows, outcomes: [], runner: runnerOk(), requests: 0, nowMs: T0 + hours * 3600_000 - 1, decodeStatus: okStatus }).rows[0].kind
  check('the window follows the sport: just inside is judged (never-asked), just outside is out-of-window, for soccer, NBA, NFL and MLB',
    [['EPL', 3], ['NBA', 3.5], ['NHL', 3.5], ['NFL', 4], ['MLB', 4.5], ['CFB', 4.5], ['WNBA', 3.5], ['AFL', 3.5]].every(([l, h]) => at(l, h) === 'never-asked' && at(l, h + 0.01) === 'out-of-window'),
    JSON.stringify(['EPL', 'NBA', 'NFL', 'MLB'].map(l => [l, at(l, WINDOW_H[l] ?? 3), at(l, (WINDOW_H[l] ?? 3) + 0.01)])))
  check('the coverage line names live-score cards and the Game over marker is seen on a finished NBA card',
    (r => /live-score cards/.test(r.checked) && r.gameOverMarker === true && r.fullTimeMarker === false)(judge({ cards: [nbaCard({ live: 'Game over', score: '99–97' })], rows: new Map([[ROW_A, { espnId: '401910024', startMs: T0, home: 'Knicks', away: 'Trail Blazers' }]]), outcomes: [poll([nba({ state: 'final', home: 97, away: 99 })], 'nba')], runner: runnerOk(), requests: 1, nowMs: NOW, decodeStatus: okStatus })))

  // the verdict over cards
  const r1 = run()
  check('a live card shown right, with a request, is a PASS and the Done condition holds',
    r1.verdict === 'PASS' && r1.cardState === 'In progress' && r1.scoreMatchesFeed === true && r1.forecastAbsent === true && r1.forecastChecked === 1
      && r1.scheduledAfterKickoff === false && r1.requestsToV2Games === 1 && r1.doneCondition === true)
  check('the booleans are pinned at their FALSE values too: a wrong score, a forecast on a live EPL card, and a card Scheduled while live',
    run({ cards: [card({ score: '0–1' })] }).scoreMatchesFeed === false
      && run({ cards: [card({ forecast: 'model' })] }).forecastAbsent === false
      && run({ cards: [card({ status: PASSED })] }).scheduledAfterKickoff === true)
  check('a FAIL cannot satisfy the Done condition even with every boolean true: a second card, told pre, that says In progress',
    (r => r.verdict === 'FAIL' && r.cardState === 'In progress' && r.scoreMatchesFeed === true && r.forecastAbsent === true && r.scheduledAfterKickoff === false && r.doneCondition === false)(
      run({ cards: [card(), card({ gameId: ROW_B, teams: 'Sheffield v Acc', status: 'In progress', live: '', score: '—' })], outcomes: [poll([game(), game({ espnId: '401906340', state: 'pre', home: 0, away: 0, clock: "0'" })])], runner: runnerOk('401911177') })))
  check('forecastAbsent over cards with no forecast node is null, not true: an EFL Trophy card proves nothing about the forecast',
    (r => r.verdict === 'PASS' && r.forecastAbsent === null && r.forecastChecked === 0 && r.doneCondition === true)(
      run({ cards: [card({ sport: 'EFL Trophy', forecast: null })], outcomes: [poll([game()], 'efltrophy')] })))
  check('no live game on the page is NOTHING-TO-JUDGE, not a pass',
    run({ cards: [card({ status: SCHED, live: '' })], outcomes: [poll([pre])], runner: runnerOk() }).verdict === 'NOTHING-TO-JUDGE')
  check('only the LAST answer the page received is judged: an older live answer is not',
    run({ cards: [card({ status: 'Final', live: '' })], outcomes: [poll([game()]), poll([fin])], runner: runnerOk() }).verdict === 'NOTHING-TO-JUDGE')
  check('a game the runner sees live that the page never read is a FAIL naming it, and cannot hide as no reading',
    (r => r.verdict === 'FAIL' && /never received/.test(r.reasons[0]) && r.scheduledAfterKickoff === true)(run({ cards: [card({ status: PASSED, live: '' })], outcomes: [] })))
  check('...even when every poll the page made FAILED, and when the card is outside its window',
    run({ outcomes: [failed(), failed()] }).verdict === 'FAIL' && run({ nowMs: T0 + 5 * 3600_000, outcomes: [] }).verdict === 'FAIL')
  check('a last poll that failed AFTER one that read the game is transient: the card must say unavailable, and is not a failure then',
    (r => r.verdict === 'NOTHING-TO-JUDGE' && r.rows[0].kind === 'feed-unavailable')(run({ cards: [card({ status: PASSED, live: WORDS.unavailable, score: '—' })], outcomes: [poll([game()]), failed()] })))
  check('...and if the card still shows the stale score after a failed poll it IS a failure',
    (r => r.verdict === 'FAIL' && /unavailable/.test(r.reasons[0]))(run({ outcomes: [poll([game()]), failed()] })))
  check('a poll answered 503 or with an unreadable body is a failed poll, the same as a dropped one',
    [{ key: 'epl', status: 503, decoded: { ok: false, why: 'HTTP 503' } }, { key: 'epl', status: 200, decoded: { ok: false, why: 'a game has no string state' } }]
      .map(last => run({ cards: [card({ status: PASSED, live: WORDS.unavailable })], outcomes: [poll([game()]), last] }).rows[0].kind)
      .join() === 'feed-unavailable,feed-unavailable')
  check('a body that has no game for the card is unavailable too', run({ cards: [card({ status: PASSED, live: WORDS.unavailable })], outcomes: [poll([game({ espnId: '9' })])], runner: runnerOk() }).rows[0].kind === 'feed-unavailable')
  check('a card outside its window is counted, not judged, and a card whose window just opened has no reading yet',
    run({ nowMs: T0 + 5 * 3600_000, runner: runnerOk(), outcomes: [] }).rows[0].kind === 'out-of-window'
      && run({ nowMs: T0 + 30_000, runner: runnerOk(), outcomes: [] }).rows[0].kind === 'no-reading')
  check('a card in its window that the page never asked about is a failure',
    (r => r.verdict === 'FAIL' && r.rows[0].kind === 'never-asked')(run({ runner: runnerOk(), outcomes: [] })))
  check('the window is by the archive start time: a row with no start time is never in one',
    run({ cards: [card({ gameId: ROW_B })], rows: rowsNoStartB, runner: runnerOk(), outcomes: [poll([game({ espnId: '401906340' })])] }).rows[0].kind === 'out-of-window')
  check('a card with no ESPN id is counted as unjoined, never judged and never a failure', run({ cards: [card({ gameId: ROW_C })] }).rows[0].kind === 'unjoined')
  check('the page on the committed capture is a FAIL naming it, whatever the cards say',
    (r => r.verdict === 'FAIL' && /decode-status/.test(r.reasons[0]) && /warn/.test(r.reasons[0]))(run({ decodeStatus: { state: 'warn', text: 'live slate unreachable' } }))
      && run({ decodeStatus: null }).verdict === 'FAIL')
  check('a runner that could not read its own view cannot say there is nothing to judge, and cannot PASS: UNVERIFIED',
    (r => r.verdict === 'UNVERIFIED' && /context/.test(r.reasons[0]))(run({ runner: runnerBlind(['the runner could not read /context/date: HTTP 502']) }))
      && run({ cards: [card({ status: SCHED, live: '' })], outcomes: [poll([pre])], runner: runnerBlind(['x']) }).verdict === 'UNVERIFIED')
  check('a verdict FAIL outranks UNVERIFIED: a wrong card is wrong whatever the runner saw',
    run({ cards: [card({ score: '0–1' })], runner: runnerBlind(['x']) }).verdict === 'FAIL')
  const rFull = run({ cards: [card({ live: 'Full time', score: '2–1' })], outcomes: [poll([fin])], runner: runnerOk() })
  check('fullTimeMarker is seen on a card that says Full time and not on one that does not', rFull.fullTimeMarker === true && r1.fullTimeMarker === false)
  const rHalf = run({ cards: [card({ live: 'Half time', score: '3–0' })], outcomes: [poll([game({ home: 3, away: 0, clock: "45'+3'", halftime: true })])], runner: runnerOk('401911177') })
  check('halfTimeMarker is seen on a card that says Half time and not on one that does not, and that card is judged ok', rHalf.halfTimeMarker === true && r1.halfTimeMarker === false && rHalf.rows[0].ok === true, JSON.stringify(rHalf.rows[0]))
  check('scheduledAfterKickoff also reads a `final` card that still says Scheduled, and both of the page\'s old words',
    run({ cards: [card({ status: SCHED, live: '' })], outcomes: [poll([fin])], runner: runnerOk() }).scheduledAfterKickoff === true
      && run({ cards: [card({ status: PASSED, live: '' })], outcomes: [poll([fin])], runner: runnerOk() }).scheduledAfterKickoff === true)
  check('the coverage line says checked N of M where it is read, and what it did not judge',
    /^checked 1 of 3 live-score cards .*\(1 with no ESPN id, 1 outside their window, 0 with no reading yet\); 1 live; 0 live id-less feed game\(s\) no card claims$/.test(
      run({ cards: [card(), card({ gameId: ROW_C, teams: 'No id' }), card({ gameId: ROW_B, teams: 'Out' })], rows: rowsNoStartB, outcomes: [poll([game(), game({ espnId: '401906340' })])] }).checked))
  check('the Done condition needs a request', doneConditionOf({ ...r1, requestsToV2Games: 0 }) === false)

  // the rest
  check('only PASS exits 0: every other verdict is red', exitCodeOf('PASS') === 0 && ['FAIL', 'NOTHING-TO-JUDGE', 'UNVERIFIED', 'ERROR', undefined].every(v => exitCodeOf(v) === 1))
  check('--date and --watch are validated, as forecast-live-probe validates its date',
    argsOf({}, '2026-11-21').date === '2026-11-21' && argsOf({}, '2026-11-21').watch === 70 && argsOf({ date: '2026-11-1' }, 'x').error !== undefined
      && argsOf({ watch: 'abc' }, '2026-11-21').error !== undefined && argsOf({ watch: '2' }, '2026-11-21').error !== undefined && argsOf({ watch: '70 --x' }, '2026-11-21').error !== undefined
      && argsOf({ date: '2026-11-21', watch: '90' }, 'x').watch === 90)
  check('sixteen soccer labels and seven other sports, each with its own key', SOCCER.length === 16 && new Set(SOCCER).size === 16 && OTHER_LIVE.length === 7 && LIVE_LABELS.length === 23
    && new Set(Object.values(LABEL_TO_KEY)).size === 23 && LIVE_LABELS.every(l => LABEL_TO_KEY[l] !== undefined))
  // The exit code main uses is the tested one: the LAST `// --- main` marker in the file is main's own, and main exits through exitCodeOf and never with a bare 0.
  const src = readFileSync(new URL(import.meta.url), 'utf8')
  const mainSrc = src.slice(src.lastIndexOf('// --- main'))
  check('main exits through exitCodeOf, once, and never with a bare 0, so the exit code is the one that is tested',
    (mainSrc.match(/process\.exit\(exitCodeOf\(/g) ?? []).length === 1 && !/process\.exit\(0\)/.test(mainSrc))
  finish(summarize())
}

// --- the probe: the glue -------------------------------------------------------

export const readCards = page =>
  page.evaluate(labels =>
    [...document.querySelectorAll('.desk-card')]
      .filter(c => labels.includes(c.closest('section.sport-group')?.getAttribute('data-sport') ?? ''))
      .map(c => {
        const txt = id => c.querySelector(`[data-testid="${id}"]`)?.textContent ?? null
        return {
          gameId: c.getAttribute('data-game-id'),
          teams: c.querySelector('[data-testid="teams"]')?.textContent ?? '',
          sport: c.closest('section.sport-group')?.getAttribute('data-sport') ?? '',
          score: txt('score'), status: txt('status'), live: txt('live') ?? '',
          forecast: c.querySelector('[data-testid="forecast"]')?.getAttribute('data-forecast') ?? null,
        }
      }), LIVE_LABELS)

/** One fetch from the runner. Never throws: the status, the parsed body, and an error that says what went wrong. */
export const defaultGetJson = async url => {
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'field-laboratory-live-score-probe' }, signal: AbortSignal.timeout(20000) })
    const text = await r.text()
    let body = null, error = r.ok ? null : `HTTP ${r.status}`
    try { body = JSON.parse(text) } catch (e) { error ??= `body not JSON: ${e.message}` }
    return { status: r.status, body, error }
  } catch (e) { return { status: null, body: null, error: e.message } }
}

/**
 * Open the page, watch it, read its cards, fetch the runner's own view, judge. Returns { manifest, shot } and NEVER throws: an exception
 * becomes a manifest with verdict ERROR and the message, so a run that dies still leaves what it knew (the workflow commits it either way).
 *   prepare(page)  before navigation: the end-to-end test installs relay routes and a fake clock here; production passes nothing
 *   wait(page, ms) how the watch passes: production waits, the end-to-end test advances the fake clock
 *   now()          the instant the cards are read
 */
export const probe = async ({ browser, site, relay = RELAY, date, watchSeconds, getJson = defaultGetJson, prepare = async () => {}, wait = (p, ms) => p.waitForTimeout(ms), now = () => Date.now() }) => {
  const manifest = { site, date, probedAt: new Date().toISOString(), watchSeconds, error: null }
  let shot = null
  let context = null
  try {
    context = await browser.newContext({ viewport: { width: 1100, height: 1500 } })
    const page = await context.newPage()
    const isFeed = u => u.startsWith(`${relay}/v2/games`)
    const keyOf = u => new URL(u).searchParams.get('sport')
    // The page's own traffic to the feed, in order, and how each poll ended. A slot is taken when the response ARRIVES so the order is the page's.
    let requests = 0
    let open = 0
    const outcomes = []
    const pending = []
    const errors = []
    page.on('request', r => { if (isFeed(r.url())) { requests++; open++ } })
    page.on('requestfailed', r => { if (isFeed(r.url())) open--; if (isFeed(r.url())) outcomes.push({ key: keyOf(r.url()), status: null, decoded: { ok: false, why: `request failed: ${r.failure()?.errorText ?? 'unknown'}` } }) })
    page.on('response', r => {
      if (!isFeed(r.url())) return
      open--
      const slot = outcomes.length
      outcomes.push(null)
      const key = keyOf(r.url()), status = r.status()
      pending.push(r.text().then(text => {
        let decoded
        if (status !== 200) decoded = { ok: false, why: `HTTP ${status}` }
        else { try { decoded = decodeFeed(JSON.parse(text)) } catch (e) { decoded = { ok: false, why: `body not JSON: ${e.message}` } } }
        outcomes[slot] = { key, status, decoded }
      }, e => { outcomes[slot] = { key, status, decoded: { ok: false, why: `body unreadable: ${e.message}` } } }))
    })
    page.on('pageerror', e => errors.push(e.message))

    await prepare(page)
    await page.goto(`${site}/?date=${date}`, { waitUntil: 'networkidle' })
    await page.waitForSelector('.desk-card', { timeout: 20_000 })
    await wait(page, watchSeconds * 1000)
    // A poll that fired near the end of the watch may still be in flight, and its answer is what the card shows next: wait for it (bounded), then
    // for the answers to be read, then a moment for the page to apply them. Whatever is still open after the bound is recorded, not ignored.
    // A request fired in the very last instant of the watch has not necessarily reached this listener yet: let the events arrive before asking how many are open.
    await page.waitForTimeout(300)
    for (const deadline = Date.now() + 10_000; open > 0 && Date.now() < deadline;) await page.waitForTimeout(100)
    for (let n = -1; n !== pending.length;) { n = pending.length; await Promise.all(pending) }
    await page.waitForTimeout(300)
    const cards = await readCards(page)
    const nowMs = now()
    const decodeStatus = await page.evaluate(() => {
      const el = document.getElementById('decode-status')
      return el ? { state: el.getAttribute('data-state'), text: el.textContent ?? '' } : null
    })

    // The runner's own view, keyed from the CARDS: the archive rows, then the feed for every key a card maps to.
    const ctx = await getJson(`${relay}/context/date/${date}`)
    const keys = [...new Set(cards.map(c => LABEL_TO_KEY[c.sport]).filter(Boolean))]
    const feeds = Object.fromEntries(await Promise.all(keys.map(async k => [k, await getJson(`${relay}/v2/games?sport=${k}&date=${date}`)])))
    const runnerWhy = []
    if (ctx.error || ctx.status !== 200) runnerWhy.push(`the runner could not read /context/date/${date}: ${ctx.error ?? `HTTP ${ctx.status}`}`)
    const live = []
    for (const [k, f] of Object.entries(feeds)) {
      const d = f.error || f.status !== 200 ? { ok: false, why: f.error ?? `HTTP ${f.status}` } : decodeFeed(f.body)
      if (!d.ok) runnerWhy.push(`the runner could not read the ${k} feed: ${d.why}`)
      else for (const g of d.games) if (g.state === 'live') live.push({ key: k, ...g })
    }
    const rows = rowsOf(ctx.body)
    const result = judge({ cards, rows, outcomes: outcomes.filter(Boolean), runner: { ok: runnerWhy.length === 0, why: runnerWhy, live }, requests, nowMs, decodeStatus })
    Object.assign(manifest, {
      feedKeys: keys, errors, decodeStatus, requestsInFlightAtRead: open, contextStatus: ctx.status, archiveRowsWithEspnId: rows.size,
      pageOutcomes: outcomes.filter(Boolean).map(o => ({ key: o.key, status: o.status, ok: o.decoded.ok, why: o.decoded.ok ? null : o.decoded.why, games: o.decoded.ok ? o.decoded.games.length : null })),
      runnerFeeds: Object.fromEntries(Object.entries(feeds).map(([k, f]) => [k, { status: f.status, error: f.error }])),
      runnerLiveEspnIds: live.map(g => g.espnId).filter(Boolean), runnerLiveGames: live.map(g => ({ key: g.key, espnId: g.espnId, home: g.homeName, away: g.awayName })), ...result,
    })
    try { shot = await page.screenshot({ fullPage: true }) } catch (e) { manifest.screenshotError = e.message }
  } catch (e) {
    manifest.verdict = 'ERROR'
    manifest.error = e?.message ?? String(e)
    manifest.reasons = [`the probe stopped: ${manifest.error}`]
    manifest.doneCondition = false
  } finally {
    try { await context?.close() } catch { /* the manifest is what matters */ }
  }
  return { manifest, shot }
}

// --- end to end: the glue against the local page ---------------------------------

if (E2E) {
  const { check, summarize } = createChecks()
  const BASE = (process.env.URL || 'http://localhost:8080').replace(/\/+$/, '')
  const AT = '2026-10-10T12:00:00Z'
  const DATE = '2026-10-10'
  const ARSENAL = '401879268'
  const slateFor = mutate => {
    const s = JSON.parse(readFileSync('data/context-2026-10-10.json', 'utf8'))
    s.games.regular = s.games.regular.filter(g => String(g.espn_event_id) === ARSENAL).map(g => mutate({ ...g, home_score: null, away_score: null, finalized_at: null }))
    s.games.postseason = []
    return s
  }
  const feedBody = (state, home, away, clock) => JSON.stringify({ sport: 'epl', date: DATE, count: 1, games: [{ id: `espn:${ARSENAL}`, espnEventId: ARSENAL, sport: 'epl', league: 'EPL', state, start: '2026-10-10T11:30Z', home: { name: 'Arsenal', abbr: 'ARS', score: home }, away: { name: 'Leeds', abbr: 'LEE', score: away }, clock, periodNum: 1, periodLabel: '', situation: null, matchEvents: [], streams: [] }] })
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {})

  /** One scenario: the page's slate, what its feed route answers on each tick, and what the runner's own fetches see. `feed` is the list of answers for the EPL key, or `{ key: [answers] }` for
   *  several; an answer is a body, or ABORT / FAIL / GARBAGE. Each key is counted on its own, as the page asks once per key per tick. `runnerFeed` is a body, 'down', or `{ key: body }`. */
  const scenario = async ({ slate = slateFor(g => g), feed, runnerFeed, runnerCtx = 'ok', slateRoute = 'ok', lateMs = 0, date = DATE, at = AT }) => {
    const feeds = Array.isArray(feed) ? { epl: feed } : feed
    const counts = {}
    const prepare = async page => {
      await page.route(`${RELAY}/context/date/${date}`, r => slateRoute === 'ok' ? r.fulfill({ contentType: 'application/json', body: JSON.stringify(slate) }) : r.fulfill({ status: 500, body: 'down' }))
      await page.route(`${RELAY}/espn-standings/soccer/eng.1/standings`, r => r.fulfill({ contentType: 'application/json', body: readFileSync('data/standings-eng1-2026-11-08.json', 'utf8') }))
      await page.route(u => u.href.startsWith(`${RELAY}/v2/games`), async r => {
        const key = new URL(r.request().url()).searchParams.get('sport')
        const i = counts[key] = (counts[key] ?? -1) + 1
        // `lateMs`: every answer after the first arrives this much later, so the one that ends the watch is still in flight when it ends. A probe that
        // reads the cards without waiting for it reads the previous answer, and only a probe that waits passes.
        if (i > 0 && lateMs) await new Promise(res => setTimeout(res, lateMs))
        const answers = feeds[key] ?? ['FAIL']
        const a = answers[Math.min(i, answers.length - 1)]
        if (a === 'ABORT') return r.abort('connectionrefused')
        if (a === 'FAIL') return r.fulfill({ status: 503, body: 'down' })
        if (a === 'GARBAGE') return r.fulfill({ contentType: 'text/html', body: '<html>maintenance</html>' })
        return r.fulfill({ contentType: 'application/json', body: a })
      })
      await page.clock.install({ time: new Date(at) })
    }
    const getJson = async url => {
      if (url.includes('/context/date/')) return runnerCtx === 'ok' ? { status: 200, body: slate, error: null } : { status: 502, body: null, error: 'HTTP 502' }
      const body = typeof runnerFeed === 'object' ? runnerFeed[new URL(url).searchParams.get('sport')] : runnerFeed
      return body === 'down' || body === undefined ? { status: 503, body: null, error: 'HTTP 503' } : { status: 200, body: JSON.parse(body), error: null }
    }
    const watch = 70
    // The page asks one request per key at a time (src/Program.fs `inFlight`), so a tick that fires while the first answer is still in flight is
    // skipped, as it should be. A real pause lets the first answer land; then the fake clock moves past the 60 s tick.
    const wait = async (p, ms) => { await p.waitForTimeout(600); await p.clock.fastForward(ms) }
    return probe({ browser, site: BASE, date, watchSeconds: watch, getJson, prepare, wait, now: () => Date.parse(at) + watch * 1000 })
  }

  try {
    const LIVE = feedBody('live', 1, 0, "34'")
    const a = await scenario({ feed: [LIVE], runnerFeed: LIVE })
    check('end to end, a live match on a page whose poll works: PASS, the card In progress with the feed\'s score, the Done condition true',
      a.manifest.verdict === 'PASS' && a.manifest.cardState === 'In progress' && a.manifest.scoreMatchesFeed === true && a.manifest.doneCondition === true
        && a.manifest.forecastAbsent === true && a.manifest.forecastChecked === 1 && a.manifest.requestsToV2Games >= 1 && a.manifest.error === null, JSON.stringify({ v: a.manifest.verdict, r: a.manifest.reasons, c: a.manifest.checked }))
    check('...with a screenshot, the cards it read, the page\'s own poll outcomes and the runner\'s feed status recorded',
      Buffer.isBuffer(a.shot) && a.manifest.pageOutcomes.length >= 1 && a.manifest.pageOutcomes.every(o => o.ok) && a.manifest.runnerFeeds.epl.status === 200 && a.manifest.decodeStatus.state === 'ok')

    const b = await scenario({ feed: [LIVE, feedBody('final', 2, 1, "90'+4'")], runnerFeed: feedBody('final', 2, 1, "90'+4'"), lateMs: 1500 })
    check('end to end, the whistle, its answer arriving 1.5 s late, after the watch has ended: the probe waits for it, and the page keeps the card In progress with Full time and the final score; fullTimeMarker is seen; nothing is live to judge',
      b.manifest.fullTimeMarker === true && b.manifest.verdict === 'NOTHING-TO-JUDGE' && b.manifest.rows[0].kind === 'final' && b.manifest.rows[0].ok === true, JSON.stringify({ v: b.manifest.verdict, req: b.manifest.requestsToV2Games, outcomes: b.manifest.pageOutcomes, rows: b.manifest.rows }))

    const noStart = await scenario({ slate: slateFor(g => ({ ...g, start_time: null })), feed: [LIVE], runnerFeed: LIVE })
    check('end to end, a page that never polls (the archive row has no start time) while the runner sees the game live: FAIL as live-unread, never "no game is live"',
      noStart.manifest.verdict === 'FAIL' && noStart.manifest.rows[0].kind === 'live-unread' && noStart.manifest.requestsToV2Games === 0 && noStart.manifest.doneCondition === false, JSON.stringify({ v: noStart.manifest.verdict, r: noStart.manifest.reasons, req: noStart.manifest.requestsToV2Games }))

    const blocked = await scenario({ feed: ['ABORT'], runnerFeed: LIVE })
    check('end to end, a page whose every poll is refused while the runner sees the game live: FAIL, the polls recorded as failed',
      blocked.manifest.verdict === 'FAIL' && blocked.manifest.pageOutcomes.length >= 1 && blocked.manifest.pageOutcomes.every(o => o.ok === false), JSON.stringify({ v: blocked.manifest.verdict, o: blocked.manifest.pageOutcomes }))

    const transient = await scenario({ feed: [LIVE, 'FAIL'], runnerFeed: LIVE })
    check('end to end, a poll that answers 503 AFTER one that read the game: the page says the score is unavailable, and that is a correct card, not a failure',
      transient.manifest.rows[0].kind === 'feed-unavailable' && transient.manifest.rows[0].ok === true && transient.manifest.verdict === 'NOTHING-TO-JUDGE', JSON.stringify({ v: transient.manifest.verdict, row: transient.manifest.rows[0] }))

    const garbage = await scenario({ feed: [LIVE, 'GARBAGE'], runnerFeed: LIVE })
    check('end to end, an unreadable body after a good one reads the same: a failed poll', garbage.manifest.rows[0].kind === 'feed-unavailable' && garbage.manifest.rows[0].ok === true)

    const capture = await scenario({ feed: [LIVE], runnerFeed: LIVE, slateRoute: 'down' })
    check('end to end, the page on its committed capture because the live slate was unreachable: FAIL naming #decode-status, not a quiet "nothing to judge"',
      capture.manifest.verdict === 'FAIL' && capture.manifest.decodeStatus.state !== 'ok' && /decode-status/.test(capture.manifest.reasons.join()), JSON.stringify({ v: capture.manifest.verdict, d: capture.manifest.decodeStatus }))

    const blind = await scenario({ feed: [LIVE], runnerFeed: 'down' })
    check('end to end, a runner that cannot read the feed cannot PASS: UNVERIFIED, red', blind.manifest.verdict === 'UNVERIFIED' && exitCodeOf(blind.manifest.verdict) === 1, JSON.stringify({ v: blind.manifest.verdict, r: blind.manifest.reasons }))

    const noCtx = await scenario({ feed: [LIVE], runnerFeed: LIVE, runnerCtx: 'down' })
    check('end to end, a runner that cannot read /context/date: UNVERIFIED with the status recorded', noCtx.manifest.verdict === 'UNVERIFIED' && noCtx.manifest.contextStatus === 502)

    // NBA and NHL (owner 2026-11-22), the capture of 2026-11-21 cut to one NBA card (joined by ESPN event id) and one NHL card (the NHL feed carries NO id: joined by the two club names), the clock
    // set 34 and 64 minutes after their starts. The scores, period labels and clocks are spelled out here, not derived from the rule that reads them.
    const OD = '2026-11-21', OAT = '2026-11-22T01:04:00Z'
    const otherSlate = () => {
      const KEEP = ['NBA_2026-11-21_e401910024', 'NHL_2026-11-21_e401892758']
      const c = JSON.parse(readFileSync('data/context-2026-11-21.json', 'utf8'))
      c.games.regular = c.games.regular.filter(g => KEEP.includes(g.id)).map(g => ({ ...g, home_score: null, away_score: null, finalized_at: null }))
      c.games.postseason = []
      c.briefs = []
      return c
    }
    const nbaBody = (state, home, away, label, clock) => JSON.stringify({ sport: 'nba', date: OD, games: [{ id: 'espn:401910024', espnEventId: '401910024', sport: 'nba', league: 'NBA', state, start: '2026-11-22T00:30Z',
      home: { name: 'New York Knicks', abbr: 'NY', score: home }, away: { name: 'Portland Trail Blazers', abbr: 'POR', score: away }, periodNum: 2, periodLabel: label, clock, situation: null }] })
    const nhlBody = (state, home, away, label, clock) => JSON.stringify({ sport: 'nhl', date: OD, games: [{ id: 'nhl:2026020999', nhleGameId: 2026020999, sport: 'nhl', league: 'NHL', state, start: '2026-11-22T00:00:00Z',
      home: { name: 'Boston Bruins', abbr: 'BOS', score: home }, away: { name: 'Washington Capitals', abbr: 'WSH', score: away }, periodNum: 2, periodLabel: label, clock }] })
    const NBA_LIVE = nbaBody('live', 55, 48, 'Q2', '6:17'), NHL_LIVE = nhlBody('live', 2, 1, 'P2', '10:11')
    const o1 = await scenario({ slate: otherSlate(), date: OD, at: OAT, feed: { nba: [NBA_LIVE], nhl: [NHL_LIVE] }, runnerFeed: { nba: NBA_LIVE, nhl: NHL_LIVE } })
    const rowOf = (m, tail) => m.rows.find(r => r.teams.endsWith(tail))
    check('end to end, NBA and NHL in play on a page whose polls work: PASS, two live-score cards judged, the Done condition true',
      o1.manifest.verdict === 'PASS' && o1.manifest.doneCondition === true && /^checked 2 of 2 live-score cards /.test(o1.manifest.checked) && o1.manifest.scoreMatchesFeed === true && o1.manifest.error === null,
      JSON.stringify({ v: o1.manifest.verdict, r: o1.manifest.reasons, c: o1.manifest.checked }))
    check('...the NBA card read AWAY first with the quarter and the clock, and the NHL card the same, joined by names: spelled out',
      rowOf(o1.manifest, 'Knicks')?.score === '48–55' && rowOf(o1.manifest, 'Knicks')?.live === 'Q2 6:17' && rowOf(o1.manifest, 'Knicks')?.kind === 'live'
        && rowOf(o1.manifest, 'Bruins')?.score === '1–2' && rowOf(o1.manifest, 'Bruins')?.live === 'P2 10:11' && rowOf(o1.manifest, 'Bruins')?.kind === 'live', JSON.stringify(o1.manifest.rows))
    check('...the page asked each key at least once, the runner saw both games live and the manifest names them (NHL by its clubs, it has no id)',
      o1.manifest.requestsToV2Games >= 2 && o1.manifest.runnerLiveGames.length === 2 && o1.manifest.runnerLiveGames.some(g => g.key === 'nhl' && g.espnId === null && g.home === 'Boston Bruins')
        && o1.manifest.runnerLiveGames.some(g => g.key === 'nba' && g.espnId === '401910024') && Buffer.isBuffer(o1.shot), JSON.stringify(o1.manifest.runnerLiveGames))
    const o2 = await scenario({ slate: otherSlate(), date: OD, at: OAT, feed: { nba: [NBA_LIVE, nbaBody('final', 101, 96, 'F', '0.0')], nhl: [NHL_LIVE, nhlBody('final', 3, 1, 'F', '00:00')] }, runnerFeed: { nba: nbaBody('final', 101, 96, 'F', '0.0'), nhl: nhlBody('final', 3, 1, 'F', '00:00') } })
    check('end to end, the game over in both feeds: Game over (not Full time) with the final score on both cards, the Game over marker seen, nothing live left to judge',
      o2.manifest.gameOverMarker === true && o2.manifest.fullTimeMarker === false && o2.manifest.verdict === 'NOTHING-TO-JUDGE' && rowOf(o2.manifest, 'Knicks')?.kind === 'final' && rowOf(o2.manifest, 'Bruins')?.kind === 'final'
        && rowOf(o2.manifest, 'Knicks')?.score === '96–101' && rowOf(o2.manifest, 'Bruins')?.score === '1–3' && rowOf(o2.manifest, 'Knicks')?.live === 'Game over', JSON.stringify({ v: o2.manifest.verdict, rows: o2.manifest.rows }))
    const o3 = await scenario({ slate: otherSlate(), date: OD, at: OAT, feed: { nba: [NBA_LIVE], nhl: ['ABORT'] }, runnerFeed: { nba: NBA_LIVE, nhl: NHL_LIVE } })
    check('end to end, the NHL poll refused while the runner sees the game live: FAIL as live-unread, found by the two club names, and the NBA card still judged ok',
      o3.manifest.verdict === 'FAIL' && rowOf(o3.manifest, 'Bruins')?.kind === 'live-unread' && rowOf(o3.manifest, 'Knicks')?.kind === 'live' && rowOf(o3.manifest, 'Knicks')?.ok === true, JSON.stringify({ v: o3.manifest.verdict, rows: o3.manifest.rows }))

    const crash = await probe({ browser: { newContext: async () => { throw new Error('no browser today') } }, site: BASE, date: DATE, watchSeconds: 5 })
    check('end to end, a probe that dies still returns a manifest saying why, with verdict ERROR and no throw',
      crash.manifest.verdict === 'ERROR' && /no browser today/.test(crash.manifest.error) && crash.shot === null && crash.manifest.doneCondition === false)
  } finally {
    await browser.close()
  }
  finish(summarize())
}

// --- main ---------------------------------------------------------------------

if (isMain(import.meta.url) && !SELF_TEST && !E2E) {
  const args = process.argv.slice(2)
  const arg = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined }
  const parsed = argsOf({ date: arg('--date') ?? process.env.PROBE_DATE, watch: arg('--watch') ?? process.env.PROBE_WATCH }, fieldDay(new Date()))
  if (parsed.error) { console.error(parsed.error); process.exit(2) }
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {})
  let result
  try {
    result = await probe({ browser, site: SITE, date: parsed.date, watchSeconds: parsed.watch })
  } finally {
    await browser.close()
  }
  const { manifest, shot } = result
  mkdirSync('outbox', { recursive: true })
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-') + 'Z'
  let deployed = null
  try { deployed = (await (await fetch(`${SITE}/version.txt`)).text()).trim() } catch { /* the manifest says null */ }
  const out = `outbox/live-score-manifest-${parsed.date}-${stamp}.json`
  // The manifest first, then the picture: a screenshot that fails must not take the manifest with it.
  if (shot) { manifest.screenshot = `outbox/live-score-${parsed.date}-${stamp}.png`; writeFileSync(manifest.screenshot, shot) }
  writeFileSync(out, JSON.stringify({ deployed, ...manifest }, null, 2) + '\n')
  console.log(`${manifest.verdict}  ${manifest.checked ?? manifest.error}; requests to /v2/games: ${manifest.requestsToV2Games ?? 0}; manifest ${out}`)
  for (const r of manifest.reasons ?? []) console.log(`  - ${r}`)
  process.exit(exitCodeOf(manifest.verdict))
}
