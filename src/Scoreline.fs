module Scoreline

open System.Text.RegularExpressions

// A score seen during a game and the score a game ended on are not the same
// kind of thing, and this repository's own plan got that wrong.
//
// WHAT THE PLAN SAID, AND WHY IT IS FALSE
//
// `docs/JLAYER-PLAN.md`, Phase 4:
//
//     The exact check this supports has no false positives: a brief saying
//     "Orioles lead 4-2" must match `home_score`/`away_score` on its game row.
//
// It must not. The first three joined briefs in the committed capture disprove
// it outright — every one is written MID-GAME while the row carries the FINAL:
//
//     brief: "Detroit currently leads 4-2."      row: Athletics 6, Tigers 8
//     brief: "this 2-2 tie through three innings" row: Dodgers 2, Red Sox 3
//     brief: "a tight 1-1 deadlock"               row: Angels 1, Brewers 3
//
// Requiring a match would report all three as fabricated. That is not a check
// with no false positives; it is a check that is almost entirely false
// positives, because most briefs are written before the game ends.
//
// THE RELATION THAT ACTUALLY HOLDS
//
// Scores do not decrease. A side that has 4 runs in the sixth cannot have 3 at
// the end. So an observed score is not EQUAL to the final — it is DOMINATED by
// it, per side. "Detroit leads 4-2" against a final of 8-6 is consistent
// (4 <= 8, 2 <= 6). "Detroit leads 9-2" against the same final is impossible,
// and impossible is the only thing worth reporting.
//
// That is a law of how scoring works rather than a heuristic, which is what
// makes the check free of false positives where matching was not.
//
// WHY THIS IS TWO TYPES AND NOT ONE
//
// `Observed` and `Final` are separate private types with no equality between
// them and no way to compare one against the other except `dominates`. The
// mistake the plan made — treating a mid-game score as though it should equal
// the final — is a compile error here rather than a paragraph asking people not
// to make it.
//
// WHAT IS AND IS NOT GUARANTEED
//
//   GUARANTEED. An `Impossible` verdict really is impossible: no assignment of
//   the two claimed numbers to the two sides fits under the final.
//
//   NOT GUARANTEED. That a `Consistent` brief is truthful. A brief may claim a
//   score that never occurred but happens to sit under the final, and this says
//   nothing about player stats, standings or park factors. It checks scorelines
//   against the one fact the game row actually settles.

/// The two sides' scores at some moment during a game, as a brief claims them.
///
/// Deliberately unordered at the type level: a brief may name either side
/// first, and the join carries no reliable way to say which. `dominates` tries
/// both assignments, so an ordering mistake in the prose cannot become a false
/// accusation of fabrication.
type Observed = private Observed of int * int

/// The score a game ended on, from the game row.
type Final = private Final of home: int * away: int

/// Claimed scores are non-negative or they are not scores.
let observed (a: int) (b: int) : Observed option =
    if a < 0 || b < 0 then None else Some(Observed(a, b))

/// `None` when the row has no final — an unfinished or unrecorded game settles
/// nothing, and saying so is the point of the option.
let final (home: int option) (away: int option) : Final option =
    match home, away with
    | Some h, Some a when h >= 0 && a >= 0 -> Some(Final(h, a))
    | _ -> None

let observedPair (Observed(a, b)) = a, b
let finalPair (Final(h, a)) = h, a

/// What a scoreline claim is worth once the final is known.
type Verdict =
    /// Reachable: some assignment of the claim to the two sides sits at or below
    /// the final. Includes the final itself, since a recap states it exactly.
    | Consistent
    /// No assignment fits. The claim describes a game that cannot have ended
    /// the way this one did.
    | Impossible
    /// The row carries no final, so nothing follows. NOT a pass — the whole
    /// reason this case exists is that `Consistent` must never absorb it.
    | Unsettled

/// The relation. Both assignments are tried because the claim is unordered.
let judge (f: Final option) (o: Observed) : Verdict =
    match f with
    | None -> Unsettled
    | Some (Final(h, a)) ->
        let (x, y) = observedPair o
        if (x <= h && y <= a) || (x <= a && y <= h) then Consistent else Impossible

/// Whether a verdict is a finding. `Unsettled` is not — a check that treated
/// "could not tell" as "found something" would be the claim-from-no-data this
/// repository keeps filing against other people's work.
let isFinding (v: Verdict) : bool =
    match v with
    | Impossible -> true
    | Consistent | Unsettled -> false

