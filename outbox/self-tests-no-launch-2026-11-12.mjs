#!/usr/bin/env node
// Do the five `--self-test` runs of verify.yml's step "The browser checks' own self-tests, which launch no browser" launch a browser? (Rule 89: the artifact is this output.)
// The step sits OUTSIDE the Chromium gate on the strength of that claim, so a claim that is only a reading is not enough. Method: `playwright` and `playwright-core` are resolved, by a
// module-resolution hook registered with --import, to a stub whose launch, launchPersistentContext, connect and connectOverCDP each APPEND a line to $LAUNCH_LOG and then throw; no
// browser is on disk for them (PLAYWRIGHT_BROWSERS_PATH and PW_CHROMIUM point at nothing). Each self-test is run in place under the stub; the log is read afterwards.
// CONTROLS FIRST, so a green result means the instrument can see a launch: two scripts that DO launch (spark-check.mjs, live-score-probe.mjs --e2e) must each leave a line in the log.
// Coverage is printed in the verdict line (Rule 91). Read-only on the repository: it writes only to a temporary directory.
// NEEDS node_modules and build/ (run `npm ci && npm run build` first): the spark-check control reads build/, and without it the control cannot launch and the verdict is NOT ESTABLISHED.
// The sixth render-check self-test, verify-render-check's, is NOT in the step and not measured here: it runs the whole F# suite to count its rows (see the step's comment in verify.yml).
//   node outbox/self-tests-no-launch-2026-11-12.mjs        (from the repository root)
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const here = new URL('..', import.meta.url).pathname
const wf = readFileSync(join(here, '.github/workflows/verify.yml'), 'utf8')
const NAME = "The browser checks' own self-tests, which launch no browser"
const at = wf.indexOf(`- name: ${NAME}\n`)
if (at < 0 || wf.indexOf(`- name: ${NAME}\n`, at + 1) >= 0) { console.log(`the step "${NAME}" is not in verify.yml exactly once`); process.exit(1) }
const block = wf.slice(at).split(/\n      - name: /)[0]
const names = [...block.matchAll(/^\s*node (scripts\/[\w.\-]+\.mjs) --self-test\s*$/gm)].map(m => m[1])

const tmp = mkdtempSync(join(tmpdir(), 'nolaunch-'))
const log = join(tmp, 'launch.log')
const stub = `import { appendFileSync } from 'node:fs'
const trap = what => async () => { appendFileSync(process.env.LAUNCH_LOG, what + '\\n'); throw new Error('launch trapped: ' + what) }
const type = n => ({ launch: trap(n + '.launch'), launchPersistentContext: trap(n + '.launchPersistentContext'), connect: trap(n + '.connect'), connectOverCDP: trap(n + '.connectOverCDP'), executablePath: () => '/nonexistent' })
export const chromium = type('chromium'), firefox = type('firefox'), webkit = type('webkit'), devices = {}
export default { chromium, firefox, webkit, devices }
`
writeFileSync(join(tmp, 'stub.mjs'), stub)
writeFileSync(join(tmp, 'hooks.mjs'), `const STUB = ${JSON.stringify(pathToFileURL(join(tmp, 'stub.mjs')).href)}
export async function resolve(spec, ctx, next) { return spec === 'playwright' || spec === 'playwright-core' ? { url: STUB, shortCircuit: true } : next(spec, ctx) }
`)
writeFileSync(join(tmp, 'register.mjs'), `import { register } from 'node:module'\nregister(${JSON.stringify(pathToFileURL(join(tmp, 'hooks.mjs')).href)})\n`)

const run = args => {
  writeFileSync(log, '')
  const r = spawnSync(process.execPath, ['--import', pathToFileURL(join(tmp, 'register.mjs')).href, ...args], {
    cwd: here, encoding: 'utf8', timeout: 120000, maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, LAUNCH_LOG: log, PLAYWRIGHT_BROWSERS_PATH: join(tmp, 'no-browsers'), PW_CHROMIUM: join(tmp, 'no-chrome') },
  })
  const launches = readFileSync(log, 'utf8').split('\n').filter(Boolean)
  const tally = ((r.stdout + r.stderr).match(/(\d+)\/(\d+) checks? passed|(\d+) passed/) ?? ['no tally'])[0]
  return { exit: r.status, tally, launches }
}

let ok = true
try {
  console.log(`the step: ${NAME}\nself-tests read from it: ${names.length}\n`)
  console.log('CONTROLS (each must launch under the stub, or the instrument cannot see a launch):')
  const controls = [['scripts/spark-check.mjs'], ['scripts/live-score-probe.mjs', '--e2e']]
  let seen = 0
  for (const c of controls) {
    const r = run(c)
    const launched = r.launches.length > 0
    if (launched) seen++
    console.log(`  ${launched ? 'LAUNCHED' : 'NOT SEEN'}  node ${c.join(' ')}  (exit ${r.exit}; ${r.launches.length} launch line(s): ${[...new Set(r.launches)].join(', ') || 'none'})`)
  }
  console.log('\nTHE FIVE SELF-TESTS:')
  let clean = 0, passed = 0
  for (const s of names) {
    const r = run([s, '--self-test'])
    const noLaunch = r.launches.length === 0
    if (noLaunch) clean++
    if (r.exit === 0) passed++
    console.log(`  ${noLaunch && r.exit === 0 ? 'ok       ' : 'PROBLEM  '}node ${s} --self-test  (exit ${r.exit}; ${r.tally}; ${r.launches.length} launches)`)
  }
  ok = names.length === 5 && seen === controls.length && clean === names.length && passed === names.length
  console.log(`\nchecked ${names.length} of 5 self-tests: ${passed} exit 0, ${clean} with 0 launches; positive control: ${seen} of ${controls.length} launched`)
  console.log(ok ? 'verdict: the five self-tests launch no browser' : 'verdict: NOT ESTABLISHED')
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
process.exit(ok ? 0 : 1)
