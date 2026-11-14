// Does the P1552 tool's --self-test have teeth? (Rule 90: an assertion is not trusted until it has failed on purpose.)
// outbox/venue-wikidata-p1552-2026-11-13.mjs doctors its inputs and requires a check to catch each doctoring. This file asks the next question: if the tool itself were
// broken, one line at a time, would the self-test notice? It breaks ONE thing in a copy of the tool (each anchor must occur exactly once, or the entry is a failure: a
// mutation that did not apply is not a result), runs the copy's `--self-test`, and requires exit 1 AND a FAIL line for every check the break must lose. The unbroken copy
// is the control and must exit 0; the check names come from ITS output, and each name a mutation aims at must match exactly one of them. A copy that crashed before
// printing its summary is not credited with a refusal.
//
// COVERAGE IS PRINTED (Rule 91): the last lines say how many of the tool's checks have a mutation aimed at them, and name any that has none; a check no break can
// reach is not trusted and fails this run.
//
// Usage, from the repository root:   node outbox/venue-wikidata-p1552-teeth-2026-11-13.mjs
// The copies are written to a temporary directory outside the repository, with `scripts` and the tool's one sibling import linked so the copy's imports resolve, and are removed.

import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, symlinkSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { finish, isMain } from '../scripts/checks.mjs'

const SRC = 'outbox/venue-wikidata-p1552-2026-11-13.mjs'
const SIBLING = 'outbox/venue-lead-whole-diff-2026-11-09.mjs'

// names of the checks, as the tool's self-test prints them (a substring that matches exactly one)
const TRUTHY = 'TRUTHY', ANSWER = 'THE ANSWER IS ONE ROW PER VALUE', CLEAN = 'THE CLEAN CASE IS AS PREDICTED', NOWITNESS = 'A VALUE THAT NAMES NO ROOF IS NO WITNESS', DERIVED = 'THE ROWS THE DATA SAYS CARRY A CLOSED LABEL ARE DERIVED',
  COVERAGE = 'the coverage line carries both denominators', CHANGES = 'A P1552 VALUE THAT CHANGES A ROOF IS REPORTED', TWO = 'TWO ROOFS ON ONE ITEM IS REVIEW', NOCHANGE = 'AN EXPECTED BASIS CHANGE THAT DID NOT HAPPEN IS NAMED',
  DEPRECATED = 'A DEPRECATED STATEMENT IS NOT READ', EXACT = 'THE BASIS TEXT IS HELD EXACTLY', NOBODY = 'A BASIS CHANGE NOBODY EXPECTED IS NAMED', DOCTORED = 'A ROOFOF THAT DOES NOT REPRODUCE A COMMITTED ROW IN THE CONTROL IS REPORTED',
  FIELDS = 'THE CONTROL HOLDS EACH FIELD OF A COMMITTED ROW', REQUEST = 'A REQUEST MADE DURING THE REPLAY IS COUNTED AND FAILS THE RUN', MISSING = 'A ROW WHOSE ANSWER IS MISSING FROM THE CACHE IS NOT COMPUTABLE',
  NOLABEL = 'A VALUE WITH NO ENGLISH LABEL IS NOT PREDICTED', UNKNOWN = 'AN UNKNOWN VALUE IS NOT PREDICTED', FAILEDOLD = 'AN ITEM THE OLD ANSWER FAILED FOR, OR THE PROBE DID NOT READ, IS NOT PREDICTED',
  PROBE = 'A PROBE THAT DID NOT COMPLETE, DID NOT READ AN ITEM, OR CANNOT SEE THE CONTROL IS NOT A VALID WITNESS', PROBEITEMS = 'A PROBE WHOSE ITEMS ARE NOT THE CACHE', PROBERUN = 'A PROBE THAT IS NOT A VALID WITNESS FAILS THE RUN',
  NOTHING = 'a replay of nothing is not a pass', REASON = 'the review reason is the source', LEAVES = 'A ROW THAT LEAVES REVIEW CARRIES NO REVIEW REASON', REPORT = 'the report names its denominators',
  FILL = 'THE RUNNER\'S FILL, AS PREDICTED, PASSES', UNANSWERED = 'AN ITEM THE NEW RESULTS ASK ABOUT AND THE NEW CACHE DOES NOT ANSWER IS NAMED', CLOSEDDIFFERS = 'A CLOSED LABEL THAT DIFFERS FROM THE PROBE',
  ARTICLE = 'AN ARTICLE THAT DIFFERS FROM THE OLD ANSWER', NOARTICLE = 'AN ANSWER WITH NO ARTICLE WHERE THE OLD ONE HAD ONE IS NAMED', OLDNOART = 'AN ARTICLE THE OLD ANSWER HAD NOT, AND THE NEW ONE HAS, IS NAMED',
  OLDKIND = 'AN OLD-KIND ENTRY LEFT IN THE NEW CACHE', TABLE = 'A TABLE THAT DIFFERS BETWEEN THE REVS IS NAMED', LIVECHANGES = 'A ROW THAT CHANGES BETWEEN THE OLD AND THE NEW RESULTS IS NAMED',
  ONESIDE = 'A ROW ON ONE SIDE ONLY IS NAMED', MOVED = 'A ROW THAT MOVED BETWEEN THE OLD AND THE NEW RESULTS IS NAMED', WIDER = 'A LABEL THAT NAMES NO ROOF AND DIFFERS FROM THE PROBE', LIVEPROBE = 'AN ITEM THE PROBE DID NOT READ, OR WHOSE VALUE IS NOT AN ITEM',
  READNOTHING = 'a read of nothing is not a pass', LIVEREPORT = 'the live report names its denominators'

