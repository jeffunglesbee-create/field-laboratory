// Does Open-Meteo's `current` block ever say rain > precipitation, how often,
// does a ground stay that way or flip back, and which model supplied each value?
//
// docs/CC-CMD-2026-11-10-live-chip-refused-payload.md, Task 1. On 2026-11-10
// verify run 42863538303 failed because the page's decoder refused two HTTP 200
// bodies (`rain 0.1 exceeds precipitation 0`, `rain 0.6 exceeds precipitation
// 0.3`); the same 16 requests five minutes later were all consistent. Nothing
// counted how often it happens, and the raw bodies were not kept. This does
// both, on a runner (Open-Meteo is not reachable from the dev sandbox).
//
// WHAT IS REQUESTED IS THE PAGE'S REQUEST. The grounds are the slate's game
// venues (the relay's /context/date/<date>, the `venue` field the page decodes
// in Desk.fs) that the venue table knows by exact name, which is how the page
// and render-check choose them. Each URL is `forecastUrl(Where)` from
// build/Weather.js, unchanged. Requests go in waves of 4, the page's
// `maxInFlight` (src/WeatherView.fs).
//
// TASK 0, run first (probe-url run 42963031074, 2026-11-11T05:01Z, Broadfield):
// `current` accepts `models` and answers the same shape
// (`current: {time, interval, precipitation, rain, showers}`), each model on its
// own grid point; two models in one request answered ONE set. So on a violation
// this asks each model alone. The default (best_match) body that morning read
// precipitation 0.00, showers 0.20: a variable larger than the total it is part
// of, which is why the default is suspected of mixing models per variable.
// That is one body, a lead and not a finding.
//
// VERDICTS, none of them silent:
//   refusal-observed          some sample had rain > precipitation + 0.001
//   none-observed-while-wet   none did, and at the start some ground read rain or precipitation above 0
//   not-observable-dry        none did, and at the start every ground read 0 for both: not measured, not a pass
//
// Output: outbox/rain-precip-pair-<date>-<stamp>.txt (first line: `checked N of
// M expected samples`) and .jsonl (every sample with its raw body).
//
// Usage:  DATE=2026-11-14 node scripts/probe-rain-precip-pair.mjs   (MINUTES=30, EVERY_S=60)
//         node scripts/probe-rain-precip-pair.mjs --self-test

import { mkdirSync, writeFileSync, appendFileSync, readFileSync } from 'node:fs'
import { createChecks, isMain } from './checks.mjs'

export const TOLERANCE = 0.001          // the decoder's own: `rain > total + 0.001<mm>` in src/Weather.fs
export const WAVE = 4                   // src/WeatherView.fs `maxInFlight`
export const MODELS = ['ecmwf_ifs025', 'icon_seamless', 'gfs_seamless', 'ukmo_seamless', 'meteofrance_seamless']
const RELAY = 'https://field-relay-nba.jeffunglesbee.workers.dev'
const PLACEHOLDER_VENUES = new Set(['TBC', 'TBD', '—', '-', ''])   // render-check.mjs's set

/** The decoder's rule, as a predicate over the two numbers. */
export const isViolation = (precipitation, rain) =>
  typeof precipitation === 'number' && typeof rain === 'number' && rain > precipitation + TOLERANCE

/** The slate's grounds the table knows, by exact name, once each, in slate order. */
export const groundsFor = (payload, tableNames) => {
  const games = [...(payload?.games?.regular ?? []), ...(payload?.games?.postseason ?? [])]
  const seen = new Set()
  const out = []
  for (const g of games) {
    const v = typeof g?.venue === 'string' ? g.venue : ''
    if (PLACEHOLDER_VENUES.has(v.trim()) || !tableNames.has(v) || seen.has(v)) continue
    seen.add(v); out.push(v)
  }
  return out
}

/** One response body -> the pair, or why it has none. */
export const readPair = (status, text) => {
  if (status !== 200) return { ok: false, why: `HTTP ${status}` }
  let j
  try { j = JSON.parse(text) } catch (e) { return { ok: false, why: `not JSON: ${e.message}` } }
  const c = j?.current
  if (!c || typeof c.precipitation !== 'number' || typeof c.rain !== 'number') return { ok: false, why: 'no numeric current.precipitation and current.rain' }
  return { ok: true, time: c.time, precipitation: c.precipitation, rain: c.rain, showers: typeof c.showers === 'number' ? c.showers : null }
}

