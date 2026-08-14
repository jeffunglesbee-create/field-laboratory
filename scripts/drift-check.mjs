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
import { decodePayload, sportMeta, oddsStory, spreadOf, totalOf, favouriteAgreement, dateKeying, fieldDayIso } from '../build/Desk.js'

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
let mismatchDetail = []
let sections = []
let deskFill = { note: 0, local_note: 0, crew: 0, tags: 0, tagsMalformed: 0 }
let keying = new Map()
let keyingExamples = []

if (decoded) {
  games = [...toArray(payload.Regular), ...toArray(payload.Postseason)]

  // ACCEPTED, not merely survived.
  //
  // `payload decodes` stopped being a real assertion the moment the game list
  // became fault-tolerant. `Decode.oneOf [ gameDecoder |> Decode.map Some;
  // Decode.succeed None ]` means a wholly broken `gameDecoder` still produces a
  // payload — one with zero games in it — and every count below then reports
  // cheerfully over an empty set.
  //
  // The mutation harness caught exactly that within one run of the change:
  // `[decoder-rejects-real]` SURVIVED, meaning `Desk.fs` was deliberately broken
  // and this script still passed. The gate row is named "decoders accept both
  // real captures", so accept has to mean all of them.
  //
  // The conservation law alone is NOT enough here and it is worth saying why:
  // a broken decoder maps every row to `None`, so `games + unnamed === rows`
  // still balances perfectly at zero games. Both captures are hand-checked to
  // contain no null-sided rows, so the assertion is the strict one.
  const rawGameRows = (() => {
    try {
      const j = JSON.parse(body)
      const n = a => (Array.isArray(a) ? a.length : 0)
      return n(j?.games?.regular) + n(j?.games?.postseason)
    } catch { return -1 }
  })()

  check('every game row in the capture is accepted as a game',
    rawGameRows > 0 && games.length === rawGameRows && payload.Unnamed === 0,
    `${rawGameRows} row(s) in the file, ${games.length} decoded, ${payload.Unnamed} un-nameable`)

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
        if (ag.tag === AGREE.Disagrees) {
          lineShape.mismatched += 1
          // Name the game and show the numbers. A count alone is not
          // actionable, and this invariant is new enough that a mismatch is at
          // least as likely to be wrong about soccer as the data is to be wrong.
          mismatchDetail.push(
            `${sportMeta(g.Sport).Label} ${g.Id}: ML ${o.MoneylineHome}/${o.MoneylineAway} H ${o.SpreadHome}/${o.SpreadAway}`)
        }
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
    `${lineShape.mismatched} of ${lineShape.compared} comparable: ${[...new Set(mismatchDetail)].slice(0, 6).join(' | ')}`)
  // Not a data-integrity violation like the two above — a split total could
  // just as easily mean the relay started serving real over/under PRICES
  // instead of the line duplicated, which would be an upstream improvement.
  // It fails anyway, for the same reason an unmodelled sport does: an
  // assumption this repo encoded (`total` is one line) has stopped holding, and
  // the model needs revisiting. The alarm says investigate, not broken.
  check('every total is a single line, not two numbers', lineShape.split === 0,
    `${lineShape.split} of ${lineShape.totals} totals carry over != under — the field may now be real prices`)

  // Fill rates for the four editorial columns. All four are null in every game
  // of every capture; whether that holds on the live slate is the question.
  for (const g of games) {
    if (g.Note != null) deskFill.note += 1
    if (g.LocalNote != null) deskFill.local_note += 1
    if (g.Crew != null) deskFill.crew += 1
    if (g.Tags?.tag === NESTED.Decoded) deskFill.tags += 1
    if (g.Tags?.tag === NESTED.Malformed) deskFill.tagsMalformed += 1
  }
  // tags is the fourth double-encoded field, so it gets the same treatment as
  // the other three: a broken inner payload is a failure, not a note.
  // Which day is a game's `date`? KEYING tags follow declaration order in
  // Desk.fs: NoStartTime, SameUtcDay, StartsAfterDateUtc, StartsBeforeDateUtc.
  //
  // Not an assertion — a measurement. The laboratory keys off UTC and FIELD
  // keys off ET, and before changing anything the question is what the relay's
  // `date` column actually IS. A relay serving AFL, MLS and MLB may well key
  // each competition to its own local day, in which case ET is as wrong as UTC.
  const KEYING = ['no-start-time', 'same-utc-day', 'starts-after-date', 'starts-before-date']
  for (const g of games) {
    const k = KEYING[dateKeying(g).tag] ?? '?'
    const label = sportMeta(g.Sport).Label
    const key = `${label}:${k}`
    keying.set(key, (keying.get(key) || 0) + 1)
    // Name the games that disagree, with their numbers. A count cannot be
    // judged — that lesson cost a whole round trip on the favourite invariant.
    if (k === 'starts-after-date' || k === 'starts-before-date') {
      // g.Day is a lifted FieldDay, not a bare string — read it through the
      // accessor rather than a property that no longer exists.
      keyingExamples.push(`${label} ${g.Id}: date=${g.Day ? fieldDayIso(g.Day) : 'unreadable'} start=${g.RawStartTime}`)
    }
  }

  check('no malformed tags payloads', deskFill.tagsMalformed === 0,
    `${deskFill.tagsMalformed} of ${games.length} games have unparseable tags`)

  check('no malformed nested payloads', malformed.length === 0, malformed.join(' | '))

  // Context Graph sections. SECTION tags follow declaration order in Desk.fs:
  // Absent, EmptyOrFailed, Present.
  const SECTION = { Absent: 0, EmptyOrFailed: 1, Present: 2 }
  const sectionName = t => ['absent', 'empty-or-failed', 'present'][t] ?? '?'
  sections = ['Briefs', 'Series', 'Standings'].map(name => {
    const v = payload[name]
    const n = v?.tag === SECTION.Present ? v.fields[0].length ?? toArray(v.fields[0]).length : 0
    return { name: name.toLowerCase(), state: sectionName(v?.tag), n }
  })

  // NOT a failure. The relay collapses a rejected D1 query to [] via
  // Promise.allSettled, so `empty-or-failed` is genuinely ambiguous and firing
  // on it would alarm on every quiet slate. Recorded and tracked instead —
  // whether these sections are ever populated is a question only the log can
  // answer, which is the same standing as the drift question itself.
  check('context sections decoded', sections.length === 3,
    sections.map(s => `${s.name}=${s.state}`).join(' '))
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
console.log(`keying:   ${[...keying.entries()].sort().map(([k, n]) => `${k}=${n}`).join(' ') || '—'}`)
if (keyingExamples.length) for (const e of keyingExamples.slice(0, 8)) console.log(`  ${e}`)
console.log(`desk:     note=${deskFill.note} local_note=${deskFill.local_note} crew=${deskFill.crew} tags=${deskFill.tags} of ${games.length} games`)
console.log(`sections: ${sections.map(s => `${s.name}=${s.state}${s.n ? `(${s.n})` : ''}`).join(' ') || '—'}`)
console.log(`lines:    spreads=${lineShape.spreads} unbalanced=${lineShape.unbalanced} totals=${lineShape.totals} split=${lineShape.split} favourite-compared=${lineShape.compared} mismatched=${lineShape.mismatched}`)
console.log(`odds:     both=${oddsShape.withBoth} not-sequenced=${oddsShape.notSequenced} moved=${oddsShape.moved} unmoved=${oddsShape.unmoved} single=${oddsShape.single} none=${oddsShape.none}`)
console.log(`sports:   ${vocabulary.map(v => `${v.label}${v.modelled ? '' : ' [UNMODELLED]'}=${v.n}`).join(' ') || '—'}`)
if (malformed.length) for (const m of malformed) console.log(`  ${m}`)
console.log()

