// FOUR PREMISES THE EPL FORECAST ON THE CARD RESTS ON, EACH MEASURED BY ONE COMMAND (Rule 100). Written 2026-11-08 for
// docs/CC-CMD-2026-09-11-epl-forecaster-phase1.md; the result is outbox/forecast-premises-2026-11-08.txt, and
// outbox/cc-session-2026-11-08-epl-forecast-on-cards.md says what each one decided.
//
//   1. THE SERVED TABLE HOLDS A MATCH THE MOMENT IT ENDS. If it does, a forecast on a Final card is made from a table that already contains the
//      card's own result, so a Final card must carry no forecast. Measured: gamesPlayed in the served table against the count of finished EPL
//      rows in the archive, club by club.
//   2. AN UNSCORED ROW IS READ AS SCHEDULED WHILE IT IS IN PLAY. If it is, `Scheduled` alone cannot decide that a card is before kickoff, so the
//      kickoff time must. Measured: the lab's own Desk.gameStateAt on the row of a match that had kicked off, at a named instant.
//   3. THE NEXT EPL KICKOFF. If none is ahead before 2026-11-21, no live card can carry a forecast before then, and the live proof is staged
//      until that morning. Measured: the earliest kickoff_time after the named instant, in the relay's /fpl/fixtures.
//   4. WHEN A DAY'S ROWS EXIST. A card exists only once the archive has made its row, so the live probe's window opens when the rows appear and
//      closes at the first kickoff. Measured: every EPL row's created_at against its own date and its kickoff.
//
// DATA (the same three the backtest reads; fetched 2026-11-08 between 16:33Z and 16:36Z):
//   one /context/date payload per day, as in outbox/forecast-backtest-2026-11-08.mjs                       -> <season>/YYYY-MM-DD.json
//   curl -s https://field-relay-nba.jeffunglesbee.workers.dev/espn-standings/soccer/eng.1/standings            -> standings.json
//   curl -s https://field-relay-nba.jeffunglesbee.workers.dev/fpl/fixtures                                     -> fpl-fixtures.json
// RUN.  npm run build && node outbox/forecast-premises-2026-11-08.mjs <season-dir> <standings.json> <fpl-fixtures.json>
//
// The instant is fixed (AS_OF), not read from the clock: the row it judges was unscored when it was fetched, and a re-fetch later in the day
// would carry a score and answer a different question.

import fs from 'node:fs'
import { decodePayload, sportMeta, gameStateAt } from '../build/Desk.js'

const [season, standingsFile, fplFile] = process.argv.slice(2)
if (!season || !standingsFile || !fplFile) {
  console.error('usage: node outbox/forecast-premises-2026-11-08.mjs <season-dir> <standings.json> <fpl-fixtures.json>')
  process.exit(2)
}
const AS_OF = new Date('2026-11-08T17:15:00Z')

const norm = n => (n === 'Man United' ? 'Man Utd' : n) // this script only: the archive changed the spelling on 2026-10-31
const eplRows = []
for (const f of fs.readdirSync(season).filter(f => f.endsWith('.json')).sort()) {
  const r = decodePayload(fs.readFileSync(`${season}/${f}`, 'utf8'))
  for (const g of Array.from(r.fields[0].Regular)) if (sportMeta(g.Sport).Label === 'EPL') eplRows.push({ g, file: f })
}

// 1 ─ table against archive
{
  const played = new Map()
  let finals = 0
  for (const { g } of eplRows) {
    if (g.HomeScore == null || g.AwayScore == null) continue
    finals++
    for (const n of [norm(g.Home), norm(g.Away)]) played.set(n, (played.get(n) ?? 0) + 1)
  }
  const entries = JSON.parse(fs.readFileSync(standingsFile, 'utf8')).children[0].standings.entries
  const table = new Map(entries.map(e => [e.team.shortDisplayName, e.stats.find(s => s.name === 'gamesPlayed').value]))
  const differ = [...table].filter(([club, gp]) => (played.get(club) ?? 0) !== gp).map(([club, gp]) => `${club}: table ${gp}, archive finals ${played.get(club) ?? 0}`)
  console.log(`1. finished EPL rows in ${eplRows.length} archive rows (${fs.readdirSync(season).filter(f => f.endsWith('.json')).length} daily payloads): ${finals}`)
  console.log(`   clubs in the served table: ${table.size}; gamesPlayed equals the archive's finished count for ${table.size - differ.length} of ${table.size}`)
  if (differ.length) console.log(`   differ: ${differ.join(' | ')}`)
}

