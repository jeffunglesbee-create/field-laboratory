module Ceiling

// A quality bar that no brief can clear, because it was set against a scale the
// scorer cannot reach.
//
// WHAT IS HAPPENING IN PRODUCTION
//
// `field-relay-nba/src/journalism-quality.js` scores prose on the eleven
// dimensions in its SCALE table, totalling 294 points. It DERIVES the reachable
// total rather than stating it: `SLATE_CAPS` asks each game-dependent dimension
// what it returns with no game, and `REACHABLE_CEILING` sums SCALE with those
// caps substituted.
//
// Measured against that module 2026-09-20: NOMINAL_TOTAL 294, REACHABLE_CEILING
// 252. Without a game, `ctx` contributes 0 while `margin` and `finality` ABSTAIN
// AT THE MIDPOINT — 15 of 30 and 10 of 20 — so 42 of 294 points are out of
// reach, and none of the three is unreachable outright.
//
// THIS FILE ONCE SAID 300 AND 245, and the story is the point. The relay's own
// header comment said the same, six lines above the derivation that replaced it;
// this module transcribed that comment in good faith, CEILING-PROOF.md quoted
// this module, and field-laboratory's docs-check.mjs then compared the document
// against the transcription — a copy against a copy — and passed. The relay's
// comment was corrected 2026-09-20 (relay `1334b9d`); these numbers follow it.
//
// `/quality/report` carries a flat bar of 240, reported per brief_type as
// `below_240` / `above_240` and per alert as `below_flat_240_pct`. Measured on
// 2026-08-15 over the previous seven days:
//
//   above_240 = 0        on ALL 25 brief_type/sport rows
//   below_flat_240_pct   = 100 on ALL 10 alerts
//   best brief in window = 230
//
// 240 is 81.6% of 294. It is 95.2% of 252. A bar chosen as "four fifths of the
// scale" became "lose at most twelve points across the dimensions a slate brief
// can reach" the moment the scorer stopped seeing game context — and nothing
// anywhere objected, because in JavaScript both numbers are just `number`.
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
    { Max = 294<point>; Name = "nominal (every dimension in SCALE, with game context)" }

/// What the relay can actually produce. Dim 7 (25) and Dim 10 (30) return N/A
/// and contribute zero, because the worker has no game object.
let relayReachable: Scale<RelayReachable> =
    { Max = 252<point>; Name = "relay (no game context: ctx is 0, margin and finality abstain)" }

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
/// against 294 and a score that tops out at 252.
let passes (Threshold t: Threshold<'tag>) (Score s: Score<'tag>) : bool = s >= t

// --- the finding, as arithmetic ---------------------------------------------

/// What fraction of its OWN scale a threshold demands.
///
/// The number that matters and that nothing in production computes. A bar of
/// 240 demands 0.82 of the nominal scale and 0.95 of the relay's.
let demandedFraction (s: Scale<'tag>) (Threshold t: Threshold<'tag>) : float =
    float t / float s.Max

/// Points of headroom between the bar and the top of its scale.
///
/// On the relay's scale a 240 bar leaves twelve, spread across the dimensions a
/// slate brief can reach — including a 36-point freshness term driven by a
/// third-party word-frequency API, and two agreement dims that abstain halfway.
/// "Reachable in principle" and "reachable" are not the same claim, which is why
/// this returns the margin rather than a verdict.
let headroom (s: Scale<'tag>) (Threshold t: Threshold<'tag>) : int<point> = s.Max - t

/// The bar production actually applies, on the scale it was decided against.
let flatBarAsDecided: Threshold<Nominal> = threshold nominal 240<point>

/// The same 240, named on the scale the relay actually scores on. Building it
/// requires saying so — which is the point. Nothing converts silently.
let flatBarAsApplied: Threshold<RelayReachable> = threshold relayReachable 240<point>
