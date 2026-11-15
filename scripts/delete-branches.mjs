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
// Usage:  node scripts/delete-branches.mjs "proof-a,proof-b"            the plan, nothing deleted
//         node scripts/delete-branches.mjs "proof-a,proof-b" --apply    the deletion
//         node scripts/delete-branches.mjs --self-test
import { execFileSync } from 'node:child_process'
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

/** Deletes the planned names that exist; returns `{ deleted, absent, left, failed }`. `left` is what the remote still has afterwards. `push` is the command that deletes (a stand-in in the self-test).
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
  const left = existing(names, remote, cwd)
  return { deleted: before.filter(n => !left.includes(n)), absent, left, failed }
}

/** How a deletion run ends: red when a branch is still on the remote or a deletion failed. */
export const exitFor = r => (r.left.length > 0 || r.failed.length > 0 ? 1 : 0)

const main = () => {
  const args = process.argv.slice(2)
  const list = args.find(a => !a.startsWith('--'))
  const p = plan(list)
  if (p.refused.length > 0) {
    for (const r of p.refused) console.log(`REFUSED  ${r.name}: ${r.why}`)
    console.log('\nNothing was deleted: one name that does not qualify refuses the whole list.')
    process.exit(2)
  }
  console.log(`plan: ${p.ok.length} throwaway branch(es): ${p.ok.join(', ')}`)
  if (!args.includes('--apply')) { console.log('dry run (no --apply): nothing deleted'); return }
  const r = apply(p.ok, 'origin')
  console.log(`deleted ${r.deleted.length} of ${p.ok.length}: ${r.deleted.join(', ') || '(none)'}${r.absent.length ? `; already absent: ${r.absent.join(', ')}` : ''}`)
  for (const f of r.failed) console.log(`FAILED  ${f.name}: ${f.why}`)
  if (r.left.length > 0) console.log(`STILL THERE: ${r.left.join(', ')}`)
  process.exit(exitFor(r))
}

// --- self-test -----------------------------------------------------------------------
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--self-test')) {
    const { createChecks, finish } = await import('./checks.mjs')
    const { mkdtempSync, rmSync } = await import('node:fs')
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
    } finally { rmSync(dir, { recursive: true, force: true }) }
    check('A FAILURE WITH NO STDERR KEEPS ITS MESSAGE AND SIGNAL (git killed, or no output at all)', reasonOf({ stderr: '', message: 'Command failed: git push origin :refs/heads/x', signal: 'SIGTERM' }) === 'Command failed: git push origin :refs/heads/x (signal SIGTERM)' && reasonOf({ stderr: 'a\nb\n' }) === 'a | b', reasonOf({ stderr: '', message: 'm', signal: 'SIGTERM' }))
    check('THE EXIT: red when a branch is left or a deletion failed, green otherwise, and main() ends through it',
      exitFor({ left: [], failed: [] }) === 0 && exitFor({ left: ['proof-a'], failed: [] }) === 1 && exitFor({ left: [], failed: [{ name: 'proof-a' }] }) === 1 && exitFor({ left: ['proof-a'], failed: [{ name: 'proof-a' }] }) === 1
        && (src => src.slice(src.indexOf('const main = () => {'), src.indexOf('// --- self-test')).split('process.exit(exitFor(r))').length === 2)((await import('node:fs')).readFileSync(fileURLToPath(import.meta.url), 'utf8')), 'a deletion that failed must not end green')
    finish(summarize())
  } else main()
}
