#!/usr/bin/env node
// Rule 90 (MUTATE-FIRST-A) for outbox/forecast-fit-uefa-2026-11-27.mjs: scripts/check-uefa-fit.mjs is shown red under each deliberate break of the TOOLING before it is trusted.
// Every mutation puts one defect into a COPY of the tooling (the RULE block is never touched: the file's own hash check guards it, and a mutation anchor that falls inside the block is
// refused). A mutation counts as CAUGHT only when the check exits non-zero AND prints a FAIL line; a crash with no FAIL line is a harness error, not a catch. An anchor that does not
// occur exactly once applies NOTHING and fails the harness by name; a mutant identical to its source is refused. The CONTROL (the unmutated copy) must pass first.
//
// NOT mutated, on purpose (Rule 91): the individual conjuncts of `wellPosed` (the gradient bound, the Hessian test, the solver gap, the bound test): each is redundant with another on every
// input the checks can build, so removing ONE is an equivalent mutant; they are tested jointly (a good fit passes, a degenerate fit and a no-draw fit fail). The synthetic seasons are
// model-true or no-skill: they test the mechanics and the verdict's behaviour, not whether UEFA tables carry skill (that is the pre-registered run's question).
//
//   node scripts/mutate-uefa-fit.mjs
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

const SRC = fs.readFileSync('outbox/forecast-fit-uefa-2026-11-27.mjs', 'utf8')
const RULE_END = SRC.indexOf('// ==== RULE END') + '// ==== RULE END'.length
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uefa-fit-mut-'))
process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }))
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(130))

