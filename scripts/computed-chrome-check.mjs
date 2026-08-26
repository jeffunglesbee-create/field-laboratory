// The chrome, measured on the rendered page instead of read off the source.
//
// WHY THIS EXISTS, AND WHY chrome-check.mjs SHRANK TO MAKE ROOM FOR IT
//
// chrome-check.mjs found four real defects by parsing index.html's stylesheet.
// It also produced a false positive on its very first live run: it flagged
// `.pk-side--none` for restating `.pk-side`'s `color` and `white-space`, and it
// was wrong — PickemView.fs emits that class on a STANDALONE span that never
// carries `.pk-side`, so those declarations are the element's only styling.
//
// The reason it was wrong is the interesting part. To decide whether a modifier
// restates its base, a source-level check has to MODEL THE CASCADE: which
// classes land on the same element, in what order, with what specificity. It
// guessed from the F# and guessed wrong. A check that models the runtime will
// be wrong about the runtime.
//
// This repo already wrote that down, in separation-check.mjs's own header, one
// day before chrome-check shipped:
//
//     "I added CSS" is not evidence. A stylesheet can be present, loaded, and
//     do nothing — a typo'd selector, a class renamed in F# and not in the CSS,
//     a rule overridden later in the cascade. So this measures the rendered
//     result.
//
// So the three assertions that need the cascade moved here, where the browser
// resolves it for us and there is nothing left to model. chrome-check keeps only
// the one claim that is genuinely textual — a pictograph in a source string —
// which is cheaper to catch before the build than after it.
//
// A NOTE ON HOW FAR DOWN THIS GOES. Computed style is better evidence than
// source text and is still not the bottom rung: jubilant-bassoon Rule 89 records
// a check that asserted `preserve-3d` was SET and passed while the render did
// nothing — the property was there, its effect was not. Where a consequence is
// measurable (a real gap, a real width) this measures the consequence; where the
// property IS the claim (a state must change something) it measures the property
// and says so.
//
// Usage:  URL='http://localhost:8080/?data=games-2026-08-09' node scripts/computed-chrome-check.mjs

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { createChecks, isMain } from './checks.mjs'

const sessionChromium = '/opt/pw-browsers/chromium'
const URL = process.env.URL || 'http://localhost:8080/?data=games-2026-08-09'

// Every tab, because a class that only renders on the Weather panel is not dead
// just because the Scoreboard is showing. The dead-CSS assertion is only as
// honest as the corpus it looks at.
const TABS = ['#tab-scoreboard', '#tab-field-pick', '#tab-scout-pick', '#tab-pickem',
              '#tab-weather', '#tab-stats', '#tab-briefs']

