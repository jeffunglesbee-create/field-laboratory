// The judgement of the sourcing run of Task 3 (docs/CC-CMD-2026-11-09-venue-review-remainder.md): the results the runner's `source` run wrote for the 459-entry list, against the
// results it replaced, row by row (Rule 89: the artifact is this script's printed result). WRITTEN BEFORE THE RUN, so it is a set of predictions the run can refute, not a
// description of what it did. Run from the repository root:
//   node outbox/venue-task3-source-diff-2026-11-10.mjs OLD_REV NEW_REV   the report; exits 1 unless every check below holds
//   node outbox/venue-task3-source-diff-2026-11-10.mjs --self-test       the same judgement on doctored results, each of which must be caught
//
// The comparison is the lead-whole tool's own (`compare`, outbox/venue-lead-whole-diff-2026-11-09.mjs). What this adds is the judgement:
//   1. COVERAGE. The run read the whole list: `of` equals the list's count, `from` is the list's path, and accepted + review add up to `of`, so no candidate went missing without a word.
//   2. THE 442 ARE UNTOUCHED. Nothing moved (coordinates, zone, qid, agreeing sources, via), nothing changed status, roof or review reason, nothing changed its basis alone. The run asks
//      for nothing it already knows (the cache holds 442 names' answers, read again on 2026-11-09 by the infobox run), so a row that differs is a finding to investigate, not to explain.
//   3. THE NEW ROWS ARE EXACTLY THE 17 the list gained over its base, each once. Whether the rule accepts or reviews each is NOT predicted: that is what the run is for. What is
//      predicted is where an ACCEPTED one is. Every ground below is one the archive names with a home team, and the table here states, from outside the run, the country each is in.
//      An accepted row outside that country's box, or in another zone, is a wrong entity accepted: the defect the 2026-10-22 audit found four times, always in a row the rule had
//      ACCEPTED (outbox/cc-session-2026-10-22-outdoor-venue-sourcing.md). A review row is reported with every source's point and is not a failure.

import { execFileSync } from 'node:child_process'
import { createChecks, finish, isMain } from '../scripts/checks.mjs'
import { compare } from './venue-lead-whole-diff-2026-11-09.mjs'
import { BASE, LIST } from './venue-candidates-extend-2026-11-10.mjs'

const RESULTS = 'outbox/venue-source-results-latest.json'
/** The count measured on 2026-11-10 (outbox/venue-candidates-gained-2026-11-10.json, and the whole-window query beside it): 18 rows, one of them already listed. */
export const GAINED = 17
export const MANADON = 'Manadon Sports Hub'

/** Where each of the 17 is, stated independently of the run: a box that is generous on purpose (it is a wrong-continent test, not a survey) and the zone of that country. */
export const PLACES = {
  'England and Wales': { lat: [49.8, 55.9], lon: [-6.4, 1.9], zone: 'Europe/London' },
  'Saint-Denis': { lat: [48.85, 48.98], lon: [2.28, 2.45], zone: 'Europe/Paris' },
}
export const WHERE = {
  'Aggborough Stadium': 'England and Wales', 'Brunton Park': 'England and Wales', 'Crabble Athletic Ground': 'England and Wales', 'EnviroVent Stadium': 'England and Wales',
  'Flamingo Park': 'England and Wales', 'Hornchurch Stadium': 'England and Wales', 'J. Davidson Stadium': 'England and Wales', [MANADON]: 'England and Wales',
  'Meadow Park': 'England and Wales', 'Nethermoor Park': 'England and Wales', 'RAW Charging Stadium': 'England and Wales', 'Silverlake Stadium': 'England and Wales',
  'Stade de France': 'Saint-Denis', 'The Kassam Stadium': 'England and Wales', 'The Raymond McEnhill Stadium': 'England and Wales', 'The Stan Robinson Stadium': 'England and Wales',
  'The Wyatt Homes Stadium': 'England and Wales',
}

const inBox = (x, b) => x.lat >= b.lat[0] && x.lat <= b.lat[1] && x.lon >= b.lon[0] && x.lon <= b.lon[1]
const rowList = r => [...r.accepted.map(x => ({ status: 'accepted', ...x })), ...r.review.map(x => ({ status: 'review', ...x }))]

