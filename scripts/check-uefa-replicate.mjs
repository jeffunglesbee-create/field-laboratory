#!/usr/bin/env node
// Checks for scripts/uefa-replicate-run.mjs and for the decide() / look2Gate() of the rule file outbox/forecast-replicate-uefa-2026-11-28.mjs. They run on SYNTHETIC seasons and on two committed known answers; they never touch 2024-25 data.
//   KNOWN ANSWER A: the 2026-11-27 fit's frozen-bundle result (outbox/forecast-fit-uefa-result-2026-11-27.json, produced by the earlier tooling's prepare()): n 90, Brier U, Brier base, mean D and z, to 1e-9.
//   KNOWN ANSWER B: the 2025-26 rows give 234 eligible forecasts with outcome counts (122, 43, 69), the base rate's own source, and every gap equals the earlier tooling's.
//   SYNTHETIC SEASONS go through the REAL collector (a stubbed ESPN) into a bundle, then through every G3 check, then through run(): a defect of each kind must fail exactly its own check, and the scoring function must then be unreachable.
// Rule 90: scripts/mutate-uefa-replicate.mjs breaks the tooling and the rule's decide() and look2Gate() one defect at a time and requires this script to go red.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { collect } from './uefa-replication-data.mjs'
import { synthEvents as synthEv2, bundleOf as bundleOf2 } from './uefa-replicate-synth.mjs'
import { RULE, decide, stopVerdict, look2Gate, ruleBlockSha256, ruleBlock, MARKER_LINES, blockOf, evaluateBlock } from './uefa-replicate-score.mjs'
import * as RM from '../outbox/forecast-replicate-uefa-2026-11-28.mjs'
import * as T from './uefa-replicate-run.mjs'
import { homeSlope as oldSlope, prepare as oldPrepare, CLUB_ALIASES } from '../outbox/forecast-fit-uefa-2026-11-27.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
let n = 0, bad = 0
const check = (name, cond, detail = '') => { n++; if (cond) console.log(`  ok   ${name}`); else { bad++; console.log(`  FAIL ${name}${detail ? '\n       ' + detail : ''}`) } }
const close = (a, b, tol = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol
const readJson = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))
const canon = c => CLUB_ALIASES[c] ?? c
const addDays0 = (d, k) => new Date(Date.parse(d + 'T00:00:00Z') + k * 86400000).toISOString().slice(0, 10)
const aliasRows = rows => rows.map(r => ({ ...r, home: canon(r.home), away: canon(r.away) }))

// ---- KNOWN ANSWER A and B -------------------------------------------------------------------------------------------------------------------------------------
console.log('known answers')
const result = readJson('outbox/forecast-fit-uefa-result-2026-11-27.json').an
const frozenRows = aliasRows(readJson('outbox/forecast-uefa-data-2026-27-frozen-2026-11-27.json').rows)
const fz = T.scoreForecasts(T.forecastsOf(frozenRows).filter(f => f.eligible))
check('A: the frozen 2026-27 bundle gives n 90 eligible forecasts', fz.n === result.forwardN, `${fz.n}`)
check('A: Brier U equals the earlier result', close(fz.brierU, result.forwardBrierU), `${fz.brierU} vs ${result.forwardBrierU}`)
check('A: Brier of the base rate equals the earlier result', close(fz.brierBase, result.forwardBrierBase), `${fz.brierBase} vs ${result.forwardBrierBase}`)
check('A: mean D equals the earlier result', close(fz.meanD, result.forwardDiff), `${fz.meanD} vs ${result.forwardDiff}`)
check('A: z equals the earlier result', close(fz.z, result.forwardZ), `${fz.z} vs ${result.forwardZ}`)
const trainRows = aliasRows(readJson('outbox/forecast-uefa-data-2025-26-2026-11-27.json').rows)
const trainAll = T.forecastsOf(trainRows), trainElig = trainAll.filter(f => f.eligible)
check('B: the 2025-26 rows give 234 eligible forecasts', trainElig.length === RULE.baseN, `${trainElig.length}`)
check('B: their outcome counts are the base rate\'s (122, 43, 69)', JSON.stringify([0, 1, 2].map(k => trainElig.filter(f => f.y === k).length)) === JSON.stringify(RULE.baseCounts), JSON.stringify([0, 1, 2].map(k => trainElig.filter(f => f.y === k).length)))
const lpTrain = T.leaguePhaseRows(trainRows)
check('B: the counting rule finds 144 / 144 / 108 league-phase matches, 36 clubs each, every club on N', JSON.stringify(T.LABELS.map(l => lpTrain.perLabel[l])) === '[144,144,108]' && T.LABELS.every(l => lpTrain.distinctClubs[l] === 36) && lpTrain.clubsNotOnN.length === 0, JSON.stringify(lpTrain.perLabel))
{
  // both clubs, not either: a club that has played its N events plays a ninth against a club that has played none
  const mkRow = (i, h, a) => ({ id: `x${i}`, sport: 'UEFA Champions League', date: addDays0('2024-10-01', i), home: h, away: a, home_score: 1, away_score: 0, start_time: `${addDays0('2024-10-01', i)}T20:00Z`, espn_event_id: String(100 + i), phase: 'league-phase', status: 'STATUS_FULL_TIME' })
  const rows = [...Array.from({ length: 8 }, (_, i) => mkRow(i, 'X', `P${i}`)), mkRow(9, 'X', 'Q')]
  const lp = T.leaguePhaseRows(rows), fc = T.forecastsOf(rows)
  check('the counting rule needs BOTH clubs under N: the ninth event of a club that has played 8 is not a league-phase match, though its opponent has played none', lp.perLabel['UEFA Champions League'] === 8 && !lp.rows.some(r => r.espn_event_id === '109') && fc.length === 8 && T.eligibilityCounts(rows)['UEFA Champions League'].leaguePhase === 8, `${lp.perLabel['UEFA Champions League']} league-phase, ${fc.length} forecasts`)
}
const old = oldPrepare(trainRows).matches
const key = f => `${f.label}|${f.date}|${f.gH ?? ''}|${f.y}|${Number.isFinite(f.gap) ? f.gap.toFixed(10) : 'NaN'}`
const mine = trainAll.map(f => key({ ...f, gH: undefined }))
const theirs = old.map(f => key({ ...f, gH: undefined }))
check('B: every forecast (gap, outcome, eligibility) equals the earlier tooling\'s prepare()', mine.length === theirs.length && JSON.stringify(mine.slice().sort()) === JSON.stringify(theirs.slice().sort()), `${mine.length} vs ${theirs.length}`)
const slInput = trainElig.map(f => T.probs(f.gap)[0]), slY = trainElig.map(f => (f.y === 0 ? 1 : 0))
const s1 = T.homeSlope(slInput, slY), s0 = oldSlope(slInput, slY)
check('B: the home-win slope and its standard error equal the earlier implementation\'s on the 2025-26 forecasts (to 1e-11 and 1e-10: a loose stopping rule leaves 5e-10)', close(s1.slope, s0.slope, 1e-11) && close(s1.se, s0.se, 1e-10), `${s1.slope}/${s1.se} vs ${s0.slope}/${s0.se}`)

{
  const sc = T.scoreForecasts(trainElig)
  { const one = T.homeSlope(slInput, slY, 1), full = T.homeSlope(slInput, slY)
  check('an iteration cap reached before the step falls below 1e-12 gives NaN (the slope did not converge), where the full cap converges to a finite slope', Number.isNaN(one.slope) && Number.isNaN(one.se) && Number.isFinite(full.slope) && Number.isFinite(full.se), JSON.stringify([one, full]))
  const sing = T.homeSlope([0.5, 0.5, 0.5, 0.5], [1, 0, 1, 0])
  check('a singular information matrix (every forecast the same) never converges: the slope and its standard error are NaN, so G2 fails', Number.isNaN(sing.slope) && Number.isNaN(sing.se), JSON.stringify(sing)) }
check('B: scoreForecasts() returns the earlier implementation\'s slope and standard error for the 2025-26 forecasts (home wins as the event)', close(sc.slope, s0.slope, 1e-11) && close(sc.slopeSE, s0.se, 1e-10), `${sc.slope}/${sc.slopeSE} vs ${s0.slope}/${s0.se}`)
  const bBase = RULE.baseCounts.map(c => c / RULE.baseN), sq = (p, y) => p.reduce((t, v, k) => t + (v - (k === y ? 1 : 0)) ** 2, 0)
  const cellZ = l => { const D = trainElig.filter(f => f.label === l).map(f => sq(T.probs(f.gap), f.y) - sq(bBase, f.y)); const m = D.reduce((t, v) => t + v, 0) / D.length; return m / (Math.sqrt(D.reduce((t, v) => t + (v - m) ** 2, 0) / (D.length - 1)) / Math.sqrt(D.length)) }
  check('B: each competition cell\'s z is that competition\'s own paired z (recomputed here), and the three cells differ', sc.folds.every(f => close(f.z, cellZ(f.name), 1e-12)) && new Set(sc.folds.map(f => f.z)).size === 3, JSON.stringify(sc.folds.map(f => [f.name, f.n, f.z])))
}

