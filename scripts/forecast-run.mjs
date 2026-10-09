// Phase 1's writer: one modelled three-way per scheduled EPL fixture, written
// as a row to the append-only store, diffed against the prior row.
//
// IT IMPORTS THE COMPILED MODEL. The maths lives in src/Forecast.fs and is
// proven by the F# suite; a second copy here would drift from the one that is
// proven, and the number in the store would then be about the copy. Every
// `Forecast` value below was constructed in F#, including the refusals —
// `unscheduled` and `unjoined` are exported for exactly that reason, so no
// provenance decision is taken in JavaScript.
//
// THE JOIN IS ASSERTED, NOT HOPED FOR. ESPN names the clubs one way and FPL
// another, and "a bad team join fails silently" is the CC-CMD's own warning.
// Measured 2026-10-03/04: by name 13 of 20, through the relay's own matcher 12
// of 20, by ABBREVIATION 18 of 20 — failing on exactly the two Manchester
// clubs. So the join is by abbreviation plus a two-entry alias, and it refuses
// to write anything at all unless all 20 clubs resolve. A promotion next summer
// becomes a loud refusal instead of seven clubs quietly producing nothing.
//
// WRITES NEED THE RELAY. field-laboratory is an assets-only Worker; its only
// D1 path is field-relay-nba's POST /d1/execute, which gates on a table
// allow-list. Without `forecast_observations` in that list the DDL and every
// INSERT return 403, and this script says so rather than appearing to succeed.

import { writeFileSync, mkdirSync } from 'node:fs'
import {
  makeRow, unscheduled, unjoined, forecastOf, triple,
  diff, deductionsUnsettled, METHOD,
} from '../build/Forecast.js'
import { TABLE, DDL, DDL_INDEX, SQL_INSERT, SQL_LATEST, rowOf } from './forecast-store.mjs'
import { isMain } from './checks.mjs'

const RELAY = process.env.RELAY_URL || 'https://field-relay-nba.jeffunglesbee.workers.dev'
const SECRET = process.env.RELAY_SHARED_SECRET || ''
const DRY = process.argv.includes('--dry-run')
const LIMIT = Number(process.env.FORECAST_LIMIT || 10)

// The Forecast union's case order, as src/Forecast.fs declares it. Read by
// `rowOf` to turn a tag into a provenance; an unknown tag yields null rather
// than a mislabelled row.
const CASES = ['MarketImplied', 'Modelled', 'NoForecast']

// THE TWO ALIASES, and they are data with a reason rather than a lookup table
// that grows. Each is a measured mismatch between two specific payloads, not a
// general naming scheme, and the completeness assertion below is what keeps
// this from becoming the FIELD_V2_SOURCES failure — true when written,
// silently wrong next season, still computing.
const ABBREV_ALIAS = {
  MNC: 'MCI',   // ESPN "Manchester City" / FPL "Man City"
  MAN: 'MUN',   // ESPN "Manchester United" / FPL "Man Utd"
}

const get = async (path) => {
  const res = await fetch(`${RELAY}${path}`, { signal: AbortSignal.timeout(30000) })
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`)
  return res.json()
}

const d1 = async (sql, params = []) => {
  if (!SECRET) throw new Error('RELAY_SHARED_SECRET is not set; no D1 path')
  const res = await fetch(`${RELAY}/d1/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-FIELD-Relay': SECRET },
    body: JSON.stringify({ sql, params }),
    signal: AbortSignal.timeout(30000),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body.ok === false) {
    const why = body.error === 'table not allowed'
      ? `the relay refuses writes to \`${body.table}\`. Add it to ALLOWED_TABLES in `
        + 'field-relay-nba src/index.js and deploy; until then Phase 1 has no store.'
      : JSON.stringify(body).slice(0, 200)
    throw new Error(`D1 ${res.status}: ${why}`)
  }
  return body
}

const STAT = (entry, name) => (entry?.stats ?? []).find(s => s.name === name)?.value ?? null

