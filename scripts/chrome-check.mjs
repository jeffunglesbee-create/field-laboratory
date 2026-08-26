// Three chrome defects that shipped in index.html, and nothing looked for them.
//
// Found by running the unslop-ui skill against this repo, 2026-08-26. Each one
// had been in the stylesheet for weeks; none is caught by palette-check,
// typography-check, design-tokens-check or separation-check, which check the
// token registry and the gaps between boxes, not the chrome on them.
//
// 1. A COLOURED RAIL ON A ROUNDED BOX.
//    `.pick-leader { border: 1px solid var(--edge); border-left: 3px solid
//    var(--discovery); border-radius: 10px }`. The unslop-ui checklist names
//    this shape by hand ("no border-left combined with border-radius"): the
//    rail's ends are cut by the corner radius, so it reads as a rendering
//    accident. It was also decoration — the chasers below it are bare rows, so
//    the card boundary already said which one was the leader.
//
// 2. A STATE THAT DECLARED THREE CHANGES AND MADE ONE.
//    `.pk-sport--on` set `background: var(--card2)` and `border-color:
//    var(--edge)` — the exact values `.pk-sport` already declares. A filter
//    that was ON differed by nothing but text colour, while the CSS read as
//    though the whole chip changed. Same in `.pk-side--chosen` (background) and
//    `.pk-side:hover` (border-color).
//
//    THIS IS THE DEFECT CLASS THIS PROJECT KEEPS FINDING: a thing whose name
//    and whose measurement disagree. It is the CSS form of the import
//    assertion that said "imports the rule" and measured "imports exactly one
//    name", and of `opening_odds` holding odds that are not opening.
//
// 3. A PICTOGRAPH AS A VISUAL ASSET.
//    `PickView.fs` prefixed the tie note with `⚖`. The note already says there
//    is a tie; the glyph restated it in a font nobody chose.
//
// WHAT IT DOES NOT CHECK, deliberately: arrows. `←` and `→` label the date-nav
// buttons and ARE those controls' content, not decoration on top of content.
// The Arrows block (U+2190–21FF) is allowed; Miscellaneous Symbols, Dingbats
// and the emoji planes are not.

import { readFileSync } from 'node:fs'
import { createChecks } from './checks.mjs'

const SELF_TEST = process.argv.includes('--self-test')

/// Every `selector { declarations }` rule in a stylesheet, comments stripped.
///
/// An at-rule wrapper (`@media (...) {`) is skipped for free rather than by a
/// special case: its "declarations" contain a `{`, and the body only matches
/// bodies that do not. The rules INSIDE the media block still match, which is
/// what we want — a defect does not stop being one at 34rem.
export function rulesOf(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const out = []
  for (const m of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim()
    if (!selector || selector.startsWith('@')) continue
    const decls = new Map()
    for (const d of m[2].split(';')) {
      const i = d.indexOf(':')
      if (i < 0) continue
      decls.set(d.slice(0, i).trim(), d.slice(i + 1).trim())
    }
    out.push({ selector, decls })
  }
  return out
}

/// A one-sided coloured border on a rounded box.
///
/// `border-radius` alone is fine, and so is a rail on a square box. It is the
/// COMBINATION that produces the clipped-bar shape, so both must be present in
/// the same rule for this to fire.
export function railOnRoundedBox(rule) {
  const sides = ['border-left', 'border-right', 'border-top', 'border-bottom']
  const rail = sides.find(s => rule.decls.has(s))
  return rail && rule.decls.has('border-radius') ? rail : null
}

/// The base selector a modifier varies, or null if this is not a modifier.
/// `.pk-sport--on` -> `.pk-sport`;  `.pk-side:hover` -> `.pk-side`.
///
/// Single-class selectors only. A descendant or compound selector can override
/// a property legitimately (different element, different context), so guessing
/// its base would manufacture findings.
export function baseSelectorOf(selector) {
  const m = /^(\.[A-Za-z0-9_-]+?)(--[A-Za-z0-9_-]+|:[A-Za-z-]+(?:\([^)]*\))?)$/.exec(selector.trim())
  return m ? m[1] : null
}

