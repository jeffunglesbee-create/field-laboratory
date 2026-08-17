// Which venue names in a real payload fail to find their park?
//
// THE BOUNDED AND THE UNBOUNDED HALVES OF ONE RISK
//
// The park row keys on the venue name a payload carries, and the vocabularies
// disagree: production's park table says "Camden Yards", statsapi says "Oriole
// Park at Camden Yards", production's own venue map says "Oriole Park,
// Baltimore". `Scouting.fs` now carries 48 imported aliases, and the generator
// refuses to emit a table where any of the thirty parks is unreachable.
//
// That closes the bounded half — every park is checked. It cannot close the
// other half, because the set of names a future payload might use is open. No
// artifact can cover "all names that will ever arrive"; asserting otherwise
// would be the exact shape of claim this repo keeps docking itself for.
//
// So the unbounded half is converted into a DETECTOR instead of a proof. An
// unresolved name is already safe — the row stays absent rather than showing
// another stadium's numbers, which is production's Rule 1 — but safe and silent
// is how a gap survives for months. This makes it observable within a day.
//
// Two modes, deliberately different in severity:
//
//   default   every venue in the recorded captures must resolve. These are
//             fixed files, so this is an invariant and a miss is a failure.
//
//   --report  live payload. Unresolved names are REPORTED, not failed, because
//             a new stadium or a renamed one is news about the world rather
//             than a broken build. The drift sentinel runs this one.

import { readFileSync, readdirSync } from 'node:fs'
import { createChecks } from './checks.mjs'
import { tryParkByVenue, isKnownUnfactored, venuesWithoutParkFactors } from '../build/Scouting.js'

const args = process.argv.slice(2)
const REPORT = args.includes('--report')
const urlAt = args.indexOf('--url')
const URL_ARG = urlAt === -1 ? null : args[urlAt + 1]

/**
 * Venue names of every MLB game in a payload.
 *
 * MLB only, on purpose. The park table is MLB, and a soccer ground failing to
 * find a baseball park factor is correct behaviour, not a gap — counting it
 * would bury the real signal under thirty true negatives a night.
 */
const venuesIn = payload => {
  const groups = payload?.games ?? {}
  const games = Array.isArray(groups) ? groups : Object.values(groups).flat()
  return games
    .filter(g => g && g.sport === 'MLB' && typeof g.venue === 'string' && g.venue.trim() !== '')
    .map(g => g.venue)
}

const resolve = name => tryParkByVenue(name) != null

if (REPORT) {
  if (!URL_ARG) {
    console.log('::error::--report needs --url <payload url>')
    process.exit(1)
  }
  let payload
  try {
    const res = await fetch(URL_ARG)
    if (!res.ok) {
      // Named, not swallowed. A reachability failure is a different fact from
      // "every venue resolved", and reporting the second when the first
      // happened is how a check comes to answer in one direction only.
      console.log(`venue-coverage: payload unreachable — HTTP ${res.status}`)
      process.exit(1)
    }
    payload = await res.json()
  } catch (e) {
    console.log(`venue-coverage: payload unreachable — ${e.message}`)
    process.exit(1)
  }

  const venues = venuesIn(payload)
  const unresolved = [...new Set(venues.filter(v => !resolve(v)))].sort()
  console.log(`venue-coverage: ${venues.length} MLB venue(s), ${unresolved.length} unresolved`)
  for (const v of unresolved) console.log(`  UNRESOLVED  ${JSON.stringify(v)}`)
  // Machine-readable tail for the sentinel to append to the drift log.
  console.log(`VENUE_COVERAGE ${venues.length} ${unresolved.length} ${JSON.stringify(unresolved)}`)
  process.exit(0)
}

// --- recorded captures: an invariant, not a report --------------------------

const { check, summarize } = createChecks()

const captures = readdirSync('data').filter(f => f.endsWith('.json') && !f.startsWith('production-'))
let total = 0
const misses = []
// Venues the source declares as having no park factors — a fact about baseball,
// not a suppression. Counted and printed rather than skipped silently, because
// a list that grows unnoticed is the thing it must not become.
const unfactored = []
for (const f of captures) {
  const venues = venuesIn(JSON.parse(readFileSync(`data/${f}`, 'utf8')))
  total += venues.length
  for (const v of venues) {
    if (resolve(v)) continue
    if (isKnownUnfactored(v)) { unfactored.push(`${f}: ${JSON.stringify(v)}`); continue }
    misses.push(`${f}: ${JSON.stringify(v)}`)
  }
}

console.log(`\nChecked ${total} MLB venue name(s) across ${captures.length} recorded capture(s)\n`)

// A floor. Every venue resolving is trivially true of zero venues, and this
// repo has shipped three blank artifacts green — "nothing to check" must never
// read as "everything checked".
check('the captures actually contain MLB venues to check', total > 0,
  'no MLB game with a venue was found in any capture, so the check below proves nothing')

if (unfactored.length > 0) {
  console.log(`${unfactored.length} venue(s) declared as having no park factors:`)
  for (const u of unfactored) console.log(`  ${u}`)
  console.log('')
}

check('every venue in a recorded capture resolves to a park, or is declared unfactored',
  misses.length === 0,
  misses.join('\n      → '))

// The declared list must stay a claim about the world, not a growing bucket.
// Every name on it has to actually turn up, or it is covering for nothing and
// should be deleted — the same reason `unused-check.mjs` exists.
const declared = Array.from(venuesWithoutParkFactors)
const seen = new Set(unfactored.map(u => JSON.parse(u.slice(u.indexOf(': ') + 2))))
const idle = declared.filter(v => !seen.has(v))
check('every venue declared unfactored actually appears in a capture',
  idle.length === 0,
  `${idle.join(', ')} — declared as having no park factors but present in no capture`)

// The statsapi vocabulary, which no capture in this repo uses yet and which is
// the one laboratory will meet first when the pitcher and records rows are
// built. Pinned here so the alias survives a regeneration that drops it.
check('the statsapi name for Camden Yards resolves', resolve('Oriole Park at Camden Yards'),
  '"Oriole Park at Camden Yards" does not resolve — the form statsapi actually returns')

process.exit(summarize() === 0 ? 0 : 1)
