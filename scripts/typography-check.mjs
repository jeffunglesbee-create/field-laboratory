// The typography system's runtime invariants, over the real compiled Typography.fs.
//
// proof-check keeps the COMPILER claims honest (sealed style, exhaustive role
// registry, two-fonts-only). This keeps the claims a compiler cannot state
// honest, against build/Typography.js:
//
//   - every role resolves to a style, and to one of exactly two faces; both
//     faces are actually used.
//   - Chakra Petch is the identity: labels, data, badges, headers are set in it;
//     body, context AND THE SCORE are DM Sans (amended 2026-10-08).
//   - the numeric roles carry tabular numerals — a scoreboard column that
//     jitters is a data bug, and this makes it a checked fact.
//   - the Score role is on the variable face and its base weight agrees with
//     index.html's axis default, because those are two numbers that have to
//     match and nothing else was holding them together.
//   - every font stack ends in a real generic fallback, so a missing web font
//     degrades to a sane face, never to a serif the design never chose.
//
// Self-test first: the "ends in a generic family" helper must discriminate, or a
// stack with no fallback would pass.

import { createChecks } from './checks.mjs'
import { readFileSync } from 'node:fs'
import {
  allFonts, fontFamily, allRoles, styleOf, fontOf, isTabular, cssFont,
  scoreAxisCss, SCORE_WGHT_MIN, SCORE_WGHT_MAX,
} from '../build/Typography.js'

const SELF_TEST = process.argv.includes('--self-test')

const GENERICS = ['sans-serif', 'serif', 'monospace', 'system-ui', 'ui-sans-serif', 'ui-monospace', 'cursive']
const endsInGeneric = stack => {
  const last = stack.split(',').pop().trim().toLowerCase()
  return GENERICS.includes(last)
}

if (SELF_TEST) {
  const { check, summarize } = createChecks()
  check('endsInGeneric accepts a stack with a generic fallback and rejects one without',
    endsInGeneric("'Chakra Petch', ui-sans-serif, sans-serif") &&
    !endsInGeneric("'Chakra Petch'"),
    'the fallback detector does not discriminate')
  process.exit(summarize() === 0 ? 0 : 1)
}

const { check, summarize } = createChecks()

const FONTS = Array.from(allFonts)
const ROLES = Array.from(allRoles)

// ── two fonts only, both used ───────────────────────────────────────────────

check('there are exactly two faces',
  FONTS.length === 2, `${FONTS.length} face(s)`)

const familiesUsed = new Set(ROLES.map(r => fontFamily(fontOf(r))))
const familiesDeclared = new Set(FONTS.map(fontFamily))
check('every role uses one of the two declared faces',
  [...familiesUsed].every(f => familiesDeclared.has(f)),
  `used: ${[...familiesUsed].length}, declared: ${[...familiesDeclared].length}`)
check('both faces are actually used by some role',
  familiesUsed.size === 2, `${familiesUsed.size} face(s) in use`)

// ── one style per role, and it renders ──────────────────────────────────────

check('styleOf gives every role a non-empty CSS declaration',
  ROLES.every(r => /font-family:/.test(cssFont(styleOf(r)))),
  'a role produced no font-family')

// ── Chakra Petch is the identity; DM Sans is the reading voice ───────────────

const CHAKRA = fontFamily(FONTS.find(f => fontFamily(f).includes('Chakra Petch')))
const DM = fontFamily(FONTS.find(f => fontFamily(f).includes('DM Sans')))

// Roles have no stable JS name across the Fable boundary; identify them by their
// known style instead. Label/Badge/Data/Header are Chakra; Body/Context/Score
// are DM.
//
// AMENDED 2026-10-08. These two counts were 4 and 2 and asserted that the score
// was Chakra. They are 4 and 3 now, and the count that moved is DM's: `Score`
// is a NEW role, so Chakra keeps all four it had. A reader seeing 4 unchanged
// should not conclude nothing moved — `Data` kept Chakra, and the score is no
// longer `Data`.
const chakraDecls = ROLES.filter(r => fontFamily(fontOf(r)) === CHAKRA).length
const dmDecls = ROLES.filter(r => fontFamily(fontOf(r)) === DM).length
check('four roles are set in Chakra Petch (label, data, badge, header)',
  chakraDecls === 4, `${chakraDecls} role(s) in Chakra Petch`)
check('three roles are set in DM Sans (body, context, score)',
  dmDecls === 3, `${dmDecls} role(s) in DM Sans`)

// ── the numeric roles carry tabular numerals ────────────────────────────────

