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

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, mkdtempSync, symlinkSync, lstatSync, readlinkSync } from 'node:fs'
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

/**
 * Is `now`, what a file holds, still what THIS run left it as: the original, or a prefix of the last text this run tried to write (`mine`, undefined before the first attempt)? A prefix
 * covers the whole injection, a half-written one (a write that failed part-way keeps what it wrote: a full disk, a file size limit) and the empty file. Anything else is someone else's: an
 * edit made while the run was going, on the original or on top of the injection. The run writes nothing over it. This is not `strandedTarget`, which asks whether a file is its backup plus
 * a WHOLE block and says no to a half-written injection (3072 bytes of a 3092-byte one, marker present, anchor absent: false, measured 2026-11-05); the blind write that repaired that file
 * would have gone with it.
 */
const ours = (now, original, mine) => now === original || (mine !== undefined && mine.startsWith(now))

/** Is `current` the backed-up target with this script's proof functions inserted, and nothing else different? */
const strandedTarget = (current, backup) => {
  const block = backup === null ? null : insertedAt(current, backup, backup.indexOf(ANCHOR))
  return block !== null && block.includes(MARKER) && onlyProofFunctions(block)
}

/**
 * Is the probe case where this script writes it, directly above the union's last case? The real union has `| UFL` above its last case, not `| NHL`, so a clean registry never matches
 * (and the self-test reads the real file to say so). It cannot see a probe an edit has separated from the last case (a sport added directly above that case lands between them): `carriesProbe` can.
 */
const probeOnRegistry = src => src.includes(REGISTRY_PROBE_SITE)

/**
 * Is the probe's line there twice in one declaration? The probe is a second `    | NHL` in a union that has one of its own, and a union cannot have a case twice (the build says so), so two of them in
 * one top-level declaration are the probe, wherever in the union an edit has since put it. A plain "has `| NHL`" would be true of a clean registry, and so would "has more of them than the backup":
 * a backup older than the tree (the stale case) can be older than the union's own `| NHL`. Looked at per declaration so that two unions in one file, each with an `| NHL`, are not one. The real
 * registry has exactly one such line (the self-test reads the committed file to say so); measured 2026-11-05, no other file in src/ has one and no declaration in any of the 49 has it twice.
 */
const probeDuplicated = src => src.split(/\n(?=\S)/).some(declaration => declaration.split('\n').filter(l => l === REGISTRY_PROBE.trimEnd()).length > 1)

/**
 * Does `src` carry this script's probe case, wherever in the union it now sits? Directly above the last case, where this script writes it, or duplicated: an edit that separates the two (a sport
 * added directly above the last case lands between them) used to read as a registry with none of this script's code in it, and the state that held the original was deleted (review 6, finding 0).
 */
const carriesProbe = src => probeOnRegistry(src) || probeDuplicated(src)

/**
 * What a person deletes to take this script's code out of `file`, as a phrase that names the file. The registry's line is described by what it is and where it was written, because an edit made
 * since can have put lines between it and the last case.
 */
const removalOf = file => file === TARGET
  ? `the injected block in ${TARGET} (each "${MARKER}N" header and the indented lines under it; \`grep -n "${MARKER}" ${TARGET}\` finds them)`
  : `the probe case in ${REGISTRY} (the second line "${REGISTRY_PROBE.trimEnd()}" in the union: this run wrote it directly above "${REGISTRY_ANCHOR.slice(1)}", and a line added since may now sit between them; `
    + `\`grep -n "^${REGISTRY_PROBE.trimEnd()}$" ${REGISTRY}\` lists both)`

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
 * A marker with no recorded start is judged by the pid alone. If /proc says the pid is a proof-check it is the run (wait, or kill it if hung). If /proc cannot say, nothing
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
  // A plain kill, not kill -9: nothing in this script catches a signal (see the exit handler below), so a kill, Ctrl-C or a hangup stops the run at once. It leaves the injection where
  // it is, which is what the state and the next run's heal are for, as it does for SIGKILL. (Until 2026-11-05 this said kill -9, because the handlers that were registered could not run
  // during the synchronous run: SIGTERM sent mid-run, seven builds still ran and the handler never did, measured in review 4.)
  lines.push(unconfirmed
    ? `If it is a proof run, wait for it. If it is not, it is not this script's to stop: set "pid": 0 in ${MARKER_FILE} (the marker then reads as a dead run's, judged by the tree) and run this again; the next run restores the file that still carries the injection, and only that file.`
    : `Wait for it. If it is hung: kill ${prior.pid}. The next run restores the file that still carries its injection, and only that file.`)
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
 *             (a stash pop, an edit), or a file with no anchor (the target's, the registry's
 *             last case) that is not its own backup, which may be torn, whatever the other file
 *             holds: write nothing,
 *             keep the state, say what to do by hand.
 *
 * Pure, so the self-test can exercise every answer without a dotnet build in sight.
 */
