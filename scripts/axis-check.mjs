// The score's weight axis, measured by its CONSEQUENCE on a rendered page.
//
// Usage:  URL=http://localhost:8080/ node scripts/axis-check.mjs
//         URL=https://field-laboratory.jeffunglesbee.workers.dev/ node scripts/axis-check.mjs
//
// WHY THIS IS NOT A PROPERTY ASSERTION. A variable woff2 whose `@font-face`
// declares a SINGLE `font-weight` loads fine, renders every weight by
// SYNTHESISING it off one instance, reports no error, and still shows
// `font-variation-settings` in computed style. Checking that the property is set
// would pass on that. computed-chrome-check.mjs's own header records the same
// trap from the other side: jubilant-bassoon Rule 89 has a check that asserted
// `preserve-3d` was SET and passed while the render did nothing.
//
// So this measures text width across the axis. Four values, strictly rising: a
// real `wght` axis widens glyphs continuously, a synthesised face gives the same
// width for every value it was not cut at. Two values could pass on a lucky pair
// of instances; four with strict monotonicity cannot.
//
// IT LIVES IN ITS OWN SCRIPT, taking a URL, because the question has two
// answers that can differ: the build on this runner, and the page the owner
// loads. team-tint-render-check.mjs is the precedent — verify.yml runs it
// against localhost, live-check.yml against the deployed URL, one
// implementation. The sweep was briefly inlined in computed-chrome-check.mjs
// and is removed from there rather than copied, because two copies of one
// measurement is the drift this repo keeps paying for.
//
// SYNTHETIC PROBE NODES, not the live score. The sweep sets an inline style and
// re-measures; doing that to `.desk-card__score` would leave the page mutated
// for every check that runs after it. The real node is only READ, for its
// computed face and axis.
import { existsSync } from 'node:fs'
import { createChecks, isMain } from './checks.mjs'

// `playwright` is imported INSIDE the live branch, not at the top like its
// siblings. One small deviation, for one reason: a top-level import makes
// `--self-test` require the browser dependency, and the pure predicate below is
// exactly the part that should be runnable anywhere. Measured — `node_modules`
// is empty in the authoring sandbox, so with a top-level import I could not have
// run my own self-test before pushing, which is where this session's defects
// have consistently been.

const URL = process.env.URL || 'http://localhost:8080/'

/** Strictly increasing — not "increasing", not "different". Equal adjacent
 *  widths are the synthesised case this exists to catch, so `>=` would make the
 *  check unable to fail for its own reason. */
export const strictlyRising = (ws) =>
  Array.isArray(ws) && ws.length > 1 &&
  ws.every((w, i) => i === 0 || (typeof w === 'number' && w > ws[i - 1]))

/** The in-page measurement, as a string the browser evaluates. Exported so the
 *  self-test can assert it names the four weights and both tokens without a
 *  browser — a sweep that silently measured one weight twice would otherwise
 *  satisfy `strictlyRising` on three of four points. */
export const WEIGHTS = [100, 400, 700, 1000]

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()
  check('a rising sweep is rising', strictlyRising([10, 11, 12, 13]))
  check('EQUAL adjacent widths are NOT rising — the synthesised case',
    !strictlyRising([12, 12, 12, 12]),
    'a static face gives one width for every value; `>=` would pass it')
  check('one equal pair in the middle is caught', !strictlyRising([10, 11, 11, 13]))
  check('a falling sweep is not rising', !strictlyRising([13, 12, 11, 10]))
  check('a single value cannot establish a trend', !strictlyRising([12]))
  check('an empty sweep is not rising', !strictlyRising([]))
  // A NUMERIC STRING, not null, and that distinction was found by mutation.
  // The first fixture here was `[10, 11, null, 13]`, and dropping the
  // `typeof w === 'number'` guard still passed it — `null > 11` is already
  // false, so the guard never ran. `'12' > 11` IS true, so a width that
  // arrived as a string would read as a genuine rise with the guard gone.
  // That is the case the guard exists for, and now the only one tested.
  check('a numeric STRING in the sweep is not rising — the guard is load-bearing',
    !strictlyRising([10, 11, '12', 13]),
    "'12' > 11 is true, so without the typeof guard a string width reads as a real rise")
  check('null in the sweep is also not rising', !strictlyRising([10, 11, null, 13]),
    'caught by the comparison rather than by the guard — kept as a second case, not as the only one')
  check('four weights are swept, spanning the declared range',
    WEIGHTS.length === 4 && WEIGHTS[0] === 100 && WEIGHTS[3] === 1000,
    `swept ${JSON.stringify(WEIGHTS)}`)
  process.exit(summarize() === 0 ? 0 : 1)
}

