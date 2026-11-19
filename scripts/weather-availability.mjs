// Is the live Open-Meteo host answering THIS runner? Reported, never gating.
//
// docs/CC-CMD-2026-11-18-split-live-weather-check.md, Task 3. The page's weather is judged for
// correctness against recorded bodies (render-check --recorded-weather), strictly. What a runner's
// network does to api.open-meteo.com is a different question with a different owner: on
// 2026-11-18 (probe run 44241127086, westus2) TLS to Open-Meteo's WEST address stalled for two
// minutes while EAST answered the same runner, and 75 of 110 requests in that window got no answer.
// That says nothing about a commit, so it no longer reds one. It is counted here instead, one record
// per verify run, in `outbox/weather-availability.jsonl`.
//
// What it asks: every distinct location in the venue table, once, with the page's own URL
// (`forecastUrl`), in the page's waves (`maxInFlight`) and with the page's per-request cap
// (`requestCapMs`). What it records: answered, refused by the decoder (with the decoder's message),
// and not answered, by cause (the code in `e.cause`, never "fetch failed": errorOf/causeKey from
// probe-rain-precip-pair.mjs), plus Node's path to the host after the requests (egress-path-lib).
//
// BUDGET: the whole run is bounded, as the page bounds its slate (`slateDeadlineMs`). A healthy run asks all 552 locations in
// about 8 s (verify 44415866628); with nothing answering, 4 at a time at 8 s each would take 18 minutes, which the
// fault-injected run 44415881767 measured by hitting its 10-minute step timeout. Past the budget no new wave starts, and
// the locations not reached are counted as not asked, beside the ones asked: the coverage line says "asked X of Y".
//
// EXIT: 0 on any network outcome, including every request unanswered. NOT 0 when the reporter is
// broken: it cannot write its record, or the record it wrote does not read back. A reporter that
// cannot report must not pass as a quiet host.
//
// Usage:  node scripts/weather-availability.mjs --out outbox/weather-availability.jsonl
//         node scripts/weather-availability.mjs --self-test      (no network)

