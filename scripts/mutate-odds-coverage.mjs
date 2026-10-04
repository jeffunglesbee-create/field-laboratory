// Rule 90 for odds-coverage.mjs. A check that has only ever passed has proven
// nothing — and this one guards an alarm whose whole value is that it does NOT
// fire on the common case.
//
// O1 and O2 are the pair to keep. O1 makes the alarm fire on every sport that
// has never carried odds, which is the standing red this design exists to
// avoid. O2 deletes the alarm entirely, which is the MLS case going unnoticed
// a second time.
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const F = 'scripts/odds-coverage.mjs'
const passes = () => {
  try { execFileSync(process.execPath, [F, '--self-test'], { stdio: 'pipe' }); return true }
  catch { return false }
}

try { execFileSync('git', ['diff', '--quiet', '--', F], { stdio: 'pipe' }) }
catch { console.log(`NOTE — ${F} has uncommitted changes; restored byte-for-byte after each mutation.`) }
if (!passes()) { console.log(`FAIL — ${F} --self-test is already red on clean source.`); process.exit(1) }
console.log(`baseline: ${F} --self-test passes on current source\n`)

const MUTATIONS = [
  ['O1 A SPORT THAT WAS NEVER COVERED NOW ALARMS',
   "      if (!p || p.rows === 0 || !measurable(p) || rate(p) < WAS_COVERED) continue",
   "      if (!p || p.rows === 0 || !measurable(p)) continue",
   'THE ONE THAT MATTERS: every thin market that ever priced one game goes red the day it prices none. An alarm nobody can clear is one everybody learns to skip, which is how the next real collapse is missed'],

  ['O2 the transition alarm never fires at all',
   "    if (rate(now) >= rate(best) * COLLAPSED_TO) continue",
   "    continue",
   'THE OTHER ONE: MLS goes 18-of-21 to 2-of-11 and the sentinel says nothing — the exact failure this was built for, and the one the first version shipped'],

  ['O8 ONLY A TOTAL LOSS FIRES — the defect this rule was rewritten from',
   "    if (rate(now) >= rate(best) * COLLAPSED_TO) continue",
   "    if (now.withOdds > 0) continue",
   'the live 2026-09-20 reading: MLS 2 of 11 against 18 of 21 printed PASS, because two priced games are not zero priced games'],

  ['O9 the comparison quotes the OLDEST covered reading, not the most recent',
   "      if (!best || past.date > best.date) best = { date: past.date, ...p }",
   "      if (!best || past.date < best.date) best = { date: past.date, ...p }",
   'every drop is overstated by whatever ordinary decline happened in between, and a reader chases a supply failure that was partly seasonal'],

  // O3 ('an out-of-season sport alarms') is GONE, not disabled. It pinned a
  // separate `if (now.rows === 0) continue`, and the row floor subsumes zero —
  // the branch was redundant, so the mutation changed no output on any input.
  // O16 now covers the merged skip, and the self-test still asserts that an
  // absent sport does not alarm. A dead mutation left in place reports CAUGHT
  // for free and inflates the count (Rule 63).

  // ANCHORED ON THREE LINES. Two loops over `series` now share the date guard,
  // so the one-line anchor matched twice and the harness refused to report a
  // verdict — correctly: NOT CAUGHT with nothing mutated is worse than no test.
  // The WAS_COVERED line is what distinguishes the baseline loop from the
  // previous-reading loop; O13 covers the other one.
  ['O4 the BASELINE search stops being ordered by date',
   "      if (!past || past.date >= current.date) continue\n      const p = past.sports?.[sport]\n      if (!p || p.rows === 0 || !measurable(p) || rate(p) < WAS_COVERED) continue",
   "      const p = past.sports?.[sport]\n      if (!p || p.rows === 0 || !measurable(p) || rate(p) < WAS_COVERED) continue",
   'probing an OLD date today would count as history for a newer one, so re-probing 2026-09-01 after 2026-09-10 invents a transition that never happened'],

  ['O13 the PREVIOUS-READING search stops being ordered by date',
   "      if (!past || past.date >= current.date) continue\n      const p = past.sports?.[sport]\n      if (!p || p.rows === 0 || !measurable(p)) continue",
   "      const p = past.sports?.[sport]\n      if (!p || p.rows === 0 || !measurable(p)) continue",
   'the reading that decides new-vs-continuing could come from AFTER the probe, so a later recovery would file a present collapse as already-reported and silence it'],

  ['O5 a game with two snapshots counts as two coverages',
   "    row.withOdds += 1",
   "    row.withOdds += odds.length",
   'withOdds would exceed rows, and a sport with opening AND closing prices would look twice as covered as one with a single snapshot'],

  ['O6 a re-probe duplicates instead of replacing',
   "  const rest = (series ?? []).filter(r => r && r.date !== current.date)",
   "  const rest = (series ?? [])",
   'the same date accumulates readings, and the most recent one stops being findable by date'],

  ['O10 EVERY COLLAPSE READS AS NEW — the sentinel goes red forever',
   "    const state = !prev || rate(prev) >= WAS_COVERED ? 'new' : 'continuing'",
   "    const state = 'new'",
   'THE ONE THIS SPLIT EXISTS FOR: MLS at 18% fails the step on day 9 exactly as on day 1, the whole sentinel job fails every run, and the next real finding is invisible behind it — verify step 25, one workflow over'],

  ['O11 every collapse reads as CONTINUING — the alarm never fires at all',
   "    const state = !prev || rate(prev) >= WAS_COVERED ? 'new' : 'continuing'",
   "    const state = 'continuing'",
   'the other half: nothing is ever fatal, and a collapse is a line in a log nobody fails on'],

  ['O12 a recovery does not re-arm the alarm',
   "      if (!prev || past.date > prev.date) prev = { date: past.date, ...p }",
   "      if (!prev) prev = { date: past.date, ...p }",
   'the earliest reading becomes the test instead of the latest, so a sport that recovers and falls again is filed as still-falling and the second collapse is never reported'],

  ['O7 A READING WITH NO SPORTS PASSES AS HISTORY',
   "    .filter(r => r && Object.keys(r.sports ?? {}).length === 0)",
   "    .filter(r => false)",
   'THE DEFECT THIS WAS WRITTEN FROM: the committed seed carried sports:{} for both dates, so the alarm had nothing to compare against and printed PASS over a history incapable of failing'],

  ['O14 AN EMPTY PROBE IS RECORDED AS A READING',
   "  if (!current || Object.keys(current.sports ?? {}).length === 0) return series ?? []",
   "  if (false) return series ?? []",
   'the other half of O7: 9cb4c34 committed sports:{} from the 06:37 UTC run because the slate did not exist yet, and every such run adds a row that looks like a measurement of zero coverage and is a measurement of nothing'],

  ['O15 an empty probe OVERWRITES the real reading held for that date',
   "  if (!current || Object.keys(current.sports ?? {}).length === 0) return series ?? []",
   "  if (!current) return series ?? []",
   'a second run on a date already probed would replace 11 sports with none, destroying the reading the alarm compares against — worse than never probing'],

  // ── the row floor ────────────────────────────────────────────────────────
  ['O16 A ONE-ROW SLATE ALARMS AGAIN — the flapping this floor was added for',
   '    if (!measurable(now)) continue',
   '    if (false) continue',
   'MLS fielded one unpriced fixture and a 100-point fall fired; drift-sentinel alternated in and out of the new-decay list four times in five days on exactly this'],

  ['O17 a one-row BASELINE counts as evidence the sport was covered',
   '      if (!p || p.rows === 0 || !measurable(p) || rate(p) < WAS_COVERED) continue',
   '      if (!p || p.rows === 0 || rate(p) < WAS_COVERED) continue',
   'a single priced fixture reads 100% and becomes the thing a later slate is judged against; nothing was established to have been lost'],

  ['O18 THE FLOOR IS RAISED TO 4 AND SUPPRESSES A REAL COLLAPSE',
   'const MIN_ROWS = 3',
   'const MIN_ROWS = 4',
   "La Liga's 3/3 -> 0/3 is the smallest genuine alarm in the committed history; at 4 it disappears, which is the failure mode of guarding too hard and is why the number is 3"],

  ['O19 the floor excludes the row count it is named for',
   'const measurable = c => (c && c.rows >= MIN_ROWS)',
   'const measurable = c => (c && c.rows > MIN_ROWS)',
   'an off-by-one here silently becomes a floor of 4 and takes La Liga with it, while the constant still reads 3'],

  ['O20 a thin PREVIOUS reading decides new vs continuing',
   '      if (!p || p.rows === 0 || !measurable(p)) continue\n      if (!prev || past.date > prev.date) prev = { date: past.date, ...p }',
   '      if (!p || p.rows === 0) continue\n      if (!prev || past.date > prev.date) prev = { date: past.date, ...p }',
   'a one-row reading sits below the covered floor by arithmetic, so a first sighting of a real collapse would be filed as `continuing` and never fire'],
]

const original = readFileSync(F, 'utf8')
let caught = 0
for (const [name, anchor, repl, why] of MUTATIONS) {
  const hits = original.split(anchor).length - 1
  if (hits !== 1) { console.log(`FAIL       ${name}\n            anchor matched ${hits} times, expected 1 — NOTHING MUTATED.`); continue }
  const mutated = original.replace(anchor, repl)
  if (mutated === original) { console.log(`FAIL       ${name}\n            file unchanged — NOTHING MUTATED.`); continue }
  writeFileSync(F, mutated)
  const red = !passes()
  writeFileSync(F, original)
  console.log(`${red ? 'CAUGHT    ' : 'NOT CAUGHT'} ${name}\n            (${why})`)
  if (red) caught++
}

console.log(`\n${caught} of ${MUTATIONS.length} mutations caught.`)
console.log('COVERAGE: the census and the transition rule via --self-test. It does NOT')
console.log('cover the series file I/O, the payload decode, or drift-check\'s wiring.')
process.exit(caught === MUTATIONS.length ? 0 : 1)