const classifyState = ({
  markerExists, alive, injected, anchored, registryAnchored, targetStranded, registryStranded, registryInjected,
  restoreFailed, targetIntact, registryIntact,
}) => {
  if (!markerExists) return 'proceed'
  if (alive) return 'refuse'
  // A run whose restore did not read back (the marker says so) may have left either file TORN, and the backups are then the only whole copies. What is provably that run's own
  // injection is healed; anything else must be exactly its backup, or the state stays for a person. It is never called stale: a torn file keeps its anchor, and `stale` deletes the state.
  if (restoreFailed && !((targetStranded || targetIntact) && (registryStranded || registryIntact))) return 'diverged'
  if ((injected && !targetStranded) || (registryInjected && !registryStranded)) return 'diverged'
  // A file that is not provably whole and has lost its anchor (the target's, the registry's last case) may be TORN, and the state holds its only whole copy. Each file is asked, and BEFORE the
  // heal: a stranded registry beside a torn target was healed, and the heal deleted the state and with it the only whole target (the mirror too: a torn registry beside a stranded target). A file
  // that is provably the injection is not asked: it is its backup with a block inserted, so it has its anchor anyway. Nor is a file that IS its backup: whole, whatever it holds, and a refusal
  // over it names a file that is not torn while the injection in the other file stays (review 6, finding 2: a registry whose last case had been renamed, byte for byte its backup, refused to let
  // the stranded target beside it be healed, and the message sent a person to the wrong file).
  if ((!targetStranded && !targetIntact && !anchored) || (!registryStranded && !registryIntact && !registryAnchored)) return 'diverged'
  if (targetStranded || registryStranded) return 'heal'
  return 'stale'
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
    injected: false, anchored: true, registryAnchored: true, targetStranded: false, registryStranded: false, registryInjected: false, restoreFailed: false,
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
  sc('...and a target with no anchor, which may be torn (it is not its backup), is not called clean',
    st({ anchored: false, targetIntact: false }) === 'diverged', `got ${st({ anchored: false, targetIntact: false })}`)
  // Each file is asked, and before the heal: a torn file beside a stranded one is not healed over, in either direction. A file that is provably the injection is not asked about its anchor.
  const tornAsked = [st({ anchored: false, targetIntact: false, registryStranded: true }), st({ registryAnchored: false, registryIntact: false, targetStranded: true, injected: true }), st({ registryAnchored: false, registryIntact: false }),
    st({ anchored: false, targetStranded: true, injected: true }), st({ registryAnchored: false, registryStranded: true })]
  sc('A TORN FILE IS ASKED ABOUT PER FILE, AND BEFORE THE HEAL: a target with no anchor beside a stranded registry, a registry with no last case beside a stranded target, and one over nothing stranded are diverged; a file that is provably the injection is not asked (5 classifier inputs)',
    tornAsked.join() === 'diverged,diverged,diverged,heal,heal', `got ${tornAsked.join()}`)
  // A file that IS its backup is whole, anchor or not, and is not asked (review 6, finding 2). Torn above means "not its backup"; here the same missing anchor sits on a file equal to its backup.
  const wholeNotAsked = [st({ anchored: false }), st({ registryAnchored: false }), st({ anchored: false, registryStranded: true }), st({ registryAnchored: false, targetStranded: true, injected: true }),
    st({ anchored: false, registryAnchored: false })]
  sc('A FILE THAT IS ITS BACKUP IS WHOLE AND IS NOT ASKED ABOUT ITS ANCHOR: a target or a registry with no anchor over nothing stranded is stale, beside a stranded file the stranded one is healed, and neither having an anchor is stale (5 classifier inputs)',
    wholeNotAsked.join() === 'stale,stale,heal,heal,stale', `got ${wholeNotAsked.join()}`)
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
  // The shape test is four spaces exactly: layout() indents a body by four, so a line indented by one, two or three is not the script's, and one indented by four is (review 6: `startsWith(' ')` passed the clauses above).
  const indentedHelper = n => injectedClean.replace(ANCHOR, `${' '.repeat(n)}let h = 1\n${ANCHOR}`)
  sc('STRANDEDTARGET: A LINE INDENTED BY ONE, TWO OR THREE SPACES IN THE GAP IS NEWER WORK, AND ONE INDENTED BY FOUR IS A PROOF BODY (the boundary of the shape test: 4 sources)',
    [1, 2, 3].every(n => !strandedTarget(indentedHelper(n), clean)) && strandedTarget(indentedHelper(4), clean),
    `stranded at 1, 2, 3, 4 spaces: ${[1, 2, 3, 4].map(n => strandedTarget(indentedHelper(n), clean)).join(', ')}`)
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
  // The same fact BY EFFECT. The clause above pins the variable's NAME on the environment `scrubbedGitEnv` builds, and a name that is wrong in the code and in that clause together (a misspelling made in
  // both places) passes it, while git reads the system configuration. A system configuration CAN be planted without privileges (GIT_CONFIG_SYSTEM, git 2.32 or later; measured 2026-11-05 on git 2.43.0), so
  // git is asked: the control (the scrubbed environment WITHOUT GIT_CONFIG_NOSYSTEM) must read the planted value, so that a plant git ignores cannot pass, and the scrubbed one must read nothing. The two
  // differ in that one entry and nothing else. Where the control reads nothing (an older git), the clause fails rather than passing empty.
  const systemLeak = env => {
    const dir = mkdtempSync(join(tmpdir(), 'proof-syscfg-'))
    try {
      writeFileSync(join(dir, 'system.gitconfig'), '[proofprobe]\n\tleak = system\n')
      try { return execSync('git config --get proofprobe.leak', { cwd: dir, env: { ...env, GIT_CONFIG_SYSTEM: join(dir, 'system.gitconfig') }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { return '' }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
  const withoutNoSystem = Object.fromEntries(Object.entries(scrubbedGitEnv(process.env)).filter(([k]) => k !== 'GIT_CONFIG_NOSYSTEM'))
  const leakControl = haveGit ? systemLeak(withoutNoSystem) : null
  const leakScrubbed = haveGit ? systemLeak(scrubbedGitEnv(process.env)) : null
  sc(`THE SYSTEM GIT CONFIGURATION IS NOT READ BY THE SCRATCH REPOSITORIES, asked of git itself: a plant git honours is read without GIT_CONFIG_NOSYSTEM and not with the scrubbed environment (2 reads; asserted: ${haveGit})`,
    !haveGit || (leakControl === 'system' && leakScrubbed === ''), `control read ${JSON.stringify(leakControl)} (expected "system"), scrubbed environment read ${JSON.stringify(leakScrubbed)} (expected "")`)
  const committedDemo0 = haveGit ? committedDemo(process.env) : null
  sc('THE COMMITTED REGISTRY IS READ FROM HEAD, NOT FROM THE WORKING TREE: a working copy that differs does not change what is returned',
    !haveGit || committedDemo0 === 'committed\n', JSON.stringify(committedDemo0))
  sc(`probeOnRegistry: the probed union carries it, the clean one does not, and neither does the REAL ${REGISTRY} as committed (asserted: ${committedRegistry !== null})`,
    probeOnRegistry(probeRegistry(union)) && !probeOnRegistry(union) && (committedRegistry === null || !probeOnRegistry(committedRegistry)),
    `the committed registry has the probe's line above its last case: ${committedRegistry !== null && probeOnRegistry(committedRegistry)} — a union whose case above the last one is the probe's own line`)
  // The probe wherever an edit has put it. Fixtures: the probed union (adjacent), the same with a sport between the probe and the last case (separated), a union whose own `| NHL` has gone with the probe
  // still adjacent, two declarations that each have an `| NHL` of their own, and the committed registry, which has exactly one such line (the premise of the duplicate test).
  const separatedProbe = probeRegistry(union).replace('    | Unrecognised', '    | MyNewSport\n    | Unrecognised')
  const noOwnNhl = probeRegistry('type Sport =\n    | MLB\n    | UFL\n    | Unrecognised of raw: string\n')
  const twoUnions = 'type A =\n    | NHL\n    | X\n\ntype B =\n    | NHL\n    | Y\n'
  const oneNhlLine = src => src.split('\n').filter(l => l === '    | NHL').length === 1
  sc(`carriesProbe: the probe is found adjacent to the last case and separated from it by a sport, and neither the clean union, two unions with an \`| NHL\` each, nor the REAL ${REGISTRY} as committed carries it; probeOnRegistry alone cannot see the separated one (6 sources; asserted: ${committedRegistry !== null})`,
    carriesProbe(probeRegistry(union)) && carriesProbe(separatedProbe) && !probeOnRegistry(separatedProbe) && probeDuplicated(separatedProbe) && !carriesProbe(union) && !carriesProbe(twoUnions)
      && carriesProbe(noOwnNhl) && !probeDuplicated(noOwnNhl) && (committedRegistry === null || (!carriesProbe(committedRegistry) && oneNhlLine(committedRegistry))),
    `adjacent ${carriesProbe(probeRegistry(union))}, separated ${carriesProbe(separatedProbe)} (adjacency alone: ${probeOnRegistry(separatedProbe)}), clean union ${carriesProbe(union)}, two unions ${carriesProbe(twoUnions)}, probe with no case of its own ${carriesProbe(noOwnNhl)}; the committed registry has one \`| NHL\` line: ${committedRegistry !== null && oneNhlLine(committedRegistry)}`)
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
  const sandbox = ({ target, registry, backupTarget, backupRegistry, pid, start, noState = false, noBackups = false, markerExtra = {}, files = {} }) => {
    const dir = mkdtempSync(join(tmpdir(), 'proof-state-'))
    try {
      for (const d of ['src', 'docs', ...(noState ? [] : [STATE_DIR])]) mkdirSync(join(dir, d))
      writeFileSync(join(dir, TARGET), target)
      writeFileSync(join(dir, REGISTRY), registry)
      if (!noState) {
        if (!noBackups) {
          writeFileSync(join(dir, BACKUP), backupTarget)
          writeFileSync(join(dir, `${BACKUP}.registry`), backupRegistry)
        }
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
  // A file with no anchor that IS its backup is whole, and the stranded file beside it is healed (review 6, finding 2). The registry here has had its last case renamed away since the run started and is byte for
  // byte its backup; the target is the mirror. Refused, the message named the whole file ("Put src/Desk.fs right by hand") while the injection in the other stayed, and the state with it.
  const noLastCase = 'type Sport =\n    | MLB\n    | EPL\n'
  const noAnchorTarget = '// head, no anchor line below\n  body\n'
  const healBesideWholeRegistry = sandbox({ target: injectedClean, registry: noLastCase, backupTarget: clean, backupRegistry: noLastCase, pid: DEAD })
  sc('A STRANDED TARGET IS HEALED BESIDE A REGISTRY THAT HAS NO LAST CASE BUT IS ITS BACKUP: the target is back, the registry is untouched and not named, the state goes (1 planted state)',
    healBesideWholeRegistry.target === clean && healBesideWholeRegistry.registry === noLastCase && /HEALED/.test(healBesideWholeRegistry.stderr) && !/src\/Desk\.fs/.test(healBesideWholeRegistry.stderr) && !/nothing was written/.test(healBesideWholeRegistry.stderr)
      && !healBesideWholeRegistry.stateLeft,
    show(healBesideWholeRegistry))
  const healBesideWholeTarget = sandbox({ target: noAnchorTarget, registry: probeRegistry(union), backupTarget: noAnchorTarget, backupRegistry: union, pid: DEAD })
  sc('...AND THE MIRROR: a stranded registry is healed beside a target that has no anchor but is its backup: the registry is back, the target is untouched and not named, the state goes (1 planted state)',
    healBesideWholeTarget.registry === union && healBesideWholeTarget.target === noAnchorTarget && /HEALED/.test(healBesideWholeTarget.stderr) && /src\/Desk\.fs/.test(healBesideWholeTarget.stderr) && !/src\/Scoreboard\.fs/.test(healBesideWholeTarget.stderr)
      && !healBesideWholeTarget.stateLeft,
    show(healBesideWholeTarget))
  // The torn file and the stranded one are different files. A target cut off before its anchor beside a registry that carries the run's probe (a kill in phase 2, then a tear that no failed restore of
  // ours explains) was HEALED, and the heal deleted the state, which held the only whole target. The mirror, a registry cut off before its last case beside a stranded target, was the same: only the
  // target had an anchor input. (Each is one planted state on the real script.)
  const tornUnion = 'type Sport =\n    | MLB\n'
  const tornTargetBesideProbe = sandbox({ target: '// head, cut off', registry: probeRegistry(union), backupTarget: clean, backupRegistry: union, pid: DEAD })
  sc('A TARGET WITH NO ANCHOR BESIDE A STRANDED REGISTRY IS NOT HEALED OVER: nothing is written (the registry keeps its probe), the state is kept, the target is named, the run stops (1 planted state)',
    tornTargetBesideProbe.status === 1 && tornTargetBesideProbe.target === '// head, cut off' && tornTargetBesideProbe.registry === probeRegistry(union) && tornTargetBesideProbe.stateLeft
      && /src\/Scoreboard\.fs has no injection anchor/.test(tornTargetBesideProbe.stderr) && !/HEALED/.test(tornTargetBesideProbe.stderr) && !carriedOn(tornTargetBesideProbe),
    show(tornTargetBesideProbe))
  const tornRegistryBesideInjection = sandbox({ target: injectedClean, registry: tornUnion, backupTarget: clean, backupRegistry: union, pid: DEAD })
  sc('...AND THE MIRROR: a registry with no last case beside a stranded target is not healed over either: nothing is written, the state is kept, the registry is named, the run stops (1 planted state)',
    tornRegistryBesideInjection.status === 1 && tornRegistryBesideInjection.target === injectedClean && tornRegistryBesideInjection.registry === tornUnion && tornRegistryBesideInjection.stateLeft
      && /src\/Desk\.fs has no last case/.test(tornRegistryBesideInjection.stderr) && !/HEALED/.test(tornRegistryBesideInjection.stderr) && !carriedOn(tornRegistryBesideInjection),
    show(tornRegistryBesideInjection))
  const tornRegistryAlone = sandbox({ target: clean, registry: tornUnion, backupTarget: clean, backupRegistry: union, pid: DEAD })
  sc('...and a registry with no last case over nothing stranded is not called STALE: nothing is written, the state is kept, the registry is named (1 planted state)',
    tornRegistryAlone.status === 1 && tornRegistryAlone.registry === tornUnion && tornRegistryAlone.stateLeft && !/STALE/.test(tornRegistryAlone.stderr)
      && /src\/Desk\.fs has no last case/.test(tornRegistryAlone.stderr) && !carriedOn(tornRegistryAlone),
    show(tornRegistryAlone))

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
  sc('...and tells a person to kill it with a plain kill, which stops the run at once now that nothing in it catches a signal (not kill -9)',
    /kill \d+\./.test(liveRun.stderr) && !/kill -9/.test(liveRun.stderr), liveRun.stderr.split('\n').find(l => /kill/.test(l)) ?? '(no kill advice)')

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
  // The same refusal, read for what it tells a person to DO. It said `Restore it (git checkout -- <file>) before re-running.`: a checkout puts a file back to the index, so it threw away every uncommitted
  // edit to the file, and when the injection was already committed (217282b) it changed nothing and the lines stayed (measured 2026-11-05 in a scratch repository: after the checkout the committed marker
  // line was still there, and an uncommitted edit was gone). clean-source-check.mjs has given the other advice for the same state since the residuals Task 3; the wording is kept by eye in both, not shared, because that check must
  // keep working when this script is the thing that broke. Three planted states (target only, registry only, both), each the real script with no run state.
  const strayBoth = sandbox({ target: injectedClean, registry: probeRegistry(union), noState: true })
  const advice = r => r.stderr.split('\n').slice(1).join(' | ')
  const oldAdviceGone = r => !/Restore (it|them)\b/.test(r.stderr) && !/before re-running/.test(r.stderr)
  const targetPart = `the injected block in ${TARGET} (each "${MARKER}N" header and the indented lines under it; \`grep -n "${MARKER}" ${TARGET}\` finds them)`
  const registryPart = `the probe case in ${REGISTRY} (the line "    | NHL" directly above "    | Unrecognised of raw: string"; \`grep -n -B1 "^    | Unrecognised of raw: string$" ${REGISTRY}\` shows it)`
  const costSentence = (files, many) => `If the ${many ? 'injections are' : 'injection is'} uncommitted, \`git checkout -- ${files}\` also removes ${many ? 'them' : 'it'} but discards every uncommitted edit to the ${many ? 'files' : 'file'}.`
  // A registry shaped like the real one (`| NHL` is a case of its own, in the middle) with the probe and a sport the person added between the probe and the last case, and the same with the probe taken out by hand.
  // The sentence a person is given for the probe's line, typed by hand here: it describes the line by what it is, because "directly above the last case" is no longer true of it.
  const LAST_CASE = '    | Unrecognised of raw: string'
  const separatedUnion = union.replace(LAST_CASE, `    | NHL\n    | MyNewSport\n${LAST_CASE}`)
  const unionWithSport = union.replace(LAST_CASE, `    | MyNewSport\n${LAST_CASE}`)
  const probeCase = `the probe case in ${REGISTRY} (the second line "    | NHL" in the union: this run wrote it directly above "    | Unrecognised of raw: string", and a line added since may now sit between them; \`grep -n "^    | NHL$" ${REGISTRY}\` lists both)`
  sc(`THE NO-STATE REFUSAL FOR AN INJECTED TARGET TELLS A PERSON TO DELETE THE LINES, and to check the file out only if the injection is uncommitted, saying what that discards; "Restore it (git checkout ...)" is gone, and the registry is not named (1 of 3 planted states)`,
    strayTarget.stderr.includes(`Delete ${targetPart}, then run this again.`) && strayTarget.stderr.includes(costSentence(TARGET, false))
      && oldAdviceGone(strayTarget) && !strayTarget.stderr.includes(REGISTRY),
    advice(strayTarget))
  sc(`...AND FOR A PROBED REGISTRY: it names the one line and a grep that shows it above the union's last case, the same conditional checkout, and does not name the target (2 of 3 planted states)`,
    strayRegistry.stderr.includes(`Delete ${registryPart}, then run this again.`) && strayRegistry.stderr.includes(costSentence(REGISTRY, false))
      && oldAdviceGone(strayRegistry) && !strayRegistry.stderr.includes(TARGET),
    advice(strayRegistry))
  sc(`...AND FOR BOTH AT ONCE: each file gets its own instruction and one checkout names both, in the plural (3 of 3 planted states)`,
    strayBoth.status === 1 && strayBoth.stderr.includes(`Delete ${targetPart} and ${registryPart}, then run this again.`)
      && strayBoth.stderr.includes(costSentence(`${TARGET} ${REGISTRY}`, true)) && oldAdviceGone(strayBoth),
    advice(strayBoth))

  // The same refusal over a probe an edit has separated from the last case. `clean-source-check` says of a tree in that state that proof-check "refuses" with no run state, and the guard looked only for the
  // probe directly above the last case, so it proceeded (and its baseline then failed on the duplicate case). The line is described by what it is, as the carrying message does: "directly above" is not true of it.
  const straySeparated = sandbox({ target: clean, registry: separatedUnion, noState: true })
  sc('A REGISTRY WHOSE PROBE A SPORT HAS SEPARATED FROM THE LAST CASE IS NOT ADOPTED AS THE ORIGINAL EITHER: with no run state, untouched, the run stops, and it is told which line to delete without being told the line is directly above the last case (1 planted state)',
    straySeparated.status === 1 && straySeparated.registry === separatedUnion && straySeparated.target === clean && !straySeparated.stateLeft && /no run state exists/.test(straySeparated.stderr) && !carriedOn(straySeparated)
      && straySeparated.stderr.includes(`Delete ${probeCase}, then run this again.`) && straySeparated.stderr.includes(costSentence(REGISTRY, false)) && !straySeparated.stderr.includes('-B1'),
    advice(straySeparated))

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
  sc('THE REFUSAL OVER A PID NOBODY CAN IDENTIFY SAYS TO LOOK AT IT: no kill, no advice to delete the state, and the state is called the only whole copy; over a proof-check or a recorded start it is the plain wait-or-kill',
    /ps -p 77/.test(unknown) && /only whole copy/.test(unknown) && !/kill/.test(unknown) && !/delete \.proof-state/.test(unknown) && /\(node scripts\/proof-check\.mjs\)/.test(hung)
      && /kill 77\./.test(hung) && !/ps -p/.test(hung) && /kill 77\./.test(recorded) && !/ps -p/.test(recorded) && !/delete \.proof-state/.test(`${hung}${recorded}`)
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

  // A scratch project with a stand-in `dotnet`, and this script run in it. The registry is `oldUnion`, which has no `| NHL` (the probe the registry phase adds), so a stand-in can tell that phase by grepping for it.
  // `dotnet` is the stand-in's text, `target` the file the injections go into, `before(dir)` plants anything else, and
  // `body` gets `dir` (the scratch directory, for a test that plays the person), `go` (one run of the script, whose result is a spawnSync result; with a size limit in KB it runs under `ulimit -S -f`, bash: a write that would pass the limit is cut short and
  // then fails with EFBIG, as a full disk does with ENOSPC), `has` (does a file exist there), `read` (its text, null when it cannot be read) and `replaceDotnet` (a different stand-in for the next
  // run). The scratch directory goes when `body` returns.
  const withStandIn = ({ dotnet, target = clean, before = () => {} }, body) => {
    const dir = mkdtempSync(join(tmpdir(), 'proof-standin-'))
    try {
      for (const d of ['src', 'docs', 'bin']) mkdirSync(join(dir, d))
      writeFileSync(join(dir, TARGET), target)
      writeFileSync(join(dir, REGISTRY), oldUnion)
      writeFileSync(join(dir, 'docs/SANDBOX-PROOF.md'), '<!-- proof: FS0001 -->\n```fsharp\nlet x = 1\n```\n')
      writeFileSync(join(dir, 'bin/dotnet'), dotnet, { mode: 0o755 })
      before(dir)
      const self = fileURLToPath(import.meta.url)
      const go = (extraEnv = {}, fileSizeLimitKB = null) => {
        const options = { cwd: dir, encoding: 'utf8', timeout: 120_000, env: { ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH}`, ...extraEnv } }
        return fileSizeLimitKB === null
          ? spawnSync(process.execPath, [self], options)
          : spawnSync('bash', ['-c', `ulimit -S -f ${fileSizeLimitKB}; exec "$0" "$1"`, process.execPath, self], options)
      }
      return body({
        dir, go, has: p => existsSync(join(dir, p)), read: p => { try { return readFileSync(join(dir, p), 'utf8') } catch { return null } },
        replaceDotnet: text => writeFileSync(join(dir, 'bin/dotnet'), text, { mode: 0o755 }),
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  // THE RUN THAT LOSES THE MARKER WRITES NOTHING INTO THE STATE DIRECTORY (review 6, findings 4 and 5). The state directory below holds the files of "the run that has the marker": a stand-in for whoever holds it. The
  // backups used to be written before the exclusive create, so a loser overwrote them with its own reading of the files, whether it lost to another run or to a link standing where the marker goes. Two ways to lose:
  //
  // A DANGLING LINK at the marker's path: existsSync follows it and finds nothing, so the run classifies `proceed`; an exclusive create then fails with EEXIST where a plain write follows the link and creates
  // its target (the committed script did exactly that: it ran seven builds, and wrote its marker into the link's target). It is not another run, and "run this again once it has finished" can never succeed, so the
  // message says what is at the path and to remove it. Coverage (Rule 91): ONE run.
  const HOLDER = "THE HOLDER'S BACKUP\n"
  const holdsTheState = dir => { mkdirSync(join(dir, STATE_DIR)); writeFileSync(join(dir, BACKUP), HOLDER); writeFileSync(join(dir, `${BACKUP}.registry`), HOLDER) }
  const backupsOf = read => [read(BACKUP), read(`${BACKUP}.registry`)]
  let linked = false
  const exclusive = withStandIn({
    dotnet: '#!/bin/sh\necho build >> calls.log\nexit 0\n',
    before: dir => {
      holdsTheState(dir)
      try { symlinkSync(join(dir, 'taken-by-another-run.json'), join(dir, MARKER_FILE)); linked = true } catch { /* no symlinks here: the clause says it was not asserted */ }
    },
  }, ({ dir, go, has, read }) => ({ r: go(), dir, builds: has('calls.log'), wrote: has('taken-by-another-run.json'), backups: backupsOf(read) }))
  sc(`A LINK STANDING WHERE THE MARKER GOES IS REFUSED, not written through, and called what it is: exit 1, no build runs, the link's target is not created, the state directory is untouched, and the message says it is a link to remove, not that another run took it (1 run, the EEXIST branch; asserted: ${linked})`,
    !linked || (exclusive.r.status === 1 && !exclusive.builds && !exclusive.wrote && exclusive.backups.every(b => b === HOLDER) && !/another run took/.test(exclusive.r.stderr)
      && exclusive.r.stderr.includes(`proof-check: ${MARKER_FILE} is a symbolic link (to ${join(exclusive.dir, 'taken-by-another-run.json')}) and this run does not write through a link, so no other run is involved. Remove it (rm ${MARKER_FILE}) and run this again.`)),
    `status ${exclusive.r.status}, builds ran ${exclusive.builds}, link target created ${exclusive.wrote}, backups untouched ${exclusive.backups.every(b => b === HOLDER)}; ${exclusive.r.stderr.slice(0, 200).replace(/\n/g, ' | ')}`)

  // A MARKER THAT APPEARS BETWEEN THE CHECK AND THE CREATE, a regular file standing for the other run's: a module preloaded into the child (NODE_OPTIONS=--require) creates it just before the run's own exclusive
  // create, which is then refused with EEXIST for a reason that really is another run. (Two runs started in the same tick is the real race, which is probabilistic and is not a clause.) Coverage (Rule 91): one run.
  const raced = withStandIn({
    dotnet: '#!/bin/sh\necho build >> calls.log\nexit 0\n',
    before: dir => {
      holdsTheState(dir)
      writeFileSync(join(dir, 'other-run.cjs'), [
        "const fs = require('node:fs')",
        'const real = fs.writeFileSync',
        'fs.writeFileSync = function (path, data, options) {',
        "  if (String(path).endsWith('active.json') && options && options.flag === 'wx') real.call(this, path, 'THE OTHER RUN\\n')",
        '  return real.apply(this, arguments)',
        '}', '',
      ].join('\n'))
    },
  }, ({ dir, go, has, read }) => ({ r: go({ NODE_OPTIONS: `--require ${join(dir, 'other-run.cjs')}` }), builds: has('calls.log'), marker: read(MARKER_FILE), backups: backupsOf(read) }))
  sc('A MARKER THAT APPEARS BETWEEN THE CHECK AND THE CREATE IS ANOTHER RUN, AND THE LOSER WRITES NOTHING: exit 1, no build runs, it says another run took the marker, and the other run\'s marker and both its backups are exactly as it left them (1 run)',
    raced.r.status === 1 && !raced.builds && raced.marker === 'THE OTHER RUN\n' && raced.backups.every(b => b === HOLDER) && !/symbolic link/.test(raced.r.stderr)
      && raced.r.stderr.includes(`proof-check: another run took ${MARKER_FILE} while this one was starting. Run this again once it has finished.`),
    `status ${raced.r.status}, builds ran ${raced.builds}, marker ${JSON.stringify(raced.marker)}, backups untouched ${raced.backups.every(b => b === HOLDER)}; ${raced.r.stderr.slice(0, 200).replace(/\n/g, ' | ')}`)

  // The window the order opens, which is why it is sound: a kill after the marker is created and before the backups leaves a marker with none of them, over files the run has not touched (nothing is injected
  // before both backups exist). The next run must read that as stale, not as a dead end.
  const markerOnly = sandbox({ target: clean, registry: union, pid: DEAD, noBackups: true })
  sc('A MARKER WITH NO BACKUPS BEHIND IT (A KILL BETWEEN THE CREATE AND THE BACKUPS) IS A STALE ONE: both files are as the run found them, the state is discarded, and the next run carries on (1 planted state)',
    markerOnly.target === clean && markerOnly.registry === union && /STALE STATE DISCARDED/.test(markerOnly.stderr) && carriedOn(markerOnly) && !markerOnly.stateLeft,
    show(markerOnly))

  // The create can fail for a reason that is not another run (EACCES, ENOSPC, ENOENT). The branch said "another run took ..." for every code but threw nothing, so the person was sent to wait for a run that
  // does not exist, and no clause could tell (review 6, finding 3: deleting the `throw` left the self-test green). A scratch directory cannot be made to refuse a write to a root-owned run, so the failure is
  // planted where it happens: a module preloaded into the child (NODE_OPTIONS=--require) wraps `fs.writeFileSync` and fails the marker's exclusive create, and only that, with ENOSPC. Coverage (Rule 91): one run.
  const failingCreate = withStandIn({
    dotnet: '#!/bin/sh\necho build >> calls.log\nexit 0\n',
    before: dir => writeFileSync(join(dir, 'fault.cjs'), [
      "const fs = require('node:fs')",
      'const real = fs.writeFileSync',
      'fs.writeFileSync = function (path, data, options) {',
      "  if (String(path).endsWith('active.json') && options && options.flag === 'wx') throw Object.assign(new Error(`ENOSPC: no space left on device, open '${path}'`), { code: 'ENOSPC' })",
      '  return real.apply(this, arguments)',
      '}', '',
    ].join('\n')),
  }, ({ dir, go, has }) => ({ r: go({ NODE_OPTIONS: `--require ${join(dir, 'fault.cjs')}` }), builds: has('calls.log') }))
  sc('A MARKER THAT CANNOT BE CREATED FOR A REASON THAT IS NOT ANOTHER RUN IS NOT CALLED ANOTHER RUN: the error is thrown (ENOSPC, planted), the run stops before any build, and nothing tells a person to wait (1 run, the non-EEXIST branch)',
    failingCreate.r.status === 1 && /ENOSPC/.test(failingCreate.r.stderr) && !/another run took/.test(failingCreate.r.stderr) && !failingCreate.builds,
    `status ${failingCreate.r.status}, builds ran ${failingCreate.builds}; ${failingCreate.r.stderr.slice(0, 200).replace(/\n/g, ' | ')}`)

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
        status: r.status, stderr: r.stderr ?? '', broken: (() => { try { return how === 'directory' ? readdirSync(join(dir, TARGET)).length === 0 : readFileSync(join(dir, TARGET), 'utf8') === '' } catch { return false } })(),
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
  // The file that cannot even be READ is named: the failure list is the files whose restore failed, not a re-read of both (whose `catch { return true }` had no clause, and which said "the original files" when it named nothing).
  const unreadable = failedRestores.find(f => f.how === 'directory')
  sc('A RESTORE THAT CANNOT EVEN READ THE FILE NAMES IT: src/Scoreboard.fs could NOT be put back, not "the original files" (the target made a directory: 1 run)',
    /src\/Scoreboard\.fs could NOT be put back/.test(unreadable.stderr) && !/the original files could NOT/.test(unreadable.stderr)
      && unreadable.stderr.includes(`Put ${TARGET} right by hand, then: rm -rf ${STATE_DIR}. `) && !/still carries/.test(unreadable.stderr), unreadable.stderr.split('\n')[0])

  // A FILE THIS RUN DID NOT WRITE IS NOT THIS RUN'S TO WRITE OVER (residual Task 4, 2026-11-05). The stand-in compilers append ONE line to a file at a chosen moment, as a person saving an edit while
  // the gate runs would. The run used to put both files back from memory at the end of every phase, whatever was on disk, and to write each injection over whatever was there: every line below was lost
  // (measured on the committed script, 2026-11-05: four variants, four losses). Each clause is one stand-in run, one file, one moment.
  const inj = 'HEAD\nBLOCK\nTAIL\n'
  const orig = 'HEAD\nTAIL\n'
  const prefixes = Array.from({ length: inj.length + 1 }, (_, n) => inj.slice(0, n))
  // A suffix and a middle chunk of the injection are not the run's own: what a write that failed part-way leaves is the HEAD of what it wrote. (`mine.includes(now)` passed the clause without them, review 6.)
  const suffixes = Array.from({ length: inj.length - 1 }, (_, n) => inj.slice(n + 1))
  const middles = ['EAD\nBLOCK\nTAI', 'BLOCK\n', 'LOCK']
  sc(`ours: the original, the whole injection and every prefix of it (the empty file included: ${prefixes.length} of them) are this run's; an edit on the original or on the injection, anything when no attempt is recorded, and every suffix and middle chunk of the injection (${suffixes.length} and ${middles.length}) are not`,
    ours(orig, orig, undefined) && ours(orig, orig, inj) && prefixes.every(p => ours(p, orig, inj))
      && !ours(`${inj}// x\n`, orig, inj) && !ours(`${orig}// x\n`, orig, inj) && !ours('HEAD', orig, undefined) && !ours('', orig, undefined)
      && suffixes.every(x => !ours(x, orig, inj)) && middles.every(x => !ours(x, orig, inj)),
    'a prefix is what a write that failed part-way leaves behind')
  const appendOn = (cond, file, tag) => `#!/bin/sh\nif ${cond}; then echo "// ${tag}" >> ${file}; fi\nexit 0\n`
  // A stand-in that is exact (every check of the run passes against it, as in the torn-registry clause above), and runs `onProbe` in the build that sees the registry's probe case.
  // `seesProbe` is the shell test for "this build sees the registry's probe": the registry of the scratch projects has no `| NHL` of its own, so its presence is the probe; a registry shaped like the
  // real one has its own, and the probe is the second.
  const exactCompiler = (onProbe, seesProbe = 'grep -q "| NHL" src/Desk.fs 2>/dev/null') => [
    '#!/bin/sh',
    `if ${seesProbe}; then`,
    '  echo "src/Desk.fs(9,1): error FS0025: Incomplete matches, for example NHL"',
    `  ${onProbe}`,
    '  exit 1',
    'fi',
    `awk '/^let private __proof/ { h=NR; next } h && NR==h+1 && $0 !~ /^    ""$/ { printf "src/Scoreboard.fs(%d,5): error FS0001: fake\\n", NR; h=0 }' src/Scoreboard.fs`,
    'exit 0', '',
  ].join('\n')
  const observed = (dotnet, options = {}) => withStandIn({ dotnet, ...options }, ({ go, read, has }) => {
    const r = go()
    return { r, target: read(TARGET), registry: read(REGISTRY), stateLeft: has(MARKER_FILE) }
  })
  const unwritten = (r, file) => new RegExp(`${file.replace('.', '\\.').replace('/', '\\/')} changed while the run was going and was left exactly as found`).test(r.stderr)

  const inPhase1 = observed(appendOn('grep -q "let private __proof" src/Scoreboard.fs 2>/dev/null', 'src/Desk.fs', 'EDIT-DURING-PHASE-1'))
  sc('A LINE ADDED TO THE REGISTRY WHILE THE TARGET IS INJECTED IS NOT LOST: the registry keeps it and is named as changed, the target is put back, the run fails, and nothing is left to put right, so the state goes',
    inPhase1.registry.includes('// EDIT-DURING-PHASE-1') && inPhase1.target === clean && inPhase1.r.status === 1 && unwritten(inPhase1.r, REGISTRY) && !inPhase1.stateLeft,
    `registry ${JSON.stringify(inPhase1.registry.slice(-40))}, target back ${inPhase1.target === clean}, status ${inPhase1.r.status}, state left ${inPhase1.stateLeft}; ${inPhase1.r.stderr.slice(0, 160).replace(/\n/g, ' | ')}`)

  // Every check of this run passes against the exact compiler, so the exit status 1 below is the restore's and nothing else's.
  const inPhase2 = observed(exactCompiler('echo "// EDIT-DURING-PHASE-2" >> src/Scoreboard.fs'))
  sc('A LINE ADDED TO THE TARGET WHILE THE REGISTRY CARRIES ITS PROBE IS NOT LOST: the target keeps it and is named, the registry is put back, and the run FAILS although every check passed',
    /(\d+)\/\1 checks passed/.test(inPhase2.r.stdout) && inPhase2.target.includes('// EDIT-DURING-PHASE-2') && inPhase2.registry === oldUnion && inPhase2.r.status === 1 && unwritten(inPhase2.r, TARGET) && !inPhase2.stateLeft,
    `checks all passed ${/(\d+)\/\1 checks passed/.test(inPhase2.r.stdout)}, target ${JSON.stringify(inPhase2.target.slice(-40))}, registry back ${inPhase2.registry === oldUnion}, status ${inPhase2.r.status}, state left ${inPhase2.stateLeft}`)

  // A change made to the file the run injected: it is left as found, with its injection, and the state is kept, because the original is only there. The next run refuses and writes nothing.
  const onTheInjection = withStandIn({ dotnet: appendOn('grep -q "let private __proof" src/Scoreboard.fs 2>/dev/null', 'src/Scoreboard.fs', 'EDIT-ON-THE-INJECTION') }, ({ go, read, has }) => {
    const first = go()
    const after = { target: read(TARGET), backup: read(BACKUP), stateLeft: has(MARKER_FILE) }
    const second = go()
    return { first, after, second, target: read(TARGET) }
  })
  sc('A LINE ADDED TO THE INJECTED TARGET IS NOT LOST: it is left as found with its injection, the state is kept (the original is only there), the run fails, and the next run writes nothing and stops',
    onTheInjection.first.status === 1 && onTheInjection.after.target.includes('// EDIT-ON-THE-INJECTION') && onTheInjection.after.target.includes(MARKER) && onTheInjection.after.stateLeft
      && onTheInjection.after.backup === clean && unwritten(onTheInjection.first, TARGET)
      && onTheInjection.first.stderr.includes(`(${TARGET} still carries this run's proof functions, with what was changed meanwhile, which is not in them). Put ${TARGET} right by hand: delete ${targetPart}, then: rm -rf ${STATE_DIR}.`)
      && onTheInjection.second.status === 1 && /nothing was written/.test(onTheInjection.second.stderr) && onTheInjection.target === onTheInjection.after.target && !/baseline tree compiles/.test(onTheInjection.second.stdout),
    `first: status ${onTheInjection.first.status}, edit kept ${onTheInjection.after.target.includes('// EDIT-ON-THE-INJECTION')}, state kept ${onTheInjection.after.stateLeft}; second: status ${onTheInjection.second.status}, ${onTheInjection.second.stderr.slice(0, 120).replace(/\n/g, ' | ')}`)

  // The same on the registry's probe: the exact compiler, so that the run's own status is the restore's.
  const onTheProbe = withStandIn({ dotnet: exactCompiler('echo "// EDIT-ON-THE-PROBE" >> src/Desk.fs') }, ({ go, read, has }) => {
    const first = go()
    const after = { registry: read(REGISTRY), stateLeft: has(MARKER_FILE) }
    const second = go()
    return { first, after, second, registry: read(REGISTRY) }
  })
  sc('A LINE ADDED TO THE PROBED REGISTRY IS NOT LOST: it is left as found with its probe, the state is kept, the run FAILS although every check passed, and the next run writes nothing and stops',
    /(\d+)\/\1 checks passed/.test(onTheProbe.first.stdout) && onTheProbe.first.status === 1 && onTheProbe.after.registry.includes('// EDIT-ON-THE-PROBE') && onTheProbe.after.registry.includes('| NHL')
      && onTheProbe.after.stateLeft && unwritten(onTheProbe.first, REGISTRY)
      && onTheProbe.first.stderr.includes(`(${REGISTRY} still carries this run's probe case, with what was changed meanwhile, which is not in them). Put ${REGISTRY} right by hand: delete ${probeCase}, then: rm -rf ${STATE_DIR}.`) && onTheProbe.second.status === 1 && /nothing was written/.test(onTheProbe.second.stderr) && onTheProbe.registry === onTheProbe.after.registry,
    `first: status ${onTheProbe.first.status}, edit kept ${onTheProbe.after.registry.includes('// EDIT-ON-THE-PROBE')}, state kept ${onTheProbe.after.stateLeft}; second: status ${onTheProbe.second.status}, ${onTheProbe.second.stderr.slice(0, 120).replace(/\n/g, ' | ')}`)

  // One file that could not be put back and one that carries the probe: both go in the list to put right, and only the file that carries something has lines to delete.
  const failedAndCarrying = observed(exactCompiler('rm -f src/Scoreboard.fs; mkdir src/Scoreboard.fs; echo "// EDIT-BESIDE-A-TARGET-THAT-IS-GONE" >> src/Desk.fs'))
  sc('A TARGET THAT CANNOT BE RESTORED BESIDE A REGISTRY THAT CARRIES ITS PROBE: the message puts both on the list to put right by hand and gives the lines to delete only for the registry, and the state is kept (1 run)',
    failedAndCarrying.r.status === 1 && failedAndCarrying.stateLeft && /src\/Scoreboard\.fs could NOT be put back/.test(failedAndCarrying.r.stderr)
      && failedAndCarrying.r.stderr.includes(`(${REGISTRY} still carries this run's probe case, with what was changed meanwhile, which is not in them). Put ${TARGET} and ${REGISTRY} right by hand: delete ${probeCase}, then: rm -rf ${STATE_DIR}.`),
    failedAndCarrying.r.stderr.replace(/\n/g, ' | ').slice(0, 500))
  // AN EDIT BETWEEN THE PROBE AND THE UNION'S LAST CASE (review 6, finding 0). The registry phase writes its probe directly above the union's last case, and adding a sport is writing it directly above that
  // case too, so a sport saved during that phase lands between the two. The restore decided a changed registry "carries the probe" by finding the probe DIRECTLY above the last case, which that edit had just
  // stopped being true: the file was called someone else's with none of the run's code in it, the state (the only whole copy) was deleted, and the message said "left exactly as found" with the second `| NHL`
  // still in the file. Measured 2026-11-05 on the real Desk.fs with a stand-in compiler: exit 1, no .proof-state, the file one `| NHL` over its backup, and the next run proceeded over it. The registry
  // here is shaped like the real one, which has an `| NHL` case of its own in the middle: a test for "the file has `| NHL`" would be true of a registry that carries nothing.
  const nhlTwice = `[ "$(grep -c '^    | NHL$' src/Desk.fs 2>/dev/null)" -ge 2 ]`
  const sportAboveLast = name => `awk '/^    [|] Unrecognised of raw: string$/ { print "    | ${name}" } { print }' src/Desk.fs > Desk.edit && mv Desk.edit src/Desk.fs`
  const separated = withStandIn({ dotnet: exactCompiler(sportAboveLast('MyNewSport'), nhlTwice), before: dir => writeFileSync(join(dir, REGISTRY), union) }, ({ dir, go, read, has, replaceDotnet }) => {
    const first = go()
    const after = { registry: read(REGISTRY), backup: read(`${BACKUP}.registry`), marker: (() => { try { return JSON.parse(read(MARKER_FILE)) } catch { return null } })() }
    const second = go()
    const refused = { registry: read(REGISTRY), stateLeft: has(MARKER_FILE) }
    // The person does what the message says: takes the probe's line out by hand (the sport they added stays) and removes the state.
    writeFileSync(join(dir, REGISTRY), unionWithSport)
    rmSync(join(dir, STATE_DIR), { recursive: true, force: true })
    replaceDotnet(exactCompiler('true', nhlTwice))
    const third = go()
    return { first, after, second, refused, third, registry: read(REGISTRY), stateLeft: has(STATE_DIR) }
  })
  sc('A SPORT ADDED BETWEEN THE PROBE AND THE LAST CASE KEEPS THE STATE: the registry is left as found, the run fails, the marker records the failed restore, the backup is the whole original, and the message names the file, says the probe is still in it and which line to delete (1 run, a registry shaped like the real one)',
    separated.first.status === 1 && /(\d+)\/\1 checks passed/.test(separated.first.stdout) && separated.after.registry === separatedUnion && separated.after.backup === union && separated.after.marker?.restoreFailed === true
      && unwritten(separated.first, REGISTRY)
      && separated.first.stderr.includes(`(${REGISTRY} still carries this run's probe case, with what was changed meanwhile, which is not in them). Put ${REGISTRY} right by hand: delete ${probeCase}, then: rm -rf ${STATE_DIR}.`),
    `status ${separated.first.status}, registry as found ${separated.after.registry === separatedUnion}, backup is the original ${separated.after.backup === union}, marker ${JSON.stringify(separated.after.marker && { restoreFailed: separated.after.marker.restoreFailed })}; ${separated.first.stderr.slice(0, 400).replace(/\n/g, ' | ')}`)
  sc('...AND THE NEXT RUN REFUSES: it writes nothing, keeps the state, runs no build, and says the registry carries the probe case; once the line is out by hand and the state removed, the run after it proceeds and puts the registry back to what it found (3 runs)',
    separated.second.status === 1 && separated.refused.registry === separatedUnion && separated.refused.stateLeft && /nothing was written/.test(separated.second.stderr) && !/baseline tree compiles/.test(separated.second.stdout)
      && separated.second.stderr.includes(`${REGISTRY} carries the probe case and has changed since`)
      && separated.third.status === 0 && /baseline tree compiles/.test(separated.third.stdout) && /(\d+)\/\1 checks passed/.test(separated.third.stdout) && separated.registry === unionWithSport && !separated.stateLeft,
    `second: status ${separated.second.status}, registry as found ${separated.refused.registry === separatedUnion}, state kept ${separated.refused.stateLeft}, ${separated.second.stderr.slice(0, 200).replace(/\n/g, ' | ')}; third: status ${separated.third.status}, registry ${separated.registry === unionWithSport}, state left ${separated.stateLeft}`)
  // The other direction, which a test of "the file has `| NHL`" gets wrong: the person took the probe's line out themselves. The registry still has its own `| NHL`, carries none of the run's code, and is theirs: left as found, and
  // the state has nothing left to put right.
  const probeTakenOut = withStandIn({
    dotnet: exactCompiler(`awk '/^    [|] NHL$/ { n++; if (n == 2) next } { print }' src/Desk.fs > Desk.edit && mv Desk.edit src/Desk.fs && echo "// EDIT-TOOK-THE-PROBE-OUT" >> src/Desk.fs`, nhlTwice),
    before: dir => writeFileSync(join(dir, REGISTRY), union),
  }, ({ go, read, has }) => ({ r: go(), registry: read(REGISTRY), stateLeft: has(STATE_DIR) }))
  sc('A REGISTRY WHOSE PROBE THE PERSON TOOK OUT IS THEIRS: left as found, the state goes (nothing of the run is on it), and the message does not say the probe is still in it (1 run, a registry with an `| NHL` of its own)',
    probeTakenOut.registry === `${union}// EDIT-TOOK-THE-PROBE-OUT\n` && !probeTakenOut.stateLeft && probeTakenOut.r.status === 1 && unwritten(probeTakenOut.r, REGISTRY) && !/still carries/.test(probeTakenOut.r.stderr),
    `registry ${JSON.stringify(probeTakenOut.registry.slice(-60))}, state left ${probeTakenOut.stateLeft}, status ${probeTakenOut.r.status}; ${probeTakenOut.r.stderr.slice(0, 300).replace(/\n/g, ' | ')}`)
  // The same registry after a KILL, not a failed restore: no restoreFailed flag, so the classifier alone decides. Its backups say the probe was not there; the file has a second `| NHL` and a sport between it and the
  // last case. Called stale, the state would go and the second run would adopt the probe as the original.
  const killedSeparated = sandbox({ target: clean, registry: separatedUnion, backupTarget: clean, backupRegistry: union, pid: DEAD })
  sc('A KILLED RUN WHOSE PROBE A SPORT HAS SEPARATED FROM THE LAST CASE IS NOT DISCARDED AS STALE: nothing is written, the state is kept, the registry is named as carrying the probe case, the run stops (1 planted state)',
    killedSeparated.status === 1 && killedSeparated.registry === separatedUnion && killedSeparated.stateLeft && !/STALE/.test(killedSeparated.stderr) && /nothing was written/.test(killedSeparated.stderr)
      && killedSeparated.stderr.includes(`${REGISTRY} carries the probe case and has changed since`) && !carriedOn(killedSeparated),
    show(killedSeparated))

  // The injection write is guarded too: an edit made while the BASELINE build ran (nothing injected yet) is not written over by the injection.
  const duringBaseline = observed('#!/bin/sh\nif ! grep -q "let private __proof" src/Scoreboard.fs 2>/dev/null && [ ! -f done ]; then touch done; echo "// EDIT-BEFORE-INJECTION" >> src/Scoreboard.fs; fi\nexit 0\n')
  sc('A LINE ADDED TO THE TARGET DURING THE BASELINE BUILD IS NOT WRITTEN OVER BY THE INJECTION: it is there afterwards, nothing was injected, the run fails and says the file changed',
    duringBaseline.target.includes('// EDIT-BEFORE-INJECTION') && !duringBaseline.target.includes(MARKER) && duringBaseline.r.status === 1 && unwritten(duringBaseline.r, TARGET) && !duringBaseline.stateLeft
      && duringBaseline.r.stderr.includes(`Error: ${TARGET} changed while the run was going, so nothing was written to it`),
    `target ${JSON.stringify(duringBaseline.target.slice(-40))}, status ${duringBaseline.r.status}, state left ${duringBaseline.stateLeft}; ${duringBaseline.r.stderr.slice(0, 160).replace(/\n/g, ' | ')}`)

  // The two files are put back on their own: a target that cannot be touched does not keep the registry from going back.
  const targetGoneInPhase2 = observed('#!/bin/sh\nif grep -q "| NHL" src/Desk.fs 2>/dev/null; then rm -f src/Scoreboard.fs; mkdir src/Scoreboard.fs; fi\nexit 0\n')
  sc('A TARGET THAT CANNOT BE RESTORED DOES NOT KEEP THE REGISTRY FROM BEING RESTORED: the registry is back, the state is kept for the target, and the run fails naming it',
    targetGoneInPhase2.registry === oldUnion && targetGoneInPhase2.stateLeft && targetGoneInPhase2.r.status === 1 && /src\/Scoreboard\.fs could NOT be put back/.test(targetGoneInPhase2.r.stderr),
    `registry back ${targetGoneInPhase2.registry === oldUnion}, state kept ${targetGoneInPhase2.stateLeft}, status ${targetGoneInPhase2.r.status}; ${targetGoneInPhase2.r.stderr.slice(0, 160).replace(/\n/g, ' | ')}`)

  // A SIGNAL STOPS THE RUN AT ONCE (residual Task 7, 2026-11-05). The handlers that used to be registered for SIGINT, SIGTERM and SIGHUP could not run: the script is one synchronous run with no
  // await, so the event loop does not turn until it ends (measured on the old code: the signal was sent from inside the first injected build, seven builds ran, the run took 7 s, exit status 1, the
  // handler's 130 never). With none registered the default action applies. The stand-in compiler signals the run's own pid, read from its marker, in the first build that sees the injection, and then
  // exits 0, so the build count says whether anything ran after the signal: two calls (the baseline, and the one that signalled). The injection and the state stay where the signal found them, and the
  // next run heals them. Coverage (Rule 91): a stand-in compiler, one run per signal; a real `dotnet` under a signal is not exercised.
  for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
    const dotnet = ['#!/bin/sh', 'echo call >> calls.log', 'if grep -q "let private __proof" src/Scoreboard.fs 2>/dev/null && [ ! -f sent ]; then touch sent;',
      `  pid=$(sed -n 's/.*"pid": *\\([0-9][0-9]*\\).*/\\1/p' .proof-state/active.json); kill -${sig.slice(3)} "$pid"; fi`, 'exit 0', ''].join('\n')
    const stopped = withStandIn({ dotnet }, ({ go, has, read, replaceDotnet }) => {
      const first = go()
      const calls = (read('calls.log') ?? '').split('\n').filter(Boolean).length
      const stranded = (read(TARGET) ?? '').includes(MARKER) && has(MARKER_FILE)
      replaceDotnet('#!/bin/sh\nexit 0\n')
      const second = go()
      return { first, calls, stranded, second, target: read(TARGET) }
    })
    sc(`${sig} SENT FROM INSIDE THE FIRST INJECTED BUILD STOPS THE RUN AT ONCE: it dies of the signal, no build runs after it, the injection and the state are left for the next run, which HEALS the target (stand-in compiler, 1 run)`,
      stopped.first.signal === sig && stopped.calls === 2 && stopped.stranded && /HEALED/.test(stopped.second.stderr) && stopped.target === clean,
      `signal ${stopped.first.signal} (status ${stopped.first.status}), builds ${stopped.calls}, stranded ${stopped.stranded}, next run healed ${/HEALED/.test(stopped.second.stderr)}, target back ${stopped.target === clean}`)
  }

  // The trade-off the rule has to keep: a write that fails PART-WAY leaves a half-written injection, which only the blind restore used to repair, and `strandedTarget` does not recognise it. A real one: under a
  // file size limit of 3 KB the injection write is cut short at 3072 bytes and then fails with EFBIG, leaving the marker in and the anchor out. It is a prefix of what the run tried to write, so it is put back.
  // (Linux, bash, `ulimit -S -f`: where bash cannot set it the clause says it was not asserted; where the write does not fail with EFBIG it fails rather than passes empty.)
  const haveBash = spawnSync('bash', ['-c', 'ulimit -S -f 3'], { stdio: 'ignore' }).status === 0
  const halfTarget = `// head\n// ${'x'.repeat(2930)}\n${ANCHOR}\n  body\n`
  const halfWritten = haveBash ? withStandIn({ dotnet: '#!/bin/sh\nexit 0\n', target: halfTarget }, ({ go, read, has }) => ({ r: go({}, 3), target: read(TARGET), stateLeft: has(STATE_DIR) })) : null
  sc(`A HALF-WRITTEN INJECTION (a real partial write: the file size limit cut it short, EFBIG) IS STILL PUT BACK: the target is the original, the state is gone (1 run; asserted: ${haveBash})`,
    !haveBash || (/EFBIG/.test(halfWritten.r.stderr) && halfWritten.target === halfTarget && !halfWritten.stateLeft),
    haveBash ? `EFBIG in stderr ${/EFBIG/.test(halfWritten.r.stderr)}, target is the original ${halfWritten.target === halfTarget} (${halfWritten.target?.length} bytes of ${halfTarget.length}), state left ${halfWritten.stateLeft}` : 'no bash')

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
  registryAnchored: currentRegistry.includes(REGISTRY_ANCHOR),
  targetStranded,
  registryStranded,
  registryInjected: carriesProbe(currentRegistry),
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
    if (carriesProbe(currentRegistry) && !registryStranded) reasons.push([REGISTRY, `${REGISTRY} carries the probe case and has changed since`])
    // A run whose restore did not read back: a file that is not what it backed up may be torn (and must not be called stale), the backup being the only whole copy.
    if (restoreFlagged) {
      if (!targetStranded && currentTarget !== backupTarget) reasons.push([TARGET, `${TARGET} is not what that run backed up, and its restore did not read back, so it may be torn`])
      if (!registryStranded && currentRegistry !== backupRegistry) reasons.push([REGISTRY, `${REGISTRY} is not what that run backed up, and its restore did not read back, so it may be torn`])
    }
    // A file with no anchor that is not provably this run's injection may be torn (the same file can also be named above: both reasons are true). Every way to be `diverged` names a file, so there is no empty case to fall back on.
    if (!targetStranded && !currentTarget.includes(ANCHOR)) reasons.push([TARGET, `${TARGET} has no injection anchor, so it may be torn`])
    if (!registryStranded && !currentRegistry.includes(REGISTRY_ANCHOR)) reasons.push([REGISTRY, `${REGISTRY} has no last case, so it may be torn`])
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
      if (carriesProbe(currentRegistry)) strays.push(REGISTRY)
      if (strays.length) {
        console.error(`proof-check: ${strays.join(' and ')} contain${strays.length > 1 ? '' : 's'} injected proof code (${strays.length > 1 ? 'the target and the probe case' : strays[0] === TARGET ? 'the proof functions' : 'the probe case'}) and no run state exists.`)
        // With no state there is nothing to restore from, so the lines are deleted by hand. A checkout is named only for an uncommitted injection, with what it costs: it puts a file back to the index,
        // which discards every uncommitted edit to the file and, on a committed injection (217282b), changes nothing. clean-source-check.mjs gives the same advice for the same state; the wording is
        // kept by eye in both, because that check must keep working when this script is the thing that broke.
        const many = strays.length > 1
        const parts = strays.map(f => f === TARGET
          ? `the injected block in ${TARGET} (each "${MARKER}N" header and the indented lines under it; \`grep -n "${MARKER}" ${TARGET}\` finds them)`
          : probeOnRegistry(currentRegistry)
            ? `the probe case in ${REGISTRY} (the line "${REGISTRY_PROBE.trimEnd()}" directly above "${REGISTRY_ANCHOR.slice(1)}"; \`grep -n -B1 "^${REGISTRY_ANCHOR.slice(1)}$" ${REGISTRY}\` shows it)`
            : removalOf(REGISTRY))
        console.error(`Delete ${parts.join(' and ')}, then run this again.`)
        console.error(`If the ${many ? 'injections are' : 'injection is'} uncommitted, \`git checkout -- ${strays.join(' ')}\` also removes ${many ? 'them' : 'it'} but discards every uncommitted edit to the ${many ? 'files' : 'file'}.`)
        process.exit(1)
      }
    }
    break
}

const source = readFileSync(TARGET, 'utf8')
const registrySource = readFileSync(REGISTRY, 'utf8')
mkdirSync(STATE_DIR, { recursive: true })
const runMarker = {
  pid: process.pid,
  start: startOf(process.pid),
  startedAt: STARTED_AT.toISOString(),
  target: TARGET,
  registry: REGISTRY,
}
// THE MARKER IS CREATED FIRST, EXCLUSIVELY, AND NOTHING ELSE IS WRITTEN INTO THE STATE DIRECTORY BEFORE IT EXISTS. The check above and this create are two steps, and a second run that started in between
// (two runs begun in the same tick both reached their baseline in 4 of 20 trials, measured 2026-11-05) would otherwise write its marker over this one's and run its builds over this one's injection.
// `wx` makes the loser fail here, before it has injected anything, and the refusal is all it does: its exit handler is registered below, so it restores nothing, which is right because it owns nothing.
// The backups come after the create so that a loser has written nothing into a directory that is not its own: written first, they were overwritten with the loser's reading of the files, whether it lost
// to another run or to a link standing where the marker goes. The window this opens is harmless. A kill after the create and before the backups leaves a marker with none of them, or one, over files
// this run has not touched (the first injection is after the baseline build, which is after both backups), and the next run reads that as stale and discards it. Until 2026-11-05 the marker went LAST, so
// that "a marker on disk always has backups behind it"; the dead end that order guarded, a marker pointing at nothing over an injected tree, cannot happen, because nothing is injected before the backups.
//
// WHAT THE CREATE DOES NOT MAKE TRUE: "two runs started together cannot both proceed" holds over a tree with NO marker, and not over a stale or healable one. Both runs read the same dead marker, and
// the 'heal' and 'stale' cases remove the whole state directory BEFORE this create, so the slower run's removal can delete the faster run's fresh marker, after which its own create succeeds. Measured
// 2026-11-05 with the interleaving forced (run A holds its removal until run B has built): both printed STALE STATE DISCARDED, A's `inject` threw "changed while the run was going" (B's injection was
// on the file), and A's exit message told a person to delete the block in a file that was B's live injection; a natural collision did not reproduce (0 of 20 starts over a stale marker). It stays,
// because closing it takes a lock that a dead run cannot leave behind (which is what the marker is for) or a compare-and-swap the filesystem does not give: renaming the state directory away claims
// whatever is at that name at that moment, the stale one or the fresh one. What stops two injections in that window is `inject`, not the marker: its guard throws before the late injector has written.
try {
  writeFileSync(MARKER_FILE, JSON.stringify(runMarker, null, 2) + '\n', { flag: 'wx' })
} catch (e) {
  if (e.code !== 'EEXIST') throw e
  // Something is at the marker's path. A link is not another run: `existsSync` follows it, so a link to nothing reads as "no marker" and `wx` then refuses it, and "run this again" can never succeed.
  const link = (() => { try { return lstatSync(MARKER_FILE).isSymbolicLink() ? readlinkSync(MARKER_FILE) : null } catch { return null } })()
  console.error(link === null
    ? `proof-check: another run took ${MARKER_FILE} while this one was starting. Run this again once it has finished.`
    : `proof-check: ${MARKER_FILE} is a symbolic link (to ${link}) and this run does not write through a link, so no other run is involved. Remove it (rm ${MARKER_FILE}) and run this again.`)
  process.exit(1)
}
writeFileSync(BACKUP, source)
writeFileSync(`${BACKUP}.registry`, registrySource)

// The original is held in memory AND on disk (in .proof-state, in the repo), and put back when the run ends or throws. NO SIGNAL HANDLER IS REGISTERED, on purpose: this script is one
// synchronous run with no await, so a handler could not run until the run was over (measured in review 4: SIGTERM sent mid-run, seven builds still ran and the handler never did), and its
// existence made a plain kill look handled when it was not. With none, a kill, Ctrl-C or a hangup takes the default action and stops the run at once, leaving the injection where it is,
// exactly as SIGKILL does. The state on disk and the next run's heal are the answer to that for every signal. (A plain try/finally does not run on SIGTERM either, which is how the tree
// got left broken before the state existed.)
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
// WRITTEN ONLY OVER WHAT IS PROVABLY THIS RUN'S OWN (2026-11-05, residual Task 4). The files used to be written back blind, from memory, whatever was on disk: a line appended to
// either file while a phase ran was gone after the run (four stand-in variants, four losses), and the injection write itself overwrote an edit made during the baseline build. What this
// run last TRIED to write to each file is recorded before the write (a write that fails part-way has still been attempted), and a file is written, injected or restored, only when `ours`
// (above) says it is the original or a prefix of that text.
const attempted = new Map()
const inject = (file, original, text) => {
  if (!ours(readFileSync(file, 'utf8'), original, attempted.get(file))) throw new Error(`${file} changed while the run was going, so nothing was written to it`)
  attempted.set(file, text)
  writeFileSync(file, text)
}
// What a restore did to each file, judged and written on its own (a target that cannot be written does not stop the registry going back): 'ok' (it is the original, or was put back and
// read back), 'failed' (it could not be read or written, or did not read back), 'foreign' (it is someone else's and carries none of this run's code: left exactly as found), 'carrying'
// (someone else's, and it still carries this run's injection: left as found, and the state is what holds the original).
const outcome = { [TARGET]: 'ok', [REGISTRY]: 'ok' }
const restoreOne = (file, original) => {
  try {
    const now = readFileSync(file, 'utf8')
    if (now === original) return 'ok'
    if (!ours(now, original, attempted.get(file))) return (file === TARGET ? now.includes(MARKER) : carriesProbe(now)) ? 'carrying' : 'foreign'
    writeFileSync(file, original)
    return readFileSync(file, 'utf8') === original ? 'ok' : 'failed'
  } catch {
    return 'failed' // best effort — the on-disk backups are the fallback, and they stay
  }
}
// TRUE ONLY IF BOTH FILES READ BACK AS THEY WERE. The state is dropped on that answer and no other: a write that failed (a full disk, a lock, EIO) leaves a tracked file
// injected, and the backups on disk are then the only thing that can put it right. The previous version dropped the state whether or not the files went back, so after a
// failed write the next run found a mutated file and no state, and the only advice it had was `git checkout --`, which discards whatever else is uncommitted in the file.
const restoreFiles = () => {
  outcome[TARGET] = restoreOne(TARGET, source)
  outcome[REGISTRY] = restoreOne(REGISTRY, registrySource)
  return outcome[TARGET] === 'ok' && outcome[REGISTRY] === 'ok'
}
// The marker goes with the backups, as one directory. A marker left behind by a run that
// finished would make the NEXT run judge a run that is over (stale at best), and the
// backups of a finished run describe nothing.
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
  const named = (...kinds) => [TARGET, REGISTRY].filter(f => kinds.includes(outcome[f]))
  const failed = named('failed')
  const carrying = named('carrying')
  const changed = named('foreign', 'carrying')
  process.exitCode = 1
  if (changed.length) console.error(`proof-check: ${changed.join(' and ')} changed while the run was going and was left exactly as found (nothing was written over ${changed.length > 1 ? 'them' : 'it'}). This run's result is not to be trusted.`)
  // A file that is someone else's and carries none of this run's code is theirs, and fine as it is: the state has nothing left to put right, and goes.
  if (failed.length === 0 && carrying.length === 0) { dropState(); return }
  let flagged = false
  try { writeFileSync(MARKER_FILE, JSON.stringify({ ...runMarker, restoreFailed: true }, null, 2) + '\n'); flagged = true } catch { /* the sentinel still says so */ }
  console.error(`proof-check: ${failed.length ? `${failed.join(' and ')} could NOT be put back (a write failed, or what was written did not read back). ` : ''}${STATE_DIR} was kept: ${BACKUP} and ${BACKUP}.registry `
    + `are the whole originals${carrying.length ? ` (${carrying.map(f => `${f} still carries this run's ${f === TARGET ? 'proof functions' : 'probe case'}`).join(' and ')}, with what was changed meanwhile, which is not in them)` : ''}. `
    + `Put ${named('failed', 'carrying').join(' and ')} right by hand${carrying.length ? `: delete ${carrying.map(removalOf).join(' and ')}` : ''}, then: rm -rf ${STATE_DIR}. `
    + (pending || flagged
      ? 'The next run writes nothing over a file that is not what this run backed up.'
      : 'This failure could NOT be recorded in the state directory either, so the next run cannot tell: do not run proof-check again until the files are right.'))
}
process.on('exit', restore)

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
  inject(TARGET, source, layout(source, [c]).text)
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
    inject(TARGET, source, batch.text)
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
      inject(REGISTRY, registrySource, withCase)
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
