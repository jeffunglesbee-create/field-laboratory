module Corpus

// A score that cannot say which rubric produced it is not comparable to another
// score — and this repository subtracted two of them.
//
// WHAT I DID WRONG EARLIER IN THIS PROJECT
//
// Measuring the `mlb_game` corpus across the `6aed3bb` deploy, I reported:
//
//     stored mean, pre  : 203.2
//     stored mean, post : 135.4
//     stored delta      : -67.8
//
// Both numbers are "quality_score, 0-300". They were produced by DIFFERENT
// RUBRICS — `6aed3bb` redefined Dim 1 per-sentence and clamped Dim 4, which had
// been unbounded. Subtracting them is the same error `Prose.fs` exists to
// document, one level up: `name + numeral` added incommensurable quantities,
// and `score(era2) - score(era3)` subtracts them.
//
// The conclusion drawn at the time — that the drop was formula, not prose —
// happened to be right, and it was right because a SEPARATE experiment rescored
// the same texts under one rubric. The subtraction itself proved nothing. That
// distinction is the whole reason this module exists.
//
// WHY THE ORIGINAL PHASE 2 PLAN COULD NOT BE BUILT
//
// It said: make `unscored` a set difference rather than a nullable column, and
// reproduce production's `unscored_count`. That is unbuildable — `/quality/report`
// reports `unscored_count: 0`, so the difference is EMPTY, and a set difference
// proven on an empty difference proves nothing.
//
// The right difference was one field over. Every row in the corpus carries a
// `quality_score`. NOT ONE carries a `scoring_version`:
//
//     data/jq-mlb-game-corpus.json projects
//       id, date, created_at, quality_score, word_count, source, brief_text
//
// So the non-empty difference is {stored scores} minus {scores whose rubric is
// known}, and for the committed corpus that difference is ALL 592 ROWS.
//
// This is the same shape as `Journalism.AnsweringModel`: a stored value whose
// provenance the store does not record. There it was which model wrote the text.
// Here it is which rubric scored it.
//
// AND LABORATORY GUESSES, IN TWO PLACES
//
// `scripts/ceiling-check.mjs` and `scripts/jq-density-census.mjs` both carry
// `const CUTOFF = '2026-07-16 01:36:49'` and partition by comparing `created_at`
// against it. That is an inference from a timestamp, not a fact from the data,
// and nothing in either file says so. `Attribution` makes it say so.
//
// WHAT IS AND IS NOT GUARANTEED
//
//   GUARANTEED. Two scores from different rubrics cannot be subtracted, added,
//   or compared. An unattributed score cannot become a typed one without saying
//   what attributed it. docs/CORPUS-PROOF.md compiles both.
//
//   NOT GUARANTEED. That any particular row belongs to any particular era. The
//   data does not say, which is the finding.

open Ceiling

// --- which rubric ------------------------------------------------------------

/// Phantom tags, one per scoring era the relay has deployed. No values, no
/// runtime cost — their only job is to make two eras different TYPES.
///
/// Era 2: `6aed3bb`, 2026-07-16T01:36:49Z — Dim 1 redefined per-sentence, Dim 4
/// clamped to [0,1] having been unbounded.
type Era2 = class end

/// Era 3: CC-CMD-2026-08-13-jq-density-unit-fix, 2026-08-13T03:20:00Z — Dim 4's
/// ratio changed from (properNouns+numbers)/sent to numbers/sent.
type Era3 = class end

/// How the rubric behind a score is known.
///
/// `Inferred` carries the basis, so a guess cannot be mistaken for a fact by
/// reading the value alone. Both current call sites guess from a timestamp.
type Attribution =
    /// The row carried `scoring_version`. This is the only trustworthy case, and
    /// no row in the committed corpus is in it.
    | Stamped of version: int
    /// The era was deduced, not read. The string is the deduction.
    | Inferred of basis: string

// --- scores ------------------------------------------------------------------

/// A score as it comes out of the archive: a number, and a story about where its
/// rubric came from.
type StoredScore = private { Value: int<point>; How: Attribution }

let storedScore (value: int<point>) (how: Attribution) : StoredScore =
    { Value = value; How = how }

let rawValue (s: StoredScore) = s.Value
let attributionOf (s: StoredScore) = s.How

/// A score whose rubric is known AT THE TYPE LEVEL.
///
/// Private and phantom-tagged, so the only way to hold one is through a
/// constructor that had to name the era.
type Score<'era> = private Score of int<point>

let scoreValue (Score v: Score<'era>) = v

/// The only constructors. Each demands a `Stamped` attribution matching its own
/// era — an inferred score cannot be promoted, however confident the inference.
let asEra2 (s: StoredScore) : Score<Era2> option =
    match s.How with
    | Stamped 2 -> Some(Score s.Value)
    | _ -> None

let asEra3 (s: StoredScore) : Score<Era3> option =
    match s.How with
    | Stamped 3 -> Some(Score s.Value)
    | _ -> None

/// The subtraction that started this. Both arguments carry `'era`, so the two
/// must come from the same rubric.
///
/// This signature is the module: `difference` cannot be handed an era-2 score
/// and an era-3 score, which is exactly what "-67.8" was.
let difference (Score a: Score<'era>) (Score b: Score<'era>) : int<point> = a - b

/// Mean of scores from ONE rubric. Same reason.
let meanOf (scores: Score<'era> list) : float =
    match scores with
    | [] -> nan
    | _ -> scores |> List.sumBy (fun s -> float (scoreValue s)) |> fun t -> t / float (List.length scores)

// --- the set difference ------------------------------------------------------

/// Scores whose rubric is NOT known — the census that falls out of the types
/// instead of being a query someone remembers to run.
///
/// Returns the rows rather than a count, because a count says a problem exists
/// and nothing else.
let unattributed (scores: StoredScore list) : StoredScore list =
    scores
    |> List.filter (fun s ->
        match s.How with
        | Stamped _ -> false
        | Inferred _ -> true)

/// The bases every inference in a set rests on, distinct.
///
/// If this returns anything at all, that many separate guesses are load-bearing
/// somewhere. It is the list to read before trusting an era-partitioned number.
let inferenceBases (scores: StoredScore list) : string list =
    scores
    |> List.choose (fun s ->
        match s.How with
        | Inferred basis -> Some basis
        | Stamped _ -> None)
    |> List.distinct
