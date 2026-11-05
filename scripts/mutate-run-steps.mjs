// Rule 90 for run-steps.mjs.
//
// S1 and S2 are the pair to keep. S1 collapses UNKNOWN into zero — the
// substitution the module exists to refuse. S2 stops counting the tail at all,
// which is the seven-run blind spot reappearing in the tool built to end it.
import { readFileSync, writeFileSync, mkdtempSync, cpSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const F = 'scripts/run-steps.mjs'
const passes = (at = F) => {
  try { execFileSync(process.execPath, [at, '--self-test'], { stdio: 'pipe' }); return true }
  catch { return false }
}

if (!passes()) { console.log(`FAIL — ${F} --self-test is already red on clean source.`); process.exit(1) }
console.log(`baseline: ${F} --self-test passes on current source\n`)

const MUTATIONS = [
  ['S1 AN UNREADABLE RUN REPORTS ZERO SKIPPED',
   "  if (!Array.isArray(steps) || steps.length === 0) return null",
   "  if (!Array.isArray(steps)) steps = []",
   'THE ONE THAT MATTERS: "nothing was skipped" and "I could not tell" become the same sentence, and a run nobody could read files as a clean bill'],

  ['S2 the skip tail is never counted',
   "    skipped: real.filter(s => s.conclusion === 'skipped').length,",
   "    skipped: 0,",
   'THE OTHER ONE: the issue reports a red with no cost attached — exactly the seven runs this module was written from'],

  ['S3 the runner\'s own steps are counted as the suite\'s',
   "  const real = steps.filter(s => s && !/^(Set up job|Complete job|Post Run )/.test(s.name ?? ''))",
   "  const real = steps.filter(s => s)",
   'the denominator inflates by however many actions the job happens to use, so "44 of 69" drifts with the checkout count'],

  ['S4 a step still running counts as having run',
   "    ran: real.filter(s => s.conclusion === 'success' || s.conclusion === 'failure').length,",
   "    ran: real.filter(s => s.conclusion !== 'skipped').length,",
   'an in-progress job reports a complete tally, so a mid-run read looks like a finished one'],

  ['S5 the smallest failure is reported instead of the largest',
   "  return summaries.sort((a, b) => b.skipped - a.skipped)[0]",
   "  return summaries.sort((a, b) => a.skipped - b.skipped)[0]",
   'the job that hid the least is named, so the expensive red stays invisible behind the cheap one'],

  // THE ANCHOR SPANS BOTH LINES OF THE RETURN, and the first version of it did
  // not. It replaced only the opening template and left the `Nothing was
  // skipped` line concatenated on the end, so the self-test's regex still
  // matched and the mutation reported NOT CAUGHT against a check that was
  // working. The harness was wrong, not the module.
  ['S6 a zero tail goes quiet instead of saying so',
   "    return `**First failing step:** ${summary.failedStep} (${where}). ` +\n      `Nothing was skipped behind it — the other ${summary.total - 1} steps ran.`",
   "    return ''",
   'silence is indistinguishable from the tool not having run, which is the failure mode one layer up'],

  ['S7 the denominator is dropped from the line',
   "    `**${summary.skipped} of ${summary.total} steps did not run behind it.** ` +",
   "    `**${summary.skipped} steps did not run behind it.** ` +",
   'Rule 91: a count without its denominator is read as completeness — 44 means nothing without 69'],
]

// THE MUTATION IS MADE ON A COPY of scripts/ in a temp directory, and the tracked scripts/run-steps.mjs is only read, as mutate-ppubs-probe.py,
// mutate-patent-watch.py and mutate-drama-backfill.py do. A run killed part-way leaves a temp directory in $TMPDIR and a clean tree: there is nothing to heal,
// and an uncommitted edit to scripts/run-steps.mjs is in the file and in the copy, never only in memory.
const TMP = mkdtempSync(join(tmpdir(), 'mutate-run-steps-'))
process.on('exit', () => rmSync(TMP, { recursive: true, force: true }))
cpSync('scripts', join(TMP, 'scripts'), { recursive: true })
const COPY = join(TMP, F)
const RUN = join(TMP, F)
// POSITIVE CONTROL: the unmutated copy must pass, or "caught" below could mean only that the copy cannot run.
if (!passes(RUN)) { console.log('FAIL — the UNMUTATED copy is red, so no verdict below would be about the mutation.'); process.exit(1) }
console.log('positive control: the unmutated copy passes\n')
const original = readFileSync(F, 'utf8')
let caught = 0
for (const [name, anchor, repl, why] of MUTATIONS) {
  const hits = original.split(anchor).length - 1
  if (hits !== 1) { console.log(`FAIL       ${name}\n            anchor matched ${hits} times, expected 1 — NOTHING MUTATED.`); continue }
  const mutated = original.replace(anchor, repl)
  if (mutated === original) { console.log(`FAIL       ${name}\n            replacement was a no-op — NOTHING MUTATED.`); continue }
  writeFileSync(COPY, mutated)
  const survived = passes(RUN)
  writeFileSync(COPY, original)
  console.log(`${survived ? 'NOT CAUGHT' : 'CAUGHT    '} ${name}\n            (${why})`)
  if (!survived) caught++
}
console.log(`\n${caught} of ${MUTATIONS.length} mutations caught.`)
console.log('COVERAGE: stepSummary, worstFailure and costLine via --self-test. It does')
console.log('NOT cover the GitHub fetch, red-main-issue.mjs\'s body, or status.yml\'s wiring.')
process.exit(caught === MUTATIONS.length ? 0 : 1)
