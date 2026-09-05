// The confidence gate, mechanised.
//
// IT IS A CONJUNCTION, NOT AN AVERAGE. Every row must pass. The percentage is
// reported because the CC-CMD ceremony asks for a number, and it decides
// nothing.
//
// It was an average until 2026-08-10, and that was a real hole that grew
// quietly. Scoring `earned / possible` means a failing row is affordable when
// enough other rows pass, and every row ADDED makes the next failure cheaper:
//
//     the same 10-point row failing, at different suite sizes
//     120 pts -> 92   blocked
//     140 pts -> 93   blocked
//     165 pts -> 94   blocked
//     190 pts -> 95   PASSES
//     225 pts -> 96   PASSES
//
// At 225 points, TEN of seventeen rows could fail alone and still clear 95 —
// including "build is clean", "decoders still REJECT the corrupted fixture",
// and both outbox rows. The gate crossed that line today, while being extended,
// and no commit introduced it. Growing the suite weakened it.
//
// That is the session's recurring failure in its purest form: correct about
// every row, wrong about how they combine. An average lets a passing majority
// vote a real defect through, and none of these rows is a matter of degree —
// each is an invariant that holds or does not.
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
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, appendFileSync } from 'node:fs'
import { readInventory, diffAgainst, INVENTORY_PATH } from './gate-inventory.mjs'
import { rows, ok, failures } from './gate-checks.mjs'

const QUICK = process.argv.includes('--quick')
const BAR = 95

// Where a run's measured result is written, so an outbox entry can cite it
// instead of asserting a number.
//
// The comment forty lines up already says why: "a self-reported number is not
// evidence of anything: a model asked to score its own work will produce a
// number, and the number is free." That was written about the ROWS, and the
// rows obey it. The SCORE then left this process as console output and was
// re-typed into markdown by hand, where it became free again.
//
// On 2026-08-17 four outbox entries carried scores — 85, 95, 95, 100 — and not
// one of them came from a gate run. Two were 95 with the missing five points
// described as "the runner has not confirmed yet", which is not a confidence
// measurement at all; it is an unfinished task, priced at exactly the distance
// to the bar.
//
// Append-only, and a full log rather than a latest-value file, because an entry
// written last week cites the run that backed it and must keep matching after
// the gate runs again.
const RECORD_PATH = 'docs/confidence-log.jsonl'


// The denominator is `possible`, summed from the rows above — which means the
// rows above can move it. Deleting a failing row raises the score: measured at
// 86/100 with a failing row present and 100/100 with it removed. So the row set
// is declared in docs/gate-rows.txt and compared before anything is scored.
// This is a hard stop, not a row, because a row could be deleted alongside the
// thing it was meant to catch.
const inventoryProblems = diffAgainst(readInventory(), rows)
if (inventoryProblems.length > 0) {
  console.log(`\nThe gate does not match ${INVENTORY_PATH}:\n`)
  for (const p of inventoryProblems) console.log(`  ${p}`)
  console.log('\n  Refusing to score. Change both files, or change neither.\n')
  process.exit(2)
}

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

// EACH ROW PRINTS AS IT FINISHES, with its duration.
//
// Run 12 on 2026-09-05 was killed by the job timeout after 36m52s and the log
// said nothing at all: this file prints its table only at the end, so a run that
// does not reach the end reports neither a score nor the row it died on. The
// timeout was the one thing that could not be diagnosed from its own output.
//
// A line per row fixes that without changing the verdict. A killed run now shows
// exactly which rows completed and which one was in flight, and a slow row is
// visible while it is still happening rather than inferred afterwards from a
// wall-clock total.
let earned = 0
let possible = 0
const results = []
const startedAll = Date.now()
for (const row of rows) {
  if (QUICK && row.skipQuick) {
    results.push({ ...row, state: 'SKIP' })
    continue
  }
  possible += row.weight
  const started = Date.now()
  let passed = false
  try { passed = row.run() } catch { passed = false }
  const seconds = Math.round((Date.now() - started) / 1000)
  if (passed) earned += row.weight
  results.push({ ...row, state: passed ? 'PASS' : 'FAIL', seconds })
  console.log(`  [${String(seconds).padStart(4)}s] ${passed ? 'PASS' : 'FAIL'}  ${row.name}`)
}
const totalSeconds = Math.round((Date.now() - startedAll) / 1000)

if (server) process.kill(-server.pid)

const width = Math.max(...rows.map(r => r.name.length))
console.log('\nConfidence gate\n')
for (const r of results) {
  const score = r.state === 'SKIP' ? '  —' : `${r.state === 'PASS' ? r.weight : 0}`.padStart(3)
  console.log(`  ${r.state.padEnd(4)} ${score}/${String(r.weight).padEnd(3)} ${r.name.padEnd(width)}`)
}

const total = possible === 0 ? 0 : Math.round((earned / possible) * 100)
console.log(`\n  ${earned}/${possible} points = ${total}/100   (bar: ${BAR})   ${totalSeconds}s`)