if (isMain(import.meta.url)) await (async () => {
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

// Visit every panel so every class that CAN render has rendered at least once.
const seen = await page.evaluate(() => new Set())  // placeholder, replaced below
const rendered = new Set()
for (const tab of TABS) {
  await page.click(tab)
  await page.waitForTimeout(120)
  for (const c of await page.evaluate(() =>
    [...new Set([...document.querySelectorAll('[class]')].flatMap(e => [...e.classList]))]))
    rendered.add(c)
}
void seen

// ── The bottom rung: two live siblings in different states, side by side ────
//
// THE FIRST VERSION OF THIS MEASURED DETACHMENT. It held a handle to a
// `.pk-sport`, clicked it, and diffed computed style before and after. All six
// properties "moved" on every run — because the click re-renders the panel and
// the handle's node is left disconnected, and `getComputedStyle` on a detached
// element returns '' for everything. The check passed, for a reason that had
// nothing to do with the CSS. Measured directly: `isConnected` false after the
// click, every property ''.
//
// So it does not diff across time. It compares two elements that are on screen
// AT THE SAME MOMENT, one in each state. If a chip that is ON computes
// identically to a chip that is OFF, the state is invisible to the user —
// which is the whole claim, stated without a before/after to get wrong.
//
// `.pk-sport--on` set `background` and `border-color` to the exact values
// `.pk-sport` already declared, so ON differed by text colour alone.
const CONTRAST = ['color', 'backgroundColor', 'borderLeftColor', 'borderTopColor', 'opacity', 'fontWeight']
await page.click('#tab-pickem')
await page.waitForTimeout(150)

// A pick button only enters its chosen state when something picks. One click,
// then everything below reads the rendered result.
const firstSide = await page.$('.pk-side')
if (firstSide) { await firstSide.click(); await page.waitForTimeout(150) }

const contrasts = await page.evaluate(props => {
  const out = []
  for (const [label, base, mod] of [
    ['sport filter', 'pk-sport', 'pk-sport--on'],
    ['pick button', 'pk-side', 'pk-side--chosen'],
  ]) {
    const all = [...document.querySelectorAll('.' + base)]
    const on = all.find(e => e.classList.contains(mod))
    const off = all.find(e => !e.classList.contains(mod))
    const read = n => Object.fromEntries(props.map(p => [p, getComputedStyle(n)[p]]))

    // No fixture in data/ carries more than one sport, so the filter row renders
    // exactly one chip and it is on by default — the two states can never both
    // be on screen. Rather than drop the control whose CSS was the defect, or
    // pass it vacuously, clone the live element, strip the modifier, and insert
    // the clone as a real sibling. Both are attached, in the same parent, at the
    // same moment: no detached node, no before/after.
    //
    // This is only sound because co-application is OBSERVED here — the element
    // really does carry both classes — which is precisely the fact the
    // source-level check had to infer and got wrong.
    let a, b, how
    if (on && off) { a = read(on); b = read(off); how = 'two rendered siblings' }
    else if (on) {
      const clone = on.cloneNode(false)
      clone.classList.remove(mod)
      on.parentNode.appendChild(clone)
      a = read(on); b = read(clone); how = 'a cloned sibling'
      clone.remove()
    } else {
      out.push({ label, verdict: 'not observable',
                 why: `${all.length} .${base} rendered, none in the ${mod} state` })
      continue
    }
    const differing = props.filter(p => a[p] !== b[p])
    out.push({ label, how, verdict: differing.length ? 'distinguishable' : 'identical', differing })
  }
  return out
}, CONTRAST)

const result = await page.evaluate(() => {
  // ── Every class the stylesheet defines, and what each modifier declares ───
  const declared = new Map()   // class -> Set of declared property names
  for (const sheet of document.styleSheets) {
    let rules
    try { rules = sheet.cssRules } catch { continue }   // cross-origin, not ours
    const walk = list => {
      for (const r of list) {
        // `if (r.cssRules)` is the obvious form and it is WRONG. Modern
        // Chromium gives every CSSStyleRule a cssRules list for nested CSS, and
        // an empty CSSRuleList is truthy — so that test matched every style
        // rule, recursed into nothing, and `continue`d past the selector. The
        // first run of this check reported "0 classes defined" and passed 5/5
        // vacuously. A grouping rule is one with NO selectorText.
        if (!r.selectorText) { if (r.cssRules) walk(r.cssRules); continue }
        if (r.cssRules?.length) walk(r.cssRules)   // nested rules, if any
        for (const cls of r.selectorText.match(/\.[A-Za-z0-9_-]+/g) || []) {
          const name = cls.slice(1)
          if (!declared.has(name)) declared.set(name, new Set())
          // Only the simple single-class case contributes a declared delta;
          // anything compound is a different element and is not a state.
          if (r.selectorText.trim().replace(/:[a-z-]+(\([^)]*\))?$/, '') === cls)
            for (const p of r.style) declared.get(name).add(p)
        }
      }
    }
    walk(rules)
  }

  // ── Rail on a rounded box, on elements that actually rendered ─────────────
  const rails = []
  for (const el of document.querySelectorAll('*')) {
    const s = getComputedStyle(el)
    const radius = ['borderTopLeftRadius', 'borderTopRightRadius',
                    'borderBottomLeftRadius', 'borderBottomRightRadius']
      .some(p => parseFloat(s[p]) > 0)
    if (!radius) continue
    const widths = ['borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth']
      .map(p => parseFloat(s[p]) || 0)
    const colours = ['borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor']
      .map(p => s[p])
    // A rail is one side thicker than the others, or one side a different
    // colour. Uniform borders on a rounded box are the normal card and fine.
    const sides = ['top', 'right', 'bottom', 'left']
    const oddWidth = sides.find((_, i) => widths[i] > 0 && widths.filter((w, j) => j !== i).every(w => w < widths[i]))
    const oddColour = sides.find((_, i) => colours.filter((c, j) => j !== i).every(c => c !== colours[i]))
    if (oddWidth || oddColour)
      rails.push({ cls: el.className || el.tagName.toLowerCase(),
                   side: oddWidth || oddColour, widths, colours })
  }

  // ── An element whose fill matches its parent's must have a real boundary ──
  //
  // `.pick-reason` is the case that prompted this: a pill with
  // `background: var(--card2)` sitting INSIDE `.pick-leader`, which is also
  // `card2`. Its background delimits nothing, so the chip exists only as a
  // 1.09:1 border — an invisible chip. Found by hand; nothing looked for it.
  //
  // The bar is 3.0:1, and it is not invented here. WCAG 1.4.11 covers "graphical
  // objects required to understand content", and a chip's boundary is what tells
  // a reader where one reason ends and the next begins. Same figure
  // `palette-check` holds the boundary token to.
  //
  // Only elements that PAINT a background are considered. An element with no
  // fill of its own is not claiming to be a box, and text inside a card is not a
  // finding.
  // TWO BUGS IN THE FIRST VERSION OF THIS, both caught by not trusting its pass.
  //
  // It compared against `el.parentElement`. `.pick-reason`'s parent is
  // `.pick-reasons`, a flex wrapper that paints NOTHING, so the comparison was
  // against `rgba(0, 0, 0, 0)` and the pill it was written for never appeared.
  // What matters is the nearest ancestor that actually paints — the backdrop a
  // reader sees behind the element.
  //
  // And it took `Math.max` of all four border widths while reading
  // `borderTopColor`. On `.tabs`, whose only boundary is a `border-bottom`, that
  // found the 1px from the bottom and scored the colour of a zero-width top
  // border — which resolves to the text colour and passes at ~16:1. It reported
  // a real boundary where there was none. Each side is now measured on its own.
  const paints = c => c && c !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(c)
  const backdropOf = el => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const c = getComputedStyle(p).backgroundColor
      if (paints(c)) return { el: p, bg: c }
    }
    return null
  }
  const SIDES = ['Top', 'Right', 'Bottom', 'Left']
  const merged = []
  for (const el of document.querySelectorAll('*')) {
    const s = getComputedStyle(el)
    const bg = s.backgroundColor
    if (!paints(bg)) continue
    const back = backdropOf(el)
    if (!back || back.bg !== bg) continue          // its own fill already separates it
    // Its fill does NOT separate it from what is behind it. Does a border?
    const borders = SIDES
      .map(d => ({ side: d, width: parseFloat(s[`border${d}Width`]) || 0, color: s[`border${d}Color`] }))
      .filter(b => b.width > 0 && paints(b.color))
    // A BOX-SHADOW IS A BOUNDARY TOO, and ignoring it made this check fail on
    // `.sport-group__title` — a sticky heading whose hairline is
    // `0 -1px 0 var(--bg), 0 1px 0 var(--edge)`, a shadow rather than a border
    // precisely so it does not affect layout. Reporting that as "no boundary"
    // was a false positive about a deliberate choice. The colours are pulled out
    // and scored exactly like a border's.
    const shadow = s.boxShadow && s.boxShadow !== 'none' ? s.boxShadow : ''
    const shadowColors = [...shadow.matchAll(/rgba?\([^)]*\)/g)].map(m => m[0]).filter(paints)
    merged.push({
      cls: el.className || el.tagName.toLowerCase(),
      backdrop: back.el.className || back.el.tagName.toLowerCase() || 'body',
      bg,
      // One list, because the question is "is there a perceptible edge", not
      // "which property draws it".
      edges: [...borders.map(b => b.color), ...shadowColors],
    })
  }

  // ── A borderless list row must still be separated, by its own padding ────
  //
  // Four row types lost `border-bottom: 1px solid var(--edge)` on 2026-08-26,
  // on the strength of a measurement — their padding separates consecutive row
  // CONTENT by 16.0 / 16.0 / 19.2 / 22.4 px, all above the 4px bar
  // separation-check accepts for the scoreboard cards. Nothing enforced that
  // measurement, which is how a padding change becomes a wall of text with no
  // check objecting. The boxes are flush by design; the CONTENT gap is the
  // property, and it is what this reads.
  const ROWS = ['.pick-chaser', '.gate', '.pk-row', '.briefs-stat']
  const rows = []
  for (const sel of ROWS) {
    const els = [...document.querySelectorAll(sel)]
    if (els.length < 2) { rows.push({ sel, verdict: 'not observable', count: els.length }); continue }
    const a = getComputedStyle(els[0]), b = getComputedStyle(els[1])
    const contentGap = (parseFloat(a.paddingBottom) || 0) + (parseFloat(b.paddingTop) || 0)
    // A row that kept a real boundary is separated whether or not it has padding.
    const edge = ['Top', 'Right', 'Bottom', 'Left']
      .some(d => (parseFloat(a[`border${d}Width`]) || 0) > 0)
    rows.push({ sel, count: els.length, contentGap, edge, verdict: contentGap >= 4 || edge ? 'separated' : 'flush' })
  }

  // ── Does each state modifier actually change the rendered element? ────────
  const PROPS = ['color', 'backgroundColor', 'borderTopColor', 'borderRightColor',
                 'borderBottomColor', 'borderLeftColor', 'borderTopWidth', 'borderLeftWidth',
                 'opacity', 'fontStyle', 'fontWeight', 'fontSize', 'textDecorationLine']
  const snap = el => Object.fromEntries(PROPS.map(p => [p, getComputedStyle(el)[p]]))

  const states = []
  for (const [name, props] of declared) {
    const cut = name.lastIndexOf('--')
    if (cut <= 0) continue
    const base = name.slice(0, cut)
    if (!declared.has(base)) continue

    // Does anything carry the modifier WITHOUT the base? Then it is standalone
    // by construction and comparing it to the base is meaningless. This is the
    // fact the source-level check had to guess at, observed instead.
    const carriers = [...document.querySelectorAll(`.${CSS.escape(name)}`)]
    const standalone = carriers.some(e => !e.classList.contains(base))
    if (standalone) { states.push({ name, base, verdict: 'standalone' }); continue }
    // OBSERVED co-application, not inferred. This is the single fact whose
    // absence made the source-level check wrong, and here it is a property of
    // a rendered element rather than a guess about the F#.
    const coApplied = carriers.some(e => e.classList.contains(base))

    const live = document.querySelector(`.${CSS.escape(base)}`)
    if (!live) { states.push({ name, base, verdict: 'base not rendered' }); continue }

    // MEASURE ON AN ISOLATED CLONE, not on the live element.
    //
    // The first version toggled the class on `document.querySelector('.base')`
    // and reported eleven false positives. Two reasons, both real: a `.pk-chip`
    // ALREADY carries one of its six variants, so adding another changed
    // nothing; and whichever element happened to be first might carry a sibling
    // modifier that wins the cascade. The clone is stripped of every `--`
    // modifier first, so the delta measured is this modifier's alone.
    const host = live.cloneNode(false)
    for (const c of [...host.classList]) if (c.includes('--')) host.classList.remove(c)
    live.parentNode.appendChild(host)
    const before = snap(host)
    host.classList.add(name)
    const after = snap(host)
    host.remove()

    const changed = PROPS.filter(p => before[p] !== after[p])
    // Every property this modifier DECLARES must be among the ones that
    // actually moved. A declaration that changes nothing is the defect.
    const declaredMoved = [...props].filter(p => {
      const camel = p.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
      return PROPS.includes(camel)
    })
    const inert = declaredMoved.filter(p => {
      const camel = p.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
      return before[camel] === after[camel]
    })
    // 'unjudged' is NOT a defect and must not be reported as one. A modifier
    // whose whole effect is on a DESCENDANT (`.gate--qualifies .gate__name`) or
    // on a property outside PROPS (`cursor`) declares nothing this can compare,
    // and calling that "declares a change it does not make" was the second
    // false-positive class this check shipped with.
    states.push({ name, base, coApplied,
                  verdict: inert.length ? (coApplied ? 'inert' : 'inert-unobserved')
                         : declaredMoved.length === 0 ? 'unjudged'
                         : 'live',
                  inert, changed })
  }

  return {
    merged, rows,
    declared: [...declared.keys()],
    modifiers: [...declared.keys()].filter(n => n.lastIndexOf('--') > 0),
    rails, states,
  }
})

