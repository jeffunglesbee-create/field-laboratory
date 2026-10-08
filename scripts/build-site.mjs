// Assembles the deployable site into public/.
//
// This exists so that what runs locally and what deploys are the same artifact.
// Before it, index.html imported solid-js straight out of node_modules, which
// works only because the dev server happened to serve the repo root — it is not
// deployable, and node_modules is gitignored. Now the page is served from
// public/ in both places, so the render checks test what actually ships.

import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'

const ROOT = new URL('..', import.meta.url).pathname
const OUT = `${ROOT}public`

const required = [
  ['build/Program.js', 'run `npm run build` first — the Fable output is missing'],
  ['node_modules/solid-js/dist/solid.js', 'run `npm install` first — solid-js is missing'],
]
for (const [path, hint] of required) {
  if (!existsSync(`${ROOT}${path}`)) {
    console.error(`build-site: ${path} not found — ${hint}`)
    process.exit(1)
  }
}

await rm(OUT, { recursive: true, force: true })
await mkdir(`${OUT}/vendor`, { recursive: true })

await cp(`${ROOT}build`, `${OUT}/build`, { recursive: true })
await cp(`${ROOT}data`, `${OUT}/data`, { recursive: true })
// Self-hosted fonts — no hotlink, so the deployed desk stays offline-honest.
await cp(`${ROOT}fonts`, `${OUT}/fonts`, { recursive: true })

// The design tokens are GENERATED from the typed modules, not hand-written in
// the page: the CSS variables the desk uses ARE `Palette.tokenOf(...)` and
// `Typography.fontFamily(...)`, so a colour or font on screen cannot drift from
// the source of truth. index.html carries a `<!--DESIGN-TOKENS-->` marker; the
// concrete `:root` + `@font-face` block is injected here, at build time.
const Palette = await import(`${ROOT}build/Palette.js`)
const Typography = await import(`${ROOT}build/Typography.js`)

// allSemantics is stakes-descending: Must, Watch, Discovery, Caution, Quiet.
const [must, watch, discovery, caution, quiet] =
  Array.from(Palette.allSemantics).map(s => Palette.cssValue(Palette.tokenOf(s)))
// allFonts: ChakraPetch (identity), DmSans (body).
const [identityFont, bodyFont] = Array.from(Typography.allFonts).map(Typography.fontFamily)

// The score's face comes from the ROLE, not from a position in allFonts. Reading
// it as `bodyFont` would be true today and wrong the moment either moves, and
// the whole claim of these tokens is that what is on screen IS what the typed
// modules say. Role order in `allRoles` is Label, Data, Score, ... — indexed
// rather than named because Fable gives union cases no stable JS name, which is
// the same reason scripts/typography-check.mjs identifies roles by their style.
const SCORE_ROLE_INDEX = 2
const scoreRole = Array.from(Typography.allRoles)[SCORE_ROLE_INDEX]
const scoreFont = Typography.fontFamily(Typography.fontOf(scoreRole))
if (!/DM Sans/.test(scoreFont)) {
  console.error(`build-site: the Score role resolved to ${scoreFont}, not DM Sans — ` +
    `allRoles order changed and SCORE_ROLE_INDEX ${SCORE_ROLE_INDEX} no longer points at Score`)
  process.exit(1)
}

const fontFace = (family, weight, file) =>
  `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};` +
  `font-display:swap;src:url('./fonts/${file}') format('woff2');}`

