// No element overflows the viewport horizontally, at any canonical viewport.
//
// WHERE THE INVARIANT COMES FROM
//
// "FIELD — Viewport Consistency Specification (all devices x all orientations)",
// Drive 1jvQw0uS3TR_pblNh7TCUxjsH22MN8IJt_o_yPvbuJ30, May 24 2026, status
// DEFINITIVE. It specifies eleven canonical viewport states and lists, under P1:
//
//     Assert: no element overflows viewport horizontally
//
// That document is jubilant-bassoon's. Its selectors (`.game-card`, the ambient
// panel, the OTW banner) do not exist here and its feature matrix describes a
// different product, so most of it does not transfer. This one assertion does,
// along with the widths it is measured at and its stated purpose: "FIELD must
// render a consistent, intentional product at every viewport."
//
// WHY IT EXISTS AS A CHECK
//
// On 2026-08-29 the laboratory failed it on every portrait phone -- 216px of
// overflow at 360, 185px at 393, 150px at 430 -- and had done for an unknown
// length of time. Seven tab buttons totalling 534px sat in a 324px container
// with `flex-wrap: nowrap` and `overflow-x: visible`, so the row did not scroll,
// it pushed the DOCUMENT to 576px.
//
// It was found by hand, by measuring. Nothing in CI looked, and every render
// check passed throughout: they assert on content, and content renders fine
// inside a page that is too wide. The failure is geometric, so the assertion
// has to be geometric.
//
// AND IT IS MEASURED TWICE PER VIEWPORT
//
// Before any interaction, and again with every flippable card opened. The
// second pass is not padding: a `grid-column: span 2` added that same day was
// clamped-by-the-spec in a code comment and, measured, manufactured a second
// grid track on a single-column phone. A layout that is sound at rest and
// overflows when a card opens is the shape this repo keeps producing.
//
// Usage:  URL=http://localhost:8080/ node scripts/viewport-overflow-check.mjs
//         node scripts/viewport-overflow-check.mjs --self-test

import { existsSync } from 'node:fs'
import { chromium } from 'playwright'
import { createChecks, isMain } from './checks.mjs'

const URL = process.env.URL || 'http://localhost:8080/?data=context-2026-08-29'

/**
 * The canonical states, transcribed from the specification's viewport matrix.
 *
 * Ten of its eleven: D2 and D4 are the WHOLE FIELD toggle of D1 and D3, which is
 * a jubilant-bassoon mode this repo has no equivalent of, so D1/D3 stand for
 * their widths. Device examples are the spec's own.
 */
const VIEWPORTS = [
  { id: 'P1', name: 'phone-compact',        w: 360,  h: 780,  cols: 1, eg: 'Galaxy A36' },
  { id: 'P2', name: 'phone-standard',       w: 393,  h: 852,  cols: 1, eg: 'iPhone 15/16' },
  { id: 'P3', name: 'phone-large',          w: 430,  h: 932,  cols: 1, eg: 'iPhone 16 Pro Max' },
  { id: 'L1', name: 'phone-landscape',      w: 667,  h: 375,  cols: 1,    eg: 'iPhone SE landscape' },
  { id: 'L2', name: 'phone-landscape-wide', w: 932,  h: 430,  cols: 2,    eg: 'S24 Ultra landscape' },
  { id: 'T1', name: 'iPad portrait',        w: 820,  h: 1180, cols: null, eg: 'iPad Air' },
  { id: 'T2', name: 'iPad landscape',       w: 1180, h: 820,  cols: null, eg: 'iPad Air landscape' },
  { id: 'D1', name: 'laptop',               w: 1200, h: 800,  cols: null, eg: 'MacBook Air 13"' },
  { id: 'D3', name: 'desktop',              w: 1440, h: 900,  cols: null, eg: 'MacBook Pro 16"' },
  { id: 'U1', name: 'ultra-wide',           w: 1920, h: 1080, cols: null, eg: '3440x1440 monitor' },
]

/**
 * A viewport's verdict from its measurements. Pure, so it can be asserted
 * without a browser.
 *
 * `cols` is checked only where the spec's feature matrix pins it, and only
 * where that pin is about CARD WIDTH rather than about a feature this repo does
 * not have. The matrix's `Game cards` row reads:
 *
 *     P1   P2   P3   L1   L2   T1   T2   D1..U1
 *     1col 1col 1col 1col 2col 1col 1col LEFT
 *
 * P1/P2/P3/L1/L2 TRANSFER. Each is a statement about how much width a card
 * needs: L1's section says "No special grid -- phone is too narrow for
 * 2-column at this width", and L2's calls its two columns "the key landscape
 * upgrade". Nothing in either depends on a selector this repo lacks.
 *
 * L1 AND L2 ADDED 2026-08-30, and L1 was FAILING. With the grid floor at 260px
 * a 667px landscape phone rendered TWO columns against a spec that says one.
 * Nothing caught it because this table left L1 null. Raising the floor to
 * min(400px, 100%) fixed it as a side effect, which is exactly the kind of
 * accidental correctness that goes back out again unnoticed -- so it is pinned
 * now rather than enjoyed.
 *
 * T1/T2 DO NOT TRANSFER, and their `1col` is the reason to be careful with this
 * matrix rather than to copy it. iPad is one column in FIELD because the right
 * half of the screen is the AMBIENT PANEL -- "left pane ~430px + Ambient panel
 * ~390px". This repo has no ambient panel, so a single column here would buy
 * nothing and cost half the slate.
 *
 * D1..U1 read `LEFT`, naming FIELD's three-column desktop product. Not a column
 * count, and not something this repo implements.
 */
