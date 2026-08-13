// A row this desk cannot name both sides of must cost exactly that row.
//
// WHAT THIS IS FOR
//
// On 2026-08-13 `live-check` went red against the deployed page:
//
//     Error at: `$.games.regular.[18].away`
//     Expecting a string but instead got: null
//     FAIL  card count matches decoded game count → decoded NaN, rendered 0
//
// One PGA Tour row — NULL on both sides, correctly, because a golf event has no
// two teams — took the whole slate down, because `Decode.list` is all-or-
// nothing. Nineteen games rendered as a blank page and five downstream checks
// failed against nothing.
//
// The fix decodes what it can and counts what it cannot. The failure mode of
// THAT fix is a silent skip: rows vanish and the page looks healthy. So the
// assertion here is not "it doesn't crash" — it is the conservation law:
//
//     rows submitted === games decoded + rows counted unnamed
//
// Nothing may disappear without being counted. A check that only asserted "the
// payload decodes" would pass on an implementation that dropped every row.

import { createChecks } from './checks.mjs'
import { decodePayload } from '../build/Desk.js'

const { check, summarize } = createChecks()

const row = (id, extra = {}) => ({
  id, sport: 'MLB', league: 'MLB', date: '2026-06-15',
  home: 'Orioles', away: 'Royals',
  home_score: null, away_score: null, venue: 'Camden Yards',
  streams: null, note: null, tags: null, crew: null, local_note: null,
  created_at: '2026-06-15 10:00:00', opening_odds: null, closing_odds: null,
  drama_peak: null, drama_arc: null, espn_event_id: null, went_to_ot: null,
  finalized_at: null, start_time: '2026-06-15T23:00Z', ...extra,
})

/** Decode a slate and report what came back, through the REAL decoder. */
const decode = (regular, postseason = []) => {
  const p = decodePayload(JSON.stringify({
    ok: true, date: '2026-06-15', games: { regular, postseason },
    briefs: [], series: [], standings: [],
  }))
  if (p.tag !== 0) return { failed: true, error: p.fields[0] }
  const d = p.fields[0]
  return {
    failed: false,
    games: Array.from(d.Regular).length + Array.from(d.Postseason).length,
    unnamed: d.Unnamed,
  }
}

// The real shape, taken from the relay: PGA Tour rows carry NULL for both sides.
const GOLF = row('pga', { sport: 'PGA Tour', league: 'PGA Tour', home: null, away: null })
const HALF = row('half-named', { away: null })

// ── the conservation law ────────────────────────────────────────────────────

for (const [name, rows] of [
  ['a clean slate', [row('a'), row('b'), row('c')]],
  ['one row with no away side', [row('a'), HALF, row('b')]],
  ['a PGA row with neither side', [row('a'), GOLF]],
  ['nothing but un-nameable rows', [GOLF, HALF]],
  ['an empty slate', []],
]) {
  const r = decode(rows)
  check(`${name}: nothing vanishes uncounted`,
    !r.failed && r.games + r.unnamed === rows.length,
    r.failed ? `the whole slate failed: ${r.error}`
             : `${rows.length} row(s) in, ${r.games} game(s) + ${r.unnamed} unnamed out`)
}

// ── the specific regression ─────────────────────────────────────────────────
//
// Stated separately from the conservation law because the law alone is
// satisfied by an implementation that counts EVERY row as unnamed and renders
// none — which is the blank page again, arriving through the new code path.

const withGolf = decode([row('a'), row('b'), GOLF])
check('a slate with one un-nameable row still renders the others',
  !withGolf.failed && withGolf.games === 2,
  withGolf.failed ? `decode failed outright: ${withGolf.error}`
                  : `rendered ${withGolf.games} of the 2 nameable rows`)

check('the un-nameable row is counted, not silently dropped',
  !withGolf.failed && withGolf.unnamed === 1,
  `Unnamed = ${withGolf.unnamed}, expected 1`)

// The counter must be zero when nothing was dropped, or "1 row not drawn"
// becomes furniture that is always on the page and therefore never read.
const clean = decode([row('a'), row('b')])
check('a clean slate counts zero unnamed',
  !clean.failed && clean.unnamed === 0,
  `Unnamed = ${clean.unnamed} on a slate where every row names both sides`)

// Postseason travels through the same decoder and must contribute to the same
// counter — the original bug was in `regular`, and a fix applied to one list
// and not the other would pass every check above.
const post = decode([row('a')], [GOLF, row('b')])
check('postseason rows are counted in the same total',
  !post.failed && post.games === 2 && post.unnamed === 1,
  `${post.games} game(s), ${post.unnamed} unnamed across both lists`)

process.exit(summarize('Rows this desk cannot name') ? 0 : 1)
