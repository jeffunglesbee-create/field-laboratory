// Rule 90 for outbox/exit-budget-advice-entries-probe-2026-11-25.mjs, the probe that says which clause of `scripts/check-exit-drains.mjs --self-test` catches each
// `exit-advice-*` entry of scripts/mutation-check.mjs. A probe that has only ever printed "5 of 5" has not been shown able to print anything else.
//
// This breaks the probe's INPUT four ways in a scratch worktree and requires the probe to fail each time: its control copy broken (the control must be 26/26), an entry
// whose anchor is not unique, an entry caught by more than one clause, and an entry caught by none. A control case with no edit comes first and must pass. Every anchor
// this script uses is asserted unique and every edit asserted to change the text. The two scripts are restored from the main tree before every case and after the last.
//
// Run it from the ROOT OF A SCRATCH WORKTREE that holds the final scripts and the probe, with RESTORE_FROM naming the main tree root (the tree that is NOT edited):
//   RESTORE_FROM=/path/to/main/tree node outbox/exit-budget-advice-entries-probe-2026-11-25-mutate.mjs
// Exit 0 only when every case behaves as expected and the probe passes on the restored scripts. About one minute.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const FROM = process.env.RESTORE_FROM
if (!FROM) throw new Error('set RESTORE_FROM to the main tree root')
const PROBE = 'outbox/exit-budget-advice-entries-probe-2026-11-25.mjs'
const CHECK = 'scripts/check-exit-drains.mjs'
const TABLE = 'scripts/mutation-check.mjs'
const restore = () => { for (const f of [CHECK, TABLE]) fs.copyFileSync(path.join(FROM, f), f) }
const once = (text, find, what) => {
  const n = text.split(find).length - 1
  if (n !== 1) throw new Error(`${what}: the anchor occurs ${n} times, not once`)
}
const editFile = (file, find, rep) => {
  const t = fs.readFileSync(file, 'utf8'); once(t, find, `${file} ${JSON.stringify(find).slice(0, 50)}`)
  const m = t.replace(find, () => rep); if (m === t) throw new Error(`${file}: nothing changed`); fs.writeFileSync(file, m)
}
// edit one property of one table entry, inside that entry's own text only
const editEntry = (id, find, rep) => {
  const t = fs.readFileSync(TABLE, 'utf8'); const at = t.indexOf(`id: '${id}',`); if (at < 0) throw new Error(`no entry ${id}`)
  const end = t.indexOf('\n  },\n', at); const slice = t.slice(at, end); once(slice, find, `entry ${id} ${JSON.stringify(find).slice(0, 50)}`)
  const m = slice.replace(find, () => rep); if (m === slice) throw new Error(`entry ${id}: nothing changed`)
  fs.writeFileSync(TABLE, t.slice(0, at) + m + t.slice(end))
}
const runProbe = () => {
  const r = spawnSync('node', [PROBE], { encoding: 'utf8' }); const o = (r.stdout || '') + (r.stderr || '')
  return { status: r.status, out: o, lines: o.split('\n').filter(l => /^(control|Error:|COVERAGE)|parses: false|\(none\)|^    FAIL/.test(l)).map(l => l.slice(0, 190)) }
}
const cases = [
  ['CONTROL  no edit: the probe passes', () => {}, r => r.status === 0 && /5 of 5$/.test(r.out.trim().split('\n').pop())],
  ['D1  the control copy is itself broken (budgetAdvice returns "x" for an equal budget)', () => editFile(CHECK, "  return ''\n}", "  return 'x'\n}"),
    r => r.status !== 0 && /the control copy is not 26\/26/.test(r.out)],
  ['D2  an entry whose anchor is not unique (exit-advice-for-an-equal-budget finds "  return")', () => editEntry('exit-advice-for-an-equal-budget', "find: \"  return ''\\n}\",", 'find: "  return",'),
    r => r.status !== 0 && /the anchor occurs \d+ times/.test(r.out)],
  ['D3  an entry caught by more than one clause (exit-advice-drops-the-second-file empties every advice)', () => {
    editEntry('exit-advice-drops-the-second-file', "find: ', and set find: \"${count}\" on the ${LOOSE_ENTRY} entry in ${MUTATION_PATH}, which pins the number`',", "find: 'export const budgetAdvice = (count, budget) => {',")
    editEntry('exit-advice-drops-the-second-file', "replace: '`',", "replace: \"export const budgetAdvice = (count, budget) => ''\\nconst unusedAdvice = (count, budget) => {\",")
  }, r => r.status !== 0 && /caught by exactly one clause: 4 of 5/.test(r.out)],
  ['D4  an entry that is not caught at all (exit-advice-for-an-equal-budget changes a docblock phrase, nothing that runs)', () => {
    editEntry('exit-advice-for-an-equal-budget', "find: \"  return ''\\n}\",", "find: 'An equal budget has nothing to say, and says it.',")
    editEntry('exit-advice-for-an-equal-budget', "replace: \"  return 'x'\\n}\",", "replace: 'An equal budget has nothing to say.',")
  }, r => r.status !== 0 && /caught by exactly one clause: 4 of 5/.test(r.out) && /\(none\)/.test(r.out)],
]
let wrong = 0
try {
  for (const [name, apply, expected] of cases) {
    restore(); apply()
    const r = runProbe(); const ok = expected(r)
    console.log(`${ok ? 'AS EXPECTED    ' : 'NOT AS EXPECTED'}  ${name}\n   probe exit ${r.status}\n${r.lines.map(l => `   ${l}`).join('\n')}`)
    if (!ok) wrong++
  }
} finally {
  restore()
}
const last = runProbe()
console.log(`restored; the probe on the unedited scripts: exit ${last.status}, ${last.lines.pop()}`)
console.log(`COVERAGE: ${cases.length} cases ran (one control and ${cases.length - 1} broken inputs); ${cases.length - wrong} behaved as expected`)
process.exitCode = wrong === 0 && last.status === 0 ? 0 : 1
