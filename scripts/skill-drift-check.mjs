// Do this repo's shared skills still match the copies in the sibling repos?
//
// WHY THIS EXISTS
//
// A skill installed in more than one repo is one document with several copies,
// and nothing compared them. `unslop-ui` now lives in BOTH field-laboratory and
// jubilant-bassoon by request; `i-have-adhd` lives in four. Edit one and the
// others keep the old text silently — the same defect shape as a second
// implementation of one rule, which is exactly why `drawPriceFrom` lives in
// field-relay-nba's src/odds-shape.js instead of being copied into index.js.
//
// WHAT IT COMPARES, AND WHAT IT DELIBERATELY DOES NOT
//
// This repo's checked-out copy is the reference. Every sibling that SERVES the
// file must be byte-identical to it.
//
// It does NOT compare against the upstream author's repo. `sync-adhd-skill.mjs`
// already tracks upstream, and folding that in here would make this check go red
// the day someone else edits their own `main` — which is not drift between our
// copies, and a check that can be reddened by a stranger is a check that gets
// disabled.
//
// NO TOKEN. field-laboratory is PRIVATE (verified 2026-08-26: anonymous raw
// returns 404 for CLAUDE.md, HANDOFF.md and STATUS.md, all committed on main),
// but the three siblings are public, so raw.githubusercontent serves their
// copies anonymously and this repo's own copy comes from the checkout. That is
// the whole reason the check lives here and not in a sibling: this is the only
// repo that can read all four.
//
// FOUR STATES PER REPO, and the distinction is the point:
//
//   MATCHES        200, bytes identical.
//   DRIFTED        200, bytes differ.        <- the only fatal state
//   UNREADABLE     404 or any non-200. Absent file, private repo, or a bad
//                  fetch — indistinguishable from outside, so it is reported as
//                  one state and is NOT fatal. Calling this "drifted" would
//                  report a repo that simply does not carry the skill as a
//                  defect, and calling it "matches" would hide a real one.
//   NOT INSTALLED  no local copy in THIS repo, so there is no reference to
//                  compare against and the skill is skipped entirely.
//
// SCOPE BOUNDARY. This answers "do the copies agree", not "does every repo have
// one". A skill deleted from a sibling reads UNREADABLE, same as never having
// been installed. Coverage is a different question and needs a declared roster,
// which goes stale; drift needs no roster at all.

import { readFileSync, existsSync } from 'node:fs'
import { createChecks } from './checks.mjs'

const SELF_TEST = process.argv.includes('--self-test')

const SKILLS = [
  { name: 'i-have-adhd', path: '.claude/skills/i-have-adhd/SKILL.md' },
  { name: 'unslop-ui', path: '.claude/skills/unslop-ui/SKILL.md' },
]

const OWNER = 'jeffunglesbee-create'
const SIBLINGS = ['field-relay-nba', 'jubilant-bassoon', 'field-playground']

/// The verdict for one sibling, given the reference bytes and what the fetch
/// returned. `remote` is null when the fetch did not yield a body.
///
/// Isolated from the network so every branch is exercised by the self-test —
/// including the two that a live run on a good day never reaches.
export function verdictFor(reference, status, remote) {
  if (status !== 200 || remote === null) return 'UNREADABLE'
  return remote === reference ? 'MATCHES' : 'DRIFTED'
}

/// Byte identity, stated as a function so there is one definition of "same".
/// Not trimmed, not normalised: a trailing-newline difference IS drift, because
/// the next sync would rewrite the file and produce a diff nobody asked for.
export const identical = (a, b) => a === b

// ── self-test: pure logic, no network ───────────────────────────────────────

if (SELF_TEST) {
  const { check, summarize } = createChecks()

  check('identical bytes at 200 → MATCHES',
    verdictFor('a\n', 200, 'a\n') === 'MATCHES')
  check('different bytes at 200 → DRIFTED',
    verdictFor('a\n', 200, 'b\n') === 'DRIFTED')
  check('a trailing-newline difference IS drift, not a near-match',
    verdictFor('a\n', 200, 'a') === 'DRIFTED',
    'normalising whitespace would hide a diff the next sync would write')
  check('404 → UNREADABLE, never DRIFTED',
    verdictFor('a\n', 404, null) === 'UNREADABLE',
    'a repo that does not carry the skill would be reported as a defect')
  check('a 500 is UNREADABLE too — a bad fetch is not a finding',
    verdictFor('a\n', 500, null) === 'UNREADABLE')
  check('a 200 with no body is UNREADABLE, not an empty-file match',
    verdictFor('', 200, null) === 'UNREADABLE',
    'a truncated response would read as a match against an empty reference')
  check('an empty reference and an empty body still compare as bytes',
    verdictFor('', 200, '') === 'MATCHES')

  // The detector must be able to fail. A verdictFor that returned 'MATCHES'
  // unconditionally would pass every check above except this one.
  check('the three states are distinguishable from one another',
    new Set([
      verdictFor('a', 200, 'a'),
      verdictFor('a', 200, 'b'),
      verdictFor('a', 404, null),
    ]).size === 3)

  check('every declared skill names a path under .claude/skills/',
    SKILLS.every(s => s.path === `.claude/skills/${s.name}/SKILL.md`),
    'a name and its path disagree — the report would cite the wrong file')

  process.exit(summarize() === 0 ? 0 : 1)
}

// ── live ────────────────────────────────────────────────────────────────────

const raw = async (repo, path) => {
  try {
    const r = await fetch(`https://raw.githubusercontent.com/${OWNER}/${repo}/main/${path}`,
      { signal: AbortSignal.timeout(20000) })
    return { status: r.status, body: r.ok ? await r.text() : null }
  } catch (e) {
    return { status: 0, body: null, error: String(e.message || e) }
  }
}

let drifted = 0
let compared = 0

for (const skill of SKILLS) {
  if (!existsSync(skill.path)) {
    console.log(`\n${skill.name}\n  NOT INSTALLED here — no reference to compare against, skipped`)
    continue
  }
  const reference = readFileSync(skill.path, 'utf8')
  console.log(`\n${skill.name}  (${reference.length} bytes here)`)

  for (const repo of SIBLINGS) {
    const { status, body, error } = await raw(repo, skill.path)
    const verdict = verdictFor(reference, status, body)
    const detail = verdict === 'UNREADABLE'
      ? `HTTP ${status}${error ? ` — ${error}` : ''} (absent, private, or unreachable — not a finding)`
      : verdict === 'DRIFTED'
        ? `${body.length} bytes there vs ${reference.length} here`
        : ''
    console.log(`  ${verdict.padEnd(11)} ${repo.padEnd(18)} ${detail}`)
    if (verdict === 'DRIFTED') drifted++
    if (verdict !== 'UNREADABLE') compared++
  }
}

console.log(`\n${compared} copy/copies compared, ${drifted} drifted`)
if (drifted) {
  console.log('\nA drifted copy means one repo was edited and the others were not.')
  console.log('Decide which text is right, then run adhd-skill-sync.yml (or copy by')
  console.log('hand) so every repo carries the same bytes — do not edit only one.')
}
process.exit(drifted ? 1 : 0)
