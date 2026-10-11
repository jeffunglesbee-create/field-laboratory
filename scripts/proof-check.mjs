// Compiles the violations that docs/AMNESTY-PROOF.md claims are rejected, and
// asserts the compiler really does reject each one with the stated error.
//
// WHY THIS EXISTS
//
// The amnesty gate shipped with a proof doc claiming `formatDramaPeak` was "the
// only path from a drama score to a string in the entire program." It was not:
// DramaArc was still `Nested<int list>`, so the arc's raw score series could be
// rendered on a live card, straight past a gate the doc said was closed.
//
// Every check in the repo was green through all of it — 40 assertions, none of
// which touch arc values, because nothing in the repo renders them. The claim
// was prose, and prose is not executable, so nothing could contradict it.
//
// A proof document that no one runs is a design document. This turns each
// claimed compiler rejection into a real compile, so the doc cannot drift ahead
// of the code: weaken the gate and the doc's own claims start failing.
//
// HOW IT WORKS
//
// Each proof case in the doc is marked with `<!-- proof: FSxxxx -->` followed by
// an ```fsharp block holding a complete expression body. The body is wrapped in
// a function, injected into a real source file, and compiled. The case passes
// only if the build fails AND the stated error code appears.

import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync, rmSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { createChecks, finish } from './checks.mjs'

import { readdirSync } from 'node:fs'

// Every *-PROOF.md in docs/. A new proof document is picked up automatically
// rather than needing this script edited — the failure being guarded against is
// a claim that no one checks, and requiring registration would recreate it.
const DOCS = () => readdirSync('docs').filter(f => f.endsWith('-PROOF.md')).sort()
const TARGET = 'src/Scoreboard.fs'
// The Sport union lives here, and the registry-completeness phase mutates it.
const REGISTRY = 'src/Desk.fs'
// DURABLE, IN-REPO, GITIGNORED — and it took two incidents to get here.
//
// v1 kept the backup at `src/Scoreboard.fs.proofbak`. Killing the run mid-compile
// left BOTH a broken tracked source file and an untracked `.proofbak` sitting in
// src/, so the fix was to move it out of the repo entirely.
//
// v2 put it in `tmpdir()`, and that is the version this repo's own workflow
// comment indicts. On 2026-08-15 a foreground timeout killed a run and
// `let private __proof23` was COMMITTED to src/Scoreboard.fs in 217282b. The
// injection compiled, passed the F#-warnings gate and fifteen further steps; the
// only thing that noticed was the marker guard below, ninety seconds in — and by
// then it could only refuse, because on a fresh runner tmpdir holds nothing. A
// stranded injection was silent everywhere except the one place that could not
// fix it.
//
// `mutation-check.mjs` had already reached the same conclusion and written it
// down: a container restart wipes tmpdir, so "the tree kept the mutation, the
// backup was gone, and nothing anywhere recorded that either thing had
// happened." This file did not get the same treatment, and on 2026-09-07 it
// cost again — see `livenessOf` below.
//
// So: in-repo, gitignored, and a marker naming what is applied right now.
// The instant this run started. Captured ONCE into a top-level constant, which
// is the shape `row-confidence.mjs` enforces and `gameStateAt` already follows:
// a script that reads the clock where the value is used can straddle midnight
// between two lines. Written into the marker so a later reader can see how long
// a stranded run has been stranded.
const STARTED_AT = new Date()

const STATE_DIR = '.proof-state'
const MARKER_FILE = join(STATE_DIR, 'active.json')
const BACKUP = join(STATE_DIR, 'Scoreboard.fs.bak')
const MARKER = 'let private __proof'
// Any top-level `let` in the target works as an anchor; this one is stable and
// sits below every type the proof cases reference.
const ANCHOR = 'let private dramaText (g: Game) (state: GameState) ='

