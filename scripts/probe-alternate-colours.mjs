// Does a club's ALTERNATE colour recover a card that renders plain?
//
// THE QUESTION. On the frozen 2026-08-29 capture, 36 of 78 cards tint. The
// other 42 break down as: 4 with neither club in the table, 8 with one club
// missing (spelling drift, a coverage problem), and THIRTY that fail on colour
// alone — 12 where one side's brand is white and so reads as the page's own text
// colour, 18 where both read but the two are closer than the separation floor.
//
// `generate-team-colours.mjs:237` already fetches `alt: brandOf({ color:
// t.alternateColor })` for every club and the table stores only the primary. An
// alternate is the club's OWN published colour, so using it is not the sin
// `resolveCollisions` committed. What made that rule wrong was SCOPE: it
// reassigned globally, dropping a club from every matchup to fix the handful
// where it actually collided. Per card, only when the primary fails, is the same
// idea at the scope the pairwise design already won on.
//
// This probe does not build that. It measures whether it would work, and how
// often, BEFORE any of it is written — including the case it may not fix, where
// a club's two colours are black and white and both are unusable.
//
// WHAT IT REFUSES TO DO. It reports only colours ESPN actually serves. D.C.
// United's real identity is black, red and white, and a third colour that is
// true but unsourced is exactly the fabrication this project refuses. If the
// club's two ESPN fields do not recover the card, that is the finding.
//
// Usage:  node scripts/probe-alternate-colours.mjs [--capture context-2026-08-29]
//         node scripts/probe-alternate-colours.mjs --self-test

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { LEAGUES, findTeam } from './probe-team-colour-coverage.mjs'
import { createChecks, isMain } from './checks.mjs'

const ESPN = process.env.ESPN || 'https://site.api.espn.com/apis/site/v2/sports'

/** One usable hex from a raw ESPN colour string, or null. `""` and junk are null. */
export const hexOf = (c) => {
  if (typeof c !== 'string') return null
  const hex = c.startsWith('#') ? c : `#${c}`
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.toLowerCase() : null
}

/**
 * A club's candidate colours, PRIMARY FIRST, deduped.
 *
 * Deduped because ESPN serves the same value in both fields often enough that
 * counting it twice would report a club as having a choice it does not have —
 * and "the alternate did not help" and "there was no alternate" are different
 * findings.
 */
export const candidatesFor = (team) => {
  const out = []
  for (const c of [team?.color, team?.alternateColor]) {
    const h = hexOf(c)
    if (h && !out.includes(h)) out.push(h)
  }
  return out
}

/**
 * The pair to render, or null if none works.
 *
 * THE RULE, STATED: the combination that changes the fewest primaries wins; on a
 * tie the first-named side keeps its primary. That is `(0,0)`, `(0,1)`, `(1,0)`,
 * `(1,1)` — sorted by `(i + j, i)`. It has to be stated rather than emergent,
 * because a club appearing in its alternate on one card and its primary on
 * another is a weaker identity signal, and the rule decides how often that
 * happens.
 *
 * `ok(x, y)` is the acceptability predicate — both read as a colour and the two
 * are far enough apart — injected so this stays pure and the palette stays the
 * only place that answers it.
 */
export const choosePair = (a, b, ok) => {
  const combos = []
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < b.length; j++) combos.push([i, j])
  combos.sort((p, q) => (p[0] + p[1]) - (q[0] + q[1]) || p[0] - q[0])
  for (const [i, j] of combos) if (ok(a[i], b[j])) return { i, j, a: a[i], b: b[j] }
  return null
}

/**
 * `already` | `recovered` | `still-plain` | `not-observable`.
 *
 * `not-observable` is a card where a club is missing from the data entirely —
 * a coverage gap, which this probe is not about and must not report as a colour
 * failure. It is a third state, never averaged into either side.
 */
