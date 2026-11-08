// A ONE-OFF MEASUREMENT THAT DECIDES WHETHER table-v1's DECLARED CONSTANTS ARE REPLACED. Written 2026-11-08 for docs/CC-CMD-2026-09-11-epl-forecaster-phase1.md,
// on the owner's "Fit, further approval confirmed" (Sun 2026-11-08 15:42 ET), after outbox/cc-session-2026-11-08-calibrate-prior-season.md found the model's
// probabilities about 2.4 times too steep on last season. It FITS constants; it changes nothing in src/. Its output is outbox/forecast-fit-2026-11-08.txt.
//
// THE SHIP RULE. FIXED BEFORE ANY CANDIDATE'S NUMBER WAS READ ON ANY DATA, and committed before this script's first fit (outbox/cc-session-2026-11-08-fit.md names the
// commit and shows this block, and the RULE block below, unchanged since). Already known when it was fixed: table-v1's OWN numbers on both seasons
// (outbox/forecast-backtest-2026-11-08.txt: Brier 0.752 on the 47 matches with both clubs on >= 5 games that also had a market line; the prior-season record: 0.689 on
// 330, slope 0.41). Nothing about any fitted candidate had been computed.
//   Candidates, each fitted by maximum likelihood on last season's forecasts with both clubs on >= 5 games (the 330 the earlier record measured):
//     A = the home edge and the logistic scale (the draw constants stay at table-v1's declared 0.28 and 1.10)
//     B = A plus the draw share's base and decay
//   S = B only if its 5-fold cross-validated log loss beats A's by a paired per-match z <= -2.0 (B has two more constants, so it has to earn them); otherwise S = A.
//   S's constants are ROUNDED TO TWO DECIMALS before S is scored on anything but its own fit, because the rounded values are what would ship.
//   S ships as table-v2 only if ALL of these hold:
//     R1  THIS season's finished matches, both clubs on >= 5 games: S's Brier is below table-v1's, paired per match, z <= -1.645
//         (one-sided 5%: last season's finding predicted the direction, which is what makes the test one-sided)
//     R2  last season, cross-validated: S's Brier is below a uniform guess's 0.6667, paired per match, z <= -2.0
//     R3  last season, cross-validated: S's Brier is below table-v1's, paired per match, z <= -3.0
//     R4  opening weeks (both clubs on 1-4 games), each season on its own: S's mean Brier is no worse than table-v1's
//     R5  last season, cross-validated: S's home-win calibration slope is not detectably different from 1 (|slope - 1| <= 1.96 standard errors)
//     R6  the fit is well posed: two unrelated solvers agree, the gradient vanishes, the Hessian is positive definite, no constant sits on a bound
//     R7  every integrity check in this script holds
//   z = mean paired difference / (sd / sqrt n); negative favours S. Any rule failing is "DO NOT SHIP", and the output names the rule.
//   R1 has about 50 matches behind it, so it can fail for want of power rather than against S. If R1 is the ONLY rule that fails and its z lies in (-1.645, 0], the next
//   look is a second prior season (2024-25) at S's same constants, with the rule z <= -2.0 on its matches with both clubs on >= 5 games; that is stated here so it is
//   not chosen after. If R1's z is above 0, or any other rule fails, there is no further look.
//
// DATA.  Training: the four files outbox/forecast-backtest-prior-season-2026-11-08.mjs pins (its header has the fetch commands), read by the same strict parser
// (copied below; the earlier script is also RUN as a precondition, and v1's numbers on this data must equal its committed record).
//        Hold-out: this season's finished EPL matches, from the relay's /context/date archive, checked against the current ESPN table, the relay's /fpl/fixtures
// and the 45 scored lines openfootball has for 2026-27. That whole check set is carried in a bundle (outbox/forecast-fit-holdout-2026-11-08.json) so the run is
// reproducible after this season moves on. Build it from raw files with --write-bundle; the raw directory holds season/<date>.json (the 87 day payloads),
// standings-now.json, fpl-fixtures-now.json and of-2026-27.txt (recipe in outbox/cc-session-2026-11-08-fit.md).
// RUN.   npm run build && node outbox/forecast-fit-2026-11-08.mjs <sources-dir> outbox/forecast-fit-holdout-2026-11-08.json
// Exit 0 only if every integrity check holds; the VERDICT line is separate from the exit code. Coverage is printed where each number is.
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { makeRow, forecastFor, triple } from '../build/Forecast.js'
import { fromString } from '../build/Standings.js'
import { decodePayload, sportMeta } from '../build/Desk.js'

const argv = process.argv.slice(2)
const writeBundle = (argv.find(a => a.startsWith('--write-bundle=')) ?? '').replace('--write-bundle=', '') || null
const bundleOnly = argv.includes('--bundle-only')       // DATA CHECKS ONLY: stops before any candidate is fitted or scored
const [srcDir, holdoutArg] = argv.filter(a => !a.startsWith('--'))
if (!srcDir || !holdoutArg) { console.error('usage: node outbox/forecast-fit-2026-11-08.mjs <sources-dir> <hold-out: a raw directory, or a bundle .json> [--write-bundle=<path>] [--bundle-only]'); process.exit(2) }
const here = path.dirname(fileURLToPath(import.meta.url))
const checks = []
const check = (name, ok, detail = '') => { checks.push({ name, ok: Boolean(ok), detail }) }
const sha256 = b => createHash('sha256').update(b).digest('hex')

// ------------------------------------------------------------------------------------------------------------ the rule, as code
const RULE = { selectZ: -2.0, z1: -1.645, z2: -2.0, z3: -3.0, slopeSigma: 1.96, uniform: 2 / 3 }
function decide(m) {
  const failed = []
  if (!(m.z1 <= RULE.z1)) failed.push(`R1 hold-out paired z ${m.z1?.toFixed?.(2)} is not <= ${RULE.z1}`)
  if (!(m.z2 <= RULE.z2)) failed.push(`R2 cross-validated z against a uniform guess ${m.z2?.toFixed?.(2)} is not <= ${RULE.z2}`)
  if (!(m.z3 <= RULE.z3)) failed.push(`R3 cross-validated paired z ${m.z3?.toFixed?.(2)} is not <= ${RULE.z3}`)
  if (!(m.openTrainS <= m.openTrainV1 && m.openHoldS <= m.openHoldV1)) failed.push('R4 an opening-weeks Brier is worse than table-v1\'s')
  if (!(Math.abs(m.slopeCV - 1) <= RULE.slopeSigma * m.slopeSE)) failed.push(`R5 cross-validated slope ${m.slopeCV?.toFixed?.(2)} (SE ${m.slopeSE?.toFixed?.(2)}) differs from 1 by more than ${RULE.slopeSigma} SE`)
  if (!m.wellPosed) failed.push('R6 the fit is not well posed')
  if (!m.checksOk) failed.push('R7 an integrity check failed')
  return { ship: failed.length === 0, failed }
}
{
  const good = { z1: -3, z2: -6, z3: -5, openTrainS: 0.80, openTrainV1: 0.86, openHoldS: 0.70, openHoldV1: 0.75, slopeCV: 1.0, slopeSE: 0.2, wellPosed: true, checksOk: true }
  const veto = (name, patch, tag) => {
    const r = decide({ ...good, ...patch })
    check(`verdict logic: ${name} alone vetoes, and says so`, !r.ship && r.failed.length === 1 && r.failed[0].startsWith(tag), r.failed.join(' | '))
  }
  const ships = (name, patch) => check(`verdict logic: ${name} still ships`, decide({ ...good, ...patch }).ship)
  check('verdict logic: a candidate that meets every rule ships', decide(good).ship && decide(good).failed.length === 0)
  veto('R1 (z -1.6)', { z1: -1.6 }, 'R1'); ships('R1 exactly at its threshold', { z1: RULE.z1 })
  veto('R2 (z -1.9)', { z2: -1.9 }, 'R2'); veto('R3 (z -2.9)', { z3: -2.9 }, 'R3')
  veto('R4 (opening weeks worse last season)', { openTrainS: 0.87 }, 'R4'); veto('R4 (opening weeks worse this season)', { openHoldS: 0.76 }, 'R4')
  veto('R5 (slope 0.6, SE 0.2)', { slopeCV: 0.6 }, 'R5'); veto('R5 (slope 1.5, SE 0.2)', { slopeCV: 1.5 }, 'R5'); ships('R5 just inside its band (slope 1.39, SE 0.2)', { slopeCV: 1.39 })
  veto('R6', { wellPosed: false }, 'R6'); veto('R7', { checksOk: false }, 'R7'); veto('a NaN z', { z1: NaN }, 'R1'); veto('a NaN slope', { slopeCV: NaN }, 'R5')
}

