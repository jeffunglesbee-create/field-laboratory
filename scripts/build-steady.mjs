#!/usr/bin/env node
// `npm run build`, repeated when the F# compiler crashes. docs/CC-CMD-2026-11-03-gate-speed.md; the cause is the subject of
// docs/CC-CMD-2026-11-03-fable-compiler-crash.md.
//
//   node scripts/build-steady.mjs                 build the site (npm run build)
//   node scripts/build-steady.mjs --cmd "<shell>" build with another command (the self-test uses this)
//   node scripts/build-steady.mjs --clean <dir>   the output directory that is cleared before each repeat (default `build` for the default command; none for --cmd)
//   node scripts/build-steady.mjs --self-test
//
// WHY. Fable's embedded F# compiler fails on the CI runners at about 1 build in 100 with `internal error: Object reference not set to an instance of an object`
// at many files at once, and the same flake prints diagnostics that look real (code 72, 752, 1: "Lookup on object of indeterminate type"). One build of one job
// used to be exposed to it; the sharded gate has nine builds a run, and the scored run on ee33fc9 lost shard 1's `Build` step to it before the harness ran.
//
// WHAT IT DOES NOT DO. It is not a fallback for a failing build. A build that fails is repeated only to see whether it fails THE SAME WAY: a crash is repeated; a
// diagnostic is believed only when the next build prints the same first diagnostic; a failure that carries no diagnostic (the site failing to assemble, a killed
// process) is not repeated at all. The output directory is cleared before every repeat: Fable trusts the files a crashed build leaves behind, so without that the
// repeat prints "Skipped compilation because all generated files are up-to-date!", reports success and leaves the crashed output in place (two shards of two gate
// runs on 2026-11-11, each then failed its baseline against it). Every repeat is printed with the reason, the count is written to the step summary, and a build that
// really fails prints the whole output of its last attempt and exits 1. The root cause is not known; this is the bounded, counted answer to a measured fault, filed as its own CC-CMD.
import { appendFileSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createChecks, finish, isMain } from './checks.mjs'
import { buildSteadily } from './mutation-lib.mjs'

const arg = name => { const k = process.argv.indexOf(name); return k > 0 ? process.argv[k + 1] : undefined }

/** The directory to clear before a repeat: `--clean <dir>` if given, `build` for the default command (what `npm run build` writes), nothing for another --cmd. */
export const cleanDirFor = (cmdArg, cleanArg) => cleanArg ?? (cmdArg === undefined ? 'build' : undefined)