/** The comparison and every prediction, as problems; an empty list is a pass. `list` is `{ count, from }` of the list the run was given, `gained` the names it has over the base. */
export const judge = (oldR, newR, list, gained) => {
  const problems = []
  let c
  try { c = compare(oldR, newR) } catch (e) { return { c: null, problems: [`the results cannot be compared: ${e.message}`], accepted: [], review: [], manadon: null } }
  if (newR.of !== list.count) problems.push(`of says ${newR.of}, and the list has ${list.count} entries`)
  if (newR.from !== LIST) problems.push(`from says ${JSON.stringify(newR.from)}, and the run was to read ${JSON.stringify(LIST)}`)
  if (newR.accepted.length + newR.review.length !== newR.of) problems.push(`accepted ${newR.accepted.length} + review ${newR.review.length} is ${newR.accepted.length + newR.review.length}, and of says ${newR.of}: a candidate went missing without a word`)
  if (gained.length !== GAINED) problems.push(`the list gained ${gained.length} names over its base, and the measurement of 2026-11-10 is ${GAINED}`)
  const want = new Set(gained)
  const missing = gained.filter(n => c.onlyNew.indexOf(n) < 0)
  const extra = c.onlyNew.filter(n => !want.has(n))
  if (missing.length) problems.push(`${missing.length} of the list's new names are not in the results: ${missing.join('; ')}`)
  if (extra.length) problems.push(`${extra.length} rows are new in the results and the list did not gain them: ${extra.join('; ')}`)
  if (c.onlyOld.length) problems.push(`${c.onlyOld.length} old rows are not in the new results: ${c.onlyOld.join('; ')}`)
  for (const m of c.moved) problems.push(`${m.name} moved: ${m.fields.join(', ')}`)
  for (const r of c.changed) problems.push(`${r.name} changed: ${r.kind}; before ${r.before.status}, roof ${r.before.roof}; after ${r.after.status}, roof ${r.after.roof}${r.after.why ? `: ${r.after.why}` : ''}`)
  for (const b of c.basisOnly) problems.push(`${b.name} changed its basis alone: ${JSON.stringify(b.before.basis)} -> ${JSON.stringify(b.after.basis)}`)
  const now = new Map(rowList(newR).map(x => [x.name, x]))
  const accepted = [], review = []
  for (const name of gained) {
    const x = now.get(name)
    if (!x) continue
    ;(x.status === 'accepted' ? accepted : review).push(x)
    const place = PLACES[WHERE[name]]
    if (!place) { problems.push(`${name} is on the list and no place was written for it before the run`); continue }
    if (x.status !== 'accepted') continue
    if (!inBox(x, place)) problems.push(`${name} was ACCEPTED at ${x.lat}, ${x.lon}, outside ${WHERE[name]} (lat ${place.lat.join(' to ')}, lon ${place.lon.join(' to ')}): a wrong entity accepted`)
    if (x.zone !== place.zone) problems.push(`${name} was ACCEPTED with zone ${x.zone}, and ${WHERE[name]} is ${place.zone}`)
  }
  return { c, problems, accepted, review, manadon: now.get(MANADON) ?? null }
}

export const verdict = j => (j.problems.length
  ? { code: 1, text: `\nNOT AS PREDICTED:${j.problems.map(p => `\n  ${p}`).join('')}` }
  : { code: 0, text: `\nAS PREDICTED: the ${j.c.compared} old rows are untouched, the ${GAINED} new rows are exactly the list's, ${j.accepted.length} accepted inside their countries and ${j.review.length} in review` })

const pt = x => `${x.lat}, ${x.lon}`
const sourcesOf = x => Object.values(x.sources ?? {}).map(s => `      ${String(s.source).padEnd(9)} ${pt(s).padEnd(22)} ${JSON.stringify(s.label ?? null)}${s.qid ? `  ${s.qid}` : ''}${s.kind ? `  ${s.kind}` : ''}`)

