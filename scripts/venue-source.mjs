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
export const AMBIGUOUS_DEG = 0.5
const FAMILY = { wikidata: 'wikidata', nominatim: 'osm', photon: 'osm' }

export const near = (a, b, eps = EPS) =>
  Math.abs(a.lat - b.lat) <= eps + 1e-12 && Math.abs(a.lon - b.lon) <= eps + 1e-12

const round4 = x => Math.round(x * 1e4) / 1e4

/**
 * points: [{ source: 'wikidata'|'nominatim'|'photon', lat, lon }], any may be absent.
 * Accepted only when a point from one family sits within EPS of a point from the
 * OTHER family. The accepted coordinate is the mean of the agreeing points.
 */
export const decide = (points, eps = EPS) => {
  const have = points.filter(p => p && Number.isFinite(p.lat) && Number.isFinite(p.lon))
  if (have.length === 0) return { decision: 'none', agreeing: [], dissent: [] }
  const amb = have.find(p => p.ambiguous)
  if (amb) return { decision: 'review', agreeing: [], dissent: have.map(p => p.source), ambiguous: amb.ambiguous }
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

// An F# string may carry an escaped quote: `Johnny \"Red\" Floyd Stadium` was
// skipped by a `[^"]+` name, and the calibration checked 409 of 410 rows
// without saying so (run 39821284339).
export const readTable = (text = readFileSync('src/Venues.fs', 'utf8')) =>
  [...text.matchAll(/^\s*at "((?:[^"\\]|\\.)+)"\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(\w+)\s+"([^"]+)"/gm)]
    .map(m => ({ name: m[1].replace(/\\(.)/g, '$1'), lat: Number(m[2]), lon: Number(m[3]), roof: m[4], zone: m[5] }))

