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
 * `Sport` union member -> ESPN path. A HYPOTHESIS, tried and reported.
 *
 * Golf and PGATour are deliberately absent: they are individual competitions
 * with no teams, so "no coverage" there is correct rather than a gap. IPL lives
 * on Cricinfo's separate API and is left out for the same honesty — guessing a
 * slug for it would manufacture a failure that says nothing.
 */
export const LEAGUES = [
  ['MLB', 'baseball/mlb'], ['NBA', 'basketball/nba'], ['WNBA', 'basketball/wnba'],
  ['NFL', 'football/nfl'], ['CFB', 'football/college-football'], ['CFL', 'football/cfl'],
  ['UFL', 'football/ufl'], ['NHL', 'hockey/nhl'], ['AFL', 'australian-football/afl'],
  ['MLS', 'soccer/usa.1'], ['EPL', 'soccer/eng.1'], ['LaLiga', 'soccer/esp.1'],
  ['Bundesliga', 'soccer/ger.1'], ['SerieA', 'soccer/ita.1'], ['Ligue1', 'soccer/fra.1'],
  ['UEFAChampionsLeague', 'soccer/uefa.champions'], ['UEFAEuropaLeague', 'soccer/uefa.europa'],
  ['UEFAEuropaConferenceLeague', 'soccer/uefa.europa.conf'],
  ['EFLCup', 'soccer/eng.league_cup'], ['EFLTrophy', 'soccer/eng.trophy'],
  ['FIFAWorldCup', 'soccer/fifa.world'],
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
  for (const [name, path] of LEAGUES) {
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
    byLeague.set(name, { teams, verdict: v })
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
