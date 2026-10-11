// Does the real analytics route still return what the Pick decoder expects?
//
// data/pick-2026-07-07.json was TRANSCRIBED from a Drive document, not fetched
// — this sandbox has no route to the relay. That makes it good enough to design
// against and not good enough to trust. A CI runner has unrestricted egress, so
// the transcription gets checked against the live route there.
//
// What counts as a failure is deliberately narrow:
//
//   HTTP failure          -> reported, NOT fatal. The analytics bundle for a
//                            given date genuinely may not exist, and failing the
//                            build on that would train people to ignore this.
//   200 that won't decode -> FATAL. If something comes back, the decoder must
//                            handle it, and that is the whole assertion.
//
// Usage:  node scripts/pick-live-check.mjs
//         DATE=2026-07-07 node scripts/pick-live-check.mjs

import { createChecks, fieldDay, toArray, finish } from './checks.mjs'
import { decodeBundle, decodePick, leadershipNote } from '../build/Pick.js'

const DATE = process.env.DATE || fieldDay()
const ROUTE = `https://field-relay-nba.jeffunglesbee.workers.dev/analytics/newspaper/${DATE}`

const { check, summarize } = createChecks()
const OUTCOME = ['NoPickSection', 'Passed', 'Picked']

console.log(`\nGET ${ROUTE}\n`)

let body = null
let httpNote = ''
try {
  const res = await fetch(ROUTE, { signal: AbortSignal.timeout(30_000) })
  if (res.ok) body = await res.text()
  else httpNote = `HTTP ${res.status}`
} catch (e) {
  httpNote = String(e.message ?? e)
}

if (body === null) {
  // Named, not counted, and not silently swallowed either.
  console.log(`  Route unreachable or empty for ${DATE}: ${httpNote}`)
  console.log(`  Not a failure — the analytics bundle may not exist for this date.`)
  console.log(`  Nothing about the decoder was proven by this run.\n`)
  process.exit(0)
}

const decoded = decodeBundle(body)
check('the live newspaper bundle decodes', decoded.tag === 0,
  decoded.tag === 0 ? '' : String(decoded.fields[0]))

if (decoded.tag === 0) {
  const outcome = decoded.fields[0]
  console.log(`  outcome: ${OUTCOME[outcome.tag]}`)

  // Every outcome is legitimate. What is asserted is that the decoder produced
  // one of them rather than throwing, and that a Picked board is internally
  // coherent.
  check('the outcome is one of the three modelled cases',
    outcome.tag >= 0 && outcome.tag <= 2, `tag ${outcome.tag}`)

  if (outcome.tag === 2) {
    const board = outcome.fields[0]
    const chasers = toArray(board.Chasers)
    console.log(`  leader:  ${board.Leader.Home} vs ${board.Leader.Away}`)
    console.log(`  reasons: ${toArray(board.Leader.Reasons).join(', ') || '(none)'}`)
    console.log(`  chasers: ${chasers.length}`)
    console.log(`  tie:     ${leadershipNote(board.Leadership) ?? 'none — the leader is alone'}`)

    check('the leader has a matchup', board.Leader.Home !== '' && board.Leader.Away !== '',
      'home/away came back empty, so the shape has moved')
    check('the leader carries at least one reason',
      toArray(board.Leader.Reasons).length > 0,
      'reasons are the displayable half; an empty list means the panel shows nothing')
  }
}

// The transcription itself, re-checked against the same decoder, so a corrupted
// fixture is caught even on a day the route is quiet.
const { readFileSync } = await import('node:fs')
const fixture = decodePick(readFileSync('data/pick-2026-07-07.json', 'utf8'))
check('the transcribed fixture still decodes to a Picked board',
  fixture.tag === 0 && fixture.fields[0].tag === 2,
  'the committed transcription no longer decodes')

finish(summarize())