const build = () => {
  try {
    return execSync('dotnet build src/Laboratory.fsproj --no-restore -clp:NoSummary', {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (e) {
    // A failed build is the expected outcome for a proof case, not an error.
    return `${e.stdout || ''}${e.stderr || ''}`
  }
}

/** Extracts `<!-- proof: FSxxxx -->` + the following fsharp block. */
const parseCases = doc => {
  const cases = []
  const re = /<!--\s*proof:\s*(FS\d+)\s*-->\s*\n+```fsharp\n([\s\S]*?)```/g
  let m
  while ((m = re.exec(doc)) !== null) cases.push({ code: m[1], body: m[2].trimEnd() })
  return cases
}

// `--only <substring>` restricts the run to proof docs whose filename matches.
//
// ADDED 2026-09-05, from a defect rather than a wish. Verifying five new cases
// in docs/CHECK-PROOF.md meant a full run — one `dotnet build` per case, and in
// a sandbox whose clock only advances while a turn is live it did not finish at
// all. So a parallel five-case harness got written instead, and it immediately
// reproduced a defect THIS FILE had already solved: it read a `src/Scoreboard.fs`
// that a killed run had left injected, printed `baseline clean: false`, and ran
// anyway. Every case then "failed to build" partly for reasons that had nothing
// to do with it, and the run reported 5/5.
//
// The baseline guard below is what makes that impossible here. A subset run has
// to keep it, which means the subset belongs in this file rather than beside it.
// The coverage line printed with the result is Rule 91: a filtered run states
// its denominator where the result is read, so nobody infers a full pass from a
// green partial one.
const ONLY = process.argv.includes('--only')
  ? process.argv[process.argv.indexOf('--only') + 1]
  : null
const allDocs = DOCS()
const selectedDocs = ONLY ? allDocs.filter(f => f.includes(ONLY)) : allDocs
const cases = selectedDocs.flatMap(f =>
  parseCases(readFileSync(`docs/${f}`, 'utf8')).map(c => ({ ...c, doc: f })))
if (ONLY) {
  const total = allDocs.flatMap(f => parseCases(readFileSync(`docs/${f}`, 'utf8'))).length
  console.log(`--only ${JSON.stringify(ONLY)}: ${cases.length} of ${total} case(s), `
    + `${selectedDocs.length} of ${allDocs.length} doc(s) — THIS IS A SUBSET.`)
  if (selectedDocs.length === 0) {
    console.log(`  No proof doc matches. Available: ${allDocs.join(', ')}`)
  }
}
const { check, summarize } = createChecks()

/**
 * Is a recorded pid a process that still exists?
 *
 * `process.kill(pid, 0)` sends no signal; it only asks. ESRCH means gone, EPERM
 * means alive and owned by somebody else — which is still alive, and answering
 * "dead" to EPERM would be the same class of wrong answer this file keeps
 * having to fix.
 */
const isAlive = pid => {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return e.code === 'EPERM'
  }
}

/**
 * What to do about the state on disk, as a value rather than as control flow.
 *
 * THREE OUTCOMES, AND THE THIRD IS THE ONE THAT COST A SESSION. On 2026-09-07
 * the confidence gate was killed to unblock a commit; killing the parent left
 * this script orphaned and STILL RUNNING, and src/Scoreboard.fs re-acquired its
 * injection after three separate `git checkout --` restores. The compile error
 * moved line by line each time, which is what finally identified it as live
 * rather than stale. A repair path alone cannot help there: healing a file a
 * live run is about to overwrite is a race, not a fix.
 *
 * So the marker records a PID, and a marker whose process is still alive is a
 * REFUSAL rather than a repair. That is the answer the last incident needed, and
 * it is not one a backup can give.
 *
 * Pure, so the self-test can exercise all three without a dotnet build in sight.
 */
const classifyState = ({ markerExists, pid, selfPid, alive }) => {
  if (!markerExists) return 'proceed'
  if (pid === selfPid) return 'proceed'
  return alive ? 'refuse' : 'heal'
}

// --- self-test ---------------------------------------------------------------
//
// The state machine only. Everything below it needs a real compiler and minutes
// of wall clock; this is the half that decides whether a killed run corrupts the
// tree, and it is cheap enough to run before every real run.
if (process.argv.includes('--self-test')) {
  const { check: sc, summarize: ss } = createChecks()
  const st = (markerExists, pid, alive) =>
    classifyState({ markerExists, pid, selfPid: 4242, alive })

  sc('no marker means proceed', st(false, null, false) === 'proceed',
    `got ${st(false, null, false)}`)
  sc('A MARKER WHOSE PROCESS IS STILL ALIVE REFUSES, it does not repair',
    st(true, 99, true) === 'refuse',
    `got ${st(true, 99, true)} — healing a file a live run is about to rewrite `
    + 'is a race; this is the outcome the 2026-09-07 incident needed')
  sc('a marker whose process is gone heals', st(true, 99, false) === 'heal',
    `got ${st(true, 99, false)}`)
  sc('our own marker is not somebody else\'s run', st(true, 4242, true) === 'proceed',
    `got ${st(true, 4242, true)}`)

  // liveness, against real pids rather than a stub — the one fact this file
  // cannot get wrong without the refusal above being decorative.
  sc('this process reads as alive', isAlive(process.pid), `pid ${process.pid}`)
  sc('a pid that cannot exist reads as dead', !isAlive(2 ** 30), 'pid 2^30')
  sc('a malformed pid reads as dead', !isAlive(null) && !isAlive(0) && !isAlive(-1),
    'null, 0 and -1 must not be treated as running processes')

  process.exit(ss())
}

// Repair before doing anything else, so a previous interrupted run cannot make
// this one report against an injected tree.
const injectedNow = readFileSync(TARGET, 'utf8').includes(MARKER)
const priorState = existsSync(MARKER_FILE)
  ? (() => { try { return JSON.parse(readFileSync(MARKER_FILE, 'utf8')) } catch { return {} } })()
  : null

switch (classifyState({
  markerExists: priorState !== null,
  pid: priorState?.pid,
  selfPid: process.pid,
  alive: isAlive(priorState?.pid),
})) {
  case 'refuse':
    console.error(`proof-check: a proof run is ALREADY IN PROGRESS as pid ${priorState.pid}, `
      + `started ${priorState.startedAt}.`)
    console.error(`It has ${TARGET} injected right now. Starting a second run would `
      + 'inject on top of it and neither could restore the original.')
    console.error(`Wait for it, or: kill ${priorState.pid} && rm -rf ${STATE_DIR} `
      + `&& git checkout -- ${TARGET} ${REGISTRY}`)
    // No restore is registered yet, deliberately: exiting here must not touch
    // the other run's backups.
    process.exit(1)
    break

  case 'heal': {
    const from = f => (existsSync(f) ? readFileSync(f, 'utf8') : null)
    const t = from(BACKUP)
    const r = from(`${BACKUP}.registry`)
    if (t === null) {
      console.error(`proof-check: a previous run (pid ${priorState.pid}) was killed and its `
        + 'backup is missing. Restore with: '
        + `git checkout -- ${TARGET} ${REGISTRY}`)
      process.exit(1)
    }
    writeFileSync(TARGET, t)
    if (r !== null) writeFileSync(REGISTRY, r)
    rmSync(STATE_DIR, { recursive: true, force: true })
    console.error(`proof-check: HEALED — a previous run (pid ${priorState.pid}) was killed with `
      + `${TARGET} injected. Restored it before measuring anything.`)
    break
  }

  case 'proceed':
    // An injected tree with NO marker is the pre-2026-09-07 world: the state was
    // lost entirely, so there is nothing to restore from and guessing would mean
    // discarding whatever else is uncommitted in these files.
    if (injectedNow) {
      console.error(`proof-check: ${TARGET} contains injected proof code and no run state exists.`)
      console.error(`Restore it (git checkout -- ${TARGET}) before re-running.`)
      process.exit(1)
    }
    break
}

const source = readFileSync(TARGET, 'utf8')
const registrySource = readFileSync(REGISTRY, 'utf8')
mkdirSync(STATE_DIR, { recursive: true })
writeFileSync(BACKUP, source)
writeFileSync(`${BACKUP}.registry`, registrySource)
// Written LAST of the three, so a marker on disk always has backups behind it.
// The reverse order would leave a window where a kill produced a marker pointing
// at nothing, which heals into the "backup is missing" dead end above.
writeFileSync(MARKER_FILE, JSON.stringify({
  pid: process.pid,
  startedAt: STARTED_AT.toISOString(),
  target: TARGET,
  registry: REGISTRY,
}, null, 2) + '\n')

// The original is held in memory AND on disk outside the repo, and restored on
// every exit path including signals — a plain try/finally does not run on
// SIGTERM, which is exactly how the tree got left broken.
// NOT one-shot. An earlier version guarded this with a `restored` flag, so the
// second phase's `finally` was a no-op after the first phase had already
// restored — leaving the mutated Sport union on disk and every later run
// failing its own baseline. Writing the originals back is idempotent; the
// unlinks are existence-checked. There is nothing to guard against.
const restore = () => {
  try {
    writeFileSync(TARGET, source)
    writeFileSync(REGISTRY, registrySource)
    if (existsSync(BACKUP)) unlinkSync(BACKUP)
    if (existsSync(`${BACKUP}.registry`)) unlinkSync(`${BACKUP}.registry`)
    // The marker goes with them. A marker outliving its backups is the dead end
    // the write order above exists to avoid, and leaving one behind would make
    // the NEXT run refuse against a pid that has exited.
    rmSync(STATE_DIR, { recursive: true, force: true })
  } catch { /* best effort — the on-disk backups are the fallback */ }
}
process.on('exit', restore)
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => { restore(); process.exit(130) })
}

