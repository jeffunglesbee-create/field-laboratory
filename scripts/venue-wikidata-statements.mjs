// The statements of every venue item the roof rule asks Wikidata about, read from Wikidata's own API:
// a measurement, no decision.
//
// docs/CC-CMD-2026-11-09-venue-review-remainder.md, Task 5, "Step A, runner read" (the owner's "Do the
// runner first", 2026-11-13 08:31 ET). Step A's property search for "roof" listed no roof property. What it
// could not show is whether a roof sits in the 396 items' own statements, under a property that is not named
// for one. This reads them. It writes neither the sourcing results, nor the cache, nor the table, and it
// changes no rule.
//
// WHAT IS READ. For each item the roof rule asks about (the `wd-roof-p1552|` keys of the sourcing cache; the run committed on
// 2026-11-13 read the 396 `wd-roof|` keys the cache held before the rule changed to P1552), `action=wbgetentities`
// (`props=claims|labels|descriptions`, English): every statement's property, value and rank, and the property
// and value of every qualifier on it. References are not kept. Then the English label and description of every
// item that appears as a value and of every property seen, fifty ids to a request. One request a second, a
// User-Agent that names this repository, and the retry policy the other probes share (`retryWait`).
//
// THE PREMISES, AND THE ONE COMMAND THAT TESTS EACH (PREMISE-FIRST-A)
//   1. "A roof, if Wikidata carries one for these items, is a main statement under a property."  REFUTED on
//      2026-11-13, before this file was written, by pages already saved in
//      outbox/venue-wikidata-roof-evidence-2026-11-12.json: Q1410402 (Stade Pierre-Mauroy) is one of the 5
//      pages that link to "retractable roof" (Q7316894), and `haswbstatement:P31=Q7316894` counts 0 items. So
//      the link is some other property's statement, or a qualifier, or a reference. Qualifiers are read here;
//      references are not, and that is stated in the CC-CMD before the data.
//   2. "An item's statements come back as claims -> property -> [ { mainsnak, qualifiers, rank, references } ]."
//      TESTED against a real response (the saved page for P5833, a 7-property excerpt of it is the first
//      fixture below). NOT yet seen for an item, because the shell cannot reach Wikidata: so an item whose
//      answer lacks `claims`, is missing, or has a statement that does not read is recorded as NOT READ with
//      its reason, never as an item with no statements.
//   3. "An empty map is {}."  NOT ASSUMED. Format 1 writes an empty map as [], so both are read as empty and a
//      non-empty array where a map belongs is a failure.
//   4. "A merged item answers under its old id."  NOT ASSUMED. The answer may be keyed by the id asked or by the
//      target's; both are accepted, and the record says which item answered.
//   5. "A value with no English label has no label."  It has no ENGLISH label: it is counted and named, not
//      translated and not dropped.
//   6. "The link from Q1410402 to Q7316894 is a statement or qualifier value."  This is the control (criterion 1
//      of the CC-CMD). If the read does not find it, the verdict is INVALID and not NO-GO; the probe's exit code
//      says so, and the analysis does the rest.
//
// COVERAGE IS PRINTED, NOT IMPLIED (Rule 91). Every number in the report names its denominator. What this cannot
// say: anything held in a reference, anything outside the 396 items, any label in another language, and whether a
// statement is true (the revision is not recorded; the answer is the item as it stood when it was read).
//
// Usage:  node scripts/venue-wikidata-statements.mjs --self-test       (no network)
//         node scripts/venue-wikidata-statements.mjs                   (runner: reads Wikidata; 16 requests for the 396 items, then one per 50 ids to label)
//         node scripts/venue-wikidata-statements.mjs --report FILE.json   (no network: the text report of a committed run)

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { retryWait, classifyRoof } from './venue-source.mjs'
import { createChecks, finish, isMain } from './checks.mjs'

export const API = 'https://www.wikidata.org/w/api.php'
export const UA = 'field-laboratory-venue-wikidata-statements/1.0 (github.com/jeffunglesbee-create/field-laboratory; reads the statements of the venue items the roof rule asks Wikidata about)'
export const GAP_MS = 1000
export const ITEM_BATCH = 25
export const LABEL_BATCH = 50
export const TIMEOUT_MS = 45000
export const CACHE = 'outbox/venue-source-cache.json'
export const OUT_JSON = 'outbox/venue-wikidata-statements-probe.json'
export const OUT_TXT = 'outbox/venue-wikidata-statements-probe.txt'
/** Criterion 1 of the CC-CMD: the item the saved backlinks pages say links to "retractable roof". */
export const CONTROL = { qid: 'Q1410402', name: 'Stade Pierre-Mauroy', value: 'Q7316894', valueName: 'retractable roof' }
/** The wider word list the infobox probe read categories with (scripts/venue-infobox.mjs): a match is listed and counts for nothing. */
export const ROOFISH = /roof|dome|skylit|indoor|covered|enclosed|retractable|open-air/i
const sleep = ms => new Promise(r => setTimeout(r, ms))

const RANKS = new Set(['normal', 'preferred', 'deprecated'])
const ENTITY_DT = new Set(['wikibase-item', 'wikibase-property', 'wikibase-lexeme', 'wikibase-form', 'wikibase-sense'])
const NONTEXT_DT = new Set([...ENTITY_DT, 'quantity', 'time', 'globe-coordinate'])
export const isEntityDt = dt => ENTITY_DT.has(dt)
export const isTextDt = dt => typeof dt === 'string' && !NONTEXT_DT.has(dt)
const askable = id => /^[QP][1-9]\d*$/.test(id)

// --- which items ---------------------------------------------------------------------------------

/** The items the roof rule asks Wikidata about: the `wd-roof-p1552|<qid>` keys of the sourcing cache, once each, in id order. A key that is not shaped like a Q-id is named and not read. */
export const population = cache => {
  const ids = new Set(), bad = []
  for (const k of Object.keys(cache)) {
    if (!k.startsWith('wd-roof-p1552|')) continue
    const q = k.slice('wd-roof-p1552|'.length)
    if (/^Q[1-9]\d*$/.test(q)) ids.add(q); else bad.push(k)
  }
  return { ids: [...ids].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))), bad }
}

// --- the network ----------------------------------------------------------------------------------

export const itemsUrl = ids => `${API}?action=wbgetentities&ids=${ids.join('|')}&props=claims|labels|descriptions&languages=en&format=json`
export const labelsUrl = ids => `${API}?action=wbgetentities&ids=${ids.join('|')}&props=labels|descriptions&languages=en&format=json`

/** GET json with the repository's retry policy (`retryWait`: a 429 waits what Retry-After asks), recording every attempt so that a slow run is measured and not guessed at. */
export const getRecorded = async (url, { fetchImpl = fetch, wait = sleep } = {}) => {
  const attempts = []
  let why = null
  for (let n = 0; n < 4; n++) {
    const t0 = Date.now()
    try {
      const res = await fetchImpl(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(TIMEOUT_MS) })
      attempts.push({ status: res.status, ms: Date.now() - t0 })
      if (res.status === 429 || res.status >= 500) { why = `HTTP ${res.status}`; await wait(retryWait(res.headers.get('retry-after'), n)); continue }
      if (!res.ok) return { ok: false, why: `HTTP ${res.status}`, attempts }
      try { return { ok: true, value: await res.json(), attempts } } catch (e) { return { ok: false, why: `HTTP ${res.status}, not JSON: ${e.message}`, attempts } }
    } catch (e) {
      attempts.push({ status: 0, ms: Date.now() - t0 })
      why = `request failed: ${e.message}`
      await wait(3000)
    }
  }
  return { ok: false, why, attempts }
}

/** The entities of an API answer, or why there are none (the API answers HTTP 200 with an error object). */
export const answerOf = v => {
  if (v && typeof v === 'object' && v.error) return { ok: false, why: `API error ${v.error.code}: ${String(v.error.info ?? '').slice(0, 120)}` }
  const e = v?.entities
  if (!e || typeof e !== 'object' || Array.isArray(e)) return { ok: false, why: 'the answer has no entities' }
  return { ok: true, entities: e }
}

/** The entity the API answered for one id asked: under the id itself, or, for a merged item, under whichever key records a redirect from it. */
export const entityFor = (entities, id) => entities[id] ?? Object.values(entities).find(x => x?.redirects?.from === id)

/** Format 1 writes an empty map as [], so [] is empty; a non-empty array where a map belongs is a failure, not a map. */
export const asMap = (x, what) => {
  if (x === undefined || x === null) return {}
  if (Array.isArray(x)) { if (x.length === 0) return {}; throw new Error(`${what} is a non-empty array`) }
  if (typeof x !== 'object') throw new Error(`${what} is not an object`)
  return x
}

// --- one item's statements ---------------------------------------------------------------------------

const newAcc = () => ({ dt: {}, props: new Set(), entityValues: new Set(), dtConflicts: [] })
const mergeAcc = (into, from) => {
  for (const [p, dt] of Object.entries(from.dt)) {
    if (into.dt[p] !== undefined && into.dt[p] !== dt) into.dtConflicts.push(`${p}: ${into.dt[p]} and ${dt}`)
    else into.dt[p] = dt
  }
  for (const p of from.props) into.props.add(p)
  for (const v of from.entityValues) into.entityValues.add(v)
  into.dtConflicts.push(...from.dtConflicts)
}

