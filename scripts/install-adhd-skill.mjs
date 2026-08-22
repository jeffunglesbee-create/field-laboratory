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
//   --self-test   exercise the pure logic against fixtures, no network.
//
// Node 22+ (global fetch). No dependencies beyond node: built-ins and, for the
// self-test only, the repo's own checks.mjs.

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname } from 'node:path'

const SRC = 'https://raw.githubusercontent.com/ayghri/i-have-adhd/main/skills/i-have-adhd/SKILL.md'
const DEST = '.claude/skills/i-have-adhd/SKILL.md'

const CHECK = process.argv.includes('--check')
const SELF_TEST = process.argv.includes('--self-test')

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
  if (identical(have, src)) {
    console.log(`ok — ${DEST} is byte-identical to source (${Buffer.byteLength(src)} bytes)`)
    process.exit(0)
  }
  console.error(`::error::${DEST} has drifted from source — re-run without --check to reinstall it verbatim`)
  process.exit(1)
}

// ── default: install, idempotently ───────────────────────────────────────────

const src = await fetchSource()
if (!requiredFrontmatter(src)) {
  throw new Error('the fetched source failed the skill front-matter invariant; refusing to install a malformed skill')
}

const have = await localCopy()
if (have !== null && identical(have, src)) {
  console.log(`already identical — ${DEST} (${Buffer.byteLength(src)} bytes), nothing to do`)
  process.exit(0)
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
