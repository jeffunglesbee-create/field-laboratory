// The thirteen cards that still render plain — what would actually fix each?
//
// After the alternate-colour work, 65 of the frozen capture's 78 cards tint. The
// remaining thirteen were reported as three facts, and only one of the three has
// been measured rather than inferred:
//
//   7  ESPN "does not serve the club" — six CFB fixtures and one CFL
//   5  no combination of published colours works
//   1  the table lacks the spelling `Los Angeles Football Club`
//
// The first is a guess wearing a number. `probe-alternate-colours` reported CFB
// at EXACTLY 50 teams, which is not a fact about college football — it is
// ESPN's default page size, and no call in this repo passes `limit`. If that is
// the cause, six of the thirteen are one query parameter away and nothing about
// them is a coverage limit at all.
//
// The second is stated as though the source were beyond question, and this
// session already established it is not: ESPN's `color` for European football is
// the KIT, not the club. "Angers and Auxerre carry the same two colours" and
// "ESPN happens to describe both of them by the same kit" are different claims
// with different remedies, and nothing here has separated them.
//
// So this probe asks three questions and answers each with a measurement:
//
//   1. does `?limit=` return teams the bare call omits, and do they carry colour?
//   2. for each still-plain card, WHICH condition fails — is one club's colour
//      set unusable on this page at all, or do two usable sets collide?
//   3. does ESPN serve any colour for CFL?
//
// Usage:  node scripts/probe-plain-card-causes.mjs
//         node scripts/probe-plain-card-causes.mjs --self-test

import { writeFileSync, mkdirSync } from 'node:fs'
import { LEAGUES, findTeam } from './probe-team-colour-coverage.mjs'
import { candidatesFor } from './probe-alternate-colours.mjs'
import { createChecks, isMain } from './checks.mjs'

const ESPN = process.env.ESPN || 'https://site.api.espn.com/apis/site/v2/sports'

/** ESPN's teams endpoint, with an explicit page size when one is given. */
export const teamsUrl = (base, path, limit) =>
  limit ? `${base}/${path}/teams?limit=${limit}` : `${base}/${path}/teams`

/**
 * `paginated` | `complete` | `not-observable`.
 *
 * EXACTLY 50 IS THE TELL and it is asserted rather than eyeballed: a default
 * page size and a league that genuinely has fifty teams look identical in a
 * count, and only asking for more separates them.
 */
export const pageVerdict = ({ bare, paged }) => {
  if (bare == null || paged == null) throw new TypeError('pageVerdict: both counts are required')
  if (bare === 0 && paged === 0) return 'not-observable'
  return paged > bare ? 'paginated' : 'complete'
}

/**
 * Why one card cannot render, given each side's colours and the page's own
 * predicates.
 *
 * THE SPLIT THAT MATTERS: a side whose every colour is unusable ON THIS PAGE
 * fails no matter who it plays, and that is a fact about the source. Two sides
 * that each have a usable colour but cannot be told apart is a fact about the
 * fixture. They read the same in a count and want opposite remedies — a better
 * source against a rule that is working correctly.
 */
export const causeOf = ({ a, b, readable, apart }) => {
  if (!Array.isArray(a) || !Array.isArray(b))
    throw new TypeError('causeOf: both colour lists are required')
  if (a.length === 0 || b.length === 0) return 'no-colours'
  const ra = a.filter(readable), rb = b.filter(readable)
  if (ra.length === 0 && rb.length === 0) return 'both-unreadable'
  if (ra.length === 0 || rb.length === 0) return 'one-unreadable'
  return ra.some(x => rb.some(y => apart(x, y))) ? 'renderable' : 'too-close'
}

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()

  check('a bare url has no page size', teamsUrl('E', 'x/y') === 'E/x/y/teams')
  check('a limit is appended', teamsUrl('E', 'x/y', 900) === 'E/x/y/teams?limit=900')
  check('MORE TEAMS WITH A LIMIT MEANS THE BARE CALL WAS PAGINATED',
    pageVerdict({ bare: 50, paged: 254 }) === 'paginated',
    'exactly 50 is a page size, not a fact about the sport')
  check('the same count means the bare call was complete',
    pageVerdict({ bare: 30, paged: 30 }) === 'complete')
  check('a league that answers nothing either way is not-observable',
    pageVerdict({ bare: 0, paged: 0 }) === 'not-observable')
  check('omitting a count throws rather than reading as complete', (() => {
    try { pageVerdict({ bare: 50 }); return false } catch { return true }
  })())

  // `readable` and `apart` are injected so the cause classifier is pure; here
  // they are simple stand-ins whose behaviour the cases state outright.
  const readable = x => x !== 'white'
  const apart = (x, y) => x !== y
  const C = (a, b) => causeOf({ a, b, readable, apart })

  check('a side with no colours at all is its own state', C([], ['red']) === 'no-colours')
  check('ONE SIDE WHOSE EVERY COLOUR IS UNUSABLE FAILS WHATEVER IT PLAYS',
    C(['white'], ['red']) === 'one-unreadable',
    'a fact about the source, not about the fixture')
  check('both sides unusable is distinct again', C(['white'], ['white']) === 'both-unreadable')
  check('TWO USABLE SETS THAT COLLIDE IS A FACT ABOUT THE FIXTURE',
    C(['red'], ['red']) === 'too-close',
    'the rule is working correctly here and a better source would not help')
  check('a pair that works is not a cause at all', C(['red'], ['blue']) === 'renderable')
  check('an unusable colour does not hide a usable one beside it',
    C(['white', 'red'], ['blue']) === 'renderable')
  check('...and the collision is judged on the USABLE colours only',
    C(['white', 'red'], ['white', 'red']) === 'too-close')
  check('omitting a list throws', (() => {
    try { causeOf({ a: ['red'], readable, apart }); return false } catch { return true }
  })())
  process.exit(summarize() === 0 ? 0 : 1)
}