export const report = (j, oldRev, newRev, oldR, newR) => {
  const { c } = j
  const o = []
  o.push(`old results: git ${oldRev}:${RESULTS} (run ${oldR.run}, ${oldR.at}); new results: git ${newRev}:${RESULTS} (run ${newR.run}, ${newR.at})`)
  o.push(`COVERAGE: the run read ${newR.of} of the list's entries from ${newR.from}; accepted ${newR.accepted.length} + review ${newR.review.length}`)
  if (c) {
    o.push(`COVERAGE: compared ${c.compared} of ${c.oldRows} old rows and ${c.newRows} new rows, by name; only in old ${c.onlyOld.length}, only in new ${c.onlyNew.length}`)
    o.push(`MOVED (lat, lon, zone, qid, agreeing, via): ${c.moved.length} of ${c.compared}`)
    o.push(`CHANGED (status, roof or review reason): ${c.changed.length} of ${c.compared}; same status and roof but a different basis: ${c.basisOnly.length}`)
  }
  o.push(`THE ${GAINED} NEW ROWS: ${j.accepted.length} accepted, ${j.review.length} in review (checked ${j.accepted.length + j.review.length} of ${GAINED})`)
  for (const x of j.accepted) o.push(`  ${x.name.padEnd(30)} accepted  ${pt(x).padEnd(22)} ${x.zone.padEnd(14)} roof ${String(x.roof).padEnd(11)} by ${x.agreeing.join('+')}  (${x.roofBasis})`)
  for (const x of j.review) { o.push(`  ${x.name.padEnd(30)} review    ${x.why}`); o.push(...sourcesOf(x)) }
  o.push('')
  if (j.manadon) {
    const m = j.manadon
    o.push(`${MANADON.toUpperCase()}: ${m.status}${m.status === 'accepted' ? `, ${pt(m)}, ${m.zone}, roof ${m.roof} (${m.roofBasis}), by ${m.agreeing.join('+')}, qid ${m.qid}` : `: ${m.why}`}`)
    o.push(JSON.stringify(m, null, 1))
  } else o.push(`${MANADON.toUpperCase()}: not in the results`)
  return o.join('\n')
}

