// The roof rule with the infobox as its fourth source, run END TO END and OFFLINE on every row the roof stage reached, before a runner spends
// forty minutes reading Wikipedia for it (Rule 89: the artifact is this script's printed result).
// docs/CC-CMD-2026-11-09-venue-review-remainder.md, Task 2, option 3, Step B, commit 2. Run from the repository root:
//   node outbox/venue-infobox-rule-replay-2026-11-09.mjs             the committed results, cache and probe through the real `roofOf`
//   node outbox/venue-infobox-rule-replay-2026-11-09.mjs --self-test  the comparison on doctored inputs, each of which must be caught
//
// WHAT IS REAL. `roofOf` itself (scripts/venue-source.mjs), called once per row with the committed cache (wd-roof, wp-lead, wp-bodyroof) and, under
// `wp-infobox|title`, the roof values the probe READ from Wikipedia (outbox/venue-infobox-probe.json, run 42668700914). Every cache entry's age is set
// to now so that none has expired, and `fetch` is a stub that counts and refuses: a request here is a failure, said by number.
// WHAT IT IS COMPARED WITH. (1) the effect tool's prediction (outbox/venue-infobox-effect-2026-11-09.mjs, the measurement the decision to build was
// made from), row by row: roof, basis, lead and status; (2) the committed results, to list every row whose status or roof would change, which the
// CC-CMD says must be exactly Johan Cruijff Arena, U.S. Bank Stadium and Wembley Stadium; (3) for the five control trees the probe kept whole,
// the rule's own reader against the probe's recorded values.
// WHAT IT CANNOT SAY. That Wikipedia still says what the probe read, or that the rule's own request for the infobox returns what the probe's did:
// the runner's fill answers that, and `outbox/venue-infobox-rule-cache-compare-*` compares the two.

import { readFileSync } from 'node:fs'
import { roofOf, ROOF_FIELD_TERMS } from '../scripts/venue-source.mjs'
import { roofValuesOf } from '../scripts/venue-infobox-read.mjs'
import { rowsOf } from '../scripts/venue-infobox.mjs'
import { stageInputs, decideWith, statusOf, witnessOf } from './venue-infobox-effect-2026-11-09.mjs'
import { createChecks, finish, isMain } from '../scripts/checks.mjs'

const RESULTS = 'outbox/venue-source-results-latest.json', CACHE = 'outbox/venue-source-cache.json', PROBE = 'outbox/venue-infobox-probe.json'

/** What the Task 2 record says must change, and nothing else (before, after). */
export const EXPECTED = {
  'Johan Cruijff Arena': { before: ['review', null], after: ['accepted', 'retractable'] },
  'U.S. Bank Stadium': { before: ['review', null], after: ['accepted', 'dome'] },
  'Wembley Stadium': { before: ['review', null], after: ['accepted', 'retractable'] },
}

/** The roof values the probe read for one article, as the rule keeps them: null when the article was not read, [] when there is no infobox roof. */
export const valuesOf = art => (!art ? [] : !art.fetch?.ok || !art.parse?.ok ? null : art.infoboxes.flatMap(i => i.roof.map(r => r.flat)))

export const analyze = async ({ results, cache, probe, roofOfFn = roofOf }) => {
  const rows = rowsOf(results), staged = rows.filter(r => 'roofBasis' in r)
  const now = Date.now()
  const live = Object.fromEntries(Object.entries(cache).map(([k, v]) => [k, { ...v, at: now }]))
  for (const [title, art] of Object.entries(probe.articles)) { const v = valuesOf(art); if (v) live[`wp-infobox|${title}`] = { at: now, result: { ok: true, value: v } } }
  const calls = [], real = globalThis.fetch
  globalThis.fetch = async url => { calls.push(String(url)); return { status: 404, ok: false, headers: { get: () => null }, json: async () => ({}) } }
  const out = { rows: rows.length, staged: staged.length, notComputable: [], controlOk: 0, mismatches: [], changed: [], same: 0 }
  try {
    for (const r of staged) {
      const inp = stageInputs(r, cache)
      if (inp.kind === 'uncached') { out.notComputable.push({ name: r.name, what: inp.what }); continue }
      const base = decideWith(inp, null)
      if (base.roof === r.roof && base.basis === r.roofBasis && statusOf(r, base) === r.status) out.controlOk++
      const w = inp.title ? witnessOf(probe.articles[inp.title], ROOF_FIELD_TERMS) : { cls: null, values: [] }
      const predicted = decideWith(inp, w.cls ? { cls: w.cls, value: w.values.join(' | '), source: 'infobox' } : null)
      const ruled = await roofOfFn(r.qid, live, { gapMs: 0 })
      const pStatus = statusOf(r, predicted), rStatus = statusOf(r, ruled)
      if (ruled.roof === predicted.roof && ruled.basis === predicted.basis && (ruled.lead ?? null) === (predicted.lead ?? null) && rStatus === pStatus) out.same++
      else out.mismatches.push({ name: r.name, predicted: [pStatus, predicted.roof, predicted.basis], ruled: [rStatus, ruled.roof, ruled.basis] })
      if (rStatus !== r.status || ruled.roof !== r.roof) out.changed.push({ name: r.name, before: [r.status, r.roof, r.roofBasis], after: [rStatus, ruled.roof, ruled.basis] })
    }
  } finally { globalThis.fetch = real }
  out.requests = calls
  return out
}

