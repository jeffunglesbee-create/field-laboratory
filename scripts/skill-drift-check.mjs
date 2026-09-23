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
//   UNREADABLE     404 or any non-200 for a pair never yet observed readable.
//                  Absent file, private repo, or a bad fetch — indistinguishable
//                  from outside, so it is reported as one state and is NOT
//                  fatal. Calling this "drifted" would report a repo that simply
//                  does not carry the skill as a defect, and calling it
//                  "matches" would hide a real one.
//   WENT DARK      the same non-200, for a pair docs/skill-reachability.txt
//                  records as having been readable. THAT is an event: a repo
//                  went private, or the skill was deleted from it. Fatal.
//   NOT INSTALLED  no local copy in THIS repo, so there is no reference to
//                  compare against and the skill is skipped entirely.
//
// WHY WENT DARK WAS ADDED (2026-08-26). The scope boundary here used to read:
// "A skill deleted from a sibling reads UNREADABLE, same as never having been
// installed. Coverage is a different question and needs a declared roster, which
// goes stale; drift needs no roster at all."
//
// Both halves were true and together they left a hole. Without a roster, a
// sibling going private silently degrades this check from "the copies agree" to
// "the copies I can still see agree", and the run stays green while measuring
// less. Same shape as every other defect this session has chased: a value whose
// name and its measurement disagree.
//
// The resolution is that the roster is OBSERVED rather than declared, so the
// objection to having one does not apply. A line reaches
// docs/skill-reachability.txt only by a real 200, and leaves only when someone
// deletes it deliberately and says why. Coverage is now derivable from it as a
// side effect — but drift is still the question this check answers.

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { createChecks, isMain } from './checks.mjs'


// IMPORT PURITY (import-purity-check.mjs). This module exports functions, which
// is a declaration that something else may import it — so it must not run, and
// must not exit, at import time. `isMain` gates both the self-test and the live
// section. Written without it, an importer got this module's output and exit
// code instead of its own, silently.
const IS_MAIN = isMain(import.meta.url)
const SELF_TEST = IS_MAIN && process.argv.includes('--self-test')

const SKILLS_DIR = '.claude/skills'

const SKILLS = [
  { name: 'i-have-adhd', path: `${SKILLS_DIR}/i-have-adhd/SKILL.md` },
  { name: 'unslop-ui', path: `${SKILLS_DIR}/unslop-ui/SKILL.md` },
  // ADDED 2026-08-31, and the gap is why the guard below now exists.
  // scroll-craft was installed on 2026-08-29 by request and invoked on nearly
  // every message since. It sat outside this roster for two days: a skill this
  // repo carries, in the one repo positioned to compare all four copies, that
  // was never compared. Nothing noticed, because nothing was looking at the
  // directory — the roster was the only source of truth about its own scope.
  { name: 'scrollcraft', path: `${SKILLS_DIR}/scrollcraft/SKILL.md` },
]

/**
 * Every skill on disk, from the directory rather than from the roster.
 *
 * THE ROSTER CANNOT AUDIT ITSELF. A hand-maintained list of what to compare is
 * complete exactly until the next install, and its incompleteness is invisible
 * from inside: a skill that is absent from the list is absent from the output,
 * so the check reports on everything it knows about and knows about less than
 * it should. That is the same shape as `check-script-orphans` guarding
 * docs/unreachable-scripts.txt, and as the sport registry reading its DU case
 * count out of the F# source rather than trusting a literal.
 *
 * `.claude/skills` is the source. The roster is a copy of it.
 */
export const skillsOnDisk = (readdir, exists) =>
  readdir(SKILLS_DIR)
    .filter(n => exists(`${SKILLS_DIR}/${n}/SKILL.md`))
    .sort()

/** Skills on disk that the roster does not name. */
export const rosterGaps = (onDisk, roster) =>
  onDisk.filter(n => !roster.some(s => s.name === n))

const OWNER = 'jeffunglesbee-create'
/// ONE DEFINITION, TWO CALLERS. sync-adhd-skill.mjs carried its own list and it
/// held two of these three — so field-playground was a repo this check could
/// report DRIFTED and that sync could never fix. Measured 2026-09-23: all three
/// siblings had the pre-2026-09-20 Rule 9, and only two were reachable by the
/// mechanism built to correct it. A denominator that disagrees with the one it
/// feeds is the same defect as two implementations of one rule.
export const SIBLINGS = ['field-relay-nba', 'jubilant-bassoon', 'field-playground']

