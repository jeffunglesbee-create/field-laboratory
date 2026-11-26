// Rule 90 for docs/CC-CMD-2026-11-06-gate-residuals-remaining.md, item G1: what the equality clause of scripts/check-exit-drains.mjs
// ("...and the budget is not loose") tells a person it has just refused, and whether doing what it says leaves a hook that passes.
//
// Real `git commit` attempts, each in its own scratch worktree at BASE, each running the repo's real `.githooks/pre-commit` with the real
// `npm` (nothing stubbed). "before" is scripts/check-exit-drains.mjs and the mutation table as committed at BASE; "after" is BASE with
// outbox/exit-budget-advice-2026-11-25.patch applied to the worktree's own copy. The hook is the same in every case: this item does not touch it.
//
// Three trees, each made by one edit that is asserted to apply and to move the count:
//   SHRUNK   count 62: the one early exit of scripts/design-tokens-check.mjs ends in finish() instead of process.exit() (a script the mutation table never names)
//   GREW     count 64: the plant of the table's own entry `early-exit-ratchet-grows` (a 64th early exit in scripts/glyph-check.mjs)
//   MISSING  count 63, docs/early-exit-budget.txt deleted
//
//   A0  before  SHRUNK   the budget file AND the exit-budget-loose entry moved to 62          control: the two-file edit leaves a hook that passes
//   A1  before  SHRUNK   the budget file alone moved to 62 (what "lower the budget to 62" says)  must be REFUSED at check:mutation-anchors
//   A2  after   SHRUNK   exactly the edits the new message names                              must pass, and the entry must still be CAUGHT
//   A3  before  GREW     direct run: what the old message says to a count that grew
//   A3a after   GREW     direct run: what the new message says, with the same verdict
//   A4  after   GREW     budget 64 and the entry at 64/65, the two-file edit on a grown tree  measured: the hook passes it, which is why the message must not say it
//   A5  before  MISSING  direct run                                                            A5a after: the same
//   A6  before  CLEAN    direct run and self-test: 22 clauses                                  A6a after: 26 clauses
//
// A0 is the control for A1 and A2. If the hook refused A0 (a tree fault of the scratch worktree, say: the first harness of this kind stopped
// for want of node_modules) nothing below it would mean anything, so the run stops there and says so. Each worktree is asserted to be at BASE,
// the patch to apply, each tree edit to apply exactly once, the count to be the one named, package.json and package-lock.json to be byte-identical
// to the main tree's (a worktree has no node_modules; each gets a symlink to the main tree's, which is then the same dependency set), all before
// the hook runs. The links are removed before the worktrees are and the main tree's copy is asserted intact at the end.
//
// It never edits the tree it is run from and never pushes. A commit that succeeds in a scratch worktree is a dangling commit on a detached HEAD,
// discarded with the worktree.
//
// Run from the repo root:  node outbox/exit-budget-advice-proof-2026-11-25.mjs [--scratch <dir>] [--only A0,A1,...]
// `--only A0,A1,A3,A5,A6` runs the cases that need no patch (the old message, before anything is changed). Full run: about 6 minutes.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const repo = process.cwd()
const argv = process.argv.slice(2)
const valueOf = n => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] : null }
const only = valueOf('--only') ? valueOf('--only').split(',') : null
const scratch = valueOf('--scratch') ? path.resolve(valueOf('--scratch')) : fs.mkdtempSync(path.join(os.tmpdir(), 'budget-advice-'))
fs.mkdirSync(scratch, { recursive: true })
const patch = path.join(repo, 'outbox', 'exit-budget-advice-2026-11-25.patch')
if (!fs.existsSync(path.join(repo, '.githooks', 'pre-commit'))) throw new Error('run this from the field-laboratory root')

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
const out = x => strip((x.stdout || '') + (x.stderr || ''))

const BASE = rev('28ace610')
const BUDGET = 'docs/early-exit-budget.txt'
const TABLE = 'scripts/mutation-check.mjs'
const ENTRY = 'exit-budget-loose'
const SHRINK_FILE = 'scripts/design-tokens-check.mjs'
const GREW_FILE = 'scripts/glyph-check.mjs'
const CHECK = 'scripts/check-exit-drains.mjs'
const NOTE = 'outbox/scratch-exit-budget-advice-note.md'

