// A ONE-OFF MEASUREMENT, NOT A LEDGER. Replays LAST season's EPL (2025-26, 2025-08-15 .. 2026-05-24, 380 matches) through table-v1
// (src/Forecast.fs, compiled to build/Forecast.js), each forecast made from the table as it stood BEFORE that match, and scores it against
// the outcomes. Written 2026-11-08 for docs/CC-CMD-2026-09-11-epl-forecaster-phase1.md. Its sibling outbox/forecast-backtest-2026-11-08.mjs did
// the same on the 99 finished matches of 2026-27 and found the model worse than a uniform guess; this asks whether a larger, independent
// sample says the same. It FITS NOTHING and changes no constant: the only estimate it makes is a calibration diagnostic (a logistic slope),
// reported with its standard error. Its output is outbox/forecast-backtest-prior-season-2026-11-08.txt.
//
// WHERE THE RESULTS COME FROM, and why they are believed: the relay's archive does not hold last season (outbox/cc-session-2026-11-08-calibrate-prior-season.md
// probes it). openfootball is the source of the scores; two other sources the script reads agree with it before any number is reported:
//   ESPN's final 2025 table, through the relay, decoded by the card's own decoder (build/Standings.js)   -> 20 clubs x (played, points, GF, GA)
//   FPL's fixtures for the same season (a GitHub mirror), joined by date and score, not by name        -> 380 fixtures
// Each source is pinned by commit and by sha256 below; a changed byte is a failed check, not a silent difference.
//
// FETCH.  mkdir src && cd src && (each line exactly as written; the hashes below are the check)
//   curl -sS -o openfootball-2025-26.txt  https://raw.githubusercontent.com/openfootball/england/9ee7a0c351805c99cc334478a9bf04b7d0432fec/2025-26/1-premierleague.txt
//   curl -sS -o fpl-fixtures-2025-26.csv  https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/d7b05b51d137bfefef4b692386d18c610975b9b9/data/2025-26/fixtures.csv
//   curl -sS -o fpl-teams-2025-26.csv     https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/d7b05b51d137bfefef4b692386d18c610975b9b9/data/2025-26/teams.csv
//   curl -sS -o espn-final-2025.json      'https://field-relay-nba.jeffunglesbee.workers.dev/espn-standings/soccer/eng.1/standings?season=2025'
// RUN.    npm run build && node outbox/forecast-backtest-prior-season-2026-11-08.mjs src [season]
//   `season` is optional: the directory of /context/date payloads the 2026-27 record was made from (its recipe is in the sibling's header). With it,
//   the replay ENGINE is run on that data and must reproduce the sibling's committed calibration bins to the digit (the engine oracle).
//   Exit 0 only if every check holds. Coverage is printed where each number is, not in a comment.
//
// LICENCE of the sources is NOT assessed here (STANDARDS Rule 45): flagged for a human, recorded in the session document.
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { makeRow, forecastFor, triple } from '../build/Forecast.js'
import { fromString } from '../build/Standings.js'
import { decodePayload, sportMeta } from '../build/Desk.js'

const [dir, relayDir] = process.argv.slice(2)
if (!dir) { console.error('usage: node outbox/forecast-backtest-prior-season-2026-11-08.mjs <sources-directory> [<2026-27 season directory>]'); process.exit(2) }

