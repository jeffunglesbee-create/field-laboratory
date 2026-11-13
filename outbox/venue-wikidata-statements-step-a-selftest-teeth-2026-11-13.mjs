// Does the analysis script's --self-test have teeth? (Rule 90: an assertion is not trusted until it has failed on purpose.)
// outbox/venue-wikidata-statements-step-a-2026-11-13.mjs doctors its inputs and requires the check or number aimed at each doctoring to move. This file asks the
// next question: if one of those checks, or one of the rules behind a number, were weakened, would the self-test notice? It breaks ONE thing at a time in a copy of
// the script (each anchor must occur exactly once, or the entry is a failure: a mutation that did not apply is not a result), runs the copy's `--self-test`, and
// requires exit 1 AND the line that names what the break must lose: the doctored copy reported as not caught, or a coverage line reported as not printed. The unbroken
// copy is the control and must exit 0. A copy that crashed before printing its CONTROL line is not credited with a refusal.
//
// Usage, from the repository root:   node outbox/venue-wikidata-statements-step-a-selftest-teeth-2026-11-13.mjs
// The copies are written to a temporary directory outside the repository, with `scripts` linked so the copy's imports resolve, and are removed.

import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, symlinkSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { finish, isMain } from '../scripts/checks.mjs'
import { DOCTORS, OUTPUT } from './venue-wikidata-statements-step-a-2026-11-13.mjs'

const SRC = 'outbox/venue-wikidata-statements-step-a-2026-11-13.mjs'

const notCaught = name => ({ line: `FAIL  ${name}: aimed at`, name, kind: 'doctor' })
const notPrinted = name => ({ line: `FAIL  OUTPUT: on "${name}"`, name, kind: 'output' })

/** [id, the text to break (once in the script), what replaces it, what the self-test must then report]. */
export const MUTATIONS = [
  // a check weakened to always pass
  ['E1', "shaped, 'a member is missing", "true, 'a member is missing", notCaught('the probe file has no labels member')],
  ['R1', 'qids.length === ITEMS && ids.length === ITEMS && !lacking.length && !extra.length,', 'true,', notCaught('an item the cache asks about has no record')],
  ['R1b', 'qids.length === ITEMS && ids.length === ITEMS && !lacking.length && !extra.length,', 'qids.length === ITEMS && !lacking.length,', notCaught('an item the cache does not hold is in the read')],
  ['R2', 'notRead.length === 0, notRead.slice', 'true, notRead.slice', notCaught('an item did not read')],
  ['R3', 'unanswered.length === 0, ordered(unanswered)', 'true, ordered(unanswered)', notCaught('a value id has no label record')],
  ['R4', 'wrongId.length === 0, wrongId.slice', 'true, wrongId.slice', notCaught('an item answers as another id')],
  ['R5', 'P.complete === true && P.fatal === null && labelFailures.length === 0 && dtConflicts.length === 0,', 'true,', notCaught('the probe says it did not complete')],
  ['R6', 'malformed.length === 0, malformed.slice', 'true, malformed.slice', notCaught('a statement has a rank the analysis does not know')],
  ['R7', 'unknownDt.length === 0, unknownDt.slice', 'true, unknownDt.slice', notCaught('a property is in use with a datatype the analysis cannot read')],
  ['T1', "Boolean(rm && sm) && Number(rm[1]) === read.length && Number(rm[2]) === ITEMS && Number(sm[1]) === stmts.length && Number(sm[2]) === read.length,", 'true,', notCaught('the probe report and the read disagree on the items read')],
  ['K1', 'ctl?.ok === true && found.length >= 1,', 'true,', notCaught('the control item carries no statement with the control value')],
  ['K2', "classify(ctlLabel ?? '') === 'retractable', ", 'true, ', notCaught('the control value reads as no roof')],
  ['K3', "P.control.qid === CONTROL.qid && P.control.value === CONTROL.value && /mauroy/i.test(ctl?.label ?? ''),", 'true,', notCaught('the probe recorded another control')],
  ['C3a', 'uninformed.length === 0, uninformed.map', 'true, uninformed.map', notCaught('a candidate property has no description')],
  ['C3b', 'unread.length === 0, unread.map', 'true, unread.map', notCaught('a property no one has read carries a roof word')],
  ['C3c', 'stale.length === 0, stale.join', 'true, stale.join', notCaught('a reading is for a candidate the data no longer has')],
  ['M1', "classify('retractable roof') === 'retractable' && classify('domed stadium') === 'dome' && classify('tourist attraction') === 'open',", 'true,', notCaught('the classifier reads every text as open')],
  ['N1', 'Boolean(cm) && nine.length === Number(cm[1]), ', 'true, ', notCaught('a review row loses its roof reason')],
  ['N2', 'nine.length > 0 && nineRead.length === nine.length && new Set(nine.map(r => r.qid)).size === nine.length,', 'true,', notCaught('one of the 9 names is an item that was not read')],
  ['S1', '(passing.length > 0) === (passingAll.length > 0) && (passingAll.length > 0) === (passingAnyRank.length > 0),', 'true,', notCaught('a closed-roof word is in a file name on one of the 9 names')],
  ['S1-reading', '(passing.length > 0) === (passingAll.length > 0) && ', '', notCaught('a closed-roof word is in a file name on one of the 9 names')],
  ['S1-rank', ' && (passingAll.length > 0) === (passingAnyRank.length > 0),', ',', notCaught('a deprecated statement says retractable roof on one of the 9 names')],
  ['T2', 'p5624Items.length === cacheRoof.length && p5624Items.every(q => cacheRoof.includes(q)),', 'true,', notCaught('P5624 is on an item the cache found no roof for')],
  ['G7', 'same.length === PROTECTED.length, PROTECTED.filter', 'true, PROTECTED.filter', notCaught('a protected file differs from the digest recorded')],
  ['G6', 'imports.length > 0 && !badImports.length && !dynamic,', 'true,', notCaught('the script imports a way to write')],
  // a rule behind a number broken
  ['rank-deprecated', "s.p === p && s.r !== 'deprecated')", 's.p === p && true)', notCaught('the control statement is ranked deprecated')],
  ['rank-preferred', 'return preferred.length ? preferred : live', 'return live', notCaught('a preferred statement under the same property hides the roof')],
  ['wider-counts', 'e.cls === \'open\' && WIDER.test(e.text)', "e.cls === 'open' && false", notCaught('a value matches only the wider word list')],
  ['nine-decided', 'const decidesNine = nine.filter(r => witnessItems.get(r.qid)?.size === 1)', 'const decidesNine = nine.filter(r => false)', notCaught('a retractable roof is stated on one of the 9 names')],
  ['row-agreement', 'agree: cl.size === 1 && cl.has(r.roof) })', 'agree: true })', notCaught('a row the lead decides names another roof than the candidate')],
  ['row-decided', "const decided = r => r.roofBasis === 'wikipedia lead' || /^infobox roof/.test(r.roofBasis ?? '')", 'const decided = r => true', notCaught('no row the candidate meets is decided by the lead or the infobox')],
  ['zero-of-zero', 'witnessItems.size >= 1 && met.length >= 1 && disagree.length === 0 && decidesNine.length >= 1', 'witnessItems.size >= 1 && disagree.length === 0 && decidesNine.length >= 1', notCaught('one of the 9 names carries the roof and the candidate meets no decided row (0 of 0)')],
  ['anyrank-ignored', 'const scannedAny = scan(P, classify, false)', 'const scannedAny = scan(P, classify)', notCaught('a deprecated statement says retractable roof on one of the 9 names')],
  ['reading-ignored', 'const passing = retained.filter(c => c.passes)', 'const passing = described.filter(c => c.passes)', notCaught('a closed-roof word is in a file name on one of the 9 names')],
  ['descriptions', 'num.descNine = nine.filter(r => closed(classify(descOf(r.qid)))).length', 'num.descNine = 0', notCaught('the description of one of the 9 names says retractable roof')],
  // a coverage line that stops naming its denominator
  ['out-items', 'items read ${n.read} of ${ITEMS}', 'items read ${n.read} of ${n.read}', notPrinted('an item did not read')],
  ['out-labels', 'labels answered ${n.labelsNeeded - n.labelsUnanswered} of ${n.labelsNeeded}', 'labels answered ${n.labelsNeeded - n.labelsUnanswered} of ${n.labelsNeeded - n.labelsUnanswered}', notPrinted('a value id has no label record')],
  ['out-candidates', 'candidates accounted for ${n.accounted} of ${n.candidates}', 'candidates accounted for ${n.accounted} of ${n.accounted}', notPrinted('a property no one has read carries a roof word')],
  ['out-protected', 'protected files unchanged ${n.protectedSame} of ${PROTECTED.length}', 'protected files unchanged ${n.protectedSame} of ${n.protectedSame}', notPrinted('a protected file differs from the digest recorded')],
]

