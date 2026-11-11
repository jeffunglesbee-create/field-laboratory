#!/usr/bin/env node
// Capture what the relay's live pull route REALLY says about soccer games, while they are in play.
//
// docs/CC-CMD-2026-11-11-soccer-live-scores.md, Task 1. The laboratory is about to read scores from
// GET /v2/games?sport=<key>&date=<ET day> and overlay them onto the archive rows it already shows. The
// keys a LIVE club-soccer game carries (`state:'live'`, `clock`, `periodNum`, `situation`) have never been
// observed: they are inferred from `adaptESPNWCSoccer`, and no soccer match was in play when the route was
// read (measured 2026-11-11, premise 5 of the CC-CMD). Writing a decoder against inferred keys is the
// mistake Rule 68 names, so this captures the real bytes first.
//
// WHAT IT RECORDS, per run, in outbox/live-capture-<sport>-<date>-<HHMM>Z.json:
//   - the /v2/games body, raw, with its status and the cache headers the page would meet;
//   - /context/date/<date>, the route the laboratory already reads, and for each game in the feed the
//     archive row it joins to BY ESPN EVENT ID. Never by name: the archive says 'Man Utd', the feed says
//     'Manchester United' (CC-CMD fact 4);
//   - a summary that counts what each game shows, and a `proved` boolean that is true only when the one
//     thing the design rests on has been seen: a game whose feed state is 'live', with integer scores and a
//     clock string, while its archive row still has no score.
//
// A `pre` game reports score 0, not null (CC-CMD fact 4). So integer scores alone prove nothing; the state
// gate is the point, and the self-test fails on a pre game with score 0 if the gate is removed.
//
// COVERAGE IS PRINTED WHERE IT IS READ (Rule 91): `checked N of M games joined to an archive row`.
//
// CI-only: the sandbox 403s *.workers.dev at CONNECT. This is a one-shot measurement, dispatched by hand or
// by a one-shot scheduled task, never on a schedule of its own (the page's poll is the only timer).

import { mkdirSync, writeFileSync } from 'node:fs'
import { createChecks, isMain } from './checks.mjs'

const RELAY = process.env.RELAY_URL || 'https://field-relay-nba.jeffunglesbee.workers.dev'

/** 'espn:401911177' -> '401911177'. Anything else (an 'nhl:' id, nothing) cannot join an archive row. */
export const espnIdOf = game => {
  const id = game && typeof game === 'object' ? game.id : undefined
  const m = typeof id === 'string' ? id.match(/^espn:(\d+)$/) : null
  return m ? m[1] : null
}

/** The feed's own word for the game's state, verbatim; 'absent' only when there is none. Never mapped. */
export const stateOf = game => {
  const s = game && typeof game === 'object' ? game.state : undefined
  return typeof s === 'string' && s !== '' ? s : 'absent'
}

/** The games array of a /v2/games body. The relay's shape is a body with `games`; a bare array is read too. */
export const gamesOf = body =>
  Array.isArray(body) ? body : body && Array.isArray(body.games) ? body.games : []

/** Both halves of a /context/date body. A body without them is no rows, and the caller says so. */
export const archiveRowsOf = body => {
  const g = body && typeof body === 'object' ? body.games : undefined
  if (!g || typeof g !== 'object') return []
  return [...(Array.isArray(g.regular) ? g.regular : []), ...(Array.isArray(g.postseason) ? g.postseason : [])]
}

const isInt = v => typeof v === 'number' && Number.isInteger(v)

/** One game as the capture sees it: only facts, nothing inferred. */
export const describeGame = game => ({
  id: game?.id ?? null,
  espnId: espnIdOf(game),
  state: stateOf(game),
  homeScore: game?.home?.score ?? null,
  awayScore: game?.away?.score ?? null,
  scoresAreIntegers: isInt(game?.home?.score) && isInt(game?.away?.score),
  clock: game?.clock ?? null,
  clockIsString: typeof game?.clock === 'string' && game.clock !== '',
  periodNum: game?.periodNum ?? null,
  start: game?.start ?? null,
  hasSituation: !!game?.situation && typeof game.situation === 'object',
  keys: game && typeof game === 'object' ? Object.keys(game).sort() : [],
})

