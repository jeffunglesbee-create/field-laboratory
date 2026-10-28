// The lineup on a game card, on the DEPLOYED page, driven from a runner.
//
// docs/CC-CMD-2026-10-27-lineups-on-game-cards.md, DONE CONDITION 1: "On the
// pinned page, a committed screenshot at 1000 px and 390 px of one joined card
// expanded and one not-joined card, by a CI-as-proxy workflow writing
// outbox/lineups-card-manifest-*.json with booleans".
//
// WHY A RUNNER. Sandbox browser access has proven unreliable in this project
// (timeouts, viewport mismatches), and the deployed page is the thing the
// condition is about. A runner has open egress and a real Chromium, so the
// evidence is a screenshot and a manifest of the page that is actually served.
//
// TWO PINNED PAGES, because one real capture cannot show both states:
//   A  ?data=context-2026-10-10   the day event 5327 was played, recaptured AFTER
//      the relay joined it (scripts/context-ids.mjs), so its soccer rows carry
//      real ids. A joined card, expanded; a joined card with no committed
//      capture; the fetch counts. Real bytes: nothing is routed here.
//   B  ?data=context-2026-09-05   captured before the relay carried the field, so
//      no row has an id. That is the real "older payload" case, and every soccer
//      card on it is not-joined.
// A is also searched for a not-joined card in case the day has one; B always does.
//
// The viewing page is `?data=...`, so the slate does not call the relay for the
// day. The only lineup requests are the ones a card makes when it is opened, and
// on a pinned page those are the committed captures.
//
// Usage:  node scripts/lineups-card-probe.mjs --self-test
//         URL=https://field-laboratory.jeffunglesbee.workers.dev node scripts/lineups-card-probe.mjs

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createChecks, finish, isMain } from './checks.mjs'
import {
  LINEUP_REQUEST, soccerLabelsFrom, coverageVerdict, fetchVerdict, notJoinedVerdict,
  joinedVerdict, flipVerdict, unpinnedEventVerdict, runCardScenario,
} from './lineups-card-lib.mjs'

export const PAGE_A = 'context-2026-10-10'
export const PAGE_B = 'context-2026-09-05'
export const VIEWPORTS = [1000, 390]

/** The joined photograph must show a team sheet: the card of event 5327, whose
 *  committed capture is a confirmed sheet. The first version photographed the first
 *  open joined card in document order, a card with no capture, which shows "no
 *  request was made". Pure, so the wrong case is a must-fail input. */
export const photographShowsASheet = game =>
  game?.answer === 'confirmed' && game?.event === '5327'

/** One viewport's manifest from the two pages' scenarios. Booleans and counts
 *  only, named as the CC-CMD names them. Pure. A page that lacks the card it was
 *  asked for FAILS: a missing card is not a pass. */
export const manifestOf = ({ viewport, a, b }) => {
  const covA = coverageVerdict(a.cards)
  const covB = coverageVerdict(b.cards)
  const fetched = a.joinedPresent ? fetchVerdict(a.fetch) : null
  const joined = a.joinedPresent ? joinedVerdict(a.joinedCard) : null
  const flip = a.joinedPresent ? flipVerdict(a.flip) : null
  const noCapture = a.noCapturePresent ? unpinnedEventVerdict(a.noCapture) : null
  const notJoined = b.notJoinedPresent ? notJoinedVerdict(b.notJoined) : null
  const m = {
    viewport,
    soccerCardsWithAffordance: covA.soccerWithAffordance,
    soccerCards: covA.soccerCards,
    nonSoccerWithAffordance: covA.nonSoccerWithAffordance,
    nonSoccerCards: covA.nonSoccerCards,
    olderPayloadSoccerCardsWithAffordance: covB.soccerWithAffordance,
    olderPayloadSoccerCards: covB.soccerCards,
    olderPayloadNonSoccerWithAffordance: covB.nonSoccerWithAffordance,
    joinedCardPresent: a.joinedPresent === true,
    fetchesBeforeExpand: fetched ? fetched.fetchesBeforeExpand : null,
    fetchesAfterFirstExpand: fetched ? fetched.fetchesAfterFirstExpand : null,
    fetchesAfterSecondExpand: fetched ? fetched.fetchesAfterSecondExpand : null,
    joinedCardShowsBothSides: joined ? joined.sides === 2 : false,
    joinedCardRows: joined ? joined.rows : 0,
    joinedCardEveryRowMarked: joined ? joined.everyRowMarked : false,
    flipApplicable: flip ? flip.applicable : false,
    cardNotTurnedByLineupClick: flip ? flip.ok : false,
    noCaptureCardRequestsNothing: noCapture ? noCapture.ok : false,
    notJoinedCardPresent: b.notJoinedPresent === true,
    notJoinedSaysItAndFetchesNothing: notJoined ? notJoined.ok : false,
  }
  m.ok = covA.ok && covB.ok &&
    m.joinedCardPresent && (fetched?.ok ?? false) && (joined?.ok ?? false) &&
    (flip?.ok ?? false) && m.noCaptureCardRequestsNothing && m.notJoinedSaysItAndFetchesNothing
  return m
}

