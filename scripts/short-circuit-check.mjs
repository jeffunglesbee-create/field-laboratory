// Refuses short-circuit operators over commands that RUN something.
//
// WHY THIS EXISTS
//
// `&&` and `.every` do two jobs at once: they state a logical claim, and they
// schedule the work. Short-circuiting is correct for the claim and wrong for the
// measurement. When the operands are side-effecting checks, the verdict stays
// right and the COVERAGE becomes a function of the data — so a red run and a
// green run are not comparable, and nothing in the output says which you got.
//
// Measured 2026-09-05, in `mutation-check.mjs`:
//
//   distinctExpects.every(cmd => run(cmd))
//
// `venue-coverage-check` had been failing since 2026-08-24, so this stopped at
// the first failing command and never ran the other twenty-odd, several of them
// browser rows. Three consequences, in order of how much each cost:
//
//   1. A RED baseline ran FASTER than a green one. Nobody watches for a suite
//      getting quicker, so twelve days passed.
//   2. Its 26m44s was then read as the cost of a PASSING gate and used to size
//      the job timeout. The next green run was cancelled at 36m52s having
//      written no measurement at all.
//   3. The report named one failing command when it could have named every one.
//
// The verdict was never wrong. That is what made it invisible: every assertion
// about correctness held, and only the arithmetic of how much had been looked at
// was off.
//
// WHAT THIS DOES AND DOES NOT CATCH — stated plainly, because a linter that
// implies more than it holds is the same failure one level up:
//
//   CAUGHT.  `&& ok(`, `&& run(`, `|| ok(`, `|| run(`, and `.every`/`.some`
//            whose callback names `ok(` or `run(` on the same line. That is the
//            shape both real instances had.
//
//   NOT CAUGHT.  A short-circuit whose operands are indirected through another
//            binding — `const f = ok; xs.every(f)` — or split across lines. This
//            is a habit guard, not a proof. `all(...)` in gate-checks.mjs is
//            what makes the right form as easy to write as the wrong one.
//
// Usage:  node scripts/short-circuit-check.mjs
//         node scripts/short-circuit-check.mjs --self-test

import { readFileSync, readdirSync } from 'node:fs'
import { createChecks, isMain, finish } from './checks.mjs'

// This file quotes every banned form above, in prose, on purpose. Scanning it
// would flag its own documentation — so comments are stripped before scanning,
// and the self-test below proves that stripping does not also blind the scan to
// real code. Excluding the file by name would have been the cheaper fix and the
// worse one: it makes the checker the one place its own rule does not apply.
const stripComments = src =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map(l => l.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n')

// BOTH SIDES must be command calls. `built && run(m.expect)` in
// `mutation-check.mjs` is a PRECONDITION, not a second measurement: `built` is
// the result of `npm run build`, and running the expect on a failed build would
// measure a broken tree rather than the mutation. Short-circuiting is correct
// there. A first draft of this rule flagged it, and a linter that flags correct
// code is one the reader learns to skip — so the rule is about two MEASUREMENTS
// joined by an operator that will not run both.
const RULES = [
  { id: 'and-ok', re: /\b(ok|run)\s*\([^)]*\)\s*&&\s*(ok|run)\s*\(/, why: 'the second command runs only when the first passed' },
  { id: 'or-ok', re: /\b(ok|run)\s*\([^)]*\)\s*\|\|\s*(ok|run)\s*\(/, why: 'the second command runs only when the first failed' },
  { id: 'every-run', re: /\.(every|some)\s*\([^)]*\b(ok|run)\s*\(/, why: 'stops at the first command that settles the verdict' },
]

/** Every offence in one file's source, as {line, id, why, text}. */
export const offences = src =>
  stripComments(src)
    .split('\n')
    .flatMap((text, i) =>
      RULES.filter(r => r.re.test(text))
        .map(r => ({ line: i + 1, id: r.id, why: r.why, text: text.trim() })))

if (isMain(import.meta.url)) {
  const { check, summarize } = createChecks()

  // --- the detector must still catch the shape it was written for -----------
  //
  // Fixtures live in test/, not inline: the scan below reads scripts/*.mjs and
  // would otherwise flag its own test data. Every `bad` entry is a REAL line,
  // copied from the commit that fixed it.
  const fx = JSON.parse(readFileSync('test/short-circuit-fixtures.json', 'utf8'))

  const missed = fx.bad.filter(l => offences(l).length === 0)
  check('the detector catches every form that actually occurred',
    missed.length === 0,
    `missed ${missed.length} of ${fx.bad.length}: ${JSON.stringify(missed)}`)

  const overfired = fx.good.filter(l => offences(l).length > 0)
  check('and flags none of the forms that are correct',
    overfired.length === 0,
    `flagged ${overfired.length} of ${fx.good.length}: ${JSON.stringify(overfired)}`)

  // The comment stripper is load-bearing: this file documents the banned forms
  // in prose. Prove it strips comments WITHOUT blinding the scan to live code on
  // the same line, which is the way a stripper usually fails.
  check('a banned form inside a comment is not an offence',
    offences(`  // never write ${fx.bad[0]} here`).length === 0,
    'the stripper must clear commentary')
  check('...but code followed by a comment still is',
    offences(`${fx.bad[0]} // two commands`).length === 1,
    'stripping must not swallow the line it is attached to')

  if (process.argv.includes('--self-test')) process.exit(summarize() === 0 ? 0 : 1)

  // --- the real scan --------------------------------------------------------
  const files = readdirSync('scripts').filter(f => f.endsWith('.mjs'))
  const found = files.flatMap(f =>
    offences(readFileSync(`scripts/${f}`, 'utf8')).map(o => ({ ...o, file: `scripts/${f}` })))

  console.log(`\nScanned ${files.length} script(s) for short-circuited measurement`)
  for (const o of found) {
    console.log(`  ${o.file}:${o.line}  [${o.id}] ${o.why}`)
    console.log(`      ${o.text}`)
  }

  check('no check is measured through a short-circuit',
    found.length === 0,
    found.length
      ? `${found.length} site(s) — use all(...) from gate-checks.mjs, or .filter() when collecting failures`
      : '')

  finish(summarize())
}