/** Join each feed game to its archive row by espn_event_id. A game with no id, or no row, is listed, not dropped. */
export const joinArchive = (games, rows) => {
  const byEspn = new Map()
  for (const r of rows) if (r && r.espn_event_id != null) byEspn.set(String(r.espn_event_id), r)
  return games.map(g => {
    const espnId = espnIdOf(g)
    const row = espnId ? byEspn.get(espnId) : undefined
    return {
      espnId,
      matched: !!row,
      archive: row
        ? {
            id: row.id ?? null,
            home_score: row.home_score ?? null,
            away_score: row.away_score ?? null,
            finalized_at: row.finalized_at ?? null,
            start_time: row.start_time ?? null,
          }
        : null,
      // The whole row as the laboratory would receive it, so a reader can see keys this script did not think of.
      raw: row ?? null,
    }
  })
}

/** Counts, per game and in all. `live` means the FEED SAYS 'live'; a score, even an integer, never makes a game live. */
export const summarize = (games, joins) => {
  const byState = {}
  let live = 0, liveWithIntegerScores = 0, liveWithClockString = 0, liveWithArchiveScoreNull = 0, liveFullShape = 0
  let preWithScoreZero = 0, archiveMatched = 0
  games.forEach((g, i) => {
    const d = describeGame(g)
    const j = joins[i]
    byState[d.state] = (byState[d.state] ?? 0) + 1
    if (j?.matched) archiveMatched++
    if (d.state === 'pre' && d.homeScore === 0 && d.awayScore === 0) preWithScoreZero++
    if (d.state === 'live') {
      live++
      const archiveUnscored = !!(j?.matched && j.archive.home_score === null && j.archive.away_score === null)
      if (d.scoresAreIntegers) liveWithIntegerScores++
      if (d.clockIsString) liveWithClockString++
      if (archiveUnscored) liveWithArchiveScoreNull++
      // ONE game with all three. Three counters can each be satisfied by a different game, which proves nothing.
      if (d.scoresAreIntegers && d.clockIsString && archiveUnscored) liveFullShape++
    }
  })
  return { gamesInFeed: games.length, byState, live, liveWithIntegerScores, liveWithClockString, liveWithArchiveScoreNull, liveFullShape, preWithScoreZero, archiveMatched }
}

/** The one thing the design rests on, seen once on a single game. */
export const provedOf = s => s.liveFullShape >= 1

export const coverageLine = s =>
  `checked ${s.archiveMatched} of ${s.gamesInFeed} games joined to an archive row; ${s.live} live`

export const outFile = (sport, date, at) =>
  `outbox/live-capture-${sport}-${date}-${at.toISOString().slice(11, 16).replace(':', '')}Z.json`

const get = async (url) => {
  const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'field-laboratory-live-shape-capture' }, signal: AbortSignal.timeout(20000) })
  const text = await r.text()
  let json = null, parseError = null
  try { json = JSON.parse(text) } catch (e) { parseError = e.message }
  return {
    url, status: r.status, contentType: r.headers.get('content-type'),
    cacheControl: r.headers.get('cache-control'), age: r.headers.get('age'), date: r.headers.get('date'),
    bytes: text.length, body: json, rawText: json === null ? text.slice(0, 4000) : undefined, parseError,
  }
}

// --- self-test ---------------------------------------------------------------

const SELF_TEST = isMain(import.meta.url) && process.argv.includes('--self-test')