// --- predicates: they read text, so they are tried on text before any commit is attempted ---------------------------------------------------------
const early = o => { const m = [...o.matchAll(/early report exits:\s+(\d+)/g)]; return m.length ? Number(m[m.length - 1][1]) : null }
const failLines = o => o.split('\n').map(l => l.trim()).filter(l => /^FAIL\b/.test(l))
const failNames = o => failLines(o).map(l => l.replace(/^FAIL\s+/, ''))
// The hook's LAST line, not a substring: a clause name that check:mutation-anchors prints quotes "pre-commit: ok".
const ok = o => o.trimEnd().split('\n').pop().trim() === 'pre-commit: ok'
// The detail line of the NAMED failing clause (the line under it), not the first FAIL's.
const detailOf = (o, nameRe) => {
  const ls = o.split('\n')
  const i = ls.findIndex(l => /^FAIL\b/.test(l.trim()) && nameRe.test(l))
  return i < 0 ? null : (ls[i + 1] ?? '').replace(/^\s*→\s*/, '').trim()
}
const has = (text, tokens) => text !== null && tokens.every(t => text.includes(t))
const lacks = (text, tokens) => text !== null && tokens.every(t => !text.includes(t))
const counts = o => { const m = o.match(/(\d+)\/(\d+) checks passed/); return m ? [Number(m[1]), Number(m[2])] : null }

const sample = 'PASS  a\nFAIL  early report exits do not grow\n      → 64 now, budget 63 — the new one(s) are among: scripts/x.mjs:1\nFAIL  ...and the budget is not loose\n      → 64 now, budget 63 — lower the budget to 64\n\n2/4 checks passed\n'
const quotedOk = 'PASS  THE HOOK ASKS FOR THAT SCRIPT AND STOPS WHEN IT FAILS: finishes (exit 0, "pre-commit: ok")\nFAIL  early report exits do not grow\n      → 64 now, budget 63\n'
const predicateTests = [
  ['ok: a hook that quoted the success text and was then refused is not ok', ok(quotedOk) === false],
  ['ok: a hook that reached its last line is ok', ok('4/4 checks passed\n\npre-commit: ok\n') === true],
  ['ok: empty output is not ok', ok('') === false],
  ['early: the count is read from the report line', early('  early report exits:    64  (ratchet, budget 63)\n') === 64],
  ['early: the LAST report line wins', early('early report exits: 1\nearly report exits: 63\n') === 63],
  ['early: no report line reads null', early('PASS  something\n') === null],
  ['failLines: only a line that STARTS with FAIL', failLines('PASS  a check that must FAIL on purpose\nFAIL  early report exits do not grow\n').length === 1],
  ['detailOf: the detail of the NAMED clause, not the first FAIL', detailOf(sample, /budget is not loose/) === '64 now, budget 63 — lower the budget to 64'],
  ['detailOf: a clause that did not fail has no detail (null)', detailOf(sample, /exists, or the ratchet/) === null],
  ['has: every token must be present', has('a b', ['a', 'b']) === true && has('a b', ['a', 'c']) === false],
  ['lacks: no token may be present', lacks('a b', ['c', 'd']) === true && lacks('a b', ['a', 'c']) === false],
  ['lacks: a missing detail is not "lacks"', lacks(null, ['x']) === false],
  ['counts: the first N/M line is read, pass before total', JSON.stringify(counts('PASS  x\n\n2/4 checks passed\n')) === '[2,4]' && counts('') === null],
]

