// Rule 90 for the LANDABLE predicate in deployable.mjs, judged by
// deploy-landed-check.mjs --self-test. docs/CC-CMD-2026-10-16-deploy-landed-skip-ci.md
// Task 2: the three cases must each be able to go red.
//
// L1 is the one that matters: the check must keep catching a real undeployed
// change. L2 is the naive fix — walk back to the first skipped commit and stop
// — which turns "both present" green and hides the code commit underneath.
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const F = 'scripts/deployable.mjs'
const CHECK = 'scripts/deploy-landed-check.mjs'
const passes = () => {
  try { execFileSync(process.execPath, [CHECK, '--self-test'], { stdio: 'pipe' }); return true }
  catch { return false }
}

try { execFileSync('git', ['diff', '--quiet', '--', F], { stdio: 'pipe' }) }
catch { console.log(`NOTE — ${F} has uncommitted changes; restored byte-for-byte after each mutation.`) }
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
console.log('COVERAGE: newestLandable and the verdict via --self-test fixtures. It does')
console.log('NOT cover the git walk (newestLandableCommit), the version.txt fetch, or live-check.yml.')
process.exit(caught === MUTATIONS.length ? 0 : 1)
