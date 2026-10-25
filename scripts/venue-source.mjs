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
const FAMILY = { wikidata: 'wikidata', nominatim: 'osm', photon: 'osm',
  // The wider net (below) only ever adds points to a family that already exists.
  'team-venue': 'wikidata', 'wp-article': 'wikidata', 'nominatim-alias': 'osm', 'photon-alias': 'osm', 'osm-reverse': 'osm' }

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
const CACHE_KINDS = new Set(['wd-occupants', 'wd-search', 'wd-sparql-standing', 'nominatim', 'photon', 'wd-roof', 'wp-lead', 'wp-bodyroof', 'wp-team', 'nm-reverse'])
export const liveEntries = c => Object.fromEntries(Object.entries(c).filter(([k]) => CACHE_KINDS.has(k.split('|')[0])))
export const loadCache = () => (existsSync(CACHE_PATH) ? liveEntries(JSON.parse(readFileSync(CACHE_PATH, 'utf8'))) : {})
export const saveCache = c => { mkdirSync('outbox', { recursive: true }); writeFileSync(CACHE_PATH, JSON.stringify(c, null, 1) + '\n') }

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

// --- the home team as a witness to WHICH venue -------------------------------
//
// An ambiguous name ("Celtic Park", three grounds) was refused outright. The
// game that named the venue also names its home team, and Wikidata lists who
// plays at each candidate (P466, and the club's own P115). One candidate listing
// that team is evidence of which ground the name meant. It selects an entity
// WITHIN the Wikidata family; the second family (OpenStreetMap) must still
// agree with the point, so the home team never stands in for corroboration.
//
// Measured against the 109 hand-reviewed table venues before use
// (data/venue-homes-table.json, 155 venue/home pairs, `--calibrate`).
const CLUB_AFFIX = new Set(['fc', 'afc', 'sc', 'ss', 'as', 'ac', 'sk', 'sl', 'cd', 'fk', 'bk', 'if', 'cf', 'sv', 'vfl', 'tsg', 'tsv', 'fsv', 'rc', 'us', 'ssc', 'rfc', '1', '1899', '1903', '1909', '1913', '1860', '1946'])
const nameTokens = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\./g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean)
const sameTokens = (a, b) => a.length === b.length && a.every((x, i) => x === b[i])
const prefixOf = (h, o) => o.length > h.length && h.every((x, i) => o[i] === x)
const suffixOf = (h, o) => o.length > h.length && h.every((x, i) => o[o.length - h.length + i] === x)

/** How a home team name matches a venue's listed occupants: 1 = the same name
 *  once club affixes (FC, AS, S.L.) are dropped from both; 2 = the home name is
 *  the start or end of an occupant's ("Washington" in "Washington Huskies",
 *  "Lions" in "Detroit Lions"), allowed ONLY when the home name carried no club
 *  affix itself, because "Paris FC" without its FC is "Paris", which is also the
 *  start of "Paris Saint-Germain"; 0 = no match. */
export const matchHome = (home, occupants) => {
  const raw = nameTokens(home ?? '')
  // "Michigan St" is Michigan State; an abbreviated last word is the one place
  // a team name abbreviates, and "St" is not read as Saint anywhere else.
  if (raw.at(-1) === 'st') raw[raw.length - 1] = 'state'
  const h = raw.filter(t => !CLUB_AFFIX.has(t))
  if (h.length === 0) return 0
  const occs = occupants.map(o => nameTokens(o).filter(t => !CLUB_AFFIX.has(t)))
  if (occs.some(o => sameTokens(h, o))) return 1
  if (!raw.some(t => CLUB_AFFIX.has(t)) && occs.some(o => prefixOf(h, o) || suffixOf(h, o))) return 2
  return 0
}

const spreadOf = vs => Math.max(0, ...vs.flatMap(a => vs.map(b => Math.max(Math.abs(a.lat - b.lat), Math.abs(a.lon - b.lon)))))

/** Pick the one place a home team plays among candidate venues. The exact
 *  matches decide first; looser ones only when there are none. Several matching
 *  entities are fine when they are one place (Highmark Stadium and its former
 *  name); matching entities in different places pick nothing. */
export const chooseByHome = (home, entities, occupantsByQid) => {
  if (!home) return { chosen: null, why: 'no home team' }
  const tier = e => matchHome(home, occupantsByQid.get(e.qid) ?? [])
  let hit = entities.filter(e => tier(e) === 1), t = 1
  if (hit.length === 0) { hit = entities.filter(e => tier(e) === 2); t = 2 }
  if (hit.length === 0) return { chosen: null, why: 'no candidate lists the home team' }
  if (spreadOf(hit) > AMBIGUOUS_DEG) return { chosen: null, why: `${hit.length} candidates list the home team, in different places`, matched: hit.map(e => e.qid) }
  return { chosen: hit[0], tier: t, matched: hit.map(e => e.qid) }
}

