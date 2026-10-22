// Source coordinates for venues from public geocoders, and decide when to trust them.
//
// docs/CC-CMD-2026-10-20-outdoor-venue-sourcing.md, Task 1: "coordinates from a
// source, never from memory". A point nobody can check is worse than no point:
// field-playground's probe says so in its header, "a plausible-but-wrong point
// ... renders a perfectly believable temperature for the wrong city".
//
// THE RULE, AND WHY IT IS NOT "TWO SOURCES AGREE"
//
// Nominatim and Photon both read OpenStreetMap, so their agreeing with each other
// is one witness heard twice. A point is ACCEPTED only when two INDEPENDENT
// families agree within the probe's own threshold (0.02 degrees on each axis):
// Wikidata, and OpenStreetMap (either of its two front ends). Everything else is
// 'review' with every candidate listed, or 'none'. The rule is not trusted on
// argument: `--calibrate` runs it over the venues whose coordinates are already
// hand-reviewed in src/Venues.fs and prints how many it accepted, how many of
// those were right, and how many were wrong. Wrong-accepted must be zero.
//
// Usage:  node scripts/venue-source.mjs --self-test          (no network)
//         node scripts/venue-source.mjs --calibrate          (runner: ~450 requests)
//         node scripts/venue-source.mjs --source LIST.json   (runner)
//
// NOT in the confidence gate, by the same rule as check:live and the other
// scripts that reach the network. Runs from .github/workflows/venue-source.yml.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { createChecks, finish, isMain } from './checks.mjs'

export const EPS = 0.02
const FAMILY = { wikidata: 'wikidata', nominatim: 'osm', photon: 'osm' }

/** Great-circle-ish distance in km, good to a few percent at venue scale. */
export const km = (a, b) => {
  const dlat = (a.lat - b.lat) * 111.195
  const dlon = (a.lon - b.lon) * 111.195 * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180)
  return Math.sqrt(dlat * dlat + dlon * dlon)
}

export const near = (a, b, eps = EPS) =>
  Math.abs(a.lat - b.lat) <= eps + 1e-12 && Math.abs(a.lon - b.lon) <= eps + 1e-12

const round4 = x => Math.round(x * 1e4) / 1e4

// --- the arbiter for a disagreement between the rule and the table -----------------------------
//
// The first calibration run showed the table is not uniformly hand-reviewed truth: some rows were
// "transcribed from public stadium facts" and the golf rows were copied from playground's
// VENUE_COORDS with no review note. So when the rule's point and the table's point disagree,
// neither is assumed right. OpenStreetMap holds the EXTENT of a named course or ground (a
// bounding box), which is a different question from the point a geocoder returns: a point is
// either inside the extent of the place it names, or it is somewhere else.
export const MARGIN = 0.003   // about 300 m of slack around the extent

export const inside = (b, p, m = MARGIN) =>
  p.lat >= b.minlat - m && p.lat <= b.maxlat + m && p.lon >= b.minlon - m && p.lon <= b.maxlon + m

const nearestOn = (b, p) => ({ lat: Math.min(Math.max(p.lat, b.minlat), b.maxlat), lon: Math.min(Math.max(p.lon, b.minlon), b.maxlon) })

/** bounds: { minlat, minlon, maxlat, maxlon } of the named place, or null. */
export const adjudicate = (bounds, table, chosen) => {
  if (!bounds) return { verdict: 'no-extent' }
  const t = inside(bounds, table), c = inside(bounds, chosen)
  const verdict = t && c ? 'both-inside' : !t && c ? 'table-outside' : t && !c ? 'chosen-outside' : 'neither-inside'
  return {
    verdict,
    extentKm: Math.round(km({ lat: bounds.minlat, lon: bounds.minlon }, { lat: bounds.maxlat, lon: bounds.maxlon }) * 10) / 10,
    tableKmFromExtent: t ? 0 : Math.round(km(table, nearestOn(bounds, table)) * 10) / 10,
    chosenKmFromExtent: c ? 0 : Math.round(km(chosen, nearestOn(bounds, chosen)) * 10) / 10,
  }
}

