#!/usr/bin/env node
// Do the nine apt fonts that `npx playwright install --with-deps chromium` adds change anything the browser checks measure?
// docs/CC-CMD-2026-11-11-runner-apt-mirror-dns.md, option 2: the install loses its apt step, and the CC-CMD's own unknown was "whether the render checks'
// boxes and the screenshots hold without the nine font packages (never measured, and a font fallback can change a bounding box)".
//
// WHAT IT MEASURES. The page the layout checks load (`?data=context-2026-08-29`, served from public/), at the ten canonical viewports of
// scripts/viewport-overflow-check.mjs, at rest and with every flippable card opened: 20 cells. Per cell: the document's scroll size; the rounded
// getBoundingClientRect of EVERY element of the body (hashed, and kept so a difference can name the element); the platform fonts Chromium actually
// used for the page's text and how many glyphs each drew (CSS.getPlatformFontsForNode); and a screenshot hash.
//
// HOW THE QUESTION IS ASKED. One job, one runner, one Chromium installed WITHOUT --with-deps. Runs, each of the 20 cells:
//   A1  the page as it is, the nine fonts absent
//   A2  the same again: the CONTROL. If A1 and A2 differ, the measurement is not repeatable and nothing below means anything.
//   T   the page with every font forced to `monospace`: the TEETH. If the probe cannot see this, it cannot see a font change.
//   B   after `apt-get install` of the nine fonts, the page as it is: the TREATMENT.
// The verdict is decided on geometry (scroll size and element boxes) and on which fonts drew glyphs; a pixel difference is reported and does not decide
// (it is what the checks do not assert on).
//
// Usage:
//   node scripts/font-dependence-probe.mjs --run --label A1 --out /tmp/A1.json [--url U] [--inject-css CSS]
//   node scripts/font-dependence-probe.mjs --judge --a1 /tmp/A1.json --a2 /tmp/A2.json --teeth /tmp/T.json --b /tmp/B.json --apt ok|failed \
//        --json outbox/font-dependence-latest.json --text outbox/font-dependence-latest.txt
//   node scripts/font-dependence-probe.mjs --premises --before /tmp/before.txt --after /tmp/after.txt --seconds /tmp/install-seconds.txt --fonts-after /tmp/fonts-after.txt \
//        --timeout-file /tmp/timeout.txt --out outbox/install-no-apt-probe-latest.txt
//   node scripts/font-dependence-probe.mjs --self-test
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { createChecks, isMain, finish } from './checks.mjs'

const arg = (name, fallback) => { const k = process.argv.indexOf(name); return k > 0 ? process.argv[k + 1] : fallback }

export const PAGE_URL = 'http://localhost:8080/?data=context-2026-08-29'

/** The canonical viewports of scripts/viewport-overflow-check.mjs (ids, widths and heights), which transcribes the specification's matrix. */
export const VIEWPORTS = [
  { id: 'P1', w: 360, h: 780 }, { id: 'P2', w: 393, h: 852 }, { id: 'P3', w: 430, h: 932 }, { id: 'L1', w: 667, h: 375 }, { id: 'L2', w: 932, h: 430 },
  { id: 'T1', w: 820, h: 1180 }, { id: 'T2', w: 1180, h: 820 }, { id: 'D1', w: 1200, h: 800 }, { id: 'D3', w: 1440, h: 900 }, { id: 'U1', w: 1920, h: 1080 },
]
export const PHASES = ['rest', 'opened']
export const NINE_FONTS = ['fonts-ipafont-gothic', 'fonts-freefont-ttf', 'fonts-tlwg-loma-otf', 'fonts-unifont', 'fonts-wqy-zenhei', 'xfonts-encodings', 'xfonts-utils', 'xfonts-cyrillic', 'xfonts-scalable']
export const TEETH_CSS = 'html, body, body * { font-family: monospace !important; }'

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// The comparison and the verdict. Pure, so the self-test can hold them to account without a browser.

/** One cell of one run against the same cell of another. `geometry` lists what moved: element count, scroll size, element boxes. */
export const compareCells = (a, b) => {
  const geometry = []
  if (a.n !== b.n) geometry.push('elementCount')
  if (a.scrollWidth !== b.scrollWidth || a.scrollHeight !== b.scrollHeight) geometry.push('scroll')
  let maxDelta = 0
  const first = []
  if (a.n === b.n) {
    for (let i = 0; i < a.rects.length; i++) {
      const d = Math.max(...a.rects[i].map((v, k) => Math.abs(v - b.rects[i][k])))
      if (d > 0) { maxDelta = Math.max(maxDelta, d); if (first.length < 3) first.push({ el: a.labels[i], a: a.rects[i], b: b.rects[i] }) }
    }
    if (maxDelta > 0) geometry.push('boxes')
  }
  const fa = JSON.stringify(Object.entries(a.fonts).sort())
  const fb = JSON.stringify(Object.entries(b.fonts).sort())
  const newFonts = Object.keys(b.fonts).filter(f => !(f in a.fonts) && b.fonts[f] > 0)
  return { cell: `${a.id}/${a.phase}`, geometry, fontsDiffer: fa !== fb, newFonts, pixelsDiffer: a.shotSha !== b.shotSha, maxDelta, first }
}

