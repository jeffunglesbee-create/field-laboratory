// The Roof field of each venue's Wikipedia infobox, and the article's categories, read for
// every article the roof rule reads: a measurement, no decision.
//
// docs/CC-CMD-2026-11-09-venue-review-remainder.md, Task 2, the owner's ruling "Option 3"
// (2026-11-09 12:16 ET): a second, structured source for the roof, so that a row whose lead
// the first-sentence read cuts at an initial (U.S. Bank Stadium: "U.S.") gets a roof from
// evidence that does not depend on how a sentence is split. The CC-CMD left that source
// "unmeasured, needing a runner probe first". This is the probe. It writes neither the
// sourcing results, nor the cache, nor the table.
//
// HOW THE INFOBOX IS READ. MediaWiki's own preprocessor has already cut the wikitext into
// templates and parameters; `action=parse&prop=parsetree&section=0` returns that tree as XML,
// one request per article. The XML is read with a real XML parser and the parameters whose NAME
// contains "roof" are kept (scripts/venue-infobox-read.mjs, which the roof rule shares). Nothing
// here reads prose or parses wikitext.
// The categories come from `action=query&prop=categories`, fifty titles to a request.
//
// THE PREMISES, AND THE ONE COMMAND THAT TESTS EACH (PREMISE-FIRST-A)
//   1. "The template is called `Infobox stadium`."  REFUTED on 2026-11-09, before this file
//      was written: U.S. Bank Stadium's is `Infobox venue` (the API output, fetched through
//      the Exa tool). So no template name is assumed: every top-level template whose title
//      starts with "Infobox" is kept, and the titles are counted in the output.
//   2. "MediaWiki escapes the XML it returns (`&lt;/ref&gt;` in <close>, `&amp;nbsp;`)."
//      Tested on the runner by the parser itself: a parse error, or a document whose root is
//      not <root>, is recorded against the article with the head and tail of the text, and
//      the whole trees of the five controls are committed. A copy of the source made the
//      sample the fixtures follow; the runner's raw print is what confirms it.
//   3. "An error page is not read as 'no infobox'."  An HTML page is well-formed XML, so it
//      parses without complaint; the root check is what stops it (self-test, and a mutation).
//   4. "The articles read here are the articles the roof rule reads."  The titles are
//      derived exactly as `roofOf` derives them and compared with the cache's `wp-lead|`
//      keys; the two differences are printed.
//   5. "A missing Roof parameter says something about the roof."  NOT ASSUMED. It is a
//      column in the cross-tab and never a value.
//
// COVERAGE IS PRINTED, NOT IMPLIED (Rule 91). Every stage names its denominator. What this
// cannot say: whether an infobox is right or current (the revision id is recorded and nothing
// is checked against the building), and nothing about the value text beyond what the flat form
// keeps; the `raw` XML of every roof parameter is committed so that reading can be redone
// without another run.
//
// Usage:  node scripts/venue-infobox.mjs --self-test           (no network)
//         node scripts/venue-infobox.mjs                       (runner: reads Wikipedia, ~400 requests)
//         node scripts/venue-infobox.mjs --report FILE.json    (no network: the text report of a committed run)

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { retryWait } from './venue-source.mjs'
import { API, parseUrl, answerText, readTree } from './venue-infobox-read.mjs'
import { createChecks, finish, isMain } from './checks.mjs'

export const UA = 'field-laboratory-venue-infobox/1.0 (github.com/jeffunglesbee-create/field-laboratory; reads the Roof field of venue articles for the roof rule)'
export const GAP_MS = 1000
export const BATCH = 50
export const RESULTS = 'outbox/venue-source-results-latest.json'
export const CACHE = 'outbox/venue-source-cache.json'
export const OUT_JSON = 'outbox/venue-infobox-probe.json'
export const OUT_TXT = 'outbox/venue-infobox-probe.txt'
/** The five rows the Task 2 record is about. Looked up BY NAME in the results; one that is not there is said so. */
export const CONTROLS = ['U.S. Bank Stadium', 'Parken Stadium', 'Center Parc Stadium', 'Joan C. Edwards Stadium', 'NRG Stadium']
const sleep = ms => new Promise(r => setTimeout(r, ms))

// --- which articles --------------------------------------------------------------------------

export const rowsOf = results => [
  ...results.accepted.map(r => ({ ...r, status: 'accepted' })),
  ...results.review.map(r => ({ ...r, status: 'review' })),
]

/** The title the roof rule reads for a qid, derived as `roofOf` derives it (scripts/venue-source.mjs): the text after /wiki/ in the cached wd-roof-p1552 answer's sitelink. */
export const titleOf = (cache, qid) => {
  if (!qid) return { title: null, why: 'no qid' }
  const entry = cache[`wd-roof-p1552|${qid}`]
  if (!entry) return { title: null, why: 'no cached wd-roof-p1552 answer' }
  const title = (entry.result?.value?.results?.bindings?.[0] ?? {}).article?.value?.split('/wiki/')[1]
  return title ? { title, why: null } : { title: null, why: 'wikidata names no English article' }
}

