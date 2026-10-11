// Install (and keep verified) the i-have-adhd skill, byte-verbatim from source.
//
// WHY THIS EXISTS
//
// The skill was adopted in CLAUDE.md and now ships as `.claude/skills/…` in this
// repo. Three things then have to stay true, in this repo and in every sibling
// that installs it: the file is PRESENT, it is BYTE-IDENTICAL to the published
// source, and it is not a hand-retyped copy that has quietly drifted. A prose
// instruction ("download it, don't retype it") cannot enforce any of that; a
// script can.
//
// PORTABLE ON PURPOSE. It writes `.claude/skills/i-have-adhd/SKILL.md` relative
// to the current working directory and has no repo-specific paths, so the exact
// same file installs the skill in field-relay-nba or jubilant-bassoon when run
// from their roots — including straight from a URL, no copy step:
//
//     curl -sS https://raw.githubusercontent.com/jeffunglesbee-create/field-laboratory/main/scripts/install-adhd-skill.mjs | node -
//
// THREE MODES
//   (default)     fetch source, install if absent or drifted, verify the write.
//                 Idempotent — a no-op when the on-disk copy already matches.
//   --check       verify only, no writes. Exit 1 if absent or drifted. This is
//                 the drift guard the sentinel runs.
//
// THE PIN, and why it does not defeat the point of this script.
//
// This file exists to rule out a hand-edit or a partial reconstruction, so any
// exemption has to be narrower than "ignore the difference". An OPTIONAL
// `docs/adhd-skill-pin.json` records TWO hashes — the local copy's and the
// exact upstream revision whose divergence was accepted — plus the reason. The
// check passes only when BOTH still match.
//
// That keeps both failure directions fatal. Edit the local copy and its hash
// stops matching, so the pin does not cover it. Upstream moves again and its
// hash stops matching, so a human looks at the new difference rather than
// inheriting a blessing granted for an older one. A pin that survived either
// would be a permanent exemption wearing a hash.
//
// It is OPTIONAL on purpose, which is what keeps the curl-into-a-sibling path
// above working byte-for-byte as before: no pin file, no pin logic, exactly the
// behaviour this script had before the pin existed.
//   --self-test   exercise the pure logic against fixtures, no network.
//
// Node 22+ (global fetch). No dependencies beyond node: built-ins and, for the
// self-test only, the repo's own checks.mjs.

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

const SRC = 'https://raw.githubusercontent.com/ayghri/i-have-adhd/main/skills/i-have-adhd/SKILL.md'
const DEST = '.claude/skills/i-have-adhd/SKILL.md'

/// Is this file being RUN, or imported by something else?
///
/// Not `checks.mjs`'s `isMain`, and the difference is load-bearing. `isMain`
/// compares against `process.argv[1]`, which the documented portable install —
/// `curl … | node -` — does not set to this file. Measured 2026-10-11:
///
///   node scripts/install-adhd-skill.mjs   argv[1] = the script path
///   curl … | node -                       argv[1] = "-"
///   imported from another module          argv[1] = the IMPORTER, or undefined
///
/// So `isMain` is false under the pipe, and gating on it would turn the install
/// command in this header into a silent no-op — a fix for one check that breaks
/// the thing the file exists for.
///
/// WHY THIS GATE EXISTS AT ALL. This script now EXPORTS its pin helpers so they
/// can be tested, and `import-purity-check.mjs` requires that importing a module
/// that exports runs nothing. It caught this the same hour the exports were
/// added: "the import terminated the process (exit 1) — code after the import
/// never ran".
const IS_ENTRY =
  process.argv[1] === '-' ||
  (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href)

const CHECK = IS_ENTRY && process.argv.includes('--check')
const SELF_TEST = IS_ENTRY && process.argv.includes('--self-test')

/// Byte/string identity. Both sides are read as utf8, so this is an exact
/// content match — a single trailing space or newline difference is a mismatch,
/// which is the whole point of "verbatim".
const identical = (a, b) => a === b

