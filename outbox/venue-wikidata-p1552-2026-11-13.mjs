// The roof rule asks Wikidata for P1552 ("has characteristic") where it asked for P5624, and this is what that does to every row of the sourcing results:
// computed offline BEFORE a runner spends its read, and set against the runner's answer AFTER it (Rule 89: the artifact is this script's printed result).
// docs/CC-CMD-2026-11-09-venue-review-remainder.md, Task 5, Step B (the owner's "Wire" at 2026-11-13 19:07 ET, then "Wire P1552"). Run from the repository root:
//   node outbox/venue-wikidata-p1552-2026-11-13.mjs predict                  offline: the real `roofOf` on the committed cache, once with Wikidata silent and once with the probe's P1552 labels
//   node outbox/venue-wikidata-p1552-2026-11-13.mjs compare OLD_REV NEW_REV  after the runner's fill: its answers and its results against the probe and the old results (git revs)
//   node outbox/venue-wikidata-p1552-2026-11-13.mjs --self-test             both of the above on doctored inputs, each of which must be caught
//
// WHAT IS REAL. `roofOf` itself (scripts/venue-source.mjs), called once per roof-stage row. Its cache is built here: for each item the committed cache answered
// about under the old kind (`wd-roof`, P5624), the answer the new query would give is written under the new kind (`wd-roof-p1552`), with the article the old
// answer named and, for the treatment, one row per value of P1552 that the statements probe read (outbox/venue-wikidata-statements-probe.json, run 43439848251,
// the Wikidata API). The lead, body and infobox entries are the committed ones. Every entry's age is set to now so that none has expired, and `fetch` is a stub
// that counts and refuses: a request here is a failure, said by number.
// WHAT THE CONTROL SAYS. With no P1552 value anywhere (Wikidata silent) the rule must reproduce the committed roof, basis, lead, status and review reason of every
// roof-stage row. A replay that cannot reproduce the committed rows says nothing about the treatment.
// WHAT THE TREATMENT SAYS. With the probe's values, the rows are compared with the committed ones by `compare` (outbox/venue-lead-whole-diff-2026-11-09.mjs, the
// diff the Task 2 record used): the status, roof and review reason of every row must be unchanged, and the one basis text that changes is named in EXPECTED. The
// rows whose item carries a closed P1552 label are also derived from the data and held to EXPECTED, so the expectation is not only a string in this file.
// WHAT IT CANNOT SAY. That Wikidata still says what the probe read, or that the rule's own SPARQL answers with what the Action API gave: `compare` is that, on
// the runner's fill.
//
// SEMANTICS OF `wdt:`. The query asks `wdt:P1552`, the truthy statements: deprecated ones are left out and, when any statement is preferred, only the preferred
// ones remain. `truthyValues` applies the same rule to the probe's statements and ranks. A value with no English label, or one that is not an item, is not
// predicted: the item is reported as not computable and the run fails, never filled in.

import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'
import { roofOf, classifyRoof, pastTense } from '../scripts/venue-source.mjs'
import { rowsOf } from '../scripts/venue-infobox.mjs'
import { compare } from './venue-lead-whole-diff-2026-11-09.mjs'
import { createChecks, finish, isMain } from '../scripts/checks.mjs'

const RESULTS = 'outbox/venue-source-results-latest.json', CACHE = 'outbox/venue-source-cache.json', PROBE = 'outbox/venue-wikidata-statements-probe.json', TABLE = 'src/Venues.fs'
const OLD_KIND = 'wd-roof|', NEW_KIND = 'wd-roof-p1552|'

/** The item the saved backlinks pages say links to "retractable roof": the probe's own control (criterion 1 of the Task 5 record). */
export const CONTROL = { qid: 'Q1410402', value: 'Q7316894', label: 'retractable roof' }

/** What the Task 5 record says changes, and nothing else: one row's basis text, by name. */
export const EXPECTED = [{ name: 'Decathlon Arena - Stade Pierre-Mauroy', qid: 'Q1410402', before: 'wikipedia lead', after: 'wikidata P1552 "retractable roof"' }]

const read = p => JSON.parse(readFileSync(p, 'utf8'))
const sha = p => createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 12)
const uniq = xs => [...new Set(xs)]
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// --- what the query answers --------------------------------------------------------------------------

/** The values of P1552 a `wdt:` triple gives: a deprecated statement is left out, and when any is preferred only the preferred ones count. */
export const truthyValues = statements => {
  const live = (statements ?? []).filter(s => s.p === 'P1552' && s.r !== 'deprecated')
  const preferred = live.filter(s => s.r === 'preferred')
  return (preferred.length ? preferred : live).map(s => s.v)
}

/** The answer the rule's SPARQL gives: one row per value of P1552, each with the article; one row with the article alone when there is no value. */
export const answerOf = (article, labels) => {
  const art = article ? { article: { type: 'uri', value: article } } : {}
  const rows = labels.length ? labels.map(l => ({ roofLabel: { 'xml:lang': 'en', type: 'literal', value: l }, ...art })) : [art]
  return { ok: true, value: { head: { vars: ['roofLabel', 'article'] }, results: { bindings: rows } } }
}

/** The labels of the rows of an answer, as the rule reads them. */
export const labelsOfAnswer = answer => uniq(answer.value.results.bindings.map(b => b.roofLabel?.value).filter(Boolean)).sort()
const closed = labels => labels.filter(l => classifyRoof(l) !== 'open').sort()

/** The two caches `roofOf` is replayed on: Wikidata silent (control) and Wikidata as the probe read it (treatment). */
export const cachesOf = ({ cache, probe, now }) => {
  const control = {}, treatment = {}
  const notes = { answers: 0, unanswered: [], notInProbe: [], notAnItem: [], unlabelled: [], values: [] }
  for (const [k, v] of Object.entries(cache)) {
    if (/^(wp-lead|wp-bodyroof|wp-infobox)\|/.test(k)) control[k] = treatment[k] = { ...v, at: now }
  }
  for (const [k, v] of Object.entries(cache)) {
    if (!k.startsWith(OLD_KIND)) continue
    const qid = k.slice(OLD_KIND.length)
    notes.answers++
    if (!v.result?.ok) { notes.unanswered.push(qid); continue }
    const article = v.result.value.results.bindings[0]?.article?.value ?? null
    control[NEW_KIND + qid] = { at: now, result: answerOf(article, []) }
    const item = probe.items?.[qid]
    if (!item?.ok) { notes.notInProbe.push(qid); continue }
    const ids = truthyValues(item.statements)
    if (ids.some(id => !/^Q\d+$/.test(String(id)))) { notes.notAnItem.push(qid); continue }
    const labels = ids.map(id => probe.labels?.[id]?.l ?? null)
    if (labels.some(l => l === null)) { notes.unlabelled.push(qid); continue }
    ids.forEach((id, i) => notes.values.push({ qid, id, label: labels[i] }))
    treatment[NEW_KIND + qid] = { at: now, result: answerOf(article, labels) }
  }
  return { control, treatment, notes }
}

