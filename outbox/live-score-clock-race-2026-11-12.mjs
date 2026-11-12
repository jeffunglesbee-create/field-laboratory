#!/usr/bin/env node
// Does `node scripts/live-score-render-check.mjs` die with "clock.pauseAt: Error: Cannot fast-forward to the past" under CPU load, and does a 1000 ms pause margin stop it? (Rule 89: the artifact is this output.)
//
// WHAT HAPPENED. Shard 2 of verify-full run 43170926697 (2026-11-12, option1-chromium-gate at 4ce37c2) failed its unmutated BASELINE: this check crashed at scripts/live-score-render-check.mjs:526, `pg.clock.pauseAt(new Date(tNow + 1))`,
// while the build driver was compiling beside it. The clock `install`ed at AT runs naturally until it is paused, so the page's time moves between `pg.evaluate(() => Date.now())` and the pause; a target 1 ms ahead is
// behind the page by the time the call lands whenever the round trip takes more than a millisecond. The same check had passed in `verify` (run 43169163026) on the same code minutes earlier.
//
// METHOD. The served site (node scripts/serve.mjs) and CPU load (4 busy node processes per core), then N runs of the check as it was at 4ce37c2 (margin 1 ms) and N runs of the working-tree file (margin 1000 ms), alternating so
// a change in the load hits both. A run FAILS when the check exits non-zero; the past-error count is how many of those carry the message above. Coverage is printed in the verdict (Rule 91). It does NOT show that no stall can ever exceed 1000 ms:
// it shows the failure at 1 ms and none at 1000 ms in N runs, and the measured size of the window (outbox/live-score-clock-race-2026-11-12.txt, GAP lines: the call took 1.3 to 2.9 ms idle and up to 17 ms loaded).
//
// NEEDS: `npm ci && npm run build` first (public/ must be the current tree), and a Chromium: PW_CHROMIUM=/path/to/chrome when the playwright browser build is not the one on disk.
//   node outbox/live-score-clock-race-2026-11-12.mjs [N=30]        (from the repository root)
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, rmSync, writeFileSync } from 'node:fs'
import { cpus } from 'node:os'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const N = Number(process.argv[2] || 30)
const BEFORE_REV = '4ce37c2'
const after = join(root, 'scripts', 'live-score-render-check.mjs')
const beforeCopy = join(root, 'scripts', '__live-score-before.mjs')
if (!existsSync(join(root, 'public', 'index.html'))) { console.log('public/ is not built: run `npm run build` first'); process.exit(2) }

writeFileSync(beforeCopy, execFileSync('git', ['show', `${BEFORE_REV}:scripts/live-score-render-check.mjs`], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }))
const marginOf = file => (spawnSync('grep', ['-c', 'PAUSE_AHEAD_MS = 1000', file], { encoding: 'utf8' }).stdout.trim() === '1' ? '1000 ms' : '1 ms')
const server = spawn(process.execPath, ['scripts/serve.mjs'], { cwd: root, stdio: 'ignore' })
const load = []
for (let i = 0; i < cpus().length * 4; i++) load.push(spawn(process.execPath, ['-e', 'for(;;);'], { stdio: 'ignore' }))
const stop = () => { for (const p of [server, ...load]) { try { p.kill('SIGKILL') } catch {} } rmSync(beforeCopy, { force: true }) }
process.on('exit', stop)

const run = file => {
  const r = spawnSync(process.execPath, [file], { cwd: root, encoding: 'utf8', timeout: 300000, env: { ...process.env, URL: 'http://localhost:8080' }, maxBuffer: 64 * 1024 * 1024 })
  const out = r.stdout + r.stderr
  return { ok: r.status === 0, past: /Cannot fast-forward to the past/.test(out), tally: (out.match(/(\d+)\/(\d+) checks passed/) ?? [])[0] ?? null }
}
await new Promise(res => setTimeout(res, 3000))
const tally = { before: { runs: 0, failed: 0, past: 0 }, after: { runs: 0, failed: 0, past: 0 } }
console.log(`load: ${load.length} busy processes on ${cpus().length} cores; ${N} runs of each, alternating`)
console.log(`  before = ${BEFORE_REV}:scripts/live-score-render-check.mjs (margin ${marginOf(beforeCopy)}), after = the working tree's (margin ${marginOf(after)})`)
for (let i = 1; i <= N; i++) {
  for (const [name, file] of [['before', beforeCopy], ['after', after]]) {
    const r = run(file)
    const t = tally[name]
    t.runs++
    if (!r.ok) t.failed++
    if (r.past) t.past++
    console.log(`  run ${String(i).padStart(2)} ${name.padEnd(6)} ${r.ok ? 'ok    ' : 'FAILED'}${r.past ? ' (the pauseAt past error)' : ''}${r.tally ? ' ' + r.tally : ''}`)
  }
}
console.log(`\nchecked ${N} runs of each under load: before (margin 1 ms) ${tally.before.failed} failed, ${tally.before.past} of them with the pauseAt past error; after (margin 1000 ms) ${tally.after.failed} failed, ${tally.after.past} with it`)
const ok = tally.after.failed === 0 && tally.after.runs === N
console.log(ok ? 'verdict: no failure with the 1000 ms margin in this run' : 'verdict: THE 1000 ms MARGIN STILL FAILS')
process.exit(ok ? 0 : 1)
