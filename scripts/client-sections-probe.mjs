// Does the CLIENT's live slate give every sport that has games today a section
// of cards? Runs a real Chromium against the deployed client page and writes a
// manifest and a screenshot to outbox/.
//
// MOVED here 2026-10-24 from jubilant-bassoon (`today_sections_probe.js`, its
// commit 6e4b3947), on the owner's word: LAB-FIRST-A says new proofs belong in
// this repo. The client's own manifests from 2026-10-24 stay where they were
// written, in jubilant-bassoon outbox/today-sections-probe-*.
//
// WHY IT EXISTS. On 2026-10-24 the live client held 12 NHL and 8 NBA games in
// `espnScores` and rendered no card for either, because nothing created their
// sections. Every check that read source or ran a harness was green. This is the
// check that reads the page. It was red at 16:12Z (NHL 0 of 12, NBA 0 of 8) and
// green at 16:55Z (12 and 8), the day the client was fixed
// (jubilant-bassoon docs/CC-CMD-2026-10-24-nhl-nba-today-sections.md).
//
// THE VERDICT, per watched V2 sport:
//   PASS            it has games today in espnScores, and cards
//   FAIL            it has games today in espnScores, and no cards
//   NO GAMES TODAY  not judged
//   UNJUDGEABLE     its games' days cannot be read, or the page gives no section
//                   label for the key. Fails: a probe that cannot judge must not
//                   pass as "no games".
// The ET day is computed here with Intl, not with the page's `isToday`: the
// probe must not trust the code it judges.
//
// The section label for a key comes from the page's own V2_SECTION_LABEL, parsed
// out of the served HTML, so this file holds no copy of it (a copy drifts; the
// first version of this probe carried a six-entry one and called every other sport
// a FAIL). It is parsed from the source and not read at runtime because the
// client's script is a module: its top-level consts are not globals (measured
// 2026-10-24, `typeof V2_SECTION_LABEL` is 'undefined' on the live page).
//
//   node scripts/client-sections-probe.mjs --self-test   (verdict only; no browser)
//   FIELD_URL=... WATCH=nhl,nba node scripts/client-sections-probe.mjs

import fs from 'node:fs'
import { isMain } from './checks.mjs'

const FIELD_URL = (process.env.FIELD_URL || 'https://jubilant-bassoon.jeffunglesbee.workers.dev') + '?wpt'
const OUT = process.env.OUT_DIR || 'outbox'
const WATCH = (process.env.WATCH || 'nhl,nba').split(',').map(s => s.trim()).filter(Boolean)

/**
 * One sport's verdict from what the page showed. Exported so the self-test runs
 * the real function.
 * @param {{scoresToday:number, unknownDay:number}} s  espnScores entries for this key
 * @param {number} cards  cards whose data-sport is this key's section label
 * @param {string|null} label  the page's section label for the key
 */
export function verdictFor (s, cards, label) {
  if (!label) return 'UNJUDGEABLE'
  if (s.scoresToday > 0) return cards > 0 ? 'PASS' : 'FAIL'
  return s.unknownDay > 0 ? 'UNJUDGEABLE' : 'NO GAMES TODAY'
}

/**
 * The key -> section label map, from the served page's `V2_SECTION_LABEL = {...}`.
 * Null when the declaration is absent or yields nothing, so the probe reports
 * UNJUDGEABLE instead of guessing.
 */
export function parseSectionLabels (html) {
  const m = /V2_SECTION_LABEL\s*=\s*\{([^}]*)\}/.exec(html)
  if (!m) return null
  const out = {}
  for (const [, k, v] of m[1].matchAll(/([A-Za-z0-9_]+)\s*:\s*["']([^"']+)["']/g)) out[k] = v
  return Object.keys(out).length ? out : null
}

const failing = judged => judged.some(j => j.verdict === 'FAIL' || j.verdict === 'UNJUDGEABLE')

function selfTest () {
  const cases = [
    [{ scoresToday: 12, unknownDay: 0 }, 12, 'NHL', 'PASS', 'games today and cards'],
    [{ scoresToday: 12, unknownDay: 0 }, 0, 'NHL', 'FAIL', 'the 2026-10-24 defect: 12 games and no cards'],
    [{ scoresToday: 0, unknownDay: 0 }, 0, 'NHL', 'NO GAMES TODAY', 'nothing to judge'],
    [{ scoresToday: 0, unknownDay: 5 }, 0, 'NHL', 'UNJUDGEABLE', 'days unreadable is not "no games"'],
    [{ scoresToday: 12, unknownDay: 0 }, 12, null, 'UNJUDGEABLE', 'a key with no section label is not a FAIL'],
    [{ scoresToday: 3, unknownDay: 2 }, 0, 'MLS Soccer', 'FAIL', 'a readable game today and no cards fails whatever else is unreadable'],
  ]
  let bad = 0
  for (const [s, cards, label, want, why] of cases) {
    const got = verdictFor(s, cards, label)
    const ok = got === want
    if (!ok) bad++
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${want.padEnd(15)} got ${got}  (${why})`)
  }
  const exits = [
    [[{ verdict: 'PASS' }, { verdict: 'NO GAMES TODAY' }], false],
    [[{ verdict: 'PASS' }, { verdict: 'FAIL' }], true],
    [[{ verdict: 'UNJUDGEABLE' }], true],
  ]
  for (const [j, want] of exits) {
    const ok = failing(j) === want
    if (!ok) bad++
    console.log(`${ok ? 'PASS' : 'FAIL'}  exit ${want ? 'red' : 'green'} for ${j.map(x => x.verdict).join(', ')}`)
  }
  // The parse, on a snippet of the real declaration (served 2026-10-24) and on
  // two shapes that must yield null rather than a guess.
  const real = 'const V2_SECTION_LABEL = {\n  nba: "NBA", nhl: "NHL", wnba: "WNBA", nfl: "NFL", cfb: "College Football",\n  mls: "MLS Soccer", epl: "Premier League", ucl: "UEFA Champions League",\n};\nreturn V2_SECTION_LABEL[sportKey]'
  const parsed = parseSectionLabels(real)
  const parseCases = [
    [parsed?.nhl === 'NHL' && parsed?.nba === 'NBA' && parsed?.cfb === 'College Football' && Object.keys(parsed).length === 8, 'the real declaration parses to 8 keys'],
    [parseSectionLabels('<html>no map here</html>') === null, 'no declaration -> null'],
    [parseSectionLabels('const V2_SECTION_LABEL = {};') === null, 'an empty map -> null'],
    [parseSectionLabels('V2_SECTION_LABEL[sportKey]') === null, 'a use without a declaration -> null'],
    [(() => { const r = parseSectionLabels('x = V2_SECTION_LABEL[k] || { a: "b" }; const V2_SECTION_LABEL = { nba: "NBA" };')
              return r && Object.keys(r).join() === 'nba' })(), 'a use before the declaration does not shadow it'],
  ]
  for (const [ok, why] of parseCases) {
    if (!ok) bad++
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${why}`)
  }
  const total = cases.length + exits.length + parseCases.length
  console.log(`\nself-test: ${total - bad}/${total}`)
  process.exit(bad ? 1 : 0)
}

