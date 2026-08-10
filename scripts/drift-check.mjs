// The drift sentinel.
//
// Fetches a real /context/date payload and runs THIS REPO'S OWN compiled F#
// decoders over it. Not a JavaScript reimplementation — a parallel schema would
// drift from the F# one and make the whole exercise meaningless.
//
// The question it exists to answer: the decoders are proven correct and are not
// proven necessary. Both captures in data/ decoded first try, and every failure
// result in this repo comes from a fixture corrupted on purpose. Whether FIELD's
// live payloads actually drift is unmeasured. This measures it, daily.
//
// A long green run is a real result and must be reported as one — it argues that
// the decoders are insurance nobody has claimed on. Do not tune this toward
// passing.
//
//   node scripts/drift-check.mjs --url https://…/context/date/2026-08-09
//   node scripts/drift-check.mjs --file data/games-2026-08-09.json

import { readFile } from 'node:fs/promises'
import { createChecks, toArray, NESTED } from './checks.mjs'
import { decodePayload, sportMeta, oddsStory, spreadOf, totalOf, favouriteAgreement } from '../build/Desk.js'

const args = process.argv.slice(2)
const argOf = flag => {
  const i = args.indexOf(flag)
  return i === -1 ? null : args[i + 1]
}

const url = argOf('--url')
const file = argOf('--file')
if (!url && !file) {
  console.error('usage: drift-check.mjs (--url <url> | --file <path>)')
  process.exit(2)
}

const source = url || file
let body
try {
  if (url) {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    body = await res.text()
  } else {
    body = await readFile(file, 'utf8')
  }
} catch (e) {
  // A fetch failure is an infrastructure problem, not drift. Say so plainly
  // rather than letting it read as a decoder failure in the log.
  console.error(`FETCH FAILED: ${e.message}`)
  console.log(`RESULT|${source}|fetch-failed|0|0|${e.message}`)
  process.exit(1)
}

const { check, summarize } = createChecks()

const result = decodePayload(body)
const decoded = result.tag === 0
const payload = decoded ? result.fields[0] : null
const decodeError = decoded ? '' : String(result.fields[0]).replace(/\s+/g, ' ').slice(0, 300)

check('payload decodes', decoded, decodeError)

let games = []
let malformed = []
let unmodelled = []
let vocabulary = []
let oddsShape = { withBoth: 0, notSequenced: 0, moved: 0, unmoved: 0, single: 0, none: 0 }
let lineShape = { spreads: 0, unbalanced: 0, totals: 0, split: 0, compared: 0, mismatched: 0 }