export const population = (results, cache) => {
  const rows = rowsOf(results).map(r => ({
    name: r.name, qid: r.qid ?? null, status: r.status, currentRoof: r.roof ?? null, basis: r.roofBasis ?? null, ...titleOf(cache, r.qid),
  }))
  const titles = [...new Set(rows.filter(r => r.title).map(r => r.title))]
  const leadKeys = Object.keys(cache).filter(k => k.startsWith('wp-lead|')).map(k => k.slice('wp-lead|'.length))
  const here = new Set(titles), there = new Set(leadKeys)
  return { rows, titles, leadKeys: leadKeys.length, onlyHere: titles.filter(t => !there.has(t)), onlyCache: leadKeys.filter(t => !here.has(t)) }
}

// --- the network --------------------------------------------------------------------------------

/** GET json with the repository's retry policy (`retryWait`: a 429 waits what Retry-After asks), recording every attempt so that a slow run is measured and not guessed at. */
export const getRecorded = async (url, { fetchImpl = fetch, wait = sleep } = {}) => {
  const attempts = []
  let why = null
  for (let n = 0; n < 4; n++) {
    const t0 = Date.now()
    try {
      const res = await fetchImpl(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(25000) })
      attempts.push({ status: res.status, ms: Date.now() - t0 })
      if (res.status === 429 || res.status >= 500) { why = `HTTP ${res.status}`; await wait(retryWait(res.headers.get('retry-after'), n)); continue }
      if (!res.ok) return { ok: false, why: `HTTP ${res.status}`, attempts }
      try { return { ok: true, value: await res.json(), attempts } } catch (e) { return { ok: false, why: `HTTP ${res.status}, not JSON: ${e.message}`, attempts } }
    } catch (e) {
      attempts.push({ status: 0, ms: Date.now() - t0 })
      why = `request failed: ${e.message}`
      await wait(3000)
    }
  }
  return { ok: false, why, attempts }
}

/** One answer of the parse call into the article's record. `keep` is called with the whole tree text for the controls. */
export const readArticle = (r, keep = () => {}) => {
  const ms = r.attempts.reduce((s, a) => s + a.ms, 0)
  const got = { ok: false, ms, attempts: r.attempts.length }
  if (!r.ok) return { fetch: { ...got, why: r.why } }
  const v = r.value
  const a = answerText(v)
  if (!a.ok) return { fetch: { ...got, why: a.why } }
  const text = a.text
  keep(text)
  const t = readTree(text)
  const base = { fetch: { ...got, ok: true }, title: v.parse.title ?? null, revid: v.parse.revid ?? null, redirects: (v.parse.redirects ?? []).map(x => `${x.from} -> ${x.to}`) }
  return t.ok
    ? { ...base, parse: { ok: true, errors: t.errors }, templates0: t.templates0, infoboxes: t.infoboxes }
    : { ...base, parse: { ok: false, why: t.why, errors: t.errors, head: text.slice(0, 400), tail: text.slice(-200) } }
}

// --- categories ---------------------------------------------------------------------------------

export const categoryUrl = (titles, cont = null) =>
  `${API}?action=query&prop=categories&clprop=hidden&cllimit=max&redirects=1&format=json&titles=${titles.join('|')}` +
  (cont ? Object.entries(cont).map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join('') : '')

/** Fold one category answer into `acc` ({ pages: title -> record, alias: from -> to }); continuation answers repeat a page with more of its categories. */
export const mergeCategories = (acc, data) => {
  for (const p of Object.values(data.query?.pages ?? {})) {
    const a = (acc.pages[p.title] ??= { visible: [], hidden: 0, missing: false })
    if ('missing' in p) a.missing = true
    for (const c of p.categories ?? []) { if ('hidden' in c) a.hidden++; else a.visible.push(c.title.replace(/^Category:/, '')) }
  }
  for (const x of [...(data.query?.normalized ?? []), ...(data.query?.redirects ?? [])]) acc.alias[x.from] = x.to
  return acc
}

/** The record for one of OUR titles ("U.S._Bank_Stadium", percent-encoded as the sitelink has it): normalised, then followed through a redirect. */
export const categoriesFor = (acc, title) => {
  let t = decodeURIComponent(title)
  for (let hop = 0; hop < 3 && acc.alias[t] !== undefined; hop++) t = acc.alias[t]
  return acc.pages[t] ?? null
}

// --- the run ------------------------------------------------------------------------------------

