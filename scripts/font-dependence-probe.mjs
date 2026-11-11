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
//   node scripts/font-dependence-probe.mjs --premises --before /tmp/before.txt --after /tmp/after.txt --seconds /tmp/install-seconds.txt --fonts-after /tmp/fonts-after.txt --out outbox/install-no-apt-probe-latest.txt
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
export const verdictOf = ({ control, teeth, treatment, apt }) => {
  if (apt !== 'ok') return { verdict: 'not-observable', why: 'the nine fonts were not installed (apt failed), so there is no treatment run to compare' }
  if (control.geometryDiffer > 0) return { verdict: 'not-observable', why: `the control is not repeatable: two runs of the same page differ in geometry in ${control.geometryDiffer} of ${control.checked} cells` }
  if (teeth.geometryDiffer < teeth.checked) return { verdict: 'not-observable', why: `the probe cannot see a font change: forcing every font to monospace moved geometry in ${teeth.geometryDiffer} of ${teeth.checked} cells, not all` }
  const used = treatment.newFonts
  if (treatment.geometryDiffer === 0 && used.length === 0) {
    return { verdict: 'fonts-not-needed', why: `with the nine fonts installed no element box or scroll size moved in any of ${treatment.checked} cells, and no font outside the first run's drew a glyph` }
  }
  return {
    verdict: 'fonts-matter',
    why: `${treatment.geometryDiffer} of ${treatment.checked} cells moved in geometry and ${used.length} font(s) not in the first run drew glyphs${used.length ? `: ${used.join(', ')}` : ''}`,
  }
}

export const textOf = ({ control, teeth, treatment, verdict, why, apt, meta }) => [
  `checked ${treatment.checked} of ${treatment.checked} cells (${VIEWPORTS.length} viewports x ${PHASES.length} states); control ${control.geometryDiffer} differ, teeth ${teeth.geometryDiffer} differ, treatment ${treatment.geometryDiffer} differ in geometry`,
  `VERDICT: ${verdict}`,
  `why: ${why}`,
  `apt install of the nine fonts: ${apt}`,
  `pixels: control ${control.pixelsDiffer}, teeth ${teeth.pixelsDiffer}, treatment ${treatment.pixelsDiffer} of ${treatment.checked} cells differ (reported, not decided on)`,
  `fonts that drew glyphs in the treatment and not in the first run: ${treatment.newFonts.join(', ') || 'none'}`,
  `cells whose font usage differs: control ${control.fontsDiffer}, teeth ${teeth.fontsDiffer}, treatment ${treatment.fontsDiffer}`,
  ...(meta ? [`chromium ${meta.chromium}; url ${meta.url}`] : []),
  ...treatment.cells.filter(c => c.geometry.length).slice(0, 5).map(c => `  moved: ${c.cell} ${c.geometry.join('+')} maxDelta ${c.maxDelta}px ${JSON.stringify(c.first[0] ?? null)}`),
].join('\n') + '\n'

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// The install's own premises, read from what the workflow printed before and after it (`key: value` lines).

export const kv = text => Object.fromEntries(String(text ?? '').split('\n').map(l => /^([A-Za-z_]+):\s*(.*)$/.exec(l)).filter(Boolean).map(m => [m[1], m[2].trim()]))
export const INSTALL_LIMIT_SECONDS = 180

