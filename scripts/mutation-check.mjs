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
  // The two sparkline bugs this replaces, each restored and required to fail.
  {
    id: 'spark-normalise',
    file: 'src/Desk.fs',
    claim: 'bars use a fixed 0-100 domain, not the series maximum',
    find: '    |> List.map (fun p -> DramaBar(max 0 (min DRAMA_DOMAIN_MAX p)))',
    replace: '    |> fun ps ->\n' +
      '        let m = if List.isEmpty ps then 1 else List.max ps\n' +
      '        ps |> List.map (fun p -> DramaBar(p * DRAMA_DOMAIN_MAX / (max 1 m)))',
    expect: 'node scripts/spark-check.mjs',
  },
  {
    id: 'spark-every-nth',
    file: 'src/Desk.fs',
    claim: 'downsampling takes the bucket max, so a spike cannot be stepped over',
    find: '                source.[start .. stop - 1] |> Array.max ]',
    replace: '                source.[start] ]',
    expect: 'node scripts/spark-check.mjs',
  },
  // --- the rows that had no teeth at all until row-confidence.mjs said so ----

  {
    id: 'decoder-rejects-real',
    file: 'src/Desk.fs',
    claim: 'the decoders actually accept the real captures',
    find: '          Streams = get.Optional.Field "streams" Decode.string',
    replace: '          Streams = get.Required.Field "streams" (Decode.int |> Decode.map string) |> Some',
    expect: 'node scripts/run-row.mjs "decoders accept both real captures"',
  },
  {
    // Inverted: this row passes when the command FAILS. Loosening the decoder
    // makes the corrupted fixture decode, which is the survival condition.
    id: 'decoder-loses-teeth',
    file: 'src/Desk.fs',
    claim: 'the decoders still refuse the corrupted fixture',
    find: '                | Error err -> Malformed err)',
    replace: '                | Error _ -> NotPresent)',
    expect: 'node scripts/run-row.mjs "decoders still REJECT the corrupted fixture"',
  },
  {
    id: 'render-wrong-score',
    file: 'src/Scoreboard.fs',
    claim: 'the rendered card shows the real score',
    find: '    | Final(h, a, _) -> line h a',
    replace: '    | Final(_, _, _) -> line 0 0',
    expect: 'node scripts/run-row.mjs "render checks pass on both captures"',
  },
  {
    id: 'grouping-collapsed',
    file: 'src/Scoreboard.fs',
    claim: 'the slate is grouped by sport',
    find: '        |> List.groupBy (fun g -> g.Sport)',
    replace: '        |> List.groupBy (fun _ -> Sport.MLB)',
    expect: 'node scripts/run-row.mjs "grouping and date navigation pass"',
  },
  {
    id: 'build-warning',
    file: 'src/Scoreboard.fs',
    claim: 'the build really is warning-free',
    find: 'let private el (tag: string) (className: string) (text: string) : HTMLElement =',
    replace: 'let private __warn (x: HTMLElement) = x :?> HTMLElement\n\nlet private el (tag: string) (className: string) (text: string) : HTMLElement =',
    expect: 'node scripts/run-row.mjs "build is clean, zero F#/NuGet warnings"',
  },
  {
    id: 'seal-goes-public',
    file: 'src/Pick.fs',
    claim: 'the proof docs are compiled, so an opened seal is caught',
    find: 'type SealedRank = private SealedRank of float',
    replace: 'type SealedRank = SealedRank of float',
    expect: 'node scripts/run-row.mjs "doc claims are compiler-verified, not prose"',
  },
  {
    // RETARGETED from live-check.yml, and the reason is the finding.
    //
    // This mutation injects a build-dependent step into a job, and it only has
    // teeth if that job has NO build. live-check.yml had none — until ed701a6
    // gave it one, because render-check started importing build/Venues.js. The
    // fix was correct and it silently disarmed this mutation: injecting a
    // build-dependent step into a job that builds is not a violation, so
    // workflow-check rightly passed and the mutation SURVIVED. CI run
    // 31551408060 caught it.
    //
    // The lesson is not "pick a better line". It is that a mutation which
    // depends on the ABSENCE of something is disarmed the moment that thing is
    // added, silently, by an unrelated and correct change. So this now targets
    // status.yml, which is build-free by nature — it probes live URLs and reads
    // git, and there is no plausible future in which it compiles F#.
    id: 'workflow-cannot-run-step',
    file: '.github/workflows/status.yml',
    claim: 'a job that cannot run its own scripts is caught',
    find: '      - name: Regenerate the outbox index',
    replace: '      - name: Window simulation in a job that never builds\n        run: npm run check:window\n\n      - name: Regenerate the outbox index',
    expect: 'node scripts/run-row.mjs "workflow jobs can run the scripts they invoke"',
  },
  {
    // The OTHER half of workflow-check, which had no mutation at all.
    //
    // `jobHasFullHistory` has been exercised only by the detector's own in-file
    // self-test replays, never against a real workflow — so "the detector still
    // catches a history reader on a shallow checkout" was a claim about a
    // fixture. verify.yml runs check:history, which walks git log to the root;
    // FIELD's production gate hit this and papered it with fetch-depth: 25.
    id: 'workflow-shallow-history',
    file: '.github/workflows/verify.yml',
    claim: 'a job that reads git history on a shallow checkout is caught',
    find: '          fetch-depth: 0',
    replace: '          fetch-depth: 1',
    expect: 'node scripts/run-row.mjs "workflow jobs can run the scripts they invoke"',
  },

  {
    id: 'zone-utc',
    file: 'src/Desk.fs',
    claim: 'the FIELD zone is real, not a fixed offset',
    find: "timeZone: 'America/New_York',\n    year:",
    replace: "timeZone: 'UTC',\n    year:",
    expect: 'node scripts/run-row.mjs "FIELD-zone day is correct at fixed instants"',
  },

  // --- world mutations: these rows measure the repo, not the source ---------

  {
    id: 'outbox-missing',
    claim: "a session that wrote no outbox is caught",
    mutate: 'mkdir -p /tmp/mut-outbox && mv outbox/cc-*$(TZ=America/New_York date +%F)*.md /tmp/mut-outbox/ 2>/dev/null || true',
    restore: 'mv /tmp/mut-outbox/*.md outbox/ 2>/dev/null || true; rmdir /tmp/mut-outbox 2>/dev/null || true',
    expect: 'node scripts/run-row.mjs "this session wrote its outbox"',
  },
  {
    id: 'outbox-stub',
    claim: 'an empty stub does not count as a write-up',
    mutate: 'mkdir -p /tmp/mut-stub && cp outbox/cc-*$(TZ=America/New_York date +%F)*.md /tmp/mut-stub/ 2>/dev/null; for f in outbox/cc-*$(TZ=America/New_York date +%F)*.md; do [ -e "$f" ] || continue; echo stub > "$f"; done',
    restore: 'cp /tmp/mut-stub/*.md outbox/ 2>/dev/null || true; rm -rf /tmp/mut-stub',
    expect: 'node scripts/run-row.mjs "this session wrote its outbox"',
  },
  // Targets the row's OWN predicate rather than the working tree.
  //
  // The first version appended a line to a source file and expected the row to
  // fail. It survived — because this working tree already had outbox changes in
  // it, so the row correctly said "source and outbox both changed". The
  // mutation was measuring the state of my desk, not the rule.
  //
  // Moving the outbox aside first would work and is not worth the risk of a
  // failed restore losing a session's write-ups. So this breaks the outbox half
  // of the predicate directly, which forces the "no outbox entry" answer
  // whatever the tree looks like.
  //
  // Stated plainly: this proves the row's verdict flows from that predicate. It
  // does NOT prove the row gives the right answer on a clean tree — the world
  // mutation would, and a dirty tree prevents it here.
  {
    id: 'outbox-pairing-blind',
    file: 'scripts/gate-checks.mjs',
    claim: 'the source/outbox pairing rule is what decides that row',
    find: '  return changed.some(f => /^outbox\\//.test(f))',
    replace: '  return false',
    expect: 'node scripts/run-row.mjs "source changes arrive with an outbox entry"',
  },

  {
    id: 'history-boundary-moved',
    claim: 'moving the rule boundary without the count is caught',
    mutate: "sed -i 's/^e9bc4ca[0-9a-f]*  17/543a64d4a0c1a5a53db7b8dbd3aab0f39a2b0a1a  17/' docs/history-boundary.txt",
    restore: 'git checkout -- docs/history-boundary.txt',
    expect: 'node scripts/run-row.mjs "every governed commit paired source with outbox"',
  },

  // --- the harness's own teeth --------------------------------------------
  //
  // Every other mutation here asks "is this invariant defended?". This one asks
  // "can this harness still tell?" — and it is the only mutation that is
  // SUPPOSED to survive.
  //
  // The danger for a mutation harness is not that it misses a bug. It is that
  // it reports every mutation as caught: invert one comparison, or make `run()`
  // always return false, and all 24 rows above turn green while proving
  // nothing. That is this session's whole failure mode applied to the tool
  // built to find it.
  //
  // So this breaks something deliberately UNDEFENDED — a line of prose in a
  // doc — with an expectation that passes regardless. A working harness must
  // report it as a survivor and exit 1. `--only known-survivor` FAILING is
  // therefore the evidence, and the gate row asserts exactly that.
  {
    id: 'known-survivor',
    selfTestOnly: true,
    file: 'docs/gate-rows.txt',
    claim: 'the harness can still detect a surviving mutation',
    find: '# THE GATE IS A CONJUNCTION.',
    replace: '# THE GATE IS A CONJUNCTION (mutated).',
    expect: 'node -e "process.exit(0)"',
  },
  {
    id: 'harness-blind',
    file: 'scripts/mutation-check.mjs',
    claim: 'a harness that calls everything caught is itself caught',
    find: '  const survived = built && run(m.expect)',
    replace: '  const survived = false',
    // Inverted: the row passes when this command FAILS (a survivor is
    // correctly reported). Blinding the harness makes it pass, which is the
    // survival condition.
    expect: `bash -c '! node scripts/mutation-check.mjs --only known-survivor'`,
  },

  {
    id: 'scorer-blind',
    file: 'scripts/row-confidence.mjs',
    claim: 'a scorer that calls every row toothed is itself caught',
    find: 'const score = (hasTeeth, hasClock) => (hasTeeth ? 70 : 0) + (hasClock ? 0 : 30)',
    replace: 'const score = () => 100',
    expect: 'node scripts/run-row.mjs "every gate row has teeth and is deterministic"',
  },

  {
    id: 'value-never-read',
    file: 'src/Units.fs',
    claim: 'a public value nothing reads is caught',
    find: 'let toProb (p: float<pct>) : float<prob> = p / 100.0<pct/prob>',
    replace: 'let toProb (p: float<pct>) : float<prob> = p / 100.0<pct/prob>\n\nlet unreadValue (x: int) = x + 1',
    expect: 'node scripts/run-row.mjs "no value is written without being read back"',
  },

  {
    id: 'gate-day-per-row',
    file: 'scripts/gate-checks.mjs',
    claim: 'the gate pins its day once, so a run crossing midnight is consistent',
    find: '  const today = GATE_DAY',
    replace: '  const today = fieldDay()',
    expect: 'node scripts/run-row.mjs "every gate row has teeth and is deterministic"',
  },

  {
    id: 'red-main-softened',
    file: 'scripts/status.mjs',
    claim: 'a failing verify run is reported as failing',
    find: "  return `**${run.conclusion.toUpperCase()}** on \\`${sha}\\` — [run ${run.id}](${run.html_url})`",
    replace: "  return `**green** on \\`${sha}\\``",
    expect: 'node scripts/run-row.mjs "a red main is reported, not softened"',
  },

  {
    // The softening through the branch that looked harmless. A run stuck
    // in_progress for an hour reads as "running", which reads as neutral.
    id: 'stalled-run-reads-as-running',
    file: 'scripts/status.mjs',
    claim: 'a run stuck in progress is called stalled, not running',
    find: '    if (idleMs > STALL_MINUTES * 60_000) {',
    replace: '    if (false) {',
    expect: 'node scripts/run-row.mjs "a red main is reported, not softened"',
  },

  {
    // Production's flat `isOutdoor` boolean has no third state, so a retractable
    // roof must be filed as one of the other two — and loanDepot park is filed
    // outdoor. This is that collapse, restored.
    id: 'retractable-assumed-open',
    file: 'src/Weather.fs',
    claim: 'a retractable roof is never assumed to have been open',
    find: '    | Retractable -> UnknownRoofState',
    replace: '    | Retractable -> PlayedInTheOpen',
    expect: 'node scripts/run-row.mjs "the F# harness refuses a check with no counterexample"',
  },

  {
    // The misleading empty state playground throws to avoid: a total outage
    // rendering as "no venues with known coordinates".
    id: 'outage-reads-as-empty',
    file: 'src/Weather.fs',
    claim: 'an outage is distinguishable from a slate with no locatable venue',
    find: '    elif List.isEmpty readings then EveryFetchFailed eligible',
    replace: '    elif List.isEmpty readings then NoVenuesWithCoordinates',
    expect: 'node scripts/run-row.mjs "the F# harness refuses a check with no counterexample"',
  },

  {
    // Blind the F# harness the way every other detector here could be blinded:
    // make a toothless check report as a pass. Its own self-test must object,
    // and if it does not, 16/16 means only that the suite ran.
    id: 'harness-accepts-toothless',
    file: 'src/Verify.fs',
    claim: 'a check whose counterexample also passes is reported as having no teeth',
    find: '    | true, true -> NoTeeth',
    replace: '    | true, true -> Held',
    expect: 'node scripts/run-row.mjs "the F# harness refuses a check with no counterexample"',
  },

  {
    // The other direction, which the mutation above does not cover. A harness
    // that called EVERYTHING toothless would also kill that mutation, and would
    // be exactly as useless — this is the one-directional failure arriving in
    // the thing built to prevent it.
    id: 'harness-calls-everything-toothless',
    file: 'src/Verify.fs',
    claim: 'a genuine two-directional check is reported as holding',
    find: '    | true, false -> Held',
    replace: '    | true, false -> NoTeeth',
    expect: 'node scripts/run-row.mjs "the F# harness refuses a check with no counterexample"',
  },

  {
    // The softening that already happened once. A read that fails and reports
    // no problem is indistinguishable from a read that found nothing wrong —
    // which is the state STATUS.md sat in on commit 363dd93, saying "unknown"
    // with nothing recording that the token had simply not been passed.
    id: 'unreadable-history-swallowed',
    file: 'scripts/status.mjs',
    claim: 'a workflow-history read that the API rejects is reported as a problem',
    find: "    return { text: `unreadable — the workflow-history API answered ${res.status}`, problem: `HTTP ${res.status}` }",
    replace: "    return { text: `unreadable — the workflow-history API answered ${res.status}`, problem: null }",
    expect: 'node scripts/run-row.mjs "a red main is reported, not softened"',
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

// `selfTestOnly` mutations are EXPECTED to survive. They are the harness's own
// teeth and must never run in the normal suite, where they would fail it.
/**
 * Apply a mutation to source text.
 *
 * SELF-MUTATION NEEDS A GUARD. When the harness mutates its own file, the
 * `find` string it is looking for also exists inside the MUTATIONS table above
 * — as the literal defining the mutation. A naive `replace` hits that first
 * occurrence, rewrites the mutation's own definition, and leaves the logic it
 * was aiming at untouched. The mutation then "survives" because it never
 * happened, and the harness reports that its self-test has no teeth when in
 * fact the test never ran.
 *
 * That cost about twenty minutes of looking in the wrong place, and it is
 * exactly the class this file exists for: a result that is wrong for a reason
 * unrelated to the thing being measured.
 *
 * So when the target is this file, only the region AFTER the table is mutated.
 */
const applyMutation = (source, m) => {
  const guard = m.file === 'scripts/mutation-check.mjs'
    ? source.indexOf('const selected = ONLY')
    : 0
  return source.slice(0, guard) + source.slice(guard).replace(m.find, m.replace)
}

const selected = ONLY
  ? MUTATIONS.filter(m => m.id === ONLY)
  : MUTATIONS.filter(m => !m.selfTestOnly)

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
//
// DEDUPED. Four mutations expect `run-row.mjs "the F# harness refuses a check
// with no counterexample"`, four expect the same `tab-check` invocation, and so
// on — 38 expects across the suite, 22 distinct. Running an identical command
// sixteen extra times proves nothing it did not prove the first time; it was
// costing about a minute of every gate run.
//
// This is the safe kind of speedup and worth naming as such: it removes
// REPEATED work, not work. Every distinct expectation still runs, and the
// per-mutation loop below is untouched.
const distinctExpects = [...new Set(selected.map(m => m.expect))]
check('the unmutated tree passes every expectation',
  distinctExpects.every(cmd => run(cmd)),
  `a check was already failing, so nothing below would mean anything ` +
  `(${distinctExpects.length} distinct expectation(s) from ${selected.length} mutation(s))`)

for (const m of selected) {
  // A WORLD mutation changes something outside the source — a file the check
  // reads, a workflow, an outbox entry. The outbox and history rows have their
  // logic inside gate-checks.mjs, so a source mutation there would be circular:
  // it would test the check by rewriting the check. Mutating what they MEASURE
  // is the honest version.
  if (m.mutate) {
    run(m.mutate)
    const passed = run(m.expect)
    run(m.restore)
    const caught = !passed
    check(`[${m.id}] ${m.claim}`, caught,
      `mutation SURVIVED — \`${m.expect}\` still passed. ` +
      `Nothing defends this claim.`)
    continue
  }

  const original = readFileSync(m.file, 'utf8')
  const mutated = applyMutation(original, m)
  if (mutated === original) {
    check(`[${m.id}] the mutation anchor still exists`, false,
      `not found in ${m.file}: ${m.find.trim()}`)
    continue
  }

  const backupPath = join(backupDir, m.file.replace(/\//g, '_'))
  writeFileSync(backupPath, original)
  backups.set(m.file, backupPath)
  writeFileSync(m.file, mutated)

  // Only source changes need recompiling. Mutating a workflow or a doc does
  // not, and rebuilding for those added a minute each for nothing.
  const built = m.file.startsWith('src/') ? run('npm run build') : true
  // No inversion flag. A row that passes when its command fails already encodes
  // that itself — `run-row.mjs` reports the ROW's verdict, and a shell `!` wraps
  // anything else. An `inverted` option existed here briefly and was removed
  // unused: a branch nothing exercises is precisely what this harness is for.
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
