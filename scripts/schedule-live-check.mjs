// Do the pitcher and records rows actually appear on a real page?
//
// Everything else about these two rows is proven offline against a recorded
// capture: the decoder, the venue join, the record formatting, the refusal of a
// blank pitcher name. None of that shows the rows on a screen. The gap between
// "the decoder is correct" and "the reader sees it" is where this repo has lost
// rows before — the PARK row was decoded fine and rendered nowhere for two
// games, because the lookup key never matched.
//
// So this loads the page with NO `?data=` pin, which is the only configuration
// where the schedule fetch runs at all, and asserts the rows are in the DOM
// with real values in them. It needs live statsapi and the live relay, and the
// agent sandbox is 403 at the proxy for both, so it runs on a runner.
//
// WHAT IT DOES NOT DO: fail because tonight has no MLB games. A slate with no
// baseball is a fact about the day, not a regression, and failing on it would
// make this red on a Tuesday in February and trained-ignored by March. The BSD
// probe next door learned the same thing the same week — its first run reported
// three broken routes because it happened to probe a fixture that had not
// kicked off, and only 2 of 48 events were playable.

import { existsSync } from 'node:fs'
import { chromium } from 'playwright'
import { createChecks } from './checks.mjs'

const URL = process.env.URL || 'http://localhost:8080/'

const sessionChromium = '/opt/pw-browsers/chromium'
const browser = await chromium.launch(
  existsSync(sessionChromium) ? { executablePath: sessionChromium } : {})
const page = await browser.newPage()

const errors = []
page.on('pageerror', e => errors.push(e.message))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })

// `domcontentloaded`, NOT `networkidle`.
//
// This step timed out at 30s on 2026-08-14, and it did so the first time it was
// ever reached: every earlier live-check run failed upstream, on a page that
// decoded to zero cards. A blank page issues no per-card requests, so
// `networkidle` settled instantly and nothing here was exercised. With the
// decoder fixed the slate renders in full and every card with a known venue
// fires its own weather fetch, so "500ms with no connections" is a much harder
// condition to reach — and it is not the condition this check cares about.
//
// The bounded `waitForSelector` below is what this script actually needs, and
// the comment under it already made that argument for the rows; the `goto` was
// left waiting on the network anyway.
//
// Scope held deliberately: `render-check.mjs:32` and `live-grouping-check.mjs:24`
// use `networkidle` against the same URL and both PASSED in the same run, which
// is evidence the page does reach idle rather than polling forever. That is
// evidence, not proof — whether the live page is ever reliably network-idle now
// that it fetches per card is a real question, and it is recorded in the outbox
// rather than settled by this change.
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.click('#tab-stats')

// The schedule lands after the first render, on purpose — the panel is drawn
// immediately from the slate and redrawn when the fetch resolves. So the rows
// cannot be read synchronously, and waiting for a selector that may legitimately
// never appear needs a bounded wait rather than a hard one.
await page.waitForSelector('.st-card [data-row="records"]', { timeout: 20_000 })
  .catch(() => {})

const seen = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.st-card')]
  return {
    cards: cards.length,
    // The discriminator for "no stats cards". A slate with no games has no
    // desk cards either; a slate WITH games and no stats cards is a break.
    deskCards: document.querySelectorAll('.desk-card').length,
    // Every row rendered, by label, with its text — so a row that is present
    // but empty is distinguishable from one that is absent. "Present" alone was
    // the check that let an empty R2 object read as healthy in production.
    records: cards.flatMap(c => [...c.querySelectorAll('[data-row="records"] .st-row__value')]
      .map(v => v.textContent.trim())),
    pitchers: cards.flatMap(c => [...c.querySelectorAll('.st-row')]
      .filter(r => !['records', 'park', 'umpire', 'venue', 'market', 'drama', 'broadcast', 'overtime']
        .includes(r.getAttribute('data-row')))
      .map(r => r.querySelector('.st-row__value')?.textContent.trim())),
    // The status line the page reports for the fetch, whatever it says.
    note: document.querySelector('#schedule')?.textContent?.trim() || '(none)',
  }
})

await browser.close()

const { check, summarize } = createChecks()

console.log(`\n${seen.cards} stats card(s); schedule note: ${seen.note}`)
console.log(`records rows: ${JSON.stringify(seen.records)}`)
console.log(`pitcher rows: ${JSON.stringify(seen.pitchers)}\n`)

// NO STATS CARDS IS TWO DIFFERENT FACTS, and this file already knew that about
// its other two rows.
//
// It NOTEs a missing records row ("correct when the slate has no MLB game whose
// venue resolves to a park") and a missing pitcher row ("correct when no starter
// has been announced"), then asserted flatly that stats cards must exist. On
// 2026-08-31 at 04:43 UTC — 00:43 ET, a day with no fixtures yet — it printed
// both NOTEs and failed on the third:
//
//     FAIL  the page rendered stats cards at all
//           → no .st-card on the page, so nothing below could be true
//
// The page was right. There was nothing to draw.
//
// `deskCards` separates the two: an empty slate renders no desk cards either, so
// zero-and-zero is a day with no games. Desk cards present and stats cards
// absent is the panel actually failing, and still fails.
if (seen.deskCards === 0) {
  console.log('NOTE  no stats cards, and no desk cards either — an empty slate.')
  console.log('      The stats panel has nothing to draw; this asserts nothing today.')
} else {
  check('the page rendered stats cards at all', seen.cards > 0,
    `no .st-card on the page despite ${seen.deskCards} desk card(s), so nothing below could be true`)
}

check('no page errors during the schedule fetch', errors.length === 0, errors.join('\n      → '))

if (seen.records.length === 0) {
  // Not a failure. Reported loudly so a green run cannot be mistaken for a run
  // that saw the rows.
  console.log('NOTE  no records row rendered. That is correct when the slate has no MLB game')
  console.log('      whose venue resolves to a park — this asserts nothing about the rows today.')
} else {
  // A record must look like a record. "39–46", en dash, digits both sides.
  const shaped = seen.records.every(t => /\d+–\d+(–\d+)?/.test(t))
  check('every records row carries real W–L numbers', shaped,
    `not W–L shaped: ${JSON.stringify(seen.records.filter(t => !/\d+–\d+(–\d+)?/.test(t)))}`)

  // Both teams in one line, which is the shape that makes production's
  // drop-both-when-one-misses bug unrepresentable here.
  const bothSides = seen.records.every(t => (t.match(/:/g) || []).length === 2)
  check('a records row names BOTH teams, never half a line', bothSides,
    `half-populated: ${JSON.stringify(seen.records.filter(t => (t.match(/:/g) || []).length !== 2))}`)
}

if (seen.pitchers.length === 0) {
  console.log('NOTE  no pitcher row rendered. Correct when no starter has been announced')
  console.log('      for any resolvable game — this asserts nothing about the rows today.')
} else {
  const named = seen.pitchers.every(t => t && t.length > 1)
  check('every pitcher row carries a name', named,
    `blank or one-character: ${JSON.stringify(seen.pitchers.filter(t => !t || t.length <= 1))}`)
}

process.exit(summarize() === 0 ? 0 : 1)