export const outcomeOf = ({ candidatesA, candidatesB, chosen }) => {
  if (!Array.isArray(candidatesA) || !Array.isArray(candidatesB))
    throw new TypeError('outcomeOf: both candidate lists are required')
  if (candidatesA.length === 0 || candidatesB.length === 0) return 'not-observable'
  if (chosen === null || chosen === undefined) return 'still-plain'
  return chosen.i === 0 && chosen.j === 0 ? 'already' : 'recovered'
}

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()
  const A = '#aa0000', B = '#0000aa', C = '#00aa00'

  check('a bare six-hex string is usable', hexOf('DA0308') === '#da0308')
  check('a hashed one is too', hexOf('#DA0308') === '#da0308')
  check('EMPTY IS NULL, NOT BLACK', hexOf('') === null,
    "ESPN serves \"\" and \"000000\"; treating the first as the second invents a club's colour")
  check('a short string is null', hexOf('fff') === null)
  check('a missing field is null', hexOf(undefined) === null)

  check('two distinct colours are two candidates',
    candidatesFor({ color: 'aa0000', alternateColor: '0000aa' }).length === 2)
  check('THE SAME VALUE TWICE IS ONE CANDIDATE, not a choice',
    candidatesFor({ color: 'aa0000', alternateColor: 'AA0000' }).length === 1,
    '"the alternate did not help" and "there was no alternate" are different findings')
  check('the primary comes first',
    candidatesFor({ color: 'aa0000', alternateColor: '0000aa' })[0] === '#aa0000')
  check('a club with no usable colour has no candidates',
    candidatesFor({ color: '', alternateColor: null }).length === 0)

  const never = () => false
  const only = (x, y) => (p, q) => p === x && q === q && q === y
  check('both primaries win when they work',
    JSON.stringify(choosePair([A, B], [C, A], () => true)) === JSON.stringify({ i: 0, j: 0, a: A, b: C }))
  check('no combination works yields null', choosePair([A], [A], never) === null)
  check('CHANGING ONE BEATS CHANGING TWO',
    (() => { const r = choosePair([A, B], [A, C], (p, q) => p !== q); return r.i + r.j === 1 })(),
    'a club in its alternate on one card and its primary on another is a weaker signal')
  check('on a tie the FIRST-NAMED side keeps its primary',
    (() => { const r = choosePair([A, B], [A, C], only(A, C)); return r.i === 0 && r.j === 1 })())
  check('both may change when nothing else works',
    (() => { const r = choosePair([A, B], [A, C], only(B, C)); return r.i === 1 && r.j === 1 })())
  // THE ORDER ITSELF, not just which combination wins.
  //
  // A mutation deleting the sort survived 19/19: with two candidates a side —
  // all ESPN's two colour fields can give — the nested loop already emits
  // `(0,0) (0,1) (1,0) (1,1)`, whose sums are non-decreasing by accident. The
  // rule was therefore stated in a comment and enforced by nothing. Three
  // candidates a side is the shape that separates them, and while no current
  // source produces it, a rule only the data happens to satisfy is not a rule.
  check('THE FEWEST-CHANGES ORDER IS ENFORCED, not inherited from the loop',
    (() => {
      const tried = []
      choosePair(['a0', 'a1', 'a2'], ['b0', 'b1', 'b2'], (x, y) => { tried.push(x + y); return false })
      const sum = t => Number(t[1]) + Number(t[3])
      return tried.length === 9 && tried.every((t, k) => k === 0 || sum(tried[k - 1]) <= sum(t))
    })(),
    'without the sort the loop tries a0b2 (two changes) before a1b0 (one)')

  check('a card that already tinted is not counted as a recovery',
    outcomeOf({ candidatesA: [A], candidatesB: [B], chosen: { i: 0, j: 0 } }) === 'already')
  check('a card fixed by an alternate is a recovery',
    outcomeOf({ candidatesA: [A, B], candidatesB: [B], chosen: { i: 1, j: 0 } }) === 'recovered')
  check('no workable pair is still-plain', outcomeOf({ candidatesA: [A], candidatesB: [A], chosen: null }) === 'still-plain')
  check('A CLUB WITH NO COLOUR AT ALL IS NOT A COLOUR FAILURE',
    outcomeOf({ candidatesA: [], candidatesB: [A], chosen: null }) === 'not-observable',
    'a coverage gap reported as a colour failure would send the next session to the wrong place')
  check('omitting a candidate list throws', (() => {
    try { outcomeOf({ candidatesA: [A], chosen: null }); return false } catch { return true }
  })())
  process.exit(summarize() === 0 ? 0 : 1)
}

