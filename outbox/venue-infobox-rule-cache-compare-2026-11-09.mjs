// The roof values the RULE read from Wikipedia against the values the PROBE read from it, article by article (Rule 89: the artifact is this script's
// printed result). docs/CC-CMD-2026-11-09-venue-review-remainder.md, Task 2, option 3, Step B: "each rule-read infobox value is compared with the probe's
// (print N of 381)". Run from the repository root after the runner's `source` run has committed `outbox/venue-source-cache.json`:
//   node outbox/venue-infobox-rule-cache-compare-2026-11-09.mjs             the committed cache against the committed probe
//   node outbox/venue-infobox-rule-cache-compare-2026-11-09.mjs --self-test  the comparison on doctored caches, each of which must be caught
//
// The probe read each article through its own client (scripts/venue-infobox.mjs) and the rule through `getJson` (scripts/venue-source.mjs); the two share
// the reader (scripts/venue-infobox-read.mjs) and nothing else, so equal values say that the rule's request got what the probe's got, and a difference says
// either that Wikipedia changed in between (a revision, to be read, not assumed) or that the two requests are not the same request.
// An article with no `wp-infobox|` entry is one the rule's request did not answer: `cached` never stores a failure. Nothing is skipped silently: every
// article of the probe is accounted for in exactly one of the counts below, and the counts are printed against their denominator.

import { readFileSync } from 'node:fs'
import { createChecks, finish, isMain } from '../scripts/checks.mjs'

const CACHE = 'outbox/venue-source-cache.json', PROBE = 'outbox/venue-infobox-probe.json'
const KEY = 'wp-infobox|'

/** The roof values the probe read for one article: null when it was not read. */
export const probeValues = art => (!art || !art.fetch?.ok || !art.parse?.ok ? null : art.infoboxes.flatMap(i => i.roof.map(r => r.flat)))

export const compare = (cache, probe) => {
  const titles = Object.keys(probe.articles)
  const out = { titles: titles.length, same: [], differ: [], missing: [], probeUnread: [], extra: [] }
  for (const t of titles) {
    const mine = cache[KEY + t]?.result, theirs = probeValues(probe.articles[t])
    if (theirs === null) { out.probeUnread.push(t); continue }
    if (!mine) out.missing.push(t)
    else if (mine.ok === true && JSON.stringify(mine.value) === JSON.stringify(theirs)) out.same.push(t)
    else out.differ.push({ title: t, rule: mine.ok === true ? mine.value : `NOT OK ${mine.why ?? ''}`, probe: theirs })
  }
  const known = new Set(titles)
  out.extra = Object.keys(cache).filter(k => k.startsWith(KEY) && !known.has(k.slice(KEY.length))).map(k => k.slice(KEY.length))
  return out
}

/** What is wrong, as a list; an empty list is a pass. */
export const problems = c => {
  const bad = []
  if (c.titles === 0) bad.push('the probe has no articles')
  if (c.same.length + c.differ.length + c.missing.length + c.probeUnread.length !== c.titles) bad.push('the counts do not add up to the probe\'s articles')
  if (c.probeUnread.length) bad.push(`${c.probeUnread.length} article(s) the probe did not read, so there is nothing to compare: ${c.probeUnread.slice(0, 5).join(', ')}`)
  if (c.missing.length) bad.push(`${c.missing.length} article(s) the rule's request did not answer: ${c.missing.slice(0, 8).join(', ')}`)
  if (c.differ.length) bad.push(`${c.differ.length} article(s) where the rule read other values than the probe: ${c.differ.slice(0, 5).map(d => d.title).join(', ')}`)
  if (c.extra.length) bad.push(`${c.extra.length} wp-infobox entr(ies) for an article the probe did not read: ${c.extra.slice(0, 5).join(', ')}`)
  return bad
}

