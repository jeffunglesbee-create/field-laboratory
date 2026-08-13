// Pull the real scouting tables out of production, so laboratory can carry
// them instead of rendering UNRESOLVED next to five rows a day.
//
// WHY THIS EXISTS AS A SCRIPT ON A RUNNER
//
// `docs/PRODUCTION-CLAIMS.md` said for two days that no function body from
// production had ever been read, and named the 1 MB contents-API cap as the
// reason. That was true of ONE route. The FIELD relay exposes `read_source`
// and `read_lines` as well, and those read production's modular `src/` fine —
// `src/utils/venues.js`, `scripts/mlb-weekly-update.py`, and every doc came
// back in full. What is genuinely over the cap is exactly two files:
// `index.html` and `src/legacy/field.js`, both of which return
// `total_lines: 1` and empty content through every route.
//
// Those two files are where PARK_FACTORS and UMPIRE_ABS_RATINGS live. So the
// cap is real — but it is a cap on the *contents API*, not on the repository.
// `get_archive_url` mints a signed tarball URL, and a runner has the open
// egress to fetch it that this sandbox does not (`*.workers.dev` is 403 at the
// proxy, confirmed twice today).
//
// That is the whole trick: stop asking the API one question at a time and put
// the repository somewhere a grep can reach it.
//
// NO FALLBACKS. Every extraction either produces the real table or exits
// non-zero naming what it could not find. A partial table silently written
// would be worse than the UNRESOLVED badges it is meant to replace, because
// UNRESOLVED at least tells the reader it does not know.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const args = process.argv.slice(2)
const arg = name => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? null : args[i + 1]
}

const SRC = arg('from') || 'production/index.html'
const OUT = arg('out') || 'data'

// The venue-name sources. Both REQUIRED, not optional-with-a-skip: the whole
// point is that the alias set is imported rather than typed, and a run that
// quietly produced no aliases would leave the park lookup exactly as fragile as
// it was while looking like it had been fixed.
const VENUES = arg('venues') || 'production/src/utils/venues.js'
const FIXTURE = arg('fixture') || 'production/docs/adapter-fixtures-mlb-ok.json'

/**
 * Read one JS object literal by brace-matching from its declaration.
 *
 * Deliberately the same technique production's own `sync-umpire-abs-ratings.js`
 * uses on this same file, and for the reason its comment gives: a regex stops
 * at the first `}` it sees, so a nested object truncates the table and the
 * result still parses. A short table that parses is the exact shape of a bug
 * this repo would not catch — it would just render fewer rows.
 */
const objectLiteralAfter = (text, declaration) => {
  const start = text.indexOf(declaration)
  if (start === -1) return { error: `\`${declaration}\` does not appear in the file` }

  let i = text.indexOf('{', start)
  if (i === -1) return { error: `\`${declaration}\` has no opening brace` }

  const open = i
  let depth = 0
  let inString = null
  for (; i < text.length; i++) {
    const c = text[i]
    if (inString) {
      if (c === '\\') { i++; continue }
      if (c === inString) inString = null
      continue
    }
    if (c === '"' || c === "'" || c === '`') { inString = c; continue }
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return { literal: text.slice(open, i + 1) }
    }
  }
  return { error: `\`${declaration}\` is never closed — brace depth ${depth} at end of file` }
}

/**
 * Evaluate the literal in a locked-down context.
 *
 * `new Function` would give the slice the whole global scope. This is a table
 * of numbers from a repo I trust, but "I trust it" is not a mechanism, and the
 * one thing this script exists to do is turn assumptions into artifacts. An
 * empty prototype-less context with a 2s ceiling means a slice that turns out
 * not to be a plain literal fails here rather than doing something.
 */
const evaluate = (literal, label) => {
  try {
    const value = runInNewContext(`(${literal})`, Object.create(null), { timeout: 2000 })
    if (!value || typeof value !== 'object') return { error: `${label} did not evaluate to an object` }
    const n = Object.keys(value).length
    if (n === 0) return { error: `${label} evaluated to an EMPTY object` }
    return { value, n }
  } catch (e) {
    return { error: `${label} did not evaluate: ${e.message}` }
  }
}

/**
 * Report every place a symbol appears with the surrounding text.
 *
 * `index.html` is a single 1-line file, so `grep -n` gives one useless hit and
 * `sed -n 'A,Bp'` gives the whole file. Context has to come from character
 * offsets. This is how the endpoint wiring gets read — which URL production
 * actually calls for standings and probable pitchers is the other half of the
 * UNRESOLVED problem, and no amount of table data answers it.
 */
const contextsOf = (text, symbol, radius = 420, limit = 6) => {
  const out = []
  let from = 0
  while (out.length < limit) {
    const i = text.indexOf(symbol, from)
    if (i === -1) break
    out.push({
      offset: i,
      excerpt: text.slice(Math.max(0, i - radius), i + radius).replace(/\s+/g, ' ').trim(),
    })
    from = i + symbol.length
  }
  return out
}

// ── run ─────────────────────────────────────────────────────────────────────

const text = readFileSync(SRC, 'utf8')
console.log(`read ${SRC} — ${text.length} bytes, ${text.split('\n').length} line(s)`)

