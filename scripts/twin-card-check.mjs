// One match under two ids is one card, on the rendered page.
// docs/CC-CMD-2026-11-11-soccer-live-scores.md, Open question 3 (owner ruling 2026-11-22: "Option b").
//
// The F# suite proves the rule on rows (`Desk.withoutShadowedRows`, the group "Twin rows"). What it cannot see is whether the PAGE applies it: that
// `src/Program.fs` draws the rows the rule returns and not the rows it was given, that the cards, the sport section's count and the status line
// agree, and that the stubs are really gone from the DOM and the rows with an ESPN id really are there.
//
// It reads the capture of 2026-11-21 (data/context-2026-11-21.json, captured unedited by the capture-render-fixture workflow, run 44968295236): three MLS
// matches, each as a row with an ESPN event id and as a stub in the provider's own id scheme with no start time, and two NHL matches, each as a row with an ESPN id and a start
// time and as a lowercase row that carries an NHL API id and no start time (CC-CMD Open question 4). The names are SPELLED OUT here on purpose:
// a check that derived them from the same rule would agree with the rule whatever it did.
//
// Usage:  node scripts/serve.mjs   (in another shell)
//         URL='http://localhost:8080/?data=context-2026-11-21' node scripts/twin-card-check.mjs
//         node scripts/twin-card-check.mjs --self-test

import { existsSync } from 'node:fs'
import { chromium } from 'playwright'
import { createChecks, isMain, finish } from './checks.mjs'

const URL = process.env.URL || 'http://localhost:8080/?data=context-2026-11-21'

/** The three matches as the stub spells them (the provider's names, no start time) and as the row with an ESPN id spells them. */
export const STUBS = [
  { id: 'MLS_MLS-COM-000002_R16-07_roundonebestof3series_2026-11-21', teams: 'New England Revolution v Philadelphia Union' },
  { id: 'MLS_MLS-COM-000002_R16-08_roundonebestof3series_2026-11-21', teams: 'Inter Miami CF v Columbus Crew' },
  { id: 'MLS_MLS-COM-000002_R16-04_roundonebestof3series_2026-11-21', teams: 'FC Dallas v Portland Timbers' },
]
export const TWINS = [
  { id: 'MLS_2026-11-21_e401933733', teams: 'New England v Philadelphia' },
  { id: 'MLS_2026-11-21_e401933739', teams: 'Miami v Columbus' },
  { id: 'MLS_2026-11-21_e401933732', teams: 'Dallas v Portland' },
]
/** The two NHL matches of the same capture, each as a lowercase row (an NHL API id in `espn_event_id`, no start time) and as the row with an ESPN id and a start time. CC-CMD Open question 4. */
export const NHL_STUBS = [
  { id: 'nhl_2026-11-21_e2026020359', teams: 'Carolina Hurricanes v Edmonton Oilers' },
  { id: 'nhl_2026-11-21_e2026020360', teams: 'Calgary Flames v Chicago Blackhawks' },
]
export const NHL_TWINS = [
  { id: 'NHL_2026-11-21_e401892754', teams: 'Hurricanes v Oilers' },
  { id: 'NHL_2026-11-21_e401892755', teams: 'Flames v Blackhawks' },
]
/** The sentence the page appends to its decode status, spelled out in full: a typo in the page must not be forgiven by a check that derives the same string. */
export const NOTE = ' · 5 row(s) not drawn — the same match is drawn from its ESPN id'

/** What the page shows, as plain data: the status line, the MLS section's heading count and cards. */
export const verdicts = snap => {
  const mls = snap.groups.find(g => g.sport === 'MLS')
  const ids = new Set(snap.cards.map(c => c.id))
  const teams = new Set(snap.cards.map(c => c.teams))
  return [
    ['the status line says five rows are not drawn, in its own words', snap.status.includes(NOTE), snap.status],
    ['the status line still leads with the decoded count every check parses', /^decoded \d+ game/.test(snap.status), snap.status],
    ['the cards drawn are the games decoded', Number(snap.status.match(/^decoded (\d+) game/)?.[1]) === snap.cards.length, `${snap.status.slice(0, 60)} / ${snap.cards.length} cards`],
    ['the MLS section holds three cards', mls?.cards === 3, JSON.stringify(mls)],
    ['the MLS section heading counts three', mls?.heading === 'MLS · 3', mls?.heading],
    ...STUBS.map(s => [`the stub ${s.teams} is not on the page`, !ids.has(s.id) && !teams.has(s.teams), `${[...ids].filter(i => i.includes('MLS-COM')).length} stub card(s) in the DOM`]),
    ...TWINS.map(t => [`the row with an ESPN id, ${t.teams}, is on the page`, ids.has(t.id) && teams.has(t.teams), `ids ${[...ids].filter(i => i.startsWith('MLS')).join(', ')}`]),
    ...NHL_STUBS.map(s => [`the lowercase NHL row ${s.teams} is not on the page`, !ids.has(s.id), `${[...ids].filter(i => i.startsWith('nhl_')).length} lowercase NHL card(s) in the DOM`]),
    ...NHL_TWINS.map(t => [`the NHL row with an ESPN id and a start time, ${t.teams}, is on the page`, ids.has(t.id), `ids ${[...ids].filter(i => i.startsWith('NHL_')).length} NHL`]),
    ['no MLS card reads "no start time"', snap.cards.filter(c => c.sport === 'MLS').every(c => !/no start time/.test(c.status)), snap.cards.filter(c => c.sport === 'MLS').map(c => c.status).join(' | ')],
  ]
}

