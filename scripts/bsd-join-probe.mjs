// How many of the laboratory's soccer games can be joined to a BSD event, and by what key.
// Question: lineups attach to games through a BSD event id, and a game row carries none.
// What joins them? Run on a runner: the sandbox's egress proxy does not reach the relay.
//
// Measures, per committed context date:
//   * the route works: `/bsd/events/by-date?date=` pages at 50, followed by offset;
//   * the event shape: which team fields an event carries (ids and names);
//   * join coverage by THREE keys, each counted apart so a loose one is never read as a
//     strict one: exact normalised name pair, loose name pair (club affixes dropped, one name
//     contained in the other), and loose name pair AND kickoff within KICKOFF_MINUTES;
//   * what stays unmatched, by name, in the artifact, so a table can be built from the list.
//
// COVERAGE IS PRINTED WITH EVERY VERDICT (Rule 91): "N of M lab soccer games".
//
// This decides nothing and writes no table. It is the measurement the join design waits on.
//
// Usage:  node scripts/bsd-join-probe.mjs --self-test
//         node scripts/bsd-join-probe.mjs [--dates 2026-08-29,2026-09-05]

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createChecks, finish, isMain } from './checks.mjs'

const RELAY = 'https://field-relay-nba.jeffunglesbee.workers.dev'
const SOCCER = ['MLS', 'EPL', 'La Liga', 'Serie A', 'Bundesliga', 'Ligue 1']
const KICKOFF_MINUTES = 15
const PAGE = 50
const MAX_PAGES = 12

// Letters and digits only, diacritics folded: "FC Bayern München" -> "fcbayernmunchen".
export const norm = s =>
  String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')

// Club affixes that one vendor writes and another drops. Removed as WHOLE words only.
const AFFIX = new Set(['fc', 'cf', 'afc', 'sc', 'ac', 'as', 'rc', 'rcd', 'ssc', 'fk', 'sv', 'vfl', 'vfb', 'tsg',
  'calcio', 'club', 'de', 'the', 'real', 'cd', 'ud', 'sd', 'ca', 'og', 'losc', 'us', 'ss', 'bsc', 'fsv', 'rb'])
export const core = s =>
  String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .split(/[^a-z0-9]+/).filter(w => w && !AFFIX.has(w) && !/^\d+$/.test(w)).join('')

const strictPair = (g, e) => norm(g.home) === norm(e.home_team) && norm(g.away) === norm(e.away_team)
const contains = (a, b) => a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))
const loosePair = (g, e) =>
  contains(core(g.home), core(e.home_team)) && contains(core(g.away), core(e.away_team))
const minutesApart = (g, e) => {
  const a = Date.parse(g.start_time), b = Date.parse(e.event_date)
  return Number.isNaN(a) || Number.isNaN(b) ? null : Math.abs(a - b) / 60000
}
const kickoffNear = (g, e) => { const m = minutesApart(g, e); return m !== null && m <= KICKOFF_MINUTES }

/** One game's outcome against a list of events. Counted by the STRICTEST key that decides. */
export const joinGame = (game, events) => {
  const strict = events.filter(e => strictPair(game, e))
  if (strict.length === 1) return { how: 'strict', event: strict[0] }
  if (strict.length > 1) return { how: 'ambiguous', n: strict.length }
  const loose = events.filter(e => loosePair(game, e))
  const timed = loose.filter(e => kickoffNear(game, e))
  if (timed.length === 1) return { how: 'loose+kickoff', event: timed[0] }
  if (loose.length === 1) return { how: 'loose-only', event: loose[0], kickoffKnown: game.start_time != null }
  if (loose.length > 1) return { how: 'ambiguous', n: loose.length }
  return { how: 'none' }
}

// ---- the name-free keys, measured on the second run (2026-10-26) ----------------------------
// Kickoff is an exact key where the lab row has one, so: the events at the SAME instant, of which
// one side's name loosely matches. And a team-id table learned from games whose join is already
// decided on ANOTHER date, applied by both ids. Learned on one date and tested on the other, so the
// table is never scored on the games that taught it.
const kickoffExact = (g, e) => { const m = minutesApart(g, e); return m !== null && m <= 1 }
const looseSide = (lab, bsd) => contains(core(lab), core(bsd))

export const kickoffOneSide = (game, events) => {
  if (!game.start_time) return { how: 'no-kickoff' }
  const c = events.filter(e => kickoffExact(game, e) && (looseSide(game.home, e.home_team) || looseSide(game.away, e.away_team)))
  if (c.length === 1) return { how: 'kickoff+one-side', event: c[0] }
  return c.length > 1 ? { how: 'ambiguous', n: c.length } : { how: 'none' }
}

