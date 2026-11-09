// Rule 90 for outbox/venue-infobox-effect-2026-11-09.mjs: each mutation below is applied to a COPY of the tool (next to it, so
// its relative imports resolve), the anchor is asserted to occur exactly once, the tool's own self-test is run, and the checks
// that go red are printed by name. A mutation whose anchor is not unique, or whose self-test stays green, is reported and
// counted as not caught. Run from the repository root:  node outbox/venue-infobox-effect-mutation-2026-11-09.mjs
import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const SRC = 'outbox/venue-infobox-effect-2026-11-09.mjs'
const TMP = 'outbox/venue-infobox-effect-2026-11-09.mutant.tmp.mjs'
const src = readFileSync(SRC, 'utf8')
const M = [
  ['witness-open-taken', "const closed = new Set(values.map(v => classOf(v, joined)).filter(c => c !== 'open'))", 'const closed = new Set(values.map(v => classOf(v, joined)))'],
  ['conflict-ignored', "if (closed.size > 1) return { state: 'conflict'", "if (closed.size > 5) return { state: 'conflict'"],
  ['disagreement-not-review', 'if (classes.size > 1) d =', 'if (classes.size > 5) d ='],
  ['witness-never-overrides-a-silent-lead', 'else if (d.roof !== witness.cls) d =', 'else if (d.roof === null) d ='],
  ['past-tense-dropped-from-status', "!d.roof || !row.zone || domeName || gone ? 'review'", "!d.roof || !row.zone || domeName ? 'review'"],
  ['control-basis-not-compared', 'base.roof === r.roof && base.basis === r.roofBasis && baseStatus === r.status', 'base.roof === r.roof && baseStatus === r.status'],
  ['control-status-not-compared', 'base.roof === r.roof && base.basis === r.roofBasis && baseStatus === r.status', 'base.roof === r.roof && base.basis === r.roofBasis'],
  ['uncached-counted-as-reproduced', "{ control.notComputable.push({ name: r.name, what: inp.what }); continue }", '{ control.same++; continue }'],
  ['coverage-denominator-is-the-replayed', 'of ${e.rows} rows; ${e.skipped.length} never reach it', 'of ${e.staged} rows; ${e.skipped.length} never reach it'],
  ['joining-test-any-class', 'evidenceRows.length >= 2 && classes.size === 1 &&', 'evidenceRows.length >= 2 && classes.size >= 1 &&'],
  ['joining-test-one-row', 'evidenceRows.length >= 2 &&', 'evidenceRows.length >= 1 &&'],
  ['joining-test-open-rows-count-as-closed', '&& closed.length === 1 ?', '&& closed.length >= 0 ?'],
  ['joined-term-matches-loosely', 'joined?.get(norm(v)) ?? ', '[...(joined ?? [])].find(([t]) => norm(v).includes(t))?.[1] ?? '],
  ['roof-only-change-not-listed', 'if (afterStatus !== r.status || after.roof !== r.roof) changed.push(line)', 'if (afterStatus !== r.status) changed.push(line)'],
  ['silent-field-counted-as-agreement', '(w.cls === null ? agreement.silent : w.cls === r.roof', '(w.cls === null ? agreement.agree : w.cls === r.roof'],
  ['witness-values-listed-as-vocabulary', "if (v === '' || classOf(v, joined) !== 'open') continue", "if (v === '') continue"],
]
let bad = 0
for (const [id, find, replace] of M) {
  const n = src.split(find).length - 1
  if (n !== 1) { console.log(`${id.padEnd(40)} ANCHOR COUNT ${n}: not applied, not counted as caught`); bad++; continue }
  writeFileSync(TMP, src.replace(find, () => replace))
  const out = spawnSync('node', [TMP, '--self-test'], { encoding: 'utf8' })
  rmSync(TMP, { force: true })
  const text = out.stdout + out.stderr
  const failed = [...text.matchAll(/^FAIL  (.*)$/gm)].map(m => m[1].slice(0, 90))
  const crashed = !failed.length && /TypeError|ReferenceError|SyntaxError/.test(text)
  console.log(`${id.padEnd(40)} exit ${out.status}  ${failed.length ? `${failed.length} FAIL: ${failed.join(' || ')}` : crashed ? `CRASH, no named check: ${text.split('\n').find(l => /Error/.test(l))?.slice(0, 90)}` : 'NO FAILURE'}`)
  if (!failed.length) bad++
}
console.log(`\n${M.length} mutations; ${bad} not red by a named check`)
process.exitCode = bad ? 1 : 0
