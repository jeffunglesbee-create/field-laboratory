// The importable half of the mutation harness: what it needs to build quickly and to be split across runners, with nothing that runs on import.
//
// docs/CC-CMD-2026-11-03-gate-speed.md. scripts/mutation-check.mjs does its work at module scope and has no `export` on purpose (importing it once ran the whole
// suite); everything that can be a pure function or a small class with its own tests lives here instead.
//
// THE FACTS THIS RESTS ON, each measured on 2026-11-03 against Fable 5.13.0 (see the CC-CMD's table):
//   - `dotnet fable watch -c Release` writes byte-identical output to the full compile (watch defaults to Debug, which is not); the one file that differs is
//     fable_modules/project_cracked.json, which carries paths;
//   - an incremental compile takes about 3 s against 25 to 34 s;
//   - "Fable compilation finished" is NOT the end of a compile: on a type error it still prints, and the error lines follow it. The cycle is
//     "Started Fable compilation..." ... "Watching src";
//   - restoring a file restores the output byte for byte, after a failed compile too.
//
// THE INVARIANT THE DRIVER KEEPS, and the reason a stale build cannot give a false catch: the build is made CLEAN, and its digest compared to the clean digest, before
// every mutation. A build that is stale between mutations is then only ever a clean build, so what it can produce is a mutation that survives (loud), never a
// mutation caught by the previous one's leftovers (silent).

import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync, rmSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createChecks, finish, isMain } from './checks.mjs'

