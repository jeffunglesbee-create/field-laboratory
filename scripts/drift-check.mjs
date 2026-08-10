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
import { decodePayload, sportMeta, oddsStory } from '../build/Desk.js'

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
console.log(`RESULT|${source}|${status}|${games.length}|${malformed.length}|${note}|${sports}|${odds}`)

process.exit(failures === 0 ? 0 : 1)
