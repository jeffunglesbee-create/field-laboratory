// Criterion 4 of docs/CC-CMD-2026-11-09-venue-review-remainder.md, Task 2, option 3: what the infobox Roof field would do
// to every row of the sourcing results, computed offline from the committed probe, results and cache. Nothing is written
// to the results, the cache or the table; `--write` writes only this tool's own two files.
//
//   node outbox/venue-infobox-effect-2026-11-09.mjs --self-test
//   node outbox/venue-infobox-effect-2026-11-09.mjs                        the control only (no witness), no probe needed
//   node outbox/venue-infobox-effect-2026-11-09.mjs outbox/venue-infobox-probe.json [--join term=class,...] [--source infobox|categories] [--write]
//
// `--source categories` runs the SAME computation with the article's roof-named categories as the witness instead of the
// Roof field. The owner's ruling names the infobox; the categories are measured beside it, never built on without his
// word (the CC-CMD says so), and this is that measurement: what the rule would do if it read them.
//
// THE CONTROL COMES FIRST. The roof stage of `roofOf` (scripts/venue-source.mjs) is not exported, so its composition is
// replayed here from the cache (`wd-roof|qid`, `wp-lead|title`, `wp-bodyroof|title`) around the real `decideRoof`, and the
// replay has to reproduce the committed roof, basis and status of every row that has a roof stage before it is allowed to
// say anything about a witness. A row that cannot be replayed (a cache key is missing) is reported as not computable and
// never as unchanged.
//
// THE WITNESS (criterion 2). The Roof field of the infobox is free text. It counts as a closed roof only through the
// patterns `classifyRoof` already trusts, exactly: /retractable[- ]roof|roof that retracts/ for retractable, and
// /\bdomed\b|\bdome\b|fixed roof|enclosed stadium|\bindoor\b/ for dome. So the bare words "Retractable", "Fixed" and
// "Enclosed" are NOT witnesses (measured: classifyRoof("Retractable") is "open"), and neither are "Skylight" and
// "translucent". "Open" is never taken from the field. Two roof parameters that name different closed classes are a
// conflict and no witness. A term outside the patterns joins only through `--join term=class` after the joining test
// the report prints for it (criterion 2: on at least two rows whose closed roof Wikidata or the lead decide as that
// class, and on none decided otherwise), or on the owner's word; the match is the whole value, lower-cased.
//
// THE PRECEDENCE. A closed witness is one more positive source beside Wikidata P5624 and the lead: two positive sources
// naming different classes make the row review ("sources disagree"), one class makes the row that class, and a witness
// that equals what Wikidata or the lead already decided changes nothing and is counted as confirming. With no witness
// the result is `decideRoof`'s own, untouched (the control).

import { readFileSync, writeFileSync } from 'node:fs'
import { decideRoof, classifyRoof, pastTense } from '../scripts/venue-source.mjs'
import { rowsOf } from '../scripts/venue-infobox.mjs'
import { createChecks, finish, isMain } from '../scripts/checks.mjs'

const RESULTS = 'outbox/venue-source-results-latest.json'
const CACHE = 'outbox/venue-source-cache.json'
const EXTRACTS = 'outbox/venue-lead-whole-extracts-2026-11-09.json'
const OUT = 'outbox/venue-infobox-effect-2026-11-09'

// --- the inputs of the roof stage, from the cache ---------------------------------------------------

/** The three inputs `roofOf` hands to `decideRoof` for a row, read from the cache the way `roofOf` read them. */
export const stageInputs = (row, cache) => {
  if (!row.qid) return { kind: 'noqid' }
  const e = cache[`wd-roof|${row.qid}`]?.result
  if (!e) return { kind: 'uncached', what: `wd-roof|${row.qid}` }
  if (!e.ok) return { kind: 'wdfail', why: e.why }
  const b = e.value.results.bindings[0] || {}
  const title = b.article?.value?.split('/wiki/')[1] ?? null
  let lead = null, body = null, unanswered = null
  if (title) {
    const sum = cache[`wp-lead|${title}`]?.result, full = cache[`wp-bodyroof|${title}`]?.result
    if (!sum || !full) return { kind: 'uncached', what: `${!sum ? 'wp-lead' : 'wp-bodyroof'}|${title}` }
    if (sum.ok) lead = sum.value
    if (full.ok) body = full.value
    unanswered = !sum.ok ? `the Wikipedia summary did not answer: ${sum.why}` : !full.ok ? `the article body did not answer: ${full.why}` : null
  }
  return { kind: 'ok', wd: b.roofLabel?.value ?? null, lead, body, title, unanswered }
}

