// Values written but never read back.
//
// From jubilant-bassoon's account of what the confidence gate actually scores:
//
//   "Docked for went_to_ot — written but never read back, so it's a value I set
//    without proof."
//
// That is a sharper test than "does it compile" or "does a check pass". A public
// value with no consumer has never been observed by anything: no assertion has
// looked at it, no screen has shown it, and the compiler only confirms it is
// well-typed. It is a claim wearing the costume of an implementation.
//
// Two were found in this repo the first time this ran, and one was exactly the
// went_to_ot shape — `arcOutOfDomain`, written to report drift, wired to nothing.
//
// Scope, stated: this looks at non-`private` `let` bindings in src/*.fs and asks
// whether ANYTHING reads them — including their own file. The first version
// asked whether anything OUTSIDE the file did, and flagged eight decoders that
// are used one line below where they are defined. Being used inside its own
// module is being read back; that is not the failure. The failure is a value
// nothing reads anywhere, which is what `went_to_ot` was.
//
// It cannot see dynamic use, and F# has none here. It deliberately does not flag
// `private` values — the compiler's own analysis covers those.
//
// Usage:  node scripts/unused-check.mjs

import { readFileSync, readdirSync } from 'node:fs'
import { createChecks } from './checks.mjs'

const SRC = 'src'
const files = readdirSync(SRC).filter(f => f.endsWith('.fs'))
const sources = new Map(files.map(f => [`${SRC}/${f}`, readFileSync(`${SRC}/${f}`, 'utf8')]))
// THIS FILE IS EXCLUDED FROM ITS OWN SCAN.
//
// It reported `arcOutOfDomain` and `notYetStarted` on the first run. They
// vanished on the second — because the comment above naming them counts as a
// read. A detector that documents its findings inside a file it scans erases
// them by explaining them.
//
// Third time this pattern has appeared today: workflow-check read the comment
// saying why a step was absent; row-confidence read drift-check's usage example.
// The other two were fixed by stripping comments, which is not enough here — a
// mention anywhere in this file, comment or not, would still count.
// mutation-check.mjs is excluded for a different reason, found when its own
// `value-never-read` mutation survived: it is a file of code FRAGMENTS, and the
// dead value a mutation injects is spelled out in that mutation's `replace`
// string. The mutation's own definition therefore counted as a read of the thing
// it was injecting, making it undetectable.
//
// Fourth appearance of this shape today. The other three were comments; this one
// is a string literal that is deliberately source code. Excluding both files is
// the honest rule: neither contains code that RUNS the values it names.
//
// generate-scouting.mjs is the third, and the sharpest: it is a GENERATOR, so
// its template contains the definition of every value it emits. That made it
// count as a reader of all of them, and this check went green over five real
// orphans in `Scouting.fs` — `abbrOf`, `tierOf`, `nameOf`, `umpWatch` and
// `umpireRatings`, none of which had a single consumer anywhere.
//
// So a generator credits its own output, which is the same rule as the other
// two stated once more: a file counts as a reader only if it contains code that
// RUNS the value. A template does not run anything.
const SELF = [
  'scripts/unused-check.mjs',
  'scripts/mutation-check.mjs',
  'scripts/generate-scouting.mjs',
]
const scripts = readdirSync('scripts').filter(f => f.endsWith('.mjs'))
  .filter(f => !SELF.includes(`scripts/${f}`))
  .map(f => readFileSync(`scripts/${f}`, 'utf8')).join('\n')

// Entry points and interop surfaces are consumed by something this cannot see.
const EXEMPT = new Set(['start', 'main'])

const orphans = []
for (const [path, src] of sources) {
  const code = src.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')
  // `rec` is skipped, not captured: `let rec render` names `render`. The first
  // run reported a value called "rec".
  for (const m of code.matchAll(/^let (?:rec )?(?!private\b)(?!mutable\b)([a-z][A-Za-z0-9']*)/gm)) {
    const name = m[1]
    if (EXEMPT.has(name)) continue
    // A word-boundary match, so `notYetStarted` is not credited by
    // `notYetStartedAt` — the prefix relationship that hid one of these.
    const word = new RegExp(`\\b${name}\\b`, 'g')
    let seen = 0
    for (const [, text] of sources) seen += (text.match(word) ?? []).length
    seen += (scripts.match(word) ?? []).length
    // One match is the definition itself. Anything above that is a real read.
    if (seen <= 1) orphans.push(`${path}: ${name}`)
  }
}

const { check, summarize } = createChecks()

console.log(`\nScanned ${sources.size} F# files for public values with no consumer\n`)
check('every public value is read back somewhere',
  orphans.length === 0,
  orphans.join('\n      → '))

process.exit(summarize() === 0 ? 0 : 1)
