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
import { createChecks, finish } from './checks.mjs'

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

// Named, not counted. `live-tabs-check.mjs` records why: a bare count said
// "six" long after the Briefs tab made it seven, and stayed red without saying
// WHICH tab was unaccounted for.
const EXPECTED_TABS = [
  'tab-scoreboard', 'tab-field-pick', 'tab-scout-pick',
  'tab-pickem', 'tab-weather', 'tab-stats', 'tab-lineups', 'tab-briefs', 'tab-draw', 'tab-verify',
]
const tabIds = await page.$$eval(TABS, ts => ts.map(t => t.id))

check('every expected top-level tab exists, by name',
  EXPECTED_TABS.every(id => tabIds.includes(id)) && tabIds.length === EXPECTED_TABS.length,
  `missing: ${JSON.stringify(EXPECTED_TABS.filter(id => !tabIds.includes(id)))}; ` +
  `unexpected: ${JSON.stringify(tabIds.filter(id => !EXPECTED_TABS.includes(id)))}`)

check('exactly one tab starts selected', (await selected()).length === 1,
  `selected: ${JSON.stringify(await selected())}`)

check('exactly one panel starts visible', (await visiblePanels()).length === 1,
  `visible: ${JSON.stringify(await visiblePanels())}`)

check('only one top-level tab is in the tab order',
  (await page.$$eval(TABS, ts => ts.filter(t => t.getAttribute('tabindex') === '0').length)) === 1,
  'a roving tabindex is what makes a tablist one stop instead of four')

// Keyboard, which is the half most likely to be skipped.
//
// WALKED FROM `EXPECTED_TABS`, not written out one press at a time. The
// hand-written version asserted the order Scoreboard → … → Briefs and dead-ended
// there, so adding the Draw tab turned two of its rows red — "selection wraps
// rather than dead-ending" and "End jumps to the last tab" — over a tab strip
// that was behaving perfectly. A check that has to be edited every time the
// thing it checks grows is a check that will eventually be edited to agree.
await page.focus(`#${EXPECTED_TABS[0]}`)
for (let i = 1; i < EXPECTED_TABS.length; i++) {
  await page.keyboard.press('ArrowRight')
  check(`ArrowRight reaches ${EXPECTED_TABS[i]}`,
    (await selected())[0] === EXPECTED_TABS[i], `selected: ${(await selected())[0]}`)
  if (i === 1) {
    check('the panel of the newly-selected tab became the visible one',
      (await visiblePanels())[0] === EXPECTED_TABS[i].replace('tab-', 'panel-'),
      `visible: ${(await visiblePanels())[0]}`)
  }
}

await page.keyboard.press('ArrowRight')
check('selection wraps rather than dead-ending',
  (await selected())[0] === EXPECTED_TABS[0], `selected: ${(await selected())[0]}`)

await page.keyboard.press('End')
check('End jumps to the last tab',
  (await selected())[0] === EXPECTED_TABS[EXPECTED_TABS.length - 1],
  `selected: ${(await selected())[0]}`)

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
// SCOPED TO THE PICK PANELS, not the whole body.
//
// This scanned `document.body` for a bare `3.5` — the fixture's pick score —
// and that is unrunnable on a real slate. Measured 2026-09-05 against a
// 126-card capture: two legitimate matches, `home -3.5 pts implied` (a point
// spread) and `line moved 3.5% in implied terms`. Neither is a composite;
// both are ordinary market data that any slate will carry.
//
// A page-wide scan for a number cannot tell a composite from arithmetic that
// happens to share its digits. The composite can only render where a pick
// renders, so that is where to look. The type seal in Pick.fs is the actual
// guarantee — `docs/PICK-PROOF.md` compiles it — and this is the second line
// of defence against a future renderer reaching the number another way.
//
// The failure message also used a LOOSER regex than the assertion —
// `/.{0,40}3\.5.{0,40}/` with no word boundaries against `\b3\.5\b` — so it
// reported the first loose match, which was 40 characters of unrelated
// journalism prose. A message that points somewhere the assertion did not fire
// costs more than no message.
const pickPanels = `${fieldText}\n${scoutText}`
const leak = pickPanels.match(/.{0,60}\b3\.5\b.{0,60}/)
check('no pick score appears in either pick panel',
  leak === null,
  `the composite leaked into a pick panel: ${(leak || [])[0]}`)

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

// TWO CLAIMS, and only one of them is about the code.
//
// SLATE-AGNOSTIC. Every gate line is one of the three legitimate forms. True of
// any payload, so it runs everywhere and is the assertion that actually guards
// the renderer.
const GATE_FORM = /qualifies —|no —|cannot tell —/
for (const gate of ['Gate 0', 'Gate A', 'Gate B', 'Gate C', 'Gate D']) {
  check(`${gate} states one of the three answers, never a blank`,
    gateSays(gate, GATE_FORM),
    `${gate} line: ${(scoutText.split(/(?=Gate [0A-D])/).find(l => l.startsWith(gate)) ?? '(missing)').slice(0, 120)}`)
}