/**
 * points: [{ source: 'wikidata'|'nominatim'|'photon', lat, lon }], any may be absent.
 * Accepted only when a point from one family sits within EPS of a point from the
 * OTHER family. The accepted coordinate is the mean of the agreeing points.
 */
export const decide = (points, eps = EPS) => {
  const have = points.filter(p => p && Number.isFinite(p.lat) && Number.isFinite(p.lon))
  if (have.length === 0) return { decision: 'none', agreeing: [], dissent: [] }
  const pairs = []
  for (const a of have) for (const b of have)
    if (a.source < b.source && FAMILY[a.source] !== FAMILY[b.source] && near(a, b, eps)) pairs.push([a, b])
  if (pairs.length === 0) {
    const osmOnly = have.filter(p => FAMILY[p.source] === 'osm')
    const osmAgree = osmOnly.length === 2 && near(osmOnly[0], osmOnly[1], eps)
    return { decision: 'review', agreeing: [], dissent: have.map(p => p.source), osmOnlyAgree: osmAgree }
  }
  const members = new Set(pairs.flat())
  const agree = [...members]
  return {
    decision: 'accepted',
    agreeing: agree.map(p => p.source).sort(),
    dissent: have.filter(p => !members.has(p)).map(p => p.source),
    lat: round4(agree.reduce((s, p) => s + p.lat, 0) / agree.length),
    lon: round4(agree.reduce((s, p) => s + p.lon, 0) / agree.length),
  }
}

// --- the venue table, read from the source so the calibration cannot drift ---

export const readTable = (text = readFileSync('src/Venues.fs', 'utf8')) =>
  [...text.matchAll(/^\s*at "([^"]+)"\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(\w+)\s+"([^"]+)"/gm)]
    .map(m => ({ name: m[1], lat: Number(m[2]), lon: Number(m[3]), roof: m[4], zone: m[5] }))

// --- the three sources ------------------------------------------------------

const UA = 'field-laboratory-venue-source/1.0 (github.com/jeffunglesbee-create/field-laboratory; venue coordinates for weather)'
const CACHE_PATH = 'outbox/venue-source-cache.json'
const TTL_MS = 30 * 24 * 60 * 60 * 1000
const STADIUM_QIDS = 'wd:Q483110 wd:Q1076486'
const OSM_KEYS = new Set(['leisure', 'building', 'amenity', 'tourism', 'sport', 'man_made'])

const sleep = ms => new Promise(r => setTimeout(r, ms))

const loadCache = () => (existsSync(CACHE_PATH) ? JSON.parse(readFileSync(CACHE_PATH, 'utf8')) : {})
const saveCache = c => { mkdirSync('outbox', { recursive: true }); writeFileSync(CACHE_PATH, JSON.stringify(c, null, 1) + '\n') }

/**
 * GET json. A 429 is the service asking us to slow down: honour its Retry-After, else back off
 * 8, 16, 32 s, and try again up to four times. The first calibration run lost 15 of 109 venues
 * to Wikidata 429s at a 300 ms gap and one retry after 6 s, which is this script's own pacing
 * bug and not a property of the rule. Other 5xx and network failures get two tries.
 * Returns { ok, value } or { ok:false, why }.
 */
const getJson = async (url, headers = {}) => {
  let why = null
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers }, signal: AbortSignal.timeout(25000) })
      if (res.status === 429) {
        why = 'HTTP 429'
        const ra = Number(res.headers.get('retry-after'))
        await sleep((Number.isFinite(ra) && ra > 0 ? Math.min(ra, 60) : 8 * 2 ** attempt) * 1000)
        continue
      }
      if (res.status >= 500) { why = `HTTP ${res.status}`; if (attempt >= 1) break; await sleep(6000); continue }
      if (!res.ok) return { ok: false, why: `HTTP ${res.status}` }
      return { ok: true, value: await res.json() }
    } catch (e) { why = `request failed — ${e.message}`; if (attempt >= 1) break; await sleep(3000) }
  }
  return { ok: false, why }
}