// ---- the rule's decide() and look2Gate() against an oracle written from the rule's TEXT ------------------------------------------------------------------------
console.log('decide() and look2Gate()')
const fin = v => typeof v === 'number' && Number.isFinite(v)
const NAMES = ['UEFA Champions League', 'UEFA Europa League', 'UEFA Europa Conference League']
const oracleDecide = (look, m) => {
  if (look !== 1 && look !== 2) return 'NO VERDICT'
  if (m === null || typeof m !== 'object') return 'NO VERDICT'
  if (m.integrityOk !== true) return 'STOPPED AT G3'
  if (!fin(m.z)) return 'NO VERDICT'
  const b = look === 1 ? -2.241402728 : -1.780464342
  if (m.z > b) return look === 1 ? 'CONTINUE TO LOOK 2' : 'DO NOT BUILD'
  const g1 = Array.isArray(m.folds) && m.folds.length === 3 && NAMES.every(n => m.folds.filter(f => f !== null && typeof f === 'object' && f.name === n).length === 1) && m.folds.every(f => f !== null && typeof f === 'object' && fin(f.z) && f.z <= 1.0)
  const g2 = fin(m.slope) && fin(m.slopeSE) && m.slopeSE > 0 && Math.abs(m.slope - 1) <= 1.96 * m.slopeSE
  return g1 && g2 ? 'BUILD' : 'DO NOT BUILD'
}
const cells = (z1, z2, z3) => [{ name: NAMES[0], z: z1 }, { name: NAMES[1], z: z2 }, { name: NAMES[2], z: z3 }]
let gridBad = 0, gridN = 0
for (const look of [0, 1, 2, 3, '1', null, undefined])
  for (const integrityOk of [true, false, 'yes'])
    for (const z of [-3, -2.241402728, -2.2414, -2.24, -1.780464342, -1.78, 0, 1e9, NaN, Infinity, -Infinity, '-3', null])
      for (const folds of [cells(0, 0, 0), cells(1.0, 1.0, 1.0), cells(1.0000001, 0, 0), cells(-5, -5, NaN), cells(0, 0, Infinity), cells(0, 0, null), [{ z: 0 }, { z: 0 }], null, [null, null, null], [], [{ name: NAMES[0], z: 0 }, { name: NAMES[0], z: 0 }, { name: NAMES[0], z: 0 }], [{ z: 0 }, { z: 0 }, { z: 0 }], [{ name: NAMES[0], z: 0 }, { name: NAMES[1], z: 0 }, { name: 'UEFA Super Cup', z: 0 }], cells(0, 0, 0).concat([{ name: 'UEFA Super Cup', z: 0 }])])
        for (const [slope, slopeSE] of [[1, 0.2], [1.392, 0.2], [1.3921, 0.2], [0.608, 0.2], [1, 0], [1, -1], [NaN, 0.2], [1, NaN], [Infinity, 1], [1, Infinity], ['1', 0.2], [null, null]]) {
          const m = { integrityOk, z, folds, slope, slopeSE }
          let got; try { got = decide(look, m).verdict } catch (e) { got = 'THROWS ' + e.message }
          gridN++; if (got !== oracleDecide(look, m)) { gridBad++; if (gridBad <= 3) console.log(`       decide(${JSON.stringify(look)}, ${JSON.stringify(m)}) = ${got}, oracle ${oracleDecide(look, m)}`) }
        }
check(`decide() agrees with the oracle on all ${gridN} grid inputs, none throws`, gridBad === 0, `${gridBad} differ`)
check('decide() at the boundary: z equal to z1 or z2 crosses; one ulp above does not', decide(1, { integrityOk: true, z: -2.241402728, folds: cells(0, 0, 0), slope: 1, slopeSE: 0.2 }).verdict === 'BUILD' && decide(1, { integrityOk: true, z: -2.241402727999, folds: cells(0, 0, 0), slope: 1, slopeSE: 0.2 }).verdict === 'CONTINUE TO LOOK 2' && decide(2, { integrityOk: true, z: -1.780464342, folds: cells(0, 0, 0), slope: 1, slopeSE: 0.2 }).verdict === 'BUILD' && decide(2, { integrityOk: true, z: -1.780464341999, folds: cells(0, 0, 0), slope: 1, slopeSE: 0.2 }).verdict === 'DO NOT BUILD', '')
check('the rule loader executes the BLOCK text: the unhashed tail of the rule file (anything after the end marker, and the file\'s own exports) is never what the verdict runs through; the loaded RULE, decide, stopVerdict and look2Gate equal the file module\'s exports', (() => {
  const tamper = fs.readFileSync(path.join(ROOT, 'outbox/forecast-replicate-uefa-2026-11-28.mjs'), 'utf8') + '\nRULE.look1.z = -1.5\nRULE.constants.share = 0.2\n'
  const e = evaluateBlock(blockOf(tamper))
  return e.RULE.look1.z === -2.241402728 && e.RULE.constants.share === 0.18 && blockOf(tamper) === ruleBlock && JSON.stringify(RM.RULE) === JSON.stringify(RULE) && RM.decide.toString() === decide.toString() && RM.stopVerdict.toString() === stopVerdict.toString() && RM.look2Gate.toString() === look2Gate.toString() && RM.ruleBlockSha256 === ruleBlockSha256
})(), '')
const validDate = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d + 'T00:00:00Z')) && new Date(Date.parse(d + 'T00:00:00Z')).toISOString().slice(0, 10) === d
const oracleGate = (today, s) => {
  if (!validDate(today)) return 'THROWS'
  if (s === null || typeof s !== 'object') return 'INERT'
  const count = v => (v === undefined ? 0 : Number.isInteger(v) && v >= 0 ? v : null), flag = v => (v === undefined ? false : typeof v === 'boolean' ? v : null)
  const stops = count(s.look2Stops), repairs = count(s.look2Repairs), committed = flag(s.look2VerdictCommitted), recomputed = flag(s.look1RecomputeAgrees), allOnN = flag(s.allClubsOnN)
  if ([stops, repairs, committed, recomputed, allOnN].includes(null)) return 'THROWS'
  if (s.look1Verdict !== 'CONTINUE TO LOOK 2' || !recomputed) return 'INERT'
  if (committed) return 'DONE'
  if (today > '2027-02-15') return 'NO VERDICT'
  if (stops > 2) return 'NO VERDICT'
  if (stops > repairs) return 'WAIT'
  return allOnN ? 'RUN' : 'WAIT'
}
let gBad = 0, gN = 0
const gateOf = (today, s) => { try { return look2Gate(today, s) } catch { return 'THROWS' } }
for (const today of ['2026-12-01', '2027-02-14', '2027-02-15', '2027-02-16', '2027-03-01', '2027-2-3', '2027-02-30', '2027-13-01', '2027-02-15T10:00:00Z', '', null, undefined, 20270215])
  for (const look1Verdict of ['CONTINUE TO LOOK 2', 'BUILD', 'NO VERDICT', undefined])
    for (const look2VerdictCommitted of [true, false, undefined, 'true'])
      for (const allClubsOnN of [true, false, undefined, 1])
        for (const [look2Stops, look2Repairs, look1RecomputeAgrees] of [[0, 0, true], [1, 0, true], [1, 1, true], [2, 1, true], [2, 2, true], [3, 3, true], [undefined, undefined, true], [1.5, 0, true], ['1', 0, true], [-1, 0, true], [0, 0, false], [0, 0, undefined], [0, 0, 'yes'], [2, 2, false]])
          for (const s of [{ look1Verdict, look1RecomputeAgrees, look2VerdictCommitted, allClubsOnN, look2Stops, look2Repairs }, null, undefined]) { gN++; if (gateOf(today, s) !== oracleGate(today, s)) { gBad++; if (gBad <= 3) console.log(`       look2Gate(${JSON.stringify(today)}, ${JSON.stringify(s)}) = ${gateOf(today, s)}, oracle ${oracleGate(today, s)}`) } }
check(`look2Gate() agrees with the oracle on all ${gN} inputs (a malformed date, count or flag throws; INERT without a CONTINUE verdict and an agreeing recomputation; a stop without a repair record waits; the third stop is NO VERDICT)`, gBad === 0, `${gBad} differ`)
const okState = { look1Verdict: 'CONTINUE TO LOOK 2', look1RecomputeAgrees: true, allClubsOnN: true }
check('look2Gate(): the deadline day itself still runs, the day after is NO VERDICT; a repair pending on the deadline day waits; a Look 1 BUILD or one whose recomputation disagrees is INERT after the deadline too', look2Gate('2027-02-15', okState) === 'RUN' && look2Gate('2027-02-16', okState) === 'NO VERDICT' && look2Gate('2027-02-15', { ...okState, look2Stops: 1, look2Repairs: 0 }) === 'WAIT' && look2Gate('2027-03-01', { ...okState, look1Verdict: 'BUILD' }) === 'INERT' && look2Gate('2027-03-01', { ...okState, look1RecomputeAgrees: false }) === 'INERT', '')
check('stopVerdict(): the first two stops are STOPPED AT G3, the third and later are NO VERDICT; a non-positive or non-integer count throws', stopVerdict(1) === 'STOPPED AT G3' && stopVerdict(2) === 'STOPPED AT G3' && stopVerdict(3) === 'NO VERDICT' && stopVerdict(4) === 'NO VERDICT' && [0, -1, 1.5, '1', NaN, undefined].every(v => { try { stopVerdict(v); return false } catch { return true } }), '')
check('the rule constants the tooling relies on are the rule\'s text: boundaries, base counts, N, K, constants', RULE.look1.z === -2.241402728 && RULE.look2.z === -1.780464342 && JSON.stringify(RULE.baseCounts) === '[122,43,69]' && RULE.baseN === 234 && RULE.K === 3 && JSON.stringify(Object.values(RULE.N)) === '[8,8,6]' && RULE.constants.home === 1.34 && RULE.constants.scale === 1.97 && RULE.constants.share === 0.18 && RULE.weights.gd === 0.25 && RULE.weights.gf === 0.1, '')
check('the rule file\'s marker lines each occur once', MARKER_LINES.begin === 1 && MARKER_LINES.end === 1, JSON.stringify(MARKER_LINES))