/// The front-matter invariants a real i-have-adhd skill must satisfy. Cheap, and
/// the only correctness signal available when the source cannot be reached — so
/// a present-but-unverifiable copy can still be sanity-checked rather than
/// blindly trusted.
const requiredFrontmatter = text =>
  /^---[\s\S]*?\nname:\s*i-have-adhd\s*(\n|$)/.test(text) &&
  /\ndisable-model-invocation:\s*true\s*(\n|$)/.test(text)

const PIN = 'docs/adhd-skill-pin.json'

export const sha256 = text => createHash('sha256').update(text, 'utf8').digest('hex')

/// The pin, or null. A malformed or unreadable pin is NULL rather than an
/// error: a broken exemption must fall back to the strict check, never open it.
export const readPin = (path = PIN) => {
  if (!existsSync(path)) return null
  try {
    const p = JSON.parse(readFileSync(path, 'utf8'))
    return typeof p?.localSha256 === 'string' && typeof p?.acceptedUpstreamSha256 === 'string'
      ? p : null
  } catch { return null }
}

/// What a (local, upstream, pin) triple means. The whole decision, pure, so the
/// self-test can reach every branch without a network or a filesystem.
///
///   'identical'       local and upstream agree. The pin, if any, is redundant.
///   'pinned'          they differ, and BOTH hashes match the pin.
///   'local-edited'    a pin exists and the local copy is not the one it pinned.
///   'upstream-moved'  a pin exists and upstream is not the revision it accepted.
///   'drifted'         they differ and no pin covers it.
export const verdict = (have, src, pin) => {
  if (identical(have, src)) return 'identical'
  if (!pin) return 'drifted'
  const localOk = sha256(have) === pin.localSha256
  const upstreamOk = sha256(src) === pin.acceptedUpstreamSha256
  if (localOk && upstreamOk) return 'pinned'
  // Both wrong reports the LOCAL edit first: it is the one a person in this
  // repo did, and it is the one this script exists to catch.
  return localOk ? 'upstream-moved' : 'local-edited'
}

// ── self-test: the pure logic, no network ───────────────────────────────────

