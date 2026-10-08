module Typography

// FIELD's typography as types, the same way `Palette` does color.
//
// The Semantic Design System v2 makes typography the identity: "Chakra Petch —
// labels, data, badges, headers, scores. Technical. THE identity. DM Sans — body
// text, editorial context." And a hard rule: "Two fonts only. No Playfair, no
// Barlow." Everything else is a per-role spec (weight, size, tracking, case,
// tabular numerals) stated in prose.
//
// AMENDED 2026-10-08: THE SCORE IS NO LONGER CHAKRA PETCH. The v2 prose above
// assigns scores to the identity face; the code now assigns them to DM Sans,
// and the prose is the thing that changed rather than the thing being obeyed.
//
// Why, measured: Chakra Petch ships as static instances only — one file per
// weight on Google Fonts, ten discrete styles on Adobe, no `fvar` axis — so a
// score set in it cannot vary its weight continuously at all. DM Sans ships a
// variable release carrying `wght 100 1000` (v17, confirmed from the Google
// Fonts css2 API for this exact subset URL, which declares `font-weight: 100
// 1000`). The desk self-hosts its faces, so `fonts/dm-sans-variable.woff2`
// replaces `dm-sans-300.woff2` and `dm-sans-400.woff2`: 36,932 bytes for the
// axis against 27,908 for the two instances it supersedes, +9,024 net.
//
// "Two fonts only" is UNBROKEN and that is the point of doing it this way. The
// alternative on the table was Inter Variable or Roboto Flex, which would have
// made `Font` a union of three. Swapping DM Sans's own file for its variable
// cut keeps the union at two and leaves `fontFamily` byte-identical.
//
// `Data` KEEPS Chakra Petch. The v2 line lumps "data" and "scores" together;
// percentages and standings numbers are still identity data and still static.
// Only the game score moved, which is why `Score` is its own role rather than
// a change to `Data`'s font.
//
// Prose is enforced by review, and review is where "two fonts only" quietly
// becomes three and where a score loses its tabular numerals and a column starts
// to jitter. The laboratory encodes the rules instead:
//
//   "two fonts only"        -> `Font` is a closed union of two. A third face is a
//                              compile change forced through every match, not a
//                              CSS import nobody notices.
//   one style per role      -> one exhaustive `styleOf` registry, like `tokenOf`.
//   "no bare font in code"  -> `TypeStyle` seals its fields; a component asks a
//                              role for its style and renders it via `cssFont`,
//                              and cannot spell a font-family or size literal.
//   scores are tabular      -> `Data`'s style carries `TabularNums = true`, and a
//                              check asserts it — a jittering scoreboard column is
//                              a data bug the type makes visible.

/// The two faces, and only two. Chakra Petch is the identity; DM Sans is the
/// reading voice. A third case here would not compile until every match handled
/// it — which is exactly what "two fonts only" should mean.
type Font =
    | ChakraPetch
    | DmSans

let allFonts = [ ChakraPetch; DmSans ]

/// The CSS font stack for a face, WITH a real fallback — a missing web font must
/// degrade to a sane system face, never to a serif the design never chose. This
/// is the sanctioned escape from the type to a string, like `Palette.cssValue`.
let fontFamily (f: Font) : string =
    match f with
    | ChakraPetch -> "'Chakra Petch', ui-sans-serif, system-ui, sans-serif"
    | DmSans -> "'DM Sans', system-ui, -apple-system, sans-serif"

/// Every place text appears on the desk, as a closed set. A new surface picks an
/// existing role; it does not invent a font size inline.
type Role =
    | Label   // round labels, group/section headers, badge text
    | Data    // percentages, standings numbers — NOT the game score, see Score
    | Score   // the game score, and only it: the one role with a weight axis
    | Badge   // CRUNCH TIME, WORTH WATCHING, SCOUT'S PICK
    | Header  // FIELD wordmark, section titles
    | Body    // team names, matchup notes, brief body
    | Context // drama line, tournament brief body, editorial context

let allRoles = [ Label; Data; Score; Badge; Header; Body; Context ]

/// A sealed type style. The representation is private, so component code holds a
/// `Role`, asks `styleOf` for its style, and renders it through `cssFont` — it
/// cannot construct a style from a raw font-family or a magic pixel size. Same
/// seal `Palette.Token` puts on a hex.
type TypeStyle =
    private
        { Font: Font
          Weight: int
          SizePx: float
          TrackingEm: float
          Uppercase: bool
          TabularNums: bool }

