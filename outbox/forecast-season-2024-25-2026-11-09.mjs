// THE 2024-25 EPL SEASON AS DATA, AND THE PROOF THAT THE DATA IS RIGHT. Written 2026-11-09 for docs/CC-CMD-2026-09-11-epl-forecaster-phase1.md, to feed
// outbox/forecast-fit-c-2026-11-09.mjs (whose rule was committed first, in 3ff1763, before this file existed). It computes NO model number, no draw share and no tally of results:
// it parses 380 matches, checks them against two other sources, and writes them out as a bundle. Its output is outbox/forecast-season-2024-25-2026-11-09.txt.
//
// WHERE THE RESULTS COME FROM, and why they are believed.  openfootball is the source of the scores. Two other sources agree with it before the bundle is written:
//   ESPN's final 2024-25 table, through the relay, decoded by the card's own decoder (build/Standings.js)  -> 20 clubs x (played, points, GF, GA)
//   FPL's fixtures for the same season (a GitHub mirror), joined by date and score, not by name         -> 380 fixtures, 20 clubs mapped one-to-one
// Each file is pinned by commit (where it has one) and by sha256 below; a changed byte is a failed check, not a silent difference.
//
// FETCH.  mkdir src && cd src && (each line exactly as written; the hashes below are the check)
//   curl -sS -o openfootball-2024-25.txt  https://raw.githubusercontent.com/openfootball/england/9ee7a0c351805c99cc334478a9bf04b7d0432fec/2024-25/1-premierleague.txt
//   curl -sS -o fpl-fixtures-2024-25.csv  https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/d7b05b51d137bfefef4b692386d18c610975b9b9/data/2024-25/fixtures.csv
//   curl -sS -o fpl-teams-2024-25.csv     https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/d7b05b51d137bfefef4b692386d18c610975b9b9/data/2024-25/teams.csv
//   curl -sS -o espn-final-2024.json      'https://field-relay-nba.jeffunglesbee.workers.dev/espn-standings/soccer/eng.1/standings?season=2024'
// RUN.    npm run build && node outbox/forecast-season-2024-25-2026-11-09.mjs src [--write-bundle=outbox/forecast-season-2024-25-2026-11-09.json]
// Exit 0 only if every check holds. Coverage is printed where each number is. LICENCE of the sources is NOT assessed here (STANDARDS Rule 45): flagged for a human, in the session document.
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fromString } from '../build/Standings.js'

const argv = process.argv.slice(2)
const writeBundle = (argv.find(a => a.startsWith('--write-bundle=')) ?? '').replace('--write-bundle=', '') || null
const [dir] = argv.filter(a => !a.startsWith('--'))
if (!dir) { console.error('usage: node outbox/forecast-season-2024-25-2026-11-09.mjs <sources-directory> [--write-bundle=<path>]'); process.exit(2) }

const SOURCES = {
  openfootball: { file: 'openfootball-2024-25.txt', bytes: 30316, sha256: 'e39716b01af0c8654a9fae7b5555e6b02f506ea05239e0d0eef41936ba80e1e3',
    url: 'https://raw.githubusercontent.com/openfootball/england/9ee7a0c351805c99cc334478a9bf04b7d0432fec/2024-25/1-premierleague.txt' },
  fplFixtures: { file: 'fpl-fixtures-2024-25.csv', bytes: 751413, sha256: 'ce696e187569ca7c45da2562811d3c38f525b58e65575531be37bebd0769ee28',
    url: 'https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/d7b05b51d137bfefef4b692386d18c610975b9b9/data/2024-25/fixtures.csv' },
  fplTeams: { file: 'fpl-teams-2024-25.csv', bytes: 1717, sha256: 'd10a6db8feca6db9e44a3ba50b15168396667ea387fee9235d6b211c7f598c3b',
    url: 'https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/d7b05b51d137bfefef4b692386d18c610975b9b9/data/2024-25/teams.csv' },
  espnFinal: { file: 'espn-final-2024.json', bytes: 69462, sha256: 'e31a22e253917ea4cd42b728ce66d52f531c37044d0936abbd36431893624a42',
    url: 'https://field-relay-nba.jeffunglesbee.workers.dev/espn-standings/soccer/eng.1/standings?season=2024' },
}
const checks = []
const check = (name, ok, detail = '') => { checks.push({ name, ok: Boolean(ok), detail }) }
const sha256 = b => createHash('sha256').update(b).digest('hex')
const load = key => {
  const s = SOURCES[key], buf = fs.readFileSync(path.join(dir, s.file))
  check(`source ${key} is the pinned file (${s.bytes} bytes, sha256)`, buf.length === s.bytes && sha256(buf) === s.sha256, `${buf.length} B, ${sha256(buf).slice(0, 16)}`)
  return buf.toString('utf8')
}