/// The verdict for one sibling, given the reference bytes and what the fetch
/// returned. `remote` is null when the fetch did not yield a body.
///
/// Isolated from the network so every branch is exercised by the self-test —
/// including the two that a live run on a good day never reaches.
export function verdictFor(reference, status, remote) {
  if (status !== 200 || remote === null) return 'UNREADABLE'
  return remote === reference ? 'MATCHES' : 'DRIFTED'
}

/// UNREADABLE splits in two once it is known whether the pair was EVER readable.
/// Kept separate from `verdictFor` so the fetch result and the history are
/// scored independently — conflating them is what hid the case this exists for.
export function withHistory(verdict, wasReadable) {
  return verdict === 'UNREADABLE' && wasReadable ? 'WENT DARK' : verdict
}

/// `<skill>  <repo>` per line, comments and blanks ignored. Keyed as one string
/// because a pair is the unit: `unslop-ui` being readable in one sibling says
/// nothing about another.
export const pairKey = (skill, repo) => `${skill}\t${repo}`
export function parseReachability(text) {
  const out = new Set()
  for (const line of text.split('\n')) {
    const t = line.replace(/^\s*#.*$/, '').trim()
    if (!t) continue
    const [skill, repo] = t.split(/\s+/)
    if (skill && repo) out.add(pairKey(skill, repo))
  }
  return out
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
  check('the three fetch states are distinguishable from one another',
    new Set([
      verdictFor('a', 200, 'a'),
      verdictFor('a', 200, 'b'),
      verdictFor('a', 404, null),
    ]).size === 3)

  // ── the reachability split ────────────────────────────────────────────────
  check('a 404 for a pair never seen readable stays UNREADABLE',
    withHistory('UNREADABLE', false) === 'UNREADABLE',
    'a repo that never carried the skill would fail the build')
  check('a 404 for a pair that WAS readable is WENT DARK',
    withHistory('UNREADABLE', true) === 'WENT DARK',
    'a sibling going private would silently stop being compared')
  check('history never changes a verdict that actually read bytes',
    withHistory('MATCHES', true) === 'MATCHES' && withHistory('DRIFTED', true) === 'DRIFTED',
    'a 200 must be scored on its bytes, not on its history')
  check('all four states are distinguishable',
    new Set([
      withHistory(verdictFor('a', 200, 'a'), true),
      withHistory(verdictFor('a', 200, 'b'), true),
      withHistory(verdictFor('a', 404, null), true),
      withHistory(verdictFor('a', 404, null), false),
    ]).size === 4)

  const R = parseReachability('# note\n\ni-have-adhd    field-relay-nba\nunslop-ui  jubilant-bassoon\n')
  check('the reachability file parses to pairs, ignoring comments and blanks',
    R.size === 2 && R.has(pairKey('i-have-adhd', 'field-relay-nba')))
  check('a pair is skill AND repo, never either alone',
    R.has(pairKey('unslop-ui', 'field-relay-nba')) === false,
    'unslop-ui being readable in one sibling would vouch for another')

  check('every declared skill names a path under .claude/skills/',
    SKILLS.every(s => s.path === `.claude/skills/${s.name}/SKILL.md`),
    'a name and its path disagree — the report would cite the wrong file')

  // THE ROSTER COVERS THE DIRECTORY. This is the gap that existed for two days.
  const roster = [{ name: 'i-have-adhd' }, { name: 'unslop-ui' }]
  const disk = ['i-have-adhd', 'scrollcraft', 'unslop-ui']
  check('a skill on disk but not in the roster is a gap',
    rosterGaps(disk, roster).join() === 'scrollcraft',
    'scrollcraft was installed 2026-08-29 and compared by nothing until 2026-08-31')
  check('a complete roster has no gaps',
    rosterGaps(disk, [...roster, { name: 'scrollcraft' }]).length === 0)
  check('a roster entry with no directory is NOT a gap',
    rosterGaps(['i-have-adhd'], [...roster, { name: 'removed-skill' }]).length === 0,
    'an uninstalled skill leaves a stale roster line, which is a different problem')
  check('A DIRECTORY WITHOUT A SKILL.md IS NOT A SKILL',
    skillsOnDisk(() => ['i-have-adhd', 'scratch'], p => p.includes('i-have-adhd')).join() === 'i-have-adhd',
    'engine/, references/ and templates/ live beside SKILL.md and must not be read as skills')

  process.exit(summarize() === 0 ? 0 : 1)
}

// Not the entry point? Then the CLI below must not run. Wrapped rather than
// re-indented so the body stays byte-identical to what was reviewed.
if (IS_MAIN) await (async () => {

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

const REACH_PATH = 'docs/skill-reachability.txt'
const reachable = parseReachability(readFileSync(REACH_PATH, 'utf8'))

let drifted = 0
let compared = 0
let dark = 0
const undeclared = []

for (const skill of SKILLS) {
  if (!existsSync(skill.path)) {
    console.log(`\n${skill.name}\n  NOT INSTALLED here — no reference to compare against, skipped`)
    continue
  }
  const reference = readFileSync(skill.path, 'utf8')
  console.log(`\n${skill.name}  (${reference.length} bytes here)`)

  for (const repo of SIBLINGS) {
    const { status, body, error } = await raw(repo, skill.path)
    const wasReadable = reachable.has(pairKey(skill.name, repo))
    const verdict = withHistory(verdictFor(reference, status, body), wasReadable)
    const detail = verdict === 'WENT DARK'
      ? `HTTP ${status}${error ? ` — ${error}` : ''} — ${REACH_PATH} records this copy as readable, so it is gone, not absent`
      : verdict === 'UNREADABLE'
        ? `HTTP ${status}${error ? ` — ${error}` : ''} (never observed readable — absent, private, or unreachable, not a finding)`
        : verdict === 'DRIFTED'
          ? `${body.length} bytes there vs ${reference.length} here`
          : ''
    console.log(`  ${verdict.padEnd(11)} ${repo.padEnd(18)} ${detail}`)
    if (verdict === 'DRIFTED') drifted++
    if (verdict === 'WENT DARK') dark++
    if (verdict !== 'UNREADABLE' && verdict !== 'WENT DARK') {
      compared++
      // A pair that read bytes and is not on the roster is a NEW observation.
      // Not fatal — a sibling installing a skill must not fail this build — but
      // printed with the exact line, because a roster nobody updates is the
      // stale one the scope boundary warned about.
      if (!wasReadable) undeclared.push(`${skill.name.padEnd(14)} ${repo}`)
    }
  }
}

// THE ROSTER IS AUDITED AGAINST THE DIRECTORY, and this is fatal.
//
// Unlike UNREADABLE and `undeclared`, a gap here is entirely inside this repo:
// nobody else's repository can cause it and nothing outside can fix it. A skill
// sitting in .claude/skills that this check does not compare is a copy drifting
// with no observer, in the one repo that can see all four.
const gaps = rosterGaps(skillsOnDisk(readdirSync, existsSync), SKILLS)

console.log(`\n${compared} copy/copies compared, ${drifted} drifted, ${dark} went dark`)
if (gaps.length) {
  console.log(`\n${gaps.length} skill(s) on disk that this check does not compare: ${gaps.join(', ')}`)
  console.log(`Add each to SKILLS in ${'scripts/skill-drift-check.mjs'}. A roster that does not`)
  console.log('cover the directory reports on everything it knows about, and knows less than')
  console.log('it should — which is how scrollcraft went two days uncompared.')
}
if (undeclared.length) {
  console.log(`\n${undeclared.length} copy/copies read cleanly but are not in ${REACH_PATH}.`)
  console.log('Paste these lines in, so a later disappearance is an event rather than silence:\n')
  for (const l of undeclared) console.log(`  ${l}`)
}
if (dark) {
  console.log(`\nA copy that WENT DARK was readable when ${REACH_PATH} was written and is not now.`)
  console.log('Either the repo went private, or the skill was deleted from it. Neither is')
  console.log('drift, and both stop this check from comparing that copy at all. Restore it,')
  console.log(`or delete its line from ${REACH_PATH} in a commit that says which happened.`)
}
if (drifted) {
  console.log('\nA drifted copy means one repo was edited and the others were not.')
  console.log('Decide which text is right, then run adhd-skill-sync.yml (or copy by')
  console.log('hand) so every repo carries the same bytes — do not edit only one.')
}
process.exit(drifted || dark || gaps.length ? 1 : 0)
})()