// ---- synthetic seasons through the REAL collector -------------------------------------------------------------------------------------------------------------
console.log('synthetic seasons')
const prng = seed => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
const poisson = (rnd, m) => { const L = Math.exp(-m); let k = 0, p = 1; do { k++; p *= rnd() } while (p > L); return k - 1 }
const addDays = (d, k) => new Date(Date.parse(d + 'T00:00:00Z') + k * 86400000).toISOString().slice(0, 10)
const COMPS = [{ slug: 'uefa.champions', N: 8 }, { slug: 'uefa.europa', N: 8 }, { slug: 'uefa.europa.conf', N: 6 }]
/** ESPN-shaped events of one synthetic season: `starts[c]` and `spacing[c]` give each competition's matchday dates; `knockout` adds 45 events after the league phase (some AET or PEN). */
function synthEvents({ seed, starts, spacing, knockout, teamOf = (c, i) => (c + 1) * 100 + i }) {
  const rnd = prng(seed), ev = []
  let id = seed * 1000
  const mk = (c, date, hh, h, a, status, phase) => { const hg = poisson(rnd, 1.4), ag = poisson(rnd, 1.1); ev.push({ slug: COMPS[c].slug, day: date, e: { id: String(++id), date: `${date}T${hh}Z`, season: { slug: phase }, competitions: [{ status: { type: { name: status, completed: true } }, competitors: [{ homeAway: 'home', team: { id: String(teamOf(c, h)), shortDisplayName: `T${h}` }, score: String(hg) }, { homeAway: 'away', team: { id: String(teamOf(c, a)), shortDisplayName: `T${a}` }, score: String(ag) }] }] } }) }
  for (const [c, { N }] of COMPS.entries()) {
    for (let md = 0; md < N; md++) {
      const order = Array.from({ length: 36 }, (_, i) => i + 1).map(v => [rnd(), v]).sort((x, y) => x[0] - y[0]).map(x => x[1])
      for (let j = 0; j < 18; j++) { const [h, a] = rnd() < 0.5 ? [order[2 * j], order[2 * j + 1]] : [order[2 * j + 1], order[2 * j]]; mk(c, addDays(starts[c], spacing[c] * md), j < 9 ? '17:45' : '20:00', h, a, 'STATUS_FULL_TIME', 'league-phase') }
    }
    if (knockout) for (let k = 0; k < 45; k++) mk(c, addDays('2025-02-10', 2 * k), '20:00', (k % 36) + 1, ((k + 7) % 36) + 1, k % 9 === 0 ? 'STATUS_FINAL_AET' : k % 15 === 0 ? 'STATUS_FINAL_PEN' : 'STATUS_FULL_TIME', 'knockout-round-playoffs')
  }
  return ev
}
const stub = events => { const by = new Map(); for (const x of events) { const k = `${x.slug}|${x.day.replaceAll('-', '')}`; by.set(k, [...(by.get(k) ?? []), x.e]) } return async url => { const m = url.match(/soccer\/([^/]+)\/scoreboard\?dates=(\d{8})/); return { status: 200, json: async () => ({ events: by.get(`${m[1]}|${m[2]}`) ?? [] }) } } }
const bundleOf = async (events, from, to) => { const r = await collect({ from, to, get: stub(events) }); if (!r.bundle) throw new Error(r.stopped); const text = JSON.stringify(r.bundle, null, 1) + '\n'; return { bundle: r.bundle, text } }
const S24 = await bundleOf(synthEvents({ seed: 24, starts: ['2024-09-17', '2024-09-19', '2024-09-26'], spacing: [14, 14, 14], knockout: true }), RULE.look1.from, RULE.look1.to)
const ctx24 = (text, bundle) => ({ text, committedBundleSha: T.sha256(S24.text), window: RULE.look1, expect: RULE.expected2024, expectEligible: RULE.expectedEligible2024 })
const base24 = T.integrityChecks(S24.bundle, ctx24(S24.text))
check('the REAL collector turns the synthetic 2024-25 season into a bundle with 531 completed events (189 / 189 / 153)', S24.bundle.counts.rows === 531 && T.LABELS.every((l, i) => S24.bundle.counts.tallies[l].completed === [189, 189, 153][i]), JSON.stringify(S24.bundle.counts.byLabel))
check('G3 (a) to (m) all pass on the clean synthetic season', base24.every(c => c.ok), base24.filter(c => !c.ok).map(c => c.name).join(' | '))
check('every letter of the rule\'s G3 appears among the checks: a, c to j, l and m here, b in ruleChecks, k at Look 2', 'acdefghijlm'.split('').every(ch => base24.some(c => c.name.startsWith(`(${ch})`))) && T.ruleChecks(ruleBlockSha256).every(c => c.name.startsWith('(b)')), base24.map(c => c.name[1]).join(''))
const L1 = T.forecastsOf(S24.bundle.rows).filter(f => f.eligible)
check('synthetic Look 1: 234 eligible forecasts of 396 league-phase matches (the same shape as 2025-26)', L1.length === 234, String(L1.length))
{
  const op = T.openingMatches(S24.bundle.rows), sc = T.scoreForecasts(L1)
  const perB = l => { const e = L1.filter(f => f.label === l), sq = (p, y) => p.reduce((t, v, k) => t + (v - (k === y ? 1 : 0)) ** 2, 0), bb = RULE.baseCounts.map(c => c / RULE.baseN); return [e.reduce((t, f) => t + sq(T.probs(f.gap), f.y), 0) / e.length, e.reduce((t, f) => t + sq(bb, f.y), 0) / e.length] }
  check('REPORTED: the opening matches (league-phase matches that get no forecast) are counted per competition, and each competition cell carries its own Brier of U and of the base rate', JSON.stringify(Object.values(op)) === '[54,54,54]' && sc.folds.every(f => close(f.brierU, perB(f.name)[0], 1e-12) && close(f.brierBase, perB(f.name)[1], 1e-12)), JSON.stringify([op, sc.folds.map(f => [f.brierU, f.brierBase])]))
}
let calls = 0
const ok1 = T.run(1, base24, () => { calls++; return { stats: T.scoreForecasts(L1), reported: T.reported(L1) } })
check('run(): with G3 passed the scoring is called once and a verdict from the rule\'s table is returned', calls === 1 && ok1.scored === true && ['BUILD', 'DO NOT BUILD', 'CONTINUE TO LOOK 2'].includes(ok1.verdict) && ok1.verdict === decide(1, { integrityOk: true, z: ok1.stats.z, folds: ok1.stats.folds, slope: ok1.stats.slope, slopeSE: ok1.stats.slopeSE }).verdict, JSON.stringify(ok1.verdict))
check('the scored statistic is the paired z of the rule on these forecasts (recomputed here from the definition)', (() => { const D = L1.map(f => { const p = T.probs(f.gap); const b = [122, 43, 69].map(c => c / 234); const sq = (q) => q.reduce((s, v, k) => s + (v - (k === f.y ? 1 : 0)) ** 2, 0); return sq(p) - sq(b) }); const m = D.reduce((s, v) => s + v, 0) / D.length; const sd = Math.sqrt(D.reduce((s, v) => s + (v - m) ** 2, 0) / (D.length - 1)); return close(ok1.stats.z, m / (sd / Math.sqrt(D.length)), 1e-12) })(), `${ok1.stats.z}`)
check('the forecasts are independent of the row order of the bundle (the rule\'s order is applied by the tooling)', (() => { const sh = S24.bundle.rows.slice().reverse(); const z2 = T.scoreForecasts(T.forecastsOf(sh).filter(f => f.eligible)).z; return close(z2, ok1.stats.z, 1e-12) })(), '')

