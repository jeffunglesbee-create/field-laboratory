module Palette

open Units

// FIELD's semantic color system, as types instead of prose.
//
// WHY THIS EXISTS
//
// The FIELD design spec (Semantic Design System v2) states its color rules in
// English, enforced by review: "gold = MUST everywhere", "no raw hex in
// component code", "drama-keyed", "silence is honest for QUIET". Production keeps
// color in several string-keyed maps (SPORT_COLORS, SPORT_ICONS, …) that can and
// do drift apart — the same class of bug the `Sport` union removed here by making
// one exhaustive registry the only source.
//
// The laboratory exists to be better, and "better" for color means the same move
// the desk already made for sports, drama, dates and odds: turn each prose rule
// into an invariant the compiler and `verify` enforce.
//
//   "gold = MUST everywhere"        -> one union, one `tokenOf` registry,
//                                       exhaustive. Not five maps that can
//                                       disagree — one function.
//   "no raw hex in component code"  -> `Token` seals the hex. A component holds a
//                                       Token and renders it, but cannot read or
//                                       spell the string. Same device as
//                                       `SealedDrama`.
//   "drama-keyed"                   -> the drama->color bridge (in Desk) demands
//                                       the `AmnestyZone` witness a live game
//                                       cannot produce, so a live card can never
//                                       be coloured by a drama level the desk
//                                       otherwise seals.
//   two scales, three shared colors -> `dramaScale` takes `float<drama>`,
//                                       `advancementScale` takes `float<pct>`, so
//                                       an advancement percentage cannot be
//                                       bucketed on the drama thresholds (a unit
//                                       mismatch is a compile error).
//   "silence is honest for QUIET"   -> `NoAccent` is a real case, not a default.
//
// This module is the SOURCE of truth; the CSS variables the desk renders are its
// output (via `cssValue`), never hand-copied hex.

/// The five-word vocabulary. Every dimension says the same word — MUST, WATCH,
/// DISCOVERY, CAUTION, QUIET — and each maps to exactly one color. RequireQualified
/// so a bare `Must` cannot drift in from some other module's namesake, the same
/// discipline `Sport` uses.
[<RequireQualifiedAccess>]
type Semantic =
    | Must
    | Watch
    | Discovery
    | Caution
    | Quiet

/// All five, stakes-descending, for exhaustive iteration in checks. Adding a
/// sixth case without adding it here is caught by the same run that checks
/// `tokenOf` — the count must match the registry.
let allSemantics = [ Semantic.Must; Semantic.Watch; Semantic.Discovery; Semantic.Caution; Semantic.Quiet ]

/// A color token. The hex is sealed: the constructor is private, so component
/// code can hold a Token and render it through `cssValue`, but can neither read
/// the hex nor write a literal one. "No raw hex in component code" becomes a type
/// error, not a review note — the same seal `SealedDrama` puts on the drama peak.
type Token = private Token of hex: string

/// The ONLY way a Token becomes a string. The sealed hex escapes here, as a CSS
/// value and nowhere else — the same shape as `barHeightStyle` letting a drama
/// bar out only as a CSS length.
let cssValue (Token hex) = hex

/// THE registry. One exhaustive match, so "gold = MUST everywhere" is true by
/// construction rather than by five maps agreeing. Adding a `Semantic` case
/// without a token here does not compile (FS0025 is an error in this project).
/// Values are the canonical v2 tokens.
let tokenOf (s: Semantic) : Token =
    match s with
    | Semantic.Must -> Token "#c9a84c"      // gold   — CRUNCH TIME / MUST
    | Semantic.Watch -> Token "#4a9eff"     // blue   — worth your time
    | Semantic.Discovery -> Token "#2dd4bf" // teal   — OTA free / discovery
    | Semantic.Caution -> Token "#f59e0b"   // amber  — bracket trap / injury
    | Semantic.Quiet -> Token "#6a6a8a"     // smoke  — low stakes