/**
 * Which single models' values equal the default body's. A MATCH, not a proof:
 * two models can agree by chance, and a model can update between the requests.
 */
export const attribute = (pair, perModel) => ({
  precipitationFrom: perModel.filter(m => m.ok && Math.abs(m.precipitation - pair.precipitation) <= TOLERANCE).map(m => m.model),
  rainFrom: perModel.filter(m => m.ok && Math.abs(m.rain - pair.rain) <= TOLERANCE).map(m => m.model),
})

/**
 * A failed fetch, kept whole enough to say WHY. Node's fetch throws "fetch failed" for every
 * connection-level failure and puts the reason in `cause` (a code such as ECONNRESET, or an
 * AggregateError whose `errors` are one per address tried). Run 1 kept only the message, so 53
 * failures of 120 were recorded with no reason at all.
 */
export const errorOf = (e) => {
  const c = e?.cause
  const codes = Array.isArray(c?.errors) ? c.errors.map(x => x?.code ?? x?.name ?? String(x)) : []
  return { name: e?.name ?? null, message: e?.message ?? String(e), cause: c?.code ?? null,
           causeMessage: c?.message ?? null, causeCodes: codes }
}

/**
 * One label per failure, for counting: the cause code, the per-address codes, the cause's message
 * when it has no code (measured on Node 22.22: a blocked port gives cause `Error: bad port`, no code),
 * or the error's own name (a TimeoutError has no cause).
 */
export const causeKey = (err) =>
  err.causeCodes?.length ? `${err.cause ?? 'cause'}[${[...new Set(err.causeCodes)].sort().join(',')}]`
    : err.cause ?? (err.causeMessage ? `cause: ${err.causeMessage}` : err.name ?? 'unknown')

/** samples: [{ round, ground, ok, precipitation, rain, violation, attribution?, failure? }] */
export const summarize = ({ samples, grounds, rounds }) => {
  const expected = grounds.length * rounds
  const read = samples.filter(s => s.ok)
  const violations = read.filter(s => s.violation)
  const first = read.filter(s => s.round === 0)
  const wetAtStart = first.some(s => s.precipitation > 0 || s.rain > 0)
  const byGround = {}
  for (const g of grounds) {
    const seq = read.filter(s => s.ground === g).sort((a, b) => a.round - b.round).map(s => s.violation)
    let flips = 0
    for (let i = 1; i < seq.length; i++) if (seq[i] !== seq[i - 1]) flips++
    byGround[g] = { read: seq.length, violations: seq.filter(Boolean).length, flips }
  }
  const unanswered = samples.filter(s => s.failure)
  const byCause = {}
  for (const s of unanswered) byCause[s.failure] = (byCause[s.failure] || 0) + 1
  const verdict = violations.length ? 'refusal-observed' : wetAtStart ? 'none-observed-while-wet' : 'not-observable-dry'
  return { expected, checked: read.length, violations: violations.length, wetAtStart, wetSamples: read.filter(s => s.precipitation > 0 || s.rain > 0).length, byGround, verdict, violationSamples: violations, unanswered: unanswered.length, byCause }
}

