#!/usr/bin/env node
// Rule 90: the browser-install checks of scripts/workflow-check.mjs must go red when the code under them is broken. Each mutation is applied to a COPY of
// scripts/, its anchor is asserted to occur exactly once and to have changed the file, and the copy is run from the repository root (the real-tree audit reads
// .github/ from the working directory). A mutation that leaves the check green is printed NOT CAUGHT and the script exits 1. Run from the repository root:
//   node outbox/install-guard-sweep-2026-11-11.mjs
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const FILE = 'workflow-check.mjs'
const MUTATIONS = [
  ['install-deps is not apt', "m[1] === 'install-deps' || /(?:^|\\s)--with-deps\\b/.test(m[2])", '/(?:^|\\s)--with-deps\\b/.test(m[2])'],
  ['--with-deps is read only at the start of the arguments', '/(?:^|\\s)--with-deps\\b/.test(m[2])', '/^\\s*--with-deps\\b/.test(m[2])'],
  ['the limit is 50 minutes, not 5', 'export const MAX_INSTALL_SECONDS = 300', 'export const MAX_INSTALL_SECONDS = 3000'],
  ['a step timeout of zero counts', 'stepMinutes !== null && stepMinutes > 0 && stepMinutes <= MAX_INSTALL_SECONDS', 'stepMinutes !== null && stepMinutes <= MAX_INSTALL_SECONDS'],
  ['a composite step is bounded by a key it cannot carry', "const stepMinutes = !composite && /^", "const stepMinutes = /^"],
  ['a backslash-continued install is read line by line', "bare.replace(/\\\\\\n\\s*/g, ' ')", 'bare'],
  ['quotes are kept, so an echoed install is an install', 'const { bare } = shellViews(step.script)\n  const joined', 'const { code: bare } = shellViews(step.script)\n  const joined'],
  ['the arguments run on past the end of the line', 'playwright(?:-core)?\\s+(install-deps|install)\\b([^\\n;&|]*)', 'playwright(?:-core)?\\s+(install-deps|install)\\b([^;&|]*)'],
  ['timeout 0 (disabled) counts as a bound', 'if (seconds > 0) found.push(seconds)', 'found.push(seconds)'],
  ['timeout -k 10 3m: the option argument is read as the duration', "i += toks[i] === '-k' || toks[i] === '-s' ? 2 : 1", 'i += 1'],
  ['3m is read as three seconds', "m: 60, h: 3600", "m: 1, h: 3600"],
  ['an install the step reader missed is not reported', 'if (wanted !== here.length) missed.push', 'if (false) missed.push'],
  ['a comment line counts as an install command', ".filter(l => !/^\\s*#/.test(l)).join('\\n').match(", ".join('\\n').match("],
  ['composite actions are not read', "if (existsSync(`${root}/.github/actions`)) {", "if (false) {"],
]

const here = new URL('..', import.meta.url).pathname
const run = dir => spawnSync(process.execPath, [join(dir, 'scripts', FILE)], { encoding: 'utf8', cwd: here, maxBuffer: 64 * 1024 * 1024 })
const fails = out => (out.match(/^FAIL .*$/gm) ?? []).length
const clean = run(here)
console.log(`unmutated: exit ${clean.status}, ${fails(clean.stdout)} failing check(s), ${(clean.stdout.match(/(\d+)\/(\d+) checks passed/) ?? [])[0] ?? 'no summary'}`)
if (clean.status !== 0) { console.log('the unmutated check is not green: nothing to sweep'); process.exit(1) }
let caught = 0
for (const [name, from, to] of MUTATIONS) {
  const dir = mkdtempSync(join(tmpdir(), 'iguard-'))
  cpSync(join(here, 'scripts'), join(dir, 'scripts'), { recursive: true })
  const f = join(dir, 'scripts', FILE)
  const src = readFileSync(f, 'utf8')
  const n = src.split(from).length - 1
  if (n !== 1) { console.log(`ANCHOR  ${name}: the anchor occurs ${n} times, not once`); process.exit(1) }
  const out = src.replace(from, () => to)
  if (out === src) { console.log(`NOOP    ${name}: the mutation changed nothing`); process.exit(1) }
  writeFileSync(f, out)
  const r = run(dir)
  const failed = fails(r.stdout)
  const ok = r.status !== 0 && failed > 0
  if (ok) caught++
  const names = (r.stdout.match(/^FAIL .*$/gm) ?? []).slice(0, 2).map(l => l.slice(5, 70)).join(' | ')
  console.log(`${ok ? 'CAUGHT    ' : 'NOT CAUGHT'}  ${name}  (exit ${r.status}, ${failed} failing: ${names})`)
  rmSync(dir, { recursive: true, force: true })
}
console.log(`\ncaught ${caught} of ${MUTATIONS.length} mutations`)
process.exit(caught === MUTATIONS.length ? 0 : 1)