if (SELF_TEST) {
  const c = createChecks()
  const t = (name, pass, detail) => c.check(name, pass, detail)

  // Inline objects below are the SELF-TEST's, built to exercise the gates. They are never written to outbox/
  // and are not a capture; a committed capture only ever comes from the relay's bytes.
  const pre = { id: 'espn:100', state: 'pre', home: { name: 'Manchester United', score: 0 }, away: { name: 'Aston Villa', score: 0 }, clock: "0'", start: '2026-11-11T19:00Z' }
  const live = { id: 'espn:101', state: 'live', home: { name: 'Barnsley', score: 1 }, away: { name: 'Oldham', score: 0 }, clock: "34'", periodNum: 1, situation: { elapsed: 34 } }
  const fin = { id: 'espn:102', state: 'final', home: { name: 'Brighton', score: 2 }, away: { name: 'Brentford', score: 1 }, clock: "90'+4'" }
  const rowFor = (espn, extra = {}) => ({ id: `X_2026-11-11_e${espn}`, espn_event_id: String(espn), home_score: null, away_score: null, finalized_at: null, ...extra })

  t('an espn id is read from the feed id', espnIdOf({ id: 'espn:401911177' }) === '401911177')
  t('a non-espn id and a missing id cannot join', espnIdOf({ id: 'nhl:2025020100' }) === null && espnIdOf({}) === null && espnIdOf(undefined) === null)
  t('the feed state is kept verbatim, and an unknown word is not mapped', stateOf({ state: 'in' }) === 'in' && stateOf({ state: 'live' }) === 'live')
  t('no state reads as absent, never as pre', stateOf({}) === 'absent' && stateOf({ state: '' }) === 'absent')
  t('games are read from a body with games, and from a bare array', gamesOf({ games: [pre] }).length === 1 && gamesOf([pre, live]).length === 2 && gamesOf(null).length === 0)
  t('archive rows are read from both halves', archiveRowsOf({ games: { regular: [1], postseason: [2, 3] } }).length === 3 && archiveRowsOf({}).length === 0 && archiveRowsOf(null).length === 0)

  // THE GATE. A pre game reports score 0, an integer, with a clock string. If the state gate were removed this
  // would read as a live shape.
  const jPre = joinArchive([pre], [rowFor(100)])
  const sPre = summarize([pre], jPre)
  t('a pre game with score 0 and a clock string is NOT live', sPre.live === 0 && sPre.liveWithIntegerScores === 0 && sPre.liveWithClockString === 0, JSON.stringify(sPre))
  t('...and it does not prove the live shape', provedOf(sPre) === false)
  t('...but it is counted as a pre game at 0-0, so the trap stays visible', sPre.preWithScoreZero === 1 && sPre.byState.pre === 1)

  const jLive = joinArchive([live], [rowFor(101)])
  const sLive = summarize([live], jLive)
  t('a live game with integer scores, a clock string and an unscored archive row proves the shape', provedOf(sLive) === true, JSON.stringify(sLive))
  t('a live game whose archive row has a score does not (the archive-null premise is not shown)',
    provedOf(summarize([live], joinArchive([live], [rowFor(101, { home_score: 1, away_score: 0 })]))) === false)
  t('a live game with no archive row does not, and says so in the coverage line',
    provedOf(summarize([live], joinArchive([live], []))) === false && coverageLine(summarize([live], joinArchive([live], []))).startsWith('checked 0 of 1 '))
  t('a live game with a null clock does not prove it',
    provedOf(summarize([{ ...live, clock: null }], joinArchive([live], [rowFor(101)]))) === false)
  t('a live game with a null score does not prove it',
    provedOf(summarize([{ ...live, home: { name: 'Barnsley', score: null } }], joinArchive([live], [rowFor(101)]))) === false)
  // The three conditions must hold on ONE game. Each of these three live games satisfies exactly one of them.
  const split = [
    { id: 'espn:201', state: 'live', home: { score: 1 }, away: { score: 0 }, clock: null },
    { id: 'espn:202', state: 'live', home: { score: null }, away: { score: null }, clock: "12'" },
    { id: 'espn:203', state: 'live', home: { score: null }, away: { score: null }, clock: null },
  ]
  const sSplit = summarize(split, joinArchive(split, [rowFor(201, { home_score: 1, away_score: 0 }), rowFor(202, { home_score: 0, away_score: 0 }), rowFor(203)]))
  t('three live games that each show one condition do not prove the shape',
    sSplit.liveWithIntegerScores === 1 && sSplit.liveWithClockString === 1 && sSplit.liveWithArchiveScoreNull === 1 && provedOf(sSplit) === false, JSON.stringify(sSplit))

  // The join is by id. The archive says 'Man Utd', the feed 'Manchester United'.
  const named = joinArchive([{ ...pre, home: { name: 'Manchester United' } }], [rowFor(100, { home: 'Man Utd' })])
  t('the join is by espn id, so differing team names still join', named[0].matched === true)
  t('a game whose id is not an espn id is listed unmatched, not dropped', joinArchive([{ id: 'nhl:1', state: 'live' }], [rowFor(1)]).length === 1 && joinArchive([{ id: 'nhl:1' }], [rowFor(1)])[0].matched === false)

  const all = [pre, live, fin]
  const sAll = summarize(all, joinArchive(all, [rowFor(100), rowFor(101), rowFor(102, { home_score: 2, away_score: 1, finalized_at: '2026-11-11 21:00:00' })]))
  t('states are counted by the feed word', sAll.byState.pre === 1 && sAll.byState.live === 1 && sAll.byState.final === 1, JSON.stringify(sAll.byState))
  t('coverage reads checked N of M where it is read', coverageLine(sAll) === 'checked 3 of 3 games joined to an archive row; 1 live', coverageLine(sAll))
  t('the file name carries the sport, the day and the minute in UTC', outFile('efltrophy', '2026-11-11', new Date('2026-11-11T19:10:03Z')) === 'outbox/live-capture-efltrophy-2026-11-11-1910Z.json', outFile('efltrophy', '2026-11-11', new Date('2026-11-11T19:10:03Z')))
  t('two captures a minute apart do not share a file name', outFile('epl', '2026-11-21', new Date('2026-11-21T12:50:00Z')) !== outFile('epl', '2026-11-21', new Date('2026-11-21T12:51:00Z')))

  process.exit(c.summarize() === 0 ? 0 : 1)
}

