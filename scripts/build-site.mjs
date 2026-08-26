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

const fontFace = (family, weight, file) =>
  `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};` +
  `font-display:swap;src:url('./fonts/${file}') format('woff2');}`

const designTokens = `<style id="design-tokens">
${fontFace('Chakra Petch', 600, 'chakra-petch-600.woff2')}
${fontFace('Chakra Petch', 700, 'chakra-petch-700.woff2')}
${fontFace('DM Sans', 300, 'dm-sans-300.woff2')}
${fontFace('DM Sans', 400, 'dm-sans-400.woff2')}
:root{
  --must:${must};--watch:${watch};--discovery:${discovery};--caution:${caution};--quiet:${quiet};
  --bg:${Palette.cssValue(Palette.bg)};--card:${Palette.cssValue(Palette.card)};--card2:${Palette.cssValue(Palette.card2)};
  --edge-strong:${Palette.cssValue(Palette.edgeStrong)};--text:${Palette.cssValue(Palette.text)};--dim:${Palette.cssValue(Palette.dim)};
  --red:${Palette.cssValue(Palette.red)};--violet:${Palette.cssValue(Palette.violet)};
  --font-identity:${identityFont};--font-body:${bodyFont};
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