/** `roofOf`'s decision, with a closed witness `{cls, value, source}` ('infobox' or 'categories') as one more positive source when there is one. */
export const decideWith = (inp, witness = null) => {
  if (inp.kind === 'noqid') return decideRoof(null, null)
  if (inp.kind === 'wdfail') return { roof: null, basis: `wikidata unanswered: ${inp.why}` }
  let d = decideRoof(inp.wd, inp.lead, inp.body)
  if (witness) {
    const wdc = inp.wd ? classifyRoof(inp.wd) : null, ldc = inp.lead == null ? null : classifyRoof(inp.lead)
    const positives = [['wikidata', wdc], ['lead', ldc], [witness.source, witness.cls]].filter(([, c]) => c && c !== 'open')
    const classes = new Set(positives.map(([, c]) => c))
    if (classes.size > 1) d = { roof: null, basis: `sources disagree: ${positives.map(([s, c]) => `${s} ${c}`).join(', ')}` }
    else if (d.roof !== witness.cls) d = { roof: witness.cls, basis: `${witness.source === 'categories' ? 'categories' : 'infobox roof'} ${JSON.stringify(witness.value)}` }
  }
  return { ...d, basis: d.roof === null && inp.unanswered ? inp.unanswered : d.basis, lead: inp.lead?.slice(0, 200) ?? null }
}

/** The status `source` gives a row once its roof is known: the same four reasons, in the same terms. */
export const statusOf = (row, d) => {
  const domeName = /dome\b/i.test(row.name) && d.roof === 'open'
  const gone = pastTense(d.lead)
  return !d.roof || !row.zone || domeName || gone ? 'review' : 'accepted'
}

// --- the witness of one article ---------------------------------------------------------------------

const norm = v => v.toLowerCase().trim()
/** The class of one value: `classifyRoof`'s when it names a closed roof, else the class the whole value was joined to, else open (which is never a witness). */
export const classOf = (v, joined = null) => { const c = classifyRoof(v); return c !== 'open' ? c : (joined?.get(norm(v)) ?? 'open') }

/** What the Roof field of one article says: its state, its values, and a closed class only when every roof parameter agrees on one. */
export const witnessOf = (art, joined = null) => {
  if (!art) return { state: 'not requested', cls: null, values: [] }
  if (!art.fetch?.ok) return { state: 'fetch failed', cls: null, values: [] }
  if (!art.parse?.ok) return { state: 'parse failed', cls: null, values: [] }
  if (!art.infoboxes.length) return { state: 'no infobox', cls: null, values: [] }
  const roofs = art.infoboxes.flatMap(i => i.roof)
  if (!roofs.length) return { state: 'no roof parameter', cls: null, values: [] }
  const values = roofs.map(r => r.flat)
  const closed = new Set(values.map(v => classOf(v, joined)).filter(c => c !== 'open'))
  if (closed.size > 1) return { state: 'conflict', cls: null, values }
  if (closed.size === 1) return { state: 'closed roof', cls: [...closed][0], values }
  return { state: values.every(v => v === '') ? 'empty' : 'no witness', cls: null, values }
}

/** The categories that name a roof, as the probe's report picks them. Only these are listed as vocabulary. */
export const ROOFISH = /roof|dome|skylit|indoor|covered|enclosed|retractable|open-air/i

/** The same reading of an article's categories: the roof-named ones are the values, and a closed class counts only when they agree on one. */
export const witnessOfCategories = (art, joined = null) => {
  if (!art) return { state: 'not requested', cls: null, values: [] }
  if (!art.categories) return { state: 'no category answer', cls: null, values: [] }
  if (art.categories.missing) return { state: 'page missing', cls: null, values: [] }
  const values = art.categories.visible.filter(c => ROOFISH.test(c))
  if (!values.length) return { state: 'no roof category', cls: null, values }
  const closed = new Set(values.map(v => classOf(v, joined)).filter(c => c !== 'open'))
  if (closed.size > 1) return { state: 'conflict', cls: null, values }
  if (closed.size === 1) return { state: 'closed roof', cls: [...closed][0], values }
  return { state: 'no witness', cls: null, values }
}

// --- the effect on every row ------------------------------------------------------------------------

const evidenceOf = r => (r.roofBasis ?? '').startsWith('wikidata P5624') || r.roofBasis === 'wikipedia lead' ? 'evidence' : /^inferred/.test(r.roofBasis ?? '') ? 'inferred' : 'other'