// --- self-test ---------------------------------------------------------------

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()
  const cards = [{ soccer: true, lineup: 'joined' }, { soccer: true, lineup: 'not-joined' }, { soccer: false, lineup: null }]
  const old = [{ soccer: true, lineup: 'not-joined' }, { soccer: true, lineup: 'not-joined' }, { soccer: false, lineup: null }]
  const a = {
    cards, joinedPresent: true, noCapturePresent: true, notJoinedPresent: false,
    fetch: { before: 0, first: 1, second: 1 },
    joinedCard: { answer: 'confirmed', sides: 2, rows: 40, markedRows: 40, marks: ['confirmed'] },
    flip: { before: null, after: null },
    noCapture: { answer: 'not-requested', fetchesBefore: 1, fetchesAfter: 1 },
  }
  const b = { cards: old, notJoinedPresent: true, joinedPresent: false,
    notJoined: { text: 'No lineup source for this game', isDisclosure: false, fetchesBefore: 0, fetchesAfterClick: 0 } }
  const good = manifestOf({ viewport: 1000, a, b })
  check('a page A with a joined card and a page B with a not-joined card passes', good.ok === true, JSON.stringify(good))
  check('...and the manifest names what the CC-CMD names',
    good.soccerCardsWithAffordance === 2 && good.soccerCards === 2 && good.nonSoccerWithAffordance === 0 &&
    good.fetchesBeforeExpand === 0 && good.fetchesAfterSecondExpand === good.fetchesAfterFirstExpand)
  check('MUTATION: a fetch before any open fails', manifestOf({ viewport: 1, a: { ...a, fetch: { before: 1, first: 1, second: 1 } }, b }).ok === false)
  check('MUTATION: a second fetch on a re-open fails', manifestOf({ viewport: 1, a: { ...a, fetch: { before: 0, first: 1, second: 2 } }, b }).ok === false)
  check('MUTATION: a non-soccer card with an affordance fails',
    manifestOf({ viewport: 1, a: { ...a, cards: [...cards, { soccer: false, lineup: 'joined' }] }, b }).ok === false)
  check('MUTATION: a soccer card with no affordance fails',
    manifestOf({ viewport: 1, a: { ...a, cards: [...cards, { soccer: true, lineup: null }] }, b }).ok === false)
  check('MUTATION: no joined card on the real capture fails — a missing card is not a pass',
    manifestOf({ viewport: 1, a: { ...a, joinedPresent: false }, b }).ok === false)
  check('MUTATION: no not-joined card on the older capture fails',
    manifestOf({ viewport: 1, a, b: { ...b, notJoinedPresent: false } }).ok === false)
  check('MUTATION: a sheet with an unmarked row fails',
    manifestOf({ viewport: 1, a: { ...a, joinedCard: { ...a.joinedCard, markedRows: 39 } }, b }).ok === false)
  check('MUTATION: a card turned over by the lineup click fails',
    manifestOf({ viewport: 1, a: { ...a, flip: { before: 'false', after: 'true' } }, b }).ok === false)
  check('MUTATION: a no-capture card that fetched fails',
    manifestOf({ viewport: 1, a: { ...a, noCapture: { answer: 'not-requested', fetchesBefore: 1, fetchesAfter: 2 } }, b }).ok === false)
  check('MUTATION: a not-joined card that fetched fails',
    manifestOf({ viewport: 1, a, b: { ...b, notJoined: { ...b.notJoined, fetchesAfterClick: 1 } } }).ok === false)
  check('flip is reported as not applicable when the card is not a disclosure, rather than as a pass of a test that did not run',
    good.flipApplicable === false)
  check('a lineup request matcher exists for the counts', LINEUP_REQUEST instanceof RegExp)
  check('the joined photograph: event 5327 drawn as a confirmed sheet passes',
    photographShowsASheet({ id: 'g', event: '5327', answer: 'confirmed', teams: 'Charlotte FC v FC Dallas' }) === true)
  check('MUTATION: the card the first version photographed (an event with no capture, "not-requested") fails',
    photographShowsASheet({ id: 'g', event: '5333', answer: 'not-requested', teams: 'St. Louis CITY SC v LA Galaxy' }) === false)
  check('MUTATION: event 5327 drawn as anything but a confirmed sheet fails',
    photographShowsASheet({ id: 'g', event: '5327', answer: 'upstream-failed' }) === false)
  check('MUTATION: no photograph at all fails — a missing card is not a pass',
    photographShowsASheet(undefined) === false)
  finish(summarize())
}

