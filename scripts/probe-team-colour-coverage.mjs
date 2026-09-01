// What fraction of the desk would actually get a team tint?
//
// `Palette.teamTint` is built and proven (suite 101/101). It converts a brand
// hex into a legible one. It cannot conjure a brand hex, and there is no colour
// field in the relay payload or in either repo — so the question that decides
// whether this ships is COVERAGE, not derivation.
//
// TWO NUMBERS, AND THE SECOND IS THE ONE THAT MATTERS
//
//   1. per league — does ESPN serve teams, and do they carry `color`?
//   2. per SLATE  — of the rows the desk actually renders, how many can resolve
//                   BOTH team names to a tint?
//
// The first is necessary and reassuring. The second is the answer: a league with
// perfect colour data whose team names do not match the names `/context/date`
// serves contributes nothing to the page. Name drift is this session's recurring
// subject — `Dream` vs `Atlanta Dream` — so the match runs through the same
// subset-based `sameTeam` the collision probe is mutation-proven against, never
// string equality.
//
// THE SLUG LIST IS A HYPOTHESIS. Each entry is tried and its real status
// reported; a 404 is `unavailable`, which is not the same as zero coverage and
// must not be averaged in with it.
//
// Usage:  node scripts/probe-team-colour-coverage.mjs [--date YYYY-MM-DD]
//         node scripts/probe-team-colour-coverage.mjs --self-test

import { writeFileSync, mkdirSync } from 'node:fs'
import { sameTeam } from './probe-espn-id-collisions.mjs'
import { createChecks, isMain } from './checks.mjs'

const RELAY = process.env.RELAY || 'https://field-relay-nba.jeffunglesbee.workers.dev'
const ESPN = process.env.ESPN || 'https://site.api.espn.com/apis/site/v2/sports'

/**
 * THE KEY IS THE RELAY'S LABEL, NOT THE F# UNION MEMBER NAME.
 *
 * The first run of this probe reported La Liga, Serie A and Ligue 1 as having
 * no tint on nine rows, while the per-league table showed all three `covered`
 * at 20/20, 20/20 and 18/18. The leagues were fine; the lookup was keyed on
 * `LaLiga` and the payload says `La Liga`, with the space.
 *
 * `Desk.fs` states this outright, in comments read earlier the same day:
 * "The relay labels it 'La Liga', with the space", and the same for Serie A and
 * Ligue 1. A union member name is a name in the F#; the label in the data is a
 * different string, and only one of them is what `/context/date` serves.
 *
 * Each entry therefore carries EVERY label the payload might use, and the miss
 * report is what surfaced the gap — a bare percentage would have read as a data
 * problem in three European leagues.
 */

/**
 * `Sport` union member -> ESPN path. A HYPOTHESIS, tried and reported.
 *
 * Golf and PGATour are deliberately absent: they are individual competitions
 * with no teams, so "no coverage" there is correct rather than a gap. IPL lives
 * on Cricinfo's separate API and is left out for the same honesty — guessing a
 * slug for it would manufacture a failure that says nothing.
 */
export const LEAGUES = [
  ['MLB', 'baseball/mlb', ['MLB']],
  ['NBA', 'basketball/nba', ['NBA']],
  ['WNBA', 'basketball/wnba', ['WNBA']],
  ['NFL', 'football/nfl', ['NFL']],
  ['CFB', 'football/college-football', ['CFB', 'College Football', 'NCAAF']],
  ['CFL', 'football/cfl', ['CFL']],
  ['UFL', 'football/ufl', ['UFL']],
  ['NHL', 'hockey/nhl', ['NHL']],
  ['AFL', 'australian-football/afl', ['AFL']],
  ['MLS', 'soccer/usa.1', ['MLS']],
  ['EPL', 'soccer/eng.1', ['EPL', 'Premier League']],
  ['LaLiga', 'soccer/esp.1', ['La Liga', 'LaLiga']],
  ['Bundesliga', 'soccer/ger.1', ['Bundesliga']],
  ['SerieA', 'soccer/ita.1', ['Serie A', 'SerieA']],
  ['Ligue1', 'soccer/fra.1', ['Ligue 1', 'Ligue1']],
  ['UEFAChampionsLeague', 'soccer/uefa.champions', ['UEFA Champions League', 'Champions League']],
  ['UEFAEuropaLeague', 'soccer/uefa.europa', ['UEFA Europa League', 'Europa League']],
  ['UEFAEuropaConferenceLeague', 'soccer/uefa.europa.conf',
    ['UEFA Europa Conference League', 'Europa Conference League']],
  ['EFLCup', 'soccer/eng.league_cup', ['EFL Cup', 'Carabao Cup']],
  ['EFLTrophy', 'soccer/eng.trophy', ['EFL Trophy']],
  ['FIFAWorldCup', 'soccer/fifa.world', ['FIFA World Cup', 'World Cup']],
]

