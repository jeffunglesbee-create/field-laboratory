// The set difference Phase 2 was actually about.
//
// The original plan said: make `unscored` a set difference rather than a
// nullable column, and reproduce production's `unscored_count`. That is
// unbuildable — `/quality/report` reports `unscored_count: 0`, so the difference
// is EMPTY and proving anything on it is the vacuity failure this repo keeps
// finding.
//
// The non-empty difference was one field over. Every row carries a
// `quality_score`; NOT ONE carries a `scoring_version`. So the difference is
// {stored scores} minus {scores whose rubric is known}, and for the committed
// corpus that is every row.
//
// This is the same shape as `Journalism.AnsweringModel`: a stored value whose
// provenance the store does not record.

import { readFileSync } from 'node:fs'
import { createChecks, finish } from './checks.mjs'
// F# list, not JS array. `List.filter` over an array silently finds nothing —
// the same trap that made sport-registry-check report 0 distinct coordinates,
// and the reason the non-vacuity assertions below are first.
import { ofArray } from '../build/fable_modules/fable-library-js.5.13.0/List.js'
import {
  storedScore, rawValue, attributionOf, Attribution,
  asEra2, asEra3, difference, meanOf, scoreValue,
  unattributed, inferenceBases,
} from '../build/Corpus.js'

const { check, summarize } = createChecks()

const CORPUS = JSON.parse(readFileSync('data/jq-mlb-game-corpus.json', 'utf8'))

// The two call sites that guess. Kept as literals so this fails if either file
// changes its basis without this check being told.
const CUTOFF = '2026-07-16 01:36:49'
const BASIS = `created_at vs hardcoded '${CUTOFF}' (ceiling-check.mjs, jq-density-census.mjs)`

const Stamped = v => new Attribution(0, [v])
const Inferred = basis => new Attribution(1, [basis])

check('the corpus is present and the expected size',
  Array.isArray(CORPUS) && CORPUS.length === 592,
  `${Array.isArray(CORPUS) ? CORPUS.length : 'not an array'} brief(s)`)

// ── the finding ─────────────────────────────────────────────────────────────

const hasVersion = CORPUS.filter(r => 'scoring_version' in r)
check('no row in the corpus carries a scoring_version',
  hasVersion.length === 0,
  `${hasVersion.length} of ${CORPUS.length} rows carry one; the projection is ` +
  `${Object.keys(CORPUS[0]).join(', ')}`)

// Every row can therefore only be INFERRED, and the inference is a timestamp
// comparison written into two scripts.
const stored = CORPUS.map(r => storedScore(r.quality_score, Inferred(BASIS)))

const diff = Array.from(unattributed(ofArray(stored)))
check('the set difference is non-empty — it is the whole corpus',
  diff.length === CORPUS.length && diff.length > 0,
  `${diff.length} of ${CORPUS.length} stored scores have no known rubric`)

const bases = Array.from(inferenceBases(ofArray(stored)))
check('every attribution rests on one stated inference, not on data',
  bases.length === 1 && bases[0].includes(CUTOFF),
  `${bases.length} distinct basis/bases: ${JSON.stringify(bases[0] ?? null)}`)

// ── the promotion rule ──────────────────────────────────────────────────────
//
// Non-vacuity for the type argument: if `asEra2` returned None for everything,
// "no row promotes" would be true for the wrong reason.

const stampedTwo = storedScore(203, Stamped(2))
const stampedThree = storedScore(135, Stamped(3))

check('a stamped score DOES promote to its era',
  asEra2(stampedTwo) !== undefined && asEra3(stampedThree) !== undefined,
  'the promotion is reachable, so refusing it below means something')

check('a stamped score does not promote to the WRONG era',
  asEra3(stampedTwo) === undefined && asEra2(stampedThree) === undefined,
  'era 2 stays era 2')

check('an inferred score never promotes, however confident the inference',
  asEra2(stored[0]) === undefined && asEra3(stored[0]) === undefined,
  'Inferred cannot become Score<_> — the guess stays a guess')

// ── the arithmetic that started this ────────────────────────────────────────

const a = asEra2(storedScore(203, Stamped(2)))
const b = asEra2(storedScore(135, Stamped(2)))
check('within one rubric, scores still subtract',
  difference(a, b) === 68,
  `203 - 135 = ${difference(a, b)} — same-era arithmetic is unaffected`)

check('a mean within one rubric still computes',
  meanOf(ofArray([a, b])) === 169,
  `mean = ${meanOf(ofArray([a, b]))}`)

// The cross-era subtraction is a COMPILE error, proven in docs/CORPUS-PROOF.md
// (FS0193). It cannot be asserted here, which is the point: there is no runtime
// behaviour to observe because the program does not exist.

// ── accessors read back ─────────────────────────────────────────────────────

check('a stored score carries its value and its attribution back out',
  rawValue(stampedTwo) === 203 && attributionOf(stampedTwo).tag === 0 &&
  attributionOf(stored[0]).tag === 1 && scoreValue(a) === 203,
  `raw ${rawValue(stampedTwo)}, stamped tag ${attributionOf(stampedTwo).tag}, ` +
  `inferred tag ${attributionOf(stored[0]).tag}`)

finish(summarize())
