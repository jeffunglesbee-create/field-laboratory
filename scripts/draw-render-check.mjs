// The Draw panel, driven in a real browser against the committed capture.
//
// WHAT THIS IS FOR, and what it deliberately does not repeat.
//
// `Suite.fs` already proves the draw's invariants: 126 edges resolve to exactly
// one next match, the entry round is never off-canonical, a scheduled final does
// not make a draw complete. Re-asserting those here would be a second copy of a
// rule that already has one.
//
// What only a browser can answer is whether the page SAYS them. The verdict a
// round carries is the whole reason this surface exists — for two months "not
// compared" and "compared and fine" rendered identically, and nine of ten
// Masters draws were reported corrupt on the strength of it. So every assertion
// below is about a claim reaching the DOM, not about the claim being true.
//
// Usage:  URL=http://localhost:8080/?tab=draw node scripts/draw-render-check.mjs
//         node scripts/draw-render-check.mjs --self-test

import { existsSync, readFileSync } from 'node:fs'
import { createChecks, finish } from './checks.mjs'

const CAPTURE = 'data/tennis-draw.json'

// --- self-test ---------------------------------------------------------------
//
// Not a browser run. It asserts that the EXPECTATIONS below are read off the
// capture rather than typed in from memory — a hardcoded 127 would keep passing
// against a capture that had changed, which is the shape of every check this
// repo has had to re-anchor.
if (process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()
  const cap = JSON.parse(readFileSync(CAPTURE, 'utf8'))
  check('the capture is on disk and parses', Array.isArray(cap.nodes),
    `${CAPTURE} has no nodes array`)
  check('the capture is a whole draw, not one match', cap.nodes.length > 100,
    `${cap.nodes.length} nodes`)
  check('the capture is finished, so a champion is expected',
    cap.nodes.some(n => n.round === 'Final' && n.winnerId != null),
    'no finished Final — the champion assertion below would be checking the wrong state')
  check('every round the capture holds is a round of the draw',
    cap.rounds.length === new Set(cap.nodes.map(n => n.round)).size,
    `rounds summary lists ${cap.rounds.length}, nodes carry ${new Set(cap.nodes.map(n => n.round)).size}`)
  process.exit(summarize())
}

const { chromium } = await import('playwright')
const URL_BASE = process.env.URL || 'http://localhost:8080/?tab=draw'
const { check, summarize } = createChecks()

// Expectations READ FROM THE CAPTURE, never typed. If the capture is replaced,
// these move with it and the check keeps meaning the same thing.
const cap = JSON.parse(readFileSync(CAPTURE, 'utf8'))
const expectedMatches = cap.nodes.length
const expectedRounds = new Set(cap.nodes.map(n => n.round)).size
const expectedFinal = cap.nodes.find(n => n.round === 'Final' && n.winnerId != null)
const expectedChampion = expectedFinal
  ? [expectedFinal.p1, expectedFinal.p2].find(p => p && p.id === expectedFinal.winnerId)?.name
  : null

const sessionChromium = '/opt/pw-browsers/chromium'
const browser = await chromium.launch(
  existsSync(sessionChromium) ? { executablePath: sessionChromium } : {})
const page = await browser.newPage()
const pageErrors = []
page.on('pageerror', e => pageErrors.push(String(e)))

await page.goto(URL_BASE, { waitUntil: 'networkidle' })

// The tab is URL-addressable, so ?tab=draw should have selected it on boot. If
// it did not, click it — and say so, because a URL that does not restore the
// surface is itself a defect this repo has fixed once.
const bootSelected = await page.$eval('#tab-draw', t => t.getAttribute('aria-selected'))
check('?tab=draw selects the Draw tab on boot', bootSelected === 'true',
  `aria-selected="${bootSelected}" — the URL did not restore the surface`)
if (bootSelected !== 'true') await page.click('#tab-draw')

await page.waitForSelector('#panel-draw .dv-tree', { timeout: 15000 })

const text = sel => page.$eval(sel, e => e.textContent.trim()).catch(() => null)
const attr = (sel, a) => page.$eval(sel, (e, k) => e.getAttribute(k), a).catch(() => null)
const count = sel => page.$$eval(sel, es => es.length)

// --- the bracket reached the DOM ---------------------------------------------

