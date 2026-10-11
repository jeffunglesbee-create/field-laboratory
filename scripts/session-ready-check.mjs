// Did this session's bootstrap actually run?
//
// WHY THIS EXISTS. On 2026-10-09 a session began with `dotnet` absent,
// node_modules empty, build/ missing and `git config core.hooksPath` EMPTY —
// scripts/install_pkgs.sh had not run, so .githooks/pre-commit was not
// installed, so the outbox-pairing guard was not in the path. Twelve commits
// shipped src/ or scripts/ with no outbox entry before anything noticed, and
// the noticing was a CI gate four days later. docs/history-boundary.txt records
// the same cause for three of its five boundary moves.
//
// The gap was never the guard. It was that an un-bootstrapped session is
// INDISTINGUISHABLE from a bootstrapped one: nothing in the repo asserts the
// bootstrap ran. scripts/check-script-orphans.mjs keys off the pre-commit
// FILE's existence, which is tracked and therefore always true, rather than off
// `core.hooksPath`, which is local config and was empty.
//
// So this asserts the three facts separately, because they are three different
// failures with three different remedies — Rule 99: missing, empty and
// unreadable are not the same fact.
//
// NOT A FIX FOR THE EAGER STEP, and that limit is the point. `git commit` is
// not an npm script and no npm lifecycle event precedes it, so no repo-side
// mechanism can install `core.hooksPath` before a session's FIRST commit. What
// this does is make the un-bootstrapped state say so out loud at the first
// moment anything asks, instead of surfacing as a permanent history violation.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { createChecks, isMain, finish } from './checks.mjs'

const quiet = (cmd, args) => {
  try { return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() }
  catch { return null }
}

/** The three facts, as data. Pure given its probes, so the self-test can drive
 *  every combination without touching the real session. */
export const readiness = ({ hooksPath, sdks, nodeModules }) => ({
  // The guard's delivery. `git config core.hooksPath` is the ONLY thing that
  // puts .githooks/pre-commit in git's path, and install_pkgs.sh is the only
  // thing that sets it.
  guard: hooksPath === '.githooks' ? 'installed'
    : hooksPath == null ? 'unset'
    : 'elsewhere',
  // Fable needs SDK 10 specifically — 5.x ships tools/net10.0/ only.
  dotnet: sdks == null ? 'absent'
    : /^10\./m.test(sdks) ? 'present'
    : 'wrong-major',
  deps: nodeModules == null ? 'absent' : nodeModules > 0 ? 'present' : 'empty',
})

export const REMEDY = 'bash scripts/install_pkgs.sh   (or: git config core.hooksPath .githooks)'

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()

  check('a fully bootstrapped session reads installed/present/present',
    JSON.stringify(readiness({ hooksPath: '.githooks', sdks: '10.0.112 [/usr/lib/dotnet/sdk]', nodeModules: 6 }))
      === JSON.stringify({ guard: 'installed', dotnet: 'present', deps: 'present' }))

  // THE MEASURED 2026-10-09 STATE, as its own case.
  check('THE STATE THAT PRODUCED TWELVE VIOLATIONS is reported as unset/absent/absent',
    JSON.stringify(readiness({ hooksPath: null, sdks: null, nodeModules: null }))
      === JSON.stringify({ guard: 'unset', dotnet: 'absent', deps: 'absent' }),
    'the session that shipped twelve unpaired commits had exactly these three values')

  check('UNSET and POINTED-ELSEWHERE are different facts',
    readiness({ hooksPath: null }).guard === 'unset' &&
    readiness({ hooksPath: '.git/hooks' }).guard === 'elsewhere',
    'a hooksPath aimed at some other directory is a deliberate override, not a missing bootstrap')

  check('ABSENT and EMPTY node_modules are different facts',
    readiness({ nodeModules: null }).deps === 'absent' &&
    readiness({ nodeModules: 0 }).deps === 'empty' &&
    readiness({ nodeModules: 3 }).deps === 'present',
    'Rule 99: a directory that is missing and one that is there but empty need different remedies')

  check('an SDK of the WRONG major is not reported as present',
    readiness({ sdks: '8.0.404 [/usr/lib/dotnet/sdk]' }).dotnet === 'wrong-major' &&
    readiness({ sdks: '10.0.112 [/usr/lib/dotnet/sdk]' }).dotnet === 'present',
    "Fable 5.x ships tools/net10.0/ only; under SDK 8 the tool install fails outright")

  check('the SDK match is anchored, so 1.10.x cannot pass for 10.x',
    readiness({ sdks: '1.10.5 [/usr/lib/dotnet/sdk]' }).dotnet === 'wrong-major',
    'an unanchored /10\\./ would match 1.10.5')

  check('the remedy names a runnable command, not a description',
    /^bash scripts\/install_pkgs\.sh/.test(REMEDY))

  process.exit(summarize() === 0 ? 0 : 1)
}

if (isMain(import.meta.url)) {
  const { check, summarize } = createChecks()
  const r = readiness({
    hooksPath: quiet('git', ['config', 'core.hooksPath']) || null,
    sdks: quiet('dotnet', ['--list-sdks']),
    nodeModules: existsSync('node_modules') ? readdirSync('node_modules').length : null,
  })

  console.log(`\n  guard  (core.hooksPath) : ${r.guard}`)
  console.log(`  dotnet (SDK 10)         : ${r.dotnet}`)
  console.log(`  deps   (node_modules)   : ${r.deps}\n`)

  // The guard is the only one that is a CORRECTNESS failure rather than a
  // convenience one: without it a commit can ship source with no outbox entry
  // and nothing says so until CI, by which time the rule is settled for good.
  // NOT ASSERTED ON A RUNNER, and that is not a loosened rule. A GitHub
  // Actions checkout has no `core.hooksPath` by design and should not: the
  // runner-side equivalent is the explicit `node scripts/staged-outbox-check.mjs`
  // step that .github/workflows/generate-team-colours.yml and its siblings run
  // before `git commit`, which the fourth boundary move shipped for exactly
  // this reason. Asserting a local git config on a runner would fail every CI
  // build for a condition that is correct there.
  if (process.env.GITHUB_ACTIONS === 'true') {
    console.log('  on a runner: core.hooksPath is not expected; the workflows call ' +
      'staged-outbox-check.mjs explicitly before committing.')
    check('the readiness probe runs on a runner without asserting local git config',
      r.dotnet === 'present' || r.deps === 'present',
      'neither the SDK nor node_modules is present on this runner, so the probe ' +
      'is reporting on a checkout where nothing has been installed yet')
    process.exit(summarize() === 0 ? 0 : 1)
  }

  check('the outbox guard is installed in git (core.hooksPath -> .githooks)',
    r.guard === 'installed',
    `core.hooksPath is ${r.guard}. .githooks/pre-commit is NOT in git's path, so a ` +
    `commit staging src/ or scripts/ with no outbox/ entry will not be refused. ` +
    `Twelve such commits shipped on 2026-10-08/09 from exactly this state. Fix: ${REMEDY}`)

  // Reported, not failed: a session that only reads or writes docs needs
  // neither, and failing here would make the check something to bypass.
  if (r.dotnet !== 'present' || r.deps !== 'present') {
    console.log(`  note: dotnet=${r.dotnet} deps=${r.deps} — \`npm run build\` will not work yet. ${REMEDY}`)
  }

  finish(summarize())
}
