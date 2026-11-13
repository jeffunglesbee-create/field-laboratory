// Task 5, Step A, runner read (the owner's "Do the runner first", Friday 2026-11-13 08:31 ET): what the 396 Wikidata items' own statements say about a roof,
// judged by criteria 1 to 7 of docs/CC-CMD-2026-11-09-venue-review-remainder.md ("Step A, runner read"), which were written in commit 02cdbf53 before any data
// existed and are not edited here. Rule 89: the artifact is this script's printed result and the record it generates.
//
// It reads committed files and nothing else, and uses no network and writes nothing (check G6 holds its own imports to that):
//   outbox/venue-wikidata-statements-probe.json   the run's own evidence (run 43439848251, committed by the runner as d600db24): every statement of each of the
//                                                 396 items, with rank and qualifiers, and the English label of every value and property
//   outbox/venue-wikidata-statements-probe.txt    the probe's own report of that run (a tie, not an input to the verdict)
//   outbox/venue-source-cache.json                the sourcing run's cache: the 396 `wd-roof|<QID>` keys (the population) and what P5624 answered for each
//   outbox/venue-source-results-latest.json       the run's rows: the roof the lead or the infobox decides, and the 9 review names whose roof is unsettled
//   outbox/venue-review-counts-2026-11-12.md      Step 1's record, which counts those 9 names (a tie)
//   outbox/venue-wikidata-roof-step-a-2026-11-12.md   Step A's record, which prints the digests the four protected files must still carry (criterion 7)
//   scripts/venue-source.mjs                      the sourcing rule's own `classifyRoof`, imported and not retyped
// Typed in this file, and what holds each to the data: ITEMS (the count Task 5 states for the cache's wd-roof keys; check R1 holds the cache to it), CONTROL (the
// two ids criterion 1 names; checks K1 to K3 hold them to the read), and READING (the reading of each candidate, below). Every other number is computed.
//
// THE READING. Criterion 3 lets a candidate whose value is a roof word by accident (a name, an address) be named and set aside by reading the item. READING is
// that reading, made after the data was seen, so it is held three ways: every candidate must have an entry and every entry a candidate (checks C3b, C3c); the
// evidence for each is printed, so a reader can see the item and the statement; and the verdict is computed a second time with NO candidate set aside, the case
// most favourable to a go, and check S1 requires the two to agree. A verdict that changed with the reading would be a judgement, and S1 would say so.
//
// Usage, from the repository root:
//   node outbox/venue-wikidata-statements-step-a-2026-11-13.mjs                the report; exits 1 unless every check holds (the verdict is printed either way)
//   node outbox/venue-wikidata-statements-step-a-2026-11-13.mjs record         the record the owner reads (stdout)
//   node outbox/venue-wikidata-statements-step-a-2026-11-13.mjs --self-test    the same judgement on doctored copies of its inputs, each caught by the check or number aimed at it

import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { classifyRoof } from '../scripts/venue-source.mjs'
import { finish, isMain } from '../scripts/checks.mjs'

export const PROBE = 'outbox/venue-wikidata-statements-probe.json'
export const PROBE_TXT = 'outbox/venue-wikidata-statements-probe.txt'
export const CACHE = 'outbox/venue-source-cache.json'
export const RESULTS = 'outbox/venue-source-results-latest.json'
export const COUNTS = 'outbox/venue-review-counts-2026-11-12.md'
export const STEP_A_RECORD = 'outbox/venue-wikidata-roof-step-a-2026-11-12.md'
/** The items the run reads: Task 5's own count of the `wd-roof|` keys of the committed cache. */
export const ITEMS = 396
/** The files the read must leave exactly as they are (criterion 7); Step A's record prints their digests. */
export const PROTECTED = [RESULTS, CACHE, 'src/Venues.fs', 'scripts/venue-source.mjs']
/** Criterion 1: the item the saved backlinks pages say links to "retractable roof", and that item. */
export const CONTROL = { qid: 'Q1410402', value: 'Q7316894' }
/** The wider word list the infobox probe used. A value that matches only this lists and counts for nothing (criterion 3). */
export const WIDER = /roof|dome|skylit|indoor|covered|enclosed|retractable|open-air/i

const RANKS = new Set(['normal', 'preferred', 'deprecated'])
const ENTITY = new Set(['wikibase-item', 'wikibase-property'])
const TEXT = new Set(['string', 'external-id', 'commonsMedia', 'url', 'monolingualtext'])
const OTHER = new Set(['quantity', 'time', 'globe-coordinate'])

/**
 * The reading of each candidate: keep = true when its value says what roof the item has, false when the roof word is there by accident. Keyed `where|property|qualifier`.
 * Made by reading the items named in each reason, after the data was seen; see the header for how it is held.
 */
export const READING = {
  'main|P1552|': { keep: true, why: 'the value is a roof class: the statement says the item "has characteristic" retractable roof' },
  'main|P18|': { keep: false, why: 'a Commons file name: "Carrier Dome - New Roof 2021 (Jimhoward03).jpg" is the title of a photo, and "Dome" is a word of this building\'s names (its label is "JMA Wireless Dome", its Commons category "Carrier Dome")' },
  'main|P154|': { keep: false, why: 'a Commons file name: "JMA Wireless Dome logo.png" holds the item\'s own label' },
  'main|P373|': { keep: false, why: 'a Commons category name: "Carrier Dome" is the building\'s own category, a name and not a roof' },
  'main|P856|': { keep: false, why: 'a web address: its path holds the item\'s own name, "jma-wireless-dome"' },
  'main|P3417|': { keep: false, why: 'an identifier: Quora topic ids made of the building\'s names, "JMA-Wireless-Dome" and "Carrier-Dome"' },
  'main|P5775|': { keep: false, why: 'a Commons file name: "The Dome New Orleans Man Trip.jpg" is the title of a photo; the item is Caesars Superdome' },
  'qualifier|P466|P155': { keep: false, why: 'a qualifier on an occupant statement whose value is another venue\'s name: the Rams "follows" The Dome at America\'s Center, the Colts "follows" RCA Dome; it is no statement about this item\'s roof' },
}

// --- reading the probe ----------------------------------------------------------------------------------------------------------

/** The text a value is read as: an item value's English label, a string or monolingual text itself (a monolingual text is stored `language:text`, and a language code cannot match a roof pattern); null for what has no text to read, including an item with no English label. */
export const textOf = (probe, p, v) => {
  if (v === null || v === undefined) return null
  const dt = probe.datatypes[p]
  if (ENTITY.has(dt)) return probe.labels[v]?.l ?? null
  if (TEXT.has(dt)) return v
  return null
}

/** The statements of one property that count: a deprecated statement is not a witness, and where there is a preferred statement only the preferred ones count (what a `wdt:` read returns). With `ranked` false every statement counts, which only the robustness check S1 uses. */
export const counting = (item, p, ranked = true) => {
  if (!ranked) return item.statements.filter(s => s.p === p)
  const live = item.statements.filter(s => s.p === p && s.r !== 'deprecated')
  const preferred = live.filter(s => s.r === 'preferred')
  return preferred.length ? preferred : live
}

const closed = cls => cls === 'retractable' || cls === 'dome'
const byKey = (a, b) => a.p.localeCompare(b.p, 'en', { numeric: true }) || String(a.qp).localeCompare(String(b.qp), 'en', { numeric: true }) || a.where.localeCompare(b.where)

