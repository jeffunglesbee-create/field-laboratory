// The Lineups panel, on the rendered page.
//
// WHAT ONLY A BROWSER CAN SETTLE. The F# suite proves the seven answers decode
// to seven cases and that their sentences differ. It cannot see a single pixel,
// and the commissioning document's done conditions are about what a reader
// sees:
//
//   2. "A predicted XI is visually distinguishable from a confirmed one in a
//      committed screenshot of each."
//   3. "The three non-answers render as three different things, each stated."
//
// So this file does two different kinds of work, and they rest on different
// evidence — which is stated here rather than left for a reader to infer.
//
// THE TWO SHEETS ARE REAL BYTES. `?xi=predicted` and `?xi=confirmed` load
// data/lineups-predicted.json and data/lineups-confirmed.json, both captured
// from the deployed relay by scripts/capture-lineups-fixture.mjs. Nothing is
// intercepted; the page fetches the committed file the way it would fetch the
// route. The screenshots are of those.
//
// THE FIVE NON-ANSWERS ARE ROUTED. The vendor does not serve them on demand —
// there is no way to ask a working relay for a malformed body — so the browser
// intercepts the request and answers it. That is weaker evidence than a capture
// and it is the right kind for this claim: the subject under test is THIS
// RENDERER's treatment of a body, not the vendor's behaviour. A routed body
// exercises the same `Lineups.fromString` the live path uses.
//
// Usage:  node scripts/lineups-render-check.mjs --self-test
//         URL=http://localhost:8080 node scripts/lineups-render-check.mjs

import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { createChecks, isMain, finish } from './checks.mjs'

const BASE = (process.env.URL || 'http://localhost:8080').replace(/\/+$/, '')

/** The five bodies the vendor will not serve on request. */
export const NON_ANSWER_BODIES = {
  'served-empty': '{"lineups":{},"lineup_status":"predicted","updated_at":"2026-10-11T00:00:00Z"}',
  'not-in-payload': '{"lineup_status":"predicted"}',
  'explicitly-null': '{"lineups":null,"lineup_status":"predicted"}',
  'kind-not-stated':
    '{"lineups":{"home":{"team_name":"Home","players":[{"name":"A","position":"G","jersey_number":1}],"substitutes":[]},' +
    '"away":{"team_name":"Away","players":[{"name":"B","position":"D","jersey_number":2}],"substitutes":[]}}}',
  'kind-unrecognised':
    '{"lineup_status":"probable","lineups":{"home":{"team_name":"Home","players":[{"name":"A","position":"G","jersey_number":1}],"substitutes":[]},' +
    '"away":{"team_name":"Away","players":[{"name":"B","position":"D","jersey_number":2}],"substitutes":[]}}}',
}

/** Which of the five carry players, and so SHOULD draw a grid. */
export const CARRIES_PLAYERS = new Set(['kind-not-stated', 'kind-unrecognised'])

/** The claim a manifest makes about one rendered state, as booleans. */
export const verdictFor = r => ({
  answer: r.answer,
  headline: r.headline,
  rows: r.rows,
  markedRows: r.markedRows,
  marks: r.marks,
  everyRowMarked: r.rows > 0 && r.markedRows === r.rows,
  gridDrawn: r.sides > 0,
  oneMarkWordOnly: r.marks.length === 1,
})

// --- self-test ---------------------------------------------------------------

const SELF_TEST = isMain(import.meta.url) && process.argv.includes('--self-test')

