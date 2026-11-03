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
// The state machine and the batch's pure functions (layout, attribute,
// parseErrors). Everything below it needs a real compiler; this is the half that
// decides whether a killed run corrupts the tree and whether an error lands in
// the right case, and it is cheap enough to run before every real run.
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

console.log(`\ndocs/*-PROOF.md: ${cases.length} claimed rejection(s) read, ${decidedByCompiler} given a verdict by the compiler\n`)
finish(summarize())