/// Foundation tokens. Sealed for the same reason the accents are: the background
/// a contrast check measures against must be one named value, not a hex repeated
/// wherever a surface is painted.
let bg = Token "#060514"
let card = Token "#0b0920"
let card2 = Token "#0e0c24"
// `edge = Token "rgba(180,160,255,0.07)"` lived here and was DELETED 2026-08-26.
//
// It rendered at 1.08:1 against every surface it was painted on, and it had
// seventeen uses. Each one was measured and each one resolved:
//
//   3 control outlines        -> edgeStrong (WCAG 1.4.11, a component's edge)
//   4 same-fill boundaries    -> edgeStrong (the sticky bars, the reason pill)
//   2 single boxes            -> edgeStrong (.pick-leader, .pk-banner — their
//                                outline IS their definition, so it must be seen)
//   3 container outlines      -> DELETED; a 1rem grid gap and a landmark region
//                                per card already carried the grouping
//   4 row separators          -> DELETED; the rows' own padding separates them by
//                                16.0 / 16.0 / 19.2 / 22.4 px, measured on the
//                                rendered page, all above the 4px bar
//                                separation-check accepts for the cards
//   1 dead rule (.st-badge)   -> DELETED; nothing had ever emitted it
//
// Nothing needed a hairline that cannot be seen. The token is gone rather than
// left available, because a name meaning "an edge" that measures 1.08:1 is the
// defect this session kept finding, and leaving it in the palette is leaving it
// there to be reached for.

/// An edge that must actually be SEEN. The only edge token there is, since
/// the 1.08:1 `edge` it was introduced beside was deleted the same day.
///
/// RENAMED from `controlEdge` 2026-08-26. It was introduced for three buttons,
/// and a rendered check then found four more elements needing exactly the same
/// thing and none of them a control: the sticky tab bar, the sticky date nav,
/// the sticky sport heading — each sharing the page fill with only an invisible
/// hairline marking where it ends and scrolling content begins — and the reason
/// pills, which sit on a panel of their own colour. A token called `controlEdge`
/// on a heading is a name that disagrees with its measurement.
///
/// WHY A SECOND TOKEN AND NOT A BRIGHTER `edge`. Measured 2026-08-26: `edge`
/// renders at 1.09:1 against `card` and 1.10:1 against `card2` — every boundary
/// in the system, container and control alike, roughly thirty times short of the
/// 3.0:1 WCAG 1.4.11 sets for "visual information required to identify user
/// interface components and states". A button whose edge is invisible is not a
/// button you can find.
///
/// Raising `edge` itself would brighten seventeen uses to fix three, and the
/// three have an external standard behind them while the rest are a taste call.
/// So the token splits by ROLE, the same way `Semantic` does for meaning.
///
/// THE VALUE IS DERIVED, NOT PICKED. It is the darkest point on the existing
/// `dim` -> `quiet` line that clears 3.0 on all three surfaces, so it is the
/// least loud option that passes rather than the first one that looked right:
///
///   #5a5878 (dim)     2.83 / 2.89 / 2.98   fails on card2
///   #646383            3.32 / 3.39 / 3.50   <- this
///   #6a6a8a (quiet)    3.68 / 3.76 / 3.89   passes, and louder than needed
///
/// NOT `quiet`, which also passes: `quiet` is a SEMANTIC — "low stakes" — and
/// borrowing it for chrome is the role conflation this token exists to end.
let edgeStrong = Token "#646383"
let text = Token "#ece8f8"
let dim = Token "#5a5878"