import { appendFileSync, readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { forecastUrl, decodeReading } from '../build/Weather.js'
import { all as allVenues } from '../build/Venues.js'
import { requestCapMs } from '../build/WeatherView.js'
import { createChecks, finish, isMain, toArray } from './checks.mjs'
import { errorOf, causeKey, egressSummary, WAVE } from './probe-rain-precip-pair.mjs'
import { describeEgressFacts } from './egress-path-lib.mjs'

const HOST = 'api.open-meteo.com'

/** One location per distinct page URL: aliases share coordinates and the page asks for them once. */
export const locations = venues => {
  const seen = new Map()
  for (const v of venues) {
    const url = forecastUrl(v.Where)
    if (!seen.has(url)) seen.set(url, { venue: v.Name, url })
  }
  return [...seen.values()]
}

/** One request, never throws. */
export const ask = async (fetchImpl, url, capMs) => {
  try {
    const r = await fetchImpl(url, { signal: AbortSignal.timeout(capMs) })
    return { status: r.status, text: await r.text() }
  } catch (e) { return { error: errorOf(e) } }
}

/** answered | refused (the decoder's own message) | not-answered (a cause label). Pure. */
export const classify = outcome => {
  if (outcome.error) return { kind: 'not-answered', cause: causeKey(outcome.error) }
  if (outcome.status !== 200) return { kind: 'not-answered', cause: `HTTP ${outcome.status}` }
  const d = decodeReading(outcome.text)
  // Thoth's Result compiles to a union; `Ok` is tag 0.
  return d.tag === 0 ? { kind: 'answered' } : { kind: 'refused', message: String(d.fields?.[0] ?? 'decode failed') }
}

export const BUDGET_MS = 60_000

export const tally = results => {
  const notAnswered = {}
  for (const r of results.filter(r => r.kind === 'not-answered')) notAnswered[r.cause] = (notAnswered[r.cause] ?? 0) + 1
  return {
    locations: results.length,
    asked: results.filter(r => r.kind !== 'not-asked').length,
    notAsked: results.filter(r => r.kind === 'not-asked').length,
    answered: results.filter(r => r.kind === 'answered').length,
    refused: results.filter(r => r.kind === 'refused').map(r => ({ venue: r.venue, message: r.message })),
    notAnswered,
    notAnsweredVenues: results.filter(r => r.kind === 'not-answered').map(r => r.venue),
  }
}

/** `region` out of the egress line's `runner=` field; null when it is not there, never guessed. */
export const regionOf = line => {
  const m = /runner=image \S+ region (.+?) cloud /.exec(line ?? '')
  return m ? m[1] : null
}

/** The measurement. Never rejects on a network outcome: `ask` resolves, the egress read is bounded. */
export const run = async ({ fetchImpl, venues, capMs = requestCapMs, wave = WAVE, budgetMs = BUDGET_MS, clock = () => Date.now(), egress, env = process.env, now = () => new Date() }) => {
  const at = now().toISOString()
  const locs = locations(venues)
  const results = []
  const started = clock()
  for (let i = 0; i < locs.length; i += wave) {
    if (clock() - started >= budgetMs) {
      for (const l of locs.slice(i)) results.push({ venue: l.venue, kind: 'not-asked' })
      break
    }
    const batch = locs.slice(i, i + wave)
    const outs = await Promise.all(batch.map(l => ask(fetchImpl, l.url, capMs)))
    batch.forEach((l, j) => results.push({ venue: l.venue, ...classify(outs[j]) }))
  }
  let line = null
  try { line = (await egress()).line } catch (e) { line = `egress read threw: ${e.message}` }
  const e = egressSummary(line)
  return {
    at, sha: env.GITHUB_SHA ?? null, run: env.GITHUB_RUN_ID ?? null, attempt: env.GITHUB_RUN_ATTEMPT ?? null,
    event: env.GITHUB_EVENT_NAME ?? null, region: regionOf(line), capMs, wave, budgetMs,
    ...tally(results),
    egress: { system: e.system, systemTls: e.systemTls, line },
  }
}

/** Appends one line and reads it back. Throws when either fails: a broken reporter is a failure. */
export const writeRecord = (file, record) => {
  const line = JSON.stringify(record)
  appendFileSync(file, line + '\n')
  const last = readFileSync(file, 'utf8').trimEnd().split('\n').at(-1)
  if (last !== line) throw new Error(`the record did not read back from ${file}`)
}

/** What is printed and written to the step summary. The coverage line comes first (Rule 91). */
export const render = rec => {
  const causes = Object.entries(rec.notAnswered).map(([k, n]) => `${k} ${n}`).join(', ')
  const notAnswered = rec.asked - rec.answered - rec.refused.length
  const lines = [
    `asked ${rec.asked} of ${rec.locations} location(s): ${rec.answered} answered, ${rec.refused.length} refused by the decoder, ${notAnswered} not answered` +
      (rec.notAsked ? `; ${rec.notAsked} not asked, the ${rec.budgetMs}ms budget spent` : ''),
    `not answered, by cause: ${causes || 'none'}`,
    ...rec.refused.map(r => `refused: ${r.venue} — ${r.message}`),
    `region: ${rec.region ?? 'unread'}; system address ${rec.egress.system ?? 'unread'}, TLS to it ${rec.egress.systemTls ?? 'unread'}`,
  ]
  const warning = rec.refused.length + notAnswered + rec.notAsked > 0
    ? `::warning::Open-Meteo from this runner: ${notAnswered} of ${rec.asked} not answered (${causes || 'none'}), ` +
      `${rec.refused.length} refused. Reported to outbox/weather-availability.jsonl; not a gate (the page's weather is gated on recorded bodies).`
    : null
  return { lines, warning }
}

// --- self-test: no network ----------------------------------------------------------------------
const selfTest = async () => {
  const { check, summarize } = createChecks()
  const fixture = JSON.parse(readFileSync('test/open-meteo-recorded.json', 'utf8'))
  const good = fixture.bodies[fixture.default].body
  const refused = fixture.refused.body
  const venues = toArray(allVenues)
  const locs = locations(venues)
  const reply = (status, text) => ({ status, text: async () => text })
  const coded = code => Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('x'), { code }) })
  // Verbatim from live-check 43862583632, job 133282924627 (the same line probe-rain-precip-pair's X1 reads).
  const egressLine = "egress-path: probe-error=TypeError \"fetch failed\" < ConnectTimeoutError UND_ERR_CONNECT_TIMEOUT \"Connect Timeout Error (attempted address: api.open-meteo.com:443, timeout: 10000ms)\" | cause=UND_ERR_CONNECT_TIMEOUT stage=connect-budget | node=v22.23.4 autoSelectFamily=true attemptTimeout=250ms resultOrder=verbatim resolvers=127.0.0.100,127.0.0.53,168.63.129.16 | dns-v4=ok 51.81.167.44 2ms | dns-v6=ENOTFOUND 36ms | public-v4=doh 8.8.8.8 ok 51.81.167.44 51ms | view-west-v4=doh 8.8.8.8 ecs 20.80.173.0/24 ok 51.81.167.44 65ms | view-east-v4=doh 8.8.8.8 ecs 68.220.172.0/24 ok 167.114.211.86 48ms | connect-v4=51.81.167.44:443 ok 11ms | connect-v6=not attempted (no v6 address: ENOTFOUND) | tls=51.81.167.44:443 no-tls-in-3000ms (tcp 11ms) from system,public,west ; 167.114.211.86:443 ok (tcp 67ms, handshake 135ms) from east | egress-v4=4.155.244.132 | egress-v6=unreadable (ENETUNREACH) | runner=image ubuntu26@20261111.196.1 region westus2 cloud Azure (Node's own network stack at that later moment, not Chromium's). The page reported: Weather is unavailable: all 1 venue requests failed. | Reported: M&T Bank Stadium: signal timed out after 8000ms. Request timings (start+duration): 949+8001ms 8949+5999ms. Page built from: 231dde7"
  const egress = async () => ({ line: egressLine })

  check('L1 one request per distinct location, not per venue', locs.length > 0 && locs.length < venues.length &&
    new Set(locs.map(l => l.url)).size === locs.length, `${locs.length} of ${venues.length}`)

  check('C1 a 200 the decoder reads is answered', classify({ status: 200, text: good }).kind === 'answered')
  const r = classify({ status: 200, text: refused })
  check('C2 a 200 the decoder refuses is refused, with its message', r.kind === 'refused' && /rain [\d.]+ exceeds precipitation/.test(r.message), JSON.stringify(r))
  check('C3 a 503 is not answered, labelled by status', classify({ status: 503, text: '' }).cause === 'HTTP 503')
  check('C4 a connect timeout is labelled by its cause code', classify({ error: errorOf(coded('UND_ERR_CONNECT_TIMEOUT')) }).cause === 'UND_ERR_CONNECT_TIMEOUT')
  const t = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })
  check('C5 a cap timeout (no cause) is labelled by its name', classify({ error: errorOf(t) }).cause === 'TimeoutError')

  // First, so a request that throws is named here rather than crashing the mixed run below.
  let rejected = null
  const dead = await run({ fetchImpl: async () => { throw coded('ENOTFOUND') }, venues, egress: async () => { throw new Error('no dns') }, env: {} })
    .catch(e => { rejected = e; return null })
  check('R4 every request failing still yields a record, never a throw', rejected === null && dead.answered === 0 &&
    dead.notAnswered.ENOTFOUND === locs.length && dead.region === null, rejected?.message ?? JSON.stringify(dead?.notAnswered))
  // A run that throws cannot be read further: report what was found instead of crashing past it.
  if (rejected !== null) return summarize()

  // A mixed run: the first location refused, the second a connect timeout, the third a 503, the rest answered.
  let n = 0
  const mixed = async url => {
    const i = locs.findIndex(l => l.url === url); n++
    if (i === 0) return reply(200, refused)
    if (i === 1) throw coded('UND_ERR_CONNECT_TIMEOUT')
    if (i === 2) return reply(503, 'busy')
    return reply(200, good)
  }
  const rec = await run({ fetchImpl: mixed, venues, egress, env: { GITHUB_RUN_ID: '1' }, now: () => new Date('2026-11-18T00:00:00Z') })
  check('R1 every location asked once', n === locs.length && rec.asked === locs.length, `${n} requests, asked ${rec.asked}`)
  check('R2 answered, refused and not answered are counted apart', rec.answered === locs.length - 3 &&
    rec.refused.length === 1 && rec.refused[0].venue === locs[0].venue &&
    rec.notAnswered.UND_ERR_CONNECT_TIMEOUT === 1 && rec.notAnswered['HTTP 503'] === 1, JSON.stringify({ a: rec.answered, r: rec.refused, u: rec.notAnswered }))
  check('R3 the region and the system address are read from the egress line', rec.region === 'westus2' &&
    rec.egress.system === '51.81.167.44' && rec.egress.systemTls === 'stall', JSON.stringify({ region: rec.region, e: rec.egress.system, t: rec.egress.systemTls }))

  const { lines, warning } = render(rec)
  check('O1 the coverage line is first', lines[0] === `asked ${locs.length} of ${locs.length} location(s): ${locs.length - 3} answered, 1 refused by the decoder, 2 not answered`, lines[0])
  check('O2 the causes and the refusal are printed', lines.some(l => l.includes('UND_ERR_CONNECT_TIMEOUT 1')) && lines.some(l => l.startsWith(`refused: ${locs[0].venue}`)))
  check('O3 anything not answered or refused is a warning', warning !== null && warning.startsWith('::warning::'))
  const clean = await run({ fetchImpl: async () => reply(200, good), venues, egress, env: {} })
  check('O4 a clean run is not a warning', render(clean).warning === null)
  const onlyRefused = await run({ fetchImpl: async url => reply(200, url === locs[0].url ? refused : good), venues, egress, env: {} })
  check('O5 a refusal alone is a warning', onlyRefused.refused.length === 1 && render(onlyRefused).warning !== null)

  // The budget, on a clock that advances 10 s per wave: with a 25 s budget, three waves start and the rest are not asked.
  let tick = 0, asked = 0
  const slow = await run({ fetchImpl: async () => { asked++; tick += 10_000 / WAVE; throw coded('UND_ERR_CONNECT_TIMEOUT') },
    venues, egress, env: {}, budgetMs: 25_000, clock: () => tick })
  check('B1 past the budget no new wave starts, and the rest are counted as not asked', asked === 3 * WAVE &&
    slow.asked === 3 * WAVE && slow.notAsked === locs.length - 3 * WAVE && slow.locations === locs.length &&
    slow.notAnswered.UND_ERR_CONNECT_TIMEOUT === 3 * WAVE, JSON.stringify({ asked, a: slow.asked, n: slow.notAsked, u: slow.notAnswered }))
  const sl = render(slow)
  check('B2 the coverage line says how many were not asked, and it is a warning', sl.lines[0].startsWith(`asked ${3 * WAVE} of ${locs.length} location(s)`) &&
    sl.lines[0].endsWith(`; ${locs.length - 3 * WAVE} not asked, the 25000ms budget spent`) && sl.warning !== null, sl.lines[0])
  check('B3 the budget is a minute, about seven times a healthy run', BUDGET_MS === 60_000 && rec.budgetMs === BUDGET_MS)

  const dir = mkdtempSync(join(tmpdir(), 'weather-availability-'))
  try {
    const f = join(dir, 'ledger.jsonl')
    writeFileSync(f, '{"earlier":true}\n')
    writeRecord(f, rec)
    const all = readFileSync(f, 'utf8').trimEnd().split('\n')
    check('W1 the record is appended and reads back whole', all.length === 2 && all[0] === '{"earlier":true}' &&
      JSON.stringify(JSON.parse(all[1])) === JSON.stringify(rec), `${all.length} line(s)`)
    let threw = false
    try { writeRecord(join(dir, 'no-such-dir', 'x.jsonl'), rec) } catch { threw = true }
    check('W2 a record that cannot be written is a failure, not a pass', threw && !existsSync(join(dir, 'no-such-dir')))
  } finally { rmSync(dir, { recursive: true, force: true }) }

  check('K1 the page\'s cap and wave are the ones used', rec.capMs === requestCapMs && rec.wave === WAVE && WAVE === 4, `${rec.capMs} ${rec.wave}`)
  return summarize()
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--self-test')) finish(await selfTest())
  else {
    const at = process.argv.indexOf('--out')
    const out = at === -1 ? null : process.argv[at + 1]
    if (!out || out.startsWith('--')) { console.error('--out <file> is required'); process.exit(2) }
    const rec = await run({ fetchImpl: fetch, venues: toArray(allVenues), egress: () => describeEgressFacts({ host: HOST }) })
    const { lines, warning } = render(rec)
    for (const l of lines) console.log(l)
    if (warning) console.log(warning)
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Open-Meteo availability (reported, not gating)\n\n${lines.map(l => `- ${l}`).join('\n')}\n`)
    }
    // Throws (exit 1) when the record cannot be written or does not read back: the one way this step fails.
    writeRecord(out, rec)
    console.log(`record appended to ${out}`)
  }
}
