// Probe for Task 2 of docs/CC-CMD-2026-11-09-venue-review-remainder.md, run BEFORE the change.
//
// The premises the change rests on, and the one command that tests each (PREMISE-FIRST-A):
//   1. "9 leads are cut, 8 of them accepted as open" is the CC-CMD's count, taken at 14
//      characters or fewer. A cut at an initial does not stop at 14 characters, so the
//      boundary is itself a premise.  -> criteria A (<= 14), B (no is/are/was/were) and C
//      (ends like a name) below, over EVERY row that carries a lead.
//   2. "A re-run is answered from the cache, so only the lead changes."  -> the age of every
//      cache entry against the 30-day TTL in scripts/venue-source.mjs. A run past the first
//      expiry re-asks the geocoders, and a row could then change for a reason that is not
//      the lead.
//
// Read-only. Results and cache are read from git at a rev (default HEAD), so the numbers do
// not move when the runner's re-run rewrites those files:
//   node outbox/venue-lead-whole-probe-2026-11-09.mjs [REV]
//   node outbox/venue-lead-whole-probe-2026-11-09.mjs --selftest
//
// What it cannot say, and does not: whether a lead that ENDS like a name was cut. The cached
// text is the first sentence only, and a complete sentence ending "U.S." looks the same as a
// cut one. The whole extracts the runner caches under wp-summary are what answer that.

import { execSync } from 'node:child_process'
import { createChecks, finish, isMain } from '../scripts/checks.mjs'

export const TTL_DAYS = 30
const DAY = 864e5
const NO_VERB = /\b(?:is|are|was|were)\b/
const ENDS_LIKE_A_NAME = /(?:\b[A-Z][a-z]{0,2}|\b[A-Z]\.[A-Z])\.$/

/** The three criteria, one lead at a time. */
export const classify = lead => ({
  short: lead.length <= 14,
  noVerb: !NO_VERB.test(lead),
  endsLikeAName: ENDS_LIKE_A_NAME.test(lead),
})

const rowsOf = results => [
  ...results.accepted.map(r => ({ ...r, status: 'accepted' })),
  ...results.review.map(r => ({ ...r, status: 'review' })),
]

/** Every number this probe prints, from the results, the cache and a clock. */
export const analyze = (results, cache, nowMs) => {
  const rows = rowsOf(results)
  const withLead = rows.filter(r => r.lead)
  const tagged = withLead.map(r => ({ r, c: classify(r.lead) }))
  const kinds = {}
  for (const [k, e] of Object.entries(cache)) {
    const o = (kinds[k.split('|')[0]] ??= { n: 0, oldest: Infinity, newest: -Infinity, expired: 0 })
    o.n++
    o.oldest = Math.min(o.oldest, e.at)
    o.newest = Math.max(o.newest, e.at)
    if (nowMs - e.at >= TTL_DAYS * DAY) o.expired++
  }
  const oldest = Math.min(...Object.values(kinds).map(o => o.oldest))
  return {
    candidates: results.of, accepted: results.accepted.length, review: results.review.length,
    rows: rows.length, withLead: withLead.length,
    A: tagged.filter(t => t.c.short).map(t => t.r),
    B: tagged.filter(t => t.c.noVerb).map(t => t.r),
    C: tagged.filter(t => t.c.endsLikeAName && !t.c.noVerb).map(t => t.r),
    kinds, firstExpiry: oldest + TTL_DAYS * DAY,
    expiredNow: Object.values(kinds).reduce((s, o) => s + o.expired, 0),
  }
}

const inferredOpen = r => r.status === 'accepted' && r.roof === 'open' && /^inferred/.test(r.roofBasis ?? '')
const line = (r, n = 44) => `  ${r.status.padEnd(8)} ${String(r.lead.length).padStart(3)} ${JSON.stringify(r.name).padEnd(40)} ${JSON.stringify(r.lead.slice(-n))}${inferredOpen(r) ? '  [accepted as open, inferred]' : ''}`

