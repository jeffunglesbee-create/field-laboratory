// The lineup disclosure on a game card, read off a rendered page.
//
// docs/CC-CMD-2026-10-27-lineups-on-game-cards.md, Task 4. Two scripts drive a
// browser at this surface and must agree on what a card is and what passing
// means: scripts/lineups-render-check.mjs (a routed context, against a local
// server) and scripts/lineups-card-probe.mjs (the real capture, against the
// deployed page, from a runner). They share this file so there is one reading of
// the DOM and one set of verdicts, and so a mutation to a verdict is caught in
// one place.
//
// WHAT IS PURE AND WHAT IS NOT. Everything exported except `readCards` and
// `runCardScenario` is a pure function of plain data and is exercised by
// `--self-test` with no browser. The verdicts are the part that can be wrong
// without the page being wrong, so each one is handed a snapshot that breaks the
// property it names and must go red (Rule 90). `readCards` and `runCardScenario`
// take a Playwright page and are exercised by the two scripts above.
//
// THE FOUR STATES. A soccer card is `joined` (a disclosure that fetches once, on
// first open), or `not-joined` (a sentence, nothing to open, nothing fetched). A
// card that is not soccer carries no `data-lineup` at all. The fourth state in
// the CC-CMD, "whatever LineupsView already returns for the vendor's own
// non-answers", is the `data-answer` of the panel inside an opened joined card,
// and `not-requested` is the pinned-page case where no request is made.
//
// Usage:  node scripts/lineups-card-lib.mjs --self-test

import { readFileSync } from 'node:fs'
import { createChecks, finish, isMain } from './checks.mjs'

/** What counts as a lineup fetch: the relay's per-event route, or a committed
 *  capture. Anything else the page requests is not this surface's business. */
export const LINEUP_REQUEST = /\/bsd\/events\/\d*\/?lineups|\/data\/lineups-[a-z0-9-]+\.json/

/** The sports the registry calls soccer, read from the F# source so this does
 *  not carry a second copy of the list. Returns [] if the registry's line shape
 *  changes, and callers treat an empty list as a failure, not as "no soccer". */
export const soccerLabelsFrom = src =>
  [...src.matchAll(/Label = "([^"]+)"; Matchup = \w+; IsSoccer = true/g)].map(m => m[1])

/** The relay's own `sport` strings for the six labels it joins, which is what a
 *  row in a context payload carries. */
export const RELAY_SOCCER = ['MLS', 'EPL', 'La Liga', 'Serie A', 'Bundesliga', 'Ligue 1']

// --- verdicts (pure) ---------------------------------------------------------

/** Every soccer card carries a `data-lineup`; no other card does. The counts are
 *  the result: a pass on zero soccer cards says nothing, so zero is a failure. */
export const coverageVerdict = cards => {
  const soccer = cards.filter(c => c.soccer)
  const other = cards.filter(c => !c.soccer)
  const states = {}
  for (const c of soccer) states[c.lineup ?? 'none'] = (states[c.lineup ?? 'none'] ?? 0) + 1
  const out = {
    cards: cards.length,
    soccerCards: soccer.length,
    soccerWithAffordance: soccer.filter(c => c.lineup !== null).length,
    nonSoccerCards: other.length,
    nonSoccerWithAffordance: other.filter(c => c.lineup !== null).length,
    soccerStates: states,
  }
  out.ok = out.soccerCards > 0 &&
    out.soccerWithAffordance === out.soccerCards &&
    out.nonSoccerWithAffordance === 0 &&
    Object.keys(states).every(k => k === 'joined' || k === 'not-joined')
  return out
}

/** Nothing fetched before a card is opened; exactly one fetch on the first open;
 *  none on a second. `second` is the count after a close and a re-open. */
export const fetchVerdict = ({ before, first, second }) => ({
  fetchesBeforeExpand: before,
  fetchesAfterFirstExpand: first,
  fetchesAfterSecondExpand: second,
  ok: before === 0 && first === 1 && second === first,
})

/** A not-joined card says its sentence, is not a disclosure, and a click on it
 *  fetches nothing. */