if (SELF_TEST) {
  const { createChecks } = await import('./checks.mjs')
  const { check, summarize } = createChecks()

  const GOOD = '---\nname: i-have-adhd\ndisable-model-invocation: true\nlicense: MIT\n---\nbody'
  check('requiredFrontmatter accepts a well-formed skill header',
    requiredFrontmatter(GOOD), 'the canonical header is rejected')
  check('it rejects a header that left model-invocation on',
    !requiredFrontmatter('---\nname: i-have-adhd\n---\nbody'),
    'a skill that would fire on every turn passes as valid')
  check('it rejects a different skill wearing valid-looking front-matter',
    !requiredFrontmatter('---\nname: something-else\ndisable-model-invocation: true\n---'),
    'any skill name passes the name check')
  check('identical is byte-exact, not fuzzy',
    identical('a\n', 'a\n') && !identical('a\n', 'a') && !identical('a', 'a '),
    'a trailing-whitespace difference passes as identical — verbatim would not be verbatim')

  // ── the pin ───────────────────────────────────────────────────────────────
  //
  // Every branch of `verdict` is reached here, and the two that MUST stay fatal
  // get a counterexample each. A pin that cannot go red is a permanent
  // exemption, which is the thing this check exists to prevent.

  const OURS = 'skill body A\n'
  const THEIRS = 'skill body B\n'
  const pin = { localSha256: sha256(OURS), acceptedUpstreamSha256: sha256(THEIRS) }

  check('a pin covers exactly the two revisions it names',
    verdict(OURS, THEIRS, pin) === 'pinned', verdict(OURS, THEIRS, pin))

  check('A HAND-EDITED LOCAL COPY IS STILL FATAL — the pin does not cover it',
    verdict(OURS + 'sneaky edit\n', THEIRS, pin) === 'local-edited',
    verdict(OURS + 'sneaky edit\n', THEIRS, pin))

  check('A NEW UPSTREAM MOVE IS STILL FATAL — a blessing for one revision is not a blessing for the next',
    verdict(OURS, THEIRS + 'new upstream line\n', pin) === 'upstream-moved',
    verdict(OURS, THEIRS + 'new upstream line\n', pin))

  check('both wrong at once reports the local edit, which is the one someone here made',
    verdict(OURS + 'x', THEIRS + 'y', pin) === 'local-edited')

  check('agreement reads as identical, pin or no pin',
    verdict(THEIRS, THEIRS, pin) === 'identical' && verdict(THEIRS, THEIRS, null) === 'identical')

  check('WITHOUT A PIN NOTHING CHANGES — a difference is plain drift',
    verdict(OURS, THEIRS, null) === 'drifted', verdict(OURS, THEIRS, null))

  check('a pin missing either hash is ignored rather than half-applied',
    verdict(OURS, THEIRS, { localSha256: sha256(OURS) }) === 'local-edited'
    || verdict(OURS, THEIRS, { localSha256: sha256(OURS) }) === 'upstream-moved',
    'a half-written pin must not read as pinned')

  // readPin never throws and never opens the check on bad input.
  check('an absent pin file reads as null', readPin('docs/definitely-not-here.json') === null)
  check('A MALFORMED PIN FALLS BACK TO STRICT, never to permissive',
    readPin('package.json') === null, 'a JSON file without the two hashes read as a pin')

  // The REAL pin, if this repo carries one, must describe the files on disk —
  // a pin whose hashes match nothing is a stale exemption that reads as live.
  const real = readPin()
  if (real !== null && existsSync(DEST)) {
    check('the committed pin matches the committed skill file',
      sha256(readFileSync(DEST, 'utf8')) === real.localSha256,
      `${DEST} is not the revision docs/adhd-skill-pin.json pins`)
    check('...and the pin says WHY, in prose a reader can act on',
      typeof real.reason === 'string' && real.reason.length > 80,
      'a pin without a stated reason is an unexplained exemption')
  }

  process.exit(summarize() === 0 ? 0 : 1)
}

