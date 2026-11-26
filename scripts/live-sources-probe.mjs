// Task 6a of docs/CC-CMD-2026-11-26-single-page-composition.md: what is live right now, from every source the relay serves, side by side.
// Owner requirement 2026-11-26: "we should always know when anything is live". Nothing in the lab reads the tennis live route yet, and the
// shapes of /bsd/tennis/matches/live and /bsd/events/live were never probed. Read on a runner (the sandbox cannot reach *.workers.dev).
//
// WHAT IT RECORDS: for each source, the HTTP status, top-level keys, array lengths and up to two items, trimmed; and for /v2/games, the count of
// games per `state` word for every sport the route itself lists as supported (read from its own 400 answer, not assumed). Facts, no verdict.
// COVERAGE (Rule 91): `checked N of M sports` is printed, M being the route's own list.
// Usage: node scripts/live-sources-probe.mjs --self-test | node scripts/live-sources-probe.mjs
import { fileURLToPath } from 'node:url'
import { mkdirSync, writeFileSync } from 'node:fs'

const RELAY = 'https://field-relay-nba.jeffunglesbee.workers.dev'
const etDay = (d = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

export const trim = (v, n = 900) => { const s = JSON.stringify(v); return s === undefined ? 'undefined' : s.length > n ? s.slice(0, n) + `…(+${s.length - n})` : s }

/** Count of games per state word, from a /v2/games body. Pure. A body without a games array counts as null, never as zero. */
export const stateCounts = (body) => {
  if (!body || !Array.isArray(body.games)) return null
  const out = {}
  for (const g of body.games) { const k = g && typeof g.state === 'string' ? g.state : '(no state)'; out[k] = (out[k] ?? 0) + 1 }
  return out
}

/** One level of shape: keys, array lengths. Pure. */
export const shape = (v) => Array.isArray(v) ? { array: v.length } : (v && typeof v === 'object')
  ? { keys: Object.keys(v), arrays: Object.fromEntries(Object.entries(v).filter(([, x]) => Array.isArray(x)).map(([k, x]) => [k, x.length])) } : { type: typeof v }

const get = async (path) => {
  try {
    const r = await fetch(RELAY + path, { signal: AbortSignal.timeout(25000) })
    const t = await r.text(); let j = null; try { j = JSON.parse(t) } catch { /* raw */ }
    return { path, status: r.status, json: j, raw: j ? null : t.slice(0, 200) }
  } catch (e) { return { path, status: null, error: String(e && e.message || e) } }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--self-test')) {
    const bad = []
    const eq = (n, g, w) => { if (JSON.stringify(g) !== JSON.stringify(w)) bad.push(`${n}: got ${JSON.stringify(g)} want ${JSON.stringify(w)}`) }
    eq('counts', stateCounts({ games: [{ state: 'live' }, { state: 'live' }, { state: 'pre' }, {}] }), { live: 2, pre: 1, '(no state)': 1 })
    eq('no games array is null, not zero', stateCounts({ error: 'x' }), null)
    eq('empty games is an empty count', stateCounts({ games: [] }), {})
    eq('shape object', shape({ a: [1, 2], b: 'x' }), { keys: ['a', 'b'], arrays: { a: 2 } })
    eq('shape array', shape([1]), { array: 1 })
    // Rule 90: a wrong expectation must be refused, or this self-test cannot fail.
    const n0 = bad.length; eq('MUST-FAIL', stateCounts({ games: [{ state: 'live' }] }), { live: 9 })
    if (bad.length === n0 + 1) bad.pop(); else bad.push('the deliberately wrong expectation was accepted')
    if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
    console.log('live-sources-probe self-test: ok (the deliberately wrong expectation was refused)'); process.exit(0)
  }
  const day = etDay(); const out = [`et_day ${day}`, `fetched_at ${new Date().toISOString()}`, '']
  for (const p of ['/bsd/tennis/matches/live', '/bsd/events/live']) {
    const r = await get(p)
    out.push(`GET ${p} -> ${r.status}`)
    if (r.json) {
      out.push(`  shape: ${trim(shape(r.json), 400)}`)
      const arr = Array.isArray(r.json) ? r.json : (r.json.events ?? r.json.matches ?? r.json.results ?? null)
      out.push(`  items: ${arr ? arr.length : '(no events/matches/results array)'}`)
      if (arr && arr.length) out.push(`  first 2: ${trim(arr.slice(0, 2), 1400)}`)
    } else out.push(`  not JSON: ${r.raw ?? r.error}`)
  }
  out.push('')
  const list = await get('/v2/games')
  const supported = list.json && Array.isArray(list.json.supported) ? list.json.supported : []
  out.push(`GET /v2/games (no sport) -> ${list.status}; the route's own supported list: ${supported.length} sports`)
  let checked = 0, withLive = 0
  const rows = []
  for (const sport of supported) {
    const r = await get(`/v2/games?sport=${encodeURIComponent(sport)}&date=${day}`)
    const c = r.json ? stateCounts(r.json) : null
    if (r.status === 200 && c) checked++
    if (c && c.live) withLive++
    rows.push(`  ${String(sport).padEnd(18)} ${r.status} ${c ? JSON.stringify(c) : '(no games array)'}${r.json && r.json.staleSeconds != null ? ` staleSeconds=${r.json.staleSeconds}` : ''}`)
  }
  out.push(`checked ${checked} of ${supported.length} sports (200 with a games array); ${withLive} with at least one game in state "live"`)
  out.push(...rows)
  mkdirSync('outbox', { recursive: true })
  writeFileSync('outbox/live-sources-probe-latest.txt', out.join('\n') + '\n')
  console.log(out.join('\n'))
}
