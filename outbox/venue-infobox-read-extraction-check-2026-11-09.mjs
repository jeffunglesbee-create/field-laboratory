// The proof that moving the parse-tree reader out of scripts/venue-infobox.mjs into scripts/venue-infobox-read.mjs changed no
// line of it (Rule 89: the artifact is this script's printed result). docs/CC-CMD-2026-11-09-venue-review-remainder.md, Task 2,
// option 3, Step B, commit 1. Run from the repository root:
//   node outbox/venue-infobox-read-extraction-check-2026-11-09.mjs             the old probe against the new probe and the new reader
//   node outbox/venue-infobox-read-extraction-check-2026-11-09.mjs --self-test  the same comparison on doctored copies, each of which must fail
//
// The comparison is on lines as a multiset, blank lines aside. Three things must hold, and any other difference fails the run:
//   A. every line of the reader from its `import` on was lost by the probe (so the reader holds nothing the probe still holds, and
//      nothing invented), the one `export` added to the API constant aside;
//   B. the lines the probe lost that the reader does not hold are exactly the declared edits;
//   C. the lines the probe gained are exactly the declared additions.

import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { isMain } from '../scripts/checks.mjs'

const OLD = 'af7db7f'   // the parent of the extraction commit: the probe as it was
const DECLARED_LOST = [
  '// one request per article. This file reads the XML with a real XML parser and keeps the',
  '// parameters whose NAME contains "roof". It does not read prose and does not parse wikitext.',
]
const DECLARED_GAINED = [
  "import { API, parseUrl, readTree } from './venue-infobox-read.mjs'",
  '// one request per article. The XML is read with a real XML parser and the parameters whose NAME',
  '// contains "roof" are kept (scripts/venue-infobox-read.mjs, which the roof rule shares). Nothing',
  '// here reads prose or parses wikitext.',
]
// The one line the reader changed on the way: it exports what the probe kept private.
const EXPORTED = [["export const API = 'https://en.wikipedia.org/w/api.php'", "const API = 'https://en.wikipedia.org/w/api.php'"]]

const bag = lines => lines.filter(l => l.trim() !== '').reduce((m, l) => m.set(l, (m.get(l) ?? 0) + 1), new Map())
/** The lines of `a` that `b` does not account for, as a list with repeats. */
const minus = (a, b) => { const out = []; for (const [l, n] of a) for (let i = 0; i < n - (b.get(l) ?? 0); i++) out.push(l); return out }
const sameSet = (a, b) => a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n')

/** The old probe, the new probe and the new reader, as texts: what A, B and C each leave over. */
export const compare = (oldProbe, newProbe, reader) => {
  const o = bag(oldProbe.split('\n')), n = bag(newProbe.split('\n'))
  const rl = reader.split('\n')
  const importAt = rl.findIndex(l => l.startsWith('import '))
  const moved = importAt < 0 ? [] : rl.slice(importAt).map(l => EXPORTED.find(([now]) => l === now)?.[1] ?? l)
  const lost = minus(o, n), gained = minus(n, o)
  const readerExtra = minus(bag(moved), bag(lost))        // A: in the reader and not lost by the probe: a copy, or an invention
  const lostElsewhere = minus(bag(lost), bag(moved))      // B: lost by the probe and not in the reader
  return { lost: lost.length, held: lost.length - lostElsewhere.length, readerExtra, lostElsewhere, gained, a: readerExtra.length === 0, b: sameSet(lostElsewhere, DECLARED_LOST), c: sameSet(gained, DECLARED_GAINED) }
}

const ok = c => c.a && c.b && c.c

const selfTest = () => {
  const IMPORT = "import { DOMParser, XMLSerializer } from '@xmldom/xmldom'"
  const API = "const API = 'https://en.wikipedia.org/w/api.php'"
  const oldP = [IMPORT, ...DECLARED_LOST, API, 'const moved = 1', 'const stays = 2'].join('\n')
  const newP = [...DECLARED_GAINED, 'const stays = 2'].join('\n')
  const reader = ['// the reader, new text', IMPORT, 'export ' + API, 'const moved = 1'].join('\n')
  const results = []
  const check = (name, pass, detail = '') => { results.push(pass); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${pass ? '' : `\n      -> ${detail}`}`) }
  const good = compare(oldP, newP, reader)
  check('a faithful move passes A, B and C', ok(good), JSON.stringify(good))
  check('a moved line the reader changed fails', !ok(compare(oldP, newP, reader.replace('moved = 1', 'moved = 2'))))
  check('a line deleted from the probe and kept nowhere fails', !ok(compare(oldP + '\nconst gone = 3', newP, reader)))
  check('a line added to the probe beyond the declared ones fails', !ok(compare(oldP, newP + '\nconst extra = 4', reader)))
  check('a moved line the probe still holds (a copy, not a move) fails', !ok(compare(oldP, newP + '\nconst moved = 1', reader)))
  check('a declared edit that did not happen fails', !ok(compare(oldP, newP.replace(DECLARED_GAINED[0] + '\n', ''), reader)))
  check('a line invented in the reader fails', !ok(compare(oldP, newP, reader + '\nconst invented = 5')))
  check('the API line may differ from the old one only by its export', !ok(compare(oldP, newP, reader.replace('export const API', 'export const API2'))))
  check('a reader with no import is not a pass', !ok(compare(oldP, newP, 'const moved = 1')))
  const bad = results.filter(r => !r).length
  console.log(`\n${results.length - bad}/${results.length} checks passed`)
  process.exitCode = bad ? 1 : 0
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--self-test')) selfTest()
  else {
    const oldProbe = execFileSync('git', ['show', `${OLD}:scripts/venue-infobox.mjs`], { encoding: 'utf8' })
    const newProbe = readFileSync('scripts/venue-infobox.mjs', 'utf8'), reader = readFileSync('scripts/venue-infobox-read.mjs', 'utf8')
    const c = compare(oldProbe, newProbe, reader)
    console.log(`old probe ${OLD}:scripts/venue-infobox.mjs, ${oldProbe.split('\n').length} lines; new probe ${newProbe.split('\n').length} lines; new reader ${reader.split('\n').length} lines`)
    console.log(`lines the probe lost: ${c.lost}; held by the reader verbatim: ${c.held}; not held (the declared edits): ${c.lostElsewhere.length} of ${DECLARED_LOST.length} declared`)
    console.log(`A. reader lines the probe did not lose: ${c.readerExtra.length}${c.readerExtra.map(l => `\n  ${l}`).join('')}`)
    console.log(`B. lost and not in the reader, other than the declared: ${minus(bag(c.lostElsewhere), bag(DECLARED_LOST)).length}${minus(bag(c.lostElsewhere), bag(DECLARED_LOST)).map(l => `\n  ${l}`).join('')}`)
    console.log(`C. lines the probe gained: ${c.gained.length} of ${DECLARED_GAINED.length} declared; others: ${minus(bag(c.gained), bag(DECLARED_GAINED)).length}${minus(bag(c.gained), bag(DECLARED_GAINED)).map(l => `\n  ${l}`).join('')}`)
    console.log(ok(c) ? 'IDENTICAL: the reader is the old text, moved' : 'DIFFERENT: see above')
    process.exitCode = ok(c) ? 0 : 1
  }
}
