// Feature census: which non-diagnostic features on the deployed lab page have content today, and which relay routes behind them answer.
//
// Question (owner, 2026-11-26): what is the optimal combination of non-diagnostic features for one page? The choice needs data, and no one had
// measured which layers are populated. CI-as-proxy: the authoring sandbox cannot reach *.workers.dev.
//
// WHAT IT RECORDS. Facts, not verdicts on the product:
//   page   per tab, after clicking it: panel text length, element count, first 200 characters of text, and any empty-state phrase found.
//   relay  per route: HTTP status, bytes, top-level keys, and the length of every top-level array. The shape is read, not assumed.
// WHAT IT DOES NOT. It does not judge whether a payload is "right", and an empty array is reported as empty: the relay collapses "failed" and
// "quiet" to [] (docs/SECTIONS-PROOF.md), so empty here means "no data served", not "broken".
// COVERAGE (Rule 91). The output prints `checked N of M tabs` and `checked N of M routes`, where M is what the page and this list declare.
//
// Usage:  node scripts/feature-census.mjs --self-test
//         URL=https://field-laboratory.jeffunglesbee.workers.dev node scripts/feature-census.mjs

import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const RELAY = 'https://field-relay-nba.jeffunglesbee.workers.dev'
const DIAGNOSTIC = new Set(['metrics', 'verify'])
const EMPTY_PHRASES = /\b(no data|no games|nothing (to show|today|scheduled)|unavailable|not available|no lineup|no matches|empty|failed|error|refused)\b/i

/** ET calendar day, YYYY-MM-DD. */
export const etDay = (d = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

/** The relay routes behind the page's features. Each path is a route this repo's own source requests (src/Program.fs, src/LineupsView.fs) or
 *  one the relay serves (field-relay-nba src/index.js, probed 2026-11-26); `feature` says what it feeds. */
export const routes = (day) => [
  { feature: 'scoreboard slate', path: `/context/date/${day}` },
  { feature: 'live scores (all sports)', path: `/v2/games?date=${day}` },
  { feature: 'live soccer events', path: '/bsd/events/live' },
  { feature: "field's pick / newspaper", path: `/analytics/newspaper/${day}` },
  { feature: 'standings (EPL)', path: '/espn-standings/soccer/eng.1/standings' },
  { feature: 'tennis draw', path: '/bsd/tennis/draw' },
  { feature: 'world cup standings', path: '/wc/standings' },
]

/** Shape of a JSON value, one level: its keys, and the length of each top-level array. Pure. */
export const shapeOf = (v) => {
  if (Array.isArray(v)) return { type: 'array', length: v.length, keys: [], arrays: {} }
  if (v && typeof v === 'object') {
    const arrays = {}
    const nested = {}
    for (const [k, x] of Object.entries(v)) {
      if (Array.isArray(x)) arrays[k] = x.length
      else if (x && typeof x === 'object') {
        for (const [k2, y] of Object.entries(x)) if (Array.isArray(y)) nested[`${k}.${k2}`] = y.length
      }
    }
    return { type: 'object', length: null, keys: Object.keys(v), arrays, nested }
  }
  return { type: typeof v, length: null, keys: [], arrays: {} }
}

/** Does the payload carry any item at all? Counts top-level and one-level-nested array items. Pure. */
export const itemCount = (shape) =>
  (shape.length ?? 0) +
  Object.values(shape.arrays ?? {}).reduce((a, b) => a + b, 0) +
  Object.values(shape.nested ?? {}).reduce((a, b) => a + b, 0)

/** One tab's record from what the browser read. Pure. */
export const tabRecord = (slug, text, elements) => {
  const t = (text ?? '').replace(/\s+/g, ' ').trim()
  const m = t.match(EMPTY_PHRASES)
  return { slug, textLength: t.length, elements, emptyPhrase: m ? m[0] : null, head: t.slice(0, 200) }
}

const selfTest = () => {
  const bad = []
  const eq = (name, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) bad.push(`${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`) }
  eq('etDay shape', /^\d{4}-\d{2}-\d{2}$/.test(etDay(new Date('2026-11-26T12:00:00Z'))), true)
  eq('etDay value', etDay(new Date('2026-11-26T12:00:00Z')), '2026-11-26')
  eq('etDay before 5 UTC is previous ET day', etDay(new Date('2026-11-26T03:00:00Z')), '2026-11-25')
  eq('shape array', shapeOf([1, 2, 3]).length, 3)
  eq('shape object arrays', shapeOf({ a: [1], b: [], c: 'x' }).arrays, { a: 1, b: 0 })
  eq('shape nested', shapeOf({ games: { regular: [1, 2], postseason: [] } }).nested, { 'games.regular': 2, 'games.postseason': 0 })
  eq('itemCount all empty', itemCount(shapeOf({ a: [], games: { regular: [] } })), 0)
  eq('itemCount nested counts', itemCount(shapeOf({ a: [], games: { regular: [1, 2] } })), 2)
  eq('empty phrase found', tabRecord('x', 'No data for this day', 3).emptyPhrase, 'No data')
  eq('empty phrase absent', tabRecord('x', 'Arsenal v Chelsea 2-1', 3).emptyPhrase, null)
  // Rule 90: a deliberately wrong expectation MUST be rejected, or this self-test cannot fail.
  const wrong = []
  const before = bad.length
  eq('MUST-FAIL deliberately wrong', itemCount(shapeOf({ a: [1, 2] })), 99)
  const rejected = bad.length === before + 1
  if (rejected) bad.pop(); else wrong.push('the deliberately wrong expectation was accepted')
  if (bad.length || wrong.length) { console.error([...bad, ...wrong].join('\n')); process.exit(1) }
  console.log('feature-census self-test: ok (the deliberately wrong expectation was rejected)')
}

