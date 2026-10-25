// The Metrics tab, driven in a real browser.
// docs/CC-CMD-2026-10-17-metrics-tab-render-path.md, TASK 6.
//
// The four empowerment metrics were 530/530 on the gate and absent from the
// page for two days, because no check asked whether anything rendered. This one
// asks, and it asks on the rendered DOM rather than on the modules, which the
// Suite already covers.
//
// EVERY ASSERTION IS A PURE PREDICATE OVER A SNAPSHOT, so `--self-test` can feed
// it a snapshot that must pass and, per predicate, one that must fail. A check
// that has only ever passed has proven nothing (field-relay-nba Rule 90).
//
// SECOND WIND, TASK 6.3. One committed game could not form the population
// curve, so the section was first a stated absence. On 2026-10-18 the owner
// chose to commit the population itself (option 1 of
// docs/CC-CMD-2026-10-18-second-wind-population-capture.md), and this now
// asserts all four cases, each from a committed game, and that the 656 files
// are fetched once, only on the section's first expand.
//
// Usage:  URL=http://localhost:8080/ node scripts/metrics-render-check.mjs
//         node scripts/metrics-render-check.mjs --self-test

import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { createChecks, finish, isMain } from './checks.mjs'

export const EXPECTED_TABS = [
  'tab-scoreboard', 'tab-field-pick', 'tab-scout-pick', 'tab-pickem', 'tab-weather',
  'tab-stats', 'tab-lineups', 'tab-briefs', 'tab-draw', 'tab-metrics', 'tab-verify',
]
export const FLOW_SUBJECTS = ['finished', 'inplay']
export const FRAMES = 'bdb-event-frames-2022-w2.json'
export const STAMINA_STATES = ['Insufficient', 'PopulationRate', 'SecondWind', 'TrailingRate']
export const POPULATION = 'nhl-second-wind-population/'