/**
 * The share of the viewport left for content once the sticky chrome is paid for.
 *
 * THE AXIS THIS FILE DID NOT MEASURE. It proved nothing spills sideways while a
 * third of the screen was going vertically. Measured 2026-09-01 across all ten
 * states, the sticky stack — tab bar, date nav, sport heading, body padding —
 * is a flat 154-168px everywhere, which is 15-21% of a portrait phone and
 * **44.9% of L1** (667x375): 168px of chrome above 207px of content, about one
 * card. Nothing in CI looked, because both existing assertions are horizontal.
 *
 * `position` is read at measure time rather than assumed: a layer that is
 * sticky on a phone and static in landscape must not be counted in both.
 */
export const contentShare = (m) => (m.viewportHeight - m.chromeHeight) / m.viewportHeight

/**
 * The floor, set from measurement rather than from taste.
 *
 * After dropping the sport heading below 500px of height, the worst state is L1
 * at 64.8%, then L2 at 69.3%; every other state is 79% or better. 0.60 sits
 * about five points under the worst, which is enough headroom that the check
 * does not fire on rounding and little enough that ONE new sticky layer — the
 * smallest here is 36px, and 36px costs L1 nine points — trips it.
 *
 * Deliberately ONE number rather than a per-viewport ratchet. A ratchet blesses
 * whatever each state does today; a floor says what any state must clear.
 */
export const CONTENT_FLOOR = 0.60

export const verdictFor = (v, m) => {
  const faults = []
  if (m.overflowBefore > 0) faults.push(`${m.overflowBefore}px overflow at rest`)
  if (m.overflowAfter > 0) faults.push(`${m.overflowAfter}px overflow once cards are open`)
  if (v.cols !== null && m.cols !== v.cols) faults.push(`${m.cols} column(s), spec says ${v.cols}`)
  if (m.chromeHeight !== undefined && contentShare(m) < CONTENT_FLOOR)
    faults.push(`${m.chromeHeight}px of sticky chrome leaves ${(100 * contentShare(m)).toFixed(1)}% for content`)
  return faults
}

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()
  const P1 = VIEWPORTS[0], D3 = VIEWPORTS[8]
  const roomy = { chromeHeight: 132, viewportHeight: 375 }   // L1 as measured today
  const eaten = { chromeHeight: 168, viewportHeight: 375 }   // L1 before the fix

  check('the measured L1 clears the floor',
    contentShare(roomy) > CONTENT_FLOOR && contentShare(roomy).toFixed(3) === '0.648')
  check('L1 AS IT WAS DOES NOT — 168px of chrome in a 375px window',
    contentShare(eaten) < CONTENT_FLOOR,
    'the state this assertion was written for must fail it')
  check('one more 36px sticky layer breaks the floor',
    contentShare({ chromeHeight: 132 + 36, viewportHeight: 375 }) < CONTENT_FLOOR,
    'the check must be tight enough that a single added layer trips it')
  check('a portrait phone is nowhere near the floor',
    contentShare({ chromeHeight: 154, viewportHeight: 780 }) > CONTENT_FLOOR)
  check('a measurement with no chrome recorded raises no fault',
    verdictFor(D3, { overflowBefore: 0, overflowAfter: 0, cols: 1 }).length === 0,
    'the fault is skipped when chromeHeight is absent, not counted as zero')
  check('chrome eating the viewport IS a fault',
    verdictFor(P1, { overflowBefore: 0, overflowAfter: 0, cols: 1, ...eaten }).length === 1)
  const clean = { overflowBefore: 0, overflowAfter: 0, cols: 1 }

  check('a clean phone has no faults', verdictFor(P1, clean).length === 0)
  check('overflow AT REST is a fault',
    verdictFor(P1, { ...clean, overflowBefore: 216 })[0] === '216px overflow at rest')
  check('THE SPAN-2 SHAPE: sound at rest, overflowing once a card opens',
    verdictFor(P1, { ...clean, overflowAfter: 60 }).length === 1,
    'a check that only measured the resting page would have passed this')
  check('a phone rendering two columns contradicts the spec matrix',
    verdictFor(P1, { ...clean, cols: 2 })[0] === '2 column(s), spec says 1')
  check('column count is NOT asserted where the spec does not pin it',
    verdictFor(D3, { overflowBefore: 0, overflowAfter: 0, cols: 5 }).length === 0,
    'D3 has no cols contract; asserting one would be invented')
  check('faults accumulate rather than short-circuiting',
    verdictFor(P1, { overflowBefore: 10, overflowAfter: 20, cols: 3 }).length === 3)
  process.exit(summarize() === 0 ? 0 : 1)
}

