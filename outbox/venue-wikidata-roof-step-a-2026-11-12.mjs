// Task 5, Step A (approved 2026-11-12, "Decisions: keep and approve", 20:42 ET): which Wikidata property, if any, carries a stadium's roof, and how
// many of the 396 items carry it. docs/CC-CMD-2026-11-09-venue-review-remainder.md, Task 5. Criteria 1 to 6 are quoted there, written before any data
// existed, and are not edited here. Rule 89: the artifact is this script's printed result and the record it generates.
//
// It reads committed files and nothing else, and uses no network and writes nothing (check G6 holds its own imports to that):
//   outbox/venue-wikidata-roof-evidence-2026-11-12.json   the pages the answers were read from, exactly as the page reader returned them, keyed by URL,
//                                                         plus the four attempts on Wikidata's query service that the reader refused
//   outbox/venue-source-cache.json                        the sourcing run's cache: the 396 `wd-roof|<QID>` answers
//   outbox/venue-source-results-latest.json               the run's own rows (the 9 names whose roof the rule leaves unsettled are its review rows
//                                                         whose reason begins "roof:")
//   outbox/venue-review-counts-2026-11-12.md              Step 1's record, which counts those 9 names (a tie, not an input to the verdict)
//   scripts/venue-source.mjs                              the sourcing rule's own `classifyRoof`, imported and not retyped
// No number in the record is typed in this file except ITEMS, the count Task 5 states for the cache's `wd-roof|` keys, which check C2b holds the cache
// to (a count taken from the same copy it checks cannot notice an item missing from it). Every other number is computed from those files, and the
// record is generated from the computation.
//
// WHY THE ITEMS' OWN STATEMENTS ARE NOT READ HERE. The shell cannot reach Wikidata, and the page reader that can refused the query service
// (4 attempts, in the evidence file under `unreadable`); reading each of the 396 items' claims one page at a time through the reader was not attempted.
// Criterion 1 does not need them: its candidates are what Wikidata's own property search returns, and criterion 2 reads the items for each
// candidate. The record says what that leaves unshown.
//
// Usage, from the repository root:
//   node outbox/venue-wikidata-roof-step-a-2026-11-12.mjs                the report; exits 1 unless every check holds
//   node outbox/venue-wikidata-roof-step-a-2026-11-12.mjs record         the record the owner reads (stdout)
//   node outbox/venue-wikidata-roof-step-a-2026-11-12.mjs --self-test    the same judgement on doctored copies of its inputs, each caught by the check aimed at it

import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { classifyRoof } from '../scripts/venue-source.mjs'
import { finish, isMain } from '../scripts/checks.mjs'

export const EVIDENCE = 'outbox/venue-wikidata-roof-evidence-2026-11-12.json'
export const CACHE = 'outbox/venue-source-cache.json'
export const RESULTS = 'outbox/venue-source-results-latest.json'
export const COUNTS = 'outbox/venue-review-counts-2026-11-12.md'
/** The items criterion 2 reads: Task 5's own count of the `wd-roof|` keys of the committed cache ("396 396 0" from the expression it quotes). */
export const ITEMS = 396
/** The files this probe must leave exactly as they are (criterion 6); the report prints their digests. */
export const PROTECTED = [RESULTS, CACHE, 'src/Venues.fs', 'scripts/venue-source.mjs']

const W = 'https://www.wikidata.org/w/api.php?'
const SEARCH = (term, type, limit, extra = '') => `${W}action=wbsearchentities&search=${term}&language=en&uselang=en&type=${type}&limit=${limit}${extra}&format=json`
const TEXT = term => `${W}action=query&list=search&srsearch=${term}&srnamespace=120&srlimit=50&srprop=snippet|titlesnippet&format=json&formatversion=2`
const BACK = (qid, extra = '') => `${W}action=query&list=backlinks&bltitle=${qid}&blnamespace=0${extra}&bllimit=500&format=json&formatversion=2`
const P31 = qid => `${W}action=query&list=search&srsearch=haswbstatement:P31=${qid}&srlimit=1&srprop=&format=json&formatversion=2`

/** Every page the evidence must hold: [id, url, shape]. The ids are what the checks and the doctored copies name. */
export const PAGES = [
  ['prop-roof', SEARCH('roof', 'property', 50), 'wbsearch'],
  ['prop-roof-strict', SEARCH('roof', 'property', 50, '&strictlanguage=0') + '&props=url', 'wbsearch'],
  ['prop-roof-shape', SEARCH('roof+shape', 'property', 50), 'wbsearch'],
  ['prop-retractable', SEARCH('retractable', 'property', 50), 'wbsearch'],
  ['prop-capacity', SEARCH('capacity', 'property', 5), 'wbsearch'],
  ['item-roof', SEARCH('roof', 'item', 5), 'wbsearch'],
  ['item-retractable-roof', SEARCH('retractable+roof', 'item', 10), 'wbsearch'],
  ['item-domed-stadium', SEARCH('domed+stadium', 'item', 10), 'wbsearch'],
  ['text-roof', TEXT('roof'), 'fulltext'],
  ['text-retractable', TEXT('retractable'), 'fulltext'],
  ['text-dome', TEXT('dome'), 'fulltext'],
  ['entities-labels', `${W}action=wbgetentities&ids=P5833|P5624&props=labels|descriptions|datatype|aliases&languages=en&format=json`, 'entities'],
  ['entities-claims-P5833', `${W}action=wbgetentities&ids=P5833&props=claims&format=json`, 'entities'],
  ['backlinks-retractable', BACK('Q7316894'), 'backlinks'],
  ['backlinks-domed', BACK('Q625797'), 'backlinks'],
  ['backlinks-retractable-redirects', BACK('Q7316894', '&blredirect=1'), 'backlinks'],
  ['backlinks-domed-redirects', BACK('Q625797', '&blredirect=1'), 'backlinks'],
  ['p31-retractable', P31('Q7316894'), 'count'],
  ['p31-domed', P31('Q625797'), 'count'],
]
export const urlOf = id => PAGES.find(p => p[0] === id)[1]

