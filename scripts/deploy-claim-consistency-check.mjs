// The README may not say deployment is blocked while STATUS.md says it shipped.
//
// WHY THIS EXISTS, measured 2026-09-10
//
// README.md's last line read "a `CLOUDFLARE_API_TOKEN` secret that only a human
// can add" for thirty-one days after the Courier OIDC bootstrap installed it
// programmatically. Nothing in this repo could contradict it, so it was read
// during the 2026-09-07 queue audit as evidence the bootstrap had not completed.
//
// It is the second instance of the shape README.md itself records — a negative
// result kept past the evidence that retired it — and the first, the twenty-five
// days of silence about `Verify.fs`, is in that same section.
//
// THE FACT WAS ALWAYS DERIVABLE. A published site implies the deploy secret
// exists; you cannot publish without it. STATUS.md already probes publication
// live and regenerates, so the contradiction was checkable from day one and
// nothing was checking it.
//
// WHAT THIS DOES NOT DO. It cannot see the secret. It asserts one implication:
// published ⇒ the README must not claim deployment is waiting on a human. When
// STATUS.md says the site is NOT published, a blocking claim is legitimate and
// this stays quiet.

import { readFileSync } from 'node:fs'
import { createChecks, isMain } from './checks.mjs'

const SELF_TEST = isMain(import.meta.url) && process.argv.includes('--self-test')

/**
 * Prose that REPORTS a past claim is not the claim.
 *
 * README.md now contains `*"a secret that only a human can add"*` inside the
 * paragraph recording the correction, and that sentence is the repo doing
 * exactly what it should. A check that cannot tell a quotation from an assertion
 * would fire on the fix and force the record to be deleted to stay green — the
 * silent correction this was written to prevent.
 *
 * Removed before scanning: fenced blocks, inline code, blockquotes, and
 * emphasised quoted spans.
 */
export const assertionsOnly = md => md
  .replace(/```[\s\S]*?```/g, ' ')
  .replace(/`[^`\n]*`/g, ' ')
  .replace(/^\s*>.*$/gm, ' ')
  .replace(/\*+"[^"]*"\*+/g, ' ')
  .replace(/_+"[^"]*"_+/g, ' ')

// Phrasings that assert deployment is waiting on a person. Each one occurred, or
// is a near neighbour of one that did.
export const BLOCKING = [
  /only a human can (?:add|install|set)/i,
  /a human must (?:add|install|set)/i,
  /needs? a human to (?:add|install|set)/i,
  /(?:cannot|can't|could not) be deployed/i,
  /(?:is )?not (?:yet )?deployed/i,
  /blocked on a (?:human|person|secret)/i,
  /awaiting a (?:human|secret)/i,
]

export const blockingClaims = md => {
  const text = assertionsOnly(md)
  return BLOCKING.filter(re => re.test(text)).map(re => String(re))
}

/**
 * Publication state read from STATUS.md.
 *
 * Three outcomes, never two. An unrecognised STATUS.md returns `unknown` and
 * FAILS rather than defaulting to "not published" — a silent default would make
 * a regenerated-but-reshaped STATUS.md read as permission for any claim at all,
 * which is the absence-looking-like-success failure this repo keeps meeting.
 */
export const publishedPerStatus = statusMd => {
  const m = /##\s*Is it published\?\s*\n+\s*\*\*(Yes|No)\*\*/i.exec(statusMd)
  if (!m) return 'unknown'
  return m[1].toLowerCase() === 'yes' ? 'yes' : 'no'
}

if (SELF_TEST) {
  const { check, summarize } = createChecks()
  const PUB = '## Is it published?\n\n**Yes** — Cloudflare Workers: <https://x>\n'
  const UNPUB = '## Is it published?\n\n**No** — nothing is serving\n'

  check('a published STATUS reads as yes', publishedPerStatus(PUB) === 'yes', publishedPerStatus(PUB))
  check('an unpublished STATUS reads as no', publishedPerStatus(UNPUB) === 'no', publishedPerStatus(UNPUB))

  // MUTATION: the one that matters most. A reshaped STATUS.md must not read as
  // permission; it must read as "I could not tell".
  check('MUTATION: a STATUS.md with no publication section is UNKNOWN, not "no"',
    publishedPerStatus('# Status\n\n## Something else\n\n**Yes**\n') === 'unknown',
    'a silent default would let any claim pass whenever the file is reshaped')

  check('a real blocking assertion is found',
    blockingClaims('Deployment needs a token that only a human can add.').length === 1)

  // MUTATION: the fix itself must stay green. The corrected README quotes the
  // old claim; a check that fires on that forces the record to be deleted.
  check('MUTATION: the same words INSIDE a quotation are not an assertion',
    blockingClaims('That line read *"a secret that only a human can add"* for 31 days.').length === 0,
    'the check fires on the repo recording its own correction, so staying green would mean deleting the record')

  check('...and inside inline code they are not an assertion either',
    blockingClaims('The old text was `only a human can add` and is gone.').length === 0)

  check('...and inside a blockquote they are not an assertion either',
    blockingClaims('> a secret that only a human can add\n\nThat was wrong.').length === 0)

  check('a fenced block is not an assertion',
    blockingClaims('```\nonly a human can add\n```\n').length === 0)

  // MUTATION: the vocabulary must not be so narrow it only catches the one
  // sentence that already happened.
  check('MUTATION: a NEIGHBOURING phrasing is caught, not just the exact one that occurred',
    blockingClaims('The site is not yet deployed.').length === 1,
    'a list matching only the historical sentence would pass the next variant of it')

  check('clean prose yields nothing',
    blockingClaims('Deployment needs a token. It is installed; see DEPLOY.md.').length === 0)

  process.exit(summarize() === 0 ? 0 : 1)
}

if (isMain(import.meta.url) && !SELF_TEST) {
  const { check, summarize } = createChecks()
  const readme = readFileSync('README.md', 'utf8')
  const status = readFileSync('STATUS.md', 'utf8')
  const published = publishedPerStatus(status)
  const claims = blockingClaims(readme)

  console.log(`STATUS.md publication: ${published}`)
  console.log(`README.md blocking assertions: ${claims.length ? claims.join(', ') : 'none'}`)
  console.log('scanned README.md in full, outside code, quotations and blockquotes\n')

  check('STATUS.md still declares a publication state this check can read',
    published !== 'unknown',
    'the "Is it published?" section is missing or reshaped — this check cannot answer, and says so rather than passing')

  check('the README does not say deployment waits on a human while STATUS.md says it shipped',
    !(published === 'yes' && claims.length > 0),
    `STATUS.md says published and README.md asserts ${claims.join(', ')}. `
    + 'One of them is stale. This is the 2026-08-10 -> 2026-09-10 defect recurring.')

  process.exit(summarize() === 0 ? 0 : 1)
}
