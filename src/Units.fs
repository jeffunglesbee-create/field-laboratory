module Units

/// Units of measure for the two scales FIELD keeps confusing at runtime.
///
/// This is not decoration. A win-probability scale mismatch — a 0–1 value and a
/// 0–100 value treated as interchangeable floats — genuinely shipped to
/// production earlier this year and had to be caught by a live probe, because
/// nothing in the type system distinguished them. Both were `number`.
///
/// Under `[<Measure>]` they are structurally different types. Combining them
/// without an explicit conversion is a compile error, not a silent wrong
/// number. See docs/UNITS-PROOF.md for the compiler rejecting the real mistake.

/// Probability on the 0.0–1.0 scale. What model outputs and most APIs return.
[<Measure>]
type prob

/// Percentage on the 0.0–100.0 scale. What gets displayed to a human.
[<Measure>]
type pct

/// FIELD drama score, 0–100. Looks exactly like `pct` at runtime and means
/// something entirely different — it is not a probability of anything.
[<Measure>]
type drama

/// The probability implied by a bookmaker's price, *including the overround*.
///
/// Deliberately not `prob`, and this is the point. A two-sided moneyline of
/// -142 / +132 implies 0.587 and 0.431 — which sum to 1.018, not 1. That 1.8%
/// is the book's margin. Treating either number as "the chance this team wins"
/// overstates it, and both look like plain floats in the 0–1 range, so nothing
/// but a type distinguishes them.
///
/// This is the same failure the `prob`/`pct` split already guards, one level
/// deeper: not a scale mismatch but a *meaning* mismatch at the same scale.
[<Measure>]
type implied

/// The only sanctioned way to cross from probability to percentage.
let toPct (p: float<prob>) : float<pct> = p * 100.0<pct/prob>

/// The only sanctioned way back.
let toProb (p: float<pct>) : float<prob> = p / 100.0<pct/prob>

/// Formats a probability for display. Takes `float<prob>` specifically, so
/// handing it an already-scaled 0–100 value cannot compile.
let formatWinProbability (p: float<prob>) : string =
    sprintf "%.0f%%" (float (toPct p))

// There is deliberately no `formatDrama` here.
//
// There was one, and it was the hole. It took a bare `float<drama>` and
// returned a string, so any call site anywhere could render a raw composite
// drama number — which ADR-002 classifies as a bright-line CRITICAL violation
// outside the post-game amnesty zone. The unit of measure stopped a drama score
// being confused with a probability; it did nothing about *where* the number
// was allowed to be displayed, because that is a different question.
//
// The formatter now lives in `Desk` as `formatDramaPeak`, where `GameState` is
// in scope, and it demands an `AmnestyZone` witness that only a Final game can
// produce. Keeping an ungated formatter here as well would reopen the hole,
// since nothing would stop a caller reaching for the easier one.

/// The probability an American moneyline implies, before removing the vig.
///
/// Returns None for a price that is not a valid American moneyline. |ml| < 100
/// is not a price any book quotes, and 0 would imply certainty — surfacing that
/// as None beats computing a confident wrong number from junk.
let impliedOfMoneyline (moneyline: int) : float<implied> option =
    if abs moneyline < 100 then None
    elif moneyline < 0 then
        let m = float (-moneyline)
        Some(m / (m + 100.0) * 1.0<implied>)
    else
        Some(100.0 / (float moneyline + 100.0) * 1.0<implied>)

/// Removes the overround from a two-sided market, yielding probabilities that
/// sum to 1.
///
/// The ONLY sanctioned way to get from `implied` to `prob`. Normalising by the
/// pair's total is the standard proportional method; it is an assumption about
/// how the margin is distributed, not a truth, and it is applied in one place
/// so that assumption has exactly one home.
let devig (home: float<implied>) (away: float<implied>) : (float<prob> * float<prob>) option =
    let total = float home + float away
    if total <= 0.0 then None
    else Some(float home / total * 1.0<prob>, float away / total * 1.0<prob>)