export const notJoinedVerdict = ({ text, isDisclosure, fetchesBefore, fetchesAfterClick }) => ({
  text,
  isDisclosure,
  fetchesCausedByClick: fetchesAfterClick - fetchesBefore,
  ok: text === 'No lineup source for this game' && isDisclosure === false &&
    fetchesAfterClick === fetchesBefore,
})

/** A joined card opened on a pinned page shows both sides, and the per-row mark
 *  is on every row. The older predicate, asserted on a card. */
export const joinedVerdict = ({ answer, sides, rows, markedRows, marks }) => ({
  answer,
  sides,
  rows,
  markedRows,
  marks,
  everyRowMarked: rows > 0 && markedRows === rows,
  ok: sides === 2 && rows >= 22 && markedRows === rows && marks.length === 1,
})

/** The disclosure must not turn the card around. `before` and `after` are the
 *  card's `aria-expanded` around two clicks on the summary; null when the card is
 *  not a disclosure of its own (so there is nothing to turn). */
export const flipVerdict = ({ before, after }) => ({
  before,
  after,
  applicable: before !== null,
  ok: before === null || before === after,
})

/** On a pinned page an event with no capture makes no request and says so. */
export const unpinnedEventVerdict = ({ answer, fetchesBefore, fetchesAfter }) => ({
  answer,
  fetchesCaused: fetchesAfter - fetchesBefore,
  ok: answer === 'not-requested' && fetchesAfter === fetchesBefore,
})

/** A context payload with ids routed onto chosen rows, for a page that has no
 *  real capture carrying them yet. The rows are the REAL rows of a committed
 *  capture; only `bsd_event_id` is set, on three of them, and the manifest says
 *  which. Returns the payload and what was done, so nothing is implied.
 *
 *  - the first soccer row that has a brief, or else the first soccer row, gets
 *    5327, the event whose capture is committed. When no soccer row has a brief
 *    (true of both committed captures), that row also gets a brief whose text
 *    says it is a routed test brief, so a card that is a disclosure of its own
 *    exists to check the lineup click does not turn it. It is reported as
 *    `routedBrief`, never presented as a real one;
 *  - the next soccer row gets 5243, an event with no capture on a pinned page;
 *  - the first row that is NOT soccer gets 5327 too, to show no affordance
 *    follows an id onto a sport that is not joined. */
export const routedContext = (payload, soccerRelayLabels = RELAY_SOCCER) => {
  const clone = JSON.parse(JSON.stringify(payload))
  const rows = [...(clone.games?.regular ?? []), ...(clone.games?.postseason ?? [])]
  const soccer = rows.filter(r => soccerRelayLabels.includes(r.sport))
  const briefIds = new Set((clone.briefs ?? []).map(b => b.game_id))
  const withBrief = soccer.find(r => briefIds.has(r.id))
  const first = withBrief ?? soccer[0]
  const second = soccer.find(r => r !== first)
  const notSoccer = rows.find(r => !soccerRelayLabels.includes(r.sport))
  const done = []
  let routedBrief = false
  if (first) {
    first.bsd_event_id = '5327'
    if (!briefIds.has(first.id)) {
      clone.briefs = [...(clone.briefs ?? []), {
        id: 'routed-test-brief', game_id: first.id, sport: first.sport, brief_type: 'game_brief',
        brief_text: 'Routed test brief. This is not a real brief; it exists so this card is a disclosure of its own.',
      }]
      routedBrief = true
    }
    done.push({ id: first.id, sport: first.sport, bsd_event_id: '5327', hasBrief: true, routedBrief })
  }
  if (second) { second.bsd_event_id = '5243'; done.push({ id: second.id, sport: second.sport, bsd_event_id: '5243', hasBrief: briefIds.has(second.id), routedBrief: false }) }
  if (notSoccer) { notSoccer.bsd_event_id = '5327'; done.push({ id: notSoccer.id, sport: notSoccer.sport, bsd_event_id: '5327', hasBrief: false, routedBrief: false }) }
  return { payload: clone, routed: done, soccerRows: soccer.length, rows: rows.length, routedBrief }
}