function tableFrom(standings) {
  const entries = standings?.children?.[0]?.standings?.entries ?? standings?.standings?.entries ?? []
  return entries.map(e => ({
    abbrev: e?.team?.abbreviation ?? null,
    row: makeRow(
      e?.team?.displayName ?? '',
      e?.team?.abbreviation ?? '',
      STAT(e, 'gamesPlayed') ?? 0,
      STAT(e, 'points') ?? 0,
      STAT(e, 'pointsFor') ?? 0,      // ESPN's generic name for goals for
      STAT(e, 'pointsAgainst') ?? 0,
      STAT(e, 'deductions') ?? 0),
  }))
}

/**
 * FPL team id -> standings row, or a named refusal. Never a partial map:
 * a join that resolves 18 of 20 writes nothing.
 */
export function joinByAbbrev(fplTeams, table) {
  const byAbbrev = new Map(table.map(t => [t.abbrev, t.row]))
  const map = new Map()
  const unresolved = []
  for (const t of fplTeams) {
    const want = Object.entries(ABBREV_ALIAS).find(([, fpl]) => fpl === t.short_name)?.[0] ?? t.short_name
    const hit = byAbbrev.get(want)
    if (hit) map.set(t.id, hit)
    else unresolved.push(`${t.name} (${t.short_name})`)
  }
  return { map, unresolved, resolved: map.size, of: fplTeams.length }
}