/// Declarations in a modifier that restate what the base already says.
///
/// The shorthand case is the one that matters and is easy to miss: `.pk-sport`
/// writes `border: 1px solid var(--edge)` while `.pk-sport--on` writes
/// `border-color: var(--edge)`. Comparing property names alone would call that
/// a real change. So a longhand is also compared against the last token of its
/// own shorthand, which is where a colour sits in `border`.
export function deadDeclarations(rule, base) {
  if (!base) return []
  const dead = []
  for (const [prop, value] of rule.decls) {
    if (base.decls.get(prop) === value) { dead.push(prop); continue }
    const m = /^([a-z]+)-color$/.exec(prop)
    if (m && base.decls.has(m[1])) {
      const parts = base.decls.get(m[1]).trim().split(/\s+(?![^(]*\))/)
      if (parts[parts.length - 1] === value) dead.push(prop)
    }
  }
  return dead
}

/// Modifier classes that are applied ON TOP OF their base, harvested from the
/// views that emit them.
///
/// THIS DISTINCTION IS WHY THE FIRST VERSION OF THIS CHECK WAS WRONG. It
/// flagged `.pk-side--none` for restating `.pk-side`'s `color` and
/// `white-space` — but PickemView.fs emits `el "span" "pk-side--none"`, a
/// STANDALONE span that never carries `pk-side`. Those declarations are the
/// element's only styling; deleting them would have broken the one case the
/// rule exists for. `.pk-side--chosen`, by contrast, arrives via
/// `button.classList.add "pk-side--chosen"` on an element already classed
/// `pk-side`, so its restatements really were dead.
///
/// Co-applied means: added to an existing element (`classList.add`), or listed
/// beside another class in one class string. An `el` call with a single class
/// is the element's whole class list and is NOT co-applied.
export function coAppliedModifiers(sources) {
  const set = new Set()
  for (const src of sources) {
    for (const m of src.matchAll(/classList\.add\s+"([A-Za-z0-9_-]+)"/g)) set.add(m[1])
    for (const m of src.matchAll(/"([A-Za-z0-9_-]+(?:\s+[A-Za-z0-9_-]+)+)"/g))
      for (const c of m[1].split(/\s+/)) set.add(c)
  }
  return set
}

/// Pictographs used as visual assets. Arrows are excluded on purpose — see the
/// header. The ranges are written out rather than using \p{Emoji}, which
/// matches digits and `#`.
const PICTOGRAPH = /[←-⇿]/u.source && /[☀-➿⬀-⯿\u{1F300}-\u{1FAFF}]/gu
export function pictographsIn(text) {
  return [...text.matchAll(PICTOGRAPH)].map(m => m[0])
}

// ── self-test ───────────────────────────────────────────────────────────────

if (SELF_TEST) {
  const { check, summarize } = createChecks()

  check('rulesOf reads a selector and its declarations',
    rulesOf('.a { color: red; border: 1px solid x }')[0].decls.get('color') === 'red')
  check('rulesOf strips comments so a commented-out defect is not a finding',
    rulesOf('/* .a { border-left: 1px; border-radius: 2px } */ .b { color: red }').length === 1)
  check('rulesOf reaches inside a media block',
    rulesOf('@media (max-width: 34rem) { .a { color: red } }').some(r => r.selector === '.a'),
    'a defect inside a breakpoint would be invisible')

  check('a rail on a rounded box is caught',
    railOnRoundedBox(rulesOf('.a { border-left: 3px solid t; border-radius: 10px }')[0]) === 'border-left')
  check('a rail on a SQUARE box is fine',
    railOnRoundedBox(rulesOf('.a { border-left: 3px solid t }')[0]) === null)
  check('a rounded box with no rail is fine',
    railOnRoundedBox(rulesOf('.a { border: 1px solid t; border-radius: 10px }')[0]) === null)
  check('border-bottom counts too — the shape is not left-specific',
    railOnRoundedBox(rulesOf('.a { border-bottom: 3px solid t; border-radius: 4px }')[0]) === 'border-bottom')

  check('baseSelectorOf reads a -- modifier', baseSelectorOf('.pk-sport--on') === '.pk-sport')
  check('baseSelectorOf reads a pseudo-class', baseSelectorOf('.pk-side:hover') === '.pk-side')
  check('baseSelectorOf reads a functional pseudo-class',
    baseSelectorOf('.pk-side:not(.x)') === '.pk-side')
  check('a plain class is not a modifier', baseSelectorOf('.pk-sport') === null)
  check('a descendant selector is not treated as a modifier',
    baseSelectorOf('.a .b') === null,
    'guessing a base for a compound selector would manufacture findings')

  const base = rulesOf('.s { color: dim; background: c2; border: 1px solid e }')[0]
  check('a modifier restating a value verbatim is dead',
    deadDeclarations(rulesOf('.s--on { background: c2 }')[0], base).includes('background'))
  check('a longhand restating the colour inside a shorthand is dead',
    deadDeclarations(rulesOf('.s--on { border-color: e }')[0], base).includes('border-color'),
    'the shorthand case is the one that hides — this is exactly what .pk-sport--on did')
  check('a modifier that really changes something is not dead',
    deadDeclarations(rulesOf('.s--on { color: text; border-color: gold }')[0], base).length === 0)
  check('a property the base never sets is not dead',
    deadDeclarations(rulesOf('.s--on { outline: 1px }')[0], base).length === 0)
  check('with no base rule, nothing is dead',
    deadDeclarations(rulesOf('.s--on { background: c2 }')[0], null).length === 0)

  check('classList.add marks a modifier as co-applied',
    coAppliedModifiers(['button.classList.add "pk-side--chosen"']).has('pk-side--chosen'))
  check('a standalone single-class element is NOT co-applied',
    !coAppliedModifiers(['el "span" "pk-side--none" "no sides"']).has('pk-side--none'),
    'the standalone case is the false positive this check shipped with and had to fix')
  check('two classes in one string are both co-applied',
    coAppliedModifiers(['el "div" "card card--wide"']).has('card--wide'))

  check('the scales glyph is caught', pictographsIn('⚖ tied').length === 1)
  check('an emoji is caught', pictographsIn('a 🏈 b').length === 1)
  check('arrows are ALLOWED — they label the date-nav buttons',
    pictographsIn('← → ↑ ↓').length === 0,
    'the nav controls would be reported as decoration')
  check('ordinary prose is clean', pictographsIn('Rockies @ Diamondbacks, 4-1').length === 0)

  process.exit(summarize() === 0 ? 0 : 1)
}