const SOURCES = {
  openfootball: { file: 'openfootball-2025-26.txt', bytes: 51782,
    sha256: '38c1de56c9e9b6662c7efc1420b7e1fe00dddbb502fe72d8f759e773ba3c093b' },
  fplFixtures: { file: 'fpl-fixtures-2025-26.csv', bytes: 1014129,
    sha256: '2d7e3950d346df14ca486cb09e9b9ba406d37d943775244eed06cdc021ffb3a9' },
  fplTeams: { file: 'fpl-teams-2025-26.csv', bytes: 1744,
    sha256: 'b29df099cb0ad25413e284e53116099b0e0496874f99743dbc0870d8241b46c5' },
  espnFinal: { file: 'espn-final-2025.json', bytes: 69451,
    sha256: '53b071579c20676356434f511ac376a2cf5e19851acead1ba25567dd5f6c41c4' },
}
const checks = []
const check = (name, ok, detail = '') => { checks.push({ name, ok: Boolean(ok), detail }) }
const sha256 = b => createHash('sha256').update(b).digest('hex')
const load = key => {
  const s = SOURCES[key], buf = fs.readFileSync(path.join(dir, s.file))
  check(`source ${key} is the pinned file (${s.bytes} bytes, sha256)`, buf.length === s.bytes && sha256(buf) === s.sha256, `${buf.length} B, ${sha256(buf).slice(0, 16)}`)
  return buf.toString('utf8')
}