/// Whether a verdict actually exercised the comparison. Used for non-vacuity:
/// a run where every verdict is `Unsettled` proves nothing and must not read as
/// a pass.
let wasChecked (v: Verdict) : bool =
    match v with
    | Consistent | Impossible -> true
    | Unsettled -> false

// --- the extractor ----------------------------------------------------------
//
// This was JavaScript, in `scripts/scoreline-check.mjs`, while the relation
// above was F#. The card cannot render a per-brief verdict without running the
// extractor at render time, and two implementations of "what counts as a
// scoreline" is exactly the F#/JS split that this repo keeps finding rots. So
// the extractor moves here and the check now imports it: one definition, in the
// language the UI compiles from, consumed by both.
//
// FABLE-SAFE BY CONSTRUCTION. The JS version used a lookbehind to keep `5-5` out
// of `5-5-7`; Fable emits regexes with the `u` flag, under which some patterns
// that are valid in .NET stop compiling, and lookaround is the fragile kind. So
// there is no lookaround here: a maximal run of hyphen-joined numbers is matched
// whole, and only a run of EXACTLY TWO numbers is a candidate. A three-part run
// is a record (`6-5-6`) and is dropped by having three parts, which is the same
// outcome the lookbehind produced and needs no lookbehind to get.

/// One scoreline claim, with the surrounding text that justified reading it as
/// one. The window is what a finding quotes.
type ScorelineClaim = { A: int; B: int; Window: string }

// A run of two-or-more numbers joined by a hyphen or en dash. `[0-9]` not `\d`,
// non-capturing group, literal dashes in a class — nothing the `u` flag rejects.
let private RUN = Regex(@"[0-9]{1,3}(?:[-–][0-9]{1,3})+")

// Words that make a number a scoreline rather than a statistic, and words that
// make it a record however scoreline-shaped it looks. Ported verbatim.
let private CUE =
    Regex(@"\b(leads?|leading|trails?|trailing|tie|tied|deadlock(?:ed)?|won|win|beat|defeat(?:ed)?|ahead|edge[ds]?|up)\b",
          RegexOptions.IgnoreCase)
let private RECORD = Regex(@"\b(record|mark|standings?)\b", RegexOptions.IgnoreCase)

let private WINDOW_BEFORE = 55
let private WINDOW_AFTER = 25

/// A zero-padded component is a calendar date, not a score — `on 08-08`. No one
/// writes a score as "08"; a range would have to guess how large a score can be,
/// and this corpus holds both 1-1 and 96-79.
let private zeroPadded (s: string) = s.Length >= 2 && s.[0] = '0'

/// Every scoreline claim in a brief. Mirrors `scorelinesIn` in the JS check it
/// replaced, string for string on the filters, so the corpus census is
/// unchanged (147 claims, 0 impossible) after the move.
let scorelinesIn (text: string) : ScorelineClaim list =
    [ for m in RUN.Matches text do
        let parts = m.Value.Split([| '-'; '–' |])
        // Exactly two numbers. Three or more is a record, dropped here rather
        // than by a lookbehind.
        if parts.Length = 2 then
            let s = max 0 (m.Index - WINDOW_BEFORE)
            let e = min text.Length (m.Index + m.Length + WINDOW_AFTER)
            let window = text.Substring(s, e - s)
            let parenthesised = m.Index > 0 && text.[m.Index - 1] = '('
            if CUE.IsMatch window
               && not (RECORD.IsMatch window)
               && not (zeroPadded parts.[0]) && not (zeroPadded parts.[1])
               && not parenthesised then
                let collapsed = Regex.Replace(window, @"\s+", " ").Trim()
                yield { A = int parts.[0]; B = int parts.[1]; Window = collapsed } ]

/// The one verdict a card shows for a brief, or `None` when the brief makes no
/// scoreline claim at all — which is not a pass and not a finding, just nothing
/// to say. `Impossible` wins over `Consistent` (one bad claim taints the brief);
/// `Consistent` wins over `Unsettled` (a checked claim beats an unfinished one).
let verdictFor (f: Final option) (text: string) : Verdict option =
    let verdicts =
        scorelinesIn text
        |> List.choose (fun c -> observed c.A c.B |> Option.map (judge f))
    if List.isEmpty verdicts then None
    elif List.contains Impossible verdicts then Some Impossible
    elif List.contains Consistent verdicts then Some Consistent
    else Some Unsettled
