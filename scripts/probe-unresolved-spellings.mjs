// The relay spellings ESPN cannot be matched to, and what they might be.
//
// WRITTEN FOR SIX CARDS AND FINISHED WITH ONE, which is worth keeping at the top
// of the file it justifies.
//
// Six cards had a side that would not resolve, and two readings of the problem
// were wrong in a row. The first said the remedy was "keep short words in
// `tokens`". Measured against ESPN's real naming that fixes exactly one name,
// leaves `Virginia` ambiguous, sends four others from two candidates to ZERO —
// `st` is not `state`, `n` is not `north` — and breaks `D.C. United` against
// `DC United`, which works today.
//
// The second reading, that these needed an explicit alias table, was also wrong,
// and the fix that dissolved them was neither: `?limit=900`. ESPN's own
// `shortDisplayName` for those clubs IS the relay's abbreviation —
// `E Michigan`, `Florida St`, `N Dakota St`, `NC State`, `New Mexico St` — and
// the generator stores every spelling a club answers to. Once the truncated
// page returned all 760 teams, the table carried those strings and the page's
// exact lookup found them. Six cards, no matcher change, no alias.
//
// What is left for this probe is the one spelling that genuinely has no ESPN
// counterpart, `Los Angeles Football Club` against `LAFC`, and whatever the next
// slate brings. That is enough to keep it: a spelling gap is a recurring shape
// here, and the alternative to this is guessing.
//
// IT DECIDES NOTHING. For every spelling that fails to resolve it lists the ESPN
// teams that could plausibly be meant, with their colours, so an alias can be
// WRITTEN DOWN from evidence and reviewed as an ordinary row. The generator
// already works this way — fuzzy matching runs once and its output is a table a
// person can read — and an alias is that with the inference removed.
//
// Usage:  node scripts/probe-unresolved-spellings.mjs
//         node scripts/probe-unresolved-spellings.mjs --self-test

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tokens } from './probe-espn-id-collisions.mjs'
import { LEAGUES, findTeam } from './probe-team-colour-coverage.mjs'
import { candidatesFor } from './probe-alternate-colours.mjs'
import { createChecks, isMain } from './checks.mjs'

const ESPN = process.env.ESPN || 'https://site.api.espn.com/apis/site/v2/sports'

/** Every word of a name, short ones kept — the opposite of `tokens`, on purpose. */
export const words = (t) =>
  (t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean)

/**
 * Could this ESPN name plausibly be that relay spelling?
 *
 * EVERY word of the spelling must be a PREFIX of some word of the candidate.
 * `N Dakota St` fits `North Dakota State`; `E Michigan` fits `Eastern Michigan`;
 * `Florida St` fits both `Florida State` and — no — `Florida` alone has no word
 * beginning `st`, so it does not fit. Deliberately loose in one direction and
 * strict in the other: it is gathering candidates for a person, not choosing.
 *
 * This rule is NEVER used to resolve anything. If it were, `E Michigan` would
 * match `Michigan` (no — `e` is not a prefix of `michigan`... but `Eastern
 * Michigan` and `East Carolina` both fit `E C`), which is exactly why the output
 * is a list and not an answer.
 */
export const plausible = (relay, espn) => {
  const rs = words(relay), es = words(espn)
  if (!rs.length || !es.length) return false
  return rs.every(r => es.some(e => e.startsWith(r)))
}

/**
 * `resolved` | `ambiguous` | `no-candidate`.
 *
 * `ambiguous` is not a near-miss to be broken by picking the first — it is the
 * state that says an alias must name WHICH one, and it is the state that stopped
 * D.C. United from wearing Atlanta United's red.
 */