// FIXTURE-SPECIFIC. "Everything is unanswerable" must not be a way to pass, and
// the only way to assert that is against a payload known to answer — which is a
// fact about `games-2026-08-09`, not about the code.
//
// It ran unconditionally until 2026-09-05, when a 126-card capture failed it:
// the Scout selected a game with no outlets listed, so Gate 0 correctly said
// "cannot tell". The check was right about its fixture and wrong to assume
// every fixture. Gated rather than deleted, because the claim it makes is real
// and nothing else makes it.
const FIXTURE = new global.URL(URL_BASE, 'http://x').searchParams.get('data')
if (FIXTURE === 'games-2026-08-09') {
  for (const gate of ['Gate 0', 'Gate A']) {
    check(`${gate} gives a real answer, since THIS payload can answer it`,
      gateSays(gate, /qualifies —|no —/) && !gateSays(gate, /cannot tell/i),
      `${gate} line: ${(scoutText.split(/(?=Gate [0A-D])/).find(l => l.startsWith(gate)) ?? '(missing)').slice(0, 120)}`)
  }
} else {
  console.log(`\n  (the two answerable-gate assertions are specific to `
    + `games-2026-08-09; this run loaded ${FIXTURE ?? 'the live slate'})`)
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

// ── The title says where you are ────────────────────────────────────────────
//
// It never changed: every open tab read "FIELD Laboratory — desk scoreboard",
// so three days of this page side by side were indistinguishable in the tab
// strip — and comparing days across tabs is what this page is for.
await page.goto(URL_BASE, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[role="tab"][aria-selected="true"]')
const titleOnDefault = await page.title()
await page.click('#tab-briefs')
const titleOnBriefs = await page.title()
check('the title names the surface, and changes with it',
  titleOnBriefs !== titleOnDefault && /Briefs/.test(titleOnBriefs),
  `default: "${titleOnDefault}" -> briefs: "${titleOnBriefs}"`)
// This harness pins ?data=, so the title must say so rather than print today's
// date over a committed August fixture.
check('a pinned capture is not titled with today\'s date',
  /committed capture/.test(titleOnBriefs) && !/\d{4}-\d{2}-\d{2}/.test(titleOnBriefs),
  `title: "${titleOnBriefs}"`)

// ── Every control has the same focus ring, and none is text ─────────────────
//
// Counted rather than eyeballed: the date nav was the one control that fell
// through to the user-agent default while four other selectors carried the
// discovery outline.
for (const sel of ['#tab-scoreboard', '#prev-day', '#today']) {
  const styles = await page.$eval(sel, el => {
    const c = getComputedStyle(el)
    return { select: c.userSelect || c.webkitUserSelect, touch: c.touchAction }
  })
  check(`${sel} is a control, not text (user-select ${styles.select}, touch-action ${styles.touch})`,
    styles.select === 'none' && styles.touch === 'manipulation')
}

// ── Stepping a day returns you to the top ───────────────────────────────────
//
// Without it, pressing prev from deep in a long slate leaves the reader at the
// same pixel offset inside a DIFFERENT day's cards, which reads as the page not
// having responded at all.
//
// Two things make this test real rather than vacuous:
//   - it leaves the pinned URL, because `?data=` disables the date nav, so the
//     button under test does nothing in the harness used above;
//   - it shrinks the viewport first. At the default size this page is 680px of
//     content in a 720px window — NOT SCROLLABLE — so scrollTo(0,0) would be a
//     no-op and the assertion would pass without the code existing.
await page.setViewportSize({ width: 390, height: 400 })
await page.goto('http://localhost:8080/?date=2026-08-09', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#prev-day:not([disabled])')
await page.waitForFunction(() => document.body.scrollHeight > window.innerHeight + 100)
await page.evaluate(() => window.scrollTo(0, 250))
const scrolledTo = await page.evaluate(() => window.scrollY)
check('the page is actually scrolled before the test — otherwise it proves nothing',
  scrolledTo > 100, `scrollY was ${scrolledTo}`)
await page.click('#prev-day')
await page.waitForFunction(() => window.scrollY === 0, null, { timeout: 3000 })
  .catch(() => {})
// The date element is a date — asserted HERE, on the unpinned page, and not on
// the harness URL above. Pinned mode reports "pinned to a committed capture"
// and correctly sets no `datetime`, so the assertion up there accepted the
// absence and passed with the attribute never wired. Mutation said so:
// removing the setAttribute left it at 45/45. Only an unpinned page
// discriminates.
check('the viewed date carries a machine-readable value',
  await page.$eval('#viewed-date', el =>
    el.tagName.toLowerCase() === 'time' && /^\d{4}-\d{2}-\d{2}$/.test(el.getAttribute('datetime') ?? '')),
  await page.$eval('#viewed-date', el =>
    `<${el.tagName.toLowerCase()} datetime="${el.getAttribute('datetime')}">${el.textContent}`))

check('stepping a day returns to the top of the slate',
  (await page.evaluate(() => window.scrollY)) === 0,
  `scrollY after stepping: ${await page.evaluate(() => window.scrollY)}`)

check('no page errors during any of this', failures.length === 0, failures.join(' | '))

await browser.close()
finish(summarize())
