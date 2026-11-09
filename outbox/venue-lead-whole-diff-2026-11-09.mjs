// The diff the CC-CMD asks for (docs/CC-CMD-2026-11-09-venue-review-remainder.md, Task 2, "Done when"):
// the old and the new outbox/venue-source-results-latest.json, row by row, listing EVERY row whose
// status, roof or review reason changed, with the whole extract the new roof was read from.
//
//   node outbox/venue-lead-whole-diff-2026-11-09.mjs OLD_REV [NEW_REV]   the report, and the two JSON files next to this one
//   node outbox/venue-lead-whole-diff-2026-11-09.mjs --selftest
//
// OLD_REV is a git rev from before the runner's re-run (the results at that rev are the old file).
// NEW_REV is the rev the runner's commit made (results and cache are read from it); without it, the
// working-tree files. Reading both from git is what keeps this re-runnable after the files are restored.
//
// Two premises are MEASURED here, not assumed (PREMISE-FIRST-A):
//   - "a re-run before the first cache expiry changes only the lead": lat, lon, zone, qid, agreeing
//     and via are compared for every row, and a row that moved is named;
//   - "the same candidates went in": a row present on one side only is named, and the coverage line
//     says how many rows were compared, of how many (SAMPLE-COVERAGE-A).
// The `lead` field itself is not a change: it was a sentence and is now up to 200 characters of the
// paragraph, so it differs on almost every row and says nothing about status or roof.

import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { createChecks, finish, isMain } from '../scripts/checks.mjs'

const RESULTS = 'outbox/venue-source-results-latest.json'
const CACHE = 'outbox/venue-source-cache.json'
const OUT_JSON = 'outbox/venue-lead-whole-diff-2026-11-09.json'
const OUT_EXTRACTS = 'outbox/venue-lead-whole-extracts-2026-11-09.json'
const UNCHANGED = ['lat', 'lon', 'zone', 'qid', 'agreeing', 'via']

/** One map of name to row, status attached. A name seen twice is an error: the comparison keys on it. */
export const rowsOf = results => {
  const m = new Map()
  for (const [status, list] of [['accepted', results.accepted], ['review', results.review]]) {
    for (const r of list) {
      if (m.has(r.name)) throw new Error(`duplicate row name ${JSON.stringify(r.name)}`)
      m.set(r.name, { ...r, status })
    }
  }
  return m
}

const pick = r => ({ status: r.status, roof: r.roof ?? null, basis: r.roofBasis ?? null, why: r.why ?? null })
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** What changed between two results files. */
export const compare = (oldR, newR) => {
  const o = rowsOf(oldR), n = rowsOf(newR)
  const both = [...o.keys()].filter(k => n.has(k))
  const changed = [], basisOnly = [], moved = []
  for (const k of both) {
    const a = o.get(k), b = n.get(k)
    const field = UNCHANGED.filter(f => !same(a[f], b[f]))
    if (field.length) moved.push({ name: k, fields: field })
    const kind = a.status !== b.status ? `${a.status} -> ${b.status}`
      : (a.roof ?? null) !== (b.roof ?? null) ? `roof ${a.roof ?? 'none'} -> ${b.roof ?? 'none'}`
      : (a.why ?? null) !== (b.why ?? null) ? 'review reason changed' : null
    if (kind) changed.push({ name: k, kind, before: pick(a), after: pick(b) })
    else if ((a.roofBasis ?? null) !== (b.roofBasis ?? null)) basisOnly.push({ name: k, before: pick(a), after: pick(b) })
  }
  return {
    oldRows: o.size, newRows: n.size, compared: both.length,
    onlyOld: [...o.keys()].filter(k => !n.has(k)), onlyNew: [...n.keys()].filter(k => !o.has(k)),
    moved, changed, basisOnly,
  }
}

/** The whole extract the roof was read from, found through the cached article title; null if the cache has none. */
export const extractOf = (row, cache) => {
  const art = cache[`wd-roof|${row.qid}`]?.result?.value?.results?.bindings?.[0]?.article?.value
  const title = art?.split('/wiki/')[1]
  const hit = title ? cache[`wp-summary|${title}`] : null
  return hit?.result?.ok ? hit.result.value : null
}