/** Rows the table has, counted without parsing them: the reader's denominator. */
export const tableRowCount = (text = readFileSync('src/Venues.fs', 'utf8')) => (text.match(/^\s*at "/gm) ?? []).length

// --- the three sources ------------------------------------------------------

const UA = 'field-laboratory-venue-source/1.0 (github.com/jeffunglesbee-create/field-laboratory; venue coordinates for weather)'
const CACHE_PATH = 'outbox/venue-source-cache.json'
const TTL_MS = 30 * 24 * 60 * 60 * 1000
const STADIUM_QIDS = 'wd:Q483110 wd:Q1076486'
const OSM_KEYS = new Set(['leisure', 'building', 'amenity', 'tourism', 'sport', 'man_made'])

const sleep = ms => new Promise(r => setTimeout(r, ms))

// The key kinds this script still asks for. A kind it no longer asks for is
// dropped on load: the cache is committed, and a retired key is weight with no
// reader (8.2 MB on 2026-10-22, 3.5 MB of it whole article bodies).
const CACHE_KINDS = new Set(['wd-search', 'wd-sparql-standing', 'nominatim', 'photon', 'wd-roof', 'wp-lead', 'wp-bodyroof'])
export const liveEntries = c => Object.fromEntries(Object.entries(c).filter(([k]) => CACHE_KINDS.has(k.split('|')[0])))
const loadCache = () => (existsSync(CACHE_PATH) ? liveEntries(JSON.parse(readFileSync(CACHE_PATH, 'utf8'))) : {})
const saveCache = c => { mkdirSync('outbox', { recursive: true }); writeFileSync(CACHE_PATH, JSON.stringify(c, null, 1) + '\n') }

/** GET json, retrying 429/5xx. Returns { ok, value } or { ok:false, why }.
 *  A 429 waits what the server's Retry-After asks (else 10 s, 20 s, 40 s): run
 *  39831144540 lost 36 Wikipedia answers to 429 with one six-second retry. */
export const retryWait = (retryAfter, attempt) => {
  const s = Number(retryAfter)
  return Number.isFinite(s) && s > 0 ? Math.min(s, 120) * 1000 : 10000 * 2 ** attempt
}
const getJson = async (url, headers = {}) => {
  let why = null
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers }, signal: AbortSignal.timeout(25000) })
      if (res.status === 429 || res.status >= 500) { why = `HTTP ${res.status}`; await sleep(retryWait(res.headers.get('retry-after'), attempt)); continue }
      if (!res.ok) return { ok: false, why: `HTTP ${res.status}` }
      return { ok: true, value: await res.json() }
    } catch (e) { why = `request failed — ${e.message}`; await sleep(3000) }
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
    getJson(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${q}&language=en&type=item&limit=8&format=json`), 300)
  if (!found.ok) return { ok: false, why: found.why }
  const ids = (found.value.search ?? []).map(s => s.id)
  if (ids.length === 0) return { ok: true, point: null, note: 'no entity' }
  // No P576 (dissolved, abolished or demolished): every candidate was played at
  // this season, so it stands. Without this, "Wembley Stadium", "San Mamés" and
  // "Tammelan Stadion" took the demolished predecessor's entity and its article
  // (run 39816569585) — the coordinates agreed only because the new ground was
  // built on or beside the old one.
  const sparql = `SELECT ?item ?itemLabel ?c WHERE { VALUES ?item { ${ids.map(i => `wd:${i}`).join(' ')} } ?item wdt:P625 ?c . VALUES ?t { ${STADIUM_QIDS} } ?item wdt:P31/wdt:P279* ?t . FILTER NOT EXISTS { ?item wdt:P576 ?gone } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }`
  const rows = await cached(cache, `wd-sparql-standing|${ids.join(',')}`, () =>
    getJson(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`, { Accept: 'application/sparql-results+json' }), 300)
  if (!rows.ok) return { ok: false, why: rows.why }
  const byId = new Map()
  for (const b of rows.value.results.bindings) {
    const id = b.item.value.split('/').pop()
    const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(b.c.value)
    if (m && !byId.has(id)) byId.set(id, { lat: Number(m[2]), lon: Number(m[1]), label: b.itemLabel?.value, qid: id })
  }
  const first = ids.find(i => byId.has(i))
  if (!first) return { ok: true, point: null, note: 'no venue entity with coordinates' }
  // AMBIGUITY. Wikidata and OpenStreetMap both rank by prominence, so for a bare
  // name like "Olimpico" both can pick the same famous ground in the wrong city
  // and AGREE: a correlated error the calibration cannot see, because every
  // table name is unambiguous. Two venue entities more than AMBIGUOUS_DEG apart
  // under one search make the name ambiguous, and the decision goes to review.
  const venues = [...byId.values()]
  const spread = Math.max(0, ...venues.flatMap(a => venues.map(b => Math.max(Math.abs(a.lat - b.lat), Math.abs(a.lon - b.lon)))))
  const ambiguous = spread > AMBIGUOUS_DEG ? venues.map(v => `${v.label} (${v.qid})`) : null
  return { ok: true, point: { source: 'wikidata', ...byId.get(first), ambiguous } }
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

  const t = readTable('  at "Fenway Park" 42.3467 -71.0972 OpenAir "America/New_York"\n  at "Rogers Centre" 43.6414 -79.3894 Retractable "America/Toronto"\n')
  check('the table reader takes name, coordinates, roof and zone from the source line',
    t.length === 2 && t[1].name === 'Rogers Centre' && t[1].lon === -79.3894 && t[1].roof === 'Retractable' && t[1].zone === 'America/Toronto',
    JSON.stringify(t))
  check('the real table parses to a non-empty list', readTable().length > 0, 'src/Venues.fs parsed to nothing')
  check('A NAME WITH AN ESCAPED QUOTE IS READ, unescaped',
    readTable('  at "Johnny \\"Red\\" Floyd Stadium" 35.8 -86.4 OpenAir "America/Chicago"\n')[0]?.name === 'Johnny "Red" Floyd Stadium')
  check('the reader reads every row of the real table', readTable().length === tableRowCount(),
    `read ${readTable().length} of ${tableRowCount()} rows`)

  const amb = decide([{ source: 'wikidata', lat: 41.93, lon: 12.45, ambiguous: ['Stadio Olimpico (Q1)', 'Olimpico (Q2)'] }, N(41.93, 12.45)])
  check('AN AMBIGUOUS NAME IS REVIEW even when the two families agree', amb.decision === 'review' && amb.ambiguous.length === 2, JSON.stringify(amb))
  check('roof: a retractable lead wins over the open default', decideRoof(null, 'X is a stadium with a retractable roof.').roof === 'retractable')
  check('A PAST-TENSE LEAD IS A GONE BUILDING (the first Wembley)', pastTense('The first Wembley Stadium, originally known as the Empire Stadium, was a football stadium in Wembley.'))
  check('...but "is ... that was built" is a standing one (Home Deluxe Arena)', !pastTense('Home Deluxe Arena is a multi-use stadium in Paderborn, Germany, that was built between July 2005 and July 2008.'))
  check('roof: "an indoor athletic stadium" is a roof (Fargodome)', classifyRoof('Fargodome is an indoor athletic stadium and convention center.') === 'dome')
  check('roof: Wikidata dome beats a silent lead', decideRoof('dome', 'X is a stadium in Y.').roof === 'dome')
  check('roof: a silent lead is open, and SAID to be inferred', (r => r.roof === 'open' && /inferred/.test(r.basis))(decideRoof(null, 'X is a stadium in Y.', '')))
  check('ROOF: A SILENT LEAD WITH NO BODY IS REVIEW, the roof check never ran', decideRoof(null, 'X is a stadium in Y.', null).roof === null)
  check('a 429 waits what Retry-After asks', retryWait('7', 0) === 7000)
  check('...and backs off when it asks nothing', retryWait(null, 0) === 10000 && retryWait(null, 2) === 40000)
  check('the cache drops a key kind nothing asks for', Object.keys(liveEntries({ 'wp-body|X': 1, 'photon|Y': 2 })).join() === 'photon|Y')
  check('roof: Wikidata and the lead naming different roofs is no roof (review)', decideRoof('dome', 'X has a retractable roof.').roof === null)
  check('roof: no lead and no Wikidata is no roof (review), not open', decideRoof(null, null).roof === null)
  check('roof: A SILENT LEAD WITH A RETRACTABLE ROOF IN THE BODY IS REVIEW, not open (Johan Cruijff Arena)',
    decideRoof(null, 'The Johan Cruyff Arena is the home stadium of Ajax.', 'The stadium has a retractable roof.').roof === null)
  check('roof: ...and a body with no roof words leaves the inference standing',
    decideRoof(null, 'X is a stadium in Y.', 'It holds 30,000 people.').roof === 'open')

  finish(summarize())
}

