// Capture a REAL /bsd/tennis/draw payload as a fixture for Draw.fs.
//
// WHY. Draw.fs's eleven suite rows use four-player mini draws — two semi-finals
// and a final — because a mutation has to be READABLE to be trustworthy, and a
// 127-match edition is not. That is the right call for the refusal rows and it
// leaves one thing unproven: that the module decodes an actual slam.
//
// WHICH DRAW, AND WHY THIS ONE. Roland Garros WTA 2026, BSD tournament id 77.
// Measured 2026-09-06 by scripts/verify-tennis-draw.mjs against the deployed
// route, it is the only one of the three editions checked that answers 200 and
// is canonical throughout:
//
//   77/2026  64 32 16 8 4 2 1   126 edges, all re-derived, 0 anomalies
//   135/2025 409 — a player in two Round of 128 rows
//   14/2026  409 — two players in two Round of 128 rows each
//
// A complete, finished, canonical draw is the fixture that exercises every path
// in the module: seven rounds, a champion, and every edge joined.
//
// REFUSALS. A capture that is not a complete edition is not this fixture. All
// four are checked and each names what it is protecting:
//
//   not 200          — an unreachable relay is not an empty draw
//   fewer than 7 rounds — a draw still in its first week; the fixture would
//                      verify four rounds and look like it verified seven
//   no Final winner  — a draw in progress has no champion, and champion() is
//                      one of the two read paths this fixture exists to run
//   zero edges       — every List.forall in the suite is vacuous on nothing
//
// CI-only: the sandbox 403s *.workers.dev.

import { writeFileSync, appendFileSync } from 'node:fs'

const RELAY = process.env.RELAY_URL || 'https://field-relay-nba.jeffunglesbee.workers.dev'
const TID = process.env.DRAW_TOURNAMENT || '77'
const SEASON = process.env.DRAW_SEASON || '2026'
const PATH = `/bsd/tennis/draw?tournament=${TID}&season=${SEASON}`

let payload = null
try {
  const r = await fetch(`${RELAY}${PATH}`)
  if (!r.ok) {
    const body = await r.text()
    console.error(`REFUSED — HTTP ${r.status}. Nothing captured.`)
    console.error(`  ${body.slice(0, 400)}`)
    process.exit(1)
  }
  payload = await r.json()
} catch (e) { console.error(`UNREACHABLE — ${e.message}. Nothing captured.`); process.exit(1) }

const rounds = payload?.rounds ?? []
const nodes = payload?.nodes ?? []
const edges = payload?.edges ?? []
const final = nodes.find(n => n.round === 'Final')
const champion = final && final.winnerId != null
  ? [final.p1, final.p2].find(p => p?.id === final.winnerId)?.name ?? null
  : null

console.log(`\n  ${payload?.tournament?.name ?? '?'} ${payload?.season ?? '?'}`)
console.log(`  ladder: ${rounds.map(r => `${r.round}=${r.matches}`).join(' · ')}`)
console.log(`  ${nodes.length} node(s), ${edges.length} edge(s)`)
console.log(`  anomalies: ${(payload?.anomalies ?? []).map(a => a.kind).join(', ') || 'none'}`)
console.log(`  champion: ${champion ?? '(final unplayed)'}\n`)

if (rounds.length < 7) {
  console.error(`REFUSED — ${rounds.length} round(s). A partial draw would verify four rounds`)
  console.error('  and read as having verified seven.')
  process.exit(1)
}
if (!champion) {
  console.error('REFUSED — the final has no winner, so champion() would not be exercised.')
  process.exit(1)
}
if (!edges.length) {
  console.error('REFUSED — zero edges. Every List.forall in the suite is vacuous on nothing.')
  process.exit(1)
}

const out = 'data/tennis-draw.json'
writeFileSync(out, JSON.stringify(payload, null, 1) + '\n')
console.log(`  wrote ${out}\n`)

appendFileSync('data/PROVENANCE.md',
  `\n- \`tennis-draw.json\` — captured ${new Date().toISOString().slice(0, 10)} from ` +
  `\`${RELAY}${PATH}\` by \`scripts/capture-tennis-draw.mjs\`. ` +
  `${payload?.tournament?.name} ${payload?.season}: ${nodes.length} main-draw matches, ` +
  `${edges.length} edges joined by winner identity, champion ${champion}. ` +
  `Ladder ${rounds.map(r => r.matches).join('/')}. ` +
  `Unedited — a hand-modified fixture is an invented one.\n`)
console.log('  appended provenance\n')
