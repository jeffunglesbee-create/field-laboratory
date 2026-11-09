// The Step A "Done when" of docs/CC-CMD-2026-11-09-venue-review-remainder.md, option 3, as assertions with a printed
// denominator (Rule 89, Rule 91). Run from the repository root:
//   node outbox/venue-infobox-stepa-assert-2026-11-09.mjs                 the committed probe
//   node outbox/venue-infobox-stepa-assert-2026-11-09.mjs --self-test     the assertions against a good and a doctored probe
//
// Each line is PASS or FAIL with the value that decided it. The exit code is the number of FAIL lines.

import { readFileSync } from 'node:fs'
import { isMain } from '../scripts/checks.mjs'

const CONTROLS = ['U.S. Bank Stadium', 'Parken Stadium', 'Center Parc Stadium', 'Joan C. Edwards Stadium', 'NRG Stadium']

export const assertions = (out, txt) => {
  const A = []
  const add = (name, ok, value) => A.push({ name, ok: Boolean(ok), value })
  const arts = out.articles ?? {}
  const titles = Object.keys(arts)
  const unfetched = titles.filter(t => !arts[t].fetch?.ok)
  const unparsed = titles.filter(t => arts[t].fetch?.ok && !arts[t].parse?.ok)
  add('the run is complete (no fatal error)', out.complete === true, `complete ${out.complete}${out.fatal ? `, fatal ${out.fatal.slice(0, 120)}` : ''}`)
  add('every article was fetched', titles.length > 0 && unfetched.length === 0, `fetched ${titles.length - unfetched.length} of ${titles.length}${unfetched.length ? `; not: ${unfetched.slice(0, 5).join(', ')}` : ''}`)
  add('every fetched tree parsed', unparsed.length === 0, `parsed ${titles.length - unfetched.length - unparsed.length} of ${titles.length - unfetched.length}${unparsed.length ? `; not: ${unparsed.slice(0, 5).join(', ')}` : ''}`)
  add('the title count is the one the run was asked for', out.population?.titles === titles.length, `asked ${out.population?.titles}, answered ${titles.length}`)
  const noCat = titles.filter(t => !arts[t].categories || arts[t].categories.missing)
  add('every article has a category answer', noCat.length === 0, `answered ${titles.length - noCat.length} of ${titles.length}${noCat.length ? `; not: ${noCat.slice(0, 5).join(', ')}` : ''}`)
  const line2 = txt.split('\n')[1] ?? ''
  const m = /^COVERAGE: checked (\d+) of (\d+) rows/.exec(line2)
  add('the .txt names its coverage on line 2 as "checked N of M rows"', Boolean(m), line2.slice(0, 160))
  add('...and N is the number of rows that have an article, M the 442 rows of the results', Boolean(m) && Number(m[2]) === 442 && Number(m[1]) === (out.rows ?? []).filter(r => r.title).length, m ? `N ${m[1]}, M ${m[2]}, rows with a title ${(out.rows ?? []).filter(r => r.title).length}` : 'no coverage line')
  const tree = out.controlTrees?.['U.S. Bank Stadium'] ?? ''
  add('the escape premise: the raw U.S. Bank Stadium tree carries <close>&lt;/ref&gt;</close>', tree.includes('<close>&lt;/ref&gt;</close>'), tree ? `tree ${tree.length} characters; has the escaped close: ${tree.includes('<close>&lt;/ref&gt;</close>')}; has a bare </ref> inside <close>: ${tree.includes('<close></ref></close>')}` : 'no tree recorded')
  add('...and the same tree reads without a parser error', tree !== '' && (arts[out.controls?.['U.S. Bank Stadium']]?.parse?.errors ?? ['no record']).length === 0, JSON.stringify(arts[out.controls?.['U.S. Bank Stadium']]?.parse?.errors ?? 'no record'))
  for (const c of CONTROLS) {
    const t = out.controls?.[c]
    const row = (out.rows ?? []).find(r => r.name === c)
    const a = t ? arts[t] : null
    const roofs = (a?.infoboxes ?? []).flatMap(i => i.roof.map(x => `${x.param}=${JSON.stringify(x.flat)}`))
    add(`control ${c} is reported`, Boolean(row) && (t ? Boolean(a) : /no article|no cached|no qid/.test(row?.why ?? '')), !row ? 'not in the results' : !t ? `no article (${row.why})` : `${a?.infoboxes?.length ?? 0} Infobox template(s); roof parameters: ${roofs.join('; ') || 'none'}`)
  }
  const ts = Object.values(arts).map(a => a.fetch?.ms ?? 0).sort((x, y) => x - y)
  add('the timing of the run is recorded, so its duration is explained and not guessed', out.elapsedMs > 0 && out.requests >= titles.length, `${out.requests} requests in ${Math.round(out.elapsedMs / 1000)} s; per-article median ${ts[Math.floor(ts.length / 2)] ?? 0} ms, max ${ts.at(-1) ?? 0} ms; articles needing more than one attempt ${Object.values(arts).filter(a => a.fetch?.attempts > 1).length}`)
  return A
}