// A RANGE, NOT A VALUE, and the two emitters are kept apart on purpose.
//
// `font-weight: 100 1000` in an @font-face is what tells the browser the file
// carries a `wght` axis over that interval. Writing a single value here against
// a variable file is the quiet failure: the face loads, every weight renders,
// and the browser synthesises them off one instance instead of interpolating —
// so `font-variation-settings: 'wght' 420` moves nothing and reports nothing.
//
// The bounds come from `Typography.SCORE_WGHT_MIN/MAX` rather than from two
// literals here, so the range the build DECLARES and the range `scoreAxisCss`
// CLAMPS to cannot drift apart. They were separate numbers in the first draft of
// this change, which is exactly the shape of defect this file exists to prevent.
const variableFontFace = (family, lo, hi, file) =>
  `@font-face{font-family:'${family}';font-style:normal;font-weight:${lo} ${hi};` +
  `font-display:swap;src:url('./fonts/${file}') format('woff2');}`

// --font-score is a THIRD token that resolves to the same string as --font-body
// today, because both are DM Sans. They are separate tokens because the ROLES
// are separate: the score was grouped with --font-identity in index.html until
// 2026-10-08, and reading it off --font-body instead would make a future
// divergence between the body voice and the score invisible.
//
// Explained HERE rather than as a CSS comment inside `:root`. The first draft
// put it in the emitted stylesheet, where it shipped in every page byte and sat
// where `tokenFrom` in design-tokens-check.mjs regexes for `--name:` — a
// comment mentioning other token names inside the block those names are parsed
// out of is a trap, even while it happens not to match.
const designTokens = `<style id="design-tokens">
${fontFace('Chakra Petch', 600, 'chakra-petch-600.woff2')}
${fontFace('Chakra Petch', 700, 'chakra-petch-700.woff2')}
${variableFontFace('DM Sans', Typography.SCORE_WGHT_MIN, Typography.SCORE_WGHT_MAX, 'dm-sans-variable.woff2')}
:root{
  --must:${must};--watch:${watch};--discovery:${discovery};--caution:${caution};--quiet:${quiet};
  --bg:${Palette.cssValue(Palette.bg)};--card:${Palette.cssValue(Palette.card)};--card2:${Palette.cssValue(Palette.card2)};
  --edge-strong:${Palette.cssValue(Palette.edgeStrong)};--text:${Palette.cssValue(Palette.text)};--dim:${Palette.cssValue(Palette.dim)};--dim-text:${Palette.cssValue(Palette.dimText)};
  --red:${Palette.cssValue(Palette.red)};--violet:${Palette.cssValue(Palette.violet)};
  --font-identity:${identityFont};--font-body:${bodyFont};--font-score:${scoreFont};
}
</style>`

const MARKER = '<!--DESIGN-TOKENS-->'
const indexSrc = await readFile(`${ROOT}index.html`, 'utf8')
if (!indexSrc.includes(MARKER)) {
  console.error(`build-site: ${MARKER} not found in index.html — cannot inject the design tokens`)
  process.exit(1)
}
await writeFile(`${OUT}/index.html`, indexSrc.replace(MARKER, designTokens))

// solid-js's browser build specifically. The package's `module` field points at
// dist/server.js (the SSR renderer); dist/solid.js is reachable only through
// the "browser" export condition, which a plain <script type="module"> does not
// apply. Copying the wrong one yields a page with no reactivity and no error.
await cp(`${ROOT}node_modules/solid-js/dist/solid.js`, `${OUT}/vendor/solid.js`)

// data/PROVENANCE.md is copied along with the rest of data/ deliberately: a
// deployed page serving real captures should carry the record of where they
// came from, reachable at the same path as the data itself.

// A build stamp, so "what is actually deployed?" is answerable by fetching the
// site rather than inferred from workflow history. The deploy uses it to skip
// republishing a commit that is already live, which is what makes an hourly
// schedule cost nothing.
const commit =
  process.env.GITHUB_SHA ||
  (await import('node:child_process')
    .then(cp => cp.execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim())
    .catch(() => 'unknown'))
await writeFile(`${OUT}/version.txt`, `${commit}\n`)

const size = (await readFile(`${OUT}/index.html`, 'utf8')).length
console.log(`build-site: public/ assembled (index.html ${size} bytes, commit ${commit.slice(0, 7)})`)
