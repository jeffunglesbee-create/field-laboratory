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
   "      if (!p || p.rows === 0 || rate(p) < WAS_COVERED) continue",
   "      if (!p || p.rows === 0) continue",
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

  ['O3 an out-of-season sport alarms',
   "    if (now.rows === 0) continue",
   "    if (false) continue",
   'a league with no games on the slate reads as a league starved of odds, so every winter fires'],

  ['O4 history stops being ordered by date',
   "      if (!past || past.date >= current.date) continue",
   "      if (!past) continue",
   'probing an OLD date today would count as history for a newer one, so re-probing 2026-09-01 after 2026-09-10 invents a transition that never happened'],

  ['O5 a game with two snapshots counts as two coverages',
   "    row.withOdds += 1",
   "    row.withOdds += odds.length",
   'withOdds would exceed rows, and a sport with opening AND closing prices would look twice as covered as one with a single snapshot'],

  ['O6 a re-probe duplicates instead of replacing',
   "  const rest = (series ?? []).filter(r => r && r.date !== current.date)",
   "  const rest = (series ?? [])",
   'the same date accumulates readings, and the most recent one stops being findable by date'],

  ['O7 A READING WITH NO SPORTS PASSES AS HISTORY',
   "    .filter(r => r && Object.keys(r.sports ?? {}).length === 0)",
   "    .filter(r => false)",
   'THE DEFECT THIS WAS WRITTEN FROM: the committed seed carried sports:{} for both dates, so the alarm had nothing to compare against and printed PASS over a history incapable of failing'],
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
