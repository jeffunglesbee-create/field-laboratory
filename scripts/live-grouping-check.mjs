// Asserts the DEPLOYED page groups its real slate by sport.
//
// Deliberately separate from nav-check.mjs, which routes the relay to control
// the data. This one takes whatever today's live slate happens to be, so it
// cannot assert a specific shape — only invariants that must hold for any real
// day. That is the whole value: it is the only check in this repo that looks at
// production with production's own data.

import { existsSync } from 'node:fs'
import { chromium } from 'playwright'
import { createChecks } from './checks.mjs'

const URL = process.env.URL || 'https://field-laboratory.jeffunglesbee.workers.dev/'

const errors = []
const sessionChromium = '/opt/pw-browsers/chromium'
const browser = await chromium.launch(
  existsSync(sessionChromium) ? { executablePath: sessionChromium } : {}
)
const page = await browser.newPage()
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))
page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`) })

await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForFunction(
  () => {
    const el = document.getElementById('decode-status')
    return el && el.textContent && el.textContent !== 'decoding…'
  },
  { timeout: 20_000 }
)

const snap = await page.evaluate(() => ({
  status: document.getElementById('decode-status')?.textContent || '',
  viewed: document.getElementById('viewed-date')?.textContent || '',
  cards: document.querySelectorAll('.desk-card').length,
  nav: ['prev-day', 'next-day', 'today'].filter(id => !!document.getElementById(id)),
  groups: [...document.querySelectorAll('.sport-group')].map(s => ({
    sport: s.getAttribute('data-sport'),
    cards: s.querySelectorAll('.desk-card').length,
  })),
  // Every card's drama slot, so the ADR-002 gate can be asserted against real
  // live data rather than only against a simulated transition.
  drama: [...document.querySelectorAll('.desk-card')].map(n => ({
    status: n.querySelector('[data-testid="status"]')?.textContent || '',
    drama: n.querySelector('[data-testid="drama"]')?.textContent || '',
  })),
}))

await browser.close()

const { check, summarize } = createChecks()
const decoded = Number(snap.status.match(/^decoded (\d+) game/)?.[1] ?? NaN)
const grouped = snap.groups.reduce((n, g) => n + g.cards, 0)

check('the deployed page decoded a real slate', /^decoded \d+ game/.test(snap.status), snap.status)
check('the date toolbar is present', snap.nav.length === 3, snap.nav.join(', '))
check('the viewed date is populated', /^\d{4}-\d{2}-\d{2}$/.test(snap.viewed), snap.viewed)
check('card count matches decoded count',
  Number.isFinite(decoded) && snap.cards === decoded, `decoded ${decoded}, rendered ${snap.cards}`)
// Every card sits inside a sport section. Holds on an empty slate too (0 === 0),
// so an off-season day is not a false failure.
check('every card is inside a sport section', grouped === snap.cards,
  `${grouped} grouped vs ${snap.cards} total`)
check('sport sections are all labelled',
  snap.groups.every(g => g.sport && g.sport.length > 0),
  snap.groups.map(g => `${g.sport}:${g.cards}`).join(' ') || 'no sections')
// Sections must be a partition: no sport appears twice.
check('no sport is sectioned twice',
  new Set(snap.groups.map(g => g.sport)).size === snap.groups.length,
  snap.groups.map(g => g.sport).join(', ') || 'none')

// ADR-002, against production's own live data. The simulated transition in
// render-check drives a card artificially; this asserts the invariant on
// whatever games are genuinely in flight right now.
const leaking = snap.drama.filter(c => c.status === 'In progress' && /peak/.test(c.drama))
check('no live game displays a drama peak', leaking.length === 0,
  leaking.map(c => c.drama).join(' | '))

check('no page or console errors', errors.length === 0, errors.join('; ') || 'none')

console.log(`\nURL: ${URL}`)
console.log(`${snap.status}   [${snap.viewed}]`)
console.log(`sections: ${snap.groups.map(g => `${g.sport}(${g.cards})`).join(' ') || '—'}\n`)
process.exit(summarize() === 0 ? 0 : 1)