/** One snak into { p, v, k? }: v is the value as text (an id, a string, `lang:text`, an amount and its unit item, a time and its precision, `lat,lon`), null with k for somevalue and novalue. A value this does not know is kept whole as JSON. Anything malformed throws. */
export const readSnak = (snak, acc) => {
  if (!snak || typeof snak !== 'object') throw new Error('a snak is not an object')
  const p = snak.property
  if (typeof p !== 'string' || !/^P[1-9]\d*$/.test(p)) throw new Error(`a snak names the property ${JSON.stringify(p)}`)
  acc.props.add(p)
  if (typeof snak.datatype === 'string') {
    if (acc.dt[p] !== undefined && acc.dt[p] !== snak.datatype) acc.dtConflicts.push(`${p}: ${acc.dt[p]} and ${snak.datatype}`)
    else acc.dt[p] = snak.datatype
  }
  if (snak.snaktype === 'somevalue' || snak.snaktype === 'novalue') return { p, v: null, k: snak.snaktype }
  if (snak.snaktype !== 'value') throw new Error(`${p}: snaktype ${JSON.stringify(snak.snaktype)}`)
  const dv = snak.datavalue
  if (!dv || typeof dv.type !== 'string' || dv.value === undefined) throw new Error(`${p}: a value snak without a datavalue`)
  const x = dv.value
  switch (dv.type) {
    case 'wikibase-entityid':
      if (typeof x?.id !== 'string') throw new Error(`${p}: an entity value without an id`)
      acc.entityValues.add(x.id)
      return { p, v: x.id }
    case 'string':
      if (typeof x !== 'string') throw new Error(`${p}: a string value that is not a string`)
      return { p, v: x }
    case 'monolingualtext':
      if (typeof x?.language !== 'string' || typeof x?.text !== 'string') throw new Error(`${p}: a monolingual value without language and text`)
      return { p, v: `${x.language}:${x.text}` }
    case 'quantity':
      if (typeof x?.amount !== 'string') throw new Error(`${p}: a quantity without an amount`)
      return { p, v: x.amount + (typeof x.unit === 'string' && x.unit !== '1' ? ` ${x.unit.split('/').pop()}` : '') }
    case 'time':
      if (typeof x?.time !== 'string') throw new Error(`${p}: a time value without a time`)
      return { p, v: `${x.time}/${x.precision}` }
    case 'globecoordinate':
      if (typeof x?.latitude !== 'number' || typeof x?.longitude !== 'number') throw new Error(`${p}: a coordinate without numbers`)
      return { p, v: `${x.latitude},${x.longitude}` }
    default:
      return { p, v: JSON.stringify(x) }
  }
}

/** One statement of property `pid` into { p, v, r, k?, q? }: q lists each qualifier as [property, value, k?]. References are not read. */
const digestStatement = (pid, st, acc) => {
  if (!st || typeof st !== 'object') throw new Error(`a statement of ${pid} is not an object`)
  const m = readSnak(st.mainsnak, acc)
  if (m.p !== pid) throw new Error(`a statement under ${pid} has a main snak for ${m.p}`)
  if (!RANKS.has(st.rank)) throw new Error(`a statement of ${pid} has the rank ${JSON.stringify(st.rank)}`)
  const out = { p: pid, v: m.v, r: st.rank }
  if (m.k) out.k = m.k
  const q = []
  for (const [qp, snaks] of Object.entries(asMap(st.qualifiers, `the qualifiers of ${pid}`))) {
    if (!Array.isArray(snaks)) throw new Error(`the ${qp} qualifiers of ${pid} are not a list`)
    for (const s of snaks) {
      const x = readSnak(s, acc)
      if (x.p !== qp) throw new Error(`a ${qp} qualifier of ${pid} names ${x.p}`)
      q.push(x.k ? [qp, null, x.k] : [qp, x.v])
    }
  }
  if (q.length) out.q = q
  return out
}

/** The record for one item asked for: { ok: true, n, statements, label, description, redirectedTo } or { ok: false, why }. Nothing is skipped: one statement that does not read makes the item NOT READ. */
export const digestItem = (id, entity, acc) => {
  try {
    if (!entity || typeof entity !== 'object') return { ok: false, why: 'the id is not in the answer' }
    if ('missing' in entity) return { ok: false, why: 'Wikidata says the entity is missing' }
    if (entity.id !== id && entity.redirects?.from !== id) return { ok: false, why: `the answer is for ${entity.id}, with no redirect from ${id}` }
    if (!('claims' in entity)) return { ok: false, why: 'the answer has no claims member' }
    const local = newAcc()
    const statements = []
    for (const [pid, sts] of Object.entries(asMap(entity.claims, 'the claims'))) {
      if (!Array.isArray(sts)) throw new Error(`the statements of ${pid} are not a list`)
      for (const st of sts) statements.push(digestStatement(pid, st, local))
    }
    const en = m => asMap(m, 'a label map').en?.value ?? null
    const rec = { ok: true, id: entity.id, label: en(entity.labels), description: en(entity.descriptions), redirectedTo: entity.id !== id ? entity.id : null, n: statements.length, statements }
    mergeAcc(acc, local)
    return rec
  } catch (e) { return { ok: false, why: String(e.message ?? e).slice(0, 200) } }
}

// --- labels --------------------------------------------------------------------------------------------

/** One answer of the labels call into `labels`: { l, d } (English label and description, null when it has none), { missing: true }, { bad: why }; an id the answer lacks gets nothing and is counted as unresolved. */
export const readLabels = (entities, ids, labels) => {
  for (const id of ids) {
    const e = entityFor(entities, id)
    if (!e) continue
    if ('missing' in e) { labels[id] = { missing: true }; continue }
    try { labels[id] = { l: asMap(e.labels, 'a label map').en?.value ?? null, d: asMap(e.descriptions, 'a description map').en?.value ?? null } } catch (err) { labels[id] = { bad: String(err.message ?? err).slice(0, 120) } }
  }
}

/** Q ids before P ids, each in number order. */
export const idOrder = (a, b) => (a[0] === 'Q' ? 0 : 1) - (b[0] === 'Q' ? 0 : 1) || Number(a.slice(1)) - Number(b.slice(1))

/** The ids that need a label: every item that is a value and every property seen, in `idOrder`. Ids that are not Q or P ids (lexemes, forms) are named and are not asked for. */
export const labelTargets = acc => {
  const all = new Set([...acc.entityValues, ...acc.props])
  const ask = [], skip = []
  for (const id of all) (askable(id) ? ask : skip).push(id)
  return { ask: ask.sort(idOrder), skip: skip.sort() }
}

/** The ids still to ask for: `labelTargets` less those already labelled (the items read carry their own label). */
export const idsToLabel = (acc, have = {}) => {
  const t = labelTargets(acc)
  return { ask: t.ask.filter(id => !have[id]), skip: t.skip }
}

// --- the control ---------------------------------------------------------------------------------------------

/** Criterion 1: whether the statements read for the control item carry the control value, and under which property (and qualifier). */
export const controlFinding = (items, control = CONTROL) => {
  const base = { qid: control.qid, name: control.name, value: control.value, valueName: control.valueName }
  const it = items[control.qid]
  if (!it) return { ...base, read: false, why: 'the control item is not in the population' }
  if (!it.ok) return { ...base, read: false, why: it.why }
  const found = []
  for (const s of it.statements) {
    if (s.v === control.value) found.push({ where: 'main', p: s.p, rank: s.r })
    for (const [qp, qv] of s.q ?? []) if (qv === control.value) found.push({ where: 'qualifier', p: s.p, qualifier: qp, rank: s.r })
  }
  return { ...base, read: true, statements: it.n, found }
}

// --- the run ---------------------------------------------------------------------------------------------------

