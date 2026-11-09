// Rule 90 for the old-vs-new diff tool (outbox/venue-infobox-source-diff-2026-11-09.mjs): each mutation below breaks one line of the tool's judgement or report in a
// COPY of it, and the tool's own self-test must go red by a named check. docs/CC-CMD-2026-11-09-venue-review-remainder.md, Task 2, option 3, Step B. Run from the
// repository root:
//   node outbox/venue-infobox-source-diff-mutation-2026-11-09.mjs
//
// The unmutated copy runs first as the control (a copy that cannot pass proves nothing about the ones that fail). Each anchor must occur exactly once in the tool, and
// the mutated text must differ from the original, or the mutation is reported and not counted. A crash (no FAIL line) is reported as a crash, not as caught. The copy
// sits beside the tool so that its relative imports resolve, and is removed after every run.
import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const TOOL = 'outbox/venue-infobox-source-diff-2026-11-09.mjs'
const TWIN = 'outbox/venue-infobox-source-diff-2026-11-09.whyred.tmp.mjs'
const src = readFileSync(TOOL, 'utf8')

const MUTATIONS = [
  ['unexpected-ignored', 'for (const u of unexpected) problems.push(', 'for (const u of []) problems.push('],
  ['missing-ignored', 'if (missing.length) problems.push(', 'if (false) problems.push('],
  ['wrong-ignored', 'for (const w of wrong) problems.push(', 'for (const w of []) problems.push('],
  ['basis-not-compared', "['kind', 'roof', 'basis'].filter(f => got[f] !== e[f])", "['kind', 'roof'].filter(f => got[f] !== e[f])"],
  ['one-sided-ignored', 'if (c.onlyOld.length || c.onlyNew.length) problems.push(', 'if (false) problems.push('],
  ['moved-ignored', 'for (const m of c.moved) problems.push(', 'for (const m of []) problems.push('],
  ['basis-only-ignored', 'for (const b of c.basisOnly) problems.push(', 'for (const b of []) problems.push('],
  ['stub-count-unchecked', 'if (stubs.length !== STUBS_IN_CC_CMD) problems.push(', 'if (false) problems.push('],
  ['stub-rows-count-unchecked', 'if (stubs.filter(s => s.name !== US_BANK).length !== STUB_ROWS_IN_CC_CMD) problems.push(', 'if (false) problems.push('],
  ['stub-missing-after-unchecked', 'for (const s of stubs) if (!s.after) problems.push(', 'for (const s of []) if (!s.after) problems.push('],
  ['stub-threshold-moved', 'export const STUB_MAX = 10', 'export const STUB_MAX = 15'],
  ['stub-boundary-exclusive', 'x.lead.length <= STUB_MAX', 'x.lead.length < STUB_MAX'],
  ['expected-roof-changed', "{ name: US_BANK, kind: 'review -> accepted', roof: 'dome',", "{ name: US_BANK, kind: 'review -> accepted', roof: 'retractable',"],
  ['report-omits-the-eight', 'for (const s of eight) o.push(', 'for (const s of []) o.push('],
  ['report-omits-a-denominator', 'COVERAGE: compared ${c.compared} of ${c.oldRows} old rows', 'COVERAGE: compared ${c.compared} old rows'],
  ['verdict-always-passes', 'export const verdict = j => (j.problems.length', 'export const verdict = j => (false'],
]

const run = text => {
  writeFileSync(TWIN, text)
  const out = spawnSync('node', [TWIN, '--self-test'], { encoding: 'utf8' })
  rmSync(TWIN, { force: true })
  const all = out.stdout + out.stderr
  return { status: out.status, text: all, failed: [...all.matchAll(/^FAIL  (.*)$/gm)].map(m => m[1].slice(0, 90)), passed: (all.match(/^PASS  /gm) ?? []).length }
}

const control = run(src)
console.log(`control: the unmutated copy of the tool, exit ${control.status}, ${control.passed} PASS, ${control.failed.length} FAIL`)
if (control.status !== 0 || control.failed.length || !control.passed) { console.log('the control did not pass, so no mutation below means anything'); process.exit(1) }

let bad = 0
for (const [id, find, replace] of MUTATIONS) {
  const n = src.split(find).length - 1
  if (n !== 1) { console.log(`${id}: ANCHOR COUNT ${n}`); bad++; continue }
  const mutated = src.replace(find, () => replace)
  if (mutated === src) { console.log(`${id}: the replacement is the text it replaces, so nothing was mutated`); bad++; continue }
  const res = run(mutated)
  const crashed = /TypeError|ReferenceError|SyntaxError/.test(res.text) && !res.failed.length
  console.log(`${id.padEnd(30)} exit ${res.status}  ${res.failed.length ? `${res.failed.length} FAIL: ${res.failed.join(' || ')}` : crashed ? `CRASH (no FAIL line): ${res.text.split('\n').find(l => /Error/.test(l))}` : 'NOT RED'}`)
  if (!res.failed.length) bad++
}
console.log(`\n${MUTATIONS.length} mutations applied; ${bad} not red by a named check`)
process.exitCode = bad ? 1 : 0