// each defect fails exactly its own check, and the scoring function is then unreachable
const clone = () => JSON.parse(JSON.stringify(S24.bundle))
const firstLp = (b, label = 'UEFA Champions League') => b.rows.find(r => r.sport === label && r.phase === 'league-phase')
const DEFECTS = [
  ['(a) the committed sha differs from the file', () => { const b = clone(); return { b, ctx: { ...ctx24(S24.text), committedBundleSha: '0'.repeat(64) } } }, /^\(a\)/],
  ['(a) the file was changed after its commit (one byte)', () => { const b = clone(); return { b, ctx: { ...ctx24(S24.text + ' ') } } }, /^\(a\)/],
  ['(c) a completed event missing from the tally', () => { const b = clone(); b.counts.tallies['UEFA Champions League'].completed = 188; return { b } }, /^\(c\)/],
  ['(e) a league-phase row dropped (two clubs left on 7)', () => { const b = clone(); const r = firstLp(b); b.rows.splice(b.rows.indexOf(r), 1); b.counts.rows--; return { b } }, /^\(e\) every club/],
  ['(d) the expected league-phase count of one competition differs (counts themselves consistent)', () => { const b = clone(); return { b, ctx: { ...ctx24(S24.text), expect: { ...RULE.expected2024, leaguePhase: { ...RULE.expected2024.leaguePhase, 'UEFA Champions League': 143 } } } } }, /^\(d\) UCL/],
  ['(e) the number of distinct clubs expected differs (every club still on N)', () => { const b = clone(); return { b, ctx: { ...ctx24(S24.text), clubsPerCompetition: 35 } } }, /^\(e\) UCL: 35 distinct clubs/],
  ['(m) the expected eligible count of one competition differs (counts themselves consistent)', () => { const b = clone(); return { b, ctx: { ...ctx24(S24.text), expectEligible: { ...RULE.expectedEligible2024, 'UEFA Europa League': 91 } } } }, /^\(m\) UEL/],
  ['(e) a club that is not one of the 36', () => { const b = clone(); firstLp(b).home = '99999'; return { b } }, /^\(e\) UCL: 36 distinct clubs/],
  ['(f) duplicateEventIds stated as 1', () => { const b = clone(); b.counts.duplicateEventIds = 1; return { b } }, /^\(f\) duplicateEventIds/],
  ['(f) an espn_event_id repeated among the rows', () => { const b = clone(); b.rows[1].espn_event_id = b.rows[0].espn_event_id; return { b } }, /^\(f\) no espn_event_id/],
  ['(f) an espn_event_id that is not a string of digits', () => { const b = clone(); firstLp(b).espn_event_id = 'x12'; return { b } }, /^\(f\) no espn_event_id/],
  ['(f) counts.rows does not equal the rows', () => { const b = clone(); b.counts.rows = 530; return { b } }, /^\(f\) no espn_event_id/],
  ['(g) a completed event skipped', () => { const b = clone(); b.counts.tallies['UEFA Europa League'].skipped = 1; return { b } }, /^\(g\) UEL: no completed event skipped/],
  ['(g) one club on both sides', () => { const b = clone(); const r = firstLp(b); r.away = r.home; return { b } }, /^\(g\) no match has one club/],
  ['(g) a club with two events on one date', () => { const b = clone(); const rs = b.rows.filter(r => r.sport === 'UEFA Champions League' && r.phase === 'league-phase' && r.date === '2024-09-17'); rs[1].home = rs[0].home; return { b } }, /^\(g\) no club has two/],
  ['(h) a league-phase match with an extra-time status', () => { const b = clone(); firstLp(b).status = 'STATUS_FINAL_AET'; return { b } }, /^\(h\)/],
  ['(h) a league-phase match with no status', () => { const b = clone(); firstLp(b).status = null; return { b } }, /^\(h\)/],
  ['(i) a null score in a league-phase match', () => { const b = clone(); firstLp(b).home_score = null; return { b } }, /^\(i\)/],
  ['(j) dateMismatch stated as 1', () => { const b = clone(); b.counts.tallies['UEFA Europa Conference League'].dateMismatch = 1; return { b } }, /^\(j\) UECL: dateMismatch/],
  ['(j) a row dated three days from its start (recomputed from the rows)', () => { const b = clone(); firstLp(b).date = addDays(firstLp(b).date, -3); return { b } }, /^\(j\) the requested day/],
  ['(j) a start_time with no Z or explicit offset', () => { const b = clone(); firstLp(b).start_time = `${firstLp(b).date}T19:00`; return { b } }, /^\(j\) the requested day/],
  ['(j) a start_time that does not parse', () => { const b = clone(); firstLp(b).start_time = 'garbage'; return { b } }, /^\(j\) the requested day/],
  ['(l) a row without the status field', () => { const b = clone(); delete firstLp(b).status; return { b } }, /^\(l\) the bundle's fields list/],
  ['(l) the fields list is not FIELDS', () => { const b = clone(); b.fields = b.fields.slice(0, -1); return { b } }, /^\(l\) the bundle's fields list/],
  ['(l) daysRead is not the window\'s', () => { const b = clone(); b.daysRead = 302; return { b } }, /^\(l\) the bundle's from/],
  ['(l) a read that answered something other than 200', () => { const b = clone(); b.statuses = { 200: 908, 500: 1 }; return { b } }, /^\(l\) the bundle's from/],
  ['(l) a window that starts a day late', () => { const b = clone(); b.from = '2024-09-02'; return { b } }, /^\(l\) the bundle's from/],
]
for (const [name, make, re] of DEFECTS) {
  const { b, ctx } = make(), text = JSON.stringify(b, null, 1) + '\n'
  const checks = T.integrityChecks(b, ctx ?? { ...ctx24(S24.text), text: S24.text })
  const failed = checks.filter(c => !c.ok)
  let called = 0
  const r = T.run(1, checks, () => { called++; return { stats: T.scoreForecasts(L1), reported: T.reported(L1) } })
  const txt = T.reportText(1, r, { counts: checks.counts })
  const r3 = T.run(1, checks, () => { called++; return { stats: T.scoreForecasts(L1), reported: T.reported(L1) } }, null, 3)
  check(`G3 defect ${name}: its own check fails, the first stop is STOPPED AT G3 and the third NO VERDICT, the scoring is not called, nothing outcome-bearing is printed`, failed.some(c => re.test(c.name)) && r.verdict === 'STOPPED AT G3' && r3.verdict === 'NO VERDICT' && r.scored === false && called === 0 && !('stats' in r) && !('reported' in r) && !/\bz [-0-9]|Brier U|mean D|log loss/.test(txt), `failed: ${failed.map(c => c.name).join(' | ') || 'none'}; called ${called}; ${txt.split('\n').slice(-2).join(' / ')}`)
}
// every defect must be caught by exactly the checks it is about, never by an unrelated one (a defect that trips everything proves nothing)
check('a clean bundle fails nothing in a defect-free run (control for the table above)', T.integrityChecks(S24.bundle, ctx24(S24.text)).every(c => c.ok), '')
const okGit = { headDescends: true, bundlesDescend: true, shownSha: ruleBlockSha256, blockStable: true }
const rc = T.ruleChecks(ruleBlockSha256, ruleBlockSha256, MARKER_LINES, okGit), rcBad = T.ruleChecks('0'.repeat(64), ruleBlockSha256, MARKER_LINES, okGit), rcMk = T.ruleChecks(ruleBlockSha256, ruleBlockSha256, { begin: 2, end: 1 }, okGit)
const rcShow = T.ruleChecks(ruleBlockSha256, ruleBlockSha256, MARKER_LINES, { ...okGit, shownSha: '1'.repeat(64) }), rcHead = T.ruleChecks(ruleBlockSha256, ruleBlockSha256, MARKER_LINES, { ...okGit, headDescends: false }), rcBun = T.ruleChecks(ruleBlockSha256, ruleBlockSha256, MARKER_LINES, { ...okGit, bundlesDescend: false }), rcStable = T.ruleChecks(ruleBlockSha256, ruleBlockSha256, MARKER_LINES, { ...okGit, blockStable: false })
check('G3 (b): the block\'s sha256 must equal the committed one; two BEGIN marker lines, a git-show hash that differs from the file, a RULE_COMMIT that is not an ancestor of the checkout, or of a bundle\'s commit, or a rule file whose block changed in any commit after RULE_COMMIT, each also fail', rc.every(c => c.ok) && [rcBad, rcMk, rcShow, rcHead, rcBun, rcStable].every(x => x.some(c => !c.ok)), JSON.stringify([rc, rcBad, rcMk, rcShow, rcHead, rcBun, rcStable].map(x => x.map(c => c.ok))))
const ruleText = fs.readFileSync(path.join(ROOT, 'outbox/forecast-replicate-uefa-2026-11-28.mjs'), 'utf8')
check('blockSha256Of() cuts the block of a file\'s text by the rule\'s recipe: it equals the rule file\'s own hash and the sed recipe\'s, and is null when a marker line occurs twice', T.blockSha256Of(ruleText) === ruleBlockSha256 && T.sha256(ruleBlock) === ruleBlockSha256 && T.blockSha256Of(ruleText + '\n// ==== RULE END\n') === null && T.blockSha256Of(ruleText.replace('// ==== RULE BEGIN\n', '// ==== RULE BEGIN\n// ==== RULE BEGIN\n')) === null, '')
{
  const ok = `m\nscoring sha256: ${T.scoringSha256} scripts/uefa-replicate-score.mjs\n`, bad = `m\nscoring sha256: ${'0'.repeat(64)} scripts/uefa-replicate-score.mjs\n`, two = `${ok}${ok}`
  const good = T.scoringChecks([{ path: 'p', message: ok }], { scoringSha256: T.scoringSha256 })
  check('G3 (n): the scoring module\'s sha256 must equal the one in each bundle\'s data commit message and, at Look 2, the Look 1 result\'s; a different sha, a missing line, a doubled line or another result fails', good.every(c => c.ok) && T.scoringChecks([{ path: 'p', message: bad }]).some(c => !c.ok) && T.scoringChecks([{ path: 'p', message: 'no line' }]).some(c => !c.ok) && T.scoringChecks([{ path: 'p', message: two }]).some(c => !c.ok) && T.scoringChecks([{ path: 'p', message: ok }], { scoringSha256: '1'.repeat(64) }).some(c => !c.ok), '')
  check('the commit-message parsers need EXACTLY ONE line: a second RULE block line (a quoted old hash) or a second bundle line makes the parse null', T.ruleShaFromMessage(`RULE block sha256: ${'ab'.repeat(32)}\nRULE block sha256: ${'cd'.repeat(32)}`) === null && T.bundleShaFromMessage(`bundle sha256: ${'ab'.repeat(32)} 1 bytes f\nbundle sha256: ${'cd'.repeat(32)} 1 bytes f`, 'f') === null, '')
}
check('the commit-message parsers: rule sha, bundle sha with its path', T.ruleShaFromMessage(`x\n\nRULE block sha256: ${'ab'.repeat(32)}\ny`) === 'ab'.repeat(32) && T.ruleShaFromMessage('RULE block sha256 abc') === null && T.bundleShaFromMessage(`m\nbundle sha256: ${'cd'.repeat(32)} 123 bytes outbox/f.json\n`, 'outbox/f.json') === 'cd'.repeat(32) && T.bundleShaFromMessage(`bundle sha256: ${'cd'.repeat(32)} 123 bytes outbox/other.json`, 'outbox/f.json') === null, '')

// ---- Look 2: the forward bundle from the pinned frozen rows plus synthetic forward matches; (k); the Look 1 reproduction G3b ----------------------------------------
console.log('Look 2')
const frozenDoc = readJson('outbox/forecast-uefa-data-2026-27-frozen-2026-11-27.json')
const frozenIds = new Set(frozenDoc.rows.map(r => r.espn_event_id))
const clubsOf = {}
// the archive's names carry spelling variants (37 raw names for 36 clubs in the Champions and Europa League); the fixture gives each CANONICAL club one id, as ESPN's own team ids do
for (const r of frozenDoc.rows) (clubsOf[r.sport] ??= new Set()).add(canon(r.home)).add(canon(r.away))
const teamId = new Map(); let tid = 5000
for (const r of frozenDoc.rows) for (const nm of [canon(r.home), canon(r.away)]) if (!teamId.has(r.sport + nm)) teamId.set(r.sport + nm, ++tid)
const toEvent = r => ({ slug: COMPS[T.LABELS.indexOf(r.sport)].slug, day: r.date, e: { id: r.espn_event_id, date: r.start_time, season: { slug: 'league-phase' }, competitions: [{ status: { type: { name: 'STATUS_FULL_TIME', completed: true } }, competitors: [{ homeAway: 'home', team: { id: String(teamId.get(r.sport + canon(r.home))), shortDisplayName: canon(r.home) }, score: String(r.home_score) }, { homeAway: 'away', team: { id: String(teamId.get(r.sport + canon(r.away))), shortDisplayName: canon(r.away) }, score: String(r.away_score) }] }] } })
const fwdEvents = frozenDoc.rows.map(toEvent)
{
  const rnd = prng(7); let id = 9000000
  for (const [c, { N }] of COMPS.entries()) {
    const label = T.LABELS[c], clubs = [...clubsOf[label]], played = frozenDoc.rows.filter(r => r.sport === label).length * 2 / clubs.length
    for (let md = played; md < N; md++) {
      const order = clubs.map(v => [rnd(), v]).sort((x, y) => x[0] - y[0]).map(x => x[1])
      for (let j = 0; j < 18; j++) { const hg = poisson(rnd, 1.4), ag = poisson(rnd, 1.1), date = addDays('2026-12-03', 17 * (md - played) + c); fwdEvents.push({ slug: COMPS[c].slug, day: date, e: { id: String(++id), date: `${date}T20:00Z`, season: { slug: 'league-phase' }, competitions: [{ status: { type: { name: 'STATUS_FULL_TIME', completed: true } }, competitors: [{ homeAway: 'home', team: { id: String(teamId.get(label + order[2 * j])), shortDisplayName: order[2 * j] }, score: String(hg) }, { homeAway: 'away', team: { id: String(teamId.get(label + order[2 * j + 1])), shortDisplayName: order[2 * j + 1] }, score: String(ag) }] }] } }) }
    }
  }
}
const S26 = await bundleOf(fwdEvents, RULE.look2.seasonFrom, '2027-01-20')
const frozenText = fs.readFileSync(path.join(ROOT, 'outbox/forecast-uefa-data-2026-27-frozen-2026-11-27.json'), 'utf8')
const ctx26 = (bundle, text, over = {}) => ({ text, committedBundleSha: T.sha256(text), window: { from: RULE.look2.seasonFrom, to: bundle.to }, expect: { leaguePhase: RULE.expected2024.leaguePhase }, expectForwardEligible: RULE.forwardEligible, frozen: { sha: T.sha256(frozenText), ids: frozenIds, rows: frozenDoc.rows }, ...over })
const base26 = T.integrityChecks(S26.bundle, ctx26(S26.bundle, S26.text))
check('the forward bundle (252 real frozen ids + synthetic forward matches) passes G3 (a) to (m) including (k)', base26.every(c => c.ok) && base26.some(c => c.name.startsWith('(k)')), base26.filter(c => !c.ok).map(c => `${c.name} [${c.detail}]`).join(' | '))
const lp26 = T.leaguePhaseRows(S26.bundle.rows)
check('every club of the forward bundle has exactly N league-phase matches (396 in all)', T.LABELS.every((l, i) => lp26.perLabel[l] === [144, 144, 108][i]) && lp26.clubsNotOnN.length === 0, JSON.stringify(lp26.perLabel))
const frozenSum = T.forecastsOf(S26.bundle.rows).filter(f => f.eligible && f.date <= RULE.look2.frozenThrough).length
check('the frozen part has 252 league-phase matches and the forward part 144', S26.bundle.rows.filter(r => r.date <= RULE.look2.frozenThrough).length === 252 && S26.bundle.rows.filter(r => r.date >= RULE.look2.forwardFrom).length === 144, `${frozenSum}`)
const L2fwd = T.forecastsOf(S26.bundle.rows).filter(f => f.eligible && f.date >= RULE.look2.forwardFrom)
check('only forward matches are scored at Look 2, and the pooled set is Look 1 first, then forward', L2fwd.length > 0 && L2fwd.every(f => f.date >= '2026-11-27'), String(L2fwd.length))
const kBad = (over, re) => { const c = T.integrityChecks(S26.bundle, ctx26(S26.bundle, S26.text, over)); return c.some(x => !x.ok && re.test(x.name)) }
{ const b = JSON.parse(JSON.stringify(S26.bundle)); const r = b.rows.find(x => x.date <= '2026-11-26'); r.home_score = r.home_score + 1
  const t = JSON.stringify(b, null, 1) + '\n', c = T.integrityChecks(b, ctx26(b, t, { committedBundleSha: T.sha256(t) }))
  check('(k) a frozen match whose home score differs in the fresh read from the pinned bundle fails (the fresh read would govern the ratings)', c.some(x => !x.ok && /^\(k\) every frozen match/.test(x.name)), '')
  const r2 = JSON.parse(JSON.stringify(S26.bundle)); r2.rows.find(x => x.date <= '2026-11-26').start_time = '2026-01-01T00:00Z'
  const t2 = JSON.stringify(r2, null, 1) + '\n', c2 = T.integrityChecks(r2, ctx26(r2, t2, { committedBundleSha: T.sha256(t2) }))
  check('(k) a frozen match whose start time differs fails', c2.some(x => !x.ok && /^\(k\) every frozen match/.test(x.name)), '') }
check('(m) the forward eligible count must be the expected one', kBad({ expectForwardEligible: 143 }, /^\(m\) the forward matches/), '')
check('(k) a wrong frozen-bundle sha fails', kBad({ frozen: { sha: '0'.repeat(64), ids: frozenIds } }, /^\(k\) the frozen bundle file/), '')
const idsMinus = new Set([...frozenIds].slice(1)), idsPlus = new Set([...frozenIds, 'x1'])
check('(k) one frozen id missing from the pinned set, or one extra, fails the id-set equality', kBad({ frozen: { sha: T.sha256(frozenText), ids: idsMinus } }, /^\(k\) the frozen part/) && kBad({ frozen: { sha: T.sha256(frozenText), ids: idsPlus } }, /^\(k\) the frozen part/), '')
{ const b = JSON.parse(JSON.stringify(S26.bundle)); const i = b.rows.findIndex(r => r.date >= '2026-12-01'); b.rows.splice(i, 1); b.counts.rows--
  const c = T.integrityChecks(b, ctx26(b, JSON.stringify(b, null, 1) + '\n', { committedBundleSha: T.sha256(JSON.stringify(b, null, 1) + '\n') }))
  check('(d)/(e) a forward match missing (a club short of N) fails at Look 2', c.some(x => !x.ok && /^\((d|e)\)/.test(x.name)), '') }
{ const b = JSON.parse(JSON.stringify(S26.bundle)); const r = b.rows.find(x => x.date <= '2026-11-26'); r.espn_event_id = 'changed'
  const c = T.integrityChecks(b, ctx26(b, JSON.stringify(b, null, 1) + '\n', { committedBundleSha: T.sha256(JSON.stringify(b, null, 1) + '\n') }))
  check('(k) a frozen match with another event id in the read fails the equality', c.some(x => !x.ok && /^\(k\) the frozen part/.test(x.name)), '') }
// (l) the forward bundle's `to` against the run date
{
  const tc = (runDate, over) => { const b = over ?? S26.bundle; return T.integrityChecks(b, ctx26(b, S26.text, { runDate })).filter(x => /^\(l\) the forward bundle/.test(x.name)) }
  const early = JSON.parse(JSON.stringify(S26.bundle)); early.to = '2026-11-20'
  check('(l) the forward bundle\'s `to` must be on or after 2026-11-27 and not after the run date (UTC): a `to` after the run date, or before the first forward day, fails', tc('2027-01-20')[0]?.ok === true && tc('2027-01-19')[0]?.ok === false && tc('2027-01-25', early)[0]?.ok === false, JSON.stringify([tc('2027-01-20'), tc('2027-01-19')]))
}
// G3b
const l1z = T.scoreForecasts(L1).z
let calledB = 0
const g3bOk = () => ({ name: 'G3b', ok: close(T.scoreForecasts(T.forecastsOf(S24.bundle.rows).filter(f => f.eligible)).z, l1z, RULE.look1Reproduction), detail: '' })
const rGood = T.run(2, [...base24, ...base26], () => { calledB++; return { stats: T.scoreForecasts(L1.concat(L2fwd)), reported: T.reported(L1.concat(L2fwd)) } }, g3bOk)
check('Look 2 with G3 and G3b passed: scored once; the pooled n is the Look 1 set plus the forward set', calledB === 1 && rGood.scored && rGood.stats.n === L1.length + L2fwd.length, `${rGood.stats?.n}`)
calledB = 0
const rBadB = T.run(2, [...base24, ...base26], () => { calledB++; return { stats: T.scoreForecasts(L1.concat(L2fwd)), reported: T.reported(L1.concat(L2fwd)) } }, () => ({ name: 'G3b the Look 1 z recomputed equals the committed one', ok: close(l1z + 1e-6, l1z, RULE.look1Reproduction), detail: 'committed differs' }))
check('G3b: a committed Look 1 z that differs makes this a stop (STOPPED AT G3) and the Look 2 scoring is not called', rBadB.verdict === 'STOPPED AT G3' && !rBadB.scored && calledB === 0 && !('stats' in rBadB), JSON.stringify(rBadB.failed))
{
  // G3b also reproduces the VERDICT: an edited verdict key cannot start a Look 2 (a BUILD, or a DO NOT BUILD, edited to CONTINUE TO LOOK 2 fails), and only a true CONTINUE with its own z passes
  const strong = await bundleOf2(synthEv2({ seed: 41, starts: ['2024-09-17', '2024-09-19', '2024-09-26'], spacing: [14, 14, 14], knockout: true, sigma: 0.6 }), RULE.look1.from, RULE.look1.to)
  const sz = T.scoreForecasts(T.forecastsOf(strong.bundle.rows).filter(f => f.eligible)), sv = decide(1, { integrityOk: true, z: sz.z, folds: sz.folds, slope: sz.slope, slopeSE: sz.slopeSE }).verdict
  const lv = decide(1, { integrityOk: true, z: l1z, folds: T.scoreForecasts(L1).folds, slope: T.scoreForecasts(L1).slope, slopeSE: T.scoreForecasts(L1).slopeSE }).verdict
  check('G3b reproduces the verdict: the strong synthetic season is a Look 1 BUILD, and its committed verdict edited to CONTINUE TO LOOK 2 (with its true z) fails; the weak one, a true CONTINUE with its own z and verdict, passes; z off by 1e-6 fails', sv === 'BUILD' && lv === 'CONTINUE TO LOOK 2' && T.g3bCheck(strong.bundle.rows, { z: sz.z, verdict: 'CONTINUE TO LOOK 2' }).ok === false && T.g3bCheck(strong.bundle.rows, { z: sz.z, verdict: 'BUILD' }).ok === false && T.g3bCheck(S24.bundle.rows, { z: l1z, verdict: 'CONTINUE TO LOOK 2' }).ok === true && T.g3bCheck(S24.bundle.rows, { z: l1z + 1e-6, verdict: 'CONTINUE TO LOOK 2' }).ok === false, `${sv} ${lv}`)
}
{
  const rec = T.recomputeRecord(1, { verdict: 'CONTINUE TO LOOK 2', z: 1.5 }, { verdict: 'CONTINUE TO LOOK 2', z: 1.5 + 1e-12 }, 'x'), diff = T.recomputeRecord(1, { verdict: 'CONTINUE TO LOOK 2', z: 1.5 }, { verdict: 'BUILD', z: 1.5 }, 'x'), zOnly = T.recomputeRecord(2, { verdict: 'DO NOT BUILD', z: -1 }, { verdict: 'DO NOT BUILD', z: -1 + 1e-6 }, 'x'), nan = T.recomputeRecord(1, { verdict: 'BUILD', z: -3 }, { verdict: 'BUILD', z: NaN }, 'x')
  check('the recomputation record: agrees is true iff the verdicts are equal; a z difference above 1e-9 with the same verdict is recorded (zAgrees false) and does not void the verdict; a missing independent z is not an agreement of z', rec.agrees === true && rec.zAgrees === true && diff.agrees === false && zOnly.agrees === true && zOnly.zAgrees === false && nan.agrees === true && nan.zAgrees === false, JSON.stringify([rec, diff, zOnly, nan]))
}
{
  const ec = T.eligibilityCounts(S24.bundle.rows), fcs = T.forecastsOf(S24.bundle.rows)
  check('G3 (m) counts eligibility from the presence of scores only (eligibilityCounts), and agrees with the forecasts\' own eligible counts: 144 / 144 / 108 league-phase, 90 / 90 / 54 eligible', T.LABELS.every((l, i) => ec[l].leaguePhase === [144, 144, 108][i] && ec[l].eligible === [90, 90, 54][i] && ec[l].eligible === fcs.filter(f => f.label === l && f.eligible).length), JSON.stringify(ec))
  const pool = T.look2Pool(S24.bundle.rows, S26.bundle.rows)
  check('the Look 2 pool is the Look 1 set followed by the forward set, and no frozen forecast is in it', pool.length === L1.length + L2fwd.length && pool.slice(0, L1.length).every((f, i) => f === pool[i]) && pool.slice(L1.length).every(f => f.date >= RULE.look2.forwardFrom) && T.frozenSet(S26.bundle.rows).every(f => f.date <= RULE.look2.frozenThrough) && T.frozenSet(S26.bundle.rows).length === 90, `${pool.length}`)
  const l1r = { z: 1.5, verdict: 'CONTINUE TO LOOK 2' }
  const good = T.recordChecks(l1r, { look: 1, agrees: true, runZ: 1.5, runVerdict: 'CONTINUE TO LOOK 2' })
  check('G3 (o): the Look 1 record must exist, say agrees true, be about Look 1, and carry this result\'s run z and run verdict; a missing record, agrees false, another z or verdict, or a Look 2 record fails', good.every(c => c.ok) && T.recordChecks(l1r, undefined).some(c => !c.ok) && T.recordChecks(l1r, { look: 1, agrees: false, runZ: 1.5, runVerdict: l1r.verdict }).some(c => !c.ok) && T.recordChecks(l1r, { look: 1, agrees: true, runZ: 1.6, runVerdict: l1r.verdict }).some(c => !c.ok) && T.recordChecks(l1r, { look: 1, agrees: true, runZ: 1.5, runVerdict: 'BUILD' }).some(c => !c.ok) && T.recordChecks(l1r, { look: 2, agrees: true, runZ: 1.5, runVerdict: l1r.verdict }).some(c => !c.ok), '')
  const w = i => `outbox/forecast-uefa-data-2024-25-${i}.json`
  check('G3 (a), the choice of bundle: the first 2024-25 bundle ever committed passes; a later one fails unless a repair record names it (a line `bundle24: <path>`); a path outside the 2024-25 pattern fails', T.firstBundleCheck(w('a'), ['x.txt', w('a'), w('b')], []).ok && !T.firstBundleCheck(w('b'), ['x.txt', w('a'), w('b')], []).ok && T.firstBundleCheck(w('b'), [w('a'), w('b')], [`repair\nbundle24: ${w('b')}\n`]).ok && !T.firstBundleCheck('outbox/other.json', ['outbox/other.json'], []).ok, '')
  const rec = T.recomputeRecord(1, { verdict: 'BUILD', z: -3 }, { verdict: 'DO NOT BUILD', z: -3 }, 'x', 'abc')
  check('the record carries finalVerdict (the run\'s verdict when the verdicts agree, else NO VERDICT) and the independent implementation\'s sha256', rec.finalVerdict === 'NO VERDICT' && T.recomputeRecord(1, { verdict: 'BUILD', z: -3 }, { verdict: 'BUILD', z: -3 }, 'x', 'abc').finalVerdict === 'BUILD' && rec.independentSha256 === 'abc', JSON.stringify(rec))
}
let order = ''
T.run(2, [...base24, ...base26.map(c => ({ ...c, ok: false }))], () => { order += 'S'; return { stats: { z: 0, folds: [], slope: 1, slopeSE: 1 }, reported: {} } }, () => { order += 'B'; return { name: 'G3b', ok: true, detail: '' } })
check('G3b is evaluated only after (a) to (l) pass: with a failed G3 neither G3b nor the scoring runs', order === '', order)
order = ''
T.run(2, [...base24], () => { order += 'S'; return { stats: { z: 0, folds: [], slope: 1, slopeSE: 1 }, reported: {} } }, () => { order += 'B'; return { name: 'G3b', ok: true, detail: '' } })
check('when G3 passes, G3b runs before the scoring', order === 'BS', order)

// ---- the command line, in a temporary git repository: the real main(), real git messages, a tampered bundle, the gate ----------------------------------------------
console.log('command line')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'uefa-repl-cli-'))
process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }))
const sh = (cmd, args, opt = {}) => spawnSync(cmd, args, { cwd: tmp, encoding: 'utf8', ...opt })
const g = (...a) => { const r = sh('git', a); if (r.status !== 0) throw new Error(`git ${a.join(' ')}: ${r.stderr}`); return r.stdout.trim() }
g('init', '-q'); g('config', 'user.email', 't@t'); g('config', 'user.name', 't')
for (const f of ['outbox/forecast-replicate-uefa-2026-11-28.mjs', 'outbox/forecast-uefa-data-2026-27-frozen-2026-11-27.json', 'outbox/forecast-fit-uefa-result-2026-11-27.json', 'scripts/uefa-replicate-run.mjs', 'scripts/uefa-replicate-score.mjs']) { fs.mkdirSync(path.dirname(path.join(tmp, f)), { recursive: true }); fs.copyFileSync(path.join(ROOT, f), path.join(tmp, f)) }
g('add', '-A'); g('commit', '-q', '-m', `rule\n\nRULE block sha256: ${ruleBlockSha256}\n`)
const ruleCommit = g('rev-parse', 'HEAD')
const toolPath = path.join(tmp, 'scripts/uefa-replicate-run.mjs')
{
  // the committed tooling names the real repository's rule commit; the temporary repository's own rule commit replaces it (the replacement must happen, or the CLI tests would run against a commit that does not exist here)
  const before = fs.readFileSync(toolPath, 'utf8')
  const after = before.replace(/^export const RULE_COMMIT = '[^']*'/m, `export const RULE_COMMIT = '${ruleCommit}'`)
  if (after === before) throw new Error('the RULE_COMMIT line of the tooling was not found: the temporary repository would test the wrong commit')
  fs.writeFileSync(toolPath, after)
}
const tmpScoringSha = T.sha256(fs.readFileSync(path.join(tmp, 'scripts/uefa-replicate-score.mjs'), 'utf8'))
const addBundle = (file, text) => { fs.writeFileSync(path.join(tmp, file), text); g('add', '-A'); g('commit', '-q', '-m', `data\n\nbundle sha256: ${T.sha256(text)} ${Buffer.byteLength(text)} bytes ${file}\nscoring sha256: ${tmpScoringSha} scripts/uefa-replicate-score.mjs\n`) }
addBundle('outbox/forecast-uefa-data-2024-25-synth.json', S24.text)
const cli = (...a) => sh('node', ['scripts/uefa-replicate-run.mjs', ...a])
const i0 = cli('--integrity-only', '--bundle24', 'outbox/forecast-uefa-data-2024-25-synth.json')
check('CLI --integrity-only on the committed synthetic bundle: exit 0, every check PASS, no outcome-bearing line', i0.status === 0 && !/FAIL/.test(i0.stdout) && !/\bz [-0-9]|Brier U/.test(i0.stdout), `${i0.status} ${i0.stdout.slice(-300)} ${i0.stderr.slice(-200)}`)
const r1 = cli('--look', '1', '--bundle24', 'outbox/forecast-uefa-data-2024-25-synth.json', '--out', 'outbox/look1-result.json')
const res1 = fs.existsSync(path.join(tmp, 'outbox/look1-result.json')) ? JSON.parse(fs.readFileSync(path.join(tmp, 'outbox/look1-result.json'), 'utf8')) : null
check('CLI --look 1: exit 0, prints the verdict, writes the result file with z, the rule sha, the tooling sha, the scoring sha and the bundle path and sha it scored', r1.status === 0 && /VERDICT: (BUILD|DO NOT BUILD|CONTINUE TO LOOK 2)/.test(r1.stdout) && res1 && close(res1.z, l1z, 1e-12) && res1.ruleSha256 === ruleBlockSha256 && /^[0-9a-f]{64}$/.test(res1.toolingSha256) && res1.scoringSha256 === tmpScoringSha && res1.bundle24?.path === 'outbox/forecast-uefa-data-2024-25-synth.json' && res1.bundle24?.sha256 === T.sha256(S24.text), `${r1.status} ${r1.stdout.slice(-300)} ${r1.stderr.slice(-300)}`)
const again = cli('--look', '1', '--bundle24', 'outbox/forecast-uefa-data-2024-25-synth.json', '--out', 'outbox/look1-result.json')
check('CLI --look 1 again on an existing result: refused (exit 2), the result is not rewritten', again.status === 2 && /already exists/.test(again.stderr) && fs.readFileSync(path.join(tmp, 'outbox/look1-result.json'), 'utf8') === JSON.stringify(res1, null, 1) + '\n', `${again.status} ${again.stderr.slice(-200)}`)
fs.appendFileSync(path.join(tmp, 'outbox/forecast-uefa-data-2024-25-synth.json'), ' ')
const t1 = cli('--look', '1', '--bundle24', 'outbox/forecast-uefa-data-2024-25-synth.json', '--out', 'outbox/look1-tampered.json')
check('CLI --look 1 on a bundle changed after its commit: exit 1, STOPPED AT G3 (stop 1 of 3), no result file, only the stop file', t1.status === 1 && /VERDICT: STOPPED AT G3 \(stop 1 of 3\)/.test(t1.stdout) && !fs.existsSync(path.join(tmp, 'outbox/look1-tampered.json')) && fs.existsSync(path.join(tmp, 'outbox/look1-tampered-stop-1.txt')) && !/\bz [-0-9]|Brier U/.test(t1.stdout), `${t1.status} ${t1.stdout.slice(-300)}`)
// the stop mechanics: a stop with no repair record is not run again; a repair record lets the next run through; the third stop is NO VERDICT and writes the result file
const tamperedRun = () => cli('--look', '1', '--bundle24', 'outbox/forecast-uefa-data-2024-25-synth.json', '--out', 'outbox/look1-tampered.json')
const crash = cli('--look', '1', '--bundle24', 'outbox/does-not-exist.json', '--out', 'outbox/look1-crash.json')
check('CLI: an exception before a result (an unreadable bundle) writes nothing, prints ERROR and exits 3: neither a stop nor a verdict', crash.status === 3 && /ERROR/.test(crash.stderr) && !fs.existsSync(path.join(tmp, 'outbox/look1-crash.json')) && !fs.existsSync(path.join(tmp, 'outbox/look1-crash-stop-1.txt')), `${crash.status} ${crash.stderr.slice(-200)}`)
const refused = tamperedRun()
check('CLI: a second run after a stop with no repair record is refused (exit 2) and writes nothing', refused.status === 2 && /no repair record/.test(refused.stderr) && !fs.existsSync(path.join(tmp, 'outbox/look1-tampered-stop-2.txt')), `${refused.status} ${refused.stderr.slice(-200)}`)
fs.writeFileSync(path.join(tmp, 'outbox/look1-tampered-repair-1.md'), 'repair 1\n')
const stop2 = tamperedRun()
check('CLI: with a repair record the next run goes through and is stop 2 of 3, still no verdict and no result file', stop2.status === 1 && /VERDICT: STOPPED AT G3 \(stop 2 of 3\)/.test(stop2.stdout) && fs.existsSync(path.join(tmp, 'outbox/look1-tampered-stop-2.txt')) && !fs.existsSync(path.join(tmp, 'outbox/look1-tampered.json')), `${stop2.status} ${stop2.stdout.slice(-200)}`)
fs.writeFileSync(path.join(tmp, 'outbox/look1-tampered-repair-2.md'), 'repair 2\n')
const stop3 = tamperedRun()
const nv3 = fs.existsSync(path.join(tmp, 'outbox/look1-tampered.json')) ? JSON.parse(fs.readFileSync(path.join(tmp, 'outbox/look1-tampered.json'), 'utf8')) : null
check('CLI: the third stop is NO VERDICT and writes a result file saying so (no statistic in it)', stop3.status === 1 && /VERDICT: NO VERDICT \(stop 3 of 3\)/.test(stop3.stdout) && nv3?.verdict === 'NO VERDICT' && nv3.stops === 3 && !('stats' in nv3) && !('z' in nv3), `${stop3.status} ${stop3.stdout.slice(-200)} ${JSON.stringify(nv3)}`)
fs.writeFileSync(path.join(tmp, 'outbox/forecast-uefa-data-2024-25-synth.json'), S24.text)
addBundle('outbox/synth-26.json', S26.text)
{
  const indep = { look: 1, verdict: res1.verdict, z: res1.z + 3e-10 }
  fs.writeFileSync(path.join(tmp, 'outbox/indep.json'), JSON.stringify(indep))
  const c = cli('--compare-independent', '--look', '1', '--result', 'outbox/look1-result.json', '--independent', 'outbox/indep.json', '--out', 'outbox/look1-recompute.json')
  const rec = JSON.parse(fs.readFileSync(path.join(tmp, 'outbox/look1-recompute.json'), 'utf8'))
  fs.writeFileSync(path.join(tmp, 'outbox/indep2.json'), JSON.stringify({ ...indep, verdict: 'BUILD', z: res1.z }))
  cli('--compare-independent', '--look', '1', '--result', 'outbox/look1-result.json', '--independent', 'outbox/indep2.json', '--out', 'outbox/look1-recompute2.json')
  const rec2 = JSON.parse(fs.readFileSync(path.join(tmp, 'outbox/look1-recompute2.json'), 'utf8'))
  check('CLI --compare-independent writes the committed record: the same verdict and a z within 1e-9 agree; a different verdict does not', c.status === 0 && rec.agrees === true && rec.zAgrees === true && rec.ruleSha256 === ruleBlockSha256 && rec2.agrees === false, `${c.status} ${c.stdout} ${JSON.stringify(rec)} ${JSON.stringify(rec2)}`)
}
const forceLook1 = (verdict) => fs.writeFileSync(path.join(tmp, 'outbox/look1-result.json'), JSON.stringify({ ...res1, verdict }))
const r2 = cli('--look', '2', '--bundle26', 'outbox/synth-26.json', '--look1-result', 'outbox/look1-result.json', '--look1-recompute', 'outbox/look1-recompute.json', '--out', 'outbox/look2-result.json', '--today', '2027-01-25')
const res2 = fs.existsSync(path.join(tmp, 'outbox/look2-result.json')) ? JSON.parse(fs.readFileSync(path.join(tmp, 'outbox/look2-result.json'), 'utf8')) : null
check('CLI --look 2: exit 0, G3 including (k) and G3b pass, the pooled n is Look 1 plus forward, the result file is written', r2.status === 0 && /VERDICT: /.test(r2.stdout) && res2 && res2.stats.n === L1.length + L2fwd.length && /G3b/.test(r2.stdout), `${r2.status} ${r2.stdout.slice(-400)} ${r2.stderr.slice(-300)}`)
const l1orig = fs.readFileSync(path.join(tmp, 'outbox/look1-result.json'), 'utf8')
fs.writeFileSync(path.join(tmp, 'outbox/look1-result.json'), JSON.stringify({ ...res1, z: res1.z + 1e-6 }))
fs.writeFileSync(path.join(tmp, 'outbox/look1-recompute-edited.json'), JSON.stringify({ look: 1, agrees: true, runZ: res1.z + 1e-6, runVerdict: res1.verdict }))
const r2b = cli('--look', '2', '--bundle26', 'outbox/synth-26.json', '--look1-result', 'outbox/look1-result.json', '--look1-recompute', 'outbox/look1-recompute-edited.json', '--out', 'outbox/look2-g3b.json', '--today', '2027-01-25')
check('CLI --look 2 with a committed Look 1 z that differs by 1e-6: exit 1, a stop at G3b, no result file', r2b.status === 1 && /VERDICT: STOPPED AT G3/.test(r2b.stdout) && /G3b/.test(r2b.stdout) && !fs.existsSync(path.join(tmp, 'outbox/look2-g3b.json')), `${r2b.status} ${r2b.stdout.slice(-300)}`)
fs.writeFileSync(path.join(tmp, 'outbox/look1-result.json'), l1orig)
const other = cli('--look', '2', '--bundle24', 'outbox/forecast-uefa-data-2024-25-other.json', '--bundle26', 'outbox/synth-26.json', '--look1-result', 'outbox/look1-result.json', '--look1-recompute', 'outbox/look1-recompute.json', '--out', 'outbox/look2-other.json', '--today', '2027-01-25')
check('CLI --look 2 naming another Look 1 bundle than the Look 1 result names: refused (exit 2), nothing written', other.status === 2 && /not the Look 1 bundle named in the Look 1 result/.test(other.stderr) && !fs.existsSync(path.join(tmp, 'outbox/look2-other.json')), `${other.status} ${other.stderr.slice(-200)}`)
const r2c = cli('--look', '2', '--bundle26', 'outbox/synth-26.json', '--look1-result', 'outbox/look1-result.json', '--look1-recompute', 'outbox/look1-recompute.json', '--out', 'outbox/look2-late.json', '--today', '2027-02-16')
check('CLI --look 2 started after the deadline: refused (exit 2), no scoring', r2c.status === 2 && /deadline/.test(r2c.stdout) && !fs.existsSync(path.join(tmp, 'outbox/look2-late.json')), `${r2c.status} ${r2c.stdout.slice(-200)}`)
const forceLook1b = () => fs.writeFileSync(path.join(tmp, 'outbox/look1-result.json'), JSON.stringify({ ...res1, verdict: 'CONTINUE TO LOOK 2' }))
const setRecompute = agrees => { if (agrees === 'none') fs.rmSync(path.join(tmp, 'outbox/look1-recompute.json'), { force: true }); else fs.writeFileSync(path.join(tmp, 'outbox/look1-recompute.json'), JSON.stringify({ look: 1, agrees })) }
{
  // the gate's uncounted integrity pre-check of the committed forward bundle: a pass prints no statistic and counts no stop; a missing or disagreeing Look 1 record fails it (G3 (o)) without a stop
  forceLook1b(); fs.writeFileSync(path.join(tmp, 'outbox/look1-recompute.json'), JSON.stringify({ look: 1, agrees: true, runZ: res1.z, runVerdict: 'CONTINUE TO LOOK 2' }))
  const pre = cli('--integrity-only', '--bundle26', 'outbox/synth-26.json', '--look1-result', 'outbox/look1-result.json', '--look1-recompute', 'outbox/look1-recompute.json', '--today', '2027-01-25')
  fs.writeFileSync(path.join(tmp, 'outbox/look1-recompute.json'), JSON.stringify({ look: 1, agrees: false, runZ: res1.z, runVerdict: 'CONTINUE TO LOOK 2' }))
  const pre2 = cli('--integrity-only', '--bundle26', 'outbox/synth-26.json', '--look1-result', 'outbox/look1-result.json', '--look1-recompute', 'outbox/look1-recompute.json', '--today', '2027-01-25')
  check('CLI --integrity-only --bundle26: the gate\'s uncounted pre-check passes on a good forward bundle with an agreeing record (no statistic printed), and fails (exit 1, (o)) on a record that says agrees false, writing no stop file', pre.status === 0 && !/\bz [-0-9]|Brier U|VERDICT: (BUILD|DO NOT|CONTINUE)/.test(pre.stdout) && pre2.status === 1 && /FAIL  \(o\)/.test(pre2.stdout) && !fs.readdirSync(path.join(tmp, 'outbox')).some(f => /-stop-/.test(f) && /look1-result\.json$|integrity/.test(f)), `${pre.status} ${pre2.status} ${pre2.stdout.slice(-200)}`)
  setRecompute(true)
}
const gate = (verdict, today, extra = [], agrees = true) => { if (verdict) forceLook1(verdict); else fs.rmSync(path.join(tmp, 'outbox/look1-result.json'), { force: true }); setRecompute(agrees); return cli('--gate', '--look1-result', 'outbox/look1-result.json', '--look1-recompute', 'outbox/look1-recompute.json', '--look2-result', 'outbox/look2-gate.json', '--today', today, ...extra).stdout.trim() }
{
  // a result that was committed and then deleted is still a result: the look is not run again
  const d1 = cli('--look', '1', '--bundle24', 'outbox/forecast-uefa-data-2024-25-synth.json', '--out', 'outbox/look1-del.json')
  g('add', '-A'); g('commit', '-q', '-m', 'a result'); g('rm', '-q', 'outbox/look1-del.json'); g('commit', '-q', '-m', 'delete it')
  const d2 = cli('--look', '1', '--bundle24', 'outbox/forecast-uefa-data-2024-25-synth.json', '--out', 'outbox/look1-del.json')
  check('CLI: a Look 1 result that was committed and later deleted is still refused (the guard reads the history, not only the tree)', d1.status === 0 && d2.status === 2 && /already exists \(now or in history\)/.test(d2.stderr) && !fs.existsSync(path.join(tmp, 'outbox/look1-del.json')), `${d1.status} ${d2.status} ${d2.stderr.slice(-160)}`)
  // stop files that were committed and deleted still count
  fs.writeFileSync(path.join(tmp, 'outbox/look2-hist-stop-1.txt'), 's'); g('add', '-A'); g('commit', '-q', '-m', 'a stop'); g('rm', '-q', 'outbox/look2-hist-stop-1.txt'); g('commit', '-q', '-m', 'delete the stop')
  setRecompute(true); forceLook1b()
  const gh = cli('--gate', '--look1-result', 'outbox/look1-result.json', '--look1-recompute', 'outbox/look1-recompute.json', '--look2-result', 'outbox/look2-hist.json', '--bundle26', 'outbox/synth-26.json', '--today', '2027-01-25').stdout.trim()
  check('GATE: a stop file that was committed and then deleted still counts as a stop (a stop with no repair record waits)', gh === 'GATE: WAIT', gh)
}
check('GATE: no Look 1 result file, a Look 1 verdict other than CONTINUE, a missing recomputation record, or one that says agrees false, is INERT', gate(null, '2027-01-25') === 'GATE: INERT' && gate('BUILD', '2027-01-25') === 'GATE: INERT' && gate('DO NOT BUILD', '2027-03-01') === 'GATE: INERT' && gate('CONTINUE TO LOOK 2', '2027-01-25', ['--bundle26', 'outbox/synth-26.json'], 'none') === 'GATE: INERT' && gate('CONTINUE TO LOOK 2', '2027-01-25', ['--bundle26', 'outbox/synth-26.json'], false) === 'GATE: INERT', '')
check('GATE: CONTINUE without the forward bundle waits; with the complete forward bundle it says RUN; the day after the deadline it says NO VERDICT', gate('CONTINUE TO LOOK 2', '2027-01-25') === 'GATE: WAIT' && gate('CONTINUE TO LOOK 2', '2027-01-25', ['--bundle26', 'outbox/synth-26.json']) === 'GATE: RUN' && gate('CONTINUE TO LOOK 2', '2027-02-16') === 'GATE: NO VERDICT', '')
const stopFile = n => path.join(tmp, `outbox/look2-gate-stop-${n}.txt`), repairFile = n => path.join(tmp, `outbox/look2-gate-repair-${n}.md`)
const withState = (stops, repairs, extra = []) => { for (const n of [1, 2, 3]) { fs.rmSync(stopFile(n), { force: true }); fs.rmSync(repairFile(n), { force: true }) } for (let n = 1; n <= stops; n++) fs.writeFileSync(stopFile(n), 's'); for (let n = 1; n <= repairs; n++) fs.writeFileSync(repairFile(n), 'r'); return gate('CONTINUE TO LOOK 2', '2027-01-25', ['--bundle26', 'outbox/synth-26.json', ...extra]) }
check('GATE: a Look 2 stop with no repair record waits even when every club is on N; with the repair record it says RUN; the third stop is NO VERDICT', withState(1, 0) === 'GATE: WAIT' && withState(1, 1) === 'GATE: RUN' && withState(2, 1) === 'GATE: WAIT' && withState(2, 2) === 'GATE: RUN' && withState(3, 3) === 'GATE: NO VERDICT', '')
withState(0, 0)
check('GATE: a malformed --today (a timestamp) fails loudly (non-zero exit), it does not decide the programme', (() => { forceLook1('CONTINUE TO LOOK 2'); setRecompute(true); const r = cli('--gate', '--look1-result', 'outbox/look1-result.json', '--look1-recompute', 'outbox/look1-recompute.json', '--look2-result', 'outbox/look2-gate.json', '--today', '2027-02-15T10:00:00Z'); return r.status !== 0 && !/GATE:/.test(r.stdout) })(), '')
check('GATE: a forward bundle with a club short of N waits', (() => { const b = JSON.parse(S26.text); b.rows.splice(b.rows.findIndex(r => r.date >= '2026-12-01'), 1); fs.writeFileSync(path.join(tmp, 'outbox/short-26.json'), JSON.stringify(b)); return gate('CONTINUE TO LOOK 2', '2027-01-25', ['--bundle26', 'outbox/short-26.json']) === 'GATE: WAIT' })(), '')
gate('CONTINUE TO LOOK 2', '2027-02-16', ['--write-no-verdict'])
const nv = fs.existsSync(path.join(tmp, 'outbox/look2-gate.json')) ? JSON.parse(fs.readFileSync(path.join(tmp, 'outbox/look2-gate.json'), 'utf8')) : null
check('GATE --write-no-verdict after the deadline writes a Look 2 result whose verdict is NO VERDICT; with that file present the gate says DONE', nv?.verdict === 'NO VERDICT' && gate('CONTINUE TO LOOK 2', '2027-03-01') === 'GATE: DONE', JSON.stringify(nv))

