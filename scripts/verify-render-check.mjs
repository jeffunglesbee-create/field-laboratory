// The Verify panel, driven in a real browser.
//
// WHAT THIS ASSERTS, AND WHAT IT DELIBERATELY DOES NOT
//
// It does not re-check the suite's invariants. `build/VerifyMain.js` does that,
// and a second copy of a rule that already has one is how this repo's checks
// drift apart. What only a browser can answer is whether the page SHOWS what the
// suite proves — the counterexample per row, the three verdicts kept apart, and
// the runner demonstrating itself before any of the 146 are read.
//
// THE COUNT IS READ FROM THE NODE SUITE, never typed. A hardcoded 146 would keep
// passing against a suite that had grown, which is the shape of every check this
// repo has had to re-anchor. The page and the terminal must agree, and the point
// of the assertion is that they are the same suite.
//
// Usage:  URL=http://localhost:8080/?tab=verify node scripts/verify-render-check.mjs
//         node scripts/verify-render-check.mjs --self-test

import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createChecks, finish } from './checks.mjs'

/**
 * The suite's own count, from the run that gates commits.
 *
 * THE LAST MATCH, NOT THE FIRST, and the first version got this wrong in a way
 * worth keeping the note for. `VerifyMain` prints TWO "N/N checks held" lines:
 * phase 1's counting probe deliberately runs a 3-row suite containing a
 * toothless row and a broken one, so the first line in the output is
 * `1/3 checks held`. Reading it made this check assert that the page should
 * agree with a 3-row suite — and its own self-test caught that on the first run,
 * which is the only reason the note is here rather than a defect on the page.
 */