const failures = summarize()

// Single machine-readable line for the appended log.
// Every failing invariant must reach the status. The first version computed
// this from malformed/unmodelled only, so a run where the favourite-agreement
// check failed still logged `ok` — a row that says the opposite of the run's
// own exit code is worse than no row at all.
const lineFault =
  lineShape.unbalanced ? 'spread-unbalanced'
  : lineShape.split ? 'total-split'
  : lineShape.mismatched ? 'favourite-mismatch'
  : ''
const status = decoded
  ? (malformed.length ? 'malformed'
     : unmodelled.length ? 'unmodelled-sport'
     : lineFault ? lineFault
     : 'ok')
  : 'decode-failed'
const note = decoded
  ? (malformed[0]
     ?? (unmodelled.length ? `unmodelled: ${unmodelled.map(v => v.label).join(', ')}`
         : (mismatchDetail.length ? [...new Set(mismatchDetail)].slice(0, 3).join(' ; ') : '')))
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
console.log(`RESULT|${source}|${status}|${games.length}|${malformed.length}|${note}|${sports}|${odds}|${lines}|${sections.map(s => `${s.name}=${s.state}${s.n ? `(${s.n})` : ''}`).join(' ')}|note=${deskFill.note} local=${deskFill.local_note} crew=${deskFill.crew} tags=${deskFill.tags}/${games.length}|${[...keying.entries()].sort().map(([k, n]) => `${k}=${n}`).join(' ')}`)

process.exit(failures === 0 ? 0 : 1)
