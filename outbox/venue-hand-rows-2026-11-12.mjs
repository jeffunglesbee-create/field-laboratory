// Task 4, "Yes to all" (2026-11-12): the hand rows for the review venues the table does not carry, and the proof of each
// (Rule 89: the artifact is this script's printed result).
// docs/CC-CMD-2026-11-09-venue-review-remainder.md, Task 4.
//
// It reads committed files and nothing else, and uses no network:
//   outbox/venue-hand-rows-evidence-2026-11-12.json   the pages the rows were read from (as the page reader returned them, keyed by URL),
//                                                     the selectors that say which number on which page is which witness, the archive's
//                                                     rows for these venues, the zones, the roof readings and the reasons a name stays out
//   outbox/venue-source-results-latest.json           the sourcing run's own points (a selector `pick` takes the run's Nominatim or Photon point)
//   outbox/venue-review-counts-2026-11-12.md          games and days per name (Step 1's record)
//   src/Venues.fs and src/Suite.fs                    the rows and the table the Suite holds are compared with what the evidence derives
// No coordinate is typed here and none is typed in the selectors: every number is read from a saved page by a selector. The only numbers
// typed in this file are the sourcing rule's, which it imports (scripts/venue-source.mjs: EPS, decide, classifyRoof, decideRoof).
//
// WHAT A ROW NEEDS (the same four things the sourcing rule needs, with a person doing the reading where the rule cannot):
//   position  two witnesses of two families inside the rule's box (`decide` itself judges it). A postcode centroid is a family the rule does
//             not know, so a row that uses one is judged by an explicit pair (`twoFamilies`) and flagged.
//   identity  the archive's name for the ground is the ground the Wikipedia article is about (a name needle found in the article's lead or
//             in a search hit on its source), and the clubs the archive lists as home there are tied to it the same way. A home string no
//             needle ties is reported, not hidden.
//   roof      the lead's class by the rule's own `classifyRoof`/`decideRoof`, with the article's roof words checked by four saved searches:
//             the combined one and the supplement must be answered, and a hit is a reading that must quote the saved page.
//   zone      the IANA zone at the row's point, by geo-tz/all 8.1.4, the entry point the sourcing run uses (the default entry merges Amsterdam into
//             Brussels and the live weather check compares the declared zone with Open-Meteo's own). It is NOT recomputed here (geo-tz is not a
//             dependency of this repository); the checks are that the saved zone was computed for exactly the row's point, is a zone Intl knows, and
//             equals the zone the sourcing run recorded where it recorded one.
//
// Usage, from the repository root:
//   node outbox/venue-hand-rows-2026-11-12.mjs                  the report; exits 1 unless every check holds
//   node outbox/venue-hand-rows-2026-11-12.mjs rows             the block for src/Venues.fs (stdout)
//   node outbox/venue-hand-rows-2026-11-12.mjs suite            the table for src/Suite.fs (stdout)
//   node outbox/venue-hand-rows-2026-11-12.mjs record           the record the owner reads (stdout)
//   node outbox/venue-hand-rows-2026-11-12.mjs --self-test      the same judgement on doctored copies, each caught by a named check
//   node outbox/venue-hand-rows-2026-11-12.mjs <mode> --evidence <file> [--venues <file>] [--suite <file>]   another copy of the inputs (the mutation script uses it)

import { readFileSync } from 'node:fs'
import { EPS, near, decide, classifyRoof, decideRoof } from '../scripts/venue-source.mjs'
import { createChecks, finish, isMain } from '../scripts/checks.mjs'

