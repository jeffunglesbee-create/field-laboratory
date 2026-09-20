// The flat 240 bar, measured against the scale the relay can actually reach.
//
// THE CLAIM UNDER TEST
//
// `journalism-quality.js` derives a nominal rubric total and its own reachable
// total: the worker has no game object, so ctx contributes 0 while margin and
// finality abstain at their midpoints. The difference is unreachable by
// construction.
//
// `/quality/report` applies a flat bar of 240 — reported as `below_240` /
// `above_240` per brief_type and `below_flat_240_pct` per alert.
//
// NO SCALE NUMBER IS WRITTEN DOWN HERE ANY MORE, and that is a correction, not
// a style choice. This file asserted 300 / 245 / 55 / 97.96% / five / 196 as
// literals. Those were the fifth copy of a chain that ran journalism-quality.js
// -> src/Ceiling.fs -> CEILING-PROOF.md -> docs-check.mjs, and when the root
// was corrected to 294 / 252 on 2026-09-20 this file was the one artefact NOT
// updated with the other four — because it had not run in seven CI runs, parked
// behind an unrelated red at step 25. Every condition below now derives from
// the module, so the arithmetic is checked and the transcription is not
// repeated. `claim-check.mjs` owns comparing Ceiling.fs against the relay.
//
// WHAT IS LOCAL AND WHAT IS OBSERVED
//
// The corpus assertions run offline against `data/jq-mlb-game-corpus.json`, 592
// real production briefs. The `/quality/report` figures are a DATED OBSERVATION
// recorded below rather than fetched — this file must run in `verify` with no
// network, and a check that silently skips when the relay is unreachable is the
// failure shape this repo keeps finding. The observation is labelled with its
// date so it reads as evidence with an age, not as a live fact.

import { readFileSync } from 'node:fs'
import { createChecks } from './checks.mjs'
import {
  nominal, relayReachable, maxOf, unreachable,
  score, threshold, atFraction, passes,
  demandedFraction, headroom, flatBarAsApplied, flatBarAsDecided, thresholdValue,
  nameOf, scoreValue,
} from '../build/Ceiling.js'

const { check, summarize } = createChecks()

const CORPUS = JSON.parse(readFileSync('data/jq-mlb-game-corpus.json', 'utf8'))
// The deploy that clamped Dim 4. Scores either side are not the same quantity.
const CUTOFF = '2026-07-16 01:36:49'

// Recorded from /quality/report on 2026-08-15, seven-day window. Kept as data
// with a date on it, not as an assertion about right now.
const OBSERVED_2026_08_15 = {
  rows: 25,
  rowsWithAnyAbove240: 0,
  alerts: 10,
  alertsAtBelowFlat240Pct100: 10,
  bestBriefInWindow: 230,
  // `max_score`, one per brief_type/sport row, verbatim from that response.
  //
  // A per-row MAXIMUM answers more than it looks like it does. If a row's max is
  // below a bar, then NO brief in that row cleared it — exact, not an estimate.
  // If a row's max is at or above a bar, then AT LEAST ONE did. So this settles
  // "does anything clear 240" (no) and "does anything clear four fifths of the
  // reachable scale" (yes) without
  // D1 access, which this repo does not have and should not be given.
  //
  // What it cannot give is a COUNT. "How many briefs clear that" needs the row
  // data, and that stays an open question for the relay's own query.
  maxScorePerRow: [
    122, 125, 130, 130, 148, 132, 171, 135, 179, 156, 148, 148, 153,
    172, 205, 200, 173, 173, 230, 211, 209, 185, 209, 189, 221,
  ],
}

check('the corpus is present and the expected size',
  Array.isArray(CORPUS) && CORPUS.length === 592,
  `${Array.isArray(CORPUS) ? CORPUS.length : 'not an array'} brief(s)`)

// ── the two scales ──────────────────────────────────────────────────────────

check('the relay scale is strictly smaller than the nominal one',
  maxOf(relayReachable) > 0 && maxOf(relayReachable) < maxOf(nominal),
  `${maxOf(nominal)} = ${nameOf(nominal)}; ${maxOf(relayReachable)} = ${nameOf(relayReachable)}`)

