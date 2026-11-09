// MUTATION PROOF for the verdict stage of candidate C: outbox/forecast-fit-c-2026-11-09.mjs and its independent recomputation
// outbox/forecast-fit-c-crosscheck-2026-11-09.py (fit mode). field-relay-nba's Rule 90 (MUTATE-FIRST-A): a check that has only ever passed has proven nothing.
//
// Each mutation breaks ONE thing (a few break two on purpose, and say so), runs the fit script and, on the dump it wrote, the Python recomputation, and requires that the SPECIFIC
// checks that exist to catch that break are the ones that go red, not merely that something is red.
//
// The harness holds itself to the same rule.
//   - Every edit asserts its anchor occurs EXACTLY ONCE and that the text changed; a mutation whose anchor does not hold is reported BROKEN, never CAUGHT or NOT CAUGHT. The edit
//     function is itself tried on three bad edits (absent anchor, repeated anchor, an edit that changes nothing) before anything runs, and the result is printed.
//   - A crash is not a catch: a mutated script that dies before writing its dump has no red check, so none of its expected checks is red, so it is NOT CAUGHT.
//   - The control (nothing broken) must show: the script green (every check, no rule line red), the rule block hashing to the value committed in 3ff1763, the last line
//     "VERDICT: SHIP", and the Python recomputation green.
//   - Mutations inside the rule block are labelled as such, and the label is checked against the block's observed hash (a wrong label is BROKEN, not trusted).
//
// TWO MUTATIONS ARE CAUGHT BY THE HARNESS AND NOT BY THE SCRIPT, and are listed that way. The script has no check on how its own last line is wired: "N7 vetoes when a check is
// red" is tested on decide() with a literal, but nothing in the script asserts that the call site passes the real check count, or that the printed line follows the decision.
// The harness asserts the invariant for every run: if any check or rule line is red, the last line must say DO NOT SHIP. Mutations 26 and 27 break the call site and the printed
// line (each alongside a changed 2024-25 score, so that something IS red) and are caught only by that invariant. They are reported as "caught by the harness invariant".
//
// FIRST RUN, 34 of 35: mutation 18 (C scored with table-v1's constants) was NOT CAUGHT. Investigated, not excused. C minus table-v1 is then zero in every match, so the paired z is 0/0; the
// JavaScript writes that NaN into the dump as null; and the Python recomputation died on `float - None` BEFORE printing anything, so the check that should have gone red ("mean Brier of C ...")
// was never shown. The defect was in the Python file: it prints its checks at the end, so an exception discarded the ones already recorded, and a null was not a failed comparison. Fixed in
// the Python file (a null is read as NaN; an exception prints the checks recorded so far and adds a failing line). Its output on the real dump is byte-identical before and after the fix
// (diff empty). Second run: 35 of 35.
//
// USAGE.  node outbox/forecast-fit-c-mutation-2026-11-09.mjs <2025-26 sources-dir> <2024-25 bundle .json> <2026-27 bundle .json>
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const [SOURCES, BUNDLE_A, BUNDLE_B] = process.argv.slice(2)
if (!SOURCES || !BUNDLE_A || !BUNDLE_B) { console.error('usage: node outbox/forecast-fit-c-mutation-2026-11-09.mjs <2025-26 sources-dir> <2024-25 bundle .json> <2026-27 bundle .json>'); process.exit(2) }
const here = path.dirname(fileURLToPath(import.meta.url))
const SCRIPT = path.join(here, 'forecast-fit-c-2026-11-09.mjs')
const PY = path.join(here, 'forecast-fit-c-crosscheck-2026-11-09.py')
const PINNED_RULE_HASH = '36d98f5df1f891265024b15b3921e3a8369b4b144bac9a24a36d2eeb7b5ca13f'   // the rule block as committed in 3ff1763, before any 2024-25 model number
const scriptText = fs.readFileSync(SCRIPT, 'utf8'), pyText = fs.readFileSync(PY, 'utf8')
const bundleAText = fs.readFileSync(BUNDLE_A, 'utf8'), bundleBText = fs.readFileSync(BUNDLE_B, 'utf8')

