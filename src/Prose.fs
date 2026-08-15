module Prose

// The two JQ prose dimensions that measured the wrong quantity for four weeks,
// with the mistake moved from runtime to the compiler.
//
// WHAT HAPPENED
//
// `field-relay-nba/src/journalism-quality.js` scores prose on ten dimensions.
// Two of them — Dim 1 (Specificity, weight 30) and Dim 4 (Density, weight 16) —
// cite `FIELD_PROSE_STYLE`'s rule by name in their own source comments:
//
//   "Each sentence in the brief gets AT MOST ONE number. If a sentence has two,
//    restructure or split. If a sentence has three, you have written a box score
//    with verbs."
//
// The rule governs NUMBERS. Both dimensions measure `properNouns + numbers`.
//
// Sports prose is obligate proper-noun-dense — "Baltimore Orioles pitcher
// Brandon Young faces a lineup" carries three proper nouns and zero numbers, a
// sentence that satisfies the rule perfectly — so the conflated quantity sits
// far above the numbers-only ideal it is compared against. Measured over the
// full `mlb_game` corpus (592 briefs, `data/jq-mlb-game-corpus.json`):
//
//   rawDensity (names+numerals)/sentence   mean 4.42, corpus MINIMUM 1.75
//   the taper peaks at 1.0 and reaches 0 at 3.0
//   Dim 4 at its floor for 91.2% of the corpus
//
// Not a marginal mis-calibration. No brief in 592 is inside the curve's range.
//
// The relay has since fixed it (floored 91.2% -> 7.9%). This module is not that
// fix ported. It is the argument that the mistake should not have been possible
// to write, which is the only claim this repository exists to test.
//
// WHAT IS AND IS NOT GUARANTEED — stated before the code:
//
//   GUARANTEED BY THE COMPILER. `names + numerals` does not type-check. The two
//   counts carry different measures, and F# refuses to add them. The ideal the
//   rule states is `1.0<numeral/sentence>`, so comparing a name-bearing density
//   against it is also refused. docs/PROSE-PROOF.md compiles both.
//
//   NOT GUARANTEED. That the taper's peak is in the right place. Whether ~1
//   numeral per sentence is the correct target for these formats is a judgement
//   about writing, and no type decides it. The redesign's own comment calls 1.9
//   facts/sentence "much closer to ideal" while shipping a curve peaking at 1.0
//   — an unresolved contradiction this module reproduces rather than settles.
//
// So: the UNIT is a compile error, the TARGET is still an opinion.

// --- the two quantities the rule keeps confusing ----------------------------

/// A capitalised token that does not begin its sentence. What the relay calls
/// `properNouns` — team names, player names, venues.
[<Measure>]
type name

/// A token containing a digit. What `FIELD_PROSE_STYLE`'s one-per-sentence rule
/// actually governs, and the minority term in the metric that cites it: across
/// the 592-brief corpus, names outnumber numerals roughly 3 to 2.
[<Measure>]
type numeral

[<Measure>]
type sentence

// --- tokenising, matching the relay exactly ---------------------------------

/// The counts a prose dimension may see.
///
/// Private, so the only way to hold one is `tokenise`. The fields are separate
/// on purpose: a record carrying a single pre-summed `facts` count would make
/// the conflation unrepresentable-in-reverse — impossible to *avoid* rather
/// than impossible to commit.
///
/// `Names` and `Numerals` are counted over the WHOLE text with every sentence's
/// first word excluded globally, while `PerSentence` excludes only each
/// sentence's own first word. That asymmetry is in the relay and is reproduced
/// rather than tidied: the corpus agreement check below is worthless if this
/// module quietly computes something more sensible than the thing it claims to
/// be checking.
type Tokens =
    private
        { Names: int<name>
          Numerals: int<numeral>
          Sentences: int<sentence>
          /// (names + numerals) per sentence — the CONFLATED quantity, kept
          /// because Dim 1 is defined over it. Named for what it is.
          PerSentence: int list }

let private isNameToken (w: string) =
    w.Length > 1 && System.Char.IsUpper w.[0]

let private hasDigit (w: string) =
    w |> Seq.exists System.Char.IsDigit

let private splitWords (s: string) =
    s.Split([| ' '; '\t'; '\n'; '\r' |], System.StringSplitOptions.RemoveEmptyEntries)

