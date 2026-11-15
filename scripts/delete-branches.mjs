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

/** What is wrong with the shape of `.github/workflows/delete-branches.yml` (round 4, finding 19: nothing read the file, so `--apply` could be dropped, a failed deletion made green or the input inlined into a
 *  `run:` line with every check still green). A list of problems; empty when the file is as the script needs it. Whole-line comments are not read. */
export const workflowProblems = text => {
  const problems = []
  const body = text.split('\n').filter(l => !/^\s*#/.test(l)).join('\n') + '\n'
  const on = /^on:\n((?:[ ]+.*\n|\n)*)/m.exec(body)?.[1] ?? ''
  const triggers = [...on.matchAll(/^  (\S+?):/gm)].map(m => m[1])
  if (triggers.join() !== 'workflow_dispatch') problems.push(`it must be started by hand only: \`on:\` has ${triggers.join(', ') || 'no trigger'}, not just workflow_dispatch`)
  if (!/^permissions:\n  contents: write\n(?!  )/m.test(body)) problems.push('permissions must be exactly `contents: write` (what a ref deletion needs, and nothing more)')
  if (/\bcontinue-on-error\b/.test(body)) problems.push('no step may continue on error: a deletion that failed must end the job red')
  if (/^\s+if:/m.test(body)) problems.push('no step may be conditional: a skipped deletion would end the job green')
  const refs = body.split('\n').filter(l => /inputs\.branches/.test(l))
  if (refs.length === 0 || !refs.every(l => /^\s+BRANCHES: \$\{\{ inputs\.branches \}\}$/.test(l))) problems.push('the input may appear only as `BRANCHES: ${{ inputs.branches }}` in an env: block, never in a run: line')
  const steps = body.split(/^      - /m).slice(1)
  const idx = name => steps.findIndex(st => st.startsWith(`name: ${name}\n`))
  const dry = idx('Plan (dry run)'), del = idx('Delete')
  if (dry < 0 || del < 0 || dry > del) problems.push('the job needs a `Plan (dry run)` step before the `Delete` step')
  const runs = i => (i < 0 ? [] : [...steps[i].matchAll(/^\s+run: (.*)$/gm)].map(m => m[1]))
  if (JSON.stringify(runs(dry)) !== JSON.stringify(['node scripts/delete-branches.mjs -- "$BRANCHES"'])) problems.push('the Plan step must run exactly `node scripts/delete-branches.mjs -- "$BRANCHES"` (no --apply: it is the dry run)')
  if (JSON.stringify(runs(del)) !== JSON.stringify(['node scripts/delete-branches.mjs --apply -- "$BRANCHES"'])) problems.push('the Delete step must run exactly `node scripts/delete-branches.mjs --apply -- "$BRANCHES"`')
  return problems
}

// --- self-test -----------------------------------------------------------------------
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (parseArgs(process.argv.slice(2)).selfTest) {
    const { createChecks, finish } = await import('./checks.mjs')
    const { chmodSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } = await import('node:fs')
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
      const fixture = (name, def, branches, rejectDeletes = false) => {
        const rem = join(dir, `${name}.git`), wk = join(dir, name)
        g(['init', '-q', '--bare', '-b', def, rem]); g(['init', '-q', '-b', def, wk])
        g(['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'base'], wk)
        g(['remote', 'add', 'origin', rem], wk)
        for (const b of branches) g(['push', '-q', 'origin', `HEAD:refs/heads/${b}`], wk)
        if (rejectDeletes) {
          writeFileSync(join(rem, 'hooks', 'pre-receive'), '#!/bin/sh\nwhile read old new ref; do\n  case "$new" in *[!0]*) ;; *) echo "deletion refused by the fixture" >&2; exit 1 ;; esac\ndone\n')
          chmodSync(join(rem, 'hooks', 'pre-receive'), 0o755)
        }
        return { remote: rem, work: wk }
      }
      const heads = f => JSON.stringify(g(['ls-remote', '--heads', 'origin'], f.work).split('\n').filter(Boolean).map(l => l.split('\t')[1].replace('refs/heads/', '')).sort())
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
      const m6 = fixture('m6', 'main', ['main', 'proof-p'], true)
      const rejected = runMain(m6, '--apply', '--', 'proof-p')
      check('A DELETION THE REMOTE REJECTS ENDS THE RUN RED through main(): exit 1, FAILED with the remote\'s reason, STILL THERE, and the branch is on the remote',
        rejected.status === 1 && /FAILED  proof-p: .*deletion refused by the fixture/.test(rejected.out) && /STILL THERE: proof-p/.test(rejected.out) && heads(m6) === '["main","proof-p"]', `exit ${rejected.status}; ${rejected.out.slice(-400)}`)
      const m7 = fixture('m7', 'main', ['main', 'proof-u', 'proof-v'])
      const vanished = apply(['proof-u', 'proof-v'], 'origin', m7.work, (args, cwd) => { git(args, cwd); if (args[2] === ':refs/heads/proof-v') renameSync(m7.remote, `${m7.remote}.gone`) })
      check('A FINAL QUESTION THAT FAILS KEEPS THE ACCOUNT: apply() returns instead of throwing, says why it could not confirm, names what was pushed without an error as unconfirmed, and the run exits 1',
        typeof vanished.unverified === 'string' && vanished.unverified.length > 0 && JSON.stringify(vanished.unconfirmed) === '["proof-u","proof-v"]' && vanished.failed.length === 0 && vanished.deleted.length === 0 && exitFor(vanished) === 1, JSON.stringify(vanished))
      // THE WORKFLOW'S SHAPE (round 4, finding 19): the real file is clean, and each way of making it a no-op, a green failure or an injection is a problem (a mutation that does not apply throws).
      const wfText = readFileSync(new URL('../.github/workflows/delete-branches.yml', import.meta.url), 'utf8')
      const wfMutant = (from, to) => { if (wfText.split(from).length !== 2) throw new Error(`workflow mutation anchor is not unique: ${from}`); return wfText.replace(from, to) }
      const DELETE_RUN = 'run: node scripts/delete-branches.mjs --apply -- "$BRANCHES"', PLAN_RUN = 'run: node scripts/delete-branches.mjs -- "$BRANCHES"\n'
      const wfMutants = [
        ['--apply dropped from the Delete step', DELETE_RUN, 'run: node scripts/delete-branches.mjs -- "$BRANCHES"'],
        ['--apply on the dry run', PLAN_RUN, 'run: node scripts/delete-branches.mjs --apply -- "$BRANCHES"\n'],
        ['the list not after a bare --', DELETE_RUN, 'run: node scripts/delete-branches.mjs --apply "$BRANCHES"'],
        ['continue-on-error on the Delete step', '      - name: Delete\n', '      - name: Delete\n        continue-on-error: true\n'],
        ['a condition on the Delete step', '      - name: Delete\n', '      - name: Delete\n        if: always()\n'],
        ['the input inlined into the run line', DELETE_RUN, 'run: node scripts/delete-branches.mjs --apply -- "${{ inputs.branches }}"'],
        ['a schedule trigger', 'on:\n  workflow_dispatch:\n', 'on:\n  schedule:\n    - cron: "0 * * * *"\n  workflow_dispatch:\n'],
        ['a push trigger', 'on:\n  workflow_dispatch:\n', 'on:\n  push:\n  workflow_dispatch:\n'],
        ['no dry run before the Delete step', '      - name: Plan (dry run)\n', '      - name: Something else\n'],
        ['the token cannot write', 'contents: write', 'contents: read'],
      ]
      const wfSurvivors = wfMutants.filter(([, from, to]) => workflowProblems(wfMutant(from, to)).length === 0).map(([what]) => what)
      check('THE WORKFLOW FILE IS READ: the real .github/workflows/delete-branches.yml has no problem, and each of ten edits (no --apply, --apply on the dry run, no `--`, continue-on-error, an `if`, the input in a run line, a schedule, a push trigger, no dry run, a read-only token) has one',
        workflowProblems(wfText).length === 0 && wfMutants.length === 10 && wfSurvivors.length === 0, `problems: ${workflowProblems(wfText).join(' | ')}; survived: ${wfSurvivors.join(', ')}`)
    } finally { rmSync(dir, { recursive: true, force: true }) }
    check('A FAILURE WITH NO STDERR KEEPS ITS MESSAGE AND SIGNAL (git killed, or no output at all)', reasonOf({ stderr: '', message: 'Command failed: git push origin :refs/heads/x', signal: 'SIGTERM' }) === 'Command failed: git push origin :refs/heads/x (signal SIGTERM)' && reasonOf({ stderr: 'a\nb\n' }) === 'a | b', reasonOf({ stderr: '', message: 'm', signal: 'SIGTERM' }))
    check('THE EXIT: red when a branch is left or a deletion failed, green otherwise, and main() ends through it',
      exitFor({ left: [], failed: [] }) === 0 && exitFor({ left: ['proof-a'], failed: [] }) === 1 && exitFor({ left: [], failed: [{ name: 'proof-a' }] }) === 1 && exitFor({ left: ['proof-a'], failed: [{ name: 'proof-a' }] }) === 1
        && (src => src.slice(src.indexOf('const main = () => {'), src.indexOf('// --- self-test')).split('process.exit(exitFor(r))').length === 2)((await import('node:fs')).readFileSync(fileURLToPath(import.meta.url), 'utf8')), 'a deletion that failed must not end green')
    finish(summarize())
  } else main()
}
