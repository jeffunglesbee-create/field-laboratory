// Deletes THROWAWAY branches from the remote, by name, from a runner.
//
// WHY A RUNNER. The sandbox's git proxy does not carry a ref deletion: `git push origin --delete proof-fastfail` ends `the remote end hung up unexpectedly` (measured 2026-11-15). The proof
// branches of this repository's CI-as-proxy runs (`proof-*`: a throwaway branch with one workflow sabotaged on purpose, never merged) therefore piled up, and the owner approved deleting them
// (docs/CC-CMD-2026-11-11-runner-apt-mirror-dns.md, item 5). `.github/workflows/delete-branches.yml` runs this on a runner, whose token can.
//
// WHAT IT WILL DELETE, closed by construction: a name must match PROOF (`proof-` and lower-case letters, digits, dashes), must not be the default branch, and must be unique. ONE name that does not
// qualify refuses the whole list: nothing is deleted, exit 2. It deletes nothing without `--apply` (the workflow's first step is that dry run, so the plan is in the log before the deletion is).
// After deleting it asks the remote which of the names still exist, and exits 1 if any does.
//
// THE LIST IS GIVEN AFTER A BARE `--`, so that it is always a list: a dispatch input that starts with `--` (`--self-test`, `--force,proof-a`) is then refused as a name that does not qualify, not taken
// for a flag (round 4, finding 18: `--self-test` as the input ran the self-test and ended green with nothing planned). An unknown `--x` before the `--` is refused by name.
// THE DEFAULT BRANCH IS ASKED OF THE REMOTE (`git ls-remote --symref`), not assumed to be `main`: a repository whose default branch is named like a proof branch is refused it (round 4, finding 17).
//
// Usage:  node scripts/delete-branches.mjs -- "proof-a,proof-b"            the plan, nothing deleted
//         node scripts/delete-branches.mjs --apply -- "proof-a,proof-b"    the deletion
//         node scripts/delete-branches.mjs --self-test
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const PROOF = /^proof-[a-z0-9][a-z0-9-]*$/