/** Each predicate: snapshot -> [pass, detail]. */
export const PREDICATES = {
  'the tablist names eleven tabs, Metrics directly before Verify, which stays last': s => [
    JSON.stringify(s.tabIds) === JSON.stringify(EXPECTED_TABS),
    `tabs ${JSON.stringify(s.tabIds)}`],

  'one tab selected, one in the tab order, and ArrowRight from Draw shows only the Metrics panel': s => [
    s.selectedAtBoot === 1 && s.inTabOrder === 1 && s.afterArrow.selected === 'tab-metrics'
      && JSON.stringify(s.afterArrow.visiblePanels) === '["panel-metrics"]' && s.afterEnd === 'tab-verify',
    `selected ${s.selectedAtBoot}, in order ${s.inTabOrder}, after ArrowRight ${JSON.stringify(s.afterArrow)}, End ${s.afterEnd}`],

  'nothing on the tab is fetched before the tab is opened': s => [
    s.fetchedBeforeTab.length === 0, `fetched at page load: ${JSON.stringify(s.fetchedBeforeTab)}`],

  'every Flow subject has a home and an away strip, each a witnessed minute strip with a named cell per minute': s => [
    FLOW_SUBJECTS.every(sub => ['home', 'away'].every(side => {
      const strip = s.flowStrips.find(x => x.subject === sub && x.side === side)
      return strip && strip.cells.length === 90 && strip.cells.every(c => c.flow === 'minute' && c.aria.trim() !== '')
    })),
    JSON.stringify(s.flowStrips.map(x => `${x.subject}/${x.side}: ${x.cells.length} cells, ${x.cells.filter(c => c.flow !== 'minute').length} not witnessed`))],

  'each Flow subject draws at least one minute with a non-empty style (an InFlow pulse)': s => [
    FLOW_SUBJECTS.every(sub => s.flowStrips.filter(x => x.subject === sub).some(x => x.cells.some(c => c.style.trim() !== ''))),
    JSON.stringify(s.flowStrips.map(x => `${x.subject}/${x.side}: ${x.cells.filter(c => c.style.trim() !== '').length} styled`))],

  'Second Wind draws all four cases, and a bare track is told from a ticked one by its geometry': s => {
    const of = st => s.secondWind.tracks.find(t => t.aria.includes(`${st} state active`))
    const found = STAMINA_STATES.map(of)
    return [found.every(Boolean)
      && found.every(t => (t.mark === 'track-only' && t.ticks === 0) || (t.mark === 'ticks' && t.ticks === 2))
      && found[0].mark === 'track-only' && found.slice(1).every(t => t.mark === 'ticks'),
      JSON.stringify(STAMINA_STATES.map((st, i) => `${st}: ${found[i] ? `${found[i].mark}/${found[i].ticks}` : 'absent'}`))]
  },

  'Second Wind fetches nothing before its section opens, then the manifest and every game once': s => [
    s.secondWind.fetchesBefore === 0 && s.secondWind.expectedFetches > 1
      && s.secondWind.fetchesAfter === s.secondWind.expectedFetches,
    `before ${s.secondWind.fetchesBefore}, after ${s.secondWind.fetchesAfter}, expected ${s.secondWind.expectedFetches}`],

  'Tactical Lock draws no mark and cites both proofs': s => [
    s.tacticalLock.present && s.tacticalLock.marks === 0
      && s.tacticalLock.text.includes('LOCK-PROOF') && s.tacticalLock.text.includes('AMNESTY-PROOF'),
    JSON.stringify({ ...s.tacticalLock, text: s.tacticalLock.text.slice(0, 120) })],

  'Gravity draws nothing and fetches nothing before its section is expanded': s => [
    s.gravity.marksBefore === 0 && s.gravity.framesFetchesBefore === 0,
    `marks ${s.gravity.marksBefore}, frames fetches ${s.gravity.framesFetchesBefore}`],

  'Gravity fetches the 1.8 MB capture exactly once, on expand, and draws marks of more than one opacity': s => [
    s.gravity.framesFetchesAfter === 1 && s.gravity.marks.length > 0
      && new Set(s.gravity.marks.filter(m => m.well !== 'unencoded').map(m => m.style)).size > 1,
    `fetches ${s.gravity.framesFetchesAfter}, marks ${s.gravity.marks.length}, distinct fills ${new Set(s.gravity.marks.map(m => m.style)).size}`],

  'an unencoded receiver has its own mark, distinct from every encoded shape': s => [
    s.gravity.marks.some(m => m.well === 'unencoded' && m.style === '')
      && s.gravity.marks.filter(m => m.well === 'unencoded').every(m => !['expanding', 'steady', 'contracting'].includes(m.well)),
    `unencoded ${s.gravity.marks.filter(m => m.well === 'unencoded').length} of ${s.gravity.marks.length}`],

  'no accessible name, and no state phrase, appears in the panel\'s visible text': s => {
    const leaked = s.ariaLabels.filter(a => a.length > 12 && s.innerText.includes(a))
    return [leaked.length === 0 && !/state active/i.test(s.innerText),
      `leaked ${leaked.length}: ${JSON.stringify(leaked.slice(0, 3))}`]
  },

  'every drawn node carries a non-empty accessible name': s => [
    s.imgNodes > 0 && s.imgNodesUnnamed === 0, `${s.imgNodesUnnamed} of ${s.imgNodes} role=img nodes unnamed`],

  // Owner, 2026-10-21: "none of these display in plain English". Every section
  // says what it measures and how to read it (or, for Tactical Lock, why
  // nothing is drawn), in paragraphs long enough to be sentences.
  'every section says in plain English what it measures and how to read it': s => {
    const second = { 'tactical-lock': 'Why nothing is drawn' }
    const bad = EXPLAINED.filter(key => {
      const e = s.explained.find(x => x.key === key)
      return !e || e.heads[0] !== 'What it measures' || e.heads[1] !== (second[key] || 'How to read it')
        || e.paras.length < 2 || e.paras.some(n => n < 40)
    })
    return [bad.length === 0, `missing or thin: ${JSON.stringify(bad)}; ${JSON.stringify(s.explained)}`]
  },

  'every finished row carries its sentence, and each sentence agrees with its accessible name': s => {
    const sw = s.narratives.secondWind, gr = s.narratives.gravity, fl = s.narratives.flow
    const bad = [
      ...sw.filter(r => !narrativeAgrees.secondWind(r)).map(r => `second wind: ${r.text} | ${r.aria}`),
      ...gr.filter(r => !narrativeAgrees.gravity(r)).map(r => `gravity: ${r.text}`),
      ...fl.filter(r => !narrativeAgrees.flow(r)).map(r => `flow: ${r.text}`),
    ]
    return [sw.length === 4 && gr.length === s.rows.gravity.length && gr.length > 0 && fl.length === 2 * FLOW_SUBJECTS.length && bad.length === 0,
      `second wind ${sw.length}, gravity ${gr.length} of ${s.rows.gravity.length} rows, flow ${fl.length}; disagreeing: ${JSON.stringify(bad.slice(0, 3))}`]
  },

  'Play frames draws every state the decoder names, each with its own edge, and nothing else': s => {
    const tiles = s.playFrames
    const seen = [...new Set(tiles.map(t => t.state))].sort()
    const want = Object.keys(FRAME_STATES).sort()
    const wrongEdge = tiles.filter(t => FRAME_STATES[t.state] !== t.border)
    return [JSON.stringify(seen) === JSON.stringify(want) && wrongEdge.length === 0,
      `states ${JSON.stringify(seen)} of ${JSON.stringify(want)}; wrong edge ${JSON.stringify(wrongEdge.slice(0, 3))}`]
  },

  'rows name players, teams and positions rather than bare ids': s => [
    s.rows.secondWind.length === 4 && s.rows.secondWind.every(l => /^\S.* \([A-Z]{2,3}\), [A-Z]{2,3} at [A-Z]{2,3}, \d{4}-\d{2}-\d{2}$/.test(l))
      && s.rows.gravity.length > 0 && s.rows.gravity.every(r => /^[A-Z]{2,3} offense v [A-Z]{2,3}, play \d+$/.test(r.label) && r.positions === r.marks),
    JSON.stringify({ secondWind: s.rows.secondWind, gravity: s.rows.gravity.slice(0, 2) })],
}