export const run = async ({ results, cache, fetchJson, wait = sleep, now = () => Date.now(), progress = () => {} }) => {
  const pop = population(results, cache)
  const articles = {}, controlTrees = {}
  const controlTitles = Object.fromEntries(CONTROLS.map(n => [n, pop.rows.find(r => r.name === n)?.title ?? null]))
  const keepFor = title => { const c = CONTROLS.find(n => controlTitles[n] === title); return c ? text => { controlTrees[c] = text } : () => {} }
  const catAcc = { pages: {}, alias: {} }
  const started = now()
  let fatal = null
  const catAttempts = []
  try {
    let i = 0
    for (const title of pop.titles) {
      if (i++) await wait(GAP_MS)
      articles[title] = readArticle(await fetchJson(parseUrl(title)), keepFor(title))
      if (i % 25 === 0 || i === pop.titles.length) progress(`${i} of ${pop.titles.length} articles`)
    }
    for (let b = 0; b < pop.titles.length; b += BATCH) {
      const batch = pop.titles.slice(b, b + BATCH)
      let cont = null
      do {
        await wait(GAP_MS)
        const r = await fetchJson(categoryUrl(batch, cont))
        catAttempts.push(...r.attempts)
        if (!r.ok) throw new Error(`the category request failed: ${r.why}`)
        mergeCategories(catAcc, r.value)
        cont = r.value.continue ?? null
      } while (cont)
    }
    for (const title of pop.titles) articles[title].categories = categoriesFor(catAcc, title)
  } catch (e) {
    fatal = String(e.stack ?? e).slice(0, 600)
  }
  const requests = Object.values(articles).reduce((n, a) => n + a.fetch.attempts, 0) + catAttempts.length
  return {
    at: new Date(started).toISOString(), run: process.env.GITHUB_RUN_ID ?? null, complete: fatal === null, fatal,
    source: { parse: `${API}?action=parse&page=T&prop=parsetree|revid&section=0&redirects=1&format=json`, categories: `${API}?action=query&prop=categories&clprop=hidden&cllimit=max&redirects=1&format=json&titles=T1|T2|...` },
    elapsedMs: now() - started, population: { titles: pop.titles.length, leadKeys: pop.leadKeys, onlyHere: pop.onlyHere, onlyCache: pop.onlyCache },
    controls: controlTitles, rows: pop.rows, articles, controlTrees, requests,
  }
}

// --- reading a run ------------------------------------------------------------------------------

const tally = (xs, key = x => x) => {
  const m = new Map()
  for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + 1)
  return [...m].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
}
const roofName = r => r.currentRoof ?? 'review (no roof)'
/** What the roof parameter of one article is: the state a row sits in. */
export const stateOf = a => {
  if (!a) return 'not requested'
  if (!a.fetch?.ok) return 'fetch failed'
  if (!a.parse?.ok) return 'parse failed'
  if (!a.infoboxes.length) return 'no infobox'
  const roofs = a.infoboxes.flatMap(i => i.roof)
  return !roofs.length ? 'infobox, no roof parameter' : roofs.every(r => r.flat === '') ? 'roof parameter empty' : 'roof parameter present'
}

export const analyze = out => {
  const rows = out.rows, arts = out.articles
  const withTitle = rows.filter(r => r.title)
  const titles = Object.keys(arts)
  const okFetch = titles.filter(t => arts[t].fetch.ok)
  const okParse = okFetch.filter(t => arts[t].parse.ok)
  const infoboxed = okParse.filter(t => arts[t].infoboxes.length)
  const states = tally(withTitle, r => stateOf(arts[r.title]))
  const cross = tally(withTitle, r => `${stateOf(arts[r.title])}\t${roofName(r)}`)
  const values = new Map()
  for (const r of withTitle) {
    for (const i of arts[r.title]?.infoboxes ?? []) for (const x of i.roof) {
      const v = values.get(x.flat) ?? { n: 0, byRoof: new Map(), names: [], params: new Set(), templates: new Set() }
      v.n++; v.byRoof.set(roofName(r), (v.byRoof.get(roofName(r)) ?? 0) + 1); v.names.push(r.name); v.params.add(x.param); v.templates.add(i.template)
      values.set(x.flat, v)
    }
  }
  const catRows = withTitle.filter(r => arts[r.title]?.categories && !arts[r.title].categories.missing)
  const ROOFISH = /roof|dome|skylit|indoor|covered|enclosed|retractable|open-air/i
  const cats = new Map()
  for (const r of catRows) for (const c of new Set(arts[r.title].categories.visible)) {
    if (!ROOFISH.test(c)) continue
    const v = cats.get(c) ?? { n: 0, byRoof: new Map() }
    v.n++; v.byRoof.set(roofName(r), (v.byRoof.get(roofName(r)) ?? 0) + 1)
    cats.set(c, v)
  }
  return { rows, withTitle, titles, okFetch, okParse, infoboxed, states, cross, values, catRows, cats, ROOFISH }
}

export const verdict = out => {
  const a = analyze(out)
  const problems = []
  if (!out.complete) problems.push(`the run did not complete: ${out.fatal}`)
  if (a.okFetch.length < a.titles.length) problems.push(`${a.titles.length - a.okFetch.length} of ${a.titles.length} articles were not fetched`)
  if (a.okParse.length < a.okFetch.length) problems.push(`${a.okFetch.length - a.okParse.length} of ${a.okFetch.length} fetched trees did not parse`)
  const noCats = a.withTitle.filter(r => !out.articles[r.title]?.categories || out.articles[r.title].categories.missing).length
  if (noCats) problems.push(`${noCats} of ${a.withTitle.length} rows with an article have no category answer`)
  return { code: problems.length ? 1 : 0, problems }
}