/// `dim`, at the ratio TEXT needs rather than the one a border needs.
///
/// `edgeStrong` above splits `dim` by role for chrome and derives its value
/// against 3.0. That threshold is WCAG 1.4.11 -- NON-text contrast, for UI
/// components and graphical boundaries. It is the right bar for a rule and a
/// hairline, and the wrong one for a word.
///
/// Measured 2026-08-29 on the rendered page at 1440x900: seventeen elements draw
/// TEXT in `dim` at 2.98:1 -- the six tab labels at 12.8px and eleven
/// `.sport-group__title` headings at 12.48px. Both are far below the 18.66px-bold
/// / 24px line where WCAG 1.4.3 relaxes to 3.0, so both need 4.5. `edgeStrong` at
/// 3.52 would not have cleared it either; the token was never aimed at this.
///
/// THE VALUE IS DERIVED THE SAME WAY `edgeStrong` WAS: the darkest point on the
/// existing `dim` -> `quiet` line clearing 4.5 on all three surfaces, so it is
/// the quietest option that passes rather than the first that looked right:
///
///   #5a5878 (dim)     2.98 / 2.89 / 2.83   fails on all three
///   #646383 (edge)    3.52 / 3.40 / 3.33   clears 3.0, not 4.5
///   #6a6a8a (quiet)   3.89 / 3.76 / 3.68   still short
///   #7977a2            4.78 / 4.63 / 4.53   <- this
///
/// NOT a replacement for `dim`. Raising `dim` itself would lift every quiet
/// value on the desk to fix seventeen text nodes, and the rest of those uses are
/// a taste call with no external standard behind them. Same reasoning, and the
/// same split, as `edgeStrong`.
let dimText = Token "#7977a2"
let red = Token "#ef4444"      // live dot / elimination
let violet = Token "#a78bfa"   // rivalry / intelligence

/// The left-border accent for a semantic — FIELD's primary editorial accent.
/// QUIET has NONE: "silence is honest" is a real case here, not `Some smoke` and
/// not a default, so a caller must decide what a border-less card looks like
/// rather than getting a faint grey line by accident.
type Accent =
    | Accent of Token
    | NoAccent

let accentOf (s: Semantic) : Accent =
    match s with
    | Semantic.Quiet -> NoAccent
    | other -> Accent(tokenOf other)

/// The accent as an optional CSS value — Some hex, or None for QUIET's silence.
let accentCss (a: Accent) : string option =
    match a with
    | Accent t -> Some(cssValue t)
    | NoAccent -> None

/// The drama -> semantic scale: >=80 MUST (gold), 60-79 WATCH (blue), <60 QUIET
/// (smoke). Takes `float<drama>` specifically, so an advancement percentage — a
/// different meaning at the same 0-100 scale — cannot be bucketed here without a
/// compile error. Its codomain is deliberately only {Must; Watch; Quiet}: teal
/// DISCOVERY and amber CAUTION come from access and context, not from a drama
/// number, keeping the two axes from bleeding into each other.
///
/// This is pure and public, and safe to be: the only source of a real game's
/// `float<drama>` is `Desk.SealedDrama`, which never unseals outside the amnesty
/// witness. The card-facing bridge that supplies drama color, `Desk.dramaSemantic`,
/// therefore carries the same `AmnestyZone` requirement as the printed peak.
let dramaScale (d: float<drama>) : Semantic =
    if d >= 80.0<drama> then Semantic.Must
    elif d >= 60.0<drama> then Semantic.Watch
    else Semantic.Quiet

/// The advancement scale for tournament probabilities: >=70% gold, 40-69% blue,
/// <40% smoke. Takes `float<pct>`, the display percentage — NOT `float<prob>`
/// (0-1) and NOT `float<drama>` — so the three-color mapping cannot be applied to
/// the wrong quantity. Same three colors as `dramaScale`, deliberately different
/// thresholds; the unit is what stops them being confused.
let advancementScale (p: float<pct>) : Semantic =
    if p >= 70.0<pct> then Semantic.Must
    elif p >= 40.0<pct> then Semantic.Watch
    else Semantic.Quiet

