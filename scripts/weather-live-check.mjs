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
//         node scripts/weather-live-check.mjs --tolerate-unreachable   (verify)
//         node scripts/weather-live-check.mjs --self-test              (no network)

import { forecastUrl, coordinates, decodeReading, falling, describeConditions } from '../build/Weather.js'
import { all as allVenues } from '../build/Venues.js'
import { toArray, finish } from './checks.mjs'
import { createChecks } from './checks.mjs'

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
// daily sentinel cannot be silenced, and every toleration prints ::warning:: and
// the coverage line says how many venues were actually checked.
//
// WHY IT IS NEEDED: api.open-meteo.com became unreachable from GitHub-hosted
// runners on 2026-08-12. Run 31543404607 read all 35 venues successfully at
// 23:07 on the 11th — that is where the Comerica/Detroit error was caught. Runs
// 31613671544, 31616402291 and 31632156907 all report `fetch failed` at the
// connection level after ~10s. Nothing about this repo changed in between.
//
// EVERY CALL, NOT ONLY THE FIRST (docs/CC-CMD-2026-10-17-weather-live-http-outage.md).
// The flag used to be read in one place, the catch around the first request.
// Run 38984732123 got past that call and then drew `Coors Field: HTTP 503` and
// `Yankee Stadium: fetch failed` in the venue loop; run 39454054451 the same
// with `Fenway Park: fetch failed`. Both turned verify red on a commit that said
// nothing about weather.
//
// WHAT "DID NOT ANSWER" MEANS: a thrown request, a 429, or a 5xx. Those are the
// service. Any other non-200 — a 400 for a malformed URL, a 404 — is the service
// ANSWERING that the request is wrong, which is evidence about the commit, and it
// stays fatal under the flag. Tolerating every non-200 would let a broken
// `forecastUrl` read as "checked 0 of 45" and exit 0 for ever: the hazard above.
const didNotAnswer = (status) => status === 429 || status >= 500

const call = async (fetchImpl, url) => {
  try {
    const res = await fetchImpl(url)
    return didNotAnswer(res.status) ? { res: null, why: `HTTP ${res.status}` } : { res, why: null }
  } catch (e) {
    return { res: null, why: `request failed — ${e.message}` }
  }
}

const ELEVATION_BAND = { 'Coors Field': [1500, 1650] }

/**
 * The whole check, against an injected `fetch`. Returns the failure count; the
 * caller decides the exit code. Prints through `console.log`, as before.
 */