// --- what `source` does with a roof decision ---------------------------------------------------------

/** The review reason `source` gives a row once its roof is known (scripts/venue-source.mjs, the lines after `roofOf`), or null for an accepted row. */
export const reasonOf = (row, d) => {
  if (!d.roof) return `roof: ${d.basis}`
  if (/dome\b/i.test(row.name) && d.roof === 'open') return 'roof: the name says dome, the sources read open'
  if (pastTense(d.lead)) return 'the article is in the past tense: a demolished building'
  if (!row.zone) return 'no zone at the point'
  return null
}

/** `roofOf` on each row's item, on a cache; a request is refused and counted, and a row whose answer is missing from the cache is not computable. */
export const replay = async ({ rows, cache, roofOfFn = roofOf }) => {
  const calls = [], real = globalThis.fetch
  globalThis.fetch = async url => { calls.push(String(url)); return { status: 404, ok: false, headers: { get: () => null }, json: async () => ({}) } }
  const decided = new Map(), notComputable = []
  try {
    for (const r of rows) {
      if (r.qid && !cache[NEW_KIND + r.qid]) { notComputable.push({ name: r.name, what: NEW_KIND + r.qid }); continue }
      decided.set(r.name, await roofOfFn(r.qid, cache, { gapMs: 0 }))
    }
  } finally { globalThis.fetch = real }
  return { decided, notComputable, requests: calls }
}

/** The results file the decisions would make: every row not decided is carried over untouched. */
export const resultsAfter = (results, decided) => {
  const out = { accepted: [], review: [] }
  for (const status of ['accepted', 'review']) {
    for (const r of results[status]) {
      const d = decided.get(r.name)
      if (!d) { out[status].push(r); continue }
      const { why, ...rest } = r
      const next = { ...rest, roof: d.roof, roofBasis: d.basis, lead: d.lead ?? null }
      const reason = reasonOf(r, d)
      out[reason ? 'review' : 'accepted'].push(reason ? { ...next, why: reason } : next)
    }
  }
  return out
}

// --- the probe is a valid witness --------------------------------------------------------------------

/** What is wrong with the statements probe as the measurement of P1552 on the cache's items; an empty list is valid. */
export const probeProblems = (probe, cache, control = CONTROL) => {
  const bad = []
  if (probe.complete !== true) bad.push('the probe says it did not complete')
  if (probe.fatal !== null && probe.fatal !== undefined) bad.push(`the probe recorded a fatal error: ${JSON.stringify(probe.fatal).slice(0, 80)}`)
  if ((probe.labelFailures ?? []).length) bad.push(`${probe.labelFailures.length} label request(s) failed`)
  const asked = Object.keys(cache).filter(k => k.startsWith(OLD_KIND)).map(k => k.slice(OLD_KIND.length))
  const got = Object.keys(probe.items ?? {})
  const lacking = asked.filter(q => !got.includes(q)), extra = got.filter(q => !asked.includes(q))
  if (lacking.length || extra.length) bad.push(`the probe's items are not the cache's: ${lacking.length} the cache asks about and the probe lacks (${lacking.slice(0, 3).join(' ')}), ${extra.length} the probe has and the cache does not (${extra.slice(0, 3).join(' ')})`)
  const unread = Object.entries(probe.items ?? {}).filter(([, i]) => !i.ok).map(([q]) => q)
  if (unread.length) bad.push(`${unread.length} item(s) did not read: ${unread.slice(0, 3).join(' ')}`)
  const ctl = probe.items?.[control.qid]
  const found = (ctl?.statements ?? []).filter(s => s.p === 'P1552' && s.v === control.value && s.r !== 'deprecated')
  if (!found.length) bad.push(`the control item ${control.qid} carries no P1552 statement with ${control.value}: the probe cannot be trusted to see a roof`)
  else if (classifyRoof(probe.labels?.[control.value]?.l ?? '') !== 'retractable') bad.push(`the control value ${control.value} reads as no roof (${JSON.stringify(probe.labels?.[control.value]?.l)})`)
  return bad
}

// --- the diff against the committed rows -------------------------------------------------------------

/** What is wrong with a comparison of two results files, held to the expected basis changes; an empty list is as predicted. */
export const diffProblems = (c, expected, totalRows) => {
  const bad = []
  if (c.onlyOld.length || c.onlyNew.length) bad.push(`rows compared ${c.compared} of ${totalRows}; only in old ${c.onlyOld.length}, only in new ${c.onlyNew.length}`)
  if (c.moved.length) bad.push(`${c.moved.length} row(s) moved (lat, lon, zone, qid, agreeing or via): ${c.moved.slice(0, 3).map(m => m.name).join('; ')}`)
  if (c.changed.length) bad.push(`rows that change and should not (status, roof or review reason): ${c.changed.map(x => `${x.name} [${x.kind}]`).join('; ')}`)
  const got = Object.fromEntries(c.basisOnly.map(x => [x.name, x]))
  for (const e of expected) {
    const x = got[e.name]
    if (!x) bad.push(`${e.name}: the basis did not change`)
    else if (x.before.basis !== e.before || x.after.basis !== e.after) bad.push(`${e.name}: basis ${JSON.stringify(x.before.basis)} -> ${JSON.stringify(x.after.basis)}, not ${JSON.stringify(e.before)} -> ${JSON.stringify(e.after)}`)
  }
  const extra = c.basisOnly.filter(x => !expected.some(e => e.name === x.name)).map(x => x.name)
  if (extra.length) bad.push(`basis text changes that should not: ${extra.join('; ')}`)
  return bad
}

// --- predict ------------------------------------------------------------------------------------------

