// The weather fan-out must not burst.
//
// WHAT BROKE
//
// `WeatherView.fetchSlate` was `targets |> List.map fetchOne |> Promise.all` —
// one request per distinct venue coordinate, ALL AT ONCE. On 2026-08-15 a
// twelve-venue slate did that and Open-Meteo answered one request with
// `429 Too Many Requests`. live-check went red on three assertions from that
// single cause: "no page or console errors" (the 429 on the console), "the
// chips all filled within the wait" (a 20s timeout), and "every card whose
// venue the table knows carries a live chip" (11 of 12).
//
// A 429 is the server saying the client is asking too fast. Tolerating it would
// have left the page asking too fast and merely stopped reporting the
// consequence, so the fix is a bound: requests go out in waves of `maxInFlight`.
//
// WHY THIS RUNS AGAINST THE REAL COMPILED F#
//
// Reading the bound off the source proves nothing — the failure was a real
// runtime concurrency shape, so this measures the runtime concurrency shape. It
// stubs `globalThis.fetch`, counts how many calls are outstanding at their peak,
// and drives the actual `build/WeatherView.js`.
//
// The stub never resolves synchronously. If it did, every request would finish
// before the next began and the peak would read 1 no matter what the code does —
// a check that passes on the broken implementation too.

import { fetchSlate } from '../build/WeatherView.js'
import { all, weatherEligible, distinctLocations } from '../build/Venues.js'
import { ofArray } from '../build/fable_modules/fable-library-js.5.13.0/List.js'
import { createChecks } from './checks.mjs'

const { check, summarize } = createChecks()

const READING = {
  timezone: 'America/New_York',
  elevation: 5,
  current: {
    temperature_2m: 61.0, apparent_temperature: 60.0,
    precipitation: 0.0, rain: 0.0,
    wind_speed_10m: 5.0, wind_direction_10m: 180, wind_gusts_10m: 8.0,
  },
}

// Every venue the table knows, so the slate is as wide as the real one that
// broke — and wider, which is the point.
//
// `ofArray` because these are F# functions: they take an F# list, and handing
// them a JS array makes `List.choose` quietly find nothing. That failure is
// silent and looks exactly like "no venue matched", which is why the
// non-vacuity check below is the first one and not the last.
const venueNames = ofArray(Array.from(all).map(v => v.Name))

const [located] = weatherEligible(venueNames)
const targetCount = Array.from(distinctLocations(located)).length

// Non-vacuity, first and loudest. A slate with <= maxInFlight distinct
// coordinates cannot distinguish a bounded implementation from an unbounded
// one: the peak equals the target count under both. Every "the burst stayed
// bounded" assertion below is free unless there is a real burst to bound.
check('the venue table offers more distinct coordinates than the bound',
  targetCount > 4,
  `${targetCount} distinct coordinate(s) across ${venueNames.length} venue name(s); bound is 4`)

let inFlight = 0
let peak = 0
let calls = 0
const urls = []

globalThis.fetch = (url) => {
  calls++
  urls.push(String(url))
  inFlight++
  if (inFlight > peak) peak = inFlight
  // Resolves on a later macrotask, so concurrent callers genuinely overlap.
  return new Promise(resolve => setTimeout(() => {
    inFlight--
    resolve({ Ok: true, ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(READING)) })
  }, 5))
}

const [outcome] = await fetchSlate(venueNames)

check('every distinct coordinate was actually requested',
  calls === targetCount,
  `${calls} request(s) for ${targetCount} distinct coordinate(s)`)

check('the requests never exceeded the in-flight bound',
  peak <= 4 && peak > 0,
  `peak concurrency ${peak} (bound 4)`)

// The bound must not be a serialisation in disguise. A wave size of 1 would
// satisfy "peak <= 4" while taking twelve round trips where three would do, and
// nothing above would notice.
check('the bound still batches rather than serialising',
  peak > 1,
  `peak concurrency ${peak} — 1 would mean one request at a time`)

check('every request went to Open-Meteo',
  urls.length > 0 && urls.every(u => u.startsWith('https://api.open-meteo.com/v1/forecast?')),
  `${urls.length} request(s), first: ${urls[0] ? urls[0].slice(0, 60) : 'none'}`)