// ---------------------------------------------------------------------------
// Team tints. The HUE of a club's colour, never its hex.
//
// WHY NOT THE ACTUAL COLOUR, WHICH IS WHAT WAS ASKED FOR
//
// Measured 2026-09-01 against `bg` (#060514) across fifteen real club colours:
// THIRTEEN fail WCAG AA for small text and SEVEN fail even the 3.0 floor
// `palette-check` already enforces on every token here.
//
//   Yankees navy #132448  1.32      Astros navy   #002D62  1.49
//   LAFC black   #000000  1.04      Lakers purple #552583  1.90
//   Dodgers blue #005A9C  2.83      Storm green   #2C5234  2.27
//
// Navy on near-black is the ordinary case in American sport, and LAFC's black
// is literally invisible. A page that renders a team name in its own hex is a
// page that hides one team in three.
//
// So the hue survives and the hex does not. `teamTint` holds the hue, clamps
// the saturation, and raises the lightness until the result clears 4.5:1. The
// output is recognisably Dodgers-blue-ish and is NOT Dodgers blue, and every
// caller should say so rather than imply fidelity.
//
// THE SATURATION CAP IS DERIVED, NOT CHOSEN. This palette is semantic — gold
// means MUST, amber means CAUTION, red means wrong — so a decorative colour
// entering the same visual field is the real hazard, larger than legibility.
// The four chromatic semantics measure s=0.54, 0.66, 0.92, 1.00; QUIET smoke is
// 0.13. The cap is the MINIMUM of the chromatic four, computed below from the
// registry itself, so a team tint is always less saturated than any colour that
// carries meaning — and so the rule cannot drift if a semantic is ever retuned.

