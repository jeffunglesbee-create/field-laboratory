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

check('seven top-level tabs exist', (await topTabs()).length === 7,
  `${(await topTabs()).length} tabs — Scoreboard, Field's Pick, Scout's Pick, Pick'em, Weather, Stats, Briefs`)

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
check('ArrowRight again reaches Weather',
  (await selected())[0] === 'tab-weather', `selected: ${(await selected())[0]}`)

await page.keyboard.press('ArrowRight')
check('ArrowRight again reaches Stats',
  (await selected())[0] === 'tab-stats', `selected: ${(await selected())[0]}`)

await page.keyboard.press('ArrowRight')
check('ArrowRight again reaches Briefs',
  (await selected())[0] === 'tab-briefs', `selected: ${(await selected())[0]}`)

await page.keyboard.press('ArrowRight')
check('selection wraps rather than dead-ending',
  (await selected())[0] === 'tab-scoreboard', `selected: ${(await selected())[0]}`)

await page.keyboard.press('End')
check('End jumps to the last tab',
  (await selected())[0] === 'tab-briefs', `selected: ${(await selected())[0]}`)

// The Stats panel, and the bug it exists to not have. Production shows
// "Tied — anyone's game" on every PRE-GAME card, beneath the win-loss records.
// This capture is all Final, so no card may carry a comeback line at all.
await page.click('#tab-stats')
const comebacks = await page.$$eval('[data-comeback]', ns => ns.length)
const stCards = await page.$$eval('.st-card', ns => ns.length)
check('the Stats panel renders a report per game', stCards > 0, `${stCards} cards`)
check('no comeback line on a slate with no game in progress', comebacks === 0,
  `${comebacks} card(s) carry one — production shows it on every pre-game card`)
// NOTHING is unresolved. A row exists only when its data does, so an
// `unresolved` marker anywhere means a row was claimed and not filled.
const gaps = await page.$$eval('[data-gap]', ns => ns.length)
check('no row on any card is unresolved', gaps === 0,
  `${gaps} unresolved row(s) — a row should not exist unless its data does`)
const stRows = await page.$$eval('.st-row', ns => ns.length)
check('every card carries at least one real row', stRows >= stCards,
  `${stRows} rows across ${stCards} cards`)

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

// Per gate, not "somewhere on the panel".
//
// The first version asserted /cannot tell/ against the whole panel text, and
// mutation-check killed it: breaking Gate C to say "no stat anomaly" instead of
// "cannot tell" SURVIVED, because Gates B and D still said it. The assertion
// tested that SOME gate reported honestly, which is true of a panel where two
// out of three lie.
//
// Each unanswerable gate is now named with the data it needs, so a gate that
// starts claiming a real answer is caught individually.
const gateSays = (gate, pattern) => {
  const line = scoutText.split(/(?=Gate [0A-D])/).find(l => l.startsWith(gate))
  return line !== undefined && pattern.test(line)
}

for (const [gate, needs] of [
  ['Gate B', /milestone/i],
  ['Gate C', /deviation/i],
  ['Gate D', /scenario|WC/i],
]) {
  check(`${gate} says "cannot tell" and names what it needs`,
    gateSays(gate, /cannot tell/i) && gateSays(gate, needs),
    `${gate} line: ${(scoutText.split(/(?=Gate [0A-D])/).find(l => l.startsWith(gate)) ?? '(missing)').slice(0, 120)}`)
}

// And the other direction, so "everything is unanswerable" is not a way to pass:
// the two gates this payload CAN answer must give a real answer.
for (const gate of ['Gate 0', 'Gate A']) {
  check(`${gate} gives a real answer, since this payload can answer it`,
    gateSays(gate, /qualifies —|no —/) && !gateSays(gate, /cannot tell/i),
    `${gate} line: ${(scoutText.split(/(?=Gate [0A-D])/).find(l => l.startsWith(gate)) ?? '(missing)').slice(0, 120)}`)
}

// ── The tab is in the URL, and the URL is the tab ───────────────────────────
//
// Added 2026-09-01. The grammar itself is proven in the F# suite (Route, ten
// cases, each with a compulsory counterexample). What the suite CANNOT see is
// the wiring: whether `select` writes the URL, whether the boot reads it back,
// and whether a Back press moves both the slate and the tab strip. That is
// three separate places the two can drift apart, and all three are here.

