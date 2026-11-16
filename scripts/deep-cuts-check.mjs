// Deep Cuts: the windows, the owner's edge rulings, the nearest-window rule, and the
// board on a real slate. docs/CC-CMD-2026-11-15-scout-daypart-picks.md.
//
// WHAT THIS HOLDS
//   1. a table of kickoffs and the window each belongs to, written by hand from the
//      owner's rulings: every shared edge (weekend 11:00 -> 10am, weekday 11:00 -> 12pm,
//      13:00 -> 12pm, 15:00 -> 4pm), the nearest-window cases measured on 30 days
//      (17:30, 18:00, 18:15, weekday 10:30), and the halfway rule (17:45, weekend 08:45)
//   2. the ET clock on both sides of the 2026-11-01 change, so an hour is never off
//   3. the board on the committed real Saturday slate data/context-2026-10-10.json:
//      seven windows in order, every game either in exactly one window or named as not
//      placed, the counts summing to the slate, and each window's games equal to an
//      INDEPENDENT re-statement of the rules below (not the code under test)
//
// Usage:  node scripts/deep-cuts-check.mjs   (needs build/)

import { readFileSync } from 'node:fs'
import { createChecks, finish } from './checks.mjs'
import { decodePayload } from '../build/Desk.js'
import { windowAt, fieldClockAt, isWeekendDate, boardAt } from '../build/DeepCuts.js'
import { ofArray } from '../build/fable_modules/fable-library-js.5.13.0/List.js'

const { check, summarize } = createChecks()
const at = s => new Date(s)
const hm = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m }

// 1. The hand table.
const TABLE = [
  // [weekend, ET kickoff, window, why]
  [false, '19:00', 'w1930', 'inside 7:30pm'],
  [true, '11:00', 'w1000', 'owner: a weekend 11:00 is the 10am window\'s'],
  [false, '11:00', 'w1200', 'no 10am window on a weekday'],
  [false, '13:00', 'w1200', 'owner: 13:00 is the 12pm window\'s'],
  [false, '15:00', 'w1600', 'owner: 15:00 is the 4pm window\'s'],
  [false, '14:00', 'w1400', 'inside 2pm'],
  [false, '17:30', 'w1600', 'nearest: 30 after 4pm, 60 before 7:30pm'],
  [false, '18:00', 'w1930', 'nearest: 30 before 7:30pm'],
  [false, '18:15', 'w1930', 'nearest: 15 before 7:30pm'],
  [false, '17:45', 'w1930', 'halfway (45/45): the later window'],
  [false, '10:30', 'w1200', 'weekday morning: 30 before 12pm'],
  [true, '10:30', 'w1000', 'weekend morning: inside 10am'],
  [true, '08:45', 'w1000', 'weekend halfway (15/15) between 7:30am and 10am: the later'],
  [true, '05:00', 'w0730', 'weekend early: nearest is 7:30am'],
  [false, '23:30', 'w2200', 'late: 30 after 10pm'],
  [false, '20:30', 'w1930', '7:30pm window\'s end edge'],
  [false, '20:45', 'w2200', 'nearest: 15 before 10pm, 15 after 7:30pm: halfway, the later'],
]
for (const [weekend, t, id, why] of TABLE) {
  const got = windowAt(weekend, hm(t)).Id
  check(`${weekend ? 'weekend' : 'weekday'} ${t} -> ${id} (${why})`, got === id, `got ${got}`)
}

// 2. The ET clock, either side of the DST change.
const clock = s => { const [w, m] = fieldClockAt(at(s)); return `${w ? 'weekend' : 'weekday'} ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` }
check('EST: 2026-11-14T17:00Z is Saturday 12:00 ET', clock('2026-11-14T17:00:00Z') === 'weekend 12:00', clock('2026-11-14T17:00:00Z'))
check('EDT: 2026-10-10T23:00Z is Saturday 19:00 ET', clock('2026-10-10T23:00:00Z') === 'weekend 19:00', clock('2026-10-10T23:00:00Z'))
check('a UTC Sunday 03:00 is still Saturday 22:00 ET (EST)', clock('2026-11-15T03:00:00Z') === 'weekend 22:00', clock('2026-11-15T03:00:00Z'))
check('2026-11-16 (Monday) is a weekday, 2026-11-14 a weekend', !isWeekendDate('2026-11-16') && isWeekendDate('2026-11-14'), '')

// 3. The board on a real Saturday slate.
const FIXTURE = 'data/context-2026-10-10.json'
const raw = JSON.parse(readFileSync(FIXTURE, 'utf8'))
const decoded = decodePayload(JSON.stringify(raw))
check(`${FIXTURE} decodes`, decoded.tag === 0, decoded.tag === 0 ? '' : String(decoded.fields[0]))
const games = [...Array.from(decoded.fields[0].Regular), ...Array.from(decoded.fields[0].Postseason)]
const board = boardAt(at('2026-10-11T12:00:00Z'), raw.date, ofArray(games), 0)
const wins = Array.from(board.Windows)
check('a Saturday lists all seven windows, in order',
  wins.map(w => w.Window.Id).join() === 'w0730,w1000,w1200,w1400,w1600,w1930,w2200', wins.map(w => w.Window.Id).join())