const nodeSuiteCount = () => {
  const out = execSync('node build/VerifyMain.js', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  const all = [...out.matchAll(/(\d+)\/(\d+) checks held/g)]
  const m = all[all.length - 1]
  return m ? { held: Number(m[1]), total: Number(m[2]) } : null
}

if (process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()
  check('the built suite is present to read a count from', existsSync('build/VerifyMain.js'),
    'build/VerifyMain.js missing — run npm run build first')
  const counted = existsSync('build/VerifyMain.js') ? nodeSuiteCount() : null
  check('the node suite prints a count this check can parse', counted !== null,
    'no "N/N checks held" line — the expectations below would have nothing to compare against')
  check('the suite is a suite, not a handful', counted !== null && counted.total > 100,
    `total ${counted?.total} — a page agreeing with a 3-row suite proves nothing`)
  check('the node suite is green, so a red row on the page is the PAGE\'s fault',
    counted !== null && counted.held === counted.total,
    `${counted?.held}/${counted?.total} — fix the suite before reading the panel`)
  process.exit(summarize())
}

const { chromium } = await import('playwright')
const URL_BASE = process.env.URL || 'http://localhost:8080/?tab=verify'
const { check, summarize } = createChecks()

const expected = nodeSuiteCount()

const sessionChromium = '/opt/pw-browsers/chromium'
const browser = await chromium.launch(
  existsSync(sessionChromium) ? { executablePath: sessionChromium } : {})
const page = await browser.newPage()
const pageErrors = []
page.on('pageerror', e => pageErrors.push(String(e)))

await page.goto(URL_BASE, { waitUntil: 'networkidle' })

const bootSelected = await page.$eval('#tab-verify', t => t.getAttribute('aria-selected'))
check('?tab=verify selects the Verify tab on boot', bootSelected === 'true',
  `aria-selected="${bootSelected}"`)
if (bootSelected !== 'true') await page.click('#tab-verify')

await page.waitForSelector('#panel-verify .sv-groups', { timeout: 60000 })

const attr = (sel, a) => page.$eval(sel, (e, k) => e.getAttribute(k), a).catch(() => null)
const count = sel => page.$$eval(sel, es => es.length)

// --- phase 1: the runner shows itself ---------------------------------------

const selfVerdicts = await page.$$eval('#panel-verify .sv-selftest__row .sv-verdict',
  vs => vs.map(v => v.getAttribute('data-verdict')))

check('the runner demonstrates all three verdicts before the suite',
  ['held', 'no teeth', 'broke'].every(v => selfVerdicts.includes(v)) && selfVerdicts.length === 3,
  `self-test verdicts: ${JSON.stringify(selfVerdicts)} — a page that only ever shows "held" `
  + 'has not shown that the runner can tell the other two apart')

check('the self-test says the runner told all three apart',
  (await attr('#panel-verify .sv-selftest__verdict', 'data-agreed')) === '3',
  `data-agreed="${await attr('#panel-verify .sv-selftest__verdict', 'data-agreed')}"`)

// The self-test must come BEFORE the score in document order. A runner shown
// blind AFTER its own results have been read is a footnote, not a gate.
const selfTestFirst = await page.evaluate(() => {
  const s = document.querySelector('#panel-verify .sv-selftest')
  const score = document.querySelector('#panel-verify .sv-head__score')
  return !!(s && score) && (s.compareDocumentPosition(score) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
})
check('the runner is shown before the suite score, not after it', selfTestFirst,
  'the self-test does not precede .sv-head__score in document order')

// --- phase 2: the suite, and the page agreeing with the terminal -------------

check('the page runs every check the node suite runs',
  (await count('#panel-verify .sv-row')) === expected.total,
  `page drew ${await count('#panel-verify .sv-row')} rows, node suite ran ${expected.total}`)

// AND AN INDEPENDENT COUNT, because the row above cannot detect the suite
// SHRINKING and a mutation proved it. `Suite.all ()` is `Suite.groups ()`
// flattened, so the node total and the page's rows are the same derivation:
// delete a group from `groups ()` and both numbers fall together, still agreeing.
// The mutation `verify-panel-drops-a-group` removed the eleventh group and this
// check passed — a claim nothing defended, in the check written to defend it.
//
// The declarations in the source are a different derivation. A check declared in
// Suite.fs and left out of every group is a check that never runs, and that is
// the defect this catches, not a false alarm.
const declared = (readFileSync('src/Suite.fs', 'utf8').match(/Verify\.check /g) || []).length
check('the source declares checks for this count to mean anything', declared > 100,
  `${declared} occurrences of "Verify.check " in src/Suite.fs — a regex matching nothing `
  + 'would make the assertion below vacuously true, which is this repo\'s recurring wound')
check('every check DECLARED in the suite source reaches the page',
  declared === expected.total,
  `src/Suite.fs declares ${declared} checks; ${expected.total} ran. A declared check missing `
  + 'from Suite.groups () never runs, and neither the page nor the node suite would notice')

check('the page reports the same total the node suite does',
  (await attr('#panel-verify .sv-head__score', 'data-total')) === String(expected.total),
  `data-total="${await attr('#panel-verify .sv-head__score', 'data-total')}", node says ${expected.total}`)

check('the page reports the same held count',
  (await attr('#panel-verify .sv-head__score', 'data-held')) === String(expected.held),
  `data-held="${await attr('#panel-verify .sv-head__score', 'data-held')}", node says ${expected.held}`)

check('the gate is reported as a gate, not a percentage',
  (await attr('#panel-verify .sv-head__score', 'data-gate')) === 'passed',
  `data-gate="${await attr('#panel-verify .sv-head__score', 'data-gate')}"`)

// THE ROW THAT WOULD HAVE CAUGHT THE FIRST BUILD. It computed the elapsed time
// as an argument to render(), so the subtraction ran before a single check had,
// and the page said "146 checks ran in this browser in 0ms".
const elapsed = Number(await attr('#panel-verify .sv-head__timing', 'data-elapsed-ms'))
check('the timing is measured around the work, not before it', elapsed > 0,
  `data-elapsed-ms="${elapsed}" — zero means the clock was read on both sides of nothing`)

// --- the counterexamples, which are the point --------------------------------

const withCounterexample = await count('#panel-verify .sv-row [data-counterexample="true"]')
check('every row shows the input that must fail', withCounterexample === expected.total,
  `${withCounterexample} of ${expected.total} rows carry a counterexample`)

const emptyCounterexamples = await page.$$eval('#panel-verify .sv-row [data-counterexample="true"]',
  ds => ds.filter(d => !d.textContent.trim()).length)
check('no counterexample is blank', emptyCounterexamples === 0,
  `${emptyCounterexamples} rows print an empty counterexample — a blank one is not a shown one`)

// --- feeding the predicate, on a sample, and SAYING it is a sample ------------
//
// Rule 91: a probe that checks a subset says so where the result is read. Every
// row would mean 146 expansions and two clicks each; the sample is spread across
// the whole list rather than taken from the front, because the front is one
// group.
const SAMPLE = 12
const total = expected.total
const indices = Array.from({ length: SAMPLE }, (_, i) => Math.floor((i * total) / SAMPLE))
const fed = []
for (const i of indices) {
  const row = await page.$(`#panel-verify .sv-row[data-row="${i}"]`)
  if (!row) { fed.push({ i, error: 'row not found' }); continue }
  await row.evaluate(r => { r.open = true })
  const buttons = await row.$$('.sv-run__button')
  if (buttons.length !== 2) { fed.push({ i, error: `${buttons.length} buttons` }); continue }
  await buttons[1].click()   // the counterexample
  const onFail = await row.$eval('.sv-run__result', e => e.getAttribute('data-returned'))
  await buttons[0].click()   // the input that must hold
  const onHold = await row.$eval('.sv-run__result', e => e.getAttribute('data-returned'))
  fed.push({ i, onFail, onHold })
}

const fedCorrectly = fed.filter(f => f.onFail === 'false' && f.onHold === 'true')
check(`feeding the counterexample returns false, and the must-hold input true `
  + `(checked ${SAMPLE} of ${total} rows)`,
  fedCorrectly.length === SAMPLE,
  `${fedCorrectly.length} of ${SAMPLE}: ${JSON.stringify(fed.filter(f => !fedCorrectly.includes(f)))}`)

// --- structure ---------------------------------------------------------------

const groups = Number(await attr('#panel-verify .sv-groups', 'data-groups'))
check('the suite is grouped, not one flat list of 146', groups > 1,
  `data-groups="${groups}"`)

const grouped = await page.$$eval('#panel-verify .sv-group',
  gs => gs.reduce((n, g) => n + g.querySelectorAll('.sv-row').length, 0))
check('every row sits in a group — none is orphaned outside one', grouped === expected.total,
  `${grouped} rows inside groups, ${expected.total} rows on the page`)

const overflow = await page.evaluate(() => ({
  doc: document.documentElement.scrollWidth, win: window.innerWidth,
}))
check('the panel does not scroll the page sideways', overflow.doc <= overflow.win + 1,
  `document ${overflow.doc}px in a ${overflow.win}px window`)

check('no page errors', pageErrors.length === 0, pageErrors.join('\n'))

await browser.close()
finish(summarize())
