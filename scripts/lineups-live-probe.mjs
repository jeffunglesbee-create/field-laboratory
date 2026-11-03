// A soccer card's lineup, on the LIVE relay path, on the deployed page, driven from a runner.
//
// docs/CC-CMD-2026-11-03-lineup-card-live-path.md. lineups-card-probe.mjs judges a card on a PINNED page, where the only lineup file a card can
// reach is a committed capture. This judges the other case: an unpinned page (`/?date=D`, the slate from the relay), a joined card opened, the
// request it makes to the relay's per-event route, and what it draws. The verdicts are pure (lineups-live-lib.mjs); this is the browser half.
//
// WHAT IT DOES. For each of five days (today in ET, three back, tomorrow) it loads the unpinned page and counts the joined soccer cards. It
// judges the day with the most, opening up to five of its cards one at a time. Per card: one request, to its own event's route, an answer
// drawn, a sheet two-sided with every row marked. The first card is closed and re-opened (no second request). The first card that drew a
// sheet is photographed at 1000 and 390 px.
//
// WHAT IT DOES NOT. It does not say the relay has a lineup for every game: a card that honestly draws `served-empty` or `upstream-failed` is
// wired. A day with no joined soccer card is NOTHING-TO-JUDGE; a day on which every card drew a refusal is WIRED-NO-SHEET. Neither is a pass.
//
// `--routed` runs the same code against a LOCAL build (`node scripts/serve.mjs`, URL=http://localhost:8080) with the relay's context and
// lineup routes answered from committed fixtures. It exists to develop and to test this script. Its output is not the CC-CMD's artifact.
//
// Usage:  node scripts/lineups-live-probe.mjs --self-test
//         URL=https://field-laboratory.jeffunglesbee.workers.dev node scripts/lineups-live-probe.mjs
//         URL=http://localhost:8080 node scripts/lineups-live-probe.mjs --routed [--mutate-double-request]

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createChecks, finish, isMain } from './checks.mjs'
import { LINEUP_REQUEST, readCards, soccerLabelsFrom } from './lineups-card-lib.mjs'
import {
  RELAY, SHEET_ANSWERS, etDay, candidateDates, pickDate, pickSample, cardVerdict, reopenVerdict, aggregate,
} from './lineups-live-lib.mjs'

const SAMPLE = 5
const SETTLE_MS = 400
const ANSWER_WAIT_MS = 20000

/** In `--routed` mode: which committed capture answers which event. 5327 is the confirmed sheet, the first other event is the predicted one,
 *  and every further event is an upstream failure, so one run draws three different answers. Pure, so it has a test. */
export const routedAnswerFor = (event, state) => {
  state.answers ??= {}
  if (state.answers[event]) return state.answers[event]
  const first = Object.keys(state.answers).filter(e => e !== '5327').length === 0 && event !== '5327'
  return (state.answers[event] =
    event === '5327' ? { file: 'data/lineups-confirmed.json' }
    : first ? { file: 'data/lineups-predicted.json' }
    : { status: 502, body: '{"error":"routed: upstream failure"}' })
}

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()
  const state = {}
  check('routed: 5327 is the confirmed capture', routedAnswerFor('5327', state).file === 'data/lineups-confirmed.json')
  check('routed: the first other event is the predicted capture', routedAnswerFor('1', state).file === 'data/lineups-predicted.json')
  check('MUTATION: every later event is an upstream failure, not a second sheet', routedAnswerFor('2', state).status === 502 && routedAnswerFor('3', state).status === 502)
  check('routed: an event keeps its answer on a second page (the 390 px pass asks again)', routedAnswerFor('1', state).file === 'data/lineups-predicted.json' && routedAnswerFor('2', state).status === 502)
  check('the soccer registry line shape still yields six labels', soccerLabelsFrom(readFileSync('src/Desk.fs', 'utf8')).length >= 6)
  check('the two committed captures the routed mode answers with exist', ['data/lineups-confirmed.json', 'data/lineups-predicted.json'].every(f => readFileSync(f, 'utf8').length > 0))
  finish(summarize())
}