export const render = ({ date, summary, startedAt, finishedAt, rounds, everyS }) => {
  const s = summary
  const rate = s.checked ? `${s.violations} of ${s.checked} read responses (${(100 * s.violations / s.checked).toFixed(2)}%)` : 'no response read'
  const lines = [
    `checked ${s.checked} of ${s.expected} expected samples`,
    `VERDICT: ${s.verdict}`,
    `slate ${date}; ${Object.keys(s.byGround).length} ground(s) x ${rounds} round(s) every ${everyS}s; ${startedAt} to ${finishedAt}`,
    `per-request rate of rain > precipitation + ${TOLERANCE}: ${rate}`,
    `wet at the start: ${s.wetAtStart ? 'yes' : 'no'}; wet samples overall: ${s.wetSamples}`,
    `requests with no answer: ${s.unanswered}` + (s.unanswered ? `, by cause: ${Object.entries(s.byCause).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}` : ''),
    '',
    'ground                                   read  violations  flips',
    ...Object.entries(s.byGround).map(([g, v]) => `${g.padEnd(40)} ${String(v.read).padStart(4)}  ${String(v.violations).padStart(10)}  ${String(v.flips).padStart(5)}`),
  ]
  if (s.violationSamples.length) {
    lines.push('', 'each violation, with the single models whose values equal it (a match, not a proof):')
    for (const v of s.violationSamples) {
      const a = v.attribution
      lines.push(`  round ${v.round} ${v.ground} time ${v.time}: precipitation ${v.precipitation} rain ${v.rain}` +
        (a ? ` | precipitation matches [${a.precipitationFrom.join(', ') || 'none'}], rain matches [${a.rainFrom.join(', ') || 'none'}]` : ' | models not asked'))
    }
  }
  return lines.join('\n') + '\n'
}

// ── live ────────────────────────────────────────────────────────────────────

const get = async (url) => {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15_000) })
    return { status: r.status, text: await r.text() }
  } catch (e) { return { status: 0, text: '', error: errorOf(e) } }
}