const selfTest = () => {
  const { check, summarize } = createChecks()
  const old = (name, o = {}) => ({ name, sports: 'EPL', home: 'H', lat: 53.4, lon: -1.3, zone: 'Europe/London', qid: `Q-${name}`, agreeing: ['wikidata', 'nominatim'], via: 'x', roof: 'open', roofBasis: 'inferred: the lead names no roof', lead: 'A first sentence.', ...o })
  const NEW_ENGLAND = ['Aggborough Stadium', 'Brunton Park']
  const gained = [...NEW_ENGLAND, 'Stade de France', MANADON, ...Object.keys(WHERE).filter(n => ![...NEW_ENGLAND, 'Stade de France', MANADON].includes(n))]
  const england = (name, o = {}) => old(name, { lat: 52.4, lon: -2.2, ...o })
  const reviewRow = (name, o = {}) => ({ name, sports: 'FA Cup', home: 'H', lat: 50.4, lon: -4.1, zone: 'Europe/London', qid: null, agreeing: ['nominatim'], roof: null, roofBasis: 'no lead', lead: null, why: 'no two independent families agree (nominatim)', unanswered: [], sources: { nominatim: { source: 'nominatim', lat: 50.4, lon: -4.1, label: 'Manadon Sports Hub, Plymouth', kind: 'leisure/sports_centre' }, photon: { source: 'photon', lat: 25.8, lon: -80.1, label: 'Flamingo Park' } }, via: 'x', ...o })
  const oldR = { at: 'T0', run: 1, from: LIST, of: 3, accepted: [old('Filler A'), old('Filler B', { roof: 'dome', roofBasis: 'wikipedia lead' })], review: [reviewRow('Filler C', { why: 'old reason' })] }
  const stade = old('Stade de France', { lat: 48.9245, lon: 2.3601, zone: 'Europe/Paris', roof: 'open' })
  const newRows = () => ({ accepted: gained.filter(n => n !== MANADON && n !== 'Stade de France').map(n => england(n)).concat([{ ...stade }]), review: [reviewRow(MANADON)] })
  const newOf = (mutate = () => {}) => {
    const n = { at: 'T1', run: 2, from: LIST, accepted: [...oldR.accepted.map(x => ({ ...x })), ...newRows().accepted], review: [...oldR.review.map(x => ({ ...x })), ...newRows().review] }
    n.of = n.accepted.length + n.review.length
    mutate(n)
    return n
  }
  const list = { count: 3 + GAINED, from: LIST }
  const good = judge(oldR, newOf(), list, gained)
  check('the predicted run passes: old rows untouched, the 17 new rows present, Manadon in review is not a failure', good.problems.length === 0, good.problems.join(' | '))
  check('...with the 16 accepted and Manadon in review counted, and Manadon\'s row found', good.accepted.length === 16 && good.review.length === 1 && good.manadon?.status === 'review', `${good.accepted.length} accepted, ${good.review.length} review`)
  const caught = (name, mutate, re, l = list, g = gained) => check(name, (j => j.problems.some(p => re.test(p)))(judge(oldR, newOf(mutate), l, g)), judge(oldR, newOf(mutate), l, g).problems.join(' | ') || 'no problem reported')
  caught('AN OLD ROW THAT MOVED IS CAUGHT BY NAME AND FIELD', n => { n.accepted.find(x => x.name === 'Filler A').lat = 9 }, /Filler A moved: lat/)
  caught('AN OLD ROW THAT CHANGED ZONE IS CAUGHT', n => { n.accepted.find(x => x.name === 'Filler A').zone = 'UTC' }, /Filler A moved: zone/)
  caught('AN OLD ROW THAT CHANGED STATUS IS CAUGHT', n => { n.review.splice(0, 1); n.accepted.push(old('Filler C', { roof: 'open' })) }, /Filler C changed: review -> accepted/)
  caught('AN OLD ROW THAT CHANGED ROOF IS CAUGHT', n => { n.accepted.find(x => x.name === 'Filler A').roof = 'dome' }, /Filler A changed: roof open -> dome/)
  caught('AN OLD ROW THAT CHANGED ITS REVIEW REASON IS CAUGHT', n => { n.review.find(x => x.name === 'Filler C').why = 'a new reason' }, /Filler C changed: review reason changed/)
  caught('AN OLD ROW THAT CHANGED ITS BASIS ALONE IS CAUGHT', n => { n.accepted.find(x => x.name === 'Filler B').roofBasis = 'infobox roof' }, /Filler B changed its basis alone/)
  caught('AN OLD ROW GONE FROM THE NEW RESULTS IS CAUGHT', n => { n.accepted.splice(0, 1); n.of -= 1 }, /1 old rows are not in the new results: Filler A/)
  caught('A ROW THE LIST DID NOT GAIN IS CAUGHT', n => { n.accepted.push(old('Filler D')); n.of += 1 }, /1 rows are new in the results and the list did not gain them: Filler D/)
  caught('ONE OF THE 17 MISSING FROM THE RESULTS IS CAUGHT BY NAME', n => { n.accepted = n.accepted.filter(x => x.name !== 'Brunton Park'); n.of -= 1 }, /1 of the list's new names are not in the results: Brunton Park/)
  caught('`of` THAT IS NOT THE LIST\'S COUNT IS CAUGHT', n => { n.of = 100 }, /of says 100, and the list has 20 entries/)
  caught('`from` THAT IS NOT THE LIST IS CAUGHT', n => { n.from = 'data/other.json' }, /from says "data\/other.json"/)
  caught('ROWS THAT DO NOT ADD UP TO `of` ARE CAUGHT, a candidate lost without a word', n => { n.review.pop(); n.of = n.accepted.length + n.review.length + 1 }, /a candidate went missing without a word/)
  caught('A LIST THAT GAINED 16 NAMES, NOT THE MEASURED 17, IS CAUGHT', () => {}, /the list gained 16 names over its base, and the measurement of 2026-11-10 is 17/, list, gained.slice(1))
  caught('AN ACCEPTED ROW OUTSIDE ITS COUNTRY IS CAUGHT: an English ground placed in Florida', n => { Object.assign(n.accepted.find(x => x.name === 'Brunton Park'), { lat: 25.77, lon: -80.13 }) }, /Brunton Park was ACCEPTED at 25.77, -80.13, outside England and Wales/)
  caught('AN ACCEPTED ROW WITH ANOTHER COUNTRY\'S ZONE IS CAUGHT', n => { n.accepted.find(x => x.name === 'Brunton Park').zone = 'America/New_York' }, /Brunton Park was ACCEPTED with zone America\/New_York, and England and Wales is Europe\/London/)
  caught('THE STADE DE FRANCE PLACED IN ENGLAND IS CAUGHT', n => { Object.assign(n.accepted.find(x => x.name === 'Stade de France'), { lat: 52.4, lon: -2.2, zone: 'Europe/London' }) }, /Stade de France was ACCEPTED at 52.4, -2.2, outside Saint-Denis/)
  const reviewAway = judge(oldR, newOf(n => { Object.assign(n.review.find(x => x.name === MANADON), { lat: 25.8, lon: -80.1 }) }), list, gained)
  check('A REVIEW ROW OUTSIDE ITS COUNTRY IS REPORTED, NOT FAILED: review is where the rule puts what it could not place', reviewAway.problems.length === 0, reviewAway.problems.join(' | '))
  check('A NAME THE LIST GAINED THAT HAS NO PLACE WRITTEN FOR IT IS CAUGHT, so the table cannot lag the list', (j => j.problems.some(p => /Unwritten Park is on the list and no place was written/.test(p)))(judge(oldR, newOf(n => { n.accepted.push(england('Unwritten Park')); n.of += 1 }), { count: list.count + 1, from: LIST }, [...gained, 'Unwritten Park'])))
  // A throw here must be a FAIL that names this behaviour, not a crash that ends the run before any result is printed.
  const twice = (() => { try { return judge(oldR, newOf(n => { n.review.push(old('Filler A')); n.of += 1 }), list, gained) } catch (e) { return { threw: e.message } } })()
  check('A NAME TWICE IN THE NEW RESULTS IS REPORTED AS NOT COMPARABLE, not thrown past the report', !twice.threw && twice.c === null && /cannot be compared: duplicate row name "Filler A"/.test(twice.problems[0]), twice.threw ? `threw: ${twice.threw}` : twice.problems.join(' | '))
  check('THE EXIT CODE FOLLOWS THE JUDGEMENT: 0 and "AS PREDICTED" for the predicted run, 1 and "NOT AS PREDICTED" for any problem',
    verdict(good).code === 0 && /^\nAS PREDICTED: the 3 old rows are untouched, the 17 new rows are exactly the list's, 16 accepted inside their countries and 1 in review/.test(verdict(good).text) &&
    (v => v.code === 1 && /^\nNOT AS PREDICTED:\n {2}/.test(v.text))(verdict(judge(oldR, newOf(n => { n.accepted.find(x => x.name === 'Filler A').lat = 9 }), list, gained))))
  const text = report(good, 'OLD', 'NEW', oldR, newOf())
  check('the report carries both denominators, the 17 rows, and Manadon\'s row with every source\'s point', /COVERAGE: compared 3 of 3 old rows and 20 new rows/.test(text) && /THE 17 NEW ROWS: 16 accepted, 1 in review \(checked 17 of 17\)/.test(text) && /MANADON SPORTS HUB: review: no two independent families agree/.test(text) && /nominatim\s+50.4, -4.1\s+"Manadon Sports Hub, Plymouth"/.test(text) && /photon\s+25.8, -80.1/.test(text), text.split('\n').slice(0, 8).join(' | '))
  check('...and the 17 stated places are each one of the two the table defines', Object.keys(WHERE).length === GAINED && Object.values(WHERE).every(p => PLACES[p]), JSON.stringify(Object.keys(WHERE).length))
  finish(summarize())
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--self-test')) selfTest()
  else {
    const [oldRev, newRev] = process.argv.slice(2)
    if (!oldRev || !newRev || oldRev.startsWith('--') || newRev.startsWith('--')) { console.error('usage: node outbox/venue-task3-source-diff-2026-11-10.mjs OLD_REV NEW_REV | --self-test'); process.exit(2) }
    const show = (rev, path) => JSON.parse(execFileSync('git', ['show', `${rev}:${path}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }))
    const oldR = show(oldRev, RESULTS), newR = show(newRev, RESULTS)
    const baseNames = new Set(show(BASE, LIST).candidates.map(x => x.venue))
    const newList = show(newRev, LIST)
    const gained = newList.candidates.map(x => x.venue).filter(n => !baseNames.has(n))
    const j = judge(oldR, newR, { count: newList.candidates.length, from: LIST }, gained)
    const v = verdict(j)
    console.log(report(j, oldRev, newRev, oldR, newR))
    console.log(v.text)
    process.exitCode = v.code
  }
}
