// MUTATION PROOF for outbox/forecast-fit-2026-11-08.mjs and its independent recomputation outbox/forecast-fit-crosscheck-2026-11-08.py (field-relay-nba's Rule 90,
// MUTATE-FIRST-A: a check that has only ever passed has proven nothing). It breaks the data or the script one way at a time, runs the script AND the Python recomputation
// on the broken copy, and requires that the SPECIFIC checks that exist to catch that break are the ones that go red, not merely that the exit code is 1.
//
// The harness holds itself to the same rule: every edit asserts its anchor occurs EXACTLY ONCE and that the text changed, and a mutation whose anchor does not hold is
// reported as BROKEN, never as CAUGHT or NOT CAUGHT. The control (nothing broken) must show exactly the one red check the real run shows: candidate B's fit is not well
// posed on this data (that is the pre-registered finding, not a defect), and the Python recomputation must be fully green.
//
// Some mutations are expected to be caught ONLY by the Python recomputation (a wrong objective is invisible to two optimisers that minimise the same wrong objective);
// those list "PY ..." fragments.
//
// USAGE.  npm run build && node outbox/forecast-fit-mutation-2026-11-08.mjs <sources-dir> outbox/forecast-fit-holdout-2026-11-08.json
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const [src, bundlePath] = process.argv.slice(2)
if (!src || !bundlePath) { console.error('usage: node outbox/forecast-fit-mutation-2026-11-08.mjs <sources-dir> <hold-out bundle .json>'); process.exit(2) }
const here = path.dirname(fileURLToPath(import.meta.url))
const SCRIPT = path.join(here, 'forecast-fit-2026-11-08.mjs')
const PY = path.join(here, 'forecast-fit-crosscheck-2026-11-08.py')
const scriptText = fs.readFileSync(SCRIPT, 'utf8')
const bundleText = fs.readFileSync(bundlePath, 'utf8')
const OF = 'openfootball-2025-26.txt'
const BASELINE_RED = ['fit B: two unrelated solvers agree']

