#!/usr/bin/env node
// A check script must not be killed while its own output is still in flight.
//
// Task 3 of docs/CC-CMD-2026-10-11-process-exit-drops-the-annotation.md.
//
// `process.exit()` terminates immediately and drops pending asynchronous stdout
// writes. To a pipe — `execSync`, a CI log runner — that means the tail of a
// run can simply vanish, and `checks.mjs` prints the `::error` annotations
// immediately before exiting. `finish()` sets `process.exitCode` instead and
// lets Node drain.
//
// TWO CHECKS, AND THEY ARE NOT THE SAME STRENGTH, because the measurement does
// not support treating them the same.
//
//   FATAL    a script whose LAST executable statement is
//            `process.exit(summarize(...))`. Nothing follows it, so `finish()`
//            is a drop-in with no change in behaviour, and there is no reason
//            for a new one to appear.
//
//   RATCHET  an EARLY `process.exit(summarize(...))` — one with code after it.
//            `process.exit()` also STOPS, and `finish()` does not; converting
//            those would let a `--self-test` run fall through into the live
//            half, which for several of these means a browser or the network.
//            They are counted and may not grow.
//
// WHY THE SECOND IS A RATCHET RATHER THAN A FIX. Measured 2026-10-11 by
// `scripts/exit-truncation-probe.mjs`, twenty piped runs of each real program,
// idle and then under eight CPU burners on four cores:
//
//   build/VerifyMain.js        13146B   idle 0/20   loaded 5/20
//   check-doc-citations.mjs     3021B   idle 0/20   loaded 0/20
//   palette-check.mjs           1909B   idle 0/20   loaded 0/20
//   design-tokens-check.mjs     1535B   idle 0/20   loaded 0/20
//   typography-check.mjs        1310B   idle 0/20   loaded 0/20
//   sport-registry-check.mjs     834B   idle 0/20   loaded 0/20
//
// One program has ever been shown to lose its tail here, and it is already
// fixed. Restructuring sixty-one `if (SELF_TEST)` blocks into if/else to chase
// a loss nothing has exhibited would be a large diff against an unmeasured
// benefit — so they are frozen where they are, and the probe is the thing that
// will say if that stops being true.
//
// A BARE EARLY REFUSAL IS NOT THIS BUG. `process.exit(1)` after one line of
// "UNREACHABLE" is correct and must not be flagged; the fatal rule keys on
// `summarize`, which is what makes an exit the end of a printed report.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { createChecks, isMain, finish } from './checks.mjs'

export const DIR = 'scripts'

/** The ratchet's recorded count. A number in the repo, not in a comment. */
export const BUDGET_PATH = 'docs/early-exit-budget.txt'

/** An exit that ends a printed report. `ss()` is proof-check.mjs's own
 *  summarizer, named differently and doing the same job. */