const RATING_LEAK = 'gap: eligible ? ((H.pts + (hg > ag ? 3 : hg === ag ? 1 : 0)) / (H.g + 1) + RULE.weights.gd * (H.gf + hg - H.ga - ag) / (H.g + 1) + RULE.weights.gf * (H.gf + hg) / (H.g + 1)) - ((A.pts + (ag > hg ? 3 : hg === ag ? 1 : 0)) / (A.g + 1) + RULE.weights.gd * (A.gf + ag - A.ga - hg) / (A.g + 1) + RULE.weights.gf * (A.gf + ag) / (A.g + 1)) : NaN'
const M = (name, anchor, replacement) => ({ name, anchor, replacement })
const MUTANTS = [
  M('ratings include the match being forecast (leak)', 'gap: eligible ? rating(H) - rating(A) : NaN', RATING_LEAK),
  M('eligibility one game too lenient (K - 1)', 'const eligible = H.g >= K && A.g >= K', 'const eligible = H.g >= K - 1 && A.g >= K - 1'),
  M('default K is 4', '{ N = RULE.N, K = RULE.K } = {}', '{ N = RULE.N, K = 4 } = {}'),
  M('league phase: both clubs < N becomes <= N', 'const isLp = H.n < N[label] && A.n < N[label]', 'const isLp = H.n <= N[label] && A.n <= N[label]'),
  M('league phase: both clubs < N becomes either club < N', 'const isLp = H.n < N[label] && A.n < N[label]', 'const isLp = H.n < N[label] || A.n < N[label]'),
  M('outcome coding swaps home win and away win', 'y: hg > ag ? 0 : hg === ag ? 1 : 2', 'y: hg > ag ? 2 : hg === ag ? 1 : 0'),
  M('home edge enters with the wrong sign', '(gap + c.home) / c.scale', '(gap - c.home) / c.scale'),
  M('scale multiplies instead of divides', '(gap + c.home) / c.scale', '(gap + c.home) * c.scale'),
  M('Brier scores only the true class', 'p.reduce((s, v, k) => s + (v - (k === y ? 1 : 0)) ** 2, 0)', '(1 - p[y]) ** 2'),
  M('paired z has the wrong sign', 'return mean(d) / (sd(d) / Math.sqrt(d.length))', 'return -mean(d) / (sd(d) / Math.sqrt(d.length))'),
  M('standard deviation divides by n, not n - 1', '/ (a.length - 1))', '/ a.length)'),
  M('shares are not normalised', 'fs.filter(f => f.y === k).length / fs.length)', 'fs.filter(f => f.y === k).length / (fs.length + 1))'),
  M('fit: the draw share is biased low', "const share = fs.filter(f => f.y === 1).length / n", "const share = fs.filter(f => f.y === 1).length * 0.9 / n"),
  M('fit: the home edge is dropped', 'const c = { home: b / a, scale: 1 / a, share }', 'const c = { home: 0, scale: 1 / a, share }'),
  M('folds do not leave the held-out competition out', 'const train = LABELS.filter(l => l !== label).flatMap(l => byLabel[l]), test = byLabel[label]', 'const train = LABELS.flatMap(l => byLabel[l]), test = byLabel[label]'),
  M('fold constants are not rounded before scoring', 'const c = { home: round2(fit.home), scale: round2(fit.scale), share: round2(fit.share) }', 'const c = { home: fit.home, scale: fit.scale, share: fit.share }'),
  M('full-fit constants are not rounded before scoring the frozen bundle', 'const full = { home: round2(fullFit.home), scale: round2(fullFit.scale), share: round2(fullFit.share) }', 'const full = { home: fullFit.home, scale: fullFit.scale, share: fullFit.share }'),
  M('a fold\'s benchmark uses the HELD-OUT competition\'s shares (leak)', 'const base = shares(train)', 'const base = shares(test)'),
  M('the frozen benchmark uses the frozen bundle\'s own shares (leak)', 'const baseAll = shares(all)', 'const baseAll = shares(fzE)'),
  M('U1\'s z has the wrong sign', 'z1: pairedZ(cv.bU, cv.bB)', 'z1: pairedZ(cv.bB, cv.bU)'),
  M('U1 is measured against the EPL constants, not the base rate', 'z1: pairedZ(cv.bU, cv.bB)', 'z1: pairedZ(cv.bU, cv.bEPL)'),
  M('slope: the regressor is the logit of the AWAY side', 'const x = pHome.map(p => Math.log(p / (1 - p)))', 'const x = pHome.map(p => Math.log((1 - p) / p))'),
  M('slope: the standard error is the intercept\'s', 'se: Math.sqrt(i00 / (i00 * i11 - i01 * i01))', 'se: Math.sqrt(i11 / (i00 * i11 - i01 * i01))'),
  M('the frozen difference has the wrong sign', 'forwardDiff: fzE.length ? mean(fU) - mean(fB) : NaN', 'forwardDiff: fzE.length ? mean(fB) - mean(fU) : NaN'),
  M('an empty frozen bundle reads as a pass (NaN becomes 0)', 'forwardDiff: fzE.length ? mean(fU) - mean(fB) : NaN', 'forwardDiff: fzE.length ? mean(fU) - mean(fB) : 0'),
  M('integrity: the recorded RULE hash is no longer compared', "ck('the RULE block equals the one recorded when it was fixed', sha256(ruleBlockText) === RULE_SHA256, sha256(ruleBlockText))", "ck('the RULE block equals the one recorded when it was fixed', true, sha256(ruleBlockText))"),
  M('integrity: the club-count check is dropped', 'for (const [club, x] of clubs) if (x.g !== N[label]) integrity.clubsNotOnN.push', 'for (const [club, x] of clubs) if (false) integrity.clubsNotOnN.push'),
  M('club identity: the alias map is not applied (home side)', 'const H = get(canon(r.home)), A = get(canon(r.away))', 'const H = get(r.home), A = get(canon(r.away))'),
  M('club identity: the alias map is not applied (away side)', 'const H = get(canon(r.home)), A = get(canon(r.away))', 'const H = get(canon(r.home)), A = get(r.away)'),
  M('club identity: an alias points at another alias (a chain)', "'Man United': 'Man Utd'", "'Man United': 'Rayo'"),
  M('integrity: the 36-clubs check is dropped', "ck('36 distinct clubs in each competition, in each bundle (a spelling the alias map does not know adds a name)', LABELS.every(l => T.distinctClubs[l] === 36 && F.distinctClubs[l] === 36),", "ck('36 distinct clubs in each competition, in each bundle (a spelling the alias map does not know adds a name)', true,"),
  M('integrity: null scores are not counted', 'if (r.home_score === null || r.home_score === undefined || r.away_score === null || r.away_score === undefined) integrity.nullScores++', 'if (false) integrity.nullScores++'),
  M('integrity: duplicate ESPN event ids are not counted', 'if (seenEspn.has(r.espn_event_id)) integrity.dupEspnIds++', 'if (false) integrity.dupEspnIds++'),
]

