// The diff the CC-CMD asks for at the end of Task 2, option 3, Step B (docs/CC-CMD-2026-11-09-venue-review-remainder.md): the results the runner's `source`
// run wrote against the results it replaced, row by row (Rule 89: the artifact is this script's printed result). Run from the repository root:
//   node outbox/venue-infobox-source-diff-2026-11-09.mjs OLD_REV NEW_REV   the report; exits 1 unless every check below holds
//   node outbox/venue-infobox-source-diff-2026-11-09.mjs --self-test       the same judgement on doctored results, each of which must be caught
//
// The comparison is the lead-whole diff tool's own (`compare`, outbox/venue-lead-whole-diff-2026-11-09.mjs, 15 controls): every row whose status, roof or review
// reason changed, every row whose coordinates, zone, qid, agreeing sources or via moved, every row on one side only, every row whose basis alone changed. What this
// script adds is the judgement, written before any new results existed:
//   1. the rows that changed are EXACTLY Johan Cruijff Arena, U.S. Bank Stadium and Wembley Stadium, each review to accepted, with the roof and the basis the
//      offline replay predicted (outbox/venue-infobox-rule-replay-2026-11-09.txt), and no other row;
//   2. nothing else moved, nothing is on one side only, and no row changed its basis alone (an infobox that agrees with a source changes nothing, the basis included);
//   3. the 8 stub-lead rows are named, each with its roof and status before and after.
//
// "The 8 stub-lead rows" are defined by the CC-CMD's own count, "9 of 442 are 14 characters or fewer, 8 accepted as open" (reproduced exactly as probe criterion A in
// outbox/venue-lead-whole-2026-11-09.md): a row whose old first-sentence lead is at most STUB_MAX characters is a stub (a bare initial or abbreviation: "Doak S.", "St.",
// "U.S."). That is 9 rows, 8 of them accepted as open once U.S. Bank Stadium, which has its own condition and is in review, is counted apart. A different count, or one of
// the 8 not accepted as open, fails the run: the definition is wrong, and the report would be naming the wrong rows.

import { execFileSync } from 'node:child_process'
import { createChecks, finish, isMain } from '../scripts/checks.mjs'
import { compare } from './venue-lead-whole-diff-2026-11-09.mjs'

const RESULTS = 'outbox/venue-source-results-latest.json'
export const STUB_MAX = 14
export const STUBS_IN_CC_CMD = 9
export const STUB_ROWS_IN_CC_CMD = 8
export const US_BANK = 'U.S. Bank Stadium'

/** What the offline replay predicted for the three rows (outbox/venue-infobox-rule-replay-2026-11-09.txt), and nothing else. */
export const EXPECTED = [
  { name: 'Johan Cruijff Arena', kind: 'review -> accepted', roof: 'retractable', basis: 'infobox roof "[[Retractable roof|Retractable]]"' },
  { name: US_BANK, kind: 'review -> accepted', roof: 'dome', basis: 'infobox roof "[[Skylight]]"' },
  { name: 'Wembley Stadium', kind: 'review -> accepted', roof: 'retractable', basis: 'infobox roof "[[Retractable roof|Partially retractable]]"' },
]

const rowList = r => [...r.accepted.map(x => ({ status: 'accepted', ...x })), ...r.review.map(x => ({ status: 'review', ...x }))]
const brief = x => (x ? { status: x.status, roof: x.roof ?? null, basis: x.roofBasis ?? null } : null)

/** Every row whose old lead is a stub, with the row before and after. */
export const stubRows = (oldR, newR) => {
  const after = new Map(rowList(newR).map(x => [x.name, x]))
  return rowList(oldR).filter(x => typeof x.lead === 'string' && x.lead.length <= STUB_MAX).map(x => ({ name: x.name, lead: x.lead, before: brief(x), after: brief(after.get(x.name)) }))
}

