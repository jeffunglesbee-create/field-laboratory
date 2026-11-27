#!/usr/bin/env node
// The DATA step of docs/CC-CMD-2026-11-27-uefa-forecast-on-tonights-cards.md, Task 2: two bundles of archive rows for outbox/forecast-fit-uefa-2026-11-27.mjs, whose RULE was
// committed first (dc9fdce5, RULE block sha256 6cf976ba8b895439894346c066c22ff752d2789b208cdccdb563ddae41118cf1). This script computes NO model number: it reads the relay's
// /context/date/<date> for every day of a window and keeps the rows of the three main UEFA labels, with the fields the rule reads and no others. Integrity COUNTS are printed.
//
//   node scripts/uefa-fit-data.mjs --from 2025-09-01 --to 2026-07-31 --out outbox/forecast-uefa-data-2025-26-2026-11-27.json
//   node scripts/uefa-fit-data.mjs --from 2026-08-01 --to 2026-11-26 --out outbox/forecast-uefa-data-2026-27-frozen-2026-11-27.json
//
// EVERY DAY IS READ. A day that does not answer HTTP 200 with the expected shape (after one retry) stops the run and writes nothing: a missing day is never an empty day (the same rule
// as field-relay-nba's reach probe). The relay route is the owner's own archive, ESPN-sourced; the match data's licence is NOT assessed here (STANDARDS Rule 45), flagged for a human.
import fs from 'node:fs'
import { createHash } from 'node:crypto'

const RELAY = process.env.RELAY_URL || 'https://field-relay-nba.jeffunglesbee.workers.dev'
const LABELS = ['UEFA Champions League', 'UEFA Europa League', 'UEFA Europa Conference League']
const FIELDS = ['id', 'sport', 'date', 'home', 'away', 'home_score', 'away_score', 'start_time', 'espn_event_id']
const argv = process.argv.slice(2)
const arg = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null }
const from = arg('--from'), to = arg('--to'), out = arg('--out')
const DAY = /^\d{4}-\d{2}-\d{2}$/
if (!DAY.test(from ?? '') || !DAY.test(to ?? '') || !out || from > to) { console.error('usage: node scripts/uefa-fit-data.mjs --from YYYY-MM-DD --to YYYY-MM-DD --out <file.json>'); process.exit(2) }

const days = []
for (let t = Date.parse(from + 'T00:00:00Z'); t <= Date.parse(to + 'T00:00:00Z'); t += 86400000) days.push(new Date(t).toISOString().slice(0, 10))
if (days.length > 400) { console.error(`${days.length} days is more than the 400-day cap`); process.exit(2) }

const sleep = ms => new Promise(r => setTimeout(r, ms))
async function readDay(d) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(`${RELAY}/context/date/${d}`, { signal: AbortSignal.timeout(30000) })
      if (res.status === 200) {
        const j = await res.json()
        if (j && j.ok === true && j.date === d && j.games && Array.isArray(j.games.regular)) return { status: 200, rows: j.games.regular.concat(Array.isArray(j.games.postseason) ? j.games.postseason : []) }
      }
      if (attempt === 2) return { status: res.status, rows: null }
    } catch (e) { if (attempt === 2) return { status: 0, rows: null, error: String(e).slice(0, 120) } }
    await sleep(1500)
  }
  return { status: 0, rows: null }
}

const statuses = {}
const kept = []
const seen = new Set()
let duplicates = 0, otherUefaLabels = 0
for (const d of days) {
  const r = await readDay(d)
  statuses[r.status] = (statuses[r.status] ?? 0) + 1
  if (r.rows === null) { console.error(`STOP: ${d} did not answer 200 with the expected shape (status ${r.status}${r.error ? ', ' + r.error : ''}); nothing written`); process.exit(1) }
  for (const row of r.rows) {
    if (!row || typeof row !== 'object') continue
    if (typeof row.sport === 'string' && row.sport.startsWith('UEFA') && !LABELS.includes(row.sport)) otherUefaLabels++
    if (!LABELS.includes(row.sport)) continue
    if (seen.has(row.id)) { duplicates++; continue }
    seen.add(row.id)
    kept.push(Object.fromEntries(FIELDS.map(f => [f, row[f] ?? null])))
  }
  await sleep(250)
}
kept.sort((a, b) => (a.sport < b.sport ? -1 : a.sport > b.sport ? 1 : a.date < b.date ? -1 : a.date > b.date ? 1 : (a.start_time ?? '') < (b.start_time ?? '') ? -1 : (a.start_time ?? '') > (b.start_time ?? '') ? 1 : a.id < b.id ? -1 : 1))

const byLabel = Object.fromEntries(LABELS.map(l => [l, kept.filter(r => r.sport === l).length]))
const nullScores = kept.filter(r => r.home_score === null || r.away_score === null).length
const bundle = {
  what: 'Archive rows of the three main UEFA labels, read from the relay /context/date for every day of the window. No model number is computed here (outbox/forecast-fit-uefa-2026-11-27.mjs holds the rule, fixed first).',
  route: '/context/date/<date>', from, to, daysRead: days.length, statuses, labels: LABELS, fields: FIELDS,
  counts: { rows: kept.length, byLabel, nullScores, duplicateIds: duplicates, otherUefaLabelRowsIgnored: otherUefaLabels },
  rows: kept,
}
const text = JSON.stringify(bundle, null, 1) + '\n'
fs.writeFileSync(out, text)
console.log(`${out}: ${days.length} days read (${JSON.stringify(statuses)}); ${kept.length} rows ${JSON.stringify(byLabel)}; null scores ${nullScores}; duplicate ids ${duplicates}; other UEFA labels ignored ${otherUefaLabels}`)
console.log(`sha256 ${createHash('sha256').update(text).digest('hex')}  ${out}  (${Buffer.byteLength(text)} bytes)`)