/** The control trees: the rule's own reader on the whole raw tree the probe kept, against the values the probe recorded for the same article. */
export const controlCheck = probe => Object.entries(probe.controlTrees ?? {}).map(([name, tree]) => {
  const title = probe.controls?.[name] ?? null
  const mine = roofValuesOf({ parse: { parsetree: { '*': tree } } })
  const theirs = title ? valuesOf(probe.articles[title]) : null
  return { name, title: title ?? null, mine: mine.ok ? mine.value : `UNREADABLE ${mine.why}`, theirs, same: mine.ok && theirs !== null && JSON.stringify(mine.value) === JSON.stringify(theirs) }
})

/** The verdict, as a list of what is wrong; an empty list is a pass. */
export const problems = (a, controls) => {
  const bad = []
  if (a.staged === 0 || a.same + a.mismatches.length === 0) bad.push('nothing was replayed')
  if (a.notComputable.length) bad.push(`${a.notComputable.length} row(s) not computable (a cache key missing)`)
  if (a.requests.length) bad.push(`${a.requests.length} request(s) were made: ${a.requests.slice(0, 3).join(' ')}`)
  if (a.controlOk !== a.same + a.mismatches.length) bad.push(`the no-infobox control reproduces ${a.controlOk} of ${a.same + a.mismatches.length} committed rows`)
  if (a.mismatches.length) bad.push(`${a.mismatches.length} row(s) where roofOf is not the measured prediction: ${a.mismatches.map(m => m.name).join(', ')}`)
  const got = Object.fromEntries(a.changed.map(c => [c.name, c]))
  for (const [name, e] of Object.entries(EXPECTED)) {
    const c = got[name]
    if (!c) bad.push(`${name} did not change`)
    else if (c.before[0] !== e.before[0] || c.before[1] !== e.before[1] || c.after[0] !== e.after[0] || c.after[1] !== e.after[1]) bad.push(`${name}: ${c.before.slice(0, 2).join('/')} -> ${c.after.slice(0, 2).join('/')}, not ${e.before.join('/')} -> ${e.after.join('/')}`)
  }
  const extra = a.changed.filter(c => !(c.name in EXPECTED)).map(c => c.name)
  if (extra.length) bad.push(`rows that change and should not: ${extra.join(', ')}`)
  if (!controls.length) bad.push('no control tree was checked')
  const off = controls.filter(c => !c.same).map(c => c.name)
  if (off.length) bad.push(`control tree(s) the rule's reader reads differently from the probe: ${off.join(', ')}`)
  return bad
}

const report = (a, controls, bad) => {
  const f = r => `${r[0]}, roof ${r[1] ?? 'none'}${r[2] ? `: ${r[2]}` : ''}`
  return [
    `venue-infobox rule replay, offline: roofOf end to end on the committed results, cache and probe`,
    `COVERAGE: roofOf replayed for ${a.same + a.mismatches.length} of ${a.rows} rows; ${a.rows - a.staged} never reach the roof stage; not computable (a cache key missing): ${a.notComputable.length}`,
    `NETWORK: ${a.requests.length} request(s) made by ${a.same + a.mismatches.length} roofOf calls (the stub refuses and counts)`,
    `CONTROL (the no-infobox replay, as the effect tool's): ${a.controlOk} of ${a.same + a.mismatches.length} rows reproduce the committed roof, basis and status`,
    `ROOFOF AGAINST THE MEASURED PREDICTION (roof, basis, lead, status): ${a.same} of ${a.same + a.mismatches.length} rows identical; ${a.mismatches.length} differ${a.mismatches.map(m => `\n  ${m.name}: predicted ${f(m.predicted)}; roofOf ${f(m.ruled)}`).join('')}`,
    `CHANGED against the committed results: ${a.changed.length} row(s)${a.changed.map(c => `\n  ${c.name}\n    before ${f(c.before)}\n    after  ${f(c.after)}`).join('')}`,
    `CONTROL TREES (the rule's reader on the whole raw tree, against the probe's recorded values): ${controls.filter(c => c.same).length} of ${controls.length} identical${controls.map(c => `\n  ${c.name}: ${JSON.stringify(c.mine)} ${c.same ? '==' : '!='} ${JSON.stringify(c.theirs)}`).join('')}`,
    bad.length ? `NOT AS PREDICTED:${bad.map(b => `\n  ${b}`).join('')}` : 'AS PREDICTED: exactly the three rows change, and roofOf is the measured prediction on every row',
  ].join('\n')
}

