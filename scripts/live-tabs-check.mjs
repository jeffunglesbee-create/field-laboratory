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
import { createChecks } from './checks.mjs'

const URL_BASE = process.env.URL || 'https://field-laboratory.jeffunglesbee.workers.dev/'
const { check, summarize } = createChecks()

const sessionChromium = '/opt/pw-browsers/chromium'
const browser = await chromium.launch(
  existsSync(sessionChromium) ? { executablePath: sessionChromium } : {})
const page = await browser.newPage()

const pageErrors = []
page.on('pageerror', e => pageErrors.push(String(e)))

console.log(`\n${URL_BASE}\n`)
await page.goto(URL_BASE, { waitUntil: 'networkidle' })

// Scoped to the TOP-LEVEL tablist. Pick'em's sport chips are a tablist too, so
// a bare [role="tab"] query matches both lists and reports six tabs. Nesting a
// tablist inside a tabpanel is legitimate; querying across them is not.
const tabIds = await page.$$eval('.tabs [role="tab"]', ts => ts.map(t => t.id))
check('the deployed page has all four tabs', tabIds.length === 4,
  `found: ${JSON.stringify(tabIds)} — the tab build may not have deployed`)

check('all three pick tabs are among them',
  ['tab-field-pick', 'tab-scout-pick', 'tab-pickem'].every(id => tabIds.includes(id)),
  `found: ${JSON.stringify(tabIds)}`)

const visible = async () =>
  page.$$eval('[role="tabpanel"]', ps => ps.filter(p => !p.hasAttribute('hidden')).map(p => p.id))

check('exactly one panel is visible on load', (await visible()).length === 1,
  `visible: ${JSON.stringify(await visible())}`)

await page.click('#tab-field-pick')
const fieldText = (await page.textContent('#panel-field-pick')) ?? ''
check('the Field\'s Pick panel becomes visible and renders',
  (await visible())[0] === 'panel-field-pick' && fieldText.trim().length > 0,
  `visible: ${(await visible())[0]}, length ${fieldText.trim().length}`)

await page.click('#tab-scout-pick')
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
const pickPanels = `${fieldText} ${scoutText}`
const strayScore = pickPanels.match(/(?<![\d(.])\b\d\.\d\b(?![\d)])/)
check('no bare composite score renders in either pick panel',
  strayScore === null,
  `possible score in the DOM: "${strayScore?.[0]}" near: ${
    pickPanels.slice(Math.max(0, (strayScore?.index ?? 0) - 60), (strayScore?.index ?? 0) + 60)}`)

// Whatever the panel says, it must be one of the modelled states rather than
// a blank. A silently empty panel is this project's recorded failure shape.
check('the Field\'s Pick panel is in a stated state, not blank',
  /No pick section|Passed on tonight|Also ranked|level with/i.test(fieldText)
  || /pick-reason/.test(await page.innerHTML('#panel-field-pick')),
  `panel said: ${fieldText.replace(/\s+/g, ' ').slice(0, 200)}`)

check('the Scout\'s Pick panel reports gates',
  /Gate /.test(scoutText),
  `panel said: ${scoutText.replace(/\s+/g, ' ').slice(0, 200)}`)

// Pick'em on the deployed artifact. Structural only — whether tonight's slate
// has games at all is not this check's business.
await page.click('#tab-pickem')
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
process.exit(summarize() === 0 ? 0 : 1)