/** name (normalised) -> BSD team id, only for names that resolved to exactly ONE id. */
export const learnTable = pairs => {
  const seen = new Map()
  const note = (name, id) => { const k = norm(name); if (!seen.has(k)) seen.set(k, new Set()); seen.get(k).add(id) }
  for (const { game, event } of pairs) { note(game.home, event.home_team_id); note(game.away, event.away_team_id) }
  return new Map([...seen].filter(([, ids]) => ids.size === 1).map(([k, ids]) => [k, [...ids][0]]))
}

export const idJoin = (game, events, table) => {
  const h = table.get(norm(game.home)), a = table.get(norm(game.away))
  if (h == null || a == null) return { how: 'name-not-in-table' }
  const c = events.filter(e => e.home_team_id === h && e.away_team_id === a)
  if (c.length === 1) return { how: 'id', event: c[0] }
  return c.length > 1 ? { how: 'ambiguous', n: c.length } : { how: 'no-event' }
}

const tally = rows => {
  const t = { strict: 0, 'loose+kickoff': 0, 'loose-only': 0, ambiguous: 0, none: 0 }
  for (const r of rows) t[r.how]++
  return t
}

const getJson = async url => {
  const res = await fetch(url, { headers: { 'User-Agent': 'field-laboratory bsd-join-probe' } })
  const text = await res.text()
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}: ${text.slice(0, 160)}`)
  return JSON.parse(text)
}

const fetchEvents = async date => {
  const events = []
  let pages = 0, count = null
  for (let i = 0; i < MAX_PAGES; i++) {
    const body = await getJson(`${RELAY}/bsd/events/by-date?date=${date}&limit=${PAGE}&offset=${i * PAGE}`)
    const rows = body.results || body.events || []
    pages++
    if (count === null && typeof body.count === 'number') count = body.count
    events.push(...rows)
    if (rows.length < PAGE) break
    if (count !== null && events.length >= count) break
  }
  return { events, pages, count }
}

const probeDate = async date => {
  const ctx = JSON.parse(readFileSync(`data/context-${date}.json`, 'utf8'))
  const games = [...ctx.games.regular, ...ctx.games.postseason].filter(g => SOCCER.includes(g.sport))
  const { events, pages, count } = await fetchEvents(date)
  const shape = events[0] ? Object.keys(events[0]).filter(k => /team|home|away|league|event_date|^id$/.test(k)) : []
  const rows = games.map(g => ({ g, ...joinGame(g, events) }))
  const t = tally(rows)
  const withIds = rows.filter(r => r.event).filter(r => Number.isFinite(r.event.home_team_id) && Number.isFinite(r.event.away_team_id)).length
  const times = rows.filter(r => r.event && r.g.start_time).map(r => minutesApart(r.g, r.event)).filter(m => m !== null)
  const noKickoff = games.filter(g => !g.start_time).length
  const oneSide = games.map(g => ({ g, ...kickoffOneSide(g, events) }))
  const oneSideCounts = {}
  for (const r of oneSide) oneSideCounts[r.how] = (oneSideCounts[r.how] || 0) + 1
  const decided = rows.filter(r => r.event && (r.how === 'strict' || r.how === 'loose+kickoff'))
    .concat(oneSide.filter(r => r.event).map(r => ({ g: r.g, event: r.event })))
  return {
    _raw: { games, events, rows, oneSide, decided },
    kickoffOneSide: oneSideCounts,
    date, labSoccerGames: games.length, labGamesWithoutKickoff: noKickoff,
    bsd: { pages, count, fetched: events.length, eventShape: shape },
    joined: t, joinedEventsCarryingBothTeamIds: withIds,
    kickoffGapMinutesAmongJoined: times.length ? { n: times.length, max: Math.max(...times), median: times.sort((a, b) => a - b)[Math.floor(times.length / 2)] } : null,
    unmatched: rows.filter(r => r.how === 'none').map(r => ({ sport: r.g.sport, home: r.g.home, away: r.g.away, start: r.g.start_time })),
    ambiguous: rows.filter(r => r.how === 'ambiguous').map(r => ({ sport: r.g.sport, home: r.g.home, away: r.g.away, candidates: r.n })),
    looseOnly: rows.filter(r => r.how === 'loose-only').map(r => ({ lab: `${r.g.home} v ${r.g.away}`, bsd: `${r.event.home_team} v ${r.event.away_team}` })),
  }
}

const report = r => {
  const n = r.labSoccerGames
  console.log(`\n${r.date}: BSD route returned ${r.bsd.fetched} event(s) in ${r.bsd.pages} page(s) (count ${r.bsd.count}); event fields: ${r.bsd.eventShape.join(', ') || 'none'}`)
  console.log(`  joined, of ${n} lab soccer games (${r.labGamesWithoutKickoff} carry no start_time):`)
  for (const [k, v] of Object.entries(r.joined)) console.log(`    ${k.padEnd(14)} ${v} of ${n}`)
  console.log(`  joined events carrying both team ids: ${r.joinedEventsCarryingBothTeamIds}`)
  if (r.kickoffGapMinutesAmongJoined) console.log(`  kickoff gap among joined, minutes: n ${r.kickoffGapMinutesAmongJoined.n}, median ${r.kickoffGapMinutesAmongJoined.median}, max ${r.kickoffGapMinutesAmongJoined.max}`)
  for (const u of r.unmatched.slice(0, 5)) console.log(`    NO JOIN  ${u.sport}: ${u.home} v ${u.away} @ ${u.start}`)
  if (r.unmatched.length > 5) console.log(`    ... and ${r.unmatched.length - 5} more in the artifact`)
  for (const u of r.looseOnly.slice(0, 5)) console.log(`    LOOSE    ${u.lab}  <->  ${u.bsd}`)
}

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()
  const ev = (h, a, when, id = 1) => ({ id, home_team: h, away_team: a, home_team_id: 1, away_team_id: 2, event_date: when })
  const g = (h, a, t) => ({ sport: 'Bundesliga', home: h, away: a, start_time: t })
  const day = '2026-09-05T13:30:00+00:00'
  const how = (game, events) => joinGame(game, events).how
  check('norm folds diacritics and punctuation', norm('FC Bayern München') === 'fcbayernmunchen', norm('FC Bayern München'))
  check('an identical name pair joins strictly', how(g('Freiburg', 'Bayern', '2026-09-05T13:30Z'), [ev('Freiburg', 'Bayern', day)]) === 'strict', '')
  check('FC Bayern München is NOT a strict match for Bayern, and joins loosely with the kickoff',
    how(g('Freiburg', 'Bayern', '2026-09-05T13:30Z'), [ev('SC Freiburg', 'FC Bayern München', day)]) === 'loose+kickoff', how(g('Freiburg', 'Bayern', '2026-09-05T13:30Z'), [ev('SC Freiburg', 'FC Bayern München', day)]))
  check('the same loose pair at the wrong kickoff is loose-only, never counted as joined with a time',
    how(g('Freiburg', 'Bayern', '2026-09-05T20:30Z'), [ev('SC Freiburg', 'FC Bayern München', day)]) === 'loose-only', '')
  check('a game with no start_time never reaches loose+kickoff',
    how(g('Freiburg', 'Bayern', null), [ev('SC Freiburg', 'FC Bayern München', day)]) === 'loose-only', '')
  check('two events one loose name pair at the same kickoff are ambiguous, not the first',
    how(g('Freiburg', 'Bayern', '2026-09-05T13:30Z'), [ev('SC Freiburg', 'FC Bayern München', day, 1), ev('SC Freiburg', 'Bayern Munich II', day, 2)]) === 'ambiguous', '')
  check('a pair with a swapped orientation does not join', how(g('Bayern', 'Freiburg', '2026-09-05T13:30Z'), [ev('SC Freiburg', 'FC Bayern München', day)]) === 'none', '')
  check('a short fragment never joins by containment (under four letters)', contains('rb', 'rbleipzig') === false, '')
  // The name-free keys.
  const e2 = (h, a, when, hid, aid, id = 1) => ({ id, home_team: h, away_team: a, home_team_id: hid, away_team_id: aid, event_date: when })
  const sp = e2('Tottenham Hotspur', 'Newcastle United', day, 11, 12)
  check('kickoff plus ONE side joins Spurs v Newcastle to Tottenham Hotspur v Newcastle United',
    kickoffOneSide(g('Spurs', 'Newcastle', '2026-09-05T13:30Z'), [sp]).how === 'kickoff+one-side', JSON.stringify(kickoffOneSide(g('Spurs', 'Newcastle', '2026-09-05T13:30Z'), [sp])))
  check('kickoff plus one side refuses a different kickoff, even when both names fit',
    kickoffOneSide(g('Spurs', 'Newcastle', '2026-09-05T15:30Z'), [sp]).how === 'none', '')
  check('kickoff plus one side with no start_time is no-kickoff, never a guess', kickoffOneSide(g('Spurs', 'Newcastle', null), [sp]).how === 'no-kickoff', '')
  check('two events at the kickoff that each fit one side are ambiguous',
    kickoffOneSide(g('Spurs', 'Newcastle', '2026-09-05T13:30Z'), [sp, e2('Brighton', 'Newcastle United', day, 14, 12, 2)]).how === 'ambiguous', '')
  const tbl = learnTable([{ game: g('Spurs', 'Newcastle', 'x'), event: sp }, { game: g('Spurs', 'Everton', 'x'), event: e2('Tottenham Hotspur', 'Everton', day, 11, 13, 2) }])
  check('a learned table maps a name to the id both teachers agree on', tbl.get('spurs') === 11 && tbl.get('newcastle') === 12, JSON.stringify([...tbl]))
  const bad = learnTable([{ game: g('Spurs', 'A', 'x'), event: sp }, { game: g('Spurs', 'B', 'x'), event: e2('Other', 'B', day, 99, 5) }])
  check('a name that two teachers resolved to DIFFERENT ids is dropped, not averaged', !bad.has('spurs'), JSON.stringify([...bad]))
  check('idJoin joins by both ids and refuses a name the table does not know',
    idJoin(g('Spurs', 'Newcastle', null), [sp], tbl).how === 'id' && idJoin(g('Spurs', 'Brighton', null), [sp], tbl).how === 'name-not-in-table', '')
  check('idJoin needs BOTH ids: an event with the right home id and the wrong away id does not join',
    idJoin(g('Spurs', 'Newcastle', null), [e2('Tottenham Hotspur', 'Brighton', day, 11, 99, 3)], tbl).how === 'no-event', '')
  check('idJoin with two events for one id pair is ambiguous', idJoin(g('Spurs', 'Newcastle', null), [sp, { ...sp, id: 7 }], tbl).how === 'ambiguous', '')
  finish(summarize())
} else if (isMain(import.meta.url)) {
  const i = process.argv.indexOf('--dates')
  const dates = (i > 0 ? process.argv[i + 1] : '2026-08-29,2026-09-05').split(',')
  const out = { measuredAt: new Date().toISOString(), relay: RELAY, soccerSports: SOCCER, kickoffMinutes: KICKOFF_MINUTES, dates: [] }
  for (const d of dates) { const r = await probeDate(d); out.dates.push(r); report(r) }
  // Cross-date table: each date is scored against a table learned from the OTHER dates only.
  for (const r of out.dates) {
    const teachers = out.dates.filter(o => o !== r).flatMap(o => o._raw.decided.map(x => ({ game: x.g, event: x.event })))
    const table = learnTable(teachers)
    const res = r._raw.games.map(g => ({ g, ...idJoin(g, r._raw.events, table) }))
    const cnt = {}
    for (const x of res) cnt[x.how] = (cnt[x.how] || 0) + 1
    // Where the name rule ALSO decided, do the two agree on the event? A disagreement is a wrong join.
    const byName = new Map(r._raw.decided.map(x => [x.g, x.event]))
    const both = res.filter(x => x.event && byName.get(x.g))
    const disagree = both.filter(x => x.event.id !== byName.get(x.g).id)
    const already = new Set(r._raw.decided.map(x => x.g))
    r.idTable = { learnedFrom: out.dates.filter(o => o !== r).map(o => o.date), tableNames: table.size, outcome: cnt,
      agreedWithNameJoin: both.length - disagree.length, disagreedWithNameJoin: disagree.length,
      joinedOnlyByIdTable: res.filter(x => x.event && !already.has(x.g)).length,
      stillUnjoined: res.filter(x => !x.event && !already.has(x.g)).map(x => ({ sport: x.g.sport, home: x.g.home, away: x.g.away, why: x.how })) }
    console.log(`\n${r.date} — kickoff + one side by name: ${JSON.stringify(r.kickoffOneSide)} of ${r.labSoccerGames}`)
    console.log(`${r.date} — id table learned from ${r.idTable.learnedFrom.join(', ')} (${table.size} names): ${JSON.stringify(cnt)} of ${r.labSoccerGames}`)
    console.log(`  agrees with the name join on ${r.idTable.agreedWithNameJoin} game(s), DISAGREES on ${r.idTable.disagreedWithNameJoin}; joined ONLY by the id table: ${r.idTable.joinedOnlyByIdTable}`)
  }
  for (const r of out.dates) {
    r.bsd.events = r._raw.events.map(e => ({ id: e.id, league_id: e.league_id, home_team_id: e.home_team_id, home_team: e.home_team, away_team_id: e.away_team_id, away_team: e.away_team, event_date: e.event_date }))
    delete r._raw
  }
  const games = out.dates.reduce((n, r) => n + r.labSoccerGames, 0)
  const strict = out.dates.reduce((n, r) => n + r.joined.strict, 0)
  const timed = out.dates.reduce((n, r) => n + r.joined['loose+kickoff'], 0)
  console.log(`\nCOVERAGE: ${dates.length} committed date(s), ${games} lab soccer games: strict name ${strict}, loose+kickoff ${timed}, neither ${games - strict - timed}.`)
  mkdirSync('outbox', { recursive: true })
  writeFileSync('outbox/bsd-join-probe-latest.json', JSON.stringify(out, null, 2) + '\n')
}
