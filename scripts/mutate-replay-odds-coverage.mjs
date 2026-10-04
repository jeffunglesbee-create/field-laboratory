// Rule 90 for replay-odds-coverage.mjs.
//
// This script is the EVIDENCE for a judgement number — MIN_ROWS = 3 in
// odds-coverage.mjs. A replay that cannot be wrong is not evidence, it is a
// second opinion from the same source, so each mutation below breaks one thing
// its self-test claims to catch.
import { readFileSync, writeFileSync, copyFileSync, unlinkSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const F = 'scripts/replay-odds-coverage.mjs'
const BAK = `${F}.mutbak`
const original = readFileSync(F, 'utf8')
const run = () => {
  try { execFileSync('node', [F, '--self-test'], { stdio: 'pipe' }); return true } catch { return false }
}

// POSITIVE CONTROL FIRST. An unmutated copy written to the mutant's own
// location must pass, or no verdict below is about the code.
copyFileSync(F, BAK)
writeFileSync(F, original)
if (!run()) {
  console.log('FAIL — an UNMUTATED copy at the mutant location is red, so no verdict below would mean anything.')
  copyFileSync(BAK, F); unlinkSync(BAK); process.exit(1)
}

const MUTATIONS = [
  ['P1 the replay only looks at the newest reading',
   '  for (let i = 0; i < series.length; i++)',
   '  for (let i = series.length - 1; i < series.length; i++)',
   'the table is the justification for the floor; replaying one prefix reports a history of at most one alarm and the number would be set from nothing'],

  ['P2 a thin slate is no longer named as suppressed',
   '      if (!now || now.rows === 0 || now.rows >= minRows) continue',
   '      if (true) continue',
   'a guard that drops alarms without printing what it dropped is the amnesty shape this repo watches for — the whole point is that the trade-off stays legible'],

  ['P3 an ABSENT sport is reported as a thin skip',
   '      if (!now || now.rows === 0 || now.rows >= minRows) continue',
   '      if (!now || now.rows >= minRows) continue',
   'out of season is not a suppressed measurement; listing it would bury the real thin slates under every off-season sport'],

  ['P4 a slate AT the floor is reported as suppressed',
   '      if (!now || now.rows === 0 || now.rows >= minRows) continue',
   '      if (!now || now.rows === 0 || now.rows > minRows) continue',
   'an off-by-one here claims the floor hides more than it does, which argues for lowering a threshold that is correct'],

  ['P5 a sport that was never covered counts as hidden by the floor',
   '        return q && q.rows >= minRows && q.withOdds / q.rows >= 0.5',
   '        return !!q',
   'nothing was suppressed if nothing was ever established; counting these inflates the cost of the floor and would argue it away'],

  ['P6 THE INVARIANT NEVER FAILS',
   '  alarms.filter(a => a.lastRows < minRows || a.nowRows < minRows)',
   '  alarms.filter(() => false)',
   'the one assertion that catches the floor silently not being applied — with it gone, this script reports OK over alarms resting on one-row slates'],

  ['P7 the invariant checks only the baseline side',
   '  alarms.filter(a => a.lastRows < minRows || a.nowRows < minRows)',
   '  alarms.filter(a => a.lastRows < minRows)',
   'a fat baseline against a one-row current slate is the exact 27/29 -> 0/1 case the floor exists to drop, and it would pass'],
]

let caught = 0
for (const [name, anchor, repl, why] of MUTATIONS) {
  const hits = original.split(anchor).length - 1
  if (hits !== 1) { console.log(`FAIL       ${name}\n            anchor matched ${hits} times, expected 1 — NOTHING MUTATED.`); continue }
  writeFileSync(F, original.replace(anchor, repl))
  if (readFileSync(F, 'utf8') === original) { console.log(`FAIL       ${name}\n            the written copy is identical — NOTHING MUTATED.`); continue }
  const red = !run()
  console.log(`${red ? 'CAUGHT    ' : 'NOT CAUGHT'} ${name}\n            (${why})`)
  if (red) caught++
}

copyFileSync(BAK, F); unlinkSync(BAK)
if (readFileSync(F, 'utf8') !== original) { console.log('FAIL — restore did not return the original.'); process.exit(1) }
console.log(`\n${caught} of ${MUTATIONS.length} mutations caught.`)
console.log('COVERAGE: replay, thinSkips and floorAgrees. It does NOT cover the git read')
console.log('— that is shown by the live run reproducing the six-alarm table from the')
console.log('committed series, which no fixture can stand in for.')
process.exit(caught === MUTATIONS.length ? 0 : 1)
