// Which SPORTS get odds — not which shapes the odds take.
//
// WHY THIS IS SEPARATE FROM THE SHAPE COUNTS
//
// `drift-check.mjs` already counts spreads, totals and favourite agreement
// across the slate. Every one of those is a count of games that HAVE odds, so
// the whole family is blind to a sport that stops getting any. On 2026-09-11 a
// probe found MLS at 0 of 17 rows across two dates, having previously carried
// two-way prices, and nothing in this repo had noticed: the shape counters saw
// a smaller denominator and reported healthy shapes on it.
//
// THE ALARM IS A TRANSITION, NOT A LEVEL
//
// A sport at zero is not news. Most sports have never carried odds here and a
// standing red for each is an alarm nobody can clear, which trains people to
// ignore the next one — the failure this repo has already written down twice.
//
// The alarm is: this sport carried odds on an EARLIER probed date, and carries
// none now. That is a transition, it has a direction, and it is exactly the
// MLS case.
//
// WHAT IT CANNOT SEE, stated where the verdict is read rather than in a comment
// nobody reaches: the series is per PROBED DATE, so a sport that loses odds and
// regains them between two probes is invisible. The probe interval is the floor
// on resolution.

import { NESTED, isMain } from './checks.mjs'

/**
 * Per-sport coverage for one payload.
 *
 * `withOdds` counts a game once, not once per snapshot: a game with both an
 * opening and a closing price has odds, it does not have two coverages.
 *
 * @param games  decoded games
 * @param labelOf  g -> sport label (injected so this stays pure and testable
 *                 without the compiled F# in scope)
 */
export function censusOf(games, labelOf) {
  const out = {}
  for (const g of games) {
    const label = labelOf(g)
    const row = (out[label] ??= { rows: 0, withOdds: 0, withDraw: 0 })
    row.rows += 1
    // Either snapshot counts. A sport whose opening price is missing but whose
    // closing price is present is covered; treating only one as authoritative
    // would invent a coverage gap out of a capture-timing difference.
    const odds = [g.OpeningOdds, g.ClosingOdds]
      .filter(n => n?.tag === NESTED.Decoded)
      .map(n => n.fields[0])
    if (!odds.length) continue
    row.withOdds += 1
    if (odds.some(o => o.MoneylineDraw != null)) row.withDraw += 1
  }
  return out
}

/**
 * Sports that HAD odds on an earlier probed date and have none now.
 *
 * @param series   earlier readings, oldest first: [{ date, sports }]
 * @param current  { date, sports } — the reading just taken
 * @returns [{ sport, lastSeen, lastWithOdds, nowRows }]
 */
export function transitions(series, current) {
  const out = []
  for (const [sport, now] of Object.entries(current.sports ?? {})) {
    // A sport with no rows at all is absent from the slate, not starved of
    // odds. Alarming on it would fire every time a league is out of season —
    // the standing red this design exists to avoid.
    if (now.rows === 0) continue
    if (now.withOdds > 0) continue
    // The most recent EARLIER reading in which this sport carried odds. Earlier
    // by DATE, not by position: a probe of an older date run today must not
    // count as "before" a probe of a newer date run last week.
    let best = null
    for (const past of series ?? []) {
      if (!past || past.date >= current.date) continue
      const p = past.sports?.[sport]
      if (!p || p.withOdds <= 0) continue
      if (!best || past.date > best.date) best = { date: past.date, withOdds: p.withOdds }
    }
    if (best) out.push({ sport, lastSeen: best.date, lastWithOdds: best.withOdds, nowRows: now.rows })
  }
  return out.sort((a, b) => a.sport.localeCompare(b.sport))
}

/** Append `current`, replacing any reading for the same date, keeping `keep`. */
export function mergeSeries(series, current, keep = 60) {
  const rest = (series ?? []).filter(r => r && r.date !== current.date)
  return [...rest, current].sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(-keep)
}

/**
 * Which committed readings carry no sport at all.
 *
 * WRITTEN FROM A DEFECT, 2026-09-20. The first seed file was hand-written and
 * gave both dates `sports: {}`. `transitions()` is right to ignore an empty
 * reading — there is nothing to have lost — so the alarm went silent and the
 * check printed PASS over a history that could never fire it. A green result
 * from an empty denominator is the failure this repo keeps re-finding, and a
 * seed is a copy of the capture unless something regenerates it.
 *
 * Emptiness is only ever wrong in a COMMITTED reading; `transitions()` still
 * treats it as "nothing known", which is what it means mid-run.
 */