/// Exactly the relay's tokenisation. Sentence split on `[.!?]+`, trimmed,
/// keeping only fragments longer than three characters; sentence count floored
/// at 1 so a text with no sentence-length fragment still divides.
let tokenise (text: string) : Tokens =
    let words = splitWords text
    let sentences =
        text.Split([| '.'; '!'; '?' |], System.StringSplitOptions.None)
        |> Array.map (fun s -> s.Trim())
        |> Array.filter (fun s -> s.Length > 3)
    let sentStarts =
        sentences
        |> Array.choose (fun s -> splitWords s |> Array.tryHead)
        |> Set.ofArray
    let names =
        words |> Array.filter (fun w -> isNameToken w && not (sentStarts.Contains w)) |> Array.length
    let numerals = words |> Array.filter hasDigit |> Array.length
    let perSentence =
        sentences
        |> Array.map (fun s ->
            let sw = splitWords s
            let first = Array.tryHead sw
            let n = sw |> Array.filter (fun w -> isNameToken w && Some w <> first) |> Array.length
            let d = sw |> Array.filter hasDigit |> Array.length
            n + d)
        |> List.ofArray
    { Names = names * 1<name>
      Numerals = numerals * 1<numeral>
      Sentences = max 1 sentences.Length * 1<sentence>
      PerSentence = perSentence }

let namesOf (t: Tokens) = t.Names
let numeralsOf (t: Tokens) = t.Numerals
let sentencesOf (t: Tokens) = t.Sentences
let perSentenceOf (t: Tokens) = t.PerSentence

// --- Dim 4: density ---------------------------------------------------------

/// Numerals per sentence — the unit `FIELD_PROSE_STYLE` governs.
let numeralDensity (t: Tokens) : float<numeral/sentence> =
    float t.Numerals / float t.Sentences * 1.0<numeral/sentence>

/// Names per sentence. A real property of the prose, and a different one.
let nameDensity (t: Tokens) : float<name/sentence> =
    float t.Names / float t.Sentences * 1.0<name/sentence>

/// "AT MOST ONE number per sentence", as a value rather than a comment.
let idealNumeralDensity : float<numeral/sentence> = 1.0<numeral/sentence>

/// The relay's taper, dimensionally closed.
///
/// The shipped expression is `1 - |raw - 1| * 0.5` over a bare float. Written
/// with units, `|actual - ideal| * 0.5` carries the measure and cannot be
/// subtracted from a dimensionless 1.0 — so the deviation is expressed relative
/// to the ideal. At `ideal = 1.0` that division is numerically the identity, so
/// this is the same arithmetic; it is simply the form that type-checks, and the
/// fact that the shipped form does NOT type-check is the finding.
let taper (ideal: float<'u>) (actual: float<'u>) : float =
    let deviation = (actual - ideal) / ideal
    max 0.0 (min 1.0 (1.0 - abs deviation * 0.5))

/// Dim 4, on the unit the rule states. Weight 16.
let density (t: Tokens) : float =
    taper idealNumeralDensity (numeralDensity t)

/// The SHIPPED Dim 4, reproduced exactly — including the defect.
///
/// `t.Names / 1<name>` is the canonical unit strip in F#, and it is the whole
/// point of this function: reproducing the relay's behaviour requires two
/// deliberate, visible erasures. Nobody writes that by accident. In JavaScript
/// the same expression is `properNouns.length + numbersAll.length`, which looks
/// like ordinary arithmetic and reads as obviously correct.
///
/// Kept because the corpus agreement check needs it. This is the function whose
/// output must match production; `density` above is what the rule asks for.
let shippedRawDensity (t: Tokens) : float =
    float ((t.Names / 1<name>) + (t.Numerals / 1<numeral>)) / float (t.Sentences / 1<sentence>)

let shippedDensity (t: Tokens) : float =
    let raw = shippedRawDensity t
    max 0.0 (min 1.0 (1.0 - abs (raw - 1.0) * 0.5))

// --- Dim 1: specificity -----------------------------------------------------

/// Dim 1, weight 30. Defined over the conflated per-sentence count, so it
/// inherits the same unit error one dimension over.
///
/// NOT changed to numerals-only here, deliberately. Dim 4 was saturated — one
/// value for 91.2% of the corpus, an instrument returning a constant. Dim 1 is
/// depressed but still discriminating (~7% at its floor, running at about a
/// quarter of its 30-point range), and there is a real argument that
/// "specificity" SHOULD count names. Changing both at once would make the two
/// effects inseparable. The relay reached the same conclusion independently.
let specificity (t: Tokens) : float =
    match t.PerSentence with
    | [] -> 0.0
    | facts ->
        facts
        |> List.sumBy (fun f ->
            if f = 1 then 1.0
            elif f = 2 then 0.6
            elif f = 0 then 0.3
            else max 0.0 (0.3 - float (f - 3) * 0.1))
        |> fun total -> total / float (List.length facts)

// --- weights ----------------------------------------------------------------

/// Not `[<Literal>]`: Fable inlines literals at their use sites and emits no
/// export, so a check cannot read them back. A weight nothing can assert is a
/// number nobody is holding to anything.
let specificityWeight = 30.0

let densityWeight = 16.0
