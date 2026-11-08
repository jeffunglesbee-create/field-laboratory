// THE MODEL'S FORECAST ON AN EPL CARD, ON THE DEPLOYED PAGE, AT REAL TIME, FROM A RUNNER.
//
// docs/CC-CMD-2026-09-11-epl-forecaster-phase1.md. `forecast-render-check.mjs` judges the
// line on a PINNED page at a FIXED clock, because every card of every committed capture
// is in the past and the kickoff guard correctly draws nothing at real time. That proves
// the wiring. It cannot prove the one thing a reader sees: a real fixture, before its
// kickoff, on the page that is live, with the table the relay serves today. This does.
//
// IT CANNOT RUN ON EVERY DAY. A card draws a forecast only while it is Scheduled AND its
// kickoff is still ahead, and the archive creates a day's rows around 10:00 UTC on the
// day. So a run in the hours before the first kickoff of a matchday can see a forecast
// and a run at any other time cannot — measured 2026-11-08: no EPL card was Scheduled
// with a kickoff ahead until 2026-11-21 (matchday 11, first kickoff 12:30Z; matchday 10
// finished 11-08, the international break follows). A run with nothing to judge is
// reported as NOTHING-TO-JUDGE and is NOT a pass: an honest "no card qualified" is worth
// more than a green line that never saw one.
//
// WHAT IT JUDGES, per EPL card, from the DOM and the page's own requests:
//   - a card that is not Scheduled carries no forecast (the table already holds its result);
//   - a card Scheduled with its kickoff ahead carries a number or a refusal by name,
//     never nothing;
//   - a number has the shape "model table-v1 — A n% · draw n% · B n%", rounded
//     probabilities that sum to 99-101, and the full statement of its model on the node;
//   - the table was asked for exactly once, at the relay's route, and the relay answered
//     it 200 — so a run with nothing to judge still proves the live path (the route, the
//     CORS answer to the lab's origin) and not only that no card drew anything.
// A kickoff within a minute of the probe's clock is not judged: the page and the probe
// read different instants and disagreeing about a card that is kicking off is not a bug.
//
// WHAT IT DOES NOT SAY. That the number is right. The model's calibration is a separate
// question (see the CC-CMD); this proves a real forecast reaches a real card.
//
// Usage:  node scripts/forecast-live-probe.mjs --self-test
//         URL=https://field-laboratory.jeffunglesbee.workers.dev node scripts/forecast-live-probe.mjs [--date YYYY-MM-DD]
//         The automated path is .github/workflows/forecast-live-probe.yml. From the authoring
//         sandbox: PW_CHROMIUM=/opt/pw-browsers/chromium (its Chromium reached the deployed
//         page on 2026-11-08, measured with /version.txt).

import { mkdirSync, writeFileSync } from 'node:fs'
import { createChecks, finish, isMain, fieldDay } from './checks.mjs'

export const SITE = 'https://field-laboratory.jeffunglesbee.workers.dev'
export const RELAY_STANDINGS = 'https://field-relay-nba.jeffunglesbee.workers.dev/espn-standings/soccer/eng.1/standings'

/** A kickoff this close to the probe's own clock is not judged. */
export const GRACE_MS = 60_000

export const MODEL_LINE = /^model table-v1 — (.+) (\d+)% · draw (\d+)% · (.+) (\d+)%$/
export const METHOD_PREFIX = 'table-v1:'

/** The state a card's status text names, and its kickoff when it is Scheduled. `Scheduled <raw> (parsed HH:mm)`. */
export const stateOf = status => {
  const s = String(status ?? '')
  if (s.startsWith('Scheduled')) return 'scheduled'
  if (s.startsWith('In progress')) return 'inprogress'
  if (s.startsWith('Final')) return 'final'
  return 'other'
}

export const kickoffOf = status => {
  const m = /^Scheduled (\S+)/.exec(String(status ?? ''))
  const t = m ? Date.parse(m[1]) : NaN
  return Number.isFinite(t) ? t : null
}