if (SELF_TEST) {
  const { check, summarize } = createChecks()

  // The five bodies are five bodies, and each is valid JSON except where the
  // point is that it is not.
  check('five non-answer bodies', Object.keys(NON_ANSWER_BODIES).length === 5,
    Object.keys(NON_ANSWER_BODIES).join(','))
  for (const [k, v] of Object.entries(NON_ANSWER_BODIES)) {
    let ok = true
    try { JSON.parse(v) } catch { ok = false }
    check(`${k} is valid JSON — the renderer must refuse it on its CONTENT, not on a parse error`, ok, v)
  }
  // The two with players must differ from each other, or "five different
  // things" is four.
  check('the two sheets-of-unclear-kind differ',
    NON_ANSWER_BODIES['kind-not-stated'] !== NON_ANSWER_BODIES['kind-unrecognised'])
  check('only two of the five carry players', CARRIES_PLAYERS.size === 2)

  // verdictFor's own teeth.
  const marked = { answer: 'predicted', headline: 'h', rows: 22, markedRows: 22, marks: ['predicted'], sides: 2 }
  const partial = { ...marked, markedRows: 21 }
  const unmarked = { ...marked, rows: 0, markedRows: 0, marks: [] }
  const twoWords = { ...marked, marks: ['predicted', 'confirmed'] }
  check('a fully marked sheet reads as fully marked', verdictFor(marked).everyRowMarked === true)
  check('ONE UNMARKED ROW IS NOT "every row marked"', verdictFor(partial).everyRowMarked === false,
    JSON.stringify(verdictFor(partial)))
  check('zero rows is not "every row marked" either — a vacuous true is the bug',
    verdictFor(unmarked).everyRowMarked === false, JSON.stringify(verdictFor(unmarked)))
  check('a sheet carrying two different mark words is reported, not averaged',
    verdictFor(twoWords).oneMarkWordOnly === false)
  check('a grid is reported when sides rendered', verdictFor(marked).gridDrawn === true)
  check('...and not when they did not', verdictFor({ ...marked, sides: 0 }).gridDrawn === false)

  process.exit(summarize() === 0 ? 0 : 1)
}

// --- live --------------------------------------------------------------------

/** Read the panel's rendered state out of the DOM. Booleans and counts only. */
const readPanel = page =>
  page.evaluate(() => {
    const panel = document.querySelector('#panel-lineups .lu-panel')
    if (!panel) return null
    const rows = [...panel.querySelectorAll('.lu-row')]
    return {
      answer: panel.getAttribute('data-answer'),
      headline: panel.querySelector('.lu-headline')?.textContent ?? '',
      detail: panel.querySelector('.lu-detail')?.textContent ?? null,
      rows: rows.length,
      markedRows: rows.filter(r => (r.getAttribute('data-mark') ?? '') !== '').length,
      marks: [...new Set(rows.map(r => r.getAttribute('data-mark')))].filter(Boolean).sort(),
      markColours: [...new Set([...panel.querySelectorAll('.lu-row__mark')]
        .map(e => getComputedStyle(e).color))].sort(),
      sides: panel.querySelectorAll('.lu-side').length,
      teams: [...panel.querySelectorAll('.lu-side')].map(s => s.getAttribute('data-team')),
      unavailableBlocks: panel.querySelectorAll('.lu-unavail').length,
      unavailableNamed: panel.querySelectorAll('.lu-unavail__row').length,
      unavailableWithReason: [...panel.querySelectorAll('.lu-unavail__row')]
        .filter(r => (r.querySelector('.lu-unavail__why')?.textContent ?? '') !== '').length,
      disagreements: Number(panel.querySelector('.lu-disagree')?.getAttribute('data-disagreements') ?? 0),
      // The number must not be on the page. `SealedScore` has no formatter, so
      // this cannot fail from this file's side — which is exactly why it is
      // asserted here, where a future formatter would show up.
      text: panel.textContent ?? '',
    }
  })