/// THE registry. One exhaustive match — a `Role` with no style does not compile.
/// Values are the canonical v2 typography roles.
let styleOf (r: Role) : TypeStyle =
    match r with
    | Label ->   { Font = ChakraPetch; Weight = 600; SizePx = 7.5;  TrackingEm = 0.15; Uppercase = true;  TabularNums = false }
    | Data ->    { Font = ChakraPetch; Weight = 700; SizePx = 13.0; TrackingEm = 0.0;  Uppercase = false; TabularNums = true }
    // SizePx 32.0 is `index.html`'s `.desk-card__score { font-size: 2rem }` at a
    // 16px root, recorded rather than driving: `cssFont` is NOT applied to the
    // score node today — a hand-written rule in index.html is. What this role
    // generates is the FACE (via `--font-score`) and the AXIS (via
    // `scoreAxisCss`). The size is a second seam and it is named here rather
    // than left for the next reader to discover from a number that disagrees.
    | Score ->   { Font = DmSans;      Weight = 700; SizePx = 32.0; TrackingEm = 0.0;  Uppercase = false; TabularNums = true }
    | Badge ->   { Font = ChakraPetch; Weight = 600; SizePx = 7.5;  TrackingEm = 0.12; Uppercase = true;  TabularNums = false }
    | Header ->  { Font = ChakraPetch; Weight = 700; SizePx = 13.0; TrackingEm = 0.26; Uppercase = false; TabularNums = false }
    | Body ->    { Font = DmSans;      Weight = 400; SizePx = 12.0; TrackingEm = 0.0;  Uppercase = false; TabularNums = false }
    | Context -> { Font = DmSans;      Weight = 300; SizePx = 9.0;  TrackingEm = 0.0;  Uppercase = false; TabularNums = false }

/// The face a role is set in. Read through here, since the field is sealed.
let fontOf (r: Role) : Font = (styleOf r).Font

/// Whether a role uses tabular numerals — true for `Data` so numeric columns do
/// not jitter. Exposed so a check can hold the registry to it.
let isTabular (r: Role) : bool = (styleOf r).TabularNums

/// THE LOADED AXIS, and it is a fact about a file rather than a preference.
/// `fonts/dm-sans-variable.woff2` carries `wght` and nothing else — no `wdth`,
/// no `slnt`. A declaration naming an axis the face does not have is not an
/// error the browser reports: it is silently dropped, so the number moves and
/// nothing changes. These bounds are the range the build injects into the
/// `@font-face`, and `scoreAxisCss` is held to them by a check.
let SCORE_WGHT_MIN = 100
let SCORE_WGHT_MAX = 1000

/// The ONLY way a weight becomes a variable-axis declaration. Same seal
/// `cssFont` puts on a font-family: a caller holds a number, asks here, and
/// cannot spell `font-variation-settings` itself.
///
/// `float option -> string option`, and BOTH options are load-bearing.
///
///   IN: `None` is "no reading". A caller with no win probability must not be
///       able to pass a 0.0 that renders as a confident hairline.
///   OUT: `None` is "do not set the property". The caller REMOVES it rather
///       than writing a default — an unreadable input that renders at the base
///       weight is indistinguishable from a calm game, which is the one
///       failure mode worse than a visible fault (Rule 99).
///
/// NaN is rejected explicitly because it is the measured failure, not a
/// hypothetical: `max 100.0 (min 900.0 nan)` is `nan` in .NET — comparisons
/// against NaN are false, so both clamps pass it through — and `'wght' NaN` is
/// an invalid declaration the browser discards, leaving the score at its base
/// weight. Broken would have looked exactly like calm.
///
/// Clamped, not rejected, outside the range: a weight of 1200 is a caller bug
/// but a legible one, and the face would synthesize off the nearest instance
/// rather than report anything.
let scoreAxisCss (wght: float option) : string option =
    match wght with
    | None -> None
    | Some w when System.Double.IsNaN w || System.Double.IsInfinity w -> None
    | Some w ->
        let lo, hi = float SCORE_WGHT_MIN, float SCORE_WGHT_MAX
        let clamped = max lo (min hi w)
        Some (sprintf "font-variation-settings: 'wght' %d" (int (round clamped)))

/// The only way a `TypeStyle` becomes CSS. The sealed fields escape here, as a
/// declaration string and nowhere else.
let cssFont (s: TypeStyle) : string =
    let tnum = if s.TabularNums then "; font-variant-numeric: tabular-nums" else ""
    let tt = if s.Uppercase then "; text-transform: uppercase" else ""
    sprintf "font-family: %s; font-weight: %d; font-size: %gpx; letter-spacing: %gem%s%s"
        (fontFamily s.Font) s.Weight s.SizePx s.TrackingEm tnum tt
