// Capture a REAL /bsd/tennis/matches/live payload as a decoder fixture.
//
// WHY THIS EXISTS. field-relay-nba serves /bsd/tennis/matches/live and
// /bsd/tennis/matches/{id}, and measured 2026-09-06, NOTHING consumes either:
// zero matches for `bsd/tennis` in jubilant-bassoon's src/legacy/field.js.
// The client's only tennis is two hardcoded tournament windows — Italian Open
// May 6-17 and Roland Garros May 24 - June 7 — both of which closed months ago,
// so `fetchATPLiveScores()` returns at its first line for want of a section to
// attach to. Tennis renders nothing while the US Open is playing.
//
// The same day's competition census put 636 tournaments on BSD's tennis
// surface against 83 on football. The largest surface the vendor serves is the
// one FIELD shows nothing from.
//
// WHY A FIXTURE AND NOT A LIVE CALL. A tennis scoreline is a shape no decoder
// here can express: `sets_detail` is an array of {p1,p2}, and every Sport case
// this repo models is a two-number scoreline under HomeVersusAway or
// AwayAtHome. A decoder for a new shape gets written against the REAL payload
// or it gets written against an imagined one, and this repo's own rule is that
// reading is a simulation of execution. The fixture is the execution.
//
// CAPTURED, never hand-written. Rule 1 — a hand-made row is an invented row.
//
// CI-only: the sandbox 403s *.workers.dev.

import { writeFileSync, appendFileSync } from 'node:fs'

const RELAY = process.env.RELAY_URL || 'https://field-relay-nba.jeffunglesbee.workers.dev'
const PATH = '/bsd/tennis/matches/live'

// Three states. An unreachable relay is not an empty draw.
let payload = null
try {
  const r = await fetch(`${RELAY}${PATH}`)
  if (!r.ok) { console.error(`UNREACHABLE — HTTP ${r.status}. Nothing captured.`); process.exit(1) }
  payload = await r.json()
} catch (e) { console.error(`UNREACHABLE — ${e.message}. Nothing captured.`); process.exit(1) }

const rows = Array.isArray(payload) ? payload : (payload?.results ?? payload?.matches ?? [])
if (!Array.isArray(rows)) {
  console.error(`REFUSED — payload is not an array and carries no results/matches array.`)
  console.error(`  top-level keys: ${Object.keys(payload ?? {}).join(', ')}`)
  process.exit(1)
}

const tournaments = [...new Set(rows.map(m => m?.tournament?.name).filter(Boolean))].sort()
const statuses = [...new Set(rows.map(m => m?.status).filter(Boolean))].sort()
const withSets = rows.filter(m => Array.isArray(m?.sets_detail) && m.sets_detail.length).length

console.log(`\n  ${rows.length} live match(es), ${tournaments.length} tournament(s)`)
console.log(`  statuses: ${statuses.join(', ') || '(none)'}`)
console.log(`  carrying sets_detail: ${withSets}`)
console.log(`  ${tournaments.join(' | ')}\n`)

// A fixture the decoder cannot be exercised against is not a fixture. The whole
// reason to capture tennis is `sets_detail`, so a payload where no match
// carries one proves nothing about the shape being modelled — an off-hours
// capture would sail through a bare row-count floor and leave the decoder
// tested against nothing.
if (!rows.length) {
  console.error('REFUSED — zero live matches. Capture while play is on.')
  process.exit(1)
}
if (!withSets) {
  console.error('REFUSED — no match carries sets_detail, the one shape this fixture exists for.')
  process.exit(1)
}

const out = 'data/tennis-live.json'
writeFileSync(out, JSON.stringify(payload, null, 1) + '\n')
console.log(`  wrote ${out}\n`)

appendFileSync('data/PROVENANCE.md',
  `\n- \`tennis-live.json\` — captured ${new Date().toISOString().slice(0, 10)} from ` +
  `\`${RELAY}${PATH}\` by \`scripts/capture-tennis-fixture.mjs\`. ` +
  `${rows.length} live matches, ${tournaments.length} tournaments, ${withSets} carrying sets_detail. ` +
  `Statuses seen: ${statuses.join(', ')}. ` +
  `Unedited — a hand-modified fixture is an invented one.\n`)
console.log('  appended provenance\n')
