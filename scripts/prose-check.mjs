// `src/Prose.fs` must agree with the relay's real tokeniser on every brief in
// the corpus — not on a fixture, on all 592.
//
// WHY AGREEMENT IS THE TEST
//
// Prose.fs claims to be the JQ density dimensions with the unit error moved to
// the compiler. That claim is worth nothing if the F# computes something
// subtly different and more sensible than the thing it says it reproduces. A
// port that quietly fixes the asymmetry it was written to expose would pass
// every check it wrote for itself and prove nothing about production.
//
// So the oracle is `scripts/jq-tokenizer.mjs` — the relay's `scoreProse` body
// copied verbatim, pinned by four hand-verified briefs — and the corpus is
// `data/jq-mlb-game-corpus.json`, 592 real production briefs fetched from
// `/archive/query` by `jq-density-census`.
//
// The comparison runs on the SHIPPED formula (`shippedRawDensity`), including
// its unit error. `density` — the same curve on the numerals-only unit the
// house rule actually states — is asserted separately, because nothing in
// production computes it and there is nothing to agree with.
//
// The failure mode this guards is vacuity: an empty corpus makes every "all
// briefs agree" assertion true. The corpus size is asserted first.

import { readFileSync } from 'node:fs'
import { createChecks, finish } from './checks.mjs'
import { tokens, FIXTURES } from './jq-tokenizer.mjs'
import {
  tokenise, namesOf, numeralsOf, sentencesOf, perSentenceOf,
  numeralDensity, nameDensity, idealNumeralDensity, taper,
  density, shippedRawDensity, shippedDensity, specificity,
  specificityWeight, densityWeight,
} from '../build/Prose.js'

const { check, summarize } = createChecks()

const CORPUS = JSON.parse(readFileSync('data/jq-mlb-game-corpus.json', 'utf8'))

// Non-vacuity first. Everything below is "for all briefs", which is free on an
// empty list — the exact shape that let eight drift-check assertions pass over
// a zero-game payload the night this repo's decoder went tolerant.
check('the corpus is present and the expected size',
  Array.isArray(CORPUS) && CORPUS.length === 592,
  `${Array.isArray(CORPUS) ? CORPUS.length : 'not an array'} brief(s)`)

// The oracle must still BE the oracle. If the verbatim copy drifted from the
// relay's original, these four move and nothing below means anything.
let fixtureFail = 0
for (const f of FIXTURES) {
  const row = CORPUS.find(r => r.id === f.id)
  if (!row) { fixtureFail++; continue }
  const t = tokens(row.brief_text)
  if (t.nSent !== f.nSent || t.properNouns !== f.properNouns ||
      t.numbers !== f.numbers || Math.abs(t.rawDensity - f.rawDensity) > 1e-12) fixtureFail++
}
check('the oracle still matches its hand-verified fixtures',
  fixtureFail === 0,
  `${fixtureFail} of ${FIXTURES.length} fixture(s) moved`)

// ── agreement, brief by brief ───────────────────────────────────────────────

const EPS = 1e-12
const worst = {}
const mismatches = []

const note = (field, delta) => {
  if (!(field in worst) || delta > worst[field]) worst[field] = delta
}

for (const row of CORPUS) {
  const js = tokens(row.brief_text)
  const fs = tokenise(row.brief_text)

  const jsFacts = js.factsPerSentence
  const fsFacts = Array.from(perSentenceOf(fs))

  const bad = []
  if (sentencesOf(fs) !== js.nSent) bad.push(`nSent ${sentencesOf(fs)} vs ${js.nSent}`)
  if (namesOf(fs) !== js.properNouns) bad.push(`names ${namesOf(fs)} vs ${js.properNouns}`)
  if (numeralsOf(fs) !== js.numbers) bad.push(`numerals ${numeralsOf(fs)} vs ${js.numbers}`)
  if (fsFacts.length !== jsFacts.length || fsFacts.some((v, i) => v !== jsFacts[i])) {
    bad.push(`perSentence [${fsFacts}] vs [${jsFacts}]`)
  }

  for (const [field, a, b] of [
    ['specificity', specificity(fs), js.specificity],
    ['rawDensity', shippedRawDensity(fs), js.rawDensity],
    ['shippedDensity', shippedDensity(fs), js.density],
    ['numeralDensity', numeralDensity(fs), js.numsPerSent],
    ['density', density(fs), js.densityNumsOnly],
  ]) {
    const delta = Math.abs(a - b)
    note(field, delta)
    if (delta > EPS) bad.push(`${field} ${a} vs ${b}`)
  }

  if (bad.length) mismatches.push(`${row.id}: ${bad.join('; ')}`)
}

