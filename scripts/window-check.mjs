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

import { createChecks } from './checks.mjs'
import { fieldDayAt, fieldDayIso } from '../build/Desk.js'

const RELAY = 'https://field-relay-nba.jeffunglesbee.workers.dev/context/date/'

/** The next instant inside the divergence window, relative to now. */
const nextWindowInstant = () => {
  const now = new Date()
  // 02:00 UTC is the middle of the 00:00-04:00 window in EDT. Take tomorrow's
  // if today's has already passed, so this is always a real upcoming instant
  // rather than a date in the past.
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 2, 0, 0))
  if (d <= now) d.setUTCDate(d.getUTCDate() + 1)
  return d
}

const instant = process.env.AT ? new Date(process.env.AT) : nextWindowInstant()
const etDay = fieldDayIso(fieldDayAt(instant))          // what the fixed code asks for
const utcDay = instant.toISOString().slice(0, 10)       // what the old code asked for

const fetchSlate = async day => {
  try {
    const res = await fetch(RELAY + day)
    if (!res.ok) return { day, ok: false, note: `HTTP ${res.status}` }
    const body = await res.json()
    const games = [...(body?.games?.regular ?? []), ...(body?.games?.postseason ?? [])]
    return { day, ok: true, count: games.length, ids: games.map(g => g.id) }
  } catch (e) {
    return { day, ok: false, note: e.message }
  }
}

const [et, utc] = await Promise.all([fetchSlate(etDay), fetchSlate(utcDay)])

const { check, summarize } = createChecks()

console.log(`\nsimulated instant : ${instant.toISOString()}  (inside the 00:00-04:00 UTC window)`)
console.log(`FIELD-zone day    : ${etDay}   <- what the page asks for now`)
console.log(`UTC day           : ${utcDay}   <- what it asked for before the fix`)
console.log(`\n  ${etDay}: ${et.ok ? `${et.count} games` : et.note}`)
console.log(`  ${utcDay}: ${utc.ok ? `${utc.count} games` : utc.note}\n`)

check('the window really is a divergence', etDay !== utcDay,
  `${etDay} vs ${utcDay} — if these match, the chosen instant is outside the window`)

check('both dates are reachable', et.ok && utc.ok,
  `${etDay}: ${et.note ?? 'ok'} | ${utcDay}: ${utc.note ?? 'ok'}`)

// The point of the whole exercise. If these were the same slate the zone choice
// would not matter, and the bug would have been cosmetic.
check('the two days return different slates',
  !et.ok || !utc.ok || et.count !== utc.count ||
    JSON.stringify(et.ids) !== JSON.stringify(utc.ids),
  `both returned ${et.count} identical games — the zone choice made no difference here`)

// Not asserted: which slate is "correct". That needs ground truth about which
// games are actually in progress at the simulated instant, which this check
// does not have. What it does show is that the choice changes the answer, and
// the fixed code chooses the day the reader is living in.
console.log(process.env.AT
  ? `(instant supplied via AT=${process.env.AT})`
  : '(instant chosen automatically — set AT=<iso> to pick one)')
process.exit(summarize() === 0 ? 0 : 1)
