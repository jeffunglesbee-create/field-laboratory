// Which stack cannot reach Open-Meteo — node's, the browser's, or neither?
//
// WHY THIS EXISTS. `render-check`'s tolerance branch skips the four live
// weather-chip assertions only when a probe finds Open-Meteo unreachable. That
// probe is ONE `fetch` FROM NODE, fired after the page's 20s wait has already
// elapsed. render-check says so itself, in a comment written before this
// mattered:
//
//   "this probe is one request from node, after the 20s wait has already
//    elapsed, and a service that refused a burst can answer a single late
//    request perfectly well. So it reports what it saw and does not pretend to
//    have measured the page's fate."
//
// On 2026-09-01 that gap became the failure. verify runs 244, 245 and 250 all
// died the same way: the page's 8 attempted requests timed out (4 at 8000ms,
// 4 more at ~6000ms, then the 14000ms slate budget was spent and 6 were never
// attempted), while the node probe answered `HTTP 200`. The tolerance branch
// therefore did not fire and a third-party condition gated the deploy — the
// exact outcome `cc-render-check-tolerate-open-meteo-2026-08-23.md` shipped to
// prevent.
//
// Three readings fit that evidence and they want different fixes:
//
//   node ok, browser fails          the probe measures the wrong network stack
//   node ok, browser single ok,     the host refuses a BURST and answers a
//     browser burst fails             single late request — concurrency, not
//                                     reachability
//   everything ok now               the outage was real and had ended by the
//                                     time anything was probed
//
// This probe measures all three in one process on one runner, so the reading is
// a measurement rather than a choice between plausible stories.
//
// Usage:  node scripts/probe-open-meteo-egress.mjs
//         node scripts/probe-open-meteo-egress.mjs --self-test

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createChecks, isMain } from './checks.mjs'

/** A single measurement is one of three things, and `not-measured` is not a pass. */
export const OK = 'ok'
export const FAIL = 'fail'
export const UNMEASURED = 'not-measured'

/**
 * The verdict, from three measurements. Every branch names a DIFFERENT repair,
 * which is the whole reason the three are taken separately.
 */
export const verdictFor = ({ node, browserSingle, browserBurst }) => {
  const given = [node, browserSingle, browserBurst]
  if (given.some(m => m === undefined)) throw new TypeError('verdictFor: all three measurements are required')
  if (given.some(m => m === UNMEASURED)) return 'not-observable'
  if (node === FAIL && browserSingle === FAIL) return 'service-unreachable'
  if (node === FAIL && browserSingle === OK) return 'node-only'
  if (node === OK && browserSingle === FAIL) return 'browser-only'
  if (browserBurst === FAIL) return 'burst-refused'
  return 'reachable'
}

/** What each verdict says to do. Kept beside the verdict so neither drifts. */
export const repairFor = (verdict) => ({
  'not-observable': 'a measurement did not run — the probe proved nothing and must not be read as a pass',
  'service-unreachable': "the documented outage. render-check's existing tolerance branch is correct and fires",
  'node-only': "node's egress is blocked while the browser's is not — the runner, not the service",
  'browser-only': "render-check's probe measures the wrong stack; it must probe from the page context",
  'burst-refused': 'the host answers one request and refuses a burst; the probe must burst too, or the page must not',
  reachable: 'nothing is wrong now — the failure was transient and the probe must be able to say so',
}[verdict])

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()
  const v = (n, s, b) => verdictFor({ node: n, browserSingle: s, browserBurst: b })

  check('all three healthy is reachable', v(OK, OK, OK) === 'reachable')
  check('node and browser both refused is the documented outage',
    v(FAIL, FAIL, FAIL) === 'service-unreachable')
  check('NODE OK WHILE THE BROWSER FAILS IS ITS OWN STATE',
    v(OK, FAIL, FAIL) === 'browser-only',
    'this is the reading render-check cannot currently make, and the reason for this probe')
  check('a single browser request landing while the burst fails is CONCURRENCY, not reachability',
    v(OK, OK, FAIL) === 'burst-refused')
  check('the browser answering while node does not is also distinct',
    v(FAIL, OK, OK) === 'node-only')
  // The three-state rule: a measurement that did not happen is never a pass, and
  // it outranks every other reading rather than being averaged into one.
  check('an unmeasured leg is not-observable, whatever the others say',
    v(OK, OK, UNMEASURED) === 'not-observable',
    'a burst that never ran cannot report that bursting is fine')
  check('...and it outranks even an otherwise-clean reading',
    v(UNMEASURED, OK, OK) === 'not-observable')
  check('OMITTING A LEG THROWS — it cannot be silently undefined', (() => {
    try { verdictFor({ node: OK, browserSingle: OK }); return false } catch { return true }
  })(), 'undefined would compare unequal to FAIL and fall through to reachable')
  check('every verdict names a repair',
    ['not-observable', 'service-unreachable', 'node-only', 'browser-only', 'burst-refused', 'reachable']
      .every(x => typeof repairFor(x) === 'string' && repairFor(x).length > 0))
  process.exit(summarize() === 0 ? 0 : 1)
}