export const run = async ({ cache, fetchJson, wait = sleep, now = () => Date.now(), progress = () => {} }) => {
  const pop = population(cache)
  const started = now()
  const items = {}, labels = {}, labelFailures = []
  const acc = newAcc()
  let requests = 0, itemCalls = 0, labelCalls = 0, fatal = null, labelIds = [], unlabelable = [], first = true, controlEntity = null
  const call = async url => {
    if (!first) await wait(GAP_MS)
    first = false
    const r = await fetchJson(url)
    requests += r.attempts.length
    return r
  }
  try {
    for (let b = 0; b < pop.ids.length; b += ITEM_BATCH) {
      const batch = pop.ids.slice(b, b + ITEM_BATCH)
      const r = await call(itemsUrl(batch))
      itemCalls++
      const a = r.ok ? answerOf(r.value) : { ok: false, why: r.why }
      if (a.ok && batch.includes(CONTROL.qid)) controlEntity = entityFor(a.entities, CONTROL.qid) ?? null
      for (const id of batch) items[id] = a.ok ? digestItem(id, entityFor(a.entities, id), acc) : { ok: false, why: a.why }
      progress(`${Math.min(b + ITEM_BATCH, pop.ids.length)} of ${pop.ids.length} items`)
    }
    for (const [id, rec] of Object.entries(items)) if (rec.ok) labels[id] = { l: rec.label, d: rec.description }
    const want = idsToLabel(acc, labels)
    const targets = labelTargets(acc)
    unlabelable = targets.skip
    labelIds = targets.ask
    for (let b = 0; b < want.ask.length; b += LABEL_BATCH) {
      const batch = want.ask.slice(b, b + LABEL_BATCH)
      const r = await call(labelsUrl(batch))
      labelCalls++
      const a = r.ok ? answerOf(r.value) : { ok: false, why: r.why }
      if (!a.ok) { labelFailures.push({ ids: batch.length, first: batch[0], why: a.why }); continue }
      readLabels(a.entities, batch, labels)
      progress(`${Math.min(b + LABEL_BATCH, want.ask.length)} of ${want.ask.length} labels`)
    }
  } catch (e) {
    fatal = String(e.stack ?? e).slice(0, 600)
  }
  const control = controlFinding(items)
  return {
    at: new Date(started).toISOString(), run: process.env.GITHUB_RUN_ID ?? null, complete: fatal === null, fatal,
    source: { items: `${API}?action=wbgetentities&ids=Q1|Q2|...&props=claims|labels|descriptions&languages=en&format=json (${ITEM_BATCH} ids to a request)`, labels: `${API}?action=wbgetentities&ids=Q1|P1|...&props=labels|descriptions&languages=en&format=json (${LABEL_BATCH} ids to a request)` },
    elapsedMs: now() - started, calls: { items: itemCalls, labels: labelCalls }, requests,
    population: { items: pop.ids.length, badKeys: pop.bad },
    control,
    // the control's own answer, as the API gave it, kept only when the control was not found: references are not read, and if the link to the control value sits in one, this is where it is seen
    controlRaw: control.found?.length ? null : controlEntity,
    datatypes: acc.dt, dtConflicts: acc.dtConflicts, labelIds, unlabelable, labelFailures,
    items, labels,
  }
}

// --- reading a run -----------------------------------------------------------------------------------------------

const tally = (xs, key = x => x) => {
  const m = new Map()
  for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + 1)
  return [...m].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
}
const median = xs => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : 0 }

/** The text a value is read as: an item's English label, a text value itself; null for what has no text to read (an amount, a time, a coordinate, an item with no English label). */
export const valueText = (out, p, v) => {
  const dt = out.datatypes[p]
  if (isEntityDt(dt)) return out.labels[v]?.l ?? null
  if (isTextDt(dt)) return v
  return null
}

export const analyze = out => {
  const ids = Object.keys(out.items)
  const read = ids.filter(id => out.items[id].ok)
  const notRead = ids.filter(id => !out.items[id].ok)
  const stmts = read.flatMap(id => out.items[id].statements.map(s => ({ id, s })))
  const qualifiers = stmts.reduce((n, { s }) => n + (s.q?.length ?? 0), 0)
  // an id with no record (its request failed, or the answer lacked it) or an unreadable one is a failed read; an id Wikidata says is missing is a measured fact
  const unresolved = out.labelIds.filter(id => { const l = out.labels[id]; return !l || l.bad })
  const gone = out.labelIds.filter(id => out.labels[id]?.missing === true)
  const noEnglish = out.labelIds.filter(id => out.labels[id]?.l === null)
  // per property: the items with a statement under it, the statements, and the items on which it appears as a qualifier
  const byProp = new Map()
  const slot = p => { let e = byProp.get(p); if (!e) { e = { items: new Set(), statements: 0, qItems: new Set(), qSnaks: 0 }; byProp.set(p, e) } return e }
  for (const { id, s } of stmts) {
    const e = slot(s.p)
    e.items.add(id); e.statements++
    for (const [qp] of s.q ?? []) { const x = slot(qp); x.qItems.add(id); x.qSnaks++ }
  }
  // roof-ish values: every (where, property, qualifier, value) whose text matches the wider word list, with the items that carry it
  const matches = new Map()
  const note = (where, p, qualifier, value, id) => {
    const text = valueText(out, qualifier ?? p, value)
    if (text === null || !ROOFISH.test(text)) return
    const key = `${where}\t${p}\t${qualifier ?? ''}\t${value}`
    const m = matches.get(key) ?? { where, p, qualifier, v: value, text, items: new Set(), cls: classifyRoof(text) }
    m.items.add(id)
    matches.set(key, m)
  }
  for (const { id, s } of stmts) {
    if (s.v !== null) note('main', s.p, null, s.v, id)
    for (const [qp, qv] of s.q ?? []) if (qv !== null) note('qualifier', s.p, qp, qv, id)
  }
  const propsRoofish = [...byProp.keys()].filter(p => ROOFISH.test(`${out.labels[p]?.l ?? ''} ${out.labels[p]?.d ?? ''}`)).sort(idOrder)
  return { ids, read, notRead, stmts, qualifiers, unresolved, gone, noEnglish, byProp, matches, propsRoofish }
}

export const verdict = out => {
  const a = analyze(out)
  const problems = []
  if (!out.complete) problems.push(`the run did not complete: ${out.fatal}`)
  if (a.ids.length !== out.population.items) problems.push(`${out.population.items - a.ids.length} of ${out.population.items} items have no record`)
  if (a.notRead.length) problems.push(`${a.notRead.length} of ${a.ids.length} items were not read`)
  if (out.population.badKeys.length) problems.push(`${out.population.badKeys.length} wd-roof-p1552| keys are not Q-ids`)
  if (a.unresolved.length) problems.push(`${a.unresolved.length} of ${out.labelIds.length} ids were not answered by the labels request`)
  if (out.dtConflicts.length) problems.push(`${out.dtConflicts.length} properties carry two datatypes`)
  if (!out.control.read) problems.push(`the control ${out.control.qid} was not read: ${out.control.why}`)
  else if (!out.control.found.length) problems.push(`the control ${out.control.qid} carries no statement or qualifier value ${out.control.value}`)
  return { code: problems.length ? 1 : 0, problems }
}

const pad = (s, n) => String(s).padEnd(n)
const labelOf = (out, id) => (out.labels[id]?.l ? `"${out.labels[id].l}"` : '(no English label)')
const dtTally = out => tally(Object.entries(out.datatypes), ([, dt]) => dt)

export const report = out => {
  const a = analyze(out), L = []
  const cf = out.control
  L.push(`venue-wikidata-statements probe, run ${out.run ?? 'local'}, ${out.at}, ${out.complete ? 'complete' : `INCOMPLETE: ${out.fatal}`}; ${out.calls.items + out.calls.labels} calls (${out.calls.items} for the items, ${out.calls.labels} for the labels), ${out.requests} HTTP attempts, ${Math.round(out.elapsedMs / 1000)} s`)
  L.push(`COVERAGE: items read ${a.read.length} of ${out.population.items} (the wd-roof-p1552| keys of the cache${out.population.badKeys.length ? `; ${out.population.badKeys.length} keys are not Q-ids and were not read` : ''}); records ${a.ids.length} of ${out.population.items}`)
  L.push(`  statements ${a.stmts.length} on the ${a.read.length} items read (ranks: ${tally(a.stmts, x => x.s.r).map(([r, n]) => `${r} ${n}`).join(', ') || 'none'}); qualifier values ${a.qualifiers}; references are not read`)
  const mainProps = new Set(a.stmts.map(x => x.s.p))
  L.push(`  properties ${a.byProp.size} (${mainProps.size} carry a statement, ${a.byProp.size - mainProps.size} appear only as qualifiers); datatypes ${dtTally(out).map(([d, n]) => `${d} ${n}`).join(', ')}`)
  L.push(`  ids to label ${out.labelIds.length}: labelled ${out.labelIds.length - a.unresolved.length - a.gone.length} of ${out.labelIds.length}, of which ${a.noEnglish.length} have no English label; missing on Wikidata ${a.gone.length}${a.gone.length ? ` (${a.gone.slice(0, 5).join(', ')})` : ''}; not answered ${a.unresolved.length}; ids that are not Q or P ids, not asked for: ${out.unlabelable.length}${out.unlabelable.length ? ` (${out.unlabelable.slice(0, 5).join(', ')})` : ''}`)
  const per = a.read.map(id => out.items[id].n)
  L.push(`  statements per item: min ${per.length ? Math.min(...per) : 0}, median ${median(per)}, max ${per.length ? Math.max(...per) : 0}`)
  for (const f of out.labelFailures) L.push(`  LABEL BATCH FAILED  ${f.ids} ids from ${f.first}: ${f.why}`)
  for (const id of a.notRead) L.push(`  NOT READ  ${id}: ${out.items[id].why}`)
  L.push('')
  if (!cf.read) L.push(`CONTROL ${cf.qid} ${cf.name}: NOT READ (${cf.why})`)
  else if (!cf.found.length) L.push(`CONTROL ${cf.qid} ${cf.name}: read (${cf.statements} statements); ${cf.value} "${cf.valueName}" NOT FOUND in any main statement or qualifier`)
  else for (const f of cf.found) L.push(`CONTROL ${cf.qid} ${cf.name}: read (${cf.statements} statements); carries ${cf.value} "${cf.valueName}" under ${f.p} ${labelOf(out, f.p)} (${f.where}${f.qualifier ? ` ${f.qualifier} ${labelOf(out, f.qualifier)}` : ''}, rank ${f.rank})`)
  if (out.controlRaw) L.push(`  the control's own answer, as the API gave it, is kept in the JSON as controlRaw (${JSON.stringify(out.controlRaw).length} characters)`)
  L.push('')
  const props = [...a.byProp].sort((x, y) => y[1].items.size - x[1].items.size || x[0].localeCompare(y[0], 'en', { numeric: true }))
  L.push(`PROPERTIES by the items that carry a statement under them, ${props.length} in all, the 40 most carried (the whole read is in the JSON):`)
  for (const [p, e] of props.slice(0, 40)) L.push(`  ${pad(p, 8)} ${pad(labelOf(out, p), 44)} ${String(e.items.size).padStart(3)} of ${a.read.length} items, ${e.statements} statements${e.qSnaks ? `; as qualifier on ${e.qItems.size} items` : ''}`)
  L.push('')
  L.push(`PROPERTIES whose English label or description matches ${ROOFISH}, ${a.propsRoofish.length}:`)
  for (const p of a.propsRoofish) L.push(`  ${pad(p, 8)} ${pad(labelOf(out, p), 44)} ${a.byProp.get(p)?.items.size ?? 0} of ${a.read.length} items carry a statement; as qualifier on ${a.byProp.get(p)?.qItems.size ?? 0}`)
  L.push('')
  const ms = [...a.matches.values()].sort((x, y) => y.items.size - x.items.size || x.p.localeCompare(y.p, 'en', { numeric: true }) || x.text.localeCompare(y.text))
  L.push(`VALUES whose text matches ${ROOFISH} (an item value read as its English label, a text value as itself; each listed with the roof class the sourcing rule's patterns give it, "no pattern" meaning none), ${ms.length} distinct:`)
  for (const m of ms) L.push(`  ${pad(m.p, 8)} ${pad(labelOf(out, m.p), 30)} ${m.where === 'qualifier' ? `${pad(`[${m.qualifier} ${labelOf(out, m.qualifier)}]`, 28)} ` : ''}= ${JSON.stringify(m.text)}${isEntityDt(out.datatypes[m.qualifier ?? m.p]) ? ` (${m.v})` : ''}  ${String(m.items.size).padStart(3)} of ${a.read.length} items  [${m.cls === 'open' ? 'no pattern' : m.cls}]${m.items.size <= 3 ? `  ${[...m.items].join(' ')}` : ''}`)
  return L.join('\n')
}

