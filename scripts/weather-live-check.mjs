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
let body = null
let status = null
try {
  const res = await fetch(url)
  status = res.status
  body = await res.text()
} catch (e) {
  console.error(`  the request itself failed: ${e.message}`)
  console.error('  This check is meant to run on a GitHub Actions runner, which has egress.')
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

process.exit(summarize() === 0 ? 0 : 1)
