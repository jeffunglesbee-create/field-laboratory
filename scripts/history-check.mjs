// Exact per-commit correlation, over the whole history.
//
// FIELD's production gate has a documented correlation bug that was explicitly
// left unfixed. From `Confidence-Gate Acknowledgment List — 2026-07-08`:
//
//   "its SRC_TOUCHED correlation check counts any src/*.js change in the last
//    20 outbox-touching commits, not specifically whether the flagged outbox's
//    own commits touched src/. Fixing that correlation logic precisely is out
//    of scope here"
//
// The answer shipped was `docs/confidence-gate-acknowledged.txt` — a suppression
// list, with the wrong correlation left in place. Three entries on 07-08, a
// fourth on 07-12.
//
// An earlier version of this comment called those entries "standing false
// positives." The Drive record does not support that, and the two documents
// disagree with each other about the very same items:
//
//   07-07:  "Two pre-existing violations found ... Both are REAL VIOLATIONS
//            the check correctly surfaces."
//   07-08:  "the same three ALREADY-REVIEWED, NON-ACTIONABLE outbox entries."
//
// So the entries really were sub-95 outboxes — the score half of the test was
// working. Naming them false positives adopted the later framing and threw away
// the earlier one.
//
// The narrower claim survives both documents, and is the one this script is
// actually built against: the check could not tell a SETTLED entry from an
// UNSETTLED one. Having no relationship between an outbox and the commits that
// wrote it, it re-raised reviewed entries on every deploy, forever, and the only
// exit was suppression. The defect is not that innocent entries were invented.
// It is that nothing could ever be closed.
//
// Three defects, one root:
//
//   1. WRONG CORRELATION. "Some src change happened near some outbox" is not a
//      relationship between them. Fixed here by asking the only question that
//      is actually well-defined: did THIS COMMIT change source without changing
//      the outbox? A commit is the unit where the two are genuinely coupled.
//
//   2. A 20-COMMIT WINDOW. The 07-08 doc records two of its three entries
//      having "aged out of the window as more commits have landed" — a
//      violation clears itself if you commit twenty more times. There is no
//      window here. History is walked to the root.
//
//   3. THE SUPPRESSION LIST. Not fixed — deleted, by removing its reason to
//      exist. A per-commit answer is settled the moment the commit is made: the
//      commit either paired source with an outbox entry or it did not, and no
//      later commit changes that. Nothing can be re-raised, so nothing needs
//      suppressing. This repo has no acknowledgment list and must not acquire
//      one.
//
// On the one thing that genuinely needs a boundary: this rule was mechanised at
// a known commit, and 17 earlier commits predate it. That is not an exemption
// list — it is one commit, it names no files, it makes no per-case judgement,
// and it cannot hide anything after itself. The boundary can be audited in one
// line; an exemption list cannot be audited at all.
//
// The boundary and the count live in docs/history-boundary.txt, and the earlier
// version of this comment overstated what that pins down. It said the count was
// "frozen ... so moving the boundary forward to absorb a new violation changes
// that count and fails this check" — true of moving the boundary alone, false
// of moving the boundary and the count together, which was one edit in one file
// at the time. A Claude chat session reviewing this repo repeated the claim as
// written, which is how an overstated claim propagates: it was not their error.
//
// Stated exactly, and no wider: moving the boundary WITHOUT also editing the
// count fails this check. Moving both is permitted, and lands as a docs/ change
// beside a scripts/ change. Visibility, not prevention — the same claim
// docs/gate-rows.txt makes, and for the same reason.
//
// Usage:  node scripts/history-check.mjs           (audit)
//         node scripts/history-check.mjs --self-test

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createChecks, isMain } from './checks.mjs'