const selfTest = () => {
  const good = () => ({
    complete: true, fatal: null, population: { titles: 2 }, elapsedMs: 5000, requests: 3,
    rows: [{ name: 'U.S. Bank Stadium', title: 'A' }, { name: 'Parken Stadium', title: 'B' }, { name: 'Center Parc Stadium', title: null, why: 'no cached wd-roof answer' }, { name: 'Joan C. Edwards Stadium', title: null, why: 'no qid' }, { name: 'NRG Stadium', title: null, why: 'no qid' }, ...Array.from({ length: 437 }, (_, i) => ({ name: `X${i}`, title: null, why: 'no qid' }))],
    controls: { 'U.S. Bank Stadium': 'A', 'Parken Stadium': 'B', 'Center Parc Stadium': null, 'Joan C. Edwards Stadium': null, 'NRG Stadium': null },
    controlTrees: { 'U.S. Bank Stadium': '<root><template><title>Infobox venue</title><ext><name>ref</name><close>&lt;/ref&gt;</close></ext></template></root>' },
    articles: {
      A: { fetch: { ok: true, ms: 100, attempts: 1 }, parse: { ok: true, errors: [] }, infoboxes: [{ roof: [{ param: 'roof', flat: '[[Skylight]]' }] }], categories: { visible: [], hidden: 0, missing: false } },
      B: { fetch: { ok: true, ms: 200, attempts: 1 }, parse: { ok: true, errors: [] }, infoboxes: [], categories: { visible: [], hidden: 0, missing: false } },
    },
  })
  const txt = 'venue-infobox probe, run 1, now, complete\nCOVERAGE: checked 2 of 442 rows (the rows whose Wikidata entry names an English article); the other 440: x 440\n'
  const failing = (mutate, t = txt) => { const o = good(); mutate(o); return assertions(o, t).filter(a => !a.ok).map(a => a.name) }
  const results = []
  const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      → ${detail}`}`) }
  check('a good probe passes every assertion', assertions(good(), txt).every(a => a.ok), JSON.stringify(assertions(good(), txt).filter(a => !a.ok)))
  check('an incomplete run fails, and says so', failing(o => { o.complete = false; o.fatal = 'boom' }).includes('the run is complete (no fatal error)'))
  check('an unfetched article fails the fetch assertion and names it', failing(o => { o.articles.B.fetch = { ok: false, why: 'HTTP 404' } }).includes('every article was fetched'))
  check('an unparsed tree fails the parse assertion', failing(o => { o.articles.B.parse = { ok: false, why: 'x' } }).includes('every fetched tree parsed'))
  check('a tree whose close tag is not the escaped form fails the escape premise', failing(o => { o.controlTrees['U.S. Bank Stadium'] = '<close></ref></close>' }).includes('the escape premise: the raw U.S. Bank Stadium tree carries <close>&lt;/ref&gt;</close>'))
  check('a coverage line that does not name N of M on line 2 fails', failing(() => {}, 'x\nCOVERAGE checked 2\n').includes('the .txt names its coverage on line 2 as "checked N of M rows"'))
  check('a coverage line whose N is not the number of rows with an article fails', failing(() => {}, txt.replace('checked 2 of', 'checked 7 of')).includes('...and N is the number of rows that have an article, M the 442 rows of the results'))
  check('a control with no row in the results fails', failing(o => { o.rows = o.rows.filter(r => r.name !== 'Parken Stadium') }).includes('control Parken Stadium is reported'))
  check('an article with no category answer fails', failing(o => { o.articles.A.categories = null }).includes('every article has a category answer'))
  check('a probe that asked for more titles than it answered fails', failing(o => { o.population.titles = 3 }).includes('the title count is the one the run was asked for'))
  const bad = results.filter(r => !r).length
  console.log(`\n${results.length - bad}/${results.length} checks passed`)
  process.exitCode = bad ? 1 : 0
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--self-test')) selfTest()
  else {
    const out = JSON.parse(readFileSync('outbox/venue-infobox-probe.json', 'utf8')), txt = readFileSync('outbox/venue-infobox-probe.txt', 'utf8')
    const A = assertions(out, txt)
    for (const a of A) console.log(`${a.ok ? 'PASS' : 'FAIL'}  ${a.name}\n      ${a.value}`)
    const bad = A.filter(a => !a.ok).length
    console.log(`\nchecked ${A.length} assertions: ${A.length - bad} PASS, ${bad} FAIL`)
    process.exitCode = bad
  }
}
