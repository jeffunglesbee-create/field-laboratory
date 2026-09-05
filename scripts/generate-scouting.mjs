// Turn production's imported tables into F# source.
//
// WHY GENERATE RATHER THAN DECODE AT RUNTIME
//
// These are not payloads, they are constants — production ships them inside
// index.html, regenerated weekly by `sync-umpire-abs-ratings.js` from the
// Statcast pipeline's own JSON. Decoding them at run time would put a fetch and
// a failure mode in front of data that cannot change between builds, and this
// repo has already paid for one of those (the weather chip that fetched on page
// load and scored 83).
//
// Generating F# instead means the table is type-checked by the compiler, the
// unknown-tier and unknown-zone cases are FS0025 errors rather than runtime
// surprises, and the whole thing costs nothing at run time.
//
// DETERMINISTIC. Same input JSON always produces byte-identical output — no
// timestamp is baked in — so a week with no real change produces an empty git
// diff. Copied deliberately from production's own generator, which documents
// the same property for the same reason.
//
// WHAT IS DELIBERATELY DROPPED, AND WHY THAT IS THE POINT
//
//   `rate`  — production stores it beside `challenged` and `overturned`, so
//             three fields carry two facts and can disagree. Verified across
//             all 51 imported umpires: `rate` is exactly
//             `round(overturned/challenged, 3)`, every time. So it is computed
//             in F#, not stored, and the disagreement is unrepresentable.
//
//   `tier`  — KEPT, against my first instinct. I tried to derive it from the
//             two factors and got two counterexamples (CHW 95/98 stored
//             `pitcher`, SEA 83/85 stored `extreme_pitcher` — a fifth tier I
//             had not seen). Deriving it would have meant inventing a rule to
//             fit 28 of 30 points, which is production's own Rule 1 failure
//             wearing a different hat. It is data, so it is carried as data.

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'

const OUT = 'src/Scouting.fs'

const park = JSON.parse(readFileSync('data/production-park-factors.json', 'utf8'))
const ump = JSON.parse(readFileSync('data/production-umpire-abs.json', 'utf8'))
const venueNames = JSON.parse(readFileSync('data/production-venue-names.json', 'utf8'))

// ── venue aliases ───────────────────────────────────────────────────────────
//
// The park table and the payloads do not agree on what venues are called. Four
// confirmed disagreements out of thirty, and one of them was found in a fixture
// this repo had already read: the table says "Camden Yards", statsapi says
// "Oriole Park at Camden Yards", production's venue map says "Oriole Park,
// Baltimore".
//
// THE RULE THIS FILE OBEYS: fuzzy matching may raise an alarm, never decide a
// result. Every alias below resolves by EXACT string equality at run time. The
// mechanical rules only propose candidates here, at generation time, where an
// ambiguity is a build failure rather than a silently wrong row.
//
// The reason is not squeamishness. Substring resolution has cost this project
// three separate bugs: production's `teamNick()` drops a whole records line on
// it; a check written in this repo to catch a "+0%" rendering bug was defeated
// because "+0% runs" contains "0% runs"; and a grep for consumers of `tryPark`
// found one only because `tryParkByVenue` contains it.
//
// Renames and genuinely different vocabularies. Each is a fact about the world,
// not a guess, and each says where it came from.
const OVERRIDES = {
  // statsapi's full formal name; the fixture this repo already had.
  'Oriole Park at Camden Yards': 'Camden Yards',
  // production's venue map uses the short formal name + city.
  'Oriole Park, Baltimore': 'Camden Yards',
  'Oriole Park': 'Camden Yards',
  // Guaranteed Rate Field was renamed Rate Field; production's venue map still
  // carries the old name, which is exactly why the old name needs to resolve.
  'Guaranteed Rate Field': 'Rate Field',
  'Guaranteed Rate Field, Chicago': 'Rate Field',
  // The venue map pluralises it; the park table does not. One character, and
  // no rule short of an explicit statement should be trusted to bridge it.
  'Angels Stadium': 'Angel Stadium',
}