// --- stage 2: roof and zone for an accepted point -----------------------------

/**
 * playground's lead-sentence classifier (field-playground
 * scripts/probe-wikipedia-roof.mjs), in its order: retractable wins first. A lead
 * that names no roof reads 'open', and the caller marks that as INFERRED: BC
 * Place and Marvel Stadium are retractable and read open that way.
 */
export const classifyRoof = text => {
  const s = (text || '').toLowerCase()
  if (/retractable[- ]roof|roof that retracts/.test(s)) return 'retractable'
  // `\bindoor\b`, not the phrase "indoor stadium": Fargodome's lead reads "an
  // indoor athletic stadium" and the phrase missed it (run 39811977108).
  if (/\bdomed\b|\bdome\b|fixed roof|enclosed stadium|\bindoor\b/.test(s)) return 'dome'
  return 'open'
}

// A roof the LEAD does not state can still exist: Johan Cruijff Arena's lead
// never mentions its retractable roof, and the first --source run (39803427427)
// read it "open, inferred", as playground's classifier read BC Place and Marvel
// Stadium. The article BODY is not trusted to set a roof (it describes proposals
// and other stadiums, playground's reason for reading the lead only), but a body
// that mentions a moving or closable roof is enough to refuse the inference.
export const BODY_ROOF = /retractable[- ]roof|roof (?:that )?(?:can|could) be (?:opened|closed|retracted)|sliding roof|closable roof|moveable roof|movable roof/i

/** A lead whose first verb is "was" describes a building in the past tense. */
export const pastTense = lead => /\b(?:is|are|was|were)\b/.exec(lead ?? '')?.[0] === 'was'

/** Combine Wikidata P5624 and the Wikipedia lead. Disagreement is review, never a pick. */
export const decideRoof = (wikidataRoof, lead, body = null) => {
  const wd = wikidataRoof ? classifyRoof(wikidataRoof) : null
  const ld = lead == null ? null : classifyRoof(lead)
  if (wd && wd !== 'open' && ld && ld !== 'open' && wd !== ld) return { roof: null, basis: `sources disagree: wikidata "${wikidataRoof}", lead ${ld}` }
  if (wd && wd !== 'open') return { roof: wd, basis: `wikidata P5624 "${wikidataRoof}"` }
  if (ld && ld !== 'open') return { roof: ld, basis: 'wikipedia lead' }
  if (ld === 'open' && body == null) return { roof: null, basis: 'the lead names no roof, and the article body did not answer, so the roof check did not run' }
  if (ld === 'open' && body && BODY_ROOF.test(body)) return { roof: null, basis: `the lead names no roof, but the article mentions "${body.match(BODY_ROOF)[0]}"` }
  if (ld === 'open') return { roof: 'open', basis: wd ? `wikidata P5624 "${wikidataRoof}", lead names no roof` : 'inferred: the lead names no roof' }
  return { roof: null, basis: 'no Wikipedia lead and no Wikidata roof' }
}

