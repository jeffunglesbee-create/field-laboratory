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
