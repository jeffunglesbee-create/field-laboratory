// Which of three explanations produced `2026-08-30-mls-stl-dal`?
//
// CC-CMD-2026-09-01-mls-dual-writer-duplicate Task 1. That spec deliberately
// does NOT assert a write path: `grep` finds exactly one
// `INSERT INTO regular_season_games` in the relay, at `POST /archive/game`,
// whose id is `${sport}_${date}_${idTail}` — underscore-separated, which cannot
// produce a dash-only id. Three explanations were left open:
//
//   1. a write path outside /archive/game reaches D1 (/d1/execute accepts
//      non-SELECT statements and is a candidate)
//   2. the rows predate the current id scheme and are stale
//   3. an external caller passes fields that compose to this shape
//
// `created_at` decides between "stale" and "live", and `/context/date` serves
// it, so this needs no credential.
//
// THE DISCRIMINATOR IS THE SPREAD, NOT THE AGE. A single old timestamp on every
// dash row is a bulk import that ran once. Timestamps tracking each game's date
// is a writer still running. Age alone cannot tell them apart: a live writer
// seeded a month ago also looks old on the rows it wrote then.
//
// This is the shape CC-CMD-2026-08-08 already measured once, and it named the
// instants: "created_at clusters at 2026-06-30 19:27 for the name-scheme rows
// and 2026-07-16 12:23 for the key-scheme ones. Two bulk schedule imports
// either side of this change, not a per-game seed racing a per-game
// resolution."
//
// Usage:  node scripts/probe-dash-scheme-writer.mjs [--days 30]
//         node scripts/probe-dash-scheme-writer.mjs --self-test

import { writeFileSync, mkdirSync } from 'node:fs'
import { createChecks, isMain } from './checks.mjs'

const RELAY = process.env.RELAY || 'https://field-relay-nba.jeffunglesbee.workers.dev'

/** The dash-separated abbreviation shape, e.g. `2026-08-30-mls-stl-dal`. */
export const isDashScheme = id => /^\d{4}-\d{2}-\d{2}-[a-z]+-/.test(String(id ?? ''))

/** Calendar day of a `YYYY-MM-DD HH:MM:SS` stamp, or null. */
export const dayOf = ts => {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(ts ?? ''))
  return m ? m[1] : null
}

/**
 * `stale-bulk` | `live-writer` | `unreadable` | `not-observable`.
 *
 * `distinctStamps` is the whole discriminator. One stamp across rows for games
 * spanning weeks is an import that ran once and stopped. Stamps tracking the
 * game dates is something still writing.
 *
 * `unreadable` is not a formality: if no dash row carries a `created_at`, the
 * question cannot be answered from this endpoint, and reporting "one stamp"
 * because there were zero would be a measurement of the probe.
 */
export const verdictFor = ({ dashRows, withStamp, distinctStamps, stampsAfter }) => {
  if (dashRows === 0) return 'not-observable'
  if (withStamp === 0) return 'unreadable'
  // A stamp written after the earliest game it covers means something wrote
  // while the window was already running — not a single forward import.
  if (stampsAfter > 0 || distinctStamps > 3) return 'live-writer'
  return 'stale-bulk'
}

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()

  check('the observed shape is recognised', isDashScheme('2026-08-30-mls-stl-dal') === true)
  check('the composite shape is NOT', isDashScheme('MLS_2026-08-30_stlouis_dallas') === false)
  check('and neither is the new numeric one', isDashScheme('MLS_2026-08-30_e761769') === false)
  check('a bare date is not the shape', isDashScheme('2026-08-30') === false)

  check('a day is read off a stamp', dayOf('2026-06-30 17:13:24') === '2026-06-30')
  check('a missing stamp is null, not a day', dayOf(null) === null && dayOf('') === null)

  check('ONE STAMP ACROSS A LONG WINDOW IS AN IMPORT THAT RAN ONCE',
    verdictFor({ dashRows: 170, withStamp: 170, distinctStamps: 1, stampsAfter: 0 }) === 'stale-bulk')
  check('stamps tracking the games is something still writing',
    verdictFor({ dashRows: 170, withStamp: 170, distinctStamps: 28, stampsAfter: 25 }) === 'live-writer')
  check('ONE stamp written mid-window is enough to be live',
    verdictFor({ dashRows: 170, withStamp: 170, distinctStamps: 2, stampsAfter: 1 }) === 'live-writer',
    'a second import during the window is a writer, not a one-off')
  check('NO STAMPS AT ALL IS UNREADABLE, NOT ONE STAMP',
    verdictFor({ dashRows: 170, withStamp: 0, distinctStamps: 0, stampsAfter: 0 }) === 'unreadable',
    'zero distinct stamps would otherwise read as the tightest possible cluster')
  check('no dash rows is not-observable',
    verdictFor({ dashRows: 0, withStamp: 0, distinctStamps: 0, stampsAfter: 0 }) === 'not-observable')
  process.exit(summarize() === 0 ? 0 : 1)
}