// --- self-test ---------------------------------------------------------------

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()

  const card = (soccer, lineup) => ({ soccer, lineup })
  const good = [card(true, 'joined'), card(true, 'not-joined'), card(true, 'not-joined'), card(false, null), card(false, null)]
  check('coverage: every soccer card has an affordance and no other card does',
    coverageVerdict(good).ok === true, JSON.stringify(coverageVerdict(good)))
  check('MUTATION: a soccer card with no data-lineup fails coverage',
    coverageVerdict([...good, card(true, null)]).ok === false)
  check('MUTATION: a non-soccer card carrying data-lineup fails coverage',
    coverageVerdict([...good, card(false, 'joined')]).ok === false)
  check('MUTATION: a data-lineup value outside the two states fails coverage',
    coverageVerdict([...good, card(true, 'loading')]).ok === false)
  check('MUTATION: a page with no soccer cards is not a pass — zero of zero says nothing',
    coverageVerdict([card(false, null), card(false, null)]).ok === false)
  check('coverage prints its denominators',
    coverageVerdict(good).soccerCards === 3 && coverageVerdict(good).nonSoccerCards === 2)

  check('fetch: none before, one on the first open, none on the second',
    fetchVerdict({ before: 0, first: 1, second: 1 }).ok === true)
  check('MUTATION: a fetch before any card is opened fails',
    fetchVerdict({ before: 1, first: 2, second: 2 }).ok === false)
  check('MUTATION: a second fetch on a re-open fails',
    fetchVerdict({ before: 0, first: 1, second: 2 }).ok === false)
  check('MUTATION: no fetch on the first open fails — a card that never loads is not a card',
    fetchVerdict({ before: 0, first: 0, second: 0 }).ok === false)

  const nj = { text: 'No lineup source for this game', isDisclosure: false, fetchesBefore: 1, fetchesAfterClick: 1 }
  check('not-joined: its own sentence, not a disclosure, no fetch', notJoinedVerdict(nj).ok === true)
  check('MUTATION: a click on a not-joined card that fetches fails',
    notJoinedVerdict({ ...nj, fetchesAfterClick: 2 }).ok === false)
  check('MUTATION: a different sentence fails', notJoinedVerdict({ ...nj, text: 'No lineups' }).ok === false)
  check('MUTATION: a not-joined card that is a disclosure fails',
    notJoinedVerdict({ ...nj, isDisclosure: true }).ok === false)

  const jv = { answer: 'confirmed', sides: 2, rows: 22, markedRows: 22, marks: ['confirmed'] }
  check('joined: both sides, every row marked', joinedVerdict(jv).ok === true)
  check('MUTATION: one unmarked row fails', joinedVerdict({ ...jv, markedRows: 21 }).ok === false)
  check('MUTATION: one side fails', joinedVerdict({ ...jv, sides: 1 }).ok === false)
  check('MUTATION: zero rows is not "every row marked"',
    joinedVerdict({ ...jv, rows: 0, markedRows: 0 }).ok === false)
  check('MUTATION: two mark words on one sheet fails',
    joinedVerdict({ ...jv, marks: ['confirmed', 'predicted'] }).ok === false)

  check('flip: a card that stays as it was passes', flipVerdict({ before: 'false', after: 'false' }).ok === true)
  check('MUTATION: a card turned over by the lineup click fails',
    flipVerdict({ before: 'false', after: 'true' }).ok === false)
  check('flip: a card that is not a disclosure has nothing to turn, and says it was not applicable',
    flipVerdict({ before: null, after: null }).ok === true && flipVerdict({ before: null, after: null }).applicable === false)

  check('pinned, no capture: not-requested and no fetch',
    unpinnedEventVerdict({ answer: 'not-requested', fetchesBefore: 1, fetchesAfter: 1 }).ok === true)
  check('MUTATION: a pinned page that fetched for an event with no capture fails',
    unpinnedEventVerdict({ answer: 'not-requested', fetchesBefore: 1, fetchesAfter: 2 }).ok === false)
  check('MUTATION: a pinned page that drew a different answer fails',
    unpinnedEventVerdict({ answer: 'confirmed', fetchesBefore: 1, fetchesAfter: 1 }).ok === false)

  // The request matcher, over the URLs this surface can actually ask for.
  check('a relay lineups URL is a lineup request',
    LINEUP_REQUEST.test('https://field-relay-nba.jeffunglesbee.workers.dev/bsd/events/5327/lineups'))
  check('a committed capture is a lineup request', LINEUP_REQUEST.test('http://localhost:8080/data/lineups-confirmed.json'))
  check('the slate capture is NOT a lineup request', !LINEUP_REQUEST.test('http://localhost:8080/data/context-2026-09-05.json'))
  check('the relay slate route is NOT a lineup request',
    !LINEUP_REQUEST.test('https://field-relay-nba.jeffunglesbee.workers.dev/context/date/2026-09-05'))

  // The registry reader.
  const reg = '| Sport.MLS -> { Label = "MLS"; Matchup = HomeVersusAway; IsSoccer = true; Modelled = true; Omission = None }\n' +
    '| Sport.MLB -> { Label = "MLB"; Matchup = AwayAtHome; IsSoccer = false; Modelled = true; Omission = None }'
  check('the registry reader finds soccer labels and only those',
    JSON.stringify(soccerLabelsFrom(reg)) === '["MLS"]', JSON.stringify(soccerLabelsFrom(reg)))
  check('MUTATION: a registry whose line shape changed yields [] — which callers treat as failure',
    soccerLabelsFrom('Label = MLS').length === 0)

  // The routed context touches three rows and only the id.
  const payload = {
    games: {
      regular: [
        { id: 'a', sport: 'NBA', home: 'x', away: 'y' },
        { id: 'b', sport: 'MLS', home: 'x', away: 'y' },
        { id: 'c', sport: 'MLS', home: 'x', away: 'y' },
        { id: 'd', sport: 'EPL', home: 'x', away: 'y' },
      ],
      postseason: [],
    },
    briefs: [{ game_id: 'c' }],
  }
  const r = routedContext(payload)
  const byId = id => r.payload.games.regular.find(x => x.id === id)
  check('routed: the soccer row WITH a brief gets 5327', byId('c').bsd_event_id === '5327')
  check('routed: the next soccer row gets 5243, the one with no capture', byId('b').bsd_event_id === '5243')
  check('routed: the first non-soccer row gets an id too, to be ignored', byId('a').bsd_event_id === '5327')
  check('routed: no other row is touched', byId('d').bsd_event_id === undefined)
  check('routed: the input is not mutated', payload.games.regular.every(x => x.bsd_event_id === undefined))
  check('routed: it reports exactly what it did', r.routed.length === 3 && r.soccerRows === 3)
  check('routed: a soccer row that already has a brief is not given a second one',
    r.routedBrief === false && r.payload.briefs.length === 1)
  const noBrief = routedContext({ ...payload, briefs: [] })
  check('routed: with no soccer brief, a LABELLED test brief is added to the chosen row, and reported',
    noBrief.routedBrief === true &&
    noBrief.payload.briefs.length === 1 &&
    /not a real brief/.test(noBrief.payload.briefs[0].brief_text) &&
    noBrief.routed[0].routedBrief === true)

  finish(summarize())
}

