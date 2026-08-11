// The confidence gate's rows: what is measured, and by which command.
//
// Split out of `confidence.mjs` so the row set can be READ without running the
// gate. A Claude chat session reviewing this repo ran `gate-inventory.mjs`
// standalone, edited a real row out of `docs/gate-rows.txt`, and correctly
// observed that the output did not change — the standalone script was
// exercising its own synthetic fixtures, and only the full gate compared the
// live files. That is a real gap: whoever runs the guard alone is usually the
// one checking whether it works, and they got a reassuring answer that meant
// nothing.
//
// Their constraints matter more than the finding, because they will recur.
// Reviewing through the GitHub file API means no `git log`, and no .NET means
// the full gate cannot be run at all. Guards in this repo should be checkable
// under exactly those limits.
//
// The rows now live here, importable on their own. `gate-inventory.mjs`
// standalone compares the real inventory against the real rows, and needs no
// .NET, no browser, and no build to do it.

import { execSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { fieldDay } from './checks.mjs'

/**
 * The FIELD day this gate run began, captured ONCE.
 *
 * `outboxToday` used to call `fieldDay()` at row-evaluation time. CI run
 * 31456294086 started at 23:44 ET on 2026-08-10 and the outbox row evaluated at
 * 00:01 ET on the 11th — the day rolled over mid-run, and the row failed a
 * commit whose outbox was correctly dated for the day the run started.
 *
 * The row was right about its rule and wrong about which day it was asking
 * about. Same fix as `gameStateAt` and `zone-check`'s NOW: capture the instant
 * once, then be pure. A gate that answers differently depending on how long its
 * own earlier rows took is not deciding about the work.
 */
const GATE_DAY = fieldDay()

const ok = cmd => {
  try {
    execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' })
    return true
  } catch {
    return false
  }
}

/** Passes when the command FAILS — for asserting a guard still has teeth. */
const fails = cmd => !ok(cmd)

/**
 * An outbox entry dated today, so a session cannot skip its own write-up.
 *
 * Two things were wrong with the first version, both found by outside review.
 *
 * It computed today as `new Date().toISOString().slice(0, 10)` — UTC. In a repo
 * that spent a day making the viewer's day a type, the gate checking its own
 * paperwork was still on the wrong clock, and between 20:00 ET and midnight it
 * would look for tomorrow's file. It uses the FIELD zone now, like everything
 * else.
 *
 * And it matched only the `cc-session-<date>-` prefix, which assumed one
 * append-only document per session. That convention is retired: an auditor
 * reading this repo could not tell which commit wrote which section of a
 * 1,289-line file, and their own diff — comparing filenames — missed 400 lines
 * of new content because the filename never changed. Entries are now one
 * document per piece of work, so the date can sit anywhere in the name.
 */
const outboxToday = () => {
  const today = GATE_DAY
  const entries = readdirSync('outbox').filter(f => f.includes(today) && f.endsWith('.md'))
  // Length floor because an empty stub would otherwise satisfy the check.
  return entries.some(f => readFileSync(`outbox/${f}`, 'utf8').length > 1500)
}

/**
 * Source changes must arrive with an outbox change.
 *
 * `outboxToday` alone is satisfiable by ANY dated file, so it cannot tell a
 * documented commit from an undocumented one. It passed on two commits in this
 * session whose work was not written up anywhere — the measurement commit,
 * whose outbox section was written an hour later, and the window-simulation
 * commit, which had none at all. Jeff found both by asking; the gate could not
 * have.
 *
 * This compares the actual changed files. Uncommitted work is judged on the
 * working tree, committed work on HEAD, so it answers the same question in both
 * places.
 */
const outboxAccompaniesSource = () => {
  // Bare paths from git, not positional slicing of `--porcelain`. The first
  // version did `l.slice(3)` and ate a character off one entry — "utbox/..." —
  // because the two status columns are not always both occupied. The output of
  // these commands is one path per line with no prefix at all, so there is
  // nothing to mis-slice.
  const lines = cmd => cmd.split('\n').map(l => l.trim()).filter(Boolean)
  let changed = [
    ...lines(execSync('git diff --name-only', { encoding: 'utf8' })),
    ...lines(execSync('git diff --name-only --cached', { encoding: 'utf8' })),
    ...lines(execSync('git ls-files --others --exclude-standard', { encoding: 'utf8' })),
  ]
  if (changed.length === 0) {
    // A merge commit has no single parent diff worth reading; treat it as
    // nothing to document rather than failing on someone else's merge.
    const parents = execSync('git rev-list --parents -n 1 HEAD', { encoding: 'utf8' }).trim().split(' ')
    if (parents.length !== 2) return true
    changed = lines(execSync('git diff --name-only HEAD~1 HEAD', { encoding: 'utf8' }))
  }
  const touchesSource = changed.some(f => /^(src|scripts)\//.test(f))
  if (!touchesSource) return true
  return changed.some(f => /^outbox\//.test(f))
}

const rows = [
  { name: 'build is clean, zero F#/NuGet warnings', weight: 20, skipQuick: true,
    run: () => ok('npm run build') &&
      !/warning (FS|NU)\d+/.test(
        execSync('dotnet build src/Laboratory.fsproj --no-restore', { encoding: 'utf8' })) },

  { name: 'decoders accept both real captures', weight: 30,
    run: () => ok('node scripts/drift-check.mjs --file data/context-2026-05-15.json') &&
               ok('node scripts/drift-check.mjs --file data/games-2026-08-09.json') },

  { name: 'decoders still REJECT the corrupted fixture', weight: 20,
    run: () => fails('node scripts/drift-check.mjs --file test/malformed-nested.json') },

  { name: 'render checks pass on both captures', weight: 30, skipQuick: true,
    run: () => ok('npm run check') && ok('npm run check:hard') },

  { name: 'grouping and date navigation pass', weight: 30, skipQuick: true,
    run: () => ok('npm run check:nav') },

  // The heaviest row, because this is the one that failed. Every claimed
  // compiler rejection in the proof doc is compiled for real.
  { name: 'doc claims are compiler-verified, not prose', weight: 20, skipQuick: true,
    run: () => ok('node scripts/proof-check.mjs') },

  // Deterministic, so it runs at any hour. The zone fix is only observable
  // when ET and UTC disagree, and every scheduled job in this repo runs
  // outside that window.
  { name: 'FIELD-zone day is correct at fixed instants', weight: 30,
    run: () => ok('node scripts/zone-check.mjs') },

  // A step whose script imports build/ from a job that never builds is valid
  // YAML, a valid script, and green everywhere locally. It cost two failed
  // runs. This is the only row that reads CI configuration rather than code.
  { name: 'workflow jobs can run the scripts they invoke', weight: 20,
    run: () => ok('node scripts/workflow-check.mjs') },

  // The retrospective half of the outbox rule. `outboxAccompaniesSource` below
  // judges the commit being made; this judges every commit already made, with
  // no window to age out of and no exemption list.
  { name: 'every governed commit paired source with outbox', weight: 10,
    run: () => ok('node scripts/history-check.mjs --self-test') &&
               ok('node scripts/history-check.mjs') },

  // Both picks. Separate rows because they are separate features that
  // contradict each other, and one passing tells you nothing about the other.
  { name: 'pick decoders match the recorded live response', weight: 30,
    run: () => ok('node scripts/pick-check.mjs') },

  { name: 'tabs work and the pick score never renders', weight: 30, skipQuick: true,
    run: () => ok("URL='http://localhost:8080/?data=games-2026-08-09' node scripts/tab-check.mjs") },

  { name: "pick'em grades only finished games", weight: 30, skipQuick: true,
    run: () => ok('node scripts/pickem-check.mjs') },

  { name: 'game state is correct at fixed instants', weight: 30,
    run: () => ok('node scripts/state-check.mjs') },

  // The slowest row by far — it rebuilds once per mutation — and the only one
  // that asks whether the OTHER rows are worth anything.
  { name: 'breaking each invariant makes a check fail', weight: 20, skipQuick: true,
    // Two halves. The suite must pass, AND the harness must still be able to
    // report a survivor — `known-survivor` is a mutation designed to survive,
    // so `--only known-survivor` FAILING is the proof the harness can see.
    // Without the second half, a harness that called everything caught would
    // satisfy this row while proving nothing.
    run: () => ok('node scripts/mutation-check.mjs') &&
               fails('node scripts/mutation-check.mjs --only known-survivor') },

  { name: 'the sparkline shows the value, not a silhouette', weight: 30, skipQuick: true,
    run: () => ok('node scripts/spark-check.mjs') },

  // Per-ROW confidence, which the gate's own pass/fail cannot express: does
  // anything prove each row can fail, and is its answer the same tomorrow?
  { name: 'every gate row has teeth and is deterministic', weight: 20,
    // Both halves, same shape as the mutation row: the scoring must pass, AND
    // the scorer must still be able to mark a toothless row down.
    run: () => ok('node scripts/row-confidence.mjs') &&
               ok('node scripts/row-confidence.mjs --self-test') },

  // "Written but never read back" — jubilant-bassoon's own docking criterion,
  // mechanised. A public value nothing reads has never been observed by
  // anything; the compiler only says it is well-typed.
  { name: 'no value is written without being read back', weight: 20,
    run: () => ok('node scripts/unused-check.mjs') && ok('node scripts/units-check.mjs') },

  // A red main must be visible in the repo. STATUS.md could not say so until
  // now, which is how a false "main is green" claim stood unopposed.
  { name: 'a red main is reported, not softened', weight: 20,
    run: () => ok('node scripts/status-verdict-check.mjs') },

  { name: 'this session wrote its outbox', weight: 10, run: outboxToday },

  { name: 'source changes arrive with an outbox entry', weight: 10,
    run: outboxAccompaniesSource },
]

export { rows, ok, fails }