const visibleTab = () =>
  page.$eval('[role="tab"][aria-selected="true"]', el => el.id)
const query = () => page.evaluate(() => window.location.search)

// 1. Selecting writes the URL.
await page.click('#tab-briefs')
check('selecting a surface puts it in the URL',
  (await query()).includes('tab=briefs'),
  `query: ${await query()}`)

// 2. REPLACE, NOT PUSH. Arrows move selection on every press, so pushing would
//    put seven entries in history for one sweep and leave Back unable to reach
//    the previous date — the only navigation on this page a reader means.
const before = await page.evaluate(() => history.length)
await page.click('#tab-stats')
await page.click('#tab-weather')
check('three surface changes add no history entries',
  (await page.evaluate(() => history.length)) === before,
  `history grew by ${(await page.evaluate(() => history.length)) - before}`)

// 3. The default surface leaves no trace, so an existing link keeps its exact
//    query and one destination does not acquire two spellings.
await page.click('#tab-scoreboard')
check('returning to the default surface clears the parameter',
  !(await query()).includes('tab='),
  `query: ${await query()}`)

// 4. THE ROUND TRIP. A link someone was sent must open on that surface — this
//    is the whole point of the feature, and it is a fresh load, not a click.
const deep = `${URL_BASE}${URL_BASE.includes('?') ? '&' : '?'}tab=stats`
await page.goto(deep, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[role="tab"][aria-selected="true"]')
check('a shared link opens on the surface it names',
  (await visibleTab()) === 'tab-stats',
  `opened on: ${await visibleTab()}`)
check('...and that panel is the visible one',
  (await page.$eval('#panel-stats', el => el.hasAttribute('hidden'))) === false)

// 5. Restoring from the URL must NOT steal focus. A page that grabs at the
//    reader on load is fighting them; the tab is selected, not focused.
check('opening a deep link does not steal focus to the tab strip',
  (await page.evaluate(() => document.activeElement?.id ?? '')) !== 'tab-stats',
  `focus landed on: ${await page.evaluate(() => document.activeElement?.id ?? '(body)')}`)

// 6. Back must move BOTH the slate and the tab strip. `start ()` re-renders the
//    slate and does not touch the tab strip, so without an explicit re-apply
//    on popstate the URL and the visible surface drift apart.
//
//    THE FIRST VERSION OF THIS HAD NO TEETH, and the mutation run said so:
//    removing the popstate re-apply left it at 37/37. It used page.goBack()
//    between two page.goto() urls, which is a FULL RELOAD — the boot's own
//    re-apply handled it and the popstate path was never entered. A test of
//    the wrong path, passing for the wrong reason.
//
//    A same-document entry is what popstate needs, so one is made directly.
//    Date navigation would be the natural way in and is disabled here: this
//    harness pins ?data= to a committed capture, which is exactly what
//    disables the date nav.
//    THE SECOND VERSION HAD NO TEETH EITHER, for a different reason: it went
//    back to an entry naming the surface already on screen, so the correct
//    answer and the stale answer were the same string. Two states collapsed
//    into one, and the collapsed one never fails.
//
//    The strip must DISAGREE with the entry being returned to. Clicks replace
//    rather than push, so the second entry is made explicitly, and the strip is
//    then moved onto it before going back.
await page.goto(URL_BASE, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[role="tab"][aria-selected="true"]')
await page.click('#tab-briefs')                       // entry A -> tab=briefs, strip briefs
await page.evaluate(() => history.pushState(null, '', location.href))  // entry B
await page.click('#tab-stats')                        // entry B -> tab=stats, strip stats
await page.evaluate(() => new Promise(r => {
  window.addEventListener('popstate', () => setTimeout(r, 80), { once: true })
  history.back()                                      // back to A: tab=briefs, strip still stats
}))
check('a same-document Back moves the tab strip, not just the URL',
  (await visibleTab()) === `tab-${new URLSearchParams(await query()).get('tab') ?? 'scoreboard'}`,
  `url says ${new URLSearchParams(await query()).get('tab') ?? 'scoreboard'}, page shows ${await visibleTab()}`)

check('no page errors during any of this', failures.length === 0, failures.join(' | '))

await browser.close()
process.exit(summarize() === 0 ? 0 : 1)
