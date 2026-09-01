// Three device affordances the page must carry, and one it must NOT fake.
//
// WHAT THIS EXISTS TO PREVENT, WHICH IS BOTH DIRECTIONS
//
// Filed 2026-09-01 after comparing this page's device handling against
// jubilant-bassoon's. Four gaps were counted. TWO OF THEM WERE NOT GAPS, and
// finding that out is why this file guards the negative as well as the
// positives:
//
//   safe-area-inset  the client declares env(safe-area-inset-*) nine times and
//                    `viewport-fit` ZERO times, in either file. Without
//                    viewport-fit=cover the browser already insets the viewport
//                    and every one of those env() calls resolves to 0. Copying
//                    the pattern here would have added nine no-ops and counted
//                    it as parity.
//   dvh              this page uses no viewport-height unit anywhere, so there
//                    is nothing for dvh to be the safer version OF.
//
// So `pairedOrAbsent` below is not defensive coding. It encodes the actual
// finding: env() and viewport-fit are only meaningful together, and either one
// alone is worse than neither — env() alone is inert, and viewport-fit=cover
// alone puts content under the notch with no padding to hold it out.
//
// Usage:  node scripts/device-chrome-check.mjs [index.html]
//         node scripts/device-chrome-check.mjs --self-test

import { readFileSync } from 'node:fs'
import { createChecks, isMain } from './checks.mjs'

/** The `:active` rule's transform must be answerable by an OS-level request. */
export const reducedMotionCovers = (css) => {
  const m = css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n  \}/)
  if (!m) return { present: false, cancelsTransform: false, keepsColour: false }
  const body = m[1]
  return {
    present: true,
    cancelsTransform: /transform:\s*none/.test(body),
    // A colour change is not motion. Dropping it would leave these controls
    // with NO pressed state for the reader who most needs it unambiguous.
    keepsColour: /transition:\s*background-color/.test(body),
  }
}

/**
 * `touch-action: manipulation` belongs on CONTROLS and not on the scroller.
 *
 * `.tabs` is scroll-snap horizontal; its default `auto` already routes a
 * horizontal drag to the scroller and a vertical one to the page. Declaring
 * `pan-x` there would block vertical page scroll for any gesture starting on
 * the tab bar — a regression wearing a fix's clothes, so it is asserted against
 * by name rather than merely left undone.
 */
export const touchAction = (css) => {
  const decls = [...css.matchAll(/([^{}]+)\{[^{}]*touch-action:\s*([a-z-]+)/g)]
    .map(m => ({ sel: m[1].trim(), value: m[2] }))
  return {
    onControls: decls.some(d => d.value === 'manipulation' && /\.tabs button/.test(d.sel)),
    onScroller: decls.some(d => /(^|,)\s*\.tabs\s*[,{]?\s*$/m.test(d.sel)),
    values: decls.map(d => d.value),
  }
}

/** The date span must announce; the tablist must not (focus already moves). */
export const liveRegions = (html) => ({
  dateIsLive: /<span id="viewed-date"[^>]*aria-live="polite"/.test(html),
  dateIsAtomic: /<span id="viewed-date"[^>]*aria-atomic="true"/.test(html),
  tablistIsLive: /<div class="tabs"[^>]*aria-live=/.test(html),
})

/**
 * env(safe-area-inset-*) and viewport-fit=cover are meaningful ONLY together.
 * Either alone is worse than neither. `both` and `neither` pass; one alone does
 * not, in EITHER direction.
 */
export const pairedOrAbsent = (html) => {
  const env = /env\(\s*safe-area-inset-/.test(html)
  const cover = /viewport-fit\s*=\s*cover/.test(html)
  return { env, cover, ok: env === cover }
}

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()

  const good = `@media (prefers-reduced-motion: reduce) {
    .a:active {
      transform: none;
      transition: background-color 100ms ease-out;
    }
  }`
  check('a reduce block that cancels transform and keeps colour is complete',
    (r => r.present && r.cancelsTransform && r.keepsColour)(reducedMotionCovers(good)))
  check('NO REDUCE BLOCK IS NOT A PASS',
    reducedMotionCovers('.a:active { transform: scale(0.98) }').present === false)
  check('a reduce block that also kills the colour feedback is incomplete',
    reducedMotionCovers(good.replace(/transition:[^;]+;/, '')).keepsColour === false,
    'a colour change is not motion; removing it leaves no pressed state at all')

  check('manipulation on the tab buttons counts',
    touchAction('.tabs button, .pk-side { touch-action: manipulation; }').onControls === true)
  check('THE SCROLLER ITSELF IS FLAGGED, not merely un-required',
    touchAction('.tabs { touch-action: pan-x; }').onScroller === true,
    'pan-x there blocks vertical page scroll from the tab bar')
  check('controls-only does not trip the scroller flag',
    touchAction('.tabs button { touch-action: manipulation; }').onScroller === false)

  const live = '<span id="viewed-date" aria-live="polite" aria-atomic="true"></span>'
  check('the date span announces', liveRegions(live).dateIsLive === true)
  check('and does so atomically', liveRegions(live).dateIsAtomic === true)
  check('a bare span does not',
    liveRegions('<span id="viewed-date"></span>').dateIsLive === false)
  check('a live tablist is flagged — aria-selected already announces',
    liveRegions('<div class="tabs" aria-live="polite">').tablistIsLive === true)

  check('NEITHER env NOR viewport-fit is a valid state — and is this page\'s',
    pairedOrAbsent('<meta name="viewport" content="width=device-width">').ok === true)
  check('both together is the other valid state',
    pairedOrAbsent('<meta content="viewport-fit=cover"> body{padding:env(safe-area-inset-left)}').ok === true)
  check('ENV ALONE IS INERT AND MUST FAIL — the client ships nine of these',
    pairedOrAbsent('body{padding:env(safe-area-inset-left)}').ok === false,
    'without viewport-fit=cover the browser already insets and env() returns 0')
  check('COVER ALONE IS WORSE THAN NEITHER AND MUST ALSO FAIL',
    pairedOrAbsent('<meta content="viewport-fit=cover">').ok === false,
    'content goes under the notch with no padding holding it out')

  process.exit(summarize() === 0 ? 0 : 1)
}

if (isMain(import.meta.url)) {
  const file = process.argv[2] || 'index.html'
  const html = readFileSync(file, 'utf8')
  const { check, summarize } = createChecks()

  const rm = reducedMotionCovers(html)
  check('the :active transform can be turned off by prefers-reduced-motion',
    rm.present && rm.cancelsTransform)
  check('...without taking the colour feedback with it', rm.keepsColour)

  const ta = touchAction(html)
  check('controls drop the ~300ms double-tap-zoom delay', ta.onControls)
  check('the scroll-snap tab bar keeps its default gesture routing', !ta.onScroller)

  const lr = liveRegions(html)
  check('a date change is announced', lr.dateIsLive && lr.dateIsAtomic)
  check('the tablist is not also a live region', !lr.tablistIsLive)

  const sa = pairedOrAbsent(html)
  check(`env(safe-area) and viewport-fit=cover are paired or both absent (env:${sa.env} cover:${sa.cover})`,
    sa.ok)

  process.exit(summarize() === 0 ? 0 : 1)
}
