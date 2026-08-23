// The typography system's runtime invariants, over the real compiled Typography.fs.
//
// proof-check keeps the COMPILER claims honest (sealed style, exhaustive role
// registry, two-fonts-only). This keeps the claims a compiler cannot state
// honest, against build/Typography.js:
//
//   - every role resolves to a style, and to one of exactly two faces; both
//     faces are actually used.
//   - Chakra Petch is the identity: labels, data, badges, headers are set in it;
//     body and context are DM Sans.
//   - Data carries tabular numerals — a scoreboard column that jitters is a data
//     bug, and this makes it a checked fact.
//   - every font stack ends in a real generic fallback, so a missing web font
//     degrades to a sane face, never to a serif the design never chose.
//
// Self-test first: the "ends in a generic family" helper must discriminate, or a
// stack with no fallback would pass.

import { createChecks } from './checks.mjs'
import {
  allFonts, fontFamily, allRoles, styleOf, fontOf, isTabular, cssFont,
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
// known style instead. Label/Badge/Data/Header are Chakra; Body/Context are DM.
const chakraDecls = ROLES.filter(r => fontFamily(fontOf(r)) === CHAKRA).length
const dmDecls = ROLES.filter(r => fontFamily(fontOf(r)) === DM).length
check('four roles are set in Chakra Petch (label, data, badge, header)',
  chakraDecls === 4, `${chakraDecls} role(s) in Chakra Petch`)
check('two roles are set in DM Sans (body, context)',
  dmDecls === 2, `${dmDecls} role(s) in DM Sans`)

// ── Data carries tabular numerals ───────────────────────────────────────────

// The Data role is the Chakra role whose declaration asks for tabular-nums.
const dataRoles = ROLES.filter(r => isTabular(r))
check('exactly one role uses tabular numerals, and it renders them',
  dataRoles.length === 1 && /tabular-nums/.test(cssFont(styleOf(dataRoles[0]))),
  `${dataRoles.length} tabular role(s)`)
check('the tabular role is set in Chakra Petch (scores are identity data)',
  dataRoles.length === 1 && fontFamily(fontOf(dataRoles[0])) === CHAKRA,
  'the numeric role is not the identity face')

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
