// Task 0 of docs/CC-CMD-2026-09-11-epl-forecaster-phase1.md, run where egress
// works.
//
// WHY A RUNNER. The agent sandbox cannot reach *.workers.dev OR
// fantasy.premierleague.com -- both measured at HTTP 000 on 2026-10-03. The
// CC-CMD's Task 0 says "read from HEAD, do not trust this document", and a
// document's own numbers are the one thing a blocked probe cannot replace. So
// this runs in Actions and commits what it read.
//
// WHAT IT ANSWERS, and it is not "is the URL up". Phase 1 computes a modelled
// three-way probability from standings joined to /fpl fixtures. That join is
// the load-bearing fact: ESPN names the clubs one way and FPL numbers them
// another, and "a bad team join fails silently" is the CC-CMD's own warning.
// So the join is MEASURED here, as matched/unmatched counts with the unmatched
// names printed, not asserted later from the model's output looking plausible.
//
// RULE 99 IS THE SHAPE OF THE CLASSIFIER. `/soccer-fbref/epl.json` is the case
// this repo already learned from: HTTP 200, well-formed JSON, `teams: {}`. A
// boolean "reachable" calls that a success. So every source lands in exactly
// one of five states and `empty` is not `present`:
//
//     unreachable   the fetch threw or timed out
//     http-error     a response arrived, non-2xx
//     unparseable    2xx, body is not the JSON it claims
//     empty          valid envelope, no content inside it
//     present        content
//
// `--self-test` runs every extractor and the classifier against inline
// fixtures, including the empty-envelope one, and is the only reason to trust
// the classifier's verdict on a source nobody has eyes on.

import { writeFileSync, mkdirSync } from 'node:fs'

const RELAY = process.env.RELAY_URL || 'https://field-relay-nba.jeffunglesbee.workers.dev'
const TIMEOUT_MS = 30_000

/** The five states. `empty` and `present` are different facts (Rule 99). */
const classify = (r) => {
  if (r.threw) return 'unreachable'
  if (!r.ok) return 'http-error'
  if (r.json === undefined) return 'unparseable'
  return r.contentful ? 'present' : 'empty'
}

// ── extractors: each returns { contentful, fields } ────────────────────────
// `fields` carries REAL VALUES under their REAL NAMES. A probe that reports
// "standings: ok" sends the next reader back to the network.

const STAT_KEYS = ['points', 'pointsFor', 'pointsAgainst', 'pointDifferential', 'deductions', 'gamesPlayed', 'wins', 'ties', 'losses']

export function extractStandings(j) {
  const entries = j?.children?.[0]?.standings?.entries ?? j?.standings?.entries ?? j?.entries ?? []
  const statsOf = (e) => {
    const out = {}
    for (const s of e?.stats ?? []) if (STAT_KEYS.includes(s.name)) out[s.name] = s.value
    return out
  }
  const rows = entries.map(e => ({
    team: e?.team?.displayName ?? e?.team?.name ?? null,
    abbrev: e?.team?.abbreviation ?? null,
    stats: statsOf(e),
  }))
  return {
    contentful: rows.length > 0,
    fields: {
      name: j?.name ?? null,
      season: j?.season?.year ?? j?.seasons?.[0]?.year ?? null,
      entries: rows.length,
      stat_keys_seen: [...new Set(rows.flatMap(r => Object.keys(r.stats)))].sort(),
      deductions_present_on: rows.filter(r => 'deductions' in r.stats).length,
      first_three: rows.slice(0, 3),
      teams: rows.map(r => r.team).filter(Boolean),
    },
  }
}

export function extractFplFixtures(j) {
  const all = Array.isArray(j) ? j : []
  const sample = all.filter(f => f && f.event !== null).slice(0, 3)
    .map(f => ({ id: f.id, event: f.event, kickoff_time: f.kickoff_time, team_h: f.team_h, team_a: f.team_a, finished: f.finished }))
  return {
    contentful: all.length > 0,
    fields: {
      fixtures: all.length,
      unscheduled_event_null: all.filter(f => f && f.event === null).length,
      finished: all.filter(f => f && f.finished === true).length,
      gameweeks_seen: [...new Set(all.map(f => f?.event).filter(e => e != null))].length,
      keys_on_first: all[0] ? Object.keys(all[0]).sort() : [],
      first_three_scheduled: sample,
    },
  }
}

