// Does the Step A script's --self-test have teeth? (Rule 90: an assertion is not trusted until it has failed on purpose.)
// outbox/venue-wikidata-roof-step-a-2026-11-12.mjs doctors its inputs and requires the check aimed at each doctoring to go red. This file asks the
// next question: if one of those checks were weakened, would the self-test notice? It breaks ONE check at a time in a copy of the script (each anchor
// must occur exactly once, or the run stops: a mutation that did not apply is not a result), runs the copy's `--self-test`, and requires exit 1 with
// the doctored input aimed at that check reported as not caught. The unbroken copy is the control and must exit 0.
//
// Usage, from the repository root:   node outbox/venue-wikidata-roof-step-a-selftest-teeth-2026-11-12.mjs
// The copies are written to a temporary directory outside the repository, with `scripts` linked so the copy's imports resolve, and are removed.

import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, symlinkSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { finish, isMain } from '../scripts/checks.mjs'

const SRC = 'outbox/venue-wikidata-roof-step-a-2026-11-12.mjs'

/** [check id, the text to break (once in the script), what replaces it, the doctored input whose catch depends on that check]. */
export const MUTATIONS = [
  ['E1', '!missing.length && !extra.length, ', '!missing.length, ', 'a page that was not asked for is held'],
  ['E3', 'un.length >= 1 && un.every(', 'true || un.every(', 'an attempt on the query service has no error code'],
  ['C1b', 'tr && !tr.continue && tr.query.searchinfo.totalhits === idsC.length,', 'true,', 'the full-text search has a hit it does not show'],
  ['C1c', 'sameSet(idsA, idsB), ', 'true, ', 'the strict variant lists an id the first search does not'],
  ['C1d', '!unread.length, unread.map(c => c.id).join(\', \'))', 'true, \'\')', 'a candidate has no datatype'],
  ['K1', 'cap.length >= 1 && cap.every(', 'true || cap.every(', 'the property search control answers with nothing'],
  ['K3', 'dome && domeHits.length >= 1 && !dome.continue', 'true || dome && domeHits.length >= 1 && !dome.continue', 'the full-text control answers with nothing'],
  ['K4', 'explainedIds.length === toExplain.length, ', 'true, ', 'the set-aside hit has no roof word in its own statements'],
  ['C2a', 'made === required, ', 'true, ', 'a candidate\'s description is about a roof (so it is retained and nothing was read for it)'],
  ['C2b', 'keys.length === ITEMS && answered === keys.length', 'answered === keys.length', 'an item no row carries has no wd-roof answer'],
  ['C2c', 'withRoof === 0, ', 'true, ', 'an item\'s wd-roof answer carries a roof'],
  ['C2e', 'rowQids.size > 0 && covered === rowQids.size', 'true', 'an item a row carries has no wd-roof answer'],
  ['V1', 'cls.every(k => k.qid && k.urlIds.every(u => u === k.qid)), ', 'true, ', 'a class item\'s label is not the term'],
  ['V2', 'cls.every(k => k.meaning === k.want), ', 'true, ', 'the sourcing rule\'s classifier reads every class as open'],
  ['V3', 'cls.every(k => k.lists.every(l => l.ok)), ', 'true, ', 'a backlinks list has a continuation'],
  ['V3b', 'cls.every(k => sameSet(k.lists[0].titles, k.lists[1].titles)), ', 'true, ', 'the two backlinks lists of a class differ'],
  ['V4', 'cls.every(k => Number.isInteger(k.p31) && k.p31 <= k.lists[0].titles.length), ', 'true, ', 'the statement search finds more items than reference the class'],
  ['V5', 'disagree.length === 0, disagree.map', 'true, disagree.map', 'a row the lead decides contradicts the class'],
  ['V6', 'Boolean(m) && nine.length === Number(m[1]), ', 'true, ', 'a review row loses its roof reason'],
  ['G6', 'imports.length > 0 && !badImports.length && !dynamic,', 'true,', 'the script imports a way to write'],
]

const once = (text, anchor) => text.split(anchor).length - 1

function runCopy(text) {
  const dir = mkdtempSync(join(tmpdir(), 'roof-teeth-'))
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
  let bad = 0
  const control = runCopy(src)
  const controlOk = control.status === 0
  console.log(`${controlOk ? 'PASS' : 'FAIL'}  CONTROL: the unbroken copy's self-test exits ${control.status} (it must exit 0)`)
  if (!controlOk) bad++
  let refused = 0
  for (const [id, anchor, repl, doctor] of MUTATIONS) {
    const n = once(src, anchor)
    if (n !== 1) { bad++; console.log(`FAIL  [${id}] not applied: the anchor occurs ${n} times, not once: ${anchor.slice(0, 60)}`); continue }
    const r = runCopy(src.replace(anchor, () => repl))
    const named = (r.stdout ?? '').includes(`FAIL  ${doctor}: aimed at`)
    const ok = r.status === 1 && named
    if (ok) refused++; else bad++
    console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] check broken; the self-test exits ${r.status} and ${named ? 'names' : 'does NOT name'} "${doctor}" as not caught`)
  }
  console.log(`\n${refused} of ${MUTATIONS.length} broken copies refused by their own self-test, each naming the doctored input aimed at the broken check; control ${controlOk ? 'green' : 'red'}`)
  finish(bad)
}
