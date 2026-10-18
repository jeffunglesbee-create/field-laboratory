// Do both pick tabs work on the DEPLOYED page?
//
// tab-check.mjs pins `?data=` to a committed capture so its assertions can be
// exact — it checks for "Diamondbacks" by name. None of that is true of the
// live page, which renders whatever tonight's relay returns.
//
// So this asserts only what must hold on ANY day: the tablist behaves, both
// panels render their own identity, the two captions still contradict each
// other, and no composite score reaches the DOM. Deliberately no build import,
// because this job tests the deployed artifact and never builds one.
//
// Usage:  node scripts/live-tabs-check.mjs
//         URL=https://... node scripts/live-tabs-check.mjs

import { chromium } from 'playwright'
import { existsSync } from 'node:fs'
import { createChecks, finish } from './checks.mjs'

const URL_BASE = process.env.URL || 'https://field-laboratory.jeffunglesbee.workers.dev/'
const { check, summarize } = createChecks()

const sessionChromium = '/opt/pw-browsers/chromium'
const browser = await chromium.launch(
  existsSync(sessionChromium) ? { executablePath: sessionChromium } : {})
const page = await browser.newPage()

const pageErrors = []
page.on('pageerror', e => pageErrors.push(String(e)))

console.log(`\n${URL_BASE}\n`)
// `domcontentloaded`, not `networkidle`. schedule-live-check.mjs made this same
// change and left the general question open in its own words: "whether the live
// page is ever reliably network-idle now that it fetches per card is a real
// question, and it is recorded in the outbox rather than settled by this
// change." live-check run 32614377552 settles it — page.goto timed out at 30s
// on `networkidle` against the deployed URL, in a run where deploy-landed had
// just passed 9/9, so the site was up and answering. A page whose every card
// fires its own weather fetch does not reach "500ms with no connections", and
// waiting for it is waiting for a condition this check does not need.
//
// This script had no bounded wait of its own — it went straight to $$eval —
// so the goto was doing double duty as both navigation and readiness. The
// tablist is the actual precondition for every assertion below, so wait for
// that instead. It fails with a named selector rather than a generic timeout.
await page.goto(URL_BASE, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.tabs [role="tab"]', { timeout: 15_000 })

// The tabs live in the SERVED HTML, so waiting for them says nothing about
// whether the SPA has run. Its panels are rendered by init AFTER the slate
// fetch, and Field's Pick after a SECOND, async newspaper fetch. de63a93 moved
// this file's goto from networkidle to domcontentloaded to escape a timeout
// (every card fires its own weather fetch, so the page never idles) but left the
// only wait pointed at a static element — so every dynamically-rendered panel
// was read blank, and this check went red across a full day of commits.
//
// The fix is the sibling render-check's own precondition: wait for the concrete
// thing each assertion needs. First #decode-status settling, which means init
// ran and the tab handlers are wired; then, per panel, its own non-empty
// content. A panel renders even "No pick section" as text, so non-empty IS the
// honest readiness signal — this waits for what the check needs, not for a page
// that never idles.
await page.waitForFunction(
  () => {
    const el = document.getElementById('decode-status')
    return el && el.textContent && el.textContent !== 'decoding…'
  },
  { timeout: 15_000 },
).catch(() => {}) // fall through: the panel assertions below report a blank with its text

// Wait for a panel to carry rendered content. Bounded; on timeout it returns and
// the assertion that follows reports the blank panel verbatim rather than the
// generic waitForFunction throw.
const waitPanel = async (panelId) => {
  await page.waitForFunction(
    id => ((document.getElementById(id)?.textContent) ?? '').trim().length > 0,
    panelId,
    { timeout: 15_000 },
  ).catch(() => {})
}

// Scoped to the TOP-LEVEL tablist. Pick'em's sport chips are a tablist too, so
// a bare [role="tab"] query matches both lists and would sweep in those. Nesting
// a tablist inside a tabpanel is legitimate; querying across them is not.
//
// The set is asserted by name, not by a magic count: the count alone said "six"
// long after the Briefs tab made it seven, and stayed red without saying WHICH
// tab was unaccounted for. Naming every expected tab means an added or dropped
// tab fails by identity, not by an off-by-one a reader has to decode.
const EXPECTED_TABS = [
  'tab-scoreboard', 'tab-field-pick', 'tab-scout-pick',
  'tab-pickem', 'tab-weather', 'tab-stats', 'tab-lineups', 'tab-briefs', 'tab-draw', 'tab-metrics', 'tab-verify',
]
const tabIds = await page.$$eval('.tabs [role="tab"]', ts => ts.map(t => t.id))
check('the deployed page has every tab this build ships', tabIds.length === EXPECTED_TABS.length,
  `found: ${JSON.stringify(tabIds)} — the tab build may not have deployed`)

check('every expected tab is present by name',
  EXPECTED_TABS.every(id => tabIds.includes(id)),
  `missing: ${JSON.stringify(EXPECTED_TABS.filter(id => !tabIds.includes(id)))}; found: ${JSON.stringify(tabIds)}`)

const visible = async () =>
  page.$$eval('[role="tabpanel"]', ps => ps.filter(p => !p.hasAttribute('hidden')).map(p => p.id))

check('exactly one panel is visible on load', (await visible()).length === 1,
  `visible: ${JSON.stringify(await visible())}`)

await page.click('#tab-field-pick')
await waitPanel('panel-field-pick')
const fieldText = (await page.textContent('#panel-field-pick')) ?? ''
check('the Field\'s Pick panel becomes visible and renders',
  (await visible())[0] === 'panel-field-pick' && fieldText.trim().length > 0,
  `visible: ${(await visible())[0]}, length ${fieldText.trim().length}`)

await page.click('#tab-scout-pick')
await waitPanel('panel-scout-pick')
const scoutText = (await page.textContent('#panel-scout-pick')) ?? ''
check('the Scout\'s Pick panel becomes visible and renders',
  (await visible())[0] === 'panel-scout-pick' && scoutText.trim().length > 0,
  `visible: ${(await visible())[0]}, length ${scoutText.trim().length}`)

// The contrast is the point of having two tabs at all, and it is the thing a
// well-meaning copy edit would flatten.
check('the two panels still contradict each other on national broadcasts',
  /counts in its favour/i.test(fieldText) && /disqualif/i.test(scoutText),
  'one of the captions lost the distinction between the two picks')

check('each panel still names the other',
  /Scout's Pick/.test(fieldText) && /Field's Pick/.test(scoutText),
  'a reader landing on one tab cannot tell it is not the other')

// ADR-002 on the live artifact. Any bare decimal in the pick panels is
// suspicious: the reasons carry numbers like "tight line (1.5)" inside
// parentheses, but a naked score would render on its own.
//
// SCOPE, and why it is narrowed the way it is.
//
// One paragraph in the panel renders VERBATIM THIRD-PARTY DATA: the list of
// broadcast outlets not in the registry. Outlet names legitimately contain
// numbers — on 2026-08-15 the slate carried "KFMB 8.1 (CBS)", a real ATSC
// channel number, and this scan matched it and turned main red on a false
// positive.
//
// The fix excludes that ELEMENT, by its `pick-outlets` class, rather than
// loosening the pattern. Loosening would let a genuine 8.1 through everywhere
// else, which is precisely the leak this check exists to catch. Narrowing by
// provenance keeps the pattern strict over every byte laboratory computed.
const SCORE_RE = /(?<![\d(.])\b\d\.\d\b(?![\d)])/

const outletText = (await page.$$eval('.pick-outlets', ns => ns.map(n => n.textContent ?? ''))).join(' ')

// Subtract by exact string, not by regex: an outlet name is arbitrary text and
// must not be compiled into a pattern.
const scanned = [fieldText, scoutText]
  .map(t => (outletText ? t.split(outletText).join(' ') : t))
  .join(' ')

const strayScore = scanned.match(SCORE_RE)
check('no bare composite score renders in either pick panel',
  strayScore === null,
  `possible score in the DOM: "${strayScore?.[0]}" near: ${
    scanned.slice(Math.max(0, (strayScore?.index ?? 0) - 60), (strayScore?.index ?? 0) + 60)}`)

// The exclusion must not have neutered the scan. Run the same pattern over a
// control that carries BOTH an outlet-style channel number and a leaked score:
// the outlet must be excluded and the score must still be caught. Without this,
// "exclude everything" would satisfy the check above on every slate.
const controlOutlet = 'Broadcast outlets not in the registry: KFMB 8.1 (CBS)'
const controlLeak = `composite 8.7 tonight ${controlOutlet}`
const controlScanned = controlLeak.split(controlOutlet).join(' ')
check('the scan still catches a leaked score after the outlet exclusion',
  SCORE_RE.test(controlLeak) &&
  controlOutlet.match(SCORE_RE)?.[0] === '8.1' &&
  controlScanned.match(SCORE_RE)?.[0] === '8.7',
  `control: outlet alone matches ${JSON.stringify(controlOutlet.match(SCORE_RE)?.[0])}, ` +
  `after exclusion ${JSON.stringify(controlScanned.match(SCORE_RE)?.[0])} (want "8.1" then "8.7")`)

// And the exclusion must be REAL on this page — if the outlet paragraph stopped
// rendering, the check above would pass for the wrong reason. Reported rather
// than asserted, because a slate where every outlet is in the registry is a
// legitimate state with no paragraph to exclude.
check('the outlet exclusion is reported, not silent',
  true,
  outletText
    ? `excluded ${outletText.length} char(s) of verbatim outlet text`
    : 'no unmodelled outlets on this slate — nothing excluded')

// Whatever the panel says, it must be one of the modelled states rather than
// a blank. A silently empty panel is this project's recorded failure shape.
check('the Field\'s Pick panel is in a stated state, not blank',
  /No pick section|Passed on tonight|Also ranked|level with/i.test(fieldText)
  || /pick-reason/.test(await page.innerHTML('#panel-field-pick')),
  `panel said: ${fieldText.replace(/\s+/g, ' ').slice(0, 200)}`)

// TWO MODELLED STATES, because src/PickView.fs has exactly two branches.
//
// The gate rows come from `match games with | [] -> () | first :: _ ->`, so on
// an EMPTY SLATE no gate is rendered at all — not by accident, by construction.
// The panel instead prints its `pick-empty` paragraph, transcribed here from
// src/PickView.fs:136 rather than from the truncated run log:
//
//     "No game qualifies from this payload — and for most gates that is because
//      the data is not here, not because the answer is no."
//
// Asserting only `/Gate /` made this unsatisfiable between midnight ET and the
// first fixture, and it went red at 04:36 UTC on 2026-08-31 for a panel that
// was behaving exactly as written.
//
// This is not a relaxation to reach green. Both sibling assertions in this same
// file already model their empty state — Field's Pick accepts `No pick section`
// and the Pick'em legend accepts `No games on this slate`. This one was the
// odd assertion out, and a blank panel still fails, which is the failure shape
// the project actually records.
check('the Scout\'s Pick panel is in a stated state — gates, or why there are none',
  /Gate /.test(scoutText) || /No game qualifies from this payload/.test(scoutText),
  `panel said: ${scoutText.replace(/\s+/g, ' ').slice(0, 200)}`)

// Pick'em on the deployed artifact. Structural only — whether tonight's slate
// has games at all is not this check's business.
await page.click('#tab-pickem')
await waitPanel('panel-pickem')
const pickemText = (await page.textContent('#panel-pickem')) ?? ''
check('the Pick\'em panel renders and says whose opinion it is',
  /your own pick/i.test(pickemText) && /not an editorial recommendation/i.test(pickemText),
  `panel said: ${pickemText.replace(/\s+/g, ' ').slice(0, 200)}`)

check('the Pick\'em legend explains its two numbers',
  /Chips count games/.test(pickemText) || /No games on this slate/.test(pickemText),
  'the production screen shows two counts with nothing saying what each counts')

check('no page errors on the deployed artifact', pageErrors.length === 0,
  pageErrors.join(' | '))

console.log(`\n  Field's Pick says: ${fieldText.replace(/\s+/g, ' ').slice(0, 180)}`)
console.log(`  Scout's Pick says: ${scoutText.replace(/\s+/g, ' ').slice(0, 180)}\n`)

await browser.close()
finish(summarize())