export const analyze = async ({ results, cache, probe, now = Date.now(), expected = EXPECTED, control = CONTROL, roofOfFn = roofOf }) => {
  const rows = rowsOf(results), staged = rows.filter(r => 'roofBasis' in r)
  const built = cachesOf({ cache, probe, now })
  const ctl = await replay({ rows: staged, cache: built.control, roofOfFn })
  const trt = await replay({ rows: staged, cache: built.treatment, roofOfFn })
  const mismatches = []
  let reproduced = 0
  for (const r of staged) {
    const d = ctl.decided.get(r.name)
    if (!d) continue
    const reason = reasonOf(r, d), status = reason ? 'review' : 'accepted'
    if (d.roof === r.roof && d.basis === r.roofBasis && (d.lead ?? null) === (r.lead ?? null) && status === r.status && (reason ?? null) === (r.why ?? null)) reproduced++
    else mismatches.push({ name: r.name, committed: [r.status, r.roof, r.roofBasis, r.why ?? null], replayed: [status, d.roof, d.basis, reason] })
  }
  const diff = compare(results, resultsAfter(results, trt.decided))
  const withClosed = uniq(built.notes.values.filter(v => classifyRoof(v.label) !== 'open').map(v => v.qid))
  return {
    rows: rows.length, staged: staged.length, asked: uniq(staged.map(r => r.qid).filter(Boolean)).length, notes: built.notes, expected,
    control: { reproduced, mismatches, notComputable: ctl.notComputable, requests: ctl.requests },
    treatment: { notComputable: trt.notComputable, requests: trt.requests, diff },
    closedRows: staged.filter(r => withClosed.includes(r.qid)).map(r => r.name).sort(),
    probeBad: probeProblems(probe, cache, control),
  }
}

/** The verdict, as a list of what is wrong; an empty list is a pass. */
export const problems = a => {
  const bad = [...a.probeBad]
  if (!a.staged || a.control.reproduced + a.control.mismatches.length === 0) bad.push('nothing was replayed')
  const nc = [...a.control.notComputable, ...a.treatment.notComputable]
  if (nc.length) bad.push(`${nc.length} replay(s) not computable (a cache key missing): ${uniq(nc.map(x => x.name)).slice(0, 3).join('; ')}`)
  const n = a.notes.unanswered.length + a.notes.notInProbe.length + a.notes.notAnItem.length + a.notes.unlabelled.length
  if (n) bad.push(`${n} item(s) not predictable: unanswered ${a.notes.unanswered.length}, not in the probe ${a.notes.notInProbe.length}, a value that is not an item ${a.notes.notAnItem.length}, a value with no English label ${a.notes.unlabelled.length}`)
  const req = [...a.control.requests, ...a.treatment.requests]
  if (req.length) bad.push(`${req.length} request(s) were made: ${req.slice(0, 2).join(' ')}`)
  if (a.control.mismatches.length) bad.push(`the Wikidata-silent control reproduces ${a.control.reproduced} of ${a.control.reproduced + a.control.mismatches.length} committed roof-stage rows; the rest: ${a.control.mismatches.slice(0, 3).map(m => m.name).join('; ')}`)
  bad.push(...diffProblems(a.treatment.diff, a.expected, a.rows))
  if (!same(a.closedRows, a.expected.map(e => e.name).sort())) bad.push(`the rows whose item carries a closed P1552 label (${JSON.stringify(a.closedRows)}) are not the expected ones (${JSON.stringify(a.expected.map(e => e.name))})`)
  return bad
}

const comparedLine = (c, what) => `COMPARED with the ${what} results by name: ${c.compared} of ${c.oldRows} rows (new ${c.newRows}); only in old ${c.onlyOld.length}, only in new ${c.onlyNew.length}; moved ${c.moved.length}`
const changedLine = c => `CHANGED (status, roof or review reason): ${c.changed.length} of ${c.compared}; same status and roof, different basis only: ${c.basisOnly.length}${c.basisOnly.map(x => `\n  ${x.name}: ${JSON.stringify(x.before.basis)} -> ${JSON.stringify(x.after.basis)}`).join('')}`
const verdict = (bad, ok) => (bad.length ? `NOT AS PREDICTED:${bad.map(b => `\n  ${b}`).join('')}` : `AS PREDICTED: ${ok}`)

export const report = (a, inputs, bad) => {
  const c = a.treatment.diff, replayed = a.control.reproduced + a.control.mismatches.length
  const byLabel = {}
  for (const v of a.notes.values) (byLabel[v.label] ??= []).push(v.qid)
  return [
    'venue P1552, offline: roofOf end to end on the committed cache, with Wikidata silent and with the statements probe\'s P1552 values',
    `INPUTS: ${inputs}`,
    `COVERAGE: roofOf replayed for ${replayed} of ${a.rows} rows; ${a.rows - a.staged} never reach the roof stage; ${a.asked} distinct items asked of the ${a.notes.answers} the cache answered about under the old kind; not computable: ${a.control.notComputable.length + a.treatment.notComputable.length}`,
    `NETWORK: ${a.control.requests.length + a.treatment.requests.length} request(s) made by ${2 * replayed} roofOf calls (the stub refuses and counts)`,
    `PROBE: ${a.probeBad.length ? `NOT A VALID WITNESS: ${a.probeBad.join('; ')}` : 'complete; every item the cache asks about was read; the control item carries P1552 -> "retractable roof"'}`,
    `P1552 VALUES (truthy, as the query returns them): ${a.notes.values.length} on ${uniq(a.notes.values.map(v => v.qid)).length} of ${a.notes.answers} items; unlabelled ${a.notes.unlabelled.length}, not an item ${a.notes.notAnItem.length}${Object.entries(byLabel).map(([l, q]) => `\n  ${JSON.stringify(l)} x${q.length}: ${q.join(' ')}`).join('')}`,
    `CONTROL (Wikidata silent): ${a.control.reproduced} of ${replayed} rows reproduce the committed roof, basis, lead, status and review reason${a.control.mismatches.map(m => `\n  MISMATCH ${m.name}: committed ${JSON.stringify(m.committed)}, replayed ${JSON.stringify(m.replayed)}`).join('')}`,
    `TREATMENT (the probe's values): rows whose item carries a closed P1552 label: ${a.closedRows.length}${a.closedRows.map(n => `\n  ${n}`).join('')}`,
    comparedLine(c, 'committed'),
    changedLine(c),
    verdict(bad, `no row changes status, roof or review reason, and the basis text changes on exactly ${a.expected.length} row (${a.expected.map(e => e.name).join('; ')}); the Wikidata-silent control reproduces all ${replayed} committed roof-stage rows`),
  ].join('\n')
}

// --- compare: the runner's fill against the probe and the old results --------------------------------

