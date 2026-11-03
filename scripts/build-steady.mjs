#!/usr/bin/env node
// `npm run build`, repeated when the F# compiler crashes. docs/CC-CMD-2026-11-03-gate-speed.md; the cause is the subject of
// docs/CC-CMD-2026-11-03-fable-compiler-crash.md.
//
//   node scripts/build-steady.mjs                 build the site (npm run build)
//   node scripts/build-steady.mjs --cmd "<shell>" build with another command (the self-test uses this)
//   node scripts/build-steady.mjs --self-test
//
// WHY. Fable's embedded F# compiler fails on the CI runners at about 1 build in 100 with `internal error: Object reference not set to an instance of an object`
// at many files at once, and the same flake prints diagnostics that look real (code 72, 752, 1: "Lookup on object of indeterminate type"). One build of one job
// used to be exposed to it; the sharded gate has nine builds a run, and the scored run on ee33fc9 lost shard 1's `Build` step to it before the harness ran.
//
// WHAT IT DOES NOT DO. It is not a fallback for a failing build. A build that fails is repeated only to see whether it fails THE SAME WAY: a crash is repeated; a
// diagnostic is believed only when the next build prints the same first diagnostic; a failure that carries no diagnostic (the site failing to assemble, a killed
// process) is not repeated at all. Every repeat is printed with the reason, the count is written to the step summary, and a build that really fails prints the
// whole output of its last attempt and exits 1. The root cause is not known; this is the bounded, counted answer to a measured fault, filed as its own CC-CMD.
import { appendFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createChecks, finish, isMain } from './checks.mjs'
import { buildSteadily } from './mutation-lib.mjs'

const arg = name => { const k = process.argv.indexOf(name); return k > 0 ? process.argv[k + 1] : undefined }

const steady = async (command, pauseMs) => {
  const r = await buildSteadily(command, (n, errors) => console.log(`RETRY build ${n}: the build failed (${String(errors?.[0] ?? '').replace(/\x1b\[[0-9;]*m/g, '').slice(0, 200)}); building again to see whether it fails the same way`), pauseMs)
  return r
}

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()
  const node = body => `node -e "${body}"`
  const tmp = process.env.TMPDIR ?? '/tmp'
  const mark = `${tmp}/build-steady-${process.pid}`
  // A command that does `first` the first time it runs for a given tag and `then` after. Single quotes only inside: the body sits in double quotes.
  const once = (tag, first, then) => node(`const fs=require('fs'),p='${mark}-${tag}'; if(!fs.existsSync(p)){fs.writeFileSync(p,'x'); ${first}} else {${then}}`)
  const CRASH = `console.log('./src/A.fs(1,1): (1,2) error FSHARP: internal error: Object reference not set to an instance of an object. (code 193)'); process.exit(1)`
  let r
  r = await steady(node(`console.log('built')`), 0)
  check('a build that works is built once and says nothing', r.ok === true && r.retries === 0, JSON.stringify({ ok: r.ok, retries: r.retries }))
  r = await steady(once('a', CRASH, `console.log('built')`), 0)
  check('MUTATION: a crash is repeated and the build after it is the answer', r.ok === true && r.retries === 1, JSON.stringify({ ok: r.ok, retries: r.retries }))
  r = await steady(once('b', `console.log('./src/A.fs(1,1): (1,2) error FSHARP: Lookup on object of indeterminate type (code 72)'); process.exit(1)`, `console.log('built')`), 0)
  check('MUTATION: a diagnostic that does not come back was the flake, and the build after it is the answer', r.ok === true && r.retries === 1, JSON.stringify({ ok: r.ok, retries: r.retries }))
  r = await steady(node(`console.log('./src/B.fs(7,3): (7,9) error FSHARP: Type mismatch (code 1)'); process.exit(1)`), 0)
  check('MUTATION: a diagnostic that comes back is a real failure: one repeat to confirm, then it fails, and the output is kept whole', r.ok === false && r.retries === 1 && r.crashed === false && /Type mismatch/.test(r.output), JSON.stringify({ ok: r.ok, retries: r.retries, crashed: r.crashed }))
  r = await steady(node(`console.log('assembling the site failed'); process.exit(1)`), 0)
  check('MUTATION: a failure with no diagnostic is not repeated', r.ok === false && r.retries === 0, JSON.stringify({ ok: r.ok, retries: r.retries }))
  r = await steady(node(CRASH), 0)
  check('MUTATION: a compiler that crashes every time fails after the repeats, and says so', r.ok === false && r.retries >= 2 && r.crashed === true, JSON.stringify({ ok: r.ok, retries: r.retries, crashed: r.crashed }))
  // The command line itself.
  const cli = (cmd) => spawnSync(process.execPath, [new URL(import.meta.url).pathname, '--cmd', cmd, '--pause', '0'], { encoding: 'utf8' })
  let c = cli(`node -e "process.exit(0)"`)
  check('the command line exits 0 for a build that works', c.status === 0, `${c.status}`)
  const t0 = Date.now()
  c = cli(`node -e "console.log('./src/B.fs(7,3): (7,9) error FSHARP: Type mismatch (code 1)'); process.exit(1)"`)
  const took = Date.now() - t0
  check('MUTATION: the command line exits 1 for a real failure, prints the failing output as lines of its own, and says it repeated', c.status === 1 && /^\.\/src\/B\.fs\(7,3\)/m.test(c.stdout) && /RETRY build 1/.test(c.stdout), `${c.status} ${c.stdout.slice(-200)}`)
  check('MUTATION: --pause 0 means no pause (a real failure with one repeat takes well under the default 3 s)', took < 2500, `${took} ms`)
  finish(summarize())
} else if (isMain(import.meta.url)) {
  const command = arg('--cmd') ?? 'npm run build'
  const pause = arg('--pause') === undefined ? 3000 : Number(arg('--pause'))
  const r = await steady(command, pause)
  if (r.retries > 0 && process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\nbuild repeated ${r.retries} time(s) because the compiler failed (${r.ok ? 'the last build worked' : 'the last build failed'})\n`)
  if (r.ok) {
    console.log(r.output.trimEnd())
    if (r.retries > 0) console.log(`\nbuild: worked after ${r.retries} repeat(s)`)
    process.exitCode = 0
  } else {
    console.log(r.output.trimEnd())
    console.log(`\nFAIL  the build failed${r.retries ? ` ${r.retries + 1} times` : ''}${r.crashed ? ' and the compiler crashed or said different things each time' : ' with the same diagnostic each time'}`)
    process.exitCode = 1
  }
}