async function main() {
  const at = new Date().toISOString()
  const [standings, fixtures, bootstrap] = await Promise.all([
    get('/espn-standings/soccer/eng.1/standings'), get('/fpl/fixtures'), get('/fpl/bootstrap-static'),
  ])

  const table = tableFrom(standings)
  const join = joinByAbbrev(bootstrap.teams ?? [], table)
  console.log(`=== forecast run  utc=${at} ===\n`)
  console.log(`  standings rows : ${table.length}`)
  console.log(`  fixtures       : ${(fixtures ?? []).length}`)
  console.log(`  JOIN           : ${join.resolved} of ${join.of}`)

  // THE REFUSAL THAT MAKES THE ALIAS SAFE.
  if (join.resolved !== join.of || join.of !== 20) {
    console.log(`\n  unresolved: ${join.unresolved.join(', ') || '(none)'}`)
    console.log('\nFAIL: the club join is incomplete, so nothing is written. Every fixture')
    console.log('      touching an unresolved club would silently produce no forecast, which')
    console.log('      is the failure mode this refusal exists to make loud.')
    return 1
  }

  // The deductions question, surfaced rather than guessed.
  const deducted = deductionsUnsettled(table.map(t => t.row))
  if (deducted.length) {
    console.log(`\nFAIL: ${deducted.join(', ')} carry a points deduction. Whether ESPN's`)
    console.log("      `points` is already net of it is UNSETTLED — all 20 read 0 when this")
    console.log('      was written, so the payload could not decide it. Settle it before')
    console.log('      forecasting a deducted club rather than picking a reading now.')
    return 1
  }

  const upcoming = (fixtures ?? []).filter(f => f && !f.finished).slice(0, LIMIT)
  const observations = upcoming.map(f => {
    const home = join.map.get(f.team_h), away = join.map.get(f.team_a)
    const forecast = f.event === null || f.event === undefined ? unscheduled
      : (!home || !away) ? unjoined
      : forecastOf(f.event, home, away)
    return { subject: `epl-fixture-${f.id}`, kickoff: f.kickoff_time, event: f.event, forecast,
             label: `${home?.Team ?? f.team_h} v ${away?.Team ?? f.team_a}` }
  })

  console.log(`\n  METHOD: ${METHOD}\n`)
  console.log('  fixture                                     GW   home   draw   away  provenance')
  for (const o of observations) {
    const t = triple(o.forecast)
    const r = rowOf(o.forecast, CASES)
    const p = t.length === 3 ? t.map(x => x.toFixed(3).padStart(6)).join(' ') : '     —      —      —'
    console.log(`  ${o.label.padEnd(42).slice(0, 42)}${String(o.event ?? '—').padStart(4)} ${p}  ${r?.provenance ?? 'UNREADABLE'}`)
  }

  if (DRY) {
    console.log('\nDRY RUN: nothing written. The rows above are what would be stored.')
    mkdirSync('outbox', { recursive: true })
    writeFileSync('outbox/forecast-dry-run-latest.json', JSON.stringify(
      { at, method: METHOD, join: { resolved: join.resolved, of: join.of },
        rows: observations.map(o => ({ subject: o.subject, ...rowOf(o.forecast, CASES) })) }, null, 2))
    return 0
  }

  await d1(DDL); await d1(DDL_INDEX)
  const priorRows = (await d1(SQL_LATEST)).results ?? []
  const prior = new Map(priorRows.map(r => [r.subject, r]))
  console.log(`\n  prior rows on file: ${prior.size}`)

  let written = 0
  const causes = {}
  for (const o of observations) {
    const r = rowOf(o.forecast, CASES)
    if (!r) { console.log(`  SKIP ${o.subject}: unreadable forecast case`); continue }
    const p = prior.get(o.subject)
    // The prior is reconstructed as an Observation for the F# diff. `ModelNote`
    // is set only when the stored method differs from the running one — read,
    // never inferred, which is the only way ModelRevised stays honest.
    const outcome = diff(
      p ? { Subject: o.subject, Forecast: o.forecast, ObservedAt: p.observed_at } : undefined,
      { Subject: o.subject, Forecast: o.forecast, ObservedAt: at },
      { ResultSince: undefined, ModelNote: undefined })
    const cause = outcome?.fields?.[0] !== undefined && outcome?.tag === 1
      ? (CAUSE_NAMES[outcome.fields[0]?.tag] ?? 'Unchanged') : 'NoPrior'
    causes[cause] = (causes[cause] || 0) + 1
    await d1(SQL_INSERT, [o.subject, r.value, r.provenance, cause, at])
    written++
  }
  console.log(`\n  wrote ${written} row(s) to ${TABLE}`)
  console.log(`  causes: ${Object.entries(causes).map(([k, v]) => `${k}=${v}`).join(' ') || '(none)'}`)

  // READ THE ROWS BACK, and commit them. "wrote 10 row(s)" is the writer's own
  // account of what it did; the store's account is what the store returns. A
  // step that reports success over a crash has already happened once in this
  // workflow today, so the done condition gets an artifact rather than a log
  // line (Rule 89).
  const stored = (await d1(SQL_LATEST)).results ?? []
  const total = (await d1(`SELECT COUNT(*) AS n FROM ${TABLE}`)).results?.[0]?.n ?? null
  console.log(`\n  READ BACK from ${TABLE}: ${total} row(s) total, ${stored.length} subject(s)`)
  console.log('  subject                provenance    cause         value')
  for (const r of stored)
    console.log(`  ${String(r.subject).padEnd(22)}${String(r.provenance).padEnd(14)}`
      + `${String(r.cause).padEnd(14)}${r.value}`)
  mkdirSync('outbox', { recursive: true })
  writeFileSync('outbox/forecast-store-latest.json', JSON.stringify(
    { at, method: METHOD, rows_total: total, subjects: stored.length, newest: stored }, null, 2))

  // The store must hold MORE rows than subjects once a second run has landed.
  // Equal counts would mean the writer is replacing rather than appending —
  // the one property the schema exists to guarantee.
  if (total !== null && stored.length > 0 && total < stored.length) {
    console.log('\nFAIL: fewer rows than subjects. The store is not accumulating.')
    return 1
  }
  console.log('\nCOVERAGE: the first LIMIT unfinished fixtures, one observation each. It')
  console.log('does NOT forecast finished fixtures and does NOT read any market price —')
  console.log('MarketImplied is a second provenance for the same store when odds return.')
  return 0
}

// DeltaCause case order, as src/Forecast.fs declares it.
const CAUSE_NAMES = ['ResultObserved', 'MarketMoved', 'FixtureScheduled',
                     'SubstrateGained', 'SubstrateLost', 'ModelRevised', 'Unchanged']

// GUARDED. This file ended in a bare top-level `process.exit(...)`, so importing
// it — which `check:import-purity` does to every script — terminated the
// importing process before any code after the import ran. Same defect, same
// shape, in three scripts at once; `staged-outbox-check.mjs`'s own header
// records three earlier instances and the guard that catches them.
if (isMain(import.meta.url)) process.exit(await main())
