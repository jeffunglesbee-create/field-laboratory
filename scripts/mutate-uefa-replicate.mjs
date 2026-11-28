#!/usr/bin/env node
// Rule 90 (MUTATE-FIRST-A) for scripts/uefa-replicate-run.mjs and for decide() / look2Gate() of outbox/forecast-replicate-uefa-2026-11-28.mjs: scripts/check-uefa-replicate.mjs is shown red under each deliberate break before it is trusted.
// Every mutation puts ONE defect into a COPY of the tree in a temp directory (the real files are never touched). A mutation is CAUGHT only when the check exits non-zero AND prints a FAIL line; a crash with no FAIL line is BROKE (a harness
// error, not a catch). An anchor that does not occur exactly once in its file applies NOTHING and fails the harness by name; a mutant identical to its source is refused. The CONTROL (the unmutated copy) must pass first.
//
//   node scripts/mutate-uefa-replicate.mjs
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

const TREE = [
  'scripts/uefa-replicate-run.mjs', 'scripts/uefa-replicate-score.mjs', 'scripts/uefa-replicate-synth.mjs', 'scripts/check-uefa-replicate.mjs', 'scripts/uefa-replication-data.mjs',
  'outbox/forecast-replicate-uefa-2026-11-28.mjs', 'outbox/forecast-fit-uefa-2026-11-27.mjs', 'outbox/forecast-fit-uefa-result-2026-11-27.json',
  'outbox/forecast-uefa-data-2025-26-2026-11-27.json', 'outbox/forecast-uefa-data-2026-27-frozen-2026-11-27.json',
]
const TOOL = 'scripts/uefa-replicate-run.mjs', SCORE = 'scripts/uefa-replicate-score.mjs', RULEF = 'outbox/forecast-replicate-uefa-2026-11-28.mjs'
const SRC = Object.fromEntries(TREE.map(f => [f, fs.readFileSync(f, 'utf8')]))
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'uefa-repl-mut-'))
process.on('exit', () => fs.rmSync(root, { recursive: true, force: true }))
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(130))