if (decoded) {
  games = [...toArray(payload.Regular), ...toArray(payload.Postseason)]

  // The three fields the relay serves as strings containing JSON. Tag 2 means
  // the outer string was present and the inner JSON did not decode — a real
  // shape change, which is exactly what this sentinel is watching for.
  for (const g of games) {
    for (const [field, value] of [['drama_arc', g.DramaArc], ['opening_odds', g.OpeningOdds], ['closing_odds', g.ClosingOdds]]) {
      if (value?.tag === NESTED.Malformed) {
        malformed.push(`${g.Id}.${field}: ${String(value.fields[0]).replace(/\s+/g, ' ').slice(0, 120)}`)
      }
    }
  }

  // The sport vocabulary the relay actually serves. This is how the Sport
  // union's registry stays evidence-driven: cases are added when a sport is
  // observed, not invented in advance, and an unmodelled one surfaces here
  // within a day rather than being quietly absorbed by a fallback.
  const byLabel = new Map()
  for (const g of games) {
    const meta = sportMeta(g.Sport)
    const seen = byLabel.get(meta.Label) || { label: meta.Label, modelled: meta.Modelled, n: 0 }
    seen.n += 1
    byLabel.set(meta.Label, seen)
  }
  vocabulary = [...byLabel.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label))
  unmodelled = vocabulary.filter(v => !v.modelled)

  // The Odds Story's own shape, measured across the whole live slate rather
  // than inferred from two committed games. ODDS_STORY tags follow declaration
  // order in Desk.fs: NoPrices, SingleSnapshot, NotASequence, Unmoved, Moved.
  const ODDS_STORY = { NoPrices: 0, SingleSnapshot: 1, NotASequence: 2, Unmoved: 3, Moved: 4 }
  for (const g of games) {
    const story = oddsStory(g.OpeningOdds, g.ClosingOdds)
    switch (story.tag) {
      case ODDS_STORY.NotASequence: oddsShape.notSequenced += 1; oddsShape.withBoth += 1; break
      case ODDS_STORY.Moved:        oddsShape.moved += 1;        oddsShape.withBoth += 1; break
      case ODDS_STORY.Unmoved:      oddsShape.unmoved += 1;      oddsShape.withBoth += 1; break
      case ODDS_STORY.SingleSnapshot: oddsShape.single += 1; break
      default: oddsShape.none += 1
    }
  }

  // Line shapes across the slate. SPREAD tags: Balanced, Unbalanced.
  // TOTAL tags: OneLine, TwoNumbers. AGREEMENT tags: Agrees, Disagrees,
  // NotComparable. All follow declaration order in Desk.fs.
  const SPREAD = { Balanced: 0, Unbalanced: 1 }
  const TOTAL = { OneLine: 0, TwoNumbers: 1 }
  const AGREE = { Agrees: 0, Disagrees: 1, NotComparable: 2 }
  for (const g of games) {
    for (const nested of [g.OpeningOdds, g.ClosingOdds]) {
      if (nested?.tag !== NESTED.Decoded) continue
      const o = nested.fields[0]
      const sp = spreadOf(o)
      if (sp != null) {
        lineShape.spreads += 1
        if (sp.tag === SPREAD.Unbalanced) lineShape.unbalanced += 1
      }
      const tl = totalOf(o)
      if (tl != null) {
        lineShape.totals += 1
        if (tl.tag === TOTAL.TwoNumbers) lineShape.split += 1
      }
      const ag = favouriteAgreement(o)
      if (ag.tag !== AGREE.NotComparable) {
        lineShape.compared += 1
        if (ag.tag === AGREE.Disagrees) lineShape.mismatched += 1
      }
    }
  }

  // Both are real data-integrity invariants, so both fail rather than merely
  // report. A handicap whose two numbers are not opposites is not one line, and
  // a moneyline that disagrees with the handicap about who is favoured means one
  // of the two fields describes a different market.
  check('every spread is a balanced handicap', lineShape.unbalanced === 0,
    `${lineShape.unbalanced} of ${lineShape.spreads} spreads have home != -away`)
  check('moneyline and handicap agree on the favourite', lineShape.mismatched === 0,
    `${lineShape.mismatched} of ${lineShape.compared} comparable games disagree`)
  // Not a data-integrity violation like the two above — a split total could
  // just as easily mean the relay started serving real over/under PRICES
  // instead of the line duplicated, which would be an upstream improvement.
  // It fails anyway, for the same reason an unmodelled sport does: an
  // assumption this repo encoded (`total` is one line) has stopped holding, and
  // the model needs revisiting. The alarm says investigate, not broken.
  check('every total is a single line, not two numbers', lineShape.split === 0,
    `${lineShape.split} of ${lineShape.totals} totals carry over != under — the field may now be real prices`)

  check('no malformed nested payloads', malformed.length === 0, malformed.join(' | '))
  // Deliberately a failure, not a note. An unmodelled sport means the registry
  // is incomplete and its fixtures are rendering under an unknown convention —
  // the same class of defect as a malformed payload, and it stays loud until
  // someone adds the case.
  check('every observed sport is in the registry', unmodelled.length === 0,
    unmodelled.map(v => `${v.label} (${v.n})`).join(', '))
  check('every game has an id and both teams',
    games.every(g => g.Id && g.Home && g.Away),
    'a game decoded without id/home/away')
}

console.log(`source:   ${source}`)
console.log(`date:     ${payload?.Date ?? '(undecoded)'}`)
console.log(`games:    ${games.length}`)
console.log(`malformed:${malformed.length}`)
console.log(`lines:    spreads=${lineShape.spreads} unbalanced=${lineShape.unbalanced} totals=${lineShape.totals} split=${lineShape.split} favourite-compared=${lineShape.compared} mismatched=${lineShape.mismatched}`)
console.log(`odds:     both=${oddsShape.withBoth} not-sequenced=${oddsShape.notSequenced} moved=${oddsShape.moved} unmoved=${oddsShape.unmoved} single=${oddsShape.single} none=${oddsShape.none}`)
console.log(`sports:   ${vocabulary.map(v => `${v.label}${v.modelled ? '' : ' [UNMODELLED]'}=${v.n}`).join(' ') || '—'}`)
if (malformed.length) for (const m of malformed) console.log(`  ${m}`)
console.log()

const failures = summarize()

// Single machine-readable line for the appended log.
const status = decoded
  ? (malformed.length ? 'malformed' : (unmodelled.length ? 'unmodelled-sport' : 'ok'))
  : 'decode-failed'
const note = decoded
  ? (malformed[0] ?? (unmodelled.length ? `unmodelled: ${unmodelled.map(v => v.label).join(', ')}` : ''))
  : decodeError
// The observed vocabulary rides along on every run, so the log answers "which
// sports has this relay ever served" without needing a separate probe.
const sports = vocabulary.map(v => `${v.label}${v.modelled ? '' : '*'}:${v.n}`).join(' ')
// Odds shape rides along too. Whether closing_odds is ever a real closing line
// is a question about the relay that only accumulates with observation — the
// committed capture says no, on a sample of two.
const odds = `both=${oddsShape.withBoth} notseq=${oddsShape.notSequenced} moved=${oddsShape.moved} unmoved=${oddsShape.unmoved}`
// Line shapes ride along too: whether `total` ever carries two different
// numbers, and whether the handicap ever contradicts the moneyline, are
// questions only observation can answer.
const lines = `spreads=${lineShape.spreads} unbal=${lineShape.unbalanced} totals=${lineShape.totals} split=${lineShape.split} mismatch=${lineShape.mismatched}`
console.log(`RESULT|${source}|${status}|${games.length}|${malformed.length}|${note}|${sports}|${odds}|${lines}`)

process.exit(failures === 0 ? 0 : 1)