if (isMain(import.meta.url)) {
  const { check, summarize } = createChecks()
  const sessionChromium = '/opt/pw-browsers/chromium'
  const browser = await chromium.launch(
    existsSync(sessionChromium) ? { executablePath: sessionChromium } : {})

  // THE DETECTOR IS PROVEN AGAINST A PLANTED OVERFLOW FIRST.
  //
  // Ten green rows prove nothing if the measurement cannot go red. This injects
  // a 3000px element into the real page at the narrowest viewport, confirms the
  // measurement reports it, and removes it -- so every row below is read against
  // a detector that has just been shown to discriminate.
  {
    const p = await browser.newPage({ viewport: { width: 360, height: 780 } })
    await p.goto(URL, { waitUntil: 'domcontentloaded' })
    await p.waitForSelector('.desk-card', { timeout: 30000 })
    const planted = await p.evaluate(() => {
      const d = document.createElement('div')
      d.id = '__overflow_probe'; d.style.cssText = 'width:3000px;height:1px'
      document.body.appendChild(d)
      const over = document.documentElement.scrollWidth - window.innerWidth
      d.remove()
      return over
    })
    check('the detector catches a planted 3000px element',
      planted > 2000,
      `planted element produced ${planted}px of overflow — a detector reading 0 here measures nothing`)
    await p.close()
  }

  console.log('\n  state  name                  w×h        rest  open   cols  chrome  content')
  const failures = []
  for (const v of VIEWPORTS) {
    const p = await browser.newPage({ viewport: { width: v.w, height: v.h } })
    await p.goto(URL, { waitUntil: 'domcontentloaded' })
    await p.waitForSelector('.desk-card', { timeout: 30000 })
    const overflowBefore = await p.evaluate(() =>
      document.documentElement.scrollWidth - window.innerWidth)
    await p.evaluate(() =>
      [...document.querySelectorAll('.desk-card--flippable')].forEach(c => c.click()))
    await p.waitForTimeout(150)
    const m = await p.evaluate(() => {
      const g = document.querySelector('.sport-group__grid')
      const vw = window.innerWidth
      // The widest offender, so a failure names the element rather than a number.
      let worst = null
      for (const el of document.body.querySelectorAll('*')) {
        const r = el.getBoundingClientRect()
        if (!el.getClientRects().length || r.width === 0) continue
        if (r.right > vw + 1 && (!worst || r.right > worst.right)) {
          worst = { right: +r.right.toFixed(0),
                    what: el.className ? `.${String(el.className).split(' ')[0]}` : el.tagName }
        }
      }
      // Sticky chrome, FOUND rather than listed.
      //
      // The first version summed three named selectors and a mutation caught
      // it: making `h1` a fourth sticky layer changed nothing, because the
      // measurement could only see the three it already knew. A check that
      // enumerates today's chrome cannot notice tomorrow's, which is the only
      // thing it exists to notice.
      //
      // `position` is read, never assumed — `.sport-group__title` is static
      // below 500px of height, and counting it there would report a cost the
      // reader is not paying. Nested stickies are counted once, at the
      // outermost element: a sticky inside a sticky occupies its parent's
      // space, not its own.
      const seen = []
      for (const el of document.body.querySelectorAll('*')) {
        const cs = getComputedStyle(el)
        if (cs.position !== 'sticky' && cs.position !== 'fixed') continue
        if (seen.some(a => a.contains(el))) continue
        const r = el.getBoundingClientRect()
        if (r.height === 0 || r.top > window.innerHeight) continue
        seen.push(el)
      }
      const chromeHeight = Math.round(
        seen.reduce((t, el) => t + el.getBoundingClientRect().height, 0) +
        parseFloat(getComputedStyle(document.body).paddingTop))
      return { cols: g ? getComputedStyle(g).gridTemplateColumns.split(' ').length : null,
               overflowAfter: document.documentElement.scrollWidth - vw, worst,
               chromeHeight, viewportHeight: window.innerHeight }
    })
    await p.close()

    const faults = verdictFor(v, { ...m, overflowBefore })
    console.log(`  ${v.id.padEnd(6)} ${v.name.padEnd(21)} ${String(v.w).padStart(4)}×${String(v.h).padEnd(5)} ` +
      `${String(overflowBefore).padStart(4)}  ${String(m.overflowAfter).padStart(4)}   ${String(m.cols).padStart(2)}` +
      `   ${String(m.chromeHeight).padStart(4)}px  ${(100 * contentShare(m)).toFixed(1).padStart(5)}%` +
      (faults.length ? `   <-- ${faults.join('; ')}${m.worst ? ` (widest: ${m.worst.what} to ${m.worst.right}px)` : ''}` : ''))
    if (faults.length) failures.push(`${v.id} ${v.name} (${v.eg}): ${faults.join('; ')}`)
  }
  console.log('')

  check(`no canonical viewport overflows horizontally or is eaten by chrome (${VIEWPORTS.length} states)`,
    failures.length === 0,
    failures.join(' | '))

  await browser.close()
  process.exit(summarize() === 0 ? 0 : 1)
}