// --- the browser half --------------------------------------------------------

/** Read every card on the slate: its sport group, whether that group is soccer,
 *  and its `data-lineup`. Booleans and strings only. */
export const readCards = (page, soccerLabels) =>
  page.evaluate(labels => [...document.querySelectorAll('.desk-card')].map(card => {
    const label = card.closest('.sport-group')?.getAttribute('data-sport') ?? ''
    const el = card.querySelector('[data-lineup]')
    return {
      id: card.getAttribute('data-game-id'),
      sport: label,
      soccer: labels.includes(label),
      lineup: el ? el.getAttribute('data-lineup') : null,
      event: el ? el.getAttribute('data-lineup-event') : null,
    }
  }), soccerLabels)

/** Drive one joined card, one not-joined card and one joined-without-capture
 *  card on an already-loaded pinned page. Returns plain data for the verdicts
 *  and the manifest. `lineupRequests` is the running list the caller fills from
 *  `page.on('request')`. */
export async function runCardScenario(page, lineupRequests, soccerLabels) {
  const settle = () => page.waitForTimeout(400)
  const count = () => lineupRequests.length
  const out = { scenarioNotes: [] }

  await page.waitForSelector('.desk-card', { timeout: 20000 })
  await page.waitForLoadState('networkidle').catch(() => {})
  out.cards = await readCards(page, soccerLabels)
  out.requestsAtLoad = count()

  // 1. a joined card whose event has a committed capture.
  const joinedSel = '.desk-card details[data-lineup="joined"][data-lineup-event="5327"]'
  // Any joined card whose event is not one of the two committed captures (the
  // routed slate uses 5243; a real day has whatever ids the relay joined).
  const noCaptureSel = '.desk-card details[data-lineup="joined"]' +
    ':not([data-lineup-event="5327"]):not([data-lineup-event="220230"])'
  const joined = await page.$(joinedSel)
  out.joinedPresent = joined !== null
  if (joined) {
    const cardOf = await joined.evaluateHandle(e => e.closest('.desk-card'))
    const flipBefore = await cardOf.evaluate(c => c.getAttribute('aria-expanded'))
    await joined.scrollIntoViewIfNeeded()
    const before = count()
    await (await joined.$('summary')).click()
    await page.waitForSelector(`${joinedSel} .lu-panel[data-answer]`, { timeout: 15000 })
    await settle()
    const first = count()
    out.joinedCard = await joined.evaluate(d => {
      const panel = d.querySelector('.lu-panel')
      const rows = [...d.querySelectorAll('.lu-row')]
      return {
        answer: panel.getAttribute('data-answer'),
        sides: d.querySelectorAll('.lu-side').length,
        rows: rows.length,
        markedRows: rows.filter(r => (r.getAttribute('data-mark') ?? '') !== '').length,
        marks: [...new Set(rows.map(r => r.getAttribute('data-mark')))].filter(Boolean).sort(),
        open: d.hasAttribute('open'),
        summary: d.querySelector('summary')?.textContent ?? '',
      }
    })
    await (await joined.$('summary')).click() // close
    await settle()
    await (await joined.$('summary')).click() // open again
    await settle()
    const second = count()
    const flipAfter = await cardOf.evaluate(c => c.getAttribute('aria-expanded'))
    // `before` is every lineup request since navigation, up to the click: the
    // claim is that a page load asks for none. `first` and `second` are what the
    // opens added.
    out.fetch = { before, first: first - before, second: second - before }
    out.flip = { before: flipBefore, after: flipAfter }
    out.joinedOpenAfterReopen = await joined.evaluate(d => d.hasAttribute('open'))
  }

  // 2. a not-joined soccer card.
  const notJoined = await page.$('.desk-card [data-lineup="not-joined"]')
  out.notJoinedPresent = notJoined !== null
  if (notJoined) {
    await notJoined.scrollIntoViewIfNeeded()
    const text = (await notJoined.textContent())?.trim() ?? ''
    const isDisclosure = await notJoined.evaluate(e => e.tagName === 'DETAILS' || e.querySelector('details,summary') !== null)
    const fetchesBefore = count()
    await notJoined.click()
    await settle()
    out.notJoined = { text, isDisclosure, fetchesBefore, fetchesAfterClick: count() }
  }

  // 3. a joined card whose event has no committed capture, on a pinned page.
  const noCapture = await page.$(noCaptureSel)
  out.noCapturePresent = noCapture !== null
  if (noCapture) {
    await noCapture.scrollIntoViewIfNeeded()
    const fetchesBefore = count()
    await (await noCapture.$('summary')).click()
    await page.waitForSelector(`${noCaptureSel} .lu-panel[data-answer]`, { timeout: 15000 })
    await settle()
    out.noCapture = {
      answer: await noCapture.evaluate(d => d.querySelector('.lu-panel').getAttribute('data-answer')),
      fetchesBefore,
      fetchesAfter: count(),
    }
  }
  out.requestsTotal = count()
  return out
}