if (isMain(import.meta.url)) {
  const i = process.argv.indexOf('--days')
  const days = i >= 0 ? Number(process.argv[i + 1]) : 30
  mkdirSync('outbox', { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outPath = `outbox/dash-scheme-writer-${stamp}.txt`
  const out = []
  const log = s => { out.push(s); console.log(s); try { writeFileSync(outPath, out.join('\n')) } catch {} }

  log(`probe_at: ${new Date().toISOString()}`)
  log(`question: is the dash-scheme MLS writer STALE (one bulk import) or LIVE?`)
  log(`method:   public GET /context/date, ${days} day(s) back. created_at is served,`)
  log(`          so this needs no credential. CC-CMD-2026-09-01-mls-dual-writer Task 1.`)
  log('')

  const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const stamps = new Map()          // created_at day -> count
  let dashRows = 0, withStamp = 0, stampsAfter = 0
  let earliestGame = null, compositeStamps = new Map()

  for (let d = 1; d <= days; d++) {
    const day = new Date(today.getTime() - d * 86400000).toISOString().slice(0, 10)
    let games
    try {
      const r = await fetch(`${RELAY}/context/date/${day}`, { signal: AbortSignal.timeout(25000) })
      if (!r.ok) { log(`  ${day}  HTTP ${r.status} — not observed`); continue }
      const p = await r.json()
      games = [...(p.games?.regular ?? []), ...(p.games?.postseason ?? [])]
    } catch (e) { log(`  ${day}  ${String(e).slice(0, 40)} — not observed`); continue }

    if (!earliestGame || day < earliestGame) earliestGame = day
    const dash = games.filter(g => isDashScheme(g?.id))
    for (const g of games) {
      const cd = dayOf(g?.created_at)
      if (!cd) continue
      if (isDashScheme(g.id)) continue
      compositeStamps.set(cd, (compositeStamps.get(cd) ?? 0) + 1)
    }
    if (!dash.length) { log(`  ${day}  ${String(games.length).padStart(3)} row(s)  no dash-scheme rows`); continue }
    dashRows += dash.length
    const here = new Map()
    for (const g of dash) {
      const cd = dayOf(g?.created_at)
      if (!cd) continue
      withStamp++
      stamps.set(cd, (stamps.get(cd) ?? 0) + 1)
      here.set(cd, (here.get(cd) ?? 0) + 1)
      // Written after the game it covers had already been played?
      if (cd > day) stampsAfter++
    }
    log(`  ${day}  ${String(games.length).padStart(3)} row(s)  ${String(dash.length).padStart(2)} dash  created ${[...here.keys()].join(', ') || '(none)'}`)
  }

  const verdict = verdictFor({ dashRows, withStamp, distinctStamps: stamps.size, stampsAfter })
  log('')
  log(`dash-scheme rows: ${dashRows}, ${withStamp} carrying created_at`)
  log(`distinct created_at DAYS among them: ${stamps.size}`)
  for (const [d2, n] of [...stamps.entries()].sort()) log(`    ${d2}  ${n} row(s)`)
  log(`for contrast, composite rows span ${compositeStamps.size} created_at day(s)`)
  log('')
  log(`VERDICT: ${verdict}`)
  log('')
  log({
    'stale-bulk':
      'Every dash-scheme row was created in one narrow window, for games spread\n' +
      'across the whole sweep. That is a FORWARD-SCHEDULE IMPORT that ran once and\n' +
      'stopped, not a writer still running — the same shape CC-CMD-2026-08-08\n' +
      'measured (55 groups, 110 rows, all MLS, created_at clustered at one instant).\n' +
      '\n' +
      'Per this CC-CMD Task 1, that is explanation (2) and the instruction is to\n' +
      'REPORT AND STOP: stale rows are a bounded cleanup with its own spec, not a\n' +
      'code change. No relay code is at fault, and nothing new is being written.',
    'live-writer':
      'Dash-scheme rows carry created_at stamps that track the games rather than\n' +
      'one import instant. Something is still writing them, so this is explanation\n' +
      '(1) or (3) and the caller must be identified before any fix.',
    unreadable:
      'Dash-scheme rows were found but none carries a created_at, so this endpoint\n' +
      'cannot answer the question. Not a result in either direction.',
    'not-observable':
      'No dash-scheme rows were served. Nothing was measured.',
  }[verdict])
  log('')
  log(`artifact: ${outPath}`)
  process.exit(verdict === 'live-writer' ? 1 : 0)
}
