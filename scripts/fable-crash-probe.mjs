#!/usr/bin/env node
// How often does Fable's embedded F# compiler crash, and does anything change it?
// docs/CC-CMD-2026-11-03-fable-compiler-crash.md, Task 1.
//
//   node scripts/fable-crash-probe.mjs --cell NAME --builds N --out-mode fresh|reuse --out FILE   run N builds in a row, write what each did
//   node scripts/fable-crash-probe.mjs --merge DIR --out FILE                                    merge the cells' files into one table
//   node scripts/fable-crash-probe.mjs --self-test
//
// A build is `dotnet fable src/Laboratory.fsproj --outDir <dir>`: the same fresh whole-project check as `npm run build`, without the site assembly. Each build is one
// of: ok; crash (the words "internal error" and no diagnostic about the code); refusal (a real diagnostic: the source is unchanged, so there should never be one);
// fault (failed with neither). The result is a RATE WITH ITS DENOMINATOR and a 95% Wilson interval, never a pass: a cell with 0 crashes in 50 builds says "under 7%".
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { cpus, tmpdir, totalmem } from 'node:os'
import { join } from 'node:path'
import { createChecks, finish, isMain } from './checks.mjs'
import { isCompilerRefusal, stripAnsi } from './mutation-lib.mjs'

const arg = name => { const k = process.argv.indexOf(name); return k > 0 ? process.argv[k + 1] : undefined }

/** 95% Wilson score interval for k events in n trials. */
export const wilson = (k, n, z = 1.96) => {
  if (n === 0) return { lo: 0, hi: 1 }
  const p = k / n, d = 1 + (z * z) / n
  const centre = (p + (z * z) / (2 * n)) / d
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d
  return { lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) }
}

/** What one build did, from its output. Pure. */
export const classify = (ok, text) => {
  if (ok) return { kind: 'ok', signature: null }
  const lines = stripAnsi(text).split('\n').map(l => l.trim()).filter(Boolean)
  const errors = lines.filter(l => /\berror (FSHARP|FABLE|EXCEPTION)\b|: error FS\d+/.test(l))
  // The source is known good, so ANY failure is the compiler's fault, and the mixed shape the flake produces (internal errors with real-looking diagnostics beside them)
  // counts as a crash here: the harness's rule (a diagnostic is believed only when it repeats) is about telling a refusal from a flake, which this probe never needs to do.
  const kind = errors.some(l => /internal error/i.test(l)) ? 'crash' : isCompilerRefusal(errors) ? 'refusal' : 'fault'
  const first = (kind === 'crash' ? errors.find(l => /internal error/i.test(l)) : errors[0]) ?? lines.at(-1) ?? '(no output)'
  return { kind, signature: first.replace(/\s+/g, ' ').slice(0, 220), errorLines: errors.length }
}

export const mergeCells = files => {
  const cells = new Map()
  for (const f of files) {
    const c = cells.get(f.cell) ?? { cell: f.cell, sdk: f.sdk, outMode: f.outMode, fable: f.fable, image: f.image, cpus: f.cpus, builds: 0, crashes: 0, refusals: 0, faults: 0, msTotal: 0, signatures: {}, crashAt: [] }
    for (const b of f.builds) {
      c.builds++; c.msTotal += b.ms
      if (b.kind === 'crash') { c.crashes++; c.crashAt.push(`${f.part ?? 1}:${b.i}`) }
      else if (b.kind === 'refusal') c.refusals++
      else if (b.kind === 'fault') c.faults++
      if (b.signature) c.signatures[b.signature] = (c.signatures[b.signature] ?? 0) + 1
    }
    cells.set(f.cell, c)
  }
  return [...cells.values()].map(c => ({ ...c, crashRate: c.builds ? c.crashes / c.builds : null, interval95: wilson(c.crashes, c.builds), meanMs: c.builds ? Math.round(c.msTotal / c.builds) : null }))
}

