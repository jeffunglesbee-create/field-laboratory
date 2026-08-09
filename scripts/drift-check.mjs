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
import { decodePayload } from '../build/Desk.js'

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

if (decoded) {
  games = [...toArray(payload.Regular), ...toArray(payload.Postseason)]

  // The three fields the relay serves as strings containing JSON. Tag 2 means
  // the outer string was present and the inner JSON did not decode — a real
  // shape change, which is exactly what this sentinel is watching for.
  for (const g of games) {
    for (const [field, value] of [['drama_arc', g.DramaArc], ['opening_odds', g.OpeningOdds]]) {
      if (value?.tag === NESTED.Malformed) {
        malformed.push(`${g.Id}.${field}: ${String(value.fields[0]).replace(/\s+/g, ' ').slice(0, 120)}`)
      }
    }
  }

  check('no malformed nested payloads', malformed.length === 0, malformed.join(' | '))
  check('every game has an id and both teams',
    games.every(g => g.Id && g.Home && g.Away),
    'a game decoded without id/home/away')
}

console.log(`source:   ${source}`)
console.log(`date:     ${payload?.Date ?? '(undecoded)'}`)
console.log(`games:    ${games.length}`)
console.log(`malformed:${malformed.length}`)
if (malformed.length) for (const m of malformed) console.log(`  ${m}`)
console.log()

const failures = summarize()

// Single machine-readable line for the appended log.
const status = decoded ? (malformed.length ? 'malformed' : 'ok') : 'decode-failed'
const note = decoded ? (malformed[0] ?? '') : decodeError
console.log(`RESULT|${source}|${status}|${games.length}|${malformed.length}|${note}`)

process.exit(failures === 0 ? 0 : 1)
