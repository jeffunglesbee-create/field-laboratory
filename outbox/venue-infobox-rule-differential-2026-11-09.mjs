// The proof that making the infobox a source of the roof rule changed nothing for an input that does not use it (Rule 89: the artifact is this
// script's printed result). docs/CC-CMD-2026-11-09-venue-review-remainder.md, Task 2, option 3, Step B, commit 2. Run from the repository root:
//   node outbox/venue-infobox-rule-differential-2026-11-09.mjs             the extraction commit's functions against the working tree's
//   node outbox/venue-infobox-rule-differential-2026-11-09.mjs --self-test  the same comparison on doctored functions, each of which must be caught
//
// Two functions were touched where they already existed, and each is compared with its text at the extraction commit (968ee51), loaded from git:
//   1. `decideRoof` (scripts/venue-source.mjs) gained a fourth argument. Its output, basis text included, must be the same for every input that
//      leaves the argument out and for every input that passes [] (the infobox answered and named nothing).
//   2. `readArticle` (scripts/venue-infobox.mjs) now reads the answer's parse tree through `answerText` (scripts/venue-infobox-read.mjs), which the
//      rule shares. Its record, and the text it hands to `keep`, must be the same for every answer shape.
// A comparison on a grid proves the grid, so each grid is printed with its size ("checked N of N"), and a comparison that checked nothing is a failure.

import { writeFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { createChecks, finish, isMain } from '../scripts/checks.mjs'

export const OLD = '968ee51'   // the extraction commit: the rule and the probe as they were before the infobox became a source

/** A module as it was at `rev`, loaded from a copy beside the others (its relative imports resolve to the working tree) and removed again. */
const oldModule = async (path, tmp, rev = OLD) => {
  writeFileSync(tmp, execFileSync('git', ['show', `${rev}:${path}`], { encoding: 'utf8' }))
  try { return await import(pathToFileURL(tmp).href) } finally { rmSync(tmp, { force: true }) }
}

/** The inputs on which `a` and `b` return different JSON, as printed argument lists. */
export const differences = (a, b, inputs) => inputs.filter(args => JSON.stringify(a(...args)) !== JSON.stringify(b(...args))).map(args => JSON.stringify(args))

const WD = [null, 'dome', 'retractable roof', 'open-air']
const LEAD = [null, 'X is a stadium in Y.', 'X is an indoor stadium.', 'X has a retractable roof.', 'U.S.', 'The first X was a stadium.']
const BODY = [undefined, null, '', 'a retractable roof', 'movable roof', 'It holds 30,000.']
export const ROOF_GRID = WD.flatMap(w => LEAD.flatMap(l => BODY.map(b => [w, l, b])))

const ATT = [{ status: 200, ms: 5 }]
const TREE = '<root><template><title>Infobox venue</title><part><name>roof</name><equals>=</equals><value>[[Skylight]]</value></part></template></root>'
export const ANSWERS = [
  { ok: false, why: 'HTTP 503', attempts: [{ status: 503, ms: 7 }, { status: 503, ms: 9 }] },
  { ok: true, value: { error: { code: 'missingtitle', info: 'The page you specified does not exist.' } }, attempts: ATT },
  { ok: true, value: { error: { code: 'x', info: 'y'.repeat(300) } }, attempts: ATT },
  { ok: true, value: { parse: { title: 'X' } }, attempts: ATT },
  { ok: true, value: null, attempts: ATT },
  { ok: true, value: 'an html page', attempts: ATT },
  { ok: true, value: [1, 2], attempts: ATT },
  { ok: true, value: { parse: { title: 'X', parsetree: { '*': 5 } } }, attempts: ATT },
  { ok: true, value: { parse: { title: 'U.S. Bank Stadium', revid: 42, redirects: [{ from: 'A', to: 'B' }], parsetree: { '*': TREE } } }, attempts: ATT },
  { ok: true, value: { parse: { parsetree: { '*': TREE } } }, attempts: ATT },
  { ok: true, value: { parse: { title: 'X', parsetree: { '*': '<html><body>x</body></html>' } } }, attempts: ATT },
  { ok: true, value: { parse: { title: 'X', parsetree: { '*': '<root><template>' } } }, attempts: ATT },
  { ok: true, value: { parse: { title: 'X', parsetree: { '*': '' } } }, attempts: ATT },
]
/** `readArticle` as a function of one answer, returning its record and every text it handed to `keep`, so that both are compared. */
export const articleOf = readArticle => r => { const kept = []; return { out: readArticle(r, t => kept.push(t)), kept } }

const selfTest = () => {
  const { check, summarize } = createChecks()
  const f = (w, l, b = null) => ({ roof: w ? 'dome' : l, basis: String(b) })
  check('identical functions differ on no input', differences(f, f, ROOF_GRID).length === 0)
  const doctored = (w, l, b) => (w === 'dome' && l === 'U.S.' && b === '' ? { roof: 'open', basis: 'x' } : f(w, l, b))
  const d = differences(f, doctored, ROOF_GRID)
  check('a function that differs on one input is caught, and that input is named', d.length === 1 && d[0] === JSON.stringify(['dome', 'U.S.', '']), d.join('; '))
  check('a difference in the basis text alone is caught', differences(f, (w, l, b) => ({ ...f(w, l, b), basis: f(w, l, b).basis + '.' }), ROOF_GRID).length === ROOF_GRID.length)
  check('the grid is not empty, and has every wikidata x lead x body combination', ROOF_GRID.length === WD.length * LEAD.length * BODY.length && ROOF_GRID.length > 100, String(ROOF_GRID.length))
  check('an answer set covers a fetch failure, an API error, no tree, a good tree, a bad tree and a malformed one', ANSWERS.length === 13 && ANSWERS.some(r => !r.ok) && ANSWERS.some(r => r.value?.error) && ANSWERS.some(r => r.value?.parse?.parsetree?.['*'] === TREE))
  const two = articleOf((r, keep) => { keep('a'); keep('b'); return 1 })({ ok: true })
  check('articleOf records every text handed to keep', two.kept.join() === 'a,b' && two.out === 1)
  check('a record that differs only in the texts kept is caught', differences(articleOf((r, k) => { k('a'); return 1 }), articleOf((r, k) => { k('b'); return 1 }), [[{ ok: true }]]).length === 1)
  finish(summarize())
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--self-test')) selfTest()
  else {
    const rule = await import('../scripts/venue-source.mjs')
    const probe = await import('../scripts/venue-infobox.mjs')
    const oldRule = await oldModule('scripts/venue-source.mjs', 'scripts/venue-source.old.tmp.mjs')
    const oldProbe = await oldModule('scripts/venue-infobox.mjs', 'scripts/venue-infobox.old.tmp.mjs')
    const sig = (m, name) => typeof m[name]
    console.log(`old modules read from git ${OLD}; the old rule exports ROOF_FIELD_TERMS: ${sig(oldRule, 'ROOF_FIELD_TERMS')}, the new: ${sig(rule, 'ROOF_FIELD_TERMS')}`)
    console.log(`old readArticle reads the answer inline: ${/v\?\.error/.test(oldProbe.readArticle.toString())}; the new reads it through answerText: ${/answerText\(/.test(probe.readArticle.toString())}`)
    const provenance = sig(oldRule, 'ROOF_FIELD_TERMS') === 'undefined' && sig(rule, 'ROOF_FIELD_TERMS') === 'object' && /v\?\.error/.test(oldProbe.readArticle.toString()) && /answerText\(/.test(probe.readArticle.toString())
    const a = differences(oldRule.decideRoof, (w, l, b) => rule.decideRoof(w, l, b), ROOF_GRID)
    const b = differences(oldRule.decideRoof, (w, l, b2) => rule.decideRoof(w, l, b2, []), ROOF_GRID)
    const c = differences(articleOf(oldProbe.readArticle), articleOf(probe.readArticle), ANSWERS.map(r => [r]))
    console.log(`decideRoof, field left out:  checked ${ROOF_GRID.length} of ${ROOF_GRID.length} inputs; ${a.length} differ${a.map(x => `\n  ${x}`).join('')}`)
    console.log(`decideRoof, field = []:      checked ${ROOF_GRID.length} of ${ROOF_GRID.length} inputs; ${b.length} differ${b.map(x => `\n  ${x}`).join('')}`)
    console.log(`readArticle, record and kept texts: checked ${ANSWERS.length} of ${ANSWERS.length} answers; ${c.length} differ${c.map(x => `\n  ${x.slice(0, 160)}`).join('')}`)
    const ok = provenance && a.length + b.length + c.length === 0 && ROOF_GRID.length > 0 && ANSWERS.length > 0
    console.log(ok ? 'IDENTICAL: nothing that does not use the infobox changed' : 'DIFFERENT (or the compared modules are not the old and the new): see above')
    process.exitCode = ok ? 0 : 1
  }
}