/** The verdict for one day's EPL cards. Pure: the same cards and clock give the same answer. */
export const judge = (cards, nowMs, standings) => {
  const reasons = []
  if (cards.length === 0) return { verdict: 'NO-EPL-CARD', reasons: ['the slate has no EPL card'], judged: 0, numbers: 0 }

  let judged = 0
  let numbers = 0
  for (const c of cards) {
    const state = stateOf(c.status)
    const kickoff = state === 'scheduled' ? kickoffOf(c.status) : null
    const ahead = kickoff !== null && kickoff - nowMs > GRACE_MS
    const behind = kickoff !== null && nowMs - kickoff > GRACE_MS
    if (c.kind === null) { reasons.push(`${c.teams}: no forecast node on an EPL card`); continue }

    if (state !== 'scheduled') {
      if (c.kind !== 'none') reasons.push(`${c.teams}: a ${state} card carries a forecast (${c.kind})`)
      continue
    }
    if (behind) {
      if (c.kind !== 'none') reasons.push(`${c.teams}: kicked off ${Math.round((nowMs - kickoff) / 60000)} min ago and still carries a forecast (${c.kind})`)
      continue
    }
    if (!ahead) continue // kicking off now: not judged
    judged += 1
    if (c.kind === 'none') { reasons.push(`${c.teams}: kickoff is ahead and the card drew nothing, not even a refusal`); continue }
    if (c.kind === 'standings-pending') { reasons.push(`${c.teams}: still "standings loading" after the table should have arrived`); continue }
    if (c.kind !== 'model') continue // a refusal by name is wired, not a failure
    numbers += 1
    const m = MODEL_LINE.exec(c.text ?? '')
    if (!m) { reasons.push(`${c.teams}: a model line that is not the shape "model table-v1 — A n% · draw n% · B n%": ${JSON.stringify(c.text)}`); continue }
    const parts = [m[2], m[3], m[5]].map(Number)
    const sum = parts.reduce((a, b) => a + b, 0)
    if (parts.some(p => p > 100) || sum < 99 || sum > 101) reasons.push(`${c.teams}: the three figures ${parts.join('/')} do not read as one distribution (sum ${sum})`)
    if (!String(c.method ?? '').startsWith(METHOD_PREFIX)) reasons.push(`${c.teams}: a number without the statement of its model on the node (${JSON.stringify(c.method)})`)
  }

  if (standings.requests !== 1) reasons.push(`the table was asked for ${standings.requests} time(s), not once`)
  else if (standings.statuses.length !== 1 || standings.statuses[0] !== 200) {
    reasons.push(`the table's one request was answered ${JSON.stringify(standings.statuses)}, not 200`)
  }
  if (reasons.length > 0) return { verdict: 'FAIL', reasons, judged, numbers }
  if (judged === 0) return { verdict: 'NOTHING-TO-JUDGE', reasons: ['no EPL card is Scheduled with its kickoff ahead'], judged, numbers }
  if (numbers === 0) return { verdict: 'WIRED-NO-FORECAST', reasons: ['every judged card drew a refusal by name, none drew a number'], judged, numbers }
  return { verdict: 'PASS', reasons: [], judged, numbers }
}

// --- self-test ---------------------------------------------------------------

const SELF_TEST = isMain(import.meta.url) && process.argv.includes('--self-test')

