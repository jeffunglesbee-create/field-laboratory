// The broadcast registry, held against a real slate.
//
// WHAT BROKE
//
// Scout's Gate 0 reads `streams` through an explicit registry and refuses to
// guess at an outlet it does not know ("cannot tell"). On the 2026-11-14 slate
// 42 distinct outlet strings were unknown, so Gate 0 could not answer for most
// games, and "Fox" missed the registry's "FOX" on an exact match.
//
// The 2026-11-15 additions are the owner's classification. This holds them:
//   1. every outlet on the committed 11-14 slate is now in the registry (count printed)
//   2. named games land where the ruling puts them (a table, each row discriminating)
//   3. the Gate 0 split over the whole slate is printed, so a reader sees what
//      the ruling did, not only that nothing is unknown
//
// Usage:  node scripts/outlet-registry-check.mjs   (needs build/)

import { readFileSync } from 'node:fs'
import { createChecks, finish } from './checks.mjs'
import { broadcastOf, unmodelledOutlets } from '../build/Scout.js'

const { check, summarize } = createChecks()
const KIND = ['NationalOnly', 'LocalAvailable', 'UnrecognisedOutlets', 'NoBroadcastListed']
const kindOf = streams => KIND[broadcastOf(streams ?? undefined).tag]

const { rows } = JSON.parse(readFileSync('data/streams-2026-11-14.json', 'utf8'))
check(`the slate is the one recorded (${rows.length} rows)`, rows.length === 79, `got ${rows.length}`)

const listed = rows.filter(([, s]) => s != null)
const distinct = [...new Set(listed.flatMap(([, s]) => s.split(',').map(x => x.trim())))]
const unknown = [...new Set(listed.flatMap(([, s]) => Array.from(unmodelledOutlets(s))))]
check(`every outlet on the slate is in the registry (${distinct.length - unknown.length} of ${distinct.length} distinct)`,
  unknown.length === 0, `unknown: ${unknown.join(' | ')}`)

const TABLE = [
  // exact-match case: the slate's spelling, not the registry's old one
  ['Fox', 'NationalOnly'],
  ['CBS', 'NationalOnly'], ['CW', 'NationalOnly'], ['NBA TV', 'NationalOnly'],
  ['NHL Net', 'NationalOnly'], ['ESPNU', 'NationalOnly'], ['CBSSN', 'NationalOnly'], ['USA Net', 'NationalOnly'],
  // a simulcast must not turn a national game local
  ['ESPN, Disney+', 'NationalOnly'],
  // the owner ruling: conference networks and streaming-only are not national
  ['ESPN+', 'LocalAvailable'], ['MW+', 'LocalAvailable'], ['BTN', 'LocalAvailable'],
  ['SEC Network', 'LocalAvailable'], ['ACC Network', 'LocalAvailable'],
  // a national feed beside a local one is still findable locally
  ['NHL Net, CARNHL, KONG, Prime Video (Local)', 'LocalAvailable'],
  ['DAZN MIN', 'LocalAvailable'],
  // still refused: the registry does not guess
  ['Some New Network', 'UnrecognisedOutlets'],
  [null, 'NoBroadcastListed'],
]
for (const [streams, expect] of TABLE)
  check(`${JSON.stringify(streams)} -> ${expect}`, kindOf(streams) === expect, `got ${kindOf(streams)}`)

// The 30-day census (2026-10-18 to 2026-11-17): every distinct outlet string the
// archive carried, 102 of them. Before the owner's "Full scope" of 2026-11-17, 47 were
// unknown (645 appearances); now none may be.
const census = JSON.parse(readFileSync('data/outlets-2026-10-18-to-11-17.json', 'utf8')).outlets
const censusUnknown = census.filter(o => Array.from(unmodelledOutlets(o.outlet)).length > 0)
check(`every outlet of the 30-day census is in the registry (${census.length - censusUnknown.length} of ${census.length})`,
  census.length === 102 && censusUnknown.length === 0, `unknown: ${censusUnknown.map(o => o.outlet).join(' | ')}`)
for (const [streams, expect] of [
  // verified 2026-11-17
  ['NBCSN', 'NationalOnly'],                    // Celtics v Magic, 2026-11-16, served exactly so
  ['Apple TV', 'NationalOnly'],                 // the rename of Apple TV+, exact match
  ['Fandango', 'NationalOnly'],
  ['DAZN CLE', 'LocalAvailable'],
  ['KUNP 16, BlazerVision, DAZN MIN', 'LocalAvailable'],
  ['Suns Live, Arizona\'s Family 3TV', 'LocalAvailable'],
  ['NBA League Pass', 'LocalAvailable'],        // league-wide out-of-market, as MLB.TV
  ['Paramount+', 'NationalOnly'],
  // The owner's ruling of 2026-11-17: ESPN's national package. The archive's only
  // shape with ESPN+ beside Disney+ or Hulu (15 NHL games since 2026-08-01).
  ['Disney+, ESPN+, Hulu', 'NationalOnly'],
  ['ESPN+, Hulu', 'NationalOnly'],
  // and what the ruling leaves as it was: ESPN+ alone, or beside a team outlet
  ['ESPN+', 'LocalAvailable'],
  ['ESPN+, CHSN', 'LocalAvailable'],
  ['Disney+, ESPN+, Hulu, NESN', 'LocalAvailable'],
]) check(`census: ${JSON.stringify(streams)} -> ${expect}`, kindOf(streams) === expect, `got ${kindOf(streams)}`)

const split = {}
for (const [, s] of rows) split[kindOf(s)] = (split[kindOf(s)] || 0) + 1
console.log(`\n  Gate 0 over the 11-14 slate (${rows.length} games): ${KIND.map(k => `${k} ${split[k] || 0}`).join(', ')}\n`)
check('the split covers every game', Object.values(split).reduce((a, b) => a + b, 0) === rows.length, JSON.stringify(split))

finish(summarize())
