// Rule 90 for scripts/weather-availability.mjs, judged by its --self-test.
// docs/CC-CMD-2026-11-18-split-live-weather-check.md, Task 4: every check of the availability
// reporter, broken on purpose and required red by its NAMED self-test check.
//
// A1 and A6 are the ones that matter. A1 is "fetch failed" coming back as the only label, the
// defect of the pair probe's run 1. A6 is a reporter that cannot write its record passing anyway:
// the one failure this never-gating step must still have.
import { readFileSync, writeFileSync, mkdtempSync, cpSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const F = 'scripts/weather-availability.mjs'
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
  ['A1 the cause is dropped for the message', "if (outcome.error) return { kind: 'not-answered', cause: causeKey(outcome.error) }", "if (outcome.error) return { kind: 'not-answered', cause: outcome.error.message }", 'C4'],
  ['A2 a refusal reads as an answer', "return d.tag === 0 ? { kind: 'answered' }", "return true ? { kind: 'answered' }", 'C2'],
  ['A3 a non-200 is decoded', "if (outcome.status !== 200) return { kind: 'not-answered', cause: `HTTP ${outcome.status}` }", "if (false) return {}", 'C3'],
  ['A4 every venue is asked, aliases twice', 'if (!seen.has(url)) seen.set(url, { venue: v.Name, url })', 'seen.set(v.Name, { venue: v.Name, url })', 'L1'],
  ['A5 a request that throws escapes', '  } catch (e) { return { error: errorOf(e) } }\n}', '  } finally {}\n}', 'R4'],
  ['A6 a record that cannot be written passes', '  appendFileSync(file, line + \'\\n\')', '  try { appendFileSync(file, line + \'\\n\') } catch { return }', 'W2'],
  ['A7 the ledger is overwritten, not appended', '  appendFileSync(file, line + \'\\n\')', '  writeFileSync(file, line + \'\\n\')', 'W1'],
  ['A8 the region is read from the wrong field', "const m = /runner=image \\S+ region (.+?) cloud /.exec(line ?? '')", "const m = /runner=image (\\S+) /.exec(line ?? '')", 'R3'],
  ['A9 a refusal is not a warning', 'const warning = rec.refused.length + notAnswered + rec.notAsked > 0', 'const warning = notAnswered + rec.notAsked > 0', 'O5'],
  ['A10 the coverage line is not first', '  const lines = [\n    `asked', '  const lines = [\n    `region: first`,\n    `asked', 'O1'],
  ['A12 the budget is ignored', '    if (clock() - started >= budgetMs) {', '    if (false) {', 'B1'],
  ['A13 the locations not asked are not counted', "notAsked: results.filter(r => r.kind === 'not-asked').length,", 'notAsked: 0,', 'B1'],
  ['A14 the coverage line hides what was not asked', "      (rec.notAsked ? `; ${rec.notAsked} not asked, the ${rec.budgetMs}ms budget spent` : ''),", "      '',", 'B2'],
  ['A11 the cap drifts from the page\'s', 'export const run = async ({ fetchImpl, venues, capMs = requestCapMs,', 'export const run = async ({ fetchImpl, venues, capMs = 15000,', 'K1'],
]

// Resolved: a copy reached through a symlinked $TMPDIR is not the entry point of its own file, so its
// isMain block would be skipped and every mutation would read as NOT CAUGHT (scripts/mutate-copy-check.mjs, clause 1).
const TMP = realpathSync(mkdtempSync(join(tmpdir(), 'mutate-weather-availability-')))
process.on('exit', () => rmSync(TMP, { recursive: true, force: true }))
cpSync('scripts', join(TMP, 'scripts'), { recursive: true })
// The script imports ../build/ relative to itself, so the copy needs the build beside it.
cpSync('build', join(TMP, 'build'), { recursive: true })
const COPY = join(TMP, F)
const ORIG = readFileSync(F, 'utf8')

// The self-test reads test/ by a cwd-relative path, as the tracked file does; run from the repo root.
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