// ---------------------------------------------------------------------------------------------------------------- openfootball
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const iso = (y, mo, d) => new Date(Date.UTC(y, mo, d)).toISOString().slice(0, 10)
// Strict: a line this does not recognise is a problem, never skipped. Year is explicit only on the first date header, so it is carried and
// advanced when the month wraps December -> January, and EVERY date header is then checked against its own weekday name (a wrong year always fails it).
function parseOpenfootball(text) {
  const problems = [], matches = [], head = {}
  let year = null, month = null, date = null, round = null, scorerLines = 0, weekdays = 0, weekdaysOk = 0
  text.split('\n').forEach((raw, idx) => {
    const ln = idx + 1, line = raw.replace(/\r$/, '')
    if (line.trim() === '') return
    let m
    if ((m = /^# Matches\s+(\d+)\s*$/.exec(line))) { head.matches = +m[1]; return }
    if ((m = /^# Teams\s+(\d+)\s*$/.exec(line))) { head.teams = +m[1]; return }
    if ((m = /^# Dates\s+\w{3} (\w{3}) (\d+) (\d{4}) - \w{3} (\w{3}) (\d+) (\d{4})/.exec(line))) {
      head.first = iso(+m[3], MONTHS.indexOf(m[1]), +m[2]); head.last = iso(+m[6], MONTHS.indexOf(m[4]), +m[5]); return
    }
    if (line.startsWith('#') || line.startsWith('=')) return
    if ((m = /^▪ Regular Season - (\d+)\s*$/.exec(line))) { round = +m[1]; return }
    if ((m = /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2})(?: (\d{4}))?\s*$/.exec(line))) {
      const mo = MONTHS.indexOf(m[2])
      let y = m[4] ? +m[4] : year
      if (y === null) { problems.push(`line ${ln}: a date with no year before any year was given`); return }
      if (!m[4] && month !== null && mo < month) y = year + 1
      year = y; month = mo
      weekdays++
      if (WEEKDAYS[new Date(Date.UTC(y, mo, +m[3])).getUTCDay()] === m[1]) weekdaysOk++
      else problems.push(`line ${ln}: ${m[1]} ${m[2]} ${m[3]} ${y} is not a ${m[1]}`)
      date = iso(y, mo, +m[3])
      return
    }
    if ((m = /^  (\d{2}:\d{2})\s+(.+?)\s+(\d+)-(\d+)\s+\((\d+)-(\d+)\)\s+(.+?)\s*$/.exec(line))) {
      if (date === null || round === null) { problems.push(`line ${ln}: a match before any date or round`); return }
      matches.push({ ln, round, date, time: m[1], home: m[2], away: m[7], hg: +m[3], ag: +m[4] })
      return
    }
    if (/^\s{8,}\S/.test(line)) { scorerLines++; return }
    problems.push(`line ${ln}: not recognised: ${line.slice(0, 70)}`)
  })
  return { matches, head, problems, scorerLines, weekdays, weekdaysOk }
}

const of = parseOpenfootball(load('openfootball'))
const M = of.matches
const clubs = [...new Set(M.flatMap(m => [m.home, m.away]))].sort()
check('openfootball: every non-blank line is a header, a date, a match or a scorer line', of.problems.length === 0, of.problems.slice(0, 2).join(' | '))
check(`openfootball: the header's ${of.head.matches} matches and ${of.head.teams} teams are what the file holds (${M.length}, ${clubs.length})`,
  of.head.matches === M.length && of.head.teams === clubs.length && M.length === 380 && clubs.length === 20)
check('openfootball: every club has 38 matches, 19 home and 19 away',
  clubs.every(c => M.filter(m => m.home === c).length === 19 && M.filter(m => m.away === c).length === 19))
check('openfootball: every ordered pair of clubs meets exactly once (380 distinct, none against itself)',
  new Set(M.map(m => m.home + '|' + m.away)).size === 380 && M.every(m => m.home !== m.away))
check('openfootball: 38 rounds of 10', new Set(M.map(m => m.round)).size === 38 && [...new Set(M.map(m => m.round))].every(r => M.filter(m => m.round === r).length === 10))
check(`openfootball: every date header names its own weekday (${of.weekdaysOk} of ${of.weekdays})`, of.weekdays > 0 && of.weekdaysOk === of.weekdays)
check('openfootball: dates never go backwards, and run from the header\'s first day to its last', M.every((m, i) => i === 0 || m.date >= M[i - 1].date) && M[0].date === of.head.first && M.at(-1).date === of.head.last, `${M[0]?.date}..${M.at(-1)?.date}`)
check('openfootball: no club plays twice on one date (so order within a day cannot change a table)',
  new Set(M.flatMap(m => [m.date + m.home, m.date + m.away])).size === 760)

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
const espn = fromString(load('espnFinal'))
check('espn final 2025 table decodes with the card\'s decoder (Standings.fromString)', espn.tag === 0)
const E = espn.tag === 0 ? Array.from(espn.fields[0]) : []
const tup = (p, pts, gf, ga) => `${p}|${pts}|${gf}|${ga}`
const eByTuple = new Map(E.map(r => [tup(r.Played, r.Points, r.GoalsFor, r.GoalsAgainst), r]))
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
const fplNames = new Map(objects(load('fplTeams')).map(r => [+r.id, r.name]))
const F = fplRows.map(r => ({ date: r.kickoff_time.slice(0, 10), h: +r.team_h, a: +r.team_a, hg: +r.team_h_score, ag: +r.team_a_score, done: r.finished === 'True' }))
check(`fpl fixtures: ${fplRows.length} rows parsed (the stats column holds commas and quotes), all finished, all scores whole numbers`,
  fplRows.length === 380 && F.every(f => f.done && Number.isInteger(f.hg) && Number.isInteger(f.ag)))
function pairFixtures(A, B) {
  const key = x => `${x.date}|${x.hg}|${x.ag}`
  const bucket = xs => { const m = new Map(); xs.forEach((x, i) => { const k = key(x); if (!m.has(k)) m.set(k, []); m.get(k).push(i) }); return m }
  const bA = bucket(A), bB = bucket(B), keys = new Set([...bA.keys(), ...bB.keys()])
  const sizeMismatch = [...keys].filter(k => (bA.get(k)?.length ?? 0) !== (bB.get(k)?.length ?? 0))
  const map = new Map(), rev = new Map(), pairs = [], conflicts = [], usedA = new Set(), usedB = new Set()
  const fits = (a, b) => (!map.has(a.home) || map.get(a.home) === b.h) && (!map.has(a.away) || map.get(a.away) === b.a)
    && (!rev.has(b.h) || rev.get(b.h) === a.home) && (!rev.has(b.a) || rev.get(b.a) === a.away)
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
        const cands = bs.filter(j => !usedB.has(j) && fits(A[i], B[j]))
        if (cands.length !== 1) continue
        const j = cands[0]
        if (as.some(i2 => i2 !== i && !usedA.has(i2) && fits(A[i2], B[j]))) continue     // another fixture could take it: wait for more of the mapping
        usedA.add(i); usedB.add(j); learn(A[i], B[j]); pairs.push([i, j]); progress = true
      }
    }
  }
  return { sizeMismatch, pairs, leftA: A.length - usedA.size, leftB: B.length - usedB.size, map, rev, conflicts }
}
const pf = pairFixtures(M, F)
check(`fpl: the same multiset of (date, home goals, away goals) as openfootball (${pf.sizeMismatch.length} unequal groups)`, pf.sizeMismatch.length === 0)
// Both sides: the first version counted only openfootball's leftovers, so a match LOST from openfootball still passed ("every one of 379 pairs"). The
// mutation proof found it; an FPL fixture with no openfootball partner is now red here too.
check(`fpl: every one of ${M.length} openfootball matches and every one of ${F.length} FPL fixtures pairs one-to-one (${pf.pairs.length} pairs; ${pf.leftA} openfootball and ${pf.leftB} FPL left over)`,
  pf.pairs.length === M.length && pf.pairs.length === F.length && pf.leftA === 0 && pf.leftB === 0)
