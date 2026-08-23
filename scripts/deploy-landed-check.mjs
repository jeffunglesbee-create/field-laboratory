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
import { isDeployable, newestDeployable, newestDeployableCommit, containsCommit } from './deployable.mjs'

const SITE = process.env.SITE || 'https://field-laboratory.jeffunglesbee.workers.dev'
const SELF_TEST = process.argv.includes('--self-test')
const STRICT = process.argv.includes('--strict')

// isDeployable / newestDeployable live in ./deployable.mjs so this check and
// STATUS.md share one definition of "deployable" (and one that tracks
// verify.yml's paths-ignore).

/// The verdict, given the published sha, the newest deployable sha, and whether
/// that deployable commit is reachable in the walked history.
/// `contains` answers: does the published commit's tree already include the
/// newest deployable commit? true / false / null (cannot tell).
///
/// Equality is NOT the test. The deploy stamps the commit it ran on, so
/// version.txt routinely names a non-deployable commit sitting on top of the
/// deployable one — and that site is correct, not stale. Only a published
/// commit that does NOT contain the newest deployable change is behind.
const verdict = (published, deployable, contains) => {
  if (!published) return 'unknown'      // site down or no stamp
  if (!deployable) return 'nothing-to-deploy'
  if (published === deployable) return 'landed'
  if (contains === true) return 'landed-newer'
  if (contains === null) return 'unknown'   // shas not comparable — say so, do not accuse
  return 'behind'
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
    verdict('c', 'c', true) === 'landed', 'a correct landing is not recognised')
  // The case the previous version of this self-test got backwards. It asserted
  // verdict('a','c') === 'behind' where 'a' is the NEWEST commit in its own
  // fixture and 'c' an older deployable one — a descendant reported as stale.
  // The assertion encoded the bug, which is why it passed 6/6 while live-check
  // went red on a correct site.
  check('verdict: published is a docs commit ON TOP of the newest deployable → landed-newer',
    verdict('a', 'c', true) === 'landed-newer',
    'a docs commit on top of a landed deploy is reported as a failed deploy')
  check('verdict: published does NOT contain the newest deployable → behind',
    verdict('a', 'c', false) === 'behind', 'a genuinely stale deploy is not caught')
  check('verdict: shas not comparable → unknown, never behind',
    verdict('a', 'c', null) === 'unknown',
    'an uncomparable stamp is reported as a failed deploy')
  check('verdict: no stamp → unknown, no deployable commit → nothing-to-deploy',
    verdict(null, 'c', true) === 'unknown' && verdict('c', null, true) === 'nothing-to-deploy',
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

const v = verdict(published, deployable, containsCommit(deployable, published))
const short = s => (s ? s.slice(0, 7) : '—')

console.log(`\ndeploy-landed — is the published artifact the newest deployable commit?\n`)
console.log(`  published:          ${short(published)}`)
console.log(`  newest deployable:  ${short(deployable)}`)
console.log(`  HEAD:               ${short(headSha)}\n`)

switch (v) {
  case 'landed':
    console.log('  ✓ LANDED — the live site serves the newest deployable commit.')
    process.exit(0)
  case 'landed-newer':
    console.log(`  ✓ LANDED — published ${short(published)} is a non-deployable commit on top of ` +
                `${short(deployable)}; its tree contains every deployable change.`)
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