export const REPORT_EXIT = /process\.exit\(\s*(?:summarize|ss)\s*\(/

/**
 * Comments and string literals, blanked.
 *
 * WITHOUT THIS THE CHECKER COUNTS ITSELF. The self-tests below hold fixtures
 * like `'process.exit(summarize())'` as ordinary strings, and the first live
 * run reported 74 early exits against a grep's 65 — the nine extra were this
 * file's own test data. A checker that cannot tell its fixtures from its
 * subject has been this repository's recurring defect, in three separate
 * checks, and it always reads as a real count.
 *
 * Blanks rather than deletes, so line numbers survive.
 */
export const codeOnly = src =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, m => ' '.repeat(m.length))
    .replace(/'(?:\\.|[^'\\\n])*'/g, m => ' '.repeat(m.length))
    .replace(/"(?:\\.|[^"\\\n])*"/g, m => ' '.repeat(m.length))
    .replace(/`(?:\\.|[^`\\])*`/g, m => m.replace(/[^\n]/g, ' '))

/** Lines that are not executable: blank, a comment, or a bare closer. */
export const isInert = line => {
  const t = line.trim()
  return t === '' || t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')
    || t === '}' || t === '})' || t === ']' || t === '});'
}

/**
 * Classify every report-ending exit in one file.
 *
 * `terminal` — nothing executable follows, so `finish()` is a drop-in.
 * `early`    — code follows, so the exit's stopping is load-bearing.
 */
export const classify = (rawSrc) => {
  const src = codeOnly(rawSrc)
  const lines = src.split('\n')
  const out = { terminal: [], early: [] }
  lines.forEach((l, i) => {
    if (!REPORT_EXIT.test(l)) return
    const follows = lines.slice(i + 1).some(x => !isInert(x))
    out[follows ? 'early' : 'terminal'].push(i + 1)
  })
  return out
}

/** Every .mjs in scripts/, with its classification. */
export const scanAll = (dir = DIR) =>
  readdirSync(dir).filter(f => f.endsWith('.mjs')).map(f => ({
    file: `${dir}/${f}`,
    ...classify(readFileSync(`${dir}/${f}`, 'utf8')),
  }))

// --- self-test ---------------------------------------------------------------

const IS_MAIN = isMain(import.meta.url)
const SELF_TEST = IS_MAIN && process.argv.includes('--self-test')

if (SELF_TEST) {
  const { check, summarize } = createChecks()

  const term = 'const x = 1\nprocess.exit(summarize() === 0 ? 0 : 1)\n'
  check('a terminal report exit is TERMINAL',
    classify(term).terminal.length === 1 && classify(term).early.length === 0,
    JSON.stringify(classify(term)))

  const early = "if (S) {\n  process.exit(summarize())\n}\nconsole.log('live')\n"
  check('a report exit with code after it is EARLY',
    classify(early).early.length === 1 && classify(early).terminal.length === 0,
    JSON.stringify(classify(early)))

  // THE ONE THAT MATTERS: a bare refusal must not be flagged at all. Several
  // scripts legitimately print one line and exit, and widening the rule to
  // them would make this check noise.
  const refusal = "console.error('UNREACHABLE')\nprocess.exit(1)\n"
  check('A BARE EARLY REFUSAL IS NOT FLAGGED',
    classify(refusal).terminal.length === 0 && classify(refusal).early.length === 0,
    JSON.stringify(classify(refusal)))
  check('...nor is process.exit(0)',
    classify("console.log('ok')\nprocess.exit(0)\n").terminal.length === 0)

  check('finish() is not flagged — it is the fix',
    classify('finish(summarize())\n').terminal.length === 0,
    JSON.stringify(classify('finish(summarize())\n')))

  check("proof-check's own summarizer counts too",
    classify('process.exit(ss())\n').terminal.length === 1)

  // Closers and comments after an exit do not make it early. This was the
  // first thing to get wrong: every `if (SELF_TEST) { ... }` block ends with a
  // `}`, and counting that as code would classify every terminal exit as early.
  check('a trailing brace does not make an exit early',
    classify('process.exit(summarize())\n}\n').terminal.length === 1,
    JSON.stringify(classify('process.exit(summarize())\n}\n')))
  check('...nor does a trailing comment',
    classify('process.exit(summarize())\n// done\n').terminal.length === 1)
  check('...but real code after it does',
    classify("process.exit(summarize())\nconsole.log('x')\n").early.length === 1)

  // THE CHECKER MUST NOT COUNT ITS OWN FIXTURES. The literals above are
  // strings; the subject is code.
  check('A REPORT EXIT INSIDE A STRING IS NOT A REPORT EXIT',
    classify('const t = \'process.exit(summarize())\'\nconst x = 1\n').terminal.length === 0
    && classify('const t = \'process.exit(summarize())\'\nconst x = 1\n').early.length === 0,
    JSON.stringify(classify('const t = \'process.exit(summarize())\'\nconst x = 1\n')))
  check('...nor one in a double-quoted string',
    classify('const t = "process.exit(summarize())"\nconst x = 1\n').early.length === 0)
  check('...nor one in a comment',
    classify('// process.exit(summarize())\nconst x = 1\n').early.length === 0)
  check('...but the real statement beside such a string still counts',
    classify('const t = \'process.exit(summarize())\'\nprocess.exit(summarize())\n').terminal.length === 1,
    JSON.stringify(classify('const t = \'process.exit(summarize())\'\nprocess.exit(summarize())\n')))
  check('blanking keeps the line numbering', codeOnly('a\n// x\nb').split('\n').length === 3)

  check('isInert knows a blank line', isInert('   '))
  check('isInert does NOT swallow a statement', !isInert('const x = 1'))

  const scanned = scanAll()
  check('the scan is not vacuous', scanned.length > 50, `${scanned.length} file(s)`)
  check('THE SCAN FINDS THE REAL EARLY EXITS, or the ratchet guards nothing',
    scanned.reduce((n, s) => n + s.early.length, 0) > 0)

  finish(summarize())
}

// --- live --------------------------------------------------------------------

if (IS_MAIN && !SELF_TEST) {
  const { check, summarize } = createChecks()
  const scanned = scanAll()
  const terminal = scanned.flatMap(s => s.terminal.map(n => `${s.file}:${n}`))
  const early = scanned.flatMap(s => s.early.map(n => `${s.file}:${n}`))

  const budget = existsSync(BUDGET_PATH)
    ? Number(readFileSync(BUDGET_PATH, 'utf8').trim())
    : null

  console.log(`\n  scanned ${scanned.length} script(s) in ${DIR}/`)
  console.log(`  terminal report exits: ${terminal.length}  (must be 0 — finish() is a drop-in)`)
  console.log(`  early report exits:    ${early.length}  (ratchet, budget ${budget ?? 'MISSING'})`)
  console.log('')

  check('NO SCRIPT ENDS BY KILLING ITSELF MID-WRITE — use finish(summarize())',
    terminal.length === 0, terminal.join(', '))

  check(`${BUDGET_PATH} exists, or the ratchet has no number`, budget !== null,
    'write the current count into it')

  check('early report exits do not grow',
    budget !== null && early.length <= budget,
    `${early.length} now, budget ${budget}` +
    (budget !== null && early.length > budget
      ? ` — the new one(s) are among: ${early.join(', ')}` : ''))

  // A budget that has drifted ABOVE the real count is a ratchet with slack in
  // it, which is how a ratchet stops ratcheting.
  check('...and the budget is not loose', budget !== null && early.length === budget,
    `${early.length} now, budget ${budget} — lower the budget to ${early.length}`)

  finish(summarize())
}