const cached = async (cache, key, fetcher, gapMs) => {
  const hit = cache[key]
  if (hit && Date.now() - hit.at < TTL_MS) return { ...hit.result, fromCache: true }
  if (gapMs) await sleep(gapMs)
  const result = await fetcher()
  if (result.ok) cache[key] = { at: Date.now(), result }   // an error is never remembered as an answer
  return result
}

const wikidata = async (name, cache) => {
  const q = encodeURIComponent(name)
  const found = await cached(cache, `wd-search|${name}`, () =>
    getJson(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${q}&language=en&type=item&limit=8&format=json`), 1200)
  if (!found.ok) return { ok: false, why: found.why }
  const ids = (found.value.search ?? []).map(s => s.id)
  if (ids.length === 0) return { ok: true, point: null, note: 'no entity' }
  const sparql = `SELECT ?item ?itemLabel ?c WHERE { VALUES ?item { ${ids.map(i => `wd:${i}`).join(' ')} } ?item wdt:P625 ?c . VALUES ?t { ${STADIUM_QIDS} } ?item wdt:P31/wdt:P279* ?t . SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }`
  const rows = await cached(cache, `wd-sparql|${ids.join(',')}`, () =>
    getJson(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`, { Accept: 'application/sparql-results+json' }), 1500)
  if (!rows.ok) return { ok: false, why: rows.why }
  const byId = new Map()
  for (const b of rows.value.results.bindings) {
    const id = b.item.value.split('/').pop()
    const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(b.c.value)
    if (m && !byId.has(id)) byId.set(id, { lat: Number(m[2]), lon: Number(m[1]), label: b.itemLabel?.value, qid: id })
  }
  const first = ids.find(i => byId.has(i))
  return first ? { ok: true, point: { source: 'wikidata', ...byId.get(first) } } : { ok: true, point: null, note: 'no venue entity with coordinates' }
}

