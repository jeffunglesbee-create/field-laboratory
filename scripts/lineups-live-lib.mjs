// The pure half of the live-path lineup card probe.
//
// docs/CC-CMD-2026-11-03-lineup-card-live-path.md. The pinned probe (lineups-card-probe.mjs) proves a card's affordance and its
// fetch behaviour against committed captures. This is what it cannot say: on an UNPINNED page, a joined soccer card whose event has no
// committed capture makes ONE request to the relay's per-event route, for ITS OWN event, and draws what it is given.
//
// Everything here is a function of plain data, so every clause has a must-fail input (Rule 90). The browser half is
// lineups-live-probe.mjs.
//
// Usage:  node scripts/lineups-live-lib.mjs --self-test

import { createChecks, finish, isMain } from './checks.mjs'

export const RELAY = 'https://field-relay-nba.jeffunglesbee.workers.dev'

/** Every value `data-answer` can carry on a lineup panel: the eight `answerSlug` cases in src/LineupsView.fs and `renderRefusal`'s
 *  `not-requested`. Read from the source in Task 0 of the CC-CMD; a ninth value arriving unannounced is a finding, not a pass. */
export const ANSWERS = [
  'confirmed', 'predicted', 'kind-not-stated', 'kind-unrecognised',
  'served-empty', 'not-in-payload', 'explicitly-null', 'upstream-failed', 'not-requested',
]

/** The answers that draw a team sheet (the four `Sheet*` cases). Only these have two sides and marked rows to check. */
export const SHEET_ANSWERS = ['confirmed', 'predicted', 'kind-not-stated', 'kind-unrecognised']

/** The URL a card for `event` must request on an unpinned page. */
export const requestUrlFor = event => `${RELAY}/bsd/events/${event}/lineups`

/** `YYYY-MM-DD` shifted by whole days. Built from the integer parts, never parsed as a local date. */
export const shiftIso = (iso, days) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** The ET calendar day of an instant, the way the page's FIELD day is keyed (the relay keys by ET). */
export const etDay = (instant = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant)

/** The days to look at, in the order a tie is broken: today, then back three days (finished games have a confirmed sheet to show),
 *  then tomorrow. */
export const candidateDates = (today, back = 3, ahead = 1) => [
  today,
  ...Array.from({ length: back }, (_, i) => shiftIso(today, -(i + 1))),
  ...Array.from({ length: ahead }, (_, i) => shiftIso(today, i + 1)),
]

/** The day to judge: the one with the most joined soccer cards; the earlier entry wins a tie. `null` when no day has one, which is
 *  NOTHING-TO-JUDGE and never a pass. */
export const pickDate = counts => {
  let best = null
  for (const c of counts) if (c.joined > 0 && (best === null || c.joined > best.joined)) best = c
  return best
}

/** The cards to open: joined soccer cards with an event id, one per event (the same game can sit on a slate twice under two row ids and
 *  would otherwise be opened, and requested, twice), in document order, at most `n`. */
export const pickSample = (cards, n = 5) => {
  const seen = new Set(), out = []
  for (const c of cards) {
    if (out.length >= n) break
    if (c.soccer && c.lineup === 'joined' && c.event && !seen.has(c.event)) { seen.add(c.event); out.push(c) }
  }
  return out
}

/** One card, judged. `requests` is every lineup-route URL requested for this card's event while it was open (and only those).
 *  Wired means: the event is an id, there was exactly one request, it went to the relay's route for THIS event, the card drew one of the
 *  nine answers and not the pinned page's `not-requested`, and a sheet has two sides with a mark on every row. */
export const cardVerdict = ({ event, requests, answer, sides = 0, rows = 0, markedRows = 0 }) => {
  const why = []
  if (!/^\d+$/.test(String(event ?? ''))) why.push(`the card's event id is not digits (${JSON.stringify(event)})`)
  if (requests.length !== 1) why.push(`${requests.length} requests, not 1`)
  else if (requests[0] !== requestUrlFor(event)) why.push(`the request went to ${requests[0]}, not ${requestUrlFor(event)}`)
  if (answer === null || answer === undefined) why.push('no answer was drawn')
  else if (!ANSWERS.includes(answer)) why.push(`an answer this probe does not know: ${answer}`)
  else if (answer === 'not-requested') why.push('the card drew "not-requested" on an unpinned page')
  if (SHEET_ANSWERS.includes(answer)) {
    if (sides !== 2) why.push(`a sheet with ${sides} sides, not 2`)
    if (rows === 0 || markedRows !== rows) why.push(`${markedRows} of ${rows} rows marked`)
  }
  return { ok: why.length === 0, why }
}

