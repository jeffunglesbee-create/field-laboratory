// Rule-90 harness for claim-check.mjs: a check that has only ever passed has
// proven nothing.
//
// C1 and C2 are the two to keep. C1 makes an unreachable source report HOLDS,
// which is the precise failure claim-check.mjs exists to end — a marker
// reported as holding when nothing verified it. C2 makes the parser blind to
// HTML comments, which returns the whole sweep to the false negative the
// CC-CMD warns about: zero markers found, a clean report, nothing checked.
//
// Each mutation asserts its anchor is unique and applied before reporting a
// verdict. NOT CAUGHT with nothing mutated is worse than no test.
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const F = 'scripts/claim-check.mjs'
const selfTestPasses = () => {
  try { execFileSync(process.execPath, [F, '--self-test'], { stdio: 'pipe' }); return true }
  catch { return false }
}

try { execFileSync('git', ['diff', '--quiet', '--', F], { stdio: 'pipe' }) }
catch { console.log(`NOTE — ${F} has uncommitted changes; restored byte-for-byte after each mutation.`) }
if (!selfTestPasses()) { console.log(`FAIL — ${F} --self-test is already red on clean source.`); process.exit(1) }
console.log(`baseline: ${F} --self-test passes on current source\n`)

const MUTATIONS = [
  ['C1 AN UNREACHABLE SOURCE REPORTS HOLDS',
   "  if (!resolved || resolved.unreachable) return 'UNCHECKABLE'",
   "  if (!resolved) return 'UNCHECKABLE'",
   'THE ONE THAT MATTERS: a marker reported as holding when nothing verified it — the exact failure this file was written to end, and it would have hidden all four ceiling.* controls behind the path bug found on the first sweep'],

  ['C2 the parser stops seeing HTML comments',
   "    const m = line.match(/<!--\\s*claim:\\s*([A-Za-z_][\\w.]*)\\s*=\\s*([^\\s-][^-]*?)\\s*-->/)",
   "    const m = line.match(/^\\s*([A-Za-z_][\\w.]*)\\s*=\\s*(.+)$/)",
   'THE OTHER ONE: the naive form the CC-CMD warns about. Zero markers found, a clean sweep of nothing, and no way to tell that from a repo with no stale claims'],

  ['C3 a quotation inside a fenced block counts as a claim',
   "    if (/^\\s*(```|~~~)/.test(line)) { fenced = !fenced; continue }",
   "    if (false) { fenced = !fenced; continue }",
   'CC-CMD-2026-09-11 quotes seven markers while specifying this harness; counting them invents claims no document is making'],

  ['C4 an undefined live value compares instead of refusing',
   "  if (resolved.value === undefined || resolved.value === null) return 'UNCHECKABLE'",
   "  if (false) return 'UNCHECKABLE'",
   'a resolver that returns nothing would compare nothing — and `null == 0` reads as agreement'],

  ['C5 comparison acquires a tolerance',
   "  if (Number.isFinite(a) && Number.isFinite(b)) return a === b ? 'HOLDS' : 'STALE'",
   "  if (Number.isFinite(a) && Number.isFinite(b)) return Math.abs(a - b) <= 8 ? 'HOLDS' : 'STALE'",
   '245 vs 252 is a gap of 7. A tolerance of any size swallows the control this whole document is built around'],

  // C6 ORIGINALLY TARGETED THE SWEEP'S no-resolver BRANCH and could never have
  // gone red: --self-test does not run the sweep, so mutating it proves nothing
  // about a suite that never executes it. Re-aimed at the resolver map, which
  // --self-test does check. The sweep's own no-resolver branch remains outside
  // this harness's coverage and is named as such in the COVERAGE line below.
  ['C6 a marker loses its resolver',
   "  'corpus.size':         () => CORPUS ? { value: CORPUS.length } : NO_CORPUS(),",
   "",
   'a marker whose resolver is deleted must be REPORTED, not dropped from the sweep — a table that silently shrinks looks identical to one where everything holds'],
  ['C7 the premise scanner stops collapsing whitespace',
   "    const ctx = (strip(lines[i - 1]) + ' ' + strip(line)).toLowerCase().replace(/\\s+/g, ' ')",
   "    const ctx = (strip(lines[i - 1]) + ' ' + strip(line)).toLowerCase()",
   'the third of three fixes one sentence needed. Without it the window reads "the  field app" with two spaces, Desk.fs:1369 escapes, and the scan reports fewer undated premises than exist'],

  ['C8 the premise scanner stops looking at the previous line',
   "    const ctx = (strip(lines[i - 1]) + ' ' + strip(line)).toLowerCase().replace(/\\s+/g, ' ')",
   "    const ctx = strip(line).toLowerCase().replace(/\\s+/g, ' ')",
   'the first of the three. A wrapped subject — "... The" / "FIELD app computes ..." — is invisible to a line-by-line match, which is the same blindness as the naive marker regex one layer up'],
  ['C9 THE TRANSCRIPTION READER STOPS ANCHORING ON ITS BINDING',
   "  const m = text.match(new RegExp(`\\\\blet\\\\s+${binding}\\\\s*:[^=]*=\\\\s*\\\\{[^}]*?\\\\bMax\\\\s*=\\\\s*(\\\\d+)<point>`, 's'))",
   "  const m = text.match(/\\bMax\\s*=\\s*(\\d+)<point>/)",
   'THE ONE THAT MATTERS for this half: nominal and relayReachable sit six lines apart, so a bare Max regex reads 300 for BOTH — relayReachable then reports DIVERGED against the wrong number, and a reader chasing 300-vs-252 is chasing a defect that is not there'],

  ['C10 a divergence reads as agreement',
   "  return local === live ? 'MATCHES' : 'DIVERGED'",
   "  return 'MATCHES'",
   'the copy and the source stop being compared at all, and the line that explains why two harnesses disagree becomes a line asserting they do not'],

  ['C11 an unreadable copy reads as a match',
   "  if (local === null || local === undefined) return 'UNCHECKABLE'",
   "  if (false) return 'UNCHECKABLE'",
   'null === null would then report MATCHES when NEITHER side was read — the UNCHECKABLE-is-never-HOLDS discipline, one section down'],
]

const original = readFileSync(F, 'utf8')
let caught = 0
for (const [name, anchor, repl, why] of MUTATIONS) {
  const hits = original.split(anchor).length - 1
  if (hits !== 1) { console.log(`FAIL       ${name}\n            anchor matched ${hits} times, expected 1 — NOTHING MUTATED.`); continue }
  const mutated = original.replace(anchor, repl)
  if (mutated === original) { console.log(`FAIL       ${name}\n            file unchanged — NOTHING MUTATED.`); continue }
  writeFileSync(F, mutated)
  const red = !selfTestPasses()
  writeFileSync(F, original)
  console.log(`${red ? 'CAUGHT    ' : 'NOT CAUGHT'} ${name}\n            (${why})`)
  if (red) caught++
}

console.log(`\n${caught} of ${MUTATIONS.length} mutations caught.`)
console.log('COVERAGE: the parser, the three states and the comparison, via --self-test.')
console.log('It does NOT re-run the live sweep, the relay import, or the corpus oracles,')
console.log('and it does NOT cover the sweep\'s own no-resolver branch — --self-test never')
console.log('executes the sweep, so no mutation of it could go red.')
process.exit(caught === MUTATIONS.length ? 0 : 1)