// ------------------------------------------------------------------------------------------------------------ the model, as a function of its constants
const TH0 = { home: 0.30, scale: 0.55, drawBase: 0.28, drawDecay: 1.10 }      // table-v1, src/Forecast.fs
const rating = t => t.p <= 0 ? null : t.pts / t.p + 0.25 * ((t.gf - t.ga) / t.p) + 0.10 * (t.gf / t.p)
const probs = (rh, ra, th) => {
  const d = rh - ra + th.home
  const pD = th.drawBase * Math.exp(-Math.abs(d) / th.drawDecay)
  const pH = (1 - pD) * (1 / (1 + Math.exp(-d / th.scale)))
  return [pH, pD, 1 - pD - pH]
}
const brier = (p, o) => p.reduce((s, x, i) => s + (x - (i === o ? 1 : 0)) ** 2, 0)
const logloss = (p, o) => -Math.log(Math.max(1e-12, p[o]))
const mean = xs => xs.reduce((s, v) => s + v, 0) / xs.length
const sd = xs => { const m = mean(xs); return Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / (xs.length - 1)) }
const f3 = x => x.toFixed(3), f2 = x => x.toFixed(2), pct = x => (x * 100).toFixed(0) + '%'
const paired = (a, b) => { const d = a.map((v, i) => v - b[i]); return { mean: mean(d), se: sd(d) / Math.sqrt(d.length), z: mean(d) / (sd(d) / Math.sqrt(d.length)) } }
const signed = x => (x >= 0 ? '+' : '') + f3(x)

// Play-order features: both clubs' ratings from the table BEFORE the match, and the match's outcome (0 home, 1 draw, 2 away).
function featuresOf(results) {
  const T = new Map(); const g = n => { if (!T.has(n)) T.set(n, { p: 0, pts: 0, gf: 0, ga: 0 }); return T.get(n) }
  return results.map(r => {
    const th = g(r.home), ta = g(r.away)
    const f = { home: r.home, away: r.away, pre: Math.min(th.p, ta.p), rh: rating(th), ra: rating(ta), o: r.hg > r.ag ? 0 : r.hg === r.ag ? 1 : 2, tH: { ...th }, tA: { ...ta } }
    th.p++; ta.p++; th.gf += r.hg; th.ga += r.ag; ta.gf += r.ag; ta.ga += r.hg
    if (r.hg > r.ag) th.pts += 3; else if (r.hg === r.ag) { th.pts++; ta.pts++ } else ta.pts += 3
    return f
  })
}
const tableOf = ms => {
  const t = new Map(); const g = n => { if (!t.has(n)) t.set(n, { p: 0, pts: 0, gf: 0, ga: 0 }); return t.get(n) }
  for (const m of ms) {
    const h = g(m.home), a = g(m.away)
    h.p++; a.p++; h.gf += m.hg; h.ga += m.ag; a.gf += m.ag; a.ga += m.hg
    if (m.hg > m.ag) h.pts += 3; else if (m.hg === m.ag) { h.pts++; a.pts++ } else a.pts += 3
  }
  return t
}
const tup = (p, pts, gf, ga) => `${p}|${pts}|${gf}|${ga}`

