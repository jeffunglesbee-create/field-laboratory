// This repository must not become another place a leaked credential lives.
//
// THE FAILURE THIS IS BUILT FROM
//
// Repeatedly, across this project, I said I would not copy the relay's
// `X-FIELD-Relay` value into laboratory, and declined to put it into
// laboratory's Actions secrets. Both statements were true when made and neither
// was worth anything, because the value was already committed: `41f0b33`
// (2026-08-16), subject "Correct Phase 4: laboratory generates nothing", wrote
// it out in full inside `docs/JLAYER-PLAN.md` — in the sentence explaining that
// it is write-capable against the production briefs table and that laboratory
// must not hold it.
//
// A refusal is a promise. A promise does not scan files.
//
// HOW IT WORKS WITHOUT STORING WHAT IT PROTECTS
//
// `docs/exposed-secrets.sha256` holds hashes, never plaintext. This walks every
// tracked file, splits it into candidate tokens, hashes each, and fails on a
// match. Hashing candidates rather than searching for values is what lets the
// pinned list stay hashed: there is nothing here to leak, and a reader of this
// repository learns only that three credentials exist and where they leaked.
//
// WHAT IT CANNOT DO, SAID PLAINLY
//
//   IT DOES NOT PURGE HISTORY. The relay value is readable at `41f0b33` and
//   nothing in this file changes that. Redacting the working tree stops the
//   value spreading; only rotation ends the exposure, and rotation is not
//   laboratory's to perform.
//
//   IT IS NOT A GENERAL SECRET SCANNER. It knows three specific strings by
//   their hashes. A general scanner has to guess what is secret, and guesses
//   either miss or cry wolf — this repo already refuses that trade elsewhere
//   (`tryParkByVenue` is exact equality, never a prefix, for the same reason).
//
//   A HASH IS NOT A VAULT. These are low-entropy strings; anyone holding a
//   candidate can confirm it. The threat model is a paste into this repo by
//   someone who already has the value, not an attacker deriving it from here.
//
// Usage:  node scripts/exposed-secret-check.mjs [--self-test]

import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createChecks, isMain } from './checks.mjs'

const SELF_TEST = isMain(import.meta.url) && process.argv.includes('--self-test')
const PINS_PATH = 'docs/exposed-secrets.sha256'

const sha256 = s => createHash('sha256').update(s).digest('hex')

/**
 * Candidate tokens in a blob of text.
 *
 * Split on anything a credential does not contain. `field-relay-cron-2026`
 * survives as one token out of `X-FIELD-Relay: field-relay-cron-2026`, and so
 * do hex API keys out of JSON. The floor of 12 keeps the hash count sane
 * without excluding anything credential-shaped.
 *
 * Also emits each token with surrounding punctuation trimmed differently — a
 * value pasted as `"secret"` or `secret,` tokenises identically here, but one
 * pasted as part of a longer hyphenated phrase would not, so the SLIDING pass
 * below covers hyphen-joined runs.
 */
export function tokensIn(text) {
  const out = new Set()
  for (const t of text.split(/[^A-Za-z0-9_-]+/)) {
    if (t.length < 12) continue
    out.add(t)
    // A hyphenated token can be a phrase with the secret inside it. Add every
    // contiguous run of its hyphen-separated parts, so `prefix-the-secret-here`
    // still yields `the-secret`.
    const parts = t.split('-')
    if (parts.length > 1 && parts.length <= 12) {
      for (let i = 0; i < parts.length; i++) {
        for (let j = i + 1; j <= parts.length; j++) {
          const run = parts.slice(i, j).join('-')
          if (run.length >= 12) out.add(run)
        }
      }
    }
  }
  return out
}