export const EVIDENCE = 'outbox/venue-hand-rows-evidence-2026-11-12.json'
export const RESULTS = 'outbox/venue-source-results-latest.json'
export const COUNTS = 'outbox/venue-review-counts-2026-11-12.md'
export const VENUES = 'src/Venues.fs'
export const SUITE = 'src/Suite.fs'
/** The OpenStreetMap classes the sourcing rule counts as a place (scripts/venue-source.mjs, OSM_KEYS). */
export const OSM_KEYS = new Set(['leisure', 'building', 'amenity', 'tourism', 'sport', 'man_made'])
export const CASE = { open: 'OpenAir', dome: 'Dome', retractable: 'Retractable' }
const FORMS = {
  RC: /insource:\/roof\[a-z_\+\]\*=\|\(retractable/,
  PHRASE: /insource:\/\(retractable\|sliding/,
  PARAM: /insource:\/%5C%7C\.%3Froof/,
  SUP: /insource:\/roof\.that\./,
}
const FORM_NAME = { RC: 'combined', PHRASE: 'phrase', PARAM: 'infobox parameter', SUP: 'supplement' }

// --- reading the saved pages --------------------------------------------------------------------------------------------------------

const MAP = { ł: 'l', ø: 'o', đ: 'd', ı: 'i', ß: 'ss', æ: 'ae', œ: 'oe' }
/** Lower case, accents and a few letters that do not decompose removed, one kind of apostrophe. For comparing names, never for display. */
export const fold = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[łøđıßæœ]/g, c => MAP[c]).replace(/[’‘`]/g, "'")
export const has = (text, needle) => fold(text).includes(fold(needle))
/** A saved answer, with its JSON escapes read back, so a quote typed in a reading can be found in it. */
export const unesc = s => String(s).replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\n/g, '\n').replace(/\\"/g, '"')
const dec = s => decodeURIComponent(s.replace(/\+/g, ' '))
const json = b => { try { return JSON.parse(b) } catch { return null } }
const formOf = url => Object.entries(FORMS).find(([, re]) => re.test(url))?.[0] ?? null
const titleOf = url => { const m = /intitle:%22(.+?)%22\+insource:/.exec(url); return m ? dec(m[1]) : null }
const needleOf = url => { const m = /insource:%22(.+?)%22(?:&|$)/.exec(url); return m ? dec(m[1]) : null }
const hitsOf = body => {
  if (/cirrussearch-[a-z-]*error|"error"\s*:/.test(body)) return { state: 'error' }
  const m = /"totalhits":(\d+)/.exec(body)
  return m ? { state: 'answered', totalhits: Number(m[1]) } : { state: 'error' }
}

/**
 * Every saved page, indexed by what its URL asked. A page that answers a question another page already answered must agree with it
 * (a disagreement is listed in `conflicts` and refused); a Cirrus error answer is kept only when nothing answered the same question.
 */
export const indexPages = pages => {
  const ix = { coords: new Map(), wd: new Map(), wdLabels: new Map(), osm: new Map(), extract: new Map(), roof: new Map(), snip: new Map(), postcode: new Map(), conflicts: [], pages: 0 }
  const put = (map, key, val, what, url) => {
    const old = map.get(key)
    if (old && JSON.stringify(old.val) !== JSON.stringify(val)) ix.conflicts.push(`${what} ${key}: ${old.url.slice(0, 80)} differs from ${url.slice(0, 80)}`)
    else if (!old) map.set(key, { val, url })
  }
  for (const [url, body] of Object.entries(pages)) {
    ix.pages++
    if (/prop=coordinates/.test(url)) {
      for (const p of json(body)?.query?.pages ?? []) if (p.coordinates?.[0]) put(ix.coords, p.title, { lat: p.coordinates[0].lat, lon: p.coordinates[0].lon, qid: p.pageprops?.wikibase_item ?? null }, 'coordinates', url)
    } else if (/prop=extracts/.test(url) && /exintro=1/.test(url)) {
      for (const p of json(body)?.query?.pages ?? []) if (typeof p.extract === 'string') put(ix.extract, p.title, p.extract, 'extract', url)
    } else if (/wbgetclaims/.test(url) && /property=P625/.test(url)) {
      const q = /entity=(Q\d+)/.exec(url)?.[1], v = json(body)?.claims?.P625?.[0]?.mainsnak?.datavalue?.value
      if (q && v) put(ix.wd, q, { lat: v.latitude, lon: v.longitude }, 'wikidata P625', url)
    } else if (/nominatim\.openstreetmap\.org\/(lookup|search)/.test(url)) {
      // One object can be answered by /lookup under one class and by /search under another (a way tagged both club and leisure=stadium), so the
      // classes are kept per page and only the position and the name must agree between pages.
      const j = json(body)
      if (Array.isArray(j)) for (const o of j) {
        const key = o.osm_type[0].toUpperCase() + o.osm_id, cls = `${o.category ?? o.class}/${o.type}`, old = ix.osm.get(key)
        const here = { lat: Number(o.lat), lon: Number(o.lon), name: o.name ?? '' }
        if (!old) ix.osm.set(key, { url, val: { ...here, classes: new Map([[cls, { url, label: o.display_name }]]) } })
        else {
          if (old.val.lat !== here.lat || old.val.lon !== here.lon || old.val.name !== here.name) ix.conflicts.push(`OpenStreetMap object ${key}: ${old.url.slice(0, 80)} differs from ${url.slice(0, 80)}`)
          if (!old.val.classes.has(cls)) old.val.classes.set(cls, { url, label: o.display_name })
        }
      }
    } else if (/wbgetentities/.test(url)) {
      for (const [id, e] of Object.entries(json(body)?.entities ?? {})) {
        const labels = Object.values(e.labels ?? {}).map(l => l.value), old = ix.wdLabels.get(id)
        if (!old) ix.wdLabels.set(id, { url, urls: [url], val: { labels } })
        else {
          old.urls.push(url)
          for (const l of labels) if (!old.val.labels.includes(l)) old.val.labels.push(l)
        }
      }
    } else if (/api\.postcodes\.io\/postcodes\//.test(url)) {
      const r = json(body)?.result
      if (r) put(ix.postcode, r.postcode, { lat: r.latitude, lon: r.longitude, quality: r.quality }, 'postcode', url)
    } else if (/list=search/.test(url) && /insource:\//.test(url)) {
      const f = formOf(url), t = titleOf(url)
      if (!f || !t) continue
      const key = `${t}|${f}`, h = hitsOf(body), old = ix.roof.get(key)
      if (!old || (old.state === 'error' && h.state === 'answered')) ix.roof.set(key, { ...h, url, text: body })
      else if (old.state === 'answered' && h.state === 'answered' && old.totalhits !== h.totalhits) ix.conflicts.push(`roof search ${key}: ${old.totalhits} hits on one page, ${h.totalhits} on another`)
    } else if (/list=search/.test(url) && /insource:%22/.test(url) && /intitle:%22/.test(url)) {
      const t = /intitle:%22(.+?)%22\+insource:/.exec(url), n = needleOf(url), h = hitsOf(body)
      if (t && n && h.state === 'answered') ix.snip.set(`${dec(t[1])}|${n}`, { ...h, url, text: body })
    }
  }
  return ix
}

// --- one venue ----------------------------------------------------------------------------------------------------------------------

const first = s => (s ?? '').split(/(?<=\.)\s/)[0]
const base = title => title.replace(/\s*\([^)]*\)\s*$/, '')

/** One selector's point, or an error that names what was missing. `url` is the page it came from (null for the run's own point). */
export const pointOf = (sel, ix, results, name) => {
  if (sel.wp) {
    const c = ix.coords.get(sel.wp)
    return c ? { p: { source: 'wp-article', lat: c.val.lat, lon: c.val.lon, label: sel.wp, qid: c.val.qid }, url: c.url } : { err: `no saved Wikipedia coordinates for "${sel.wp}"` }
  }
  if (sel.wd) {
    const c = ix.wd.get(sel.wd)
    return c ? { p: { source: 'wikidata', lat: c.val.lat, lon: c.val.lon, label: sel.wd, qid: sel.wd }, url: c.url } : { err: `no saved Wikidata P625 for ${sel.wd}` }
  }
  if (sel.nm) {
    const o = ix.osm.get(sel.nm)
    if (!o) return { err: `no saved OpenStreetMap object ${sel.nm}` }
    const ok = [...o.val.classes].find(([c]) => OSM_KEYS.has(c.split('/')[0]))
    if (!ok) return { err: `${sel.nm} is ${[...o.val.classes.keys()].join(' and ')} on the saved pages, a class the sourcing rule does not count` }
    return { p: { source: 'nominatim', lat: o.val.lat, lon: o.val.lon, label: ok[1].label, kind: ok[0], osm: sel.nm, osmName: o.val.name }, url: ok[1].url }
  }
  if (sel.pick) {
    const p = results.review.find(r => r.name === name)?.sources?.[sel.pick]
    return p && typeof p === 'object' ? { p, url: null } : { err: `the sourcing run recorded no ${sel.pick} point for this name` }
  }
  if (sel.pc) {
    const c = ix.postcode.get(sel.pc)
    return c ? { p: { source: 'os-postcode', lat: c.val.lat, lon: c.val.lon, label: sel.pc }, url: c.url } : { err: `no saved postcodes.io answer for ${sel.pc}` }
  }
  return { err: `unknown selector ${JSON.stringify(sel)}` }
}

/** The accepted point of two witnesses of two families when one is a postcode centroid, a family the rule does not know: both inside the rule's box. */
export const twoFamilies = (a, b) => near(a, b)
  ? { decision: 'accepted', agreeing: [a.source, b.source].sort(), dissent: [], lat: Math.round(((a.lat + b.lat) / 2) * 1e4) / 1e4, lon: Math.round(((a.lon + b.lon) / 2) * 1e4) / 1e4 }
  : { decision: 'review', agreeing: [], dissent: [a.source, b.source] }

/**
 * A club is tied to the ground when its needle is in the article's lead, or a saved search for that needle on the article's source has a
 * hit, or (the object form) a saved search for one of the venue's own name needles on ANOTHER article has a hit and that article is the
 * club's (its title has the needle) or the hit's text has the needle.
 */
const tiedTeam = (t, entry, ix) => {
  if (typeof t === 'string') return has(ix.extract.get(entry.article)?.val ?? '', t) || (entry.snip ?? []).some(([title, n]) => n === t && (ix.snip.get(`${title}|${n}`)?.totalhits ?? 0) >= 1)
  const s = ix.snip.get(t.via.join('|'))
  return !!s && s.totalhits >= 1 && entry.names.some(n => fold(n) === fold(t.via[1])) && (has(t.via[0], t.needle) || has(unesc(s.text), t.needle))
}
const needleOfTeam = t => (typeof t === 'string' ? t : t.needle)

/** Identity: the name and the clubs, from the article's lead and from search hits on its source. */
export const identityOf = (entry, ix, archive) => {
  const lead = ix.extract.get(entry.article)?.val ?? ''
  const snipHit = n => (entry.snip ?? []).some(([title, sn]) => sn === n && (ix.snip.get(`${title}|${sn}`)?.totalhits ?? 0) >= 1)
  // the string is a label of the Wikidata item the entry uses as a witness: an exact (folded) match, not a substring
  const labelHit = n => (entry.w ?? []).some(s => s.wd && (ix.wdLabels.get(s.wd)?.val.labels ?? []).some(l => fold(l) === fold(n)))
  const nameBy = entry.names.map(n => ({ needle: n, by: has(lead, n) ? 'the lead' : labelHit(n) ? 'a Wikidata label' : snipHit(n) ? 'a search hit on the article' : null })).filter(x => x.by)
  const nameTied = nameBy.map(x => x.needle)
  const teamsTied = entry.teams.filter(t => tiedTeam(t, entry, ix)).map(needleOfTeam)
  const rows = archive.filter(r => r.venue === entry.name)
  // a competition needle ties the ground when the article says it (the lead or a search hit) and every archive row of the name is in a competition that has it
  const compsTied = (entry.comps ?? []).filter(c => (has(lead, c) || (entry.snip ?? []).some(([title, sn]) => sn === c && (ix.snip.get(`${title}|${sn}`)?.totalhits ?? 0) >= 1)) && rows.length > 0 && rows.every(r => has(r.league ?? '', c)))
  const homes = new Map()
  for (const r of rows) homes.set(r.home, (homes.get(r.home) ?? 0) + r.n)
  const untied = [...homes].filter(([h]) => !teamsTied.some(t => fold(h).includes(fold(t)) || fold(t).includes(fold(h)))).map(([home, games]) => ({ home, games }))
  return { nameTied, nameBy, teamsTied, compsTied, homes: [...homes].map(([home, games]) => ({ home, games })), untied }
}

/** Roof: the rule's own decision over the lead and the four saved searches, with a reading for every hit. */
export const roofOfEntry = (entry, ix, readings) => {
  const problems = [], used = []
  const ex = ix.extract.get(entry.article)?.val
  if (ex == null) return { problems: [`no saved lead for "${entry.article}"`] }
  const lead = first(ex)
  // The rule reads the first sentence only. A roof word in the next two is a reading: it must quote the saved lead and say what the word is about.
  let leadReading = null
  if (classifyRoof(lead) !== classifyRoof(ex)) {
    const r = (readings ?? []).find(x => x.title === entry.article && x.form === 'LEAD')
    if (!r) problems.push(`the first sentence reads ${classifyRoof(lead)} and the first three read ${classifyRoof(ex)}: a roof word after the first full stop, and no reading of it`)
    else if (!has(ex, r.quote)) problems.push('the lead reading\'s quote is not on the saved lead')
    else leadReading = r
  }
  const get = f => ix.roof.get(`${entry.article}|${f}`)
  for (const f of ['RC', 'SUP']) if (get(f)?.state !== 'answered') problems.push(`the ${FORM_NAME[f]} roof search is not answered on any saved page`)
  const rc = get('RC')
  const need = []
  if (rc?.state === 'answered' && rc.totalhits > 0) {
    for (const f of ['PHRASE', 'PARAM']) {
      if (get(f)?.state !== 'answered') problems.push(`the combined search has a hit and the ${FORM_NAME[f]} search is not answered`)
      else if (get(f).totalhits > 0) need.push(f)
    }
    if (!need.length && get('PHRASE')?.state === 'answered' && get('PARAM')?.state === 'answered') need.push('RC')
  }
  if (get('SUP')?.state === 'answered' && get('SUP').totalhits > 0) need.push('SUP')
  let body = ''
  for (const f of need) {
    const r = (readings ?? []).find(x => x.title === entry.article && x.form === f)
    const page = get(f)
    if (!r) { problems.push(`a ${FORM_NAME[f]} hit has no reading`); continue }
    if (!page || !has(unesc(page.text), r.quote)) { problems.push(`the ${FORM_NAME[f]} reading's quote is not on the saved page`); continue }
    used.push({ form: f, class: r.class, quote: r.quote, why: r.why })
    if (r.class !== 'open') body = r.quote
  }
  // With a reading of the lead the person's class stands and the rule's decision is not asked; otherwise the rule decides.
  const d = leadReading ? { roof: leadReading.class, basis: `lead, read by hand: "${leadReading.quote}" (${leadReading.why})` } : decideRoof(null, lead, body, [])
  if (!d.roof) problems.push(`the rule does not settle the roof: ${d.basis}`)
  const closedReading = used.find(x => x.class !== 'open')
  if (d.roof === 'open' && closedReading) problems.push('a reading says the ground has a closed roof and the rule says open')
  if (closedReading && d.roof && d.roof !== 'open' && closedReading.class !== d.roof) problems.push(`the reading says ${closedReading.class} and the rule says ${d.roof}`)
  return { problems, lead, roof: d.roof, basis: d.basis, readings: used, leadReading, hits: Object.fromEntries(['RC', 'PHRASE', 'PARAM', 'SUP'].map(f => [f, get(f)?.state === 'answered' ? get(f).totalhits : null])) }
}

/** Everything one spec entry derives to: its row when every part holds, else the problems. */
export const resolveEntry = (entry, ctx) => {
  const { ix, results, evidence } = ctx
  const problems = [], urls = new Set(), pts = []
  const take = (sels, kind) => (sels ?? []).map(sel => {
    const r = pointOf(sel, ix, results, entry.name)
    if (r.err) { problems.push(r.err); return null }
    if (r.url) urls.add(r.url)
    pts.push({ ...r.p, kind: r.p.kind ?? '', role: kind })
    return r.p
  }).filter(Boolean)
  const w = take(entry.w, 'witness'), o = take(entry.osm, 'witness'), pc = take(entry.pc, 'witness'), dis = take(entry.dissent, 'dissent')
  let d
  if (entry.pc) d = w[0] && pc[0] ? twoFamilies(w[0], pc[0]) : { decision: 'none' }
  else d = decide([...w, ...o, ...dis])
  if (d.decision !== 'accepted') problems.push(`no two families inside the box: ${d.decision}`)
  else {
    for (const x of dis) if (near(x, d)) problems.push(`a point listed as dissent (${x.source} ${x.lat}, ${x.lon}) is inside the box around the accepted point`)
    const wf = w.filter(p => ['wp-article', 'wikidata'].includes(p.source)).length
    if (!wf) problems.push('no Wikipedia or Wikidata witness in the accepted point')
  }
  // The sourcing run's own recorded acceptance (the nine names it held back for the roof only) must sit inside the box of the row's point.
  const run = results.review.find(r => r.name === entry.name)
  if (d.decision === 'accepted' && run?.agreeing && Number.isFinite(run.lat) && !near(run, d)) problems.push(`the sourcing run's own accepted point (${run.lat}, ${run.lon}) is outside the box around the row's point (${d.lat}, ${d.lon})`)
  const identity = identityOf(entry, ix, evidence.archive)
  if (!identity.nameTied.length) problems.push('no name needle is found in the article lead, a Wikidata label of a witness or a saved search hit on the article')
  if (!identity.teamsTied.length && !identity.compsTied.length) problems.push('no team or competition needle is found in the article lead or a saved search hit on the article')
  const roof = roofOfEntry(entry, ix, evidence.readings)
  for (const p of roof.problems) problems.push(`roof: ${p}`)
  const z = evidence.zones?.[entry.name]
  if (!z) problems.push('no saved zone')
  else {
    if (d.decision === 'accepted' && (z.lat !== d.lat || z.lon !== d.lon)) problems.push(`the saved zone was computed for ${z.lat}, ${z.lon} and the row's point is ${d.lat}, ${d.lon}`)
    try { new Intl.DateTimeFormat('en', { timeZone: z.zone }) } catch { problems.push(`"${z.zone}" is not a zone Intl knows`) }
    if (run?.zone && run.zone !== z.zone) problems.push(`the sourcing run recorded the zone ${run.zone} for this name and the saved zone is ${z.zone}`)
  }
  const osmWitnesses = [...o, ...w.filter(p => p.source === 'nominatim')]
  const named = osmWitnesses.length > 0 && osmWitnesses.every(p => entry.names.some(n => has(p.label ?? '', n)) || has(p.label ?? '', base(entry.article)))
  return { name: entry.name, entry, points: pts, decision: d, identity, roof, zone: z?.zone, named, urls: [...urls], problems, row: problems.length ? null : { name: entry.name, lat: d.lat, lon: d.lon, roof: roof.roof, zone: z.zone } }
}

// --- the whole table ------------------------------------------------------------------------------------------------------------------

export const loadEvidence = path => JSON.parse(readFileSync(path, 'utf8'))

/** The record's table of the 71: games, days, first and last date and the sourcing rule's reason, by name. */
export const readCounts = text => {
  const out = new Map()
  for (const line of text.split('\n')) {
    const m = /^\| \d+ \| (.+?) \| (.+?) \| (.+?) \| (\d+) \| (\d+) \| (\d{4}-\d\d-\d\d) \| (\d{4}-\d\d-\d\d) \| (.+?) \|$/.exec(line)
    if (m) out.set(m[1], { leagues: m[2], home: m[3], games: Number(m[4]), days: Number(m[5]), first: m[6], last: m[7], reason: m[8] })
  }
  return out
}

/** The alias rows copy a row the table already has; this reads it from the source. */
export const tableRow = (venuesText, name) => {
  const ms = [...venuesText.matchAll(new RegExp(`^\\s*at ${JSON.stringify(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} (-?\\d+\\.\\d+) (-?\\d+\\.\\d+) (OpenAir|Dome|Retractable) "([^"]+)"$`, 'gm'))]
  return ms.length === 1 ? { lat: Number(ms[0][1]), lon: Number(ms[0][2]), roof: ms[0][3], zone: ms[0][4] } : null
}

/** The opponents that have games under both spellings of a ground, with the dates under each. */
export const sharedOpponents = (series, other) => [...new Set(series.map(r => r.away))]
  .map(away => ({ away, alias: series.filter(r => r.away === away).map(r => r.date), of: other.filter(r => r.away === away).map(r => r.date) }))
  .filter(s => s.of.length)
/** The date window a saved archive statement asks for, read from its own text. */
export const windowOf = sql => { const m = /date >= '(\d{4}-\d\d-\d\d)' AND date <= '(\d{4}-\d\d-\d\d)'/.exec(sql ?? ''); return m ? { from: m[1], to: m[2] } : null }

export const solve = (evidence, results, countsText, venuesText) => {
  const ix = indexPages(evidence.pages)
  const ctx = { ix, results, evidence }
  const counts = readCounts(countsText)
  const built = evidence.spec.map(e => resolveEntry(e, ctx))
  const aliases = (evidence.alias ?? []).map(a => {
    const t = tableRow(venuesText, a.of), problems = []
    if (!t) problems.push(`"${a.of}" is not exactly one row of ${VENUES}`)
    const series = (evidence.aliasSeries ?? []).filter(r => r.venue === a.name)
    const other = (evidence.aliasSeries ?? []).filter(r => r.venue === a.of)
    if (!series.length) problems.push('no archive rows for the alias')
    if (series.some(r => r.home !== a.home)) problems.push(`an archive row of the alias has a home other than ${a.home}`)
    if (!other.length) problems.push('no archive rows for the ground it aliases')
    // What ties two spellings to one ground is a series of games split between them: an opponent with games under both.
    const shared = sharedOpponents(series, other)
    if (!shared.length) problems.push('no opponent has games under both spellings, so nothing in the archive ties them together')
    const win = windowOf(evidence.aliasQuery?.sql)
    if (!win) problems.push('the saved archive statement for the alias series has no date window')
    else if ([...series, ...other].some(r => r.date < win.from || r.date > win.to)) problems.push("a saved alias row is outside the statement's date window")
    const counted = counts.get(a.name)
    if (!counted || counted.games !== series.length) problems.push(`the counts record gives ${counted?.games ?? 'no'} games for the alias and the saved series has ${series.length}`)
    return { name: a.name, alias: a, problems, row: t && !problems.length ? { name: a.name, lat: t.lat, lon: t.lon, roof: Object.entries(CASE).find(([, v]) => v === t.roof)[0], zone: t.zone } : null, series, other, shared, win }
  })
  return { ix, built, aliases, counts }
}

export const rowsOf = sol => [...sol.built, ...sol.aliases].filter(b => b.row).map(b => b.row).sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
export const fsRow = r => `at ${JSON.stringify(r.name)} ${r.lat.toFixed(4)} ${r.lon.toFixed(4)} ${CASE[r.roof]} ${JSON.stringify(r.zone)}`
const wrap = (text, prefix, width = 100) => {
  const lines = []; let cur = prefix
  for (const word of text.split(/\s+/)) {
    if (cur.length + word.length + 1 > width && cur.trim() !== prefix.trim()) { lines.push(cur); cur = prefix + word }
    else cur += (cur === prefix ? '' : ' ') + word
  }
  lines.push(cur)
  return lines
}
const pt = p => `${p.lat}, ${p.lon}`
const witnessLine = b => {
  const ws = b.points.filter(p => p.role === 'witness').map(p => `${p.source === 'wp-article' ? `Wikipedia "${p.label}"${p.qid ? ` (${p.qid})` : ''}` : p.source === 'wikidata' ? `Wikidata ${p.qid}` : p.source === 'os-postcode' ? `OS postcode directory ${p.label}` : `${p.source === 'photon' ? 'Photon' : 'OpenStreetMap'} "${(p.label ?? '').split(',')[0]}"${p.kind ? ` [${p.kind}]` : ''}`} ${pt(p)}`)
  const ds = b.points.filter(p => p.role === 'dissent').map(p => `${p.source} ${pt(p)}`)
  return `${ws.join('; ')}${ds.length ? `. Disagreeing: ${ds.join('; ')}` : ''}`
}
/**
 * Flags computed from the saved pages, none typed. Tier A: a thin point or a thin tie between the archive's name and the ground. Tier B: what a map or an
 * article calls the ground differs from the archive's string. Tier C: a roof word the rule's first-sentence read does not see, read by a person.
 */
export const flagList = b => {
  const f = []
  // Photon and Nominatim both answer from OpenStreetMap data (the sourcing rule's family 'osm'); a point taken from the run's own answer has no object id.
  const osmW = b.points.filter(p => p.role === 'witness' && ['nominatim', 'photon'].includes(p.source))
  const who = p => `${p.source === 'photon' ? 'Photon' : 'OpenStreetMap'} witness${p.osm ? ` (${p.osm})` : " (the sourcing run's recorded point)"}`
  for (const p of osmW) {
    if (p.kind !== 'leisure/stadium') f.push({ tier: 'A', text: `the ${who(p)} is classed ${p.kind}, not leisure/stadium` })
    if (p.osmName === '') f.push({ tier: 'A', text: `the ${who(p)} carries no name` })
  }
  if (!osmW.length) f.push({ tier: 'A', text: `no OpenStreetMap-family witness (Nominatim or Photon)${b.points.some(p => p.source === 'os-postcode') ? ': a postcode centroid of the OS postcode directory stands for the second family' : ''}` })
  if (osmW.length && !b.named) f.push({ tier: 'B', text: 'the OpenStreetMap-family witness carries neither the venue string nor the article title in its label' })
  const nb = b.identity.nameBy
  if (nb.length && !nb.some(x => x.by === 'the lead')) f.push({ tier: 'A', text: `the venue name is not in the article's lead; it is tied by ${[...new Set(nb.map(x => x.by))].join(' and ')} ("${nb.map(x => x.needle).join('", "')}")` })
  if (b.identity.untied.length) f.push({ tier: 'A', text: `home not tied to the ground: ${b.identity.untied.map(u => `"${u.home}" (${u.games} game${u.games === 1 ? '' : 's'})`).join(', ')}` })
  if (b.roof.readings?.length) f.push({ tier: 'C', text: `roof hit read by hand: ${b.roof.readings.map(r => `${FORM_NAME[r.form]}: "${r.quote}" (${r.why})`).join('; ')}` })
  if (b.roof.leadReading) f.push({ tier: 'C', text: `roof word in the lead after its first sentence, read by hand: "${b.roof.leadReading.quote}" (${b.roof.leadReading.why})` })
  if (/\([^)]*\)$/.test(b.entry.article)) f.push({ tier: 'B', text: `the Wikipedia article's title carries a qualifier: "${b.entry.article}"` })
  return f
}
const flagsOf = b => flagList(b).map(x => x.text)
export const commentOf = (b, counts) => {
  const c = counts.get(b.name)
  const roofText = b.roof.readings?.length ? `${b.roof.basis}; ${b.roof.readings.length} hit${b.roof.readings.length === 1 ? '' : 's'} read by hand` : b.roof.basis
  const text = `${b.name}${c ? ` (${c.leagues}; ${c.games} game${c.games === 1 ? '' : 's'} on ${c.days} day${c.days === 1 ? '' : 's'}, ${c.first} to ${c.last})` : ''}. ${witnessLine(b)}. Roof ${b.roof.roof}: ${roofText}. Zone ${b.zone} (geo-tz/all 8.1.4).${flagsOf(b).length ? ` Flags: ${flagsOf(b).join('; ')}.` : ''}`
  return wrap(text, '      // ')
}
const aliasComment = (a, counts) => {
  const c = counts.get(a.name)
  const split = a.shared.map(s => `${s.away} (${s.of.join(', ')} under "${a.alias.of}"; ${s.alias.join(', ')} under this spelling)`).join('; ')
  return wrap(`${a.name}${c ? ` (${c.leagues}; ${c.games} game${c.games === 1 ? '' : 's'} on ${c.days} day${c.days === 1 ? '' : 's'}, ${c.first} to ${c.last})` : ''}. In the archive's MLB games of the ${a.alias.home} from ${a.win.from} to ${a.win.to} their home games are filed under two spellings, ${a.series.length} under this one and ${a.other.length} under "${a.alias.of}", and a series is split between them: ${split}. The row is "${a.alias.of}"'s row, taken from this file. What "(NH)" stands for is not established.`, '      // ')
}
export const rowsBlock = sol => {
  const lines = []
  const byName = new Map([...sol.built, ...sol.aliases].filter(b => b.row).map(b => [b.name, b]))
  for (const r of rowsOf(sol)) {
    const b = byName.get(r.name)
    lines.push(...(b.alias ? aliasComment(b, sol.counts) : commentOf(b, sol.counts)), `      ${fsRow(r)}`)
  }
  return lines.join('\n')
}
export const suiteTable = sol => rowsOf(sol).map(r => `        ${JSON.stringify(r.name)}, ${r.lat.toFixed(4)}, ${r.lon.toFixed(4)}, Weather.${CASE[r.roof]}, ${JSON.stringify(r.zone)}`)

