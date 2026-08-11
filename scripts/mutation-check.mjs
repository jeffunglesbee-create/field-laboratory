// Mutation testing for the check suite itself.
//
// Every guard in this repo has been mutation-tested by hand, in prose, one at a
// time. That worked, and it found real holes — but it is exactly the practice
// that decays, because a hand-run mutation is a claim in an outbox and nothing
// re-runs it.
//
// More to the point, "half-working" has been this session's recurring failure
// and it always has the same shape: A CHECK THAT PASSES IN ONE DIRECTION.
//
//   outboxToday          passed on any dated file, not on a documented commit
//   zone-check           16/16 while a broken UTC-4 build also passed 11/11
//   outboxAccompanies    the PASS direction was never run; it ate a character
//   gate-inventory       standalone tested fixtures, never the real files
//   sport chips          arrow keys worked once, then focus was destroyed
//
// Each was found by a person noticing. This asks the question mechanically:
// break the source on purpose, and see whether ANY check objects. A mutation
// that survives is a claim nothing defends — which is the general form of
// every entry in that list.
//
// Usage:  node scripts/mutation-check.mjs
//         node scripts/mutation-check.mjs --only draw

import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createChecks } from './checks.mjs'

const ONLY = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null

// Each mutation names an invariant this repo claims to hold, and the check that
// is supposed to notice. `expect` is the check command; a mutation PASSES this
// script when that command FAILS.
const MUTATIONS = [
  {
    id: 'draw',
    file: 'src/Pickem.fs',
    claim: 'a draw is neither correct nor wrong',
    find: '        if home = away then None',
    replace: '        if false then None',
    expect: 'node scripts/pickem-check.mjs',
  },
  {
    id: 'score-presence',
    file: 'src/Desk.fs',
    claim: 'game status comes from kickoff, not from a score existing',
    find: '        elif notYetStartedAt now g then',
    replace: '        elif false then',
    expect: 'node scripts/state-check.mjs',
  },
  {
    id: 'finalized-only',
    file: 'src/Desk.fs',
    claim: 'a past date finalises a game even without finalized_at',
    find: '        if g.FinalizedAt.IsSome || datePassed then',
    replace: '        if g.FinalizedAt.IsSome then',
    expect: 'node scripts/state-check.mjs',
  },
  {
    id: 'rank-order',
    file: 'src/Pick.fs',
    claim: 'the ranked list is sorted, not trusted from arrival order',
    find: 'let compareRank (SealedRank a) (SealedRank b) = compare b a',
    replace: 'let compareRank (SealedRank _) (SealedRank _) = 0',
    expect: 'node scripts/pick-check.mjs',
  },
  {
    id: 'tie-detection',
    file: 'src/Pick.fs',
    claim: 'a three-way tie at the top is detected and stated',
    find: '        if level = 0 then Unrivalled else SharedBy(level + 1)',
    replace: '        if true then Unrivalled else SharedBy(level + 1)',
    expect: 'node scripts/pick-check.mjs',
  },
  {
    id: 'gate-unanswerable',
    file: 'src/Scout.fs',
    claim: 'a gate with no data says so instead of saying no',
    find: '      Answer = Unanswerable "getStatOfDay deviation (PK%/DRTG/park factor; not in /context/date)" }',
    replace: '      Answer = DoesNotQualify "no stat anomaly" }',
    expect: "URL='http://localhost:8080/?data=games-2026-08-09' node scripts/tab-check.mjs",
  },
  // Gate B and Gate D, added after Gate C's mutation survived. Killing one hole
  // is not the same as closing the class: the fix has to hold for the siblings
  // it was not written against.
  {
    id: 'gate-unanswerable-b',
    file: 'src/Scout.fs',
    claim: 'Gate B reports what it needs rather than claiming a real answer',
    find: '      Answer = Unanswerable "player milestone data (production reads BDL; not in /context/date)" }',
    replace: '      Answer = DoesNotQualify "no milestone" }',
    expect: "URL='http://localhost:8080/?data=games-2026-08-09' node scripts/tab-check.mjs",
  },
  {
    id: 'gate-unanswerable-d',
    file: 'src/Scout.fs',
    claim: 'Gate D reports what it needs rather than claiming a real answer',
    find: '      Answer = Unanswerable "WC scenario pAdv data (not in /context/date)" }',
    replace: '      Answer = DoesNotQualify "no WC stakes" }',
    expect: "URL='http://localhost:8080/?data=games-2026-08-09' node scripts/tab-check.mjs",
  },
  // The other direction: a gate that CAN be answered must not go quiet. Without
  // this, "make everything unanswerable" would satisfy every check above.
  {
    id: 'gate-goes-quiet',
    file: 'src/Scout.fs',
    claim: 'a gate this payload can answer does not retreat to "cannot tell"',
    find: '        | LocalAvailable -> Qualifies "no national-only broadcast"',
    replace: '        | LocalAvailable -> Unanswerable "streams"',
    expect: "URL='http://localhost:8080/?data=games-2026-08-09' node scripts/tab-check.mjs",
  },
  // The leak live-tabs-check found on the deployed page: the relay's pass
  // reason carries a composite score and its threshold, and rendering it
  // verbatim walks both past SealedRank as a string.
  {
    id: 'pass-reason-leak',
    file: 'src/Pick.fs',
    claim: 'the relay pass reason is never rendered, whatever it contains',
    find: 'let passReasonText (_: PassReason) =\n    "Passed on tonight — no game cleared the bar."',
    replace: 'let passReasonText (PassReason raw) = raw',
    expect: 'node scripts/pick-check.mjs',
  },
  {
    id: 'button-order',
    file: 'src/PickemView.fs',
    claim: 'the side buttons read in the same order as the matchup label',
    find: '        orderByMatchup game.Sport (Home, game.Home) (Away, game.Away)',
    replace: '        (Home, game.Home), (Away, game.Away)',
    expect: 'node scripts/pickem-check.mjs',
  },
]