/** Which of a list of names may be deleted: `{ ok: [names], refused: [{ name, why }] }`. Any refused name means none may be. */
export const plan = (list, defaultBranch = 'main') => {
  const names = String(list ?? '').split(/[\s,]+/).filter(Boolean)
  const refused = []
  if (names.length === 0) refused.push({ name: '(none)', why: 'no branch name was given' })
  const seen = new Set()
  for (const name of names) {
    if (name === defaultBranch || name === 'main' || name === 'master') refused.push({ name, why: 'it is the default branch' })
    else if (!PROOF.test(name)) refused.push({ name, why: 'it is not a throwaway proof branch (proof-<lower-case letters, digits, dashes>)' })
    else if (seen.has(name)) refused.push({ name, why: 'it is listed twice' })
    seen.add(name)
  }
  return { ok: refused.length === 0 ? names : [], refused }
}

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
/** The names, among `names`, that exist as branches on `remote`. */
export const existing = (names, remote, cwd) => {
  const out = git(['ls-remote', '--heads', remote], cwd)
  const have = new Set(out.split('\n').filter(Boolean).map(l => l.split('\t')[1]?.replace(/^refs\/heads\//, '')))
  return names.filter(n => have.has(n))
}

/** Deletes the planned names that exist; returns `{ deleted, absent, left, failed, unverified, unconfirmed }`. `left` is what the remote still has afterwards; `unverified` is why that could not be asked, with `unconfirmed` the names pushed without an error. `push` is the command that deletes (a stand-in in the self-test).
 *  The refspec is `:refs/heads/<name>`, not `--delete <name>`: a TAG of the same name makes the short form ambiguous, and git then refuses it; the full ref names the branch and nothing else.
 *  A deletion that throws is NAMED and does not stop the list: the names after it are still tried, and what is left is asked of the remote at the end (review 2026-11-15, finding 18: the first
 *  failure ended the run, with the rest untried and no account of what was left). */
/** The last lines git printed, which carry the reason: the final one is the generic `error: failed to push some refs`, and the `remote:` and `[remote rejected]` lines above it say why. */
export const reasonOf = e => {
  const lines = String(e.stderr ?? '').split('\n').map(l => l.trim()).filter(Boolean).slice(-6)
  const base = lines.length ? lines.join(' | ') : String(e.message ?? e).trim().split('\n')[0]
  return e.signal ? `${base} (signal ${e.signal})` : base
}

export const apply = (names, remote, cwd, push = git) => {
  const before = existing(names, remote, cwd)
  const absent = names.filter(n => !before.includes(n))
  const failed = []
  for (const name of before) {
    try { push(['push', remote, `:refs/heads/${name}`], cwd) } catch (e) { failed.push({ name, why: reasonOf(e) }) }
  }
  // The final question can fail too (the remote unreachable after the pushes): that must not discard what was done. What was pushed without an error is named as UNCONFIRMED and the run is red
  // (round 4, finding 20: the exception ended main() with the account of the deletions lost).
  let left = []
  let unverified = null
  try { left = existing(names, remote, cwd) } catch (e) { unverified = reasonOf(e) }
  const pushed = before.filter(n => !failed.some(f => f.name === n))
  return unverified
    ? { deleted: [], absent, left, failed, unverified, unconfirmed: pushed }
    : { deleted: before.filter(n => !left.includes(n)), absent, left, failed, unverified: null, unconfirmed: [] }
}

/** How a deletion run ends: red when a branch is still on the remote, a deletion failed, or what is left could not be asked. */
export const exitFor = r => (r.left.length > 0 || r.failed.length > 0 || r.unverified ? 1 : 0)

const FLAGS = new Set(['--apply', '--self-test'])
/** What an argv asks for: `{ apply, selfTest, list }`, or `{ error }`. A flag is a KNOWN `--x` before a bare `--`; an unknown one is an error; everything after a bare `--` is the list, so a list that starts
 *  with `--` is a list (and is refused as a name, truthfully). One list only. */
export const parseArgs = argv => {
  const flags = new Set(), positional = []
  let literal = false
  for (const a of argv) {
    if (literal) positional.push(a)
    else if (a === '--') literal = true
    else if (a.startsWith('--')) { if (!FLAGS.has(a)) return { error: `unknown option ${a} (a list of names goes after a bare \`--\`)` }; flags.add(a) }
    else positional.push(a)
  }
  if (positional.length > 1) return { error: `one list of names was expected, got ${positional.length} arguments` }
  return { apply: flags.has('--apply'), selfTest: flags.has('--self-test'), list: positional[0] }
}

/** The remote's default branch, asked of the remote: `git ls-remote --symref <remote> HEAD` prints `ref: refs/heads/<name>\tHEAD` first. Throws when it does not say. */
export const defaultBranchOf = (remote, cwd) => {
  const m = /^ref: refs\/heads\/(\S+)\tHEAD$/m.exec(git(['ls-remote', '--symref', remote, 'HEAD'], cwd))
  if (!m) throw new Error(`\`git ls-remote --symref ${remote} HEAD\` did not name the default branch of ${remote}`)
  return m[1]
}

const main = () => {
  const refuse = lines => {
    for (const l of lines) console.log(l)
    console.log('\nNothing was deleted: one name that does not qualify refuses the whole list.')
    process.exit(2)
  }
  const a = parseArgs(process.argv.slice(2))
  if (a.error) refuse([`REFUSED  ${a.error}`])
  let defaultBranch
  try { defaultBranch = defaultBranchOf('origin') } catch (e) { refuse([`REFUSED  the default branch of origin could not be determined, so nothing can be said not to be it: ${reasonOf(e)}`]) }
  const p = plan(a.list, defaultBranch)
  if (p.refused.length > 0) refuse(p.refused.map(r => `REFUSED  ${r.name}: ${r.why}`))
  console.log(`plan: ${p.ok.length} throwaway branch(es): ${p.ok.join(', ')} (default branch: ${defaultBranch})`)
  if (!a.apply) { console.log('dry run (no --apply): nothing deleted'); return }
  const r = apply(p.ok, 'origin')
  console.log(`deleted ${r.deleted.length} of ${p.ok.length}: ${r.deleted.join(', ') || '(none)'}${r.absent.length ? `; already absent: ${r.absent.join(', ')}` : ''}`)
  for (const f of r.failed) console.log(`FAILED  ${f.name}: ${f.why}`)
  if (r.left.length > 0) console.log(`STILL THERE: ${r.left.join(', ')}`)
  if (r.unverified) console.log(`COULD NOT CONFIRM what is left on the remote (${r.unverified}); pushed without an error: ${r.unconfirmed.join(', ') || '(none)'}`)
  process.exit(exitFor(r))
}

/** THE WORKFLOW IS PINNED, NOT READ (round 5, findings 12, 13, 14, 19). `.github/workflows/delete-branches.yml` is a tiny single-purpose file whose whole safety is its shape: `--apply` on the Delete step
 *  and nowhere else, no `continue-on-error`, no `if`, the input reaching the script only through the environment. Reading it clause by clause (the first line of each `run:`, the literal text
 *  `inputs.branches`, the `on:` block by regex) lost, each round, to one more spelling it did not read: a wrapped `run:` continuation ending `|| true`, `inputs['branches']`, a list hard-coded in the
 *  Delete step, an extra step. So the file is compared to a COPY of itself: every line that is not a whole-line comment, a blank line or trailing whitespace must be the line the pin has, in the
 *  same order, and nothing may follow. A wrapped continuation, another spelling of the input, an extra step or job, `shell:`, a changed key: each is a different line, so each is red, by
 *  construction. There is no clause beside the comparison (one mechanism, no second layer).
 *  AN INTENDED EDIT OF THE WORKFLOW IS ALSO AN EDIT OF THIS PIN, in the same commit: the message says so. (The comment lines of the workflow are free text and are not pinned.) */
export const WORKFLOW_PIN = `name: delete-branches
on:
  workflow_dispatch:
    inputs:
      branches:
        description: 'Comma-separated throwaway branch names, each proof-<lower-case letters, digits, dashes>. Anything else, the default branch included, refuses the whole list.'
        required: true
permissions:
  contents: write
jobs:
  delete:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - name: Plan (dry run)
        env:
          BRANCHES: \${{ inputs.branches }}
        run: node scripts/delete-branches.mjs -- "$BRANCHES"
      - name: Delete
        env:
          BRANCHES: \${{ inputs.branches }}
        run: node scripts/delete-branches.mjs --apply -- "$BRANCHES"`

/** The lines of a workflow text that count: trailing space, tab and CR dropped (a CRLF file included), then blank lines and whole-line comments (first character after space and tab is `#`) dropped. Nothing else
 *  is dropped. A `#` after other text is part of its line, so a changed `run:` line cannot hide behind one. Only space, tab and CR are whitespace here (a closed list, not `\s`): YAML keeps a no-break space
 *  (U+00A0, what a paste from a rich-text page brings), a form feed or a BOM as content, so a line that ends in or consists of one is a different line, not a blank one. */
const significant = text => String(text).split('\n').map(l => l.replace(/[ \t\r]+$/, '')).filter(l => l !== '' && !/^[ \t]*#/.test(l))

/** What is wrong with `.github/workflows/delete-branches.yml` (or any text given): a list, empty when it is the pin, else ONE problem naming the first line that differs (expected, found). */
export const workflowProblems = (text, pin = WORKFLOW_PIN) => {
  const want = significant(pin), got = significant(text)
  const show = l => (l === undefined ? 'nothing (the text ends here)' : `\`${l}\``)
  for (let i = 0; i < Math.max(want.length, got.length); i++) {
    if (want[i] !== got[i]) return [`the workflow differs from its pin at significant line ${i + 1} (comments, blank lines and trailing space are not counted): expected ${show(want[i])}, found ${show(got[i])}. An intended edit of the workflow also edits WORKFLOW_PIN in scripts/delete-branches.mjs.`]
  }
  return []
}

/** THE SELF-TEST'S CHILDREN CARRY THIS IN THEIR ENVIRONMENT, and a run that carries it refuses `--self-test` at once (round 5, A18 observation). The self-test runs main() as child processes; a main() whose argv parse
 *  lets `--self-test` through (the round-4 defect, re-introduced by an edit or a mutation) ran the self-test again inside every child, which started children of its own: 86 orphaned processes and a 120 s timeout
 *  before the harness saw anything. With the marker, the second level is refused with exit 2 before it reads a fixture, so the recursion cannot start, whatever the parse does. */
export const SELF_TEST_CHILD = 'DELETE_BRANCHES_SELF_TEST_CHILD'

// --- self-test -----------------------------------------------------------------------
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (parseArgs(process.argv.slice(2)).selfTest) {
    if (process.env[SELF_TEST_CHILD]) { console.error(`REFUSED  --self-test: this process is a child of a self-test (${SELF_TEST_CHILD} is set), and a self-test child never runs the self-test`); process.exit(2) }
    // THE MARKER IS SET HERE, ONCE, in this process's own environment, so that every child it starts inherits it (a child started with `{ ...process.env }` too). Read first: a value of 'probe' says this
    // process was started by the refusal fixture below, which only happens to run the self-test when the guard above is absent.
    const isProbeChild = process.env[SELF_TEST_CHILD] === 'probe'
    process.env[SELF_TEST_CHILD] = '1'
    const { createChecks, finish } = await import('./checks.mjs')
    const { chmodSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { check, summarize } = createChecks()
    const bad = (list, re) => { const p = plan(list); return p.ok.length === 0 && p.refused.some(r => re.test(r.why)) }
    check('a list of proof branches is planned whole, in order', JSON.stringify(plan('proof-a, proof-b-2,proof-c').ok) === '["proof-a","proof-b-2","proof-c"]' && plan('proof-a').refused.length === 0)
    check('THE DEFAULT BRANCH IS REFUSED, whatever else is listed with it, and nothing of the list is planned', bad('proof-a,main', /default branch/) && bad('master', /default branch/) && bad('proof-a,develop', /default branch|not a throwaway/) === true && plan('proof-a,main').ok.length === 0)
    // A default branch that is itself named like a proof branch: the PROOF test lets it through, so only the `defaultBranch` argument stands between it and the deletion.
    // (`main` and `master` are refused by the PROOF test as well, so the check above cannot tell whether `name === defaultBranch` is there.)
    check('A DEFAULT BRANCH NAMED LIKE A PROOF BRANCH IS REFUSED (the argument, not the pattern, decides it), and the list is not planned',
      (() => { const p = plan('proof-a,proof-keep', 'proof-keep'); return p.ok.length === 0 && p.refused.some(r => r.name === 'proof-keep' && /default branch/.test(r.why)) })()
      && plan('proof-a,proof-keep', 'main').ok.length === 2)
    check('a branch that is not a proof branch is refused (a claude/ branch, a feature branch, a flag, a path, a glob, upper case, a bare `proof-`)',
      ['claude/x', 'feature-x', '--force', 'proof-', 'proof-A', 'proof-a/b', 'proof-*', ':proof-a', 'refs/heads/proof-a', 'proof-a;rm'].every(n => bad(`proof-ok,${n}`, /not a throwaway|default/) || bad(n, /not a throwaway|default/)))
    check('an empty list and a repeated name are refused', bad('', /no branch name/) && bad(' , ', /no branch name/) && bad('proof-a,proof-a', /twice/))
    // The deletion itself, against a real bare repository standing in for the remote.
    const dir = mkdtempSync(join(tmpdir(), 'delete-branches-'))
    try {
      const remote = join(dir, 'remote.git'), work = join(dir, 'work')
      const g = (a, cwd) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: 'pipe' })
      g(['init', '-q', '--bare', '-b', 'main', remote]); g(['init', '-q', '-b', 'main', work])
      g(['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'base'], work)
      g(['remote', 'add', 'origin', remote], work)
      for (const b of ['main', 'proof-a', 'proof-b', 'claude-keep']) g(['push', '-q', 'origin', `HEAD:refs/heads/${b}`], work)
      const r = apply(['proof-a', 'proof-b', 'proof-gone'], 'origin', work)
      check('THE DELETION: the named proof branches are gone from the remote, one that was never there is reported absent, and the others are untouched',
        JSON.stringify(r.deleted) === '["proof-a","proof-b"]' && JSON.stringify(r.absent) === '["proof-gone"]' && r.left.length === 0
          && JSON.stringify(existing(['main', 'proof-a', 'proof-b', 'claude-keep'], 'origin', work)) === '["main","claude-keep"]', JSON.stringify(r))
      for (const b of ['proof-c']) g(['push', '-q', 'origin', `HEAD:refs/heads/${b}`], work)
      const silent = apply(['proof-c'], 'origin', work, () => '')
      check('A DELETION THAT CLAIMS TO HAVE WORKED AND DID NOT is caught by asking the remote afterwards: the branch is reported left, not deleted', silent.left.length === 1 && silent.deleted.length === 0, JSON.stringify(silent))
      for (const b of ['proof-x', 'proof-y']) g(['push', '-q', 'origin', `HEAD:refs/heads/${b}`], work)
      g(['push', '-q', 'origin', 'HEAD:refs/tags/proof-x'], work)
      const tagged = apply(['proof-x', 'proof-y'], 'origin', work)
      check('A TAG OF THE SAME NAME DOES NOT STOP IT: both branches are deleted, the tag is left alone, and nothing failed',
        JSON.stringify(tagged.deleted) === '["proof-x","proof-y"]' && tagged.failed.length === 0 && tagged.left.length === 0 && /refs\/tags\/proof-x/.test(g(['ls-remote', '--tags', 'origin'], work)), JSON.stringify(tagged))
      for (const b of ['proof-p', 'proof-q']) g(['push', '-q', 'origin', `HEAD:refs/heads/${b}`], work)
      const flaky = apply(['proof-p', 'proof-q'], 'origin', work, (args, cwd) => {
        if (args[2] === ':refs/heads/proof-p') throw Object.assign(new Error('boom'), { stderr: 'remote: permission denied\n ! [remote rejected] proof-p (protected)\nerror: failed to push some refs to origin\n' })
        return git(args, cwd)
      })
      check('A DELETION THAT THROWS DOES NOT STOP THE LIST: the name after it is still deleted, the failure is named with its reason, and what is left is reported',
        JSON.stringify(flaky.deleted) === '["proof-q"]' && flaky.failed.length === 1 && flaky.failed[0].name === 'proof-p' && /remote: permission denied/.test(flaky.failed[0].why) && /\[remote rejected\] proof-p \(protected\)/.test(flaky.failed[0].why) && /failed to push some refs/.test(flaky.failed[0].why) && JSON.stringify(flaky.left) === '["proof-p"]', JSON.stringify(flaky))
      const again = apply(['proof-a'], 'origin', work)
      check('...and running it again deletes nothing and fails nothing', again.deleted.length === 0 && again.absent.length === 1 && again.left.length === 0, JSON.stringify(again))

      // MAIN, END TO END, as the workflow starts it (round 4, findings 16-18: main() was never run by the self-test, so a dry run that deleted, a refusal that exited 0 and an argv parse that dropped a list
      // all stayed green). Each scenario is a fresh bare repository standing in for the remote, and main() is a child process run in a clone of it.
      const SELF = fileURLToPath(import.meta.url)
      // `rejectDeletes`: true refuses every deletion, a branch name refuses that branch's only. `vanishAfterPush`: the remote is READ through a symlink and WRITTEN through its real path (`pushurl`), and the first
      // accepted push removes the symlink, so the question asked after the pushes cannot be answered (a remote that becomes unreadable between the pushes and the final ls-remote).
      const fixture = (name, def, branches, { rejectDeletes = false, vanishAfterPush = false } = {}) => {
        const rem = join(dir, `${name}.git`), wk = join(dir, name)
        g(['init', '-q', '--bare', '-b', def, rem]); g(['init', '-q', '-b', def, wk])
        g(['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'base'], wk)
        g(['remote', 'add', 'origin', rem], wk)
        for (const b of branches) g(['push', '-q', 'origin', `HEAD:refs/heads/${b}`], wk)
        if (rejectDeletes) {
          const refused = rejectDeletes === true ? '*' : `refs/heads/${rejectDeletes}`
          writeFileSync(join(rem, 'hooks', 'pre-receive'), `#!/bin/sh\nwhile read old new ref; do\n  case "$new" in *[!0]*) ;; *) case "$ref" in ${refused}) echo "deletion refused by the fixture" >&2; exit 1 ;; esac ;; esac\ndone\n`)
          chmodSync(join(rem, 'hooks', 'pre-receive'), 0o755)
        }
        if (vanishAfterPush) {
          const link = join(dir, `${name}.link`)
          symlinkSync(rem, link)
          g(['remote', 'set-url', 'origin', link], wk); g(['remote', 'set-url', '--push', 'origin', rem], wk)
          writeFileSync(join(rem, 'hooks', 'post-receive'), `#!/bin/sh\nrm -f '${link}'\n`)
          chmodSync(join(rem, 'hooks', 'post-receive'), 0o755)
        }
        return { remote: rem, work: wk }
      }
      const headsAt = (f, where) => JSON.stringify(g(['ls-remote', '--heads', where], f.work).split('\n').filter(Boolean).map(l => l.split('\t')[1].replace('refs/heads/', '')).sort())
      const heads = f => headsAt(f, 'origin'), realHeads = f => headsAt(f, f.remote)
      // Every child the self-test starts inherits the marker, which the self-test set in its own environment before it started any (see SELF_TEST_CHILD and `isProbeChild`).
      const spawnChild = (argv, cwd) => { const r = spawnSync(process.execPath, argv, { cwd, encoding: 'utf8', timeout: 60000 }); return { status: r.status, out: `${r.stdout}${r.stderr}` } }
      const runMain = (f, ...args) => spawnChild([SELF, ...args], f.work)
      // THE RECURSION CANNOT START (round 5, A18 observation): a child that carries the marker and is asked for --self-test refuses at once, and every child the self-test starts carries it. The refusal
      // fixture runs a child with the marker 'probe'; a child that finds it set to 'probe' is the guard's absence (it ran the self-test instead of refusing), so it skips this fixture and the recursion stops
      // here, at one level, with the parent's check red. (Without the explicit 'probe' the child would inherit the marker and be refused, so dropping it from this call cannot start a recursion either.)
      if (!isProbeChild) {
        const probe = spawnSync(process.execPath, [SELF, '--self-test'], { cwd: dir, encoding: 'utf8', timeout: 60000, env: { ...process.env, [SELF_TEST_CHILD]: 'probe' } })
        const asked = { status: probe.status, out: `${probe.stdout}${probe.stderr}` }
        check('A SELF-TEST CHILD IS REFUSED THE SELF-TEST AT ONCE: `--self-test` with the marker set exits 2 saying so, and prints no check result',
          asked.status === 2 && /REFUSED  --self-test: this process is a child of a self-test/.test(asked.out) && !/checks passed/.test(asked.out), `exit ${asked.status}; ${asked.out.slice(-300)}`)
        const carried = spawnChild(['-e', "process.stdout.write(process.env.DELETE_BRANCHES_SELF_TEST_CHILD ?? 'unset')"], dir)
        check('EVERY CHILD THE SELF-TEST STARTS CARRIES THE MARKER (a literal name, not the constant read back): the child prints 1', SELF_TEST_CHILD === 'DELETE_BRANCHES_SELF_TEST_CHILD' && carried.out === '1', `${SELF_TEST_CHILD}; child printed ${JSON.stringify(carried.out)}`)
      }
      const a1 = parseArgs(['--apply', '--', 'proof-a']), a2 = parseArgs(['--', '--self-test']), a3 = parseArgs(['--force,proof-a']), a4 = parseArgs(['proof-a', 'proof-b'])
      const a5 = parseArgs(['--self-test']), a6 = parseArgs(['proof-a']), a7 = parseArgs([])
      check('THE ARGV: a list after a bare `--` is a list whatever it starts with (`--self-test` is a name to refuse, not a flag), an unknown `--x` before it is an error, two lists are an error, and a list with no `--` still works',
        a1.apply === true && a1.list === 'proof-a' && a2.selfTest === false && a2.list === '--self-test' && bad(a2.list, /not a throwaway/) && /unknown option --force,proof-a/.test(a3.error) && /one list/.test(a4.error)
          && a5.selfTest === true && a6.list === 'proof-a' && a6.apply === false && a7.list === undefined && a7.error === undefined, JSON.stringify({ a1, a2, a3, a4, a5, a6, a7 }))
      const dk = fixture('dk', 'proof-keep', ['proof-keep', 'proof-a'])
      const bare = join(dir, 'unborn.git')
      g(['init', '-q', '--bare', '-b', 'main', bare])
      check('THE DEFAULT BRANCH IS ASKED OF THE REMOTE: a default branch named proof-keep is read as that, and a remote that names none is an error, not `main`',
        defaultBranchOf('origin', dk.work) === 'proof-keep' && (() => { try { defaultBranchOf(bare, dk.work); return false } catch (e) { return /did not name the default branch/.test(e.message) } })())
      // ...and main() REFUSES when it cannot be told (nothing can be said not to be the default branch): exit 2, and the message says so.
      const w8 = join(dir, 'w8')
      g(['init', '-q', '-b', 'main', w8]); g(['remote', 'add', 'origin', bare], w8)
      const undetermined = runMain({ work: w8 }, '--apply', '--', 'proof-a')
      check('MAIN REFUSES WHEN THE REMOTE DOES NOT NAME ITS DEFAULT BRANCH: exit 2 and the reason, not a plan against an assumed `main`',
        undetermined.status === 2 && /REFUSED  the default branch of origin could not be determined/.test(undetermined.out), `exit ${undetermined.status}; ${undetermined.out.slice(-300)}`)
      const m1 = fixture('m1', 'main', ['main', 'proof-a', 'proof-b', 'claude-keep'])
      const dry = runMain(m1, '--', 'proof-a,proof-b')
      check('MAIN, A DRY RUN (no --apply) DELETES NOTHING: exit 0, the plan names the default branch, and all four branches are still on the remote',
        dry.status === 0 && /plan: 2 throwaway branch\(es\): proof-a, proof-b \(default branch: main\)/.test(dry.out) && /dry run/.test(dry.out) && heads(m1) === '["claude-keep","main","proof-a","proof-b"]', `exit ${dry.status}; ${dry.out.slice(-300)}; ${heads(m1)}`)
      const live = runMain(m1, '--apply', '--', 'proof-a,proof-b')
      check('MAIN WITH --apply DELETES THE NAMED BRANCHES AND NOTHING ELSE: exit 0, `deleted 2 of 2`, and what is left on the remote is main and claude-keep',
        live.status === 0 && /deleted 2 of 2: proof-a, proof-b/.test(live.out) && heads(m1) === '["claude-keep","main"]', `exit ${live.status}; ${live.out.slice(-300)}; ${heads(m1)}`)
      const m3 = fixture('m3', 'main', ['main', 'proof-a', 'claude-keep'])
      const refusedRun = runMain(m3, '--apply', '--', 'proof-a,claude-keep')
      check('MAIN REFUSES A LIST WITH ONE BAD NAME, with --apply: exit 2, the name is printed, and proof-a (a good name in the same list) is still on the remote',
        refusedRun.status === 2 && /REFUSED  claude-keep: it is not a throwaway/.test(refusedRun.out) && heads(m3) === '["claude-keep","main","proof-a"]', `exit ${refusedRun.status}; ${refusedRun.out.slice(-300)}; ${heads(m3)}`)
      const m4 = fixture('m4', 'proof-keep', ['proof-keep', 'proof-a'])
      const dflt = runMain(m4, '--apply', '--', 'proof-a,proof-keep'), afterDflt = heads(m4)
      const dfltOk = runMain(m4, '--apply', '--', 'proof-a')
      check('MAIN PASSES THE REMOTE\'S DEFAULT BRANCH TO THE PLAN: a default branch named proof-keep is refused with the rest of the list (exit 2, nothing deleted), and proof-a alone is deleted with proof-keep left',
        dflt.status === 2 && /REFUSED  proof-keep: it is the default branch/.test(dflt.out) && afterDflt === '["proof-a","proof-keep"]' && dfltOk.status === 0 && heads(m4) === '["proof-keep"]', `exit ${dflt.status}; ${dflt.out.slice(-300)}; ${afterDflt} -> ${heads(m4)}`)
      const m5 = fixture('m5', 'main', ['main', 'proof-a'])
      const selfList = runMain(m5, '--apply', '--', '--self-test'), flagList = runMain(m5, '--apply', '--force,proof-a')
      check('A LIST THAT STARTS WITH `--` IS REFUSED, not taken for a flag: `-- --self-test` exits 2 naming it and prints no self-test result, `--force,proof-a` exits 2 as an unknown option, and nothing is deleted',
        selfList.status === 2 && /REFUSED  --self-test: it is not a throwaway/.test(selfList.out) && !/checks passed/.test(selfList.out) && flagList.status === 2 && /unknown option --force,proof-a/.test(flagList.out) && heads(m5) === '["main","proof-a"]',
        `${selfList.status} ${selfList.out.slice(-200)} | ${flagList.status} ${flagList.out.slice(-200)} | ${heads(m5)}`)
      const m6 = fixture('m6', 'main', ['main', 'proof-p'], { rejectDeletes: true })
      const rejected = runMain(m6, '--apply', '--', 'proof-p')
      check('A DELETION THE REMOTE REJECTS ENDS THE RUN RED through main(): exit 1, FAILED with the remote\'s reason, STILL THERE, and the branch is on the remote',
        rejected.status === 1 && /FAILED  proof-p: .*deletion refused by the fixture/.test(rejected.out) && /STILL THERE: proof-p/.test(rejected.out) && heads(m6) === '["main","proof-p"]', `exit ${rejected.status}; ${rejected.out.slice(-400)}`)
      const m7 = fixture('m7', 'main', ['main', 'proof-u', 'proof-v'])
      const vanished = apply(['proof-u', 'proof-v'], 'origin', m7.work, (args, cwd) => { git(args, cwd); if (args[2] === ':refs/heads/proof-v') renameSync(m7.remote, `${m7.remote}.gone`) })
      check('A FINAL QUESTION THAT FAILS KEEPS THE ACCOUNT: apply() returns instead of throwing, says why it could not confirm, names what was pushed without an error as unconfirmed, and the run exits 1',
        typeof vanished.unverified === 'string' && vanished.unverified.length > 0 && JSON.stringify(vanished.unconfirmed) === '["proof-u","proof-v"]' && vanished.failed.length === 0 && vanished.deleted.length === 0 && exitFor(vanished) === 1, JSON.stringify(vanished))
      // MAIN'S OWN ACCOUNT WHEN THE FINAL QUESTION FAILS (round 5, A16 and A20). The check above runs apply() alone; the print and the exit that main() makes of its `unverified` result were never run, so
      // dropping the COULD NOT CONFIRM line or exiting 0 there stayed green. Here the remote becomes unreadable after the pushes, and main() is run as the workflow runs it.
      const m8 = fixture('m8', 'main', ['main', 'proof-u', 'proof-v'], { vanishAfterPush: true })
      const unconfirmed = runMain(m8, '--apply', '--', 'proof-u,proof-v')
      check('MAIN, WHEN WHAT IS LEFT CANNOT BE ASKED (the remote unreadable after the pushes): exit 1, `deleted 0 of 2`, COULD NOT CONFIRM with the reason, both names listed as pushed without an error, and the remote really lost both',
        unconfirmed.status === 1 && /deleted 0 of 2: \(none\)/.test(unconfirmed.out) && /COULD NOT CONFIRM what is left on the remote \(.+\); pushed without an error: proof-u, proof-v$/m.test(unconfirmed.out) && realHeads(m8) === '["main"]',
        `exit ${unconfirmed.status}; ${unconfirmed.out.slice(-400)}; ${realHeads(m8)}`)
      // ...and with one deletion REJECTED as well: the rejected branch is FAILED, and is not listed as pushed without an error (its push did not succeed, so it was not pushed).
      const m9 = fixture('m9', 'main', ['main', 'proof-r', 'proof-s'], { rejectDeletes: 'proof-r', vanishAfterPush: true })
      const mixed = runMain(m9, '--apply', '--', 'proof-r,proof-s')
      check('MAIN, A REJECTED DELETION AND A FINAL QUESTION THAT FAILS: exit 1, FAILED proof-r with the remote\'s reason, only proof-s is listed as pushed without an error (not the rejected proof-r), and proof-r is still on the remote',
        mixed.status === 1 && /FAILED  proof-r: .*deletion refused by the fixture/.test(mixed.out) && /COULD NOT CONFIRM .+; pushed without an error: proof-s$/m.test(mixed.out) && !/pushed without an error: .*proof-r/.test(mixed.out) && realHeads(m9) === '["main","proof-r"]',
        `exit ${mixed.status}; ${mixed.out.slice(-500)}; ${realHeads(m9)}`)
      // THE WORKFLOW IS COMPARED TO ITS PIN (round 5, findings 12-14). Two different things are proven, and neither is built from the other's text:
      //  - the REAL file is read and must be the pin: a table entry (or a person) that edits the real workflow gets a FAIL line here that names the line that differs;
      //  - the MUTANTS are built from the PIN constant, never from the file, so editing the file cannot make the mutant builder fail (it used to throw "anchor is not unique" before workflowProblems
      //    ran, and four of the five workflow table entries passed by that stack trace with no FAIL line at all). A mutant whose anchor is not in the pin is a FAIL line too, never a throw.
      let wfReal = null, wfReadError = null
      try { wfReal = readFileSync(new URL('../.github/workflows/delete-branches.yml', import.meta.url), 'utf8') } catch (e) { wfReadError = String(e.message ?? e) }
      const wfRealProblems = wfReal === null ? [`could not read .github/workflows/delete-branches.yml: ${wfReadError}`] : workflowProblems(wfReal)
      check('THE REAL .github/workflows/delete-branches.yml IS ITS PIN (comments, blank lines and trailing space aside): no line differs, none is missing, none is added', wfRealProblems.length === 0, wfRealProblems.join(' | '))
      // THE ANCHORS OF THE MUTANTS ARE FOUND IN THE PIN, NOT COPIED FROM IT (round 6, finding B13). The mutants used to be built from hard-coded text blocks of the pin (the Delete step's `name:` line, its env block, the
      // Plan and Delete blocks side by side), so an INTENDED edit inside either step, made to the workflow and to WORKFLOW_PIN as the first refusal says, left a block that was no longer in the pin and turned this
      // self-test red (`no unique anchor in the pin for: the Delete step before the Plan step`; renaming the Delete step, two more). Now each step is LOCATED by its `run:` line (the one that calls the script with
      // --apply is the Delete step, the one that calls it with no flag is the Plan step: DEL_RUN_RE, PLAN_RUN_RE), its first line is the `- ` line two columns left of that, and its env line is the one that holds
      // INPUT_RE; every anchor and every replacement is cut from the pin's own lines. What is still literal is a line of the pin that no step owns (the triggers, `contents: write`, `required: true`, the input's
      // description): a literal that is no longer in the pin is a FAIL line that quotes it. An anchor that cannot be found names the regexp that found nothing (below).
      // ROUND 6b, F-C-1: the two mutants that were still built from the literal `"$BRANCHES"` (the input inlined into the run line, the list not after a bare --) are cut from the pin too. The Delete run is the whole
      // of its `run:` value (a line under it, indented deeper, belongs to it), the variable's name is the key of the env line INPUT_RE found, its reference is whatever spelling of that name the run has (`$NAME`,
      // `${NAME}`, quoted or not), and the bare -- is found where it stands. So an intended edit that renames the variable, braces it or wraps the line, made to the workflow and to the pin, is no false red. A mutant whose
      // EDIT finds nothing to change (its pattern matches nothing in its anchor) is unbuilt and named, with the pattern, as a literal anchor that is not in the pin is: it is never a `survived`.
      const makeOn = pin => (from, to) => (pin.split(from).length === 2 ? pin.replace(from, () => to) : null)
      const wfMake = makeOn(WORKFLOW_PIN)
      const DEL_RUN_RE = /^\s+run: .*delete-branches\.mjs --apply /, PLAN_RUN_RE = /^\s+run: .*delete-branches\.mjs -- /, INPUT_RE = /\$\{\{ inputs\.branches \}\}/
      const indentOf = l => l.length - l.trimStart().length
      // A MUTANT'S EDIT THAT FINDS NOTHING TO EDIT IS NOT A MUTANT (round 6b, F-C-1). `sub` used to leave the text as it was when its pattern matched nothing, the mutant was then the pin itself, and the pin comparison
      // reported it as `survived`: a label that names neither the pattern nor where to edit it. `sub` now answers a Miss (it carries the pattern), `cat` passes a Miss on, and the builder reports it as unbuilt.
      class Miss { constructor(from) { this.from = from } }
      const cat = (...parts) => { const bad = parts.find(p => p === null || p instanceof Miss); return bad === undefined ? parts.join('') : bad }
      const sub = (text, from, to) => (text === null || text instanceof Miss ? text : (typeof from === 'string' ? text.includes(from) : from.test(text)) ? text.replace(from, () => to) : new Miss(from))
      const anchorsOf = pinText => {
        const lines = pinText.split('\n')
        const find = (re, from = 0, to = lines.length) => { for (let i = from; i < to; i++) if (re.test(lines[i])) return i; return -1 }
        const stepStart = at => { if (at < 0) return -1; for (let i = at; i >= 0; i--) if (lines[i].trimStart().startsWith('- ') && indentOf(lines[i]) === indentOf(lines[at]) - 2) return i; return -1 }
        // A run: value may go on over the lines under it (YAML reads a plain scalar's continuation): the last line of it is the last line, directly below, that is indented deeper than the `run:` line.
        const runEnd = at => { if (at < 0) return -1; let e = at; while (e + 1 < lines.length && lines[e + 1].trim() !== '' && indentOf(lines[e + 1]) > indentOf(lines[at])) e++; return e }
        const delRun = find(DEL_RUN_RE), planRun = find(PLAN_RUN_RE), delFirst = stepStart(delRun), planFirst = stepStart(planRun)
        const delEnv = delFirst < 0 ? -1 : find(INPUT_RE, delFirst, delRun), planEnv = planFirst < 0 ? -1 : find(INPUT_RE, planFirst, planRun)
        const delEnd = runEnd(delRun)
        // The Plan step's name is the line that holds its `name:` key, wherever the step puts it (the key order of a YAML step is free: `- id: plan` may come first, `name:` below it).
        const planName = planFirst < 0 ? -1 : find(/^\s*(?:- )?name:/, planFirst, planRun)
        // The input reaches the Delete run through the variable its INPUT_RE line sets: the variable's name, and its reference in whatever spelling the run line gives it (`$NAME`, `${NAME}`, quoted or not), are read off the pin.
        const envLine = delEnv < 0 ? '' : lines[delEnv]
        const VAR = /^\s*([A-Za-z_][A-Za-z0-9_]*):/.exec(envLine)?.[1] ?? null, EXPR = INPUT_RE.exec(envLine)?.[0] ?? null
        const missing = [
          [delRun < 0, "the Delete step's run line (no line of the pin matches DEL_RUN_RE: a `run:` that calls delete-branches.mjs with --apply)"],
          [planRun < 0, "the Plan step's run line (no line of the pin matches PLAN_RUN_RE: a `run:` that calls delete-branches.mjs with no flag before the bare --)"],
          [delFirst < 0, "the Delete step's first line (no `- ` line two columns left of its run line)"], [planFirst < 0, "the Plan step's first line (no `- ` line two columns left of its run line)"],
          [delEnv < 0, "the Delete step's env line (none of its lines holds `${{ inputs.branches }}`, INPUT_RE)"], [planEnv < 0, "the Plan step's env line (none of its lines holds `${{ inputs.branches }}`, INPUT_RE)"],
          [planFirst >= 0 && planName < 0, "the Plan step's name line (none of its lines above the run line starts `name:` or `- name:`)"],
          [delEnv >= 0 && VAR === null, "the Delete step's env variable (its INPUT_RE line is not `NAME: ${{ inputs.branches }}`, so the run line's reference to the input cannot be read off)"],
        ].filter(([none]) => none).map(([, why]) => why)
        const block = (x, y) => lines.slice(x, y + 1).join('\n')
        const at = (i, f) => (i < 0 ? null : f(lines[i]))
        return {
          lines, delRun, delEnd, planRun, delFirst, planFirst, planName, delEnv, planEnv, missing, VAR, EXPR, REF: VAR === null ? null : new RegExp(`\\$\\{?${VAR}\\}?`),
          DEL: delRun < 0 ? null : block(delRun, delEnd).trimStart(), PLAN: at(planRun, l => `${l.trim()}\n`), DEL_STEP: at(delFirst, l => `${l}\n`), PLAN_NAME: at(planName, l => l),
          DEL_ENV: delEnv < 0 ? null : block(delFirst, delEnv),
          keys: at(delFirst, l => ' '.repeat(indentOf(l) + 2)), dash: at(delFirst, l => ' '.repeat(indentOf(l))), cont: at(delRun, l => ' '.repeat(indentOf(l) + 2)),
          // The two steps side by side, in the pin's own order, with whatever lies between them kept in place: [the text from the Plan step to the end of the Delete step, the same with the two blocks exchanged].
          swap: planFirst < 0 || delFirst < 0 || delRun < 0 || planRun >= delFirst ? [null, null] : [block(planFirst, delRun), [block(delFirst, delRun), ...lines.slice(planRun + 1, delFirst), block(planFirst, planRun)].join('\n')],
        }
      }
      // A LITERAL list of edits, each of which must be a problem. The pin comparison makes them all one mechanism; the list is how that is shown. Each is [what, the anchor in the pin, its replacement], null where the step was not found.
      const mutantsOn = pinText => {
        const A = anchorsOf(pinText), make = makeOn(pinText), { DEL, PLAN, DEL_STEP, PLAN_NAME, DEL_ENV, REF, EXPR, keys, dash, cont, swap } = A
        const list = [
          ['--apply dropped from the Delete step', DEL, sub(DEL, ' --apply', '')],
          ['--apply on the dry run', PLAN, sub(PLAN, 'delete-branches.mjs -- ', 'delete-branches.mjs --apply -- ')],
          ['the list not after a bare --', DEL, sub(DEL, / --(?=\s)/, '')],
          ['continue-on-error on the Delete step', DEL_STEP, cat(DEL_STEP, keys, 'continue-on-error: true\n')],
          ['continue-on-error as a quoted key', DEL_STEP, cat(DEL_STEP, keys, '"continue-on-error": true\n')],
          ['a condition on the Delete step', DEL_STEP, cat(DEL_STEP, keys, 'if: always()\n')],
          ['a shell: key on the Delete step', DEL_STEP, cat(DEL_STEP, keys, 'shell: bash {0}\n')],
          ['the input inlined into the run line', DEL, REF === null || EXPR === null ? null : sub(DEL, REF, EXPR)],
          ['a schedule trigger', 'on:\n  workflow_dispatch:\n', 'on:\n  schedule:\n    - cron: "0 * * * *"\n  workflow_dispatch:\n'],
          ['a push trigger', 'on:\n  workflow_dispatch:\n', 'on:\n  push:\n  workflow_dispatch:\n'],
          ['a trigger after a blank line', 'on:\n  workflow_dispatch:\n', 'on:\n  workflow_dispatch:\n\n  push:\n'],
          ['no dry run before the Delete step', PLAN_NAME, sub(PLAN_NAME, /name: .*/, 'name: Something else')],
          ['the Delete step before the Plan step', swap[0], swap[1]],
          ['the token cannot write', 'contents: write', 'contents: read'],
          ['a job-level permissions block that widens the token', 'jobs:\n  delete:\n', 'jobs:\n  delete:\n    permissions:\n      contents: write\n      actions: write\n'],
          ['a wrapped continuation of the Delete run ending || true (B12)', DEL, cat(DEL, '\n', cont, '|| true')],
          ['a wrapped continuation of the Delete run that deletes the default branch', DEL, cat(DEL, '\n', cont, '; git push origin :refs/heads/main')],
          ['a block scalar for the Delete run with || true after a # line', DEL, cat('run: |\n', cont, sub(DEL, 'run: ', ''), '\n', cont, '# note\n', cont, '|| true')],
          ['a wrapped continuation behind a comment line', DEL, cat(DEL, '\n', cont, '# note\n', cont, '|| true')],
          ['|| true after a # on the same line', DEL, cat(DEL, ' # || true')],
          ['|| true glued to the line by a # that is no YAML comment', DEL, cat(DEL, '#|| true')],
          ['the input spelled inputs[...] in an extra step', DEL, cat(DEL, '\n', dash, '- run: echo "${{ inputs[\'branches\'] }}"')],
          ['the input spelled through github.event in the Delete env', DEL_ENV, sub(DEL_ENV, INPUT_RE, '${{ github.event["inputs"]["branches"] }}')],
          ['a hard-coded list in the Delete step', DEL_ENV, sub(DEL_ENV, INPUT_RE, 'proof-a,proof-b')],
          ['an extra step', DEL, cat(DEL, '\n', dash, '- run: echo done')],
          ['an extra step that is one line with a trailing comment', DEL, cat(DEL, '\n', dash, '- run: ./extra.sh # fine')],
          ['an extra job', DEL, cat(DEL, '\n  other:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi')],
          ['the last line removed', DEL, DEL === null ? null : ''],
          ['the input not required', 'required: true', 'required: false'],
          ['the input description changed', "description: 'Comma-separated", "description: 'Comma separated"],
        ]
        // `kind` says why a mutant is unbuilt: 'step' (nothing to anchor on), 'miss' (its edit's pattern, `miss`, matches nothing in its anchor), 'once' (its literal anchor is not in the pin exactly once).
        return { built: list.map(([what, from, to]) => {
          const kind = from === null || to === null ? 'step' : to instanceof Miss ? 'miss' : null
          const text = kind === null ? make(from, to) : null
          return { what, from, text, kind: kind ?? (text === null ? 'once' : null), miss: kind === 'miss' ? to.from : null }
        }), missing: A.missing }
      }
      /** The failing detail of an unbuilt mutant: the literal anchors that are not in the pin once (quoted, so the pin line to edit is named), the mutants that had no step to anchor on, the step or line that was not located, and where to edit. */
      const unbuiltMessage = ({ built, missing }) => {
        const unbuilt = built.filter(m => m.text === null), noStep = unbuilt.filter(m => m.kind === 'step'), notOnce = unbuilt.filter(m => m.kind === 'once'), missed = unbuilt.filter(m => m.kind === 'miss')
        const quoted = s => JSON.stringify(s.length > 80 ? `${s.slice(0, 80)}...` : s)
        return `no unique anchor in the pin for: ${[...notOnce.map(m => `${m.what} (the anchor ${JSON.stringify(m.from.length > 80 ? `${m.from.slice(0, 80)}...` : m.from)} is not in the pin exactly once)`), ...missed.map(m => `${m.what} (its edit ${m.miss} matches nothing in its anchor ${quoted(m.from)})`), ...(noStep.length ? [`no step to anchor on for ${noStep.map(m => m.what).join(', ')}`] : [])].join('; ')}.${missing.length ? ` Not located: ${missing.join('; ')}.` : ''} Each step is found in WORKFLOW_PIN by DEL_RUN_RE, PLAN_RUN_RE and INPUT_RE, and the lines no step owns are literals of the mutant list: edit the regexp or the literal that no longer matches the pin, in the self-test of scripts/delete-branches.mjs`
      }
      const A = anchorsOf(WORKFLOW_PIN), { DEL, DEL_STEP } = A
      const wfBuilt = mutantsOn(WORKFLOW_PIN).built
      check('EVERY WORKFLOW MUTANT IS BUILT: its anchor occurs exactly once in the pin (an anchor that does not is named here, not thrown)', wfBuilt.every(m => m.text !== null), unbuiltMessage({ built: wfBuilt, missing: A.missing }))
      const wfSurvivors = wfBuilt.filter(m => m.text !== null && workflowProblems(m.text).length === 0).map(m => m.what)
      check('THE PIN COMPARISON: each of thirty edits of the workflow (a wrapped || true continuation, another spelling of the input, a hard-coded list, an extra step or job, shell:, a changed key, a trigger, the token, the order) is a problem',
        wfBuilt.length === 30 && wfSurvivors.length === 0, `survived: ${wfSurvivors.join(', ')}`)
      // AN INTENDED EDIT INSIDE THE PLAN OR DELETE STEP, made to the pin and to the workflow together, keeps every mutant built and caught (round 6, finding B13: `NOTE: x` after the Delete step's env line turned
      // this self-test red, 32 of 33, and renaming the Delete step, 31 of 33). Each edit below is made to the PIN's lines, at the places `anchorsOf` located; the mutants are then built from the EDITED pin and held to it.
      const edited = fn => { const ls = [...A.lines]; fn(ls); return ls.join('\n') }
      const refLine = ls => ls.findIndex((l, i) => i >= A.delRun && i <= A.delEnd && A.REF.test(l))   // the line of the Delete run that holds the reference to the input: the run line, or a line under it when it is wrapped
      const wfEdits = A.missing.length ? [] : [
        ["a key added to the Delete step's env", edited(ls => ls.splice(A.delEnv + 1, 0, `${' '.repeat(indentOf(ls[A.delEnv]))}NOTE: x`))],
        ["a key added to the Plan step's env", edited(ls => ls.splice(A.planEnv + 1, 0, `${' '.repeat(indentOf(ls[A.planEnv]))}NOTE: x`))],
        ['the Delete step renamed', edited(ls => { ls[A.delFirst] = `${ls[A.delFirst]} branches` })],
        ['the Plan step renamed', edited(ls => { ls[A.planFirst] = `${ls[A.planFirst]} first` })],
        ['a flag added to the Delete run line', edited(ls => { ls[A.delRun] = ls[A.delRun].replace(' --apply', () => ' --apply --quiet') })],
        ['a step added between the Plan step and the Delete step', edited(ls => ls.splice(A.delFirst, 0, `${' '.repeat(indentOf(ls[A.delFirst]))}- run: echo between`))],
        // The Delete run's reference to the input, in the three ways an intended edit changes it (round 6b, F-C-1: each of these, made to the pin and to the workflow, turned this self-test red). The variable's name and its
        // reference are read off the pin (A.VAR, A.REF) and the edits are made wherever the pin has them, so an edit of the real pin that already renames, braces or wraps leaves these as meaningful as before: the rename
        // adds a prefix, the brace form and the wrapping toggle.
        ["the Delete step's variable renamed (its env key and its reference in the run line)", edited(ls => { ls[A.delEnv] = ls[A.delEnv].replace(`${A.VAR}:`, () => `PROOF_${A.VAR}:`); const r = refLine(ls); ls[r] = ls[r].replace(A.REF, m => m.replace(A.VAR, () => `PROOF_${A.VAR}`)) })],
        ['the reference in the Delete run line spelled the other way, braced or unbraced', edited(ls => { const r = refLine(ls); ls[r] = ls[r].replace(A.REF, m => (m.startsWith('${') ? `$${A.VAR}` : `\${${A.VAR}}`)) })],
        ['the Delete run line wrapped over two lines before its last word, or joined to one when it already is wrapped', edited(ls => {
          if (A.delEnd > A.delRun) ls.splice(A.delRun, A.delEnd - A.delRun + 1, ls.slice(A.delRun, A.delEnd + 1).map((l, i) => (i === 0 ? l : l.trim())).join(' '))
          else { const l = ls[A.delRun], cut = l.lastIndexOf(' '); ls.splice(A.delRun, 1, l.slice(0, cut), `${' '.repeat(indentOf(l) + 2)}${l.slice(cut + 1)}`) }
        })],
        // The Plan step's name key moved off the step's first line (round 6b, F-C-2: `- id: plan` before `name: Plan (dry run)`, in the pin and the workflow, turned this self-test red); and the other way round when it already is below.
        ["the Plan step's name key moved below an id key, or back to the step's first line when it already is below", edited(ls => {
          const first = ls[A.planFirst], pad = ' '.repeat(indentOf(first)), keys = ' '.repeat(indentOf(first) + 2)
          if (A.planName === A.planFirst) ls.splice(A.planFirst, 1, `${pad}- id: plan`, `${keys}${first.trimStart().slice(2)}`)
          else { const name = ls[A.planName].trimStart(); ls[A.planName] = `${keys}${first.trimStart().slice(2)}`; ls[A.planFirst] = `${pad}- ${name}` }
        })],
      ]
      const wfEdited = wfEdits.map(([what, pin]) => {
        const m = mutantsOn(pin)
        return { what, built: m.built.filter(x => x.text !== null).length, unbuilt: m.built.filter(x => x.text === null).map(x => x.what), survived: m.built.filter(x => x.text !== null && workflowProblems(x.text, pin).length === 0).map(x => x.what), selfClean: workflowProblems(pin, pin).length === 0 && workflowProblems(WORKFLOW_PIN, pin).length === 1 }
      })
      check('AN INTENDED EDIT INSIDE THE PLAN OR DELETE STEP, MADE TO THE PIN, KEEPS EVERY MUTANT BUILT AND CAUGHT (a key added to either env, either step renamed, a flag added to the Delete run line, a step added between them, the Delete step\'s variable renamed, its reference braced, its run line wrapped, the Plan step\'s name below an id key): 30 of 30 built from the edited pin, none survives, the edited pin is its own pin and the old pin is not it',
        wfEdited.length === 10 && wfEdited.every(r => r.built === 30 && r.unbuilt.length === 0 && r.survived.length === 0 && r.selfClean), A.missing.length ? unbuiltMessage({ built: [], missing: A.missing }) : JSON.stringify(wfEdited))
      // ...and an anchor that CANNOT be found is named, with what to edit: the Delete step given no --apply in the pin leaves no line for DEL_RUN_RE, and a pin with no `contents: write` leaves a literal of the list with nothing to find.
      const noApply = A.missing.length ? null : mutantsOn(edited(ls => { ls[A.delRun] = ls[A.delRun].replace(' --apply', '') })), noApplyMsg = unbuiltMessage(noApply ?? { built: [], missing: A.missing })
      const noToken = mutantsOn(WORKFLOW_PIN.replace('contents: write', () => 'contents: read')), noTokenMsg = unbuiltMessage(noToken)
      check('AN ANCHOR THAT CANNOT BE FOUND IS NAMED WITH WHAT TO EDIT: a pin whose Delete step has no --apply names that step, DEL_RUN_RE and the mutants built on it; a pin with no `contents: write` quotes that literal; both say where the regexps and literals are',
        noApply !== null && noApply.missing.length === 3 && noApply.built.some(m => m.text === null && m.from === null) && /the Delete step's run line \(no line of the pin matches DEL_RUN_RE/.test(noApplyMsg) && /no step to anchor on for --apply dropped from the Delete step, /.test(noApplyMsg)
          && noToken.built.filter(m => m.text === null).length === 1 && /the token cannot write \(the anchor "contents: write" is not in the pin exactly once\)/.test(noTokenMsg) && !/Not located/.test(noTokenMsg)
          && [noApplyMsg, noTokenMsg].every(m => /edit the regexp or the literal that no longer matches the pin, in the self-test of scripts\/delete-branches\.mjs/.test(m)), `${noApplyMsg} | ${noTokenMsg}`)
      // ...and a Plan step with no name line at all is named as not located (round 6b, F-C-2): the key `name:` of its first line replaced by `id:` leaves `no dry run before the Delete step` nothing to rename.
      const noNamePin = A.missing.length ? null : edited(ls => { ls[A.planName] = ls[A.planName].replace(/name: .*/, () => 'id: plan') })
      const noName = noNamePin === null ? null : mutantsOn(noNamePin), noNameMsg = unbuiltMessage(noName ?? { built: [], missing: A.missing })
      check('A PLAN STEP WITH NO NAME LINE IS NAMED: `no dry run before the Delete step` is the one mutant unbuilt (no step to anchor on), the Plan step\'s name line is listed as not located, and the other 29 are built and none survives',
        noName !== null && noName.missing.length === 1 && /the Plan step's name line \(none of its lines above the run line starts/.test(noName.missing[0]) && noName.built.filter(m => m.text === null).map(m => `${m.kind}: ${m.what}`).join() === 'step: no dry run before the Delete step'
          && noName.built.every(m => m.text === null || workflowProblems(m.text, noNamePin).length > 0) && /no step to anchor on for no dry run before the Delete step\. Not located: the Plan step's name line/.test(noNameMsg), noNameMsg)
      // ...and so is a mutant whose EDIT finds nothing to change (round 6b, F-C-1): it is unbuilt, named with the pattern that matched nothing, and never counted as a survivor. The Delete run line given no reference to the
      // input (a list written into it) leaves `the input inlined into the run line` nothing to inline; the other twenty-nine mutants are built and each is a problem.
      const noRefPin = A.missing.length ? null : edited(ls => { const r = refLine(ls); ls[r] = ls[r].replace(A.REF, () => 'proof-a') })
      const noRef = noRefPin === null ? null : mutantsOn(noRefPin), noRefMsg = unbuiltMessage(noRef ?? { built: [], missing: A.missing })
      check('A MUTANT WHOSE EDIT FINDS NOTHING TO CHANGE IS A FAIL LINE, NOT A SURVIVOR: a pin whose Delete run line has no reference to the input leaves `the input inlined into the run line` unbuilt (the other 29 are built and none survives), and the message names the mutant, the pattern that matched nothing and where to edit',
        noRef !== null && noRef.built.length === 30 && noRef.built.filter(m => m.text === null).map(m => m.what).join() === 'the input inlined into the run line' && noRef.built.every(m => m.text === null || workflowProblems(m.text, noRefPin).length > 0)
          && noRefMsg.includes('the input inlined into the run line (its edit ') && noRefMsg.includes(String(A.REF)) && /edit the regexp or the literal that no longer matches the pin, in the self-test of scripts\/delete-branches\.mjs/.test(noRefMsg), noRefMsg)
      const wfFirst = workflowProblems(wfBuilt.find(m => m.what.startsWith('a wrapped continuation of the Delete run ending || true'))?.text ?? '')
      check('THE PROBLEM NAMES THE FIRST LINE THAT DIFFERS (expected and found) and says an intended edit also edits the pin',
        wfFirst.length === 1 && wfFirst[0].includes(`at significant line ${significant(WORKFLOW_PIN).length + 1} `) && /expected nothing \(the text ends here\), found `\s*\|\| true`/.test(wfFirst[0]) && /also edits WORKFLOW_PIN/.test(wfFirst[0]), wfFirst.join(' | '))
      const wfMakeOr = (from, to) => (from === null || to === null ? null : wfMake(from, to))
      const wfBenign = [
        ['a comment line added', 'jobs:\n', '# a new comment\njobs:\n'],
        ['an indented comment line added', DEL_STEP, cat('        # an indented comment\n', DEL_STEP)],
        ['a blank line added', 'jobs:\n', '\n\njobs:\n'],
        ['trailing space on a line', DEL, cat(DEL, '   ')],
        ['CRLF line endings', 'CRLF', 'CRLF'],
      ].map(([what, from, to]) => ({ what, text: from === 'CRLF' ? WORKFLOW_PIN.replace(/\n/g, '\r\n') : wfMakeOr(from, to) }))
      const wfBenignBad = wfBenign.filter(m => m.text === null || workflowProblems(m.text).length > 0).map(m => m.what)
      check('COMMENT LINES, BLANK LINES, TRAILING SPACE AND CRLF ARE NOT COUNTED (five edits, none a problem), so the pin is not stricter than the file needs', wfBenign.length === 5 && wfBenignBad.length === 0, `read as a problem: ${wfBenignBad.join(', ')}`)
      // Only space, tab and CR are free: a LITERAL list of the characters that YAML keeps as content and `\s` would have stripped, each at the end of the Delete run line and alone on a line.
      const wfOdd = ['\u00a0', '\f', '\v', '\ufeff', '\u2028'].flatMap(c => [wfMakeOr(DEL, cat(DEL, c)), wfMake('jobs:\n', `${c}\njobs:\n`)])
      check('ONLY SPACE, TAB AND CR ARE FREE: a no-break space, form feed, vertical tab, BOM or line separator at the end of a line, or alone on one, is a problem (10 edits, none read as blank)',
        wfOdd.length === 10 && wfOdd.every(t => t !== null && workflowProblems(t).length === 1), `${wfOdd.filter(t => t === null || workflowProblems(t).length !== 1).length} of ${wfOdd.length} not read as a problem`)
      check('A MUTANT WHOSE ANCHOR IS NOT IN THE PIN IS A FAIL LINE, NOT A STACK TRACE: the builder answers null for an anchor that is absent and for one that occurs twice',
        (() => { try { return wfMake('text that the pin does not have', 'x') === null && wfMake('node-version', 'x') !== null && wfMake('BRANCHES', 'x') === null } catch { return false } })())
    } finally { rmSync(dir, { recursive: true, force: true }) }
    check('A FAILURE WITH NO STDERR KEEPS ITS MESSAGE AND SIGNAL (git killed, or no output at all)', reasonOf({ stderr: '', message: 'Command failed: git push origin :refs/heads/x', signal: 'SIGTERM' }) === 'Command failed: git push origin :refs/heads/x (signal SIGTERM)' && reasonOf({ stderr: 'a\nb\n' }) === 'a | b', reasonOf({ stderr: '', message: 'm', signal: 'SIGTERM' }))
    check('THE EXIT: red when a branch is left or a deletion failed, green otherwise, and main() ends through it',
      exitFor({ left: [], failed: [] }) === 0 && exitFor({ left: ['proof-a'], failed: [] }) === 1 && exitFor({ left: [], failed: [{ name: 'proof-a' }] }) === 1 && exitFor({ left: ['proof-a'], failed: [{ name: 'proof-a' }] }) === 1
        && (src => src.slice(src.indexOf('const main = () => {'), src.indexOf('// --- self-test')).split('process.exit(exitFor(r))').length === 2)((await import('node:fs')).readFileSync(fileURLToPath(import.meta.url), 'utf8')), 'a deletion that failed must not end green')
    finish(summarize())
  } else main()
}
