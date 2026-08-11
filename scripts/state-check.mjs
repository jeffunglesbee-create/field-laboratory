// Game state at fixed instants — deterministic, so it proves something.
//
// `gameState` used to read the wall clock twice: `fieldToday()` for the date
// comparison and `DateTimeOffset.UtcNow` for kickoff. Every assertion about it
// was therefore an assertion about when the test ran, and the checks that
// exercised it (render-check, pickem-check) had to arrange their fixtures
// around the current date to get the state they wanted.
//
// This repo has already been burned by exactly that. zone-check reported 16/16
// while a deliberately broken UTC-4 implementation ALSO passed 11/11, because
// its one F# assertion was time-dependent. The fix was to make the function
// pure at a named instant. Same fix here, so the same check is possible:
//
//   * a table of (game, instant) -> expected state, fixed forever
//   * every row discriminating, so a wrong implementation gives a wrong answer
//   * the wrong implementations named and RUN, not just described
//
// Usage:  node scripts/state-check.mjs

import { createChecks } from './checks.mjs'
import { decodePayload, gameStateAt } from '../build/Desk.js'

const { check, summarize } = createChecks()
const STATE = ['Scheduled', 'InProgress', 'Final']

const game = (over, extra = {}) => ({
  id: `g_${over}`, sport: 'MLB', league: 'MLB', date: '2026-06-15',
  home: 'Reds', away: 'Phillies', home_score: null, away_score: null,
  venue: 'x', streams: 'MLB.TV', note: null, tags: null, crew: null,
  local_note: null, created_at: '2026-06-15 10:00:00',
  opening_odds: null, closing_odds: null, drama_peak: null, drama_arc: null,
  espn_event_id: null, went_to_ot: null, finalized_at: null,
  start_time: '2026-06-15T23:00Z', ...extra,
})

/** Decode one game through the real decoder, then ask for its state. */
const stateOf = (fields, instant) => {
  const payload = decodePayload(JSON.stringify({
    ok: true, date: fields.date, games: { regular: [fields], postseason: [] },
    briefs: [], series: [], standings: [],
  }))
  if (payload.tag !== 0) throw new Error(`fixture did not decode: ${payload.fields[0]}`)
  const decoded = Array.from(payload.fields[0].Regular)[0]
  return STATE[gameStateAt(new Date(instant), decoded).tag]
}

// Each row is chosen so that a WRONG implementation gives a different answer.
// The `breaks` column names which one, and those implementations are run below.
const CASES = [
  // Placeholder zeroes on a fixture that has not kicked off. This is
  // field-playground's live CFL bug: 0 is written for unplayed fixtures, and a
  // status derived from score PRESENCE reads every one of them as live.
  { name: 'unplayed 0-0 before kickoff is Scheduled',
    game: game('zeroes', { home_score: 0, away_score: 0 }),
    at: '2026-06-15T12:00:00Z', expect: 'Scheduled', breaks: 'score-presence' },

  // Same game, after kickoff. If this also said Scheduled the rule would just
  // be "never live", which is not a fix.
  { name: 'the same 0-0 fixture AFTER kickoff is InProgress',
    game: game('zeroes', { home_score: 0, away_score: 0 }),
    at: '2026-06-15T23:30:00Z', expect: 'InProgress', breaks: 'never-live' },

  { name: 'no scores at all is Scheduled',
    game: game('none'), at: '2026-06-15T23:30:00Z', expect: 'Scheduled' },

  { name: 'scores after kickoff, not finalized, is InProgress',
    game: game('live', { home_score: 3, away_score: 1 }),
    at: '2026-06-15T23:30:00Z', expect: 'InProgress' },

  { name: 'finalized_at makes it Final even on the same day',
    game: game('final', { home_score: 3, away_score: 1, finalized_at: '2026-06-16 02:00:00' }),
    at: '2026-06-16T02:30:00Z', expect: 'Final' },

  // The backfill case: AFL rows never carry finalized_at, so the date does the
  // work the missing field cannot.
  { name: 'a past date is Final without finalized_at',
    game: game('past', { home_score: 3, away_score: 1 }),
    at: '2026-08-01T12:00:00Z', expect: 'Final', breaks: 'finalized-only' },

  // The ET boundary, on the state machine rather than on the date helper.
  // 2026-06-16T03:00Z is 23:00 on the 15th in New York, so the 15th has NOT
  // passed yet and a game that day is still live, not Final.
  { name: 'inside the ET window, a same-day game is not yet Final',
    game: game('window', { home_score: 3, away_score: 1 }),
    at: '2026-06-16T03:00:00Z', expect: 'InProgress', breaks: 'utc-date' },
]

for (const c of CASES) {
  let actual
  try { actual = stateOf(c.game, c.at) } catch (e) { actual = `threw: ${e.message}` }
  check(c.name, actual === c.expect, `at ${c.at}: got ${actual}, expected ${c.expect}`)
}

// --- the wrong implementations, run --------------------------------------------
//
// A table of expectations proves nothing unless a wrong answer would fail it.
// These are the three plausible wrong rules, applied to the same rows.

const parse = iso => Date.parse(iso)
const etDayOf = ms => new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
}).formatToParts(new Date(ms)).reduce((a, p) => (p.type === 'literal' ? a : { ...a, [p.type]: p.value }), {})
const etIso = ms => { const p = etDayOf(ms); return `${p.year}-${p.month}-${p.day}` }

const WRONG = {
  // Status from score presence — playground's gameStatus, and laboratory's own
  // shape before today.
  'score-presence': (g, at) =>
    g.home_score == null ? 'Scheduled'
      : (g.finalized_at || etIso(parse(at)) > g.date) ? 'Final' : 'InProgress',
  // Over-correcting: treat anything unfinalized as not started.
  'never-live': (g, at) =>
    (g.finalized_at || etIso(parse(at)) > g.date) ? 'Final' : 'Scheduled',
  // Trusting finalized_at alone — the bug that rendered May AFL games as
  // "In progress" in August.
  'finalized-only': g =>
    g.home_score == null ? 'Scheduled' : g.finalized_at ? 'Final' : 'InProgress',
  // The date comparison in UTC instead of ET.
  'utc-date': (g, at) =>
    g.home_score == null ? 'Scheduled'
      : (g.finalized_at || new Date(parse(at)).toISOString().slice(0, 10) > g.date)
        ? 'Final' : 'InProgress',
}

for (const [label, impl] of Object.entries(WRONG)) {
  const caught = CASES.filter(c => c.breaks === label)
  // Every wrong implementation must be caught by at least one row, or the row
  // that names it is decoration.
  const disagrees = caught.some(c => impl(c.game, c.at) !== c.expect)
  check(`the "${label}" implementation is caught by the table`, disagrees,
    caught.length === 0
      ? 'no row claims to catch it'
      : caught.map(c => `${c.name}: wrong impl says ${impl(c.game, c.at)}, table wants ${c.expect}`).join(' | '))
}

process.exit(summarize() === 0 ? 0 : 1)