export const spellingState = ({ resolved, plausibleCount }) => {
  if (typeof plausibleCount !== 'number')
    throw new TypeError('spellingState: plausibleCount is required')
  if (resolved) return 'resolved'
  return plausibleCount === 0 ? 'no-candidate' : 'ambiguous'
}

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()

  check('short words survive, unlike in tokens',
    JSON.stringify(words('N Dakota St')) === JSON.stringify(['n', 'dakota', 'st']))
  check('punctuation is separation, not content',
    JSON.stringify(words('D.C. United')) === JSON.stringify(['d', 'c', 'united']))

  check('AN ABBREVIATION FITS ITS EXPANSION', plausible('N Dakota St', 'North Dakota State Bison'))
  check('...and so does the other one', plausible('E Michigan', 'Eastern Michigan Eagles'))
  check('a spelling with a word the candidate lacks does NOT fit',
    plausible('Florida St', 'Florida Gators') === false,
    'no word of "Florida Gators" begins with "st"')
  check('the full name fits itself', plausible('NC State', 'NC State Wolfpack'))
  check('an unrelated club does not fit', plausible('E Michigan', 'Ohio State Buckeyes') === false)
  // Written twice from reading and wrong twice, which is the defect this whole
  // session keeps finding, arriving inside a test case. First `N Dakota St`
  // against `North Dakota Sioux` — `st` is not a prefix of `sioux`. Then
  // `Virginia` with `West Virginia` asserted NOT to fit — it does, because
  // `virginia` is a prefix of its own second word.
  //
  // Three fit, and that is the point: `Virginia` names one of three clubs and
  // this rule cannot say which. Running it answered in a second what two
  // readings got wrong.
  check('THE RULE IS LOOSE AND SAYS SO — it fits more than one on purpose',
    ['Virginia Cavaliers', 'Virginia Tech Hokies', 'West Virginia Mountaineers']
      .every(e => plausible('Virginia', e)),
    'three fit, which is why the output is a list for a person and never a resolution')
  check('an empty spelling fits nothing', plausible('', 'Anything') === false)

  check('a spelling that resolved needs no alias',
    spellingState({ resolved: true, plausibleCount: 3 }) === 'resolved')
  check('SEVERAL CANDIDATES IS AMBIGUOUS, not a near-miss to be broken by picking one',
    spellingState({ resolved: false, plausibleCount: 3 }) === 'ambiguous',
    "picking the first is how Atlanta United's red reached D.C. United")
  check('one candidate is still ambiguous — a person confirms it',
    spellingState({ resolved: false, plausibleCount: 1 }) === 'ambiguous')
  check('nothing plausible is its own state, and no alias can be written from it',
    spellingState({ resolved: false, plausibleCount: 0 }) === 'no-candidate')
  check('omitting the count throws', (() => {
    try { spellingState({ resolved: false }); return false } catch { return true }
  })())
  process.exit(summarize() === 0 ? 0 : 1)
}

if (isMain(import.meta.url)) {
  const get = async (url) => {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(25_000) })
      if (!r.ok) return []
      const j = await r.json()
      return (j.sports?.[0]?.leagues?.[0]?.teams ?? []).map(x => x.team).filter(Boolean)
    } catch { return [] }
  }

  const pooled = new Map()
  for (const [, path, labels] of LEAGUES) {
    const teams = await get(`${ESPN}/${path}/teams?limit=900`)
    for (const l of labels) pooled.set(l, teams)
  }

  const d = JSON.parse(readFileSync('data/context-2026-08-29.json', 'utf8'))
  const games = Array.isArray(d.games) ? d.games
    : [...(d.games.regular ?? []), ...(d.games.postseason ?? [])]
  const SPORT_LABEL = { mlb: 'MLB', wnba: 'WNBA', nba: 'NBA', nhl: 'NHL', nfl: 'NFL',
                        cfb: 'CFB', mls: 'MLS', afl: 'AFL' }

  const seen = new Set()
  const rows = []
  for (const g of games) {
    const lg = (g.league && g.league !== '') ? g.league : (SPORT_LABEL[(g.sport || '').toLowerCase()] ?? g.sport ?? '')
    for (const side of [g.away?.name ?? g.away, g.home?.name ?? g.home]) {
      const name = String(side ?? '')
      const k = `${lg}|${name}`
      if (!name || seen.has(k)) continue
      seen.add(k)
      const teams = pooled.get(lg) ?? []
      const hit = findTeam(name, teams)
      const cands = teams.filter(t => plausible(name, t.displayName ?? '')
                                   || plausible(name, t.shortDisplayName ?? ''))
      rows.push({
        league: lg, name,
        state: spellingState({ resolved: !!hit, plausibleCount: cands.length }),
        resolvedTo: hit?.displayName ?? null,
        candidates: cands.map(t => ({ name: t.displayName, colours: candidatesFor(t) })),
        poolSize: teams.length,
      })
    }
  }

  const by = s => rows.filter(r => r.state === s)
  console.log(`\n  ${rows.length} distinct (league, spelling) pair(s) on this capture`)
  for (const s of ['resolved', 'ambiguous', 'no-candidate'])
    console.log(`    ${s.padEnd(14)} ${by(s).length}`)

  for (const s of ['ambiguous', 'no-candidate']) {
    if (!by(s).length) continue
    console.log(`\n  ${s.toUpperCase()} — an alias must name which club, or say there is none:`)
    for (const r of by(s)) {
      console.log(`\n    ${r.league}  "${r.name}"   (${r.poolSize} team(s) in the pool)`)
      if (!r.candidates.length) console.log('       no ESPN team fits this spelling')
      for (const c of r.candidates.slice(0, 8))
        console.log(`       ${c.name.padEnd(38)} ${c.colours.join(' / ') || '(no colour)'}`)
      if (r.candidates.length > 8) console.log(`       ...and ${r.candidates.length - 8} more`)
    }
  }

  mkdirSync('outbox', { recursive: true })
  const out = `outbox/unresolved-spellings-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), rows }, null, 2))
  console.log(`\n  ${out}`)
  process.exit(0)
}
