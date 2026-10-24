// One venue name, two grounds: which table rows serve the wrong city?
//
// docs/CC-CMD-2026-10-24-venue-name-collisions.md, Task 1.
//
// The table is keyed by venue name alone. The home-team calibration flagged
// `Red Bull Arena` (the row was Harrison NJ; the archive files RB Leipzig's games
// under that string). That turned out to be a stale row after a rename, not two
// live grounds (the New Jersey ground is Sports Illustrated Stadium from
// 2026-09-30), and the row is Leipzig's now. This measures every table row the
// same way, so the answer is a list and not one example.
//
// For each table venue the archive has games at, every distinct HOME team seen
// there is put through the home-team matcher (`chooseByHome`, scripts/venue-source.mjs)
// over that name's Wikidata candidates. The ground it picks is compared with the
// table row: the same ground, a COLLISION (a different ground, i.e. this home team
// plays elsewhere under the same name), or no pick (national teams at neutral
// sites, clubs Wikidata does not list there).
//
// A collision here is a finding to read, not a verdict: the row could be the wrong
// one, or the matcher could. Each is listed with both coordinates and the distance.
//
// COVERAGE IS PRINTED, NOT IMPLIED. The archive window is N days, so a venue not
// seen in it is not judged, and the output says how many of the table's rows that
// is (Rule 91).
//
// Usage:  node scripts/venue-collisions.mjs --self-test
//         node scripts/venue-collisions.mjs --days 120        (runner: needs the relay and Wikidata)

import { writeFileSync, mkdirSync } from 'node:fs'
import { EPS, near, readTable, tableRowCount, wikidata, loadCache, saveCache } from './venue-source.mjs'
import { createChecks, finish, isMain } from './checks.mjs'

const RELAY = process.env.RELAY || 'https://field-relay-nba.jeffunglesbee.workers.dev'
const OUT = 'outbox/venue-collisions-latest.json'

/** The (venue, home) pairs in one /context/date payload, regular and postseason. */
export const pairsOf = j =>
  [...(j?.games?.regular ?? []), ...(j?.games?.postseason ?? [])]
    .filter(g => g && g.venue && g.home)
    .map(g => ({ venue: g.venue, home: g.home }))

/** What the matcher's pick means against the table row. A pick among ONE
 *  candidate is no choice at all (the first run flagged American Family Field /
 *  Brewers: the only candidate was the Brewers' Phoenix spring-training complex,
 *  and the 43 home games are in Milwaukee, where the row is), so it is not judged. */
export const classify = (row, chosen, eps = EPS, candidates = 2) =>
  candidates < 2 ? 'single-candidate' : !chosen ? 'abstain' : near(chosen, row, eps) ? 'same-ground' : 'collision'

const isoDay = d => d.toISOString().slice(0, 10)
const sleep = ms => new Promise(r => setTimeout(r, ms))