check(`fpl: openfootball clubs and FPL teams map one-to-one, 20 of 20, with ${pf.conflicts.length} conflicts`, pf.map.size === 20 && pf.rev.size === 20 && pf.conflicts.length === 0)
const agree = pf.pairs.filter(([i, j]) => M[i].date === F[j].date && M[i].hg === F[j].hg && M[i].ag === F[j].ag && pf.map.get(M[i].home) === F[j].h && pf.map.get(M[i].away) === F[j].a).length
check(`fpl: paired fixtures agree on date, both scores and both clubs under the one mapping (${agree} of ${M.length})`, agree === M.length)

// ---------------------------------------------------------------------------------------------------------------- the replay
// The engine. Input: results in play order. Forecast first, THEN the result is applied, so a table never contains the match it forecasts.
function replay(results) {
  const T = new Map(); const get = n => { if (!T.has(n)) T.set(n, { p: 0, pts: 0, gf: 0, ga: 0 }); return T.get(n) }
  const row = n => { const t = get(n); return makeRow(n, n, t.p, t.pts, t.gf, t.ga, 0) }
  const out = []
  for (const r of results) {
    const th = get(r.home), ta = get(r.away)
    const mf = Array.from(triple(forecastFor(1, row(r.home), row(r.away))))
    out.push({ home: r.home, away: r.away, pre: Math.min(th.p, ta.p), model: mf.length ? mf : null, o: r.hg > r.ag ? [1, 0, 0] : r.hg === r.ag ? [0, 1, 0] : [0, 0, 1], t: { h: { ...th }, a: { ...ta } } })
    th.p++; ta.p++; th.gf += r.hg; th.ga += r.ag; ta.gf += r.ag; ta.ga += r.hg
    if (r.hg > r.ag) th.pts += 3; else if (r.hg === r.ag) { th.pts++; ta.pts++ } else ta.pts += 3
  }
  return out
}
const brier = (p, o) => p.reduce((s, x, i) => s + (x - o[i]) ** 2, 0)
const logloss = (p, o) => -Math.log(Math.max(1e-12, p[o.indexOf(1)]))
const mean = xs => xs.reduce((s, v) => s + v, 0) / xs.length
const sd = xs => { const m = mean(xs); return Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / (xs.length - 1)) }
const U = [1 / 3, 1 / 3, 1 / 3]
const f3 = x => x.toFixed(3)
const pct = x => (x * 100).toFixed(0) + '%'

const ordered = M.map((m, i) => ({ ...m, i })).sort((x, y) => x.date.localeCompare(y.date) || x.time.localeCompare(y.time) || x.i - y.i)
const out = replay(ordered)
const withModel = out.filter(r => r.model)
console.log(`openfootball 2025-26: ${M.length} matches parsed, ${out.length} replayed in date order; the model exists for ${withModel.length}, declines ${out.length - withModel.length} (a club that had played nothing: ${out.filter(r => !r.model).every(r => r.pre === 0) ? 'all of them' : 'NOT all of them'})`)
check('the model declines only where a club has played nothing', out.filter(r => !r.model).every(r => r.pre === 0) && withModel.every(r => r.pre >= 1))

