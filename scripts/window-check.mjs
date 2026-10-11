// Tests the ET fix during the divergence window, without waiting for it.
//
// The fix is only observable from 00:00 to 04:00 UTC. Waiting for that is a
// seven-hour feedback loop on a four-hour window, and every scheduled job in
// this repo runs outside it.
//
// It does not need waiting for. `fieldDayAt` is a pure function of an instant,
// so the window can be NAMED instead of waited for: pick an instant inside it,
// ask the real compiled F# which day that is, and compare against the day the
// old UTC code would have chosen. Then fetch BOTH from the live relay.
//
// That turns "trust me, it would have been wrong at 10pm" into two HTTP
// responses with different contents, available at any hour.
//
// Needs relay egress, so this runs on a CI runner, not in the dev sandbox.

import { createChecks, finish } from './checks.mjs'
import { fieldDayAt, fieldDayIso } from '../build/Desk.js'

const RELAY = 'https://field-relay-nba.jeffunglesbee.workers.dev/context/date/'

// CANDIDATE INSTANTS, NEWEST FIRST AND IN THE PAST.
//
// The first version took TOMORROW'S 02:00 UTC once today's had passed, and so
// compared two days that have not happened. On 2026-09-07 both returned 0 games
// and the check reported:
//
//   FAIL  the two days return different slates
//         → both returned 0 identical games — the zone choice made no difference
//
// It had not found a difference; it had failed to look somewhere a difference
// could exist. Those are not the same result, and reporting the second as the
// first is the defect this repo keeps finding in its own apparatus.
//
// A future day has no slate. A recent past day does. So: 02:00 UTC on each of
// the last SEARCH_DAYS days, newest first, and take the first where the two
// days actually differ AND at least one of them has games. The search is
// bounded and its size is printed with the result (Rule 91).
const SEARCH_DAYS = 10
const candidateInstants = () => {
  const out = []
  const base = new Date()
  base.setUTCHours(2, 0, 0, 0)
  // Start at yesterday: today's 02:00 UTC may not have passed, and a day that
  // is still being played is exactly the empty-slate case being avoided.
  for (let i = 1; i <= SEARCH_DAYS; i++) {
    const d = new Date(base)
    d.setUTCDate(d.getUTCDate() - i)
    out.push(d)
  }
  return out
}

const slateCache = new Map()
const fetchSlate = async day => {
  if (slateCache.has(day)) return slateCache.get(day)
  let out
  try {
    // A bounded wait, because the search now makes up to 20 calls where it
    // used to make two. An unbounded fetch turns one slow day into a hung job.
    const res = await fetch(RELAY + day, { signal: AbortSignal.timeout(15000) })
    if (!res.ok) out = { day, ok: false, note: `HTTP ${res.status}` }
    else {
      const body = await res.json()
      const games = [...(body?.games?.regular ?? []), ...(body?.games?.postseason ?? [])]
      out = { day, ok: true, count: games.length, ids: games.map(g => g.id) }
    }
  } catch (e) {
    out = { day, ok: false, note: e.message }
  }
  // Consecutive candidates share a day — one day's ET reading is the next
  // day's UTC reading — so this halves the calls rather than asking twice.
  slateCache.set(day, out)
  return out
}

const readPair = async (at) => {
  const etDay = fieldDayIso(fieldDayAt(at))        // what the fixed code asks for
  const utcDay = at.toISOString().slice(0, 10)     // what the old code asked for
  const [et, utc] = await Promise.all([fetchSlate(etDay), fetchSlate(utcDay)])
  return { at, etDay, utcDay, et, utc }
}

// The search. `usable` is the whole point: a pair where the days differ and at
// least one carries a slate is a pair that can answer the question.
const usable = (p) => p.etDay !== p.utcDay && p.et.ok && p.utc.ok
                   && (p.et.count > 0 || p.utc.count > 0)

let chosen = null
const searched = []
if (process.env.AT) {
  chosen = await readPair(new Date(process.env.AT))
  searched.push(chosen)
} else {
  for (const at of candidateInstants()) {
    const p = await readPair(at)
    searched.push(p)
    if (usable(p)) { chosen = p; break }
  }
}
const anyGamesAnywhere = searched.some(p => (p.et.count ?? 0) > 0 || (p.utc.count ?? 0) > 0)
const pick = chosen ?? searched[searched.length - 1]
const { at: instant, etDay, utcDay, et, utc } = pick

const { check, summarize } = createChecks()

console.log(`\nsimulated instant : ${instant.toISOString()}  (inside the 00:00-04:00 UTC window)`)
console.log(`FIELD-zone day    : ${etDay}   <- what the page asks for now`)
console.log(`UTC day           : ${utcDay}   <- what it asked for before the fix`)
console.log(`\n  ${etDay}: ${et.ok ? `${et.count} games` : et.note}`)
console.log(`  ${utcDay}: ${utc.ok ? `${utc.count} games` : utc.note}\n`)

console.log(`searched ${searched.length} candidate instant(s) of ${process.env.AT ? 1 : SEARCH_DAYS}`
          + `; a usable one needs the two days to differ AND at least one to carry a slate`)

check('the window really is a divergence', etDay !== utcDay,
  `${etDay} vs ${utcDay} — if these match, the chosen instant is outside the window`)

check('both dates are reachable', et.ok && utc.ok,
  `${etDay}: ${et.note ?? 'ok'} | ${utcDay}: ${utc.note ?? 'ok'}`)

// EVERY candidate empty is not a quiet non-result. One day with no games is an
// off day; ten in a row is a dead source, and this is the only place that would
// notice — the two checks below both pass vacuously on nothing.
check('at least one candidate day carried a slate', anyGamesAnywhere,
  `all ${searched.length} candidate instant(s) returned 0 games on both days —`
  + ` that is a source that has stopped answering, not a quiet week`)

// The point of the whole exercise. If these were the same slate the zone choice
// would not matter, and the bug would have been cosmetic.
//
// UNPROVEN IS NOT FAILURE. If no candidate could answer, this says so and does
// not assert. A check that cannot reach its subject reporting a failure is how
// the previous version turned an empty future day into a red main.
if (!chosen) {
  console.log('\nUNPROVEN — no candidate instant had a slate on either day.')
  console.log('  The question is unanswered, which is not the same as answered no.')
  console.log(anyGamesAnywhere
    ? '  Some day did carry games, so the source is alive; the divergent pairs were empty.'
    : '  No candidate carried games at all — see the failing check above.')
} else {
  check('the two days return different slates',
    et.count !== utc.count || JSON.stringify(et.ids) !== JSON.stringify(utc.ids),
    `both returned ${et.count} identical games — the zone choice made no difference here`)
}

// Not asserted: which slate is "correct". That needs ground truth about which
// games are actually in progress at the simulated instant, which this check
// does not have. What it does show is that the choice changes the answer, and
// the fixed code chooses the day the reader is living in.
console.log(process.env.AT
  ? `(instant supplied via AT=${process.env.AT})`
  : '(instant chosen automatically — set AT=<iso> to pick one)')
finish(summarize())
