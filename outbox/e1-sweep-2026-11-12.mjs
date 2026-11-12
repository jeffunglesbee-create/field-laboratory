#!/usr/bin/env node
// Rule 90: the self-test of scripts/check-doc-citations.mjs must go red when the history reader (E1) is broken. Each mutation is applied to a COPY of scripts/,
// its anchor is asserted to occur exactly once and to have changed the file, and the copy is run with `--self-test` from the repository root. A mutation is
// CAUGHT only when the run exits non-zero AND prints at least one FAIL line: a crash with no FAIL line (a missing import in the copy, a syntax error from the
// mutation) is not a catch. The unmutated COPY is run first, so a copy that cannot run at all is reported before any mutation is judged.
// EVERY RUN is made under a DECOY of the pre-commit hook's environment: GIT_DIR and GIT_INDEX_FILE name a throwaway repository that holds one unrelated commit.
// The self-test first passed standalone and failed under the real hook, because the reader inherited GIT_DIR and read the real history for a fixture; a sweep
// that runs outside a hook cannot see that class. The decoy is never the real repository, so a mutation that leaks the variables can only hurt the decoy.
// TMPDIR is set INSIDE a throwaway git work tree for every run, so a fixture directory that is not a repository has a repository above it, as on a machine whose temp
// directory sits in a checkout. The independent review of 5cf8efb found the mutations this sweep did not have (a plain --first-parent, --remotes, --tags, a ref glob,
// HEAD^, a hard-coded branch, process.env in the fixture wiring); they are here, and each one is a case the first self-test was green for.
// The mutations that break how the fixtures reach git (the process environment instead of the cleaned one, in the reader, the git helper, the command-line helper
// and the environment function) are run TWICE: under the decoy hook environment above, and under a CLEAN one with no GIT_* variable at all, as in CI. The first
// self-test was green for those mutations whenever no variable happened to be set; the self-test now poisons its own process environment, and the clean run is
// what proves that: a mutation counts as caught only if it is caught in both.
// NOT MUTATION-TESTED, and said so: the removal of the temp repository when the self-test is interrupted by SIGINT or SIGTERM (a cleanup property, not a verdict);
// and the self-test's own poisoning of the process environment (removing it only weakens the test, which the clean-environment run above is what measures).
// A mutation that leaves the self-test green is printed NOT CAUGHT and the script exits 1. Run from the repository root:
//   node outbox/e1-sweep-2026-11-12.mjs
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const FILE = 'check-doc-citations.mjs'
const MUTATIONS = [
  ['E1 ITSELF: the history is every ref again', "export const HISTORY_REV = 'HEAD'", "export const HISTORY_REV = '--all'"],
  ['the reader ignores its rev and always reads every ref', "['log', rev, '--pretty=format:'", "['log', '--all', '--pretty=format:'"],
  ['the reader ignores its rev and always reads HEAD', "['log', rev, '--pretty=format:'", "['log', 'HEAD', '--pretty=format:'"],
  ['the log is cut to the first parent without the merge diff', "['log', rev, '--pretty=format:'", "['log', rev, '--first-parent', '--no-merges', '--pretty=format:'"],
  ['a renamed-to path is not counted', "'--diff-filter=AR'", "'--diff-filter=A'"],
  ['a shallow clone is read as a full history', "if (shallow === 'true') {", 'if (false) {'],
  ['an unreadable history is an empty set', 'return { paths: null, problem: `git history unreadable', 'return { paths: new Set(), problem: `git history unreadable'],
  ['the reader runs in the caller\'s directory, not the one it is given', "{ cwd, env, encoding: 'utf8', maxBuffer", "{ env, encoding: 'utf8', maxBuffer"],
  ['the command line reads every ref although the function reads HEAD', 'const { paths: everTracked, problem: historyProblem } = everTrackedPaths();', "const { paths: everTracked, problem: historyProblem } = everTrackedPaths({ rev: '--all' });"],
  ['the report does not say which history it read', 'if (everTracked) console.log(`  history    read from', 'if (false) console.log(`  history    read from'],
  ['the reader ignores the environment it is given: the shallow probe', "['rev-parse', '--is-shallow-repository'], { cwd, env, encoding", "['rev-parse', '--is-shallow-repository'], { cwd, encoding"],
  ['the reader ignores the environment it is given: the log', "{ cwd, env, encoding: 'utf8', maxBuffer", "{ cwd, encoding: 'utf8', maxBuffer"],
  ['the reader takes its environment from the process, not from its argument', "rev = HISTORY_REV, env = process.env } = {}) {", "rev = HISTORY_REV } = {}, env = process.env) {"],
  ['the log is cut to the first parent (the plain flag)', "['log', rev, '--pretty=format:'", "['log', rev, '--first-parent', '--pretty=format:'"],
  ['remote-tracking branches are read as well', "['log', rev, '--pretty=format:'", "['log', rev, '--remotes', '--pretty=format:'"],
  ['tags are read as well', "['log', rev, '--pretty=format:'", "['log', rev, '--tags', '--pretty=format:'"],
  ['a ref glob is read as well', "['log', rev, '--pretty=format:'", "['log', rev, '--glob=refs/remotes/*', '--pretty=format:'"],
  ['the history is the parent of HEAD', "['log', rev, '--pretty=format:'", "['log', rev + '^', '--pretty=format:'"],
  ['the history is a hard-coded branch, not HEAD', "['log', rev, '--pretty=format:'", "['log', 'main', '--pretty=format:'"],
  ['the revision is not separated from paths', "'--diff-filter=AR', '--'],", "'--diff-filter=AR'],"],
  ['an unreadable history is reported by its command line, not git\'s reason', "const why = String(e.stderr || '').trim().split('\\n')[0] || String(e.message || e).split('\\n')[0]", "const why = String(e.message || e).slice(0, 20)"],
  ['the problem text no longer names the git command (workflow-check\'s detector would stop seeing the reader)', 'git history unreadable (git log ${rev}):', 'git history unreadable (${rev}):'],
  ['the fixtures run with the process environment, not the cleaned one', 'const gitEnv = cleanGitEnv(process.env);', 'const gitEnv = process.env;'],
  ['the git helper uses the process environment', "execFileSync('git', args, { cwd, env: gitEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });", "execFileSync('git', args, { cwd, env: process.env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });"],
  ['the command-line helper uses the process environment', "[fileURLToPath(import.meta.url)], { cwd, env: gitEnv, encoding: 'utf8' });", "[fileURLToPath(import.meta.url)], { cwd, env: process.env, encoding: 'utf8' });"],
  ['the no-history check lets git look in the directories above', "{ env: { ...gitEnv, GIT_CEILING_DIRECTORIES: root } }", "{ env: gitEnv }"],
  ['a fixture inherits the caller\'s git variables', ".filter(([k]) => !k.startsWith('GIT_'))", '.filter(() => true)'],
  ['the fixture environment keeps the caller\'s global git config', "GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',", "GIT_CONFIG_NOSYSTEM: '1',"],
]

