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
import { joinCensus, formatCensus } from './game-id-scheme.mjs'

const RELAY = 'https://field-relay-nba.jeffunglesbee.workers.dev'
// The output path is an INPUT. `data/brief-join-corpus.json` is pinned at
// `briefs.length === 542 && games.length === 469` by game-id-check.mjs:117, and
// at 97 games with no espn_event_id by :167 -- so re-capturing over it turns a
// data refresh into three failing assertions. That is the same reasoning this
// script's own header gives for not re-capturing jq-mlb-game-corpus.json; it
// simply had one hardcoded destination and so could only obey it once.
const OUT = process.env.OUT || 'data/brief-join-corpus.json'

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
        // created_at DOES NOT MOVE ON REWRITE. Three of the relay's brief
        // writers use ON CONFLICT(id) DO UPDATE (field-relay-nba/src/index.js
        // 5975, 12036, 12492), so brief_text is replaced in place while
        // created_at keeps its original value forever -- recorded in that repo
        // at index.js:5445 with a measured case, a brief carrying a fabricated
        // figure at 19:09 that was clean at 21:14 and still reported
        // created_at 18:30:53.
        //
        // Measured here on the committed corpus, on the 10 final games carrying
        // both a live-state and a finished-state brief: ordering by created_at
        // picks the finished brief 4 times and the live one 6. It is not an
        // ordering key. /archive/query has served updated_at since 2026-08-23
        // (index.js:12000, "additive so no consumer moves") and this projection
        // simply never asked for it.
        updated_at: r.updated_at ?? null,
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

const stamped = briefs.filter(b => b.scoring_version !== null)
const census = joinCensus(briefs, games)

console.log('')
console.log(`briefs captured        ${briefs.length}`)
console.log(`  carrying a game_id   ${census.withGameId}`)
console.log(`  JOINABLE to a game   ${census.joined}`)
console.log(`  carrying scoring_version ${stamped.length}`)
console.log(`game rows captured     ${games.length}`)
console.log('')

// Per scheme, not one aggregate. The first run of this script reported a single
// "6.2%" — true, and useless: it read as a weak signal when the real shape was
// one scheme joining at 92% and three others at zero. `game_id` holds seven key
// spaces with no column saying which, so one rate averages incomparable things.
console.log(formatCensus(census))

if (census.joined === 0) {
  console.log('::warning::ZERO briefs joined to a game row — the capture cannot support a scoreline check')
}

// A scheme nothing recognises is the signal that production started writing a
// key space this repo has never seen. Louder than a moved rate, because the
// rate can absorb it silently.
const unrec = census.census.find(r => r.scheme === 'unrecognised')
if (unrec && unrec.briefs > 0) {
  console.log(`::warning::${unrec.briefs} game_id(s) match no known scheme — scripts/game-id-scheme.mjs needs a new case`)
}

writeFileSync(OUT, JSON.stringify({
  capturedFrom: FROM, capturedTo: TO,
  briefs, games,
}, null, 1) + '\n')
console.log(`\nwrote ${OUT} (${briefs.length} briefs, ${games.length} games)`)