// --- the file, one item or label to a line so a diff and a grep can read it ------------------------------------------

const MAPS = new Set(['items', 'labels'])
export const serialize = out => {
  const keys = Object.keys(out)
  const lines = ['{']
  keys.forEach((k, i) => {
    const comma = i < keys.length - 1 ? ',' : ''
    const v = out[k]
    if (MAPS.has(k)) {
      const es = Object.entries(v)
      lines.push(` ${JSON.stringify(k)}: {`)
      es.forEach(([id, rec], j) => lines.push(`  ${JSON.stringify(id)}: ${JSON.stringify(rec)}${j < es.length - 1 ? ',' : ''}`))
      lines.push(` }${comma}`)
    } else lines.push(` ${JSON.stringify(k)}: ${JSON.stringify(v)}${comma}`)
  })
  lines.push('}')
  return lines.join('\n') + '\n'
}

// --- self-test: a real response, other shapes, then the run against a fake network ---------------------------------------

/** A real response from Wikidata's API, recorded at 2026-11-13T01:52:41Z in outbox/venue-wikidata-roof-evidence-2026-11-12.json (the page `action=wbgetentities&ids=P5833&props=claims&format=json`: 15 properties, 27 statements), cut to seven of its fifteen properties and 15 of its 27 statements. Every property kept is byte for byte what the API wrote; whole properties were left out and nothing was changed inside a kept one. It is a property's entity; an item's has the same `claims` member, and that is the one thing this fixture proves about items. */
const REAL_P5833 = { entities: { P5833: { type: "property", datatype: "external-id", id: "P5833", claims: {
  P1630: [{"mainsnak":{"snaktype":"value","property":"P1630","hash":"ff177010fd1c6cc5aa53eeb0c58596ac2d3661d4","datavalue":{"value":"https://www.playbill.com/production/$1","type":"string"},"datatype":"string"},"type":"statement","qualifiers":{"P407":[{"snaktype":"value","property":"P407","hash":"daf1c4fcb58181b02dff9cc89deb084004ddae4b","datavalue":{"value":{"entity-type":"item","numeric-id":1860,"id":"Q1860"},"type":"wikibase-entityid"},"datatype":"wikibase-item"}]},"qualifiers-order":["P407"],"id":"P5833$57317434-98FF-4815-B7BB-74901561CFFD","rank":"normal","references":[{"hash":"c74269dfc384fad1babceaea90937649f8992c2c","snaks":{"P4656":[{"snaktype":"value","property":"P4656","hash":"c197ba9ef96a6b71ef0a1c99cb20727fe50a0b6e","datavalue":{"value":"https://www.wikidata.org/w/index.php?title=Wikidata:Property_proposal/Playbill_production_ID&oldid=745797888","type":"string"},"datatype":"url"}]},"snaks-order":["P4656"]}]}],
  P31: [{"mainsnak":{"snaktype":"value","property":"P31","hash":"af33940867bd5b19d9096cf17cdac5242fb4cafc","datavalue":{"value":{"entity-type":"item","numeric-id":19833377,"id":"Q19833377"},"type":"wikibase-entityid"},"datatype":"wikibase-item"},"type":"statement","id":"P5833$BF9B893B-A9B8-463B-9A23-D7646ACF41F4","rank":"normal"},{"mainsnak":{"snaktype":"value","property":"P31","hash":"a9b7667575b0f866ab022e7346bbb6cae9ec3533","datavalue":{"value":{"entity-type":"item","numeric-id":46275839,"id":"Q46275839"},"type":"wikibase-entityid"},"datatype":"wikibase-item"},"type":"statement","id":"P5833$31569e18-4a56-c80f-35ad-9c501c105283","rank":"normal"}],
  P2264: [{"mainsnak":{"snaktype":"value","property":"P2264","hash":"56d8265ba69817f3e1c1a9bb0410a7df1c34850f","datavalue":{"value":"1931","type":"string"},"datatype":"external-id"},"type":"statement","qualifiers":{"P8555":[{"snaktype":"value","property":"P8555","hash":"54b346c368058843454b5d9e042db24914d5a0b2","datavalue":{"value":{"time":"+2018-10-25T00:00:00Z","timezone":0,"before":0,"after":0,"precision":11,"calendarmodel":"http://www.wikidata.org/entity/Q1985727"},"type":"time"},"datatype":"time"}],"P1552":[{"snaktype":"value","property":"P1552","hash":"b4636808a1e4a280c93851e6873e89f0880bc39c","datavalue":{"value":{"entity-type":"item","numeric-id":116480204,"id":"Q116480204"},"type":"wikibase-entityid"},"datatype":"wikibase-item"}],"P1810":[{"snaktype":"value","property":"P1810","hash":"8113d09f209571a076b9f745f19a9f8329a4a400","datavalue":{"value":"Playbill production","type":"string"},"datatype":"string"}]},"qualifiers-order":["P8555","P1552","P1810"],"id":"P5833$6d6732a8-4921-ac8e-73b2-8cee460d0229","rank":"normal"}],
  P1659: [{"mainsnak":{"snaktype":"value","property":"P1659","hash":"a536ca6726f21acabfad8f475e24ce8057ad4e97","datavalue":{"value":{"entity-type":"property","numeric-id":6113,"id":"P6113"},"type":"wikibase-entityid"},"datatype":"wikibase-property"},"type":"statement","id":"P5833$8adfa5cb-4657-1b36-9608-897b25617af6","rank":"normal"},{"mainsnak":{"snaktype":"value","property":"P1659","hash":"ffa9aa6122fa80856211f4ebbde54d74571531e0","datavalue":{"value":{"entity-type":"property","numeric-id":6132,"id":"P6132"},"type":"wikibase-entityid"},"datatype":"wikibase-property"},"type":"statement","id":"P5833$c5eb107f-4e3d-fad4-2c0c-38962d8e84fe","rank":"normal"},{"mainsnak":{"snaktype":"value","property":"P1659","hash":"57f319dcfbf20ed4dd18c5d834804def4d809bfa","datavalue":{"value":{"entity-type":"property","numeric-id":7398,"id":"P7398"},"type":"wikibase-entityid"},"datatype":"wikibase-property"},"type":"statement","id":"P5833$6b26c078-4b8f-21f5-11a0-d7d62def553b","rank":"normal"},{"mainsnak":{"snaktype":"value","property":"P1659","hash":"3aeb60b9d832af28ebfa254ec8dad50910f52955","datavalue":{"value":{"entity-type":"property","numeric-id":1218,"id":"P1218"},"type":"wikibase-entityid"},"datatype":"wikibase-property"},"type":"statement","id":"P5833$e7508c05-46f6-caec-5d22-49bbda88d4f0","rank":"normal"},{"mainsnak":{"snaktype":"value","property":"P1659","hash":"b8f5d689e6dabb601966ebd009d092f41d138bf1","datavalue":{"value":{"entity-type":"property","numeric-id":1219,"id":"P1219"},"type":"wikibase-entityid"},"datatype":"wikibase-property"},"type":"statement","id":"P5833$a534c118-4177-0762-2ba5-9ce9834b112e","rank":"normal"}],
  P1793: [{"mainsnak":{"snaktype":"value","property":"P1793","hash":"5598afca8ff3f46a353fc49d2fc946e9f6b57203","datavalue":{"value":"[a-z0-9]+(-[a-z0-9]+)*-\\d{10}","type":"string"},"datatype":"string"},"type":"statement","id":"P5833$EEA02F67-1A74-477B-B971-8F83E2629033","rank":"normal","references":[{"hash":"c74269dfc384fad1babceaea90937649f8992c2c","snaks":{"P4656":[{"snaktype":"value","property":"P4656","hash":"c197ba9ef96a6b71ef0a1c99cb20727fe50a0b6e","datavalue":{"value":"https://www.wikidata.org/w/index.php?title=Wikidata:Property_proposal/Playbill_production_ID&oldid=745797888","type":"string"},"datatype":"url"}]},"snaks-order":["P4656"]}]}],
  P2910: [{"mainsnak":{"snaktype":"value","property":"P2910","hash":"bc9fb9f2402912b86ab4e4e6edb7cfd7b27d3820","datavalue":{"value":"Playbill.com favicon.png","type":"string"},"datatype":"commonsMedia"},"type":"statement","id":"P5833$5e80da76-4af9-526e-b3b8-7bf4cb21d4fa","rank":"normal"}],
  P1855: [{"mainsnak":{"snaktype":"value","property":"P1855","hash":"5c2fcf94e4d862dbcb908a677ff91a1417b86954","datavalue":{"value":{"entity-type":"item","numeric-id":3028308,"id":"Q3028308"},"type":"wikibase-entityid"},"datatype":"wikibase-item"},"type":"statement","qualifiers":{"P5833":[{"snaktype":"value","property":"P5833","hash":"910101f2780633bd3150c13a5a0412780e931974","datavalue":{"value":"finians-rainbow-46th-street-theatre-vault-0000013170","type":"string"},"datatype":"external-id"}]},"qualifiers-order":["P5833"],"id":"P5833$38073C62-CCE7-4D53-87D9-6E6CD00A452E","rank":"normal","references":[{"hash":"c74269dfc384fad1babceaea90937649f8992c2c","snaks":{"P4656":[{"snaktype":"value","property":"P4656","hash":"c197ba9ef96a6b71ef0a1c99cb20727fe50a0b6e","datavalue":{"value":"https://www.wikidata.org/w/index.php?title=Wikidata:Property_proposal/Playbill_production_ID&oldid=745797888","type":"string"},"datatype":"url"}]},"snaks-order":["P4656"]}]},{"mainsnak":{"snaktype":"value","property":"P1855","hash":"d8c9987465004dcaf493354205f3782063afff50","datavalue":{"value":{"entity-type":"item","numeric-id":48742772,"id":"Q48742772"},"type":"wikibase-entityid"},"datatype":"wikibase-item"},"type":"statement","qualifiers":{"P5833":[{"snaktype":"value","property":"P5833","hash":"9eca8f7556bcb0823c2241b999eae77da265fa86","datavalue":{"value":"memphis-bound-broadway-theatre-vault-0000012354","type":"string"},"datatype":"external-id"}]},"qualifiers-order":["P5833"],"id":"P5833$BC726CB8-A9CD-487E-8CA6-0FCCA2A8B427","rank":"normal","references":[{"hash":"c74269dfc384fad1babceaea90937649f8992c2c","snaks":{"P4656":[{"snaktype":"value","property":"P4656","hash":"c197ba9ef96a6b71ef0a1c99cb20727fe50a0b6e","datavalue":{"value":"https://www.wikidata.org/w/index.php?title=Wikidata:Property_proposal/Playbill_production_ID&oldid=745797888","type":"string"},"datatype":"url"}]},"snaks-order":["P4656"]}]},{"mainsnak":{"snaktype":"value","property":"P1855","hash":"e20ad5f034d356320f9d6f7313491bb9bf42d1d8","datavalue":{"value":{"entity-type":"item","numeric-id":1338894,"id":"Q1338894"},"type":"wikibase-entityid"},"datatype":"wikibase-item"},"type":"statement","qualifiers":{"P5833":[{"snaktype":"value","property":"P5833","hash":"c4db286267411c34f448ac159dd00a86c39af74e","datavalue":{"value":"lost-in-the-stars-music-box-theatre-vault-0000002650","type":"string"},"datatype":"external-id"}]},"qualifiers-order":["P5833"],"id":"P5833$FBAE913C-E45C-4854-BB97-42374CA07F71","rank":"normal","references":[{"hash":"c74269dfc384fad1babceaea90937649f8992c2c","snaks":{"P4656":[{"snaktype":"value","property":"P4656","hash":"c197ba9ef96a6b71ef0a1c99cb20727fe50a0b6e","datavalue":{"value":"https://www.wikidata.org/w/index.php?title=Wikidata:Property_proposal/Playbill_production_ID&oldid=745797888","type":"string"},"datatype":"url"}]},"snaks-order":["P4656"]}]},{"mainsnak":{"snaktype":"value","property":"P1855","hash":"2d2faf2412c3bb807e004db865eb79fd3c7056ed","datavalue":{"value":{"entity-type":"item","numeric-id":487330,"id":"Q487330"},"type":"wikibase-entityid"},"datatype":"wikibase-item"},"type":"statement","qualifiers":{"P5833":[{"snaktype":"value","property":"P5833","hash":"5cbd7e503911cbb1c072d42952756025f7718ead","datavalue":{"value":"fiddler-on-the-roof-imperial-theatre-vault-0000006051","type":"string"},"datatype":"external-id"}]},"qualifiers-order":["P5833"],"id":"P5833$80E9EB45-1AC0-46F5-9E77-0D33AE492D12","rank":"normal","references":[{"hash":"c74269dfc384fad1babceaea90937649f8992c2c","snaks":{"P4656":[{"snaktype":"value","property":"P4656","hash":"c197ba9ef96a6b71ef0a1c99cb20727fe50a0b6e","datavalue":{"value":"https://www.wikidata.org/w/index.php?title=Wikidata:Property_proposal/Playbill_production_ID&oldid=745797888","type":"string"},"datatype":"url"}]},"snaks-order":["P4656"]}]}]
} } }, success: 1 }

