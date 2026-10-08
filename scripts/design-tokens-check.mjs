// The deployed page's colours and fonts ARE the typed modules — proven, not hoped.
//
// build-site.mjs injects a #design-tokens block generated from Palette.fs and
// Typography.fs. This asserts the injection actually happened and that every
// value in it equals the module it came from, so a colour on screen can never
// drift from the registry — the page-level end of the same guarantee `tokenOf`
// gives inside the F#. It also confirms the self-hosted fonts are present, so the
// desk is not silently depending on a network font.
//
// Runs after the build (it reads public/), like the other build-dependent checks.

import { readFileSync, existsSync } from 'node:fs'
import { createChecks } from './checks.mjs'
import * as Palette from '../build/Palette.js'
import * as Typography from '../build/Typography.js'

const SELF_TEST = process.argv.includes('--self-test')

// Pull `--name:value` out of the injected :root. Values run to the ; or }.
const tokenFrom = (css, name) => {
  const m = new RegExp(`--${name}\\s*:\\s*([^;}]+)`).exec(css)
  return m ? m[1].trim() : null
}

if (SELF_TEST) {
  const { check, summarize } = createChecks()
  const sample = ':root{ --must:#c9a84c; --font-body:\'DM Sans\', system-ui, sans-serif; }'
  check('tokenFrom extracts a hex and a font stack, and misses an absent token',
    tokenFrom(sample, 'must') === '#c9a84c' &&
    tokenFrom(sample, 'font-body') === "'DM Sans', system-ui, sans-serif" &&
    tokenFrom(sample, 'nope') === null,
    'the token extractor does not read the injected :root correctly')
  process.exit(summarize() === 0 ? 0 : 1)
}

const { check, summarize } = createChecks()

const PAGE = 'public/index.html'
if (!existsSync(PAGE)) {
  console.error(`::error::${PAGE} not found — run npm run build first`)
  process.exit(1)
}
const css = readFileSync(PAGE, 'utf8')

check('the design-tokens block was injected at build time',
  /<style id="design-tokens">/.test(css),
  'no #design-tokens style — build-site did not inject, or the marker is gone')

// The five semantic tokens, in the module's own order, must equal tokenOf().
const semNames = ['must', 'watch', 'discovery', 'caution', 'quiet']
const semHexes = Array.from(Palette.allSemantics).map(s => Palette.cssValue(Palette.tokenOf(s)))
semNames.forEach((name, i) => {
  check(`--${name} on the page equals Palette.tokenOf (${semHexes[i]})`,
    tokenFrom(css, name) === semHexes[i],
    `page: ${tokenFrom(css, name)}, module: ${semHexes[i]}`)
})

// The foundation tokens, each against its exported value.
const foundation = {
  bg: Palette.bg, card: Palette.card, card2: Palette.card2,
  'edge-strong': Palette.edgeStrong,
  text: Palette.text, dim: Palette.dim, 'dim-text': Palette.dimText,
  red: Palette.red, violet: Palette.violet,
}
for (const [name, tok] of Object.entries(foundation)) {
  const want = Palette.cssValue(tok)
  check(`--${name} on the page equals Palette.${name} (${want})`,
    tokenFrom(css, name) === want,
    `page: ${tokenFrom(css, name)}, module: ${want}`)
}

// The two font stacks must equal Typography.fontFamily, in identity/body order.
const [identity, body] = Array.from(Typography.allFonts).map(Typography.fontFamily)
check('--font-identity equals Typography.fontFamily(ChakraPetch)',
  tokenFrom(css, 'font-identity') === identity,
  `page: ${tokenFrom(css, 'font-identity')}, module: ${identity}`)
check('--font-body equals Typography.fontFamily(DmSans)',
  tokenFrom(css, 'font-body') === body,
  `page: ${tokenFrom(css, 'font-body')}, module: ${body}`)

// ── the score's face comes from the Score role ──────────────────────────────

// --font-score is a THIRD token resolving to the same string as --font-body
// today, because both are DM Sans. Checked against the role rather than against
// --font-body: they are equal by coincidence of the current design, and reading
// one off the other would make a future divergence invisible.
const scoreRole = Array.from(Typography.allRoles).find(
  r => Typography.isTabular(r) && /DM Sans/.test(Typography.fontFamily(Typography.fontOf(r))))
check('a tabular role is set in DM Sans (the Score role exists)',
  scoreRole !== undefined, 'no tabular DM Sans role found in allRoles')
if (scoreRole !== undefined) {
  const scoreFont = Typography.fontFamily(Typography.fontOf(scoreRole))
  check('--font-score equals Typography.fontFamily(fontOf Score)',
    tokenFrom(css, 'font-score') === scoreFont,
    `page: ${tokenFrom(css, 'font-score')}, module: ${scoreFont}`)
}

// ── THE AXIS IS DECLARED AS A RANGE ─────────────────────────────────────────

// The single most load-bearing check in this change, and the one failure that
// reports nothing on its own: a variable woff2 declared with a SINGLE
// `font-weight` loads and renders every weight by SYNTHESISING them off one
// instance. `font-variation-settings: 'wght' 420` then moves nothing, the
// browser logs nothing, and the page looks approximately right. Only the range
// in the @font-face enables real interpolation.
{
  const dmFace = (css.match(/@font-face\{[^}]*dm-sans-variable\.woff2[^}]*\}/) || [])[0] || ''
  const range = (dmFace.match(/font-weight:\s*(\d+)\s+(\d+)/) || []).slice(1).map(Number)
  check('the DM Sans @font-face declares a wght RANGE, not a single weight',
    range.length === 2, `font-weight in that @font-face: ${
      (dmFace.match(/font-weight:\s*([^;]+)/) || [])[1] || '(absent)'}`)
  check('the declared range equals Typography.SCORE_WGHT_MIN..MAX',
    range[0] === Typography.SCORE_WGHT_MIN && range[1] === Typography.SCORE_WGHT_MAX,
    `page ${range.join('..')} vs module ${Typography.SCORE_WGHT_MIN}..${Typography.SCORE_WGHT_MAX}`)
}

// The self-hosted fonts are actually shipped — no silent network dependency.
// dm-sans-variable replaced dm-sans-300 and dm-sans-400 on 2026-10-08: one file
// carrying wght 100-1000 instead of two instances, +9,024 bytes net.
const fonts = ['chakra-petch-600', 'chakra-petch-700', 'dm-sans-variable']
for (const f of fonts) {
  check(`self-hosted font ${f}.woff2 is present and declared`,
    existsSync(`public/fonts/${f}.woff2`) && css.includes(`fonts/${f}.woff2`),
    `${f}: file ${existsSync(`public/fonts/${f}.woff2`) ? 'present' : 'MISSING'}, ` +
    `declared ${css.includes(`fonts/${f}.woff2`)}`)
}

// No @import or href to a font CDN — the desk stays offline-honest.
check('no external font is hotlinked (offline-honest)',
  !/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(css),
  'the page references a font CDN')

process.exit(summarize() === 0 ? 0 : 1)