// Everything below runs the probe, so it runs only when this file is the
// program. Importing it (verdictFor is exported) must not open a browser:
// check:import-purity found it doing exactly that (verify 40116546191).
if (isMain(import.meta.url)) {
if (process.argv.includes('--self-test')) selfTest()

const { chromium } = await import('playwright')
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)) })
await page.goto(FIELD_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })

const read = () => page.evaluate(() => {
  const cards = {}
  document.querySelectorAll('.game-card[data-sport]').forEach(e => {
    const s = e.getAttribute('data-sport'); cards[s] = (cards[s] || 0) + 1
  })
  const todayIso = (typeof TODAY_ISO !== 'undefined' && TODAY_ISO) || window.TODAY_ISO || null
  const etDay = iso => {
    const t = Date.parse(iso || '')
    return Number.isFinite(t) ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(t)) : null
  }
  const scores = {}
  for (const v of Object.values(window.espnScores || {})) {
    const k = (v && v._sport) || '?'
    const day = v && etDay(v.start_time)
    const today = day && todayIso ? day === todayIso : null
    scores[k] = scores[k] || { all: 0, scoresToday: 0, unknownDay: 0 }
    scores[k].all++
    if (today === true) scores[k].scoresToday++
    else if (today === null) scores[k].unknownDay++
  }
  const chips = [...document.querySelectorAll('.chip, .filter-chip, [data-filter]')]
    .map(c => c.textContent.trim()).filter(Boolean).slice(0, 60)
  return { cards, scores, chips, sw: window.SW_VERSION || null, today: todayIso }
})

const labels = parseSectionLabels(await page.evaluate(() => fetch(location.origin + '/').then(r => r.text())))

// The client injects sections after its first V2 poll. Sample until the per-sport
// card counts are equal three times in a row, or 90 s pass.
const samples = []
let last = '', same = 0, state = null
const t0 = Date.now()
while (Date.now() - t0 < 90000) {
  await page.waitForTimeout(5000)
  state = await read()
  const key = JSON.stringify(state.cards)
  samples.push({ t: Math.round((Date.now() - t0) / 1000), cards: state.cards })
  same = key === last ? same + 1 : 0
  last = key
  if (same >= 2) break
}

const judged = WATCH.map(k => {
  const s = state.scores[k] || { all: 0, scoresToday: 0, unknownDay: 0 }
  const label = labels?.[k] ?? null
  const cards = label ? (state.cards[label] || 0) : 0
  return { key: k, label, scoresToday: s.scoresToday, scoresAll: s.all, unknownDay: s.unknownDay, cards,
           verdict: verdictFor(s, cards, label) }
})

fs.mkdirSync(OUT, { recursive: true })
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const shot = `${OUT}/client-sections-probe-${ts}.png`
try { await page.screenshot({ path: shot, fullPage: false, timeout: 10000 }) } catch (_) { /* recorded as null below */ }
const manifest = {
  probed_at: new Date().toISOString(), url: FIELD_URL, sw_version: state.sw, today_iso: state.today,
  judged, cards_by_sport: state.cards, espn_scores_by_sport: state.scores, section_labels_read: !!labels,
  chips: state.chips, settle_samples: samples, console_errors: errors.slice(0, 20),
  screenshot: fs.existsSync(shot) ? shot : null,
  coverage: `judged ${judged.filter(j => j.verdict === 'PASS' || j.verdict === 'FAIL').length} of ${judged.length} watched sports (${WATCH.join(', ')}); a sport with no games today in espnScores is not judged; one whose games' days or section label cannot be read fails`,
}
fs.writeFileSync(`${OUT}/client-sections-probe-manifest-${ts}.json`, JSON.stringify(manifest, null, 2))
fs.writeFileSync(`${OUT}/client-sections-probe-manifest-latest.json`, JSON.stringify(manifest, null, 2))
for (const j of judged) console.log(`${j.verdict.padEnd(15)} ${j.key} (${j.label ?? 'no label'}): ${j.cards} cards, ${j.scoresToday} games today in espnScores`)
console.log(manifest.coverage)
await browser.close()
process.exit(failing(judged) || !state.today ? 1 : 0)
}
