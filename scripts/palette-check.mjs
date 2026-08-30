// The palette's runtime invariants, over the REAL compiled F#.
//
// proof-check keeps the COMPILER claims honest (the hex is sealed, the registry
// is exhaustive, the scales cannot be crossed). This keeps the claims a compiler
// cannot state honest, against build/Palette.js:
//
//   - `tokenOf` is total and injective over the five semantics (five distinct
//     colors, one per word).
//   - the drama and advancement scales PARTITION 0-100: every value lands in
//     exactly one band, and the boundaries are where the spec says (80/60,
//     70/40), with no gap or overlap.
//   - "silence is honest": QUIET has no accent; every other word has one.
//   - every accent color, and the body text, clears a WCAG contrast ratio
//     against the background — turning "looks fine in dark mode" into a gate.
//
// Self-test first: the contrast math has to be shown to discriminate, or a
// broken ratio function would pass every color forever.

import { createChecks } from './checks.mjs'
import {
  allSemantics, tokenOf, cssValue, accentOf, accentCss,
  dramaScale, advancementScale,
  bg, card, card2, edgeStrong, text, dim, dimText, red, violet,
} from '../build/Palette.js'

const SELF_TEST = process.argv.includes('--self-test')

// ── contrast math (WCAG 2.1 relative luminance) ─────────────────────────────