export function extractFplBootstrap(j) {
  const teams = Array.isArray(j?.teams) ? j.teams : []
  return {
    contentful: teams.length > 0,
    fields: {
      teams: teams.length,
      keys_on_first: teams[0] ? Object.keys(teams[0]).sort() : [],
      id_to_name: Object.fromEntries(teams.map(t => [t.id, t.name])),
      short_names: Object.fromEntries(teams.map(t => [t.id, t.short_name])),
    },
  }
}

export function extractFbref(j) {
  const teams = j?.teams ?? {}
  const n = Object.keys(teams).length
  return {
    contentful: n > 0,
    fields: { competition: j?.competition ?? null, updated: j?.updated ?? null, teams: n },
  }
}

export function extractContextDate(j) {
  const games = [...(j?.games?.regular ?? []), ...(j?.games?.postseason ?? [])]
  const bySport = {}
  for (const g of games) bySport[g?.sport ?? '(no sport)'] = (bySport[g?.sport ?? '(no sport)'] || 0) + 1
  const EPL = ['EPL', 'Premier League', 'English Premier League']
  return {
    contentful: games.length > 0,
    fields: {
      rows: games.length,
      by_sport: bySport,
      epl_rows: EPL.reduce((n, k) => n + (bySport[k] || 0), 0),
      epl_labels_looked_for: EPL,
    },
  }
}

// ── the team join, which is the fact Phase 1 rests on ─────────────────────
// Reported as counts AND the unmatched names, because "18 of 20 matched" with
// the two survivors unnamed is not actionable. Normalisation is deliberately
// minimal and declared: lowercase, strip punctuation, drop the English club
// suffixes that one source carries and the other does not.
const norm = (s) => String(s ?? '').toLowerCase()
  .replace(/&/g, 'and').replace(/[^a-z0-9 ]/g, ' ')
  .replace(/\b(fc|afc|united|utd)\b/g, m => (m === 'utd' ? 'united' : m))
  .replace(/\b(fc|afc)\b/g, ' ')
  .replace(/\s+/g, ' ').trim()

export function joinTeams(espnNames, fplNames) {
  const fplN = new Map(fplNames.map(n => [norm(n), n]))
  const matched = []
  const espnUnmatched = []
  for (const e of espnNames) {
    const hit = fplN.get(norm(e))
    if (hit) { matched.push([e, hit]); fplN.delete(norm(e)) } else espnUnmatched.push(e)
  }
  return {
    espn: espnNames.length,
    fpl: fplNames.length,
    matched: matched.length,
    espn_unmatched: espnUnmatched,
    fpl_unmatched: [...fplN.values()],
    exact_normalised_strategy: 'lowercase, & -> and, punctuation -> space, drop FC/AFC, collapse spaces',
  }
}

