// Verifies FIELD's canonical zone, deterministically, at any hour.
//
// WHY THIS EXISTS
//
// The zone fix is only observable when ET and UTC disagree — 00:00 to 04:00
// UTC, which is 20:00 to midnight ET. Everything that could have caught a
// regression runs outside that window:
//
//   drift-sentinel cron   0 12 * * *   = 12:00 UTC = 08:00 ET   same day
//   live-check cron      37  6 * * *   = 06:20 UTC = 02:20 ET   same day
//   any CI run                          whenever a push happens
//
// So the fix would have been exercised by luck, on whichever pushes happened to
// land after 8pm Eastern. A guard that only works four hours a night, and is
// only run outside those four hours, is not a guard.
//
// This asserts the mechanism at FIXED instants instead of waiting for the clock
// to cooperate, and asserts the live wiring separately so both halves are
// covered: does `fieldToday()` actually reach the zone logic, and is the zone
// logic actually right.

import { createChecks } from './checks.mjs'
import { fieldToday, fieldDayAt, fieldDayIso, fieldDayShift, fieldDayOfIso } from '../build/Desk.js'

/** The same conversion the F# side emits, applied to an arbitrary instant. */
const etDay = date => {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const g = t => p.find(x => x.type === t).value
  return `${g('year')}-${g('month')}-${g('day')}`
}
const etHour = date => new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', hour: '2-digit', hour12: false,
}).format(date)

const utcDay = date => date.toISOString().slice(0, 10)
const at = iso => new Date(iso)

const { check, summarize } = createChecks()

// --- the wiring --------------------------------------------------------------
// Does fieldToday() actually go through the zone logic? Compared against the
// same conversion computed here, not against a hardcoded date, so this holds on
// any day the check runs.
check('fieldToday() returns the FIELD-zone day',
  fieldDayIso(fieldToday()) === etDay(new Date()),
  `F# said ${fieldDayIso(fieldToday())}, JS said ${etDay(new Date())}`)

// --- the real F# conversion, at fixed instants -------------------------------
// These call `fieldDayAt` — the actual compiled F# — rather than the local
// `etDay` helper, and assert exact expected days. This is the part that has
// teeth: each row below is chosen so that a plain-UTC implementation OR a
// hardcoded offset produces a different answer from the correct one.
//
//   2026-08-11T02:00Z  UTC says 08-11, correct ET says 08-10   (catches UTC)
//   2026-01-01T04:30Z  fixed -4 says 01-01, correct EST says 12-31 (catches -4)
//   2026-07-01T04:30Z  fixed -5 says 06-30, correct EDT says 07-01 (catches -5)
const cases = [
  ['2026-08-11T02:00Z', '2026-08-10', 'inside the divergence window'],
  ['2026-08-10T23:59Z', '2026-08-10', 'just before it'],
  ['2026-08-11T04:00Z', '2026-08-11', 'just after it'],
  ['2026-01-01T04:30Z', '2025-12-31', 'EST — a fixed -4 gets this wrong'],
  ['2026-07-01T04:30Z', '2026-07-01', 'EDT — a fixed -5 gets this wrong'],
  ['2026-03-08T06:59Z', '2026-03-08', 'spring-forward morning'],
  ['2026-11-01T05:30Z', '2026-11-01', 'inside the repeated hour'],
]
for (const [instant, expected, why] of cases) {
  const got = fieldDayIso(fieldDayAt(at(instant)))
  check(`fieldDayAt(${instant}) = ${expected} — ${why}`, got === expected,
    `got ${got}, expected ${expected} (UTC day would be ${utcDay(at(instant))})`)
}

// --- DST ---------------------------------------------------------------------
// The reason this is Intl with an IANA name rather than a fixed -5 or -4. A
// hardcoded offset is right for part of the year and silently wrong for the
// rest, twice.
check('spring forward: 02:00 ET does not exist on 2026-03-08',
  etHour(at('2026-03-08T06:59Z')) === '01' && etHour(at('2026-03-08T07:00Z')) === '03',
  `06:59Z=${etHour(at('2026-03-08T06:59Z'))}h 07:00Z=${etHour(at('2026-03-08T07:00Z'))}h`)

check('fall back: 01:00 ET happens twice on 2026-11-01',
  etHour(at('2026-11-01T05:00Z')) === '01' && etHour(at('2026-11-01T06:00Z')) === '01',
  `05:00Z=${etHour(at('2026-11-01T05:00Z'))}h 06:00Z=${etHour(at('2026-11-01T06:00Z'))}h`)

// A fixed UTC-5 would put this at 2026-06-30; a fixed UTC-4 would be right here
// and wrong in January. Neither constant works, which is the point.
check('the offset is not a constant',
  etDay(at('2026-07-01T03:00Z')) === '2026-06-30' && etDay(at('2026-01-01T03:00Z')) === '2025-12-31',
  `Jul=${etDay(at('2026-07-01T03:00Z'))} Jan=${etDay(at('2026-01-01T03:00Z'))}`)

// --- day arithmetic ----------------------------------------------------------
// Whole-day stepping must not drift across a DST boundary. It is integer
// arithmetic on the date parts precisely so it cannot.
const march7 = fieldDayOfIso('2026-03-07')
check('stepping across spring forward stays whole-day',
  fieldDayIso(fieldDayShift(1, march7)) === '2026-03-08' &&
  fieldDayIso(fieldDayShift(2, march7)) === '2026-03-09',
  `+1=${fieldDayIso(fieldDayShift(1, march7))} +2=${fieldDayIso(fieldDayShift(2, march7))}`)

const oct31 = fieldDayOfIso('2026-10-31')
check('stepping across fall back stays whole-day',
  fieldDayIso(fieldDayShift(1, oct31)) === '2026-11-01' &&
  fieldDayIso(fieldDayShift(2, oct31)) === '2026-11-02',
  `+1=${fieldDayIso(fieldDayShift(1, oct31))} +2=${fieldDayIso(fieldDayShift(2, oct31))}`)

check('stepping backwards across a year boundary',
  fieldDayIso(fieldDayShift(-1, fieldDayOfIso('2026-01-01'))) === '2025-12-31',
  fieldDayIso(fieldDayShift(-1, fieldDayOfIso('2026-01-01'))))

// --- validation --------------------------------------------------------------
check('a malformed date is rejected, not coerced',
  ['2026-8-9', '', '2026/08/09', 'yesterday', '2026-08-9'].every(s => fieldDayOfIso(s) == null),
  'one of the malformed inputs produced a FieldDay')

check('a well-formed date is accepted',
  fieldDayIso(fieldDayOfIso('2026-08-09')) === '2026-08-09',
  String(fieldDayOfIso('2026-08-09')))

console.log(`\nnow: ${new Date().toISOString()}  ET day ${etDay(new Date())}  UTC day ${utcDay(new Date())}`)
console.log(`(these agree outside 00:00-04:00 UTC, which is why this file tests fixed instants)\n`)
process.exit(summarize() === 0 ? 0 : 1)