const roofOf = async (qid, cache) => {
  if (!qid) return decideRoof(null, null)
  const sparql = `SELECT ?roofLabel ?article WHERE { OPTIONAL { wd:${qid} wdt:P5624 ?roof . } OPTIONAL { ?article schema:about wd:${qid} ; schema:isPartOf <https://en.wikipedia.org/> . } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } LIMIT 1`
  const r = await cached(cache, `wd-roof|${qid}`, () =>
    getJson(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`, { Accept: 'application/sparql-results+json' }), 300)
  if (!r.ok) return { roof: null, basis: `wikidata unanswered: ${r.why}` }
  const b = r.value.results.bindings[0] || {}
  let lead = null, body = null, unanswered = null
  const title = b.article?.value?.split('/wiki/')[1]
  if (title) {
    // Only what is used is cached: the lead sentence, and whether the body
    // mentions a moving roof (the matched words, or '' for none).
    const sum = await cached(cache, `wp-lead|${title}`, async () => {
      const r = await getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${title}`)
      return r.ok ? { ok: true, value: (r.value.extract || '').split(/(?<=\.)\s/)[0] } : r
    }, 1000)
    if (sum.ok) lead = sum.value
    const full = await cached(cache, `wp-bodyroof|${title}`, async () => {
      const r = await getJson(`https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&format=json&titles=${title}`)
      if (!r.ok) return r
      const extract = Object.values(r.value.query?.pages ?? {})[0]?.extract
      return extract == null ? { ok: false, why: 'no extract' } : { ok: true, value: extract.match(BODY_ROOF)?.[0] ?? '' }
    }, 1000)
    if (full.ok) body = full.value
    unanswered = !sum.ok ? `the Wikipedia summary did not answer: ${sum.why}` : !full.ok ? `the article body did not answer: ${full.why}` : null
  }
  const d = decideRoof(b.roofLabel?.value ?? null, lead, body)
  // Say WHY there is no roof when a source did not answer: "no Wikipedia lead"
  // hid about 100 unanswered calls in run 39824953597 behind a sentence that
  // reads like an absence.
  return { ...d, basis: d.roof === null && unanswered ? unanswered : d.basis, lead: lead?.slice(0, 200) ?? null }
}

// --- stage 3: the candidates -------------------------------------------------

const source = async path => {
  const raw = JSON.parse(readFileSync(path, 'utf8'))
  const list = Array.isArray(raw) ? raw : raw.candidates
  // The zone is NOT Open-Meteo's: weather-live-check compares the declared zone
  // with Open-Meteo's resolution, and taking it from there would make that check
  // circular. geo-tz reads timezone-boundary-builder's polygons offline; it is
  // installed on the runner only (venue-source.yml), never in package.json.
  //
  // `geo-tz/all`, not the default: the default is the "1970" set, which merges
  // zones that have agreed since 1970, so Oslo came back Europe/Berlin and
  // Amsterdam Europe/Brussels. Open-Meteo answers with the country's own zone,
  // and the flagless weather check (venue-source run 39820492235) failed exactly
  // those 19 rows and no others.
  const { find } = await import('geo-tz/all')
  const cache = loadCache()
  const accepted = [], review = []
  for (const [i, c] of list.entries()) {
    const r = await lookup(c.venue, cache)
    const d = r.decision
    const base = { name: c.venue, sports: c.sports, home: c.home }
    if (d.decision !== 'accepted') {
      review.push({ ...base, why: d.ambiguous ? `ambiguous name: ${d.ambiguous.join('; ')}` : d.decision === 'none' ? 'no source answered with a point' : `no two independent families agree (${d.dissent.join(', ')})`, unanswered: r.unanswered,
        sources: Object.fromEntries(Object.entries(r.sources).map(([k, o]) => [k, o.ok ? (o.point ?? o.note) : `ERROR ${o.why}`])) })
    } else {
      const qid = r.sources.wikidata.point?.qid
      const roof = await roofOf(qid, cache)
      const zone = find(d.lat, d.lon)[0] ?? null
      const row = { ...base, lat: d.lat, lon: d.lon, agreeing: d.agreeing, qid, roof: roof.roof, roofBasis: roof.basis, lead: roof.lead, zone }
      // A name that says dome, read as open, is a contradiction to look at, not a pick.
      const domeName = /dome\b/i.test(c.venue) && roof.roof === 'open'
      // A second witness for the P576 filter: an article written in the past tense
      // is about a building that is gone, whatever Wikidata records.
      const gone = pastTense(roof.lead)
      if (!roof.roof || !zone || domeName || gone) review.push({ ...row, why: !roof.roof ? `roof: ${roof.basis}` : domeName ? 'roof: the name says dome, the sources read open' : gone ? 'the article is in the past tense: a demolished building' : 'no zone at the point' })
      else accepted.push(row)
    }
    if (i % 20 === 0) { saveCache(cache); console.log(`  ${i + 1}/${list.length}: ${accepted.length} accepted, ${review.length} to review`) }
  }
  saveCache(cache)
  writeFileSync('outbox/venue-source-results-latest.json', JSON.stringify({ at: new Date().toISOString(), run: process.env.GITHUB_RUN_ID ?? null, eps: EPS, ambiguousDeg: AMBIGUOUS_DEG, from: path, of: list.length, accepted, review }, null, 1) + '\n')
  console.log(`\n  sourced ${list.length}: ${accepted.length} accepted, ${review.length} to review`)
}

