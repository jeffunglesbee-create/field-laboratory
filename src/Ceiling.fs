module Ceiling

// A quality bar that no brief can clear, because it was set against a scale the
// scorer cannot reach.
//
// WHAT IS HAPPENING IN PRODUCTION
//
// `field-relay-nba/src/journalism-quality.js` scores prose on ten dimensions
// totalling 300 points. Its own header states the reachable total:
//
//   "Worker runtime: no localStorage, no DOM, game object not available (relay
//    scores without game context — Dims 7/10 return N/A, ceiling reduces to 245)
//    Ceiling breakdown: 150(base) + 45(arc) + 25(ctx=N/A->0) + 20(temporal) +
//                       30(voice) + 30(matchup=N/A->0) = 245"
//
// So Dim 7 (Context, 25) and Dim 10 (Matchup, 30) are structurally zero — 55 of
// 300 points are unreachable by construction, not by writing badly.
//
// `/quality/report` carries a flat bar of 240, reported per brief_type as
// `below_240` / `above_240` and per alert as `below_flat_240_pct`. Measured on
// 2026-08-15 over the previous seven days:
//
//   above_240 = 0        on ALL 25 brief_type/sport rows
//   below_flat_240_pct   = 100 on ALL 10 alerts
//   best brief in window = 230
//
// 240 is 80% of 300. It is 97.96% of 245. A bar chosen as "four fifths of the
// scale" became "lose at most five points across eight dimensions" the moment
// the scorer stopped seeing game context — and nothing anywhere objected,
// because in JavaScript both numbers are just `number`.
//
// This is the density bug's shape exactly: a value compared against an ideal it
// cannot reach, where the comparison is arithmetically fine and semantically
// empty.
//
// WHAT IS AND IS NOT GUARANTEED
//
//   GUARANTEED BY THE COMPILER. A threshold carries the scale it was set on.
//   Comparing a score against a threshold from a DIFFERENT scale does not
//   type-check, so "240, decided when the ceiling was 300" cannot be silently
//   applied to a score that tops out at 245. docs/CEILING-PROOF.md compiles it.
//
//   NOT GUARANTEED. What the bar SHOULD be. Whether 80% of reachable is the
//   right editorial standard is a judgement about journalism, and no type
//   decides it. This module makes the scale explicit; it does not pick one.

[<Measure>]
type point

// --- scales -----------------------------------------------------------------

/// Phantom tags. They have no values and no runtime cost — their only job is to
/// make two scales different TYPES, so a threshold from one cannot reach a score
/// from the other.
type Nominal = class end

type RelayReachable = class end

/// A scoring scale and its maximum.
///
/// `'tag` is phantom. `Max` is the honest ceiling for that scale — the largest
/// score any input can produce, not the largest the rubric prints on the tin.
type Scale<'tag> = private { Max: int<point>; Name: string }

/// The full ten-dimension rubric, as documented.
let nominal: Scale<Nominal> =
    { Max = 300<point>; Name = "nominal (all ten dimensions, with game context)" }

/// What the relay can actually produce. Dim 7 (25) and Dim 10 (30) return N/A
/// and contribute zero, because the worker has no game object.
let relayReachable: Scale<RelayReachable> =
    { Max = 245<point>; Name = "relay (no game context: Dims 7 and 10 are structurally 0)" }

let maxOf (s: Scale<'tag>) = s.Max
let nameOf (s: Scale<'tag>) = s.Name

/// The points that exist on the rubric but cannot be earned by this scorer.
let unreachable = maxOf nominal - maxOf relayReachable

// --- scores and thresholds --------------------------------------------------

/// A score, tagged with the scale it was produced on.
type Score<'tag> = private Score of int<point>

/// A bar, tagged with the scale it was decided on.
type Threshold<'tag> = private Threshold of int<point>

/// The only way to build a score. Takes the scale, so the tag cannot be chosen
/// by inference at a call site that has forgotten which scorer produced it.
let score (_: Scale<'tag>) (v: int<point>) : Score<'tag> = Score v

/// A bar stated in points, on a named scale.
let threshold (_: Scale<'tag>) (v: int<point>) : Threshold<'tag> = Threshold v

/// A bar stated the way bars are actually decided — "four fifths of the scale".
let atFraction (s: Scale<'tag>) (f: float) : Threshold<'tag> =
    Threshold(int (round (float s.Max * f)) * 1<point>)

let scoreValue (Score v: Score<'tag>) = v
let thresholdValue (Threshold v: Threshold<'tag>) = v

/// Does this brief clear the bar?
///
/// Both arguments carry `'tag`, so the two must come from the same scale. This
/// signature is the whole module: `passes` cannot be handed a threshold decided
/// against 300 and a score that tops out at 245.
let passes (Threshold t: Threshold<'tag>) (Score s: Score<'tag>) : bool = s >= t

// --- the finding, as arithmetic ---------------------------------------------

/// What fraction of its OWN scale a threshold demands.
///
/// The number that matters and that nothing in production computes. A bar of
/// 240 demands 0.80 of the nominal scale and 0.98 of the relay's.
let demandedFraction (s: Scale<'tag>) (Threshold t: Threshold<'tag>) : float =
    float t / float s.Max

/// Points of headroom between the bar and the top of its scale.
///
/// On the relay's scale a 240 bar leaves five, spread across eight dimensions
/// including a 36-point freshness term driven by a third-party word-frequency
/// API. "Reachable in principle" and "reachable" are not the same claim, which
/// is why this returns the margin rather than a verdict.
let headroom (s: Scale<'tag>) (Threshold t: Threshold<'tag>) : int<point> = s.Max - t

/// The bar production actually applies, on the scale it was decided against.
let flatBarAsDecided: Threshold<Nominal> = threshold nominal 240<point>

/// The same 240, named on the scale the relay actually scores on. Building it
/// requires saying so — which is the point. Nothing converts silently.
let flatBarAsApplied: Threshold<RelayReachable> = threshold relayReachable 240<point>