if (SELF_TEST) {
  const { check, summarize } = createChecks()
  const NOW = Date.parse('2026-11-21T11:00:00Z')
  const ahead = '2026-11-21T12:30Z'
  const card = (over = {}) => ({
    teams: 'Arsenal v Spurs', status: `Scheduled ${ahead} (parsed 12:30)`, kind: 'model',
    text: 'model table-v1 — Arsenal 52% · draw 24% · Spurs 24%', method: 'table-v1: ppg + 0.25*gdpg + 0.10*gfpg, home +0.30', ...over,
  })
  const ok = { requests: 1, statuses: [200] }
  const v = (cards, standings = ok) => judge(cards, NOW, standings).verdict

  check('a number on a card with its kickoff ahead, asked for once, PASSES', v([card()]) === 'PASS')
  check('no EPL card is not a pass', v([]) === 'NO-EPL-CARD')
  check('only Final cards is NOTHING-TO-JUDGE, not a pass',
    v([card({ status: 'Final', kind: 'none', text: '', method: null })]) === 'NOTHING-TO-JUDGE')
  check('a Scheduled card whose kickoff has passed is NOTHING-TO-JUDGE, not a pass',
    v([card({ status: 'Scheduled 2026-11-21T09:00Z (parsed 09:00)', kind: 'none', text: '', method: null })]) === 'NOTHING-TO-JUDGE')
  check('a refusal by name on a card with its kickoff ahead is WIRED-NO-FORECAST, not a pass',
    v([card({ kind: 'clubs-not-in-table', text: 'model table-v1 — no forecast: not in the standings table: Spurs', method: null })]) === 'WIRED-NO-FORECAST')

  // The ways it must FAIL (Rule 90: a verdict that cannot fail proves nothing).
  check('A FINAL CARD WITH A FORECAST FAILS', v([card({ status: 'Final' })]) === 'FAIL')
  check('A CARD IN PLAY WITH A FORECAST FAILS', v([card({ status: 'In progress' })]) === 'FAIL')
  check('A CARD PAST ITS KICKOFF WITH A FORECAST FAILS',
    v([card({ status: 'Scheduled 2026-11-21T09:00Z (parsed 09:00)' })]) === 'FAIL')
  check('A CARD WITH ITS KICKOFF AHEAD THAT DREW NOTHING FAILS', v([card({ kind: 'none', text: '', method: null })]) === 'FAIL')
  check('A CARD STILL LOADING AFTER THE TABLE SHOULD HAVE ARRIVED FAILS',
    v([card({ kind: 'standings-pending', text: 'model table-v1 — standings loading', method: null })]) === 'FAIL')
  check('A MODEL LINE THAT IS NOT THE SHAPE FAILS', v([card({ text: 'model: Arsenal 52%' })]) === 'FAIL')
  check('FIGURES THAT DO NOT SUM TO ONE DISTRIBUTION FAIL',
    v([card({ text: 'model table-v1 — Arsenal 52% · draw 24% · Spurs 40%' })]) === 'FAIL')
  check('A NUMBER WITHOUT THE STATEMENT OF ITS MODEL FAILS', v([card({ method: null })]) === 'FAIL')
  check('A CARD WITH NO FORECAST NODE FAILS', v([card({ kind: null })]) === 'FAIL')
  check('THE TABLE ASKED FOR TWICE FAILS', v([card()], { requests: 2, statuses: [200, 200] }) === 'FAIL')
  check('THE TABLE NEVER ASKED FOR FAILS', v([card()], { requests: 0, statuses: [] }) === 'FAIL')
  check('A TABLE REQUEST THE RELAY ANSWERED 503 FAILS', v([card()], { requests: 1, statuses: [503] }) === 'FAIL')
  check('A TABLE REQUEST THAT GOT NO ANSWER AT ALL (CORS, DNS) FAILS', v([card()], { requests: 1, statuses: [] }) === 'FAIL')
  check('...and a day with nothing to judge still fails on a table the relay did not answer',
    v([card({ status: 'Final', kind: 'none', text: '', method: null })], { requests: 1, statuses: [500] }) === 'FAIL')
  check('rounded figures that sum to 101 are one distribution, not a failure',
    v([card({ text: 'model table-v1 — Chelsea 57% · draw 19% · Bournemouth 25%' })]) === 'PASS')

  // The grace window.
  check('a kickoff 30 s from now is not judged either way',
    v([card({ status: 'Scheduled 2026-11-21T11:00:30Z (parsed 11:00)', kind: 'none', text: '', method: null })]) === 'NOTHING-TO-JUDGE')
  check('a kickoff 90 s from now is judged', v([card({ status: 'Scheduled 2026-11-21T11:01:30Z (parsed 11:01)', kind: 'none', text: '', method: null })]) === 'FAIL')

  // Reading the status text.
  check('the kickoff is read from the status text', kickoffOf('Scheduled 2026-11-21T12:30Z (parsed 12:30)') === Date.parse('2026-11-21T12:30:00Z'))
  check('a kickoff the page could not parse is still read from its raw text, and no start time reads as none',
    kickoffOf('Scheduled 2026-11-21T12:30Z (UNPARSED)') !== null && kickoffOf('Scheduled — no start time') === null)
  check('the four states are told apart',
    ['Scheduled x', 'In progress', 'Final', 'Final / OT', 'Postponed'].map(stateOf).join() === 'scheduled,inprogress,final,final,other')

  process.exit(summarize() === 0 ? 0 : 1)
}