if (isMain(import.meta.url)) {
  const { check, summarize } = createChecks()
  const { chromium } = await import('playwright')
  const sessionChromium = '/opt/pw-browsers/chromium'
  const browser = await chromium.launch(
    existsSync(sessionChromium) ? { executablePath: sessionChromium } : {})
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })

  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.desk-card', { timeout: 30000 })

  const measured = await page.evaluate(async (weights) => {
    await document.fonts.ready
    const score = document.querySelector('.desk-card__score')
    const cs = score ? getComputedStyle(score) : null
    const size = cs ? cs.fontSize : '32px'

    const sweep = (familyVar) => {
      const probe = document.createElement('div')
      probe.textContent = '104 - 104'
      probe.style.cssText = 'position:absolute;left:-9999px;top:0;white-space:pre;' +
        `font-size:${size};font-family:var(${familyVar});font-variant-numeric:tabular-nums`
      document.body.appendChild(probe)
      const widths = weights.map((w) => {
        probe.style.fontVariationSettings = `'wght' ${w}`
        return Math.round(probe.getBoundingClientRect().width * 100) / 100
      })
      probe.remove()
      return widths
    }

    return {
      url: location.href,
      scoreFamily: cs ? cs.fontFamily : null,
      scoreFvs: cs ? cs.fontVariationSettings : null,
      scoreFontSize: size,
      dmSansLoaded: document.fonts.check(`700 ${size} 'DM Sans'`),
      weights,
      variableWidths: sweep('--font-score'),
      controlWidths: sweep('--font-identity'),
    }
  }, WEIGHTS)

  check('the score is computed in DM Sans, not the identity face',
    /DM Sans/.test(measured.scoreFamily || ''), `computed font-family: ${measured.scoreFamily}`)
  check('the DM Sans face loaded at the score size',
    measured.dmSansLoaded === true, 'document.fonts.check says DM Sans is unavailable')
  check('the score carries its weight on the axis, not font-weight',
    /wght/.test(measured.scoreFvs || ''), `computed font-variation-settings: ${measured.scoreFvs}`)
  check(`THE AXIS INTERPOLATES: width rises strictly across wght ${WEIGHTS.join('/')}`,
    strictlyRising(measured.variableWidths),
    `widths ${JSON.stringify(measured.variableWidths)} — equal or non-monotonic means the ` +
    '@font-face declared a single weight and the browser is synthesising, not interpolating')

  // THE NEGATIVE CONTROL. Chakra Petch ships static instances only, so the
  // identical sweep over --font-identity must NOT rise. Without this, a rising
  // width could be layout jitter, a transition, or subpixel noise, and the
  // green above would say nothing about the axis.
  check('the control face does NOT interpolate — the measurement discriminates',
    !strictlyRising(measured.controlWidths),
    `Chakra Petch widths ${JSON.stringify(measured.controlWidths)} rose strictly too, so a ` +
    'rising width is not evidence of a working axis')

  // THE NUMBERS, PRINTED — not committed, and that is a decision rather than an
  // omission. Every workflow in this repo that commits an outbox artifact
  // declares `permissions: contents: write`; live-check.yml declares none and is
  // read-only by design. Granting a read-only workflow write access to publish a
  // manifest costs more than the manifest is worth, so the measurement goes to
  // the run log and the check's own exit code does the enforcing. If a committed
  // artifact is wanted later, the permission is the decision to make, not this.
  console.log('')
  console.log(`  page        : ${measured.url}`)
  console.log(`  score face  : ${measured.scoreFamily}`)
  console.log(`  score axis  : ${measured.scoreFvs}  (size ${measured.scoreFontSize})`)
  console.log(`  DM Sans     : ${measured.dmSansLoaded ? 'loaded' : 'NOT LOADED'}`)
  console.log(`  wght        : ${WEIGHTS.map(w => String(w).padStart(8)).join('')}`)
  console.log(`  variable    : ${measured.variableWidths.map(w => String(w).padStart(8)).join('')}`)
  console.log(`  control     : ${measured.controlWidths.map(w => String(w).padStart(8)).join('')}  (must NOT rise)`)
  console.log(`COVERAGE: ONE page (${measured.url}), ONE element class, ${WEIGHTS.length} weights, ` +
    'and the control. It does NOT check any other role, size, or the wdth/slnt axes — ' +
    'dm-sans-variable.woff2 carries wght alone.')

  await browser.close()
  process.exit(summarize() === 0 ? 0 : 1)
}
