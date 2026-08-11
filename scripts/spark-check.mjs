// The drama sparkline, on the real 504-sample arc.
//
// Two claims are load-bearing, and both are checked against the alternative
// that was actually shipped rather than against nothing:
//
//   FIXED DOMAIN. A bar's height in percent IS the drama value. The failure it
//   replaces is normalising to the series maximum, which renders every game as
//   a wall topping out at 100% — the committed arc spans 51-81 and would draw
//   as 63-100%.
//
//   BUCKETED MAX. The maximum of the output equals the maximum of the input.
//   That is FALSE for every-Nth sampling, which is what shipped, and it is the
//   difference between a chart that shows the closest moment and one that can
//   step over it.
//
// Usage:  node scripts/spark-check.mjs

import { chromium } from 'playwright'
import { existsSync, readFileSync } from 'node:fs'
import { createChecks, toArray } from './checks.mjs'
import { decodePayload, gameStateAt, amnestyZone, sparklineBars, barHeightStyle } from '../build/Desk.js'

const { check, summarize } = createChecks()
const URL_BASE = process.env.URL || 'http://localhost:8080/?data=games-2026-08-09'

// The real arc, read straight from the capture so the expectations below are
// about live data rather than about a fixture written to agree with the code.
const capture = JSON.parse(readFileSync('data/games-2026-08-09.json', 'utf8'))
const arcGame = capture.games.regular.find(g => g.drama_arc)
const arc = JSON.parse(arcGame.drama_arc)
const arcMax = Math.max(...arc)
const arcMin = Math.min(...arc)

console.log(`\n  ${arcGame.id}: ${arc.length} samples, range ${arcMin}-${arcMax}\n`)

const sessionChromium = '/opt/pw-browsers/chromium'
const browser = await chromium.launch(
  existsSync(sessionChromium) ? { executablePath: sessionChromium } : {})
const page = await browser.newPage()
const pageErrors = []
page.on('pageerror', e => pageErrors.push(String(e)))

await page.goto(URL_BASE, { waitUntil: 'networkidle' })

const card = `.desk-card[data-game-id="${arcGame.id}"]`
const bars = await page.$$eval(`${card} .spark__bar`, els =>
  els.map(e => Number(/height:\s*(\d+)%/.exec(e.getAttribute('style'))?.[1])))

check('the finished game renders a sparkline', bars.length > 0,
  'no bars — the chart did not render at all')

check('it is 30 bars', bars.length === 30, `${bars.length} bars`)

// --- the fixed domain --------------------------------------------------------

check('every bar height is within the 0-100 domain',
  bars.every(b => Number.isFinite(b) && b >= 0 && b <= 100),
  `heights: ${JSON.stringify(bars)}`)

// The discriminating assertion. Under max-normalisation the tallest bar is
// ALWAYS 100, whatever the data; under a fixed domain it is the arc's peak.
check('the tallest bar equals the arc peak, not 100%',
  Math.max(...bars) === arcMax,
  `tallest bar ${Math.max(...bars)}%, arc peak ${arcMax} — ` +
  `${Math.max(...bars) === 100 ? 'this is what max-normalisation looks like' : 'neither value matches'}`)

check('there is real headroom above the chart',
  Math.max(...bars) < 100,
  'the arc genuinely peaks at 100, so this check cannot discriminate on this capture')

// A game peaking at 20 and one peaking at 95 must not draw the same silhouette.
// Simulated directly on the shape: under max-normalisation both become 100.
const normalised = series => { const m = Math.max(...series); return series.map(v => Math.round(v * 100 / m)) }
check('max-normalisation would flatten two different games into one silhouette',
  Math.max(...normalised([10, 20])) === Math.max(...normalised([90, 95])),
  'the alternative being rejected does not actually have this property')

check('...and the fixed domain does not',
  Math.max(...[10, 20]) !== Math.max(...[90, 95]),
  'the fixed domain has the same flaw')

// --- bucketed max ------------------------------------------------------------

check('the peak survives downsampling',
  Math.max(...bars) === arcMax,
  `the chart's tallest bar is ${Math.max(...bars)} but the arc peaks at ${arcMax}`)

// The alternative, run over MANY arcs.
//
// The first version of this row tested every-Nth against the single committed
// arc — and every-Nth kept the peak, because 81 happens to sit at an index it
// samples. The row passed while proving nothing, which is the same shape as
// every other half-working check this session. It caught itself only because it
// was written to say so.
//
// So the property is exercised over 504 real series instead of one: each prefix
// of the real arc. Bucketed max must keep the peak on EVERY one; every-Nth is
// counted, not assumed. The bars come from the real F# via the public API —
// decode a payload, take the SealedArc, call sparklineBars — so this tests the
// shipped implementation and not a JS re-write of it, which is the mistake
// zone-check made.
const everyNth = (series, n) => series.filter((_, i) => i % Math.ceil(series.length / n) === 0)