const pad = (s, n) => String(s).padEnd(n)
export const report = out => {
  const a = analyze(out), L = []
  const arts = out.articles
  const noArt = tally(a.rows.filter(r => !r.title), r => r.why)
  L.push(`venue-infobox probe, run ${out.run ?? 'local'}, ${out.at}, ${out.complete ? 'complete' : `INCOMPLETE: ${out.fatal}`}; ${out.requests} requests in ${Math.round(out.elapsedMs / 1000)} s`)
  L.push(`COVERAGE: checked ${a.withTitle.length} of ${a.rows.length} rows (the rows whose Wikidata entry names an English article); the other ${a.rows.length - a.withTitle.length}: ${noArt.map(([w, n]) => `${w} ${n}`).join(', ') || 'none'}`)
  L.push(`  articles: ${a.titles.length} titles; fetched ${a.okFetch.length} of ${a.titles.length}; parsed ${a.okParse.length} of ${a.okFetch.length}; parsed with parser errors ${a.okParse.filter(t => arts[t].parse.errors.length).length} of ${a.okParse.length}`)
  L.push(`  the rule's wp-lead cache keys: ${out.population.leadKeys}; titles only here ${out.population.onlyHere.length}${out.population.onlyHere.length ? ` (${out.population.onlyHere.slice(0, 5).join(', ')})` : ''}; keys only in the cache ${out.population.onlyCache.length}`)
  L.push(`  an Infobox template in ${a.infoboxed.length} of ${a.okParse.length} parsed articles; categories answered for ${a.catRows.length} of ${a.withTitle.length} rows`)
  const failed = a.titles.filter(t => !arts[t].fetch.ok || !arts[t].parse?.ok)
  for (const t of failed) L.push(`  NOT READ  ${t}: ${arts[t].fetch.ok ? arts[t].parse.why : arts[t].fetch.why}`)
  L.push('')
  L.push('ROW STATE (rows with an article), the roof parameter of the infobox:')
  for (const [s, n] of a.states) L.push(`  ${pad(s, 30)} ${n}`)
  L.push('')
  L.push('ROW STATE by the roof the sourcing rule has now (accepted or review), rows:')
  const roofs = [...new Set(a.rows.map(roofName))].sort()
  L.push(`  ${pad('', 30)} ${roofs.map(r => pad(r, 18)).join('')}`)
  for (const [s] of a.states) L.push(`  ${pad(s, 30)} ${roofs.map(r => pad(a.cross.find(([k]) => k === `${s}\t${r}`)?.[1] ?? 0, 18)).join('')}`)
  L.push('')
  const tpls = tally(a.okParse.flatMap(t => arts[t].infoboxes.map(i => i.template)))
  L.push(`INFOBOX TEMPLATES (every top-level template whose title starts with Infobox), ${tpls.reduce((s, [, n]) => s + n, 0)} in ${a.infoboxed.length} articles:`)
  for (const [t, n] of tpls) L.push(`  ${pad(JSON.stringify(t), 40)} ${n}`)
  const pn = tally(a.okParse.flatMap(t => arts[t].infoboxes.flatMap(i => i.roof.map(x => x.param))))
  L.push('')
  L.push(`ROOF PARAMETER NAMES (a name containing "roof", case-blind), ${pn.reduce((s, [, n]) => s + n, 0)} parameters:`)
  for (const [t, n] of pn) L.push(`  ${pad(JSON.stringify(t), 40)} ${n}`)
  L.push('')
  L.push(`ROOF VALUES, ${a.values.size} distinct (flat text; the raw XML is in the JSON), by the roof the rule has now:`)
  for (const [v, x] of [...a.values].sort((p, q) => q[1].n - p[1].n || p[0].localeCompare(q[0]))) {
    L.push(`  ${pad(JSON.stringify(v), 56)} ${String(x.n).padStart(3)}  ${[...x.byRoof].map(([r, n]) => `${r} ${n}`).join(', ')}${x.n <= 3 ? `  [${x.names.join('; ')}]` : ''}`)
  }
  L.push('')
  L.push(`CATEGORIES whose name matches ${a.ROOFISH} (visible categories only; all of them are in the JSON), ${a.cats.size} distinct, over ${a.catRows.length} rows:`)
  for (const [c, x] of [...a.cats].sort((p, q) => q[1].n - p[1].n || p[0].localeCompare(q[0]))) L.push(`  ${pad(c, 64)} ${String(x.n).padStart(3)}  ${[...x.byRoof].map(([r, n]) => `${r} ${n}`).join(', ')}`)
  L.push('')
  L.push('CONTROLS (the five rows the Task 2 record is about):')
  for (const name of CONTROLS) {
    const t = out.controls[name], row = a.rows.find(r => r.name === name)
    if (!row) { L.push(`  ${pad(name, 26)} NOT IN THE RESULTS`); continue }
    if (!t) { L.push(`  ${pad(name, 26)} no article (${row.why})`); continue }
    const art = arts[t]
    const found = (art?.infoboxes ?? []).flatMap(i => i.roof.map(x => `${x.param}=${JSON.stringify(x.flat)}`))
    const cs = (art?.categories?.visible ?? []).filter(c => a.ROOFISH.test(c))
    L.push(`  ${pad(name, 26)} rule now: ${roofName(row)} | ${stateOf(art)}${found.length ? ` | ${found.join('; ')}` : ''}${cs.length ? ` | categories: ${cs.join('; ')}` : ''}`)
  }
  const ts = Object.values(arts).flatMap(x => (x.fetch ? [x.fetch.ms] : [])).sort((p, q) => p - q)
  const q = p => ts[Math.min(ts.length - 1, Math.floor(ts.length * p))] ?? 0
  L.push('')
  L.push(`TIMING per article request, ms including retries: median ${q(0.5)}, 95th ${q(0.95)}, max ${ts.at(-1) ?? 0}; requests needing more than one attempt: ${Object.values(arts).filter(x => x.fetch?.attempts > 1).length}`)
  return L.join('\n')
}

