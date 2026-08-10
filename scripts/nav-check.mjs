// Drives the two things the pinned render checks structurally cannot: sport
// grouping across more than one sport, and real date navigation.
//
// Why a separate probe rather than more assertions in render-check.mjs:
//
//   1. Both committed captures are single-sport (AFL, MLB). Grouping "works" on
//      them in the sense that one group renders — which is exactly the shape a
//      broken grouping would also produce.
//   2. Both render checks load `?data=<capture>`, which PINS the page to one
//      committed day and deliberately disables the date controls. They can
//      never exercise navigation, by design.
//
// So this probe intercepts the relay at the network layer and serves slates it
// controls. That buys three things: it runs offline (this sandbox cannot reach
// *.workers.dev, and route interception never touches the network), no synthetic
// payload is ever committed into data/ or shipped in public/, and the game
// records themselves stay real — they are read out of the two committed
// captures and recombined, not invented.
//
// The invariant under test is the one that survives environment differences:
// after any navigation, the number of cards on screen must equal the number of
// games the decoder just reported. A slate that fails to tear down shows as
// cards > decoded, which is the ambient-panel skeleton failure this repo has
// now hit twice.
//
// This probe was mutation-tested rather than assumed. Deleting the two teardown
// lines from Program.fs and re-running took it from 18/18 to 11/18: cards
// accumulated 4 -> 6 -> 12 -> 16 -> 18 while the status line still read
// "decoded 2". Worth naming what stayed green through all of that — "no page or
// console errors" passed on every run. Nothing throws when a slate fails to
// tear down, which is why this needed a counting assertion and not error
// monitoring.
//
// One caveat, so the coverage is not overstated: the DOM assertions prove the
// `mount.innerHTML <- ""` reset. `disposePrevious()` governs effect LIFETIME,
// and a leaked effect updating a detached node is invisible from the DOM — it
// is not covered here, and is kept on the reasoning that a signal graph nobody
// disposes is a leak whether or not a test can see it.

import { readFileSync, existsSync } from 'node:fs'
import { chromium } from 'playwright'
import { createChecks } from './checks.mjs'

const ROOT = new URL('..', import.meta.url).pathname
const URL_BASE = process.env.URL || 'http://localhost:8080/'

const read = name => JSON.parse(readFileSync(`${ROOT}data/${name}.json`, 'utf8'))
const AFL = read('context-2026-05-15').games.regular
const MLB = read('games-2026-08-09').games.regular

// Today in UTC, computed the same way src/Desk.fs computes it. If these two
// ever disagree the page would request a date this script does not serve, and
// the unrouted-request check below fails loudly rather than silently falling
// back to the committed capture.
const pad = n => String(n).padStart(2, '0')
const iso = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
const shift = (base, days) => {
  const d = new Date(`${base}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return iso(d)
}

const TODAY = iso(new Date())
const TOMORROW = shift(TODAY, 1)
const YESTERDAY = shift(TODAY, -1)

// Deliberately different sizes per day. A slate that renders without tearing
// the previous one down produces a card count that is the SUM of the days
// visited, so unequal counts make the failure unmistakable rather than a
// coincidence of two same-sized days lining up.
const SLATES = {
  [TODAY]: [...AFL, ...MLB], // 4 games, 2 sports
  [TOMORROW]: MLB,           // 2 games, 1 sport
  [YESTERDAY]: AFL,          // 2 games, 1 sport
}

const errors = []
const unrouted = []

const sessionChromium = '/opt/pw-browsers/chromium'
const browser = await chromium.launch(
  existsSync(sessionChromium) ? { executablePath: sessionChromium } : {}
)
const page = await browser.newPage()

page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))
page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`) })

await page.route('**/context/date/**', route => {
  const date = new global.URL(route.request().url()).pathname.split('/').pop()
  const games = SLATES[date]
  if (!games) {
    // Not served: record it and let the page take its fallback path. Silently
    // 404ing here would make the page render the committed capture and every
    // assertion below would then be measuring the wrong slate.
    unrouted.push(date)
    return route.fulfill({ status: 404, body: 'not served by nav-check' })
  }
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    // The real relay sends this, which is the only reason the deployed page can
    // fetch it cross-origin at all. Fulfilled responses are still CORS-checked,
    // so omitting it would fail the fetch and mask what is being tested.
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({ ok: true, date, games: { regular: games, postseason: [] } }),
  })
})