/** Wrong on purpose: the page as it was before the rule, all six MLS cards drawn. */
export const WITHOUT_THE_RULE = {
  status: 'decoded 113 game(s) for 2026-11-21',
  groups: [{ sport: 'MLS', cards: 6, heading: 'MLS · 6' }],
  cards: [...STUBS.map(s => ({ ...s, sport: 'MLS', status: 'Scheduled — no start time' })), ...TWINS.map(t => ({ ...t, sport: 'MLS', status: 'Final' })), ...NHL_STUBS.map(s => ({ ...s, sport: 'NHL', status: 'Final' })), ...NHL_TWINS.map(t => ({ ...t, sport: 'NHL', status: 'Final' }))],
}
/** The page as it should be. */
export const WITH_THE_RULE = {
  status: `decoded 5 game(s) for 2026-11-21${NOTE}`,
  groups: [{ sport: 'MLS', cards: 3, heading: 'MLS · 3' }],
  cards: [...TWINS.map(t => ({ ...t, sport: 'MLS', status: 'Final' })), ...NHL_TWINS.map(t => ({ ...t, sport: 'NHL', status: 'Final' }))],
}

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()
  const failing = snap => verdicts(snap).filter(([, ok]) => !ok).map(([name]) => name)
  check('a page that draws all six MLS cards fails the stub checks', failing(WITHOUT_THE_RULE).filter(n => n.startsWith('the stub ')).length === 3, failing(WITHOUT_THE_RULE).join(' | '))
  check('a page that draws all six MLS cards fails the section count', failing(WITHOUT_THE_RULE).includes('the MLS section holds three cards'))
  check('a page that draws the lowercase NHL rows fails', failing(WITHOUT_THE_RULE).filter(n => n.startsWith('the lowercase NHL row')).length === 2, failing(WITHOUT_THE_RULE).join(' | '))
  check('a page that draws all six MLS cards fails the status note', failing(WITHOUT_THE_RULE).includes('the status line says five rows are not drawn, in its own words'))
  check('a page as it should be passes every one', failing(WITH_THE_RULE).length === 0, failing(WITH_THE_RULE).join(' | '))
  check('a page that hides a row with an ESPN id fails', failing({ ...WITH_THE_RULE, cards: WITH_THE_RULE.cards.slice(1) }).some(n => n.startsWith('the row with an ESPN id')))
  check('a page whose count disagrees with its cards fails', failing({ ...WITH_THE_RULE, status: `decoded 4 game(s) for 2026-11-21${NOTE}` }).includes('the cards drawn are the games decoded'))
  finish(summarize())
} else if (isMain(import.meta.url)) {
  const { check, summarize } = createChecks()
  // The cloud session image ships Chromium at /opt/pw-browsers/chromium, whose build number does not match the pinned playwright package; a CI runner resolves its own
  // (the same rule as scripts/render-check.mjs).
  const sessionChromium = '/opt/pw-browsers/chromium'
  const browser = await chromium.launch(existsSync(sessionChromium) ? { executablePath: sessionChromium } : {})
  try {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.goto(URL, { waitUntil: 'networkidle' })
    await page.waitForSelector('.desk-card', { timeout: 20_000 })
    const snap = await page.evaluate(() => ({
      status: document.getElementById('decode-status')?.textContent || '',
      groups: [...document.querySelectorAll('.sport-group')].map(s => ({
        sport: s.getAttribute('data-sport'),
        cards: s.querySelectorAll('.desk-card').length,
        heading: s.querySelector('.sport-group__title')?.textContent ?? '',
      })),
      cards: [...document.querySelectorAll('.desk-card')].map(c => ({
        id: c.getAttribute('data-game-id'),
        teams: c.querySelector('[data-testid="teams"]')?.textContent ?? '',
        sport: c.closest('section.sport-group')?.getAttribute('data-sport') ?? '',
        status: c.querySelector('[data-testid="status"]')?.textContent ?? '',
      })),
    }))
    for (const [name, ok, detail] of verdicts(snap)) check(name, ok, detail)
    check('the page raised no error', errors.length === 0, errors.join(' | '))
    console.log(`read ${snap.cards.length} cards in ${snap.groups.length} sections; status: ${snap.status}`)
  } finally {
    await browser.close()
  }
  finish(summarize())
}
