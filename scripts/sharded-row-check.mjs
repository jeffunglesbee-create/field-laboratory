#!/usr/bin/env node
// The CI branch of the gate's mutation row can fail.
// docs/CC-CMD-2026-11-03-gate-speed.md; an independent review found that nothing could show this.
//
//   node scripts/sharded-row-check.mjs --self-test
//
// On CI the row 'breaking each invariant makes a check fail' does not run the suite: with GATE_MUTATION_SHARDS set it runs `shardedSuite`
// (await, then merge). That function and the ternary that chooses it are the only thing standing between a green gate and "the shards were
// never read", and they ran in exactly one place, a workflow that cannot be asked to fail on purpose. Every check that reads the row
// (row-confidence, the gate inventory, the self-tests of await and merge) passed with the body of shardedSuite replaced by `return true`.
//
// This calls `shardedSuite` with stub commands, so each wiring decision is shown to matter: await failing, merge failing, merge never
// running, a shard count that is not a positive integer, a stale shard directory. The table of mutations breaks each of those clauses in
// gate-checks.mjs and expects THIS script to go red.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createChecks, finish, isMain } from './checks.mjs'
import { failures, rows, shardedSuite } from './gate-checks.mjs'

const ROW = 'breaking each invariant makes a check fail'
const WORKFLOW = '.github/workflows/verify-full.yml'

/**
 * Does the workflow set `GATE_MUTATION_SHARDS` on the step that runs the gate, to a positive integer? `{ ok, why }`.
 *
 * It is the other half of the branch above: the row takes the shard branch only when the variable is set, and nothing but this reads where it is set. Removing it from `verify-full.yml` left
 * `workflow-check.mjs`, this script and `row-confidence.mjs` green (review 7, 2026-11-05), and CI would have run the whole suite in-process again, the cost the sharding exists to avoid; the
 * exemption table's sanction for `mutation-await.mjs` says `verify-full` sets it. Not a YAML parser (there is none in the repo): steps are cut at `      - `, a name inside a comment is not at the start of a line, and the step
 * that holds the variable is asked for its `run:`.
 */
