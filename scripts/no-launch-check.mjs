#!/usr/bin/env node
// Every browser-free step's `--self-test`, and every declared read-only mode of a script that spawns browser scripts, launches no browser: MEASURED, not assumed.
// (docs/CC-CMD-2026-11-11-runner-apt-mirror-dns.md, items 2 and 3.)
//
// WHY. scripts/check-browser-gate.py decides which steps of a job need a browser by READING the scripts they run, and two of its rules are claims it cannot check by reading:
// `--self-test` never launches (every script that has one handles it before it reaches its launch), and a script that spawns browser scripts launches none of them when run
// with the arguments READONLY_MODES declares (`scripts/mutation-check.mjs --anchors`). A one-token edit could falsify either, and the result would be a red browser-free step
// in an outage, never a green one. This check closes that: it runs those commands with `playwright` and `playwright-core` replaced, for the process and for every Node child
// it starts (NODE_OPTIONS carries the replacement), by a stub whose launch, launchPersistentContext, connect and connectOverCDP each APPEND a line to a log and then throw.
// No browser is on disk for them either (PLAYWRIGHT_BROWSERS_PATH and PW_CHROMIUM point at nothing). A line in the log after a command is a launch it attempted.
//
// WHERE THE COMMANDS COME FROM: `python3 scripts/check-browser-gate.py --plain-commands`, which reads every browser-free step after an install in the target jobs and in every
// exempt site and prints the self-tests and the read-only modes among them. A command the guard classifies tomorrow is measured tomorrow, with no list to keep here.
//
// CONTROLS FIRST (Rule 90): three scripts written to a temporary directory that DO launch, one directly (ESM), one through `require` (CJS) and one through a child process, must
// each leave a line in the log, or the instrument cannot see a launch and the verdict is NOT ESTABLISHED. The self-test adds the artifact the CC-CMD names: a copy of
// scripts/axis-check.mjs whose `--self-test` is edited to launch is caught, and the real one is not.
//
// COVERAGE (Rule 91), printed in the verdict: `checked N of N commands`. NOT covered: a python script that launches (the guard reads those by text), a launch through a
// browser binary run directly (no playwright), and a command that fails before it reaches a launch (reported as not established, and fails the check).
//
//   node scripts/no-launch-check.mjs              (from the repository root; needs Node 22.15 or later, `npm ci`, the build, and python3 with PyYAML)
//   node scripts/no-launch-check.mjs --self-test
import { spawn, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { availableParallelism, tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { registerHooks } from 'node:module'
import { createChecks, finish, isMain } from './checks.mjs'

const ROOT = new URL('..', import.meta.url).pathname
const MIN_COMMANDS = 20     // coverage is not vacuous: the guard prints 60-odd today, and an emitter that breaks must not read as "0 of 0 launched nothing"

const TRAP_BODY = `const trap = what => async () => { require('node:fs').appendFileSync(process.env.LAUNCH_LOG, what + '\\n'); throw new Error('launch trapped: ' + what) }
const type = n => ({ launch: trap(n + '.launch'), launchPersistentContext: trap(n + '.launchPersistentContext'), connect: trap(n + '.connect'), connectOverCDP: trap(n + '.connectOverCDP'), executablePath: () => '/nonexistent' })`
// ESM and CJS stubs: the same four traps. Written to the trap directory, one pair, and resolved to by ONE synchronous in-thread hook (module.registerHooks, Node 22.15 and later)
// that covers `import` and `require` alike. The first version registered an ESM loader (module.register), which starts a worker thread: its start-up cost shifted a timing-sensitive
// self-test (scripts/mutation-check.mjs --self-test, check E24) that a real run does not shift, so a measuring tool changed the thing measured.
const STUB_CJS = `${TRAP_BODY}\nmodule.exports = { chromium: type('chromium'), firefox: type('firefox'), webkit: type('webkit'), devices: {} }\n`
const STUB_ESM = `${TRAP_BODY.replace("require('node:fs').appendFileSync", "appendFileSync")}\nimport { appendFileSync } from 'node:fs'\nexport const chromium = type('chromium'), firefox = type('firefox'), webkit = type('webkit'), devices = {}\nexport default { chromium, firefox, webkit, devices }\n`

/** The trap, written to `dir`: the environment that puts it in front of a process and every Node child of it, and the log a launch is written to. */
export function makeTrap(dir) {
  const log = join(dir, 'launch.log')
  writeFileSync(join(dir, 'stub.cjs'), STUB_CJS)
  writeFileSync(join(dir, 'stub.mjs'), STUB_ESM)
  writeFileSync(join(dir, 'hooks.cjs'), `const { registerHooks } = require('node:module')
const ESM = ${JSON.stringify(pathToFileURL(join(dir, 'stub.mjs')).href)}, CJS = ${JSON.stringify(pathToFileURL(join(dir, 'stub.cjs')).href)}
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'playwright' || specifier === 'playwright-core') return context.conditions.includes('import') ? { url: ESM, format: 'module', shortCircuit: true } : { url: CJS, format: 'commonjs', shortCircuit: true }
  return nextResolve(specifier, context)
} })
`)
  const opts = `${process.env.NODE_OPTIONS ?? ''} --require=${join(dir, 'hooks.cjs')}`.trim()
  return { log, env: { NODE_OPTIONS: opts, LAUNCH_LOG: log, PLAYWRIGHT_BROWSERS_PATH: join(dir, 'no-browsers'), PW_CHROMIUM: join(dir, 'no-chrome') } }
}

/** Run one command under the trap: its exit status, and the launches it attempted (the lines the stub wrote). */
export function runTrapped(cmd, trap, cwd = ROOT, timeoutMs = 240000) {
  writeFileSync(trap.log, '')
  const r = spawnSync(cmd[0], cmd.slice(1), { cwd, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, ...trap.env } })
  const launches = readFileSync(trap.log, 'utf8').split('\n').filter(Boolean)
  return { cmd, exit: r.status, signal: r.signal, launches, last: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').pop() ?? '' }
}

/** The same, asynchronously and with a log of its own, so several commands can be measured at once (they share the hook files and nothing else). */
export function runTrappedAsync(cmd, trap, id, cwd = ROOT, timeoutMs = 240000) {
  const log = `${trap.log}.${id}`
  writeFileSync(log, '')
  const started = Date.now()
  return new Promise(resolve => {
    const child = spawn(cmd[0], cmd.slice(1), { cwd, env: { ...process.env, ...trap.env, LAUNCH_LOG: log }, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', d => { out = (out + d).slice(-4000) })
    child.stderr.on('data', d => { out = (out + d).slice(-4000) })
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
    child.on('close', (exit, signal) => {
      clearTimeout(timer)
      resolve({ cmd, exit, signal, launches: readFileSync(log, 'utf8').split('\n').filter(Boolean), last: out.trim().split('\n').pop() ?? '', seconds: (Date.now() - started) / 1000 })
    })
  })
}

/** Run `items` through `worker` with at most `width` in flight, keeping the order of the results. */
export async function pool(items, width, worker) {
  const results = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.max(1, Math.min(width, items.length)) }, async () => {
    while (next < items.length) { const i = next++; results[i] = await worker(items[i], i) }
  }))
  return results
}

/** The verdict from the measurements: ok only when every command exited 0 with no launch, every control saw one, and the list was not vacuous. */
export function verdictOf(results, controls, minCommands = MIN_COMMANDS) {
  const problems = []
  if (results.length < minCommands) problems.push(`only ${results.length} command(s) were measured, fewer than the ${minCommands} this check expects: the list is not trustworthy`)
  const blind = controls.filter(c => c.launches.length === 0)
  if (blind.length) problems.push(`the instrument cannot see a launch: ${blind.map(c => c.name).join(', ')} left no line in the log (NOT ESTABLISHED)`)
  for (const r of results) {
    if (r.launches.length) problems.push(`\`${r.cmd.join(' ')}\` attempted a browser launch (${[...new Set(r.launches)].join(', ')})`)
    else if (r.exit !== 0) problems.push(`\`${r.cmd.join(' ')}\` did not complete (exit ${r.exit}${r.signal ? `, ${r.signal}` : ''}: ${r.last.slice(0, 120)}), so it is not established that it launches nothing`)
  }
  const clean = results.filter(r => r.exit === 0 && r.launches.length === 0).length
  const line = `checked ${results.length} of ${results.length} commands: ${clean} exited 0 with 0 launches; controls: ${controls.length - blind.length} of ${controls.length} saw a launch`
  return { ok: problems.length === 0, problems, line }
}

const LAUNCH_ESM = `import { chromium } from 'playwright'\nconst b = await chromium.launch()\nawait b.close()\n`
const LAUNCH_CJS = `const { chromium } = require('playwright')\nchromium.launch().catch(() => {})\n`

/** Three scripts that launch, in the three ways a launch is reached; each must leave a line, or the trap cannot see. */
export function runControls(dir, trap) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'c-esm.mjs'), LAUNCH_ESM)
  writeFileSync(join(dir, 'c-cjs.cjs'), LAUNCH_CJS)
  writeFileSync(join(dir, 'c-child.mjs'), `import { execFileSync } from 'node:child_process'\nexecFileSync(process.execPath, [${JSON.stringify(join(dir, 'c-esm.mjs'))}], { stdio: 'ignore' })\n`)
  return [['direct (ESM)', 'c-esm.mjs'], ['require (CJS)', 'c-cjs.cjs'], ['through a child process', 'c-child.mjs']]
    .map(([name, f]) => ({ name, ...runTrapped([process.execPath, join(dir, f)], trap, dir, 60000) }))
}