export const compareRuns = (A, B) => {
  const ids = r => r.cells.map(c => `${c.id}/${c.phase}`).join(',')
  if (ids(A) !== ids(B)) throw new Error(`the two runs do not measure the same cells: ${ids(A)} vs ${ids(B)}`)
  const cells = A.cells.map((a, i) => compareCells(a, B.cells[i]))
  return {
    checked: cells.length,
    geometryDiffer: cells.filter(c => c.geometry.length > 0).length,
    fontsDiffer: cells.filter(c => c.fontsDiffer).length,
    pixelsDiffer: cells.filter(c => c.pixelsDiffer).length,
    newFonts: [...new Set(cells.flatMap(c => c.newFonts))].sort(),
    cells,
  }
}

/**
 * The verdict, from the control, the teeth and the treatment. Every verdict that is not `fonts-not-needed` or `fonts-matter` is `not-observable` and says why:
 * a probe that cannot repeat itself, or cannot see a font change, or whose treatment never happened, has not answered.
 */
export const verdictOf = ({ control, teeth, treatment, apt, visible }) => {
  if (apt !== 'ok') return { verdict: 'not-observable', why: 'the nine fonts were not installed (apt failed), so there is no treatment run to compare' }
  if (control.geometryDiffer > 0) return { verdict: 'not-observable', why: `the control is not repeatable: two runs of the same page differ in geometry in ${control.geometryDiffer} of ${control.checked} cells` }
  if (teeth.geometryDiffer < teeth.checked) return { verdict: 'not-observable', why: `the probe cannot see a font change: forcing every font to monospace moved geometry in ${teeth.geometryDiffer} of ${teeth.checked} cells, not all` }
  if (visible && visible.changed.length < NEEDED_VISIBLE) return { verdict: 'not-observable', why: `the treatment is not visible to Chromium: only ${visible.changed.length} of ${visible.of} font families asked for by name were drawn differently after the install (${NEEDED_VISIBLE} needed), so a clean comparison would also be what a treatment that changed nothing looks like` }
  const used = treatment.newFonts
  if (treatment.geometryDiffer === 0 && used.length === 0) {
    return { verdict: 'fonts-not-needed', why: `with the nine fonts installed no element box or scroll size moved in any of ${treatment.checked} cells, and no font outside the first run's drew a glyph` }
  }
  return {
    verdict: 'fonts-matter',
    why: `${treatment.geometryDiffer} of ${treatment.checked} cells moved in geometry and ${used.length} font(s) not in the first run drew glyphs${used.length ? `: ${used.join(', ')}` : ''}`,
  }
}

/** The one page-less cell: text in scripts and symbols the page's own faces do not carry, at one viewport, so the first run's fallback fonts can be told from the second's. Informational: it does not decide the verdict. */
export const FALLBACK_HTML = `<div style="font: 16px/1.4 'DM Sans', ui-sans-serif, system-ui, sans-serif; width: 600px; padding: 8px">
<p>Latin: Manchester United v Arsenal, Cear\u00e1 SC, Atl\u00e9tico</p><p>\u65e5\u672c\u8a9e \u6771\u4eac\u30f4\u30a7\u30eb\u30c7\u30a3</p><p>\ud55c\uad6d\uc5b4 \uc11c\uc6b8 \uc774\ub79c\ub4dc</p><p>\u4e2d\u6587 \u5317\u4eac\u56fd\u5b89</p>
<p>\u0e44\u0e17\u0e22 \u0e01\u0e23\u0e38\u0e07\u0e40\u0e17\u0e1e</p><p>\u0420\u0443\u0441\u0441\u043a\u0438\u0439 \u0421\u043f\u0430\u0440\u0442\u0430\u043a</p><p>\u0395\u03bb\u03bb\u03b7\u03bd\u03b9\u03ba\u03ac \u039f\u03bb\u03c5\u03bc\u03c0\u03b9\u03b1\u03ba\u03cc\u03c2</p>
<p>\u05e2\u05d1\u05e8\u05d9\u05ea \u05d4\u05e4\u05d5\u05e2\u05dc</p><p>\u0627\u0644\u0639\u0631\u0628\u064a\u0629 \u0627\u0644\u0647\u0644\u0627\u0644</p><p>\u25b2 \u25bc \u25c6 \u25cf \u2192 \u26bd \u2605 \u2713 \u2014 \u2013</p></div>`

/**
 * THE TREATMENT'S POSITIVE CONTROL. Fallback text shows which font Chromium picks, but a different pick is not proof that the install put anything in front of it. Each of the
 * five font families the nine packages provide (the other four packages are bitmap fonts and font-tool dependencies Chromium does not draw with) is asked for BY NAME, with text
 * it can draw, and CSS.getPlatformFontsForNode says what drew it. Without the packages every one falls back to something else; with them each is drawn by the family asked for.
 */
export const NAMED_FAMILIES = [
  ['IPAGothic', '\u65e5\u672c\u8a9e\u306e\u30c6\u30b9\u30c8'], ['WenQuanYi Zen Hei', '\u4e2d\u6587\u6d4b\u8bd5'], ['Loma', '\u0e17\u0e14\u0e2a\u0e2d\u0e1a'], ['FreeSans', 'Free Sans test'], ['Unifont', 'Unifont test'],
]
export const NAMED_HTML = NAMED_FAMILIES.map(([f, t]) => `<p data-named="${f}" style="font-family: '${f}', sans-serif; margin: 4px 8px">${t}</p>`).join('')
export const NEEDED_VISIBLE = 3