const { check, summarize } = createChecks()

console.log(`\n  ${result.declared.length} class(es) defined, ${rendered.size} rendered across ${TABS.length} panel(s)`)
console.log(`  ${result.states.length} state modifier(s) exercised\n`)

// THE ASSERTION THAT WOULD HAVE CAUGHT THIS CHECK'S OWN FIRST RUN. It reported
// "0 class(es) defined" and passed everything below, because every list it
// iterated was empty. A check that cannot tell "clean" from "read nothing" is
// not a check.
check('the stylesheet parsed into classes',
  result.declared.length > 20,
  `${result.declared.length} class(es) — everything below would pass vacuously`)

check('there are state modifiers to exercise',
  result.states.length > 0,
  `${result.states.length} — the state assertion below would pass vacuously`)

check('the page rendered enough classes to measure',
  rendered.size > 20, `${rendered.size} rendered — the corpus is too thin to call anything dead`)

// ── 1. Clicking a control must visibly change it ────────────────────────────
// The bottom rung, and the assertion that fails a build. `.pk-sport--on` set a
// background and a border-colour identical to `.pk-sport`'s own, so turning a
// filter ON moved one property while the CSS read as though three did.
const observed = contrasts.filter(c => c.verdict !== 'not observable')
// NOT OBSERVABLE is reported, never counted as a pass. A slate that renders no
// pick buttons proves nothing about whether the chosen state is visible.
check('both states of a stateful control are on screen to compare',
  observed.length === contrasts.length,
  contrasts.filter(c => c.verdict === 'not observable').map(c => `${c.label}: ${c.why}`).join('; '))

