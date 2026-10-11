// The Open-Meteo request, executed for real, on a runner, in both directions.
//
// This sandbox's egress blocks api.open-meteo.com — the same wall playground hit,
// which is why it verified CORS from a GitHub Actions runner rather than from
// here. So the fetch runs there, and the standing instruction applies: "cannot be
// tested" is not a valid excuse when a runner exists.
//
// BOTH DIRECTIONS, because a happy-path-only live check is this repo's most
// persistent bug and would be especially hollow here. The whole reason this
// feature is being rebuilt is that production's version never executed once and
// reported success anyway.
//
// NOT in the confidence gate, by the same rule as check:live, check:pick-live,
// check:pick-shape and check:status-live: the gate must be deterministic and this
// reaches the network. It runs as a verify.yml step beside them.
//
// Usage:  node scripts/weather-live-check.mjs

import { forecastUrl, coordinates, decodeReading, falling, describeConditions } from '../build/Weather.js'
import { all as allVenues } from '../build/Venues.js'
import { toArray, finish } from './checks.mjs'
import { createChecks } from './checks.mjs'

const { check, summarize } = createChecks()

// Fenway Park, from the venue table.
const where = coordinates(42.3467, -71.0972)
if (where == null) {
  console.error('\n  coordinates(42.3467, -71.0972) returned None — the validator rejected a real venue.\n')
  process.exit(1)
}

const url = forecastUrl(where)
console.log(`\n  GET ${url}\n`)

// 1. The real request. This is the call that had never executed.
// UNREACHABLE IS NOT THE SAME AS WRONG, and the split is deliberate.
//
// `--tolerate-unreachable` is passed by verify.yml and NOT by drift-sentinel.
// The two jobs answer different questions:
//
//   verify           "is this commit correct?"  A third party being down is not
//                    evidence about the commit, and turning main permanently red
//                    on somebody else's outage is a check reporting the wrong
//                    subject.
//   drift-sentinel   "is the world still as we assumed?"  There, unreachable IS
//                    the finding, and it stays fatal.
//
// This is `pick-live-check`'s existing rule — "an HTTP failure is reported and
// not fatal; a 200 the decoder cannot read is fatal, which is the actual
// assertion" — applied to a second service.
//
// THE HAZARD, named because this is one step from the softening this session has
// spent two days refusing: if unreachable were tolerated everywhere, the check
// could pass forever having never run. It is tolerated in exactly one job, the
// daily sentinel cannot be silenced, and the toleration prints ::warning:: so it
// is visible in the run rather than absent from it.
//
// WHY IT IS NEEDED: api.open-meteo.com became unreachable from GitHub-hosted
// runners on 2026-08-12. Run 31543404607 read all 35 venues successfully at
// 23:07 on the 11th — that is where the Comerica/Detroit error was caught. Runs
// 31613671544, 31616402291 and 31632156907 all report `fetch failed` at the
// connection level after ~10s. Nothing about this repo changed in between.
const TOLERATE = process.argv.includes('--tolerate-unreachable')

let body = null
let status = null
try {
  const res = await fetch(url)
  status = res.status
  body = await res.text()
} catch (e) {
  if (TOLERATE) {
    console.log(`::warning::Open-Meteo unreachable from this runner (${e.message}) — ` +
      'weather assertions did not run. The daily drift-sentinel treats this as fatal.')
    console.log(`\n  UNREACHABLE: ${e.message}`)
    console.log('  Reported, not asserted. verify answers "is this commit correct",')
    console.log('  and a third party being down is not evidence about the commit.\n')
    process.exit(0)
  }
  console.error(`  the request itself failed: ${e.message}`)
  console.error('  Open-Meteo did not answer. This is the sentinel, so that is the finding:')
  console.error('  the venue table could not be checked against the planet today.')
  process.exit(1)
}

check('Open-Meteo answers 200', status === 200, `status ${status}`)
check('...and the body is not empty', typeof body === 'string' && body.length > 0, `${body?.length} bytes`)

// 2. The decoder meets the real payload. The fixture in Suite.fs is TRANSCRIBED
//    from FIELD's May 9 integration log, not captured — this is where the
//    transcription meets the service, the same job pick-shape-check does for the
//    pick fixture.
const decoded = decodeReading(body)
const ok = decoded.tag === 0 || 'fields' in decoded === false ? decoded : decoded
// Thoth's Result compiles to a union; `Ok` is tag 0.
const isOk = decoded.tag === 0
check('the transcribed decoder reads the REAL response', isOk,
  isOk ? '' : `decode failed: ${JSON.stringify(decoded.fields?.[0] ?? decoded)}`)

