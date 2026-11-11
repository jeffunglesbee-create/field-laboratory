#!/usr/bin/env node
// Rule 90: the self-test of scripts/build-steady.mjs must go red when the clearing is broken. Each mutation is applied to a COPY of scripts/, its anchor is
// asserted to occur exactly once and to have changed the file, and the self-test is run on the copy. A mutation that does not turn the self-test red is printed
// NOT CAUGHT and the script exits 1. Run: node outbox/build-steady-clean-sweep-2026-11-11.mjs
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const MUTATIONS = [
  { name: 'the repeat clears nothing (the defect)', file: 'mutation-lib.mjs', from: 'if (runs++ > 0) clean()', to: 'if (runs++ > 99) clean()' },
  { name: 'the output is cleared before the FIRST build too', file: 'mutation-lib.mjs', from: 'if (runs++ > 0) clean()', to: 'if (runs++ >= 0) clean()' },
  { name: 'the default command clears no directory', file: 'build-steady.mjs', from: "cleanArg ?? (cmdArg === undefined ? 'build' : undefined)", to: 'cleanArg ?? undefined' },
  { name: 'a custom --cmd clears `build` by default', file: 'build-steady.mjs', from: "cleanArg ?? (cmdArg === undefined ? 'build' : undefined)", to: "cleanArg ?? 'build'" },
  { name: 'the command line never passes a clear function', file: 'build-steady.mjs', from: 'cleanDir ? () => rmSync(cleanDir, { recursive: true, force: true }) : undefined)', to: 'undefined)' },
  { name: 'the command line ignores --clean', file: 'build-steady.mjs', from: 'cleanDirFor(arg(\'--cmd\'), arg(\'--clean\'))', to: 'cleanDirFor(arg(\'--cmd\'), undefined)' },
  { name: 'the clear removes the wrong directory', file: 'build-steady.mjs', from: '() => rmSync(cleanDir, { recursive: true, force: true })', to: "() => rmSync(cleanDir + '-x', { recursive: true, force: true })" },
]

const here = new URL('..', import.meta.url).pathname
let caught = 0
const clean = spawnSync(process.execPath, [join(here, 'scripts/build-steady.mjs'), '--self-test'], { encoding: 'utf8' })
console.log(`unmutated: exit ${clean.status}, ${(clean.stdout.match(/(\d+)\/(\d+) checks passed/) ?? [])[0] ?? 'no summary'}`)
if (clean.status !== 0) { console.log('the unmutated self-test is not green: nothing to sweep'); process.exit(1) }
for (const m of MUTATIONS) {
  const dir = mkdtempSync(join(tmpdir(), 'bsweep-'))
  cpSync(join(here, 'scripts'), join(dir, 'scripts'), { recursive: true })
  cpSync(join(here, 'package.json'), join(dir, 'package.json'))
  const f = join(dir, 'scripts', m.file)
  const src = readFileSync(f, 'utf8')
  const n = src.split(m.from).length - 1
  if (n !== 1) { console.log(`ANCHOR  ${m.name}: the anchor occurs ${n} times, not once`); process.exit(1) }
  const out = src.replace(m.from, () => m.to)
  if (out === src) { console.log(`NOOP    ${m.name}: the mutation changed nothing`); process.exit(1) }
  writeFileSync(f, out)
  const r = spawnSync(process.execPath, [join(dir, 'scripts/build-steady.mjs'), '--self-test'], { encoding: 'utf8', cwd: dir })
  const failed = (r.stdout.match(/^FAIL .*$/gm) ?? []).length
  const ok = r.status !== 0 && failed > 0
  if (ok) caught++
  console.log(`${ok ? 'CAUGHT    ' : 'NOT CAUGHT'}  ${m.name}  (exit ${r.status}, ${failed} failing check(s))`)
  rmSync(dir, { recursive: true, force: true })
}
console.log(`\ncaught ${caught} of ${MUTATIONS.length} mutations`)
process.exit(caught === MUTATIONS.length ? 0 : 1)