// TWO tabular roles now, not one: `Data` (percentages, standings) and `Score`.
// The previous form asserted `length === 1`, which was the fact that made the
// old single-tabular-role identity test possible; with two, the test that still
// means something is that EVERY tabular role actually renders them.
const dataRoles = ROLES.filter(r => isTabular(r))
check('two roles use tabular numerals, and both render them',
  dataRoles.length === 2 && dataRoles.every(r => /tabular-nums/.test(cssFont(styleOf(r)))),
  `${dataRoles.length} tabular role(s), ${dataRoles.filter(r => /tabular-nums/.test(cssFont(styleOf(r)))).length} rendering`)

// ── the score is on the variable face, and only the score ───────────────────

// REPLACES "the tabular role is set in Chakra Petch (scores are identity data)".
// That assertion was the design decision, and the design changed: Chakra Petch
// ships static instances only, so a score set in it cannot vary its weight.
// What must hold now is the inverse — exactly one tabular role is on DM Sans
// (the score) and exactly one is still on Chakra (Data).
const tabularOnDm = dataRoles.filter(r => fontFamily(fontOf(r)) === DM)
const tabularOnChakra = dataRoles.filter(r => fontFamily(fontOf(r)) === CHAKRA)
check('exactly one tabular role is on DM Sans — the score, which needs the wght axis',
  tabularOnDm.length === 1, `${tabularOnDm.length} tabular role(s) on DM Sans`)
check('exactly one tabular role is still on Chakra Petch — Data did not move',
  tabularOnChakra.length === 1, `${tabularOnChakra.length} tabular role(s) on Chakra Petch`)

// ── the axis escape refuses rather than defaulting ──────────────────────────

// `scoreAxisCss` is the ONLY door from a number to font-variation-settings, and
// its dangerous failure is not a crash — it is returning a string for an input
// that was never a reading, so an unreadable win probability renders at the base
// weight and looks exactly like a calm game (Rule 99).
check('no reading yields no declaration', scoreAxisCss(undefined) === undefined,
  'a missing weight produced a declaration')
check('NaN yields no declaration', scoreAxisCss(NaN) === undefined,
  'NaN produced a declaration — and `wght NaN` is dropped by the browser, leaving the base weight')
check('Infinity yields no declaration', scoreAxisCss(Infinity) === undefined, 'Infinity produced a declaration')
check('a real weight emits one wght axis and nothing else',
  scoreAxisCss(420) === "font-variation-settings: 'wght' 420",
  `got ${JSON.stringify(scoreAxisCss(420))}`)
check('a weight below the loaded range clamps to the floor, not to zero',
  scoreAxisCss(-50) === `font-variation-settings: 'wght' ${SCORE_WGHT_MIN}`, `got ${JSON.stringify(scoreAxisCss(-50))}`)
check('a weight above the loaded range clamps to the ceiling',
  scoreAxisCss(4000) === `font-variation-settings: 'wght' ${SCORE_WGHT_MAX}`, `got ${JSON.stringify(scoreAxisCss(4000))}`)
check('the axis names wght and no axis the file does not carry',
  !/wdth|slnt|opsz/.test(scoreAxisCss(500) || ''),
  'the declaration names an axis dm-sans-variable.woff2 does not have, which the browser drops silently')

// ── the page's axis default equals the role's weight ────────────────────────

// Two numbers that have to agree and had nothing holding them together: the
// role's `Weight` and index.html's `font-variation-settings: 'wght' N` on
// .desk-card__score. index.html is read as TEXT here on purpose — the built
// page is a copy, and the question is what the source says.
{
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  const m = html.match(/\.desk-card__score\s*\{[^}]*font-variation-settings:\s*'wght'\s*(\d+)/)
  const pageWeight = m ? Number(m[1]) : null
  const roleDecl = cssFont(styleOf(tabularOnDm[0] ?? ROLES[0]))
  const roleWeight = Number((roleDecl.match(/font-weight:\s*(\d+)/) || [])[1])
  check('index.html sets the score weight through the axis, not font-weight',
    pageWeight !== null, 'no font-variation-settings wght found on .desk-card__score')
  check('the page axis default equals the Score role weight',
    pageWeight === roleWeight, `page ${pageWeight} vs role ${roleWeight}`)
  check('the score rule carries no font-weight literal to beat the axis in the cascade',
    !/\.desk-card__score\s*\{[^}]*font-weight:/.test(html),
    'a font-weight literal survives on .desk-card__score and would win over a driver\'s axis')
}

// ── every font stack has a real fallback ────────────────────────────────────

for (const f of FONTS) {
  const stack = fontFamily(f)
  check(`font stack ends in a generic fallback: ${stack.split(',')[0]}`,
    endsInGeneric(stack), stack)
}

// ── uppercase roles actually emit the transform ─────────────────────────────

const upperDecls = ROLES.map(r => cssFont(styleOf(r))).filter(d => /text-transform: uppercase/.test(d))
check('the label/badge roles emit an uppercase transform',
  upperDecls.length >= 2, `${upperDecls.length} uppercase role(s)`)

process.exit(summarize() === 0 ? 0 : 1)
