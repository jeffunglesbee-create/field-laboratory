// Rule 90 for the deploy gate's HELD outcome, judged by deploy-gate.mjs
// --self-test. docs/CC-CMD-2026-10-17-deploy-gate-unverified-tree.md (option 1).
//
// G1 is the done condition's own mutation: held merged back into unknown, so a
// census commit reads "could NOT BE READ" again. G2 is the one that would change
// what ships: a held tree proceeding means verify-unseen bytes are published.
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const F = 'scripts/deploy-gate.mjs'
const passes = () => {
  try { execFileSync(process.execPath, [F, '--self-test'], { stdio: 'pipe' }); return true }
  catch { return false }
}

try { execFileSync('git', ['diff', '--quiet', '--', F], { stdio: 'pipe' }) }
catch { console.log(`NOTE — ${F} has uncommitted changes; restored byte-for-byte after each mutation.`) }
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

const original = readFileSync(F, 'utf8')
let caught = 0
for (const [name, anchor, repl, why] of MUTATIONS) {
  const hits = original.split(anchor).length - 1
  if (hits !== 1) { console.log(`FAIL       ${name}\n            anchor matched ${hits} times, expected 1 — NOTHING MUTATED.`); continue }
  const mutated = original.replace(anchor, repl)
  if (mutated === original) { console.log(`FAIL       ${name}\n            replacement was a no-op — NOTHING MUTATED.`); continue }
  writeFileSync(F, mutated)
  const survived = passes()
  writeFileSync(F, original)
  console.log(`${survived ? 'NOT CAUGHT' : 'CAUGHT    '} ${name}\n            (${why})`)
  if (!survived) caught++
}
if (readFileSync(F, 'utf8') !== original) { console.log(`FAIL — ${F} was not restored`); process.exit(1) }
console.log(`\n${caught} of ${MUTATIONS.length} mutations caught.`)
console.log('COVERAGE: gateSummary and reinterpret via --self-test. It does NOT cover')
console.log("the git read of the commit message, the GitHub verdict fetch, or deploy.yml's wiring.")
process.exit(caught === MUTATIONS.length ? 0 : 1)
