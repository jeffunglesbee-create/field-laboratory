#!/usr/bin/env node
// Does THIS commit pair its source change with an outbox entry?
//
// scripts/history-check.mjs asks the same question of every commit already in
// history, and it is settled at commit time by design — no later entry pairs
// with an earlier commit. That makes it a report, not a guard: by the time it
// speaks, the violation is permanent and the only remedy left is moving the
// boundary in docs/history-boundary.txt.
//
// That boundary has now moved twice in seven days (2026-08-17, 2026-08-23), and
// its own last entry says what to do about a third time:
//
//   "a boundary moved twice in seven days is a mechanism being leaned on. If it
//    moves a third time, the question stops being 'absorb it' and starts being
//    'why does source keep shipping without its entry'."
//
// The answer measured on 2026-08-23: .githooks/pre-commit exists and is good,
// and `git config core.hooksPath .githooks` was never set in that session, so
// the gate that should have caught three consecutive commits was not installed.
// Not forgetfulness — an opt-in guard that nothing opted into.
//
// So this is the same rule as history-check, moved to the only moment it can
// still be acted on: before the commit exists.
//
// --self-test runs the classifier against fixtures and touches no git state.

import { execSync } from 'node:child_process'

const SOURCE = /^(src\/|scripts\/)/
const OUTBOX = /^outbox\//

/// Identical wording to history-check.mjs's own predicate, deliberately: two
/// checks that disagree about what a violation is are worse than one.
export const isViolation = (files) =>
  files.some(f => SOURCE.test(f)) && !files.some(f => OUTBOX.test(f))

if (process.argv.includes('--self-test')) {
  let pass = 0, fail = 0
  const t = (name, got, want) => {
    const ok = got === want
    ok ? pass++ : fail++
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  }
  t('source without outbox is a violation', isViolation(['src/Desk.fs']), true)
  t('source WITH outbox is not', isViolation(['src/Desk.fs', 'outbox/note.md']), false)
  t('outbox alone is not a violation', isViolation(['outbox/note.md']), false)
  t('docs alone is not a violation', isViolation(['docs/x.md']), false)
  t('scripts/ counts as source', isViolation(['scripts/foo.mjs']), true)
  t('a workflow alone is not source', isViolation(['.github/workflows/x.yml']), false)
  t('nothing staged is not a violation', isViolation([]), false)
  // The exact shape that got through on 2026-08-23: a new script plus the
  // workflow that runs it, no entry.
  t('script + workflow with no entry is a violation',
    isViolation(['scripts/sport-vocabulary-check.mjs', '.github/workflows/drift-sentinel.yml']), true)
  console.log(`\n${pass}/${pass + fail} checks passed`)
  process.exit(fail ? 1 : 0)
}

const staged = execSync('git diff --cached --name-only', { encoding: 'utf8' })
  .split('\n').map(s => s.trim()).filter(Boolean)

if (!isViolation(staged)) {
  console.log(`ok — ${staged.length} staged path(s), source is paired or absent`)
  process.exit(0)
}

console.error('staged source with no outbox entry:\n')
for (const f of staged.filter(f => SOURCE.test(f))) console.error(`  ${f}`)
console.error(`
This commit would be a permanent check:history violation. That rule is settled
at commit time — a later outbox entry does not pair with it, and the only
remedy afterwards is moving docs/history-boundary.txt, which has moved twice
in seven days already.

Stage an outbox/ entry describing the change, or split the source out of this
commit. To override deliberately: git commit --no-verify, and say why in the
message.`)
process.exit(1)
