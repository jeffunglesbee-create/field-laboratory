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
/**
 * A sport was covered if MOST of its rows carried a price. Below this it was
 * already patchy, and a fall from patchy to none is not the regression this
 * alarm is for.
 */
const WAS_COVERED = 0.5
/**
 * ...and it has collapsed if it now carries less than a third of the rate it
 * had. 0.31 rather than a round third so that an exact one-third reading — a
 * real number a small slate can produce — reads as a fall, not as a fire.
 *
 * THESE TWO NUMBERS ARE THE JUDGEMENT IN THIS FILE, and they are set from the
 * measurement that forced them, not from taste. On 2026-09-21 the first live
 * probe read MLS at 2 of 11 (18%) against 26 of 28 (93%) and 18 of 21 (86%) in
 * the committed history. The CC-CMD this was built for describes exactly that
 * event — "MLS went from two-way prices to 0 of 17" — and the first version of
 * this function, which fired only on withOdds === 0, printed PASS over it.
 * Missing the case by two games is missing it.
 */
const COLLAPSED_TO = 0.31
/**
 * ...and neither rate means anything below this many rows.
 *
 * A one-row sport can only ever read 0% or 100%, so every `1/1 -> 0/1` is a
 * 100-point fall and fires as a new collapse, and every `0/1 -> 1/1` re-arms
 * it. Both thresholds above are rates, and a rate with a denominator of one is
 * a coin, not a measurement.
 *
 * THE NUMBER IS 3 BECAUSE OF WHAT IT WOULD SUPPRESS, not because it reads well.
 * Replaying `transitions()` over all 16 committed readings produces SIX alarms
 * in the whole history:
 *
 *   2026-09-05  La Liga   3/3   -> 0/3     substantive
 *   2026-09-05  Ligue 1   3/5   -> 0/3     substantive
 *   2026-09-20  MLS      18/21  -> 2/11    substantive — the case the thresholds were set from
 *   2026-09-24  MLS       1/1   -> 0/1     NOISE
 *   2026-09-27  MLS      27/29  -> 0/11    substantive
 *   2026-10-02  MLS       1/1   -> 0/1     NOISE
 *
 * A floor of 3 on BOTH SIDES drops exactly the two noise rows and keeps all
 * four real ones. La Liga's 3/3 is what pins it: at 4 that alarm disappears
 * too. The bound is measured from the committed history, and
 * scripts/replay-odds-coverage.mjs re-derives this table on demand so the
 * number can be re-checked rather than trusted.
 *
 * WHY BOTH SIDES. A one-row BASELINE is not evidence a sport was covered, and
 * a one-row CURRENT slate cannot show that it stopped being. Guarding only the
 * baseline would still fire on `20/22 -> 0/1`, which is a thin slate rather
 * than a supply failure.
 */
const MIN_ROWS = 3

const rate = c => (c.rows > 0 ? c.withOdds / c.rows : 0)
/** Enough rows for a rate to mean anything. `rows === 0` is absence, handled separately. */
const measurable = c => (c && c.rows >= MIN_ROWS)

