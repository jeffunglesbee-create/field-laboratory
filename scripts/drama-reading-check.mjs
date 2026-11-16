// The relay's drama 0 is a mark, not a measurement, and the stats panel must
// say so.
//
// WHAT BROKE
//
// field-relay-nba/scripts/drama-backfill.mjs writes `drama_peak = 0,
// drama_arc = null` for every game it cannot score: a sport `classifySport`
// calls `other` (NBA, NHL, NFL, CFB, golf ...) or an event ESPN does not have.
// The laboratory decoded that 0 as a peak, and the stats panel printed
// "DRAMA 0" under every NBA, NHL, NFL and CFB final, overtime games included.
//
// ARCHIVE_DB, read 2026-11-15, every row carrying a peak: 2,101 with peak 0 and
// arc the string "null", 2,827 with a positive peak and a list of points, no
// other combination. So the arc tells the two apart, and `Desk.DramaReading`
// does it at the decode boundary.
//
// WHAT THIS HOLDS
//
//   1. on a committed real payload, every peak-0 / no-arc row is NotScored and
//      every positive row is Scored (counts printed, both non-zero)
//   2. the stats report says "not scored by the relay" for the mark, and no
//      report on that payload carries a DRAMA row of "0"
//   3. a 0 WITH an arc is still a reading: the rule keys on the arc, not on
//      the number alone, so a real 0 is not swallowed
//   4. an absent peak is still absent (None), not NotScored
//
// Usage:  node scripts/drama-reading-check.mjs   (needs build/)

import { readFileSync } from 'node:fs'
import { createChecks, finish } from './checks.mjs'
import { decodePayload, gameStateAt } from '../build/Desk.js'
import { reportFor } from '../build/StatsView.js'
import { rowLabel, rowValue } from '../build/Stats.js'

const { check, summarize } = createChecks()
const READING = ['Scored', 'NotScored']

const FIXTURE = 'data/context-2026-10-10.json'
const raw = JSON.parse(readFileSync(FIXTURE, 'utf8'))
const decoded = decodePayload(JSON.stringify(raw))
check(`${FIXTURE} decodes`, decoded.tag === 0, decoded.tag === 0 ? '' : String(decoded.fields[0]))

const payload = decoded.fields[0]
const games = [...Array.from(payload.Regular), ...Array.from(payload.Postseason)]
const rawById = new Map([...(raw.games.regular || []), ...(raw.games.postseason || [])].map(g => [g.id, g]))
const readingOf = g => (g.DramaPeak == null ? 'None' : READING[g.DramaPeak.tag])

const marks = games.filter(g => { const r = rawById.get(g.Id); return r.drama_peak === 0 && r.drama_arc === 'null' })
const scored = games.filter(g => rawById.get(g.Id).drama_peak > 0)
check(`the payload carries both kinds (${marks.length} marks, ${scored.length} scored, of ${games.length} games)`,
  marks.length > 0 && scored.length > 0, 'a fixture without both cannot discriminate')
const badMarks = marks.filter(g => readingOf(g) !== 'NotScored')
check(`every peak-0 / no-arc row is NotScored (${marks.length - badMarks.length} of ${marks.length})`,
  badMarks.length === 0, badMarks.slice(0, 3).map(g => `${g.Id}: ${readingOf(g)}`).join('; '))
const badScored = scored.filter(g => readingOf(g) !== 'Scored')
check(`every positive peak is Scored (${scored.length - badScored.length} of ${scored.length})`,
  badScored.length === 0, badScored.slice(0, 3).map(g => `${g.Id}: ${readingOf(g)}`).join('; '))

// The report, built by the same function the panel renders from.
const dramaRows = g => Array.from(reportFor([], g).Rows).filter(r => rowLabel(r) === 'DRAMA').map(rowValue)
// Drama shows on finals only (the ADR-002 amnesty witness), so the mark is
// asserted on the finals. State at a fixed instant, never the wall clock.
// On this payload two golf rows read Scheduled (no away score) and get no
// drama row at all, which is the gate working; they are counted, not hidden.
const AT = new Date('2026-11-15T00:00:00Z')
const finalMarks = marks.filter(g => gameStateAt(AT, g).tag === 2)
const markRows = finalMarks.map(dramaRows)
check(`the stats report states the mark in words on every final (${markRows.filter(r => r[0] === 'not scored by the relay').length} of ${finalMarks.length} final marks; ${marks.length - finalMarks.length} not final, no drama row)`,
  finalMarks.length > 0 &&
  markRows.every(r => r.length === 1 && r[0] === 'not scored by the relay'),
  `first: ${JSON.stringify(markRows.find(r => r[0] !== 'not scored by the relay'))}`)
const zeroRows = games.filter(g => dramaRows(g).includes('0'))
check(`no report on the payload carries "DRAMA 0" (${games.length} reports read)`,
  zeroRows.length === 0, zeroRows.slice(0, 3).map(g => g.Id).join(', '))
const scoredRows = scored.map(dramaRows)
check('a scored final still shows its peak as a number',
  scoredRows.some(r => r.length === 1 && /^\d+$/.test(r[0])), `got ${JSON.stringify(scoredRows.slice(0, 3))}`)

// Synthetic edges, decoded through the same path.
const one = extra => {
  const g = { ...raw.games.regular.find(x => x.id === marks[0].Id), ...extra }
  const p = decodePayload(JSON.stringify({ ...raw, games: { regular: [g], postseason: [] } }))
  return p.tag === 0 ? readingOf(Array.from(p.fields[0].Regular)[0]) : `decode error ${p.fields[0]}`
}
check('a 0 that carries an arc is a reading, not the mark', one({ drama_arc: '[0,0,0]' }) === 'Scored',
  `got ${one({ drama_arc: '[0,0,0]' })}`)
check('an absent peak stays absent', one({ drama_peak: null, drama_arc: null }) === 'None',
  `got ${one({ drama_peak: null, drama_arc: null })}`)

finish(summarize())
