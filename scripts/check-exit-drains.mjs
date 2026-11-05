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
// will say if that stops being true. (Sixty-one was the count of the scan that
// existed then; the true count was sixty-four. See `codeOnly`.)
//
// A BARE EARLY REFUSAL IS NOT THIS BUG. `process.exit(1)` after one line of
// "UNREACHABLE" is correct and must not be flagged; the fatal rule keys on
// `summarize`, which is what makes an exit the end of a printed report.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { createChecks, isMain, finish } from './checks.mjs'
import { blankNonCode } from './strip-non-code.mjs'

export const DIR = 'scripts'

/** The ratchet's recorded count. A number in the repo, not in a comment. */
export const BUDGET_PATH = 'docs/early-exit-budget.txt'

/** An exit that ends a printed report. `ss()` is proof-check.mjs's own
 *  summarizer, named differently and doing the same job. */
export const REPORT_EXIT = /process\.exit\(\s*(?:summarize|ss)\s*\(/

/**
 * Comments, string literals, regular-expression literals and template literals, blanked.
 *
 * WITHOUT THIS THE CHECKER COUNTS ITSELF. The self-tests below hold fixtures
 * like `'process.exit(summarize())'` as ordinary strings, and the first live
 * run reported 74 early exits against a grep's 65 — the nine extra were this
 * file's own test data. A checker that cannot tell its fixtures from its
 * subject has been this repository's recurring defect, in three separate
 * checks, and it always reads as a real count.
 *
 * Blanks rather than deletes, so line numbers survive.
 *
 * IT IS THE SCANNER `row-confidence.mjs` USES (`scripts/strip-non-code.mjs`), NOT FIVE REGULAR-EXPRESSION PASSES. The five passes (block comments, line comments, single quotes, double
 * quotes, backticks, each over the whole text) paired quotes, backticks and comment openers wherever they happened to fall, and the first one that lost its place hid every exit after it.
 * Three of the 63 exits in scripts/ were hidden that way from the day the budget was set (2026-10-11, commit 9af2778, which recorded 61 against a true 64), one each: `docs-check.mjs`
 * (a regular-expression literal with an odd number of backticks), `deploy-claim-consistency-check.mjs` (one with backticks in a character class) and `relay-duplicate-fixture-watch.mjs`
 * (an apostrophe inside a template with an empty string after it on the line). Blanking that one line of the script took the old scan from 0 exits to 1 in each (measured 2026-11-05).
 * A template literal is blanked WHOLE, `${…}` expressions included, as the passes did; an exit inside one does not occur in scripts/.
 */
export const codeOnly = blankNonCode

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

  // EVERY CONSTRUCT THAT USED TO COST THE OLD SCAN ITS PLACE, followed by an exit it must still see, and six that it always read correctly. Five regular-expression passes over the whole
  // text paired quotes, backticks and comment openers wherever they fell, and 3 of the 63 exits in scripts/ were invisible to them from the day the budget was set (docs-check.mjs,
  // deploy-claim-consistency-check.mjs, relay-duplicate-fixture-watch.mjs). The first six are the shapes that did it (the old scan saw none of the six exits); the last six are the shapes
  // that look like they could and did not (it saw all six), so a scanner that gets the first six right by giving up on quotes is caught by the second set.
  const EXIT = "if (S) {\n  process.exit(summarize())\n}\nconsole.log('live')\nconst t = `x`\n"
  const LOST = {
    'a regular expression with an odd number of backticks': "const f = /^\\s*(```|~~~)/.test(l)\n",
    'a regular expression with backticks in a class': "const g = s.replace(/`[^`\\n]*`/g, ' ')\n",
    'an apostrophe inside a template, then an empty string on the same line': "const m = ok ? `a's ${x}` : ''\n",
    'a // inside a template': "const u = `http://${h}/p`\n",
    // The `*/` has to come AFTER the exit: the old comment pass paired the glob's `/*` with the nearest `*/`, and a comment that closes before the exit leaves the exit alone.
    'a block-comment opener inside a string (a glob), and a comment after the exit': ["const g = 'src/*.mjs'\n", "/* c */\n"],
    'a backtick in a regular expression after return': "const f = s => { return /`/.test(s) }\n",
  }
  const HANDLED = {
    'a // inside a single-quoted string': "const u = 'http://x/y'\n",
    'a quote inside a regular expression': "const r = /'/.test(s)\n",
    'a division, then a quote': "const d = a / b + 'x'\n",
    'a multi-line template': "const m = `a\nb`\n",
    'a multi-line block comment': "/* a\nb */\n",
    'an apostrophe inside a double-quoted string': 'const s = "it\'s"\n',
  }
  const FIXTURES = { ...LOST, ...HANDLED }
  const around = ([pre, post = '']) => pre + EXIT + post
  const wrong = Object.entries(FIXTURES).map(([k, v]) => [k, classify(around([].concat(v)))]).filter(([, c]) => c.early.length !== 1 || c.terminal.length !== 0)
  check(`AN EXIT IS STILL SEEN AFTER EACH CONSTRUCT THAT LOST THE OLD SCAN ITS PLACE (${Object.keys(FIXTURES).length} fixtures: ${Object.keys(LOST).length} the old scan lost, ${Object.keys(HANDLED).length} it read correctly)`,
    wrong.length === 0, wrong.map(([k]) => k).join(' / ') + ` (${wrong.length} of ${Object.keys(FIXTURES).length} wrong)`)

  // The other direction: text that holds the statement and is not code must not count, and the old scan did not blank a regular expression at all.
  const HOLDERS = {
    'a regular expression': 'const r = /process.exit(summarize(/\nconst x = 1\n',
    'a template': 'const t = `process.exit(summarize())`\nconst x = 1\n',
    'a block comment': '/* process.exit(summarize()) */\nconst x = 1\n',
  }
  const counted = Object.entries(HOLDERS).filter(([, src]) => classify(src).early.length !== 0 || classify(src).terminal.length !== 0)
  check(`A REPORT EXIT INSIDE A REGULAR EXPRESSION, A TEMPLATE OR A BLOCK COMMENT IS NOT ONE (${Object.keys(HOLDERS).length} fixtures)`,
    counted.length === 0, counted.map(([k]) => k).join(' / ') + ` (${counted.length} of ${Object.keys(HOLDERS).length} counted)`)

  // The line a hit is reported at is the line of the source: a multi-line template and a multi-line comment before it must not move it.
  const lined = "const m = `a\nb\nc`\n/* x\ny */\nprocess.exit(summarize())\nconsole.log('live')\n"
  check('THE REPORTED LINE IS THE SOURCE LINE, past a multi-line template and a multi-line comment',
    classify(lined).early.join() === '6', JSON.stringify(classify(lined)))

  check('isInert knows a blank line', isInert('   '))
  check('isInert does NOT swallow a statement', !isInert('const x = 1'))

  const scanned = scanAll()
  check('the scan is not vacuous', scanned.length > 50, `${scanned.length} file(s)`)
  const drifted = scanned.filter(s => { const t = readFileSync(s.file, 'utf8'); const b = codeOnly(t); return b.length !== t.length || b.split('\n').length !== t.split('\n').length })
  // Three texts that end inside a construct, which no script does: the span must stop at the end of the text, or the blank is one character longer.
  const OPEN = ['const s = \'a\\', 'const t = `a\\', 'const r = /a\\']
  const grown = OPEN.filter(src => codeOnly(src).length !== src.length)
  check(`THE BLANKED TEXT HAS THE SOURCE'S LENGTH AND LINE COUNT, for all ${scanned.length} scripts scanned and ${OPEN.length} texts that end inside a string, a template and a regular expression`, drifted.length === 0 && grown.length === 0,
    `${drifted.length} of ${scanned.length} scripts differ: ${drifted.map(s => s.file).join(', ')}; ${grown.length} of ${OPEN.length} open texts grew`)
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
