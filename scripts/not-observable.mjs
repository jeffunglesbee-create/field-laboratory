// The ledger of assertions this repository cannot currently exercise.
//
// `computed-chrome-check.mjs` reads this to decide whether a gap it found is
// declared. That check needs Chromium and a built site, so it runs only on
// source pushes. The ledger itself lives under `docs/`, which `verify.yml`
// ignores — so a docs-only edit to the ledger would reach main unread.
//
// The parser therefore lives HERE rather than inside the browser check, and
// this file is cheap enough to run on a docs-only push. One parser, two
// callers: a second copy that drifted from the first is the defect class this
// session has spent the day naming — a value whose name and its measurement
// disagree.
//
// Usage:  node scripts/not-observable.mjs [--self-test]

import { readFileSync } from 'node:fs'
import { createChecks, isMain, finish } from './checks.mjs'

export const LEDGER = 'docs/not-observable.txt'

/// `<id>  <two or more spaces>  <the corpus that would close it>`.
/// Comments and blank lines ignored. An id may contain single spaces
/// (`contrast:sport filter`), which is why the separator is two spaces and not
/// one — the ids come from human-readable labels the check already prints.
export function parseLedger(text) {
  const out = new Map()
  const dupes = []
  for (const line of text.split('\n')) {
    const t = line.replace(/^\s*#.*$/, '').trim()
    if (!t) continue
    const m = t.match(/^(\S+(?:\s\S+)*?)\s{2,}(.+)$/)
    if (!m) { dupes.push({ malformed: t }); continue }
    const id = m[1].trim()
    if (out.has(id)) dupes.push({ id })
    out.set(id, m[2].trim())
  }
  return { entries: out, problems: dupes }
}

/// A `needs` that says nothing is the same shrug in a longer form. The bar is
/// deliberately crude — length, and a noun that names a corpus — because the
/// alternative is no bar at all, which is the state this file replaced.
const VAGUE = /^(a fixture|a capture|more data|tbd|unknown|n\/a)\.?$/i
export function weakNeeds(entries) {
  return [...entries].filter(([, needs]) => needs.length < 30 || VAGUE.test(needs))
}

if (isMain(import.meta.url)) {
  const { check, summarize } = createChecks()
  const SELF_TEST = process.argv.includes('--self-test')

  if (SELF_TEST) {
    const p = t => parseLedger(t)
    check('a well-formed line parses to an id and a need',
      p('a:b    needs two or more sports rendered on one slate').entries.get('a:b')
        === 'needs two or more sports rendered on one slate')
    check('an id may contain single spaces',
      p('contrast:sport filter    a slate spanning two sports so both chips render')
        .entries.has('contrast:sport filter'))
    // Single spaces must NOT separate, or `contrast:sport filter` would parse
    // as the id `contrast:sport` with the rest as its need. The line is
    // malformed and is reported as such rather than half-understood.
    check('one space is not a separator — it would split an id',
      p('contrast:sport filter needs two sports').entries.has('contrast:sport') === false
        && p('contrast:sport filter needs two sports').problems.some(d => d.malformed),
      'a single-space line was parsed instead of reported')
    check('comments and blanks are ignored',
      p('# note\n\n  a:b   xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\n').entries.size === 1)
    check('a duplicate id is reported, not silently overwritten',
      p('a:b   xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\na:b   yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy')
        .problems.some(d => d.id === 'a:b'))
    check('a line with no separator is reported as malformed',
      p('a:b-with-no-need').problems.some(d => d.malformed))
    check('"a fixture" is not a corpus',
      weakNeeds(new Map([['a:b', 'a fixture']])).length === 1)
    check('a short need is not a corpus either',
      weakNeeds(new Map([['a:b', 'two sports']])).length === 1)
    check('a real need passes',
      weakNeeds(new Map([['a:b', 'a capture whose slate spans two or more sports']])).length === 0)
    process.exit(summarize() === 0 ? 0 : 1)
  } else {
    const { entries, problems } = parseLedger(readFileSync(LEDGER, 'utf8'))
    check(`${LEDGER} has entries to check`, entries.size > 0,
      'an empty ledger would pass everything below vacuously')
    check('every line parses to an id and a corpus',
      problems.length === 0,
      problems.map(d => d.malformed ? `malformed: ${d.malformed}` : `duplicate id: ${d.id}`).join('; '))
    const weak = weakNeeds(entries)
    check('every gap names a corpus that could actually be built',
      weak.length === 0,
      weak.map(([id, n]) => `${id}: "${n}" — name a fixture, not a wish`).join('; '))
    console.log(`\n  ${entries.size} assertion(s) declared unexercised:`)
    for (const [id, needs] of entries) console.log(`    ${id}\n      needs: ${needs}`)
    // WHAT THIS FILE CANNOT CHECK, said out loud rather than left to be assumed:
    // whether a declared gap has since CLOSED. That needs the rendered page, so
    // it lives in computed-chrome-check.mjs and runs on source pushes only. A
    // stale entry survives until the next source commit.
    console.log(`\n  not checked here: whether a declared gap has closed — that needs`)
    console.log(`  the rendered page (computed-chrome-check.mjs, source pushes only).`)
    finish(summarize())
  }
}