const nominatim = async (name, cache) => {
  const r = await cached(cache, `nominatim|${name}`, () =>
    getJson(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(name)}&format=jsonv2&limit=3`), 1100)
  if (!r.ok) return { ok: false, why: r.why }
  const hit = r.value.find(x => OSM_KEYS.has(x.category ?? x.class))
  return hit ? { ok: true, point: { source: 'nominatim', lat: Number(hit.lat), lon: Number(hit.lon), label: hit.display_name, kind: `${hit.category ?? hit.class}/${hit.type}` } }
             : { ok: true, point: null, note: r.value.length ? 'only non-venue classes' : 'no result' }
}

const photon = async (name, cache) => {
  const r = await cached(cache, `photon|${name}`, () =>
    getJson(`https://photon.komoot.io/api/?q=${encodeURIComponent(name)}&limit=3`), 400)
  if (!r.ok) return { ok: false, why: r.why }
  const hit = (r.value.features ?? []).find(f => OSM_KEYS.has(f.properties?.osm_key))
  return hit ? { ok: true, point: { source: 'photon', lat: hit.geometry.coordinates[1], lon: hit.geometry.coordinates[0], label: hit.properties.name, kind: `${hit.properties.osm_key}/${hit.properties.osm_value}` } }
             : { ok: true, point: null, note: (r.value.features ?? []).length ? 'only non-venue classes' : 'no result' }
}

/** One venue through all three sources. A source that errored is named, never read as "no hit". */
export const lookup = async (name, cache) => {
  const out = {}
  for (const [key, fn] of [['wikidata', wikidata], ['nominatim', nominatim], ['photon', photon]]) out[key] = await fn(name, cache)
  const d = decide(Object.values(out).map(o => o.point))
  return { name, decision: d, sources: out, unanswered: Object.entries(out).filter(([, o]) => !o.ok).map(([k, o]) => `${k}: ${o.why}`) }
}

// --- the self-test: the rule, with no network -------------------------------

const selfTest = () => {
  const { check, summarize } = createChecks()
  const W = (lat, lon) => ({ source: 'wikidata', lat, lon })
  const N = (lat, lon) => ({ source: 'nominatim', lat, lon })
  const P = (lat, lon) => ({ source: 'photon', lat, lon })

  const a = decide([W(42.3467, -71.0972), N(42.3469, -71.0970), null])
  check('wikidata and nominatim agreeing is accepted, at their mean', a.decision === 'accepted' && a.lat === 42.3468 && a.lon === -71.0971,
    JSON.stringify(a))

  const b = decide([null, N(42.3467, -71.0972), P(42.3468, -71.0971)])
  check('nominatim and photon agreeing ALONE is not accepted: one family heard twice', b.decision === 'review' && b.osmOnlyAgree === true,
    JSON.stringify(b))

  const c = decide([W(43.0, -71.0972), N(42.3467, -71.0972), P(42.3468, -71.0971)])
  check('wikidata dissenting from two agreeing OSM points is review, not accepted', c.decision === 'review' && c.osmOnlyAgree === true,
    JSON.stringify(c))

  const d = decide([W(42.3467, -71.0972), N(10, 10), P(42.3468, -71.0971)])
  check('a third point that disagrees is named as dissent, and the agreeing pair still wins',
    d.decision === 'accepted' && d.dissent.join() === 'nominatim' && d.agreeing.join() === 'photon,wikidata', JSON.stringify(d))

  check('one source alone is review', decide([W(1, 1), null, null]).decision === 'review')
  check('no source is none', decide([null, null, null]).decision === 'none')
  check('a source with no usable number is ignored, not read as zero',
    decide([W(NaN, 1), N(0, 0), null]).decision === 'review')

  check('exactly the threshold apart is accepted', decide([W(10, 10), N(10.02, 10)]).decision === 'accepted')
  check('just past the threshold is not', decide([W(10, 10), N(10.0201, 10)]).decision === 'review')
  check('the axes are independent: close in latitude, far in longitude, is not accepted',
    decide([W(10, 10), N(10, 10.5)]).decision === 'review')

  const box = { minlat: 35.10, minlon: -80.85, maxlat: 35.12, maxlon: -80.83 }
  check('both points inside the extent: a size difference, not an error',
    adjudicate(box, { lat: 35.105, lon: -80.84 }, { lat: 35.115, lon: -80.845 }).verdict === 'both-inside')
  const out = adjudicate(box, { lat: 35.0527, lon: -80.8328 }, { lat: 35.1146, lon: -80.8426 })
  check('table outside the extent and the chosen point inside: the table is the one off, by how far',
    out.verdict === 'table-outside' && out.tableKmFromExtent > 5 && out.chosenKmFromExtent === 0, JSON.stringify(out))
  check('chosen outside and the table inside: the sources are the ones off',
    adjudicate(box, { lat: 35.11, lon: -80.84 }, { lat: 36.0, lon: -80.84 }).verdict === 'chosen-outside')
  check('neither inside is unresolved, not a verdict for either',
    adjudicate(box, { lat: 30, lon: -80 }, { lat: 36, lon: -81 }).verdict === 'neither-inside')
  check('no extent found is its own answer', adjudicate(null, { lat: 1, lon: 1 }, { lat: 1, lon: 1 }).verdict === 'no-extent')
  check('the margin lets a point just off the edge count as inside, and no further',
    inside(box, { lat: 35.1230, lon: -80.84 }) === true && inside(box, { lat: 35.1240, lon: -80.84 }) === false)

  const t = readTable('  at "Fenway Park" 42.3467 -71.0972 OpenAir "America/New_York"\n  at "Rogers Centre" 43.6414 -79.3894 Retractable "America/Toronto"\n')
  check('the table reader takes name, coordinates, roof and zone from the source line',
    t.length === 2 && t[1].name === 'Rogers Centre' && t[1].lon === -79.3894 && t[1].roof === 'Retractable' && t[1].zone === 'America/Toronto',
    JSON.stringify(t))
  check('the real table parses to a non-empty list', readTable().length > 0, 'src/Venues.fs parsed to nothing')

  finish(summarize())
}

// --- calibration: the rule against hand-reviewed truth ----------------------

const calibrate = async () => {
  const table = readTable()
  const cache = loadCache()
  const results = []
  for (const v of table) {
    const r = await lookup(v.name, cache)
    const d = r.decision
    // 'accepted-WRONG' was this label before the first run. The run showed the table is NOT
    // uniformly hand-reviewed truth, so disagreement with it is not proof the rule was wrong;
    // it is named for what it is and adjudicated separately (--adjudicate).
    const verdict = d.decision === 'accepted' ? (near(d, v) ? 'accepted-correct' : 'accepted-DISAGREES')
      : d.decision === 'review' ? 'review' : 'none'
    // The two OSM front ends agreed with each other, no Wikidata point backed them,
    // and the point they agreed on is not where the table says the venue is: the
    // case the independence rule exists to refuse, counted so its value is measured.
    const osmOnlyWrong = Boolean(d.osmOnlyAgree) && r.sources.nominatim.point != null && !near(r.sources.nominatim.point, v)
    results.push({ name: v.name, truth: { lat: v.lat, lon: v.lon }, verdict, decision: d,
      kmFromTable: d.decision === 'accepted' ? Math.round(km(d, v) * 10) / 10 : null, unanswered: r.unanswered, osmOnlyWrong,
      sources: Object.fromEntries(Object.entries(r.sources).map(([k, o]) => [k, o.ok ? (o.point ?? o.note) : `ERROR ${o.why}`])) })
    console.log(`  ${verdict.padEnd(17)} ${v.name}${r.unanswered.length ? `   [unanswered: ${r.unanswered.join('; ')}]` : ''}`)
    saveCache(cache)
  }
  const n = table.length
  const count = k => results.filter(r => r.verdict === k).length
  const sum = { checked: n, 'accepted-correct': count('accepted-correct'), 'accepted-DISAGREES': count('accepted-DISAGREES'), review: count('review'), none: count('none'),
    withAnUnansweredSource: results.filter(r => r.unanswered.length).length,
    osmAgreedAloneAndWrong: results.filter(r => r.osmOnlyWrong).length }
  const NOW = new Date()
  writeFileSync('outbox/venue-source-calibration-latest.json', JSON.stringify({ at: NOW.toISOString(), eps: EPS, summary: sum, results }, null, 2) + '\n')
  console.log(`\n  calibration: checked ${sum.checked} of ${n} table venues  ·  accepted ${sum['accepted-correct'] + sum['accepted-WRONG']}  ·  correct ${sum['accepted-correct']}  ·  DISAGREE ${sum['accepted-DISAGREES']}  ·  review ${sum.review}  ·  none ${sum.none}`)
  console.log(`  a source went unanswered on ${sum.withAnUnansweredSource} venue(s); OSM front ends agreed alone and were wrong on ${sum.osmAgreedAloneAndWrong}\n`)
  const { check, summarize } = createChecks()
  check('every table venue was run through the rule', results.length === n && n > 0, `${results.length} of ${n}`)
  check('no accepted point disagrees with the table (a failure here is adjudicated, not assumed to be the rule)', sum['accepted-DISAGREES'] === 0,
    results.filter(r => r.verdict === 'accepted-DISAGREES').map(r => `${r.name} ${r.kmFromTable} km`).join(', '))
  finish(summarize())
}

// --- adjudication, on a runner ---------------------------------------------------------------

const overpassExtent = async (name, cache) => {
  const esc = name.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const query = `[out:json][timeout:25];nwr["name"="${esc}"]["leisure"="golf_course"];out tags bb;`
  const loose = `[out:json][timeout:25];nwr["name"="${esc}"];out tags bb;`
  for (const [kind, q] of [['golf_course', query], ['any named', loose]]) {
    const r = await cached(cache, `overpass|${q}`, () => getJson(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`), 2500)
    if (!r.ok) return { ok: false, why: r.why }
    const els = (r.value.elements ?? []).filter(e => e.bounds)
    if (els.length > 0) {
      const b = { minlat: Math.min(...els.map(e => e.bounds.minlat)), minlon: Math.min(...els.map(e => e.bounds.minlon)),
                  maxlat: Math.max(...els.map(e => e.bounds.maxlat)), maxlon: Math.max(...els.map(e => e.bounds.maxlon)) }
      return { ok: true, bounds: b, kind, elements: els.length }
    }
  }
  return { ok: true, bounds: null, kind: 'none', elements: 0 }
}

const adjudicateRun = async () => {
  const cal = JSON.parse(readFileSync('outbox/venue-source-calibration-latest.json', 'utf8'))
  const disputed = cal.results.filter(r => r.verdict === 'accepted-DISAGREES' || r.verdict === 'accepted-WRONG')
  const cache = loadCache()
  const rows = []
  for (const r of disputed) {
    // The exact OSM name is what Photon returned as `name`; the table's own name is the fallback.
    const osmName = (typeof r.sources.photon === 'object' && r.sources.photon?.label) || r.name
    const ext = await overpassExtent(osmName, cache)
    saveCache(cache)
    const chosen = { lat: r.decision.lat, lon: r.decision.lon }
    const a = ext.ok ? adjudicate(ext.bounds, r.truth, chosen) : { verdict: 'extent-unreadable', why: ext.why }
    rows.push({ name: r.name, osmName, table: r.truth, chosen, kmApart: r.kmFromTable ?? Math.round(km(r.truth, chosen) * 10) / 10, extentKind: ext.kind, ...a })
    console.log(`  ${a.verdict.padEnd(15)} ${r.name.padEnd(32)} table ${a.tableKmFromExtent ?? '?'} km from the extent, chosen ${a.chosenKmFromExtent ?? '?'} km, extent ${a.extentKm ?? '?'} km across (${ext.kind})`)
  }
  const count = v => rows.filter(r => r.verdict === v).length
  const sum = { disputed: rows.length, 'table-outside': count('table-outside'), 'chosen-outside': count('chosen-outside'), 'both-inside': count('both-inside'),
    'neither-inside': count('neither-inside'), 'no-extent': count('no-extent'), 'extent-unreadable': count('extent-unreadable') }
  const NOW = new Date()
  writeFileSync('outbox/venue-source-adjudication-latest.json', JSON.stringify({ at: NOW.toISOString(), margin: MARGIN, summary: sum, rows }, null, 2) + '\n')
  console.log(`\n  adjudicated ${sum.disputed} disagreement(s): table outside ${sum['table-outside']} · chosen outside ${sum['chosen-outside']} · both inside ${sum['both-inside']} · neither ${sum['neither-inside']} · no extent ${sum['no-extent']} · unreadable ${sum['extent-unreadable']}\n`)
  const { check, summarize } = createChecks()
  check('every disagreement was put to the arbiter', rows.length === disputed.length && disputed.length > 0, `${rows.length} of ${disputed.length}`)
  check('the arbiter could read an extent for each one, or says which it could not',
    sum['extent-unreadable'] === 0, rows.filter(r => r.verdict === 'extent-unreadable').map(r => `${r.name}: ${r.why}`).join('; '))
  finish(summarize())
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--self-test')) selfTest()
  else if (process.argv.includes('--calibrate')) await calibrate()
  else if (process.argv.includes('--adjudicate')) await adjudicateRun()
  else { console.error('usage: node scripts/venue-source.mjs --self-test | --calibrate | --adjudicate'); process.exit(2) }
}
