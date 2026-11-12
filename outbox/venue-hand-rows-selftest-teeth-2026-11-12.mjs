// Rule 90 for the self-test of outbox/venue-hand-rows-2026-11-12.mjs: a self-test that has only ever said "caught" has not shown it can say anything else.
// This breaks four copies of the verifier, each in the one way that must make its own --self-test report a problem, runs each, and requires the report.
//   1  a check goes blind (`no name is built twice` always passes)   -> the case aimed at it says NOT CAUGHT
//   2  a doctoring does nothing (a point moved by zero)              -> the case says its anchor failed: the edit left the page as it was
//   3  a doctoring's anchor is not in the text                       -> the case says its anchor is in the text 0 times
//   4  the P5624 judgement goes blind (`p5624Holds` is always true)  -> the case that doctors the search page's count says NOT CAUGHT
// Each doctoring of the verifier asserts its own anchor is in the verifier's source exactly once before it is applied, and that the copy differs from
// the original: a "caught" reported over a copy that was never changed would be worse than no test.
//
//   node outbox/venue-hand-rows-selftest-teeth-2026-11-12.mjs     (from the repository root; exits 1 unless all four were reported as wanted)

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createChecks, finish } from '../scripts/checks.mjs'

const SRC = 'outbox/venue-hand-rows-2026-11-12.mjs'
const source = readFileSync(SRC, 'utf8')
const { check, summarize } = createChecks()
const dir = mkdtempSync(join(tmpdir(), 'hand-rows-teeth-'))
const abs = f => pathToFileURL(resolve(f)).href
// the copy sits in a temporary directory, so its two relative imports are pointed at this repository's files
const relocate = t => t.replace("'../scripts/venue-source.mjs'", `'${abs('scripts/venue-source.mjs')}'`).replace("'../scripts/checks.mjs'", `'${abs('scripts/checks.mjs')}'`)
const run = file => spawnSync(process.execPath, [file, '--self-test'], { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 1 << 26 })

const control = run(SRC)
check('the untouched verifier\'s own self-test passes (the control)', control.status === 0 && /^\d+ of \d+ doctored copies caught by the check each was aimed at; 0 problem\(s\)\./m.test(control.stdout), `exit ${control.status}`)

const BREAKS = [
  { id: 'a-check-goes-blind', from: "check('no name is built twice', dup.length === 0, dup.join(', '))", to: "check('no name is built twice', true, dup.join(', '))",
    want: /FAILED\s+spec-duplicated:[^\n]*\n\s+NOT CAUGHT by "no name is built twice"/, claim: 'the check "no name is built twice" always passes, so the case aimed at it must say NOT CAUGHT' },
  { id: 'a-doctoring-does-nothing', from: 'o.lat = String(Number(o.lat) + 0.05)', to: 'o.lat = String(Number(o.lat) + 0)',
    want: /FAILED\s+point-moved:[^\n]*\n\s+CRASHED: self-test anchor: the edit left the page as it was/, claim: 'the point-moved case moves the point by zero, so it must say the edit left the page as it was' },
  { id: 'an-anchor-is-not-in-the-text', from: "'\"Allianz Stadium\", 45.1095, 7.6416, Weather.OpenAir', '\"Allianz Stadium\", 45.1095, 7.6416, Weather.Dome'", to: "'\"Allianz Stadium\", 45.1095, 7.6417, Weather.OpenAir', '\"Allianz Stadium\", 45.1095, 7.6416, Weather.Dome'",
    want: /FAILED\s+suite-table-changed:[^\n]*\n\s+CRASHED: self-test anchor: ".*" is in the text 0 times, not once/, claim: 'the suite-table-changed case looks for text that is not in src/Suite.fs, so it must say its anchor is in the text 0 times' },
  { id: 'a-judgement-goes-blind', from: 'export const p5624Holds = p => !!p.label', to: 'export const p5624Holds = p => true || !!p.label',
    want: /FAILED\s+p5624-search-count-lost:[^\n]*\n\s+NOT CAUGHT by "the saved Wikidata pages say P5624 is no roof property"/, claim: 'the P5624 judgement always holds, so the case that removes the search page\'s count must say NOT CAUGHT' },
]
for (const b of BREAKS) {
  const n = source.split(b.from).length - 1
  if (n !== 1) { check(`[${b.id}] its anchor is in the verifier's source exactly once`, false, `${n} times`); continue }
  const doctored = relocate(source.replace(b.from, () => b.to))
  if (doctored === relocate(source)) { check(`[${b.id}] the copy differs from the original`, false, 'identical'); continue }
  const file = join(dir, `${b.id}.mjs`)
  writeFileSync(file, doctored)
  const r = run(file)
  check(`[${b.id}] ${b.claim}`, r.status === 1 && b.want.test(r.stdout), `exit ${r.status}; ${r.stdout.split('\n').filter(l => /FAILED|NOT CAUGHT|CRASHED/.test(l)).slice(0, 3).join(' | ')}${r.stderr ? ` | stderr: ${r.stderr.slice(0, 200)}` : ''}`)
}
rmSync(dir, { recursive: true, force: true })
console.log(`checked ${BREAKS.length} of ${BREAKS.length} broken copies of the verifier (and one control); each must make its own self-test report the problem it was broken to cause.`)
finish(summarize())