check('every brief in the corpus tokenises identically in F# and the oracle',
  mismatches.length === 0,
  mismatches.length
    ? `${mismatches.length} mismatch(es), first: ${mismatches[0]}`
    : '')

// The epsilon must not be hiding anything. Reported rather than asserted at
// zero, because a float comparison that claims bit-identity should show its
// working instead of being trusted.
const worstDelta = Math.max(...Object.values(worst))
check('the float agreement is exact, not merely within tolerance',
  worstDelta === 0,
  `largest observed delta ${worstDelta} across ${Object.keys(worst).join(', ')}`)

// ── the claims Prose.fs makes in its own header ─────────────────────────────
//
// The module's comment states two measurements about this corpus. A comment is
// not executable, which is how a proof doc drifts ahead of its code — so the
// numbers it cites are asserted here and the file fails if the corpus moves.

const all = CORPUS.map(r => tokenise(r.brief_text))
const minRaw = Math.min(...all.map(shippedRawDensity))
const flooredPct = (all.filter(t => shippedDensity(t) === 0).length / all.length) * 100

check('no brief in the corpus is inside the shipped curve’s range',
  Math.abs(minRaw - 1.75) < 5e-3 && minRaw > 1.0,
  `corpus minimum rawDensity ${minRaw.toFixed(4)} (header cites 1.75; curve peaks at 1.0)`)

check('the shipped dimension is at its floor for ~91% of the corpus',
  Math.abs(flooredPct - 91.2) < 0.5,
  `${flooredPct.toFixed(1)}% floored (header cites 91.2%)`)

// ── the numerals-only unit restores discrimination ──────────────────────────
//
// The claim that motivates the whole module. Stated as a comparison rather than
// a threshold: an implementation that floored everything would satisfy "the
// shipped one is broken" without being any better.

const flooredCorrect = (all.filter(t => density(t) === 0).length / all.length) * 100
check('on the unit the rule states, the dimension discriminates again',
  flooredCorrect < 15 && flooredCorrect < flooredPct,
  `${flooredCorrect.toFixed(1)}% floored on numerals-only vs ${flooredPct.toFixed(1)}% shipped`)

// ── the pieces the units exist for ──────────────────────────────────────────

check('the stated ideal is one numeral per sentence',
  idealNumeralDensity === 1.0,
  `${idealNumeralDensity}`)

check('the taper peaks at the ideal and floors three times above it',
  taper(idealNumeralDensity, idealNumeralDensity) === 1 &&
  taper(idealNumeralDensity, 3.0) === 0 &&
  taper(idealNumeralDensity, 2.0) === 0.5,
  `peak ${taper(idealNumeralDensity, idealNumeralDensity)}, at 3.0 ${taper(idealNumeralDensity, 3.0)}`)

// nameDensity is a real property and a DIFFERENT one — the distinction the
// units exist to hold.
//
// This assertion was first written as "more than 70% of briefs carry more names
// than numerals", a threshold invented here with no basis. It failed at 69.6%.
// Moving it to 0.65 would have been fitting the assertion to the data, which is
// the failure this file's own header is about — so it asserts instead the claim
// `Prose.fs` actually makes: names outnumber numerals "roughly 3 to 2".
const totalNames = all.reduce((a, t) => a + namesOf(t), 0)
const totalNumerals = all.reduce((a, t) => a + numeralsOf(t), 0)
const ratio = totalNames / totalNumerals
const majority = all.filter(t => nameDensity(t) > numeralDensity(t)).length
check('names outnumber numerals roughly 3 to 2, as the module claims',
  ratio > 1.4 && ratio < 1.6,
  `${totalNames} names to ${totalNumerals} numerals = ${ratio.toFixed(4)}:1 ` +
  `(${((majority / all.length) * 100).toFixed(1)}% of briefs name-dominant)`)

check('the dimension weights match the relay',
  specificityWeight === 30.0 && densityWeight === 16.0,
  `spec ${specificityWeight}, density ${densityWeight}`)

finish(summarize())
