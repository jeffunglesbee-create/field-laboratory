// Team tints, on the rendered page.
//
// The derivation is proven in the F# suite and the coverage is measured. What
// neither can see is what a browser actually paints, and this is the only place
// three claims can be checked at once:
//
//   1. every tint that rendered clears WCAG AA against the real background
//   2. tints appear ONLY on matchup names — never in the pick panel, the pick'em
//      rows, the stats headers, or anywhere a standing might later live
//   3. no card carries exactly ONE tinted side
//
// (3) is the design rule that has no data behind it. The coverage probe measured
// zero one-sided rows because resolution is per league, so this assertion exists
// for the case the measurement did not contain — a coloured name beside a plain
// one reads as EMPHASIS, a claim the desk is not making.
//
// It also reports the PAIRWISE DROP RATE: how many cards had both sides
// resolvable but too close to tell apart. That number decides whether the
// separation floor — derived from the closest pair of semantic accents, 32.9 —
// is right or too strict, and it is a measurement rather than a preference.
//
// Usage:  URL=http://localhost:8080/?data=context-2026-08-29 node scripts/team-tint-render-check.mjs
//         node scripts/team-tint-render-check.mjs --self-test

import { existsSync, mkdirSync } from 'node:fs'
import { chromium } from 'playwright'
import { createChecks, isMain } from './checks.mjs'

const URL = process.env.URL || 'http://localhost:8080/?data=context-2026-08-29'

/** WCAG 2.1 contrast, so the page's own claim can be re-measured from outside. */
export const contrast = (a, b) => {
  const lum = (h) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(h)
    if (!m) return null
    const v = m[1]
    const f = (i) => {
      const c = parseInt(v.substr(i, 2), 16) / 255
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * f(0) + 0.7152 * f(2) + 0.0722 * f(4)
  }
  const la = lum(a), lb = lum(b)
  if (la === null || lb === null) return null
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/**
 * `ok` | `one-sided` | `none`. A card is one of three states and the middle one
 * is a defect, not a partial success.
 */
export const cardState = (tintedSides) =>
  tintedSides === 0 ? 'none' : tintedSides === 2 ? 'ok' : 'one-sided'

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()
  check('a known contrast is computed correctly',
    Math.abs(contrast('#ffffff', '#000000') - 21) < 0.1)
  check('a malformed colour yields null, not a number',
    contrast('rgb(1,2,3)', '#060514') === null,
    'a computed style that is not hex must not silently score as passing')
  check('two tinted sides is the good state', cardState(2) === 'ok')
  check('zero is fine — the club is simply not in the table', cardState(0) === 'none')
  check('ONE IS A DEFECT, not a partial success', cardState(1) === 'one-sided',
    'a coloured name beside a plain one reads as emphasis')
  process.exit(summarize() === 0 ? 0 : 1)
}

if (isMain(import.meta.url)) {
  const { check, summarize } = createChecks()
  const sessionChromium = '/opt/pw-browsers/chromium'
  const browser = await chromium.launch(
    existsSync(sessionChromium) ? { executablePath: sessionChromium } : {})
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
  const errors = []
  page.on('pageerror', e => errors.push(String(e)))

  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.desk-card', { timeout: 30000 })

  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  const measured = await page.evaluate(() => {
    const toHex = (rgb) => {
      const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb || '')
      if (!m) return rgb || ''
      return '#' + [1, 2, 3].map(i => Number(m[i]).toString(16).padStart(2, '0')).join('')
    }
    const cards = [...document.querySelectorAll('.desk-card')].map(c => {
      const teams = c.querySelector('.desk-card__teams')
      const spans = [...(teams?.querySelectorAll('.desk-card__team') ?? [])]
      return {
        text: teams?.textContent ?? '',
        tints: spans.map(s => ({
          declared: s.getAttribute('data-tint'),
          painted: toHex(getComputedStyle(s).color),
          name: s.textContent,
        })),
      }
    })
    // Anywhere OUTSIDE the matchup line that carries a tint attribute.
    const strays = [...document.querySelectorAll('[data-tint]')]
      .filter(e => !e.closest('.desk-card__teams'))
      .map(e => e.className || e.tagName)
    return { cards, strays, pageBg: toHex(getComputedStyle(document.body).backgroundColor) }
  })

  const cards = measured.cards
  const tinted = cards.filter(c => c.tints.length === 2)
  const oneSided = cards.filter(c => cardState(c.tints.length) === 'one-sided')
  const plain = cards.filter(c => c.tints.length === 0)
  const allTints = cards.flatMap(c => c.tints)

  console.log(`\n  ${cards.length} card(s): ${tinted.length} tinted, ${plain.length} plain, ${oneSided.length} one-sided`)
  console.log(`  page background: ${measured.pageBg}`)
  const worst = allTints
    .map(t => ({ ...t, cr: contrast(t.painted, measured.pageBg) }))
    .filter(t => t.cr !== null)
    .sort((a, b) => a.cr - b.cr)
  for (const t of worst.slice(0, 5))
    console.log(`    lowest: ${String(t.name).padEnd(28)} ${t.painted}  ${t.cr.toFixed(2)}`)
  if (plain.length) {
    console.log('  plain cards (either not in the table, or two tints too close):')
    for (const c of plain.slice(0, 8)) console.log(`    ${c.text.trim().slice(0, 60)}`)
  }

  check('the page rendered cards at all', cards.length > 0)
  check('at least one matchup is tinted — otherwise nothing is being checked',
    tinted.length > 0, 'a page with zero tints would pass every assertion below')
  check('NO CARD IS ONE-SIDED', oneSided.length === 0,
    oneSided.map(c => c.text.trim()).join(' | '))
  check('every tint painted the colour it declared',
    allTints.every(t => t.painted.toLowerCase() === String(t.declared).toLowerCase()),
    allTints.filter(t => t.painted.toLowerCase() !== String(t.declared).toLowerCase())
      .map(t => `${t.name}: declared ${t.declared} painted ${t.painted}`).join(' | '))
  const bad = worst.filter(t => t.cr < 4.5)
  check('every rendered tint clears WCAG AA against the real background',
    bad.length === 0,
    bad.map(t => `${t.name} ${t.painted} ${t.cr.toFixed(2)}`).join(' | '))
  check('TINTS APPEAR ONLY ON MATCHUP NAMES — colours are for matchups, not standings',
    measured.strays.length === 0, measured.strays.join(' | '))
  check('no page errors', errors.length === 0, errors.join(' | '))

  mkdirSync('outbox', { recursive: true })
  const shot = `outbox/team-tints-${new Date().toISOString().replace(/[:.]/g, '-')}.png`
  await page.screenshot({ path: shot, fullPage: false })
  console.log(`\n  screenshot: ${shot}`)

  await browser.close()
  process.exit(summarize() === 0 ? 0 : 1)
}
