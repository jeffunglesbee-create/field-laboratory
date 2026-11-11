#!/usr/bin/env node
// The real compiler, not the stand-in of the self-test: scripts/build-steady.mjs repeats a crashed `dotnet fable` build, and the output it ends with is the
// good one only when the output directory is cleared before the repeat.
//
// The crash cannot be summoned (1 in 100 builds on a runner), so the first attempt of each arm is a REAL full compile that is then spoiled the way the runner
// showed: Fable's output complete in build/ with one generated file wrong, the compiler's crash line printed, exit 1. The repeat is the real thing in both arms.
// Arm A: build-steady with --clean (what the workflows now do). Arm B: build-steady with no --clean (what they did). The digest is the sha256 of every generated
// .js outside fable_modules, in path order; GOOD is a fresh compile into an empty directory.
// Run from the repo root: node outbox/build-steady-real-fable-proof-2026-11-11.mjs
import { mkdtempSync, writeFileSync, readdirSync, readFileSync, existsSync, rmSync, statSync, chmodSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = process.cwd()
const tmp = mkdtempSync(join(tmpdir(), 'bsreal-'))
const digest = dir => {
  const files = []
  const walk = d => { for (const e of readdirSync(d).sort()) { const p = join(d, e); if (statSync(p).isDirectory()) { if (e !== 'fable_modules') walk(p) } else if (p.endsWith('.js')) files.push(p) } }
  walk(dir)
  const h = createHash('sha256'); for (const f of files) h.update(readFileSync(f)); return h.digest('hex').slice(0, 16)
}
const compile = out => spawnSync('dotnet', ['fable', 'src/Laboratory.fsproj', '--outDir', out], { cwd: root, encoding: 'utf8' })

const good = join(tmp, 'good')
let r = compile(good)
if (r.status !== 0) { console.log('the reference compile failed:', r.stdout.slice(-400)); process.exit(1) }
const GOOD = digest(good)
console.log(`GOOD   fresh compile into an empty directory: ${GOOD}`)

// The wrapper: a real compile, then (the first time only) spoil it like the crashed build and exit 1.
const wrap = join(tmp, 'wrap.sh')
writeFileSync(wrap, `#!/bin/bash
out="$1"; mark="$2"
dotnet fable src/Laboratory.fsproj --outDir "$out" || exit $?
if [ ! -e "$mark" ]; then
  touch "$mark"
  printf '// crashed partial output\\n' > "$out/Bdb.js"
  echo './src/Journalism.fs(310,5): (310,36) error FSHARP: internal error: Object reference not set to an instance of an object. (code 193)'
  exit 1
fi
`)
chmodSync(wrap, 0o755)

const arm = (name, extra) => {
  const out = join(tmp, `out-${name}`), mark = join(tmp, `mark-${name}`)
  const c = spawnSync(process.execPath, ['scripts/build-steady.mjs', '--cmd', `${wrap} ${out} ${mark}`, '--pause', '0', ...(extra ? ['--clean', out] : [])], { cwd: root, encoding: 'utf8' })
  const skipped = /Skipped compilation/.test(c.stdout)
  const d = digest(out)
  console.log(`${name.padEnd(6)} build-steady exit ${c.status}; repeat ${skipped ? 'SKIPPED compilation' : 'compiled'}; ${/clearing/.test(c.stdout) ? 'cleared the output first' : 'cleared nothing'}; digest ${d}; ${d === GOOD ? 'EQUALS good' : 'DIFFERS from good'}`)
  return { status: c.status, skipped, d }
}
const A = arm('clean', true)
const B = arm('noclean', false)
rmSync(tmp, { recursive: true, force: true })
const ok = A.status === 0 && !A.skipped && A.d === GOOD && B.status === 0 && B.skipped && B.d !== GOOD
console.log(ok
  ? '\nPASS  with the output cleared the repeat compiles and ends on the good build; without it the repeat reports success on the spoiled output (the gate failure, reproduced with the real compiler)'
  : '\nFAIL  the two arms did not behave as the defect and its fix require')
process.exit(ok ? 0 : 1)