// ------------------------------------------------------------------------------------------------------------ TRAINING: last season, as the earlier record read it
const PINNED = {
  openfootball: { file: 'openfootball-2025-26.txt', bytes: 51782, sha256: '38c1de56c9e9b6662c7efc1420b7e1fe00dddbb502fe72d8f759e773ba3c093b' },
  espnFinal: { file: 'espn-final-2025.json', bytes: 69451, sha256: '53b071579c20676356434f511ac376a2cf5e19851acead1ba25567dd5f6c41c4' },
}
const loadPinned = key => {
  const s = PINNED[key], buf = fs.readFileSync(path.join(srcDir, s.file))
  check(`source ${key} is the pinned file (${s.bytes} bytes, sha256)`, buf.length === s.bytes && sha256(buf) === s.sha256, `${buf.length} B, ${sha256(buf).slice(0, 16)}`)
  return buf.toString('utf8')
}
{
  const r = spawnSync(process.execPath, [path.join(here, 'forecast-backtest-prior-season-2026-11-08.mjs'), srcDir], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const red = (r.stdout ?? '').split('\n').filter(l => l.startsWith('FAIL '))
  const last = (r.stdout ?? '').trim().split('\n').pop() ?? ''
  check('precondition: the prior-season script, run on these sources, exits 0 with no red check', r.status === 0 && red.length === 0 && /checks hold/.test(last), last.slice(0, 60))
}
// Copied verbatim from outbox/forecast-backtest-prior-season-2026-11-08.mjs (its checks on this parser's output ran in the precondition above).
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const iso = (y, mo, d) => new Date(Date.UTC(y, mo, d)).toISOString().slice(0, 10)
function parseOpenfootball(text) {
  const problems = [], matches = [], head = {}
  let year = null, month = null, date = null, round = null
  text.split('\n').forEach((raw, idx) => {
    const ln = idx + 1, line = raw.replace(/\r$/, '')
    if (line.trim() === '') return
    let m
    if ((m = /^# Matches\s+(\d+)\s*$/.exec(line))) { head.matches = +m[1]; return }
    if ((m = /^# Teams\s+(\d+)\s*$/.exec(line))) { head.teams = +m[1]; return }
    if ((m = /^# Dates\s+\w{3} (\w{3}) (\d+) (\d{4}) - \w{3} (\w{3}) (\d+) (\d{4})/.exec(line))) { head.first = iso(+m[3], MONTHS.indexOf(m[1]), +m[2]); head.last = iso(+m[6], MONTHS.indexOf(m[4]), +m[5]); return }
    if (line.startsWith('#') || line.startsWith('=')) return
    if ((m = /^▪ Regular Season - (\d+)\s*$/.exec(line))) { round = +m[1]; return }
    if ((m = /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2})(?: (\d{4}))?\s*$/.exec(line))) {
      const mo = MONTHS.indexOf(m[2]); let y = m[4] ? +m[4] : year
      if (y === null) { problems.push(`line ${ln}: a date with no year`); return }
      if (!m[4] && month !== null && mo < month) y = year + 1
      year = y; month = mo
      if (WEEKDAYS[new Date(Date.UTC(y, mo, +m[3])).getUTCDay()] !== m[1]) problems.push(`line ${ln}: ${m[1]} ${m[2]} ${m[3]} ${y} is not a ${m[1]}`)
      date = iso(y, mo, +m[3]); return
    }
    if ((m = /^  (\d{2}:\d{2})\s+(.+?)\s+(\d+)-(\d+)\s+\((\d+)-(\d+)\)\s+(.+?)\s*$/.exec(line))) {
      if (date === null || round === null) { problems.push(`line ${ln}: a match before any date or round`); return }
      matches.push({ ln, round, date, time: m[1], home: m[2], away: m[7], hg: +m[3], ag: +m[4] }); return
    }
    if (/^\s{8,}\S/.test(line)) return
    problems.push(`line ${ln}: not recognised: ${line.slice(0, 70)}`)
  })
  return { matches, head, problems }
}
const of = parseOpenfootball(loadPinned('openfootball'))
const M = of.matches
check(`training: the file parses clean, 380 matches, dates ${of.head.first}..${of.head.last}`, of.problems.length === 0 && M.length === 380 && M[0].date === of.head.first && M.at(-1).date === of.head.last, of.problems.slice(0, 2).join(' | '))
{
  const espn = fromString(loadPinned('espnFinal'))
  const E = espn.tag === 0 ? Array.from(espn.fields[0]) : []
  const eT = new Set(E.map(r => tup(r.Played, r.Points, r.GoalsFor, r.GoalsAgainst)))
  const mine = [...tableOf(M).values()]
  check(`training: the final table the results make equals ESPN's, club by club (${mine.filter(t => eT.has(tup(t.p, t.pts, t.gf, t.ga))).length} of 20 on played, points, GF, GA)`, E.length === 20 && eT.size === 20 && mine.length === 20 && mine.every(t => eT.has(tup(t.p, t.pts, t.gf, t.ga))))
  check('training: no club carries a deduction', E.length === 20 && E.every(r => r.Deductions === 0))
}
const trainOrder = M.map((m, i) => ({ ...m, i })).sort((x, y) => x.date.localeCompare(y.date) || x.time.localeCompare(y.time) || x.i - y.i)
const trainAll = featuresOf(trainOrder)

// ------------------------------------------------------------------------------------------------------------ HOLD-OUT: this season, from a bundle
function parseScoredLines2026(text) {      // openfootball 2026-27: 4-space-indented fixture lines "<time?> A v B H-A (h-a)"; unscored lines are ignored, and counted
  const out = []; let date = null, year = 2026, lastMo = null, unscored = 0
  for (const l of text.split('\n')) {
    let m
    if ((m = /^\s+(Sun|Mon|Tue|Wed|Thu|Fri|Sat) (\w{3}) (\d{1,2})(?: (\d{4}))?\s*$/.exec(l))) {
      const mo = MONTHS.indexOf(m[2]); if (m[4]) year = +m[4]; else if (lastMo !== null && mo < lastMo) year++
      lastMo = mo; date = iso(year, mo, +m[3]); continue
    }
    if ((m = /^\s{4,}(?:\d{2}:\d{2}\s+)?(.+?)\s+v\s+(.+?)\s+(\d+)-(\d+)\s+\((\d+)-(\d+)\)\s*$/.exec(l))) out.push({ date, hg: +m[3], ag: +m[4] })
    else if (/^\s{4,}\S.*\sv\s/.test(l)) unscored++
  }
  return { scored: out, unscored }
}
function buildBundle(rawDir) {
  // The archive spells one club two ways: "Man United" on 8 appearances through 2026-10-25 and "Man Utd" on 2 from 2026-10-31 (counted below, in `unmatchedNames`,
  // by comparing every archive name with the ESPN table's); the table says "Man Utd". The bundle carries the table's spelling so that one club is one team in the
  // rebuilt table. src/CardForecast.fs records the same difference and refuses by name rather than normalising (Rule 60: the relay owns names).
  const norm = n => n === 'Man United' ? 'Man Utd' : n
  const mt = f => fs.statSync(f).mtime.toISOString()
  const dayFiles = fs.readdirSync(path.join(rawDir, 'season')).filter(f => f.endsWith('.json')).sort()
  const games = []
  for (const f of dayFiles) {
    const r = decodePayload(fs.readFileSync(path.join(rawDir, 'season', f), 'utf8'))
    for (const g of Array.from(r.fields[0].Regular)) if (sportMeta(g.Sport).Label === 'EPL') games.push(g)
  }
  const startOf = g => g.RawStartTime ?? ''
  games.sort((a, b) => startOf(a).localeCompare(startOf(b)) || a.Id.localeCompare(b.Id))
  const done = games.filter(g => g.FinalizedAt != null && g.HomeScore != null && g.AwayScore != null)
  const st = fromString(fs.readFileSync(path.join(rawDir, 'standings-now.json'), 'utf8'))
  const fpl = JSON.parse(fs.readFileSync(path.join(rawDir, 'fpl-fixtures-now.json'), 'utf8'))
  const ofText = fs.readFileSync(path.join(rawDir, 'of-2026-27.txt'), 'utf8')
  const tableNames = new Set((st.tag === 0 ? Array.from(st.fields[0]) : []).map(r => r.Team))
  const unmatchedNames = {}
  for (const g of done) for (const n of [g.Home, g.Away]) if (!tableNames.has(n)) unmatchedNames[n] = (unmatchedNames[n] ?? 0) + 1
  const dayHash = sha256(dayFiles.map(f => `${f}:${sha256(fs.readFileSync(path.join(rawDir, 'season', f)))}`).join('\n'))
  return {
    // when each raw file was written by the fetch (file modification times; the files were fetched with curl and not touched since)
    fetchedAt: { dayFilesFirst: mt(path.join(rawDir, 'season', dayFiles[0])), dayFilesLast: mt(path.join(rawDir, 'season', dayFiles.at(-1))), standingsNow: mt(path.join(rawDir, 'standings-now.json')), fplFixtures: mt(path.join(rawDir, 'fpl-fixtures-now.json')), openfootball2026: mt(path.join(rawDir, 'of-2026-27.txt')) },
    relay: 'https://field-relay-nba.jeffunglesbee.workers.dev',
    raw: { dayFiles: dayFiles.length, dayFilesSha256: dayHash, standingsNowSha256: sha256(fs.readFileSync(path.join(rawDir, 'standings-now.json'))), fplFixturesSha256: sha256(fs.readFileSync(path.join(rawDir, 'fpl-fixtures-now.json'))),
      openfootball2026: { url: 'https://raw.githubusercontent.com/openfootball/england/9ee7a0c351805c99cc334478a9bf04b7d0432fec/2026-27/1-premierleague.txt', sha256: sha256(fs.readFileSync(path.join(rawDir, 'of-2026-27.txt'))) } },
    eplRows: games.length, unmatchedNames,
    archive: done.map(g => ({ id: g.Id, start: startOf(g), home: norm(g.Home), away: norm(g.Away), hg: g.HomeScore, ag: g.AwayScore })),
    standings: (st.tag === 0 ? Array.from(st.fields[0]) : []).map(r => ({ team: r.Team, played: r.Played, points: r.Points, gf: r.GoalsFor, ga: r.GoalsAgainst, deductions: r.Deductions })),
    // FPL sets `finished` only after a matchweek's bonus points are applied; a played match carries `finished_provisional` and both scores before that (found 2026-11-08:
    // matchweeks 1-9 are finished, matchweek 10's 10 matches are provisional with scores). Both counts are kept so the reader can see the split.
    fplCounts: { fixtures: fpl.length, finished: fpl.filter(f => f.finished === true).length, finishedProvisional: fpl.filter(f => f.finished_provisional === true).length, bothScores: fpl.filter(f => f.team_h_score != null && f.team_a_score != null).length },
    fplFinished: fpl.filter(f => f.finished_provisional === true && f.team_h_score != null && f.team_a_score != null).map(f => ({ date: f.kickoff_time.slice(0, 10), h: f.team_h, a: f.team_a, hg: f.team_h_score, ag: f.team_a_score })),
    openfootballScored: parseScoredLines2026(ofText).scored,
  }
}
let bundle, bundleSha = null
if (fs.statSync(holdoutArg).isDirectory()) {
  bundle = buildBundle(holdoutArg)
  if (writeBundle) fs.writeFileSync(writeBundle, JSON.stringify(bundle, null, 1) + '\n')
} else { const buf = fs.readFileSync(holdoutArg); bundleSha = sha256(buf); bundle = JSON.parse(buf.toString('utf8')) }
const A = bundle.archive
const holdOrder = A.map((m, i) => ({ ...m, i })).sort((x, y) => x.start.localeCompare(y.start) || x.id.localeCompare(y.id) || x.i - y.i)
const holdAll = featuresOf(holdOrder)

// pairFixtures: copied from the earlier script (generic: A has home/away names, B has h/a ids). Joins by date and score, never by name.
function pairFixtures(As, Bs) {
  const key = x => `${x.date}|${x.hg}|${x.ag}`
  const bucket = xs => { const m = new Map(); xs.forEach((x, i) => { const k = key(x); if (!m.has(k)) m.set(k, []); m.get(k).push(i) }); return m }
  const bA = bucket(As), bB = bucket(Bs), keys = new Set([...bA.keys(), ...bB.keys()])
  const sizeMismatch = [...keys].filter(k => (bA.get(k)?.length ?? 0) !== (bB.get(k)?.length ?? 0))
  const map = new Map(), rev = new Map(), pairs = [], conflicts = [], usedA = new Set(), usedB = new Set()
  const fits = (a, b) => (!map.has(a.home) || map.get(a.home) === b.h) && (!map.has(a.away) || map.get(a.away) === b.a) && (!rev.has(b.h) || rev.get(b.h) === a.home) && (!rev.has(b.a) || rev.get(b.a) === a.away)
  const learn = (a, b) => { for (const [club, id] of [[a.home, b.h], [a.away, b.a]]) { if (map.has(club) && map.get(club) !== id) conflicts.push(club); if (rev.has(id) && rev.get(id) !== club) conflicts.push(String(id)); map.set(club, id); rev.set(id, club) } }
  for (let progress = true; progress;) {
    progress = false
    for (const k of keys) {
      const as = (bA.get(k) ?? []).filter(i => !usedA.has(i)), bs = (bB.get(k) ?? []).filter(j => !usedB.has(j))
      for (const i of as) {
        if (usedA.has(i)) continue
        const cands = bs.filter(j => !usedB.has(j) && fits(As[i], Bs[j]))
        if (cands.length !== 1) continue
        const j = cands[0]
        if (as.some(i2 => i2 !== i && !usedA.has(i2) && fits(As[i2], Bs[j]))) continue
        usedA.add(i); usedB.add(j); learn(As[i], Bs[j]); pairs.push([i, j]); progress = true
      }
    }
  }
  return { sizeMismatch, pairs, leftA: As.length - usedA.size, leftB: Bs.length - usedB.size, map, rev, conflicts }
}
{
  const R = A.map(m => ({ date: m.start.slice(0, 10), home: m.home, away: m.away, hg: m.hg, ag: m.ag }))
  const clubs = [...new Set(R.flatMap(r => [r.home, r.away]))]
  const tb = tableOf(R), S = bundle.standings
  const sT = new Map(S.map(r => [r.team, r]))
  const played = clubs.filter(c => sT.has(c) && sT.get(c).played === tb.get(c).p).length
  check(`hold-out: ${A.length} finished matches, ${bundle.eplRows} EPL rows in the archive, none unfinished`, A.length === bundle.eplRows && A.length > 0)
  check(`hold-out: the archive's finished count equals ESPN's played count for ${played} of ${S.length} clubs, and the clubs are the same ${clubs.length}`, S.length === 20 && clubs.length === 20 && played === 20)
  const tupleOk = clubs.filter(c => sT.has(c) && tup(sT.get(c).played, sT.get(c).points, sT.get(c).gf, sT.get(c).ga) === tup(tb.get(c).p, tb.get(c).pts, tb.get(c).gf, tb.get(c).ga)).length
  check(`hold-out: the table the results make equals ESPN's current table (${tupleOk} of 20 clubs on played, points, GF, GA); no deductions`, tupleOk === 20 && S.every(r => r.deductions === 0))
  const pf = pairFixtures(R, bundle.fplFinished.map(f => ({ ...f })))
  const fc = bundle.fplCounts
  check(`hold-out: FPL's played fixtures are exactly its scored ones (${fc.finishedProvisional} provisional-or-final, ${fc.bothScores} with both scores; ${fc.finished} of them final, the rest in the latest matchweek)`, fc.finishedProvisional === fc.bothScores && fc.bothScores === bundle.fplFinished.length && fc.finished <= fc.finishedProvisional)
  check(`hold-out: the relay's FPL fixtures hold the same ${bundle.fplFinished.length} played matches by date and score (${pf.sizeMismatch.length} unequal groups), pairing one-to-one (${pf.pairs.length} pairs; ${pf.leftA} archive and ${pf.leftB} FPL left over), clubs mapping 20 of 20 with ${pf.conflicts.length} conflicts`,
    pf.sizeMismatch.length === 0 && pf.pairs.length === R.length && R.length === bundle.fplFinished.length && pf.leftA === 0 && pf.leftB === 0 && pf.map.size === 20 && pf.rev.size === 20 && pf.conflicts.length === 0)
  const bag = new Map(); for (const r of R) bag.set(`${r.date}|${r.hg}|${r.ag}`, (bag.get(`${r.date}|${r.hg}|${r.ag}`) ?? 0) + 1)
  let found = 0; for (const o of bundle.openfootballScored) { const k = `${o.date}|${o.hg}|${o.ag}`; if ((bag.get(k) ?? 0) > 0) { bag.set(k, bag.get(k) - 1); found++ } }
  check(`hold-out: openfootball's ${bundle.openfootballScored.length} scored lines for 2026-27 are each an archive match on date and score (${found} of ${bundle.openfootballScored.length}); it has no later results to check`, bundle.openfootballScored.length > 0 && found === bundle.openfootballScored.length)
  check('hold-out: it begins after the training season ended (the seasons do not overlap)', R.every(r => r.date > of.head.last))
  check('hold-out: no club plays twice on one date, so order within a day cannot change a table', new Set(R.flatMap(r => [r.date + r.home, r.date + r.away])).size === 2 * R.length)
  check(`hold-out: before normalising, the only archive name the ESPN table does not carry is "Man United" (${JSON.stringify(bundle.unmatchedNames)}); after it, every archive club is one of the table's ${S.length}`,
    JSON.stringify(Object.keys(bundle.unmatchedNames)) === '["Man United"]' && clubs.every(c => sT.has(c)))
}

// ------------------------------------------------------------------------------------------------------------ the fit
const usable = fs => fs.filter(f => f.rh !== null && f.ra !== null)
const trainFit = usable(trainAll).filter(f => f.pre >= 5)          // the 330
const trainOpen = usable(trainAll).filter(f => f.pre >= 1 && f.pre <= 4)
const holdFit = usable(holdAll).filter(f => f.pre >= 5)
const holdOpen = usable(holdAll).filter(f => f.pre >= 1 && f.pre <= 4)
console.log(`training: ${trainAll.length} matches, ${usable(trainAll).length} forecastable, ${trainFit.length} with both clubs on >= 5 games (fit set), ${trainOpen.length} opening-week`)
console.log(`hold-out: ${holdAll.length} matches, ${usable(holdAll).length} forecastable, ${holdFit.length} with both clubs on >= 5 games (rule set), ${holdOpen.length} opening-week${bundleSha ? `; bundle sha256 ${bundleSha}` : ''}`)

// The model-as-function equals the compiled model, on both seasons, every forecastable match.
{
  let maxdiff = 0, n = 0
  for (const f of [...usable(trainAll), ...usable(holdAll)]) {
    const comp = Array.from(triple(forecastFor(1, makeRow(f.home, f.home, f.tH.p, f.tH.pts, f.tH.gf, f.tH.ga, 0), makeRow(f.away, f.away, f.tA.p, f.tA.pts, f.tA.gf, f.tA.ga, 0))))
    const mine = probs(f.rh, f.ra, TH0)
    for (let i = 0; i < 3; i++) maxdiff = Math.max(maxdiff, Math.abs(comp[i] - mine[i])); n++
  }
  console.log(`the parametrised model at table-v1's constants vs the compiled model: ${n} forecasts, max abs difference ${maxdiff.toExponential(2)}`)
  check(`the parametrised model at the declared constants equals the compiled model on all ${n} forecasts of both seasons`, n === usable(trainAll).length + usable(holdAll).length && maxdiff < 1e-12)
}
// The earlier record's numbers, reproduced: ties this script's training pipeline to the record that was checked 29 ways.
{
  const v = trainFit.map(f => brier(probs(f.rh, f.ra, TH0), f.o))
  check('table-v1 on the training set reproduces the earlier record: n 330, Brier 0.689', trainFit.length === 330 && f3(mean(v)) === '0.689', `${trainFit.length}, ${f3(mean(v))}`)
}
{
  // The 2026-27 record (outbox/forecast-backtest-2026-11-08.txt) was made on the first 99 of these matches, in play order. Its five bins, to the digit.
  const first99 = usable(holdAll.slice(0, 99)).filter(f => f.pre >= 5)
  const BINS = [[0, .2], [.2, .4], [.4, .6], [.6, .8], [.8, 1.01]]
  const line = ([lo, hi]) => { const s = first99.filter(f => { const p = probs(f.rh, f.ra, TH0)[0]; return p >= lo && p < hi }); return `n ${s.length} | ${(s.reduce((x, f) => x + probs(f.rh, f.ra, TH0)[0], 0) / s.length * 100).toFixed(0)}% | ${(s.filter(f => f.o === 0).length / s.length * 100).toFixed(0)}%` }
  const mine = BINS.map(line), want = ['n 12 | 7% | 50%', 'n 9 | 34% | 33%', 'n 7 | 50% | 43%', 'n 11 | 71% | 36%', 'n 10 | 88% | 80%']
  check('table-v1 on the first 99 hold-out matches reproduces the 2026-27 record\'s five bins to the digit', holdAll.length >= 99 && mine.every((l, i) => l === want[i]), mine.filter((l, i) => l !== want[i]).join(' / '))
}

if (bundleOnly) {
  console.log('\nCHECKS (data only: no candidate has been fitted or scored)')
  for (const c of checks) console.log(c.ok ? 'PASS' : 'FAIL', c.name, c.detail ? `[${c.detail}]` : '')
  const bad = checks.filter(c => !c.ok).length
  console.log(`\n${checks.length - bad} of ${checks.length} checks hold; coverage: training ${trainAll.length} matches loaded, hold-out ${holdAll.length} matches loaded from ${bundleSha ? 'a bundle' : 'a raw directory'}, 4 hold-out sources cross-checked`)
  process.exit(bad === 0 ? 0 : 1)
}
// ---- diagnostics of table-v1 on the training set: is the DRAW share calibrated?
{
  const ps = trainFit.map(f => probs(f.rh, f.ra, TH0))
  const act = [0, 1, 2].map(k => trainFit.filter(f => f.o === k).length / trainFit.length)
  const mp = [0, 1, 2].map(k => mean(ps.map(p => p[k])))
  console.log(`\ntable-v1 on the ${trainFit.length} training forecasts, mean probability vs how often it happened: home ${pct(mp[0])} vs ${pct(act[0])}, draw ${pct(mp[1])} vs ${pct(act[1])}, away ${pct(mp[2])} vs ${pct(act[2])}`)
  const byGap = trainFit.map((f, i) => ({ g: Math.abs(f.rh - f.ra + TH0.home), pD: ps[i][1], draw: f.o === 1 })).sort((a, b) => a.g - b.g)
  const thirds = [0, 1, 2].map(k => byGap.slice(Math.floor(k * byGap.length / 3), Math.floor((k + 1) * byGap.length / 3)))
  console.log('draws by the model\'s own gap |d| (thirds, smallest first): ' + thirds.map((t, k) => `gap ${f2(t[0].g)}-${f2(t.at(-1).g)}: predicted ${pct(mean(t.map(x => x.pD)))}, happened ${pct(t.filter(x => x.draw).length / t.length)} (n ${t.length})`).join(' | '))
}

// ---- optimisers: two unrelated ones, on the same likelihood, in transformed coordinates (scale > 0, decay > 0, 0 < base < 0.9)
const logit = p => Math.log(p / (1 - p))
const toU = (th, free) => free.map(k => k === 'home' ? th.home : k === 'scale' ? Math.log(th.scale) : k === 'drawBase' ? logit(th.drawBase / 0.9) : Math.log(th.drawDecay))
const fromU = (u, free, base) => { const th = { ...base }; free.forEach((k, i) => { th[k] = k === 'home' ? u[i] : k === 'scale' ? Math.exp(u[i]) : k === 'drawBase' ? 0.9 / (1 + Math.exp(-u[i])) : Math.exp(u[i]) }); return th }
const nll = (fs, th) => { let s = 0; for (const f of fs) s += logloss(probs(f.rh, f.ra, th), f.o); return s }
function nelderMead(fn, x0, step = 0.3) {
  const n = x0.length
  let S = [x0.slice(), ...x0.map((_, i) => x0.map((v, j) => j === i ? v + step : v))], F = S.map(fn)
  for (let it = 0; it < 6000; it++) {
    const idx = F.map((_, i) => i).sort((a, b) => F[a] - F[b]); S = idx.map(i => S[i]); F = idx.map(i => F[i])
    if (Math.abs(F[n] - F[0]) < 1e-13 && S.every(s => Math.hypot(...s.map((v, j) => v - S[0][j])) < 1e-8)) break
    const c = S[0].map((_, j) => S.slice(0, n).reduce((a, s) => a + s[j], 0) / n)
    const pt = t => c.map((v, j) => v + t * (S[n][j] - v))
    const xr = pt(-1), fr = fn(xr)
    if (fr < F[0]) { const xe = pt(-2), fe = fn(xe); if (fe < fr) { S[n] = xe; F[n] = fe } else { S[n] = xr; F[n] = fr } }
    else if (fr < F[n - 1]) { S[n] = xr; F[n] = fr }
    else { const xc = fr < F[n] ? pt(-0.5) : pt(0.5), fc = fn(xc); if (fc < Math.min(fr, F[n])) { S[n] = xc; F[n] = fc } else for (let i = 1; i <= n; i++) { S[i] = S[0].map((v, j) => v + 0.5 * (S[i][j] - v)); F[i] = fn(S[i]) } }
  }
  const b = F.indexOf(Math.min(...F)); return { x: S[b], f: F[b] }
}
function coordinateDescent(fn, x0, span = 3) {
  let x = x0.slice(), f = fn(x); const gr = (Math.sqrt(5) - 1) / 2
  for (let cycle = 0; cycle < 400; cycle++) {
    const before = f
    for (let i = 0; i < x.length; i++) {
      let lo = x[i] - span, hi = x[i] + span; const at = v => { const y = x.slice(); y[i] = v; return fn(y) }
      for (let k = 0; k < 90; k++) { const c = hi - gr * (hi - lo), d = lo + gr * (hi - lo); if (at(c) < at(d)) hi = d; else lo = c }
      const v = (lo + hi) / 2, fv = at(v); if (fv < f) { x[i] = v; f = fv }
    }
    if (before - f < 1e-14) break
  }
  return { x, f }
}
function invert(Mx) {         // Gauss-Jordan with partial pivoting; null if singular
  const n = Mx.length, A2 = Mx.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => i === j ? 1 : 0)])
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A2[r][c]) > Math.abs(A2[p][c])) p = r
    if (Math.abs(A2[p][c]) < 1e-12) return null
    ;[A2[c], A2[p]] = [A2[p], A2[c]]; const d = A2[c][c]; A2[c] = A2[c].map(v => v / d)
    for (let r = 0; r < n; r++) if (r !== c) { const k = A2[r][c]; A2[r] = A2[r].map((v, j) => v - k * A2[c][j]) }
  }
  return A2.map(r => r.slice(n))
}
function fit(fs, free) {
  const obj = u => nll(fs, fromU(u, free, TH0))
  const u0 = toU(TH0, free)
  const a = nelderMead(obj, u0), b = coordinateDescent(obj, u0.map(v => v + 0.2))
  const th = fromU(a.x, free, TH0), thB = fromU(b.x, free, TH0)
  // gradient in the transformed coordinates, central differences
  const grad = a.x.map((_, i) => { const h = 1e-6, up = a.x.slice(), dn = a.x.slice(); up[i] += h; dn[i] -= h; return (obj(up) - obj(dn)) / (2 * h) })
  // Hessian in NATURAL coordinates, for standard errors
  const nat = free.map(k => th[k]), natNll = v => { const t = { ...TH0 }; free.forEach((k, i) => { t[k] = v[i] }); return nll(fs, t) }
  const H = nat.map((_, i) => nat.map((_, j) => {
    const hi = 1e-3 * Math.max(1, Math.abs(nat[i])), hj = 1e-3 * Math.max(1, Math.abs(nat[j]))
    const at = (di, dj) => { const v = nat.slice(); v[i] += di; v[j] += dj; return natNll(v) }
    return i === j ? (at(hi, 0) - 2 * natNll(nat) + at(-hi, 0)) / (hi * hi) : (at(hi, hj) - at(hi, -hj) - at(-hi, hj) + at(-hi, -hj)) / (4 * hi * hj)
  }))
  const inv = invert(H), pd = inv !== null && H.every((_, i) => { const m = H.slice(0, i + 1).map(r => r.slice(0, i + 1)); const iv = invert(m); return iv !== null && iv[i][i] > 0 })
  const se = inv ? inv.map((r, i) => Math.sqrt(Math.max(0, r[i]))) : free.map(() => NaN)
  const onBound = (th.scale < 0.1 || th.scale > 5 || Math.abs(th.home) > 1.5 || th.drawDecay > 20 || th.drawDecay < 0.2 || th.drawBase > 0.6 || th.drawBase < 0.05)
  const agree = Math.abs(a.f - b.f) < 1e-6 && free.every(k => Math.abs(th[k] - thB[k]) < 1e-3 * Math.max(1, Math.abs(th[k])))
  return { th, thB, f: a.f, fB: b.f, grad, se, free, pd, onBound, agree, wellPosed: agree && pd && !onBound && grad.every(g => Math.abs(g) < 1e-3) }
}
const cvFolds = 5
function cvPredict(fs, free) {
  const preds = new Array(fs.length), seen = new Array(fs.length).fill(0)
  for (let k = 0; k < cvFolds; k++) {
    const tr = fs.filter((_, i) => i % cvFolds !== k)
    const u = nelderMead(v => nll(tr, fromU(v, free, TH0)), toU(TH0, free)).x
    const th = fromU(u, free, TH0)
    fs.forEach((f, i) => { if (i % cvFolds === k) { preds[i] = probs(f.rh, f.ra, th); seen[i]++ } })
  }
  return { preds, partition: seen.every(s => s === 1) }
}
const roundTh = th => Object.fromEntries(Object.entries(th).map(([k, v]) => [k, Math.round(v * 100) / 100]))
const fmtTh = (th, free) => free.map(k => `${k} ${f2(th[k])}`).join(', ')

