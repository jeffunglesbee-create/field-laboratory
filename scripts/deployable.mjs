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

// ── LANDABLE: what a deploy can actually publish ────────────────────────────
// docs/CC-CMD-2026-10-16-deploy-landed-skip-ci.md. deploy.yml has NO skip
// condition of its own on the commit message. What stops a commit deploying is
// verify: the push path is `workflow_run` on verify's success, and the hourly
// path's gate (deploy-gate.mjs) needs verify's verdict on the commit. verify
// runs on a push unless the push only touches its paths-ignore (isIgnored
// above) or the push carries GitHub's skip directive. So a commit a deploy can
// publish is one that is path-deployable AND does not carry the directive.
//
// THAT IS A PER-PUSH RULE READ PER COMMIT, and the gap is measured, not
// assumed. Measured 2026-10-17 over the 46 commits back to verify's oldest listed run:
// verify ran on all 5 path-deployable commits without the directive that were
// a push's head, on none of the 34 with it, and not on d99bf50 — a non-head
// commit of a three-commit push (d99bf50, 7a5ff89, c0c6e0c in 37 s) whose one
// verify run is on c0c6e0c. The per-commit reading errs in ONE direction: a
// code commit stranded under a skipped push head still reads landable, so the
// check goes red on code that genuinely did not deploy. It never reports a
// stranded un-skipped code change as landed.
//
// ONLY the spelling measured in this repo is honoured: 40 of the last 400
// commit messages carry it and no other form appears. A spelling honoured here
// that GitHub does not honour would hide a real undeployed change; one GitHub
// honours that is missing here only goes red, visibly. `otherSkipSpellings`
// names any other form so it is seen rather than silently counted deployable.
export const SKIP_DIRECTIVE = '[skip' + ' ci]'   // assembled: see `otherSkipSpellings`
export const carriesSkipDirective = (message) => String(message ?? '').includes(SKIP_DIRECTIVE)
export const otherSkipSpellings = (message) =>
  (String(message ?? '').match(/\[(skip ci|ci skip|no ci|skip actions|actions skip)\]/gi) ?? [])
    .filter(t => t !== SKIP_DIRECTIVE)

/// Why a commit cannot be published by a deploy, or null if it can.
export const notLandableBecause = ({ files, message }) =>
  !isDeployable(files) ? 'docs-only (verify paths-ignore)'
    : carriesSkipDirective(message) ? 'skip directive (verify never runs)'
    : null

/// The newest landable commit given commits newest-first as {sha, files, message},
/// and every newer commit it walked past with the reason. Pure, for testing.
/// It must walk PAST skipped commits to the first landable one and stop there:
/// stopping at the first skipped commit would report a real undeployed change
/// underneath it as landed.
export const newestLandable = (commits) => {
  const skipped = []
  for (const c of commits) {
    const why = notLandableBecause(c)
    if (!why) return { sha: c.sha, skipped }
    skipped.push({ sha: c.sha, why, other: otherSkipSpellings(c.message) })
  }
  return { sha: null, skipped }
}

/// newestLandable over this branch's history. NOT used by deploy-gate.mjs, on
/// purpose: the gate asks for verify's verdict on the newest change to the
/// published TREE, and a skip-directive data commit is part of that tree with
/// no verdict. Swapping this in there would let the hourly deploy publish
/// bytes verify never saw. The gate stays on newestDeployableCommit.
export const newestLandableCommit = (limit = 100) => {
  const shas = execSync(`git log -${limit} --format=%H`, { encoding: 'utf8' }).trim().split('\n').filter(Boolean)
  const commits = []
  for (const sha of shas) {
    const files = execSync(`git diff-tree --no-commit-id --name-only -r ${sha}`, { encoding: 'utf8' })
      .trim().split('\n').filter(Boolean)
    const message = execSync(`git log -1 --format=%B ${sha}`, { encoding: 'utf8' })
    commits.push({ sha, files, message })
    if (!notLandableBecause({ files, message })) break
  }
  return newestLandable(commits)
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