// ── self-test ─────────────────────────────────────────────────────────────
function selfTest() {
  let pass = 0, fail = 0
  const t = (name, cond, detail = '') => {
    if (cond) { pass++; console.log(`  PASS  ${name}`) }
    else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`) }
  }

  // The classifier. These five are the point of the file.
  t('classify: a thrown fetch is unreachable', classify({ threw: true }) === 'unreachable')
  t('classify: non-2xx is http-error', classify({ ok: false }) === 'http-error')
  t('classify: 2xx with unparseable body is its own state',
    classify({ ok: true, json: undefined }) === 'unparseable')
  t('classify: a valid envelope with no content is EMPTY, not present',
    classify({ ok: true, json: {}, contentful: false }) === 'empty')
  t('classify: content is present', classify({ ok: true, json: {}, contentful: true }) === 'present')

  // The fbref case this classifier exists for, with the real 2026-06-23 shape.
  const fb = extractFbref({ competition: 'Premier League 2025-26', updated: '2026-06-23', teams: {} })
  t('fbref: teams:{} reads as not contentful', fb.contentful === false, JSON.stringify(fb))
  t('fbref: carries updated and competition through', fb.fields.updated === '2026-06-23' && fb.fields.teams === 0)
  t('fbref: a filled one reads as contentful', extractFbref({ teams: { ARS: {} } }).contentful === true)

  // Standings, with the stats block shape the CC-CMD names.
  const st = extractStandings({
    name: '2026-27 English Premier League',
    children: [{ standings: { entries: [
      { team: { displayName: 'Arsenal', abbreviation: 'ARS' }, stats: [
        { name: 'points', value: 12 }, { name: 'pointsFor', value: 8 },
        { name: 'pointsAgainst', value: 1 }, { name: 'pointDifferential', value: 7 },
        { name: 'deductions', value: 0 }, { name: 'gamesPlayed', value: 5 }, { name: 'noise', value: 9 }] },
      { team: { displayName: 'Manchester City', abbreviation: 'MAN' }, stats: [{ name: 'points', value: 15 }] },
    ] } }],
  })
  t('standings: reads the nested children[0].standings.entries path', st.fields.entries === 2, JSON.stringify(st.fields))
  t('standings: keeps only the named stat keys', !st.fields.stat_keys_seen.includes('noise'))
  t('standings: reports deductions presence per row, not as a global boolean',
    st.fields.deductions_present_on === 1, String(st.fields.deductions_present_on))
  t('standings: an empty entries list is not contentful', extractStandings({}).contentful === false)

  // FPL fixtures, including the event:null case NoForecastReason needs.
  const fx = extractFplFixtures([
    { id: 1, event: 1, kickoff_time: '2026-08-15T11:30:00Z', team_h: 3, team_a: 7, finished: true },
    { id: 2, event: null, kickoff_time: null, team_h: 4, team_a: 9, finished: false },
    { id: 3, event: 6, kickoff_time: '2026-10-04T13:00:00Z', team_h: 1, team_a: 2, finished: false },
  ])
  t('fpl fixtures: counts all three', fx.fields.fixtures === 3)
  t('fpl fixtures: counts event:null separately', fx.fields.unscheduled_event_null === 1)
  t('fpl fixtures: sample skips the unscheduled one', fx.fields.first_three_scheduled.every(f => f.event !== null))
  t('fpl fixtures: a bare [] is not contentful', extractFplFixtures([]).contentful === false)

  // bootstrap
  const bs = extractFplBootstrap({ teams: [{ id: 1, name: 'Arsenal', short_name: 'ARS' }] })
  t('fpl bootstrap: builds the id -> name map', bs.fields.id_to_name[1] === 'Arsenal')
  t('fpl bootstrap: no teams is not contentful', extractFplBootstrap({ teams: [] }).contentful === false)

  // context/date — and the games OBJECT, not a bare array. This repo has
  // already paid for reading it as an array once (seed-coverage run 33134550309).
  const cd = extractContextDate({ games: { regular: [{ sport: 'EPL' }, { sport: 'CFB' }], postseason: [{ sport: 'EPL' }] } })
  t('context/date: reads games.regular + games.postseason', cd.fields.rows === 3, JSON.stringify(cd.fields))
  t('context/date: counts EPL rows across both arrays', cd.fields.epl_rows === 2, String(cd.fields.epl_rows))
  t('context/date: a bare array yields zero rows rather than throwing',
    extractContextDate({ games: [{ sport: 'EPL' }] }).fields.rows === 0)
  t('context/date: zero EPL rows among other sports is reported as 0, not absent',
    extractContextDate({ games: { regular: [{ sport: 'CFB' }] } }).fields.epl_rows === 0)

  // The join.
  const j1 = joinTeams(['Arsenal', 'Manchester City', 'Nottingham Forest'], ['Arsenal', 'Man City', 'Nott\'m Forest'])
  t('join: names the unmatched on BOTH sides', j1.espn_unmatched.length === 2 && j1.fpl_unmatched.length === 2,
    JSON.stringify(j1))
  t('join: an exact match survives normalisation', j1.matched === 1)
  const j2 = joinTeams(['Brighton & Hove Albion FC'], ['Brighton and Hove Albion'])
  t('join: & -> and and FC dropped', j2.matched === 1, JSON.stringify(j2))
  const j3 = joinTeams(['Arsenal', 'Arsenal'], ['Arsenal'])
  t('join: one FPL name cannot match two ESPN names', j3.matched === 1 && j3.espn_unmatched.length === 1)

  console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}  ${pass}/${pass + fail} self-tests`)
  return fail === 0 ? 0 : 1
}

// ── live ──────────────────────────────────────────────────────────────────
async function read(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    const text = await res.text()
    let json
    try { json = JSON.parse(text) } catch { json = undefined }
    return { ok: res.ok, status: res.status, bytes: text.length, json, threw: false }
  } catch (e) {
    return { threw: true, error: String(e?.message ?? e) }
  }
}

