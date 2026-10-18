// The BDB scout rows over the WHOLE served files, and against the client.
//
// The Suite tests src/Bdb.fs on inline envelopes of five names (see the "BDB
// scout" group in src/Suite.fs for why). What only the captures can answer:
//   - how many names carry a floor and how many a shared name drops;
//   - whether Josh Allen and Lamar Jackson really are among the dropped;
//   - whether every team's line is the line jubilant-bassoon's client draws
//     from the same two files.
// docs/CC-CMD-2026-10-18-bdb-scout-mirror.md, Task 3.
//
// THE CLIENT'S ALGORITHM IS RE-WRITTEN HERE, NOT IMPORTED. It is copied in
// substance from jubilant-bassoon src/legacy/field.js at fa24e59c
// (`_bdbNameKey`, the speed loop, `getStarterSpeedFloors`, `fmtSpd`), so that
// the comparison is between two derivations and can disagree. A census that
// called Bdb twice would agree with itself.
//
// Usage:  node scripts/bdb-census.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createChecks, finish, isMain, fieldDay } from './checks.mjs'
import { decodeSpeed, decodeDepthChart, decodeTendency, decodeTimeToThrow, speedIndex, indexCounts,
         floorOf, speedSide, speedLabel, tendencyRow, timeToThrowRow } from '../build/Bdb.js'
import { nflSeasonOf, valueAt } from '../build/Vintage.js'

export const FILES = {
  speed: 'data/bdb-speed-2022.json',
  tendency: 'data/bdb-tendency-fingerprint-2022.json',
  timeToThrow: 'data/bdb-time-to-throw-2022.json',
  depth: 'data/depth-charts-2026.json',
}

// --- the client, re-derived ------------------------------------------------
const SUFFIX = new Set(['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv'])
export const clientKey = name => {
  const parts = String(name || '').toLowerCase().split(/\s+/).filter(Boolean)
  if (parts.length > 1 && SUFFIX.has(parts[parts.length - 1])) parts.pop()
  return parts.join('').replace(/[^a-z]/g, '')
}
export const clientIndex = speedJson => {
  const byName = {}
  for (const p of Object.values(speedJson.data || {})) {
    const k = clientKey(p.name)
    if (!k || p.maxSpeedMph == null) continue
    byName[k] = k in byName ? null : p.maxSpeedMph
  }
  return byName
}
export const clientSide = (byName, depthJson, team, nick) => {
  const starters = depthJson.data?.[team] || {}
  const list = []
  for (const pos of ['QB', 'RB', 'WR', 'TE']) {
    const name = starters[pos]
    const mph = name ? byName[clientKey(name)] : null
    if (mph != null) list.push({ name, mph })
  }
  return `${nick} ` + (list.length
    ? list.map(p => `${p.name.replace(/^(\w)\w+\s+/, '$1.')} ≥${p.mph.toFixed(1)}`).join(' · ')
    : '—')
}