// ---------------------------------------------------------------------------------------------------------------- openfootball, 2024-25 layout
// This season's file is NOT laid out like 2025-26's (which outbox/forecast-backtest-prior-season-2026-11-08.mjs reads): CRLF line ends; headings are "▪ Matchday N" and
// repeat for rescheduled matches; date lines are indented two spaces and carry the year only at the start; fixture lines are indented four or more spaces, "<time?>  Home   v Away   H-A (h-a)",
// the time is left out on a second fixture at the same kick-off, and 16 fixtures carry no half-time score at all. Strict: a line this does not recognise is a problem, never skipped.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const iso = (y, mo, d) => new Date(Date.UTC(y, mo, d)).toISOString().slice(0, 10)
function parseOpenfootball(text) {
  const problems = [], matches = [], head = {}, headings = []
  let year = null, month = null, date = null, dow = null, matchday = null, time = null, title = null, dateLines = 0, noHalfTime = 0, inherited = 0
  text.split('\n').forEach((raw, idx) => {
    const ln = idx + 1, line = raw.replace(/\r$/, '')
    if (line.trim() === '') return
    let m
    if ((m = /^= (.+?)\s*$/.exec(line))) { title = m[1]; return }
    if ((m = /^# Matches\s+(\d+)\s*$/.exec(line))) { head.matches = +m[1]; return }
    if ((m = /^# Teams\s+(\d+)\s*$/.exec(line))) { head.teams = +m[1]; return }
    if ((m = /^# Date\s+\w{3} (\w{3}) (\d+) (\d{4}) - \w{3} (\w{3}) (\d+) (\d{4})/.exec(line))) {
      head.first = iso(+m[3], MONTHS.indexOf(m[1]), +m[2]); head.last = iso(+m[6], MONTHS.indexOf(m[4]), +m[5]); return
    }
    if ((m = /^▪ Matchday (\d+)\s*$/.exec(line))) { matchday = +m[1]; headings.push(matchday); return }
    if ((m = /^  (Sun|Mon|Tue|Wed|Thu|Fri|Sat) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2})(?: (\d{4}))?\s*$/.exec(line))) {
      const mo = MONTHS.indexOf(m[2])
      let y = m[4] ? +m[4] : year
      if (y === null) { problems.push(`line ${ln}: a date with no year before any year was given`); return }
      if (!m[4] && month !== null && mo < month) y = year + 1
      year = y; month = mo; dateLines++
      if (WEEKDAYS[new Date(Date.UTC(y, mo, +m[3])).getUTCDay()] !== m[1]) problems.push(`line ${ln}: ${m[1]} ${m[2]} ${m[3]} ${y} is not a ${m[1]}`)
      date = iso(y, mo, +m[3]); dow = m[1]; time = null
      return
    }
    if ((m = /^\s{4,}(?:(\d{2}:\d{2})\s+)?(.+?)\s+v\s+(.+?)\s+(\d+)-(\d+)(?:\s+\((\d+)-(\d+)\))?\s*$/.exec(line))) {
      if (date === null || matchday === null) { problems.push(`line ${ln}: a match before any date or matchday`); return }
      if (m[1]) time = m[1]; else if (time !== null) inherited++
      if (time === null) { problems.push(`line ${ln}: the first fixture on ${date} has no kick-off time`); return }
      if (m[6] === undefined) noHalfTime++
      matches.push({ i: matches.length, ln, matchday, date, time, dow, home: m[2], away: m[3], hg: +m[4], ag: +m[5] })
      return
    }
    problems.push(`line ${ln}: not recognised: ${line.slice(0, 70)}`)
  })
  return { matches, head, headings, title, problems, dateLines, noHalfTime, inherited }
}

const of = parseOpenfootball(load('openfootball'))
const M = of.matches
const clubs = [...new Set(M.flatMap(m => [m.home, m.away]))].sort()
check('openfootball: the file\'s title is "English Premier League 2024/25"', of.title === 'English Premier League 2024/25', String(of.title))
check('openfootball: every non-blank line is a title, a header, a heading, a date or a fixture', of.problems.length === 0, of.problems.slice(0, 2).join(' | '))
check(`openfootball: the header's ${of.head.matches} matches and ${of.head.teams} teams are what the file holds (${M.length}, ${clubs.length})`, of.head.matches === M.length && of.head.teams === clubs.length && M.length === 380 && clubs.length === 20)
check('openfootball: every club has 38 matches, 19 home and 19 away', clubs.every(c => M.filter(m => m.home === c).length === 19 && M.filter(m => m.away === c).length === 19))
check('openfootball: every ordered pair of clubs meets exactly once (380 distinct, none against itself)', new Set(M.map(m => m.home + '|' + m.away)).size === 380 && M.every(m => m.home !== m.away))
check(`openfootball: the matchday headings (${of.headings.length} of them, ${of.headings.length - new Set(of.headings).size} repeats for rescheduled matches) cover exactly 1..38`,
  JSON.stringify([...new Set(of.headings)].sort((a, b) => a - b)) === JSON.stringify(Array.from({ length: 38 }, (_, i) => i + 1)))
check(`openfootball: every date line names its own weekday (${of.dateLines} date lines, none flagged), so a wrong year anywhere fails`, of.dateLines > 0 && !of.problems.some(p => p.includes(' is not a ')))
const dates = M.map(m => m.date).sort()
check(`openfootball: the earliest and latest match dates are the header's first and last day (${dates[0]}..${dates.at(-1)})`, dates[0] === of.head.first && dates.at(-1) === of.head.last)
check('openfootball: no club plays twice on one date (so order within a day cannot change a table)', new Set(M.flatMap(m => [m.date + m.home, m.date + m.away])).size === 760)
console.log(`openfootball: ${of.dateLines} date lines, ${M.length} fixtures (${of.inherited} with the kick-off time carried from the line above, ${of.noHalfTime} with no half-time score)`)

// ---- the final table the results make, against ESPN's
const tableOf = ms => {
  const t = new Map(); const g = n => { if (!t.has(n)) t.set(n, { p: 0, pts: 0, gf: 0, ga: 0 }); return t.get(n) }
  for (const m of ms) {
    const h = g(m.home), a = g(m.away)
    h.p++; a.p++; h.gf += m.hg; h.ga += m.ag; a.gf += m.ag; a.ga += m.hg
    if (m.hg > m.ag) h.pts += 3; else if (m.hg === m.ag) { h.pts++; a.pts++ } else a.pts += 3
  }
  return t
}
const final = tableOf(M)
const espnText = load('espnFinal')
const espnJson = JSON.parse(espnText)
const espn = fromString(espnText)
check('espn final 2024 table decodes with the card\'s decoder (Standings.fromString)', espn.tag === 0)
const E = espn.tag === 0 ? Array.from(espn.fields[0]) : []
const tup = (p, pts, gf, ga) => `${p}|${pts}|${gf}|${ga}`
const eByTuple = new Map(E.map(r => [tup(r.Played, r.Points, r.GoalsFor, r.GoalsAgainst), r]))
check('espn final: the payload is the 2024-25 season (season 2024, "English Premier League 2024-2025")', espnJson.season?.year === 2024 && espnJson.children?.[0]?.name === 'English Premier League 2024-2025' && espnJson.children?.[0]?.standings?.season === 2024)
check('espn final: 20 rows, 20 distinct (played, points, GF, GA) tuples, so a club is identified by its tuple and not by its name', E.length === 20 && eByTuple.size === 20 && new Set([...final.values()].map(t => tup(t.p, t.pts, t.gf, t.ga))).size === 20)
const tableMatches = [...final].filter(([, t]) => eByTuple.has(tup(t.p, t.pts, t.gf, t.ga)))
check(`results-derived final table equals ESPN's, club by club (${tableMatches.length} of 20 clubs on played, points, GF, GA)`, tableMatches.length === 20)
check('espn final: no club carries a points deduction, so points rebuilt from results are the official points', E.length === 20 && E.every(r => r.Deductions === 0))

// ---- fixture level, against FPL, joined by date and score and NOT by name
function parseCsv(text) {
  const rows = []; let row = [], field = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else q = false } else field += c }
    else if (c === '"') q = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c !== '\r') field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows
}
const objects = text => { const [h, ...rs] = parseCsv(text); return rs.filter(r => r.length === h.length).map(r => Object.fromEntries(h.map((k, i) => [k, r[i]]))) }
const fplRows = objects(load('fplFixtures'))
const fplTeamRows = objects(load('fplTeams'))
const fplNames = Object.fromEntries(fplTeamRows.map(r => [r.id, r.name]))
const F = fplRows.map(r => ({ date: r.kickoff_time.slice(0, 10), h: +r.team_h, a: +r.team_a, hg: +r.team_h_score, ag: +r.team_a_score, done: r.finished === 'True' }))
check(`fpl fixtures: ${fplRows.length} rows parsed (the stats column holds commas and quotes), all finished, all scores whole numbers`, fplRows.length === 380 && F.every(f => f.done && Number.isInteger(f.hg) && Number.isInteger(f.ag)))
check(`fpl teams: ${fplTeamRows.length} teams, ids unique, every fixture's two teams are among them`, fplTeamRows.length === 20 && Object.keys(fplNames).length === 20 && F.every(f => fplNames[f.h] !== undefined && fplNames[f.a] !== undefined))
function pairFixtures(As, Bs) {
  const key = x => `${x.date}|${x.hg}|${x.ag}`
  const bucket = xs => { const m = new Map(); xs.forEach((x, i) => { const k = key(x); if (!m.has(k)) m.set(k, []); m.get(k).push(i) }); return m }
  const bA = bucket(As), bB = bucket(Bs), keys = new Set([...bA.keys(), ...bB.keys()])
  const sizeMismatch = [...keys].filter(k => (bA.get(k)?.length ?? 0) !== (bB.get(k)?.length ?? 0))
  const map = new Map(), rev = new Map(), pairs = [], conflicts = [], usedA = new Set(), usedB = new Set()
  const fits = (a, b) => (!map.has(a.home) || map.get(a.home) === b.h) && (!map.has(a.away) || map.get(a.away) === b.a) && (!rev.has(b.h) || rev.get(b.h) === a.home) && (!rev.has(b.a) || rev.get(b.a) === a.away)
  const learn = (a, b) => {
    for (const [club, id] of [[a.home, b.h], [a.away, b.a]]) {
      if (map.has(club) && map.get(club) !== id) conflicts.push(`${club}: ${map.get(club)} and ${id}`)
      if (rev.has(id) && rev.get(id) !== club) conflicts.push(`${id}: ${rev.get(id)} and ${club}`)
      map.set(club, id); rev.set(id, club)
    }
  }
  for (let progress = true; progress;) {
    progress = false
    for (const k of keys) {
      const as = (bA.get(k) ?? []).filter(i => !usedA.has(i)), bs = (bB.get(k) ?? []).filter(j => !usedB.has(j))
      for (const i of as) {
        if (usedA.has(i)) continue
        const cands = bs.filter(j => !usedB.has(j) && fits(As[i], Bs[j]))
        if (cands.length !== 1) continue
        const j = cands[0]
        if (as.some(i2 => i2 !== i && !usedA.has(i2) && fits(As[i2], Bs[j]))) continue     // another fixture could take it: wait for more of the mapping
        usedA.add(i); usedB.add(j); learn(As[i], Bs[j]); pairs.push([i, j]); progress = true
      }
    }
  }
  return { sizeMismatch, pairs, leftA: As.length - usedA.size, leftB: Bs.length - usedB.size, map, rev, conflicts }
}
const pf = pairFixtures(M, F)
check(`fpl: the same multiset of (date, home goals, away goals) as openfootball (${pf.sizeMismatch.length} unequal groups)`, pf.sizeMismatch.length === 0)
check(`fpl: every one of ${M.length} openfootball matches and every one of ${F.length} FPL fixtures pairs one-to-one (${pf.pairs.length} pairs; ${pf.leftA} openfootball and ${pf.leftB} FPL left over)`,
  pf.pairs.length === M.length && pf.pairs.length === F.length && pf.leftA === 0 && pf.leftB === 0)