/** The comparison, the three rows judged against what was predicted, and everything else the report states. `problems` empty is a pass. */
export const judge = (oldR, newR) => {
  const c = compare(oldR, newR)
  const byName = new Map(c.changed.map(r => [r.name, r]))
  const missing = [], wrong = []
  for (const e of EXPECTED) {
    const r = byName.get(e.name)
    if (!r) { missing.push(e.name); continue }
    const got = { kind: r.kind, roof: r.after.roof, basis: r.after.basis }
    const diffs = ['kind', 'roof', 'basis'].filter(f => got[f] !== e[f])
    if (diffs.length) wrong.push({ name: e.name, diffs: diffs.map(f => `${f}: wanted ${JSON.stringify(e[f])}, got ${JSON.stringify(got[f])}`) })
  }
  const unexpected = c.changed.filter(r => !EXPECTED.some(e => e.name === r.name))
  const stubs = stubRows(oldR, newR)
  const problems = []
  if (missing.length) problems.push(`${missing.length} expected row(s) did not change: ${missing.join(', ')}`)
  for (const w of wrong) problems.push(`${w.name} changed, but not as predicted: ${w.diffs.join('; ')}`)
  for (const u of unexpected) problems.push(`${u.name} changed and was not predicted: ${u.kind}; after: ${u.after.why ?? u.after.basis}`)
  if (c.onlyOld.length || c.onlyNew.length) problems.push(`rows on one side only: old ${c.onlyOld.join(', ') || 'none'}; new ${c.onlyNew.join(', ') || 'none'}`)
  for (const m of c.moved) problems.push(`${m.name} moved: ${m.fields.join(', ')}`)
  for (const b of c.basisOnly) problems.push(`${b.name} changed its basis alone: ${JSON.stringify(b.before.basis)} -> ${JSON.stringify(b.after.basis)}`)
  if (stubs.length !== STUBS_IN_CC_CMD) problems.push(`the stub definition (a lead of at most ${STUB_MAX} characters) finds ${stubs.length} rows, and the CC-CMD counts ${STUBS_IN_CC_CMD}`)
  if (stubs.filter(s => s.name !== US_BANK).length !== STUB_ROWS_IN_CC_CMD) problems.push(`the stub rows other than ${US_BANK} number ${stubs.filter(s => s.name !== US_BANK).length}, and the CC-CMD counts ${STUB_ROWS_IN_CC_CMD}`)
  for (const s of stubs.filter(x => x.name !== US_BANK)) if (s.before?.status !== 'accepted' || s.before?.roof !== 'open') problems.push(`stub row ${s.name} was not accepted as open before, and the CC-CMD counts ${STUB_ROWS_IN_CC_CMD} accepted as open: ${s.before?.status}, roof ${s.before?.roof}`)
  for (const s of stubs) if (!s.after) problems.push(`stub row ${s.name} is not in the new results`)
  return { c, missing, wrong, unexpected, stubs, problems }
}

/** The last lines of the report and the exit code, from the judgement alone: nothing is decided by the caller. */
export const verdict = j => (j.problems.length
  ? { code: 1, text: `\nNOT AS PREDICTED:${j.problems.map(p => `\n  ${p}`).join('')}` }
  : { code: 0, text: `\nAS PREDICTED: exactly the ${EXPECTED.length} rows changed, as predicted, and nothing else moved; the ${STUB_ROWS_IN_CC_CMD} stub-lead rows are named above` })

const roofOf = b => (b ? String(b.roof) : 'MISSING')