{
  // a block that changed in ANY commit after RULE_COMMIT fails (b), even when the final block is the committed one again (the file is edited and reverted)
  const rulePath = path.join(tmp, 'outbox/forecast-replicate-uefa-2026-11-28.mjs'), original = fs.readFileSync(rulePath, 'utf8')
  const ok0 = cli('--integrity-only', '--bundle24', 'outbox/forecast-uefa-data-2024-25-synth.json')
  fs.writeFileSync(rulePath, original.replace('// WHY. The pre-registered fit', '// WHY (edited). The pre-registered fit')); g('add', '-A'); g('commit', '-q', '-m', 'edit the block')
  fs.writeFileSync(rulePath, original); g('add', '-A'); g('commit', '-q', '-m', 'revert the block')
  const ok1 = cli('--integrity-only', '--bundle24', 'outbox/forecast-uefa-data-2024-25-synth.json')
  check('G3 (b): a rule file whose block was edited and then reverted after RULE_COMMIT fails only the stability check (every other (b) check passes on the reverted text)', ok0.status === 0 && ok1.status === 1 && /FAIL  \(b\) the block is identical in every commit/.test(ok1.stdout) && !/FAIL  \(b\) the RULE block's sha256/.test(ok1.stdout) && !/FAIL  \(b\) the block as stored/.test(ok1.stdout), `${ok0.status} ${ok1.status} ${ok1.stdout.split('\n').filter(l => /FAIL/.test(l)).join(' | ')}`)
}

console.log(`\n${n - bad} of ${n} checks passed${bad ? `, ${bad} FAILED` : ''}`)
process.exit(bad === 0 ? 0 : 1)