// Names that appear in RECORDED CAPTURES but not in production's venue map.
//
// OVERRIDES above only fires for names in `venueNames.names` — production's own
// VENUE_COORDS keys. A venue production has never had coordinates for is
// therefore invisible to it, and `data/brief-join-corpus.json` contains two:
// "Daikin Park" (8 games) and "Field of Dreams" (1).
//
// Same rule as everything else here: a fact about the world, sourced, never a
// guess. Each is asserted against the captures below, so an entry that stops
// occurring is a build failure rather than a line nobody revisits.
const CAPTURE_ONLY = {
  // Houston renamed Minute Maid Park to Daikin Park. Same physical stadium, so
  // the same park factors — the identical case to Guaranteed Rate -> Rate Field
  // above, and an aliasing fix rather than a number to invent.
  'Daikin Park': 'Minute Maid Park',
}

// Venues with NO park factors, which is different from a venue this repo failed
// to cover.
//
// `tryParkByVenue` returning None has meant both things and nothing could tell
// them apart. This names the second kind, the way `tryUmpire` already does for
// umpires ("a real answer, not a missing one") and `Desk.Unmodelled` does for
// sports.
//
// Putting a fabricated 100/100 into the park table to silence a check would be
// inventing exactly the number the alias note refuses to invent.
const NO_PARK_FACTORS = {
  // Dyersville, Iowa. A neutral site MLB has used for a handful of
  // regular-season games; no established park factors exist for it.
  'Field of Dreams': 'neutral site, no established run environment',
  // Williamsport, Pennsylvania. MLB's Little League Classic, one game a year
  // at a Double-A park; no established park factors exist for it. Added
  // 2026-09-05 after `venue-coverage-check` failed on it in
  // data/brief-recency-corpus.json — the same shape as Field of Dreams, and
  // the same refusal to invent a 100/100 to silence the check.
  'Journey Bank Ballpark at Historic Bowman Field':
    'neutral site, no established run environment',
}

// Parks that no imported name reaches, acknowledged rather than discovered
// later. The check below FAILS on any park not listed here and not reachable,
// which is what makes this list the complete statement it looks like.
const NO_IMPORTED_ALIAS = {
  // Confirmed absent from production's venue map, which is also why the
  // Weather tab has no reading for them — recorded already as an open gap.
  'Truist Park': 'not in production\'s VENUE_COORDS at all',
  'Sutter Health Park': 'not in production\'s VENUE_COORDS at all',
  'Target Field': 'not in production\'s VENUE_COORDS at all',
  'PNC Park': 'not in production\'s VENUE_COORDS at all',
  'Citi Field': 'not in production\'s VENUE_COORDS at all',
}

const labels = new Set(Object.values(park.data).map(v => v.label))

/** alias -> park label. Seeded with every label mapping to itself. */
const aliases = new Map([...labels].map(l => [l, l]))
const importedFor = new Map([...labels].map(l => [l, 0]))

const claim = (alias, label, why) => {
  const existing = aliases.get(alias)
  if (existing && existing !== label) {
    console.log(`::error::venue name ${JSON.stringify(alias)} maps to BOTH ` +
      `${JSON.stringify(existing)} and ${JSON.stringify(label)} (${why}). ` +
      `An ambiguous alias would silently pick one park for another's game.`)
    process.exit(1)
  }
  aliases.set(alias, label)
}

for (const name of venueNames.names) {
  if (OVERRIDES[name]) {
    if (!labels.has(OVERRIDES[name]))
      fail(`override ${JSON.stringify(name)} points at ${JSON.stringify(OVERRIDES[name])}, which is not a park label`)
    claim(name, OVERRIDES[name], 'override')
    importedFor.set(OVERRIDES[name], importedFor.get(OVERRIDES[name]) + 1)
    continue
  }
  // Exact, or exact on the segment before the comma — production's venue map
  // carries both "Oracle Park" and "Oracle Park, San Francisco" because both
  // forms appear in real payloads. That is a suffix, not a similarity.
  const stem = name.split(',')[0].trim()
  if (labels.has(name) || labels.has(stem)) {
    const label = labels.has(name) ? name : stem
    claim(name, label, 'exact or city-suffixed')
    importedFor.set(label, importedFor.get(label) + 1)
  }
  // Anything else is not an MLB park — production's venue map also holds
  // soccer, AFL, tennis and golf venues. Unmapped names are not an error, and
  // they are not the risk either: the risk is a PARK with no name reaching it,
  // which is what the check below enumerates.
}

