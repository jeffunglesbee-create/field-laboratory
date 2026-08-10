// The confidence gate, mechanised.
//
// FIELD's CC-CMD ceremony ends "Do not commit unless confidence >= 95. If score
// < 95, report verbatim and stop." Every CC-CMD in this repo carries a scoring
// rubric. The 2026-08-10 session shipped five commits and scored none of them,
// because the work arrived as direct requests rather than as a dispatched
// CC-CMD, so no rubric was ever defined. An overstated claim reached main as a
// direct result.
//
// The failure mode is not that someone scored dishonestly. It is that a
// self-reported number is not evidence of anything: a model asked to score its
// own work will produce a number, and the number is free. So this rubric is not
// a form to fill in — every row runs a real command and takes its score from
// the exit code. The total cannot be asserted, only earned.
//
// Usage:  node scripts/confidence.mjs [--quick]
//         --quick skips the rows that need a browser or the .NET build.

import { execSync, spawn } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'

const QUICK = process.argv.includes('--quick')
const BAR = 95

const ok = cmd => {
  try {
    execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' })
    return true
  } catch {
    return false
  }
}

/** Passes when the command FAILS — for asserting a guard still has teeth. */
const fails = cmd => !ok(cmd)

/** An outbox entry dated today, so a session cannot skip its own write-up. */
const outboxToday = () => {
  const today = new Date().toISOString().slice(0, 10)
  const entries = readdirSync('outbox').filter(f => f.startsWith(`cc-session-${today}`))
  // Length floor because an empty stub would otherwise satisfy the check.
  return entries.some(f => readFileSync(`outbox/${f}`, 'utf8').length > 1500)
}

const rows = [
  { name: 'build is clean, zero F#/NuGet warnings', weight: 10, skipQuick: true,
    run: () => ok('npm run build') &&
      !/warning (FS|NU)\d+/.test(
        execSync('dotnet build src/Laboratory.fsproj --no-restore', { encoding: 'utf8' })) },

  { name: 'decoders accept both real captures', weight: 10,
    run: () => ok('node scripts/drift-check.mjs --file data/context-2026-05-15.json') &&
               ok('node scripts/drift-check.mjs --file data/games-2026-08-09.json') },

  { name: 'decoders still REJECT the corrupted fixture', weight: 10,
    run: () => fails('node scripts/drift-check.mjs --file test/malformed-nested.json') },

  { name: 'render checks pass on both captures', weight: 20, skipQuick: true,
    run: () => ok('npm run check') && ok('npm run check:hard') },

  { name: 'grouping and date navigation pass', weight: 15, skipQuick: true,
    run: () => ok('npm run check:nav') },

  // The heaviest row, because this is the one that failed. Every claimed
  // compiler rejection in the proof doc is compiled for real.
  { name: 'doc claims are compiler-verified, not prose', weight: 25, skipQuick: true,
    run: () => ok('node scripts/proof-check.mjs') },

  { name: 'this session wrote its outbox', weight: 10, run: outboxToday },
]

// Render rows need a server. Start one only if nothing is listening, and only
// when those rows are actually going to run.
let server = null
const needsServer = !QUICK
if (needsServer && !ok('curl -sf -o /dev/null http://localhost:8080/')) {
  server = spawn('node', ['scripts/serve.mjs'], { stdio: 'ignore', detached: true })
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline && !ok('curl -sf -o /dev/null http://localhost:8080/')) {
    execSync('sleep 1')
  }
}

let earned = 0
let possible = 0
const results = []
for (const row of rows) {
  if (QUICK && row.skipQuick) {
    results.push({ ...row, state: 'SKIP' })
    continue
  }
  possible += row.weight
  let passed = false
  try { passed = row.run() } catch { passed = false }
  if (passed) earned += row.weight
  results.push({ ...row, state: passed ? 'PASS' : 'FAIL' })
}

if (server) process.kill(-server.pid)

const width = Math.max(...rows.map(r => r.name.length))
console.log('\nConfidence gate\n')
for (const r of results) {
  const score = r.state === 'SKIP' ? '  —' : `${r.state === 'PASS' ? r.weight : 0}`.padStart(3)
  console.log(`  ${r.state.padEnd(4)} ${score}/${String(r.weight).padEnd(3)} ${r.name.padEnd(width)}`)
}

const total = possible === 0 ? 0 : Math.round((earned / possible) * 100)
console.log(`\n  ${earned}/${possible} points = ${total}/100   (bar: ${BAR})`)

if (QUICK) {
  console.log('\n  --quick: browser and build rows skipped. NOT a gate result.\n')
  process.exit(0)
}

if (total < BAR) {
  console.log(`\n  BELOW THE BAR. Do not commit. Report the failing rows verbatim.\n`)
  process.exit(1)
}
console.log('\n  Gate passed.\n')
