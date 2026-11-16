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

/** The lines of a workflow text that count: trailing whitespace dropped (a CRLF file included), then blank lines and whole-line comments (first non-blank character `#`) dropped. Nothing else is
 *  dropped: a `#` after other text is part of its line, so a changed `run:` line cannot hide behind one. */
const significant = text => String(text).split('\n').map(l => l.replace(/\s+$/, '')).filter(l => l !== '' && !/^\s*#/.test(l))

/** What is wrong with `.github/workflows/delete-branches.yml` (or any text given): a list, empty when it is the pin, else ONE problem naming the first line that differs (expected, found). */
export const workflowProblems = text => {
  const want = significant(WORKFLOW_PIN), got = significant(text)
  const show = l => (l === undefined ? 'nothing (the text ends here)' : `\`${l}\``)
  for (let i = 0; i < Math.max(want.length, got.length); i++) {
    if (want[i] !== got[i]) return [`the workflow differs from its pin at significant line ${i + 1} (comments, blank lines and trailing space are not counted): expected ${show(want[i])}, found ${show(got[i])}. An intended edit of the workflow also edits WORKFLOW_PIN in scripts/delete-branches.mjs.`]
  }
  return []
}

// --- self-test -----------------------------------------------------------------------
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (parseArgs(process.argv.slice(2)).selfTest) {
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
      const runMain = (f, ...args) => { const r = spawnSync(process.execPath, [SELF, ...args], { cwd: f.work, encoding: 'utf8', timeout: 60000 }); return { status: r.status, out: `${r.stdout}${r.stderr}` } }
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
      const wfMake = (from, to) => (WORKFLOW_PIN.split(from).length === 2 ? WORKFLOW_PIN.replace(from, () => to) : null)
      const DEL = 'run: node scripts/delete-branches.mjs --apply -- "$BRANCHES"', PLAN = 'run: node scripts/delete-branches.mjs -- "$BRANCHES"\n', DEL_STEP = '      - name: Delete\n'
      const DEL_ENV = '      - name: Delete\n        env:\n          BRANCHES: ${{ inputs.branches }}'
      const PLAN_BLOCK = '      - name: Plan (dry run)\n        env:\n          BRANCHES: ${{ inputs.branches }}\n        run: node scripts/delete-branches.mjs -- "$BRANCHES"\n'
      const DEL_BLOCK = '      - name: Delete\n        env:\n          BRANCHES: ${{ inputs.branches }}\n        run: node scripts/delete-branches.mjs --apply -- "$BRANCHES"'
      // A LITERAL list of edits, each of which must be a problem. The pin comparison makes them all one mechanism; the list is how that is shown.
      const wfMutants = [
        ['--apply dropped from the Delete step', DEL, 'run: node scripts/delete-branches.mjs -- "$BRANCHES"'],
        ['--apply on the dry run', PLAN, 'run: node scripts/delete-branches.mjs --apply -- "$BRANCHES"\n'],
        ['the list not after a bare --', DEL, 'run: node scripts/delete-branches.mjs --apply "$BRANCHES"'],
        ['continue-on-error on the Delete step', DEL_STEP, `${DEL_STEP}        continue-on-error: true\n`],
        ['continue-on-error as a quoted key', DEL_STEP, `${DEL_STEP}        "continue-on-error": true\n`],
        ['a condition on the Delete step', DEL_STEP, `${DEL_STEP}        if: always()\n`],
        ['a shell: key on the Delete step', DEL_STEP, `${DEL_STEP}        shell: bash {0}\n`],
        ['the input inlined into the run line', DEL, 'run: node scripts/delete-branches.mjs --apply -- "${{ inputs.branches }}"'],
        ['a schedule trigger', 'on:\n  workflow_dispatch:\n', 'on:\n  schedule:\n    - cron: "0 * * * *"\n  workflow_dispatch:\n'],
        ['a push trigger', 'on:\n  workflow_dispatch:\n', 'on:\n  push:\n  workflow_dispatch:\n'],
        ['a trigger after a blank line', 'on:\n  workflow_dispatch:\n', 'on:\n  workflow_dispatch:\n\n  push:\n'],
        ['no dry run before the Delete step', '      - name: Plan (dry run)\n', '      - name: Something else\n'],
        ['the Delete step before the Plan step', `${PLAN_BLOCK}${DEL_BLOCK}`, `${DEL_BLOCK}\n${PLAN_BLOCK.trimEnd()}`],
        ['the token cannot write', 'contents: write', 'contents: read'],
        ['a job-level permissions block that widens the token', 'jobs:\n  delete:\n', 'jobs:\n  delete:\n    permissions:\n      contents: write\n      actions: write\n'],
        ['a wrapped continuation of the Delete run ending || true (B12)', DEL, `${DEL}\n          || true`],
        ['a wrapped continuation of the Delete run that deletes the default branch', DEL, `${DEL}\n          ; git push origin :refs/heads/main`],
        ['a block scalar for the Delete run with || true after a # line', DEL, 'run: |\n          node scripts/delete-branches.mjs --apply -- "$BRANCHES"\n          # note\n          || true'],
        ['a wrapped continuation behind a comment line', DEL, `${DEL}\n          # note\n          || true`],
        ['|| true after a # on the same line', DEL, `${DEL} # || true`],
        ['|| true glued to the line by a # that is no YAML comment', DEL, `${DEL}#|| true`],
        ['the input spelled inputs[...] in an extra step', DEL, `${DEL}\n      - run: echo "\${{ inputs['branches'] }}"`],
        ['the input spelled through github.event in the Delete env', DEL_ENV, '      - name: Delete\n        env:\n          BRANCHES: ${{ github.event["inputs"]["branches"] }}'],
        ['a hard-coded list in the Delete step', DEL_ENV, '      - name: Delete\n        env:\n          BRANCHES: proof-a,proof-b'],
        ['an extra step', DEL, `${DEL}\n      - run: echo done`],
        ['an extra step that is one line with a trailing comment', DEL, `${DEL}\n      - run: ./extra.sh # fine`],
        ['an extra job', DEL, `${DEL}\n  other:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi`],
        ['the last line removed', DEL, ''],
        ['the input not required', 'required: true', 'required: false'],
        ['the input description changed', "description: 'Comma-separated", "description: 'Comma separated"],
      ]
      const wfBuilt = wfMutants.map(([what, from, to]) => ({ what, text: wfMake(from, to) }))
      const wfUnbuilt = wfBuilt.filter(m => m.text === null).map(m => m.what)
      check('EVERY WORKFLOW MUTANT IS BUILT: its anchor occurs exactly once in the pin (an anchor that does not is named here, not thrown)', wfUnbuilt.length === 0, `no unique anchor in the pin for: ${wfUnbuilt.join(', ')}`)
      const wfSurvivors = wfBuilt.filter(m => m.text !== null && workflowProblems(m.text).length === 0).map(m => m.what)
      check('THE PIN COMPARISON: each of thirty edits of the workflow (a wrapped || true continuation, another spelling of the input, a hard-coded list, an extra step or job, shell:, a changed key, a trigger, the token, the order) is a problem',
        wfMutants.length === 30 && wfSurvivors.length === 0, `survived: ${wfSurvivors.join(', ')}`)
      const wfFirst = workflowProblems(wfMake(DEL, `${DEL}\n          || true`) ?? '')
      check('THE PROBLEM NAMES THE FIRST LINE THAT DIFFERS (expected and found) and says an intended edit also edits the pin',
        wfFirst.length === 1 && wfFirst[0].includes(`at significant line ${significant(WORKFLOW_PIN).length + 1} `) && /expected nothing \(the text ends here\), found `\s*\|\| true`/.test(wfFirst[0]) && /also edits WORKFLOW_PIN/.test(wfFirst[0]), wfFirst.join(' | '))
      const wfBenign = [
        ['a comment line added', 'jobs:\n', '# a new comment\njobs:\n'],
        ['an indented comment line added', DEL_STEP, `        # an indented comment\n${DEL_STEP}`],
        ['a blank line added', 'jobs:\n', '\n\njobs:\n'],
        ['trailing space on a line', DEL, `${DEL}   `],
        ['CRLF line endings', null, null],
      ].map(([what, from, to]) => ({ what, text: from === null ? WORKFLOW_PIN.replace(/\n/g, '\r\n') : wfMake(from, to) }))
      const wfBenignBad = wfBenign.filter(m => m.text === null || workflowProblems(m.text).length > 0).map(m => m.what)
      check('COMMENT LINES, BLANK LINES, TRAILING SPACE AND CRLF ARE NOT COUNTED (five edits, none a problem), so the pin is not stricter than the file needs', wfBenign.length === 5 && wfBenignBad.length === 0, `read as a problem: ${wfBenignBad.join(', ')}`)
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
