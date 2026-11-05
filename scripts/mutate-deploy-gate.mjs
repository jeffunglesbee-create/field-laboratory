// Rule 90 for the deploy gate's HELD outcome, judged by deploy-gate.mjs
// --self-test. docs/CC-CMD-2026-10-17-deploy-gate-unverified-tree.md (option 1).
//
// G1 is the done condition's own mutation: held merged back into unknown, so a
// census commit reads "could NOT BE READ" again. G2 is the one that would change
// what ships: a held tree proceeding means verify-unseen bytes are published.
import { readFileSync, writeFileSync, mkdtempSync, realpathSync, cpSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const F = 'scripts/deploy-gate.mjs'
// THE CONTROL MUST SEE A RUN. A self-test that never started exits 0 and prints nothing (a copy reached through a symlinked path is not the entry point, so its
// isMain block is skipped), and an exit status alone reads that as a pass. What only a run produces is the tally line it prints when every check passed.
const TALLY = /^([1-9]\d*)\/\1 checks passed$/m
const passes = (at = F) => {
  try { return TALLY.test(execFileSync(process.execPath, [at, '--self-test'], { stdio: 'pipe', encoding: 'utf8' })) }
  catch { return false }
}

if (!passes()) { console.log(`FAIL — ${F} --self-test is already red on clean source.`); process.exit(1) }
console.log(`baseline: ${F} --self-test passes on current source\n`)

const MUTATIONS = [
  ['G1 HELD IS MERGED INTO UNKNOWN',
   "    case 'held':\n",
   "    case 'held-merged-away':\n",
   'THE DONE CONDITION: a census commit reads "could NOT BE READ" again, and the hourly noise is back'],

  ['G2 a held tree proceeds',
   "        heading: `Deploy held — ${at} carries the skip directive, so verify never runs on it`,",
   "        proceed: true, heading: `Deploy held — ${at} carries the skip directive, so verify never runs on it`,",
   'THE ONE THAT CHANGES WHAT SHIPS: bytes verify never saw are published, which option 1 ruled out'],

  ['G3 a real verdict on a skip-directive commit is overridden',
   "  decision === 'unknown' && skipDirective ? 'held' : decision",
   "  skipDirective ? 'held' : decision",
   'a red verify on a dispatched skip-directive commit is reported as merely held'],

  ['G4 every unknown is held',
   "  decision === 'unknown' && skipDirective ? 'held' : decision",
   "  decision === 'unknown' ? 'held' : decision",
   'a genuinely unreadable verdict (HTTP 403, shallow clone) is explained away as a skip'],
]

// THE MUTATION IS MADE ON A COPY of scripts/ in a temp directory, and the tracked scripts/deploy-gate.mjs is only read, as mutate-ppubs-probe.py,
// mutate-patent-watch.py and mutate-drama-backfill.py do. A run killed part-way leaves a temp directory in $TMPDIR and a clean tree: there is nothing to heal,
// and an uncommitted edit to scripts/deploy-gate.mjs is in the file and in the copy, never only in memory.
// TMP is the REAL path: reached through a symlink (macOS's $TMPDIR is under /var, which is one) node reports a script's import.meta.url as its real path and leaves
// process.argv[1] as the symlinked one, so isMain() is false, the self-test block is skipped and the copy exits 0 printing nothing. scripts/mutate-copy-check.mjs runs this
// script with $TMPDIR behind a symlink.
const TMP = realpathSync(mkdtempSync(join(tmpdir(), 'mutate-deploy-gate-')))
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
if (readFileSync(F, 'utf8') !== original) { console.log(`FAIL — ${F} was not restored`); process.exit(1) }
console.log(`\n${caught} of ${MUTATIONS.length} mutations caught.`)
console.log('COVERAGE: gateSummary and reinterpret via --self-test. It does NOT cover')
console.log("the git read of the commit message, the GitHub verdict fetch, or deploy.yml's wiring.")
process.exit(caught === MUTATIONS.length ? 0 : 1)