/** The runner's answers and results against the probe and the old results; `tables` is the blob id of src/Venues.fs at the old and the new rev. */
export const analyzeLive = ({ oldResults, newResults, oldCache, newCache, probe, tables, expected = EXPECTED }) => {
  const rows = rowsOf(newResults), staged = rows.filter(r => 'roofBasis' in r)
  const asked = uniq(staged.map(r => r.qid).filter(Boolean)).sort()
  const out = { rows: rows.length, staged: staged.length, asked: asked.length, answers: Object.keys(oldCache).filter(k => k.startsWith(OLD_KIND)).length,
    unanswered: [], notInProbe: [], notAnItem: [], closedDiffer: [], labelsDiffer: [], articleDiffer: [], tables, expected,
    oldKindLeft: Object.keys(newCache).filter(k => k.startsWith(OLD_KIND)).length }
  for (const q of asked) {
    const live = newCache[NEW_KIND + q]?.result
    if (!live?.ok) { out.unanswered.push(q); continue }
    const item = probe.items?.[q]
    if (!item?.ok) { out.notInProbe.push(q); continue }
    const ids = truthyValues(item.statements)
    if (ids.some(id => !/^Q\d+$/.test(String(id)))) { out.notAnItem.push(q); continue }
    const want = uniq(ids.map(id => probe.labels?.[id]?.l ?? id)).sort(), got = labelsOfAnswer(live)
    if (!same(closed(got), closed(want))) out.closedDiffer.push({ qid: q, live: closed(got), probe: closed(want) })
    if (!same(got, want)) out.labelsDiffer.push({ qid: q, live: got, probe: want })
    const arts = uniq(live.value.results.bindings.map(b => b.article?.value).filter(Boolean))
    const old = oldCache[OLD_KIND + q]?.result?.value?.results?.bindings?.[0]?.article?.value ?? null
    if (!same(arts.length ? arts : [null], [old])) out.articleDiffer.push({ qid: q, live: arts, old })
  }
  out.diff = compare(oldResults, newResults)
  return out
}

export const liveProblems = a => {
  const bad = []
  if (!a.asked) bad.push('no item was asked about')
  if (a.unanswered.length) bad.push(`${a.unanswered.length} item(s) the new results ask about have no answer in the new cache: ${a.unanswered.slice(0, 3).join(' ')}`)
  if (a.notInProbe.length || a.notAnItem.length) bad.push(`${a.notInProbe.length} item(s) not read by the probe, ${a.notAnItem.length} with a value that is not an item`)
  if (a.closedDiffer.length) bad.push(`closed labels differ from the probe's on ${a.closedDiffer.length} item(s): ${a.closedDiffer.slice(0, 3).map(x => `${x.qid} live ${JSON.stringify(x.live)} probe ${JSON.stringify(x.probe)}`).join('; ')}`)
  if (a.articleDiffer.length) bad.push(`the article differs from the old answer's on ${a.articleDiffer.length} item(s): ${a.articleDiffer.slice(0, 3).map(x => x.qid).join(' ')}`)
  if (a.oldKindLeft) bad.push(`the new cache still holds ${a.oldKindLeft} old-kind (wd-roof) entries: the runner did not run the new rule`)
  if (a.tables[0] !== a.tables[1]) bad.push(`src/Venues.fs differs between the revs (${a.tables[0].slice(0, 12)} -> ${a.tables[1].slice(0, 12)})`)
  bad.push(...diffProblems(a.diff, a.expected, a.rows))
  return bad
}

export const reportLive = (a, inputs, bad) => {
  const c = a.diff
  return [
    'venue P1552, the runner\'s fill against the statements probe and the old results',
    `INPUTS: ${inputs}`,
    `COVERAGE: ${a.asked} distinct items asked by the ${a.staged} roof-stage rows of ${a.rows}; answered in the new cache ${a.asked - a.unanswered.length} of ${a.asked}; ${a.answers - a.asked} of the ${a.answers} items the old cache answered about are not asked (no roof-stage row)`,
    `CLOSED LABELS equal the probe's: ${a.asked - a.unanswered.length - a.notInProbe.length - a.notAnItem.length - a.closedDiffer.length} of ${a.asked}; all labels equal: ${a.asked - a.unanswered.length - a.notInProbe.length - a.notAnItem.length - a.labelsDiffer.length} of ${a.asked}${a.labelsDiffer.slice(0, 5).map(x => `\n  labels differ ${x.qid}: live ${JSON.stringify(x.live)}, probe ${JSON.stringify(x.probe)}`).join('')}`,
    `ARTICLES equal the old answer's: ${a.asked - a.unanswered.length - a.articleDiffer.length} of ${a.asked}`,
    `OLD KIND (wd-roof) entries left in the new cache: ${a.oldKindLeft}`,
    `TABLE: src/Venues.fs ${a.tables[0] === a.tables[1] ? `is the same blob at both revs (${a.tables[0].slice(0, 12)})` : `DIFFERS: ${a.tables[0].slice(0, 12)} -> ${a.tables[1].slice(0, 12)}`}`,
    comparedLine(c, 'old'),
    changedLine(c),
    verdict(bad, `no row changes status, roof or review reason, and the basis text changes on exactly ${a.expected.length} row (${a.expected.map(e => e.name).join('; ')})`),
  ].join('\n')
}

// --- the self-test ------------------------------------------------------------------------------------