/** Five premises of "drop --with-deps", each held or failed from the numbers. `checked N of N` is printed first (Rule 91). */
export const premisesOf = ({ before, after, seconds, fontsAfter }) => {
  const b = kv(before), a = kv(after), sec = kv(seconds), f = kv(fontsAfter)
  const n = x => (x !== undefined && /^\d+$/.test(x) ? Number(x) : null)
  const list = [
    [b.dpkg_list_sha !== undefined && b.dpkg_list_sha === a.dpkg_list_sha && b.dpkg_log_bytes === a.dpkg_log_bytes && b.apt_history_bytes === a.apt_history_bytes,
      `the install changed no package and wrote nothing to the dpkg or apt logs (package list ${b.dpkg_list_sha} -> ${a.dpkg_list_sha}; dpkg.log ${b.dpkg_log_bytes} -> ${a.dpkg_log_bytes} bytes; apt history ${b.apt_history_bytes} -> ${a.apt_history_bytes})`],
    [n(a.shim_calls) === 0,
      `no apt, apt-get, dpkg or sudo call was made during the install, each shimmed on PATH (${a.shim_calls ?? 'unknown'} calls logged)`],
    [n(a.ldd_not_found_total) === 0 && n(a.browser_binaries) >= 1,
      `every browser binary the install left has all its shared libraries (${a.browser_binaries ?? 'unknown'} binaries, ${a.ldd_not_found_total ?? 'unknown'} libraries not found)`],
    [n(sec.install_seconds) !== null && n(sec.install_seconds) <= INSTALL_LIMIT_SECONDS,
      `the install finished inside its ${INSTALL_LIMIT_SECONDS} s limit (${sec.install_seconds ?? 'unknown'} s)`],
    [n(b.nine_fonts_installed) === 0,
      `none of the nine fonts was installed before, so the treatment is a real change (${b.nine_fonts_installed ?? 'unknown'} of 9 present before; ${f.nine_fonts_installed ?? 'not installed'} of 9 after the apt step)`],
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
    return { label, url, injectCss, chromium: browser.version(), cells }
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
  const J = over => verdictOf({ control: same, teeth: teethRun, treatment: same, apt: 'ok', ...over })
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
  const before = 'image: PRETTY_NAME="Ubuntu 26.04" / 20261101\ndpkg_list_sha: aaaa\ndpkg_log_bytes: 100\napt_history_bytes: 200\nnine_fonts_installed: 0\nfc_list_lines: 12\n'
  const after = 'dpkg_list_sha: aaaa\ndpkg_log_bytes: 100\napt_history_bytes: 200\nshim_calls: 0\nbrowser_binaries: 2\nldd_not_found: /x/chrome 0\nldd_not_found: /x/headless 0\nldd_not_found_total: 0\n'
  const P = over => premisesOf({ before, after, seconds: 'install_seconds: 9\n', fontsAfter: 'nine_fonts_installed: 9\n', ...over })
  check('premises: a clean install is 5 of 5 held, and the count is the first line', P({}).held === 5 && P({}).text.split('\n')[0] === 'checked 5 of 5 premises: 5 held', P({}).text.split('\n')[0])
  check('MUTATION: a package-list change, a dpkg.log growth or an apt history growth each fails the first premise',
    [after.replace('dpkg_list_sha: aaaa', 'dpkg_list_sha: bbbb'), after.replace('dpkg_log_bytes: 100', 'dpkg_log_bytes: 150'), after.replace('apt_history_bytes: 200', 'apt_history_bytes: 260')].every(a => P({ after: a }).held === 4 && /^FAILED  the install changed no package/m.test(P({ after: a }).text)),
    'an install that touched apt was read as clean')
  check('MUTATION: a shim call fails the second premise, and so does a missing count',
    P({ after: after.replace('shim_calls: 0', 'shim_calls: 3') }).held === 4 && P({ after: after.replace('shim_calls: 0\n', '') }).held === 4, 'a logged apt call, or a missing count, passed')
  check('MUTATION: one library not found, or no browser binary at all, fails the third premise',
    P({ after: after.replace('ldd_not_found_total: 0', 'ldd_not_found_total: 1') }).held === 4 && P({ after: after.replace('browser_binaries: 2', 'browser_binaries: 0') }).held === 4, 'a missing library, or nothing to check, passed')
  check('MUTATION: 181 s, a missing time, and exactly 180 s: only the first two fail the limit',
    P({ seconds: 'install_seconds: 181\n' }).held === 4 && P({ seconds: '' }).held === 4 && P({ seconds: 'install_seconds: 180\n' }).held === 5, 'the limit is read wrongly')
  check('MUTATION: a runner that already had one of the nine fonts fails the last premise (the treatment would not be a change)',
    P({ before: before.replace('nine_fonts_installed: 0', 'nine_fonts_installed: 1') }).held === 4, 'a treatment that changes nothing passed')
  check('premises: an empty input holds nothing and does not throw', premisesOf({ before: '', after: '', seconds: '', fontsAfter: '' }).held === 0, 'empty input held a premise')
  finish(summarize())
} else if (isMain(import.meta.url) && process.argv.includes('--run')) {
  const r = await runProbe({ url: arg('--url', PAGE_URL), label: arg('--label', 'run'), injectCss: arg('--inject-css', '') })
  writeFileSync(arg('--out', '/dev/stdout'), JSON.stringify(r))
  const used = {}
  for (const c of r.cells) for (const [f, n] of Object.entries(c.fonts)) used[f] = (used[f] ?? 0) + n
  console.log(`${r.label}: ${r.cells.length} cells, chromium ${r.chromium}; fonts that drew glyphs: ${JSON.stringify(used)}`)
} else if (isMain(import.meta.url) && process.argv.includes('--premises')) {
  const read = f => { try { return readFileSync(arg(f), 'utf8') } catch { return '' } }
  const r = premisesOf({ before: read('--before'), after: read('--after'), seconds: read('--seconds'), fontsAfter: read('--fonts-after') })
  process.stdout.write(r.text)
  writeFileSync(arg('--out', '/dev/null'), r.text)
  process.exitCode = r.held === r.total ? 0 : 2
} else if (isMain(import.meta.url) && process.argv.includes('--judge')) {
  const load = f => JSON.parse(readFileSync(arg(f), 'utf8'))
  const a1 = load('--a1'), a2 = load('--a2'), t = load('--teeth')
  const apt = arg('--apt', 'failed')
  const b = apt === 'ok' ? load('--b') : null
  const control = compareRuns(a1, a2)
  const teeth = compareRuns(a1, t)
  const treatment = b ? compareRuns(a1, b) : { checked: a1.cells.length, geometryDiffer: 0, fontsDiffer: 0, pixelsDiffer: 0, newFonts: [], cells: [] }
  const v = verdictOf({ control, teeth, treatment, apt })
  const meta = { chromium: a1.chromium, url: a1.url }
  const text = textOf({ control, teeth, treatment, ...v, apt, meta })
  process.stdout.write(text)
  writeFileSync(arg('--text', '/dev/null'), text)
  writeFileSync(arg('--json', '/dev/null'), JSON.stringify({ ...v, apt, meta, summary: { control: { ...control, cells: undefined }, teeth: { ...teeth, cells: undefined }, treatment: { ...treatment, cells: undefined } }, treatmentMoved: treatment.cells.filter(c => c.geometry.length).slice(0, 20) }, null, 2) + '\n')
  process.exitCode = v.verdict === 'not-observable' ? 2 : 0
} else if (isMain(import.meta.url)) {
  console.log('usage: --run | --judge | --self-test (see the header)')
  process.exitCode = 1
}
