// Rule 90 for the predicates of outbox/exit-budget-advice-proof-2026-11-25.mjs, the harness that shows what the equality clause of
// scripts/check-exit-drains.mjs tells a person it has refused and whether doing what it says leaves a passing hook. That harness decides each
// case by reading text (the hook's last line, a count, the detail under a named FAIL line, the tokens a message holds), and a predicate that
// cannot fail for the reason claimed makes a case pass for nothing: the earlier harness of this kind (outbox/hook-runs-exit-drains-proof-2026-11-24.mjs)
// called a refused hook a success because its test was a substring test. The harness tries each predicate on text before any worktree is made.
// This script breaks each predicate in a COPY of the harness and requires that the copy stops at that self-test, naming the clause, before any case.
//
// Each anchor is asserted unique, each mutated text asserted to differ, each copy asserted to parse. A variant that stops for another reason, or
// stops without naming its clause, is NOT CAUGHT. The tracked harness is never edited.
//
// Run from the repo root:  node outbox/exit-budget-advice-proof-2026-11-25-mutate.mjs
// Exit 0 only when every variant is caught. About ten seconds: no worktree and no commit is made.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const repo = process.cwd()
const src = path.join(repo, 'outbox', 'exit-budget-advice-proof-2026-11-25.mjs')
const text = fs.readFileSync(src, 'utf8')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'budget-advice-mut-'))
const variants = [
  ['ok back to a substring test',
    "const ok = o => o.trimEnd().split('\\n').pop().trim() === 'pre-commit: ok'",
    'const ok = o => /pre-commit: ok/.test(o)',
    'ok: a hook that quoted the success text and was then refused is not ok'],
  ['early reads the first report line, not the last',
    'return m.length ? Number(m[m.length - 1][1]) : null',
    'return m.length ? Number(m[0][1]) : null',
    'early: the LAST report line wins'],
  ['failLines loses its anchor',
    '.filter(l => /^FAIL\\b/.test(l))',
    '.filter(l => /FAIL\\b/.test(l))',
    'failLines: only a line that STARTS with FAIL'],
  ['detailOf takes the first FAIL, whatever its name',
    '/^FAIL\\b/.test(l.trim()) && nameRe.test(l)',
    '/^FAIL\\b/.test(l.trim())',
    'detailOf: the detail of the NAMED clause, not the first FAIL'],
  ['has needs only one token',
    'const has = (text, tokens) => text !== null && tokens.every(t => text.includes(t))',
    'const has = (text, tokens) => text !== null && tokens.some(t => text.includes(t))',
    'has: every token must be present'],
  ['lacks forbids only one token',
    'const lacks = (text, tokens) => text !== null && tokens.every(t => !text.includes(t))',
    'const lacks = (text, tokens) => text !== null && tokens.some(t => !text.includes(t))',
    'lacks: no token may be present'],
  ['lacks passes a detail that is not there',
    'const lacks = (text, tokens) => text !== null && tokens.every(t => !text.includes(t))',
    'const lacks = (text, tokens) => text === null || tokens.every(t => !text.includes(t))',
    'lacks: a missing detail is not "lacks"'],
  ['counts swaps pass and total',
    'return m ? [Number(m[1]), Number(m[2])] : null',
    'return m ? [Number(m[2]), Number(m[1])] : null',
    'counts: the first N/M line is read, pass before total'],
]
let caught = 0
try {
  variants.forEach(([name, anchor, replacement, clause], i) => {
    const n = text.split(anchor).length - 1
    if (n !== 1) throw new Error(`${name}: the anchor occurs ${n} times, not once`)
    const mutated = text.replace(anchor, () => replacement)
    if (mutated === text) throw new Error(`${name}: the mutation changed nothing`)
    const file = path.join(tmp, `mutated-${i}.mjs`)
    fs.writeFileSync(file, mutated)
    const syntax = spawnSync('node', ['--check', file], { encoding: 'utf8' })
    if (syntax.status !== 0) throw new Error(`${name}: the mutated copy does not parse: ${syntax.stderr.slice(0, 200)}`)
    const r = spawnSync('node', [file, '--scratch', path.join(tmp, `scratch-${i}`)], { cwd: repo, encoding: 'utf8' })
    const out = (r.stdout || '') + (r.stderr || '')
    const namesClause = out.includes(clause)
    const stopped = r.status !== 0 && /a predicate does not hold, so no commit is attempted/.test(out) && namesClause
    const beforeAnyCase = !/=== A\d/.test(out)
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