const M = (file, name, anchor, replacement) => ({ file, name, anchor, replacement })
const T = (name, anchor, replacement) => M(TOOL, name, anchor, replacement)
const S = (name, anchor, replacement) => M(SCORE, name, anchor, replacement)
const LD = S
const R = (name, anchor, replacement) => M(RULEF, name, anchor, replacement)
const OFF = (name, anchor) => T(`G3 ${name} is not checked`, anchor, 'true')
const MUTANTS = [
  // ---- the order of evaluation and the verdict path
  T('the scoring is called before G3 is looked at', '  let failed = checks.filter(c => !c.ok)\n', "  let failed = checks.filter(c => !c.ok); if (typeof score === 'function') score()\n"),
  T('a failed G3 still carries the statistics', 'scored: false, checks, stops }', 'scored: false, checks, stops, stats: score().stats }'),
  T('a run after a stop with no repair record is not refused', 'stopFiles(out).length > repairFiles(out).length) {', 'false) {'),
  T('the third stop writes no result file saying NO VERDICT', "if (result.verdict === 'NO VERDICT') fs.writeFileSync(out,", "if (false) fs.writeFileSync(out,"),
  T('the stop count ignores the stop files already written', 'const stops = out ? stopFiles(out).length + 1 : 1', 'const stops = 1'),
  T('the gate does not count Look 2 stops', 'look2Stops: l2f ? stopFiles(l2f).length : 0', 'look2Stops: 0'),
  T('the gate does not count Look 2 repair records', 'look2Repairs: l2f ? repairFiles(l2f).length : 0', 'look2Repairs: 99'),
  S('a slope that did not converge is returned as if it had', 'return converged ? {', 'return true ? {'),
  T('G3b (the Look 1 reproduction) is never run', 'if (failed.length === 0 && look === 2 && g3b)', 'if (false && g3b)'),
  T('a failed run still writes a result file', 'if (result.scored && out)', 'if (out)'),
  T('the Look 2 deadline is not applied', 'if (look === 2 && today > RULE.look2.deadline)', 'if (false)'),
  // ---- the arithmetic of the rule
  S('the sign of D is flipped', 'const D = bU.map((v, i) => v - bB[i])', 'const D = bU.map((v, i) => bB[i] - v)'),
  S('the standard deviation divides by n, not n - 1', 'a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)', 'a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length'),
  S('the base rate\'s denominator is 235', 'const BASE = RULE.baseCounts.map(c => c / RULE.baseN)', 'const BASE = RULE.baseCounts.map(c => c / (RULE.baseN + 1))'),
  S('eligibility asks for K - 1 matches', 'const eligible = H.g >= RULE.K && A.g >= RULE.K', 'const eligible = H.g >= RULE.K - 1 && A.g >= RULE.K - 1'),
  S('the match enters the ratings before its own forecast', 'const eligible = H.g >= RULE.K && A.g >= RULE.K\n', 'H.g++; A.g++\n        const eligible = H.g >= RULE.K && A.g >= RULE.K\n'),
  S('the goal-difference rate is a total, not per game', 'RULE.weights.gd * (x.gf - x.ga) / x.g', 'RULE.weights.gd * (x.gf - x.ga)'),
  S('the goals-for term is dropped', 'RULE.weights.gf * x.gf / x.g', '0'),
  S('the draw probability is not the share', 'return [pH, c.share, 1 - c.share - pH]', 'return [pH, 0.2, 0.8 - pH]'),
  S('the home advantage is dropped from the logistic', 'logistic((gap + c.home) / c.scale)', 'logistic(gap / c.scale)'),
  S('the league phase needs EITHER club under N (not both) in the counting rule', 'const isLp = (n.get(r.home) ?? 0) < RULE.N[label] && (n.get(r.away) ?? 0) < RULE.N[label]', 'const isLp = (n.get(r.home) ?? 0) < RULE.N[label] || (n.get(r.away) ?? 0) < RULE.N[label]'),
  S('the league phase needs EITHER club under N in the eligibility counts', 'if ((n.get(r.home) ?? 0) < RULE.N[label] && (n.get(r.away) ?? 0) < RULE.N[label] && r.home_score !== null', 'if (((n.get(r.home) ?? 0) < RULE.N[label] || (n.get(r.away) ?? 0) < RULE.N[label]) && r.home_score !== null'),
  S('the league phase needs EITHER club under N (not both) in the forecasts', 'H.n < RULE.N[label] && A.n < RULE.N[label]', 'H.n < RULE.N[label] || A.n < RULE.N[label]'),
  S('the row order is not applied (rows are taken as given)', 'export const orderCmp = (a, b) => (', 'export const orderCmp = (a, b) => 0 && ('),
  S('the slope\'s standard error is read from the wrong element of the inverse information', 'se: Math.sqrt(f.i00 / f.det)', 'se: Math.sqrt(f.i11 / f.det)'),
  S('the slope is stopped after one Newton step', 'for (let it = 0; it < maxIter; it++) {', 'for (let it = 0; it < 1; it++) {'),
  S('the slope event is an away win, not a home win', 'fs.map(f => (f.y === 0 ? 1 : 0))', 'fs.map(f => (f.y === 2 ? 1 : 0))'),
  S('every competition cell is the pooled z', 'const ix = fs.map((f, i) => (f.label === l ? i : -1)).filter(i => i >= 0)', 'const ix = fs.map((f, i) => i)'),
  S('Look 2 scores the frozen matches as well', 'forecastsOf(rows26).filter(f => f.eligible && f.date >= RULE.look2.forwardFrom)', 'forecastsOf(rows26).filter(f => f.eligible)'),
  S('Look 2 drops the Look 1 forecasts from the pooled set', 'look1Set(rows24).concat(forwardSet(rows26))', 'forwardSet(rows26)'),
  T('the gate says all clubs are on N whatever the bundle', 'allClubsOnN = LABELS.every(l => lp.perLabel[l] === RULE.expected2024.leaguePhase[l]) && lp.clubsNotOnN.length === 0', 'allClubsOnN = true'),
  T('G3 (n) is not checked at a bundle', 'scoringShaFromMessage(b.message) === actual', 'true'),
  T('G3 (n) is not checked at Look 2', 'look1Result.scoringSha256 === actual', 'true'),
  T('G3b reproduces the z only, not the verdict', "v === l1.verdict && v === 'CONTINUE TO LOOK 2'", 'true'),
  T('a start_time with no Z or offset passes the recomputed date check', "typeof r.start_time === 'string' && /(Z|[+-]\\d{2}:?\\d{2})$/.test(r.start_time) ? Date.parse(r.start_time) : NaN", 'Date.parse(r.start_time)'),
  T('the forward bundle\'s `to` is not bounded by the run date', 'bundle.to >= RULE.look2.forwardFrom && bundle.to <= ctx.runDate', 'true'),
  T('an existing result is overwritten', 'if (look !== 0 && out && resultEver(out)) {', 'if (false) {'),
  T('an exception exits 0 instead of 3', 'process.exitCode = 3', 'process.exitCode = 0'),
  T('the recomputation record agrees whatever the verdicts', "agrees = typeof result.verdict === 'string' && result.verdict === independent.verdict", 'agrees = true'),
  T('the recomputation record says the z values agree whatever they are', 'zAgrees: Number.isFinite(zDifference) && zDifference <= 1e-9', 'zAgrees: true'),
  T('a second line in a commit message is read as the first (the parse takes any count)', 'return m.length === 1 ? m[0] : null', 'return m.length >= 1 ? m[0] : null'),
  S('the competition cells carry no Brier of their own', 'brierU: mean(ix.map(i => bU[i])), brierBase: mean(ix.map(i => bB[i]))', 'brierU: 0, brierBase: 0'),
  S('the opening matches are not counted', 'all.filter(f => f.label === l && !f.eligible).length', '0'),
  LD('the loader accepts a marker line that occurs twice', 'b.length === 1 && e.length === 1 && e[0] > b[0]', 'b.length >= 1 && e.length >= 1 && e[0] > b[0]'),
  LD('an unhashed tail that edits RULE would change what the tooling runs (the block text is the only thing evaluated, so this proves the checks read RULE)', '} = evaluateBlock(block)', "} = evaluateBlock(block + '\\nRULE.look1.z = -1.5')"),
  T('G3 (a) does not constrain which 2024-25 bundle is scored', 'WINDOW24_RE.test(f24) && (earliest === f24 || named)', 'true'),
  T('G3 (o) accepts a record that says agrees false', 'rec?.agrees === true && rec?.look === 1', 'true'),
  T('G3 (o) accepts a record about another result', "rec?.runZ === l1?.z && rec?.runVerdict === l1?.verdict && typeof l1?.verdict === 'string'", 'true'),
  T('G3 (b) does not check that the block is stable across commits', 'git.blockStable === true', 'true'),
  T('the block-stability facts are always true', 'blockStable: touching.every(c => c !== null && shown(c) === ruleBlockSha256)', 'blockStable: true'),
  T('a deleted result is no longer a result (the history is not read)', 'fs.existsSync(out) || everAdded().includes(out)', 'fs.existsSync(out)'),
  T('deleted stop files and repair records are not counted (the history is not read)', 'for (const q of everAdded()) if', 'for (const q of []) if'),
  T('the recomputation record\'s finalVerdict is the run\'s verdict whatever the independent one says', "finalVerdict: agrees ? result.verdict : 'NO VERDICT'", 'finalVerdict: result.verdict'),
  T('a Look 2 may name another Look 1 bundle than the result names', "arg(argv, '--bundle24') !== f24", 'false'),
  T('the integrity pre-check of the forward bundle is not made at Look 2', '...scoringChecks([{ path: f26, message: msg26 }], l1), ...recordChecks(l1, rec1)]', '...scoringChecks([{ path: f26, message: msg26 }], l1)]'),
  S('the eligibility count ignores K', '(g.get(r.home) ?? 0) >= RULE.K && (g.get(r.away) ?? 0) >= RULE.K', '(g.get(r.home) ?? 0) >= 1 && (g.get(r.away) ?? 0) >= 1'),
  S('the verdict call passes a G3 failure on', 'verdictOf = (look, s) => decide(look, { integrityOk: true,', 'verdictOf = (look, s) => decide(look, { integrityOk: false,'),
  // ---- each G3 check, one at a time
  OFF('(a) the bundle sha256', 'sha256(ctx.text) === ctx.committedBundleSha'),
  OFF('(c) the completed counts', 't.completed === ctx.expect.completed[l] && rows.filter(r => r.sport === l).length === ctx.expect.completed[l]'),
  OFF('(d) the league-phase counts', 'lp.perLabel[l] === ctx.expect.leaguePhase[l]'),
  OFF('(e) 36 clubs', 'lp.distinctClubs[l] === (ctx.clubsPerCompetition ?? RULE.clubsPerCompetition)'),
  T('G3 (e) every club on N is not checked', 'lp.clubsNotOnN.length === 0, lp.clubsNotOnN.slice(0, 8)', 'true, lp.clubsNotOnN.slice(0, 8)'),
  OFF('(f) duplicateEventIds', 'bundle?.counts?.duplicateEventIds === 0'),
  OFF('(f) event ids distinct and counts.rows', 'new Set(rows.map(r => r.espn_event_id)).size === rows.length && bundle?.counts?.rows === rows.length'),
  T('G3 (f) does not require an event id to be a string of digits', "&& rows.every(r => typeof r.espn_event_id === 'string' && /^[0-9]+$/.test(r.espn_event_id))", ''),
  OFF('(g) skipped', 't.skipped === 0'),
  OFF('(g) one club on both sides', 'lp.sameClub === 0'),
  OFF('(g) two events on one date', 'lp.twoOnOneDate === 0'),
  OFF('(h) the status', 'lp.rows.every(r => RULE.leaguePhaseStatus.includes(r.status))'),
  OFF('(i) null scores', 'lp.rows.every(r => r.home_score !== null && r.away_score !== null)'),
  OFF('(j) dateMismatch as stated', 't.dateMismatch === 0'),
  OFF('(j) the dates recomputed from the rows', 'badDates.length === 0'),
  OFF('(l) the fields list and the row keys', 'JSON.stringify(bundle?.fields) === JSON.stringify(RULE.fields) && rows.every(keysOk)'),
  OFF('(l) the window, daysRead and the statuses', 'bundle?.from === ctx.window.from && bundle?.to === ctx.window.to && bundle?.daysRead === nd && JSON.stringify(bundle?.statuses) === JSON.stringify({ 200: nd * LABELS.length })'),
  OFF('(k) the frozen bundle\'s sha256', 'ctx.frozen.sha === RULE.frozenBundleSha256'),
  OFF('(k) the frozen id-set equality', 'ctx.frozen.ids.size === RULE.frozenIds && miss === 0 && extra === 0'),
  OFF('(m) the eligible counts of Look 1', 'ec[l].eligible === ctx.expectEligible[l]'),
  OFF('(m) the forward eligible count', "LABELS.reduce((t, l) => t + ec[l].forward, 0) === ctx.expectForwardEligible"),
  OFF('(k) the frozen matches\' scores and start times', 'Array.isArray(ctx.frozen.rows) && ctx.frozen.rows.length === RULE.frozenIds && diff.length === 0'),
  OFF('(b) the block as stored in RULE_COMMIT', "typeof git.shownSha === 'string' && git.shownSha === actual"),
  OFF('(b) RULE_COMMIT an ancestor of the checkout', 'git.headDescends === true'),
  OFF('(b) RULE_COMMIT an ancestor of each bundle commit', 'git.bundlesDescend === true'),
  OFF('(b) the rule block sha256', "typeof committed === 'string' && actual === committed"),
  OFF('(b) the marker lines', 'markers.begin === 1 && markers.end === 1'),
  // ---- the rule's own decide() and look2Gate()
  R('decide: the boundary is strict (z < z1)', 'if (!(m.z <= b))', 'if (!(m.z < b))'),
  R('decide: G1 is strict (z < 1.0)', 'f.z <= RULE.foldMaxZ', 'f.z < RULE.foldMaxZ'),
  R('decide: G2 is strict (< 1.96 SE)', 'Math.abs(m.slope - 1) <= RULE.slopeSigma * m.slopeSE', 'Math.abs(m.slope - 1) < RULE.slopeSigma * m.slopeSE'),
  R('decide: a slope SE of 0 is accepted', 'm.slopeSE > 0 &&', 'm.slopeSE >= 0 &&'),
  R('decide: any look value is accepted', "if (look !== 1 && look !== 2) return", 'if (false) return'),
  R('decide: Infinity and NaN count as numbers', "typeof v === 'number' && Number.isFinite(v)", "typeof v === 'number'"),
  R('decide: a truthy integrityOk is enough', 'if (m.integrityOk !== true)', 'if (!m.integrityOk)'),
  R('decide: fewer than three cells are accepted', 'names.length === 3 &&', 'names.length >= 0 &&'),
  R('decide: the cells need not be the three competitions', 'Object.keys(RULE.N).every(n => names.filter(x => x === n).length === 1)', 'true'),
  R('decide: a G3 failure is reported as NO VERDICT, not as a stop', "return { verdict: 'STOPPED AT G3', failed: ['a G3 integrity check failed (the caller names the stop with stopVerdict)'] }", "return { verdict: 'NO VERDICT', failed: ['a G3 integrity check failed (the caller names the stop with stopVerdict)'] }"),
  R('stopVerdict: the second stop is already NO VERDICT', "return stops > RULE.repairsPerLook ? 'NO VERDICT' : 'STOPPED AT G3'", "return stops >= RULE.repairsPerLook ? 'NO VERDICT' : 'STOPPED AT G3'"),
  R('stopVerdict: a non-integer count is accepted', "if (!Number.isInteger(stops) || stops < 1) throw new Error('stops must be a positive integer')", ''),
  R('look2Gate: a stop with no repair record does not wait', "if (stops > repairs) return 'WAIT'", ''),
  R('look2Gate: the third stop is not NO VERDICT', "if (stops > RULE.repairsPerLook) return 'NO VERDICT'", ''),
  R('look2Gate: a calendar-invalid date is accepted', ") || new Date(Date.parse(today + 'T00:00:00Z')).toISOString().slice(0, 10) !== today) throw", ") || false) throw"),

  R('decide: the Look 1 boundary is -2.24', "look1: { from: '2024-09-01', to: '2025-06-30', alpha: 0.0125, z: -2.241402728 }", "look1: { from: '2024-09-01', to: '2025-06-30', alpha: 0.0125, z: -2.24 }"),
  R('decide: the base counts are (122, 43, 70)', 'baseCounts: [122, 43, 69],', 'baseCounts: [122, 43, 70],'),
  R('decide: K is 4', '  K: 3,\n', '  K: 4,\n'),
  R('decide: the slope step tolerance is loose', 'slopeStepTol: 1e-12,', 'slopeStepTol: 1e-2,'),
  R('look2Gate: the deadline day itself is NO VERDICT', "if (today > RULE.look2.deadline) return 'NO VERDICT'", "if (today >= RULE.look2.deadline) return 'NO VERDICT'"),
  R('look2Gate: runs whatever the Look 1 verdict', "state.look1Verdict !== 'CONTINUE TO LOOK 2' || !recomputed", 'false'),
  R('look2Gate: runs without an agreeing Look 1 recomputation', "state.look1Verdict !== 'CONTINUE TO LOOK 2' || !recomputed", "state.look1Verdict !== 'CONTINUE TO LOOK 2'"),
  R('look2Gate: a committed Look 2 verdict is not DONE', "if (committed) return 'DONE'", ''),
  R('look2Gate: a count that is not a non-negative integer is accepted', "if (!Number.isInteger(v) || v < 0) throw new Error('a stop or repair count must be a non-negative integer')", ''),
  R('look2Gate: a flag that is not a boolean is accepted', "if (typeof v !== 'boolean') throw new Error('a flag must be a boolean')", ''),
]

