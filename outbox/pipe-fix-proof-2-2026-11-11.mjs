// The shell behaviour of the six steps fixed by docs/CC-CMD-2026-11-11-workflow-pipes-into-tee.md, Task 2. Each step's `run:` text is taken from the workflow
// BEFORE (git show <before-ref>:<file>) and AFTER (<after-ref>, default the working tree), run under `bash -e` (what Actions uses when a step has no `shell:`)
// with the tool the script runs replaced by a shim that exits FAKE (node: unless it is asked for --self-test, which passes; dotnet: always). Expected: BEFORE the
// step exits 0 over a tool that exits 3; AFTER it exits 3; with a tool that succeeds both exit 0. It is the shell behaviour of the step, not a run on Actions.
// Usage: node outbox/pipe-fix-proof-2-2026-11-11.mjs <before-ref> [<after-ref>]     (after-ref = before-ref is the mutation: the fix absent, which must go red)
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, readFileSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [before, after] = [process.argv[2] ?? 'origin/main', process.argv[3] ?? null]
const STEPS = [
  ['.github/workflows/alternate-colour-probe.yml', 'Probe', 'node'],
  ['.github/workflows/alternate-colour-probe.yml', 'Why the remaining cards stay plain', 'node'],
  ['.github/workflows/alternate-colour-probe.yml', 'Spellings that resolve to nothing', 'node'],
  ['.github/workflows/favourite-band-census.yml', 'Census', 'node'],
  ['.github/workflows/open-meteo-egress-probe.yml', 'Probe', 'node'],
  ['.github/workflows/verify.yml', 'Fail on any F# compiler warning', 'dotnet'],
]

const runText = (yaml, name) => {
  const lines = yaml.split('\n')
  const at = lines.findIndex(l => l.trim() === `- name: ${name}`)
  if (at < 0) throw new Error(`no step named ${name}`)
  const indent = /^(\s*)/.exec(lines[at])[1].length
  for (let i = at + 1; i < lines.length; i++) {
    if (new RegExp(`^\\s{${indent}}- `).test(lines[i])) break
    const m = /^(\s*)run:\s*(.*)$/.exec(lines[i])
    if (!m) continue
    if (!/^[|>]/.test(m[2])) return m[2]
    const body = []
    for (let j = i + 1; j < lines.length; j++) { if (lines[j].trim() === '' || /^(\s*)/.exec(lines[j])[1].length > m[1].length) body.push(lines[j]); else break }
    return body.join('\n')
  }
  throw new Error(`step ${name} has no run:`)
}
const atRef = (ref, file) => (ref ? execFileSync('git', ['show', `${ref}:${file}`], { encoding: 'utf8' }) : readFileSync(file, 'utf8'))

const dir = mkdtempSync(join(tmpdir(), 'pipefix2-'))
mkdirSync(join(dir, 'bin'))
mkdirSync(join(dir, 'outbox')) // the checkout has one; without it `tee outbox/x` fails in every scenario and the table says nothing
const shim = (name, body) => { writeFileSync(join(dir, 'bin', name), `#!/bin/bash\n${body}\n`); chmodSync(join(dir, 'bin', name), 0o755) }
shim('node', 'case "$*" in *--self-test*) exit 0;; esac\necho "fake node: exiting with ${FAKE_EXIT}"\nexit ${FAKE_EXIT}')
shim('dotnet', 'echo "fake dotnet: exiting with ${FAKE_EXIT}"\nexit ${FAKE_EXIT}')
shim('curl', 'exit 0')
shim('sleep', 'exit 0')

const exitOf = (script, fake) => spawnSync('bash', ['-e', '-c', script], {
  encoding: 'utf8', cwd: dir,
  env: { PATH: `${join(dir, 'bin')}:${process.env.PATH}`, FAKE_EXIT: String(fake), GITHUB_STEP_SUMMARY: '/dev/null' },
}).status

let bad = 0
console.log('step'.padEnd(66), 'tool exits 3: before -> after', '  tool exits 0: before -> after')
for (const [file, name] of STEPS) {
  const get = ref => runText(atRef(ref, file), name).replace(/\$\{\{[^}]*\}\}/g, 'x')
  const b = get(before)
  const a = get(after)
  const f = [exitOf(b, 3), exitOf(a, 3), exitOf(b, 0), exitOf(a, 0)]
  const ok = f[0] === 0 && f[1] === 3 && f[2] === 0 && f[3] === 0
  if (!ok) bad++
  console.log(`${(file.split('/').pop() + ': ' + name).padEnd(66)} ${f[0]} -> ${f[1]}                       ${f[2]} -> ${f[3]}   ${ok ? 'AS EXPECTED' : 'NOT AS EXPECTED'}`)
}
console.log(`\n${STEPS.length} step(s), ${bad} not as expected (expected: before 0, after 3 for a failing tool; 0 and 0 for a tool that succeeds)`)
process.exit(bad ? 1 : 0)
