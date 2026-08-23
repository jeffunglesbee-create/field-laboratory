// The history boundary must name a commit that is still in history.
//
// docs/history-boundary.txt names a commit by sha. On 2026-08-23 that sha,
// a4d500c, stopped existing in main's history 42 seconds after it was written:
// the push that recorded it as the boundary is the push that rebased it into
// c31b94e. Same five files, same 252 insertions, new sha. The file named the
// pre-rebase commit and shipped in the same operation that invalidated it.
//
// check:history reports this, in CI, after the commit is in history -- and it
// did, five consecutive times (7c8021d, 80f2e12, 1bba8a9, 3226819, a5c7510),
// each run red on a repo where nothing was actually wrong except one stale sha.
// This asks the same question at the door, where a rebase has just happened and
// the answer is one edit away.
//
// Same reasoning as check:staged-outbox, which this sits beside: check:history
// REPORTS, this GUARDS, and the difference is the moment.
//
// SILENT WHEN THE SHA IS UNKNOWN, on purpose. `known && !ancestor` is
// unambiguous -- git is holding the object, so it was orphaned, not lost.
// `!known` is ambiguous between a shallow clone, a wrong repo, and a typo, and
// a shallow clone is the ORDINARY case in a cloud session here: this repo's own
// boundary file records local audits printing "predating: 1" and "predating: 4"
// against CI's 699 commits. Failing a commit for that would block every commit
// in every cloud session, and a gate that fires on the normal case is one
// somebody turns off.

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createChecks, isMain } from './checks.mjs'
import { explainMissingBoundary } from './history-check.mjs'

const BOUNDARY_PATH = 'docs/history-boundary.txt'

export const readBoundary = (text) => {
  const line = text.split('\n').map(l => l.replace(/^\s*#.*$/, '').trim()).filter(Boolean)[0]
  const m = /^([0-9a-f]{40})\s+(\d+)$/.exec(line ?? '')
  if (!m) throw new Error(`${BOUNDARY_PATH}: expected "<40-char sha> <count>", got: ${line}`)
  return { sha: m[1], count: Number(m[2]) }
}

/**
 * Pure. `ok:false` ONLY for the orphan. See the header for why unknown passes.
 */
export const boundaryVerdict = ({ known, ancestor }) => {
  if (known && !ancestor) return { ok: false, state: 'orphaned' }
  if (!known) return { ok: true, state: 'unverifiable' }
  return { ok: true, state: 'reachable' }
}

const gitOk = (cmd) => {
  try { execSync(cmd, { stdio: 'ignore' }); return true } catch { return false }
}

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()

  // The negative control: the exact 2026-08-23 state.
  check('an orphaned boundary fails',
    boundaryVerdict({ known: true, ancestor: false }).ok === false,
    'git is holding the object — it was rebased, not lost, and that is unambiguous')

  // Both controls that stop it overshooting.
  check('a reachable boundary passes',
    boundaryVerdict({ known: true, ancestor: true }).ok === true,
    'the ordinary case must not be blocked')
  check('an unknown boundary passes, and says it could not check',
    boundaryVerdict({ known: false, ancestor: false }).ok === true &&
    boundaryVerdict({ known: false, ancestor: false }).state === 'unverifiable',
    'a shallow clone is normal here — failing on it blocks every cloud-session commit')

  check('the three states are distinguishable',
    new Set(['reachable', 'orphaned', 'unverifiable'].map(s => s)).size === 3 &&
    boundaryVerdict({ known: true, ancestor: true }).state !== boundaryVerdict({ known: false, ancestor: false }).state,
    'passing for two different reasons must not read the same')

  // The parser, against this repo's real file, so a reformat is caught here.
  const real = readBoundary(readFileSync(BOUNDARY_PATH, 'utf8'))
  check('the real boundary file parses to a sha and a count',
    /^[0-9a-f]{40}$/.test(real.sha) && Number.isInteger(real.count),
    `got ${JSON.stringify(real)}`)

  process.exit(summarize() === 0 ? 0 : 1)
}

if (isMain(import.meta.url)) {
  const { sha } = readBoundary(readFileSync(BOUNDARY_PATH, 'utf8'))
  const known = gitOk(`git cat-file -e ${sha}^{commit}`)
  const ancestor = gitOk(`git merge-base --is-ancestor ${sha} HEAD`)
  const { ok, state } = boundaryVerdict({ known, ancestor })

  if (!ok) {
    console.log(`FAIL  the history boundary is ${state}`)
    console.log(`      ${explainMissingBoundary({ sha, known, ancestor, path: BOUNDARY_PATH })}`)
    process.exit(1)
  }
  console.log(`boundary ${sha.slice(0, 7)}: ${state}`)
}
