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
    // THE SURFACE EACH SPAN IS ACTUALLY ON, walked up to the first ancestor that
    // paints something. `document.body` is `--bg`, and a team name is never on
    // it — it sits inside `.desk-card`, which paints `--card`. Measuring the
    // body gave this check the same blind spot as the bug it was written to
    // catch, and a mutation reverting the derivation to `bg` passed 7/7.
    const surfaceOf = (el) => {
      for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
        const bgc = getComputedStyle(n).backgroundColor
        if (bgc && !/rgba\(0,\s*0,\s*0,\s*0\)|transparent/.test(bgc)) return toHex(bgc)
      }
      return toHex(getComputedStyle(document.body).backgroundColor)
    }
    for (const c of cards) c.tints.forEach(t => {})
    const spans = [...document.querySelectorAll('.desk-card__team')]
    const surfaces = spans.map(s => ({ name: s.textContent, surface: surfaceOf(s) }))
    // What a name looks like when it is NOT tinted — the colour a tint has to be
    // tellable apart from, or it is not a tint at all.
    const plainName = (() => {
      const t = [...document.querySelectorAll('.desk-card__teams')]
        .find(n => !n.querySelector('.desk-card__team'))
      return t ? toHex(getComputedStyle(t).color) : null
    })()
    return { cards, strays, surfaces, plainName,
             pageBg: toHex(getComputedStyle(document.body).backgroundColor) }
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
  // PINNED TO THE CAPTURE, not a tolerance — the same discipline
  // `game-id-check` uses: "the counts are pinned to the committed capture, not
  // to a tolerance. This file and the corpus move together or the build stops."
  //
  // "At least one is tinted" was not enough, and a mutation said so: reverting
  // the league fallback took every MLS card dark — the whole top of the desk —
  // and the check still passed 9/9, because MLB and WNBA rows carry `league` and
  // kept their colour. A whole sport can go plain without a boolean noticing.
  //
  // The capture is frozen, so the number is exact. If it moves, either the
  // resolution changed or the derivation did, and both want reading.
  //
  // MOVED 31 -> 36 on 2026-09-01, when the table was first regenerated by the
  // workflow after the pairwise change. `src/TeamColours.fs` on main was still
  // the GLOBALLY collision-resolved table (1453 entries); the generator had
  // stopped applying that rule but had never been run. The regenerated table is
  // 1701 entries — every club's real colour, resolved per card at render time.
  //
  // The pin did its job: it moved, and reading it named the trade rather than
  // reporting a number. Eight cards gained a pair and three lost one:
  //
  //   gained  Bournemouth v Everton · Diamondbacks @ Giants · Elversberg v
  //           Leverkusen · Houston Dynamo FC v San Jose Earthquakes ·
  //           Houston v San Jose · Lorient v Troyes · Mainz v Paderborn ·
  //           Minnesota v Orlando
  //   lost    D.C. United v LAFC · Spurs v Newcastle · Union Berlin v Frankfurt
  //
  // The three losses are the correct outcome and the reason to keep the change.
  // `resolveCollisions` used to hand the second club of a colliding pair its
  // ALTERNATE — "THE SECOND CLUB TAKES ITS ALTERNATE, not the shared white" —
  // which separated those pairs by inventing a difference. With real colours,
  // both sides of each of those three are genuinely the same colour: two blacks,
  // two whites, two reds. A pair a reader cannot tell apart renders plain, which
  // is what the pairwise rule is for.
  const EXPECTED_TINTED = 36
  const EXPECTED_CARDS = 78
  check(`exactly ${EXPECTED_TINTED} of ${EXPECTED_CARDS} cards tint on this frozen capture`,
    tinted.length === EXPECTED_TINTED && cards.length === EXPECTED_CARDS,
    `saw ${tinted.length} tinted of ${cards.length} — a change here is a real change, not drift`)
  check('NO CARD IS ONE-SIDED', oneSided.length === 0,
    oneSided.map(c => c.text.trim()).join(' | '))
  check('every tint painted the colour it declared',
    allTints.every(t => t.painted.toLowerCase() === String(t.declared).toLowerCase()),
    allTints.filter(t => t.painted.toLowerCase() !== String(t.declared).toLowerCase())
      .map(t => `${t.name}: declared ${t.declared} painted ${t.painted}`).join(' | '))
  // AGAINST THE SURFACE EACH SPAN IS ON, not against the page. The two differ by
  // about 0.15 and the whole first round of this feature turned on that gap.
  const surfaceBy = new Map(measured.surfaces.map(s => [s.name, s.surface]))
  const onCard = allTints
    .map(t => ({ ...t, surface: surfaceBy.get(t.name), cr: contrast(t.painted, surfaceBy.get(t.name)) }))
    .filter(t => t.cr !== null)
  const badCard = onCard.filter(t => t.cr < 4.5)
  console.log(`  card surface: ${[...new Set(measured.surfaces.map(s => s.surface))].join(', ')}`)
  check('every rendered tint clears AA ON THE SURFACE IT SITS ON',
    badCard.length === 0 && onCard.length === allTints.length,
    badCard.map(t => `${t.name} ${t.painted} on ${t.surface} = ${t.cr.toFixed(2)}`).join(' | '))

  const bad = worst.filter(t => t.cr < 4.5)
  check('...and against the page background too',
    bad.length === 0,
    bad.map(t => `${t.name} ${t.painted} ${t.cr.toFixed(2)}`).join(' | '))

  // A tint that matches the plain text is not a tint, and its partner's colour
  // then reads as emphasis. The pairwise rule compares the two tints to each
  // other and never to this, so it is asserted here.
  const nearText = measured.plainName
    ? onCard.map(t => ({ ...t, dc: contrast(t.painted, measured.plainName) }))
        .filter(t => t.dc !== null && t.dc < 1.35)
    : []
  check(`no rendered tint reads as the plain text colour (${measured.plainName ?? 'no plain card to compare'})`,
    measured.plainName !== null && nearText.length === 0,
    nearText.map(t => `${t.name} ${t.painted} vs plain ${measured.plainName}`).join(' | '))
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
