// The tab system and both pick panels, driven in a real browser.
//
// Two things are being checked, and only one of them is about tabs.
//
//   1. The tablist behaves like a tablist — arrows move, one tab is in the tab
//      order, panels show and hide. A row of buttons that toggles `hidden` is
//      not a tablist to a screen reader.
//
//   2. THE COMPOSITE SCORE NEVER REACHES THE DOM. `SealedRank` makes that a
//      compile-time property, and docs/PICK-PROOF.md compiles the violations to
//      prove it. This asserts the same thing from the outside, on the rendered
//      page, because a seal that holds in the type system and leaks through
//      some other path would satisfy the proof doc and still be wrong.
//
// Usage:  URL=http://localhost:8080/?data=games-2026-08-09 node scripts/tab-check.mjs

import { chromium } from 'playwright'
import { existsSync } from 'node:fs'
import { createChecks } from './checks.mjs'

const URL_BASE = process.env.URL || 'http://localhost:8080/?data=games-2026-08-09'
const { check, summarize } = createChecks()

const sessionChromium = '/opt/pw-browsers/chromium'
const browser = await chromium.launch(
  existsSync(sessionChromium) ? { executablePath: sessionChromium } : {})
const page = await browser.newPage()

const failures = []
page.on('pageerror', e => failures.push(String(e)))

await page.goto(URL_BASE, { waitUntil: 'networkidle' })

// Scoped to the TOP-LEVEL tablist. Pick'em's sport chips are a tablist too, so
// a bare [role="tab"] query now matches both and reports five tabs and two
// selected ones. Nesting a tablist inside a tabpanel is legitimate; a global
// selector across them is not.
const TABS = '.tabs [role="tab"]'

const selected = async () =>
  page.$$eval(TABS, ts =>
    ts.filter(t => t.getAttribute('aria-selected') === 'true').map(t => t.id))

const visiblePanels = async () =>
  page.$$eval('[role="tabpanel"]', ps => ps.filter(p => !p.hasAttribute('hidden')).map(p => p.id))

const topTabs = () => page.$$(TABS)

// --- the tablist -------------------------------------------------------------

check('four top-level tabs exist', (await topTabs()).length === 4,
  `${(await topTabs()).length} tabs — Scoreboard, Field's Pick, Scout's Pick, Pick'em`)

check('exactly one tab starts selected', (await selected()).length === 1,
  `selected: ${JSON.stringify(await selected())}`)

check('exactly one panel starts visible', (await visiblePanels()).length === 1,
  `visible: ${JSON.stringify(await visiblePanels())}`)

check('only one top-level tab is in the tab order',
  (await page.$$eval(TABS, ts => ts.filter(t => t.getAttribute('tabindex') === '0').length)) === 1,
  'a roving tabindex is what makes a tablist one stop instead of four')

// Keyboard, which is the half most likely to be skipped.
await page.focus('#tab-scoreboard')
await page.keyboard.press('ArrowRight')
check('ArrowRight moves selection to Field\'s Pick',
  (await selected())[0] === 'tab-field-pick', `selected: ${(await selected())[0]}`)
check('the Field\'s Pick panel became the visible one',
  (await visiblePanels())[0] === 'panel-field-pick', `visible: ${(await visiblePanels())[0]}`)

await page.keyboard.press('ArrowRight')
check('ArrowRight again reaches Scout\'s Pick',
  (await selected())[0] === 'tab-scout-pick', `selected: ${(await selected())[0]}`)

await page.keyboard.press('ArrowRight')
check('ArrowRight again reaches Pick\'em',
  (await selected())[0] === 'tab-pickem', `selected: ${(await selected())[0]}`)

await page.keyboard.press('ArrowRight')
check('selection wraps rather than dead-ending',
  (await selected())[0] === 'tab-scoreboard', `selected: ${(await selected())[0]}`)

await page.keyboard.press('End')
check('End jumps to the last tab',
  (await selected())[0] === 'tab-pickem', `selected: ${(await selected())[0]}`)

// --- the two picks are told apart --------------------------------------------

await page.click('#tab-field-pick')
const fieldText = await page.textContent('#panel-field-pick')
await page.click('#tab-scout-pick')
const scoutText = await page.textContent('#panel-scout-pick')

check('the Field\'s Pick panel says what it is for',
  /marquee/i.test(fieldText) && /national broadcast/i.test(fieldText),
  'the caption that distinguishes it from Scout\'s Pick is missing')

check('the Scout\'s Pick panel says the OPPOSITE about national broadcasts',
  /disqualif/i.test(scoutText),
  'without this the page shows two contradictory recommendations as one opinion')

check('each panel names the other, so neither is read alone',
  /Scout's Pick/.test(fieldText) && /Field's Pick/.test(scoutText),
  'the contrast is only legible if each says what it is not')

// --- ADR-002: the composite never renders ------------------------------------

// The fixture's scores are 3.5 and 3. Checked as page text rather than as a
// property of the code, so a future renderer that reaches the number by some
// other route is caught here even if the type seal is still intact.
const wholePage = await page.textContent('body')
check('no pick score appears anywhere on the page',
  !/\b3\.5\b/.test(wholePage),
  `the composite leaked into the DOM: ${(wholePage.match(/.{0,40}3\.5.{0,40}/) || [])[0]}`)

// Written first with `|| /No pick section/` as an allowance for the empty
// state, which made it satisfiable by a panel that rendered nothing. That is
// the same shape as the outbox row that passed on any dated file. The fixture
// is committed, so the populated case is the one that must hold.
check('the reasons DO appear — the evidence is displayable, the sum is not',
  /prime time/i.test(fieldText) && /tight line/i.test(fieldText),
  `panel text was: ${fieldText.replace(/\s+/g, ' ').slice(0, 200)}`)

check('the three-way tie is stated on the page, not just in the decoder',
  /level with 2 others/i.test(fieldText),
  'production picks among three equal scores by sort order; the page must say so')

check('the chasers render too, so "ranked" means something',
  /Diamondbacks/.test(fieldText) && /Royals/.test(fieldText),
  'only the leader rendered — the ranked list is the unbuilt half being built')

// --- Scout's gates report what they need -------------------------------------

check('Scout\'s gates distinguish "cannot tell" from "no"',
  /cannot tell/i.test(scoutText),
  'every gate reported a boolean, which is the production failure being tested')

check('an unanswerable gate names the data it needs',
  /needs .*(milestone|deviation|scenario|streams)/i.test(scoutText),
  'a gate said "cannot tell" without saying what would change the answer')

check('no page errors during any of this', failures.length === 0, failures.join(' | '))

await browser.close()
process.exit(summarize() === 0 ? 0 : 1)
