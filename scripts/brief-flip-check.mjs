// The brief flip, driven in a real browser.
//
// Stage 1 of surfacing the journalism work: a card whose game has a joined brief
// turns to reveal the prose production wrote. This asserts the behaviour against
// a fixture built from REAL captured briefs (data/context-briefs-fixture.json),
// because both committed render fixtures carry `briefs: []` and could never
// exercise it.
//
// What it pins, and why each matters:
//   - Only cards WITH a brief are flippable. A card with no joined prose must
//     offer no affordance — the honest empty state, not a dead button.
//   - The flip is a WAI-ARIA disclosure: role=button, aria-expanded toggling,
//     aria-controls naming the brief region. A screen reader hears state, not a
//     visual effect.
//   - Enter and Space both activate it, because the card is a button.
//   - The front face still exposes `.desk-card__score` / `.desk-card__teams`, so
//     the weather fill and score setters that query those keep resolving through
//     the added flip wrapper.
//   - The revealed text is the brief's real text, not a placeholder.
//
// Usage:  node scripts/brief-flip-check.mjs      (server must be up on :8080)

import { existsSync } from 'node:fs'
import { chromium } from 'playwright'
import { createChecks } from './checks.mjs'

const BASE = process.env.URL || 'http://localhost:8080/'
const URL = `${BASE}${BASE.includes('?') ? '&' : '?'}data=context-briefs-fixture`
const { check, summarize } = createChecks()

const sessionChromium = '/opt/pw-browsers/chromium'
const browser = await chromium.launch(
  existsSync(sessionChromium) ? { executablePath: sessionChromium } : {})
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))
page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`) })

await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForSelector('.desk-card', { timeout: 15_000 })

const shape = await page.$$eval('.desk-card', cards => cards.map(c => ({
  teams: c.querySelector('.desk-card__teams')?.textContent ?? '',
  flippable: c.classList.contains('desk-card--flippable'),
  role: c.getAttribute('role'),
  expanded: c.getAttribute('aria-expanded'),
  controls: c.getAttribute('aria-controls'),
  hasBriefFace: !!c.querySelector('.desk-card__brief'),
  briefText: c.querySelector('.desk-card__brief-text')?.textContent ?? '',
  // The stage-2 scoreline verdict badge, by its state class.
  verdict:
    c.querySelector('.desk-card__verdict--ok') ? 'ok'
    : c.querySelector('.desk-card__verdict--bad') ? 'bad'
    : c.querySelector('.desk-card__verdict--wait') ? 'wait'
    : c.querySelector('.desk-card__verdict') ? 'unclassed'
    : 'none',
  // Front-face selectors the rest of the app depends on, through the wrapper.
  reachesScore: !!c.querySelector('.desk-card__score'),
  reachesTeams: !!c.querySelector('.desk-card__teams'),
  panelIdMatches:
    !c.getAttribute('aria-controls') ||
    c.querySelector(`#${CSS.escape(c.getAttribute('aria-controls'))}`) != null,
})))

const flippable = shape.filter(c => c.flippable)
const plain = shape.filter(c => !c.flippable)

check('the fixture rendered its cards', shape.length === 6,
  `${shape.length} card(s), expected 6 (3 real briefs, 1 impossible probe, 1 empty, 1 none)`)

// Exactly the four with readable prose (three real, one impossible probe). The
// empty-text brief and the no-brief game are both non-flippable, for reasons the
// join collapses to one honest outcome: a card only turns when there is prose.
check('exactly the games with readable prose are flippable', flippable.length === 4,
  `${flippable.length} flippable, expected 4`)

check('a game with no brief, and a game whose brief is empty, are both plain',
  plain.length === 2 && plain.every(c => c.role !== 'button' && !c.hasBriefFace),
  JSON.stringify(plain.map(c => ({ teams: c.teams, role: c.role }))))

// Stage 2: the scoreline verdict badge. The three real briefs make mid-game
// scoreline claims consistent with their finals; the probe claims 40-0, which no
// final can reach.
const verdicts = flippable.map(c => c.verdict)
check('every flippable card carries a classed verdict badge',
  flippable.every(c => c.verdict === 'ok' || c.verdict === 'bad' || c.verdict === 'wait'),
  JSON.stringify(verdicts))
check('the three real briefs read as consistent, the probe as impossible',
  verdicts.filter(v => v === 'ok').length === 3 && verdicts.filter(v => v === 'bad').length === 1,
  JSON.stringify(flippable.map(c => ({ teams: c.teams, verdict: c.verdict }))))

// The CSS-in-the-source guard. Stage 1 put the flip CSS in the gitignored build
// COPY, so it never shipped and the flip was visually dead while every
// behavioural check still passed. A computed style is the only thing that would
// have caught it: if this reads anything but preserve-3d, the flip CSS is not in
// index.html at the repo root.
const transformStyle = await page.$eval('.desk-card--flippable .desk-card__flip',
  n => getComputedStyle(n).transformStyle)
check('the flip CSS is actually applied (transform-style: preserve-3d)',
  transformStyle === 'preserve-3d',
  `transform-style is ${transformStyle} — the flip CSS is missing from the source index.html`)

check('every flippable card is a disclosure button, collapsed at first',
  flippable.every(c => c.role === 'button' && c.expanded === 'false' && c.controls),
  JSON.stringify(flippable.map(c => ({ role: c.role, expanded: c.expanded }))))

check('aria-controls points at a brief region that exists',
  flippable.every(c => c.panelIdMatches && c.hasBriefFace),
  'a card names a brief panel that is not in the DOM')

check('the revealed text is the real brief, not a placeholder',
  flippable.every(c => c.briefText.trim().length > 40),
  JSON.stringify(flippable.map(c => c.briefText.slice(0, 30))))

check('the front face still exposes the score and teams nodes through the wrapper',
  flippable.every(c => c.reachesScore && c.reachesTeams),
  'the flip wrapper hid a selector the weather fill or score setter needs')

// The interaction: click toggles expanded + is-flipped, click again reverses.
const first = await page.$('.desk-card--flippable')
await first.click()
const afterClick = await first.evaluate(c => ({
  expanded: c.getAttribute('aria-expanded'),
  flipped: c.classList.contains('is-flipped'),
}))
check('a click opens the card (aria-expanded true, is-flipped set)',
  afterClick.expanded === 'true' && afterClick.flipped, JSON.stringify(afterClick))

await first.click()
const afterSecond = await first.evaluate(c => c.getAttribute('aria-expanded'))
check('a second click closes it', afterSecond === 'false', afterSecond)

// Keyboard: Enter activates, since the card is a button.
await first.focus()
await page.keyboard.press('Enter')
const afterEnter = await first.evaluate(c => c.getAttribute('aria-expanded'))
check('Enter toggles the flip from the keyboard', afterEnter === 'true', afterEnter)

check('no page or console errors', errors.length === 0, errors.join(' | '))

await browser.close()
process.exit(summarize() === 0 ? 0 : 1)
