// MUTATION PROOF for outbox/forecast-backtest-prior-season-2026-11-08.mjs (field-relay-nba's Rule 90, MUTATE-FIRST-A: a check that has only ever passed has
// proven nothing). Its first run found one inert check in the script it tests (a match lost from the results still passed the pairing check); that is recorded
// in outbox/cc-session-2026-11-08-calibrate-prior-season.md, and the version committed here is the run after the fix. It breaks the data or the script one way at a time, runs the script on the broken copy, and requires that the SPECIFIC checks that
// exist to catch that break are the ones that go red, not merely that the exit code is 1 (a changed byte already fails the source-hash check, so the exit code alone
// would pass a script whose other checks were all inert).
//
// The harness holds itself to the same rule: every edit asserts its anchor occurs EXACTLY ONCE and that the text changed, and a mutation whose anchor does not
// hold is reported as BROKEN, never as NOT CAUGHT or CAUGHT. The control (nothing broken) must exit 0 first.
//
// USAGE.  npm run build && node outbox/forecast-backtest-prior-season-mutation-2026-11-08.mjs <sources-dir> <2026-27-season-dir>
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const [src, season] = process.argv.slice(2)
if (!src || !season) { console.error('usage: node outbox/forecast-backtest-prior-season-mutation-2026-11-08.mjs <sources-dir> <2026-27-season-dir>'); process.exit(2) }
const here = path.dirname(fileURLToPath(import.meta.url))
const SCRIPT = path.join(here, 'forecast-backtest-prior-season-2026-11-08.mjs')
const scriptText = fs.readFileSync(SCRIPT, 'utf8')
const OF = 'openfootball-2025-26.txt'

const once = (text, find) => text.split(find).length - 1
const apply = (text, find, to) => {
  const n = once(text, find)
  if (n !== 1) throw new Error(`anchor occurs ${n} times, not once: ${JSON.stringify(find.slice(0, 60))}`)
  const out = text.replace(find, () => to)
  if (out === text) throw new Error('the edit changed nothing')
  return out
}
const run = (script, dir) => {
  const r = spawnSync(process.execPath, [script, dir, season], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const lines = (r.stdout ?? '').split('\n')
  return { code: r.status, failed: lines.filter(l => l.startsWith('FAIL ')), summary: lines.find(l => / checks hold;/.test(l)) ?? '', stderr: (r.stderr ?? '').slice(0, 200) }
}

const MUTATIONS = [
  { name: 'one score changed (Liverpool 4-2 -> 4-3)', data: t => apply(t, 'Liverpool  4-2 (1-0)  Bournemouth', 'Liverpool  4-3 (1-0)  Bournemouth'),
    expect: ['results-derived final table equals ESPN', 'fpl: the same multiset'] },
  { name: 'a weekday name wrong (Sat Aug 16 -> Sun Aug 16)', data: t => apply(t, '\nSat Aug 16\n', '\nSun Aug 16\n'),
    expect: ['every date header names its own weekday'] },
  { name: 'a matchday moved a week with its weekday kept (Sat Aug 16 -> Sat Aug 23)', data: t => apply(t, '\nSat Aug 16\n', '\nSat Aug 23\n'),
    expect: ['fpl: the same multiset', 'dates never go backwards'] },
  { name: 'one match line deleted (Tottenham 3-0 Burnley)', data: t => apply(t, '  15:00   Tottenham Hotspur  3-0 (1-0)  Burnley   \n', ''),
    expect: ['are what the file holds', 'every club has 38 matches', 'FPL fixtures pairs one-to-one'] },
  { name: 'the plain-JS model given a wrong constant (draw base 0.28 -> 0.29)', script: s => apply(s, 'const pD = 0.28 *', 'const pD = 0.29 *'),
    expect: ['plain-JS recomputation'] },
  { name: 'the replay engine awards 2 points for a win', script: s => apply(s, 'if (r.hg > r.ag) th.pts += 3; else if (r.hg === r.ag) { th.pts++; ta.pts++ } else ta.pts += 3', 'if (r.hg > r.ag) th.pts += 2; else if (r.hg === r.ag) { th.pts++; ta.pts++ } else ta.pts += 3'),
    expect: ['oracle: this engine prints the sibling record', 'plain-JS recomputation'] },
  { name: 'the Newton slope solver given the wrong sign on its residual', script: s => apply(s, 'r = ys[i] - p, w = p * (1 - p)', 'r = p - ys[i], w = p * (1 - p)'),
    expect: ['slope: two unrelated solvers'] },
]

console.log(`CONTROL  (nothing broken)`)
const control = run(SCRIPT, src)
console.log(`  exit ${control.code}; ${control.summary.trim() || 'NO SUMMARY LINE'}; red: ${control.failed.length}`)
let caught = 0, broken = 0
const results = []
if (control.code !== 0 || control.failed.length) { console.log('  the control is not clean: no mutation result below can be trusted'); process.exitCode = 1 }
else {
  for (const m of MUTATIONS) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prior-mut-'))
    const mutScript = path.join(here, `.mut-prior-season-${process.pid}.mjs`)
    try {
      let dir = src, script = SCRIPT
      if (m.data) {
        dir = tmp
        for (const f of fs.readdirSync(src)) fs.copyFileSync(path.join(src, f), path.join(tmp, f))
        fs.writeFileSync(path.join(tmp, OF), m.data(fs.readFileSync(path.join(src, OF), 'utf8')))
      } else { fs.writeFileSync(mutScript, m.script(scriptText)); script = mutScript }
      const r = run(script, dir)
      const missing = m.expect.filter(e => !r.failed.some(l => l.includes(e)))
      const ok = r.code === 1 && missing.length === 0
      if (ok) caught++
      results.push({ name: m.name, ok })
      console.log(`${ok ? 'CAUGHT ' : 'NOT CAUGHT'}  ${m.name}\n    exit ${r.code}; red checks: ${r.failed.length}; expected red: ${m.expect.length}, red as expected: ${m.expect.length - missing.length}${missing.length ? '; STILL GREEN: ' + missing.join(' | ') : ''}${r.stderr ? '; stderr: ' + r.stderr : ''}`)
    } catch (e) { broken++; results.push({ name: m.name, ok: false }); console.log(`BROKEN  ${m.name}: ${e.message}`) }
    finally { fs.rmSync(tmp, { recursive: true, force: true }); fs.rmSync(mutScript, { force: true }) }
  }
  console.log(`\n${caught} of ${MUTATIONS.length} mutations caught by the checks written to catch them (${broken} broken harness anchors); control clean`)
  process.exitCode = caught === MUTATIONS.length && broken === 0 ? 0 : 1
}