const fetchRoute = async (r) => {
  const t0 = Date.now()
  try {
    const res = await fetch(RELAY + r.path, { signal: AbortSignal.timeout(25000) })
    const body = await res.text()
    let shape = null
    try { shape = shapeOf(JSON.parse(body)) } catch { /* not JSON: shape stays null and is reported as such */ }
    return { ...r, status: res.status, bytes: body.length, ms: Date.now() - t0, shape, items: shape ? itemCount(shape) : null,
      source: res.headers.get('x-field-source') ?? null }
  } catch (e) {
    return { ...r, status: null, bytes: 0, ms: Date.now() - t0, shape: null, items: null, error: String(e && e.message || e) }
  }
}

const main = async () => {
  const URL = process.env.URL
  if (!URL) { console.error('URL is required'); process.exit(2) }
  const day = etDay()
  const { chromium } = await import('playwright')
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } })
  const consoleErrors = []
  page.on('pageerror', e => consoleErrors.push(String(e)))
  await page.goto(URL + '/', { waitUntil: 'load', timeout: 60000 })
  await page.waitForSelector('[role=tab]', { timeout: 30000 })
  const slugs = await page.$$eval('[role=tab]', els => els.map(e => e.id.replace(/^tab-/, '')))
  const tabs = []
  const features = slugs.filter(s => !DIAGNOSTIC.has(s))
  for (const slug of features) {
    await page.click(`#tab-${slug}`)
    await page.waitForTimeout(6000)
    const read = await page.$eval(`#panel-${slug}`, el => ({ text: el.innerText, elements: el.querySelectorAll('*').length }))
    tabs.push(tabRecord(slug, read.text, read.elements))
  }
  await page.screenshot({ path: 'outbox/feature-census-latest.png' })
  await browser.close()

  const routeList = routes(day)
  const relay = []
  for (const r of routeList) relay.push(await fetchRoute(r))

  const manifest = {
    generated_at: new Date().toISOString(), page: URL, et_day: day,
    coverage: { tabs_declared: slugs.length, tabs_checked: tabs.length, tabs_excluded_diagnostic: slugs.filter(s => DIAGNOSTIC.has(s)),
      routes_checked: relay.length, routes_known_to_relay: 108 },
    pageErrors: consoleErrors, tabs, relay,
  }
  mkdirSync('outbox', { recursive: true })
  writeFileSync('outbox/feature-census-latest.json', JSON.stringify(manifest, null, 2) + '\n')

  const lines = [`checked ${tabs.length} of ${slugs.length} tabs (${manifest.coverage.tabs_excluded_diagnostic.join(', ')} excluded as diagnostic)`,
    `checked ${relay.length} of 108 relay routes (the routes behind the page's features, not the whole relay)`, '']
  for (const t of tabs) lines.push(`tab ${t.slug.padEnd(12)} text=${String(t.textLength).padStart(5)} els=${String(t.elements).padStart(5)} emptyPhrase=${t.emptyPhrase ?? '-'}`)
  lines.push('')
  for (const r of relay) lines.push(`route ${r.path.padEnd(48)} status=${r.status} bytes=${r.bytes} items=${r.items} (${r.feature})`)
  console.log(lines.join('\n'))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--self-test')) selfTest()
  else main().catch(e => { console.error(e); process.exit(1) })
}