/** `<64-char sha256>  <description>` lines, comments and blanks ignored. */
export function parsePins(text) {
  const pins = new Map()
  for (const line of text.split('\n')) {
    const bare = line.replace(/^\s*#.*$/, '').trim()
    if (!bare) continue
    const m = /^([0-9a-f]{64})\s+(.+)$/.exec(bare)
    if (m) pins.set(m[1], m[2])
  }
  return pins
}

/** Every pinned secret found in `text`, as [hash, description]. */
export function hitsIn(text, pins) {
  const hits = []
  for (const tok of tokensIn(text)) {
    const h = sha256(tok)
    if (pins.has(h)) hits.push([h, pins.get(h)])
  }
  return hits
}

// ── the self-test ───────────────────────────────────────────────────────────
//
// A scanner that cannot find a planted secret would report this repository
// clean forever, which is the only outcome worse than not having one.

if (SELF_TEST) {
  const { check, summarize } = createChecks()
  const PLANTED = 'self-test-not-a-real-secret-9f2b'
  const pins = new Map([[sha256(PLANTED), 'planted for the self-test']])

  check('a planted secret is found',
    hitsIn(`token: ${PLANTED}\n`, pins).length === 1,
    'the scanner missed a value it was given the hash of')

  check('it is found inside a header line, not just alone',
    hitsIn(`X-Some-Header: ${PLANTED}`, pins).length === 1, 'header form missed')

  check('it is found when quoted and comma-terminated',
    hitsIn(`{"key": "${PLANTED}", "other": 1}`, pins).length === 1, 'JSON form missed')

  check('it is found inside a longer hyphenated phrase',
    hitsIn(`prefix-${PLANTED}-suffix`, pins).length === 1, 'hyphen-run form missed')

  check('an unrelated file is clean',
    hitsIn('nothing to see, just some ordinary prose and a-normal-identifier\n', pins).length === 0,
    'false positive on ordinary text')

  // The property that lets the pin file stay hashed.
  check('a near-miss does NOT match',
    hitsIn(`${PLANTED}x`, pins).length === 0, 'matched a value that is not the secret')

  check('the pin parser ignores comments and blanks',
    parsePins(`# a comment with ${'0'.repeat(64)} in it\n\n${'a'.repeat(64)}  real pin\n`).size === 1,
    'comment or blank handling is wrong')

  // Non-vacuity for the real run below: the committed pin file must parse.
  const real = parsePins(readFileSync(PINS_PATH, 'utf8'))
  check('the committed pin file parses to at least one pin',
    real.size > 0, `${real.size} pin(s) in ${PINS_PATH}`)

  // End to end, on a real file in a temp dir.
  const dir = join(tmpdir(), `exposed-secret-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  try {
    writeFileSync(join(dir, 'leak.md'), `Header: ${PLANTED}\n`)
    check('a file on disk containing the planted secret is caught',
      hitsIn(readFileSync(join(dir, 'leak.md'), 'utf8'), pins).length === 1,
      'the on-disk path missed it')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }

  process.exit(summarize() === 0 ? 0 : 1)
}

// ── the real tree ───────────────────────────────────────────────────────────
//
// Guarded: importing this for `hitsIn` must not scan the repo and exit.
if (isMain(import.meta.url)) {

const { check, summarize } = createChecks()
const pins = parsePins(readFileSync(PINS_PATH, 'utf8'))

check('there are pinned secrets to look for',
  pins.size > 0,
  `${PINS_PATH} parsed to no pins — a scanner with nothing to find reports every tree clean`)

const files = execSync('git ls-files', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  .split('\n').filter(Boolean)
  // The pin file holds the hashes; scanning it would be scanning the answer key.
  .filter(f => f !== PINS_PATH)

const found = []
let scanned = 0
for (const f of files) {
  let text
  try { text = readFileSync(f, 'utf8') } catch { continue }
  scanned++
  for (const [, why] of hitsIn(text, pins)) found.push(`${f}: ${why}`)
}

console.log(`\nScanned ${scanned} tracked file(s) against ${pins.size} pinned hash(es)\n`)

// Named by DESCRIPTION, never by value or by hash. A failure message that
// printed the secret would be the leak it is reporting.
check('no tracked file contains a known-exposed credential',
  found.length === 0,
  found.join('\n      → '))

process.exit(summarize() === 0 ? 0 : 1)
}