// The invariant, inverted so it is bounded and enumerable. "Did I miss a name?"
// is unanswerable — the set of names payloads may use is open. "Is every one of
// these thirty parks reachable from an imported name?" is a question with
// exactly thirty answers, and it fails loudly on the ones that disagree.
const unreachable = [...labels].filter(l => importedFor.get(l) === 0 && !NO_IMPORTED_ALIAS[l])
if (unreachable.length) {
  for (const l of unreachable) {
    console.log(`::error::no imported venue name reaches ${JSON.stringify(l)} — ` +
      `either add an OVERRIDES entry naming the real-world form, or list it in ` +
      `NO_IMPORTED_ALIAS with the reason it is genuinely absent upstream`)
  }
  process.exit(1)
}
const stale = Object.keys(NO_IMPORTED_ALIAS).filter(l => (importedFor.get(l) ?? 0) > 0)
if (stale.length) {
  // A list of known gaps that has quietly stopped being true is a comment that
  // lies. If production adds the venue, this says so instead of ageing.
  for (const l of stale)
    console.log(`::error::${JSON.stringify(l)} is listed in NO_IMPORTED_ALIAS but an imported name now reaches it — remove the entry`)
  process.exit(1)
}

const TIERS = {
  extreme_pitcher: 'ExtremePitchersPark',
  pitcher: 'PitchersPark',
  neutral: 'NeutralPark',
  hitter: 'HittersPark',
  extreme_hitter: 'ExtremeHittersPark',
}

const ZONES = {
  up: 'Up', down: 'Down', left: 'Left', right: 'Right',
  'up-left': 'UpLeft', 'up-right': 'UpRight',
  'down-left': 'DownLeft', 'down-right': 'DownRight',
}

// A string that cannot be mistaken for F# syntax. Venue labels are plain today;
// a quote or backslash appearing later must not silently produce a file that
// does not compile, or worse, one that does and means something else.
const fsStr = s => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

const fail = msg => { console.log(`::error::${msg}`); process.exit(1) }

const parkRows = Object.entries(park.data)
  .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
  .map(([abbr, v]) => {
    const tier = TIERS[v.tier]
    if (!tier) fail(`unknown park tier ${JSON.stringify(v.tier)} for ${abbr} — add it to ParkTier and to TIERS here`)
    if (!Number.isInteger(v.runFactor) || !Number.isInteger(v.hrFactor))
      fail(`${abbr} has a non-integer factor: runFactor=${v.runFactor} hrFactor=${v.hrFactor}`)
    return `      park ${fsStr(v.label)} ${v.runFactor} ${v.hrFactor} ${tier}`
  })

const umpRows = Object.entries(ump.data)
  .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
  .map(([name, v]) => {
    // Division by zero is the only way `overturnRate` can misbehave, and it is
    // ruled out HERE rather than guarded there — the upstream pipeline already
    // drops anyone under three challenges, so a zero would mean the import
    // itself went wrong and should stop the build.
    if (!Number.isInteger(v.challenged) || v.challenged <= 0)
      fail(`${name} has challenged=${v.challenged}; overturnRate would divide by zero`)
    if (v.overturned > v.challenged)
      fail(`${name} overturned ${v.overturned} of ${v.challenged} — more overturns than challenges`)
    const rounded = Math.round(v.overturned / v.challenged * 1000) / 1000
    if (rounded !== v.rate)
      fail(`${name}: production stores rate ${v.rate} but ${v.overturned}/${v.challenged} = ${rounded}. ` +
           `The rate is computed here, so a table where they disagree must not be generated.`)
    const zone = v.weakness == null
      ? 'None'
      : ZONES[v.weakness]
        ? `Some ${ZONES[v.weakness]}`
        : fail(`unknown weak zone ${JSON.stringify(v.weakness)} for ${name}`)
    return `      umpire ${fsStr(name)} ${v.challenged} ${v.overturned} (${zone})`
  })

