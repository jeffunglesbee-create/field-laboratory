// The work list for venue sourcing: every venue the archive has seen that the
// venue table does not carry and that is not a recorded indoor arena.
//
// docs/CC-CMD-2026-10-20-outdoor-venue-sourcing.md, Task 0.2. The strings come
// from the relay's own archive route, `GET /archive/sport/:sport`, which reads the
// same table the D1 query did, so nothing is copied by hand: a name typed from a
// transcript is a name that can be mistyped, and a mistyped name geocodes to
// nothing or to the wrong place.
//
// COMPLETENESS IS ASSERTED, NOT HOPED FOR. EXPECTED_ROWS is the per-sport row count
// of `regular_season_games` measured against field-archive on 2026-10-21. The
// route returns regular AND postseason rows, and the table only grows, so a
// response with FEWER rows than that is a truncated read and fails the run.
//
// Usage:  node scripts/venue-targets.mjs --self-test     (no network)
//         node scripts/venue-targets.mjs                 (runner; writes outbox/venue-targets-latest.json)

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createChecks, finish, isMain } from './checks.mjs'
import { readTable } from './venue-source.mjs'

export const RELAY = 'https://field-relay-nba.jeffunglesbee.workers.dev'

// Sport keys exactly as field-archive stores them, with the row counts measured on 2026-10-21.
export const EXPECTED_ROWS = {
  'MLB': 1353, 'MLS': 662, 'CFB': 514, 'WNBA': 259, 'NHL': 218, 'NFL': 141, 'AFL': 138,
  'FIFA World Cup': 103, 'La Liga': 101, 'EPL': 96, 'golf': 85, 'NBA': 81, 'EFL Cup': 73,
  'Serie A': 70, 'EFL Trophy': 65, 'Ligue 1': 65, 'UEFA Champions League': 55, 'Bundesliga': 54,
  'UEFA Europa Conference League Qualifying': 48, 'CFL': 44, 'UEFA Europa League': 37,
  'UEFA Europa League Qualifying': 24, 'PGA Tour': 23, 'wnba': 21, 'UEFA Europa Conference League': 19,
  'UEFA Champions League Qualifying': 11, 'IPL': 2,
}