let private hexToRgb (hex: string) : (float * float * float) option =
    let h = if hex.StartsWith "#" then hex.Substring 1 else hex
    // Hand-rolled rather than System.Uri.IsHexDigit, which Fable does not
    // support — caught by the compiler, which is the point of compiling.
    let isHex (c: char) =
        (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')
    if h.Length <> 6 || not (h |> Seq.forall isHex) then None
    else
        let at i = float (System.Convert.ToInt32(h.Substring(i, 2), 16)) / 255.0
        Some(at 0, at 2, at 4)

let private toHsl (r: float, g: float, b: float) =
    let mx = max r (max g b)
    let mn = min r (min g b)
    let l = (mx + mn) / 2.0
    let d = mx - mn
    if d = 0.0 then (0.0, 0.0, l)
    else
        let s = if l > 0.5 then d / (2.0 - mx - mn) else d / (mx + mn)
        let h =
            if mx = r then ((g - b) / d + (if g < b then 6.0 else 0.0))
            elif mx = g then ((b - r) / d + 2.0)
            else ((r - g) / d + 4.0)
        (h * 60.0, s, l)

let private hueToRgb (p: float) (q: float) (t0: float) =
    let t = if t0 < 0.0 then t0 + 1.0 elif t0 > 1.0 then t0 - 1.0 else t0
    if t < 1.0 / 6.0 then p + (q - p) * 6.0 * t
    elif t < 0.5 then q
    elif t < 2.0 / 3.0 then p + (q - p) * (2.0 / 3.0 - t) * 6.0
    else p

let private fromHsl (h: float, s: float, l: float) =
    if s = 0.0 then (l, l, l)
    else
        let q = if l < 0.5 then l * (1.0 + s) else l + s - l * s
        let p = 2.0 * l - q
        let hk = h / 360.0
        (hueToRgb p q (hk + 1.0 / 3.0), hueToRgb p q hk, hueToRgb p q (hk - 1.0 / 3.0))

let private channel (c: float) =
    if c <= 0.03928 then c / 12.92 else ((c + 0.055) / 1.055) ** 2.4

let private luminance (r, g, b) =
    0.2126 * channel r + 0.7152 * channel g + 0.0722 * channel b

/// WCAG 2.1 contrast between two rgb triples.
let private contrastOf a b =
    let la, lb = luminance a, luminance b
    (max la lb + 0.05) / (min la lb + 0.05)

let private toHex (r: float, g: float, b: float) =
    let byte (c: float) = int (System.Math.Round(min 1.0 (max 0.0 c) * 255.0))
    sprintf "#%02x%02x%02x" (byte r) (byte g) (byte b)

/// Small-text AA. Team names render at the card's body size, not as headings.
let [<Literal>] TEAM_TINT_CONTRAST = 4.5

/// The saturation ceiling, taken from the registry rather than picked: the least
/// saturated CHROMATIC semantic. QUIET smoke (0.13) is excluded because it is the
/// absence of an accent, not one — capping team tints below IT would make every
/// club grey and defeat the point.
let teamTintSaturationCap =
    [ Semantic.Must; Semantic.Watch; Semantic.Discovery; Semantic.Caution ]
    |> List.map (fun s -> let (_, sat, _) = toHsl (Option.get (hexToRgb (cssValue (tokenOf s)))) in sat)
    |> List.min

/// A token's contrast against the LIGHTEST card surface — the one a team name
/// actually sits on, and the one `teamTint` targets.
let contrastWithCard (t: Token) =
    contrastOf (Option.get (hexToRgb (cssValue t))) (Option.get (hexToRgb (cssValue card2)))

/// The hue a token sits at, 0-360. Public for the same reason: "the hue is
/// preserved" is the entire justification for showing a derived colour at all,
/// so it has to be checkable rather than asserted in a comment.
let hueOf (t: Token) =
    let (h, _, _) = toHsl (Option.get (hexToRgb (cssValue t)))
    h

/// A token's saturation, 0-1. Checkable so the registry-derived cap is enforced
/// rather than described.
let saturationOf (t: Token) =
    let (_, s, _) = toHsl (Option.get (hexToRgb (cssValue t)))
    s

/// A club's colour as a legible tint, or None if the input is not a hex.
///
/// `None` is a THIRD STATE and not a fallback: a missing or malformed club
/// colour must render as the ordinary text colour, never as an invented one.
/// Returning a default tint here would put a colour on the page that no source
/// ever supplied, which is the fabrication this project refuses.
let teamTint (brandHex: string) : Token option =
    match hexToRgb brandHex with
    | None -> None
    | Some rgb ->
        let (h, s0, l0) = toHsl rgb
        let s = min s0 teamTintSaturationCap
        // AGAINST THE LIGHTEST SURFACE A TINT CAN LAND ON, not against `bg`.
        //
        // Team names render inside a card — `.desk-card` paints `card`, and a
        // flipped card paints `card2` — so `bg` is the one surface they are
        // never on. Measured 2026-09-01 by a rendered check, which is the only
        // thing that could have caught it: the F# suite measures against `bg`
        // by construction, so it agreed with the bug. Blue Jays derived to
        // #3b78c4, scoring 4.49 on bg and 4.35 on the card it actually sat on.
        //
        // `card2` is the lightest of the three, so clearing it clears all three.
        let surface = Option.get (hexToRgb (cssValue card2))
        // MEASURED AFTER QUANTISATION. The loop used to test the float triple
        // and then round to hex, so a candidate that just cleared 4.5 could land
        // at 4.49 once it became a colour. What renders is the hex, so the hex
        // is what has to clear.
        let rec lift l =
            let hex = toHex (fromHsl (h, s, l))
            match hexToRgb hex with
            | Some q when contrastOf q surface >= TEAM_TINT_CONTRAST -> hex
            | _ when l >= 0.97 -> hex
            | _ -> lift (l + 0.01)
        Some(Token(lift (max l0 0.35)))

/// Perceptual distance between two tints (CIE76 on sRGB->Lab).
///
/// WHY A DISTANCE AND NOT AN EQUALITY CHECK. Two clubs both in shades of red on
/// one card are as confusing as two in the same red; `<>` on the hex would call
/// that fine. The question a reader actually asks is "are these two names
/// different colours", and that is a distance.
let private toLab (r, g, b) =
    let f c = if c > 0.04045 then ((c + 0.055) / 1.055) ** 2.4 else c / 12.92
    let (r', g', b') = (f r, f g, f b)
    // sRGB D65
    let x = (0.4124 * r' + 0.3576 * g' + 0.1805 * b') / 0.95047
    let y = (0.2126 * r' + 0.7152 * g' + 0.0722 * b')
    let z = (0.0193 * r' + 0.1192 * g' + 0.9505 * b') / 1.08883
    let g2 t = if t > 0.008856 then t ** (1.0 / 3.0) else (7.787 * t) + (16.0 / 116.0)
    let (fx, fy, fz) = (g2 x, g2 y, g2 z)
    (116.0 * fy - 16.0, 500.0 * (fx - fy), 200.0 * (fy - fz))

let distance (a: Token) (b: Token) =
    let (l1, a1, b1) = toLab (Option.get (hexToRgb (cssValue a)))
    let (l2, a2, b2) = toLab (Option.get (hexToRgb (cssValue b)))
    sqrt ((l1 - l2) ** 2.0 + (a1 - a2) ** 2.0 + (b1 - b2) ** 2.0)

/// How far apart two tints must be to read as two colours.
///
/// DERIVED FROM THE REGISTRY, not chosen — the same move as the saturation cap.
/// The five semantics are the distances this page already asks a reader to tell
/// apart: gold from amber, blue from teal. The CLOSEST pair among them is the
/// smallest separation this design has already committed to being legible, so
/// two team tints closer than that are closer than anything the page currently
/// expects anyone to distinguish.
let tintSeparationFloor =
    let toks = allSemantics |> List.map tokenOf
    [ for i in 0 .. toks.Length - 1 do
        for j in i + 1 .. toks.Length - 1 -> distance toks.[i] toks.[j] ]
    |> List.min

/// Can these two tints be told apart on one card?
///
/// PAIRWISE, AND THAT IS THE WHOLE POINT. Two clubs sharing a colour only
/// confuse a reader when they appear TOGETHER. A global uniqueness rule drops a
/// club from every matchup to fix the handful where it actually collides — and
/// the desk shows matchups, never a league table, so colour is only ever read in
/// pairs.
let distinguishable (a: Token) (b: Token) = distance a b >= tintSeparationFloor

/// Does this tint read as a COLOUR, or as the ordinary text it sits beside?
///
/// THE AXIS THE PAIRWISE RULE DOES NOT WATCH, found by looking at a screenshot
/// rather than at a number. Sporting Kansas City derived to `#aec7e6`, a pale
/// blue measuring 18.2 against `text` — on the page it read as unstyled, so its
/// partner Vancouver's blue read as EMPHASIS. That is the exact failure the
/// both-or-neither rule exists to prevent, arriving through a door that rule
/// does not cover: it compares the two tints to each other and never to the
/// colour a plain name would have been.
///
/// Same floor, because the question is the same one — can a reader tell these
/// two colours apart — and inventing a second threshold for it would be picking
/// a number to fit an impression.
let readsAsColour (t: Token) = distance t text >= tintSeparationFloor

/// The pair of tints to render for one card, or None if no combination works.
///
/// WHY A CHOICE EXISTS AT ALL. Thirty of the frozen capture's 78 cards render
/// plain for colour reasons alone: twelve where one club's brand is white and so
/// reads as the page's own text, eighteen where both read but are closer than
/// the separation floor. Every club ESPN serves carries a SECOND published
/// colour, and the table had been discarding it. Measured 2026-09-02: taking it
/// per card recovers 27 of those 30.
///
/// THE RULE, STATED: the combination that changes the fewest primaries wins; on
/// a tie, the first-named side keeps its primary. It is stated rather than left
/// to enumeration order because a club appearing in its alternate on one card
/// and its primary on another is a weaker identity signal, and this rule decides
/// how often that happens. The probe that measured this had the rule in a
/// comment and enforced by nothing — with two candidates a side the naive loop
/// emits the right order by accident — so it is a sort here, and asserted.
///
/// NOT A FALLBACK. An alternate is the club's own published colour, so a card
/// that uses it is still showing that club's identity. What it is not allowed to
/// do is invent: when no combination satisfies the three conditions, both sides
/// go plain, which is why Angers v Auxerre — the same two colours in opposite
/// order — stays plain and should.
///
/// The three conditions are unchanged and all three still bind: each side must
/// derive a legible tint, each must read as a colour rather than as the text it
/// replaces, and the two must be tellable apart.
let choosePair (a: string list) (b: string list) : (Token * Token) option =
    let ta = a |> List.map teamTint
    let tb = b |> List.map teamTint
    [ for i in 0 .. List.length ta - 1 do
        for j in 0 .. List.length tb - 1 -> (i, j) ]
    |> List.sortBy (fun (i, j) -> (i + j, i))
    |> List.tryPick (fun (i, j) ->
        match List.item i ta, List.item j tb with
        | Some x, Some y when readsAsColour x && readsAsColour y && distinguishable x y ->
            Some(x, y)
        | _ -> None)