/** Waits for the decode line to settle on a specific date, then reads the DOM. */
const settleOn = async date => {
  await page.waitForFunction(
    d => {
      const el = document.getElementById('decode-status')
      return el && /^decoded \d+ game/.test(el.textContent || '') && el.textContent.includes(d)
    },
    date,
    { timeout: 15_000 }
  )
  return page.evaluate(() => ({
    status: document.getElementById('decode-status')?.textContent,
    viewed: document.getElementById('viewed-date')?.textContent,
    url: location.search,
    cards: document.querySelectorAll('.desk-card').length,
    ids: [...document.querySelectorAll('.desk-card')].map(n => n.getAttribute('data-game-id')),
    groups: [...document.querySelectorAll('.sport-group')].map(s => ({
      sport: s.getAttribute('data-sport'),
      title: s.querySelector('.sport-group__title')?.textContent,
      cards: s.querySelectorAll('.desk-card').length,
    })),
  }))
}

const decodedCount = s => Number((s || '').match(/^decoded (\d+) game/)?.[1] ?? NaN)

// --- initial load: multi-sport day ------------------------------------------
await page.goto(URL_BASE, { waitUntil: 'networkidle' })
const first = await settleOn(TODAY)

// --- forward, back, and home ------------------------------------------------
await page.click('#next-day')
const next = await settleOn(TOMORROW)

await page.click('#prev-day')
await settleOn(TODAY)
await page.click('#prev-day')
const prev = await settleOn(YESTERDAY)

await page.click('#today')
const home = await settleOn(TODAY)

// The back button changes the URL without a load. Nothing re-renders unless
// popstate is handled explicitly, so this asserts the handler is real.
await page.goBack()
const back = await settleOn(YESTERDAY)

await browser.close()

const { check, summarize } = createChecks()

check('relay served every date the page asked for', unrouted.length === 0,
  `unrouted: ${unrouted.join(', ')}`)

// --- grouping ---------------------------------------------------------------
check('a multi-sport slate renders one section per sport',
  first.groups.length === 2,
  `${first.groups.length} section(s): ${first.groups.map(g => g.sport).join(', ')}`)
check('every card lands inside a sport section',
  first.groups.reduce((n, g) => n + g.cards, 0) === first.cards,
  `${first.groups.reduce((n, g) => n + g.cards, 0)} grouped vs ${first.cards} total`)
check('section headings carry the sport and its count',
  first.groups.every(g => g.title === `${g.sport} · ${g.cards}`),
  first.groups.map(g => g.title).join(' | '))
// Two sports of equal size fall back to name order, which is the only tiebreak
// that does not depend on the order the relay happened to return them in.
check('sections are ordered deterministically (size desc, then name)',
  first.groups.map(g => g.sport).join(',') === 'AFL,MLB',
  first.groups.map(g => `${g.sport}:${g.cards}`).join(' '))
check('a single-sport slate renders exactly one section',
  next.groups.length === 1 && next.groups[0].sport === 'MLB',
  next.groups.map(g => g.sport).join(', '))

// --- navigation -------------------------------------------------------------
check('next-day advances the URL date', next.url.includes(TOMORROW), next.url)
check('prev-day steps back past today', prev.url.includes(YESTERDAY), prev.url)
check('today returns to the current UTC date', home.url.includes(TODAY), home.url)
check('the viewed-date readout tracks the slate',
  first.viewed === TODAY && next.viewed === TOMORROW && prev.viewed === YESTERDAY,
  `${first.viewed} / ${next.viewed} / ${prev.viewed}`)
check('the back button re-renders (popstate is handled)',
  back.url.includes(YESTERDAY) && back.groups.length === 1 && back.groups[0].sport === 'AFL',
  `${back.url} -> ${back.groups.map(g => g.sport).join(', ')}`)

// --- teardown: the regression this probe exists for --------------------------
// Every navigation must leave exactly the new slate behind. Before the
// disposePrevious()/innerHTML reset, this is where a stale render shows up:
// 4 cards from today plus 2 from tomorrow, under a status line saying 2.
for (const [label, snap] of [['initial', first], ['after next', next],
                             ['after prev', prev], ['after today', home],
                             ['after back', back]]) {
  check(`card count matches decoded count — ${label}`,
    snap.cards === decodedCount(snap.status),
    `decoded ${decodedCount(snap.status)}, rendered ${snap.cards}`)
}
check('no game is rendered twice after navigating',
  new Set(back.ids).size === back.ids.length,
  back.ids.join(', '))

check('no page or console errors', errors.length === 0, errors.join('; ') || 'none')

console.log(`\nURL: ${URL_BASE}`)
console.log(`dates: ${YESTERDAY} <- ${TODAY} -> ${TOMORROW}\n`)
for (const [label, snap] of [['initial', first], ['next', next], ['prev', prev],
                             ['today', home], ['back', back]]) {
  console.log(`  ${label.padEnd(8)} ${snap.url}`)
  console.log(`           ${snap.status}`)
  console.log(`           ${snap.groups.map(g => `${g.sport}(${g.cards})`).join(' ') || '—'}`)
}
console.log()
process.exit(summarize() === 0 ? 0 : 1)
