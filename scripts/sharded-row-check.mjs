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
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createChecks, finish, isMain } from './checks.mjs'
import { failures, rows, shardedSuite } from './gate-checks.mjs'

const ROW = 'breaking each invariant makes a check fail'

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
