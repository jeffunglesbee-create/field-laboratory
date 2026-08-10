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

await cp(`${ROOT}index.html`, `${OUT}/index.html`)
await cp(`${ROOT}build`, `${OUT}/build`, { recursive: true })
await cp(`${ROOT}data`, `${OUT}/data`, { recursive: true })

// solid-js's browser build specifically. The package's `module` field points at
// dist/server.js (the SSR renderer); dist/solid.js is reachable only through
// the "browser" export condition, which a plain <script type="module"> does not
// apply. Copying the wrong one yields a page with no reactivity and no error.
await cp(`${ROOT}node_modules/solid-js/dist/solid.js`, `${OUT}/vendor/solid.js`)

// data/PROVENANCE.md is copied along with the rest of data/ deliberately: a
// deployed page serving real captures should carry the record of where they
// came from, reachable at the same path as the data itself.

const size = (await readFile(`${OUT}/index.html`, 'utf8')).length
console.log(`build-site: public/ assembled (index.html ${size} bytes)`)
