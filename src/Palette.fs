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
let edge = Token "rgba(180,160,255,0.07)"
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