const band = (label, set) => {
  const s = set.filter(r => r.model)
  if (s.length < 2) { console.log(label.padEnd(40), 'n', String(s.length).padStart(3)); return s.length }
  const f = [0, 1, 2].map(k => s.filter(r => r.o[k] === 1).length / s.length)
  const bm = s.map(r => brier(r.model, r.o)), bu = s.map(r => brier(U, r.o)), bb = s.map(r => brier(f, r.o))
  const d = s.map((_, i) => bm[i] - bu[i])
  const hit = s.filter(r => r.model.indexOf(Math.max(...r.model)) === r.o.indexOf(1)).length / s.length
  console.log(label.padEnd(40), 'n', String(s.length).padStart(3),
    '| Brier model', f3(mean(bm)), 'uniform', f3(mean(bu)), 'base rate', f3(mean(bb)),
    '| model - uniform', (mean(d) >= 0 ? '+' : '') + f3(mean(d)), '+/-', f3(sd(d) / Math.sqrt(s.length)),
    '| logloss model', f3(mean(s.map(r => logloss(r.model, r.o)))), 'uniform', f3(Math.log(3)),
    '| mean top-prob', pct(mean(s.map(r => Math.max(...r.model)))), 'top outcome happened', pct(hit))
  return s.length
}
{
  const rate = set => ['home win', 'draw', 'away win'].map((l, k) => `${l} ${pct(set.filter(r => r.o[k] === 1).length / set.length)}`).join(', ')
  console.log(`outcomes: all ${out.length} matches: ${rate(out)}; the ${withModel.length} the model forecasts: ${rate(withModel)}; pre >= 5 (${out.filter(r => r.pre >= 5).length}): ${rate(out.filter(r => r.pre >= 5))}`)
}
console.log('\n"pre" = the fewer matches either club had played before this one. "base rate" = the in-sample home/draw/away frequencies of the same band, a constant forecast; it is a reference, not a rival.')
band('all matches the model forecasts', out)
const parts = [[1, 4], [5, 9], [10, 19], [20, 37]].map(([lo, hi]) => band(`pre ${lo}-${hi}`, out.filter(r => r.pre >= lo && r.pre <= hi)))
check(`the four pre bands partition the forecast matches (${parts.join('+')} = ${withModel.length})`, parts.reduce((a, b) => a + b, 0) === withModel.length)
band('pre >= 5 (the sibling record\'s "GW6+")', out.filter(r => r.pre >= 5))
band('pre >= 8 (the sibling record\'s "GW9+")', out.filter(r => r.pre >= 8))

const BINS = [[0, .2], [.2, .4], [.4, .6], [.6, .8], [.8, 1.01]]
const binLines = (set) => BINS.map(([lo, hi]) => {
  const s = set.filter(r => r.model && r.model[0] >= lo && r.model[0] < hi)
  return s.length ? `  ${String(lo).padEnd(3)} - ${String(Math.min(hi, 1)).padEnd(3)} n ${String(s.length).padStart(3)} | mean predicted ${(s.reduce((x, r) => x + r.model[0], 0) / s.length * 100).toFixed(0)}% | home actually won ${(s.filter(r => r.o[0] === 1).length / s.length * 100).toFixed(0)}%`
    : `  ${String(lo).padEnd(3)} - ${String(Math.min(hi, 1)).padEnd(3)} n   0`
})
console.log('\nmodel home-win probability bins, matches where both clubs had played >=5 (the sibling\'s bins, same definition):')
const bins5 = binLines(out.filter(r => r.pre >= 5)); bins5.forEach(l => console.log(l))
console.log('same bins, every forecast match:'); binLines(out).forEach(l => console.log(l))