// The scale's NAME carries the reason. A ceiling with no stated cause is a
// magic number, and this one exists because of a specific runtime fact.
check('each scale says why it is the size it is',
  /game context/.test(nameOf(nominal)) && /no game context/.test(nameOf(relayReachable)),
  `relay scale: "${nameOf(relayReachable)}"`)

// `unreachable` IS NOT ASSERTED, deliberately, and the same goes for `headroom`
// and `atFraction` below. src/Ceiling.fs:85 defines
// `unreachable = maxOf nominal - maxOf relayReachable`, so a check comparing it
// against that same subtraction compares a value to itself and cannot fail —
// the exact shape of the six vacuous assertions this repo counted on
// 2026-09-05. The first version of this rewrite contained three of them, caught
// by asking whether each could fail rather than by any of them going red.
// Their VALUES still appear, in the detail lines of checks that can.

// ── the crux ────────────────────────────────────────────────────────────────
//
// The same number, 240, on two scales. Stated as a comparison rather than a
// bare threshold: the finding is the GAP between what the bar was chosen to
// mean and what it demands.

const asDecided = demandedFraction(nominal, flatBarAsDecided)
const asApplied = demandedFraction(relayReachable, flatBarAsApplied)

// 240 WAS DECIDED as four fifths of the rubric as it was then documented. The
// rubric has since been measured at ${maxOf(nominal)}, so the bar is no longer
// exactly four fifths of anything — which is why this asserts the NEIGHBOURHOOD
// it was decided in rather than the equality it once had. Tightening this back
// to 0.8 would be re-fitting the check to a number the source no longer holds.
check('240 still sits in the four-fifths neighbourhood of the nominal scale',
  asDecided > 0.75 && asDecided < 0.85,
  `${(asDecided * 100).toFixed(2)}% of ${maxOf(nominal)}`)

// THE FINDING IS THE GAP, not either percentage. Both move when the scales are
// re-measured; the distance between them is what makes the flat bar mean
// something different from what it was chosen to mean.
check('the same 240 demands a far larger share of the scale the relay scores on',
  asApplied - asDecided > 0.1,
  `${(asApplied * 100).toFixed(2)}% of ${maxOf(relayReachable)} vs ` +
  `${(asDecided * 100).toFixed(2)}% of ${maxOf(nominal)} — ` +
  `a bar chosen as four fifths became lose-at-most-${headroom(relayReachable, flatBarAsApplied)}-points`)

// The headroom is the whole margin eight dimensions have to share, and it is
// stated in the detail above rather than asserted here: `headroom s t = s.Max - t`
// (src/Ceiling.fs:132), so there is no second source to compare it against.

// A four-fifths bar, resolved on the right scale, is a different number. This is
// the arithmetic the module exists to make unavoidable — not a recommendation.
const fourFifthsOfReachable = atFraction(relayReachable, 0.8)
const FOUR_FIFTHS = thresholdValue(fourFifthsOfReachable)
// `FOUR_FIFTHS === Math.round(0.8 * max)` is NOT part of this condition:
// `atFraction` is `int (round (Max * f))` (src/Ceiling.fs:104), so that half
// would restate the implementation. What can fail is the ordering — a bar
// chosen as four fifths sitting above four fifths.
check('four fifths of the reachable scale is well below the applied bar',
  FOUR_FIFTHS < thresholdValue(flatBarAsApplied),
  `0.8 x ${maxOf(relayReachable)} = ${FOUR_FIFTHS}; ` +
  `the applied bar is ${thresholdValue(flatBarAsApplied)}`)

// ── measured against the corpus ─────────────────────────────────────────────

const post = CORPUS.filter(r => r.created_at >= CUTOFF && typeof r.quality_score === 'number')
const pre = CORPUS.filter(r => r.created_at < CUTOFF && typeof r.quality_score === 'number')

check('both eras are represented, so neither claim below is vacuous',
  pre.length > 100 && post.length > 100,
  `${pre.length} pre-cutoff, ${post.length} post-cutoff`)

const postMax = Math.max(...post.map(r => r.quality_score))
const postClearing = post.filter(r => passes(flatBarAsApplied, score(relayReachable, r.quality_score)))