const failures = []

const TABLES = [
  { decl: 'const PARK_FACTORS = {', name: 'PARK_FACTORS', file: 'production-park-factors.json', floor: 20 },
  { decl: 'const UMPIRE_ABS_RATINGS = {', name: 'UMPIRE_ABS_RATINGS', file: 'production-umpire-abs.json', floor: 10 },
]

mkdirSync(OUT, { recursive: true })

for (const t of TABLES) {
  const found = objectLiteralAfter(text, t.decl)
  if (found.error) { failures.push(found.error); continue }

  const evaluated = evaluate(found.literal, t.name)
  if (evaluated.error) { failures.push(evaluated.error); continue }

  // A floor, because the failure this guards against is a table that extracts
  // to three entries and looks fine. Production renders a PARK row for most of
  // a 15-game slate, so a park table under 20 keys did not extract properly.
  if (evaluated.n < t.floor) {
    failures.push(`${t.name} extracted only ${evaluated.n} entries, expected at least ${t.floor}`)
    continue
  }

  writeFileSync(`${OUT}/${t.file}`, JSON.stringify(
    { source: 'jubilant-bassoon index.html', symbol: t.name, entries: evaluated.n, data: evaluated.value },
    null, 2) + '\n')
  console.log(`  ${t.name}: ${evaluated.n} entries -> ${OUT}/${t.file}`)
  console.log(`    sample: ${JSON.stringify(Object.entries(evaluated.value).slice(0, 3))}`)
}

// The endpoint wiring. Not a table — the answer to "where do the pitcher and
// records rows come from", which the recorded /context/date captures in this
// repo do not contain at all (standings is `[]`, and there is no pitcher key).
const WIRING = [
  'MLB_STATS_BASE', 'MLB_STATS_RELAY',
  'fetchMLBStandingsParsed', 'fetchMLBSchedule',
  'probablePitcher', 'hydrate=', '/standings',
  'getUmpireABSRating', 'getParkFactor', 'teamNick',
]

const wiring = {}
for (const symbol of WIRING) {
  const hits = contextsOf(text, symbol)
  wiring[symbol] = hits
  console.log(`  wiring ${symbol}: ${hits.length} occurrence(s)`)
}
writeFileSync(`${OUT}/production-wiring.json`, JSON.stringify(wiring, null, 2) + '\n')

// --- venue-name variants ----------------------------------------------------
//
// The park lookup keys on the venue name the payload carries, and the payload
// does not agree with production's park table about what venues are called.
// Four confirmed disagreements out of thirty: the table says "Camden Yards"
// while statsapi says "Oriole Park at Camden Yards" and production's own venue
// map says "Oriole Park, Baltimore"; "Rate Field" vs "Guaranteed Rate Field";
// "Angel Stadium" vs "Angels Stadium"; "Progressive Field" vs
// "Progressive Field, Cleveland".
//
// The tempting fix is to normalise — strip the suffix, fuzzy-match the stem.
// That is substring matching, which is the single failure this project keeps
// paying for: production's `teamNick()` drops a records line on it, and a check
// written HERE to catch a "+0%" bug was itself defeated by "+0% runs"
// containing "0% runs".
//
// So the alias set is IMPORTED instead of inferred. `VENUE_COORDS` in
// production's venue map is an empirically collected list — it carries both
// "Oracle Park" and "Oracle Park, San Francisco" precisely because both forms
// turn up in real payloads. That is field-collected evidence about what venues
// are actually called, and it already exists.
{
  const venueSrc = readFileSync(VENUES, 'utf8')
  const found = objectLiteralAfter(venueSrc, 'export const VENUE_COORDS = {')
  if (found.error) failures.push(`venue map: ${found.error}`)
  else {
    const evaluated = evaluate(found.literal, 'VENUE_COORDS')
    if (evaluated.error) failures.push(`venue map: ${evaluated.error}`)
    else {
      const fromMap = Object.keys(evaluated.value)

      // The statsapi shape, which is a different vocabulary again — this is
      // where "Oriole Park at Camden Yards" comes from, and it is the form
      // laboratory will meet the moment it reads the schedule endpoint for the
      // pitcher and records rows.
      const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8'))
      const fromFixture = (fixture.games || [])
        .map(g => g?.venue?.name)
        .filter(Boolean)

      const names = [...new Set([...fromMap, ...fromFixture])].sort()
      writeFileSync(`${OUT}/production-venue-names.json`, JSON.stringify({
        source: 'jubilant-bassoon src/utils/venues.js VENUE_COORDS keys + docs/adapter-fixtures-mlb-ok.json venue names',
        fromVenueMap: fromMap.length,
        fromStatsApiFixture: fromFixture.length,
        names,
      }, null, 2) + '\n')
      console.log(`  venue names: ${names.length} distinct ` +
        `(${fromMap.length} from the venue map, ${fromFixture.length} from the statsapi fixture)`)
    }
  }
}

if (failures.length) {
  console.log('')
  for (const f of failures) console.log(`::error::${f}`)
  process.exit(1)
}
console.log('\nall tables extracted')
