#!/usr/bin/env node
// A pictograph used as a visual asset, caught in source before the build.
//
// THIS FILE WAS chrome-check.mjs AND CHECKED THREE THINGS. Two of them — a
// coloured rail on a rounded box, and a state modifier that declares a change it
// does not make — needed to know how the cascade resolves and how classes are
// co-applied, and a source-level check cannot know either. It guessed from the
// F# and got `.pk-side--none` wrong on its first live run: PickemView emits that
// class on a standalone span, so the declarations it called dead are the
// element's only styling.
//
// Those two assertions moved to computed-chrome-check.mjs, where the browser
// resolves the cascade and co-application is read off a rendered element instead
// of inferred. The machinery that had to model the runtime — baseSelectorOf,
// deadDeclarations, coAppliedModifiers — was deleted rather than patched.
//
// What is left is the one claim that is genuinely textual: `PickView.fs` prefixed
// the tie note with `⚖`, restating what the note already said in whatever font
// the OS substituted. A string in a source file is a string in a source file; no
// render is needed to see it, and catching it before the build is cheaper than
// after.
//
// The file was renamed with the scope. A checker called "chrome-check" that
// checks one glyph is a name that disagrees with its own measurement, which is
// the defect class this session kept finding.
//
// ARROWS ARE ALLOWED, deliberately. `←` and `→` label the date-nav buttons and
// ARE those controls' content, not decoration on top of it. The Arrows block
// (U+2190–21FF) passes; Miscellaneous Symbols, Dingbats and the emoji planes do
// not.

import { readFileSync } from 'node:fs'
import { createChecks, isMain } from './checks.mjs'

const IS_MAIN = isMain(import.meta.url)
const SELF_TEST = IS_MAIN && process.argv.includes('--self-test')

/// Pictographs used as visual assets. Arrows are excluded on purpose — see the
/// header. The ranges are written out rather than using \p{Emoji}, which
/// matches digits and `#`.
const PICTOGRAPH = /[←-⇿]/u.source && /[☀-➿⬀-⯿\u{1F300}-\u{1FAFF}]/gu
export function pictographsIn(text) {
  return [...text.matchAll(PICTOGRAPH)].map(m => m[0])
}

if (SELF_TEST) {
  const { check, summarize } = createChecks()
  check('the scales glyph is caught', pictographsIn('⚖ tied').length === 1)
  check('an emoji is caught', pictographsIn('a 🏈 b').length === 1)
  check('arrows are ALLOWED — they label the date-nav buttons',
    pictographsIn('← → ↑ ↓').length === 0,
    'the nav controls would be reported as decoration')
  check('ordinary prose is clean', pictographsIn('Rockies @ Diamondbacks, 4-1').length === 0)
  check('a tab and a newline are not pictographs', pictographsIn('a\tb\nc').length === 0)
  process.exit(summarize() === 0 ? 0 : 1)
}

if (IS_MAIN) await (async () => {
const { check, summarize } = createChecks()

const SOURCES = ['src/PickView.fs', 'src/PickemView.fs', 'src/StatsView.fs', 'src/WeatherView.fs',
                 'src/BriefsView.fs', 'src/Desk.fs', 'src/Prose.fs']

const html = readFileSync('index.html', 'utf8')
const bodyStart = html.indexOf('<body>')
check('index.html has a body to scan',
  bodyStart > 0, 'no <body> found — the scan below would be vacuous')

const glyphs = []
for (const [label, text] of [
  ['index.html body', html.slice(bodyStart)],
  ...SOURCES.map(f => [f, readFileSync(f, 'utf8')]),
]) {
  const found = pictographsIn(text)
  if (found.length) glyphs.push(`${label}: ${[...new Set(found)].join(' ')}`)
}
check(`no pictograph is used as a visual asset (${SOURCES.length + 1} source(s) scanned)`,
  glyphs.length === 0, glyphs.join('; '))

process.exit(summarize() === 0 ? 0 : 1)
})()