const barsFor = series => {
  const payload = decodePayload(JSON.stringify({
    ok: true, date: '2026-06-15',
    games: { regular: [{ ...arcGame, drama_arc: JSON.stringify(series) }], postseason: [] },
    briefs: [], series: [], standings: [],
  }))
  if (payload.tag !== 0) throw new Error(`fixture did not decode: ${payload.fields[0]}`)
  const g = toArray(payload.fields[0].Regular)[0]
  const zone = amnestyZone(gameStateAt(new Date('2026-08-01T12:00:00Z'), g))
  if (zone.tag !== 0) throw new Error('the fixture game was not final, so there is no zone')
  return toArray(sparklineBars(30, g.DramaArc.fields[0]))
    .map(b => Number(/height:\s*(\d+)%/.exec(barHeightStyle(zone.fields[0], b))[1]))
}

let bucketKept = 0, nthLost = 0, tried = 0
for (let end = 40; end <= arc.length; end += 1) {
  const series = arc.slice(0, end)
  const wanted = Math.max(...series)
  tried += 1
  if (Math.max(...barsFor(series)) === wanted) bucketKept += 1
  if (Math.max(...everyNth(series, 30)) < wanted) nthLost += 1
}

check('bucketed max keeps the peak on EVERY real series tried',
  bucketKept === tried,
  `kept the peak on ${bucketKept} of ${tried}`)

check('every-Nth loses the peak on some of them, so the two differ',
  nthLost > 0,
  `every-Nth kept the peak on all ${tried} series — the two strategies are ` +
  `indistinguishable on this data and this claim is untested`)

console.log(`      over ${tried} real series: bucketed max kept the peak ${bucketKept} times, ` +
            `every-Nth lost it ${nthLost} times`)

// --- the ADR-002 gate --------------------------------------------------------

const liveSparks = await page.$$eval('.desk-card', cards =>
  cards.filter(c => {
    const status = c.querySelector('[data-testid="status"]')?.textContent ?? ''
    return !/final/i.test(status) && c.querySelector('.spark__bar') !== null
  }).map(c => c.dataset.gameId))

check('no unfinished game renders a sparkline',
  liveSparks.length === 0,
  `live cards with bars: ${JSON.stringify(liveSparks)} — a chart of a live composite`)

// --- the caption -------------------------------------------------------------

const caption = await page.textContent(`${card} .spark__caption`)
check('the caption names the peak', /drama over time \(peak \d+\)/.test(caption ?? ''),
  `caption: ${caption}`)

check('the caption peak matches the arc peak',
  Number(/peak (\d+)/.exec(caption ?? '')?.[1]) === arcMax,
  `caption says ${/peak (\d+)/.exec(caption ?? '')?.[1]}, arc peaks at ${arcMax}`)

// --- the track ---------------------------------------------------------------

const trackHeight = await page.$eval(`${card} .spark__row`, e => e.getBoundingClientRect().height)
check('the track is at least the 44px GLYPH minimum',
  trackHeight >= 44,
  `${trackHeight}px — production shipped 24px, at which a 30-point spread is ~7px`)

// --- out-of-domain samples ---------------------------------------------------
//
// `arcOutOfDomain` was written to name samples outside 0-100 and then read by
// nothing for a day — the "written but never read back" shape. It is wired to
// the panel now, but neither committed capture contains an out-of-domain value,
// so the branch would still never execute. A consumer that cannot run is not a
// consumer.
//
// So the condition is forced: inject 150 and -5 into the real arc and require
// both that they are NAMED and that the bar is CLAMPED. Without the second
// half, a 150% tall bar would be a layout bug sitting under an honest caption.
const rogue = JSON.parse(JSON.stringify(capture))
const rogueArc = JSON.parse(arcGame.drama_arc)
rogueArc[10] = 150
rogueArc[11] = -5
rogue.games.regular = [{ ...arcGame, drama_arc: JSON.stringify(rogueArc) }]
rogue.games.postseason = []

const probe = await browser.newPage()
const probeErrors = []
probe.on('pageerror', e => probeErrors.push(String(e)))
await probe.route('**/context/date/**', r =>
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rogue) }))
await probe.route('**/analytics/newspaper/**', r =>
  r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
await probe.goto(`http://localhost:8080/?date=${arcGame.date}`, { waitUntil: 'networkidle' })

const probeCaptions = await probe.$$eval('.spark__caption', es => es.map(e => e.textContent))
check('out-of-domain samples are named on the page',
  probeCaptions.some(c => /outside the 0-100 domain: .*150.*-5/.test(c ?? '')),
  `captions: ${JSON.stringify(probeCaptions)}`)

const probeBars = await probe.$$eval('.spark__bar', es =>
  es.map(e => Number(/height:\s*(\d+)%/.exec(e.getAttribute('style'))?.[1])))
check('an out-of-domain sample is clamped, not drawn past the track',
  Math.max(...probeBars) === 100,
  `tallest bar ${Math.max(...probeBars)}% — a 150 rendered at full height`)

check('no page errors on the out-of-domain probe', probeErrors.length === 0,
  probeErrors.join(' | '))
await probe.close()

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '))

await browser.close()
process.exit(summarize() === 0 ? 0 : 1)
