module Typography

// FIELD's typography as types, the same way `Palette` does color.
//
// The Semantic Design System v2 makes typography the identity: "Chakra Petch —
// labels, data, badges, headers, scores. Technical. THE identity. DM Sans — body
// text, editorial context." And a hard rule: "Two fonts only. No Playfair, no
// Barlow." Everything else is a per-role spec (weight, size, tracking, case,
// tabular numerals) stated in prose.
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
    | Data    // scores, percentages, standings numbers
    | Badge   // CRUNCH TIME, WORTH WATCHING, SCOUT'S PICK
    | Header  // FIELD wordmark, section titles
    | Body    // team names, matchup notes, brief body
    | Context // drama line, tournament brief body, editorial context

let allRoles = [ Label; Data; Badge; Header; Body; Context ]

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
    | Badge ->   { Font = ChakraPetch; Weight = 600; SizePx = 7.5;  TrackingEm = 0.12; Uppercase = true;  TabularNums = false }
    | Header ->  { Font = ChakraPetch; Weight = 700; SizePx = 13.0; TrackingEm = 0.26; Uppercase = false; TabularNums = false }
    | Body ->    { Font = DmSans;      Weight = 400; SizePx = 12.0; TrackingEm = 0.0;  Uppercase = false; TabularNums = false }
    | Context -> { Font = DmSans;      Weight = 300; SizePx = 9.0;  TrackingEm = 0.0;  Uppercase = false; TabularNums = false }

/// The face a role is set in. Read through here, since the field is sealed.
let fontOf (r: Role) : Font = (styleOf r).Font

/// Whether a role uses tabular numerals — true for `Data` so numeric columns do
/// not jitter. Exposed so a check can hold the registry to it.
let isTabular (r: Role) : bool = (styleOf r).TabularNums

/// The only way a `TypeStyle` becomes CSS. The sealed fields escape here, as a
/// declaration string and nowhere else.
let cssFont (s: TypeStyle) : string =
    let tnum = if s.TabularNums then "; font-variant-numeric: tabular-nums" else ""
    let tt = if s.Uppercase then "; text-transform: uppercase" else ""
    sprintf "font-family: %s; font-weight: %d; font-size: %gpx; letter-spacing: %gem%s%s"
        (fontFamily s.Font) s.Weight s.SizePx s.TrackingEm tnum tt
