// The market-shape model's runtime facts, over the real compiled Market.fs.
//
// proof-check (docs/WP-PROOF.md) keeps the COMPILER claims honest — the two-way
// complement, the two-way accessor on a three-way value, and the untyped
// construction all refuse to build. This keeps the ARITHMETIC of the defect
// honest: on a real de-vigged three-way market, the two-way complement `1 - home`
// equals away + draw, not away — the exact misassignment found in jubilant-bassoon.
//
// Self-test first: the approx helper the checks lean on must be shown to
// discriminate, or every comparison would pass vacuously.

import { createChecks } from './checks.mjs'
import {
  twoWay, threeWay, twoWayHome, twoWayAway,
  threeWayHome, threeWayDraw, threeWayAway,
  awayComplement, devigTwoWay, devigThreeWay,
} from '../build/Market.js'
// The per-card derivation that wires Market onto the desk (0 = absent price).
import { winProbabilityKindFor } from '../build/Desk.js'

const SELF_TEST = process.argv.includes('--self-test')
const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps

if (SELF_TEST) {
  const { check, summarize } = createChecks()
  check('approx is tight enough to tell 0.55 from the two-way complement of 0.45',
    approx(0.55, 0.55) && !approx(0.55, 0.5501, 1e-9),
    'approx would pass values that are not equal — no teeth')
  process.exit(summarize() === 0 ? 0 : 1)
}

const { check, summarize } = createChecks()

// ── constructors validate the sum ────────────────────────────────────────────

check('twoWay accepts a set summing to 1 and refuses one that does not',
  twoWay(0.4, 0.6) !== undefined && twoWay(0.4, 0.5) === undefined,
  `sum-1: ${twoWay(0.4, 0.6) !== undefined}, sum-0.9 refused: ${twoWay(0.4, 0.5) === undefined}`)

check('threeWay accepts a set summing to 1 and refuses one that does not',
  threeWay(0.4, 0.3, 0.3) !== undefined && threeWay(0.4, 0.3, 0.2) === undefined,
  `sum-1: ${threeWay(0.4, 0.3, 0.3) !== undefined}, sum-0.9 refused: ${threeWay(0.4, 0.3, 0.2) === undefined}`)

// ── the two-way complement is correct where it is allowed ────────────────────

const tw = twoWay(0.45, 0.55)
check('awayComplement on a two-way market equals its away side',
  approx(awayComplement(tw), twoWayAway(tw)) && approx(awayComplement(tw), 0.55),
  `complement ${awayComplement(tw)}, away ${twoWayAway(tw)}`)

// ── THE DEFECT, in arithmetic ────────────────────────────────────────────────
//
// A real soccer three-way price: home -110, draw +240, away +260 → implied
// 0.5238 / 0.2941 / 0.2778 (vigged, sums ~1.096). De-vigged, the two-way
// complement of home is NOT the away probability — it is away + draw.
const m = devigThreeWay(0.5238, 0.2941, 0.2778)
const h = threeWayHome(m), d = threeWayDraw(m), a = threeWayAway(m)
const twoWayComplement = 1 - h

check('the de-vigged three-way market sums to 1',
  approx(h + d + a, 1), `sum ${h + d + a}`)

check('the two-way complement (1 - home) folds the draw into away — the client defect',
  approx(twoWayComplement, a + d) && !approx(twoWayComplement, a),
  `1-home=${twoWayComplement.toFixed(4)}, away=${a.toFixed(4)}, away+draw=${(a + d).toFixed(4)}`)

check('so the draw is a real, non-trivial probability the two-way path discards',
  d > 0.2,
  `draw=${d.toFixed(4)} — if this were ~0 the folding would be harmless`)

// ── the two-way path itself still works (the implied/prob tie-in) ────────────

// -142 / +132 → implied 0.587 / 0.431, sums to 1.018 (the vig), de-vigs to a
// two-way market summing to 1 — the laboratory's own README example.
const t2 = devigTwoWay(0.587, 0.431)
check('devigTwoWay normalises a vigged pair into a two-way market summing to 1',
  t2 !== undefined && approx(twoWayHome(t2) + twoWayAway(t2), 1),
  t2 === undefined ? 'refused a valid pair' : `sum ${twoWayHome(t2) + twoWayAway(t2)}`)

// ── the per-card derivation the desk renders ─────────────────────────────────

check('a non-soccer market resolves to a two-way win probability',
  winProbabilityKindFor(false, -142, 0, 132) === 'two-way',
  `got ${winProbabilityKindFor(false, -142, 0, 132)}`)

// THE guarantee: a soccer market with no draw price does NOT fall back to a
// two-way complement — it reports the draw as missing. This is the client defect
// made unrepresentable on the laboratory's own card.
check('a soccer market WITHOUT a draw price refuses two-way and reports draw-missing',
  winProbabilityKindFor(true, -110, 0, 130) === 'draw-missing',
  `got ${winProbabilityKindFor(true, -110, 0, 130)} — a two-way fallback would fold the draw into away`)

check('a soccer market WITH a draw price resolves to a three-way win probability',
  winProbabilityKindFor(true, -110, 240, 260) === 'three-way',
  `got ${winProbabilityKindFor(true, -110, 240, 260)}`)

check('no usable prices resolves to none',
  winProbabilityKindFor(false, 0, 0, 0) === 'none',
  `got ${winProbabilityKindFor(false, 0, 0, 0)}`)

process.exit(summarize() === 0 ? 0 : 1)