/** The indoor arenas recorded in src/Venues.fs, read from the source so this cannot drift from it. */
export const readArenas = (text = readFileSync('src/Venues.fs', 'utf8')) => {
  const i = text.indexOf('let private indoorArenas')
  const j = text.indexOf('/// True when the name is a recorded indoor arena')
  if (i < 0 || j < i) return []
  return [...text.slice(i, j).matchAll(/^\s*(?:set \[ )?"([^"]+)"/gm)].map(m => m[1])
}

/**
 * games: [{ sport, venue, date }] across sports. Returns the venues that are neither in the
 * table nor a recorded arena, grouped by (sport, venue), most-played first.
 */
export const targetsFrom = (games, tableNames, arenaNames) => {
  const known = new Set(tableNames)
  const arenas = new Set(arenaNames)
  const by = new Map()
  for (const g of games) {
    const v = typeof g.venue === 'string' ? g.venue.trim() : ''
    if (v === '' || known.has(v) || arenas.has(v)) continue
    const key = `${g.sport}\u0000${v}`
    const e = by.get(key) ?? { sport: g.sport, venue: v, games: 0, first: g.date, last: g.date }
    e.games++
    if (g.date < e.first) e.first = g.date
    if (g.date > e.last) e.last = g.date
    by.set(key, e)
  }
  return [...by.values()].sort((a, b) => b.games - a.games || a.sport.localeCompare(b.sport) || a.venue.localeCompare(b.venue))
}

const selfTest = () => {
  const { check, summarize } = createChecks()
  const games = [
    { sport: 'CFB', venue: 'Husky Stadium', date: '2026-10-09' },
    { sport: 'CFB', venue: 'Husky Stadium', date: '2026-09-12' },
    { sport: 'CFB', venue: 'Fenway Park', date: '2026-10-01' },      // in the table
    { sport: 'NHL', venue: 'Bell Centre', date: '2026-10-02' },      // a recorded arena
    { sport: 'NFL', venue: '', date: '2026-10-03' },                 // no venue
    { sport: 'NFL', venue: null, date: '2026-10-03' },
    { sport: 'NFL', venue: '  Anfield  ', date: '2026-10-04' },     // padded; trimmed, then it is in the table
  ]
  const t = targetsFrom(games, ['Fenway Park', 'Anfield'], ['Bell Centre'])
  check('a venue the table carries is not a target', !t.some(x => x.venue === 'Fenway Park'), JSON.stringify(t))
  check('a recorded arena is not a target', !t.some(x => x.venue === 'Bell Centre'), JSON.stringify(t))
  check('an empty or missing venue is not a target', !t.some(x => x.venue === '' || x.venue == null), JSON.stringify(t))
  check('a padded name is trimmed before it is compared to the table', !t.some(x => /Anfield/.test(x.venue)), JSON.stringify(t))
  check('the one real target is counted, with its first and last date',
    t.length === 1 && t[0].venue === 'Husky Stadium' && t[0].games === 2 && t[0].first === '2026-09-12' && t[0].last === '2026-10-09',
    JSON.stringify(t))
  check('the same venue under two sports is two targets, not merged',
    targetsFrom([{ sport: 'A', venue: 'X', date: 'd' }, { sport: 'B', venue: 'X', date: 'd' }], [], []).length === 2)
  check('the real arena list is read from src/Venues.fs and is not empty', readArenas().length > 0, 'indoorArenas not found')
  check('the real table and arena list share no name', readTable().every(v => !readArenas().includes(v.name)), 'a name is in both')
  finish(summarize())
}

const run = async () => {
  const table = readTable().map(v => v.name)
  const arenas = readArenas()
  const games = []
  const perSport = []
  for (const [sport, expected] of Object.entries(EXPECTED_ROWS)) {
    const res = await fetch(`${RELAY}/archive/sport/${encodeURIComponent(sport)}`, { headers: { 'User-Agent': 'field-laboratory-venue-targets/1.0' }, signal: AbortSignal.timeout(60000) })
    if (!res.ok) { perSport.push({ sport, expected, got: null, why: `HTTP ${res.status}` }); continue }
    const body = await res.json()
    const rows = Array.isArray(body.games) ? body.games : []
    perSport.push({ sport, expected, got: rows.length })
    for (const g of rows) games.push({ sport, venue: g.venue, date: g.date })
    console.log(`  ${sport.padEnd(42)} ${String(rows.length).padStart(5)} rows  (measured on 2026-10-21: ${expected})`)
  }
  const targets = targetsFrom(games, table, arenas)
  const distinct = new Set(targets.map(t => t.venue)).size
  const bySport = {}
  for (const t of targets) bySport[t.sport] = (bySport[t.sport] ?? 0) + 1
  const NOW = new Date()
  mkdirSync('outbox', { recursive: true })
  writeFileSync('outbox/venue-targets-latest.json', JSON.stringify({
    at: NOW.toISOString(), table: table.length, arenas: arenas.length, rows: games.length,
    targets: targets.length, distinctVenueNames: distinct, bySport, perSport, list: targets,
  }, null, 2) + '\n')
  console.log(`\n  ${targets.length} (sport, venue) targets · ${distinct} distinct names · from ${games.length} rows · table ${table.length} · arenas ${arenas.length}\n`)
  const { check, summarize } = createChecks()
  const short = perSport.filter(p => p.got === null || p.got < p.expected)
  check(`every sport was read in full: ${perSport.length - short.length} of ${perSport.length} sports at or above their measured row count`,
    short.length === 0, short.map(p => `${p.sport}: ${p.got ?? p.why} of ${p.expected}`).join('; '))
  check('there is at least one target', targets.length > 0, 'nothing to source')
  finish(summarize())
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--self-test')) selfTest()
  else await run()
}