export function transitions(series, current) {
  const out = []
  for (const [sport, now] of Object.entries(current.sports ?? {})) {
    // A sport with no rows at all is absent from the slate, not starved of
    // odds. Alarming on it would fire every time a league is out of season —
    // the standing red this design exists to avoid.
    // TWO DIFFERENT FACTS, ONE OUTCOME. `rows === 0` is a sport absent from the
    // slate — out of season, not starved. `0 < rows < MIN_ROWS` is a slate too
    // thin for a rate to mean anything. Neither is news, and keeping them as
    // separate branches left the first unreachable once the floor arrived: its
    // mutation went dead, which is how the redundancy was found rather than by
    // reading (Rule 63).
    //
    // The distinction survives where it is READ rather than where it is acted
    // on: scripts/replay-odds-coverage.mjs lists every thin slate it suppressed
    // and deliberately excludes the absent ones, so a floor that starts hiding
    // real events is visible instead of silent.
    if (!measurable(now)) continue
    // The most recent EARLIER reading in which this sport was COVERED. Earlier
    // by DATE, not by position: a probe of an older date run today must not
    // count as "before" a probe of a newer date run last week.
    let best = null
    for (const past of series ?? []) {
      if (!past || past.date >= current.date) continue
      const p = past.sports?.[sport]
      if (!p || p.rows === 0 || !measurable(p) || rate(p) < WAS_COVERED) continue
      if (!best || past.date > best.date) best = { date: past.date, ...p }
    }
    if (!best) continue
    if (rate(now) >= rate(best) * COLLAPSED_TO) continue

    // NEW OR CONTINUING — the difference between an alarm and wallpaper.
    //
    // A collapse that persists is one event, not one per probe. The day MLS
    // fell from 86% to 18% is a finding; the ninth consecutive day of 18% is
    // the same finding, and firing on it every run makes the sentinel red
    // forever over a condition nobody in this repo can clear. That is the
    // failure this file's own comments name twice, and yesterday's cost is on
    // record: `verify` step 25 was red for seven runs and 43 checks behind it
    // went unexamined, two of them real defects.
    //
    // The test is the READING IMMEDIATELY BEFORE this one, by date. If the
    // sport was still covered then, this probe is the transition. If it was
    // already below coverage, the fall happened earlier and was reported then.
    // Recovery re-arms it: a sport that climbs back above the covered floor and
    // falls again reports a second, genuinely new collapse.
    let prev = null
    for (const past of series ?? []) {
      if (!past || past.date >= current.date) continue
      const p = past.sports?.[sport]
      if (!p || p.rows === 0 || !measurable(p)) continue
      if (!prev || past.date > prev.date) prev = { date: past.date, ...p }
    }
    const state = !prev || rate(prev) >= WAS_COVERED ? 'new' : 'continuing'

    out.push({
      sport,
      state,
      lastSeen: best.date,
      lastWithOdds: best.withOdds,
      lastRows: best.rows,
      nowWithOdds: now.withOdds,
      nowRows: now.rows,
    })
  }
  return out.sort((a, b) => a.sport.localeCompare(b.sport))
}

/** One line per alarm, with both rates, because a bare count is not a finding. */
export const alarmLine = a =>
  `${a.sport}: ${a.lastWithOdds}/${a.lastRows} ` +
  `(${Math.round(rate({ withOdds: a.lastWithOdds, rows: a.lastRows }) * 100)}%) on ${a.lastSeen}, ` +
  `now ${a.nowWithOdds}/${a.nowRows} ` +
  `(${Math.round(rate({ withOdds: a.nowWithOdds, rows: a.nowRows }) * 100)}%)`

/**
 * Append `current`, replacing any reading for the same date, keeping `keep`.
 *
 * A PROBE THAT SAW NO SPORT IS NOT A READING. It is UNCHECKABLE — the third
 * state, which is not zero. `vacuousReadings()` was written to NAME such a
 * reading once it is committed; this is the other half, which stops one being
 * committed at all. Measured 2026-09-21: the 06:37 UTC sentinel run probed the
 * same day's slate before the relay had created it, got `sports: {}`, printed
 * `ok`, and committed the empty reading (9cb4c34). `transitions()` cannot fire
 * on it, so the history grew a row that looks like a measurement and is not.
 *
 * Returning the series UNCHANGED is the point: nothing was learned, so nothing
 * is recorded, and the previous reading for that date — if one exists — is not
 * overwritten by the absence of one.
 */
