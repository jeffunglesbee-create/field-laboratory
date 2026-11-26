// Task 0 of docs/CC-CMD-2026-11-26-single-page-composition.md, read on a runner (the sandbox cannot reach *.workers.dev).
// Two premises, each with the one command that refutes it:
//   1. "Field's Pick is empty because of the day": read the `pick` value the relay serves for today.
//   2. "The draw is a finished event": read the draw route's own hint and the tournaments route.
// Prints raw values, trimmed. No verdict: the CC-CMD reads the output.
// Usage: node scripts/single-page-probe.mjs --self-test | node scripts/single-page-probe.mjs
import { fileURLToPath } from 'node:url'
import { mkdirSync, writeFileSync } from 'node:fs'

const RELAY = 'https://field-relay-nba.jeffunglesbee.workers.dev'
const etDay = (d = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

/** A value, trimmed to `n` characters of JSON. Pure. */
export const trim = (v, n = 1500) => { const s = JSON.stringify(v); return s === undefined ? 'undefined' : s.length > n ? s.slice(0, n) + `…(+${s.length - n})` : s }

const get = async (path) => {
  try {
    const r = await fetch(RELAY + path, { signal: AbortSignal.timeout(25000) })
    const t = await r.text()
    let j = null; try { j = JSON.parse(t) } catch { /* reported raw */ }
    return { path, status: r.status, json: j, raw: j ? null : t.slice(0, 300) }
  } catch (e) { return { path, status: null, error: String(e && e.message || e) } }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--self-test')) {
    const bad = []
    if (trim({ a: 1 }) !== '{"a":1}') bad.push('trim short')
    if (!trim('x'.repeat(2000)).includes('…(+')) bad.push('trim long')
    if (trim(undefined) !== 'undefined') bad.push('trim undefined')
    if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
    console.log('single-page-probe self-test: ok'); process.exit(0)
  }
  const day = etDay()
  const out = [`et_day ${day}`, '']
  const news = await get(`/analytics/newspaper/${day}`)
  out.push(`GET ${news.path} -> ${news.status}`)
  if (news.json) {
    out.push(`keys: ${Object.keys(news.json).join(',')}`)
    out.push(`pick = ${trim(news.json.pick)}`)
    out.push(`preview = ${trim(news.json.preview, 400)}`)
  } else out.push(`not JSON: ${news.raw ?? news.error}`)
  out.push('')
  const draw = await get('/bsd/tennis/draw')
  out.push(`GET ${draw.path} -> ${draw.status} body=${trim(draw.json ?? draw.raw ?? draw.error, 400)}`)
  const tours = await get('/bsd/tennis/tournaments')
  out.push(`GET ${tours.path} -> ${tours.status}`)
  if (tours.json) {
    const arr = Array.isArray(tours.json) ? tours.json : (tours.json.tournaments ?? tours.json.results ?? null)
    out.push(`top-level keys: ${Array.isArray(tours.json) ? '(array)' : Object.keys(tours.json).join(',')}`)
    out.push(`first 4 items: ${trim(arr ? arr.slice(0, 4) : tours.json, 2500)}`)
  } else out.push(`not JSON: ${tours.raw ?? tours.error}`)
  mkdirSync('outbox', { recursive: true })
  writeFileSync('outbox/single-page-probe-2026-11-26.txt', out.join('\n') + '\n')
  console.log(out.join('\n'))
}
