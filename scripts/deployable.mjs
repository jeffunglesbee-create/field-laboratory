// What counts as a DEPLOYABLE commit — one shared definition.
//
// The laboratory does not deploy docs-only or [skip ci] commits (verify.yml
// ignores docs/**, outbox/**, **/*.md, and build/deploy skip a stamp already
// live). So "published != main HEAD" is often correct, and the question worth
// answering is whether the published artifact is the newest DEPLOYABLE commit.
//
// Both the deploy-landed check and STATUS.md ask that question, so the ignore
// set lives here once rather than in two copies that could drift from each other
// or from verify.yml's paths-ignore.

import { execSync } from 'node:child_process'

/// Kept identical to verify.yml's paths-ignore.
export const isIgnored = f => f.startsWith('docs/') || f.startsWith('outbox/') || f.endsWith('.md')

/// A commit is deployable if it changes anything outside the ignore set.
export const isDeployable = files => files.some(f => !isIgnored(f))

/// The newest deployable commit given commits newest-first as {sha, files}.
/// Pure, for testing.
export const newestDeployable = commits => (commits.find(c => isDeployable(c.files)) || null)?.sha ?? null

/// The newest deployable commit on the current branch, by walking history
/// newest-first and stopping at the first deployable one — usually HEAD or a
/// commit or two back, so it rarely reads more than a handful. Returns null if
/// none is found within `limit` (or history is too shallow to reach one).
export const newestDeployableCommit = (limit = 100) => {
  const shas = execSync(`git log -${limit} --format=%H`, { encoding: 'utf8' }).trim().split('\n').filter(Boolean)
  for (const sha of shas) {
    const files = execSync(`git diff-tree --no-commit-id --name-only -r ${sha}`, { encoding: 'utf8' })
      .trim().split('\n').filter(Boolean)
    if (isDeployable(files)) return sha
  }
  return null
}

/// Does `descendant`'s tree already contain `ancestor`'s changes — i.e. is
/// `ancestor` an ancestor of, or equal to, `descendant`?
///
/// This exists because "published !== newestDeployable" was being read as "the
/// deploy did not land", and that is false whenever a non-deployable commit
/// lands on top: the deploy stamps the commit it RAN on, so version.txt can name
/// a docs commit whose tree still contains every deployable change. Measured
/// 2026-08-23: published 765549e (`status: refresh [skip ci]`, touching only
/// STATUS.md and outbox/INDEX.md) against newest-deployable 06c37db, which is
/// its parent. The site was correct and live-check called it DEPLOY NOT LANDED.
///
/// Returns true / false, or null when the comparison cannot be made at all
/// (either sha unknown to this clone — a shallow checkout, or a stamp from a
/// history that was rewritten). null must not be reported as "behind": not
/// knowing is not the same as being stale.
export const containsCommit = (ancestor, descendant) => {
  if (!ancestor || !descendant) return null
  try {
    execSync(`git cat-file -e ${ancestor}^{commit}`, { stdio: 'ignore' })
    execSync(`git cat-file -e ${descendant}^{commit}`, { stdio: 'ignore' })
  } catch { return null }
  try {
    execSync(`git merge-base --is-ancestor ${ancestor} ${descendant}`, { stdio: 'ignore' })
    return true
  } catch { return false }
}