export function vacuousReadings(series) {
  return (series ?? [])
    .filter(r => r && Object.keys(r.sports ?? {}).length === 0)
    .map(r => r.date)
}

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  const { createChecks } = await import('./checks.mjs')
  const { check, summarize } = createChecks()
  const D = NESTED.Decoded
  const g = (sport, ...odds) => ({ Sport: sport, OpeningOdds: odds[0], ClosingOdds: odds[1] })
  const dec = o => ({ tag: D, fields: [o] })
  const label = x => x.Sport

  const c = censusOf([
    g('MLB', dec({ MoneylineDraw: null }), dec({ MoneylineDraw: null })),
    g('MLB'),
    g('EPL', dec({ MoneylineDraw: 320 })),
    g('MLS'), g('MLS'),
  ], label)
  check('rows are counted per sport',
    JSON.stringify([c.MLB.rows, c.EPL.rows, c.MLS.rows]) === '[2,1,2]', JSON.stringify(c))
  check('A GAME WITH BOTH SNAPSHOTS COUNTS ONCE, not twice',
    c.MLB.withOdds === 1, `withOdds ${c.MLB.withOdds}, expected 1 of 2 rows`)
  check('a draw price is counted only where it exists',
    c.EPL.withDraw === 1 && c.MLB.withDraw === 0, JSON.stringify(c))
  check('a sport with no odds still reports its rows',
    c.MLS.rows === 2 && c.MLS.withOdds === 0, JSON.stringify(c.MLS))

  const past = [{ date: '2026-09-01', sports: { MLS: { rows: 8, withOdds: 8, withDraw: 0 } } }]
  const now = { date: '2026-09-10', sports: { MLS: { rows: 9, withOdds: 0, withDraw: 0 } } }
  check('THE MLS CASE: had odds, now none, on rows that exist',
    transitions(past, now).length === 1, JSON.stringify(transitions(past, now)))
  check('A SPORT THAT NEVER CARRIED ODDS DOES NOT ALARM',
    transitions([{ date: '2026-09-01', sports: { CFB: { rows: 3, withOdds: 0, withDraw: 0 } } }],
      { date: '2026-09-10', sports: { CFB: { rows: 1, withOdds: 0, withDraw: 0 } } }).length === 0,
    'a coverage decision is not a regression, and a red nobody can clear is ignored')
  check('a sport absent from the slate does not alarm',
    transitions(past, { date: '2026-09-10', sports: { MLS: { rows: 0, withOdds: 0, withDraw: 0 } } }).length === 0,
    'out of season is not starved')
  check('a sport still carrying odds does not alarm',
    transitions(past, { date: '2026-09-10', sports: { MLS: { rows: 9, withOdds: 9, withDraw: 0 } } }).length === 0)
  check('A LATER-DATED READING IS NOT "EARLIER" JUST BECAUSE IT RAN FIRST',
    transitions([{ date: '2026-09-20', sports: { MLS: { rows: 8, withOdds: 8, withDraw: 0 } } }], now).length === 0,
    'probing an old date today must not count as history for a newer one')
  check('the alarm names when it last saw odds',
    transitions(past, now)[0].lastSeen === '2026-09-01', JSON.stringify(transitions(past, now)[0]))

  const merged = mergeSeries([{ date: '2026-09-01', sports: {} }, { date: '2026-09-10', sports: { a: 1 } }],
    { date: '2026-09-10', sports: { b: 2 } })
  check('a re-probe of the same date REPLACES rather than duplicates',
    merged.length === 2 && JSON.stringify(merged[1].sports) === '{"b":2}', JSON.stringify(merged))
  check('the series stays sorted by date',
    mergeSeries([{ date: '2026-09-10', sports: {} }], { date: '2026-09-01', sports: {} })[0].date === '2026-09-01')

  check('A COMMITTED READING WITH NO SPORTS IS NAMED, not silently ignored',
    JSON.stringify(vacuousReadings([{ date: '2026-08-29', sports: {} }, { date: '2026-09-05', sports: { MLB: {} } }])) === '["2026-08-29"]',
    'the hand-written seed carried sports:{} for both dates and the alarm could not fire')
  check('a populated history is not flagged',
    vacuousReadings([{ date: '2026-09-05', sports: { MLB: { rows: 1, withOdds: 1, withDraw: 0 } } }]).length === 0)

  console.log('')
  const failed = summarize()
  console.log('\nCOVERAGE: the census and the transition rule, on fixtures. It does NOT')
  console.log('decode a real payload, read the series file, or run against a live slate.')
  process.exit(failed ? 1 : 0)
}
