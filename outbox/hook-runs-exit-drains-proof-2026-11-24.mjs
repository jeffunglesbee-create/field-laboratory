// Rule 90 for docs/CC-CMD-2026-11-06-gate-residuals-remaining.md, item F1: the pre-commit hook gets `npm run --silent
// check:exit-drains`, and that line is not trusted until it has refused a real bad commit and the same hook without it
// has been shown to let that commit through.
//
// Five real `git commit` attempts, each in its own scratch worktree, each running the repo's real `.githooks/pre-commit`
// with the real `npm` (nothing stubbed). The hook text under test is outbox/hook-runs-exit-drains-2026-11-24.patch,
// applied to the worktree's own copy: "before" is the hook as committed, "after" is the hook with the patch.
//
//   C1  before  77647dc1 as the hook saw it (parent 18606cb7, its changes staged)   the GAP, control: must be let through
//   C2  after   the same tree                                                       must be REFUSED, 64 early exits
//   C3  after   c67aa5cd, the fix, as the hook saw it (parent 6db94829, staged)     must pass, 63 early exits
//   C4  after   178458de, main before this change, clean tree                       must pass, 63 early exits
//   C5  before  178458de with docs/early-exit-budget.txt raised 63 -> 64, staged    NOT the line under test: which line of
//                                                                                   the hook as it stands refuses it
//
// C5 replaces two cases (a docs-only gap, and the line closing it) that this file held in its second run. Their control
// was refuted: the hook without the line did not let a budget-only edit through. It stopped at check:mutation-anchors,
// `STALE  exit-budget-loose: not found in docs/early-exit-budget.txt: 63`, because scripts/mutation-check.mjs pins the
// budget's text. So the line is not what guards that edit, and the hook's comment does not say it is.
//
// C1 is the control: if the hook WITHOUT the line already refused the tree of 77647dc1, the gap this item claims would
// not exist, and the run says so instead of reporting the rest. Each worktree is asserted to be at the commit named, each
// staged cherry-pick to carry every file of the commit it replays, the patch to apply and to leave exactly one
// `npm run --silent check:exit-drains` line (12 -> 13 `npm run` lines), and the budget edit to change the file, all
// before the hook runs: a case whose mutation was not applied would be a pass for nothing.
//
// A worktree has no node_modules (it is gitignored), and check:import-purity imports modules that need @xmldom/xmldom
// and playwright, so without them the hook refuses every tree at that line: a fault of the scratch tree that says
// nothing about the line under test. The first run of this harness (2026-11-24, 21:26 ET) stopped at C1 for exactly
// that reason; its control refused at check:import-purity with ERR_MODULE_NOT_FOUND for @xmldom/xmldom. A real session
// has them installed from the same lockfile and the main tree's installed copy is that, so each worktree gets a symlink
// to it, after its package.json and package-lock.json are shown byte-identical to the main tree's. The links are
// removed before the worktrees are, and the main tree's copy is asserted intact at the end.
//
// It never edits the working tree it is run from and never pushes. A commit that succeeds in a scratch worktree is a
// dangling commit on a detached HEAD, discarded with the worktree.
//
// Run from the repo root:  node outbox/hook-runs-exit-drains-proof-2026-11-24.mjs [--scratch <dir>]
// Exit 0 when all five cases behaved as expected. About a minute and a half per case; C5 is shorter, the hook stops early.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const repo = process.cwd()
const at = process.argv.indexOf('--scratch')
const scratch = at > -1 ? path.resolve(process.argv[at + 1]) : fs.mkdtempSync(path.join(os.tmpdir(), 'hook-f1-'))
fs.mkdirSync(scratch, { recursive: true })
const patch = path.join(repo, 'outbox', 'hook-runs-exit-drains-2026-11-24.patch')
if (!fs.existsSync(path.join(repo, '.githooks', 'pre-commit')) || !fs.existsSync(patch)) {
  throw new Error('run this from the field-laboratory root, with outbox/hook-runs-exit-drains-2026-11-24.patch present')
}