// --- self-test: fixtures, then the run against a fake network -----------------------------------

const part = (name, value) => `<part><name>${name}</name><equals>=</equals><value>${value}</value></part>`
const tpl = (title, parts, lineStart = true) => `<template${lineStart ? ' lineStart="1"' : ''}><title>${title}</title>${parts.join('')}</template>`
const treeOf = (...inner) => `<root>${inner.join('\n')}</root>`
const REF = '<ext><name>ref</name><attr/><inner>{{cite web|url=https://example.org/?a=1&amp;b=2|title=Wilfs}}</inner><close>&lt;/ref&gt;</close></ext>'
/** U.S. Bank Stadium's section 0 as the API returned it on 2026-11-09, long references shortened. A copy of the source, seen through the Exa fetch tool (which decodes entities once more than the API writes them, so the escapes here are MediaWiki's own `&lt;` and `&amp;`, as the runner's raw print of the five controls will confirm or refute). */
const USBANK = `<root><template><title>Short description</title><part><name index="1"/><value>Stadium in Minneapolis, Minnesota</value></part></template>\n<template lineStart="1"><title>Use mdy dates</title><part><name>date</name><equals>=</equals><value>October 2025</value></part></template>\n<template lineStart="1"><title>Infobox venue\n</title><part><name> name </name><equals>=</equals><value> U.S. Bank Stadium\n</value></part><part><name> nickname </name><equals>=</equals><value> ''The Ship''&lt;br /&gt;''The Bank''\n</value></part><part><name> coordinates </name><equals>=</equals><value> <template><title>Coord</title><part><name index="1"/><value>44.974</value></part><part><name index="2"/><value>N</value></part><part><name>display</name><equals>=</equals><value>inline,title</value></part></template>\n</value></part><part><name> surface </name><equals>=</equals><value> Act Global Xtreme Turf DX<ext><name>ref</name><attr/><inner>{{Cite web |title=Vikings switching to turf}}</inner><close>&lt;/ref&gt;</close></ext>\n</value></part><part><name> roof </name><equals>=</equals><value> [[Skylight]]\n</value></part><part><name> cost </name><equals>=</equals><value> [[United States dollar|$]]1.061&amp;nbsp;billion<ext><name>ref</name><attr> name="Cost"</attr><inner>{{cite news |title=Wilfs pledge}}</inner><close>&lt;/ref&gt;</close></ext>\n</value></part></template>\n'''U.S. Bank Stadium''' is an [[indoor stadium]] in [[Minneapolis]], Minnesota, U.S. Opened in 2016.</root>`

