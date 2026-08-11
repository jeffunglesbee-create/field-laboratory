// Is the transcribed fixture the same shape as what the relay really serves?
//
// data/pick-2026-07-07.json was copied out of a Drive document by hand, because
// this repo's sandbox has no route to the relay. Everything built on it —
// SealedRank, Leadership, the ranked list, the tie detection — rests on a
// transcription nobody has checked against its source.
//
// This checks it against its source. It requests THE SAME DATE the fixture was
// transcribed from, decodes the live response with the same decoder, and
// compares the two boards field by field. If the transcription introduced an
// error, or the relay's shape has moved since, this is where it shows.
//
// If that date returns no board, it walks recent dates looking for any real
// `Picked` and asserts its shape instead — weaker, but it still verifies the
// ranked list against live data rather than against a document.
//
// Usage:  node scripts/pick-shape-check.mjs
//         DATES=2026-07-07,2026-07-08 node scripts/pick-shape-check.mjs

import { readFileSync } from 'node:fs'
import { createChecks, toArray, fieldDay } from './checks.mjs'
import { decodeBundle, decodePick, leadershipNote, entryMatchup } from '../build/Pick.js'

const RELAY = 'https://field-relay-nba.jeffunglesbee.workers.dev/analytics/newspaper/'
/** The fixture's own date first — that is the comparison that means the most. */
const FIXTURE_DATE = '2026-07-07'

const shiftDays = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return t.toISOString().slice(0, 10)
}

const dates = process.env.DATES
  ? process.env.DATES.split(',').map(s => s.trim())
  // The fixture's date, then a walk back from today. Yesterday first: today's
  // analytics may not have run yet at the hour CI happens to fire.
  : [FIXTURE_DATE, ...Array.from({ length: 8 }, (_, i) => shiftDays(fieldDay(), -(i + 1)))]

const { check, summarize } = createChecks()
const OUTCOME = ['NoPickSection', 'Passed', 'Picked']

const fetchOutcome = async date => {
  try {
    const res = await fetch(RELAY + date, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) return { date, note: `HTTP ${res.status}` }
    const decoded = decodeBundle(await res.text())
    if (decoded.tag !== 0) return { date, note: `decode error: ${decoded.fields[0]}` }
    return { date, outcome: decoded.fields[0] }
  } catch (e) {
    return { date, note: String(e.message ?? e) }
  }
}

console.log('')
let found = null
for (const date of dates) {
  const result = await fetchOutcome(date)
  const label = result.outcome ? OUTCOME[result.outcome.tag] : result.note
  console.log(`  ${date}  ${label}`)
  // A decode failure is a real failure wherever it appears, not just on the
  // date that happens to carry a board.
  check(`${date} decodes or is cleanly unavailable`,
    !String(result.note ?? '').startsWith('decode error'), result.note ?? '')
  if (!found && result.outcome?.tag === 2) found = result
}
console.log('')

if (!found) {
  // Reported, not hidden, and not failed either: the relay picking on any given
  // night is not something this repo controls.
  console.log('  No live Picked board on any probed date.')
  console.log('  The ranked-list shape remains verified against the transcription ONLY.')
  console.log(`  Probed: ${dates.join(', ')}\n`)
  process.exit(summarize() === 0 ? 0 : 1)
}

const live = found.outcome.fields[0]
const liveChasers = toArray(live.Chasers)
console.log(`  Live Picked board from ${found.date}:`)
console.log(`    leader  : ${entryMatchup(live.Leader)}`)
console.log(`    reasons : ${toArray(live.Leader.Reasons).join(', ')}`)
console.log(`    chasers : ${liveChasers.length}`)
console.log(`    tie     : ${leadershipNote(live.Leadership) ?? 'none'}\n`)

// --- the shape, on live data -------------------------------------------------

check('a live board carries a leader with both teams',
  live.Leader.Home !== '' && live.Leader.Away !== '' && live.Leader.Home !== '—',
  `home "${live.Leader.Home}" away "${live.Leader.Away}"`)

check('a live board carries reasons — the displayable half',
  toArray(live.Leader.Reasons).length > 0,
  'no reasons, so the panel would render an identity and nothing else')

check('a live board carries a ranked list, not just a winner',
  liveChasers.length > 0,
  'ranked collapsed to one entry — the feature being built is the list')

check('every ranked entry has a game id',
  [live.Leader, ...liveChasers].every(e => e.GameId !== ''),
  'an entry arrived without game_id, so the shape has moved')

// --- the transcription, against its own source -------------------------------

if (found.date === FIXTURE_DATE) {
  const fixture = decodePick(readFileSync('data/pick-2026-07-07.json', 'utf8'))
  check('the committed fixture decodes to a Picked board',
    fixture.tag === 0 && fixture.fields[0].tag === 2, 'the fixture no longer decodes')

  if (fixture.tag === 0 && fixture.fields[0].tag === 2) {
    const local = fixture.fields[0].fields[0]
    const localChasers = toArray(local.Chasers)

    check('TRANSCRIPTION: the leader matches the live response',
      local.Leader.GameId === live.Leader.GameId,
      `fixture "${local.Leader.GameId}" vs live "${live.Leader.GameId}"`)

    check('TRANSCRIPTION: the ranked list is the same length',
      localChasers.length === liveChasers.length,
      `fixture ${localChasers.length + 1} entries, live ${liveChasers.length + 1}`)

    check('TRANSCRIPTION: every ranked game id matches, in order',
      localChasers.every((c, i) => c.GameId === liveChasers[i]?.GameId),
      `fixture: ${localChasers.map(c => c.GameId).join(', ')}\n      → live:    ${
        liveChasers.map(c => c.GameId).join(', ')}`)

    check('TRANSCRIPTION: the leader\'s reasons match exactly',
      toArray(local.Leader.Reasons).join('|') === toArray(live.Leader.Reasons).join('|'),
      `fixture "${toArray(local.Leader.Reasons).join('|')}" vs live "${
        toArray(live.Leader.Reasons).join('|')}"`)

    // The claim the whole Leadership type rests on.
    check('TRANSCRIPTION: the three-way tie is real, not a transcription artefact',
      leadershipNote(local.Leadership) === leadershipNote(live.Leadership),
      `fixture "${leadershipNote(local.Leadership)}" vs live "${leadershipNote(live.Leadership)}"`)

    check('TRANSCRIPTION: the brief is on the board in both',
      (local.Brief != null) === (live.Brief != null),
      `fixture brief ${local.Brief != null}, live brief ${live.Brief != null}`)
  }
} else {
  console.log(`  NOTE: ${FIXTURE_DATE} carried no board, so the transcription was NOT`)
  console.log(`        compared against its own source. Shape checks above ran on`)
  console.log(`        ${found.date} instead.\n`)
}

process.exit(summarize() === 0 ? 0 : 1)