export const wikidata = async (name, cache, { home = null, measure = false } = {}) => {
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
  const venues = ids.filter(i => byId.has(i)).map(i => byId.get(i))
  let ambiguous = spreadOf(venues) > AMBIGUOUS_DEG ? venues.map(v => `${v.label} (${v.qid})`) : null
  let picked = byId.get(first), homeChoice = null
  // The home team is asked when the name is ambiguous, and, when only measuring
  // the matcher against known truth, for every venue that has candidates.
  if (home && (ambiguous || measure)) {
    const occ = await occupantsOf(venues.map(v => v.qid), cache)
    if (!occ.ok) return { ok: false, why: `occupants: ${occ.why}` }
    homeChoice = chooseByHome(home, venues, occ.by)
    if (ambiguous && homeChoice.chosen) { picked = homeChoice.chosen; ambiguous = null }
  }
  return { ok: true, point: { source: 'wikidata', ...picked, ambiguous }, homeChoice, entities: venues, wasAmbiguous: spreadOf(venues) > AMBIGUOUS_DEG }
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
export const lookup = async (name, cache, opts = {}) => {
  const out = {}
  for (const [key, fn] of [['wikidata', wikidata], ['nominatim', nominatim], ['photon', photon]]) out[key] = await fn(name, cache, opts)
  const d = decide(Object.values(out).map(o => o.point))
  return { name, decision: d, sources: out, unanswered: Object.entries(out).filter(([, o]) => !o.ok).map(([k, o]) => `${k}: ${o.why}`) }
}

/** Who plays at each of these Wikidata venues: the clubs it lists as occupant
 *  (P466) and the clubs that list it as their home venue (P115). Both directions,
 *  because editors fill in either. Returns Map qid -> [label]. */
export const occupantsOf = async (qids, cache) => {
  const sparql = `SELECT ?item ?occLabel WHERE { VALUES ?item { ${qids.map(i => `wd:${i}`).join(' ')} } { ?item wdt:P466 ?occ } UNION { ?occ wdt:P115 ?item } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }`
  const r = await cached(cache, `wd-occupants|${[...qids].sort().join(',')}`, () =>
    getJson(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`, { Accept: 'application/sparql-results+json' }), 300)
  if (!r.ok) return { ok: false, why: r.why }
  const by = new Map(qids.map(q => [q, []]))
  for (const b of r.value.results.bindings) {
    const q = b.item.value.split('/').pop(), label = b.occLabel?.value
    if (label && !by.get(q).includes(label)) by.get(q).push(label)
  }
  return { ok: true, by }
}

// --- the wider net, for venues no two sources agreed on ---------------------
//
// Measured first (outbox/venue-third-sources-probe.json, run 40137851977) on the
// 12 college football venues the table lacked on 2026-10-24. GeoNames (Open-Meteo's
// geocoder) returned nothing usable and is not here. What worked was finding the
// venue FROM THE TEAM instead of from its name, and asking OpenStreetMap what
// stands at a point someone else proposed. Both only ever add points to a family
// that already exists, so the acceptance rule is unchanged: one Wikidata-family
// point and one OpenStreetMap-family point within 0.02 degrees.
//
// It is consulted ONLY for a venue that did not already reach a decision, so no
// accepted row can change, and an ambiguous name stays ambiguous.
const GENERIC = new Set(['stadium', 'field', 'park', 'memorial', 'university', 'the', 'at', 'of', 'arena', 'center', 'centre', 'coliseum', 'bowl', 'and', 'college', 'campus', 'complex', 'grounds'])
export const significant = text => nameTokens(text ?? '').filter(t => !GENERIC.has(t))
/** Does a name share a significant word with any of these names? Loose: a guard
 *  on which Wikipedia article was found, never a confirmation of a point. */
export const overlaps = (title, ...names) => {
  const have = new Set(significant(title))
  return names.some(n => significant(n).some(t => have.has(t)))
}
/** Is an OpenStreetMap name nothing but the venue's own words? Strict, because it
 *  confirms a point. The loose test confirmed "American Family Fields of Phoenix"
 *  as American Family Field (calibration run 40138491509): they share two words
 *  and are 1,700 miles apart. Every significant word of the OSM name must belong
 *  to the venue's or its label's, and there must be at least one. */
export const named = (osmName, ...names) => {
  const mine = significant(osmName)
  const theirs = new Set(names.flatMap(n => significant(n)))
  return mine.length > 0 && mine.every(t => theirs.has(t))
}
const expandedHome = home => { const t = nameTokens(home ?? ''); if (t.at(-1) === 'st') t[t.length - 1] = 'state'; return t }
/** A Wikipedia page is the home team's football page only if it is about football
 *  and its title carries the home name ("Texas College" and "Tarleton State Texans
 *  football" both came back for Texas and Texas St in the probe). An all-capitals
 *  abbreviation (FAU, SMU) is not in the title and is let through: the point it
 *  yields still has to agree with OpenStreetMap. */
export const teamTitleOk = (home, title) => {
  const t = nameTokens(title)
  if (!t.includes('football') || t.includes('national')) return false
  if (/^[A-Z]{2,5}$/.test((home ?? '').trim())) return true
  return expandedHome(home).every(x => t.includes(x))
}

/** The team path is for American football only: a World Cup game at an NFL ground
 *  has a national team as "home", and its home ground is somewhere else entirely
 *  (GEHA Field at Arrowhead Stadium came back as Barranquilla). Every sport
 *  listed for the venue must be one. */
export const americanFootballOnly = sports => /^(CFB|NFL)(,(CFB|NFL))*$/.test((sports ?? '').trim())

/** A point reached through the home team is the venue's only if the VENUE'S OWN
 *  NAME also leads there: a source searched by that name, an article found by it,
 *  OpenStreetMap naming it there, or the team's venue being called by the same
 *  words. Without that, the team's home ground can be accepted for any venue the
 *  team is listed against, a neutral site included. */
export const tiedToVenue = (decision, points, venueName) => {
  const at = { lat: decision.lat, lon: decision.lon }
  const NAME_DRIVEN = new Set(['wikidata', 'nominatim', 'photon', 'wp-article', 'osm-reverse'])
  return points.some(p => Number.isFinite(p?.lat) && near(p, at) &&
    (NAME_DRIVEN.has(p.source) || (p.source === 'team-venue' && named(p.label ?? '', venueName))))
}

/** Does what OpenStreetMap names at a point confirm the VENUE stands there? Only
 *  the venue's own name is compared. The proposed point's own label is not an
 *  input and must never be: it let "American Family Fields of Phoenix" confirm
 *  itself, the point it labelled, as American Family Field (calibration run
 *  40138841163). */
export const confirmedBy = (osmName, venueName) => named(osmName, venueName)

const teamVenues = async (home, cache) => {
  const q = `${expandedHome(home).join(' ')} football`
  const found = await cached(cache, `wp-team|${q}`, () =>
    getJson(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=1&format=json`), 300)
  if (!found.ok) return { ok: false, why: found.why }
  const title = found.value.query?.search?.[0]?.title
  if (!title || !teamTitleOk(home, title)) return { ok: true, title: title ?? null, venues: [] }
  const props = await cached(cache, `wp-team|props|${title}`, () =>
    getJson(`https://en.wikipedia.org/w/api.php?action=query&prop=pageprops&ppprop=wikibase_item&titles=${encodeURIComponent(title)}&format=json`), 300)
  if (!props.ok) return { ok: false, why: props.why }
  const qid = Object.values(props.value.query?.pages ?? {})[0]?.pageprops?.wikibase_item
  if (!qid) return { ok: true, title, venues: [] }
  const sparql = `SELECT ?v ?vLabel ?c WHERE { wd:${qid} wdt:P115 ?v . ?v wdt:P625 ?c . FILTER NOT EXISTS { ?v wdt:P576 ?gone } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }`
  const r = await cached(cache, `wp-team|venues|${qid}`, () =>
    getJson(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`, { Accept: 'application/sparql-results+json' }), 300)
  if (!r.ok) return { ok: false, why: r.why }
  const venues = r.value.results.bindings.flatMap(b => {
    const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(b.c.value)
    return m ? [{ qid: b.v.value.split('/').pop(), label: b.vLabel?.value, lat: Number(m[2]), lon: Number(m[1]) }] : []
  })
  return { ok: true, title, venues }
}

/** The Wikidata item behind Wikipedia's article for the venue's own name, when it
 *  is a standing stadium with coordinates. Catches names Wikidata's label search
 *  misses (a sponsor name, an en dash where the archive has a hyphen). */
const articlePoint = async (name, cache) => {
  const found = await cached(cache, `wp-team|article|${name}`, () =>
    getJson(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(name)}&srlimit=1&format=json`), 300)
  if (!found.ok) return { ok: false, why: found.why }
  const title = found.value.query?.search?.[0]?.title
  if (!title || !overlaps(title, name)) return { ok: true, point: null }
  const props = await cached(cache, `wp-team|props|${title}`, () =>
    getJson(`https://en.wikipedia.org/w/api.php?action=query&prop=pageprops&ppprop=wikibase_item&titles=${encodeURIComponent(title)}&format=json`), 300)
  if (!props.ok) return { ok: false, why: props.why }
  const qid = Object.values(props.value.query?.pages ?? {})[0]?.pageprops?.wikibase_item
  if (!qid) return { ok: true, point: null }
  const sparql = `SELECT ?itemLabel ?c WHERE { VALUES ?item { wd:${qid} } ?item wdt:P625 ?c . VALUES ?t { ${STADIUM_QIDS} } ?item wdt:P31/wdt:P279* ?t . FILTER NOT EXISTS { ?item wdt:P576 ?gone } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }`
  const r = await cached(cache, `wp-team|article-venue|${qid}`, () =>
    getJson(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`, { Accept: 'application/sparql-results+json' }), 300)
  if (!r.ok) return { ok: false, why: r.why }
  const b = r.value.results.bindings[0]
  const m = b && /Point\(([-\d.]+) ([-\d.]+)\)/.exec(b.c.value)
  return { ok: true, point: m ? { qid, label: b.itemLabel?.value, lat: Number(m[2]), lon: Number(m[1]) } : null }
}

/** OpenStreetMap's own answer to "what is at this point". */
const reverse = async (lat, lon, cache) => {
  const r = await cached(cache, `nm-reverse|${lat.toFixed(4)},${lon.toFixed(4)}`, () =>
    getJson(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18`), 1100)
  if (!r.ok) return { ok: false, why: r.why }
  return { ok: true, name: r.value.name ?? null }
}

/** `lookup`, and for a venue it left undecided, the wider net. The extra points
 *  go through the same `decide`. Returns the accepted point's Wikidata item as
 *  `qid` when an extra point supplied it (the roof is read from that item). */
export const lookupPlus = async (name, cache, { home = null, sports = '' } = {}) => {
  const base = await lookup(name, cache, { home })
  if (base.decision.decision === 'accepted' || base.decision.ambiguous) return base
  // A name that was ambiguous stays with the home-team rule. The wider net's
  // article search and OpenStreetMap both rank by prominence and agree on the
  // famous ground: St James Park (Exeter) was accepted at Newcastle's.
  if (base.sources.wikidata.wasAmbiguous) return base
  const extras = []
  if (home && americanFootballOnly(sports)) {
    const tv = await teamVenues(home, cache)
    if (!tv.ok) base.unanswered.push(`team-venue: ${tv.why}`)
    for (const v of tv.venues ?? []) extras.push({ source: 'team-venue', ...v })
  }
  const ap = await articlePoint(name, cache)
  if (!ap.ok) base.unanswered.push(`wp-article: ${ap.why}`)
  if (ap.point) extras.push({ source: 'wp-article', ...ap.point })
  const wd = base.sources.wikidata.point
  const wdFamily = [...extras, ...(wd && Number.isFinite(wd.lat) ? [wd] : [])]
  if (wdFamily.length === 0) return base
  const more = []
  // The venue under the name the team's own page gives it, in OpenStreetMap.
  // Only the home team's own venue supplies a label: it is tied to this game. An
  // article found by the venue's name could be a different place that shares it.
  for (const label of new Set(extras.filter(e => e.source === 'team-venue').map(e => e.label).filter(l => l && nameTokens(l).join(' ') !== nameTokens(name).join(' ')))) {
    const n = await nominatim(label, cache), p = await photon(label, cache)
    if (n.point) more.push({ ...n.point, source: 'nominatim-alias' })
    if (p.point) more.push({ ...p.point, source: 'photon-alias' })
  }
  // And what OpenStreetMap says stands where Wikidata-family points are.
  for (const w of wdFamily) {
    const r = await reverse(w.lat, w.lon, cache)
    if (r.ok && r.name && confirmedBy(r.name, name)) more.push({ source: 'osm-reverse', lat: w.lat, lon: w.lon, label: r.name })
  }
  const all = [...Object.values(base.sources).map(o => o.point), ...extras, ...more]
  const d = decide(all)
  if (d.decision === 'accepted' && !tiedToVenue(d, all, name)) return { ...base, untied: { lat: d.lat, lon: d.lon, agreeing: d.agreeing } }
  const qid = d.decision === 'accepted'
    ? extras.find(e => e.qid && near(e, { lat: d.lat, lon: d.lon }))?.qid
    : undefined
  return { ...base, decision: d, qid, extra: { extras, more } }
}

/** --occupants RESULTS.json: for each ambiguous review row, what Wikidata says
 *  plays at each of its candidate venues. Writes the measurement; decides nothing. */
const occupants = async path => {
  const res = JSON.parse(readFileSync(path, 'utf8'))
  const cache = loadCache()
  const rows = []
  for (const v of res.review.filter(x => /^ambiguous name/.test(x.why))) {
    const qids = [...new Set([...v.why.matchAll(/\((Q\d+)\)/g)].map(m => m[1]))]
    const o = await occupantsOf(qids, cache)
    rows.push({ name: v.name, home: v.home, qids, ...(o.ok ? { entities: qids.map(q => ({ qid: q, occupants: o.by.get(q) })) } : { error: o.why }) })
    saveCache(cache)
  }
  mkdirSync('outbox', { recursive: true })
  writeFileSync('outbox/venue-occupants-probe.json', JSON.stringify({ at: new Date().toISOString(), run: process.env.GITHUB_RUN_ID ?? null, from: path, of: rows.length, rows }, null, 1) + '\n')
  console.log(`checked ${rows.length} of ${res.review.filter(x => /^ambiguous name/.test(x.why)).length} ambiguous venues; ${rows.filter(r => r.error).length} errored; ` +
    `${rows.filter(r => r.entities?.some(e => e.occupants.length)).length} have at least one entity with a listed occupant`)
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
  const E = (qid, lat, lon) => ({ qid, label: qid, lat, lon })
  const O = o => new Map(Object.entries(o))
  const celtic = chooseByHome('Celtic', [E('A', 54.2, -8.5), E('B', 54.9, -7.3), E('C', 55.85, -4.2)],
    O({ A: ['Castlebar Celtic F.C.'], B: ['Derry GAA', 'Derry Celtic F.C.'], C: ['Celtic F.C.', '2019 Pro14 Grand Final'] }))
  check('THE EXACT NAME BEATS A NAME THAT ONLY CONTAINS IT (Celtic, not Castlebar Celtic)', celtic.chosen?.qid === 'C' && celtic.tier === 1, JSON.stringify(celtic))
  check('club affixes are dropped from both sides (Juventus / Juventus FC)', matchHome('Juventus', ['Juventus FC']) === 1)
  check('a nickname matches the end of the full name (Lions / Detroit Lions)', matchHome('Lions', ['Detroit Lions']) === 2)
  check('a school matches the start (Washington / Washington Huskies), St reads as State', matchHome('Washington', ['Washington Huskies']) === 2 && matchHome('Michigan St', ['Michigan State Spartans']) === 2)
  check('A HOME NAME WITH ITS OWN CLUB AFFIX IS NOT LOOSENED (Paris FC is not Paris Saint-Germain)', matchHome('Paris FC', ['Paris Saint-Germain Féminine']) === 0 && matchHome('Paris FC', ['Paris FC']) === 1)
  check('another state is not this one (Sacramento St / Alabama State)', matchHome('Sacramento St', ['Alabama State Hornets']) === 0)
  check('no home team picks nothing', chooseByHome(null, [E('A', 1, 1)], O({ A: ['X'] })).chosen === null && chooseByHome('', [E('A', 1, 1)], O({ A: ['X'] })).chosen === null)
  check('a team no candidate lists picks nothing', chooseByHome('Oklahoma', [E('A', 1, 1), E('B', 40, 40)], O({ A: ['Kansas City Chiefs'], B: [] })).chosen === null)
  check('SAME TEAM LISTED AT TWO FAR-APART CANDIDATES PICKS NOTHING', chooseByHome('Rovers', [E('A', 51, 0), E('B', 55, 5)], O({ A: ['Bristol Rovers'], B: ['Doncaster Rovers'] })).chosen === null)
  check('...but two entries for one place pick it (Highmark Stadium and its former name)', chooseByHome('Bills', [E('A', 42.77, -78.79), E('B', 42.77, -78.79), E('P', 40.4, -80)], O({ A: ['Buffalo Bills'], B: ['Buffalo Bills'], P: ['Pittsburgh Riverhounds SC'] })).chosen?.qid === 'A')
  // The wider net. Each case below is a row of the 2026-10-24 probe.
  check('THE TEAM PAGE MUST BE A FOOTBALL PAGE (Texas gave "Texas College")', !teamTitleOk('Texas', 'Texas College') && teamTitleOk('Texas', 'Texas Longhorns football'))
  check('...and carry the home name (Texas St gave Tarleton State; St reads as State)', !teamTitleOk('Texas St', 'Tarleton State Texans football') && teamTitleOk('Texas St', 'Texas State Bobcats football'))
  check('...an all-capitals abbreviation is not in the title and is let through', teamTitleOk('FAU', 'Florida Atlantic Owls football') && teamTitleOk('Clemson', '2018 Clemson Tigers football team'))
  check('...but two words of the home name must both be there (Miami OH is not Miami RedHawks)', !teamTitleOk('Miami OH', 'Miami RedHawks football'))
  check('an OpenStreetMap name confirms a venue when it is only the venue\'s own words (Zoeller Field / Zoeller Field at Dix Stadium)', named('Zoeller Field', 'Zoeller Field at Dix Stadium'))
  check('A POINT\'S OWN LABEL NEVER CONFIRMS IT (the Phoenix complex confirmed itself)', !confirmedBy('American Family Fields of Phoenix', 'American Family Field', 'American Family Fields of Phoenix') && confirmedBy('Zoeller Field', 'Zoeller Field at Dix Stadium'))
  check('SHARING SOME WORDS IS NOT CONFIRMING (American Family Fields of Phoenix is not American Family Field)', !named('American Family Fields of Phoenix', 'American Family Field') && overlaps('American Family Fields of Phoenix', 'American Family Field'))
  check('...and a generic name alone confirms nothing', !named('Memorial Stadium', 'Memorial Stadium (Clemson, SC)'))
  check('...and "Field", "Stadium", "University" alone confirm nothing (Chris Smith Field is not Kenan)', !named('Chris Smith Field', 'Kenan Stadium') && !overlaps('Chris Smith Field', 'Zoeller Field at Dix Stadium') && !named('Florida Atlantic University - Boca Raton Campus', 'Flagler Credit Union Stadium'))
  check('THE TEAM PATH IS FOR AMERICAN FOOTBALL ONLY (a World Cup game at Arrowhead has Colombia as home)', americanFootballOnly('CFB') && americanFootballOnly('CFB,NFL') && !americanFootballOnly('FIFA World Cup,NFL') && !americanFootballOnly('EPL') && !americanFootballOnly(''))
  check('...and a national team\'s page is not a team page', !teamTitleOk('Colombia', 'Colombia national football team'))
  const GEHA = { lat: 10.9269, lon: -74.8006 }
  check('A POINT REACHED ONLY THROUGH THE HOME TEAM IS NOT TIED TO THE VENUE (Arrowhead / Barranquilla)',
    !tiedToVenue({ ...GEHA }, [{ source: 'team-venue', label: 'Estadio Metropolitano Roberto Melendez', ...GEHA }, { source: 'nominatim-alias', ...GEHA }, { source: 'photon-alias', ...GEHA }], 'GEHA Field at Arrowhead Stadium'))
  check('...unless the team\'s venue is called by the venue\'s own words (Alumni Stadium)',
    tiedToVenue({ lat: 42.3351, lon: -71.1663 }, [{ source: 'team-venue', label: 'Alumni Stadium', lat: 42.3351, lon: -71.1663 }], 'Alumni Stadium (Chestnut Hill, MA)'))
  check('...or a search by the venue\'s own name, or an article found by it, leads to the same place (Casino Del Sol)',
    tiedToVenue({ lat: 32.2289, lon: -110.9488 }, [{ source: 'team-venue', label: 'Arizona Stadium', lat: 32.229, lon: -110.949 }, { source: 'wp-article', lat: 32.2289, lon: -110.9488 }], 'Casino Del Sol Stadium'))
  const TV = (lat, lon) => ({ source: 'team-venue', lat, lon }), NA = (lat, lon) => ({ source: 'nominatim-alias', lat, lon })
  check('A TEAM-DERIVED VENUE AND AN OPENSTREETMAP POINT AGREEING IS ACCEPTED (Kenan)', decide([TV(35.907, -79.048), N(35.9071, -79.0481)]).decision === 'accepted')
  check('...an alias search in OpenStreetMap counts as that family (Casino Del Sol via Arizona Stadium)', decide([TV(32.229, -110.949), NA(32.2291, -110.9491)]).decision === 'accepted')
  check('TWO WIKIDATA-FAMILY POINTS AGREEING ARE ONE WITNESS, NOT TWO (M. M. Roberts)', decide([W(31.329, -89.331), TV(31.329, -89.331), N(30.532, -89.685), P(30.532, -89.685)]).decision === 'review')
  check('a wrong OpenStreetMap hit beside a right team venue is dissent, not agreement (Flagler)', decide([TV(26.375, -80.1), P(36.131, -80.255)]).decision === 'review')
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
    const r = await lookupPlus(c.venue, cache, { home: c.home, sports: c.sports })
    const d = r.decision
    const base = { name: c.venue, sports: c.sports, home: c.home }
    if (d.decision !== 'accepted') {
      review.push({ ...base, why: d.ambiguous ? `ambiguous name: ${d.ambiguous.join('; ')}` : d.decision === 'none' ? 'no source answered with a point' : `no two independent families agree (${d.dissent.join(', ')})`, unanswered: r.unanswered,
        sources: Object.fromEntries(Object.entries(r.sources).map(([k, o]) => [k, o.ok ? (o.point ?? o.note) : `ERROR ${o.why}`])) })
    } else {
      const qid = r.qid ?? r.sources.wikidata.point?.qid
      const roof = await roofOf(qid, cache)
      const zone = find(d.lat, d.lon)[0] ?? null
      const hc = r.sources.wikidata.homeChoice
      const wider = r.extra ? ` wider net (${d.agreeing.join(' + ')})` : ''
      const row = { ...base, lat: d.lat, lon: d.lon, agreeing: d.agreeing, qid, ...(hc?.chosen ? { via: `home team (tier ${hc.tier}, ${hc.matched.join(', ')})${wider}` } : r.extra ? { via: wider.trim() } : {}), roof: roof.roof, roofBasis: roof.basis, lead: roof.lead, zone }
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
  // Home team and sport for the rows the sourcing run saw, so the wider net can use
  // the team path on the sourced college football rows.
  const seen = JSON.parse(readFileSync('outbox/venue-source-results-latest.json', 'utf8'))
  const meta = new Map([...seen.accepted, ...seen.review].map(x => [x.name, { home: x.home, sports: x.sports }]))
  for (const v of table) {
    const r = await lookup(v.name, cache)
    const d = r.decision
    const verdict = d.decision === 'accepted' ? (near(d, v) ? 'accepted-correct' : 'accepted-WRONG')
      : d.decision === 'review' ? 'review' : 'none'
    // The two OSM front ends agreed with each other, no Wikidata point backed them,
    // and the point they agreed on is not where the table says the venue is: the
    // case the independence rule exists to refuse, counted so its value is measured.
    const osmOnlyWrong = Boolean(d.osmOnlyAgree) && r.sources.nominatim.point != null && !near(r.sources.nominatim.point, v)
    // The wider net, asked only of a row the plain rule left undecided, against the
    // same truth: a flip to a point that is not where the table says is a failure.
    let plus = null, plusPoints = null
    if (verdict === 'review' || verdict === 'none') {
      const m = meta.get(v.name) ?? {}
      const r2 = await lookupPlus(v.name, cache, { home: m.home, sports: m.sports })
      const d2 = r2.decision
      plus = d2.decision === 'accepted' ? (near(d2, v) ? 'flipped-correct' : 'flipped-WRONG') : 'still-undecided'
      // Which points made it, so a wrong flip names its own cause.
      plusPoints = r2.extra ? { agreeing: d2.agreeing, extras: r2.extra.extras.map(e => ({ source: e.source, label: e.label, lat: e.lat, lon: e.lon })), more: r2.extra.more.map(e => ({ source: e.source, label: e.label ?? null, lat: e.lat, lon: e.lon })) } : null
    }
    results.push({ name: v.name, truth: { lat: v.lat, lon: v.lon }, verdict, plus, plusPoints, decision: d, unanswered: r.unanswered, osmOnlyWrong,
      sources: Object.fromEntries(Object.entries(r.sources).map(([k, o]) => [k, o.ok ? (o.point ?? o.note) : `ERROR ${o.why}`])) })
    console.log(`  ${verdict.padEnd(17)} ${v.name}${r.unanswered.length ? `   [unanswered: ${r.unanswered.join('; ')}]` : ''}`)
    saveCache(cache)
  }
  const n = table.length
  const count = k => results.filter(r => r.verdict === k).length
  const sum = { checked: n, 'accepted-correct': count('accepted-correct'), 'accepted-WRONG': count('accepted-WRONG'), review: count('review'), none: count('none'),
    wider: { asked: results.filter(r => r.plus).length, flippedCorrect: results.filter(r => r.plus === 'flipped-correct').length, flippedWRONG: results.filter(r => r.plus === 'flipped-WRONG').length, stillUndecided: results.filter(r => r.plus === 'still-undecided').length },
    withAnUnansweredSource: results.filter(r => r.unanswered.length).length,
    osmAgreedAloneAndWrong: results.filter(r => r.osmOnlyWrong).length }
  // The home-team matcher, against the same hand-reviewed truth. Every
  // (venue, home) pair the archive holds for a table venue is run THROUGH the
  // matcher among that name's Wikidata candidates, ambiguous or not, and the
  // entity it picks is compared with where the table says the venue is. A
  // national team at a World Cup game (Switzerland at BC Place) is in the set
  // on purpose: the right answer there is to pick nothing.
  const homes = JSON.parse(readFileSync('data/venue-homes-table.json', 'utf8'))
  const truthOf = new Map(table.map(v => [v.name, v]))
  const pairs = []
  for (const [venue, hs] of Object.entries(homes.homes)) for (const home of hs) pairs.push({ venue, home })
  const homeTeam = []
  for (const { venue, home } of pairs) {
    const v = truthOf.get(venue)
    if (!v) { homeTeam.push({ venue, home, verdict: 'not-in-table' }); continue }
    const r = await lookup(venue, cache, { home, measure: true })
    const w = r.sources.wikidata, hc = w.homeChoice
    const collides = homes.collisions.some(c => c.venue === venue && c.home === home)
    const verdict = collides ? 'collision' : !w.ok ? 'unanswered' : !hc ? 'no-candidates' : hc.chosen ? (near(hc.chosen, v) ? 'right' : 'WRONG') : 'abstain'
    // What production would decide: the home pick standing in for Wikidata's point,
    // and the two OpenStreetMap front ends still required to agree with it.
    const d2 = hc?.chosen ? decide([{ source: 'wikidata', ...hc.chosen, ambiguous: null }, r.sources.nominatim.point, r.sources.photon.point]) : null
    const combined = collides ? 'collision' : d2?.decision === 'accepted' ? (near(d2, v) ? 'accepted-right' : 'accepted-WRONG') : 'not-accepted'
    homeTeam.push({ venue, home, verdict, combined, tier: hc?.tier ?? null, chosen: hc?.chosen ? { qid: hc.chosen.qid, label: hc.chosen.label, lat: hc.chosen.lat, lon: hc.chosen.lon } : null, why: hc?.why ?? w.why ?? null, candidates: (w.entities ?? []).length })
    if (verdict === 'WRONG' || combined === 'accepted-WRONG') console.log(`  HOME-TEAM ${combined === 'accepted-WRONG' ? 'ACCEPTED WRONG' : 'matcher wrong'}   ${venue} / ${home} -> ${hc.chosen.label} (${hc.chosen.qid})`)
    saveCache(cache)
  }
  const ht = k => homeTeam.filter(x => x.verdict === k).length
  const hcm = k => homeTeam.filter(x => x.combined === k).length
  sum.homeTeam = { pairs: homeTeam.length, right: ht('right'), WRONG: ht('WRONG'), abstain: ht('abstain'), noCandidates: ht('no-candidates'), unanswered: ht('unanswered'), notInTable: ht('not-in-table'), collisions: ht('collision'),
    accepted: hcm('accepted-right') + hcm('accepted-WRONG'), acceptedRight: hcm('accepted-right'), acceptedWRONG: hcm('accepted-WRONG') }
  const NOW = new Date()
  writeFileSync('outbox/venue-source-calibration-latest.json', JSON.stringify({ at: NOW.toISOString(), eps: EPS, summary: sum, homeTeam, results }, null, 2) + '\n')
  console.log(`\n  calibration: checked ${sum.checked} of ${n} table venues  ·  accepted ${sum['accepted-correct'] + sum['accepted-WRONG']}  ·  correct ${sum['accepted-correct']}  ·  WRONG ${sum['accepted-WRONG']}  ·  review ${sum.review}  ·  none ${sum.none}`)
  console.log(`  home-team matcher: checked ${sum.homeTeam.pairs} of ${pairs.length} venue/home pairs  ·  right ${sum.homeTeam.right}  ·  WRONG ${sum.homeTeam.WRONG}  ·  abstained ${sum.homeTeam.abstain}  ·  no candidates ${sum.homeTeam.noCandidates}  ·  unanswered ${sum.homeTeam.unanswered}  ·  named collisions ${sum.homeTeam.collisions}  ·  venue not in table ${sum.homeTeam.notInTable}`)
  console.log(`  ...as production decides it (the home pick, plus OpenStreetMap agreeing): accepted ${sum.homeTeam.accepted}  ·  right ${sum.homeTeam.acceptedRight}  ·  WRONG ${sum.homeTeam.acceptedWRONG}`)
  console.log(`  wider net: asked of ${sum.wider.asked} undecided row(s)  ·  flipped correct ${sum.wider.flippedCorrect}  ·  flipped WRONG ${sum.wider.flippedWRONG}  ·  still undecided ${sum.wider.stillUndecided}`)
  console.log(`  a source went unanswered on ${sum.withAnUnansweredSource} venue(s); OSM front ends agreed alone and were wrong on ${sum.osmAgreedAloneAndWrong}\n`)
  const { check, summarize } = createChecks()
  check('every table venue was run through the rule', results.length === n && n > 0, `${results.length} of ${n}`)
  check('NO accepted point is wrong', sum['accepted-WRONG'] === 0, results.filter(r => r.verdict === 'accepted-WRONG').map(r => r.name).join(', '))
  check('the wider net flipped NO undecided row to a wrong point', sum.wider.flippedWRONG === 0, results.filter(r => r.plus === 'flipped-WRONG').map(r => r.name).join(', '))
  check('every home-team pair was run through the matcher', homeTeam.length === pairs.length && pairs.length > 0 && sum.homeTeam.notInTable === 0, `${homeTeam.length} of ${pairs.length}; ${sum.homeTeam.notInTable} venue(s) not in the table`)
  check('the home-team rule, as production decides it, accepted NO wrong venue', sum.homeTeam.acceptedWRONG === 0, homeTeam.filter(x => x.combined === 'accepted-WRONG').map(x => `${x.venue} / ${x.home} -> ${x.chosen.label}`).join('; '))
  check('...and it accepted something, or this is vacuous', sum.homeTeam.accepted > 0, 'no pair was accepted through the home-team path')
  finish(summarize())
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--self-test')) selfTest()
  else if (process.argv.includes('--calibrate')) await calibrate()
  else if (process.argv.includes('--occupants')) await occupants(process.argv[process.argv.indexOf('--occupants') + 1])
  else if (process.argv.includes('--source')) await source(process.argv[process.argv.indexOf('--source') + 1])
  else { console.error('usage: node scripts/venue-source.mjs --self-test | --calibrate | --source LIST.json | --occupants RESULTS.json'); process.exit(2) }
}