export const report = c => [
  `venue-infobox rule against probe: the roof values the rule read, article by article`,
  `COVERAGE: compared ${c.same.length + c.differ.length + c.missing.length} of ${c.titles} articles the probe read; the probe could not read ${c.probeUnread.length}`,
  `RULE-READ VALUES EQUAL THE PROBE'S: ${c.same.length} of ${c.titles}`,
  `RULE DID NOT ANSWER (no wp-infobox entry): ${c.missing.length}${c.missing.map(t => `\n  ${t}`).join('')}`,
  `DIFFER: ${c.differ.length}${c.differ.map(d => `\n  ${d.title}: rule ${JSON.stringify(d.rule)}; probe ${JSON.stringify(d.probe)}`).join('')}`,
  `EXTRA wp-infobox entries the probe has no article for: ${c.extra.length}${c.extra.map(t => `\n  ${t}`).join('')}`,
].join('\n')

const selfTest = () => {
  const { check, summarize } = createChecks()
  const art = (...flat) => ({ fetch: { ok: true }, parse: { ok: true }, infoboxes: [{ roof: flat.map(f => ({ flat: f })) }] })
  const entry = value => ({ at: 1, result: { ok: true, value } })
  const probe = { articles: { A: art('[[Dome]]'), B: art(), C: art('[[Skylight]]', 'x'), D: { fetch: { ok: false }, parse: null } } }
  const good = { [KEY + 'A']: entry(['[[Dome]]']), [KEY + 'B']: entry([]), [KEY + 'C']: entry(['[[Skylight]]', 'x']) }
  const c = compare(good, probe)
  check('equal values are counted equal, an empty list included, and an article the probe could not read is named, not compared', c.same.length === 3 && c.probeUnread.join() === 'D' && c.missing.length === 0 && c.differ.length === 0, JSON.stringify(c))
  check('the counts add up to the probe\'s articles', c.same.length + c.differ.length + c.missing.length + c.probeUnread.length === c.titles && c.titles === 4)
  check('A DIFFERENT VALUE IS CAUGHT', compare({ ...good, [KEY + 'A']: entry(['[[Retractable roof|Retractable]]']) }, probe).differ.map(d => d.title).join() === 'A')
  check('...a different ORDER of the same values is a difference', compare({ ...good, [KEY + 'C']: entry(['x', '[[Skylight]]']) }, probe).differ.length === 1)
  check('AN ARTICLE THE RULE DID NOT ANSWER IS NAMED, and the run fails', (m => m.missing.join() === 'B' && problems(m).some(p => /did not answer: B/.test(p)))(compare((({ [KEY + 'B']: _, ...rest }) => rest)(good), probe)))
  check('a cached answer that is not ok is a difference, not a match', compare({ ...good, [KEY + 'A']: { at: 1, result: { ok: false, why: 'HTTP 503' } } }, probe).differ.length === 1)
  check('an entry for an article the probe did not read is named', compare({ ...good, [KEY + 'Z']: entry([]) }, probe).extra.join() === 'Z')
  check('a comparison of nothing is not a pass', problems(compare({}, { articles: {} })).includes('the probe has no articles'))
  check('an article the probe could not read fails the run, since nothing was compared for it', problems(c).some(p => /did not read/.test(p)))
  check('all equal, every article read: no problem', problems(compare(good, { articles: { A: probe.articles.A, B: probe.articles.B, C: probe.articles.C } })).length === 0)
  finish(summarize())
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--self-test')) selfTest()
  else {
    const c = compare(JSON.parse(readFileSync(CACHE, 'utf8')), JSON.parse(readFileSync(PROBE, 'utf8')))
    const bad = problems(c)
    console.log(report(c))
    console.log(bad.length ? `NOT EQUAL:${bad.map(b => `\n  ${b}`).join('')}` : `EQUAL: the rule read the probe's roof values on ${c.same.length} of ${c.titles} articles`)
    process.exitCode = bad.length ? 1 : 0
  }
}