const selfTest = async () => {
  const { check, summarize } = createChecks()
  const row = (name, qid, status, roof, basis) => ({ name, qid, status, roof, roofBasis: basis, lead: 'X is a stadium.', zone: 'Z' })
  const art = (...flat) => ({ fetch: { ok: true }, parse: { ok: true }, infoboxes: [{ roof: flat.map(f => ({ flat: f })) }] })
  const wdroof = title => ({ at: 0, result: { ok: true, value: { results: { bindings: [{ article: { value: `https://en.wikipedia.org/wiki/${title}` } }] } } } })
  const results = { accepted: [row('Calm', 'Q1', 'accepted', 'open', 'inferred: the lead names no roof')], review: [row('Roofed', 'Q2', 'review', null, 'the lead names no roof, but the article mentions "retractable roof"')] }
  const cache = { 'wd-roof|Q1': wdroof('Calm'), 'wp-lead|Calm': { at: 0, result: { ok: true, value: 'X is a stadium.' } }, 'wp-bodyroof|Calm': { at: 0, result: { ok: true, value: '' } },
    'wd-roof|Q2': wdroof('Roofed'), 'wp-lead|Roofed': { at: 0, result: { ok: true, value: 'X is a stadium.' } }, 'wp-bodyroof|Roofed': { at: 0, result: { ok: true, value: 'retractable roof' } } }
  const probe = { articles: { Calm: art(), Roofed: art('[[Dome]]') }, controlTrees: {} }
  const a = await analyze({ results, cache, probe })
  check('the replay reaches both rows, makes no request, and reproduces the no-infobox control', a.staged === 2 && a.same === 2 && a.controlOk === 2 && a.requests.length === 0 && a.notComputable.length === 0, JSON.stringify({ ...a, changed: undefined }))
  check('the row whose infobox names a roof is the one that changes, review to accepted', a.changed.length === 1 && a.changed[0].name === 'Roofed' && a.changed[0].after[0] === 'accepted' && a.changed[0].after[1] === 'dome', JSON.stringify(a.changed))
  const doctored = await analyze({ results, cache, probe, roofOfFn: async (qid, c, o) => { const d = await roofOf(qid, c, o); return qid === 'Q1' ? { ...d, roof: 'dome' } : d } })
  check('A ROOFOF THAT DIFFERS FROM THE PREDICTION ON ONE ROW IS REPORTED, by name', doctored.mismatches.length === 1 && doctored.mismatches[0].name === 'Calm', JSON.stringify(doctored.mismatches))
  const strange = await analyze({ results, cache, probe, roofOfFn: async (qid, c, o) => { await fetch('https://example.invalid/x'); return roofOf(qid, c, o) } })
  check('A REQUEST MADE DURING THE REPLAY IS COUNTED AND FAILS THE RUN', strange.requests.length === 2 && problems(strange, [{ same: true }]).some(p => /request/.test(p)))
  const gone = await analyze({ results, cache: { ...cache, 'wd-roof|Q2': undefined }, probe })
  check('A ROW WHOSE CACHE KEY IS MISSING IS NOT COMPUTABLE, said and not skipped', gone.notComputable.length === 1 && gone.notComputable[0].name === 'Roofed' && problems(gone, [{ same: true }]).some(p => /not computable/.test(p)), JSON.stringify(gone.notComputable))
  check('a replay of nothing is not a pass', problems(await analyze({ results: { accepted: [], review: [] }, cache, probe }), [{ same: true }]).includes('nothing was replayed'))
  check('rows that change but are not the three expected are named', problems(a, [{ same: true }]).some(p => /rows that change and should not: Roofed/.test(p)))
  check('an expected row that did not change is named', problems(a, [{ same: true }]).some(p => /Johan Cruijff Arena did not change/.test(p)))
  const tree = '<root><template><title>Infobox venue</title><part><name>roof</name><equals>=</equals><value>[[Skylight]]</value></part></template></root>'
  const probe2 = { articles: { T: art('[[Skylight]]') }, controlTrees: { C: tree }, controls: { C: 'T' } }
  check('a control tree the rule reads as the probe did is identical, and one it reads differently is not',
    controlCheck(probe2)[0].same === true && controlCheck({ ...probe2, articles: { T: art('[[Dome]]') } })[0].same === false)
  check('no control tree is not a pass', problems({ ...a, changed: Object.keys(EXPECTED).map(n => ({ name: n, before: EXPECTED[n].before, after: EXPECTED[n].after })) }, []).includes('no control tree was checked'))
  finish(summarize())
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--self-test')) await selfTest()
  else {
    const results = JSON.parse(readFileSync(RESULTS, 'utf8')), cache = JSON.parse(readFileSync(CACHE, 'utf8')), probe = JSON.parse(readFileSync(PROBE, 'utf8'))
    const a = await analyze({ results, cache, probe })
    const controls = controlCheck(probe)
    const bad = problems(a, controls)
    console.log(report(a, controls, bad))
    process.exitCode = bad.length ? 1 : 0
  }
}
