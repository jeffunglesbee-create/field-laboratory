// BREAK-IT-ON-PURPOSE PROOF FOR THE METHOD-STATEMENT NEEDLE in outbox/forecast-deployed-wiring-2026-11-09.mjs (Rule 90).
//
// WHY. The first run of the wiring script against the deployed page failed `everyServedStringPresent` on a needle that was not in the build
// (the sentence is built as METHOD_TAG + ": ppg ..." and so never sits in the file contiguously). The corrected needle has to be shown to do
// the one thing it exists for: go absent when the compiled model carries different constants. Each mutation below edits a COPY of the text of
// build/Forecast.js (the file the page serves, byte-identical to the local build per the wiring manifest) and the needles, read from the
// wiring script itself and not retyped here, must report at least one absent. The unmutated text is the control and must report none.
//
// THE HARNESS CHECKS ITSELF. A mutation whose anchor is not found exactly once is reported as BROKEN and fails the run, because a mutation that
// changed nothing would print "not caught" for the wrong reason, or worse, be mistaken for a caught one.
//
// USAGE. npm run build && node outbox/forecast-deployed-wiring-needle-mutation-2026-11-09.mjs   (exit 0 only if the control holds and all are caught)

import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const here = p => new URL(p, import.meta.url)
const wiring = readFileSync(here('./forecast-deployed-wiring-2026-11-09.mjs'), 'utf8')
const js = readFileSync(here('../build/Forecast.js'), 'utf8')

// The needle list comes from the wiring script: exactly one line may declare the entry for build/Forecast.js.
const entry = [...wiring.matchAll(/^\s*\['build\/Forecast\.js', (\[.*\])\],\s*$/gm)]
if (entry.length !== 1) { console.log(`BROKEN  the wiring script has ${entry.length} entries for build/Forecast.js, want exactly 1`); process.exit(2) }
const needles = new Function(`return ${entry[0][1]}`)()
const missing = text => needles.filter(n => !text.includes(n))
const count = (text, s) => text.split(s).length - 1

console.log(`build/Forecast.js  ${js.length} characters, sha256 ${createHash('sha256').update(js).digest('hex')}`)
console.log(`needles read from the wiring script (${needles.length}):`)
for (const n of needles) console.log(`  ${JSON.stringify(n)}`)
console.log('')

let broken = 0
const control = missing(js)
console.log(`${control.length === 0 ? 'PASS' : 'FAIL'}  control: the unmutated build carries every needle (${control.length} absent)`)
if (control.length) broken++

// The needle this one replaces. It is NOT in the unmutated build, which is the defect the first run found.
const old = 'table-v2: ppg + 0.25*gdpg + 0.10*gfpg, home +0.42, scale 1.14, draw 0.27 for every match'
const oldHeld = js.includes(old)
console.log(`${oldHeld ? 'FAIL' : 'PASS'}  the contiguous sentence the first run looked for is absent from the build it was right about (${oldHeld ? 'present' : 'absent'})`)
if (oldHeld) broken++

const MUTATIONS = [
  ['home edge 0.42 to 0.43',                  'home +0.42',         'home +0.43'],
  ['logistic scale 1.14 to 1.15',             'scale 1.14',         'scale 1.15'],
  ['draw share 0.27 to 0.28',                 'draw 0.27',          'draw 0.28'],
  ['"for every match" to "for each match"',   'for every match',    'for each match'],
  ['version tag table-v2 to table-v1',        '"table-v2"',         '"table-v1"'],
  ['the whole constants clause back to table-v1\'s shape', ', home +0.42, scale 1.14, draw 0.27 for every match', ', home +0.30'],
  ['rating weight 0.25 to 0.20',              '0.25*gdpg',          '0.20*gdpg'],
  ['rating weight 0.10 to 0.15',              '0.10*gfpg',          '0.15*gfpg'],
]

let caught = 0
for (const [name, anchor, replacement] of MUTATIONS) {
  const n = count(js, anchor)
  if (n !== 1) { console.log(`BROKEN  ${name}: the anchor ${JSON.stringify(anchor)} occurs ${n} times, want exactly 1. Nothing was mutated.`); broken++; continue }
  const mutated = js.replace(anchor, replacement)
  if (mutated === js) { console.log(`BROKEN  ${name}: the replacement left the text unchanged`); broken++; continue }
  const gone = missing(mutated)
  if (gone.length) { caught++; console.log(`CAUGHT  ${name}  (absent: ${gone.map(g => JSON.stringify(g)).join(', ')})`) }
  else { broken++; console.log(`NOT CAUGHT  ${name}  (every needle still present)`) }
}

console.log('')
console.log(`${caught} of ${MUTATIONS.length} mutations caught; control ${control.length === 0 ? 'holds' : 'FAILS'}; ${broken} problem(s)`)
process.exitCode = broken === 0 && caught === MUTATIONS.length ? 0 : 1
