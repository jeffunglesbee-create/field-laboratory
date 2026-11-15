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
// COVERAGE (Rule 91), printed in the verdict: `checked N of N commands`, and N is PINNED (EXPECTED_COMMANDS): a guard or emitter edit that lists fewer commands, or more, makes the verdict not
// ok until the pin is changed here, in the same commit (review 2026-11-15, round 4, finding 4: with only a floor of 20, 50 of the 70 could drop out and the run stayed green).
// NOT covered: a python script that launches (the guard reads those by text), a launch through a browser binary run directly (no playwright), a launch through a Playwright API the stub
// does not define (`errors`, `selectors`, `request`: importing one fails at link time, a false red, never a missed launch), a command that fails before it reaches a launch (reported as not
// established, and fails the check), and a child whose whole environment is built without the variable (`env -i`, an env object that never names it): the trap is a text scan plus the runtime
// controls there, not a measurement. The trap reaches a child through NODE_OPTIONS, so a child started with a NODE_OPTIONS that does not build on the inherited one runs outside it:
// scripts/ (every .mjs, .cjs and .js under it, fixtures included; not .py or .sh, which start no Node child with an environment of their own, and not this file) is scanned for that
// (nodeOptionsReplacers, printed as `scanned N scripts`), and the scan is DEFAULT-DENY: a line that names the variable is clean only in the one form the scripts use, the inherited value first
// and flags of our own after it. scripts/proof-check.mjs, whose self-test replaced it for two of its children, now appends (review 2026-11-15, finding 14).
// A launch made through a PATH to the library entry (`require('/abs/node_modules/playwright-core')`) is trapped as well: the hook stubs any resolution that lands inside the library from outside it.
//
//   node scripts/no-launch-check.mjs              (from the repository root; needs Node 22.15 or later, `npm ci`, the build, and python3 with PyYAML)
//   node scripts/no-launch-check.mjs --self-test
import { spawn, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { availableParallelism, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as nodeModule from 'node:module'
import { createChecks, finish, isMain } from './checks.mjs'

const ROOT = new URL('..', import.meta.url).pathname
// scripts/mutation-lib.mjs --self-test waits on a fake compiler's timings and fails under CPU starvation (measured 2026-11-15: 4 of 40 runs, 8 loops at once on a machine already busy; 0 of 3 at width 4): alone, it is not measured under load.
export const HEAVY = new Set(['scripts/mutation-check.mjs', 'scripts/mutation-lib.mjs'])
export const MIN_COMMANDS = 20     // coverage is not vacuous: an emitter that breaks must not read as "0 of 0 launched nothing"
/** How many commands the guard's list holds today (`python3 scripts/check-browser-gate.py --plain-commands`, 2026-11-15). The list is the denominator of the verdict, so it is pinned: a command that drops out
 *  of it is a command no longer measured, and a floor of 20 read that as green. Change this number WITH the step that adds or removes a browser-free self-test or read-only mode. */
export const EXPECTED_COMMANDS = 70

const TRAP_BODY = `const trap = what => async () => { require('node:fs').appendFileSync(process.env.LAUNCH_LOG, what + '\\n'); throw new Error('launch trapped: ' + what) }
const type = n => ({ launch: trap(n + '.launch'), launchServer: trap(n + '.launchServer'), launchPersistentContext: trap(n + '.launchPersistentContext'), connect: trap(n + '.connect'), connectOverCDP: trap(n + '.connectOverCDP'), executablePath: () => '/nonexistent' })
const app = n => ({ launch: trap(n + '.launch'), connect: trap(n + '.connect') })`
// ESM and CJS stubs: the same four traps. Written to the trap directory, one pair, and resolved to by ONE synchronous in-thread hook (module.registerHooks, Node 22.15 and later)
// that covers `import` and `require` alike. The first version registered an ESM loader (module.register), which starts a worker thread: its start-up cost shifted a timing-sensitive
// self-test (scripts/mutation-check.mjs --self-test, check E24) that a real run does not shift, so a measuring tool changed the thing measured.
const STUB_CJS = `${TRAP_BODY}\nmodule.exports = { chromium: type('chromium'), firefox: type('firefox'), webkit: type('webkit'), devices: {}, _electron: app('_electron'), _android: app('_android') }\n`
const STUB_ESM = `${TRAP_BODY.replace("require('node:fs').appendFileSync", "appendFileSync")}\nimport { appendFileSync } from 'node:fs'\nexport const chromium = type('chromium'), firefox = type('firefox'), webkit = type('webkit'), devices = {}, _electron = app('_electron'), _android = app('_android')\nexport default { chromium, firefox, webkit, devices, _electron, _android }\n`

/** The trap, written to `dir`: the environment that puts it in front of a process and every Node child of it, and the log a launch is written to. */
export function makeTrap(dir) {
  const log = join(dir, 'launch.log')
  writeFileSync(join(dir, 'stub.cjs'), STUB_CJS)
  writeFileSync(join(dir, 'stub.mjs'), STUB_ESM)
  writeFileSync(join(dir, 'hooks.cjs'), `const { registerHooks } = require('node:module')
const ESM = ${JSON.stringify(pathToFileURL(join(dir, 'stub.mjs')).href)}, CJS = ${JSON.stringify(pathToFileURL(join(dir, 'stub.cjs')).href)}
const stub = context => (context.conditions.includes('import') ? { url: ESM, format: 'module', shortCircuit: true } : { url: CJS, format: 'commonjs', shortCircuit: true })
const INSIDE = /\\/node_modules\\/playwright(-core)?\\//, CODE = /\\.[cm]?js$/
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'playwright' || specifier === 'playwright-core') return stub(context)
  const resolved = nextResolve(specifier, context)
  // A PATH to the library's own files (\`require('/abs/node_modules/playwright-core')\`, a deep import) from code outside it: the same stub. The library's own requires of itself are left alone.
  if (CODE.test(resolved.url) && INSIDE.test(resolved.url) && !INSIDE.test(context.parentURL ?? '')) return stub(context)
  return resolved
} })
`)
  const opts = `${process.env.NODE_OPTIONS ?? ''} --require=${join(dir, 'hooks.cjs')}`.trim()
  return { log, env: { NODE_OPTIONS: opts, LAUNCH_LOG: log, PLAYWRIGHT_BROWSERS_PATH: join(dir, 'no-browsers'), PW_CHROMIUM: join(dir, 'no-chrome') } }
}

/** Whether this Node can carry the trap. The check used to be `typeof registerHooks !== 'function'` over a STATIC named import of it, which on a Node without it is a link-time SyntaxError before
 *  any line runs: the message it promised could never print (review 2026-11-15, finding 15). The namespace import has no such failure, and `typeof` on it is the test. */
export const trapSupported = (mod = nodeModule) => typeof mod.registerHooks === 'function'

/** Run one command under the trap, with a log of its own so several can be measured at once (they share the hook files and nothing else): its exit status, and the launches it attempted (the lines
 *  the stub wrote). THE ONE RUNNER: the controls, the self-test's fixtures and every command main() measures go through it, so the controls vouch for the path that measured the commands
 *  (a break in it, an environment that no longer carries the log or a log that is no longer read, leaves a control NOT SEEN; review 2026-11-15, finding 11). */
export function runTrapped(cmd, trap, id, cwd = ROOT, timeoutMs = 240000) {
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

/** The scripts that name NODE_OPTIONS on a line that does not build on the inherited value: the trap reaches a child only through NODE_OPTIONS, so a child started with a value of its own, a filtered
 *  copy of the inherited one, or the variable removed, runs outside it. DEFAULT-DENY (review 2026-11-15, round 4, finding 0): the first version looked for the spellings that replace it, and every spelling it
 *  did not list read clean (a same-line read that strips the trap, a filter, `env -u`, `unset`, `Reflect.deleteProperty`, a computed key). Now a line that names the word is clean only when it holds the
 *  one form the scripts use, `${process.env.NODE_OPTIONS ?? ''} --flag`: the inherited value first, flags of our own after it. Anything else is an offender, a message that only mentions the variable
 *  included (say it without the word, or append). Not code, so not read: a comment line, a block-comment body, a trailing `// comment` (cut quote-aware: a ` // ` inside a string does not hide what
 *  follows it, and a quote the cutter cannot pair leaves the line whole, the safe side), and the `find:`, `replace:` and `claim:` lines of the mutation table (the text of a mutation, not a call).
 *  Covers every .mjs, .cjs and .js under `dir`, subdirectories included (scripts/fixtures), `node_modules` excepted. NOT covered, said where the verdict is: .py and .sh scripts, and an environment built
 *  without ever naming the variable (`env -i`, `env: { PATH }`): invisible to a scan of text. This file builds the trap's own value on the line above and is not scanned. */
export function nodeOptionsReplacers(dir, skip = ['no-launch-check.mjs']) {
  const list = (rel = '') => readdirSync(join(dir, rel), { withFileTypes: true }).flatMap(e => {
    const path = rel ? `${rel}/${e.name}` : e.name
    return e.isDirectory() ? (e.name === 'node_modules' ? [] : list(path)) : /\.(mjs|cjs|js)$/.test(e.name) ? [path] : []
  })
  const files = list().filter(f => !skip.includes(f)).sort()
  const offenders = []
  const APPENDS = /\$\{process\.env\.NODE_OPTIONS \?\? ''\} --/
  const withoutComment = line => {
    let quote = null
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (quote) { if (c === '\\') i++; else if (c === quote) quote = null }
      else if (c === '"' || c === "'" || c === '`') quote = c
      else if (c === '/' && line[i + 1] === '/' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i)
    }
    return line
  }
  for (const f of files) {
    let inBlock = false
    readFileSync(join(dir, f), 'utf8').split('\n').forEach((raw, i) => {
      if (inBlock) { if (raw.includes('*/')) inBlock = false; return }
      if (/^\s*\/\*/.test(raw) && !raw.includes('*/')) { inBlock = true; return }
      if (/^\s*(\/\/|\*|\/\*)/.test(raw) || /^\s*(find|replace|claim)\s*:/.test(raw)) return
      const line = withoutComment(raw)
      if (/\bNODE_OPTIONS\b/.test(line) && !APPENDS.test(line)) offenders.push(`scripts/${f}:${i + 1}`)
    })
  }
  return { files: files.length, offenders }
}

/** The verdict from the measurements: ok only when every command exited 0 with no launch, every control saw one, the list was not vacuous and (when a count is pinned) is the pinned size, and (when it was scanned) no script replaces NODE_OPTIONS. */
export function verdictOf(results, controls, minCommands = MIN_COMMANDS, scan = null, expected = null) {
  const problems = []
  if (results.length < minCommands) problems.push(`only ${results.length} command(s) were measured, fewer than the ${minCommands} this check expects: the list is not trustworthy`)
  if (expected !== null && results.length !== expected) problems.push(`the guard listed ${results.length} command(s) and this check pins ${expected} (EXPECTED_COMMANDS): a command that drops out of the list is no longer measured, one that joins it is not yet pinned; change the pin with the step that changed the list`)
  const blind = controls.filter(c => c.launches.length === 0)
  if (blind.length) problems.push(`the instrument cannot see a launch: ${blind.map(c => c.name).join(', ')} left no line in the log (NOT ESTABLISHED)`)
  for (const r of results) {
    if (r.launches.length) problems.push(`\`${r.cmd.join(' ')}\` attempted a browser launch (${[...new Set(r.launches)].join(', ')})`)
    else if (r.exit !== 0) problems.push(`\`${r.cmd.join(' ')}\` did not complete (exit ${r.exit}${r.signal ? `, ${r.signal}` : ''}: ${r.last.slice(0, 120)}), so it is not established that it launches nothing`)
  }
  for (const o of scan?.offenders ?? []) problems.push(`${o} starts a child with a NODE_OPTIONS that replaces the inherited one, so the trap does not reach it (append: \`\${process.env.NODE_OPTIONS ?? ''} --require ...\`)`)
  const clean = results.filter(r => r.exit === 0 && r.launches.length === 0).length
  const line = `checked ${results.length} of ${results.length} commands: ${clean} exited 0 with 0 launches; controls: ${controls.length - blind.length} of ${controls.length} saw a launch`
    + (expected !== null ? `; the guard's list is the pinned ${expected}` : '')
    + (scan ? `; scanned ${scan.files} scripts for a NODE_OPTIONS that replaces the trap's: ${scan.offenders.length} found (.mjs/.cjs/.js under scripts/, this file and .py/.sh excepted)` : '')
  return { ok: problems.length === 0, problems, line }
}

const LAUNCH_ESM = `import { chromium } from 'playwright'\nconst b = await chromium.launch()\nawait b.close()\n`
const LAUNCH_CJS = `const { chromium } = require('playwright')\nchromium.launch().catch(() => {})\n`

/** Three scripts that launch, in the three ways a launch is reached; each must leave a line, or the trap cannot see. Run through the same runner as everything else. */
export async function runControls(dir, trap) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'c-esm.mjs'), LAUNCH_ESM)
  writeFileSync(join(dir, 'c-cjs.cjs'), LAUNCH_CJS)
  writeFileSync(join(dir, 'c-child.mjs'), `import { execFileSync } from 'node:child_process'\nexecFileSync(process.execPath, [${JSON.stringify(join(dir, 'c-esm.mjs'))}], { stdio: 'ignore' })\n`)
  const out = []
  for (const [i, [name, f]] of [['direct (ESM)', 'c-esm.mjs'], ['require (CJS)', 'c-cjs.cjs'], ['through a child process', 'c-child.mjs']].entries()) {
    out.push({ name, ...(await runTrapped([process.execPath, join(dir, f)], trap, `control-${i}`, dir, 60000)) })
  }
  return out
}