/** Every row that has a whole extract: what the old first sentence said, what the paragraph says, and the row before and after. */
export const extractRows = (oldR, newR, cache) => {
  const o = rowsOf(oldR), n = rowsOf(newR), out = []
  for (const [name, row] of n) {
    const extract = extractOf(row, cache)
    if (extract === null || !o.has(name)) continue
    const a = o.get(name)
    out.push({ name, firstSentence: a.lead ?? null, extract, before: pick(a), after: pick(row) })
  }
  return out
}

export const report = (c, rev, newRev) => {
  const out = []
  out.push(`old results: git ${rev}; new results: ${newRev ? `git ${newRev}` : 'the working tree'}`)
  out.push(`COVERAGE: compared ${c.compared} of ${c.oldRows} old rows and ${c.newRows} new rows, by name; only in old ${c.onlyOld.length}, only in new ${c.onlyNew.length}`)
  out.push(`PREMISE (only the lead changes): lat, lon, zone, qid, agreeing and via equal on ${c.compared - c.moved.length} of ${c.compared} rows; moved: ${c.moved.length}`)
  c.moved.forEach(m => out.push(`  MOVED ${m.name}: ${m.fields.join(', ')}`))
  const byKind = {}
  for (const r of c.changed) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1
  out.push(`CHANGED (status, roof or review reason): ${c.changed.length} of ${c.compared}; same status and roof, different basis only: ${c.basisOnly.length}`)
  for (const [k, v] of Object.entries(byKind).sort()) out.push(`  ${k.padEnd(28)} ${v}`)
  out.push('')
  for (const r of c.changed) {
    out.push(`${r.name}   [${r.kind}]`)
    out.push(`    before  ${r.before.status}, roof ${r.before.roof}: ${r.before.why ?? r.before.basis}`)
    out.push(`    after   ${r.after.status}, roof ${r.after.roof}: ${r.after.why ?? r.after.basis}`)
  }
  if (c.basisOnly.length) {
    out.push('', 'same status and roof, different basis:')
    for (const r of c.basisOnly) out.push(`  ${r.name}: "${r.before.basis}" -> "${r.after.basis}"`)
  }
  return out.join('\n')
}