export const stripAnsi = s => String(s).replace(/\x1b\[[0-9;]*m/g, '')

// --- reading Fable's watch output ---------------------------------------------

const ERROR_LINE = /\berror (FSHARP|FABLE|EXCEPTION)\b|: error FS\d+/

/**
 * A state machine over Fable's watch output. A CYCLE opens at `Started Fable compilation...` and closes at `Watching <dir>`; an error line inside it fails
 * it. "Fable compilation finished in Nms" only records the duration: it is printed on a failing compile too, and the error lines arrive AFTER it (2 ms later,
 * measured), so a reader that took it as the end would call a failed compile a success.
 *
 * `clock` is injectable so the settle logic is testable without sleeping.
 */
export class CycleTracker {
  constructor(clock = Date.now) {
    this.clock = clock
    this.history = []
    this.open = false
    this.cur = null
    this.buffer = ''
    this.lastActivity = clock()
    this.orphanErrors = []
  }
  feed(chunk) {
    this.buffer += chunk
    let i
    while ((i = this.buffer.indexOf('\n')) >= 0) {
      this.line(this.buffer.slice(0, i))
      this.buffer = this.buffer.slice(i + 1)
    }
  }
  line(raw) {
    const l = stripAnsi(raw).trim()
    if (!l) return
    this.lastActivity = this.clock()
    const begin = () => { this.open = true; this.cur = { errors: [], ms: null } }
    if (/^Started Fable compilation/.test(l)) return begin()
    const fin = /^Fable compilation finished in (\d+)ms/.exec(l)
    if (fin) {
      if (!this.open) begin()
      this.cur.ms = Number(fin[1])
      return
    }
    if (ERROR_LINE.test(l)) {
      if (this.open) this.cur.errors.push(l)
      else this.orphanErrors.push(l)
      return
    }
    if (/^Watching /.test(l) && this.open) {
      this.history.push({ ok: this.cur.errors.length === 0, errors: this.cur.errors, ms: this.cur.ms })
      this.open = false
      this.cur = null
    }
  }
  snapshot() { return { ended: this.history.length, open: this.open } }
}

/**
 * Has the compile that a write caused finished, and how did it go? Pure.
 * Done needs at least one cycle ended since the write, none open, and the output quiet for `settleMs` (a second cycle can follow the first when an editor writes
 * twice; one write 5 ms after another produced one cycle in the measurement, but the window costs 300 ms and a double cycle is not worth reasoning about).
 * The verdict is the LAST cycle's: a failed first compile of a half-written file followed by a good one is a good build of the final source.
 */
export const settled = ({ history, open, lastActivity }, atWrite, now, settleMs) => {
  const cycles = history.slice(atWrite.ended)
  if (cycles.length === 0 || open || now - lastActivity < settleMs) return { done: false }
  const last = cycles[cycles.length - 1]
  return { done: true, ok: last.ok, errors: last.errors, ms: last.ms, cycles: cycles.length }
}

// --- digests ---------------------------------------------------------------------

const walk = dir => readdirSync(dir).flatMap(name => {
  const p = join(dir, name)
  return statSync(p).isDirectory() ? walk(p) : [p]
}).sort()

/** sha-256 over every file under `dir` (relative path and bytes) but fable_modules/project_cracked.json, which carries paths and differs between a full and a
 *  watched compile of the same source. `extraFiles` are hashed too (public/index.html: the stylesheet is mutated there and nothing else notices). */
export const digestDir = (dir, extraFiles = []) => {
  const h = createHash('sha256')
  for (const f of walk(dir)) {
    if (f.endsWith('project_cracked.json')) continue
    h.update(f.slice(dir.length))
    h.update(readFileSync(f))
  }
  for (const f of extraFiles) { h.update(`\0${f}`); h.update(existsSync(f) ? readFileSync(f) : '<absent>') }
  return h.digest('hex').slice(0, 16)
}

/** Each file's own hash, keyed by path: what `digestDir` hashes together, kept apart so a digest that moved can say WHICH files moved. */
export const manifestDir = (dir, extraFiles = []) => {
  const m = new Map()
  for (const f of walk(dir)) {
    if (f.endsWith('project_cracked.json')) continue
    m.set(f.slice(dir.length), createHash('sha256').update(readFileSync(f)).digest('hex').slice(0, 12))
  }
  for (const f of extraFiles) m.set(`<extra>${f}`, existsSync(f) ? createHash('sha256').update(readFileSync(f)).digest('hex').slice(0, 12) : '<absent>')
  return m
}

/** `+` a file that is new, `-` one that is gone, `~` one whose bytes changed; at most `cap` lines, and the rest counted. */
export const diffManifests = (clean, now, cap = 10) => {
  const lines = []
  for (const [k, v] of now) {
    if (!clean.has(k)) lines.push(`+ ${k}`)
    else if (clean.get(k) !== v) lines.push(`~ ${k}`)
  }
  for (const k of clean.keys()) if (!now.has(k)) lines.push(`- ${k}`)
  return lines.length > cap ? [...lines.slice(0, cap), `... and ${lines.length - cap} more`] : lines
}

// --- sharding ----------------------------------------------------------------------

export const parseShard = text => {
  const m = /^(\d+)\/(\d+)$/.exec(String(text ?? ''))
  if (!m) throw new Error(`--shard wants i/N (for example 3/8), got ${JSON.stringify(text)}`)
  const i = Number(m[1]), n = Number(m[2])
  if (n < 1 || i < 1 || i > n) throw new Error(`--shard ${text}: i must be between 1 and N`)
  return { i, n }
}

/** The ids that shard `i` of `n` runs: positions i-1, i-1+n, ... Stable for a given list, and every id lands in exactly one shard. */
export const shardOf = (ids, i, n) => {
  parseShard(`${i}/${n}`)
  return ids.filter((_, k) => k % n === i - 1)
}

// --- the builders ------------------------------------------------------------------

const sleep = ms => new Promise(r => setTimeout(r, ms))
const runSync = cmd => spawnSync(cmd, { shell: true, stdio: 'ignore' }).status === 0
/** Like runSync, and keeps WHY: the exit status or signal and the last lines of output. A build that fails on a runner and says nothing is a failure nobody can diagnose. */
const attempt = cmd => {
  const r = spawnSync(cmd, { shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const ok = r.status === 0
  const text = `${r.stdout ?? ''}\n${r.stderr ?? ''}`.split('\n').map(l => l.trimEnd()).filter(Boolean)
  // The diagnostics first, wherever they are, then the end of the output. A refusal that is followed by a stack trace (Fable throws after a type error in some
  // shapes) has its diagnostics far above the last lines, and a reader of the tail alone would call it a build that said nothing (found by running one).
  const diagnostics = text.filter(l => /\berror (FSHARP|FABLE|EXCEPTION)\b|: error FS\d+/.test(stripAnsi(l))).slice(0, 12)
  const shown = [...new Set([...diagnostics, ...text.slice(-12)])]
  return { ok, why: ok ? '' : `exit ${r.status ?? 'none'}${r.signal ? ` (signal ${r.signal})` : ''}${r.error ? ` (${r.error.message})` : ''}: ${shown.join(' | ')}` }
}
/** The one place a builder says its build is not the clean one, and which files make it so. */
const assertCleanOf = (b, label) => {
  const d = b.digest()
  if (d === b.cleanDigest) return
  const diff = diffManifests(b.cleanManifest, manifestDir(b.outDir, b.extraFiles))
  throw new Error(`the build is not clean before ${label}: digest ${d}, clean ${b.cleanDigest}\n  differing: ${diff.length ? diff.join('; ') : 'none by file, so a path was renamed or the same bytes sit under another name'}`)
}

/**
 * The reference builder: a whole-project compile (`npm run build`) every time. Slow, and the definition of correct.
 * `start()` builds once so the clean digest is of a build that was just made, not of whatever was lying there.
 */
export class FullBuild {
  constructor({ command = 'npm run build', outDir = 'build', extraFiles = ['public/index.html'], fault = null } = {}) {
    Object.assign(this, { command, outDir, extraFiles, fault, mode: 'full', cleanDigest: null, cleanManifest: null })
  }
  digest() { return digestDir(this.outDir, this.extraFiles) }
  async start() {
    const t = Date.now()
    let built = attempt(this.command)
    // A crashed compiler is repeated (see compileSteadily); a build that failed any other way is not.
    for (let n = 0; !built.ok && /internal error/i.test(stripAnsi(built.why)) && n < MAX_CRASH_RETRIES; n++) built = attempt(this.command)
    if (!built.ok) throw new Error(`the initial build failed: ${this.command}: ${built.why}`)
    this.cleanDigest = this.digest()
    this.cleanManifest = manifestDir(this.outDir, this.extraFiles)
    return { ms: Date.now() - t, digest: this.cleanDigest }
  }
  /** Run `write()` (which changes a source file), then build. A fault named for the watch driver is a no-op here, so a fault test cannot pass vacuously. */
  async compile(write, { restore = false } = {}) {
    const crash = injectedCrash(this, restore)
    if (crash) return crash
    const t = Date.now()
    write()
    const built = attempt(this.command)
    return { ok: built.ok, ms: Date.now() - t, digest: this.digest(), errors: built.ok ? [] : [`the build failed, ${built.why}`], cycles: 1 }
  }
  assertClean(label) { assertCleanOf(this, label) }
  stop() {}
}

/**
 * The fast builder: one `dotnet fable watch -c Release` for the whole run.
 * Every change goes through `compile(write)`: the cycle count is read BEFORE the write, the write happens, and the call returns only when a cycle that began after
 * it has ended and the output has been quiet for `settleMs`. A write that causes no cycle at all within `startTimeoutMs` is an error, never an assumption.
 */
export class WatchBuild {
  constructor({
    command = 'dotnet', args = ['fable', 'watch', 'src/Laboratory.fsproj', '-c', 'Release', '--outDir', 'build'], cwd = '.', env = process.env,
    outDir = 'build', extraFiles = ['public/index.html'], assemble = () => runSync('node scripts/build-site.mjs'),
    settleMs = 300, startTimeoutMs = 20000, cycleTimeoutMs = 300000, initialTimeoutMs = 300000, fault = null, onLine = null,
  } = {}) {
    Object.assign(this, { command, args, cwd, env, outDir, extraFiles, assemble, settleMs, startTimeoutMs, cycleTimeoutMs, initialTimeoutMs, fault, onLine, mode: 'watch', cleanDigest: null, cleanManifest: null })
    this.tracker = new CycleTracker()
    this.child = null
    this.tail = []
    this.exit = null
  }
  /** The watcher is gone: say how, with the last of what it printed. A dead watcher is never waited on until a timeout names the wrong cause. */
  #died(what) {
    const e = this.exit
    return new Error(`${what}: the watcher exited (code ${e?.code ?? 'none'}${e?.signal ? `, signal ${e.signal}` : ''}): ${this.tail.join(' | ') || '(it printed nothing)'}`)
  }
  digest() { return digestDir(this.outDir, this.extraFiles) }

  async #waitSettled(atWrite, what) {
    const t0 = Date.now()
    let began = false
    for (;;) {
      const now = Date.now()
      const s = settled(this.tracker, atWrite, now, this.settleMs)
      if (s.done) return s
      // After settled(): a cycle that finished before the watcher died is still honoured. Before the timeouts: they are for a live watcher.
      if (!this.child) throw this.#died(what)
      if (this.tracker.open || this.tracker.history.length > atWrite.ended) began = true
      if (!began && now - t0 > this.startTimeoutMs) throw new Error(`${what}: the watcher began no compile within ${this.startTimeoutMs} ms of the write (a stale build is never assumed to be fresh)`)
      if (now - t0 > this.cycleTimeoutMs) throw new Error(`${what}: the compile did not finish within ${this.cycleTimeoutMs} ms`)
      await sleep(25)
    }
  }

  /** Start the watcher and wait for its first full compile. `expectDigest`, when given, is the digest of the build that existed before: a full compile's output. */
  async start({ expectDigest = null } = {}) {
    const t = Date.now()
    this.child = spawn(this.command, this.args, { cwd: this.cwd, env: this.env, stdio: ['ignore', 'pipe', 'pipe'] })
    const feed = b => {
      const s = b.toString(); this.onLine?.(s); this.tracker.feed(s)
      for (const l of stripAnsi(s).split('\n')) if (l.trim()) this.tail.push(l.trimEnd())
      this.tail = this.tail.slice(-25)
    }
    this.child.stdout.on('data', feed)
    this.child.stderr.on('data', feed)
    // 'close', not 'exit': it fires after stdout and stderr have drained, so the tail is complete when the error is thrown.
    this.child.on('close', (code, signal) => { this.exit = { code, signal }; this.child = null })
    const deadline = Date.now() + this.initialTimeoutMs
    const zero = { ended: 0, open: false }
    for (;;) {
      const s = settled(this.tracker, zero, Date.now(), this.settleMs)
      if (s.done) {
        if (!s.ok) throw new Error(`the initial compile failed:\n${s.errors.join('\n')}`)
        break
      }
      if (!this.child) throw this.#died('the initial compile')
      if (Date.now() > deadline) throw new Error(`the initial compile did not finish within ${this.initialTimeoutMs} ms`)
      await sleep(50)
    }
    if (!this.assemble()) throw new Error('assembling the site after the initial compile failed')
    this.cleanDigest = this.digest()
    this.cleanManifest = manifestDir(this.outDir, this.extraFiles)
    if (expectDigest !== null && expectDigest !== this.cleanDigest) {
      throw new Error(`the watched initial compile (${this.cleanDigest}) is not the build that was there (${expectDigest}). Either build/ is stale (run npm run build) or the watched compile is not a full compile: the configuration, Fable or its cache has drifted.`)
    }
    return { ms: Date.now() - t, digest: this.cleanDigest }
  }

  /** `restore: true` marks the write that puts the original back; only the fault named skip-restore-wait looks at it. */
  async compile(write, { restore = false, label = 'a write', noCycle = false } = {}) {
    const crash = injectedCrash(this, restore)
    if (crash) return crash
    const t = Date.now()
    if (noCycle) { write(); const ok = this.assemble(); return { ok, ms: Date.now() - t, digest: this.digest(), errors: ok ? [] : ['assembling the site failed'], cycles: 0 } }
    const atWrite = this.tracker.snapshot()
    write()
    if (restore && this.fault === 'skip-restore-wait') return { ok: true, ms: 0, digest: this.digest(), errors: [], cycles: 0, skipped: true }
    let s = await this.#waitSettled(atWrite, label)
    // A compile that FAILED is the one result that earns a mutation a free pass ("defended by the compiler"), so it is held to a stricter standard: the output must
    // stay quiet for two more settle windows, in case a failed compile of a half-written file is about to be followed by a good one.
    while (!s.ok) {
      const seen = this.tracker.history.length
      await sleep(this.settleMs * 2)
      if (this.tracker.history.length === seen && !this.tracker.open) break
      s = await this.#waitSettled(atWrite, label)
    }
    if (s.ok && !this.assemble()) return { ok: false, ms: Date.now() - t, digest: this.digest(), errors: ['assembling the site failed'], cycles: s.cycles }
    return { ok: s.ok, ms: Date.now() - t, digest: this.digest(), errors: s.errors, cycles: s.cycles }
  }

  assertClean(label) { assertCleanOf(this, label) }

  stop() {
    if (this.child) { try { this.child.kill('SIGTERM') } catch (e) { void e } }
  }
}

// --- a compiler that crashed is not a compiler that refused ------------------------------------------------------------------

/**
 * Fable's embedded F# compiler sometimes dies on a CI runner with
 *   error FSHARP: internal error: Object reference not set to an instance of an object. (code 193)
 * reported at every file of the project at once, for source that compiles. Measured 2026-11-03 on the equivalence runs: four times in about 560
 * `--build full` builds, none in about 560 `--build watch` compiles, never on the same source twice. The first harness counted ANY failed build as
 * "defended by the COMPILER", which is a catch that costs nothing, so a crash was a free pass for whichever mutation it landed on. A refusal is a
 * diagnostic about the code; a crash is a fault of the build. They are told apart by the words the compiler uses for the second.
 */
const diagnosticLines = errors => (errors ?? []).flatMap(e => stripAnsi(e).split(/\n| \| /))
/** A DIAGNOSTIC ABOUT THE CODE: an `error FSHARP|FABLE|FS####` line that is not the compiler reporting its own failure. Only this makes a failed build a refusal. */
export const isCompilerRefusal = errors => diagnosticLines(errors).some(l => /\berror (FSHARP|FABLE)\b|: error FS\d+/.test(l) && !/internal error/i.test(l))
/** The compiler reporting its own failure, with no diagnostic about the code beside it. Only this is repeated. */
export const isCompilerCrash = errors => !isCompilerRefusal(errors) && diagnosticLines(errors).some(l => /internal error/i.test(l))

export const MAX_CRASH_RETRIES = 2

/**
 * `dotnet fable watch` re-checks the file that changed and not the files downstream of it, so a mutation that breaks only a LATER file builds under watch and
 * is refused by the full compile (measured in review: a type change in Units.fs, 3 downstream errors, watch said ok). Types are erased at runtime, so such a
 * mutation survives its expectation under watch and would fail the row. Before a watch survivor stands, the same source is compiled in full into a throwaway
 * directory (the watcher's build/ is not touched; the watcher is idle between cycles). A refusal there is the verdict `compiler`; a build that fails with no
 * diagnostic is a fault; a build that works leaves the survivor a survivor. Survivors are 0 on a green gate, so this costs nothing there.
 */
export const confirmFullCompile = (outDir, command = `dotnet fable src/Laboratory.fsproj --outDir ${outDir}`) => {
  let r = attempt(command)
  for (let n = 0; !r.ok && isCompilerCrash([r.why]) && n < MAX_CRASH_RETRIES; n++) r = attempt(command)
  const refused = !r.ok && isCompilerRefusal([r.why])
  return { ok: r.ok, refused, fault: !r.ok && !refused, why: r.why }
}

/**
 * MUTATION_FAULT=crash-once | crash-always: make a (non-restore) compile report the crash line the runner printed, without building, so that the retry and
 * the `build-fault` verdict can be shown on demand and not only waited for. `crash-once` crashes the first such compile of a driver; `crash-always` every one.
 */
const RUNNER_CRASH_LINE = './src/Suite.fs(17,32): (17,101) error FSHARP: internal error: Object reference not set to an instance of an object. (code 193)'
const injectedCrash = (b, restore) => {
  if (restore || !['crash-once', 'crash-always'].includes(b.fault)) return null
  if (b.fault === 'crash-once' && b.injected) return null
  b.injected = true
  return { ok: false, ms: 0, digest: b.digest(), errors: [RUNNER_CRASH_LINE], cycles: 0 }
}

/**
 * `builder.compile(write, opts)`, repeated while the build CRASHED (never while it refused), at most MAX_CRASH_RETRIES times. The count comes back so the
 * flake is measured, not hidden. A mutation that crashes the compiler every time comes back `crashed: true`: it was neither refused nor built.
 */
export const compileSteadily = async (builder, write, opts, onRetry = () => {}) => {
  let r = await builder.compile(write, opts)
  let retries = 0
  while (!r.ok && isCompilerCrash(r.errors) && retries < MAX_CRASH_RETRIES) {
    retries++
    onRetry(retries, r.errors)
    r = await builder.compile(write, opts)
  }
  // `crashed` is every failed build that carries no diagnostic about the code: the compiler crashing, but also the site failing to assemble, a killed process,
  // a full disk. Counting those as "refused by the compiler" was a catch that costs nothing (review finding, 2026-11-03).
  return { ...r, retries, crashed: !r.ok && !isCompilerRefusal(r.errors) }
}

/** Elapsed milliseconds since this call, as a function. Here and not in mutation-check.mjs: that file is scanned by row-confidence.mjs for clock reads, and a
 *  duration that lands in a record is not an input to any verdict. */
export const stopwatch = () => { const t = Date.now(); return () => Date.now() - t }

/** A readable name for what the two builders did, for the records. */
export const verdictOf = ({ anchorFound, applied = true, built, survived, crashed = false }) => {
  if (!anchorFound) return 'anchor-missing'
  if (!applied) return 'not-applied'
  if (crashed) return 'build-fault'
  if (!built) return 'compiler'
  return survived ? 'survived' : 'caught'
}

// --- self-test ---------------------------------------------------------------------

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()
  const here = dirname(fileURLToPath(import.meta.url))
  const E = String.fromCharCode(27)
  const paint = s => `${E}[39m${E}[22m${E}[37m${s}`

  // The real lines, recorded from Fable 5.13.0 on 2026-11-03 (CC-CMD Task 0).
  const INITIAL = ['Parsing src/Laboratory.fsproj...', 'Project and references (58 source files) parsed in 3020ms', '', 'Started Fable compilation...', '', 'Fable compilation finished in 24109ms', '', 'Watching src'].map(paint).join('\n') + '\n'
  const GOOD = ['Started Fable compilation...', 'Fable compilation finished in 2838ms', 'Watching src'].map(paint).join('\n') + '\n'
  const BAD = ['Started Fable compilation...', 'Fable compilation finished in 2717ms', "./src/Scoreboard.fs(438,40): (438,41) error FSHARP: The type 'int' does not match the type 'bool' (code 1)", 'Watching src'].map(paint).join('\n') + '\n'

  const t0 = new CycleTracker()
  t0.feed(INITIAL)
  check('the initial compile of the real output is one good cycle of 24109 ms', t0.history.length === 1 && t0.history[0].ok && t0.history[0].ms === 24109, JSON.stringify(t0.history))
  const t1 = new CycleTracker(); t1.feed(INITIAL); t1.feed(GOOD)
  check('a good incremental cycle is a second good cycle', t1.history.length === 2 && t1.history[1].ok && t1.history[1].ms === 2838)
  const t2 = new CycleTracker(); t2.feed(INITIAL); t2.feed(BAD)
  check('MUTATION: an error line AFTER "finished" still fails the cycle, and the error is kept', t2.history.length === 2 && t2.history[1].ok === false && /does not match the type/.test(t2.history[1].errors[0]))
  const t3 = new CycleTracker(); t3.feed(paint('Started Fable compilation...') + '\n' + paint('Fable compilation finished in 10ms') + '\n')
  check('MUTATION: "finished" without "Watching" is not the end of a cycle', t3.history.length === 0 && t3.open === true)
  const t4 = new CycleTracker(); t4.feed('Started Fable compil'); t4.feed('ation...\nWatching src\n')
  check('a line split across two chunks is one line', t4.history.length === 1)
  const t6 = new CycleTracker(); t6.feed('Fable compilation finished in 5ms\nWatching src\n')
  check('a "finished" line with no "Started" before it still opens its cycle, and "Watching" closes it', t6.history.length === 1 && t6.history[0].ok && t6.history[0].ms === 5, JSON.stringify(t6.history))
  const t5 = new CycleTracker(); t5.feed('./src/X.fs(1,1): error FSHARP: boom\n')
  check('an error outside any cycle is kept apart, not charged to the next one', t5.orphanErrors.length === 1 && t5.history.length === 0)

  // The real line, as the runner printed it (probe run 41594837471's sibling, 2026-11-03).
  const CRASH = [`${E}[31m./src/Suite.fs(17,32): (17,101) error FSHARP: internal error: Object reference not set to an instance of an object. (code 193)`]
  const REFUSAL = ["./src/Pick.fs(12,5): (12,9) error FSHARP: This expression was expected to have type 'int' but here has type 'string' (code 1)"]
  check('MUTATION: a compiler crash (the real line) is told from a refusal', isCompilerCrash(CRASH) === true && isCompilerCrash(REFUSAL) === false)
  check('an empty or missing error list is not a crash', isCompilerCrash([]) === false && isCompilerCrash(undefined) === false)
  {
    const scripted = results => { let i = 0; const calls = []; return { calls, compile: async () => { calls.push(1); return results[Math.min(i++, results.length - 1)] } } }
    const crash = { ok: false, errors: CRASH }, good = { ok: true, errors: [] }, refuse = { ok: false, errors: REFUSAL }
    const a1 = scripted([crash, good]); const r1 = await compileSteadily(a1, () => {})
    check('MUTATION: a crash is repeated, and the good build that follows is the answer, with the retry counted', r1.ok === true && r1.retries === 1 && r1.crashed === false && a1.calls.length === 2, JSON.stringify(r1))
    const a2 = scripted([crash]); const r2 = await compileSteadily(a2, () => {})
    check('MUTATION: a compiler that crashes every time is reported crashed after the retries, not as a refusal', r2.crashed === true && r2.ok === false && r2.retries === MAX_CRASH_RETRIES && a2.calls.length === MAX_CRASH_RETRIES + 1, JSON.stringify(r2))
    const a3 = scripted([refuse]); const r3 = await compileSteadily(a3, () => {})
    check('MUTATION: a real refusal is never repeated and is not a crash', r3.ok === false && r3.crashed === false && r3.retries === 0 && a3.calls.length === 1, JSON.stringify(r3))
    const a4 = scripted([good]); const r4 = await compileSteadily(a4, () => {})
    check('a build that works is built once', r4.ok === true && r4.retries === 0 && a4.calls.length === 1)
    const seen = []; const a5 = scripted([crash, crash, good]); await compileSteadily(a5, () => {}, {}, (n, errs) => seen.push([n, errs === CRASH]))
    check('each retry is announced with its number and the errors that caused it', JSON.stringify(seen) === JSON.stringify([[1, true], [2, true]]), JSON.stringify(seen))
  }
  check('MUTATION: verdictOf: a compiler crash is "build-fault", never a refusal or a catch', verdictOf({ anchorFound: true, built: false, crashed: true }) === 'build-fault' && verdictOf({ anchorFound: true, built: true, survived: false, crashed: true }) === 'build-fault')
  {
    const ASSEMBLE = ['assembling the site failed']
    const KILLED = ['the build failed, exit none (signal SIGKILL): dotnet: killed']
    const MIXED = ["the build failed, exit 1: ./src/Pick.fs(12,5): (12,9) error FSHARP: Type mismatch. (code 1) | ./src/Suite.fs(1,1): error FSHARP: internal error: Object reference not set (code 193)"]
    check('MUTATION: a failed build with no diagnostic about the code (the site failed to assemble) is not a refusal', isCompilerRefusal(ASSEMBLE) === false && isCompilerCrash(ASSEMBLE) === false)
    check('MUTATION: a build killed by a signal is not a refusal', isCompilerRefusal(KILLED) === false)
    check('MUTATION: one real diagnostic among internal errors makes it a refusal, not a crash to repeat', isCompilerRefusal(MIXED) === true && isCompilerCrash(MIXED) === false)
    check('the full driver\'s joined tail is read line by line', isCompilerRefusal(["the build failed, exit 1: a | ./src/X.fs(1,1): (1,2) error FSHARP: boom (code 1) | b"]) === true)
    const scripted = results => { let i = 0; const calls = []; return { calls, compile: async () => { calls.push(1); return results[Math.min(i++, results.length - 1)] } } }
    const asm = scripted([{ ok: false, errors: ASSEMBLE }]); const ra = await compileSteadily(asm, () => {})
    check('MUTATION: a failed build with no diagnostic is reported as a fault (crashed) and is not repeated', ra.ok === false && ra.crashed === true && ra.retries === 0 && asm.calls.length === 1, JSON.stringify(ra))
    const tr = new CycleTracker(); tr.feed('Started Fable compilation...\nFable compilation finished in 9ms\n./src/Suite.fs(1,1): error EXCEPTION: error recovery\nWatching src\n')
    check('MUTATION: a cycle whose only error line is an EXCEPTION still fails the cycle', tr.history.length === 1 && tr.history[0].ok === false, JSON.stringify(tr.history))
    const cfDir = mkdtempSync(join(tmpdir(), 'confirm-'))
    try {
      const refusedCmd = `node -e "console.log('./src/Market.fs(77,41): (77,50) error FSHARP: Type mismatch (code 1)'); process.exit(1)"`
      const faultCmd = `node -e "console.log('assembling'); process.exit(1)"`
      const crashOnce = `node -e "const fs=require('fs'),p=process.argv[1]; if(!fs.existsSync(p)){fs.writeFileSync(p,'x'); console.log('./src/A.fs(1,1): (1,2) error FSHARP: internal error: Object reference not set to an instance of an object. (code 193)'); process.exit(1)}" ${join(cfDir, 'once')}`
      const c1 = confirmFullCompile(cfDir, refusedCmd), c2 = confirmFullCompile(cfDir, faultCmd), c3 = confirmFullCompile(cfDir, 'node -e ""'), c4 = confirmFullCompile(cfDir, crashOnce)
      check('MUTATION: a full compile that prints a real diagnostic confirms a refusal', c1.refused === true && c1.ok === false && c1.fault === false, JSON.stringify(c1))
      const buried = `node -e "console.log('./src/Market.fs(77,41): (77,50) error FSHARP: Type mismatch (code 1)'); for (let i = 0; i < 40; i++) console.log('   at Some.Stack.Frame' + i); process.exit(1)"`
      const c5 = confirmFullCompile(cfDir, buried)
      check('MUTATION: a diagnostic buried above a long stack trace is still found (the last lines alone would have missed it)', c5.refused === true && /error FSHARP: Type mismatch/.test(c5.why), c5.why.slice(0, 200))
      check('MUTATION: a full compile that fails with no diagnostic is a fault, not a refusal', c2.refused === false && c2.fault === true, JSON.stringify(c2))
      check('a full compile that works confirms nothing against the survivor', c3.ok === true && c3.refused === false && c3.fault === false)
      check('MUTATION: a crashed full compile is repeated and the build after it decides', c4.ok === true, JSON.stringify(c4))
    } finally { rmSync(cfDir, { recursive: true, force: true }) }
  }
  check('verdictOf: a missing anchor, a mutation that did not apply, a refused compile, a survivor and a catch are five different words',
    new Set([verdictOf({ anchorFound: false }), verdictOf({ anchorFound: true, applied: false }), verdictOf({ anchorFound: true, built: false }),
      verdictOf({ anchorFound: true, built: true, survived: true }), verdictOf({ anchorFound: true, built: true, survived: false })]).size === 5)
  check('MUTATION: verdictOf: a refused compile is "compiler", not a catch', verdictOf({ anchorFound: true, built: false, survived: false }) === 'compiler')
  check('MUTATION: verdictOf: a mutation the check still passed on is "survived"', verdictOf({ anchorFound: true, built: true, survived: true }) === 'survived')

  const snap = { history: [{ ok: true, errors: [] }, { ok: true, errors: [] }], open: false, lastActivity: 1000 }
  check('settled: a cycle since the write, none open, quiet long enough', settled(snap, { ended: 1, open: false }, 1400, 300).done === true)
  check('MUTATION: settled: no cycle since the write is not done', settled(snap, { ended: 2, open: false }, 9999, 300).done === false)
  check('MUTATION: settled: a cycle still open is not done', settled({ ...snap, open: true }, { ended: 1, open: false }, 9999, 300).done === false)
  check('MUTATION: settled: output not yet quiet is not done', settled(snap, { ended: 1, open: false }, 1100, 300).done === false)
  check('settled: the LAST cycle decides (a bad first compile, then a good one)',
    settled({ history: [{ ok: false, errors: ['x'] }, { ok: true, errors: [] }], open: false, lastActivity: 0 }, { ended: 0, open: false }, 999, 300).ok === true)

  check('shardOf gives every id to exactly one shard', (() => {
    const ids = Array.from({ length: 23 }, (_, k) => `m${k}`)
    const all = [1, 2, 3, 4, 5].flatMap(i => shardOf(ids, i, 5))
    return all.length === ids.length && new Set(all).size === ids.length && ids.every(x => all.includes(x))
  })())
  check('MUTATION: shard 0 or shard N+1 is refused', (() => { try { shardOf(['a'], 0, 2); return false } catch { try { shardOf(['a'], 3, 2); return false } catch { return true } } })())
  check('MUTATION: a malformed --shard is refused', (() => { try { parseShard('3-8'); return false } catch { return true } })())
  check('parseShard reads 3/8', JSON.stringify(parseShard('3/8')) === JSON.stringify({ i: 3, n: 8 }))

  const work = mkdtempSync(join(tmpdir(), 'mutlib-'))
  try {
    const out = join(work, 'out'); mkdirSync(out, { recursive: true })
    writeFileSync(join(out, 'a.js'), 'x'); mkdirSync(join(out, 'fable_modules')); writeFileSync(join(out, 'fable_modules', 'project_cracked.json'), '{"p":1}')
    const d1 = digestDir(out)
    writeFileSync(join(out, 'fable_modules', 'project_cracked.json'), '{"p":2}')
    check('the digest ignores project_cracked.json (it carries paths)', digestDir(out) === d1)
    check('the manifest ignores project_cracked.json too, so a diff never blames the one file that differs by design', ![...manifestDir(out).keys()].some(k => k.endsWith('project_cracked.json')) && manifestDir(out).has('/a.js'))
    writeFileSync(join(out, 'a.js'), 'y')
    check('MUTATION: the digest sees a changed output file', digestDir(out) !== d1)
    check('MUTATION: the digest sees an extra file', digestDir(out, [join(work, 'out', 'a.js')]) !== digestDir(out))
    // The same bytes under another name are another build: a digest of contents alone would call a moved file unchanged.
    const moved = join(work, 'moved'); mkdirSync(moved, { recursive: true }); writeFileSync(join(moved, 'b.js'), 'y')
    const base = join(work, 'base'); mkdirSync(base, { recursive: true }); writeFileSync(join(base, 'a.js'), 'y')
    check('MUTATION: the digest sees the same bytes under another path', digestDir(moved) !== digestDir(base))
    check('the digest of equal trees is equal', (() => { const twin = join(work, 'twin'); mkdirSync(twin, { recursive: true }); writeFileSync(join(twin, 'a.js'), 'y'); return digestDir(twin) === digestDir(base) })())
    {
      const clean = manifestDir(base)
      writeFileSync(join(base, 'a.js'), 'changed'); writeFileSync(join(base, 'new.js'), 'n')
      const d = diffManifests(clean, manifestDir(base))
      check('MUTATION: a manifest diff names a changed file with ~ and a new one with +', d.includes('~ /a.js') && d.includes('+ /new.js') && d.length === 2, JSON.stringify(d))
      rmSync(join(base, 'a.js')); rmSync(join(base, 'new.js'))
      check('MUTATION: a manifest diff names a removed file with -', JSON.stringify(diffManifests(clean, manifestDir(base))) === JSON.stringify(['- /a.js']))
      const many = new Map(Array.from({ length: 14 }, (_, i) => [`f${i}`, 'x']))
      check('a long diff is capped and the rest counted', diffManifests(new Map(), many, 10).at(-1) === '... and 4 more' && diffManifests(new Map(), many, 10).length === 11)
    }

    // The reference builder: a build that fails keeps its reason, and a build that is not clean names the files that make it so.
    {
      const fdir = join(work, 'fb'); mkdirSync(fdir, { recursive: true }); writeFileSync(join(fdir, 'a.js'), 'one')
      const okb = new FullBuild({ command: 'node -e ""', outDir: fdir, extraFiles: [] })
      await okb.start()
      okb.assertClean('the first mutation')
      writeFileSync(join(fdir, 'a.js'), 'two'); writeFileSync(join(fdir, 'extra.js'), 'x')
      let msg = ''
      try { okb.assertClean('the next mutation') } catch (e) { msg = e.message }
      check('MUTATION: a build that is not clean names the files that differ', /differing: .*~ \/a\.js.*\+ \/extra\.js/.test(msg), msg)
      {
        const c1 = new FullBuild({ command: 'node -e ""', outDir: fdir, extraFiles: [], fault: 'crash-once' }); await c1.start()
        const o = await compileSteadily(c1, () => {})
        check('MUTATION: the crash-once fault is repeated through and the build after it is the answer', o.ok === true && o.retries === 1 && o.crashed === false, JSON.stringify(o))
        const c2 = new FullBuild({ command: 'node -e ""', outDir: fdir, extraFiles: [], fault: 'crash-always' }); await c2.start()
        const o2 = await compileSteadily(c2, () => {})
        check('MUTATION: the crash-always fault ends crashed, with every retry spent', o2.ok === false && o2.crashed === true && o2.retries === MAX_CRASH_RETRIES, JSON.stringify(o2))
        const o3 = await compileSteadily(c2, () => {}, { restore: true })
        check('the fault never touches a restore compile, so a tree can always be put back', o3.ok === true && o3.retries === 0)
      }
      const badb = new FullBuild({ command: `node -e "console.error('boom from the build'); process.exit(3)"`, outDir: fdir, extraFiles: [] })
      let startMsg = ''
      try { await badb.start() } catch (e) { startMsg = e.message }
      check('MUTATION: an initial build that fails says how, with the last of its output', /exit 3/.test(startMsg) && /boom from the build/.test(startMsg), startMsg)
      badb.cleanDigest = badb.digest(); badb.cleanManifest = manifestDir(fdir, [])
      const bc = await badb.compile(() => {})
      check('MUTATION: a compile that fails reports ok false with the reason in errors', bc.ok === false && /exit 3/.test(bc.errors.join()) && /boom from the build/.test(bc.errors.join()), JSON.stringify(bc))
    }

    // The driver against a fake watcher that speaks Fable's protocol and writes an output that depends on its source.
    const fake = join(here, 'fixtures', 'fake-fable-watch.mjs')
    const src = join(work, 'src.txt'); writeFileSync(src, 'clean\n')
    const build = (extra = {}, env = {}) => new WatchBuild({
      command: process.execPath, args: [fake, src, join(work, 'b')], cwd: work, env: { ...process.env, ...env }, outDir: join(work, 'b'), extraFiles: [],
      assemble: () => true, settleMs: 120, startTimeoutMs: 1500, cycleTimeoutMs: 8000, initialTimeoutMs: 8000, ...extra,
    })
    const w = build()
    const started = await w.start()
    check(`the driver waits for the first compile and records the clean digest (${started.digest})`, typeof w.cleanDigest === 'string' && w.cleanDigest.length === 16)
    w.assertClean('the first mutation')
    check('a clean build passes the pre-check', true)
    const m = await w.compile(() => writeFileSync(src, 'mutated\n'), { label: 'mutation one' })
    check('a mutation compiles, and the output differs from clean', m.ok === true && m.digest !== w.cleanDigest, JSON.stringify(m))
    let dirtyRefused = false
    try { w.assertClean('the next mutation') } catch { dirtyRefused = true }
    check('MUTATION: the pre-check REFUSES a build that is not clean (the previous mutation was not restored)', dirtyRefused)
    const r = await w.compile(() => writeFileSync(src, 'clean\n'), { restore: true, label: 'restore one' })
    check('the restore compile returns to the clean digest, byte for byte', r.ok === true && r.digest === w.cleanDigest, JSON.stringify(r))
    w.assertClean('the next mutation')
    const bad = await w.compile(() => writeFileSync(src, 'TYPE_ERROR\n'), { label: 'refused' })
    check('MUTATION: a compile the compiler refuses is reported as failed, errors kept', bad.ok === false && bad.errors.length > 0, JSON.stringify(bad))
    const back = await w.compile(() => writeFileSync(src, 'clean\n'), { restore: true, label: 'restore after error' })
    check('the build recovers to clean after a failed compile', back.ok === true && back.digest === w.cleanDigest)
    w.stop()
    await sleep(300)

    // Fault: the restore is written and NOT waited for. The next pre-check has to see it.
    writeFileSync(src, 'clean\n'); await sleep(300)
    const f = build({ fault: 'skip-restore-wait' })
    await f.start()
    await f.compile(() => writeFileSync(src, 'mutated\n'), { label: 'mutation' })
    const skipped = await f.compile(() => writeFileSync(src, 'clean\n'), { restore: true, label: 'restore (fault)' })
    let caught = false
    try { f.assertClean('the next mutation') } catch (e) { caught = /not clean/.test(e.message) }
    check('MUTATION: with skip-restore-wait the next pre-check REFUSES the stale build (exit 1 in the harness)', skipped.skipped === true && caught)
    f.stop()
    await sleep(600)

    // A late error line (it follows "finished" by a few ms) and a double cycle.
    writeFileSync(src, 'clean\n'); await sleep(300)
    const late = build({}, { FAKE_LATE_ERROR: '1' })
    await late.start()
    const lateBad = await late.compile(() => writeFileSync(src, 'TYPE_ERROR\n'), { label: 'late error' })
    check('MUTATION: an error line that arrives after "finished" is still seen', lateBad.ok === false && lateBad.errors.length > 0)
    late.stop()
    await sleep(300)
    writeFileSync(src, 'clean\n'); await sleep(300)
    const dbl = build({ settleMs: 400 }, { FAKE_DOUBLE: '1' })
    await dbl.start()
    const dm = await dbl.compile(() => writeFileSync(src, 'mutated\n'), { label: 'double cycle' })
    check('a double cycle is waited out when the settle window is longer than the gap, and the digest is of the final output', dm.ok === true && dm.cycles === 2 && dm.digest !== dbl.cleanDigest, JSON.stringify(dm))
    dbl.stop()
    await sleep(300)
    writeFileSync(src, 'clean\n'); await sleep(300)
    const dbl2 = build({ settleMs: 120 }, { FAKE_DOUBLE: '1' })
    await dbl2.start()
    const dm2 = await dbl2.compile(() => writeFileSync(src, 'mutated\n'), { label: 'double cycle, short window' })
    check('MUTATION (the limit, stated): a settle window SHORTER than the gap between cycles returns after the first (production: 300 ms against Fable\'s own 200 ms debounce)', dm2.cycles === 1, JSON.stringify(dm2))
    dbl2.stop()
    await sleep(500)

    // A compile that fails and is followed 150 ms later by one that works (a half-written file, then the whole one): the extra quiet windows a FAILED compile is held to
    // see the second cycle, and the verdict is the last cycle's. Without them the first failure would be reported, and a mutation that does compile would be
    // credited as "defended by the compiler".
    writeFileSync(src, 'clean\n'); await sleep(300)
    const ftg = build({ settleMs: 120 }, { FAKE_FAIL_THEN_GOOD: '1' })
    await ftg.start()
    const fg = await ftg.compile(() => writeFileSync(src, 'TYPE_ERROR\n'), { label: 'fail then good' })
    check('MUTATION: a failed compile that a good one follows is reported as the good one', fg.ok === true && fg.cycles === 2, JSON.stringify(fg))
    ftg.stop()
    await sleep(300)

    // A tree that does not compile at all when the watcher starts: refused, not started on.
    writeFileSync(src, 'TYPE_ERROR\n'); await sleep(300)
    const badStart = build()
    let startRefused = false
    try { await badStart.start() } catch (e) { startRefused = /the initial compile failed/.test(e.message) }
    check('MUTATION: a source that does not compile at start refuses to start the driver', startRefused)
    badStart.stop()
    await sleep(300)

    // A watcher that is already dead, and one that dies mid-cycle: named at once, by how it died, not by a timeout.
    writeFileSync(src, 'clean\n'); await sleep(300)
    const dead = build({ startTimeoutMs: 15000, cycleTimeoutMs: 30000 })
    await dead.start()
    dead.child.kill('SIGKILL')
    for (let i = 0; i < 100 && dead.child; i++) await sleep(20)
    const tDead = Date.now()
    let deadMsg = ''
    try { await dead.compile(() => writeFileSync(src, 'mutated\n'), { label: 'after death' }) } catch (e) { deadMsg = e.message }
    check('MUTATION: a watcher killed between cycles is named dead with its signal, within a second and not at the timeout', /the watcher exited \(code none, signal SIGKILL\)/.test(deadMsg) && Date.now() - tDead < 3000, `${deadMsg} (${Date.now() - tDead} ms)`)
    await sleep(300)
    writeFileSync(src, 'clean\n'); await sleep(300)
    const mid = build({ startTimeoutMs: 15000, cycleTimeoutMs: 30000 }, { FAKE_DIE_MID: '1' })
    await mid.start()
    const tMid = Date.now()
    let midMsg = ''
    try { await mid.compile(() => writeFileSync(src, 'mutated\n'), { label: 'dies mid-cycle' }) } catch (e) { midMsg = e.message }
    check('MUTATION: a watcher that dies mid-cycle is named with its exit code and what it last printed, not after the cycle timeout', /the watcher exited \(code 3\)/.test(midMsg) && /about to die/.test(midMsg) && Date.now() - tMid < 5000, `${midMsg} (${Date.now() - tMid} ms)`)
    mid.stop()
    await sleep(300)

    // A watcher that ignores the write: never assumed fresh.
    writeFileSync(src, 'clean\n'); await sleep(300)
    const none = build({ startTimeoutMs: 600 }, { FAKE_NO_CYCLE: '1' })
    await none.start()
    let noCycle = false
    try { await none.compile(() => writeFileSync(src, 'mutated\n'), { label: 'ignored write' }) } catch (e) { noCycle = /began no compile/.test(e.message) }
    check('MUTATION: a write that causes no compile is an error, not an assumed-fresh build', noCycle)
    none.stop()
    await sleep(300)

    // The cross-check against the build that was there before.
    writeFileSync(src, 'clean\n'); await sleep(300)
    const drift = build()
    let drifted = false
    try { await drift.start({ expectDigest: 'not-the-digest' }) } catch (e) { drifted = /is not the build that was there/.test(e.message) }
    check('MUTATION: an initial compile that differs from the existing build refuses to start', drifted)
    drift.stop()
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
  finish(summarize())
}
