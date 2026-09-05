// Does the page still work at the size production actually serves?
//
// WHY THIS EXISTS
//
// Every browser check in this repo loaded a two-card capture. Measured
// 2026-09-05 from `outbox/drift-log.md`, the live slate that week ran
// 1 -> 7 -> 15 -> 23 -> 46 -> 126 games, and 126 is now an ordinary Saturday:
// college football alone was 68 of them, across 8 sports.
//
// So every claim about the page — grouping, separation, overflow, scroll across
// a re-render — was verified at 2 cards on a page that must draw 126. Nothing
// was wrong with those checks; their corpus was two orders of magnitude below
// the thing they describe.
//
// The first peak run found no rendering defect. It found two CHECKS whose
// premises were properties of the small fixture rather than of the code — a
// page-wide scan for `3.5` that matched a point spread, and a gate assertion
// that assumed the selected game lists broadcasters. Both are fixed in
// `tab-check.mjs`. This file adds the assertions that only mean something at
// size.
//
// Usage:  URL='http://localhost:8080/?data=context-2026-09-05' node scripts/scale-check.mjs
//         node scripts/scale-check.mjs --self-test

import { readFileSync } from 'node:fs'
import { existsSync } from 'node:fs'
import { createChecks, isMain } from './checks.mjs'

/** Rows and sports a capture carries, read from the file the page will load. */
export const fixtureShape = payload => {
  const g = payload?.games ?? {}
  const rows = [...(g.regular ?? []), ...(g.postseason ?? [])]
  return { rows: rows.length, sports: [...new Set(rows.map(r => r.sport))].sort() }
}

// A budget, not a benchmark. It exists to catch a renderer that goes quadratic
// in card count, not to police milliseconds on a shared runner.
//
// MEASURED 2026-09-05: 126 cards mounted in 390ms locally. A first draft set
// this at 15_000, which is 38x the measurement and would have passed a renderer
// forty times slower than the one it was written against — a budget that cannot
// be exceeded is not a budget. 5_000 is ~13x, which absorbs a loaded CI runner
// and still fails anything with the wrong complexity.
//
// The measured figure prints with the result, so the next reader compares
// against a number rather than against this constant.
const MOUNT_BUDGET_MS = 5_000

if (isMain(import.meta.url)) {
  const { check, summarize } = createChecks()

  if (process.argv.includes('--self-test')) {
    const shape = fixtureShape({ games: {
      regular: [{ sport: 'MLB' }, { sport: 'CFB' }],
      postseason: [{ sport: 'MLB' }],
    } })
    check('counts regular and postseason rows together', shape.rows === 3, JSON.stringify(shape))
    check('sports are de-duplicated and sorted',
      JSON.stringify(shape.sports) === '["CFB","MLB"]', JSON.stringify(shape.sports))
    check('an empty payload is zero rows, not a crash',
      fixtureShape({}).rows === 0 && fixtureShape(null).rows === 0, 'null and {} must both read as empty')
    process.exit(summarize() === 0 ? 0 : 1)
  }

  const { chromium } = await import('playwright')
  const URL = process.env.URL || 'http://localhost:8080/?data=context-2026-09-05'
  const fixture = new global.URL(URL, 'http://x').searchParams.get('data')
  if (!fixture) {
    console.log('scale-check needs a ?data= fixture so the expected counts can be read from disk')
    process.exit(1)
  }

  const expected = fixtureShape(JSON.parse(readFileSync(`data/${fixture}.json`, 'utf8')))
  console.log(`\n  ${fixture}: ${expected.rows} row(s), ${expected.sports.length} sport(s)`)
  console.log(`  ${expected.sports.join(', ')}\n`)

  // A scale check on a small fixture proves nothing and must say so rather than
  // pass quietly — Rule 91, applied to the corpus instead of to the sample.
  check('the fixture is actually a peak slate', expected.rows >= 100,
    `${expected.rows} row(s) — under 100 this file is measuring nothing it was written for`)

  const ex = '/opt/pw-browsers/chromium'
  const browser = await chromium.launch(existsSync(ex) ? { executablePath: ex } : {})
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))

  const started = Date.now()
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(
    () => /^decoded \d+ game/.test(document.getElementById('decode-status')?.textContent || ''),
    null, { timeout: 30_000 })
  const mountMs = Date.now() - started

  const seen = await page.evaluate(() => ({
    cards: document.querySelectorAll('.desk-card').length,
    groups: [...document.querySelectorAll('.sport-group__title')].map(n => n.textContent.trim()),
    status: document.getElementById('decode-status')?.textContent ?? '',
  }))

  console.log(`  mounted in ${mountMs}ms — ${seen.cards} card(s), ${seen.groups.length} group(s)`)
  console.log(`  groups: ${seen.groups.join(' | ')}`)
  console.log(`  status: ${seen.status}\n`)

  // THE COUNT IS THE POINT. A renderer that drops rows under load, or one that
  // accumulates them across a re-render, both leave a page that looks correct
  // in a screenshot. `check:nav` caught exactly that shape at 18 cards — cards
  // going 4 -> 6 -> 12 -> 16 -> 18 under a status line still reading "decoded 2".
  check('every row in the payload is on the page',
    seen.cards === expected.rows,
    `${seen.cards} card(s) rendered from ${expected.rows} row(s)`)

  check('the status line agrees with the DOM',
    new RegExp(`^decoded ${expected.rows} game`).test(seen.status),
    `status said ${JSON.stringify(seen.status)} with ${seen.cards} cards present`)

  check('every sport in the payload has a group',
    seen.groups.length === expected.sports.length,
    `${seen.groups.length} group(s) for ${expected.sports.length} sport(s): ${seen.groups.join(', ')}`)

  check('no group heading repeats',
    new Set(seen.groups).size === seen.groups.length,
    `a sport rendered twice means grouping keyed on something unstable: ${seen.groups.join(', ')}`)

  check(`the slate mounts inside ${MOUNT_BUDGET_MS}ms`,
    mountMs < MOUNT_BUDGET_MS,
    `${mountMs}ms for ${expected.rows} rows — a renderer that goes quadratic shows up here first`)

  check('no page or console errors at this size', errors.length === 0, errors.join(' | '))

  await browser.close()
  process.exit(summarize() === 0 ? 0 : 1)
}