const fetchSource = async () => {
  const r = await fetch(SRC, { signal: AbortSignal.timeout(20000) })
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${SRC}`)
  return await r.text()
}

const localCopy = async () => (existsSync(DEST) ? readFile(DEST, 'utf8') : null)

// ── --check: verify, never write ─────────────────────────────────────────────

if (CHECK) {
  const have = await localCopy()
  if (have === null) {
    console.error(`::error::${DEST} is absent — run without --check to install it`)
    process.exit(1)
  }
  let src
  try {
    src = await fetchSource()
  } catch (e) {
    // The source is a third-party CDN. Its being unreachable is not this repo's
    // drift, so it must not turn the sentinel red — the same reasoning
    // cc-cmd-followup uses for an unreachable relay. Fall back to the offline
    // invariant and SAY the byte-match went unverified, rather than printing an
    // "ok" nobody checked.
    if (requiredFrontmatter(have)) {
      console.log(`::warning::source unreachable (${String(e).slice(0, 60)}); ${DEST} is present and its front-matter is valid, but the byte-for-byte match was NOT verified this run`)
      process.exit(0)
    }
    console.error(`::error::source unreachable AND ${DEST} fails the skill front-matter invariant`)
    process.exit(1)
  }
  const pin = readPin()
  switch (verdict(have, src, pin)) {
    case 'identical':
      console.log(`ok — ${DEST} is byte-identical to source (${Buffer.byteLength(src)} bytes)`)
      if (pin !== null) {
        console.log(`::warning::${PIN} is now redundant — the copies agree again. Delete it.`)
      }
      process.exit(0)

    case 'pinned':
      // NOT silence. The divergence is reported every run, with both hashes and
      // the reason, so a reader sees an accepted difference rather than a clean
      // bill of health. An exemption nobody is reminded of is an exemption
      // nobody revisits.
      console.log(`ok — ${DEST} DIVERGES from source, and the divergence is pinned.`)
      console.log(`  local    ${pin.localSha256}`)
      console.log(`  upstream ${pin.acceptedUpstreamSha256}  (accepted ${pin.pinnedAt ?? 'at an unrecorded date'})`)
      console.log(`  reason   ${pin.reason ?? 'none recorded'}`)
      for (const line of pin.divergence ?? []) console.log(`           ${line}`)
      console.log(`  ${PIN} names both revisions; either one moving fails this check.`)
      process.exit(0)

    case 'local-edited':
      console.error(`::error::${DEST} is not the revision ${PIN} pins — the local copy was edited after the pin was taken. The pin does not cover it.`)
      console.error(`  pinned ${pin.localSha256}`)
      console.error(`  on disk ${sha256(have)}`)
      process.exit(1)

    case 'upstream-moved':
      console.error(`::error::upstream has moved again since ${PIN} was taken. A divergence accepted for one revision is not accepted for the next — look at the new difference and either re-pin or reinstall.`)
      console.error(`  accepted ${pin.acceptedUpstreamSha256}`)
      console.error(`  upstream ${sha256(src)}`)
      process.exit(1)

    default:
      console.error(`::error::${DEST} has drifted from source — re-run without --check to reinstall it verbatim`)
      process.exit(1)
  }
}

// ── default: install, idempotently ───────────────────────────────────────────

if (!IS_ENTRY) {
  // Imported. The exports above are the point; nothing below is.
} else {

const src = await fetchSource()
if (!requiredFrontmatter(src)) {
  throw new Error('the fetched source failed the skill front-matter invariant; refusing to install a malformed skill')
}

const have = await localCopy()
if (have !== null && identical(have, src)) {
  console.log(`already identical — ${DEST} (${Buffer.byteLength(src)} bytes), nothing to do`)
  process.exit(0)
}

// A PIN BINDS THE WRITE PATH TOO, and this is the half that would otherwise
// make the whole thing decorative: a pin that only taught `--check` to stay
// quiet would be undone by the next person who runs this script without a flag,
// which is the documented way to "fix" the drift it just stopped reporting.
if (have !== null) {
  const pin = readPin()
  const v = verdict(have, src, pin)
  if (v === 'pinned') {
    console.error(`refusing to overwrite ${DEST}: its divergence from source is pinned by ${PIN}.`)
    console.error(`  reason  ${pin.reason ?? 'none recorded'}`)
    console.error(`  Delete ${PIN} to take upstream's version.`)
    process.exit(1)
  }
  if (v === 'upstream-moved') {
    console.error(`refusing to overwrite ${DEST}: ${PIN} accepted a divergence against a DIFFERENT upstream revision.`)
    console.error(`  accepted ${pin.acceptedUpstreamSha256}`)
    console.error(`  upstream ${sha256(src)}`)
    console.error(`  Look at the new difference, then either re-pin or delete ${PIN}.`)
    process.exit(1)
  }
}

await mkdir(dirname(DEST), { recursive: true })
await writeFile(DEST, src)

// Read it back and confirm the on-disk copy is what we fetched. A write that
// silently transformed the content is exactly the "reconstructed, not verbatim"
// failure this script exists to rule out.
const after = await readFile(DEST, 'utf8')
if (!identical(after, src)) {
  throw new Error('post-write verification failed: the on-disk copy differs from source')
}

const newlines = (src.match(/\n/g) || []).length
console.log(`${have === null ? 'installed' : 'updated'} — ${DEST} (${Buffer.byteLength(src)} bytes, ${newlines} lines), byte-identical to source`)

}