if (isMain(import.meta.url)) {
  const { chromium } = await import('playwright')
  const { forecastUrl } = await import('../build/Weather.js')
  const V = await import('../build/Venues.js')

  // The eight venues the failing run actually named, in its order, so the burst
  // is the one that failed rather than a burst of the same size.
  const NAMES = ['Tropicana Field', 'Great American Ball Park', 'PNC Park', 'Progressive Field',
                 'Fenway Park', 'Target Field', 'Kauffman Stadium', 'Wrigley Field']
  const venues = [...V.all].filter(v => NAMES.includes(v.Name))
  if (venues.length !== NAMES.length) {
    console.error(`the venue table resolved ${venues.length} of ${NAMES.length} named venues — probing a different burst than the one that failed`)
    process.exit(1)
  }
  const urls = venues.map(v => forecastUrl(v.Where))

  const timed = async (fn) => {
    const t0 = Date.now()
    try { return { m: (await fn()) ? OK : FAIL, ms: Date.now() - t0, note: '' } }
    catch (e) { return { m: FAIL, ms: Date.now() - t0, note: String(e.message || e).slice(0, 160) } }
  }

  console.log(`\n  probing ${urls.length} venue(s) from node and from chromium\n`)

  const node1 = await timed(async () => {
    const r = await fetch(urls[4], { signal: AbortSignal.timeout(15_000) })
    console.log(`  node   single   HTTP ${r.status}`)
    return r.ok
  })
  if (node1.m === FAIL) console.log(`  node   single   FAILED — ${node1.note}`)

  const sessionChromium = '/opt/pw-browsers/chromium'
  const browser = await chromium.launch(existsSync(sessionChromium) ? { executablePath: sessionChromium } : {})
  const page = await browser.newPage()
  // about:blank, not the app. The page's own weather code has waves, budgets and
  // a retry; running through it would measure THOSE, and what is in question is
  // whether the browser can reach the host at all.
  await page.goto('about:blank')

  const browser1 = await timed(() => page.evaluate(async (u) => {
    const r = await fetch(u, { signal: AbortSignal.timeout(15_000) })
    return r.ok
  }, urls[4]))
  console.log(`  chrome single   ${browser1.m} in ${browser1.ms}ms${browser1.note ? ' — ' + browser1.note : ''}`)

  const burst = await page.evaluate(async (us) => {
    const t0 = Date.now()
    const rs = await Promise.all(us.map(async (u) => {
      const s = Date.now()
      try {
        const r = await fetch(u, { signal: AbortSignal.timeout(15_000) })
        return { ok: r.ok, status: r.status, start: s - t0, ms: Date.now() - s }
      } catch (e) { return { ok: false, status: 0, start: s - t0, ms: Date.now() - s, err: String(e.message || e) } }
    }, us))
    return rs
  }, urls)
  const burstOk = burst.filter(r => r.ok).length
  console.log(`  chrome burst    ${burstOk}/${burst.length} answered`)
  for (const r of burst) console.log(`      ${String(r.start).padStart(6)}+${String(r.ms).padStart(6)}ms  ${r.ok ? 'HTTP ' + r.status : 'FAILED ' + (r.err ?? '')}`)

  await browser.close()

  const measurements = {
    node: node1.m,
    browserSingle: browser1.m,
    browserBurst: burstOk === burst.length ? OK : FAIL,
  }
  const verdict = verdictFor(measurements)
  console.log(`\n  VERDICT: ${verdict}`)
  console.log(`  ${repairFor(verdict)}\n`)

  mkdirSync('outbox', { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const out = `outbox/open-meteo-egress-${stamp}.json`
  writeFileSync(out, JSON.stringify({
    at: new Date().toISOString(), verdict, repair: repairFor(verdict), measurements,
    node: node1, browserSingle: browser1, burst,
  }, null, 2))
  console.log(`  ${out}`)

  // The probe REPORTS. It does not gate: every verdict except not-observable is a
  // real reading, and exiting non-zero on 'browser-only' would make a diagnostic
  // into a second thing that has to be kept green.
  process.exit(verdict === 'not-observable' ? 1 : 0)
}
