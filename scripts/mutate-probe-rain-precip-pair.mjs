// Rule 90 for scripts/probe-rain-precip-pair.mjs, judged by its --self-test.
// docs/CC-CMD-2026-11-10-live-chip-refused-payload.md, Task 1: "registered
// mutations, each red by a named check".
//
// P1 and P5 are the ones that matter. P1 is the decoder's rule losing its
// tolerance, which turns every equal pair into a "violation" and the rate into
// noise. P5 is the quiet pass the CC-CMD forbids: a dry morning read as "none
// observed", which would close the question on a run that measured nothing.
import { readFileSync, writeFileSync, mkdtempSync, cpSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const F = 'scripts/probe-rain-precip-pair.mjs'
// THE CONTROL MUST SEE A RUN: an exit status alone reads a self-test that never
// started as a pass. Only a completed run prints the tally line.
const TALLY = /^([1-9]\d*)\/\1 checks passed$/m
// The output is kept on BOTH paths: a self-test that fails without throwing
// still has to be read for the check that went red (the first version kept it
// only on a throw and reported every caught mutation as caught by nothing).
const run = (at) => {
  let out
  try { out = execFileSync(process.execPath, [at, '--self-test'], { stdio: 'pipe', encoding: 'utf8' }) }
  catch (e) { out = String(e.stdout || '') }
  return { pass: TALLY.test(out), out }
}

const MUTATIONS = [
  ['P1 the tolerance is dropped', 'rain > precipitation + TOLERANCE', 'rain >= precipitation', 'V2'],
  ['P2 a placeholder venue becomes a ground', "if (PLACEHOLDER_VENUES.has(v.trim()) || !tableNames.has(v)", "if (!tableNames.has(v)", 'G2'],
  ['P3 postseason games are ignored', '...(payload?.games?.postseason ?? [])]', '...[]]', 'G1'],
  ['P4 a non-200 is read', "if (status !== 200) return { ok: false, why: `HTTP ${status}` }", 'if (false) return {}', 'R2'],
  ['P5 a dry start reads as a pass', ": wetAtStart ? 'none-observed-while-wet' : 'not-observable-dry'", ": 'none-observed-while-wet'", 'S6'],
  ['P6 a violation does not decide the verdict', "const verdict = violations.length ? 'refusal-observed'", "const verdict = false ? 'refusal-observed'", 'S1'],
  ['P7 coverage counts unread samples', 'checked: read.length', 'checked: samples.length', 'S2'],
  ['P8 a ground\'s sequence includes unread samples', 'const seq = read.filter(s => s.ground === g)', 'const seq = samples.filter(s => s.ground === g)', 'S4'],
  ['P9 attribution compares against the wrong value', 'Math.abs(m.precipitation - pair.precipitation)', 'Math.abs(m.rain - pair.precipitation)', 'A1'],
  ['P10 the coverage line is not first', '    `checked ${s.checked} of ${s.expected} expected samples`,\n', '', 'O1'],
  ['P11 the wave drifts from the page\'s maxInFlight', 'export const WAVE = 4 ', 'export const WAVE = 8 ', 'C2'],
  ['P12 the tolerance drifts from the decoder\'s', 'export const TOLERANCE = 0.001 ', 'export const TOLERANCE = 0.01 ', 'C1'],
]

// Resolved: a copy reached through a symlinked $TMPDIR is not the entry point of its own file, so its
// isMain block would be skipped and every mutation would read as NOT CAUGHT (scripts/mutate-copy-check.mjs, clause 1).
const TMP = realpathSync(mkdtempSync(join(tmpdir(), 'mutate-probe-rain-precip-pair-')))
process.on('exit', () => rmSync(TMP, { recursive: true, force: true }))
cpSync('scripts', join(TMP, 'scripts'), { recursive: true })
const COPY = join(TMP, F)
const ORIG = readFileSync(F, 'utf8')

// The copy imports src/ by a cwd-relative path, as the tracked file does; run from the repo root.
if (!run(COPY).pass) { console.log(`FAIL — the UNMUTATED copy of ${F} is red`); process.exit(1) }
console.log('positive control: the unmutated copy passes\n')

let failed = 0
for (const [name, from, to, expect] of MUTATIONS) {
  const n = ORIG.split(from).length - 1
  if (n !== 1) { console.log(`FAIL  ${name}: anchor found ${n} times, must be exactly once — nothing mutated`); failed++; continue }
  const mutated = ORIG.replace(from, to)
  if (mutated === ORIG) { console.log(`FAIL  ${name}: replacement changed nothing`); failed++; continue }
  writeFileSync(COPY, mutated)
  const r = run(COPY)
  const named = new RegExp(`^FAIL  ${expect} `, 'm').test(r.out)
  if (r.pass) { console.log(`FAIL  ${name}: NOT CAUGHT`); failed++ }
  else if (!named) { console.log(`FAIL  ${name}: red, but not by ${expect}`); failed++ }
  else console.log(`ok    ${name}: caught by ${expect}`)
  writeFileSync(COPY, ORIG)
}
console.log(`\n${MUTATIONS.length - failed} of ${MUTATIONS.length} mutations caught, each by its named check`)
process.exit(failed ? 1 : 0)