const identical = observed.filter(c => c.verdict === 'identical')
check('a control in its active state looks different from one that is not',
  identical.length === 0,
  identical.map(c => `${c.label}: the two states compute identically`).join('; '))

for (const c of contrasts)
  console.log(`      ${c.label}: ${c.verdict}${c.how ? ` via ${c.how}` : ''}${c.differing?.length ? ` — ${c.differing.join(', ')}` : c.why ? ` (${c.why})` : ''}`)

// ── 1b. A state must MAKE every change it DECLARES ──────────────────────────
//
// The contrast above asks whether the state is visible. This asks whether the
// CSS is honest, and they are different questions — restoring `.pk-sport--on`'s
// dead `background` and `border-color` leaves it still visible (the text colour
// moves), so the contrast passes and this does not. That gap is why both exist.
//
// It fails ONLY for a modifier OBSERVED co-applied with its base on a real
// element. `.pk-side--none` restates `.pk-side`'s colour, and that is correct —
// PickemView emits it on a standalone span. Failing on it was the false positive
// chrome-check.mjs shipped with, and the fix is that co-application is now a
// fact read off the page rather than inferred from the F#.
const inert = result.states.filter(s => s.verdict === 'inert')
check('every co-applied state modifier makes the change it declares',
  inert.length === 0,
  inert.map(s => `.${s.name} declares ${s.inert.join(', ')} — none of which moves`).join('; '))