const selfTest = async () => {
  const { check, summarize } = createChecks()
  const row = (name, qid, roof, basis, lead) => ({ name, qid, lat: 1, lon: 2, zone: 'Z', agreeing: ['wikidata', 'nominatim'], sports: 'S', home: 'H', roof, roofBasis: basis, lead })
  const INFERRED = 'inferred: the lead names no roof', NOTHING = 'no Wikipedia lead and no Wikidata roof'
  // Seven rows: five with an article (two of them on one item, Q1), one (Lone Hall) with none, and one that never reaches the roof stage. The old cache also answered about Q6, which no row names.
  const results = {
    accepted: [row('Calm Park', 'Q1', 'open', INFERRED, 'Calm Park is a stadium.'), row('Roofed Arena', 'Q2', 'retractable', 'wikipedia lead', 'Roofed Arena is a stadium with a retractable roof.'),
      row('Attraction Ground', 'Q3', 'open', INFERRED, 'Attraction Ground is a stadium.'), row('Plain Field', 'Q4', 'open', INFERRED, 'Plain Field is a stadium.'), row('Calm Park Annex', 'Q1', 'open', INFERRED, 'Calm Park is a stadium.')],
    review: [{ name: 'Nowhere', sports: 'S', home: 'H', why: 'no source answered with a point', sources: {} }, { ...row('Lone Hall', 'Q5', null, NOTHING, null), why: `roof: ${NOTHING}` }],
  }
  const old = t => ({ at: 0, result: { ok: true, value: { results: { bindings: [t ? { article: { value: `https://en.wikipedia.org/wiki/${t}` } } : {}] } } } })
  const cache = {}
  for (const [q, t, lead] of [['Q1', 'T1', 'Calm Park is a stadium.'], ['Q2', 'T2', 'Roofed Arena is a stadium with a retractable roof.'], ['Q3', 'T3', 'Attraction Ground is a stadium.'], ['Q4', 'T4', 'Plain Field is a stadium.'], ['Q6', 'T6', 'Sixth Ground is a stadium.']]) {
    cache[OLD_KIND + q] = old(t)
    cache[`wp-lead|${t}`] = { at: 0, result: { ok: true, value: lead } }
    cache[`wp-bodyroof|${t}`] = { at: 0, result: { ok: true, value: '' } }
    cache[`wp-infobox|${t}`] = { at: 0, result: { ok: true, value: [] } }
  }
  cache[OLD_KIND + 'Q5'] = old(null)
  const st = (v, r = 'normal') => ({ p: 'P1552', v, r })
  const mkProbe = (over = {}) => ({ run: '1', complete: true, fatal: null, labelFailures: [],
    items: { Q1: { ok: true, statements: [{ p: 'P31', v: 'Q483110', r: 'normal' }] }, Q2: { ok: true, statements: [st('Q7316894')] }, Q3: { ok: true, statements: [st('Q570116')] }, Q4: { ok: true, statements: [] }, Q5: { ok: true, statements: [] }, Q6: { ok: true, statements: [] }, ...over.items },
    labels: { Q7316894: { l: 'retractable roof' }, Q570116: { l: 'tourist attraction' }, Q9: { l: 'domed stadium' }, ...over.labels }, ...over.top })
  const ctl = { qid: 'Q2', value: 'Q7316894', label: 'retractable roof' }
  const exp = [{ name: 'Roofed Arena', qid: 'Q2', before: 'wikipedia lead', after: 'wikidata P1552 "retractable roof"' }]
  const run = (o = {}) => analyze({ results, cache, probe: mkProbe(), expected: exp, control: ctl, ...o })

  // the semantics of the query
  check('TRUTHY: a deprecated statement is left out, a preferred one hides the normal ones, another property is ignored',
    same(truthyValues([st('A', 'deprecated'), st('B')]), ['B']) && same(truthyValues([st('A'), st('B', 'preferred')]), ['B']) && same(truthyValues([{ p: 'P31', v: 'C', r: 'normal' }, st('D')]), ['D']) && same(truthyValues([st('A', 'deprecated')]), []) && same(truthyValues(undefined), []))
  const two = answerOf('https://en.wikipedia.org/wiki/T', ['tourist attraction', 'retractable roof'])
  check('THE ANSWER IS ONE ROW PER VALUE, each with the article; with no value, one row with the article alone',
    two.value.results.bindings.length === 2 && two.value.results.bindings.every(b => b.article?.value.endsWith('/T')) && same(labelsOfAnswer(two), ['retractable roof', 'tourist attraction']) && same(answerOf(null, []).value.results.bindings, [{}]) && answerOf('u', []).value.results.bindings.length === 1)

  // predict: the clean case
  const a = await run()
  check('THE CLEAN CASE IS AS PREDICTED: the control reproduces every roof-stage row, the treatment changes only the expected basis, and no request is made',
    a.staged === 6 && a.rows === 7 && a.control.reproduced === 6 && a.control.mismatches.length === 0 && a.treatment.diff.changed.length === 0 && same(a.treatment.diff.basisOnly.map(x => x.name), ['Roofed Arena']) && a.control.requests.length === 0 && a.treatment.requests.length === 0 && problems(a).length === 0, JSON.stringify(problems(a)))
  check('A VALUE THAT NAMES NO ROOF IS NO WITNESS: "tourist attraction" leaves its row exactly as it was', !a.treatment.diff.basisOnly.some(x => x.name === 'Attraction Ground') && !a.treatment.diff.changed.some(x => x.name === 'Attraction Ground'))
  check('THE ROWS THE DATA SAYS CARRY A CLOSED LABEL ARE DERIVED, and held to the expected ones', same(a.closedRows, ['Roofed Arena']) && problems(await run({ expected: [{ ...exp[0], name: 'Plain Field' }] })).some(p => /are not the expected ones/.test(p)))
  check('the coverage line carries both denominators, and the report names the asked and answered items', /roofOf replayed for 6 of 7 rows; 1 never reach the roof stage; 5 distinct items asked of the 6 the cache answered/.test(report(a, 'x', [])) && /^CONTROL \(Wikidata silent\): 6 of 6 rows/m.test(report(a, 'x', [])), report(a, 'x', []).split('\n')[2])

  // predict: doctored inputs, each of which must be caught
  const roofChange = await run({ probe: mkProbe({ items: { Q4: { ok: true, statements: [st('Q9')] } } }) })
  check('A P1552 VALUE THAT CHANGES A ROOF IS REPORTED, by name and kind', roofChange.treatment.diff.changed.length === 1 && roofChange.treatment.diff.changed[0].name === 'Plain Field' && roofChange.treatment.diff.changed[0].kind === 'roof open -> dome' && problems(roofChange).some(p => /rows that change and should not.*Plain Field \[roof open -> dome\]/.test(p)), JSON.stringify(problems(roofChange)))
  const conflict = await run({ probe: mkProbe({ items: { Q2: { ok: true, statements: [st('Q7316894'), st('Q9')] } } }) })
  check('TWO ROOFS ON ONE ITEM IS REVIEW, never the first or the last: the row leaves accepted and the run says so', conflict.treatment.diff.changed.some(x => x.name === 'Roofed Arena' && x.kind === 'accepted -> review') && problems(conflict).some(p => /Roofed Arena \[accepted -> review\]/.test(p)), JSON.stringify(conflict.treatment.diff.changed))
  const silent = await run({ probe: mkProbe({ items: { Q2: { ok: true, statements: [] } } }) })
  check('AN EXPECTED BASIS CHANGE THAT DID NOT HAPPEN IS NAMED', problems(silent).some(p => /Roofed Arena: the basis did not change/.test(p)))
  const deprecated = await run({ probe: mkProbe({ items: { Q2: { ok: true, statements: [st('Q7316894', 'deprecated')] } } }) })
  check('A DEPRECATED STATEMENT IS NOT READ, as the query does not read it', problems(deprecated).some(p => /Roofed Arena: the basis did not change/.test(p)))
  const wrongText = await run({ expected: [{ ...exp[0], after: 'wikidata P5624 "retractable roof"' }] })
  const wrongBefore = await run({ expected: [{ ...exp[0], before: 'inferred' }] })
  check('THE BASIS TEXT IS HELD EXACTLY, before and after, not only that it changed', problems(wrongText).some(p => /basis "wikipedia lead" -> "wikidata P1552 \\"retractable roof\\"", not "wikipedia lead" -> "wikidata P5624/.test(p)) && problems(wrongBefore).some(p => /not "inferred" -> "wikidata P1552/.test(p)), JSON.stringify(problems(wrongText)))
  const extraBasis = await run({ expected: [] })
  check('A BASIS CHANGE NOBODY EXPECTED IS NAMED', problems(extraBasis).some(p => /basis text changes that should not: Roofed Arena/.test(p)))
  const doctoredRule = await run({ roofOfFn: async (q, c, o) => { const d = await roofOf(q, c, o); return q === 'Q4' ? { ...d, roof: 'dome' } : d } })
  check('A ROOFOF THAT DOES NOT REPRODUCE A COMMITTED ROW IN THE CONTROL IS REPORTED, by name, over its denominator', doctoredRule.control.mismatches.length === 1 && doctoredRule.control.mismatches[0].name === 'Plain Field' && problems(doctoredRule).some(p => /control reproduces 5 of 6/.test(p)) && /^CONTROL \(Wikidata silent\): 5 of 6 rows reproduce/m.test(report(doctoredRule, 'x', problems(doctoredRule))), JSON.stringify(problems(doctoredRule)))
  const doctorRow = patch => ({ accepted: results.accepted.map(r => r.name === 'Calm Park' ? { ...r, ...patch } : r), review: results.review })
  const heldBy = async variant => (await run({ results: variant })).control.mismatches.map(m => m.name).join()
  const toReview = { accepted: results.accepted.filter(r => r.name !== 'Calm Park'), review: [...results.review, results.accepted[0]] }
  check('THE CONTROL HOLDS EACH FIELD OF A COMMITTED ROW: a different roof, basis, lead, status or review reason is reported, by name',
    (await heldBy(doctorRow({ roof: 'dome' }))) === 'Calm Park' && (await heldBy(doctorRow({ roofBasis: 'wikipedia lead' }))) === 'Calm Park' && (await heldBy(doctorRow({ lead: 'Calm Park was a stadium.' }))) === 'Calm Park' &&
    (await heldBy(toReview)) === 'Calm Park' && (await heldBy(doctorRow({ why: 'stale reason' }))) === 'Calm Park' && (await heldBy(results)) === '')
  const strange = await run({ roofOfFn: async (q, c, o) => { await fetch('https://example.invalid/x'); return roofOf(q, c, o) } })
  check('A REQUEST MADE DURING THE REPLAY IS COUNTED AND FAILS THE RUN', strange.control.requests.length === 6 && strange.treatment.requests.length === 6 && problems(strange).some(p => /12 request\(s\) were made/.test(p)))
  const { [OLD_KIND + 'Q3']: gone, ...short } = cache
  const missing = await analyze({ results, cache: short, probe: mkProbe(), expected: exp, control: ctl })
  check('A ROW WHOSE ANSWER IS MISSING FROM THE CACHE IS NOT COMPUTABLE, said and not skipped', missing.control.notComputable.length === 1 && missing.control.notComputable[0].name === 'Attraction Ground' && problems(missing).some(p => /not computable/.test(p)) && problems(missing).some(p => /not the cache's/.test(p)), JSON.stringify(problems(missing)))
  const unlabelled = await run({ probe: mkProbe({ items: { Q3: { ok: true, statements: [st('Q404')] } } }) })
  check('A VALUE WITH NO ENGLISH LABEL IS NOT PREDICTED, and the run says so', unlabelled.notes.unlabelled.length === 1 && problems(unlabelled).some(p => /a value with no English label 1/.test(p)))
  const odd = await run({ probe: mkProbe({ items: { Q3: { ok: true, statements: [{ p: 'P1552', v: null, k: 'somevalue', r: 'normal' }] } } }) })
  check('AN UNKNOWN VALUE IS NOT PREDICTED, and the run says so', odd.notes.notAnItem.length === 1 && problems(odd).some(p => /a value that is not an item 1/.test(p)))
  const failedOld = { ...cache, [OLD_KIND + 'Q3']: { at: 0, result: { ok: false, why: 'HTTP 500' } } }
  const un = await analyze({ results, cache: failedOld, probe: mkProbe(), expected: exp, control: ctl })
  const notRead = await run({ probe: mkProbe({ items: { Q3: { ok: false } } }) })
  check('AN ITEM THE OLD ANSWER FAILED FOR, OR THE PROBE DID NOT READ, IS NOT PREDICTED, and the run says so', un.notes.unanswered.length === 1 && problems(un).some(p => /not predictable: unanswered 1,/.test(p)) && notRead.notes.notInProbe.length === 1 && problems(notRead).some(p => /not predictable: unanswered 0, not in the probe 1,/.test(p)))
  check('A PROBE THAT DID NOT COMPLETE, DID NOT READ AN ITEM, OR CANNOT SEE THE CONTROL IS NOT A VALID WITNESS',
    probeProblems(mkProbe({ top: { complete: false } }), cache, ctl).some(p => /did not complete/.test(p)) && probeProblems(mkProbe({ top: { fatal: 'boom' } }), cache, ctl).some(p => /fatal/.test(p)) &&
    probeProblems(mkProbe({ items: { Q3: { ok: false } } }), cache, ctl).some(p => /did not read/.test(p)) && probeProblems(mkProbe({ items: { Q2: { ok: true, statements: [] } } }), cache, ctl).some(p => /carries no P1552/.test(p)) &&
    probeProblems(mkProbe({ items: { Q2: { ok: true, statements: [st('Q7316894', 'deprecated')] } } }), cache, ctl).some(p => /carries no P1552/.test(p)) && probeProblems(mkProbe({ items: { Q2: { ok: true, statements: [{ p: 'P31', v: 'Q7316894', r: 'normal' }] } } }), cache, ctl).some(p => /carries no P1552/.test(p)) &&
    probeProblems(mkProbe({ labels: { Q7316894: { l: 'tourist attraction' } } }), cache, ctl).some(p => /reads as no roof/.test(p)) && probeProblems(mkProbe({ top: { labelFailures: ['x'] } }), cache, ctl).some(p => /label request/.test(p)) && probeProblems(mkProbe(), cache, ctl).length === 0)
  check('A PROBE WHOSE ITEMS ARE NOT THE CACHE\'S IS NOT A VALID WITNESS', probeProblems(mkProbe({ items: { Q7: { ok: true, statements: [] } } }), cache, ctl).some(p => /not the cache's: 0 the cache asks about and the probe lacks.*1 the probe has/.test(p)) && probeProblems(mkProbe(), short, ctl).some(p => /1 the probe has and the cache does not/.test(p)) && (() => { const p = mkProbe(); delete p.items.Q6; return probeProblems(p, cache, ctl) })().some(p => /not the cache's: 1 the cache asks about and the probe lacks \(Q6\), 0 the probe has/.test(p)))
  check('A PROBE THAT IS NOT A VALID WITNESS FAILS THE RUN, not only its own report line', problems(await run({ probe: mkProbe({ top: { complete: false } }) })).some(p => /did not complete/.test(p)))
  check('a replay of nothing is not a pass', problems(await analyze({ results: { accepted: [], review: [] }, cache, probe: mkProbe(), expected: exp, control: ctl })).includes('nothing was replayed'))
  check('the review reason is the source\'s: a dome name read open, a past-tense lead and a missing zone each name their own reason', reasonOf({ name: 'X Dome', zone: 'Z' }, { roof: 'open', lead: 'is a stadium' }) === 'roof: the name says dome, the sources read open' && reasonOf({ name: 'X', zone: 'Z' }, { roof: 'open', lead: 'X was a stadium' }) === 'the article is in the past tense: a demolished building' && reasonOf({ name: 'X', zone: null }, { roof: 'open', lead: 'X is a stadium' }) === 'no zone at the point' && reasonOf({ name: 'X', zone: 'Z' }, { roof: null, basis: 'b' }) === 'roof: b' && reasonOf({ name: 'X', zone: 'Z' }, { roof: 'open', lead: 'X is a stadium' }) === null)
  const leaving = resultsAfter({ accepted: [], review: [{ ...row('Held', 'Q1', null, 'x', null), why: 'roof: x' }] }, new Map([['Held', { roof: 'open', basis: INFERRED, lead: 'Held is a stadium.' }]]))
  const entering = resultsAfter({ accepted: [row('E', 'Q1', 'open', INFERRED, 'x')], review: [] }, new Map([['E', { roof: null, basis: 'b', lead: null }]]))
  check('A ROW THAT LEAVES REVIEW CARRIES NO REVIEW REASON, and a row that enters it carries its own', leaving.accepted.length === 1 && !('why' in leaving.accepted[0]) && leaving.review.length === 0 && entering.accepted.length === 0 && entering.review[0]?.why === 'roof: b')
  const text = report(a, 'x', [])
  check('the report names its denominators: requests over calls, values over items, rows compared over rows; and its verdict is the problems\'', /^NETWORK: 0 request\(s\) made by 12 roofOf calls/m.test(text) && /^P1552 VALUES \(truthy, as the query returns them\): 2 on 2 of 6 items; unlabelled 0, not an item 0/m.test(text) && /^COMPARED with the committed results by name: 7 of 7 rows \(new 7\)/m.test(text) && /^CHANGED \(status, roof or review reason\): 0 of 7; .*basis only: 1/m.test(text) && /^AS PREDICTED: .*the Wikidata-silent control reproduces all 6 committed roof-stage rows/m.test(text) && /^NOT AS PREDICTED:/m.test(report(roofChange, 'x', problems(roofChange))), text)

  // compare: the runner's fill
  const built = cachesOf({ cache, probe: mkProbe(), now: Date.now() })
  const newCache = Object.fromEntries(Object.entries(built.treatment).filter(([k]) => k !== NEW_KIND + 'Q6'))   // the runner asks only for the items a roof-stage row names
  const newResults = resultsAfter(results, (await replay({ rows: rowsOf(results).filter(r => 'roofBasis' in r), cache: built.treatment })).decided)
  const live = (o = {}) => analyzeLive({ oldResults: results, newResults, oldCache: cache, newCache, probe: mkProbe(), tables: ['aaa', 'aaa'], expected: exp, ...o })
  const L = live()
  check('THE RUNNER\'S FILL, AS PREDICTED, PASSES: every asked item answered, closed labels and articles equal, one basis changed', L.asked === 5 && L.unanswered.length === 0 && L.closedDiffer.length === 0 && L.articleDiffer.length === 0 && liveProblems(L).length === 0 && /^AS PREDICTED/m.test(reportLive(L, 'x', [])), JSON.stringify(liveProblems(L)))
  const { [NEW_KIND + 'Q3']: noQ3, ...fewer } = newCache
  check('AN ITEM THE NEW RESULTS ASK ABOUT AND THE NEW CACHE DOES NOT ANSWER IS NAMED, over its denominator', liveProblems(live({ newCache: fewer })).some(p => /no answer in the new cache: Q3/.test(p)) && /answered in the new cache 4 of 5/.test(reportLive(live({ newCache: fewer }), 'x', [])))
  const wrongLabel = { ...newCache, [NEW_KIND + 'Q4']: { at: 1, result: answerOf('https://en.wikipedia.org/wiki/T4', ['domed stadium']) } }
  check('A CLOSED LABEL THAT DIFFERS FROM THE PROBE\'S IS NAMED, with both sides, over its denominator', liveProblems(live({ newCache: wrongLabel })).some(p => /closed labels differ.*Q4 live \["domed stadium"\] probe \[\]/.test(p)) && /^CLOSED LABELS equal the probe's: 4 of 5; all labels equal: 4 of 5/m.test(reportLive(live({ newCache: wrongLabel }), 'x', [])), JSON.stringify(liveProblems(live({ newCache: wrongLabel }))))
  const wrongArticle = { ...newCache, [NEW_KIND + 'Q1']: { at: 1, result: answerOf('https://en.wikipedia.org/wiki/Other', []) } }
  check('AN ARTICLE THAT DIFFERS FROM THE OLD ANSWER\'S IS NAMED, over its denominator', liveProblems(live({ newCache: wrongArticle })).some(p => /article differs.*Q1/.test(p)) && /^ARTICLES equal the old answer's: 4 of 5/m.test(reportLive(live({ newCache: wrongArticle }), 'x', [])))
  const noArticle = { ...newCache, [NEW_KIND + 'Q1']: { at: 1, result: answerOf(null, []) } }
  check('AN ANSWER WITH NO ARTICLE WHERE THE OLD ONE HAD ONE IS NAMED, and one with none on either side is not', liveProblems(live({ newCache: noArticle })).some(p => /article differs.*Q1/.test(p)) && live().articleDiffer.length === 0)
  const oldNoArticle = { ...cache, [OLD_KIND + 'Q1']: old(null) }
  check('AN ARTICLE THE OLD ANSWER HAD NOT, AND THE NEW ONE HAS, IS NAMED', liveProblems(live({ oldCache: oldNoArticle })).some(p => /article differs.*Q1/.test(p)))
  check('AN OLD-KIND ENTRY LEFT IN THE NEW CACHE MEANS THE RUNNER DID NOT RUN THE NEW RULE', liveProblems(live({ newCache: { ...newCache, [OLD_KIND + 'Q1']: cache[OLD_KIND + 'Q1'] } })).some(p => /still holds 1 old-kind/.test(p)))
  check('A TABLE THAT DIFFERS BETWEEN THE REVS IS NAMED', liveProblems(live({ tables: ['aaa', 'bbb'] })).some(p => /src\/Venues\.fs differs/.test(p)))
  const flipped = { accepted: newResults.accepted.map(r => r.name === 'Plain Field' ? { ...r, roof: 'dome' } : r), review: newResults.review }
  check('A ROW THAT CHANGES BETWEEN THE OLD AND THE NEW RESULTS IS NAMED', liveProblems(live({ newResults: flipped })).some(p => /rows that change and should not.*Plain Field \[roof open -> dome\]/.test(p)))
  const fewerRows = { accepted: newResults.accepted.filter(r => r.name !== 'Calm Park'), review: newResults.review }
  const moreRows = { accepted: [...newResults.accepted, row('Extra Ground', 'Q8', 'open', INFERRED, 'x')], review: newResults.review }
  check('A ROW ON ONE SIDE ONLY IS NAMED, with the coverage denominator', liveProblems(live({ newResults: fewerRows })).some(p => /rows compared 6 of 6; only in old 1, only in new 0/.test(p)) && liveProblems(live({ newResults: moreRows })).some(p => /rows compared 7 of 8; only in old 0, only in new 1/.test(p)))
  const movedRows = { accepted: newResults.accepted.map(r => r.name === 'Calm Park' ? { ...r, lat: 9 } : r), review: newResults.review }
  check('A ROW THAT MOVED BETWEEN THE OLD AND THE NEW RESULTS IS NAMED', liveProblems(live({ newResults: movedRows })).some(p => /1 row\(s\) moved.*Calm Park/.test(p)))
  const wider = { ...newCache, [NEW_KIND + 'Q3']: { at: 1, result: answerOf('https://en.wikipedia.org/wiki/T3', ['tourist attraction', 'stadium']) } }
  const widerLive = live({ newCache: wider })
  check('A LABEL THAT NAMES NO ROOF AND DIFFERS FROM THE PROBE\'S IS LISTED, and is not a failure', widerLive.labelsDiffer.length === 1 && widerLive.closedDiffer.length === 0 && liveProblems(widerLive).length === 0 && /labels differ Q3: live \["stadium","tourist attraction"\], probe \["tourist attraction"\]/.test(reportLive(widerLive, 'x', [])) && /all labels equal: 4 of 5/.test(reportLive(widerLive, 'x', [])))
  check('AN ITEM THE PROBE DID NOT READ, OR WHOSE VALUE IS NOT AN ITEM, IS NAMED IN THE LIVE READ', liveProblems(live({ probe: mkProbe({ items: { Q3: { ok: false } } }) })).some(p => /1 item\(s\) not read by the probe, 0 with a value that is not an item/.test(p)) && liveProblems(live({ probe: mkProbe({ items: { Q3: { ok: true, statements: [{ p: 'P1552', v: null, k: 'somevalue', r: 'normal' }] } } }) })).some(p => /0 item\(s\) not read by the probe, 1 with a value that is not an item/.test(p)))
  check('a read of nothing is not a pass', liveProblems(live({ newResults: { accepted: [], review: [results.review[0]] } })).includes('no item was asked about'))
  const textLive = reportLive(L, 'x', [])
  check('the live report names its denominators: items asked and answered, closed labels, all labels, articles, rows compared, the old items not asked', /^COVERAGE: 5 distinct items asked by the 6 roof-stage rows of 7; answered in the new cache 5 of 5; 1 of the 6 items/m.test(textLive) && /^CLOSED LABELS equal the probe's: 5 of 5; all labels equal: 5 of 5/m.test(textLive) && /^ARTICLES equal the old answer's: 5 of 5/m.test(textLive) && /^COMPARED with the old results by name: 7 of 7 rows \(new 7\)/m.test(textLive) && /^COMPARED with the old results by name: 6 of 7 rows \(new 6\); only in old 1, only in new 0/m.test(reportLive(live({ newResults: { accepted: newResults.accepted.filter(r => r.name !== 'Calm Park'), review: newResults.review } }), 'x', [])) && /^OLD KIND \(wd-roof\) entries left in the new cache: 0/m.test(textLive) && /^TABLE: src\/Venues\.fs is the same blob at both revs \(aaa\)/m.test(textLive) && /^CHANGED \(status, roof or review reason\): 0 of 7; .*basis only: 1/m.test(textLive) && /^NOT AS PREDICTED:/m.test(reportLive(live({ tables: ['aaa', 'bbb'] }), 'x', liveProblems(live({ tables: ['aaa', 'bbb'] })))), textLive)
  finish(summarize())
}

// --- the command line ---------------------------------------------------------------------------------

const git = args => execSync(`git ${args}`, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
const at = (rev, p) => JSON.parse(git(`show ${rev}:${p}`))

if (isMain(import.meta.url)) {
  const [mode, oldRev, newRev] = process.argv.slice(2)
  if (mode === '--self-test') await selfTest()
  else if (mode === 'predict') {
    const results = read(RESULTS), cache = read(CACHE), probe = read(PROBE)
    const a = await analyze({ results, cache, probe })
    const bad = problems(a)
    console.log(report(a, `${RESULTS} sha256 ${sha(RESULTS)}; ${CACHE} sha256 ${sha(CACHE)}; ${PROBE} sha256 ${sha(PROBE)} (run ${probe.run})`, bad))
    process.exitCode = bad.length ? 1 : 0
  } else if (mode === 'compare' && oldRev && newRev) {
    const probe = read(PROBE)
    const a = analyzeLive({ oldResults: at(oldRev, RESULTS), newResults: at(newRev, RESULTS), oldCache: at(oldRev, CACHE), newCache: at(newRev, CACHE), probe, tables: [git(`rev-parse ${oldRev}:${TABLE}`).trim(), git(`rev-parse ${newRev}:${TABLE}`).trim()] })
    const bad = liveProblems(a)
    console.log(reportLive(a, `old ${git(`rev-parse ${oldRev}`).trim().slice(0, 12)}, new ${git(`rev-parse ${newRev}`).trim().slice(0, 12)}; ${PROBE} sha256 ${sha(PROBE)} (run ${probe.run})`, bad))
    process.exitCode = bad.length ? 1 : 0
  } else { console.error('usage: node outbox/venue-wikidata-p1552-2026-11-13.mjs predict | compare OLD_REV NEW_REV | --self-test'); process.exitCode = 2 }
}
