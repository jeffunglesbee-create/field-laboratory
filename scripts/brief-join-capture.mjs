// Capture briefs WITH their game_id, plus the game rows they were written from.
//
// WHY A SEPARATE CAPTURE
//
// `data/jq-mlb-game-corpus.json` projects
//   id, date, created_at, quality_score, word_count, source, brief_text
// — no `game_id`. So a brief cannot be joined to the data it was generated from,
// and the Phase 4 question ("does every number in the brief appear in the data
// the model was given?") cannot be asked at all.
//
// This writes a NEW file rather than re-capturing that one. The corpus is pinned
// at 592 rows by `prose-check`, `ceiling-check`, `corpus-check` and two
// `docs-check` claims; re-fetching it would move the count the moment production
// wrote another brief, and turn a data refresh into six failing checks.
//
// WHAT IT JOINS
//
//   /archive/query?date=D   -> briefs, carrying game_id
//   /context/date/D         -> the game rows, carrying the scoreline
//
// Both are GET and neither needs a credential. That is the whole point: Phase 4
// was described as blocked on captures produced where `X-FIELD-Relay` lives, and
// it is not — the input half already exists in a different table.
//
// THE CHECK THIS ENABLES, and its one honest limit
//
// A brief saying "Orioles lead 4-2" must match `home_score`/`away_score` on its
// game row. That comparison has NO false positives — a scoreline is either the
// scoreline or it is not.
//
// A general "every numeral must appear in the input" check WOULD have false
// positives, because briefs legitimately carry season stats, standings and park
// factors that never appear in the game row. This capture supports the exact
// check; the general one needs the real prompt, which is what a Phase 4 LLM
// capture would add later.

import { writeFileSync } from 'node:fs'

const RELAY = 'https://field-relay-nba.jeffunglesbee.workers.dev'
const OUT = 'data/brief-join-corpus.json'

const FROM = process.env.FROM || '2026-08-01'
const TO = process.env.TO || new Date().toISOString().slice(0, 10)

const dateRange = (a, b) => {
  const out = []
  const d = new Date(a + 'T00:00:00Z'), end = new Date(b + 'T00:00:00Z')
  while (d <= end) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1) }
  return out
}

const get = async url => {
  const r = await fetch(url, { signal: AbortSignal.timeout(30000) })
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`)
  return r.json()
}

const dates = dateRange(FROM, TO)
console.log(`brief-join-capture — ${FROM} .. ${TO} (${dates.length} dates)`)

const briefs = []
const games = []
let failedBrief = 0, failedGames = 0

for (const d of dates) {
  try {
    const j = await get(`${RELAY}/archive/query?date=${d}&limit=100`)
    for (const r of j.results || []) {
      briefs.push({
        id: r.id, date: r.date, brief_type: r.brief_type, sport: r.sport,
        game_id: r.game_id, brief_text: r.brief_text, model: r.model,
        quality_score: r.quality_score, source: r.source, created_at: r.created_at,
        // Captured on purpose even though it is expected to be absent: recording
        // that a field is missing is evidence, and the day it appears this file
        // shows it without anyone editing the capture.
        scoring_version: r.scoring_version ?? null,
      })
    }
  } catch (e) { failedBrief++; console.log(`   ${d}: archive FAILED (${e.message})`) }

  try {
    const j = await get(`${RELAY}/context/date/${d}`)
    const rows = [...(j.games?.regular ?? []), ...(j.games?.postseason ?? [])]
    for (const g of rows) {
      games.push({
        id: g.id, date: g.date, sport: g.sport, home: g.home, away: g.away,
        home_score: g.home_score, away_score: g.away_score, venue: g.venue,
        espn_event_id: g.espn_event_id, start_time: g.start_time,
        finalized_at: g.finalized_at,
      })
    }
  } catch (e) { failedGames++; console.log(`   ${d}: context FAILED (${e.message})`) }
}

// A truncated capture must be loud. Every silent cap in this repo's history
// looked exactly like a clean run.
if (failedBrief) console.log(`::warning::${failedBrief}/${dates.length} archive dates failed`)
if (failedGames) console.log(`::warning::${failedGames}/${dates.length} context dates failed`)

const gameIds = new Set(games.map(g => g.id))
const withGameId = briefs.filter(b => b.game_id)
const joinable = withGameId.filter(b => gameIds.has(b.game_id))
const stamped = briefs.filter(b => b.scoring_version !== null)

console.log('')
console.log(`briefs captured        ${briefs.length}`)
console.log(`  carrying a game_id   ${withGameId.length}`)
console.log(`  JOINABLE to a game   ${joinable.length}`)
console.log(`  carrying scoring_version ${stamped.length}`)
console.log(`game rows captured     ${games.length}`)

// The join rate is the finding. A capture that joins nothing is a capture that
// cannot answer the question it was taken for, and saying so here beats
// discovering it in a check later.
if (joinable.length === 0) {
  console.log('::warning::ZERO briefs joined to a game row — the capture cannot support a scoreline check')
} else {
  console.log(`join rate ${((joinable.length / Math.max(1, withGameId.length)) * 100).toFixed(1)}% of briefs that carry a game_id`)
}

writeFileSync(OUT, JSON.stringify({
  capturedFrom: FROM, capturedTo: TO,
  briefs, games,
}, null, 1) + '\n')
console.log(`\nwrote ${OUT} (${briefs.length} briefs, ${games.length} games)`)
