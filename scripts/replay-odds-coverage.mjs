// What the odds-coverage alarm has ever said, and what its row floor hides.
//
// WHY THIS EXISTS. `MIN_ROWS = 3` in scripts/odds-coverage.mjs is a judgement
// number, and that file's own comments insist its thresholds come from
// measurement. The measurement is a replay of `transitions()` over the whole
// committed series: six alarms in the history, four substantive, two of the
// `1/1 -> 0/1` shape. The floor drops exactly the two. La Liga's `3/3 -> 0/3`
// is what pins it at 3 rather than 4.
//
// A NUMBER JUSTIFIED BY A REPLAY NOBODY RE-RUNS IS A NUMBER JUSTIFIED BY PROSE.
// The history grows daily. This re-derives the table on demand so the floor can
// be re-checked against what it now suppresses, instead of trusted because of
// what it suppressed in October.
//
// AND IT NAMES WHAT IT HIDES. A guard that silently drops alarms is the amnesty
// shape this repo watches for: every thin-slate skip is printed, with its rows,
// so suppression is visible rather than inferred from a quiet sentinel.
//
// IT READS THE SERIES FROM GIT, not the working tree. A local sentinel run
// rewrites outbox/odds-coverage-series.json, and a replay that reads the
// rewritten copy is measuring the run that just happened rather than the
// record. Is this the source, or a copy of the source?

import { execFileSync } from 'node:child_process'
import { transitions, alarmLine } from './odds-coverage.mjs'

const SERIES = 'outbox/odds-coverage-series.json'
// Kept in step with odds-coverage.mjs by assertion, not by hope: `floorAgrees`
// below fails if an alarm survives whose rows are under this.
const MIN_ROWS = 3

const readCommitted = () =>
  JSON.parse(execFileSync('git', ['show', `HEAD:${SERIES}`], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }))

/** Every alarm the rule produces, replayed over each prefix of the series. */
export function replay(series) {
  const out = []
  for (let i = 0; i < series.length; i++)
    for (const a of transitions(series.slice(0, i), series[i])) out.push({ probe: series[i].date, ...a })
  return out
}

/**
 * Sport-dates the floor removed from consideration: a slate with rows, but
 * fewer than the floor, for a sport that HAD been covered earlier.
 *
 * Computed from the readings, not from a second copy of the transition rule —
 * a duplicated rule drifts from the one it claims to describe, which is this
 * project's most repeated defect.
 */
export function thinSkips(series, minRows = MIN_ROWS) {
  const out = []
  for (let i = 1; i < series.length; i++) {
    for (const [sport, now] of Object.entries(series[i].sports ?? {})) {
      if (!now || now.rows === 0 || now.rows >= minRows) continue
      const everCovered = series.slice(0, i).some(p => {
        const q = p.sports?.[sport]
        return q && q.rows >= minRows && q.withOdds / q.rows >= 0.5
      })
      if (everCovered) out.push({ date: series[i].date, sport, rows: now.rows, withOdds: now.withOdds })
    }
  }
  return out
}

/** The invariant: no surviving alarm may rest on a slate under the floor. */
export const floorAgrees = (alarms, minRows = MIN_ROWS) =>
  alarms.filter(a => a.lastRows < minRows || a.nowRows < minRows)

function selfTest() {
  let pass = 0, fail = 0
  const t = (n, c, d = '') => { if (c) { pass++; console.log(`  PASS  ${n}`) } else { fail++; console.log(`  FAIL  ${n}${d ? `\n        ${d}` : ''}`) } }
  const S = (date, sport, rows, withOdds) => ({ date, sports: { [sport]: { rows, withOdds, withDraw: 0 } } })

  const fired = replay([S('2026-08-29', 'L', 3, 3), S('2026-09-05', 'L', 3, 0)])
  t('a real collapse is replayed as one alarm', fired.length === 1, JSON.stringify(fired))
  t('the alarm carries both sides of the comparison',
    fired[0].lastRows === 3 && fired[0].nowRows === 3)
  t('a one-row flip produces no alarm at all',
    replay([S('2026-10-01', 'M', 1, 1), S('2026-10-02', 'M', 1, 0)]).length === 0)
  t('an empty series replays to nothing', replay([]).length === 0)

  const skips = thinSkips([S('2026-09-26', 'M', 29, 27), S('2026-10-02', 'M', 1, 0)])
  t('A THIN SLATE AFTER REAL COVERAGE IS NAMED, not silently dropped',
    skips.length === 1 && skips[0].rows === 1, JSON.stringify(skips))
  t('a thin slate for a sport never covered is NOT named — nothing was hidden',
    thinSkips([S('2026-09-26', 'M', 29, 0), S('2026-10-02', 'M', 1, 0)]).length === 0)
  t('a slate at the floor is not a skip',
    thinSkips([S('2026-09-26', 'M', 29, 27), S('2026-10-02', 'M', 3, 0)]).length === 0)
  t('a sport absent from the slate is not a thin skip',
    thinSkips([S('2026-09-26', 'M', 29, 27), S('2026-10-02', 'M', 0, 0)]).length === 0)

  t('the invariant passes on alarms that clear the floor', floorAgrees(fired).length === 0)
  t('THE INVARIANT CATCHES AN ALARM RESTING ON A ONE-ROW SLATE',
    floorAgrees([{ sport: 'M', lastRows: 1, nowRows: 1 }]).length === 1)
  t('...and one resting on a thin CURRENT slate only',
    floorAgrees([{ sport: 'M', lastRows: 29, nowRows: 1 }]).length === 1)

  console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}  ${pass}/${pass + fail} self-tests`)
  return fail === 0 ? 0 : 1
}

function live() {
  const series = readCommitted()
  const alarms = replay(series)
  const skips = thinSkips(series)

  console.log(`=== odds-coverage replay  ${series.length} committed reading(s)  MIN_ROWS=${MIN_ROWS} ===\n`)
  console.log(`  ALARMS THE RULE PRODUCES: ${alarms.length}`)
  for (const a of alarms) console.log(`    ${a.probe}  ${a.state.padEnd(10)} ${alarmLine(a)}`)
  if (!alarms.length) console.log('    (none — not a pass; a history that cannot fire proves nothing)')

  console.log(`\n  SUPPRESSED BY THE ROW FLOOR: ${skips.length}`)
  for (const s of skips)
    console.log(`    ${s.date}  ${s.sport} at ${s.withOdds}/${s.rows} — under ${MIN_ROWS} rows, no rate is measurable`)
  if (!skips.length) console.log('    (none)')

  const broken = floorAgrees(alarms)
  console.log(`\nCOVERAGE: ${series.length} readings, every prefix replayed — the whole committed`)
  console.log(`history, not a sample. Read from \`git show HEAD:${SERIES}\`, so a local`)
  console.log('sentinel run cannot change the answer. It does NOT judge whether a')
  console.log('suppressed slate SHOULD have alarmed: that is the floor\'s trade-off, and')
  console.log('this prints it so the trade can be re-read rather than assumed.')
  if (broken.length) {
    console.log(`\nFAIL: ${broken.length} alarm(s) rest on a slate under ${MIN_ROWS} rows, so the floor`)
    console.log('      in scripts/odds-coverage.mjs is not being applied where this expects.')
    for (const b of broken) console.log(`      ${b.sport}: ${b.lastRows} -> ${b.nowRows} rows`)
    return 1
  }
  console.log(`\nOK: every one of the ${alarms.length} alarm(s) rests on ${MIN_ROWS}+ rows on both sides.`)
  return 0
}

process.exit(process.argv.includes('--self-test') ? selfTest() : live())