check(`fpl: openfootball clubs and FPL teams map one-to-one, ${pf.map.size} of 20, with ${pf.conflicts.length} conflicts`, pf.map.size === 20 && pf.rev.size === 20 && pf.conflicts.length === 0)
const agree = pf.pairs.filter(([i, j]) => M[i].date === F[j].date && M[i].hg === F[j].hg && M[i].ag === F[j].ag && pf.map.get(M[i].home) === F[j].h && pf.map.get(M[i].away) === F[j].a).length
check(`fpl: paired fixtures agree on date, both scores and both clubs under the one mapping (${agree} of ${M.length})`, agree === M.length)

// ---------------------------------------------------------------------------------------------------------------- the bundle
const bundle = {
  season: '2024-25',
  note: 'Written by outbox/forecast-season-2024-25-2026-11-09.mjs from the four raw files pinned in `raw`. Matches are in the file\'s order (`i`); `time` is the kick-off, carried from the line above where the file leaves it out.',
  raw: Object.fromEntries(Object.entries(SOURCES).map(([k, s]) => [k, { url: s.url, bytes: s.bytes, sha256: s.sha256 }])),
  espn: { season: espnJson.season?.year ?? null, name: espnJson.children?.[0]?.name ?? null },
  header: { matches: of.head.matches, teams: of.head.teams, first: of.head.first, last: of.head.last },
  matches: M.map(m => ({ i: m.i, ln: m.ln, matchday: m.matchday, date: m.date, time: m.time, dow: m.dow, home: m.home, away: m.away, hg: m.hg, ag: m.ag })),
  standings: E.map(r => ({ team: r.Team, played: r.Played, points: r.Points, gf: r.GoalsFor, ga: r.GoalsAgainst, deductions: r.Deductions })),
  fpl: F.map(f => ({ date: f.date, h: f.h, a: f.a, hg: f.hg, ag: f.ag })),
  fplNames,
}
const text = JSON.stringify(bundle, null, 1) + '\n'
if (writeBundle) fs.writeFileSync(writeBundle, text)
check('the bundle round-trips through JSON to the same 380 matches, 20 standings rows and 380 FPL fixtures', (() => { const b = JSON.parse(text); return b.matches.length === 380 && b.standings.length === 20 && b.fpl.length === 380 && JSON.stringify(b.matches) === JSON.stringify(bundle.matches) })())

console.log('\nCHECKS')
for (const c of checks) console.log(c.ok ? 'PASS' : 'FAIL', c.name, c.detail ? `[${c.detail}]` : '')
const bad = checks.filter(c => !c.ok).length
console.log(`\n${checks.length - bad} of ${checks.length} checks hold; coverage: ${M.length} of 380 matches parsed and compared with FPL (${agree} agree), ${tableMatches.length} of 20 clubs' final tables compared with ESPN, ${of.dateLines} of ${of.dateLines} date lines checked against their weekday names, 4 of 4 source files pinned by sha256`)
console.log(`bundle: ${writeBundle ? `written to ${writeBundle}` : 'NOT written (no --write-bundle)'}, ${text.length} bytes, sha256 ${sha256(Buffer.from(text))}`)
process.exit(bad === 0 ? 0 : 1)
