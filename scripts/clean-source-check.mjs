// No source file carries a harness's injected code.
//
// WHAT HAPPENED
//
// `proof-check.mjs` proves its claims by INJECTING code into a real source file
// and requiring the build to fail. It is careful about cleaning up: it keeps a
// backup, and restores on `exit` (it registers no signal handler, on purpose: see the comment above its exit handler).
//
// On 2026-08-15 a foreground 2-minute timeout killed it mid-run anyway, leaving
//
//     let private __proof23 (g: Game) = ...
//
// in `src/Scoreboard.fs`. A later `git add -A` committed it, and it reached
// main in `217282b`.
//
// WHY NOTHING CAUGHT IT
//
// That injection COMPILED. It passed the build, it passed "fail on any F#
// compiler warning", and it passed fifteen further verify steps. The only thing
// that noticed was proof-check's own marker guard — at step 17, ninety seconds
// into a forty-minute job, and by then it could only refuse to run: its backup
// lived in `tmpdir()` (it has lived in `.proof-state/` since 2026-09-07, see the
// history comment in proof-check.mjs), so on a fresh CI runner the backup could
// never exist and repair was impossible by construction. That is still the CI
// case: `.proof-state/` is gitignored, so a runner never has it.
//
// So the gap was never the signal handling. It was that a stranded injection is
// SILENT everywhere except the one place that cannot fix it.
//
// This check is the cheap, early, always-runnable half: no build, no browser,
// no network — a scan that fails in milliseconds and names the file. It runs
// first in `verify` so a mutated tree costs seconds instead of a job.
//
// It deliberately does NOT try to repair. Repair is proof-check's business and
// it needs the backup; this only has to make the state impossible to miss.
//
// WHAT IT TELLS THE READER TO DO depends on whether proof-check has a run state
// to work from, because the two cases have different remedies and `git checkout`
// is the right answer to neither. It restores a file to the INDEX: that throws
// away every uncommitted edit to the file, and when the injection is already
// committed (217282b) it changes nothing at all. Measured 2026-11-05 in a scratch
// repository: with the injection uncommitted `git diff -- file` printed 8 lines
// and the checkout removed it; with it committed `git diff -- file` printed 0
// lines and the marker was still there after the checkout.
//
//   state present   proof-check restores the file that still carries its own
//                   injection and refuses otherwise: name it, and the directory.
//   state absent    proof-check refuses and writes nothing (a runner, a pulled
//                   commit): the lines have to be deleted by hand; say how to find
//                   them, and say what the checkout costs.
//
// `--self-test` runs this file as a child process over fixture directories, once
// per case, so it asserts the text a reader actually sees.