if (isMain(import.meta.url) && !process.argv.includes('--self-test')) {
  const { chromium } = await import('playwright')
  const { check, summarize } = createChecks()
  const routed = process.argv.includes('--routed')
  const mutateDouble = process.argv.includes('--mutate-double-request')
  const BASE = (process.env.URL || 'https://field-laboratory.jeffunglesbee.workers.dev').replace(/\/+$/, '')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const soccerLabels = soccerLabelsFrom(readFileSync('src/Desk.fs', 'utf8'))
  check(`the registry names soccer sports (${soccerLabels.length})`, soccerLabels.length >= 6)
  mkdirSync('outbox', { recursive: true })

  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {})
  const errors = []
  const routeState = {}

  /** Open the unpinned page for a date. Collects every lineup request (the relay's route or a committed capture) and its status. */
  const open = async (width, date) => {
    const page = await browser.newPage({ viewport: { width, height: 1400 } })
    const requests = [], statuses = new Map()
    page.on('request', req => { if (LINEUP_REQUEST.test(req.url())) requests.push(req.url()) })
    page.on('response', res => { if (LINEUP_REQUEST.test(res.url())) statuses.set(res.url(), res.status()) })
    page.on('pageerror', e => errors.push(`${width}px ${date}: ${e.message}`))
    if (routed) {
      const cors = { 'access-control-allow-origin': '*' }
      const context = readFileSync('data/context-2026-10-10.json', 'utf8')
      await page.route('**/context/date/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: context }))
      await page.route('**/bsd/events/*/lineups', r => {
        const event = /\/bsd\/events\/(\d+)\/lineups/.exec(r.request().url())?.[1]
        const a = routedAnswerFor(event, routeState)
        return r.fulfill({ status: a.status ?? 200, contentType: 'application/json', headers: cors, body: a.body ?? readFileSync(a.file, 'utf8') })
      })
    }
    await page.goto(`${BASE}/?date=${date}`, { waitUntil: 'load' })
    await page.waitForSelector('.desk-card', { timeout: 20000 }).catch(() => {})
    await page.waitForLoadState('networkidle').catch(() => {})
    return { page, requests, statuses }
  }

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
  const selFor = event => `.desk-card details[data-lineup="joined"][data-lineup-event="${event}"]`
  const readPanel = el => el.evaluate(d => {
    const panel = d.querySelector('.lu-panel')
    const rows = [...d.querySelectorAll('.lu-row')]
    const card = d.closest('.desk-card')
    return {
      answer: panel ? panel.getAttribute('data-answer') : null,
      sides: d.querySelectorAll('.lu-side').length,
      rows: rows.length,
      markedRows: rows.filter(r => (r.getAttribute('data-mark') ?? '') !== '').length,
      teams: card.querySelector('[data-testid="teams"]')?.textContent ?? null,
      // Recorded, NOT judged: the two sources spell clubs differently, and matching names here would put name logic back in a check about requests.
      sideNames: [...d.querySelectorAll('.lu-side')].map(x => x.querySelector('.lu-side__team')?.textContent?.trim() ?? ''),
    }
  })
  /** Open one joined card and read what it drew. `requests` is the page's running list; what the click added is this card's. */
  const openCard = async (page, requests, statuses, event) => {
    const el = await page.$(selFor(event))
    if (!el) return { event, present: false }
    await el.scrollIntoViewIfNeeded()
    const before = requests.length
    await (await el.$('summary')).click()
    const answered = await page.waitForSelector(`${selFor(event)} .lu-panel[data-answer]`, { timeout: ANSWER_WAIT_MS }).then(() => true, () => false)
    await page.waitForTimeout(SETTLE_MS)
    const read = answered ? await readPanel(el) : { answer: null, sides: 0, rows: 0, markedRows: 0, teams: null }
    const mine = requests.slice(before)
    return { event, present: true, el, before, mine, status: mine.length ? statuses.get(mine[0]) ?? null : null, ...read }
  }

  // --- 1. count the joined soccer cards on each candidate day ----------------
  const today = etDay()
  const dates = candidateDates(today)
  const counts = []
  let requestsAtLoad = 0
  for (const date of dates) {
    const { page, requests } = await open(1000, date)
    const cards = await readCards(page, soccerLabels)
    const row = { date, cards: cards.length, soccerCards: cards.filter(c => c.soccer).length, joined: cards.filter(c => c.soccer && c.lineup === 'joined').length, requestsAtLoad: requests.length }
    requestsAtLoad += requests.length
    counts.push(row)
    await page.close()
  }
  for (const c of counts) console.log(`  ${c.date}: ${c.cards} cards, ${c.soccerCards} soccer, ${c.joined} joined (${c.requestsAtLoad} lineup requests at load)`)
  const chosen = pickDate(counts)
  check(`a day with joined soccer cards exists among ${dates.length} (${counts.map(c => `${c.date}:${c.joined}`).join(' ')})`, chosen !== null)

  // --- 2. judge the chosen day -----------------------------------------------
  const manifest = { base: BASE, relay: RELAY, routed, measuredAt: new Date().toISOString(), todayEt: today, dates: counts, chosen: chosen?.date ?? null, cards: [], screenshots: {} }
  let verdict = aggregate({ chosen: null, cards: [], reopen: undefined })
  if (chosen) {
    const { page, requests, statuses } = await open(1000, chosen.date)
    const sample = pickSample(await readCards(page, soccerLabels), SAMPLE)
    check(`sampled ${sample.length} of ${chosen.joined} joined cards on ${chosen.date}`, sample.length > 0)
    let sheetCard = null
    for (const s of sample) {
      const got = await openCard(page, requests, statuses, s.event)
      const v = got.present
        ? cardVerdict({ event: s.event, requests: got.mine, answer: got.answer, sides: got.sides, rows: got.rows, markedRows: got.markedRows })
        : { ok: false, why: ['the card was on the slate and is gone'] }
      const entry = { event: s.event, game: got.teams ?? null, requestUrls: got.mine ?? [], status: got.status ?? null, answer: got.answer ?? null, sides: got.sides ?? 0, sideNames: got.sideNames ?? [], rows: got.rows ?? 0, markedRows: got.markedRows ?? 0, ok: v.ok, why: v.why }
      manifest.cards.push(entry)
      check(`event ${s.event} (${entry.game ?? '?'}): ${entry.requestUrls.length} request, HTTP ${entry.status}, drew ${entry.answer}`, v.ok, v.why.join('; '))
      if (!sheetCard && got.present && SHEET_ANSWERS.includes(got.answer) && v.ok) sheetCard = { event: s.event, el: got.el }
    }
    // Lineup requests no sampled card accounts for: any at load (on the counting pages and on this one) and any a card's own open did not make.
    const accounted = manifest.cards.reduce((n, c) => n + c.requestUrls.length, 0)
    const extraRequests = requestsAtLoad + (requests.length - accounted)
    manifest.extraRequests = extraRequests

    // The re-open of the first card: closing and opening it again asks nothing more.
    let reopen
    if (sample.length > 0) {
      const first = await page.$(selFor(sample[0].event))
      if (first) {
        const before = requests.length
        await (await first.$('summary')).click(); await page.waitForTimeout(SETTLE_MS)
        await (await first.$('summary')).click(); await page.waitForTimeout(SETTLE_MS)
        // The deliberate failure used to prove the check can go red: a second request, made by this script, inside the re-open.
        if (mutateDouble) { await page.evaluate(u => fetch(u).catch(() => {}), `${RELAY}/bsd/events/${sample[0].event}/lineups`); await page.waitForTimeout(SETTLE_MS) }
        reopen = reopenVerdict({ before, afterReopen: requests.length })
      }
    }
    manifest.reopen = reopen ?? null
    check('closing and re-opening the first card makes no further request', reopen?.ok === true, reopen?.why?.join('; ') ?? 'no re-open ran')
    check(`no lineup request is unaccounted for (${extraRequests} extra: ${requestsAtLoad} at load across the counting pages)`, extraRequests === 0)
    verdict = aggregate({ chosen, cards: manifest.cards, reopen, extraRequests })

    // --- 3. photograph the first card that drew a sheet, at both widths -------
    if (sheetCard) {
      const shoot = async (p, event, file) => {
        const el = await p.$(selFor(event))
        const card = (await el.evaluateHandle(e => e.closest('.desk-card'))).asElement()
        const n = await neutralise(p)
        await card.screenshot({ path: file })
        await restore(p)
        return n
      }
      const f1000 = `outbox/lineups-live-1000-${stamp}.png`
      manifest.fixedOrStickyElementsSetStaticForThePhotographs = await shoot(page, sheetCard.event, f1000)
      manifest.screenshots['1000'] = f1000
      const narrow = await open(390, chosen.date)
      const got390 = await openCard(narrow.page, narrow.requests, narrow.statuses, sheetCard.event)
      const v390 = got390.present ? cardVerdict({ event: sheetCard.event, requests: got390.mine, answer: got390.answer, sides: got390.sides, rows: got390.rows, markedRows: got390.markedRows }) : { ok: false, why: ['absent at 390 px'] }
      manifest.narrow = { event: sheetCard.event, answer: got390.answer ?? null, requestUrls: got390.mine ?? [], ok: v390.ok, why: v390.why }
      check(`390 px: event ${sheetCard.event} is wired and drew ${got390.answer ?? 'nothing'}`, v390.ok, v390.why.join('; '))
      if (v390.ok) { const f390 = `outbox/lineups-live-390-${stamp}.png`; await shoot(narrow.page, sheetCard.event, f390); manifest.screenshots['390'] = f390 }
      await narrow.page.close()
    }
    await page.close()
  }

  manifest.verdict = verdict.verdict
  manifest.judged = verdict.judged
  manifest.wired = verdict.wired
  manifest.sheets = verdict.sheets
  manifest.answers = verdict.answers
  manifest.pageErrors = errors
  check(`verdict ${verdict.verdict}: ${verdict.wired} of ${verdict.judged} sampled cards wired, ${verdict.sheets} drew a sheet, answers ${JSON.stringify(verdict.answers)}`, verdict.verdict === 'PASS')
  check('no page errors', errors.length === 0, errors.join(' | '))
  if (verdict.sheets > 0) check('screenshots written at 1000 and 390 px', Boolean(manifest.screenshots['1000'] && manifest.screenshots['390']))

  const out = `outbox/lineups-live-manifest-${stamp}${routed ? '-routed' : ''}.json`
  writeFileSync(out, JSON.stringify(manifest, null, 1) + '\n')
  console.log(`\n  manifest: ${out}`)
  console.log(`  COVERAGE: ${dates.length} days looked at, ${chosen ? `${chosen.date} judged` : 'none judged'}, ${verdict.judged} cards opened of ${chosen ? chosen.joined : 0} joined on that day${routed ? ' (ROUTED: not the CC-CMD artifact)' : ''}`)
  console.log('  NOT covered: a day other than the one chosen; cards beyond the sample; whether the relay has a lineup for every game')
  await browser.close()
  finish(summarize())
}