/** A usable brand colour, or null. ESPN serves `"000000"` and `""` both. */
export const brandOf = (team) => {
  const c = team?.color
  if (typeof c !== 'string') return null
  const hex = c.startsWith('#') ? c : `#${c}`
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : null
}

/** Resolve one payload team name against an ESPN team list. */
export const findTeam = (name, teams) =>
  teams.find(t => sameTeam(name, t.displayName))
  ?? teams.find(t => sameTeam(name, t.shortDisplayName ?? ''))
  ?? null

/**
 * `covered` | `partial` | `none` | `unavailable`.
 *
 * `unavailable` is a league the endpoint would not serve, and is NOT zero
 * coverage: averaging a 404 in with a real zero would report a slug typo as a
 * fact about the sport.
 */
export const leagueVerdict = ({ ok, teams, withColour }) => {
  if (!ok) return 'unavailable'
  if (teams === 0) return 'unavailable'
  if (withColour === 0) return 'none'
  return withColour === teams ? 'covered' : 'partial'
}

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()

  check('a bare six-hex colour is usable', brandOf({ color: '005A9C' }) === '#005A9C')
  check('a hashed one is too', brandOf({ color: '#005A9C' }) === '#005A9C')
  check('an empty colour is not usable', brandOf({ color: '' }) === null)
  check('a missing colour is not usable', brandOf({}) === null)
  check('BLACK IS A REAL COLOUR, not a missing one',
    brandOf({ color: '000000' }) === '#000000',
    'LAFC is black; treating it as absent would drop a club that has an answer')

  const teams = [{ displayName: 'Atlanta Dream' }, { displayName: 'Minnesota Lynx' }]
  check('a short payload name resolves to the full ESPN name',
    findTeam('Dream', teams)?.displayName === 'Atlanta Dream',
    'string equality would resolve nothing — this is the drift the whole session is about')
  check('an unrelated name resolves to nothing', findTeam('Chelsea', teams) === null)

  check('a 404 is unavailable, NOT zero coverage',
    leagueVerdict({ ok: false, teams: 0, withColour: 0 }) === 'unavailable',
    'a slug typo must not be reported as a fact about the sport')
  check('teams with no colours is a real zero',
    leagueVerdict({ ok: true, teams: 20, withColour: 0 }) === 'none')
  check('every team coloured is covered',
    leagueVerdict({ ok: true, teams: 20, withColour: 20 }) === 'covered')
  check('some is partial', leagueVerdict({ ok: true, teams: 20, withColour: 12 }) === 'partial')

  // ── the defect the first run found, guarded ────────────────────────────────
  const labelsOf = n => LEAGUES.find(([name]) => name === n)?.[2] ?? []
  check('EVERY LEAGUE CARRIES AT LEAST ONE PAYLOAD LABEL',
    LEAGUES.every(([, , labels]) => Array.isArray(labels) && labels.length > 0),
    'an entry with no label can never match a row, and would report as a data gap')
  check('the three spaced labels are present — this is what the first run missed',
    labelsOf('LaLiga').includes('La Liga') &&
    labelsOf('SerieA').includes('Serie A') &&
    labelsOf('Ligue1').includes('Ligue 1'),
    'Desk.fs says the relay labels these with a space; keying on the union name found nothing')
  check('the union name is kept too, so both spellings resolve',
    labelsOf('LaLiga').includes('LaLiga') && labelsOf('SerieA').includes('SerieA'))
  process.exit(summarize() === 0 ? 0 : 1)
}