const selfTest = async () => {
  const { check, summarize } = createChecks()
  const names = r => r.infoboxes.map(i => i.template)

  // The tree, from the copy of the real response.
  const u = readTree(USBANK)
  check('the real sample parses with no parser error', u.ok && u.errors.length === 0, JSON.stringify(u).slice(0, 200))
  check('the sample: top-level templates, in order, are the three the page has', JSON.stringify(u.templates0) === JSON.stringify(['Short description', 'Use mdy dates', 'Infobox venue']), JSON.stringify(u.templates0))
  const ub = u.infoboxes[0]
  check('the sample: the infobox is "Infobox venue" and its parameter names are the ones written, trimmed', ub?.template === 'Infobox venue' && ub.params.join(',') === 'name,nickname,coordinates,surface,roof,cost', ub?.params.join(','))
  check('the sample: the roof parameter is read as [[Skylight]], and the raw XML is the serialised part', ub?.roof.length === 1 && ub.roof[0].param === 'roof' && ub.roof[0].flat === '[[Skylight]]' && ub.roof[0].raw === '<part><name> roof </name><equals>=</equals><value> [[Skylight]]\n</value></part>', JSON.stringify(ub?.roof))
  check('the sample: a nested template (Coord) and a reference are not roof parameters', ub.roof.every(x => x.param === 'roof'))

  // Other shapes of page.
  const none = readTree(treeOf(tpl('Short description', [part('1', 'x')]), 'The lead.'))
  check('a page with no infobox is read, with none found, and its other templates listed', none.ok && none.infoboxes.length === 0 && none.templates0.join() === 'Short description')
  const two = readTree(treeOf(tpl('Infobox NRHP\n', [part(' name ', ' A\n')]), tpl('Infobox venue\n', [part(' roof ', ' Fixed\n')])))
  check('two Infobox templates: both are read, and the roof is the second one\'s', two.ok && names(two).join() === 'Infobox NRHP,Infobox venue' && two.infoboxes[0].roof.length === 0 && two.infoboxes[1].roof[0].flat === 'Fixed', JSON.stringify(two.infoboxes.map(i => i.roof.length)))
  const variants = readTree(treeOf(tpl('Infobox stadium', [part('Roof', ' Dome'), part(' roof_type ', ' Retractable'), part(' capacity ', ' 50,000 (the roof covers 20,000)')])))
  check('a capitalised Roof and a roof_type are both recorded; a value that mentions a roof under another name is not', variants.infoboxes[0].roof.map(x => x.param).join() === 'Roof,roof_type', variants.infoboxes[0].roof.map(x => x.param).join())
  const nested = readTree(treeOf(tpl('Infobox venue', [part(' roof ', ` {{nowrap|Retractable}}${REF}\n`.replace('{{nowrap|Retractable}}', '<template><title>nowrap</title><part><name index="1"/><value>Retractable</value></part></template>'))])))
  const nr = nested.infoboxes[0].roof[0]
  check('a roof value with a nested template and a reference: the text is "Retractable", the template and the ref are named, the ref text is out', nr.flat === 'Retractable' && nr.templates.join() === 'nowrap' && nr.exts.join() === 'ref', JSON.stringify(nr))
  const empty = readTree(treeOf(tpl('Infobox venue', [part(' roof ', ' \n')])))
  check('an empty roof value is recorded as present and empty', empty.infoboxes[0].roof.length === 1 && empty.infoboxes[0].roof[0].flat === '')
  const comm = readTree(treeOf(tpl('Infobox venue', [part(' roof ', ' Fixed<comment>&lt;!-- check --&gt;</comment>\n')])))
  check('a comment in a roof value is counted and its text left out', comm.infoboxes[0].roof[0].flat === 'Fixed' && comm.infoboxes[0].roof[0].comments === 1)
  const ent = readTree(treeOf(tpl('Infobox venue', [part(' roof ', ' Fixed&amp;nbsp;dome&lt;br /&gt;\n')])))
  check('the escapes are decoded once: &amp;nbsp; reads as the text &nbsp; and &lt;br /&gt; as <br />', ent.infoboxes[0].roof[0].flat === 'Fixed&nbsp;dome<br />', ent.infoboxes[0].roof[0].flat)

  // Things that must be failures and not "no infobox".
  const trunc = readTree(USBANK.slice(0, USBANK.indexOf('<part><name> roof ') + 20))
  check('a truncated tree is a failure, not "no infobox"', trunc.ok === false && /ParseError/.test(trunc.why), JSON.stringify(trunc).slice(0, 160))
  const html = readTree('<html><body>Too Many Requests</body></html>')
  check('an HTML error page, which is well-formed XML, is a failure and says its root', html.ok === false && /<html>/.test(html.why), JSON.stringify(html))
  const mism = readTree('<root><close></ref></close></root>')
  check('a tag that does not match is a failure', mism.ok === false)
  const raw = readTree(treeOf(tpl('Infobox venue', [part(' roof ', ' a&nbsp;b')])))
  check('a raw &nbsp; (not escaped) is read but the parser error is recorded', raw.ok && raw.errors.length === 1 && /nbsp/.test(raw.errors[0]), JSON.stringify(raw.errors))
  check('a part with no <value> is a failure', readTree('<root><template><title>Infobox venue</title><part><name>roof</name></part></template></root>').ok === false)

  // Which articles.
  const wd = (qid, article) => [`wd-roof-p1552|${qid}`, { at: 1, result: { ok: true, value: { results: { bindings: [article ? { article: { value: `https://en.wikipedia.org/wiki/${article}` } } : {}] } } } }]
  const cache = Object.fromEntries([wd('Q1', 'Alpha_Stadium'), wd('Q2', null), wd('Q4', 'Alpha_Stadium'), wd('Q5', 'Beta_Park'), ['wp-lead|Alpha_Stadium', { at: 1 }], ['wp-lead|Beta_Park', { at: 1 }], ['wp-lead|Stale_Ground', { at: 1 }]])
  check('a title is the text after /wiki/; no sitelink, no cached answer and no qid each say why', JSON.stringify([titleOf(cache, 'Q1'), titleOf(cache, 'Q2'), titleOf(cache, 'Q3'), titleOf(cache, null)]) === JSON.stringify([{ title: 'Alpha_Stadium', why: null }, { title: null, why: 'wikidata names no English article' }, { title: null, why: 'no cached wd-roof-p1552 answer' }, { title: null, why: 'no qid' }]))
  const results = { accepted: [{ name: 'U.S. Bank Stadium', qid: 'Q1', roof: 'open', roofBasis: 'inferred' }, { name: 'Twin Row', qid: 'Q4', roof: 'dome', roofBasis: 'x' }, { name: 'Beta', qid: 'Q5', roof: null }], review: [{ name: 'No Article', qid: 'Q2', roof: null }] }
  const pop = population(results, cache)
  check('two rows on one article are one title; the stale cache key and the title the cache lacks are both reported', pop.titles.join() === 'Alpha_Stadium,Beta_Park' && pop.rows.length === 4 && pop.onlyCache.join() === 'Stale_Ground' && pop.onlyHere.length === 0, JSON.stringify(pop.onlyCache))

  // The network layer, with a fake fetch.
  const res = (status, body, headers = {}) => ({ status, ok: status >= 200 && status < 300, headers: { get: k => headers[k] ?? null }, json: async () => { if (body === undefined) throw new Error('Unexpected token <'); return body } })
  const seq = (...rs) => { let i = 0; return async () => rs[i++] }
  const waits = []
  const rec = await getRecorded('u', { fetchImpl: seq(res(429, {}, { 'retry-after': '2' }), res(200, { a: 1 })), wait: ms => waits.push(ms) })
  check('a 429 is retried after the server\'s Retry-After, and both attempts are recorded', rec.ok && rec.attempts.map(a => a.status).join() === '429,200' && waits.join() === '2000', JSON.stringify([rec.attempts, waits]))
  const nj = await getRecorded('u', { fetchImpl: seq(res(200, undefined)), wait: () => {} })
  check('a 200 that is not JSON is a failure that says so, not a retry', !nj.ok && /not JSON/.test(nj.why) && nj.attempts.length === 1)
  const nf = await getRecorded('u', { fetchImpl: seq(res(404, {})), wait: () => {} })
  check('a 404 is a failure after one attempt', !nf.ok && nf.why === 'HTTP 404' && nf.attempts.length === 1)
  const five = await getRecorded('u', { fetchImpl: seq(res(503, {}), res(503, {}), res(503, {}), res(503, {})), wait: () => {} })
  check('a 503 four times is a failure after four attempts', !five.ok && five.attempts.length === 4 && five.why === 'HTTP 503')

  // One answer into a record.
  const ans = (value, ok = true) => ({ ok, value, why: ok ? undefined : 'HTTP 500', attempts: [{ status: 200, ms: 7 }] })
  check('an API error object is a fetch failure that names the code', /missingtitle/.test(readArticle(ans({ error: { code: 'missingtitle', info: 'gone' } })).fetch.why))
  check('an answer without a parse tree is a fetch failure', /no parsetree/.test(readArticle(ans({ parse: { title: 'X' } })).fetch.why))
  const good = readArticle(ans({ parse: { title: 'U.S. Bank Stadium', revid: 42, redirects: [{ from: 'A', to: 'B' }], parsetree: { '*': USBANK } } }))
  check('a good answer keeps the page title, the revision, the redirect and the infobox', good.fetch.ok && good.title === 'U.S. Bank Stadium' && good.revid === 42 && good.redirects[0] === 'A -> B' && good.infoboxes[0].roof[0].flat === '[[Skylight]]')
  const badTree = readArticle(ans({ parse: { title: 'X', parsetree: { '*': '<html><body>x</body></html>' } } }))
  check('a tree that does not parse is kept as a parse failure with its head and tail', badTree.fetch.ok && badTree.parse.ok === false && badTree.parse.head.includes('<html>'))

  // Categories.
  const acc = { pages: {}, alias: {} }
  mergeCategories(acc, { query: { normalized: [{ from: 'NRG_Stadium', to: 'NRG Stadium' }, { from: 'Gone_Page', to: 'Gone Page' }], redirects: [{ from: 'NRG Stadium', to: 'Reliant Stadium' }], pages: { 1: { title: 'Reliant Stadium', categories: [{ title: 'Category:NFL venues' }, { title: 'Category:Hidden thing', hidden: '' }] }, 2: { title: 'Gone Page', missing: '' } } } })
  mergeCategories(acc, { query: { pages: { 1: { title: 'Reliant Stadium', categories: [{ title: 'Category:Retractable-roof stadiums in the United States' }] } } } })
  const reliant = categoriesFor(acc, 'NRG_Stadium')
  check('a title that redirects finds the target\'s categories, merged across the continuation, hidden ones counted and not listed', reliant?.visible.join() === 'NFL venues,Retractable-roof stadiums in the United States' && reliant.hidden === 1, JSON.stringify(reliant))
  check('a percent-encoded title is decoded to find its page, and a page that is missing says so', categoriesFor({ pages: { 'Fréjus Arena': { visible: ['X'], hidden: 0, missing: false } }, alias: { 'Fréjus_Arena': 'Fréjus Arena' } }, 'Fr%C3%A9jus_Arena')?.visible.join() === 'X' && categoriesFor(acc, 'Gone_Page')?.missing === true)
  check('a title the API did not normalise is reported as having no answer, not guessed at by swapping its underscores', categoriesFor({ pages: { 'Alpha Stadium': { visible: ['X'], hidden: 0, missing: false } }, alias: {} }, 'Alpha_Stadium') === null)
  check('a continuation request carries both continue parameters, encoded', categoryUrl(['A', 'B'], { clcontinue: 'x|y', continue: '||' }).endsWith('titles=A|B&clcontinue=x%7Cy&continue=%7C%7C'), categoryUrl(['A', 'B'], { clcontinue: 'x|y', continue: '||' }))

  // The whole run, against a fake network.
  const serve = {
    Alpha_Stadium: { parse: { title: 'Alpha Stadium', revid: 1, redirects: [], parsetree: { '*': treeOf(tpl('Infobox venue', [part(' roof ', ' Retractable\n')])) } } },
    Beta_Park: { parse: { title: 'Beta Park', revid: 2, redirects: [], parsetree: { '*': treeOf(tpl('Short description', [part('1', 'x')])) } } },
  }
  const mk = (broken = {}) => async url => {
    const m = /page=([^&]+)/.exec(url)
    if (m) return broken[m[1]] ? { ok: false, why: 'HTTP 404', attempts: [{ status: 404, ms: 5 }] } : { ok: true, value: serve[m[1]], attempts: [{ status: 200, ms: 5 }] }
    const first = !/clcontinue/.test(url)
    // The API says how it normalised each title it was given, as the real one does ("U.S._Bank_Stadium" -> "U.S. Bank Stadium").
    const normalized = [{ from: 'Alpha_Stadium', to: 'Alpha Stadium' }, { from: 'Beta_Park', to: 'Beta Park' }]
    return { ok: true, attempts: [{ status: 200, ms: 5 }], value: first
      ? { continue: { clcontinue: 'z', continue: '||' }, query: { normalized, pages: { 1: { title: 'Alpha Stadium', categories: [{ title: 'Category:Retractable-roof stadiums in Europe' }] } } } }
      : { query: { normalized, pages: { 1: { title: 'Alpha Stadium', categories: [{ title: 'Category:NFL venues' }] }, 2: { title: 'Beta Park', categories: [{ title: 'Category:Parks' }] } } } } }
  }
  const out = await run({ results, cache, fetchJson: mk(), wait: async () => {}, now: () => 0 })
  const rep = report(out)
  const alpha = out.articles.Alpha_Stadium
  check('the run reads both articles, joins the categories across the continuation, and passes its own verdict', out.complete && alpha?.categories?.visible.join() === 'Retractable-roof stadiums in Europe,NFL venues' && verdict(out).code === 0, JSON.stringify(verdict(out)))
  check('the report names its denominators: rows with an article of all rows, parsed of fetched, infoboxes of parsed', /checked 3 of 4 rows/.test(rep) && /parsed 2 of 2/.test(rep) && /an Infobox template in 1 of 2 parsed articles/.test(rep) && /the other 1: wikidata names no English article 1/.test(rep), rep.split('\n').slice(0, 5).join(' | '))
  check('the report lists the roof value with the roof the rule has for it, and the control that is not in the results', /"Retractable"\s+2\s+open 1, dome 1/.test(rep) && /Parken Stadium\s+NOT IN THE RESULTS/.test(rep) && /U\.S\. Bank Stadium\s+rule now: open \| roof parameter present/.test(rep), rep.split('\n').filter(l => /Retractable|Parken|U\.S\. Bank/.test(l)).join(' | '))
  const broke = await run({ results, cache, fetchJson: mk({ Beta_Park: 1 }), wait: async () => {}, now: () => 0 })
  const bv = verdict(broke)
  check('an article that was not fetched makes the verdict a failure that says "1 of 2", and the report names it', bv.code === 1 && bv.problems.some(p => /1 of 2 articles were not fetched/.test(p)) && /NOT READ\s+Beta_Park: HTTP 404/.test(report(broke)), JSON.stringify(bv))
  const fatal = await run({ results, cache, fetchJson: async () => { throw new Error('boom') }, wait: async () => {}, now: () => 0 })
  check('an unexpected error ends the run as incomplete with the error kept, and the verdict fails', fatal.complete === false && /boom/.test(fatal.fatal) && verdict(fatal).code === 1)
  finish(summarize())
}

// --- main -------------------------------------------------------------------------------------

const main = async () => {
  const results = JSON.parse(readFileSync(RESULTS, 'utf8'))
  const cache = JSON.parse(readFileSync(CACHE, 'utf8'))
  const out = await run({ results, cache, fetchJson: getRecorded, progress: m => console.log(m) })
  mkdirSync('outbox', { recursive: true })
  writeFileSync(OUT_JSON, JSON.stringify(out, null, 1) + '\n')
  writeFileSync(OUT_TXT, report(out) + '\n')
  console.log(report(out))
  const v = verdict(out)
  for (const p of v.problems) console.log(`PROBLEM: ${p}`)
  process.exitCode = v.code
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--self-test')) await selfTest()
  else if (process.argv.includes('--report')) console.log(report(JSON.parse(readFileSync(process.argv[process.argv.indexOf('--report') + 1], 'utf8'))))
  else await main()
}