// ---- a calibration slope: P(home won) = logistic(a + b * logit(pHome)). b = 1, a = 0 is calibrated; b < 1 is overconfident. A diagnostic, not a fit of the model.
// Newton from the no-information start (0, 0), each step halved until the likelihood does not get worse. (The first version took full steps from (0, 1)
// and printed NaN on the 49-match 2026-27 sample, where the slope is near zero; no check covered that print, which is why the oracle sample has one now.)
function logisticNewton(xs, ys) {
  const nll = (a, b) => { let s = 0; for (let i = 0; i < xs.length; i++) { const z = a + b * xs[i]; s += Math.max(z, 0) + Math.log1p(Math.exp(-Math.abs(z))) - ys[i] * z } return s }
  const moments = (a, b) => {
    let g0 = 0, g1 = 0, h00 = 0, h01 = 0, h11 = 0
    for (let i = 0; i < xs.length; i++) {
      const p = 1 / (1 + Math.exp(-(a + b * xs[i]))), r = ys[i] - p, w = p * (1 - p)
      g0 += r; g1 += r * xs[i]; h00 += w; h01 += w * xs[i]; h11 += w * xs[i] * xs[i]
    }
    return { g0, g1, h00, h01, h11, det: h00 * h11 - h01 * h01 }
  }
  let a = 0, b = 0
  for (let it = 0; it < 500; it++) {
    const m = moments(a, b)
    const da = (m.h11 * m.g0 - m.h01 * m.g1) / m.det, db = (m.h00 * m.g1 - m.h01 * m.g0) / m.det
    let t = 1; const f0 = nll(a, b)
    while (t > 1e-12 && !(nll(a + t * da, b + t * db) <= f0 + 1e-12)) t /= 2
    a += t * da; b += t * db
    if (Math.abs(t * da) + Math.abs(t * db) < 1e-13) break
  }
  const m = moments(a, b)
  return { a, b, seA: Math.sqrt(m.h11 / m.det), seB: Math.sqrt(m.h00 / m.det) }
}
// A second, unrelated solver for the same likelihood: golden-section on b over the profile where a is found by bisection. Agreeing with Newton is the check.
function logisticProfile(xs, ys) {
  const nll = (a, b) => { let s = 0; for (let i = 0; i < xs.length; i++) { const z = a + b * xs[i]; s += Math.log(1 + Math.exp(z)) - ys[i] * z } return s }
  const bestA = b => {
    let lo = -30, hi = 30
    for (let k = 0; k < 200; k++) {
      const mid = (lo + hi) / 2
      let d = 0; for (let i = 0; i < xs.length; i++) d += 1 / (1 + Math.exp(-(mid + b * xs[i]))) - ys[i]
      if (d > 0) hi = mid; else lo = mid
    }
    return (lo + hi) / 2
  }
  let lo = -5, hi = 8; const gr = (Math.sqrt(5) - 1) / 2
  for (let k = 0; k < 200; k++) {
    const c = hi - gr * (hi - lo), d = lo + gr * (hi - lo)
    if (nll(bestA(c), c) < nll(bestA(d), d)) hi = d; else lo = c
  }
  const b = (lo + hi) / 2
  return { a: bestA(b), b }
}
const slopeOf = set => {
  const s = set.filter(r => r.model)
  const xs = s.map(r => Math.log(r.model[0] / (1 - r.model[0]))), ys = s.map(r => r.o[0])
  return { n: s.length, newton: logisticNewton(xs, ys), profile: logisticProfile(xs, ys) }
}
const sl = slopeOf(out.filter(r => r.pre >= 5))
console.log(`\ncalibration of the home-win probability, pre >= 5, n ${sl.n}: slope b ${sl.newton.b.toFixed(2)} +/- ${sl.newton.seB.toFixed(2)}, intercept a ${sl.newton.a.toFixed(2)} +/- ${sl.newton.seA.toFixed(2)}   (calibrated = slope 1.00, intercept 0.00)`)
const slAll = slopeOf(out)
console.log(`same, every forecast match, n ${slAll.n}: slope b ${slAll.newton.b.toFixed(2)} +/- ${slAll.newton.seB.toFixed(2)}, intercept a ${slAll.newton.a.toFixed(2)} +/- ${slAll.newton.seA.toFixed(2)}`)
const slopeAgrees = (...xs) => ({
  ok: xs.every(x => [x.newton.a, x.newton.b, x.newton.seA, x.newton.seB, x.profile.a, x.profile.b].every(Number.isFinite) && Math.abs(x.newton.b - x.profile.b) < 1e-4 && Math.abs(x.newton.a - x.profile.a) < 1e-4),
  diff: Math.max(...xs.flatMap(x => [Math.abs(x.newton.b - x.profile.b), Math.abs(x.newton.a - x.profile.a)])),
})
{
  const g = slopeAgrees(sl, slAll)
  check('slope: two unrelated solvers (damped Newton; golden-section over a bisection profile) agree to 1e-4 on slope and intercept, all finite, on both 2025-26 sets', g.ok, `max diff ${g.diff.toExponential(1)}`)
}