const once = (text, find) => text.split(find).length - 1
const apply = (text, find, to) => {
  const n = once(text, find)
  if (n !== 1) throw new Error(`anchor occurs ${n} times, not once: ${JSON.stringify(find.slice(0, 70))}`)
  const out = text.replace(find, () => to)
  if (out === text) throw new Error('the edit changed nothing')
  return out
}
function runBoth(script, dir, bundle, tmp) {
  const feat = path.join(tmp, 'features.json')
  const r = spawnSync(process.execPath, [script, dir, bundle, `--dump-features=${feat}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const red = (r.stdout ?? '').split('\n').filter(l => l.startsWith('FAIL ')).map(l => l.replace(/^FAIL /, ''))
  let pyRed = [], pyCode = null
  if (fs.existsSync(feat)) {
    const p = spawnSync('python3', ['-I', PY, feat], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    pyCode = p.status
    pyRed = (p.stdout ?? '').split('\n').filter(l => l.startsWith('FAIL ')).map(l => 'PY ' + l.replace(/^FAIL /, ''))
    if (p.status !== 0 && pyRed.length === 0) pyRed = ['PY (crashed) ' + (p.stderr ?? '').trim().split('\n').pop().slice(0, 100)]
  }
  return { code: r.status, pyCode, red: [...red, ...pyRed], stderr: (r.stderr ?? '').slice(0, 160) }
}

const MUTATIONS = [
  { name: 'a training score changed (Liverpool 4-2 -> 4-3)', data: t => apply(t, 'Liverpool  4-2 (1-0)  Bournemouth', 'Liverpool  4-3 (1-0)  Bournemouth'),
    expect: ['source openfootball is the pinned file', 'training: the final table the results make equals ESPN', 'precondition: the prior-season script'] },
  { name: 'a hold-out score changed (the first archive row\'s home goals + 1)', bundle: b => { b.archive[0].hg += 1 },
    expect: ['hold-out: the table the results make equals ESPN', 'FPL fixtures hold the same'] },
  { name: 'a hold-out match deleted from the bundle', bundle: b => { b.archive.splice(37, 1) },
    expect: ['EPL rows in the archive', 'archive\'s finished count equals ESPN\'s played count'] },
  { name: 'the first hold-out match dated before the training season ended', bundle: b => { b.archive[0].start = '2026-05-01T14:00:00Z' },
    expect: ['it begins after the training season ended'] },
  { name: 'the model-as-function given a wrong draw base (x 1.01)', script: s => apply(s, 'const pD = th.drawBase * Math.exp(-Math.abs(d) / th.drawDecay)', 'const pD = th.drawBase * 1.01 * Math.exp(-Math.abs(d) / th.drawDecay)'),
    expect: ['the parametrised model at the declared constants equals the compiled model', 'reproduces the earlier record'] },
  { name: 'the table engine awards 2 points for a win', script: s => apply(s, 'if (r.hg > r.ag) th.pts += 3; else if (r.hg === r.ag) { th.pts++; ta.pts++ } else ta.pts += 3', 'if (r.hg > r.ag) th.pts += 2; else if (r.hg === r.ag) { th.pts++; ta.pts++ } else ta.pts += 3'),
    expect: ['reproduces the earlier record', 'reproduces the 2026-27 record'] },
  { name: 'log loss taken on the wrong outcome', script: s => apply(s, '-Math.log(Math.max(1e-12, p[o]))', '-Math.log(Math.max(1e-12, 1 - p[o]))'),
    expect: ['reproduces the earlier record'] },
  { name: 'the fit minimises Brier instead of log loss (two optimisers, one wrong objective)', script: s => apply(s, 'for (const f of fs) s += logloss(probs(f.rh, f.ra, th), f.o); return s }', 'for (const f of fs) s += brier(probs(f.rh, f.ra, th), f.o); return s }'),
    expect: ['PY objective: table-v1\'s total log loss'] },
  { name: 'the optimiser returns its starting point', script: s => apply(s, 'const b = F.indexOf(Math.min(...F)); return { x: S[b], f: F[b] }', 'return { x: x0, f: fn(x0) }'),
    expect: ['fit A: two unrelated solvers agree'] },
  { name: 'cross-validation trains on every row, its own test rows included', script: s => apply(s, 'const tr = fs.filter((_, i) => i % cvFolds !== k)\n', 'const tr = fs\n'),
    expect: ['train on none of their own test rows'] },
  { name: 'rule R1 compared the wrong way round', script: s => apply(s, 'if (!(m.z1 <= RULE.z1))', 'if (!(m.z1 >= RULE.z1))'),
    expect: ['verdict logic: a candidate that meets every rule ships'] },
  { name: 'the paired z leaves out the square root of n', script: s => apply(s, 'z: mean(d) / (sd(d) / Math.sqrt(d.length)) }', 'z: mean(d) / sd(d) }'),
    expect: ['PY R1 inputs', 'PY R3 inputs'] },
  { name: 'the hold-out is scored with table-v1\'s constants instead of S\'s', script: s => apply(s, 'const row = (label, fs, thSv = thS) => {', 'const row = (label, fs, thSv = TH0) => {'),
    expect: ['PY R1 inputs'] },
  { name: 'the selection picks the other candidate', script: s => apply(s, "const S = selPair.z <= RULE.selectZ ? 'B' : 'A'", "const S = selPair.z <= RULE.selectZ ? 'A' : 'B'"),
    expect: ['PY selection'] },
  { name: 'the Newton slope solver has the wrong sign on its residual', script: s => apply(s, 'r = ys[i] - p, w = p * (1 - p)', 'r = p - ys[i], w = p * (1 - p)'),
    expect: ['slope: the two unrelated solvers agree'] },
  { name: 'the rule set takes clubs on >= 4 games, not >= 5', script: s => apply(s, 'const holdFit = usable(holdAll).filter(f => f.pre >= 5)', 'const holdFit = usable(holdAll).filter(f => f.pre >= 4)'),
    expect: ['the four match sets are exactly'] },
]

const mk = () => fs.mkdtempSync(path.join(os.tmpdir(), 'fit-mut-'))
console.log('CONTROL  (nothing broken)')
let tmp = mk()
const control = runBoth(SCRIPT, src, bundlePath, tmp)
fs.rmSync(tmp, { recursive: true, force: true })
const extraRed = control.red.filter(l => !BASELINE_RED.some(b => l.includes(b)))
const baselineSeen = BASELINE_RED.every(b => control.red.some(l => l.includes(b)))
const controlOk = control.code === 1 && control.pyCode === 0 && extraRed.length === 0 && baselineSeen
console.log(`  script exit ${control.code}; Python recomputation exit ${control.pyCode}; red: ${control.red.length} (expected: the ${BASELINE_RED.length} pre-registered finding${baselineSeen ? ', seen' : ', NOT SEEN'}); unexpected red: ${extraRed.length}`)
let caught = 0, broken = 0
if (!controlOk) { console.log('  the control is not as expected: no mutation result below can be trusted'); process.exitCode = 1 }
else {
  for (const m of MUTATIONS) {
    tmp = mk()
    const mutScript = path.join(here, `.mut-fit-${process.pid}.mjs`)
    try {
      let dir = src, script = SCRIPT, bundle = bundlePath
      if (m.data) {
        dir = path.join(tmp, 'src'); fs.mkdirSync(dir)
        for (const f of fs.readdirSync(src)) fs.copyFileSync(path.join(src, f), path.join(dir, f))
        fs.writeFileSync(path.join(dir, OF), m.data(fs.readFileSync(path.join(src, OF), 'utf8')))
      } else if (m.bundle) {
        const b = JSON.parse(bundleText); const before = JSON.stringify(b); m.bundle(b)
        if (JSON.stringify(b) === before) throw new Error('the edit changed nothing')
        bundle = path.join(tmp, 'bundle.json'); fs.writeFileSync(bundle, JSON.stringify(b))
      } else { fs.writeFileSync(mutScript, m.script(scriptText)); script = mutScript }
      const r = runBoth(script, dir, bundle, tmp)
      const extra = r.red.filter(l => !BASELINE_RED.some(b => l.includes(b)))
      const missing = m.expect.filter(e => !extra.some(l => l.includes(e)))
      const ok = (r.code === 1 || r.pyCode !== 0) && missing.length === 0
      if (ok) caught++
      console.log(`${ok ? 'CAUGHT    ' : 'NOT CAUGHT'}  ${m.name}\n    script exit ${r.code}, Python exit ${r.pyCode}; new red checks: ${extra.length}; expected red: ${m.expect.length}, red as expected: ${m.expect.length - missing.length}${missing.length ? '; STILL GREEN: ' + missing.join(' | ') : ''}${r.stderr && extra.length === 0 ? '; stderr: ' + r.stderr : ''}`)
    } catch (e) { broken++; console.log(`BROKEN  ${m.name}: ${e.message}`) }
    finally { fs.rmSync(tmp, { recursive: true, force: true }); fs.rmSync(mutScript, { force: true }) }
  }
  console.log(`\n${caught} of ${MUTATIONS.length} mutations caught by the checks written to catch them (${broken} broken harness anchors); control as expected`)
  process.exitCode = caught === MUTATIONS.length && broken === 0 ? 0 : 1
}