function plainCommands() {
  const r = spawnSync('python3', ['scripts/check-browser-gate.py', '--plain-commands'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  if (r.status !== 0) { console.log(`NOT ESTABLISHED: \`python3 scripts/check-browser-gate.py --plain-commands\` exited ${r.status}\n${(r.stderr ?? '').slice(0, 400)}`); process.exit(2) }
  return JSON.parse(r.stdout)
}

async function main() {
  if (typeof registerHooks !== 'function') { console.log(`NOT ESTABLISHED: this Node (${process.version}) has no module.registerHooks (22.15 or later is needed), and there is no weaker trap to fall back to`); process.exit(2) }
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'no-launch-')))
  process.on('exit', () => rmSync(dir, { recursive: true, force: true }))
  const trap = makeTrap(dir)
  const controls = runControls(join(dir, 'controls'), trap)
  for (const c of controls) console.log(`  control ${c.launches.length ? 'LAUNCHED' : 'NOT SEEN '}  ${c.name}  (${c.launches.length} line(s): ${[...new Set(c.launches)].join(', ') || 'none'})`)
  const cmds = plainCommands()
  // The commands that start many processes of their own and wait on timings (scripts/mutation-check.mjs) run first and alone; the rest run a few at a time.
  const width = Number(process.env.NO_LAUNCH_JOBS ?? Math.min(4, availableParallelism()))
  const heavy = cmds.filter(c => c.cmd[1] === 'scripts/mutation-check.mjs'), light = cmds.filter(c => c.cmd[1] !== 'scripts/mutation-check.mjs')
  const results = []
  const show = (c, r) => console.log(`  ${r.exit === 0 && !r.launches.length ? 'ok      ' : 'PROBLEM '}[${c.why}] ${c.cmd.join(' ')}  (exit ${r.exit}; ${r.launches.length} launch(es); ${r.seconds.toFixed(1)} s)`)
  for (const c of heavy) { const r = await runTrappedAsync(c.cmd, trap, results.length); results.push(r); show(c, r) }
  const rest = await pool(light, width, async (c, i) => { const r = await runTrappedAsync(c.cmd, trap, heavy.length + i); show(c, r); return r })
  results.push(...rest)
  const v = verdictOf(results, controls)
  for (const p of v.problems) console.log(`FAIL: ${p}`)
  console.log(`\n${v.line}`)
  console.log(v.ok ? 'verdict: no browser-free self-test or declared read-only mode launches a browser' : 'verdict: NOT ESTABLISHED OR VIOLATED')
  process.exit(v.ok ? 0 : 1)
}

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'no-launch-st-')))
  try {
    mkdirSync(join(dir, 'trap'), { recursive: true })
    const trap2 = makeTrap(join(dir, 'trap'))
    const work = join(dir, 'work')
    mkdirSync(work)
    const put = (name, src) => { writeFileSync(join(work, name), src); return join(work, name) }
    const run = (file, extra = []) => runTrapped([process.execPath, file, ...extra], trap2, work, 60000)

    // CONTROLS: the instrument sees a launch in each of the ways one is reached
    const controls = runControls(join(dir, 'controls'), trap2)
    check('the trap sees a direct (ESM) launch', controls[0].launches.length >= 1 && /chromium\.launch/.test(controls[0].launches[0]), JSON.stringify(controls[0].launches))
    check('...a require (CJS) launch', controls[1].launches.length >= 1, JSON.stringify(controls[1].launches))
    check('...and a launch made by a CHILD process the command started (NODE_OPTIONS carries the trap)', controls[2].launches.length >= 1, JSON.stringify(controls[2].launches))

    // THE MEASUREMENT
    const clean = run(put('clean.mjs', `console.log('no browser here')\n`))
    check('a script that launches nothing: exit 0 and no line', clean.exit === 0 && clean.launches.length === 0, JSON.stringify(clean))
    const mentions = run(put('mentions.mjs', `// await chromium.launch() is only mentioned here\nconst s = "import { chromium } from 'playwright'"\n`))
    check('a script that only MENTIONS a launch in a comment and a string is not a launch', mentions.exit === 0 && mentions.launches.length === 0, JSON.stringify(mentions))
    const swallowed = run(put('swallowed.mjs', `import { chromium } from 'playwright'\ntry { await chromium.launch() } catch {}\nconsole.log('done')\n`))
    check('A LAUNCH THE SCRIPT CATCHES IS STILL A LAUNCH (the line is written before the stub throws)', swallowed.exit === 0 && swallowed.launches.length === 1, JSON.stringify(swallowed))
    const persistent = run(put('persistent.mjs', `import { chromium } from 'playwright-core'\nawait chromium.launchPersistentContext('/tmp/x').catch(() => {})\n`))
    check('launchPersistentContext on playwright-core is a launch too', persistent.launches.length === 1 && /launchPersistentContext/.test(persistent.launches[0]), JSON.stringify(persistent.launches))
    const viaCdp = run(put('cdp.mjs', `import { chromium } from 'playwright'\nawait chromium.connectOverCDP('http://localhost:1').catch(() => {})\n`))
    check('connectOverCDP is a launch too (attaching to a browser needs one)', viaCdp.launches.length === 1, JSON.stringify(viaCdp.launches))
    const failing = run(put('failing.mjs', `process.exit(3)\n`))
    check('a command that exits non-zero is measured, with its status', failing.exit === 3 && failing.launches.length === 0, JSON.stringify(failing))

    // THE VERDICT
    const okControls = controls.map(c => ({ ...c }))
    const cmd = f => ['node', f]
    const mk = (n, over = {}) => Array.from({ length: n }, (_, i) => ({ cmd: cmd(`s${i}.mjs`), exit: 0, signal: null, launches: [], last: '', ...over }))
    check('a clean run with the controls seen is ok, and prints its denominator', verdictOf(mk(30), okControls).ok && /checked 30 of 30 commands: 30 exited 0 with 0 launches; controls: 3 of 3/.test(verdictOf(mk(30), okControls).line), verdictOf(mk(30), okControls).line)
    const bad = mk(30); bad[7].launches = ['chromium.launch']
    check('MUTATION: one command that attempts a launch makes the verdict not ok, and names it', !verdictOf(bad, okControls).ok && verdictOf(bad, okControls).problems.some(p => /s7\.mjs/.test(p) && /attempted a browser launch/.test(p)), JSON.stringify(verdictOf(bad, okControls).problems))
    const died = mk(30); died[3].exit = 1
    check('MUTATION: a command that did not complete is not established, so the verdict is not ok', !verdictOf(died, okControls).ok && /did not complete/.test(verdictOf(died, okControls).problems[0]))
    const blindControls = okControls.map((c, i) => (i === 2 ? { ...c, launches: [] } : c))
    check('MUTATION: a control that left no line means the instrument cannot see: NOT ESTABLISHED', !verdictOf(mk(30), blindControls).ok && /cannot see a launch/.test(verdictOf(mk(30), blindControls).problems[0]))
    check('MUTATION: a vacuous list (too few commands) is not ok', !verdictOf(mk(3), okControls).ok && /fewer than the 20/.test(verdictOf(mk(3), okControls).problems[0]))

    // THE ARTIFACT THE CC-CMD NAMES: scripts/axis-check.mjs with its `--self-test` edited to launch is caught, and the real one is not
    if (existsSync(join(ROOT, 'build'))) {
      const copy = join(dir, 'copy')
      cpSync(join(ROOT, 'scripts'), join(copy, 'scripts'), { recursive: true })
      symlinkSync(join(ROOT, 'build'), join(copy, 'build'))
      if (existsSync(join(ROOT, 'node_modules'))) symlinkSync(join(ROOT, 'node_modules'), join(copy, 'node_modules'))
      const real = runTrapped([process.execPath, join(copy, 'scripts', 'axis-check.mjs'), '--self-test'], trap2, copy, 120000)
      check('the real scripts/axis-check.mjs --self-test exits 0 with no launch (the unmutated control)', real.exit === 0 && real.launches.length === 0, JSON.stringify({ ...real, last: real.last.slice(0, 160) }))
      const src = readFileSync(join(copy, 'scripts', 'axis-check.mjs'), 'utf8')
      const anchor = "if (isMain(import.meta.url) && process.argv.includes('--self-test')) {\n  const { check, summarize } = createChecks()\n"
      check('the anchor for the mutation occurs exactly once', src.split(anchor).length === 2)
      writeFileSync(join(copy, 'scripts', 'axis-check.mjs'), src.replace(anchor, anchor + "  await (await import('playwright')).chromium.launch().catch(() => {})\n"))
      const mutated = runTrapped([process.execPath, join(copy, 'scripts', 'axis-check.mjs'), '--self-test'], trap2, copy, 120000)
      check('MUTATION: scripts/axis-check.mjs --self-test edited to launch is caught (>= 1 launch logged)', mutated.launches.length >= 1, JSON.stringify({ ...mutated, last: mutated.last.slice(0, 160) }))
      check('...and the verdict over it is not ok', !verdictOf([mutated, ...mk(25)], okControls).ok)
    } else {
      check('the axis-check mutation needs build/ (run `npm run build` first)', false, 'build/ is not here, so the artifact the CC-CMD names was not produced')
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  finish(summarize())
} else if (isMain(import.meta.url)) {
  await main()
}