const run = (cwd, cmd, args, opts = {}) => spawnSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 1 << 26, ...opts })
const git = (cwd, args) => run(cwd, 'git', args)
const must = (cwd, args) => {
  const r = git(cwd, args)
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} (in ${cwd}) exited ${r.status}: ${(r.stderr || r.stdout).trim().slice(0, 300)}`)
  return r.stdout
}
const rev = r => must(repo, ['rev-parse', '--verify', `${r}^{commit}`]).trim()
const head = dir => must(dir, ['rev-parse', 'HEAD']).trim()
const strip = s => s.replace(/\x1b\[[0-9;]*m/g, '')
const assert = (cond, what) => { if (!cond) throw new Error(`NOT APPLIED: ${what}`) }

const BROKEN = rev('77647dc1')
const FIXED = rev('c67aa5cd')
const MAIN_BEFORE = rev('178458de')
const early = out => { const m = [...out.matchAll(/early report exits:\s+(\d+)/g)]; return m.length ? Number(m[m.length - 1][1]) : null }
const failLines = out => out.split('\n').map(l => l.trim()).filter(l => /^FAIL\b/.test(l))
// The hook's LAST line, not a substring: a clause name in the hook self-test that check:mutation-anchors prints quotes
// "pre-commit: ok", so a substring test saw the success text in a hook that was then refused two checks later (run 2,
// C2: the refusal was real and this predicate called it a pass).
const ok = out => out.trimEnd().split('\n').pop().trim() === 'pre-commit: ok'

// The predicates read text, so they are tried on text before any commit is attempted.
const refusedAfterQuotingOk = 'PASS  THE HOOK ASKS FOR THAT SCRIPT AND STOPS WHEN IT FAILS: finishes (exit 0, "pre-commit: ok")\nPASS  NO SCRIPT ENDS BY KILLING ITSELF\nFAIL  early report exits do not grow\n      → 64 now, budget 63\n\n2/4 checks passed\n'
const predicateTests = [
  ['ok: a hook that quoted the success text and was then refused is not ok', ok(refusedAfterQuotingOk) === false],
  ['ok: a hook that reached its last line is ok', ok('4/4 checks passed\n\npre-commit: ok\n') === true],
  ['ok: empty output is not ok', ok('') === false],
  ['early: the count is read from the report line', early('  early report exits:    64  (ratchet, budget 63)\n') === 64],
  ['early: the LAST report line wins', early('early report exits: 1\nearly report exits: 63\n') === 63],
  ['early: no report line reads null', early('PASS  something\n') === null],
  ['failLines: only a line that STARTS with FAIL', failLines('PASS  a check that must FAIL on purpose\nFAIL  early report exits do not grow\n      → 64 now, budget 63\n').length === 1 && /early report exits do not grow/.test(failLines(refusedAfterQuotingOk)[0])],
]

const cases = [
  { id: 'C1', hook: 'before', base: rev('77647dc1^'), pick: BROKEN, what: '77647dc1 as the hook saw it (parent 18606cb7, its changes staged): the gap, control',
    expect: (r, d) => [
      ['the tree really has the 64th early exit (the check run directly exits non-zero, count 64)', d.status !== 0 && early(d.out) === 64],
      ['the hook WITHOUT the line lets the commit through (exit 0, HEAD moved, "pre-commit: ok")', r.status === 0 && r.committed && ok(r.out)],
      ['and the hook never asked the question (no "early report exits" in its output)', early(r.out) === null],
    ] },
  { id: 'C2', hook: 'after', base: rev('77647dc1^'), pick: BROKEN, what: 'the same tree, hook WITH the line',
    expect: r => [
      ['the commit is refused (non-zero exit, HEAD unchanged, no "pre-commit: ok")', r.status !== 0 && !r.committed && !ok(r.out)],
      ['the hook reached the line: it printed the count, 64', early(r.out) === 64],
      ['and the failure names the ratchet ("early report exits do not grow")', failLines(r.out).some(l => /early report exits do not grow/.test(l))],
    ] },
  { id: 'C3', hook: 'after', base: rev('c67aa5cd^'), pick: FIXED, what: 'c67aa5cd, the fix, as the hook saw it (parent 6db94829, its changes staged), hook WITH the line',
    expect: r => [
      ['the commit goes through (exit 0, HEAD moved, "pre-commit: ok")', r.status === 0 && r.committed && ok(r.out)],
      ['the hook reached the line: count 63', early(r.out) === 63],
    ] },
  { id: 'C4', hook: 'after', base: MAIN_BEFORE, allowEmpty: true, what: '178458de (main before this change), clean tree, hook WITH the line',
    expect: r => [
      ['no false positive: the commit goes through (exit 0, HEAD moved, "pre-commit: ok")', r.status === 0 && r.committed && ok(r.out)],
      ['the hook reached the line: count 63', early(r.out) === 63],
    ] },
  { id: 'C5', hook: 'before', base: MAIN_BEFORE, budget: true, what: '178458de with docs/early-exit-budget.txt 63 -> 64 staged, hook as it stands: not the line under test, which line already refuses a budget-only edit',
    expect: (r, d) => [
      ['the budget edit is bad for the check (run directly: non-zero, "budget is not loose")', d.status !== 0 && failLines(d.out).some(l => /budget is not loose/.test(l))],
      ['the hook as it stands REFUSES it (non-zero exit, HEAD unchanged, last line is not "pre-commit: ok")', r.status !== 0 && !r.committed && !ok(r.out)],
      ['at check:mutation-anchors, naming the pinned budget entry (STALE  exit-budget-loose)', /STALE\s+exit-budget-loose/.test(r.out)],
      ['and the exit-drains check was never asked (no "early report exits" in its output)', early(r.out) === null],
    ] },
]

const lines = []
const say = s => { console.log(s); lines.push(s) }
let wrong = 0
let controlsBad = false
const times = {}
const worktrees = []
const links = []

try {
  say(`scratch: ${scratch}`)
  say(`hook text under test: ${path.relative(repo, patch)} (${fs.readFileSync(patch, 'utf8').split('\n').filter(l => /^\+[^+]/.test(l)).length} lines added)`)
  say(`trees: broken ${BROKEN.slice(0, 8)}, fixed ${FIXED.slice(0, 8)}, main-before ${MAIN_BEFORE.slice(0, 8)}`)
  const brokenPredicates = predicateTests.filter(([, held]) => !held)
  say(`predicate self-test: ${predicateTests.length - brokenPredicates.length} of ${predicateTests.length} held`)
  if (brokenPredicates.length) throw new Error(`a predicate does not hold, so no commit is attempted: ${brokenPredicates.map(([n]) => n).join('; ')}`)
  say('')
  for (const c of cases) {
    const dir = path.join(scratch, c.id)
    must(repo, ['worktree', 'add', '--detach', dir, c.base])
    worktrees.push(dir)
    assert(head(dir) === c.base, `${c.id}: worktree is at ${c.base.slice(0, 8)}`)
    let staged = ''
    if (c.pick) {
      const names = must(repo, ['show', '--name-only', '--format=', c.pick]).split('\n').filter(Boolean)
      must(dir, ['cherry-pick', '-n', c.pick])
      const got = must(dir, ['diff', '--cached', '--name-only']).split('\n').filter(Boolean)
      assert(names.length > 0 && names.every(n => got.includes(n)), `${c.id}: every file of ${c.pick.slice(0, 8)} is staged (${names.length} files)`)
      staged = `${got.length} files staged from ${c.pick.slice(0, 8)}`
    }
    for (const f of ['package.json', 'package-lock.json']) {
      assert(fs.readFileSync(path.join(dir, f)).equals(fs.readFileSync(path.join(repo, f))),
        `${c.id}: ${f} is byte-identical to the main tree's, so the main tree's installed node_modules is this tree's dependency set`)
    }
    const link = path.join(dir, 'node_modules')
    fs.symlinkSync(path.join(repo, 'node_modules'), link, 'dir')
    links.push(link)
    assert(fs.existsSync(path.join(link, 'playwright', 'package.json')) && fs.existsSync(path.join(link, '@xmldom', 'xmldom', 'package.json')),
      `${c.id}: the linked node_modules holds playwright and @xmldom/xmldom`)
    const hookPath = path.join(dir, '.githooks', 'pre-commit')
    const before = fs.readFileSync(hookPath, 'utf8')
    const runLines = t => t.split('\n').filter(l => /^npm run /.test(l)).length
    assert(runLines(before) === 12 && !/^npm run --silent check:exit-drains$/m.test(before), `${c.id}: the hook as committed has 12 npm run lines and not this one`)
    if (c.hook === 'after') {
      must(dir, ['apply', '--check', patch])
      must(dir, ['apply', patch])
      const after = fs.readFileSync(hookPath, 'utf8')
      assert(after !== before, `${c.id}: the patch changed the hook`)
      assert(after.split('\n').filter(l => l === 'npm run --silent check:exit-drains').length === 1 && runLines(after) === 13, `${c.id}: exactly one check:exit-drains line, 13 npm run lines`)
    }
    if (c.budget) {
      const p = path.join(dir, 'docs', 'early-exit-budget.txt')
      const was = fs.readFileSync(p, 'utf8')
      assert(was === '63\n', `${c.id}: the budget file reads 63 before the edit`)
      fs.writeFileSync(p, '64\n')
      assert(fs.readFileSync(p, 'utf8') !== was, `${c.id}: the budget file changed`)
      must(dir, ['add', 'docs/early-exit-budget.txt'])
      staged = 'docs/early-exit-budget.txt 63 -> 64 staged'
    }
    // The check run directly on the same tree, before the commit: what the hook's answer should have been.
    const direct = run(dir, 'npm', ['run', '--silent', 'check:exit-drains'])
    const d = { status: direct.status, out: strip((direct.stdout || '') + (direct.stderr || '')) }

    const was = head(dir)
    const t0 = Date.now()
    const r0 = run(dir, 'git', ['-c', 'core.hooksPath=.githooks', '-c', 'user.email=claude@field.dev', '-c', 'user.name=FIELD CI',
      'commit', '-q', ...(c.allowEmpty ? ['--allow-empty'] : []), '-m', `scratch proof ${c.id}: never pushed`], { timeout: 600_000 })
    const r = { status: r0.status, out: strip((r0.stdout || '') + (r0.stderr || '')), committed: head(dir) !== was, secs: (Date.now() - t0) / 1000 }
    times[c.id] = r.secs

    say(`=== ${c.id}  hook ${c.hook}  ${c.what}`)
    say(`  worktree at ${c.base.slice(0, 8)}${staged ? `; ${staged}` : ''}; hook has ${runLines(fs.readFileSync(hookPath, 'utf8'))} npm run lines; node_modules linked (package files identical to the main tree's)`)
    say(`  the check run directly on this tree: exit ${d.status}; early report exits ${early(d.out)}; ${failLines(d.out).length ? failLines(d.out).join(' | ') : 'no FAIL line'}`)
    say(`  git commit: exit ${r.status}; HEAD ${r.committed ? 'moved' : 'unchanged'}; ${r.secs.toFixed(1)} s`)
    say('  hook output, last 14 lines:')
    for (const l of r.out.trimEnd().split('\n').slice(-14)) say(`    ${l}`)
    for (const [what, pass] of c.expect(r, d)) {
      say(`  ${pass ? 'AS EXPECTED' : 'NOT AS EXPECTED'}  ${what}`)
      if (!pass) { wrong++; if (c.id === 'C1') controlsBad = true }
    }
    say('')
    if (controlsBad) { say('A CONTROL IS NOT AS EXPECTED. Read its hook output above before concluding anything about the gap: a fault in the scratch worktree (a missing module, say) looks the same. Stopping before the rest is read.'); break }
  }
} finally {
  for (const link of links) if (fs.lstatSync(link, { throwIfNoEntry: false })?.isSymbolicLink()) fs.unlinkSync(link)
  for (const dir of worktrees) git(repo, ['worktree', 'remove', '--force', dir])
  git(repo, ['worktree', 'prune'])
}

const intact = fs.existsSync(path.join(repo, 'node_modules', 'playwright', 'package.json')) && fs.existsSync(path.join(repo, 'node_modules', '@xmldom', 'xmldom', 'package.json'))
say(`the main tree's node_modules after cleanup: ${intact ? 'intact (playwright and @xmldom/xmldom present)' : 'DAMAGED'}`)
if (!intact) wrong++
const ran = Object.keys(times).length
say(`COVERAGE: ${ran} of ${cases.length} cases ran; ${ran} real git commit attempts, each with the real hook and the real npm, none stubbed; worktrees removed.`)
say(`whole-hook wall time, one run each: ${Object.entries(times).map(([k, v]) => `${k} ${v.toFixed(1)} s`).join(', ')}`)
say('  (C1 and C5 run the hook without the line, C2 to C4 with it; the cases differ in tree as well, so this is a range and not a measurement of the line)')
say(wrong === 0 && ran === cases.length ? `RESULT: all ${cases.length} cases behaved as expected.` : `RESULT: ${wrong} expectation(s) not as expected, ${ran} of ${cases.length} cases run.`)
process.exitCode = wrong === 0 && ran === cases.length ? 0 : 1
