#!/usr/bin/env node
// A pinned divergence must keep SAYING it diverged.
//
// `docs/adhd-skill-pin.json` accepts one difference between the installed
// i-have-adhd skill and its published source. `install-adhd-skill.mjs --check`
// then exits 0 — and an exit code is all the sentinel reads, so nothing else
// would notice if that run started printing "byte-identical to source".
//
// That is the failure mode an exemption actually has. Not that it is wrong on
// the day it is written, but that it goes quiet, and a difference somebody
// accepted once becomes a clean bill of health nobody revisits. So the output
// is checked, not only the status: the run must name the divergence, both
// hashes, and the reason.
//
// It does NOT re-derive whether the pin is correct — `install-adhd-skill.mjs
// --self-test` does that, over fixtures, without a network. This asks the
// narrower question that only the real run can answer: when the pin is in
// force, does the operator see it?

import { readFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { createChecks, isMain, finish } from './checks.mjs'

export const PIN = 'docs/adhd-skill-pin.json'

/**
 * What one `--check` run's output means.
 *
 *   'unreachable'  the third-party CDN could not be read. Not this repo's
 *                  problem and not a verdict — the installer says so itself.
 *   'reported'     the divergence is named in the output.
 *   'silent'       it exited ok without naming it. THE DEFECT.
 *   'identical'    no divergence to report.
 */
export const classify = out => {
  if (/source unreachable/i.test(out)) return 'unreachable'
  if (/DIVERGES from source/.test(out) && /the divergence is pinned/.test(out)) return 'reported'
  if (/byte-identical to source/.test(out)) return 'identical'
  return 'silent'
}

/** Does a reported run carry everything a reader needs to act? */
export const carriesEvidence = (out, pin) =>
  out.includes(pin.localSha256)
  && out.includes(pin.acceptedUpstreamSha256)
  && typeof pin.reason === 'string' && out.includes(pin.reason)

const IS_MAIN = isMain(import.meta.url)
const SELF_TEST = IS_MAIN && process.argv.includes('--self-test')

if (SELF_TEST) {
  const { check, summarize } = createChecks()

  check('a run that names the divergence reads as reported',
    classify('ok — x DIVERGES from source, and the divergence is pinned.\n') === 'reported')
  check('A RUN THAT PRINTS byte-identical WHILE PINNED READS AS IDENTICAL, not reported',
    classify('ok — x is byte-identical to source (10 bytes)\n') === 'identical')
  check('an unreachable source is its own state, never a verdict',
    classify('::warning::source unreachable (TypeError); x is present\n') === 'unreachable')
  check('SILENCE IS ITS OWN STATE — neither reported nor identical nor unreachable',
    classify('ok\n') === 'silent')
  // Half the phrase must not pass. The mutation this guards against replaces
  // the whole line, but a future one might only weaken it.
  check('half the phrase is not the phrase',
    classify('ok — x DIVERGES from source\n') === 'silent',
    'a partial message passed as a full report')

  const pin = { localSha256: 'aaa', acceptedUpstreamSha256: 'bbb', reason: 'because' }
  check('evidence means both hashes AND the reason',
    carriesEvidence('aaa bbb because', pin))
  check('...a missing hash is missing evidence', !carriesEvidence('aaa because', pin))
  check('...and so is a missing reason', !carriesEvidence('aaa bbb', pin))

  finish(summarize())
}

if (IS_MAIN && !SELF_TEST) {
  const { check, summarize } = createChecks()

  if (!existsSync(PIN)) {
    console.log(`\n  ${PIN} is absent — no pinned divergence to report on.`)
    console.log(`  This check is vacuous by design when nothing is pinned.\n`)
    check('nothing is pinned, so there is nothing that could go quiet', true)
    finish(summarize())
  } else {
    const pin = JSON.parse(readFileSync(PIN, 'utf8'))
    let out = ''
    try {
      out = execSync('node scripts/install-adhd-skill.mjs --check',
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000 })
    } catch (e) { out = `${e.stdout ?? ''}${e.stderr ?? ''}` }

    const state = classify(out)
    console.log(`\n  pin in force, --check reported: ${state}\n`)

    if (state === 'unreachable') {
      // Said rather than skipped silently, which is the distinction the
      // installer itself draws for the same reason.
      console.log(`  The source CDN was unreachable, so this run could not observe`)
      console.log(`  the pinned report. NOT a pass for the behaviour — an unmeasured run.\n`)
      check('the source was unreachable, so the pinned report went unobserved this run', true)
    } else {
      check('A PINNED DIVERGENCE IS REPORTED, not reduced to an ok',
        state === 'reported',
        `--check said "${state}" with ${PIN} in force; the operator would see no divergence`)
      check('...and the report carries both hashes and the reason',
        state === 'reported' && carriesEvidence(out, pin),
        'the divergence is named but a reader cannot act on it')
    }
    finish(summarize())
  }
}