check('every match in the capture is drawn',
  (await count('#panel-draw .dv-match')) === expectedMatches,
  `${await count('#panel-draw .dv-match')} match blocks, capture has ${expectedMatches}`)

check('every round in the capture is a column',
  (await count('#panel-draw .dv-round')) === expectedRounds,
  `${await count('#panel-draw .dv-round')} columns, capture has ${expectedRounds} rounds`)

check('the header reports the match count it drew',
  (await attr('#panel-draw .dv-head__facts', 'data-matches')) === String(expectedMatches),
  `data-matches="${await attr('#panel-draw .dv-head__facts', 'data-matches')}"`)

// 126 edges for 127 matches: every match but the final feeds exactly one. Read
// from the capture rather than asserted as a constant.
const expectedEdges = cap.edges.length
check('the header reports the edge count, and it is the capture\'s',
  (await attr('#panel-draw .dv-head__facts', 'data-edges')) === String(expectedEdges),
  `data-edges="${await attr('#panel-draw .dv-head__facts', 'data-edges')}", capture has ${expectedEdges}`)

check('the champion is named',
  (await attr('#panel-draw .dv-head__champion', 'data-champion')) === expectedChampion,
  `data-champion="${await attr('#panel-draw .dv-head__champion', 'data-champion')}", expected "${expectedChampion}"`)

// --- the verdicts, which are the point ---------------------------------------

const verdicts = await page.$$eval('#panel-draw .dv-round',
  cs => cs.map(c => [c.getAttribute('data-round'), c.getAttribute('data-verdict')]))

check('every round column carries a verdict',
  verdicts.length > 0 && verdicts.every(([, v]) => v && v.length > 0),
  `verdicts: ${JSON.stringify(verdicts)}`)

// THE ONE THAT MATTERS. The entry round has no canonical size to be compared to
// — a Masters 1000 is a 96 draw and its first round is 32 where a 128 ladder
// says 64 — so the page must say "not compared" there and must NOT say
// "canonical". A page that called it canonical would be claiming a comparison
// it never made.
const entry = verdicts[0]
check('the entry round is reported as NOT COMPARED, never as canonical',
  entry && entry[1] === 'not compared',
  `entry round ${JSON.stringify(entry)} — the outermost round holds whoever did not get a bye`)

// ...and the rest of a FINISHED draw is compared, or the exemption has eaten
// the law. This is the direction that fails if `roundVerdicts` ever returns
// EntryRoundNotCompared for everything.
const compared = verdicts.slice(1).filter(([, v]) => v === 'canonical' || v === 'short')
check('every round after the entry round of a finished draw IS compared',
  compared.length === verdicts.length - 1,
  `${compared.length} of ${verdicts.length - 1} compared: ${JSON.stringify(verdicts)}`)

const lawText = await text('#panel-draw .dv-head__law')
check('the law line names the exempt rounds rather than only the compared ones',
  typeof lawText === 'string' && /exempt/.test(lawText),
  `law line: ${JSON.stringify(lawText)}`)

// --- the scoreline came through the module that can refuse one ---------------

const withScore = await count('#panel-draw .dv-side__score')
check('scorelines are printed', withScore > 0,
  'no .dv-side__score in the panel — the Tennis join produced nothing')

const factsText = await text('#panel-draw .dv-head__facts')
check('the refusal count is printed whether or not it is zero',
  typeof factsText === 'string' && /scoreline/.test(factsText),
  `facts line: ${JSON.stringify(factsText)} — a count that appears only when non-zero is a count whose absence means two things`)

// --- the page did not scroll sideways ----------------------------------------
//
// The bracket is seven columns wide. It must scroll inside .dv-tree; the tab
// strip above already had to be fixed for exactly this.
const overflow = await page.evaluate(() => ({
  doc: document.documentElement.scrollWidth,
  win: window.innerWidth,
  tree: (() => { const t = document.querySelector('#panel-draw .dv-tree'); return t ? t.scrollWidth : 0 })(),
}))
check('the bracket scrolls inside its own container, not the page',
  overflow.doc <= overflow.win + 1,
  `document ${overflow.doc}px wide in a ${overflow.win}px window (tree is ${overflow.tree}px)`)

check('no page errors', pageErrors.length === 0, pageErrors.join('\n'))

await browser.close()
finish(summarize())