// --- live --------------------------------------------------------------------

if (isMain(import.meta.url) && !SELF_TEST) {
  const { chromium } = await import('playwright')
  const { check, summarize } = createChecks()
  const BASE = (process.env.URL || SITE).replace(/\/+$/, '')
  const at = process.argv.indexOf('--date')
  const date = at >= 0 ? process.argv[at + 1] : fieldDay()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { console.error(`--date wants YYYY-MM-DD, got ${JSON.stringify(date)}`); process.exit(2) }

  let deployed = null
  try { deployed = (await (await fetch(`${BASE}/version.txt`)).text()).trim() } catch { /* recorded as null */ }

  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {})
  const page = await browser.newPage({ viewport: { width: 1000, height: 1400 } })
  const errors = []
  const requests = []
  const statuses = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('request', r => requests.push(r.url()))
  page.on('response', r => { if (r.url() === RELAY_STANDINGS) statuses.push(r.status()) })

  await page.goto(`${BASE}/?date=${date}`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.desk-card', { timeout: 30_000 })
  // The table is one request made after the slate renders; wait for it to have answered.
  await page.waitForFunction(() =>
    ![...document.querySelectorAll('[data-testid="forecast"]')].some(n => n.getAttribute('data-forecast') === 'standings-pending'),
  null, { timeout: 20_000 }).catch(() => { /* a card still pending is a verdict below, not an exception */ })

  const nowMs = Date.now()
  const cards = await page.evaluate(() =>
    [...document.querySelectorAll('section.sport-group[data-sport="EPL"] .desk-card')].map(c => {
      const f = c.querySelector('[data-testid="forecast"]')
      return {
        teams: c.querySelector('[data-testid="teams"]')?.textContent ?? '',
        status: c.querySelector('[data-testid="status"]')?.textContent ?? '',
        market: c.querySelector('[data-testid="winprob"]')?.textContent ?? null,
        kind: f?.getAttribute('data-forecast') ?? null,
        text: f?.textContent ?? null,
        method: f?.getAttribute('data-method') ?? null,
      }
    }))
  const standings = { requests: requests.filter(u => u === RELAY_STANDINGS).length, statuses }
  const result = judge(cards, nowMs, standings)

  mkdirSync('outbox', { recursive: true })
  const shot = `outbox/forecast-live-${date}.png`
  const group = await page.$('section.sport-group[data-sport="EPL"]')
  if (group) {
    const box = await group.evaluate(el => {
      const r = el.getBoundingClientRect()
      return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height }
    })
    await page.screenshot({ path: shot, fullPage: true, clip: box })
  }
  const manifest = {
    date, probedAt: new Date(nowMs).toISOString(), site: BASE, deployed,
    verdict: result.verdict, judged: result.judged, numbers: result.numbers, reasons: result.reasons,
    standingsRequests: standings.requests, standingsStatuses: standings.statuses, standingsRoute: RELAY_STANDINGS, errors,
    screenshot: group ? shot : null, cards,
  }
  const out = `outbox/forecast-live-manifest-${date}.json`
  writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n')

  check(`the page loaded and ran without an uncaught error (${BASE}, deployed ${deployed})`, errors.length === 0, errors.join(' | '))
  check(`${date}: ${result.verdict} — ${result.judged} card(s) judged, ${result.numbers} number(s) drawn`,
    result.verdict === 'PASS', result.reasons.join(' | '))

  // Rule 91: what this covered.
  console.log(`\n  ${cards.length} EPL card(s) read on ${date}; ${result.judged} judged (Scheduled with kickoff ahead); manifest ${out}`)
  console.log(`  NOT judged: the number's accuracy, and any day other than ${date}.\n`)

  await browser.close()
  finish(summarize())
}