// --- calibration: the rule against hand-reviewed truth ----------------------

const calibrate = async () => {
  const table = readTable()
  console.log(`  calibrating ${table.length} of ${tableRowCount()} table rows`)
  if (table.length !== tableRowCount()) { console.error('  FAIL  the reader missed rows; a calibration of a subset is not reported as one of the table'); process.exit(1) }
  const cache = loadCache()
  const results = []
  for (const v of table) {
    const r = await lookup(v.name, cache)
    const d = r.decision
    const verdict = d.decision === 'accepted' ? (near(d, v) ? 'accepted-correct' : 'accepted-WRONG')
      : d.decision === 'review' ? 'review' : 'none'
    // The two OSM front ends agreed with each other, no Wikidata point backed them,
    // and the point they agreed on is not where the table says the venue is: the
    // case the independence rule exists to refuse, counted so its value is measured.
    const osmOnlyWrong = Boolean(d.osmOnlyAgree) && r.sources.nominatim.point != null && !near(r.sources.nominatim.point, v)
    results.push({ name: v.name, truth: { lat: v.lat, lon: v.lon }, verdict, decision: d, unanswered: r.unanswered, osmOnlyWrong,
      sources: Object.fromEntries(Object.entries(r.sources).map(([k, o]) => [k, o.ok ? (o.point ?? o.note) : `ERROR ${o.why}`])) })
    console.log(`  ${verdict.padEnd(17)} ${v.name}${r.unanswered.length ? `   [unanswered: ${r.unanswered.join('; ')}]` : ''}`)
    saveCache(cache)
  }
  const n = table.length
  const count = k => results.filter(r => r.verdict === k).length
  const sum = { checked: n, 'accepted-correct': count('accepted-correct'), 'accepted-WRONG': count('accepted-WRONG'), review: count('review'), none: count('none'),
    withAnUnansweredSource: results.filter(r => r.unanswered.length).length,
    osmAgreedAloneAndWrong: results.filter(r => r.osmOnlyWrong).length }
  const NOW = new Date()
  writeFileSync('outbox/venue-source-calibration-latest.json', JSON.stringify({ at: NOW.toISOString(), eps: EPS, summary: sum, results }, null, 2) + '\n')
  console.log(`\n  calibration: checked ${sum.checked} of ${n} table venues  ·  accepted ${sum['accepted-correct'] + sum['accepted-WRONG']}  ·  correct ${sum['accepted-correct']}  ·  WRONG ${sum['accepted-WRONG']}  ·  review ${sum.review}  ·  none ${sum.none}`)
  console.log(`  a source went unanswered on ${sum.withAnUnansweredSource} venue(s); OSM front ends agreed alone and were wrong on ${sum.osmAgreedAloneAndWrong}\n`)
  const { check, summarize } = createChecks()
  check('every table venue was run through the rule', results.length === n && n > 0, `${results.length} of ${n}`)
  check('NO accepted point is wrong', sum['accepted-WRONG'] === 0, results.filter(r => r.verdict === 'accepted-WRONG').map(r => r.name).join(', '))
  finish(summarize())
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--self-test')) selfTest()
  else if (process.argv.includes('--calibrate')) await calibrate()
  else if (process.argv.includes('--source')) await source(process.argv[process.argv.indexOf('--source') + 1])
  else { console.error('usage: node scripts/venue-source.mjs --self-test | --calibrate | --source LIST.json'); process.exit(2) }
}
