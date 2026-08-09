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

/// The only sanctioned way to cross from probability to percentage.
let toPct (p: float<prob>) : float<pct> = p * 100.0<pct/prob>

/// The only sanctioned way back.
let toProb (p: float<pct>) : float<prob> = p / 100.0<pct/prob>

/// Formats a probability for display. Takes `float<prob>` specifically, so
/// handing it an already-scaled 0–100 value cannot compile.
let formatWinProbability (p: float<prob>) : string =
    sprintf "%.0f%%" (float (toPct p))

/// Formats a drama score. Deliberately cannot accept a probability.
let formatDrama (d: float<drama>) : string =
    sprintf "%.0f" (float d)