export const EXPLAINED = ['flow', 'second-wind', 'gravity', 'tactical-lock', 'play-frames']

// Play frames is not a metric. Its six decoder states, and the edge STYLE that
// carries each one (a colour alone is lost without colour vision). The tiles are
// constructed in src/LaboratorySurface.fs; nothing live feeds them.
export const FRAME_STATES = {
  'STANDARD': 'solid', 'SHOOTOUT': 'double', 'RESERVED IN USE': 'dashed',
  'UNKNOWN LAYOUT': 'dashed', 'PARTIAL RECORD': 'dashed', 'NO RECORDS': 'dotted',
}

// THE NARRATIVE AGREES WITH THE LABEL. Owner amendment 2026-10-21: a finished
// game gets a sentence (Flow.narrative, Stamina.staminaNarrative,
// Gravity.playNarrative). Each sentence is checked against the module's OTHER
// projection, the accessible name, so a wrong number in either one fails here.
const nums = (re, text) => { const m = re.exec(text || ''); return m ? m.slice(1) : null }
export const narrativeAgrees = {
  secondWind: ({ aria, text }) => {
    const ins = nums(/Insufficient state active, (\d+) attempts/, aria)
    if (ins) return nums(/^(\d+) shot attempts? in the first and last thirds of his ice time: too few to tell\.$/, text)?.[0] === ins[0]
    const a = nums(/last third (\d+) attempts against ([\d.]+) expected/, aria)
    const t2 = nums(/^Of \d+ shot attempts? in the first and last thirds of his ice time, (\d+) came in the last third, against ([\d.]+) expected/, text)
    return !!(a && t2 && a[0] === t2[0] && a[1] === t2[1])
  },
  gravity: ({ arias, text }) => {
    const coverage = nums(/\((\d+) in coverage\)/, text)?.[0]
    const body = (text || '').split(': ').slice(1).join(': ').split('.')[0]
    const parts = body.split(', ')
    if (!coverage || parts.length !== arias.length) return false
    return parts.every((part, i) => {
      if (/not running a route$/.test(part)) return /NotRouteRunner state active$/.test(arias[i])
      const pt = nums(/ (\d+) → (\d+)$/, part), ar = nums(/defenders drawn (-?\d+) of (\d+)$/, arias[i])
      return !!(pt && ar && Number(pt[1]) - Number(pt[0]) === Number(ar[0]) && ar[1] === coverage)
    })
  },
  flow: ({ cells, text }) => {
    if (/^.*: Never in flow/.test(text || '')) return cells.every(c => !c.aria.includes('InFlow'))
    const starts = [...(text || '').matchAll(/from (\d+)(\+\d+)?'/g)].map(m => Number(m[1]))
    return starts.length > 0 && starts.every(minute => (cells[minute - 1]?.aria || '').includes('InFlow'))
  },
}

/** A snapshot that holds every predicate, for the self-test. */
export const goodSnapshot = () => {
  const cell = (style) => ({ flow: 'minute', style, aria: 'Minute 1, home: InFlow state active, sequential xG 0.42' })
  const strip = (subject, side) => ({ subject, side, cells: Array.from({ length: 90 }, (_, i) => cell(i === 3 ? 'opacity: 0.42' : '')) })
  return {
    tabIds: [...EXPECTED_TABS], selectedAtBoot: 1, inTabOrder: 1,
    afterArrow: { selected: 'tab-metrics', visiblePanels: ['panel-metrics'] }, afterEnd: 'tab-verify',
    fetchedBeforeTab: [],
    flowStrips: FLOW_SUBJECTS.flatMap(sub => [strip(sub, 'home'), strip(sub, 'away')]),
    secondWind: {
      tracks: [
        { mark: 'track-only', ticks: 0, aria: 'Game 1, player 2: Insufficient state active, 1 attempts' },
        { mark: 'ticks', ticks: 2, aria: 'Game 1, player 3: PopulationRate state active, last third 3' },
        { mark: 'ticks', ticks: 2, aria: 'Game 1, player 4: SecondWind state active, last third 9' },
        { mark: 'ticks', ticks: 2, aria: 'Game 1, player 5: TrailingRate state active, last third 0' },
      ],
      fetchesBefore: 0, fetchesAfter: 657, expectedFetches: 657,
    },
    tacticalLock: { present: true, marks: 0, text: 'docs/LOCK-PROOF.md, docs/AMNESTY-PROOF.md' },
    gravity: {
      marksBefore: 0, framesFetchesBefore: 0, framesFetchesAfter: 1,
      marks: [{ well: 'steady', style: '--mx-fill: 0.250' }, { well: 'expanding', style: '--mx-fill: 0.500' }, { well: 'unencoded', style: '' }],
    },
    ariaLabels: ['Minute 1, home: InFlow state active, sequential xG 0.42'],
    playFrames: Object.entries(FRAME_STATES).map(([state, border]) => ({ state, border })),
    explained: ['flow', 'second-wind', 'gravity', 'tactical-lock', 'play-frames'].map(key => ({
      key, heads: ['What it measures', key === 'tactical-lock' ? 'Why nothing is drawn' : 'How to read it'], paras: [120, 90] })),
    rows: {
      secondWind: ['Nick Foligno (CHI), CHI at FLA, 2025-10-07', 'Brad Marchand (FLA), CHI at FLA, 2025-10-07',
                   'Alex Ovechkin (WSH), VAN at WSH, 2025-10-19', 'Ross Colton (COL), NJD at COL, 2025-10-28'],
      gravity: [{ label: 'KC offense v LAC, play 118', marks: 5, positions: 5 }],
    },
    narratives: {
      secondWind: [
        { aria: 'Game 1, player 2: Insufficient state active, 1 attempts in the first and last thirds', text: '1 shot attempt in the first and last thirds of his ice time: too few to tell.' },
        { aria: 'Game 1, player 3: PopulationRate state active, last third 3 attempts against 3.6 expected', text: 'Of 7 shot attempts in the first and last thirds of his ice time, 3 came in the last third, against 3.6 expected for a skater with his minutes. Within the normal range.' },
        { aria: 'Game 1, player 4: SecondWind state active, last third 8 attempts against 4.6 expected', text: 'Of 9 shot attempts in the first and last thirds of his ice time, 8 came in the last third, against 4.6 expected for a skater with his minutes. Second wind: more late attempts than chance would usually give.' },
        { aria: 'Game 1, player 5: TrailingRate state active, last third 0 attempts against 3.0 expected', text: 'Of 6 shot attempts in the first and last thirds of his ice time, 0 came in the last third, against 3.0 expected for a skater with his minutes. Trailing rate: fewer late attempts than chance would usually give.' },
      ],
      gravity: [{ arias: ['TE 1: Drawing state active, defenders drawn 1 of 7', 'RB 2: NotRouteRunner state active'],
                  text: 'Coverage defenders nearest each receiver, at the snap → at the throw (7 in coverage): TE 3 → 4, RB not running a route. The TE drew the most, 1 more at the throw than at the snap.' }],
      flow: FLOW_SUBJECTS.flatMap(() => [
        { cells: Array.from({ length: 90 }, (_, i) => ({ aria: i === 3 ? 'Minute 4, home: InFlow state active, sequential xG 0.42' : 'Minute 1, home: Disjointed state active' })), text: 'Home side: In flow once, from 4\' until an opponent shot at 9\' (3 shots, 0.87 xG).' },
        { cells: Array.from({ length: 90 }, () => ({ aria: 'Minute 1, away: Disjointed state active' })), text: 'Away side: Never in flow: no run of three shots with xG above zero, unbroken by an opponent shot.' },
      ]),
    },
    innerText: 'Metrics Committed captures, named below, not today\'s slate.',
    imgNodes: 5, imgNodesUnnamed: 0,
  }
}

/** One mutation per predicate, each of which that predicate must refuse. */
export const MUTATIONS = {
  'the tablist names eleven tabs, Metrics directly before Verify, which stays last': s => { s.tabIds = EXPECTED_TABS.filter(t => t !== 'tab-metrics').concat('tab-metrics') },
  'one tab selected, one in the tab order, and ArrowRight from Draw shows only the Metrics panel': s => { s.afterArrow.visiblePanels = ['panel-metrics', 'panel-verify'] },
  'nothing on the tab is fetched before the tab is opened': s => { s.fetchedBeforeTab = ['data/bsd-flow-finished-stats.json'] },
  'every Flow subject has a home and an away strip, each a witnessed minute strip with a named cell per minute': s => { s.flowStrips[1].cells[0].aria = '' },
  'each Flow subject draws at least one minute with a non-empty style (an InFlow pulse)': s => { s.flowStrips.filter(x => x.subject === 'inplay').forEach(x => x.cells.forEach(c => { c.style = '' })) },
  'Second Wind draws all four cases, and a bare track is told from a ticked one by its geometry': s => { s.secondWind.tracks[0] = { ...s.secondWind.tracks[0], mark: 'ticks', ticks: 2 } },
  'Second Wind fetches nothing before its section opens, then the manifest and every game once': s => { s.secondWind.fetchesAfter = 657 * 2 },
  'Tactical Lock draws no mark and cites both proofs': s => { s.tacticalLock.marks = 1 },
  'Gravity draws nothing and fetches nothing before its section is expanded': s => { s.gravity.framesFetchesBefore = 1 },
  'Gravity fetches the 1.8 MB capture exactly once, on expand, and draws marks of more than one opacity': s => { s.gravity.framesFetchesAfter = 2 },
  'an unencoded receiver has its own mark, distinct from every encoded shape': s => { s.gravity.marks = s.gravity.marks.filter(m => m.well !== 'unencoded') },
  'no accessible name, and no state phrase, appears in the panel\'s visible text': s => { s.innerText += ' InFlow state active, sequential xG 0.42' },
  'every drawn node carries a non-empty accessible name': s => { s.imgNodesUnnamed = 1 },
  'every section says in plain English what it measures and how to read it': s => { s.explained = s.explained.filter(e => e.key !== 'gravity') },
  'Play frames draws every state the decoder names, each with its own edge, and nothing else': s => { s.playFrames.find(t => t.state === 'PARTIAL RECORD').border = 'solid' },
  'rows name players, teams and positions rather than bare ids': s => { s.rows.secondWind[2] = 'Game 2025020089, player 8471214' },
  'every finished row carries its sentence, and each sentence agrees with its accessible name': s => { s.narratives.secondWind[2].text = s.narratives.secondWind[2].text.replace('8 came', '7 came') },
}

const judge = (snapshot, check) => {
  for (const [name, p] of Object.entries(PREDICATES)) {
    const [pass, detail] = p(snapshot)
    check(name, pass, detail)
  }
}

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()
  check('every predicate has exactly one mutation, and every mutation names a predicate',
    Object.keys(PREDICATES).length === Object.keys(MUTATIONS).length
      && Object.keys(MUTATIONS).every(k => k in PREDICATES), `${Object.keys(PREDICATES).length} predicates`)
  for (const [name, p] of Object.entries(PREDICATES)) {
    check(`holds on the good snapshot: ${name}`, p(goodSnapshot())[0], p(goodSnapshot())[1])
    const bad = goodSnapshot()
    MUTATIONS[name]?.(bad)
    check(`fails on its mutation: ${name}`, !p(bad)[0], 'the predicate passed a snapshot built to break it')
  }
  finish(summarize())
} else if (isMain(import.meta.url)) {
  const { chromium } = await import('playwright')
  const URL_BASE = process.env.URL || 'http://localhost:8080/'
  const SHOT = process.env.SCREENSHOT || 'outbox/metrics-tab-latest.png'
  const { check, summarize } = createChecks()

  const sessionChromium = '/opt/pw-browsers/chromium'
  const browser = await chromium.launch(existsSync(sessionChromium) ? { executablePath: sessionChromium } : {})
  const page = await browser.newPage({ viewport: { width: 1280, height: 1800 } })
  const errors = []
  page.on('pageerror', e => errors.push(String(e)))
  const requests = []
  page.on('request', r => requests.push(r.url()))
  const ours = u => /bsd-flow-|nhl-second-wind-|bdb-event-frames-/.test(u)

  await page.goto(URL_BASE, { waitUntil: 'networkidle' })
  const s = {}
  const TABS = '.tabs [role="tab"]'
  s.tabIds = await page.$$eval(TABS, ts => ts.map(t => t.id))
  s.selectedAtBoot = await page.$$eval(TABS, ts => ts.filter(t => t.getAttribute('aria-selected') === 'true').length)
  s.inTabOrder = await page.$$eval(TABS, ts => ts.filter(t => t.getAttribute('tabindex') === '0').length)
  s.fetchedBeforeTab = requests.filter(ours)

  await page.click('#tab-draw')
  await page.keyboard.press('ArrowRight')
  await page.waitForSelector('#panel-metrics .mx-flow-strip', { timeout: 20000 })
  await page.waitForLoadState('networkidle')
  s.afterArrow = {
    selected: await page.$$eval(TABS, ts => ts.find(t => t.getAttribute('aria-selected') === 'true')?.id),
    visiblePanels: await page.$$eval('[role="tabpanel"]', ps => ps.filter(p => !p.hasAttribute('hidden')).map(p => p.id)),
  }

  const panel = '#panel-metrics'
  s.flowStrips = await page.$$eval(`${panel} .mx-flow-strip`, strips => strips.map(st => ({
    subject: st.dataset.subject, side: st.dataset.side,
    cells: [...st.querySelectorAll('.mx-flow-cell')].map(c => ({ flow: c.dataset.flow, style: c.getAttribute('style') || '', aria: c.getAttribute('aria-label') || '' })),
  })))
  const sectionOf = key => page.$eval(`${panel} [data-metric="${key}"]`, d => ({ present: true, marks: d.querySelectorAll('[role="img"]').length, text: d.innerText }))
  const frames = () => requests.filter(u => u.includes(FRAMES)).length
  const population = () => requests.filter(u => u.includes(POPULATION)).length
  const manifest = JSON.parse(readFileSync(`data/${POPULATION}MANIFEST.json`, 'utf8'))
  const populationBefore = population()

  s.gravity = {
    marksBefore: await page.$$eval(`${panel} [data-metric="gravity"] .mx-well`, m => m.length),
    framesFetchesBefore: frames(),
  }
  for (const key of ['second-wind', 'gravity', 'tactical-lock', 'play-frames'])
    await page.$eval(`${panel} [data-metric="${key}"]`, d => { d.open = true })
  await page.waitForSelector(`${panel} [data-metric="gravity"] .mx-well, ${panel} [data-metric="gravity"] .mx-error`, { timeout: 60000 })
  await page.waitForSelector(`${panel} [data-metric="second-wind"] .mx-track, ${panel} [data-metric="second-wind"] [data-state]`, { timeout: 180000 })
  await page.waitForLoadState('networkidle')
  // Close and reopen: a second expand must not fetch again.
  for (const key of ['gravity', 'second-wind']) {
    await page.$eval(`${panel} [data-metric="${key}"]`, d => { d.open = false })
    await page.$eval(`${panel} [data-metric="${key}"]`, d => { d.open = true })
  }
  await page.waitForTimeout(500)
  s.gravity.framesFetchesAfter = frames()
  s.gravity.marks = await page.$$eval(`${panel} [data-metric="gravity"] .mx-well`, ms => ms.map(m => ({ well: m.dataset.well, style: m.getAttribute('style') || '' })))
  s.secondWind = {
    tracks: await page.$$eval(`${panel} [data-metric="second-wind"] .mx-track`, ts => ts.map(t => ({
      mark: t.dataset.mark, ticks: t.querySelectorAll('.mx-tick').length, aria: t.getAttribute('aria-label') || '' }))),
    fetchesBefore: populationBefore, fetchesAfter: population(), expectedFetches: 1 + 2 * manifest.games.length,
  }
  s.tacticalLock = await sectionOf('tactical-lock')
  s.playFrames = await page.$$eval(`${panel} [data-metric="play-frames"] .mx-frame`, ts => ts.map(t => ({ state: t.dataset.frameState, border: getComputedStyle(t).borderTopStyle })))
  s.ariaLabels = await page.$$eval(`${panel} [aria-label]`, ns => ns.map(n => n.getAttribute('aria-label')))
  s.explained = await page.$$eval(`${panel} details[data-metric]`, ds => ds.map(d => ({
    key: d.dataset.metric,
    heads: [...d.querySelectorAll('.mx-explain-head')].map(h => h.textContent),
    paras: [...d.querySelectorAll('.mx-explain')].map(p => p.textContent.trim().length) })))
  s.narratives = {
    secondWind: await page.$$eval(`${panel} [data-metric="second-wind"] .mx-subject`, rows => rows.map(r => ({
      aria: r.querySelector('.mx-track')?.getAttribute('aria-label') || '',
      text: r.nextElementSibling?.matches('[data-narrative="second-wind"]') ? r.nextElementSibling.textContent : '' }))),
    gravity: await page.$$eval(`${panel} [data-metric="gravity"] .mx-play`, rows => rows.map(r => ({
      arias: [...r.querySelectorAll('.mx-well')].map(m => m.getAttribute('aria-label') || ''),
      text: r.nextElementSibling?.matches('[data-narrative="gravity"]') ? r.nextElementSibling.textContent : '' }))),
    flow: await page.$$eval(`${panel} .mx-flow-subject`, blocks => blocks.flatMap(b => {
      const strips = [...b.querySelectorAll('.mx-flow-strip')]
      const lines = [...b.querySelectorAll('[data-narrative="flow"]')]
      return strips.map((st, i) => ({
        cells: [...st.querySelectorAll('.mx-flow-cell')].map(c => ({ aria: c.getAttribute('aria-label') || '' })),
        text: lines[i]?.textContent || '' }))
    })),
  }
  s.rows = {
    secondWind: await page.$$eval(`${panel} [data-metric="second-wind"] .mx-subject .mx-play-id`, ns => ns.map(n => n.textContent)),
    gravity: await page.$$eval(`${panel} [data-metric="gravity"] .mx-play`, rs => rs.map(r => ({
      label: r.querySelector('.mx-play-id')?.textContent || '',
      marks: r.querySelectorAll('.mx-well').length,
      positions: (r.querySelector('.mx-play-pos')?.textContent || '').split(' · ').filter(Boolean).length }))),
  }
  s.innerText = await page.$eval(panel, p => p.innerText)
  s.imgNodes = await page.$$eval(`${panel} [role="img"]`, ns => ns.length)
  s.imgNodesUnnamed = await page.$$eval(`${panel} [role="img"]`, ns => ns.filter(n => !(n.getAttribute('aria-label') || '').trim()).length)
  await page.keyboard.press('End')
  s.afterEnd = await page.$$eval(TABS, ts => ts.find(t => t.getAttribute('aria-selected') === 'true')?.id)

  // The screenshot is taken on the Metrics tab with all five sections open.
  await page.click('#tab-metrics')
  mkdirSync('outbox', { recursive: true })
  await page.$eval(panel, p => p.querySelectorAll('details').forEach(d => { d.open = true }))
  await page.locator(panel).screenshot({ path: SHOT })

  judge(s, check)
  check('no page error while the tab rendered', errors.length === 0, errors.join(' | '))
  console.log(`flow strips ${s.flowStrips.length}, styled cells ${s.flowStrips.reduce((n, x) => n + x.cells.filter(c => c.style).length, 0)}; ` +
    `gravity marks ${s.gravity.marks.length} (${s.gravity.marks.filter(m => m.well === 'unencoded').length} unencoded); screenshot ${SHOT}`)
  await browser.close()
  finish(summarize())
}