const snak = (property, datatype, type, value, snaktype = 'value') => (snaktype === 'value'
  ? { snaktype, property, hash: 'h', datavalue: { value, type }, datatype }
  : { snaktype, property, hash: 'h', datatype })
const eid = id => ({ 'entity-type': id[0] === 'P' ? 'property' : 'item', 'numeric-id': Number(id.slice(1)), id })
const ent = (property, id) => snak(property, id[0] === 'P' ? 'wikibase-property' : 'wikibase-item', 'wikibase-entityid', eid(id))
const str = (property, s) => snak(property, 'string', 'string', s)
const stmt = (main, { rank = 'normal', q, refs } = {}) => ({ mainsnak: main, type: 'statement', id: 'x', rank, ...(q ? { qualifiers: q, 'qualifiers-order': Object.keys(q) } : {}), ...(refs ? { references: [{ hash: 'REFHASH', snaks: { P248: [ent('P248', 'Q1')] } }] } : {}) })
const item = (id, claims, extra = {}) => ({ type: 'item', id, labels: { en: { language: 'en', value: `label ${id}` } }, descriptions: { en: { language: 'en', value: `description ${id}` } }, claims, ...extra })
const ans = (...entities) => ({ entities: Object.fromEntries(entities.map(e => [e.id, e])), success: 1 })