const placedIds = wins.flatMap(w => Array.from(w.Games).map(g => g.Id))
const notPlaced = Array.from(board.NotPlaced)
check(`every game is placed once or named (${placedIds.length} placed + ${notPlaced.length} not placed = ${games.length})`,
  placedIds.length + notPlaced.length === games.length && new Set(placedIds).size === placedIds.length,
  `placed ${placedIds.length}, unique ${new Set(placedIds).size}, not placed ${notPlaced.length}, games ${games.length}`)

// The independent statement of the rules: plain JS from the CC-CMD's table, using
// Intl directly. It shares no code with DeepCuts.fs.
const W = [['w0730', 390, 510, true], ['w1000', 540, 660, true], ['w1200', 660, 780], ['w1400', 780, 900], ['w1600', 900, 1020], ['w1930', 1110, 1230], ['w2200', 1260, 1380]]
const RULED = { 660: 'w1000', 780: 'w1200', 900: 'w1600' }
const oracle = (weekend, m) => {
  const day = W.filter(w => weekend || !w[3])
  if (RULED[m] && day.some(w => w[0] === RULED[m])) return RULED[m]
  const inside = day.find(w => m >= w[1] && m <= w[2]); if (inside) return inside[0]
  const d = w => (m < w[1] ? w[1] - m : m - w[2])
  return [...day].sort((a, b) => d(a) - d(b) || b[1] - a[1])[0][0]
}
const etMinute = iso => {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso))
  return Number(p.find(x => x.type === 'hour').value) * 60 + Number(p.find(x => x.type === 'minute').value)
}
const rawById = new Map([...(raw.games.regular || []), ...(raw.games.postseason || [])].map(g => [g.id, g]))
const mismatched = []
for (const w of wins) for (const g of Array.from(w.Games)) {
  const expect = oracle(true, etMinute(rawById.get(g.Id).start_time.replace(/Z$/, ':00Z')))
  if (expect !== w.Window.Id) mismatched.push(`${g.Id}: board ${w.Window.Id}, rules ${expect}`)
}
check(`each placed game is in the window the rules give it (${placedIds.length} checked)`, mismatched.length === 0, mismatched.slice(0, 3).join('; '))
const counts = wins.map(w => `${w.Window.Label} ${Array.from(w.Games).length}`).join(', ')
console.log(`\n  10-10 board: ${counts}; not placed ${notPlaced.length}\n`)
check('at least one window has games and the board is not vacuous', wins.some(w => Array.from(w.Games).length > 0), counts)

// The two not-placed reasons the 10-10 slate does not reach. A golf round row as the
// archive writes it (home the tournament, away the round), but WITH a real start, the
// shape it takes once field-relay-nba docs/CC-CMD-2026-11-16-golf-tee-times.md lands
// (15:31Z is the round-4 leader's teeTime read 2026-11-16); and the CFB game dated
// 2026-11-14 that kicks off 2026-11-15T18:00Z (ARCHIVE_DB). A row with no sides at all,
// like the PGA Tour placeholder, never reaches the board: the decoder counts it as
// unnamed at the desk.
const base = { league: null, home_score: null, away_score: null, venue: null, streams: null, note: null, tags: null, crew: null, local_note: null, created_at: '2026-11-14 10:00:00', opening_odds: null, closing_odds: null, drama_peak: null, drama_arc: null, espn_event_id: null, went_to_ot: null, finalized_at: null }
const extra = decodePayload(JSON.stringify({ ok: true, date: '2026-11-14', briefs: [], series: [], standings: [], games: { postseason: [], regular: [
  { ...base, id: 'golf_2026-11-14_austin_r4', sport: 'golf', league: 'PGA Tour', date: '2026-11-14', home: 'Austin Championship pres. by Compliance Solutions', away: 'R4', start_time: '2026-11-14T15:31Z' },
  { ...base, id: 'CFB_2026-11-14_moved', sport: 'CFB', league: 'CFB', date: '2026-11-14', home: 'Oklahoma', away: 'Ole Miss', start_time: '2026-11-15T18:00Z' },
] } }))
const extraBoard = boardAt(at('2026-11-14T12:00:00Z'), '2026-11-14', ofArray(Array.from(extra.fields[0].Regular)), 0)
const reasons = Array.from(extraBoard.NotPlaced).map(([g, why]) => `${g.Id}:${['NoKickoff', 'NotAContestHere', 'KicksOffAnotherDay'][why.tag]}`).sort().join(' ')
check('a golf round with a real start is not a contest here, and a game keyed to the day before its kickoff is not placed',
  reasons === 'CFB_2026-11-14_moved:KicksOffAnotherDay golf_2026-11-14_austin_r4:NotAContestHere', reasons)
check('an empty window is still listed', Array.from(extraBoard.Windows).length === 7 && Array.from(extraBoard.Windows).every(w => Array.from(w.Games).length === 0),
  Array.from(extraBoard.Windows).map(w => Array.from(w.Games).length).join())

finish(summarize())
