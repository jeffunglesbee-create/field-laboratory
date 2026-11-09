// WIRING PROOF OF THE EPL FORECAST ON THE DEPLOYED LAB PAGE, FOR table-v2. One-off measurement, written 2026-11-09 for
// docs/CC-CMD-2026-09-11-epl-forecaster-phase1.md; the record is outbox/cc-session-2026-11-09-fit-c.md ("Phase B").
//
// THIS IS outbox/forecast-deployed-wiring-2026-11-08.mjs (which measured table-v1 and stays as that record) WITH FOUR DIFFERENCES, and no others:
//   1. the served-string needles and the method statement are table-v2's;
//   2. `exactLinesAreTable_v2s`: the two cards that carry a number must print EXACTLY the lines worked out from the committed table in plain
//      JavaScript (Arsenal v Leeds 62 / 27 / 11, Chelsea v Bournemouth 46 / 27 / 27), so a deployed page that still ran table-v1 (92 / 5 / 3 and
//      57 / 19 / 25 for the same cards) fails on the number and not only on the tag;
//   3. this header;
//   4. the method statement's needle in build/Forecast.js is the SECOND HALF of the sentence (`: ppg + 0.25*gdpg ...`), not the whole of it.
//      `METHOD = METHOD_TAG + ": ppg ..."` compiles to two literals, so `table-v2: ppg ...` is never in the file. The first run against the
//      deployed page (outbox/forecast-deployed-wiring-2026-11-09-first-run.txt, kept) failed `everyServedStringPresent` on exactly that
//      needle, while every served file was byte-identical to the local build and the rendered cards carried the full sentence (`c.method`,
//      read at run time): the needle was wrong, the build was not. The corrected needle is shown to fail on a build with a different
//      constant by outbox/forecast-deployed-wiring-needle-mutation-2026-11-09.mjs.
//
// WHAT IT PROVES. That the build GitHub deployed is the build that was made from the pushed commit (four served files byte-identical to the
// local build, and /version.txt equal to the pushed sha), and that on that deployed page an EPL card draws the model's line under the market's.
// WHAT IT DOES NOT PROVE. Anything about the model. The page is pinned to the committed 2026-10-10 capture and to the committed 2026-11-08
// table, the browser clock is fixed at 2026-10-10T09:00Z so every kickoff of that day is ahead, and each EPL card is flipped to Scheduled
// with the page's own test hook (`window.__labSetState`, present only with `simulate=1`). A 2026-11-08 table applied to 2026-10-10 fixtures
// is hindsight: the line is wired, the numbers are not a forecast. The first real forecast on a real card cannot exist before 2026-11-21
// (premise 3 of outbox/forecast-premises-2026-11-08.txt) and is STAGED, see the session document.
//
// USAGE.  npm run build && PW_CHROMIUM=/opt/pw-browsers/chromium node outbox/forecast-deployed-wiring-2026-11-09.mjs <site> <pushed-sha> <out-prefix>
//   writes <out-prefix>.png (the EPL section, 2x) and <out-prefix>.json (the manifest). Exit 0 only if every check below holds.
//   The local `public/` must come from the same commit as the deployed page, or the digest comparison says so.
//
// COVERAGE, printed in the manifest as `coverage`: the number of EPL cards on the page, how many carry the node, and how many files were compared.

import { chromium } from 'playwright'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

const [site, expectedSha, outPrefix] = process.argv.slice(2)
if (!site || !expectedSha || !outPrefix) {
  console.error('usage: node outbox/forecast-deployed-wiring-2026-11-09.mjs <site> <pushed-sha> <out-prefix>')
  process.exit(2)
}

const sha256 = b => createHash('sha256').update(b).digest('hex')
const local = file => { try { return sha256(readFileSync(new URL(`../public/${file}`, import.meta.url))) } catch { return null } }

// Each string sits in the file that DECLARES it. `table-v2` is Forecast.METHOD_TAG, so it is in build/Forecast.js; CardForecast.js only
// imports the name. (The first run of this script put it under CardForecast.js and reported it absent: a wrong needle, not a wrong build.)
const FILES = [
  ['build/Forecast.js', ['"table-v2"', ': ppg + 0.25*gdpg + 0.10*gfpg, home +0.42, scale 1.14, draw 0.27 for every match']],
  ['build/CardForecast.js', ['standings loading', 'no forecast: standings unavailable', 'not in the standings table']],
  ['build/Scoreboard.js', ['data-forecast', 'desk-card__forecast']],
  ['build/Standings.js', ['more than one row answers to']],
  ['data/standings-eng1-2026-11-08.json', ['"shortDisplayName"']],
]
// The words a line would use to state a difference from the market (scripts/forecast-render-check.mjs holds the full list and its own
// counterexamples). "points" is not here on purpose: the refusal for a club carrying a points deduction says so, correctly.
// Worked from the committed table (data/standings-eng1-2026-11-08.json) in plain JavaScript with the constants the pre-registered fit printed, not read from the F#.
const EXACT = {
  'Arsenal v Leeds': 'model table-v2 — Arsenal 62% · draw 27% · Leeds 11%',
  'Chelsea v Bournemouth': 'model table-v2 — Chelsea 46% · draw 27% · Bournemouth 27%',
}
const RULING_VOCABULARY = /\b(edge|gap|pts|delta|diff|value|bet|mispriced)\b/i