// Capture-only names enter the alias table the same way overrides do, through
// `claim`, so an ambiguity is still a build failure.
for (const [name, label] of Object.entries(CAPTURE_ONLY)) {
  if (!labels.has(label))
    fail(`capture-only alias ${JSON.stringify(name)} points at ${JSON.stringify(label)}, which is not a park label`)
  claim(name, label, 'capture-only')
}

// Both lists are claims that these names OCCUR. Verified against the recorded
// captures, so a name that stops appearing is a build failure instead of a line
// that quietly covers for nothing.
{
  const seen = new Set()
  for (const f of readdirSync('data').filter(f => f.endsWith('.json') && !f.startsWith('production-'))) {
    const payload = JSON.parse(readFileSync(`data/${f}`, 'utf8'))
    const groups = payload?.games ?? {}
    const games = Array.isArray(groups) ? groups : Object.values(groups).flat()
    for (const g of games) {
      if (g && g.sport === 'MLB' && typeof g.venue === 'string') seen.add(g.venue)
    }
  }
  for (const name of [...Object.keys(CAPTURE_ONLY), ...Object.keys(NO_PARK_FACTORS)]) {
    if (!seen.has(name)) {
      fail(`${JSON.stringify(name)} is declared here but appears in no recorded capture — ` +
        `delete it, or it is covering for nothing`)
    }
  }
}

const noFactorRows = Object.entries(NO_PARK_FACTORS)
  .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
  .map(([name, why]) => `      // ${why}\n      ${fsStr(name)}`)

const aliasRows = [...aliases.entries()]
  .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
  .map(([alias, label]) => `      ${fsStr(alias)}, ${fsStr(label)}`)