/** How many of the five named families were drawn differently in the second run than in the first: the treatment, seen by Chromium. Pure. */
export const namedVisible = (a, b) => {
  const names = NAMED_FAMILIES.map(([f]) => f)
  const changed = names.filter(f => a?.[f] !== undefined && b?.[f] !== undefined && JSON.stringify([...a[f]].sort()) !== JSON.stringify([...b[f]].sort()))
  const asked = names.filter(f => (b?.[f] ?? []).some(d => d.toLowerCase().replace(/\s/g, '').includes(f.toLowerCase().replace(/\s/g, ''))))
  return { of: names.length, changed, drawnAsAsked: asked }
}

/** The fallback cell of two runs, said in a line. Pure. */
export const fallbackLine = (a, b, label) => {
  if (!a || !b) return `fallback-text cell (${label}): not measured`
  const c = compareCells(a, b)
  return `fallback-text cell (${label}): boxes ${c.geometry.length ? `DIFFER (max ${c.maxDelta}px)` : 'same'}, fonts ${c.fontsDiffer ? 'DIFFER' : 'same'}, pixels ${c.pixelsDiffer ? 'differ' : 'same'}; fonts drawn: ${JSON.stringify(a.fonts)} -> ${JSON.stringify(b.fonts)}`
}

export const textOf = ({ control, teeth, treatment, verdict, why, apt, meta, fallback = [], visible = null, firstRunFonts = null, stamp = null }) => [
  `checked ${control.checked} of ${control.checked} cells (${VIEWPORTS.length} viewports x ${PHASES.length} states); control ${control.geometryDiffer} differ, teeth ${teeth.geometryDiffer} differ, ${treatment ? `treatment ${treatment.geometryDiffer} differ in geometry` : 'treatment NOT RUN (0 of 0 cells compared)'}`,
  ...(stamp ? [`stamp: ${stamp}`] : []),
  `VERDICT: ${verdict}`,
  `why: ${why}`,
  `apt install of the nine fonts: ${apt}`,
  `treatment visible to Chromium (five families asked for by name, drawn differently after the install): ${visible ? `${visible.changed.length} of ${visible.of} (${visible.changed.join(', ') || 'none'}); drawn as asked after: ${visible.drawnAsAsked.join(', ') || 'none'}` : 'not measured'}`,
  `pixels: control ${control.pixelsDiffer}, teeth ${teeth.pixelsDiffer}, treatment ${treatment ? `${treatment.pixelsDiffer} of ${treatment.checked}` : 'not run'} cells differ (reported, not decided on: a whole-page hash is not repeatable on every Chromium build, so the screenshot half of the CC-CMD's question is answered only as far as the control here repeated)`,
  ...(firstRunFonts ? [`first run: glyphs drawn per font family: ${JSON.stringify(firstRunFonts)}`] : []),
  `fonts that drew glyphs in the treatment and not in the first run: ${treatment ? treatment.newFonts.join(', ') || 'none' : 'not run'}`,
  `cells whose font usage differs: control ${control.fontsDiffer}, teeth ${teeth.fontsDiffer}, treatment ${treatment ? treatment.fontsDiffer : 'not run'}`,
  `scope: the Scoreboard tab of ?data=context-2026-08-29 only (1 of 11 tabs; Latin text drawn in the page's own two web faces) at 10 viewports x 2 states; the lines below say what text those faces do not carry would do`,
  ...fallback,
  ...(meta ? [`chromium ${meta.chromium}; url ${meta.url}`] : []),
  ...(treatment ? treatment.cells.filter(c => c.geometry.length).slice(0, 5).map(c => `  moved: ${c.cell} ${c.geometry.join('+')} maxDelta ${c.maxDelta}px ${JSON.stringify(c.first[0] ?? null)}`) : []),
].join('\n') + '\n'

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// The install's own premises, read from what the workflow printed before and after it (`key: value` lines).

export const kv = text => Object.fromEntries(String(text ?? '').split('\n').map(l => /^([A-Za-z_]+):\s*(.*)$/.exec(l)).filter(Boolean).map(m => [m[1], m[2].trim()]))
export const INSTALL_LIMIT_SECONDS = 180
export const TIMEOUT_TEST_SECONDS = 3

/**
 * Seven premises of "drop --with-deps" and "bound it", each held or failed from the numbers. `checked N of N` is printed first (Rule 91). The last two are the limit's own:
 * the `timeout` on the runner (GNU or uutils, the image decides) must end a stalled process tree with a non-zero exit, in the plain form and with --kill-after, and leave no process behind.
 */
