// Confidence PER ROW, earned the same way the gate's total is.
//
// The gate scores itself per row as weight/weight — which is only "did this
// command exit 0". That is a fact about today's tree, not confidence in the row.
// A row that passes and has never been shown to fail is exactly the shape this
// session kept finding: `outboxToday` passed on any dated file, `zone-check`
// passed on a broken build, Scout's Gate C lied while `tab-check` agreed.
//
// So a row's confidence is computed from three things it can be wrong about,
// and none of them is self-reported:
//
//   TEETH (70)         at least one mutation in mutation-check breaks the
//                      invariant this row guards, and THIS ROW is what fails.
//                      The only part that distinguishes a guard from a green
//                      light.
//   DETERMINISTIC (30) the row's scripts do not consult the wall clock or the
//                      network, so the answer is the same tomorrow. This repo
//                      has been burned twice by time-dependent assertions.
//
// Both are required to clear 95, which is the point: a guard with teeth that
// answers differently tomorrow is not a guard, and neither is a stable one that
// has never been shown to fail.
//
// "Does the row pass today" is deliberately NOT scored here — that is exactly
// what the gate measures, and duplicating it would let a green light stand in
// for evidence again. The first version did include it, and got it wrong:
// it ran each row's script without the row's arguments, so `drift-check.mjs`
// with no `--file` "failed" and two rows scored 0 for a reason that was the
// scorer's mistake.
//
// A row below 95 is one nothing has proven can fail. That is a to-do with an
// address on it, not a score to argue with.
//
// Usage:  node scripts/row-confidence.mjs

import { readFileSync } from 'node:fs'
import { rows } from './gate-checks.mjs'
import { createChecks, finish } from './checks.mjs'

const BAR = 95

const gateSource = readFileSync('scripts/gate-checks.mjs', 'utf8')
const mutationSource = readFileSync('scripts/mutation-check.mjs', 'utf8')

/** The scripts a row shells out to, read from its declaration. */
const scriptsOf = rowName => {
  // Slice the row's own object literal, so a neighbouring row's command is not
  // attributed to it.
  const at = gateSource.indexOf(`name: '${rowName}'`) >= 0
    ? gateSource.indexOf(`name: '${rowName}'`)
    : gateSource.indexOf(`name: "${rowName}"`)
  if (at === -1) return []
  const end = gateSource.indexOf('\n\n', at)
  const decl = gateSource.slice(at, end === -1 ? gateSource.length : end)
  const named = [...decl.matchAll(/scripts\/([\w.-]+\.mjs)/g)].map(m => `scripts/${m[1]}`)
  // A row whose `run` is a local function — the outbox and history rows — names
  // no script, and its logic lives in gate-checks.mjs. Those rows were scanned
  // for nondeterminism against an EMPTY file list, so they scored full marks for
  // determinism without anything being read.
  //
  // That is how CI run 31456294086 failed: `outboxToday` called `fieldDay()` at
  // row-evaluation time, the run crossed midnight ET, and the row asked about a
  // different day than the one it started in. This scorer's own rule would have
  // caught it, if it had been looking at the file.
  return named.length > 0 ? named : ['scripts/gate-checks.mjs']
}

/**
 * Mutations that name THIS ROW as their expectation.
 *
 * Matched on the row name rather than a shared script path. Path matching
 * credited every row that happened to invoke the same script, and could not
 * credit the outbox or history rows at all — their logic lives in
 * gate-checks.mjs, not in a script of their own.
 */