const manifest = { site, probedAt: new Date().toISOString(), expectedSha, served: { version: null, files: {} }, page: {}, coverage: '', checks: {}, verdict: '' }

manifest.served.version = (await (await fetch(`${site}/version.txt`)).text()).trim()
for (const [file, needles] of FILES) {
  const res = await fetch(`${site}/${file}`)
  const body = Buffer.from(await res.arrayBuffer())
  const text = body.toString('utf8')
  const localSha = local(file)
  manifest.served.files[file] = {
    status: res.status, bytes: body.length, sha256: sha256(body), localSha256: localSha, identicalToLocalBuild: localSha === sha256(body),
    contains: Object.fromEntries(needles.map(n => [n, text.includes(n)])),
  }
}

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {})
const page = await (await browser.newContext({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 2 })).newPage()
const standingsRequests = []
const errors = []
page.on('request', r => { if (/standings/.test(r.url())) standingsRequests.push(r.url()) })
page.on('pageerror', e => errors.push(String(e)))
await page.clock.setFixedTime('2026-10-10T09:00:00Z')
const url = `${site}/?data=context-2026-10-10&simulate=1`
await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForSelector('.desk-card')
const eplCards = await page.$$eval('section[data-sport="EPL"] .desk-card', cs => cs.length)
const flipped = await page.$$eval('.desk-card', cs => cs.map((c, i) => [i, !!c.querySelector('[data-testid=forecast]')]).filter(x => x[1]).map(x => x[0]))
for (const i of flipped) await page.evaluate(i => window.__labSetState(i, 'scheduled'), i)
await page.waitForTimeout(300)
const cards = await page.$$eval('.desk-card', cs => cs.filter(c => c.querySelector('[data-testid=forecast]')).map(c => {
  const f = c.querySelector('[data-testid=forecast]')
  const m = c.querySelector('[data-testid=winprob]')
  return {
    teams: (c.querySelector('.desk-card__teams')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
    market: (m?.textContent ?? '').trim(),
    kind: f.getAttribute('data-forecast'),
    text: f.textContent,
    method: f.getAttribute('data-method'),
    afterMarket: m ? (m.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 : null,
  }
}))
manifest.page = { url, clock: '2026-10-10T09:00:00Z (fixed)', eplCards, cardsWithTheNode: cards.length, standingsRequests, errors, cards }

const box = await page.$eval('section[data-sport="EPL"]', s => { const r = s.getBoundingClientRect(); return { x: 0, y: r.top + window.scrollY, width: document.documentElement.clientWidth, height: r.height } })
await page.screenshot({ path: `${outPrefix}.png`, fullPage: true, clip: box })
await browser.close()

const files = Object.values(manifest.served.files)
const kinds = {}
for (const c of cards) kinds[c.kind] = (kinds[c.kind] ?? 0) + 1
manifest.page.kinds = kinds
manifest.coverage = `${cards.length} of ${eplCards} EPL cards on the page carry the forecast node; ${files.length} served files compared with the local build; 1 pinned page, 1 clock`
manifest.checks = {
  versionIsThePushedSha: manifest.served.version === expectedSha,
  everyServedFileIdenticalToTheLocalBuild: files.every(f => f.identicalToLocalBuild),
  everyServedStringPresent: files.every(f => Object.values(f.contains).every(Boolean)),
  everyEplCardCarriesTheNode: eplCards > 0 && cards.length === eplCards,
  atLeastOneModelLine: (kinds.model ?? 0) >= 1,
  everyLineSitsAfterTheMarketLine: cards.every(c => c.afterMarket === true),
  everyModelLineIsLabelledWithItsMethod: cards.filter(c => c.kind === 'model').every(c => /^model table-v2 — /.test(c.text) && c.method === 'table-v2: ppg + 0.25*gdpg + 0.10*gfpg, home +0.42, scale 1.14, draw 0.27 for every match'),
  exactLinesAreTable_v2s: Object.entries(EXACT).every(([teams, line]) => cards.filter(c => c.teams === teams).length === 1 && cards.find(c => c.teams === teams).text === line),
  noLineUsesTheRulingsVocabulary: cards.every(c => !RULING_VOCABULARY.test(c.text.replace(/^model table-v2 — /, ''))),
  oneRequestForTheTable: standingsRequests.length === 1 && standingsRequests[0].endsWith('/data/standings-eng1-2026-11-08.json'),
  noPageErrors: errors.length === 0,
}
manifest.verdict = Object.values(manifest.checks).every(Boolean) ? 'WIRED' : 'NOT-WIRED'
writeFileSync(`${outPrefix}.json`, JSON.stringify(manifest, null, 2) + '\n')
console.log(manifest.verdict, '|', manifest.coverage)
for (const [k, v] of Object.entries(manifest.checks)) console.log(v ? 'PASS' : 'FAIL', k)
process.exitCode = manifest.verdict === 'WIRED' ? 0 : 1