const run = (dir) => new Promise((resolve) => {
  const p = spawn(process.execPath, ['scripts/check-uefa-replicate.mjs'], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] })
  let out = ''
  p.stdout.on('data', d => { out += d }); p.stderr.on('data', d => { out += d })
  const t = setTimeout(() => p.kill('SIGKILL'), 180000)
  p.on('close', code => { clearTimeout(t); resolve({ code, out }) })
})
const stage = (name, overrides = {}) => {
  const dir = path.join(root, name)
  for (const f of TREE) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), overrides[f] ?? SRC[f]) }
  return dir
}

const control = await run(stage('control'))
if (control.code !== 0) { console.log('FAIL: the unmutated copy does not pass its own checks; nothing was mutated.\n' + control.out.split('\n').slice(-8).join('\n')); process.exit(1) }
console.log(`control: the unmutated copy passes its checks (${control.out.split('\n').filter(l => /^\s+ok\s/.test(l)).length} checks)\n`)

let caught = 0, harnessErrors = 0
for (const [i, m] of MUTANTS.entries()) {
  const hits = SRC[m.file].split(m.anchor).length - 1
  if (hits !== 1) { console.log(`HARNESS ERROR  ${m.name}\n               anchor matched ${hits} times in ${m.file}, expected 1: NOTHING MUTATED`); harnessErrors++; continue }
  if (m.anchor === m.replacement) { console.log(`HARNESS ERROR  ${m.name}\n               replacement equals the anchor`); harnessErrors++; continue }
  const r = await run(stage(`m${i}`, { [m.file]: SRC[m.file].replace(m.anchor, () => m.replacement) }))
  const fails = r.out.split('\n').filter(l => /^\s*FAIL\s/.test(l))
  const red = r.code !== 0 && fails.length > 0
  console.log(`${red ? 'CAUGHT    ' : r.code !== 0 ? 'BROKE     ' : 'NOT CAUGHT'} ${m.name}${red ? `\n            <- ${fails[0].trim().slice(0, 140)}` : r.code !== 0 ? `\n            ${r.out.split('\n').filter(Boolean).slice(-1)[0]?.slice(0, 140)}` : ''}`)
  if (red) caught++
}
console.log(`\n${caught} of ${MUTANTS.length} mutations caught${harnessErrors ? `, ${harnessErrors} harness errors` : ''}`)
process.exit(caught === MUTANTS.length && harnessErrors === 0 ? 0 : 1)