export function mergeSeries(series, current, keep = 60) {
  if (!current || Object.keys(current.sports ?? {}).length === 0) return series ?? []
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
  // THE LIVE CASE, from drift-sentinel run 35551910512 on the 2026-09-20 slate.
  // These are the real committed numbers, not invented ones.
  const mlsHistory = [
    { date: '2026-08-29', sports: { MLS: { rows: 28, withOdds: 26, withDraw: 26 } } },
    { date: '2026-09-05', sports: { MLS: { rows: 21, withOdds: 18, withDraw: 18 } } },
  ]
  const mlsLive = { date: '2026-09-20', sports: { MLS: { rows: 11, withOdds: 2, withDraw: 2 } } }
  check('MLS AT 2 OF 11 AGAINST 18 OF 21 FIRES — the case that printed PASS',
    transitions(mlsHistory, mlsLive).length === 1,
    '93% then 86% then 18%; the first version alarmed only on zero and missed it by two games')
  check('the alarm carries BOTH rates, not just the new one',
    /18\/21 \(86%\) on 2026-09-05, now 2\/11 \(18%\)/.test(alarmLine(transitions(mlsHistory, mlsLive)[0])),
    alarmLine(transitions(mlsHistory, mlsLive)[0]))
  // THE MOST RECENT COVERED READING IS THE COMPARISON, not the oldest or the
  // best. The first version of this assertion expected 26/28 from 08-29 and
  // failed against 18/21 from 09-05 — the assertion was wrong, not the code.
  // Quoting the oldest reading would overstate every drop by whatever decline
  // happened in between, and a reader would chase a supply failure that was
  // partly ordinary movement.
  check('THE MOST RECENT COVERED READING IS THE ONE COMPARED AGAINST',
    transitions(mlsHistory, mlsLive)[0].lastSeen === '2026-09-05',
    'the oldest would overstate the drop by the ordinary decline in between')

  // NEW vs CONTINUING, using the real MLS numbers plus the reading the
  // 2026-09-20 probe itself wrote.
  check('THE DAY IT FELL IS A NEW COLLAPSE',
    transitions(mlsHistory, mlsLive)[0].state === 'new')
  const afterTheFall = [...mlsHistory, { date: '2026-09-20', sports: { MLS: { rows: 11, withOdds: 2, withDraw: 2 } } }]
  check('THE NEXT DAY AT THE SAME LEVEL IS CONTINUING, NOT A SECOND EVENT',
    transitions(afterTheFall, { date: '2026-09-21', sports: { MLS: { rows: 12, withOdds: 3, withDraw: 3 } } })[0].state === 'continuing',
    'firing daily on a condition nobody here can clear is how the sentinel becomes wallpaper')
  check('RECOVERY RE-ARMS IT: a second fall after a recovery reads new again',
    transitions([...afterTheFall, { date: '2026-09-25', sports: { MLS: { rows: 10, withOdds: 9, withDraw: 9 } } }],
      { date: '2026-09-26', sports: { MLS: { rows: 10, withOdds: 1, withDraw: 1 } } })[0].state === 'new',
    'otherwise one collapse silences the alarm for that sport forever')
  // A LATER-DATED READING MUST NOT DECIDE AN EARLIER PROBE'S STATE. Re-probing
  // 2026-09-20 after 2026-09-25 has already been recorded is an ordinary thing
  // to do; if the later reading were consulted, this collapse would be filed as
  // already-reported and silenced on the run that first saw it.
  check('THE NEW/CONTINUING TEST IGNORES READINGS DATED AFTER THE PROBE',
    transitions([
      { date: '2026-09-05', sports: { MLS: { rows: 21, withOdds: 18, withDraw: 18 } } },
      { date: '2026-09-25', sports: { MLS: { rows: 11, withOdds: 2, withDraw: 2 } } },
    ], { date: '2026-09-20', sports: { MLS: { rows: 11, withOdds: 2, withDraw: 2 } } })[0].state === 'new',
    'the 09-25 reading is collapsed; consulting it would make the 09-20 probe read continuing and never fire')

  check('a sport with no earlier reading at all reads new, not continuing',
    transitions([{ date: '2026-09-01', sports: { Y: { rows: 4, withOdds: 4, withDraw: 0 } } }],
      { date: '2026-09-10', sports: { Y: { rows: 4, withOdds: 0, withDraw: 0 } } })[0].state === 'new')

  check('A MODERATE DECLINE DOES NOT FIRE',
    transitions(mlsHistory, { date: '2026-09-20', sports: { MLS: { rows: 10, withOdds: 6, withDraw: 6 } } }).length === 0,
    '60% against 86% is a slate with fewer priced games, not a supply collapse — and a red nobody can clear is ignored')
  check('A SPORT THAT WAS ALREADY PATCHY IS NOT A REGRESSION WHEN IT REACHES ZERO',
    transitions([{ date: '2026-09-01', sports: { X: { rows: 10, withOdds: 3, withDraw: 0 } } }],
      { date: '2026-09-10', sports: { X: { rows: 8, withOdds: 0, withDraw: 0 } } }).length === 0,
    '30% was never coverage; alarming here makes every thin market a standing red')

  check('the alarm names when it last saw odds',
    transitions(past, now)[0].lastSeen === '2026-09-01', JSON.stringify(transitions(past, now)[0]))

  const merged = mergeSeries([{ date: '2026-09-01', sports: {} }, { date: '2026-09-10', sports: { a: 1 } }],
    { date: '2026-09-10', sports: { b: 2 } })
  check('a re-probe of the same date REPLACES rather than duplicates',
    merged.length === 2 && JSON.stringify(merged[1].sports) === '{"b":2}', JSON.stringify(merged))
  check('the series stays sorted by date',
    mergeSeries([{ date: '2026-09-10', sports: { a: 1 } }], { date: '2026-09-01', sports: { b: 2 } })[0].date === '2026-09-01')

  check('A PROBE THAT SAW NO SPORT IS NOT RECORDED',
    mergeSeries([{ date: '2026-09-10', sports: { a: 1 } }], { date: '2026-09-21', sports: {} }).length === 1,
    'the 06:37 UTC run on 2026-09-21 probed the day before its slate existed and committed sports:{}')
  check('an empty probe does not overwrite the reading already held for that date',
    JSON.stringify(mergeSeries([{ date: '2026-09-10', sports: { a: 1 } }], { date: '2026-09-10', sports: {} })) ===
      JSON.stringify([{ date: '2026-09-10', sports: { a: 1 } }]),
    'replacing a real reading with an absence is worse than recording one')

  check('A COMMITTED READING WITH NO SPORTS IS NAMED, not silently ignored',
    JSON.stringify(vacuousReadings([{ date: '2026-08-29', sports: {} }, { date: '2026-09-05', sports: { MLB: {} } }])) === '["2026-08-29"]',
    'the hand-written seed carried sports:{} for both dates and the alarm could not fire')
  check('a populated history is not flagged',
    vacuousReadings([{ date: '2026-09-05', sports: { MLB: { rows: 1, withOdds: 1, withDraw: 0 } } }]).length === 0)

  // ── THE ROW FLOOR, from the two real alarms it exists to drop ────────────
  //
  // Both of these are verbatim from outbox/odds-coverage-series.json. They are
  // the reason drift-sentinel alternated in and out of the new-decay list four
  // times in five days: MLS fielded one fixture, it carried no price, and a
  // 100-point fall fired.
  check('THE 2026-10-02 NOISE ALARM: 1/1 -> 0/1 no longer fires',
    transitions([{ date: '2026-10-01', sports: { MLS: { rows: 1, withOdds: 1, withDraw: 1 } } }],
      { date: '2026-10-02', sports: { MLS: { rows: 1, withOdds: 0, withDraw: 0 } } }).length === 0,
    'a one-row sport can only read 0% or 100%; every flip is a 100-point fall')
  check('THE 2026-09-24 NOISE ALARM: the same shape a week earlier',
    transitions([{ date: '2026-09-23', sports: { MLS: { rows: 1, withOdds: 1, withDraw: 1 } } }],
      { date: '2026-09-24', sports: { MLS: { rows: 1, withOdds: 0, withDraw: 0 } } }).length === 0)

  // THE BINDING CASE. La Liga at 3/3 -> 0/3 is the smallest alarm in the whole
  // committed history that is real. If this stops firing the floor is too high.
  check('LA LIGA 3/3 -> 0/3 STILL FIRES — this is what pins the floor at 3, not 4',
    transitions([{ date: '2026-08-29', sports: { 'La Liga': { rows: 3, withOdds: 3, withDraw: 3 } } }],
      { date: '2026-09-05', sports: { 'La Liga': { rows: 3, withOdds: 0, withDraw: 0 } } }).length === 1,
    'a floor of 4 would suppress a genuine collapse, which is the failure mode of guarding too hard')
  check('Ligue 1 3/5 -> 0/3 still fires',
    transitions([{ date: '2026-08-29', sports: { 'Ligue 1': { rows: 5, withOdds: 3, withDraw: 3 } } }],
      { date: '2026-09-05', sports: { 'Ligue 1': { rows: 3, withOdds: 0, withDraw: 0 } } }).length === 1)

  // BOTH SIDES, and the asymmetric cases are the point of guarding both.
  check('A THIN CURRENT SLATE AGAINST A FAT BASELINE DOES NOT FIRE',
    transitions([{ date: '2026-09-26', sports: { MLS: { rows: 29, withOdds: 27, withDraw: 27 } } }],
      { date: '2026-10-02', sports: { MLS: { rows: 1, withOdds: 0, withDraw: 0 } } }).length === 0,
    '27/29 then 0/1 is one unpriced fixture, not a supply failure — guarding only the baseline would still fire here')
  check('A ONE-ROW BASELINE IS NOT EVIDENCE A SPORT WAS COVERED',
    transitions([{ date: '2026-09-30', sports: { MLS: { rows: 1, withOdds: 1, withDraw: 1 } } }],
      { date: '2026-10-02', sports: { MLS: { rows: 11, withOdds: 0, withDraw: 0 } } }).length === 0,
    'nothing was established to have been lost')
  check('...and the real 27/29 baseline behind it still fires on the same 0/11',
    transitions([
      { date: '2026-09-26', sports: { MLS: { rows: 29, withOdds: 27, withDraw: 27 } } },
      { date: '2026-09-30', sports: { MLS: { rows: 1, withOdds: 1, withDraw: 1 } } },
    ], { date: '2026-10-02', sports: { MLS: { rows: 11, withOdds: 0, withDraw: 0 } } }).length === 1,
    'the thin reading is skipped as a baseline, not treated as the end of history')

  // The floor must not quietly become the alarm. Exactly 3 rows is measurable.
  check('exactly MIN_ROWS rows is measurable, not borderline-excluded',
    transitions([{ date: '2026-09-01', sports: { Z: { rows: 3, withOdds: 3, withDraw: 0 } } }],
      { date: '2026-09-10', sports: { Z: { rows: 3, withOdds: 0, withDraw: 0 } } }).length === 1)
  check('two rows on either side is below the floor',
    transitions([{ date: '2026-09-01', sports: { Z: { rows: 2, withOdds: 2, withDraw: 0 } } }],
      { date: '2026-09-10', sports: { Z: { rows: 2, withOdds: 0, withDraw: 0 } } }).length === 0)

  // THE NEW/CONTINUING TEST IS GUARDED TOO. A one-row previous reading would
  // otherwise decide which of the two an alarm is, on a coin.
  check('a thin previous reading does not decide new vs continuing',
    transitions([
      { date: '2026-09-05', sports: { MLS: { rows: 21, withOdds: 18, withDraw: 18 } } },
      { date: '2026-09-19', sports: { MLS: { rows: 1, withOdds: 0, withDraw: 0 } } },
    ], { date: '2026-09-20', sports: { MLS: { rows: 11, withOdds: 2, withDraw: 2 } } })[0].state === 'new',
    'the 09-19 one-row reading would read as already-below-covered and file a first sighting as continuing')

  console.log('')
  const failed = summarize()
  console.log('\nCOVERAGE: the census and the transition rule, on fixtures. It does NOT')
  console.log('decode a real payload, read the series file, or run against a live slate.')
  process.exit(failed ? 1 : 0)
}