if (isOk) {
  const reading = decoded.fields[0]
  console.log(`  reading: ${describeConditions(reading)}`)

  // Sanity, not exactness — the weather is whatever it is. These bound the
  // physically possible, so a units switch (celsius arriving where degF is
  // assumed) or a null coming through as 0 would be caught.
  const temp = reading.Temperature
  check('temperature is in a possible Fahrenheit range', temp > -80 && temp < 140, `${temp}`)
  check('wind speed is not negative', reading.Wind >= 0, `${reading.Wind}`)

  // The containment invariant, on real data: rain never exceeds total
  // precipitation. If the service ever sends a payload that violates it, the
  // decoder refuses and this check has already failed above — so reaching here
  // means the invariant held on today's live reading.
  const f = falling(reading.Precip)
  check('precipitation classifies into exactly one state', f != null && 'tag' in f, JSON.stringify(f))
}

// 3. The failing direction, against the real service. An injected fixture proves
//    the decoder branches; it proves nothing about what Open-Meteo returns for a
//    bad request. That gap is where this session's mistakes have lived.
const badUrl = url.replace('latitude=42.3467', 'latitude=999')
const badRes = await fetch(badUrl)
console.log(`  bad latitude -> HTTP ${badRes.status}`)
check('an out-of-range latitude is NOT answered 200', badRes.status !== 200, `status ${badRes.status}`)
check('...and the good and bad requests differ', badRes.status !== status,
  `both returned ${status}`)

// 4. And the guard that makes 3 unreachable in production code: `coordinates`
//    refuses that latitude before a URL exists.
check('coordinates() refuses the latitude that the service also refuses',
  coordinates(999, -71.0972) == null, 'the validator accepted latitude 999')

// --- 5. the venue table, checked against the planet -------------------------
//
// The transcription docking on 8fc40c3, closed rather than restated: "Venues.fs
// coordinates are transcribed from playground's hand-reviewed table and have not
// been checked against a source."
//
// This is that source, and it costs nothing extra — Open-Meteo already returns
// the IANA timezone and the elevation it resolved for the coordinates it was
// given. So every entry declares the zone it SHOULD be in, and the service says
// where it actually is.
//
// It is a real axis, not a formality. A swapped lat/lon, a dropped minus sign or
// a mistyped digit almost always moves a point into a different zone: Fenway
// transposed is open ocean, Coors sign-flipped is the South Pacific. Chase Field
// is the sharpest single row, because America/Phoenix is the one US zone without
// DST and can only be reached by genuinely being in Arizona. Coors Field carries
// a second axis on its own — a mile of elevation that no neighbouring typo has.
//
// This is what pick-shape-check does for the transcribed pick fixture, applied
// to the transcribed venue table.
const venues = toArray(allVenues)
console.log(`\n  Checking ${venues.length} venue coordinates against Open-Meteo's resolved zone\n`)

const ELEVATION_BAND = { 'Coors Field': [1500, 1650] }

let zoneMismatches = []
for (const v of venues) {
  // Every failure becomes a NAMED mismatch, never a thrown exception. An
  // unparseable body used to crash the script here, which produces no check
  // results at all — the same shape as reading `page` after the browser closed.
  let res, body
  try {
    res = await fetch(forecastUrl(v.Where))
  } catch (e) { zoneMismatches.push(`${v.Name}: request failed — ${e.message}`); continue }
  if (!res.ok) { zoneMismatches.push(`${v.Name}: HTTP ${res.status}`); continue }
  try {
    body = await res.json()
  } catch (e) { zoneMismatches.push(`${v.Name}: body did not parse — ${e.message}`); continue }
  if (body.timezone !== v.Zone) {
    zoneMismatches.push(`${v.Name}: declared ${v.Zone}, resolved ${body.timezone}`)
    continue
  }
  const band = ELEVATION_BAND[v.Name]
  if (band && !(body.elevation >= band[0] && body.elevation <= band[1])) {
    zoneMismatches.push(`${v.Name}: elevation ${body.elevation}m outside ${band[0]}-${band[1]}m`)
  }
}

check('every venue resolves to the IANA zone it declares', zoneMismatches.length === 0,
  zoneMismatches.join('\n      \u2192 '))

// And the guard has to be shown able to fail, or its clean run means only that
// it ran. A deliberately wrong coordinate must NOT resolve to Fenway's zone.
const wrong = coordinates(-42.3467, 71.0972)
let wrongZone = null
let wrongErr = null
try {
  const wrongRes = await fetch(forecastUrl(wrong))
  wrongZone = (await wrongRes.json()).timezone
} catch (e) { wrongErr = e.message }
console.log(`  sign-flipped Fenway resolves to ${wrongZone ?? `<${wrongErr}>`}`)
check('the sign-flipped probe got an answer to compare', wrongErr === null, wrongErr)
check('a sign-flipped coordinate does NOT resolve to the declared zone',
  wrongErr === null && wrongZone !== 'America/New_York', `it resolved to ${wrongZone} anyway`)

finish(summarize())