/** Every (where, property, qualifier) with the values the counting statements carry and, for each value, the items that carry it and the class `classify` gives its text. */
export const scan = (probe, classify, ranked = true) => {
  const keys = new Map()
  const note = (where, p, qp, id, v, mainV) => {
    const text = textOf(probe, qp ?? p, v)
    const key = `${where}|${p}|${qp ?? ''}`
    let k = keys.get(key)
    if (!k) { k = { key, where, p, qp: qp ?? null, values: new Map() }; keys.set(key, k) }
    let e = k.values.get(String(v))
    if (!e) { e = { v, text, cls: text === null ? null : classify(text), items: new Set(), via: [] }; k.values.set(String(v), e) }
    e.items.add(id)
    if (qp) e.via.push({ id, mainV })
  }
  for (const [id, it] of Object.entries(probe.items)) {
    if (it?.ok !== true || !Array.isArray(it.statements)) continue
    for (const p of new Set(it.statements.map(s => s.p))) {
      for (const s of counting(it, p, ranked)) {
        if (s.v !== null) note('main', p, null, id, s.v, null)
        for (const [qp, qv] of s.q ?? []) if (qv !== null) note('qualifier', p, qp, id, qv, s.v)
      }
    }
  }
  return keys
}

const wellFormed = s => s && typeof s === 'object' && /^P[1-9]\d*$/.test(s.p) && RANKS.has(s.r) && (typeof s.v === 'string' || (s.v === null && (s.k === 'somevalue' || s.k === 'novalue')))
  && (s.q === undefined || (Array.isArray(s.q) && s.q.every(q => Array.isArray(q) && /^P[1-9]\d*$/.test(q[0]) && (typeof q[1] === 'string' || q[1] === null))))