const run = async ({ fetchImpl, tolerate, venues }) => {
  const { check, summarize } = createChecks()

  // Under the flag a call that did not answer is reported by name and not
  // asserted. Without it, it is a failure in its own right.
  const unanswered = (what, why) => {
    if (tolerate) {
      console.log(`::warning::Open-Meteo did not answer ${what} (${why}) — not asserted. ` +
        'The daily drift-sentinel treats this as fatal.')
      return
    }
    check(`Open-Meteo answers ${what}`, false, why)
  }

  // Fenway Park, from the venue table.
  const where = coordinates(42.3467, -71.0972)
  if (where == null) {
    console.error('\n  coordinates(42.3467, -71.0972) returned None — the validator rejected a real venue.\n')
    return 1
  }

  const url = forecastUrl(where)
  console.log(`\n  GET ${url}\n`)

  // 1. The real request. This is the call that had never executed.
  let status = null
  const first = await call(fetchImpl, url)
  if (first.res === null) {
    unanswered('the Fenway reading', first.why)
  } else {
    status = first.res.status
    const body = await first.res.text()
    check('Open-Meteo answers 200', status === 200, `status ${status}`)
    check('...and the body is not empty', typeof body === 'string' && body.length > 0, `${body?.length} bytes`)

    // 2. The decoder meets the real payload. The fixture in Suite.fs is TRANSCRIBED
    //    from FIELD's May 9 integration log, not captured — this is where the
    //    transcription meets the service, the same job pick-shape-check does for the
    //    pick fixture.
    const decoded = decodeReading(body)
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
  }

  // 3. The failing direction, against the real service. An injected fixture proves
  //    the decoder branches; it proves nothing about what Open-Meteo returns for a
  //    bad request. That gap is where this session's mistakes have lived.
  //
  //    A 503 here would satisfy "not answered 200" while proving nothing, so a
  //    call that did not answer is unanswered, not a pass.
  const badUrl = url.replace('latitude=42.3467', 'latitude=999')
  const bad = await call(fetchImpl, badUrl)
  if (bad.res === null) {
    unanswered('the out-of-range latitude probe', bad.why)
  } else {
    console.log(`  bad latitude -> HTTP ${bad.res.status}`)
    check('an out-of-range latitude is NOT answered 200', bad.res.status !== 200, `status ${bad.res.status}`)
    if (status !== null) {
      check('...and the good and bad requests differ', bad.res.status !== status,
        `both returned ${status}`)
    }
  }

  // 4. And the guard that makes 3 unreachable in production code: `coordinates`
  //    refuses that latitude before a URL exists.
  check('coordinates() refuses the latitude that the service also refuses',
    coordinates(999, -71.0972) == null, 'the validator accepted latitude 999')

  // --- 5. the venue table, checked against the planet -----------------------
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
  console.log(`\n  Checking ${venues.length} venue coordinates against Open-Meteo's resolved zone\n`)

  const zoneMismatches = []
  let answered = 0
  for (const v of venues) {
    // Every failure becomes a NAMED mismatch, never a thrown exception. An
    // unparseable body used to crash the script here, which produces no check
    // results at all — the same shape as reading `page` after the browser closed.
    const { res, why } = await call(fetchImpl, forecastUrl(v.Where))
    if (res === null) {
      if (tolerate) unanswered(v.Name, why)
      else zoneMismatches.push(`${v.Name}: ${why}`)
      continue
    }
    answered++
    if (!res.ok) { zoneMismatches.push(`${v.Name}: HTTP ${res.status}`); continue }
    let body
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

  // SAMPLE-COVERAGE-A (field-relay-nba/CLAUDE.md Rule 91): the denominator is
  // printed beside the result, so a tolerated outage cannot read as full coverage.
  console.log(`  checked ${answered} of ${venues.length} venues\n`)
  if (answered === 0 && tolerate) {
    console.log(`::warning::no venue answered — checked 0 of ${venues.length} venues. ` +
      'The venue zones were not asserted on this run.')
  } else {
    check('every venue resolves to the IANA zone it declares', zoneMismatches.length === 0,
      zoneMismatches.join('\n      → '))
  }

  // And the guard has to be shown able to fail, or its clean run means only that
  // it ran. A deliberately wrong coordinate must NOT resolve to Fenway's zone.
  const wrong = coordinates(-42.3467, 71.0972)
  const flipped = await call(fetchImpl, forecastUrl(wrong))
  let wrongZone = null
  let wrongErr = flipped.res === null ? flipped.why : null
  if (flipped.res !== null) {
    try { wrongZone = (await flipped.res.json()).timezone } catch (e) { wrongErr = e.message }
  }
  console.log(`  sign-flipped Fenway resolves to ${wrongZone ?? `<${wrongErr}>`}`)
  if (flipped.res === null && tolerate) {
    unanswered('the sign-flipped probe', flipped.why)
  } else {
    check('the sign-flipped probe got an answer to compare', wrongErr === null, wrongErr)
    check('a sign-flipped coordinate does NOT resolve to the declared zone',
      wrongErr === null && wrongZone !== 'America/New_York', `it resolved to ${wrongZone} anyway`)
  }

  return summarize()
}

// --- self-test: the four outage cases, against a stub service ---------------
//
// MUTATE-FIRST-A (field-relay-nba/CLAUDE.md Rule 90). Each case is a shape that
// really happened or the one the fix must not open. No network: the stub answers
// by URL, with the transcribed current block from Suite.fs plus the zone and
// elevation fields the venue loop reads.
const selfTest = async () => {
  const venues = toArray(allVenues)
  const M = venues.length
  const byUrl = new Map(venues.map(v => [forecastUrl(v.Where), v]))
  const victim = venues.find(v => v.Name !== 'Fenway Park')
  const victimUrl = forecastUrl(victim.Where)
  const CURRENT = { time: '2026-08-11T17:00', temperature_2m: 72.4, apparent_temperature: 74.1,
    precipitation: 0.0, rain: 0.0, wind_speed_10m: 8.1, wind_direction_10m: 210, wind_gusts_10m: 14.3 }

  // `override(url)` returns a Response, throws, or returns undefined to fall
  // through to the healthy service.
  const service = (override) => async (url) => {
    const o = override(url)
    if (o !== undefined) return o
    if (url.includes('latitude=999')) return new Response('{"error":true,"reason":"Latitude must be in range"}', { status: 400 })
    if (url.includes('latitude=-42.3467')) return Response.json({ timezone: 'Indian/Kerguelen', elevation: 0, current: CURRENT })
    const v = byUrl.get(url)
    if (!v) return new Response('{"error":true}', { status: 400 })
    return Response.json({ timezone: v.Zone, elevation: v.Name === 'Coors Field' ? 1600 : 50, current: CURRENT })
  }
  const down = () => { throw new TypeError('fetch failed') }

  const CASES = [
    { name: 'healthy service, flag set', tolerate: true, override: () => undefined,
      exit: 0, says: [`checked ${M} of ${M} venues`] },
    { name: 'healthy service, no flag', tolerate: false, override: () => undefined,
      exit: 0, says: [`checked ${M} of ${M} venues`] },
    { name: 'a 503 on one venue, flag set', tolerate: true,
      override: (u) => u === victimUrl ? new Response('', { status: 503 }) : undefined,
      exit: 0, says: [`::warning::Open-Meteo did not answer ${victim.Name} (HTTP 503)`, `checked ${M - 1} of ${M} venues`] },
    { name: 'the same 503, no flag', tolerate: false,
      override: (u) => u === victimUrl ? new Response('', { status: 503 }) : undefined,
      exit: 1, says: [`${victim.Name}: HTTP 503`] },
    { name: 'one venue answering 200 with the WRONG zone, flag set', tolerate: true,
      override: (u) => u === victimUrl ? Response.json({ timezone: 'Pacific/Auckland', elevation: 0, current: CURRENT }) : undefined,
      exit: 1, says: [`${victim.Name}: declared ${victim.Zone}, resolved Pacific/Auckland`] },
    { name: 'a 400 on one venue is the service ANSWERING, flag set', tolerate: true,
      override: (u) => u === victimUrl ? new Response('{"error":true}', { status: 400 }) : undefined,
      exit: 1, says: [`${victim.Name}: HTTP 400`] },
    // The calls OUTSIDE the venue loop, each on its own. Without these the
    // no-flag cases above pass on the venue loop alone, and a mutation that
    // tolerates the probes without the flag is not caught.
    { name: 'a 503 on the first call (Fenway), flag set', tolerate: true,
      override: (u) => u === forecastUrl(coordinates(42.3467, -71.0972)) ? new Response('', { status: 503 }) : undefined,
      exit: 0, says: ['::warning::Open-Meteo did not answer the Fenway reading (HTTP 503)', `checked ${M - 1} of ${M} venues`] },
    { name: 'the same first-call 503, no flag', tolerate: false,
      override: (u) => u === forecastUrl(coordinates(42.3467, -71.0972)) ? new Response('', { status: 503 }) : undefined,
      exit: 1, says: ['Open-Meteo answers the Fenway reading'] },
    { name: 'a 503 on the out-of-range latitude probe, flag set', tolerate: true,
      override: (u) => u.includes('latitude=999') ? new Response('', { status: 503 }) : undefined,
      exit: 0, says: ['::warning::Open-Meteo did not answer the out-of-range latitude probe (HTTP 503)'] },
    { name: 'the same probe 503, no flag', tolerate: false,
      override: (u) => u.includes('latitude=999') ? new Response('', { status: 503 }) : undefined,
      exit: 1, says: ['Open-Meteo answers the out-of-range latitude probe'] },
    { name: 'the sign-flipped probe unreachable, flag set', tolerate: true,
      override: (u) => u.includes('latitude=-42.3467') ? down() : undefined,
      exit: 0, says: ['::warning::Open-Meteo did not answer the sign-flipped probe'] },
    { name: 'the same sign-flipped probe, no flag', tolerate: false,
      override: (u) => u.includes('latitude=-42.3467') ? down() : undefined,
      exit: 1, says: ['the sign-flipped probe got an answer to compare'] },
    { name: 'every call unreachable, flag set', tolerate: true, override: down,
      exit: 0, says: [`checked 0 of ${M} venues`, '::warning::no venue answered'] },
    { name: 'every call unreachable, no flag', tolerate: false, override: down,
      exit: 1, says: [`checked 0 of ${M} venues`] },
  ]

  const realLog = console.log
  const realErr = console.error
  const wrong = []
  for (const c of CASES) {
    const out = []
    console.log = console.error = (...a) => out.push(a.join(' '))
    let failures
    try {
      failures = await run({ fetchImpl: service(c.override), tolerate: c.tolerate, venues })
    } finally {
      console.log = realLog
      console.error = realErr
    }
    const exit = failures === 0 ? 0 : 1
    const text = out.join('\n')
    const missing = c.says.filter(s => !text.includes(s))
    const ok = exit === c.exit && missing.length === 0
    realLog(`${ok ? 'PASS' : 'FAIL'}  ${c.name}: exit ${exit} (want ${c.exit})` +
      (missing.length ? `\n      → missing from output: ${missing.join(' | ')}` : ''))
    if (!ok) wrong.push(c.name)
  }
  realLog(`\n${CASES.length - wrong.length}/${CASES.length} self-test cases passed`)
  return wrong.length
}

if (process.argv.includes('--self-test')) {
  finish(await selfTest())
} else {
  finish(await run({
    fetchImpl: fetch,
    tolerate: process.argv.includes('--tolerate-unreachable'),
    venues: toArray(allVenues),
  }))
}