// --- the capture -------------------------------------------------------------

if (isMain(import.meta.url) && !SELF_TEST) {
  const [sport, date] = process.argv.slice(2).filter(a => !a.startsWith('--'))
  if (!sport || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) {
    console.error('usage: node scripts/live-shape-capture.mjs <sport key, e.g. efltrophy> <ET day YYYY-MM-DD> [--self-test]')
    process.exit(2)
  }
  const at = new Date()
  const v2Url = `${RELAY}/v2/games?sport=${encodeURIComponent(sport)}&date=${date}`
  const archiveUrl = `${RELAY}/context/date/${date}`
  let v2, archive, error = null
  try {
    ;[v2, archive] = await Promise.all([get(v2Url), get(archiveUrl)])
  } catch (e) {
    error = `fetch failed: ${e.message}`
  }

  const record = { capturedAt: at.toISOString(), sport, date, relay: RELAY, error }
  if (!error) {
    const games = gamesOf(v2.body)
    const joins = joinArchive(games, archiveRowsOf(archive.body))
    const summary = summarize(games, joins)
    Object.assign(record, {
      v2, archive: { ...archive, body: undefined, rowCount: archiveRowsOf(archive.body).length },
      games: games.map(describeGame),
      joins,
      summary,
      coverage: coverageLine(summary),
      proved: provedOf(summary),
    })
    if (v2.status !== 200 || v2.body === null) record.error = `v2/games answered ${v2.status}${v2.parseError ? `, body not JSON: ${v2.parseError}` : ''}`
    if (archive.status !== 200 || archive.body === null) record.error = `${record.error ? record.error + '; ' : ''}context/date answered ${archive.status}${archive.parseError ? `, body not JSON: ${archive.parseError}` : ''}`
  }

  mkdirSync('outbox', { recursive: true })
  const path = outFile(sport, date, at)
  writeFileSync(path, JSON.stringify(record, null, 2) + '\n')
  console.log(`wrote ${path}`)
  if (record.coverage) console.log(record.coverage)
  console.log(record.proved ? 'LIVE SHAPE: SEEN (a live game with integer scores, a clock string and an unscored archive row)' : 'LIVE SHAPE: NOT SEEN in this capture')
  if (record.error) {
    console.error(`FAIL: ${record.error}`)
    process.exit(1)
  }
}
