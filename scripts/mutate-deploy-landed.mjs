// Rule 90 for the LANDABLE predicate in deployable.mjs, judged by
// deploy-landed-check.mjs --self-test. docs/CC-CMD-2026-10-16-deploy-landed-skip-ci.md
// Task 2: the three cases must each be able to go red.
//
// L1 is the one that matters: the check must keep catching a real undeployed
// change. L2 is the naive fix — walk back to the first skipped commit and stop
// — which turns "both present" green and hides the code commit underneath.
import { readFileSync, writeFileSync, mkdtempSync, cpSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const F = 'scripts/deployable.mjs'
const CHECK = 'scripts/deploy-landed-check.mjs'
// THE CONTROL MUST SEE A RUN. A self-test that never started exits 0 and prints nothing (a copy reached through a symlinked path is not the entry point, so its
// isMain block is skipped), and an exit status alone reads that as a pass. What only a run produces is the tally line it prints when every check passed.
const TALLY = /^([1-9]\d*)\/\1 checks passed$/m
const passes = (at = CHECK) => {
  try { return TALLY.test(execFileSync(process.execPath, [at, '--self-test'], { stdio: 'pipe', encoding: 'utf8' })) }
  catch { return false }
}

if (!passes()) { console.log(`FAIL — ${CHECK} --self-test is already red on clean source.`); process.exit(1) }
console.log(`baseline: ${CHECK} --self-test passes on current source\n`)

const MUTATIONS = [
  ['L1 NOTHING IS LANDABLE',
   "    : null\n",
   "    : 'mutated'\n",
   'THE ONE THAT MATTERS: a real undeployed change after published (case 1) reads as nothing-to-deploy, and the check can never go red again'],

  ['L2 the walk stops at the first skipped commit',
   "    if (!why) return { sha: c.sha, skipped }\n",
   "    if (!why) return { sha: c.sha, skipped }\n    if (/skip directive/.test(why)) return { sha: null, skipped }\n",
   'THE NAIVE FIX: "both present" (case 3) goes green, hiding the code commit beneath the census commit'],

  ['L3 the skip directive is not consulted',
   "    : carriesSkipDirective(message) ? 'skip directive (verify never runs)'\n",
   "    : false ? 'skip directive (verify never runs)'\n",
   'the original defect: a census commit after published (case 2) reads DEPLOY NOT LANDED on a correct site'],

  ['L4 the walked-past commits are not recorded',
   "    skipped.push({ sha: c.sha, why, other: otherSkipSpellings(c.message) })\n",
   "\n",
   'the check stops saying which commits it treated as non-deployable, which is how a wrong predicate survives'],

  ['L5 any skip-like spelling is honoured',
   "export const carriesSkipDirective = (message) => String(message ?? '').includes(SKIP_DIRECTIVE)",
   "export const carriesSkipDirective = (message) => /\\[(skip ci|ci skip|no ci|skip actions|actions skip)\\]/i.test(String(message ?? ''))",
   'an unmeasured spelling hides a code commit; if GitHub does not honour it, that change never deployed and the check calls it fine'],
]

// THE MUTATION IS MADE ON A COPY of scripts/ in a temp directory, and the tracked scripts/deployable.mjs is only read, as mutate-ppubs-probe.py,
// mutate-patent-watch.py and mutate-drama-backfill.py do. A run killed part-way leaves a temp directory in $TMPDIR and a clean tree: there is nothing to heal,
// and an uncommitted edit to scripts/deployable.mjs is in the file and in the copy, never only in memory.
const TMP = mkdtempSync(join(tmpdir(), 'mutate-deploy-landed-'))
process.on('exit', () => rmSync(TMP, { recursive: true, force: true }))
cpSync('scripts', join(TMP, 'scripts'), { recursive: true })
const COPY = join(TMP, F)
const RUN = join(TMP, CHECK)
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
if (readFileSync(F, 'utf8') !== original) { console.log(`FAIL — ${F} was not restored`); process.exit(1) }
console.log(`\n${caught} of ${MUTATIONS.length} mutations caught.`)
console.log('COVERAGE: newestLandable and the verdict via --self-test fixtures. It does')
console.log('NOT cover the git walk (newestLandableCommit), the version.txt fetch, or live-check.yml.')
process.exit(caught === MUTATIONS.length ? 0 : 1)