async function live() {
  const today = new Date().toISOString().slice(0, 10)
  const SOURCES = [
    { key: 'standings', url: `${RELAY}/espn-standings/soccer/eng.1/standings`, extract: extractStandings },
    { key: 'fpl_fixtures', url: `${RELAY}/fpl/fixtures`, extract: extractFplFixtures },
    { key: 'fpl_bootstrap', url: `${RELAY}/fpl/bootstrap-static`, extract: extractFplBootstrap },
    { key: 'fbref_epl', url: `${RELAY}/soccer-fbref/epl.json`, extract: extractFbref },
    { key: 'context_today', url: `${RELAY}/context/date/${today}`, extract: extractContextDate },
  ]

  const manifest = { at: new Date().toISOString(), relay: RELAY, probed_date: today, sources: {} }

  for (const s of SOURCES) {
    const r = await read(s.url)
    let ex = { contentful: false, fields: {} }
    if (r.json !== undefined) { try { ex = s.extract(r.json) } catch (e) { ex = { contentful: false, fields: { extractor_threw: String(e?.message ?? e) } } } }
    const state = classify({ ...r, contentful: ex.contentful })
    manifest.sources[s.key] = { url: s.url, http: r.status ?? null, bytes: r.bytes ?? null, error: r.error ?? null, state, fields: ex.fields }
    console.log(`\n── ${s.key}  ${state}  HTTP ${r.status ?? '-'}  ${r.bytes ?? 0} bytes`)
    console.log(`   ${s.url}`)
    for (const [k, v] of Object.entries(ex.fields)) {
      const str = typeof v === 'object' ? JSON.stringify(v) : String(v)
      console.log(`   ${k.padEnd(26)} ${str.length > 300 ? str.slice(0, 300) + ' …' : str}`)
    }
  }

  // The join, only when both sides are present. Absent sides are SAID, not
  // silently treated as an empty list that would report "0 unmatched".
  const espn = manifest.sources.standings?.fields?.teams
  const fpl = manifest.sources.fpl_bootstrap?.fields?.id_to_name
  if (Array.isArray(espn) && espn.length && fpl && Object.keys(fpl).length) {
    manifest.join = joinTeams(espn, Object.values(fpl))
    console.log('\n── team join  ESPN standings <-> FPL bootstrap')
    for (const [k, v] of Object.entries(manifest.join))
      console.log(`   ${k.padEnd(26)} ${typeof v === 'object' ? JSON.stringify(v) : v}`)
  } else {
    manifest.join = { refused: 'one or both name sets absent', espn_present: Array.isArray(espn) && espn.length > 0, fpl_present: !!(fpl && Object.keys(fpl).length) }
    console.log(`\n── team join REFUSED: ${manifest.join.refused}`)
  }

  mkdirSync('outbox', { recursive: true })
  const path = `outbox/epl-substrate-probe-${manifest.at.replace(/[:.]/g, '-')}.json`
  writeFileSync(path, JSON.stringify(manifest, null, 2))
  writeFileSync('outbox/epl-substrate-probe-latest.json', JSON.stringify(manifest, null, 2))
  console.log(`\nwrote ${path}`)

  // COVERAGE, where the result is read (Rule 91).
  const states = Object.entries(manifest.sources).map(([k, v]) => `${k}=${v.state}`).join(' ')
  console.log(`\nCOVERAGE: ${SOURCES.length} source(s), one read each, no retry. ${states}`)
  console.log('This probe does not judge. It records what the five sources served at one')
  console.log('moment so Phase 1 is written against real field names rather than this')
  console.log("document's. A source in state `empty` served a valid envelope with nothing")
  console.log('in it — the fbref failure mode — and is NOT a reachability failure.')

  // Exit non-zero only when a source Phase 1 NEEDS is unusable. fbref is
  // already known empty and declared out of scope by the CC-CMD; EPL odds
  // being absent is the finding that swapped the phases, not a probe failure.
  const required = ['standings', 'fpl_fixtures', 'fpl_bootstrap']
  const broken = required.filter(k => manifest.sources[k].state !== 'present')
  if (broken.length) { console.log(`\nFAIL: Phase 1 needs these and they are not present: ${broken.join(', ')}`); return 1 }
  console.log('\nOK: standings, /fpl fixtures and /fpl bootstrap-static all present.')
  return 0
}

const code = process.argv.includes('--self-test') ? selfTest() : await live()
process.exit(code)