const cand = { A: ['home', 'scale'], B: ['home', 'scale', 'drawBase', 'drawDecay'] }
const res = {}
console.log('\nFITS (maximum likelihood on the training set; log loss summed over the matches):')
const base = nll(trainFit, TH0)
console.log(`  table-v1 (${fmtTh(TH0, cand.B)}): total log loss ${f2(base)}, per match ${f3(base / trainFit.length)}`)
for (const [name, free] of Object.entries(cand)) {
  const r = fit(trainFit, free), cv = cvPredict(trainFit, free)
  const cvLLs = cv.preds.map((p, i) => logloss(p, trainFit[i].o)), cvLL = mean(cvLLs), cvBr = cv.preds.map((p, i) => brier(p, trainFit[i].o))
  res[name] = { ...r, cv, cvLL, cvLLs, cvBr }
  console.log(`  ${name} (${free.join(' + ')}): ${free.map((k, i) => `${k} ${f3(r.th[k])} +/- ${f3(r.se[i])}`).join(', ')}; total log loss ${f2(r.f)} (${f2(base - r.f)} below table-v1's); per match ${f3(r.f / trainFit.length)}`)
  console.log(`     solvers: Nelder-Mead and golden-section coordinate descent end ${Math.abs(r.f - r.fB).toExponential(1)} apart in log loss${r.agree ? '' : ' and DISAGREE'}; |gradient| max ${Math.max(...r.grad.map(Math.abs)).toExponential(1)}; Hessian positive definite: ${r.pd}; on a bound: ${r.onBound}`)
  console.log(`     5-fold cross-validated log loss per match ${f3(cvLL)} (table-v1 ${f3(base / trainFit.length)}); the folds partition the matches: ${cv.partition}`)
  check(`fit ${name}: two unrelated solvers agree, the gradient vanishes, the Hessian is positive definite, no constant on a bound`, r.wellPosed, `${Math.abs(r.f - r.fB).toExponential(1)}, ${Math.max(...r.grad.map(Math.abs)).toExponential(1)}`)
  check(`fit ${name}: the fit is no worse than table-v1 in-sample (log loss ${f2(r.f)} <= ${f2(base)}) and the cross-validation folds partition the matches`, r.f <= base + 1e-9 && cv.partition)
}
const selPair = paired(res.B.cvLLs, res.A.cvLLs)
const S = selPair.z <= RULE.selectZ ? 'B' : 'A'
const thS = roundTh(res[S].th)
console.log(`\nSELECTED: ${S}. B's cross-validated log loss ${f3(res.B.cvLL)} against A's ${f3(res.A.cvLL)}: paired difference ${signed(selPair.mean)} +/- ${f3(selPair.se)}, z ${f2(selPair.z)} (B is chosen only at z <= ${RULE.selectZ}). Constants rounded to two decimals: ${fmtTh(thS, cand.B)}`)