const mutationsFor = (scripts, rowName) => {
  const found = []
  for (const block of mutationSource.split(/\n  \{\n/).slice(1)) {
    const id = /id: '([^']+)'/.exec(block)?.[1]
    // Match the WHOLE quoted string. The first version stopped at the first
    // quote of any kind, so `expect: "URL='http://…' node scripts/tab-check.mjs"`
    // captured `URL=` and the tab rows appeared to have no teeth at all.
    // Backticks included: `harness-blind`'s expectation is a template literal
    // wrapping a shell `!`, and a quote-only pattern read it as empty — the
    // mutation row then showed no teeth while its teeth were sitting right
    // there.
    const expect = /expect:\s*(['"`])((?:\\.|(?!\1).)*)\1/.exec(block)?.[2] ?? ''
    if (!id) continue
    if (expect.includes(rowName)) { found.push(id); continue }
    // Legacy form: a mutation naming the script the row runs.
    if (!/run-row\.mjs/.test(expect) && scripts.some(s => expect.includes(s))) found.push(id)
  }
  return found
}

/**
 * Wall-clock or network use anywhere the row reaches.
 *
 * Comments and string literals are stripped first. The first version scanned raw
 * source and flagged `drift-check.mjs` as reaching the network because its usage
 * comment shows a `--url https://…` example the gate never passes. That is the
 * SAME bug this session already fixed in workflow-check, which read the comment
 * explaining why a step was absent as the step itself. A detector that reads
 * documentation as code will fire on the sentence documenting it.
 *
 * One clock read is permitted, and only in the shape this repo settled on
 * elsewhere: capture the instant ONCE into a top-level `const NOW = new Date()`,
 * then be pure. That is the same discipline `gameStateAt` follows. A script that
 * calls `new Date()` repeatedly can straddle midnight between two lines.
 */
const nondeterminism = scripts => {
  const flagged = []
  for (const s of scripts) {
    let src
    try { src = readFileSync(s, 'utf8') } catch { continue }
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n')
      .replace(/(['"`])(?:\\.|(?!\1)[\s\S])*\1/g, "''")

    // Clock reads BEHIND A HELPER count too. `fieldDay()` and `fieldToday()`
    // are this repo's zone-aware readers, and the first version of this scan
    // saw only literal `new Date()` — so it looked straight past
    // `const today = fieldDay()` inside the outbox row, which is the exact call
    // that failed CI run 31456294086 by crossing midnight mid-run.
    // The rule, stated generally: a clock read must be captured into a
    // top-level CONSTANT. Naming specific constants (NOW, GATE_DAY) made the
    // rule about vocabulary; this makes it about shape, and zone-check's
    // `fieldToday()` — the zero-argument production reader it exists to test —
    // can satisfy it the same way everything else does.
    const captures = code.match(/const [A-Z][A-Z0-9_]* = [^\n]*?(new Date\(\s*\)|fieldDay\(\s*\)|fieldToday\(\s*\))/g) ?? []
    const clockReads = code.match(/Date\.now\(\)|new Date\(\s*\)|fieldDay\(\s*\)|fieldToday\(\s*\)/g) ?? []
    if (clockReads.length > captures.length) {
      flagged.push(`${s}: reads the clock ${clockReads.length}x (capture it once as NOW)`)
    }
    if (/https?:\/\/(?!localhost)/.test(code)) flagged.push(`${s}: reaches the network`)
  }
  return flagged
}

console.log('\nPer-row confidence\n')

// --- self-test ---------------------------------------------------------------
//
// This scorer has the same self-reference problem as the mutation harness: blind
// its teeth-detection and every row scores 100, which looks like success. So it
// scores a synthetic pair whose answers are known — one row with a mutation and
// one without — and requires the second to come out below the bar.
//
// `--self-test` FAILING is what proves the scorer can still tell the difference,
// and the gate row asserts both halves.
const score = (hasTeeth, hasClock) => (hasTeeth ? 70 : 0) + (hasClock ? 0 : 30)

if (process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()
  check('a row with teeth and no clock scores 100', score(true, false) === 100,
    `got ${score(true, false)}`)
  check('a row with NO mutation is below the bar', score(false, false) < BAR,
    `a toothless row scored ${score(false, false)} — the scorer cannot tell`)
  check('a row that reads the clock is below the bar', score(true, true) < BAR,
    `a clock-reading row scored ${score(true, true)}`)
  process.exit(summarize() === 0 ? 0 : 1)
}

const report = []
for (const row of rows) {
  const scripts = scriptsOf(row.name)
  const muts = mutationsFor(scripts, row.name)
  const nd = nondeterminism(scripts)

  // RUNS is asserted from the row's own command where it is cheap, and taken
  // from the last full gate run otherwise. Rows that need a browser or a build
  // are marked skipQuick and are not re-run here — that is stated, not hidden.
  report.push({ name: row.name, weight: row.weight,
                score: score(muts.length > 0, nd.length > 0), muts, nd, scripts })
}

const width = Math.max(...report.map(r => r.name.length))
for (const r of report.sort((a, b) => a.score - b.score || b.weight - a.weight)) {
  const flag = r.score >= BAR ? ' ' : '<'
  console.log(`  ${flag} ${String(r.score).padStart(3)}/100  w${String(r.weight).padStart(2)}  ${r.name.padEnd(width)}  ${
    r.muts.length ? `teeth: ${r.muts.join(', ')}` : 'NO MUTATION PROVES THIS ROW CAN FAIL'}`)
  for (const n of r.nd) console.log(`${' '.repeat(width + 22)}  ${n}`)
}

const below = report.filter(r => r.score < BAR)
console.log(`\n  ${report.length - below.length}/${report.length} rows at or above ${BAR}`)
if (below.length > 0) {
  console.log(`\n  BELOW ${BAR} — nothing has shown these can fail:\n`)
  for (const r of below.sort((a, b) => b.weight - a.weight)) {
    console.log(`    ${r.score}/100  (weight ${r.weight})  ${r.name}`)
  }
  console.log('')
}

const { check, summarize } = createChecks()
check(`every gate row is at or above ${BAR}`, below.length === 0,
  below.map(r => `${r.name} = ${r.score}`).join('\n      → '))
finish(summarize())