/** The two roof classes Wikidata has an item for, in the sourcing rule's own vocabulary: the term searched, the class `classifyRoof` must read it as. */
export const CLASSES = [
  { term: 'retractable roof', search: 'item-retractable-roof', want: 'retractable', pages: ['backlinks-retractable', 'backlinks-retractable-redirects'], p31: 'p31-retractable' },
  { term: 'domed stadium', search: 'item-domed-stadium', want: 'dome', pages: ['backlinks-domed', 'backlinks-domed-redirects'], p31: 'p31-domed' },
]

const SHAPES = {
  wbsearch: j => j && j.success === 1 && Array.isArray(j.search) && typeof j.searchinfo?.search === 'string',
  fulltext: j => j && j.batchcomplete === true && Array.isArray(j.query?.search) && Number.isInteger(j.query?.searchinfo?.totalhits),
  count: j => j && j.batchcomplete === true && Number.isInteger(j.query?.searchinfo?.totalhits),
  entities: j => j && j.success === 1 && j.entities && typeof j.entities === 'object',
  backlinks: j => j && j.batchcomplete === true && Array.isArray(j.query?.backlinks),
}

/** The API's own cap on a list for an ordinary account (its warning on the redirect-following pages: "must be between 1 and 250"). */
export const LIST_CAP = 250

const sameSet = (a, b) => [...new Set(a)].sort().join('|') === [...new Set(b)].sort().join('|')
const aboutRoof = c => /\broof/i.test(c?.description ?? '')
/** Every string value a statement or qualifier carries, wherever it sits in an entity's claims. */
const stringValues = x => {
  const out = []
  const walk = v => {
    if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') {
      if (v.datavalue && typeof v.datavalue.value === 'string') out.push(v.datavalue.value)
      Object.values(v).forEach(walk)
    }
  }
  walk(x)
  return out
}

/**
 * The whole judgement, on parsed inputs: { evidence, cache, results, counts, source, classifyRoof? }. It returns the checks (id, name, pass, detail),
 * the numbers the record prints, and the tables it prints. `classifyRoof` may be replaced so a check on the sourcing rule's patterns can be broken.
 */