import { readFileSync, readdirSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { createChecks, finish } from './checks.mjs'

const { check, summarize } = createChecks()

// The exact string proof-check writes. Imported by eye rather than by import,
// because this check must keep working if proof-check is the thing that broke.
// Asserted against proof-check's own source below so the two cannot drift.
const MARKER = 'let private __proof'

// proof-check's run state: the directory, and the file in it that makes a run one it can heal.
// Without `active.json` it treats the tree as having no state (measured 2026-11-05: a
// `.proof-state/` holding only `restore-pending`, over an injected file, gave "no run state
// exists" and wrote nothing). Kept by eye and asserted against its source below, like MARKER.
const STATE_DIR = '.proof-state'
const ACTIVE = 'active.json'
const ACTIVE_FILE = join(STATE_DIR, ACTIVE)

const SRC = 'src'

if (process.argv.includes('--self-test')) {
  selfTest()
} else {
  const sources = readdirSync(SRC).filter(f => f.endsWith('.fs'))

  check('there are F# sources to scan',
    sources.length > 0,
    `${sources.length} file(s) in ${SRC}/`)

  // If proof-check renames its injection, this check would silently scan for a
  // string nobody writes and pass on every mutated tree — vacuously green, which
  // is the failure shape this repo keeps finding. So the marker is verified
  // against the harness that produces it.
  const harness = readFileSync('scripts/proof-check.mjs', 'utf8')
  check('the marker this scans for is the one proof-check injects',
    harness.includes(`const MARKER = '${MARKER}'`),
    `looking for ${JSON.stringify(MARKER)} in scripts/proof-check.mjs`)

  // The same for the run state the remedy below branches on: if proof-check moved it, the
  // remedy would say "no state" over a directory that is there, and advise deleting lines
  // the heal would have restored.
  check('the run state this reads is the one proof-check keeps',
    harness.includes(`const STATE_DIR = '${STATE_DIR}'`) && harness.includes(`const MARKER_FILE = join(STATE_DIR, '${ACTIVE}')`),
    `looking for the constants STATE_DIR = ${JSON.stringify(STATE_DIR)} and MARKER_FILE = join(STATE_DIR, ${JSON.stringify(ACTIVE)}) in scripts/proof-check.mjs`)

  const dirty = sources.filter(f => readFileSync(join(SRC, f), 'utf8').includes(MARKER))
  const paths = dirty.map(f => join(SRC, f)).join(' ')
  // The remedy is one line (it is also a GitHub annotation) and depends on whether proof-check has the state it needs.
  const remedy = existsSync(ACTIVE_FILE)
    ? `a proof-check run left this. Run \`node scripts/proof-check.mjs\`: it puts a file back only when that file is exactly its backup plus the injection (edits made before that run are kept), ` +
      `and refuses, writing nothing, when the file has moved on since or that run is still going; after a restore it goes on to run the proofs. The backups are in ${STATE_DIR}/; do not delete it`
    : `${ACTIVE_FILE} does not exist, so \`node scripts/proof-check.mjs\` has nothing to restore from and refuses. Delete the injected block (each "${MARKER}N" header and the indented lines under it; \`grep -n "${MARKER}" ${paths}\` finds them). ` +
      `If the injection is uncommitted, \`git checkout -- ${paths}\` also removes it but discards every uncommitted edit to the file`

  check('no source file carries injected proof code',
    dirty.length === 0,
    dirty.length
      ? `${dirty.join(', ')} — ${remedy}`
      : `${sources.length} file(s) clean`)

  finish(summarize())
}

// The real script, run as a child over fixture directories: it reads `src/` and
// `scripts/proof-check.mjs` relative to its working directory, and nothing else of the
// repository, so each fixture is a temp directory holding just those. `GITHUB_ACTIONS` is
// cleared so the output is the log a person reads, not the annotations a runner adds.
//
// Not `process.exit(summarize())` here: check-exit-drains counts those against a budget, and
// `finish` sets the status without cutting the output short.
function selfTest () {
  const here = fileURLToPath(import.meta.url)
  const dirs = []
  // What proof-check's source has to say for the scan to accept it. Built from this file's own constants, so a fixture that drifts changes exactly one of them.
  const harnessOf = ({ marker = MARKER, stateDir = STATE_DIR, active = ACTIVE } = {}) =>
    `const STATE_DIR = '${stateDir}'\nconst MARKER_FILE = join(STATE_DIR, '${active}')\nconst MARKER = '${marker}'\n`
  const run = ({ files, state = null, harness = harnessOf() }) => {
    const dir = mkdtempSync(join(tmpdir(), 'clean-source-'))
    dirs.push(dir)
    mkdirSync(join(dir, SRC)); mkdirSync(join(dir, 'scripts'))
    writeFileSync(join(dir, 'scripts', 'proof-check.mjs'), harness)
    for (const [f, text] of Object.entries(files)) writeFileSync(join(dir, SRC, f), text)
    // state: null = no directory; a file name = a directory holding just that file.
    if (state !== null) { mkdirSync(join(dir, STATE_DIR)); writeFileSync(join(dir, STATE_DIR, state), '{}') }
    const r = spawnSync(process.execPath, [here], { cwd: dir, encoding: 'utf8', env: { ...process.env, GITHUB_ACTIONS: '' }, timeout: 30000 })
    const out = `${r.stdout}${r.stderr}`
    // What a failure prints: the exit status and the FAIL lines with their detail, not the child's whole output.
    const verdict = `exit ${r.status}: ${out.split('\n').filter(l => /^FAIL|^ {6}→ /.test(l)).join(' | ') || 'no FAIL line'}`
    return { status: r.status, out, verdict }
  }
  try {
    const injected = { 'A.fs': 'let a = 1\n', 'B.fs': `let b = 2\n${MARKER}23 (g: int) = 1\n` }
    const clean = run({ files: { 'A.fs': 'let a = 1\n' } })
    const noState = run({ files: injected })
    const withState = run({ files: injected, state: ACTIVE })
    const strayState = run({ files: injected, state: 'restore-pending' })
    const markerDrift = run({ files: injected, harness: harnessOf({ marker: 'let private __renamed' }) })
    const stateDirDrift = run({ files: injected, harness: harnessOf({ stateDir: '.proof-run' }) })
    const stateFileDrift = run({ files: injected, harness: harnessOf({ active: 'marker.json' }) })
    const empty = run({ files: {} })
    const FAILS = /FAIL  no source file carries injected proof code/

    // Coverage (Rule 91): 8 fixtures, each the real script in a directory of its own: clean, injected with no state, with active.json, with a state directory that holds no active.json,
    // a renamed marker, a renamed state directory, a renamed state file, and no sources.
    check('a clean tree passes all 4 checks (fixture: one clean file)',
      clean.status === 0 && /4\/4 checks passed/.test(clean.out), clean.verdict)
    check('an injected file fails, and is the one named (fixtures: src/A.fs clean, src/B.fs injected)',
      noState.status === 1 && FAILS.test(noState.out) && /→ B\.fs — /.test(noState.out) && !/A\.fs/.test(noState.out), noState.verdict)
    check('WITH a run state (.proof-state/active.json), the remedy is proof-check, and it says to keep the state directory',
      withState.status === 1 && /node scripts\/proof-check\.mjs/.test(withState.out) && /backups are in \.proof-state\/; do not delete it/.test(withState.out), withState.verdict)
    check('WITH a run state, no checkout is recommended',
      withState.status === 1 && FAILS.test(withState.out) && !/git checkout/.test(withState.out), withState.verdict)
    check('WITH a run state, it says what proof-check does when the file has moved on, or the run is still going',
      /refuses, writing nothing, when the file has moved on since or that run is still going/.test(withState.out), withState.verdict)
    check('WITHOUT a run state, it says proof-check has nothing to restore from, and how to find the lines',
      noState.status === 1 && /\.proof-state\/active\.json does not exist, so \`node scripts\/proof-check\.mjs\` has nothing to restore from and refuses/.test(noState.out)
        && /grep -n "let private __proof" src\/B\.fs/.test(noState.out), noState.verdict)
    check('WITHOUT a run state, a checkout is named only for an uncommitted injection, with its cost',
      /If the injection is uncommitted, \`git checkout -- src\/B\.fs\` also removes it but discards every uncommitted edit to the file/.test(noState.out), noState.verdict)
    check('a .proof-state/ that holds no active.json counts as no run state, as it does to proof-check',
      strayState.status === 1 && /does not exist, so \`node scripts\/proof-check\.mjs\` has nothing to restore from/.test(strayState.out) && !/backups are in/.test(strayState.out), strayState.verdict)
    check('a marker that proof-check no longer writes fails the scan, so it cannot pass vacuously',
      markerDrift.status === 1 && /FAIL  the marker this scans for is the one proof-check injects/.test(markerDrift.out), markerDrift.verdict)
    check('a run state that proof-check keeps elsewhere fails the scan: a renamed directory, and a renamed file',
      stateDirDrift.status === 1 && /FAIL  the run state this reads is the one proof-check keeps/.test(stateDirDrift.out)
        && stateFileDrift.status === 1 && /FAIL  the run state this reads is the one proof-check keeps/.test(stateFileDrift.out), `${stateDirDrift.verdict} // ${stateFileDrift.verdict}`)
    check('no F# sources at all fails',
      empty.status === 1 && /FAIL  there are F# sources to scan/.test(empty.out), empty.verdict)
  } finally {
    for (const d of dirs) rmSync(d, { recursive: true, force: true })
  }
  finish(summarize())
}