const out = `// GENERATED by scripts/generate-scouting.mjs. Do not edit by hand.
//
// Source: production's own PARK_FACTORS and UMPIRE_ABS_RATINGS, lifted out of
// jubilant-bassoon's index.html — the file that is over the contents-API cap
// and so had to be read from a repository tarball on a runner. Regenerate with:
//
//     node scripts/generate-scouting.mjs
//
// Every value here was cross-checked against a live production render before
// it was carried: Chase Field -1%/-5%, Petco -7%/-9% pitcher, loanDepot 0%/-2%,
// Yankee Stadium +4%/+12%, Jimenez 10 challenged at .5, Parra 4 at .25.
module Scouting

/// How a park plays, as production classifies it.
///
/// Carried, not derived. Two of the thirty parks contradict every rule I could
/// fit to the other twenty-eight (CHW 95/98 is \`pitcher\`, SEA 83/85 is
/// \`extreme_pitcher\`), and fitting a rule to most of the data is how a park
/// factor gets invented.
type ParkTier =
    | ExtremePitchersPark
    | PitchersPark
    | NeutralPark
    | HittersPark
    | ExtremeHittersPark

/// The strike-zone region an umpire is worst in, catcher's-eye view.
type Zone =
    | Up | Down | Left | Right
    | UpLeft | UpRight | DownLeft | DownRight

/// A park factor.
///
/// PRIVATE FIELDS, and this is the whole point rather than decoration.
/// \`Runs\` is a 100-based composite index — 128 for Coors. ADR-002 PROHIBITED #3
/// makes displaying a raw composite a CRITICAL, and production renders
/// "+28% runs" precisely because 128 on its own means nothing to a reader.
///
/// Outside this module the index is not reachable: \`p.Runs\` is FS1093. The
/// only ways out are \`runsDeviation\` and \`hrDeviation\`, which return the
/// signed percentage. The prohibited render is not discouraged here, it is
/// unavailable.
///
/// No \`Abbr\` field. The abbreviation is the table's key in production and is
/// carried in \`data/production-park-factors.json\`, but nothing in this repo
/// reads it — the lookup is by venue name, because that is what the payload
/// has. A field written and never read back is the exact thing
/// \`unused-check.mjs\` exists to catch, so it is not stored.
type ParkFactor =
    private
        { Venue: string
          Runs: int
          HR: int
          Tier: ParkTier }

/// An umpire's ABS challenge record.
///
/// NO STORED RATE. Production's table carries \`challenged\`, \`overturned\` AND
/// \`rate\` — three fields holding two facts, which can drift apart. Verified
/// across all 51 imported umpires that \`rate\` is exactly
/// \`round(overturned / challenged, 3)\`, so it is a function below and the two
/// cannot disagree.
type UmpireRating =
    private
        { Name: string
          Challenged: int
          Overturned: int
          WeakZone: Zone option }

let private park venue runs hr tier =
    { Venue = venue; Runs = runs; HR = hr; Tier = tier }

let private umpire name challenged overturned weak =
    { Name = name; Challenged = challenged; Overturned = overturned; WeakZone = weak }

/// Deviation from league average, which is what a reader is shown.
let runsDeviation (p: ParkFactor) : int = p.Runs - 100
let hrDeviation (p: ParkFactor) : int = p.HR - 100
let venueOf (p: ParkFactor) : string = p.Venue

/// The badge production shows beside an extreme park, if any.
///
/// A function of the tier, so the badge and the classification are one fact.
/// Production keeps \`badgeClass\` as its own field beside \`tier\`.
let parkBadge (p: ParkFactor) : string option =
    match p.Tier with
    | ExtremePitchersPark | PitchersPark -> Some "Pitcher's Park"
    | ExtremeHittersPark | HittersPark -> Some "Launch Pad"
    | NeutralPark -> None

let challengesOf (u: UmpireRating) : int = u.Challenged
let weakZoneOf (u: UmpireRating) : Zone option = u.WeakZone

/// Overturn rate. Computed, never stored — see the type above.
///
/// The generator refuses to emit a row with \`challenged\` at zero, so the
/// denominator is positive by construction rather than by a guard here that
/// would need its own counterexample.
let overturnRate (u: UmpireRating) : float =
    float u.Overturned / float u.Challenged

// Production's UMP WATCH threshold is an overturn rate of 0.65 or higher, and
// twelve of the fifty-one imported umpires clear it. It is recorded here rather
// than implemented: nothing on this page shows that badge yet, and a public
// value nothing reads has never been observed by anything.

let zoneText =
    function
    | Up -> "up" | Down -> "down" | Left -> "left" | Right -> "right"
    | UpLeft -> "up-left" | UpRight -> "up-right"
    | DownLeft -> "down-left" | DownRight -> "down-right"

// --- the tables --------------------------------------------------------------

let parkFactors : ParkFactor list =
    [
${parkRows.join('\n')}
    ]

let umpireRatings : UmpireRating list =
    [
${umpRows.join('\n')}
    ]

/// Look up a park by venue name — which is what the payload actually carries.
///
/// Production reads \`game._homeAbbr || game.homeTeam\` and its own
/// CC-CMD-2026-08-12-scouting-coverage-gaps records two games losing the PARK
/// row to that chain. \`/context/date\` has no abbreviation field at all, but it
/// does carry \`venue\`, and every venue in the recorded captures matches a label
/// in this table exactly. So the row is keyed on the thing the payload has,
/// instead of on a resolution step that can fail.
///
/// Worth recording while looking at this: the table has no \`ATH\` key. The
/// Athletics' factors sit under \`OAK\` against "Sutter Health Park", which is
/// the answer to the open half of that CC-CMD's Gap 1 — the entry exists, the
/// key does not match, and that is an aliasing fix rather than a missing
/// number to invent.
/// Every name a payload is known to use for a park, mapped to that park's label.
///
/// Imported, not invented — built at generation time from production's own
/// \`VENUE_COORDS\` keys and its recorded statsapi fixture. Ambiguity is a build
/// failure, and every park is required to be reachable or explicitly recorded
/// as absent upstream.
let private parkAliases : (string * string) list =
    [
${aliasRows.join('\n')}
    ]

/// Look up a park by venue name — which is what the payload actually carries.
///
/// Production reads \`game._homeAbbr || game.homeTeam\` and its own
/// CC-CMD-2026-08-12-scouting-coverage-gaps records two games losing the PARK
/// row to that chain. \`/context/date\` has no abbreviation field at all, but it
/// does carry \`venue\`, so the row keys on the thing the payload has.
///
/// EXACT equality against the alias table, never a prefix or a contains. An
/// unknown name yields None and the row stays absent — production's Rule 1, and
/// the reason this is not a normaliser.
///
/// Worth recording while looking at this: the table has no \`ATH\` key. The
/// Athletics' factors sit under \`OAK\` against "Sutter Health Park", which is
/// the answer to the open half of that CC-CMD's Gap 1 — the entry exists, the
/// key does not match, and that is an aliasing fix rather than a missing
/// number to invent.
let tryParkByVenue (venue: string) : ParkFactor option =
    parkAliases
    |> List.tryFind (fun (alias, _) -> alias = venue)
    |> Option.bind (fun (_, label) -> parkFactors |> List.tryFind (fun p -> p.Venue = label))

/// Look up an umpire by last name, lowercased — the pipeline's own key shape.
///
/// Most umpires are NOT in this table: production renders Márquez, Libka and
/// Wendelstedt as bare names because they have no entry. That is a real answer,
/// not a missing one, and the caller has to handle it as such.
let tryUmpire (lastName: string) : UmpireRating option =
    umpireRatings |> List.tryFind (fun u -> u.Name = lastName.ToLower())

/// MLB venues that have NO park factors, and are not expected to.
///
/// \`tryParkByVenue\` returning None has meant two different things with nothing
/// to tell them apart: "this repo failed to cover a park it should know" and
/// "no park factors exist for this venue". The first is a gap. The second is
/// the world, and it is the same distinction \`tryUmpire\` makes above.
///
/// Membership is a claim that the venue OCCURS and has no run environment, and
/// the generator fails if a name here appears in no recorded capture.
let venuesWithoutParkFactors : string list =
    [
${noFactorRows.join('\n')}
    ]

/// Whether a venue is known to have no park factors, as opposed to unresolved.
let isKnownUnfactored (venue: string) : bool =
    venuesWithoutParkFactors |> List.exists (fun v -> v = venue)
`