const unobserved = result.states.filter(s => s.verdict === 'inert-unobserved')
if (unobserved.length)
  console.log(`      note: ${unobserved.length} modifier(s) restate their base but were never seen applied — ${unobserved.map(s => '.' + s.name).join(', ')}`)
const standalone = result.states.filter(s => s.verdict === 'standalone')
if (standalone.length)
  console.log(`      observed standalone: ${standalone.map(s => '.' + s.name).join(', ')}`)

// ── 2. No rail on a rounded box, measured on rendered elements ──────────────
check('no rendered element has a one-sided border on a rounded box',
  result.rails.length === 0,
  result.rails.map(r => `${r.cls} (${r.side})`).join('; '))

// ── 2b. A box whose fill matches its parent needs a real boundary ──────────
const RGB2 = c => (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number)
const ALPHA = c => { const n = c.match(/[\d.]+/g) || []; return n.length > 3 ? Number(n[3]) : 1 }
const lin2 = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
const lum2 = ([r, g, b]) => 0.2126 * lin2(r) + 0.7152 * lin2(g) + 0.0722 * lin2(b)
// ALPHA IS COMPOSITED, and it was not before. `--edge` computes to
// `rgba(180, 160, 255, 0.07)`; scoring its raw channels against a near-black
// fill gave a very high ratio and every hairline in the page passed. What a
// reader sees is that lavender at 7% OVER the fill — 1.09:1. Ignoring alpha did
// not approximate the answer, it inverted it.
const overFill = (c, fill) => { const a = ALPHA(c), f = RGB2(fill)
  return RGB2(c).map((v, i) => v * a + f[i] * (1 - a)) }