export function analyse(inp) {
  const ev = inp.evidence
  const classify = inp.classifyRoof ?? classifyRoof
  const checks = [], num = {}
  const check = (id, name, pass, detail = '') => checks.push({ id, name, pass: Boolean(pass), detail })
  const parsed = id => { const p = ev.pages?.[urlOf(id)]; if (!p) return null; try { return JSON.parse(p.body) } catch { return null } }

  // --- the evidence itself ---------------------------------------------------------------------------------------------------------------
  const held = new Set(Object.keys(ev.pages ?? {}))
  const missing = PAGES.filter(p => !held.has(p[1])), extra = [...held].filter(u => !PAGES.some(p => p[1] === u))
  num.pagesHeld = PAGES.length - missing.length
  num.pagesExpected = PAGES.length
  check('E1', `the evidence holds every expected page and no other (checked ${num.pagesHeld} of ${num.pagesExpected} pages)`,
    !missing.length && !extra.length, `missing: ${missing.map(p => p[0]).join(', ') || 'none'}; unexpected: ${extra.length}`)
  const heldPages = PAGES.filter(p => ev.pages?.[p[1]])
  const badShape = heldPages.filter(([id, , shape]) => !SHAPES[shape](parsed(id))).map(p => p[0])
  num.pagesShaped = heldPages.length - badShape.length
  check('E2', `every held page parses as JSON and has the shape of its query (checked ${num.pagesShaped} of ${heldPages.length})`, !badShape.length, badShape.join(', '))
  const un = ev.unreadable ?? []
  num.unreadable = un.length
  check('E3', `each attempt on the query service is recorded as the reader's error code with no body (${un.length} attempts)`,
    un.length >= 1 && un.every(u => /^https:\/\/query\.wikidata\.org\/sparql\?/.test(u.url) && /^CRAWL_[A-Z_]+$/.test(u.error) && !('body' in u)),
    'an attempt lacks the query service host, an error code, or carries a body')

  // --- criterion 1: the candidates are what Wikidata's own property search returns for "roof" ---------------------------------------------
  const pr = parsed('prop-roof'), ps = parsed('prop-roof-strict'), tr = parsed('text-roof')
  check('C1a', 'the property search for "roof" answered (success 1, a list)', pr && pr.success === 1 && Array.isArray(pr.search), 'the page is not an answered list')
  const idsA = (pr?.search ?? []).map(h => h.id)
  const idsB = (ps?.search ?? []).map(h => h.id)
  const idsC = (tr?.query?.search ?? []).map(h => String(h.title).replace(/^Property:/, ''))
  check('C1b', 'the full-text search of the Property namespace for "roof" answered and every hit is shown',
    tr && !tr.continue && tr.query.searchinfo.totalhits === idsC.length, `totalhits ${tr?.query?.searchinfo?.totalhits}, shown ${idsC.length}, continue ${JSON.stringify(tr?.continue)}`)
  check('C1c', 'the strict-language variant of the property search lists the same ids as the first', sameSet(idsA, idsB), `first ${idsA.join(',') || 'none'}; variant ${idsB.join(',') || 'none'}`)
  const ent = parsed('entities-labels')?.entities ?? {}
  const readOf = id => ({ id, label: ent[id]?.labels?.en?.value, description: ent[id]?.descriptions?.en?.value, datatype: ent[id]?.datatype })
  const candIds = [...new Set([...idsA, ...idsB, ...idsC])]
  const cands = candIds.map(readOf)
  const unread = cands.filter(c => !(c.label && c.description && c.datatype))
  check('C1d', `every candidate has an English label, description and datatype from the entity read (checked ${cands.length - unread.length} of ${cands.length})`,
    !unread.length, unread.map(c => c.id).join(', '))
  const retained = cands.filter(aboutRoof), setAside = cands.filter(c => !aboutRoof(c))
  num.searchAnswers = { 'prop-roof': idsA.length, 'prop-roof-strict': idsB.length, 'text-roof': idsC.length }
  num.candidates = cands.length
  num.retained = retained.length
  num.setAside = setAside.length

  // --- controls: each search form can answer, and a hit that is set aside is explained -------------------------------------------------
  const cap = parsed('prop-capacity')?.search ?? []
  check('K1', 'the property search form returns properties: the control "capacity" lists some, each with a datatype',
    cap.length >= 1 && cap.every(h => /^P\d+$/.test(h.id) && h.datatype), `${cap.length} listed`)
  const itemRoof = parsed('item-roof')?.search ?? []
  check('K2', 'the word is searchable: the item search for "roof" lists an item labelled "roof"',
    itemRoof.some(h => /^Q\d+$/.test(h.id) && String(h.label).toLowerCase() === 'roof'), `${itemRoof.length} listed`)
  const dome = parsed('text-dome')
  const domeHits = dome?.query?.search ?? []
  check('K3', 'the full-text search form returns properties for a word they carry: "dome" lists some and every hit is shown',
    dome && domeHits.length >= 1 && !dome.continue && dome.query.searchinfo.totalhits === domeHits.length, `${domeHits.length} listed`)
  const explained = id => {
    const c = readOf(id)
    const claims = parsed('entities-claims-' + id)?.entities?.[id]?.claims
    return !aboutRoof(c) && !/\broof/i.test(c.label ?? '') && Boolean(claims) && stringValues(claims).some(v => /roof/i.test(v))
  }
  const toExplain = idsC.filter(id => !aboutRoof(readOf(id)))
  const explainedIds = toExplain.filter(explained)
  num.textHitsExplained = explainedIds.length
  check('K4', `a full-text hit that is set aside is explained by a value in its own statements, not by its label or description (checked ${explainedIds.length} of ${toExplain.length})`,
    explainedIds.length === toExplain.length, `unexplained: ${toExplain.filter(id => !explained(id)).join(', ')}`)

  // --- criterion 2: every one of the 396 items, for each candidate; and the property the rule reads today as the control -----------------
  const c = inp.cache ?? {}
  const keys = Object.keys(c).filter(k => k.startsWith('wd-roof|'))
  const qids = keys.map(k => k.slice('wd-roof|'.length))
  const S = new Set(qids)
  num.items = keys.length
  const required = retained.length * keys.length, made = 0   // no item-read page is expected or held: every candidate was set aside before any item was read
  num.readsRequired = required
  num.readsMade = made
  check('C2a', `every retained candidate was read over all ${keys.length} items (reads made ${made} of ${required} required)`, made === required, `${retained.length} candidate(s) retained and no item was read for them`)
  const answered = keys.filter(k => c[k].result?.ok === true).length
  num.p5624Answered = answered
  num.p5624Distinct = S.size
  check('C2b', `the run's cache holds one answered wd-roof read per item, ${ITEMS} as Task 5 counts them (answered ${answered} of ${keys.length}; distinct ${S.size})`,
    keys.length === ITEMS && answered === keys.length && S.size === keys.length, 'an item is missing, repeated or unanswered, or the count is not the one Task 5 states')
  const rowQids = new Set([...(inp.results?.accepted ?? []), ...(inp.results?.review ?? [])].map(r => r.qid).filter(Boolean))
  const covered = [...rowQids].filter(q => S.has(q)).length
  num.rowQids = rowQids.size
  num.rowQidsCovered = covered
  check('C2e', `every item the latest run's rows carry has a wd-roof answer in the cache (checked ${covered} of ${rowQids.size} items; the cache holds ${keys.length - covered} more that no row carries)`,
    rowQids.size > 0 && covered === rowQids.size, `${rowQids.size - covered} item(s) a row carries have no answer`)
  const withRoof = keys.filter(k => c[k].result?.value?.results?.bindings?.[0]?.roofLabel).length
  num.p5624WithRoof = withRoof
  check('C2c', `P5624, which the rule reads and the run read over every item, carries a roof on none of them (${withRoof} of ${keys.length})`, withRoof === 0, `${withRoof} carry a value`)
  const p5624 = readOf('P5624')
  check('C2d', 'P5624, the property the rule reads today, has an English label, description and datatype that name no roof',
    p5624.label && p5624.description && p5624.datatype && !aboutRoof(p5624) && !/\broof/i.test(p5624.label), JSON.stringify(p5624))

  // --- beyond criterion 1: the two roof classes Wikidata has an item for, read as values ---------------------------------------------------
  const rows = [...(inp.results?.accepted ?? []), ...(inp.results?.review ?? [])]
  const cls = CLASSES.map(k => {
    const exact = (parsed(k.search)?.search ?? []).filter(h => h.label === k.term)
    const qid = exact.length === 1 ? exact[0].id : null
    const others = (parsed(k.search)?.search ?? []).filter(h => h.id !== qid).map(h => ({ id: h.id, label: h.label, description: h.description ?? '' }))
    const lists = k.pages.map(pid => {
      const j = parsed(pid), bl = j?.query?.backlinks ?? []
      return { pid, ok: Boolean(j) && j.batchcomplete === true && !j.continue && bl.length < LIST_CAP && bl.every(b => b.ns === 0),
        titles: bl.flatMap(b => [b.title, ...(b.redirlinks ?? []).map(r => r.title)]), redirects: bl.filter(b => b.redirect).length }
    })
    const urlIds = [...k.pages, k.p31].map(pid => /(?:bltitle=|haswbstatement:P31=)(Q\d+)/.exec(urlOf(pid))?.[1])
    const titles = [...new Set(lists.flatMap(l => l.titles))]
    const p31 = parsed(k.p31)?.query?.searchinfo?.totalhits
    const inItems = titles.filter(t => S.has(t))
    const meaning = classify(k.term)
    const detail = inItems.map(t => {
      const row = rows.find(r => r.qid === t)
      const decided = Boolean(row) && (row.roofBasis === 'wikipedia lead' || /^infobox roof/.test(row.roofBasis ?? ''))
      return { qid: t, name: row?.name ?? null, roof: row?.roof ?? null, basis: row?.roofBasis ?? null, decided, agrees: decided ? row.roof === k.want : null }
    })
    return { ...k, qid, others, lists, urlIds, titles, p31, inItems, meaning, detail }
  })
  check('V1', 'each roof class is exactly one item whose English label is the term, and it is the item the backlinks and statement searches asked about',
    cls.every(k => k.qid && k.urlIds.every(u => u === k.qid)), cls.map(k => `${k.term}: ${k.qid} vs ${k.urlIds.join(',')}`).join('; '))
  check('V2', "the sourcing rule's own classifier reads each class label as the roof it names",
    cls.every(k => k.meaning === k.want), cls.map(k => `${k.term}: ${k.meaning} (want ${k.want})`).join('; '))
  check('V3', `each backlinks list is complete: answered, no continuation, fewer than the API's cap of ${LIST_CAP}, main namespace only (checked ${cls.flatMap(k => k.lists).filter(l => l.ok).length} of ${cls.flatMap(k => k.lists).length} lists)`,
    cls.every(k => k.lists.every(l => l.ok)), cls.flatMap(k => k.lists).filter(l => !l.ok).map(l => l.pid).join(', '))
  check('V3b', 'the plain list and the redirect-following list name the same items for each class',
    cls.every(k => sameSet(k.lists[0].titles, k.lists[1].titles)), cls.map(k => `${k.term}: ${k.lists.map(l => l.titles.length).join(' vs ')}`).join('; '))
  check('V4', 'the statement search finds no more items under P31 than reference the class in any statement',
    cls.every(k => Number.isInteger(k.p31) && k.p31 <= k.lists[0].titles.length), cls.map(k => `${k.term}: P31 ${k.p31}, referencing ${k.lists[0].titles.length}`).join('; '))
  const decidedRows = cls.flatMap(k => k.detail).filter(d => d.decided)
  const disagree = decidedRows.filter(d => d.agrees === false)
  num.classBacklinks = Object.fromEntries(cls.map(k => [k.term, k.titles.length]))
  num.classIn396 = Object.fromEntries(cls.map(k => [k.term, k.inItems.length]))
  num.classDecided = decidedRows.length
  num.classAgree = decidedRows.filter(d => d.agrees).length
  num.classNoRow = cls.flatMap(k => k.detail).filter(d => !d.name).length
  check('V5', `where a class and the lead or the infobox both decide a row's roof, they agree (${num.classAgree} of ${decidedRows.length} rows; ${disagree.length} disagree)`,
    disagree.length === 0, disagree.map(d => `${d.qid} ${d.name}: class ${d.roof === null ? '?' : ''}row ${d.roof}`).join('; '))

  // --- criterion 5's 9 names -------------------------------------------------------------------------------------------------------------
  const nine = (inp.results?.review ?? []).filter(r => /^roof:/.test(r.why ?? ''))
  const m = /\|\s*roof not settled \(position agreed\)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|/.exec(inp.counts ?? '')
  num.nine = nine.length
  num.nineCounted = m ? Number(m[1]) : null
  num.nineGames = m ? Number(m[2]) : null
  num.nineDays = m ? Number(m[3]) : null
  check('V6', `the review rows whose reason begins "roof:" are the ${m?.[1] ?? '?'} names Step 1's record counts as "roof not settled (position agreed)" (${nine.length})`,
    Boolean(m) && nine.length === Number(m[1]), `${nine.length} computed; the record says ${m?.[1]}`)
  const everyTitle = new Set(cls.flatMap(k => k.titles))
  num.nineIn396 = nine.filter(r => S.has(r.qid)).length
  num.nineReached = nine.filter(r => everyTitle.has(r.qid)).length

  // --- criterion 6: this file writes nothing and uses no network (its own imports) --------------------------------------------------------
  const ALLOWED = { 'node:fs': '{ readFileSync }', 'node:crypto': '{ createHash }' }
  const imports = [...(inp.source ?? '').matchAll(/^import\s+(.+?)\s+from\s+'([^']+)'/gm)].map(i => ({ names: i[1].replace(/\s+/g, ' '), from: i[2] }))
  const badImports = imports.filter(i => i.from in ALLOWED ? i.names !== ALLOWED[i.from] : !/^\.\.\/scripts\/(venue-source|checks)\.mjs$/.test(i.from))
  const dynamic = /\bimport\(|\brequire\(/.test(inp.source ?? '')
  num.imports = imports.length
  check('G6', `the script's own imports can read and hash but not write or reach a network (checked ${imports.length - badImports.length} of ${imports.length} imports)`,
    imports.length > 0 && !badImports.length && !dynamic, `${badImports.map(i => `${i.names} from ${i.from}`).join('; ')}${dynamic ? ' (a dynamic import or require)' : ''}`)

  // --- the verdict by criteria 1 to 6 -----------------------------------------------------------------------------------------------------
  const verdict = retained.length === 0
    ? { go: false, text: `NO-GO. Criterion 1 leaves ${retained.length} candidate(s): the searches list ${cands.length} (${cands.map(x => x.id).join(', ') || 'none'}) and ${setAside.length} ${setAside.length === 1 ? 'is' : 'are'} set aside because the description is not about a roof, so no property can pass criterion 5 (it must decide the roof of at least 1 of the ${nine.length} names).` }
    : { go: null, text: `NOT MEASURED. ${retained.length} candidate(s) were retained under criterion 1 and no item was read for them, so criteria 2 to 5 have no answer.` }
  return { checks, num, verdict, view: { cands, retained, setAside, p5624, cls, nine, S, ev } }
}

// --- the doctored copies -------------------------------------------------------------------------------------------------------------------
const clone = o => JSON.parse(JSON.stringify(o))
/** One replacement, and only if the anchor is there exactly once: a mutation that did not apply is reported as a failure of the self-test, never as a catch. */
export const replaceOnce = (text, anchor, repl) => {
  const n = text.split(anchor).length - 1
  if (n !== 1) throw new Error(`anchor found ${n} times, not once: ${anchor.slice(0, 70)}`)
  return text.replace(anchor, () => repl)
}
const body = (id, fn) => inp => { const c = clone(inp); const p = c.evidence.pages[urlOf(id)]; p.body = fn(p.body); return c }
const firstKey = c => Object.keys(c.cache).find(k => k.startsWith('wd-roof|'))
const rowRows = c => [...c.results.accepted, ...c.results.review]
const nonRowKey = c => { const rq = new Set(rowRows(c).map(r => r.qid).filter(Boolean)); return Object.keys(c.cache).find(k => k.startsWith('wd-roof|') && !rq.has(k.slice('wd-roof|'.length))) }
const ZERO = '{"searchinfo":{"search":"x"},"search":[],"success":1}'
export const DOCTORS = [
  { name: 'a page is missing', aim: 'E1', make: inp => { const c = clone(inp); delete c.evidence.pages[urlOf('prop-capacity')]; return c } },
  { name: 'a page that was not asked for is held', aim: 'E1', make: inp => { const c = clone(inp); c.evidence.pages['https://example.org/x'] = { body: '{}' }; return c } },
  { name: 'a body is not JSON', aim: 'E2', make: body('prop-roof', () => 'not json') },
  { name: 'a body has another shape', aim: 'E2', make: body('prop-roof', () => '{"hello":1}') },
  { name: 'an attempt on the query service has no error code', aim: 'E3', make: inp => { const c = clone(inp); c.evidence.unreadable[0].error = 'oops'; return c } },
  { name: 'the full-text search has a hit it does not show', aim: 'C1b', make: body('text-roof', t => replaceOnce(t, '"totalhits":1}', '"totalhits":2}')) },
  { name: 'the strict variant lists an id the first search does not', aim: 'C1c', make: body('prop-roof-strict', t => replaceOnce(t, '"search":[]', '"search":[{"id":"P5624","datatype":"quantity"}]')) },
  { name: 'a candidate has no datatype', aim: 'C1d', make: body('entities-labels', t => replaceOnce(t, '"datatype":"external-id","id":"P5833"', '"id":"P5833"')) },
  { name: 'a candidate\'s description is about a roof (so it is retained and nothing was read for it)', aim: 'C2a', make: body('entities-labels', t => replaceOnce(t, 'identifier for a theatrical production in the Playbill.com database', 'type of roof of a building')) },
  { name: 'an item no row carries has no wd-roof answer', aim: 'C2b', make: inp => { const c = clone(inp); delete c.cache[nonRowKey(c)]; return c } },
  { name: 'an item a row carries has no wd-roof answer', aim: 'C2e', make: inp => { const c = clone(inp); delete c.cache['wd-roof|' + rowRows(c).find(r => r.qid).qid]; return c } },
  { name: 'an item\'s wd-roof answer is a failure', aim: 'C2b', make: inp => { const c = clone(inp); c.cache[firstKey(c)].result.ok = false; return c } },
  { name: 'an item\'s wd-roof answer carries a roof', aim: 'C2c', make: inp => { const c = clone(inp); const r = c.cache[firstKey(c)].result.value.results; r.bindings[0] = { ...(r.bindings[0] ?? {}), roofLabel: { type: 'literal', value: 'retractable roof' } }; return c } },
  { name: 'P5624\'s description is about a roof', aim: 'C2d', make: body('entities-labels', t => replaceOnce(t, 'predictive measurement of a stainless steels resistance to localized pitting corrosion', 'predictive measurement of a roof')) },
  { name: 'the property search control answers with nothing', aim: 'K1', make: body('prop-capacity', () => ZERO) },
  { name: 'the item search control answers with nothing', aim: 'K2', make: body('item-roof', () => ZERO) },
  { name: 'the full-text control answers with nothing', aim: 'K3', make: body('text-dome', () => '{"batchcomplete":true,"query":{"searchinfo":{"totalhits":0},"search":[]}}') },
  { name: 'the set-aside hit has no roof word in its own statements', aim: 'K4', make: body('entities-claims-P5833', t => replaceOnce(t, 'fiddler-on-the-roof-imperial-theatre-vault-0000006051', 'fiddler-on-the-r00f-imperial-theatre-vault-0000006051')) },
  { name: 'a class item\'s label is not the term', aim: 'V1', make: body('item-domed-stadium', t => replaceOnce(t, '"label":"domed stadium"', '"label":"stadium"')) },
  { name: 'the sourcing rule\'s classifier reads every class as open', aim: 'V2', make: inp => ({ ...clone(inp), classifyRoof: () => 'open' }) },
  { name: 'a backlinks list has a continuation', aim: 'V3', make: body('backlinks-domed', t => replaceOnce(t, '{"batchcomplete":true,"query"', '{"batchcomplete":true,"continue":{"blcontinue":"x","continue":"-||"},"query"')) },
  { name: 'the two backlinks lists of a class differ', aim: 'V3b', make: body('backlinks-domed-redirects', t => replaceOnce(t, '"Q733748"', '"Q733749"')) },
  { name: 'the statement search finds more items than reference the class', aim: 'V4', make: body('p31-domed', t => replaceOnce(t, '"totalhits":11', '"totalhits":99')) },
  { name: 'a row the lead decides contradicts the class', aim: 'V5', make: inp => { const c = clone(inp); const r = [...c.results.accepted, ...c.results.review].find(x => x.qid === 'Q1410402'); r.roof = 'open'; return c } },
  { name: 'a review row loses its roof reason', aim: 'V6', make: inp => { const c = clone(inp); delete c.results.review.find(x => /^roof:/.test(x.why ?? '')).why; return c } },
  { name: 'the script imports a way to write', aim: 'G6', make: inp => ({ ...clone(inp), source: inp.source + "\nimport { writeFileSync } from 'node:fs'\n" }) },
  { name: 'one of the 9 names is an item the domed-stadium class references', aim: { number: 'nineReached', to: 1 }, make: inp => { const c = clone(inp); c.results.review.find(x => x.name === 'AIL Arena').qid = 'Q733748'; return c } },
]

export function selfTest(base) {
  const control = analyse(base)
  const lines = []
  let caught = 0, notApplied = 0
  const controlFails = control.checks.filter(k => !k.pass)
  lines.push(`${controlFails.length ? 'FAIL' : 'PASS'}  CONTROL: the undoctored inputs pass every check (${control.checks.length - controlFails.length} of ${control.checks.length})${controlFails.length ? `: ${controlFails.map(k => k.id).join(', ')}` : ''}`)
  for (const d of DOCTORS) {
    let res
    try { res = analyse(d.make(base)) } catch (e) { notApplied++; lines.push(`FAIL  not applied: ${d.name}: ${e.message}`); continue }
    const failed = res.checks.filter(k => !k.pass).map(k => k.id)
    const hit = typeof d.aim === 'string' ? failed.includes(d.aim) : res.num[d.aim.number] === d.aim.to && control.num[d.aim.number] !== d.aim.to
    if (hit) caught++
    const aimed = typeof d.aim === 'string' ? `[${d.aim}]` : `number ${d.aim.number} ${control.num[d.aim.number]} -> ${res.num[d.aim.number]}`
    lines.push(`${hit ? 'PASS' : 'FAIL'}  ${d.name}: aimed at ${aimed}; failed ${failed.length ? failed.join(', ') : 'nothing'}`)
  }
  lines.push(`\n${caught} of ${DOCTORS.length} doctored copies caught by the check or number aimed at them; ${notApplied} not applied; control ${controlFails.length ? 'red' : 'green'}`)
  return { lines, ok: caught === DOCTORS.length && notApplied === 0 && controlFails.length === 0 }
}

// --- the record ----------------------------------------------------------------------------------------------------------------------------
const et = ts => new Date(ts).toLocaleString('sv-SE', { timeZone: 'America/New_York' })
const esc = s => String(s ?? '').replace(/\|/g, '\\|')
export function record(res, inp, digests) {
  const { num, verdict, view } = res
  const { cands, retained, setAside, p5624, cls, nine } = view
  const stamps = Object.values(inp.evidence.pages).map(p => p.ts).filter(Boolean).sort()
  const L = []
  const w = s => L.push(s)
  w('# Task 5, Step A: which Wikidata property carries a stadium\'s roof')
  w('')
  w(`**Verdict by criteria 1 to 6 (docs/CC-CMD-2026-11-09-venue-review-remainder.md, Task 5): ${verdict.text}**`)
  w('')
  w(`Generated by \`node outbox/venue-wikidata-roof-step-a-2026-11-12.mjs record\` from the committed evidence; every number below is computed by that script from \`${EVIDENCE}\`, \`${CACHE}\`, \`${RESULTS}\` and \`${COUNTS}\`. Its report is \`outbox/venue-wikidata-roof-step-a-2026-11-12.txt\` (${res.checks.length} checks, ${num.pagesHeld} of ${num.pagesExpected} pages) and its self-test, \`--self-test\`, doctors its inputs ${DOCTORS.length} ways (\`outbox/venue-wikidata-roof-step-a-selftest-2026-11-12.txt\`).`)
  const t0 = et(stamps[0]), t1 = et(stamps.at(-1))
  w(`The pages were read from Wikidata's live API through the page reader between ${t0} and ${t0.slice(0, 10) === t1.slice(0, 10) ? t1.slice(11) : t1} ET: the shell cannot reach Wikidata, so this is not a runner's reading.`)
  w('')
  w('## 1. Candidates (criterion 1)')
  w('')
  w('The candidates are the properties Wikidata\'s own property search returns for "roof".')
  w('')
  w('| search | term | answers |')
  w('|---|---|---|')
  const sa = k => (cnt => `${cnt}`)(num.searchAnswers[k])
  w(`| property search (label and alias prefix), English | roof | ${sa('prop-roof')} properties |`)
  w(`| the same with \`strictlanguage=0\` | roof | ${sa('prop-roof-strict')} properties |`)
  w(`| full text of the Property namespace | roof | ${sa('text-roof')} hit${num.searchAnswers['text-roof'] === 1 ? '' : 's'} |`)
  for (const [id, label, term, kind] of [['prop-roof-shape', 'property search', 'roof shape', 'properties'], ['prop-retractable', 'property search', 'retractable', 'properties']]) {
    const j = JSON.parse(inp.evidence.pages[urlOf(id)].body); w(`| ${label}, English (wider) | ${term} | ${j.search.length} ${kind} |`)
  }
  { const j = JSON.parse(inp.evidence.pages[urlOf('text-retractable')].body); w(`| full text of the Property namespace (wider) | retractable | ${j.query.searchinfo.totalhits} hits |`) }
  w('')
  w('Each candidate, with its English label, description and datatype from the entity read, before any item is read:')
  w('')
  w('| id | label | description | datatype | description about a roof | disposition |')
  w('|---|---|---|---|---|---|')
  for (const c of cands) w(`| ${c.id} | ${esc(c.label)} | ${esc(c.description)} | ${c.datatype} | ${aboutRoof(c) ? 'yes' : 'no'} | ${aboutRoof(c) ? 'retained: its items must be read' : 'named and set aside'} |`)
  if (!cands.length) w('| (none) | | | | | |')
  w('')
  const hitId = cands.find(c => !aboutRoof(c))?.id
  w(`Why the full-text search lists ${hitId ?? 'it'}: ${hitId ? `its own statements carry an example value that contains the word, \`${stringValues(JSON.parse(inp.evidence.pages[urlOf('entities-claims-' + hitId)].body).entities[hitId].claims).find(v => /roof/i.test(v))}\` (a Wikidata property example whose production is *Fiddler on the Roof*); neither its label nor its description does (check K4).` : 'n/a'}`)
  w('')
  const dq = JSON.parse(inp.evidence.pages[urlOf('text-dome')].body).query
  const dRoof = dq.search.filter(h => /\broof/i.test(`${h.snippet} ${h.titlesnippet}`)).length
  w(`Controls, so that a list of 0 is an answer and not a form that cannot answer (checks K1 to K3): the same property search for "capacity" lists properties; the item search for "roof" lists the item labelled "roof"; the full-text search for "dome" lists properties and every hit is shown. For "dome" it lists ${dq.searchinfo.totalhits} properties (${dq.search.map(h => `${h.title.replace(/^Property:/, '')} ${esc(String(h.titlesnippet).trim())}`).join('; ')}); the word "roof" is in the label or description shown for ${dRoof} of them.`)
  w('')
  w(`The property the rule reads today is **${p5624.id}**, "${esc(p5624.label)}", datatype \`${p5624.datatype}\`, description "${esc(p5624.description)}". The searches do not return it, and nothing in its label, description or datatype is about a roof (check C2d).`)
  w('')
  w(`**Criterion 1 result:** ${num.candidates} property listed by the searches, ${num.setAside} set aside, **${num.retained} retained**.`)
  w('')
  w('## 2. Reads over the items (criterion 2)')
  w('')
  w(`- Retained candidates ${num.retained}; each needs a read of all ${num.items} items: reads required ${num.readsRequired}, reads made ${num.readsMade}: **${num.readsMade} of ${num.readsRequired}**. A set-aside property was not read over the items, as criterion 1 says.`)
  w(`- The property the rule reads today, read over every item by the run that wrote the cache (a control, not a candidate): ${num.p5624Answered} of ${num.items} answered over ${num.p5624Distinct} distinct items, **${num.p5624WithRoof} of ${num.items} carry a roof**. The latest run's rows carry ${num.rowQids} of those items (all ${num.rowQidsCovered} have an answer); the cache holds ${num.items - num.rowQidsCovered} more that no row of that run carries, and Task 5 counts all ${num.items}.`)
  w('')
  w('## 3 and 4. Meaning and agreement')
  w('')
  w(`No candidate was retained, so there is no value to read through \`classifyRoof\` and no row to compare with the lead or the infobox: 0 values, 0 rows compared.`)
  w('')
  w('## 5. It adds something')
  w('')
  w(`The criterion asks that a property decide the roof of at least 1 of the ${num.nine} names the rule leaves unsettled with the position agreed (${nine.map(r => r.name).join(', ')}; Step 1's record: ${num.nineGames} games on ${num.nineDays} venue-days). All ${num.nineIn396} of ${num.nine} are among the ${num.items} items. With no retained candidate, **0 of ${num.nine}** are decided.`)
  w('')
  w('## 6. It writes nothing')
  w('')
  w('The script imports only `readFileSync`, `createHash`, `classifyRoof` and the check harness (check G6), so it can neither write nor reach a network. The four files the criterion protects are untouched by it, and their digests at this record are:')
  w('')
  w('| file | sha256 |')
  w('|---|---|')
  for (const [f, h] of digests) w(`| \`${f}\` | \`${h}\` |`)
  w('')
  w('## Beyond criterion 1: the roof classes Wikidata has an item for')
  w('')
  w('A roof could be carried as a value under a property that is not named for a roof. Wikidata has an item for each class the rule knows: "retractable roof" and "domed stadium". The items that reference each, read from the wiki\'s backlinks list with redirects followed and cross-checked against the statement search, and the ones that are among the ' + num.items + ' items:')
  w('')
  w('| class item | label | pages that reference it | of them among the items | of those, decided by the lead or infobox | class and row agree |')
  w('|---|---|---|---|---|---|')
  for (const k of cls) {
    const dec = k.detail.filter(d => d.decided)
    w(`| ${k.qid} | ${k.term} (read by the rule as \`${k.meaning}\`) | ${k.titles.length} pages${k.lists[0].redirects ? ` (${k.lists[0].redirects} a redirect)` : ''}, ${k.p31} through P31 | ${k.inItems.length}${k.inItems.length ? ': ' + k.detail.map(d => `${d.qid} ${esc(d.name ?? 'no row')}`).join(', ') : ''} | ${dec.length} | ${dec.filter(d => d.agrees).length} of ${dec.length} |`)
  }
  w('')
  w(`The other hits for those two searches are set aside: ${cls.flatMap(k => k.others).map(o => `${o.id} (${esc(o.description || 'no description')})`).join('; ')}. **None of the ${num.nine} names is among the ${[...new Set(cls.flatMap(k => k.titles))].length} pages that reference either class (${num.nineReached} of ${num.nine}).** So this route reaches ${Object.values(num.classIn396).reduce((a, b) => a + b, 0)} of ${num.items} items, and the row it reaches is one whose roof the Wikipedia lead already decides. It is not a candidate under criterion 1 (the property search does not return P31) and is recorded as information only; no rule or criterion for it exists.`)
  w('')
  w('## What this does not show')
  w('')
  w(`- The items' own statements were not read for a roof under a property whose label, description and aliases name none. Wikidata's query service could show that, and it refused the page reader (${num.unreadable} attempts, \`unreadable\` in the evidence); reading the ${num.items} items' claims one page at a time through the reader was not attempted. The sourcing runs do query that service from a runner, so a runner could make the read. Wikidata's own search lists no property named for a roof, which is what criterion 1 asks.`)
  w('- The searches are English only (label and alias prefix, and stemmed full text of labels, descriptions, aliases and statement values). A property named for a roof in another language only was not looked for.')
  w('- The class reads show the items that reference "retractable roof" or "domed stadium" in any statement at the time of the read. Other class items (an indoor arena, a covered stadium) were not searched.')
  w('- Wikidata changes: these are answers at the time of the read, kept in the evidence file. The earlier documents that call P5624 a roof source (`outbox/cc-session-2026-10-22-outdoor-venue-sourcing.md`; Task 2\'s criteria 2 and 3) are not edited here, as Task 5 says.')
  w('')
  w('## The owner\'s decision')
  w('')
  w('Task 5 names two follow-ons, each its own approval, and neither is approved: wire a candidate in place of P5624, or remove the Wikidata roof step from `roofOf` and `decideRoof` and from the comments and documents that name three witnesses. By the criteria, no candidate exists to wire, which leaves the second as the one the record supports. The third route above (a class value) is not proposed.')
  return L.join('\n') + '\n'
}

// --- the command line ------------------------------------------------------------------------------------------------------------------------
const load = () => ({
  evidence: JSON.parse(readFileSync(EVIDENCE, 'utf8')),
  cache: JSON.parse(readFileSync(CACHE, 'utf8')),
  results: JSON.parse(readFileSync(RESULTS, 'utf8')),
  counts: readFileSync(COUNTS, 'utf8'),
  source: readFileSync(new URL(import.meta.url), 'utf8'),
})
const digests = () => PROTECTED.map(f => [f, createHash('sha256').update(readFileSync(f)).digest('hex')])

if (isMain(import.meta.url)) {
  const inp = load()
  if (process.argv.includes('--self-test')) {
    const r = selfTest(inp)
    console.log(r.lines.join('\n'))
    finish(r.ok ? 0 : 1)
  } else {
    const res = analyse(inp)
    if (process.argv.includes('record')) {
      process.stdout.write(record(res, inp, digests()))
      finish(res.checks.every(k => k.pass) ? 0 : 1)
    } else {
      for (const k of res.checks) console.log(`${k.pass ? 'PASS' : 'FAIL'}  [${k.id}] ${k.name}${k.pass ? '' : `\n      -> ${k.detail}`}`)
      const failed = res.checks.filter(k => !k.pass)
      const n = res.num
      console.log(`\n${res.checks.length - failed.length}/${res.checks.length} checks passed`)
      console.log('\ncoverage (what each number is out of):')
      console.log(`  pages held ${n.pagesHeld} of ${n.pagesExpected}; pages with their shape ${n.pagesShaped}; query-service attempts recorded ${n.unreadable}`)
      console.log(`  candidates listed ${n.candidates}; set aside ${n.setAside}; retained ${n.retained}; reads made ${n.readsMade} of ${n.readsRequired} required over ${n.items} items`)
      console.log(`  P5624 control: answered ${n.p5624Answered} of ${n.items}; distinct ${n.p5624Distinct}; carrying a roof ${n.p5624WithRoof} of ${n.items}; items the latest run's rows carry ${n.rowQidsCovered} of ${n.rowQids} covered`)
      console.log(`  class items referenced by ${Object.entries(n.classBacklinks).map(([t, v]) => `${t} ${v}`).join(', ')}; among the items ${Object.entries(n.classIn396).map(([t, v]) => `${t} ${v} of ${n.items}`).join(', ')}`)
      console.log(`  rows the class and the lead or infobox both decide ${n.classDecided}; agree ${n.classAgree}; class items with no result row ${n.classNoRow}`)
      console.log(`  the ${n.nine} names whose roof is unsettled: among the items ${n.nineIn396} of ${n.nine}; among the items that reference a class ${n.nineReached} of ${n.nine} (Step 1's record counts ${n.nineCounted})`)
      console.log(`\n${res.verdict.text}`)
      console.log('\nprotected files (criterion 6), sha256:')
      for (const [f, h] of digests()) console.log(`  ${h}  ${f}`)
      finish(failed.length)
    }
  }
}