const parseDigests = text => Object.fromEntries([...(text ?? '').matchAll(/^\|\s*`([^`]+)`\s*\|\s*`([0-9a-f]{64})`\s*\|/gm)].map(m => [m[1], m[2]]))
const ordered = ids => [...ids].sort((a, b) => (a[0] === 'Q' ? 0 : 1) - (b[0] === 'Q' ? 0 : 1) || Number(a.slice(1)) - Number(b.slice(1)))

// --- the judgement ---------------------------------------------------------------------------------------------------------------

export function analyse(inp) {
  const checks = []
  const check = (id, name, pass, detail = '') => checks.push({ id, name, pass: Boolean(pass), detail: pass ? '' : String(detail) })
  const num = {}
  const classify = inp.classifyRoof ?? classifyRoof
  const P = inp.probe
  const shaped = Boolean(P && typeof P === 'object' && P.items && typeof P.items === 'object' && P.labels && typeof P.labels === 'object' && P.datatypes && typeof P.datatypes === 'object'
    && Array.isArray(P.labelIds) && P.control && typeof P.control === 'object')
  check('E1', 'the probe file has the members this reads (items, labels, datatypes, labelIds, control)', shaped, 'a member is missing or of the wrong type')
  if (!shaped) return { checks, num, verdict: { kind: 'INVALID', text: 'INVALID. The probe file is not in the shape this reads, so nothing was judged.' }, view: null }

  // --- criterion 2: every one of the 396 items is read, every value has its label ---------------------------------------------------
  const keys = Object.keys(inp.cache ?? {}).filter(k => k.startsWith('wd-roof|'))
  const qids = keys.map(k => k.slice('wd-roof|'.length))
  const ids = Object.keys(P.items)
  const inCache = new Set(qids), inRead = new Set(ids)
  const lacking = qids.filter(q => !inRead.has(q)), extra = ids.filter(q => !inCache.has(q))
  const read = ids.filter(id => P.items[id]?.ok === true && Array.isArray(P.items[id].statements))
  const notRead = ids.filter(id => !read.includes(id))
  num.items = qids.length
  num.records = ids.length
  num.read = read.length
  check('R1', `the read holds a record for each of the ${ITEMS} items the cache holds a wd-roof answer for, and for no other (cache keys ${qids.length}, records ${ids.length}; lacking ${lacking.length}, extra ${extra.length})`,
    qids.length === ITEMS && ids.length === ITEMS && !lacking.length && !extra.length, `lacking ${lacking.slice(0, 5).join(', ')}; extra ${extra.slice(0, 5).join(', ')}; cache keys ${qids.length}`)
  check('R2', `every record is a read: no item is NOT READ (read ${read.length} of ${ids.length})`, notRead.length === 0, notRead.slice(0, 5).map(id => `${id}: ${P.items[id]?.why}`).join('; '))
  const wrongId = read.filter(id => P.items[id].id !== id && P.items[id].redirectedTo !== P.items[id].id)
  num.redirected = read.filter(id => P.items[id].redirectedTo).length
  check('R4', `each record is for the item asked, or records a redirect to the item that answered (checked ${read.length - wrongId.length} of ${read.length}; ${num.redirected} redirected)`, wrongId.length === 0, wrongId.slice(0, 5).join(', '))
  const stmts = read.flatMap(id => P.items[id].statements.map(s => ({ id, s })))
  const malformed = stmts.filter(x => !wellFormed(x.s))
  num.statements = stmts.length
  num.ranks = Object.fromEntries([...RANKS].map(r => [r, stmts.filter(x => x.s.r === r).length]))
  num.qualifierValues = stmts.reduce((n, x) => n + (x.s.q?.length ?? 0), 0)
  check('R6', `every statement reads as a property, a rank the analysis knows (normal, preferred, deprecated) and a value or a recorded somevalue or novalue (checked ${stmts.length - malformed.length} of ${stmts.length})`,
    malformed.length === 0, malformed.slice(0, 3).map(x => `${x.id} ${JSON.stringify(x.s).slice(0, 120)}`).join('; '))
  const used = new Set(stmts.flatMap(x => [x.s.p, ...(x.s.q ?? []).map(q => q[0])]))
  const unknownDt = [...used].filter(p => !(ENTITY.has(P.datatypes[p]) || TEXT.has(P.datatypes[p]) || OTHER.has(P.datatypes[p])))
  num.properties = used.size
  check('R7', `every property in use has a datatype this analysis knows how to read: an item, a text or something that is no text (checked ${used.size - unknownDt.length} of ${used.size})`,
    unknownDt.length === 0, unknownDt.slice(0, 5).map(p => `${p}: ${P.datatypes[p]}`).join(', '))
  const need = new Set(used)
  for (const x of stmts) {
    if (ENTITY.has(P.datatypes[x.s.p]) && x.s.v !== null) need.add(x.s.v)
    for (const [qp, qv] of x.s.q ?? []) if (ENTITY.has(P.datatypes[qp]) && qv !== null) need.add(qv)
  }
  const unanswered = [...need].filter(id => !P.labels[id] || P.labels[id].bad)
  const gone = [...need].filter(id => P.labels[id]?.missing === true)
  const noEnglish = [...need].filter(id => P.labels[id] && P.labels[id].l === null)
  num.labelsNeeded = need.size
  num.labelsUnanswered = unanswered.length
  num.labelsGone = gone.length
  num.noEnglish = noEnglish.length
  check('R3', `every item that is a value, and every property, has an answered label record (answered ${need.size - unanswered.length} of ${need.size}; ${gone.length} missing on Wikidata, ${noEnglish.length} with no English label, named by property in the record)`,
    unanswered.length === 0, ordered(unanswered).slice(0, 8).join(', '))
  const labelFailures = P.labelFailures ?? [], dtConflicts = P.dtConflicts ?? []
  check('R5', 'the probe records a complete run: complete, no fatal error, no failed labels request, no property with two datatypes',
    P.complete === true && P.fatal === null && labelFailures.length === 0 && dtConflicts.length === 0, `complete ${P.complete}, fatal ${JSON.stringify(P.fatal)}, label failures ${labelFailures.length}, datatype conflicts ${dtConflicts.length}`)
  const rm = /items read (\d+) of (\d+)/.exec(inp.report ?? ''), sm = /statements (\d+) on the (\d+) items read/.exec(inp.report ?? '')
  check('T1', `the probe's own report and the committed read agree on what was read (report: items read ${rm?.[1]} of ${rm?.[2]}, statements ${sm?.[1]}; recomputed: ${read.length} of ${ITEMS}, ${stmts.length})`,
    Boolean(rm && sm) && Number(rm[1]) === read.length && Number(rm[2]) === ITEMS && Number(sm[1]) === stmts.length && Number(sm[2]) === read.length, 'the report and the file are not the same read')

  // --- criterion 1: the control -----------------------------------------------------------------------------------------------------
  const ctl = P.items[CONTROL.qid]
  const found = []
  if (ctl?.ok === true) for (const s of ctl.statements ?? []) {
    if (s.v === CONTROL.value) found.push({ where: 'main', p: s.p, qp: null, rank: s.r })
    for (const [qp, qv] of s.q ?? []) if (qv === CONTROL.value) found.push({ where: 'qualifier', p: s.p, qp, rank: s.r })
  }
  const f0 = found[0]
  const ctlLabel = P.labels[CONTROL.value]?.l ?? null
  check('K1', `criterion 1: the statements read for ${CONTROL.qid} carry ${CONTROL.value}${f0 ? `, under ${f0.p} "${P.labels[f0.p]?.l}" (${f0.where}${f0.qp ? `, qualifier ${f0.qp}` : ''}, rank ${f0.rank})` : ''}`,
    ctl?.ok === true && found.length >= 1, ctl?.ok === true ? 'not found in any main statement or qualifier' : 'the control item was not read')
  check('K2', `the control's value reads as a roof through the rule's own classifier, like every other value: "${ctlLabel}" is ${classify(ctlLabel ?? '')}`, classify(ctlLabel ?? '') === 'retractable', `"${ctlLabel}"`)
  check('K3', `the control the probe recorded is the one criterion 1 names, and the item read is it (${P.control.qid}, ${P.control.value}, "${ctl?.label}")`,
    P.control.qid === CONTROL.qid && P.control.value === CONTROL.value && /mauroy/i.test(ctl?.label ?? ''), `recorded ${P.control.qid} ${P.control.value}`)
  num.controlStatements = ctl?.n ?? 0

  // --- criterion 3 and 4: candidates, and what their values mean by the rule's own patterns --------------------------------------------
  const scanned = scan(P, classify)
  const cands = [...scanned.values()].filter(k => [...k.values.values()].some(e => closed(e.cls))).sort(byKey)
  const wider = []
  for (const k of scanned.values()) for (const e of k.values.values()) if (e.text !== null && e.cls === 'open' && WIDER.test(e.text)) wider.push({ key: k.key, p: k.p, qp: k.qp, text: e.text, items: e.items })
  num.widerOnly = wider.length
  const lacksInfo = p => !(P.labels[p]?.l && P.labels[p]?.d && P.datatypes[p])
  const uninformed = cands.filter(c => [c.p, c.qp].filter(Boolean).some(lacksInfo))
  check('C3a', `every candidate's property (and qualifier property) has an English label, a description and a datatype to list (checked ${cands.length - uninformed.length} of ${cands.length} candidates)`, uninformed.length === 0, uninformed.map(c => c.key).join(', '))
  const unread = cands.filter(c => !READING[c.key])
  num.accounted = cands.length - unread.length
  check('C3b', `every candidate has been read and has a disposition (accounted for ${cands.length - unread.length} of ${cands.length})`, unread.length === 0, unread.map(c => c.key).join(', '))
  const stale = Object.keys(READING).filter(k => !cands.some(c => c.key === k))
  check('C3c', `every disposition in READING is for a candidate the data has (${Object.keys(READING).length - stale.length} of ${Object.keys(READING).length})`, stale.length === 0, stale.join(', '))
  check('M1', "criterion 4: the sourcing rule's own classifier reads a roof class as that class and a value that names no roof as none", classify('retractable roof') === 'retractable' && classify('domed stadium') === 'dome' && classify('tourist attraction') === 'open',
    `retractable roof: ${classify('retractable roof')}; domed stadium: ${classify('domed stadium')}; tourist attraction: ${classify('tourist attraction')}`)

  // --- criteria 5 and 6: agreement with the rows the lead or the infobox decides, and the 9 names ------------------------------------------
  const rows = [...(inp.results?.accepted ?? []), ...(inp.results?.review ?? [])]
  const rowsByQid = new Map()
  for (const r of rows) if (r.qid) { if (!rowsByQid.has(r.qid)) rowsByQid.set(r.qid, []); rowsByQid.get(r.qid).push(r) }
  const decided = r => r.roofBasis === 'wikipedia lead' || /^infobox roof/.test(r.roofBasis ?? '')
  const nine = (inp.results?.review ?? []).filter(r => /^roof:/.test(r.why ?? ''))
  const cm = /\|\s*roof not settled \(position agreed\)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|/.exec(inp.counts ?? '')
  num.nine = nine.length
  num.nineCounted = cm ? Number(cm[1]) : null
  num.nineGames = cm ? Number(cm[2]) : null
  num.nineDays = cm ? Number(cm[3]) : null
  check('N1', `the review rows whose reason begins "roof:" are the ${cm?.[1] ?? '?'} names Step 1's record counts as "roof not settled (position agreed)" (${nine.length})`, Boolean(cm) && nine.length === Number(cm[1]), `${nine.length} computed; the record says ${cm?.[1]}`)
  const nineRead = nine.filter(r => r.qid && P.items[r.qid]?.ok === true)
  // Information only, no criterion: the item's own English description, read by the same patterns (criterion 3 reads statements, and a description is not one).
  const descOf = id => P.items[id]?.description ?? ''
  const descClosed = read.filter(id => closed(classify(descOf(id))))
  const descRows = descClosed.flatMap(id => (rowsByQid.get(id) ?? []).filter(decided).map(r => ({ id, name: r.name, row: r.roof, cls: classify(descOf(id)), agree: classify(descOf(id)) === r.roof })))
  num.descRoof = descClosed.length
  num.descDecidedRows = descRows.length
  num.descAgree = descRows.filter(x => x.agree).length
  num.descNine = nine.filter(r => closed(classify(descOf(r.qid)))).length
  num.nineRead = nineRead.length
  check('N2', `each of the ${nine.length} names is a distinct item whose statements were read (read ${nineRead.length} of ${nine.length}), so "decides none" is not "was not read"`,
    nine.length > 0 && nineRead.length === nine.length && new Set(nine.map(r => r.qid)).size === nine.length, `${nine.filter(r => !(r.qid && P.items[r.qid]?.ok === true)).map(r => r.name).join(', ')}`)

  const describeCand = k => {
    const reading = READING[k.key] ?? null
    const wv = [...k.values.values()].filter(e => closed(e.cls))
    const witnessItems = new Map()
    for (const e of wv) for (const id of e.items) { if (!witnessItems.has(id)) witnessItems.set(id, new Set()); witnessItems.get(id).add(e.cls) }
    const met = []
    for (const [id, cl] of witnessItems) for (const r of (rowsByQid.get(id) ?? []).filter(decided)) met.push({ id, name: r.name, row: r.roof, basis: r.roofBasis, cls: [...cl], agree: cl.size === 1 && cl.has(r.roof) })
    const disagree = met.filter(m => !m.agree)
    const decidesNine = nine.filter(r => witnessItems.get(r.qid)?.size === 1)
    const carrying = new Set([...k.values.values()].flatMap(e => [...e.items]))
    const passes = witnessItems.size >= 1 && met.length >= 1 && disagree.length === 0 && decidesNine.length >= 1
    const evidence = wv.flatMap(e => [...e.items].map(id => ({ id, name: P.items[id]?.label ?? null, text: e.text, cls: e.cls, v: e.v, main: k.qp ? P.labels[e.via.find(x => x.id === id)?.mainV]?.l ?? null : null })))
    return { ...k, reading, keep: reading?.keep === true, wv, witnessItems, met, agree: met.length - disagree.length, disagree, decidesNine, carrying, passes, zeroOfZero: witnessItems.size >= 1 && met.length === 0, evidence }
  }
  const described = cands.map(describeCand)
  // the same judgement with every statement counted whatever its rank and no candidate set aside: the case most favourable to a go
  const scannedAny = scan(P, classify, false)
  const candsAny = [...scannedAny.values()].filter(k => [...k.values.values()].some(e => closed(e.cls))).sort(byKey)
  const passingAnyRank = candsAny.map(describeCand).filter(c => c.passes)
  const closedValues = m => [...m.values()].reduce((n, k) => n + [...k.values.values()].filter(e => closed(e.cls)).length, 0)
  num.closedValues = closedValues(scanned)
  num.closedValuesAnyRank = closedValues(scannedAny)
  num.candidatesAnyRank = candsAny.length
  const retained = described.filter(c => c.keep)
  const setAside = described.filter(c => c.reading && !c.keep)
  const passing = retained.filter(c => c.passes)
  const passingAll = described.filter(c => c.passes)
  num.candidates = cands.length
  num.retained = retained.length
  num.setAside = setAside.length
  num.retainedWitnessItems = new Set(retained.flatMap(c => [...c.witnessItems.keys()])).size
  num.retainedDecidedRows = retained.reduce((n, c) => n + c.met.length, 0)
  num.retainedAgree = retained.reduce((n, c) => n + c.agree, 0)
  num.retainedDisagree = retained.reduce((n, c) => n + c.disagree.length, 0)
  num.retainedZeroOfZero = retained.filter(c => c.zeroOfZero).length
  num.nineDecided = new Set(retained.flatMap(c => c.decidesNine.map(r => r.qid))).size
  num.nineDecidedAll = new Set(described.flatMap(c => c.decidesNine.map(r => r.qid))).size
  num.passing = passing.length
  num.passingAll = passingAll.length
  num.passingAnyRank = passingAnyRank.length
  const go = n => (n ? 'GO' : 'NO-GO')
  check('S1', `the verdict does not depend on the reading or on the rank rule: as read ${go(passing.length)}; with no candidate set aside ${go(passingAll.length)}; with none set aside and every statement counted whatever its rank ${go(passingAnyRank.length)}`,
    (passing.length > 0) === (passingAll.length > 0) && (passingAll.length > 0) === (passingAnyRank.length > 0),
    `${passing.length} candidates pass as read, ${passingAll.length} if none is set aside (${passingAll.map(c => c.key).join(', ')}), ${passingAnyRank.length} if none is set aside and every rank counts (${passingAnyRank.map(c => c.key).join(', ')})`)

  // --- cross-check of the property the rule reads today -----------------------------------------------------------------------------------
  const p5624Items = ids.filter(id => (P.items[id]?.statements ?? []).some(s => s.p === 'P5624' || (s.q ?? []).some(q => q[0] === 'P5624')))
  const cacheRoof = keys.filter(k => inp.cache[k]?.result?.value?.results?.bindings?.[0]?.roofLabel).map(k => k.slice('wd-roof|'.length))
  num.p5624Items = p5624Items.length
  num.cacheRoofItems = cacheRoof.length
  check('T2', `the property the rule reads today, P5624, is on as many items' own statements as the cache's query found a roof for, the same items (read ${p5624Items.length} of ${ITEMS}; cache ${cacheRoof.length} of ${ITEMS})`,
    p5624Items.length === cacheRoof.length && p5624Items.every(q => cacheRoof.includes(q)), `read: ${p5624Items.join(', ')}; cache: ${cacheRoof.join(', ')}`)

  // --- criterion 7: nothing the read must leave alone has changed; and this script can neither write nor reach a network --------------------
  const recorded = parseDigests(inp.record)
  const same = PROTECTED.filter(f => inp.digests?.[f] && inp.digests[f] === recorded[f])
  num.protectedSame = same.length
  check('G7', `criterion 7: the four protected files carry the digests Step A's record printed (same ${same.length} of ${PROTECTED.length})`, same.length === PROTECTED.length, PROTECTED.filter(f => !same.includes(f)).join(', '))
  const ALLOWED = { 'node:fs': '{ readFileSync }', 'node:crypto': '{ createHash }' }
  const imports = [...(inp.source ?? '').matchAll(/^import\s+(.+?)\s+from\s+'([^']+)'/gm)].map(i => ({ names: i[1].replace(/\s+/g, ' '), from: i[2] }))
  const badImports = imports.filter(i => i.from in ALLOWED ? i.names !== ALLOWED[i.from] : !/^\.\.\/scripts\/(venue-source|checks)\.mjs$/.test(i.from))
  const dynamic = /\bimport\(|\brequire\(/.test(inp.source ?? '')
  num.imports = imports.length
  check('G6', `the script's own imports can read and hash but not write or reach a network (checked ${imports.length - badImports.length} of ${imports.length} imports)`,
    imports.length > 0 && !badImports.length && !dynamic, `${badImports.map(i => `${i.names} from ${i.from}`).join('; ')}${dynamic ? ' (a dynamic import or require)' : ''}`)

  // --- the verdict by criteria 1 to 7 --------------------------------------------------------------------------------------------------------
  const invalid = ['K1', 'R1', 'R2', 'R3'].filter(id => !checks.find(k => k.id === id)?.pass)
  const rc = retained.map(c => `${c.p}${c.qp ? `[${c.qp}]` : ''} "${P.labels[c.p]?.l}" carries a roof on ${c.witnessItems.size} of ${ITEMS} items, agrees with ${c.agree} of ${c.met.length} rows the lead or the infobox decides, and decides ${c.decidesNine.length} of the ${nine.length} names`).join('; ')
  let verdict
  if (invalid.length) verdict = { kind: 'INVALID', text: `INVALID. Criterion 1 or 2 fails (${invalid.join(', ')}): the defect is to be found from the control item's own answer, fixed and recorded, and the read run again, before any verdict.` }
  else if (passing.length) verdict = { kind: 'GO', text: `GO for the first follow-on (wire a property in place of P5624), by the criteria: ${passing.map(c => c.key).join(', ')} passes criteria 3 to 7. The choice between the follow-ons, or neither, is the owner's.` }
  else verdict = { kind: 'NO-GO', text: `NO-GO. The control holds and the read is complete (items read ${read.length} of ${ITEMS}; labels answered ${need.size - unanswered.length} of ${need.size}). Criterion 3 lists ${cands.length} candidate properties by the rule's own patterns: ${setAside.length} set aside by reading the item (a name, an address, an identifier, another venue's name) and ${retained.length} retained. ${retained.length ? rc : 'No candidate is retained'}. None passes criterion 6: the names decided are ${num.nineDecided} of ${nine.length} by a retained candidate and ${num.nineDecidedAll} of ${nine.length} if no candidate were set aside. The choice between the follow-ons, or neither, is the owner's.` }
  const nineView = nine.map(r => ({ ...r, statements: P.items[r.qid]?.n ?? null, decidedBy: described.filter(c => c.witnessItems.get(r.qid)?.size === 1).map(c => c.key), wider: wider.filter(w => w.items.has(r.qid)).length }))
  return { checks, num, verdict, view: { P, described, retained, setAside, nine: nineView, wider, noEnglish, found, ctl, rows, recorded, need, scanned, descClosed, descRows } }
}

// --- the doctored copies ---------------------------------------------------------------------------------------------------------------------
const clone = o => JSON.parse(JSON.stringify(o))
const anItem = 'Q8507'
const nineName = 'Q870859'
const control = c => c.probe.items[CONTROL.qid]
const roofStatement = c => control(c).statements.find(s => s.p === 'P1552' && s.v === CONTROL.value)
const rowsOf = (c, q) => [...c.results.accepted, ...c.results.review].filter(r => r.qid === q)
const add = (c, q, st) => { c.probe.items[q].statements.push(st); c.probe.items[q].n++; return c }

/**
 * Each doctored copy changes one thing the checks or numbers are meant to notice. `aim` is a check id that must go red, or { number, to }: a number that must move
 * from the control's value to `to`, or { expect(res, control) }: a statement about the result that holds on the doctored copy and not on the control.
 */
export const DOCTORS = [
  { name: 'the probe file has no labels member', aim: 'E1', make: inp => { const c = clone(inp); delete c.probe.labels; return c } },
  { name: 'the control item carries no statement with the control value', aim: 'K1', make: inp => { const c = clone(inp); control(c).statements = control(c).statements.filter(s => s.v !== CONTROL.value); return c } },
  { name: 'the control value reads as no roof', aim: 'K2', make: inp => { const c = clone(inp); c.probe.labels[CONTROL.value].l = 'tourist attraction'; return c } },
  { name: 'the probe recorded another control', aim: 'K3', make: inp => { const c = clone(inp); c.probe.control.qid = 'Q1'; return c } },
  { name: 'an item the cache asks about has no record', aim: 'R1', make: inp => { const c = clone(inp); delete c.probe.items[anItem]; return c } },
  { name: 'an item the cache does not hold is in the read', aim: 'R1', make: inp => { const c = clone(inp); c.probe.items.Q999999999 = clone(c.probe.items[anItem]); c.probe.items.Q999999999.id = 'Q999999999'; return c } },
  { name: 'an item did not read', aim: 'R2', make: inp => { const c = clone(inp); c.probe.items[anItem] = { ok: false, why: 'the id is not in the answer' }; return c } },
  { name: 'an item answers as another id', aim: 'R4', make: inp => { const c = clone(inp); c.probe.items[anItem].id = 'Q1'; return c } },
  { name: 'a value id has no label record', aim: 'R3', make: inp => { const c = clone(inp); if (!c.probe.labels.Q1154710) throw new Error('Q1154710 has no label'); delete c.probe.labels.Q1154710; return c } },
  { name: 'the probe says it did not complete', aim: 'R5', make: inp => { const c = clone(inp); c.probe.complete = false; c.probe.fatal = 'boom'; return c } },
  { name: 'the probe report and the read disagree on the items read', aim: 'T1', make: inp => { const c = clone(inp); c.report = c.report.replace('items read 396 of 396', 'items read 395 of 396'); return c } },
  { name: 'a statement has a rank the analysis does not know', aim: 'R6', make: inp => { const c = clone(inp); c.probe.items[anItem].statements[0].r = 'bogus'; return c } },
  { name: 'a property is in use with a datatype the analysis cannot read', aim: 'R7', make: inp => { const c = clone(inp); c.probe.datatypes.P18 = 'tabular-data'; return c } },
  { name: 'a candidate property has no description', aim: 'C3a', make: inp => { const c = clone(inp); c.probe.labels.P1552.d = null; return c } },
  { name: 'a property no one has read carries a roof word', aim: 'C3b', make: inp => add(clone(inp), CONTROL.qid, { p: 'P646', v: 'Test Dome', r: 'preferred' }) },
  { name: 'a reading is for a candidate the data no longer has', aim: 'C3c', make: inp => { const c = clone(inp); c.probe.items.Q2739617.statements = c.probe.items.Q2739617.statements.filter(s => s.p !== 'P3417'); return c } },
  { name: 'the classifier reads every text as open', aim: 'M1', make: inp => ({ ...clone(inp), classifyRoof: () => 'open' }) },
  { name: 'the control statement is ranked deprecated', aim: { number: 'retainedWitnessItems', to: 0 }, make: inp => { const c = clone(inp); roofStatement(c).r = 'deprecated'; return c } },
  { name: 'a preferred statement under the same property hides the roof', aim: { number: 'retainedWitnessItems', to: 0 }, make: inp => add(clone(inp), CONTROL.qid, { p: 'P1552', v: 'Q570116', r: 'preferred' }) },
  { name: 'the roof value has no English label', aim: { number: 'retainedWitnessItems', to: 0 }, make: inp => { const c = clone(inp); c.probe.labels[CONTROL.value].l = null; return c } },
  { name: 'a value matches only the wider word list', aim: { number: 'widerOnly', to: null }, make: inp => add(clone(inp), CONTROL.qid, { p: 'P646', v: 'Covered Stadium', r: 'preferred' }) },
  { name: 'a retractable roof is stated on one of the 9 names', aim: { number: 'passing', to: 1 }, make: inp => add(clone(inp), nineName, { p: 'P1552', v: CONTROL.value, r: 'normal' }) },
  { name: 'a closed-roof word is in a file name on one of the 9 names', aim: 'S1', make: inp => add(clone(inp), nineName, { p: 'P18', v: 'Bloomfield Dome.jpg', r: 'preferred' }) },
  { name: 'a row the lead decides names another roof than the candidate', aim: { number: 'retainedDisagree', to: 1 }, make: inp => { const c = clone(inp); for (const r of rowsOf(c, CONTROL.qid)) r.roof = 'dome'; return c } },
  { name: 'no row the candidate meets is decided by the lead or the infobox', aim: { number: 'retainedDecidedRows', to: 0 }, make: inp => { const c = clone(inp); for (const r of rowsOf(c, CONTROL.qid)) r.roofBasis = 'inferred: the lead names no roof'; return c } },
  { name: 'one of the 9 names carries the roof and the candidate meets no decided row (0 of 0)', aim: { expect: (res, ctl) => res.num.passing === 0 && res.num.retainedZeroOfZero === 1 && res.num.nineDecided === 1 && ctl.num.nineDecided === 0, why: 'passing 0, retainedZeroOfZero 1, nineDecided 1' },
    make: inp => { const c = add(clone(inp), nineName, { p: 'P1552', v: CONTROL.value, r: 'normal' }); for (const r of rowsOf(c, CONTROL.qid)) r.roofBasis = 'inferred: the lead names no roof'; return c } },
  { name: 'the description of one of the 9 names says retractable roof', aim: { number: 'descNine', to: 1 }, make: inp => { const c = clone(inp); c.probe.items[nineName].description = 'retractable roof stadium in Blackpool, England'; return c } },
  { name: 'a deprecated statement says retractable roof on one of the 9 names', aim: 'S1', make: inp => add(clone(inp), nineName, { p: 'P1552', v: CONTROL.value, r: 'deprecated' }) },
  { name: 'a review row loses its roof reason', aim: 'N1', make: inp => { const c = clone(inp); delete c.results.review.find(r => /^roof:/.test(r.why ?? '')).why; return c } },
  { name: 'one of the 9 names is an item that was not read', aim: 'N2', make: inp => { const c = clone(inp); c.results.review.find(r => r.qid === nineName).qid = 'Q999999999'; return c } },
  { name: 'P5624 is on an item the cache found no roof for', aim: 'T2', make: inp => add(clone(inp), anItem, { p: 'P5624', v: 'Q1', r: 'normal' }) },
  { name: 'a protected file differs from the digest recorded', aim: 'G7', make: inp => { const c = clone(inp); c.digests[RESULTS] = '0'.repeat(64); return c } },
  { name: 'the script imports a way to write', aim: 'G6', make: inp => ({ ...clone(inp), source: `${inp.source}\nimport { writeFileSync } from 'node:fs'\n` }) },
]

/** Reports that must print each population's denominator: a run in which fewer than all were read must say so in the same line. */
export const OUTPUT = [
  { doctor: 'an item did not read', want: `items read ${ITEMS - 1} of ${ITEMS}`, why: 'the coverage line names the items asked for, not only those read' },
  { doctor: 'a value id has no label record', want: res => `labels answered ${res.num.labelsNeeded - 1} of ${res.num.labelsNeeded}`, why: 'the label line names the ids that needed an answer' },
  { doctor: 'a property no one has read carries a roof word', want: res => `candidates accounted for ${res.num.candidates - 1} of ${res.num.candidates}`, why: 'the candidate line names the candidates found, not only those accounted for' },
  { doctor: 'a protected file differs from the digest recorded', want: `protected files unchanged ${PROTECTED.length - 1} of ${PROTECTED.length}`, why: 'the digest line names the files that must be compared' },
]

export function selfTest(base) {
  const control = analyse(base)
  const lines = []
  let caught = 0, notApplied = 0
  const controlFails = control.checks.filter(k => !k.pass)
  lines.push(`${controlFails.length ? 'FAIL' : 'PASS'}  CONTROL: the undoctored inputs pass every check (${control.checks.length - controlFails.length} of ${control.checks.length})${controlFails.length ? `: ${controlFails.map(k => k.id).join(', ')}` : ''}`)
  const doctored = new Map()
  for (const d of DOCTORS) {
    let res = null, made = null
    try { made = d.make(base) } catch (e) { notApplied++; lines.push(`FAIL  not applied: ${d.name}: ${e.message}`); continue }
    try { res = analyse(made) } catch (e) { lines.push(`FAIL  ${d.name}: aimed at ${typeof d.aim === 'string' ? `[${d.aim}]` : 'a number'}; the analysis crashed: ${String(e.message).slice(0, 90)}`); continue }
    doctored.set(d.name, res)
    const failed = res.checks.filter(k => !k.pass).map(k => k.id)
    let hit, aimed
    if (typeof d.aim === 'string') { hit = failed.includes(d.aim); aimed = `[${d.aim}]` }
    else if (d.aim.expect) { hit = Boolean(d.aim.expect(res, control)); aimed = d.aim.why }
    else { const to = d.aim.to === null ? control.num[d.aim.number] + 1 : d.aim.to; hit = res.num[d.aim.number] === to && control.num[d.aim.number] !== to; aimed = `number ${d.aim.number} ${control.num[d.aim.number]} -> ${res.num[d.aim.number]} (wanted ${to})` }
    if (hit) caught++
    lines.push(`${hit ? 'PASS' : 'FAIL'}  ${d.name}: aimed at ${aimed}; failed ${failed.length ? failed.join(', ') : 'nothing'}`)
  }
  let printed = 0
  for (const o of OUTPUT) {
    const res = doctored.get(o.doctor)
    const want = typeof o.want === 'function' ? res && o.want(res) : o.want
    const ok = Boolean(res) && report(res).includes(want)
    if (ok) printed++
    lines.push(`${ok ? 'PASS' : 'FAIL'}  OUTPUT: on "${o.doctor}" the report says "${want}" (${o.why})`)
  }
  lines.push(`\n${caught} of ${DOCTORS.length} doctored copies caught by the check or number aimed at them; ${notApplied} not applied; ${printed} of ${OUTPUT.length} coverage lines print their denominators; control ${controlFails.length ? 'red' : 'green'}`)
  return { lines, ok: caught === DOCTORS.length && notApplied === 0 && printed === OUTPUT.length && controlFails.length === 0 }
}

// --- the report ------------------------------------------------------------------------------------------------------------------------------
const label = (P, id) => (P.labels[id]?.l ? `"${P.labels[id].l}"` : id)
const propName = (P, c) => `${c.p}${c.qp ? `[${c.qp}]` : ''} ${label(P, c.p)}${c.qp ? ` [${label(P, c.qp)}]` : ''}`

export function report(res) {
  const L = [], n = res.num, v = res.view
  const P = v?.P
  if (!v) return res.checks.map(k => `${k.pass ? 'PASS' : 'FAIL'}  [${k.id}] ${k.name}`).join('\n') + `\n\n${res.verdict.text}`
  for (const k of res.checks) L.push(`${k.pass ? 'PASS' : 'FAIL'}  [${k.id}] ${k.name}${k.pass ? '' : `\n      -> ${k.detail}`}`)
  const failed = res.checks.filter(k => !k.pass)
  L.push('', `${res.checks.length - failed.length}/${res.checks.length} checks passed`, '', 'coverage (what each number is out of):')
  L.push(`  items read ${n.read} of ${ITEMS} (the wd-roof| keys of the cache); records ${n.records} of ${ITEMS}; redirected ${n.redirected}`)
  L.push(`  statements ${n.statements} (ranks: ${Object.entries(n.ranks).map(([r, k]) => `${r} ${k}`).join(', ')}); qualifier values ${n.qualifierValues}; properties in use ${n.properties}`)
  L.push(`  labels answered ${n.labelsNeeded - n.labelsUnanswered} of ${n.labelsNeeded} (missing on Wikidata ${n.labelsGone}; no English label ${n.noEnglish}, read as no witness)`)
  L.push(`  control ${CONTROL.qid}: statements read ${n.controlStatements}; found ${v.found.length} ${v.found.map(f => `${f.p}${f.qp ? `[${f.qp}]` : ''} rank ${f.rank}`).join(', ')}`)
  L.push(`  candidates accounted for ${n.accounted} of ${n.candidates} (retained ${n.retained}, set aside ${n.setAside}); values that match only the wider word list ${n.widerOnly}, counted for nothing`)
  L.push(`  retained candidates: items with a roof ${n.retainedWitnessItems} of ${ITEMS}; rows the lead or the infobox decides that they meet ${n.retainedDecidedRows}, agree ${n.retainedAgree}, disagree ${n.retainedDisagree}${n.retainedZeroOfZero ? `; ${n.retainedZeroOfZero} meet 0 of 0, which is not agreement` : ''}`)
  L.push(`  the ${n.nine} names whose roof is unsettled: read ${n.nineRead} of ${n.nine}; decided by a retained candidate ${n.nineDecided} of ${n.nine}; decided if no candidate were set aside ${n.nineDecidedAll} of ${n.nine} (Step 1's record counts ${n.nineCounted})`)
  L.push(`  the verdict by variant: as read ${n.passing ? 'GO' : 'NO-GO'}; no candidate set aside ${n.passingAll ? 'GO' : 'NO-GO'}; none set aside and every statement counted whatever its rank ${n.passingAnyRank ? 'GO' : 'NO-GO'} (roof-reading values ${n.closedValues} under the rank rule, ${n.closedValuesAnyRank} counting every rank; candidates ${n.candidates} and ${n.candidatesAnyRank})`)
  L.push(`  information only, no criterion: item descriptions that read as a roof ${n.descRoof} of ${ITEMS}; on rows the lead or the infobox decides ${n.descDecidedRows}, agree ${n.descAgree}; on the ${n.nine} names ${n.descNine}`)
  L.push(`  P5624, the property the rule reads today: on ${n.p5624Items} of ${ITEMS} items' statements; the cache's query found a roof for ${n.cacheRoofItems} of ${ITEMS}`)
  L.push(`  protected files unchanged ${n.protectedSame} of ${PROTECTED.length}`)
  L.push('', 'candidates (criterion 3), each with its reading and the items that carry a roof word:')
  for (const c of v.described) {
    L.push(`  ${c.keep ? 'RETAINED ' : 'SET ASIDE'} ${propName(P, c)}, datatype ${P.datatypes[c.qp ?? c.p]}; carried by ${c.carrying.size} of ${ITEMS} items; reading: ${c.reading?.why ?? 'NONE'}`)
    for (const e of c.evidence) L.push(`      ${e.id} ${e.name}: ${c.where === 'qualifier' ? `${c.p} ${e.main ?? '?'} [${c.qp} = ${JSON.stringify(e.text)}]` : `${c.p} = ${JSON.stringify(e.text)}`} -> ${e.cls}`)
    for (const m of c.met) L.push(`      decided row ${m.id} ${m.name}: row ${m.row} (${m.basis}); candidate ${m.cls.join('/')}: ${m.agree ? 'agree' : 'DISAGREE'}`)
    L.push(`      agree ${c.agree} of ${c.met.length}; decides ${c.decidesNine.length} of ${n.nine} names`)
  }
  L.push('', `the ${n.nine} names:`)
  for (const r of v.nine) L.push(`  ${r.qid} ${r.name}: statements read ${r.statements}; roof decided by a candidate: ${r.decidedBy.length ? r.decidedBy.join(', ') : 'none'}; wider-list values ${r.wider}; row: ${r.why}`)
  L.push('', res.verdict.text)
  return L.join('\n')
}

// --- the record ------------------------------------------------------------------------------------------------------------------------------
const esc = s => String(s ?? '').replace(/\|/g, '\\|')
export function record(res, inp) {
  const { num: n, verdict, view: v } = res
  const P = v.P
  const L = []
  const w = s => L.push(s)
  const f0 = v.found[0]
  w('# Task 5, Step A, runner read: what the 396 items\' own statements say about a roof')
  w('')
  w(`**Verdict by criteria 1 to 7 (docs/CC-CMD-2026-11-09-venue-review-remainder.md, Task 5, "Step A, runner read"): ${verdict.text}**`)
  w('')
  w(`Generated by \`node outbox/venue-wikidata-statements-step-a-2026-11-13.mjs record\`; every number below is computed by that script from \`${PROBE}\`, \`${CACHE}\`, \`${RESULTS}\`, \`${COUNTS}\` and \`${STEP_A_RECORD}\`. Its report is \`outbox/venue-wikidata-statements-step-a-2026-11-13.txt\` (${res.checks.length} checks). The read itself is the runner's: \`venue-source\` run ${P.run}, ${P.at}, ${P.calls.items + P.calls.labels} calls, ${P.requests} HTTP attempts, ${Math.round(P.elapsedMs / 1000)} s, committed by the runner.`)
  w('')
  w('## 1. Control (criterion 1)')
  w('')
  w(`${CONTROL.qid} "${P.items[CONTROL.qid].label}" was read (${n.controlStatements} statements) and carries ${CONTROL.value} "${P.labels[CONTROL.value]?.l}" under **${f0?.p} ${label(P, f0?.p)}**, datatype \`${P.datatypes[f0?.p]}\`, description "${esc(P.labels[f0?.p]?.d)}", as a ${f0?.where} statement of rank ${f0?.rank}. The control holds, so the read is a measurement and the verdict is not INVALID. It is a generic property, which is why Step A's property search for "roof" listed nothing: no property is named for a roof, and the roof is a value of this one. The rule's own classifier reads the value's label as \`${classifyRoof(P.labels[CONTROL.value]?.l)}\` (check K2).`)
  w('')
  w('## 2. The read (criterion 2)')
  w('')
  w('| what | n of m |')
  w('|---|---|')
  w(`| items read | ${n.read} of ${ITEMS} (records ${n.records}; ${n.redirected} redirected) |`)
  w(`| statements | ${n.statements}: ${Object.entries(n.ranks).map(([r, k]) => `${r} ${k}`).join(', ')}; ${n.qualifierValues} qualifier values; references not read |`)
  w(`| properties in use | ${n.properties} |`)
  w(`| value items and properties with an answered label record | ${n.labelsNeeded - n.labelsUnanswered} of ${n.labelsNeeded} (missing on Wikidata ${n.labelsGone}) |`)
  w(`| of them, no English label | ${n.noEnglish} (read as no witness, not translated) |`)
  w('')
  const byProp = new Map()
  for (const [id, it] of Object.entries(P.items)) for (const s of it.statements) {
    const noteIt = (pk, pp, val) => { if (ENTITY.has(P.datatypes[pp]) && val !== null && P.labels[val]?.l === null) { const e = byProp.get(pk) ?? { vals: new Set(), items: new Set() }; e.vals.add(val); e.items.add(id); byProp.set(pk, e) } }
    noteIt(s.p, s.p, s.v)
    for (const [qp, qv] of s.q ?? []) noteIt(`${s.p}[${qp}]`, qp, qv)
  }
  w('The values with no English label, by the property that carries them (criterion 2 asks that the unresolved be named by property):')
  w('')
  w('| property | label | ids | on items |')
  w('|---|---|---|---|')
  for (const [k, e] of [...byProp].sort((a, b) => b[1].vals.size - a[1].vals.size || a[0].localeCompare(b[0], 'en', { numeric: true }))) w(`| ${k} | ${esc(P.labels[k.split('[')[0]]?.l)} | ${e.vals.size} | ${e.items.size} |`)
  w('')
  w('## 3 and 4. Candidates, and what their values mean (criteria 3 and 4)')
  w('')
  w(`A candidate is a property, or a statement property with a qualifier property, on which at least one value of the ${ITEMS} items reads as a roof by \`classifyRoof\` in \`scripts/venue-source.mjs\`, applied to an item value's English label and to a string or monolingual-text value's text. A deprecated statement is not a witness; where an item has a preferred statement under a property only those count. By that rule there are **${n.candidates}** candidates, each read below; ${n.setAside} are set aside as a roof word by accident and **${n.retained} retained**.`)
  w('')
  w('| candidate | property label | description | datatype | the value that reads as a roof | class | items | disposition |')
  w('|---|---|---|---|---|---|---|---|')
  for (const c of v.described) {
    const t = c.where === 'qualifier' ? c.qp : c.p
    for (const e of c.wv) w(`| ${c.p}${c.qp ? `[${c.qp}]` : ''} | ${esc(P.labels[c.p]?.l)}${c.qp ? ` [${esc(P.labels[c.qp]?.l)}]` : ''} | ${esc(P.labels[c.p]?.d)}${c.qp ? ` [${esc(P.labels[c.qp]?.d)}]` : ''} | \`${P.datatypes[t]}\` | ${esc(JSON.stringify(e.text))} | ${e.cls} | ${e.items.size} of ${ITEMS} | ${c.keep ? '**retained**' : 'set aside'} |`)
  }
  w('')
  w('Each was read against the item that carries it (the reading is `READING` in the script; the report prints the item and statement for each):')
  w('')
  for (const c of v.described) w(`- **${c.p}${c.qp ? `[${c.qp}]` : ''}**, ${c.keep ? 'retained' : 'set aside'}: ${c.reading?.why}. ${c.evidence.map(e => `${e.id} ${esc(e.name)}${e.main ? ` (${esc(e.main)})` : ''}`).join('; ')}.`)
  w('')
  const p1552 = v.scanned.get('main|P1552|')
  w(`The retained property, P1552, carries every value below on the items that carry it (all ${p1552 ? p1552.values.size : 0}):`)
  w('')
  w('| value | label | description | class by `classifyRoof` | items |')
  w('|---|---|---|---|---|')
  for (const e of [...(p1552?.values.values() ?? [])].sort((a, b) => b.items.size - a.items.size)) w(`| ${e.v} | ${esc(e.text)} | ${esc(P.labels[e.v]?.d)} | ${e.cls === 'open' ? 'no witness' : e.cls} | ${e.items.size} of ${ITEMS} |`)
  w('')
  w(`The other candidates carry many values (an image, a web address, an identifier for most items); only the values that read as a roof are listed, and the rest are in \`${PROBE}\`. Values that match the wider word list (\`${WIDER.source}\`) and no pattern are listed and count for nothing (criterion 3): ${n.widerOnly} distinct under the rank rule, on ${new Set(v.wider.map(x => x.key)).size} properties; for example ${v.wider.filter(x => x.items.size >= 1).slice(0, 6).map(x => `${x.p}${x.qp ? `[${x.qp}]` : ''} = ${esc(JSON.stringify(x.text.slice(0, 60)))}`).join('; ')}. The report \`${PROBE_TXT}\` lists them with the items.`)
  w('')
  w('## 5. Agreement with the rows the lead or the infobox decides (criterion 5)')
  w('')
  w('| candidate | disposition | decided rows it meets | agree | disagree |')
  w('|---|---|---|---|---|')
  for (const c of v.described) w(`| ${c.p}${c.qp ? `[${c.qp}]` : ''} | ${c.keep ? 'retained' : 'set aside'} | ${c.met.length} | ${c.agree} | ${c.disagree.length ? c.disagree.map(d => `${d.id} ${esc(d.name)}: row ${d.row}, candidate ${d.cls.join('/')}`).join('; ') : '0'} |`)
  w('')
  w(`Retained: ${n.retainedAgree} of ${n.retainedDecidedRows} decided rows agree${n.retainedZeroOfZero ? `; ${n.retainedZeroOfZero} candidate meets 0 of 0, which is not agreement` : ''}. A candidate set aside as read that is counted anyway disagrees with a decided row on ${v.described.filter(c => !c.keep).reduce((k, c) => k + c.disagree.length, 0)} (the qualifier that names another venue: ${v.described.filter(c => !c.keep && c.disagree.length).map(c => `${c.p}[${c.qp}]`).join(', ') || 'none'}), which is the accident the reading names.`)
  w('')
  w(`The rank rule (a deprecated statement is no witness; a preferred statement hides the normal ones) leaves ${n.closedValues} roof-reading values on ${n.candidates} candidates; counting every statement whatever its rank gives ${n.closedValuesAnyRank} on ${n.candidatesAnyRank}. The verdict is ${n.passing ? 'GO' : 'NO-GO'} as read, ${n.passingAll ? 'GO' : 'NO-GO'} with no candidate set aside, and ${n.passingAnyRank ? 'GO' : 'NO-GO'} with none set aside and every rank counted (check S1).`)
  w('')
  w('## 6. It adds something (criterion 6)')
  w('')
  w(`The criterion asks that a candidate decide the roof of at least 1 of the ${n.nine} names the rule leaves unsettled with the position agreed (Step 1's record: ${n.nineGames} games on ${n.nineDays} venue-days), and disagree with the lead and the infobox on none of the rows they decide. All ${n.nineRead} of ${n.nine} names were read. **Decided by a retained candidate: ${n.nineDecided} of ${n.nine}. Decided if no candidate were set aside: ${n.nineDecidedAll} of ${n.nine}.** The retained candidate's only roof is on ${CONTROL.qid}, whose roof the lead already decides, so it repeats the lead and adds no witness.`)
  w('')
  w('| name | item | statements read | decided by a candidate | wider-list values (count for nothing) | why the rule leaves it unsettled |')
  w('|---|---|---|---|---|---|')
  for (const r of v.nine) w(`| ${esc(r.name)} | ${r.qid} | ${r.statements} | ${r.decidedBy.length ? r.decidedBy.join(', ') : 'none'} | ${r.wider} | ${esc(r.why)} |`)
  w('')
  w('## 7. It writes nothing (criterion 7)')
  w('')
  w(`The script imports only \`readFileSync\`, \`createHash\`, \`classifyRoof\` and the check harness (check G6). The runner's commit (d600db24) added only the two probe files (\`git show --stat d600db24\`). The four protected files carry the digests Step A's record printed (check G7, ${n.protectedSame} of ${PROTECTED.length}):`)
  w('')
  w('| file | sha256 now | sha256 in Step A\'s record |')
  w('|---|---|---|')
  for (const f of PROTECTED) w(`| \`${f}\` | \`${inp.digests[f]}\` | \`${v.recorded[f]}\` |`)
  w('')
  w('## Beyond the criteria: the items\' own descriptions (information only)')
  w('')
  w(`Criterion 3 reads statements, and an item's English description is not one, so this has no criterion and decides nothing. Read through the same patterns, ${n.descRoof} of the ${ITEMS} descriptions read as a roof${v.descClosed.length ? ` (${v.descClosed.map(id => `${id} ${esc(P.items[id].label)}: "${esc(P.items[id].description)}"`).join('; ')})` : ''}. ${n.descAgree} of ${n.descDecidedRows} rows the lead or the infobox decides agree with them, and **${n.descNine} of the ${n.nine} names** have such a description.`)
  w('')
  w('## The property the rule reads today')
  w('')
  w(`P5624 is on ${n.p5624Items} of ${ITEMS} items' own statements, and the cache's query found a roof for ${n.cacheRoofItems} of ${ITEMS} (check T2). Two reads of the same fact by different routes agree, and the fact is that the Wikidata step of \`roofOf\` and \`decideRoof\` has nothing to read on any of these ${ITEMS} items.`)
  w('')
  w('## What this does not show')
  w('')
  w('- References are not read, and items outside the 396 are not read. A roof Wikidata holds only as prose on a linked page is a witness the lead and the infobox already read.')
  const p1552NoLabel = [...(p1552?.values.values() ?? [])].filter(e => e.text === null).length
  const bareRoof = v.wider.find(x => x.text.toLowerCase() === 'roof')
  w(`- Labels are read in English only. A value with no English label is counted and named, not translated; ${p1552NoLabel} of the retained candidate's ${p1552?.values.size ?? 0} values lacks one.`)
  w(`- A roof stated in a way the rule's patterns do not name is no witness by criterion 4 and is listed under the wider word list${bareRoof ? `: ${bareRoof.p}${bareRoof.qp ? `[${bareRoof.qp}]` : ''} "${esc(P.labels[bareRoof.p]?.l)}"${bareRoof.qp ? ` with the qualifier "${esc(P.labels[bareRoof.qp]?.l)}"` : ''} = "${esc(bareRoof.text)}" on ${bareRoof.items.size} of ${ITEMS} items says a roof is the part concerned, not what kind of roof it is` : ''}.`)
  w('- The statements of the items that appear as values (the classes an item is an instance of, for example) were not read, so a roof carried by a class\'s own statements, such as a class that is a subclass of "domed stadium", is not seen.')
  w('- Wikidata changes: these are answers at the time of the run, kept in the committed evidence.')
  w('- The reading of each candidate was made after the data was seen. Criterion 3 allows it; the verdict does not depend on it (check S1).')
  w('')
  w('## The owner\'s decision')
  w('')
  w(verdict.kind === 'NO-GO'
    ? 'Task 5 names two follow-ons, each its own approval, and neither is approved: wire a property in place of P5624, or remove the Wikidata roof step from `roofOf` and `decideRoof` and from the comments and documents that name three witnesses. By the criteria the first has no candidate to wire (NO-GO). Task 5 is done when he says which follow-on follows, or neither.'
    : 'Task 5 names two follow-ons, each its own approval, and neither is approved. Task 5 is done when he says which follow-on follows, or neither.')
  return L.join('\n') + '\n'
}

// --- the command line --------------------------------------------------------------------------------------------------------------------------
const sha = f => createHash('sha256').update(readFileSync(f)).digest('hex')
export const load = () => ({
  probe: JSON.parse(readFileSync(PROBE, 'utf8')),
  report: readFileSync(PROBE_TXT, 'utf8'),
  cache: JSON.parse(readFileSync(CACHE, 'utf8')),
  results: JSON.parse(readFileSync(RESULTS, 'utf8')),
  counts: readFileSync(COUNTS, 'utf8'),
  record: readFileSync(STEP_A_RECORD, 'utf8'),
  digests: Object.fromEntries(PROTECTED.map(f => [f, sha(f)])),
  source: readFileSync(new URL(import.meta.url), 'utf8'),
})

if (isMain(import.meta.url)) {
  const inp = load()
  if (process.argv.includes('--self-test')) {
    const r = selfTest(inp)
    console.log(r.lines.join('\n'))
    finish(r.ok ? 0 : 1)
  } else {
    const res = analyse(inp)
    if (process.argv.includes('record')) {
      process.stdout.write(record(res, inp))
    } else {
      console.log(report(res))
      console.log('\nprotected files, sha256:')
      for (const f of PROTECTED) console.log(`  ${inp.digests[f]}  ${f}`)
    }
    finish(res.checks.every(k => k.pass) ? 0 : 1)
  }
}