export const effect = ({ results, cache, probe = null, extracts = [], joined = null, source = 'infobox' }) => {
  const rows = rowsOf(results)
  const para = new Map(extracts.map(x => [x.name, x.extract]))
  const staged = rows.filter(r => 'roofBasis' in r)
  const skipped = rows.filter(r => !('roofBasis' in r))
  const control = { same: 0, mismatches: [], notComputable: [] }
  const changed = [], confirmed = [], agreement = { agree: [], silent: [], disagree: [] }, unchanged = []
  const vocab = new Map()
  const witnessStates = new Map()
  for (const r of staged) {
    const inp = stageInputs(r, cache)
    if (inp.kind === 'uncached') { control.notComputable.push({ name: r.name, what: inp.what }); continue }
    const base = decideWith(inp, null), baseStatus = statusOf(r, base)
    if (base.roof === r.roof && base.basis === r.roofBasis && baseStatus === r.status) control.same++
    else { control.mismatches.push({ name: r.name, committed: [r.status, r.roof, r.roofBasis], replayed: [baseStatus, base.roof, base.basis] }); continue }
    if (!probe) continue
    const art = inp.title ? probe.articles?.[inp.title] : undefined
    const w = inp.title ? (source === 'categories' ? witnessOfCategories(art, joined) : witnessOf(art, joined)) : { state: 'no article', cls: null, values: [] }
    witnessStates.set(w.state, (witnessStates.get(w.state) ?? 0) + 1)
    const cat = (art?.categories?.visible ?? []).filter(c => ROOFISH.test(c))
    for (const v of w.values) {
      if (v === '' || classOf(v, joined) !== 'open') continue
      const x = vocab.get(v) ?? { rows: [] }
      x.rows.push({ name: r.name, roof: r.roof, kind: evidenceOf(r), status: r.status })
      vocab.set(v, x)
    }
    const after = decideWith(inp, w.cls ? { cls: w.cls, value: w.values.join(' | '), source } : null), afterStatus = statusOf(r, after)
    const line = { name: r.name, before: { status: r.status, roof: r.roof, basis: r.roofBasis }, after: { status: afterStatus, roof: after.roof, basis: after.basis },
      field: w.values, fieldState: w.state, wikidata: inp.wd, lead: inp.lead, categories: cat, extract: para.get(r.name)?.slice(0, 400) ?? null }
    if (r.roof === 'dome' || r.roof === 'retractable') {
      if (evidenceOf(r) === 'evidence') (w.cls === null ? agreement.silent : w.cls === r.roof ? agreement.agree : agreement.disagree).push(line)
    }
    if (afterStatus !== r.status || after.roof !== r.roof) changed.push(line)
    else if (w.cls) confirmed.push(line)
    else unchanged.push(line)
  }
  return { source, rows: rows.length, staged: staged.length, skipped, control, changed, confirmed, agreement, vocab, witnessStates, unchanged: unchanged.length }
}

// --- the report -------------------------------------------------------------------------------------

const tally = xs => { const m = new Map(); for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1); return [...m].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))) }
const short = (s, n) => (s == null ? 'null' : String(s).length > n ? `${String(s).slice(0, n)}...` : String(s))

export const report = (e, probe, joined = null) => {
  const L = []
  L.push(`venue-infobox effect, offline, witness source: ${e.source}; probe ${probe ? `run ${probe.run ?? 'local'}, ${probe.at}${probe.complete ? ', complete' : ', INCOMPLETE'}` : 'none (control only)'}`)
  L.push(`COVERAGE: roof stage replayed for ${e.control.same + e.control.mismatches.length} of ${e.rows} rows; ${e.skipped.length} never reach it (${tally(e.skipped.map(r => (r.why ?? 'no reason').replace(/\s*[:(].*/, ''))).map(([w, n]) => `${w} ${n}`).join(', ') || 'none'}); not computable (a cache key missing): ${e.control.notComputable.length}`)
  L.push(`CONTROL (no witness): ${e.control.same} of ${e.control.same + e.control.mismatches.length} replayed rows reproduce the committed roof, basis and status; mismatches ${e.control.mismatches.length}`)
  for (const m of e.control.mismatches.slice(0, 10)) L.push(`  MISMATCH ${m.name}: committed ${JSON.stringify(m.committed)}, replayed ${JSON.stringify(m.replayed)}`)
  for (const m of e.control.notComputable.slice(0, 10)) L.push(`  NOT COMPUTABLE ${m.name}: no ${m.what}`)
  if (!probe) return L.join('\n')
  L.push('')
  L.push(`JOINED TERMS (whole value, lower-cased): ${joined?.size ? [...joined].map(([t, c]) => `${JSON.stringify(t)} = ${c}`).join(', ') : 'none (strict: the classifyRoof patterns only)'}`)
  L.push(`THE ${e.source === 'categories' ? 'CATEGORIES (the roof-named ones)' : 'FIELD'}, per replayed row: ${[...e.witnessStates].sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s} ${n}`).join(', ')}`)
  const W = e.source === 'categories' ? 'categories' : 'field'
  L.push(`AGREEMENT on the rows whose closed roof Wikidata or the lead decides: ${W} agrees ${e.agreement.agree.length}, ${W} silent ${e.agreement.silent.length}, ${W} DISAGREES ${e.agreement.disagree.length}`)
  for (const x of e.agreement.disagree) L.push(`  DISAGREES ${x.name}: rule ${x.before.roof} (${x.before.basis}); ${W} ${JSON.stringify(x.field)}; lead ${JSON.stringify(short(x.lead, 120))}`)
  L.push(`CONFIRMING (the ${W} name the roof the rule already has): ${e.confirmed.length}; unchanged with no witness: ${e.unchanged}`)
  L.push('')
  L.push(`EFFECT: ${e.changed.length} row${e.changed.length === 1 ? '' : 's'} whose status or roof would change`)
  for (const x of e.changed) {
    L.push(`  ${x.name}`)
    L.push(`    before ${x.before.status}, ${x.before.roof ?? 'no roof'}: ${x.before.basis}`)
    L.push(`    after  ${x.after.status}, ${x.after.roof ?? 'no roof'}: ${x.after.basis}`)
    L.push(`    ${W} ${JSON.stringify(x.field)}; wikidata ${JSON.stringify(x.wikidata)}; lead ${JSON.stringify(short(x.lead, 140))}${x.categories.length ? `; categories ${x.categories.join(' / ')}` : ''}`)
    L.push(`    paragraph ${JSON.stringify(short(x.extract, 400))}`)
  }
  L.push('')
  L.push(`VALUES WITH NO WITNESS (not a closed-roof word; "open" is never taken from the field), ${e.vocab.size} distinct, rows by what the rule has:`)
  for (const [v, x] of [...e.vocab].sort((a, b) => b[1].rows.length - a[1].rows.length || a[0].localeCompare(b[0]))) {
    const by = tally(x.rows.map(r => `${r.roof ?? 'no roof'}/${r.kind}`))
    // Rows the sources DECIDE (Wikidata P5624 or the lead): an inferred roof is not evidence, and an open roof from a Wikidata label counts against a closed term.
    const evidenceRows = x.rows.filter(r => r.kind === 'evidence')
    const classes = new Set(evidenceRows.map(r => r.roof))
    const closed = [...classes].filter(c => c === 'dome' || c === 'retractable')
    const verdict = evidenceRows.length >= 2 && classes.size === 1 && closed.length === 1 ? `meets the joining test for ${closed[0]}` : 'does not meet the joining test'
    L.push(`  ${JSON.stringify(v).padEnd(46)} ${String(x.rows.length).padStart(3)}  ${by.map(([k, n]) => `${k} ${n}`).join(', ')}  [${verdict}]${x.rows.length <= 3 ? `  (${x.rows.map(r => r.name).join('; ')})` : ''}`)
  }
  return L.join('\n')
}

// --- self-test --------------------------------------------------------------------------------------

const wdAnswer = (qid, label, article) => [`wd-roof|${qid}`, { at: 'x', result: { ok: true, value: { results: { bindings: [{ ...(label ? { roofLabel: { value: label } } : {}), ...(article ? { article: { value: `https://en.wikipedia.org/wiki/${article}` } } : {}) }] } } } }]
const wp = (kind, title, value) => [`${kind}|${title}`, { at: 'x', result: { ok: true, value } }]