const selfTest = async () => {
  const { check, summarize } = createChecks()
  const J = JSON.stringify

  // A real response.
  const real = REAL_P5833.entities.P5833
  const acc0 = newAcc()
  const d = digestItem('P5833', real, acc0)
  check('the real excerpt reads: 15 statements, in the order the API gave them', d.ok && d.n === 15 && d.statements.map(s => s.p).join() === 'P1630,P31,P31,P2264,P1659,P1659,P1659,P1659,P1659,P1793,P2910,P1855,P1855,P1855,P1855', d.ok ? d.statements.map(s => s.p).join() : d.why)
  const p1630 = d.statements?.find(s => s.p === 'P1630')
  check('the real P1630 statement keeps its value, its rank and its one qualifier', J(p1630) === J({ p: 'P1630', v: 'https://www.playbill.com/production/$1', r: 'normal', q: [['P407', 'Q1860']] }), J(p1630))
  check('the real excerpt: an item value reads as its id, a property value as its P id, a string as itself', d.statements[1].v === 'Q19833377' && d.statements[3].v === '1931' && d.statements.find(s => s.p === 'P1659').v === 'P6113' && d.statements.find(s => s.p === 'P1793').v === '[a-z0-9]+(-[a-z0-9]+)*-\\d{10}', J(d.statements.slice(0, 5)))
  check('the real excerpt carries 8 qualifier values in all, and none of its references\' text or hashes is in the digest', d.statements.reduce((n, s) => n + (s.q?.length ?? 0), 0) === 8 && (() => { const refs = Object.values(real.claims).flat().flatMap(s => s.references ?? []); return refs.length === 6 && refs.every(r => !J(d).includes(r.hash)) })(), J(d).slice(0, 200))
  check('the real excerpt: datatypes are recorded per property, for main statements and qualifiers alike', acc0.dt.P31 === 'wikibase-item' && acc0.dt.P1659 === 'wikibase-property' && acc0.dt.P2264 === 'external-id' && acc0.dt.P1630 === 'string' && acc0.dt.P407 !== undefined, J(acc0.dt))
  const exampleQ = d.statements.filter(s => s.p === 'P1855').flatMap(s => s.q ?? []).filter(([qp]) => qp === 'P5833')
  check('the real excerpt: the example strings under P1855 are kept as text, and one of them has "roof" in it by accident', exampleQ.length === 4 && exampleQ.some(([, v]) => /fiddler-on-the-roof/.test(v)), J(exampleQ))
  const want0 = idsToLabel(acc0)
  check('the real excerpt: the ids the labels pass asks for are the entity values and the properties seen, qualifiers included, once each', want0.ask.includes('Q19833377') && want0.ask.includes('P6113') && want0.ask.includes('P407') && want0.ask.includes('Q1860') && new Set(want0.ask).size === want0.ask.length && want0.skip.length === 0, J(want0).slice(0, 200))

  // Other shapes of snak.
  const acc1 = newAcc()
  const shapes = digestItem('Q1', item('Q1', {
    P1: [stmt(snak('P1', 'wikibase-item', null, null, 'somevalue'), { q: { P2: [snak('P2', 'time', null, null, 'novalue')] } })],
    P3: [stmt(snak('P3', 'monolingualtext', 'monolingualtext', { language: 'fr', text: 'Le Stade' }))],
    P4: [stmt(snak('P4', 'quantity', 'quantity', { amount: '+50000', unit: 'http://www.wikidata.org/entity/Q11573' })), stmt(snak('P4', 'quantity', 'quantity', { amount: '+3', unit: '1' }))],
    P5: [stmt(snak('P5', 'time', 'time', { time: '+2016-07-22T00:00:00Z', precision: 11 }))],
    P6: [stmt(snak('P6', 'globe-coordinate', 'globecoordinate', { latitude: 44.974, longitude: -93.258 }))],
    P7: [stmt(snak('P7', 'math', 'math-expression', { expr: 'x' }))],
    P8: [stmt(str('P8', 'a'), { rank: 'preferred' }), stmt(str('P8', 'b'), { rank: 'deprecated' }), stmt(str('P8', 'c'))],
  }), acc1)
  const byP = p => (shapes.statements ?? []).filter(s => s.p === p)
  check('the shapes item reads, all 10 of its statements (1 + 1 + 2 + 1 + 1 + 1 + 3)', shapes.ok === true && shapes.n === 10, J(shapes).slice(0, 200))
  check('a somevalue main snak is kept as k somevalue with no value, and a novalue qualifier likewise', J(byP('P1')) === J([{ p: 'P1', v: null, r: 'normal', k: 'somevalue', q: [['P2', null, 'novalue']] }]), J(byP('P1')))
  check('monolingual text reads language:text; a quantity its amount and its unit item, and with unit 1 no unit; a time its precision; a coordinate latitude,longitude', byP('P3')[0]?.v === 'fr:Le Stade' && byP('P4')[0]?.v === '+50000 Q11573' && byP('P4')[1]?.v === '+3' && byP('P5')[0]?.v === '+2016-07-22T00:00:00Z/11' && byP('P6')[0]?.v === '44.974,-93.258', J(shapes.statements))
  check('a datavalue type this probe does not know is kept whole as JSON, not dropped', byP('P7')[0]?.v === '{"expr":"x"}', J(byP('P7')))
  check('every statement keeps its rank: preferred and deprecated are not read as normal', byP('P8').map(s => s.r).join() === 'preferred,deprecated,normal', J(byP('P8')))

  // Things that must be failures and not "no statements", and that add nothing to what the run will go on to ask for.
  const bad = (name, e, why) => { const a = newAcc(); const r = digestItem('Q1', e, a); check(name, r.ok === false && why.test(r.why) && r.statements === undefined && a.props.size === 0 && a.entityValues.size === 0 && Object.keys(a.dt).length === 0, J([r, [...a.props]])) }
  bad('a value snak without a datavalue makes the item NOT READ with the reason, and keeps no partial statements', item('Q1', { P1: [stmt(str('P1', 'ok')), stmt({ snaktype: 'value', property: 'P1', datatype: 'string' })] }), /without a datavalue/)
  bad('a statement under one property whose main snak names another is not read', item('Q1', { P1: [stmt(str('P2', 'x'))] }), /main snak for P2/)
  bad('a rank outside normal, preferred and deprecated is not read', item('Q1', { P1: [stmt(str('P1', 'x'), { rank: 'great' })] }), /rank "great"/)
  bad('an answer with no claims member is not read (not an item with no statements)', { type: 'item', id: 'Q1', labels: {} }, /no claims member/)
  bad('a non-empty array where the claims map belongs is not read', item('Q1', [1]), /non-empty array/)
  bad('an entity that Wikidata says is missing is not read, and says so', { id: 'Q1', missing: '' }, /missing/)
  bad('an answer for another id with no redirect from the one asked is not read', item('Q2', {}), /answer is for Q2/)
  bad('an id the answer does not hold is not read', undefined, /not in the answer/)
  const none = digestItem('Q1', item('Q1', []), newAcc())
  check('format 1\'s empty claims, [], is an item with 0 statements and no label map [] is no label', none.ok && none.n === 0 && digestItem('Q1', { ...item('Q1', {}), labels: [], descriptions: [] }, newAcc()).label === null)
  const merged = digestItem('Q1', item('Q2', {}, { redirects: { from: 'Q1', to: 'Q2' } }), newAcc())
  check('a merged item, answered under the target with a redirect from the id asked, is read and records the target', merged.ok && merged.redirectedTo === 'Q2' && merged.id === 'Q2', J(merged))
  check('the entity for an id asked is found under that id, or under the key that records a redirect from it', entityFor({ Q2: { id: 'Q2', redirects: { from: 'Q1' } } }, 'Q1')?.id === 'Q2' && entityFor({ Q1: { id: 'Q2' } }, 'Q1')?.id === 'Q2' && entityFor({ Q2: { id: 'Q2' } }, 'Q1') === undefined)
  check('the label and description are the English ones', digestItem('Q9', item('Q9', {}), newAcc()).label === 'label Q9' && digestItem('Q9', item('Q9', {}), newAcc()).description === 'description Q9')
  const accC = newAcc()
  digestItem('Q1', item('Q1', { P1: [stmt(str('P1', 'x'))] }), accC)
  mergeAcc(accC, (() => { const x = newAcc(); digestItem('Q2', item('Q2', { P1: [stmt(ent('P1', 'Q5'))] }), x); return x })())
  check('one property seen with two datatypes is recorded as a conflict', accC.dtConflicts.length === 1 && /P1: string and wikibase-item/.test(accC.dtConflicts[0]), J(accC.dtConflicts))

  // The request.
  check('the items request is wbgetentities for claims, labels and descriptions in English, ids joined by |', itemsUrl(['Q1', 'Q2']) === 'https://www.wikidata.org/w/api.php?action=wbgetentities&ids=Q1|Q2&props=claims|labels|descriptions&languages=en&format=json', itemsUrl(['Q1', 'Q2']))
  check('the labels request asks for labels and descriptions and not for claims', labelsUrl(['Q1', 'P2']).includes('props=labels|descriptions') && !/claims/.test(labelsUrl(['Q1', 'P2'])), labelsUrl(['Q1', 'P2']))
  check('a failure the API reports with HTTP 200 is a failure that names its code', /missingtitle/.test(answerOf({ error: { code: 'missingtitle', info: 'x' } }).why) && !answerOf({ success: 1 }).ok && !answerOf({ entities: [] }).ok && answerOf({ entities: { Q1: {} } }).ok)
  const pop = population({ 'wd-roof-p1552|Q20': {}, 'wd-roof-p1552|Q3': {}, 'wd-roof-p1552|Q3x': {}, 'wd-roof-p1552|Q0': {}, 'wp-lead|Foo': {}, 'wd-roof|Q7': {}, 'wd-roof-p1552|Q100': {} })
  check('the population is the wd-roof-p1552| keys that are Q-ids, in id order, a key that is not one is named, and a key of the kind that held P5624 answers (wd-roof|) is not read', pop.ids.join() === 'Q3,Q20,Q100' && pop.bad.join() === 'wd-roof-p1552|Q3x,wd-roof-p1552|Q0', J(pop))
  const res = (status, body, headers = {}) => ({ status, ok: status >= 200 && status < 300, headers: { get: k => headers[k] ?? null }, json: async () => { if (body === undefined) throw new Error('Unexpected token <'); return body } })
  const seq = (...rs) => { let i = 0; return async () => rs[i++] }
  const waits = []
  const rec = await getRecorded('u', { fetchImpl: seq(res(429, {}, { 'retry-after': '2' }), res(200, { a: 1 })), wait: ms => waits.push(ms) })
  check('a 429 is retried after the server\'s Retry-After, and both attempts are recorded', rec.ok && rec.attempts.map(a => a.status).join() === '429,200' && waits.join() === '2000', J([rec.attempts, waits]))
  const nj = await getRecorded('u', { fetchImpl: seq(res(200, undefined)), wait: () => {} })
  check('a 200 that is not JSON is a failure that says so, not a retry', !nj.ok && /not JSON/.test(nj.why) && nj.attempts.length === 1)
  const nf = await getRecorded('u', { fetchImpl: seq(res(404, {})), wait: () => {} })
  check('a 404 is a failure after one attempt', !nf.ok && nf.why === 'HTTP 404' && nf.attempts.length === 1)
  const five = await getRecorded('u', { fetchImpl: seq(res(503, {}), res(503, {}), res(503, {}), res(503, {})), wait: () => {} })
  check('a 503 four times is a failure after four attempts', !five.ok && five.attempts.length === 4 && five.why === 'HTTP 503')
  const thrown = await getRecorded('u', { fetchImpl: async () => { throw new Error('socket hang up') }, wait: () => {} })
  check('a request that throws is retried, and the failure says why', !thrown.ok && thrown.attempts.length === 4 && /socket hang up/.test(thrown.why))
  const sent = []
  await getRecorded('https://example.test/x', { fetchImpl: async (url, init) => { sent.push([url, init.headers['User-Agent'], typeof init.signal]); return res(200, { a: 1 }) }, wait: () => {} })
  check('every request names this repository in its User-Agent and carries a timeout signal', sent.length === 1 && sent[0][1] === UA && /github\.com\/jeffunglesbee-create\/field-laboratory/.test(UA) && sent[0][2] === 'object', J(sent))

  // The labels pass.
  const lab = {}
  readLabels({ Q1: { id: 'Q1', labels: { en: { language: 'en', value: 'one' } }, descriptions: [] }, Q2: { id: 'Q2', labels: [], descriptions: { en: { language: 'en', value: 'two' } } }, Q3: { id: 'Q3', missing: '' }, Q9: { id: 'Q9', labels: [1], descriptions: [] } }, ['Q1', 'Q2', 'Q3', 'Q4', 'Q9'], lab)
  check('a label is { l, d }, an empty map is no label, a missing id says so, an id the answer lacks gets nothing, a malformed map is recorded', J(lab.Q1) === '{"l":"one","d":null}' && J(lab.Q2) === '{"l":null,"d":"two"}' && lab.Q3.missing === true && !('Q4' in lab) && lab.Q9.bad !== undefined, J(lab))
  const want1 = idsToLabel({ entityValues: new Set(['Q5', 'Q7', 'L3', 'L3-F1']), props: new Set(['P31', 'P2']) }, { Q7: { l: 'x', d: null } })
  check('ids to label: items then properties, in number order, less those already labelled; ids that are not Q or P are named and not asked for', J(want1) === J({ ask: ['Q5', 'P2', 'P31'], skip: ['L3', 'L3-F1'] }), J(want1))

  // The whole run, against a fake network.
  const CACHE_FAKE = { 'wd-roof-p1552|Q1410402': { at: 1 }, 'wd-roof-p1552|Q2': { at: 1 }, 'wp-lead|Foo': { at: 1 } }
  const names = { Q483110: 'stadium', Q7316894: 'retractable roof', Q625797: 'domed stadium', Q5: 'person', P31: 'instance of', P1552: 'has characteristic', P2046: 'area', P1000: 'note' }
  const claimsFor = {
    Q1410402: { P31: [stmt(ent('P31', 'Q483110')), stmt(ent('P31', 'Q625797'))], P1552: [stmt(ent('P1552', 'Q7316894'))], P1000: [stmt(str('P1000', 'Indoor football venue')), stmt(str('P1000', 'the fiddler-on-the-roof example'))] },
    Q2: { P31: [stmt(ent('P31', 'Q483110'))], P2046: [stmt(snak('P2046', 'quantity', 'quantity', { amount: '+12', unit: '1' }))] },
  }
  const servedItem = id => item(id, claimsFor[id], { labels: id === 'Q2' ? [] : { en: { language: 'en', value: 'Stade Pierre-Mauroy' } } })
  const mk = ({ failItems = false, failLabels = false, noControl = false, goneId = null, noAnswerFor = null, seen = [] } = {}) => async url => {
    seen.push(url)
    const ids = /ids=([^&]+)/.exec(url)[1].split('|')
    if (/props=claims/.test(url)) {
      if (failItems) return { ok: false, why: 'HTTP 503', attempts: [{ status: 503, ms: 5 }] }
      return { ok: true, attempts: [{ status: 200, ms: 5 }], value: ans(...ids.map(id => (noControl && id === 'Q1410402' ? item(id, { P31: [stmt(ent('P31', 'Q483110'))] }) : servedItem(id)))) }
    }
    if (failLabels) return { ok: false, why: 'HTTP 500', attempts: [{ status: 500, ms: 5 }] }
    return { ok: true, attempts: [{ status: 200, ms: 5 }], value: ans(...ids.filter(id => id !== noAnswerFor).map(id => (id === goneId ? { id, missing: '' } : { id, labels: names[id] ? { en: { language: 'en', value: names[id] } } : [], descriptions: [] }))) }
  }
  const waitsRun = []
  const seen = []
  const out = await run({ cache: CACHE_FAKE, fetchJson: mk({ seen }), wait: async ms => { waitsRun.push(ms) }, now: () => 0 })
  const v = verdict(out)
  check('the run reads both items, labels every id it must, finds the control, and passes its own verdict', out.complete && analyze(out).read.length === 2 && v.code === 0 && out.control.found[0]?.p === 'P1552', J([v, out.control]))
  check('the first request does not wait and each later one waits the gap', waitsRun.length === out.requests - 1 && waitsRun.every(ms => ms === GAP_MS), J(waitsRun))
  check('one request carries the two items (under the batch size) and one the labels: 2 requests', seen.length === 2 && seen.filter(u => /props=claims/.test(u)).length === 1, J(seen.map(u => u.slice(0, 90))))
  check('the labels asked for are the values and properties not already labelled, and the output records which', J(out.labelIds) === J(['Q483110', 'Q625797', 'Q7316894', 'P31', 'P1000', 'P1552', 'P2046']) && out.labels.Q7316894.l === 'retractable roof' && out.labels.Q1410402.l === 'Stade Pierre-Mauroy' && out.labels.Q2.l === null, J([out.labelIds, out.labels]))
  const rep = report(out)
  check('the report names its denominators: items read, statements, the ids labelled, and the control', /items read 2 of 2/.test(rep) && /statements 7 on the 2 items read/.test(rep) && /ids to label 7: labelled 7 of 7, of which 0 have no English label/.test(rep) && /CONTROL Q1410402 Stade Pierre-Mauroy: read \(5 statements\); carries Q7316894 "retractable roof" under P1552 "has characteristic" \(main/.test(rep), rep.split('\n').slice(0, 7).join(' | '))
  check('the report lists a roof-ish item value with its class, a roof-ish text value, and a roof word by accident as "no pattern"', /P31\s+"instance of".*= "domed stadium" \(Q625797\)\s+1 of 2 items\s+\[dome\]/.test(rep) && /P1000\s+"note".*= "Indoor football venue"\s+1 of 2 items\s+\[dome\]/.test(rep) && /= "the fiddler-on-the-roof example"\s+1 of 2 items\s+\[no pattern\]/.test(rep) && /= "retractable roof" \(Q7316894\)\s+1 of 2 items\s+\[retractable\]/.test(rep), rep.split('\n').filter(l => /domed|Indoor|fiddler|retractable roof"/.test(l)).join(' | '))
  const back = JSON.parse(serialize(out))
  check('the file round-trips, and the text report of the parsed file is the report of the run', J(back) === J(out) && report(back) === rep)
  check('the file has one item and one label to a line', serialize(out).split('\n').filter(l => /^  "Q1410402": \{"ok":true/.test(l)).length === 1 && serialize(out).split('\n').filter(l => /^  "Q7316894": /.test(l)).length === 1)
  const many = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`wd-roof-p1552|Q${100 + i}`, { at: 1 }]))
  const seenMany = []
  await run({ cache: many, fetchJson: async url => { seenMany.push(url); const ids = /ids=([^&]+)/.exec(url)[1].split('|'); return /props=claims/.test(url) ? { ok: true, attempts: [{ status: 200, ms: 1 }], value: ans(...ids.map(id => item(id, {}))) } : { ok: true, attempts: [{ status: 200, ms: 1 }], value: ans() } }, wait: async () => {}, now: () => 0 })
  const sizes = seenMany.filter(u => /props=claims/.test(u)).map(u => /ids=([^&]+)/.exec(u)[1].split('|').length)
  check('60 items go in requests of at most the batch size: 25, 25 and 10', sizes.join() === '25,25,10' && ITEM_BATCH === 25, J(sizes))
  const labelBatches = (() => { const ids = Array.from({ length: 120 }, (_, i) => `Q${1000 + i}`); const c = { 'wd-roof-p1552|Q1': { at: 1 } }; return { ids, c } })()
  const seenLab = []
  await run({ cache: labelBatches.c, fetchJson: async url => { seenLab.push(url); const ids = /ids=([^&]+)/.exec(url)[1].split('|'); return /props=claims/.test(url) ? { ok: true, attempts: [{ status: 200, ms: 1 }], value: ans(item('Q1', { P1: labelBatches.ids.map(i => stmt(ent('P1', i))) })) } : { ok: true, attempts: [{ status: 200, ms: 1 }], value: ans(...ids.map(id => ({ id, labels: [], descriptions: [] }))) } }, wait: async () => {}, now: () => 0 })
  const lsizes = seenLab.filter(u => /props=labels/.test(u)).map(u => /ids=([^&]+)/.exec(u)[1].split('|').length)
  check('121 ids to label (120 items and a property) go in requests of at most the batch size: 50, 50 and 21', lsizes.join() === '50,50,21' && LABEL_BATCH === 50, J(lsizes))

  // The run, broken in the ways a runner can break it.
  const dead = await run({ cache: CACHE_FAKE, fetchJson: mk({ failItems: true }), wait: async () => {}, now: () => 0 })
  const dv = verdict(dead)
  check('an items request that fails leaves each of its items NOT READ with the reason, and the verdict says "2 of 2"', dead.items.Q2.ok === false && /HTTP 503/.test(dead.items.Q2.why) && dv.code === 1 && dv.problems.some(p => /2 of 2 items were not read/.test(p)) && /NOT READ\s+Q2: HTTP 503/.test(report(dead)), J(dv))
  check('the coverage line of a run that read nothing says "items read 0 of 2", the 2 being the items asked for', /COVERAGE: items read 0 of 2 /.test(report(dead)), report(dead).split('\n')[1])
  const nolab = await run({ cache: CACHE_FAKE, fetchJson: mk({ failLabels: true }), wait: async () => {}, now: () => 0 })
  const lv = verdict(nolab)
  check('a labels request that fails is recorded, the ids stay unlabelled, and the verdict counts them as "n of m"', nolab.labelFailures.length === 1 && lv.code === 1 && lv.problems.some(p => /\d+ of 7 ids were not answered by the labels request/.test(p)) && /LABEL BATCH FAILED\s+\d+ ids from Q483110: HTTP 500/.test(report(nolab)), J([lv, nolab.labelFailures]))
  check('the label line of that run says "labelled 0 of 7", the 7 being the ids that needed a label', /ids to label 7: labelled 0 of 7, of which 0 have no English label; missing on Wikidata 0; not answered 7;/.test(report(nolab)), report(nolab).split('\n').find(l => /ids to label/.test(l)))
  const gone = await run({ cache: CACHE_FAKE, fetchJson: mk({ goneId: 'Q625797' }), wait: async () => {}, now: () => 0 })
  check('a value that points to an item Wikidata says is missing is counted and named, and is a measured fact, not a failed read: the verdict passes', gone.labels.Q625797?.missing === true && verdict(gone).code === 0 && /ids to label 7: labelled 6 of 7, of which 0 have no English label; missing on Wikidata 1 \(Q625797\); not answered 0;/.test(report(gone)), J([verdict(gone), report(gone).split('\n').find(l => /ids to label/.test(l))]))
  const silent = await run({ cache: CACHE_FAKE, fetchJson: mk({ noAnswerFor: 'Q625797' }), wait: async () => {}, now: () => 0 })
  check('an id the labels answer leaves out is NOT ANSWERED, which fails the verdict and is not the same as missing on Wikidata', silent.labels.Q625797 === undefined && verdict(silent).code === 1 && verdict(silent).problems.some(p => /1 of 7 ids were not answered by the labels request/.test(p)) && /labelled 6 of 7, of which 0 have no English label; missing on Wikidata 0; not answered 1;/.test(report(silent)), J(verdict(silent)))
  const nc = await run({ cache: CACHE_FAKE, fetchJson: mk({ noControl: true }), wait: async () => {}, now: () => 0 })
  const ncv = verdict(nc)
  check('a control that is read but does not carry the value makes the verdict a failure that names the control, and the report says NOT FOUND', ncv.code === 1 && ncv.problems.some(p => /control Q1410402 carries no statement or qualifier value Q7316894/.test(p)) && /Q7316894 "retractable roof" NOT FOUND/.test(report(nc)), J(ncv))
  check('when the control is not found its own answer is kept raw in the output, so that a link held where the probe does not read can be seen without another run; when it is found, nothing is kept', nc.controlRaw?.id === 'Q1410402' && 'claims' in nc.controlRaw && /the control's own answer, as the API gave it, is kept in the JSON as controlRaw/.test(report(nc)) && out.controlRaw === null && !/controlRaw/.test(report(out)) && dead.controlRaw === null, J([nc.controlRaw?.id, out.controlRaw, dead.controlRaw]))
  const nr = await run({ cache: { 'wd-roof-p1552|Q2': { at: 1 } }, fetchJson: mk(), wait: async () => {}, now: () => 0 })
  check('a population that lacks the control item makes the control NOT READ and the verdict a failure', nr.control.read === false && verdict(nr).code === 1 && /CONTROL Q1410402 Stade Pierre-Mauroy: NOT READ/.test(report(nr)))
  const fatal = await run({ cache: CACHE_FAKE, fetchJson: async () => { throw new Error('boom') }, wait: async () => {}, now: () => 0 })
  check('an unexpected error ends the run as incomplete with the error kept, and the verdict fails and says why', fatal.complete === false && /boom/.test(fatal.fatal) && verdict(fatal).code === 1 && verdict(fatal).problems.some(p => /the run did not complete: .*boom/.test(p)), J(verdict(fatal)))
  const odd = verdict({ ...out, population: { items: 3, badKeys: ['wd-roof-p1552|Qx'] } })
  check('an item the population names that has no record, and a key that is not a Q-id, are each a problem', odd.code === 1 && odd.problems.some(p => /1 of 3 items have no record/.test(p)) && odd.problems.some(p => /1 wd-roof-p1552\| keys are not Q-ids/.test(p)), J(odd))
  const cq = controlFinding({ Q1410402: digestItem('Q1410402', item('Q1410402', { P31: [stmt(ent('P31', 'Q483110'), { q: { P2: [ent('P2', 'Q7316894')] } })] }), newAcc()) })
  check('a control value carried only as a qualifier is found, and the finding names the statement property and the qualifier', cq.read && cq.found.length === 1 && cq.found[0].where === 'qualifier' && cq.found[0].p === 'P31' && cq.found[0].qualifier === 'P2', J(cq))
  const cm = controlFinding({ Q1410402: digestItem('Q1410402', item('Q1410402', { P1552: [stmt(ent('P1552', 'Q7316894'))] }), newAcc()) })
  check('a control value carried as a main statement is found under its property and says main', cm.found.length === 1 && cm.found[0].where === 'main' && cm.found[0].p === 'P1552', J(cm))

  // What the run touches.
  const reads = [], writes = [], logged = []
  const code = await main({ readFile: p => { reads.push(p); return J(CACHE_FAKE) }, writeFile: (p, data) => writes.push([p, data]), mkdir: () => {}, fetchJson: mk(), log: m => logged.push(m), wait: async () => {} })
  check('the run reads the cache and nothing else, and writes the two probe files and nothing else', code === 0 && reads.join() === CACHE && writes.map(w => w[0]).join() === `${OUT_JSON},${OUT_TXT}` && OUT_JSON === 'outbox/venue-wikidata-statements-probe.json' && OUT_TXT === 'outbox/venue-wikidata-statements-probe.txt' && CACHE === 'outbox/venue-source-cache.json', J([reads, writes.map(w => w[0]), code]))
  check('the two files written are the run and its report: the JSON parses to the run, the text is its report, and the report is printed', JSON.parse(writes[0][1]).population.items === 2 && writes[1][1] === `${report(JSON.parse(writes[0][1]))}\n` && logged.includes(report(JSON.parse(writes[0][1]))))
  finish(summarize())
}

// --- main ---------------------------------------------------------------------------------------------------------

/** The run as the runner does it, with its reads, its writes and its network passed in so the self-test can show what it touches: it reads the cache and nothing else, and writes OUT_JSON and OUT_TXT and nothing else. Returns the verdict's code. */
export const main = async ({ readFile = readFileSync, writeFile = writeFileSync, mkdir = mkdirSync, fetchJson = getRecorded, log = console.log, wait = sleep } = {}) => {
  const cache = JSON.parse(readFile(CACHE, 'utf8'))
  const out = await run({ cache, fetchJson, wait, progress: log })
  mkdir('outbox', { recursive: true })
  writeFile(OUT_JSON, serialize(out))
  writeFile(OUT_TXT, report(out) + '\n')
  log(report(out))
  const v = verdict(out)
  for (const p of v.problems) log(`PROBLEM: ${p}`)
  return v.code
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--self-test')) await selfTest()
  else if (process.argv.includes('--report')) console.log(report(JSON.parse(readFileSync(process.argv[process.argv.indexOf('--report') + 1], 'utf8'))))
  else process.exitCode = await main()
}