// --- tree edits and the edits a person makes --------------------------------------------------------------------------------------------------------
const once = (text, anchor, what) => { const n = text.split(anchor).length - 1; assert(n === 1, `${what}: the anchor occurs ${n} times, not once`) }
const edit = (dir, rel, anchor, replacement, what) => {
  const p = path.join(dir, rel)
  const was = fs.readFileSync(p, 'utf8')
  once(was, anchor, what)
  const now = was.replace(anchor, () => replacement)
  assert(now !== was, `${what}: the edit changed nothing`)
  fs.writeFileSync(p, now)
  return rel
}
const entryText = (find, replace) => `    id: '${ENTRY}',\n    file: '${BUDGET}',\n    claim: "the early-exit budget is the count, not a number above it: a loose budget is a ratchet with slack in it",\n    find: "${find}",\n    replace: "${replace}",\n`
const setBudget = (dir, n) => {
  const p = path.join(dir, BUDGET)
  const was = fs.readFileSync(p, 'utf8')
  fs.writeFileSync(p, `${n}\n`)
  assert(fs.readFileSync(p, 'utf8') !== was, `the budget file changed (${JSON.stringify(was)} -> ${n})`)
  return BUDGET
}
const moveEntry = (dir, [f1, r1], [f2, r2]) => edit(dir, TABLE, entryText(f1, r1), entryText(f2, r2), `the ${ENTRY} entry ${f1}/${r1} -> ${f2}/${r2}`)
const trees = {
  shrunk: { count: 62, build: dir => edit(dir, SHRINK_FILE, 'process.exit(summarize(', 'finish(summarize(', 'the early exit of design-tokens-check') },
  grew: { count: 64, build: dir => edit(dir, GREW_FILE, 'const PICTOGRAPH =', 'if (false) process.exit(summarize())\nconst PICTOGRAPH =', 'the 64th early exit in glyph-check') },
  missing: { count: 63, build: dir => { fs.rmSync(path.join(dir, BUDGET)); assert(!fs.existsSync(path.join(dir, BUDGET)), 'the budget file is gone'); return null } },
  clean: { count: 63, build: () => null },
}

// --- the cases ----------------------------------------------------------------------------------------------------------------------------------------
const equality = /budget is not loose/
const growth = /early report exits do not grow/
const seen = {}
const detail = d => detailOf(d.out, equality)
const shrunkFacts = d => [
  ['the tree has one early exit fewer (the check run directly: non-zero, count 62)', d.status !== 0 && early(d.out) === 62],
  ['only the equality clause fails (one FAIL line, "budget is not loose")', failLines(d.out).length === 1 && equality.test(failLines(d.out)[0])],
]
const oldMessage = d => ['the OLD message says "lower the budget to 62" and names no file (not the budget file, the mutation file or its entry)', has(detail(d), ['lower the budget to 62']) && lacks(detail(d), [BUDGET, TABLE, ENTRY])]
const hookPasses = (r, n) => [
  ['the hook lets it through (exit 0, HEAD moved, "pre-commit: ok")', r.status === 0 && r.committed && ok(r.out)],
  [`the hook reached the line: count ${n}`, early(r.out) === n],
]
const entryCaught = m => ['and the moved entry is still CAUGHT (mutation-check --only exit-budget-loose: exit 0, PASS [exit-budget-loose])', m.status === 0 && /PASS\s+\[exit-budget-loose\]/.test(m.out)]
const sameVerdict = (key, d) => ['the verdict is unchanged: the same FAIL clauses as the old script', seen[key] !== undefined && JSON.stringify(failNames(d.out)) === JSON.stringify(seen[key])]

