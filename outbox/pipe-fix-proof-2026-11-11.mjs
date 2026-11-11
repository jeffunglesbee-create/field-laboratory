// Proves the shell behaviour of the three steps fixed in fable-crash-probe.yml and mutation-ids-probe.yml: each step's `run:` text is taken from the
// workflow before the change (git show <base>:<file>) and after (the working tree), run under `bash -e` (what Actions uses when a step has no `shell:`),
// with `node` replaced by a shim that exits with FAKE_NODE_EXIT. Before: a throwing script leaves the step at exit 0. After: the step exits with the script's code,
// and a script that succeeds still exits 0. This is the shell behaviour of the step, not a run on Actions.
// Usage: node outbox/pipe-fix-proof-2026-11-11.mjs <base-ref>
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, readFileSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const base = process.argv[2] ?? 'origin/main'
const STEPS = [
  ['.github/workflows/fable-crash-probe.yml', '50 builds'],
  ['.github/workflows/fable-crash-probe.yml', 'The table'],
  ['.github/workflows/mutation-ids-probe.yml', 'What the driver said about each id'],
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

const dir = mkdtempSync(join(tmpdir(), 'pipefix-'))
mkdirSync(join(dir, 'bin'), { recursive: true })
writeFileSync(join(dir, 'bin/node'), '#!/bin/bash\necho "fake node: exiting with ${FAKE_NODE_EXIT}"\nexit ${FAKE_NODE_EXIT}\n')
chmodSync(join(dir, 'bin/node'), 0o755)
writeFileSync(join(dir, 'mutation-shard-1-of-1.json'), '{}')

const exitOf = (script, fake) => spawnSync('bash', ['-e', '-c', script], {
  encoding: 'utf8',
  env: { PATH: `${join(dir, 'bin')}:${process.env.PATH}`, RUNNER_TEMP: dir, GITHUB_STEP_SUMMARY: '/dev/null', FAKE_NODE_EXIT: String(fake) },
}).status

let bad = 0
console.log('step'.padEnd(46), 'script exits 3: before -> after', '   script exits 0: before -> after')
for (const [file, name] of STEPS) {
  const before = runText(execFileSync('git', ['show', `${base}:${file}`], { encoding: 'utf8' }), name).replace(/\$\{\{[^}]*\}\}/g, 'x')
  const after = runText(readFileSync(file, 'utf8'), name).replace(/\$\{\{[^}]*\}\}/g, 'x')
  const f = [exitOf(before, 3), exitOf(after, 3), exitOf(before, 0), exitOf(after, 0)]
  const ok = f[0] === 0 && f[1] === 3 && f[2] === 0 && f[3] === 0
  if (!ok) bad++
  console.log(`${(file.split('/').pop() + ': ' + name).padEnd(46)} ${String(f[0]).padStart(3)} -> ${f[1]}                      ${f[2]} -> ${f[3]}   ${ok ? 'AS EXPECTED' : 'NOT AS EXPECTED'}`)
}
console.log(`\n${STEPS.length} step(s), ${bad} not as expected (expected: before 0, after 3 for a throwing script; 0 and 0 for a script that succeeds)`)
process.exit(bad ? 1 : 0)