if (isMain(import.meta.url)) {
  const P = await import('../build/Palette.js')
  const capture = process.argv.includes('--capture')
    ? process.argv[process.argv.indexOf('--capture') + 1] : 'context-2026-08-29'

  const opt = o => (o == null ? null : (o.value !== undefined ? o.value : o))
  const cssOf = t => (t && (t.fields ? t.fields[0] : (t.Item ?? t))) ?? null
  // The acceptability predicate, straight from the palette. Two hexes are a
  // renderable pair when each derives a legible tint, each is tellable apart
  // from the page's own text, and the two are tellable apart from each other.
  const ok = (x, y) => {
    const ta = opt(P.teamTint(x)), tb = opt(P.teamTint(y))
    if (!ta || !tb) return false
    return P.readsAsColour(ta) && P.readsAsColour(tb) && P.distinguishable(ta, tb)
  }

  // ---- ESPN, once per league --------------------------------------------------
  const byLabel = new Map()
  const fieldsSeen = new Set()
  let sampleTeam = null
  for (const [name, path, labels] of LEAGUES) {
    let teams = []
    try {
      const r = await fetch(`${ESPN}/${path}/teams`, { signal: AbortSignal.timeout(20_000) })
      if (r.ok) {
        const j = await r.json()
        teams = (j.sports?.[0]?.leagues?.[0]?.teams ?? []).map(x => x.team).filter(Boolean)
      }
    } catch { /* reported as an empty league below */ }
    for (const l of labels) byLabel.set(l, teams)
    if (teams.length && !sampleTeam) sampleTeam = teams[0]
    for (const t of teams) for (const k of Object.keys(t)) fieldsSeen.add(k)
    const two = teams.filter(t => candidatesFor(t).length === 2).length
    console.log(`  ${name.padEnd(28)} ${String(teams.length).padStart(4)} team(s), ${String(two).padStart(4)} with a distinct alternate`)
  }

  // WHAT ELSE IS THERE? Reported rather than assumed: if a third colour existed
  // on the payload, this is where it would show, and a card left plain for want
  // of one must not be explained away by a field nobody looked for.
  console.log(`\n  ESPN team fields observed: ${[...fieldsSeen].sort().join(', ')}`)
  console.log(`  colour-ish fields: ${[...fieldsSeen].filter(k => /colou?r/i.test(k)).sort().join(', ') || 'none'}`)

  // ---- the frozen capture -----------------------------------------------------
  const d = JSON.parse(readFileSync(`data/${capture}.json`, 'utf8'))
  const games = Array.isArray(d.games) ? d.games
    : [...(d.games.regular ?? []), ...(d.games.postseason ?? [])]
  const SPORT_LABEL = { mlb: 'MLB', wnba: 'WNBA', nba: 'NBA', nhl: 'NHL', nfl: 'NFL',
                        cfb: 'CFB', mls: 'MLS', afl: 'AFL' }

  const rows = []
  for (const g of games) {
    const lg = (g.league && g.league !== '') ? g.league : (SPORT_LABEL[(g.sport || '').toLowerCase()] ?? g.sport ?? '')
    const away = g.away?.name ?? g.away ?? g.awayTeam
    const home = g.home?.name ?? g.home ?? g.homeTeam
    const teams = byLabel.get(lg) ?? []
    const ta = findTeam(away, teams), tb = findTeam(home, teams)
    const ca = ta ? candidatesFor(ta) : [], cb = tb ? candidatesFor(tb) : []
    const chosen = (ca.length && cb.length) ? choosePair(ca, cb, ok) : null
    rows.push({ league: lg, away, home, candidatesA: ca, candidatesB: cb, chosen,
                outcome: outcomeOf({ candidatesA: ca, candidatesB: cb, chosen }) })
  }

  const by = (o) => rows.filter(r => r.outcome === o)
  console.log(`\n  ${rows.length} card(s) on ${capture}`)
  for (const o of ['already', 'recovered', 'still-plain', 'not-observable'])
    console.log(`    ${o.padEnd(16)} ${by(o).length}`)

  console.log('\n  RECOVERED by an alternate:')
  for (const r of by('recovered'))
    console.log(`    ${r.league.padEnd(16)} ${r.away} v ${r.home}  ->  ${r.chosen.a} / ${r.chosen.b}` +
                `  (was ${r.candidatesA[0]} / ${r.candidatesB[0]})`)

  console.log('\n  STILL PLAIN — every combination of the colours ESPN serves fails:')
  for (const r of by('still-plain'))
    console.log(`    ${r.league.padEnd(16)} ${r.away} v ${r.home}  ${r.candidatesA.join('/')} vs ${r.candidatesB.join('/')}`)

  console.log('\n  NOT OBSERVABLE — a club ESPN did not resolve, a coverage gap and not a colour one:')
  for (const r of by('not-observable'))
    console.log(`    ${r.league.padEnd(16)} ${r.away} v ${r.home}  ${r.candidatesA.length}/${r.candidatesB.length} resolved`)

  mkdirSync('outbox', { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const out = `outbox/alternate-colours-${stamp}.json`
  writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), capture,
    counts: Object.fromEntries(['already', 'recovered', 'still-plain', 'not-observable'].map(o => [o, by(o).length])),
    colourFields: [...fieldsSeen].filter(k => /colou?r/i.test(k)).sort(),
    rows }, null, 2))
  console.log(`\n  ${out}`)

  // Reports. A probe that gates is a second thing to keep green.
  process.exit(0)
}