// The baseline matters more than it looks. If the tree did not compile, every
// violation below would "fail to build" and the whole suite would pass while
// proving nothing at all.
const baseline = build()
const baselineClean = !/error FS\d+/.test(baseline)
check('baseline tree compiles', baselineClean,
  (baseline.match(/error FS\d+.*/g) || []).slice(0, 2).join(' | '))

check('the proof doc contains machine-checkable cases', cases.length > 0,
  `${cases.length} case(s) across ${selectedDocs.join(', ') || '(no doc matched --only)'}`)

if (baselineClean && cases.length > 0 && source.includes(ANCHOR)) {
  try {
    for (const [i, c] of cases.entries()) {
      const indented = c.body.split('\n').map(l => (l ? `    ${l}` : l)).join('\n')
      const injected = `let private __proof${i} (g: Game) =\n${indented}\n\n${ANCHOR}`
      writeFileSync(TARGET, source.replace(ANCHOR, injected))

      const out = build()
      const rejected = /error FS\d+/.test(out)
      const codes = [...new Set(out.match(/error FS\d+/g) || [])].join(', ')
      // Label with the line that actually carries the violation, not the
      // `match ... with` every case opens on — otherwise all four read alike.
      const lines = c.body.split('\n').map(l => l.trim()).filter(Boolean)
      const salient = lines.find(l => l.startsWith('|') && !/^\|\s*(None|_)\s*->\s*""$/.test(l))
        || lines[0]

      check(`${c.doc} case ${i + 1} rejected with ${c.code}: ${salient.slice(0, 34)}`,
        rejected && out.includes(`error ${c.code}`),
        rejected ? `compiler said ${codes}, doc claims ${c.code}` : 'COMPILED CLEANLY — the gate does not hold')
    }
  } finally {
    restore()
  }
} else if (!source.includes(ANCHOR)) {
  check('injection anchor still exists in the target', false, `not found in ${TARGET}: ${ANCHOR}`)
}

