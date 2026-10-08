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
import { existsSync, writeFileSync } from 'node:fs'
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

/** Where the committed manifest goes. One file, overwritten — the nine other
 *  `*-latest.json` artifacts in outbox/ are the convention. */
export const MANIFEST_PATH = 'outbox/axis-manifest-latest.json'

/** The manifest, as data. A pure function of the measurement, for two reasons:
 *  the self-test can assert every published field without a browser, and the
 *  committed artifact cannot disagree with the printed numbers because both
 *  read the same object.
 *
 *  WHY THERE IS NO WALL-CLOCK FIELD, which is a design decision and not an
 *  omission. status.yml's own commit step states the rule this follows:
 *  "STATUS.md carries no timestamp precisely so this stays quiet — its git
 *  history should read as a log of things happening, not one commit a day
 *  saying nothing." A timestamp here would make every live-check run a commit,
 *  including the ~365 a year that re-measure an unchanged page and find the
 *  same widths. `deployedCommit` dates the manifest by the thing it describes:
 *  the file changes when the served bytes change or the widths change, and
 *  git's commit date supplies the when.
 *
 *  AND NOT `runIdentity()` from checks.mjs, although its docstring says "any
 *  file that writes a measurement to a ledger needs the same identity". It
 *  digests THIS tree, and this tree contains the previous manifest commit, so
 *  every run would differ from the last for a reason having nothing to do with
 *  the page. The subject of this measurement is the deployed artifact. */
export const manifestOf = (m, { deployedCommit, failed } = {}) => ({
  url: m.url ?? null,
  deployedCommit: deployedCommit || null,
  scoreFamily: m.scoreFamily ?? null,
  scoreAxis: m.scoreFvs ?? null,
  scoreFontSize: m.scoreFontSize ?? null,
  dmSansLoaded: m.dmSansLoaded === true,
  weights: m.weights ?? null,
  variableWidths: m.variableWidths ?? null,
  controlWidths: m.controlWidths ?? null,
  variableRises: strictlyRising(m.variableWidths),
  controlRises: strictlyRising(m.controlWidths),
  checksFailed: typeof failed === 'number' ? failed : null,
  // Rule 91: the denominator travels with the result. A reader who finds
  // `variableRises: true` and nothing else infers the whole typography system
  // was measured; one page, one element, one axis is what was measured.
  coverage: {
    pages: 1,
    element: '.desk-card__score',
    weightsSwept: Array.isArray(m.weights) ? m.weights.length : null,
    axesSwept: ['wght'],
    otherRolesSwept: 0,
    otherSizesSwept: 0,
  },
})

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

  // THE COMMITTED ARTIFACT, field by field, with no browser. Every one of these
  // is something a reader of outbox/axis-manifest-latest.json will believe.
  const sample = {
    url: 'https://field-laboratory.jeffunglesbee.workers.dev/',
    scoreFamily: '"DM Sans", system-ui, sans-serif',
    scoreFvs: "'wght' 700", scoreFontSize: '32px', dmSansLoaded: true,
    weights: WEIGHTS, variableWidths: [100, 110, 120, 130],
    controlWidths: [120, 120, 120, 120],
  }
  const man = manifestOf(sample, { deployedCommit: 'abc123abc123', failed: 0 })
  check('the manifest records the variable face as rising', man.variableRises === true)
  check('THE MANIFEST RECORDS THE CONTROL AS NOT RISING',
    man.controlRises === false,
    'a manifest reporting the control as rising would publish the measurement as undiscriminating')
  check('a rising CONTROL is published as rising, not quietly dropped',
    manifestOf({ ...sample, controlWidths: [100, 110, 120, 130] }, {}).controlRises === true,
    'the field must track what was measured, not the answer that was wanted')
  check('an absent deployed commit is null, never an empty string',
    manifestOf(sample, {}).deployedCommit === null,
    'missing and empty are different facts')
  check('the failure count is carried, and null when it was not supplied',
    man.checksFailed === 0 && manifestOf(sample, {}).checksFailed === null)
  check('the manifest carries NO wall-clock field',
    !Object.keys(man).some(k => /^(at|now|date|time|timestamp|generated)$/i.test(k)),
    'a timestamp would make every run a commit — see the note on manifestOf')
  check('the manifest states its own coverage where the result is read',
    man.coverage.weightsSwept === WEIGHTS.length && man.coverage.axesSwept.length === 1 &&
    man.coverage.otherRolesSwept === 0,
    `coverage ${JSON.stringify(man.coverage)}`)
  check('the manifest path is in outbox/, which is non-deployable',
    MANIFEST_PATH.startsWith('outbox/') && MANIFEST_PATH.endsWith('.json'),
    `a manifest outside outbox/ would make its own commit deployable and retrigger this check: ${MANIFEST_PATH}`)
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

  // THE NUMBERS, PRINTED, AND WITH `--manifest` ALSO COMMITTED.
  //
  // This comment used to say the opposite — that the measurement belonged in the
  // run log and granting live-check.yml write access "costs more than the
  // manifest is worth". What settled it was trying to read the numbers back. A
  // run log is not reachable from every client that can read the repository:
  // `runs/<id>/logs` answers with a redirect to blob storage, and the GitHub
  // client in the authoring sandbox refuses it, so for three days the only
  // evidence the axis worked was a green step conclusion and the widths behind
  // it could not be quoted.
  //
  // It also claimed live-check.yml was "read-only by design". It declared no
  // `permissions:` block at all, which means its token took the repository
  // default — and the endpoint that reports that default is one the sandbox
  // proxy refuses, so from here the claim was neither verified nor verifiable.
  // It now declares `contents: write` explicitly, which removes the question.
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

  const failed = summarize()

  // WRITTEN ON FAILURE TOO, and that is the case it is for. A run whose widths
  // came back equal is the run whose numbers someone needs; publishing only the
  // green ones would leave the interesting measurement in the place that cannot
  // be read. `--manifest` is opt-in so that `verify` and a local run leave no
  // artifact behind — one path, named here, so the workflow that commits it and
  // the script that writes it cannot drift apart.
  if (process.argv.includes('--manifest')) {
    writeFileSync(MANIFEST_PATH, JSON.stringify(
      manifestOf(measured, { deployedCommit: process.env.DEPLOYED_SHA, failed }), null, 2) + '\n')
    console.log(`  manifest    : ${MANIFEST_PATH}`)
  }

  await browser.close()
  process.exit(failed === 0 ? 0 : 1)
}