// Bounding the burst must not lose readings. The failure mode of a hand-rolled
// wave loop is dropping or reordering the tail, and `EveryFetchFailed` vs
// `Readings` is exactly the distinction `slateWeather` exists to preserve — so
// assert the CASE, not just a count. `Readings` is tag 1, carrying
// (readings, failed); reading `fields[1]` here would be the FAILED list, which
// is empty on a healthy run and would have looked like a passing zero.
check('the slate resolved as Readings, not EveryFetchFailed',
  outcome.tag === 1,
  `tag ${outcome.tag} (0 NoVenuesWithCoordinates, 1 Readings, 2 EveryFetchFailed)`)

const readings = outcome.tag === 1 ? Array.from(outcome.fields[0]) : []
const failed = outcome.tag === 1 ? Array.from(outcome.fields[1]) : []
check('the slate resolved with a reading for every coordinate, none failed',
  readings.length === targetCount && failed.length === 0,
  `${readings.length} reading(s) and ${failed.length} failure(s) for ${targetCount} coordinate(s)`)

// ── the retry, and what it must NOT retry ───────────────────────────────────
//
// Two scenarios, because the retry has two halves and only one of them is the
// feature. Recovering a request that never answered is the fix; asking a host
// that said 429 to say it again is the 2026-08-15 burst bug with a new name,
// and the check that would have caught THAT is the one worth having.
//
// Both drive the real compiled `fetchSlate`, same as above. The stub decides
// per call what the host does, so the scenario is a property of the host and
// not of a flag threaded through the code under test.

const runWith = async (respond) => {
  let n = 0
  const perUrl = new Map()
  globalThis.fetch = (url) => {
    n++
    const k = String(url)
    perUrl.set(k, (perUrl.get(k) || 0) + 1)
    return respond(perUrl.get(k), k)
  }
  const [oc] = await fetchSlate(venueNames)
  return { outcome: oc, calls: n, perUrl }
}

const answer = () => Promise.resolve(
  { Ok: true, ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(READING)) })
// An abort, spelled the way the real one arrives: a rejected promise. The
// message deliberately is NOT "signal timed out" — the production classifier
// keys on the elapsed budget, not on the browser's wording, and this is what
// asserts that.
const neverAnswer = () => new Promise((_, reject) =>
  setTimeout(() => reject(new Error('the network went away')), 5))

// 1. Every first attempt never answers; every second one does.
const first = await runWith(attempt => attempt === 1 ? neverAnswer() : answer())
const firstReadings = first.outcome.tag === 1 ? Array.from(first.outcome.fields[0]) : []
check('a venue that never answered is asked again, and its reading is recovered',
  first.outcome.tag === 1 && firstReadings.length === targetCount,
  `tag ${first.outcome.tag}, ${firstReadings.length} reading(s) of ${targetCount} — ` +
  'without the retry this is 0 readings and EveryFetchFailed (tag 2)')

check('...and it is asked exactly twice, never more',
  first.calls === targetCount * 2 &&
  Array.from(first.perUrl.values()).every(c => c === 2),
  `${first.calls} call(s) for ${targetCount} coordinate(s) — ` +
  `per-URL counts ${[...new Set(first.perUrl.values())].join(',')}`)

// 2. The host REFUSES with 429. Retrying is the thing maxInFlight exists to
//    prevent, so each URL must be asked exactly once and the slate must fail.
const refused = await runWith(() => Promise.resolve(
  { Ok: false, ok: false, status: 429, text: () => Promise.resolve('') }))
check('a 429 is NOT retried — the host said stop asking',
  refused.calls === targetCount &&
  Array.from(refused.perUrl.values()).every(c => c === 1),
  `${refused.calls} call(s) for ${targetCount} coordinate(s) — ` +
  `a retry here would be the 2026-08-15 burst bug under a new name`)

check('...and a slate that was refused everywhere is EveryFetchFailed, not empty Readings',
  refused.outcome.tag === 2,
  `tag ${refused.outcome.tag} (2 is EveryFetchFailed)`)

process.exit(summarize() === 0 ? 0 : 1)
