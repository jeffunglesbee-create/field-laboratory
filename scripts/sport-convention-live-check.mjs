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
// Then it asks the real compiled `presentByMatchup` which side laboratory names
// first, and requires the two to agree — but only where ESPN actually sets the
// convention. See the `authority` note on LEAGUES: the first real run falsified
// the assumption that `shortName` encodes per-sport convention at all, and the
// scoping below is the consequence of that measurement, not a concession to
// make the check pass.
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

import { sportOfString, presentByMatchup, matchupText } from '../build/Desk.js'
import { createChecks } from './checks.mjs'

const { check, summarize } = createChecks()
const TOLERATE = process.argv.includes('--tolerate-unreachable')

// ESPN's own slugs, paired with the sport string production serves.
//
// `authority` records whether ESPN is an EDITORIAL authority for that sport's
// naming convention, or merely a publisher of it. That distinction is not a
// convenience — it was forced by the first real run, on 2026-08-15:
//
//   NFL   16 events  away-first  PHI @ BAL
//   CFL    1 event   away-first  TAT @ WBB
//   MLB   15 events  away-first  CHW @ DET
//   WNBA   3 events  away-first  NY @ CON
//   MLS   11 events  away-first  RBNY @ ATL
//   AFL    9 events  away-first  COLL @ HAW
//
// Away-first for ALL SIX — including Australian football, where the local
// convention is demonstrably home-first ("Collingwood v Hawthorn" is how
// AFL.com.au writes it), and association football, where home-first is the norm
// everywhere the game is played.
//
// That result falsifies this check's original hypothesis. `shortName` does not
// encode each sport's editorial convention; it is ESPN's own uniform scoreboard
// format. A source that returns the identical answer for six different sports
// carries no per-sport information — the UNIFORMITY is the tell, and treating
// it as authority would have "corrected" AFL into naming the away side first on
// the strength of an American scoreboard's house style.
//
// So agreement is asserted only where ESPN is a primary editorial source for
// the league. Elsewhere the divergence is reported, not enforced.
const LEAGUES = [
  { sport: 'NFL', path: 'football/nfl', authority: true },
  { sport: 'CFL', path: 'football/cfl', authority: true },
  { sport: 'MLB', path: 'baseball/mlb', authority: true },
  { sport: 'WNBA', path: 'basketball/wnba', authority: true },
  // ESPN publishes these; it does not set how they are written.
  { sport: 'MLS', path: 'soccer/usa.1', authority: false },
  { sport: 'AFL', path: 'australian-football/afl', authority: false },
]

const results = []
let unreachable = 0

for (const { sport, path, authority } of LEAGUES) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard`
  let payload
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) })
    if (!r.ok) { results.push({ sport, authority, status: `HTTP ${r.status}` }); unreachable++; continue }
    payload = await r.json()
  } catch (e) {
    results.push({ sport, authority, status: `unreachable: ${String(e).slice(0, 60)}` })
    unreachable++
    continue
  }

  const events = payload?.events ?? []
  if (!events.length) { results.push({ sport, authority, status: 'no events today' }); continue }

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
    authority,
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

// `presentByMatchup` returns a decision, not a pair — a non-contest sport has
// no first side, and reading `fields[0]` off an `Event` would silently compare
// an EventShape against the string 'AWAY'. Named as its own outcome instead.
// None of the six leagues above is a non-contest today; this exists so that
// stops being true loudly rather than quietly.
for (const r of derived) {
  const pres = presentByMatchup(sportOfString(r.sport), 'HOME', 'AWAY')
  r.lab = pres.cases()[pres.tag] !== 'Contest' ? 'not-a-contest'
        : pres.fields[0] === 'AWAY' ? 'away-first'
        : 'home-first'
}

check('every league probed here is a contest with two sides to order',
  derived.every(r => r.lab !== 'not-a-contest'),
  derived.filter(r => r.lab === 'not-a-contest').map(r => r.sport).join('; ')
    || `${derived.length} league(s), all two-sided`)

// THE INSTRUMENT CHECK, and the reason this file is worth running.
//
// The comparison below is only meaningful if ESPN's order actually varies by
// sport. On 2026-08-15 it did not — six leagues, one answer — which is what
// demoted it from authority to publisher for MLS and AFL. If ESPN ever DOES
// start distinguishing, that assumption is dead and this must say so loudly
// rather than keep quietly scoping itself down.
// Guarded on having derived anything at all: an empty set has one distinct
// value in neither direction, and reporting "ESPN now VARIES ()" off zero
// leagues would be a claim made from no data — the thing this file is about.
const espnOrders = [...new Set(derived.map(r => r.espn))]
check('ESPN is still uniform, so it still cannot adjudicate per-sport convention',
  derived.length === 0 || espnOrders.length === 1,
  derived.length === 0
    ? 'nothing derivable this run — uniformity neither confirmed nor refuted'
    : espnOrders.length === 1
      ? `every derivable league is ${espnOrders[0]} — a source with no variance carries no per-sport signal`
      : `ESPN now VARIES by sport (${derived.map(r => `${r.sport}=${r.espn}`).join(' ')}) — ` +
        'it may be an authority after all; revisit the authority flags')

// Where ESPN IS an editorial authority, agreement is required.
const authoritative = derived.filter(r => r.authority)
const disagree = authoritative.filter(r => r.lab !== r.espn)

check('at least one authoritative league was derivable',
  authoritative.length > 0,
  `${authoritative.length} authoritative league(s) derived`)

check('laboratory agrees with ESPN where ESPN sets the convention',
  disagree.length === 0,
  disagree.length
    ? disagree.map(r => `${r.sport}: laboratory ${r.lab}, ESPN ${r.espn} (e.g. "${r.sample}")`).join('; ')
    : authoritative.map(r => `${r.sport}=${r.espn}`).join(' '))

// Where it is not, the divergence is REPORTED. Not asserted either way: this
// check has no instrument for the editorial convention of a sport ESPN merely
// republishes, and pretending otherwise is how "COLL @ HAW" would have become
// laboratory's house style for Australian football.
const published = derived.filter(r => !r.authority)
check('divergence on non-authoritative leagues is reported, not enforced',
  true,
  published.length
    ? published.map(r =>
        `${r.sport}: laboratory ${r.lab}, ESPN ${r.espn}${r.lab === r.espn ? '' : ' (UNVERIFIED — ESPN house style, not a ruling)'}`).join('; ')
    : 'no non-authoritative league was derivable this run')

// The rendered text must follow whatever order laboratory itself claims — the
// two halves that once disagreed and transposed a scoreline. This holds for
// every sport, authoritative or not, because it is internal consistency.
const textWrong = derived.filter(r => {
  const text = matchupText(sportOfString(r.sport), 'Cowboys', 'Eagles')
  const cowboysFirst = text.indexOf('Cowboys') < text.indexOf('Eagles')
  // `matchupText(sport, home, away)` with home='Cowboys': an away-first sport
  // must NOT put Cowboys first. Getting this backwards is the transposition
  // this check exists to catch, and I wrote it backwards once here.
  return r.lab === 'away-first' ? cowboysFirst : !cowboysFirst
})
check('rendered text and score ordering agree, for every sport',
  textWrong.length === 0,
  textWrong.map(r => `${r.sport}: "${matchupText(sportOfString(r.sport), 'Cowboys', 'Eagles')}" but order ${r.lab}`)
    .join('; ') || 'text and order agree everywhere')

process.exit(summarize() === 0 ? 0 : 1)