/** Closing and re-opening a card asks nothing more of the relay. */
export const reopenVerdict = ({ before, afterReopen }) => ({ ok: before === afterReopen, why: before === afterReopen ? [] : [`${before} requests before the re-open, ${afterReopen} after`] })

/** The run's verdict. PASS needs every sampled card wired, the re-open quiet, and at least one card that drew a sheet: a probe that
 *  only ever saw refusals proved the wiring and not the rendering, and says so as WIRED-NO-SHEET. */
export const aggregate = ({ chosen, cards, reopen, extraRequests = 0 }) => {
  const answers = {}
  for (const c of cards) answers[c.answer ?? 'none'] = (answers[c.answer ?? 'none'] ?? 0) + 1
  const sheets = cards.filter(c => SHEET_ANSWERS.includes(c.answer)).length
  const wired = cards.filter(c => c.ok).length
  let verdict
  if (chosen === null) verdict = 'NOTHING-TO-JUDGE'
  else if (cards.length === 0 || wired !== cards.length || reopen?.ok !== true || extraRequests !== 0) verdict = 'FAIL'
  else if (sheets === 0) verdict = 'WIRED-NO-SHEET'
  else verdict = 'PASS'
  return { verdict, judged: cards.length, wired, sheets, answers }
}

// --- self-test ---------------------------------------------------------------

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()

  check('a shifted date is built from its parts', shiftIso('2026-11-03', -1) === '2026-11-02' && shiftIso('2026-11-30', 1) === '2026-12-01' && shiftIso('2026-03-01', -1) === '2026-02-28')
  check('the candidate days are today, three back, then tomorrow', JSON.stringify(candidateDates('2026-11-03')) === JSON.stringify(['2026-11-03', '2026-11-02', '2026-11-01', '2026-10-31', '2026-11-04']))
  check('the ET day of a UTC instant after midnight UTC is still the evening before in ET', etDay(new Date('2026-11-03T03:30:00Z')) === '2026-11-02')
  check('the nine answers are nine and distinct', ANSWERS.length === 9 && new Set(ANSWERS).size === 9)

  const counts = [{ date: 'd0', joined: 2 }, { date: 'd1', joined: 7 }, { date: 'd2', joined: 7 }, { date: 'd3', joined: 0 }]
  check('the day with the most joined cards is chosen, the earlier entry winning a tie', pickDate(counts)?.date === 'd1')
  check('MUTATION: no day with a joined card is no day, not a default', pickDate([{ date: 'a', joined: 0 }, { date: 'b', joined: 0 }]) === null)
  check('MUTATION: an empty list of days is no day', pickDate([]) === null)

  const cardsOnSlate = [
    { id: 'a', soccer: true, lineup: 'joined', event: '1' }, { id: 'b', soccer: true, lineup: 'not-joined', event: null },
    { id: 'c', soccer: false, lineup: null, event: null }, { id: 'd', soccer: true, lineup: 'joined', event: '1' },
    { id: 'e', soccer: true, lineup: 'joined', event: '2' }, { id: 'f', soccer: true, lineup: 'joined', event: '3' },
  ]
  check('the sample is the joined soccer cards, one per event, in document order', JSON.stringify(pickSample(cardsOnSlate).map(c => c.id)) === JSON.stringify(['a', 'e', 'f']))
  check('MUTATION: the sample stops at its cap', pickSample(cardsOnSlate, 2).length === 2)
  check('MUTATION: a slate with no joined card has an empty sample', pickSample(cardsOnSlate.filter(c => c.lineup !== 'joined')).length === 0)
  check('MUTATION: a joined row that is not soccer is not sampled', pickSample([{ id: 'z', soccer: false, lineup: 'joined', event: '9' }]).length === 0)

  const ok = { event: '5327', requests: [requestUrlFor('5327')], answer: 'confirmed', sides: 2, rows: 40, markedRows: 40 }
  check('one request to its own route and a marked two-sided sheet is wired', cardVerdict(ok).ok === true, JSON.stringify(cardVerdict(ok)))
  check('a refusal that names itself is wired without a sheet', cardVerdict({ event: '9', requests: [requestUrlFor('9')], answer: 'upstream-failed' }).ok === true)
  check('every one of the nine answers but the pinned one is wired when drawn', ANSWERS.filter(a => a !== 'not-requested').every(a =>
    cardVerdict({ event: '9', requests: [requestUrlFor('9')], answer: a, sides: 2, rows: 3, markedRows: 3 }).ok))
  check('MUTATION: a second request fails', cardVerdict({ ...ok, requests: [requestUrlFor('5327'), requestUrlFor('5327')] }).ok === false)
  check('MUTATION: no request fails', cardVerdict({ ...ok, requests: [] }).ok === false)
  check('MUTATION: a request for another event fails', cardVerdict({ ...ok, requests: [requestUrlFor('5328')] }).ok === false)
  check('MUTATION: a request to another host fails', cardVerdict({ ...ok, requests: ['https://example.com/bsd/events/5327/lineups'] }).ok === false)
  check('MUTATION: "not-requested" on an unpinned page fails', cardVerdict({ ...ok, answer: 'not-requested' }).ok === false)
  check('MUTATION: no answer drawn fails', cardVerdict({ ...ok, answer: null }).ok === false)
  check('MUTATION: an answer the probe does not know fails', cardVerdict({ ...ok, answer: 'loading' }).ok === false)
  check('MUTATION: a one-sided sheet fails', cardVerdict({ ...ok, sides: 1 }).ok === false)
  check('MUTATION: a sheet with an unmarked row fails', cardVerdict({ ...ok, markedRows: 39 }).ok === false)
  check('MUTATION: a sheet with no rows fails', cardVerdict({ ...ok, rows: 0, markedRows: 0 }).ok === false)
  check('MUTATION: an event id that is not digits fails', cardVerdict({ ...ok, event: '53x7', requests: [requestUrlFor('53x7')] }).ok === false)

  check('a quiet re-open passes and a second request on it fails',
    reopenVerdict({ before: 1, afterReopen: 1 }).ok === true && reopenVerdict({ before: 1, afterReopen: 2 }).ok === false)

  const good = { ok: true, answer: 'confirmed' }, refusal = { ok: true, answer: 'upstream-failed' }
  const reopenOk = { ok: true }
  check('PASS: every card wired and at least one sheet', aggregate({ chosen: { date: 'd' }, cards: [good, refusal], reopen: reopenOk }).verdict === 'PASS')
  check('...and it counts what it judged', JSON.stringify(aggregate({ chosen: { date: 'd' }, cards: [good, refusal, refusal], reopen: reopenOk }))
    === JSON.stringify({ verdict: 'PASS', judged: 3, wired: 3, sheets: 1, answers: { confirmed: 1, 'upstream-failed': 2 } }))
  check('MUTATION: only refusals is WIRED-NO-SHEET, not PASS', aggregate({ chosen: { date: 'd' }, cards: [refusal, refusal], reopen: reopenOk }).verdict === 'WIRED-NO-SHEET')
  check('MUTATION: one unwired card is FAIL however many sheets', aggregate({ chosen: { date: 'd' }, cards: [good, { ok: false, answer: 'confirmed' }], reopen: reopenOk }).verdict === 'FAIL')
  check('MUTATION: a noisy re-open is FAIL', aggregate({ chosen: { date: 'd' }, cards: [good], reopen: { ok: false } }).verdict === 'FAIL')
  check('MUTATION: no re-open recorded is FAIL, not a pass of a test that did not run', aggregate({ chosen: { date: 'd' }, cards: [good], reopen: undefined }).verdict === 'FAIL')
  check('MUTATION: a request the cards do not account for is FAIL', aggregate({ chosen: { date: 'd' }, cards: [good], reopen: reopenOk, extraRequests: 1 }).verdict === 'FAIL')
  check('MUTATION: a chosen day with no cards judged is FAIL', aggregate({ chosen: { date: 'd' }, cards: [], reopen: reopenOk }).verdict === 'FAIL')
  check('MUTATION: no day to judge is NOTHING-TO-JUDGE, never PASS', aggregate({ chosen: null, cards: [], reopen: undefined }).verdict === 'NOTHING-TO-JUDGE')

  finish(summarize())
}