export const report = (j, oldRev, newRev) => {
  const { c, stubs } = j
  const o = []
  o.push(`old results: git ${oldRev}:${RESULTS}; new results: git ${newRev}:${RESULTS}`)
  o.push(`COVERAGE: compared ${c.compared} of ${c.oldRows} old rows and ${c.newRows} new rows, by name; only in old ${c.onlyOld.length}, only in new ${c.onlyNew.length}`)
  o.push(`MOVED (lat, lon, zone, qid, agreeing, via): ${c.moved.length} of ${c.compared}`)
  o.push(`CHANGED (status, roof or review reason): ${c.changed.length} of ${c.compared}; same status and roof but a different basis: ${c.basisOnly.length}`)
  o.push(`PREDICTED ROWS: ${EXPECTED.length - j.missing.length} of ${EXPECTED.length} changed; as predicted (kind, roof, basis): ${EXPECTED.length - j.missing.length - j.wrong.length} of ${EXPECTED.length}`)
  o.push(`UNPREDICTED ROWS CHANGED: ${j.unexpected.length}`)
  o.push('')
  for (const r of c.changed) {
    o.push(`${r.name}   [${r.kind}]`)
    o.push(`    before  ${r.before.status}, roof ${r.before.roof}: ${r.before.why ?? r.before.basis}`)
    o.push(`    after   ${r.after.status}, roof ${r.after.roof}: ${r.after.why ?? r.after.basis}`)
  }
  o.push('')
  const eight = stubs.filter(s => s.name !== US_BANK)
  o.push(`STUB-LEAD ROWS: ${stubs.length} rows whose old lead is at most ${STUB_MAX} characters (the CC-CMD counts ${STUBS_IN_CC_CMD}); ${US_BANK} is the one with its own condition, and the other ${eight.length} are (the CC-CMD counts ${STUB_ROWS_IN_CC_CMD}):`)
  for (const s of eight) o.push(`  ${JSON.stringify(s.name).padEnd(30)} lead ${JSON.stringify(s.lead).padEnd(14)} roof before ${roofOf(s.before).padEnd(5)} after ${roofOf(s.after).padEnd(5)}   ${s.before?.status} -> ${s.after?.status ?? 'MISSING'}`)
  const ub = stubs.find(s => s.name === US_BANK)
  if (ub) o.push(`  ${JSON.stringify(ub.name).padEnd(30)} lead ${JSON.stringify(ub.lead).padEnd(14)} roof before ${roofOf(ub.before).padEnd(5)} after ${roofOf(ub.after).padEnd(5)}   ${ub.before?.status} -> ${ub.after?.status ?? 'MISSING'}`)
  return o.join('\n')
}