const cases = [
  { id: 'A0', script: 'before', tree: 'shrunk', hook: true, mutate: true,
    what: 'SHRUNK, script as at BASE, the budget file AND the entry moved to 62: control, the two-file edit',
    edits: dir => [setBudget(dir, 62), moveEntry(dir, [63, 64], [62, 64])],
    expect: ({ d, r, m }) => [...shrunkFacts(d), oldMessage(d), ...hookPasses(r, 62), entryCaught(m)] },
  { id: 'A1', script: 'before', tree: 'shrunk', hook: true,
    what: 'SHRUNK, script as at BASE, the budget file alone moved to 62 (what the old message says)',
    edits: dir => [setBudget(dir, 62)],
    expect: ({ d, r }) => [...shrunkFacts(d), oldMessage(d),
      ['the hook REFUSES it (non-zero exit, HEAD unchanged, last line is not "pre-commit: ok")', r.status !== 0 && !r.committed && !ok(r.out)],
      ['at check:mutation-anchors, naming the pinned entry (STALE  exit-budget-loose)', /STALE\s+exit-budget-loose/.test(r.out)],
      ['and the exit-drains check was never asked (no "early report exits" in the hook output)', early(r.out) === null]] },
  { id: 'A2', script: 'after', tree: 'shrunk', hook: true, mutate: true,
    what: 'SHRUNK, new script, exactly the edits the new message names (the budget file, and find "62" on the entry)',
    edits: dir => [setBudget(dir, 62), moveEntry(dir, [63, 64], [62, 64])],
    expect: ({ d, r, m }) => [...shrunkFacts(d),
      ['the NEW message names what to edit: "lower the budget to 62", the budget file, the mutation file, its entry and find: "62"', has(detail(d), ['lower the budget to 62', BUDGET, TABLE, ENTRY, 'find: "62"'])],
      ...hookPasses(r, 62), entryCaught(m)] },
  { id: 'A3', script: 'before', tree: 'grew', key: 'grew',
    what: 'GREW, script as at BASE, direct run',
    expect: ({ d }) => [
      ['the tree has the 64th early exit (non-zero, count 64)', d.status !== 0 && early(d.out) === 64],
      ['both clauses fail: "early report exits do not grow" and "budget is not loose"', failLines(d.out).length === 2 && growth.test(failLines(d.out)[0]) && equality.test(failLines(d.out)[1])],
      ['the OLD equality message tells a grown count to "lower the budget to 64", which is a raise', has(detail(d), ['lower the budget to 64'])]] },
  { id: 'A3a', script: 'after', tree: 'grew', key: 'grew',
    what: 'GREW, new script, direct run',
    expect: ({ d }) => [
      ['the tree has the 64th early exit (non-zero, count 64)', d.status !== 0 && early(d.out) === 64],
      sameVerdict('grew:before', d),
      ['the NEW equality message does not say "lower the budget" and names neither the mutation file nor its entry', lacks(detail(d), ['lower the budget', TABLE, ENTRY])],
      ['it says to remove the new early exit(s)', has(detail(d), ['remove the new early exit'])],
      ['and the first clause still names the new exit (scripts/glyph-check.mjs)', has(detailOf(d.out, growth), [GREW_FILE])]] },
  { id: 'A4', script: 'after', tree: 'grew', hook: true,
    what: 'GREW, new script, the budget moved to 64 and the entry to 64/65: the two-file edit on a grown tree',
    edits: dir => [setBudget(dir, 64), moveEntry(dir, [63, 64], [64, 65])],
    expect: ({ d, r }) => [
      ['the tree has the 64th early exit (non-zero, count 64)', d.status !== 0 && early(d.out) === 64],
      ...hookPasses(r, 64)] },
  { id: 'A5', script: 'before', tree: 'missing', key: 'missing',
    what: 'MISSING budget file, script as at BASE, direct run',
    expect: ({ d }) => [
      ['the budget file is missing (non-zero, count 63, "budget MISSING")', d.status !== 0 && early(d.out) === 63 && /budget MISSING/.test(d.out)],
      ['the OLD equality message says "lower the budget to 63" with nothing to lower', has(detail(d), ['lower the budget to 63'])]] },
  { id: 'A5a', script: 'after', tree: 'missing', key: 'missing',
    what: 'MISSING budget file, new script, direct run',
    expect: ({ d }) => [
      ['the budget file is missing (non-zero, count 63, "budget MISSING")', d.status !== 0 && early(d.out) === 63 && /budget MISSING/.test(d.out)],
      sameVerdict('missing:before', d),
      ['the NEW message calls it missing and does not say "lower"', has(detail(d), [BUDGET, 'missing']) && lacks(detail(d), ['lower'])]] },
  { id: 'A6', script: 'before', tree: 'clean', selfTest: 22,
    what: 'CLEAN, script as at BASE, direct run and self-test',
    expect: ({ d, s }) => [
      ['the check passes (exit 0, no FAIL line, count 63)', d.status === 0 && failLines(d.out).length === 0 && early(d.out) === 63],
      ['the self-test passes with 22 clauses', s.status === 0 && JSON.stringify(counts(s.out)) === '[22,22]']] },
  { id: 'A6a', script: 'after', tree: 'clean', selfTest: 26,
    what: 'CLEAN, new script, direct run and self-test',
    expect: ({ d, s }) => [
      ['the check passes (exit 0, no FAIL line, count 63)', d.status === 0 && failLines(d.out).length === 0 && early(d.out) === 63],
      ['the self-test passes with 26 clauses (22 and the four that pin the message)', s.status === 0 && JSON.stringify(counts(s.out)) === '[26,26]']] },
]