// Read, not hardcoded — see docs/history-boundary.txt for why the pair lives
// outside this file.
const BOUNDARY_PATH = 'docs/history-boundary.txt'
const [RULE_EFFECTIVE, PRE_RULE_VIOLATIONS] = (() => {
  const line = readFileSync(BOUNDARY_PATH, 'utf8')
    .split('\n').map(l => l.replace(/^\s*#.*$/, '').trim()).filter(Boolean)[0]
  const m = /^([0-9a-f]{40})\s+(\d+)$/.exec(line ?? '')
  if (!m) throw new Error(`${BOUNDARY_PATH}: expected "<40-char sha> <count>", got: ${line}`)
  return [m[1], Number(m[2])]
})()

const SOURCE = /^(src|scripts)\//
const OUTBOX = /^outbox\//

/**
 * The correlation, stated exactly: within ONE commit, did source change without
 * the outbox changing?
 *
 * Merge commits are exempt. `git show --name-only` reports nothing for them by
 * default, and a merge introduces no change of its own to document.
 */
export const isViolation = files =>
  files.some(f => SOURCE.test(f)) && !files.some(f => OUTBOX.test(f))

/** Every non-merge commit, oldest last, with its touched files. */
const walk = () => {
  const raw = execSync(
    "git log --no-merges --format='%x00%H%x00%s' --name-only",
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  // The format emits a NUL before the sha and another before the subject, so
  // splitting on NUL yields a leading empty string then strict sha/body pairs.
  // Parsed positionally rather than by regex: a commit subject can contain
  // anything, and a pattern that matches subject text would desynchronise the
  // whole walk on one unlucky message.
  const parts = raw.split('\0')
  const commits = []
  for (let i = 1; i + 1 < parts.length + 1; i += 2) {
    const sha = parts[i]
    if (!sha) continue
    const body = (parts[i + 1] ?? '').split('\n')
    commits.push({
      sha: sha.trim(),
      subject: body[0],
      files: body.slice(1).map(l => l.trim()).filter(Boolean),
    })
  }
  return commits
}

const audit = () => {
  const commits = walk()
  const effectiveIdx = commits.findIndex(c => c.sha === RULE_EFFECTIVE)
  if (effectiveIdx === -1) {
    throw new Error(
      `RULE_EFFECTIVE ${RULE_EFFECTIVE.slice(0, 7)} is not in this history. ` +
      `If history was rewritten, re-derive the boundary and the count together in ${BOUNDARY_PATH}.`)
  }
  // `git log` is newest-first, so anything at a LOWER index than the boundary
  // is newer than it — i.e. governed by the rule.
  const governed = commits.slice(0, effectiveIdx + 1)
  const predating = commits.slice(effectiveIdx + 1)
  return {
    live: governed.filter(c => isViolation(c.files)),
    predatingCount: predating.filter(c => isViolation(c.files)).length,
    scanned: commits.length,
  }
}

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()

  check('source without outbox is a violation',
    isViolation(['src/Desk.fs']), 'the core correlation does not fire')

  check('source WITH outbox is not',
    !isViolation(['src/Desk.fs', 'outbox/note.md']), 'flags a documented commit')

  check('outbox alone is not a violation',
    !isViolation(['outbox/note.md']), 'flags a docs-only commit')

  check('docs alone is not a violation',
    !isViolation(['docs/ZONE-PROOF.md', 'README.md']), 'flags a docs-only commit')

  check('scripts/ counts as source',
    isViolation(['scripts/zone-check.mjs']), 'scripts/ changes escape the rule')

  // The production shape, replayed. Two independent commits: one changes source,
  // the other changes an unrelated outbox. Production's window sees "src changed
  // near an outbox" and cannot tell which commit it is talking about — which is
  // why its findings could never be settled. Per-commit correlation attributes
  // the change to exactly one commit, and that answer never changes afterwards.
  const separate = [
    { sha: 'a', files: ['src/Desk.fs'] },
    { sha: 'b', files: ['outbox/unrelated.md'] },
  ]
  const flagged = separate.filter(c => isViolation(c.files)).map(c => c.sha)
  check('an unrelated outbox in the same window is NOT implicated',
    flagged.length === 1 && flagged[0] === 'a',
    `flagged ${JSON.stringify(flagged)} — expected only the source-only commit`)

  check('a merge commit (no files) is exempt',
    !isViolation([]), 'merges would fail on someone else\'s history')

  process.exit(summarize() === 0 ? 0 : 1)
}

// Guarded, so importing `isViolation` does not walk 400 commits and exit.
if (isMain(import.meta.url)) {
const { live, predatingCount, scanned } = audit()

console.log(`\nPer-commit source/outbox correlation over ${scanned} commits`)
console.log(`  rule effective at : ${RULE_EFFECTIVE.slice(0, 7)}`)
console.log(`  predating the rule: ${predatingCount} (declared ${PRE_RULE_VIOLATIONS} in ${BOUNDARY_PATH})\n`)

let failed = false

if (predatingCount !== PRE_RULE_VIOLATIONS) {
  console.log(`FAIL  the pre-rule violation count moved: ${predatingCount}, declared ${PRE_RULE_VIOLATIONS}`)
  console.log(`      → either history was rewritten or RULE_EFFECTIVE was moved.`)
  console.log(`        Both are legitimate; neither is silent. Re-derive both together.\n`)
  failed = true
} else {
  console.log(`PASS  the rule boundary has not moved`)
}

if (live.length > 0) {
  console.log(`FAIL  ${live.length} commit(s) changed source without an outbox entry:`)
  // Named, never counted — a count tells you a problem exists and nothing else.
  for (const c of live) console.log(`      → ${c.sha.slice(0, 7)}  ${c.subject}`)
  failed = true
} else {
  console.log(`PASS  every governed commit changed source and outbox together`)
}

console.log()
process.exit(failed ? 1 : 0)
}