const selected = ONLY ? MUTATIONS.filter(m => m.id === ONLY) : MUTATIONS

// --- restore safety ----------------------------------------------------------
// Backups in tmp, never in src/, and handlers on every exit path. proof-check
// learned this the hard way: a SIGTERM mid-run left a mutated working tree.
const backupDir = mkdtempSync(join(tmpdir(), 'mutation-'))
const backups = new Map()

const restore = () => {
  for (const [file, path] of backups) {
    if (existsSync(path)) writeFileSync(file, readFileSync(path))
  }
  backups.clear()
}
for (const signal of ['exit', 'SIGINT', 'SIGTERM', 'SIGHUP', 'uncaughtException']) {
  process.on(signal, () => { restore(); if (signal !== 'exit') process.exit(1) })
}

const run = cmd => {
  try {
    execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' })
    return true
  } catch {
    return false
  }
}

const { check, summarize } = createChecks()

console.log(`\nMutation testing ${selected.length} invariant(s)\n`)

// A green baseline, or every mutation "fails" for an unrelated reason.
check('the unmutated tree passes every expectation',
  selected.every(m => run(m.expect)),
  'a check was already failing, so nothing below would mean anything')

for (const m of selected) {
  const original = readFileSync(m.file, 'utf8')
  if (!original.includes(m.find)) {
    check(`[${m.id}] the mutation anchor still exists`, false,
      `not found in ${m.file}: ${m.find.trim()}`)
    continue
  }

  const backupPath = join(backupDir, m.file.replace(/\//g, '_'))
  writeFileSync(backupPath, original)
  backups.set(m.file, backupPath)
  writeFileSync(m.file, original.replace(m.find, m.replace))

  const built = run('npm run build')
  const survived = built && run(m.expect)

  writeFileSync(m.file, original)
  backups.delete(m.file)

  if (!built) {
    // The compiler refusing the mutation is a stronger result than a check
    // catching it — the invariant is enforced by the type system.
    check(`[${m.id}] ${m.claim}`, true, '')
    console.log(`      → defended by the COMPILER (the mutation does not build)`)
  } else {
    check(`[${m.id}] ${m.claim}`, !survived,
      `mutation SURVIVED — ${m.file} was broken and \`${m.expect}\` still passed. ` +
      `Nothing defends this claim.`)
  }
}

// Leave the tree as it was found, whatever happened above.
restore()
run('npm run build')

process.exit(summarize() === 0 ? 0 : 1)
