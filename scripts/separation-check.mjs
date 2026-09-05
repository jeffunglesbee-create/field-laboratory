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

// ── WHAT THESE TWO ASSERTIONS USED TO BE, AND WHY THEY WERE REPLACED ────────
//
//   check('every card has a visible border of its own', b.borderWidth > 0)
//   check('...and the border is not transparent',       !/rgba\(.*,\s*0\)$/)
//
// Both measured PRESENCE and claimed VISIBILITY, and the gap between the two was
// not small. Measured 2026-08-26: `--edge` rendered at 1.09:1 against `--card`.
// A border present, opaque, and thirty times below the threshold at which anyone
// could see it passed both — on a page where the only thing separating cards was
// the 1rem gap.
//
// The second was worse. With the border removed entirely it STILL PASSED:
// `borderTopColor` on a zero-width border is a normal colour string, so the
// rgba-zero regex never matched. An assertion about a border that holds when
// there is no border.
//
// The replacement states the real property as a DISJUNCTION, because separation
// genuinely has two mechanisms and either one suffices:
//
//   a real gap between consecutive cards   OR   a boundary at 3.0:1
//
// 3.0 is not invented here — it is the WCAG 1.4.11 figure for visual information
// required to identify a component, the same bar `palette-check` holds
// `controlEdge` to. The gap arm is what these cards actually rely on, and the
// contrast arm is what would let a future card drop the gap and keep a real
// outline instead.
const RGB = c => (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number)
const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
const ratio = (a, b) => { const [x, y] = [lum(RGB(a)), lum(RGB(b))].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05) }
const MIN_BOUNDARY = 3.0

const separation = boxes.map((b, i) => {
  const gap = i === 0 ? (gaps[0] ?? 0) : gaps[i - 1]
  // A zero-width border contributes nothing whatever colour it reports.
  const border = b.borderWidth > 0 ? ratio(b.borderColor, b.background) : 1
  return { gap, border, ok: gap >= 4 || border >= MIN_BOUNDARY }
})

console.log(`  boundary contrast: ${separation.map(s => s.border.toFixed(2)).join(', ')} (bar ${MIN_BOUNDARY})`)

check(`every card is separated by a real gap OR a boundary at ${MIN_BOUNDARY}:1`,
  separation.every(s => s.ok),
  separation.map((s, i) => `card ${i}: gap ${s.gap.toFixed(1)}px, boundary ${s.border.toFixed(2)}:1`).join('; '))

// And say which arm is carrying it, so a page that quietly loses its gap and
// falls back on an invisible border is visible in the log rather than silent.
const byGap = separation.filter(s => s.gap >= 4).length
const byBorder = separation.filter(s => s.border >= MIN_BOUNDARY).length
console.log(`  carried by: gap ${byGap}/${separation.length}, boundary ${byBorder}/${separation.length}`)

// ZERO BOUNDARIES IS THE DECIDED STATE, NOT A GAP IN ONE.
//
// Printed here because the bare count reads as a defect, and did: on 2026-09-05
// a session ran this at 126 cards, saw `boundary 0/126`, measured `--card`
// at 1.033:1 against `--bg`, and proposed brightening the cards — re-opening a
// question `src/Palette.fs` had already settled on 2026-08-26 with every one of
// the seventeen `edge` uses enumerated and resolved individually:
//
//   3 container outlines -> DELETED; a 1rem grid gap and a landmark region per
//                           card already carried the grouping
//
// The two candidates measured before that was caught: raising `--card` to clear
// 3:1 needs #4e3fe2, seven times brighter and a different product; a per-card
// border needs #5e5e5e, or `edgeStrong` at 5.664:1. Both are cheap and neither
// is warranted — WCAG 1.4.11 governs identifying COMPONENTS AND STATES, not
// list items, and a border is invisible to a screen reader while the landmark
// region asserted below is not.
//
// So the number is annotated where it is read. A count whose expected value is
// zero, printed without saying so, is a check that reports a decision as a
// finding.
if (byBorder === 0) {
  console.log('              boundary 0 is EXPECTED — the container outline was deleted'
    + ' 2026-08-26 (src/Palette.fs); gap + landmark region carry the grouping')
}

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