check('no brief scored under the current formula clears the flat bar',
  postClearing.length === 0,
  `${postClearing.length} of ${post.length} clear 240; best is ${postMax}, ` +
  `${240 - postMax} short`)

// The pre-cutoff era is the control, and it is the reason this is a threshold
// finding rather than a "briefs got worse" finding: under the OLD unclamped
// Dim 4 some briefs exceeded even the reachable ceiling, which is what an
// unbounded term does. The bar was survivable then for an arithmetic reason,
// not an editorial one.
const preAboveCeiling = pre.filter(r => r.quality_score > maxOf(relayReachable))
check('the old unclamped formula produced scores above the documented ceiling',
  preAboveCeiling.length > 0,
  `${preAboveCeiling.length} of ${pre.length} pre-cutoff briefs exceed ${maxOf(relayReachable)}, ` +
  `max ${Math.max(...pre.map(r => r.quality_score))} — an unbounded dimension, not better writing`)

// ── the dated observation ───────────────────────────────────────────────────

// ── the CC-CMD's own falsifying test, answered ──────────────────────────────
//
// CC-CMD-2026-08-15-quality-bar-scale ships with a query designed to kill its
// own recommendation: if any brief clears 240, the flat bar is a bar and the
// recommendation is wrong; if nothing clears four fifths of reachable either,
// a four-fifths bar
// merely relocates the problem and the CC-CMD is answering the wrong question.
//
// Both halves are settled by the per-row maxima above. Asserted here rather
// than left as arithmetic in a chat log, because a discriminator that only ever
// ran once is the failure this repo keeps filing against other people's work.

const maxima = OBSERVED_2026_08_15.maxScorePerRow

check('the recorded maxima cover every row in the observation',
  maxima.length === OBSERVED_2026_08_15.rows,
  `${maxima.length} maxima for ${OBSERVED_2026_08_15.rows} row(s)`)

const clearing240 = maxima.filter(m => m >= 240)
check('nothing clears the flat bar — exactly, since a row max below it settles the row',
  clearing240.length === 0,
  `0 of ${maxima.length} rows reach 240; best row max ${Math.max(...maxima)}`)

// The discriminator. If this were also zero, the bar is not the problem.
const clearingFourFifths = maxima.filter(m => m >= FOUR_FIFTHS)
check('a four-fifths-of-reachable bar would discriminate, not merely relocate',
  clearingFourFifths.length > 0,
  `${clearingFourFifths.length} of ${maxima.length} rows reach ${FOUR_FIFTHS} ` +
  `(${clearingFourFifths.sort((a, b) => b - a).join(', ')}) — ` +
  `so ${FOUR_FIFTHS} separates rows and ${thresholdValue(flatBarAsApplied)} separates none`)

check('the recorded /quality/report observation is internally consistent',
  OBSERVED_2026_08_15.rowsWithAnyAbove240 === 0 &&
  OBSERVED_2026_08_15.alertsAtBelowFlat240Pct100 === OBSERVED_2026_08_15.alerts &&
  OBSERVED_2026_08_15.bestBriefInWindow < 240,
  `2026-08-15: ${OBSERVED_2026_08_15.rows} rows all above_240=0; ` +
  `${OBSERVED_2026_08_15.alerts}/${OBSERVED_2026_08_15.alerts} alerts at below_flat_240_pct=100; ` +
  `best ${OBSERVED_2026_08_15.bestBriefInWindow}`)

// ── the type argument, exercised ────────────────────────────────────────────
//
// The proof doc shows the compiler REFUSING the cross-scale comparison. This
// shows the same-scale comparison still working, because a type that rejects
// everything would satisfy every proof case and be useless.

const roundTrip = score(relayReachable, postMax)
check('a score and a threshold on the same scale still compare',
  passes(threshold(relayReachable, 100), roundTrip) === true &&
  passes(threshold(relayReachable, 200), roundTrip) === false &&
  scoreValue(roundTrip) === postMax,
  `same-scale comparison is unaffected; the wrapped score reads back as ${scoreValue(roundTrip)}`)

process.exit(summarize() === 0 ? 0 : 1)
