// What shapes `spread` and `total` ACTUALLY take, read from the raw payload.
//
// Task 0.2 of docs/CC-CMD-2026-09-11-spread-total-model.md: "record the ACTUAL
// shapes `spread` and `total` take, verbatim. Do not model from this document's
// description or from the API's documentation."
//
// SO THIS DOES NOT DECODE. `drift-check.mjs` reads the payload through the
// compiled F# decoders, and a decoder is a model — anything it cannot express
// is already gone by the time you look. The whole question here is what the
// wire carries, so this reads the raw JSON and prints what it finds, grouped by
// the SET OF KEYS each value has. A shape nobody has modelled shows up as its
// own group rather than as an absence.
//
// It makes no judgement about whether a shape is right. Counting and quoting is
// the entire job; Task 1 is where the union gets designed, from this output.
//
// Usage:  node scripts/odds-shape-census.mjs --url https://…/context/date/2026-09-20
//         node scripts/odds-shape-census.mjs --file data/context-2026-09-05.json
//         node scripts/odds-shape-census.mjs --self-test

import { readFile } from 'node:fs/promises'
import { createChecks, isMain } from './checks.mjs'

/**
 * The payload nests odds as a JSON STRING on some routes and as an object on
 * others, and this must not silently treat an unparseable string as absence —
 * that is the collapse this repo keeps finding. Three outcomes, named.
 */
export function readNested(v) {
  if (v == null) return { state: 'absent', value: null }
  if (typeof v === 'object') return { state: 'object', value: v }
  if (typeof v !== 'string') return { state: 'unexpected-type', value: typeof v }
  try { return { state: 'parsed', value: JSON.parse(v) } }
  catch (e) { return { state: 'unparseable', value: v.slice(0, 120) } }
}

/** The key set of a value, as a stable signature. Scalars and arrays say so. */
export function signatureOf(v) {
  if (v === null) return 'null'
  if (Array.isArray(v)) return `array[${v.length}]`
  const t = typeof v
  if (t !== 'object') return t
  const keys = Object.keys(v).sort()
  return keys.length ? `{${keys.join(',')}}` : '{}'
}

/**
 * Group every observed value of `field` by signature.
 *
 * Keeps ONE verbatim sample per signature plus the count and the sports it was
 * seen in. A signature with a count of 1 is as much a shape as one with 400 —
 * the rare one is usually the one a union forgets.
 */
export function censusOfField(games, field, { sportOf, oddsKeys = ['opening_odds', 'closing_odds'] } = {}) {
  const groups = new Map()
  let rowsSeen = 0
  let oddsSeen = 0
  const nestedStates = {}

  for (const g of games) {
    rowsSeen += 1
    for (const key of oddsKeys) {
      const n = readNested(g?.[key])
      nestedStates[n.state] = (nestedStates[n.state] ?? 0) + 1
      if (n.state !== 'parsed' && n.state !== 'object') continue
      oddsSeen += 1
      if (!(field in (n.value ?? {}))) continue
      const v = n.value[field]
      const sig = signatureOf(v)
      const grp = groups.get(sig) ?? { signature: sig, count: 0, sports: new Set(), sample: v, sampleFrom: `${sportOf(g)} ${g?.id ?? '(no id)'} ${key}` }
      grp.count += 1
      grp.sports.add(sportOf(g))
      groups.set(sig, grp)
    }
  }

  return {
    field,
    rowsSeen,
    oddsSeen,
    nestedStates,
    withField: [...groups.values()].reduce((n, g) => n + g.count, 0),
    groups: [...groups.values()]
      .sort((a, b) => b.count - a.count)
      .map(g => ({ ...g, sports: [...g.sports].sort() })),
  }
}