export const gateShardsSet = text => {
  const steps = text.split(/\n(?= {6}- )/)
  const holders = steps.filter(st => /^\s+GATE_MUTATION_SHARDS:/m.test(st))
  if (holders.length === 0) return { ok: false, why: 'no step sets GATE_MUTATION_SHARDS' }
  if (holders.length > 1) return { ok: false, why: `${holders.length} steps set GATE_MUTATION_SHARDS (wanted the one that runs the gate)` }
  const value = /^\s+GATE_MUTATION_SHARDS:[ \t]*['"]?([^'"\n#]*?)['"]?[ \t]*(?:#.*)?$/m.exec(holders[0])?.[1] ?? ''
  if (!/^[1-9]\d*$/.test(value)) return { ok: false, why: `GATE_MUTATION_SHARDS is ${JSON.stringify(value)}, not a positive integer` }
  const run = /^\s+run:[ \t]*(.*)$/m.exec(holders[0])?.[1].trim()
  if (run !== 'npm run gate') return { ok: false, why: `the step that sets GATE_MUTATION_SHARDS runs ${JSON.stringify(run ?? '(nothing)')}, not npm run gate` }
  return { ok: true, why: '' }
}

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()
  const work = mkdtempSync(join(tmpdir(), 'sharded-row-'))
  const mark = name => join(work, name)
  const stub = (code, marker) => `node -e "${marker ? `require('fs').writeFileSync(process.env.${marker}, 'ran');` : ''}process.exit(${code})"`
  const run = (shards, awaitCmd, mergeCmd) => {
    const before = failures.length
    const r = shardedSuite(shards, awaitCmd, mergeCmd)
    return { r, failed: failures.length - before }
  }
  try {
    process.env.AWAIT_MARK = mark('await'); process.env.MERGE_MARK = mark('merge')

    let x = run('8', stub(1, 'AWAIT_MARK'), stub(0, 'MERGE_MARK'))
    check('MUTATION: the wait failing fails the row, and the merge is not run on nothing', x.r === false && existsSync(mark('await')) && !existsSync(mark('merge')), JSON.stringify(x))
    rmSync(mark('await'), { force: true })

    x = run('8', stub(0, 'AWAIT_MARK'), stub(1, 'MERGE_MARK'))
    check('MUTATION: the merge refusing fails the row', x.r === false && existsSync(mark('await')) && existsSync(mark('merge')), JSON.stringify(x))
    rmSync(mark('await'), { force: true }); rmSync(mark('merge'), { force: true })

    x = run('8', stub(0, 'AWAIT_MARK'), stub(0, 'MERGE_MARK'))
    check('MUTATION: both passing passes the row, and the merge really ran (a row that skipped it would look the same)', x.r === true && existsSync(mark('await')) && existsSync(mark('merge')), JSON.stringify(x))

    for (const bad of ['', '0', '8x', ' 8', '-1', '08.5', undefined]) {
      x = run(bad, stub(0), stub(0))
      check(`MUTATION: a shard count of ${JSON.stringify(bad)} fails the row and says so`, x.r === false && x.failed === 1, JSON.stringify(x))
    }

    // A shard file left by an earlier run of the same commit must not be there when the wait starts.
    const dir = join(tmpdir(), 'mutation-shards')
    mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, 'mutation-shard-1-of-8.json'), '{"stale":true}')
    const emptyDirAwait = `node -e "const fs=require('fs');const d=process.argv[1];process.exit(fs.existsSync(d)&&fs.readdirSync(d).length?1:0)"`
    x = run('8', emptyDirAwait, stub(0))
    check('MUTATION: the shard directory is emptied before the wait, so a stale file is never read as this run\'s', x.r === true, JSON.stringify(x))

    // The row itself must still be wired to the real scripts and the environment variable.
    const src = String(rows.find(r => r.name === ROW)?.run ?? '')
    check('MUTATION: the row is wired to the shard branch: GATE_MUTATION_SHARDS, shardedSuite, the real await and merge scripts',
      /GATE_MUTATION_SHARDS/.test(src) && /shardedSuite\(/.test(src) && /scripts\/mutation-await\.mjs/.test(src) && /scripts\/mutation-merge\.mjs/.test(src), src.slice(0, 300))
    check('MUTATION: the unset branch still runs the in-process suite and the known-survivor half is still there',
      /=== undefined/.test(src) && /ok\('node scripts\/mutation-check\.mjs'\)/.test(src) && /fails\('node scripts\/mutation-check\.mjs --only known-survivor'\)/.test(src), src.slice(0, 300))

    // The workflow side: where the variable is set. Stand-in workflows for each way it can be wrong, and the real file.
    const STEP = (env, run = 'npm run gate') => `jobs:\n  full:\n    steps:\n      - name: Build\n        run: npm run build\n\n      - name: Gate\n${env}        run: ${run}\n`
    const SETS = [
      ['set to 8 on the gate step', STEP("        env:\n          GATE_MUTATION_SHARDS: '8'\n          GITHUB_TOKEN: x\n"), true],
      ['set to 12 without quotes', STEP('        env:\n          GATE_MUTATION_SHARDS: 12\n'), true],
      ['set to "3" in double quotes, with a trailing comment', STEP('        env:\n          GATE_MUTATION_SHARDS: "3" # shards\n'), true],
      ['not set at all', STEP(''), false],
      ['named only in a comment', STEP("        env:\n          # GATE_MUTATION_SHARDS: '8'\n          GITHUB_TOKEN: x\n"), false],
      ['empty', STEP("        env:\n          GATE_MUTATION_SHARDS: ''\n"), false],
      ['zero', STEP("        env:\n          GATE_MUTATION_SHARDS: '0'\n"), false],
      ['not a number', STEP("        env:\n          GATE_MUTATION_SHARDS: 'eight'\n"), false],
      ['a number with a suffix', STEP("        env:\n          GATE_MUTATION_SHARDS: '8x'\n"), false],
      ['set on a step that does not run the gate', STEP("        env:\n          GATE_MUTATION_SHARDS: '8'\n", 'npm run build'), false],
      ['set on two steps that both run the gate', STEP("        env:\n          GATE_MUTATION_SHARDS: '8'\n") + "\n      - name: Gate again\n        env:\n          GATE_MUTATION_SHARDS: '8'\n        run: npm run gate\n", false],
    ]
    const offSets = SETS.filter(([, text, want]) => gateShardsSet(text).ok !== want)
    check(`MUTATION: the workflow sets GATE_MUTATION_SHARDS to a positive integer on the step that runs the gate, for ${SETS.length} stand-in workflows (${SETS.filter(x => x[2]).length} do, ${SETS.filter(x => !x[2]).length} do not: unset, a comment, empty, zero, text, a suffix, the wrong step, two steps)`,
      offSets.length === 0, offSets.map(([what, text]) => `${what}: ${JSON.stringify(gateShardsSet(text))}`).join(' / '))
    const real = gateShardsSet(readFileSync(WORKFLOW, 'utf8'))
    check(`MUTATION: ${WORKFLOW} sets GATE_MUTATION_SHARDS on the step that runs the gate (checked: 1 workflow file)`, real.ok, real.why)
  } finally {
    delete process.env.AWAIT_MARK; delete process.env.MERGE_MARK
    rmSync(work, { recursive: true, force: true })
    rmSync(join(tmpdir(), 'mutation-shards'), { recursive: true, force: true })
  }
  finish(summarize())
} else if (isMain(import.meta.url)) {
  console.error('usage: node scripts/sharded-row-check.mjs --self-test')
  process.exit(2)
}