const selfTest = async () => {
  const { check, summarize } = createChecks()
  // The self-test's own fixtures are built from EXPECTED, so they cannot say that EXPECTED is right. The replay tool states the same three rows from the
  // CC-CMD's record, and this is the check that the two lists agree, loaded only here because the replay pulls in the rule and the effect tool.
  const { EXPECTED: REPLAY } = await import('./venue-infobox-rule-replay-2026-11-09.mjs')
  check('THE THREE PREDICTED ROWS ARE THE REPLAY\'S, name, status and roof, so the two tools cannot drift apart',
    EXPECTED.length === Object.keys(REPLAY).length && EXPECTED.every(e => REPLAY[e.name] && REPLAY[e.name].before[0] === 'review' && REPLAY[e.name].after[0] === 'accepted' && REPLAY[e.name].after[1] === e.roof && e.kind === 'review -> accepted'),
    JSON.stringify(REPLAY))
  const STUB_NAMES = ['Amon G. Carter Stadium', 'Doak Campbell Stadium', 'Doyt L. Perry Stadium', 'Elliott T. Bowers Stadium', 'Gerald J. Ford Stadium', 'Joan C. Edwards Stadium', "St. James' Park", 'Williams Stadium (VA)']
  const row = (name, o = {}) => ({ name, lat: 1, lon: 2, zone: 'UTC', qid: `Q-${name}`, agreeing: ['wikidata', 'nominatim'], via: 'x', roof: 'open', roofBasis: 'inferred: the lead names no roof', lead: 'A long first sentence naming no roof.', ...o })
  const reviewRow = name => row(name, { roof: null, roofBasis: 'the lead names no roof, but the article mentions "retractable roof"', why: 'roof: the lead names no roof, but the article mentions "retractable roof"', lead: name === US_BANK ? 'U.S.' : 'A first sentence naming no roof.' })
  const oldR = { accepted: [row('Filler A'), row('Filler B', { roof: 'dome', roofBasis: 'wikipedia lead' }), ...STUB_NAMES.map(n => row(n, { lead: n.slice(0, 7) }))], review: EXPECTED.map(e => reviewRow(e.name)) }
  const accept = e => ({ ...row(e.name, { roof: e.roof, roofBasis: e.basis, lead: e.name === US_BANK ? 'U.S.' : 'A first sentence naming no roof.' }) })
  const newOf = (mutate = () => {}) => {
    const n = { accepted: [...oldR.accepted.map(x => ({ ...x }))], review: [] }
    n.accepted.push(...EXPECTED.map(accept))
    mutate(n)
    return n
  }
  const good = judge(oldR, newOf())
  check('the predicted change, and nothing else, passes', good.problems.length === 0, good.problems.join(' | '))
  check('...with all three rows read as predicted and the stubs counted as 9 and 8', good.c.changed.length === 3 && good.stubs.length === 9 && good.stubs.filter(s => s.name !== US_BANK).length === 8 && good.unexpected.length === 0)
  const caught = (name, mutate, re) => check(name, (j => j.problems.some(p => re.test(p)))(judge(oldR, newOf(mutate))), judge(oldR, newOf(mutate)).problems.join(' | ') || 'no problem reported')
  caught('AN UNPREDICTED ROW THAT CHANGED STATUS IS CAUGHT', n => { n.accepted.find(x => x.name === 'Filler A').roof = null; n.review.push(n.accepted.splice(n.accepted.findIndex(x => x.name === 'Filler A'), 1)[0]) }, /Filler A changed and was not predicted/)
  caught('AN UNPREDICTED ROW THAT CHANGED ROOF IS CAUGHT', n => { n.accepted.find(x => x.name === 'Filler A').roof = 'dome' }, /Filler A changed and was not predicted: roof open -> dome/)
  caught('A STUB ROW THAT CHANGED IS CAUGHT BY NAME', n => { n.accepted.find(x => x.name === 'Joan C. Edwards Stadium').roof = 'dome' }, /Joan C\. Edwards Stadium changed and was not predicted/)
  caught('A PREDICTED ROW THAT DID NOT CHANGE IS CAUGHT', n => { n.accepted.splice(n.accepted.findIndex(x => x.name === 'Wembley Stadium'), 1); n.review.push(reviewRow('Wembley Stadium')) }, /1 expected row\(s\) did not change: Wembley Stadium/)
  caught('A PREDICTED ROW WITH THE WRONG ROOF IS CAUGHT', n => { n.accepted.find(x => x.name === US_BANK).roof = 'retractable' }, /U\.S\. Bank Stadium changed, but not as predicted: roof: wanted "dome", got "retractable"/)
  caught('A PREDICTED ROW WITH THE WRONG BASIS IS CAUGHT', n => { n.accepted.find(x => x.name === 'Wembley Stadium').roofBasis = 'wikipedia lead' }, /Wembley Stadium changed, but not as predicted: basis/)
  caught('A PREDICTED ROW THAT WENT TO REVIEW INSTEAD OF ACCEPTED IS CAUGHT', n => { const i = n.accepted.findIndex(x => x.name === 'Johan Cruijff Arena'); n.review.push({ ...n.accepted.splice(i, 1)[0], roof: null, why: 'roof: new reason' }) }, /Johan Cruijff Arena changed, but not as predicted/)
  caught('A ROW THAT CHANGED ITS BASIS ALONE IS CAUGHT', n => { n.accepted.find(x => x.name === 'Filler B').roofBasis = 'infobox roof "[[Dome]]"' }, /Filler B changed its basis alone/)
  caught('A MOVED COORDINATE IS CAUGHT', n => { n.accepted.find(x => x.name === 'Filler A').lat = 9 }, /Filler A moved: lat/)
  caught('A ROW GONE FROM THE NEW RESULTS IS CAUGHT', n => { n.accepted.splice(n.accepted.findIndex(x => x.name === 'Filler A'), 1) }, /rows on one side only: old Filler A/)
  caught('A ROW ONLY IN THE NEW RESULTS IS CAUGHT', n => { n.accepted.push(row('Filler C')) }, /rows on one side only: old none; new Filler C/)
  caught('A STUB ROW MISSING FROM THE NEW RESULTS IS CAUGHT AS A STUB ROW, beside the one-sided row', n => { n.accepted.splice(n.accepted.findIndex(x => x.name === 'Doak Campbell Stadium'), 1) }, /stub row Doak Campbell Stadium is not in the new results/)
  check('THE EXIT CODE FOLLOWS THE JUDGEMENT: 0 and "AS PREDICTED" for the predicted change, 1 and "NOT AS PREDICTED" for any problem',
    verdict(good).code === 0 && /^\nAS PREDICTED: exactly the 3 rows/.test(verdict(good).text) &&
    (v => v.code === 1 && /^\nNOT AS PREDICTED:\n {2}/.test(v.text))(verdict(judge(oldR, newOf(n => { n.accepted.find(x => x.name === 'Filler A').roof = 'dome' })))))
  // Nine stubs that are not U.S. Bank Stadium and eight others: the total is the CC-CMD's 9, and the split is not.
  const swapped = { accepted: oldR.accepted.map(x => (x.name === 'Filler A' ? { ...x, lead: 'Short.' } : x)), review: oldR.review.map(x => (x.name === US_BANK ? { ...x, lead: 'A long lead that names no roof at all.' } : x)) }
  check('A COUNT OF 9 THAT IS NOT U.S. BANK STADIUM PLUS 8 OTHERS IS CAUGHT', (j => j.stubs.length === 9 && j.problems.some(p => /other than U\.S\. Bank Stadium number 9, and the CC-CMD counts 8/.test(p)))(judge(swapped, { accepted: [...swapped.accepted, ...EXPECTED.map(accept)], review: [] })))
  const fewer = { ...oldR, accepted: oldR.accepted.filter(x => x.name !== 'Doak Campbell Stadium') }
  check('A STUB DEFINITION THAT FINDS ANOTHER COUNT THAN THE CC-CMD\'S IS CAUGHT, not reported as the 8 rows', (j => j.problems.some(p => /finds 8 rows, and the CC-CMD counts 9/.test(p)))(judge(fewer, { accepted: fewer.accepted.map(x => ({ ...x })).concat(EXPECTED.map(accept)), review: [] })))
  check('a lead of 14 characters is a stub and one of 15 is not, the CC-CMD\'s own boundary', stubRows({ accepted: [row('Fourteen', { lead: '0123456789abcd' }), row('Fifteen', { lead: '0123456789abcde' })], review: [] }, { accepted: [], review: [] }).map(s => s.name).join() === 'Fourteen')
  const notOpen = { accepted: oldR.accepted.map(x => (x.name === 'Doak Campbell Stadium' ? { ...x, roof: 'dome' } : x)), review: oldR.review }
  check('A STUB ROW THAT WAS NOT ACCEPTED AS OPEN BEFORE IS CAUGHT, the CC-CMD counts 8 accepted as open', judge(notOpen, { accepted: [...notOpen.accepted, ...EXPECTED.map(accept)], review: [] }).problems.some(p => /stub row Doak Campbell Stadium was not accepted as open before/.test(p)))
  const text = report(good, 'OLD', 'NEW')
  check('the report names each of the 8 stub rows with its roof before and after', STUB_NAMES.every(n => text.includes(JSON.stringify(n))) && (text.match(/roof before open  after open/g) ?? []).length === 8, text.split('\n').filter(l => /STUB/.test(l)).join(' | '))
  check('...and carries both denominators and the three changed rows', /COVERAGE: compared 13 of 13 old rows and 13 new rows/.test(text) && EXPECTED.every(e => text.includes(`${e.name}   [review -> accepted]`)), text.split('\n')[1])
  finish(summarize())
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--self-test')) await selfTest()
  else {
    const [oldRev, newRev] = process.argv.slice(2)
    if (!oldRev || !newRev || oldRev.startsWith('--') || newRev.startsWith('--')) { console.error('usage: node outbox/venue-infobox-source-diff-2026-11-09.mjs OLD_REV NEW_REV | --self-test'); process.exit(2) }
    const read = rev => JSON.parse(execFileSync('git', ['show', `${rev}:${RESULTS}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }))
    const j = judge(read(oldRev), read(newRev))
    const v = verdict(j)
    console.log(report(j, oldRev, newRev))
    console.log(v.text)
    process.exitCode = v.code
  }
}