if (isMain(import.meta.url)) {
  const P = await import('../build/Palette.js')
  const opt = o => (o == null ? null : (o.value !== undefined ? o.value : o))
  const readable = (hex) => { const t = opt(P.teamTint(hex)); return !!t && P.readsAsColour(t) }
  const apart = (x, y) => {
    const a = opt(P.teamTint(x)), b = opt(P.teamTint(y))
    return !!a && !!b && P.distinguishable(a, b)
  }

  const get = async (url) => {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(25_000) })
      if (!r.ok) return []
      const j = await r.json()
      return (j.sports?.[0]?.leagues?.[0]?.teams ?? []).map(x => x.team).filter(Boolean)
    } catch { return [] }
  }

  // ---- 1. is the bare call paginated? ---------------------------------------
  console.log('\n  league                        bare   limit=900   with colour   verdict')
  const pooled = new Map()
  const pageRows = []
  for (const [name, path, labels] of LEAGUES) {
    const bare = await get(teamsUrl(ESPN, path))
    const paged = await get(teamsUrl(ESPN, path, 900))
    const best = paged.length >= bare.length ? paged : bare
    const coloured = best.filter(t => candidatesFor(t).length > 0).length
    const verdict = pageVerdict({ bare: bare.length, paged: paged.length })
    pageRows.push({ name, bare: bare.length, paged: paged.length, coloured, verdict })
    console.log(`  ${name.padEnd(28)} ${String(bare.length).padStart(4)} ${String(paged.length).padStart(11)} ` +
                `${String(coloured).padStart(13)}   ${verdict}`)
    for (const l of labels) pooled.set(l, best)
  }

  // ---- 2. every card the desk cannot colour ---------------------------------
  const d = JSON.parse((await import('node:fs')).readFileSync('data/context-2026-08-29.json', 'utf8'))
  const games = Array.isArray(d.games) ? d.games
    : [...(d.games.regular ?? []), ...(d.games.postseason ?? [])]
  const SPORT_LABEL = { mlb: 'MLB', wnba: 'WNBA', nba: 'NBA', nhl: 'NHL', nfl: 'NFL',
                        cfb: 'CFB', mls: 'MLS', afl: 'AFL' }

  const rows = []
  for (const g of games) {
    const lg = (g.league && g.league !== '') ? g.league : (SPORT_LABEL[(g.sport || '').toLowerCase()] ?? g.sport ?? '')
    const away = g.away?.name ?? g.away ?? g.awayTeam
    const home = g.home?.name ?? g.home ?? g.homeTeam
    const teams = pooled.get(lg) ?? []
    const ta = findTeam(away, teams), tb = findTeam(home, teams)
    const a = ta ? candidatesFor(ta) : [], b = tb ? candidatesFor(tb) : []
    rows.push({ league: lg, away, home, a, b, cause: causeOf({ a, b, readable, apart }) })
  }

  const by = c => rows.filter(r => r.cause === c)
  console.log(`\n  ${rows.length} card(s), by cause — WITH the paged team lists:`)
  for (const c of ['renderable', 'no-colours', 'one-unreadable', 'both-unreadable', 'too-close'])
    console.log(`    ${c.padEnd(18)} ${by(c).length}`)

  for (const c of ['no-colours', 'one-unreadable', 'both-unreadable', 'too-close']) {
    if (!by(c).length) continue
    console.log(`\n  ${c}:`)
    for (const r of by(c)) {
      const mark = (xs) => xs.map(h => `${h}${readable(h) ? '' : '*'}`).join('/') || '(none)'
      console.log(`    ${r.league.padEnd(14)} ${r.away} v ${r.home}   ${mark(r.a)}  vs  ${mark(r.b)}`)
    }
  }
  console.log('\n  * = derives a tint that does not read as a colour on this page')

  mkdirSync('outbox', { recursive: true })
  const out = `outbox/plain-card-causes-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), pageRows, rows }, null, 2))
  console.log(`\n  ${out}`)
  process.exit(0)
}
