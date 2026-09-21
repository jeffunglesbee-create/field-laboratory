// Rule 90 for odds-shape-census.mjs.
//
// S1 and S2 are the pair to keep. S1 collapses an unparseable payload into
// absence — the substitution that would make "no spread on this slate" and
// "the payload did not parse" the same sentence. S2 merges distinct shapes into
// one, which is how a union forgets the case that appeared once.
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const F = 'scripts/odds-shape-census.mjs'
const passes = () => {
  try { execFileSync(process.execPath, [F, '--self-test'], { stdio: 'pipe' }); return true }
  catch { return false }
}

try { execFileSync('git', ['diff', '--quiet', '--', F], { stdio: 'pipe' }) }
catch { console.log(`NOTE — ${F} has uncommitted changes; restored byte-for-byte after each mutation.`) }
if (!passes()) { console.log(`FAIL — ${F} --self-test is already red on clean source.`); process.exit(1) }
console.log(`baseline: ${F} --self-test passes on current source\n`)

const MUTATIONS = [
  ['C1 AN UNPARSEABLE PAYLOAD READS AS ABSENT',
   "  catch (e) { return { state: 'unparseable', value: v.slice(0, 120) } }",
   "  catch (e) { return { state: 'absent', value: null } }",
   'THE ONE THAT MATTERS: "no spread on this slate" and "the payload did not parse" become the same sentence, and a decoding failure is filed as a coverage fact'],

  // RE-ANCHORED 2026-09-21 when signatureOf gained the all-null branch. The old
  // anchor quoted the two-line body verbatim and stopped matching; the harness
  // reported FAIL/NOTHING MUTATED rather than NOT CAUGHT, which is the whole
  // point of that distinction.
  ['C2 distinct shapes merge into one group',
   "  if (!keys.length) return '{}'",
   "  return typeof v",
   'THE OTHER ONE: {home,away} and {home,away,homePrice} become one "object", and the union built from this output forgets the shape that appeared once'],

  ['C3 the key set stops being sorted',
   "  const keys = Object.keys(v).sort()",
   "  const keys = Object.keys(v)",
   'the same shape splits into several groups by insertion order, so a reader counts three shapes where the wire has one'],

  ['C4 rows with no odds leave the denominator',
   "    rowsSeen += 1",
   "    if (g?.opening_odds) rowsSeen += 1",
   'Rule 91: the coverage line reads "3 of 3" and a slate where most rows carry nothing looks complete'],

  ['C5 an unreadable snapshot counts as one that was read',
   "      if (n.state !== 'parsed' && n.state !== 'object') continue\n      oddsSeen += 1",
   "      oddsSeen += 1\n      if (n.state !== 'parsed' && n.state !== 'object') continue",
   'the denominator inflates by every broken payload, so a field present in half the readable snapshots reads as present in a third of everything'],

  ['C6 a field absent from the slate reports nothing at all',
   "    out.push(`  NO VALUE OF \\`${c.field}\\` APPEARED. That is a finding about this slate, not proof the field never exists.`)",
   "    out.push('')",
   'silence reads as "the tool did not run", and the absence stops being a recorded observation'],

  ['C8 AN ALL-NULL OBJECT COUNTS AS A POPULATED ONE',
   "  const allNull = keys.every(k => v[k] === null)\n  return `{${keys.join(',')}}${allNull ? ' ALL NULL' : ''}`",
   "  return `{${keys.join(',')}}`",
   'THE ONE MEASURED ON REAL DATA: spread:{home:null,away:null} on EPL_2026-08-29_bournemouth_everton reads as a genuine unpriced handicap, and a census of "how many spreads are unpriced" is off by one in the direction that matters'],

  ['C7 null and an empty object become the same shape',
   "  if (v === null) return 'null'",
   "  if (v === null) return '{}'",
   'a served null and a served {} are different wire facts, and collapsing them hides which one the relay actually sends'],
]

const original = readFileSync(F, 'utf8')
let caught = 0
for (const [name, anchor, repl, why] of MUTATIONS) {
  const hits = original.split(anchor).length - 1
  if (hits !== 1) { console.log(`FAIL       ${name}\n            anchor matched ${hits} times, expected 1 — NOTHING MUTATED.`); continue }
  const mutated = original.replace(anchor, repl)
  if (mutated === original) { console.log(`FAIL       ${name}\n            replacement was a no-op — NOTHING MUTATED.`); continue }
  writeFileSync(F, mutated)
  const survived = passes()
  writeFileSync(F, original)
  console.log(`${survived ? 'NOT CAUGHT' : 'CAUGHT    '} ${name}\n            (${why})`)
  if (!survived) caught++
}
console.log(`\n${caught} of ${MUTATIONS.length} mutations caught.`)
console.log('COVERAGE: readNested, signatureOf, censusOfField and report via --self-test.')
console.log('It does NOT cover the fetch, the games-array discovery, or the CLI output.')
process.exit(caught === MUTATIONS.length ? 0 : 1)