function plainCommands() {
  const r = spawnSync('python3', ['scripts/check-browser-gate.py', '--plain-commands'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  if (r.status !== 0) { console.log(`NOT ESTABLISHED: \`python3 scripts/check-browser-gate.py --plain-commands\` exited ${r.status}\n${(r.stderr ?? '').slice(0, 400)}`); process.exit(2) }
  return JSON.parse(r.stdout)
}

/** The whole measurement over `cmds` ([{ cmd, why }]): the controls first, then every command through the same runner, and the verdict. Prints through `say`; returns the exit status main() uses. */
export async function measure({ cmds, trap, dir, width, floor = MIN_COMMANDS, expected = null, cwd = ROOT, scan = null, say = console.log }) {
  const controls = await runControls(join(dir, 'controls'), trap)
  for (const c of controls) say(`  control ${c.launches.length ? 'LAUNCHED' : 'NOT SEEN '}  ${c.name}  (${c.launches.length} line(s): ${[...new Set(c.launches)].join(', ') || 'none'})`)
  // The commands that start many processes of their own and wait on timings run first and alone; the rest run a few at a time.
  const heavy = cmds.filter(c => HEAVY.has(c.cmd[1])), light = cmds.filter(c => !HEAVY.has(c.cmd[1]))
  const results = []
  const show = (c, r) => say(`  ${r.exit === 0 && !r.launches.length ? 'ok      ' : 'PROBLEM '}[${c.why}] ${c.cmd.join(' ')}  (exit ${r.exit}; ${r.launches.length} launch(es); ${r.seconds.toFixed(1)} s)`)
  for (const c of heavy) { const r = await runTrapped(c.cmd, trap, results.length, cwd); results.push(r); show(c, r) }
  const rest = await pool(light, width, async (c, i) => { const r = await runTrapped(c.cmd, trap, heavy.length + i, cwd); show(c, r); return r })
  results.push(...rest)
  const v = verdictOf(results, controls, floor, scan, expected)
  for (const p of v.problems) say(`FAIL: ${p}`)
  say(`\n${v.line}`)
  say(v.ok ? 'verdict: no browser-free self-test or declared read-only mode launches a browser' : 'verdict: NOT ESTABLISHED OR VIOLATED')
  return { exit: v.ok ? 0 : 1, v, results, controls }
}

/** What main() asks of measure(): `--commands FILE` measures a list of its own (a floor of one command, nothing pinned, no scan of scripts/), and the guard's list is held to the floor, to the pinned count and to the scan.
 *  A function of its own so the self-test asserts the options themselves, not a regex over this file's text (review 2026-11-15, round 4, finding 5). */
export const mainOptions = file => (file ? { floor: 1, expected: null, scan: false } : { floor: MIN_COMMANDS, expected: EXPECTED_COMMANDS, scan: true })

async function main() {
  if (!trapSupported()) { console.log(`NOT ESTABLISHED: this Node (${process.version}) has no module.registerHooks (22.15 or later is needed), and there is no weaker trap to fall back to`); process.exit(2) }
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'no-launch-')))
  process.on('exit', () => rmSync(dir, { recursive: true, force: true }))
  const trap = makeTrap(dir)
  // `--commands FILE` measures the commands in FILE ([{ cmd: [...], why }]) instead of the guard's: how the self-test runs this very function end to end, exit status included.
  const file = process.argv.includes('--commands') ? process.argv[process.argv.indexOf('--commands') + 1] : null
  const cmds = file ? JSON.parse(readFileSync(file, 'utf8')) : plainCommands()
  const width = Number(process.env.NO_LAUNCH_JOBS ?? Math.min(4, availableParallelism()))
  const o = mainOptions(file)
  const r = await measure({ cmds, trap, dir, width, floor: o.floor, expected: o.expected, scan: o.scan ? nodeOptionsReplacers(join(ROOT, 'scripts')) : null })
  process.exit(r.exit)
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
    let serial = 0
    const run = (file, extra = []) => runTrapped([process.execPath, file, ...extra], trap2, `st-${serial++}`, work, 60000)

    // CONTROLS: the instrument sees a launch in each of the ways one is reached, through the runner that measures everything else
    const controls = await runControls(join(dir, 'controls'), trap2)
    check('the trap sees a direct (ESM) launch', controls[0].launches.length >= 1 && /chromium\.launch/.test(controls[0].launches[0]), JSON.stringify(controls[0].launches))
    check('...a require (CJS) launch', controls[1].launches.length >= 1, JSON.stringify(controls[1].launches))
    check('...and a launch made by a CHILD process the command started (NODE_OPTIONS carries the trap)', controls[2].launches.length >= 1, JSON.stringify(controls[2].launches))

    // THE MEASUREMENT
    const clean = await run(put('clean.mjs', `console.log('no browser here')\n`))
    check('a script that launches nothing: exit 0 and no line', clean.exit === 0 && clean.launches.length === 0, JSON.stringify(clean))
    const mentions = await run(put('mentions.mjs', `// await chromium.launch() is only mentioned here\nconst s = "import { chromium } from 'playwright'"\n`))
    check('a script that only MENTIONS a launch in a comment and a string is not a launch', mentions.exit === 0 && mentions.launches.length === 0, JSON.stringify(mentions))
    const swallowed = await run(put('swallowed.mjs', `import { chromium } from 'playwright'\ntry { await chromium.launch() } catch {}\nconsole.log('done')\n`))
    check('A LAUNCH THE SCRIPT CATCHES IS STILL A LAUNCH (the line is written before the stub throws)', swallowed.exit === 0 && swallowed.launches.length === 1, JSON.stringify(swallowed))
    const persistent = await run(put('persistent.mjs', `import { chromium } from 'playwright-core'\nawait chromium.launchPersistentContext('/tmp/x').catch(() => {})\n`))
    check('launchPersistentContext on playwright-core is a launch too', persistent.launches.length === 1 && /launchPersistentContext/.test(persistent.launches[0]), JSON.stringify(persistent.launches))
    const viaCdp = await run(put('cdp.mjs', `import { chromium } from 'playwright'\nawait chromium.connectOverCDP('http://localhost:1').catch(() => {})\n`))
    check('connectOverCDP is a launch too (attaching to a browser needs one)', viaCdp.launches.length === 1, JSON.stringify(viaCdp.launches))
    const server = await run(put('server.mjs', `import { chromium } from 'playwright'\ntry { await chromium.launchServer() } catch {}\nconsole.log('done')\n`))
    check('launchServer is a launch too (it starts a browser), swallowed or not', server.exit === 0 && server.launches.length === 1 && /launchServer/.test(server.launches[0]), JSON.stringify(server))
    const electron = await run(put('electron.mjs', `import * as pw from 'playwright'\ntry { await pw._electron.launch({}) } catch {}\ntry { await pw._android.connect('ws://x') } catch {}\nconsole.log('done')\n`))
    check('...and so are _electron.launch and _android.connect', electron.exit === 0 && electron.launches.length === 2 && /_electron\.launch/.test(electron.launches[0]), JSON.stringify(electron))
    const failing = await run(put('failing.mjs', `process.exit(3)\n`))
    check('a command that exits non-zero is measured, with its status', failing.exit === 3 && failing.launches.length === 0, JSON.stringify(failing))

    // THE STUB'S MEMBERS, every one, through both module systems (review 2026-11-15, round 4, finding 3: `connect`, `firefox` and `webkit` could be deleted from the stub with the self-test green, and a script
    // that swallows the resulting TypeError read as 0 launches). The expected lines are a LITERAL list, so deleting a member from the stub deletes a line from the log and not from the expectation.
    const ALL_TRAPS = ['chromium.launch', 'chromium.launchServer', 'chromium.launchPersistentContext', 'chromium.connect', 'chromium.connectOverCDP',
      'firefox.launch', 'firefox.launchServer', 'firefox.launchPersistentContext', 'firefox.connect', 'firefox.connectOverCDP',
      'webkit.launch', 'webkit.launchServer', 'webkit.launchPersistentContext', 'webkit.connect', 'webkit.connectOverCDP',
      '_electron.launch', '_electron.connect', '_android.launch', '_android.connect']
    const callAll = `for (const c of ${JSON.stringify(ALL_TRAPS)}) { const [a, m] = c.split('.'); try { await pw[a][m]({}) } catch {} }\n`
    const allEsm = await run(put('all.mjs', `import * as pw from 'playwright'\n${callAll}`))
    const allCjs = await run(put('all.cjs', `const pw = require('playwright')\n;(async () => {\n${callAll}})()\n`))
    const sameSet = (got, want) => JSON.stringify([...got].sort()) === JSON.stringify([...want].sort())
    check('EVERY MEMBER OF THE STUB IS A TRAP in both module systems: the three browsers\' five launching calls and the two apps\' two (19), each leaving its own line',
      sameSet(allEsm.launches, ALL_TRAPS) && sameSet(allCjs.launches, ALL_TRAPS), `esm: ${JSON.stringify(allEsm.launches)}; cjs: ${JSON.stringify(allCjs.launches)}`)
    const envLine = await run(put('env.cjs', `const fs = require('fs'); const p = process.env.PLAYWRIGHT_BROWSERS_PATH, c = process.env.PW_CHROMIUM\nconsole.log(JSON.stringify([p, c, fs.existsSync(String(p)), fs.existsSync(String(c))]))\n`))
    const envSeen = (() => { try { return JSON.parse(envLine.last) } catch { return [] } })()
    check('NO BROWSER IS ON DISK FOR A COMMAND: PLAYWRIGHT_BROWSERS_PATH and PW_CHROMIUM reach it, point under the trap directory, and name nothing that exists',
      typeof envSeen[0] === 'string' && typeof envSeen[1] === 'string' && envSeen[0].startsWith(join(dir, 'trap')) && envSeen[1].startsWith(join(dir, 'trap')) && envSeen[2] === false && envSeen[3] === false, envLine.last)
    // A PATH to the library entry is the same library: it is stubbed too (round 4, finding 7: `require('/abs/node_modules/playwright-core')` loaded the real one, and a swallowed launch read as 0 launches).
    let libEntry = null
    try { libEntry = nodeModule.createRequire(join(ROOT, 'package.json')).resolve('playwright-core') } catch { libEntry = null }
    const byPath = libEntry && await run(put('bypath.cjs', `try { require(${JSON.stringify(libEntry)}).chromium.launch().catch(() => {}) } catch {}\ntry { import(${JSON.stringify(pathToFileURL(libEntry).href)}).then(m => (m.chromium ?? m.default.chromium).launch()).catch(() => {}) } catch {}\n`))
    check('A LAUNCH THROUGH A PATH TO THE LIBRARY ENTRY IS A LAUNCH (require of the absolute path, import of its file URL): two lines, not the real library',
      Boolean(libEntry) && byPath.launches.length === 2 && byPath.launches.every(l => l === 'chromium.launch'), libEntry ? JSON.stringify(byPath) : 'playwright-core is not installed here (npm ci)')

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
    check('a scanned scripts directory is part of the verdict: an offender makes it not ok, and the line says how many scripts were scanned',
      !verdictOf(mk(30), okControls, 20, { files: 5, offenders: ['scripts/x.mjs:3'] }).ok && /NODE_OPTIONS that replaces/.test(verdictOf(mk(30), okControls, 20, { files: 5, offenders: ['scripts/x.mjs:3'] }).problems[0])
        && verdictOf(mk(30), okControls, 20, { files: 5, offenders: [] }).ok && /scanned 5 scripts for a NODE_OPTIONS that replaces the trap's: 0 found/.test(verdictOf(mk(30), okControls, 20, { files: 5, offenders: [] }).line))
    // A COMMAND KILLED BY A SIGNAL has no exit status at all (`null`), and the timeout path is exactly that: it is not a clean command, whatever a comparison with 0 makes of null (round 4, finding 2: `r.exit > 0`
    // and `exit ?? 0` left the self-test green with a killed command read as ok).
    const killed = await run(put('killed.mjs', `process.kill(process.pid, 'SIGKILL')\n`))
    const verdictKilled = verdictOf([killed, ...mk(29)], okControls)
    check('A COMMAND KILLED BY A SIGNAL IS NOT A CLEAN COMMAND: its exit is null and the signal is named, the verdict is not ok and names the signal, and the closing line does not count it among those that exited 0',
      killed.exit === null && killed.signal === 'SIGKILL' && !verdictKilled.ok && /did not complete \(exit null, SIGKILL/.test(verdictKilled.problems[0]) && /: 29 exited 0 with 0 launches/.test(verdictKilled.line), JSON.stringify({ exit: killed.exit, signal: killed.signal, problems: verdictKilled.problems }))
    const slow = await runTrapped([process.execPath, put('slow.mjs', `setTimeout(() => {}, 8000)\n`)], trap2, 'st-timeout', work, 400)
    check('THE TIMEOUT KILLS THE COMMAND: one that would run 8 s is ended after the 0.4 s it is given, by SIGKILL, and the verdict over it is not ok',
      slow.signal === 'SIGKILL' && slow.exit === null && slow.seconds < 6 && !verdictOf([slow, ...mk(29)], okControls).ok, JSON.stringify({ exit: slow.exit, signal: slow.signal, seconds: slow.seconds }))
    // THE DENOMINATOR IS PINNED (round 4, finding 4): the list the guard prints is the thing measured, and a floor of 20 let 50 of its 70 commands drop out of it with the run green.
    const pinned = verdictOf(mk(50), okControls, 20, null, 70)
    check('A LIST OF ANOTHER SIZE THAN THE PIN IS NOT OK: 50 of a pinned 70 and 71 of 70 each fail naming both numbers, the pinned size passes and says so, and no pin (the `--commands` list) asks nothing of the size',
      !pinned.ok && /listed 50 command\(s\) and this check pins 70/.test(pinned.problems[0]) && !verdictOf(mk(71), okControls, 20, null, 70).ok && verdictOf(mk(70), okControls, 20, null, 70).ok
        && /the guard's list is the pinned 70/.test(verdictOf(mk(70), okControls, 20, null, 70).line) && verdictOf(mk(30), okControls).ok, JSON.stringify(pinned.problems))
    const live = spawnSync('python3', ['scripts/check-browser-gate.py', '--plain-commands'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
    check('THE PIN IS THE GUARD\'S COUNT TODAY: `python3 scripts/check-browser-gate.py --plain-commands` lists exactly EXPECTED_COMMANDS commands (change the constant with the step that changes the list)',
      live.status === 0 && (() => { try { return JSON.parse(live.stdout).length === EXPECTED_COMMANDS } catch { return false } })(), `status ${live.status}; ${live.stderr.slice(0, 200)}`)

    // A CHILD STARTED WITHOUT THE TRAP'S NODE_OPTIONS runs outside the trap, so scripts/ is scanned for one, DEFAULT-DENY: a line that names the variable is clean only in the appending form
    // (review 2026-11-15, finding 14: scripts/proof-check.mjs replaced it for two children; round 4, finding 0: a same-line read that strips the trap, a filter, `env -u`, `unset`, `Reflect.deleteProperty` and a
    // computed key all read clean under the first scan). The expected offenders are a LITERAL list, and the clean files a literal list too, so a regex that stops finding a spelling loses an offender and not a fixture.
    const scanDir = join(dir, 'scan')
    mkdirSync(join(scanDir, 'sub'), { recursive: true })
    const OFFENDING = {
      'replaces.mjs': "go({ NODE_OPTIONS: '--require x' })", 'quoted.mjs': "go({ 'NODE_OPTIONS': '--require x' })", 'quoted2.mjs': 'go({ "NODE_OPTIONS": "--require x" })',
      'shorthand.mjs': 'const NODE_OPTIONS = "--require x"; go({ NODE_OPTIONS })', 'assign.mjs': "env.NODE_OPTIONS = '--require x'", 'delete.mjs': 'delete env.NODE_OPTIONS',
      'trailing.mjs': "go({ NODE_OPTIONS: '--require x' }) // ${process.env.NODE_OPTIONS ?? ''} --require",
      'envassign.mjs': "process.env.NODE_OPTIONS = '--require x'", 'envdelete.mjs': 'delete process.env.NODE_OPTIONS',
      'message.mjs': "console.log('NODE_OPTIONS is not set')",
      // the spellings the first scan read as clean
      'sameline.mjs': "go({ ...process.env, NODE_OPTIONS: process.env.NODE_OPTIONS?.replace(/--require=\\S+/g, '') })",
      'filter.mjs': "go(Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'NODE_OPTIONS')))",
      'envu.mjs': 'execSync("env -u NODE_OPTIONS node x.mjs")', 'unset.mjs': 'execSync("unset NODE_OPTIONS; node x.mjs")',
      'reflect.mjs': 'Reflect.deleteProperty(env, "NODE_OPTIONS")', 'computed.mjs': 'go({ ["NODE_OPTIONS"]: "--x" })',
      'andread.mjs': "go({ NODE_OPTIONS: process.env.NODE_OPTIONS && '--x' })",
      // the three parts of the old regexes no fixture reached
      'bracket.mjs': "env['NODE_OPTIONS'] = ''", 'comma.mjs': 'go({ ...process.env, NODE_OPTIONS })', 'hidden.mjs': "go({ a: 'x // y', NODE_OPTIONS: '--x' })",
      'script.cjs': "env.NODE_OPTIONS = ''", 'script.js': "env.NODE_OPTIONS = ''", 'sub/deep.mjs': "env.NODE_OPTIONS = ''",
    }
    for (const [name, line] of Object.entries(OFFENDING)) writeFileSync(join(scanDir, name), `${line}\n`)
    const CLEAN = ['envappend.mjs', 'inherits.mjs', 'mentions.mjs', 'table.mjs']
    writeFileSync(join(scanDir, 'envappend.mjs'), "process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS ?? ''} --require x`\n")
    writeFileSync(join(scanDir, 'inherits.mjs'), "go({ NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --require x`.trim() })\n")
    writeFileSync(join(scanDir, 'mentions.mjs'), "// NODE_OPTIONS=--require x is only written here\n/* NODE_OPTIONS: a block comment */\n * NODE_OPTIONS: a doc comment line\n/*\n  NODE_OPTIONS: a block comment body\n*/\n")
    writeFileSync(join(scanDir, 'table.mjs'), '  {\n    claim: "a child keeps NODE_OPTIONS",\n    find: "go({ NODE_OPTIONS: x })",\n    replace: "go({ NODE_OPTIONS: y })",\n  },\n')
    writeFileSync(join(scanDir, 'notes.txt'), 'env.NODE_OPTIONS = ""\n')                       // not a script: its extension is not read
    mkdirSync(join(scanDir, 'node_modules'), { recursive: true })
    writeFileSync(join(scanDir, 'node_modules', 'dep.mjs'), 'env.NODE_OPTIONS = ""\n')          // a dependency is not ours
    const scanned = nodeOptionsReplacers(scanDir)
    const EXPECTED_OFFENDERS = ['assign.mjs', 'delete.mjs', 'envassign.mjs', 'envdelete.mjs', 'quoted.mjs', 'quoted2.mjs', 'replaces.mjs', 'shorthand.mjs', 'trailing.mjs', 'message.mjs',
      'sameline.mjs', 'filter.mjs', 'envu.mjs', 'unset.mjs', 'reflect.mjs', 'computed.mjs', 'andread.mjs', 'bracket.mjs', 'comma.mjs', 'hidden.mjs', 'script.cjs', 'script.js', 'sub/deep.mjs'].map(f => `scripts/${f}:1`).sort()
    check('SCAN, DEFAULT-DENY: 23 files that name NODE_OPTIONS in a way that does not append to the inherited value are found (every spelling the first scan read as clean, the three parts of its regexes no fixture reached, a .cjs, a .js and a subdirectory), each with its line; the appending form, comments, the mutation table\'s text, a .txt and node_modules are not',
      JSON.stringify(scanned) === JSON.stringify({ files: 27, offenders: EXPECTED_OFFENDERS }) && Object.keys(OFFENDING).length === 23 && CLEAN.length === 4, JSON.stringify(scanned))
    const real = nodeOptionsReplacers(join(ROOT, 'scripts'))
    check('...and no script in scripts/ names it without appending to the inherited value (proof-check.mjs did, for two of its children)', real.offenders.length === 0 && real.files >= 50, JSON.stringify(real))

    // THE NODE VERSION GUARD: reachable. A named import of registerHooks is a link error on a Node without it, before any message.
    check('A NODE WITHOUT registerHooks IS REPORTED, not a link error: the test is `typeof` on the namespace', trapSupported({}) === false && trapSupported({ registerHooks() {} }) === true && trapSupported() === true, `this Node ${process.version}`)

    // MAIN, END TO END: this very file, started as the CI step starts it (`--commands FILE` stands in for the guard's list), with its exit status. The path that measures the 69 commands is the one
    // under test, so a break in the runner, in the exit, or in what is read back from the log fails here (review 2026-11-15, finding 11: all three survived).
    const mainOver = (name, list, env = {}) => {
      const f = join(dir, `${name}.json`)
      writeFileSync(f, JSON.stringify(list))
      const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--commands', f], { encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, ...env } })
      return { status: r.status, out: `${r.stdout}${r.stderr}` }
    }
    const mainClean = mainOver('clean', [{ cmd: [process.execPath, put('m-clean.mjs', `console.log('x')\n`)], why: 'self-test' }])
    check('MAIN, END TO END: a list of commands that launch nothing exits 0, prints its denominator and the controls\' count, and says so',
      mainClean.status === 0 && /checked 1 of 1 commands: 1 exited 0 with 0 launches; controls: 3 of 3 saw a launch/.test(mainClean.out) && /verdict: no browser-free self-test/.test(mainClean.out), `exit ${mainClean.status}; ${mainClean.out.slice(-300)}`)
    const mainDirty = mainOver('dirty', [{ cmd: [process.execPath, put('m-dirty.mjs', `import { chromium } from 'playwright'\ntry { await chromium.launch() } catch {}\n`)], why: 'self-test' }])
    check('...a list with a command that attempts a launch (swallowed) exits 1, names it, and says NOT ESTABLISHED OR VIOLATED',
      mainDirty.status === 1 && /attempted a browser launch \(chromium\.launch\)/.test(mainDirty.out) && /NOT ESTABLISHED OR VIOLATED/.test(mainDirty.out), `exit ${mainDirty.status}; ${mainDirty.out.slice(-300)}`)
    const mainMixed = mainOver('mixed', [
      { cmd: [process.execPath, put('m-a.mjs', `await new Promise(r => setTimeout(r, 500))\nconsole.log('a')\n`)], why: 'self-test' },
      { cmd: [process.execPath, put('m-b.mjs', `import { chromium } from 'playwright'\ntry { await chromium.launch() } catch {}\n`)], why: 'self-test' },
      { cmd: [process.execPath, put('m-c.mjs', `await new Promise(r => setTimeout(r, 500))\nconsole.log('c')\n`)], why: 'self-test' }], { NO_LAUNCH_JOBS: '3' })
    const problemLines = mainMixed.out.split('\n').filter(l => /^\s*PROBLEM /.test(l)), okLines = mainMixed.out.split('\n').filter(l => /^\s*ok /.test(l))
    check('...each command has a log of its own: of three, the one that launches is the one named, and the two that do not are not charged with it',
      mainMixed.status === 1 && problemLines.length === 1 && /m-b\.mjs/.test(problemLines[0]) && okLines.length === 2 && /1 launch\(es\)/.test(problemLines[0]) && /checked 3 of 3 commands: 2 exited 0 with 0 launches/.test(mainMixed.out),
      `exit ${mainMixed.status}; ${mainMixed.out.slice(-400)}`)
    check('MAIN ASKS OF THE GUARD\'S LIST WHAT IT ASKS, not of `--commands`: a floor of MIN_COMMANDS, the pinned count and the scan of scripts/; `--commands FILE` asks a floor of one command, no pin and no scan',
      JSON.stringify(mainOptions(null)) === JSON.stringify({ floor: MIN_COMMANDS, expected: EXPECTED_COMMANDS, scan: true }) && JSON.stringify(mainOptions('f.json')) === '{"floor":1,"expected":null,"scan":false}', JSON.stringify([mainOptions(null), mainOptions('f.json')]))
    const mainEmpty = mainOver('empty', [])
    check('...and an empty list exits 1 (a list that measured nothing is not a pass)', mainEmpty.status === 1 && /only 0 command\(s\) were measured/.test(mainEmpty.out), `exit ${mainEmpty.status}; ${mainEmpty.out.slice(-200)}`)
    // The floor of the guard's own list is MIN_COMMANDS, and `main()` applies it to the real list: measure() with that floor, not main()'s `--commands` one.
    const floored = await measure({ cmds: [{ cmd: [process.execPath, put('m-d.mjs', `console.log('d')\n`)], why: 'self-test' }], trap: trap2, dir: join(dir, 'floor'), width: 1, say: () => {} })
    check('THE COMMANDS THAT WAIT ON TIMINGS ARE THE MUTATION HARNESS AND THE COMPILE WATCHER\'S SELF-TEST', HEAVY.has('scripts/mutation-check.mjs') && HEAVY.has('scripts/mutation-lib.mjs') && HEAVY.size === 2, [...HEAVY].join())
    // ...and they are MEASURED FIRST AND ALONE (round 4, finding 6: `heavy = []` left the self-test green and put the timing-sensitive command back in the pool). Four scripts that each take 300 ms and log their
    // start and end; the one named like the harness is listed in the middle, and no other may have started before it ended.
    const orderDir = join(dir, 'order')
    mkdirSync(join(orderDir, 'scripts'), { recursive: true })
    const stamp = n => `import { appendFileSync } from 'node:fs'\nconst t0 = Date.now()\nawait new Promise(r => setTimeout(r, 300))\nappendFileSync(${JSON.stringify(join(orderDir, 'order.log'))}, ${JSON.stringify(n)} + ' ' + t0 + ' ' + Date.now() + '\\n')\n`
    for (const n of ['mutation-check', 'l0', 'l1', 'l2', 'l3']) writeFileSync(join(orderDir, 'scripts', `${n}.mjs`), stamp(n))
    await measure({ cmds: ['l0', 'l1', 'mutation-check', 'l2', 'l3'].map(n => ({ cmd: [process.execPath, `scripts/${n}.mjs`], why: 'self-test' })), trap: trap2, dir: join(dir, 'order-run'), width: 4, floor: 1, cwd: orderDir, say: () => {} })
    const stamps = Object.fromEntries(readFileSync(join(orderDir, 'order.log'), 'utf8').split('\n').filter(Boolean).map(l => { const [n, a, b] = l.split(' '); return [n, [Number(a), Number(b)]] }))
    check('THE HARNESS\'S COMMAND IS MEASURED FIRST AND ALONE: of five commands it started first, ended, and only then did the others start',
      Object.keys(stamps).length === 5 && ['l0', 'l1', 'l2', 'l3'].every(n => stamps[n][0] >= stamps['mutation-check'][1]), JSON.stringify(stamps))
    check('THE FLOOR OF THE GUARD\'S LIST (MIN_COMMANDS, 20) is what measure() asks by default: one clean command is not enough, whatever it measured', floored.exit === 1 && /fewer than the 20/.test(floored.v.problems[0]) && MIN_COMMANDS === 20, JSON.stringify(floored.v.problems))

    // THE ARTIFACT THE CC-CMD NAMES: scripts/axis-check.mjs with its `--self-test` edited to launch is caught, and the real one is not
    if (existsSync(join(ROOT, 'build'))) {
      const copy = join(dir, 'copy')
      cpSync(join(ROOT, 'scripts'), join(copy, 'scripts'), { recursive: true })
      symlinkSync(join(ROOT, 'build'), join(copy, 'build'))
      if (existsSync(join(ROOT, 'node_modules'))) symlinkSync(join(ROOT, 'node_modules'), join(copy, 'node_modules'))
      const realRun = await runTrapped([process.execPath, join(copy, 'scripts', 'axis-check.mjs'), '--self-test'], trap2, 'axis-real', copy, 120000)
      check('the real scripts/axis-check.mjs --self-test exits 0 with no launch (the unmutated control)', realRun.exit === 0 && realRun.launches.length === 0, JSON.stringify({ ...realRun, last: realRun.last.slice(0, 160) }))
      const src = readFileSync(join(copy, 'scripts', 'axis-check.mjs'), 'utf8')
      const anchor = "if (isMain(import.meta.url) && process.argv.includes('--self-test')) {\n  const { check, summarize } = createChecks()\n"
      check('the anchor for the mutation occurs exactly once', src.split(anchor).length === 2)
      writeFileSync(join(copy, 'scripts', 'axis-check.mjs'), src.replace(anchor, anchor + "  await (await import('playwright')).chromium.launch().catch(() => {})\n"))
      const mutated = await runTrapped([process.execPath, join(copy, 'scripts', 'axis-check.mjs'), '--self-test'], trap2, 'axis-mutated', copy, 120000)
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