const once = (text, anchor) => text.split(anchor).length - 1

function runCopy(text) {
  const dir = mkdtempSync(join(tmpdir(), 'statements-teeth-'))
  try {
    mkdirSync(join(dir, 'outbox'))
    symlinkSync(resolve('scripts'), join(dir, 'scripts'))
    const f = join(dir, 'outbox', 'copy.mjs')
    writeFileSync(f, text)
    return spawnSync(process.execPath, [f, '--self-test'], { cwd: process.cwd(), encoding: 'utf8' })
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

if (isMain(import.meta.url)) {
  const src = readFileSync(SRC, 'utf8')
  let bad = 0, refused = 0
  const names = new Set(DOCTORS.map(d => d.name)), outputs = new Set(OUTPUT.map(o => o.doctor))
  for (const [id, , , want] of MUTATIONS) {
    if (!(want.kind === 'doctor' ? names : outputs).has(want.name)) { bad++; console.log(`FAIL  [${id}] names "${want.name}", which the script's ${want.kind === 'doctor' ? 'DOCTORS' : 'OUTPUT'} does not hold`) }
  }
  const control = runCopy(src)
  const controlOk = control.status === 0 && (control.stdout ?? '').includes('PASS  CONTROL:')
  console.log(`${controlOk ? 'PASS' : 'FAIL'}  CONTROL: the unbroken copy's self-test exits ${control.status} (it must exit 0)`)
  if (!controlOk) bad++
  for (const [id, anchor, repl, want] of MUTATIONS) {
    const n = once(src, anchor)
    if (n !== 1) { bad++; console.log(`FAIL  [${id}] not applied: the anchor occurs ${n} times, not once: ${anchor.slice(0, 70)}`); continue }
    const r = runCopy(src.replace(anchor, () => repl))
    const out = r.stdout ?? ''
    const ran = out.includes('CONTROL:')
    const named = out.includes(want.line)
    const ok = r.status === 1 && ran && named
    if (ok) refused++; else bad++
    console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] broken; the self-test exits ${r.status}${ran ? '' : ' without a CONTROL line (it did not run)'} and ${named ? 'reports' : 'does NOT report'} ${want.kind === 'doctor' ? `"${want.name}" as not caught` : `the coverage line on "${want.name}" as not printed`}`)
  }
  console.log(`\n${refused} of ${MUTATIONS.length} broken copies refused by their own self-test, each naming what the break must lose; control ${controlOk ? 'green' : 'red'}`)
  finish(bad)
}
