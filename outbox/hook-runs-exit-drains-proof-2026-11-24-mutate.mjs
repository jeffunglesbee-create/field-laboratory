// Rule 90 for the predicates of outbox/hook-runs-exit-drains-proof-2026-11-24.mjs, the harness that shows the
// pre-commit hook's check:exit-drains line refusing a bad commit. That harness decides each case by reading the
// hook's text, and its second run showed a predicate that could not fail for the reason claimed (it matched a clause
// name quoting "pre-commit: ok" and called a refused hook a success). It now tries each predicate on text before any
// commit is attempted. This script breaks each predicate in a COPY of the harness and requires that the copy stops at
// that self-test, naming the clause, before any case runs.
//
// Each anchor is asserted unique, each mutated text asserted to differ, each copy asserted to parse. A variant that
// stops for another reason, or stops without naming its clause, is NOT CAUGHT. The tracked harness is never edited.
//
// Run from the repo root:  node outbox/hook-runs-exit-drains-proof-2026-11-24-mutate.mjs
// Exit 0 only when every variant is caught. About a second: no worktree and no commit is made.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const repo = process.cwd()
const src = path.join(repo, 'outbox', 'hook-runs-exit-drains-proof-2026-11-24.mjs')
const text = fs.readFileSync(src, 'utf8')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-f1-mut-'))
const variants = [
  ['ok back to a substring test',
    "const ok = out => out.trimEnd().split('\\n').pop().trim() === 'pre-commit: ok'",
    'const ok = out => /pre-commit: ok/.test(out)',
    'ok: a hook that quoted the success text and was then refused is not ok'],
  ['early reads the first report line, not the last',
    'return m.length ? Number(m[m.length - 1][1]) : null',
    'return m.length ? Number(m[0][1]) : null',
    'early: the LAST report line wins'],
  ['failLines loses its anchor',
    '/^FAIL\\b/.test(l)',
    '/FAIL\\b/.test(l)',
    'failLines: only a line that STARTS with FAIL'],
  ['early stops reading the count',
    'return m.length ? Number(m[m.length - 1][1]) : null',
    'return m.length ? 0 : null',
    'early: the count is read from the report line'],
]
let caught = 0
try {
  variants.forEach(([name, anchor, replacement, clause], i) => {
    const n = text.split(anchor).length - 1
    if (n !== 1) throw new Error(`${name}: the anchor occurs ${n} times, not once`)
    const mutated = text.replace(anchor, replacement)
    if (mutated === text) throw new Error(`${name}: the mutation changed nothing`)
    const file = path.join(tmp, `mutated-${i}.mjs`)
    fs.writeFileSync(file, mutated)
    const syntax = spawnSync('node', ['--check', file], { encoding: 'utf8' })
    if (syntax.status !== 0) throw new Error(`${name}: the mutated copy does not parse: ${syntax.stderr.slice(0, 200)}`)
    const r = spawnSync('node', [file, '--scratch', path.join(tmp, `scratch-${i}`)], { cwd: repo, encoding: 'utf8' })
    const out = (r.stdout || '') + (r.stderr || '')
    const namesClause = out.includes(clause)
    const stopped = r.status !== 0 && /a predicate does not hold, so no commit is attempted/.test(out) && namesClause
    const beforeAnyCase = !/=== C1/.test(out)
    const hit = stopped && beforeAnyCase
    console.log(`${hit ? 'CAUGHT    ' : 'NOT CAUGHT'}  ${name}  (exit ${r.status}; names its clause: ${namesClause}; before any case: ${beforeAnyCase})`)
    if (!hit) console.log(out.split('\n').slice(0, 12).join('\n'))
    if (hit) caught++
  })
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
}
console.log(`COVERAGE: ${variants.length} variants applied, each anchor unique, each copy parsed; ${caught} of ${variants.length} caught`)
process.exitCode = caught === variants.length ? 0 : 1
