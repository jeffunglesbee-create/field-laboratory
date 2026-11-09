// ORACLE FOR table-v2: the compiled F# model (src/Forecast.fs -> build/Forecast.js) against the model as the pre-registered fit DECLARED it.
// docs/CC-CMD-2026-09-11-epl-forecaster-phase1.md; outbox/cc-session-2026-11-09-fit-c.md.
//
// THE QUESTION. The verdict (SHIP) was reached on a JavaScript model with three constants. What ships is F#. The two are the same model only if
// something compares them, and the comparison must not read its answer from the F#.
//
// WHERE THE DECLARED MODEL COMES FROM. Not from src/Forecast.fs and not from this file's author: from the LAST LINE of
// outbox/forecast-fit-c-2026-11-09.txt, the unedited output of the pre-registered run. That line carries the method statement
// ("table-v2: ppg + 0.25*gdpg + 0.10*gfpg, home +0.42, scale 1.14, draw 0.27 for every match"); every constant the twin below uses is parsed out of that string.
//
// WHAT IT CHECKS.
//   1. The compiled METHOD equals that statement, byte for byte, and METHOD_TAG is "table-v2".
//   2. On every input below, the compiled three-way equals the twin's to 1e-12 (float noise is ~1e-16; the smallest deliberate break below is ~1e-10).
//   3. The draw component is EXACTLY the declared share on every input: one number, not a function of the gap.
//   4. The three components sum to 1 and each lies in (0, 1).
//   5. A club that has played nothing is refused (an empty triple), never scored.
//   6. BREAK IT ON PURPOSE (Rule 90): fourteen deliberately wrong twins are compared with the same compiled model and every one must go red; the unbroken twin must stay green.
//
// COVERAGE, printed in the result as well as here (Rule 91). Real inputs from COMMITTED files only:
//   - the 370 forecasts of 2024-25 whose two clubs had each played at least once, with the table rows as a replay of
//     outbox/forecast-season-2024-25-2026-11-09.json had them just before each match;
//   - all 380 ordered pairs of the 20 clubs in the 2026-11-08 table (outbox/forecast-fit-holdout-2026-11-08.json), i.e. every fixture the model could be asked about on 2026-11-21;
//   - all 380 ordered pairs of 2024-25's final table.
// Synthetic inputs: 20,000 seeded random pairs of table rows (1-38 games played, points 0-3 per game, goals 0-4 per game for and against) and 6 hand-picked extremes.
// NOT covered: 2025-26 (the training season). Its raw files are pinned by hash in the fit script but are not in the repository, so an oracle that has to run from committed
// files cannot replay it. The fit script's own oracle compared the table-v1 model with the compiled F# on 830 forecasts including 2025-26 and found max difference 0; the
// rating function it exercised is unchanged in table-v2 and is compared again here.
//
// WHY THE FIT SCRIPT CANNOT BE RE-RUN AS THE RECORD OF THE VERDICT AFTER table-v2 LANDED. outbox/forecast-fit-c-2026-11-09.mjs imports the compiled model and checks that the
// table-v1 model equals it (two of its 63 checks). Once the compiled model is table-v2 those two fail by design and its last line reads DO NOT SHIP; measured 2026-11-09 and kept in
// outbox/forecast-fit-c-at-table-v2-build-2026-11-09.txt. This file is what replaces that comparison.
//
// Usage:  npm run build && node outbox/forecast-table-v2-oracle-2026-11-09.mjs        (from the repository root; exit 0 only when every check holds)

import fs from 'node:fs'
import { makeRow, forecastOf, triple, rating, METHOD, METHOD_TAG } from '../build/Forecast.js'