if (isMain(import.meta.url)) {
  const { check: record, summarize } = createChecks()
  const results = []
  const check = (name, pass, detail) => {
    results.push(pass ? { name, pass: true } : { name, pass: false, detail })
    record(name, pass, detail)
  }

  const provenance = readFileSync('data/PROVENANCE.md', 'utf8')
  const text = {}
  for (const [key, file] of Object.entries(FILES)) {
    text[key] = readFileSync(file, 'utf8')
    const sha = createHash('sha256').update(text[key]).digest('hex')
    const base = file.split('/').pop()
    const section = provenance.split(/\n## /).find(s => s.startsWith(`\`${base}\``)) ?? ''
    const recorded = /sha256\s+([0-9a-f]{64})/.exec(section)?.[1] ?? null
    check(`${base}: sha256 is the one data/PROVENANCE.md records`, recorded === sha,
      `recorded ${recorded ?? '(none)'}, file ${sha}`)
  }

  // "Current" by the relay's August rule, from the Eastern field day: the one
  // place a clock enters. The archive season is the one the speed file states.
  const [year, month] = fieldDay().split('-').map(Number)
  const current = nflSeasonOf(year, month)
  const ARCHIVE = 2022

  const ok = r => (r?.tag === 0 ? r.fields[0] : null)
  const speed = ok(decodeSpeed(current, text.speed))
  const depthTracked = ok(decodeDepthChart(current, text.depth))
  const tend = ok(decodeTendency(current, text.tendency))
  const ttt = ok(decodeTimeToThrow(current, text.timeToThrow))
  check('all four captures decode through Vintage.decodeEnvelope', speed && depthTracked && tend && ttt,
    `speed ${!!speed} depth ${!!depthTracked} tendency ${!!tend} timeToThrow ${!!ttt}`)

  const idx = speed ? speedIndex(ARCHIVE, speed) : undefined
  check(`the speed index is released at ${ARCHIVE}`, idx !== undefined)
  check(`and not at the current season ${current}`, speed !== null && speedIndex(current, speed) === undefined)
  const chart = depthTracked ? ok(valueAt(current, depthTracked)) : null
  check(`the depth chart is released at the current season ${current}`, chart !== null)

  const speedJson = JSON.parse(text.speed)
  const depthJson = JSON.parse(text.depth)
  const byName = clientIndex(speedJson)
  const clientNamed = Object.values(byName).filter(v => v != null).length
  const clientAmbiguous = Object.values(byName).filter(v => v == null).length
  const [named, ambiguous] = idx ? indexCounts(idx) : [NaN, NaN]
  check(`named ${named} · ambiguous ${ambiguous}: the client's own count of the same file`,
    named === clientNamed && ambiguous === clientAmbiguous, `client named ${clientNamed} ambiguous ${clientAmbiguous}`)
  for (const name of ['Josh Allen', 'Lamar Jackson'])
    check(`${name}: a name two 2022 players share carries no floor`, idx !== undefined && floorOf(idx, name) === undefined)

  const teams = Object.keys(depthJson.data || {}).sort()
  const lines = []
  let disagree = 0, startersWithFloor = 0, skillStarters = 0
  for (const team of teams) {
    const typed = idx && chart ? speedSide(idx, chart, team, team) : null
    const client = clientSide(byName, depthJson, team, team)
    if (typed !== client) disagree++
    for (const pos of ['QB', 'RB', 'WR', 'TE']) {
      const n = depthJson.data[team]?.[pos]
      if (!n) continue
      skillStarters++
      if (byName[clientKey(n)] != null) startersWithFloor++
    }
    lines.push({ team, typed, client })
  }
  // Rule 91: the denominator is printed in the same breath as the verdict.
  check(`every team's line matches the client's: checked ${teams.length} of ${teams.length} teams`,
    teams.length > 0 && disagree === 0, `${disagree} disagree`)

  const label = idx ? speedLabel(idx) : null
  const tendLabel = tend ? tendencyRow(ARCHIVE, tend)?.Label : null
  const tttLabel = ttt ? timeToThrowRow(ARCHIVE, ttt)?.Label : null
  check('labels carry the season: Speed floor mph (2022), Tendencies (2022), Time to throw (2022)',
    label === 'Speed floor mph (2022)' && tendLabel === 'Tendencies (2022)' && tttLabel === 'Time to throw (2022)',
    `${label} | ${tendLabel} | ${tttLabel}`)
  check(`a team row is not released at the current season ${current}`,
    tend !== null && tendencyRow(current, tend) === undefined)

  const out = {
    generatedAt: new Date().toISOString(), current, archive: ARCHIVE, files: FILES,
    named, ambiguous, startersWithFloor, skillStarters, teamsChecked: teams.length,
    summary: `named ${named} · ambiguous ${ambiguous} · starters with a floor ${startersWithFloor}/${skillStarters} · checked ${teams.length} of ${teams.length} teams against the client`,
    lines, results,
  }
  mkdirSync('outbox', { recursive: true })
  writeFileSync('outbox/bdb-census-latest.json', JSON.stringify(out, null, 2) + '\n')
  console.log(out.summary)
  for (const l of lines.filter(l => ['JAX', 'HOU', 'BUF', 'BAL', 'PIT'].includes(l.team))) console.log(`  ${l.typed}`)
  finish(summarize())
}
