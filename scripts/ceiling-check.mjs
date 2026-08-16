// The flat 240 bar, measured against the scale the relay can actually reach.
//
// THE CLAIM UNDER TEST
//
// `journalism-quality.js` documents a 300-point rubric and its own reachable
// total: the worker has no game object, so Dim 7 (Context, 25) and Dim 10
// (Matchup, 30) return N/A and contribute zero. 55 of 300 points are unreachable
// by construction.
//
// `/quality/report` applies a flat bar of 240 — reported as `below_240` /
// `above_240` per brief_type and `below_flat_240_pct` per alert.
//
// 240 is 80% of 300 and 97.96% of 245. This measures that against the real
// corpus rather than arguing it.
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
}

check('the corpus is present and the expected size',
  Array.isArray(CORPUS) && CORPUS.length === 592,
  `${Array.isArray(CORPUS) ? CORPUS.length : 'not an array'} brief(s)`)

// ── the two scales ──────────────────────────────────────────────────────────

check('the nominal rubric is 300 points and the relay can reach 245',
  maxOf(nominal) === 300 && maxOf(relayReachable) === 245,
  `${maxOf(nominal)} = ${nameOf(nominal)}; ${maxOf(relayReachable)} = ${nameOf(relayReachable)}`)

// The scale's NAME carries the reason. A ceiling with no stated cause is a
// magic number, and this one exists because of a specific runtime fact.
check('each scale says why it is the size it is',
  /game context/.test(nameOf(nominal)) && /Dims 7 and 10/.test(nameOf(relayReachable)),
  `relay scale: "${nameOf(relayReachable)}"`)

check('55 points are unreachable by construction, not by writing badly',
  unreachable === 55,
  `${unreachable} points — Dim 7 Context (25) + Dim 10 Matchup (30), both N/A without a game object`)

// ── the crux ────────────────────────────────────────────────────────────────
//
// The same number, 240, on two scales. Stated as a comparison rather than a
// bare threshold: the finding is the GAP between what the bar was chosen to
// mean and what it demands.

const asDecided = demandedFraction(nominal, flatBarAsDecided)
const asApplied = demandedFraction(relayReachable, flatBarAsApplied)

check('240 was a four-fifths bar on the scale it was decided against',
  Math.abs(asDecided - 0.8) < 5e-3,
  `${(asDecided * 100).toFixed(2)}% of ${maxOf(nominal)}`)

check('the same 240 demands ~98% of the scale the relay actually scores on',
  asApplied > 0.97 && asApplied < 0.99,
  `${(asApplied * 100).toFixed(2)}% of ${maxOf(relayReachable)} — ` +
  `a bar chosen as four fifths became lose-at-most-${headroom(relayReachable, flatBarAsApplied)}-points`)

check('the headroom on the relay scale is five points across eight dimensions',
  headroom(relayReachable, flatBarAsApplied) === 5,
  `${headroom(relayReachable, flatBarAsApplied)} point(s), including a 36-point freshness term driven by a third-party API`)

// A four-fifths bar, resolved on the right scale, is a different number. This is
// the arithmetic the module exists to make unavoidable — not a recommendation.
const fourFifthsOfReachable = atFraction(relayReachable, 0.8)
check('four fifths of the reachable scale is 196, not 240',
  thresholdValue(fourFifthsOfReachable) === 196,
  `0.8 x ${maxOf(relayReachable)} = ${thresholdValue(fourFifthsOfReachable)}; ` +
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
// Dim 4 some briefs exceeded even the documented 245 ceiling, which is what an
// unbounded term does. The bar was survivable then for an arithmetic reason,
// not an editorial one.
const preAbove245 = pre.filter(r => r.quality_score > 245)
check('the old unclamped formula produced scores above the documented ceiling',
  preAbove245.length > 0,
  `${preAbove245.length} of ${pre.length} pre-cutoff briefs exceed ${maxOf(relayReachable)}, ` +
  `max ${Math.max(...pre.map(r => r.quality_score))} — an unbounded dimension, not better writing`)

// ── the dated observation ───────────────────────────────────────────────────

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