const channel = c => {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
const luminance = hex => {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!m) return null // not a solid hex (e.g. an rgba hairline) — not contrast-tested
  const [r, g, b] = [1, 2, 3].map(i => parseInt(m[i], 16))
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}
const contrast = (a, b) => {
  const la = luminance(a), lb = luminance(b)
  if (la === null || lb === null) return null
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

// ── self-test: the ratio function discriminates ─────────────────────────────

if (SELF_TEST) {
  const { check, summarize } = createChecks()
  check('contrast is ~21:1 for black on white and 1:1 for a color on itself',
    Math.abs(contrast('#000000', '#ffffff') - 21) < 0.1 &&
    Math.abs(contrast('#4a9eff', '#4a9eff') - 1) < 0.001,
    'the contrast function does not compute WCAG ratios')
  check('a low-contrast pair scores below the 3.0 bar this check enforces',
    contrast('#060514', '#0b0920') < 3.0,
    'the ratio function would pass two near-identical darks — no teeth')
  process.exit(summarize() === 0 ? 0 : 1)
}

const { check, summarize } = createChecks()

const MIN_CONTRAST = 3.0 // WCAG AA for UI components / large text, on the dark bg
const BG = cssValue(bg)

// Fable compiles an F# `list` to a linked list, not a JS array — materialise it.
const SEMANTICS = Array.from(allSemantics)

// The color a semantic renders as, via the registry — never a literal here.
const hexOf = s => cssValue(tokenOf(s))

// ── tokenOf is total and injective ──────────────────────────────────────────

const hexes = SEMANTICS.map(hexOf)
check('tokenOf gives every semantic a color',
  hexes.every(h => /^#[0-9a-f]{6}$/i.test(h)),
  `hexes: ${hexes.join(', ')}`)
check('the five semantics map to five DISTINCT colors',
  new Set(hexes).size === SEMANTICS.length,
  `${new Set(hexes).size} distinct of ${SEMANTICS.length}`)

// ── the scales partition 0-100 at the spec boundaries ───────────────────────
//
// Compare by rendered hex rather than the union tag, so this reads the same
// values a card would and needs no knowledge of Fable's union representation.
const GOLD = '#c9a84c', BLUE = '#4a9eff', SMOKE = '#6a6a8a'

const bandHexDrama = d => hexOf(dramaScale(d))
const bandHexAdv = p => hexOf(advancementScale(p))

check('drama scale boundaries: 80→gold, 79→blue, 60→blue, 59→smoke',
  bandHexDrama(80) === GOLD && bandHexDrama(79) === BLUE &&
  bandHexDrama(60) === BLUE && bandHexDrama(59) === SMOKE,
  `80:${bandHexDrama(80)} 79:${bandHexDrama(79)} 60:${bandHexDrama(60)} 59:${bandHexDrama(59)}`)

check('advancement scale boundaries: 70→gold, 69→blue, 40→blue, 39→smoke',
  bandHexAdv(70) === GOLD && bandHexAdv(69) === BLUE &&
  bandHexAdv(40) === BLUE && bandHexAdv(39) === SMOKE,
  `70:${bandHexAdv(70)} 69:${bandHexAdv(69)} 40:${bandHexAdv(40)} 39:${bandHexAdv(39)}`)

// Every integer 0-100 lands in exactly one of the three bands — no value falls
// through, none lands in two. (Three known colors ⇒ membership is partition.)
const inThree = h => h === GOLD || h === BLUE || h === SMOKE
let dramaGaps = 0, advGaps = 0
for (let v = 0; v <= 100; v++) {
  if (!inThree(bandHexDrama(v))) dramaGaps++
  if (!inThree(bandHexAdv(v))) advGaps++
}
check('every 0-100 value lands in exactly one drama band (no gap, no overlap)',
  dramaGaps === 0, `${dramaGaps} value(s) outside the three bands`)
check('every 0-100 value lands in exactly one advancement band',
  advGaps === 0, `${advGaps} value(s) outside the three bands`)

// ── silence is honest: QUIET has no accent ──────────────────────────────────

const quiet = SEMANTICS.find(s => hexOf(s) === SMOKE)
check('QUIET has no left-border accent — silence is honest',
  accentCss(accentOf(quiet)) === undefined,
  `quiet accent: ${accentCss(accentOf(quiet))}`)
check('every non-QUIET semantic HAS an accent',
  SEMANTICS.filter(s => s !== quiet).every(s => typeof accentCss(accentOf(s)) === 'string'),
  'a non-quiet semantic is missing its accent')

// ── contrast against the background ─────────────────────────────────────────

const contrastRows = [...SEMANTICS.map(s => [hexOf(s), `semantic ${hexOf(s)}`]), [cssValue(text), 'body text']]
for (const [hex, label] of contrastRows) {
  const ratio = contrast(hex, BG)
  check(`${label} clears ${MIN_CONTRAST}:1 on the background`,
    ratio !== null && ratio >= MIN_CONTRAST,
    `${label} vs ${BG}: ${ratio === null ? 'not a solid hex' : ratio.toFixed(2) + ':1'}`)
}

// ── the foundation tokens, each with the assertion its ROLE actually warrants ─
//
// Not every token is an accent, so a blanket 3:1 contrast bar would be the wrong
// test. Each foundation token is checked against what it is FOR — which is also
// what makes it a consumed value rather than dead hex.

// Surfaces must be genuinely dark and distinct from one another — a card that is
// the same color as the page behind it has no edge.
const surfaces = [['bg', bg], ['card', card], ['card2', card2]]
for (const [name, tok] of surfaces) {
  check(`surface ${name} is a very dark color`,
    luminance(cssValue(tok)) < 0.02,
    `${name} = ${cssValue(tok)} (luminance ${luminance(cssValue(tok))?.toFixed(4)})`)
}
check('the three surfaces are distinct shades',
  new Set(surfaces.map(([, t]) => cssValue(t))).size === 3,
  surfaces.map(([, t]) => cssValue(t)).join(', '))

// TEXT CONTRAST, AT 4.5 — a different bar from MIN_CONTRAST above, deliberately.
//
// MIN_CONTRAST is 3.0: WCAG 1.4.11, non-text contrast, correct for a control's
// boundary and for `edgeStrong`. It is NOT correct for a word. 1.4.3 requires
// 4.5:1 for text below 18.66px bold / 24px, and on 2026-08-29 the rendered page
// drew seventeen text nodes in `dim` at 2.98:1 — six tab labels at 12.8px and
// eleven sport-group headings at 12.48px — while every palette check passed,
// because nothing here graded a token as TEXT.
//
// `dimText` exists for those, and this is the assertion that keeps it honest. On
// all three surfaces, because a token that clears the bar on `bg` and fails on
// `card2` is a trap for the next person who reaches for it.
const TEXT_CONTRAST = 4.5
for (const [name, tok] of surfaces) {
  const cr = contrast(cssValue(dimText), cssValue(tok))
  check(`dimText clears ${TEXT_CONTRAST}:1 as TEXT on ${name}`,
    cr >= TEXT_CONTRAST,
    `${cssValue(dimText)} on ${cssValue(tok)} = ${cr?.toFixed(2)}:1`)
}

// The token has to be QUIETER than the body text it sits beside, or it is not a
// secondary role at all — it is just a second body colour, and the hierarchy the
// split was made to preserve is gone.
check('dimText is quieter than text, and louder than dim',
  luminance(cssValue(dimText)) < luminance(cssValue(text)) &&
  luminance(cssValue(dimText)) > luminance(cssValue(dim)),
  `dim ${cssValue(dim)} < dimText ${cssValue(dimText)} < text ${cssValue(text)}`)

// THIS ASSERTION MEASURES PRESENCE, NOT SUFFICIENCY, AND SAYS SO.
//
// "distinct shades" above compares three hex STRINGS. Measured 2026-08-26,
// bg -> card is 1.03:1 and card -> card2 is 1.02:1, so the surfaces are distinct
// and indistinguishable at the same time — the check passes on a page where the
// elevation does nothing. It is left in place because a page whose surfaces are
// literally the same hex is worse still; it is simply not the whole claim.
//
// The whole claim needs a threshold and there is no external standard for the
// contrast of one large dark fill against another. Where there IS one — a
// control's boundary, WCAG 1.4.11 — it is enforced below, at 3.0:1, rather than
// invented for the surfaces.
const surfaceRatios = [['bg->card', bg, card], ['card->card2', card, card2]]
  .map(([n, a, b]) => `${n} ${contrast(cssValue(a), cssValue(b)).toFixed(2)}:1`)
console.log(`      note: surface elevation is ${surfaceRatios.join(', ')} — present, not perceptible`)

// ── The control boundary, which DOES have an external standard ──────────────
//
// WCAG 1.4.11 sets 3.0:1 for "visual information required to identify user
// interface components and states". `edge` renders at 1.09:1, so every button
// outline in this page was thirty times short of it. `controlEdge` exists for
// exactly those three controls and must clear the bar on every surface one of
// them can sit on.
for (const [name, surf] of surfaces) {
  const r = contrast(cssValue(edgeStrong), cssValue(surf))
  check(`edgeStrong clears ${MIN_CONTRAST}:1 on ${name} (WCAG 1.4.11)`,
    r >= MIN_CONTRAST, `${r.toFixed(2)}:1 — a control boundary this faint cannot identify the control`)
}
check('edgeStrong is not a semantic borrowed for chrome',
  ![...allSemantics].map(sem => cssValue(tokenOf(sem))).includes(cssValue(edgeStrong)),
  'a meaning token used as structure is the role conflation this token exists to end')

// `edge is a translucent hairline (rgba), not a solid ink` was asserted here and
// was DELETED with the token on 2026-08-26. It described the shape of a value
// that rendered at 1.08:1 — true, and beside the point. Every one of its
// seventeen uses either moved to `edgeStrong` or was removed, so there is no
// faint hairline left in this palette to describe.

// The two non-drama accents (red = elimination, violet = rivalry) are real
// accents and must clear the same bar the semantic accents do.
for (const [name, tok] of [['red', red], ['violet', violet]]) {
  const ratio = contrast(cssValue(tok), BG)
  check(`accent ${name} clears ${MIN_CONTRAST}:1 on the background`,
    ratio !== null && ratio >= MIN_CONTRAST,
    `${name} = ${cssValue(tok)}: ${ratio?.toFixed(2)}:1`)
}

// Dim text is deliberately low-emphasis: it must be dimmer than body text, yet
// still present — not a blanket 3:1, but a floor so "dim" never means invisible.
const dimRatio = contrast(cssValue(dim), BG)
const textRatio = contrast(cssValue(text), BG)
check('dim text is dimmer than body text but still above a 2:1 floor',
  dimRatio >= 2.0 && dimRatio < textRatio,
  `dim ${dimRatio?.toFixed(2)}:1 vs text ${textRatio?.toFixed(2)}:1`)

process.exit(summarize() === 0 ? 0 : 1)