const getDay = async day => {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${RELAY}/context/date/${day}`, { signal: AbortSignal.timeout(30000) })
      if (res.ok) return { ok: true, value: await res.json() }
      if (res.status !== 429 && res.status < 500) return { ok: false, why: `HTTP ${res.status}` }
    } catch (_) { /* retried */ }
    await sleep(2000 * (attempt + 1))
  }
  return { ok: false, why: 'unreachable after 3 tries' }
}

const selfTest = () => {
  const { check, summarize } = createChecks()
  const sample = { games: { regular: [{ venue: 'Anfield', home: 'Liverpool' }, { venue: null, home: 'X' }], postseason: [{ venue: 'Soldier Field', home: 'Bears' }] } }
  check('pairs come from regular and postseason, and skip a row with no venue',
    JSON.stringify(pairsOf(sample)) === JSON.stringify([{ venue: 'Anfield', home: 'Liverpool' }, { venue: 'Soldier Field', home: 'Bears' }]), JSON.stringify(pairsOf(sample)))
  check('a payload with no games yields no pairs, not a crash', pairsOf({}).length === 0 && pairsOf(null).length === 0)
  const row = { lat: 40.7367, lon: -74.1503 }
  check('no pick is an abstention', classify(row, null) === 'abstain')
  check('A PICK AMONG ONE CANDIDATE IS NOT JUDGED (American Family Field / Phoenix)', classify(row, { lat: 33.49, lon: -112.17 }, EPS, 1) === 'single-candidate')
  check('a pick on the row is the same ground', classify(row, { lat: 40.7368, lon: -74.1502 }) === 'same-ground')
  check('A PICK IN ANOTHER CITY IS A COLLISION (a New Jersey row, a Leipzig pick)', classify(row, { lat: 51.3458, lon: 12.3481 }) === 'collision')
  check('...and the boundary is the calibrated 0.02 degrees', classify(row, { lat: 40.7367 + 0.0199, lon: -74.1503 }) === 'same-ground' && classify(row, { lat: 40.7367 + 0.0201, lon: -74.1503 }) === 'collision')
  finish(summarize())
}

const run = async days => {
  const table = readTable()
  const rowOf = new Map(table.map(v => [v.name, v]))
  if (table.length !== tableRowCount()) { console.error('  FAIL  the table reader missed rows'); process.exit(1) }

  // 1. the archive window
  const homes = new Map()          // venue -> Map(home -> games)
  let swept = 0, rows = 0
  const failedDays = []
  for (let i = 0; i < days; i++) {
    const day = isoDay(new Date(Date.now() - i * 864e5))
    const r = await getDay(day)
    if (!r.ok) { failedDays.push(`${day}: ${r.why}`); continue }
    swept++
    for (const { venue, home } of pairsOf(r.value)) {
      rows++
      if (!rowOf.has(venue)) continue
      const m = homes.get(venue) ?? new Map(); m.set(home, (m.get(home) ?? 0) + 1); homes.set(venue, m)
    }
  }
  console.log(`  swept ${swept} of ${days} days, ${rows} game rows; ${homes.size} of ${table.length} table venues have games in the window`)

  // 2. every pair through the matcher
  const cache = loadCache()
  const pairs = []
  for (const [venue, hs] of homes) {
    const row = rowOf.get(venue)
    for (const [home, games] of hs) {
      const w = await wikidata(venue, cache, { home, measure: true })
      const chosen = w.ok ? w.homeChoice?.chosen ?? null : null
      const verdict = !w.ok ? 'unanswered' : classify(row, chosen, EPS, (w.entities ?? []).length)
      pairs.push({ venue, home, games, verdict, row: { lat: row.lat, lon: row.lon },
        picked: chosen ? { qid: chosen.qid, label: chosen.label, lat: chosen.lat, lon: chosen.lon } : null,
        distanceDeg: chosen ? Math.round(Math.max(Math.abs(chosen.lat - row.lat), Math.abs(chosen.lon - row.lon)) * 1e4) / 1e4 : null,
        why: w.ok ? w.homeChoice?.why ?? null : w.why })
      if (verdict === 'collision') console.log(`  COLLISION  ${venue} / ${home} (${games} game(s)) -> ${chosen.label} ${chosen.lat},${chosen.lon}  vs row ${row.lat},${row.lon}`)
    }
    saveCache(cache)
  }
  const n = k => pairs.filter(p => p.verdict === k).length
  const summary = { days, daysAnswered: swept, gameRows: rows, tableVenues: table.length, tableVenuesSeen: homes.size, tableVenuesNotSeen: table.length - homes.size,
    pairs: pairs.length, sameGround: n('same-ground'), collision: n('collision'), abstain: n('abstain'), singleCandidate: n('single-candidate'), unanswered: n('unanswered') }
  mkdirSync('outbox', { recursive: true })
  writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), run: process.env.GITHUB_RUN_ID ?? null, relay: RELAY, failedDays, summary, pairs }, null, 1) + '\n')
  console.log(`\n  checked ${summary.pairs} venue/home pairs over ${summary.tableVenuesSeen} of ${summary.tableVenues} table venues (${summary.tableVenuesNotSeen} not seen in ${days} days)`)
  console.log(`  same ground ${summary.sameGround}  ·  COLLISION ${summary.collision}  ·  no pick ${summary.abstain}  ·  one candidate, not judged ${summary.singleCandidate}  ·  unanswered ${summary.unanswered}\n`)
  const { check, summarize } = createChecks()
  check('every day in the window was answered', failedDays.length === 0, failedDays.slice(0, 5).join('; '))
  check('every pair was answered by Wikidata', summary.unanswered === 0, `${summary.unanswered} unanswered`)
  check('the sweep found games at table venues, or this is vacuous', summary.pairs > 0, 'no pair')
  finish(summarize())
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--self-test')) selfTest()
  else if (process.argv.includes('--days')) await run(Number(process.argv[process.argv.indexOf('--days') + 1]))
  else { console.error('usage: node scripts/venue-collisions.mjs --self-test | --days N'); process.exit(2) }
}