export const premisesOf = ({ before, after, seconds, fontsAfter, timeoutInfo = '' }) => {
  const b = kv(before), a = kv(after), sec = kv(seconds), f = kv(fontsAfter), t = kv(timeoutInfo)
  const n = x => (x !== undefined && /^\d+$/.test(x) ? Number(x) : null)
  const list = [
    [b.dpkg_list_sha !== undefined && b.apt_lists_sha !== undefined && b.dpkg_list_sha === a.dpkg_list_sha && b.dpkg_log_bytes === a.dpkg_log_bytes && b.apt_history_bytes === a.apt_history_bytes && b.apt_lists_sha === a.apt_lists_sha,
      `the install changed no package, wrote nothing to the dpkg or apt logs and left the apt package lists alone (package list ${b.dpkg_list_sha} -> ${a.dpkg_list_sha}; dpkg.log ${b.dpkg_log_bytes} -> ${a.dpkg_log_bytes} bytes; apt history ${b.apt_history_bytes} -> ${a.apt_history_bytes}; apt lists ${b.apt_lists_sha} -> ${a.apt_lists_sha})`],
    [n(a.shim_calls) === 0,
      `no apt, apt-get, dpkg or sudo call was made during the install, each shimmed on PATH (${a.shim_calls ?? 'unknown'} calls logged)`],
    [n(a.ldd_not_found_total) === 0 && n(a.browser_binaries) >= 1,
      `every browser binary the install left has all its shared libraries (${a.browser_binaries ?? 'unknown'} binaries, ${a.ldd_not_found_total ?? 'unknown'} libraries not found)`],
    [n(sec.install_seconds) !== null && n(sec.install_seconds) <= INSTALL_LIMIT_SECONDS,
      `the install finished inside its ${INSTALL_LIMIT_SECONDS} s limit (${sec.install_seconds ?? 'unknown'} s)`],
    [n(b.nine_fonts_installed) === 0,
      `none of the nine fonts was installed before, so the treatment is a real change (${b.nine_fonts_installed ?? 'unknown'} of 9 present before; ${f.nine_fonts_installed ?? 'not installed'} of 9 after the apt step; fontconfig then lists: ${f.fc_nine_families ?? 'unknown'})`],
    ...['plain', 'kill'].map(k => [
      n(t[`${k}_exit`]) !== null && n(t[`${k}_exit`]) !== 0 && n(t[`${k}_seconds`]) !== null && n(t[`${k}_seconds`]) <= TIMEOUT_TEST_SECONDS + 3 && n(t[`${k}_survivors`]) === 0,
      `the runner's timeout${k === 'kill' ? ' --kill-after=10' : ''} ends a stalled process tree: exit ${t[`${k}_exit`] ?? 'unknown'} (non-zero fails the step), ${t[`${k}_seconds`] ?? 'unknown'} s for a ${TIMEOUT_TEST_SECONDS} s limit, ${t[`${k}_survivors`] ?? 'unknown'} processes left (${t.timeout_path ?? 'unknown binary'}; ${t.timeout_version ?? 'unknown version'})`,
    ]),
  ]
  const held = list.filter(([ok]) => ok).length
  return { total: list.length, held, text: [`checked ${list.length} of ${list.length} premises: ${held} held`, ...list.map(([ok, why]) => `${ok ? 'HELD  ' : 'FAILED'}  ${why}`), `image: ${b.image ?? 'unknown'}`].join('\n') + '\n' }
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// The measurement. Runs in a browser.

const sha = data => createHash('sha256').update(data).digest('hex').slice(0, 16)

/** In the page: every element's rounded box, the scroll size, and a mark on each element that owns text, for the platform-font query that follows. */
const IN_PAGE = () => {
  const els = [...document.body.querySelectorAll('*')]
  const r2 = n => Math.round(n * 100) / 100
  const rects = []
  const labels = []
  for (const e of els) {
    const b = e.getBoundingClientRect()
    rects.push([r2(b.x), r2(b.y), r2(b.width), r2(b.height)])
    labels.push(e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).join('.') : ''))
  }
  for (const e of els) if ([...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) e.setAttribute('data-fp-text', '1')
  return { n: els.length, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight, rects, labels }
}

const fontsOf = async client => {
  const { root } = await client.send('DOM.getDocument', { depth: 0 })
  const { nodeIds } = await client.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '[data-fp-text]' })
  const fonts = {}
  for (const nodeId of nodeIds) {
    const { fonts: list } = await client.send('CSS.getPlatformFontsForNode', { nodeId })
    for (const f of list) fonts[f.familyName] = (fonts[f.familyName] ?? 0) + f.glyphCount
  }
  return fonts
}

const measure = async (page, client, id, phase) => {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(250)
  const m = await page.evaluate(IN_PAGE)
  const fonts = await fontsOf(client)
  const shot = await page.screenshot({ fullPage: true, animations: 'disabled' })
  return { id, phase, n: m.n, scrollWidth: m.scrollWidth, scrollHeight: m.scrollHeight, rectsSha: sha(JSON.stringify(m.rects)), rects: m.rects, labels: m.labels, fonts, shotSha: sha(shot) }
}

