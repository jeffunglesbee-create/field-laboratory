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
  return {
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
  finish(summarize())
} else if (isMain(import.meta.url)) {
  const i = process.argv.indexOf('--dates')
  const dates = (i > 0 ? process.argv[i + 1] : '2026-08-29,2026-09-05').split(',')
  const out = { measuredAt: new Date().toISOString(), relay: RELAY, soccerSports: SOCCER, kickoffMinutes: KICKOFF_MINUTES, dates: [] }
  for (const d of dates) { const r = await probeDate(d); out.dates.push(r); report(r) }
  const games = out.dates.reduce((n, r) => n + r.labSoccerGames, 0)
  const strict = out.dates.reduce((n, r) => n + r.joined.strict, 0)
  const timed = out.dates.reduce((n, r) => n + r.joined['loose+kickoff'], 0)
  console.log(`\nCOVERAGE: ${dates.length} committed date(s), ${games} lab soccer games: strict name ${strict}, loose+kickoff ${timed}, neither ${games - strict - timed}.`)
  mkdirSync('outbox', { recursive: true })
  writeFileSync('outbox/bsd-join-probe-latest.json', JSON.stringify(out, null, 2) + '\n')
}