const once = (text, find) => text.split(find).length - 1
const apply = (text, find, to) => {
  const n = once(text, find)
  if (n !== 1) throw new Error(`anchor occurs ${n} times, not once: ${JSON.stringify(find.slice(0, 70))}`)
  const out = text.replace(find, () => to)
  if (out === text) throw new Error('the edit changed nothing')
  return out
}
{
  const refused = [() => apply('abc', 'zzz', 'y'), () => apply('aa', 'a', 'b'), () => apply('abc', 'a', 'a')].filter(f => { try { f(); return false } catch { return true } }).length
  console.log(`harness self-test: ${refused} of 3 bad edits refused (an absent anchor, a repeated anchor, an edit that changes nothing)`)
  if (refused !== 3) { console.log('the edit function does not refuse bad edits: nothing below can be trusted'); process.exit(1) }
}

const parseJs = out => {
  const lines = out.split('\n')
  const tally = lines.map(l => /^(\d+) of (\d+) checks hold/.exec(l)).find(Boolean)
  return {
    checks: lines.filter(l => l.startsWith('FAIL ')).map(l => l.slice(5)),
    rules: lines.filter(l => /^ {2}FAIL N\d /.test(l)).map(l => 'RULE ' + l.trim().slice(5)),
    tally: tally ? [Number(tally[1]), Number(tally[2])] : null,
    verdict: lines.filter(l => l.startsWith('VERDICT: ')).pop() ?? '',
    hash: /^rule block .* sha256 ([0-9a-f]{64})/m.exec(out)?.[1] ?? '',
  }
}
function runPair({ script, py, bundleA, bundleB, tmp }) {
  const feat = path.join(tmp, 'features.json')
  const r = spawnSync(process.execPath, [script, SOURCES, bundleA, bundleB, `--dump-features=${feat}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const js = parseJs(r.stdout ?? '')
  let pyRed = [], pyCode = null, pyTally = null, dumped = fs.existsSync(feat)
  if (dumped) {
    const p = spawnSync('python3', ['-I', py, 'fit', feat, bundleA], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    pyCode = p.status
    pyRed = (p.stdout ?? '').split('\n').filter(l => l.startsWith('FAIL ')).map(l => 'PY ' + l.slice(5))
    const t = /^(\d+) of (\d+) checks hold/m.exec(p.stdout ?? ''); pyTally = t ? [Number(t[1]), Number(t[2])] : null
    if (p.status !== 0 && pyRed.length === 0) pyRed = ['PY (crashed) ' + (p.stderr ?? '').trim().split('\n').pop().slice(0, 100)]
  }
  const shipped = js.verdict.startsWith('VERDICT: SHIP')
  const jsRed = js.checks.length + js.rules.length
  return { code: r.status, js, dumped, pyCode, pyRed, pyTally, red: [...js.checks, ...js.rules, ...pyRed], jsRed, shipped, wiringOk: !(shipped && jsRed > 0), stderr: (r.stderr ?? '').trim().split('\n').pop().slice(0, 140) }
}

// a few anchors are long; they are named once here
const SETS_RULE = 'rule: usable(all).filter(f => f.pre >= 5)', SETS_OPEN = 'open: usable(all).filter(f => f.pre >= 1 && f.pre <= 4)'
const MUTATIONS = [
  // ---- the model, the table and the scores (flow into every number)
  { name: 'the model function: the draw share is multiplied by 1.01', script: s => apply(s, 'const pD = th.drawBase * Math.exp(-Math.abs(d) / th.drawDecay)', 'const pD = th.drawBase * 1.01 * Math.exp(-Math.abs(d) / th.drawDecay)'),
    expect: ['the parametrised model at the declared constants equals the compiled model', 'table-v1 on the training set reproduces the earlier record'] },
  { name: 'the model function: the logistic scale has the wrong sign', script: s => apply(s, '(1 / (1 + Math.exp(-d / th.scale)))', '(1 / (1 + Math.exp(d / th.scale)))'),
    expect: ['the parametrised model at the declared constants equals the compiled model', 'table-v1 on the training set reproduces the earlier record'] },
  { name: 'C\'s draw decay is 20, not infinite (the draw share would vary with the gap)', script: s => apply(s, 'const TC = { ...TH0, drawDecay: Infinity }', 'const TC = { ...TH0, drawDecay: 20 }'),
    expect: ['the parametrised model with infinite decay gives the same draw probability at every gap'] },
  { name: 'the table engine awards 2 points for a win', script: s => apply(s, 'if (r.hg > r.ag) th.pts += 3; else if (r.hg === r.ag) { th.pts++; ta.pts++ } else ta.pts += 3', 'if (r.hg > r.ag) th.pts += 2; else if (r.hg === r.ag) { th.pts++; ta.pts++ } else ta.pts += 3'),
    expect: ['table-v1 on the training set reproduces the earlier record', 'PY 2024-25 features re-derived from the bundle by an independent replay'] },
  { name: 'the rating weights goal difference 0.26, not 0.25', script: s => apply(s, '0.25 * ((t.gf - t.ga) / t.p)', '0.26 * ((t.gf - t.ga) / t.p)'),
    expect: ['the parametrised model at the declared constants equals the compiled model', 'PY 2024-25 features re-derived from the bundle by an independent replay'] },
  { name: 'log loss taken on the wrong outcome', script: s => apply(s, 'const logloss = (p, o) => -Math.log(Math.max(1e-12, p[o]))', 'const logloss = (p, o) => -Math.log(Math.max(1e-12, 1 - p[o]))'),
    expect: ['table-v1 on the training set reproduces the earlier record'] },
  // ---- the fit
  { name: 'the fit minimises Brier instead of log loss (both optimisers share the wrong objective)', script: s => apply(s, 's += logloss(probs(f.rh, f.ra, th), f.o); return s }', 's += brier(probs(f.rh, f.ra, th), f.o); return s }'),
    expect: ['C fit: the fitted constants rounded to two decimals are the ones quoted in the rule block', 'PY C fitted on the 2025-26 forecasts by BFGS', 'PY the JavaScript\'s log loss at its constants'] },
  { name: 'the optimiser returns its starting point', script: s => apply(s, 'const b = F.indexOf(Math.min(...F)); return { x: S[b], f: F[b] }', 'return { x: x0, f: fn(x0) }'),
    expect: ['RULE N6', 'C fit: the fitted constants rounded to two decimals are the ones quoted in the rule block', 'the 2025-26 cross-validated numbers equal those the rule block quotes'] },
  { name: 'cross-validation trains on every row, its own test rows included', script: s => apply(s, 'const tr = fs.filter((_, i) => i % cvFolds !== k)\n', 'const tr = fs\n'),
    expect: ['C fit: the cross-validation folds partition the matches and train on none of their own test rows', 'the 2025-26 cross-validated numbers equal those the rule block quotes'] },
  { name: 'the base-rate forecast is taken from 2024-25\'s own shares (a leak from the test season)', script: s => apply(s, 'const BASE = rates(trainFit)', 'const BASE = rates(freshFit)'),
    expect: ['the 2026-27 numbers equal those the rule block quotes', 'PY the base-rate forecast is the home / draw / away shares of the 330 training matches'] },
  { name: 'the constants are rounded up, not to nearest', script: s => apply(s, 'const r2 = v => Math.round(v * 100) / 100', 'const r2 = v => Math.ceil(v * 100) / 100'),
    expect: ['C fit: the fitted constants rounded to two decimals are the ones quoted in the rule block', 'PY the constants rounded to two decimals equal the JavaScript\'s'] },
  // ---- the sets
  { name: 'the opening weeks take 1-5 games, not 1-4', script: s => apply(s, SETS_OPEN, 'open: usable(all).filter(f => f.pre >= 1 && f.pre <= 5)'),
    expect: ['the six match sets are exactly the matches with both clubs on >= 5 games, or on 1-4 games'] },
  { name: 'the rule set takes clubs on >= 4 games, not >= 5', script: s => apply(s, SETS_RULE, 'rule: usable(all).filter(f => f.pre >= 4)'),
    expect: ['the six match sets are exactly the matches with both clubs on >= 5 games, or on 1-4 games'] },
  // ---- the statistics
  { name: 'the paired z leaves out the square root of n', script: s => apply(s, 'z: mean(d) / (sd(d) / Math.sqrt(d.length)) }', 'z: mean(d) / sd(d) }'),
    expect: ['the 2025-26 cross-validated numbers equal those the rule block quotes', 'the 2026-27 numbers equal those the rule block quotes', 'PY 2024-25 rule set: the paired z of C against table-v1', 'RULE N1'] },
  { name: 'the Newton slope solver has the wrong sign on its residual', script: s => apply(s, 'r = ys[i] - p, w = p * (1 - p)', 'r = p - ys[i], w = p * (1 - p)'),
    expect: ['slope: the two unrelated solvers agree to 1e-4'] },
  { name: 'the slope is fitted to away wins instead of home wins (both solvers share the wrong data)', script: s => apply(s, 'ys = fs.map(f => f.o === 0 ? 1 : 0)', 'ys = fs.map(f => f.o === 2 ? 1 : 0)'),
    expect: ['the 2026-27 numbers equal those the rule block quotes', 'the 2025-26 cross-validated numbers equal those the rule block quotes', 'PY 2024-25 rule set: C\'s home-win slope and its standard error'] },
  { name: 'the 2024-25 row is scored on the 2026-27 set', script: s => apply(s, "const rFresh = row('2024-25 RULE SET, both clubs >= 5 games', freshFit)", "const rFresh = row('2024-25 RULE SET, both clubs >= 5 games', holdFit)"),
    expect: ['PY 2024-25 rule set (330 forecasts): mean Brier of C', 'PY 2024-25 rule set: the paired z of C against table-v1'] },
  { name: 'C\'s rows are scored with table-v1\'s constants', script: s => apply(s, 'const c = score(fs, thC), v = score(fs, TH0), b = scoreBase(fs)', 'const c = score(fs, TH0), v = score(fs, TH0), b = scoreBase(fs)'),
    expect: ['the 2026-27 numbers equal those the rule block quotes', 'PY 2024-25 rule set (330 forecasts): mean Brier of C'] },
  // ---- the rule block (these change its hash; the harness checks that they do)
  { name: 'rule N1 compared the wrong way round, in decide()', inRuleBlock: true, script: s => apply(s, 'if (!(m.z1 <= RULE.z1))', 'if (!(m.z1 >= RULE.z1))'),
    expect: ['verdict logic: a candidate that meets every rule ships', 'the verdict function and the rule table above agree on N1-N6'] },
  { name: 'rule N1 lets a NaN through, in decide()', inRuleBlock: true, script: s => apply(s, 'if (!(m.z1 <= RULE.z1))', 'if (m.z1 > RULE.z1)'),
    expect: ['verdict logic: a NaN N1 z alone vetoes, and says so'] },
  { name: 'rule N4 judges one season only, in decide()', inRuleBlock: true, script: s => apply(s, 'if (!(m.openFreshC <= m.openFreshV1 && m.openHoldC <= m.openHoldV1))', 'if (!(m.openFreshC <= m.openFreshV1))'),
    expect: ['verdict logic: N4 (opening weeks worse in 2026-27) alone vetoes, and says so'] },
  { name: 'rule N5 accepts z = 0, in decide()', inRuleBlock: true, script: s => apply(s, 'if (!(m.z5 < 0))', 'if (!(m.z5 <= 0))'),
    expect: ['verdict logic: N5 (z 0) alone vetoes, and says so'] },
  { name: 'rule N3 tolerance collapsed from 1.96 to 0.1 standard errors', inRuleBlock: true, script: s => apply(s, 'slopeSigma: 1.96', 'slopeSigma: 0.1'),
    expect: ['verdict logic: N3 just inside its lower edge (slope 0.61, SE 0.2) still ships', 'RULE N3'] },
  { name: 'rule N1 threshold loosened from -2.0 to -3.0', inRuleBlock: true, script: s => apply(s, '{ z1: -2.0, z2: -1.645,', '{ z1: -3.0, z2: -1.645,'),
    expect: ['verdict logic: N1 at z -2.0 still ships', 'RULE N1'] },
  { name: 'rule N2 compared the wrong way round in the rule table (decide() untouched)', script: s => apply(s, 'm.z2 <= RULE.z2],', 'm.z2 >= RULE.z2],'),
    expect: ['the verdict function and the rule table above agree on N1-N6', 'PY rules N1-N6, recomputed here'] },
  // ---- the wiring from the checks to the last line (caught by the harness invariant, with a changed 2024-25 score so that something IS red)
  { name: 'WIRING: N7 is passed true instead of the check count (alongside a changed 2024-25 score)', wiring: true, bundleA: b => { b.matches[0].hg += 1 },
    script: s => apply(s, 'const final = decide({ ...m, checksOk: failed === 0 })', 'const final = decide({ ...m, checksOk: true })'),
    expect: ['2024-25: the final table the results make equals ESPN'] },
  { name: 'WIRING: the printed verdict ignores the decision (alongside a changed 2024-25 score)', wiring: true, bundleA: b => { b.matches[0].hg += 1 },
    script: s => apply(s, 'VERDICT: ${final.ship ?', 'VERDICT: ${true ?'),
    expect: ['2024-25: the final table the results make equals ESPN'] },
  // ---- the data
  { name: 'data: one 2024-25 score changed (the first match\'s home goals + 1)', bundleA: b => { b.matches[0].hg += 1 },
    expect: ['2024-25: the final table the results make equals ESPN', '2024-25: FPL\'s 380 fixtures hold the same matches by date and score'] },
  { name: 'data: one 2026-27 score changed (the first archive row\'s home goals + 1)', bundleB: b => { b.archive[0].hg += 1 },
    expect: ['2026-27: the bundle is the frozen file', '2026-27: the table the results make equals ESPN\'s current table'] },
  // ---- the Python recomputation itself (the script is untouched; the Python file is broken)
  { name: 'PYTHON: the fit objective is Brier', py: s => apply(s, 'f = lambda x: nll(probs_c(rh, ra, *unpack(x)), o).sum()', 'f = lambda x: brier(probs_c(rh, ra, *unpack(x)), o).sum()'),
    expect: ['PY C fitted on the 2025-26 forecasts by BFGS', 'PY 2025-26 five-fold cross-validated Brier'] },
  { name: 'PYTHON: the paired z uses the population standard deviation', py: s => apply(s, 'return d.mean() / (d.std(ddof=1) / math.sqrt(len(d)))', 'return d.mean() / (d.std(ddof=0) / math.sqrt(len(d)))'),
    expect: ['PY 2024-25 rule set: the paired z of C against table-v1'] },
  { name: 'PYTHON: the replay weights goal difference 0.20', py: s => apply(s, '0.25 * ((t[2] - t[3]) / t[0])', '0.20 * ((t[2] - t[3]) / t[0])'),
    expect: ['PY 2024-25 features re-derived from the bundle by an independent replay'] },
  { name: 'PYTHON: the slope standard error reads the intercept entry of the inverse Hessian', py: s => apply(s, 'math.sqrt(np.linalg.inv(Hh)[1, 1])', 'math.sqrt(np.linalg.inv(Hh)[0, 0])'),
    expect: ['PY 2024-25 rule set: C\'s home-win slope and its standard error'] },
  { name: 'PYTHON: the N1 threshold is -3.0', py: s => apply(s, "'N1': z1 <= -2.0", "'N1': z1 <= -3.0"),
    expect: ['PY rules N1-N6, recomputed here'] },
  { name: 'PYTHON: the base rate is the share NOT having each outcome', py: s => apply(s, '[np.mean(to == k) for k in range(3)]', '[np.mean(to != k) for k in range(3)]'),
    expect: ['PY the base-rate forecast is the home / draw / away shares of the 330 training matches'] },
]

const mk = () => fs.mkdtempSync(path.join(os.tmpdir(), 'fitc-mut-'))
console.log('CONTROL  (nothing broken)')
let tmp = mk()
const control = runPair({ script: SCRIPT, py: PY, bundleA: BUNDLE_A, bundleB: BUNDLE_B, tmp })
fs.rmSync(tmp, { recursive: true, force: true })
const controlOk = control.code === 0 && control.jsRed === 0 && control.js.tally && control.js.tally[0] === control.js.tally[1] && control.js.hash === PINNED_RULE_HASH
  && control.js.verdict.startsWith('VERDICT: SHIP table-v2') && control.dumped && control.pyCode === 0 && control.pyRed.length === 0 && control.pyTally && control.pyTally[0] === control.pyTally[1]
console.log(`  script exit ${control.code}, ${control.js.tally?.[0]} of ${control.js.tally?.[1]} checks hold, ${control.js.rules.length} rule lines red; rule block hash ${control.js.hash === PINNED_RULE_HASH ? 'equals the one committed in 3ff1763' : 'DIFFERS from the one committed in 3ff1763 (' + control.js.hash + ')'}; ${control.js.verdict.slice(0, 40)}`)
console.log(`  Python recomputation exit ${control.pyCode}, ${control.pyTally?.[0]} of ${control.pyTally?.[1]} checks hold`)
let caught = 0, broken = 0, byHarness = 0
if (!controlOk) { console.log('  the control is not as expected: no mutation result below can be trusted'); process.exitCode = 1 }
else {
  let i = 0
  for (const m of MUTATIONS) {
    i++
    tmp = mk()
    const mutScript = path.join(here, `.mut-fitc-${process.pid}.mjs`), mutPy = path.join(here, `.mut-fitc-${process.pid}.py`)
    const label = `${String(i).padStart(2)}. ${m.name}`
    try {
      let script = SCRIPT, py = PY, bundleA = BUNDLE_A, bundleB = BUNDLE_B
      if (m.script) { fs.writeFileSync(mutScript, m.script(scriptText)); script = mutScript }
      if (m.py) { fs.writeFileSync(mutPy, m.py(pyText)); py = mutPy }
      for (const [key, text, src] of [['bundleA', bundleAText, 'A'], ['bundleB', bundleBText, 'B']]) if (m[key]) {
        const b = JSON.parse(text), before = JSON.stringify(b); m[key](b)
        if (JSON.stringify(b) === before) throw new Error('the bundle edit changed nothing')
        const p = path.join(tmp, `bundle-${src}.json`); fs.writeFileSync(p, JSON.stringify(b)); if (src === 'A') bundleA = p; else bundleB = p
      }
      if (script === SCRIPT && py === PY && bundleA === BUNDLE_A && bundleB === BUNDLE_B) throw new Error('nothing was mutated')
      const r = runPair({ script, py, bundleA, bundleB, tmp })
      const changedHash = r.js.hash ? r.js.hash !== PINNED_RULE_HASH : null
      if (changedHash === null) throw new Error('the mutated script printed no rule-block hash (it did not start)')
      if (changedHash !== !!m.inRuleBlock) throw new Error(`labelled ${m.inRuleBlock ? 'inside' : 'outside'} the rule block, but its hash ${changedHash ? 'changed' : 'did not change'}`)
      const missing = m.expect.filter(e => !r.red.some(l => l.includes(e)))
      const wiringAsRequired = m.wiring ? !r.wiringOk : r.wiringOk
      const ok = missing.length === 0 && wiringAsRequired
      if (ok) { caught++; if (m.wiring) byHarness++ }
      console.log(`${ok ? (m.wiring ? 'CAUGHT (by the harness invariant)' : 'CAUGHT    ') : 'NOT CAUGHT'}  ${label}\n    script exit ${r.code}, Python exit ${r.pyCode}; last line: ${r.js.verdict.slice(0, 22) || '(none)'}; red: ${r.js.checks.length} checks + ${r.js.rules.length} rule lines + ${r.pyRed.length} Python checks; expected red: ${m.expect.length}, red as expected: ${m.expect.length - missing.length}; rule block ${changedHash ? 'changed' : 'unchanged'}${missing.length ? '; STILL GREEN: ' + missing.join(' | ') : ''}${wiringAsRequired ? '' : m.wiring ? '; the last line followed the red checks (the wiring was not broken)' : '; INVARIANT BROKEN: red checks and the last line says SHIP'}${r.red.length === 0 && r.stderr ? '; stderr: ' + r.stderr : ''}`)
    } catch (e) { broken++; console.log(`BROKEN  ${label}: ${e.message}`) }
    finally { fs.rmSync(tmp, { recursive: true, force: true }); fs.rmSync(mutScript, { force: true }); fs.rmSync(mutPy, { force: true }) }
  }
  const data = m => m.bundleA || m.bundleB
  const kinds = { script: MUTATIONS.filter(m => m.script && !data(m)).length, ruleBlock: MUTATIONS.filter(m => m.inRuleBlock).length, wiring: MUTATIONS.filter(m => m.script && data(m)).length, dataOnly: MUTATIONS.filter(m => !m.script && !m.py && data(m)).length, python: MUTATIONS.filter(m => m.py).length }
  console.log(`\n${caught} of ${MUTATIONS.length} mutations caught by the checks written to catch them (${byHarness} of them by the harness invariant, not by a check in the script), ${broken} broken harness anchors; control as expected`)
  console.log(`coverage: ${MUTATIONS.length} mutations = ${kinds.script} in the fit script alone (${kinds.ruleBlock} of them in the rule block), ${kinds.wiring} in its wiring alongside a changed score, ${kinds.dataOnly} to the data bundles alone, ${kinds.python} in the Python recomputation; each run uses the real 2025-26 sources and both real bundles`)
  process.exitCode = caught === MUTATIONS.length && broken === 0 ? 0 : 1
}
