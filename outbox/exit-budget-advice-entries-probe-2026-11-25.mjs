// Which clause of `scripts/check-exit-drains.mjs --self-test` catches each `exit-advice-*` entry of scripts/mutation-check.mjs, and what that clause printed.
//
// The framework (`node scripts/mutation-check.mjs --ids ...`) says an entry is CAUGHT when its expectation fails. It does not say WHICH clause failed, and an entry
// that is caught by a clause other than the one it exists for proves the wrong thing (Rule 90). This takes each entry's find/replace out of the table by evaluating
// its object literal, so nothing is re-typed, asserts the anchor is unique in the target and the mutated text differs, applies it to a COPY of the script beside the
// original, checks that the copy parses, runs the copy's --self-test, and prints every FAIL line with the detail under it.
//
// The control comes first: the unmutated copy must pass 26/26 with no FAIL line, or nothing below means anything. An entry counts as caught only when exactly one clause
// fails. The list of ids is checked against the table, so an entry added later is not skipped silently.
//
// Run it from the ROOT OF A SCRATCH WORKTREE (it writes one temporary file into scripts/ and removes it in a `finally`; a kill in between would leave that file):
//   git worktree add --detach <dir> <rev> && cd <dir> && node outbox/exit-budget-advice-entries-probe-2026-11-25.mjs
// Exit 0 only when the control passes and every entry is caught by exactly one clause. About ten seconds.
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'

const IDS = [
  'exit-advice-drops-the-second-file',
  'exit-advice-tells-a-grown-count-to-lower',
  'exit-advice-for-a-grown-count-hands-over-the-recipe',
  'exit-advice-missing-budget-unhandled',
  'exit-advice-for-an-equal-budget',
]
const table = fs.readFileSync('scripts/mutation-check.mjs', 'utf8')
const src = fs.readFileSync('scripts/check-exit-drains.mjs', 'utf8')
const inTable = table.split("id: 'exit-advice-").length - 1
if (inTable !== IDS.length) throw new Error(`the table holds ${inTable} exit-advice entries and this probe lists ${IDS.length}`)

const entryOf = id => {
  const at = table.indexOf(`id: '${id}',`)
  if (at < 0 || table.indexOf(`id: '${id}',`, at + 1) >= 0) throw new Error(`${id}: not exactly one entry`)
  const end = table.indexOf('\n  },\n', at)
  return new Function(`return ({ ${table.slice(at, end)} })`)()
}
const selfTest = file => {
  const r = spawnSync('node', [file, '--self-test'], { encoding: 'utf8' })
  const o = (r.stdout || '') + (r.stderr || '')
  return {
    status: r.status,
    fails: o.split('\n').filter(l => /^FAIL\b/.test(l)).map(l => l.slice(0, 120)),
    details: o.split('\n').filter(l => /^\s+→/.test(l)).map(l => l.trim()),
    tail: (o.match(/(\d+)\/(\d+) checks passed/) || [])[0] ?? o.trim().split('\n').slice(-3).join(' | '),
  }
}

const COPY = 'scripts/check-exit-drains.mutant.mjs'
let bad = 0
try {
  fs.writeFileSync(COPY, src)
  const c = selfTest(COPY)
  console.log(`control (unmutated copy): exit ${c.status}, ${c.tail}, ${c.fails.length} FAIL`)
  if (c.status !== 0 || c.fails.length || c.tail !== '26/26 checks passed') throw new Error('the control copy is not 26/26 with no FAIL line, so nothing below means anything')
  for (const id of IDS) {
    const e = entryOf(id)
    if (e.file !== 'scripts/check-exit-drains.mjs') throw new Error(`${id}: targets ${e.file}`)
    const n = src.split(e.find).length - 1
    if (n !== 1) throw new Error(`${id}: the anchor occurs ${n} times`)
    const mutated = src.replace(e.find, () => e.replace)
    if (mutated === src) throw new Error(`${id}: the mutation changed nothing`)
    fs.writeFileSync(COPY, mutated)
    const parses = spawnSync('node', ['--check', COPY], { encoding: 'utf8' }).status === 0
    const m = selfTest(COPY)
    console.log(`${id}\n  parses: ${parses}; self-test exit ${m.status}; ${m.tail}\n  clauses that fail:\n${m.fails.map(f => `    ${f}`).join('\n') || '    (none)'}\n  the detail the clause printed:\n${m.details.map(d => `    ${d}`).join('\n') || '    (none)'}`)
    if (!parses || m.status === 0 || m.fails.length !== 1) bad++
  }
} finally {
  fs.rmSync(COPY, { force: true })
}
console.log(`COVERAGE: ${IDS.length} entries read from the table (the table holds ${inTable}), each anchor unique, each mutated copy parsed, each caught by exactly one clause: ${IDS.length - bad} of ${IDS.length}`)
process.exitCode = bad === 0 ? 0 : 1