/** [id, the text to break (once in the tool), what replaces it, the checks that must then be reported as FAIL]. */
export const MUTATIONS = [
  // the semantics of `wdt:`
  ['T1', "s.p === 'P1552' && s.r !== 'deprecated')", "s.p === 'P1552')", [TRUTHY, DEPRECATED]],
  ['T2', 'return (preferred.length ? preferred : live).map(s => s.v)', 'return live.map(s => s.v)', [TRUTHY]],
  ['T3', ".filter(s => s.p === 'P1552' && s.r !== 'deprecated')", ".filter(s => s.r !== 'deprecated')", [TRUTHY]],
  // the answer the query would give
  ['A1', 'labels.map(l => ({ roofLabel:', 'labels.slice(0, 1).map(l => ({ roofLabel:', [ANSWER]],
  ['A2', "value: l }, ...art }))", "value: l } }))", [ANSWER]],
  ['A3', '...art })) : [art]', '...art })) : []', [ANSWER]],
  // the two caches
  ['C1', 'control[NEW_KIND + qid] = { at: now, result: answerOf(article, []) }', "control[NEW_KIND + qid] = { at: now, result: answerOf(article, ['retractable roof']) }", [CLEAN]],
  ['C2', 'treatment[NEW_KIND + qid] = { at: now, result: answerOf(article, labels) }', 'treatment[NEW_KIND + qid] = { at: now, result: answerOf(article, []) }', [CLEAN]],
  ['C2b', 'result: answerOf(article, labels) }', 'result: answerOf(article, labels.slice(0, 1)) }', [TWO]],
  ['C2c', 'result: answerOf(article, labels) }', "result: answerOf(article, labels.map(() => 'retractable roof')) }", [NOWITNESS]],
  ['C3', 'if (labels.some(l => l === null)) { notes.unlabelled.push(qid); continue }', 'if (false) { notes.unlabelled.push(qid); continue }', [NOLABEL]],
  ['C4', 'if (ids.some(id => !/^Q\\d+$/.test(String(id)))) { notes.notAnItem.push(qid); continue }', 'if (false) { notes.notAnItem.push(qid); continue }', [UNKNOWN]],
  ['C5', 'if (!v.result?.ok) { notes.unanswered.push(qid); continue }', 'if (!v.result?.ok) { continue }', [FAILEDOLD]],
  ['C6', 'if (!item?.ok) { notes.notInProbe.push(qid); continue }', 'if (!item?.ok) { continue }', [FAILEDOLD]],
  ['C7', 'const article = v.result.value.results.bindings[0]?.article?.value ?? null', 'const article = null', [CLEAN]],
  ['C8', '/^(wp-lead|wp-bodyroof|wp-infobox)\\|/.test(k)', '/^(wp-lead|wp-bodyroof)\\|/.test(k)', [CLEAN]],
  ['C9', 'control[k] = treatment[k] = { ...v, at: now }', 'control[k] = treatment[k] = { ...v }', [CLEAN]],
  ['C10', 'notes.answers++', 'notes.answers += 0', [COVERAGE]],
  // what `source` does with a decision
  ['R1', 'if (!d.roof) return `roof: ${d.basis}`', 'if (false) return `roof: ${d.basis}`', [REASON]],
  ['R2', "if (/dome\\b/i.test(row.name) && d.roof === 'open') return", 'if (false) return', [REASON]],
  ['R3', 'if (pastTense(d.lead)) return', 'if (false) return', [REASON]],
  ['R4', "if (!row.zone) return 'no zone at the point'", "if (false) return 'no zone at the point'", [REASON]],
  // the replay
  ['P1', 'calls.push(String(url)); ', '', [REQUEST]],
  ['P2', 'if (r.qid && !cache[NEW_KIND + r.qid]) {', 'if (false) {', [MISSING]],
  // the results the decisions would make
  ['S1', 'const { why, ...rest } = r', 'const rest = r', [LEAVES]],
  ['S2', "out[reason ? 'review' : 'accepted'].push(reason ? { ...next, why: reason } : next)", 'out.accepted.push(reason ? { ...next, why: reason } : next)', [LEAVES]],
  ['S3', 'if (!d) { out[status].push(r); continue }', 'if (!d) { out.accepted.push(r); continue }', [CLEAN]],
  // the probe as a witness
  ['B1', 'if (probe.complete !== true) bad.push(', 'if (false) bad.push(', [PROBE]],
  ['B2', 'if (probe.fatal !== null && probe.fatal !== undefined) bad.push(', 'if (false) bad.push(', [PROBE]],
  ['B3', 'if ((probe.labelFailures ?? []).length) bad.push(', 'if (false) bad.push(', [PROBE]],
  ['B4', 'if (lacking.length || extra.length) bad.push(', 'if (false) bad.push(', [PROBEITEMS]],
  ['B4b', 'if (lacking.length || extra.length) bad.push(', 'if (lacking.length) bad.push(', [PROBEITEMS]],
  ['B4c', 'if (lacking.length || extra.length) bad.push(', 'if (extra.length) bad.push(', [PROBEITEMS]],
  ['B5', 'if (unread.length) bad.push(', 'if (false) bad.push(', [PROBE]],
  ['B6', 'if (!found.length) bad.push(', 'if (false) bad.push(', [PROBE]],
  ['B7', "else if (classifyRoof(probe.labels?.[control.value]?.l ?? '') !== 'retractable') bad.push(", 'else if (false) bad.push(', [PROBE]],
  ['B8', "s.v === control.value && s.r !== 'deprecated')", 's.v === control.value)', [PROBE]],
  ['B9', "s.p === 'P1552' && s.v === control.value", 's.v === control.value', [PROBE]],
  // the diff against the committed rows
  ['D1', 'if (c.onlyOld.length || c.onlyNew.length) bad.push(', 'if (false) bad.push(', [ONESIDE]],
  ['D1b', 'if (c.onlyOld.length || c.onlyNew.length) bad.push(', 'if (c.onlyOld.length) bad.push(', [ONESIDE]],
  ['D1c', 'if (c.onlyOld.length || c.onlyNew.length) bad.push(', 'if (c.onlyNew.length) bad.push(', [ONESIDE]],
  ['D2', 'if (c.moved.length) bad.push(', 'if (false) bad.push(', [MOVED]],
  ['D3', 'if (c.changed.length) bad.push(', 'if (false) bad.push(', [CHANGES, LIVECHANGES]],
  ['D4', 'if (!x) bad.push(`${e.name}: the basis did not change`)', 'if (!x) {}', [NOCHANGE]],
  ['D5', 'else if (x.before.basis !== e.before || x.after.basis !== e.after) bad.push(', 'else if (false) bad.push(', [EXACT]],
  ['D5b', 'x.before.basis !== e.before || x.after.basis !== e.after', 'x.after.basis !== e.after', [EXACT]],
  ['D5c', 'x.before.basis !== e.before || x.after.basis !== e.after', 'x.before.basis !== e.before', [EXACT]],
  ['D6', "if (extra.length) bad.push(`basis text changes that should not: ${extra.join('; ')}`)", "if (false) bad.push(`basis text changes that should not: ${extra.join('; ')}`)", [NOBODY]],
  // predict
  ['N1a', 'if (d.roof === r.roof && d.basis === r.roofBasis', 'if (d.basis === r.roofBasis', [FIELDS]],
  ['N1b', 'd.basis === r.roofBasis && (d.lead ?? null)', '(d.lead ?? null)', [FIELDS]],
  ['N1c', '(d.lead ?? null) === (r.lead ?? null) && status === r.status', 'status === r.status', [FIELDS]],
  ['N1d', '&& status === r.status && (reason ?? null) === (r.why ?? null)) reproduced++', '&& (reason ?? null) === (r.why ?? null)) reproduced++', [FIELDS]],
  ['N1e', '&& (reason ?? null) === (r.why ?? null)) reproduced++', ') reproduced++', [FIELDS]],
  ['N2', "const rows = rowsOf(results), staged = rows.filter(r => 'roofBasis' in r)", 'const rows = rowsOf(results), staged = rows', [CLEAN]],
  ['N3', "uniq(built.notes.values.filter(v => classifyRoof(v.label) !== 'open').map(v => v.qid))", 'uniq(built.notes.values.map(v => v.qid))', [DERIVED]],
  ['N4', 'const diff = compare(results, resultsAfter(results, trt.decided))', 'const diff = compare(results, resultsAfter(results, ctl.decided))', [CLEAN]],
  ['N5', 'const trt = await replay({ rows: staged, cache: built.treatment, roofOfFn })', 'const trt = await replay({ rows: staged, cache: built.control, roofOfFn })', [CLEAN]],
  ['N6', 'const ctl = await replay({ rows: staged, cache: built.control, roofOfFn })', 'const ctl = await replay({ rows: staged, cache: built.treatment, roofOfFn })', [CLEAN]],
  ['N7', 'asked: uniq(staged.map(r => r.qid).filter(Boolean)).length', 'asked: staged.length', [COVERAGE]],
  // the verdict of predict
  ['G1', 'const bad = [...a.probeBad]', 'const bad = []', [PROBERUN]],
  ['G2', "if (!a.staged || a.control.reproduced + a.control.mismatches.length === 0) bad.push('nothing was replayed')", "if (false) bad.push('nothing was replayed')", [NOTHING]],
  ['G3', 'if (nc.length) bad.push(', 'if (false) bad.push(', [MISSING]],
  ['G4', 'if (n) bad.push(`${n} item(s) not predictable', 'if (false) bad.push(`${n} item(s) not predictable', [NOLABEL]],
  ['G4a', 'a.notes.unanswered.length + a.notes.notInProbe.length', 'a.notes.notInProbe.length', [FAILEDOLD]],
  ['G4b', 'a.notes.unanswered.length + a.notes.notInProbe.length', 'a.notes.unanswered.length', [FAILEDOLD]],
  ['G4c', '+ a.notes.notAnItem.length + a.notes.unlabelled.length', '+ a.notes.unlabelled.length', [UNKNOWN]],
  ['G4d', '+ a.notes.notAnItem.length + a.notes.unlabelled.length', '+ a.notes.notAnItem.length', [NOLABEL]],
  ['G5', 'if (req.length) bad.push(', 'if (false) bad.push(', [REQUEST]],
  ['G6', 'if (a.control.mismatches.length) bad.push(', 'if (false) bad.push(', [DOCTORED]],
  ['G7', 'bad.push(...diffProblems(a.treatment.diff, a.expected, a.rows))', 'bad.push()', [CHANGES]],
  ['G8', 'if (!same(a.closedRows, a.expected.map(e => e.name).sort())) bad.push(', 'if (false) bad.push(', [DERIVED]],
  // the reports
  ['RP1', 'roofOf replayed for ${replayed} of ${a.rows} rows', 'roofOf replayed for ${replayed} of ${replayed} rows', [COVERAGE]],
  ['RP2', 'distinct items asked of the ${a.notes.answers} the cache answered', 'distinct items asked of the ${a.asked} the cache answered', [COVERAGE]],
  ['RP3', 'made by ${2 * replayed} roofOf calls', 'made by ${replayed} roofOf calls', [REPORT]],
  ['RP4', '${uniq(a.notes.values.map(v => v.qid)).length} of ${a.notes.answers} items', '${uniq(a.notes.values.map(v => v.qid)).length} of ${a.asked} items', [REPORT]],
  ['RP5', '${a.control.reproduced} of ${replayed} rows reproduce the committed roof', '${a.control.reproduced} of ${a.control.reproduced} rows reproduce the committed roof', [DOCTORED]],
  ['RP6', 'by name: ${c.compared} of ${c.oldRows} rows (new', 'by name: ${c.compared} of ${c.compared} rows (new', [LIVEREPORT]],
  ['RP7', 'of ${c.compared}; same status and roof', 'of ${c.changed.length}; same status and roof', [REPORT, LIVEREPORT]],
  ['RP8', 'reproduces all ${replayed} committed roof-stage rows', 'reproduces all ${a.rows} committed roof-stage rows', [REPORT]],
  ['RP9', '(bad.length ? `NOT AS PREDICTED:', '(!bad.length ? `NOT AS PREDICTED:', [REPORT, FILL]],
  // the live read
  ['L1', 'if (!same(closed(got), closed(want))) out.closedDiffer.push(', 'if (false) out.closedDiffer.push(', [CLOSEDDIFFERS]],
  ['L2', 'if (!same(got, want)) out.labelsDiffer.push(', 'if (false) out.labelsDiffer.push(', [WIDER]],
  ['L3', 'if (!same(arts.length ? arts : [null], [old])) out.articleDiffer.push(', 'if (false) out.articleDiffer.push(', [ARTICLE]],
  ['L3b', 'same(arts.length ? arts : [null], [old])', 'same(arts, [old])', [NOARTICLE]],
  ['L3c', '?.bindings?.[0]?.article?.value ?? null', '?.bindings?.[0]?.article?.value ?? arts[0] ?? null', [OLDNOART]],
  ['L6', 'if (!live?.ok) { out.unanswered.push(q); continue }', 'if (!live?.ok) { continue }', [UNANSWERED]],
  ['L7', 'if (!item?.ok) { out.notInProbe.push(q); continue }', 'if (!item?.ok) { continue }', [LIVEPROBE]],
  ['L7b', 'if (ids.some(id => !/^Q\\d+$/.test(String(id)))) { out.notAnItem.push(q); continue }', 'if (false) { out.notAnItem.push(q); continue }', [LIVEPROBE]],
  ['L8', 'const asked = uniq(staged.map(r => r.qid).filter(Boolean)).sort()', 'const asked = []', [FILL]],
  ['L9', 'out.diff = compare(oldResults, newResults)', 'out.diff = compare(newResults, newResults)', [FILL]],
  // the verdict of the live read
  ['V1', "if (!a.asked) bad.push('no item was asked about')", "if (false) bad.push('no item was asked about')", [READNOTHING]],
  ['V2', 'if (a.unanswered.length) bad.push(', 'if (false) bad.push(', [UNANSWERED]],
  ['V3', 'if (a.notInProbe.length || a.notAnItem.length) bad.push(', 'if (false) bad.push(', [LIVEPROBE]],
  ['V3b', 'if (a.notInProbe.length || a.notAnItem.length) bad.push(', 'if (a.notInProbe.length) bad.push(', [LIVEPROBE]],
  ['V3c', 'if (a.notInProbe.length || a.notAnItem.length) bad.push(', 'if (a.notAnItem.length) bad.push(', [LIVEPROBE]],
  ['V4', 'if (a.closedDiffer.length) bad.push(', 'if (false) bad.push(', [CLOSEDDIFFERS]],
  ['V5', 'if (a.articleDiffer.length) bad.push(', 'if (false) bad.push(', [ARTICLE]],
  ['V6', 'if (a.oldKindLeft) bad.push(', 'if (false) bad.push(', [OLDKIND]],
  ['V7', 'if (a.tables[0] !== a.tables[1]) bad.push(', 'if (false) bad.push(', [TABLE]],
  ['V8', 'bad.push(...diffProblems(a.diff, a.expected, a.rows))', 'bad.push()', [LIVECHANGES]],
  // the live report
  ['RL1', 'roof-stage rows of ${a.rows};', 'roof-stage rows of ${a.staged};', [LIVEREPORT]],
  ['RL1b', 'answered in the new cache ${a.asked - a.unanswered.length} of ${a.asked};', 'answered in the new cache ${a.asked - a.unanswered.length} of ${a.staged};', [UNANSWERED, LIVEREPORT]],
  ['RL2', '${a.answers - a.asked} of the ${a.answers} items', '${a.answers - a.asked} of the ${a.asked} items', [LIVEREPORT]],
  ['RL3', '- a.closedDiffer.length} of ${a.asked}; all labels equal:', '- a.closedDiffer.length} of ${a.staged}; all labels equal:', [CLOSEDDIFFERS, LIVEREPORT]],
  ['RL3b', '- a.labelsDiffer.length} of ${a.asked}${', '- a.labelsDiffer.length} of ${a.staged}${', [WIDER, LIVEREPORT]],
  ['RL4', "- a.articleDiffer.length} of ${a.asked}`", "- a.articleDiffer.length} of ${a.staged}`", [ARTICLE, LIVEREPORT]],
  ['RL5', 'entries left in the new cache: ${a.oldKindLeft}', 'entries left in the new cache: ${a.answers}', [LIVEREPORT]],
  ['RL6', 'a.tables[0] === a.tables[1] ? `is the same blob', 'a.tables[0] !== a.tables[1] ? `is the same blob', [LIVEREPORT]],
]