// ---- scoring S (rounded) against table-v1
const score = (fs, th) => fs.map(f => { const p = probs(f.rh, f.ra, th); return { b: brier(p, f.o), l: logloss(p, f.o), p } })
const row = (label, fs, thSv = thS) => {
  if (fs.length < 2) { console.log(label.padEnd(44), 'n', fs.length); return null }
  const v = score(fs, TH0), s = score(fs, thSv), pr = paired(s.map(x => x.b), v.map(x => x.b))
  const top = x => mean(x.map(r => Math.max(...r.p))), hit = x => x.filter((r, i) => r.p.indexOf(Math.max(...r.p)) === fs[i].o).length / x.length
  console.log(label.padEnd(44), 'n', String(fs.length).padStart(3), '| Brier v1', f3(mean(v.map(x => x.b))), 'S', f3(mean(s.map(x => x.b))), '| S - v1', signed(pr.mean), '+/-', f3(pr.se), 'z', f2(pr.z),
    '| logloss v1', f3(mean(v.map(x => x.l))), 'S', f3(mean(s.map(x => x.l))), '| top claimed/happened v1', pct(top(v)) + '/' + pct(hit(v)), 'S', pct(top(s)) + '/' + pct(hit(s)))
  return { v, s, pr, brierS: mean(s.map(x => x.b)), brierV: mean(v.map(x => x.b)) }
}
console.log('\nSCORES, S (rounded) against table-v1; "z" = paired mean difference / its standard error, negative favours S:')
const rTrainIn = row('last season, in-sample, both clubs >= 5 games', trainFit)
const rHold = row('THIS season (hold-out), both clubs >= 5 games', holdFit)
const rHoldAll = row('this season, every forecastable match', usable(holdAll))
const rTrainOpen = row('last season, opening weeks (1-4 games)', trainOpen)
const rHoldOpen = row('this season, opening weeks (1-4 games)', holdOpen)
const cvS = res[S].cv, cvV = trainFit.map(f => ({ b: brier(probs(f.rh, f.ra, TH0), f.o) }))
const cvB = cvS.preds.map((p, i) => brier(p, trainFit[i].o))
const prCV = paired(cvB, cvV.map(x => x.b))
console.log('last season, 5-fold cross-validated, >= 5 games'.padEnd(44), 'n', String(trainFit.length).padStart(3), '| Brier v1', f3(mean(cvV.map(x => x.b))), 'S', f3(mean(cvB)), '| S - v1', signed(prCV.mean), '+/-', f3(prCV.se), 'z', f2(prCV.z))
const prU = paired(cvB, cvB.map(() => RULE.uniform))
console.log('last season, 5-fold cross-validated, vs uniform'.padEnd(44), 'n', String(trainFit.length).padStart(3), '| Brier uniform', f3(RULE.uniform), 'S', f3(mean(cvB)), '| S - uniform', signed(prU.mean), '+/-', f3(prU.se), 'z', f2(prU.z))