// 2 ─ an unscored row after kickoff
{
  const hit = eplRows.find(({ g, file }) => file === '2026-11-08.json' && /^Man U/.test(g.Home) && g.Away === 'Aston Villa')
  if (!hit) {
    console.log('2. no Man Utd v Aston Villa row in 2026-11-08.json')
  } else {
    const g = hit.g
    const state = gameStateAt(AS_OF, g)
    const cases = ['Scheduled', 'InProgress', 'Final'] // the order Desk.GameState declares them
    console.log(`2. row as fetched: ${g.Home} v ${g.Away}, start ${g.RawStartTime}, home_score ${g.HomeScore ?? 'null'}, away_score ${g.AwayScore ?? 'null'}, finalized_at ${g.FinalizedAt ?? 'null'}`)
    console.log(`   Desk.gameStateAt at ${AS_OF.toISOString()} (${Math.round((AS_OF - Date.parse(g.RawStartTime)) / 60000)} minutes after the row's start): ${cases[state.tag]}`)
  }
}

// 3 ─ the next kickoff
{
  const fixtures = JSON.parse(fs.readFileSync(fplFile, 'utf8'))
  const ahead = fixtures.filter(f => Date.parse(f.kickoff_time) > AS_OF.getTime()).sort((a, b) => a.kickoff_time.localeCompare(b.kickoff_time))
  const first = ahead[0]
  const sameKickoff = ahead.filter(f => f.kickoff_time === first.kickoff_time).length
  console.log(`3. fixtures in /fpl/fixtures: ${fixtures.length}; with a kickoff after ${AS_OF.toISOString()}: ${ahead.length}`)
  console.log(`   earliest: gameweek ${first.event}, ${first.kickoff_time} (${sameKickoff} fixture(s) at that kickoff)`)
}

// 4 ─ when a day's rows exist
{
  const hours = (a, b) => (Date.parse(b) - Date.parse(a)) / 36e5
  const iso = t => t.replace(' ', 'T').replace(/Z?$/, 'Z')
  const rows = []
  for (const f of fs.readdirSync(season).filter(f => f.endsWith('.json')).sort()) {
    const j = JSON.parse(fs.readFileSync(`${season}/${f}`, 'utf8'))
    for (const g of (j.games && j.games.regular) || []) if (g.sport === 'EPL') rows.push(g)
  }
  const afterMidnight = rows.map(g => hours(`${g.date}T00:00:00Z`, iso(g.created_at)))
  const onDay = afterMidnight.filter(h => h >= 0 && h < 24).sort((a, b) => a - b)
  const toKickoff = rows.filter(g => g.start_time).map(g => hours(iso(g.created_at), iso(g.start_time))).sort((a, b) => a - b)
  const mid = xs => xs[Math.floor(xs.length / 2)]
  console.log(`4. EPL rows: ${rows.length}; created on their own date: ${onDay.length}; before it: ${afterMidnight.filter(h => h < 0).length}; after it: ${afterMidnight.filter(h => h >= 24).length}`)
  console.log(`   hours after 00:00Z on the day: min ${onDay[0].toFixed(2)}, median ${mid(onDay).toFixed(2)}, max ${onDay[onDay.length - 1].toFixed(2)}`)
  console.log(`   hours from creation to kickoff (${toKickoff.length} rows with a start_time): min ${toKickoff[0].toFixed(2)}, median ${mid(toKickoff).toFixed(2)}, max ${toKickoff[toKickoff.length - 1].toFixed(2)}`)
}