const run = (file) => new Promise(resolve => {
  const child = spawn('node', ['scripts/check-uefa-fit.mjs'], { env: { ...process.env, UEFA_FIT_FILE: file } })
  let out = ''
  child.stdout.on('data', d => (out += d)); child.stderr.on('data', d => (out += d))
  child.on('close', code => resolve({ code, out }))
})
const occurrences = (text, s) => text.split(s).length - 1
const only = (process.argv.find(a => a.startsWith('--only=')) ?? '').slice('--only='.length)   // a development aid: run the mutants whose name contains this text (the committed result is a full run)

const control = path.join(dir, 'control.mjs')
fs.writeFileSync(control, SRC)
const c = await run(control)
if (c.code !== 0) { console.log('CONTROL FAILED:\n' + c.out.split('\n').filter(l => /FAIL|checks passed/.test(l)).join('\n')); process.exit(2) }
console.log(`control: the check passes on the unmutated copy (${(c.out.match(/(\d+) of (\d+) checks passed/) ?? []).slice(0, 3).join(' ')})`)

let caught = 0, notCaught = 0, harnessErr = 0
const queue = MUTANTS.map((m, i) => ({ ...m, i })).filter(m => !only || m.name.includes(only))
const results = []
async function worker() {
  for (;;) {
    const m = queue.shift(); if (!m) return
    const n = occurrences(SRC, m.anchor)
    if (n !== 1) { results[m.i] = { m, status: 'HARNESS ERROR', detail: `anchor occurs ${n} times (want 1)` }; continue }
    if (SRC.indexOf(m.anchor) < RULE_END) { results[m.i] = { m, status: 'HARNESS ERROR', detail: 'anchor lies inside the RULE block (refused)' }; continue }
    const text = SRC.replace(m.anchor, () => m.replacement)
    if (text === SRC) { results[m.i] = { m, status: 'HARNESS ERROR', detail: 'mutant identical to source' }; continue }
    const f = path.join(dir, `mut-${m.i}.mjs`); fs.writeFileSync(f, text)
    const r = await run(f)
    const fails = r.out.split('\n').filter(l => l.startsWith('FAIL'))
    if (r.code !== 0 && fails.length > 0) results[m.i] = { m, status: 'CAUGHT', detail: fails[0].slice(0, 130) }
    else if (r.code !== 0) results[m.i] = { m, status: 'HARNESS ERROR', detail: 'non-zero exit with no FAIL line (a crash is not a catch): ' + r.out.split('\n').slice(-3).join(' | ').slice(0, 160) }
    else results[m.i] = { m, status: 'NOT CAUGHT', detail: '' }
  }
}
await Promise.all([worker(), worker(), worker(), worker()])
for (const r of results.filter(Boolean)) {
  if (r.status === 'CAUGHT') caught++; else if (r.status === 'NOT CAUGHT') notCaught++; else harnessErr++
  console.log(`${r.status.padEnd(13)} ${r.m.name}${r.detail ? `\n               ${r.detail}` : ''}`)
}
console.log(`\ncoverage: ${only ? `${results.filter(Boolean).length} of ${MUTANTS.length} mutants (filtered by "${only}")` : `${MUTANTS.length} mutants`} of the tooling (the RULE block untouched); caught ${caught}, not caught ${notCaught}, harness errors ${harnessErr}`)
process.exit(notCaught === 0 && harnessErr === 0 ? 0 : 1)