const lines = []
const say = s => { console.log(s); lines.push(s) }
let wrong = 0
let controlBad = false
let processed = 0
const times = {}
const worktrees = []
const links = []
const selected = cases.filter(c => !only || only.includes(c.id))

try {
  say(`scratch: ${scratch}`)
  say(`BASE ${BASE.slice(0, 8)}; patch ${fs.existsSync(patch) ? `${path.relative(repo, patch)} (${fs.readFileSync(patch, 'utf8').split('\n').filter(l => /^\+[^+]/.test(l)).length} lines added)` : 'not present (only the cases that need none can run)'}`)
  const brokenPredicates = predicateTests.filter(([, held]) => !held)
  say(`predicate self-test: ${predicateTests.length - brokenPredicates.length} of ${predicateTests.length} held`)
  if (brokenPredicates.length) throw new Error(`a predicate does not hold, so no commit is attempted: ${brokenPredicates.map(([n]) => n).join('; ')}`)
  say('')
  for (const c of selected) {
    if (c.script === 'after' && !fs.existsSync(patch)) throw new Error(`${c.id} needs ${path.relative(repo, patch)}`)
    const dir = path.join(scratch, c.id)
    must(repo, ['worktree', 'add', '--detach', dir, BASE])
    worktrees.push(dir)
    assert(head(dir) === BASE, `${c.id}: worktree is at ${BASE.slice(0, 8)}`)
    for (const f of ['package.json', 'package-lock.json']) {
      assert(fs.readFileSync(path.join(dir, f)).equals(fs.readFileSync(path.join(repo, f))), `${c.id}: ${f} is byte-identical to the main tree's`)
    }
    const link = path.join(dir, 'node_modules')
    fs.symlinkSync(path.join(repo, 'node_modules'), link, 'dir')
    links.push(link)
    assert(fs.existsSync(path.join(link, 'playwright', 'package.json')) && fs.existsSync(path.join(link, '@xmldom', 'xmldom', 'package.json')), `${c.id}: the linked node_modules holds playwright and @xmldom/xmldom`)
    const hookText = fs.readFileSync(path.join(dir, '.githooks', 'pre-commit'), 'utf8')
    assert(/^npm run --silent check:exit-drains$/m.test(hookText), `${c.id}: the hook at BASE already runs check:exit-drains`)
    const script = () => fs.readFileSync(path.join(dir, CHECK), 'utf8')
    if (c.script === 'after') {
      must(dir, ['apply', '--check', patch])
      must(dir, ['apply', patch])
      assert(script().includes('export const budgetAdvice'), `${c.id}: the patch added budgetAdvice`)
      const table = fs.readFileSync(path.join(dir, TABLE), 'utf8')
      assert(table.split("id: 'exit-advice-").length - 1 === 5, `${c.id}: the patch added five exit-advice entries to the table`)
    } else {
      assert(!script().includes('budgetAdvice'), `${c.id}: the script is the old one (no budgetAdvice)`)
    }
    const t = trees[c.tree]
    const changed = t.build(dir)
    const direct = run(dir, 'npm', ['run', '--silent', 'check:exit-drains'])
    const d = { status: direct.status, out: out(direct) }
    assert(early(d.out) === t.count, `${c.id}: the ${c.tree} tree has ${t.count} early report exits (read ${early(d.out)})`)
    const s = c.selfTest ? (x => ({ status: x.status, out: out(x) }))(run(dir, 'node', [CHECK, '--self-test'])) : null
    if (c.key) seen[`${c.key}:${c.script}`] = failNames(d.out)
    processed++

    let r = null
    let m = null
    let staged = ''
    if (c.hook) {
      const paths = [changed, ...c.edits(dir)].filter(Boolean)
      fs.writeFileSync(path.join(dir, NOTE), 'scratch proof, never pushed\n')
      for (const p of [...new Set(paths), NOTE]) must(dir, ['add', p])
      staged = must(dir, ['diff', '--cached', '--name-only']).split('\n').filter(Boolean).join(', ')
      const was = head(dir)
      const t0 = Date.now()
      const r0 = run(dir, 'git', ['-c', 'core.hooksPath=.githooks', '-c', 'user.email=claude@field.dev', '-c', 'user.name=FIELD CI',
        'commit', '-q', '-m', `scratch proof ${c.id}: never pushed`], { timeout: 600_000 })
      r = { status: r0.status, out: out(r0), committed: head(dir) !== was, secs: (Date.now() - t0) / 1000 }
      times[c.id] = r.secs
      if (c.mutate && r.committed) { const x = run(dir, 'node', [TABLE, '--only', ENTRY]); m = { status: x.status, out: out(x) } }
      else m = { status: null, out: '' }
    }

    say(`=== ${c.id}  ${c.script}  ${c.what}`)
    say(`  worktree at ${BASE.slice(0, 8)}${c.script === 'after' ? ' + patch' : ''}; node_modules linked (package files identical to the main tree's)`)
    say(`  the check run directly on the ${c.tree} tree: exit ${d.status}; early report exits ${early(d.out)}; ${failLines(d.out).length ? failLines(d.out).join(' | ') : 'no FAIL line'}`)
    const dt = detail(d)
    if (dt !== null) say(`  equality clause detail: ${dt}`)
    if (s) say(`  self-test: exit ${s.status}; ${JSON.stringify(counts(s.out))}`)
    if (r) {
      say(`  staged: ${staged}`)
      say(`  git commit: exit ${r.status}; HEAD ${r.committed ? 'moved' : 'unchanged'}; ${r.secs.toFixed(1)} s`)
      say('  hook output, last 12 lines:')
      for (const l of r.out.trimEnd().split('\n').slice(-12)) say(`    ${l}`)
      if (c.mutate) say(`  mutation-check --only ${ENTRY}: exit ${m.status}; ${m.out.trim().split('\n').filter(l => /^(PASS|FAIL)/.test(l)).join(' | ')}`)
    }
    for (const [what, pass] of c.expect({ d, r, m, s })) {
      say(`  ${pass ? 'AS EXPECTED' : 'NOT AS EXPECTED'}  ${what}`)
      if (!pass) { wrong++; if (c.id === 'A0') controlBad = true }
    }
    say('')
    if (controlBad) { say('THE CONTROL A0 IS NOT AS EXPECTED. Read its hook output above before concluding anything: a fault of the scratch worktree looks the same as a fault of the edit. Stopping before the rest is read.'); break }
  }
} finally {
  for (const link of links) if (fs.lstatSync(link, { throwIfNoEntry: false })?.isSymbolicLink()) fs.unlinkSync(link)
  for (const dir of worktrees) git(repo, ['worktree', 'remove', '--force', dir])
  git(repo, ['worktree', 'prune'])
}

const intact = fs.existsSync(path.join(repo, 'node_modules', 'playwright', 'package.json')) && fs.existsSync(path.join(repo, 'node_modules', '@xmldom', 'xmldom', 'package.json'))
say(`the main tree's node_modules after cleanup: ${intact ? 'intact (playwright and @xmldom/xmldom present)' : 'DAMAGED'}`)
if (!intact) wrong++
const hooked = Object.keys(times).length
say(`COVERAGE: ${processed} of ${cases.length} cases ran${only ? ` (--only ${only.join(',')})` : ''}; ${hooked} real git commit attempts, each with the real hook and the real npm, none stubbed; worktrees removed.`)
say(`whole-hook wall time, one run each: ${Object.entries(times).map(([k, v]) => `${k} ${v.toFixed(1)} s`).join(', ') || 'none'}`)
const complete = !only && selected.length === cases.length
say(processed === 0 ? 'RESULT: NO CASE RAN, so nothing is claimed.'
  : wrong === 0 ? `RESULT: ${complete ? 'all' : 'the selected'} ${processed} cases behaved as expected.` : `RESULT: ${wrong} expectation(s) not as expected, ${processed} of ${selected.length} selected cases run.`)
process.exitCode = wrong === 0 && processed > 0 ? 0 : 1