/** Rule 91: the denominator is printed where the result is read, never inferred. */
export function report(c) {
  const out = []
  out.push(`── ${c.field} ──`)
  out.push(`  ${c.withField} value(s) of \`${c.field}\` across ${c.oddsSeen} odds snapshot(s) on ${c.rowsSeen} game row(s).`)
  out.push(`  nested payload states: ${Object.entries(c.nestedStates).sort().map(([k, n]) => `${k}=${n}`).join(' ') || '(none)'}`)
  if (c.groups.length === 0) {
    out.push(`  NO VALUE OF \`${c.field}\` APPEARED. That is a finding about this slate, not proof the field never exists.`)
    return out.join('\n')
  }
  for (const g of c.groups) {
    out.push(`  ${String(g.count).padStart(4)}×  ${g.signature}`)
    out.push(`        sports: ${g.sports.join(', ')}`)
    out.push(`        from:   ${g.sampleFrom}`)
    out.push(`        verbatim: ${JSON.stringify(g.sample)}`)
  }
  return out.join('\n')
}

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()

  check('an absent nested payload is absent, not empty',
    readNested(undefined).state === 'absent' && readNested(null).state === 'absent')
  check('A STRING THAT IS NOT JSON IS UNPARSEABLE, NOT ABSENT',
    readNested('{oops').state === 'unparseable',
    'treating it as absence is the collapse this repo keeps finding')
  check('a JSON string parses', readNested('{"a":1}').state === 'parsed')
  check('an object is taken as-is', readNested({ a: 1 }).state === 'object')
  check('a number is an unexpected type, named as one', readNested(7).state === 'unexpected-type')

  check('a signature is the SORTED key set',
    signatureOf({ b: 1, a: 2 }) === '{a,b}',
    'unsorted keys would split one shape into several')
  check('an array reports its length, not its keys', signatureOf([1, 2, 3]) === 'array[3]')
  check('null is distinct from an empty object',
    signatureOf(null) === 'null' && signatureOf({}) === '{}')
  check('a scalar reports its type', signatureOf(4.5) === 'number' && signatureOf('x') === 'string')

  const sportOf = g => g.sport
  const games = [
    { id: 'a', sport: 'MLB', opening_odds: JSON.stringify({ spread: { home: -1.5, away: 1.5 } }) },
    { id: 'b', sport: 'NFL', opening_odds: JSON.stringify({ spread: { home: -3, away: 3 } }) },
    { id: 'c', sport: 'NBA', opening_odds: JSON.stringify({ spread: { home: -2, away: 2, homePrice: -110 } }) },
    { id: 'd', sport: 'MLS', opening_odds: null },
    { id: 'e', sport: 'EPL', opening_odds: '{broken' },
  ]
  const c = censusOfField(games, 'spread', { sportOf, oddsKeys: ['opening_odds'] })
  check('EVERY ROW IS IN THE DENOMINATOR, including the ones with no odds',
    c.rowsSeen === 5, `${c.rowsSeen}`)
  check('only readable snapshots count as odds seen',
    c.oddsSeen === 3, `${c.oddsSeen} — the null and the broken string are not snapshots`)
  check('the unparseable row is reported by state, not dropped silently',
    c.nestedStates.unparseable === 1 && c.nestedStates.absent === 1,
    JSON.stringify(c.nestedStates))
  check('TWO DISTINCT SHAPES ARE TWO GROUPS, not one',
    c.groups.length === 2, c.groups.map(g => g.signature).join(' '))
  check('the common shape sorts first and carries its sports',
    c.groups[0].signature === '{away,home}' && c.groups[0].count === 2 &&
    c.groups[0].sports.join(',') === 'MLB,NFL', JSON.stringify(c.groups[0].sports))
  check('THE RARE SHAPE IS KEPT, with a verbatim sample',
    c.groups[1].signature === '{away,home,homePrice}' &&
    JSON.stringify(c.groups[1].sample) === '{"home":-2,"away":2,"homePrice":-110}',
    'a union forgets the shape that appeared once')

  const none = censusOfField(games, 'total', { sportOf, oddsKeys: ['opening_odds'] })
  check('a field no row carries reports ZERO GROUPS, and says what that means',
    none.groups.length === 0 && /not proof the field never exists/.test(report(none)),
    'absent on this slate is not absent from the wire')
  check('the report carries the denominator beside the count',
    /across 3 odds snapshot\(s\) on 5 game row\(s\)/.test(report(c)), report(c).split('\n')[1])

  process.exit(summarize() === 0 ? 0 : 1)
}

if (isMain(import.meta.url) && !process.argv.includes('--self-test')) {
  const args = process.argv.slice(2)
  const argOf = f => { const i = args.indexOf(f); return i === -1 ? null : args[i + 1] }
  const url = argOf('--url')
  const file = argOf('--file')
  if (!url && !file) {
    console.error('usage: odds-shape-census.mjs (--url <url> | --file <path>)')
    process.exit(2)
  }
  let body
  try {
    body = url ? await (await fetch(url)).text() : await readFile(file, 'utf8')
  } catch (e) {
    console.error(`FETCH FAILED: ${e.message}`)
    process.exit(1)
  }
  const payload = JSON.parse(body)
  // The games live under a key this repo has already been burned by assuming.
  // Try the known shapes and SAY which one answered.
  const candidates = [
    ['games', payload?.games],
    ['games.regular', payload?.games?.regular],
    ['data.games', payload?.data?.games],
  ]
  let games = null, whichKey = null
  for (const [k, v] of candidates) if (Array.isArray(v)) { games = v; whichKey = k; break }
  if (!games && Array.isArray(payload?.games?.regular) === false && payload?.games && typeof payload.games === 'object') {
    games = Object.values(payload.games).flat().filter(x => x && typeof x === 'object')
    whichKey = 'games.* (flattened)'
  }
  if (!games) {
    console.error(`NO GAMES ARRAY. Top-level keys: ${Object.keys(payload ?? {}).join(', ')}`)
    process.exit(1)
  }

  const sportOf = g => g?.sport ?? g?.league ?? '(no sport)'
  console.log(`source:   ${url || file}`)
  console.log(`games at: ${whichKey}  (${games.length} row(s))`)
  console.log(`odds keys probed: opening_odds, closing_odds`)
  console.log()
  for (const field of ['spread', 'total', 'moneyline']) {
    console.log(report(censusOfField(games, field, { sportOf })))
    console.log()
  }
  // Every key any odds snapshot carries, so a field nobody thought to ask for
  // is visible. The three above are the CC-CMD's question; this is the control.
  const allKeys = new Map()
  for (const g of games) for (const k of ['opening_odds', 'closing_odds']) {
    const n = readNested(g?.[k])
    if (n.state !== 'parsed' && n.state !== 'object') continue
    for (const key of Object.keys(n.value ?? {})) allKeys.set(key, (allKeys.get(key) ?? 0) + 1)
  }
  console.log('── every key any odds snapshot carries (the control) ──')
  console.log(`  ${[...allKeys.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}=${n}`).join(' ') || '(no readable snapshots)'}`)
}