// ── live ────────────────────────────────────────────────────────────────────

const { check, summarize } = createChecks()

const html = readFileSync('index.html', 'utf8')
const css = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? ''
check('index.html has a stylesheet to read',
  css.length > 0, 'no <style> block found — everything below would pass vacuously')

const rules = rulesOf(css)
check('the stylesheet parsed into rules', rules.length > 20, `${rules.length} rule(s)`)

const rails = rules.filter(r => railOnRoundedBox(r))
check('no coloured rail sits on a rounded box',
  rails.length === 0,
  rails.map(r => `${r.selector} has ${railOnRoundedBox(r)} + border-radius`).join('; '))

const VIEWS = ['src/PickView.fs', 'src/PickemView.fs', 'src/StatsView.fs', 'src/WeatherView.fs',
               'src/BriefsView.fs', 'src/Desk.fs', 'src/Scoreboard.fs', 'src/Program.fs']
const coApplied = coAppliedModifiers(VIEWS.map(f => readFileSync(f, 'utf8')))

const byName = new Map(rules.map(r => [r.selector, r]))
const dead = []
const skipped = []
for (const rule of rules) {
  const base = baseSelectorOf(rule.selector)
  if (!base) continue
  const found = deadDeclarations(rule, byName.get(base))
  if (!found.length) continue
  // A pseudo-class is always co-applied — `:hover` cannot exist without its
  // element. A `--modifier` has to be shown to arrive on top of its base.
  const isPseudo = rule.selector.includes(':')
  if (!isPseudo && !coApplied.has(rule.selector.slice(1))) {
    skipped.push(`${rule.selector} (never co-applied with ${base} in any view)`)
    continue
  }
  for (const prop of found) dead.push(`${rule.selector} restates ${base}'s ${prop}`)
}
check('no state modifier declares a change it does not make',
  dead.length === 0, dead.join('; '))
// Not silently narrow: say what was excused and why, so a modifier that stops
// being emitted does not quietly leave the check's reach.
if (skipped.length) console.log(`      note: ${skipped.length} standalone modifier(s) not compared — ${skipped.join('; ')}`)

const glyphs = []
for (const [label, text] of [
  ['index.html body', html.slice(html.indexOf('<body>'))],
  ...['src/PickView.fs', 'src/PickemView.fs', 'src/StatsView.fs', 'src/WeatherView.fs',
      'src/BriefsView.fs', 'src/Desk.fs', 'src/Prose.fs']
    .map(f => [f, readFileSync(f, 'utf8')]),
]) {
  const found = pictographsIn(text)
  if (found.length) glyphs.push(`${label}: ${[...new Set(found)].join(' ')}`)
}
check('no pictograph is used as a visual asset in a rendered view',
  glyphs.length === 0, glyphs.join('; '))

process.exit(summarize() === 0 ? 0 : 1)
