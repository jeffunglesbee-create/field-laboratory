// Laboratory's home/away convention, derived from ESPN rather than asserted.
//
// WHY THIS EXISTS
//
// `sportMeta` records a `Matchup` per sport — whether the desk writes
// "Away @ Home" or "Home v Away". When NFL and CFL were added on 2026-08-15
// those entries were written from a stated convention ("gridiron, North
// American, visitor first") because ESPN is unreachable from the dev sandbox:
// `curl` to site.api.espn.com returns HTTP 000 at the agent proxy.
//
// A stated convention is an assertion, and this repository's whole subject is
// the difference between an assertion and a measurement. A runner has egress,
// so the convention is derivable — and "cannot be tested here" is not a reason
// to leave it untested, only a reason to test it somewhere else.
//
// HOW IT DERIVES RATHER THAN ASSUMES
//
// For each event ESPN returns, it reads which competitor is `homeAway: "home"`
// and which is `"away"`, then looks at where each side's abbreviation appears
// in ESPN's own `shortName`. If the away abbreviation comes first, ESPN writes
// that sport visitor-first. Nothing here hardcodes "@" or "vs" as meaning
// anything — the ORDER is measured, and the order is the claim `Matchup` makes.
//
// Then it asks the real compiled `orderByMatchup` which side laboratory names
// first, and requires the two to agree.
//
// FAILURE MODES IT REFUSES TO HIDE
//
//   - A league with no games today cannot verify anything. Reported as
//     unverified and NOT counted as agreement, because "no events" and "agrees"
//     are the same green otherwise.
//   - If no league yields events at all, that is a failure, not a pass. A
//     silently empty sweep is this repo's recorded failure shape.
//   - If ESPN's payload is not the shape expected, it prints what it actually
//     found rather than treating a missing field as a mismatch.
//
// Usage:  node scripts/sport-convention-live-check.mjs
//         node scripts/sport-convention-live-check.mjs --tolerate-unreachable

import { sportOfString, orderByMatchup, matchupText } from '../build/Desk.js'
import { createChecks } from './checks.mjs'

const { check, summarize } = createChecks()
const TOLERATE = process.argv.includes('--tolerate-unreachable')

// ESPN's own slugs, paired with the sport string production serves.
const LEAGUES = [
  { sport: 'NFL', path: 'football/nfl' },
  { sport: 'CFL', path: 'football/cfl' },
  { sport: 'MLB', path: 'baseball/mlb' },
  { sport: 'WNBA', path: 'basketball/wnba' },
  { sport: 'MLS', path: 'soccer/usa.1' },
  { sport: 'AFL', path: 'australian-football/afl' },
]

const results = []
let unreachable = 0

for (const { sport, path } of LEAGUES) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard`
  let payload
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) })
    if (!r.ok) { results.push({ sport, status: `HTTP ${r.status}` }); unreachable++; continue }
    payload = await r.json()
  } catch (e) {
    results.push({ sport, status: `unreachable: ${String(e).slice(0, 60)}` })
    unreachable++
    continue
  }

  const events = payload?.events ?? []
  if (!events.length) { results.push({ sport, status: 'no events today' }); continue }

  // Derive the order ESPN uses, event by event, and require the events to agree
  // with each other before comparing to laboratory. A league whose own events
  // disagree is telling us the derivation is wrong, not that laboratory is.
  const orders = []
  let malformed = 0
  for (const ev of events) {
    const comp = ev?.competitions?.[0]
    const home = comp?.competitors?.find(c => c?.homeAway === 'home')?.team?.abbreviation
    const away = comp?.competitors?.find(c => c?.homeAway === 'away')?.team?.abbreviation
    const short = ev?.shortName
    if (!home || !away || !short || home === away) { malformed++; continue }
    const hi = short.indexOf(home)
    const ai = short.indexOf(away)
    if (hi < 0 || ai < 0) { malformed++; continue }
    orders.push(ai < hi ? 'away-first' : 'home-first')
  }

  const distinct = [...new Set(orders)]
  results.push({
    sport,
    status: orders.length ? `${orders.length} event(s)` : 'no usable events',
    espn: distinct.length === 1 ? distinct[0] : (distinct.length ? `INCONSISTENT ${distinct.join('/')}` : null),
    malformed,
    sample: events[0]?.shortName ?? null,
  })
}

console.log('')
for (const r of results) {
  console.log(`  ${String(r.sport).padEnd(8)} ${String(r.status).padEnd(22)} ` +
    `espn=${r.espn ?? '—'}  sample=${r.sample ?? '—'}` +
    (r.malformed ? `  malformed=${r.malformed}` : ''))
}
console.log('')

const derived = results.filter(r => r.espn && !r.espn.startsWith('INCONSISTENT'))

// Non-vacuity, first and loudest. Every comparison below is free if nothing was
// derived, and "ESPN was down" must not read as "the conventions agree".
if (unreachable === LEAGUES.length && TOLERATE) {
  console.log('::warning::every ESPN league was unreachable; convention not verified this run')
  console.log('0 checks run — tolerated')
  process.exit(0)
}

check('at least one league yielded a derivable convention',
  derived.length > 0,
  `${derived.length} of ${LEAGUES.length} derived; ${unreachable} unreachable`)

check('no league contradicts itself across its own events',
  results.every(r => !String(r.espn ?? '').startsWith('INCONSISTENT')),
  results.filter(r => String(r.espn ?? '').startsWith('INCONSISTENT'))
    .map(r => `${r.sport}: ${r.espn}`).join('; ') || 'each league is internally consistent')

// The comparison. `orderByMatchup` returns the pair in display order, so its
// first element names the side laboratory writes first.
const disagree = derived.filter(r => {
  const [first] = orderByMatchup(sportOfString(r.sport), 'HOME', 'AWAY')
  const lab = first === 'AWAY' ? 'away-first' : 'home-first'
  r.lab = lab
  return lab !== r.espn
})

check('laboratory names the same side first as ESPN, for every derivable sport',
  disagree.length === 0,
  disagree.length
    ? disagree.map(r => `${r.sport}: laboratory ${r.lab}, ESPN ${r.espn} (e.g. "${r.sample}")`).join('; ')
    : derived.map(r => `${r.sport}=${r.espn}`).join(' '))

// And the rendered text must follow the same order it just agreed on — the two
// halves that once disagreed and transposed a scoreline.
const textWrong = derived.filter(r => {
  const text = matchupText(sportOfString(r.sport), 'Cowboys', 'Eagles')
  const cowboysFirst = text.indexOf('Cowboys') < text.indexOf('Eagles')
  return r.espn === 'away-first' ? cowboysFirst : !cowboysFirst
})
check('the rendered matchup text follows the order it agreed on',
  textWrong.length === 0,
  textWrong.map(r => `${r.sport}: "${matchupText(sportOfString(r.sport), 'Cowboys', 'Eagles')}" vs ESPN ${r.espn}`)
    .join('; ') || 'text and order agree everywhere')

process.exit(summarize() === 0 ? 0 : 1)