const lumOf = (c, fill) => lum2(overFill(c, fill))
const ratio2 = (edge, fill) => {
  const [x, y] = [lumOf(edge, fill), lum2(RGB2(fill))].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

// ANY ONE side clearing the bar is enough — a sticky bar separated by a single
// `border-bottom` is properly separated, and demanding four sides would be a
// stricter rule than the one being tested.
const best = m => m.edges.reduce((hi, c) => Math.max(hi, ratio2(c, m.bg)), 1)
const invisible = (result.merged || []).filter(m => best(m) < 3.0)
check('no box shares its backdrop\'s fill without a boundary at 3:1',
  invisible.length === 0,
  invisible.map(m => `.${m.cls} on ${m.backdrop}: same fill ${m.bg}, best boundary ${m.edges.length ? best(m).toFixed(2) + ':1' : 'none'}`).join('; '))
if (result.merged?.length)
  console.log(`      ${result.merged.length} element(s) share their backdrop's fill; ${result.merged.length - invisible.length} carry a boundary at 3:1`)

// ── 2c. Borderless rows are still separated ────────────────────────────────
const flush = (result.rows || []).filter(r => r.verdict === 'flush')
check('every borderless list row is separated by its own padding',
  flush.length === 0,
  flush.map(r => `${r.sel}: ${r.contentGap}px of content gap and no boundary`).join('; '))
for (const r of result.rows || [])
  console.log(`      ${r.sel.padEnd(15)} ${r.verdict}${r.contentGap !== undefined ? ` — ${r.contentGap}px content gap` : ` (${r.count} rendered)`}`)

// ── 3. Nothing in the stylesheet is unreachable ─────────────────────────────
//
// "Did it render on this fixture" is the WRONG question and the first version
// asked it, reporting 29 classes as dead. Most were the Briefs and Weather
// panels, which render empty on this slate, and the brief-flip classes, which
// need a click. A one-fixture render says nothing about them.
//
// The question that IS answerable: does anything anywhere emit this class? A
// class is dead when it appears in NEITHER the rendered page NOR any view
// source. That is a grep for existence, not a model of the cascade — the thing
// this check exists to stop doing — and it is exactly what caught `.st-badge`.
const emitted = new Set(rendered)
for (const f of readdirSync('src').filter(n => n.endsWith('.fs')))
  for (const m of readFileSync(join('src', f), 'utf8').matchAll(/"([A-Za-z0-9_ -]+)"/g))
    for (const c of m[1].split(/\s+/)) if (c) emitted.add(c)

const dead = result.declared.filter(c => !emitted.has(c))
check('every class in the stylesheet is emitted by something',
  dead.length === 0,
  `${dead.map(c => '.' + c).join(', ')} — in no rendered page and no view source`)

check('no page errors during any of this', errors.length === 0, errors.join('; '))

await browser.close()
process.exit(summarize() === 0 ? 0 : 1)
})()