const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` [${detail}]` : ''}`) }
const TOL = 1e-12

// ---- the declared model, parsed from the pre-registered run's last line ---------------------------------------------------------
const fitOut = fs.readFileSync('outbox/forecast-fit-c-2026-11-09.txt', 'utf8').trimEnd().split('\n')
const verdictLine = fitOut[fitOut.length - 1]
const v = /^VERDICT: SHIP table-v2 \(candidate C\); constants home \+([\d.]+), scale ([\d.]+), draw share ([\d.]+); method statement "([^"]+)"$/.exec(verdictLine)
check('the last line of the pre-registered run is the SHIP verdict with its constants and method statement', v !== null, verdictLine.slice(0, 60))
if (v === null) { console.log('ORACLE FAILED: no declared model to compare against'); process.exit(1) }
const STATEMENT = v[4]
const m = /^table-v2: ppg \+ ([\d.]+)\*gdpg \+ ([\d.]+)\*gfpg, home \+([\d.]+), scale ([\d.]+), draw ([\d.]+) for every match$/.exec(STATEMENT)
check('the statement parses into the five numbers the twin uses', m !== null, STATEMENT)
if (m === null) { console.log('ORACLE FAILED: statement did not parse'); process.exit(1) }
const D = { wGd: +m[1], wGf: +m[2], home: +m[3], scale: +m[4], share: +m[5] }
check('the verdict line and the statement agree on home, scale and the draw share', D.home === +v[1] && D.scale === +v[2] && D.share === +v[3], JSON.stringify(D))

check('the compiled METHOD equals the declared statement, byte for byte', METHOD === STATEMENT, METHOD)
check('the compiled METHOD_TAG is table-v2', METHOD_TAG === 'table-v2', METHOD_TAG)

// ---- the twin: written from the declared statement alone --------------------------------------------------------------------------
const build = o => (H, A) => {
  const r = x => x.pts / x.p + o.wGd * ((x.gf - x.ga) / x.p) + o.wGf * (x.gf / x.p)
  const gap = o.flip ? r(A) - r(H) : r(H) - r(A)
  const d = gap + o.home
  const sh = o.decay ? o.share * Math.exp(-Math.abs(d) / o.decay) : o.share
  const z = o.homeAfter ? gap / o.scale + o.home : d / o.scale
  const pH = (1 - sh) / (1 + Math.exp(-z))
  return [pH, sh, o.foldDraw ? 1 - pH : 1 - sh - pH]
}
const twin = build(D)
const rate = x => x.pts / x.p + D.wGd * ((x.gf - x.ga) / x.p) + D.wGf * (x.gf / x.p)

// ---- inputs ---------------------------------------------------------------------------------------------------------------------
const row = (team, p, pts, gf, ga) => ({ team, p, pts, gf, ga })

const season = JSON.parse(fs.readFileSync('outbox/forecast-season-2024-25-2026-11-09.json', 'utf8'))
const replay = []
{
  const t = new Map()
  const get = n => { if (!t.has(n)) t.set(n, { p: 0, pts: 0, gf: 0, ga: 0 }); return t.get(n) }
  const order = [...season.matches].sort((a, b) => a.date.localeCompare(b.date) || String(a.time).localeCompare(String(b.time)) || a.i - b.i)
  for (const g of order) {
    const h = get(g.home), a = get(g.away)
    if (h.p >= 1 && a.p >= 1) replay.push([row(g.home, h.p, h.pts, h.gf, h.ga), row(g.away, a.p, a.pts, a.gf, a.ga)])
    h.p++; a.p++; h.gf += g.hg; h.ga += g.ag; a.gf += g.ag; a.ga += g.hg
    if (g.hg > g.ag) h.pts += 3; else if (g.hg < g.ag) a.pts += 3; else { h.pts++; a.pts++ }
  }
}
const pairsOf = rows => rows.flatMap(h => rows.filter(a => a.team !== h.team).map(a => [h, a]))
const hold = JSON.parse(fs.readFileSync('outbox/forecast-fit-holdout-2026-11-08.json', 'utf8'))
const tableNow = pairsOf(hold.standings.map(s => row(s.team, s.played, s.points, s.gf, s.ga)))
const tableFinal = pairsOf(season.standings.map(s => row(s.team, s.played, s.points, s.gf, s.ga)))

const mulberry32 = a => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
const rnd = mulberry32(20261109)
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1))
const synthetic = []
for (let i = 0; i < 20000; i++) {
  const mk = n => { const p = int(1, 38); return row(n, p, int(0, 3 * p), int(0, 4 * p), int(0, 4 * p)) }
  synthetic.push([mk('H'), mk('A')])
}
const extremes = [
  [row('H', 1, 3, 9, 0), row('A', 1, 0, 0, 9)],
  [row('H', 1, 0, 0, 9), row('A', 1, 3, 9, 0)],
  [row('H', 38, 114, 152, 0), row('A', 38, 0, 0, 152)],
  [row('H', 38, 0, 0, 152), row('A', 38, 114, 152, 0)],
  [row('H', 10, 15, 14, 14), row('A', 10, 15, 14, 14)],
  [row('H', 38, 50, 55, 55), row('A', 38, 50, 55, 55)],
]
synthetic.push(...extremes)

const SETS = [
  ['2024-25 forecasts replayed from the committed bundle', replay, 370],
  ['2026-11-08 table, every ordered pair of its 20 clubs', tableNow, 380],
  ['2024-25 final table, every ordered pair of its 20 clubs', tableFinal, 380],
  ['synthetic table rows (20,000 seeded + 6 extremes)', synthetic, 20006],
]
for (const [name, pairs, n] of SETS) check(`input set "${name}" has the expected size`, pairs.length === n, `${pairs.length} of ${n}`)
const ALL = SETS.flatMap(s => s[1])

// ---- the compiled model ---------------------------------------------------------------------------------------------------------
const compiled = (H, A) => Array.from(triple(forecastOf(1, makeRow(H.team, H.team, H.p, H.pts, H.gf, H.ga, 0), makeRow(A.team, A.team, A.p, A.pts, A.gf, A.ga, 0))))
const COMPILED = ALL.map(([H, A]) => compiled(H, A))
check('the compiled model priced every input', COMPILED.every(t => t.length === 3 && t.every(Number.isFinite)), `${COMPILED.filter(t => t.length === 3).length} of ${COMPILED.length}`)

const maxDiff = fn => { let worst = 0; for (let i = 0; i < ALL.length; i++) { const t = fn(ALL[i][0], ALL[i][1]); for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(t[k] - COMPILED[i][k])) } return worst }
const perSet = []
{ let at = 0; for (const [name, pairs] of SETS) { let worst = 0; for (let i = 0; i < pairs.length; i++) { const t = twin(pairs[i][0], pairs[i][1]); for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(t[k] - COMPILED[at + i][k])) } at += pairs.length; perSet.push([name, worst]) } }
for (const [name, worst] of perSet) check(`compiled equals the declared model on ${name}`, worst <= TOL, `max abs difference ${worst.toExponential(2)}`)

check('the draw component is exactly the declared share on every input', COMPILED.every(t => t[1] === D.share), `${COMPILED.filter(t => t[1] === D.share).length} of ${COMPILED.length}`)
const sums = COMPILED.map(t => t[0] + t[1] + t[2])
check('the three components sum to 1 on every input', sums.every(s => Math.abs(s - 1) <= TOL), `worst ${Math.max(...sums.map(s => Math.abs(s - 1))).toExponential(2)}`)
check('every component lies strictly between 0 and 1', COMPILED.every(t => t.every(x => x > 0 && x < 1)), `smallest ${Math.min(...COMPILED.flat()).toExponential(2)}, largest ${Math.max(...COMPILED.flat()).toFixed(6)}`)

let ratingWorst = 0
for (const [H, A] of ALL) for (const x of [H, A]) { const r = rating(makeRow(x.team, x.team, x.p, x.pts, x.gf, x.ga, 0)); ratingWorst = Math.max(ratingWorst, Math.abs(r - rate(x))) }
check('the compiled rating equals ppg + 0.25*gdpg + 0.10*gfpg for every club row', ratingWorst <= TOL, `max abs difference ${ratingWorst.toExponential(2)}`)

const empty = forecastOf(1, makeRow('X', 'X', 0, 0, 0, 0, 0), makeRow('Y', 'Y', 10, 15, 14, 14, 0))
const empty2 = forecastOf(1, makeRow('Y', 'Y', 10, 15, 14, 14, 0), makeRow('X', 'X', 0, 0, 0, 0, 0))
check('a club that has played nothing is refused on either side, never scored', Array.from(triple(empty)).length === 0 && Array.from(triple(empty2)).length === 0)

// ---- break it on purpose ------------------------------------------------------------------------------------------------------------
console.log('')
console.log(`BREAK IT ON PURPOSE: each wrong twin below is compared with the same compiled model over all ${ALL.length} inputs; it must exceed ${TOL.toExponential(0)}. The unbroken twin is the control.`)
const control = maxDiff(twin)
check('control: the unbroken twin is within tolerance of the compiled model', control <= TOL, `max abs difference ${control.toExponential(2)}`)
const V1 = { home: 0.30, scale: 0.55, share: 0.28, decay: 1.10 }
const BREAKS = [
  ['home advantage 0.42 -> 0.43', { home: 0.43 }],
  ['home advantage -> table-v1\'s 0.30', { home: V1.home }],
  ['scale 1.14 -> 1.15', { scale: 1.15 }],
  ['scale -> table-v1\'s 0.55', { scale: V1.scale }],
  ['draw share 0.27 -> 0.28', { share: 0.28 }],
  ['draw share that falls with the gap (table-v1\'s form) on table-v2\'s other constants', { share: V1.share, decay: V1.decay }],
  ['every table-v1 constant, including the falling draw share (what the pre-registered script\'s old comparison now reports)', { ...V1 }],
  ['goal-difference weight 0.25 -> 0.26', { wGd: 0.26 }],
  ['goals-for weight 0.10 -> 0.11', { wGf: 0.11 }],
  ['home and away swapped in the gap', { flip: true }],
  ['home advantage added after the scale instead of before it', { homeAfter: true }],
  ['the draw folded into the away side (away = 1 - home)', { foldDraw: true }],
  ['home advantage + 1e-9 (the smallest break tried)', { home: D.home + 1e-9 }],
  ['draw share + 1e-9 (the smallest break tried)', { share: D.share + 1e-9 }],
]
let caught = 0
for (const [label, over] of BREAKS) {
  const w = maxDiff(build({ ...D, ...over }))
  const red = w > TOL
  if (red) caught++
  check(`broken twin is caught: ${label}`, red, `max abs difference ${w.toExponential(2)}`)
}
check('every deliberately wrong twin was caught', caught === BREAKS.length && BREAKS.length === 14, `${caught} of ${BREAKS.length}`)

// ---- result -------------------------------------------------------------------------------------------------------------------------
const bad = results.filter(r => !r.ok)
const coverage = `${replay.length + tableNow.length + tableFinal.length} real pairs (${replay.length} replayed 2024-25 forecasts + ${tableNow.length} from the 2026-11-08 table + ${tableFinal.length} from the 2024-25 final table), ${synthetic.length} synthetic pairs; 2025-26 not covered (raw files not in the repository)`
console.log('')
if (bad.length === 0) console.log(`ORACLE HOLDS: ${results.length} of ${results.length} checks; coverage: ${coverage}`)
else { console.log(`ORACLE FAILED: ${bad.length} of ${results.length} checks red: ${bad.map(b => b.name).join(' | ')}; coverage: ${coverage}`) }
process.exit(bad.length === 0 ? 0 : 1)