// --- live --------------------------------------------------------------------

if (isMain(import.meta.url) && !process.argv.includes('--self-test')) {
  const { chromium } = await import('playwright')
  const { check, summarize } = createChecks()
  const BASE = (process.env.URL || 'https://field-laboratory.jeffunglesbee.workers.dev').replace(/\/+$/, '')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const soccerLabels = soccerLabelsFrom(readFileSync('src/Desk.fs', 'utf8'))
  check(`the registry names soccer sports (${soccerLabels.length})`, soccerLabels.length >= 6)

  mkdirSync('outbox', { recursive: true })
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {})
  const manifest = { base: BASE, pages: { A: PAGE_A, B: PAGE_B }, measuredAt: new Date().toISOString(), viewports: [] }
  const errors = []

  for (const width of VIEWPORTS) {
    const open = async data => {
      const page = await browser.newPage({ viewport: { width, height: 1400 } })
      const requests = []
      page.on('request', req => { if (LINEUP_REQUEST.test(req.url())) requests.push(req.url()) })
      page.on('pageerror', e => errors.push(`${width}px ${data}: ${e.message}`))
      await page.goto(`${BASE}/?data=${data}`, { waitUntil: 'load' })
      return { page, requests }
    }
    const A = await open(PAGE_A)
    const sa = await runCardScenario(A.page, A.requests, soccerLabels)
    const B = await open(PAGE_B)
    const sb = await runCardScenario(B.page, B.requests, soccerLabels)

    // The screenshots. THE JOINED CARD IS THE ONE WITH A COMMITTED CAPTURE (event
    // 5327), not the first open joined card in document order: several joined
    // cards are open by now and the first is one with no capture, which shows the
    // pinned page's "no request was made" sentence and not a team sheet. The first
    // version of this selected by order and photographed exactly that; the image
    // was read before it was believed. `game` names what was photographed.
    const shots = {}
    const game = {}
    // A card taller than the viewport is photographed by stitching, and a sticky or
    // fixed header is then pasted across the middle of it. The page's own chrome is
    // not what is being photographed, so every fixed or sticky element is set to
    // static for the shot and restored after; the manifest says how many.
    const neutralise = page => page.evaluate(() => {
      const els = [...document.querySelectorAll('*')].filter(e => ['fixed', 'sticky'].includes(getComputedStyle(e).position))
      for (const e of els) { e.setAttribute('data-was-position', e.style.position || '-'); e.style.position = 'static' }
      return els.length
    })
    const restore = page => page.evaluate(() => {
      for (const e of document.querySelectorAll('[data-was-position]')) {
        const was = e.getAttribute('data-was-position'); e.style.position = was === '-' ? '' : was; e.removeAttribute('data-was-position')
      }
    })
    let neutralised = 0
    const shoot = async (selector, key, file, page = A.page) => {
      const el = await page.$(selector)
      if (!el) return
      const card = (await el.evaluateHandle(e => e.closest('.desk-card'))).asElement()
      game[key] = await card.evaluate(c => ({
        id: c.getAttribute('data-game-id'),
        event: c.querySelector('[data-lineup-event]')?.getAttribute('data-lineup-event') ?? null,
        answer: c.querySelector('.lu-panel')?.getAttribute('data-answer') ?? null,
        teams: c.querySelector('[data-testid="teams"]')?.textContent ?? null,
      }))
      shots[key] = `outbox/lineups-card-${width}-${file}.png`
      neutralised = Math.max(neutralised, await neutralise(page))
      await card.screenshot({ path: shots[key] })
      await restore(page)
    }
    await shoot('details[data-lineup="joined"][data-lineup-event="5327"][open]', 'joined', 'joined')
    await shoot('details[data-lineup="joined"][open]:not([data-lineup-event="5327"]):not([data-lineup-event="220230"])', 'noCapture', 'joined-no-capture')
    await shoot('[data-lineup="not-joined"]', 'notJoined', 'not-joined', B.page)
    const m = manifestOf({ viewport: width, a: sa, b: sb })
    m.screenshots = shots
    m.photographed = game
    m.fixedOrStickyElementsSetStaticForThePhotographs = neutralised
    m.joinedPhotographShowsASheet = photographShowsASheet(game.joined)
    manifest.viewports.push(m)

    check(`${width}px: every soccer card on ${PAGE_A} carries data-lineup, no other does ` +
      `(${m.soccerCardsWithAffordance} of ${m.soccerCards} soccer, ${m.nonSoccerWithAffordance} of ${m.nonSoccerCards} others)`,
      m.soccerCardsWithAffordance === m.soccerCards && m.soccerCards > 0 && m.nonSoccerWithAffordance === 0)
    check(`${width}px: fetches before any open / after the first / after the second: ` +
      `${m.fetchesBeforeExpand} / ${m.fetchesAfterFirstExpand} / ${m.fetchesAfterSecondExpand}`,
      m.fetchesBeforeExpand === 0 && m.fetchesAfterFirstExpand === 1 && m.fetchesAfterSecondExpand === m.fetchesAfterFirstExpand)
    check(`${width}px: the joined card shows both sides and a mark on every row (${m.joinedCardRows} rows)`,
      m.joinedCardShowsBothSides && m.joinedCardEveryRowMarked)
    check(`${width}px: a joined card with no committed capture requests nothing`, m.noCaptureCardRequestsNothing)
    check(`${width}px: a not-joined card on the older capture says so and fetches nothing`, m.notJoinedSaysItAndFetchesNothing)
    check(`${width}px: screenshots written (${Object.values(shots).join(', ') || 'none'})`, Boolean(shots.joined && shots.notJoined && shots.noCapture))
    check(`${width}px: the joined photograph is the team sheet of event 5327, not the no-capture sentence ` +
      `(${JSON.stringify(game.joined ?? null)})`, m.joinedPhotographShowsASheet)
    m.ok = m.ok && m.joinedPhotographShowsASheet
    check(`${width}px: manifest verdict`, m.ok, JSON.stringify(m))
    await A.page.close()
    await B.page.close()
  }
  check('no page errors', errors.length === 0, errors.join(' | '))

  manifest.ok = manifest.viewports.every(v => v.ok) && errors.length === 0
  const out = `outbox/lineups-card-manifest-${stamp}.json`
  writeFileSync(out, JSON.stringify(manifest, null, 1) + '\n')
  console.log(`\n  manifest: ${out}`)
  console.log(`  pages:    A ${PAGE_A} (real ids), B ${PAGE_B} (older payload, no ids); ${VIEWPORTS.join(' and ')} px`)
  console.log(`  NOT covered: a card whose event has a committed capture other than 5327, and a flippable soccer card on the real capture (flip is reported as not applicable when absent)`)
  await browser.close()
  finish(summarize())
}
