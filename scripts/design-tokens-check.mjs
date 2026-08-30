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

// The self-hosted fonts are actually shipped — no silent network dependency.
const fonts = ['chakra-petch-600', 'chakra-petch-700', 'dm-sans-300', 'dm-sans-400']
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
