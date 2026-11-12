#!/usr/bin/env node
// E1 of docs/CC-CMD-2026-11-06-gate-residuals-remaining.md, reproduced on the REAL tree and not on a fixture: a document on main cites a script that exists only
// on another branch. The repository is cloned (every local ref, full history), a side branch adds the cited script, a document citing it is written into the
// clone's working tree, and BOTH versions of scripts/check-doc-citations.mjs are run there: the one before E1 (OLD_REV, default origin/main) and the one in the
// working tree. Controls first: with no side branch both versions must read the same. The artifact is the pair of result lines and exit codes.
//   node outbox/e1-red-before-2026-11-12.mjs            (from the repository root; OLD_REV=<sha> to name the version before E1)
import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cleanGitEnv } from '../scripts/check-doc-citations.mjs'

const here = new URL('..', import.meta.url).pathname
const env = cleanGitEnv(process.env)
const git = (cwd, ...a) => execFileSync('git', a, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
const OLD_REV = process.env.OLD_REV || 'origin/main'
const oldSource = git(here, 'show', `${OLD_REV}:scripts/check-doc-citations.mjs`)
const oldSha = git(here, 'rev-parse', '--short', OLD_REV).trim()
console.log(`before-E1 version: scripts/check-doc-citations.mjs at ${OLD_REV} (${oldSha}); after: the working tree's (${readFileSync(join(here, 'scripts/check-doc-citations.mjs'), 'utf8').length} bytes)`)

const root = mkdtempSync(join(tmpdir(), 'e1red-'))
let verdict = 1
try {
  const clone = join(root, 'clone')
  git(root, 'clone', '-q', '--local', here, clone)
  writeFileSync(join(clone, 'scripts', 'check-old.mjs'), oldSource)
  cpSync(join(here, 'scripts', 'check-doc-citations.mjs'), join(clone, 'scripts', 'check-new.mjs'))
  const run = file => {
    const r = spawnSync(process.execPath, [join(clone, 'scripts', file)], { cwd: clone, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    const out = r.stdout + r.stderr
    return {
      exit: r.status,
      deleted: (out.match(/DELETED HERE\s+(\d+) path\(s\)\s*(.*)/) ?? [])[0]?.trim() ?? '(no DELETED HERE line)',
      budget: (out.match(/^(PASS|FAIL)\s+deleted-here citations do not grow \(budget \d+\)/m) ?? [])[0] ?? '(no budget line)',
    }
  }
  const show = (label, r) => console.log(`  ${label.padEnd(34)} exit ${r.exit}  ${r.deleted}\n  ${' '.repeat(34)} ${r.budget}`)

  console.log('\nCONTROL: no side branch yet. The two versions must read the same.')
  const c0 = run('check-old.mjs'), c1 = run('check-new.mjs')
  show('before E1', c0); show('after E1', c1)

  // THE TRIGGER: another session pushes a branch that adds the script main's document cites. Nothing on main changes.
  const base = git(clone, 'rev-parse', '--abbrev-ref', 'HEAD').trim()
  git(clone, 'checkout', '-q', '-b', 'another-sessions-branch')
  writeFileSync(join(clone, 'scripts', 'zz-e1-probe.mjs'), '// a script a task says it will create\n')
  git(clone, 'add', 'scripts/zz-e1-probe.mjs')
  git(clone, 'commit', '-q', '-m', 'the branch adds the script main cites')
  git(clone, 'checkout', '-q', base)
  mkdirSync(join(clone, 'docs'), { recursive: true })
  writeFileSync(join(clone, 'docs', 'zz-e1-probe.md'), 'The task adds `scripts/zz-e1-probe.mjs`.\n')
  console.log(`\nTRIGGER: branch another-sessions-branch adds scripts/zz-e1-probe.mjs; docs/zz-e1-probe.md on ${base} cites it.`)
  const t0 = run('check-old.mjs'), t1 = run('check-new.mjs')
  show('before E1', t0); show('after E1', t1)

  const same = (a, b) => a.exit === b.exit && a.deleted === b.deleted
  const redBefore = t0.exit !== 0 && /DELETED HERE\s+2 /.test(t0.deleted)
  const greenAfter = t1.exit === 0 && /DELETED HERE\s+1 /.test(t1.deleted)
  const controlsAgree = same(c0, c1) && c0.exit === 0 && /DELETED HERE\s+1 /.test(c0.deleted)
  const unmoved = same(c1, t1)
  console.log(`\ncontrols read the same and green:            ${controlsAgree}`)
  console.log(`before E1, with the branch:                  ${redBefore ? 'RED (the trigger turns main red)' : 'NOT RED'}`)
  console.log(`after E1, with the branch:                   ${greenAfter ? 'GREEN' : 'NOT GREEN'}`)
  console.log(`after E1, the branch changes nothing:        ${unmoved}`)
  verdict = controlsAgree && redBefore && greenAfter && unmoved ? 0 : 1
} finally {
  rmSync(root, { recursive: true, force: true })
}
console.log(`\n${verdict === 0 ? 'red before, green after, on the real tree' : 'DOES NOT SHOW THE FIX'}`)
process.exit(verdict)