// ---- the model, recomputed from the constants in plain JS, against the compiled one, on every forecast made. The pre-match table for match i is
// rebuilt here from the first i results with tableOf (the function that was checked against ESPN above), NOT taken from the engine, so the
// engine's own bookkeeping is under test as well as its arithmetic.
const rating = t => t.p <= 0 ? null : t.pts / t.p + 0.25 * ((t.gf - t.ga) / t.p) + 0.10 * (t.gf / t.p)
const indep = (rh, ra) => { const d = rh - ra + 0.30; const pD = 0.28 * Math.exp(-Math.abs(d) / 1.10); const pH = (1 - pD) * (1 / (1 + Math.exp(-d / 0.55))); return [pH, pD, 1 - pD - pH] }
const NONE = { p: 0, pts: 0, gf: 0, ga: 0 }
let maxdiff = 0, rechecked = 0, preAgrees = 0
for (let i = 0; i < ordered.length; i++) {
  const tb = tableOf(ordered.slice(0, i)), th = tb.get(ordered[i].home) ?? NONE, ta = tb.get(ordered[i].away) ?? NONE, r = out[i]
  if (r.pre === Math.min(th.p, ta.p)) preAgrees++
  const rh = rating(th), ra = rating(ta)
  if (rh === null || ra === null) { if (r.model) maxdiff = Infinity; continue }
  const mine = indep(rh, ra)
  for (let k = 0; k < 3; k++) maxdiff = Math.max(maxdiff, Math.abs(mine[k] - r.model[k]))
  rechecked++
}
console.log(`\nindependent JS recomputation vs compiled model: matches ${rechecked}, max abs difference ${maxdiff.toExponential(2)}; pre-match played-count agrees on ${preAgrees} of ${out.length}`)
check(`the compiled model equals a plain-JS recomputation of its published constants, from tables rebuilt separately, on all ${rechecked} forecasts`, rechecked === withModel.length && maxdiff < 1e-12)
check(`the engine's played-count before each match equals the separately rebuilt table's (${preAgrees} of ${out.length})`, preAgrees === out.length)

