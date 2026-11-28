#!/usr/bin/env node
// A STRUCTURAL CENSUS of one window of the three UEFA competitions: counts of the league-phase structure the replication rule's G3 expects (outbox/forecast-replicate-uefa-2026-11-28.mjs, G3 (d), (e), (g), (h), (i), (m)), printed WITHOUT any score, team or per-match line. It exists so that those expectations are
// tried on the real calendar BEFORE the rule is fixed (Rule 100): a property of the 2024-25 calendar that does not hold would otherwise void the run at G3, where the rule forbids repair.
// It is a standalone second implementation of the counting rule (it shares nothing with scripts/uefa-replicate-score.mjs but the collector), and later its counts are compared with the scoring module's on the same bundle.
//   node scripts/uefa-structure-census.mjs --from 2024-09-01 --to 2025-06-30
// The constants are the rule's: N 8 / 8 / 6, K 3. A club is its ESPN team id. League-phase match: BOTH clubs have played fewer than N earlier events in that competition's rows (earlier = by (date, Date.parse(start_time), Number(espn_event_id))).
// Eligible: both clubs have at least K SCORED league-phase matches before it (a scored match: both scores present; the value of a score is never read).
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { collect } from './uefa-replication-data.mjs'

const N = { 'UEFA Champions League': 8, 'UEFA Europa League': 8, 'UEFA Europa Conference League': 6 }, K = 3
const cmp = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (Date.parse(a.start_time) - Date.parse(b.start_time)) || (Number(a.espn_event_id) - Number(b.espn_event_id)))

/** The structural counts of a bundle's rows, per competition label. Counts only. */
export function structureOf(rows) {
  const out = {}
  for (const label of Object.keys(N)) {
    const rs = rows.filter(r => r.sport === label).sort(cmp)
    const played = new Map(), lpCount = new Map(), scored = new Map(), days = new Set()
    let lp = 0, eligible = 0, twoOnOneDate = 0, sameClub = 0, nullScore = 0
    const statusOfLp = {}
    for (const r of rs) {
      if (r.home === r.away) sameClub++
      for (const c of [r.home, r.away]) { const k = `${c}|${r.date}`; if (days.has(k)) twoOnOneDate++; days.add(k) }
      const isLp = (played.get(r.home) ?? 0) < N[label] && (played.get(r.away) ?? 0) < N[label]
      if (isLp) {
        lp++
        statusOfLp[r.status ?? 'null'] = (statusOfLp[r.status ?? 'null'] ?? 0) + 1
        const ok = r.home_score !== null && r.away_score !== null
        if (!ok) nullScore++
        if ((scored.get(r.home) ?? 0) >= K && (scored.get(r.away) ?? 0) >= K) eligible++
        for (const c of [r.home, r.away]) lpCount.set(c, (lpCount.get(c) ?? 0) + 1)
        if (ok) for (const c of [r.home, r.away]) scored.set(c, (scored.get(c) ?? 0) + 1)
      }
      for (const c of [r.home, r.away]) played.set(c, (played.get(c) ?? 0) + 1)
    }
    out[label] = { events: rs.length, leaguePhase: lp, distinctClubs: played.size, clubsNotOnN: [...played.keys()].filter(c => (lpCount.get(c) ?? 0) !== N[label]).length, twoOnOneDate, sameClub, nullScore, eligible, opening: lp - eligible, statusOfLp, afterLeaguePhase: rs.length - lp }
  }
  return out
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const arg = k => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null }
  const from = arg('--from'), to = arg('--to')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(to ?? '')) { console.error('usage: node scripts/uefa-structure-census.mjs --from YYYY-MM-DD --to YYYY-MM-DD'); process.exit(2) }
  const UA = 'FIELD-laboratory/1.0 (read-only research; github.com/jeffunglesbee-create/field-laboratory)'
  const res = await collect({ from, to, get: url => fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) }), spacingMs: 350 })
  if (res.stopped) { console.error(`STOP: ${res.stopped}; nothing printed`); process.exit(1) }
  console.log(`STRUCTURE CENSUS ${from} to ${to}: ${res.bundle.daysRead} days x ${res.bundle.slugs.length} competitions read (${JSON.stringify(res.bundle.statuses)}); counts only, no score, team or match line`)
  for (const [label, c] of Object.entries(structureOf(res.bundle.rows))) console.log(`${label}: events ${c.events}, league-phase matches by the counting rule ${c.leaguePhase}, distinct clubs ${c.distinctClubs}, clubs not on exactly ${N[label]} league-phase matches ${c.clubsNotOnN}, club-on-one-date repeats ${c.twoOnOneDate}, matches with one club on both sides ${c.sameClub}, null scores in league-phase matches ${c.nullScore}, eligible forecasts ${c.eligible}, opening matches (not forecast) ${c.opening}, league-phase status names ${JSON.stringify(c.statusOfLp)}, events after the league phase ${c.afterLeaguePhase}`)
}
