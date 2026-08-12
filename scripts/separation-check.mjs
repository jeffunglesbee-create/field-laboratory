// Are the games on a panel actually separated from each other?
//
// WHY THIS EXISTS
//
// The Stats and Weather panels shipped with NO stylesheet rules at all. The
// scoreboard had `.desk-card` — border, radius, padding, background — and the
// two new panels had nothing, so every game ran together as one column of text.
// Nothing caught it: `tab-check` asserted the cards EXIST and counted them,
// `nav-check` asserted no card is rendered twice, and both are true of an
// undifferentiated wall of text.
//
// "I added CSS" is not evidence. A stylesheet can be present, loaded, and do
// nothing — a typo'd selector, a class renamed in F# and not in the CSS, a rule
// overridden later in the cascade. So this measures the rendered result:
// `getBoundingClientRect` and `getComputedStyle` on the real elements.
//
// TWO CLAIMS, because separation is two different things:
//
//   VISUAL     adjacent cards have a real gap between their boxes AND a visible
//              boundary of their own. A border with the boxes flush separates
//              nothing; a gap with no border is weaker but real. Both are
//              required, and the gap is checked between CONSECUTIVE cards
//              rather than on one card, because that is the property.
//
//   ANNOUNCED  each card is a named region. A screen reader reads seven games
//              as one run of text unless each one is labelled, and a border is
//              invisible to it. This half cannot be satisfied by any amount of
//              CSS, which is why it is a separate check rather than an
//              afterthought in the same one.
//
// Usage:  URL='http://localhost:8080/?data=games-2026-08-09' node scripts/separation-check.mjs

import { existsSync } from 'node:fs'
import { chromium } from 'playwright'
import { createChecks } from './checks.mjs'

// The session's pre-installed browser, as every other probe here does it.
// Playwright's default is the headless shell, which is not what is on this box.
const sessionChromium = '/opt/pw-browsers/chromium'

const URL = process.env.URL || 'http://localhost:8080/?data=games-2026-08-09'

const browser = await chromium.launch(
  existsSync(sessionChromium) ? { executablePath: sessionChromium } : {})
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))

await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForFunction(() => {
  const el = document.getElementById('decode-status')
  return el && /^decoded \d+ game/.test(el.textContent || '')
}, null, { timeout: 15_000 })

// The Stats panel has to be visible for layout to be measurable. A hidden
// tabpanel reports zero-sized boxes, and every gap assertion below would then
// pass or fail for the wrong reason.
await page.click('#tab-stats')
await page.waitForSelector('.st-card', { timeout: 5000 })

const measure = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.st-card')]
  const box = el => {
    const r = el.getBoundingClientRect()
    const s = getComputedStyle(el)
    return {
      top: r.top, bottom: r.bottom, height: r.height,
      borderWidth: parseFloat(s.borderTopWidth) || 0,
      borderColor: s.borderTopColor,
      background: s.backgroundColor,
      label: el.getAttribute('aria-label'),
      tag: el.tagName.toLowerCase(),
    }
  }
  const boxes = cards.map(box)
  // The page's own background, to tell "has a background" from "is the same
  // colour as everything else".
  const pageBg = getComputedStyle(document.body).backgroundColor
  const gaps = []
  for (let i = 1; i < boxes.length; i++) gaps.push(boxes[i].top - boxes[i - 1].bottom)
  return { boxes, gaps, pageBg, count: cards.length }
})

const { check, summarize } = createChecks()
const { boxes, gaps, pageBg, count } = measure

console.log(`\n  ${count} cards, gaps: ${gaps.map(g => g.toFixed(1)).join(', ') || '—'}`)
console.log(`  page background ${pageBg}; card background ${boxes[0]?.background}\n`)

check('the panel rendered more than one game', count > 1,
  `${count} card(s) — a separation check needs at least two to compare`)

check('every card has a non-zero height', boxes.every(b => b.height > 0),
  'a zero-height box means the panel is hidden and nothing below is measurable')

// The property is BETWEEN cards. A border on one card says nothing about
// whether it is distinguishable from its neighbour.
check('consecutive cards have a real gap between them', gaps.length > 0 && gaps.every(g => g >= 4),
  `gaps: ${JSON.stringify(gaps.map(g => Math.round(g * 10) / 10))}`)

check('every card has a visible border of its own', boxes.every(b => b.borderWidth > 0),
  JSON.stringify(boxes.map(b => b.borderWidth)))

check('...and the border is not transparent', boxes.every(b => !/rgba\(.*,\s*0\)$/.test(b.borderColor)),
  JSON.stringify(boxes.map(b => b.borderColor)))

// A background identical to the page separates nothing, which is exactly what
// an unstyled card looks like.
check('the card background differs from the page background',
  boxes.every(b => b.background !== pageBg),
  `card ${boxes[0]?.background} vs page ${pageBg}`)

// The half no stylesheet can satisfy.
check('every card is a landmark region, not a bare div',
  boxes.every(b => b.tag === 'section'), JSON.stringify(boxes.map(b => b.tag)))

check('every card carries its own accessible name',
  boxes.every(b => b.label && b.label.trim() !== ''), JSON.stringify(boxes.map(b => b.label)))

// ...and the names are DISTINCT, or seven identically-named regions are no more
// navigable than seven unnamed ones.
const labels = boxes.map(b => b.label)
check('the names are distinct, so the regions are tellable apart',
  new Set(labels).size === labels.length, JSON.stringify(labels))

check('no page errors during any of this', errors.length === 0, errors.join('; '))

await browser.close()
process.exit(summarize() === 0 ? 0 : 1)