// ---- calibration of S: the home-win slope, on the cross-validated predictions (last season) and on the hold-out
function logisticNewton(xs, ys) {
  const nllL = (a, b) => { let s = 0; for (let i = 0; i < xs.length; i++) { const z = a + b * xs[i]; s += Math.max(z, 0) + Math.log1p(Math.exp(-Math.abs(z))) - ys[i] * z } return s }
  const moments = (a, b) => { let g0 = 0, g1 = 0, h00 = 0, h01 = 0, h11 = 0; for (let i = 0; i < xs.length; i++) { const p = 1 / (1 + Math.exp(-(a + b * xs[i]))), r = ys[i] - p, w = p * (1 - p); g0 += r; g1 += r * xs[i]; h00 += w; h01 += w * xs[i]; h11 += w * xs[i] * xs[i] } return { g0, g1, h00, h01, h11, det: h00 * h11 - h01 * h01 } }
  let a = 0, b = 0
  for (let it = 0; it < 500; it++) {
    const m = moments(a, b), da = (m.h11 * m.g0 - m.h01 * m.g1) / m.det, db = (m.h00 * m.g1 - m.h01 * m.g0) / m.det
    let t = 1; const f0 = nllL(a, b); while (t > 1e-12 && !(nllL(a + t * da, b + t * db) <= f0 + 1e-12)) t /= 2
    a += t * da; b += t * db; if (Math.abs(t * da) + Math.abs(t * db) < 1e-13) break
  }
  const m = moments(a, b); return { a, b, seA: Math.sqrt(m.h11 / m.det), seB: Math.sqrt(m.h00 / m.det) }
}
function logisticProfile(xs, ys) {
  const nllL = (a, b) => { let s = 0; for (let i = 0; i < xs.length; i++) { const z = a + b * xs[i]; s += Math.log(1 + Math.exp(z)) - ys[i] * z } return s }
  const bestA = b => { let lo = -30, hi = 30; for (let k = 0; k < 200; k++) { const mid = (lo + hi) / 2; let d = 0; for (let i = 0; i < xs.length; i++) d += 1 / (1 + Math.exp(-(mid + b * xs[i]))) - ys[i]; if (d > 0) hi = mid; else lo = mid } return (lo + hi) / 2 }
  let lo = -5, hi = 8; const gr = (Math.sqrt(5) - 1) / 2
  for (let k = 0; k < 200; k++) { const c = hi - gr * (hi - lo), d = lo + gr * (hi - lo); if (nllL(bestA(c), c) < nllL(bestA(d), d)) hi = d; else lo = c }
  const b = (lo + hi) / 2; return { a: bestA(b), b }
}
const slopeFrom = (pHome, fs) => { const xs = pHome.map(p => Math.log(p / (1 - p))), ys = fs.map(f => f.o === 0 ? 1 : 0); return { n: xs.length, newton: logisticNewton(xs, ys), profile: logisticProfile(xs, ys) } }
const slopeLine = (label, s) => console.log(`${label.padEnd(58)} n ${String(s.n).padStart(3)}: slope ${f2(s.newton.b)} +/- ${f2(s.newton.seB)}, intercept ${f2(s.newton.a)} +/- ${f2(s.newton.seA)}`)
console.log('\nCALIBRATION of the home-win probability (calibrated = slope 1.00, intercept 0.00):')
const slV1 = slopeFrom(trainFit.map(f => probs(f.rh, f.ra, TH0)[0]), trainFit)
const slCV = slopeFrom(cvS.preds.map(p => p[0]), trainFit)
const slIn = slopeFrom(trainFit.map(f => probs(f.rh, f.ra, thS)[0]), trainFit)
const slHoldV1 = slopeFrom(holdFit.map(f => probs(f.rh, f.ra, TH0)[0]), holdFit)
const slHold = slopeFrom(holdFit.map(f => probs(f.rh, f.ra, thS)[0]), holdFit)
slopeLine('table-v1, last season (the earlier record: 0.41 +/- 0.09)', slV1); slopeLine('S, last season, cross-validated', slCV); slopeLine('S, last season, in-sample (rounded constants)', slIn)
slopeLine('table-v1, this season', slHoldV1); slopeLine('S, this season (hold-out)', slHold)
check('slope: the two unrelated solvers agree to 1e-4, all finite, on all five fits', [slV1, slCV, slIn, slHoldV1, slHold].every(x => [x.newton.a, x.newton.b, x.newton.seA, x.newton.seB, x.profile.a, x.profile.b].every(Number.isFinite) && Math.abs(x.newton.b - x.profile.b) < 1e-4 && Math.abs(x.newton.a - x.profile.a) < 1e-4))
check('slope: table-v1\'s last-season slope reproduces the earlier record (0.41 +/- 0.09)', f2(slV1.newton.b) === '0.41' && f2(slV1.newton.seB) === '0.09', `${f2(slV1.newton.b)} +/- ${f2(slV1.newton.seB)}`)
{
  const ps = trainFit.map((f, i) => cvS.preds[i]), act = [0, 1, 2].map(k => trainFit.filter(f => f.o === k).length / trainFit.length)
  console.log(`S cross-validated on last season, mean probability vs how often it happened: home ${pct(mean(ps.map(p => p[0])))} vs ${pct(act[0])}, draw ${pct(mean(ps.map(p => p[1])))} vs ${pct(act[1])}, away ${pct(mean(ps.map(p => p[2])))} vs ${pct(act[2])}`)
  const hp = holdFit.map(f => probs(f.rh, f.ra, thS)), ha = [0, 1, 2].map(k => holdFit.filter(f => f.o === k).length / holdFit.length)
  console.log(`S on this season (hold-out, ${holdFit.length}), mean probability vs how often it happened: home ${pct(mean(hp.map(p => p[0])))} vs ${pct(ha[0])}, draw ${pct(mean(hp.map(p => p[1])))} vs ${pct(ha[1])}, away ${pct(mean(hp.map(p => p[2])))} vs ${pct(ha[2])}`)
}

