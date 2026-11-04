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
//
// ONE COMPILE FOR ALL CASES
//
// Until 2026-11-03 this was one `dotnet build` per case, 5.8 s each on the CI
// runner, 776 s for 133 cases, and the longest path of the confidence gate once
// the mutation suite was sharded.
//
// The F# compiler keeps type-checking after an error in one function, and an
// error in one function does not hide an error in the next. Measured, for type
// errors in separate top-level functions: every case's SET of error codes in one
// batch compared with the same case compiled alone, identical for 133 of 133.
// That does NOT hold for a parse error, which stops type-checking of the whole
// file (measured the same day: an unclosed expression in one injected function,
// then an ordinary FS0001 in the next; only FS0058, FS0010, FS3156 and FS3118
// came back, and FS0001 never did).
//
// So every case is injected as its own `__proofN` function in ONE build, with
// the error cap lifted (`--maxerrors`), and each error is attributed to the case
// whose lines it falls in. Measured: 133 of 133 attributed with the stated code,
// 217 errors, 14.5 s.
//
// A CASE PASSES ONLY WHEN THE BATCH CONFIRMS IT. Confirmed means an error
// carrying the stated code sits inside the case's own lines, which is the
// predicate the one-build-per-case run used (the stated code appears) narrowed
// to the case's own lines. Every case the batch does not confirm is also
// compiled ALONE, by the old method, but only to say WHY it was not confirmed:
// a case that fails alone is a real failure (compiled cleanly, or rejected with
// another code), and a case that passes alone but was not confirmed is the
// batch being blind to it (the error cap reached, a parse error that stopped the
// file, a range that is off) and fails the run too. There is no quiet fallback
// to serial speed: an earlier version let those cases pass alone, and with the
// cap left at the compiler's default it went green after 1030 s on the machine
// the whole batched run takes 84 s on, with nothing red to say so.
//
// TWO CONTROLS RUN IN EVERY RUN, because a check that has only ever passed has
// proven nothing (Rule 90): one case that compiles cleanly and one whose stated
// code is wrong. Both travel the same path as the real cases and MUST come out
// as failures, for the reason they were written to fail. If either is accepted,
// or fails for a different reason, the run fails, whatever the 133 said.
//
// NOT SUPPORTED: a proof case whose stated error is a PARSE error (FS0010 and
// its relatives). It stops type-checking for every case in the file, so the
// batch would see nothing and the run would fail loudly, by the rule above.

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, mkdtempSync } from 'node:fs'
import { execSync, spawn, spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { createChecks, finish } from './checks.mjs'
import { isLive, startOf, statOf, parseStat } from './run-marker.mjs'

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
// cost again — see `isLive` in run-marker.mjs.
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
// Created at the START of the end-of-run restore and removed with the state when it worked: if the restore fails, or the run is killed in the middle of it, the next run finds it. It is
// the record of a failed restore that does not depend on the marker being writable (the marker is in the same directory, and the same fault, as the files that did not come back).
const PENDING_FILE = join(STATE_DIR, 'restore-pending')
const BACKUP = join(STATE_DIR, 'Scoreboard.fs.bak')
const MARKER = 'let private __proof'
// Any top-level `let` in the target works as an anchor; this one is stable and
// sits below every type the proof cases reference.
const ANCHOR = 'let private dramaText (g: Game) (state: GameState) ='

// `extra` is appended to the command: the batch lifts the compiler's error cap
// with it. Every other build runs the same command it always did, except that
// the output buffer is larger for all of them (the batch's output is about
// 100 KB for 133 cases, measured, under execSync's default 1 MB: this is
// headroom for more cases, not a fix for an overflow that happened). The F# compiler stops at 100
// errors by default, and MSBuild prints each one twice, so the first batch
// experiment (2026-11-03) saw 67 of 133 cases and nothing else.
const build = (extra = '') => {
  try {
    return execSync(`dotnet build src/Laboratory.fsproj --no-restore -clp:NoSummary${extra}`, {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28,
    })
  } catch (e) {
    // A failed build is the expected outcome for a proof case, not an error.
    return `${e.stdout || ''}${e.stderr || ''}`
  }
}

/** The body, indented to sit inside the wrapper function. */
const indentBody = body => body.split('\n').map(l => (l ? `    ${l}` : l)).join('\n')

/**
 * Lays cases out as one function each directly above ANCHOR, and returns the
 * text together with the 1-based lines each case occupies (its `let` header
 * through its last body line). The ranges are what error attribution stands on,
 * so they are computed from the same strings that are written, not estimated.
 *
 * Built by slicing at ANCHOR, not by String.replace: a replacement STRING treats
 * `$&`, `` $` `` and `$'` as patterns, and a case body is free text.
 */
const layout = (src, cs) => {
  const at = src.indexOf(ANCHOR)
  let line = src.slice(0, at).split('\n').length
  const ranges = []
  const chunks = cs.map((c, k) => {
    const indented = indentBody(c.body)
    const n = indented.split('\n').length
    ranges.push({ first: line, last: line + n })
    line += n + 2 // the header, the body, and the blank line that follows it
    return `let private __proof${k} (g: Game) =\n${indented}\n\n`
  })
  return { text: src.slice(0, at) + chunks.join('') + src.slice(at), ranges }
}

// --- what a killed run can have left, and whether its backups describe it ---------
//
// A backup is applied only to a file that is EXACTLY that backup plus what this script
// puts there: one block of proof functions above ANCHOR in the target, one probe case
// above the union's last case in the registry. Anything else is a file that changed
// after the run was killed, and the backup is older than it.

// The registry phase's probe: one case line directly above the union's last case. The
// anchor starts at the newline, as the regex it replaced did, so only a case at exactly
// four spaces of indent matches.
const REGISTRY_ANCHOR = '\n    | Unrecognised of raw: string'
const REGISTRY_PROBE = '    | NHL\n'
// The probe as it sits on a registry that carries it: directly above the union's last case. Whether any backup describes it is a different question.
const REGISTRY_PROBE_SITE = REGISTRY_PROBE + REGISTRY_ANCHOR.slice(1)

/** `src` with the probe inserted, or `src` unchanged when the union's last case is not found. */
const probeRegistry = src => {
  const at = src.indexOf(REGISTRY_ANCHOR)
  return at < 0 ? src : `${src.slice(0, at + 1)}${REGISTRY_PROBE}${src.slice(at + 1)}`
}

/** What `current` has over `backup` if it is `backup` with exactly one block inserted at `at`; null if it is anything else. */
const insertedAt = (current, backup, at) => {
  if (backup === null || at < 0) return null
  const head = backup.slice(0, at)
  const tail = backup.slice(at)
  if (current.length <= head.length + tail.length) return null
  if (!current.startsWith(head) || !current.endsWith(tail)) return null
  return current.slice(head.length, current.length - tail.length)
}

/**
 * Is this inserted block nothing but proof functions? layout() writes each as a `let private __proofN` header and a body indented four spaces, separated by blank lines,
 * so every line of the block is blank, indented, or a header. A block that carries the marker AND a line of anything else (a helper written above `dramaText` after the
 * kill, which is exactly where the injection sits) is not this script's, and the heal wrote the backup over it (reproduced in review, 2026-11-04).
 */
const onlyProofFunctions = block => block.split('\n').every(l => l === '' || l.startsWith('    ') || l.startsWith(MARKER))

/** Is `current` the backed-up target with this script's proof functions inserted, and nothing else different? */
const strandedTarget = (current, backup) => {
  const block = backup === null ? null : insertedAt(current, backup, backup.indexOf(ANCHOR))
  return block !== null && block.includes(MARKER) && onlyProofFunctions(block)
}

/**
 * Does `src` carry the probe case at all? The real union has `| UFL` above its last case, not `| NHL`, so a clean registry never matches
 * (and the self-test reads the real file to say so).
 */
const probeOnRegistry = src => src.includes(REGISTRY_PROBE_SITE)

/** Is `current` the backed-up registry with the probe case inserted, and nothing else different? */
const strandedRegistry = (current, backup) => {
  const at = backup === null ? -1 : backup.indexOf(REGISTRY_ANCHOR)
  return at >= 0 && insertedAt(current, backup, at + 1) === REGISTRY_PROBE
}

/**
 * `src/Scoreboard.fs(L,C): error FSxxxx` and the range form `(L,C,L2,C2)`. The
 * lookbehind keeps a file merely ENDING in Scoreboard.fs out of a case's range.
 */
const parseErrors = out =>
  [...out.matchAll(/(?<![\w.-])Scoreboard\.fs\((\d+),\d+(?:,\d+,\d+)?\): error (FS\d+)/g)]
    .map(m => ({ line: Number(m[1]), code: m[2] }))

/**
 * Which errors belong to which case. A case is CONFIRMED when an error carrying
 * its stated code sits inside its own lines; anything else is left for the
 * serial compile to decide. `strays` are errors that fall in no case at all,
 * which are reported, not ignored: they mean the ranges or the baseline are off.
 */
const attribute = (cs, ranges, errors) => {
  const within = r => e => e.line >= r.first && e.line <= r.last
  const per = cs.map((c, i) => {
    const codes = [...new Set(errors.filter(within(ranges[i])).map(e => e.code))].sort()
    return { codes, confirmed: codes.includes(c.code) }
  })
  const strays = errors.filter(e => !ranges.some(r => within(r)(e)))
  return { per, strays }
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
// `--max-errors N` is the compiler's error cap for the BATCH build (default 5000,
// 23 times what 133 cases produce). `--out FILE` writes what each case was
// decided by. Both refuse an empty or missing value with exit 2: a flag that
// silently falls back to its default is a flag that was not applied.
const flagValue = name => {
  if (process.argv.some(a => a.startsWith(`${name}=`))) {
    console.error(`proof-check: write ${name} VALUE with a space; ${name}=VALUE is not read`)
    process.exit(2)
  }
  const at = process.argv.indexOf(name)
  if (at === -1) return null
  const v = process.argv[at + 1]
  if (v === undefined || v === '' || v.startsWith('--')) {
    console.error(`proof-check: ${name} needs a value`)
    process.exit(2)
  }
  return v
}
const MAX_ERRORS = flagValue('--max-errors') === null ? 5000 : Number(flagValue('--max-errors'))
if (!Number.isInteger(MAX_ERRORS) || MAX_ERRORS < 1) {
  console.error(`proof-check: --max-errors must be a positive integer, got ${flagValue('--max-errors')}`)
  process.exit(2)
}
const OUT = flagValue('--out')
// `--only` goes through the same refusal: a bare or trailing `--only`, or
// `--only=X`, used to run the FULL suite without a word (2026-11-03 review).
const ONLY = flagValue('--only')
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
 * Is the marker's process ANOTHER run that is still going?
 *
 * `isLive` (run-marker.mjs) asks whether the recorded process exists and is the one that
 * started when the marker says: a recycled pid or a zombie is not the recorded run. Our own
 * pid is never "elsewhere": a marker we did not write cannot be ours, so one that names our
 * pid is a dead run's whose number was recycled to us, and is judged by the tree like any
 * other dead run's (it used to return 'proceed' before the tree was looked at, which hid a
 * healable injection behind "no run state exists").
 */
const runningElsewhere = (prior, selfPid = process.pid, probes, command = commandOf) =>
  prior !== null && prior.pid !== selfPid && isLive(prior, probes)
    // A marker with no recorded start is judged by the pid alone, and a pid is only a number. Where /proc can say what it is running and it is not a proof-check, it is not the run:
    // the marker is then a dead run's, judged by the tree and healed from its backups. (It was refused, with advice to delete the state and to kill the stranger: reproduced in review 4.)
    && !((prior.start === undefined || prior.start === null) && isStranger(command(prior.pid)))

/** What a pid is running, where /proc can say (null elsewhere). A marker with no recorded start is judged by the pid alone, so this says what the pid is. */
const commandOf = (pid, read = p => readFileSync(p, 'utf8')) => {
  // '' is a successful read of nothing (a kernel thread has no command line): it is a command, and not a proof-check. null is a read that failed.
  try { return read(`/proc/${pid}/cmdline`).split('\0').join(' ').trim() } catch { return null }
}
/** Is this command line a node process running proof-check.mjs? By argument, not by substring: `vim proof-check-notes.txt` and `sh -c '…' proof-check` are not. */
const runsProofCheck = command => {
  const words = command.split(/\s+/).filter(Boolean)
  return words.length > 1 && /(^|\/)node[\d.]*$/.test(words[0]) && words.slice(1).some(w => /(^|\/)proof-check\.mjs$/.test(w))
}
/** A command that is known, and is not a proof-check (an empty one included). An unknown one (null) is not a stranger: it cannot be told. */
const isStranger = command => command !== null && !runsProofCheck(command)

/**
 * The environment a scratch git repository is made in. Git carries the repository it is committing to in its environment (a hook in a linked worktree exports GIT_DIR and
 * GIT_INDEX_FILE for it, absolute), and a `git init` / `git add -A` / `git commit` made with that environment acts on THAT repository: its index replaced, its identity overwritten
 * (reproduced by review 4 for mutation-check.mjs's self-test, and by review 5 for this one). So nothing of the caller's `GIT_*` goes through, and the caller's configuration
 * (signing, a hooks path, line-ending conversion) is not read.
 */
const scrubbedGitEnv = env => ({ ...Object.fromEntries(Object.entries(env).filter(([k]) => !/^GIT_/.test(k))), GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' })

/**
 * What a refusal over a live marker says, as lines. Pure, so the self-test can read every shape of it.
 *
 * A marker with no recorded start is judged by the pid alone. If /proc says the pid is a proof-check it is the run (wait, or kill -9 it if hung). If /proc cannot say, nothing
 * here can tell the run from a stranger, so the advice is to LOOK, and never to delete the state (it holds the only whole copy of the files that run backed up) or to kill a
 * process nobody has identified. (A pid shown NOT to be a proof-check never gets here: runningElsewhere calls it dead.)
 */
const refusalLines = (prior, holder) => {
  const unconfirmed = (prior.start === undefined || prior.start === null) && holder === null
  const lines = [`proof-check: a proof run is ALREADY IN PROGRESS as pid ${prior.pid}${holder ? ` (${holder.slice(0, 120)})` : ''}, started ${prior.startedAt}.`]
  if (unconfirmed) {
    lines.push(`This marker records no start time and the command of pid ${prior.pid} cannot be read here, so it cannot be told whether that pid is the run. Look at what it is `
      + `(ps -p ${prior.pid} -o args=). ${STATE_DIR} holds the only whole copy of the files that run backed up: do not delete it.`)
  }
  lines.push(`It has ${TARGET} (phase 1) or ${REGISTRY} (phase 2) modified right now. Starting a second run would inject on top of it and neither could restore the original.`)
  // No `git checkout` here: the heal restores exactly the file that still carries that run's injection, and a checkout would also throw away whatever else is uncommitted in these two files.
  // kill -9, not kill: this script is one synchronous run with no await, so the event loop does not turn until it ends and a plain kill is not acted on at all in the meantime
  // (measured in review 4, 2026-11-04: SIGTERM sent mid-run, seven builds still ran and the handler never did). SIGKILL leaves the injection where it is, which is what the state
  // and the next run's heal are for.
  lines.push(unconfirmed
    ? `If it is a proof run, wait for it. If it is not, it is not this script's to stop: set "pid": 0 in ${MARKER_FILE} (the marker then reads as a dead run's, judged by the tree) and run this again; the next run restores the file that still carries the injection, and only that file.`
    : `Wait for it. If it is hung: kill -9 ${prior.pid}. The next run restores the file that still carries its injection, and only that file.`)
  return lines
}

/**
 * What to do about the state on disk, as a value rather than as control flow.
 *
 * THREE OUTCOMES (TWO MORE ARE BELOW), AND THE THIRD IS THE ONE THAT COST A SESSION. On 2026-09-07
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
 * TWO MORE, ADDED 2026-11-03: `stale` and `diverged`. A marker with no live process says
 * a run was killed; it does not say the files are still as that run left them, and the
 * heal used to write its backups over two tracked files on that sentence alone. The first
 * gate run in a checkout that held such a marker had `src/Scoreboard.fs` and
 * `src/Desk.fs` rewritten to the versions they were in when that run started (13 and 70
 * lines of the lineups feature gone) and failed its baseline on `BsdEventId`. Reproduced
 * with a planted marker and the old files as backups: the same two files, the same line
 * counts, the same compile error. That the marker was already there is inferred from
 * the match, not observed; the 190-commit fast-forward that came just before the run
 * touched neither file, and the lineups commit was in the tree before it (so the marker is
 * older than that pull).
 *
 * So a backup is applied only to a file that is exactly that backup plus what this script
 * puts there (`strandedTarget`, `strandedRegistry` above), and the answers follow:
 *
 *   heal      a file is provably this script's own injection: restore THAT file, and
 *             not the other one;
 *   stale     nothing is stranded and the target is intact: the state is as old as the
 *             marker, and is discarded, never applied;
 *   diverged  something on a file is not described by the backups: an injection (the
 *             target's proof code, the registry's probe case) the file has moved on from
 *             (a stash pop, an edit), or a target with no anchor, which may be torn:
 *             write nothing, keep the state, say what to do by hand.
 *
 * Pure, so the self-test can exercise every answer without a dotnet build in sight.
 */
const classifyState = ({
  markerExists, alive, injected, anchored, targetStranded, registryStranded, registryInjected,
  restoreFailed, targetIntact, registryIntact,
}) => {
  if (!markerExists) return 'proceed'
  if (alive) return 'refuse'
  // A run whose restore did not read back (the marker says so) may have left either file TORN, and the backups are then the only whole copies. What is provably that run's own
  // injection is healed; anything else must be exactly its backup, or the state stays for a person. It is never called stale: a torn file keeps its anchor, and `stale` deletes the state.
  if (restoreFailed && !((targetStranded || targetIntact) && (registryStranded || registryIntact))) return 'diverged'
  if ((injected && !targetStranded) || (registryInjected && !registryStranded)) return 'diverged'
  if (targetStranded || registryStranded) return 'heal'
  return anchored ? 'stale' : 'diverged'
}

// --- self-test ---------------------------------------------------------------
//
// The state machine and the batch's pure functions (layout, attribute,
// parseErrors). Everything below it needs a real compiler; this is the half that
// decides whether a killed run corrupts the tree and whether an error lands in
// the right case, and it is cheap enough to run before every real run.
if (process.argv.includes('--self-test')) {
  const { check: sc, summarize: ss } = createChecks()
  // One input at a time moves off a base that is a dead pid, a clean intact tree, nothing stranded.
  // A file that is stranded is, by construction, not its backup (it IS the backup plus a block), so its default is not intact: a default of intact would feed the classifier a
  // combination the real flow cannot produce, and let the `Stranded ||` alternatives it needs go untested (review 5).
  const st = over => classifyState({
    markerExists: true, alive: false,
    injected: false, anchored: true, targetStranded: false, registryStranded: false, registryInjected: false, restoreFailed: false,
    targetIntact: !over.targetStranded, registryIntact: !over.registryStranded, ...over,
  })

  sc('no marker means proceed, whatever the tree holds',
    st({ markerExists: false }) === 'proceed'
      && st({ markerExists: false, injected: true, targetStranded: true }) === 'proceed',
    `got ${st({ markerExists: false })}`)
  sc('A MARKER WHOSE PROCESS IS STILL ALIVE REFUSES, it does not repair',
    st({ alive: true, injected: true, targetStranded: true }) === 'refuse',
    `got ${st({ alive: true, injected: true, targetStranded: true })} — healing a file a live run is about to rewrite `
    + 'is a race; this is the outcome the 2026-09-07 incident needed')
  sc('...whatever the tree holds',
    [{}, { injected: true }, { registryStranded: true }, { anchored: false }].every(o => st({ alive: true, ...o }) === 'refuse'),
    'a live process refuses on a clean tree, an injected one, a stranded registry and a target with no anchor')
  sc('HEAL: the target is provably the killed run\'s own injection',
    st({ injected: true, targetStranded: true }) === 'heal', `got ${st({ injected: true, targetStranded: true })}`)
  sc('HEAL: or only the registry is, with the phase-2 probe case on it',
    st({ registryStranded: true }) === 'heal', `got ${st({ registryStranded: true })}`)
  sc('A MARKER WHOSE PROCESS IS GONE, OVER NOTHING STRANDED, IS STALE: nothing to heal',
    st({}) === 'stale',
    `got ${st({})} — writing its backups back would rewrite files that were never injected, `
    + 'with whatever the tree held when that run started')
  sc('DIVERGED: an injection the backups do not describe is not healed',
    st({ injected: true }) === 'diverged', `got ${st({ injected: true })}`)
  sc('...and an unexplained injection on the target outranks a stranded registry',
    st({ injected: true, registryStranded: true }) === 'diverged', `got ${st({ injected: true, registryStranded: true })}`)
  sc('...and a target with no anchor, which may be torn, is not called clean',
    st({ anchored: false }) === 'diverged', `got ${st({ anchored: false })}`)
  sc('DIVERGED: a probe case the backups do not describe is not discarded as stale, and one they do describe is healed',
    st({ registryInjected: true }) === 'diverged' && st({ registryInjected: true, registryStranded: true }) === 'heal',
    `got ${st({ registryInjected: true })} / ${st({ registryInjected: true, registryStranded: true })}`)

  // The two predicates the classifier is fed, on the REAL layout() and probeRegistry() outputs:
  // a fixture typed by hand would keep passing after the script stopped writing what it recognises.
  const clean = `// head\n${ANCHOR}\n  body\n`
  const moved = clean.replace('// head', '// head, newer')
  const injectedClean = layout(clean, [{ body: 'let x = 1' }]).text
  sc('strandedTarget: the real layout() output is recognised, the clean file is not',
    strandedTarget(injectedClean, clean) && !strandedTarget(clean, clean),
    'the injected text must read as the backup plus a block carrying MARKER, and the backup itself as nothing stranded')
  // Same length, one character different: the block between head and tail then reads as proof functions only, so it is the head and tail comparison alone that says the file moved.
  const movedHead = clean.replace('// head', '// HEAD')
  const movedTail = clean.replace('  body', '  BODY')
  sc('strandedTarget: a file that moved on is not, with or without an injection on it, and a one-character change at either end is enough',
    !strandedTarget(layout(moved, [{ body: 'let x = 1' }]).text, clean) && !strandedTarget(moved, clean)
      && !strandedTarget(layout(movedHead, [{ body: 'let x = 1' }]).text, clean) && !strandedTarget(layout(movedTail, [{ body: 'let x = 1' }]).text, clean),
    'an old backup must never describe a newer file')
  // A run whose restore did not read back (its marker says so). A file that is not its backup and not provably this script's injection may be TORN, and its backup is then the only
  // whole copy: it is kept, never discarded as stale, whichever file it is. Whole or provably injected files are healed or discarded as before.
  sc('A FAILED RESTORE IS NEVER STALE: a file that is not its backup and not provably an injection keeps the state, whichever file it is; both files whole or provably injected are healed or discarded as before',
    st({ restoreFailed: true, targetIntact: false }) === 'diverged' && st({ restoreFailed: true, registryIntact: false }) === 'diverged'
      && st({ restoreFailed: true }) === 'stale' && st({ restoreFailed: true, injected: true, targetStranded: true }) === 'heal'
      && st({ restoreFailed: true, registryInjected: true, registryStranded: true }) === 'heal'
      && st({ restoreFailed: true, injected: true, targetStranded: true, registryInjected: true, registryStranded: true }) === 'heal'
      && st({ restoreFailed: true, injected: true, targetStranded: true, registryIntact: false }) === 'diverged'
      && st({ restoreFailed: true, registryInjected: true, registryStranded: true, targetIntact: false }) === 'diverged'
      && st({ targetIntact: false }) === 'stale' && st({ registryIntact: false }) === 'stale',
    'restoreFailed with a torn target, a torn registry, one healable and one torn; and without restoreFailed the same torn files read as before')
  sc('strandedTarget: an insertion that is not proof code, a truncation and a missing backup are not',
    !strandedTarget(clean.replace(ANCHOR, `let y = 2\n\n${ANCHOR}`), clean)
      && !strandedTarget(injectedClean.slice(0, 20), clean) && !strandedTarget(injectedClean, null),
    'only a block carrying MARKER, whole, over a backup that exists, counts')
  // The block the injection sits in is also where a person's new helper would go. Marker present AND other code in the same gap is newer work, not this script's.
  const withHelper = injectedClean.replace(ANCHOR, `let private myNewHelper (n: int) = n + 1   // written after the kill\n\n${ANCHOR}`)
  sc('STRANDEDTARGET: A BLOCK THAT CARRIES THE MARKER AND ALSO CODE THAT IS NOT PROOF CODE IS NOT THIS SCRIPT\'S',
    !strandedTarget(withHelper, clean) && strandedTarget(layout(clean, [{ body: 'let x = 1' }, { body: 'let y = 2\n\nlet z = 3' }]).text, clean),
    'a helper in the injection gap, next to the marker, must not read as stranded; a two-block injection with a blank line inside a body must')
  // ...and an insertion with NO marker is not this script's, however proof-like it looks: a blank line or an indented comment passes the shape test on its own, so only the marker separates
  // them from an injection.
  sc('STRANDEDTARGET: A BLANK LINE OR AN INDENTED COMMENT IN THE GAP, WITH NO MARKER, IS NEWER WORK AND NOT THIS SCRIPT\'S',
    !strandedTarget(clean.replace(ANCHOR, `\n${ANCHOR}`), clean) && !strandedTarget(clean.replace(ANCHOR, `    // x\n${ANCHOR}`), clean),
    'the shape test accepts blank and indented lines; the marker is what makes a block an injection')
  // Shaped like the real union, whose case above `Unrecognised` is `| UFL`: a fixture with the probe's own line there would read as already probed.
  const union = 'type Sport =\n    | MLB\n    | NHL\n    | UFL\n    | Unrecognised of raw: string\n'
  sc('strandedRegistry: the real probeRegistry() output is recognised, the clean union is not',
    probeRegistry(union) !== union && strandedRegistry(probeRegistry(union), union) && !strandedRegistry(union, union),
    'the probe must change the union and read back as stranded')
  // The registry AS COMMITTED, not the working tree: after a kill in phase 2 the working copy carries the probe, which is exactly the state `npm run check:proof` runs this
  // self-test in before it reaches the heal. Reading the working tree made the stranded probe fail the self-test that stood between it and the run that heals it.
  const committedFile = (path, options = {}) => { try { return execSync(`git show HEAD:${path}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26, ...options }) } catch { return null } }
  const committedRegistry = committedFile(REGISTRY)
  // The reader itself, against a scratch repository whose working tree differs from HEAD: what is committed is what it must return. The repository is made in a scrubbed
  // environment (scrubbedGitEnv), and the clause below runs it in a HOSTILE one: a decoy repository's location in GIT_DIR and GIT_INDEX_FILE, as a hook in a linked worktree
  // exports them, and a home directory whose git configuration runs a hook that always fails. The decoy must come out as it went in.
  const haveGit = (() => { try { execSync('git --version', { stdio: 'pipe' }); return true } catch { return false } })()
  const committedDemo = hostile => {
    const repo = mkdtempSync(join(tmpdir(), 'proof-committed-'))
    const env = scrubbedGitEnv(hostile)
    try {
      execSync('git init -q && git config user.email t@t && git config user.name t', { cwd: repo, stdio: 'pipe', env })
      writeFileSync(join(repo, 'f.txt'), 'committed\n')
      execSync('git add -A && git commit -qm base', { cwd: repo, stdio: 'pipe', env })
      writeFileSync(join(repo, 'f.txt'), 'working tree, with a stranded probe in it\n')
      return committedFile('f.txt', { cwd: repo, env })
    } catch (e) {
      return `threw: ${String(e.message).split('\n')[0]}`
    } finally {
      rmSync(repo, { recursive: true, force: true })
    }
  }
  const hostileHome = mkdtempSync(join(tmpdir(), 'proof-home-'))
  mkdirSync(join(hostileHome, 'hooks'))
  writeFileSync(join(hostileHome, 'hooks', 'pre-commit'), '#!/bin/sh\nexit 1\n', { mode: 0o755 })
  writeFileSync(join(hostileHome, '.gitconfig'), `[core]\n\thooksPath = ${join(hostileHome, 'hooks')}\n`)
  const decoy = mkdtempSync(join(tmpdir(), 'proof-decoy-'))
  const decoyEnv = scrubbedGitEnv(process.env)
  const decoyGit = cmd => { try { return execSync(`git ${cmd}`, { cwd: decoy, encoding: 'utf8', stdio: 'pipe', env: decoyEnv }).trim() } catch (e) { return `failed: ${String(e.message).split('\n')[0]}` } }
  let decoyBefore = null
  let decoyAfter = null
  let committedDemo1 = null
  if (haveGit) {
    execSync('git init -q && git config user.email real@real && git config user.name real', { cwd: decoy, stdio: 'pipe', env: decoyEnv })
    writeFileSync(join(decoy, 'a.txt'), 'a\n')
    execSync('git add -A && git commit -qm decoy', { cwd: decoy, stdio: 'pipe', env: decoyEnv })
    writeFileSync(join(decoy, 'staged.txt'), 's\n')
    execSync('git add staged.txt', { cwd: decoy, stdio: 'pipe', env: decoyEnv })
    const snapDecoy = () => [decoyGit('rev-parse HEAD'), decoyGit('config user.email'), decoyGit('config core.bare'), decoyGit('ls-files -s'), decoyGit('status --porcelain')].join('|')
    decoyBefore = snapDecoy()
    committedDemo1 = committedDemo({ ...process.env, HOME: hostileHome, GIT_DIR: join(decoy, '.git'), GIT_INDEX_FILE: join(decoy, '.git', 'index'), GIT_WORK_TREE: decoy })
    decoyAfter = snapDecoy()
  }
  rmSync(hostileHome, { recursive: true, force: true })
  rmSync(decoy, { recursive: true, force: true })
  sc(`THE SCRATCH REPOSITORY IS MADE IN A SCRUBBED GIT ENVIRONMENT: run under a decoy's GIT_DIR, GIT_INDEX_FILE and GIT_WORK_TREE and a home whose git hook always fails, it returns what it committed and the decoy comes out exactly as it went in (asserted: ${haveGit})`,
    !haveGit || (committedDemo1 === 'committed\n' && decoyBefore === decoyAfter), `returned ${JSON.stringify(committedDemo1)}; decoy before ${decoyBefore}, after ${decoyAfter}`)
  const scrubbed = scrubbedGitEnv({ GIT_DIR: 'a', GIT_INDEX_FILE: 'b', GIT_WORK_TREE: 'c', GIT_OBJECT_DIRECTORY: 'd', GIT_CONFIG_COUNT: '1', GIT_CONFIG_GLOBAL: 'e', GIT_CONFIG_NOSYSTEM: '0', HOME: '/h', PATH: '/p' })
  sc('scrubbedGitEnv: no GIT_* of the caller goes through, the caller\'s configuration is replaced by /dev/null and the system\'s is switched off, everything else stays',
    JSON.stringify(Object.entries(scrubbed).sort()) === JSON.stringify([['GIT_CONFIG_GLOBAL', '/dev/null'], ['GIT_CONFIG_NOSYSTEM', '1'], ['HOME', '/h'], ['PATH', '/p']]),
    JSON.stringify(scrubbed))
  const committedDemo0 = haveGit ? committedDemo(process.env) : null
  sc('THE COMMITTED REGISTRY IS READ FROM HEAD, NOT FROM THE WORKING TREE: a working copy that differs does not change what is returned',
    !haveGit || committedDemo0 === 'committed\n', JSON.stringify(committedDemo0))
  sc(`probeOnRegistry: the probed union carries it, the clean one does not, and neither does the REAL ${REGISTRY} as committed (asserted: ${committedRegistry !== null})`,
    probeOnRegistry(probeRegistry(union)) && !probeOnRegistry(union) && (committedRegistry === null || !probeOnRegistry(committedRegistry)),
    `the committed registry has the probe's line above its last case: ${committedRegistry !== null && probeOnRegistry(committedRegistry)} — a union whose case above the last one is the probe's own line`)
  sc('strandedRegistry: a union that moved on, a missing backup and a union with no last case are not',
    !strandedRegistry(probeRegistry(union.replace('| MLB', '| MLB\n    | MLS')), union)
      && !strandedRegistry(probeRegistry(union), null) && probeRegistry('x') === 'x' && !strandedRegistry('x', 'x'),
    'the probe of a union with no last case changes nothing, and nothing is stranded')

  // The classifier decides; this runs what it decided. The REAL script, in a scratch directory,
  // against planted state: the classifier alone cannot see a wrong call site, a case that writes
  // the backups anyway, or one that exits early, and the first stale marker cost a gate run
  // because the decision was right in no test and wrong in the one place that wrote. The child
  // exits 1 whatever it decides (there is no project, so its own cases fail), so its status says
  // nothing; what counts is the two files, the state directory, and whether it got past the
  // repair into its own checks (it prints "baseline tree compiles" there, pass or fail).
  const sandbox = ({ target, registry, backupTarget, backupRegistry, pid, start, noState = false, markerExtra = {}, files = {} }) => {
    const dir = mkdtempSync(join(tmpdir(), 'proof-state-'))
    try {
      for (const d of ['src', 'docs', ...(noState ? [] : [STATE_DIR])]) mkdirSync(join(dir, d))
      writeFileSync(join(dir, TARGET), target)
      writeFileSync(join(dir, REGISTRY), registry)
      if (!noState) {
        writeFileSync(join(dir, BACKUP), backupTarget)
        writeFileSync(join(dir, `${BACKUP}.registry`), backupRegistry)
        writeFileSync(join(dir, MARKER_FILE), JSON.stringify({
          pid, ...(start === undefined ? {} : { start }), startedAt: '2026-10-20T20:00:00.000Z', target: TARGET, registry: REGISTRY, ...markerExtra,
        }))
      }
      for (const [rel, text] of Object.entries(files)) writeFileSync(join(dir, rel), text)
      const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)],
        { cwd: dir, encoding: 'utf8', timeout: 120_000 })
      return {
        status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', error: r.error ? String(r.error.message) : '',
        target: readFileSync(join(dir, TARGET), 'utf8'), registry: readFileSync(join(dir, REGISTRY), 'utf8'),
        stateLeft: existsSync(join(dir, STATE_DIR)),
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
  const DEAD = 2 ** 30   // no such pid, the same one the liveness case below relies on
  const haveProcForCmd0 = startOf(process.pid) !== null
  const carriedOn = r => /baseline tree compiles/.test(r.stdout)
  const seen = r => r.error || `status ${r.status}, stderr: ${r.stderr.slice(0, 200).replace(/\n/g, ' | ')}`
  const show = r => `target ${JSON.stringify(r.target.slice(0, 60))}, registry ${JSON.stringify(r.registry.slice(0, 60))}, `
    + `state left ${r.stateLeft}, carried on ${carriedOn(r)}; ${seen(r)}`

  // A stale marker over a tree that moved on: the files are NEITHER backup, and nothing of ours is on them.
  const oldClean = `// head, older\n${ANCHOR}\n  body\n`
  const oldUnion = 'type Sport =\n    | MLB\n    | EPL\n    | UFL\n    | Unrecognised of raw: string\n'
  const staleRun = sandbox({ target: clean, registry: union, backupTarget: oldClean, backupRegistry: oldUnion, pid: DEAD })
  sc('A STALE MARKER LEAVES BOTH FILES AS THEY ARE, says so, and the run carries on with the state gone',
    staleRun.target === clean && staleRun.registry === union && /STALE STATE DISCARDED/.test(staleRun.stderr)
      && /NOT written back/.test(staleRun.stderr) && !/HEALED/.test(staleRun.stderr) && carriedOn(staleRun) && !staleRun.stateLeft,
    show(staleRun))

  // A run killed in phase 1: the target carries its injection. The registry has moved on since and is not its to restore.
  const newerUnion = union.replace('| MLB', '| MLB\n    | MLS')
  const killed = sandbox({ target: injectedClean, registry: newerUnion, backupTarget: clean, backupRegistry: union, pid: DEAD })
  sc('a killed run that left its injection has the TARGET healed from its backup, and the registry it never touched left alone',
    killed.target === clean && killed.registry === newerUnion && /HEALED/.test(killed.stderr)
      && !/src\/Desk\.fs/.test(killed.stderr) && carriedOn(killed) && !killed.stateLeft,
    show(killed))

  // A run killed in phase 2 with its marker still on disk: the registry carries the probe, the target has moved on.
  const killedRegistry = sandbox({ target: moved, registry: probeRegistry(union), backupTarget: clean, backupRegistry: union, pid: DEAD })
  sc('a killed run that left its probe case has the REGISTRY healed from its backup, and the target it never touched left alone',
    killedRegistry.registry === union && killedRegistry.target === moved && /HEALED/.test(killedRegistry.stderr)
      && /src\/Desk\.fs/.test(killedRegistry.stderr) && carriedOn(killedRegistry) && !killedRegistry.stateLeft,
    show(killedRegistry))

  // The injection is still there but the file has moved on from the backup (a stash pop, an edit): nothing may be written.
  const movedInjected = layout(moved, [{ body: 'let x = 1' }]).text
  const divergedRun = sandbox({ target: movedInjected, registry: union, backupTarget: clean, backupRegistry: union, pid: DEAD })
  sc('AN INJECTION ON A FILE THAT HAS MOVED ON IS NOT HEALED: nothing is written, the state is kept, the run stops',
    divergedRun.target === movedInjected && divergedRun.registry === union && divergedRun.status === 1
      && /nothing was written/.test(divergedRun.stderr) && divergedRun.stateLeft && !carriedOn(divergedRun),
    show(divergedRun))

  // A target with no anchor is not a clean tree: it may be torn, and the backup may be the only whole copy.
  const tornRun = sandbox({ target: '// head, cut off', registry: union, backupTarget: clean, backupRegistry: union, pid: DEAD })
  sc('A TARGET WITH NO ANCHOR IS NOT CALLED CLEAN: nothing is written, the state is kept, the run stops',
    tornRun.target === '// head, cut off' && tornRun.status === 1 && /nothing was written/.test(tornRun.stderr)
      && tornRun.stateLeft && !carriedOn(tornRun),
    show(tornRun))

  // The probe is still on the registry but the registry has moved on from the backup (a stash pop, an edit): the same rule as the target's.
  const movedProbed = probeRegistry(newerUnion)
  const registryDiverged = sandbox({ target: clean, registry: movedProbed, backupTarget: clean, backupRegistry: union, pid: DEAD })
  sc('A PROBE CASE ON A REGISTRY THAT HAS MOVED ON IS NOT DISCARDED AS STALE: nothing is written, the state is kept, the run stops',
    registryDiverged.registry === movedProbed && registryDiverged.target === clean && registryDiverged.status === 1
      && /nothing was written/.test(registryDiverged.stderr) && /probe case/.test(registryDiverged.stderr) && registryDiverged.stateLeft && !carriedOn(registryDiverged),
    show(registryDiverged))

  // A live pid: the test's own process is alive and the marker records when it started, so it reads as a run still in progress.
  const liveRun = sandbox({ target: injectedClean, registry: union, backupTarget: clean, backupRegistry: union, pid: process.pid, start: startOf(process.pid) })
  sc('A LIVE RUN\'S MARKER REFUSES: both files and the state are untouched, and the run stops before its own checks',
    liveRun.target === injectedClean && liveRun.registry === union && liveRun.status === 1
      && /ALREADY IN PROGRESS/.test(liveRun.stderr) && !/HEALED|STALE/.test(liveRun.stderr)
      && !/git checkout/.test(liveRun.stderr) && /phase 2/.test(liveRun.stderr)
      && liveRun.stateLeft && !carriedOn(liveRun),
    show(liveRun))

  sc(`...and shows what the pid is running, so a stranger is not mistaken for the run (asserted: ${haveProcForCmd0})`,
    !haveProcForCmd0 || /ALREADY IN PROGRESS as pid \d+ \(\S*node/.test(liveRun.stderr), liveRun.stderr.split('\n')[0])
  sc('...and tells a person to kill -9 it, because a plain kill is not acted on while the synchronous run is going',
    /kill -9 \d+/.test(liveRun.stderr) && !/kill \d+\./.test(liveRun.stderr), liveRun.stderr.split('\n').find(l => /kill/.test(l)) ?? '(no kill advice)')

  // NO STATE AT ALL, and a file that carries an injection: nothing says it is ours, so nothing is guessed, in either file. (The target half was untested: the guard
  // could be deleted with every check green; the registry half did not exist, and the probe was adopted as the original.)
  const strayTarget = sandbox({ target: injectedClean, registry: union, noState: true })
  sc('AN INJECTED TARGET WITH NO RUN STATE IS NOT ADOPTED AS THE ORIGINAL: both files are untouched, the run stops before its own checks',
    strayTarget.target === injectedClean && strayTarget.registry === union && strayTarget.status === 1 && /no run state exists/.test(strayTarget.stderr)
      && /src\/Scoreboard\.fs/.test(strayTarget.stderr) && !strayTarget.stateLeft && !carriedOn(strayTarget),
    show(strayTarget))
  const strayRegistry = sandbox({ target: clean, registry: probeRegistry(union), noState: true })
  sc('...and so is a registry that carries the probe case: untouched, the run stops, and the message names the registry',
    strayRegistry.registry === probeRegistry(union) && strayRegistry.target === clean && strayRegistry.status === 1 && /no run state exists/.test(strayRegistry.stderr)
      && /src\/Desk\.fs/.test(strayRegistry.stderr) && !strayRegistry.stateLeft && !carriedOn(strayRegistry),
    show(strayRegistry))

  // A foreign line in the gap, with the marker beside it: newer work, not the script's. Nothing is written and the state is kept.
  const helperRun = sandbox({ target: withHelper, registry: union, backupTarget: clean, backupRegistry: union, pid: DEAD })
  sc('A HELPER WRITTEN IN THE INJECTION GAP AFTER THE KILL IS NOT HEALED OVER: nothing is written, the state is kept, the run stops',
    helperRun.target === withHelper && helperRun.status === 1 && /nothing was written/.test(helperRun.stderr) && helperRun.stateLeft && !carriedOn(helperRun),
    show(helperRun))

  // A marker with no recorded start (the old shape) over a pid that is something else: judged by the pid alone, so the refusal must show what the pid is.
  const haveProcForCmd = startOf(process.pid) !== null
  const stranger = spawn('sleep', ['30'], { stdio: 'ignore' })
  const legacyMarker = sandbox({ target: clean, registry: union, backupTarget: oldClean, backupRegistry: oldUnion, pid: stranger.pid })
  stranger.kill('SIGKILL')
  sc(`A MARKER WITH NO START TIME OVER A PID THAT IS NOT A PROOF RUN IS A DEAD RUN'S, JUDGED BY THE TREE: it does not refuse, and says nothing about deleting the state (asserted: ${haveProcForCmd})`,
    !haveProcForCmd || (!/ALREADY IN PROGRESS/.test(legacyMarker.stderr) && !/delete \.proof-state/.test(legacyMarker.stderr) && /STALE STATE DISCARDED/.test(legacyMarker.stderr) && carriedOn(legacyMarker) && !legacyMarker.stateLeft),
    show(legacyMarker))
  // The case the old refusal made dangerous: a killed run's INJECTION, its backup holding an uncommitted edit that exists nowhere else, and a marker that names a stranger's pid.
  // Refused, the advice was to delete the state (the only copy of the edit) and kill the stranger; judged by the tree, the target is healed from the backup and the edit survives.
  const uncommitted = `// head\n// an edit nobody has committed\n${ANCHOR}\n  body\n`
  const injectedUncommitted = layout(uncommitted, [{ body: 'let x = 1' }]).text
  const stranger2 = spawn('sleep', ['30'], { stdio: 'ignore' })
  const legacyInjected = sandbox({ target: injectedUncommitted, registry: union, backupTarget: uncommitted, backupRegistry: union, pid: stranger2.pid })
  stranger2.kill('SIGKILL')
  sc(`...and over a killed run's injection it HEALS from the backup, so an uncommitted edit in that file survives (asserted: ${haveProcForCmd})`,
    !haveProcForCmd || (legacyInjected.target === uncommitted && /HEALED/.test(legacyInjected.stderr) && !/ALREADY IN PROGRESS/.test(legacyInjected.stderr) && !legacyInjected.stateLeft),
    show(legacyInjected))
  // Identification is by argument, and a command that reads as nothing is a command. A kernel thread has an empty command line; a stranger can mention the name.
  const asCmd = text => commandOf(1, () => text)
  sc('commandOf: an empty command line is the empty string (a kernel thread), a failed read is null; and only a node process with proof-check.mjs among its arguments runs a proof-check',
    asCmd('') === '' && asCmd('\0') === '' && commandOf(1, () => { throw new Error('ENOENT') }) === null && asCmd('node\0scripts/proof-check.mjs\0--self-test\0') === 'node scripts/proof-check.mjs --self-test'
      && runsProofCheck('node scripts/proof-check.mjs') && runsProofCheck('/opt/node22/bin/node /x/scripts/proof-check.mjs --self-test') && runsProofCheck('node22 proof-check.mjs')
      && !runsProofCheck('') && !runsProofCheck('sleep 30') && !runsProofCheck("sh -c sleep 60; true vim-proof-check-notes.txt") && !runsProofCheck('vim scripts/proof-check.mjs')
      && !runsProofCheck('node scripts/other.mjs proof-check.mjs.bak') && !runsProofCheck('node'),
    'the kernel thread, the failed read, the real run in three spellings, and five strangers')
  sc('isStranger: a known command that is not a proof-check is one (the empty one too); an unreadable command is not',
    isStranger('') && isStranger('sleep 30') && !isStranger(null) && !isStranger('node scripts/proof-check.mjs'), 'empty, sleep, null, the real run')
  const liveNow = { kill: () => {}, stat: () => ({ state: 'S', start: '5' }) }
  sc('A MARKER WITH NO START OVER A KERNEL THREAD (an empty command line) IS A DEAD RUN\'S; a null start is read like a missing one',
    !runningElsewhere({ pid: 1 }, process.pid, liveNow, () => '') && !runningElsewhere({ pid: 1, start: null }, process.pid, liveNow, () => '') && !runningElsewhere({ pid: 1, start: null }, process.pid, liveNow, () => 'sleep 30')
      && runningElsewhere({ pid: 1, start: null }, process.pid, liveNow, () => 'node scripts/proof-check.mjs') && runningElsewhere({ pid: 1, start: null }, process.pid, liveNow, () => null),
    'empty command with no start, with a null start, a stranger with a null start; and the real run and an unreadable one still count')
  // The refusal's text, by shape. A proof-check that is hung is killed with -9; a pid nobody can identify is LOOKED AT, and the state is never offered for deletion.
  const refusalFor = (prior, holder) => refusalLines(prior, holder).join('\n')
  const hung = refusalFor({ pid: 77, startedAt: 't' }, 'node scripts/proof-check.mjs')
  const unknown = refusalFor({ pid: 77, startedAt: 't' }, null)
  const recorded = refusalFor({ pid: 77, start: '5', startedAt: 't' }, null)
  const nullStart = refusalFor({ pid: 77, start: null, startedAt: 't' }, null)
  sc('THE REFUSAL OVER A PID NOBODY CAN IDENTIFY SAYS TO LOOK AT IT: no kill -9, no advice to delete the state, and the state is called the only whole copy; over a proof-check or a recorded start it is the plain wait-or-kill',
    /ps -p 77/.test(unknown) && /only whole copy/.test(unknown) && !/kill -9/.test(unknown) && !/delete \.proof-state/.test(unknown) && /\(node scripts\/proof-check\.mjs\)/.test(hung)
      && /kill -9 77/.test(hung) && !/ps -p/.test(hung) && /kill -9 77/.test(recorded) && !/ps -p/.test(recorded) && !/delete \.proof-state/.test(`${hung}${recorded}`)
      && /ps -p 77/.test(nullStart) && !/kill/.test(nullStart) && /"pid": 0 in \.proof-state\/active\.json/.test(unknown),
    `unknown: ${unknown.replace(/\n/g, ' | ').slice(0, 300)}`)

  // The same pid with another start time is a RECYCLED pid: a different process holds that number now. It must not refuse (it
  // used to, forever, with a message that the tree was injected and a remedy that killed the stranger), and it is judged by the tree.
  // Needs /proc to say when a process started: where it cannot, a recycled pid cannot be told from the run and the signal's answer stands
  // (run-marker.mjs), so these two clauses are not asserted there. `haveProc` is printed with the verdict (Rule 91), not hidden by it.
  const haveProc = startOf(process.pid) !== null
  const recycled = sandbox({ target: clean, registry: union, backupTarget: oldClean, backupRegistry: oldUnion, pid: process.pid, start: '1' })
  sc(`A RECYCLED PID DOES NOT REFUSE: the marker is judged by the tree, as a dead run's (asserted: ${haveProc})`,
    !haveProc || (recycled.target === clean && recycled.registry === union && /STALE STATE DISCARDED/.test(recycled.stderr)
      && !/ALREADY IN PROGRESS/.test(recycled.stderr) && carriedOn(recycled) && !recycled.stateLeft),
    show(recycled))
  // ...and the same pid with the SAME start but a stranded injection still refuses: identity, not a blanket pass for every pid.
  sc(`liveness is judged on both the pid and its start: the real start time refuses, a wrong one does not (asserted: ${haveProc})`,
    liveRun.stderr.includes('ALREADY IN PROGRESS') && (!haveProc || !recycled.stderr.includes('ALREADY IN PROGRESS')),
    'the two sandbox runs differ only in the recorded start time')


  // A REAL TWO-PHASE RUN, with a stand-in for dotnet that records what is on disk when each build is asked for, and in one variant kills the
  // run at the moment phase 2 builds. Phase 2 is where the registry carries its probe case; the marker used to be dropped with phase 1's files,
  // so a kill here stranded the probe with nothing on disk to say so, and a second run started here was not refused. The stand-in answers every
  // build with success and no output, which is enough for the run to walk through both phases, and it finds the run's pid in its own marker.
  const twoPhase = () => {
    const dir = mkdtempSync(join(tmpdir(), 'proof-phase2-'))
    try {
      for (const d of ['src', 'docs', 'bin']) mkdirSync(join(dir, d))
      writeFileSync(join(dir, TARGET), clean)
      writeFileSync(join(dir, REGISTRY), union)
      writeFileSync(join(dir, 'docs/SANDBOX-PROOF.md'), '<!-- proof: FS0001 -->\n```fsharp\nlet x = 1\n```\n')
      writeFileSync(join(dir, 'bin/dotnet'), [
        '#!/bin/sh',
        'probe=$(grep -c "| NHL" src/Desk.fs 2>/dev/null || echo 0)',
        'state=absent; [ -f .proof-state/active.json ] && state=present',
        'fp=absent; [ -n "$(sed -n \'s/.*"start": *"\\{0,1\\}\\([0-9][0-9]*\\).*/\\1/p\' .proof-state/active.json 2>/dev/null)" ] && fp=present',
        'echo "state=$state probe=$probe fp=$fp" >> "$PWD/calls.log"',
        'if [ "$KILL_IN_PHASE_2" = 1 ] && [ "$probe" -ge 2 ]; then',
        '  pid=$(sed -n \'s/.*"pid": *\\([0-9][0-9]*\\).*/\\1/p\' .proof-state/active.json)',
        '  [ -n "$pid" ] && kill -9 "$pid"',
        'fi',
        'exit 0', '',
      ].join('\n'), { mode: 0o755 })
      const go = extraEnv => spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
        cwd: dir, encoding: 'utf8', timeout: 120_000,
        env: { ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH}`, ...extraEnv },
      })
      const calls = () => (existsSync(join(dir, 'calls.log')) ? readFileSync(join(dir, 'calls.log'), 'utf8').trim().split('\n') : [])
      const read = p => readFileSync(join(dir, p), 'utf8')
      const killed = go({ KILL_IN_PHASE_2: '1' })
      const stranded = { registry: read(REGISTRY), target: read(TARGET), stateLeft: existsSync(join(dir, MARKER_FILE)), calls: calls() }
      const healed = go({})
      return { killed, stranded, healed, final: { registry: read(REGISTRY), target: read(TARGET), stateLeft: existsSync(join(dir, STATE_DIR)) }, calls: calls() }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
  const p2 = twoPhase()
  sc('A KILL IN PHASE 2 STRANDS THE PROBE WITH ITS MARKER STILL ON DISK: the registry holds the probe, the state is there to heal from',
    p2.killed.signal === 'SIGKILL' && p2.stranded.registry === probeRegistry(union) && p2.stranded.target === clean && p2.stranded.stateLeft,
    `signal ${p2.killed.signal}, registry stranded ${p2.stranded.registry === probeRegistry(union)}, state left ${p2.stranded.stateLeft}, builds: ${p2.stranded.calls.join(' ; ')}`)
  sc('...and the next run HEALS the registry from it, leaving the target alone',
    /HEALED/.test(p2.healed.stderr) && /src\/Desk\.fs/.test(p2.healed.stderr) && p2.final.registry === union && p2.final.target === clean && !p2.final.stateLeft,
    `registry back ${p2.final.registry === union}, state left ${p2.final.stateLeft}; ${p2.healed.stderr.slice(0, 160).replace(/\n/g, ' | ')}`)
  // The start time is only recordable where /proc can say when a process started; elsewhere the marker has none, and the stand-in sees fp=absent.
  const fpSeen = haveProc ? 'present' : 'absent'
  sc(`the marker is on disk for EVERY build, phase 1 and phase 2 alike, and it records when the run started (start time asserted: ${haveProc})`,
    p2.stranded.calls.length >= 2 && p2.stranded.calls.every(c => new RegExp(`^state=present .*fp=${fpSeen}$`).test(c)) && p2.stranded.calls.at(-1) === `state=present probe=2 fp=${fpSeen}`,
    `builds saw: ${p2.stranded.calls.join(' ; ')}`)

  // A restore that cannot write leaves a tracked file injected. The state must stay then: it is the only thing that can put the file right. The stand-in breaks the target on the
  // first build that sees the injection, two ways: it becomes a directory (every write throws EISDIR, as a full disk or EIO would), or a link to /dev/null (every write succeeds and
  // lands nowhere, so only reading the file back can tell).
  const restoreFault = how => {
    const dir = mkdtempSync(join(tmpdir(), 'proof-restore-'))
    try {
      for (const d of ['src', 'docs', 'bin']) mkdirSync(join(dir, d))
      writeFileSync(join(dir, TARGET), clean)
      writeFileSync(join(dir, REGISTRY), union)
      writeFileSync(join(dir, 'docs/SANDBOX-PROOF.md'), '<!-- proof: FS0001 -->\n```fsharp\nlet x = 1\n```\n')
      const breakIt = how === 'directory' ? 'mkdir src/Scoreboard.fs' : 'ln -s /dev/null src/Scoreboard.fs'
      writeFileSync(join(dir, 'bin/dotnet'), ['#!/bin/sh', `if grep -q "__proof" src/Scoreboard.fs 2>/dev/null; then rm -f src/Scoreboard.fs; ${breakIt}; fi`, 'exit 0', ''].join('\n'), { mode: 0o755 })
      const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
        cwd: dir, encoding: 'utf8', timeout: 120_000, env: { ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH}` },
      })
      return {
        status: r.status, broken: (() => { try { return how === 'directory' ? readdirSync(join(dir, TARGET)).length === 0 : readFileSync(join(dir, TARGET), 'utf8') === '' } catch { return false } })(),
        backup: existsSync(join(dir, BACKUP)) ? readFileSync(join(dir, BACKUP), 'utf8') : null, marker: existsSync(join(dir, MARKER_FILE)),
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
  const failedRestores = ['directory', 'nowhere'].map(how => ({ how, ...restoreFault(how) }))
  sc('A RESTORE THAT CANNOT WRITE, OR WRITES NOWHERE, KEEPS THE STATE: the backup and the marker are still on disk, for the next run to heal from',
    failedRestores.every(f => f.broken && f.backup === clean && f.marker),
    failedRestores.map(f => `${f.how}: target was broken ${f.broken}, backup kept ${f.backup === clean}, marker kept ${f.marker}, status ${f.status}`).join(' / '))

  // A restore that fails at the END of a run whose checks all passed, on the REGISTRY (the second file written), and the run after it. The stand-in compiler is exact: every injected proof
  // function whose body is not the clean control is an FS0001 on its first body line, and the registry phase (the probe's `| NHL`) is an FS0025 naming NHL, so all the run's checks pass;
  // then the registry becomes a link to /dev/null, which accepts the final write and reads back empty. The run must still FAIL and SAY SO (it ended `8/8 checks passed`, exit 0, with a
  // tracked file broken and nothing said). The run after it, on a working compiler, finds a registry that is not its backup, no probe on it, and a marker that says the restore failed:
  // it must keep the state and name the file (it classified the empty file as stale and deleted the only whole copy).
  const tornRegistry = ({ breakMarker = false, breakSentinel = false } = {}) => {
    const dir = mkdtempSync(join(tmpdir(), 'proof-torn-'))
    try {
      for (const d of ['src', 'docs', 'bin']) mkdirSync(join(dir, d))
      writeFileSync(join(dir, TARGET), clean)
      writeFileSync(join(dir, REGISTRY), oldUnion)
      writeFileSync(join(dir, 'docs/SANDBOX-PROOF.md'), '<!-- proof: FS0001 -->\n```fsharp\nlet x = 1\n```\n')
      const compiler = tear => [
        '#!/bin/sh',
        'if grep -q "| NHL" src/Desk.fs 2>/dev/null; then',
        '  echo "src/Desk.fs(9,1): error FS0025: Incomplete matches, for example NHL"',
        ...(tear ? ['  rm -f src/Desk.fs; ln -s /dev/null src/Desk.fs'] : []),
        ...(tear && breakMarker ? ['  rm -f .proof-state/active.json; mkdir .proof-state/active.json'] : []),
        ...(tear && breakSentinel ? ['  mkdir .proof-state/restore-pending'] : []),
        '  exit 1',
        'fi',
        `awk '/^let private __proof/ { h=NR; next } h && NR==h+1 && $0 !~ /^    ""$/ { printf "src/Scoreboard.fs(%d,5): error FS0001: fake\\n", NR; h=0 }' src/Scoreboard.fs`,
        'exit 0', '',
      ].join('\n')
      const go = () => spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { cwd: dir, encoding: 'utf8', timeout: 120_000, env: { ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH}` } })
      writeFileSync(join(dir, 'bin/dotnet'), compiler(true), { mode: 0o755 })
      const first = go()
      const marker = (() => { try { return JSON.parse(readFileSync(join(dir, MARKER_FILE), 'utf8')) } catch { return null } })()
      const pendingAfterFirst = existsSync(join(dir, PENDING_FILE))
      writeFileSync(join(dir, 'bin/dotnet'), compiler(false), { mode: 0o755 })
      const second = go()
      return {
        first, marker, pendingAfterFirst, second, secondStateLeft: existsSync(join(dir, STATE_DIR)),
        backupRegistry: existsSync(join(dir, `${BACKUP}.registry`)) ? readFileSync(join(dir, `${BACKUP}.registry`), 'utf8') : null,
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
  const torn = tornRegistry()
  const allPassed = /(\d+)\/\1 checks passed/.test(torn.first.stdout)
  sc('A RESTORE THAT FAILS AFTER EVERY CHECK PASSED STILL FAILS THE RUN AND SAYS SO: exit 1, the file named on stderr, the state kept and its marker recording why',
    allPassed && torn.first.status === 1 && /could NOT be put back/.test(torn.first.stderr) && /src\/Desk\.fs/.test(torn.first.stderr)
      && torn.marker !== null && torn.marker.restoreFailed === true && torn.backupRegistry === oldUnion,
    `all checks passed ${allPassed}, status ${torn.first.status}, marker ${JSON.stringify(torn.marker && { restoreFailed: torn.marker.restoreFailed })}, stderr: ${torn.first.stderr.slice(0, 200).replace(/\n/g, ' | ')}`)
  // The target the same way: a file that is not its backup, carries no injection and keeps its anchor is stale to a marker that does not say the restore failed, and torn to one that does.
  const tornTail = `${clean}// the rest of a write that stopped here`
  const tornTargetAfterFailure = sandbox({ target: tornTail, registry: union, backupTarget: clean, backupRegistry: union, pid: DEAD, markerExtra: { restoreFailed: true } })
  const sameTargetNoFlag = sandbox({ target: tornTail, registry: union, backupTarget: clean, backupRegistry: union, pid: DEAD })
  sc('A TARGET THAT IS NOT ITS BACKUP, AFTER A RESTORE THAT FAILED, KEEPS THE STATE AND IS NAMED; the same file under a marker that says nothing of a failure is stale as before',
    tornTargetAfterFailure.status === 1 && !/STALE/.test(tornTargetAfterFailure.stderr) && /nothing was written/.test(tornTargetAfterFailure.stderr)
      && /src\/Scoreboard\.fs is not what that run backed up/.test(tornTargetAfterFailure.stderr) && tornTargetAfterFailure.stateLeft && tornTargetAfterFailure.target === tornTail
      && /STALE STATE DISCARDED/.test(sameTargetNoFlag.stderr) && !sameTargetNoFlag.stateLeft,
    `after a failure: ${show(tornTargetAfterFailure)}; no flag: ${show(sameTargetNoFlag)}`)
  // The record of a failed restore must not depend on the marker being writable: it shares a directory, and a fault, with the file that did not come back. The sentinel the restore
  // creates first is the second record. Here the marker CANNOT be written (a directory stands in its place), the registry is torn, and the next run must still keep the state.
  const tornNoMarker = tornRegistry({ breakMarker: true })
  sc('A FAILED RESTORE IS REMEMBERED EVEN WHEN THE MARKER CANNOT BE WRITTEN: the sentinel is there, the run still fails and says the files were kept, and the next run keeps the state instead of discarding it as stale',
    tornNoMarker.first.status === 1 && tornNoMarker.pendingAfterFirst && /could NOT be put back/.test(tornNoMarker.first.stderr) && !/could NOT be recorded/.test(tornNoMarker.first.stderr)
      && tornNoMarker.second.status === 1 && !/STALE/.test(tornNoMarker.second.stderr) && /src\/Desk\.fs is not what that run backed up/.test(tornNoMarker.second.stderr) && tornNoMarker.secondStateLeft,
    `first: status ${tornNoMarker.first.status}, sentinel ${tornNoMarker.pendingAfterFirst}; second: status ${tornNoMarker.second.status}, state left ${tornNoMarker.secondStateLeft}; ${tornNoMarker.second.stderr.slice(0, 200).replace(/\n/g, ' | ')}`)
  // When NOTHING can be recorded (the marker and the sentinel are both directories), the run does not claim that the next run will know: it says it could not record it.
  const tornNoRecord = tornRegistry({ breakMarker: true, breakSentinel: true })
  sc('A FAILED RESTORE THAT CANNOT BE RECORDED AT ALL SAYS SO: the run fails, names the file, and tells a person not to run proof-check again until the files are right',
    tornNoRecord.first.status === 1 && /could NOT be put back/.test(tornNoRecord.first.stderr) && /could NOT be recorded/.test(tornNoRecord.first.stderr) && /do not run proof-check again/.test(tornNoRecord.first.stderr),
    `status ${tornNoRecord.first.status}; ${tornNoRecord.first.stderr.slice(0, 300).replace(/\n/g, ' | ')}`)
  // The sentinel alone (a kill in the middle of a restore writes it and nothing else) makes a torn file torn: a marker that says nothing, a file that is not its backup.
  const sentinelOnly = sandbox({ target: clean, registry: '', backupTarget: clean, backupRegistry: union, pid: DEAD, files: { [PENDING_FILE]: '' } })
  sc('THE SENTINEL ALONE KEEPS THE STATE: a marker that says nothing of a failure, a restore-pending file, and a registry that is not its backup is diverged, not stale',
    sentinelOnly.status === 1 && !/STALE/.test(sentinelOnly.stderr) && /src\/Desk\.fs is not what that run backed up/.test(sentinelOnly.stderr) && sentinelOnly.stateLeft && !carriedOn(sentinelOnly),
    show(sentinelOnly))
  // A run killed in the middle of its restore, with a file that IS provably its injection: healed, with the sentinel or the flag, like any other.
  const flaggedInjected = sandbox({ target: injectedClean, registry: union, backupTarget: clean, backupRegistry: union, pid: DEAD, markerExtra: { restoreFailed: true } })
  const flaggedProbed = sandbox({ target: clean, registry: probeRegistry(union), backupTarget: clean, backupRegistry: union, pid: DEAD, markerExtra: { restoreFailed: true } })
  const pendingInjected = sandbox({ target: injectedClean, registry: union, backupTarget: clean, backupRegistry: union, pid: DEAD, files: { [PENDING_FILE]: '' } })
  sc('AFTER A FAILED RESTORE, A FILE THAT IS PROVABLY THE RUN\'S OWN INJECTION IS STILL HEALED from its backup (the target, the registry, and the target under the sentinel alone), and the state is dropped',
    flaggedInjected.target === clean && /HEALED/.test(flaggedInjected.stderr) && !flaggedInjected.stateLeft
      && flaggedProbed.registry === union && /HEALED/.test(flaggedProbed.stderr) && !flaggedProbed.stateLeft
      && pendingInjected.target === clean && /HEALED/.test(pendingInjected.stderr) && !pendingInjected.stateLeft,
    `target: ${show(flaggedInjected)}; registry: ${show(flaggedProbed)}; sentinel: ${show(pendingInjected)}`)
  // One healable and one torn: nothing is written, and only the torn one is named (the healable file's backup is also kept, because the state is one directory).
  const mixedAfterFailure = sandbox({ target: injectedClean, registry: '', backupTarget: clean, backupRegistry: union, pid: DEAD, markerExtra: { restoreFailed: true } })
  sc('ONE FILE HEALABLE AND ONE TORN, AFTER A FAILED RESTORE: nothing is written, the state is kept, and the message names only the torn file',
    mixedAfterFailure.status === 1 && mixedAfterFailure.target === injectedClean && /src\/Desk\.fs is not what that run backed up/.test(mixedAfterFailure.stderr)
      && !/src\/Scoreboard\.fs is not what/.test(mixedAfterFailure.stderr) && /Put src\/Desk\.fs right by hand/.test(mixedAfterFailure.stderr) && mixedAfterFailure.stateLeft,
    show(mixedAfterFailure))
  sc('...and the NEXT run does not discard that state as stale: it stops, writes nothing, names the registry as possibly torn, and leaves the backup',
    torn.second.status === 1 && !/STALE/.test(torn.second.stderr) && /nothing was written/.test(torn.second.stderr) && /src\/Desk\.fs is not what that run backed up/.test(torn.second.stderr)
      && torn.secondStateLeft && torn.backupRegistry === oldUnion,
    `status ${torn.second.status}, state left ${torn.secondStateLeft}; ${torn.second.stderr.slice(0, 240).replace(/\n/g, ' | ')}`)

  // liveness, against real pids and an injected /proc: the one fact this file cannot get wrong without the refusal above being decorative.
  const me = { pid: process.pid, start: startOf(process.pid) }
  sc('this process reads as live, with its real start time and with none recorded',
    isLive(me) && isLive({ pid: process.pid }), `pid ${process.pid} start ${me.start}`)
  sc('a pid that cannot exist reads as dead', !isLive({ pid: 2 ** 30, start: '1' }), 'pid 2^30')
  sc('a malformed pid reads as dead', !isLive({ pid: null }) && !isLive({ pid: 0 }) && !isLive({ pid: -1 }) && !isLive({}),
    'null, 0, -1 and no pid at all must not be treated as running processes')
  sc(`A RECYCLED PID READS AS DEAD: a live process, a different start time (asserted: ${haveProc})`,
    !haveProc || !isLive({ pid: process.pid, start: '1' }), 'the pid answers signal 0 but is not the process the marker recorded')
  // The parse, pinned to a line in the shape the kernel writes (a command name with spaces and a parenthesis in it, then 20 more fields), and
  // to two real processes: this one and a child asked for its own stat, whose start times must differ and be digits.
  const kernelLine = '1234 (a) b (c) S 1 1 1 0 -1 0 0 0 0 0 0 0 0 0 20 0 1 0 424242 0 0 0'
  sc('parseStat: the state is the letter after the LAST parenthesis and the start time is field 22',
    JSON.stringify(parseStat(kernelLine)) === JSON.stringify({ state: 'S', start: '424242' }) && parseStat('no parenthesis') === null && parseStat('1 (x) S 1 2') === null,
    JSON.stringify(parseStat(kernelLine)))
  const childStat = haveProc ? parseStat(execSync('cat /proc/self/stat', { encoding: 'utf8' })) : null
  sc(`parseStat: two real processes have different start times, both digits (asserted: ${haveProc})`,
    !haveProc || (childStat !== null && /^\d+$/.test(childStat.start) && /^\d+$/.test(me.start) && childStat.start !== me.start),
    `this process ${me.start}, a child ${childStat?.start}`)
  sc('A ZOMBIE READS AS DEAD: it answers signal 0 and is not running',
    !isLive(me, { stat: () => ({ state: 'Z', start: me.start }) }), 'state Z, the start time matching')
  sc('A PROCESS BEING TORN DOWN (state X) READS AS DEAD, like a zombie',
    !isLive(me, { stat: () => ({ state: 'X', start: me.start }) }) && isLive(me, { stat: () => ({ state: 'S', start: me.start }) }), 'state X, the start time matching; state S is the control')
  // EPERM from signal 0 means the process exists and is somebody else's: alive. Any other error (ESRCH) means there is no such process. Both through an injected kill, since
  // a test run as one user cannot signal-0 another user's pid on demand.
  const raise = code => () => { throw Object.assign(new Error(code), { code }) }
  sc('EPERM FROM SIGNAL 0 READS AS ALIVE (a process of another user), ESRCH AS DEAD',
    isLive(me, { kill: raise('EPERM'), stat: () => ({ state: 'S', start: me.start }) }) && !isLive(me, { kill: raise('ESRCH'), stat: () => ({ state: 'S', start: me.start }) }),
    'the EPERM branch is what keeps a run of another user from being read as gone')
  // ...and a REAL zombie: a child that has exited and has not been reaped. The loop does not turn while this runs, so nothing reaps it (the claim that a Node test cannot make one was wrong).
  const zombie = (() => {
    if (!haveProc) return null
    const child = spawn('true', [], { stdio: 'ignore' })
    for (let waited = 0; waited < 60 && statOf(child.pid)?.state !== 'Z'; waited++) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
    return { state: statOf(child.pid)?.state ?? null, withStart: isLive({ pid: child.pid, start: startOf(child.pid) }), noStart: isLive({ pid: child.pid }) }
  })()
  sc(`A REAL ZOMBIE READS AS DEAD, with or without a recorded start (asserted: ${haveProc})`,
    zombie === null || (zombie.state === 'Z' && !zombie.withStart && !zombie.noStart), JSON.stringify(zombie))
  sc('no /proc to read: the signal\'s answer stands, in both directions',
    isLive(me, { stat: () => null }) && !isLive({ pid: 2 ** 30 }, { stat: () => null }), 'a platform without /proc is judged as before')
  sc('our own pid is never "another run still going", with or without a recorded start',
    !runningElsewhere({ pid: process.pid }) && !runningElsewhere(me) && runningElsewhere({ pid: 1, start: undefined }, process.pid, { kill: () => {}, stat: () => ({ state: 'S', start: '5' }) }, () => 'node scripts/proof-check.mjs'),
    'a marker naming our pid is a dead run\'s, recycled to us; another pid that is running a proof-check still counts')
  // With no recorded start the marker is judged by the pid alone, and a pid is a number: what it is running decides. A stranger is not the run; a pid /proc cannot describe is not
  // called a stranger (it cannot be told), and a proof-check is the run.
  const live = { kill: () => {}, stat: () => ({ state: 'S', start: '5' }) }
  sc('A MARKER WITH NO START OVER A PID RUNNING SOMETHING ELSE IS NOT A RUN STILL GOING; over a proof-check, or a pid that cannot be read, it is',
    !runningElsewhere({ pid: 1 }, process.pid, live, () => 'sleep 30') && runningElsewhere({ pid: 1 }, process.pid, live, () => 'node scripts/proof-check.mjs')
      && runningElsewhere({ pid: 1 }, process.pid, live, () => null) && runningElsewhere({ pid: 1, start: '5' }, process.pid, live, () => 'sleep 30'),
    'a recorded start is identity enough, whatever the command says')
  sc('no marker is not a run elsewhere', runningElsewhere(null) === false, 'null prior state')

  // --- the batch: where a case's lines are, and which errors are its own ----
  //
  // Each clause was made to fail on purpose before it was trusted (Rule 90):
  // 18 mutations of the code these clauses cover (move a boundary, drop the range
  // test, trust the code anywhere in the output, accept a longer file name, ...)
  // were applied to a copy and each turned the self-test red; the list and the
  // result are in outbox/proof-check-sweeps-2026-11-03.txt. That sweep is not a
  // script in the repo, so a new clause here is only as trusted as the person
  // who adds it makes it. The block runs on strings, so it costs nothing, and it
  // is the half of the batch a real compile cannot check: a range shifted by a
  // few lines still confirms every case whose neighbour fails the same way, and
  // the real cases would never say so.
  const src = `open X\n\n${ANCHOR}\n    ""\n`
  const two = [{ code: 'FS0001', body: 'a\nb' }, { code: 'FS0025', body: 'c' }]
  const lay = layout(src, two)
  const lines = lay.text.split('\n')
  const [r0, r1] = lay.ranges

  sc('layout: each range starts on its own function header',
    lines[r0.first - 1].startsWith('let private __proof0') && lines[r1.first - 1].startsWith('let private __proof1'),
    `line ${r0.first}: ${lines[r0.first - 1]} | line ${r1.first}: ${lines[r1.first - 1]}`)
  sc('layout: each range ends on its last body line, and a blank line follows',
    lines[r0.last - 1] === '    b' && lines[r0.last] === '' && lines[r1.last - 1] === '    c' && lines[r1.last] === '',
    `line ${r0.last}: ${JSON.stringify(lines[r0.last - 1])} then ${JSON.stringify(lines[r0.last])}`)
  sc('layout: ranges are disjoint and in order', r0.last < r1.first, `${JSON.stringify(lay.ranges)}`)
  sc('layout: the anchor and the code under it survive, once',
    lay.text.split(ANCHOR).length === 2 && lay.text.endsWith(`${ANCHOR}\n    ""\n`),
    'the injected block must sit directly above the anchor')
  sc('layout: a body containing $& and $\' is written verbatim, not as a replacement pattern',
    layout(src, [{ code: 'FS0001', body: 'let s = "$& $\' $$"' }]).text.includes('let s = "$& $\' $$"'),
    'String.replace would have expanded these')
  sc('layout: an empty case list changes nothing', layout(src, []).text === src, 'text must equal the source')

  const e = (line, code) => ({ line, code })
  const att = (errs, cs = two) => attribute(cs, lay.ranges, errs)
  sc('attribute: the stated code inside the case\'s own lines confirms it',
    att([e(r0.first + 1, 'FS0001')]).per[0].confirmed === true, 'an error on a body line, same code')
  sc('attribute: the stated code on the header line and on the last line both count',
    att([e(r0.first, 'FS0001')]).per[0].confirmed && att([e(r0.last, 'FS0001')]).per[0].confirmed,
    'the range is inclusive at both ends')
  sc('attribute: one line before and one line after the range do NOT count',
    !att([e(r0.first - 1, 'FS0001')]).per[0].confirmed && !att([e(r0.last + 1, 'FS0001')]).per[0].confirmed,
    'the blank line after a case belongs to nobody')
  sc('attribute: the right code in the NEIGHBOUR\'s lines does not confirm this case',
    !att([e(r1.first + 1, 'FS0001')]).per[0].confirmed, 'case 0 claims FS0001; the FS0001 is in case 1')
  sc('attribute: another code in the case\'s own lines does not confirm it',
    !att([e(r0.first + 1, 'FS0025')]).per[0].confirmed, 'wrong code only')
  sc('attribute: no error at all confirms nothing', att([]).per.every(p => !p.confirmed), 'a clean compile')
  sc('attribute: a case with several codes is confirmed by any one of them',
    att([e(r1.first + 1, 'FS0001'), e(r1.first + 1, 'FS0025')]).per[1].confirmed
      && att([e(r1.first + 1, 'FS0001'), e(r1.first + 1, 'FS0025')]).per[1].codes.join() === 'FS0001,FS0025',
    'the serial run asked only whether the stated code appeared')
  sc('attribute: an error on the blank line is a stray, and is reported',
    att([e(r0.last + 1, 'FS0001')]).strays.length === 1 && att([e(r0.first + 1, 'FS0001')]).strays.length === 0,
    'strays mean the ranges or the baseline are off')

  const real = '/x/src/Scoreboard.fs(434,9): error FS0025: Incomplete matches [/x/src/Laboratory.fsproj]'
  const rng = '/x/src/Scoreboard.fs(12,3,12,9): error FS0001: type mismatch'
  sc('parseErrors: reads the point form and the range form, and the line is the first number',
    JSON.stringify(parseErrors(`${real}\n${rng}`)) === JSON.stringify([e(434, 'FS0025'), e(12, 'FS0001')]),
    JSON.stringify(parseErrors(`${real}\n${rng}`)))
  sc('parseErrors: ignores an error in a file that merely ENDS in Scoreboard.fs',
    parseErrors('/x/src/OldScoreboard.fs(5,1): error FS0025: x\n/x/src/my-Scoreboard.fs(5,1): error FS0025: x').length === 0
      && parseErrors('Scoreboard.fs(5,1): error FS0025: x').length === 1,
    'a bare relative path still counts; a longer file name does not')
  sc('parseErrors: ignores a warning, an error in another file, and prose that mentions a code',
    parseErrors('/x/src/Scoreboard.fs(5,1): warning FS0025: x\n/x/src/Desk.fs(5,1): error FS0025: x\nerror FS0025 happened')
      .length === 0, 'only Scoreboard.fs errors can be attributed to a case')

  // finish() maps the failure count to 0 or 1. A bare count is the exit status otherwise, and exactly three
  // failing clauses exit 3, which mutation-check reads as "this row has no subject" and skips.
  finish(ss())
  process.exit()
}

// Repair before doing anything else, so a previous interrupted run cannot make
// this one report against an injected tree.
const currentTarget = readFileSync(TARGET, 'utf8')
const currentRegistry = readFileSync(REGISTRY, 'utf8')
const injectedNow = currentTarget.includes(MARKER)
const priorState = existsSync(MARKER_FILE)
  ? (() => { try { return JSON.parse(readFileSync(MARKER_FILE, 'utf8')) } catch { return {} } })()
  : null
const readIf = f => (existsSync(f) ? readFileSync(f, 'utf8') : null)
const backupTarget = readIf(BACKUP)
const backupRegistry = readIf(`${BACKUP}.registry`)
const targetStranded = strandedTarget(currentTarget, backupTarget)
const registryStranded = strandedRegistry(currentRegistry, backupRegistry)

// A restore that did not finish: the marker says so, or the sentinel the restore created first is still there.
const restoreFlagged = (priorState !== null && priorState.restoreFailed === true) || existsSync(PENDING_FILE)

switch (classifyState({
  markerExists: priorState !== null,
  alive: runningElsewhere(priorState),
  injected: injectedNow,
  anchored: currentTarget.includes(ANCHOR),
  targetStranded,
  registryStranded,
  registryInjected: probeOnRegistry(currentRegistry),
  restoreFailed: restoreFlagged,
  targetIntact: backupTarget !== null && currentTarget === backupTarget,
  registryIntact: backupRegistry !== null && currentRegistry === backupRegistry,
})) {
  case 'refuse':
    for (const line of refusalLines(priorState, commandOf(priorState.pid))) console.error(line)
    // No restore is registered yet, deliberately: exiting here must not touch
    // the other run's backups.
    process.exit(1)
    break

  case 'heal': {
    // Each file only if it is provably this script's own injection; a file that is not is
    // left exactly as it is, whatever the other one needed.
    const restored = []
    if (targetStranded) { writeFileSync(TARGET, backupTarget); restored.push(TARGET) }
    if (registryStranded) { writeFileSync(REGISTRY, backupRegistry); restored.push(REGISTRY) }
    rmSync(STATE_DIR, { recursive: true, force: true })
    console.error(`proof-check: HEALED — a previous run (pid ${priorState.pid}) was killed with `
      + `${restored.join(' and ')} injected. Restored ${restored.length > 1 ? 'them' : 'it'} before measuring anything.`)
    break
  }

  case 'stale':
    // A marker, no process, nothing of ours on either file, and a target that still has its
    // anchor: nothing is stranded. The backups were taken when that run started and are as
    // old as the marker, so they are not written back; they go with the rest of the state.
    rmSync(STATE_DIR, { recursive: true, force: true })
    console.error(`proof-check: STALE STATE DISCARDED — the marker names pid ${priorState.pid ?? 'unknown'} `
      + `(started ${priorState.startedAt ?? 'unknown'}), but nothing it injected is on ${TARGET} or ${REGISTRY}. `
      + 'Its backups were NOT written back: nothing needs healing, and they may predate the tree.')
    break

  case 'diverged':
    // The target is not in a state the backups describe: it carries injected proof code the
    // file has moved on from, or it has no anchor and may be torn. Healing would overwrite
    // that work and discarding would lose the only copy of what the run found, so neither.
    // No restore is registered yet, deliberately: exiting here touches nothing.
    const reasons = []   // [file, why]
    if (injectedNow && !targetStranded) reasons.push([TARGET, `${TARGET} carries injected proof code and has changed since`])
    if (probeOnRegistry(currentRegistry) && !registryStranded) reasons.push([REGISTRY, `${REGISTRY} carries the probe case and has changed since`])
    // A run whose restore did not read back: a file that is not what it backed up may be torn (and must not be called stale), the backup being the only whole copy.
    if (restoreFlagged) {
      if (!targetStranded && currentTarget !== backupTarget) reasons.push([TARGET, `${TARGET} is not what that run backed up, and its restore did not read back, so it may be torn`])
      if (!registryStranded && currentRegistry !== backupRegistry) reasons.push([REGISTRY, `${REGISTRY} is not what that run backed up, and its restore did not read back, so it may be torn`])
    }
    if (reasons.length === 0) reasons.push([TARGET, `${TARGET} has no injection anchor, so it may be torn`])
    console.error(`proof-check: a previous run (pid ${priorState.pid ?? 'unknown'}, started `
      + `${priorState.startedAt ?? 'unknown'}) did not finish cleanly (it was killed, or its restore did not read back), and a file is not in a state its backups `
      + `describe: ${reasons.map(r => r[1]).join('; ')}. `
      + 'Writing them back would overwrite that work, so nothing was written.')
    console.error(`The files as that run found them are ${BACKUP} and ${BACKUP}.registry. Put ${[...new Set(reasons.map(r => r[0]))].join(' and ')} right by hand, `
      + `then: rm -rf ${STATE_DIR}`)
    process.exit(1)
    break

  case 'proceed':
    // An injected tree with NO marker is the pre-2026-09-07 world: the state was
    // lost entirely, so there is nothing to restore from and guessing would mean
    // discarding whatever else is uncommitted in these files.
    // The registry's probe case too: with no state to say it is ours it would be adopted as the original (and the baseline then fails on FS0025, which is the
    // failure this guard names for the target).
    {
      const strays = []
      if (injectedNow) strays.push(TARGET)
      if (probeOnRegistry(currentRegistry)) strays.push(REGISTRY)
      if (strays.length) {
        console.error(`proof-check: ${strays.join(' and ')} contain${strays.length > 1 ? '' : 's'} injected proof code (${strays.length > 1 ? 'the target and the probe case' : strays[0] === TARGET ? 'the proof functions' : 'the probe case'}) and no run state exists.`)
        console.error(`Restore ${strays.length > 1 ? 'them' : 'it'} (git checkout -- ${strays.join(' ')}) before re-running.`)
        process.exit(1)
      }
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
const runMarker = {
  pid: process.pid,
  start: startOf(process.pid),
  startedAt: STARTED_AT.toISOString(),
  target: TARGET,
  registry: REGISTRY,
}
writeFileSync(MARKER_FILE, JSON.stringify(runMarker, null, 2) + '\n')

// The original is held in memory AND on disk (in .proof-state, in the repo), and put back when the run ends or throws. This script is one synchronous run with no await, so a
// signal handler cannot run until it is over (a plain kill is not acted on in the meantime; measured in review 4), and a plain kill is not what leaves the tree broken here:
// SIGKILL is, and the state on disk and the next run's heal are the answer to that. (A plain try/finally does not run on SIGTERM either, which is how the tree got left broken before the state existed.)
// NOT one-shot. An earlier version guarded this with a `restored` flag, so the
// second phase's `finally` was a no-op after the first phase had already
// restored — leaving the mutated Sport union on disk and every later run
// failing its own baseline. Writing the originals back is idempotent; there is
// nothing to guard against.
//
// TWO STEPS, NOT ONE (2026-11-04). The files go back at the end of EACH phase; the
// marker and the backups go only when the whole run is over. They used to go with the
// first phase's files, so the registry phase, which writes its probe case into
// src/Desk.fs, ran with nothing on disk saying so: a SIGKILL there stranded the probe
// with no marker, the next run adopted it as the original and failed its baseline on
// FS0025 until someone ran `git checkout`, and a second run started during that
// phase was not refused. With the state kept, a kill in phase 2 classifies as a
// stranded registry and is healed, and a live run in phase 2 is refused.
// TRUE ONLY IF BOTH FILES READ BACK AS THEY WERE. The state is dropped on that answer and no other: a write that failed (a full disk, a lock, EIO) leaves a tracked file
// injected, and the backups on disk are then the only thing that can put it right. The previous version dropped the state whether or not the files went back, so after a
// failed write the next run found a mutated file and no state, and the only advice it had was `git checkout --`, which discards whatever else is uncommitted in the file.
const restoreFiles = () => {
  try {
    writeFileSync(TARGET, source)
    writeFileSync(REGISTRY, registrySource)
    return readFileSync(TARGET, 'utf8') === source && readFileSync(REGISTRY, 'utf8') === registrySource
  } catch {
    return false // best effort — the on-disk backups are the fallback, and they stay
  }
}
// The marker goes with the backups. A marker outliving its backups is the dead end
// the write order above exists to avoid, and leaving one behind would make the NEXT
// run refuse against a pid that has exited.
const dropState = () => {
  try { rmSync(STATE_DIR, { recursive: true, force: true }) } catch { /* nothing to drop */ }
}
// A restore that did not read back says so, three ways. The state stays (above). It is RECORDED, because the next run cannot otherwise tell a torn file from an old one: a
// half-written file keeps its anchor and is neither the original nor this run's injection, which it classified as stale and discarded the state over, the only whole copy. The
// record is a sentinel created BEFORE the restore (PENDING_FILE) as well as a flag written into the marker after it: a marker written after a failed restore shares that
// restore's fault, and a kill in the middle of it writes neither. And the run says it, in its output and its exit status: it used to end `8/8 checks passed`, exit 0, with a
// tracked file broken and a directory nobody had been told about.
const restore = () => {
  let pending = false
  try { writeFileSync(PENDING_FILE, ''); pending = true } catch { /* the state directory is already gone (a second call), or cannot be written */ }
  if (restoreFiles()) { dropState(); return }
  let flagged = false
  try { writeFileSync(MARKER_FILE, JSON.stringify({ ...runMarker, restoreFailed: true }, null, 2) + '\n'); flagged = true } catch { /* the sentinel still says so */ }
  process.exitCode = 1
  const notBack = [[TARGET, source], [REGISTRY, registrySource]].filter(([f, text]) => { try { return readFileSync(f, 'utf8') !== text } catch { return true } }).map(([f]) => f)
  const which = notBack.length ? notBack.join(' and ') : 'the original files'
  console.error(`proof-check: ${which} could NOT be put back (a write failed, or what was written did not read back). ${STATE_DIR} was kept: ${BACKUP} and ${BACKUP}.registry `
    + `are the whole originals. Put ${notBack.length ? notBack.join(' and ') : 'the files'} right from them by hand, then: rm -rf ${STATE_DIR}. `
    + (pending || flagged
      ? 'The next run writes nothing over a file that is not what this run backed up.'
      : 'This failure could NOT be recorded in the state directory either, so the next run cannot tell: do not run proof-check again until the files are right.'))
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

// Two cases that MUST be rejected by this very run. They are not in the proof
// documents and they are not counted among the claimed rejections; they exist so
// that the run can fail on purpose every time (Rule 90). Appended after the real
// cases so that case numbering in the output does not move.
//
//   clean  — compiles. A run that accepts it has a batch that confirms what it
//            did not see fail, or a serial compile that does not look. It must
//            be reported as COMPILED CLEANLY, not merely as "not accepted":
//            `rejected && the code appears` is false for a clean build even
//            when `rejected` is wrong, so the verdict alone cannot tell.
//   wrong  — is rejected, with a code other than the one it claims. A run that
//            accepts it checks "was rejected" and not "was rejected with". It
//            must be reported as rejected with another code.
//
// `why` is the failure reason each control must give. A control that fails for
// some OTHER reason has stopped testing what it was written to test.
const CONTROLS = [
  { doc: '(control)', kind: 'clean', code: 'FS0001', body: '""', why: /^COMPILED CLEANLY/ },
  { doc: '(control)', kind: 'wrong', code: 'FS9999', body: '1 + "a"', why: /^compiler said error FS\d+.*doc claims FS9999$/ },
]

/**
 * One case compiled ALONE, by the original method and with its predicate
 * unchanged. It no longer decides a real case (the batch must confirm it); it
 * says why an unconfirmed case was not confirmed, and it is the whole verdict
 * for the controls.
 */
const decideAlone = c => {
  writeFileSync(TARGET, layout(source, [c]).text)
  const out = build()
  const rejected = /error FS\d+/.test(out)
  const codes = [...new Set(out.match(/error FS\d+/g) || [])].join(', ')
  return {
    ok: rejected && out.includes(`error ${c.code}`),
    detail: rejected ? `compiler said ${codes}, doc claims ${c.code}`
                     : 'COMPILED CLEANLY — the gate does not hold',
  }
}

// How many real cases got a verdict from a compiler (stays 0 if the baseline did
// not compile or no case matched): the closing line reports it, not the number
// of cases read.
let decidedByCompiler = 0

if (baselineClean && cases.length > 0 && source.includes(ANCHOR)) {
  try {
    const all = [...cases, ...CONTROLS]
    const batch = layout(source, all)
    writeFileSync(TARGET, batch.text)
    const batchStart = performance.now()
    const batchFlags = ` -p:OtherFlags=--maxerrors:${MAX_ERRORS}`
    let batchOut = build(batchFlags)
    // The wrong-code control is rejected by construction, so a batch that
    // reports NO error at all did not run to the end (a killed or crashed
    // compiler, not a clean tree). Repeat it once, visibly, before judging; two
    // empty batches in a row is the check below, with the output's tail.
    let batchTries = 1
    if (!/error FS\d+/.test(batchOut)) { batchOut = build(batchFlags); batchTries = 2 }
    const batchMs = Math.round(performance.now() - batchStart)
    const { per, strays } = attribute(all, batch.ranges, parseErrors(batchOut))
    // The count of ALL error lines, wherever they are reported, against the ones
    // that could be attributed: a gap means errors in a file this cannot place.
    const errorLines = (batchOut.match(/error FS\d+/g) || []).length
    const placed = parseErrors(batchOut).length

    const decided = all.map((c, i) => {
      if (per[i].confirmed) return { by: 'batch', ok: true, detail: '' }
      return { by: 'alone', ...decideAlone(c) }
    })
    // Every real case now has a verdict from a compiler: the batch's, or its own.
    decidedByCompiler = cases.length
    const unconfirmed = cases.map((_, i) => i).filter(i => decided[i].by !== 'batch')
    const controlsByBatch = CONTROLS.filter((_, k) => decided[cases.length + k].by === 'batch').length
    const named = unconfirmed.slice(0, 5).map(i => `case ${i + 1}`).join(', ')
    console.log(`\nproof batch: ${cases.length - unconfirmed.length} of ${cases.length} case(s) confirmed from their `
      + `own lines in ONE compile (--maxerrors ${MAX_ERRORS}, ${batchMs} ms${batchTries > 1 ? `, ${batchTries} TRIES — the first compile reported no error` : ''})`
      + (unconfirmed.length ? `; NOT confirmed: ${named}${unconfirmed.length > 5 ? `, and ${unconfirmed.length - 5} more` : ''}` : '')
      + `; controls: ${CONTROLS.length - controlsByBatch} compiled alone, as designed`
      + (controlsByBatch ? `, ${controlsByBatch} CONFIRMED BY THE BATCH (the control checks fail)` : '')
      + `; ${errorLines} 'error FS' mention(s) in the output (each error prints twice), `
      + `${placed} placed in Scoreboard.fs, ${strays.length} in no case`)

    for (const [i, c] of cases.entries()) {
      const d = decided[i]
      // Label with the line that actually carries the violation, not the
      // `match ... with` every case opens on — otherwise all four read alike.
      const lines = c.body.split('\n').map(l => l.trim()).filter(Boolean)
      const salient = lines.find(l => l.startsWith('|') && !/^\|\s*(None|_)\s*->\s*""$/.test(l))
        || lines[0]

      // A real case passes only when the BATCH confirmed it. One that passes
      // alone but was not confirmed is the batch being blind to it, and that is
      // reported as what it is, not waved through at serial speed.
      const reason = d.by === 'batch' ? ''
        : d.ok ? `rejected with ${c.code} when compiled alone, but the batch did not confirm it from its own lines `
                 + `(codes there: ${per[i].codes.join(', ') || 'none'}; ${errorLines} error line(s) reported, `
                 + `${placed} placed, cap ${MAX_ERRORS}) — the batch cannot see this case`
        : d.detail
      check(`${c.doc} case ${i + 1} rejected with ${c.code}: ${salient.slice(0, 34)}`,
        d.by === 'batch', reason)
    }

    // The batch must have run to the end, or every line below is noise.
    check('the batch compile reported errors (the wrong-code control guarantees some)',
      /error FS\d+/.test(batchOut),
      `none in ${batchTries} try/tries; the output ended: ${batchOut.split('\n').map(l => l.trim()).filter(Boolean).slice(-4).join(' | ').slice(0, 400) || '(empty)'}`)

    // The controls are a check of the checker, so they are reported as such: a
    // control that is ACCEPTED is the failure, and so is one that fails for a
    // reason other than the one it was written for. They also probe the BATCH's
    // attribution: the clean one must have NO error placed in its lines (an
    // analyser that over-attributes fails it), the wrong one must have SOME (one
    // that is blind to it fails it) — whichever code the batch happened to use.
    for (const [k, c] of CONTROLS.entries()) {
      const d = decided[cases.length + k]
      const seen = per[cases.length + k].codes
      const placedRight = c.kind === 'clean' ? seen.length === 0 : seen.length > 0
      check(`control (${c.kind}): a case that ${c.kind === 'clean' ? 'compiles cleanly' : 'is rejected with another code'} fails, for that reason`,
        !d.ok && c.why.test(d.detail) && placedRight,
        d.ok ? `ACCEPTED by the ${d.by} path — the check cannot fail`
             : !c.why.test(d.detail) ? `failed for another reason: ${d.detail}`
             : `the batch placed ${seen.join(', ') || 'no error'} in its lines, expected ${c.kind === 'clean' ? 'none' : 'some'}`)
    }
    // Every error line the build printed must be one this script understood and
    // put in a case. A gap means errors in a file it cannot place, or in a shape
    // the parser does not read: no verdict above depends on them, which is
    // exactly why a reader should be told.
    check('every batch error line was placed in some case\'s lines',
      strays.length === 0 && placed === errorLines,
      `${errorLines} error line(s) reported, ${placed} placed in Scoreboard.fs, ${strays.length} in no case`
        + (strays.length ? `: ${strays.slice(0, 3).map(x => `${x.code}@${x.line}`).join(', ')}` : ''))

    if (OUT) {
      // A failing write is a failing CHECK, not a stack trace that loses every
      // verdict and skips the registry phase.
      let wrote = ''
      try {
        writeFileSync(OUT, JSON.stringify({
          maxErrors: MAX_ERRORS, batchMs, batchTries, errorLines, placed, strays,
          confirmedReal: cases.length - unconfirmed.length, unconfirmedReal: unconfirmed.map(i => i + 1),
          // passed = what the run counted; aloneOk = only what the serial compile said.
          cases: all.map((c, i) => ({
            doc: c.doc, code: c.code, codesInRange: per[i].codes, decidedBy: decided[i].by,
            passed: decided[i].by === 'batch', aloneOk: decided[i].by === 'alone' ? decided[i].ok : null,
          })),
        }, null, 1) + '\n')
      } catch (e) { wrote = String(e.message ?? e) }
      check('--out file written', wrote === '', wrote)
    }
  } finally {
    restoreFiles()
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
    const withCase = probeRegistry(registrySource)
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
    restoreFiles()
  }
}

console.log(`\ndocs/*-PROOF.md: ${cases.length} claimed rejection(s) read, ${decidedByCompiler} given a verdict by the compiler\n`)
finish(summarize())