async function live () {
  const date = process.env.DATE
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) { console.log('FAIL: DATE=YYYY-MM-DD is required'); process.exit(1) }
  const minutes = Number(process.env.MINUTES || 30)
  const everyS = Number(process.env.EVERY_S || 60)
  const rounds = Math.max(1, Math.floor(minutes * 60 / everyS))
  const { all } = await import('../build/Venues.js')
  const { forecastUrl } = await import('../build/Weather.js')
  const table = new Map(Array.from(all).map(v => [v.Name, v]))

  const slate = await get(`${RELAY}/context/date/${date}`)
  if (slate.status !== 200) { console.log(`FAIL: relay /context/date/${date}: HTTP ${slate.status} ${slate.error || ''}`); process.exit(1) }
  const grounds = groundsFor(JSON.parse(slate.text), new Set(table.keys()))
  if (!grounds.length) { console.log(`FAIL: the slate of ${date} has no ground the venue table knows; nothing to sample`); process.exit(1) }

  mkdirSync('outbox', { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const base = `outbox/rain-precip-pair-${date}-${stamp}`
  writeFileSync(`${base}.jsonl`, '')
  const startedAt = new Date().toISOString()
  console.log(`slate ${date}: ${grounds.length} ground(s): ${grounds.join(', ')}; ${rounds} round(s) every ${everyS}s`)

  const samples = []
  for (let round = 0; round < rounds; round++) {
    const t0 = Date.now()
    for (let i = 0; i < grounds.length; i += WAVE) {
      const wave = grounds.slice(i, i + WAVE)
      const answers = await Promise.all(wave.map(g => get(forecastUrl(table.get(g).Where))))
      for (let k = 0; k < wave.length; k++) {
        const ground = wave[k]
        const a = answers[k]
        const p = readPair(a.status, a.text)
        const sample = { round, ground, at: new Date().toISOString(), status: a.status, ...p, violation: p.ok ? isViolation(p.precipitation, p.rain) : false,
                         ...(a.error ? { failure: causeKey(a.error) } : {}) }
        const record = { ...sample, body: a.text || '', ...(a.error ? { error: a.error } : {}) }
        if (sample.violation) {
          const w = table.get(ground).Where
          const perModel = []
          for (const model of MODELS) {
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${w.Lat}&longitude=${w.Lon}&current=precipitation,rain,showers&timezone=auto&models=${model}`
            const m = await get(url)
            perModel.push({ model, status: m.status, ...readPair(m.status, m.text), body: m.text })
          }
          sample.attribution = attribute(p, perModel)
          record.attribution = sample.attribution
          record.perModel = perModel
          console.log(`VIOLATION round ${round} ${ground}: precipitation ${p.precipitation} rain ${p.rain}`)
        }
        samples.push(sample)
        appendFileSync(`${base}.jsonl`, JSON.stringify(record) + '\n')
      }
    }
    const wait = everyS * 1000 - (Date.now() - t0)
    if (round < rounds - 1 && wait > 0) await new Promise(r => setTimeout(r, wait))
  }

  const summary = summarize({ samples, grounds, rounds })
  const text = render({ date, summary, startedAt, finishedAt: new Date().toISOString(), rounds, everyS })
  writeFileSync(`${base}.txt`, text)
  console.log(text)
  console.log(`written: ${base}.txt and ${base}.jsonl`)
}

// ── self-test ───────────────────────────────────────────────────────────────

function selfTest () {
  const { check, summarize: done } = createChecks()

  // The two constants are copies of the page's; the source is read so a copy cannot drift.
  check('C1 TOLERANCE is the decoder\'s own bound in src/Weather.fs',
    new RegExp(`rain > total \\+ ${TOLERANCE}<mm>`).test(readFileSync('src/Weather.fs', 'utf8')))
  check('C2 WAVE is the page\'s maxInFlight in src/WeatherView.fs',
    new RegExp(`let private maxInFlight = ${WAVE}\\b`).test(readFileSync('src/WeatherView.fs', 'utf8')))
  check('V1 the rule is the decoder\'s: 0.1 over 0 is a violation', isViolation(0, 0.1))
  check('V2 equal values are not a violation', !isViolation(0.3, 0.3))
  check('V3 within the 0.001 tolerance is not a violation', !isViolation(0.3, 0.3005))
  check('V4 a missing number is not a violation (it is unread, counted elsewhere)', !isViolation(null, 0.5) && !isViolation(0.5, undefined))

  const payload = { games: { regular: [{ venue: 'Broadfield Stadium' }, { venue: 'TBC' }, { venue: 'Nowhere Park' }, { venue: 'Broadfield Stadium' }], postseason: [{ venue: 'The Kassam Stadium' }] } }
  const g = groundsFor(payload, new Set(['Broadfield Stadium', 'The Kassam Stadium', 'TBC']))
  check('G1 grounds are the table-known venues, once each, postseason included', JSON.stringify(g) === '["Broadfield Stadium","The Kassam Stadium"]')
  check('G2 a placeholder venue is never a ground, even if the table had it', !g.includes('TBC'))
  check('G3 no games is no grounds, not a throw', groundsFor({}, new Set(['x'])).length === 0)

  check('R1 a 200 with both numbers reads', readPair(200, '{"current":{"time":"t","precipitation":0.3,"rain":0.6,"showers":0}}').rain === 0.6)
  check('R2 a non-200 does not read, even with a well-formed body', !readPair(429, '{"current":{"time":"t","precipitation":0.3,"rain":0.3}}').ok)
  check('R3 a 200 without the numbers does not read', !readPair(200, '{"current":{"time":"t"}}').ok)
  check('R4 a body that is not JSON does not read', !readPair(200, '<html>').ok)

  const a = attribute({ precipitation: 0.3, rain: 0.6 }, [
    { model: 'ecmwf_ifs025', ok: true, precipitation: 0.3, rain: 0 },
    { model: 'icon_seamless', ok: true, precipitation: 0.6, rain: 0.6 },
    { model: 'gfs_seamless', ok: false },
  ])
  check('A1 precipitation and rain are matched to different models when they come from different models',
    JSON.stringify(a) === '{"precipitationFrom":["ecmwf_ifs025"],"rainFrom":["icon_seamless"]}')

  const grounds = ['A', 'B']
  const S = (round, ground, precipitation, rain, ok = true) => ({ round, ground, ok, precipitation, rain, violation: ok && isViolation(precipitation, rain) })
  const wet = summarize({ samples: [S(0, 'A', 0.3, 0.3), S(0, 'B', 0, 0), S(1, 'A', 0.3, 0.6), S(1, 'B', 0, 0), S(2, 'A', 0.3, 0.3), S(2, 'B', 0, 0, false)], grounds, rounds: 3 })
  check('S1 a violation makes refusal-observed', wet.verdict === 'refusal-observed')
  check('S2 coverage counts only read responses against grounds x rounds', wet.checked === 5 && wet.expected === 6)
  check('S3 a ground that went bad and came back has two flips', wet.byGround.A.flips === 2 && wet.byGround.A.violations === 1)
  check('S4 an unread sample is not a flip', wet.byGround.B.flips === 0 && wet.byGround.B.read === 2)

  const quietWet = summarize({ samples: [S(0, 'A', 0.3, 0.3), S(0, 'B', 0, 0)], grounds, rounds: 1 })
  check('S5 wet at the start and no violation is none-observed-while-wet', quietWet.verdict === 'none-observed-while-wet')
  const dry = summarize({ samples: [S(0, 'A', 0, 0), S(0, 'B', 0, 0), S(1, 'A', 0.2, 0.2)], grounds, rounds: 2 })
  check('S6 dry at the start and no violation is not-observable-dry, even if it rained later', dry.verdict === 'not-observable-dry' && dry.wetSamples === 1)
  check('S7 dry with a violation is still refusal-observed (0.1 over 0 happened on a dry reading)',
    summarize({ samples: [S(0, 'A', 0, 0), S(1, 'A', 0, 0.1)], grounds: ['A'], rounds: 2 }).verdict === 'refusal-observed')

  const reset = Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }) })
  check('E1 a fetch failure keeps its cause code, not only "fetch failed"', errorOf(reset).cause === 'ECONNRESET' && causeKey(errorOf(reset)) === 'ECONNRESET')
  const agg = Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new AggregateError([Object.assign(new Error('a'), { code: 'ETIMEDOUT' }), Object.assign(new Error('b'), { code: 'ENETUNREACH' })], 'x'), { code: 'ETIMEDOUT' }) })
  check('E2 one code per address tried is kept and counted as one label', JSON.stringify(errorOf(agg).causeCodes) === '["ETIMEDOUT","ENETUNREACH"]' && causeKey(errorOf(agg)) === 'ETIMEDOUT[ENETUNREACH,ETIMEDOUT]')
  // The shape Node 22.22's fetch really throws for a blocked port, measured here: a cause with a message and no code.
  check('E6 a cause with no code is labelled by its message, not by a bare "Error"',
    causeKey(errorOf(Object.assign(new TypeError('fetch failed'), { cause: new Error('bad port') }))) === 'cause: bad port')
  const timeout = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })
  check('E3 a timeout with no cause is labelled by its name', causeKey(errorOf(timeout)) === 'TimeoutError')
  const failed = summarize({ samples: [S(0, 'A', 0, 0), { round: 0, ground: 'B', ok: false, violation: false, failure: 'ECONNRESET' }, { round: 1, ground: 'B', ok: false, violation: false, failure: 'ECONNRESET' }, { round: 1, ground: 'A', ok: false, violation: false, failure: 'TimeoutError' }], grounds, rounds: 2 })
  check('E4 unanswered requests are counted by cause', failed.unanswered === 3 && failed.byCause.ECONNRESET === 2 && failed.byCause.TimeoutError === 1)
  check('E5 a non-200 that answered is not an unanswered request', summarize({ samples: [{ round: 0, ground: 'A', ok: false, status: 429, violation: false }], grounds: ['A'], rounds: 1 }).unanswered === 0)
  check('O5 the causes are printed, most frequent first',
    /^requests with no answer: 3, by cause: ECONNRESET 2, TimeoutError 1$/m.test(render({ date: 'd', summary: failed, startedAt: 's', finishedAt: 'f', rounds: 2, everyS: 60 })))

  const txt = render({ date: '2026-11-14', summary: wet, startedAt: 's', finishedAt: 'f', rounds: 3, everyS: 60 })
  check('O1 the first line is the coverage (Rule 91)', txt.split('\n')[0] === 'checked 5 of 6 expected samples')
  check('O2 the verdict is printed on the second line', txt.split('\n')[1] === 'VERDICT: refusal-observed')
  check('O3 the rate is printed as a count over read responses', /per-request rate .*: 1 of 5 read responses \(20\.00%\)/.test(txt))
  check('O4 a violation without a model read says so', /round 1 A .* \| models not asked/.test(txt))

  done()
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--self-test')) selfTest()
  else live().catch(e => { console.log(`FAIL: ${e.stack || e.message}`); process.exit(1) })
}