const selfTest = () => {
  const { check, summarize } = createChecks()
  const row = (name, o = {}) => ({ name, lat: 1, lon: 2, zone: 'UTC', qid: 'Q1', agreeing: ['wikidata', 'nominatim'], roof: 'open', roofBasis: 'inferred: the lead names no roof', lead: 'old lead', ...o })
  const base = () => ({
    accepted: [row('Same'), row('RoofFlip'), row('ToReview'), row('LeadOnly'), row('BasisOnly'), row('Moved'), row('GoneNew')],
    review: [row('ToAccepted', { roof: null, why: 'roof: the lead names no roof' }), row('ReasonOnly', { roof: null, why: 'roof: reason A' })],
  })
  const o = base()
  const n = base()
  n.accepted = n.accepted.filter(r => r.name !== 'GoneNew')
  n.accepted.push(row('OnlyNew'))
  n.accepted.find(r => r.name === 'RoofFlip').roof = 'dome'
  n.accepted.find(r => r.name === 'LeadOnly').lead = 'a much longer new lead, a whole paragraph'
  n.accepted.find(r => r.name === 'BasisOnly').roofBasis = 'wikipedia lead'
  n.accepted.find(r => r.name === 'Moved').lat = 9
  const ts = n.accepted.splice(n.accepted.findIndex(r => r.name === 'ToReview'), 1)[0]
  n.review.push({ ...ts, roof: null, why: 'roof: new reason' })
  const ta = n.review.splice(n.review.findIndex(r => r.name === 'ToAccepted'), 1)[0]
  n.accepted.push({ ...ta, roof: 'dome', roofBasis: 'wikipedia lead', why: undefined })
  n.review.find(r => r.name === 'ReasonOnly').why = 'roof: reason B'
  const c = compare(o, n)
  const kinds = Object.fromEntries(c.changed.map(r => [r.name, r.kind]))
  check('a roof flip is a change, with both roofs named', kinds.RoofFlip === 'roof open -> dome', JSON.stringify(kinds))
  check('accepted to review is a change', kinds.ToReview === 'accepted -> review', JSON.stringify(kinds))
  check('review to accepted is a change', kinds.ToAccepted === 'review -> accepted', JSON.stringify(kinds))
  check('a new review reason alone is a change', kinds.ReasonOnly === 'review reason changed', JSON.stringify(kinds))
  check('a longer lead alone is NOT a change', !('LeadOnly' in kinds) && !c.basisOnly.some(r => r.name === 'LeadOnly'))
  check('a different basis with the same status and roof is listed apart, not as a change', c.basisOnly.map(r => r.name).join() === 'BasisOnly' && !('BasisOnly' in kinds))
  check('an untouched row is in neither list', !('Same' in kinds) && !c.basisOnly.some(r => r.name === 'Same'))
  check('a moved coordinate is named, as the premise says nothing else changes', c.moved.length === 1 && c.moved[0].name === 'Moved' && c.moved[0].fields.join() === 'lat')
  check('a row on one side only is named on that side', c.onlyOld.join() === 'GoneNew' && c.onlyNew.join() === 'OnlyNew')
  check('the coverage line carries both denominators and the one-sided rows', /compared 8 of 9 old rows and 9 new rows.*only in old 1, only in new 1/.test(report(c, 'x')), report(c, 'x').split('\n')[1])
  let threw = false
  try { rowsOf({ accepted: [row('Twice')], review: [row('Twice')] }) } catch { threw = true }
  check('a name on two rows is refused, because the comparison keys on it', threw)
  const cache = { 'wd-roof|Q1': { result: { value: { results: { bindings: [{ article: { value: 'https://en.wikipedia.org/wiki/Some_Stadium' } }] } } } }, 'wp-summary|Some_Stadium': { result: { ok: true, value: 'Whole extract.' } } }
  check('the whole extract is found through the cached article title', extractOf({ qid: 'Q1' }, cache) === 'Whole extract.')
  check('...and is null, not a guess, when the cache has none', extractOf({ qid: 'Q2' }, cache) === null && extractOf({ qid: 'Q1' }, { ...cache, 'wp-summary|Some_Stadium': undefined }) === null)
  const ex = extractRows({ accepted: [row('A'), row('B', { qid: 'Q9' })], review: [] }, { accepted: [row('A', { roof: 'dome' }), row('B', { qid: 'Q9' }), row('C')], review: [] }, cache)
  check('an extract row carries the old first sentence, the paragraph, and the row before and after', ex.length === 1 && ex[0].name === 'A' && ex[0].extract === 'Whole extract.' && ex[0].firstSentence === 'old lead' && ex[0].before.roof === 'open' && ex[0].after.roof === 'dome', JSON.stringify(ex))
  check('a row with no extract in the cache, or no old row, is left out rather than filled', !ex.some(r => r.name === 'B' || r.name === 'C'))
  finish(summarize())
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--selftest')) selfTest()
  else {
    const rev = process.argv[2], newRev = process.argv[3]
    if (!rev || rev.startsWith('--')) { console.error('usage: node outbox/venue-lead-whole-diff-2026-11-09.mjs OLD_REV [NEW_REV] | --selftest'); process.exit(2) }
    const read = (at, p) => at ? JSON.parse(execSync(`git show ${at}:${p}`, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })) : JSON.parse(readFileSync(p, 'utf8'))
    const oldR = read(rev, RESULTS)
    const newR = read(newRev, RESULTS)
    const cache = read(newRev, CACHE)
    const c = compare(oldR, newR)
    const n = rowsOf(newR)
    const withExtract = c.changed.map(r => ({ ...r, extract: extractOf(n.get(r.name), cache) }))
    writeFileSync(OUT_JSON, JSON.stringify({ oldRev: rev, newRev: newRev ?? 'working tree', oldRun: oldR.run, newRun: newR.run, ...c, changed: withExtract }, null, 1) + '\n')
    const ex = extractRows(oldR, newR, cache)
    writeFileSync(OUT_EXTRACTS, '[\n' + ex.map(r => JSON.stringify(r)).join(',\n') + '\n]\n')
    console.log(report(c, rev, newRev))
    console.log(`extracts written for ${ex.length} of ${c.compared} rows (the rest have no article, or no cached summary)`)
    const missing = withExtract.filter(r => r.extract === null).map(r => r.name)
    console.log(`\nwhole extract found in the cache for ${withExtract.length - missing.length} of ${withExtract.length} changed rows${missing.length ? `; none for: ${missing.join('; ')}` : ''}`)
    if (c.onlyOld.length || c.onlyNew.length || c.moved.length) process.exit(1)
  }
}