if (isMain(import.meta.url) && !SELF_TEST) {
  const { check, summarize } = createChecks()
  // CI runs `npx playwright install --with-deps chromium` and needs nothing
  // here. A sandbox whose pre-installed build differs from the one the pinned
  // package wants can point at it instead of re-downloading:
  //   PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome
  const browser = await chromium.launch(
    process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {})
  const page = await browser.newPage({ viewport: { width: 1180, height: 1600 } })
  const errors = []
  page.on('pageerror', e => errors.push(String(e.message)))

  const open = async (query, route) => {
    if (route) {
      await page.route('**/lineups**', r => r.fulfill({
        status: 200, contentType: 'application/json', body: route,
      }))
    } else {
      await page.unroute('**/lineups**').catch(() => {})
    }
    // `data=` pins the SLATE as well, so the screenshot is of a settled page.
    // Without it the scoreboard above is mid-fetch against a relay this sandbox
    // cannot reach, and the photograph carries a "decoding…" line that is about
    // a different surface entirely.
    await page.goto(`${BASE}/?data=games-2026-08-09&${query}&tab=lineups`, { waitUntil: 'load' })
    await page.click('#tab-lineups')
    await page.waitForSelector('#panel-lineups .lu-panel', { timeout: 15000 })
    // The panel renders Loading… first; wait for the fetch to resolve into a
    // real answer rather than photographing the idle state.
    await page.waitForFunction(() => {
      const p = document.querySelector('#panel-lineups .lu-panel')
      return p && p.getAttribute('data-answer') !== null
    }, { timeout: 15000 })
    return readPanel(page)
  }

  mkdirSync('outbox', { recursive: true })
  const manifest = { base: BASE, states: {}, nonAnswers: {} }

  // --- the two real sheets ---------------------------------------------------
  for (const state of ['predicted', 'confirmed']) {
    const r = await open(`xi=${state}`, null)
    check(`${state}: the panel rendered`, r !== null, 'no .lu-panel in #panel-lineups')
    if (!r) continue
    manifest.states[state] = verdictFor(r)
    manifest.states[state].teams = r.teams
    manifest.states[state].unavailableNamed = r.unavailableNamed
    manifest.states[state].unavailableWithReason = r.unavailableWithReason
    manifest.states[state].markColours = r.markColours
    manifest.states[state].disagreements = r.disagreements

    check(`${state}: data-answer says ${state}`, r.answer === state, `got ${r.answer}`)
    check(`${state}: two sides drew`, r.sides === 2, `${r.sides} side(s): ${r.teams.join(' | ')}`)
    check(`${state}: EVERY player row carries a mark`,
      r.rows > 0 && r.markedRows === r.rows,
      `${r.markedRows} of ${r.rows} rows marked`)
    check(`${state}: the mark word is "${state}" on every row and nothing else`,
      r.marks.length === 1 && r.marks[0] === state,
      `marks: ${r.marks.join(',')}`)
    check(`${state}: a sheet of eleven drew at least eleven rows a side`,
      r.rows >= 22, `${r.rows} rows across ${r.sides} side(s)`)
    // THE SEAL, asserted where a future formatter would appear. The observed
    // ranges are 0.411–0.87 for ai_score and 0.791 / 0.85 for confidence.
    for (const n of ['0.411', '0.87', '0.791', '0.85', '0.763', '0.461']) {
      check(`${state}: the model number ${n} is NOT on the page`,
        !r.text.includes(n), `found "${n}" in the panel's text`)
    }
    const shot = `outbox/lineups-${state}.png`
    await page.screenshot({ path: shot, fullPage: false })
    manifest.states[state].screenshot = shot
    console.log(`  screenshot: ${shot}`)
  }

  // DONE CONDITION 2, as a comparison rather than two separate passes. Two
  // screenshots that happen to differ prove nothing unless the thing that
  // differs is the treatment.
  const p = manifest.states.predicted
  const c = manifest.states.confirmed
  check('DONE CONDITION 2 — the two sheets carry DIFFERENT mark words on every row',
    Boolean(p && c) && p.marks.length === 1 && c.marks.length === 1 && p.marks[0] !== c.marks[0],
    `predicted ${JSON.stringify(p?.marks)} vs confirmed ${JSON.stringify(c?.marks)}`)
  check('...and different painted colours, as the redundant channel',
    Boolean(p && c) && JSON.stringify(p.markColours) !== JSON.stringify(c.markColours),
    `${JSON.stringify(p?.markColours)} vs ${JSON.stringify(c?.markColours)}`)
  check('...and different headlines',
    Boolean(p && c) && p.headline !== c.headline, `${p?.headline} / ${c?.headline}`)

  // THE CONTRADICTION IN THE CONFIRMED CAPTURE, asserted on the rendered page.
  //
  // data/lineups-confirmed.json names Idan Toklomati in Charlotte FC's starting
  // eleven AND lists him injured. Before this was caught, both halves drew side
  // by side and the page said nothing. This asserts the page now says it — and
  // that the predicted capture, which has no such overlap, does NOT invent one.
  check('the confirmed capture\'s self-contradiction is REPORTED on the page',
    c?.disagreements === 1, `${c?.disagreements} disagreement(s) rendered`)
  check('...and the predicted capture, which has no overlap, reports none',
    p?.disagreements === 0, `${p?.disagreements} disagreement(s) rendered`)

  // TASK 4 — the unavailable list renders beside the XI, in BOTH states, with
  // the reason. Measured: 2 named on the predicted capture, 5 on the confirmed,
  // 7 of 7 carrying a reason.
  check('TASK 4 — unavailable players render beside the XI on BOTH sheets',
    Boolean(p && c) && p.unavailableNamed > 0 && c.unavailableNamed > 0,
    `predicted ${p?.unavailableNamed}, confirmed ${c?.unavailableNamed}`)
  check('...and every named one carries its stated reason',
    Boolean(p && c) &&
      p.unavailableWithReason === p.unavailableNamed &&
      c.unavailableWithReason === c.unavailableNamed,
    `predicted ${p?.unavailableWithReason}/${p?.unavailableNamed}, ` +
    `confirmed ${c?.unavailableWithReason}/${c?.unavailableNamed}`)

  // --- the five non-answers --------------------------------------------------
  for (const [slug, body] of Object.entries(NON_ANSWER_BODIES)) {
    const r = await open('xi=220230', body)
    check(`${slug}: the panel rendered`, r !== null)
    if (!r) continue
    manifest.nonAnswers[slug] = verdictFor(r)
    check(`${slug}: data-answer says so`, r.answer === slug, `got ${r.answer}`)
    if (CARRIES_PLAYERS.has(slug)) {
      check(`${slug}: it DOES carry players, so it draws them — marked "kind not stated"`,
        r.sides === 2 && r.rows > 0 && r.marks.length === 1 && r.marks[0] === 'kind not stated',
        `sides ${r.sides}, rows ${r.rows}, marks ${r.marks.join(',')}`)
    } else {
      check(`${slug}: NO GRID — a non-answer must not render as a thin team sheet`,
        r.sides === 0 && r.rows === 0, `sides ${r.sides}, rows ${r.rows}`)
    }
    check(`${slug}: it says something, and not "no lineup announced"`,
      r.headline.length > 20 && !r.headline.includes('no lineup announced'),
      JSON.stringify(r.headline))
  }

  // DONE CONDITION 3, as a set comparison. Five answers, five slugs, five
  // sentences — collapsing any two would report two facts identically.
  const slugs = Object.values(manifest.nonAnswers).map(v => v.answer)
  const lines = Object.values(manifest.nonAnswers).map(v => v.headline)
  check(`DONE CONDITION 3 — the five non-answers render as FIVE distinct data-answer values`,
    new Set(slugs).size === 5 && slugs.length === 5, slugs.join(' | '))
  check('...and five distinct sentences',
    new Set(lines).size === 5 && lines.length === 5, lines.join(' || '))
  check('...and none of the five is the predicted sheet\'s sentence',
    Boolean(p) && !lines.includes(p.headline), p?.headline)

  // The refusal path, which is not one of the seven.
  const refused = await open('xi=not-an-event', null)
  check('a ?xi this page cannot read is NOT REQUESTED, not an empty sheet and not a failure',
    refused?.answer === 'not-requested' && refused.sides === 0,
    `answer ${refused?.answer}, sides ${refused?.sides}`)
  manifest.nonAnswers['not-requested'] = verdictFor(refused ?? { rows: 0, markedRows: 0, marks: [], sides: 0 })

  check('no page errors', errors.length === 0, errors.join(' | '))

  // Rule 91 — the coverage prints where the result is read.
  console.log(`\n  states screenshotted: ${Object.keys(manifest.states).length} (predicted, confirmed — both from real captures)`)
  console.log(`  non-answers routed:   ${Object.keys(NON_ANSWER_BODIES).length} of 5, plus the local refusal`)
  console.log(`  NOT covered by either: upstream-failed, which needs a failing relay and is`)
  console.log(`                         asserted in the F# suite over a body that will not decode\n`)

  writeFileSync('outbox/lineups-render-manifest.json', JSON.stringify(manifest, null, 1) + '\n')
  console.log(`  manifest: outbox/lineups-render-manifest.json`)

  await browser.close()
  finish(summarize())
}