if (isMain(import.meta.url)) {
  const i = process.argv.indexOf('--date')
  const day = i >= 0 ? process.argv[i + 1]
    : new Date(new Date(Date.now() - 86400000).toLocaleString('en-US', { timeZone: 'America/New_York' }))
        .toISOString().slice(0, 10)
  mkdirSync('outbox', { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outPath = `outbox/team-colour-coverage-${stamp}.txt`
  const out = []
  const log = s => { out.push(s); console.log(s); try { writeFileSync(outPath, out.join('\n')) } catch {} }

  // The derivation, imported from the COMPILED palette rather than reimplemented.
  // A second copy of the tint maths would drift from the one the F# suite proves,
  // and the number this probe reports would then be about the copy.
  const P = await import('../build/Palette.js')

  log(`probe_at: ${new Date().toISOString()}`)
  log(`question: what fraction of the desk would actually get a team tint?`)
  log(`slate:    ${day}`)
  log('')

  const byLeague = new Map()
  log('per league — does ESPN serve teams, and do they carry a colour?')
  for (const [name, path, labels] of LEAGUES) {
    let ok = false, teams = [], withColour = 0
    try {
      const r = await fetch(`${ESPN}/${path}/teams`, { signal: AbortSignal.timeout(20000) })
      ok = r.ok
      if (ok) {
        const d = await r.json()
        teams = (d?.sports?.[0]?.leagues?.[0]?.teams ?? []).map(t => t.team).filter(Boolean)
        withColour = teams.filter(t => brandOf(t)).length
      }
    } catch { ok = false }
    const v = leagueVerdict({ ok, teams: teams.length, withColour })
    for (const label of labels) byLeague.set(label, { teams, verdict: v })
    log(`  ${name.padEnd(28)} ${String(teams.length).padStart(4)} team(s)  ${String(withColour).padStart(4)} coloured   ${v}`)
  }

  // ── the number that decides it ───────────────────────────────────────────
  log('')
  log(`per slate — of the rows the desk renders on ${day}, how many resolve BOTH sides?`)
  let rows = 0, both = 0, oneSide = 0, neither = 0
  const missBySport = new Map()
  try {
    const r = await fetch(`${RELAY}/context/date/${day}`, { signal: AbortSignal.timeout(25000) })
    if (!r.ok) { log(`  relay HTTP ${r.status} — slate NOT OBSERVED`) }
    else {
      const p = await r.json()
      const games = [...(p.games?.regular ?? []), ...(p.games?.postseason ?? [])]
      for (const g of games) {
        rows++
        const entry = byLeague.get(String(g.sport)) ?? byLeague.get(String(g.league)) ?? null
        const pool = entry?.teams ?? []
        const tintFor = n => {
          const t = findTeam(String(n ?? ''), pool)
          const hex = t ? brandOf(t) : null
          return hex ? P.teamTint(hex) : undefined
        }
        const h = tintFor(g.home), a = tintFor(g.away)
        if (h !== undefined && a !== undefined) both++
        else if (h !== undefined || a !== undefined) oneSide++
        else {
          neither++
          const k = String(g.sport ?? '?')
          missBySport.set(k, (missBySport.get(k) ?? 0) + 1)
        }
      }
    }
  } catch (e) { log(`  ${String(e).slice(0, 60)} — slate NOT OBSERVED`) }

  const pct = n => rows ? `${(100 * n / rows).toFixed(1)}%` : 'n/a'
  log('')
  if (rows === 0) {
    log('NOT OBSERVABLE — no slate rows were read, so no coverage number exists.')
  } else {
    log(`${rows} row(s) on the slate`)
    log(`  both sides tinted : ${both} (${pct(both)})   <- the fraction that would render`)
    log(`  one side only     : ${oneSide} (${pct(oneSide)})`)
    log(`  neither           : ${neither} (${pct(neither)})`)
    for (const [s2, n] of [...missBySport.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8))
      log(`      ${String(s2).padEnd(28)} ${String(n).padStart(4)} row(s) with no tint`)
    log('')
    log('A row with ONE side tinted must not render half a matchup in colour: one')
    log('coloured name beside a plain one reads as emphasis, not identity. Treat')
    log('`both` as the addressable fraction and the rest as plain text.')
  }
  log('')
  log(`artifact: ${outPath}`)
  process.exit(rows === 0 ? 1 : 0)
}