// --- the checks --------------------------------------------------------------------------------------------------------------------

/** The F# rows in a source text between two markers, as `name lat lon roof zone` strings. */
export const handBlock = venuesText => {
  const a = venuesText.indexOf('// --- BEGIN hand rows 2026-11-12'), b = venuesText.indexOf('// --- END hand rows 2026-11-12')
  return a < 0 || b < 0 || b < a ? null : venuesText.slice(a, b).split('\n').filter(l => /^\s*at "/.test(l)).map(l => l.trim())
}
export const suiteRows = suiteText => {
  const a = suiteText.indexOf('// --- BEGIN hand rows table 2026-11-12'), b = suiteText.indexOf('// --- END hand rows table 2026-11-12')
  return a < 0 || b < 0 || b < a ? null : suiteText.slice(a, b).split('\n').filter(l => /^\s*"/.test(l)).map(l => l.replace(/\s+$/, ''))
}

export const runChecks = (check, evidence, results, countsText, venuesText, suiteText) => {
  const sol = solve(evidence, results, countsText, venuesText)
  const names71 = [...sol.counts.keys()]
  const noRowNames = new Set(readCounts(countsText).keys())
  check('the saved pages agree wherever two of them answer one question', sol.ix.conflicts.length === 0, sol.ix.conflicts.slice(0, 3).join(' | '))
  const bad = sol.built.filter(b => b.problems.length)
  check(`every spec entry resolves to a row (${sol.built.length} entries)`, bad.length === 0, bad.slice(0, 4).map(b => `${b.name}: ${b.problems[0]}`).join(' | '))
  const abad = sol.aliases.filter(a => a.problems.length)
  check(`every alias row copies a row the table has and is backed by archive rows (${sol.aliases.length} aliases)`, abad.length === 0, abad.map(a => `${a.name}: ${a.problems[0]}`).join(' | '))
  const accounted = new Map()
  for (const b of [...sol.built, ...sol.aliases]) accounted.set(b.name, (accounted.get(b.name) ?? 0) + 1)
  for (const o of evidence.out) accounted.set(o.name, (accounted.get(o.name) ?? 0) + 1)
  check(`every name of the 71 is a row or has a reason, once (${names71.length} names)`, names71.length === 71 && names71.every(n => accounted.get(n) === 1) && [...accounted.keys()].every(n => noRowNames.has(n)), `unaccounted: ${names71.filter(n => accounted.get(n) !== 1).join(', ')}; not in the record: ${[...accounted.keys()].filter(n => !noRowNames.has(n)).join(', ')}`)
  const outBad = evidence.out.filter(o => !o.why || !(o.quotes?.length) || o.quotes.some(q => !evidence.pages[q.url] || !has(unesc(evidence.pages[q.url]), q.text)))
  check(`every name left out has a one-line reason and a quote found on a saved page (${evidence.out.length} names)`, outBad.length === 0, outBad.map(o => o.name).join(', '))
  const arch = new Map()
  for (const r of evidence.archive) if (r.window === 'in') arch.set(r.venue, (arch.get(r.venue) ?? 0) + r.n)
  const gm = names71.filter(n => (arch.get(n) ?? 0) !== sol.counts.get(n).games)
  check('the archive rows saved here carry, per name, the games the counts record gives', gm.length === 0, gm.slice(0, 4).map(n => `${n}: ${arch.get(n) ?? 0} vs ${sol.counts.get(n).games}`).join(', '))
  const dup = rowsOf(sol).map(r => r.name).filter((n, i, a) => a.indexOf(n) !== i)
  check('no name is built twice', dup.length === 0, dup.join(', '))
  // The roof searches' zero-hit answers are only worth anything if the same searches can find a roof: five articles outside the spec whose saved search has a hit
  // (and, where a quote is given, that hit's text), then each of the four forms with a hit somewhere on the saved pages.
  const ctl = evidence.controls ?? []
  const ctlBad = ctl.filter(c => { const r = sol.ix.roof.get(`${c.title}|${c.form}`); return !r || r.state !== 'answered' || !(r.totalhits > 0) || (c.quote && !has(unesc(r.text), c.quote)) })
  check(`the roof searches find a roof where there is one (checked ${ctl.length - ctlBad.length} of ${ctl.length} controls)`, ctl.length > 0 && ctlBad.length === 0, ctlBad.map(c => `${c.title}|${c.form}`).join(', '))
  const forms = ['RC', 'PHRASE', 'PARAM', 'SUP']
  const silent = forms.filter(f => ![...sol.ix.roof].some(([k, v]) => k.endsWith(`|${f}`) && v.state === 'answered' && v.totalhits > 0))
  check(`each of the four roof search forms has a hit on some saved page (${forms.length - silent.length} of ${forms.length} forms)`, silent.length === 0, silent.join(', '))
  // The finding the record states about Wikidata's P5624 stands on the saved pages: a label that is no roof, every saved claim read of it empty, and a search
  // for the items that carry it whose whole hits read "stainless steel".
  const p5 = p5624Of(evidence.pages)
  check(`the saved Wikidata pages say P5624 is no roof property: its label${p5.label ? ` is "${p5.label}"` : ' is not saved'}, ${p5.reads.filter(r => r.parsed && r.claims === 0).length} of ${p5.reads.length} saved claim reads of it are empty, and the search for the items that carry it counts ${p5.totalhits ?? 'nothing on the saved page'}, with ${p5.whole.filter(h => h.steel).length} of ${p5.whole.length} hits shown whole reading stainless steel`, p5624Holds(p5), [...p5.reads.filter(r => !r.parsed || r.claims !== 0).map(r => r.qid), ...p5.whole.filter(h => !h.steel).map(h => h.qid)].join(', '))
  const rows = rowsOf(sol)
  const exp = [...rows.map(fsRow)]
  const got = handBlock(venuesText)
  check(`src/Venues.fs holds exactly the derived rows between its hand-row markers (${exp.length} rows)`, !!got && JSON.stringify(got) === JSON.stringify(exp), got ? `${got.length} rows in the file; first difference: ${exp.find((r, i) => got[i] !== r) ?? '(count)'}` : 'markers missing')
  const tab = suiteRows(suiteText), want = suiteTable(sol).map(l => l.replace(/\s+$/, ''))
  check('src/Suite.fs holds exactly the derived table between its markers', !!tab && JSON.stringify(tab) === JSON.stringify(want), tab ? `${tab.length} lines in the file; first difference: ${want.find((r, i) => tab[i] !== r) ?? '(count)'}` : 'markers missing')
  const generated = venuesText.split('// --- BEGIN sourced')[1] ?? ''
  const clash = rows.filter(r => generated.includes(`at ${JSON.stringify(r.name)} `)).map(r => r.name)
  check('no built name is also a row of the generated block', clash.length === 0, clash.join(', '))
  const bn = sol.built.filter(b => !b.problems.length && !b.named)
  return { sol, rows, flagged: bn.length }
}

// --- the report ----------------------------------------------------------------------------------------------------------------------

export const readInputs = o => ({
  evidence: loadEvidence(o.evidence ?? EVIDENCE), results: JSON.parse(readFileSync(RESULTS, "utf8")), countsText: readFileSync(COUNTS, "utf8"),
  venuesText: readFileSync(o.venues ?? VENUES, "utf8"), suiteText: readFileSync(o.suite ?? SUITE, "utf8"),
})

/** The checks as data: [{name, pass, detail}], so a doctored copy can be judged without printing. */
export const judge = i => {
  const results = []
  const r = runChecks((name, pass, detail) => results.push({ name, pass: Boolean(pass), detail }), i.evidence, i.results, i.countsText, i.venuesText, i.suiteText)
  return { results, ...r }
}

export const header = (sol, rows, evidence) => {
  const built = sol.built.filter(b => b.row), roofs = {}
  for (const b of built) roofs[b.roof.roof] = (roofs[b.roof.roof] ?? 0) + 1
  return [
    "HAND ROWS OF 2026-11-12: what the saved pages, the sourcing run and the archive give. Reads committed files only; no network.",
    `COVERAGE: ${sol.ix.pages} saved pages read; ${sol.built.length} spec entries resolved (${built.length} to a row), ${sol.aliases.length} alias, ${evidence.out.length} names left out, ${rows.length} rows in all; ${sol.counts.size} of 71 names accounted for. Zones are read, not recomputed (geo-tz is not a dependency).`,
    `ROOFS: ${Object.entries(roofs).map(([k, v]) => `${v} ${k}`).join(", ")} among the ${built.length} built grounds (the alias row copies its ground's roof); ${built.filter(b => b.roof.readings?.length || b.roof.leadReading).length} read by hand (a roof hit on a saved search, or a roof word after the lead's first sentence)`,
    `FLAGS: ${built.filter(b => flagsOf(b).length).length} of ${built.length} rows carry at least one flag computed from the saved pages; ${built.filter(b => b.identity.untied.length).length} have a home the archive lists that no needle ties; ${built.filter(b => !b.named).length} have an OpenStreetMap witness whose label carries neither the venue string nor the article title`,
    "",
  ]
}

// --- the finding about Wikidata's P5624, read from the same saved pages and committed files ----------------------------------------------------

export const CACHE = 'outbox/venue-source-cache.json'
export const FITC = 'outbox/cc-session-2026-11-09-fit-c.md'
export const SOURCE = 'scripts/venue-source.mjs'

/** What the saved Wikidata pages say about property P5624, about the items that carry it, and about the claims of the items the rows rest on.
 *  The saved search page stops where the page reader stopped, so it is not whole JSON (it does not parse): its head is read by pattern, as `hitsOf` reads the
 *  roof searches' pages. `named` are the items it names, `whole` the hits whose object closes on the page, each with the first snippet line that reads "stainless steel". */
export const p5624Of = pages => {
  const entries = Object.entries(pages)
  const ent = entries.find(([u]) => /wbgetentities/.test(u) && /[?&]ids=P5624(&|$)/.test(u))
  const e = ent ? json(ent[1])?.entities?.P5624 : null
  const sea = entries.find(([u]) => /list=search/.test(u) && /haswbstatement:P5624/.test(u))
  const sb = sea ? String(sea[1]) : ''
  const total = /"totalhits":(\d+)/.exec(sb)
  const named = [...sb.matchAll(/"title":"(Q\d+)"/g)].map(m => m[1])
  const whole = [...sb.matchAll(/\{"ns":0,"title":"(Q\d+)"[^{}]*?"snippet":"((?:[^"\\]|\\.)*)"[^{}]*\}/g)].map(m => ({ qid: m[1], steel: unesc(m[2]).split('\n').find(l => /stainless steel/i.test(l)) ?? null }))
  const reads = entries.filter(([u]) => /wbgetclaims/.test(u) && /property=P5624/.test(u)).map(([u, b]) => {
    const j = json(b)
    return { qid: /entity=(Q\d+)/.exec(u)?.[1] ?? null, parsed: j != null, claims: j ? Object.keys(j.claims ?? {}).length : null }
  })
  return {
    label: e?.labels?.en?.value ?? null, description: e?.descriptions?.en?.value ?? null, datatype: e?.datatype ?? null,
    totalhits: total ? Number(total[1]) : null, chars: sb.length, cut: sb.length > 0 && json(sb) == null, named, whole,
    reads,
  }
}
/** What the record says about P5624 stands only if the saved pages say it: a label that is no roof, every saved claim read empty, a count of the items that carry it
 *  (no smaller than the hits the page names), and every hit shown whole reading "stainless steel". The check and the record's guard both call it. */
export const p5624Holds = p => !!p.label && !/roof/i.test(p.label) && p.reads.length > 0 && p.reads.every(r => r.parsed && r.claims === 0)
  && Number.isInteger(p.totalhits) && p.named.length > 0 && p.totalhits >= p.named.length && p.whole.length > 0 && p.whole.every(h => h.steel)

/** The sourcing run's cached answers to the SPARQL of `roofOf`: how many, how many answered, how many carry a roof, how many carry the article. */
export const cacheRoofCounts = path => {
  const c = JSON.parse(readFileSync(path, 'utf8')), ks = Object.keys(c).filter(k => k.startsWith('wd-roof|'))
  const bind = k => c[k].result?.value?.results?.bindings?.[0]
  const ok = ks.filter(k => c[k].result?.ok === true)
  return { entries: ks.length, answered: ok.length, withRoof: ok.filter(k => bind(k)?.roofLabel).length, withArticle: ok.filter(k => bind(k)?.article).length }
}
/** The count the 2026-11-09 session recorded for the same answers, read from its document; refuses if the document no longer says it. */
export const fitcCount = path => {
  const m = /^19\. Wikidata's roof \(P5624\) is null on all (\d+) cached `wd-roof\|` answers, so Wikidata names no roof for any row/m.exec(readFileSync(path, 'utf8'))
  if (!m) throw new Error(`${path} no longer holds the sentence the record quotes`)
  return Number(m[1])
}
/** Where the sourcing script asks for P5624: the SPARQL pattern and the basis text, and the rule's own sentence on what it combines (refused if the script no longer says it). */
export const sourceSites = path => {
  const t = readFileSync(path, 'utf8')
  const m = /\* Combine (Wikidata P5624, the Wikipedia lead and the Roof field of the article's infobox)\./.exec(t)
  if (!m) throw new Error(`${path} no longer holds the sentence the record quotes`)
  return { query: t.split('wdt:P5624').length - 1, basis: t.split('wikidata P5624').length - 1, combines: m[1] }
}

// --- the record the owner reads ---------------------------------------------------------------------------------------------------------------

const cell = s => String(s).replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim()
const pl = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const sortName = (a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })

/** The record: answer first, then the rows, what to read before saying keep, the names left out, the roofs read by hand, how it was checked, what is not established. */
export const recordOf = (sol, evidence, extra) => {
  const { counts } = sol
  const fails = extra.checks.filter(c => !c.pass)
  if (fails.length) throw new Error(`no record for rows the checks do not hold: ${fails.map(c => c.name).join('; ')}`)
  const p5 = p5624Of(evidence.pages)
  if (!p5624Holds(p5)) throw new Error('the saved pages do not say what the record says about P5624')
  if (extra.cache.answered !== extra.cache.entries || extra.cache.withRoof !== 0) throw new Error(`the cache does not say what the record says: ${extra.cache.answered} of ${extra.cache.entries} answered, ${extra.cache.withRoof} with a roof`)
  const rows = [...sol.built, ...sol.aliases].filter(b => b.row).sort((a, b) => sortName(a.name, b.name))
  const grounds = sol.built.filter(b => b.row)
  const names = [...counts.keys()]
  const sum = (ns, k) => ns.reduce((n, x) => n + (counts.get(x)?.[k] ?? 0), 0)
  const outs = evidence.out.map(o => o.name)
  const lines = []
  const out = (...l) => lines.push(...l)
  out(`# Task 4, "Yes to all": hand rows for the review venues (2026-11-12)`, '')
  out(`**Result.** ${rows.length} rows are built for your keep or revert: ${pl(grounds.length, 'ground')} and ${pl(sol.aliases.filter(a => a.row).length, 'more spelling')} of a ground the table already has (${sol.aliases.filter(a => a.row).map(a => `${a.name}, which takes ${a.alias.of}'s row`).join('; ')}). They carry ${sum(rows.map(b => b.name), 'games')} of the ${sum(names, 'games')} games and ${sum(rows.map(b => b.name), 'days')} of the ${sum(names, 'days')} venue-days of the ${names.length} review names with no row. ${pl(outs.length, 'name')} get${outs.length === 1 ? 's' : ''} no row (${sum(outs, 'games')} games, ${sum(outs, 'days')} venue-days), each with its reason below.`, '')
  out('**What you decide.** Say keep, or name the rows to revert. A row you do not name stays. `docs/CC-CMD-2026-11-09-venue-review-remainder.md` keeps Task 4 PARTIAL until you have, as it did for Manadon Sports Hub.', '')
  out(`The evidence for each row is the comment above it in \`src/Venues.fs\` (between the markers \`BEGIN hand rows 2026-11-12\` and \`END hand rows 2026-11-12\`). This record summarises it and lists what to read first.`, '')

  out(`## The ${rows.length} rows`, '', 'Games and days are the archive\'s, 2026-07-01..2026-11-11, from `outbox/venue-review-counts-2026-11-12.md`. "Sources" are the families that agreed on the point.', '')
  out('| name | games | days | point | roof | zone | sources |', '|---|---|---|---|---|---|---|')
  for (const b of rows) {
    const c = counts.get(b.name), r = b.row
    out(`| ${cell(b.name)} | ${c.games} | ${c.days} | ${r.lat.toFixed(4)}, ${r.lon.toFixed(4)} | ${CASE[r.roof]} | ${r.zone} | ${b.alias ? `the row of ${cell(b.alias.of)}` : cell(b.decision.agreeing.join(' + '))} |`)
  }
  out('')

  const flagged = grounds.map(b => ({ b, flags: flagList(b) })).filter(x => x.flags.length)
  const tier = t => flagged.flatMap(x => x.flags.filter(f => f.tier === t).map(f => ({ name: x.b.name, text: f.text }))).sort((a, b) => sortName(a.name, b.name))
  out('## Read these before saying keep', '', `${flagged.length} of the ${grounds.length} grounds carry at least one flag. Every flag is computed from the saved pages; none is typed. Tier A is a thin point or a thin tie between the archive's name and the ground. Tier B is what a map or an article calls the ground when it differs from the archive's string. Tier C is a roof word the rule's first-sentence read does not see, read by hand (the next section).`, '')
  for (const [t, title] of [['A', 'Tier A'], ['B', 'Tier B']]) {
    const fl = tier(t)
    out(`### ${title}: ${pl(fl.length, 'flag')} on ${pl(new Set(fl.map(f => f.name)).size, 'row')}`, '', '| name | flag |', '|---|---|')
    for (const f of fl) out(`| ${cell(f.name)} | ${cell(f.text)} |`)
    out('')
  }

  const readings = grounds.flatMap(b => [...(b.roof.readings ?? []).map(r => ({ name: b.name, where: `${FORM_NAME[r.form]} search`, ...r })), ...(b.roof.leadReading ? [{ name: b.name, where: 'lead, after the first sentence', ...b.roof.leadReading }] : [])])
  out(`## Roofs read by hand (Tier C): ${pl(readings.length, 'reading')} on ${pl(new Set(readings.map(r => r.name)).size, 'row')}`, '', 'The rule reads the first sentence of the lead. Where a search of the article body found a roof phrase, or the lead has a roof word after its first sentence, a person read it. Each quote is found on a saved page by the verifier.', '')
  out('| name | where | class | quote | why |', '|---|---|---|---|---|')
  for (const r of readings.sort((a, b) => sortName(a.name, b.name))) out(`| ${cell(r.name)} | ${r.where} | ${r.class} | ${cell(r.quote)} | ${cell(r.why)} |`)
  out('')

  out(`## The ${outs.length} names left out`, '', 'Each stays out with the reason and the quotes the verifier finds on saved pages. Nothing is built for them.', '', '| name | games | days | reason |', '|---|---|---|---|')
  for (const o of [...evidence.out].sort((a, b) => sortName(a.name, b.name))) out(`| ${cell(o.name)} | ${counts.get(o.name).games} | ${counts.get(o.name).days} | ${cell(o.why)} |`)
  out('')

  out('## How it was checked', '', `\`node outbox/venue-hand-rows-2026-11-12.mjs\` read only committed files and printed (full output in \`outbox/venue-hand-rows-2026-11-12.txt\`):`, '', '```')
  for (const c of extra.checks) out(`PASS  ${c.name}`)
  out(`${extra.checks.length}/${extra.checks.length} checks passed`, '```', '')
  out(`Coverage: ${sol.ix.pages} saved pages read, ${sol.built.length} spec entries resolved to ${grounds.length} rows, ${sol.aliases.length} alias, ${outs.length} names left out, ${names.length} of 71 names accounted for. The same script judges ${extra.selfTest ?? 'its'} doctored copies of its inputs, each caught by the check it was aimed at (\`outbox/venue-hand-rows-selftest-2026-11-12.txt\`). \`scripts/mutation-check.mjs\` holds four entries that break one of the rows in \`src/Venues.fs\` and expect the F# suite to fail. A second script, \`outbox/venue-hand-rows-selftest-teeth-2026-11-12.mjs\`, breaks copies of the verifier itself and requires the self-test to report each break (\`outbox/venue-hand-rows-selftest-teeth-2026-11-12.txt\`).`, '')

  out('## What is not established', '')
  out('- That the saved pages are what the services answer today. They are the page reader\'s answers of 2026-11-12, kept in `outbox/venue-hand-rows-evidence-2026-11-12.json`; the verifier asks no service.')
  out('- That the selectors and the name needles pick the right object. A person chose each, and the verifier checks that each is found on a saved page; it cannot check that the page is about the right ground. That is what the flags and your reading are for.')
  out('- That nothing the session read and did not keep contradicts a row. The evidence file keeps the pages that the rows and the reasons cite; the page reader\'s other answers of the session were not kept.')
  out(`- The zones. They are read from the evidence file (geo-tz/all ${evidence.zoneTool.replace(/^geo-tz\/all /, '')}), not recomputed by this verifier. Open-Meteo's own zone for each row's point was read before the commit and equals the declared zone for every row (outbox/venue-hand-rows-open-meteo-zones-2026-11-12.txt; read through a page-fetch tool, not from a runner). scripts/weather-live-check.mjs then compares the declared zone of every row of the table with Open-Meteo's own: verify runs it tolerant of an unreachable service and prints "checked N of M venues", and the daily sentinel runs it strict.`)
  out('- The class given to each roof reading (Tier C). It is a person\'s reading of the quote; the verifier checks that the quote is on a saved page, not that the reading is right.')
  out('- That a card at any of these grounds shows a weather chip. No rendered page was read.')
  out('- Anything forward. The counts are past; a cup tie or a qualifying round does not recur on a schedule.')
  out('')

  out('## Found outside this scope (Rule 69): the roof rule\'s Wikidata step reads a property that is not a roof', '')
  out(`\`roofOf\` asks Wikidata for \`wdt:P5624\` (${pl(extra.sites.query, 'site')} in \`scripts/venue-source.mjs\`; its basis text \`wikidata P5624 "..."\` appears ${pl(extra.sites.basis, 'time')}). The saved Wikidata page for that property (\`wbgetentities\`, 2026-11-12) says its English label is "${p5.label}", its datatype is \`${p5.datatype}\` and its description is "${p5.description}".`, '')
  out(`- ${pl(p5.reads.length, 'saved claim read')} of P5624, on ${pl(new Set(p5.reads.map(r => r.qid)).size, 'Wikidata item')}, every one empty (\`{"claims":{}}\`).`)
  out(`- A Wikidata search for the items that carry P5624 counts ${p5.totalhits}. The saved page holds ${p5.chars} characters${p5.cut ? ` and stops inside hit ${p5.whole.length + 1}, so it is not whole JSON` : ''}: it names ${p5.named.join(', ')} and shows ${p5.whole.length} whole, ${p5.whole.map(h => `${h.qid} (snippet line "${h.steel}")`).join(' and ')}.`)
  out(`- The sourcing run's committed cache (\`${CACHE}\`) holds ${extra.cache.entries} answers to that SPARQL: ${extra.cache.answered} answered, ${extra.cache.withArticle} carry the Wikipedia article, ${extra.cache.withRoof} carry a roof.`)
  out(`- \`${FITC}\` (item 19) recorded the same null (${extra.fitc} answers then) and read it as "Wikidata names no roof for any row".`)
  out('')
  out(`So Wikidata gave no roof for any of the ${extra.cache.answered} items the sourcing run asked about. The rule's own comment in \`scripts/venue-source.mjs\` says it combines "${extra.sites.combines}"; one of the three has been empty in every cached answer, and the property it reads is the one labelled above. Not probed here: which Wikidata property, if any, carries a stadium's roof. That is the first step of Task 5 in \`docs/CC-CMD-2026-11-09-venue-review-remainder.md\`, which changes no rule and no row until you approve it.`, '')

  out('## Reproduce', '', '```', 'cd /home/claude/field-laboratory && npm run build', 'node outbox/venue-hand-rows-2026-11-12.mjs | cmp - outbox/venue-hand-rows-2026-11-12.txt', 'node outbox/venue-hand-rows-2026-11-12.mjs record | cmp - outbox/venue-hand-rows-2026-11-12.md', 'node outbox/venue-hand-rows-2026-11-12.mjs --self-test | cmp - outbox/venue-hand-rows-selftest-2026-11-12.txt', 'node outbox/venue-hand-rows-selftest-teeth-2026-11-12.mjs | cmp - outbox/venue-hand-rows-selftest-teeth-2026-11-12.txt', 'node outbox/venue-hand-rows-2026-11-12.mjs rows   # the block between the markers in src/Venues.fs', 'node outbox/venue-hand-rows-2026-11-12.mjs suite  # the table between the markers in src/Suite.fs', '```', '')
  return lines.join('\n')
}

// --- the self-test: the same judgement on doctored copies of its own inputs ----------------------------------------------------------------------
// Rule 90: a check that has only ever passed has proven nothing. Each case below breaks one thing the checks exist to catch, asserts that the break was
// applied (the copy differs from the original, and a text anchor is in the text exactly once), and then requires the check the case is aimed at to fail.
// A copy the verifier crashes on is not caught; it is a fault in the verifier and is reported as such.

const must = (cond, msg) => { if (!cond) throw new Error(`self-test anchor: ${msg}`) }
const times = (text, s) => text.split(s).length - 1
const editText = (text, from, to) => { must(times(text, from) === 1, `"${from.slice(0, 70)}" is in the text ${times(text, from)} times, not once`); return text.replace(from, () => to) }
const editLine = (text, pred, f, what) => {
  const ls = text.split('\n'), at = ls.map((l, k) => (pred(l) ? k : -1)).filter(k => k >= 0)
  must(at.length === 1, `${what} matches ${at.length} lines, not one`)
  ls[at[0]] = f(ls[at[0]])
  return ls.join('\n')
}
const editPageAt = (ev, url, f) => {
  must(url && ev.pages[url] != null, `no saved page ${String(url).slice(0, 80)}`)
  const j = JSON.parse(ev.pages[url]), before = JSON.stringify(j)
  f(j)
  must(JSON.stringify(j) !== before, 'the edit left the page as it was')
  ev.pages[url] = JSON.stringify(j)
}
/** For a saved page that is not whole JSON (the P5624 search page stops where the page reader stopped): the edit is made on its text. */
const editPageString = (ev, url, f) => {
  must(url && ev.pages[url] != null, `no saved page ${String(url).slice(0, 80)}`)
  const before = ev.pages[url], after = f(before)
  must(after !== before, 'the edit left the page as it was')
  ev.pages[url] = after
}
const editMatch = (text, re, f, what) => { const n = [...text.matchAll(re)].length; must(n === 1, `${what} matches ${n} times, not once`); return text.replace(re, f) }
const p5624SearchUrl = ev => Object.keys(ev.pages).find(x => /list=search/.test(x) && /haswbstatement:P5624/.test(x))

export const selfTestCases = (i, ix) => {
  const pageOf = (title) => ix.extract.get(title)?.url
  const osmPage = key => ix.osm.get(key)?.url
  const dropWord = (title, word) => ev => editPageAt(ev, pageOf(title), j => {
    const p = j.query.pages.find(x => x.title === title); must(p, `no page ${title} in its extract answer`)
    p.extract = p.extract.replace(new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), 'the ground')
    must(!has(p.extract, word), `"${word}" is still in the lead of ${title}`)
  })
  const ven = (c, f) => { c.venuesText = f(c.venuesText) }
  const handLine = (name, f) => c => ven(c, t => editLine(t, l => l.trim().startsWith(`at ${JSON.stringify(name)} `), f, `the hand row of ${name}`))
  return [
    { id: 'point-moved', check: 'every spec entry resolves to a row', claim: 'the OpenStreetMap point of Allianz Stadium moved 0.05 degrees, so no second family agrees with Wikipedia',
      apply: c => editPageAt(c.evidence, osmPage('R1642536'), j => { const o = j.find(x => x.osm_type[0].toUpperCase() + x.osm_id === 'R1642536'); must(o, 'no object R1642536'); o.lat = String(Number(o.lat) + 0.05) }) },
    { id: 'name-gone-from-lead', check: 'every spec entry resolves to a row', claim: 'the lead of "Juventus Stadium" no longer says "Allianz Stadium", and nothing else ties the archive\'s name to it',
      apply: c => dropWord('Juventus Stadium', 'Allianz Stadium')(c.evidence) },
    { id: 'team-gone-from-lead', check: 'every spec entry resolves to a row', claim: 'the lead of "Cornaredo Stadium" no longer says "Lugano", and no competition needle ties the ground',
      apply: c => dropWord('Cornaredo Stadium', 'Lugano')(c.evidence) },
    { id: 'reading-deleted', check: 'every spec entry resolves to a row', claim: 'the reading of the roof phrase on Goodison Park\'s article is deleted, so a hit has no reading',
      apply: c => { const n = c.evidence.readings.length; c.evidence.readings = c.evidence.readings.filter(r => !(r.title === 'Goodison Park' && r.form === 'PHRASE')); must(c.evidence.readings.length === n - 1, 'no reading of Goodison Park PHRASE') } },
    { id: 'reading-quote-wrong', check: 'every spec entry resolves to a row', claim: 'the quote of that reading is a sentence that is not on the saved page',
      apply: c => { const r = c.evidence.readings.find(x => x.title === 'Goodison Park' && x.form === 'PHRASE'); must(r, 'no reading of Goodison Park PHRASE'); r.quote = 'a retractable roof that the saved page does not carry' } },
    { id: 'lead-reading-flipped', check: 'every spec entry resolves to a row', claim: 'the reading of Parken\'s lead says open while its search hit says the roof retracts',
      apply: c => { const r = c.evidence.readings.find(x => x.title === 'Parken Stadium' && x.form === 'LEAD'); must(r && r.class === 'retractable', 'no retractable LEAD reading of Parken Stadium'); r.class = 'open' } },
    { id: 'lead-reading-deleted', check: 'every spec entry resolves to a row', claim: 'Medinah\'s lead has a roof word after its first sentence and its reading is deleted',
      apply: c => { const n = c.evidence.readings.length; c.evidence.readings = c.evidence.readings.filter(r => !(r.title === 'Medinah Country Club' && r.form === 'LEAD')); must(c.evidence.readings.length === n - 1, 'no LEAD reading of Medinah Country Club') } },
    { id: 'zone-changed', check: 'src/Venues.fs holds exactly the derived rows', claim: 'the saved zone of Rodney Parade is changed, so the evidence derives a row the file does not hold',
      apply: c => { must(c.evidence.zones['Rodney Parade'].zone === 'Europe/London', 'Rodney Parade zone is not Europe/London'); c.evidence.zones['Rodney Parade'].zone = 'Europe/Paris' } },
    { id: 'zone-for-another-point', check: 'every spec entry resolves to a row', claim: 'the saved zone of Rodney Parade was computed for a point 0.001 degrees from the row\'s',
      apply: c => { c.evidence.zones['Rodney Parade'].lat = Math.round((c.evidence.zones['Rodney Parade'].lat + 0.001) * 1e4) / 1e4 } },
    { id: 'zone-against-the-run', check: 'every spec entry resolves to a row', claim: 'De Kuip\'s zone is Europe/Brussels, which is what geo-tz\'s default entry says and not what the sourcing run recorded (the mistake made on 2026-11-12)',
      apply: c => { must(c.evidence.zones['De Kuip'].zone === 'Europe/Amsterdam', 'De Kuip zone is not Europe/Amsterdam'); c.evidence.zones['De Kuip'].zone = 'Europe/Brussels' } },
    { id: 'out-quote-not-on-page', check: 'every name left out has a one-line reason and a quote found on a saved page', claim: 'a quote under a left-out name is text that is not on its saved page',
      apply: c => { c.evidence.out[0].quotes[0].text = 'text that no saved page carries' } },
    { id: 'out-deleted', check: 'every name of the 71 is a row or has a reason, once', claim: 'a left-out name loses its entry, so it is neither a row nor out',
      apply: c => { const n = c.evidence.out.length; c.evidence.out = c.evidence.out.filter(o => o.name !== 'RAMS Park'); must(c.evidence.out.length === n - 1, 'no out entry RAMS Park') } },
    { id: 'spec-deleted', check: 'every name of the 71 is a row or has a reason, once', claim: 'the spec entry of Rodney Parade is deleted, so the name is neither a row nor out',
      apply: c => { const n = c.evidence.spec.length; c.evidence.spec = c.evidence.spec.filter(s => s.name !== 'Rodney Parade'); must(c.evidence.spec.length === n - 1, 'no spec entry Rodney Parade') } },
    { id: 'spec-duplicated', check: 'no name is built twice', claim: 'the spec entry of Rodney Parade appears twice',
      apply: c => { c.evidence.spec.push(structuredClone(c.evidence.spec.find(s => s.name === 'Rodney Parade'))) } },
    { id: 'archive-games', check: 'the archive rows saved here carry, per name, the games the counts record gives', claim: 'one saved archive row of Allianz Stadium carries one more game',
      apply: c => { const r = c.evidence.archive.find(x => x.venue === 'Allianz Stadium' && x.window === 'in'); must(r, 'no in-window archive row of Allianz Stadium'); r.n += 1 } },
    { id: 'counts-games', check: 'the archive rows saved here carry, per name, the games the counts record gives', claim: 'the counts record gives Allianz Stadium one more game than the archive rows',
      apply: c => { c.countsText = editLine(c.countsText, l => / \| Allianz Stadium \| /.test(l), l => { const m = /^(\| \d+ \| .+? \| .+? \| .+? \| )(\d+)( \| .*)$/.exec(l); must(m, 'the counts line of Allianz Stadium has an unexpected shape'); return `${m[1]}${Number(m[2]) + 1}${m[3]}` }, 'the counts line of Allianz Stadium') } },
    { id: 'pages-disagree', check: 'the saved pages agree wherever two of them answer one question', claim: 'a second saved page answers the same OpenStreetMap object with a point 0.01 degrees away',
      apply: c => { const u = osmPage('R1642536'), n = Object.keys(c.evidence.pages).length; const j = JSON.parse(c.evidence.pages[u]); const o = j.find(x => x.osm_type[0].toUpperCase() + x.osm_id === 'R1642536'); must(o, 'no object R1642536'); o.lat = String(Number(o.lat) + 0.01); c.evidence.pages[`${u}&selftest=disagree`] = JSON.stringify([o]); must(Object.keys(c.evidence.pages).length === n + 1, 'the extra page was not added') } },
    { id: 'alias-no-shared-opponent', check: 'every alias row copies a row the table has and is backed by archive rows', claim: 'the opponents of the alias\'s games are renamed, so no opponent has games under both spellings',
      apply: c => { let k = 0; for (const r of c.evidence.aliasSeries) if (r.venue === 'Chase Field (NH)') { r.away = `Nobody ${k++}` } must(k > 0, 'no alias rows') } },
    { id: 'alias-source-row-gone', check: 'every alias row copies a row the table has and is backed by archive rows', claim: 'the table has no row for Chase Field, which the alias copies',
      apply: c => ven(c, t => editLine(t, l => l.trim().startsWith('at "Chase Field" '), () => '', 'the row of Chase Field')) },
    { id: 'venues-roof', check: 'src/Venues.fs holds exactly the derived rows', claim: 'the hand row of Allianz Stadium says Dome',
      apply: handLine('Allianz Stadium', l => l.replace(' OpenAir ', ' Dome ')) },
    { id: 'venues-moved', check: 'src/Venues.fs holds exactly the derived rows', claim: 'the hand row of Allianz Stadium is 0.001 degrees east',
      apply: handLine('Allianz Stadium', l => l.replace(' 7.6416 ', ' 7.6426 ')) },
    { id: 'venues-row-deleted', check: 'src/Venues.fs holds exactly the derived rows', claim: 'the hand row of Rodney Parade is deleted',
      apply: handLine('Rodney Parade', () => '') },
    { id: 'venues-twin-in-generated', check: 'no built name is also a row of the generated block', claim: 'the generated block gains a row named AIL Arena',
      apply: c => ven(c, t => editText(t, '      at "Acrisure Bounce House" ', '      at "AIL Arena" 46.0235 8.9610 OpenAir "Europe/Zurich"\n      at "Acrisure Bounce House" ')) },
    { id: 'suite-table-changed', check: 'src/Suite.fs holds exactly the derived table', claim: 'the Suite table says Dome for Allianz Stadium',
      apply: c => { c.suiteText = editText(c.suiteText, '"Allianz Stadium", 45.1095, 7.6416, Weather.OpenAir', '"Allianz Stadium", 45.1095, 7.6416, Weather.Dome') } },
    { id: 'suite-markers-gone', check: 'src/Suite.fs holds exactly the derived table', claim: 'the Suite table\'s begin marker is spelled differently, so the table is not found',
      apply: c => { c.suiteText = editText(c.suiteText, '// --- BEGIN hand rows table 2026-11-12', '// --- BEGAN hand rows table 2026-11-12') } },
    { id: 'control-hit-removed', check: 'the roof searches find a roof where there is one', claim: 'the saved search for Safeco Field\'s combined roof pattern answers with no hit',
      apply: c => editPageAt(c.evidence, ix.roof.get('Safeco Field|RC')?.url, j => { j.query.searchinfo.totalhits = 0; j.query.search = [] }) },
    { id: 'p5624-claim-appears', check: 'the saved Wikidata pages say P5624 is no roof property', claim: 'one saved claim read of P5624 carries a claim',
      apply: c => { const u = Object.keys(c.evidence.pages).find(x => /wbgetclaims/.test(x) && /property=P5624/.test(x)); editPageAt(c.evidence, u, j => { j.claims = { P5624: [{ mainsnak: {} }] } }) } },
    { id: 'p5624-search-count-lost', check: 'the saved Wikidata pages say P5624 is no roof property', claim: 'the saved search for the items that carry P5624 no longer holds a count',
      apply: c => editPageString(c.evidence, p5624SearchUrl(c.evidence), t => editText(t, '"totalhits":9', '"totalhits":"nine"')) },
    { id: 'p5624-hit-reads-stadium', check: 'the saved Wikidata pages say P5624 is no roof property', claim: 'the first hit of the saved search for the items that carry P5624 reads as a stadium, not as stainless steel',
      apply: c => editPageString(c.evidence, p5624SearchUrl(c.evidence), t => editMatch(t, /("title":"Q28453931"[^{}]*?"snippet":")((?:[^"\\]|\\.)*)(")/g, (_, a, b, d) => `${a}Anfield stadium${d}`, 'the first hit\'s snippet')) },
  ]
}

/** Judges the untouched inputs, then every case; returns the printed lines and whether every case was caught by the check it was aimed at. */
export const selfTest = i => {
  const lines = [], ix = indexPages(i.evidence.pages)
  const base = judge(i), baseFail = base.results.filter(r => !r.pass)
  lines.push(`untouched inputs: ${base.results.length - baseFail.length} of ${base.results.length} checks pass${baseFail.length ? `; failing: ${baseFail.map(r => r.name).join('; ')}` : ''}`, '')
  const origEv = JSON.stringify(i.evidence)
  let caught = 0, bad = 0
  const cases = selfTestCases(i, ix)
  for (const k of cases) {
    const c = { evidence: structuredClone(i.evidence), results: i.results, countsText: i.countsText, venuesText: i.venuesText, suiteText: i.suiteText }
    let verdict, other = []
    try {
      k.apply(c)
      const changed = JSON.stringify(c.evidence) !== origEv || c.countsText !== i.countsText || c.venuesText !== i.venuesText || c.suiteText !== i.suiteText
      if (!changed) verdict = 'NOT APPLIED: the copy equals the original, so nothing was tested'
      else {
        const r = judge(c), failing = r.results.filter(x => !x.pass)
        const aimed = failing.find(x => x.name.includes(k.check))
        other = failing.filter(x => x !== aimed).map(x => x.name)
        verdict = aimed ? 'CAUGHT' : `NOT CAUGHT by "${k.check}"${failing.length ? `; failing instead: ${failing.map(x => x.name).join('; ')}` : '; no check failed'}`
      }
    } catch (e) { verdict = `CRASHED: ${e.message}` }
    if (verdict === 'CAUGHT') caught++
    else bad++
    lines.push(`${verdict === 'CAUGHT' ? 'CAUGHT ' : 'FAILED '} ${k.id}: ${k.claim}`)
    if (verdict === 'CAUGHT') lines.push(`         by "${k.check}"${other.length ? `; also failing: ${other.length}` : ''}`)
    else lines.push(`         ${verdict}`)
  }
  lines.push('', `${caught} of ${cases.length} doctored copies caught by the check each was aimed at; ${bad} problem(s).`)
  lines.push('NOT exercised here: whether a saved page is what its service answers today (the pages are kept answers, nothing is fetched); whether a selector or a name needle picks the right ground (a person chose them; only their presence on a saved page is checked); the zones\' correctness (read, never recomputed); the classes in the roof readings (a person\'s reading; only the quote\'s presence is checked); that the F# suite fails on a doctored src/Venues.fs row (that is what the four scripts/mutation-check.mjs entries for these rows are for); the sourcing run\'s results file (never doctored here).')
  return { lines, ok: bad === 0 && baseFail.length === 0 }
}

const flagValue = (name, argv) => { const k = argv.indexOf(name); return k >= 0 ? argv[k + 1] : undefined }

if (isMain(import.meta.url)) {
  const argv = process.argv.slice(2)
  const o = { evidence: flagValue("--evidence", argv), venues: flagValue("--venues", argv), suite: flagValue("--suite", argv) }
  const mode = argv.includes("--self-test") ? "selftest" : argv.find(a => ["rows", "suite", "record"].includes(a)) ?? "report"
  const i = readInputs(o)
  if (mode === "rows") console.log(rowsBlock(solve(i.evidence, i.results, i.countsText, i.venuesText)))
  else if (mode === "suite") console.log(suiteTable(solve(i.evidence, i.results, i.countsText, i.venuesText)).join("\n"))
  else if (mode === "record") {
    const j = judge(i)
    const st = selfTest(i)
    console.log(recordOf(j.sol, i.evidence, { checks: j.results, cache: cacheRoofCounts(CACHE), fitc: fitcCount(FITC), sites: sourceSites(SOURCE), selfTest: selfTestCases(i, j.sol.ix).length, selfTestOk: st.ok }))
  } else if (mode === "selftest") {
    const st = selfTest(i)
    console.log(st.lines.join("\n"))
    process.exit(st.ok ? 0 : 1)
  } else {
    const { check, summarize } = createChecks()
    const { sol, rows } = runChecks(check, i.evidence, i.results, i.countsText, i.venuesText, i.suiteText)
    console.log(header(sol, rows, i.evidence).join("\n"))
    finish(summarize())
  }
}
