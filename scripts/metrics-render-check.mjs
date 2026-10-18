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
// WHAT CHANGED FROM THE COMMAND, MEASURED. TASK 6.3 asked for all four Second
// Wind cases on screen. The committed capture is one game, which cannot form
// the population curve (Stamina.staminaCurve refuses under 1,000 attempts in a
// third), and under the season's curve that game holds no SecondWind and no
// TrailingRate reading (outbox/second-wind-population-latest.json, `fixture`).
// So the section is a stated absence, like Tactical Lock, and this asserts that:
// no marks, and the follow-up command named. The four-case assertion belongs to
// docs/CC-CMD-2026-10-18-second-wind-population-capture.md.
//
// Usage:  URL=http://localhost:8080/ node scripts/metrics-render-check.mjs
//         node scripts/metrics-render-check.mjs --self-test

import { existsSync, mkdirSync } from 'node:fs'
import { createChecks, finish, isMain } from './checks.mjs'

export const EXPECTED_TABS = [
  'tab-scoreboard', 'tab-field-pick', 'tab-scout-pick', 'tab-pickem', 'tab-weather',
  'tab-stats', 'tab-lineups', 'tab-briefs', 'tab-draw', 'tab-metrics', 'tab-verify',
]
export const FLOW_SUBJECTS = ['finished', 'inplay']
export const FRAMES = 'bdb-event-frames-2022-w2.json'
const FOLLOW_UP = 'CC-CMD-2026-10-18-second-wind-population-capture'

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

  'Second Wind draws no mark and names the command that would let it': s => [
    s.secondWind.present && s.secondWind.marks === 0 && s.secondWind.text.includes(FOLLOW_UP),
    JSON.stringify({ ...s.secondWind, text: s.secondWind.text.slice(0, 120) })],

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
    secondWind: { present: true, marks: 0, text: `filed as docs/${FOLLOW_UP}.md` },
    tacticalLock: { present: true, marks: 0, text: 'docs/LOCK-PROOF.md, docs/AMNESTY-PROOF.md' },
    gravity: {
      marksBefore: 0, framesFetchesBefore: 0, framesFetchesAfter: 1,
      marks: [{ well: 'steady', style: '--mx-fill: 0.250' }, { well: 'expanding', style: '--mx-fill: 0.500' }, { well: 'unencoded', style: '' }],
    },
    ariaLabels: ['Minute 1, home: InFlow state active, sequential xG 0.42'],
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
  'Second Wind draws no mark and names the command that would let it': s => { s.secondWind.marks = 1 },
  'Tactical Lock draws no mark and cites both proofs': s => { s.tacticalLock.marks = 1 },
  'Gravity draws nothing and fetches nothing before its section is expanded': s => { s.gravity.framesFetchesBefore = 1 },
  'Gravity fetches the 1.8 MB capture exactly once, on expand, and draws marks of more than one opacity': s => { s.gravity.framesFetchesAfter = 2 },
  'an unencoded receiver has its own mark, distinct from every encoded shape': s => { s.gravity.marks = s.gravity.marks.filter(m => m.well !== 'unencoded') },
  'no accessible name, and no state phrase, appears in the panel\'s visible text': s => { s.innerText += ' InFlow state active, sequential xG 0.42' },
  'every drawn node carries a non-empty accessible name': s => { s.imgNodesUnnamed = 1 },
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

  s.gravity = {
    marksBefore: await page.$$eval(`${panel} [data-metric="gravity"] .mx-well`, m => m.length),
    framesFetchesBefore: frames(),
  }
  for (const key of ['second-wind', 'gravity', 'tactical-lock'])
    await page.$eval(`${panel} [data-metric="${key}"]`, d => { d.open = true })
  await page.waitForSelector(`${panel} [data-metric="gravity"] .mx-well, ${panel} [data-metric="gravity"] .mx-error`, { timeout: 60000 })
  await page.waitForLoadState('networkidle')
  // Close and reopen: a second expand must not fetch again.
  await page.$eval(`${panel} [data-metric="gravity"]`, d => { d.open = false })
  await page.$eval(`${panel} [data-metric="gravity"]`, d => { d.open = true })
  await page.waitForTimeout(500)
  s.gravity.framesFetchesAfter = frames()
  s.gravity.marks = await page.$$eval(`${panel} [data-metric="gravity"] .mx-well`, ms => ms.map(m => ({ well: m.dataset.well, style: m.getAttribute('style') || '' })))
  s.secondWind = await sectionOf('second-wind')
  s.tacticalLock = await sectionOf('tactical-lock')
  s.ariaLabels = await page.$$eval(`${panel} [aria-label]`, ns => ns.map(n => n.getAttribute('aria-label')))
  s.innerText = await page.$eval(panel, p => p.innerText)
  s.imgNodes = await page.$$eval(`${panel} [role="img"]`, ns => ns.length)
  s.imgNodesUnnamed = await page.$$eval(`${panel} [role="img"]`, ns => ns.filter(n => !(n.getAttribute('aria-label') || '').trim()).length)
  await page.keyboard.press('End')
  s.afterEnd = await page.$$eval(TABS, ts => ts.find(t => t.getAttribute('aria-selected') === 'true')?.id)

  // The screenshot is taken on the Metrics tab with all four sections open.
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