const here = new URL('..', import.meta.url).pathname
// the mutations that break how the fixtures reach git: run under both environments
const WIRING = /process environment|ignores the environment|inherits the caller|keeps the caller|takes its environment/
const decoyRoot = mkdtempSync(join(tmpdir(), 'e1decoy-'))
const decoy = join(decoyRoot, 'decoy.git')
const plain = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'd', GIT_AUTHOR_EMAIL: 'd@example.invalid', GIT_COMMITTER_NAME: 'd', GIT_COMMITTER_EMAIL: 'd@example.invalid' }
for (const k of Object.keys(plain)) if (k.startsWith('GIT_') && !/^GIT_(CONFIG_|AUTHOR_|COMMITTER_)/.test(k)) delete plain[k]
execFileSync('git', ['init', '-q', '--bare', '-b', 'main', decoy], { env: plain })
const emptyTree = execFileSync('git', ['--git-dir', decoy, 'hash-object', '-t', 'tree', '/dev/null'], { env: plain, encoding: 'utf8' }).trim()
const commit = execFileSync('git', ['--git-dir', decoy, 'commit-tree', emptyTree, '-m', 'decoy'], { env: plain, encoding: 'utf8' }).trim()
execFileSync('git', ['--git-dir', decoy, 'update-ref', 'refs/heads/main', commit], { env: plain })
// What the pre-commit hook sets, pointed at the decoy: the real repository is never named.
// TMPDIR is inside a throwaway git work tree (outer/), so a directory made under it has a repository above it.
const outer = join(decoyRoot, 'outer')
execFileSync('git', ['init', '-q', '-b', 'main', outer], { env: plain })
execFileSync('git', ['-C', outer, 'commit', '-q', '--allow-empty', '-m', 'outer'], { env: plain })
mkdirSync(join(outer, 'tmp'))
const hookEnv = { ...plain, GIT_DIR: decoy, GIT_INDEX_FILE: join(decoyRoot, 'decoy-index'), GIT_PREFIX: '', TMPDIR: join(outer, 'tmp') }
const prep = () => {
  const dir = mkdtempSync(join(tmpdir(), 'e1sweep-'))
  cpSync(join(here, 'scripts'), join(dir, 'scripts'), { recursive: true })
  if (existsSync(join(here, 'node_modules'))) symlinkSync(join(here, 'node_modules'), join(dir, 'node_modules'))
  return dir
}
const cleanEnv = { ...plain, TMPDIR: join(outer, 'tmp') }
const run = (dir, env = hookEnv) => spawnSync(process.execPath, [join(dir, 'scripts', FILE), '--self-test'], { encoding: 'utf8', cwd: here, env, maxBuffer: 64 * 1024 * 1024 })
const failLines = out => out.match(/^FAIL .*$/gm) ?? []
const bail = (dir, code, msg) => { console.log(msg); if (dir) rmSync(dir, { recursive: true, force: true }); rmSync(decoyRoot, { recursive: true, force: true }); process.exit(code) }