const steady = async (command, pauseMs, cleanDir) => {
  const r = await buildSteadily(command, (n, errors) => console.log(`RETRY build ${n}: the build failed (${String(errors?.[0] ?? '').replace(/\x1b\[[0-9;]*m/g, '').slice(0, 200)}); ${cleanDir ? `clearing ${cleanDir}/ and ` : ''}building again to see whether it fails the same way`), pauseMs, cleanDir ? () => rmSync(cleanDir, { recursive: true, force: true }) : undefined)
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
  // A repeat has to compile again. This stands in for Fable as the runner measured it (2026-11-11): a crashed first build leaves its output, and a build that finds
  // output already there says "Skipped compilation because all generated files are up-to-date!" and succeeds without compiling.
  const sim = `${mark}-fable.cjs`
  writeFileSync(sim, [
    `const fs=require('fs'),path=require('path'); const dir=process.argv[2], once=process.argv[3], f=path.join(dir,'a.js');`,
    `if(fs.existsSync(f)){console.log('Skipped compilation because all generated files are up-to-date!');process.exit(0)}`,
    `fs.mkdirSync(dir,{recursive:true});`,
    `if(!fs.existsSync(once)){fs.writeFileSync(once,'x');fs.writeFileSync(f,'crashed partial output');console.log('./src/A.fs(1,1): (1,2) error FSHARP: internal error: Object reference not set to an instance of an object. (code 193)');process.exit(1)}`,
    `fs.writeFileSync(f,'compiled');process.exit(0)`,
  ].join('\n'))
  const simCmd = tag => `node ${sim} ${mark}-out-${tag} ${mark}-once-${tag}`
  const outOf = tag => { try { return readFileSync(`${mark}-out-${tag}/a.js`, 'utf8') } catch { return null } }
  const cleanOf = tag => () => rmSync(`${mark}-out-${tag}`, { recursive: true, force: true })
  r = await steady(simCmd('skip'), 0)
  check('MUTATION: with nothing cleared, the repeat of a crash skips compilation, reports success and keeps the crashed output (the defect, reproduced)', r.ok === true && r.retries === 1 && outOf('skip') === 'crashed partial output' && /Skipped compilation/.test(r.output), JSON.stringify({ ok: r.ok, retries: r.retries, out: outOf('skip') }))
  r = await steady(simCmd('clean'), 0, `${mark}-out-clean`)
  check('MUTATION: with the output cleared before the repeat, the repeat compiles and the output is the compiled one', r.ok === true && r.retries === 1 && outOf('clean') === 'compiled' && !/Skipped compilation/.test(r.output), JSON.stringify({ ok: r.ok, retries: r.retries, out: outOf('clean') }))
  let cleared = 0
  r = await buildSteadily(`node -e "process.exit(0)"`, () => {}, 0, () => { cleared++ })
  check('MUTATION: a build that works the first time clears nothing (the output a first build finds is the caller\'s)', r.ok === true && r.retries === 0 && cleared === 0, JSON.stringify({ retries: r.retries, cleared }))
  cleared = 0
  r = await buildSteadily(once('cl', CRASH, `console.log('built')`), () => {}, 0, () => { cleared++ })
  check('MUTATION: the output is cleared once per repeat and never before the first build', r.ok === true && r.retries === 1 && cleared === 1, JSON.stringify({ retries: r.retries, cleared }))
  check('the directory cleared is `build` for the default command, the --clean argument when given, and none for another --cmd', cleanDirFor(undefined, undefined) === 'build' && cleanDirFor('x', undefined) === undefined && cleanDirFor('x', 'out') === 'out' && cleanDirFor(undefined, 'out') === 'out', JSON.stringify([cleanDirFor(undefined, undefined), cleanDirFor('x', undefined), cleanDirFor('x', 'out')]))
  // The command line itself.
  const cli = (cmd, ...more) => spawnSync(process.execPath, [new URL(import.meta.url).pathname, '--cmd', cmd, '--pause', '0', ...more], { encoding: 'utf8' })
  let c = cli(simCmd('cli'), '--clean', `${mark}-out-cli`)
  check('MUTATION: the command line clears the --clean directory before the repeat, says so, and the build that follows compiles', c.status === 0 && outOf('cli') === 'compiled' && /RETRY build 1: .*clearing .*-out-cli\/ and building again/.test(c.stdout) && !/Skipped compilation/.test(c.stdout), `${c.status} ${c.stdout.slice(-300)}`)
  c = cli(simCmd('cli2'))
  check('MUTATION: the command line given --cmd and no --clean clears nothing (the repeat skips, as the defect did)', c.status === 0 && outOf('cli2') === 'crashed partial output' && !/clearing/.test(c.stdout), `${c.status} ${outOf('cli2')}`)
  c = cli(`node -e "process.exit(0)"`)
  check('the command line exits 0 for a build that works', c.status === 0, `${c.status}`)
  const t0 = Date.now()
  c = cli(`node -e "console.log('./src/B.fs(7,3): (7,9) error FSHARP: Type mismatch (code 1)'); process.exit(1)"`)
  const took = Date.now() - t0
  check('MUTATION: the command line exits 1 for a real failure, prints the failing output as lines of its own, and says it repeated', c.status === 1 && /^\.\/src\/B\.fs\(7,3\)/m.test(c.stdout) && /RETRY build 1/.test(c.stdout), `${c.status} ${c.stdout.slice(-200)}`)
  check('MUTATION: --pause 0 means no pause (a real failure with one repeat takes well under the default 3 s)', took < 2500, `${took} ms`)
  for (const f of readdirSync(tmp)) if (f.startsWith(`build-steady-${process.pid}-`)) rmSync(`${tmp}/${f}`, { recursive: true, force: true })
  finish(summarize())
} else if (isMain(import.meta.url)) {
  const command = arg('--cmd') ?? 'npm run build'
  const pause = arg('--pause') === undefined ? 3000 : Number(arg('--pause'))
  const r = await steady(command, pause, cleanDirFor(arg('--cmd'), arg('--clean')))
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