// `--check` regenerates in memory and compares, changing nothing.
//
// Generated source is editable source: nothing stops a hand edit to a park
// factor in `Scouting.fs`, and the compiler would accept it, every check would
// pass, and the page would show a number that is no longer production's. The
// next regeneration would then silently wipe it.
//
// This is what makes "these are production's numbers" a fact about the repo
// rather than a sentence in a comment.
if (process.argv.includes('--check')) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : null
  if (current === out) {
    console.log(`${OUT} matches its generator (${parkRows.length} parks, ${umpRows.length} umpires, ${aliasRows.length} aliases)`)
    process.exit(0)
  }
  console.log(`::error::${OUT} does not match what scripts/generate-scouting.mjs produces from ` +
    `data/production-*.json. Either it was hand-edited, or the imported tables changed and it ` +
    `was not regenerated. Run: node scripts/generate-scouting.mjs`)
  if (current === null) console.log(`::error::${OUT} does not exist at all`)
  process.exit(1)
}

writeFileSync(OUT, out)
console.log(`${OUT}: ${parkRows.length} parks, ${umpRows.length} umpires, ${aliasRows.length} venue aliases`)
console.log(`  every park reachable by an imported name, except ${Object.keys(NO_IMPORTED_ALIAS).length} recorded as absent upstream`)