const d0 = prep()
const clean = run(d0)
const clean2 = run(d0, cleanEnv)
console.log(`unmutated copy: under the decoy hook environment exit ${clean.status}, ${failLines(clean.stdout).length} failing, ${(clean.stdout.match(/^PASS/gm) ?? []).length} passing; under a clean environment exit ${clean2.status}, ${failLines(clean2.stdout).length} failing, ${(clean2.stdout.match(/^PASS/gm) ?? []).length} passing`)
rmSync(d0, { recursive: true, force: true })
if (clean.status !== 0 || failLines(clean.stdout).length || clean2.status !== 0 || failLines(clean2.stdout).length) bail(null, 1, 'the unmutated copy is not green in both environments: nothing to sweep')

let caught = 0
for (const [name, from, to] of MUTATIONS) {
  const dir = prep()
  const f = join(dir, 'scripts', FILE)
  const src = readFileSync(f, 'utf8')
  const n = src.split(from).length - 1
  if (n !== 1) bail(dir, 1, `ANCHOR  ${name}: the anchor occurs ${n} times, not once`)
  const out = src.replace(from, () => to)
  if (out === src) bail(dir, 1, `NOOP    ${name}: the mutation changed nothing`)
  writeFileSync(f, out)
  const wiring = WIRING.test(name)
  const r = run(dir)
  const fails = failLines(r.stdout)
  const r2 = wiring ? run(dir, cleanEnv) : null
  const fails2 = r2 ? failLines(r2.stdout) : []
  const ok = r.status !== 0 && fails.length > 0 && (!r2 || (r2.status !== 0 && fails2.length > 0))
  if (ok) caught++
  const named = fails.slice(0, 2).map(l => l.slice(5, 78)).join(' | ')
  const both = r2 ? `; clean env: exit ${r2.status}, ${fails2.length} failing` : ''
  console.log(`${ok ? 'CAUGHT    ' : 'NOT CAUGHT'}  ${name}  (exit ${r.status}, ${fails.length} failing: ${named || (r.stderr || '').split('\n')[0].slice(0, 80)}${both})`)
  rmSync(dir, { recursive: true, force: true })
}
rmSync(decoyRoot, { recursive: true, force: true })
console.log(`\ncaught ${caught} of ${MUTATIONS.length} mutations`)
process.exit(caught === MUTATIONS.length ? 0 : 1)
