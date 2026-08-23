// Did the deploy actually land? — the question the laboratory could not answer.
//
// A cross-repo comparison found the client proves its deploy landed (its gate
// asserts the live site serves the commit it just pushed) while the laboratory
// only reported, softly, that the published stamp was "not main HEAD" — leaving
// it unable to say whether what is published is what should be.
//
// Copying the client's check verbatim would be WRONG here. The client deploys
// every push; the laboratory deliberately does NOT deploy docs-only or [skip ci]
// commits (verify.yml ignores docs/**, outbox/**, **/*.md, and build/deploy skip
// a stamp that is already live). So "published != HEAD" is the EXPECTED state the
// moment a docs commit lands on top — a naive published==HEAD gate would go red
// on every STATUS refresh, which trains people to ignore red.
//
// The right question, and the one this answers, is: **is the published artifact
// the newest DEPLOYABLE commit?** If it is, the deploy landed correctly even
// though HEAD may be newer (docs on top). If it is not, the deploy genuinely did
// not land. That distinction is the thing the laboratory was missing.
//
//   --self-test  the classifier and verdict logic, against fixtures, no network.
//   (default)    report the verdict from the live site + git history.
//   --strict     additionally exit 1 when the verdict is "behind" (deploy did
//                not land) — for the post-deploy step where landing is expected.

import { execSync } from 'node:child_process'
import { createChecks } from './checks.mjs'
import { isDeployable, newestDeployable, newestDeployableCommit } from './deployable.mjs'

const SITE = process.env.SITE || 'https://field-laboratory.jeffunglesbee.workers.dev'
const SELF_TEST = process.argv.includes('--self-test')
const STRICT = process.argv.includes('--strict')

// isDeployable / newestDeployable live in ./deployable.mjs so this check and
// STATUS.md share one definition of "deployable" (and one that tracks
// verify.yml's paths-ignore).

/// The verdict, given the published sha, the newest deployable sha, and whether
/// that deployable commit is reachable in the walked history.
const verdict = (published, deployable) => {
  if (!published) return 'unknown'      // site down or no stamp
  if (!deployable) return 'nothing-to-deploy'
  return published === deployable ? 'landed' : 'behind'
}

if (SELF_TEST) {
  const { check, summarize } = createChecks()
  check('a docs-only / outbox / *.md commit is not deployable',
    !isDeployable(['docs/x.md']) && !isDeployable(['outbox/y.md']) &&
    !isDeployable(['README.md']) && !isDeployable(['STATUS.md']),
    'a docs-only commit is treated as deployable — it would false-alarm')
  check('a commit touching source/scripts/index/fonts IS deployable',
    isDeployable(['src/Palette.fs']) && isDeployable(['scripts/x.mjs']) &&
    isDeployable(['index.html']) && isDeployable(['docs/a.md', 'src/b.fs']),
    'a real code change is treated as non-deployable')
  check('newestDeployable skips docs commits to the first real one',
    newestDeployable([
      { sha: 'a', files: ['STATUS.md'] },
      { sha: 'b', files: ['outbox/n.md'] },
      { sha: 'c', files: ['src/x.fs'] },
    ]) === 'c',
    'the newest deployable commit is not found past docs commits')
  check('verdict: published IS the newest deployable → landed',
    verdict('c', 'c') === 'landed', 'a correct landing is not recognised')
  check('verdict: published is behind the newest deployable → behind',
    verdict('a', 'c') === 'behind', 'a stale deploy is not caught')
  check('verdict: no stamp → unknown, no deployable commit → nothing-to-deploy',
    verdict(null, 'c') === 'unknown' && verdict('c', null) === 'nothing-to-deploy',
    'the empty cases are misclassified')
  process.exit(summarize() === 0 ? 0 : 1)
}

// ── live ─────────────────────────────────────────────────────────────────────

// The newest deployable commit — usually HEAD or a commit or two back.
const deployable = newestDeployableCommit()
const headSha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()

let published = null
try {
  const r = await fetch(new URL('version.txt', SITE.endsWith('/') ? SITE : SITE + '/'),
    { signal: AbortSignal.timeout(20000) })
  if (r.ok) published = (await r.text()).trim()
} catch { /* site unreachable — verdict handles null */ }

const v = verdict(published, deployable)
const short = s => (s ? s.slice(0, 7) : '—')

console.log(`\ndeploy-landed — is the published artifact the newest deployable commit?\n`)
console.log(`  published:          ${short(published)}`)
console.log(`  newest deployable:  ${short(deployable)}`)
console.log(`  HEAD:               ${short(headSha)}\n`)

switch (v) {
  case 'landed':
    console.log('  ✓ LANDED — the live site serves the newest deployable commit.')
    process.exit(0)
  case 'nothing-to-deploy':
    console.log('  · nothing deployable in the walked history — no assertion to make.')
    process.exit(0)
  case 'unknown':
    console.log('::warning::the live site did not return a version stamp — cannot verify the deploy landed this run.')
    process.exit(0)
  case 'behind':
    console.log(`::${STRICT ? 'error' : 'warning'}::DEPLOY NOT LANDED — published ${short(published)} is behind the newest deployable commit ${short(deployable)}.`)
    process.exit(STRICT ? 1 : 0)
}