// ---------------------------------------------------------------------------------------------------------------- the engine oracle
// The sibling record (outbox/forecast-backtest-2026-11-08.txt) is committed and was made by different code on different data. If this engine, run on
// that data, does not print that record's bins, it is not the engine that record came from and nothing it says about 2025-26 is comparable.
if (relayDir) {
  // The five lines of outbox/forecast-backtest-2026-11-08.txt, whitespace collapsed (that record pads n to two columns, this one to three).
  const squash = l => l.replace(/\s+/g, ' ').trim()
  const SIBLING_BINS = ['0 - 0.2 n 12 | mean predicted 7% | home actually won 50%', '0.2 - 0.4 n 9 | mean predicted 34% | home actually won 33%',
    '0.4 - 0.6 n 7 | mean predicted 50% | home actually won 43%', '0.6 - 0.8 n 11 | mean predicted 71% | home actually won 36%',
    '0.8 - 1 n 10 | mean predicted 88% | home actually won 80%']
  const norm = n => n === 'Man United' ? 'Man Utd' : n
  const games = []
  for (const f of fs.readdirSync(relayDir).filter(f => f.endsWith('.json')).sort()) {
    const r = decodePayload(fs.readFileSync(path.join(relayDir, f), 'utf8'))
    for (const g of Array.from(r.fields[0].Regular)) if (sportMeta(g.Sport).Label === 'EPL') games.push(g)
  }
  const startOf = g => g.RawStartTime ?? ''
  games.sort((a, b) => startOf(a).localeCompare(startOf(b)) || a.Id.localeCompare(b.Id))
  const fin = games.filter(g => g.FinalizedAt != null && g.HomeScore != null && g.AwayScore != null)
  const o2 = replay(fin.map(g => ({ home: norm(g.Home), away: norm(g.Away), hg: g.HomeScore, ag: g.AwayScore })))
  const mine = binLines(o2.filter(r => r.pre >= 5))
  console.log(`\nENGINE ORACLE, 2026-27 snapshot (${fs.readdirSync(relayDir).filter(f => f.endsWith('.json')).length} day files): finished EPL matches replayed: ${fin.length}; with a model: ${o2.filter(r => r.model).length}`)
  mine.forEach(l => console.log(l))
  check('oracle: 99 finished matches replayed and 89 forecast, as the sibling record says', fin.length === 99 && o2.filter(r => r.model).length === 89, `${fin.length} / ${o2.filter(r => r.model).length}`)
  check('oracle: this engine prints the sibling record\'s five calibration bins to the digit', mine.length === 5 && mine.every((l, i) => squash(l) === SIBLING_BINS[i]), mine.filter((l, i) => squash(l) !== SIBLING_BINS[i]).map(squash).join(' | '))
  const s2 = slopeOf(o2.filter(r => r.pre >= 5))
  console.log(`2026-27 snapshot, same calibration slope, pre >= 5, n ${s2.n}: slope b ${s2.newton.b.toFixed(2)} +/- ${s2.newton.seB.toFixed(2)}, intercept a ${s2.newton.a.toFixed(2)} +/- ${s2.newton.seA.toFixed(2)}`)
  const g2 = slopeAgrees(s2)
  check('oracle: the same two solvers agree on the 2026-27 sample\'s slope too, and every figure is finite', g2.ok, `max diff ${g2.diff.toExponential(1)}`)
}

// ---------------------------------------------------------------------------------------------------------------- what was checked
console.log('\nclub pairing found by date and score (openfootball name -> FPL name), read it by eye:')
console.log(clubs.map(c => `  ${c} -> ${fplNames.get(pf.map.get(c)) ?? '?'}`).join('\n'))
console.log('\nfinal 2025-26 table rebuilt from the results, matched to ESPN by (played, points, GF, GA):')
for (const [club, t] of [...final].sort((a, b) => b[1].pts - a[1].pts || (b[1].gf - b[1].ga) - (a[1].gf - a[1].ga))) {
  const e = eByTuple.get(tup(t.p, t.pts, t.gf, t.ga))
  console.log(`  ${club.padEnd(26)} P ${t.p} Pts ${String(t.pts).padStart(2)} GF ${String(t.gf).padStart(2)} GA ${String(t.ga).padStart(2)}   ESPN: ${e ? e.Team : 'NO MATCH'}`)
}
console.log('\nCHECKS')
for (const c of checks) console.log(c.ok ? 'PASS' : 'FAIL', c.name, c.detail ? `[${c.detail}]` : '')
const failed = checks.filter(c => !c.ok).length
console.log(`\n${checks.length - failed} of ${checks.length} checks hold; coverage: 1 season (380 matches), ${relayDir ? '1 oracle snapshot (99 matches)' : 'no oracle snapshot given'}, 3 independent sources read`)
process.exitCode = failed === 0 ? 0 : 1
