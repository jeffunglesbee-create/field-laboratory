#!/usr/bin/env node
// How much output `process.exit()` loses, at what size, and whether the repo's
// own checks are anywhere near it.
//
// Task 0 of docs/CC-CMD-2026-10-11-process-exit-drops-the-annotation.md, and it
// exists because the figure that document was filed on is not yet a measurement
// of this repository. That figure — "the ::error annotation was LOST 5 times in
// 30 runs" — came from ONE synthetic script printing 400 rows, which is far
// more output than any check here produces. A rate measured at a size nothing
// reaches is a rate about a different program.
//
// So this measures two things and prints them together, because either alone
// misleads:
//
//   THE LADDER   loss rate against output size, for both ways of ending a
//                process, head to head in the same environment and the same run.
//   THE CENSUS   how large this repository's own checks actually print.
//
// A reader who sees only the ladder concludes the bug is catastrophic. A reader
// who sees only the census concludes nothing is wrong. The pair is the finding.
//
// `process.exit()` terminates immediately and drops pending asynchronous stdout
// writes. To a terminal or a file Node's stdout writes are synchronous; to a
// PIPE they are not, and `execSync` and a CI log runner are both pipes.

import { writeFileSync, readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { execSync, spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createChecks, isMain } from './checks.mjs'

/** The last line every child prints. Its absence IS the truncation. */
export const MARKER = 'TAIL-MARKER-7f3a'

/**
 * A child that prints `bytes` of output, then the marker, then ends.
 *
 * `how` is the whole experiment: 'exit' calls `process.exit(code)` and
 * 'exitCode' sets `process.exitCode`. Everything else is identical, so a
 * difference between them is the difference between those two lines.
 */
export const childSource = (bytes, how) => {
  const line = 'x'.repeat(78)
  const n = Math.max(1, Math.ceil(bytes / 80))
  return [
    `for (let i = 0; i < ${n}; i++) console.log('${line}')`,
    `console.log('${MARKER}')`,
    how === 'exit' ? 'process.exit(1)' : 'process.exitCode = 1',
    '',
  ].join('\n')
}

/** Did this run keep its tail? */
export const kept = out => String(out).includes(MARKER)

/** A rate, printed so the denominator cannot be lost. Rule 91. */
export const rateLine = (label, lost, runs, bytes) =>
  `${label.padEnd(10)} ${String(bytes).padStart(7)} bytes  ` +
  `${String(lost).padStart(3)} lost of ${runs}  ` +
  `${((lost / runs) * 100).toFixed(1)}%`

// --- self-test ---------------------------------------------------------------

const IS_MAIN = isMain(import.meta.url)
const SELF_TEST = IS_MAIN && process.argv.includes('--self-test')

if (SELF_TEST) {
  const { check, summarize } = createChecks()

  // The two children differ in exactly one line, or the ladder is comparing two
  // unrelated programs and calling the difference a finding.
  const a = childSource(1000, 'exit').split('\n')
  const b = childSource(1000, 'exitCode').split('\n')
  check('the two children differ in exactly one line',
    a.length === b.length && a.filter((l, i) => l !== b[i]).length === 1,
    `${a.filter((l, i) => l !== b[i]).length} line(s) differ`)
  check('...and it is the ending', a[2] === 'process.exit(1)' && b[2] === 'process.exitCode = 1')

  // The source is a LOOP, so its line count does not scale with `bytes` — the
  // loop's bound does. Asserting the line count was the first version of this
  // check and it failed immediately, which is the only reason the distinction
  // is written down.
  const boundOf = src => Number(/i < (\d+)/.exec(src)?.[1] ?? -1)
  check('a bigger size raises the loop bound', boundOf(childSource(8000, 'exit')) > boundOf(childSource(1000, 'exit')),
    `${boundOf(childSource(1000, 'exit'))} -> ${boundOf(childSource(8000, 'exit'))}`)
  check('...roughly in proportion to the bytes asked for',
    Math.abs(boundOf(childSource(8000, 'exit')) / boundOf(childSource(1000, 'exit')) - 8) < 1,
    String(boundOf(childSource(8000, 'exit')) / boundOf(childSource(1000, 'exit'))))
  check('a zero size still prints the marker, so an empty run is not scored as lost',
    childSource(0, 'exit').includes(MARKER))

  check('an output carrying the marker counts as kept', kept(`a\n${MARKER}\nb`))
  check('AN OUTPUT WITHOUT IT DOES NOT', !kept('a\nb'))
  check('a truncated output is not kept', !kept('x'.repeat(5000)))

  check('the rate line carries its denominator',
    rateLine('exit', 3, 30, 9999).includes('of 30') && rateLine('exit', 3, 30, 9999).includes('9999'),
    rateLine('exit', 3, 30, 9999))
  check('0 of N reads as 0.0%, not as silence', rateLine('x', 0, 20, 10).includes('0.0%'))

  // Both children must really run and really exit 1 — a child that crashed
  // would produce no marker and be scored as truncation.
  const dir = mkdtempSync(join(tmpdir(), 'exit-probe-selftest-'))
  try {
    for (const how of ['exit', 'exitCode']) {
      const p = join(dir, `${how}.mjs`)
      writeFileSync(p, childSource(200, how))
      let out = '', code = 0
      try { out = execSync(`node ${p}`, { encoding: 'utf8' }) } catch (e) { out = e.stdout ?? ''; code = e.status }
      check(`a small ${how} child keeps its tail`, kept(out), JSON.stringify(out.slice(-60)))
      check(`...and still exits 1, so the gate does not go soft`, code === 1, `exit ${code}`)
    }
  } finally { rmSync(dir, { recursive: true, force: true }) }

  process.exit(summarize() === 0 ? 0 : 1)
}

// --- live --------------------------------------------------------------------

/** Byte sizes to walk. Chosen to bracket the repo's real range (0.3–4 KB) and
 *  the two sizes truncation was first seen at (13 KB and 27 KB). */
export const LADDER = [1_000, 2_000, 4_000, 8_000, 16_000, 32_000, 64_000]

/** The real programs measured, named rather than globbed: a glob would pick up
 *  a script that needs a browser or the network, and a timeout would read as a
 *  truncation. */
export const TARGETS = [
  // The compiled F# suite FIRST: it is the program that actually broke CI, it
  // is the largest thing this repository runs through a pipe, and it is the one
  // a bare loop of the same size does not stand in for.
  'build/VerifyMain.js',
  'scripts/check-doc-citations.mjs',
  'scripts/palette-check.mjs',
  'scripts/design-tokens-check.mjs',
  'scripts/typography-check.mjs',
  'scripts/sport-registry-check.mjs',
]

if (IS_MAIN && !SELF_TEST) {
  const runsArg = process.argv.indexOf('--runs')
  const RUNS = runsArg === -1 ? 15 : Number(process.argv[runsArg + 1])
  const dir = mkdtempSync(join(tmpdir(), 'exit-probe-'))
  const results = { runs: RUNS, ladder: [], scripts: [] }

  const piped = cmd => {
    try { return execSync(cmd, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 120_000 }) }
    catch (e) { return e.stdout ?? '' }
  }

  // Burners, so "under load" is a condition this probe creates rather than one
  // it hopes for. A CI runner is a shared, busy machine; this sandbox idle is
  // not, and the first version of this measurement concluded the bug was
  // unreachable because it only ever asked an idle machine.
  const withLoad = (n, fn) => {
    const burners = []
    for (let i = 0; i < n; i++) {
      burners.push(spawn('node',
        ['-e', 'const t=Date.now();while(Date.now()-t<600000){Math.sqrt(Math.random())}'],
        { stdio: 'ignore' }))
    }
    try { return fn() } finally { burners.forEach(b => b.kill()) }
  }

  try {
    console.log(`\n  THE LADDER — a bare loop, ${RUNS} runs at each size, through a pipe\n`)
    for (const bytes of LADDER) {
      const row = { bytes }
      for (const how of ['exit', 'exitCode']) {
        const p = join(dir, `${how}-${bytes}.mjs`)
        writeFileSync(p, childSource(bytes, how))
        let lost = 0
        for (let i = 0; i < RUNS; i++) if (!kept(piped(`node ${p}`))) lost += 1
        row[how] = lost
        console.log(`  ${rateLine(how, lost, RUNS, bytes)}`)
      }
      results.ladder.push(row)
    }

    // THE REAL PROGRAMS, which is the measurement that matters and the one the
    // ladder cannot stand in for.
    //
    // A bare loop writing 13 KB loses nothing even on a loaded machine. The
    // compiled F# suite, at the SAME 13 KB, lost 7 of 30 — because it also
    // loads thirty modules and reads four fixtures off disk, and the race is
    // between the last write draining and the process being told to die. Size
    // is a term in that, not the whole of it.
    //
    // THE MARKER IS READ FROM THE PROGRAM, NEVER ASSUMED. The first version of
    // this looked for "checks passed" and scored check-doc-citations.mjs at 25
    // of 25 — that script ends on a PASS line and never prints those words, so
    // a detector that could not match it reported total loss. Each program's
    // own last line is taken from a run redirected to a FILE, where Node's
    // stdout writes are synchronous and nothing can be lost.
    console.log(`\n  THE REAL PROGRAMS — ${RUNS} runs each, idle then under load\n`)
    for (const target of TARGETS) {
      const marker = join(dir, 'marker.txt')
      execSync(`node ${target} > ${marker} 2>/dev/null || true`, { shell: '/bin/bash' })
      const whole = readFileSync(marker, 'utf8')
      const lines = whole.trimEnd().split('\n')
      const last = lines[lines.length - 1]
      const bytes = Buffer.byteLength(whole)
      if (!last || bytes === 0) {
        console.log(`  ${target} — no output to measure, skipped`)
        results.scripts.push({ target, bytes, skipped: 'no output' })
        continue
      }
      const count = () => {
        let lost = 0
        for (let i = 0; i < RUNS; i++) if (!piped(`node ${target}`).includes(last)) lost += 1
        return lost
      }
      const idle = count()
      const loaded = withLoad(8, count)
      results.scripts.push({ target, bytes, marker: last, idle, loaded })
      console.log(`  ${String(bytes).padStart(6)}B  idle ${String(idle).padStart(3)}/${RUNS}  ` +
        `loaded ${String(loaded).padStart(3)}/${RUNS}   ${target}`)
    }
  } finally { rmSync(dir, { recursive: true, force: true }) }

  // THE VERDICT IS THE TWO READ TOGETHER, and it is computed rather than
  // asserted so a future run can disagree with this one.
  const anyReal = results.scripts.filter(s => !s.skipped)
  const lostReal = anyReal.filter(s => s.idle > 0 || s.loaded > 0)
  const firstLadderLoss = results.ladder.find(r => r.exit > 0)
  results.verdict = {
    realProgramsMeasured: anyReal.length,
    realProgramsLosingATail: lostReal.length,
    namesLosing: lostReal.map(s => s.target),
    ladderFirstLossBytes: firstLadderLoss ? firstLadderLoss.bytes : null,
    largestRealBytes: anyReal.length ? Math.max(...anyReal.map(s => s.bytes)) : null,
  }
  console.log('')
  console.log(`  real programs measured: ${results.verdict.realProgramsMeasured}`)
  console.log(`  real programs that lost a tail: ${results.verdict.realProgramsLosingATail}` +
    (lostReal.length ? ` — ${lostReal.map(s => s.target).join(', ')}` : ''))
  console.log(`  bare-loop ladder first lost at: ` +
    `${firstLadderLoss ? firstLadderLoss.bytes + ' bytes' : 'no size on this ladder'}`)
  console.log(`  largest real program measured: ${results.verdict.largestRealBytes} bytes`)
  console.log(`\n  COVERAGE: ${anyReal.length} program(s), not the repository's ${TARGETS.length} named`)
  console.log(`  targets or its full script set. A program absent here is unmeasured, not clean.\n`)

  writeFileSync('outbox/exit-truncation-probe-latest.json', JSON.stringify(results, null, 1) + '\n')
  console.log(`  wrote outbox/exit-truncation-probe-latest.json\n`)
}