export const report = (a, rev, nowMs) => {
  const out = []
  out.push(`results and cache read from git rev ${rev}; clock ${new Date(nowMs).toISOString()}`)
  out.push(`candidates ${a.candidates}: ${a.accepted} accepted, ${a.review} review; ${a.rows} rows listed`)
  out.push(`COVERAGE: checked ${a.withLead} of ${a.rows} rows (the others carry no lead: no article, or never reached the roof rule)`)
  out.push('')
  out.push(`A. lead of 14 characters or fewer (the CC-CMD's criterion): ${a.A.length} rows, ${a.A.filter(inferredOpen).length} accepted as open on "inferred"`)
  a.A.forEach(r => out.push(line(r)))
  out.push('')
  out.push(`B. lead with no is/are/was/were in it, at any length: ${a.B.length} rows, ${a.B.filter(inferredOpen).length} accepted as open on "inferred"`)
  a.B.forEach(r => out.push(line(r)))
  out.push('')
  out.push(`C. lead that ENDS like a name but has a verb (cut or complete: this text cannot say): ${a.C.length} rows`)
  a.C.forEach(r => out.push(line(r)))
  out.push('')
  out.push('cache, by key kind (at = when the entry was stored):')
  for (const [k, o] of Object.entries(a.kinds)) {
    out.push(`  ${k.padEnd(20)} ${String(o.n).padStart(5)}  oldest ${new Date(o.oldest).toISOString()}  newest ${new Date(o.newest).toISOString()}  expired now ${o.expired}`)
  }
  out.push(`TTL ${TTL_DAYS} days: the first entry expires ${new Date(a.firstExpiry).toISOString()}; expired at the clock above: ${a.expiredNow}`)
  return out.join('\n')
}

const selfTest = () => {
  const { check, summarize } = createChecks()
  const A = classify('Amon G.')
  check('a cut lead trips all three criteria', A.short && A.noVerb && A.endsLikeAName)
  const B = classify('X Stadium is a stadium in Denver.')
  check('a whole sentence trips none', !B.short && !B.noVerb && !B.endsLikeAName)
  const C = classify('DKR-Texas Memorial Stadium, also known as Darrell K Royal Stadium, home to the Longhorns football team since 1924.')
  check('a complete lead with no verb trips B and not C (B counts it: stated in the output)', C.noVerb && !C.endsLikeAName)
  const D = classify('NRG Stadium is a retractable roof stadium in Houston, Texas, U.S.')
  check('a lead ending "U.S." with a verb trips C and not B', D.endsLikeAName && !D.noVerb)
  check('a 15-character cut is past the CC-CMD boundary and still caught by B', !classify('The Estadio Dr.').short && classify('The Estadio Dr.').noVerb)

  const NOW = Date.UTC(2026, 10, 9)
  const res = {
    of: 4,
    accepted: [
      { name: 'Cut Stadium', lead: 'Amon G.', roof: 'open', roofBasis: 'inferred: the lead names no roof' },
      { name: 'Whole Stadium', lead: 'X is a stadium in Denver.', roof: 'open', roofBasis: 'inferred: the lead names no roof' },
      { name: 'Name End', lead: 'Z is a stadium in St.', roof: 'open', roofBasis: 'inferred: the lead names no roof' },
    ],
    review: [{ name: 'No Article', lead: null }],
  }
  const cache = { 'wd-roof|Q1': { at: NOW - 29 * DAY }, 'wp-lead|T': { at: NOW - 10 * DAY } }
  const a = analyze(res, cache, NOW)
  check('doctored results: 4 rows listed, 3 carry a lead, and the coverage says so', a.rows === 4 && a.withLead === 3 && /checked 3 of 4 rows/.test(report(a, 'x', NOW)))
  check('doctored results: A, B and C each find exactly their one row', a.A.length === 1 && a.B.length === 1 && a.C.length === 1 && a.A[0].name === 'Cut Stadium' && a.C[0].name === 'Name End')
  check('doctored cache: nothing expired at 29 days, the first expiry is tomorrow', a.expiredNow === 0 && a.firstExpiry === NOW + DAY)
  const b = analyze(res, { ...cache, 'wd-roof|Q2': { at: NOW - 31 * DAY } }, NOW)
  check('doctored cache: an entry at 31 days is counted expired', b.expiredNow === 1)
  const c = analyze({ ...res, accepted: res.accepted.map(r => ({ ...r, lead: 'X is a stadium in Denver.' })) }, cache, NOW)
  check('doctored results: with every lead whole, A, B and C find nothing', c.A.length + c.B.length + c.C.length === 0)
  finish(summarize())
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--selftest')) selfTest()
  else {
    const rev = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'HEAD'
    const show = p => JSON.parse(execSync(`git show ${rev}:${p}`, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }))
    const now = Date.now()
    console.log(report(analyze(show('outbox/venue-source-results-latest.json'), show('outbox/venue-source-cache.json'), now), rev, now))
  }
}