const selfTest = () => {
  const { check, summarize } = createChecks()
  // Invented rows and articles (no real venue): each one exists to reach one branch of the roof stage.
  const entries = [
    wdAnswer('Q1', 'retractable roof', 'Alpha'), wp('wp-lead', 'Alpha', 'Alpha Stadium is a stadium in A.'), wp('wp-bodyroof', 'Alpha', ''),
    wdAnswer('Q2', null, 'Beta'), wp('wp-lead', 'Beta', 'Beta Dome is a domed stadium in B.'), wp('wp-bodyroof', 'Beta', ''),
    wdAnswer('Q3', null, 'Gamma'), wp('wp-lead', 'Gamma', 'Gamma Field is a stadium in C.'), wp('wp-bodyroof', 'Gamma', ''),
    wdAnswer('Q4', null, 'Delta'), wp('wp-lead', 'Delta', 'D.'), wp('wp-bodyroof', 'Delta', 'retractable roof'),
    wdAnswer('Q5', null, 'Epsilon'), wp('wp-lead', 'Epsilon', 'Epsilon Park was a stadium in E.'), wp('wp-bodyroof', 'Epsilon', ''),
    wdAnswer('Q6', null, 'Zeta'), wp('wp-lead', 'Zeta', 'Zeta Stadium is a stadium in Z.'), wp('wp-bodyroof', 'Zeta', ''),
    wdAnswer('Q7', null, 'Eta'), wp('wp-lead', 'Eta', 'Eta Stadium is a stadium in H.'), wp('wp-bodyroof', 'Eta', ''),
    wdAnswer('Q10', 'open air', 'Omicron'), wp('wp-lead', 'Omicron', 'Omicron Stadium is a stadium in O.'), wp('wp-bodyroof', 'Omicron', ''),
    wdAnswer('Q8', null, 'Theta'), wp('wp-lead', 'Theta', 'Theta Stadium is a retractable-roof stadium in T.'), wp('wp-bodyroof', 'Theta', 'retractable roof'),
  ]
  const cache = Object.fromEntries(entries)
  cache['wd-roof|Q9'] = { at: 'x', result: { ok: false, why: 'HTTP 500' } }
  // The committed rows are what `roofOf` and `source` would have written for those inputs, built here by hand.
  const mk = (name, qid, status, roof, roofBasis, zone = 'Z/Z') => ({ name, qid, roof, roofBasis, zone, lead: null, _status: status })
  const rowsIn = [
    mk('Alpha Stadium', 'Q1', 'accepted', 'retractable', 'wikidata P5624 "retractable roof"'),
    mk('Beta Dome', 'Q2', 'accepted', 'dome', 'wikipedia lead'),
    mk('Gamma Field', 'Q3', 'accepted', 'open', 'inferred: the lead names no roof'),
    mk('Delta Stadium', 'Q4', 'review', null, 'the lead names no roof, but the article mentions "retractable roof"'),
    mk('Epsilon Park', 'Q5', 'review', 'open', 'inferred: the lead names no roof'),
    mk('Zeta Stadium', 'Q6', 'accepted', 'open', 'inferred: the lead names no roof'),
    mk('Eta Stadium', 'Q7', 'accepted', 'open', 'inferred: the lead names no roof'),
    mk('Theta Stadium', 'Q8', 'accepted', 'retractable', 'wikipedia lead'),
    mk('Iota Stadium', 'Q9', 'review', null, 'wikidata unanswered: HTTP 500'),
    mk('Kappa Stadium', null, 'review', null, 'no Wikipedia lead and no Wikidata roof'),
  ]
  const results = { accepted: rowsIn.filter(r => r._status === 'accepted').map(({ _status, ...r }) => r), review: [...rowsIn.filter(r => r._status === 'review').map(({ _status, ...r }) => r), { name: 'Lambda Arena', why: 'ambiguous name: x; y' }, { name: 'Mu Arena', why: 'no source answered with a point' }] }
  const art = (...roofs) => ({ fetch: { ok: true }, parse: { ok: true, errors: [] }, infoboxes: [{ template: 'Infobox venue', params: ['roof'], roof: roofs.map(flat => ({ param: 'roof', flat })) }], categories: { visible: [], hidden: 0, missing: false } })
  const bare = { fetch: { ok: true }, parse: { ok: true, errors: [] }, infoboxes: [{ template: 'Infobox venue', params: ['name'], roof: [] }], categories: { visible: [], hidden: 0, missing: false } }
  const probeOf = articles => ({ run: 't', at: 't', complete: true, articles })

  // The control.
  const c0 = effect({ results, cache })
  check('the control: every row with a roof stage is replayed and reproduces the roof, basis and status the results hold; the two rows with no stage are counted apart', c0.control.same === 10 && c0.control.mismatches.length === 0 && c0.skipped.length === 2 && c0.staged === 10, JSON.stringify({ same: c0.control.same, mis: c0.control.mismatches, skipped: c0.skipped.length }))
  const tampered = effect({ results: { ...results, accepted: results.accepted.map(r => (r.name === 'Beta Dome' ? { ...r, roof: 'open' } : r)) }, cache })
  check('the control fails on a row whose committed roof the replay does not reproduce, and names it', tampered.control.mismatches.length === 1 && tampered.control.mismatches[0].name === 'Beta Dome', JSON.stringify(tampered.control.mismatches.map(m => m.name)))
  const basisOnly = effect({ results: { ...results, accepted: results.accepted.map(r => (r.name === 'Beta Dome' ? { ...r, roofBasis: 'wikidata P5624 "x"' } : r)) }, cache })
  check('the control also fails on a row that differs only in its basis, and on one that differs only in its status', basisOnly.control.mismatches.length === 1 && effect({ results: { accepted: results.accepted.filter(r => r.name !== 'Beta Dome'), review: [...results.review, results.accepted.find(r => r.name === 'Beta Dome')] }, cache }).control.mismatches.length === 1)
  const miss = effect({ results, cache: Object.fromEntries(Object.entries(cache).filter(([k]) => k !== 'wp-lead|Gamma')) })
  check('a row whose cache key is missing is not computable and is neither counted as reproduced nor as unchanged', miss.control.notComputable.length === 1 && miss.control.notComputable[0].name === 'Gamma Field' && miss.control.same === 9, JSON.stringify(miss.control.notComputable))

  // The witness.
  check('a field naming a closed roof in the words classifyRoof trusts is a witness of that class', witnessOf(art('Retractable roof')).cls === 'retractable' && witnessOf(art('[[Retractable roof|Retractable]]')).cls === 'retractable' && witnessOf(art('Fixed dome')).cls === 'dome' && witnessOf(art('Domed')).cls === 'dome' && witnessOf(art('Indoor')).cls === 'dome')
  check('"Skylight", "translucent" and the bare words "Retractable", "Fixed" and "Enclosed" are no witness (the patterns need "retractable roof" and "fixed roof")', ['[[Skylight]]', 'translucent', 'Retractable', 'Fixed', 'Enclosed'].every(v => witnessOf(art(v)).cls === null) && witnessOf(art('[[Skylight]]')).state === 'no witness')
  check('a term joined by the whole value becomes a witness of its class, and only that exact value (lower-cased): "Retractable (fabric)" does not follow "Retractable"', witnessOf(art('Retractable'), new Map([['retractable', 'retractable']])).cls === 'retractable' && witnessOf(art('RETRACTABLE '), new Map([['retractable', 'retractable']])).cls === 'retractable' && witnessOf(art('Retractable (fabric)'), new Map([['retractable', 'retractable']])).cls === null)
  check('"open" is never taken from the field: None, Open and Open-air are no witness, whatever the rule has', ['None', 'Open', 'Open-air', 'open'].every(v => witnessOf(art(v)).cls === null))
  check('two roof parameters that name different closed classes are a conflict and no witness; two that agree are one', witnessOf(art('Retractable roof', 'Dome')).state === 'conflict' && witnessOf(art('Retractable roof', 'Retractable roof')).cls === 'retractable')
  check('the states that are not a reading are named, and none is a witness', witnessOf(undefined).state === 'not requested' && witnessOf({ fetch: { ok: false } }).state === 'fetch failed' && witnessOf({ fetch: { ok: true }, parse: { ok: false } }).state === 'parse failed' && witnessOf({ fetch: { ok: true }, parse: { ok: true }, infoboxes: [] }).state === 'no infobox' && witnessOf(bare).state === 'no roof parameter' && witnessOf(art('')).state === 'empty')

  // The effect.
  const probe = probeOf({
    Alpha: art('Retractable roof'),  // equals Wikidata: confirming
    Beta: art('Retractable roof'),   // the lead says dome: disagreement, review
    Gamma: art('Fixed dome'),        // the lead is silent, the rule infers open: open to dome
    Delta: art('Retractable roof'),  // the lead is cut and the body mentions it: review to accepted
    Epsilon: art('Dome'),            // a past-tense article: the roof moves, the status stays review
    Zeta: art('None'),               // "open" is not taken: unchanged
    Eta: art('[[Skylight]]'),        // no witness: unchanged
    Theta: bare,                     // silent field: nothing changes, the closed lead stands
  })
  const e = effect({ results, cache, probe })
  const by = n => e.changed.find(x => x.name === n)
  check('a closed witness on a silent lead that the rule read as open changes open to that class, and the row is named', by('Gamma Field')?.before.roof === 'open' && by('Gamma Field')?.after.roof === 'dome' && by('Gamma Field')?.after.status === 'accepted', JSON.stringify(by('Gamma Field')))
  check('a closed witness on a row held in review by a retractable roof in the body makes it accepted with that class', by('Delta Stadium')?.before.status === 'review' && by('Delta Stadium')?.after.status === 'accepted' && by('Delta Stadium')?.after.roof === 'retractable', JSON.stringify(by('Delta Stadium')))
  check('two positive sources that name different classes make the row review and say so (the field against the lead), and the row is listed as a disagreement', by('Beta Dome')?.after.roof === null && /sources disagree: lead dome, infobox retractable/.test(by('Beta Dome')?.after.basis) && e.agreement.disagree.some(x => x.name === 'Beta Dome'), JSON.stringify(by('Beta Dome')))
  check('a witness that equals what Wikidata already decided changes nothing and is counted as confirming', !by('Alpha Stadium') && e.confirmed.some(x => x.name === 'Alpha Stadium') && e.agreement.agree.some(x => x.name === 'Alpha Stadium'))
  check('a past-tense article stays review whatever the field says (the status is recomputed, not copied), and its changed roof is still listed', by('Epsilon Park')?.before.status === 'review' && by('Epsilon Park')?.after.status === 'review' && by('Epsilon Park')?.after.roof === 'dome', JSON.stringify(by('Epsilon Park')))
  check('"None" and "[[Skylight]]" change nothing, and "[[Skylight]]" is listed with the rows it sits on', !by('Zeta Stadium') && !by('Eta Stadium') && e.vocab.has('[[Skylight]]') && e.vocab.get('[[Skylight]]').rows[0].name === 'Eta Stadium')
  check('the list of values with no witness holds no value that is a witness ("Fixed dome", "Retractable roof")', !e.vocab.has('Fixed dome') && !e.vocab.has('Retractable roof') && e.vocab.size === 2, [...e.vocab.keys()].join(' | '))
  check('a silent field on a row the lead decided is counted silent, not as agreement', e.agreement.silent.some(x => x.name === 'Theta Stadium') && !e.agreement.agree.some(x => x.name === 'Theta Stadium'))
  check('with a witness the changed rows are exactly Beta, Delta, Epsilon and Gamma and the disagreement list has one name: nothing else moved', e.changed.map(x => x.name).sort().join() === 'Beta Dome,Delta Stadium,Epsilon Park,Gamma Field' && e.agreement.disagree.length === 1, e.changed.map(x => x.name).join())
  const nu = { accepted: [], review: [(({ _status, ...r }) => r)(mk('Nu Dome', 'Q3', 'review', 'open', 'inferred: the lead names no roof'))] }
  const domeName = effect({ results: nu, cache, probe: probeOf({ Gamma: art('None') }) })
  const domeWitness = effect({ results: nu, cache, probe: probeOf({ Gamma: art('Fixed dome') }) })
  // The joining test the report prints for a term outside the patterns.
  const twice = { accepted: [results.accepted[0], { ...results.accepted[0], name: 'Alpha Two' }], review: [] }
  const joinTest = r => report(effect({ results: r, cache, probe: probeOf({ Alpha: art('Retractable'), Beta: art('Retractable'), Omicron: art('Retractable') }) }), probeOf({}))
  check('a term on two rows whose closed roof the sources decide as one class, and on no other, is reported as meeting the joining test for it', /"Retractable"\s+2\s+retractable\/evidence 2\s+\[meets the joining test for retractable\]/.test(joinTest(twice)), joinTest(twice).split('\n').filter(l => /Retractable/.test(l)).join(' | '))
  const mixed = { accepted: [...twice.accepted, results.accepted[1]], review: [] }
  const openRows = { accepted: [mk('Omicron One', 'Q10', 'accepted', 'open', 'wikidata P5624 "open air", lead names no roof'), mk('Omicron Two', 'Q10', 'accepted', 'open', 'wikidata P5624 "open air", lead names no roof')].map(({ _status, ...r }) => r), review: [] }
  const joinOpen = joinTest(openRows)
  const mixedOpen = { accepted: [...twice.accepted, openRows.accepted[0]], review: [] }
  check('...and not when a row Wikidata decides as open carries it beside two the sources decide as retractable', /"Retractable"\s+3[^\n]*\[does not meet the joining test\]/.test(joinTest(mixedOpen)), joinTest(mixedOpen).split('\n').filter(l => /Retractable/.test(l)).join(' | '))
  check('a term carried by two rows that Wikidata decides as open does not meet the joining test (and is not "for undefined")', /"Retractable"\s+2\s+open\/evidence 2\s+\[does not meet the joining test\]/.test(joinOpen) && openRows.accepted.length === 2 && effect({ results: openRows, cache }).control.same === 2, joinOpen.split('\n').filter(l => /Retractable/.test(l)).join(' | '))
  check('...and not when a row the sources decide as another class carries it, or when only one row does', /"Retractable"\s+3[^\n]*\[does not meet the joining test\]/.test(joinTest(mixed)) && /\[does not meet the joining test\]/.test(joinTest({ accepted: [results.accepted[0]], review: [] })), joinTest(mixed).split('\n').filter(l => /Retractable/.test(l)).join(' | '))
  const rep = report(e, probe)
  check('the report prints its coverage as "N of M", the control, and each changed row with before, after and the field', /COVERAGE: roof stage replayed for 10 of 12 rows; 2 never reach it/.test(rep) && /CONTROL \(no witness\): 10 of 10/.test(rep) && /EFFECT: 4 rows/.test(rep) && /before accepted, open: inferred: the lead names no roof\n\s+after  accepted, dome: infobox roof "Fixed dome"/.test(rep), rep.split('\n').slice(0, 4).join(' | '))
  const cats = (...visible) => ({ ...art(), categories: { visible, hidden: 0, missing: false } })
  check('categories as the witness: a roof-named category in the words classifyRoof trusts is a witness of its class; "Skylit stadiums" and a category that does not name a roof are not', witnessOfCategories(cats('Retractable-roof stadiums in Europe', 'NFL venues')).cls === 'retractable' && witnessOfCategories(cats('Domed stadiums in the United States')).cls === 'dome' && witnessOfCategories(cats('Skylit stadiums in the United States')).cls === null && witnessOfCategories(cats('Skylit stadiums in the United States')).state === 'no witness' && witnessOfCategories(cats('NFL venues')).state === 'no roof category')
  check('categories: two roof categories naming different closed classes are a conflict; a missing page, no answer and no article are named and are no witness', witnessOfCategories(cats('Retractable-roof stadiums in Europe', 'Domed stadiums in X')).state === 'conflict' && witnessOfCategories({ categories: { visible: [], hidden: 0, missing: true } }).state === 'page missing' && witnessOfCategories({ fetch: { ok: true } }).state === 'no category answer' && witnessOfCategories(undefined).state === 'not requested')
  const ec = effect({ results, cache, probe: probeOf({ Gamma: cats('Domed stadiums in X'), Zeta: art('Fixed dome'), Delta: cats('Retractable-roof stadiums in Europe') }), source: 'categories' })
  check('--source categories reads the categories and not the Roof field: Gamma (categories) and Delta change, Zeta (the field says dome, no roof category) does not, and the report says which source it used', ec.changed.map(x => x.name).sort().join() === 'Delta Stadium,Gamma Field' && /witness source: categories/.test(report(ec, probe)) && /THE CATEGORIES/.test(report(ec, probe)), ec.changed.map(x => x.name).join())
  check('the categories witness names itself in the basis, and in a disagreement, and not as the infobox', ec.changed.find(x => x.name === 'Gamma Field')?.after.basis === 'categories "Domed stadiums in X"' && effect({ results, cache, probe: probeOf({ Beta: cats('Retractable-roof stadiums in Europe') }), source: 'categories' }).changed.find(x => x.name === 'Beta Dome')?.after.basis === 'sources disagree: lead dome, categories retractable', JSON.stringify(ec.changed.map(x => x.after.basis)))
  check('the vocabulary of the categories lists only roof-named categories with no witness, never the others', (() => { const v = effect({ results, cache, probe: probeOf({ Eta: cats('Skylit stadiums in the United States', 'NFL venues', 'Minneapolis') }), source: 'categories' }).vocab; return v.size === 1 && v.has('Skylit stadiums in the United States') })())
  check('--join parses term=class pairs, lower-cases the term, and refuses "open" and a pair with no term', parseJoin('Retractable=retractable,fixed=dome').get('retractable') === 'retractable' && parseJoin('fixed=dome').get('fixed') === 'dome' && (() => { try { parseJoin('x=open'); return false } catch { return true } })() && (() => { try { parseJoin('=dome'); return false } catch { return true } })())
  const ej = effect({ results, cache, probe: probeOf({ ...probe.articles, Zeta: art('Retractable') }), joined: new Map([['retractable', 'retractable']]) })
  check('a joined term takes effect on the row it sits on and the report names the joined terms (and says strict when none)', ej.changed.some(x => x.name === 'Zeta Stadium' && x.after.roof === 'retractable') && /JOINED TERMS \(whole value, lower-cased\): "retractable" = retractable/.test(report(ej, probe, new Map([['retractable', 'retractable']]))) && /JOINED TERMS[^\n]*none \(strict/.test(report(e, probe)))
  check('the control-only report says there is no probe and prints no effect section', !/EFFECT/.test(report(c0, null)) && /probe none \(control only\)/.test(report(c0, null)))
  check('a name that says dome and a roof read as open is held in review (the committed rule), and the replay holds it', domeName.control.mismatches.length === 0 && domeName.control.same === 1, JSON.stringify(domeName.control.mismatches))
  check('...and a closed witness on that row makes it accepted: the status is recomputed from the new roof', domeWitness.changed.length === 1 && domeWitness.changed[0].before.status === 'review' && domeWitness.changed[0].after.status === 'accepted', JSON.stringify(domeWitness.changed.map(x => [x.before.status, x.after.status])))
  finish(summarize())
}

// --- main -------------------------------------------------------------------------------------------

/** `--join retractable=retractable,fixed=dome` into the Map `witnessOf` takes. A class other than the two closed ones is refused: "open" is never taken from the field. */
export const parseJoin = spec => {
  const m = new Map()
  for (const pair of spec.split(',').filter(Boolean)) {
    const i = pair.lastIndexOf('=')
    const term = pair.slice(0, i), cls = pair.slice(i + 1)
    if (i < 1 || !['dome', 'retractable'].includes(cls)) throw new Error(`--join "${pair}": expected term=dome or term=retractable ("open" is never taken from the field)`)
    m.set(norm(term), cls)
  }
  return m
}

const main = () => {
  const args = process.argv.slice(2)
  const ji = args.indexOf('--join')
  const joined = ji >= 0 ? parseJoin(args[ji + 1] ?? '') : null
  const si = args.indexOf('--source')
  const source = si >= 0 ? args[si + 1] : 'infobox'
  if (!['infobox', 'categories'].includes(source)) throw new Error(`--source ${source}: expected infobox or categories`)
  const file = args.find((a, i) => !a.startsWith('--') && i !== ji + 1 && i !== si + 1)
  const results = JSON.parse(readFileSync(RESULTS, 'utf8')), cache = JSON.parse(readFileSync(CACHE, 'utf8'))
  const probe = file ? JSON.parse(readFileSync(file, 'utf8')) : null
  const e = effect({ results, cache, probe, extracts: JSON.parse(readFileSync(EXTRACTS, 'utf8')), joined, source })
  const text = report(e, probe, joined)
  console.log(text)
  if (args.includes('--write')) {
    const tag = `${source === 'categories' ? '-categories' : ''}${joined?.size ? '-joined' : ''}`
    writeFileSync(`${OUT}${tag}.txt`, text + '\n')
    writeFileSync(`${OUT}${tag}.json`, JSON.stringify({ source, joined: joined ? Object.fromEntries(joined) : null, probe: probe ? { run: probe.run, at: probe.at, complete: probe.complete } : null, rows: e.rows, staged: e.staged, skipped: e.skipped.map(r => ({ name: r.name, why: r.why })), control: e.control, changed: e.changed, confirmed: e.confirmed.map(x => x.name), agreement: { agree: e.agreement.agree.map(x => x.name), silent: e.agreement.silent.map(x => x.name), disagree: e.agreement.disagree }, witnessStates: Object.fromEntries(e.witnessStates), vocab: Object.fromEntries([...e.vocab].map(([k, v]) => [k, v.rows])) }, null, 1) + '\n')
  }
  process.exitCode = e.control.mismatches.length || e.control.notComputable.length ? 1 : 0
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--self-test')) selfTest()
  else main()
}