// Recorded BEFORE the exit branches below, so a FAILING run is written down
// too. A record that only ever captures passes is a record that cannot be used
// to refuse a claim, which is the one thing it is for.
const gitOut = cmd => {
  try { return execSync(cmd, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }) } catch { return '' }
}
const runSha = gitOut('git rev-parse HEAD').trim() || null

// THE SHA IS NOT THE RUN.
//
// The first two records written by this file both said `1264e6f` — one scoring
// 91 with three failing rows, one scoring 100 — because HEAD was unchanged
// while the WORKING TREE was fixed between them. `git rev-parse HEAD` says
// nothing about uncommitted work, and the gate scores the tree, not the commit.
//
// That made a citation ambiguous, and `confidence-record-check.mjs` keyed its
// lookup by sha, so the LAST record for a sha won. A failing run followed by a
// passing run on the same sha resolved silently to the passing one: the exact
// `tail -1` bypass that check was written to refuse, rebuilt inside it.
//
// So the identity of a run is HEAD plus a digest of everything not in HEAD.
const dirt = gitOut('git status --porcelain') + gitOut('git diff HEAD')
const treeDigest = createHash('sha256').update(dirt).digest('hex')
const runId = `${(runSha ?? 'nohead').slice(0, 12)}-${treeDigest.slice(0, 12)}`

appendFileSync(RECORD_PATH, JSON.stringify({
  id: runId,
  sha: runSha,
  // Whether the scored tree was the committed one. A clean run is the only kind
  // whose sha alone describes what was measured.
  dirty: dirt.length > 0,
  mode: QUICK ? 'quick' : 'full',
  earned,
  possible,
  total,
  // Durations, so "the gate got slower" becomes a question with an answer.
  //
  // A short-circuiting check made a RED run cheaper than a green one for twelve
  // days (see mutation-check.mjs), and the only symptom was the suite finishing
  // sooner — which nothing recorded and nobody watches for. Per-row seconds turn
  // both directions into something a later run can diff.
  seconds: totalSeconds,
  rowSeconds: Object.fromEntries(
    results.filter(r => r.state !== 'SKIP').map(r => [r.name, r.seconds])),
  // Names, not a count. `confidence-record-check.mjs` refuses a passing claim
  // when this is non-empty, and a count could not say which invariant was off.
  failing: results.filter(r => r.state === 'FAIL').map(r => r.name),
  skipped: results.filter(r => r.state === 'SKIP').map(r => r.name),
}) + '\n')
console.log(`  recorded in ${RECORD_PATH} as run ${runId}${dirt.length > 0 ? " (tree dirty)" : ""}`)

if (QUICK) {
  // Quick mode cannot report a PASS — it skipped rows. It can and must report a
  // FAILURE, because a row that actually ran and failed is a real failure
  // whatever else was skipped. It used to exit 0 regardless, which made it a
  // check that could only ever deliver good news.
  const quickFailures = results.filter(r => r.state === 'FAIL')
  console.log('\n  --quick: browser and build rows skipped. This is NOT a pass.')
  if (quickFailures.length > 0) {
    console.log(`\n  ${quickFailures.length} row(s) ran and FAILED:\n`)
    for (const r of quickFailures) console.log(`    - ${r.name}`)
    console.log('')
    process.exit(1)
  }
  console.log('  No failures among the rows that ran.\n')
  process.exit(0)
}

const failedRows = results.filter(r => r.state === 'FAIL')

// The conjunction. Stated before the score so nobody reads the number first.
if (failedRows.length > 0) {
  console.log(`\n  ${failedRows.length} FAILING ROW(S). Do not commit.\n`)
  for (const r of failedRows) console.log(`    - ${r.name} (${r.weight} pts)`)

  // WHY, not just WHICH. Without this a fourteen-minute row failed on 906bdef
  // and reported nothing but its own name, which is a shrug rather than a
  // signal — see the note above `ok` in gate-checks.mjs.
  if (failures.length) {
    console.log('\n  What the failing command(s) said:\n')
    for (const f of failures) {
      console.log(`    $ ${f.cmd}`)
      if (f.silent) console.log('      (no output at all — the command failed silently)')
      for (const line of f.why) console.log(`      ${line}`)
      console.log('')
    }
  }
  console.log(`\n  The score above is ${total}/100 and is NOT the pass condition —`)
  console.log(`  every row must pass. Report the failing rows verbatim.\n`)
  process.exit(1)
}

// Unreachable while the conjunction holds, since every row passing scores 100.
// Kept so that a future scoring change cannot quietly lower the bar without
// this line objecting.
if (total < BAR) {
  console.log(`\n  Every row passed but the score is ${total}, below ${BAR}.`)
  console.log(`  The scoring has changed shape — fix that before trusting this run.\n`)
  process.exit(1)
}

console.log('\n  Gate passed — every row, not a passing average.\n')