const once = (text, anchor) => text.split(anchor).length - 1

function runCopy(text) {
  const dir = mkdtempSync(join(tmpdir(), 'p1552-teeth-'))
  try {
    mkdirSync(join(dir, 'outbox'))
    symlinkSync(resolve('scripts'), join(dir, 'scripts'))
    symlinkSync(resolve(SIBLING), join(dir, SIBLING))
    const f = join(dir, 'outbox', 'copy.mjs')
    writeFileSync(f, text)
    return spawnSync(process.execPath, [f, '--self-test'], { cwd: process.cwd(), encoding: 'utf8' })
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

if (isMain(import.meta.url)) {
  const src = readFileSync(SRC, 'utf8')
  let bad = 0, refused = 0
  const control = runCopy(src)
  const controlOut = control.stdout ?? ''
  const names = [...controlOut.matchAll(/^PASS  (.*)$/gm)].map(m => m[1])
  const summary = controlOut.match(/^(\d+)\/(\d+) checks passed/m)
  const controlOk = control.status === 0 && summary !== null && summary[1] === summary[2] && names.length === Number(summary[2])
  console.log(`${controlOk ? 'PASS' : 'FAIL'}  CONTROL: the unbroken copy's self-test exits ${control.status} with ${summary ? `${summary[1]} of ${summary[2]}` : 'no summary'} checks passing (it must exit 0 with all of them)`)
  if (!controlOk) { console.log('the control did not pass, so no break below means anything'); finish(1); process.exit() }
  const ids = MUTATIONS.map(m => m[0])
  if (new Set(ids).size !== ids.length) { bad++; console.log(`FAIL  duplicate mutation ids: ${ids.filter((x, i) => ids.indexOf(x) !== i).join(' ')}`) }
  const full = want => { const hit = names.filter(n => n.includes(want)); return hit.length === 1 ? hit[0] : null }
  const aimed = new Set()
  for (const [id, anchor, repl, wants] of MUTATIONS) {
    const targets = wants.map(w => [w, full(w)])
    const unmatched = targets.filter(([, n]) => n === null).map(([w]) => w)
    if (unmatched.length) { bad++; console.log(`FAIL  [${id}] aims at ${unmatched.map(w => `"${w.slice(0, 50)}"`).join(', ')}, which does not match exactly one check of the self-test`); continue }
    const n = once(src, anchor)
    if (n !== 1) { bad++; console.log(`FAIL  [${id}] not applied: the anchor occurs ${n} times, not once: ${anchor.slice(0, 80)}`); continue }
    if (anchor === repl) { bad++; console.log(`FAIL  [${id}] the replacement is the text it replaces`); continue }
    const r = runCopy(src.replace(anchor, () => repl))
    const out = r.stdout ?? ''
    const ran = /^\d+\/\d+ checks passed/m.test(out)
    const lost = targets.filter(([, name]) => out.includes(`FAIL  ${name}`)).map(([, name]) => name)
    const ok = r.status === 1 && ran && lost.length === targets.length
    if (ok) { refused++; targets.forEach(([, name]) => aimed.add(name)) } else bad++
    console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] broken; the self-test exits ${r.status}${ran ? '' : ' without finishing (it crashed)'} and ${ok ? `loses ${lost.length} aimed check${lost.length === 1 ? '' : 's'}: ${lost.map(x => x.slice(0, 60)).join(' | ')}` : `does NOT lose: ${targets.filter(([, name]) => !lost.includes(name)).map(([, name]) => name.slice(0, 70)).join(' | ')}`}`)
  }
  const unaimed = names.filter(nm => !aimed.has(nm))
  console.log(`\n${refused} of ${MUTATIONS.length} broken copies refused by their own self-test, each losing the checks it was aimed at; control ${controlOk ? 'green' : 'red'}`)
  console.log(`COVERAGE: ${names.length - unaimed.length} of ${names.length} checks of the self-test have a break aimed at them and lost${unaimed.length ? `; NONE for: ${unaimed.join(' | ')}` : ''}`)
  if (unaimed.length) bad++
  finish(bad)
}