// --- registry completeness ---------------------------------------------------
// The Sport union's headline claim is "add a sport and the compiler makes you
// update the registry". That cannot be expressed as an injected expression
// body — it needs the type itself edited — so it gets its own phase rather than
// being asserted in prose and left unchecked, which is the exact failure this
// whole script exists to prevent.
if (baselineClean) {
  try {
    // Anchored on Unrecognised, which is always last, rather than on whichever
    // sport happens to precede it. The first version anchored on `| MLB` and
    // broke the moment MLS was added — caught only because the "could not
    // apply" branch is a failure and not a skip.
    const withCase = registrySource.replace(
      /(\n)(    \| Unrecognised of raw: string)/, '$1    | NHL\n$2')
    if (withCase === registrySource) {
      check('registry mutation applied', false, 'could not add a probe case to the Sport union')
    } else {
      writeFileSync(REGISTRY, withCase)
      const out = build()
      check('adding a Sport case without the registry does not compile',
        /error FS0025/.test(out) && /NHL/.test(out),
        /error FS0025/.test(out) ? 'FS0025 raised but did not name the new case'
                                 : 'COMPILED CLEANLY — the registry is not exhaustive')
    }
  } finally {
    restore()
  }
}

console.log(`\ndocs/*-PROOF.md: ${cases.length} claimed rejection(s), each compiled for real\n`)
finish(summarize())