export const runProbe = async ({ url = PAGE_URL, label, injectCss = '' }) => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {})
  const cells = []
  try {
    for (const v of VIEWPORTS) {
      const page = await browser.newPage({ viewport: { width: v.w, height: v.h } })
      const client = await page.context().newCDPSession(page)
      await client.send('DOM.enable')
      await client.send('CSS.enable')
      await page.goto(url, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('.desk-card', { timeout: 30000 })
      if (injectCss) await page.addStyleTag({ content: injectCss })
      cells.push(await measure(page, client, v.id, 'rest'))
      await page.evaluate(() => [...document.querySelectorAll('.desk-card--flippable')].forEach(c => c.click()))
      await page.waitForTimeout(150)
      cells.push(await measure(page, client, v.id, 'opened'))
      await page.close()
    }
    const fb = await browser.newPage({ viewport: { width: 800, height: 700 } })
    const fbClient = await fb.context().newCDPSession(fb)
    await fbClient.send('DOM.enable')
    await fbClient.send('CSS.enable')
    await fb.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:0">${FALLBACK_HTML}${NAMED_HTML}</body>`)
    const fallback = await measure(fb, fbClient, 'X1', 'fallback')
    const { root: fbRoot } = await fbClient.send('DOM.getDocument', { depth: 0 })
    const { nodeIds: namedIds } = await fbClient.send('DOM.querySelectorAll', { nodeId: fbRoot.nodeId, selector: '[data-named]' })
    fallback.named = {}
    for (let i = 0; i < namedIds.length; i++) {
      const { fonts: list } = await fbClient.send('CSS.getPlatformFontsForNode', { nodeId: namedIds[i] })
      fallback.named[NAMED_FAMILIES[i][0]] = list.map(f => f.familyName)
    }
    await fb.close()
    return { label, url, injectCss, chromium: browser.version(), cells, fallback }
  } finally {
    await browser.close()
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()
  const cell = (id, phase, over = {}) => ({ id, phase, n: 3, scrollWidth: 360, scrollHeight: 900, rects: [[0, 0, 10, 10], [0, 10, 20, 10], [5, 5, 1, 1]], labels: ['div', 'p.a', 'span'], fonts: { 'DM Sans': 120 }, shotSha: 'aa', ...over })
  const run = (over = () => ({})) => ({ cells: VIEWPORTS.flatMap(v => PHASES.map(p => cell(v.id, p, over(v.id, p)))) })
  const base = run()
  const same = compareRuns(base, run())
  check('two identical runs: no geometry, font or pixel difference in any of 20 cells', same.checked === 20 && same.geometryDiffer === 0 && same.fontsDiffer === 0 && same.pixelsDiffer === 0 && same.newFonts.length === 0, JSON.stringify({ ...same, cells: undefined }))
  const moved = compareRuns(base, run((id, p) => (id === 'P1' && p === 'rest' ? { rects: [[0, 0, 10, 10], [0, 10, 21.5, 10], [5, 5, 1, 1]] } : {})))
  check('MUTATION: one element 1.5 px wider in one cell is a geometry difference in exactly that cell, with the element named', moved.geometryDiffer === 1 && moved.cells[0].geometry.join() === 'boxes' && moved.cells[0].maxDelta === 1.5 && moved.cells[0].first[0].el === 'p.a', JSON.stringify(moved.cells[0]))
  const quarter = compareRuns(base, run((id, p) => (id === 'P1' && p === 'rest' ? { rects: [[0, 0, 10, 10], [0, 10, 20.25, 10], [5, 5, 1, 1]] } : {})))
  check('MUTATION: a quarter-pixel change in one box is a geometry difference (the probe tolerates no change; the control decides what noise there is)', quarter.geometryDiffer === 1 && quarter.cells[0].maxDelta === 0.25, JSON.stringify(quarter.cells[0]))
  const scroll = compareRuns(base, run((id, p) => (id === 'D1' ? { scrollHeight: 901 } : {})))
  check('MUTATION: a scroll size that moves is a geometry difference in both states of that viewport', scroll.geometryDiffer === 2 && scroll.cells.filter(c => c.geometry.includes('scroll')).length === 2, JSON.stringify(scroll.geometryDiffer))
  const count = compareRuns(base, run((id, p) => (id === 'U1' && p === 'opened' ? { n: 4, rects: [...cell('x', 'y').rects, [0, 0, 1, 1]], labels: ['div', 'p.a', 'span', 'i'] } : {})))
  check('MUTATION: a different element count is a geometry difference, and the boxes are not compared across it', count.geometryDiffer === 1 && count.cells.find(c => c.geometry.length).geometry.join() === 'elementCount', JSON.stringify(count.cells.find(c => c.geometry.length)))
  const fonts = compareRuns(base, run((id, p) => (id === 'T1' && p === 'rest' ? { fonts: { 'DM Sans': 100, FreeSans: 20 } } : {})))
  check('MUTATION: a font that drew glyphs only in the second run is named, and is a font difference with no geometry difference', fonts.fontsDiffer === 1 && fonts.geometryDiffer === 0 && fonts.newFonts.join() === 'FreeSans', JSON.stringify({ newFonts: fonts.newFonts, f: fonts.fontsDiffer, g: fonts.geometryDiffer }))
  const pixels = compareRuns(base, run((id, p) => (id === 'L2' ? { shotSha: 'bb' } : {})))
  check('a pixel-only difference is counted and is not a geometry difference', pixels.pixelsDiffer === 2 && pixels.geometryDiffer === 0, JSON.stringify(pixels.pixelsDiffer))
  let threw = false
  try { compareRuns(base, { cells: base.cells.slice(1) }) } catch { threw = true }
  check('MUTATION: runs that do not measure the same cells are refused, not compared', threw, 'a mismatched pair was compared')

  const teethRun = compareRuns(base, run(() => ({ scrollWidth: 400 })))
  const allNamed = NAMED_FAMILIES.map(([f]) => f)
  const without = Object.fromEntries(allNamed.map(f => [f, ['DejaVu Sans']]))
  const withNine = { IPAGothic: ['IPAGothic'], 'WenQuanYi Zen Hei': ['WenQuanYi Zen Hei'], Loma: ['Loma'], FreeSans: ['FreeSans'], Unifont: ['Unifont'] }
  const seen = namedVisible(without, withNine)
  const J = over => verdictOf({ control: same, teeth: teethRun, treatment: same, apt: 'ok', visible: seen, ...over })
  check('control repeats, teeth see the change, treatment identical: fonts-not-needed', J({}).verdict === 'fonts-not-needed', JSON.stringify(J({})))
  check('MUTATION: a treatment that moves geometry is fonts-matter, and says how many cells', J({ treatment: moved }).verdict === 'fonts-matter' && /1 of 20 cells/.test(J({ treatment: moved }).why), JSON.stringify(J({ treatment: moved })))
  check('MUTATION: a treatment with no geometry change in which a new font drew glyphs is fonts-matter, naming it', J({ treatment: fonts }).verdict === 'fonts-matter' && /FreeSans/.test(J({ treatment: fonts }).why), JSON.stringify(J({ treatment: fonts })))
  check('MUTATION: a control that differs makes the answer not-observable, whatever the treatment says', J({ control: moved }).verdict === 'not-observable' && /not repeatable/.test(J({ control: moved }).why), JSON.stringify(J({ control: moved })))
  check('MUTATION: teeth that miss even one cell make the answer not-observable', J({ teeth: compareRuns(base, run((id, p) => (id === 'U1' && p === 'opened' ? {} : { scrollWidth: 400 }))) }).verdict === 'not-observable', 'a probe that cannot see a font change still answered')
  check('MUTATION: an apt install that failed is not-observable even when everything else is clean', J({ apt: 'failed' }).verdict === 'not-observable' && /apt failed/.test(J({ apt: 'failed' }).why), JSON.stringify(J({ apt: 'failed' })))
  const txt = textOf({ ...J({}), control: same, teeth: teethRun, treatment: same, apt: 'ok' })
  check('the first line of the printed result is the denominator, then the verdict (Rule 91)', /^checked 20 of 20 cells \(10 viewports x 2 states\); control 0 differ, teeth 20 differ, treatment 0 differ/.test(txt) && txt.split('\n')[1] === 'VERDICT: fonts-not-needed', txt.split('\n').slice(0, 2).join(' | '))
  check('the ten viewports are the overflow check\'s (ids, widths, heights)', (() => {
    const src = readFileSync(new URL('./viewport-overflow-check.mjs', import.meta.url), 'utf8')
    return VIEWPORTS.every(v => new RegExp(`id: '${v.id}',\\s+name: '[^']*',\\s+w: ${v.w},\\s+h: ${v.h},`).test(src))
  })(), 'the viewport table here has drifted from scripts/viewport-overflow-check.mjs')
  check('the nine fonts are the nine the 2026-11-11 apt log lists', NINE_FONTS.length === 9 && new Set(NINE_FONTS).size === 9, NINE_FONTS.join(' '))
  const before = 'image: PRETTY_NAME="Ubuntu 26.04" / 20261101\ndpkg_list_sha: aaaa\ndpkg_log_bytes: 100\napt_history_bytes: 200\napt_lists_sha: cccc\nnine_fonts_installed: 0\nfc_list_lines: 12\n'
  const after = 'dpkg_list_sha: aaaa\ndpkg_log_bytes: 100\napt_history_bytes: 200\napt_lists_sha: cccc\nshim_calls: 0\nbrowser_binaries: 2\nldd_not_found: /x/chrome 0\nldd_not_found: /x/headless 0\nldd_not_found_total: 0\n'
  const tinfo = 'timeout_path: /usr/bin/timeout\ntimeout_version: timeout (GNU coreutils) 9.4\nplain_exit: 124\nplain_seconds: 3\nplain_survivors: 0\nkill_exit: 124\nkill_seconds: 3\nkill_survivors: 0\n'
  const P = over => premisesOf({ before, after, seconds: 'install_seconds: 9\n', fontsAfter: 'nine_fonts_installed: 9\n', timeoutInfo: tinfo, ...over })
  check('premises: a clean install is 7 of 7 held, and the count is the first line', P({}).held === 7 && P({}).text.split('\n')[0] === 'checked 7 of 7 premises: 7 held', P({}).text.split('\n')[0])
  check('MUTATION: a package-list change, a dpkg.log growth, an apt history growth, a rewritten apt lists directory (apt-get update) or a missing lists hash each fails the first premise',
    [after.replace('dpkg_list_sha: aaaa', 'dpkg_list_sha: bbbb'), after.replace('dpkg_log_bytes: 100', 'dpkg_log_bytes: 150'), after.replace('apt_history_bytes: 200', 'apt_history_bytes: 260'), after.replace('apt_lists_sha: cccc', 'apt_lists_sha: dddd'), after.replace('apt_lists_sha: cccc\n', '')].every(a => P({ after: a }).held === 6 && /^FAILED  the install changed no package/m.test(P({ after: a }).text)),
    'an install that touched apt was read as clean')
  check('MUTATION: a shim call fails the second premise, and so does a missing count',
    P({ after: after.replace('shim_calls: 0', 'shim_calls: 3') }).held === 6 && P({ after: after.replace('shim_calls: 0\n', '') }).held === 6, 'a logged apt call, or a missing count, passed')
  check('MUTATION: one library not found, or no browser binary at all, fails the third premise',
    P({ after: after.replace('ldd_not_found_total: 0', 'ldd_not_found_total: 1') }).held === 6 && P({ after: after.replace('browser_binaries: 2', 'browser_binaries: 0') }).held === 6, 'a missing library, or nothing to check, passed')
  check('MUTATION: 181 s, a missing time, and exactly 180 s: only the first two fail the limit',
    P({ seconds: 'install_seconds: 181\n' }).held === 6 && P({ seconds: '' }).held === 6 && P({ seconds: 'install_seconds: 180\n' }).held === 7, 'the limit is read wrongly')
  check('MUTATION: a runner that already had one of the nine fonts fails the last premise (the treatment would not be a change)',
    P({ before: before.replace('nine_fonts_installed: 0', 'nine_fonts_installed: 1') }).held === 6, 'a treatment that changes nothing passed')
  check('premises: an empty input holds nothing and does not throw', premisesOf({ before: '', after: '', seconds: '', fontsAfter: '' }).held === 0, 'empty input held a premise')
  check('MUTATION: a timeout that exits 0, leaves a process behind, takes longer than its limit allows, or was never measured fails its premise (plain and --kill-after separately)',
    [tinfo.replace('plain_exit: 124', 'plain_exit: 0'), tinfo.replace('plain_survivors: 0', 'plain_survivors: 2'), tinfo.replace('plain_seconds: 3', 'plain_seconds: 30'), tinfo.replace('kill_exit: 124', 'kill_exit: 0'), tinfo.replace('kill_survivors: 0', 'kill_survivors: 1'), '']
      .every(t => P({ timeoutInfo: t }).held <= 6) && P({ timeoutInfo: tinfo.replace('plain_exit: 124', 'plain_exit: 0') }).held === 6 && P({ timeoutInfo: '' }).held === 5,
    'a timeout that does not stop the tree passed')
  check('a timeout that exits 125 (uutils with --kill-after) or 137 (SIGKILL) still fails the step, so it holds', P({ timeoutInfo: tinfo.replace('kill_exit: 124', 'kill_exit: 125') }).held === 7 && P({ timeoutInfo: tinfo.replace('kill_exit: 124', 'kill_exit: 137') }).held === 7, 'a non-zero exit other than 124 was refused')
  const noT = textOf({ control: same, teeth: teethRun, treatment: null, verdict: 'not-observable', why: 'the nine fonts were not installed (apt failed), so there is no treatment run to compare', apt: 'failed' })
  check('MUTATION: when apt failed the first line says the treatment was not run and compared 0 cells, and does not print a clean treatment', /treatment NOT RUN \(0 of 0 cells compared\)/.test(noT.split('\n')[0]) && !/treatment 0 differ/.test(noT) && /treatment not run/.test(noT), noT.split('\n')[0])
  const fbA = { id: 'X1', phase: 'fallback', n: 3, scrollWidth: 800, scrollHeight: 300, rects: [[0, 0, 1, 1], [0, 1, 2, 2], [3, 3, 3, 3]], labels: ['p', 'p', 'p'], fonts: { 'DM Sans': 10 }, shotSha: 'x' }
  check('the fallback line says same when nothing moved, and DIFFER with the size and both font maps when a fallback font changed the boxes', /boxes same, fonts same, pixels same/.test(fallbackLine(fbA, fbA, 'l')) && /boxes DIFFER \(max 4px\).*fonts DIFFER.*"Noto":3/.test(fallbackLine(fbA, { ...fbA, rects: [[0, 0, 1, 1], [0, 1, 6, 2], [3, 3, 3, 3]], fonts: { 'DM Sans': 7, Noto: 3 }, shotSha: 'y' }, 'l')) && /not measured/.test(fallbackLine(fbA, undefined, 'l')), fallbackLine(fbA, fbA, 'l'))
  check('the treatment is visible when the five families asked for by name are drawn by their own fonts after the install and by a fallback before: 5 of 5, all drawn as asked',
    seen.changed.length === 5 && seen.drawnAsAsked.length === 5, JSON.stringify(seen))
  const sameAgain = namedVisible(without, without)
  check('MUTATION: a no-op treatment (the same fonts drawn before and after) is visible in 0 of 5, and the verdict is then not-observable, not fonts-not-needed',
    sameAgain.changed.length === 0 && J({ visible: sameAgain }).verdict === 'not-observable' && /not visible to Chromium: only 0 of 5/.test(J({ visible: sameAgain }).why), JSON.stringify(J({ visible: sameAgain })))
  check('MUTATION: 2 of 5 is not enough and 3 of 5 is (the packages are five Chromium-drawn families, one may be named differently on another image)',
    J({ visible: { ...seen, changed: allNamed.slice(0, 2) } }).verdict === 'not-observable' && J({ visible: { ...seen, changed: allNamed.slice(0, 3) } }).verdict === 'fonts-not-needed', 'the visibility threshold is wrong')
  const safely = f => { try { return f() } catch { return false } }
  check('MUTATION: a family missing from one run counts as not changed, not as changed, and does not throw', safely(() => namedVisible({ Loma: ['A'] }, {}).changed.length === 0 && namedVisible(undefined, undefined).changed.length === 0), 'a missing measurement was read as a change, or threw')
  let reversedThrew = false
  try { compareRuns(base, { cells: [...base.cells].reverse() }) } catch { reversedThrew = true }
  check('MUTATION: two runs with the same number of cells in a different order are refused (the guard, not a TypeError on a short run)', reversedThrew, 'the same cells in another order were compared')
  check('MUTATION: the printed denominators are pinned where they differ from the numerators: 6 of 7 premises held, and one geometry difference in the treatment',
    P({ after: after.replace('shim_calls: 0', 'shim_calls: 3') }).text.split('\n')[0] === 'checked 7 of 7 premises: 6 held'
      && /, treatment 1 differ in geometry$/.test(textOf({ ...J({ treatment: moved }), control: same, teeth: teethRun, treatment: moved, apt: 'ok' }).split('\n')[0]),
    P({ after: after.replace('shim_calls: 0', 'shim_calls: 3') }).text.split('\n')[0])
  const stamped = textOf({ ...J({}), control: same, teeth: teethRun, treatment: same, apt: 'ok', visible: seen, stamp: 'run 7 sha abc at 2026-11-11T21:00:00Z', firstRunFonts: { 'DM Sans': 9 } })
  check('the stamp is the second line, and the scope, the treatment visibility and the first-run fonts are printed', stamped.split('\n')[1] === 'stamp: run 7 sha abc at 2026-11-11T21:00:00Z' && /Scoreboard tab of \?data=context-2026-08-29 only \(1 of 11 tabs/.test(stamped) && /treatment visible to Chromium.*5 of 5/.test(stamped) && /first run: glyphs drawn per font family: \{"DM Sans":9\}/.test(stamped), stamped.split('\n').slice(0, 4).join(' | '))
  finish(summarize())
} else if (isMain(import.meta.url) && process.argv.includes('--run')) {
  const r = await runProbe({ url: arg('--url', PAGE_URL), label: arg('--label', 'run'), injectCss: arg('--inject-css', '') })
  writeFileSync(arg('--out', '/dev/stdout'), JSON.stringify(r))
  const used = {}
  for (const c of r.cells) for (const [f, n] of Object.entries(c.fonts)) used[f] = (used[f] ?? 0) + n
  console.log(`${r.label}: ${r.cells.length} cells, chromium ${r.chromium}; fonts that drew glyphs: ${JSON.stringify(used)}`)
} else if (isMain(import.meta.url) && process.argv.includes('--premises')) {
  const read = f => { try { return readFileSync(arg(f), 'utf8') } catch { return '' } }
  const inputs = { before: read('--before'), after: read('--after'), seconds: read('--seconds'), fontsAfter: read('--fonts-after'), timeoutInfo: read('--timeout-file') }
  const r = premisesOf(inputs)
  const missing = Object.entries(inputs).filter(([, v]) => v === '').map(([k]) => k)
  const lines = r.text.split('\n')
  const text = [lines[0], ...(arg('--stamp', null) ? [`stamp: ${arg('--stamp')}`] : []), ...missing.map(k => `NOT PRODUCED  input ${k}: the step that writes it did not run or failed, so the premises that read it are failed, not skipped`), ...lines.slice(1)].join('\n')
  process.stdout.write(text)
  writeFileSync(arg('--out', '/dev/null'), text)
  process.exitCode = r.held === r.total ? 0 : 2
} else if (isMain(import.meta.url) && process.argv.includes('--judge')) {
  const load = f => JSON.parse(readFileSync(arg(f), 'utf8'))
  const a1 = load('--a1'), a2 = load('--a2'), t = load('--teeth')
  const apt = arg('--apt', 'failed')
  const b = apt === 'ok' ? load('--b') : null
  const control = compareRuns(a1, a2)
  const teeth = compareRuns(a1, t)
  const treatment = b ? compareRuns(a1, b) : null
  const visible = b ? namedVisible(a1.fallback?.named, b.fallback?.named) : null
  const v = verdictOf({ control, teeth, treatment, apt, visible })
  const meta = { chromium: a1.chromium, url: a1.url }
  const fallback = [fallbackLine(a1.fallback, a2.fallback, 'control, the first run against the same again'), fallbackLine(a1.fallback, b?.fallback, 'treatment, without the nine fonts against with them')]
  const firstRunFonts = {}
  for (const c of a1.cells) for (const [f, n] of Object.entries(c.fonts)) firstRunFonts[f] = (firstRunFonts[f] ?? 0) + n
  const stamp = arg('--stamp', null)
  const text = textOf({ control, teeth, treatment, ...v, apt, meta, fallback, visible, firstRunFonts, stamp })
  process.stdout.write(text)
  writeFileSync(arg('--text', '/dev/null'), text)
  writeFileSync(arg('--json', '/dev/null'), JSON.stringify({ ...v, apt, meta, stamp, visible, firstRunFonts, summary: { control: { ...control, cells: undefined }, teeth: { ...teeth, cells: undefined }, treatment: treatment ? { ...treatment, cells: undefined } : null }, fallback, treatmentMoved: treatment ? treatment.cells.filter(c => c.geometry.length).slice(0, 20) : [] }, null, 2) + '\n')
  process.exitCode = v.verdict === 'not-observable' ? 2 : 0
} else if (isMain(import.meta.url)) {
  console.log('usage: --run | --judge | --self-test (see the header)')
  process.exitCode = 1
}