// ------------------------------------------------------------------------------------------------------------ the verdict
const integrityOk = () => checks.every(c => c.ok)
const m = {
  z1: rHold?.pr.z, z2: prU.z, z3: prCV.z, openTrainS: rTrainOpen?.brierS, openTrainV1: rTrainOpen?.brierV, openHoldS: rHoldOpen?.brierS, openHoldV1: rHoldOpen?.brierV,
  slopeCV: slCV.newton.b, slopeSE: slCV.newton.seB, wellPosed: res[S].wellPosed, checksOk: integrityOk(),
}
const verdict = decide(m)
const METHOD_STATEMENT = `table-v2: ppg + 0.25*gdpg + 0.10*gfpg, home +${f2(thS.home)}, scale ${f2(thS.scale)}, draw ${f2(thS.drawBase)}*exp(-|gap|/${f2(thS.drawDecay)})`
console.log('\nRULE')
const rules = [
  ['R1', `this season, >= 5 games: S beats table-v1, paired z <= ${RULE.z1}`, `z ${f2(m.z1)}, n ${holdFit.length}`, m.z1 <= RULE.z1],
  ['R2', `last season, cross-validated: S beats a uniform guess (${f3(RULE.uniform)}), paired z <= ${RULE.z2}`, `z ${f2(m.z2)}, n ${trainFit.length}, Brier ${f3(mean(cvB))}`, m.z2 <= RULE.z2],
  ['R3', `last season, cross-validated: S beats table-v1, paired z <= ${RULE.z3}`, `z ${f2(m.z3)}, n ${trainFit.length}`, m.z3 <= RULE.z3],
  ['R4', 'opening weeks, both seasons: S is no worse than table-v1', `last season ${f3(m.openTrainS)} vs ${f3(m.openTrainV1)} (n ${trainOpen.length}), this season ${f3(m.openHoldS)} vs ${f3(m.openHoldV1)} (n ${holdOpen.length})`, m.openTrainS <= m.openTrainV1 && m.openHoldS <= m.openHoldV1],
  ['R5', `S's cross-validated home-win slope on last season is within ${RULE.slopeSigma} standard errors of 1`, `slope ${f2(m.slopeCV)} +/- ${f2(m.slopeSE)}`, Math.abs(m.slopeCV - 1) <= RULE.slopeSigma * m.slopeSE],
  ['R6', 'the fit is well posed', String(m.wellPosed), m.wellPosed],
]
for (const [id, text, val, ok] of rules) console.log(`  ${ok ? 'PASS' : 'FAIL'} ${id} ${text} [${val}]`)
console.log(`  (R7, every integrity check, is judged after the check list below)`)
check('the verdict function and the rule table above agree on R1-R6', rules.every(([id, , , ok]) => ok === !verdict.failed.some(f => f.startsWith(id))))

console.log('\nCHECKS')
for (const c of checks) console.log(c.ok ? 'PASS' : 'FAIL', c.name, c.detail ? `[${c.detail}]` : '')
const failed = checks.filter(c => !c.ok).length
const final = decide({ ...m, checksOk: failed === 0 })
console.log(`\n${checks.length - failed} of ${checks.length} checks hold; coverage: 2 seasons (${trainAll.length} + ${holdAll.length} matches), ${trainFit.length} training forecasts fitted, ${holdFit.length} hold-out forecasts judged by R1 (${holdOpen.length} opening-week), the hold-out read from ${bundleSha ? 'a bundle' : 'a raw directory'} of 4 sources`)
console.log(`\nVERDICT: ${final.ship ? `SHIP table-v2 (selected candidate ${S}); constants ${fmtTh(thS, cand.B)}; method statement "${METHOD_STATEMENT}"` : `DO NOT SHIP. ${final.failed.join('; ')}`}`)
process.exitCode = failed === 0 ? 0 : 1