const run = ({ cell, builds, outMode, command }) => {
  const root = mkdtempSync(join(tmpdir(), 'fable-probe-'))
  const versions = ['dotnet', ['--version']]
  const sdk = spawnSync(versions[0], versions[1], { encoding: 'utf8' }).stdout?.trim() ?? 'unknown'
  const tools = existsSync('.config/dotnet-tools.json') ? JSON.parse(readFileSync('.config/dotnet-tools.json', 'utf8')).tools?.fable?.version : null
  const out = []
  for (let i = 1; i <= builds; i++) {
    const dir = outMode === 'reuse' ? join(root, 'build') : join(root, `build-${i}`)
    const cmd = (command ?? `dotnet fable src/Laboratory.fsproj --outDir {OUT}`).replaceAll('{OUT}', dir)
    const t = Date.now()
    const r = spawnSync(cmd, { shell: true, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
    const ms = Date.now() - t
    const k = classify(r.status === 0, `${r.stdout ?? ''}\n${r.stderr ?? ''}`)
    out.push({ i, ms, ...k })
    console.log(`  build ${i}/${builds} [${cell}] ${k.kind} ${ms} ms${k.signature ? ` — ${k.signature.slice(0, 120)}` : ''}`)
    if (outMode !== 'reuse') rmSync(dir, { recursive: true, force: true })
  }
  rmSync(root, { recursive: true, force: true })
  return { cell, outMode, sdk, fable: tools ?? null, image: process.env.ImageVersion ?? null, cpus: cpus().length, memGb: Math.round(totalmem() / 2 ** 30), builds: out }
}

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()
  const CRASH = '[31m./src/A.fs(1,1): (1,2) error FSHARP: internal error: Object reference not set to an instance of an object. (code 193)'
  check('a build that works is ok', classify(true, '').kind === 'ok')
  check('MUTATION: the runner\'s real crash line is a crash, and its signature is that line', (() => { const c = classify(false, CRASH); return c.kind === 'crash' && /internal error: Object reference/.test(c.signature) })())
  check('MUTATION: a real diagnostic is a refusal, not a crash', classify(false, './src/B.fs(7,3): (7,9) error FSHARP: Type mismatch (code 1)').kind === 'refusal')
  check('MUTATION: a crash with real-looking diagnostics beside it (the flake\'s mixed shape) is a crash here: the source is known good', classify(false, `${CRASH}\n./src/B.fs(7,3): (7,9) error FSHARP: Lookup on object of indeterminate type (code 72)`).kind === 'crash')
  check('a failure with no diagnostic is a fault', classify(false, 'Killed').kind === 'fault')
  const w0 = wilson(0, 50), w2 = wilson(2, 100)
  check('MUTATION: the interval for 0 crashes in 50 builds tops out at about 7%, not 0', w0.lo === 0 && Math.abs(w0.hi - 0.0713) < 0.001, JSON.stringify(w0))
  check('the interval for 2 in 100 is about 0.5% to 7%', Math.abs(w2.lo - 0.0055) < 0.001 && Math.abs(w2.hi - 0.0700) < 0.001, JSON.stringify(w2))
  check('no builds gives the whole range, not a rate', wilson(0, 0).hi === 1)
  const mk = (cell, part, kinds) => ({ cell, part, sdk: '10.0.1', outMode: 'fresh', builds: kinds.map((kind, i) => ({ i: i + 1, ms: 1000, kind, signature: kind === 'crash' ? 'sig-A' : null })) })
  const merged = mergeCells([mk('a', 1, ['ok', 'crash', 'ok']), mk('a', 2, ['ok', 'ok']), mk('b', 1, ['ok', 'ok', 'ok'])])
  const a = merged.find(c => c.cell === 'a'), b = merged.find(c => c.cell === 'b')
  check('MUTATION: the parts of one cell are summed, with the denominator', a.builds === 5 && a.crashes === 1 && Math.abs(a.crashRate - 0.2) < 1e-9, JSON.stringify(a))
  check('MUTATION: where the crash fell is kept (part:build)', JSON.stringify(a.crashAt) === '["1:2"]' && a.signatures['sig-A'] === 1)
  check('another cell is its own row', b.builds === 3 && b.crashes === 0)
  const dir = mkdtempSync(join(tmpdir(), 'probe-selftest-'))
  try {
    const mark = join(dir, 'm')
    const flaky = `node -e "const fs=require('fs'),p=process.argv[1];let n=fs.existsSync(p)?Number(fs.readFileSync(p,'utf8')):0;fs.writeFileSync(p,String(n+1));if(n===1){console.log('./src/A.fs(1,1): (1,2) error FSHARP: internal error: Object reference not set to an instance of an object. (code 193)');process.exit(1)}" ${mark} {OUT}`
    const r = run({ cell: 't', builds: 4, outMode: 'fresh', command: flaky })
    check('MUTATION: a run of four builds records each, and finds the one that crashed', r.builds.length === 4 && r.builds.filter(x => x.kind === 'crash').map(x => x.i).join() === '2', JSON.stringify(r.builds.map(x => x.kind)))
  } finally { rmSync(dir, { recursive: true, force: true }) }
  finish(summarize())
} else if (isMain(import.meta.url) && arg('--merge')) {
  const dir = arg('--merge')
  const files = readdirSync(dir).filter(f => f.endsWith('.json')).map(f => JSON.parse(readFileSync(join(dir, f), 'utf8')))
  const cells = mergeCells(files)
  const pct = x => `${(x * 100).toFixed(1)}%`
  console.log('\ncell'.padEnd(34) + 'builds'.padStart(7) + 'crashes'.padStart(9) + '   rate (95% interval)')
  for (const c of cells) console.log(`${c.cell.padEnd(33)}${String(c.builds).padStart(7)}${String(c.crashes).padStart(9)}   ${pct(c.crashRate)} (${pct(c.interval95.lo)} to ${pct(c.interval95.hi)})   sdk ${c.sdk}, ${c.outMode}`)
  const out = arg('--out')
  if (out) { mkdirSync(join(out, '..'), { recursive: true }); writeFileSync(out, JSON.stringify({ cells, builds: cells.reduce((n, c) => n + c.builds, 0), crashes: cells.reduce((n, c) => n + c.crashes, 0) }, null, 1) + '\n'); console.log(`\n  wrote ${out}`) }
} else if (isMain(import.meta.url)) {
  const cell = arg('--cell'), builds = Number(arg('--builds')), outMode = arg('--out-mode') ?? 'fresh', out = arg('--out')
  if (!cell || !Number.isInteger(builds) || builds < 1 || !['fresh', 'reuse'].includes(outMode) || !out) {
    console.error('usage: node scripts/fable-crash-probe.mjs --cell NAME --builds N [--out-mode fresh|reuse] --out FILE')
    process.exit(2)
  }
  const part = arg('--part') ? Number(arg('--part')) : 1
  const result = run({ cell, builds, outMode, command: arg('--cmd') })
  mkdirSync(join(out, '..'), { recursive: true })
  writeFileSync(out, JSON.stringify({ ...result, part }, null, 1) + '\n')
  console.log(`\n  wrote ${out}: ${result.builds.length} builds, ${result.builds.filter(b => b.kind === 'crash').length} crash(es)`)
}
