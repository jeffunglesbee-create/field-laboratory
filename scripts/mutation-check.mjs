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
//
// For the gate, which runs it split across runners (docs/CC-CMD-2026-11-03-gate-speed.md):
//         --shard i/N        the mutations at positions i-1, i-1+N, ... of the table (every id in exactly one shard)
//         --ids a,b,c        exactly these mutations
//         --list-ids         print the ids a full run covers, as JSON, and exit (reads, runs nothing)
//         --out FILE         write a record per mutation (verdict, build and expectation times, whether the compiled output changed)
//         --build watch|full watch (default): one `dotnet fable watch -c Release` for the whole run, about 3 s a compile; full: `npm run build` every time,
//                            the reference. Both make the build CLEAN, and check its digest, before every mutation.
//
// And for recovery and for the checks that stand guard over this file:
//         --heal             undo what a killed run left applied, and stop a build driver it left running (what every start does first), say so, and stop; runs no mutation
//         --anchors          read-only: every mutation's anchor is still in its file, and unique there; non-zero if any is not
//         --stranded         read-only: exit 1, naming the command that heals it, while a killed run's marker is still there (.mutation-state/active.json or nested/active.json; it says whether the file is still mutated or already back) or a build driver a dead run left running is still alive (.mutation-state/driver.json); exit 0 when there is none. It heals and stops nothing: the hook and the gate run it first. A live run's lock (run.json) is not read: a live run is not a stranded one, and every start refuses on its lock
//         --self-test        the heal, the locks, the markers and the scratch-repository runs, on throwaway files in a state directory of their own (the pre-commit hook runs it)

import { execSync, spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, mkdtempSync, readdirSync, rmdirSync, copyFileSync, readlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join, dirname, resolve } from 'node:path'
import { createChecks, finish } from './checks.mjs'
import { isLive, startOf, statOf } from './run-marker.mjs'
import { WatchBuild, FullBuild, digestDir, parseShard, shardOf, verdictOf, stopwatch, compileSteadily, confirmFullCompile } from './mutation-lib.mjs'

const ONLY = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null
// A flag given without a value is a usage error. It used to read as "not given", so `--ids "$LIST"` with an empty LIST, or a trailing `--shard`, ran the whole table
// in one process and wrote the baseline artifact as if it were the full run.
const flagValue = name => {
  const at = process.argv.indexOf(name)
  if (at < 0) return null
  const v = process.argv[at + 1]
  if (!v || v.startsWith('--')) {
    console.error(`${name} wants a value, so nothing was run.`)
    process.exit(2)
  }
  return v
}
const BUILD_MODE = flagValue('--build') ?? 'watch'
const SHARD = flagValue('--shard')
const IDS = flagValue('--ids')
const OUT = flagValue('--out')
// Test-only: `skip-restore-wait` makes the watch driver write a restore and NOT wait for the compile, which the next pre-check must refuse.
const MUTATION_FAULT = process.env.MUTATION_FAULT ?? null

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
    // The agreement check must compare against the ORACLE, not against itself.
    // Widening what counts as a name changes every count in Prose.fs and
    // nothing in jq-tokenizer.mjs, so the two must diverge and prose-check must
    // say so. If this survives, the check is measuring F# against F#.
    id: 'prose-drifts-from-oracle',
    file: 'src/Prose.fs',
    claim: 'the F# prose dimensions really are checked against the relay tokeniser',
    find: '    w.Length > 1 && System.Char.IsUpper w.[0]',
    replace: '    w.Length > 0 && System.Char.IsUpper w.[0]',
    expect: 'node scripts/prose-check.mjs',
  },
  {
    // The promotion rule is the module. Letting an INFERRED score promote to a
    // typed one erases the distinction between "the data says era 2" and "a
    // timestamp comparison in two scripts suggests era 2" — which is exactly the
    // guess that -67.8 rested on.
    id: 'inferred-score-promotes',
    file: 'src/Corpus.fs',
    claim: 'a guessed rubric cannot become a known one',
    find: '    | Stamped 2 -> Some(Score s.Value)\n    | _ -> None',
    replace: '    | Stamped 2 -> Some(Score s.Value)\n    | Inferred _ -> Some(Score s.Value)\n    | _ -> None',
    expect: 'node scripts/corpus-check.mjs',
  },
  {
    // A document claim that has stopped being true must fail the build. This
    // mutates the DOCUMENT rather than the source — the thing docs-check
    // measures — because mutating the checker to test the checker is circular.
    id: 'doc-claim-goes-stale',
    file: 'docs/PROSE-PROOF.md',
    claim: 'a document that stops being true stops the build',
    find: '<!-- claim: prose.flooredPct = 91.2 -->',
    replace: '<!-- claim: prose.flooredPct = 50.0 -->',
    expect: 'node scripts/docs-check.mjs',
  },
  {
    // The silent success the acceptance criterion forbids. When the primary
    // errored and no body came back, both paths are gone; returning an empty
    // Draft instead of an Error makes that indistinguishable from a brief that
    // simply had nothing to say. `Result` is the only thing standing between
    // those two, so the check must object when it is bypassed.
    id: 'both-paths-failed-becomes-a-draft',
    file: 'src/Journalism.fs',
    claim: 'a generation where both paths failed cannot be reported as a Draft',
    find: '            | "", Some e -> return Error(BothPathsFailed(e, "fallback returned no body"))',
    replace: '            | "", Some _ -> return Ok(draft p answered "")',
    expect: 'node scripts/journalism-check.mjs',
  },
  {
    // "We cannot tell" must not collapse into "no". Making ProxySilent report
    // `Some false` is the single most tempting simplification in the module —
    // it removes an option from every call site — and it is exactly the defect:
    // an absent provenance header would then read as "the fallback did not run",
    // which is a claim about production that nothing supports.
    id: 'proxy-silent-becomes-false',
    file: 'src/Journalism.fs',
    claim: 'absent provenance stays UNKNOWN rather than being reported as a negative',
    find: '    | ProxySilent -> None\n    | Unusable _ -> None',
    replace: '    | ProxySilent -> Some false\n    | Unusable _ -> Some false',
    expect: 'node scripts/journalism-check.mjs',
  },
  {
    // Dominance is the whole relation. Turning it into EQUALITY reproduces the
    // acceptance criterion the plan actually shipped — "must match
    // home_score/away_score" — and every mid-game brief becomes a fabrication.
    id: 'scoreline-dominance-becomes-equality',
    file: 'src/Scoreline.fs',
    claim: 'a mid-game score is judged by dominance, not equality',
    find: 'if (x <= h && y <= a) || (x <= a && y <= h) then Consistent else Impossible',
    replace: 'if (x = h && y = a) || (x = a && y = h) then Consistent else Impossible',
    expect: 'node scripts/scoreline-check.mjs',
  },
  {
    // Only one assignment tried. A brief naming the away side first would be
    // reported as fabricating — the false accusation the unordered comparison
    // exists to prevent.
    id: 'scoreline-tries-one-assignment',
    file: 'src/Scoreline.fs',
    claim: 'a scoreline claim is compared in both assignments, since it is unordered',
    find: 'if (x <= h && y <= a) || (x <= a && y <= h) then Consistent else Impossible',
    replace: 'if (x <= h && y <= a) then Consistent else Impossible',
    expect: 'node scripts/scoreline-check.mjs --self-test',
  },
  {
    // `Unsettled` absorbed into a pass. A game with no final would read as a
    // checked, clean brief — the claim-from-no-data this repo keeps filing
    // against other people's work.
    id: 'scoreline-unsettled-counts-as-checked',
    file: 'src/Scoreline.fs',
    claim: 'a game with no final is not counted as a claim that was checked',
    find: '    | Consistent | Impossible -> true\n    | Unsettled -> false',
    replace: '    | Consistent | Impossible -> true\n    | Unsettled -> true',
    expect: 'node scripts/scoreline-check.mjs --self-test',
  },
  {
    // The time-anchoring extractor must be checked against the RELAY's oracle,
    // not against itself. Widening what counts as an anchor changes every count
    // in Journalism.fs and nothing in the verbatim JS copy inside
    // journalism-check, so the two must diverge.
    id: 'anchor-drifts-from-oracle',
    file: 'src/Journalism.fs',
    claim: 'the anchoring extractor really is measured against the relay original',
    find: 'if stat = 0 then 10',
    replace: 'if stat = 0 then 20',
    expect: 'node scripts/journalism-check.mjs',
  },
  {
    // The reachable ceiling must be the measured one. Restating it as 300 makes
    // the flat 240 bar look like a reasonable four-fifths threshold — which is
    // exactly the mistake, so ceiling-check must object. If this survives, the
    // check is reading the bar rather than the scale it is applied to.
    id: 'ceiling-restated-as-nominal',
    file: 'src/Ceiling.fs',
    claim: 'the quality bar is measured against what the scorer can reach, not the rubric total',
    // RE-ANCHORED 2026-09-21. The anchor read `Max = 245` and `4d3f203`
    // corrected the ceilings to 294 nominal / 252 relay, so it matched NOTHING
    // and the row reported a failure rather than a verdict — which is the
    // harness behaving correctly (Rule 90's corollary: NOT CAUGHT with no
    // mutation applied is worse than no test) and the anchor being stale. The
    // replacement is the nominal ceiling, which is what "the rubric total"
    // now means.
    find: '    { Max = 252<point>; Name = "relay',
    replace: '    { Max = 294<point>; Name = "relay',
    expect: 'node scripts/ceiling-check.mjs',
  },
  {
    // NFL's convention must be exercised, not just recorded. Flipping it to
    // home-first is a change no compiler objects to — the registry still has an
    // entry and every match is still exhaustive — so if this survives, the
    // registry's CONTENT is unguarded and only its shape was ever checked.
    id: 'nfl-convention-flipped',
    file: 'src/Desk.fs',
    claim: 'the sport registry is checked for what it says, not just that it has an entry',
    find: '| Sport.NFL -> { Label = "NFL"; Matchup = AwayAtHome;',
    replace: '| Sport.NFL -> { Label = "NFL"; Matchup = HomeVersusAway;',
    expect: 'node scripts/sport-registry-check.mjs',
  },
  {
    // The composite-score scan is narrowed by PROVENANCE — it subtracts the
    // element PickView marks `pick-outlets`. Drop the class and the marker is
    // gone, the outlet text is scanned again, and the false positive that
    // turned main red on 2026-08-15 comes back. If this survives, the exclusion
    // is not actually keyed to the class and the fix is somewhere else.
    id: 'outlet-class-dropped',
    file: 'src/PickView.fs',
    claim: 'the score scan really excludes the outlet paragraph by its class',
    find: 'el "p" "pick-empty pick-outlets"',
    replace: 'el "p" "pick-empty"',
    expect: 'node scripts/outlet-scan-check.mjs',
  },
  {
    // The brief flip is a disclosure, not a decorative turn. Downgrading the
    // role to a non-interactive one leaves the card looking flippable while a
    // screen reader hears nothing actionable — the exact gap between "it looks
    // like it works" and "it works" this repo keeps filing against production.
    id: 'brief-flip-not-a-button',
    file: 'src/Scoreboard.fs',
    claim: 'a flippable card is an accessible disclosure button, not just a visual flip',
    find: 'card.setAttribute("role", "button")',
    replace: 'card.setAttribute("role", "group")',
    expect: 'node scripts/brief-flip-check.mjs',
  },
  {
    // Only cards WITH a brief may be flippable. Filtering on presence rather
    // than on TEXT would make a brief that decoded to an empty string flippable
    // — a card that turns to reveal nothing, which is the dishonest empty state
    // the text filter exists to prevent.
    id: 'brief-flip-ignores-empty-text',
    file: 'src/Desk.fs',
    claim: 'a brief with no text does not make its card flippable',
    find: '        | Some t when t.Trim() <> "" -> true\n        | _ -> false',
    replace: '        | Some _ -> true\n        | _ -> false',
    expect: 'node scripts/brief-flip-check.mjs',
  },
  {
    // The Briefs tab aggregates only briefs that HAVE text. Counting a brief
    // that decoded to an empty string inflates every aggregate — the ProxySilent
    // count, the scoring_version count, the anchoring denominator — with a brief
    // that shows nothing, which is the same dishonest inclusion the card's flip
    // filter refuses one level down.
    id: 'briefs-tab-counts-empty',
    file: 'src/BriefsView.fs',
    claim: 'the Briefs tab aggregates only text-bearing briefs',
    find: '    | Some t when t.Trim() <> "" -> true\n    | _ -> false',
    replace: '    | Some _ -> true\n    | _ -> false',
    expect: 'node scripts/brief-flip-check.mjs',
  },
  {
    // A stored brief is ProxySilent, and the card must SAY so rather than name
    // the request-body model as though it answered. Rendering the fallback name
    // as the answering model is the exact silent substitution the J-layer types
    // refuse — a provenance the data does not support, shown as fact.
    id: 'card-claims-provenance-it-lacks',
    file: 'src/Scoreboard.fs',
    claim: 'a ProxySilent brief is shown as not-recorded, not as answered by the fallback',
    find: '            | Journalism.ProxySilent -> "answering model not recorded (proxy silent)"',
    replace: '            | Journalism.ProxySilent -> "answered by " + defaultArg brief.Model "?"',
    expect: 'node scripts/brief-flip-check.mjs',
  },
  {
    // Impossible must win the per-brief verdict. If Consistent takes precedence,
    // a brief that makes one impossible scoreline claim alongside a consistent
    // one reads as fine — a fabrication badged as checked-out, which is the whole
    // thing the verdict exists to surface.
    id: 'verdict-consistent-beats-impossible',
    file: 'src/Scoreline.fs',
    claim: 'one impossible scoreline taints the brief, beating a consistent one',
    find: '    elif List.contains Impossible verdicts then Some Impossible\n    elif List.contains Consistent verdicts then Some Consistent',
    replace: '    elif List.contains Consistent verdicts then Some Consistent\n    elif List.contains Impossible verdicts then Some Impossible',
    expect: 'node scripts/brief-flip-check.mjs',
  },
  {
    // The weather fan-out must stay bounded. Unbounded, it fired one request
    // per venue simultaneously and Open-Meteo 429'd a twelve-venue slate on
    // 2026-08-15, turning live-check red on three assertions at once. Raising
    // the bound past the slate size restores exactly that shape, so the burst
    // check must object — otherwise it is reading the constant rather than
    // measuring the concurrency.
    id: 'weather-bursts-unbounded',
    file: 'src/WeatherView.fs',
    claim: 'the weather fan-out is really bounded at runtime, not just in a constant',
    find: 'let private maxInFlight = 4',
    replace: 'let private maxInFlight = 999',
    expect: 'node scripts/weather-burst-check.mjs',
  },
  {
    // verify's weather step went red on a 503 in the venue loop, after the first
    // call had answered (runs 38984732123, 39454054451). The flag must reach
    // every call, or that recurs.
    // docs/CC-CMD-2026-10-17-weather-live-http-outage.md
    id: 'weather-tolerance-first-call-only',
    file: 'scripts/weather-live-check.mjs',
    claim: 'under --tolerate-unreachable a venue that did not answer is warned, not failed',
    find: '        if (tolerate) unanswered(v.Name, `${why}, twice`)\n        else zoneMismatches',
    replace: '        zoneMismatches',
    expect: 'node scripts/weather-live-check.mjs --self-test',
  },
  {
    // Tolerating every non-200 lets a broken forecastUrl (400 on every venue)
    // read as "checked 0 of 45" and exit 0 for ever.
    id: 'weather-tolerates-any-non-200',
    file: 'scripts/weather-live-check.mjs',
    claim: 'a 4xx is the service answering, and stays fatal under the flag',
    find: 'const didNotAnswer = (status) => status === 429 || status >= 500',
    replace: 'const didNotAnswer = (status) => status !== 200',
    expect: 'node scripts/weather-live-check.mjs --self-test',
  },
  {
    // A retry pass that never runs drops every deferred venue: neither warned
    // nor failed, which is the silent pass the coverage line exists to prevent.
    id: 'weather-retry-drops-deferred',
    file: 'scripts/weather-live-check.mjs',
    claim: 'a venue deferred to the retry is always either checked or reported',
    find: '    for (const v of deferred) {',
    replace: '    for (const v of []) {',
    expect: 'node scripts/weather-live-check.mjs --self-test',
  },
  {
    // A venue that answers only on the retry is checked like any other.
    id: 'weather-retry-unassessed',
    file: 'scripts/weather-live-check.mjs',
    claim: 'a retry answer with the wrong zone is still a mismatch',
    find: '      recovered++\n      await assess(v, res)',
    replace: '      recovered++\n      answered++',
    expect: 'node scripts/weather-live-check.mjs --self-test',
  },
  {
    // The drift-sentinel runs without the flag; there an outage is the finding.
    id: 'weather-unreachable-tolerated-without-flag',
    file: 'scripts/weather-live-check.mjs',
    claim: 'without the flag, any call that did not answer fails the run',
    find: '    check(`Open-Meteo answers ${what}`, false, why)',
    replace: '    void why',
    expect: 'node scripts/weather-live-check.mjs --self-test',
  },
  {
    // The 2026-10-20 slate named Anfield, and the table lacked it: verify's live
    // render check went red. Deleting it again must be caught without a live slate.
    // docs/CC-CMD-2026-10-20-live-slate-venue-coverage.md
    id: 'venue-table-loses-anfield',
    file: 'src/Venues.fs',
    claim: 'a venue added for a real slate stays accounted for',
    find: '      at "Anfield" 53.4308 -2.9608 OpenAir "Europe/London"\n',
    replace: '',
    expect: 'node build/VerifyMain.js',
  },
  {
    // The 2026-11-09 slate had no table row on it, and verify and live-check went
    // red on it. U.S. Bank Stadium is the row that answers that;
    // deleting it must make the suite red again. Four entries, one per claim the
    // row makes: that it exists, its roof, its point and its zone.
    // docs/CC-CMD-2026-11-09-venue-review-remainder.md
    id: 'venue-us-bank-stadium-row-deleted',
    file: 'src/Venues.fs',
    claim: 'the 2026-11-09 slate keeps a table row',
    find: '      at "U.S. Bank Stadium" 44.9739 -93.2581 Dome "America/Chicago"\n',
    replace: '',
    expect: 'node build/VerifyMain.js',
  },
  {
    id: 'venue-us-bank-stadium-roof-open',
    file: 'src/Venues.fs',
    claim: 'U.S. Bank Stadium is a fixed-roof row',
    find: '      at "U.S. Bank Stadium" 44.9739 -93.2581 Dome "America/Chicago"\n',
    replace: '      at "U.S. Bank Stadium" 44.9739 -93.2581 OpenAir "America/Chicago"\n',
    expect: 'node build/VerifyMain.js',
  },
  {
    id: 'venue-us-bank-stadium-moved',
    file: 'src/Venues.fs',
    claim: 'U.S. Bank Stadium is at the point its evidence gives',
    find: '      at "U.S. Bank Stadium" 44.9739 -93.2581 Dome "America/Chicago"\n',
    replace: '      at "U.S. Bank Stadium" 44.9839 -93.2581 Dome "America/Chicago"\n',
    expect: 'node build/VerifyMain.js',
  },
  {
    id: 'venue-us-bank-stadium-zone-changed',
    file: 'src/Venues.fs',
    claim: 'U.S. Bank Stadium is declared in the zone its point lies in',
    find: '      at "U.S. Bank Stadium" 44.9739 -93.2581 Dome "America/Chicago"\n',
    replace: '      at "U.S. Bank Stadium" 44.9739 -93.2581 Dome "America/Denver"\n',
    expect: 'node build/VerifyMain.js',
  },
  {
    // The sourced block is generated from the sourcing run's artifact; a row
    // deleted by hand must not pass as a table that still matches it.
    // docs/CC-CMD-2026-10-20-outdoor-venue-sourcing.md, stage 4
    id: 'venue-sourced-row-deleted',
    file: 'src/Venues.fs',
    claim: 'every venue the sourcing run accepted is in the table',
    find: '      at "Parc des Princes" 48.8414 2.2531 OpenAir "Europe/Paris"\n',
    replace: '',
    expect: 'node scripts/venue-sourced-check.mjs',
  },
  {
    // The CC-CMD's own Task 2 mutation: a sourced row that was on the 2026-10-20
    // slate, deleted, leaves that slate with a venue nobody accounted for.
    id: 'venue-sourced-slate-row-deleted',
    file: 'src/Venues.fs',
    claim: 'a sourced venue from a real slate stays accounted for',
    find: '      at "Parc des Princes" 48.8414 2.2531 OpenAir "Europe/Paris"\n',
    replace: '',
    expect: 'node build/VerifyMain.js',
  },
  {
    // A roof guard that did not run is not a guard that passed: with no article
    // body, "open" was accepted unchecked.
    id: 'venue-source-bodyless-open-accepted',
    file: 'scripts/venue-source.mjs',
    claim: 'an open roof is never inferred when the body check could not run',
    find: "  if (ld === 'open' && body == null) return",
    replace: "  if (false) return",
    expect: 'node scripts/venue-source.mjs --self-test',
  },
  {
    // "Paris FC" without its FC is "Paris", the start of "Paris Saint-Germain".
    id: 'venue-home-affix-loosened',
    file: 'scripts/venue-source.mjs',
    claim: 'a home name with its own club affix is matched exactly, never loosened',
    find: 'if (!raw.some(t => CLUB_AFFIX.has(t)) && occs.some(',
    replace: 'if (occs.some(',
    expect: 'node scripts/venue-source.mjs --self-test',
  },
  {
    // Two clubs named Rovers in two cities are not one answer.
    id: 'venue-home-far-apart-picked',
    file: 'scripts/venue-source.mjs',
    claim: 'a home team listed at candidates in different places picks nothing',
    find: 'if (spreadOf(hit) > AMBIGUOUS_DEG) return { chosen: null,',
    replace: 'if (false) return { chosen: null,',
    expect: 'node scripts/venue-source.mjs --self-test',
  },
  {
    // "Celtic" is also inside "Castlebar Celtic F.C." and "Derry Celtic F.C.".
    id: 'venue-home-exact-not-first',
    file: 'scripts/venue-source.mjs',
    claim: 'an exact club name outranks a name that only contains it',
    find: 'let hit = entities.filter(e => tier(e) === 1), t = 1',
    replace: 'let hit = entities.filter(e => tier(e) > 0), t = 1',
    expect: 'node scripts/venue-source.mjs --self-test',
  },
  {
    // The old fillCards matched the reading's own name only: 71 chips of 73 on 2026-10-24.
    id: 'venue-reading-serves-only-its-own-name',
    file: 'src/Venues.fs',
    claim: 'a reading for one alias fills the card that says the other',
    find: 'List.contains cardVenue (namesAt readingVenue)',
    replace: 'readingVenue = cardVenue',
    expect: 'node build/VerifyMain.js',
  },
  {
    // Aliases are found by coordinate, not by name.
    id: 'venue-names-at-ignores-coordinate',
    file: 'src/Venues.fs',
    claim: 'namesAt returns every name at the same place',
    find: 'entries |> List.filter (fun e -> coordKey e.Where = key) |> List.map (fun e -> e.Name)',
    replace: 'entries |> List.filter (fun e -> e.Name = name) |> List.map (fun e -> e.Name)',
    expect: 'node build/VerifyMain.js',
  },
  {
    // A pick in another city is a collision, not the same ground.
    id: 'venue-collision-always-same-ground',
    file: 'scripts/venue-collisions.mjs',
    claim: 'a home-team pick far from the table row is reported as a collision',
    find: "!chosen ? 'abstain' : near(chosen, row, eps) ? 'same-ground' : 'collision'",
    replace: "!chosen ? 'abstain' : true ? 'same-ground' : 'collision'",
    expect: 'node scripts/venue-collisions.mjs --self-test',
  },
  {
    // One candidate is no choice: judging it called the Brewers' Phoenix
    // spring-training complex a collision for Milwaukee's 43 home games.
    id: 'venue-collision-judges-single-candidate',
    file: 'scripts/venue-collisions.mjs',
    claim: 'a home-team pick among a single candidate is not judged',
    find: "candidates < 2 ? 'single-candidate' :",
    replace: "false ? 'single-candidate' :",
    expect: 'node scripts/venue-collisions.mjs --self-test',
  },
  {
    // The stale row: Red Bull Arena at Harrison NJ, which made it an alias of
    // Sports Illustrated Stadium and showed Leipzig's game New Jersey weather.
    id: 'venue-red-bull-arena-back-in-new-jersey',
    file: 'src/Venues.fs',
    claim: 'Red Bull Arena is Leipzig, not the New Jersey ground',
    find: 'at "Red Bull Arena" 51.3458 12.3481 OpenAir "Europe/Berlin"',
    replace: 'at "Red Bull Arena" 40.7367 -74.1503 OpenAir "America/New_York"',
    expect: 'node build/VerifyMain.js',
  },
  {
    // Texas gave "Texas College".
    id: 'venue-team-page-not-football',
    file: 'scripts/venue-source.mjs',
    claim: 'a team page that is not about football is not the home team',
    find: "if (!t.includes('football') || t.includes('national')) return false",
    replace: "if (t.includes('national')) return false",
    expect: 'node scripts/venue-source.mjs --self-test',
  },
  {
    // Texas St gave Tarleton State Texans football.
    id: 'venue-team-page-without-home-name',
    file: 'scripts/venue-source.mjs',
    claim: 'a team page must carry the home name',
    find: 'return expandedHome(home).every(x => t.includes(x))',
    replace: 'return true',
    expect: 'node scripts/venue-source.mjs --self-test',
  },
  {
    // If it were OpenStreetMap it could never corroborate an OpenStreetMap point.
    id: 'venue-team-venue-own-family',
    file: 'scripts/venue-source.mjs',
    claim: 'a team-derived venue is a Wikidata-family witness, not an OpenStreetMap one',
    find: "'team-venue': 'wikidata'",
    replace: "'team-venue': 'osm'",
    expect: 'node scripts/venue-source.mjs --self-test',
  },
  {
    // Chris Smith Field is not Zoeller Field.
    id: 'venue-generic-word-confirms',
    file: 'scripts/venue-source.mjs',
    claim: 'a shared generic word (Field, Stadium) is not a confirmation',
    find: "'stadium', 'field', 'park',",
    replace: "'stadium', 'park',",
    expect: 'node scripts/venue-source.mjs --self-test',
  },
  {
    // Sharing words with the venue's name confirmed a point 1,700 miles wrong.
    id: 'venue-reverse-confirms-on-shared-words',
    file: 'scripts/venue-source.mjs',
    claim: 'an OpenStreetMap name confirms a point only when it is nothing but the venue\'s own words',
    find: 'return mine.length > 0 && mine.every(t => theirs.has(t))',
    replace: 'return mine.some(t => theirs.has(t))',
    expect: 'node scripts/venue-source.mjs --self-test',
  },
  {
    // The point's own label was an input to the confirmation, so the Phoenix
    // spring-training complex confirmed itself as American Family Field.
    id: 'venue-point-confirms-itself',
    file: 'scripts/venue-source.mjs',
    claim: 'a proposed point\'s own label is never an input to confirming it',
    find: 'export const confirmedBy = (osmName, venueName) => named(osmName, venueName)',
    replace: 'export const confirmedBy = (osmName, venueName, label = \'\') => named(osmName, venueName, label)',
    expect: 'node scripts/venue-source.mjs --self-test',
  },
  {
    // A World Cup game at Arrowhead took Colombia's home ground.
    id: 'venue-team-path-any-sport',
    file: 'scripts/venue-source.mjs',
    claim: 'the team path runs for American football venues only',
    find: "export const americanFootballOnly = sports => /^(CFB|NFL)(,(CFB|NFL))*$/.test((sports ?? '').trim())",
    replace: "export const americanFootballOnly = sports => /(CFB|NFL)/.test((sports ?? '').trim())",
    expect: 'node scripts/venue-source.mjs --self-test',
  },
  {
    // The team's home ground was accepted for any venue the team is listed against.
    id: 'venue-team-point-not-tied',
    file: 'scripts/venue-source.mjs',
    claim: 'a point reached only through the home team is not tied to the venue',
    find: "(NAME_DRIVEN.has(p.source) || (p.source === 'team-venue' && named(p.label ?? '', venueName))))",
    replace: 'true)',
    expect: 'node scripts/venue-source.mjs --self-test',
  },
  {
    // Colombia national football team.
    id: 'venue-national-team-page',
    file: 'scripts/venue-source.mjs',
    claim: 'a national team page is not the home team page',
    find: "if (!t.includes('football') || t.includes('national')) return false",
    replace: "if (!t.includes('football')) return false",
    expect: 'node scripts/venue-source.mjs --self-test',
  },
  {
    // The two placements the first wider-net run got wrong must stay out of the table.
    id: 'venue-known-bad-placement-ignored',
    file: 'scripts/venue-sourced-check.mjs',
    claim: 'a row on a once-accepted wrong placement is caught by name and point',
    find: 'b.name === m[1].replace(/\\\\(.)/g, \'$1\') &&',
    replace: 'false &&',
    expect: 'node scripts/venue-sourced-check.mjs --self-test',
  },
  {
    // One of the 44 grounds on 2026-10-24's college football slate, deleted: its
    // game would have no weather chip again.
    id: 'venue-cfb-slate-row-deleted',
    file: 'src/Venues.fs',
    claim: 'every venue on the 2026-10-24 college football slate stays in the table',
    find: '      at "Ryan Field" 42.0654 -87.6915 OpenAir "America/Chicago"\n',
    replace: '',
    expect: 'node build/VerifyMain.js',
  },
  {
    // Exeter's ground put back at Newcastle's coordinates, as the first wider-net
    // run had it.
    id: 'venue-exeter-at-newcastle',
    file: 'src/Venues.fs',
    claim: "Exeter's St James Park is not at Newcastle's St. James' Park",
    find: 'at "St James Park" 50.7307 -3.5212 OpenAir "Europe/London"',
    replace: 'at "St James Park" 54.9755 -1.6218 OpenAir "Europe/London"',
    expect: 'node build/VerifyMain.js',
  },
  {
    // The anchor check that would have caught venue-team-page-not-football in a
    // second instead of 97 minutes.
    id: 'mutation-anchors-ignores-stale',
    file: 'scripts/mutation-check.mjs',
    claim: 'a mutation whose search string is gone is reported by --anchors',
    find: 'if (applyMutation(source, m) === source) stale.push(',
    replace: 'if (false) stale.push(',
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    // A name with an escaped quote was skipped and the calibration covered 409
    // of 410 rows while reporting on "the table" (run 39821284339).
    id: 'venue-source-reader-skips-escaped-quote',
    file: 'scripts/venue-source.mjs',
    claim: 'the calibration reads every row of the table',
    find: 'at "((?:[^"\\\\]|\\\\.)+)"',
    replace: 'at "([^"]+)"',
    expect: 'node scripts/venue-source.mjs --self-test',
  },
  {
    // The first Wembley's article is in the past tense; reading it as standing
    // gave a demolished building's roof to the current one (run 39816569585).
    id: 'venue-source-past-tense-ignored',
    file: 'scripts/venue-source.mjs',
    claim: 'a lead describing a demolished building is recognised',
    find: "?.[0] === 'was'",
    replace: "?.[0] === 'never'",
    expect: 'node scripts/venue-source.mjs --self-test',
  },
  {
    // An arena dropped from the list is a slate the render check calls a
    // coverage gap again.
    id: 'indoor-arena-unrecorded',
    file: 'src/Venues.fs',
    claim: 'an NHL/NBA arena on a real slate is recorded as indoor',
    find: '          "Bell Centre"\n',
    replace: '',
    expect: 'node build/VerifyMain.js',
  },
  {
    // Ignoring the arena list turns every NHL/NBA-only slate back into a
    // coverage failure; ignoring placeholders the other way would hide gaps.
    id: 'arena-predicate-ignored',
    file: 'scripts/render-check.mjs',
    claim: 'a recorded indoor arena is nothing to observe, and nothing else is',
    find: 'const observableVenues = vs => realVenues(vs).filter(v => !isIndoorArena(v))',
    replace: 'const observableVenues = vs => realVenues(vs).filter(v => true)',
    expect: "URL='http://localhost:8080/?data=context-2026-05-15' node scripts/render-check.mjs",
  },
  {
    // Reported 2026-10-21: Metrics "non-selectable" on a phone, wholly off the
    // right edge of a strip whose scrollbar is hidden. A link to ?tab=metrics
    // must bring the tab into view.
    id: 'tab-strip-no-reveal',
    file: 'src/Program.fs',
    claim: 'a selected tab is scrolled fully into the strip at phone width',
    find: '        reveal target\n',
    replace: '',
    expect: "URL='http://localhost:8080/?data=games-2026-08-09' node scripts/tab-check.mjs",
  },
  {
    id: 'tab-strip-right-edge-unmarked',
    file: 'src/Program.fs',
    claim: 'a strip with tabs past its right edge says so',
    find: 'mark "data-more-right" (s.scrollLeft + s.clientWidth < s.scrollWidth - 1.0)',
    replace: 'mark "data-more-right" false',
    expect: "URL='http://localhost:8080/?data=games-2026-08-09' node scripts/tab-check.mjs",
  },
  {
    id: 'tab-strip-edges-stale-on-scroll',
    file: 'src/Program.fs',
    claim: 'the edge marks follow the strip as it scrolls',
    find: '    | strip -> strip.addEventListener ("scroll", fun _ -> markEdges ())',
    replace: '    | strip -> ()',
    expect: "URL='http://localhost:8080/?data=games-2026-08-09' node scripts/tab-check.mjs",
  },
  {
    id: 'tab-strip-fade-unstyled',
    file: 'index.html',
    claim: 'a marked edge is visibly faded',
    find: '.tabs[data-more-right] {\n    -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 2.5rem), transparent);\n            mask-image: linear-gradient(to right, #000 calc(100% - 2.5rem), transparent);\n  }',
    replace: '.tabs[data-more-right] { }',
    expect: "URL='http://localhost:8080/?data=games-2026-08-09' node scripts/tab-check.mjs",
  },
  {
    // Owner, 2026-10-21: the Metrics tab showed labels, not plain English.
    // A section that loses its explanation must turn the render check red.
    id: 'metrics-gravity-unexplained',
    file: 'src/MetricsView.fs',
    claim: 'every Metrics section says what it measures and how to read it',
    find: '        explain body "How to read it" [\n            "Each row is one play',
    replace: '        explain body "How to reread it" [\n            "Each row is one play',
    expect: "URL='http://localhost:8080/' node scripts/metrics-render-check.mjs",
  },
  {
    id: 'metrics-second-wind-bare-ids',
    file: 'src/MetricsView.fs',
    claim: 'Second Wind rows name the player and the game, not bare ids',
    find: '                        child row (el "span" "mx-play-id" (sprintf "%s, %s" who where)) |> ignore',
    replace: '                        child row (el "span" "mx-play-id" (sprintf "Game %d, player %d" game.Id player)) |> ignore',
    expect: "URL='http://localhost:8080/' node scripts/metrics-render-check.mjs",
  },
  {
    // Owner amendment 2026-10-21: finished-game narratives, cross-checked
    // against each module's accessible name by metrics-render-check.
    id: 'narrative-second-wind-off-by-one',
    file: 'src/Stamina.fs',
    claim: 'a Second Wind sentence states the same late attempts as its label',
    find: '(attempts (e.InFirst + e.InLast)) e.InLast (float',
    replace: '(attempts (e.InFirst + e.InLast)) (e.InLast + 1) (float',
    expect: "URL='http://localhost:8080/' node scripts/metrics-render-check.mjs",
  },
  {
    // Owner amendment 2026-10-21: finished-game narratives, cross-checked
    // against each module's accessible name by metrics-render-check.
    id: 'narrative-gravity-snap-throw-swapped',
    file: 'src/Gravity.fs',
    claim: 'a Gravity sentence states snap then throw, as its label measures',
    find: 'Drawing p | Level p | Ceding p -> sprintf "%s %d → %d" label p.AtSnap p.AtRelease',
    replace: 'Drawing p | Level p | Ceding p -> sprintf "%s %d → %d" label p.AtRelease p.AtSnap',
    expect: "URL='http://localhost:8080/' node scripts/metrics-render-check.mjs",
  },
  {
    // Owner amendment 2026-10-21: finished-game narratives, cross-checked
    // against each module's accessible name by metrics-render-check.
    id: 'narrative-flow-starts-at-first-shot',
    file: 'src/Flow.fs',
    claim: 'a Flow spell starts at its third counted shot, where the cell turns InFlow',
    find: '(clockText (fst (List.item (flowShots - 1) r.Counted)))',
    replace: '(clockText (fst (List.item 0 r.Counted)))',
    expect: "URL='http://localhost:8080/' node scripts/metrics-render-check.mjs",
  },
  {
    // Owner amendment 2026-10-21: finished-game narratives, cross-checked
    // against each module's accessible name by metrics-render-check.
    id: 'narrative-gravity-not-rendered',
    file: 'src/MetricsView.fs',
    claim: 'every archived Gravity play carries its sentence',
    find: '                            match Gravity.playNarrative archived m.GameId m.PlayId with',
    replace: '                            match None with',
    expect: "URL='http://localhost:8080/' node scripts/metrics-render-check.mjs",
  },
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
    // Production's exact bug, restored. buildComebackProbability guards `post`
    // but not `pre`, so a scheduled game parses 0-0 and announces a tie
    // directly beneath the win-loss records — a 47-73 team called even with a
    // 73-46 team, on all seven pre-game cards.
    id: 'comeback-on-a-scheduled-game',
    file: 'src/Stats.fs',
    claim: 'a scheduled game cannot reach the comeback line',
    find: '    | Scheduled\n    | Final _ -> None',
    replace: '    | Scheduled -> Some { Leader = 0; Trailer = 0 }\n    | Final _ -> None',
    expect: 'node scripts/run-row.mjs "the F# harness refuses a check with no counterexample"',
  },

  {
    // The transposition visible in the screenshot: header "Orioles @ Twins",
    // records line "Twins: 59-62 · Orioles: 58-62".
    id: 'records-line-transposed',
    file: 'src/Stats.fs',
    claim: 'anything listing both sides orders through the same function as the header',
    find: '    presentByMatchup r.Sport r.Home r.Away',
    replace: '    Contest(r.Home, r.Away)',
    expect: 'node scripts/run-row.mjs "the F# harness refuses a check with no counterexample"',
  },

  {
    // The state both new panels actually shipped in: no card styling at all.
    // Restores it by neutralising the one rule that draws the boundary.
    id: 'cards-run-together',
    file: 'index.html',
    claim: 'games on a panel are drawn as separate cards',
    // RE-ANCHORED 2026-09-05. The old anchor named a border and a
    // border-radius that `370bb8d` deleted on 2026-08-26 — "take the boxes back
    // off — the check could only ever say 'add a border'". From that commit the
    // find string matched nothing, so this claim was undefended for ten days and
    // the gate row failed with "the mutation anchor still exists".
    //
    // It has to be the GAP. `separation-check` measures a disjunction —
    // `gap >= 4 || border contrast >= 3.0` — and index.html says so where the
    // rule lives: "The gap is what separation-check.mjs measures." A first
    // re-anchor here took the padding and background off `.st-card` instead;
    // the mutation applied cleanly and SURVIVED, because neither is an arm of
    // that disjunction. Breaking a property the check does not read is not a
    // weaker mutation, it is not a mutation at all.
    //
    // With `gap: 0` the gap arm fails and the border arm is already 1.0 — these
    // cards have no border since 370bb8d — so the row goes red, which is the
    // whole point of the claim.
    find: '  .st-reports, .wx-rows {\n    display: grid;\n    gap: 1rem;\n  }',
    replace: '  .st-reports, .wx-rows { display: grid; gap: 0; }',
    expect: 'node scripts/run-row.mjs "games on a panel are separated from each other"',
  },

  {
    // The half no stylesheet can satisfy. A screen reader reads seven games as
    // one run of text unless each is a named region, and every visual assertion
    // above stays green while that is true.
    id: 'cards-lose-their-names',
    file: 'src/StatsView.fs',
    claim: 'each game is an individually named region',
    find: '    card.setAttribute ("aria-label", title)',
    replace: '    ignore title',
    expect: 'node scripts/run-row.mjs "games on a panel are separated from each other"',
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
    // WIDENED 2026-09-05, from `cc-*` to every dated entry.
    //
    // `outboxToday` reads `outbox/*<today>*.md` and takes ANY of them over 1500
    // bytes. These two mutations moved only `cc-*`, so on any day carrying a
    // second dated entry under another prefix the row kept its evidence and the
    // mutation SURVIVED — reported as "nothing defends this claim" when what was
    // actually undefended was the mutation's own reach.
    //
    // Found on 2026-09-05, when a `decision-2026-09-05-*.md` sat beside the
    // session doc. The glob has to be the predicate's glob; anything narrower
    // tests a claim the row does not make.
    //
    // THE STASH IS $STASH, A DIRECTORY IN THE STATE DIRECTORY, NOT /tmp (2026-11-04). This moves the
    // session's real write-ups out of outbox/; the stash used to be /tmp/mut-outbox, which a container
    // restart wipes, so a kill in the window and a restart lost whatever was not yet committed. The
    // harness sets STASH, keeps it as long as the marker, and reads the tree back after the restore.
    mutate: 'mkdir -p "$STASH" && mv outbox/*$(TZ=America/New_York date +%F)*.md "$STASH"/ 2>/dev/null || true',
    restore: 'mv "$STASH"/*.md outbox/ 2>/dev/null || true',
    expect: 'node scripts/run-row.mjs "this session wrote its outbox"',
  },
  {
    id: 'outbox-stub',
    claim: 'an empty stub does not count as a write-up',
    // Widened with `outbox-missing` above, and for the same reason.
    // $STASH, as above: the copies of the real write-ups that the stubs replace.
    mutate: 'mkdir -p "$STASH" && cp outbox/*$(TZ=America/New_York date +%F)*.md "$STASH"/ 2>/dev/null; for f in outbox/*$(TZ=America/New_York date +%F)*.md; do [ -e "$f" ] || continue; echo stub > "$f"; done',
    restore: 'cp "$STASH"/*.md outbox/ 2>/dev/null || true',
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
    // Derives the CURRENT boundary from the file rather than matching a literal.
    //
    // It used to be `sed -i 's/^e9bc4ca[0-9a-f]*  17/…/'`, which hardcoded the
    // boundary's value into the mutation that defends it. When the boundary
    // legitimately moved to `829f2ac … 18` on 2026-08-17 the pattern stopped
    // matching, sed became a no-op, and the harness reported the claim as
    // undefended. A guard coupled to the value it guards is disarmed by every
    // legitimate change to that value.
    //
    // Replaces the sha and keeps the count, which is exactly the edit the
    // boundary file says must fail the check. Exits non-zero if the line is not
    // found, so a malformed boundary file is a loud failure here too.
    // A copy of the file goes in $STASH first and is what the restore puts back: it used to be
    // `git checkout -- docs/history-boundary.txt`, which also discards any uncommitted edit to the file that
    // was there BEFORE the run, even when nothing is killed.
    mutate: 'mkdir -p "$STASH" && cp docs/history-boundary.txt "$STASH"/history-boundary.txt && node -e "' +
      'const fs=require(\'fs\'),f=\'docs/history-boundary.txt\';' +
      'const t=fs.readFileSync(f,\'utf8\');' +
      'const m=/^([0-9a-f]{40})(\\s+)(\\d+)\\s*$/m.exec(t);' +
      'if(!m)process.exit(1);' +
      'const other=m[1][0]===\'a\'?\'b\':\'a\';' +
      'fs.writeFileSync(f,t.replace(m[0],other.repeat(40)+m[2]+m[3]))' +
      '"',
    restore: 'cp "$STASH"/history-boundary.txt docs/history-boundary.txt',
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
    find: '  const survived = built && await expectation(m)',
    replace: '  const survived = false',
    // Inverted: the row passes when this command FAILS (a survivor is
    // correctly reported). Blinding the harness makes it pass, which is the
    // survival condition.
    expect: `bash -c '! node scripts/mutation-check.mjs --only known-survivor'`,
  },
  {
    id: 'harness-applies-a-replacement-as-a-pattern',
    file: 'scripts/mutation-check.mjs',
    claim: "an entry's replace is applied as the text written: a `$'`, `$&`, `$$` or backtick-dollar in it is those characters, not what String.prototype.replace expands them to (`lineups-two-prefix-characters-unread` holds `'$'` and was applied as 16,106 characters of the rest of the file)",
    find: "source.slice(guard).replace(m.find, () => m.replace)",
    replace: "source.slice(guard).replace(m.find, m.replace)",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },

  // --- the harness's kill recovery (2026-11-04) --------------------------------------------------
  //
  // docs/CC-CMD-2026-11-03-gate-state-hazards.md. A marker says a run was killed; it does not say the
  // tree is still as that run left it, and heal() used to write the backup over the file on that
  // sentence alone. These break each part of the rule that replaced it, and of the ownership rule
  // beside it (the exit handler cleared state it had not written, so `--self-test` erased a real
  // stranded marker). Each is caught by the self-test, which plants state in a directory of its
  // own and runs the real planHeal() and healAt(); a few by the real script started over a real
  // stranded state. They target this file after the table, as the entries above do.
  {
    id: 'heal-writes-over-a-moved-file',
    file: 'scripts/mutation-check.mjs',
    claim: "a file that is neither the original nor the mutation is not overwritten from a backup",
    find: "  if (now !== m.mutatedSha) return 'diverged'\n",
    replace: "",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'heal-trusts-any-backup',
    file: 'scripts/mutation-check.mjs',
    claim: "a backup that is gone, or is not the original, is not written over the file",
    find: "  return probes.fileSha(m.backup) === m.originalSha ? 'restore' : 'lost'",
    replace: "  return 'restore'",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'heal-rewrites-what-is-already-undone',
    file: 'scripts/mutation-check.mjs',
    claim: "a file already back to the original is left alone, whatever state its backup is in",
    find: "  if (now === m.originalSha) return 'clear'",
    replace: "  if (false) return 'clear'",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'heal-goes-under-a-live-run',
    file: 'scripts/mutation-check.mjs',
    claim: "a marker whose process is still running stops this run instead of being healed under it",
    find: "  if (probes.live(m)) return 'refuse'",
    replace: "  if (false) return 'refuse'",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'heal-applies-a-marker-it-cannot-check',
    file: 'scripts/mutation-check.mjs',
    claim: "a marker written before the hashes existed is reported as such and not applied",
    find: "  if (typeof m.originalSha !== 'string' || typeof m.mutatedSha !== 'string') return 'legacy'",
    replace: "  if (false) return 'legacy'",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'heal-reads-an-unreadable-marker',
    file: 'scripts/mutation-check.mjs',
    claim: "a marker that does not parse stops the run with the state kept",
    find: "  if (m === null || typeof m !== 'object' || typeof m.id !== 'string') return 'unreadable'",
    replace: "  if (false) return 'unreadable'",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'heal-restores-a-moved-world',
    file: 'scripts/mutation-check.mjs',
    claim: "a change made outside the source is undone only if the tree is exactly as the mutation left it",
    find: "      return where === 'other' ? 'diverged' : 'restore'",
    replace: "      return 'restore'",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'heal-trusts-a-world-restore',
    file: 'scripts/mutation-check.mjs',
    claim: "a restore command that ran is not taken to have worked until the tree is read back",
    find: "    if (!back) return stop(",
    replace: "    if (false) return stop(",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'heal-reruns-an-undone-world',
    file: 'scripts/mutation-check.mjs',
    claim: "a world mutation already undone runs nothing",
    find: "      if (where === 'undone') return 'clear'",
    replace: "      if (false) return 'clear'",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'heal-forgets-the-stash',
    file: 'scripts/mutation-check.mjs',
    claim: "a world restore is handed the stash its mutation used",
    find: "    probes.exec(m.restoreCmd, { STASH: m.stash })",
    replace: "    probes.exec(m.restoreCmd, {})",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'exit-handler-clears-foreign-state',
    file: 'scripts/mutation-check.mjs',
    claim: "the exit handler clears only state this process wrote",
    find: "  if (ownsState && undone && !buildDirty) clearActive()",
    replace: "  if (undone && !buildDirty) clearActive()",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'claiming-state-does-not-own-it',
    file: 'scripts/mutation-check.mjs',
    claim: "a process that writes state owns it and clears it",
    find: "const claimState = () => { mkdirSync(stateDir, { recursive: true }); ownsState = true }",
    replace: "const claimState = () => { mkdirSync(stateDir, { recursive: true }) }",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'self-test-uses-the-real-state-dir',
    file: 'scripts/mutation-check.mjs',
    claim: "the self-test works in a state directory of its own",
    // The mutated self-test is started by the harness as its expectation, with MUTATION_STATE_DIR set to a directory beneath the harness's OWN. Replacing the
    // temp directory with a bare '.mutation-state' pointed the mutated self-test at the harness's own directory instead, and its clean-up deleted the harness's
    // marker, backup and run lock while it was running (reproduced 2026-11-03: a gate run killed by a container restart a few entries later had no run.json
    // and the marker of the entry under test as the only record). The variable is honoured here, so the child keeps to the directory it was given. With no variable it
    // uses a directory that is neither under tmp nor the real state directory, NOT `.mutation-state`: a run killed while this entry is applied leaves the mutated file on
    // disk, and the next `--self-test` (the pre-commit hook, the gate row's first command) loads it. With `.mutation-state` that self-test emptied the real directory and the
    // stranded marker and backup went with it (found by review, 2026-11-04, after the first version of this fix).
    find: "  ? mkdtempSync(join(tmpdir(), 'mutation-state-'))",
    replace: "  ? (process.env.MUTATION_STATE_DIR || 'mutation-state-not-under-tmp')",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'child-shares-the-state-dir',
    file: 'scripts/mutation-check.mjs',
    claim: "a harness run started by a harness run keeps its state beneath its parent's, not in it",
    find: "MUTATION_STATE_DIR: join(stateDir, 'nested'), ...extra",
    replace: "MUTATION_STATE_DIR: stateDir, ...extra",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'heal-skips-the-nested-state',
    file: 'scripts/mutation-check.mjs',
    claim: "a mutation applied by a nested harness run is healed with its parent's",
    find: "  const nested = healAt(join(dir, 'nested'), options)",
    replace: "  const nested = false",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'heal-looks-at-the-top-state-before-the-nested-one',
    file: 'scripts/mutation-check.mjs',
    claim: "a parent's and a nested run's marker over one file are healed child first, so the child's change comes off the parent's mutation and then the parent's comes off the original",
    find: "  const nested = healAt(join(dir, 'nested'), options)\n  return healAt(dir, options) || nested",
    replace: "  const top = healAt(dir, options)\n  return healAt(join(dir, 'nested'), options) || top",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'marker-forgets-the-mutated-hash',
    file: 'scripts/mutation-check.mjs',
    claim: "a source marker records what the file becomes under the mutation",
    find: "  ({ id: m.id, file: m.file, backup, originalSha: sha(original), mutatedSha: sha(mutated), rebuild, ...identity() })",
    replace: "  ({ id: m.id, file: m.file, backup, originalSha: sha(original), mutatedSha: sha(original), rebuild, ...identity() })",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'source-marker-forgets-who-wrote-it',
    file: 'scripts/mutation-check.mjs',
    claim: "a source marker records its process and when it started",
    find: "  ({ id: m.id, file: m.file, backup, originalSha: sha(original), mutatedSha: sha(mutated), rebuild, ...identity() })",
    replace: "  ({ id: m.id, file: m.file, backup, originalSha: sha(original), mutatedSha: sha(mutated), rebuild })",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'world-marker-forgets-who-wrote-it',
    file: 'scripts/mutation-check.mjs',
    claim: "a world marker records its process and when it started",
    find: "  ({ id: m.id, restoreCmd: m.restore, stash, before, head: headOf(), ...identity() })",
    replace: "  ({ id: m.id, restoreCmd: m.restore, stash, before, head: headOf() })",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  // The wiring of the main flow, which no scenario above runs: the self-test starts the REAL script in a scratch repository, kills it
  // (SIGKILL, or a throw the handler can see) at a chosen moment, and looks at what is on disk.
  {
    id: 'source-marker-not-written',
    file: 'scripts/mutation-check.mjs',
    claim: "a source mutation writes its marker before the run can be killed",
    find: "  writeFileSync(marker, markerText)",
    replace: "  void markerText",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'world-touched-not-recorded',
    file: 'scripts/mutation-check.mjs',
    claim: "a world mutation records the paths it touched in its marker once it is applied",
    find: "    const worldMarkerText = JSON.stringify({ ...worldMarker, touched })",
    replace: "    const worldMarkerText = JSON.stringify(worldMarker)",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'exit-handler-leaves-a-world-mutation-applied',
    file: 'scripts/mutation-check.mjs',
    claim: "an exit undoes a world mutation that is still applied, before the state that holds its stash goes",
    find: "  const undone = undoWorld()",
    replace: "  const undone = true",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'world-undo-runs-nothing-useful',
    file: 'scripts/mutation-check.mjs',
    claim: "the exit handler undoes a world mutation with the mutation's own restore command",
    find: "  run(process.env.MUTATION_FAULT === 'world-restore-noop' ? 'true' : partial, { STASH: w.stash })",
    replace: "  run('true', { STASH: w.stash })",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'world-undo-forgets-the-readback',
    file: 'scripts/mutation-check.mjs',
    claim: "a world restore that ran is not taken to have worked until the paths it touched are read back",
    find: "    ok = w.touched ? worldState(w.touched, now) === 'undone' : sameSnapshot(w.before, now)",
    replace: "    ok = true",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'snapshot-sees-only-names',
    file: 'scripts/mutation-check.mjs',
    claim: "the snapshot of the tree sees a content change to a file that was already modified",
    find: "    try { snap[path] = existsSync(path) ? sha(readFileSync(path)) : '<missing>' } catch { snap[path] = '<unreadable>' }",
    replace: "    snap[path] = existsSync(path) ? 'present' : '<missing>'",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'run-lock-is-not-exclusive',
    file: 'scripts/mutation-check.mjs',
    claim: "two runs starting together cannot both take the run lock",
    find: "writeFileSync(runLock, JSON.stringify(identity()), { flag: 'wx' })",
    replace: "writeFileSync(runLock, JSON.stringify(identity()), { flag: 'w' })",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'run-lock-never-taken',
    file: 'scripts/mutation-check.mjs',
    claim: "a run takes the run lock before it mutates anything",
    find: "if (!acquireRunLock()) {",
    replace: "if (false) {",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'lock-held-by-a-live-run-is-ignored',
    file: 'scripts/mutation-check.mjs',
    claim: "a run lock naming a process that is still running stops the next run",
    find: "  if (held !== null && probes.live(held)) {",
    replace: "  if (false) {",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'race-refusal-exits-zero',
    file: 'scripts/mutation-check.mjs',
    claim: "a run that finds the lock taken between looking for it and taking it stops with a failing status",
    find: "Nothing was touched.`)\n  process.exit(1)\n}\nconst healedAny",
    replace: "Nothing was touched.`)\n  process.exit(0)\n}\nconst healedAny",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'race-refusal-carries-on',
    file: 'scripts/mutation-check.mjs',
    claim: "a run that finds the lock taken between looking for it and taking it stops, it does not go on to heal and mutate",
    find: "  process.exit(1)\n}\nconst healedAny",
    replace: "}\nconst healedAny",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'torn-lock-reads-as-live',
    file: 'scripts/mutation-check.mjs',
    claim: "a run lock that is not JSON names no run: it is stale and removed, not read as a live holder",
    find: "catch { held = null }",
    replace: "catch { held = { pid: process.pid } }",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'state-loss-never-checked',
    file: 'scripts/mutation-check.mjs',
    claim: "a run whose expectation deleted the harness's own state stops and says so, once the file is back",
    find: "  if (!intactAfterExpect) fatal(",
    replace: "  if (false) fatal(",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'world-state-loss-never-checked',
    file: 'scripts/mutation-check.mjs',
    claim: "a world mutation whose expectation deleted the harness's own state stops and says so",
    find: "    if (!worldIntact) fatal(",
    replace: "    if (false) fatal(",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'state-intact-reads-nothing',
    file: 'scripts/mutation-check.mjs',
    claim: "the state a run wrote is compared with what is on disk, marker and lock both",
    find: "    return readFileSync(marker, 'utf8') === markerText && JSON.parse(readFileSync(runLock, 'utf8')).pid === process.pid",
    replace: "    return true",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'uncaught-exception-is-swallowed',
    file: 'scripts/mutation-check.mjs',
    claim: "a crash says what threw before the exit handler ends the process",
    find: "    if (signal === 'uncaughtException') console.error(err?.stack ?? String(err))",
    replace: "    void err",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'heal-skips-the-rebuild-when-clear',
    file: 'scripts/mutation-check.mjs',
    claim: "a source file already back to the original is still followed by a rebuild",
    find: "    if (rebuilds && !probes.exec('npm run build')) return stop(`names [${m.id}], which was already undone, but ${rebuildFailed()}`, false)",
    replace: "    void rebuilds",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'heal-skips-the-rebuild-after-a-restore',
    file: 'scripts/mutation-check.mjs',
    claim: "a source file restored from its backup is followed by a rebuild",
    find: "    if (rebuilds && !probes.exec('npm run build')) return stop(`names [${m.id}]; ${m.file} is restored, but ${rebuildFailed()}`, false)",
    replace: "    void rebuilds",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'self-test-honours-the-env-var',
    file: 'scripts/mutation-check.mjs',
    claim: "a self-test the harness starts as an expectation does not use the directory it inherits",
    find: "const stateDir = process.argv.includes('--self-test')\n  ? mkdtempSync(join(tmpdir(), 'mutation-state-'))\n  : (process.env.MUTATION_STATE_DIR || '.mutation-state')",
    replace: "const stateDir = process.env.MUTATION_STATE_DIR || (process.argv.includes('--self-test') ? mkdtempSync(join(tmpdir(), 'mutation-state-')) : '.mutation-state')",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },

  {
    id: 'lock-taken-after-the-heal',
    file: 'scripts/mutation-check.mjs',
    claim: "a run holds its lock before it heals, so a second run started during the heal is refused",
    find: "const reapedDriver = await reapDriver(stateDir)\nif (!acquireRunLock()) {",
    replace: "const reapedDriver = await reapDriver(stateDir)\nconst healedEarly = healHeld(stateDir)\nif (!acquireRunLock()) {",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'heal-cleanup-takes-the-run-lock',
    file: 'scripts/mutation-check.mjs',
    claim: "dropping a healed marker leaves the run lock of the run that is healing",
    find: "  emptyEntries(dir)\n  try { rmdirSync(dir) } catch { /* the run lock is still in it */ }",
    replace: "  rmSync(dir, { recursive: true, force: true })",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'clearing-state-takes-the-run-lock',
    file: 'scripts/mutation-check.mjs',
    claim: "clearing a run's state leaves its run lock",
    find: "    if (entry === 'run.json' || entry === 'driver.json') continue\n",
    replace: "    if (entry === 'driver.json') continue\n",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'heal-ignores-head-moving',
    file: 'scripts/mutation-check.mjs',
    claim: "a world mutation's heal notices that HEAD has moved since the kill",
    find: "const headMovedSince = (m, probes) => typeof m.head === 'string' && probes.head() !== m.head",
    replace: "const headMovedSince = (m, probes) => false",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'heal-reads-null-as-undone-after-head-moves',
    file: 'scripts/mutation-check.mjs',
    claim: "a touched path that no longer differs from HEAD is not taken for one put back once HEAD has moved",
    find: "  if (here === t.before) return headMoved && here === null ? 'other' : 'undone'",
    replace: "  if (here === t.before) return 'undone'",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'world-marker-forgets-head',
    file: 'scripts/mutation-check.mjs',
    claim: "a world marker records the commit the tree was on",
    find: "stash, before, head: headOf(), ...identity() })",
    replace: "stash, before, ...identity() })",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'lost-is-judged-before-diverged',
    file: 'scripts/mutation-check.mjs',
    claim: "a file edited after the kill is diverged whether or not its backup survived",
    find: "  if (now !== m.mutatedSha) return 'diverged'\n  return probes.fileSha(m.backup) === m.originalSha ? 'restore' : 'lost'",
    replace: "  if (probes.fileSha(m.backup) !== m.originalSha) return 'lost'\n  return now === m.mutatedSha ? 'restore' : 'diverged'",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'heal-ignores-a-failed-rebuild-after-a-restore',
    file: 'scripts/mutation-check.mjs',
    claim: "a rebuild that failed after a source restore is not called healed",
    find: "    if (rebuilds && !probes.exec('npm run build')) return stop(`names [${m.id}]; ${m.file} is restored, but ${rebuildFailed()}`, false)",
    replace: "    if (rebuilds) probes.exec('npm run build')",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'heal-ignores-a-failed-rebuild-when-clear',
    file: 'scripts/mutation-check.mjs',
    claim: "a rebuild that failed after \"already undone\" is not called healed",
    find: "    if (rebuilds && !probes.exec('npm run build')) return stop(`names [${m.id}], which was already undone, but ${rebuildFailed()}`, false)",
    replace: "    if (rebuilds) probes.exec('npm run build')",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'refusal-over-a-stash-says-delete',
    file: 'scripts/mutation-check.mjs',
    claim: "a refusal over a stash that holds files does not tell a person to delete the directory",
    find: "const how = !clears ? '' : stashHeld()",
    replace: "const how = !clears ? '' : false",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'refusal-over-an-edit-says-put-the-stash-back-first',
    file: 'scripts/mutation-check.mjs',
    claim: "a refusal that has just listed paths a person edited does not tell them to put the stash back first, which is an instruction to copy it over those paths",
    find: "? (listsPaths",
    replace: "? (false",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'refusal-over-an-edit-forgets-it-lists-paths',
    file: 'scripts/mutation-check.mjs',
    claim: "the refusal for a path changed after the kill is the one that lists paths a person owns, so it carries the advice that is true of them",
    find: "its restore command would overwrite the ones listed.`, true, true)",
    replace: "its restore command would overwrite the ones listed.`)",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'refusal-over-an-edit-does-not-say-the-state-may-go',
    file: 'scripts/mutation-check.mjs',
    claim: "the refusal that lists paths a person owns says what to do after putting back the rest: delete the state once what is still needed is out of the stash",
    find: " Then delete ${dir} to clear this: it holds the only copy of what was moved aside, so take anything you still need out of ${join(dir, 'world')} first.",
    replace: " It holds the only copy of what was moved aside.",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'world-refusal-offers-the-restore-command',
    file: 'scripts/mutation-check.mjs',
    claim: "the refusal for an edited path does not hand over the command that overwrites it",
    find: "its restore command would overwrite the ones listed.",
    replace: "its restore command would overwrite the ones listed. To undo it by hand: STASH=${m.stash} sh -c '${m.restoreCmd}'.",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'world-refusal-does-not-name-the-path',
    file: 'scripts/mutation-check.mjs',
    claim: "the refusal for an edited path names it",
    find: " (${list(edited)})",
    replace: "",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'head-moved-refusal-calls-a-path-at-head-edited',
    file: 'scripts/mutation-check.mjs',
    claim: "the refusal over a tree whose HEAD moved does not call a path that matches HEAD an edit",
    find: "const atHead = moved ? stray.filter(k => (now[k] ?? null) === null) : []",
    replace: "const atHead = []",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'head-moved-refusal-lists-a-path-at-head-as-edited',
    file: 'scripts/mutation-check.mjs',
    claim: "the refusal over a tree whose HEAD moved does not list a path that matches HEAD among the edited ones",
    find: "const edited = stray.filter(k => !atHead.includes(k))",
    replace: "const edited = stray.filter(k => atHead.includes(k) || true)",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'head-moved-refusal-says-head-moved-when-it-did-not',
    file: 'scripts/mutation-check.mjs',
    claim: "the refusal says HEAD has moved only when it has: a path a person put back to HEAD's version, with HEAD where it was, is an edit",
    find: "const atHead = moved ? stray.filter(k => (now[k] ?? null) === null) : []",
    replace: "const atHead = stray.filter(k => (now[k] ?? null) === null)",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'head-moved-refusal-gives-no-way-to-tell',
    file: 'scripts/mutation-check.mjs',
    claim: "the refusal over a path that matches a HEAD that moved tells a person how to tell a path they put back from a stub that was committed: compare it with the stash",
    find: "${atHead.length ? `Compare ${atHead.length === 1 ? 'the one that matches HEAD' : 'each that matches HEAD'} with ${m.stash} to tell which it is. ` : ''}",
    replace: "",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'head-moved-refusal-says-the-one-for-several',
    file: 'scripts/mutation-check.mjs',
    claim: "the advice to compare a path that matches HEAD with the stash agrees in number with the paths: the one for one, each for several",
    find: "${atHead.length === 1 ? 'the one that matches HEAD' : 'each that matches HEAD'}",
    replace: "${atHead.length === 1 ? 'each that matches HEAD' : 'the one that matches HEAD'}",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'refusal-forgets-to-count-the-rest',
    file: 'scripts/mutation-check.mjs',
    claim: "a refusal over many touched paths says how many it left out of the list",
    find: "${ks.slice(0, 6).join(', ')}${ks.length > 6 ? `, and ${ks.length - 6} more` : ''}",
    replace: "${ks.slice(0, 6).join(', ')}",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'refusal-drops-the-seventh-path',
    file: 'scripts/mutation-check.mjs',
    claim: "a refusal over seven touched paths counts the seventh as 'and 1 more' instead of leaving it out of the list and the count",
    find: "ks.length > 6 ? `, and",
    replace: "ks.length > 7 ? `, and",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'refusal-lists-every-path',
    file: 'scripts/mutation-check.mjs',
    claim: "a refusal over many touched paths names six and counts the rest, it does not print them all",
    find: "ks.slice(0, 6).join(', ')",
    replace: "ks.join(', ')",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'refusal-forgets-the-edit-came-after-the-kill',
    file: 'scripts/mutation-check.mjs',
    claim: "the refusal says an edited path changed after the kill",
    find: "): it changed after the kill`",
    replace: ")`",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'live-refusal-drops-the-kill-advice',
    file: 'scripts/mutation-check.mjs',
    claim: "the refusal over a marker whose run is still going says how to stop it: a plain kill first, kill -9 if that is ignored",
    find: "Wait for pid ${m.pid} to finish, or stop it (kill -9 if it ignores a plain kill), then run this again.",
    replace: "Wait for pid ${m.pid} to finish, then run this again.",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'lock-refusal-drops-the-kill-advice',
    file: 'scripts/mutation-check.mjs',
    claim: "the refusal over a run lock whose run is still going says how to stop it: a plain kill first, kill -9 if that is ignored",
    find: "Wait for pid ${held.pid} to finish, or stop it (kill -9 if it ignores a plain kill), then run this again.",
    replace: "Wait for pid ${held.pid} to finish, then run this again.",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'world-refusal-blames-a-person-with-no-record',
    file: 'scripts/mutation-check.mjs',
    claim: "a kill before the touched paths were recorded does not blame a person",
    find: "The mutation itself may have made those changes, or a person may have after the kill; the two cannot be told apart, so nothing was run.",
    replace: "A person changed it after the kill, so nothing was run.",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'live-refusal-says-to-delete-the-state',
    file: 'scripts/mutation-check.mjs',
    claim: "a refusal on a live run says to wait, not to delete the directory that run is using",
    find: "(kill -9 if it ignores a plain kill), then run this again.`, false)\n  if (outcome === 'legacy')",
    replace: "(kill -9 if it ignores a plain kill), then run this again.`)\n  if (outcome === 'legacy')",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'healed-files-not-recorded',
    file: 'scripts/mutation-check.mjs',
    claim: "a heal records the files it wrote back",
    find: "    healedFiles.add(resolve(m.file))",
    replace: "    void resolve(m.file)",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'no-restart-after-healing-itself',
    file: 'scripts/mutation-check.mjs',
    claim: "a run that restored a file it is built from starts again as the restored code",
    find: "if ([...healedFiles].some(f => SELF_SOURCES.includes(f)) && !RESTARTED) {",
    replace: "if (false) {",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'restart-guard-dropped',
    file: 'scripts/mutation-check.mjs',
    claim: "a run that is itself the restart does not restart again",
    find: "if ([...healedFiles].some(f => SELF_SOURCES.includes(f)) && !RESTARTED) {",
    replace: "if ([...healedFiles].some(f => SELF_SOURCES.includes(f))) {",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'restart-flag-leaks-to-children',
    file: 'scripts/mutation-check.mjs',
    claim: "the restart flag is consumed, so the baseline's self-test and every other child run without it",
    find: "delete process.env.MUTATION_REEXEC\n",
    replace: "void 0\n",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'restart-drops-the-flag',
    file: 'scripts/mutation-check.mjs',
    claim: "the restarted run is told it is the restart",
    find: "env: { ...process.env, MUTATION_REEXEC: '1' } })",
    replace: "env: { ...process.env } })",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'restart-loses-the-childs-status',
    file: 'scripts/mutation-check.mjs',
    claim: "a restarted run that is killed fails the run that started it",
    find: "  process.exit(again.status ?? 1)",
    replace: "  process.exit(again.status ?? 0)",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'restart-turns-green-into-red',
    file: 'scripts/mutation-check.mjs',
    claim: "a restarted run that ends green ends the run that started it green",
    find: "  process.exit(again.status ?? 1)",
    replace: "  process.exit(again.status || 1)",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'driver-never-recorded',
    file: 'scripts/mutation-lib.mjs',
    claim: "the watcher's pid is handed to the harness in the turn it is spawned, so a run killed at any later moment has said where its watcher is",
    find: "    this.onSpawn?.(this.child.pid)\n",
    replace: "",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'watcher-not-its-own-group',
    file: 'scripts/mutation-lib.mjs',
    claim: "the watcher is spawned as the leader of a process group of its own, so one signal to the recorded pid's group reaches the compiler under it",
    find: "stdio: ['ignore', 'pipe', 'pipe'], detached: true })",
    replace: "stdio: ['ignore', 'pipe', 'pipe'] })",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'driver-record-forgets-its-start',
    file: 'scripts/mutation-check.mjs',
    claim: "the record of the build driver carries its start time, so a pid that has been recycled is not mistaken for it",
    find: "driver: { pid, start: startOf(pid) } }))",
    replace: "driver: { pid, start: null } }))",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'driver-record-forgets-its-run',
    file: 'scripts/mutation-check.mjs',
    claim: "the record of the build driver names the run that started it, so a live run's watcher is not taken for an orphan",
    find: "JSON.stringify({ run: identity(), driver:",
    replace: "JSON.stringify({ run: null, driver:",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'reaper-never-called',
    file: 'scripts/mutation-check.mjs',
    claim: "a run stops the build driver a dead run left before it starts one of its own",
    find: "const reapedDriver = await reapDriver(stateDir)",
    replace: "const reapedDriver = false",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'reaper-ignores-the-recorded-run',
    file: 'scripts/mutation-check.mjs',
    claim: "a build driver whose run is still alive is left alone",
    find: "  if (rec.run && probes.live(rec.run)) return false\n",
    replace: "",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'reaper-trusts-a-recycled-pid',
    file: 'scripts/mutation-check.mjs',
    claim: "a pid that now holds a process with another start time is not signalled",
    find: "d.start !== undefined && d.start !== null && String(d.start) !== s.start",
    replace: "false",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'reaper-signals-the-pid-not-the-group',
    file: 'scripts/mutation-check.mjs',
    claim: "the build driver is stopped by signalling its process group, not the pid the record names (which may be gone while its child is not)",
    find: "try { kill(-d.pid, 'SIGTERM') }",
    replace: "try { kill(d.pid, 'SIGTERM') }",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'reaper-never-escalates',
    file: 'scripts/mutation-check.mjs',
    claim: "a build driver that ignores TERM is killed",
    find: "    try { kill(-d.pid, 'SIGKILL') } catch { /* same */ }\n",
    replace: "",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'reaper-signals-every-process',
    file: 'scripts/mutation-check.mjs',
    claim: "a record that names pid 1 or 0 is never signalled (a negative pid of -1 is every process the user may signal)",
    find: "d.pid <= 1) {",
    replace: "d.pid < 0) {",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'group-liveness-counts-zombies',
    file: 'scripts/mutation-check.mjs',
    claim: "a process group of nothing but zombies has nothing left to stop, so a container whose init never reaps does not wait forever",
    find: "pgrp === pgid && state !== 'Z' && state !== 'X'",
    replace: "pgrp === pgid",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'reap-skips-the-rebuild',
    file: 'scripts/mutation-check.mjs',
    claim: "a build driver that was stopped is followed by a build, because the compile it cut off may have left build/ half written",
    find: "if (reapedDriver && !run('npm run build')) {",
    replace: "if (false) {",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'reap-builds-before-the-heal',
    file: 'scripts/mutation-check.mjs',
    claim: "the build after a reap runs once the heal has put the source back, so a stranded mutation that does not compile cannot make it fail",
    find: "const healedAny = healHeld(stateDir)\n",
    replace: "if (reapedDriver && !run('npm run build')) process.exit(1)\nconst healedAny = healHeld(stateDir)\n",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'stop-leaves-the-record',
    file: 'scripts/mutation-check.mjs',
    claim: "stopping the watcher forgets its record, so the next run does not go looking for a process that is gone",
    find: "  rmSync(driverFile, { force: true })\n  try { rmdirSync(stateDir) }",
    replace: "  try { rmdirSync(stateDir) }",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'clearing-state-removes-the-driver-record',
    file: 'scripts/mutation-check.mjs',
    claim: "clearing the state between two mutations keeps the build driver's record, because the watcher is still running",
    find: "    if (entry === 'run.json' || entry === 'driver.json') continue\n",
    replace: "    if (entry === 'run.json') continue\n",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'reaper-carries-on-over-a-driver-that-will-not-stop',
    file: 'scripts/mutation-check.mjs',
    claim: "a build driver that survives TERM and KILL stops the run, because two drivers would write one build/",
    find: "Stop it by hand, then run this again.`); exit(1); return false }",
    replace: "Stop it by hand, then run this again.`); return false }",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'stop-forgets-to-stop-the-watcher',
    file: 'scripts/mutation-check.mjs',
    claim: "stopping the build driver signals the watcher, so an ordinary run leaves no process behind",
    find: "  builder.stop()\n  rmSync(driverFile, { force: true })",
    replace: "  rmSync(driverFile, { force: true })",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'signal-killed-expectation-reads-as-caught',
    file: 'scripts/mutation-check.mjs',
    claim: "an expectation that was ended by a signal is not a caught mutation: the run stops instead of printing a verdict",
    find: "  if (lastSignal) fatal(",
    replace: "  if (false) fatal(",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'run-forgets-the-signal',
    file: 'scripts/mutation-check.mjs',
    claim: "a command that run() saw killed is remembered as killed, not as failed",
    find: "    lastSignal = e.code === 'ENOBUFS' ? null : (e.signal ?? (e.status > 128 && e.status < 160 ? `status ${e.status}` : null))",
    replace: "    lastSignal = null",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'killed-child-status-is-a-verdict',
    file: 'scripts/mutation-check.mjs',
    claim: "a child killed under `sh -c`, which the shell reports as a status above 128 and not as a signal, is a killed command too",
    find: "(e.signal ?? (e.status > 128 && e.status < 160 ? `status ${e.status}` : null))",
    replace: "(e.signal ?? null)",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'expectation-never-yields',
    file: 'scripts/mutation-check.mjs',
    claim: "the loop turns after an expectation, so a plain kill that arrived while it ran is acted on even for a mutation with nothing to await",
    find: "  await tick()\n  return passed",
    replace: "  return passed",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'baseline-never-yields',
    file: 'scripts/mutation-check.mjs',
    claim: "the loop turns after each baseline expectation, so a plain kill that arrives during the baseline is acted on before the run goes on",
    find: "  baselineResults.push(baselineOne(cmd))\n  await tick()",
    replace: "  baselineResults.push(baselineOne(cmd))",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'world-expectation-forgets-the-signal',
    file: 'scripts/mutation-check.mjs',
    claim: "the expectation of a change made outside the source goes through the same guard as any other",
    find: "    const passed = await expectation(m)\n",
    replace: "    const passed = run(expectOf(m))\n",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'file-expectation-forgets-the-signal',
    file: 'scripts/mutation-check.mjs',
    claim: "the expectation of a mutation of a file goes through the same guard as any other",
    find: "  const survived = built && await expectation(m)\n",
    replace: "  const survived = built && run(expectOf(m))\n",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'flooded-expectation-reads-as-killed',
    file: 'scripts/mutation-check.mjs',
    claim: "a command the harness ends for printing past its output limit (ENOBUFS, reported by execSync as SIGTERM) failed, it was not killed from outside: the mutation is caught and the run goes on",
    find: "lastSignal = e.code === 'ENOBUFS' ? null : (",
    replace: "lastSignal = (",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'test-hook-announces-nothing',
    file: 'scripts/mutation-check.mjs',
    claim: "a test-only hook that is set (a fault, a moment to be killed at, a lower output limit) is named on stderr before the run starts, so a leftover export in a shell is not a mystery",
    find: "  if (process.env[name]) console.error(`test hook active: ${name}=${process.env[name]}`)\n",
    replace: "  void name\n",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'signal-handler-leaves-the-watcher',
    file: 'scripts/mutation-check.mjs',
    claim: "a run that is told to end (a plain kill, a Ctrl-C, a closed terminal) stops its own build watcher before it goes, so no compiler is left running over build/",
    find: "    restore(); stopBuilder(); if (signal !== 'exit') process.exit(1)",
    replace: "    restore(); if (signal !== 'exit') process.exit(1)",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'watch-stop-signals-nobody',
    file: 'scripts/mutation-lib.mjs',
    claim: "WatchBuild.stop() signals the watcher, so a run that finishes or is told to end leaves no compiler running",
    find: "    if (this.child) this.#signalGroup(this.child, 'SIGTERM')\n",
    replace: "",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'watch-stop-signals-the-leader-only',
    file: 'scripts/mutation-lib.mjs',
    claim: "WatchBuild.stop() signals the watcher's whole process group, so a host that does not pass the TERM on leaves no compiler running under it",
    find: "    if (this.child) this.#signalGroup(this.child, 'SIGTERM')",
    replace: "    if (this.child) { try { this.child.kill('SIGTERM') } catch (e) { void e } }",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'watch-restart-signals-the-leader-only',
    file: 'scripts/mutation-lib.mjs',
    claim: "the stop between two starts of the watcher signals its whole process group, so the first compiler is gone before the second starts and the stop does not wait out its 10 s TERM grace",
    find: "    this.#signalGroup(child, 'SIGTERM')\n    for (let i = 0; i < 200",
    replace: "    try { child.kill('SIGTERM') } catch (e) { void e }\n    for (let i = 0; i < 200",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'reaper-signals-a-group-that-is-gone',
    file: 'scripts/mutation-check.mjs',
    claim: "a record whose process group is already gone (a container restart) is dropped without a word and without a signal, and does not cost a rebuild",
    find: "  if (recycled || !alive(d.pid)) { rmSync(file, { force: true }); return false }",
    replace: "  if (recycled) { rmSync(file, { force: true }); return false }",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'reaper-does-not-wait-for-a-signal-to-work',
    file: 'scripts/mutation-check.mjs',
    claim: "the reaper gives a group time to obey the TERM, and then the KILL, before it escalates or gives up",
    find: "  const gone = async ms => { for (let waited = 0; waited < ms && alive(d.pid); waited += 50) await new Promise(r => setTimeout(r, 50)); return !alive(d.pid) }",
    replace: "  const gone = async () => !alive(d.pid)",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'reaper-gives-the-term-no-grace',
    file: 'scripts/mutation-check.mjs',
    claim: "a build driver that is going down is given its grace after the TERM before it is sent the KILL",
    find: "if (!(await gone(graceMs))) {",
    replace: "if (!(await gone(0))) {",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'reaper-gives-the-kill-no-grace',
    file: 'scripts/mutation-check.mjs',
    claim: "a build driver that is going down after the KILL is waited for before the reaper says it did not stop",
    find: "if (!(await gone(killMs))) {",
    replace: "if (!(await gone(0))) {",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'reap-rebuild-failure-exits-zero',
    file: 'scripts/mutation-check.mjs',
    claim: "a build that fails after the reaper stopped the watcher stops the run with a failing status",
    find: "so build/ may be half written. Run it by hand, then run this again.`)\n  process.exit(1)",
    replace: "so build/ may be half written. Run it by hand, then run this again.`)\n  process.exit(0)",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'reap-rebuild-failure-is-ignored',
    file: 'scripts/mutation-check.mjs',
    claim: "a build that fails after the reaper stopped the watcher is not ignored: the run stops, because build/ may be half written",
    find: "if (reapedDriver && !run('npm run build')) {",
    replace: "if (reapedDriver && !run('npm run build') && false) {",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'refusal-hides-the-seventh-path',
    file: 'scripts/mutation-check.mjs',
    claim: "a refusal over seven touched paths names six and counts the seventh, it does not leave it out of the list and the count",
    find: "${ks.length > 6 ?",
    replace: "${ks.length > 7 ?",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'status-window-takes-git-fatal',
    file: 'scripts/mutation-check.mjs',
    claim: "an expectation that exits 128 (git's fatal status) answered, it was not killed: the window of statuses read as a kill starts at 129",
    find: "e.status > 128 && e.status < 160",
    replace: "e.status >= 128 && e.status < 160",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'status-window-has-no-top',
    file: 'scripts/mutation-check.mjs',
    claim: "an expectation that exits 160 or more answered, it was not killed: the window of statuses read as a kill (128 plus a signal from 1 to 31) ends at 159",
    find: "e.status > 128 && e.status < 160",
    replace: "e.status > 128 && e.status < 256",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'state-dir-guard-counts-five',
    file: 'scripts/mutation-check.mjs',
    claim: "the state-directory guard says \"...\" when it holds more than four entries and not when it holds exactly four",
    find: "${holds.length > 4 ? ', ...' : ''}",
    replace: "${holds.length > 5 ? ', ...' : ''}",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'state-dir-guard-names-three',
    file: 'scripts/mutation-check.mjs',
    claim: "the state-directory guard names the first four entries it found, not three",
    find: "holds.slice(0, 4)",
    replace: "holds.slice(0, 3)",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'run-keeps-the-last-signal',
    file: 'scripts/mutation-check.mjs',
    claim: "a command that passes after one that was killed leaves no signal behind, so the next expectation is not stopped for a kill it did not suffer",
    find: "const run = (cmd, extra) => {\n  lastSignal = null\n",
    replace: "const run = (cmd, extra) => {\n",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'driver-record-names-the-harness',
    file: 'scripts/mutation-check.mjs',
    claim: "the record of the build driver names the process it was given, not the harness that wrote it: a record that held its own writer's pid would send the reaper after the wrong group",
    find: "driver: { pid, start: startOf(pid) } }))",
    replace: "driver: { pid: process.pid, start: startOf(process.pid) } }))",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'world-mutated-hook-dropped',
    file: 'scripts/mutation-check.mjs',
    claim: "a run can be killed after a world mutation has run and before its marker names the paths it touched, so what the next run does with that state is tested",
    find: "    await killHere('world-mutated')\n",
    replace: "",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'crash-leaves-the-self-test-scratch-directory',
    file: 'scripts/mutation-check.mjs',
    claim: "a self-test that crashes removes the scratch directory it made, so a crash does not accumulate them in the temp directory",
    find: "  process.on('exit', () => rmSync(scratch, { recursive: true, force: true }))\n",
    replace: "",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'crash-leaves-the-self-test-state-directory',
    file: 'scripts/mutation-check.mjs',
    claim: "a self-test that crashes removes the state directory it made, so a crash does not accumulate them in the temp directory",
    find: "if (process.argv.includes('--self-test')) process.on('exit', () => rmSync(stateDir, { recursive: true, force: true }))\n",
    replace: "",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'self-test-state-directory-removal-registered-late',
    file: 'scripts/mutation-check.mjs',
    claim: "the self-test's state directory is removed by a crash at any point after it is made: its removal is registered where the directory is made, not after something that can throw",
    find: "if (process.argv.includes('--self-test')) process.on('exit', () => rmSync(stateDir, { recursive: true, force: true }))\n",
    replace: "if (process.env.MUTATION_FAULT === 'self-test-crashes-early') throw new Error('MUTATION_FAULT=self-test-crashes-early')\nif (process.argv.includes('--self-test')) process.on('exit', () => rmSync(stateDir, { recursive: true, force: true }))\n",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: "self-test-reads-the-real-day",
    file: 'scripts/mutation-check.mjs',
    claim: "the self-test's write-ups and the world mutations that act on them agree on what day it is: both read the one the stand-in gives, not the clock twice (midnight ET between the two reads failed 16 clauses)",
    find: "PATH: `${bin}:${process.env.PATH}`, ",
    replace: "",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: "self-test-date-stand-in-answers-only-the-day",
    file: 'scripts/mutation-check.mjs',
    claim: "the stand-in for date answers the one question it stands in for and passes every other to the real date, so the fault that asks for a timestamp still gets one",
    find: "PATH=\\${PATH#${bin}:}\\nexec date \"$@\"\\n",
    replace: "echo stand-in >&2; exit 2\\n",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'unrelated-write-fault-asks-for-nanoseconds',
    file: 'scripts/mutation-check.mjs',
    claim: "the fault that writes an unrelated file asks `date` for something every date answers (seconds), not for nanoseconds, which only GNU's does",
    find: "date +%s > unrelated-during-window.txt",
    replace: "date +%s%N > unrelated-during-window.txt",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'unrelated-write-fault-writes-no-timestamp',
    file: 'scripts/mutation-check.mjs',
    claim: "the file the fault writes while a world mutation is applied holds a timestamp, and the clause that reads it wants digits and not merely a file",
    find: "date +%s > unrelated-during-window.txt",
    replace: "date +%F > unrelated-during-window.txt",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'heal-runs-a-restore-for-an-empty-touched',
    file: 'scripts/mutation-check.mjs',
    claim: "a marker that recorded no touched path (`touched: {}`) is not read as every touched path applied, so its restore command is not run blind",
    find: "const hasTouched = m => m.touched !== null && typeof m.touched === 'object' && Object.keys(m.touched).length > 0",
    replace: "const hasTouched = m => m.touched !== null && typeof m.touched === 'object'",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'plan-heal-reads-an-empty-touched-as-a-list',
    file: 'scripts/mutation-check.mjs',
    claim: "the plan for a marker with an empty touched list is the one for a marker with none: nothing to do over an unchanged tree, a refusal over any other",
    find: "    if (hasTouched(m)) {\n      const where = worldState(",
    replace: "    if (m.touched) {\n      const where = worldState(",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'heal-refusal-for-an-empty-touched-lists-no-path',
    file: 'scripts/mutation-check.mjs',
    claim: "the refusal over a marker with an empty touched list says it was killed before it recorded its paths, not that a path is neither as it was nor as the mutation left it (it names none)",
    find: "      if (!hasTouched(m)) {\n",
    replace: "      if (!m.touched) {\n",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'nested-state-deleted-with-its-parent',
    file: 'scripts/mutation-check.mjs',
    claim: "clearing a run's state leaves what a harness run inside it stranded, so the next run can heal the mutation that run left applied",
    find: "    if (entry === 'nested') { try { rmdirSync(join(dir, entry)) } catch { /* not empty: a child's state */ } continue }\n",
    replace: "",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'empty-nested-directory-kept',
    file: 'scripts/mutation-check.mjs',
    claim: "clearing a run's state removes a nested state directory that holds nothing, so an ordinary run leaves no directory behind",
    find: "try { rmdirSync(join(dir, entry)) } catch { /* not empty: a child's state */ } continue }",
    replace: "continue }",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'killed-child-in-nested-ends-the-run-green',
    file: 'scripts/mutation-check.mjs',
    claim: "a run whose child harness run was killed with a mutation applied does not end green over it: it fails, so the entries and gate rows that read the mutated file are not trusted",
    find: "if (existsSync(strandedChild)) {",
    replace: "if (false) {",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'killed-child-in-nested-is-healed-silently',
    file: 'scripts/mutation-check.mjs',
    claim: "a run that finds a killed child's mutation in `nested` reports it and leaves it for a person: it does not repair the tree under verdicts it has already printed",
    find: "if (existsSync(strandedChild)) {",
    replace: "if (existsSync(strandedChild) && (healAt(join(stateDir, 'nested'), { rebuild: false }) || true)) {",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'killed-child-check-looks-in-the-wrong-directory',
    file: 'scripts/mutation-check.mjs',
    claim: "the end-of-run look for a killed child's mutation reads `nested`, where the child keeps its marker, and not the run's own directory (already cleared by then)",
    find: "const strandedChild = join(stateDir, 'nested', 'active.json')",
    replace: "const strandedChild = join(stateDir, 'active.json')",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'killed-child-failure-names-no-heal-command',
    file: 'scripts/mutation-check.mjs',
    claim: "the failure over a killed child's mutation names the command that heals it",
    find: "read a tree that holds it. Heal it: node scripts/mutation-check.mjs --heal`)",
    replace: "read a tree that holds it.`)",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'killed-child-failure-names-no-child',
    file: 'scripts/mutation-check.mjs',
    claim: "the failure over a killed child's mutation names the mutation and the file it left applied",
    find: "left applied ([${child?.id ?? 'unknown'}] on ${child?.file ?? 'the tree'}): that run was killed",
    replace: "left applied (a child): that run was killed",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'self-test-skips-a-nested-stranded-state',
    file: 'scripts/mutation-check.mjs',
    claim: "the self-test names a marker a nested run stranded too, not only the run's own",
    find: "for (const file of [join(real, 'active.json'), join(real, 'nested', 'active.json')]) {",
    replace: "for (const file of [join(real, 'active.json')]) {",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'state-dir-guard-removed',
    file: 'scripts/mutation-check.mjs',
    claim: "a state directory that holds files the harness did not write is refused, not emptied at the first clear",
    find: "if (holds.length > 0 && !holds.some(",
    replace: "if (false && holds.length > 0 && !holds.some(",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'state-dir-guard-refuses-its-own-state',
    file: 'scripts/mutation-check.mjs',
    claim: "a state directory that holds the harness's own entries (a stranded marker, a dead run's lock) is used, so the heal can look at what a killed run left",
    find: "['active.json', 'run.json', 'driver.json', 'nested', 'world'].includes(h)",
    replace: "[].includes(h)",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'state-dir-guard-refuses-a-stranded-nested-run',
    file: 'scripts/mutation-check.mjs',
    claim: "a state directory that holds only what a nested run stranded is used, so the next run can heal it",
    find: "'run.json', 'driver.json', 'nested', 'world'].includes(h)",
    replace: "'run.json', 'driver.json', 'world'].includes(h)",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'state-dir-guard-refuses-a-dead-drivers-record',
    file: 'scripts/mutation-check.mjs',
    claim: "a state directory that holds only a dead build driver's record is used, so a run killed while it was stopping that driver does not wedge the next",
    find: "['active.json', 'run.json', 'driver.json', 'nested', 'world']",
    replace: "['active.json', 'run.json', 'nested', 'world']",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'state-dir-guard-swallows-an-unreadable-directory',
    file: 'scripts/mutation-check.mjs',
    claim: "a state directory that cannot be read as a directory (a file) is refused like one that holds foreign files, not let through to crash at the first write",
    find: "if (e.code !== 'ENOENT') holds = ['not a directory it can read']",
    replace: "holds = []",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'state-dir-guard-refuses-a-lone-backup',
    file: 'scripts/mutation-check.mjs',
    claim: "a state directory that holds only a source mutation's backup (a kill between writing it and writing the marker) is used, not refused, and `--heal` is not refused either",
    find: " || backupNames.has(h))) {",
    replace: ")) {",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'state-dir-guard-takes-any-underscore-for-a-backup',
    file: 'scripts/mutation-check.mjs',
    claim: "a state directory is used for a file whose name is the backup name of a file in the table, and not for any other file with an underscore in its name",
    find: "backupNames.has(h)",
    replace: "h.includes('_')",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'state-dir-guard-refuses-an-existing-empty-directory',
    file: 'scripts/mutation-check.mjs',
    claim: "a state directory that exists and is empty is used, not refused (an absent one is accepted by every other run, so only this shape can show it): it is what a run killed between removing a stale lock and taking its own leaves",
    find: "if (holds.length > 0 && !holds.some(",
    replace: "if ((holds.length > 0 || existsSync(stateDir)) && !holds.some(",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'state-dir-guard-refusal-gives-no-remedy',
    file: 'scripts/mutation-check.mjs',
    claim: "the refusal of a state directory that holds files the harness did not write says what to give instead: one that is absent or empty",
    find: "give MUTATION_STATE_DIR one that is absent or empty. Nothing was touched.",
    replace: "Nothing was touched.",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'state-dir-guard-refuses-a-lone-stash',
    file: 'scripts/mutation-check.mjs',
    claim: "a state directory that holds only a stash (`world`) is used, so the run after a kill between making the stash and writing its marker is not wedged",
    find: "['active.json', 'run.json', 'driver.json', 'nested', 'world'].includes(h)",
    replace: "['active.json', 'run.json', 'driver.json', 'nested'].includes(h)",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'state-dir-guard-names-too-few',
    file: 'scripts/mutation-check.mjs',
    claim: "the refusal of a state directory names four of the entries it found, not three",
    find: "holds.slice(0, 4)",
    replace: "holds.slice(0, 3)",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'state-dir-guard-counts-the-fifth-wrong',
    file: 'scripts/mutation-check.mjs',
    claim: "the refusal of a state directory marks a list cut at four with an ellipsis from the fifth entry, not the sixth",
    find: "holds.length > 4 ? ', ...' : ''",
    replace: "holds.length > 5 ? ', ...' : ''",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'rebuild-refusal-after-a-restore-offers-to-delete-the-state',
    file: 'scripts/mutation-check.mjs',
    claim: "the refusal over a failed rebuild after a restore does not tell a person to delete the state that is the only record of the build",
    find: "is restored, but ${rebuildFailed()}`, false)",
    replace: "is restored, but ${rebuildFailed()}`)",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'self-test-scrub-leaves-the-index-file',
    file: 'scripts/mutation-check.mjs',
    claim: "the self-test's scratch repositories never inherit the caller's index",
    find: "for (const k of Object.keys(process.env)) if (/^GIT_/.test(k)) delete process.env[k]",
    replace: "for (const k of Object.keys(process.env)) if (/^GIT_(DIR|WORK_TREE|CONFIG.*)$/.test(k)) delete process.env[k]",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'self-test-scrub-removes-only-the-git-dir',
    file: 'scripts/mutation-check.mjs',
    claim: "the self-test's scratch repositories inherit none of the caller's repository location variables",
    find: "for (const k of Object.keys(process.env)) if (/^GIT_/.test(k)) delete process.env[k]",
    replace: "for (const k of Object.keys(process.env)) if (/^GIT_DIR$/.test(k)) delete process.env[k]",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'self-test-scrub-leaves-the-object-directory',
    file: 'scripts/mutation-check.mjs',
    claim: "the self-test's scratch repositories inherit neither the caller's work tree nor its object directory",
    find: "for (const k of Object.keys(process.env)) if (/^GIT_/.test(k)) delete process.env[k]",
    replace: "for (const k of Object.keys(process.env)) if (/^GIT_(DIR|INDEX_FILE|CONFIG.*)$/.test(k)) delete process.env[k]",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'baseline-output-limit-is-the-default',
    file: 'scripts/mutation-check.mjs',
    claim: "an expectation that prints more than a megabyte and passes is not a failing baseline",
    find: "env: childEnv(), maxBuffer: OUTPUT_LIMIT })\n    return { cmd, passed: true }",
    replace: "env: childEnv() })\n    return { cmd, passed: true }",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'anchors-ignore-duplicates',
    file: 'scripts/mutation-check.mjs',
    claim: "an anchor that occurs twice is reported, because the first occurrence is the one mutated",
    find: "    else if (anchorCount(source, m) > 1) stale.push(",
    replace: "    else if (false) stale.push(",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'anchors-count-before-the-table',
    file: 'scripts/mutation-check.mjs',
    claim: "in this file only what comes after the table is counted for an anchor",
    find: "const anchorCount = (source, m) => source.slice(guardOf(source, m)).split(m.find).length - 1",
    replace: "const anchorCount = (source, m) => source.split(m.find).length - 1",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'restart-continues-in-process',
    file: 'scripts/mutation-check.mjs',
    claim: "the restart is a new process running the restored files, not the same one carrying on",
    find: "  const again = spawnSync(process.execPath, process.argv.slice(1), { stdio: 'inherit', env: { ...process.env, MUTATION_REEXEC: '1' } })\n  process.exit(again.status ?? 1)\n",
    replace: "  acquireRunLock()\n",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'heal-rebuilds-what-cannot-reach-the-build',
    file: 'scripts/mutation-check.mjs',
    claim: "a heal does not run `npm run build` for a mutation of a file the build never reads",
    find: "const rebuilds = rebuild && !m.restoreCmd && m.rebuild !== false",
    replace: "const rebuilds = rebuild && !m.restoreCmd",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'marker-forgets-whether-the-build-was-reachable',
    file: 'scripts/mutation-check.mjs',
    claim: "a source marker records whether the mutation could reach build/",
    find: "originalSha: sha(original), mutatedSha: sha(mutated), rebuild, ...identity() })",
    replace: "originalSha: sha(original), mutatedSha: sha(mutated), ...identity() })",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'child-output-limit-is-the-default',
    file: 'scripts/mutation-check.mjs',
    claim: "a command that prints more than a megabyte is not read as a failed one",
    find: "env: childEnv(extra), maxBuffer: OUTPUT_LIMIT })",
    replace: "env: childEnv(extra) })",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'rebuild-refusal-hides-the-failure',
    file: 'scripts/mutation-check.mjs',
    claim: "a refusal over a failed rebuild carries the build's own failure",
    find: "failed${lastFailure ? ` (${lastFailure})` : ''}, so build/",
    replace: "failed, so build/",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'signal-handler-skips-sigterm',
    file: 'scripts/mutation-check.mjs',
    claim: "a SIGTERM puts a mutated file back before the run ends",
    find: "for (const signal of ['exit', 'SIGINT', 'SIGTERM', 'SIGHUP', 'uncaughtException']) {",
    replace: "for (const signal of ['exit', 'SIGINT', 'SIGHUP', 'uncaughtException']) {",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'signal-handler-skips-sigint',
    file: 'scripts/mutation-check.mjs',
    claim: "a SIGINT (Ctrl-C) puts a mutated file back before the run ends",
    find: "for (const signal of ['exit', 'SIGINT', 'SIGTERM', 'SIGHUP', 'uncaughtException']) {",
    replace: "for (const signal of ['exit', 'SIGTERM', 'SIGHUP', 'uncaughtException']) {",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'signal-handler-skips-sighup',
    file: 'scripts/mutation-check.mjs',
    claim: "a SIGHUP (a closed terminal) puts a mutated file back before the run ends",
    find: "for (const signal of ['exit', 'SIGINT', 'SIGTERM', 'SIGHUP', 'uncaughtException']) {",
    replace: "for (const signal of ['exit', 'SIGINT', 'SIGTERM', 'uncaughtException']) {",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'kill-hook-does-not-yield',
    file: 'scripts/mutation-check.mjs',
    claim: "a test-only catchable signal is handled where it was sent, before the expectation runs, not one turn later after it has",
    find: "  if (signal !== 'SIGKILL') await new Promise(done => setTimeout(done, 400))",
    replace: "  void signal",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'world-undo-accepts-a-partial-restore',
    file: 'scripts/mutation-check.mjs',
    claim: "a world restore that put back only some of what it touched is not taken for a restore",
    find: "    ok = w.touched ? worldState(w.touched, now) === 'undone' : sameSnapshot(w.before, now)",
    replace: "    ok = w.touched ? worldState(w.touched, now) !== 'applied' : sameSnapshot(w.before, now)",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'heal-accepts-a-partial-restore',
    file: 'scripts/mutation-check.mjs',
    claim: "a heal's restore that put back only some of what the mutation touched is not called healed",
    find: "    try { back = m.touched ? worldState(m.touched, probes.snapshot()) === 'undone' : sameSnapshot(m.before, probes.snapshot()) } catch { back = false }",
    replace: "    try { back = m.touched ? worldState(m.touched, probes.snapshot()) !== 'applied' : sameSnapshot(m.before, probes.snapshot()) } catch { back = false }",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'unreadable-tree-is-nothing-to-heal',
    file: 'scripts/mutation-check.mjs',
    claim: "a tree that cannot be read is not reported as having nothing to heal",
    find: "    return stop(`could not be checked against the tree (${String(e.message).split('\\n')[0]}). Nothing was touched.`)",
    replace: "    return false",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'world-marker-records-an-empty-before',
    file: 'scripts/mutation-check.mjs',
    claim: "a world marker records the tree as it was when the run started, files a person had already modified included",
    find: "    const worldMarker = worldMarkerOf(m, stash, before)",
    replace: "    const worldMarker = worldMarkerOf(m, stash, {})",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'heal-builds-for-a-world-mutation',
    file: 'scripts/mutation-check.mjs',
    claim: "healing a world mutation, which moves write-ups, runs no build",
    find: "const rebuilds = rebuild && !m.restoreCmd && m.rebuild !== false",
    replace: "const rebuilds = rebuild && m.rebuild !== false",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'self-test-keeps-the-callers-git-environment',
    file: 'scripts/mutation-check.mjs',
    claim: "the self-test's scratch repositories never inherit a repository location from the hook or shell that started it",
    find: "for (const k of Object.keys(process.env)) if (/^GIT_/.test(k)) delete process.env[k]",
    replace: "void 0",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'self-test-keeps-the-callers-git-config',
    file: 'scripts/mutation-check.mjs',
    claim: "the self-test's scratch repositories never read the developer's own git configuration",
    find: "process.env.GIT_CONFIG_GLOBAL = '/dev/null'",
    replace: "void 0",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'restart-list-misses-a-module',
    file: 'scripts/mutation-check.mjs',
    claim: "every module the harness is built from is one a heal restarts for",
    find: "['mutation-check.mjs', 'mutation-lib.mjs', 'checks.mjs', 'run-marker.mjs'].map(f =>",
    replace: "['mutation-check.mjs', 'mutation-lib.mjs', 'checks.mjs'].map(f =>",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'baseline-without-the-child-environment',
    file: 'scripts/mutation-check.mjs',
    claim: "the baseline runs each expectation in the child environment",
    find: "env: childEnv(), maxBuffer: OUTPUT_LIMIT })\n    return { cmd, passed: true }",
    replace: "maxBuffer: OUTPUT_LIMIT })\n    return { cmd, passed: true }",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'no-heal-mode',
    file: 'scripts/mutation-check.mjs',
    claim: "`--heal` heals a stranded tree and stops",
    find: "if (process.argv.includes('--heal')) {",
    replace: "if (false) {",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'self-test-stays-silent-about-a-stranded-state',
    file: 'scripts/mutation-check.mjs',
    claim: "the self-test names a stranded state and the command that heals it",
    find: "if (stranded !== null) console.log(`::warning::",
    replace: "if (false) console.log(`::warning::",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    // The `if` is the entry's own guard: the harness hands MUTATION_STATE_DIR to every expectation it runs, so the self-test it starts would otherwise heal the harness's OWN
    // state (caught, but by an unrelated clause, and for the wrong reason). The real-script clause starts the self-test with the variable cleared, in a stranded directory.
    id: 'self-test-heals-a-stranded-state',
    file: 'scripts/mutation-check.mjs',
    claim: "the self-test over a stranded state leaves it alone: it names it and does not heal it",
    find: "Heal it first: node scripts/mutation-check.mjs --heal`)\n    }\n  }",
    replace: "Heal it first: node scripts/mutation-check.mjs --heal`)\n    }\n    if (!process.env.MUTATION_STATE_DIR) healHeld(real, { rebuild: false })\n  }",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'no-stranded-mode',
    file: 'scripts/mutation-check.mjs',
    claim: "`--stranded` is a mode of its own that refuses a stranded state; without it the script falls through to a heal and a whole run",
    find: "if (process.argv.includes('--stranded')) {",
    replace: "if (false) {",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'stranded-mode-exit-inverted',
    file: 'scripts/mutation-check.mjs',
    claim: "`--stranded` exits 1 when a mutation is left applied and 0 when none is",
    find: "process.exit((left.length > 0 || orphan !== null) ? 1 : 0)",
    replace: "process.exit((left.length > 0 || orphan !== null) ? 0 : 1)",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'stranded-mode-refuses-a-directory-with-no-marker',
    file: 'scripts/mutation-check.mjs',
    claim: "`--stranded` lets a directory with no marker through (a stale run lock is not a stranded mutation)",
    find: "process.exit((left.length > 0 || orphan !== null) ? 1 : 0)",
    replace: "process.exit(1)",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'stranded-mode-heals',
    file: 'scripts/mutation-check.mjs',
    claim: "`--stranded` refuses and does not heal: it writes nothing, in a commit hook or a gate run",
    find: "    console.log(text)\n  }\n  // THE THIRD THING",
    replace: "    console.log(text)\n    if (m?.file && m?.backup && existsSync(m.backup)) writeFileSync(m.file, readFileSync(m.backup))\n  }\n  // THE THIRD THING",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'stranded-mode-skips-a-nested-marker',
    file: 'scripts/mutation-check.mjs',
    claim: "`--stranded` looks in `nested` too, where a harness run inside a harness run keeps its state",
    find: "const files = [join(real, 'active.json'), join(real, 'nested', 'active.json')]",
    replace: "const files = [join(real, 'active.json')]",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: "stranded-mode-names-only-the-first-marker",
    file: 'scripts/mutation-check.mjs',
    claim: "`--stranded` prints a message for every marker it finds, not the first",
    find: "  for (const file of left) {\n    // A marker that does not parse",
    replace: "  for (const file of left.slice(0, 1)) {\n    // A marker that does not parse",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: "stranded-mode-ignores-the-state-dir-variable",
    file: 'scripts/mutation-check.mjs',
    claim: "`--stranded` reads the directory MUTATION_STATE_DIR names, as every other mode does, and not always `.mutation-state`",
    find: "  const real = process.env.MUTATION_STATE_DIR || '.mutation-state'\n  const files = [",
    replace: "  const real = '.mutation-state'\n  const files = [",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'stranded-mode-reads-a-live-run-as-killed',
    file: 'scripts/mutation-check.mjs',
    claim: "`--stranded` does not call a run that is still going a killed one, or send a person to a heal that would refuse it",
    find: "if (isLive(m)) return 'live'",
    replace: "if (false) return 'live'",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: "stranded-live-ignores-the-start-time",
    file: 'scripts/mutation-check.mjs',
    claim: "`--stranded` does not call a pid that now belongs to another process a run that is still going: it compares the start time the marker recorded",
    find: "if (isLive(m)) return 'live'",
    replace: "if (isLive({ pid: m.pid })) return 'live'",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'stranded-mode-waits-for-the-heal',
    file: 'scripts/mutation-check.mjs',
    claim: "`--stranded` is decided before the heal: given `--heal` as well it still only refuses",
    find: "if (process.argv.includes('--stranded')) {",
    replace: "if (process.argv.includes('--stranded') && !process.argv.includes('--heal')) {",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'stranded-mode-prints-undefined',
    file: 'scripts/mutation-check.mjs',
    claim: "`--stranded` names a marker that holds no file, or no id, as `the tree` and `unknown`, not `undefined`",
    find: "const id = m?.id ?? 'unknown'\n    const where = m?.file ?? 'the tree'",
    replace: "const id = m?.id\n    const where = m?.file",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'stranded-mode-crashes-on-a-torn-marker',
    file: 'scripts/mutation-check.mjs',
    claim: "`--stranded` refuses a marker cut off mid-write by what it is, with the heal command, instead of crashing on the read",
    find: "try { m = JSON.parse(readFileSync(file, 'utf8')) } catch { m = null }\n    const id = m?.id",
    replace: "m = JSON.parse(readFileSync(file, 'utf8'))\n    const id = m?.id",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'stranded-driver-orphan-passes',
    file: 'scripts/mutation-check.mjs',
    claim: "`--stranded` exits 1 over a build driver a dead run left running, though no marker is left",
    find: "process.exit((left.length > 0 || orphan !== null) ? 1 : 0)",
    replace: "process.exit(left.length > 0 ? 1 : 0)",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'stranded-driver-live-run-refused',
    file: 'scripts/mutation-check.mjs',
    claim: "`--stranded` does not call the driver of a run that is still going an orphan (it is that run's)",
    find: "d && Number.isInteger(d.pid) && d.pid > 1 && !(rec.run && isLive(rec.run))",
    replace: "d && Number.isInteger(d.pid) && d.pid > 1",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'stranded-driver-recycled-pid-refused',
    file: 'scripts/mutation-check.mjs',
    claim: "`--stranded` does not call a pid that now holds a process started at another time a build driver",
    find: "if (!recycled && groupAlive(d.pid)) orphan = d",
    replace: "if (groupAlive(d.pid)) orphan = d",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'stranded-driver-gone-group-refused',
    file: 'scripts/mutation-check.mjs',
    claim: "`--stranded` does not refuse over a driver record whose process group is gone",
    find: "if (!recycled && groupAlive(d.pid)) orphan = d",
    replace: "if (!recycled) orphan = d",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'stranded-driver-pid-zero-refused',
    file: 'scripts/mutation-check.mjs',
    claim: "`--stranded` does not read a record that names pid 0 or 1 as a build driver (their groups are alive on every machine)",
    find: "d && Number.isInteger(d.pid) && d.pid > 1 &&",
    replace: "d && Number.isInteger(d.pid) && d.pid >= 0 &&",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'stranded-driver-torn-record-refuses',
    file: 'scripts/mutation-check.mjs',
    claim: "`--stranded` lets a driver record that does not parse through: it names no process, and the next run's reap says so",
    find: "try { rec = JSON.parse(readFileSync(driverRecord, 'utf8')) } catch { rec = null }",
    replace: "try { rec = JSON.parse(readFileSync(driverRecord, 'utf8')) } catch { if (existsSync(driverRecord)) process.exit(1); rec = null }",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'stranded-driver-not-in-the-count',
    file: 'scripts/mutation-check.mjs',
    claim: "`--stranded` says that it read `driver.json`, in the count of files it checked",
    find: "const looked = [...files, driverRecord]",
    replace: "const looked = files",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'stranded-driver-stopped-by-the-mode',
    file: 'scripts/mutation-check.mjs',
    claim: "`--stranded` stops nothing: the build driver it refuses over is still running afterwards",
    find: "  const looked = [...files, driverRecord]",
    replace: "  if (orphan) process.kill(-orphan.pid, 'SIGTERM')\n  const looked = [...files, driverRecord]",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'stranded-driver-refusal-without-the-heal',
    file: 'scripts/mutation-check.mjs',
    claim: "`--stranded` over a build driver names the command that stops it",
    find: "Stop it first: node scripts/mutation-check.mjs --heal`)\n  const looked",
    replace: "Stop it first.`)\n  const looked",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: "stranded-kind-unreadable-needs-an-id",
    file: 'scripts/mutation-check.mjs',
    claim: "`--stranded` calls a marker that parses but names no mutation unreadable, as the heal does, not a run that is in progress",
    find: "    if (typeof m?.id !== 'string') return 'unreadable'",
    replace: "    if (m === null) return 'unreadable'",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: "stranded-kind-legacy-world-called-world",
    file: 'scripts/mutation-check.mjs',
    claim: "`--stranded` calls a change made outside the source with no record of the tree before it legacy, as the heal does",
    find: "      if (m.before === null || typeof m.before !== 'object') return 'legacy'",
    replace: "      void m.before",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: "stranded-kind-unrecorded-called-recorded",
    file: 'scripts/mutation-check.mjs',
    claim: "`--stranded` tells a world mutation that recorded its paths from one killed before it did",
    find: "Object.keys(m.touched).length > 0 ? 'world' : 'world-unrecorded'",
    replace: "Object.keys(m.touched).length >= 0 ? 'world' : 'world-unrecorded'",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: "stranded-kind-null-touched-is-an-object",
    file: 'scripts/mutation-check.mjs',
    claim: "`--stranded` reads a world marker whose `touched` is null as one that recorded no paths, as the heal does, and does not crash on it",
    find: "return m.touched !== null && typeof m.touched === 'object' && Object.keys(m.touched).length > 0",
    replace: "return typeof m.touched === 'object' && Object.keys(m.touched).length > 0",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: "stranded-kind-legacy-needs-both-hashes",
    file: 'scripts/mutation-check.mjs',
    claim: "`--stranded` calls a source marker that lacks either hash legacy, as the heal does",
    find: "    if (![m.originalSha, m.mutatedSha].every(h => typeof h === 'string')) return 'legacy'",
    replace: "    if (typeof m.originalSha !== 'string') return 'legacy'",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: "stranded-kind-back-ignored",
    file: 'scripts/mutation-check.mjs',
    claim: "`--stranded` tells a marker whose file is already back from one whose file is still mutated",
    find: "if (now === m.originalSha) return 'back'",
    replace: "void m.originalSha",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: "stranded-kind-back-for-an-edited-file",
    file: 'scripts/mutation-check.mjs',
    claim: "`--stranded` does not call a file a person edited after the kill a file that is back",
    find: "if (now === m.originalSha) return 'back'",
    replace: "if (now !== m.mutatedSha) return 'back'",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: "stranded-kind-diverged-ignored",
    file: 'scripts/mutation-check.mjs',
    claim: "`--stranded` tells a file that is neither the original nor the mutation from one the heal restores",
    find: "    if (m.mutatedSha !== now) return 'diverged'",
    replace: "    void now",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: "stranded-kind-lost-ignored",
    file: 'scripts/mutation-check.mjs',
    claim: "`--stranded` tells a mutated file whose backup is gone from one the heal restores",
    find: "return hashAt(m.backup) === m.originalSha ? 'applied' : 'lost'",
    replace: "return 'applied'",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: "stranded-back-rebuild-default",
    file: 'scripts/mutation-check.mjs',
    claim: "`--stranded` treats a marker with no `rebuild` field as one that could reach build/, as the heal does",
    find: "text = m.rebuild !== false",
    replace: "text = m.rebuild === true",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: "stranded-back-rebuild-ignored",
    file: 'scripts/mutation-check.mjs',
    claim: "`--stranded` says no build is run for a marker whose mutation could not reach build/",
    find: "text = m.rebuild !== false",
    replace: "text = true",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: "stranded-refusal-does-not-say-it-refuses",
    file: 'scripts/mutation-check.mjs',
    claim: "`--stranded` over a marker the heal refuses says that the heal refuses it and writes nothing",
    find: "const refuses = `\\`${heal}\\` refuses this one and writes nothing: run it and read what it says.`",
    replace: "const refuses = ''",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: "stranded-live-waits-without-the-sentence",
    file: 'scripts/mutation-check.mjs',
    claim: "`--stranded` over a run that is still going says to wait for its pid",
    find: "${nothing} Wait for pid ${m.pid} to finish, or stop it (kill -9 if it ignores a plain kill), and run this again.`",
    replace: "${nothing}`",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: "stranded-live-without-the-stop-advice",
    file: 'scripts/mutation-check.mjs',
    claim: "`--stranded` over a run that is still going says how to stop one that hangs, as the heal's own refusal does",
    find: "${nothing} Wait for pid ${m.pid} to finish, or stop it (kill -9 if it ignores a plain kill), and run this again.`",
    replace: "${nothing} Wait for pid ${m.pid} to finish, and run this again.`",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: "stranded-world-without-the-refusal",
    file: 'scripts/mutation-check.mjs',
    claim: "`--stranded` over a world mutation says the heal refuses, naming the paths, if one changed after the kill",
    find: "drops the state if they are already back, and refuses, naming the paths, if one changed after the kill.",
    replace: "drops the state if they are already back.",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: "stranded-world-without-the-git-note",
    file: 'scripts/mutation-check.mjs',
    claim: "`--stranded` over a world mutation says that judging it needs git, which this mode does not run",
    find: "Whether the tree still holds it is for the heal to judge, and that needs git, which this mode does not run: ",
    replace: "Whether the tree still holds it is for the heal to judge: ",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: "stranded-unrecorded-without-the-reason",
    file: 'scripts/mutation-check.mjs',
    claim: "`--stranded` over a world mutation killed before it recorded its paths says why the heal refuses a changed tree",
    find: ", because it cannot tell the mutation's changes from a person's, and says where the stash is.",
    replace: ".",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: "stranded-back-without-the-no-build-note",
    file: 'scripts/mutation-check.mjs',
    claim: "`--stranded` over a marker that could not reach build/ says the heal runs no build for it",
    find: "Clear it: ${heal} (it runs no build for this one).",
    replace: "Clear it: ${heal}.",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: "stranded-back-without-the-committable-note",
    file: 'scripts/mutation-check.mjs',
    claim: "`--stranded` over a marker whose file is back says that nothing committable differs and that the gate scores build/",
    find: " Nothing committable differs, but a gate run scores build/.",
    replace: "",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: "stranded-back-without-the-delete-route",
    file: 'scripts/mutation-check.mjs',
    claim: "`--stranded` over a marker whose file is back names the delete route and what deleting costs",
    find: " Where the build cannot run here, run it by hand once it can; deleting ${dirname(file)} drops the only record that build/ may be stale, so only after that.",
    replace: "",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: "stranded-back-deletes-the-wrong-directory",
    file: 'scripts/mutation-check.mjs',
    claim: "`--stranded` names the directory of the marker it is talking about in the delete route, not a fixed one",
    find: "deleting ${dirname(file)} drops",
    replace: "deleting .mutation-state drops",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: "stranded-back-without-the-stale-build",
    file: 'scripts/mutation-check.mjs',
    claim: "`--stranded` over a marker whose file is back says build/ may still hold the mutation",
    find: ": the run stopped before its build was verified clean, so build/ may still hold the mutation.",
    replace: ".",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: "stranded-diverged-without-the-cause",
    file: 'scripts/mutation-check.mjs',
    claim: "`--stranded` over an edited file says it is neither the original nor the mutation",
    find: "names ${named}, and that file is neither the original nor the mutation: it changed after the kill.",
    replace: "names ${named}, and that file differs.",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: "stranded-lost-without-the-cause",
    file: 'scripts/mutation-check.mjs',
    claim: "`--stranded` over a mutated file with no backup says the backup is gone or is not the original",
    find: "but its backup (${m.backup}) is gone or is not the original.",
    replace: "but its backup (${m.backup}) is gone.",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: "stranded-unreadable-without-the-cause",
    file: 'scripts/mutation-check.mjs',
    claim: "`--stranded` over a marker the harness did not write says what the marker is",
    find: " (it does not parse, or names no mutation), so what the run left cannot be told (",
    replace: " (",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: "stranded-legacy-without-the-cause",
    file: 'scripts/mutation-check.mjs',
    claim: "`--stranded` over a marker written before hashes were recorded says so",
    find: "was written before markers recorded what the mutation did (${named}), so it cannot be checked against the tree.",
    replace: "is old (${named}).",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: "stranded-applied-without-the-consequence",
    file: 'scripts/mutation-check.mjs',
    claim: "`--stranded` over a mutation that is still applied says that this mode does not undo it and that a commit or a gate run would carry it",
    find: "Nothing was touched, and this mode does not undo it: a commit or a gate run over this tree would carry the mutation. Heal it first: ${heal}`",
    replace: "Nothing was touched. Heal it first: ${heal}`",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'gate-preflight-removed',
    file: 'scripts/confidence.mjs',
    claim: "the gate refuses to score a tree a killed mutation run left mutated, before any row",
    find: "if (strandedCheck.status !== 0) {",
    replace: "if (false) {",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'gate-preflight-exits-zero',
    file: 'scripts/confidence.mjs',
    claim: "the gate's refusal over a stranded tree is a failing exit, not a quiet stop that a caller reads as a pass",
    find: "Nothing was run.\\n`)\n  process.exit(2)",
    replace: "Nothing was run.\\n`)\n  process.exit(0)",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'gate-preflight-refuses-every-tree',
    file: 'scripts/confidence.mjs',
    claim: "the gate's preflight lets a tree with no stranded mutation through",
    find: "if (strandedCheck.status !== 0) {",
    replace: "if (true) {",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: "gate-preflight-refuses-only-status-one",
    file: 'scripts/confidence.mjs',
    claim: "the gate's preflight refuses on any status of the check but 0, not only on 1: a check that crashed has not said the tree is clean",
    find: "if (strandedCheck.status !== 0) {",
    replace: "if (strandedCheck.status === 1) {",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: "gate-preflight-drops-the-checks-stderr",
    file: 'scripts/confidence.mjs',
    claim: "the gate's preflight prints what the check said on stderr as well as on stdout",
    find: "console.log(`\\n${`${strandedCheck.stdout}${strandedCheck.stderr}`.trimEnd()}`)",
    replace: "console.log(`\\n${`${strandedCheck.stdout}`.trimEnd()}`)",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: "gate-preflight-calls-a-killed-check-an-exit",
    file: 'scripts/confidence.mjs',
    claim: "the gate's preflight says a check that was killed did not finish, and does not report an exit status it never had",
    find: "strandedCheck.status === null ? 'did not finish' : `exited ${strandedCheck.status}`",
    replace: "`exited ${strandedCheck.status}`",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'hook-script-without-stranded',
    file: 'package.json',
    claim: "the script the pre-commit hook runs refuses a stranded state",
    find: "node scripts/mutation-check.mjs --stranded && node scripts/mutation-check.mjs --anchors",
    replace: "node scripts/mutation-check.mjs --anchors",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'hook-script-stranded-last',
    file: 'package.json',
    claim: "the script the pre-commit hook runs asks about a stranded state first, so it is named before an anchor check that a stranded file would fail with the wrong diagnosis",
    find: '"check:mutation-anchors": "node scripts/mutation-check.mjs --stranded && node scripts/mutation-check.mjs --anchors && node scripts/mutation-check.mjs --self-test"',
    replace: '"check:mutation-anchors": "node scripts/mutation-check.mjs --anchors && node scripts/mutation-check.mjs --self-test && node scripts/mutation-check.mjs --stranded"',
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'hook-drops-the-mutation-anchors-line',
    file: '.githooks/pre-commit',
    claim: "the pre-commit hook runs the mutation-anchors script, which is where a stranded state is refused",
    find: "npm run --silent check:mutation-anchors\n",
    replace: "",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: "hook-exits-before-the-mutation-anchors-line",
    file: '.githooks/pre-commit',
    claim: "the pre-commit hook gets to the mutation-anchors line: nothing above it ends the hook",
    find: "npm run --silent check:mutation-anchors\n",
    replace: "exit 0\nnpm run --silent check:mutation-anchors\n",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'restore-clears-the-marker-over-a-dirty-build',
    file: 'scripts/mutation-check.mjs',
    claim: "a handler that puts a source file back before its build is verified keeps the marker",
    find: "  if (ownsState && undone && !buildDirty) clearActive()",
    replace: "  if (ownsState && undone) clearActive()",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'build-never-marked-dirty',
    file: 'scripts/mutation-check.mjs',
    claim: "a source mutation marks the build dirty from the moment it can reach it",
    find: "  buildDirty = reachesBuild",
    replace: "  buildDirty = false",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'restore-skips-the-source-backups',
    file: 'scripts/mutation-check.mjs',
    claim: "the exit handler puts a mutated source file back from its backup",
    find: "    if (existsSync(path)) writeFileSync(file, readFileSync(path))",
    replace: "    void path",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'source-marker-written-after-the-hook',
    file: 'scripts/mutation-check.mjs',
    claim: "the marker is written before the file can be touched",
    find: "  writeFileSync(marker, markerText)\n  backups.set(m.file, backupPath)\n  buildDirty = reachesBuild\n  await killHere('source-prepared')\n",
    replace: "  backups.set(m.file, backupPath)\n  buildDirty = reachesBuild\n  await killHere('source-prepared')\n  writeFileSync(marker, markerText)\n",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'source-backup-written-after-the-hook',
    file: 'scripts/mutation-check.mjs',
    claim: "the backup is written before the file can be touched",
    find: "  writeFileSync(backupPath, original)\n  const reachesBuild = needsRebuild || MUTATION_FAULT === 'build-never-verified'\n  const markerText = JSON.stringify(sourceMarker(m, backupPath, original, mutated, reachesBuild))\n  writeFileSync(marker, markerText)\n  backups.set(m.file, backupPath)\n  buildDirty = reachesBuild\n  await killHere('source-prepared')\n",
    replace: "  const reachesBuild = needsRebuild || MUTATION_FAULT === 'build-never-verified'\n  const markerText = JSON.stringify(sourceMarker(m, backupPath, original, mutated, reachesBuild))\n  writeFileSync(marker, markerText)\n  backups.set(m.file, backupPath)\n  buildDirty = reachesBuild\n  await killHere('source-prepared')\n  writeFileSync(backupPath, original)\n",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'world-marker-written-after-the-hook',
    file: 'scripts/mutation-check.mjs',
    claim: "a world mutation's marker is written before it moves anything",
    find: "    writeFileSync(marker, JSON.stringify(worldMarker))\n    worldApplied = { restore: m.restore, stash, before, touched: null }\n    await killHere('world-prepared')\n",
    replace: "    worldApplied = { restore: m.restore, stash, before, touched: null }\n    await killHere('world-prepared')\n    writeFileSync(marker, JSON.stringify(worldMarker))\n",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'touched-not-kept-in-memory',
    file: 'scripts/mutation-check.mjs',
    claim: "the run remembers which paths a world mutation touched, so an unrelated change cannot fail its restore",
    find: "    worldApplied.touched = touched",
    replace: "    void touched",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'no-op-world-mutation-not-noticed',
    file: 'scripts/mutation-check.mjs',
    claim: "a world mutation that changes nothing is reported as broken",
    find: "    if (Object.keys(touched).length === 0) {",
    replace: "    if (false) {",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'refused-run-releases-a-lock-it-never-held',
    file: 'scripts/mutation-check.mjs',
    claim: "a run that was refused leaves the live holder's lock",
    find: "  if (!ownsLock) return\n  rmSync(runLock, { force: true })",
    replace: "  rmSync(runLock, { force: true })",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'nested-lock-not-checked',
    file: 'scripts/mutation-check.mjs',
    claim: "a live run inside a run stops this one too",
    find: "  checkLockAt(join(dir, 'nested'), options)\n}",
    replace: "}",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },

  {
    id: 'scorer-blind',
    file: 'scripts/row-confidence.mjs',
    claim: 'a scorer that calls every row toothed is itself caught',
    find: 'const score = (hasTeeth, hasClock) => (hasTeeth ? 70 : 0) + (hasClock ? 0 : 30)',
    replace: 'const score = () => 100',
    expect: 'node scripts/run-row.mjs "every gate row has teeth and is deterministic"',
  },

  // The clock scan (2026-11-04). The gate's mutation row found `harness-reads-the-clock-twice` surviving once this table grew: the scan under the row
  // "every gate row has teeth and is deterministic" had lost sync at a `//` inside a string and could not see a second clock read in this file. It is a scanner now; one entry per
  // branch of it, each the line a clause of `row-confidence.mjs --self-test` stands on.
  {
    id: 'row-scan-pairs-quotes-across-the-file',
    file: 'scripts/row-confidence.mjs',
    claim: "the determinism scan reads comments, strings and regular expressions as a scanner does, not as three passes that disagree about a `//` in a string",
    find: "  const code = stripNonCode(src)\n",
    replace: "  const code = src\n    .replace(/\\/\\*[\\s\\S]*?\\*\\//g, ' ')\n    .split('\\n').map(l => l.replace(/\\/\\/.*$/, '')).join('\\n')\n    .replace(/(['\"`])(?:\\\\.|(?!\\1)[\\s\\S])*\\1/g, \"''\")\n",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-keeps-line-comments',
    file: 'scripts/strip-non-code.mjs',
    claim: "a clock read in a line comment is not a clock read",
    find: "      if (c === '/' && d === '/') { const s = i; while (i < n && !isEol(src[i])) i++; spans.push([s, i]); continue }",
    replace: "      if (false) { const s = i; while (i < n && !isEol(src[i])) i++; spans.push([s, i]); continue }",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-keeps-block-comments',
    file: 'scripts/strip-non-code.mjs',
    claim: "a clock read in a block comment is not a clock read",
    find: "      if (c === '/' && d === '*') { const s = i; const end = src.indexOf('*/', i + 2); i = end < 0 ? n : end + 2; spans.push([s, i]); out += [...src.slice(s, i)].some(isEol) ? '\\n' : ' '; continue }",
    replace: "      if (false) { const s = i; const end = src.indexOf('*/', i + 2); i = end < 0 ? n : end + 2; spans.push([s, i]); out += [...src.slice(s, i)].some(isEol) ? '\\n' : ' '; continue }",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'comment-with-a-line-end-is-a-space',
    file: 'scripts/strip-non-code.mjs',
    claim: "a block comment that holds a line terminator is a line terminator to the language, so a `++` after it (with an operand before the comment) is a prefix and a slash after the `++` begins a regular expression",
    find: "out += [...src.slice(s, i)].some(isEol) ? '\\n' : ' '; continue }",
    replace: "out += ' '; continue }",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'comment-line-end-is-a-line-feed-only',
    file: 'scripts/strip-non-code.mjs',
    claim: "a block comment that holds a carriage return, U+2028 or U+2029 is a line terminator as one that holds a line feed is",
    find: "[...src.slice(s, i)].some(isEol) ? '\\n' : ' '",
    replace: "src.slice(s, i).includes('\\n') ? '\\n' : ' '",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'every-comment-is-a-line-end',
    file: 'scripts/strip-non-code.mjs',
    claim: "a block comment that holds no line terminator is one space, not a line end: a `++` after it still ends an operand",
    find: "[...src.slice(s, i)].some(isEol) ? '\\n' : ' '",
    replace: "'\\n'",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-lets-a-quote-run-on',
    file: 'scripts/strip-non-code.mjs',
    claim: "an unclosed quote ends at its line",
    find: "        while (i < n && src[i] !== c && src[i] !== '\\n' && src[i] !== '\\r') i += src[i] !== '\\\\' ? 1 : src[i + 1] === '\\r' && src[i + 2] === '\\n' ? 3 : 2",
    replace: "        while (i < n && src[i] !== c) i += src[i] !== '\\\\' ? 1 : src[i + 1] === '\\r' && src[i + 2] === '\\n' ? 3 : 2",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-ignores-string-escapes',
    file: 'scripts/strip-non-code.mjs',
    claim: "an escaped quote does not end a string",
    find: "i += src[i] !== '\\\\' ? 1 : src[i + 1] === '\\r' && src[i + 2] === '\\n' ? 3 : 2",
    replace: "i += 1",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-reads-every-slash-as-division',
    file: 'scripts/strip-non-code.mjs',
    claim: "a regular expression literal is not read as division",
    find: "        if (!regexAllowed()) { out += '/'; i++; continue }",
    replace: "        if (true) { out += '/'; i++; continue }",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-reads-every-slash-as-a-regex',
    file: 'scripts/strip-non-code.mjs',
    claim: "a division is not read as a regular expression",
    find: "  const regexAllowed = () => {",
    replace: "  const regexAllowed = () => true\n  const unusedRegexAllowed = () => {",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'proof-failed-restore-called-stale',
    file: 'scripts/proof-check.mjs',
    claim: "a run whose restore did not read back never has its state discarded as stale",
    find: "  if (restoreFailed && !((targetStranded || targetIntact) && (registryStranded || registryIntact))) return 'diverged'",
    replace: "  void restoreFailed",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-failed-restore-ignores-the-registry',
    file: 'scripts/proof-check.mjs',
    claim: "a registry that is not its backup, after a restore that did not read back, keeps the state",
    find: "(registryStranded || registryIntact))) return 'diverged'",
    replace: "true)) return 'diverged'",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-failed-restore-ignores-the-target',
    file: 'scripts/proof-check.mjs',
    claim: "a target that is not its backup, after a restore that did not read back, keeps the state",
    find: "if (restoreFailed && !((targetStranded || targetIntact) &&",
    replace: "if (restoreFailed && !(true &&",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-restore-failure-says-nothing',
    file: 'scripts/proof-check.mjs',
    claim: "a run whose restore did not read back names the files that did not come back",
    find: "could NOT be put back (a write failed",
    replace: "put back (a write failed",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-main-flow-target-always-intact',
    file: 'scripts/proof-check.mjs',
    claim: "the run that finds a marker compares the target with its backup",
    find: "  targetIntact: backupTarget !== null && currentTarget === backupTarget,",
    replace: "  targetIntact: true,",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-main-flow-registry-always-intact',
    file: 'scripts/proof-check.mjs',
    claim: "the run that finds a marker compares the registry with its backup",
    find: "  registryIntact: backupRegistry !== null && currentRegistry === backupRegistry,",
    replace: "  registryIntact: true,",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-stranger-pid-refuses',
    file: 'scripts/proof-check.mjs',
    claim: "a marker with no start time over a pid running something else is a dead run's",
    find: "    && !((prior.start === undefined || prior.start === null) && isStranger(command(prior.pid)))",
    replace: "    && true",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-unconfirmed-pid-offers-kill',
    file: 'scripts/proof-check.mjs',
    claim: "a refusal over a pid nobody can identify says to look at it, not to kill it",
    find: "  const unconfirmed = (prior.start === undefined || prior.start === null) && holder === null",
    replace: "  const unconfirmed = false",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-unconfirmed-pid-offers-delete',
    file: 'scripts/proof-check.mjs',
    claim: "a refusal never offers to delete the state, which holds the only whole copy",
    find: "do not delete it.`)",
    replace: "delete ${STATE_DIR} to clear it.`)",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-stranded-target-needs-no-marker',
    file: 'scripts/proof-check.mjs',
    claim: "an insertion without the marker is newer work, however proof-like its shape",
    find: "return block !== null && block.includes(MARKER) && onlyProofFunctions(block)",
    replace: "return block !== null && onlyProofFunctions(block)",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-committed-registry-from-working-tree',
    file: 'scripts/proof-check.mjs',
    claim: "the committed registry is read from HEAD, not from the working tree",
    find: "execSync(`git show HEAD:${path}`",
    replace: "execSync(`cat ${path}`",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-restore-skips-the-registry-readback',
    file: 'scripts/proof-check.mjs',
    claim: "a restore is not called one until the registry reads back too",
    find: "  return outcome[TARGET] === 'ok' && outcome[REGISTRY] === 'ok'",
    replace: "  return outcome[TARGET] === 'ok'",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'row-scan-leaves-regex-flags-in-the-text',
    file: 'scripts/strip-non-code.mjs',
    claim: "a regular expression's flags go with it",
    find: "        while (i < n && /[a-z]/.test(src[i])) i++\n",
    replace: "",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-ignores-regex-escapes',
    file: 'scripts/strip-non-code.mjs',
    claim: "an escaped slash does not end a regular expression",
    find: "          if (r === '\\\\') { i += 2; continue }",
    replace: "          if (false) { i += 2; continue }",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-regex-runs-past-its-line',
    file: 'scripts/strip-non-code.mjs',
    claim: "an unterminated regular expression ends at its line",
    find: "        while (i < n && !isEol(src[i])) {\n          const r = src[i]",
    replace: "        while (i < n) {\n          const r = src[i]",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-start-of-text-divides',
    file: 'scripts/strip-non-code.mjs',
    claim: "a slash at the very start of the text begins a regular expression",
    find: "    if (tail === '') return true",
    replace: "    if (tail === '') return false",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-forgets-a-punctuation-mark',
    file: 'scripts/strip-non-code.mjs',
    claim: "a slash after any operator or opening bracket begins a regular expression",
    find: "'(,=:[!&|?{};+-*%<>~^/'.includes(tail[tail.length - 1])",
    replace: "'(,=:[!&|?{};+-*%<>~/'.includes(tail[tail.length - 1])",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  // The parenthesis of an if, while, for or with header (2026-11-05, residuals Task 9 item 3): the slash after it begins a regular expression, and after any other `)` it divides. One entry per part of the rule: the keywords, the
  // lookbehind that keeps `o.if`, `this.#if`, `elif` and `$if` out, the window, the parenthesis stack and its pop; then the slash in the punctuation list.
  {
    id: 'hdr-rule-dropped',
    file: 'scripts/strip-non-code.mjs',
    claim: "a slash after the parenthesis that closes an if, while, for or with header begins a regular expression (a quote or a backtick in it must not open a string or a template)",
    find: "    if (tail.endsWith(')') && endsInKeyword(out.slice(Math.max(0, closed - 40), closed).trimEnd().replace(/\\s+await$/, ''), HEADER)) return true\n",
    replace: "",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'hdr-no-if',
    file: 'scripts/strip-non-code.mjs',
    claim: "`if (x) /re/` is a statement that begins with a regular expression",
    find: "const HEADER = new Set(['if', 'while', 'for', 'with'])",
    replace: "const HEADER = new Set(['while', 'for', 'with'])",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'hdr-no-while',
    file: 'scripts/strip-non-code.mjs',
    claim: "`while (x) /re/` is a statement that begins with a regular expression",
    find: "const HEADER = new Set(['if', 'while', 'for', 'with'])",
    replace: "const HEADER = new Set(['if', 'for', 'with'])",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'hdr-no-for',
    file: 'scripts/strip-non-code.mjs',
    claim: "`for (...) /re/` is a statement that begins with a regular expression",
    find: "const HEADER = new Set(['if', 'while', 'for', 'with'])",
    replace: "const HEADER = new Set(['if', 'while', 'with'])",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'hdr-no-with',
    file: 'scripts/strip-non-code.mjs',
    claim: "`with (o) /re/` is a statement that begins with a regular expression",
    find: "const HEADER = new Set(['if', 'while', 'for', 'with'])",
    replace: "const HEADER = new Set(['if', 'while', 'for'])",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'hdr-no-for-await',
    file: 'scripts/strip-non-code.mjs',
    claim: "`for await (...) /re/` is a statement that begins with a regular expression",
    find: ".replace(/\\s+await$/, '')",
    replace: "",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'hdr-no-lookbehind',
    file: 'scripts/strip-non-code.mjs',
    claim: "a method named like a header keyword, or a name that ends in one, is a call, and its slash divides",
    find: "endsInKeyword(out.slice(Math.max(0, closed - 40), closed).trimEnd().replace(/\\s+await$/, ''), HEADER)",
    replace: "/(?:if|while|for|with)$/.test(out.slice(Math.max(0, closed - 40), closed).trimEnd().replace(/\\s+await$/, ''))",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'hdr-lookbehind-no-dot',
    file: 'scripts/strip-non-code.mjs',
    claim: "`o.if (x) / 2` is a method call: its slash divides",
    find: "endsInKeyword(out.slice(Math.max(0, closed - 40), closed).trimEnd().replace(/\\s+await$/, ''), HEADER)",
    replace: "/(?<![\\w$#])(?:if|while|for|with)$/.test(out.slice(Math.max(0, closed - 40), closed).trimEnd().replace(/\\s+await$/, ''))",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'hdr-lookbehind-no-hash',
    file: 'scripts/strip-non-code.mjs',
    claim: "`this.#if (x) / 2` is a private method call: its slash divides",
    find: "endsInKeyword(out.slice(Math.max(0, closed - 40), closed).trimEnd().replace(/\\s+await$/, ''), HEADER)",
    replace: "/(?<![\\w$.])(?:if|while|for|with)$/.test(out.slice(Math.max(0, closed - 40), closed).trimEnd().replace(/\\s+await$/, ''))",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'hdr-lookbehind-no-word',
    file: 'scripts/strip-non-code.mjs',
    claim: "`elif (x) / 2` is a call to a name that ends in if: its slash divides",
    find: "endsInKeyword(out.slice(Math.max(0, closed - 40), closed).trimEnd().replace(/\\s+await$/, ''), HEADER)",
    replace: "/(?<![$.#])(?:if|while|for|with)$/.test(out.slice(Math.max(0, closed - 40), closed).trimEnd().replace(/\\s+await$/, ''))",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'hdr-lookbehind-no-dollar',
    file: 'scripts/strip-non-code.mjs',
    claim: "`$if (x) / 2` is a call to a name that ends in if after a dollar sign: its slash divides",
    find: "endsInKeyword(out.slice(Math.max(0, closed - 40), closed).trimEnd().replace(/\\s+await$/, ''), HEADER)",
    replace: "/(?<![\\w.#])(?:if|while|for|with)$/.test(out.slice(Math.max(0, closed - 40), closed).trimEnd().replace(/\\s+await$/, ''))",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: "hdr-ascii-lookbehind",
    file: 'scripts/strip-non-code.mjs',
    claim: "the keyword of a header is read as every keyword is, not behind a one-character ASCII lookbehind: `o. if (x) / 2` (a dot and a space), `o.\\nwhile (x) / 2` (a dot and a line feed) and `éif (x) / 2` (a non-ASCII letter before the keyword) are calls, and their slash divides",
    find: "endsInKeyword(out.slice(Math.max(0, closed - 40), closed).trimEnd().replace(/\\s+await$/, ''), HEADER)",
    replace: "/(?<![\\w$.#])(?:if|while|for|with)$/.test(out.slice(Math.max(0, closed - 40), closed).trimEnd().replace(/\\s+await$/, ''))",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: "hdr-await-alone-is-a-header",
    file: 'scripts/strip-non-code.mjs',
    claim: "`await` is a header word only after `for`: a parenthesis after an await alone (`await (x) / 2`) is an operand, and its slash divides",
    find: "const HEADER = new Set(['if', 'while', 'for', 'with'])",
    replace: "const HEADER = new Set(['if', 'while', 'for', 'with', 'await'])",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'hdr-window-one',
    file: 'scripts/strip-non-code.mjs',
    claim: "the keyword is read from the text just before the opening parenthesis of the header, not one character of it",
    find: "closed - 40), closed",
    replace: "closed - 1), closed",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'hdr-window-twenty',
    file: 'scripts/strip-non-code.mjs',
    claim: "a header whose keyword is thirty spaces before its parenthesis is still one (the window the keyword is looked for in is forty characters)",
    find: "closed - 40), closed",
    replace: "closed - 20), closed",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'hdr-no-close-paren-test',
    file: 'scripts/strip-non-code.mjs',
    claim: "a slash after the statement of an if divides: the header rule applies only when the text before the slash ends in the header's own parenthesis",
    find: "if (tail.endsWith(')') && endsInKeyword(",
    replace: "if (endsInKeyword(",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'hdr-no-trim',
    file: 'scripts/strip-non-code.mjs',
    claim: "the space between a header keyword and its parenthesis does not hide the keyword",
    find: "closed).trimEnd().replace(",
    replace: "closed).replace(",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'hdr-opens-not-pushed',
    file: 'scripts/strip-non-code.mjs',
    claim: "an opening parenthesis is recorded where it begins, or a header's keyword is looked for in the wrong place",
    find: "if (c === '(') opens.push(out.length)",
    replace: "if (c === '(') opens.push(0)",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'hdr-pop-missing',
    file: 'scripts/strip-non-code.mjs',
    claim: "a closing parenthesis takes back the opening parenthesis it matches, not the latest one",
    find: "closed = opens.pop() ?? 0",
    replace: "closed = opens[opens.length - 1] ?? 0",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'hdr-close-never-recorded',
    file: 'scripts/strip-non-code.mjs',
    claim: "the parenthesis that closes a header is the one whose opening is looked at",
    find: "else if (c === ')') closed = opens.pop() ?? 0",
    replace: "else if (c === ')') opens.pop()",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'hdr-close-keeps-the-paren-out',
    file: 'scripts/strip-non-code.mjs',
    claim: "the text before a header's opening parenthesis ends with its keyword, so the parenthesis is not part of it",
    find: "if (c === '(') opens.push(out.length)\n      else if",
    replace: "if (c === '(') opens.push(out.length + 1)\n      else if",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'punct-no-slash',
    file: 'scripts/strip-non-code.mjs',
    claim: "a slash after a division sign begins a regular expression (`a / /re/.source`)",
    find: "~^/'.includes",
    replace: "~^'.includes",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-forgets-a-keyword',
    file: 'scripts/strip-non-code.mjs',
    claim: "a slash after any of its keywords begins a regular expression",
    find: "'do', 'yield', 'await'])\n  const n",
    replace: "'do', 'yield'])\n  const n",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  // What ends a line, and what a regular expression can follow (2026-11-05, residuals Task 10 item 13): a carriage return, U+2028 and U+2029 end a `//` comment, a regular expression and the `++` test as a line feed does;
  // a string stops at a line feed or a carriage return only; a backslash before a CR LF continues it over both; and `instanceof`, `extends` and `default` can be followed by a regular expression.
  {
    id: 'kw-no-instanceof',
    file: 'scripts/strip-non-code.mjs',
    claim: "a slash after `instanceof` begins a regular expression",
    find: "const REGEX_AFTER = new Set(['return', 'typeof', 'case', 'in', 'instanceof', 'extends', 'default', 'delete', 'void', 'throw', 'new', 'else', 'do', 'yield', 'await'])",
    replace: "const REGEX_AFTER = new Set(['return', 'typeof', 'case', 'in', 'extends', 'default', 'delete', 'void', 'throw', 'new', 'else', 'do', 'yield', 'await'])",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'kw-no-extends',
    file: 'scripts/strip-non-code.mjs',
    claim: "a slash after `extends` begins a regular expression",
    find: "const REGEX_AFTER = new Set(['return', 'typeof', 'case', 'in', 'instanceof', 'extends', 'default', 'delete', 'void', 'throw', 'new', 'else', 'do', 'yield', 'await'])",
    replace: "const REGEX_AFTER = new Set(['return', 'typeof', 'case', 'in', 'instanceof', 'default', 'delete', 'void', 'throw', 'new', 'else', 'do', 'yield', 'await'])",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'kw-no-default',
    file: 'scripts/strip-non-code.mjs',
    claim: "a slash after `default` begins a regular expression",
    find: "const REGEX_AFTER = new Set(['return', 'typeof', 'case', 'in', 'instanceof', 'extends', 'default', 'delete', 'void', 'throw', 'new', 'else', 'do', 'yield', 'await'])",
    replace: "const REGEX_AFTER = new Set(['return', 'typeof', 'case', 'in', 'instanceof', 'extends', 'delete', 'void', 'throw', 'new', 'else', 'do', 'yield', 'await'])",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  // A name is not the keyword it ends in (2026-11-05, residuals Task 10 item 16): `of` is an identifier in a module and left the list; the trailing word is a whole Unicode name (not its last ASCII letters), and a private name is never the keyword.
  {
    id: 'kw-of-back',
    file: 'scripts/strip-non-code.mjs',
    claim: "`of` is an identifier in a module, so a slash after it divides (`for (x of /re/...)` does not occur)",
    find: "const REGEX_AFTER = new Set(['return', 'typeof', 'case', 'in', 'instanceof', 'extends', 'default', 'delete', 'void', 'throw', 'new', 'else', 'do', 'yield', 'await'])",
    replace: "const REGEX_AFTER = new Set(['return', 'typeof', 'case', 'in', 'of', 'instanceof', 'extends', 'default', 'delete', 'void', 'throw', 'new', 'else', 'do', 'yield', 'await'])",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'spread-then-regex-read-as-division',
    file: 'scripts/strip-non-code.mjs',
    claim: "a slash after `...` begins a regular expression: a spread is not member access, and a quote or a backtick in the regular expression must not open a string or a template that swallows what comes after",
    find: "    if (tail.endsWith('...')) return true\n",
    replace: "",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'for-of-regex-read-as-division',
    file: 'scripts/strip-non-code.mjs',
    claim: "a slash after the `of` of a for-of header begins a regular expression (`for (x of /re/.exec(s))`)",
    find: " || (endsInKeyword(tail, OF) && !allowedAfter(tail.slice(0, -2).trimEnd()))",
    replace: "",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'of-keyword-and-name-swapped',
    file: 'scripts/strip-non-code.mjs',
    claim: "`of` is the keyword after something that ends an operand and a name where an expression begins, not the other way round",
    find: "&& !allowedAfter(tail.slice(0, -2).trimEnd())",
    replace: "&& allowedAfter(tail.slice(0, -2).trimEnd())",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'of-always-the-keyword',
    file: 'scripts/strip-non-code.mjs',
    claim: "an identifier named `of` where an expression begins (`x = of / 2`, `return of / 2`, `in of / 2`) is a name, and its slash divides",
    find: "(endsInKeyword(tail, OF) && !allowedAfter(tail.slice(0, -2).trimEnd()))",
    replace: "endsInKeyword(tail, OF)",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'of-head-not-trimmed',
    file: 'scripts/strip-non-code.mjs',
    claim: "what stands before an `of` is judged without the space between them (`x = of / 2` divides)",
    find: "allowedAfter(tail.slice(0, -2).trimEnd())",
    replace: "allowedAfter(tail.slice(0, -2))",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'of-head-cut-short',
    file: 'scripts/strip-non-code.mjs',
    claim: "what stands before an `of` is judged without the `of` itself, not without its last letter",
    find: "allowedAfter(tail.slice(0, -2).trimEnd())",
    replace: "allowedAfter(tail.slice(0, -1).trimEnd())",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'private-name-is-keyword',
    file: 'scripts/strip-non-code.mjs',
    claim: "a private name spelled like a keyword (`this.#in`, `#new`, `#do`) is not that keyword: its slash divides",
    find: "text[found.index - 1] !== '#' && ",
    replace: "",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'identifier-ascii-only',
    file: 'scripts/strip-non-code.mjs',
    claim: "a keyword after a non-ASCII letter (`éin`, `éreturn`) is part of a longer name, not the keyword",
    find: "/[\\p{ID_Continue}$]+$/u.exec(text)",
    replace: "/[\\w$]+$/.exec(text)",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'identifier-first-hit-only',
    file: 'scripts/strip-non-code.mjs',
    claim: "the trailing word is a whole name: `éin` is not `in`, whatever its last letters spell",
    find: "words.has(found[0])",
    replace: "words.has(found[0].slice(-2))",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'identifier-continue-class-start-only',
    file: 'scripts/strip-non-code.mjs',
    claim: "a combining mark is part of a name: `á` as `a` and U+0301, then `in`, is one name, not the keyword",
    find: "/[\\p{ID_Continue}$]+$/u.exec(text)",
    replace: "/[\\p{ID_Start}$]+$/u.exec(text)",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'identifier-dollar-dropped',
    file: 'scripts/strip-non-code.mjs',
    claim: "a name that begins with a dollar sign and ends in a keyword (`$in`) is not the keyword",
    find: "/[\\p{ID_Continue}$]+$/u.exec(text)",
    replace: "/[\\p{ID_Continue}]+$/u.exec(text)",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'eol-comment-lf-only',
    file: 'scripts/strip-non-code.mjs',
    claim: "a `//` comment ends at a carriage return, U+2028 and U+2029 as well as at a line feed",
    find: "{ const s = i; while (i < n && !isEol(src[i])) i++; spans.push([s, i]); continue }",
    replace: "{ const s = i; while (i < n && src[i] !== '\\n') i++; spans.push([s, i]); continue }",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'eol-string-no-cr',
    file: 'scripts/strip-non-code.mjs',
    claim: "a string left open ends at a carriage return as well as at a line feed",
    find: "src[i] !== '\\n' && src[i] !== '\\r') i +=",
    replace: "src[i] !== '\\n') i +=",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'eol-string-stops-at-ls',
    file: 'scripts/strip-non-code.mjs',
    claim: "U+2028 and U+2029 are legal inside a string, so an open string does not end at them",
    find: "src[i] !== '\\n' && src[i] !== '\\r') i +=",
    replace: "!isEol(src[i])) i +=",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'eol-string-crlf-continuation',
    file: 'scripts/strip-non-code.mjs',
    claim: "a backslash before a CR LF continues the string over both characters",
    find: "src[i + 1] === '\\r' && src[i + 2] === '\\n' ? 3 : 2",
    replace: "2",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'eol-string-lone-cr-continuation',
    file: 'scripts/strip-non-code.mjs',
    claim: "a backslash before a lone CR continues the string over the CR only",
    find: "src[i + 1] === '\\r' && src[i + 2] === '\\n' ? 3 : 2",
    replace: "src[i + 1] === '\\r' ? 3 : 2",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'eol-regex-lf-only',
    file: 'scripts/strip-non-code.mjs',
    claim: "an unterminated regular expression ends at a carriage return, U+2028 and U+2029 as well as at a line feed",
    find: "while (i < n && !isEol(src[i])) {\n          const r",
    replace: "while (i < n && src[i] !== '\\n') {\n          const r",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'eol-asi-lf-only',
    file: 'scripts/strip-non-code.mjs',
    claim: "a `++` after a carriage return, U+2028 or U+2029 starts its statement as it does after a line feed",
    find: "![...before.slice(operand.length)].some(isEol)",
    replace: "!before.slice(operand.length).includes('\\n')",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'eol-no-cr',
    file: 'scripts/strip-non-code.mjs',
    claim: "a carriage return ends a line",
    find: "ch === '\\n' || ch === '\\r' || ch ===",
    replace: "ch === '\\n' || ch ===",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'eol-no-ls',
    file: 'scripts/strip-non-code.mjs',
    claim: "U+2028 ends a line",
    find: "ch === String.fromCharCode(0x2028) || ",
    replace: "",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'eol-no-ps',
    file: 'scripts/strip-non-code.mjs',
    claim: "U+2029 ends a line",
    find: " || ch === String.fromCharCode(0x2029)",
    replace: "",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-line-comment-eats-the-newline',
    file: 'scripts/strip-non-code.mjs',
    claim: "a line comment ends at its newline and leaves it",
    find: "if (c === '/' && d === '/') { const s = i; while (i < n && !isEol(src[i])) i++; spans.push([s, i]); continue }",
    replace: "if (c === '/' && d === '/') { const s = i; while (i < n && !isEol(src[i])) i++; i++; spans.push([s, i]); continue }",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-block-comment-ends-on-its-opener',
    file: 'scripts/strip-non-code.mjs',
    claim: "a block comment cannot end on the slash that opened it",
    find: "src.indexOf('*/', i + 2)",
    replace: "src.indexOf('*/', i + 1)",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-empty-block-comment-runs-on',
    file: 'scripts/strip-non-code.mjs',
    claim: "an empty block comment `/**/` ends at its own closer, not at the next `*/` after it (which would hide the code between them, and a bare clock read with it)",
    find: "src.indexOf('*/', i + 2)",
    replace: "src.indexOf('*/', i + 3)",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-stack-overflow-unnamed',
    file: 'scripts/strip-non-code.mjs',
    claim: "a scan that runs out of stack on templates nested too deep says what the limit is and stops: it does not end as a bare \"Maximum call stack size exceeded\"",
    find: "if (e instanceof RangeError && /call stack/i.test(e.message))",
    replace: "if (false)",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-unscannable-script-scores-clean',
    file: 'scripts/row-confidence.mjs',
    claim: "a script the scan cannot finish is an objection against its row, not a script found clean",
    find: "catch (e) { flagged.push(`${s}: cannot be scanned (${e.message}), so its clock reads and its network use are not known`); continue }",
    replace: "catch (e) { continue }",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-unscannable-script-hides-the-reason',
    file: 'scripts/row-confidence.mjs',
    claim: "the objection against a script the scan cannot finish carries the scanner's own message, which names the limit",
    find: "${s}: cannot be scanned (${e.message}), so its clock reads",
    replace: "${s}: cannot be scanned, so its clock reads",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'blank-comments-takes-a-regex-for-a-comment',
    file: 'scripts/strip-non-code.mjs',
    claim: "blankComments keeps a regular expression: a span that begins with a slash is a comment only if its second character is a slash or a star (a regular expression with a script path in it must stay for the readers that look for the path)",
    find: "src[s + 1] === '/'",
    replace: "src[s + 0] === '/'",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'blank-comments-misses-block-comments',
    file: 'scripts/strip-non-code.mjs',
    claim: "blankComments blanks a block comment as well as a line comment",
    find: " || src[s + 1] === '*')",
    replace: ")",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'blank-comments-takes-a-string-for-a-comment',
    file: 'scripts/strip-non-code.mjs',
    claim: "blankComments keeps a string that begins with `//` or `/*`: only a span that begins with a slash can be a comment",
    find: "src[s] === '/' && (",
    replace: "(",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-comment-after-an-operator',
    file: 'scripts/strip-non-code.mjs',
    claim: "a comment where a regular expression could begin is still a comment",
    find: "      if (c === '/' && d === '/') {",
    replace: "      if (c === '/' && d === '/' && regexAllowed() === false) {",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-regex-leaves-no-marker',
    file: 'scripts/strip-non-code.mjs',
    claim: "a regular expression leaves a marker where it was",
    find: "        out += '0'\n",
    replace: "        out += ''\n",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-template-leaves-no-marker',
    file: 'scripts/strip-non-code.mjs',
    claim: "a template leaves a marker where it was",
    find: "if (c === '`') { const s = i; i = skipTemplate(i + 1); spans.push([s, i]); out += \"''\"; continue }",
    replace: "if (c === '`') { const s = i; i = skipTemplate(i + 1); spans.push([s, i]); continue }",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-captures-any-name',
    file: 'scripts/row-confidence.mjs',
    claim: "a capture is a top-level constant in capitals",
    find: "const [A-Z][A-Z0-9_]* = ",
    replace: "const [A-Za-z][A-Za-z0-9_]* = ",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-forgives-one-bare-read',
    file: 'scripts/row-confidence.mjs',
    claim: "one clock read more than the captures is flagged",
    find: "    if (reads > captures) {",
    replace: "    if (reads > captures + 1) {",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-forgets-regex-after-return',
    file: 'scripts/strip-non-code.mjs',
    claim: "a slash after `return` begins a regular expression",
    find: "    return found !== null && words.has(found[0]) && text[found.index - 1] !== '#' && !isPropertyDot(text.slice(0, found.index).trimEnd())",
    replace: "    return false",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-divides-nothing-after-an-increment',
    file: 'scripts/strip-non-code.mjs',
    claim: "a slash after a postfix `++` divides",
    find: "    if (/(\\+\\+|--)$/.test(tail)) {",
    replace: "    if (false) {",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-increment-anchor-dropped',
    file: 'scripts/strip-non-code.mjs',
    claim: "only a `++` at the very end of the window makes the slash a division",
    find: "    if (/(\\+\\+|--)$/.test(tail)) {",
    replace: "    if (/(\\+\\+|--)/.test(tail)) {",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-increment-after-a-bracket',
    file: 'scripts/strip-non-code.mjs',
    claim: "a slash after `a[0]++` divides",
    find: "/[\\w$)\\]]$/.test(operand)",
    replace: "/[\\w$)]$/.test(operand)",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-increment-after-a-paren',
    file: 'scripts/strip-non-code.mjs',
    claim: "a slash after `(a)++` divides",
    find: "/[\\w$)\\]]$/.test(operand)",
    replace: "/[\\w$\\]]$/.test(operand)",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-increment-after-a-space',
    file: 'scripts/strip-non-code.mjs',
    claim: "a slash after `n ++` divides",
    find: "const operand = before.trimEnd()",
    replace: "const operand = before",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-increment-crosses-a-line',
    file: 'scripts/strip-non-code.mjs',
    claim: "a `++` that starts its statement is a prefix, and a slash after it begins a regular expression",
    find: " && ![...before.slice(operand.length)].some(isEol)",
    replace: "",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-increment-after-a-keyword',
    file: 'scripts/strip-non-code.mjs',
    claim: "a `++` after a keyword is a prefix",
    find: " && !endsInKeyword(operand)) return false",
    replace: ") return false",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-dot-anywhere',
    file: 'scripts/strip-non-code.mjs',
    claim: "a keyword is a property only when the dot is right before it",
    find: "before.endsWith('.') && !before.endsWith('...') && !/(?<![\\w$.])\\d+\\.$/.test(before)",
    replace: "before.includes('.')",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-reads-a-keyword-property-as-a-keyword',
    file: 'scripts/strip-non-code.mjs',
    claim: "a property spelled like a keyword is not the keyword",
    find: " && !isPropertyDot(text.slice(0, found.index).trimEnd())",
    replace: "",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-spread-is-a-property',
    file: 'scripts/strip-non-code.mjs',
    claim: "a keyword after a spread is a keyword",
    find: " && !before.endsWith('...')",
    replace: "",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-number-dot-is-a-property',
    file: 'scripts/strip-non-code.mjs',
    claim: "a number's decimal point is not a property access",
    find: " && !/(?<![\\w$.])\\d+\\.$/.test(before)",
    replace: "",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-property-dot-not-trimmed',
    file: 'scripts/strip-non-code.mjs',
    claim: "a dot before a space and a keyword is still a property access",
    find: "text.slice(0, found.index).trimEnd()",
    replace: "text.slice(0, found.index)",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-whitespace-window-is-the-start',
    file: 'scripts/strip-non-code.mjs',
    claim: "a slash after a long run of spaces is judged by what came before them",
    find: "    if (tail === '' && out.length > raw.length) tail = out.trimEnd().slice(-64)\n",
    replace: "",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-forgets-to-trim-the-tail',
    file: 'scripts/strip-non-code.mjs',
    claim: "a slash after a keyword and a space begins a regular expression",
    find: "    let tail = raw.trimEnd()",
    replace: "    let tail = raw",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-looks-back-too-little',
    file: 'scripts/strip-non-code.mjs',
    claim: "the scan looks back far enough to reach a keyword through spaces",
    find: "    const raw = out.slice(-64)",
    replace: "    const raw = out.slice(-8)",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-looks-back-one-character',
    file: 'scripts/strip-non-code.mjs',
    claim: "the scan looks at more than the last character",
    find: "    const raw = out.slice(-64)",
    replace: "    const raw = out.slice(-1)",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-looks-back-twenty',
    file: 'scripts/strip-non-code.mjs',
    claim: "the scan reaches a dot further back than twenty characters",
    find: "    const raw = out.slice(-64)",
    replace: "    const raw = out.slice(-20)",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-captures-fieldday-nospace',
    file: 'scripts/row-confidence.mjs',
    claim: "a capture may have whitespace before the call parentheses",
    find: "(new\\s+Date(?![\\w$])(?!\\s*\\(\\s*(?!\\.\\.\\.)[^\\s)])|(?<![\\w$#])fieldDay\\s*\\(\\s*\\)|(?<![\\w$#])fieldToday",
    replace: "(new\\s+Date(?![\\w$])(?!\\s*\\(\\s*(?!\\.\\.\\.)[^\\s)])|(?<![\\w$#])fieldDay\\(\\s*\\)|(?<![\\w$#])fieldToday",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-captures-newdate-single-space',
    file: 'scripts/row-confidence.mjs',
    claim: "a capture may have any whitespace between new and Date",
    find: "(new\\s+Date(?![\\w$])(?!\\s*\\(\\s*(?!\\.\\.\\.)[^\\s)])|(?<![\\w$#])fieldDay\\s*\\(\\s*\\)|(?<![\\w$#])fieldToday",
    replace: "(new Date(?![\\w$])(?!\\s*\\(\\s*(?!\\.\\.\\.)[^\\s)])|(?<![\\w$#])fieldDay\\s*\\(\\s*\\)|(?<![\\w$#])fieldToday",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-captures-greedy',
    file: 'scripts/row-confidence.mjs',
    claim: "two captures on one line are two captures",
    find: "[^\\n\\r\\u2028\\u2029])*?(new\\s+Date",
    replace: "[^\\n\\r\\u2028\\u2029])*(new\\s+Date",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  // A capture is the read itself (2026-11-05): nothing between the `=` and the read may be an arrow, a class, a body or the end of the statement. One entry per thing it refuses.
  {
    id: 'cap-allows-arrow',
    file: 'scripts/row-confidence.mjs',
    claim: "a constant that holds an arrow function is not a capture of the clock, even when the arrow reads it",
    find: "(?!=>|\\bclass\\b",
    replace: "(?!\\bclass\\b",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'cap-allows-class',
    file: 'scripts/row-confidence.mjs',
    claim: "a constant that holds a class is not a capture of the clock, even when a field reads it",
    find: "(?!=>|\\bclass\\b|",
    replace: "(?!=>|",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'cap-allows-a-body',
    file: 'scripts/row-confidence.mjs',
    claim: "a constant that holds a function or a method with a body is not a capture of the clock, even when the body reads it",
    find: "|\\)\\s*\\{|;)[^\\n\\r\\u2028\\u2029])*?",
    replace: "|;)[^\\n\\r\\u2028\\u2029])*?",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'cap-allows-a-statement-end',
    file: 'scripts/row-confidence.mjs',
    claim: "a clock read in the statement after a constant is not a capture of that constant",
    find: "|\\)\\s*\\{|;)[^\\n\\r\\u2028\\u2029])*?",
    replace: "|\\)\\s*\\{)[^\\n\\r\\u2028\\u2029])*?",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'cap-line-ends-at-lf-only',
    file: 'scripts/row-confidence.mjs',
    claim: "a capture's own line ends at a carriage return, U+2028 and U+2029 as well as at a line feed: `const NOW = 1` and a carriage return and `log(new Date())` is a bare read",
    find: "[^\\n\\r\\u2028\\u2029])*?(new\\s+Date",
    replace: "[^\\n])*?(new\\s+Date",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'cap-line-ignores-cr',
    file: 'scripts/row-confidence.mjs',
    claim: "a carriage return ends a capture's line",
    find: "[^\\n\\r\\u2028\\u2029])*?(new\\s+Date",
    replace: "[^\\n\\u2028\\u2029])*?(new\\s+Date",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'cap-line-ignores-u2028',
    file: 'scripts/row-confidence.mjs',
    claim: "U+2028 ends a capture's line",
    find: "[^\\n\\r\\u2028\\u2029])*?(new\\s+Date",
    replace: "[^\\n\\r\\u2029])*?(new\\s+Date",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'cap-line-ignores-u2029',
    file: 'scripts/row-confidence.mjs',
    claim: "U+2029 ends a capture's line",
    find: "[^\\n\\r\\u2028\\u2029])*?(new\\s+Date",
    replace: "[^\\n\\r\\u2028])*?(new\\s+Date",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-forgets-date-now',
    file: 'scripts/row-confidence.mjs',
    claim: "Date.now() is a clock read",
    find: "(?<![\\w$#])Date\\s*\\.\\s*now(?![\\w$])|",
    replace: "",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-now-without-whitespace',
    file: 'scripts/row-confidence.mjs',
    claim: "whitespace around the dot of `Date . now` does not hide the read",
    find: "(?<![\\w$#])Date\\s*\\.\\s*now(?![\\w$])",
    replace: "(?<![\\w$#])Date\\.now(?![\\w$])",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-reads-newdate-single-space',
    file: 'scripts/row-confidence.mjs',
    claim: "new  Date() is a clock read",
    find: "|new\\s+Date(?![\\w$])(?!\\s*\\(\\s*(?!\\.\\.\\.)[^\\s)])|(?<![\\w$#])fieldDay\\s*\\(\\s*\\)|(?<![\\w$#])fieldToday\\s*\\(\\s*\\)|(?<![\\w$#])(?:globalThis|self|window|global)\\s*\\.\\s*Date(?![\\w$])",
    replace: "|new Date(?![\\w$])(?!\\s*\\(\\s*(?!\\.\\.\\.)[^\\s)])|(?<![\\w$#])fieldDay\\s*\\(\\s*\\)|(?<![\\w$#])fieldToday\\s*\\(\\s*\\)|(?<![\\w$#])(?:globalThis|self|window|global)\\s*\\.\\s*Date(?![\\w$])",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-forgets-field-today',
    file: 'scripts/row-confidence.mjs',
    claim: "fieldToday() is a clock read",
    find: "|(?<![\\w$#])fieldDay\\s*\\(\\s*\\)|(?<![\\w$#])fieldToday\\s*\\(\\s*\\)|(?<![\\w$#])(?:globalThis|self|window|global)\\s*\\.\\s*Date(?![\\w$])",
    replace: "|(?<![\\w$#])fieldDay\\s*\\(\\s*\\)|(?<![\\w$#])(?:globalThis|self|window|global)\\s*\\.\\s*Date(?![\\w$])",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-forgets-field-day',
    file: 'scripts/row-confidence.mjs',
    claim: "fieldDay() is a clock read",
    find: "|new\\s+Date(?![\\w$])(?!\\s*\\(\\s*(?!\\.\\.\\.)[^\\s)])|(?<![\\w$#])fieldDay\\s*\\(\\s*\\)|(?<![\\w$#])fieldToday",
    replace: "|new\\s+Date(?![\\w$])(?!\\s*\\(\\s*(?!\\.\\.\\.)[^\\s)])|(?<![\\w$#])fieldToday",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  // What counts as a clock read (2026-11-05, residuals Task 10 item 2): `new Date` with no parentheses, `Date.now` as a value, `Date['now']()`, `Date` passed on or stored, `Date()`. One entry per branch of the read pattern
  // and of the capture pattern that takes the same `new Date` spelling.
  {
    id: 'read-now-call-only',
    file: 'scripts/row-confidence.mjs',
    claim: "`Date.now` taken as a value, not called, is a clock read (`const clock = Date.now` asks for the time later)",
    find: "(?<![\\w$#])Date\\s*\\.\\s*now(?![\\w$])",
    replace: "(?<![\\w$#])Date\\s*\\.\\s*now\\s*\\(\\s*\\)",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'read-now-word-boundary',
    file: 'scripts/row-confidence.mjs',
    claim: "`Date.nowish` is not `Date.now`",
    find: "(?<![\\w$#])Date\\s*\\.\\s*now(?![\\w$])",
    replace: "(?<![\\w$#])Date\\s*\\.\\s*now",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'read-computed-now-dropped',
    file: 'scripts/row-confidence.mjs',
    claim: "`Date['now']()` is a clock read (the key is an empty string by the time the pattern sees it)",
    find: "Date(?![\\w$])(?!\\s*[.:])/g)",
    replace: "Date(?![\\w$])(?!\\s*[.:]|\\s*\\[\\s*'')/g)",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'read-bare-new-date-dropped',
    file: 'scripts/row-confidence.mjs',
    claim: "`new Date` with no parentheses is a clock read",
    find: "|new\\s+Date(?![\\w$])(?!\\s*\\(\\s*(?!\\.\\.\\.)[^\\s)])|(?<![\\w$#])fieldDay\\s*\\(\\s*\\)|(?<![\\w$#])fieldToday\\s*\\(\\s*\\)|(?<![\\w$#])(?:globalThis|self|window|global)\\s*\\.\\s*Date(?![\\w$])",
    replace: "|new\\s+Date\\s*\\(\\s*\\)|(?<![\\w$#])fieldDay\\s*\\(\\s*\\)|(?<![\\w$#])fieldToday\\s*\\(\\s*\\)|(?<![\\w$#])(?:globalThis|self|window|global)\\s*\\.\\s*Date(?![\\w$])",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'read-new-date-with-args',
    file: 'scripts/row-confidence.mjs',
    claim: "`new Date(5)` builds a date from its argument and is not a clock read",
    find: "|new\\s+Date(?![\\w$])(?!\\s*\\(\\s*(?!\\.\\.\\.)[^\\s)])|(?<![\\w$#])fieldDay\\s*\\(\\s*\\)|(?<![\\w$#])fieldToday\\s*\\(\\s*\\)|(?<![\\w$#])(?:globalThis|self|window|global)\\s*\\.\\s*Date(?![\\w$])",
    replace: "|new\\s+Date(?![\\w$])|(?<![\\w$#])fieldDay\\s*\\(\\s*\\)|(?<![\\w$#])fieldToday\\s*\\(\\s*\\)|(?<![\\w$#])(?:globalThis|self|window|global)\\s*\\.\\s*Date(?![\\w$])",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'read-new-date-word-boundary',
    file: 'scripts/row-confidence.mjs',
    claim: "`new DateTimeFormat()` is not `new Date`",
    find: "|new\\s+Date(?![\\w$])(?!\\s*\\(\\s*(?!\\.\\.\\.)[^\\s)])|(?<![\\w$#])fieldDay",
    replace: "|new\\s+Date(?!\\s*\\(\\s*(?!\\.\\.\\.)[^\\s)])|(?<![\\w$#])fieldDay",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'read-alias-dropped',
    file: 'scripts/row-confidence.mjs',
    claim: "a bare `Date` that is stored or passed on (`const D = Date`, `f(Date)`, `{ Date }`) is a clock read: the time can be asked of it under another name",
    find: "|(?<![\\w$#])(?<!(?<!\\.\\.)\\.\\s*)(?<!\\b(?:new|instanceof|typeof)\\s+)Date(?![\\w$])(?!\\s*[.:])/g) ?? []",
    replace: "/g) ?? []",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'read-alias-counts-property',
    file: 'scripts/row-confidence.mjs',
    claim: "`o.Date` is a property, not the global",
    find: "(?<![\\w$#])(?<!(?<!\\.\\.)\\.\\s*)(?<!\\b(?:new",
    replace: "(?<![\\w$#])(?<!\\b(?:new",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'read-alias-counts-new',
    file: 'scripts/row-confidence.mjs',
    claim: "the `Date` of `new Date(5)` is not a second read",
    find: "(?<!\\b(?:new|instanceof|typeof)\\s+)Date(?![\\w$])",
    replace: "(?<!\\b(?:instanceof|typeof)\\s+)Date(?![\\w$])",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'read-alias-counts-instanceof',
    file: 'scripts/row-confidence.mjs',
    claim: "`x instanceof Date` is a type test, not a read",
    find: "(?<!\\b(?:new|instanceof|typeof)\\s+)Date(?![\\w$])",
    replace: "(?<!\\b(?:new|typeof)\\s+)Date(?![\\w$])",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'read-alias-counts-typeof',
    file: 'scripts/row-confidence.mjs',
    claim: "`typeof Date` is a type test, not a read",
    find: "(?<!\\b(?:new|instanceof|typeof)\\s+)Date(?![\\w$])",
    replace: "(?<!\\b(?:new|instanceof)\\s+)Date(?![\\w$])",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'read-alias-counts-longer-names',
    file: 'scripts/row-confidence.mjs',
    claim: "`DateFormatter` and `Dates` are other names",
    find: "Date(?![\\w$])(?!\\s*[.:])/g)",
    replace: "Date(?!\\s*[.:])/g)",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'read-alias-counts-member',
    file: 'scripts/row-confidence.mjs',
    claim: "`Date.UTC(1)` reads no clock",
    find: "Date(?![\\w$])(?!\\s*[.:])/g)",
    replace: "Date(?![\\w$])(?!\\s*[:])/g)",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'read-alias-counts-computed',
    file: 'scripts/row-confidence.mjs',
    claim: "a computed member of Date is a read, whatever its key: `Date['UTC'](1)`, `Date['now']` and `Date[k]()` (the key is an empty string by the time the pattern sees it)",
    find: "Date(?![\\w$])(?!\\s*[.:])/g)",
    replace: "Date(?![\\w$])(?!\\s*[.\\[:])/g)",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'read-alias-counts-key',
    file: 'scripts/row-confidence.mjs',
    claim: "a `{ Date: 1 }` key is not a read",
    find: "Date(?![\\w$])(?!\\s*[.:])/g)",
    replace: "Date(?![\\w$])(?!\\s*[.])/g)",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'read-alias-counts-call',
    file: 'scripts/row-confidence.mjs',
    claim: "`Date()` and `Date(5)` return the current time whatever they are given, so they are reads",
    find: "Date(?![\\w$])(?!\\s*[.:])/g)",
    replace: "Date(?![\\w$])(?!\\s*[.:(])/g)",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'read-now-no-left-boundary',
    file: 'scripts/row-confidence.mjs',
    claim: "a name that ends in Date is not the global: `MyDate.now()`, `LocalDate.now()` and `$Date.now()` read no clock",
    find: "(?<![\\w$#])Date\\s*\\.\\s*now(?![\\w$])",
    replace: "Date\\s*\\.\\s*now(?![\\w$])",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'read-now-boundary-no-dollar',
    file: 'scripts/row-confidence.mjs',
    claim: "`$Date.now()` is a name that ends in Date, not the global",
    find: "(?<![\\w$#])Date\\s*\\.\\s*now(?![\\w$])",
    replace: "(?<![\\w#])Date\\s*\\.\\s*now(?![\\w$])",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'read-now-boundary-no-hash',
    file: 'scripts/row-confidence.mjs',
    claim: "`this.#Date.now()` calls `now` on a private field named Date, not on the global",
    find: "(?<![\\w$#])Date\\s*\\.\\s*now(?![\\w$])",
    replace: "(?<![\\w$])Date\\s*\\.\\s*now(?![\\w$])",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'read-now-boundary-no-word',
    file: 'scripts/row-confidence.mjs',
    claim: "`MyDate.now()` and `LocalDate.now()` are names that end in Date, not the global",
    find: "(?<![\\w$#])Date\\s*\\.\\s*now(?![\\w$])",
    replace: "(?<![$#])Date\\s*\\.\\s*now(?![\\w$])",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'read-fieldday-no-left-boundary',
    file: 'scripts/row-confidence.mjs',
    claim: "`xfieldDay()` is a call of another function, not of the zone-aware reader",
    find: "|(?<![\\w$#])fieldDay\\s*\\(\\s*\\)|(?<![\\w$#])fieldToday\\s*\\(\\s*\\)|(?<![\\w$#])(?:globalThis|self|window|global)\\s*\\.\\s*Date(?![\\w$])",
    replace: "|fieldDay\\s*\\(\\s*\\)|(?<![\\w$#])fieldToday\\s*\\(\\s*\\)|(?<![\\w$#])(?:globalThis|self|window|global)\\s*\\.\\s*Date(?![\\w$])",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'read-fieldtoday-no-left-boundary',
    file: 'scripts/row-confidence.mjs',
    claim: "`xfieldToday()` is a call of another function, not of the zone-aware reader",
    find: "|(?<![\\w$#])fieldDay\\s*\\(\\s*\\)|(?<![\\w$#])fieldToday\\s*\\(\\s*\\)|(?<![\\w$#])(?:globalThis|self|window|global)\\s*\\.\\s*Date(?![\\w$])",
    replace: "|(?<![\\w$#])fieldDay\\s*\\(\\s*\\)|fieldToday\\s*\\(\\s*\\)|(?<![\\w$#])(?:globalThis|self|window|global)\\s*\\.\\s*Date(?![\\w$])",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'cap-fieldday-no-left-boundary',
    file: 'scripts/row-confidence.mjs',
    claim: "a constant that holds `xfieldDay()` holds no clock read, so it is not a capture (a capture that is not a read would hide a bare read elsewhere)",
    find: "(new\\s+Date(?![\\w$])(?!\\s*\\(\\s*(?!\\.\\.\\.)[^\\s)])|(?<![\\w$#])fieldDay\\s*\\(\\s*\\)|(?<![\\w$#])fieldToday",
    replace: "(new\\s+Date(?![\\w$])(?!\\s*\\(\\s*(?!\\.\\.\\.)[^\\s)])|fieldDay\\s*\\(\\s*\\)|(?<![\\w$#])fieldToday",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'cap-fieldtoday-no-left-boundary',
    file: 'scripts/row-confidence.mjs',
    claim: "a constant that holds `xfieldToday()` holds no clock read, so it is not a capture",
    find: "(new\\s+Date(?![\\w$])(?!\\s*\\(\\s*(?!\\.\\.\\.)[^\\s)])|(?<![\\w$#])fieldDay\\s*\\(\\s*\\)|(?<![\\w$#])fieldToday",
    replace: "(new\\s+Date(?![\\w$])(?!\\s*\\(\\s*(?!\\.\\.\\.)[^\\s)])|(?<![\\w$#])fieldDay\\s*\\(\\s*\\)|fieldToday",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'read-alias-skips-no-space-after-dot',
    file: 'scripts/row-confidence.mjs',
    claim: "`o. Date` and `o.<newline>Date` are properties: a dot, then white space, then Date is member access",
    find: "(?<!(?<!\\.\\.)\\.\\s*)",
    replace: "(?<!(?<!\\.\\.)\\.)",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'read-alias-spread-is-member-access',
    file: 'scripts/row-confidence.mjs',
    claim: "`f(...Date)` passes the global on: a spread is not member access",
    find: "(?<!(?<!\\.\\.)\\.\\s*)",
    replace: "(?<!\\.\\s*)",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'read-alias-counts-private',
    file: 'scripts/row-confidence.mjs',
    claim: "`this.#Date` is a private name, not the global",
    find: "(?<![\\w$#])(?<!(?<!\\.\\.)\\.\\s*)",
    replace: "(?<![\\w$])(?<!(?<!\\.\\.)\\.\\s*)",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'read-alias-counts-dollar-names',
    file: 'scripts/row-confidence.mjs',
    claim: "`$Date` is a name that ends in Date, not the global",
    find: "(?<![\\w$#])(?<!(?<!\\.\\.)\\.\\s*)",
    replace: "(?<![\\w#])(?<!(?<!\\.\\.)\\.\\s*)",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'read-alias-counts-word-names',
    file: 'scripts/row-confidence.mjs',
    claim: "`MyDate` is a name that ends in Date, not the global",
    find: "(?<![\\w$#])(?<!(?<!\\.\\.)\\.\\s*)",
    replace: "(?<![$#])(?<!(?<!\\.\\.)\\.\\s*)",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'read-global-alias-dropped',
    file: 'scripts/row-confidence.mjs',
    claim: "the global reached through an object is a clock read: `new globalThis.Date()`, `const D = globalThis.Date` (the time can then be asked of D), `window.Date`",
    find: "|(?<![\\w$#])(?:globalThis|self|window|global)\\s*\\.\\s*Date(?![\\w$])",
    replace: "",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'read-global-alias-no-globalthis',
    file: 'scripts/row-confidence.mjs',
    claim: "`globalThis.Date` is the global",
    find: "(?:globalThis|self|window|global)",
    replace: "(?:self|window|global)",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'read-global-alias-no-self',
    file: 'scripts/row-confidence.mjs',
    claim: "`self.Date` is the global",
    find: "(?:globalThis|self|window|global)",
    replace: "(?:globalThis|window|global)",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'read-global-alias-no-window',
    file: 'scripts/row-confidence.mjs',
    claim: "`window.Date` is the global",
    find: "(?:globalThis|self|window|global)",
    replace: "(?:globalThis|self|global)",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'read-global-alias-no-global',
    file: 'scripts/row-confidence.mjs',
    claim: "`global.Date` is the global",
    find: "(?:globalThis|self|window|global)",
    replace: "(?:globalThis|self|window)",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'read-global-alias-no-left-boundary',
    file: 'scripts/row-confidence.mjs',
    claim: "`xglobalThis.Date` is a property of another name, not the global",
    find: "(?<![\\w$#])(?:globalThis|self|window|global)\\s*\\.\\s*Date(?![\\w$])",
    replace: "(?:globalThis|self|window|global)\\s*\\.\\s*Date(?![\\w$])",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'read-global-alias-word-boundary',
    file: 'scripts/row-confidence.mjs',
    claim: "`globalThis.Dates` is another name, not the global's Date",
    find: "(?:globalThis|self|window|global)\\s*\\.\\s*Date(?![\\w$])",
    replace: "(?:globalThis|self|window|global)\\s*\\.\\s*Date",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'read-global-alias-whitespace',
    file: 'scripts/row-confidence.mjs',
    claim: "whitespace around the dot of `globalThis . Date` does not hide the read",
    find: "(?:globalThis|self|window|global)\\s*\\.\\s*Date(?![\\w$])",
    replace: "(?:globalThis|self|window|global)\\.Date(?![\\w$])",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'read-new-date-spread-is-an-argument',
    file: 'scripts/row-confidence.mjs',
    claim: "`new Date(...[])` may be empty, so it may read the clock: a spread is not an argument that builds a date",
    find: "|new\\s+Date(?![\\w$])(?!\\s*\\(\\s*(?!\\.\\.\\.)[^\\s)])|(?<![\\w$#])fieldDay\\s*\\(\\s*\\)|(?<![\\w$#])fieldToday\\s*\\(\\s*\\)",
    replace: "|new\\s+Date(?![\\w$])(?!\\s*\\(\\s*[^\\s)])|(?<![\\w$#])fieldDay\\s*\\(\\s*\\)|(?<![\\w$#])fieldToday\\s*\\(\\s*\\)",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'cap-new-date-spread-is-an-argument',
    file: 'scripts/row-confidence.mjs',
    claim: "a constant that holds `new Date(...[])` may hold a clock read, so it is a capture (a capture is always also a read)",
    find: "(new\\s+Date(?![\\w$])(?!\\s*\\(\\s*(?!\\.\\.\\.)[^\\s)])|(?<![\\w$#])fieldDay\\s*\\(\\s*\\)|(?<![\\w$#])fieldToday",
    replace: "(new\\s+Date(?![\\w$])(?!\\s*\\(\\s*[^\\s)])|(?<![\\w$#])fieldDay\\s*\\(\\s*\\)|(?<![\\w$#])fieldToday",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'cap-bare-new-date-not-a-capture',
    file: 'scripts/row-confidence.mjs',
    claim: "a constant holding `new Date` with no parentheses is a capture (the capture takes the same spelling the read does)",
    find: "(new\\s+Date(?![\\w$])(?!\\s*\\(\\s*(?!\\.\\.\\.)[^\\s)])|(?<![\\w$#])fieldDay\\s*\\(\\s*\\)|(?<![\\w$#])fieldToday",
    replace: "(new\\s+Date\\s*\\(\\s*\\)|(?<![\\w$#])fieldDay\\s*\\(\\s*\\)|(?<![\\w$#])fieldToday",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'cap-new-date-with-args',
    file: 'scripts/row-confidence.mjs',
    claim: "a constant holding `new Date(5)` holds no clock read, so it is not a capture (a capture that is not a read would hide a bare read elsewhere)",
    find: "(new\\s+Date(?![\\w$])(?!\\s*\\(\\s*(?!\\.\\.\\.)[^\\s)])|(?<![\\w$#])fieldDay\\s*\\(\\s*\\)|(?<![\\w$#])fieldToday",
    replace: "(new\\s+Date(?![\\w$])|(?<![\\w$#])fieldDay\\s*\\(\\s*\\)|(?<![\\w$#])fieldToday",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'cap-new-date-word-boundary',
    file: 'scripts/row-confidence.mjs',
    claim: "a constant holding `new DateTimeFormat()` is not a capture",
    find: "(new\\s+Date(?![\\w$])(?!\\s*\\(\\s*(?!\\.\\.\\.)[^\\s)])|(?<![\\w$#])fieldDay\\s*\\(\\s*\\)|(?<![\\w$#])fieldToday",
    replace: "(new\\s+Date(?!\\s*\\(\\s*(?!\\.\\.\\.)[^\\s)])|(?<![\\w$#])fieldDay\\s*\\(\\s*\\)|(?<![\\w$#])fieldToday",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-ends-a-regex-class-at-a-slash',
    file: 'scripts/strip-non-code.mjs',
    claim: "a slash inside a regular expression's character class does not end it",
    find: "          else if (r === '/' && !inClass) break",
    replace: "          else if (r === '/') break",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-skips-no-template-expressions',
    file: 'scripts/strip-non-code.mjs',
    claim: "a template literal's expressions are scanned for where they end",
    find: "      if (c === '$' && src[i + 1] === '{') {",
    replace: "      if (false) {",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-forgets-template-braces',
    file: 'scripts/strip-non-code.mjs',
    claim: "braces inside a template expression are counted",
    find: "        if (c === '{') depth++",
    replace: "        if (c === '{') depth += 0",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-ignores-template-escapes',
    file: 'scripts/strip-non-code.mjs',
    claim: "an escaped backtick does not end a template",
    find: "      if (c === '\\\\') { i += 2; continue }",
    replace: "      if (false) { i += 2; continue }",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  // Template expressions are code (2026-11-05). The scan keeps each `${...}` of a template as an operand in parentheses and still hides the template text, so a clock read inside a template is
  // counted and the first slash in one begins a regular expression whatever stood before the template. One entry per half of what it emits, and one for putting the old behaviour back.
  {
    id: 'tpl-expression-hidden',
    file: 'scripts/strip-non-code.mjs',
    claim: "a clock read inside a template expression is counted, as a read in any other code is",
    find: "        out += ' ('\n        i = scanCode(i + 2, true)\n        out += ') '\n",
    replace: "        const kept = out\n        i = scanCode(i + 2, true)\n        out = kept\n",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'tpl-expression-opens-no-operand',
    file: 'scripts/strip-non-code.mjs',
    claim: "a slash that begins a template expression begins a regular expression, whatever stood before the template (a tag, a parenthesis, a bracket, a word)",
    find: "        out += ' ('\n",
    replace: "        out += ' '\n",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'tpl-expression-closes-nothing',
    file: 'scripts/strip-non-code.mjs',
    claim: "a template expression is kept between parentheses that pair, so the text left of a template has balanced brackets",
    find: "        out += ') '\n",
    replace: "        out += ' '\n",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  // The bracket count over every script a row names (2026-11-05). `stripNonCode` is checked against fixtures above; this is the check that needs none: what it leaves of a real script must pair its
  // brackets, and it carries three controls the old three-regular-expression scan fails. One entry per kind of bracket and per direction, so a counter blind to any one of the six is caught.
  {
    id: 'balance-detector-blind-to-parens',
    file: 'scripts/row-confidence.mjs',
    claim: "the bracket-balance clause over the scripts a row names counts a closing parenthesis",
    find: "else if (ch === ')') delta['(']--",
    replace: "else if (ch === ')') delta['('] += 0",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'balance-detector-blind-to-braces',
    file: 'scripts/row-confidence.mjs',
    claim: "the bracket-balance clause over the scripts a row names counts a closing brace",
    find: "else if (ch === '}') delta['{']--",
    replace: "else if (ch === '}') delta['{'] += 0",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'balance-detector-blind-to-brackets',
    file: 'scripts/row-confidence.mjs',
    claim: "the bracket-balance clause over the scripts a row names counts a closing square bracket",
    find: "else if (ch === ']') delta['[']--",
    replace: "else if (ch === ']') delta['['] += 0",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'balance-detector-blind-to-opening-parens',
    file: 'scripts/row-confidence.mjs',
    claim: "the bracket-balance clause over the scripts a row names counts an opening parenthesis",
    find: "if (ch in delta) delta[ch]++",
    replace: "if (ch in delta && ch !== '(') delta[ch]++",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'balance-detector-blind-to-opening-braces',
    file: 'scripts/row-confidence.mjs',
    claim: "the bracket-balance clause over the scripts a row names counts an opening brace",
    find: "if (ch in delta) delta[ch]++",
    replace: "if (ch in delta && ch !== '{') delta[ch]++",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'balance-detector-blind-to-opening-brackets',
    file: 'scripts/row-confidence.mjs',
    claim: "the bracket-balance clause over the scripts a row names counts an opening square bracket",
    find: "if (ch in delta) delta[ch]++",
    replace: "if (ch in delta && ch !== '[') delta[ch]++",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'balance-loop-skips-the-scripts',
    file: 'scripts/row-confidence.mjs',
    claim: "the bracket-balance clause over the scripts a row names checks every script it names, not only its controls",
    find: "for (const s of reached) {",
    replace: "for (const s of []) {",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'balance-reads-half-a-script',
    file: 'scripts/row-confidence.mjs',
    claim: "the bracket-balance clause over the scripts a row names reads each script whole",
    find: "left = stripNonCode(readFileSync(s, 'utf8'))",
    replace: "left = stripNonCode(readFileSync(s, 'utf8').slice(0, 4000))",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },

  {
    // The same claim, aimed at GENERATED source, because that is where it
    // stopped being true. `unused-check.mjs` treats every .mjs in scripts/ as a
    // possible reader, and `generate-scouting.mjs` contains the F# it emits as
    // a string literal — so the generator credited itself with reading every
    // value it wrote, and the row went green over five real orphans in
    // Scouting.fs (`abbrOf`, `tierOf`, `nameOf`, `umpWatch`, `tryPark`).
    //
    // Without this mutation the fix is a claim. With it, deleting the exclusion
    // makes a row fail.
    // The teeth for the `generated source matches its generator` row. A hand
    // edit to a park factor is the failure that row exists for: the compiler
    // accepts it, every other row stays green, and the page shows a number that
    // is no longer production's.
    //
    // 128 -> 999 rather than a plausible number on purpose. A mutation that
    // could pass for real data would make a survivor hard to tell from a
    // legitimate table update.
    // The regression this whole alias table exists to prevent: exact-label-only
    // matching, which silently drops the PARK row for every payload that uses a
    // different name for the same stadium. It shipped that way, and the
    // counterexample was already sitting in a fixture this repo had read.
    // Production's Gap 2 as a mutation. `if (hT && aT)` drops BOTH records when
    // one team's lookup misses; the F# shape makes a half-populated line
    // unbuildable because RecordsRow carries both sides in one case. This makes
    // the record optional, which is the door that bug came through.
    // The expiring-fixture bug, restored. pickem-check pinned its slate to the
    // literal '2026-08-12' with a comment calling it "deliberately a future
    // date" — true when written, false at midnight ET on the 13th, at which
    // point three of its checks began asserting about game states the page can
    // no longer be in and main went red with nothing in the diff to explain it.
    //
    // A fixed past date is what the mutation puts back, so the derivation from
    // the FIELD day is defended rather than merely described.
    id: 'pickem-date-pinned-to-the-past',
    file: 'scripts/pickem-check.mjs',
    claim: "the pick'em slate is always in the future, so nothing is swept to Final",
    find: 'const DATE = (() => {',
    replace: "const DATE = '2026-08-12'\nconst _unusedDate = (() => {",
    expect: 'node scripts/run-row.mjs "pick\'em grades only finished games"',
  },
  {
    id: 'pickem-reads-the-day-inside-a-template',
    file: 'scripts/pickem-check.mjs',
    claim: "the pick'em check takes the FIELD day once, into a constant, and not again inside a template where a read is easy to miss",
    find: "const d = new Date(`${FIELD_DAY}T12:00:00Z`)",
    replace: "const d = new Date(`${fieldDay()}T12:00:00Z`)",
    expect: 'node scripts/run-row.mjs "every gate row has teeth and is deterministic"',
  },
  {
    id: 'record-becomes-optional',
    file: 'src/Schedule.fs',
    claim: 'a side without a record does not decode, so no half-line can be built',
    find: '          Record = get.Required.Field "leagueRecord" recordDecoder',
    replace: '          Record = get.Optional.Field "leagueRecord" recordDecoder |> Option.defaultValue { Wins = 0; Losses = 0; Ties = 0 }',
    expect: 'node scripts/run-row.mjs "the F# harness refuses a check with no counterexample"',
  },
  {
    // The wire shape. A decoder proven only against the flattened fixture
    // passes every offline check and fails on the first live call — the venue
    // lookup's exact failure, one file later.
    id: 'live-envelope-unhandled',
    file: 'src/Schedule.fs',
    claim: "the live dates[].games envelope decodes, not just the recorded fixture's flat shape",
    find: '          Decode.field "dates" (Decode.list (Decode.field "games" (Decode.list gameDecoder)))\n          |> Decode.map List.concat ]',
    replace: '          Decode.fail "nested envelope not handled" ]',
    expect: 'node scripts/run-row.mjs "the F# harness refuses a check with no counterexample"',
  },
  {
    // A blank starter renders as a labelled row with nothing in it, which a
    // reader cannot tell from a real one.
    id: 'blank-pitcher-name-accepted',
    file: 'src/Schedule.fs',
    claim: 'an empty probable-pitcher name is refused rather than rendered blank',
    find: '        if name.Trim() = "" then Decode.fail "probablePitcher.fullName is empty"',
    replace: '        if false then Decode.fail "probablePitcher.fullName is empty"',
    expect: 'node scripts/run-row.mjs "the F# harness refuses a check with no counterexample"',
  },
  {
    id: 'alias-table-bypassed',
    file: 'src/Scouting.fs',
    claim: 'a venue name that differs from the park table label still finds its park',
    find: '    parkAliases\n    |> List.tryFind (fun (alias, _) -> alias = venue)\n    |> Option.bind (fun (_, label) -> parkFactors |> List.tryFind (fun p -> p.Venue = label))',
    replace: '    parkFactors |> List.tryFind (fun p -> p.Venue = venue)',
    expect: 'node scripts/run-row.mjs "the F# harness refuses a check with no counterexample"',
  },
  {
    // The other direction, and the more dangerous one. Substring resolution
    // would make every alias check above pass while putting one stadium's run
    // factor on another stadium's game. Exactness is the claim, so exactness
    // needs its own mutation.
    id: 'alias-resolution-becomes-substring',
    file: 'src/Scouting.fs',
    claim: 'venue resolution is exact, never a contains',
    find: '    |> List.tryFind (fun (alias, _) -> alias = venue)',
    replace: '    |> List.tryFind (fun (alias, _) -> venue.Contains alias)',
    expect: 'node scripts/run-row.mjs "the F# harness refuses a check with no counterexample"',
  },
  {
    // The generator's own guard against a known-gaps list that has quietly
    // stopped being true. Listing a park that IS reachable must stop the build,
    // or the list decays into a comment that lies.
    id: 'stale-gap-list-tolerated',
    file: 'scripts/generate-scouting.mjs',
    claim: 'a known-gaps entry that is no longer true stops the build',
    find: "  'Truist Park': 'not in production\\'s VENUE_COORDS at all',",
    replace: "  'Truist Park': 'not in production\\'s VENUE_COORDS at all',\n  'Fenway Park': 'deliberately wrong, to prove the stale check fires',",
    expect: 'node scripts/run-row.mjs "generated source matches its generator and data"',
  },
  {
    id: 'generated-table-hand-edited',
    file: 'src/Scouting.fs',
    claim: "a hand edit to generated source is caught, not silently carried",
    find: 'park "Coors Field" 128 130 ExtremeHittersPark',
    replace: 'park "Coors Field" 999 130 ExtremeHittersPark',
    expect: 'node scripts/run-row.mjs "generated source matches its generator and data"',
  },
  {
    id: 'generated-value-never-read',
    file: 'src/Scouting.fs',
    claim: 'a public value nothing reads is caught even in generated source',
    find: 'let venueOf (p: ParkFactor) : string = p.Venue',
    replace: 'let venueOf (p: ParkFactor) : string = p.Venue\n\nlet unreadGeneratedValue (x: int) = x + 1',
    expect: 'node scripts/run-row.mjs "no value is written without being read back"',
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
    // Done condition 7 of docs/CC-CMD-2026-10-10-schedule-path-respects-verify.md.
    // An unreadable verify verdict must NEVER deploy. If this survives, the
    // gate is asserting that red stops a deploy and nothing more — and the
    // dangerous case is not red, which is loud, but unknown, which is quiet:
    // a verdict nobody could read, waved through hourly, looks exactly like a
    // healthy site.
    id: 'unreadable-verdict-treated-as-go',
    file: 'scripts/deploy-gate.mjs',
    claim: 'an unreadable verify verdict does not deploy',
    find: "    default:\n      return {\n        proceed: false,",
    replace: "    default:\n      return {\n        proceed: true,",
    expect: 'node scripts/deploy-gate.mjs --self-test',
  },

  {
    // The other half of the same distinction: in-flight is a SKIP, not a go.
    // A verify still running says nothing about the code yet.
    id: 'in-flight-verdict-treated-as-go',
    file: 'scripts/deploy-gate.mjs',
    claim: 'a verify still in flight does not deploy',
    find: "    case 'in-flight':\n      return {\n        proceed: false,",
    replace: "    case 'in-flight':\n      return {\n        proceed: true,",
    expect: 'node scripts/deploy-gate.mjs --self-test',
  },

  {
    // The keystone. Drop one glob from verify.yml and the gate starts asking
    // about commits verify never ran on — silently, because a missing run
    // reads as "unknown" and the deploy just stops.
    id: 'ignore-parity-drifts-unnoticed',
    file: 'scripts/deployable.mjs',
    claim: 'isIgnored and verify.yml paths-ignore are checked for divergence',
    find: "export const isIgnored = f => f.startsWith('docs/') || f.startsWith('outbox/') || f.endsWith('.md')",
    replace: "export const isIgnored = f => f.startsWith('docs/') || f.endsWith('.md')",
    expect: 'node scripts/check-ignore-parity.mjs',
  },
  {
    // Rule 90, and the ONE mutation docs/CC-CMD-2026-10-10-red-verdict-carries-its-step.md
    // names: the unreadable state must not render as a zero. If this survives,
    // status-verdict-check.mjs is asserting the TEMPLATE rather than the
    // distinction between "nothing was skipped behind it" and "I could not
    // tell" — and that distinction is the entire reason the step summary was
    // carried into the verdict at all.
    id: 'unreadable-step-list-renders-as-zero',
    file: 'scripts/status.mjs',
    claim: 'an unreadable step list says so, and never prints a skip count of zero',
    find: "  if (summary === null) return ' \u2014 failing step unknown: the run\\'s steps could not be read'",
    replace: "  if (summary === null) return ' \u2014 0 of 0 steps did not run behind it'",
    expect: 'node scripts/status-verdict-check.mjs',
  },
  {
    // The annotation channel is now how every other check's failure reason
    // reaches a reader who cannot fetch run logs. Escaping `%` AFTER the
    // newline turns the `%0A` just introduced into `%250A`, so the reader sees
    // a literal "%0A" instead of a line break — the detail is still there and
    // is no longer what it says. If this survives, the escaping order is
    // asserted nowhere and the subtlest way to corrupt the channel is open.
    id: 'annotation-escapes-percent-last',
    file: 'scripts/checks.mjs',
    claim: 'the annotation escaper replaces % first, before the %0A it introduces',
    find: "  String(s).replace(/%/g, '%25').replace(/\\r/g, '%0D').replace(/\\n/g, '%0A')",
    replace: "  String(s).replace(/\\r/g, '%0D').replace(/\\n/g, '%0A').replace(/%/g, '%25')",
    expect: 'node scripts/checks.mjs --self-test',
  },

  {
    // A colon separates an annotation's properties, so a check name containing
    // one truncates the title and takes the message with it. Every check name
    // in this repo is prose and several contain colons.
    id: 'annotation-prop-keeps-its-colon',
    file: 'scripts/checks.mjs',
    claim: 'a colon in a check name is escaped before it becomes an annotation property',
    find: "  escapeAnnotationData(s).replace(/:/g, '%3A').replace(/,/g, '%2C')",
    replace: "  escapeAnnotationData(s).replace(/,/g, '%2C')",
    expect: 'node scripts/checks.mjs --self-test',
  },

  {
    // THE SAME RULE, TURNED ON THIS FILE. `gate-day-per-row` above pins the
    // gate's own day; nothing pinned the harness's. 901f00e added the baseline
    // artifact with a bare `new Date()` in its object literal, row-confidence
    // flagged the clock read, "breaking each invariant makes a check fail"
    // dropped 100 -> 70, and verify was red for four days — on the commit whose
    // purpose was making this very baseline readable.
    //
    // expect is `row-confidence.mjs` and NOT `run-row.mjs`: this row's own
    // command is the 83-mutation suite, so run-row either takes its verdict
    // from the last full gate run or costs fifty minutes. Neither can fail for
    // the reason this mutation exists. The scorer runs in a second and drops the
    // row directly.
    id: 'harness-reads-the-clock-twice',
    file: 'scripts/mutation-check.mjs',
    claim: "the harness captures each clock read into a constant, so the scorer's own row stays at 100",
    find: "writeFileSync('outbox/mutation-baseline-latest.json', JSON.stringify({\n    at: BASELINE_AT.toISOString(),",
    replace: "writeFileSync('outbox/mutation-baseline-latest.json', JSON.stringify({\n    at: new Date().toISOString(),",
    expect: 'node scripts/row-confidence.mjs',
  },
  // The same file, asked of the self-test (2026-11-05): the clause that stands on the harness no longer counts how many reads it has, so each way it can fail has its own entry.
  {
    id: 'harness-reads-the-clock-twice-by-hand',
    file: 'scripts/mutation-check.mjs',
    claim: "a second, bare clock read in the harness is seen by the scanner's own self-test, not only by the scored row",
    find: "writeFileSync('outbox/mutation-baseline-latest.json', JSON.stringify({\n    at: BASELINE_AT.toISOString(),",
    replace: "writeFileSync('outbox/mutation-baseline-latest.json', JSON.stringify({\n    at: new Date().toISOString(),",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'harness-anchor-renamed',
    file: 'scripts/mutation-check.mjs',
    claim: "the place the harness clause splices its bare read at is asserted to be there, so a respelled anchor is a named failure and not a pass",
    find: "\nconst applyMutation = ",
    replace: "\nconst applyMutation  = ",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'harness-bare-read-after-the-table-unseen',
    file: 'scripts/row-confidence.mjs',
    claim: "the harness clause puts a bare read at its anchor and requires one more read than before",
    find: "harness.slice(0, spliceIndex) + '\\nDate.now()' + harness.slice(spliceIndex)",
    replace: "harness.slice(0, spliceIndex) + '\\n' + harness.slice(spliceIndex)",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'harness-first-capture-hidden',
    file: 'scripts/mutation-check.mjs',
    claim: "a bare clock read put before the harness's first capture is seen: nothing between the end of its table and its captures hides the scan's place from the scorer (the single probe at the end of the table did not reach this far)",
    find: "\nconst RUN_STARTED_AT = new Date()",
    replace: "\n/*\nconst RUN_STARTED_AT = new Date()",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'harness-second-capture-hidden',
    file: 'scripts/mutation-check.mjs',
    claim: "a bare clock read put before the harness's second capture is seen",
    find: "\nconst BASELINE_AT = new Date()",
    replace: "\n/*\nconst BASELINE_AT = new Date()",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'harness-end-of-text-hidden',
    file: 'scripts/mutation-check.mjs',
    claim: "a bare clock read put at the end of the harness is seen: nothing at the end of the text hides the scan's place from the scorer",
    find: "\nfinish(summarize())\n",
    replace: "\n/*\nfinish(summarize())\n",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },

  // The network half of the determinism scan (2026-11-05). It used to look for a URL in the text left after strings and comments were removed, and could not fire; it looks for the callee now (fetch,
  // new WebSocket, https.request, net.connect, sendBeacon), and a script that has one is an objection of its row unless the table of exemptions names it for THAT row and the row's own text does not
  // pass the flag that is its only way there. One entry per branch of the detector and of the exemption; the six that change a row declaration or the table of the real tree expect the row, the rest expect the self-test.
  {
    id: 'row-scan-network-detector-off',
    file: 'scripts/row-confidence.mjs',
    claim: "the scan reports the network use it finds",
    find: "network: networkUses(code) }",
    replace: "network: [] }",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-network-never-flagged',
    file: 'scripts/row-confidence.mjs',
    claim: "a script that reaches the network is an objection of its row",
    find: "    if (network.length > 0) flagged.push(...networkObjections(s, network, row))",
    replace: "    if (false) flagged.push(...networkObjections(s, network, row))",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-fetch-not-seen',
    file: 'scripts/row-confidence.mjs',
    claim: "a call of fetch is network use",
    find: "  [/(?<!\\b(?:function(?:\\s*\\*)?|const|let|var)\\s+)(?<![\\w$])(?<!\\.\\s*)fetch(?![\\w$])(?!\\s*:)(?!\\s*=(?!=))(?![ \\t]*\\((?:[^()]|\\([^()]*\\))*\\)[ \\t]*\\{)/g, 'fetch'],",
    replace: "  [/(?!)/g, 'fetch'],",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-fetch-seen-as-a-property',
    file: 'scripts/row-confidence.mjs',
    claim: "a property named fetch (o.fetch(x), o . fetch(x)) is not network use",
    find: "(?<![\\w$])(?<!\\.\\s*)fetch(?![\\w$])(?!\\s*:)",
    replace: "(?<![\\w$])fetch(?![\\w$])(?!\\s*:)",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-fetch-key-seen-as-a-call',
    file: 'scripts/row-confidence.mjs',
    claim: "a key named fetch ({ fetch: 1 }) is not network use",
    find: "(?!\\s*:)(?!\\s*=(?!=))",
    replace: "(?!\\s*=(?!=))",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-fetch-prefix-seen',
    file: 'scripts/row-confidence.mjs',
    claim: "a longer name that starts with fetch (fetchImpl) is not network use",
    find: "fetch(?![\\w$])(?!\\s*:)",
    replace: "fetch(?!\\s*:)",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-fetch-after-a-word-seen',
    file: 'scripts/row-confidence.mjs',
    claim: "a longer name that ends with fetch (refetch, $fetch) is not network use",
    find: "(?<![\\w$])(?<!\\.\\s*)fetch(?",
    replace: "(?<!\\.\\s*)fetch(?",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-global-fetch-not-seen',
    file: 'scripts/row-confidence.mjs',
    claim: "globalThis.fetch is network use",
    find: "  [/(?<![\\w$])(?<!\\.\\s*)(?:globalThis|window|self|global)\\s*\\.\\s*fetch(?![\\w$])(?!\\s*=(?!=))/g, 'global fetch'],",
    replace: "  [/(?!)/g, 'global fetch'],",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-new-websocket-not-seen',
    file: 'scripts/row-confidence.mjs',
    claim: "new WebSocket, EventSource and XMLHttpRequest are network use",
    find: "  [/(?<![\\w$])(?<!\\.\\s*)new\\s+(?:WebSocket|EventSource|XMLHttpRequest)(?![\\w$])/g, 'new WebSocket|EventSource|XMLHttpRequest'],",
    replace: "  [/(?!)/g, 'new WebSocket|EventSource|XMLHttpRequest'],",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-http-request-not-seen',
    file: 'scripts/row-confidence.mjs',
    claim: "https.request and http.get are network use",
    find: "  [/(?<![\\w$])(?<!\\.\\s*)https?\\s*\\.\\s*(?:request|get)\\s*\\(/g, 'http(s).request|get'],",
    replace: "  [/(?!)/g, 'http(s).request|get'],",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-net-connect-not-seen',
    file: 'scripts/row-confidence.mjs',
    claim: "net.connect, tls.connect and http2.connect are network use",
    find: "  [/(?<![\\w$])(?<!\\.\\s*)(?:net|tls|http2)\\s*\\.\\s*(?:connect|createConnection)\\s*\\(/g, 'net|tls|http2.connect'],",
    replace: "  [/(?!)/g, 'net|tls|http2.connect'],",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-send-beacon-not-seen',
    file: 'scripts/row-confidence.mjs',
    claim: "sendBeacon is network use",
    find: "  [/(?<![\\w$])sendBeacon\\s*\\(/g, 'sendBeacon'],",
    replace: "  [/(?!)/g, 'sendBeacon'],",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-network-message-hides-the-kinds',
    file: 'scripts/row-confidence.mjs',
    claim: "the objection says what kind of network use it saw",
    find: "reaches the network (${kinds.join(', ')})",
    replace: "reaches the network",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-lists-a-script-once-per-command',
    file: 'scripts/row-confidence.mjs',
    claim: "a row that runs one script in two commands lists it once",
    find: "[...new Set(named)]",
    replace: "named",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-network-liveness-reads-no-scripts',
    file: 'scripts/row-confidence.mjs',
    claim: "the clause that the scan fires on the real tree reads the real scripts",
    find: "readdirSync('scripts').filter(f => f.endsWith('.mjs'))",
    replace: "[].filter(f => f.endsWith('.mjs'))",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-script-read-from-comments',
    file: 'scripts/row-confidence.mjs',
    claim: "a script named only in a comment of a row is not one the row runs",
    find: "[...blankComments(decl).matchAll(/scripts",
    replace: "[...decl.matchAll(/scripts",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-script-comment-cut-by-line',
    file: 'scripts/row-confidence.mjs',
    claim: "a double slash inside the string of one command is not a comment: the next command's script is still the row's",
    find: "[...blankComments(decl).matchAll(/scripts",
    replace: "[...decl.replace(/\\/\\/.*$/gm, '').matchAll(/scripts",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: "network-flag-hidden-by-a-quote",
    file: "scripts/row-confidence.mjs",
    claim: "a quoted argument before the flag does not hide it: a command is read to the next script or call, not to the first quote",
    find: "rest => rest.split(/scripts\\/[\\w.-]+\\.mjs|\\b(?:ok|fails|all)\\(/)[0])",
    replace: "rest => /^[^'\"\\x60]*/.exec(rest)[0])",
    expect: "node scripts/row-confidence.mjs --self-test",
  },
  {
    id: "network-flag-read-from-the-next-script",
    file: "scripts/row-confidence.mjs",
    claim: "a flag that belongs to the next script of the same command is not passed to this one",
    find: "rest.split(/scripts\\/[\\w.-]+\\.mjs|\\b(?:ok|fails|all)\\(/)",
    replace: "rest.split(/\\b(?:ok|fails|all)\\(/)",
    expect: "node scripts/row-confidence.mjs --self-test",
  },
  {
    id: "network-flag-read-from-a-later-call",
    file: "scripts/row-confidence.mjs",
    claim: "a flag named in a later ok( call is not passed to this script",
    find: "rest.split(/scripts\\/[\\w.-]+\\.mjs|\\b(?:ok|fails|all)\\(/)",
    replace: "rest.split(/scripts\\/[\\w.-]+\\.mjs/)",
    expect: "node scripts/row-confidence.mjs --self-test",
  },
  {
    id: "network-flag-hidden-by-a-scripts-path",
    file: "scripts/row-confidence.mjs",
    claim: "a path under scripts/ before the flag is an argument, not the next script",
    find: "rest.split(/scripts\\/[\\w.-]+\\.mjs|\\b(?:ok|fails|all)\\(/)",
    replace: "rest.split(/scripts\\/|\\b(?:ok|fails|all)\\(/)",
    expect: "node scripts/row-confidence.mjs --self-test",
  },
  {
    id: "network-flag-read-from-a-later-fails-call",
    file: "scripts/row-confidence.mjs",
    claim: "a flag named in a later fails( call is not passed to this script",
    find: "\\b(?:ok|fails|all)\\(/)[0])",
    replace: "\\b(?:ok|all)\\(/)[0])",
    expect: "node scripts/row-confidence.mjs --self-test",
  },
  {
    id: "network-flag-read-from-a-later-all-call",
    file: "scripts/row-confidence.mjs",
    claim: "a flag named in a later all( call is not passed to this script",
    find: "\\b(?:ok|fails|all)\\(/)[0])",
    replace: "\\b(?:ok|fails)\\(/)[0])",
    expect: "node scripts/row-confidence.mjs --self-test",
  },
  {
    id: "network-flag-hidden-by-a-name-ending-in-ok",
    file: "scripts/row-confidence.mjs",
    claim: "a call whose name merely ends in ok( inside the arguments does not end them",
    find: "|\\b(?:ok|fails|all)\\(/)[0])",
    replace: "|(?:ok|fails|all)\\(/)[0])",
    expect: "node scripts/row-confidence.mjs --self-test",
  },
  {
    id: "network-flag-split-on-single-spaces",
    file: "scripts/row-confidence.mjs",
    claim: "a flag after a quote, a line or a run of spaces is a token of its own",
    find: "args.split(/[\\s'\"\\x60]+/)",
    replace: "args.split(' ')",
    expect: "node scripts/row-confidence.mjs --self-test",
  },
  {
    id: "network-flag-split-on-whitespace-only",
    file: "scripts/row-confidence.mjs",
    claim: "a flag glued to a quote by string concatenation is the flag",
    find: "args.split(/[\\s'\"\\x60]+/)",
    replace: "args.split(/\\s+/)",
    expect: "node scripts/row-confidence.mjs --self-test",
  },
  {
    id: "network-flag-split-keeps-single-quotes",
    file: "scripts/row-confidence.mjs",
    claim: "a flag in single quotes (an argument array) is the flag",
    find: "args.split(/[\\s'\"\\x60]+/)",
    replace: "args.split(/[\\s\"\\x60]+/)",
    expect: "node scripts/row-confidence.mjs --self-test",
  },
  {
    id: "network-flag-split-keeps-double-quotes",
    file: "scripts/row-confidence.mjs",
    claim: "a flag in double quotes is the flag",
    find: "args.split(/[\\s'\"\\x60]+/)",
    replace: "args.split(/[\\s'\\x60]+/)",
    expect: "node scripts/row-confidence.mjs --self-test",
  },
  {
    id: "network-flag-split-keeps-backticks",
    file: "scripts/row-confidence.mjs",
    claim: "a flag after a backtick (a second template joined by +) is the flag",
    find: "args.split(/[\\s'\"\\x60]+/)",
    replace: "args.split(/[\\s'\"]+/)",
    expect: "node scripts/row-confidence.mjs --self-test",
  },
  {
    id: "network-flag-needs-every-command",
    file: "scripts/row-confidence.mjs",
    claim: "one command of the row that passes the flag is enough to lapse the exemption",
    find: "commandsOf(decl, script).some(args =>",
    replace: "commandsOf(decl, script).every(args =>",
    expect: "node scripts/row-confidence.mjs --self-test",
  },
  {
    id: "row-decl-ends-at-a-blank-line",
    file: "scripts/row-confidence.mjs",
    claim: "a blank line inside a row does not end its declaration",
    find: "['\\n  { name:', '\\n]'].map(mark",
    replace: "['\\n\\n'].map(mark",
    expect: "node scripts/row-confidence.mjs --self-test",
  },
  {
    id: "row-decl-runs-past-the-table",
    file: "scripts/row-confidence.mjs",
    claim: "the last row's declaration ends at the table's closing bracket",
    find: "['\\n  { name:', '\\n]'].map(mark",
    replace: "['\\n  { name:'].map(mark",
    expect: "node scripts/row-confidence.mjs --self-test",
  },
  {
    id: "row-decl-runs-into-the-next-row",
    file: "scripts/row-confidence.mjs",
    claim: "a row's declaration ends where the next row begins",
    find: "['\\n  { name:', '\\n]'].map(mark",
    replace: "['\\n]'].map(mark",
    expect: "node scripts/row-confidence.mjs --self-test",
  },
  {
    id: "row-decl-ends-at-the-farthest-mark",
    file: "scripts/row-confidence.mjs",
    claim: "a row's declaration ends at the nearest of the next row and the table's end",
    find: "Math.min(...ends))",
    replace: "Math.max(...ends))",
    expect: "node scripts/row-confidence.mjs --self-test",
  },
  {
    id: "row-decl-misses-a-double-quoted-name",
    file: "scripts/row-confidence.mjs",
    claim: "a row named in double quotes has a declaration",
    find: "    : source.indexOf(`name: \"${rowName}\"`)",
    replace: "    : -1",
    expect: "node scripts/row-confidence.mjs --self-test",
  },
  {
    id: "row-scan-fetch-declaration-seen-as-use",
    file: "scripts/row-confidence.mjs",
    claim: "a declaration of the name (function, let, var, const) is not network use",
    find: "(?<!\\b(?:function(?:\\s*\\*)?|const|let|var)\\s+)(?<![\\w$])(?<!\\.\\s*)fetch",
    replace: "(?<![\\w$])(?<!\\.\\s*)fetch",
    expect: "node scripts/row-confidence.mjs --self-test",
  },
  {
    id: "row-scan-fetch-function-declaration-seen-as-use",
    file: "scripts/row-confidence.mjs",
    claim: "a function named fetch is not network use",
    find: "(?:function(?:\\s*\\*)?|const|let|var)\\s+)(?<![\\w$])",
    replace: "(?:const|let|var)\\s+)(?<![\\w$])",
    expect: "node scripts/row-confidence.mjs --self-test",
  },
  {
    id: "row-scan-fetch-generator-declaration-seen-as-use",
    file: "scripts/row-confidence.mjs",
    claim: "a generator function named fetch whose parameters hold nested calls is not network use",
    find: "function(?:\\s*\\*)?|const",
    replace: "function|const",
    expect: "node scripts/row-confidence.mjs --self-test",
  },
  {
    id: "row-scan-fetch-loop-binding-seen-as-use",
    file: "scripts/row-confidence.mjs",
    claim: "a const binding named fetch in a for-of header is not network use",
    find: "function(?:\\s*\\*)?|const|let|var)",
    replace: "function(?:\\s*\\*)?|let|var)",
    expect: "node scripts/row-confidence.mjs --self-test",
  },
  {
    id: "row-scan-fetch-method-definition-seen-as-use",
    file: "scripts/row-confidence.mjs",
    claim: "a method definition named fetch is not network use",
    find: "(?![ \\t]*\\((?:[^()]|\\([^()]*\\))*\\)[ \\t]*\\{)/g, 'fetch']",
    replace: "/g, 'fetch']",
    expect: "node scripts/row-confidence.mjs --self-test",
  },
  {
    id: "row-scan-fetch-method-with-a-call-in-its-parameters-seen-as-use",
    file: "scripts/row-confidence.mjs",
    claim: "a method whose parameter list holds a call is still a definition",
    find: "(?:[^()]|\\([^()]*\\))*\\)[ \\t]*\\{)/g, 'fetch']",
    replace: "[^()]*\\)[ \\t]*\\{)/g, 'fetch']",
    expect: "node scripts/row-confidence.mjs --self-test",
  },
  {
    id: "row-scan-fetch-call-before-a-block-hidden",
    file: "scripts/row-confidence.mjs",
    claim: "a call followed by a block on the next line is still a call",
    find: "(?![ \\t]*\\((?:[^()]|\\([^()]*\\))*\\)[ \\t]*\\{)",
    replace: "(?!\\s*\\((?:[^()]|\\([^()]*\\))*\\)\\s*\\{)",
    expect: "node scripts/row-confidence.mjs --self-test",
  },
  {
    id: "row-scan-fetch-assignment-seen-as-use",
    file: "scripts/row-confidence.mjs",
    claim: "an assignment to fetch is not network use",
    find: "fetch(?![\\w$])(?!\\s*:)(?!\\s*=(?!=))",
    replace: "fetch(?![\\w$])(?!\\s*:)",
    expect: "node scripts/row-confidence.mjs --self-test",
  },
  {
    id: "row-scan-fetch-comparison-hidden",
    file: "scripts/row-confidence.mjs",
    claim: "a comparison with fetch is still a read of it",
    find: "fetch(?![\\w$])(?!\\s*:)(?!\\s*=(?!=))",
    replace: "fetch(?![\\w$])(?!\\s*:)(?!\\s*=)",
    expect: "node scripts/row-confidence.mjs --self-test",
  },
  {
    id: "row-scan-global-fetch-assignment-seen-as-use",
    file: "scripts/row-confidence.mjs",
    claim: "an assignment to globalThis.fetch is not network use",
    find: "\\s*\\.\\s*fetch(?![\\w$])(?!\\s*=(?!=))/g, 'global fetch']",
    replace: "\\s*\\.\\s*fetch(?![\\w$])/g, 'global fetch']",
    expect: "node scripts/row-confidence.mjs --self-test",
  },
  {
    id: "row-scan-global-fetch-comparison-hidden",
    file: "scripts/row-confidence.mjs",
    claim: "a comparison with globalThis.fetch is still a read of it",
    find: "\\s*\\.\\s*fetch(?![\\w$])(?!\\s*=(?!=))/g, 'global fetch']",
    replace: "\\s*\\.\\s*fetch(?![\\w$])(?!\\s*=)/g, 'global fetch']",
    expect: "node scripts/row-confidence.mjs --self-test",
  },
  {
    id: "row-scan-global-fetch-leading-guard",
    file: "scripts/row-confidence.mjs",
    claim: "a name that ends in a global's name (itself.fetch, myglobal.fetch) is not network use",
    find: "[/(?<![\\w$])(?<!\\.\\s*)(?:globalThis",
    replace: "[/(?<!\\.\\s*)(?:globalThis",
    expect: "node scripts/row-confidence.mjs --self-test",
  },
  {
    id: "row-scan-global-fetch-property-guard",
    file: "scripts/row-confidence.mjs",
    claim: "a property of something else named like a global (o.window.fetch) is not network use",
    find: "(?<!\\.\\s*)(?:globalThis",
    replace: "(?:globalThis",
    expect: "node scripts/row-confidence.mjs --self-test",
  },
  {
    id: "row-scan-global-fetch-property-guard-space",
    file: "scripts/row-confidence.mjs",
    claim: "a property after a dot and a space (o. window.fetch) is not network use",
    find: "(?<!\\.\\s*)(?:globalThis",
    replace: "(?<!\\.)(?:globalThis",
    expect: "node scripts/row-confidence.mjs --self-test",
  },
  {
    id: "row-scan-global-fetch-trailing-guard",
    file: "scripts/row-confidence.mjs",
    claim: "a member of a global that merely begins like fetch (window.fetchSlate) is not network use",
    find: "\\s*\\.\\s*fetch(?![\\w$])(?!\\s*=(?!=))/g, 'global fetch']",
    replace: "\\s*\\.\\s*fetch(?!\\s*=(?!=))/g, 'global fetch']",
    expect: "node scripts/row-confidence.mjs --self-test",
  },
  {
    id: "row-scan-http-leading-guard",
    file: "scripts/row-confidence.mjs",
    claim: "a name that ends in http (myhttp.get) is not network use",
    find: "[/(?<![\\w$])(?<!\\.\\s*)https?",
    replace: "[/(?<!\\.\\s*)https?",
    expect: "node scripts/row-confidence.mjs --self-test",
  },
  {
    id: "row-scan-http-property-guard-space",
    file: "scripts/row-confidence.mjs",
    claim: "a property after a dot and a space (o. http.get) is not network use",
    find: "(?<!\\.\\s*)https?",
    replace: "(?<!\\.)https?",
    expect: "node scripts/row-confidence.mjs --self-test",
  },
  {
    id: "row-scan-net-property-guard",
    file: "scripts/row-confidence.mjs",
    claim: "a property named net (o.net.connect) is not network use",
    find: "(?<!\\.\\s*)(?:net|tls|http2)",
    replace: "(?:net|tls|http2)",
    expect: "node scripts/row-confidence.mjs --self-test",
  },
  {
    id: "row-scan-net-property-guard-space",
    file: "scripts/row-confidence.mjs",
    claim: "a property after a dot and a space (o. net.connect) is not network use",
    find: "(?<!\\.\\s*)(?:net|tls|http2)",
    replace: "(?<!\\.)(?:net|tls|http2)",
    expect: "node scripts/row-confidence.mjs --self-test",
  },
  {
    id: "row-scan-net-space-before-dot",
    file: "scripts/row-confidence.mjs",
    claim: "net . connect(80) is network use",
    find: "(?:net|tls|http2)\\s*\\.",
    replace: "(?:net|tls|http2)\\.",
    expect: "node scripts/row-confidence.mjs --self-test",
  },
  {
    id: "row-scan-net-space-after-dot",
    file: "scripts/row-confidence.mjs",
    claim: "net. connect(80) is network use",
    find: "\\.\\s*(?:connect|createConnection)",
    replace: "\\.(?:connect|createConnection)",
    expect: "node scripts/row-confidence.mjs --self-test",
  },
  {
    id: "row-scan-net-space-before-paren",
    file: "scripts/row-confidence.mjs",
    claim: "net.connect (80) is network use",
    find: "(?:connect|createConnection)\\s*\\(",
    replace: "(?:connect|createConnection)\\(",
    expect: "node scripts/row-confidence.mjs --self-test",
  },
  {
    id: "row-scan-beacon-space-before-paren",
    file: "scripts/row-confidence.mjs",
    claim: "sendBeacon (u) is network use",
    find: "sendBeacon\\s*\\(/g",
    replace: "sendBeacon\\(/g",
    expect: "node scripts/row-confidence.mjs --self-test",
  },
  {
    id: "row-scan-fetch-generator-space",
    file: "scripts/row-confidence.mjs",
    claim: "function * fetch(...) is a declaration, not network use",
    find: "function(?:\\s*\\*)?",
    replace: "function(?:\\*)?",
    expect: "node scripts/row-confidence.mjs --self-test",
  },
  {
    id: "row-scan-not-covered-list-drifts",
    file: "scripts/row-confidence.mjs",
    claim: "the NOT COVERED list is pinned: a scan that learns optional chaining on a global makes the clause fail until the list says so",
    find: "(?:globalThis|window|self|global)\\s*\\.\\s*fetch",
    replace: "(?:globalThis|window|self|global)\\s*\\??\\.\\s*fetch",
    expect: "node scripts/row-confidence.mjs --self-test",
  },
  {
    id: "row-scan-spelling-check-blind",
    file: "scripts/row-confidence.mjs",
    claim: "the spelling table is compared with what the scan sees",
    find: "const wrongSeenIn = list => list.filter(",
    replace: "const wrongSeenIn = list => [].filter(",
    expect: "node scripts/row-confidence.mjs --self-test",
  },
  {
    id: "row-scan-not-covered-check-blind",
    file: "scripts/row-confidence.mjs",
    claim: "the NOT COVERED spellings are compared with what the scan sees",
    find: "const wrongNotSeenIn = list => list.filter(",
    replace: "const wrongNotSeenIn = list => [].filter(",
    expect: "node scripts/row-confidence.mjs --self-test",
  },
  {
    id: "shard-env-removed-from-verify-full",
    file: ".github/workflows/verify-full.yml",
    claim: "verify-full sets GATE_MUTATION_SHARDS, or CI runs the whole suite in-process again",
    find: "          GATE_MUTATION_SHARDS: '8'\n",
    replace: "",
    expect: "node scripts/sharded-row-check.mjs --self-test",
  },
  {
    id: "shard-env-emptied-in-verify-full",
    file: ".github/workflows/verify-full.yml",
    claim: "verify-full sets GATE_MUTATION_SHARDS to a number, not to nothing",
    find: "GATE_MUTATION_SHARDS: '8'",
    replace: "GATE_MUTATION_SHARDS: ''",
    expect: "node scripts/sharded-row-check.mjs --self-test",
  },
  {
    id: "shard-count-zero-accepted",
    file: "scripts/sharded-row-check.mjs",
    claim: "a shard count of 0 is not a count",
    find: "if (!/^[1-9]\\d*$/.test(value))",
    replace: "if (!/^\\d+$/.test(value))",
    expect: "node scripts/sharded-row-check.mjs --self-test",
  },
  {
    id: "shard-count-suffix-accepted",
    file: "scripts/sharded-row-check.mjs",
    claim: "a shard count with a suffix is not a count",
    find: "if (!/^[1-9]\\d*$/.test(value))",
    replace: "if (!/^[1-9]\\d*/.test(value))",
    expect: "node scripts/sharded-row-check.mjs --self-test",
  },
  {
    id: "shard-env-on-any-step",
    file: "scripts/sharded-row-check.mjs",
    claim: "the variable has to be set on the step that runs the gate",
    find: "if (run !== 'npm run gate')",
    replace: "if (false)",
    expect: "node scripts/sharded-row-check.mjs --self-test",
  },
  {
    id: "shard-env-on-two-steps",
    file: "scripts/sharded-row-check.mjs",
    claim: "exactly one step sets the variable",
    find: "if (holders.length > 1)",
    replace: "if (false)",
    expect: "node scripts/sharded-row-check.mjs --self-test",
  },
  {
    id: "network-exempt-drift-check-fetches-always",
    file: "scripts/drift-check.mjs",
    claim: "an unconditional fetch in drift-check is stopped by the check, not scored clean",
    find: "const url = argOf('--url')\n",
    replace: "const url = argOf('--url')\nawait fetch('https://example.test/beacon')\n",
    expect: "node scripts/network-exempt-check.mjs",
  },
  {
    id: "network-exempt-drift-check-fetch-unguarded",
    file: "scripts/drift-check.mjs",
    claim: "a fetch whose guard became if (true) is stopped by the check",
    find: "  if (url) {\n    const res = await fetch(url)",
    replace: "  if (true) {\n    const res = await fetch(url)",
    expect: "node scripts/network-exempt-check.mjs",
  },
  {
    id: "network-exempt-venue-check-fetches-by-default",
    file: "scripts/venue-coverage-check.mjs",
    claim: "an unconditional fetch in venue-coverage-check is stopped by the check",
    find: "const REPORT = args.includes('--report')\n",
    replace: "const REPORT = args.includes('--report')\nawait fetch('https://example.test/beacon')\n",
    expect: "node scripts/network-exempt-check.mjs",
  },
  {
    id: "network-exempt-venue-check-flag-renamed",
    file: "scripts/venue-coverage-check.mjs",
    claim: "a flag the script no longer reads is not a flag the table may key on",
    find: "const REPORT = args.includes('--report')",
    replace: "const REPORT = args.includes('--live')",
    expect: "node scripts/network-exempt-check.mjs",
  },
  {
    id: "network-exempt-shard-wait-second-host",
    file: "scripts/mutation-await.mjs",
    claim: "a second host asked by the shard wait is outside its sanction",
    find: "  for (let attempt = 1; attempt <= attempts; attempt++) {\n    polls = attempt",
    replace: "  for (let attempt = 1; attempt <= attempts; attempt++) {\n    try { await fetchImpl('https://evil.test/?t=' + attempt) } catch {}\n    polls = attempt",
    expect: "node scripts/network-exempt-check.mjs",
  },
  {
    id: "network-exempt-shard-wait-other-path",
    file: "scripts/mutation-await.mjs",
    claim: "the shard wait asks for the artifacts of its own run and no other path",
    find: "await getAll(`${api}/repos/${repo}/actions/runs/${run}/artifacts`",
    replace: "await getAll(`${api}/repos/${repo}/actions/artifacts`",
    expect: "node scripts/network-exempt-check.mjs",
  },
  {
    id: "network-exempt-shard-wait-never-asks",
    file: "scripts/mutation-await.mjs",
    claim: "a shard wait that makes no request is not the read the sanction names",
    find: "intervalMs, fetchImpl = fetch, log",
    replace: "intervalMs, fetchImpl = async () => { throw new Error('closed') }, log",
    expect: "node scripts/network-exempt-check.mjs",
  },
  {
    id: "shard-wait-default-shorter-than-the-cap",
    file: "scripts/mutation-await.mjs",
    claim: "the gate's wait for the shards outlasts the longest a shard job may run",
    find: "export const DEFAULT_ATTEMPTS = 200",
    replace: "export const DEFAULT_ATTEMPTS = 80",
    expect: "node scripts/sharded-row-check.mjs --self-test",
  },
  {
    id: "shard-wait-command-ignores-the-default",
    file: "scripts/mutation-await.mjs",
    claim: "the wait the command uses is the default the check compares with the shard cap, not a number of its own",
    find: "attempts: Number(arg('--attempts') ?? DEFAULT_ATTEMPTS)",
    replace: "attempts: Number(arg('--attempts') ?? 80)",
    expect: "node scripts/sharded-row-check.mjs --self-test",
  },
  {
    id: "shard-wait-cap-compared-strictly",
    file: "scripts/sharded-row-check.mjs",
    claim: "a wait exactly as long as the shard cap outlasts it",
    find: "if (wait >= cap.minutes) return { ok: true, why: '' }",
    replace: "if (wait > cap.minutes) return { ok: true, why: '' }",
    expect: "node scripts/sharded-row-check.mjs --self-test",
  },
  {
    id: "shard-wait-cap-read-from-the-whole-file",
    file: "scripts/sharded-row-check.mjs",
    claim: "the cap is the shard job's own timeout, not the first one in the file",
    find: "const m = /^ {4}timeout-minutes:[ \\t]*(\\d+)[ \\t]*(?:#.*)?$/m.exec(holders[0])",
    replace: "const m = /^ {4}timeout-minutes:[ \\t]*(\\d+)[ \\t]*(?:#.*)?$/m.exec(text)",
    expect: "node scripts/sharded-row-check.mjs --self-test",
  },
  {
    id: "shard-wait-no-cap-passes",
    file: "scripts/sharded-row-check.mjs",
    claim: "a shard job with no timeout of its own cannot be shown to be outlasted",
    find: "if (!m) return { ok: false, minutes: NaN, why: 'the shard job sets no timeout-minutes of its own, so no wait can be shown to outlast it' }",
    replace: "if (!m) return { ok: true, minutes: 0, why: '' }",
    expect: "node scripts/sharded-row-check.mjs --self-test",
  },
  {
    id: "shard-wait-cap-in-a-comment-counts",
    file: "scripts/sharded-row-check.mjs",
    claim: "a timeout-minutes in a comment is not the shard job's cap",
    find: "const m = /^ {4}timeout-minutes:",
    replace: "const m = /^ {4}(?:# )?timeout-minutes:",
    expect: "node scripts/sharded-row-check.mjs --self-test",
  },
  {
    id: "shard-wait-cap-on-a-step-counts",
    file: "scripts/sharded-row-check.mjs",
    claim: "a timeout on a step is not the shard job's cap",
    find: "const m = /^ {4}timeout-minutes:",
    replace: "const m = /^\\s+timeout-minutes:",
    expect: "node scripts/sharded-row-check.mjs --self-test",
  },
  {
    id: "shard-wait-two-shard-jobs-take-the-first",
    file: "scripts/sharded-row-check.mjs",
    claim: "two jobs named mutation shard are ambiguous, not resolved to the first",
    find: "if (holders.length !== 1) return { ok: false, minutes: NaN,",
    replace: "if (holders.length < 1) return { ok: false, minutes: NaN,",
    expect: "node scripts/sharded-row-check.mjs --self-test",
  },
  {
    id: "network-exempt-table-flag-typo",
    file: "scripts/network-exempt.mjs",
    claim: "a flag in the table that the script does not read is a failure of the check",
    find: "script: 'scripts/drift-check.mjs', flag: '--url', control: { args: ['--url', CONTROL_URL] } },\n  { row: 'decoders accept both real captures', script: 'scripts/venue",
    replace: "script: 'scripts/drift-check.mjs', flag: '--uri', control: { args: ['--url', CONTROL_URL] } },\n  { row: 'decoders accept both real captures', script: 'scripts/venue",
    expect: "node scripts/network-exempt-check.mjs",
  },
  {
    id: "network-exempt-table-flag-and-control-typo",
    file: "scripts/network-exempt.mjs",
    claim: "a flag renamed in the table together with its control still fails: the script does not read it",
    find: "flag: '--report', control: { args: ['--report', '--url', CONTROL_URL] }",
    replace: "flag: '--reportz', control: { args: ['--reportz', '--url', CONTROL_URL] }",
    expect: "node scripts/network-exempt-check.mjs",
  },
  {
    id: "network-exempt-table-control-without-the-flag",
    file: "scripts/network-exempt.mjs",
    claim: "a control that does not pass the flag proves nothing and fails the check",
    find: "control: { args: ['--report', '--url', CONTROL_URL] }",
    replace: "control: { args: ['--url', CONTROL_URL] }",
    expect: "node scripts/network-exempt-check.mjs",
  },
  {
    id: "network-exempt-table-sanction-other-run",
    file: "scripts/network-exempt.mjs",
    claim: "the sanction's address is the one the control's environment names",
    find: "within: 'https://api.github.example/repos/owner/repo/actions/runs/1/'",
    replace: "within: 'https://api.github.example/repos/owner/repo/actions/runs/2/'",
    expect: "node scripts/network-exempt-check.mjs",
  },
  {
    id: "network-exempt-table-sanction-without-address",
    file: "scripts/network-exempt.mjs",
    claim: "a sanction names the address its attempts must be under",
    find: ", within: 'https://api.github.example/repos/owner/repo/actions/runs/1/'",
    replace: "",
    expect: "node scripts/network-exempt-check.mjs",
  },
  {
    id: "network-exempt-check-flag-literal-skipped",
    file: "scripts/network-exempt-check.mjs",
    claim: "the table's flag has to be read by the script as a literal",
    find: "if (!flagLiteral(readFileSync(join(root, where), 'utf8'), entry.flag))",
    replace: "if (false)",
    expect: "node scripts/network-exempt-check.mjs --self-test",
  },
  {
    id: "network-exempt-check-control-flag-unchecked",
    file: "scripts/network-exempt-check.mjs",
    claim: "a control has to pass the flag it proves",
    find: "if (!control.args.includes(entry.flag))",
    replace: "if (false)",
    expect: "node scripts/network-exempt-check.mjs --self-test",
  },
  {
    id: "network-exempt-check-control-not-required-to-stop",
    file: "scripts/network-exempt-check.mjs",
    claim: "the control has to be stopped on an attempt",
    find: "if (!(r.code === 97 && r.attempts.length > 0))",
    replace: "if (false)",
    expect: "node scripts/network-exempt-check.mjs --self-test",
  },
  {
    id: "network-exempt-check-exit-status-decides",
    file: "scripts/network-exempt-check.mjs",
    claim: "a row is judged by what it attempted, not by its exit status",
    find: "...(r.attempts.length > 0 ? [`\"${rowName}\": its commands reached",
    replace: "...(false ? [`\"${rowName}\": its commands reached",
    expect: "node scripts/network-exempt-check.mjs --self-test",
  },
  {
    id: "network-exempt-check-failing-row-ignored",
    file: "scripts/network-exempt-check.mjs",
    claim: "a row that does not pass under the preload is a failure",
    find: "...(r.code !== 0 && r.attempts.length === 0 ? [",
    replace: "...(false ? [",
    expect: "node scripts/network-exempt-check.mjs --self-test",
  },
  {
    id: "network-exempt-check-build-skipped",
    file: "scripts/network-exempt-check.mjs",
    claim: "a missing build is a failure that stops the audit",
    find: "if (missing.length > 0) {\n    out.build",
    replace: "if (false) {\n    out.build",
    expect: "node scripts/network-exempt-check.mjs --self-test",
  },
  {
    id: "network-exempt-check-build-not-looked-for",
    file: "scripts/network-exempt-check.mjs",
    claim: "the build outputs an exempt script imports are looked for",
    find: "(?:from|import)\\s*['\"]\\.\\.\\/(build",
    replace: "(?:xfrom|ximport)\\s*['\"]\\.\\.\\/(build",
    expect: "node scripts/network-exempt-check.mjs --self-test",
  },
  {
    id: "network-exempt-check-stray-address-allowed",
    file: "scripts/network-exempt-check.mjs",
    claim: "the sanctioned wait may ask only its own address",
    find: "if (stray.length > 0) parts.sanction.push",
    replace: "if (false) parts.sanction.push",
    expect: "node scripts/network-exempt-check.mjs --self-test",
  },
  {
    id: "network-exempt-check-silent-wait-allowed",
    file: "scripts/network-exempt-check.mjs",
    claim: "the sanctioned wait has to make a request",
    find: "if (r.attempts.length === 0) parts.sanction.push",
    replace: "if (false) parts.sanction.push",
    expect: "node scripts/network-exempt-check.mjs --self-test",
  },
  {
    id: "network-exempt-check-any-address-within",
    file: "scripts/network-exempt-check.mjs",
    claim: "an address is within only if it begins with the sanctioned one",
    find: ".startsWith(control.within))",
    replace: ".includes(''))",
    expect: "node scripts/network-exempt-check.mjs --self-test",
  },
  {
    id: "network-exempt-check-flag-literal-prefix",
    file: "scripts/network-exempt-check.mjs",
    claim: "a flag literal is the whole quoted flag",
    find: "\\\\1`).test(src)",
    replace: "`).test(src)",
    expect: "node scripts/network-exempt-check.mjs --self-test",
  },
  {
    id: "network-exempt-check-rows-not-run",
    file: "scripts/network-exempt-check.mjs",
    claim: "the exempt rows are run",
    find: "for (const row of [...new Set(flagged.map(e => e.row))]) {",
    replace: "for (const row of []) {",
    expect: "node scripts/network-exempt-check.mjs --self-test",
  },
  {
    id: "network-exempt-check-record-mode-not-used",
    file: "scripts/network-exempt-check.mjs",
    claim: "the sanctioned wait is run with its attempts recorded and refused",
    find: "env: control.env, mode: 'record' })",
    replace: "env: control.env, mode: 'exit' })",
    expect: "node scripts/network-exempt-check.mjs --self-test",
  },
  {
    id: "network-exempt-package-script-removed",
    file: "package.json",
    claim: "package.json runs the check",
    find: "    \"check:network-exempt\": \"node scripts/network-exempt-check.mjs --self-test && node scripts/network-exempt-check.mjs\",\n",
    replace: "",
    expect: "node scripts/network-exempt-check.mjs --self-test",
  },
  {
    id: "network-exempt-workflow-step-runs-something-else",
    file: ".github/workflows/verify.yml",
    claim: "a step of verify.yml runs the check",
    find: "        run: npm run check:network-exempt\n",
    replace: "        run: npm run check:rows\n",
    expect: "node scripts/network-exempt-check.mjs --self-test",
  },
  {
    id: "network-exempt-workflow-step-not-gated-on-the-build",
    file: ".github/workflows/verify.yml",
    claim: "the workflow step runs only when the build did",
    find: "      - name: The network exemptions hold when run\n        # Runs even if a SIBLING report failed — see the block above\n        # `Every gate row has teeth`.\n        if: \"!cancelled() && steps.build.outcome == 'success'\"",
    replace: "      - name: The network exemptions hold when run\n        # Runs even if a SIBLING report failed — see the block above\n        # `Every gate row has teeth`.\n        if: \"!cancelled()\"",
    expect: "node scripts/network-exempt-check.mjs --self-test",
  },
  {
    id: "network-exempt-preload-leaves-fetch-open",
    file: "scripts/no-network-preload.mjs",
    claim: "the preload closes fetch",
    find: "globalThis.fetch = async (input) => refuse('fetch', input)\n",
    replace: "",
    expect: "node scripts/network-exempt-check.mjs --self-test",
  },
  {
    id: "network-exempt-preload-leaves-websocket-open",
    file: "scripts/no-network-preload.mjs",
    claim: "the preload closes WebSocket",
    find: "if (typeof globalThis.WebSocket === 'function') {",
    replace: "if (false) {",
    expect: "node scripts/network-exempt-check.mjs --self-test",
  },
  {
    id: "network-exempt-preload-leaves-builtins-open",
    file: "scripts/no-network-preload.mjs",
    claim: "the preload closes the http, https, http2, net and tls clients",
    find: "  for (const member of members) mod[member] =",
    replace: "  for (const member of []) mod[member] =",
    expect: "node scripts/network-exempt-check.mjs --self-test",
  },
  {
    id: "network-exempt-preload-leaves-tls-open",
    file: "scripts/no-network-preload.mjs",
    claim: "the preload closes tls.connect",
    find: "['tls', tls, ['connect']]",
    replace: "['tls', tls, []]",
    expect: "node scripts/network-exempt-check.mjs --self-test",
  },
  {
    id: "network-exempt-preload-leaves-named-imports-open",
    file: "scripts/no-network-preload.mjs",
    claim: "the preload closes the named imports of the builtins too",
    find: "syncBuiltinESMExports()\n",
    replace: "",
    expect: "node scripts/network-exempt-check.mjs --self-test",
  },
  {
    id: "network-exempt-preload-wrong-exit-code",
    file: "scripts/no-network-preload.mjs",
    claim: "a refused attempt ends the process with code 97",
    find: "if (!RECORD) process.exit(97)",
    replace: "if (!RECORD) process.exit(96)",
    expect: "node scripts/network-exempt-check.mjs --self-test",
  },
  {
    id: "network-exempt-preload-record-mode-exits",
    file: "scripts/no-network-preload.mjs",
    claim: "record mode refuses and goes on",
    find: "if (!RECORD) process.exit(97)",
    replace: "process.exit(97)",
    expect: "node scripts/network-exempt-check.mjs --self-test",
  },
  {
    id: "network-exempt-preload-writes-no-mark",
    file: "scripts/no-network-preload.mjs",
    claim: "an attempt is written down before the process ends",
    find: "if (MARK) appendFileSync(MARK,",
    replace: "if (false) appendFileSync(MARK,",
    expect: "node scripts/network-exempt-check.mjs --self-test",
  },
  {
    id: "network-exempt-preload-forgets-the-url-object",
    file: "scripts/no-network-preload.mjs",
    claim: "the target of a fetch given a URL object is written down as its address",
    find: "first.href ?? first.url ?? `${first.protocol",
    replace: "first.url ?? `${first.protocol",
    expect: "node scripts/network-exempt-check.mjs --self-test",
  },
  {
    id: "network-exempt-preload-record-mode-returns",
    file: "scripts/no-network-preload.mjs",
    claim: "in record mode a refused builtin throws, as a closed network does",
    find: "  throw new Error(`no-network-preload: ${client} refused`)",
    replace: "  return undefined",
    expect: "node scripts/network-exempt-check.mjs --self-test",
  },
  {
    id: "network-exempt-preload-fetch-throws-at-the-call",
    file: "scripts/no-network-preload.mjs",
    claim: "a refused fetch rejects, as fetch does, and does not throw at the call",
    find: "globalThis.fetch = async (input) => refuse('fetch', input)",
    replace: "globalThis.fetch = (input) => refuse('fetch', input)",
    expect: "node scripts/network-exempt-check.mjs --self-test",
  },
  {
    id: 'network-exempt-for-everything',
    file: 'scripts/row-confidence.mjs',
    claim: "a script with no exemption is an objection",
    find: "  if (entry === undefined) return [seen]",
    replace: "  if (entry === undefined) return []",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'network-exempt-ignores-its-flag',
    file: 'scripts/row-confidence.mjs',
    claim: "an exemption lapses when the row passes the flag it is keyed on",
    find: "  if (passesFlag(row.decl, script, entry.flag)) return [",
    replace: "  if (false) return [",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'network-exempt-ignores-its-row',
    file: 'scripts/row-confidence.mjs',
    claim: "an exemption holds for the row it names and no other",
    find: "e => e.row === row.name && e.script === script",
    replace: "e => e.script === script",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'network-exempt-ignores-its-script',
    file: 'scripts/row-confidence.mjs',
    claim: "an exemption holds for the script it names and no other",
    find: "e => e.row === row.name && e.script === script",
    replace: "e => e.row === row.name",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'network-exempt-reads-comments',
    file: 'scripts/row-confidence.mjs',
    claim: "a flag named in a comment of the row is not passed",
    find: "blankComments(decl).split(script)",
    replace: "decl.split(script)",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'network-exempt-reads-the-rest-of-the-row',
    file: 'scripts/row-confidence.mjs',
    claim: "a flag passed to another command of the row is not passed to this script",
    find: "rest => rest.split(/scripts\\/[\\w.-]+\\.mjs|\\b(?:ok|fails|all)\\(/)[0])",
    replace: "rest => rest)",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'network-exempt-misses-the-equals-form',
    file: 'scripts/row-confidence.mjs',
    claim: "--flag=value passes the flag",
    find: "t === flag || t.startsWith(`${flag}=`)",
    replace: "t === flag",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'network-exempt-flag-prefix-matches',
    file: 'scripts/row-confidence.mjs',
    claim: "a flag that only begins like the guard flag does not pass it",
    find: "t === flag || t.startsWith(`${flag}=`)",
    replace: "t.startsWith(flag)",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'network-sanction-not-honoured',
    file: 'scripts/row-confidence.mjs',
    claim: "the sanctioned wait is exempt whatever the row passes",
    find: "  if (entry.sanctioned) return []\n",
    replace: "",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'network-exempt-without-a-flag-passes',
    file: 'scripts/row-confidence.mjs',
    claim: "an entry that names no flag and is not sanctioned exempts nothing",
    find: "  if (typeof entry.flag !== 'string') return [",
    replace: "  if (false) return [",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'network-stale-exemption-unnoticed',
    file: 'scripts/row-confidence.mjs',
    claim: "an exemption for a script its row does not run is stale",
    find: "  .filter(e => !(scriptsByRow.get(e.row) ?? []).includes(e.script))",
    replace: "  .filter(e => false)",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'network-stale-exemption-ignores-the-row',
    file: 'scripts/row-confidence.mjs',
    claim: "a script another row runs does not keep an exemption alive",
    find: "(scriptsByRow.get(e.row) ?? [])",
    replace: "[...scriptsByRow.values()].flat()",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'network-stale-message-misnames-the-row',
    file: 'scripts/row-confidence.mjs',
    claim: "a stale exemption says whether its row is missing or does not run the script",
    find: "scriptsByRow.has(e.row) ? 'a row that does not run it' : 'which is not a row of the gate'",
    replace: "'a row that does not run it'",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'network-exemption-goes-stale',
    file: 'scripts/network-exempt.mjs',
    claim: "the scorer fails on an exemption for a script its row does not run",
    find: "\n]\n",
    replace: "\n  { row: 'decoders accept both real captures', script: 'scripts/mutation-check.mjs', flag: '--url' },\n]\n",
    expect: 'node scripts/run-row.mjs "every gate row has teeth and is deterministic"',
  },
  {
    id: 'network-sanctioned-wait-removed',
    file: 'scripts/network-exempt.mjs',
    claim: "the shard wait is a network read the table has to name",
    find: "  { row: 'breaking each invariant makes a check fail', script: 'scripts/mutation-await.mjs', sanctioned: 'the shard wait: verify-full sets GATE_MUTATION_SHARDS (sharded-row-check.mjs reads it there), and this script lists the artifacts and jobs of the run at the GitHub API so the row can read the shards (network-exempt-check.mjs runs it with the network closed and requires every attempt to be under that run\\'s API path); a local gate does not run it (the row runs the suite in-process when the variable is unset)', control: { args: ['network-exempt-control', '--of', '2', '--attempts', '1', '--interval', '0'], env: { GITHUB_API_URL: 'https://api.github.example', GITHUB_REPOSITORY: 'owner/repo', GITHUB_RUN_ID: '1', GITHUB_TOKEN: 'control-token' }, within: 'https://api.github.example/repos/owner/repo/actions/runs/1/' } },\n",
    replace: "",
    expect: 'node scripts/run-row.mjs "every gate row has teeth and is deterministic"',
  },
  {
    id: 'network-flag-added-to-the-first-capture',
    file: 'scripts/gate-checks.mjs',
    claim: "a row that passes --url to drift-check is red",
    find: "ok('node scripts/drift-check.mjs --file data/context-2026-05-15.json') &&",
    replace: "ok('node scripts/drift-check.mjs --file data/context-2026-05-15.json --url https://example.test/x') &&",
    expect: 'node scripts/run-row.mjs "every gate row has teeth and is deterministic"',
  },
  {
    id: 'network-flag-added-to-the-second-command',
    file: 'scripts/gate-checks.mjs',
    claim: "the flag is looked for in every command of the row that runs the script",
    find: "ok('node scripts/drift-check.mjs --file data/games-2026-08-09.json') &&",
    replace: "ok('node scripts/drift-check.mjs --file data/games-2026-08-09.json --url https://example.test/x') &&",
    expect: 'node scripts/run-row.mjs "every gate row has teeth and is deterministic"',
  },
  {
    id: 'network-flag-added-to-the-reject-row',
    file: 'scripts/gate-checks.mjs',
    claim: "the row that expects drift-check to fail is red when it passes --url",
    find: "fails('node scripts/drift-check.mjs --file test/malformed-nested.json')",
    replace: "fails('node scripts/drift-check.mjs --file test/malformed-nested.json --url https://example.test/x')",
    expect: 'node scripts/run-row.mjs "every gate row has teeth and is deterministic"',
  },
  {
    id: 'network-flag-added-to-the-venue-row',
    file: 'scripts/gate-checks.mjs',
    claim: "a row that passes --report to venue-coverage-check is red",
    find: "ok('node scripts/venue-coverage-check.mjs') },",
    replace: "ok('node scripts/venue-coverage-check.mjs --report --url https://example.test/x') },",
    expect: 'node scripts/run-row.mjs "every gate row has teeth and is deterministic"',
  },
  {
    id: 'network-second-sanctioned-read',
    file: 'scripts/network-exempt.mjs',
    claim: "the shard wait is the only sanctioned network read of a gate row",
    find: "script: 'scripts/venue-coverage-check.mjs', flag: '--report',",
    replace: "script: 'scripts/venue-coverage-check.mjs', sanctioned: 'a second wait',",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'network-exempt-flag-is-not-a-flag',
    file: 'scripts/network-exempt.mjs',
    claim: "a guarded entry is keyed on a flag that starts with two dashes",
    find: "script: 'scripts/venue-coverage-check.mjs', flag: '--report',",
    replace: "script: 'scripts/venue-coverage-check.mjs', flag: 'report',",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },

  {
    id: 'red-main-softened',
    file: 'scripts/status.mjs',
    claim: 'a failing verify run is reported as failing',
    // Re-anchored 2026-10-16: d730ed6 split this return over two lines and
    // added the failing step, so the old one-line anchor matched nothing and
    // the mutation reported a missing anchor instead of running.
    find: "  return `**${run.conclusion.toUpperCase()}** on \\`${sha}\\`${stepClause(summary)}`\n    + ` — [run ${run.id}](${run.html_url})`",
    replace: "  return `**green** on \\`${sha}\\``",
    expect: 'node scripts/run-row.mjs "a red main is reported, not softened"',
  },

  {
    // The softening through the branch that looked harmless. A run stuck
    // in_progress for an hour reads as "running", which reads as neutral.
    id: 'stalled-run-reads-as-running',
    file: 'scripts/status.mjs',
    claim: 'a run stuck in progress is called stalled, not running',
    // Re-anchored 2026-10-16: d730ed6 moved the stall test into `mayDeploy`
    // as a ternary. Same mutation: the stall branch can never be taken.
    find: "    return idleMs > STALL_MINUTES * 60_000 ? 'unknown' : 'in-flight'",
    replace: "    return false ? 'unknown' : 'in-flight'",
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
    find: '    elif List.isEmpty readings then EveryFetchFailed(eligible, failed)',
    replace: '    elif List.isEmpty readings then NoVenuesWithCoordinates',
    expect: 'node scripts/run-row.mjs "the F# harness refuses a check with no counterexample"',
  },

  {
    // Blind the F# harness the way every other detector here could be blinded:
    // make a toothless check report as a pass. Its own self-test must object,
    // and if it does not, 16/16 means only that the suite ran.
    // --- production's tables, once carried, must stay honest ----------------
    id: 'park-average-reads-plus-zero',
    file: 'src/Stats.fs',
    claim: 'a park exactly at league average reads 0%, not +0%',
    find: '    if n = 0 then "0%" else sprintf "%+d%%" n',
    replace: '    sprintf "%+d%%" n',
    expect: 'node scripts/run-row.mjs "the F# harness refuses a check with no counterexample"',
  },
  {
    id: 'unrated-umpire-gains-a-rating',
    file: 'src/Stats.fs',
    claim: 'an umpire with no entry renders as a bare name, not as a zeroed rating',
    find: '        | None -> name\n        | Some r ->',
    replace: '        | None -> name + " · 0% overturns · 0 challenged"\n        | Some r ->',
    expect: 'node scripts/run-row.mjs "the F# harness refuses a check with no counterexample"',
  },
  {
    // Scouting.fs is generated, and mutating generated source is the right
    // target anyway: the claim is about what the compiled table DOES, and the
    // generator's own guards are a separate matter tested by its refusals.
    id: 'umpire-rate-stops-tracking-its-counts',
    file: 'src/Scouting.fs',
    claim: "an umpire's overturn rate is computed from that umpire's own counts",
    find: '    float u.Overturned / float u.Challenged',
    replace: '    0.5',
    expect: 'node scripts/run-row.mjs "the F# harness refuses a check with no counterexample"',
  },
  {
    id: 'park-badge-ignores-its-tier',
    file: 'src/Scouting.fs',
    claim: 'the park badge is derived from the tier and cannot contradict it',
    find: '    | NeutralPark -> None',
    replace: '    | NeutralPark -> Some "Pitcher\'s Park"',
    expect: 'node scripts/run-row.mjs "the F# harness refuses a check with no counterexample"',
  },
  {
    // Rule 1, mechanised. Production's own CC-CMD: "Do not invent a park factor
    // to fill a row. If the venue genuinely has no published factor, the honest
    // outcome is that the row stays absent."
    // RETARGETED. The anchor was the old one-line body of `tryParkByVenue`,
    // which the alias table replaced — and the harness failed the row with "the
    // mutation anchor still exists" rather than quietly skipping a mutation it
    // could no longer apply. That distinction is the only reason this was
    // noticed: a skipped mutation reads as a passing suite.
    id: 'missing-park-factor-invented',
    file: 'src/Scouting.fs',
    claim: 'a venue with no published factor keeps no row rather than gaining an invented one',
    find: '    |> Option.bind (fun (_, label) -> parkFactors |> List.tryFind (fun p -> p.Venue = label))',
    replace: '    |> Option.bind (fun (_, label) -> parkFactors |> List.tryFind (fun p -> p.Venue = label))\n    |> Option.orElse (List.tryHead parkFactors)',
    expect: 'node scripts/run-row.mjs "the F# harness refuses a check with no counterexample"',
  },
  {
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
    // Re-anchored 2026-10-16: d730ed6 added `decision: 'unknown'` to this
    // return. The mutation still drops only the problem.
    find: "    return { text: `unreadable — the workflow-history API answered ${res.status}`, problem: `HTTP ${res.status}`, decision: 'unknown' }",
    replace: "    return { text: `unreadable — the workflow-history API answered ${res.status}`, problem: null, decision: 'unknown' }",
    expect: 'node scripts/run-row.mjs "a red main is reported, not softened"',
  },

  {
    id: 'button-order',
    file: 'src/PickemView.fs',
    claim: 'the side buttons read in the same order as the matchup label',
    // Renamed with `orderByMatchup` on 2026-08-25. The mutation is the same
    // one: bypass the ordering function and hand back the columns as written.
    find: '    match presentByMatchup game.Sport (Home, game.Home) (Away, game.Away) with',
    replace: '    match Contest((Home, game.Home), (Away, game.Away)) with',
    expect: 'node scripts/pickem-check.mjs',
  },
  // --- the Verify panel -----------------------------------------------------
  //
  // The suite on the page. Its own invariants are `build/VerifyMain.js`'s to
  // prove; these break what only the PAGE can get wrong.
  {
    id: 'verify-panel-hides-the-counterexample',
    file: 'src/SuiteView.fs',
    claim: 'every row shows the input that must fail',
    find: '                              (Verify.sealedShownMustFail c))',
    replace: '                              "")',
    expect: "URL='http://localhost:8080/?tab=verify' node scripts/verify-render-check.mjs",
  },
  {
    // The defect the first build actually shipped: the elapsed time was computed
    // as an ARGUMENT to render, so the subtraction ran before a single check did
    // and the page said "146 checks ran in this browser in 0ms".
    id: 'verify-panel-times-nothing',
    file: 'src/SuiteView.fs',
    claim: 'the timing is measured around the work, not before it',
    find: '    let started = JS.Constructors.Date.now ()',
    replace: '    let started = JS.Constructors.Date.now () + 1000000.0',
    expect: "URL='http://localhost:8080/?tab=verify' node scripts/verify-render-check.mjs",
  },
  {
    // A panel that only ever renders "held" has not shown that the runner can
    // tell the other two apart, which is the whole argument for phase 1.
    id: 'verify-panel-one-verdict',
    file: 'src/SuiteView.fs',
    claim: 'the runner demonstrates all three verdicts before the suite',
    find: '    | Verify.NoTeeth -> "no teeth", "sv-verdict--noteeth"',
    replace: '    | Verify.NoTeeth -> "held", "sv-verdict--held"',
    expect: "URL='http://localhost:8080/?tab=verify' node scripts/verify-render-check.mjs",
  },
  {
    // The suite must reach the page in full. Dropping a group is invisible to a
    // reader and to every row-level assertion — AND it survived the first
    // version of this mutation, because `Suite.all ()` is `Suite.groups ()`
    // flattened: the node total and the page's row count fall together and go on
    // agreeing. It is caught now by counting the DECLARATIONS in the source,
    // which is a different derivation and can therefore disagree.
    id: 'verify-panel-drops-a-group',
    file: 'src/Suite.fs',
    claim: 'every check DECLARED in the suite source reaches the page',
    // Re-anchored 2026-10-16: ec479e2 appended "Lineups" after "Tennis draws",
    // then the empowerment groups were appended after "Lineups". Same
    // mutation: the last declared group never reaches the page.
    // Re-anchored 2026-10-18: "BDB scout" appended after "Second Wind".
    find: '      "Second Wind", secondWind ()\n      "BDB scout", bdbScout () ]',
    replace: '      "Second Wind", secondWind () ]',
    expect: "URL='http://localhost:8080/?tab=verify' node scripts/verify-render-check.mjs",
  },
  // --- proof-check's run marker ---------------------------------------------
  //
  // The state machine that decides whether a killed run corrupts the tree. Both
  // directions, because "always heal" and "never proceed" are different bugs and
  // a one-sided check could not tell them apart. The refuse direction is the one
  // the 2026-09-07 incident needed: healing a file a LIVE run is about to
  // rewrite is a race, not a fix.
  {
    id: 'proof-sentinel-not-created',
    file: 'scripts/proof-check.mjs',
    claim: "a restore leaves a sentinel before it starts, so a failure or a kill in the middle of it is remembered",
    find: "  try { writeFileSync(PENDING_FILE, ''); pending = true } catch {",
    replace: "  try { pending = true } catch {",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-sentinel-ignored',
    file: 'scripts/proof-check.mjs',
    claim: "the run that finds a restore-pending sentinel treats the restore as failed",
    find: "const restoreFlagged = (priorState !== null && priorState.restoreFailed === true) || existsSync(PENDING_FILE)",
    replace: "const restoreFlagged = (priorState !== null && priorState.restoreFailed === true)",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-marker-flag-ignored',
    file: 'scripts/proof-check.mjs',
    claim: "the run that finds a restoreFailed flag in the marker treats the restore as failed",
    find: "const restoreFlagged = (priorState !== null && priorState.restoreFailed === true) || existsSync(PENDING_FILE)",
    replace: "const restoreFlagged = existsSync(PENDING_FILE)",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-git-env-not-filtered',
    file: 'scripts/proof-check.mjs',
    claim: "the scratch repository never inherits a repository location from the caller",
    find: "...Object.fromEntries(Object.entries(env).filter(([k]) => !/^GIT_/.test(k))), GIT_CONFIG_GLOBAL: '/dev/null'",
    replace: "...env, GIT_CONFIG_GLOBAL: '/dev/null'",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-git-global-config-kept',
    file: 'scripts/proof-check.mjs',
    claim: "the scratch repository never reads the caller's git configuration",
    find: ", GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' })",
    replace: ", GIT_CONFIG_NOSYSTEM: '1' })",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-git-system-config-kept',
    file: 'scripts/proof-check.mjs',
    claim: "the scratch repository never reads the system git configuration",
    find: ", GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' })",
    replace: ", GIT_CONFIG_GLOBAL: '/dev/null' })",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-run-identified-by-substring',
    file: 'scripts/proof-check.mjs',
    claim: "a process is the run by its arguments, not because its command line mentions the name",
    find: "const runsProofCheck = command => {",
    replace: "const runsProofCheck = command => /proof-check/.test(command)\nconst unusedRunsProofCheck = command => {",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-empty-command-is-unreadable',
    file: 'scripts/proof-check.mjs',
    claim: "a command line that reads as nothing is a command, not a failed read",
    find: "try { return read(`/proc/${pid}/cmdline`).split('\\0').join(' ').trim() } catch { return null }",
    replace: "try { return read(`/proc/${pid}/cmdline`).split('\\0').join(' ').trim() || null } catch { return null }",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-unconfirmed-pid-says-kill',
    file: 'scripts/proof-check.mjs',
    claim: "a refusal over a pid nobody can identify offers a way forward that does not kill anything",
    find: "set \"pid\": 0 in ${MARKER_FILE}",
    replace: "kill the process; ${MARKER_FILE}",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-classifier-target-alternative-dropped',
    file: 'scripts/proof-check.mjs',
    claim: "after a failed restore a target that is provably the run's injection is healed",
    find: "(targetStranded || targetIntact) &&",
    replace: "(targetIntact) &&",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-classifier-registry-alternative-dropped',
    file: 'scripts/proof-check.mjs',
    claim: "after a failed restore a registry that is provably the run's probe is healed",
    find: "(registryStranded || registryIntact))) return 'diverged'",
    replace: "(registryIntact))) return 'diverged'",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-diverged-names-both-files',
    file: 'scripts/proof-check.mjs',
    claim: "the refusal names only the files that are not as their backups describe",
    find: "[...new Set(reasons.map(r => r[0]))].join(' and ')",
    replace: "[TARGET, REGISTRY].join(' and ')",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-unrecorded-failure-claims-recorded',
    file: 'scripts/proof-check.mjs',
    claim: "a failed restore that could not be recorded does not say the next run will know",
    find: "(pending || flagged\n",
    replace: "(true\n",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-restore-failure-exits-zero',
    file: 'scripts/proof-check.mjs',
    claim: "a run whose restore did not read back fails, whatever its checks said",
    find: "  process.exitCode = 1\n  if (changed.length)",
    replace: "  if (changed.length)",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-main-flow-forgets-the-restore-flag',
    file: 'scripts/proof-check.mjs',
    claim: "the run that finds a marker reads whether its restore had failed",
    find: "  restoreFailed: restoreFlagged,",
    replace: "  restoreFailed: false,",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-unreadable-pid-is-a-stranger',
    file: 'scripts/proof-check.mjs',
    claim: "a pid whose command cannot be read is not called a stranger",
    find: "const isStranger = command => command !== null && !runsProofCheck(command)",
    replace: "const isStranger = command => !runsProofCheck(command)",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-restore-failure-not-recorded',
    file: 'scripts/proof-check.mjs',
    claim: "a restore that did not read back says so in the marker, for the run after it",
    find: "  try { writeFileSync(MARKER_FILE, JSON.stringify({ ...runMarker, restoreFailed: true }, null, 2) + '\\n'); flagged = true } catch { /* the sentinel still says so */ }",
    replace: "  void runMarker",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-marker-always-heals',
    file: 'scripts/proof-check.mjs',
    claim: 'a marker whose process is still alive refuses rather than repairing',
    find: "  if (alive) return 'refuse'",
    replace: "  if (false) return 'refuse'",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  // Two more outcomes (2026-11-03), `stale` and `diverged`: a backup is applied only to a file that
  // is exactly that backup plus what the script itself injects, and a marker whose backups describe
  // nothing on the tree is discarded, not applied. One entry per way that goes wrong. The entries
  // on the classifier's own lines are caught by its scenarios and by the real-script cases; the
  // ones on the call sites and on the heal's writes are caught ONLY by the real-script cases,
  // because the classifier cannot see what is passed to it or what is done with its answer.
  {
    id: 'proof-marker-heals-a-clean-tree',
    file: 'scripts/proof-check.mjs',
    claim: 'a marker whose process is gone, over a tree with nothing of the run\'s on it, is stale: its backups are not written back',
    find: "  return 'stale'\n}",
    replace: "  return 'heal'\n}",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-marker-never-heals-a-stranded-run',
    file: 'scripts/proof-check.mjs',
    claim: 'a killed run that left its injection, or its registry probe, is still healed from its backups',
    find: "  if (targetStranded || registryStranded) return 'heal'",
    replace: "  if (false) return 'heal'",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-marker-heals-over-a-moved-file',
    file: 'scripts/proof-check.mjs',
    claim: 'an injection on a file that has moved on from the backups is not healed: nothing is written and the run stops',
    find: "  if ((injected && !targetStranded) ||",
    replace: "  if (false ||",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-marker-calls-a-torn-target-clean',
    file: 'scripts/proof-check.mjs',
    claim: 'a target with no anchor, which may be torn, is not called clean and its backups are not discarded',
    find: "  if ((!targetStranded && !targetIntact && !anchored) ||",
    replace: "  if ((false) ||",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-marker-accepts-a-moved-file',
    file: 'scripts/proof-check.mjs',
    claim: 'a file counts as the run\'s injection only if it is the backup plus one block, with its head and tail unchanged',
    find: '  if (!current.startsWith(head) || !current.endsWith(tail)) return null',
    replace: '  if (false) return null',
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-marker-ignores-liveness',
    file: 'scripts/proof-check.mjs',
    claim: 'whether the marker\'s process is alive is read from the process table and handed to the classifier',
    find: '  alive: runningElsewhere(priorState),',
    replace: '  alive: false,',
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-marker-ignores-the-tree',
    file: 'scripts/proof-check.mjs',
    claim: 'whether the target carries injected code is read from the target and handed to the classifier',
    find: '  injected: injectedNow,',
    replace: '  injected: true,',
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-marker-ignores-the-anchor',
    file: 'scripts/proof-check.mjs',
    claim: 'whether the target still has its anchor is read from the target and handed to the classifier',
    find: '  anchored: currentTarget.includes(ANCHOR),',
    replace: '  anchored: true,',
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-marker-never-reads-the-target',
    file: 'scripts/proof-check.mjs',
    claim: 'whether the target is the backup plus an injection is computed and handed to the classifier',
    find: '  targetStranded,\n  registryStranded,\n  registryInjected:',
    replace: '  targetStranded: false,\n  registryStranded,\n  registryInjected:',
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-marker-never-reads-the-registry',
    file: 'scripts/proof-check.mjs',
    claim: 'whether the registry is the backup plus the probe case is computed and handed to the classifier',
    find: '  targetStranded,\n  registryStranded,\n  registryInjected:',
    replace: '  targetStranded,\n  registryStranded: false,\n  registryInjected:',
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-marker-heals-the-registry-unconditionally',
    file: 'scripts/proof-check.mjs',
    claim: 'a heal writes the registry only when the registry is the run\'s own probe, never over a registry that moved on',
    find: '    if (registryStranded) { writeFileSync(REGISTRY, backupRegistry)',
    replace: '    if (true) { writeFileSync(REGISTRY, backupRegistry)',
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-marker-heals-the-target-unconditionally',
    file: 'scripts/proof-check.mjs',
    claim: 'a heal writes the target only when the target is the run\'s own injection, never over a target that moved on',
    find: '    if (targetStranded) { writeFileSync(TARGET, backupTarget)',
    replace: '    if (true) { writeFileSync(TARGET, backupTarget)',
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  // --- the heal of two stranded files (review 6, test-vacuity lens, finding 0, 2026-11-05) ----------------------------------------------------------------------------------------------------------
  //
  // Each file is healed on its own and every clause planted one at a time, so a heal that skips one file when the other is stranded too, and then drops the state, was not seen. A planted state with both
  // stranded holds it, and the message's plural.
  {
    id: "proof-heal-skips-the-registry-beside-a-stranded-target",
    file: 'scripts/proof-check.mjs',
    claim: "a heal puts the registry back whether or not the target was stranded too, before it drops the state that holds the only whole copy",
    find: "    if (registryStranded) { writeFileSync(REGISTRY, backupRegistry)",
    replace: "    if (registryStranded && !targetStranded) { writeFileSync(REGISTRY, backupRegistry)",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: "proof-heal-skips-the-target-beside-a-stranded-registry",
    file: 'scripts/proof-check.mjs',
    claim: "a heal puts the target back whether or not the registry was stranded too, before it drops the state that holds the only whole copy",
    find: "    if (targetStranded) { writeFileSync(TARGET, backupTarget)",
    replace: "    if (targetStranded && !registryStranded) { writeFileSync(TARGET, backupTarget)",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: "proof-heal-names-only-the-first-file",
    file: 'scripts/proof-check.mjs',
    claim: "a heal that restored two files says which two",
    find: "was killed with `\n      + `${restored.join(' and ')} injected.",
    replace: "was killed with `\n      + `${restored[0]} injected.",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: "proof-heal-says-it-for-two-files",
    file: 'scripts/proof-check.mjs',
    claim: "a heal that restored two files says it restored them, not it",
    find: "Restored ${restored.length > 1 ? 'them' : 'it'} before measuring anything.",
    replace: "Restored it before measuring anything.",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  // --- how a pid is told to be a proof-check (review 6, test-vacuity lens, finding 4, 2026-11-05) -----------------------------------------------------------------------------------------------------
  //
  // The clauses fed `commandOf` a fake reader that ignored its path, so reading `comm` instead of `cmdline` passed, and the two anchors on the patterns (`ts-node`, `my-proof-check.mjs`) were never tried. A
  // clause now reads three real processes through the real /proc, and the string clause has the two lookalikes.
  {
    id: "proof-command-read-from-comm",
    file: 'scripts/proof-check.mjs',
    claim: "what a pid is running is read from its command line, which holds its arguments, and not from its short name",
    find: "read(`/proc/${pid}/cmdline`)",
    replace: "read(`/proc/${pid}/comm`)",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: "proof-run-is-any-node-suffix",
    file: 'scripts/proof-check.mjs',
    claim: "a process is a proof-check only if its program is node itself: ts-node running proof-check.mjs is not",
    find: "/(^|\\/)node[\\d.]*$/.test(words[0])",
    replace: "/node[\\d.]*$/.test(words[0])",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: "proof-run-is-any-file-suffix",
    file: 'scripts/proof-check.mjs',
    claim: "a process is a proof-check only if the file it runs is named proof-check.mjs: my-proof-check.mjs is not",
    find: "/(^|\\/)proof-check\\.mjs$/.test(w)",
    replace: "/proof-check\\.mjs$/.test(w)",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  // The marker's lifetime and the identity of its pid (2026-11-04). The phase-2 entries need a
  // real two-phase run, which the self-test makes with a stand-in dotnet; the others are caught by
  // the liveness cases, which feed run-marker.mjs a recycled pid, a zombie and an injected /proc.
  {
    id: 'proof-marker-trusts-a-recycled-pid',
    file: 'scripts/run-marker.mjs',
    claim: 'a pid that a different process now holds is not the run the marker recorded',
    find: '  return start === undefined || start === null || String(start) === s.start',
    replace: '  return true',
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-marker-trusts-a-zombie',
    file: 'scripts/run-marker.mjs',
    claim: 'a process that has died and not been reaped is not a run still going',
    find: "  if (s.state === 'Z' || s.state === 'X') return false",
    replace: '  if (false) return false',
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-marker-refuses-our-own-pid',
    file: 'scripts/proof-check.mjs',
    claim: 'a marker that names our own pid is a dead run\'s, judged by the tree, not another run still going',
    find: '  prior !== null && prior.pid !== selfPid && isLive(prior, probes)',
    replace: '  prior !== null && isLive(prior, probes)',
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-marker-records-no-start-time',
    file: 'scripts/proof-check.mjs',
    claim: 'the marker records when its run started, so a recycled pid can be told from the run',
    find: '  start: startOf(process.pid),',
    replace: '  start: null,',
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-marker-dropped-after-the-first-phase',
    file: 'scripts/proof-check.mjs',
    claim: 'the marker and backups outlive the first phase, so a kill in the registry phase is healed and a second run there is refused',
    find: '    restoreFiles()\n  }\n} else if (!source.includes(ANCHOR)) {',
    replace: '    restore()\n  }\n} else if (!source.includes(ANCHOR)) {',
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-marker-never-proceeds',
    file: 'scripts/proof-check.mjs',
    claim: 'no marker on disk means there is nothing to heal or refuse',
    find: "  if (!markerExists) return 'proceed'",
    replace: "  if (false) return 'proceed'",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-marker-ignores-a-moved-registry',
    file: 'scripts/proof-check.mjs',
    claim: 'a probe case on a registry the backups do not describe is not discarded as stale',
    find: " || (registryInjected && !registryStranded)) return 'diverged'",
    replace: ") return 'diverged'",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-marker-never-reads-the-probe',
    file: 'scripts/proof-check.mjs',
    claim: 'whether the registry carries the probe case is read from the registry and handed to the classifier',
    find: '  registryInjected: carriesProbe(currentRegistry),',
    replace: '  registryInjected: false,',
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-marker-refusal-recommends-a-checkout',
    file: 'scripts/proof-check.mjs',
    claim: 'the live-run refusal does not tell a person to discard what else is uncommitted in the two files',
    find: "Wait for it. If it is hung: kill ${prior.pid}. The next run restores the file that still carries its injection, and only that file.`",
    replace: "Wait for it, or: kill ${prior.pid} && git checkout -- ${TARGET} ${REGISTRY}`",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  // The third review (2026-11-04): one entry per fix to proof-check.mjs and run-marker.mjs, each of which was first written as a clause that passed.
  {
    id: 'proof-marker-restore-drops-state-after-a-failed-write',
    file: 'scripts/proof-check.mjs',
    claim: "a restore that did not put the files back keeps the state that can",
    find: "  if (restoreFiles()) { dropState(); return }",
    replace: "  restoreFiles(); dropState(); return",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-marker-restore-trusts-its-own-write',
    file: 'scripts/proof-check.mjs',
    claim: "a restore is judged by reading the files back, not by the write having returned",
    find: "    return readFileSync(file, 'utf8') === original ? 'ok' : 'failed'",
    replace: "    return 'ok'",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-marker-restore-swallows-a-throwing-write',
    file: 'scripts/proof-check.mjs',
    claim: "a restore whose write throws is a failed restore",
    find: "    return 'failed' // best effort — the on-disk backups are the fallback, and they stay",
    replace: "    return 'ok' // best effort — the on-disk backups are the fallback, and they stay",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-marker-gap-may-hold-any-code',
    file: 'scripts/proof-check.mjs',
    claim: "a block above the anchor that carries the marker and also other code is not this script's injection",
    find: "  return block !== null && block.includes(MARKER) && onlyProofFunctions(block)",
    replace: "  return block !== null && block.includes(MARKER)",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-marker-proceeds-over-an-injected-target',
    file: 'scripts/proof-check.mjs',
    claim: "a target carrying injected code with no run state is not adopted as the original",
    find: "      if (injectedNow) strays.push(TARGET)",
    replace: "      if (false) strays.push(TARGET)",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-marker-proceeds-over-a-probed-registry',
    file: 'scripts/proof-check.mjs',
    claim: "a registry carrying the probe case with no run state is not adopted as the original",
    find: "      if (carriesProbe(currentRegistry)) strays.push(REGISTRY)",
    replace: "      if (false) strays.push(REGISTRY)",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  // --- proof-check's refusal over an injected tree with no run state (2026-11-05) -----------------------------------
  //
  // docs/CC-CMD-2026-11-03-gate-hazard-residuals.md Task 3, the half its first commit recorded as not built. The refusal said `Restore it (git checkout -- <file>) before re-running.`,
  // which discards every uncommitted edit to the file and, when the injection is committed, changes nothing. It now says to delete the lines, how to find them (a grep, which works on a
  // committed injection too), and names a checkout with where it works (an injection neither staged nor committed) and what it discards. Each of these breaks one part of that and is caught by the three clauses that run
  // the real script with no run state over an injected target, a probed registry, and both.
  {
    id: "proof-check-stray-checkout-unconditional",
    file: 'scripts/proof-check.mjs',
    claim: "a checkout is named only for an injection that is neither staged nor committed (on those it changes nothing)",
    find: "puts ${many ? 'each file' : 'the file'} back to what is staged: it removes an injection only while that injection is neither staged nor committed (the pre-commit hook sees it staged, where the checkout changes nothing), and it discards every unstaged edit to ${many ? 'those files' : 'the file'}.`)",
    replace: "puts ${many ? 'each file' : 'the file'} back to what is staged: it removes the injection and it discards every unstaged edit to ${many ? 'those files' : 'the file'}.`)",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: "proof-check-stray-checkout-cost-unsaid",
    file: 'scripts/proof-check.mjs',
    claim: "when a checkout is named, so is what it discards",
    find: "and it discards every unstaged edit to ${many ? 'those files' : 'the file'}.`)",
    replace: "and it restores ${many ? 'those files' : 'the file'}.`)",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: "proof-check-stray-checkout-names-a-clean-file",
    file: 'scripts/proof-check.mjs',
    claim: "the checkout names the files that carry an injection and no others (a clean one would lose its uncommitted edits for nothing)",
    find: "\\`git checkout -- ${strays.join(' ')}\\` puts",
    replace: "\\`git checkout -- ${TARGET} ${REGISTRY}\\` puts",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: "proof-check-stray-grep-hint-is-git-diff",
    file: 'scripts/proof-check.mjs',
    claim: "the injected block is found with a command that works on a committed injection too, not git diff, which prints nothing there",
    find: "\\`grep -n \"${MARKER}\" ${TARGET}\\` finds the headers)`\n  : `the probe case",
    replace: "\\`git diff -- ${TARGET}\\` finds the headers)`\n  : `the probe case",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: "proof-check-stray-instructions-swapped",
    file: 'scripts/proof-check.mjs',
    claim: "the target is told how to find the proof functions and the registry how to find the probe case, not the other way round",
    find: "const parts = strays.map(f => f === TARGET",
    replace: "const parts = strays.map(f => f !== TARGET",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: "proof-check-stray-registry-line-unnamed",
    file: 'scripts/proof-check.mjs',
    claim: "a probed registry is told which line to delete: the probe's own, directly above the union's last case",
    find: "the line \"${REGISTRY_PROBE.trimEnd()}\" directly above \"${REGISTRY_ANCHOR.slice(1)}\"; ",
    replace: "the probe line; ",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: "proof-check-stray-registry-grep-shows-the-wrong-line",
    file: 'scripts/proof-check.mjs',
    claim: "the registry's grep shows the line ABOVE the union's last case, which is the probe, not only the last case itself",
    find: "\\`grep -n -B1 \"^${REGISTRY_ANCHOR.slice(1)}[[:space:]]*$\" ${REGISTRY}\\` shows it",
    replace: "\\`grep -n \"^${REGISTRY_ANCHOR.slice(1)}[[:space:]]*$\" ${REGISTRY}\\` shows it",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: "proof-check-stray-old-advice-returns",
    file: 'scripts/proof-check.mjs',
    claim: "the refusal does not also say `Restore it (git checkout -- <file>) before re-running.`",
    find: "      if (strays.length) {\n",
    replace: "      if (strays.length) {\n        console.error(`Restore ${strays.length > 1 ? 'them' : 'it'} (git checkout -- ${strays.join(' ')}) before re-running.`)\n",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: "proof-check-stray-plural-lost",
    file: 'scripts/proof-check.mjs',
    claim: "with both files injected the refusal says each file and those files, and names both in the one checkout",
    find: "const many = strays.length > 1",
    replace: "const many = false",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  // The checkout does nothing to an injection that is staged, which is what the pre-commit hook sees (review 7, finding L10, 2026-11-06): the sentence said "uncommitted".
  {
    id: "proof-check-stray-checkout-ignores-staging",
    file: 'scripts/proof-check.mjs',
    claim: "the refusal says the checkout removes an injection only while it is neither staged nor committed, and that on a staged one (the hook's state) it changes nothing",
    find: "only while that injection is neither staged nor committed (the pre-commit hook sees it staged, where the checkout changes nothing), and it discards every unstaged edit to ${many ? 'those files' : 'the file'}.`)",
    replace: "only while that injection is uncommitted, and it discards every unstaged edit to ${many ? 'those files' : 'the file'}.`)",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  // The printed greps end in `[[:space:]]*$`, not `$` (review 7, finding L11, 2026-11-06): on a registry whose lines end in a carriage return the plain `$` printed nothing, so "shows it" and "lists both" were false.
  {
    id: "proof-check-stray-grep-misses-a-carriage-return",
    file: 'scripts/proof-check.mjs',
    claim: "the grep the no-state refusal prints for a probe directly above the last case finds it on a registry with CRLF line ends",
    find: "\\`grep -n -B1 \"^${REGISTRY_ANCHOR.slice(1)}[[:space:]]*$\" ${REGISTRY}\\` shows it",
    replace: "\\`grep -n -B1 \"^${REGISTRY_ANCHOR.slice(1)}$\" ${REGISTRY}\\` shows it",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: "proof-check-moved-grep-misses-a-carriage-return",
    file: 'scripts/proof-check.mjs',
    claim: "the grep that lists both `| NHL` lines of a separated probe finds them on a registry with CRLF line ends",
    find: "\\`grep -n \"^${REGISTRY_PROBE.trimEnd()}[[:space:]]*$\" ${REGISTRY}\\` lists both)",
    replace: "\\`grep -n \"^${REGISTRY_PROBE.trimEnd()}$\" ${REGISTRY}\\` lists both)",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  // The block's extent (review 7, finding L12, 2026-11-06): "each header and the indented lines under it" leaves the blank line layout() writes after every block.
  {
    id: "proof-check-block-extent-is-headers-only",
    file: 'scripts/proof-check.mjs',
    claim: "the instruction for the injected block gives its real extent (first header through the line above the anchor), not the headers and indented lines, which leave a blank line per block",
    find: "? `the injected block in ${TARGET} (every line from the first \"${MARKER}N\" header down to the line directly above \"${ANCHOR}\", the blank line after each block included; ",
    replace: "? `the injected block in ${TARGET} (each \"${MARKER}N\" header and the indented lines under it; ",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  // A registry that REALLY ends `| NHL` then `| Unrecognised` (review 7, finding L13, 2026-11-06): the refusal named the line and would have a person delete a real case, and gave no way out.
  {
    id: "proof-check-probe-escape-unsaid",
    file: 'scripts/proof-check.mjs',
    claim: "the refusal over a probe directly above the last case says what to do when the line is a real case: keep it and put a line between the two",
    find: "shows it; if it is a real case instead, because a union of yours ends in it, keep it and put any line between the two (a doc comment will do): lines that are not adjacent no longer match)`\n            : removalOf",
    replace: "shows it)`\n            : removalOf",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  // --- a probe an edit has separated from the union's last case (review 6, finding 0, 2026-11-05) ----------------------------------------------------------------------------------------------
  //
  // The restore called a changed registry "carrying" only when the probe was directly above the last case, which a sport added there stops being true of: the registry was then called someone else's with
  // none of the run's code in it, the state was deleted and the probe stayed in the file. It is now carrying when the probe's line is there twice in one declaration (a union cannot have a case twice),
  // and the message says which file, that the probe is in it, and which line to delete. Each of these breaks one part of that and is caught by the clauses that run the real script with a sport saved
  // between the probe and the last case, with the probe taken out by hand, and over planted states.
  {
    id: "proof-carrying-needs-the-adjacent-probe",
    file: 'scripts/proof-check.mjs',
    claim: "a registry whose probe an edit has separated from the last case still carries it (the original defect: it was called someone else's and the state was deleted)",
    find: "const carriesProbe = src => probeOnRegistry(src) || probeDuplicated(src)",
    replace: "const carriesProbe = src => probeOnRegistry(src)",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: "proof-carrying-forgets-a-probe-with-no-case-of-its-own",
    file: 'scripts/proof-check.mjs',
    claim: "a probe directly above the last case is carrying even where the union's own `| NHL` has gone, which a count of the line cannot see",
    find: "probeOnRegistry(src) || probeDuplicated(src)",
    replace: "probeDuplicated(src)",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: "proof-carrying-is-any-nhl-case",
    file: 'scripts/proof-check.mjs',
    claim: "the registry's own `| NHL` case is not the probe: one line is a clean union, two are the probe",
    find: ".filter(l => l === REGISTRY_PROBE.trimEnd()).length > 1)",
    replace: ".filter(l => l === REGISTRY_PROBE.trimEnd()).length > 0)",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: "proof-carrying-counts-across-declarations",
    file: 'scripts/proof-check.mjs',
    claim: "two declarations that each have an `| NHL` of their own are not a probe: the line is counted per declaration",
    find: "src.split(/\\n(?=\\S)/).some(declaration =>",
    replace: "[src].some(declaration =>",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: "proof-restore-sees-only-an-adjacent-probe",
    file: 'scripts/proof-check.mjs',
    claim: "a changed registry whose probe a sport has been added in front of is carrying: left as found, with the state kept",
    find: ": carriesProbe(now)) ? 'carrying' : 'foreign'",
    replace: ": probeOnRegistry(now)) ? 'carrying' : 'foreign'",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: "proof-restore-calls-any-nhl-a-probe",
    file: 'scripts/proof-check.mjs',
    claim: "a registry the person took the probe out of is theirs, with none of the run's code in it, even though it has an `| NHL` of its own",
    find: ": carriesProbe(now)) ? 'carrying'",
    replace: ": now.includes(REGISTRY_PROBE)) ? 'carrying'",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: "proof-next-run-misses-a-separated-probe",
    file: 'scripts/proof-check.mjs',
    claim: "a killed run's registry whose probe a sport has been added in front of is not discarded as stale: the classifier is told it carries the probe",
    find: "  registryInjected: carriesProbe(currentRegistry),",
    replace: "  registryInjected: probeOnRegistry(currentRegistry),",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: "proof-diverged-omits-a-separated-probe",
    file: 'scripts/proof-check.mjs',
    claim: "the refusal says a registry carries the probe case when a sport sits between the probe and the last case",
    find: "if (carriesProbe(currentRegistry) && !registryStranded) reasons.push(",
    replace: "if (probeOnRegistry(currentRegistry) && !registryStranded) reasons.push(",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: "proof-no-state-guard-misses-a-separated-probe",
    file: 'scripts/proof-check.mjs',
    claim: "with no run state, a registry whose probe a sport has been added in front of is not adopted as the original",
    find: "      if (carriesProbe(currentRegistry)) strays.push(REGISTRY)",
    replace: "      if (probeOnRegistry(currentRegistry)) strays.push(REGISTRY)",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: "proof-no-state-says-directly-above-a-separated-probe",
    file: 'scripts/proof-check.mjs',
    claim: "the no-state refusal does not tell a person the probe is directly above the last case when a sport is between them",
    find: "          : probeOnRegistry(currentRegistry)\n            ?",
    replace: "          : true\n            ?",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: "proof-removal-omits-that-a-line-may-sit-between",
    file: 'scripts/proof-check.mjs',
    claim: "a person is told the probe's line may no longer be directly above the last case",
    find: "\"${REGISTRY_ANCHOR.slice(1)}\", and a line added since may now sit between them; ",
    replace: "\"${REGISTRY_ANCHOR.slice(1)}\"; ",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: "proof-removal-greps-the-line-above-the-last-case",
    file: 'scripts/proof-check.mjs',
    claim: "the grep for a probe an edit may have separated lists the `| NHL` lines, not the line above the last case (which is then the sport that was added)",
    find: "\\`grep -n \"^${REGISTRY_PROBE.trimEnd()}[[:space:]]*$\" ${REGISTRY}\\` lists both)",
    replace: "\\`grep -n -B1 \"^${REGISTRY_ANCHOR.slice(1)}[[:space:]]*$\" ${REGISTRY}\\` shows it)",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: "proof-removal-swaps-the-files",
    file: 'scripts/proof-check.mjs',
    claim: "the target is told to delete the proof functions and the registry the probe case, not the other way round",
    find: "const removalOf = file => file === TARGET",
    replace: "const removalOf = file => file !== TARGET",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: "proof-carrying-message-omits-the-lines-to-delete",
    file: 'scripts/proof-check.mjs',
    claim: "a restore that left a file carrying the run's code tells a person which lines to delete",
    find: "`: delete ${carrying.map(removalOf).join(' and ')}`",
    replace: "''",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: "proof-carrying-message-says-nothing-of-the-code",
    file: 'scripts/proof-check.mjs',
    claim: "the message says the file still carries the run's code, not only that it carries what was changed meanwhile",
    find: "still carries this run's ${f === TARGET ? 'proof functions' : 'probe case'}",
    replace: "also carries ${f === TARGET ? 'proof functions' : 'probe case'}",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: "proof-carrying-message-names-the-wrong-code",
    file: 'scripts/proof-check.mjs',
    claim: "the target is said to carry the proof functions and the registry the probe case, not the other way round",
    find: "f === TARGET ? 'proof functions' : 'probe case'",
    replace: "f === TARGET ? 'probe case' : 'proof functions'",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: "proof-carrying-message-leaves-the-carrying-file-off-the-list",
    file: 'scripts/proof-check.mjs',
    claim: "a file that carries the run's code is on the list of files to put right by hand",
    find: "Put ${named('failed', 'carrying').join(' and ')} right by hand",
    replace: "Put ${named('failed').join(' and ')} right by hand",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: "proof-failed-message-leaves-the-failed-file-off-the-list",
    file: 'scripts/proof-check.mjs',
    claim: "a file that could not be put back is on the list of files to put right by hand",
    find: "Put ${named('failed', 'carrying').join(' and ')} right by hand",
    replace: "Put ${named('carrying').join(' and ')} right by hand",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-marker-refusal-advises-kill-9',
    file: 'scripts/proof-check.mjs',
    claim: "the live-run refusal tells a person to stop a hung run with a plain kill, which stops it at once now that nothing in it catches a signal",
    find: "kill ${prior.pid}. The next run restores",
    replace: "kill -9 ${prior.pid}. The next run restores",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-marker-refusal-hides-what-the-pid-is',
    file: 'scripts/proof-check.mjs',
    claim: "the live-run refusal shows what the pid is running",
    find: "refusalLines(priorState, commandOf(priorState.pid))",
    replace: "refusalLines(priorState, null)",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-marker-refusal-ignores-a-missing-start',
    file: 'scripts/proof-check.mjs',
    claim: "a recorded start time is identity enough: only a marker without one is called unconfirmed",
    find: "  const unconfirmed = (prior.start === undefined || prior.start === null) && holder === null",
    replace: "  const unconfirmed = holder === null",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-marker-eperm-reads-as-dead',
    file: 'scripts/run-marker.mjs',
    claim: "a process of another user answers signal 0 with EPERM and is alive",
    find: "    if (e.code !== 'EPERM') return false",
    replace: "    return false",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: 'proof-marker-trusts-a-torn-down-process',
    file: 'scripts/run-marker.mjs',
    claim: "a process in state X is not running",
    find: "  if (s.state === 'Z' || s.state === 'X') return false",
    replace: "  if (s.state === 'Z') return false",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  // The marker is created exclusively (2026-11-04, residual Task 5): two runs started in the same tick could both proceed.
  {
    id: 'proof-marker-not-exclusive',
    file: "scripts/proof-check.mjs",
    claim: "the run's marker is created exclusively, so a marker that appeared since the check is refused, not written through",
    find: "{ flag: 'wx' }",
    replace: "{ flag: 'w' }",
    expect: "node scripts/proof-check.mjs --self-test",
  },
  {
    id: 'proof-marker-collision-carries-on',
    file: "scripts/proof-check.mjs",
    claim: "a run that lost the marker to another run stops before it builds or injects anything",
    find: "  process.exit(1)\n}\nwriteFileSync(BACKUP, source)\n",
    replace: "}\nwriteFileSync(BACKUP, source)\n",
    expect: "node scripts/proof-check.mjs --self-test",
  },
  // --- the marker first, and a link called what it is (review 6, findings 4 and 5, 2026-11-05) -----------------------------------------------------------------------------------------------------------
  //
  // The backups were written before the exclusive create, so a run that lost it (to another run, or to a link standing at the marker's path) overwrote the backups of the run that held it. The marker is
  // now created first, and a loser writes nothing into the state directory; a marker with no backups behind it is a kill before any injection and reads as stale. A link at the marker's path is not another
  // run, and the message says what it is and to remove it. Each of these breaks one part of that and is caught by the clauses that plant a link, plant a marker just before the create, and plant a marker alone.
  {
    id: "proof-state-written-before-the-marker",
    file: 'scripts/proof-check.mjs',
    claim: "a run that loses the exclusive create has written nothing into the state directory: the backups are written after it, not before",
    find: "mkdirSync(STATE_DIR, { recursive: true })\nconst runMarker = {",
    replace: "mkdirSync(STATE_DIR, { recursive: true })\nwriteFileSync(BACKUP, source)\nwriteFileSync(`${BACKUP}.registry`, registrySource)\nconst runMarker = {",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: "proof-link-called-another-run",
    file: 'scripts/proof-check.mjs',
    claim: "a link standing where the marker goes is told from another run's marker",
    find: "lstatSync(MARKER_FILE).isSymbolicLink() ? readlinkSync(MARKER_FILE) : null",
    replace: "null",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: "proof-another-run-called-a-link",
    file: 'scripts/proof-check.mjs',
    claim: "another run's marker is not called a link: the two messages are not swapped",
    find: "console.error(link === null\n",
    replace: "console.error(link !== null\n",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: "proof-link-message-offers-no-remedy",
    file: 'scripts/proof-check.mjs',
    claim: "the message over a link says to remove it, not to run again once another run has finished (which can never succeed)",
    find: "Remove it (rm ${MARKER_FILE}) and run this again.`)\n  process.exit(1)",
    replace: "Run this again once it has finished.`)\n  process.exit(1)",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: "proof-link-message-blames-another-run",
    file: 'scripts/proof-check.mjs',
    claim: "the message over a link says no other run is involved",
    find: "so no other run is involved. Remove it (rm ${MARKER_FILE}) and run this again.`)\n  process.exit(1)",
    replace: "so another run may be involved. Remove it (rm ${MARKER_FILE}) and run this again.`)\n  process.exit(1)",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: "proof-link-message-hides-where-it-points",
    file: 'scripts/proof-check.mjs',
    claim: "the message over a link says where the link points",
    find: "is a symbolic link (to ${link})",
    replace: "is a symbolic link",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: "proof-marker-without-backups-is-no-marker",
    file: 'scripts/proof-check.mjs',
    claim: "a marker with no backups behind it, a kill between the create and the backups, is a stale one and not a dead end",
    find: "  markerExists: priorState !== null,",
    replace: "  markerExists: priorState !== null && backupTarget !== null,",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  // A torn file is asked about per file, and before the heal (2026-11-05, residual Task 6): the target had an anchor input and the registry had none.
  {
    id: 'proof-heal-ignores-a-torn-registry',
    file: "scripts/proof-check.mjs",
    claim: "a registry with no last case, which may be torn, is not called clean or healed over, whatever the target holds",
    find: "|| (!registryStranded && !registryIntact && !registryAnchored)) return 'diverged'",
    replace: "|| (false)) return 'diverged'",
    expect: "node scripts/proof-check.mjs --self-test",
  },
  {
    id: 'proof-torn-file-checked-after-the-heal',
    file: "scripts/proof-check.mjs",
    claim: "a torn file is found before the heal, so a stranded file beside it cannot delete the state that holds the only whole copy",
    find: "  if ((!targetStranded && !targetIntact && !anchored) || (!registryStranded && !registryIntact && !registryAnchored)) return 'diverged'\n  if (targetStranded || registryStranded) return 'heal'\n",
    replace: "  if (targetStranded || registryStranded) return 'heal'\n  if ((!targetStranded && !targetIntact && !anchored) || (!registryStranded && !registryIntact && !registryAnchored)) return 'diverged'\n",
    expect: "node scripts/proof-check.mjs --self-test",
  },
  {
    id: 'proof-main-flow-registry-always-anchored',
    file: "scripts/proof-check.mjs",
    claim: "whether the registry still has its last case is read from the registry and handed to the classifier",
    find: "  registryAnchored: currentRegistry.includes(REGISTRY_ANCHOR),",
    replace: "  registryAnchored: true,",
    expect: "node scripts/proof-check.mjs --self-test",
  },
  {
    id: 'proof-diverged-omits-the-torn-target',
    file: "scripts/proof-check.mjs",
    claim: "the refusal over a target with no anchor names the target",
    find: "if (!targetStranded && !currentTarget.includes(ANCHOR)) reasons.push(",
    replace: "if (false) reasons.push(",
    expect: "node scripts/proof-check.mjs --self-test",
  },
  {
    id: 'proof-diverged-omits-the-torn-registry',
    file: "scripts/proof-check.mjs",
    claim: "the refusal over a registry with no last case names the registry",
    find: "if (!registryStranded && !currentRegistry.includes(REGISTRY_ANCHOR)) reasons.push(",
    replace: "if (false) reasons.push(",
    expect: "node scripts/proof-check.mjs --self-test",
  },
  // --- a file that is its backup is whole, anchor or not (review 6, finding 2, 2026-11-05) ----------------------------------------------------------------------------------------------------------
  //
  // The per-file anchor question ignored the intact flags the main flow already computes, so a registry whose last case had been renamed away, byte for byte its backup, was called possibly torn:
  // the stranded target beside it was refused, the message named the whole file, and the injection and the state stayed. A file is asked about its anchor only when it is not its backup.
  {
    id: "proof-classifier-asks-a-whole-target-for-an-anchor",
    file: 'scripts/proof-check.mjs',
    claim: "a target that is its backup is whole whether or not it has the anchor, so a stranded registry beside it is healed",
    find: "(!targetStranded && !targetIntact && !anchored)",
    replace: "(!targetStranded && !anchored)",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: "proof-classifier-asks-a-whole-registry-for-an-anchor",
    file: 'scripts/proof-check.mjs',
    claim: "a registry that is its backup is whole whether or not it has its last case, so a stranded target beside it is healed",
    find: "(!registryStranded && !registryIntact && !registryAnchored)",
    replace: "(!registryStranded && !registryAnchored)",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: "proof-classifier-asks-only-a-whole-target-for-an-anchor",
    file: 'scripts/proof-check.mjs',
    claim: "a target that is NOT its backup and has no anchor may be torn: it is the file asked, not the one excused",
    find: "(!targetStranded && !targetIntact && !anchored)",
    replace: "(!targetStranded && targetIntact && !anchored)",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: "proof-classifier-asks-only-a-whole-registry-for-an-anchor",
    file: 'scripts/proof-check.mjs',
    claim: "a registry that is NOT its backup and has no last case may be torn: it is the file asked, not the one excused",
    find: "(!registryStranded && !registryIntact && !registryAnchored)",
    replace: "(!registryStranded && registryIntact && !registryAnchored)",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: "proof-main-flow-target-never-intact",
    file: 'scripts/proof-check.mjs',
    claim: "whether the target is exactly its backup is read from the target and handed to the classifier",
    find: "  targetIntact: backupTarget !== null && currentTarget === backupTarget,",
    replace: "  targetIntact: false,",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: "proof-main-flow-registry-never-intact",
    file: 'scripts/proof-check.mjs',
    claim: "whether the registry is exactly its backup is read from the registry and handed to the classifier",
    find: "  registryIntact: backupRegistry !== null && currentRegistry === backupRegistry,",
    replace: "  registryIntact: false,",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  // A restore writes only over what is provably the run's own (2026-11-05, residual Task 4 and 10.17a): a file someone else changed during the run is left as found.
  {
    id: 'proof-restore-writes-whatever-is-on-disk',
    file: "scripts/proof-check.mjs",
    claim: "a restore writes only a file that is the original or a prefix of what the run last wrote, and leaves anything else as it found it",
    find: "    if (!ours(now, original, attempted.get(file))) return (file === TARGET ? now.includes(MARKER) : carriesProbe(now)) ? 'carrying' : 'foreign'\n",
    replace: "",
    expect: "node scripts/proof-check.mjs --self-test",
  },
  {
    id: 'proof-restore-needs-a-whole-injection',
    file: "scripts/proof-check.mjs",
    claim: "a half-written injection, a prefix of what the run tried to write, is still put back",
    find: "mine !== undefined && mine.startsWith(now)",
    replace: "mine !== undefined && mine === now",
    expect: "node scripts/proof-check.mjs --self-test",
  },
  {
    id: 'proof-injection-overwrites-a-changed-file',
    file: "scripts/proof-check.mjs",
    claim: "an injection is not written over a file that changed since the run last wrote it or read it",
    find: "  if (!ours(readFileSync(file, 'utf8'), original, attempted.get(file))) throw new Error(",
    replace: "  if (false) throw new Error(",
    expect: "node scripts/proof-check.mjs --self-test",
  },
  {
    id: 'proof-attempt-recorded-after-the-write',
    file: "scripts/proof-check.mjs",
    claim: "what the run tried to write is recorded before the write, so a write that fails part-way is still recognised as the run's",
    find: "  attempted.set(file, text)\n  writeFileSync(file, text)\n",
    replace: "  writeFileSync(file, text)\n  attempted.set(file, text)\n",
    expect: "node scripts/proof-check.mjs --self-test",
  },
  {
    id: 'proof-restore-stops-at-the-first-failed-file',
    file: "scripts/proof-check.mjs",
    claim: "each file is put back on its own: a target that cannot be restored does not keep the registry from going back",
    find: "  outcome[REGISTRY] = restoreOne(REGISTRY, registrySource)\n",
    replace: "  if (outcome[TARGET] !== 'ok') return false\n  outcome[REGISTRY] = restoreOne(REGISTRY, registrySource)\n",
    expect: "node scripts/proof-check.mjs --self-test",
  },
  {
    id: 'proof-foreign-file-with-our-code-drops-the-state',
    file: "scripts/proof-check.mjs",
    claim: "a file someone else changed that still carries the run's injection keeps the state, which holds the original",
    find: "if (failed.length === 0 && carrying.length === 0) { dropState(); return }",
    replace: "if (failed.length === 0) { dropState(); return }",
    expect: "node scripts/proof-check.mjs --self-test",
  },
  {
    id: 'proof-restore-never-sees-a-carried-injection',
    file: "scripts/proof-check.mjs",
    claim: "a changed target that still carries the run's proof functions is told from one that carries none",
    find: "(file === TARGET ? now.includes(MARKER) : carriesProbe(now))",
    replace: "(file === TARGET ? false : carriesProbe(now))",
    expect: "node scripts/proof-check.mjs --self-test",
  },
  {
    id: 'proof-restore-never-sees-a-carried-probe',
    file: "scripts/proof-check.mjs",
    claim: "a changed registry that still carries the run's probe case is told from one that carries none",
    find: "(file === TARGET ? now.includes(MARKER) : carriesProbe(now))",
    replace: "(file === TARGET ? now.includes(MARKER) : false)",
    expect: "node scripts/proof-check.mjs --self-test",
  },
  {
    id: 'proof-foreign-change-goes-unsaid',
    file: "scripts/proof-check.mjs",
    claim: "a run during which a file was changed by someone else says which file, and that it was left as found",
    find: " changed while the run was going and was left exactly as found (nothing was written over ",
    replace: " is fine (nothing was written over ",
    expect: "node scripts/proof-check.mjs --self-test",
  },
  {
    id: 'proof-restore-failure-names-an-unreadable-file',
    file: "scripts/proof-check.mjs",
    claim: "a restore that cannot even read a file names that file, not \"the original files\"",
    find: "${failed.join(' and ')} could NOT be put back",
    replace: "the original files could NOT be put back",
    expect: "node scripts/proof-check.mjs --self-test",
  },
  // proof-check registers no signal handler (2026-11-05, residual Task 7): one could not run during the synchronous run, so a kill, Ctrl-C and a hangup stop the run at once and the next run heals.
  {
    id: 'proof-signal-handler-swallows-sigterm',
    file: "scripts/proof-check.mjs",
    claim: "a plain kill stops the run at once: nothing in it catches SIGTERM",
    find: "process.on('exit', restore)\n",
    replace: "process.on('exit', restore)\nprocess.on('SIGTERM', () => {})\n",
    expect: "node scripts/proof-check.mjs --self-test",
  },
  {
    id: 'proof-signal-handler-swallows-sigint',
    file: "scripts/proof-check.mjs",
    claim: "Ctrl-C stops the run at once: nothing in it catches SIGINT",
    find: "process.on('exit', restore)\n",
    replace: "process.on('exit', restore)\nprocess.on('SIGINT', () => {})\n",
    expect: "node scripts/proof-check.mjs --self-test",
  },
  {
    id: 'proof-signal-handler-swallows-sighup',
    file: "scripts/proof-check.mjs",
    claim: "a hangup stops the run at once: nothing in it catches SIGHUP",
    find: "process.on('exit', restore)\n",
    replace: "process.on('exit', restore)\nprocess.on('SIGHUP', () => {})\n",
    expect: "node scripts/proof-check.mjs --self-test",
  },
  // The system git configuration is asked of git itself (2026-11-05, residual 10.17c): a variable name wrong in the code and in the clause that pins it passed the name-pinning clause alone.
  {
    id: 'proof-git-system-config-honoured-by-git',
    file: "scripts/proof-check.mjs",
    claim: "the scratch repository's environment makes git itself ignore the system configuration, whatever the variable is called",
    find: "GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' })",
    replace: "GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NO_SYSTEM: '1' })",
    expect: "node scripts/proof-check.mjs --self-test",
  },
  {
    id: 'proof-git-system-plant-ignored',
    file: "scripts/proof-check.mjs",
    claim: "the by-effect check of the system configuration is not vacuous: its control must read a plant git honours",
    find: "GIT_CONFIG_SYSTEM: join(dir, 'system.gitconfig')",
    replace: "GIT_CONFIG_SYSTM: join(dir, 'system.gitconfig')",
    expect: "node scripts/proof-check.mjs --self-test",
  },
  // --- assertions that could not fail (review 6, finding 3 and the proof-check part of 6, 2026-11-05) ----------------------------------------------------------------------------------------
  //
  // Each of these survived the self-test: the prefix rule of `ours` (a suffix or a middle chunk passed as the run's own), the non-EEXIST branch of the marker create, the four-space boundary of a proof
  // body, and what `inject` throws. A clause now holds each.
  {
    id: "proof-ours-accepts-a-chunk-of-the-injection",
    file: 'scripts/proof-check.mjs',
    claim: "only the head of what the run wrote is the run's own: a suffix or a middle chunk of it is a file someone else changed",
    find: "mine !== undefined && mine.startsWith(now)",
    replace: "mine !== undefined && mine.includes(now)",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: "proof-marker-create-error-swallowed",
    file: 'scripts/proof-check.mjs',
    claim: "a marker that cannot be created for a reason that is not another run throws, and is not reported as another run",
    find: "if (e.code !== 'EEXIST') throw e",
    replace: "void e",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: "proof-body-shape-accepts-one-space",
    file: 'scripts/proof-check.mjs',
    claim: "a line indented by one space in the gap above the anchor is newer work, not a line of a proof body",
    find: "l === '' || l.startsWith('    ') || l.startsWith(MARKER)",
    replace: "l === '' || l.startsWith(' ') || l.startsWith(MARKER)",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: "proof-body-shape-accepts-three-spaces",
    file: 'scripts/proof-check.mjs',
    claim: "a line indented by three spaces in the gap above the anchor is newer work: a proof body is indented by exactly four",
    find: "l === '' || l.startsWith('    ') || l.startsWith(MARKER)",
    replace: "l === '' || l.startsWith('   ') || l.startsWith(MARKER)",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  {
    id: "proof-inject-throws-no-error",
    file: 'scripts/proof-check.mjs',
    claim: "an injection refused because the file changed throws an Error that says so, not a bare value",
    find: "throw new Error(`${file} changed while the run was going, so nothing was written to it`)",
    replace: "throw 0",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  // A registry that moved on but kept its last case (review 6, finding 14, 2026-11-06). `proof-main-flow-registry-always-intact` is caught by the fixtures whose registry has LOST its last case; this
  // one reads an anchored registry as intact, and only a fixture that keeps the anchor (a registry that is not its backup, under a marker that records a failed restore) can tell.
  {
    id: "proof-main-flow-registry-intact-when-anchored",
    file: 'scripts/proof-check.mjs',
    claim: "a registry that keeps its last case but is not its backup is not called intact: after a failed restore the state that holds its only whole copy is kept",
    find: "  registryIntact: backupRegistry !== null && currentRegistry === backupRegistry,",
    replace: "  registryIntact: backupRegistry !== null && (currentRegistry === backupRegistry || currentRegistry.includes(REGISTRY_ANCHOR.slice(1))),",
    expect: 'node scripts/proof-check.mjs --self-test',
  },
  // --- the Draw panel -------------------------------------------------------
  //
  // The canonical-size law has FOUR answers and two of them are "not compared".
  // For two months the exempt ones rendered identically to a pass, and nine of
  // ten Masters draws were reported corrupt on the strength of it. These break
  // the exemption in both directions: remove it, and impose it everywhere.
  {
    id: 'entry-round-compared',
    file: 'src/Draw.fs',
    claim: 'the entry round has no canonical size and is never compared to one',
    find: '        if Some r = entry then r, EntryRoundNotCompared have',
    replace: '        if false then r, EntryRoundNotCompared have',
    expect: "URL='http://localhost:8080/?tab=draw' node scripts/draw-render-check.mjs",
  },
  {
    id: 'everything-exempt',
    file: 'src/Draw.fs',
    claim: 'the exemption covers two rounds, not the whole draw',
    find: '        elif have = want then r, AtCanonicalSize have',
    replace: '        elif true then r, EntryRoundNotCompared have',
    expect: "URL='http://localhost:8080/?tab=draw' node scripts/draw-render-check.mjs",
  },
  // The scoreline refusal, which is the finding this panel exists to surface:
  // match 36028's 6-4 set carrying `tiebreak: [40, 15]`. Both directions of the
  // classifier, because one that always answers the same case would satisfy
  // whichever row was written first.
  {
    id: 'tiebreak-not-distinguished',
    file: 'src/Tennis.fs',
    claim: 'an illegal tiebreak on a legal set score is reported as a tiebreak',
    find: '    | Some(x, y), Some _ -> IllegalTiebreak(i, a, b, x, y)',
    replace: '    | Some(x, y), Some _ -> IllegalCompletedSet(i, a, b)',
    expect: 'node build/VerifyMain.js',
  },
  {
    id: 'everything-a-tiebreak',
    file: 'src/Tennis.fs',
    claim: 'an illegal set score with no tiebreak stays a set-score refusal',
    find: '    | _ -> IllegalCompletedSet(i, a, b)',
    replace: '    | _ -> IllegalTiebreak(i, a, b, 0, 0)',
    expect: 'node build/VerifyMain.js',
  },
  {
    // The axis manifest is committed to outbox/ by live-check, which makes it
    // the only readable evidence that the score's weight axis interpolates on
    // the deployed page — the run log holds the same numbers and the authoring
    // sandbox cannot fetch it. Pinning the control to a constant publishes a
    // manifest that says the measurement discriminates whatever it measured.
    // If this survives, nothing checks that the published field tracks the
    // sweep rather than the answer that was wanted.
    id: 'axis-manifest-control-pinned',
    file: 'scripts/axis-check.mjs',
    claim: 'the manifest reports the control sweep it measured, not a constant',
    find: '  controlRises: strictlyRising(m.controlWidths),',
    replace: '  controlRises: false,',
    expect: 'node scripts/axis-check.mjs --self-test',
  },
  {
    // The field held a bare `npm install` for 61 days (2026-08-09 -> 2026-10-09)
    // and killed every new session in the environment. The field itself cannot
    // be read from a session; the block a human copies out of the doc can be,
    // and that block is the only thing standing between the next paste and the
    // same outage. If this survives, npm can return to the documented block
    // with nothing objecting.
    id: 'paste-block-tolerates-npm',
    file: 'scripts/setup-script-check.mjs',
    claim: 'the documented paste block is refused for naming npm',
    find: "  if (/\\bnpm\\b/.test(block)) out.push('names npm",
    replace: "  if (false && /\\bnpm\\b/.test(block)) out.push('names npm",
    expect: 'node scripts/setup-script-check.mjs --self-test',
  },

  {
    // npm runs `prebuild` before `build` with nothing naming it, so a walk
    // that follows only named invocations calls a pre-script an orphan while
    // npm executes it on every build. Measured: this is how
    // session-ready-check.mjs read as unreachable. Dropping the lifecycle hop
    // restores that blindness, and the orphan ledger is the file that decides
    // whether a script is deliberately retired or accidentally orphaned.
    id: 'orphan-walk-skips-lifecycle-scripts',
    file: 'scripts/check-script-orphans.mjs',
    claim: 'the reachability walk follows npm pre/post lifecycle scripts, which nothing names',
    find: '    for (const n of [`pre${name}`, `post${name}`]) walk(n)',
    replace: '    for (const n of []) walk(n)',
    expect: 'node scripts/check-script-orphans.mjs --self-test',
  },

  {
    // An un-bootstrapped session is only dangerous because it is INVISIBLE:
    // nothing in the repo distinguished it from a bootstrapped one, and twelve
    // commits shipped source with no outbox entry from exactly that state on
    // 2026-10-08/09. Reporting `unset` as `installed` restores the invisibility
    // while leaving the check green, which is the one failure mode that matters.
    id: 'readiness-calls-an-unset-guard-installed',
    file: 'scripts/session-ready-check.mjs',
    claim: 'the readiness probe distinguishes an installed outbox guard from an absent one',
    find: "  guard: hooksPath === '.githooks' ? 'installed'",
    replace: "  guard: 'installed' || hooksPath === '.githooks' ? 'installed'",
    expect: 'node scripts/session-ready-check.mjs --self-test',
  },

  {
    // The gate runs `--only known-survivor` immediately after the full suite,
    // and the baseline used to be written unconditionally — so the committed
    // artifact was the one-mutation run's, every time. verify-full #25 scored
    // 530/530 and recorded `ran: 1`. If this survives, nothing stops the full
    // suite's measurement being destroyed by the command that follows it.
    id: 'baseline-written-by-any-run',
    file: 'scripts/mutation-check.mjs',
    claim: 'only a FULL run writes the baseline artifact, so --only cannot overwrite it',
    find: 'const ownsBaseline = (only) => only === null',
    replace: 'const ownsBaseline = (only) => true',
    expect: 'node scripts/mutation-check.mjs --self-test',
  },

  {
    // One wall-clock field and every live-check run commits — the daily
    // schedule plus every deploy, forever, each saying the page is unchanged.
    // status.yml states the rule for STATUS.md ("a log of things happening, not
    // one commit a day saying nothing") and this manifest obeys it by carrying
    // no such field. If this survives, that property is prose and not a check.
    id: 'axis-manifest-timestamped',
    file: 'scripts/axis-check.mjs',
    claim: 'the committed manifest carries no wall-clock field, so a quiet run stays quiet',
    find: '  url: m.url ?? null,',
    replace: '  at: new Date().toISOString(),\n  url: m.url ?? null,',
    expect: 'node scripts/axis-check.mjs --self-test',
  },

  {
    // A 200 IS NOT A CORPUS.
    //
    // Run 38145971449 read 120 dates, reported "0 unavailable", and saw 140
    // games where the healthy relay serves 1341 — it sat between two FAILED
    // relay deploys and every response was a 200. That reading was then
    // recorded as a BASELINE in field-relay-nba's misjoined-opening-odds
    // document, and every later comparison was against a tenth of the archive.
    //
    // Deleting the comparison restores exactly that: a degraded run publishes a
    // number, and nothing objects.
    id: 'census-trusts-a-collapsed-corpus',
    file: 'scripts/favourite-band-census.mjs',
    claim: 'a census whose corpus collapsed refuses rather than publishing a number',
    find: '  if (before === 0) return null;\n  return after < before * floorRatio',
    replace: '  if (before === 0) return null;\n  return false && after < before * floorRatio',
    expect: 'node scripts/favourite-band-census.mjs --self-test',
  },
  {
    // The floor is half. Loosening it to a tenth passes the real collapse —
    // 1.17 games a date against 11.18 — while still looking like a guard.
    id: 'census-collapse-floor-loosened',
    file: 'scripts/favourite-band-census.mjs',
    claim: 'the collapse floor is tight enough to catch the one that actually happened',
    find: 'export function collapsedSince(prev, now, floorRatio = 0.5) {',
    replace: 'export function collapsedSince(prev, now, floorRatio = 0.05) {',
    expect: 'node scripts/favourite-band-census.mjs --self-test',
  },

  {
    // THE PIN MUST NOT BECOME A PERMANENT EXEMPTION.
    //
    // docs/adhd-skill-pin.json accepts one divergence between the installed
    // i-have-adhd skill and upstream, at two named hashes. The whole value of
    // naming BOTH is that a later hand-edit of the local copy is not covered —
    // and a hand-edit is the exact failure install-adhd-skill.mjs was written
    // to rule out. Dropping the local half turns a narrow exemption into
    // "ignore this file", with the pin's prose still claiming otherwise.
    id: 'pin-blesses-a-hand-edit',
    file: 'scripts/install-adhd-skill.mjs',
    claim: 'a pinned divergence does not cover a later edit of the local copy',
    find: '  if (localOk && upstreamOk) return \'pinned\'',
    replace: '  if (upstreamOk) return \'pinned\'',
    expect: 'node scripts/install-adhd-skill.mjs --self-test',
  },
  {
    // The other half. A divergence accepted against one upstream revision is
    // not accepted against the next: upstream could rewrite the rules
    // tomorrow and the pin would keep reporting ok, because the local file
    // never moved. The check would then be measuring nothing while printing a
    // reason that was true about a different document.
    id: 'pin-blesses-a-moved-upstream',
    file: 'scripts/install-adhd-skill.mjs',
    claim: 'a divergence accepted for one upstream revision is not accepted for the next',
    find: '  if (localOk && upstreamOk) return \'pinned\'',
    replace: '  if (localOk) return \'pinned\'',
    expect: 'node scripts/install-adhd-skill.mjs --self-test',
  },
  {
    // A pin is only honest if it keeps saying so. Silencing the report turns an
    // accepted difference into a clean bill of health, and an exemption nobody
    // is reminded of is an exemption nobody revisits.
    id: 'pin-goes-quiet',
    file: 'scripts/install-adhd-skill.mjs',
    claim: 'a pinned run REPORTS the divergence rather than printing ok',
    find: "      console.log(`ok — ${DEST} DIVERGES from source, and the divergence is pinned.`)",
    replace: "      console.log(`ok — ${DEST} is byte-identical to source`)",
    expect: 'node scripts/check-adhd-pin-reports.mjs',
  },

  {
    // A check script killed while its own output is still in flight.
    //
    // `process.exit()` drops pending asynchronous stdout writes, and to a pipe
    // — execSync, a CI log runner — that means the tail of a run vanishes.
    // `checks.mjs` prints the ::error annotations immediately before exiting,
    // so the lost tail is the only machine-readable record of WHY a step went
    // red. Measured on the compiled F# suite: 5 of 20 piped runs under load.
    //
    // Restoring the pattern is a one-word edit that looks like a tidy-up. If
    // this survives, `finish()` is a convention and not a rule.
    id: 'exit-kills-a-script-mid-write',
    file: 'scripts/workflow-check.mjs',
    claim: 'no check script ends by killing itself while its output is in flight',
    find: '\nfinish(summarize())',
    replace: '\nprocess.exit(summarize() === 0 ? 0 : 1)',
    expect: 'node scripts/check-exit-drains.mjs',
  },
  {
    // The other half. The early exits are frozen at a count rather than
    // converted, because converting them would let a --self-test run fall
    // through into a live half that needs a browser or the network. A ratchet
    // that cannot detect growth is a number in a file.
    id: 'early-exit-ratchet-grows',
    file: 'scripts/glyph-check.mjs',
    claim: 'a NEW early process.exit(summarize()) cannot be added unnoticed',
    find: "const PICTOGRAPH =",
    replace: "if (false) process.exit(summarize())\nconst PICTOGRAPH =",
    expect: 'node scripts/check-exit-drains.mjs',
  },

  {
    // The exit scan (2026-11-05). `check-exit-drains.mjs` blanked comments and strings with five regular-expression passes over the whole text, and three of the 63 early report exits
    // in scripts/ were invisible to them from the day the budget was set. It shares `scripts/strip-non-code.mjs` with `row-confidence.mjs` now; one entry per branch of the blank, each
    // the line a clause of `check-exit-drains.mjs --self-test` stands on, and one on the budget's equality half (the existing entry above holds the growth half).
    id: 'exit-scan-reverts-to-regex-chain',
    file: 'scripts/check-exit-drains.mjs',
    claim: "the exit scan reads comments, strings, regular expressions and templates as a scanner does, not as five passes that pair quotes, backticks and comment openers wherever they fall",
    find: "export const codeOnly = blankNonCode",
    replace: "export const codeOnly = src =>\n  src\n    .replace(/\\/\\*[\\s\\S]*?\\*\\//g, m => m.replace(/[^\\n]/g, ' '))\n    .replace(/\\/\\/[^\\n]*/g, m => ' '.repeat(m.length))\n    .replace(/'(?:\\\\.|[^'\\\\\\n])*'/g, m => ' '.repeat(m.length))\n    .replace(/\"(?:\\\\.|[^\"\\\\\\n])*\"/g, m => ' '.repeat(m.length))\n    .replace(/`(?:\\\\.|[^`\\\\])*`/g, m => m.replace(/[^\\n]/g, ' '))",
    expect: 'node scripts/check-exit-drains.mjs --self-test',
  },
  {
    id: 'exit-blank-keeps-every-span',
    file: 'scripts/strip-non-code.mjs',
    claim: "the blank is made of the spans the scan found: with none of them blanked, a report exit in a comment, a string, a regular expression or a template counts",
    find: "for (const [s, e] of spans) if (which(s)) for (let i = s; i < e; i++) if (chars[i] !== '\\n') chars[i] = ' '",
    replace: "for (const [s, e] of []) if (which(s)) for (let i = s; i < e; i++) if (chars[i] !== '\\n') chars[i] = ' '",
    expect: 'node scripts/check-exit-drains.mjs --self-test',
  },
  {
    id: 'exit-blank-eats-newlines',
    file: 'scripts/strip-non-code.mjs',
    claim: "the blank keeps the line feeds, so a line found in it is the line of the source",
    find: "if (chars[i] !== '\\n') chars[i] = ' '\n  return",
    replace: "chars[i] = ' '\n  return",
    expect: 'node scripts/check-exit-drains.mjs --self-test',
  },
  {
    id: 'exit-blank-keeps-regex',
    file: 'scripts/strip-non-code.mjs',
    claim: "a report exit inside a regular-expression literal is not an exit (the old passes did not blank one at all)",
    find: "        spans.push([s, i])\n        out += '0'",
    replace: "        out += '0'",
    expect: 'node scripts/check-exit-drains.mjs --self-test',
  },
  {
    id: 'exit-blank-keeps-template',
    file: 'scripts/strip-non-code.mjs',
    claim: "a report exit inside a template literal is not an exit",
    find: "i = skipTemplate(i + 1); spans.push([s, i]); out += \"''\"; continue }",
    replace: "i = skipTemplate(i + 1); out += \"''\"; continue }",
    expect: 'node scripts/check-exit-drains.mjs --self-test',
  },
  {
    id: 'exit-blank-keeps-line-comment',
    file: 'scripts/strip-non-code.mjs',
    claim: "a report exit in a line comment is not an exit",
    find: "while (i < n && !isEol(src[i])) i++; spans.push([s, i]); continue }",
    replace: "while (i < n && !isEol(src[i])) i++; continue }",
    expect: 'node scripts/check-exit-drains.mjs --self-test',
  },
  {
    id: 'exit-blank-keeps-block-comment',
    file: 'scripts/strip-non-code.mjs',
    claim: "a report exit in a block comment is not an exit",
    find: "i = end < 0 ? n : end + 2; spans.push([s, i]); out += [...src.slice(s, i)].some(isEol) ? '\\n' : ' '; continue }",
    replace: "i = end < 0 ? n : end + 2; out += [...src.slice(s, i)].some(isEol) ? '\\n' : ' '; continue }",
    expect: 'node scripts/check-exit-drains.mjs --self-test',
  },
  {
    id: 'exit-blank-keeps-strings',
    file: 'scripts/strip-non-code.mjs',
    claim: "a report exit inside a string is not an exit",
    find: "        if (src[i] === c) i++\n        spans.push([s, i])\n",
    replace: "        if (src[i] === c) i++\n",
    expect: 'node scripts/check-exit-drains.mjs --self-test',
  },
  {
    id: 'exit-span-ends-past-the-text',
    file: 'scripts/strip-non-code.mjs',
    claim: "a text that ends inside a string, a template or a regular expression is blanked to the same length",
    find: "spans: spans.map(([s, e]) => [s, Math.min(e, n)])",
    replace: "spans",
    expect: 'node scripts/check-exit-drains.mjs --self-test',
  },
  {
    id: 'exit-budget-loose',
    file: 'docs/early-exit-budget.txt',
    claim: "the early-exit budget is the count, not a number above it: a loose budget is a ratchet with slack in it",
    find: "63",
    replace: "64",
    expect: 'node scripts/check-exit-drains.mjs',
  },

  {
    // The short-circuit guard's own scan (2026-11-05). `short-circuit-check.mjs` decided what a comment is with a regular expression over the whole text and a rule per line, so a `/*` inside a
    // string (`'/**'`) or a line comment (`src/*.js`) opened a "comment" that ran to the next `*/` and took the lines between with it: planting a short-circuited pair at every statement start of
    // every script, 81 of 16,281 positions in 10 scripts were not seen. It blanks with `blankComments` (`scripts/strip-non-code.mjs`) now. One entry for the swap back, one for no blank at all, and
    // one per branch of the comment blank, each the line a clause of `short-circuit-check.mjs --self-test` stands on.
    id: 'short-circuit-reads-comments-by-regex',
    file: 'scripts/short-circuit-check.mjs',
    claim: "the short-circuit scan sees an offence after a /* in a string or a line comment, and reports the line it is on: a scanner decides what a comment is, not a regular expression over the whole text",
    find: "  blankComments(src)\n    .split('\\n')",
    replace: "  src\n    .replace(/\\/\\*[\\s\\S]*?\\*\\//g, '')\n    .split('\\n')\n    .map(l => l.replace(/(^|[^:])\\/\\/.*$/, '$1'))\n    .join('\\n')\n    .split('\\n')",
    expect: 'node scripts/short-circuit-check.mjs --self-test',
  },
  {
    id: 'short-circuit-scans-comments',
    file: 'scripts/short-circuit-check.mjs',
    claim: "a banned form in a comment is not an offence: the guard's own header quotes every one of them",
    find: "  blankComments(src)\n    .split('\\n')",
    replace: "  src\n    .split('\\n')",
    expect: 'node scripts/short-circuit-check.mjs --self-test',
  },
  {
    id: 'comment-blank-takes-strings',
    file: 'scripts/strip-non-code.mjs',
    claim: "the comment blank leaves strings, regular expressions and templates alone: a call inside a template's ${} is code, and blanking it hides it from the short-circuit scan",
    find: "s => src[s] === '/' && (src[s + 1] === '/' || src[s + 1] === '*'))",
    replace: "() => true)",
    expect: 'node scripts/short-circuit-check.mjs --self-test',
  },
  {
    id: 'comment-blank-keeps-block-comments',
    file: 'scripts/strip-non-code.mjs',
    claim: "a block comment is blanked, on one line or several",
    find: "(src[s + 1] === '/' || src[s + 1] === '*')",
    replace: "src[s + 1] === '/'",
    expect: 'node scripts/short-circuit-check.mjs --self-test',
  },
  {
    id: 'comment-blank-keeps-line-comments',
    file: 'scripts/strip-non-code.mjs',
    claim: "a line comment is blanked",
    find: "(src[s + 1] === '/' || src[s + 1] === '*')",
    replace: "src[s + 1] === '*'",
    expect: 'node scripts/short-circuit-check.mjs --self-test',
  },
  {
    id: 'comment-blank-eats-newlines',
    file: 'scripts/strip-non-code.mjs',
    claim: "the comment blank keeps the line feeds, so an offence is reported on the line of the source after a block comment of several lines",
    find: "if (chars[i] !== '\\n') chars[i] = ' '\n  return",
    replace: "chars[i] = ' '\n  return",
    expect: 'node scripts/short-circuit-check.mjs --self-test',
  },

  {
    // The orphan walk's own scan (2026-11-05). `check-script-orphans.mjs` reads the edges a script makes (`node scripts/x.mjs`, which live in strings) after removing comments, and it removed them with
    // a block-comment regular expression over the whole text and a `//` rule: a `/*` in a string or a line comment, or a `//` after a space in a string, lost the edges after it (88 of 16,289 planted
    // positions in 11 scripts), and a `//` that followed code with no space was not removed at all, so a comment became an edge (16,201 of 16,289). It blanks with `blankComments` now; the entries
    // are the swap back, no blank at all, and the two properties of the blank this consumer stands on (strings are left alone, a string that begins with a slash pair is a string).
    id: 'orphan-comments-read-by-regex',
    file: 'scripts/check-script-orphans.mjs',
    claim: "the edges a script makes survive a /* in a string or a line comment and a // after a space in a string, and a comment after code with no space is not an edge: a scanner decides what a comment is",
    find: "export const stripJsComments = blankComments",
    replace: "export const stripJsComments = t => t.replace(/\\/\\*[\\s\\S]*?\\*\\//g, '').replace(/(^|\\s)\\/\\/.*$/gm, '$1')",
    expect: 'node scripts/check-script-orphans.mjs --self-test',
  },
  {
    id: 'orphan-edges-read-comments',
    file: 'scripts/check-script-orphans.mjs',
    claim: "a script named in a comment is not an edge to it: prose that names a file must not make a retired probe read as reachable",
    find: "export const stripJsComments = blankComments",
    replace: "export const stripJsComments = t => t",
    expect: 'node scripts/check-script-orphans.mjs --self-test',
  },
  {
    id: 'orphan-edges-blanked-with-the-strings',
    file: 'scripts/strip-non-code.mjs',
    claim: "the comment blank leaves strings alone, because the edges the orphan walk reads (`node scripts/x.mjs`) are in them",
    find: "s => src[s] === '/' && (src[s + 1] === '/' || src[s + 1] === '*'))",
    replace: "() => true)",
    expect: 'node scripts/check-script-orphans.mjs --self-test',
  },
  {
    id: 'comment-blank-takes-slash-strings',
    file: 'scripts/strip-non-code.mjs',
    claim: "a span is a comment because it STARTS with // or /*: a string that merely begins with those characters after its quote is a string, and the edge in it stays",
    find: "src[s] === '/' && (",
    replace: "(",
    expect: 'node scripts/check-script-orphans.mjs --self-test',
  },

  {
    // The lineups guard's F# scan (2026-11-05). `check-lineups-pull-only.mjs` blanked F# comments with two regular expressions (a `//` to the end of the line wherever it stood, and `(* *)` paired over the whole
    // text), so a `//` inside a string (`"https://…" in setInterval(…)`) hid the timer after it, and a nested comment ended at its first `*)`. It reads F# with a scanner now; the guard's whole claim
    // ("nothing in the lineups source asks to be run again") rests on it, so there is one entry per branch of it. Each is the line a fixture of its `--self-test` stands on.
    id: 'lineups-comments-by-regex',
    file: 'scripts/check-lineups-pull-only.mjs',
    claim: "the lineups guard reads F# comments with a scanner: a // or a (* inside a string, a // inside a block comment, and a nested comment are not what two regular expressions over the whole text take them for",
    find: "export const codeOnly = src => {\n  const n = src.length",
    replace: "export const codeOnly = src => src.replace(/\\/\\/\\/?[^\\n]*/g, '').replace(/\\(\\*[\\s\\S]*?\\*\\)/g, '')\nexport const codeOnlyScan = src => {\n  const n = src.length",
    expect: 'node scripts/check-lineups-pull-only.mjs --self-test',
  },
  {
    id: 'lineups-line-comments-kept',
    file: 'scripts/check-lineups-pull-only.mjs',
    claim: "a timer named in a // or /// comment is not a timer",
    find: "if (c === '/' && src[i + 1] === '/') { const s = i; while (i < n && src[i] !== '\\n') i++; blank(s, i); continue }",
    replace: "if (c === '/' && src[i + 1] === '/') { const s = i; while (i < n && src[i] !== '\\n') i++; continue }",
    expect: 'node scripts/check-lineups-pull-only.mjs --self-test',
  },
  {
    id: 'lineups-block-comments-kept',
    file: 'scripts/check-lineups-pull-only.mjs',
    claim: "a timer named in a (* *) comment is not a timer",
    find: "{ const s = i; i = skipComment(i + 2); blank(s, i); continue }",
    replace: "{ const s = i; i = skipComment(i + 2); continue }",
    expect: 'node scripts/check-lineups-pull-only.mjs --self-test',
  },
  {
    id: 'lineups-comments-do-not-nest',
    file: 'scripts/check-lineups-pull-only.mjs',
    claim: "a (* *) comment nests: a timer after the first *) of a nested one is still inside the comment",
    find: "if (c === '(' && src[i + 1] === '*') { depth++; i += 2; continue }",
    replace: "if (c === '(' && src[i + 1] === '*') { i += 2; continue }",
    expect: 'node scripts/check-lineups-pull-only.mjs --self-test',
  },
  {
    id: 'lineups-comment-strings-unread',
    file: 'scripts/check-lineups-pull-only.mjs',
    claim: "a string inside a (* *) comment is read as a string: a *) in it does not end the comment",
    find: "if (c === '\"' || (c === '@' && src[i + 1] === '\"')) { i = skipString(i); continue }",
    replace: "if (false) { i = skipString(i); continue }",
    expect: 'node scripts/check-lineups-pull-only.mjs --self-test',
  },
  {
    id: 'lineups-comment-chars-unread',
    file: 'scripts/check-lineups-pull-only.mjs',
    claim: "a character literal inside a (* *) comment is read as one: the quote in '\"' does not open a string",
    find: "if (c === \"'\") { i = charEnd(i); continue }\n      i++\n    }\n    return n\n  }\n  // Code from",
    replace: "if (false) { i = charEnd(i); continue }\n      i++\n    }\n    return n\n  }\n  // Code from",
    expect: 'node scripts/check-lineups-pull-only.mjs --self-test',
  },
  {
    id: 'lineups-code-chars-unread',
    file: 'scripts/check-lineups-pull-only.mjs',
    claim: "a character literal in code is read as one: the quote in '\"' does not open a string that swallows the code after it",
    find: "if (c === \"'\") { i = charEnd(i); continue }\n      if (inHole)",
    replace: "if (false) { i = charEnd(i); continue }\n      if (inHole)",
    expect: 'node scripts/check-lineups-pull-only.mjs --self-test',
  },
  {
    id: 'lineups-paren-star-paren-opens-a-comment',
    file: 'scripts/check-lineups-pull-only.mjs',
    claim: "(*) in code is the multiplication operator, not the start of a comment that hides the code after it",
    find: "if (src.startsWith('(*', i) && !src.startsWith('(*)', i))",
    replace: "if (src.startsWith('(*', i))",
    expect: 'node scripts/check-lineups-pull-only.mjs --self-test',
  },
  {
    id: 'lineups-paren-star-paren-nests-in-a-comment',
    file: 'scripts/check-lineups-pull-only.mjs',
    claim: "(*) inside a comment neither nests nor ends it",
    find: "if (src.startsWith('(*)', i)) { i += 3; continue }",
    replace: "if (false) { i += 3; continue }",
    expect: 'node scripts/check-lineups-pull-only.mjs --self-test',
  },
  {
    id: 'lineups-strings-unread',
    file: 'scripts/check-lineups-pull-only.mjs',
    claim: "a string in code is read as a string: a // or a (* in it starts no comment",
    find: "if (quoteAt(i) >= 0) { i = skipString(i); continue }",
    replace: "if (false) { i = skipString(i); continue }",
    expect: 'node scripts/check-lineups-pull-only.mjs --self-test',
  },
  {
    id: 'lineups-verbatim-quotes-unread',
    file: 'scripts/check-lineups-pull-only.mjs',
    claim: "a doubled quote in a verbatim @\"...\" string is a quote, not the end of the string",
    find: "if (verbatim && src[j + 1] === '\"') { j += 2; continue }",
    replace: "if (false) { j += 2; continue }",
    expect: 'node scripts/check-lineups-pull-only.mjs --self-test',
  },
  {
    id: 'lineups-verbatim-backslash-escapes',
    file: 'scripts/check-lineups-pull-only.mjs',
    claim: "a backslash in a verbatim @\"...\" string is a backslash: it does not escape the quote after it",
    find: "else if (c === '\\\\' && !verbatim) { j += 2; continue }",
    replace: "else if (c === '\\\\') { j += 2; continue }",
    expect: 'node scripts/check-lineups-pull-only.mjs --self-test',
  },
  {
    id: 'lineups-backslash-escape-unread',
    file: 'scripts/check-lineups-pull-only.mjs',
    claim: "a backslash in an ordinary string escapes the quote after it",
    find: "else if (c === '\\\\' && !verbatim) { j += 2; continue }",
    replace: "else if (false) { j += 2; continue }",
    expect: 'node scripts/check-lineups-pull-only.mjs --self-test',
  },
  {
    id: 'lineups-triple-quotes-unread',
    file: 'scripts/check-lineups-pull-only.mjs',
    claim: "a \"\"\"...\"\"\" string ends at its closing triple quote, not at the first quote inside it",
    find: "const triple = src.startsWith('\"\"\"', q)",
    replace: "const triple = false",
    expect: 'node scripts/check-lineups-pull-only.mjs --self-test',
  },
  {
    id: 'lineups-interpolation-holes-unread',
    file: 'scripts/check-lineups-pull-only.mjs',
    claim: "the hole of a $\"...{...}...\" string is code, so a string in it does not end the interpolated one",
    find: "if (interpolated && c === '{') {",
    replace: "if (false && c === '{') {",
    expect: 'node scripts/check-lineups-pull-only.mjs --self-test',
  },
  {
    id: 'lineups-escaped-brace-opens-a-hole',
    file: 'scripts/check-lineups-pull-only.mjs',
    claim: "a doubled brace in an interpolated string is a brace, not the start of a hole",
    find: "j = src[j + 1] === '{' ? j + 2 : scanCode(j + 1, true) + 1; continue",
    replace: "j = scanCode(j + 1, true) + 1; continue",
    expect: 'node scripts/check-lineups-pull-only.mjs --self-test',
  },
  {
    id: 'lineups-hole-braces-not-counted',
    file: 'scripts/check-lineups-pull-only.mjs',
    claim: "a brace inside a hole is counted: the first } that closes one of its own does not end the hole",
    find: "if (c === '{') depth++; else if (c === '}') {",
    replace: "if (c === '}') {",
    expect: 'node scripts/check-lineups-pull-only.mjs --self-test',
  },
  {
    id: 'lineups-two-prefix-characters-unread',
    file: 'scripts/check-lineups-pull-only.mjs',
    claim: "a string may carry both prefix characters ($@\"...\") and is read as interpolated and verbatim",
    find: "while (j < i + 2 && (src[j] === '$' || src[j] === '@')) j++",
    replace: "while (j < i + 1 && (src[j] === '$' || src[j] === '@')) j++",
    expect: 'node scripts/check-lineups-pull-only.mjs --self-test',
  },
  {
    id: 'lineups-char-escapes-unread',
    file: 'scripts/check-lineups-pull-only.mjs',
    claim: "an escaped character literal ('\\\"') is read as one",
    find: "|\\\\[\"\\\\'ntbrafv0]",
    replace: "",
    expect: 'node scripts/check-lineups-pull-only.mjs --self-test',
  },
  {
    id: 'lineups-blank-eats-newlines',
    file: 'scripts/check-lineups-pull-only.mjs',
    claim: "the comment blank keeps the line feeds, so a position found in the blanked F# is a line of the source",
    find: "const blank = (s, e) => { for (let k = s; k < e; k++) if (out[k] !== '\\n') out[k] = ' ' }",
    replace: "const blank = (s, e) => { for (let k = s; k < e; k++) out[k] = ' ' }",
    expect: 'node scripts/check-lineups-pull-only.mjs --self-test',
  },
  {
    id: 'lineups-backtick-names-unread',
    file: 'scripts/check-lineups-pull-only.mjs',
    claim: "a double-backtick identifier is read as one: a (* or a // or a quote in it starts no comment and no string, so a timer after it is still seen and a timer in a comment after it is still a comment",
    find: "if (c === '`' && src[i + 1] === '`') { i = skipName(i); continue }\n",
    replace: "",
    expect: 'node scripts/check-lineups-pull-only.mjs --self-test',
  },
  {
    id: 'lineups-unclosed-name-pairs-across-lines',
    file: 'scripts/check-lineups-pull-only.mjs',
    claim: "a double-backtick identifier ends on its own line: one that does not close does not pair with the name on a later line",
    find: "close >= 0 && (eol < 0 || close < eol) ? close + 2 : eol < 0 ? n : eol",
    replace: "close >= 0 ? close + 2 : eol < 0 ? n : eol",
    expect: 'node scripts/check-lineups-pull-only.mjs --self-test',
  },
  {
    id: 'lineups-unclosed-name-skips-two-characters',
    file: 'scripts/check-lineups-pull-only.mjs',
    claim: "a double-backtick identifier that never closes is read to the end of its line, not as two ordinary characters (the (* after it starts no comment)",
    find: "close >= 0 && (eol < 0 || close < eol) ? close + 2 : eol < 0 ? n : eol",
    replace: "close >= 0 && (eol < 0 || close < eol) ? close + 2 : i + 2",
    expect: 'node scripts/check-lineups-pull-only.mjs --self-test',
  },

  {
    // THE PREDICTED XI, and the five mutations that would each produce a page
    // that looks right. docs/CC-CMD-2026-10-11-predicted-xi-render-decision.md
    // in field-relay-nba commissioned this surface; its done condition 4 is "no
    // cron, no watch, no diff-on-change anywhere in the diff", which is a
    // property of one diff and so is a property nothing enforces a week later.
    //
    // A panel that refreshes itself reads as an improvement in review. It is
    // the thing the relay deliberately does not do: Rule A is not cleared, and
    // a lineup that changes an hour before kickoff is the most
    // notification-shaped object this feature introduces. If this survives, the
    // stop condition is prose.
    id: 'lineups-polls',
    file: 'src/LineupsView.fs',
    claim: 'the lineups panel fetches once and never re-arms',
    find: '        render mount reply\n    }',
    replace: '        render mount reply\n        window.setInterval((fun () -> render mount reply), 60000) |> ignore\n    }',
    expect: 'node scripts/check-lineups-pull-only.mjs',
  },
  {
    // The other half of the same stop condition. A scheduled capture is a watch
    // by another name, and it would be the obvious thing to add the first time
    // someone wants the fixtures kept fresh.
    id: 'lineups-capture-scheduled',
    file: '.github/workflows/capture-lineups-fixture.yml',
    claim: 'the lineups capture is dispatch-only — nothing puts it on a timer',
    find: 'on:\n  workflow_dispatch:',
    replace: 'on:\n  schedule:\n    - cron: "*/15 * * * *"\n  workflow_dispatch:',
    expect: 'node scripts/check-lineups-pull-only.mjs',
  },
  {
    // The decoder. A null, or a key the relay did not send, read as an empty id
    // would put a joined card on every soccer row, each asking for
    // /bsd/events//lineups. docs/CC-CMD-2026-10-27-lineups-on-game-cards.md Task 1.
    id: 'lineup-cards-null-read-as-an-id',
    file: 'src/Desk.fs',
    claim: 'a null or missing bsd_event_id is NOT JOINED, never an empty id',
    find: '          BsdEventId = get.Optional.Field "bsd_event_id" Decode.string\n',
    replace: '          BsdEventId = Some(get.Optional.Field "bsd_event_id" Decode.string |> Option.defaultValue "")\n',
    expect: 'node build/VerifyMain.js',
  },
  {
    // A card with no joined event is a sentence. Give it a click that loads a
    // lineup and the sentence is a control that fetches.
    id: 'lineup-cards-not-joined-fetches',
    file: 'src/Scoreboard.fs',
    claim: 'a not-joined card fetches nothing',
    find: '        line.setAttribute("data-lineup", "not-joined")\n        Some line',
    replace: '        line.setAttribute("data-lineup", "not-joined")\n        line.addEventListener("click", fun _ -> LineupsView.loadEvent line "5327" |> Promise.start)\n        Some line',
    expect: 'node scripts/lineups-render-check.mjs',
  },
  {
    // Drop the once-only flag and every re-open is a request.
    id: 'lineup-cards-fetch-on-every-open',
    file: 'src/Scoreboard.fs',
    claim: 'a card asks for its lineup once, on the first open, and not again on a re-open',
    find: '            if isOpen && not asked.Value then',
    replace: '            if isOpen then',
    expect: 'node scripts/lineups-render-check.mjs',
  },
  {
    // A card that is a disclosure of its own (the brief flip) turns over when its
    // lineup is clicked, unless the click stops at the lineup.
    id: 'lineup-cards-click-turns-the-card',
    file: 'src/Scoreboard.fs',
    claim: 'a click on the lineup is not a click on the card around it',
    find: '        details.addEventListener("click", fun e -> e.stopPropagation())',
    replace: '        details.addEventListener("click", fun _ -> ())',
    expect: 'node scripts/lineups-render-check.mjs',
  },
  {
    // The three states, with the first collapsed: every card, soccer or not,
    // gets an affordance.
    id: 'lineup-cards-non-soccer-gets-one',
    file: 'src/Scoreboard.fs',
    claim: 'a card that is not soccer carries no lineup affordance',
    find: '    if not (sportMeta game.Sport).IsSoccer then NotSoccer',
    replace: '    if false then NotSoccer',
    expect: 'node scripts/lineups-render-check.mjs',
  },
  {
    // The other direction: a soccer card with no joined event says nothing at all.
    id: 'lineup-cards-not-joined-is-silent',
    file: 'src/Scoreboard.fs',
    claim: 'every soccer card carries a lineup state, joined or not joined',
    find: '        | _ -> NotJoined',
    replace: '        | _ -> NotSoccer',
    expect: 'node scripts/lineups-render-check.mjs',
  },
  {
    // A pinned page that goes to the network for an event it holds no capture of
    // is not pinned.
    id: 'lineup-cards-pinned-page-uses-the-network',
    file: 'src/LineupsView.fs',
    claim: 'a pinned page makes no request for an event it holds no capture of',
    find: '        | None -> NoCaptureHere eventId',
    replace: '        | None -> FromRelay(sprintf "%s%s/lineups" RELAY_EVENTS eventId)',
    expect: 'node build/VerifyMain.js',
  },
  {
    // An id is data from a payload. Put in a URL unchecked, a crafted one is a
    // request this page did not intend to make.
    id: 'lineup-cards-id-goes-into-the-url-unchecked',
    file: 'src/LineupsView.fs',
    claim: 'an id that is not ASCII digits is never put in a URL',
    find: "    if eventId = \"\" || not (eventId |> Seq.forall (fun c -> c >= '0' && c <= '9')) then",
    replace: '    if eventId = "" then',
    expect: 'node build/VerifyMain.js',
  },
  {
    // The card's relay base is a second copy of Program.fs's. Let them drift and
    // the card asks a route the tab does not.
    id: 'lineup-cards-relay-base-moves',
    file: 'src/LineupsView.fs',
    claim: 'the card and the Lineups tab build their route from the same relay base',
    find: 'let private RELAY_EVENTS = "https://field-relay-nba.jeffunglesbee.workers.dev/bsd/events/"',
    replace: 'let private RELAY_EVENTS = "https://field-relay-nba.jeffunglesbee.workers.dev/bsd/event/"',
    expect: 'node scripts/check-lineups-pull-only.mjs',
  },
  {
    // The other half of the pull-only stop condition, on the card.
    id: 'lineup-cards-card-polls',
    file: 'src/Scoreboard.fs',
    claim: 'the card asks for its lineup once and never re-arms',
    find: '        let asked = ref false\n',
    replace: '        let asked = ref false\n        window.setInterval((fun () -> ()), 60000) |> ignore\n',
    expect: 'node scripts/check-lineups-pull-only.mjs',
  },
  {
    // THE FABRICATION, in one line. `lineup_status` is a vendor field and the
    // document names three non-answers; there are five, and this is the one it
    // does not name. A status nobody has seen falling through to `predicted`
    // draws a team sheet under a word this page never verified — and every
    // other check still passes, because the sheet is well-formed. If this
    // survives, "seven cases" is a type and not a guarantee.
    id: 'lineups-unrecognised-falls-through',
    file: 'src/Lineups.fs',
    claim: 'an unrecognised lineup_status is never resolved to a sheet of a known kind',
    find: '                | Some other -> SheetOfUnknownKind(other, home, away)',
    replace: '                | Some _ -> Sheet(Standing.Predicted, home, away)',
    expect: 'node build/VerifyMain.js',
  },
  {
    // Rule 99's four states, collapsed by one arrow. The relay sends
    // `served-empty` separately from `absent` and says in its own source that
    // they "must not be smoothed into either"; this smooths them. The page then
    // tells a reader the response carried no lineups when the vendor in fact
    // answered with an empty sheet — two different facts, one sentence.
    id: 'lineups-empty-is-absent',
    file: 'src/Lineups.fs',
    claim: 'an empty lineups object stays distinct from a missing one',
    find: '            | FillEmpty -> ServedEmpty',
    replace: '            | FillEmpty -> NotInPayload',
    expect: 'node build/VerifyMain.js',
  },
  {
    // The treatment itself. One word changed and a confirmed team sheet and a
    // model's guess carry the same mark on every row — which is the exact
    // outcome the commissioning document opens with: "a predicted XI rendered
    // identically to a confirmed one is a fabrication with a team sheet's
    // authority". Nothing crashes, every row still renders, and the page is
    // wrong in the only way that matters.
    id: 'lineups-mark-says-one-thing',
    file: 'src/Lineups.fs',
    claim: 'a predicted sheet and a confirmed one carry different marks on every row',
    find: '    | Announced -> "confirmed"',
    replace: '    | Announced -> "predicted"',
    expect: 'node build/VerifyMain.js',
  },
  // ── Flow (docs/CC-CMD-2026-10-15-empowerment-metrics.md, Task 1) ──────────
  {
    id: 'flow-three-shots',
    file: 'src/Flow.fs',
    claim: "Flow needs three own shots, not two",
    find: "let private flowShots = 3",
    replace: "let private flowShots = 2",
    expect: "node build/VerifyMain.js",
  },
  {
    id: 'flow-xg-is-summed',
    file: 'src/Flow.fs',
    claim: "a run's xG is the sum of its counted shots",
    find: "| Some r -> State(InFlow(r.Counted |> List.filter (fun (c, _) -> c <= at) |> List.sumBy snd))",
    replace: "| Some r -> State(InFlow(r.Counted |> List.filter (fun (c, _) -> c <= at) |> List.map snd |> List.max))",
    expect: "node build/VerifyMain.js",
  },
  {
    id: 'flow-opponent-shot-interrupts',
    file: 'src/Flow.fs',
    claim: "an opposing shot ends a run, whatever its xG",
    find: "            | Some r when r.Side <> side ->\n",
    replace: "            | Some r when r.Side <> side && false ->\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: 'flow-zero-xg-not-counted',
    file: 'src/Flow.fs',
    claim: "an own shot of 0 xG does not count toward a run (ruling 3)",
    find: "Xg = (if x > 0.0 then Positive",
    replace: "Xg = (if x >= 0.0 then Positive",
    expect: "node build/VerifyMain.js",
  },
  {
    id: 'flow-shared-minute-breaks',
    file: 'src/Flow.fs',
    claim: "a minute in which both teams shot ends the run (ruling 1)",
    find: "let p = close SharedMinute at p",
    replace: "let p = p",
    expect: "node build/VerifyMain.js",
  },
  {
    id: 'flow-break-at-half-time',
    file: 'src/Flow.fs',
    claim: "a run never crosses 45'/46' (ruling 2)",
    find: "if c.Minute <= 45 then FirstHalf",
    replace: "if c.Minute <= 46 then FirstHalf",
    expect: "node build/VerifyMain.js",
  },
  {
    id: 'flow-break-at-extra-time-interval',
    file: 'src/Flow.fs',
    claim: "a run never crosses 105'/106' (delegated ruling 1)",
    find: "elif c.Minute <= 105 then ExtraFirst",
    replace: "elif c.Minute <= 120 then ExtraFirst",
    expect: "node build/VerifyMain.js",
  },
  {
    id: 'flow-run-ends-at-its-period',
    file: 'src/Flow.fs',
    claim: "a run alive at the last shot ends at its period boundary, not never",
    find: "(periodEnd (periodOf last)) pass",
    replace: "{ Minute = 999; Added = 0 } pass",
    expect: "node build/VerifyMain.js",
  },
  {
    id: 'flow-every-boundary-counted',
    file: 'src/Flow.fs',
    claim: "a gap across two periods counts both boundaries",
    find: "let boundaries = crossed ended (periodOf at)",
    replace: "let boundaries = [ ended ]",
    expect: "node build/VerifyMain.js",
  },
  {
    id: 'flow-missing-xg-goes-to-owner',
    file: 'src/Flow.fs',
    claim: "a shot with no xG leaves the capture unread rather than treated",
    find: "    r.Xg.IsNone\n    || r.Min.IsNone",
    replace: "    false\n    || r.Min.IsNone",
    expect: "node build/VerifyMain.js",
  },
  {
    id: 'flow-full-time-at-90',
    file: 'src/Flow.fs',
    claim: "only a full-time marker at 90' extends the record to 90'",
    find: "not m.Live && textOf m = \"ft\" && m.Minute = Some 90",
    replace: "not m.Live && textOf m = \"ft\"",
    expect: "node build/VerifyMain.js",
  },
  {
    id: 'flow-incidents-of-the-same-event',
    file: 'src/Flow.fs',
    claim: "an incidents file of another event is not read as this capture's",
    find: "        | Some(Ok(Some incidentsId, _)) when Some incidentsId <> eventId -> Mismatched, []\n",
    replace: "",
    expect: "node build/VerifyMain.js",
  },
  {
    id: 'flow-own-goal-excluded',
    file: 'src/Flow.fs',
    claim: "an own-goal row is not a shot by the side it names",
    find: "let private excluded (r: Raw) = isOwnGoal r || isShootoutKick r",
    replace: "let private excluded (r: Raw) = isShootoutKick r",
    expect: "node build/VerifyMain.js",
  },
  {
    id: 'flow-kickoff-row-is-its-own',
    file: 'src/Flow.fs',
    claim: "the kickoff route reads only the capture's own event row",
    find: "| Ok(id, kickoff), Readable _ when c.EventId = Some id ->",
    replace: "| Ok(_, kickoff), Readable _ ->",
    expect: "node build/VerifyMain.js",
  },
  {
    id: 'flow-kickoff-needs-two-days',
    file: 'src/Desk.fs',
    claim: "the kickoff witness needs two FIELD days, not one (ruling 2(b))",
    find: "if fieldDayIsBefore (fieldDayAt kickoff) (fieldDayShift -1 (fieldDayAt now)) then",
    replace: "if fieldDayIsBefore (fieldDayAt kickoff) (fieldDayShift 0 (fieldDayAt now)) then",
    expect: "node build/VerifyMain.js",
  },
  {
    id: 'flow-witness-prints-nothing',
    file: 'src/Flow.fs',
    claim: "a witness serialises as its type name, never the capture inside it",
    find: "    member _.toJSON() = \"Finished\"\n",
    replace: "",
    expect: "node build/VerifyMain.js",
  },
  {
    id: 'flow-teamstate-goes-public',
    file: 'src/Flow.fs',
    claim: "TeamState is private to Flow: no module outside it can hold a verdict",
    find: "type private TeamState =",
    replace: "type TeamState =",
    expect: "node scripts/proof-check.mjs --only FLOW-PROOF",
  },
  {
    id: 'flow-witness-goes-public',
    file: 'src/Flow.fs',
    claim: "Finished is private: no witness is assembled from a capture and a zone",
    find: "type Finished =\n    private\n        { Of: Capture\n          Zone: AmnestyZone }",
    replace: "type Finished =\n    { Of: Capture\n      Zone: AmnestyZone }",
    expect: "node scripts/proof-check.mjs --only FLOW-PROOF",
  },
  // --- Flow over the committed BSD captures (real bytes) ---
  {
    // The real-bytes row sets this against rawShotRows, a generic decode of the same text.
    id: 'flow-census-counts-every-row',
    file: "src/Flow.fs",
    claim: "the census counts every shotmap row once, read or not",
    find: "      Shots = List.length c.Raws\n",
    replace: "      Shots = List.length c.Raws + 1\n",
    expect: 'node build/VerifyMain.js',
  },
  {
    // flow-full-time-at-90 loosens the marker; this removes the route it opens.
    id: 'flow-full-time-route-records',
    file: "src/Flow.fs",
    claim: "a seen full-time marker records the clock past the last shot, up to 90'",
    find: "|| (sawFullTime c && at < periodEnd SecondHalf))",
    replace: "|| false)",
    expect: 'node build/VerifyMain.js',
  },
  {
    // The one sanctioned string form, checked minute by minute on the real capture.
    id: 'flow-label-two-decimals',
    file: "src/Flow.fs",
    claim: "an InFlow accessible name carries sequential xG to two decimals and no more",
    find: "sprintf \"InFlow state active, sequential xG %.2f\"",
    replace: "sprintf \"InFlow state active, sequential xG %.3f\"",
    expect: 'node build/VerifyMain.js',
  },
  {
    // A renderer reading only the opacity would show nothing while the name said InFlow.
    id: 'flow-pulse-draws-inflow',
    file: "src/Flow.fs",
    claim: "the pulse draws exactly where the accessible name says InFlow",
    find: "    | State(InFlow x) -> sprintf \"opacity: %.2f\" (min 1.0 (float (x / 1.0f<xg>)))",
    replace: "    | State(InFlow x) -> \"\"",
    expect: 'node build/VerifyMain.js',
  },
  // --- Gravity Well (NFL) and the vintage-typed BDB frames: ten records, the budget (verify-full's 90-minute ceiling) ---
  {
    // bdb-frame-types Task 6, first direction. A public Vintage lets any caller write `Current 2022` and
    // relabel an archive as live; VINTAGE-PROOF case 2 compiles cleanly the moment it is public.
    id: 'vintage-cases-public',
    file: "src/Vintage.fs",
    claim: "a Vintage cannot be built outside the decoder, so an archive cannot be relabelled current",
    find: "type Vintage = private Archive of int<season> | Current of int<season>",
    replace: "type Vintage = Archive of int<season> | Current of int<season>",
    expect: "node scripts/proof-check.mjs --only VINTAGE-PROOF",
  },
  {
    // bdb-frame-types Task 6, second direction: the default that made six files' staleness invisible.
    id: 'vintage-missing-season-defaults',
    file: "src/Vintage.fs",
    claim: "an envelope with no season is refused, never stamped with the current year",
    find: "        | Ok(None, _) -> Error NoSeason",
    replace: "        | Ok(None, _) -> (match Decode.fromString payload text with Ok value -> Ok(Tracked(value, Current current)) | Error e -> Error(Malformed e))",
    expect: "node build/VerifyMain.js",
  },
  {
    // A blank provenance string is not a provenance.
    id: 'vintage-blank-source-accepted',
    file: "src/Vintage.fs",
    claim: "a missing or blank sourceDataset is refused",
    find: "            match source |> Option.filter (fun s -> s.Trim() <> \"\") with",
    replace: "            match source with",
    expect: "node build/VerifyMain.js",
  },
  {
    // Thoth's integer decoder parses "2022"; the guard in front of it is the only thing refusing a string season.
    id: 'vintage-season-string-accepted',
    file: "src/Vintage.fs",
    claim: "a season written as a JSON string is refused, not parsed into a stamp",
    find: "        if Decode.Helpers.isNumber value then Decode.int path value",
    replace: "        if true then Decode.int path value",
    expect: "node build/VerifyMain.js",
  },
  {
    // A season from the future stamped current is the same defect as a missing one, from the other side.
    id: 'vintage-future-season-stamped-current',
    file: "src/Vintage.fs",
    claim: "a season later than the current one is refused, not stamped current",
    find: "    if stated > current then Error(FutureSeason(stated, current))",
    replace: "    if stated > current then Ok(Current stated)",
    expect: "node build/VerifyMain.js",
  },
  {
    // The witness route. Admitting a current season here hands Gravity's projections a live season's wells.
    id: 'vintage-archive-granted-to-current',
    file: "src/Vintage.fs",
    claim: "only an archive season yields the archive value, and so the gravity witness",
    find: "    | Tracked(value, Archive s) when s = displaying -> Some value",
    replace: "    | Tracked(value, (Archive s | Current s)) when s = displaying -> Some value",
    expect: "node build/VerifyMain.js",
  },
  {
    // A receiver level with the snapper is not past the line; inclusive, he becomes a route runner on no route.
    id: 'gridiron-past-line-inclusive',
    file: "src/Gridiron.fs",
    claim: "past the line means strictly beyond the snapper at the snap",
    find: "let pastLine (p: Position<Scrimmage, 'Instant>) : bool = yardsPast p > 0.0<yd>",
    replace: "let pastLine (p: Position<Scrimmage, 'Instant>) : bool = yardsPast p >= 0.0<yd>",
    expect: "node build/VerifyMain.js",
  },
  {
    // Conservation. The snap counterfactual must assign the same defenders as the release, or drawn
    // stops summing to zero and a receiver "draws" a defender nobody lost.
    id: 'gravity-snap-counts-a-defender-twice',
    file: "src/Gravity.fs",
    claim: "the snap counterfactual assigns the same defenders as the release, so drawn cancels within a play",
    find: "    (c.Defenders |> List.map (fun p -> p.NflId, c.SnapAt.[p.NflId]))",
    replace: "    (c.Defenders @ [ List.head c.Defenders ] |> List.map (fun p -> p.NflId, c.SnapAt.[p.NflId]))",
    expect: "node build/VerifyMain.js",
  },
  {
    // The sign. A zero is Level; counted as Drawing, every unchanged receiver reads as drawing coverage.
    id: 'gravity-drawing-at-zero',
    file: "src/Gravity.fs",
    claim: "a receiver who drew nothing beyond his alignment is Level, not Drawing",
    find: "    if drawn > 0 then Drawing pull",
    replace: "    if drawn >= 0 then Drawing pull",
    expect: "node build/VerifyMain.js",
  },
  {
    // Rule 99 at the layer that reaches the DOM: a measured zero drawn as nothing is an absence.
    id: 'gravity-level-drawn-as-absence',
    file: "src/Gravity.fs",
    claim: "Drawing, Level, Ceding and NotRouteRunner are drawn four different ways",
    find: "        | Level p -> Some { Opacity = share p; Shape = Steady }",
    replace: "        | Level _ -> None",
    expect: "node build/VerifyMain.js",
  },
  // --- the harness's own --only, found 2026-10-19 ---
  {
    // Inverted like `harness-blind`: the expectation passes when the command
    // FAILS, because a harness that refuses an unknown id exits non-zero.
    // Removing the refusal makes the nested run exit 0 and the record survive.
    id: 'only-selects-nothing-passes',
    file: 'scripts/mutation-check.mjs',
    claim: 'a --only that matches no mutation is refused, not reported as a pass over zero expectations',
    find: "if (process.argv.includes('--only') && (!ONLY || selected.length === 0)) {",
    replace: 'if (false) {',
    expect: `bash -c '! node scripts/mutation-check.mjs --only no-such-mutation-id'`,
  },
  // --- venue sourcing, docs/CC-CMD-2026-10-20-outdoor-venue-sourcing.md: scripts/venue-source.mjs ---
  {
    // Nominatim and Photon read the same data; agreeing with itself is one witness.
    id: 'venue-source-one-family-accepted',
    file: 'scripts/venue-source.mjs',
    claim: 'two OpenStreetMap front ends agreeing alone is not accepted',
    find: 'FAMILY[a.source] !== FAMILY[b.source] && ',
    replace: '',
    expect: 'node scripts/venue-source.mjs --self-test',
  },
  {
    // A wide threshold accepts a different city.
    id: 'venue-source-threshold-widened',
    file: 'scripts/venue-source.mjs',
    claim: 'a point just past the 0.02 degree threshold is not accepted',
    find: 'export const EPS = 0.02',
    replace: 'export const EPS = 0.2',
    expect: 'node scripts/venue-source.mjs --self-test',
  },
  {
    // Close in latitude and 0.5 degrees apart in longitude is a different place.
    id: 'venue-source-one-axis-only',
    file: 'scripts/venue-source.mjs',
    claim: 'closeness is judged on both axes, not latitude alone',
    find: ' && Math.abs(a.lon - b.lon) <= eps + 1e-12',
    replace: '',
    expect: 'node scripts/venue-source.mjs --self-test',
  },
  // --- the Wikipedia infobox and category probe, docs/CC-CMD-2026-11-09-venue-review-remainder.md, Task 2 option 3: scripts/venue-infobox.mjs ---
  {
    id: 'venue-infobox-roof-match-case',
    file: 'scripts/venue-infobox-read.mjs',
    claim: "a parameter named Roof, capitalised, is a roof parameter",
    find: "if (!index && /roof/i.test(param)) {",
    replace: "if (!index && /roof/.test(param)) {",
    expect: 'node scripts/venue-infobox.mjs --self-test',
  },
  {
    id: 'venue-infobox-first-infobox-only',
    file: 'scripts/venue-infobox-read.mjs',
    claim: "every Infobox template on a page is read, not the first one",
    find: "    infoboxes.push({ template, params, roof })",
    replace: "    infoboxes.push({ template, params, roof }); break",
    expect: 'node scripts/venue-infobox.mjs --self-test',
  },
  {
    id: 'venue-infobox-root-not-checked',
    file: 'scripts/venue-infobox-read.mjs',
    claim: "an HTML page, which parses as XML, is a failure and not a page with no infobox",
    find: "  if (root?.tagName !== 'root') return { ok: false,",
    replace: "  if (false) return { ok: false,",
    expect: 'node scripts/venue-infobox.mjs --self-test',
  },
  {
    id: 'venue-infobox-ref-text-kept',
    file: 'scripts/venue-infobox-read.mjs',
    claim: "a reference inside a roof value is left out of its text",
    find: "else if (n.tagName === 'ext') seen.exts.push(",
    replace: "else if (n.tagName === 'ext') text += n.textContent, seen.exts.push(",
    expect: 'node scripts/venue-infobox.mjs --self-test',
  },
  {
    id: 'venue-infobox-nested-values-dropped',
    file: 'scripts/venue-infobox-read.mjs',
    claim: "the value of a template nested in a roof value is part of its text",
    find: "for (const p of elems(n, 'part')) text += ' ' + walk(elems(p, 'value')[0] ?? p)",
    replace: "for (const p of elems(n, 'part')) text += ''",
    expect: 'node scripts/venue-infobox.mjs --self-test',
  },
  {
    id: 'venue-infobox-parse-error-swallowed',
    file: 'scripts/venue-infobox-read.mjs',
    claim: "a tree that does not parse is a failure and not a page with no infobox",
    find: "    return { ok: false, why: `${e.name}: ${String(e.message).slice(0, 200)}`, errors }",
    replace: "    return { ok: true, errors, templates0: [], infoboxes: [] }",
    expect: 'node scripts/venue-infobox.mjs --self-test',
  },
  {
    id: 'venue-infobox-parser-errors-dropped',
    file: 'scripts/venue-infobox-read.mjs',
    claim: "a parser error on a tree that still reads is recorded against the article",
    find: "(level, msg) => errors.push(",
    replace: "(level, msg) => [].push(",
    expect: 'node scripts/venue-infobox.mjs --self-test',
  },
  {
    id: 'venue-infobox-retry-after-ignored',
    file: 'scripts/venue-infobox.mjs',
    claim: "a 429 waits what the server's Retry-After asks",
    find: "await wait(retryWait(res.headers.get('retry-after'), n))",
    replace: "await wait(1)",
    expect: 'node scripts/venue-infobox.mjs --self-test',
  },
  {
    id: 'venue-infobox-429-not-retried',
    file: 'scripts/venue-infobox.mjs',
    claim: "a 429 is retried and not taken as the answer",
    find: "if (res.status === 429 || res.status >= 500) {",
    replace: "if (res.status >= 500) {",
    expect: 'node scripts/venue-infobox.mjs --self-test',
  },
  {
    id: 'venue-infobox-hidden-categories-listed',
    file: 'scripts/venue-infobox.mjs',
    claim: "hidden categories are counted and not listed with the visible ones",
    find: "if ('hidden' in c) a.hidden++; else a.visible.push(",
    replace: "if (false) a.hidden++; else a.visible.push(",
    expect: 'node scripts/venue-infobox.mjs --self-test',
  },
  {
    id: 'venue-infobox-redirect-not-followed',
    file: 'scripts/venue-infobox.mjs',
    claim: "a title that redirects reads the target's categories",
    find: "for (let hop = 0; hop < 3 && acc.alias[t] !== undefined; hop++) t = acc.alias[t]",
    replace: "",
    expect: 'node scripts/venue-infobox.mjs --self-test',
  },
  {
    id: 'venue-infobox-continuation-ignored',
    file: 'scripts/venue-infobox.mjs',
    claim: "a category answer that continues is read to its end",
    find: "      } while (cont)",
    replace: "      } while (false)",
    expect: 'node scripts/venue-infobox.mjs --self-test',
  },
  {
    id: 'venue-infobox-unread-articles-pass',
    file: 'scripts/venue-infobox.mjs',
    claim: "an article that was not fetched makes the run fail",
    find: "if (a.okFetch.length < a.titles.length) problems.push(",
    replace: "if (false) problems.push(",
    expect: 'node scripts/venue-infobox.mjs --self-test',
  },
  {
    id: 'venue-infobox-denominator-is-the-answered',
    file: 'scripts/venue-infobox.mjs',
    claim: "the coverage line names the rows asked, not only the rows that answered",
    find: "checked ${a.withTitle.length} of ${a.rows.length} rows",
    replace: "checked ${a.withTitle.length} of ${a.withTitle.length} rows",
    expect: 'node scripts/venue-infobox.mjs --self-test',
  },
  {
    id: 'venue-infobox-title-after-wiki-first',
    file: 'scripts/venue-infobox.mjs',
    claim: "the title is the text after /wiki/ in the sitelink",
    find: ".article?.value?.split('/wiki/')[1]",
    replace: ".article?.value?.split('/wiki/')[0]",
    expect: 'node scripts/venue-infobox.mjs --self-test',
  },
  // --- the infobox's Roof field as the roof rule's fourth witness, docs/CC-CMD-2026-11-09-venue-review-remainder.md, Task 2 option 3, Step B:
  // scripts/venue-source.mjs and scripts/venue-infobox-read.mjs. `node outbox/venue-source-roof-field-mutation-2026-11-09.mjs` runs each one and names the checks that go red. ---
  {
    id: 'venue-source-roof-field-default-changed',
    file: 'scripts/venue-source.mjs',
    claim: "a caller that passes no infobox field gets the rule as it was, not a refusal to infer open",
    find: "export const decideRoof = (wikidataRoof, lead, body = null, field = []) => {",
    replace: "export const decideRoof = (wikidataRoof, lead, body = null, field = null) => {",
    expect: 'node scripts/venue-source.mjs --self-test',
  },
  {
    id: 'venue-source-roof-field-any-word-closed',
    file: 'scripts/venue-source.mjs',
    claim: "a bare word in the Roof field is no witness, and the field never says open",
    find: "ROOF_FIELD_TERMS.get(value.toLowerCase().trim()) ?? 'open')",
    replace: "ROOF_FIELD_TERMS.get(value.toLowerCase().trim()) ?? (value ? 'dome' : 'open'))",
    expect: 'node scripts/venue-source.mjs --self-test',
  },
  {
    id: 'venue-source-roof-field-term-by-substring',
    file: 'scripts/venue-source.mjs',
    claim: "a joined term is a closed roof as a whole value only, not as a word inside a longer one",
    find: "ROOF_FIELD_TERMS.get(value.toLowerCase().trim())",
    replace: "(value.toLowerCase().includes('skylight') ? 'dome' : undefined)",
    expect: 'node scripts/venue-source.mjs --self-test',
  },
  {
    id: 'venue-source-roof-field-term-case-sensitive',
    file: 'scripts/venue-source.mjs',
    claim: "a joined term matches in any case",
    find: "ROOF_FIELD_TERMS.get(value.toLowerCase().trim())",
    replace: "ROOF_FIELD_TERMS.get(value.trim())",
    expect: 'node scripts/venue-source.mjs --self-test',
  },
  {
    id: 'venue-source-roof-field-term-untrimmed',
    file: 'scripts/venue-source.mjs',
    claim: "a joined term matches with the spaces around it ignored",
    find: "ROOF_FIELD_TERMS.get(value.toLowerCase().trim())",
    replace: "ROOF_FIELD_TERMS.get(value.toLowerCase())",
    expect: 'node scripts/venue-source.mjs --self-test',
  },
  {
    id: 'venue-source-roof-field-term-removed',
    file: 'scripts/venue-source.mjs',
    claim: "[[Skylight]] reads as a closed roof (U.S. Bank Stadium)",
    find: "new Map([['[[skylight]]', 'dome']])",
    replace: "new Map()",
    expect: 'node scripts/venue-source.mjs --self-test',
  },
  {
    id: 'venue-source-roof-field-term-wrong-class',
    file: 'scripts/venue-source.mjs',
    claim: "[[Skylight]] reads as a dome, the class its evidence rows were decided as",
    find: "['[[skylight]]', 'dome']",
    replace: "['[[skylight]]', 'retractable']",
    expect: 'node scripts/venue-source.mjs --self-test',
  },
  {
    id: 'venue-source-roof-field-conflict-first-wins',
    file: 'scripts/venue-source.mjs',
    claim: "two roof parameters naming different closed roofs are review, never the first or the last",
    find: "  if (classes.size > 1) return { roof: null,",
    replace: "  if (false) return { roof: null,",
    expect: 'node scripts/venue-source.mjs --self-test',
  },
  {
    id: 'venue-source-roof-field-disagreement-picks',
    file: 'scripts/venue-source.mjs',
    claim: "an infobox naming a different closed roof than Wikidata or the lead is review, never a pick",
    find: "  if (fd && closed.some(([, c]) => c !== fd)) return {",
    replace: "  if (false) return {",
    expect: 'node scripts/venue-source.mjs --self-test',
  },
  {
    id: 'venue-source-roof-field-never-decides',
    file: 'scripts/venue-source.mjs',
    claim: "a closed infobox roof decides when Wikidata and the lead name none",
    find: "  if (fd) return { roof: fd, basis:",
    replace: "  if (false) return { roof: fd, basis:",
    expect: 'node scripts/venue-source.mjs --self-test',
  },
  {
    id: 'venue-source-roof-field-agreeing-rewrites-basis',
    file: 'scripts/venue-source.mjs',
    claim: "an infobox agreeing with the lead leaves the lead's basis as it was",
    find: "  if (ld && ld !== 'open') return { roof: ld, basis: 'wikipedia lead' }",
    replace: "  if (ld && ld !== 'open' && !fd) return { roof: ld, basis: 'wikipedia lead' }",
    expect: 'node scripts/venue-source.mjs --self-test',
  },
  {
    id: 'venue-source-roof-field-silence-not-blocking',
    file: 'scripts/venue-source.mjs',
    claim: "an infobox that did not answer refuses an open inference",
    find: "  if (ld === 'open' && field === null) return {",
    replace: "  if (false) return {",
    expect: 'node scripts/venue-source.mjs --self-test',
  },
  {
    id: 'venue-source-roof-field-silence-undoes-a-named-roof',
    file: 'scripts/venue-source.mjs',
    claim: "an infobox that did not answer does not undo a roof Wikidata or the lead named",
    find: "  if (wd && wd !== 'open') return { roof: wd, basis: `wikidata P5624 \"${wikidataRoof}\"` }",
    replace: "  if (field === null) return { roof: null, basis: 'the infobox did not answer' }\n  if (wd && wd !== 'open') return { roof: wd, basis: `wikidata P5624 \"${wikidataRoof}\"` }",
    expect: 'node scripts/venue-source.mjs --self-test',
  },
  {
    id: 'venue-source-roof-field-not-passed',
    file: 'scripts/venue-source.mjs',
    claim: "roofOf hands the infobox's values to the rule",
    find: "const d = decideRoof(b.roofLabel?.value ?? null, lead, body, field)",
    replace: "const d = decideRoof(b.roofLabel?.value ?? null, lead, body)",
    expect: 'node scripts/venue-source.mjs --self-test',
  },
  {
    id: 'venue-source-roof-field-failure-read-as-empty',
    file: 'scripts/venue-source.mjs',
    claim: "an infobox request that failed is did-not-answer, never an empty field",
    find: "field = box.ok ? box.value : null",
    replace: "field = box.ok ? box.value : []",
    expect: 'node scripts/venue-source.mjs --self-test',
  },
  {
    id: 'venue-source-roof-field-cache-key-changed',
    file: 'scripts/venue-source.mjs',
    claim: "roofOf reads and writes the infobox under wp-infobox|title",
    find: "const box = await cached(cache, `wp-infobox|${title}`",
    replace: "const box = await cached(cache, `wp-infobox2|${title}`",
    expect: 'node scripts/venue-source.mjs --self-test',
  },
  {
    id: 'venue-source-roof-field-cache-kind-dropped',
    file: 'scripts/venue-source.mjs',
    claim: "the cache keeps the infobox answers on load",
    find: "'wp-bodyroof', 'wp-infobox', 'wp-team'",
    replace: "'wp-bodyroof', 'wp-team'",
    expect: 'node scripts/venue-source.mjs --self-test',
  },
  {
    id: 'venue-source-roof-field-url-changed',
    file: 'scripts/venue-source.mjs',
    claim: "roofOf asks for the infobox with the parse URL of the article's title",
    find: "const r = await getJson(parseUrl(title))",
    replace: "const r = await getJson(`${parseUrl(title)}&x=1`)",
    expect: 'node scripts/venue-source.mjs --self-test',
  },
  {
    id: 'venue-source-roof-field-reason-not-said',
    file: 'scripts/venue-source.mjs',
    claim: "a row left in review because the infobox did not answer says so",
    find: " : !box.ok ? `the article infobox did not answer: ${box.why}` : null",
    replace: " : null",
    expect: 'node scripts/venue-source.mjs --self-test',
  },
  {
    id: 'venue-source-roof-field-values-raw',
    file: 'scripts/venue-infobox-read.mjs',
    claim: "the roof values the rule keeps are the flat text of each roof parameter",
    find: "t.infoboxes.flatMap(i => i.roof.map(r => r.flat))",
    replace: "t.infoboxes.flatMap(i => i.roof.map(r => r.raw))",
    expect: 'node scripts/venue-source.mjs --self-test',
  },
  {
    id: 'venue-source-roof-field-first-infobox-only',
    file: 'scripts/venue-infobox-read.mjs',
    claim: "the roof values come from every infobox of the article",
    find: "t.infoboxes.flatMap(i => i.roof.map(r => r.flat))",
    replace: "t.infoboxes.slice(0, 1).flatMap(i => i.roof.map(r => r.flat))",
    expect: 'node scripts/venue-source.mjs --self-test',
  },
  {
    id: 'venue-source-roof-field-unreadable-is-empty',
    file: 'scripts/venue-infobox-read.mjs',
    claim: "an answer that cannot be read is a failure, not an infobox with no roof",
    find: ": { ok: false, why: `the parse tree could not be read: ${t.why}` }",
    replace: ": { ok: true, value: [] }",
    expect: 'node scripts/venue-source.mjs --self-test',
  },
  {
    id: 'venue-infobox-answer-api-error-ignored',
    file: 'scripts/venue-infobox-read.mjs',
    claim: "an API error object is a failure that names the code",
    find: "  if (v?.error) return { ok: false,",
    replace: "  if (false) return { ok: false,",
    expect: 'node scripts/venue-infobox.mjs --self-test',
  },
  {
    id: 'venue-infobox-answer-no-parsetree-reads-as-article',
    file: 'scripts/venue-infobox-read.mjs',
    claim: "an answer with no parse tree is a failure, never an article with nothing in it",
    find: "  if (typeof text !== 'string') return { ok: false,",
    replace: "  if (typeof text !== 'string') return { ok: true, text: '<root/>' }\n  if (false) return { ok: false,",
    expect: 'node scripts/venue-infobox.mjs --self-test',
  },
  // --- the outbox row on a scheduled run, docs/CC-CMD-2026-10-17-verify-full-scheduled-outbox-row.md (option 1) ---
  {
    // Not applicable leaking past `schedule` turns a real miss into a quiet pass.
    id: 'outbox-na-beyond-schedule',
    file: 'scripts/gate-checks.mjs',
    claim: 'the outbox row is not applicable ONLY on a scheduled run, and a session run with no entry still fails',
    find: "  if (event === 'schedule') return NOT_APPLICABLE",
    replace: '  return NOT_APPLICABLE',
    expect: 'node scripts/outbox-row-check.mjs --self-test',
  },
  {
    // Exit 0 would make the harness and any shell caller read "no subject" as a pass.
    id: 'run-row-na-exits-zero',
    file: 'scripts/run-row.mjs',
    claim: 'a not-applicable row exits 3, so no caller can read it as a pass',
    find: '  process.exit(3)',
    replace: '  process.exit(0)',
    expect: 'node scripts/outbox-row-check.mjs --self-test',
  },
  {
    // A scheduled run measured less than the whole gate.
    id: 'na-run-backs-a-score',
    file: 'scripts/confidence-record-check.mjs',
    claim: 'a run with a not-applicable row cannot back a score, and the refusal says why',
    find: '  if ((run.notApplicable ?? []).length > 0) {',
    replace: '  if (false) {',
    expect: 'node scripts/confidence-record-check.mjs --self-test',
  },
  {
    // Without it, a dispatch on the tree a scheduled run measured would read as a nondeterministic gate.
    id: 'na-runs-read-as-conflict',
    file: 'scripts/confidence-record-check.mjs',
    claim: 'a scheduled and a session run of one tree are incomparable, not a conflict',
    find: '      if (naKey(prior) !== naKey(r)) { incomparable.push(r.id); continue }\n',
    replace: '',
    expect: 'node scripts/confidence-record-check.mjs --self-test',
  },
  // --- the pre-commit hook without a build, docs/CC-CMD-2026-10-19-precommit-hook-needs-build.md ---
  {
    // Excusing "needs a build" on CI would let a module CI never imported pass.
    id: 'import-purity-needs-build-excused-on-ci',
    file: 'scripts/import-purity-check.mjs',
    claim: 'a module that needs build/ is a failure on CI and wherever build/ exists',
    find: '  const excused = r => r.needsBuild && !buildPresent && !ci',
    replace: '  const excused = r => r.needsBuild',
    expect: 'node scripts/import-purity-check.mjs --self-test',
  },
  // --- BDB scout rows (NFL), docs/CC-CMD-2026-10-18-bdb-scout-mirror.md: src/Bdb.fs, its Suite group, docs/BDB-PROOF.md ---
  {
    // The seal. A public SpeedFloor lets a caller build one from any number and print it bare.
    id: 'bdb-floor-public',
    file: 'src/Bdb.fs',
    claim: 'a speed floor cannot be built or taken apart outside its module',
    find: '    private\n    | SpeedFloor of float<mph>',
    replace: '    | SpeedFloor of float<mph>',
    expect: 'node scripts/proof-check.mjs --only BDB-PROOF',
  },
  {
    // The mark. A floor rendered as a bare number reads as a current measurement.
    id: 'bdb-floor-mark-dropped',
    file: 'src/Bdb.fs',
    claim: 'a floor reaches text with its "≥"',
    find: 'let floorText (SpeedFloor v) = sprintf "≥%.1f" (float v)',
    replace: 'let floorText (SpeedFloor v) = sprintf "%.1f" (float v)',
    expect: 'node build/VerifyMain.js',
  },
  {
    // Ambiguity. Keeping the last row for a shared name gives Josh Allen BUF the JAX edge rusher's speed.
    id: 'bdb-shared-name-kept',
    file: 'src/Bdb.fs',
    claim: 'a name two 2022 rows share carries no floor',
    find: '            elif seen.ContainsKey k then seen.Add(k, None)\n',
    replace: '',
    expect: 'node build/VerifyMain.js',
  },
  {
    // Order. Ranked by speed, the row ranks only the players tracked in 2022.
    id: 'bdb-starters-ranked-by-speed',
    file: 'src/Bdb.fs',
    claim: 'starters are listed in position order, not by speed',
    find: '            starters |> Map.tryFind pos |> Option.bind (fun name -> floorOf idx name |> Option.map (fun f -> name, f)))',
    replace: '            starters |> Map.tryFind pos |> Option.bind (fun name -> floorOf idx name |> Option.map (fun f -> name, f)))\n        |> List.sortByDescending (fun (_, SpeedFloor v) -> v)',
    expect: 'node build/VerifyMain.js',
  },
  {
    // The season. A label without it reads as this season beside current rows.
    id: 'bdb-label-unseasoned',
    file: 'src/Bdb.fs',
    claim: 'the speed row is labelled with the season it was released at',
    find: 'let speedLabel (SpeedIndex(season, _)) = sprintf "Speed floor mph (%d)" (int season)',
    replace: 'let speedLabel (SpeedIndex(season, _)) = "Speed floor mph"',
    expect: 'node build/VerifyMain.js',
  },
  // Second Wind (NHL), CC-CMD 2026-10-15 Task 3: src/Stamina.fs, its Suite group and docs/STAMINA-PROOF.md.
  {
    id: 'stamina-sealed',
    file: 'src/Stamina.fs',
    claim: 'a reading cannot be minted or branched on outside its module (the constructor seal)',
    find: '    private // no reading is minted outside this module',
    replace: '    // no reading is minted outside this module',
    expect: 'node scripts/proof-check.mjs --only STAMINA-PROOF',
  },
  {
    id: 'stamina-reach-min',
    file: 'src/Stamina.fs',
    claim: 'below the fewest attempts at which BOTH verdicts are reachable, the reading is Insufficient',
    find: '    max (fewestFor share) (fewestFor (1.0 - share))',
    replace: '    min (fewestFor share) (fewestFor (1.0 - share))',
    expect: 'node build/VerifyMain.js',
  },
  {
    id: 'stamina-insufficient-is-trailing',
    file: 'src/Stamina.fs',
    claim: 'Insufficient is a sibling of TrailingRate, not a fall-through to it',
    find: '        Insufficient n',
    replace: '        TrailingRate { InFirst = game.FirstThird; InLast = game.LastThird; ExpectedShare = expected }',
    expect: 'node build/VerifyMain.js',
  },
  {
    id: 'stamina-tail-loosened',
    file: 'src/Stamina.fs',
    claim: 'a verdict needs its own tail at 2.5%, not 10%',
    find: 'let private tail = 0.025',
    replace: 'let private tail = 0.1',
    expect: 'node build/VerifyMain.js',
  },
  {
    id: 'stamina-population-rate-folded',
    file: 'src/Stamina.fs',
    claim: 'a split within the band rate is PopulationRate, its own case, never TrailingRate',
    find: '        else PopulationRate evidence',
    replace: '        else TrailingRate evidence',
    expect: 'node build/VerifyMain.js',
  },
  {
    id: 'stamina-null-is-flat',
    file: 'src/Stamina.fs',
    claim: 'the null is the band\'s measured expected share, not an even split',
    find: '    let expected = expectedShare band',
    replace: '    let expected = 0.5',
    expect: 'node build/VerifyMain.js',
  },
  {
    id: 'stamina-live-witness',
    file: 'src/Stamina.fs',
    claim: 'a play-by-play whose own gameState is LIVE yields no amnesty witness',
    find: '    | VendorState.Live, _ -> None',
    replace: '    | VendorState.Live, _ -> Desk.amnestyZone (Desk.Final(0, 0, false))',
    expect: 'node build/VerifyMain.js',
  },
  {
    id: 'stamina-coverage-period-guard',
    file: 'src/Stamina.fs',
    claim: 'credit coverage reads only the credited player\'s shifts in the SAME period',
    find: '        |> List.exists (fun s -> s.ShiftPeriod = period && rule s.From s.Until (moved period t))',
    replace: '        |> List.exists (fun s -> rule s.From s.Until (moved period t))',
    expect: 'node build/VerifyMain.js',
  },
  {
    id: 'stamina-coverage-end-rule',
    file: 'src/Stamina.fs',
    claim: 'end-inclusive coverage is (a,b], so a goal on its scorer\'s shift-end second is inside it',
    find: '          EndInclusive = instants |> List.filter (covered (fun a b t -> a < t && t <= b)) |> List.length',
    replace: '          EndInclusive = instants |> List.filter (covered (fun a b t -> a <= t && t < b)) |> List.length',
    expect: 'node build/VerifyMain.js',
  },
  {
    id: 'stamina-tails-underflow',
    file: 'src/Stamina.fs',
    claim: 'the binomial tails are summed in log space, so a long split cannot underflow to SecondWind',
    find: '    let mutable logMass = float n * log rest',
    replace: '    let mutable logMass = log (pown rest n)',
    expect: 'node build/VerifyMain.js',
  },
  {
    // The owner's 2026-10-16 ruling: no conditioning term in the accessible name.
    id: 'stamina-label-trailing-rate',
    file: 'src/Stamina.fs',
    claim: 'the label names the lower tail TrailingRate, never the conditioning word the owner ruled out',
    find: '        | TrailingRate e -> counted "TrailingRate" e',
    replace: '        | TrailingRate e -> counted "Fatiguing" e',
    expect: 'node build/VerifyMain.js',
  },
  // --- Second Wind over the committed NHL capture (real bytes) ---
  {
    // The real-bytes row's counterexample is the capture with its total rewritten to 1.
    id: 'stamina-chart-total-checked',
    file: "src/Stamina.fs",
    claim: "a shift chart whose total disagrees with its own rows is refused",
    find: "        if total <> List.length rows then",
    replace: "        if false then",
    expect: 'node build/VerifyMain.js',
  },
  {
    // The committed game went past regulation; the row requires an attempt there.
    id: 'stamina-overtime-counted',
    file: "src/Stamina.fs",
    claim: "attempts past regulation are counted, not dropped",
    find: "BeyondRegulation = pbp.Attempts |> List.filter (fun a -> a.AttemptPeriod > 3) |> List.length",
    replace: "BeyondRegulation = 0",
    expect: 'node build/VerifyMain.js',
  },
  {
    // Without the shift the +600 s control covers as much as the real clock, and the row has no control.
    id: 'stamina-coverage-clock-shift',
    file: "src/Stamina.fs",
    claim: "the coverage control moves every instant by its shift",
    find: "        let later = t + clockShift\n",
    replace: "        let later = t\n",
    expect: 'node build/VerifyMain.js',
  },
  // --- Tactical Lock (empowerment Task 2): table, refusals, seal ---
  {
    id: 'tactical-lock-quiet-never-produced',
    file: 'src/TacticalLock.fs',
    claim: 'few chances with the territory low is Quiet, the sibling the lock must not swallow',
    find: '                if suppressed <= b.Total && best <= b.BestChance then Quiet else Searching',
    replace: '                Searching',
    expect: 'node build/VerifyMain.js',
  },
  {
    id: 'tactical-lock-siege-reads-quiet',
    file: 'src/TacticalLock.fs',
    claim: 'a high-territory window the lock refuses is under siege, not Quiet',
    find: '                | None -> Searching',
    replace: '                | None -> Quiet',
    expect: 'node build/VerifyMain.js',
  },
  {
    id: 'tactical-lock-quiet-named-searching',
    file: 'src/TacticalLock.fs',
    claim: 'each state has its own accessible name',
    find: '    | Quiet -> "Quiet state active"',
    replace: '    | Quiet -> "Searching state active"',
    expect: 'node build/VerifyMain.js',
  },
  {
    id: 'tactical-lock-searching-drawn-unmeasured',
    file: 'src/TacticalLock.fs',
    claim: 'a measured verdict is never drawn with the unmeasured shape',
    find: '    | Searching -> LockEncoding LockShape.OpenArc',
    replace: '    | Searching -> LockEncoding LockShape.Hatch',
    expect: 'node build/VerifyMain.js',
  },
  {
    id: 'tactical-lock-unmeasured-chance-reads-a-verdict',
    file: 'src/TacticalLock.fs',
    claim: 'a chance whose xG is NaN or negative is unmeasured, never a verdict either way',
    find: '        if not (List.forall measured shots) then',
    replace: '        if false then',
    expect: 'node build/VerifyMain.js',
  },
  {
    // Loosens the lock's constructor: the counterexample is taken and ignored.
    id: 'tactical-lock-best-chance-unrefused',
    file: 'src/TacticalLock.fs',
    claim: 'a lock is refused when the opponent best chance exceeds its bar',
    find: '    if suppressed <= b.Total && bestChanceAllowed <= b.BestChance then',
    replace: '    if suppressed <= b.Total then',
    expect: 'node build/VerifyMain.js',
  },
  {
    // Loosens the bars' constructor.
    id: 'tactical-lock-bars-take-a-negative-best',
    file: 'src/TacticalLock.fs',
    claim: 'bars refuse a best-chance bar that is negative or not a number',
    find: '    if 0.0f<xg> <= bestChance && bestChance < total then',
    replace: '    if bestChance < total then',
    expect: 'node build/VerifyMain.js',
  },
  {
    // Loosens the seal: a public DefenseState lets a lock be written down.
    id: 'tactical-lock-state-forgeable',
    file: 'src/TacticalLock.fs',
    claim: 'a lock can only be computed, never constructed outside its module',
    find: '    private\n    | Searching',
    replace: '    | Searching',
    expect: 'node scripts/proof-check.mjs --only LOCK-PROOF',
  },
  {
    // The shootout flag. Ignored, a shootout play is drawn as a standard play with a WPA it never had.
    id: 'play-frames-shootout-flag-ignored',
    file: "src/LaboratorySurface.fs",
    claim: "a scoring-flag byte of 2 marks a shootout play, which carries no WPA",
    find: "        if flagAt i = ShootoutFlag then",
    replace: "        if false then",
    expect: "node build/VerifyMain.js",
  },
  {
    // The play after a shootout play has nothing before it to differ from.
    id: 'play-frames-wpa-across-a-shootout',
    file: "src/LaboratorySurface.fs",
    claim: "the play after a shootout play has no WPA",
    find: "                if i > 0 && flagAt (i - 1) <> ShootoutFlag then",
    replace: "                if i > 0 then",
    expect: "node build/VerifyMain.js",
  },
  {
    // The direction. Reversed, a rise in win probability prints as a fall.
    id: 'play-frames-wpa-reversed',
    file: "src/LaboratorySurface.fs",
    claim: "WPA is this play's win probability minus the previous play's",
    find: 'sprintf "%+.3f" (wp - prev)',
    replace: 'sprintf "%+.3f" (prev - wp)',
    expect: "node build/VerifyMain.js",
  },
  {
    // Which record. Named at record 0 whatever the record, the reader looks at the wrong 24 bytes.
    id: 'play-frames-reserved-wrong-record',
    file: "src/LaboratorySurface.fs",
    claim: "a reserved byte in use is named at the record that holds it",
    find: 'sprintf "bytes 22-23 are not zero at record %d" at',
    replace: 'sprintf "bytes 22-23 are not zero at record %d" (at - at)',
    expect: "node build/VerifyMain.js",
  },
  {
    // The exhibit drops a state: the section would no longer show everything the decoder can say.
    id: 'play-frames-exhibit-drops-a-state',
    file: "src/LaboratorySurface.fs",
    claim: "the exhibit shows each of the six states the decoder names, exactly once",
    find: '      "PLAY 1047", PlayFrame.Wire.allocateBytes 0 ]',
    replace: '      ]',
    expect: "node build/VerifyMain.js",
  },
  // The CI branch of the gate's mutation row (docs/CC-CMD-2026-11-03-gate-speed.md). Found by an independent review: with GATE_MUTATION_SHARDS set the row runs
  // `shardedSuite` instead of the suite, and replacing its body with `return true` left every other check green. These break each decision it makes.
  {
    id: 'sharded-row-reads-nothing',
    file: 'scripts/gate-checks.mjs',
    claim: 'the sharded mutation row really waits for the shards and merges them, rather than returning true',
    find: "  return ok(`${awaitCmd} ${dir} --of ${shards}`) &&\n         ok(`${mergeCmd} ${dir} --of ${shards}`)",
    replace: "  return true",
    expect: 'node scripts/sharded-row-check.mjs --self-test',
  },
  {
    id: 'sharded-row-either-passes',
    file: 'scripts/gate-checks.mjs',
    claim: 'the sharded mutation row needs the wait AND the merge to pass',
    find: "  return ok(`${awaitCmd} ${dir} --of ${shards}`) &&\n         ok(`${mergeCmd} ${dir} --of ${shards}`)",
    replace: "  return ok(`${awaitCmd} ${dir} --of ${shards}`) ||\n         ok(`${mergeCmd} ${dir} --of ${shards}`)",
    expect: 'node scripts/sharded-row-check.mjs --self-test',
  },
  {
    id: 'sharded-row-skips-the-merge',
    file: 'scripts/gate-checks.mjs',
    claim: 'the sharded mutation row runs the merge that refuses a shard set which is not the whole table',
    find: "         ok(`${mergeCmd} ${dir} --of ${shards}`)\n}",
    replace: "         true\n}",
    expect: 'node scripts/sharded-row-check.mjs --self-test',
  },
  {
    id: 'sharded-row-accepts-any-count',
    file: 'scripts/gate-checks.mjs',
    claim: 'GATE_MUTATION_SHARDS must be a positive integer, or the row fails',
    find: "if (!/^[1-9]\\d*$/.test(shards)) {",
    replace: "if (!/^\\d*$/.test(shards)) {",
    expect: 'node scripts/sharded-row-check.mjs --self-test',
  },
  {
    id: 'sharded-row-reads-a-stale-directory',
    file: 'scripts/gate-checks.mjs',
    claim: 'the shard directory is emptied before the wait, so an earlier run\'s files are never read as this run\'s',
    find: "  rmSync(dir, { recursive: true, force: true })\n  return ok(",
    replace: "  return ok(",
    expect: 'node scripts/sharded-row-check.mjs --self-test',
  },
  {
    id: 'sharded-row-branch-removed',
    file: 'scripts/gate-checks.mjs',
    claim: 'the row on CI is wired to the shard branch, not to the in-process suite',
    find: ": shardedSuite(process.env.GATE_MUTATION_SHARDS, 'node scripts/mutation-await.mjs', 'node scripts/mutation-merge.mjs'))",
    replace: ": ok('node scripts/mutation-check.mjs'))",
    expect: 'node scripts/sharded-row-check.mjs --self-test',
  },

  // --- clean-source-check's remedy (2026-11-05) ----------------------------------------------------
  //
  // docs/CC-CMD-2026-11-03-gate-hazard-residuals.md Task 3. The check used to tell a reader to restore
  // an injected file with `git checkout --`, which throws away every uncommitted edit to it and, when
  // the injection is already committed, changes nothing. It now says what proof-check does with the run
  // state it has, and what to do by hand without one. Each of these breaks one part of that, and is
  // caught by the check's own `--self-test`, which runs the real script over fixture directories.
  {
    id: "clean-source-remedy-is-a-checkout",
    file: 'scripts/clean-source-check.mjs',
    claim: "the remedy names the heal or the lines, never a bare checkout that also discards uncommitted edits",
    find: "      ? `${dirty.join(', ')} — ${remedy}`",
    replace: "      ? `${dirty.join(', ')} — restore with: git checkout -- ${paths}`",
    expect: 'node scripts/clean-source-check.mjs --self-test',
  },
  {
    id: "clean-source-state-always-assumed",
    file: 'scripts/clean-source-check.mjs',
    claim: "a tree with no run state is not told to run proof-check as if it could heal",
    find: "const remedy = existsSync(ACTIVE_FILE)",
    replace: "const remedy = true",
    expect: 'node scripts/clean-source-check.mjs --self-test',
  },
  {
    id: "clean-source-state-never-seen",
    file: 'scripts/clean-source-check.mjs',
    claim: "a tree with a run state is told to run proof-check, and not to delete the state",
    find: "const remedy = existsSync(ACTIVE_FILE)",
    replace: "const remedy = false",
    expect: 'node scripts/clean-source-check.mjs --self-test',
  },
  {
    id: "clean-source-state-is-any-directory",
    file: 'scripts/clean-source-check.mjs',
    claim: "a state directory with no active.json counts as no run state, as it does to proof-check",
    find: "const remedy = existsSync(ACTIVE_FILE)",
    replace: "const remedy = existsSync(STATE_DIR)",
    expect: 'node scripts/clean-source-check.mjs --self-test',
  },
  {
    id: "clean-source-marker-drift-unchecked",
    file: 'scripts/clean-source-check.mjs',
    claim: "a proof-check that no longer writes the marker fails the scan instead of letting it pass vacuously",
    find: "harness.includes(`const MARKER = '${MARKER}'`) &&",
    replace: "true &&",
    expect: 'node scripts/clean-source-check.mjs --self-test',
  },
  {
    id: "clean-source-anchor-drift-unchecked",
    file: 'scripts/clean-source-check.mjs',
    claim: "a proof-check that no longer writes the block above the function the instruction names fails the scan instead of letting the instruction go stale",
    find: "harness.includes(`const MARKER = '${MARKER}'`) && harness.includes(`const ANCHOR = '${ANCHOR}'`),",
    replace: "harness.includes(`const MARKER = '${MARKER}'`),",
    expect: 'node scripts/clean-source-check.mjs --self-test',
  },
  {
    id: "clean-source-state-dir-drift-unchecked",
    file: 'scripts/clean-source-check.mjs',
    claim: "a proof-check that keeps its state in another directory fails the scan, so the remedy cannot branch on a path nobody writes",
    find: "harness.includes(`const STATE_DIR = '${STATE_DIR}'`) && ",
    replace: "",
    expect: 'node scripts/clean-source-check.mjs --self-test',
  },
  {
    id: "clean-source-state-file-drift-unchecked",
    file: 'scripts/clean-source-check.mjs',
    claim: "a proof-check whose run marker is another file fails the scan, so the remedy cannot branch on a file nobody writes",
    find: " && harness.includes(`const MARKER_FILE = join(STATE_DIR, '${ACTIVE}')`),",
    replace: ",",
    expect: 'node scripts/clean-source-check.mjs --self-test',
  },
  {
    id: "clean-source-scan-blind",
    file: 'scripts/clean-source-check.mjs',
    claim: "a source file that carries the marker is found",
    find: "const blocks = where(MARKER)",
    replace: "const blocks = where(MARKER + 'x')",
    expect: 'node scripts/clean-source-check.mjs --self-test',
  },
  {
    id: "clean-source-state-dir-unnamed",
    file: 'scripts/clean-source-check.mjs',
    claim: "the remedy for a tree with a run state names the directory that holds the backups and says to keep it",
    find: "The backups are in ${STATE_DIR}/; do not delete it",
    replace: "The backups are kept",
    expect: 'node scripts/clean-source-check.mjs --self-test',
  },
  {
    id: "clean-source-no-sources-passes",
    file: 'scripts/clean-source-check.mjs',
    claim: "a tree with no F# sources fails, not passes on nothing",
    find: "    sources.length > 0,\n",
    replace: "    true,\n",
    expect: 'node scripts/clean-source-check.mjs --self-test',
  },
  {
    id: "clean-source-checkout-cost-unsaid",
    file: 'scripts/clean-source-check.mjs',
    claim: "when a checkout is named, so is what it discards",
    find: "committed (the pre-commit hook sees it staged, where the checkout changes nothing), and it discards every unstaged edit to ${many ? 'those files' : 'the file'}`",
    replace: "committed (the pre-commit hook sees it staged, where the checkout changes nothing), and it restores ${many ? 'those files' : 'the file'}`",
    expect: 'node scripts/clean-source-check.mjs --self-test',
  },
  {
    id: "clean-source-checkout-unconditional",
    file: 'scripts/clean-source-check.mjs',
    claim: "a checkout is named only for an injection that is neither staged nor committed (on those it changes nothing)",
    find: "it removes an injection only while that injection is neither staged nor committed (the pre-commit hook sees it staged, where the checkout changes nothing), and it discards",
    replace: "it removes the injection and it discards",
    expect: 'node scripts/clean-source-check.mjs --self-test',
  },
  {
    id: "clean-source-refusal-unsaid",
    file: 'scripts/clean-source-check.mjs',
    claim: "the remedy says proof-check refuses, writing nothing, when the run is still going",
    find: " or that run is still going; after a restore",
    replace: "; after a restore",
    expect: 'node scripts/clean-source-check.mjs --self-test',
  },
  {
    id: "clean-source-grep-hint-is-git-diff",
    file: 'scripts/clean-source-check.mjs',
    claim: "the lines are found with a command that works on a committed injection too, not git diff, which prints nothing there",
    find: "\\`grep -n \"${MARKER}\" ${at(blocks)}\\` finds the headers",
    replace: "\\`git diff -- ${at(blocks)}\\` finds the headers",
    expect: 'node scripts/clean-source-check.mjs --self-test',
  },
  // --- clean-source-check's registry probe (2026-11-05) --------------------------------------------
  //
  // proof-check's registry phase writes one line (a second `| NHL`) directly above the Sport union's last case, and a kill there strands it. The scan only looked for the proof-function marker, so
  // `check:clean-source` passed (4/4, exit 0, measured) on a tree proof-check itself refused. It now looks for the probe in every source file, asserts the constants that define it against
  // proof-check's source, and tells a reader what to delete. Each of these breaks one part of that, and is caught by the check's own `--self-test`.
  {
    id: "clean-source-probe-scan-blind",
    file: 'scripts/clean-source-check.mjs',
    claim: "a source file that carries the registry's probe case is found",
    find: "const probes = where(PROBE_SITE)",
    replace: "const probes = where(PROBE_SITE + 'x')",
    expect: 'node scripts/clean-source-check.mjs --self-test',
  },
  {
    id: "clean-source-probe-not-in-dirty",
    file: 'scripts/clean-source-check.mjs',
    claim: "a file that carries only the probe case is one of the files the check fails on",
    find: "blocks.includes(f) || probes.includes(f) ||",
    replace: "blocks.includes(f) ||",
    expect: 'node scripts/clean-source-check.mjs --self-test',
  },
  {
    id: "clean-source-probe-site-is-any-nhl",
    file: 'scripts/clean-source-check.mjs',
    claim: "a union that has `| NHL` as a real case is not called injected: the probe is a second one, directly above the union's last case",
    find: "const PROBE_SITE = REGISTRY_PROBE + REGISTRY_ANCHOR.slice(1)",
    replace: "const PROBE_SITE = REGISTRY_PROBE",
    expect: 'node scripts/clean-source-check.mjs --self-test',
  },
  {
    id: "clean-source-probe-site-is-any-last-case",
    file: 'scripts/clean-source-check.mjs',
    claim: "a union's last case is not called a probe: the probe is the line above it",
    find: "const PROBE_SITE = REGISTRY_PROBE + REGISTRY_ANCHOR.slice(1)",
    replace: "const PROBE_SITE = REGISTRY_ANCHOR.slice(1)",
    expect: 'node scripts/clean-source-check.mjs --self-test',
  },
  {
    id: "clean-source-probe-instruction-dropped",
    file: 'scripts/clean-source-check.mjs',
    claim: "a tree that carries the probe case is told what to delete",
    find: "...(probes.length ? [",
    replace: "...(false ? [",
    expect: 'node scripts/clean-source-check.mjs --self-test',
  },
  {
    id: "clean-source-probe-line-unnamed",
    file: 'scripts/clean-source-check.mjs',
    claim: "the probe is named as a line: the one directly above the union's last case",
    find: "(the line \"${REGISTRY_PROBE.trimEnd()}\" directly above \"${REGISTRY_ANCHOR.slice(1)}\"; ",
    replace: "(",
    expect: 'node scripts/clean-source-check.mjs --self-test',
  },
  {
    id: "clean-source-probe-grep-without-context",
    file: 'scripts/clean-source-check.mjs',
    claim: "the probe's grep shows the line above the union's last case, which is the probe (the last case itself is always there)",
    find: "grep -n -B1 \"^${REGISTRY_ANCHOR.slice(1)}[[:space:]]*$\" ${at(probes)}",
    replace: "grep -n \"^${REGISTRY_ANCHOR.slice(1)}[[:space:]]*$\" ${at(probes)}",
    expect: 'node scripts/clean-source-check.mjs --self-test',
  },
  {
    id: "clean-source-block-grep-names-the-probe-file",
    file: 'scripts/clean-source-check.mjs',
    claim: "the grep for the injected block names the files that carry a block, not the file that carries a probe",
    find: "\\`grep -n \"${MARKER}\" ${at(blocks)}\\` finds the headers",
    replace: "\\`grep -n \"${MARKER}\" ${paths}\\` finds the headers",
    expect: 'node scripts/clean-source-check.mjs --self-test',
  },
  {
    id: "clean-source-probe-grep-names-the-block-file",
    file: 'scripts/clean-source-check.mjs',
    claim: "the grep for the probe case names the files that carry a probe, not the file that carries a block",
    find: "\"^${REGISTRY_ANCHOR.slice(1)}[[:space:]]*$\" ${at(probes)}",
    replace: "\"^${REGISTRY_ANCHOR.slice(1)}[[:space:]]*$\" ${paths}",
    expect: 'node scripts/clean-source-check.mjs --self-test',
  },
  {
    id: "clean-source-instructions-not-joined",
    file: 'scripts/clean-source-check.mjs',
    claim: "a tree with a block and a probe is told both, as two instructions",
    find: "Delete ${deletions.join(' and ')}. ",
    replace: "Delete ${deletions.join(' ')}. ",
    expect: 'node scripts/clean-source-check.mjs --self-test',
  },
  {
    id: "clean-source-probe-anchor-drift-unchecked",
    file: 'scripts/clean-source-check.mjs',
    claim: "a proof-check that puts its probe above another case fails the scan, so it cannot look for a place nobody writes",
    find: "harness.includes(`const REGISTRY_ANCHOR = '${asSource(REGISTRY_ANCHOR)}'`) && ",
    replace: "",
    expect: 'node scripts/clean-source-check.mjs --self-test',
  },
  {
    id: "clean-source-probe-line-drift-unchecked",
    file: 'scripts/clean-source-check.mjs',
    claim: "a proof-check that writes another probe line fails the scan, so it cannot look for a line nobody writes",
    find: "harness.includes(`const REGISTRY_PROBE = '${asSource(REGISTRY_PROBE)}'`)\n      && ",
    replace: "",
    expect: 'node scripts/clean-source-check.mjs --self-test',
  },
  {
    id: "clean-source-probe-site-drift-unchecked",
    file: 'scripts/clean-source-check.mjs',
    claim: "a proof-check that composes the text it looks for differently fails the scan, so the two cannot disagree about what a probe is",
    find: "\n      && harness.includes(`const REGISTRY_PROBE_SITE = ${SITE_SOURCE}`),",
    replace: ",",
    expect: 'node scripts/clean-source-check.mjs --self-test',
  },
  // --- clean-source-check sees a probe an edit has separated from the union's last case (review 6, finding 0, 2026-11-05) ----------------------------------------------------------------------------
  //
  // The scan looked for the probe directly above the union's last case. A sport added there lands between the two, proof-check keeps the state for such a registry, and the scan passed over it (so the
  // pre-commit hook and verify.yml would have let a duplicate `| NHL` case through). It now also finds the same line twice in one top-level declaration, and tells a reader which line that is. Each of
  // these breaks one part of that and is caught by the check's own `--self-test`.
  {
    id: "clean-source-moved-probe-scan-blind",
    file: 'scripts/clean-source-check.mjs',
    claim: "a source file whose probe case has a sport between it and the union's last case is found",
    find: "const moved = sources.filter(f => !probes.includes(f) && probeDuplicated(readFileSync(join(SRC, f), 'utf8')))",
    replace: "const moved = []",
    expect: 'node scripts/clean-source-check.mjs --self-test',
  },
  {
    id: "clean-source-moved-not-in-dirty",
    file: 'scripts/clean-source-check.mjs',
    claim: "a file that carries only a separated probe case is one of the files the check fails on",
    find: " || moved.includes(f))",
    replace: ")",
    expect: 'node scripts/clean-source-check.mjs --self-test',
  },
  {
    id: "clean-source-duplicate-is-any-nhl",
    file: 'scripts/clean-source-check.mjs',
    claim: "a union that has `| NHL` as a case of its own is not called injected: the probe is a second one",
    find: ".filter(l => l === REGISTRY_PROBE.trimEnd()).length > 1)",
    replace: ".filter(l => l === REGISTRY_PROBE.trimEnd()).length > 0)",
    expect: 'node scripts/clean-source-check.mjs --self-test',
  },
  {
    id: "clean-source-duplicate-counted-per-file",
    file: 'scripts/clean-source-check.mjs',
    claim: "two declarations that each have an `| NHL` of their own are not an injection: the line is counted per declaration, not per file",
    find: "text.split(/\\n(?=\\S)/).some(declaration =>",
    replace: "[text].some(declaration =>",
    expect: 'node scripts/clean-source-check.mjs --self-test',
  },
  {
    id: "clean-source-adjacent-probe-also-called-moved",
    file: 'scripts/clean-source-check.mjs',
    claim: "a probe directly above the last case gets its own instruction and not also the one for a separated probe",
    find: "!probes.includes(f) && probeDuplicated(",
    replace: "probeDuplicated(",
    expect: 'node scripts/clean-source-check.mjs --self-test',
  },
  {
    id: "clean-source-moved-instruction-dropped",
    file: 'scripts/clean-source-check.mjs',
    claim: "a tree that carries a separated probe case is told what to delete",
    find: "...(moved.length ? [",
    replace: "...(false ? [",
    expect: 'node scripts/clean-source-check.mjs --self-test',
  },
  {
    id: "clean-source-moved-grep-shows-the-line-above",
    file: 'scripts/clean-source-check.mjs',
    claim: "the grep for a separated probe lists the `| NHL` lines, not the line above the last case (which is then the sport that was added)",
    find: "\\`grep -n \"^${REGISTRY_PROBE.trimEnd()}[[:space:]]*$\" ${at(moved)}\\` lists both)",
    replace: "\\`grep -n -B1 \"^${REGISTRY_ANCHOR.slice(1)}[[:space:]]*$\" ${at(moved)}\\` shows it)",
    expect: 'node scripts/clean-source-check.mjs --self-test',
  },
  {
    id: "clean-source-moved-grep-names-the-other-files",
    file: 'scripts/clean-source-check.mjs',
    claim: "the grep for a separated probe names the files that carry one, not every file the check fails on",
    find: "${at(moved)}\\` lists both)",
    replace: "${paths}\\` lists both)",
    expect: 'node scripts/clean-source-check.mjs --self-test',
  },
  {
    id: "clean-source-with-state-recommends-a-reset",
    file: 'scripts/clean-source-check.mjs',
    claim: "with a run state the remedy is proof-check and names no git command: a reset discards uncommitted edits as a checkout does",
    find: "The backups are in ${STATE_DIR}/; do not delete it`",
    replace: "The backups are in ${STATE_DIR}/; do not delete it. To discard every uncommitted edit to the file instead: git reset --hard HEAD -- ${paths}`",
    expect: 'node scripts/clean-source-check.mjs --self-test',
  },
  {
    id: "clean-source-moved-omits-that-a-line-may-sit-between",
    file: 'scripts/clean-source-check.mjs',
    claim: "a reader is told the probe's line may no longer be directly above the last case",
    find: "\"${REGISTRY_ANCHOR.slice(1)}\", and a line added since may now sit between them; ",
    replace: "\"${REGISTRY_ANCHOR.slice(1)}\"; ",
    expect: 'node scripts/clean-source-check.mjs --self-test',
  },
  {
    id: "clean-source-always-fails",
    file: 'scripts/clean-source-check.mjs',
    claim: "a clean tree passes",
    find: "    dirty.length === 0,\n",
    replace: "    false,\n",
    expect: 'node scripts/clean-source-check.mjs --self-test',
  },
  {
    id: "clean-source-names-every-source",
    file: 'scripts/clean-source-check.mjs',
    claim: "only the files that carry the marker are named",
    find: "? `${dirty.join(', ')} — ",
    replace: "? `${sources.join(', ')} — ",
    expect: 'node scripts/clean-source-check.mjs --self-test',
  },
  // The checkout sentence in the number of files that carry an injection (review 7, finding L14, 2026-11-06): proof-check says "injections ... them ... files" for two, and this scan said "injection ... it ... file".
  {
    id: "clean-source-checkout-singular-for-two-files",
    file: 'scripts/clean-source-check.mjs',
    claim: "with an injection in two files the checkout sentence says each file and those files",
    find: "const many = dirty.length > 1",
    replace: "const many = false",
    expect: 'node scripts/clean-source-check.mjs --self-test',
  },
  {
    id: "clean-source-checkout-plural-for-one-file",
    file: 'scripts/clean-source-check.mjs',
    claim: "with an injection in one file the checkout sentence stays singular",
    find: "const many = dirty.length > 1",
    replace: "const many = true",
    expect: 'node scripts/clean-source-check.mjs --self-test',
  },
  // The checkout does nothing to an injection that is staged, which is the state the pre-commit hook scans (review 7, finding L10, 2026-11-06): the sentence said "uncommitted".
  {
    id: "clean-source-checkout-ignores-staging",
    file: 'scripts/clean-source-check.mjs',
    claim: "the remedy says the checkout removes an injection only while it is neither staged nor committed, and that on a staged one (the hook's state) it changes nothing",
    find: "neither staged nor committed (the pre-commit hook sees it staged, where the checkout changes nothing), and",
    replace: "uncommitted, and",
    expect: 'node scripts/clean-source-check.mjs --self-test',
  },
  // The printed greps end in `[[:space:]]*$`, not `$` (review 7, finding L11, 2026-11-06): on a tree whose lines end in a carriage return the plain `$` printed nothing.
  {
    id: "clean-source-probe-grep-misses-a-carriage-return",
    file: 'scripts/clean-source-check.mjs',
    claim: "the grep the remedy prints for a probe directly above the last case finds it on a tree with CRLF line ends",
    find: "grep -n -B1 \"^${REGISTRY_ANCHOR.slice(1)}[[:space:]]*$\" ${at(probes)}",
    replace: "grep -n -B1 \"^${REGISTRY_ANCHOR.slice(1)}$\" ${at(probes)}",
    expect: 'node scripts/clean-source-check.mjs --self-test',
  },
  {
    id: "clean-source-moved-grep-misses-a-carriage-return",
    file: 'scripts/clean-source-check.mjs',
    claim: "the grep that lists both `| NHL` lines of a separated probe finds them on a tree with CRLF line ends",
    find: "\\`grep -n \"^${REGISTRY_PROBE.trimEnd()}[[:space:]]*$\" ${at(moved)}\\` lists both)",
    replace: "\\`grep -n \"^${REGISTRY_PROBE.trimEnd()}$\" ${at(moved)}\\` lists both)",
    expect: 'node scripts/clean-source-check.mjs --self-test',
  },
  // The block's extent (review 7, finding L12, 2026-11-06): "each header and the indented lines under it" leaves the blank line layout() writes after every block.
  {
    id: "clean-source-block-extent-is-headers-only",
    file: 'scripts/clean-source-check.mjs',
    claim: "the instruction for the injected block gives its real extent (first header through the line above the function it was written above), not the headers and indented lines, which leave a blank line per block",
    find: "[`the injected block (every line from the first \"${MARKER}N\" header down to the line directly above \"${ANCHOR}\", the blank line after each block included; ",
    replace: "[`the injected block (each \"${MARKER}N\" header and the indented lines under it; ",
    expect: 'node scripts/clean-source-check.mjs --self-test',
  },
  // A union that REALLY ends `| NHL` then `| Unrecognised` (review 7, finding L13, 2026-11-06): the remedy would have a person delete a real case, gave no way out, and said proof-check refuses where it reads only two files.
  {
    id: "clean-source-probe-escape-unsaid",
    file: 'scripts/clean-source-check.mjs',
    claim: "the remedy for a probe directly above the last case says what to do when the line is a real case: keep it and put a line between the two",
    find: "shows it; if it is a real case instead, because a union of yours ends in it, keep it and put any line between the two (a doc comment will do): lines that are not adjacent no longer match)`] : []),",
    replace: "shows it)`] : []),",
    expect: 'node scripts/clean-source-check.mjs --self-test',
  },
  {
    id: "clean-source-claims-proof-check-refuses",
    file: 'scripts/clean-source-check.mjs',
    claim: "the remedy does not say proof-check refuses: it reads only the two files it writes, so over a file it does not read it runs",
    find: "has nothing to restore from. Delete",
    replace: "has nothing to restore from and refuses. Delete",
    expect: 'node scripts/clean-source-check.mjs --self-test',
  },
  {
    id: "mutate-claim-check-writes-the-tracked-file",
    file: "scripts/mutate-claim-check.mjs",
    claim: "mutate-claim-check.mjs writes its mutation to a copy, never to the tracked file",
    find: "  writeFileSync(COPY, mutated)\n",
    replace: "  writeFileSync(F, mutated)\n",
    expect: "node scripts/mutate-copy-check.mjs --only claim-check",
  },
  {
    id: "mutate-claim-check-positive-control-deleted",
    file: "scripts/mutate-claim-check.mjs",
    claim: "mutate-claim-check.mjs proves its copy passes before it judges a mutation",
    find: "if (!selfTestPasses(RUN)) { console.log('FAIL — the UNMUTATED copy is red, so no verdict below would be about the mutation.'); process.exit(1) }\nconsole.log('positive control: the unmutated copy passes\\n')\n",
    replace: "",
    expect: "node scripts/mutate-copy-check.mjs --only claim-check",
  },
  {
    id: "mutate-claim-check-positive-control-unenforced",
    file: "scripts/mutate-claim-check.mjs",
    claim: "mutate-claim-check.mjs stops when its copy is red, it does not only say the copy passed",
    find: "if (!selfTestPasses(RUN)) { console.log('FAIL — the UNMUTATED copy is red, so no verdict below would be about the mutation.'); process.exit(1) }\n",
    replace: "",
    expect: "node scripts/mutate-copy-check.mjs --only claim-check",
  },
  {
    id: "mutate-deploy-gate-writes-the-tracked-file",
    file: "scripts/mutate-deploy-gate.mjs",
    claim: "mutate-deploy-gate.mjs writes its mutation to a copy, never to the tracked file",
    find: "  writeFileSync(COPY, mutated)\n",
    replace: "  writeFileSync(F, mutated)\n",
    expect: "node scripts/mutate-copy-check.mjs --only deploy-gate",
  },
  {
    id: "mutate-deploy-gate-positive-control-deleted",
    file: "scripts/mutate-deploy-gate.mjs",
    claim: "mutate-deploy-gate.mjs proves its copy passes before it judges a mutation",
    find: "if (!passes(RUN)) { console.log('FAIL — the UNMUTATED copy is red, so no verdict below would be about the mutation.'); process.exit(1) }\nconsole.log('positive control: the unmutated copy passes\\n')\n",
    replace: "",
    expect: "node scripts/mutate-copy-check.mjs --only deploy-gate",
  },
  {
    id: "mutate-deploy-gate-positive-control-unenforced",
    file: "scripts/mutate-deploy-gate.mjs",
    claim: "mutate-deploy-gate.mjs stops when its copy is red, it does not only say the copy passed",
    find: "if (!passes(RUN)) { console.log('FAIL — the UNMUTATED copy is red, so no verdict below would be about the mutation.'); process.exit(1) }\n",
    replace: "",
    expect: "node scripts/mutate-copy-check.mjs --only deploy-gate",
  },
  {
    id: "mutate-deploy-landed-writes-the-tracked-file",
    file: "scripts/mutate-deploy-landed.mjs",
    claim: "mutate-deploy-landed.mjs writes its mutation to a copy, never to the tracked file",
    find: "  writeFileSync(COPY, mutated)\n",
    replace: "  writeFileSync(F, mutated)\n",
    expect: "node scripts/mutate-copy-check.mjs --only deploy-landed",
  },
  {
    id: "mutate-deploy-landed-positive-control-deleted",
    file: "scripts/mutate-deploy-landed.mjs",
    claim: "mutate-deploy-landed.mjs proves its copy passes before it judges a mutation",
    find: "if (!passes(RUN)) { console.log('FAIL — the UNMUTATED copy is red, so no verdict below would be about the mutation.'); process.exit(1) }\nconsole.log('positive control: the unmutated copy passes\\n')\n",
    replace: "",
    expect: "node scripts/mutate-copy-check.mjs --only deploy-landed",
  },
  {
    id: "mutate-deploy-landed-positive-control-unenforced",
    file: "scripts/mutate-deploy-landed.mjs",
    claim: "mutate-deploy-landed.mjs stops when its copy is red, it does not only say the copy passed",
    find: "if (!passes(RUN)) { console.log('FAIL — the UNMUTATED copy is red, so no verdict below would be about the mutation.'); process.exit(1) }\n",
    replace: "",
    expect: "node scripts/mutate-copy-check.mjs --only deploy-landed",
  },
  {
    id: "mutate-odds-coverage-writes-the-tracked-file",
    file: "scripts/mutate-odds-coverage.mjs",
    claim: "mutate-odds-coverage.mjs writes its mutation to a copy, never to the tracked file",
    find: "  writeFileSync(COPY, mutated)\n",
    replace: "  writeFileSync(F, mutated)\n",
    expect: "node scripts/mutate-copy-check.mjs --only odds-coverage",
  },
  {
    id: "mutate-odds-coverage-positive-control-deleted",
    file: "scripts/mutate-odds-coverage.mjs",
    claim: "mutate-odds-coverage.mjs proves its copy passes before it judges a mutation",
    find: "if (!passes(RUN)) { console.log('FAIL — the UNMUTATED copy is red, so no verdict below would be about the mutation.'); process.exit(1) }\nconsole.log('positive control: the unmutated copy passes\\n')\n",
    replace: "",
    expect: "node scripts/mutate-copy-check.mjs --only odds-coverage",
  },
  {
    id: "mutate-odds-coverage-positive-control-unenforced",
    file: "scripts/mutate-odds-coverage.mjs",
    claim: "mutate-odds-coverage.mjs stops when its copy is red, it does not only say the copy passed",
    find: "if (!passes(RUN)) { console.log('FAIL — the UNMUTATED copy is red, so no verdict below would be about the mutation.'); process.exit(1) }\n",
    replace: "",
    expect: "node scripts/mutate-copy-check.mjs --only odds-coverage",
  },
  {
    id: "mutate-odds-shape-census-writes-the-tracked-file",
    file: "scripts/mutate-odds-shape-census.mjs",
    claim: "mutate-odds-shape-census.mjs writes its mutation to a copy, never to the tracked file",
    find: "  writeFileSync(COPY, mutated)\n",
    replace: "  writeFileSync(F, mutated)\n",
    expect: "node scripts/mutate-copy-check.mjs --only odds-shape-census",
  },
  {
    id: "mutate-odds-shape-census-positive-control-deleted",
    file: "scripts/mutate-odds-shape-census.mjs",
    claim: "mutate-odds-shape-census.mjs proves its copy passes before it judges a mutation",
    find: "if (!passes(RUN)) { console.log('FAIL — the UNMUTATED copy is red, so no verdict below would be about the mutation.'); process.exit(1) }\nconsole.log('positive control: the unmutated copy passes\\n')\n",
    replace: "",
    expect: "node scripts/mutate-copy-check.mjs --only odds-shape-census",
  },
  {
    id: "mutate-odds-shape-census-positive-control-unenforced",
    file: "scripts/mutate-odds-shape-census.mjs",
    claim: "mutate-odds-shape-census.mjs stops when its copy is red, it does not only say the copy passed",
    find: "if (!passes(RUN)) { console.log('FAIL — the UNMUTATED copy is red, so no verdict below would be about the mutation.'); process.exit(1) }\n",
    replace: "",
    expect: "node scripts/mutate-copy-check.mjs --only odds-shape-census",
  },
  {
    id: "mutate-run-steps-writes-the-tracked-file",
    file: "scripts/mutate-run-steps.mjs",
    claim: "mutate-run-steps.mjs writes its mutation to a copy, never to the tracked file",
    find: "  writeFileSync(COPY, mutated)\n",
    replace: "  writeFileSync(F, mutated)\n",
    expect: "node scripts/mutate-copy-check.mjs --only run-steps",
  },
  {
    id: "mutate-run-steps-positive-control-deleted",
    file: "scripts/mutate-run-steps.mjs",
    claim: "mutate-run-steps.mjs proves its copy passes before it judges a mutation",
    find: "if (!passes(RUN)) { console.log('FAIL — the UNMUTATED copy is red, so no verdict below would be about the mutation.'); process.exit(1) }\nconsole.log('positive control: the unmutated copy passes\\n')\n",
    replace: "",
    expect: "node scripts/mutate-copy-check.mjs --only run-steps",
  },
  {
    id: "mutate-run-steps-positive-control-unenforced",
    file: "scripts/mutate-run-steps.mjs",
    claim: "mutate-run-steps.mjs stops when its copy is red, it does not only say the copy passed",
    find: "if (!passes(RUN)) { console.log('FAIL — the UNMUTATED copy is red, so no verdict below would be about the mutation.'); process.exit(1) }\n",
    replace: "",
    expect: "node scripts/mutate-copy-check.mjs --only run-steps",
  },
  {
    id: "mutate-replay-odds-coverage-writes-the-tracked-file",
    file: "scripts/mutate-replay-odds-coverage.mjs",
    claim: "mutate-replay-odds-coverage.mjs writes its mutation to a copy, never to the tracked file",
    find: "  writeFileSync(COPY, original.replace(anchor, repl))\n",
    replace: "  writeFileSync(F, original.replace(anchor, repl))\n",
    expect: "node scripts/mutate-copy-check.mjs --only replay-odds-coverage",
  },
  {
    id: "mutate-replay-odds-coverage-positive-control-deleted",
    file: "scripts/mutate-replay-odds-coverage.mjs",
    claim: "mutate-replay-odds-coverage.mjs proves its copy passes before it judges a mutation",
    find: "if (!run()) {\n  console.log('FAIL — an UNMUTATED copy at the mutant location is red, so no verdict below would mean anything.')\n  process.exit(1)\n}\nconsole.log('positive control: the unmutated copy passes\\n')\n",
    replace: "",
    expect: "node scripts/mutate-copy-check.mjs --only replay-odds-coverage",
  },
  {
    id: "mutate-replay-odds-coverage-positive-control-unenforced",
    file: "scripts/mutate-replay-odds-coverage.mjs",
    claim: "mutate-replay-odds-coverage.mjs stops when its copy is red, it does not only say the copy passed",
    find: "if (!run()) {\n  console.log('FAIL — an UNMUTATED copy at the mutant location is red, so no verdict below would mean anything.')\n  process.exit(1)\n}\n",
    replace: "",
    expect: "node scripts/mutate-copy-check.mjs --only replay-odds-coverage",
  },
  {
    id: "mutate-copy-check-guard-never-blocks",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: the guard refuses a write under scripts/",
    find: "    if (hit) throw Object.assign",
    replace: "    if (false) throw Object.assign",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-guard-logs-no-BLOCKED",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: the guard logs a refused write as refused",
    find: "(hit ? 'BLOCKED ' : 'WROTE ')",
    replace: "'WROTE '",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-guard-root-wrong",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: the guard protects the root it is given",
    find: "const tracked = path.join(root, 'scripts') + path.sep",
    replace: "const tracked = path.join(root, 'nowhere') + path.sep",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-guard-copy-checks-source",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: a copy is judged by the path it writes, not the one it reads",
    find: "copyFileSync: [1]",
    replace: "copyFileSync: [0]",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-guard-rename-checks-source-only",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: a rename is judged by both ends",
    find: "renameSync: [0, 1]",
    replace: "renameSync: [0]",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-guard-drops-truncate",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: the guard covers all seven write functions",
    find: "'rmSync', 'truncateSync']",
    replace: "'rmSync']",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-clean-tree-vacuous",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: a refused write fails the tracked-tree clause",
    find: "cleanTree: a.blocked.length === 0,",
    replace: "cleanTree: true,",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-completes-ignores-tally",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: a script that does not print its tally does not complete",
    find: "completes: a.status === 0 && Boolean(a.tally) && a.tally[1] === a.tally[2],",
    replace: "completes: true,",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-tally-partial-ok",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: a script that catches 1 of 2 does not complete",
    find: "a.tally[1] === a.tally[2]",
    replace: "Number(a.tally[1]) > 0",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-wrote-elsewhere-vacuous",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: a guard that sees no write at all fails the wrote-elsewhere clause",
    find: "wroteElsewhere: a.lines.some(l => l.startsWith('WROTE ')),",
    replace: "wroteElsewhere: true,",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-controlled-vacuous",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: a script that never prints the positive control fails the print clause",
    find: "controlled: /^positive control: the unmutated copy passes$/m.test(a.out),",
    replace: "controlled: true,",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-refuses-red-copy-vacuous",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: a script that does not stop on a red copy fails the enforcement clause",
    find: "refusesRedCopy: b.status === 1 && /UNMUTATED/.test(b.out),",
    replace: "refusesRedCopy: true,",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-refuses-ignores-status",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: a script that reports a red copy and carries on fails the enforcement clause",
    find: "refusesRedCopy: b.status === 1 && /UNMUTATED/.test(b.out),",
    replace: "refusesRedCopy: /UNMUTATED/.test(b.out),",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-refuses-ignores-message",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: a script that stops on a red copy without the FAIL line fails the enforcement clause",
    find: "refusesRedCopy: b.status === 1 && /UNMUTATED/.test(b.out),",
    replace: "refusesRedCopy: b.status === 1,",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-red-copy-preload-inert",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: the second and third runs really make every copy red or silent",
    find: "if (fault && process.argv",
    replace: "if (false && process.argv",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-verdict-swaps-tree-clauses",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: each clause is wired to its own fact",
    find: "e.cleanTree, e.detail)",
    replace: "e.wroteElsewhere, e.detail)",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-push-lands-writes-the-tracked-file",
    file: "scripts/mutate-push-lands.py",
    claim: "mutate-push-lands.py writes its mutation to a copy, never to the tracked file",
    find: "        COPY.write_text(original.replace(anchor, repl))\n",
    replace: "        CHECK.write_text(original.replace(anchor, repl))\n",
    expect: "node scripts/mutate-copy-check.mjs --only push-lands",
  },
  {
    id: "mutate-push-lands-positive-control-deleted",
    file: "scripts/mutate-push-lands.py",
    claim: "mutate-push-lands.py proves its copy passes before it judges a mutation",
    find: "    if not passes(SELF):\n        print('FAIL — the UNMUTATED copy is red, so no verdict below would be about the mutation.'); sys.exit(1)\n    print('positive control: the unmutated copy passes\\n')\n",
    replace: "",
    expect: "node scripts/mutate-copy-check.mjs --only push-lands",
  },
  {
    id: "mutate-push-lands-positive-control-unenforced",
    file: "scripts/mutate-push-lands.py",
    claim: "mutate-push-lands.py stops when its copy is red, it does not only say the copy passed",
    find: "    if not passes(SELF):\n        print('FAIL — the UNMUTATED copy is red, so no verdict below would be about the mutation.'); sys.exit(1)\n",
    replace: "",
    expect: "node scripts/mutate-copy-check.mjs --only push-lands",
  },
  {
    id: "mutate-copy-check-py-guard-never-blocks",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: the python guard refuses a write under scripts/",
    find: "    if hit:\n        raise PermissionError",
    replace: "    if False:\n        raise PermissionError",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-py-guard-open-always-allowed",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: the python guard judges an open by its flags: a write is refused",
    find: "if not (isinstance(args[2], int) and args[2] & WRITE):",
    replace: "if True:",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-py-guard-open-blocks-reads",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: the python guard judges an open by its flags: a read of the tracked file is allowed",
    find: "if not (isinstance(args[2], int) and args[2] & WRITE):",
    replace: "if False:",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-py-guard-rename-checks-source-only",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: the python guard judges a rename by the path it writes as well as the one it removes",
    find: "'os.rename': (0, 1)",
    replace: "'os.rename': (0,)",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-py-guard-rename-checks-dest-only",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: the python guard judges a rename by the path it removes as well as the one it writes",
    find: "'os.rename': (0, 1)",
    replace: "'os.rename': (1,)",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-py-guard-drops-remove",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: the python guard covers a remove (and a tree removal that goes through it)",
    find: "'os.remove': (0,), ",
    replace: "",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-py-guard-drops-truncate",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: the python guard covers a truncate",
    find: "'os.truncate': (0,), ",
    replace: "",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-py-guard-drops-rmtree",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: the python guard refuses a tree removal before it deletes the files inside",
    find: ", 'shutil.rmtree': (0,)}",
    replace: "}",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-py-guard-reenters-itself",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: the python guard does not judge its own log write",
    find: "    if busy:\n        return\n",
    replace: "",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-py-guard-not-installed",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: the python guard is installed",
    find: "sys.addaudithook(hook)",
    replace: "pass",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-py-red-copy-inert",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: the python second and third runs really make every copy red or silent",
    find: "if fault and '--self-test' in argv",
    replace: "if False and '--self-test' in argv",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-py-runtime-unguarded",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: a .py script is started under the python guard",
    find: "PYTHONPATH: [pyGuardDir, process.env.PYTHONPATH]",
    replace: "PYTHONPATH: [process.env.PYTHONPATH]",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-silent-copy-vacuous",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: a script that carries on with a copy whose self-test never ran fails the silent-copy clause",
    find: "refusesSilentCopy: c.status === 1 && /UNMUTATED/.test(c.out),",
    replace: "refusesSilentCopy: true,",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-silent-copy-ignores-status",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: a script that reports a silent copy and carries on fails the silent-copy clause",
    find: "refusesSilentCopy: c.status === 1 && /UNMUTATED/.test(c.out),",
    replace: "refusesSilentCopy: /UNMUTATED/.test(c.out),",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-silent-copy-ignores-message",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: a script that stops on a silent copy without the FAIL line fails the silent-copy clause",
    find: "refusesSilentCopy: c.status === 1 && /UNMUTATED/.test(c.out),",
    replace: "refusesSilentCopy: c.status === 1,",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-silent-copy-wired-to-red",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: the silent-copy clause is wired to the third run, not the second",
    find: "e.refusesSilentCopy, e.silentDetail)",
    replace: "e.refusesRedCopy, e.silentDetail)",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-silent-copy-preload-exits-1",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: the third run really makes every copy exit 0 saying nothing",
    find: "process.exit(fault === 'silent' ? 0 : 1)",
    replace: "process.exit(1)",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-py-silent-copy-exits-1",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: the python third run really makes every copy exit 0 saying nothing",
    find: "os._exit(0 if fault == 'silent' else 1)",
    replace: "os._exit(1)",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-tmpdir-not-a-symlink",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: a script is run with $TMPDIR behind a symlink",
    find: "MC_COPY_FAULT: fault, TMPDIR: link }",
    replace: "MC_COPY_FAULT: fault, TMPDIR: tmp }",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-claim-check-tmp-not-resolved",
    file: "scripts/mutate-claim-check.mjs",
    claim: "mutate-claim-check.mjs resolves its temporary directory, so it works with $TMPDIR behind a symlink",
    find: "realpathSync(mkdtempSync(join(tmpdir(), 'mutate-claim-check-')))",
    replace: "mkdtempSync(join(tmpdir(), 'mutate-claim-check-'))",
    expect: "node scripts/mutate-copy-check.mjs --only claim-check",
  },
  {
    id: "mutate-deploy-gate-tmp-not-resolved",
    file: "scripts/mutate-deploy-gate.mjs",
    claim: "mutate-deploy-gate.mjs resolves its temporary directory, so it works with $TMPDIR behind a symlink",
    find: "realpathSync(mkdtempSync(join(tmpdir(), 'mutate-deploy-gate-')))",
    replace: "mkdtempSync(join(tmpdir(), 'mutate-deploy-gate-'))",
    expect: "node scripts/mutate-copy-check.mjs --only deploy-gate",
  },
  {
    id: "mutate-odds-coverage-tmp-not-resolved",
    file: "scripts/mutate-odds-coverage.mjs",
    claim: "mutate-odds-coverage.mjs resolves its temporary directory, so it works with $TMPDIR behind a symlink",
    find: "realpathSync(mkdtempSync(join(tmpdir(), 'mutate-odds-coverage-')))",
    replace: "mkdtempSync(join(tmpdir(), 'mutate-odds-coverage-'))",
    expect: "node scripts/mutate-copy-check.mjs --only odds-coverage",
  },
  {
    id: "mutate-odds-shape-census-tmp-not-resolved",
    file: "scripts/mutate-odds-shape-census.mjs",
    claim: "mutate-odds-shape-census.mjs resolves its temporary directory, so it works with $TMPDIR behind a symlink",
    find: "realpathSync(mkdtempSync(join(tmpdir(), 'mutate-odds-shape-census-')))",
    replace: "mkdtempSync(join(tmpdir(), 'mutate-odds-shape-census-'))",
    expect: "node scripts/mutate-copy-check.mjs --only odds-shape-census",
  },
  {
    id: "mutate-run-steps-tmp-not-resolved",
    file: "scripts/mutate-run-steps.mjs",
    claim: "mutate-run-steps.mjs resolves its temporary directory, so it works with $TMPDIR behind a symlink",
    find: "realpathSync(mkdtempSync(join(tmpdir(), 'mutate-run-steps-')))",
    replace: "mkdtempSync(join(tmpdir(), 'mutate-run-steps-'))",
    expect: "node scripts/mutate-copy-check.mjs --only run-steps",
  },
  {
    id: "mutate-replay-odds-coverage-tmp-not-resolved",
    file: "scripts/mutate-replay-odds-coverage.mjs",
    claim: "mutate-replay-odds-coverage.mjs resolves its temporary directory, so it works with $TMPDIR behind a symlink",
    find: "realpathSync(mkdtempSync(join(tmpdir(), 'mutate-replay-odds-coverage-')))",
    replace: "mkdtempSync(join(tmpdir(), 'mutate-replay-odds-coverage-'))",
    expect: "node scripts/mutate-copy-check.mjs --only replay-odds-coverage",
  },
  {
    id: "mutate-claim-check-control-accepts-silence",
    file: "scripts/mutate-claim-check.mjs",
    claim: "mutate-claim-check.mjs: its positive control needs the self-test's tally, so a copy that never ran is not a pass",
    find: "  try { return TALLY.test(execFileSync(process.execPath, [at, '--self-test'], { stdio: 'pipe', encoding: 'utf8' })) }\n",
    replace: "  try { execFileSync(process.execPath, [at, '--self-test'], { stdio: 'pipe' }); return true }\n",
    expect: "node scripts/mutate-copy-check.mjs --only claim-check",
  },
  {
    id: "mutate-deploy-gate-control-accepts-silence",
    file: "scripts/mutate-deploy-gate.mjs",
    claim: "mutate-deploy-gate.mjs: its positive control needs the self-test's tally, so a copy that never ran is not a pass",
    find: "  try { return TALLY.test(execFileSync(process.execPath, [at, '--self-test'], { stdio: 'pipe', encoding: 'utf8' })) }\n",
    replace: "  try { execFileSync(process.execPath, [at, '--self-test'], { stdio: 'pipe' }); return true }\n",
    expect: "node scripts/mutate-copy-check.mjs --only deploy-gate",
  },
  {
    id: "mutate-deploy-landed-control-accepts-silence",
    file: "scripts/mutate-deploy-landed.mjs",
    claim: "mutate-deploy-landed.mjs: its positive control needs the self-test's tally, so a copy that never ran is not a pass",
    find: "  try { return TALLY.test(execFileSync(process.execPath, [at, '--self-test'], { stdio: 'pipe', encoding: 'utf8' })) }\n",
    replace: "  try { execFileSync(process.execPath, [at, '--self-test'], { stdio: 'pipe' }); return true }\n",
    expect: "node scripts/mutate-copy-check.mjs --only deploy-landed",
  },
  {
    id: "mutate-odds-coverage-control-accepts-silence",
    file: "scripts/mutate-odds-coverage.mjs",
    claim: "mutate-odds-coverage.mjs: its positive control needs the self-test's tally, so a copy that never ran is not a pass",
    find: "  try { return TALLY.test(execFileSync(process.execPath, [at, '--self-test'], { stdio: 'pipe', encoding: 'utf8' })) }\n",
    replace: "  try { execFileSync(process.execPath, [at, '--self-test'], { stdio: 'pipe' }); return true }\n",
    expect: "node scripts/mutate-copy-check.mjs --only odds-coverage",
  },
  {
    id: "mutate-odds-shape-census-control-accepts-silence",
    file: "scripts/mutate-odds-shape-census.mjs",
    claim: "mutate-odds-shape-census.mjs: its positive control needs the self-test's tally, so a copy that never ran is not a pass",
    find: "  try { return TALLY.test(execFileSync(process.execPath, [at, '--self-test'], { stdio: 'pipe', encoding: 'utf8' })) }\n",
    replace: "  try { execFileSync(process.execPath, [at, '--self-test'], { stdio: 'pipe' }); return true }\n",
    expect: "node scripts/mutate-copy-check.mjs --only odds-shape-census",
  },
  {
    id: "mutate-run-steps-control-accepts-silence",
    file: "scripts/mutate-run-steps.mjs",
    claim: "mutate-run-steps.mjs: its positive control needs the self-test's tally, so a copy that never ran is not a pass",
    find: "  try { return TALLY.test(execFileSync(process.execPath, [at, '--self-test'], { stdio: 'pipe', encoding: 'utf8' })) }\n",
    replace: "  try { execFileSync(process.execPath, [at, '--self-test'], { stdio: 'pipe' }); return true }\n",
    expect: "node scripts/mutate-copy-check.mjs --only run-steps",
  },
  {
    id: "mutate-replay-odds-coverage-control-accepts-silence",
    file: "scripts/mutate-replay-odds-coverage.mjs",
    claim: "mutate-replay-odds-coverage.mjs: its positive control needs the self-test's tally, so a copy that never ran is not a pass",
    find: "  try { return TALLY.test(execFileSync('node', [at, '--self-test'], { stdio: 'pipe', encoding: 'utf8' })) } catch { return false }\n",
    replace: "  try { execFileSync('node', [at, '--self-test'], { stdio: 'pipe' }); return true } catch { return false }\n",
    expect: "node scripts/mutate-copy-check.mjs --only replay-odds-coverage",
  },
  {
    id: "mutate-push-lands-control-accepts-silence",
    file: "scripts/mutate-push-lands.py",
    claim: "mutate-push-lands.py: its positive control needs the self-test's tally, so a copy that never ran is not a pass",
    find: "    return p.returncode == 0 and bool(TALLY.search(p.stdout))\n",
    replace: "    return p.returncode == 0\n",
    expect: "node scripts/mutate-copy-check.mjs --only push-lands",
  },
  {
    id: "mutate-copy-check-cleanup-vacuous",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: a script that leaves its temporary copy behind fails the cleanup clause",
    find: "cleansUp: a.usedTmp && [a, b, c].every(r => r.leftover.length === 0),",
    replace: "cleansUp: true,",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-cleanup-only-the-plain-run",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: a script that leaves its copy behind only when it stops on a broken one fails the cleanup clause",
    find: "cleansUp: a.usedTmp && [a, b, c].every(r => r.leftover.length === 0),",
    replace: "cleansUp: a.usedTmp && a.leftover.length === 0,",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-cleanup-ignores-use",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: a script the guard never saw write under $TMPDIR does not pass the cleanup clause by leaving it empty",
    find: "cleansUp: a.usedTmp && [a, b, c].every(r => r.leftover.length === 0),",
    replace: "cleansUp: [a, b, c].every(r => r.leftover.length === 0),",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-cleanup-clause-swapped",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: the cleanup clause is wired to its own fact",
    find: "e.cleansUp, e.cleanupDetail)",
    replace: "e.wroteElsewhere, e.cleanupDetail)",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-claim-check-copy-not-removed",
    file: "scripts/mutate-claim-check.mjs",
    claim: "mutate-claim-check.mjs removes its temporary copy when it ends",
    find: "process.on('exit', () => rmSync(TMP, { recursive: true, force: true }))\n",
    replace: "",
    expect: "node scripts/mutate-copy-check.mjs --only claim-check",
  },
  {
    id: "mutate-deploy-gate-copy-not-removed",
    file: "scripts/mutate-deploy-gate.mjs",
    claim: "mutate-deploy-gate.mjs removes its temporary copy when it ends",
    find: "process.on('exit', () => rmSync(TMP, { recursive: true, force: true }))\n",
    replace: "",
    expect: "node scripts/mutate-copy-check.mjs --only deploy-gate",
  },
  {
    id: "mutate-deploy-landed-copy-not-removed",
    file: "scripts/mutate-deploy-landed.mjs",
    claim: "mutate-deploy-landed.mjs removes its temporary copy when it ends",
    find: "process.on('exit', () => rmSync(TMP, { recursive: true, force: true }))\n",
    replace: "",
    expect: "node scripts/mutate-copy-check.mjs --only deploy-landed",
  },
  {
    id: "mutate-odds-coverage-copy-not-removed",
    file: "scripts/mutate-odds-coverage.mjs",
    claim: "mutate-odds-coverage.mjs removes its temporary copy when it ends",
    find: "process.on('exit', () => rmSync(TMP, { recursive: true, force: true }))\n",
    replace: "",
    expect: "node scripts/mutate-copy-check.mjs --only odds-coverage",
  },
  {
    id: "mutate-odds-shape-census-copy-not-removed",
    file: "scripts/mutate-odds-shape-census.mjs",
    claim: "mutate-odds-shape-census.mjs removes its temporary copy when it ends",
    find: "process.on('exit', () => rmSync(TMP, { recursive: true, force: true }))\n",
    replace: "",
    expect: "node scripts/mutate-copy-check.mjs --only odds-shape-census",
  },
  {
    id: "mutate-run-steps-copy-not-removed",
    file: "scripts/mutate-run-steps.mjs",
    claim: "mutate-run-steps.mjs removes its temporary copy when it ends",
    find: "process.on('exit', () => rmSync(TMP, { recursive: true, force: true }))\n",
    replace: "",
    expect: "node scripts/mutate-copy-check.mjs --only run-steps",
  },
  {
    id: "mutate-replay-odds-coverage-copy-not-removed",
    file: "scripts/mutate-replay-odds-coverage.mjs",
    claim: "mutate-replay-odds-coverage.mjs removes its temporary copy when it ends",
    find: "process.on('exit', () => rmSync(TMP, { recursive: true, force: true }))\n",
    replace: "",
    expect: "node scripts/mutate-copy-check.mjs --only replay-odds-coverage",
  },
  {
    id: "mutate-push-lands-copy-not-removed",
    file: "scripts/mutate-push-lands.py",
    claim: "mutate-push-lands.py removes its temporary copy when it ends",
    find: "with tempfile.TemporaryDirectory(prefix='mutate-push-lands-') as td:\n",
    replace: "if True:\n    td = tempfile.mkdtemp(prefix='mutate-push-lands-')\n",
    expect: "node scripts/mutate-copy-check.mjs --only push-lands",
  },
  {
    id: "mutate-copy-check-controlled-any-mention",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: only the exact positive-control line satisfies the print clause, not any line that mentions one",
    find: "controlled: /^positive control: the unmutated copy passes$/m.test(a.out),",
    replace: "controlled: /positive control/.test(a.out),",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-controlled-unanchored-start",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: the positive-control line must start the line, a sentence ending in it does not satisfy the print clause",
    find: "controlled: /^positive control: the unmutated copy passes$/m.test(a.out),",
    replace: "controlled: /positive control: the unmutated copy passes$/m.test(a.out),",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-controlled-unanchored-end",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: the positive-control line must end the line, a sentence that continues after it does not satisfy the print clause",
    find: "controlled: /^positive control: the unmutated copy passes$/m.test(a.out),",
    replace: "controlled: /^positive control: the unmutated copy passes/m.test(a.out),",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-completes-ignores-status",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: a script that prints N of N mutations caught and then exits non-zero does not complete",
    find: "completes: a.status === 0 && Boolean(a.tally) && a.tally[1] === a.tally[2],",
    replace: "completes: Boolean(a.tally) && a.tally[1] === a.tally[2],",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-guard-allows-the-dir-itself",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: the node guard refuses to move or remove scripts/ itself, not only a path under it",
    find: "const under = abs => abs.startsWith(tracked) || abs + path.sep === tracked",
    replace: "const under = abs => abs.startsWith(tracked)",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-guard-dir-only",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: the node guard refuses a write under scripts/, not only scripts/ itself",
    find: "const under = abs => abs.startsWith(tracked) || abs + path.sep === tracked",
    replace: "const under = abs => abs + path.sep === tracked",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-py-guard-allows-the-dir-itself",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: the python guard refuses to move or remove scripts/ itself, not only a path under it",
    find: "    return p.startswith(tracked) or p + os.sep == tracked",
    replace: "    return p.startswith(tracked)",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-py-guard-dir-only",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: the python guard refuses a write under scripts/, not only scripts/ itself",
    find: "    return p.startswith(tracked) or p + os.sep == tracked",
    replace: "    return p + os.sep == tracked",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-guard-learns-mkdir",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: the printed list of forms the node guard does not see is true: a guard that learns one fails the clause that attempts it",
    find: "'rmSync', 'truncateSync']",
    replace: "'rmSync', 'truncateSync', 'mkdirSync']",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-py-guard-learns-mkdir",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: the printed list of forms the python guard does not see is true: a guard that learns one fails the clause that attempts it",
    find: "PATHS = {'os.rename': (0, 1),",
    replace: "PATHS = {'os.mkdir': (0,), 'os.rename': (0, 1),",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-list-test-vacuous",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: the test of the unseen list can fail",
    find: "const listIsTrue = (probe, list) => list.every(([key]) => probe.out.includes(`${key}: written\\n`)) && probe.blocked.length === 0",
    replace: "const listIsTrue = (probe, list) => true",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-list-test-ignores-refusals",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: a refusal logged during an unseen attempt fails the test of the list",
    find: "written\\n`)) && probe.blocked.length === 0",
    replace: "written\\n`))",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-list-test-ignores-unattempted",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: a listed form that was never attempted fails the test of the list",
    find: "list.every(([key]) => probe.out.includes(`${key}: written\\n`))",
    replace: "list.every(([key]) => !probe.out.includes(`${key}: EACCES\\n`))",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-coverage-prints-no-list",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: the printed coverage is built from the lists the self-test proves",
    find: "const labelsOf = list => [...new Set(list.map(e => e[1]))]",
    replace: "const labelsOf = list => []",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-coverage-cpsync-undated",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: what is printed about cpSync is a dated measurement, not a standing claim",
    find: "'cpSync is in neither list: on Node v22.22.0 (measured 2026-11-05)",
    replace: "'cpSync is in neither list: on Node v22.22.0",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-inventory-skips-python",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: a python mutate script is launchable, so it is checked and not reported as one the check cannot launch",
    find: "const launchable = f => /\\.(mjs|py)$/.test(f)",
    replace: "const launchable = f => /\\.mjs$/.test(f)",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-inventory-glob-is-mjs-only",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: the inventory takes every scripts/mutate-* file, whatever its extension",
    find: ".filter(f => f.startsWith('mutate-')).sort()",
    replace: ".filter(f => f.startsWith('mutate-') && f.endsWith('.mjs')).sort()",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-inventory-checks-the-exempt",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: a script on the exemption list is not run",
    find: "checked: files.filter(f => !(f in EXEMPT) && launchable(f)),",
    replace: "checked: files.filter(f => launchable(f)),",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-inventory-no-stray",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: a mutate-* file the check cannot launch is reported",
    find: "stray: files.filter(f => !(f in EXEMPT) && !launchable(f)),",
    replace: "stray: [],",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-inventory-no-unreachable",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: a workflow run line naming a mutate script the glob does not see is reported",
    find: "unreachable: wired.filter(p => !files.includes(p.slice('scripts/'.length))),",
    replace: "unreachable: [],",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-inventory-unreachable-misreads-paths",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: a workflow run line is compared with the directory by the path under scripts/",
    find: "unreachable: wired.filter(p => !files.includes(p.slice('scripts/'.length))),",
    replace: "unreachable: wired.filter(p => !files.includes(p)),",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-inventory-no-stale-exempt",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: an exemption that names no file is reported",
    find: "staleExempt: Object.keys(EXEMPT).filter(f => !files.includes(f)),",
    replace: "staleExempt: [],",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-inventory-run-line-misses-python",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: a workflow line that runs a python mutate script is read",
    find: "(?:node|python3?)",
    replace: "(?:node)",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-inventory-clause-vacuous",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: the inventory clause can fail",
    find: "  found.stray.length === 0 && found.unreachable.length === 0 && found.staleExempt.length === 0,\n",
    replace: "  true,\n",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-inventory-clause-ignores-stray",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: a file the check cannot launch fails the inventory clause",
    find: "  found.stray.length === 0 && found.unreachable.length === 0 && found.staleExempt.length === 0,\n",
    replace: "  found.unreachable.length === 0 && found.staleExempt.length === 0,\n",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-inventory-clause-ignores-unreachable",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: a workflow run line the glob does not see fails the inventory clause",
    find: "  found.stray.length === 0 && found.unreachable.length === 0 && found.staleExempt.length === 0,\n",
    replace: "  found.stray.length === 0 && found.staleExempt.length === 0,\n",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  {
    id: "mutate-copy-check-inventory-clause-ignores-stale",
    file: "scripts/mutate-copy-check.mjs",
    claim: "mutate-copy-check: an exemption naming no file fails the inventory clause",
    find: "  found.stray.length === 0 && found.unreachable.length === 0 && found.staleExempt.length === 0,\n",
    replace: "  found.stray.length === 0 && found.unreachable.length === 0,\n",
    expect: "node scripts/mutate-copy-check.mjs --self-test",
  },
  // ── The model's forecast on an EPL card (docs/CC-CMD-2026-09-11-epl-forecaster-phase1.md) ──
  // Each entry breaks one claim of the feature and names the check that must notice. Written
  // BEFORE the checks were trusted (Rule 90): a check that has only ever passed has proven nothing.
  {
    // The decision. Let a Final card take the Scheduled path and every finished EPL card draws a forecast computed from a table that contains its own result: hindsight in a forecast's label.
    id: "forecast-card-final-draws",
    file: "src/CardForecast.fs",
    claim: "a Final card carries no forecast: the table already holds its result",
    find: "        | Final _ -> NoLine\n        | Scheduled ->\n",
    replace: "        | Final _ | Scheduled ->\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "forecast-card-in-play-draws",
    file: "src/CardForecast.fs",
    claim: "a card in play carries no forecast",
    find: "        | InProgress _ -> NoLine\n        | Final _ -> NoLine\n        | Scheduled ->\n",
    replace: "        | Final _ -> NoLine\n        | InProgress _ | Scheduled ->\n",
    expect: "node build/VerifyMain.js",
  },
  {
    // Scheduled is not enough: gameStateAt returns it for ANY row with no score, including a match that kicked off minutes ago (Man Utd v Aston Villa, measured 2026-11-08).
    id: "forecast-card-kickoff-guard-dropped",
    file: "src/CardForecast.fs",
    claim: "a Scheduled card draws a forecast only while kickoff is still ahead of now",
    find: "            | Some _ when not (notYetStartedAt now game) -> NoLine\n",
    replace: "            // (kickoff guard removed)\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "forecast-card-unknown-kickoff-is-silent",
    file: "src/CardForecast.fs",
    claim: "a Scheduled card with no kickoff time says so, by name",
    find: "            | None -> NoModelLine KickoffUnknown\n",
    replace: "            | None -> NoLine\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "forecast-card-sport-guard-dropped",
    file: "src/CardForecast.fs",
    claim: "only an EPL card is modelled",
    find: "    if game.Sport <> Sport.EPL then NoLine\n",
    replace: "    if false then NoLine\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "forecast-card-away-club-not-named",
    file: "src/CardForecast.fs",
    claim: "a refusal for a missing away club names the away club",
    find: "    | Some _, None -> NoModelLine(ClubsNotInTable [ game.Away ])\n",
    replace: "    | Some _, None -> NoModelLine(ClubsNotInTable [ game.Home ])\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "forecast-card-home-club-not-named",
    file: "src/CardForecast.fs",
    claim: "a refusal for a missing home club names the home club",
    find: "    | None, Some _ -> NoModelLine(ClubsNotInTable [ game.Home ])\n",
    replace: "    | None, Some _ -> NoModelLine(ClubsNotInTable [ game.Away ])\n",
    expect: "node build/VerifyMain.js",
  },
  {
    // Rule 60/64: the relay owns names. A client-side normaliser is the band-aid, and a case-fold is the smallest one.
    id: "forecast-card-join-ignores-case",
    file: "src/CardForecast.fs",
    claim: "a club joins to the table by exact name, never by a normaliser the client invented",
    find: "    rows |> List.tryFind (fun r -> r.Team = name)\n",
    replace: "    rows |> List.tryFind (fun r -> String.Equals(r.Team, name, StringComparison.OrdinalIgnoreCase))\n",
    expect: "node build/VerifyMain.js",
  },
  {
    // The other small normaliser: a stray space. Same ruling as the case-fold above.
    id: "forecast-card-join-trims",
    file: "src/CardForecast.fs",
    claim: "a club joins to the table by exact name: a stray space makes a different name",
    find: "    rows |> List.tryFind (fun r -> r.Team = name)\n",
    replace: "    rows |> List.tryFind (fun r -> r.Team = name.Trim())\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "forecast-card-away-deduction-unchecked",
    file: "src/CardForecast.fs",
    claim: "a points deduction on EITHER club refuses the forecast",
    find: "        match deductionsUnsettled [ home; away ] with\n",
    replace: "        match deductionsUnsettled [ home ] with\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "forecast-card-home-deduction-unchecked",
    file: "src/CardForecast.fs",
    claim: "a points deduction on the hosting club refuses the forecast",
    find: "        match deductionsUnsettled [ home; away ] with\n",
    replace: "        match deductionsUnsettled [ away ] with\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "forecast-card-away-unplayed-unchecked",
    file: "src/CardForecast.fs",
    claim: "a club that has played nothing is named, whichever side it is on",
    find: "            match [ home; away ] |> List.filter (fun r -> Option.isNone (rating r)) |> List.map (fun r -> r.Team) with\n",
    replace: "            match [ home ] |> List.filter (fun r -> Option.isNone (rating r)) |> List.map (fun r -> r.Team) with\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "forecast-card-home-unplayed-unchecked",
    file: "src/CardForecast.fs",
    claim: "a hosting club that has played nothing is named, not modelled",
    find: "            match [ home; away ] |> List.filter (fun r -> Option.isNone (rating r)) |> List.map (fun r -> r.Team) with\n",
    replace: "            match [ away ] |> List.filter (fun r -> Option.isNone (rating r)) |> List.map (fun r -> r.Team) with\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "forecast-card-home-shows-away-share",
    file: "src/CardForecast.fs",
    claim: "the home club's figure is the home club's probability",
    find: "            game.Home (pc (Market.threeWayHome m.Market))\n",
    replace: "            game.Home (pc (Market.threeWayAway m.Market))\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "forecast-card-draw-shows-home-share",
    file: "src/CardForecast.fs",
    claim: "the draw figure is the draw probability",
    find: "            (pc (Market.threeWayDraw m.Market))\n",
    replace: "            (pc (Market.threeWayHome m.Market))\n",
    expect: "node build/VerifyMain.js",
  },
  {
    // A card with no market price shows the model alone, labelled by provenance. Without the label two numbers on one card read as one claim.
    id: "forecast-card-provenance-dropped",
    file: "src/CardForecast.fs",
    claim: "a modelled line carries the tag of the model that produced it",
    find: "        sprintf \"model %s — %s %.0f%% · draw %.0f%% · %s %.0f%%\"\n            METHOD_TAG\n",
    replace: "        sprintf \"model %s — %s %.0f%% · draw %.0f%% · %s %.0f%%\"\n            \"\"\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "forecast-card-refusal-drops-provenance",
    file: "src/CardForecast.fs",
    claim: "a refusal is labelled by the model it is a refusal from",
    find: "    | NoModelLine r -> sprintf \"model %s — %s\" METHOD_TAG (reasonText r)\n",
    replace: "    | NoModelLine r -> reasonText r\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "forecast-card-refusal-unclipped",
    file: "src/CardForecast.fs",
    claim: "a decoder's failure is cut to what a card has room for",
    find: "    if why.Length <= 80 then why else why.Substring(0, 80) + \"…\"\n",
    replace: "    why\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "forecast-card-clip-boundary",
    file: "src/CardForecast.fs",
    claim: "a failure reason of exactly 80 characters is shown whole, not cut",
    find: "    if why.Length <= 80 then why else why.Substring(0, 80) + \"…\"\n",
    replace: "    if why.Length < 80 then why else why.Substring(0, 80) + \"…\"\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "forecast-card-rounds-to-tenths",
    file: "src/CardForecast.fs",
    claim: "the forecast rounds exactly as the market line does, to whole percent",
    find: "        sprintf \"model %s — %s %.0f%% · draw %.0f%% · %s %.0f%%\"\n",
    replace: "        sprintf \"model %s — %s %.1f%% · draw %.1f%% · %s %.1f%%\"\n",
    expect: "node build/VerifyMain.js",
  },
  {
    // The epa_table.json shape: every lookup missed and returned ?? 0. Here a missing gamesPlayed would read as a club that has played nothing.
    id: "forecast-standings-missing-stat-is-zero",
    file: "src/Standings.fs",
    claim: "a stat the payload did not send is an error, never a zero",
    find: "    | None -> Error(sprintf \"stat \\\"%s\\\" is missing\" name)\n",
    replace: "    | None -> Ok 0\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "forecast-standings-fraction-is-rounded",
    file: "src/Standings.fs",
    claim: "a count that is not whole is an error",
    find: "        if v = System.Math.Floor v && abs v < 1000000.0 then Ok(int v)\n",
    replace: "        if abs v < 1000000.0 then Ok(int v)\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "forecast-standings-duplicate-allowed",
    file: "src/Standings.fs",
    claim: "two rows answering to one club name make the table unusable",
    find: "        | _, names -> Decode.fail (sprintf \"more than one row answers to: %s\" (String.concat \", \" names)))\n",
    replace: "        | _, _ -> Decode.succeed rows)\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "forecast-standings-empty-allowed",
    file: "src/Standings.fs",
    claim: "a table with no entries is an error",
    find: "        | [], _ -> Decode.fail \"the table has no entries\"\n",
    replace: "        | [], _ -> Decode.succeed rows\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "forecast-standings-deductions-ignored",
    file: "src/Standings.fs",
    claim: "deductions are read from the payload, so a club carrying one is refused",
    find: "    stat \"deductions\" |> Result.map (fun deductions ->\n",
    replace: "    Ok 0 |> Result.map (fun deductions ->\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "forecast-standings-long-name-read",
    file: "src/Standings.fs",
    claim: "the club is read by ESPN's shortDisplayName, the name the archive copies",
    find: "        get.Required.At [ \"team\"; \"shortDisplayName\" ] Decode.string,\n",
    replace: "        get.Required.At [ \"team\"; \"displayName\" ] Decode.string,\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "forecast-standings-points-read-from-rank",
    file: "src/Standings.fs",
    claim: "points are read from the points stat",
    find: "    stat \"points\" |> Result.bind (fun points ->\n",
    replace: "    stat \"rank\" |> Result.bind (fun points ->\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "forecast-standings-goals-swapped",
    file: "src/Standings.fs",
    claim: "goals for and goals against are read from pointsFor and pointsAgainst, in that order",
    find: "    stat \"pointsFor\" |> Result.bind (fun goalsFor ->\n    stat \"pointsAgainst\" |> Result.bind (fun goalsAgainst ->\n",
    replace: "    stat \"pointsAgainst\" |> Result.bind (fun goalsFor ->\n    stat \"pointsFor\" |> Result.bind (fun goalsAgainst ->\n",
    expect: "node build/VerifyMain.js",
  },
  {
    // The status node once shipped without this: a game reaching Final updated its score and kept the word Scheduled. Same mechanism here, for a line.
    id: "forecast-card-no-effect",
    file: "src/Scoreboard.fs",
    claim: "the line follows the card's state and the table: an effect owns it",
    find: "    apply ()\n    Solid.createEffect apply\n    node\n",
    replace: "    apply ()\n    node\n",
    expect: "node scripts/forecast-render-check.mjs",
  },
  {
    id: "forecast-card-on-every-card",
    file: "src/Scoreboard.fs",
    claim: "only an EPL card has the forecast node, so every other card keeps its old structure",
    find: "          if game.Sport = Sport.EPL then\n              forecastNode game shownNow table\n",
    replace: "          if true then\n              forecastNode game shownNow table\n",
    expect: "node scripts/forecast-render-check.mjs",
  },
  {
    id: "forecast-card-now-is-frozen",
    file: "src/Scoreboard.fs",
    claim: "the card asks the decision at the real now",
    find: "        let line = CardForecast.lineFor System.DateTimeOffset.UtcNow game (state ()) (table ())\n",
    replace: "        let line = CardForecast.lineFor System.DateTimeOffset.MinValue game (state ()) (table ())\n",
    expect: "node scripts/forecast-render-check.mjs",
  },
  {
    id: "forecast-card-method-not-on-the-node",
    file: "src/Scoreboard.fs",
    claim: "a number on a card is read with the full statement of its model beside it",
    find: "        | CardForecast.ModelLine m -> node.setAttribute(\"data-method\", m.Method)\n",
    replace: "        | CardForecast.ModelLine m -> ignore m\n",
    expect: "node scripts/forecast-render-check.mjs",
  },
  {
    id: "forecast-card-stale-method-kept",
    file: "src/Scoreboard.fs",
    claim: "a card with no number carries no statement of a model",
    find: "        | CardForecast.NoLine -> node.removeAttribute \"data-method\"\n",
    replace: "        | CardForecast.NoLine -> ()\n",
    expect: "node scripts/forecast-render-check.mjs",
  },
  {
    id: "forecast-card-empty-node-takes-space",
    file: "index.html",
    claim: "an empty forecast node takes no space on a card with no line",
    find: "  .desk-card__forecast:empty { display: none; }\n",
    replace: "  .desk-card__forecast:empty { }\n",
    expect: "node scripts/forecast-render-check.mjs",
  },
  {
    id: "forecast-card-fetches-for-any-slate",
    file: "src/Program.fs",
    claim: "a slate with no EPL card spends no request for the table",
    find: "                if games |> List.exists (fun g -> g.Sport = Sport.EPL) then\n                    tryFetchText (standingsUrl ())\n",
    replace: "                if true then\n                    tryFetchText (standingsUrl ())\n",
    expect: "node scripts/forecast-render-check.mjs",
  },
  {
    id: "forecast-card-failure-stays-pending",
    file: "src/Program.fs",
    claim: "a failed table request is drawn on the card, not left as loading",
    find: "                        | Error why -> setTable (CardForecast.Unavailable why)\n",
    replace: "                        | Error why -> ignore why\n",
    expect: "node scripts/forecast-render-check.mjs",
  },
  {
    id: "forecast-card-unreadable-stays-pending",
    file: "src/Program.fs",
    claim: "a body that is not a standings table is drawn on the card, not left as loading",
    find: "                            | Error why -> setTable (CardForecast.Unavailable(\"unreadable — \" + why)))\n",
    replace: "                            | Error why -> ignore why)\n",
    expect: "node scripts/forecast-render-check.mjs",
  },
  {
    id: "forecast-card-pinned-page-uses-the-network",
    file: "src/Program.fs",
    claim: "a page pinned to a capture reads the committed table and reaches nothing",
    find: "    | Some _ -> \"./data/standings-eng1-2026-11-08.json\"\n",
    replace: "    | Some _ -> RELAY_STANDINGS\n",
    expect: "node scripts/forecast-render-check.mjs",
  },
  {
    // The quiet substitution: last week's standings under today's date. Only the unpinned, routed scenario can see it.
    id: "forecast-card-live-falls-back-to-the-capture",
    file: "src/Program.fs",
    claim: "a live page reads the relay and NEVER the committed table in its place",
    find: "    | None -> RELAY_STANDINGS\n",
    replace: "    | None -> \"./data/standings-eng1-2026-11-08.json\"\n",
    expect: "node scripts/forecast-render-check.mjs",
  },
  {
    id: "forecast-card-relay-route-moves",
    file: "src/Program.fs",
    claim: "the table is asked of the relay at the route the relay serves it on",
    find: "let private RELAY_STANDINGS = \"https://field-relay-nba.jeffunglesbee.workers.dev/espn-standings/soccer/eng.1/standings\"\n",
    replace: "let private RELAY_STANDINGS = \"https://field-relay-nba.jeffunglesbee.workers.dev/espn-standings/soccer/eng.1/standing\"\n",
    expect: "node scripts/forecast-render-check.mjs",
  },
  {
    // Rule A. One setInterval away from a card that refreshes its forecast, which reads in review as an improvement.
    id: "forecast-card-polls",
    file: "src/Scoreboard.fs",
    claim: "the forecast line asks to be run once: no timer on its path",
    find: "    node.setAttribute(\"data-testid\", \"forecast\")\n",
    replace: "    node.setAttribute(\"data-testid\", \"forecast\")\n    window.setInterval((fun () -> ()), 60000) |> ignore\n",
    expect: "node scripts/check-forecast-pull-only.mjs",
  },
  {
    id: "forecast-card-arms-a-second-effect",
    file: "src/Scoreboard.fs",
    claim: "the forecast line arms exactly one effect",
    find: "    Solid.createEffect apply\n",
    replace: "    Solid.createEffect apply\n    Solid.createEffect (fun () -> ())\n",
    expect: "node scripts/check-forecast-pull-only.mjs",
  },
  {
    // The first step of an edge: a price in scope of the code that draws the model.
    id: "forecast-card-reads-the-market",
    file: "src/Scoreboard.fs",
    claim: "the forecast line takes no market price",
    find: "    let node = el \"div\" \"desk-card__forecast\" \"\"\n",
    replace: "    let node = el \"div\" \"desk-card__forecast\" \"\"\n    let _market = winProbabilityText game\n",
    expect: "node scripts/check-forecast-pull-only.mjs",
  },
  {
    id: "forecast-card-names-an-edge",
    file: "src/CardForecast.fs",
    claim: "no word for a difference from the market is on a card",
    find: "    | ModelDeclined -> \"no forecast: the model declined this fixture\"\n",
    replace: "    | ModelDeclined -> \"no forecast: the model declined this fixture (no edge)\"\n",
    expect: "node scripts/check-forecast-pull-only.mjs",
  },
  {
    id: "forecast-card-takes-a-price",
    file: "src/CardForecast.fs",
    claim: "the code that decides the line mentions no market price",
    find: "let private names (xs: string list) = String.concat \", \" xs\n",
    replace: "let private names (xs: string list) = String.concat \", \" xs\nlet private priced (g: Game) = match g.OpeningOdds with | NotPresent -> false | _ -> true\n",
    expect: "node scripts/check-forecast-pull-only.mjs",
  },
  {
    // A renamed marker must be a failure and not a pass over an empty scan.
    id: "forecast-card-marker-renamed",
    file: "src/Scoreboard.fs",
    claim: "the forecast region is findable by its markers, or the guard fails",
    find: "// ── Forecast line ───────────────────────────────────────────────────────────\n",
    replace: "// ── Forecast row ────────────────────────────────────────────────────────────\n",
    expect: "node scripts/check-forecast-pull-only.mjs",
  },
  {
    id: "forecast-card-asks-twice",
    file: "src/Program.fs",
    claim: "the standings are asked for once per slate",
    find: "                    tryFetchText (standingsUrl ())\n                    |> Promise.iter (fun result ->\n",
    replace: "                    tryFetchText (standingsUrl ())\n                    |> Promise.iter (fun _ -> tryFetchText (standingsUrl ()) |> Promise.iter ignore)\n                    tryFetchText (standingsUrl ())\n                    |> Promise.iter (fun result ->\n",
    expect: "node scripts/check-forecast-pull-only.mjs",
  },
  {
    id: "forecast-pull-only-allows-timers",
    file: "scripts/check-forecast-pull-only.mjs",
    claim: "forecast-pull-only: a timer is caught even where one effect is allowed",
    find: "export const recurrencesExceptEffect = body => recurrencesIn(body).filter(n => n !== EFFECT)\n",
    replace: "export const recurrencesExceptEffect = body => []\n",
    expect: "node scripts/check-forecast-pull-only.mjs --self-test",
  },
  {
    id: "forecast-pull-only-counts-no-effects",
    file: "scripts/check-forecast-pull-only.mjs",
    claim: "forecast-pull-only: effects are counted",
    find: "export const effectsIn = body => (body.match(/\\bcreateEffect\\b/g) ?? []).length\n",
    replace: "export const effectsIn = body => 1\n",
    expect: "node scripts/check-forecast-pull-only.mjs --self-test",
  },
  {
    id: "forecast-pull-only-market-pattern-blind",
    file: "scripts/check-forecast-pull-only.mjs",
    claim: "forecast-pull-only: an odds field is a market input",
    find: "  ['an odds field or function', /\\b\\w*[Oo]dds\\w*\\b/],\n",
    replace: "  ['an odds field or function', /\\bNOT_THERE\\b/],\n",
    expect: "node scripts/check-forecast-pull-only.mjs --self-test",
  },
  {
    id: "forecast-pull-only-difference-pattern-blind",
    file: "scripts/check-forecast-pull-only.mjs",
    claim: "forecast-pull-only: the word edge is a word for a difference",
    find: "  ['edge', /\\bedge\\b/i],\n",
    replace: "  ['edge', /\\bNOT_THERE\\b/i],\n",
    expect: "node scripts/check-forecast-pull-only.mjs --self-test",
  },
  {
    id: "forecast-pull-only-counts-no-requests",
    file: "scripts/check-forecast-pull-only.mjs",
    claim: "forecast-pull-only: requests for the table are counted",
    find: "export const tableRequestsIn = body => (body.match(/\\btryFetchText\\s*\\(\\s*standingsUrl\\s*\\(\\s*\\)\\s*\\)/g) ?? []).length\n",
    replace: "export const tableRequestsIn = body => 1\n",
    expect: "node scripts/check-forecast-pull-only.mjs --self-test",
  },
  {
    id: "forecast-render-check-banned-words-blind",
    file: "scripts/forecast-render-check.mjs",
    claim: "forecast-render-check: an edge on a card is caught",
    find: "export const BANNED = ['edge', 'value', 'gap', 'vs market', 'pts']\n",
    replace: "export const BANNED = []\n",
    expect: "node scripts/forecast-render-check.mjs --self-test",
  },
  {
    id: "forecast-render-check-off-origin-blind",
    file: "scripts/forecast-render-check.mjs",
    claim: "forecast-render-check: a request to another origin is reported",
    find: "export const offOrigin = (urls, base) => urls.filter(u => !u.startsWith(base) && !u.startsWith('data:') && !u.startsWith('blob:'))\n",
    replace: "export const offOrigin = (urls, base) => []\n",
    expect: "node scripts/forecast-render-check.mjs --self-test",
  },
  {
    id: "forecast-render-check-counts-every-request",
    file: "scripts/forecast-render-check.mjs",
    claim: "forecast-render-check: only requests for the table are counted as table requests",
    find: "export const standingsRequestsIn = urls => urls.filter(u => u.includes('standings'))\n",
    replace: "export const standingsRequestsIn = urls => urls\n",
    expect: "node scripts/forecast-render-check.mjs --self-test",
  },
  // ── The model's own constants (docs/CC-CMD-2026-09-11-epl-forecaster-phase1.md; table-v2, 2026-11-09) ──
  // Each entry moves ONE number, or ONE clause, of the model the pre-registered fit declared. A constant that moves without a new METHOD_TAG is a different model
  // under the same name, which the CC-CMD's ModelRevised stamp exists to make visible; these are the checks that make it fail here first.
  {
    id: "forecast-model-draw-share-falls-with-the-gap",
    file: "src/Forecast.fs",
    claim: "the draw share is one number, the same for every fixture",
    find: "    let pDraw = DRAW_SHARE\n",
    replace: "    let pDraw = DRAW_SHARE * exp (-(abs d) / 1.10)\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "forecast-model-draw-share-moved",
    file: "src/Forecast.fs",
    claim: "the draw share is the declared 0.27",
    find: "let private DRAW_SHARE = 0.27\n",
    replace: "let private DRAW_SHARE = 0.28\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "forecast-model-home-advantage-moved",
    file: "src/Forecast.fs",
    claim: "the home edge is the declared 0.42",
    find: "let private HOME_ADVANTAGE = 0.42\n",
    replace: "let private HOME_ADVANTAGE = 0.43\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "forecast-model-scale-moved",
    file: "src/Forecast.fs",
    claim: "the logistic scale is the declared 1.14",
    find: "let private SCALE = 1.14\n",
    replace: "let private SCALE = 1.15\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "forecast-model-goal-difference-weight-moved",
    file: "src/Forecast.fs",
    claim: "a club's rating weighs goal difference per game at the declared 0.25",
    find: "              + 0.25 * (float (r.GoalsFor - r.GoalsAgainst) / n)\n",
    replace: "              + 0.26 * (float (r.GoalsFor - r.GoalsAgainst) / n)\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "forecast-model-goals-for-weight-moved",
    file: "src/Forecast.fs",
    claim: "a club's rating weighs goals for per game at the declared 0.10",
    find: "              + 0.10 * (float r.GoalsFor / n))\n",
    replace: "              + 0.11 * (float r.GoalsFor / n))\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "forecast-model-statement-drifts-from-the-constants",
    file: "src/Forecast.fs",
    claim: "the method statement is the one the pre-registered fit printed",
    find: "home +0.42, scale 1.14, draw 0.27 for every match\"\n",
    replace: "home +0.43, scale 1.14, draw 0.27 for every match\"\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "forecast-model-tag-drifts-from-the-statement",
    file: "src/Forecast.fs",
    claim: "the tag a card prints and the statement a row carries name the same model",
    find: "let METHOD_TAG = \"table-v2\"\n",
    replace: "let METHOD_TAG = \"table-v3\"\n",
    expect: "node build/VerifyMain.js",
  },
  // docs/CC-CMD-2026-11-11-soccer-live-scores.md, Task 1: the live-shape capture. Each entry breaks one thing the
  // capture's claim rests on and expects its own self-test to notice (Rule 90).
  {
    // A pre game reports score 0, an integer, with a clock string. Only the feed's state word separates it from a live game.
    id: "live-capture-state-gate-removed",
    file: "scripts/live-shape-capture.mjs",
    claim: "a game is live only when the feed's state says live, never because it has integer scores",
    find: "    if (d.state === 'live') {\n",
    replace: "    if (d.state === 'live' || d.scoresAreIntegers) {\n",
    expect: "node scripts/live-shape-capture.mjs --self-test",
  },
  {
    // The archive says 'Man Utd', the feed 'Manchester United'.
    id: "live-capture-joins-by-name",
    file: "scripts/live-shape-capture.mjs",
    claim: "a feed game joins its archive row by espn event id, never by team name",
    find: "    const row = espnId ? byEspn.get(espnId) : undefined\n",
    replace: "    const row = rows.find(r => r && r.home && g?.home?.name && String(r.home) === String(g.home.name))\n",
    expect: "node scripts/live-shape-capture.mjs --self-test",
  },
  {
    // The design rests on the archive having NO score while the feed does; a scored archive row must not count.
    id: "live-capture-archive-null-not-required",
    file: "scripts/live-shape-capture.mjs",
    claim: "a live game counts toward the proof only while its archive row has no score",
    find: "      const archiveUnscored = !!(j?.matched && j.archive.home_score === null && j.archive.away_score === null)\n",
    replace: "      const archiveUnscored = !!(j?.matched)\n",
    expect: "node scripts/live-shape-capture.mjs --self-test",
  },
  {
    id: "live-capture-proof-needs-no-full-shape-game",
    file: "scripts/live-shape-capture.mjs",
    claim: "the live shape is proved only by at least one live game that shows all of it",
    find: "export const provedOf = s => s.liveFullShape >= 1",
    replace: "export const provedOf = s => s.liveFullShape >= 0",
    expect: "node scripts/live-shape-capture.mjs --self-test",
  },
  // Review 2026-11-11 (capture lens + rules lens): the capture block that runs tonight was covered by no check, and three one-line
  // mutants of the join, the clock and the coverage line survived the first self-test. Each entry breaks one claim of the hardened capture.
  {
    id: "live-capture-proved-forced-true",
    file: "scripts/live-shape-capture.mjs",
    claim: "the record's proved flag is the join of the two premises, not a constant",
    find: "      proved: provedOf(summary),\n",
    replace: "      proved: true,\n",
    expect: "node scripts/live-shape-capture.mjs --self-test",
  },
  {
    id: "live-capture-headline-always-seen",
    file: "scripts/live-shape-capture.mjs",
    claim: "the headline says SEEN only when both premises hold",
    find: "export const headlineOf = s =>\n  provedOf(s)\n",
    replace: "export const headlineOf = s =>\n  true\n",
    expect: "node scripts/live-shape-capture.mjs --self-test",
  },
  {
    id: "live-capture-feed-premise-needs-the-archive",
    file: "scripts/live-shape-capture.mjs",
    claim: "the feed premise is seen without the archive premise",
    find: "export const feedShapeSeenOf = s => s.liveFeedShape >= 1",
    replace: "export const feedShapeSeenOf = s => s.liveFullShape >= 1",
    expect: "node scripts/live-shape-capture.mjs --self-test",
  },
  {
    id: "live-capture-name-fallback-join",
    file: "scripts/live-shape-capture.mjs",
    claim: "a game joins its archive row by espn id and by nothing else",
    find: "    const row = espnId ? byEspn.get(espnId) : undefined\n",
    replace: "    const row = (espnId ? byEspn.get(espnId) : undefined) ?? rows.find(r => r && g?.home?.name && String(r.home) === String(g.home.name))\n",
    expect: "node scripts/live-shape-capture.mjs --self-test",
  },
  {
    id: "live-capture-empty-clock-is-a-clock",
    file: "scripts/live-shape-capture.mjs",
    claim: "an empty-string clock, which the relay emits when ESPN has none, is not a clock string",
    find: "  clockIsString: typeof game?.clock === 'string' && game.clock !== '',",
    replace: "  clockIsString: typeof game?.clock === 'string',",
    expect: "node scripts/live-shape-capture.mjs --self-test",
  },
  {
    id: "live-capture-coverage-counts-full-shape",
    file: "scripts/live-shape-capture.mjs",
    claim: "the coverage line counts live games, not the games that show the full shape",
    find: "  `checked ${s.archiveMatched} of ${s.gamesInFeed} games joined to an archive row; ${s.live} live`",
    replace: "  `checked ${s.archiveMatched} of ${s.gamesInFeed} games joined to an archive row; ${s.liveFullShape} live`",
    expect: "node scripts/live-shape-capture.mjs --self-test",
  },
  {
    id: "live-capture-final-gap-counts-every-final",
    file: "scripts/live-shape-capture.mjs",
    claim: "the Full time gap counts only final games whose archive row has no score",
    find: "    if (d.state === 'final' && j?.matched && j.archive.home_score === null && j.archive.away_score === null) finalWithArchiveUnscored++\n",
    replace: "    if (d.state === 'final') finalWithArchiveUnscored++\n",
    expect: "node scripts/live-shape-capture.mjs --self-test",
  },
  {
    id: "live-capture-one-failed-fetch-discards-the-other",
    file: "scripts/live-shape-capture.mjs",
    claim: "a fetch that fails does not throw away the other fetch's result",
    find: "catch (e) { return { ok: false, res: null, error: `${e.message}` } }",
    replace: "catch (e) { throw e }",
    expect: "node scripts/live-shape-capture.mjs --self-test",
  },
  {
    id: "live-capture-error-exits-green",
    file: "scripts/live-shape-capture.mjs",
    claim: "a capture with an error exits non-zero",
    find: "  return { record, lines, exitCode: record.error ? 1 : 0 }",
    replace: "  return { record, lines, exitCode: 0 }",
    expect: "node scripts/live-shape-capture.mjs --self-test",
  },
  {
    id: "live-capture-gap-line-not-printed",
    file: "scripts/live-shape-capture.mjs",
    claim: "the Full time gap is printed where it is read",
    find: "    lines.push(record.coverage, record.gap, headlineOf(summary))",
    replace: "    lines.push(record.coverage, headlineOf(summary))",
    expect: "node scripts/live-shape-capture.mjs --self-test",
  },
  {
    id: "live-capture-workflow-git-add-strict",
    file: ".github/workflows/live-shape-capture.yml",
    claim: "the workflow's commit step reaches its own message when no capture was written",
    find: "          git add outbox/live-capture-*.json 2>/dev/null || true\n",
    replace: "          git add outbox/live-capture-*.json\n",
    expect: "node scripts/live-shape-capture.mjs --self-test",
  },
  {
    id: "live-capture-proof-split-across-games",
    file: "scripts/live-shape-capture.mjs",
    claim: "integer scores, a clock string and an unscored archive row must all be seen on the same game",
    find: "      if (d.scoresAreIntegers && d.clockIsString && archiveUnscored) liveFullShape++\n",
    replace: "      if (d.scoresAreIntegers || d.clockIsString || archiveUnscored) liveFullShape++\n",
    expect: "node scripts/live-shape-capture.mjs --self-test",
  },
  {
    id: "live-capture-file-name-drops-the-minute",
    file: "scripts/live-shape-capture.mjs",
    claim: "two captures of the same sport and day, minutes apart, write different files",
    find: "-${at.toISOString().slice(11, 16).replace(':', '')}Z.json`",
    replace: ".json`",
    expect: "node scripts/live-shape-capture.mjs --self-test",
  },
  // docs/CC-CMD-2026-11-11-soccer-live-scores.md, Task 3.
  {
    id: "stats-soccer-comeback-line-ungated",
    file: "src/Stats.fs",
    claim: "a soccer match in progress carries no comeback line (its words are runs and innings)",
    find: "    if (sportMeta sport).IsSoccer then None else liveMargin state\n",
    replace: "    liveMargin state\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "stats-comeback-gate-drops-baseball",
    file: "src/Stats.fs",
    claim: "a baseball game in progress keeps its comeback line, so the soccer gate is not 'always none'",
    find: "    if (sportMeta sport).IsSoccer then None else liveMargin state\n",
    replace: "    None\n",
    expect: "node build/VerifyMain.js",
  },
  // docs/CC-CMD-2026-11-11-soccer-live-scores.md, Task 4.
  {
    id: "status-started-row-still-reads-scheduled",
    file: "src/Scoreboard.fs",
    claim: "a Scheduled row whose start time has passed says the start time passed, not 'Scheduled <time>'",
    find: "    | Scheduled when startTimePassed -> \"Start time passed, no score served\"\n",
    replace: "",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "status-pre-kickoff-text-moves",
    file: "src/Scoreboard.fs",
    claim: "the pre-kickoff status string, which the 2026-11-21 forecast probe parses, does not change",
    find: "        | Some raw, Some parsed -> sprintf \"Scheduled %s (parsed %s)\" raw (parsed.ToString \"HH:mm\")\n",
    replace: "        | Some raw, Some parsed -> sprintf \"Scheduled at %s (parsed %s)\" raw (parsed.ToString \"HH:mm\")\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "status-passed-guard-reaches-in-progress-and-final",
    file: "src/Scoreboard.fs",
    claim: "only a Scheduled row reads the start time; In progress and Final are the same whatever it says",
    find: "    | Scheduled when startTimePassed -> \"Start time passed, no score served\"\n",
    replace: "    | _ when startTimePassed -> \"Start time passed, no score served\"\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "start-time-passed-excludes-the-instant",
    file: "src/Desk.fs",
    claim: "the start time has passed at the instant it names, not only after it",
    find: "    | Some start -> now >= start\n",
    replace: "    | Some start -> now > start\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "start-time-passed-reads-absent-as-passed",
    file: "src/Desk.fs",
    claim: "an absent start time is not evidence that the start time has passed",
    find: "    | Some start -> now >= start\n    | None -> false\n",
    replace: "    | Some start -> now >= start\n    | None -> true\n",
    expect: "node build/VerifyMain.js",
  },
  // docs/CC-CMD-2026-11-11-soccer-live-scores.md, Task 6: the pure half of the live score.
  {
    id: "live-window-excludes-the-start",
    file: "src/LiveScore.fs",
    claim: "the live window includes the start time itself",
    find: "    | Some start -> now >= start && now <= start + liveWindowAfterStart\n",
    replace: "    | Some start -> now > start && now <= start + liveWindowAfterStart\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "live-window-excludes-the-end",
    file: "src/LiveScore.fs",
    claim: "the live window includes its last instant, three hours after the start",
    find: "    | Some start -> now >= start && now <= start + liveWindowAfterStart\n",
    replace: "    | Some start -> now >= start && now < start + liveWindowAfterStart\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "live-keys-not-distinct",
    file: "src/LiveScore.fs",
    claim: "one feed key per sport, however many cards it has",
    find: "    |> List.distinct\n\n/// May the poll",
    replace: "\n/// May the poll",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "live-work-ahead-counts-non-soccer",
    file: "src/LiveScore.fs",
    claim: "a slate with no soccer card has no live work ahead",
    find: "        (liveSportKey g.Sport).IsSome\n        && (match gameStateAt now g with",
    replace: "        true\n        && (match gameStateAt now g with",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "live-reading-beats-archive-final",
    file: "src/LiveScore.fs",
    claim: "the archive's Final is never taken back by a reading",
    find: "    | Final _ -> archive\n",
    replace: "    | Final _ when false -> archive\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "live-full-time-becomes-final",
    file: "src/LiveScore.fs",
    claim: "a full-time reading keeps the card in progress, never final",
    find: "        | LiveNow(h, a, _)\n        | FullTime(h, a) -> InProgress(h, a)\n",
    replace: "        | LiveNow(h, a, _) -> InProgress(h, a)\n        | FullTime(h, a) -> Final(h, a, false)\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "live-unavailable-reads-as-in-progress",
    file: "src/LiveScore.fs",
    claim: "an unavailable reading leaves the archive's own answer",
    find: "        | NoReading\n        | LiveUnavailable _ -> archive\n",
    replace: "        | NoReading -> archive\n        | LiveUnavailable _ -> InProgress(0, 0)\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "live-key-for-epl-is-wrong",
    file: "src/LiveScore.fs",
    claim: "the EPL feed key is the relay's: epl",
    find: "    | Sport.EPL -> Some \"epl\"\n",
    replace: "    | Sport.EPL -> Some \"premier\"\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "live-full-time-note-reads-final",
    file: "src/LiveScore.fs",
    claim: "full time is worded Full time",
    find: "    | FullTime _ -> \"Full time\"\n",
    replace: "    | FullTime _ -> \"Final\"\n",
    expect: "node build/VerifyMain.js",
  },
  // docs/CC-CMD-2026-11-11-soccer-live-scores.md, Task 6: the card, through a real browser (the static server must be up).
  {
    id: "live-card-score-reads-the-archive-state",
    file: "src/Scoreboard.fs",
    claim: "the card's score shows the feed's score once a reading has folded over the state",
    find: "    let display = Solid.createMemo (fun () -> scoreText game (shownNow ()))\n",
    replace: "    let display = Solid.createMemo (fun () -> scoreText game (state ()))\n",
    expect: "node scripts/live-score-render-check.mjs",
  },
  {
    id: "live-card-status-reads-the-archive-state",
    file: "src/Scoreboard.fs",
    claim: "the card's status reads In progress once a reading has folded over the state",
    find: "    let status = Solid.createMemo (fun () -> statusText game (shownNow ()))\n",
    replace: "    let status = Solid.createMemo (fun () -> statusText game (state ()))\n",
    expect: "node scripts/live-score-render-check.mjs",
  },
  {
    id: "live-card-note-ignores-the-reading",
    file: "src/Scoreboard.fs",
    claim: "the live note shows the feed's clock, Full time or the reason",
    find: "LiveScore.liveNoteFor (state ()) (reading ())",
    replace: "LiveScore.liveNoteFor (state ()) LiveScore.NoReading",
    expect: "node scripts/live-score-render-check.mjs",
  },
  {
    id: "live-card-note-on-every-sport",
    file: "src/Scoreboard.fs",
    claim: "only a card of a sport the feed is asked about has the live node",
    find: "          if (LiveScore.liveSportKey game.Sport).IsSome then\n",
    replace: "          if true then\n",
    expect: "node scripts/live-score-render-check.mjs",
  },
  {
    id: "live-card-note-on-a-final-card",
    file: "src/Scoreboard.fs",
    claim: "a game the archive has finalised carries no live note, whatever the reading says",
    find: "LiveScore.liveNoteFor (state ()) (reading ())",
    replace: "LiveScore.liveNoteText (reading ())",
    expect: "node scripts/live-score-render-check.mjs",
  },
  {
    id: "live-card-forecast-reads-the-archive-state",
    file: "src/Scoreboard.fs",
    claim: "a card a reading puts in play loses its forecast",
    find: "              forecastNode game shownNow table\n",
    replace: "              forecastNode game state table\n",
    expect: "node scripts/live-score-render-check.mjs",
  },
  {
    id: "status-start-time-passed-is-not-read-by-the-card",
    file: "src/Scoreboard.fs",
    claim: "the card's status says the start time passed when it has",
    find: "let private statusText (g: Game) (state: GameState) = statusTextWith (startTimePassed g) g state\n",
    replace: "let private statusText (g: Game) (state: GameState) = statusTextWith false g state\n",
    expect: "node scripts/live-score-render-check.mjs",
  },
  {
    id: "live-render-check-compares-nothing",
    file: "scripts/live-score-render-check.mjs",
    claim: "the render check's comparison reports a mismatch when a card is not as wanted",
    find: "Object.keys(want).filter(k => card[k] !== want[k])",
    replace: "Object.keys(want).filter(k => String(card[k]) !== String(want[k]) && false)",
    expect: "node scripts/live-score-render-check.mjs --self-test",
  },
  // docs/CC-CMD-2026-11-11-soccer-live-scores.md, Task 6: the feed decoder and the reading for a card.
  {
    id: "feed-join-takes-the-first-game",
    file: "src/LiveFeed.fs",
    claim: "a card joins its feed game by ESPN event id, not by position",
    find: "        match feed |> List.tryFind (fun f -> f.EspnEventId = id) with\n",
    replace: "        match feed |> List.tryHead with\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "feed-pre-game-reads-its-score",
    file: "src/LiveFeed.fs",
    claim: "a game the feed says is pre is no reading, whatever score it reports",
    find: "            | \"pre\" -> NoReading\n",
    replace: "            | \"pre\" -> (match f.HomeScore, f.AwayScore with | Some h, Some a -> LiveNow(h, a, None) | _ -> NoReading)\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "feed-final-reads-as-live",
    file: "src/LiveFeed.fs",
    claim: "a final game is full time, not live",
    find: "                | Some h, Some a -> FullTime(h, a)\n",
    replace: "                | Some h, Some a -> LiveNow(h, a, None)\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "feed-unknown-state-reads-as-nothing",
    file: "src/LiveFeed.fs",
    claim: "a state word the page does not read is named, not guessed",
    find: "            | other -> LiveUnavailable(sprintf \"the feed says %s, a state this page does not read\" other)\n",
    replace: "            | _ -> NoReading\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "feed-missing-games-is-an-empty-slate",
    file: "src/LiveFeed.fs",
    claim: "a body with no games list is an error, never an empty slate",
    find: "    Decode.fromString (Decode.field \"games\" (Decode.list feedGameDecoder)) text\n",
    replace: "    Decode.fromString (Decode.oneOf [ Decode.field \"games\" (Decode.list feedGameDecoder); Decode.succeed [] ]) text\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "feed-card-without-an-id-reads-nothing",
    file: "src/LiveFeed.fs",
    claim: "a card with no ESPN event id says it cannot be joined",
    find: "    | None -> LiveUnavailable \"the card carries no ESPN event id to join the feed on\"\n",
    replace: "    | None -> NoReading\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "feed-empty-clock-is-a-clock",
    file: "src/LiveFeed.fs",
    claim: "an empty clock is no clock",
    find: "LiveNow(h, a, f.Clock |> Option.filter (fun c -> c <> \"\"))",
    replace: "LiveNow(h, a, f.Clock)",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "feed-live-without-a-score-reads-zero",
    file: "src/LiveFeed.fs",
    claim: "a live game with no score is unavailable, not 0-0",
    find: "                | _ -> LiveUnavailable \"the feed says live and carries no score\"\n",
    replace: "                | _ -> LiveNow(0, 0, None)\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "feed-path-drops-the-day",
    file: "src/LiveFeed.fs",
    claim: "the path asks for the ET day",
    find: "sprintf \"/v2/games?sport=%s&date=%s\" sportKey etDay",
    replace: "sprintf \"/v2/games?sport=%s\" sportKey",
    expect: "node build/VerifyMain.js",
  },
  // Review 2026-11-11 (decoder S6, S19): the decoder run through the page's own path, `decodeFeed` then `readingFor`.
  {
    id: "feed-decoder-swaps-home-and-away",
    file: "src/LiveFeed.fs",
    claim: "a live body reads home first and away second (an asymmetric score shows a swap)",
    find: "          HomeScore = get.Optional.At [ \"home\"; \"score\" ] wholeScore\n          AwayScore = get.Optional.At [ \"away\"; \"score\" ] wholeScore\n",
    replace: "          HomeScore = get.Optional.At [ \"away\"; \"score\" ] wholeScore\n          AwayScore = get.Optional.At [ \"home\"; \"score\" ] wholeScore\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "feed-null-home-score-decodes-as-zero",
    file: "src/LiveFeed.fs",
    claim: "a live game whose score is null on one side is unavailable, never a zero",
    find: "          HomeScore = get.Optional.At [ \"home\"; \"score\" ] wholeScore\n",
    replace: "          HomeScore = (get.Optional.At [ \"home\"; \"score\" ] wholeScore |> Option.orElse (Some 0))\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "feed-final-without-a-score-reads-full-time",
    file: "src/LiveFeed.fs",
    claim: "a final game with no score is unavailable, never a fabricated 0-0 full time",
    find: "                | _ -> LiveUnavailable \"the feed says final and carries no score\"\n",
    replace: "                | _ -> FullTime(0, 0)\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "feed-final-with-one-side-reads-full-time",
    file: "src/LiveFeed.fs",
    claim: "a final game with a score on one side only is unavailable, never half a score",
    find: "                | Some h, Some a -> FullTime(h, a)\n",
    replace: "                | Some h, a -> FullTime(h, defaultArg a 0)\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "feed-score-becomes-required",
    file: "src/LiveFeed.fs",
    claim: "a null or absent score decodes as no score, not as a failed feed",
    find: "          HomeScore = get.Optional.At [ \"home\"; \"score\" ] wholeScore\n",
    replace: "          HomeScore = (get.Required.At [ \"home\"; \"score\" ] wholeScore |> Some)\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "feed-clock-becomes-required",
    file: "src/LiveFeed.fs",
    claim: "an absent clock is no clock, not an error",
    find: "          Clock = get.Optional.Field \"clock\" Decode.string })\n",
    replace: "          Clock = (get.Required.Field \"clock\" Decode.string |> Some) })\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "feed-state-becomes-optional",
    file: "src/LiveFeed.fs",
    claim: "a game with no state is an error, never a read",
    find: "          State = get.Required.Field \"state\" Decode.string\n",
    replace: "          State = (get.Optional.Field \"state\" Decode.string |> Option.defaultValue \"pre\")\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "feed-float-score-is-truncated",
    file: "src/LiveFeed.fs",
    claim: "a score that is not a whole number is an error naming the field",
    find: "          HomeScore = get.Optional.At [ \"home\"; \"score\" ] wholeScore\n",
    replace: "          HomeScore = (get.Optional.At [ \"home\"; \"score\" ] Decode.float |> Option.map int)\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "feed-numeric-clock-is-accepted",
    file: "src/LiveFeed.fs",
    claim: "a clock that is not text is an error naming the field",
    find: "          Clock = get.Optional.Field \"clock\" Decode.string })\n",
    replace: "          Clock = get.Optional.Field \"clock\" (Decode.oneOf [ Decode.string; Decode.int |> Decode.map string ]) })\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "feed-one-bad-game-is-skipped",
    file: "src/LiveFeed.fs",
    claim: "one malformed game fails the whole feed rather than being skipped",
    find: "    Decode.fromString (Decode.field \"games\" (Decode.list feedGameDecoder)) text\n",
    replace: "    Decode.fromString (Decode.field \"games\" (Decode.list (Decode.oneOf [ feedGameDecoder |> Decode.map Some; Decode.succeed None ]) |> Decode.map (List.choose id))) text\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "feed-string-score-is-coerced",
    file: "src/LiveFeed.fs",
    claim: "a score served as a numeric string is an error naming the field, not a coerced number",
    find: "          HomeScore = get.Optional.At [ \"home\"; \"score\" ] wholeScore\n",
    replace: "          HomeScore = get.Optional.At [ \"home\"; \"score\" ] Decode.int\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "feed-score-range-is-not-checked",
    file: "src/LiveFeed.fs",
    claim: "a score outside the int32 range is an error naming the field",
    find: "        if n = System.Math.Floor n && n >= 0.0 && n <= 2147483647.0 then\n",
    replace: "        if n = System.Math.Floor n then\n",
    expect: "node build/VerifyMain.js",
  },
  // docs/CC-CMD-2026-11-11-soccer-live-scores.md, Task 6/7: the poll, and what says what its conditions are.
  {
    id: "poll-second-timer-in-the-region",
    file: "src/Program.fs",
    claim: "the poll holds exactly one timer and no other recurrence term",
    find: "        livePollTimer <- Some(window.setInterval ((fun () -> tick ()), LiveScore.LivePollMs))\n",
    replace: "        livePollTimer <- Some(window.setInterval ((fun () -> tick ()), LiveScore.LivePollMs))\n        window.setTimeout ((fun () -> tick ()), 1000) |> ignore\n",
    expect: "node scripts/check-live-score-poll.mjs",
  },
  {
    id: "poll-period-is-fifteen-seconds",
    file: "src/Program.fs",
    claim: "the poll's period is LiveScore.LivePollMs",
    find: "window.setInterval ((fun () -> tick ()), LiveScore.LivePollMs))",
    replace: "window.setInterval ((fun () -> tick ()), 15000))",
    expect: "node scripts/check-live-score-poll.mjs",
  },
  {
    id: "poll-asks-while-the-tab-is-hidden",
    file: "src/Program.fs",
    claim: "a request is made only while the tab is visible",
    find: "        elif (string document?visibilityState) = \"visible\" then\n",
    replace: "        else\n",
    expect: "node scripts/check-live-score-poll.mjs",
  },
  {
    id: "poll-has-no-in-flight-guard",
    file: "src/Program.fs",
    claim: "one request per key at a time",
    find: "                if inFlight.Add key then\n",
    replace: "                if true then\n",
    expect: "node scripts/check-live-score-poll.mjs",
  },
  {
    id: "poll-runs-on-a-pinned-page",
    file: "src/Program.fs",
    claim: "a page pinned to a capture starts no poll",
    find: "                if (queryParam \"data\").IsNone && payload.Date <> \"\" then startLivePoll cardHandles.Value payload.Date\n",
    replace: "                if payload.Date <> \"\" then startLivePoll cardHandles.Value payload.Date\n",
    expect: "node scripts/check-live-score-poll.mjs",
  },
  {
    id: "poll-survives-a-re-render",
    file: "src/Program.fs",
    claim: "re-rendering the slate stops the timer (a TEXT claim: `disposePrevious` names the stop; on a route that polls, `startLivePoll` also stops the old timer first, so the number of live timers across re-renders is observed by the render check, see the poll-timer-id-* entries)",
    find: "let private disposePrevious () =\n    stopLivePoll ()\n",
    replace: "let private disposePrevious () =\n",
    expect: "node scripts/check-live-score-poll.mjs",
  },
  {
    id: "poll-a-second-timer-outside-the-region",
    file: "src/Program.fs",
    claim: "the poll's timer is the only timer in src/*.fs",
    find: "let mutable private disposeRoot : (unit -> unit) option = None\n",
    replace: "let mutable private disposeRoot : (unit -> unit) option = None\nlet private strayTimer = window.setInterval ((fun () -> ()), 1000)\n",
    expect: "node scripts/check-live-score-poll.mjs",
  },
  {
    id: "poll-period-constant-is-fifteen-seconds",
    file: "src/LiveScore.fs",
    claim: "the poll's named period is 60000 ms",
    find: "let LivePollMs = 60000\n",
    replace: "let LivePollMs = 15000\n",
    expect: "node scripts/check-live-score-poll.mjs",
  },
  {
    id: "poll-failed-request-is-silent",
    file: "src/Program.fs",
    claim: "a feed that does not answer is said on the card in words",
    find: "                                h.SetReading(LiveScore.LiveUnavailable(sprintf \"the feed did not answer: %s\" why))\n",
    replace: "                                ignore why\n",
    expect: "node scripts/live-score-render-check.mjs",
  },
  {
    id: "poll-unreadable-body-is-silent",
    file: "src/Program.fs",
    claim: "a body that cannot be read is said on the card in words",
    find: "                                    h.SetReading(LiveScore.LiveUnavailable(\"unreadable — \" + why))\n",
    replace: "                                    ignore why\n",
    expect: "node scripts/live-score-render-check.mjs",
  },
  {
    id: "poll-waits-a-minute-before-the-first-request",
    file: "src/Program.fs",
    claim: "a page with a card in its window asks the feed at load, not a minute later",
    find: "        tick ()\n        livePollTimer <- Some(",
    replace: "        livePollTimer <- Some(",
    expect: "node scripts/live-score-render-check.mjs",
  },
  {
    id: "poll-asks-for-the-wrong-day",
    file: "src/Program.fs",
    claim: "the poll asks for the viewed ET day",
    find: "startLivePoll cardHandles.Value payload.Date",
    replace: "startLivePoll cardHandles.Value \"2026-01-01\"",
    expect: "node scripts/live-score-render-check.mjs",
  },
  // Review 2026-11-11, semantics F1 (confirmed against the compiled card): a card drawn before kickoff kept `Scheduled <iso>` and its
  // forecast after kickoff when the feed's answer left the archive's state as it was, because the memo above the text returned the same
  // object. Each entry breaks one link of the fix.
  {
    id: "live-card-text-ignores-the-feed-answer",
    file: "src/Scoreboard.fs",
    claim: "a card re-reads the clock whenever the page is told anything about its game",
    find: "        heard () |> ignore\n        shown ()\n",
    replace: "        shown ()\n",
    expect: "node scripts/live-score-render-check.mjs",
  },
  {
    id: "live-reading-is-not-counted-as-heard",
    file: "src/Scoreboard.fs",
    claim: "every SetReading tells the card something was heard, even a reading that leaves its state as it was",
    find: "            setHeard (heard () + 1) }\n",
    replace: "            () }\n",
    expect: "node scripts/live-score-render-check.mjs",
  },
  {
    id: "live-status-reads-the-memo-not-the-clock",
    file: "src/Scoreboard.fs",
    claim: "the status text is recomputed when the feed answers",
    find: "    let status = Solid.createMemo (fun () -> statusText game (shownNow ()))\n",
    replace: "    let status = Solid.createMemo (fun () -> statusText game (shown ()))\n",
    expect: "node scripts/live-score-render-check.mjs",
  },
  {
    id: "live-forecast-reads-the-memo-not-the-clock",
    file: "src/Scoreboard.fs",
    claim: "the forecast line is withdrawn at kickoff even when the feed has nothing for the game",
    find: "              forecastNode game shownNow table\n",
    replace: "              forecastNode game shown table\n",
    expect: "node scripts/live-score-render-check.mjs",
  },
  // Review 2026-11-11, semantics F8: the live node had a class and no CSS rule, so it read larger and brighter than the status line above it,
  // and a check that reads textContent could not see that. The render check now reads computed style.
  {
    id: "live-note-has-no-style",
    file: "index.html",
    claim: "the live note is set like the status line it sits under, not at the page's 15px and full opacity",
    find: "  .desk-card__live { font-size: .8rem; opacity: .75; font-variant-numeric: tabular-nums; }\n",
    replace: "  .desk-card__live { }\n",
    expect: "node scripts/live-score-render-check.mjs",
  },
  {
    id: "live-note-empty-takes-a-line",
    file: "index.html",
    claim: "an empty live note takes no line on a card with nothing to say",
    find: "  .desk-card__live:empty { display: none; }\n",
    replace: "  .desk-card__live:empty { }\n",
    expect: "node scripts/live-score-render-check.mjs",
  },
  // Review 2026-11-11, semantics F3 / rules F3 / rules F12: the check named 'before it, during it, and not after it' never asked about during, and
  // fourteen of the sixteen feed keys were pinned by nothing. Each entry breaks one claim the new Suite cases make.
  {
    id: "live-work-ahead-stops-at-kickoff",
    file: "src/LiveScore.fs",
    claim: "the poll's timer keeps running while a match is in play",
    find: "            | Some start -> now <= start + liveWindowAfterStart\n",
    replace: "            | Some start -> now <= start\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "live-work-ahead-ends-before-the-last-instant",
    file: "src/LiveScore.fs",
    claim: "work is ahead at the last instant of the window, as the window itself includes it",
    find: "            | Some start -> now <= start + liveWindowAfterStart\n",
    replace: "            | Some start -> now < start + liveWindowAfterStart\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "live-key-facup-mistyped",
    file: "src/LiveScore.fs",
    claim: "the FA Cup asks the relay for facup",
    find: "    | Sport.FACup -> Some \"facup\"\n",
    replace: "    | Sport.FACup -> Some \"fa\"\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "live-key-uefa-qualifying-mistyped",
    file: "src/LiveScore.fs",
    claim: "the UEFA Champions League qualifying rounds ask for uclqual",
    find: "    | Sport.UEFAChampionsLeagueQualifying -> Some \"uclqual\"\n",
    replace: "    | Sport.UEFAChampionsLeagueQualifying -> Some \"uclq\"\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "live-key-world-cup-mistyped",
    file: "src/LiveScore.fs",
    claim: "the World Cup asks for wc26",
    find: "    | Sport.FIFAWorldCup -> Some \"wc26\"\n",
    replace: "    | Sport.FIFAWorldCup -> Some \"wc2026\"\n",
    expect: "node build/VerifyMain.js",
  },
  // Review 2026-11-11, semantics F5 / F7: the render check's 'a pinned page makes no request to the live feed' had never failed (there was no poll
  // to make one), and the forecast probe's wording for a card past kickoff named a state the page no longer produces.
  {
    id: "poll-runs-on-a-pinned-page-seen-by-the-render-check",
    file: "src/Program.fs",
    claim: "a pinned page makes no request to the live feed, as the render check observes it",
    find: "                if (queryParam \"data\").IsNone && payload.Date <> \"\" then startLivePoll cardHandles.Value payload.Date\n",
    replace: "                if payload.Date <> \"\" then startLivePoll cardHandles.Value payload.Date\n",
    expect: "node scripts/live-score-render-check.mjs",
  },
  {
    id: "forecast-live-start-passed-is-another-state",
    file: "scripts/forecast-live-probe.mjs",
    claim: "a card that says its start time passed, with a forecast, fails and says why",
    find: "  if (s.startsWith('Start time passed')) return 'startpassed'\n",
    replace: "",
    expect: "node scripts/forecast-live-probe.mjs --self-test",
  },
  // 2026-11-11: drift-sentinel read a landed ask as REGRESSED because the predicate counted every soccer sport and the archive's only soccer rows on
  // 2026-11-10 were 17 EFL Trophy games the relay has never priced. Each entry breaks one claim of the corrected predicate.
  {
    id: "drift-closing-odds-counts-every-soccer-sport",
    file: "scripts/cc-cmd-followup.mjs",
    claim: "the closing-odds sentinel asks about the competitions the ask names, not every soccer sport",
    find: "  const soccer = games.filter(g => isOpeningAskSport(g?.sport))\n",
    replace: "  const soccer = games.filter(g => SOCCER_SPORTS.has(g?.sport))\n",
    expect: "node scripts/cc-cmd-followup.mjs --self-test",
  },
  {
    id: "drift-closing-odds-drops-la-liga",
    file: "scripts/cc-cmd-followup.mjs",
    claim: "La Liga is one of the two competitions the closing-odds ask names",
    find: "const OPENING_ASK_LABELS = new Set(['EPL', 'La Liga'])\n",
    replace: "const OPENING_ASK_LABELS = new Set(['EPL'])\n",
    expect: "node scripts/cc-cmd-followup.mjs --self-test",
  },
  // docs/CC-CMD-2026-11-11-soccer-live-scores.md, Task 8: the live-score probe, reworked 2026-11-11 after its adversarial review (20 findings held). Each entry
  // breaks one thing its verdict or its glue rests on; the pure ones are caught by its self-test, the glue by --e2e against the local page.
  {
    id: "live-probe-pre-reads-in-progress",
    file: "scripts/live-score-probe.mjs",
    claim: "a game the page was told is not yet live must not read In progress",
    find: "    if (inProgress) return bad('the feed says pre and the card says In progress')\n",
    replace: "\n",
    expect: "node scripts/live-score-probe.mjs --self-test",
  },
  {
    id: "live-probe-score-not-compared",
    file: "scripts/live-score-probe.mjs",
    claim: "a card in play shows the score the page was told",
    find: "    if (!scoreMatches(card, last)) return bad(",
    replace: "    if (false) return bad(",
    expect: "node scripts/live-score-probe.mjs --self-test",
  },
  {
    id: "live-probe-clock-slack",
    file: "scripts/live-score-probe.mjs",
    claim: "the clock note is the page's own last answer, with no slack",
    find: "    if (card.live !== last.clock) return bad(",
    replace: "    if (false) return bad(",
    expect: "node scripts/live-score-probe.mjs --self-test",
  },
  {
    id: "live-probe-forecast-on-live-card",
    file: "scripts/live-score-probe.mjs",
    claim: "a card in play carries no forecast",
    find: "    if (!forecastFree(card)) return bad(",
    replace: "    if (false) return bad(",
    expect: "node scripts/live-score-probe.mjs --self-test",
  },
  {
    id: "live-probe-none-counts-as-a-forecast",
    file: "scripts/live-score-probe.mjs",
    claim: "the page's own word `none` for an EPL card with no line is not a forecast",
    find: "export const forecastFree = card => card.forecast === null || card.forecast === 'none'",
    replace: "export const forecastFree = card => card.forecast === null",
    expect: "node scripts/live-score-probe.mjs --self-test",
  },
  {
    id: "live-probe-final-needs-no-full-time-note",
    file: "scripts/live-score-probe.mjs",
    claim: "between the feed's final and the archive's, the card says Full time (the owner's second ruling)",
    find: "    if (inProgress && card.live === WORDS.fullTime && scoreMatches(card, last)) return",
    replace: "    if (inProgress && scoreMatches(card, last)) return",
    expect: "node scripts/live-score-probe.mjs --self-test",
  },
  {
    id: "live-probe-final-score-unchecked",
    file: "scripts/live-score-probe.mjs",
    claim: "Full time shows the final score the page was told",
    find: "    if (inProgress && card.live === WORDS.fullTime && scoreMatches(card, last)) return",
    replace: "    if (inProgress && card.live === WORDS.fullTime) return",
    expect: "node scripts/live-score-probe.mjs --self-test",
  },
  {
    id: "live-probe-unread-live-hides",
    file: "scripts/live-score-probe.mjs",
    claim: "a game the runner sees live that the page never read is a failure, in or out of its window",
    find: "    if (runner.live.has(id) && !outs.some(read)) {",
    replace: "    if (false) {",
    expect: "node scripts/live-score-probe.mjs --self-test",
  },
  {
    id: "live-probe-nothing-to-judge-passes",
    file: "scripts/live-score-probe.mjs",
    claim: "no live game is NOTHING-TO-JUDGE, never PASS",
    find: "verdict = 'NOTHING-TO-JUDGE'",
    replace: "verdict = 'PASS'",
    expect: "node scripts/live-score-probe.mjs --self-test",
  },
  {
    id: "live-probe-unverified-runner-passes",
    file: "scripts/live-score-probe.mjs",
    claim: "a runner that could not read its own view cannot say there is nothing to judge or PASS",
    find: "  else if (!runner.ok) { verdict = 'UNVERIFIED'",
    replace: "  else if (false) { verdict = 'UNVERIFIED'",
    expect: "node scripts/live-score-probe.mjs --self-test",
  },
  {
    id: "live-probe-capture-page-judged-as-live",
    file: "scripts/live-score-probe.mjs",
    claim: "a page showing the committed capture is a failure, not a slate to judge",
    find: "  if (decodeStatus?.state !== 'ok') reasons.push(",
    replace: "  if (false) reasons.push(",
    expect: "node scripts/live-score-probe.mjs --self-test",
  },
  {
    id: "live-probe-scheduled-after-kickoff-ignored",
    file: "scripts/live-score-probe.mjs",
    claim: "the manifest's scheduledAfterKickoff is true when a card reads Scheduled while its game is live or over",
    find: "  const scheduledAfterKickoff = rowsOut.some(",
    replace: "  const scheduledAfterKickoff = false && rowsOut.some(",
    expect: "node scripts/live-score-probe.mjs --self-test",
  },
  {
    id: "live-probe-start-passed-is-not-scheduled-after-kickoff",
    file: "scripts/live-score-probe.mjs",
    claim: "the page's Start time passed word, which is what a card past kickoff reads, counts as the bug scheduledAfterKickoff names",
    find: "/^(Scheduled |Start time passed)/.test(r.status)",
    replace: "/^Scheduled /.test(r.status)",
    expect: "node scripts/live-score-probe.mjs --self-test",
  },
  {
    id: "live-probe-judges-first-answer",
    file: "scripts/live-score-probe.mjs",
    claim: "the page's LAST answer is the one judged",
    find: "    const last = outs.at(-1)\n",
    replace: "    const last = outs[0]\n",
    expect: "node scripts/live-score-probe.mjs --self-test",
  },
  {
    id: "live-probe-unjoined-counted-as-judged",
    file: "scripts/live-score-probe.mjs",
    claim: "a card with no ESPN id, outside its window or with no reading is counted, never judged",
    find: "  const judged = rowsOut.filter(r => !NOT_JUDGED.has(r.kind)).length",
    replace: "  const judged = rowsOut.length",
    expect: "node scripts/live-score-probe.mjs --self-test",
  },
  {
    id: "live-probe-drops-postseason",
    file: "scripts/live-score-probe.mjs",
    claim: "an archive row in games.postseason joins like one in games.regular",
    find: "[...(ctx?.games?.regular ?? []), ...(ctx?.games?.postseason ?? [])]",
    replace: "[...(ctx?.games?.regular ?? [])]",
    expect: "node scripts/live-score-probe.mjs --self-test",
  },
  {
    id: "live-probe-stale-score-after-a-failed-poll-passes",
    file: "scripts/live-score-probe.mjs",
    claim: "after a failed poll the card must say the score is unavailable, not keep the last score",
    find: "      return c.live === WORDS.unavailable\n        ? {",
    replace: "      return true\n        ? {",
    expect: "node scripts/live-score-probe.mjs --self-test",
  },
  {
    id: "live-probe-never-asked-passes",
    file: "scripts/live-score-probe.mjs",
    claim: "a card in its live window that the page never asked the feed about is a failure",
    find: "kind: 'never-asked', ok: false,",
    replace: "kind: 'never-asked', ok: true,",
    expect: "node scripts/live-score-probe.mjs --self-test",
  },
  {
    id: "live-probe-window-ignored",
    file: "scripts/live-score-probe.mjs",
    claim: "the poll's window is the archive start time to three hours after, and a card outside it is not judged",
    find: "    const inWindow = Number.isFinite(row.startMs) && nowMs >= row.startMs && nowMs <= row.startMs + WINDOW_MS\n",
    replace: "    const inWindow = true\n",
    expect: "node scripts/live-score-probe.mjs --self-test",
  },
  {
    id: "live-probe-decode-accepts-a-game-with-no-state",
    file: "scripts/live-score-probe.mjs",
    claim: "one bad game fails the whole feed, as it does on the page",
    find: "    if (typeof g.state !== 'string') return { ok: false, why: 'a game has no string state' }\n",
    replace: "\n",
    expect: "node scripts/live-score-probe.mjs --self-test",
  },
  {
    id: "live-probe-decode-accepts-a-string-score",
    file: "scripts/live-score-probe.mjs",
    claim: "a score that is not an integer fails the feed, as it does on the page",
    find: "typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 2147483647 ? { ok: true, v } : { ok: false }",
    replace: "{ ok: true, v }",
    expect: "node scripts/live-score-probe.mjs --self-test",
  },
  {
    id: "live-probe-decode-skips-the-int32-range",
    file: "scripts/live-score-probe.mjs",
    claim: "a score over the int32 range fails the feed, as it does on the page",
    find: " && v >= 0 && v <= 2147483647 ? { ok: true, v }",
    replace: " ? { ok: true, v }",
    expect: "node scripts/live-score-probe.mjs --self-test",
  },
  {
    id: "live-probe-decode-accepts-a-numeric-string-score",
    file: "scripts/live-score-probe.mjs",
    claim: "a score served as a numeric string fails the feed, as it does on the page (the page's wholeScore reads numbers only)",
    find: "typeof v === 'number' && Number.isInteger(v) &&",
    replace: "Number.isInteger(Number(v)) &&",
    expect: "node scripts/live-score-probe.mjs --self-test",
  },
  {
    id: "live-probe-decode-accepts-any-team",
    file: "scripts/live-score-probe.mjs",
    claim: "a team that is a string, a number or a list fails the feed, a null or absent one does not",
    find: "t === undefined || t === null || (typeof t === 'object' && !Array.isArray(t))",
    replace: "true",
    expect: "node scripts/live-score-probe.mjs --self-test",
  },
  {
    id: "live-probe-parity-page-rejects-a-zero-score",
    file: "src/LiveFeed.fs",
    claim: "the probe's feed decoder and the page's agree on every body of the battery (here the page narrows the score range and the probe does not)",
    find: "n >= 0.0 &&",
    replace: "n >= 1.0 &&",
    expect: "node scripts/check-live-probe-keys.mjs",
  },
  {
    id: "live-probe-parity-probe-rejects-a-zero-score",
    file: "scripts/live-score-probe.mjs",
    claim: "the probe's feed decoder and the page's agree on every body of the battery (here the probe narrows the score range and the page does not)",
    find: "v >= 0 &&",
    replace: "v >= 1 &&",
    expect: "node scripts/check-live-probe-keys.mjs",
  },
  {
    id: "live-probe-done-ignores-the-verdict",
    file: "scripts/live-score-probe.mjs",
    claim: "a FAIL cannot satisfy the Done condition whatever its booleans say",
    find: "  m.verdict === 'PASS' && m.cardState === WORDS.inProgress",
    replace: "  m.cardState === WORDS.inProgress",
    expect: "node scripts/live-score-probe.mjs --self-test",
  },
  {
    id: "live-probe-forecast-absent-when-unchecked",
    file: "scripts/live-score-probe.mjs",
    claim: "forecastAbsent over live cards with no forecast node is null, not true",
    find: "forecastAbsent: withNode.length === 0 ? null : withNode.every(",
    replace: "forecastAbsent: withNode.every(",
    expect: "node scripts/live-score-probe.mjs --self-test",
  },
  {
    id: "live-probe-score-matches-is-constant",
    file: "scripts/live-score-probe.mjs",
    claim: "scoreMatchesFeed is false when a live card shows another score",
    find: "scoreMatchesFeed: live.length > 0 && live.every(",
    replace: "scoreMatchesFeed: live.length > 0 || live.every(",
    expect: "node scripts/live-score-probe.mjs --self-test",
  },
  {
    id: "live-probe-no-game-exits-green",
    file: "scripts/live-score-probe.mjs",
    claim: "a run that saw no game in play exits non-zero, so the job is red",
    find: "export const exitCodeOf = verdict => (verdict === 'PASS' ? 0 : 1)",
    replace: "export const exitCodeOf = verdict => (verdict === 'FAIL' ? 1 : 0)",
    expect: "node scripts/live-score-probe.mjs --self-test",
  },
  {
    id: "live-probe-main-exits-zero",
    file: "scripts/live-score-probe.mjs",
    claim: "main exits through exitCodeOf",
    find: "  process.exit(exitCodeOf(manifest.verdict))",
    replace: "  process.exit(0)",
    expect: "node scripts/live-score-probe.mjs --self-test",
  },
  {
    id: "live-probe-date-unvalidated",
    file: "scripts/live-score-probe.mjs",
    claim: "--date is a day, as forecast-live-probe validates its date",
    find: "  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(d)) return",
    replace: "  if (false) return",
    expect: "node scripts/live-score-probe.mjs --self-test",
  },
  {
    id: "live-probe-runner-keys-from-the-pages-requests",
    file: "scripts/live-score-probe.mjs",
    claim: "the runner's view is keyed from the cards, so a page that never polls cannot hide its live game",
    find: "    const keys = [...new Set(cards.map(c => LABEL_TO_KEY[c.sport]).filter(Boolean))]\n",
    replace: "    const keys = [...new Set(outcomes.filter(Boolean).map(o => o.key))]\n",
    expect: "node scripts/live-score-probe.mjs --e2e",
  },
  {
    id: "live-probe-reads-cards-with-polls-in-flight",
    file: "scripts/live-score-probe.mjs",
    claim: "a poll still in flight when the watch ends is waited for before the cards are read",
    find: "    for (const deadline = Date.now() + 10_000; open > 0 && Date.now() < deadline;) await page.waitForTimeout(100)\n",
    replace: "\n",
    expect: "node scripts/live-score-probe.mjs --e2e",
  },
  {
    id: "live-probe-decode-status-not-read",
    file: "scripts/live-score-probe.mjs",
    claim: "the page must be on the live slate, not the committed capture",
    find: "      return el ? { state: el.getAttribute('data-state'), text: el.textContent ?? '' } : null\n",
    replace: "      return { state: 'ok', text: '' }\n",
    expect: "node scripts/live-score-probe.mjs --e2e",
  },
  {
    id: "live-probe-runner-context-unchecked",
    file: "scripts/live-score-probe.mjs",
    claim: "a runner that cannot read /context/date cannot join the cards, so it cannot say nothing is live",
    find: "    if (ctx.error || ctx.status !== 200) runnerWhy.push(",
    replace: "    if (false) runnerWhy.push(",
    expect: "node scripts/live-score-probe.mjs --e2e",
  },
  {
    id: "live-probe-error-leaves-no-manifest",
    file: "scripts/live-score-probe.mjs",
    claim: "a probe that dies still returns a manifest saying why",
    find: "    manifest.verdict = 'ERROR'\n",
    replace: "    manifest.verdict = undefined\n",
    expect: "node scripts/live-score-probe.mjs --e2e",
  },
  {
    id: "live-probe-key-table-drifts",
    file: "scripts/live-score-probe.mjs",
    claim: "the probe's key table equals the registry's: the FA Cup asks the relay for facup",
    find: "'EFL Trophy': 'efltrophy', 'FA Cup': 'facup',",
    replace: "'EFL Trophy': 'efltrophy', 'FA Cup': 'fa',",
    expect: "node scripts/check-live-probe-keys.mjs",
  },
  {
    id: "live-probe-key-table-misses-a-sport",
    file: "scripts/live-score-probe.mjs",
    claim: "the probe's key table has every soccer sport the registry has",
    find: "  'EFL Trophy': 'efltrophy', 'FA Cup': 'facup',\n",
    replace: "  'EFL Trophy': 'efltrophy',\n",
    expect: "node scripts/check-live-probe-keys.mjs",
  },
  // Review 2026-11-11 of the poll, the decoder and the card wiring (wf_584a08a5-824, 25 findings held of 29): the card selection, the timer, the in-flight guard
  // and the period were each defended by a text scan only, and a one-line break of each survived. These are caught by observing the page or by the Suite.
  {
    id: "poll-answer-told-every-league-seen-by-the-render-check",
    file: "src/LiveScore.fs",
    claim: "an answer for a key is told the cards of that key's sport and no other league's",
    find: "    liveSportKey g.Sport = Some key && inLiveWindowAt now g\n",
    replace: "    inLiveWindowAt now g\n",
    expect: "node scripts/live-score-render-check.mjs",
  },
  {
    id: "poll-answer-told-every-league-seen-by-the-suite",
    file: "src/LiveScore.fs",
    claim: "an answer for a key is told the cards of that key's sport and no other league's",
    find: "    liveSportKey g.Sport = Some key && inLiveWindowAt now g\n",
    replace: "    inLiveWindowAt now g\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "poll-timer-id-not-stored",
    file: "src/Program.fs",
    claim: "the poll's timer id is kept, so the next render can clear it",
    find: "        livePollTimer <- Some(window.setInterval ((fun () -> tick ()), LiveScore.LivePollMs))\n",
    replace: "        window.setInterval ((fun () -> tick ()), LiveScore.LivePollMs) |> ignore\n",
    expect: "node scripts/live-score-render-check.mjs",
  },
  {
    id: "poll-clears-the-wrong-timer",
    file: "src/Program.fs",
    claim: "re-rendering clears the poll's own timer",
    find: "        window.clearInterval id\n",
    replace: "        window.clearInterval 0.0\n",
    expect: "node scripts/live-score-render-check.mjs",
  },
  {
    id: "poll-period-seen-by-the-render-check",
    file: "src/LiveScore.fs",
    claim: "the delay the page gives its one timer is the named period",
    find: "let LivePollMs = 60000\n",
    replace: "let LivePollMs = 15000\n",
    expect: "node scripts/live-score-render-check.mjs",
  },
  {
    id: "poll-in-flight-guard-always-open",
    file: "src/Program.fs",
    claim: "one request per key at a time: a key whose request is unanswered is not asked again",
    find: "                if inFlight.Add key then\n",
    replace: "                if inFlight.Add key || true then\n",
    expect: "node scripts/live-score-render-check.mjs",
  },
  {
    id: "poll-in-flight-released-before-the-answer",
    file: "src/Program.fs",
    claim: "a key is released when its answer arrives, not before",
    find: "                    tryFetchTextWithin LiveScore.LivePollTimeoutMs (RELAY_BASE + LiveFeed.feedPath key etDay)\n",
    replace: "                    inFlight.Remove key |> ignore\n                    tryFetchTextWithin LiveScore.LivePollTimeoutMs (RELAY_BASE + LiveFeed.feedPath key etDay)\n",
    expect: "node scripts/live-score-render-check.mjs",
  },
  {
    id: "poll-request-without-a-deadline",
    file: "src/Program.fs",
    claim: "the poll's request has a deadline, so one that never answers frees its key",
    find: "                    tryFetchTextWithin LiveScore.LivePollTimeoutMs (RELAY_BASE + LiveFeed.feedPath key etDay)\n",
    replace: "                    tryFetchText (RELAY_BASE + LiveFeed.feedPath key etDay)\n",
    expect: "node scripts/check-live-score-poll.mjs",
  },
  {
    id: "poll-deadline-signal-dropped",
    file: "src/Program.fs",
    claim: "a request that never answers is cut at the deadline and its key is asked again (the signal is really passed to fetch; observed by the render check, which a text scan cannot be)",
    find: "            let! res = fetch url [ Signal(timeoutSignal ms) ]\n",
    replace: "            let! res = fetch url []\n",
    expect: "node scripts/live-score-render-check.mjs",
  },
  {
    id: "poll-deadline-shorter-than-the-period",
    file: "src/LiveScore.fs",
    claim: "a poll request's deadline is longer than the period and at most three periods",
    find: "let LivePollTimeoutMs = 90000\n",
    replace: "let LivePollTimeoutMs = 15000\n",
    expect: "node build/VerifyMain.js",
  },
  // Review 2026-11-11 (decoder S8, S10, S24): the reason behind `live score unavailable` rides on the card as data-why.
  {
    id: "live-why-for-a-finalised-card",
    file: "src/LiveScore.fs",
    claim: "a game the archive has finalised carries no reason, as it carries no live note",
    find: "    | Final _, _ -> \"\"\n    | _, LiveUnavailable why -> why\n",
    replace: "    | _, LiveUnavailable why -> why\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "live-why-attribute-not-set",
    file: "src/Scoreboard.fs",
    claim: "the reason behind live score unavailable rides on the card as data-why",
    find: "                  | why -> liveNode.setAttribute(\"data-why\", why))\n",
    replace: "                  | why -> ())\n",
    expect: "node scripts/live-score-render-check.mjs",
  },
  {
    id: "live-why-attribute-never-removed",
    file: "src/Scoreboard.fs",
    claim: "a card that reads a clock again carries no data-why",
    find: "                  | \"\" -> liveNode.removeAttribute \"data-why\"\n",
    replace: "                  | \"\" -> ()\n",
    expect: "node scripts/live-score-render-check.mjs",
  },
  {
    id: "live-keys-ask-for-a-finalised-card",
    file: "src/LiveScore.fs",
    claim: "a card the archive has finalised is not asked about",
    find: "    inLiveWindowAt now g\n    && (match gameStateAt now g with\n        | Final _ -> false\n",
    replace: "    inLiveWindowAt now g\n    && (match gameStateAt now g with\n        | Final _ -> true\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "live-work-ahead-for-a-finalised-card",
    file: "src/LiveScore.fs",
    claim: "no live work is ahead when the only soccer card is finalised",
    find: "        && (match gameStateAt now g with\n            | Final _ -> false\n",
    replace: "        && (match gameStateAt now g with\n            | Final _ -> true\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "live-work-ahead-for-a-start-less-row",
    file: "src/LiveScore.fs",
    claim: "a soccer row with no start time has no live work ahead",
    find: "            | None -> false))",
    replace: "            | None -> true))",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "poll-timer-id-not-stored-seen-by-the-text-scan",
    file: "src/Program.fs",
    claim: "the poll's timer id is kept (the text scan's own claim)",
    find: "        livePollTimer <- Some(window.setInterval ((fun () -> tick ()), LiveScore.LivePollMs))\n",
    replace: "        window.setInterval ((fun () -> tick ()), LiveScore.LivePollMs) |> ignore\n",
    expect: "node scripts/check-live-score-poll.mjs",
  },
  {
    id: "poll-answer-told-every-league-seen-by-the-text-scan",
    file: "src/Program.fs",
    claim: "an answer is told the cards answersTo selects (the text scan's own claim)",
    find: "                            |> Seq.filter (fun h -> LiveScore.answersTo key now h.Game)\n",
    replace: "                            |> Seq.filter (fun h -> LiveScore.inLiveWindowAt now h.Game)\n",
    expect: "node scripts/check-live-score-poll.mjs",
  },
  {
    id: "poll-in-flight-guard-always-open-seen-by-the-text-scan",
    file: "src/Program.fs",
    claim: "an in-flight guard is a real guard (the text scan's own claim)",
    find: "                if inFlight.Add key then\n",
    replace: "                if inFlight.Add key || true then\n",
    expect: "node scripts/check-live-score-poll.mjs",
  },
  {
    id: "poll-period-expression-seen-by-the-text-scan",
    file: "src/LiveScore.fs",
    claim: "the period constant is a number, not an expression read as its first digits",
    find: "let LivePollMs = 60000\n",
    replace: "let LivePollMs = 60000 / 4\n",
    expect: "node scripts/check-live-score-poll.mjs",
  },
  // Fix-review 2026-11-11 (defence F18, F19): the lower bound of the window, for the request selection and for the answer's selection, each seen by the Suite and by the browser.
  {
    id: "live-keys-ask-before-the-kickoff",
    file: "src/LiveScore.fs",
    claim: "a card is asked about from its kickoff and not before it (the Suite)",
    find: "    inLiveWindowAt now g\n    && (match gameStateAt now g with\n        | Final _ -> false\n",
    replace: "    (match g.StartTime with Some s -> now <= s + liveWindowAfterStart | None -> false)\n    && (match gameStateAt now g with\n        | Final _ -> false\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "live-keys-ask-before-the-kickoff-in-the-browser",
    file: "src/LiveScore.fs",
    claim: "a card two hours before its kickoff is not asked about, at load or across ticks (the browser)",
    find: "    inLiveWindowAt now g\n    && (match gameStateAt now g with\n        | Final _ -> false\n",
    replace: "    (match g.StartTime with Some s -> now <= s + liveWindowAfterStart | None -> false)\n    && (match gameStateAt now g with\n        | Final _ -> false\n",
    expect: "node scripts/live-score-render-check.mjs",
  },
  {
    id: "live-answer-told-before-the-kickoff",
    file: "src/LiveScore.fs",
    claim: "an answer is told a card from its kickoff and not before it (the Suite)",
    find: "    liveSportKey g.Sport = Some key && inLiveWindowAt now g\n",
    replace: "    liveSportKey g.Sport = Some key && (match g.StartTime with Some s -> now <= s + liveWindowAfterStart | None -> false)\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "live-answer-told-before-the-kickoff-in-the-browser",
    file: "src/LiveScore.fs",
    claim: "a failed feed is not told to a card of the same league two hours before its kickoff (the browser)",
    find: "    liveSportKey g.Sport = Some key && inLiveWindowAt now g\n",
    replace: "    liveSportKey g.Sport = Some key && (match g.StartTime with Some s -> now <= s + liveWindowAfterStart | None -> false)\n",
    expect: "node scripts/live-score-render-check.mjs",
  },
  // Fix-review 2026-11-11 (decoder F5, F6; defence F24): the away side is its own call site, and the lower bound of a score is 0.
  {
    id: "feed-negative-score-is-accepted",
    file: "src/LiveFeed.fs",
    claim: "a negative score is an error naming the field, not a score drawn as -1",
    find: "        if n = System.Math.Floor n && n >= 0.0 && n <= 2147483647.0 then\n",
    replace: "        if n = System.Math.Floor n && n >= -2147483648.0 && n <= 2147483647.0 then\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "feed-score-lower-bound-is-one",
    file: "src/LiveFeed.fs",
    claim: "a score of zero decodes, so the lower bound is 0 and not 1",
    find: "        if n = System.Math.Floor n && n >= 0.0 && n <= 2147483647.0 then\n",
    replace: "        if n = System.Math.Floor n && n >= 1.0 && n <= 2147483647.0 then\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "feed-null-away-score-decodes-as-zero",
    file: "src/LiveFeed.fs",
    claim: "a live game whose away score is null is unavailable, never a zero",
    find: "          AwayScore = get.Optional.At [ \"away\"; \"score\" ] wholeScore\n",
    replace: "          AwayScore = (get.Optional.At [ \"away\"; \"score\" ] wholeScore |> Option.orElse (Some 0))\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "feed-away-score-becomes-required",
    file: "src/LiveFeed.fs",
    claim: "an away team with no score decodes as no score, not as a failed feed",
    find: "          AwayScore = get.Optional.At [ \"away\"; \"score\" ] wholeScore\n",
    replace: "          AwayScore = (get.Required.At [ \"away\"; \"score\" ] wholeScore |> Some)\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "feed-away-float-score-is-truncated",
    file: "src/LiveFeed.fs",
    claim: "an away score that is not a whole number is an error naming the away field",
    find: "          AwayScore = get.Optional.At [ \"away\"; \"score\" ] wholeScore\n",
    replace: "          AwayScore = (get.Optional.At [ \"away\"; \"score\" ] Decode.float |> Option.map int)\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "feed-away-string-score-is-coerced",
    file: "src/LiveFeed.fs",
    claim: "an away score served as a numeric string is an error naming the away field, not a coerced number",
    find: "          AwayScore = get.Optional.At [ \"away\"; \"score\" ] wholeScore\n",
    replace: "          AwayScore = get.Optional.At [ \"away\"; \"score\" ] Decode.int\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "feed-away-score-range-is-not-checked",
    file: "src/LiveFeed.fs",
    claim: "an away score outside the int32 range or below zero is an error naming the away field (the range check lives in one decoder both sides share; here the away side reads a bare float)",
    find: "          AwayScore = get.Optional.At [ \"away\"; \"score\" ] wholeScore\n",
    replace: "          AwayScore = (get.Optional.At [ \"away\"; \"score\" ] Decode.float |> Option.map (fun n -> if n = System.Math.Floor n then int n else 0))\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "live-probe-decode-ignores-the-away-score",
    file: "scripts/live-score-probe.mjs",
    claim: "a bad away score fails the feed on the probe as it does on the page",
    find: "if (!h.ok || !a.ok) return",
    replace: "if (!h.ok) return",
    expect: "node scripts/live-score-probe.mjs --self-test",
  },
  {
    id: "live-probe-parity-probe-ignores-the-away-score",
    file: "scripts/live-score-probe.mjs",
    claim: "the probe's feed decoder and the page's agree on every body of the battery (here the probe ignores a bad away score and the page does not)",
    find: "if (!h.ok || !a.ok) return",
    replace: "if (!h.ok) return",
    expect: "node scripts/check-live-probe-keys.mjs",
  },
  // Fix-review 2026-11-11 (card F8, defence F22): the reason's three inputs. The archive state the effect reads, the Final arm for extra time, and the readings that carry no reason.
  {
    id: "live-why-effect-ignores-the-archive-state",
    file: "src/Scoreboard.fs",
    claim: "a card the archive has finalised, told the feed failed, carries no note and no reason (the effect reads the card's own state)",
    find: "                  match LiveScore.liveWhyFor (state ()) (reading ()) with\n",
    replace: "                  match LiveScore.liveWhyFor Scheduled (reading ()) with\n",
    expect: "node scripts/live-score-render-check.mjs",
  },
  {
    id: "live-why-for-an-extra-time-final",
    file: "src/LiveScore.fs",
    claim: "a game the archive has finalised carries no reason, in regulation or after extra time",
    find: "    | Final _, _ -> \"\"\n    | _, LiveUnavailable why -> why\n",
    replace: "    | Final(_, _, false), _ -> \"\"\n    | _, LiveUnavailable why -> why\n",
    expect: "node build/VerifyMain.js",
  },
  {
    id: "live-why-for-full-time",
    file: "src/LiveScore.fs",
    claim: "a clock, full time or no reading carries no reason",
    find: "    | _, LiveUnavailable why -> why\n    | _ -> \"\"",
    replace: "    | _, LiveUnavailable why -> why\n    | _, FullTime _ -> \"full time\"\n    | _ -> \"\"",
    expect: "node build/VerifyMain.js",
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
const guardOf = (source, m) => (m.file === 'scripts/mutation-check.mjs' ? source.indexOf('const selected = ONLY') : 0)
// The replacement goes in through a function, not as a string: a string is read for `$'`, `$&`, `$$` and `` $` ``, and an entry's replace is source text, not a pattern (the self-test's first clause).
const applyMutation = (source, m) => {
  const guard = guardOf(source, m)
  return source.slice(0, guard) + source.slice(guard).replace(m.find, () => m.replace)
}
/** How many times the anchor occurs where the mutation would be applied. `replace` takes the first, so two means the entry may be mutating something other than what its claim says. */
const anchorCount = (source, m) => source.slice(guardOf(source, m)).split(m.find).length - 1

const eligible = MUTATIONS.filter(m => !m.selfTestOnly)
// A malformed or out-of-range --shard is a usage error (exit 2, a sentence), not a stack trace; --shard and --ids both choose the mutations, so giving both is ambiguous.
const shardSpec = (() => {
  if (!SHARD) return null
  try { return parseShard(SHARD) } catch (e) { console.error(e.message); process.exit(2) }
})()
if (shardSpec && IDS) {
  console.error('--shard and --ids both choose which mutations run; give one of them.')
  process.exit(2)
}
const subsetIds = IDS ? IDS.split(',').filter(Boolean) : shardSpec ? shardOf(eligible.map(m => m.id), shardSpec.i, shardSpec.n) : null
const selected = ONLY
  ? MUTATIONS.filter(m => m.id === ONLY)
  : subsetIds ? eligible.filter(m => subsetIds.includes(m.id)) : eligible

/**
 * Mutations whose search string is no longer in their file. Reads files and applies
 * nothing, so it needs no build: "can this mutation still be made?" is a different
 * question from "does the suite catch it?", and the first costs a second.
 *
 * `venue-team-page-not-football` went stale when the line under it gained a clause
 * (2026-10-25). The gate's mutation row failed 97 minutes in with "the mutation
 * anchor still exists"; `cards-run-together` and `missing-park-factor-invented`
 * had failed it the same way before. Asked at commit time, it is a second.
 */
const staleAnchors = (mutations, read) => {
  const stale = []
  let checked = 0
  for (const m of mutations) {
    if (!m.file || m.find === undefined) continue   // world mutations carry no anchor in a file
    checked++
    let source
    try { source = read(m.file) } catch (_) { stale.push(`${m.id}: ${m.file} is unreadable`); continue }
    if (applyMutation(source, m) === source) stale.push(`${m.id}: not found in ${m.file}: ${m.find.trim().slice(0, 100)}`)
    else if (anchorCount(source, m) > 1) stale.push(`${m.id}: AMBIGUOUS in ${m.file}, ${anchorCount(source, m)} matches, and the first is the one mutated: ${m.find.trim().slice(0, 100)}`)
  }
  return { checked, stale }
}

// A `--only` THAT SELECTS NOTHING RAN NOTHING, AND MUST NOT SAY PASS.
//
// Seen 2026-10-19: an insert of four records failed, and `--only <id>` for each
// of them printed `baseline: ran 0 of 0` and `PASS the unmutated tree passes
// every expectation`, exit 0. Four mutations that did not exist were reported
// green. A harness whose job is to make a check fail on purpose cannot also
// report success for a mutation it never found; that is the NOT-CAUGHT-with-
// nothing-mutated failure this repo's Rule 90 names, from the other side.
//
// A missing value (`--only` last, or followed by another flag) is the same
// failure: `ONLY` is then falsy or a flag, and the first shape used to fall
// through to the FULL suite while the caller believed they had asked for one.
//
// Exit 2, not 1, so a caller can tell "no such mutation" from "mutation survived".
// It sits before `heal()`, the signal handlers and the baseline, so it touches
// nothing. Mutating this block is covered by `only-selects-nothing-passes`.
//
// `--anchors` sits here too, for the same reason: it reads files and runs nothing.
if (process.argv.includes('--anchors')) {
  const { checked, stale } = staleAnchors(MUTATIONS, f => readFileSync(f, 'utf8'))
  console.log(`checked ${checked} of ${MUTATIONS.length} mutation anchors; ${stale.length} stale`)
  for (const x of stale) console.log(`  STALE  ${x}`)
  process.exit(stale.length ? 1 : 0)
}
// The three helpers below tell whether any process of a group is still running. They sit ABOVE `--stranded` because that mode reads them, and a mode that exits up here reads a
// const defined further down before it exists (a ReferenceError, not a refusal). They use only imports, so nothing they need is defined after them. `reapDriver`, further down, uses the same three.
/** Is any of these `[state, pgrp]` pairs a live process of group `pgid`? A zombie is a process that has finished and not yet been reaped, and nothing is left of it. */
const groupHasLive = (entries, pgid) => entries.some(([state, pgrp]) => pgrp === pgid && state !== 'Z' && state !== 'X')
/** Every process's `[state, pgrp]` from /proc, or null where /proc cannot be read (signal 0 to the group is the answer there, and it counts a zombie). */
const procGroups = () => {
  try {
    return readdirSync('/proc').filter(d => /^\d+$/.test(d)).flatMap(d => {
      try {
        const text = readFileSync(`/proc/${d}/stat`, 'utf8')
        const f = text.slice(text.lastIndexOf(')') + 2).split(' ')
        return [[f[0], Number(f[2])]]
      } catch { return [] }
    })
  } catch { return null }
}
const groupAlive = pgid => {
  const all = procGroups()
  if (all !== null) return groupHasLive(all, pgid)
  try { process.kill(-pgid, 0); return true } catch (e) { return e.code === 'EPERM' }
}
// `--stranded` sits here too: it reads three small files and runs nothing. It is the refusal the pre-commit hook and the gate run FIRST, because a tree that still holds
// a mutation is not the tree they are asked about. Until now the hook printed a warning and passed (measured 2026-11-05 on a stranded `outbox-stub`: 46 outbox files stubbed,
// `npm run check:mutation-anchors` exited 0; on a stranded source file its anchor check failed first, naming a stale table entry, which sent a reader to the wrong file).
//
// IT REFUSES AND DOES NOT HEAL, on purpose. A heal writes files, and for a source file it runs `npm run build` (the hook promises no build and takes a fraction of a minute);
// a commit hook has no business rewriting the tree of the commit it is part of, whose index may already hold the mutated version. `clean-source-check.mjs` makes the same
// choice for an injected proof body. The command that heals is named, and a person runs it.
//
// It reads its own directory instead of `stateDir`, `marker`, `driverFile` or `healHeld`: those are consts defined further down, and a mode that exits up here would read them before they
// exist (a ReferenceError, not a refusal). The expression is the one `stateDir` uses for a real run. It sits above the heal, the run lock and the exit handlers, so it also
// takes no lock, removes no stale one and clears no state; the clauses run it with `--heal` beside it and a stale lock beside the marker to hold it to that.
if (process.argv.includes('--stranded')) {
  const real = process.env.MUTATION_STATE_DIR || '.mutation-state'
  const files = [join(real, 'active.json'), join(real, 'nested', 'active.json')]
  const driverRecord = join(real, 'driver.json')
  const heal = 'node scripts/mutation-check.mjs --heal'
  // The hash of a file, or null where there is none. `sha` and `shaOfFile` are consts defined further down (the same trap as above), so this reads with the import.
  const hashAt = path => { try { return createHash('sha256').update(readFileSync(path)).digest('hex') } catch { return null } }
  /**
   * What `planHeal` would call a marker, in its order and by its names, read from the marker and the file alone: planHeal also reads the tree through git (a change made outside the source is
   * judged by it), and this mode runs nothing. 'applied' is planHeal's `restore`: the file is exactly the mutation and the backup exactly the original, so the heal puts it back.
   */
  const kindOf = m => {
    if (typeof m?.id !== 'string') return 'unreadable'
    if (isLive(m)) return 'live'
    if (typeof m.restoreCmd === 'string') {
      if (m.before === null || typeof m.before !== 'object') return 'legacy'
      return m.touched !== null && typeof m.touched === 'object' && Object.keys(m.touched).length > 0 ? 'world' : 'world-unrecorded'
    }
    if (![m.originalSha, m.mutatedSha].every(h => typeof h === 'string')) return 'legacy'
    const now = hashAt(m.file)
    if (now === m.originalSha) return 'back'
    if (m.mutatedSha !== now) return 'diverged'
    return hashAt(m.backup) === m.originalSha ? 'applied' : 'lost'
  }
  const left = files.filter(f => existsSync(f))
  for (const file of left) {
    // A marker that does not parse is still a marker: it is refused by what it is, and `--heal` says more about it.
    let m = null
    try { m = JSON.parse(readFileSync(file, 'utf8')) } catch { m = null }
    const id = m?.id ?? 'unknown'
    const where = m?.file ?? 'the tree'
    const kind = kindOf(m)
    const named = `[${id}] on ${where}`
    const nothing = 'Nothing was touched.'
    const refuses = `\`${heal}\` refuses this one and writes nothing: run it and read what it says.`
    let text
    switch (kind) {
      case 'unreadable':
        text = `::error::${file} is not a marker this harness wrote (it does not parse, or names no mutation), so what the run left cannot be told (${named}). ${nothing} ${refuses}`
        break
      case 'live':
        text = `::error::${file} names pid ${m.pid}, which is still running: ${named} is applied by a mutation run that is IN PROGRESS. ${nothing} Wait for pid ${m.pid} to finish, or stop it (kill -9 if it ignores a plain kill), and run this again.`
        break
      case 'legacy':
        text = `::error::${file} was written before markers recorded what the mutation did (${named}), so it cannot be checked against the tree. ${nothing} ${refuses}`
        break
      case 'world':
        text = `::error::${file} is a change made outside the source that a killed run left (${named}). ${nothing} Whether the tree still holds it is for the heal to judge, and that needs git, which this mode does not run: \`${heal}\` puts the paths back from the stash if they are still as the mutation left them, drops the state if they are already back, and refuses, naming the paths, if one changed after the kill.`
        break
      case 'world-unrecorded':
        text = `::error::${file} is a change made outside the source whose run was killed before it recorded which paths it touched (${named}). ${nothing} \`${heal}\` drops the state if the tree is unchanged since, and otherwise refuses, because it cannot tell the mutation's changes from a person's, and says where the stash is.`
        break
      case 'back':
        text = m.rebuild !== false
          ? `::error::${file} is a marker a killed run left behind (${named}), and ${where} is already back as it was: the run stopped before its build was verified clean, so build/ may still hold the mutation. ${nothing} Nothing committable differs, but a gate run scores build/. Rebuild and clear it: ${heal} (it runs \`npm run build\`). Where the build cannot run here, run it by hand once it can; deleting ${dirname(file)} drops the only record that build/ may be stale, so only after that.`
          : `::error::${file} is a marker a killed run left behind (${named}), and ${where} is already back as it was, so nothing is applied: the run was killed before it wrote the mutation, or after it undid it and before it dropped this marker. ${nothing} Clear it: ${heal} (it runs no build for this one).`
        break
      case 'diverged':
        text = `::error::${file} names ${named}, and that file is neither the original nor the mutation: it changed after the kill. ${nothing} ${refuses}`
        break
      case 'lost':
        text = `::error::${file} names ${named}, which is still exactly the mutation, but its backup (${m.backup}) is gone or is not the original. ${nothing} ${refuses}`
        break
      default:
        text = `::error::${file} is a mutation a killed run left applied (${named}). Nothing was touched, and this mode does not undo it: a commit or a gate run over this tree would carry the mutation. Heal it first: ${heal}`
    }
    console.log(text)
  }
  // THE THIRD THING A KILLED RUN LEAVES: the build driver. A SIGKILL runs no handler, so `dotnet fable watch` is still there, writing build/, and only the next run's start stops it (`reapDriver`).
  // Refused here when the record names a process group that is alive, the run that recorded it is dead, and the pid still holds the process that was recorded: the three tests `reapDriver` makes
  // before it signals anything, made without signalling. A live run's driver is that run's; a record that names no process (pid 0 or 1, or a torn file) says nothing about a group; a recycled pid or
  // a group that is gone is not a driver. (A live run's lock, `run.json`, is not read: a live run is not a stranded one, every start refuses on its lock, and a hook that refused on it would block
  // every unrelated commit made while any mutation run is going.)
  let orphan = null
  let rec = null
  try { rec = JSON.parse(readFileSync(driverRecord, 'utf8')) } catch { rec = null }
  const d = rec?.driver
  if (d && Number.isInteger(d.pid) && d.pid > 1 && !(rec.run && isLive(rec.run))) {
    const now = statOf(d.pid)
    const recorded = d.start === undefined || d.start === null ? null : String(d.start)
    const recycled = now !== null && recorded !== null && recorded !== now.start
    if (!recycled && groupAlive(d.pid)) orphan = d
  }
  if (orphan) console.log(`::error::${driverRecord} names process group ${orphan.pid}, a build driver (\`dotnet fable watch\`) of a run that is dead, and it is still running. Nothing was touched, and this mode does not stop it: it keeps writing build/ while anything scores that tree. Stop it first: node scripts/mutation-check.mjs --heal`)
  const looked = [...files, driverRecord]
  console.log(`checked ${looked.length} files (${looked.join(', ')}); ${left.length} hold a marker; ${orphan ? 1 : 0} name a build driver a dead run left running`)
  process.exit((left.length > 0 || orphan !== null) ? 1 : 0)
}
if (process.argv.includes('--list-ids')) {
  console.log(JSON.stringify(eligible.map(m => m.id)))
  process.exit(0)
}
if (!['watch', 'full'].includes(BUILD_MODE)) {
  console.error(`--build ${BUILD_MODE}: watch or full.`)
  process.exit(2)
}
if (ONLY && (SHARD || IDS)) {
  console.error('--only names one mutation; it cannot be combined with --shard or --ids.')
  process.exit(2)
}
// A SUBSET THAT SELECTS NOTHING, or names an id that is not there, ran nothing and must not say pass (the same rule as --only below).
if ((SHARD || IDS) && (selected.length === 0 || (IDS && subsetIds.some(id => !eligible.some(m => m.id === id))))) {
  console.error(`${IDS ? `--ids ${IDS}` : `--shard ${SHARD}`}: ${selected.length === 0 ? 'selects no mutation' : `names an id no mutation has (${subsetIds.filter(id => !eligible.some(m => m.id === id)).join(', ')})`}, so nothing was run.`)
  process.exit(2)
}
if (process.argv.includes('--only') && (!ONLY || selected.length === 0)) {
  console.error(`--only ${ONLY ?? '(no id given)'}: no mutation has that id, so nothing was run.`)
  console.error(`${MUTATIONS.length} mutations are defined; ids are the \`id:\` field of each record.`)
  process.exit(2)
}

/**
 * Does this run own outbox/mutation-baseline-latest.json?
 *
 * ONLY A FULL RUN DOES, and the reason is a defect found on 2026-10-09. The
 * gate row "breaking each invariant makes a check fail" runs three commands in
 * order:
 *
 *   ok('node scripts/mutation-check.mjs --self-test') &&
 *   ok('node scripts/mutation-check.mjs') &&                <- writes 86 of 86
 *   fails('node scripts/mutation-check.mjs --only known-survivor')   <- writes 1 of 1
 *
 * The baseline was written unconditionally, so the third command overwrote the
 * second's record moments after it was made. `verify-full` #25 passed 530/530
 * and committed `ran: 1, from_mutations: 1` — the artifact whose own comment
 * says "a green run records the baseline it was green against" recorded the
 * wrong run, every time, for as long as it has existed.
 *
 * Worse than losing it: `ran: 1` has no visible denominator, so the file reads
 * as a baseline of one expectation that passed rather than as the remains of
 * one that covered 86. That is Rule 91 by construction.
 *
 * An `--only` run says it is not writing, rather than silently not writing:
 * absent-because-not-applicable and absent-because-broken are different facts.
 *
 * NOT EXPORTED, AND THAT IS LOAD-BEARING. This file does its work at module
 * scope — there is no `isMain` guard around 1400 lines of it — and
 * `import-purity-check.mjs` probes only the scripts that export something. The
 * first version of this const carried `export`, which put this file in that
 * probe's set, and importing it RAN THE WHOLE 86-MUTATION SUITE: measured at
 * 506 seconds inside a pre-commit hook, with `run-row.mjs` and `proof-check.mjs`
 * spawned as children and `src/Scoreboard.fs` left carrying an injected
 * `__proof76` body when the probe was killed. One `export` keyword turned a
 * ten-second guard into a source-mutating half-hour. The self-test is in this
 * same file and needs no export.
 */
const ownsBaseline = (only) => only === null
// A shard, or an explicit list of ids, covers part of the table: its baseline is not the full run's, and the aggregator writes the combined artifact.
const writesBaseline = (only, subset) => ownsBaseline(only) && !subset

// --- restore safety ----------------------------------------------------------
// Backups outside src/, and handlers on every exit path. proof-check learned
// that much the hard way: a SIGTERM mid-run left a mutated working tree.
//
// THE HANDLERS ARE NOT ENOUGH, and this session is the proof. A container
// restart SIGKILLs the process — no handler runs, that is what SIGKILL means —
// and the backups used to live in `mkdtempSync(tmpdir())`, which the same
// restart wipes. So the tree kept the mutation, the backup was gone, and
// nothing anywhere recorded that either thing had happened.
//
// What that cost: the next gate run scored a deliberately-broken `Verify.fs`
// as two failing rows — "the F# harness refuses a check with no counterexample"
// and "breaking each invariant makes a check fail" — and both were true
// statements about a tree nobody had meant to create. The gate was right and
// its report pointed at the product. This is the repo's own recurring failure
// wearing new clothes: an answer that is wrong for a reason unrelated to the
// thing being measured.
//
// Worse than the twenty minutes: had the stranded mutation landed in a file
// whose checks all still passed, the gate would have gone green and the commit
// would have shipped a deliberately broken invariant.
//
// So the backup is durable, in-repo (gitignored), and carries a marker naming
// what is applied right now. SIGKILL cannot stop a file already on disk from
// still being there afterwards. The next run finds the marker and, if what it names is provably still as that run left it, undoes it and says so out loud;
// if the tree has moved on since, it writes nothing and says why (planHeal).
//
// WHOSE STATE IT IS (2026-11-04). The exit handler below runs on every invocation that gets
// this far, and it used to clear the state directory unconditionally. So `--self-test`, which
// the pre-commit hook runs on every commit, deleted a stranded marker and its backup that a
// killed run had left, while the mutated file stayed mutated: reproduced, 21/21 passing, the
// directory gone. (`--anchors` and `--list-ids` exit before this point and never did.) Now a
// process clears only state it wrote itself (`ownsState`); the self-test works in a temp
// directory of its own whatever MUTATION_STATE_DIR says (a self-test the harness starts as an
// `expect` inherits that variable, and must not be pointed at the harness's own directory); and
// a harness run INSIDE a harness run gets a nested directory, so it neither heals nor overwrites
// its parent's marker.
//
// ONE RUN AT A TIME. The marker exists only while a mutation is applied and heal() looks once,
// at the start, so a second run started during the first one's baseline found nothing to refuse
// and read the first run's MUTATED file as its own original. `run.json` in the state directory
// names the running process for the whole run, created exclusively, and a second run stops.
//
// EACH CLOCK READ IS CAPTURED INTO A CONSTANT (RUN_STARTED_AT here, BASELINE_AT where the baseline is written), and nothing else reads the clock. `row-confidence.mjs`
// scores a script that reads it in any other shape as nondeterministic, and a bare `new Date()` beside these would have failed the gate row that scores this file. (That
// scan is not a tokenizer and does not see every line of this file; the property is kept by writing the constants, not by the scan.)
const RUN_STARTED_AT = new Date()
const stateDir = process.argv.includes('--self-test')
  ? mkdtempSync(join(tmpdir(), 'mutation-state-'))
  : (process.env.MUTATION_STATE_DIR || '.mutation-state')
// The self-test's state directory is a mkdtemp of its own, made on the line above, and a crash anywhere after it must not leave it behind. So its removal is registered HERE and not further down, where a
// throw before the registration (the stranded-state read, or the scratch directory's own mkdtemp failing on a full or read-only tmp) leaked one directory per run: measured 2026-11-05 with an injected throw,
// `mutation-state-MpP87T` left in TMPDIR. A normal end removes it already, at the end of the self-test; removing twice with `force` is harmless. (A SIGKILL cannot be covered.)
if (process.argv.includes('--self-test')) process.on('exit', () => rmSync(stateDir, { recursive: true, force: true }))
const marker = join(stateDir, 'active.json')
const runLock = join(stateDir, 'run.json')
// The build driver this run started and who started it: written the moment the watcher is spawned, kept until it is stopped. Not the marker: the marker exists only while a
// mutation is applied (the watcher's first compile, about 25 s, is before any), and is cleared between mutations while the watcher keeps running.
const driverFile = join(stateDir, 'driver.json')
const backups = new Map()
let builder = null
let ownsState = false
let ownsLock = false
// While a change made outside the source is applied: how to undo it, and what the tree looked like. An exit undoes it.
let worldApplied = null
// True from the moment a mutation of a file the build reads is about to be written until the build has been made clean again and checked. The file going back
// is not the build going back: a handler that clears the marker in between leaves build/ holding the mutation with no record anywhere (review 2026-11-04).
let buildDirty = false
// The files a heal wrote back. A heal that restores a file THIS PROCESS IS BUILT FROM leaves the process running the mutated copy it had already loaded.
const healedFiles = new Set()
// Every file this process loaded as code: this one and what it imports, transitively (the self-test reads the import lines and fails if one is missing here).
const SELF_SOURCES = ['mutation-check.mjs', 'mutation-lib.mjs', 'checks.mjs', 'run-marker.mjs'].map(f => join(dirname(fileURLToPath(import.meta.url)), f))

// Test-only: lets the self-test end a real run at a chosen moment in a way no handler can catch (SIGKILL), or with a throw the handler can.
const KILL_AT = process.env.MUTATION_KILL_AT || null
const killHere = async where => {
  if (KILL_AT !== where) return
  if (process.env.MUTATION_KILL_SIGNAL === 'throw') throw new Error(`MUTATION_KILL_AT=${where}`)
  const signal = process.env.MUTATION_KILL_SIGNAL || 'SIGKILL'
  process.kill(process.pid, signal)
  // A signal this process catches is not handled where it is sent: Node runs the handler when the event loop turns. Without this wait it would be handled one turn late, at the
  // `tick()` that ends `expectation()`, AFTER the expectation had run, and every end state a clause can look at (exit 1, the file back, the state gone, no verdict line) is the
  // same whether the handler ran before the expectation or after it. (Before `expectation()` had that turn, a docs mutation had no `await` in its path at all and finished, restored and
  // exited before the handler ran.) The wait makes the signal handled where it was sent, before the expectation; the E18 clause with `expect-writes-unrelated` is what tells the two apart.
  // SIGKILL needs no turn.
  if (signal !== 'SIGKILL') await new Promise(done => setTimeout(done, 400))
}

/** One turn of the event loop. A signal that arrived while a synchronous command was running is acted on here and nowhere else (see `expectation`). */
const tick = () => new Promise(done => setImmediate(done))
const sha = data => createHash('sha256').update(data).digest('hex')
const shaOfFile = path => (existsSync(path) ? sha(readFileSync(path)) : null)
/** Who is writing a marker, so a later run can tell this process from a recycled pid (run-marker.mjs). */
const identity = () => ({ pid: process.pid, start: startOf(process.pid), startedAt: RUN_STARTED_AT.toISOString() })
/** Where a world mutation keeps what it moves aside: in the state directory, which a restart does not wipe (`/tmp` does). */
const stashOf = id => join(stateDir, 'world', id)

/** Everything in a state directory but the run lock, the build driver's record and what a nested run left: the marker, the backups, the stashes. The lock lasts as long as the run that holds it, and the record as long as the watcher it names (which outlives every mutation), so nothing that clears state may take either. */
const emptyEntries = dir => {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir)) {
    if (entry === 'run.json' || entry === 'driver.json') continue
    // A harness run inside this one keeps its state in `nested`. What a child that was killed left there is the next run's to heal (healHeld looks there first), not this run's to
    // delete: an emptied directory goes, one that holds a child's state stays.
    if (entry === 'nested') { try { rmdirSync(join(dir, entry)) } catch { /* not empty: a child's state */ } continue }
    rmSync(join(dir, entry), { recursive: true, force: true })
  }
}
/** Drop the marker, the backups and the stashes — the tree is known-good from here. The run lock stays: it lasts as long as the run. */
const clearActive = () => {
  emptyEntries(stateDir)
  ownsState = false
}
/** This process is about to write state, so it is this process's to clear. */
const claimState = () => { mkdirSync(stateDir, { recursive: true }); ownsState = true }
/** Created exclusively, so two runs starting together cannot both hold it. False if another has it. */
const acquireRunLock = () => {
  mkdirSync(stateDir, { recursive: true })
  // Test-only fault (E28): a rival run that took the lock after `checkLocks` found none and before the create below. It is this process's parent, so the planted lock names a pid that is
  // alive and is not this run's own. Inside the taking rather than between `checkLocks` and the `if`, so the anchors that need those two contiguous are undisturbed.
  if (process.env.MUTATION_FAULT === 'lock-appears') writeFileSync(runLock, JSON.stringify({ pid: process.ppid, start: startOf(process.ppid), startedAt: RUN_STARTED_AT.toISOString() }))
  try {
    writeFileSync(runLock, JSON.stringify(identity()), { flag: 'wx' })
  } catch (e) {
    if (e.code === 'EEXIST') return false
    throw e
  }
  ownsLock = true
  return true
}
const releaseRunLock = () => {
  if (!ownsLock) return
  rmSync(runLock, { force: true })
  ownsLock = false
  try { rmdirSync(stateDir) } catch { /* not empty: state a person still needs */ }
}

/**
 * Is the state this run wrote still there? An expectation runs code that was just mutated, and nothing stops that code from deleting the directory the
 * harness keeps its marker, backup and lock in: it happened (2026-11-03), through a table entry whose mutated self-test cleaned up the directory it was given,
 * and the only sign was a run lock that had vanished. A run that loses its own state is one SIGKILL away from a tree nothing can heal, so it says so.
 */
const stateIntact = markerText => {
  try {
    return readFileSync(marker, 'utf8') === markerText && JSON.parse(readFileSync(runLock, 'utf8')).pid === process.pid
  } catch {
    return false
  }
}
/** The command an expectation runs. Test-only: one fault makes it delete the harness's marker and run lock first (not the stash or backup), to prove that is noticed; the other makes it write an unrelated file. */
const expectOf = m => {
  if (process.env.MUTATION_FAULT === 'expect-wipes-state') return `d="$(dirname "$MUTATION_STATE_DIR")" && rm -f "$d/active.json" "$d/run.json" && ${m.expect}`
  // ...or writes a file nobody asked for (another session, a build), which a world mutation must not mistake for a failed restore. The content is a timestamp in SECONDS: `%N` is GNU's alone (BSD and busybox
  // print it as the letter, `1793915440N`), and the clause that reads the file wants digits so that a `date` that never ran is not mistaken for one that did.
  if (process.env.MUTATION_FAULT === 'expect-writes-unrelated') return `date +%s > unrelated-during-window.txt && ${m.expect}`
  // ...or is ended by a signal (a Ctrl-C reaching it, a crash, the OOM killer), or sends this run a SIGTERM while it works and then passes.
  if (process.env.MUTATION_FAULT === 'expect-interrupted') return 'kill -INT $$'
  if (process.env.MUTATION_FAULT === 'expect-terms-the-run') return 'kill -TERM $PPID && sleep 0.3'
  if (process.env.MUTATION_FAULT === 'expect-child-killed') return 'sleep 5 & kill -KILL $!; wait $!'
  // ...or prints without end (an infinite loop in a mutated check), which the output limit ends: a command that floods has failed, it has not been killed from outside.
  if (process.env.MUTATION_FAULT === 'expect-floods') return 'node -e "process.stdout.write(\'x\'.repeat(2 * 1024 * 1024))"'
  // ...or starts a harness run of its own that is SIGKILLed with a mutation applied (it keeps its state beneath this run's), and then runs the real expectation.
  if (process.env.MUTATION_FAULT === 'expect-strands-a-child') return `MUTATION_KILL_AT=source-applied node scripts/mutation-check.mjs --only known-survivor; ${m.expect}`
  // ...or reports whether it inherited the restart flag, which only the run that was restarted may have (and not its children).
  if (process.env.MUTATION_FAULT === 'expect-reports-env') return `echo "REEXEC=[$MUTATION_REEXEC]" > expect-env.txt && ${m.expect}`
  return m.expect
}

// What a command this script starts sees: a state directory of its own beneath ours, so a harness
// run inside a harness run (the `harness-blind` expectation is one) never touches this run's marker.
const childEnv = extra => ({ ...process.env, MUTATION_STATE_DIR: join(stateDir, 'nested'), ...extra })

// Why the last failed run() failed, for the one caller that reports it (a heal's `npm run build`): the exit status or signal and the end of its stderr. execSync's default
// maxBuffer is 1 MiB, and a command that merely PRINTS more than that is killed and reported as failed (ENOBUFS), so the limit is raised well past anything a build prints and a
// failure says which kind it was. (Review 4, 2026-11-04: a build that succeeds by hand but prints 1.2 MB wedged every later run behind "npm run build failed".)
let lastFailure = ''
// The signal that ended the last command, or null if it ended by itself (a check that fails exits non-zero: that is its answer; one that is killed has given none) or was ended by this run's own
// output limit (it failed). `sh -c a && b` reports a killed `b` as exit status 128 plus the signal, so a status in that range counts too (the OOM killer and a browser crash both look like this).
// That window (129 to 159) cannot be narrowed to `e.signal` alone: probed 2026-11-05, `sleep 5 & kill -KILL $!; wait $!` ends with status 137 and NO signal, which is the shape a killed child
// has under a shell, and the table's expectations run through one. The price is that a command which EXITS 129..159 on its own reads as killed too (`exit 130` does), and the run stops. No
// script in the repository exits in that range on purpose; of the scripts that exit with a failure count (`process.exit(summarize())`, two of them, 4 checks each) none can reach it.
let lastSignal = null
// Test-only: MUTATION_OUTPUT_LIMIT lowers it, so the self-test can run an expectation past the limit with kilobytes of output (a real flood past 256 MiB took 3.1 s here, measured 2026-11-05, and does it again for every run of the self-test).
const OUTPUT_LIMIT = Number(process.env.MUTATION_OUTPUT_LIMIT) || 256 * 1024 * 1024
const run = (cmd, extra) => {
  lastSignal = null
  try {
    execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', env: childEnv(extra), maxBuffer: OUTPUT_LIMIT })
    return true
  } catch (e) {
    // A command that prints more than OUTPUT_LIMIT is ended by execSync with SIGTERM and reported as ENOBUFS (probed 2026-11-05 on Node 22: code ENOBUFS, signal SIGTERM, status null). That SIGTERM is this
    // run's own limit, not a kill from outside: the command did not finish, and a check that cannot finish has failed. Told apart by the code, never by the name of the signal (review 6, 2026-11-05: a
    // mutated check that printed without end was reported as "ended by SIGTERM" and stopped the shard at that mutation, where before the signal rule it was a caught mutation).
    lastSignal = e.code === 'ENOBUFS' ? null : (e.signal ?? (e.status > 128 && e.status < 160 ? `status ${e.status}` : null))
    const tail = String(e.stderr ?? '').trim().split('\n').slice(-3).join(' | ').slice(0, 300)
    lastFailure = `${e.code ?? (e.status !== null && e.status !== undefined ? `exit ${e.status}` : `signal ${e.signal}`)}${tail ? `: ${tail}` : ''}`
    return false
  }
}

/**
 * A command's stdout, or '' if it fails.
 *
 * Used to snapshot the working tree either side of a world mutation, so a
 * mutation that changes nothing is reported as broken rather than as a claim
 * nothing defends. Pre-existing dirt cancels out: the comparison is between
 * two states, not against a clean tree.
 */
const capture = cmd => {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', env: childEnv() })
  } catch {
    return ''
  }
}

/**
 * The working tree as a map of path to content hash, for every file git sees as changed from HEAD or
 * as untracked (a deleted one reads '<missing>'). Content, not just names: that is what the no-op
 * detector below needs and what the old whole-tree digest only half had.
 *
 * It replaced `treeDigest`, a single hash of `git status --porcelain` plus the contents of UNTRACKED
 * files, for two reasons the review of 2026-11-04 found. (1) The digest cannot see a content change
 * to a TRACKED file that is already modified, so a hand edit to such a file left heal() certain the
 * tree was as the mutation left it, and it wrote the stale stash over the edit. (2) One hash of the
 * whole tree cannot say which part changed, so any unrelated change during a world mutation (another
 * session writing a document, a `git add`) read as "the restore failed", aborted a healthy run and
 * wedged every later one. A map says which paths the mutation touched, and only those are judged.
 *
 * The original reason for hashing untracked content survives: on 2026-08-19 `outbox-stub` rewrote an
 * entry that was untracked, `git status --porcelain` printed `?? path` before and after, and the
 * detector reported a mutation that had applied perfectly as "left the tree unchanged".
 */
const treeSnapshot = () => {
  const git = args => execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', maxBuffer: 1 << 28 })
  const snap = {}
  for (const path of [...git('diff --name-only -z HEAD').split('\0'), ...git('ls-files --others --exclude-standard -z').split('\0')]) {
    if (!path) continue
    try { snap[path] = existsSync(path) ? sha(readFileSync(path)) : '<missing>' } catch { snap[path] = '<unreadable>' }
  }
  return snap
}
const sameSnapshot = (a, b) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) if (a[k] !== b[k]) return false
  return true
}
/** The paths whose content differs between two snapshots, with what each held before and after (null: not in the snapshot). */
const touchedBy = (before, after) => {
  const touched = {}
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (before[k] !== after[k]) touched[k] = { before: before[k] ?? null, after: after[k] ?? null }
  }
  return touched
}
/**
 * Where one touched path is now: as the mutation left it, as it was, or somewhere else.
 *
 * A path the snapshot does not list (`null`) is a path that EQUALS HEAD, because the snapshot lists only what differs from it. So `null` means "as it was" only while
 * HEAD is where it was: once HEAD has moved, a stub that was committed reads null too. `headMoved` makes that ambiguity an 'other' instead of a restore it did not earn
 * (review 2026-11-04: the stubbed write-ups were committed, the next run read "already undone", deleted the stash, and the stubs stayed in HEAD).
 */
const pathState = (t, here, headMoved = false) => {
  if (here === t.after) return 'applied'
  if (here === t.before) return headMoved && here === null ? 'other' : 'undone'
  return 'other'
}
/** Where the paths a world mutation touched are now: all as the mutation left them, all as they were, some of each (a restore cut short), or somewhere else. */
const worldState = (touched, now, headMoved = false) => {
  let applied = 0
  let undone = 0
  const paths = Object.keys(touched)
  for (const k of paths) {
    const s = pathState(touched[k], now[k] ?? null, headMoved)
    if (s === 'other') return 'other'
    if (s === 'applied') applied++
    else undone++
  }
  if (applied === paths.length) return 'applied'
  return undone === paths.length ? 'undone' : 'mixed'
}
/** The touched paths that are somewhere else (named in the refusal, so a person does not have to find them). */
const strayPaths = (touched, now, headMoved = false) => Object.keys(touched).filter(k => pathState(touched[k], now[k] ?? null, headMoved) === 'other')
/** The commit the working tree is on, or null where it cannot be asked. */
const headOf = () => {
  try { return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim() } catch { return null }
}

/**
 * Undo the world mutation that is applied right now, and READ THE TREE BACK. True only if every path it
 * touched is as it was. A restore command that ran is not a restore that worked (`|| true` hides a
 * stash a restart wiped).
 */
const undoWorld = () => {
  const w = worldApplied
  if (w === null) return true
  // Test-only faults: a restore that does nothing, and one that puts back the first thing in the stash and stops (a `cp` that ran out of disk part-way; written for the
  // outbox-stub entry, whose write-ups are stashed flat by name). The second leaves the tree a read-back must call `mixed`, not `undone`.
  const partial = process.env.MUTATION_FAULT === 'world-restore-partial' ? 'f=$(ls "$STASH" | head -1) && cp "$STASH/$f" "outbox/$f"' : w.restore
  run(process.env.MUTATION_FAULT === 'world-restore-noop' ? 'true' : partial, { STASH: w.stash })
  let ok = false
  try {
    const now = treeSnapshot()
    ok = w.touched ? worldState(w.touched, now) === 'undone' : sameSnapshot(w.before, now)
  } catch { ok = false }
  if (ok) worldApplied = null
  return ok
}

const restore = () => {
  for (const [file, path] of backups) {
    if (existsSync(path)) writeFileSync(file, readFileSync(path))
  }
  backups.clear()
  // A world mutation still applied is undone BEFORE the state goes: its stash is in the state directory, and is the only copy of
  // whatever it moved aside. If the undo could not be verified the state stays, for heal() and for a person.
  const undone = undoWorld()
  // ...and a source mutation whose BUILD has not been verified clean keeps its marker too. The file is back, so the next heal reads "already undone" and rebuilds;
  // clearing the marker here would leave build/ holding the mutation with nothing to say so. (A catchable signal or fatal() takes this path; SIGKILL never reaches it.)
  if (ownsState && undone && !buildDirty) clearActive()
  releaseRunLock()
}
for (const signal of ['exit', 'SIGINT', 'SIGTERM', 'SIGHUP', 'uncaughtException']) {
  process.on(signal, err => {
    // A listener for uncaughtException replaces Node's own report of it, so without this line a crash exits 1 and says nothing (found 2026-11-04, when a mutated
    // lock check crashed the self-test before its first clause and the only output was the heading).
    if (signal === 'uncaughtException') console.error(err?.stack ?? String(err))
    restore(); stopBuilder(); if (signal !== 'exit') process.exit(1)
  })
}

/** The marker for a source mutation: what the file is before, what the mutation makes it, whether it could reach build/ (a heal rebuilds only if so), and who is writing. */
const sourceMarker = (m, backup, original, mutated, rebuild) =>
  ({ id: m.id, file: m.file, backup, originalSha: sha(original), mutatedSha: sha(mutated), rebuild, ...identity() })
/** The marker for a change made outside the source: where its stash is and the tree before (the paths it touched are added once it is applied). */
const worldMarkerOf = (m, stash, before) =>
  ({ id: m.id, restoreCmd: m.restore, stash, before, head: headOf(), ...identity() })

/** A marker that recorded which paths a mutation touched. `{}` records none, and no run writes it (a mutation that touched nothing is stopped as broken before the marker is written). */
const hasTouched = m => m.touched !== null && typeof m.touched === 'object' && Object.keys(m.touched).length > 0
/**
 * What to do about a marker a previous run left, as a value rather than as control flow.
 *
 * A marker says a run was killed. It does not say the tree is still as that run left it, and
 * heal() used to write the backup over the file on that sentence alone: the same defect as the
 * one proof-check had (docs/CC-CMD-2026-11-03-proof-check-stale-state.md), in the harness that
 * runs after it. A backup is applied only to a file that is exactly what the run made it, and
 * the marker now records what that is: the hash of the original and of the mutation for a
 * source file; for a change made outside the source, the tree before and the paths it touched,
 * each with its hash before and after. Nothing else in the tree is judged.
 *
 *   refuse     its process is still running (and is the one it names): a second run would
 *              mutate the same files. Nothing is touched.
 *   restore    the file (or every path touched) is exactly as the mutation left it, or a restore
 *              was cut short: undo it. The restore commands are written to be re-run.
 *   clear      it is already as it was before: the run died after its restore and before it
 *              dropped the marker. Nothing to write; drop the state.
 *   diverged   it is neither: it changed after the kill (or, for a change made outside the source, HEAD moved and a path can no longer be
 *              told from one that was put back). Nothing is written, the state stays. A file that is neither the original nor the mutation
 *              is diverged whether or not its backup survives: its edit is a person's work, not damage.
 *   lost       the file is exactly the mutation, but the backup is missing or is not the original it should be.
 *   legacy     the marker predates the hashes and cannot be checked.
 *   unreadable it does not parse, or names no mutation.
 *
 * Every outcome but restore and clear stops the run with the state on disk, because the state
 * is the evidence a person needs.
 */
const planHeal = (m, probes) => {
  if (m === null || typeof m !== 'object' || typeof m.id !== 'string') return 'unreadable'
  if (probes.live(m)) return 'refuse'
  if (typeof m.restoreCmd === 'string') {
    if (m.before === null || typeof m.before !== 'object') return 'legacy'
    const now = probes.snapshot()
    if (hasTouched(m)) {
      const where = worldState(m.touched, now, headMovedSince(m, probes))
      if (where === 'undone') return 'clear'
      return where === 'other' ? 'diverged' : 'restore'
    }
    // Killed before the mutation was recorded as applied: partial and moved-on cannot be told apart, so only "nothing changed" is acted on.
    return sameSnapshot(m.before, now) ? 'clear' : 'diverged'
  }
  if (typeof m.originalSha !== 'string' || typeof m.mutatedSha !== 'string') return 'legacy'
  const now = probes.fileSha(m.file)
  if (now === m.originalSha) return 'clear'
  // Neither the original nor the mutation is somebody's edit. It is judged before the backup: an edit made after the kill, with the backup also gone, is
  // new work and not damage, and "restore that file by hand" would send a person to discard it.
  if (now !== m.mutatedSha) return 'diverged'
  return probes.fileSha(m.backup) === m.originalSha ? 'restore' : 'lost'
}
/** Has HEAD moved since the marker was written? Only a marker that recorded it can say. */
const headMovedSince = (m, probes) => typeof m.head === 'string' && probes.head() !== m.head

const healProbes = { live: isLive, fileSha: shaOfFile, snapshot: treeSnapshot, head: headOf, exec: (cmd, extra) => run(cmd, extra) }

/**
 * Undo a mutation a previous run was killed before it could undo itself, in the state directory
 * `dir`, if what it left is provably its own. Returns true if there was a marker it dealt with.
 *
 * Runs BEFORE the baseline, so the baseline measures the tree as its author left it rather than as
 * a dead process left it. `exit` and `log` are parameters so the self-test can see the refusals.
 */
const healAt = (dir, { rebuild = true, probes = healProbes, exit = process.exit, log = console.log } = {}) => {
  const where = join(dir, 'active.json')
  if (!existsSync(where)) return false

  let m = null
  try { m = JSON.parse(readFileSync(where, 'utf8')) } catch { m = null }
  // A world mutation's stash is the only copy of whatever it moved aside (an untracked write-up is not in `git status` once it is moved). A refusal that tells a
  // person to delete the state directory must not do so over a stash that is not empty.
  const stashHeld = () => { try { return readdirSync(join(dir, 'world')).length > 0 } catch { return false } }
  // Every refusal ends the same way: how to make it stop, once a person has looked. A live run's refusal says to wait instead, so it passes `clears` false.
  //
  // `listsPaths`: the refusal has just told a person which paths are theirs (an edit made after the kill, or a path that matches a HEAD that moved) and to put back only the others. "Put it back first"
  // after that is an instruction to copy the stash over the very paths it named (measured 2026-11-05, in the sentence after "its restore command would overwrite the ones listed"), and the stash is
  // a full copy of every write-up. What is true there is the sentence before it, and then that the state may go once what is still needed is out of the stash.
  const stop = (text, clears = true, listsPaths = false) => {
    const how = !clears ? '' : stashHeld()
      ? (listsPaths
        ? ` Then delete ${dir} to clear this: it holds the only copy of what was moved aside, so take anything you still need out of ${join(dir, 'world')} first.`
        : ` What a world mutation moved aside is in ${join(dir, 'world')}: put it back first, because deleting ${dir} deletes the only copy.`)
      : ` When the tree is right, delete ${dir} to clear this.`
    log(`::error::${where} ${text}${how}`)
    exit(1)
    return true
  }
  let outcome
  try {
    outcome = planHeal(m, probes)
  } catch (e) {
    return stop(`could not be checked against the tree (${String(e.message).split('\n')[0]}). Nothing was touched.`)
  }

  if (outcome === 'unreadable') return stop('is not a marker this harness wrote (it does not parse, or names no mutation). Nothing was touched; read `git status` first.')
  if (outcome === 'refuse') return stop(`names pid ${m.pid}, which is still running: a mutation run is IN PROGRESS. A second one would mutate the same files, so this one stops. Nothing was touched. Wait for pid ${m.pid} to finish, or stop it (kill -9 if it ignores a plain kill), then run this again.`, false)
  if (outcome === 'legacy') return stop(`was written before markers recorded what the mutation did, so it cannot be checked against the tree. Nothing was touched. [${m.id}]: ${m.restoreCmd ? `\`${m.restoreCmd}\` undoes it` : `${m.backup} is the original of ${m.file}`}.`)
  if (outcome === 'lost') return stop(`names [${m.id}] on ${m.file}, which is still exactly the mutation, but its backup is gone or is not the original — restore that file by hand (\`git diff\` shows the damage).`)
  if (outcome === 'diverged') {
    if (m.restoreCmd) {
      // Named, not generic: the paths that are somewhere else are the ones a person must not put the stash over. The restore command is not offered, because
      // it copies the stash over every path it touched, including the ones listed here.
      if (!hasTouched(m)) {
        return stop(`names [${m.id}], a change made outside the source, and it was killed before it recorded which paths it touched, and the tree now differs from what it was before it ran. The mutation itself may have made those changes, or a person may have after the kill; the two cannot be told apart, so nothing was run. What it moved aside is in ${m.stash}.`)
      }
      const moved = headMovedSince(m, probes)
      const now = probes.snapshot()
      const stray = strayPaths(m.touched, now, moved)
      // Where HEAD has moved, a stray path the snapshot does not list matches HEAD now. That is where a path put back ends up, and also where a committed stub or edit ends up, and the
      // marker cannot tell them apart. It is not an edit, and the message must not call it one ("it changed after the kill" is true of the others).
      const atHead = moved ? stray.filter(k => (now[k] ?? null) === null) : []
      const edited = stray.filter(k => !atHead.includes(k))
      const list = ks => `${ks.slice(0, 6).join(', ')}${ks.length > 6 ? `, and ${ks.length - 6} more` : ''}`
      const parts = []
      if (edited.length) parts.push(`${edited.length === 1 ? 'a path it touched is' : 'paths it touched are'} neither as it was nor as the mutation left it (${list(edited)}): it changed after the kill`)
      if (atHead.length) parts.push(`HEAD has moved since the kill and ${atHead.length === 1 ? 'a path it touched now matches' : 'paths it touched now match'} HEAD (${list(atHead)}), which is where a path put back ends up and also where a committed stub or edit ends up, so the two cannot be told apart`)
      return stop(`names [${m.id}], a change made outside the source: ${parts.join('; and ')}. Nothing was run. ${atHead.length ? `Compare ${atHead.length === 1 ? 'the one that matches HEAD' : 'each that matches HEAD'} with ${m.stash} to tell which it is. ` : ''}Put back from ${m.stash} only the paths that are still as the mutation left them; its restore command would overwrite the ones listed.`, true, true)
    }
    const original = probes.fileSha(m.backup) === m.originalSha
    return stop(`names [${m.id}] on ${m.file}, and that file is neither the original nor the mutation: it changed after the kill. Nothing was written. ${original ? `The original is ${m.backup}.` : `Its backup (${m.backup}) is also gone or is not the original.`}`)
  }

  // A source file back to the original is not a build back to the original: the restore writes the file and THEN waits for the compile, and a kill in between leaves
  // build/ holding the mutation. The old heal always rebuilt. A rebuild that FAILED is not a clean build either (dotnet missing after a restart, a compile error), and the
  // marker is the only record that build/ may hold the mutation, so it stays: the next run reads "already undone" and tries the build again.
  //
  // ONLY A MUTATION THAT COULD REACH build/ is rebuilt for (`m.rebuild`, written with the marker; a marker without the field is treated as one that could). A docs or script
  // mutation cannot, and the forced build used to wedge it: a failed `npm run build` (dotnet missing after a restart) refused every later run over a file that was already back
  // (review 4, 2026-11-04). The refusal carries the build's own failure, so it can be told from a build that merely printed too much.
  const rebuilds = rebuild && !m.restoreCmd && m.rebuild !== false
  const rebuildFailed = () => `\`npm run build\` failed${lastFailure ? ` (${lastFailure})` : ''}, so build/ may still hold the mutation. Run it by hand, then run this again. The marker stays until a build succeeds.`
  if (outcome === 'clear') {
    log(`\n  Nothing to heal: [${m.id}] was already undone (the run was killed after its restore, before it dropped its marker).`)
    if (rebuilds && !probes.exec('npm run build')) return stop(`names [${m.id}], which was already undone, but ${rebuildFailed()}`, false)
    dropState(dir)
    return true
  }

  log(`\n  HEALED: a previous run was killed with [${m.id}] still applied.`)
  if (m.restoreCmd) {
    probes.exec(m.restoreCmd, { STASH: m.stash })
    // The command is not trusted to have worked: `|| true` in a restore hides a stash a restart wiped.
    let back = false
    try { back = m.touched ? worldState(m.touched, probes.snapshot()) === 'undone' : sameSnapshot(m.before, probes.snapshot()) } catch { back = false }
    if (!back) return stop(`ran [${m.id}]'s restore command, but what it touched is not as it was before the mutation. The stash is ${m.stash}; compare \`git status\` with it.`)
    log('  Ran its restore command, and what the mutation touched is as it was before.')
  } else {
    writeFileSync(m.file, readFileSync(m.backup))
    healedFiles.add(resolve(m.file))
    log(`  Restored ${m.file} from its backup before measuring anything.`)
    // The stranded file is source more often than not, and every check below
    // reads build/ rather than src/. Healing the source and leaving the stale
    // build in place would reproduce the exact failure this is fixing.
    if (rebuilds && !probes.exec('npm run build')) return stop(`names [${m.id}]; ${m.file} is restored, but ${rebuildFailed()}`, false)
  }
  dropState(dir)
  return true
}
/** Remove a state directory's contents (the run lock is not among them: a heal runs while this process holds it) and then the directory, if that leaves it empty. */
const dropState = dir => {
  emptyEntries(dir)
  try { rmdirSync(dir) } catch { /* the run lock is still in it */ }
}

/**
 * The run lock of a state directory: stop if the run it names is still going, remove it if that run is gone.
 * (A lock left by a killed run is stale; a marker left beside it is healed by healAt.)
 */
const checkLockAt = (dir, { probes = healProbes, exit = process.exit, log = console.log } = {}) => {
  const lockFile = join(dir, 'run.json')
  if (!existsSync(lockFile)) return
  let held = null
  try { held = JSON.parse(readFileSync(lockFile, 'utf8')) } catch { held = null }
  if (held !== null && probes.live(held)) {
    log(`::error::${lockFile} names pid ${held.pid}, which is still running: a mutation run is IN PROGRESS here. A second one would read its mutated file as its own original, so this one stops. Nothing was touched. Wait for pid ${held.pid} to finish, or stop it (kill -9 if it ignores a plain kill), then run this again.`)
    exit(1)
    return
  }
  rmSync(lockFile, { force: true })
}
/** Both run locks of a state directory: the run's own, and the one a harness run inside it would hold. */
const checkLocks = (dir, options) => {
  checkLockAt(dir, options)
  checkLockAt(join(dir, 'nested'), options)
}

// A harness run inside a harness run keeps its state in a directory of its own (see childEnv); if its parent was killed
// while it had a mutation applied, that is where the evidence is, and the parent's heal must look there too, first.
// This is the heal itself, for a directory whose run lock (if there is one) is already this process's: the main flow takes the lock BEFORE it heals, because a heal
// is the longest phase of a start (a source restore ends in a full compile) and a second run starting during it found no lock to refuse.
const healHeld = (dir, options) => {
  const nested = healAt(join(dir, 'nested'), options)
  return healAt(dir, options) || nested
}
const healIn = (dir, options) => {
  checkLocks(dir, options)
  return healHeld(dir, options)
}

// --- a build driver a dead run left behind -----------------------------------------------------------------------------------------
/** Write down who started the watcher, in one synchronous write. */
const recordDriver = pid => {
  mkdirSync(stateDir, { recursive: true })
  // One write. A SIGKILL between the open and the write leaves an empty file, which the next run reads as a record that names nothing and says so (reapDriver).
  writeFileSync(driverFile, JSON.stringify({ run: identity(), driver: { pid, start: startOf(pid) } }))
}
/** Stop the watcher (it has been sent its signal) and forget it. */
const stopBuilder = () => {
  if (!builder) return
  builder.stop()
  rmSync(driverFile, { force: true })
  try { rmdirSync(stateDir) } catch { /* the run lock or a marker is still in it */ }
}
/**
 * The build driver a run that is dead left running. A SIGKILL runs no handler, so `dotnet fable watch` is still there, writing build/, with nothing to say so (measured
 * 2026-11-05 on the real Fable 5.13.0: parent pid 1, the compiler under it at about 490 MB). The run that started it recorded the group in driver.json; the next run stops it
 * BEFORE it starts a driver of its own.
 *
 * Only the recorded run's death makes it an orphan (a live run's driver is that run's), and a pid that now holds a different process (another start time) is not ours.
 * The group is signalled, not the pid: `dotnet` starts the compiler as a child and a signal to the parent alone can leave it. TERM first, KILL if it persists.
 * Returns true if it stopped one, because the compile it cut off may have left build/ half written.
 */
const reapDriver = async (dir, { probes = healProbes, log = console.log, kill = process.kill, alive = groupAlive, stat = statOf, graceMs = 10_000, killMs = 2000, exit = process.exit } = {}) => {
  const file = join(dir, 'driver.json')
  if (!existsSync(file)) return false
  let rec = null
  try { rec = JSON.parse(readFileSync(file, 'utf8')) } catch { rec = null }
  const d = rec?.driver
  // `kill(-1)` signals every process the user may signal, and pid 0 is this run's own group: a record that names either is not a record of a watcher.
  if (!d || !Number.isInteger(d.pid) || d.pid <= 1) {
    log(`::warning::${file} does not name a build driver (it does not parse, or names no process), so a watcher it was meant to record may still be running. Look for \`dotnet fable watch\` and stop it.`)
    rmSync(file, { force: true })
    return false
  }
  if (rec.run && probes.live(rec.run)) return false
  const s = stat(d.pid)
  // (A zombie needs no clause of its own here: a zombie of the recorded host keeps its start time, and while any process of the group lives its id cannot be handed to another process.)
  const recycled = s !== null && d.start !== undefined && d.start !== null && String(d.start) !== s.start
  if (recycled || !alive(d.pid)) { rmSync(file, { force: true }); return false }
  const gone = async ms => { for (let waited = 0; waited < ms && alive(d.pid); waited += 50) await new Promise(r => setTimeout(r, 50)); return !alive(d.pid) }
  log(`\n  A previous run was killed with its build driver still running (process group ${d.pid}). Stopping it before this run starts one of its own.`)
  try { kill(-d.pid, 'SIGTERM') } catch { /* gone between the check and the signal */ }
  if (!(await gone(graceMs))) {
    try { kill(-d.pid, 'SIGKILL') } catch { /* same */ }
    if (!(await gone(killMs))) { log(`::error::${file} names process group ${d.pid}, a build driver of a run that is dead, and it did not stop. Two drivers would write one build/. Stop it by hand, then run this again.`); exit(1); return false }
  }
  rmSync(file, { force: true })
  return true
}

const { check, summarize } = createChecks()

// `--self-test` proves the heal path itself, and nothing else. It is a third
// half of the gate's mutation row for the same reason the row already has a
// second: a harness that cannot recover from being killed will one day report
// something untrue about a tree nobody meant to create, and that is not
// something the normal suite would ever notice about itself.
//
// Deliberately operates on throwaway files in tmp, never on real source, and in a state
// directory of its own, never the real one (see stateDir). The bug being guarded against
// is one that damages the working tree; a self-test that damaged the working tree, or
// deleted the evidence a killed run left, to prove it would be its own worst example.
if (process.argv.includes('--self-test')) {
  console.log('\nHeal self-test\n')
  // The scratch repositories below are made and committed to with git, and git does not start from nothing. Run from a hook (the pre-commit hook runs this through
  // `check:mutation-anchors`) it carries GIT_DIR / GIT_INDEX_FILE for the repository BEING COMMITTED (absolute in a linked worktree and in `git commit -a`), and those send
  // `git init` / `git add -A` / `git commit` at that repository: core.bare=true, the identity overwritten, the index replaced by the scratch repository's (reproduced in review 4,
  // 2026-11-04). A developer's own configuration is the same kind of input: commit.gpgsign dies at the first scratch commit, core.hooksPath runs a hook inside it, core.autocrlf
  // rewrites the fixtures. None of it is read here. (GIT_CONFIG_NOSYSTEM is not exercised by a clause: a system config file cannot be planted without privileges.)
  for (const k of Object.keys(process.env)) if (/^GIT_/.test(k)) delete process.env[k]
  process.env.GIT_CONFIG_GLOBAL = '/dev/null'
  process.env.GIT_CONFIG_NOSYSTEM = '1'
  // A killed run's mutation of THIS FILE makes most of the clauses below fail, and the failures name the harness, not the killed run. Say what is stranded and how to
  // heal it, before the clauses, so the report points at the cause. (The self-test itself never heals: it works in a directory of its own.)
  {
    const real = process.env.MUTATION_STATE_DIR || '.mutation-state'
    // The second place a stranded marker is: a harness run inside a harness run keeps its state in `nested`, and a child killed with a mutation applied leaves it there (`--stranded` looks there too).
    for (const file of [join(real, 'active.json'), join(real, 'nested', 'active.json')]) {
      let stranded = null
      try { stranded = JSON.parse(readFileSync(file, 'utf8')) } catch { stranded = null }
      if (stranded !== null) console.log(`::warning::${file} is a mutation a killed run left applied ([${stranded.id ?? 'unknown'}] on ${stranded.file ?? 'the tree'}). This self-test does not touch it, and clauses below may fail because of it. Heal it first: node scripts/mutation-check.mjs --heal`)
    }
  }

  // Every scenario below runs the real planHeal() and healAt() in a temp directory of its own, with the process check, the tree snapshot
  // and the commands replaced by fakes where a scenario needs them: nothing reads the working tree, writes outside tmp, or builds.
  // The last group starts the REAL script in a scratch git repository and ends it in the ways a handler cannot catch.
  // Test-only fault (E25): a crash before the scratch directory exists, the window in which the state directory's removal used to be unregistered (it was registered after the scratch directory was made).
  if (MUTATION_FAULT === 'self-test-crashes-early') throw new Error('MUTATION_FAULT=self-test-crashes-early')
  const scratch = mkdtempSync(join(tmpdir(), 'heal-selftest-'))
  // A crash ends in the uncaughtException handler's process.exit, and exit runs this: the scratch directory does not outlive it (the state directory's removal is registered where that directory is made,
  // above). A normal end removes it already, at the end of the file's own cleanup; removing twice with `force` is harmless. Not in restore(): the self-test calls that itself, part-way, and would lose its
  // scratch. (A SIGKILL cannot be covered.)
  process.on('exit', () => rmSync(scratch, { recursive: true, force: true }))

  // A MUTATION IS ITS TEXT. `String.prototype.replace` reads `$'`, `` $` ``, `$&` and `$$` in a replacement STRING as the text after the match, the text before it, the match and a dollar sign, so an entry whose replace holds
  // one was applied as something else: `lineups-two-prefix-characters-unread` holds `'$'`, which is `$'`, and the harness wrote the rest of the file into the middle of its own source (a syntax error, 16,106 characters
  // longer than the entry says; found by review 6, 2026-11-05, by applying all 772 anchored entries both ways: it was the only one of them that differed). It was CAUGHT, because no command can load a file that does not parse,
  // and it would have stayed CAUGHT with the code it was written to defend deleted. Each text goes through a scratch file and the bytes that come back are compared with the replace written after the rest of the source, which
  // is the expected text built without `replace`.
  {
    const DOLLARS = ["'$'", "$'", '$&', '$$', '$`', '$1', '$<x>', "a $' b $& c $$ d $` e"]
    const TEXT = 'const a = 1\nconst b = 2\n'
    const FIND = 'const a'
    const file = join(scratch, 'dollars.txt')
    const wrong = []
    for (const r of DOLLARS) {
      writeFileSync(file, TEXT)
      writeFileSync(file, applyMutation(readFileSync(file, 'utf8'), { file, find: FIND, replace: r }))
      const got = readFileSync(file, 'utf8')
      const want = r + TEXT.slice(FIND.length)
      if (got !== want) wrong.push(`${JSON.stringify(r)}: ${JSON.stringify(got.slice(0, 60))}`)
    }
    check(`A REPLACEMENT IS APPLIED AS WRITTEN, whatever dollar sequence it holds (${DOLLARS.length} texts: \`$'\`, \`$&\`, \`$$\`, a backtick one, \`$1\`, \`$<x>\`, \`'$'\` and a mix, each through a scratch file and compared byte for byte; NOT COVERED: the anchored entries one by one, which all go through the one line this tests)`,
      wrong.length === 0, `${wrong.length} of ${DOLLARS.length} applied as something else: ${wrong.slice(0, 3).join(' / ')}`)
  }

  let caseNo = 0
  const DEAD = { pid: 2 ** 30, start: '1', startedAt: '2026-10-20T20:00:00.000Z' }
  // Where /proc cannot say when a process started, a recycled pid cannot be told from the run: the signal's answer stands (run-marker.mjs),
  // and the clauses that need the difference are not asserted rather than failed.
  const haveProc = startOf(process.pid) !== null
  const read = p => (existsSync(p) ? readFileSync(p, 'utf8') : '<missing>')
  const said = []
  const stops = []
  const options = (probes, rebuild = false) => ({ rebuild, probes: { ...healProbes, ...probes }, exit: code => { stops.push(code); throw new Error('exit') }, log: t => said.push(t) })
  // exit() throws, so a refusal can be seen and the scenario goes on; the lines heal prints are kept, not shown (an `::error::` line in a
  // passing self-test would be an annotation on a green run).
  const attempt = (state, probes = {}, rebuild = false) => {
    stops.length = 0
    said.length = 0
    try {
      const r = healAt(state, options(probes, rebuild))
      return { returned: r, code: null, said: said.join('\n') }
    } catch (e) {
      // Anything but the stop is a failure of THIS scenario, reported as one, not an exception that ends the self-test and hides the rest.
      return { returned: null, code: e.message === 'exit' ? stops[0] : null, said: said.join('\n'), threw: e.message === 'exit' ? null : e.message }
    }
  }
  // A refusal is judged by its reason as well as its exit code: a stop for the wrong reason is a different bug.
  const stoppedFor = (r, re) => r.code === 1 && re.test(r.said)
  // A source marker over a victim file and its backup. `strip` removes fields to make a marker of an older shape.
  const source = ({ victim, backupText, original = 'ORIGINAL', mutated = 'MUTATED', over = {}, strip = [] }) => {
    const dir = join(scratch, `case-${++caseNo}`)
    const state = join(dir, 'state')
    mkdirSync(state, { recursive: true })
    const file = join(dir, 'victim.txt')
    const backup = join(dir, 'backup.txt')
    if (victim !== null) writeFileSync(file, victim)
    if (backupText !== null) writeFileSync(backup, backupText)
    const body = { id: 'selftest', file, backup, originalSha: sha(original), mutatedSha: sha(mutated), ...DEAD, ...over }
    for (const k of strip) delete body[k]
    writeFileSync(join(state, 'active.json'), JSON.stringify(body))
    return { file, state, kept: () => existsSync(join(state, 'active.json')) }
  }

  const killed = source({ victim: 'MUTATED', backupText: 'ORIGINAL' })
  const healedKilled = attempt(killed.state)
  check('an abandoned mutation is detected', healedKilled.returned === true,
    'the marker was on disk and heal() reported nothing to do')
  check('the abandoned file is restored from its backup', read(killed.file) === 'ORIGINAL',
    `the file still reads ${JSON.stringify(read(killed.file))}`)
  check('the marker is cleared, so the next run does not heal twice',
    !killed.kept(), 'the marker is still on disk after healing')
  check('a clean tree reports nothing to heal', attempt(join(scratch, 'no-such-state')).returned === false,
    'heal() claimed to heal a tree with no marker — it would fire on every run')

  const moved = source({ victim: 'NEWER CONTENT, written after the kill', backupText: 'ORIGINAL' })
  const movedRun = attempt(moved.state)
  check('A STALE MARKER OVER A FILE THAT HAS MOVED ON OVERWRITES NOTHING: it stops, the file is untouched, the state is kept',
    stoppedFor(movedRun, /neither the original nor the mutation/) && read(moved.file) === 'NEWER CONTENT, written after the kill' && moved.kept(),
    `exit ${movedRun.code}, file reads ${JSON.stringify(read(moved.file))}, marker kept ${moved.kept()}`)
  check('...and a refusal that leaves state behind says how to clear it', /delete .* to clear this/.test(movedRun.said), movedRun.said)
  // An edit made after the kill is a person's work whether or not the backup survived: judged before the backup, it is `diverged`, not `lost` ("damage").
  const movedNoBackup = source({ victim: 'NEWER CONTENT, written after the kill', backupText: null })
  const movedNoBackupRun = attempt(movedNoBackup.state)
  check('AN EDIT MADE AFTER THE KILL IS NOT CALLED DAMAGE WHEN THE BACKUP IS ALSO GONE: it is diverged, the file is untouched, and the message says the backup is gone too',
    stoppedFor(movedNoBackupRun, /neither the original nor the mutation/) && /also gone or is not the original/.test(movedNoBackupRun.said) && read(movedNoBackup.file) === 'NEWER CONTENT, written after the kill' && movedNoBackup.kept(),
    `exit ${movedNoBackupRun.code}; ${movedNoBackupRun.said.slice(0, 200)}; file ${JSON.stringify(read(movedNoBackup.file))}`)

  const undone = source({ victim: 'ORIGINAL', backupText: 'NOT THE ORIGINAL, AND NOT NEEDED' })
  const undoneBuilds = []
  const undoneRun = attempt(undone.state, { exec: cmd => { undoneBuilds.push(cmd); return true } }, true)
  check('a run killed AFTER its restore has nothing healed: no write, the state is dropped, even with a damaged backup',
    undoneRun.returned === true && read(undone.file) === 'ORIGINAL' && !undone.kept(),
    `returned ${undoneRun.returned}, file reads ${JSON.stringify(read(undone.file))}, marker kept ${undone.kept()}`)
  const restoredBuilds = []
  const stranded = source({ victim: 'MUTATED', backupText: 'ORIGINAL' })
  attempt(stranded.state, { exec: cmd => { restoredBuilds.push(cmd); return true } }, true)
  check('A SOURCE RESTORE IS FOLLOWED BY A REBUILD, AND SO IS "ALREADY UNDONE": a kill between the file going back and the build going back leaves the file right and build/ holding the mutation',
    restoredBuilds.join() === 'npm run build' && undoneBuilds.join() === 'npm run build',
    `after a restore: [${restoredBuilds}], after "already undone": [${undoneBuilds}]`)

  // The marker is the only record that build/ may hold the mutation, so a rebuild that FAILED does not drop it: the next run reads "already undone" and builds again.
  const failedRestore = source({ victim: 'MUTATED', backupText: 'ORIGINAL' })
  const failedRestoreRun = attempt(failedRestore.state, { exec: () => false }, true)
  const failedRestoreKept = failedRestore.kept()
  const failedClear = source({ victim: 'ORIGINAL', backupText: 'ORIGINAL' })
  const failedClearRun = attempt(failedClear.state, { exec: () => false }, true)
  const retriedBuild = attempt(failedRestore.state, { exec: () => true }, true)
  check('A REBUILD THAT FAILED IS NOT CALLED HEALED, after a restore or after "already undone": the run stops, the marker is kept, and the next run builds again and drops it',
    stoppedFor(failedRestoreRun, /npm run build. failed/) && read(failedRestore.file) === 'ORIGINAL' && failedRestoreKept && /Run it by hand/.test(failedRestoreRun.said) && !/delete .* to clear this/.test(failedRestoreRun.said)
      && stoppedFor(failedClearRun, /npm run build. failed/) && failedClear.kept() && !/delete .* to clear this/.test(failedClearRun.said)
      && retriedBuild.returned === true && !failedRestore.kept(),
    `after a restore: exit ${failedRestoreRun.code}, marker kept ${failedRestoreKept}; after "already undone": exit ${failedClearRun.code}, marker kept ${failedClear.kept()}; next run returned ${retriedBuild.returned}`)

  // Only a mutation that could reach build/ is rebuilt for. A docs or script mutation cannot, and a build that fails used to refuse every later run over a file that was already back.
  const docsRestored = source({ victim: 'MUTATED', backupText: 'ORIGINAL', over: { rebuild: false } })
  const docsRestoredBuilds = []
  const docsRestoredRun = attempt(docsRestored.state, { exec: cmd => { docsRestoredBuilds.push(cmd); return false } }, true)
  const docsUndone = source({ victim: 'ORIGINAL', backupText: 'ORIGINAL', over: { rebuild: false } })
  const docsUndoneBuilds = []
  const docsUndoneRun = attempt(docsUndone.state, { exec: cmd => { docsUndoneBuilds.push(cmd); return false } }, true)
  check('A MUTATION THAT COULD NOT REACH build/ IS HEALED WITHOUT A BUILD, so a build that fails cannot hold it: restored or already undone, the file is right, no build was started, the state is dropped',
    docsRestoredRun.returned === true && read(docsRestored.file) === 'ORIGINAL' && !docsRestored.kept() && docsRestoredBuilds.length === 0
      && docsUndoneRun.returned === true && !docsUndone.kept() && docsUndoneBuilds.length === 0,
    `restored: returned ${docsRestoredRun.returned}, builds [${docsRestoredBuilds}], kept ${docsRestored.kept()}; undone: returned ${docsUndoneRun.returned}, builds [${docsUndoneBuilds}], kept ${docsUndone.kept()}`)
  const reachable = sourceMarker({ id: 'x', file: 'f' }, 'b', 'A', 'B', true)
  const unreachable = sourceMarker({ id: 'x', file: 'f' }, 'b', 'A', 'B', false)
  check('a source marker records whether the mutation could reach build/, for the run that heals it',
    reachable.rebuild === true && unreachable.rebuild === false, JSON.stringify({ reachable: reachable.rebuild, unreachable: unreachable.rebuild }))

  const noBackup = source({ victim: 'MUTATED', backupText: null })
  const wrongBackup = source({ victim: 'MUTATED', backupText: 'SOMETHING ELSE' })
  const lostRuns = [noBackup, wrongBackup].map(c => ({ c, r: attempt(c.state) }))
  check('A BACKUP THAT IS GONE, OR IS NOT THE ORIGINAL, IS NOT WRITTEN: the run stops, the file is untouched, the state is kept',
    lostRuns.every(({ c, r }) => stoppedFor(r, /backup is gone or is not the original/) && read(c.file) === 'MUTATED' && c.kept()),
    lostRuns.map(({ c, r }) => `exit ${r.code} file ${JSON.stringify(read(c.file))} kept ${c.kept()}`).join(' / '))

  const live = source({ victim: 'MUTATED', backupText: 'ORIGINAL', over: { pid: process.pid, start: startOf(process.pid) } })
  const liveRun = attempt(live.state)
  check('A RUN STILL GOING IS NOT HEALED UNDER: its marker stops this run, and the file is untouched',
    stoppedFor(liveRun, /still running/) && read(live.file) === 'MUTATED' && live.kept(),
    `exit ${liveRun.code}, file ${JSON.stringify(read(live.file))}, marker kept ${live.kept()}`)
  // A refusal on a live run says to wait, not to delete the state directory: the run that owns it is still using it.
  check('...and says to wait for it, not to delete its state',
    /Wait for pid \d+/.test(liveRun.said) && !/delete .* to clear this/.test(liveRun.said), liveRun.said)
  // ...and how to make it stop, in the order that does the least damage: kill -9 orphans the dead run's children (its build), so it is for a run that ignores a plain kill.
  check('...and says how to stop it: a plain kill first, kill -9 if that is ignored',
    /stop it \(kill -9 if it ignores a plain kill\)/.test(liveRun.said), liveRun.said)
  const recycled = source({ victim: 'MUTATED', backupText: 'ORIGINAL', over: { pid: process.pid, start: '1' } })
  const recycledRun = attempt(recycled.state)
  check('...but a pid that another process now holds is not that run: the marker is judged by the file and healed (where /proc can say so)',
    haveProc ? (recycledRun.returned === true && read(recycled.file) === 'ORIGINAL') : stoppedFor(recycledRun, /still running/),
    `returned ${recycledRun.returned}, code ${recycledRun.code}, file ${JSON.stringify(read(recycled.file))}`)

  const legacy = source({ victim: 'MUTATED', backupText: 'ORIGINAL', strip: ['originalSha', 'mutatedSha', 'pid', 'start', 'startedAt'] })
  const legacyRun = attempt(legacy.state)
  check('A MARKER OF THE OLD SHAPE, WITH NO HASHES, CANNOT BE CHECKED AND IS NOT APPLIED: the run stops, nothing is written',
    stoppedFor(legacyRun, /before markers recorded/) && read(legacy.file) === 'MUTATED' && legacy.kept(), `exit ${legacyRun.code}, file ${JSON.stringify(read(legacy.file))}`)
  const garbage = source({ victim: 'MUTATED', backupText: 'ORIGINAL' })
  writeFileSync(join(garbage.state, 'active.json'), '{not json')
  const garbageRun = attempt(garbage.state)
  check('a marker that does not parse stops the run with the state kept, not a stack trace',
    stoppedFor(garbageRun, /not a marker this harness wrote/) && garbage.kept(), `exit ${garbageRun.code}, marker kept ${garbage.kept()}`)

  // A mutation made outside the source: judged by the paths it touched (content hashes), restored through the command, and READ BACK. Nothing
  // else in the tree is judged. The fake tree is a snapshot; its exec restores it to `before` (or, for the broken restore, does nothing).
  const BEFORE = { 'out/a.md': 'h-a', 'out/b.md': 'h-b' }
  const TOUCHED = { 'out/a.md': { before: 'h-a', after: null } }
  const worldCase = (over = {}) => {
    const dir = join(scratch, `case-${++caseNo}`)
    const state = join(dir, 'state')
    mkdirSync(state, { recursive: true })
    writeFileSync(join(state, 'active.json'), JSON.stringify({ id: 'world-selftest', restoreCmd: 'RESTORE', stash: '/stash/here', before: BEFORE, touched: TOUCHED, ...DEAD, ...over }))
    return { state, kept: () => existsSync(join(state, 'active.json')) }
  }
  const fakeTree = (snap, { restores = true } = {}) => {
    const t = { snap, calls: [] }
    t.probes = { snapshot: () => t.snap, exec: (cmd, env) => { t.calls.push([cmd, env]); if (restores) t.snap = { ...BEFORE }; return true } }
    return t
  }
  const aGone = { 'out/b.md': 'h-b' }
  const wApplied = fakeTree({ ...aGone }); const w1 = worldCase(); const w1r = attempt(w1.state, wApplied.probes)
  check('a world mutation left as the mutation made it is restored, with its stash handed over, and the state is dropped',
    w1r.returned === true && wApplied.calls.length === 1 && wApplied.calls[0][0] === 'RESTORE' && wApplied.calls[0][1].STASH === '/stash/here' && !w1.kept(),
    `returned ${w1r.returned}, calls ${JSON.stringify(wApplied.calls)}, marker kept ${w1.kept()}`)
  const wUnrelated = fakeTree({ ...aGone, 'docs/someone-elses.md': 'h-x' }); const w1b = worldCase(); const w1br = attempt(w1b.state, wUnrelated.probes)
  check('A CHANGE ELSEWHERE IN THE TREE IS NOBODY\'S BUSINESS: a path the mutation did not touch changing after the kill does not stop the heal',
    w1br.returned === true && wUnrelated.calls.length === 1, `returned ${w1br.returned}, exit ${w1br.code}, calls ${wUnrelated.calls.length}`)
  const wEdited = fakeTree({ ...aGone, 'out/a.md': 'h-edited-by-a-person' }); const w2 = worldCase(); const w2r = attempt(w2.state, wEdited.probes)
  check('A PATH THE MUTATION TOUCHED, EDITED AFTER THE KILL, IS NOT RESTORED OVER: the command is not run, the state is kept',
    stoppedFor(w2r, /neither as it was nor as the mutation left it/) && wEdited.calls.length === 0 && w2.kept(), `exit ${w2r.code}, calls ${wEdited.calls.length}, marker kept ${w2.kept()}`)
  // The refusal names the path that moved, and does not hand over the command that would copy the stash over it.
  check('...and the refusal NAMES the path that was edited, and does not offer the restore command that would overwrite it',
    /out\/a\.md/.test(w2r.said) && !/sh -c/.test(w2r.said) && !/RESTORE/.test(w2r.said), w2r.said)
  // ...and says what is true of it: it changed after the kill, with no word about HEAD (HEAD did not move here; the HEAD-moved wording is for a path that matches HEAD).
  check('...and says the path changed after the kill, and does not blame HEAD',
    /it changed after the kill/.test(w2r.said) && !/HEAD/.test(w2r.said), w2r.said)
  // At most six paths are named and the rest counted, so a mutation that touched many does not print the tree. Each side of the bound: eight edited paths read as the first six and
  // "and 2 more" (not the seventh), exactly six read as the six and no count.
  const editedRun = n => {
    const touched = Object.fromEntries(Array.from({ length: n }, (_, i) => [`out/p${i}.md`, { before: `h${i}`, after: null }]))
    const c = worldCase({ touched, before: Object.fromEntries(Object.keys(touched).map((k, i) => [k, `h${i}`])) })
    return attempt(c.state, fakeTree(Object.fromEntries(Object.keys(touched).map(k => [k, 'edited']))).probes)
  }
  const SIX = Array.from({ length: 6 }, (_, i) => `out/p${i}.md`).join(', ')
  const wEightRun = editedRun(8)
  const wSevenRun = editedRun(7)
  const wSixRun = editedRun(6)
  check('THE REFUSAL NAMES SIX PATHS AND COUNTS THE REST: of 8 edited paths it lists the first six and "and 2 more" and not the seventh; of 7 the first six and "and 1 more" (the seventh is counted, not dropped); of exactly 6 it lists the six and no count (3 sizes)',
    wEightRun.code === 1 && wEightRun.said.includes(`(${SIX}, and 2 more)`) && !wEightRun.said.includes('out/p6.md')
      && wSevenRun.code === 1 && wSevenRun.said.includes(`(${SIX}, and 1 more)`) && !wSevenRun.said.includes('out/p6.md')
      && wSixRun.code === 1 && wSixRun.said.includes(`(${SIX})`) && !/and \d+ more/.test(wSixRun.said),
    `8 paths: ${wEightRun.said.slice(0, 260)} / 7 paths: ${wSevenRun.said.slice(0, 260)} / 6 paths: ${wSixRun.said.slice(0, 260)}`)
  const wBroken = fakeTree({ ...aGone }, { restores: false }); const w3 = worldCase(); const w3r = attempt(w3.state, wBroken.probes)
  check('A RESTORE THAT RAN BUT DID NOT RETURN WHAT IT TOUCHED IS NOT CALLED HEALED: the run stops and the state is kept for the stash',
    stoppedFor(w3r, /not as it was before the mutation/) && wBroken.calls.length === 1 && w3.kept(), `exit ${w3r.code}, calls ${wBroken.calls.length}, marker kept ${w3.kept()}`)
  const wBefore = fakeTree({ ...BEFORE }); const w4 = worldCase(); const w4r = attempt(w4.state, wBefore.probes)
  check('a world mutation already undone runs nothing and drops the state',
    w4r.returned === true && wBefore.calls.length === 0 && !w4.kept(), `returned ${w4r.returned}, calls ${wBefore.calls.length}`)
  const TWO = { 'out/a.md': { before: 'h-a', after: null }, 'out/b.md': { before: 'h-b', after: null } }
  const wMixed = fakeTree({ 'out/a.md': 'h-a' }); const w5m = worldCase({ touched: TWO }); const w5mr = attempt(w5m.state, wMixed.probes)
  check('a restore the kill cut short (some paths back, some not) is finished: the commands are written to be run again',
    w5mr.returned === true && wMixed.calls.length === 1, `returned ${w5mr.returned}, exit ${w5mr.code}, calls ${wMixed.calls.length}`)
  const wNoTouched = fakeTree({ ...BEFORE }); const w5a = worldCase({ touched: undefined }); const w5ar = attempt(w5a.state, wNoTouched.probes)
  const wNoTouchedMoved = fakeTree({ ...BEFORE, 'docs/x.md': 'h' }); const w5b = worldCase({ touched: undefined }); const w5br = attempt(w5b.state, wNoTouchedMoved.probes)
  check('a kill BEFORE the mutation was recorded as applied is not guessed at: the tree equal to what it was is nothing to do, anything else is left for a person',
    w5ar.returned === true && wNoTouched.calls.length === 0 && stoppedFor(w5br, /killed before it recorded which paths it touched/) && wNoTouchedMoved.calls.length === 0,
    `unchanged: returned ${w5ar.returned}; changed: exit ${w5br.code}, calls ${wNoTouchedMoved.calls.length}`)
  // ...and the message does not say a person changed it after the kill: the mutation itself is the likelier cause, and the stash holds the originals.
  check('...and its message does not blame the person: it says the mutation may have made the changes, and names the stash',
    /mutation itself may have made those changes/.test(w5br.said) && /\/stash\/here/.test(w5br.said) && !/changed after the kill/.test(w5br.said), w5br.said)
  // A marker with `touched: {}` records no path, and no run writes one (a mutation that touched nothing is stopped as a broken mutation before the marker is written), so it is hand-made
  // or corrupt. `{}` is truthy and counts zero paths as "all of them applied", which sent it to the restore command and then to a refusal that said the restore had failed. It is the
  // same as a marker with no list: the tree equal to what it was is nothing to do, and any other tree is for a person.
  const wEmptyTouched = fakeTree({ ...BEFORE }); const w5c = worldCase({ touched: {} }); const w5cr = attempt(w5c.state, wEmptyTouched.probes)
  const wEmptyTouchedMoved = fakeTree({ ...BEFORE, 'docs/x.md': 'h' }); const w5d = worldCase({ touched: {} }); const w5dr = attempt(w5d.state, wEmptyTouchedMoved.probes)
  check('A MARKER THAT RECORDS NO PATH (`touched: {}`) RUNS NO RESTORE COMMAND: over a tree equal to what it was nothing runs and the state is dropped; over any other tree the refusal is the one for a kill before the paths were recorded, nothing runs, and the state is kept',
    w5cr.returned === true && wEmptyTouched.calls.length === 0 && !w5c.kept() && stoppedFor(w5dr, /killed before it recorded which paths it touched/) && wEmptyTouchedMoved.calls.length === 0 && w5d.kept(),
    `equal: returned ${w5cr.returned}, exit ${w5cr.code}, calls ${wEmptyTouched.calls.length}, kept ${w5c.kept()}; moved: exit ${w5dr.code}, calls ${wEmptyTouchedMoved.calls.length}, kept ${w5d.kept()}; ${w5dr.said.slice(0, 160)}`)
  const wLive = fakeTree({ ...aGone }); const w6 = worldCase({ pid: process.pid, start: startOf(process.pid) }); const w6r = attempt(w6.state, wLive.probes)
  check('A WORLD MARKER WHOSE RUN IS STILL GOING STOPS THIS RUN TOO: nothing is restored under a live run',
    stoppedFor(w6r, /still running/) && wLive.calls.length === 0 && w6.kept() && /Wait for pid/.test(w6r.said) && !/delete .* to clear this/.test(w6r.said), `exit ${w6r.code}, calls ${wLive.calls.length}; ${w6r.said}`)

  // The read-back after a heal's restore: SOME paths back is not back (a `cp` that ran out of disk part-way), and the stash is the only copy of the rest.
  const wPartial = { snap: {}, calls: [] }
  wPartial.probes = { snapshot: () => wPartial.snap, exec: cmd => { wPartial.calls.push(cmd); wPartial.snap = { 'out/a.md': 'h-a' }; return true } }
  const w8 = worldCase({ touched: TWO }); const w8r = attempt(w8.state, wPartial.probes)
  check('A RESTORE THAT PUT BACK ONLY SOME OF WHAT THE MUTATION TOUCHED IS NOT CALLED HEALED: the run stops, and the state is kept for the stash',
    stoppedFor(w8r, /not as it was before the mutation/) && wPartial.calls.length === 1 && w8.kept(), `exit ${w8r.code}, calls ${wPartial.calls.length}, marker kept ${w8.kept()}`)
  // A tree that cannot be read is neither undone nor applied. "Nothing to heal" over it would delete the stash.
  const unreadableCalls = []
  const w9 = worldCase({}); const w9r = attempt(w9.state, { snapshot: () => { throw new Error('fatal: not a git repository') }, exec: cmd => { unreadableCalls.push(cmd); return true } })
  check('A TREE THAT CANNOT BE READ IS NOT "NOTHING TO HEAL": the run stops with the reason, runs nothing, and keeps the state',
    stoppedFor(w9r, /could not be checked against the tree \(fatal: not a git repository\)/) && unreadableCalls.length === 0 && w9.kept(), `exit ${w9r.code}, calls ${unreadableCalls.length}, kept ${w9.kept()}; ${w9r.said}`)
  // Healing a world mutation moves write-ups. It has no use for a build, and a build that fails must not hold them.
  const wBuild = fakeTree({ ...aGone }); const wBuildExec = wBuild.probes.exec
  wBuild.probes.exec = (cmd, env) => (cmd === 'npm run build' ? false : wBuildExec(cmd, env))
  const w10 = worldCase({}); const w10r = attempt(w10.state, wBuild.probes, true)
  check('HEALING A WORLD MUTATION RUNS NO BUILD, even where builds are on, so a build that fails cannot hold the write-ups: restored by its own command only, and the state is dropped',
    w10r.returned === true && wBuild.calls.length === 1 && wBuild.calls[0][0] === 'RESTORE' && !w10.kept(), `returned ${w10r.returned}, calls ${JSON.stringify(wBuild.calls.map(c => c[0]))}, kept ${w10.kept()}`)

  // HEAD moved since the kill. The snapshot lists only paths that differ from HEAD, so a stub that was COMMITTED reads exactly like a path that was put back, and
  // the heal said "already undone", deleted the stash, and left the stubs in HEAD (reproduced in review, 2026-11-04). With HEAD where it was, null is the original.
  const STUBBED = { 'out/a.md': { before: null, after: 'h-stub' } }
  const committed = fakeTree({}) // the stub is now what HEAD holds, so the path is not listed
  const wHeadMoved = worldCase({ touched: STUBBED, before: {}, head: 'old-head' })
  const wHeadMovedRun = attempt(wHeadMoved.state, { ...committed.probes, head: () => 'new-head' })
  const wHeadSame = worldCase({ touched: STUBBED, before: {}, head: 'old-head' })
  const wHeadSameRun = attempt(wHeadSame.state, { ...fakeTree({}).probes, head: () => 'old-head' })
  check('A STUB THAT WAS COMMITTED IS NOT "ALREADY UNDONE": with HEAD moved, a path that now matches HEAD is not taken for one put back, the stash is kept, and the message says HEAD moved',
    stoppedFor(wHeadMovedRun, /HEAD has moved since the kill/) && committed.calls.length === 0 && wHeadMoved.kept() && /out\/a\.md/.test(wHeadMovedRun.said),
    `exit ${wHeadMovedRun.code}, calls ${committed.calls.length}, kept ${wHeadMoved.kept()}; ${wHeadMovedRun.said.slice(0, 200)}`)
  check('...while with HEAD where it was, the same tree IS "already undone", and a marker that recorded no HEAD is judged as before',
    wHeadSameRun.returned === true && !wHeadSame.kept(), `exit ${wHeadSameRun.code}, returned ${wHeadSameRun.returned}, kept ${wHeadSame.kept()}`)
  // The same refusal does not say of a path that matches HEAD what it cannot know. Once HEAD has moved, a path the snapshot does not list matches HEAD, which is where a path put
  // back ends up as well as where a committed stub ends up; "neither as it was nor as the mutation left it ... it changed after the kill" is true of an edit and not of that (a tree
  // put back by hand, with HEAD moved on by an unrelated commit, was refused with it: residual Task 10 item 7, measured again 2026-11-05 on a scratch repository). A path that matches HEAD
  // and a path that was edited are each named under what is true of it.
  check('THE HEAD-MOVED REFUSAL DOES NOT CALL A PATH THAT MATCHES HEAD "NEITHER AS IT WAS NOR AS THE MUTATION LEFT IT": it says HEAD moved and the path matches HEAD, names the path, and keeps the state (1 path, 0 edited)',
    stoppedFor(wHeadMovedRun, /HEAD has moved since the kill and a path it touched now matches HEAD \(out\/a\.md\)/) && !/neither as it was nor as the mutation left it/.test(wHeadMovedRun.said) && wHeadMoved.kept(),
    wHeadMovedRun.said.slice(0, 300))
  const HEADS = { 'out/a.md': { before: null, after: 'h-stub' }, 'out/b.md': { before: 'h-b', after: 'h-b2' } }
  const wMixedHead = worldCase({ touched: HEADS, before: { 'out/b.md': 'h-b' }, head: 'old-head' })
  const wMixedHeadRun = attempt(wMixedHead.state, { ...fakeTree({ 'out/b.md': 'h-edited' }).probes, head: () => 'new-head' })
  const editedNamed = /neither as it was nor as the mutation left it \(([^)]*)\)/.exec(wMixedHeadRun.said)?.[1]
  const atHeadNamed = /now match(?:es)? HEAD \(([^)]*)\)/.exec(wMixedHeadRun.said)?.[1]
  check('...and where one path was edited and another matches HEAD, each is named under what is true of it: the edited one as changed after the kill, the other as matching HEAD (1 path each)',
    stoppedFor(wMixedHeadRun, /it changed after the kill/) && editedNamed === 'out/b.md' && atHeadNamed === 'out/a.md' && wMixedHead.kept(),
    `edited: ${editedNamed}; matches HEAD: ${atHeadNamed}; ${wMixedHeadRun.said.slice(0, 300)}`)
  // ...and only where HEAD HAS moved. With HEAD where it was, a touched path that now matches HEAD was put back to HEAD's version by a person (neither of the marker's two hashes), which is
  // an edit, and the refusal must not say that HEAD moved.
  const wSameHead = worldCase({ touched: { 'out/c.md': { before: 'h-c', after: 'h-c2' } }, before: { 'out/c.md': 'h-c' }, head: 'old-head' })
  const wSameHeadRun = attempt(wSameHead.state, { ...fakeTree({}).probes, head: () => 'old-head' })
  check('...and with HEAD where it was, a path that matches HEAD is an edit: the refusal says it changed after the kill and does not say HEAD moved',
    stoppedFor(wSameHeadRun, /\(out\/c\.md\): it changed after the kill/) && !/HEAD/.test(wSameHeadRun.said) && wSameHead.kept(), wSameHeadRun.said.slice(0, 300))
  // The one sentence that tells a person how to tell a path they put back from a stub that was committed: compare it with the stash. It is there only where a path matches a HEAD that moved, it names the
  // stash, and it agrees in number with the paths ("the one" for one, "each" for several), as do the sentences that list them. Nothing asserted any of it (a mutant that deleted the sentence, and one that swapped
  // "the one" and "each", both left the self-test green).
  const TWO_STUBBED = { 'out/a.md': { before: null, after: 'h-stub' }, 'out/b.md': { before: null, after: 'h-stub-b' } }
  const wTwoAtHead = worldCase({ touched: TWO_STUBBED, before: {}, head: 'old-head' })
  const wTwoAtHeadRun = attempt(wTwoAtHead.state, { ...fakeTree({}).probes, head: () => 'new-head' })
  check('THE HEAD-MOVED REFUSAL SAYS HOW TO TELL A PATH PUT BACK FROM A STUB THAT WAS COMMITTED, WHERE A PATH MATCHES HEAD AND NOWHERE ELSE, AND IN THE RIGHT NUMBER: "Compare the one that matches HEAD with <stash> to tell which it is" for one path, "each that matches HEAD" for two, no such sentence over an edit alone; the sentences that list the paths agree in number too (singular and plural, 4 phrases in 5 refusals)',
    /paths it touched now match HEAD \(out\/a\.md, out\/b\.md\)/.test(wTwoAtHeadRun.said) && /Nothing was run\. Compare each that matches HEAD with \/stash\/here to tell which it is\. Put back from /.test(wTwoAtHeadRun.said)
      && /a path it touched now matches HEAD \(out\/a\.md\)/.test(wHeadMovedRun.said) && /Nothing was run\. Compare the one that matches HEAD with \/stash\/here to tell which it is\. Put back from /.test(wHeadMovedRun.said)
      && /a path it touched is neither as it was nor as the mutation left it \(out\/b\.md\)/.test(wMixedHeadRun.said) && /Compare the one that matches HEAD with \/stash\/here to tell which it is\./.test(wMixedHeadRun.said)
      && /paths it touched are neither as it was nor as the mutation left it/.test(wEightRun.said) && /a path it touched is neither as it was nor as the mutation left it/.test(w2r.said)
      && !/Compare /.test(w2r.said) && !/Compare /.test(wEightRun.said) && !/Compare /.test(wSameHeadRun.said),
    [wTwoAtHeadRun, wHeadMovedRun, wMixedHeadRun, wEightRun, w2r, wSameHeadRun].map(r => r.said.slice(0, 100)).join(' / '))

  // A refusal over a non-empty stash must not tell a person to delete the directory the stash is in: an untracked write-up that was moved aside is not in `git status`.
  const wStashed = worldCase({})
  writeFileSync(join(wStashed.state, 'active.json'), '{not json')
  mkdirSync(join(wStashed.state, 'world', 'x'), { recursive: true })
  writeFileSync(join(wStashed.state, 'world', 'x', 'cc-session.md'), 'the only copy\n')
  const wStashedRun = attempt(wStashed.state)
  check('A REFUSAL OVER A STASH THAT HOLDS FILES DOES NOT SAY TO DELETE THE DIRECTORY: it says the originals are in the stash and to put them back first',
    stoppedFor(wStashedRun, /put it back first/) && !/delete .* to clear this/.test(wStashedRun.said) && existsSync(join(wStashed.state, 'world', 'x', 'cc-session.md')),
    wStashedRun.said)
  // ...and the same stash under a refusal that has JUST LISTED paths a person owns must not say "put it back first": the stash is a full copy, so that is an instruction to copy it over them
  // (measured 2026-11-05: the sentence after "its restore command would overwrite the ones listed" was "put it back first, because deleting the directory deletes the only copy"). What is true
  // there is to put back only the paths still as the mutation left them, and then to delete the state once what is still needed is out of the stash. Both shapes of "listed" are driven: a path
  // edited after the kill, and a path that matches a HEAD that moved.
  const stashFiles = state => { mkdirSync(join(state, 'world', 'x'), { recursive: true }); writeFileSync(join(state, 'world', 'x', 'out-a.md'), 'the only copy\n') }
  const wStashedEdit = worldCase({})
  stashFiles(wStashedEdit.state)
  const wStashedEditRun = attempt(wStashedEdit.state, fakeTree({ ...aGone, 'out/a.md': 'h-edited-by-a-person' }).probes)
  const wStashedHead = worldCase({ touched: STUBBED, before: {}, head: 'old-head' })
  stashFiles(wStashedHead.state)
  const wStashedHeadRun = attempt(wStashedHead.state, { ...fakeTree({}).probes, head: () => 'new-head' })
  const STATE_MAY_GO = /Then delete \S+ to clear this: it holds the only copy of what was moved aside, so take anything you still need out of \S+\/world first\./
  check('A REFUSAL THAT LISTS PATHS A PERSON OWNS DOES NOT SAY TO PUT THE STASH BACK FIRST: over a stash that holds files, after an edited path and after a path that matches a HEAD that moved (2 shapes), it says to delete the state once what is still needed is out of the stash, never "put it back first", and the stash and the state are kept',
    [wStashedEditRun, wStashedHeadRun].every(r => stoppedFor(r, STATE_MAY_GO) && !/put it back first/.test(r.said) && /only the paths that are still as the mutation left them/.test(r.said))
      && existsSync(join(wStashedEdit.state, 'world', 'x', 'out-a.md')) && wStashedEdit.kept() && existsSync(join(wStashedHead.state, 'world', 'x', 'out-a.md')) && wStashedHead.kept(),
    `edited: exit ${wStashedEditRun.code}, ${wStashedEditRun.said.slice(-230)} / matches HEAD: exit ${wStashedHeadRun.code}, ${wStashedHeadRun.said.slice(-230)}`)
  const wOld = fakeTree({ ...aGone }); const w7 = worldCase({ before: undefined }); const w7r = attempt(w7.state, wOld.probes)
  check('a world marker of the old shape (a digest, not the tree) cannot be checked and runs nothing',
    stoppedFor(w7r, /before markers recorded/) && wOld.calls.length === 0, `exit ${w7r.code}, calls ${wOld.calls.length}`)

  // The snapshot itself, on a scratch git repository: names AND content, so a tracked file already modified is seen to change again.
  const touchedDemo = touchedBy({ a: 'h1', b: 'h2', c: 'h3' }, { a: 'h1', b: 'h2x', d: 'h4' })
  check('touchedBy names exactly the paths whose content differs, with both values',
    JSON.stringify(Object.keys(touchedDemo).sort()) === JSON.stringify(['b', 'c', 'd']) && touchedDemo.b.before === 'h2' && touchedDemo.b.after === 'h2x' && touchedDemo.c.after === null && touchedDemo.d.before === null,
    JSON.stringify(touchedDemo))
  check('worldState: all as the mutation left them, all as they were, some of each, or somewhere else',
    worldState(TOUCHED, aGone) === 'applied' && worldState(TOUCHED, BEFORE) === 'undone' && worldState(TWO, { 'out/a.md': 'h-a' }) === 'mixed' && worldState(TOUCHED, { 'out/a.md': 'zzz' }) === 'other',
    'applied, undone, mixed, other')
  const snapRepo = join(scratch, `case-${++caseNo}`)
  mkdirSync(snapRepo)
  const inSnap = cmd => execSync(cmd, { cwd: snapRepo, stdio: 'pipe', encoding: 'utf8' })
  inSnap('git init -q && git config user.email t@t && git config user.name t')
  writeFileSync(join(snapRepo, 'tracked.txt'), 'v1\n')
  inSnap('git add -A && git commit -qm base')
  const snapNow = () => { const was = process.cwd(); process.chdir(snapRepo); try { return treeSnapshot() } finally { process.chdir(was) } }
  writeFileSync(join(snapRepo, 'tracked.txt'), 'v2\n')
  const snapOne = snapNow()
  writeFileSync(join(snapRepo, 'tracked.txt'), 'v3 (a later edit to a file that was already modified)\n')
  const snapTwo = snapNow()
  writeFileSync(join(snapRepo, 'fresh.txt'), 'untracked\n')
  const snapThree = snapNow()
  check('THE SNAPSHOT SEES A CONTENT CHANGE TO A TRACKED FILE THAT WAS ALREADY MODIFIED (the whole-tree digest did not), and an untracked file',
    snapOne['tracked.txt'] !== snapTwo['tracked.txt'] && !('fresh.txt' in snapTwo) && typeof snapThree['fresh.txt'] === 'string',
    JSON.stringify({ one: snapOne, two: snapTwo, three: snapThree }))

  // The markers the MAIN FLOW writes are the ones heal() must be able to read: built by the same functions, then healed.
  const roundTrip = (() => {
    const dir = join(scratch, `case-${++caseNo}`)
    mkdirSync(join(dir, 'state'), { recursive: true })
    const file = join(dir, 'victim.txt')
    const backup = join(dir, 'backup.txt')
    writeFileSync(backup, 'ORIGINAL')
    writeFileSync(file, 'MUTATED')
    const written = sourceMarker({ id: 'rt', file }, backup, 'ORIGINAL', 'MUTATED')
    writeFileSync(join(dir, 'state', 'active.json'), JSON.stringify({ ...written, pid: 2 ** 30 }))
    return { written, file, state: join(dir, 'state') }
  })()
  check('a source marker records who wrote it and what the file is before and after the mutation',
    roundTrip.written.pid === process.pid && roundTrip.written.start === startOf(process.pid)
      && roundTrip.written.originalSha === sha('ORIGINAL') && roundTrip.written.mutatedSha === sha('MUTATED'),
    JSON.stringify(roundTrip.written))
  const roundTripRun = attempt(roundTrip.state)
  check('...and a killed run\'s marker, as the main flow writes it, is healed by heal()',
    roundTripRun.returned === true && read(roundTrip.file) === 'ORIGINAL', `returned ${roundTripRun.returned}, file ${JSON.stringify(read(roundTrip.file))}`)
  const worldWritten = { ...worldMarkerOf({ id: 'rt-world', restore: 'RESTORE' }, '/stash/rt', BEFORE), touched: TOUCHED, pid: 2 ** 30 }
  const wRound = worldCase(worldWritten)
  const wRoundTree = fakeTree({ ...aGone }); const wRoundRun = attempt(wRound.state, wRoundTree.probes)
  check('a world marker records its stash and the tree before, and as the main flow writes it is healed through its restore command',
    worldWritten.stash === '/stash/rt' && sameSnapshot(worldWritten.before, BEFORE) && worldWritten.start === startOf(process.pid) && worldWritten.head === headOf()
      && wRoundRun.returned === true && wRoundTree.calls.length === 1 && wRoundTree.calls[0][0] === 'RESTORE',
    `returned ${wRoundRun.returned}, calls ${JSON.stringify(wRoundTree.calls)}`)

  // A harness run INSIDE a harness run keeps its state in the nested directory; if the parent was killed with that applied, heal() looks there.
  const nestedParent = join(scratch, `case-${++caseNo}`)
  const nestedAt = join(nestedParent, 'nested')
  mkdirSync(nestedAt, { recursive: true })
  const nestedFile = join(nestedParent, 'inner.txt'); const nestedBackup = join(nestedParent, 'inner.bak')
  writeFileSync(nestedFile, 'MUTATED'); writeFileSync(nestedBackup, 'ORIGINAL')
  writeFileSync(join(nestedAt, 'active.json'), JSON.stringify({ id: 'inner', file: nestedFile, backup: nestedBackup, originalSha: sha('ORIGINAL'), mutatedSha: sha('MUTATED'), ...DEAD }))
  const nestedHeal = (() => { stops.length = 0; said.length = 0; try { return healIn(nestedParent, options({})) } catch (e) { if (e.message !== 'exit') throw e; return null } })()
  check('A MUTATION APPLIED BY A NESTED HARNESS RUN IS HEALED TOO: the parent looks in its nested state directory first',
    nestedHeal === true && read(nestedFile) === 'ORIGINAL' && !existsSync(nestedAt), `returned ${nestedHeal}, file ${JSON.stringify(read(nestedFile))}`)
  // The ORDER matters when both touch ONE file. The child read the parent's mutated file as its own original, so its backup is the parent's mutation and the file now holds the child's change on top of it.
  // The child's heal puts the parent's mutation back; the parent's then puts the original back. Parent first, the file is neither of the parent's two hashes and its heal refuses (nothing else in this
  // self-test has a parent and a child on one file: the clause above uses two, and swapping the order left it green).
  const sameDir = join(scratch, `case-${++caseNo}`)
  const sameState = join(sameDir, 'state')
  const sameNested = join(sameState, 'nested')
  mkdirSync(sameNested, { recursive: true })
  const sameFile = join(sameDir, 'one.txt')
  writeFileSync(sameFile, 'CHILD ON PARENT'); writeFileSync(join(sameDir, 'parent.bak'), 'ORIGINAL'); writeFileSync(join(sameDir, 'child.bak'), 'PARENT MUTATION')
  writeFileSync(join(sameState, 'active.json'), JSON.stringify({ id: 'parent', file: sameFile, backup: join(sameDir, 'parent.bak'), originalSha: sha('ORIGINAL'), mutatedSha: sha('PARENT MUTATION'), ...DEAD }))
  writeFileSync(join(sameNested, 'active.json'), JSON.stringify({ id: 'child', file: sameFile, backup: join(sameDir, 'child.bak'), originalSha: sha('PARENT MUTATION'), mutatedSha: sha('CHILD ON PARENT'), ...DEAD }))
  const sameHeal = (() => { stops.length = 0; said.length = 0; try { return healIn(sameState, options({})) } catch (e) { if (e.message !== 'exit') throw e; return null } })()
  check('...AND WHEN A PARENT AND THE CHILD IT STARTED BOTH TOUCHED ONE FILE, THE CHILD IS HEALED FIRST: its change comes off the parent\'s mutation and then the parent\'s comes off the original, so the file ends as the original and both states are gone (1 file, 2 markers)',
    sameHeal === true && read(sameFile) === 'ORIGINAL' && !existsSync(sameState), `returned ${sameHeal}, file ${JSON.stringify(read(sameFile))}, state kept ${existsSync(sameState)}; ${said.join(' | ').slice(0, 200)}`)

  // One run at a time: a lock naming a run that is still going stops this one; one left by a run that is gone is cleared.
  const lockDir = join(scratch, `case-${++caseNo}`)
  mkdirSync(lockDir, { recursive: true })
  writeFileSync(join(lockDir, 'run.json'), JSON.stringify({ pid: process.pid, start: startOf(process.pid), startedAt: DEAD.startedAt }))
  stops.length = 0; said.length = 0
  const lockedOut = (() => { try { checkLockAt(lockDir, options({})); return false } catch (e) { if (e.message !== 'exit') throw e; return stops[0] === 1 && /IN PROGRESS/.test(said.join('\n')) } })()
  const lockRefusal = said.join('\n')
  writeFileSync(join(lockDir, 'run.json'), JSON.stringify(DEAD))
  stops.length = 0
  checkLockAt(lockDir, options({}))
  check('A RUN LOCK NAMING A RUN STILL GOING STOPS THIS ONE, and a stale one is cleared',
    lockedOut && stops.length === 0 && !existsSync(join(lockDir, 'run.json')), `refused a live holder: ${lockedOut}; stale lock gone: ${!existsSync(join(lockDir, 'run.json'))}`)
  check('...and its refusal says how to stop that run: a plain kill first, kill -9 if that is ignored',
    /stop it \(kill -9 if it ignores a plain kill\)/.test(lockRefusal), lockRefusal)

  // The lock a run takes for its whole life: exclusive, so two runs starting together cannot both hold it.
  mkdirSync(stateDir, { recursive: true })
  writeFileSync(runLock, JSON.stringify(DEAD))
  const refusedWhileHeld = acquireRunLock() === false && !ownsLock
  rmSync(runLock, { force: true })
  const tookIt = acquireRunLock() === true && ownsLock && JSON.parse(readFileSync(runLock, 'utf8')).pid === process.pid
  releaseRunLock()
  check('THE RUN LOCK IS EXCLUSIVE: a held lock is refused, a free one is taken in this process\'s name, and releasing it removes the file',
    refusedWhileHeld && tookIt && !existsSync(runLock), `refused while held ${refusedWhileHeld}, took a free one ${tookIt}, file gone after release ${!existsSync(runLock)}`)

  // The state a run wrote is checked after every expectation: marker as written, lock naming this process.
  mkdirSync(stateDir, { recursive: true })
  const wrote = JSON.stringify({ id: 'x', n: 1 })
  writeFileSync(marker, wrote)
  writeFileSync(runLock, JSON.stringify({ pid: process.pid }))
  const intactAsWritten = stateIntact(wrote)
  writeFileSync(marker, JSON.stringify({ id: 'x', n: 2 }))
  const markerChanged = !stateIntact(wrote)
  writeFileSync(marker, wrote)
  writeFileSync(runLock, JSON.stringify({ pid: process.pid + 1 }))
  const lockNotOurs = !stateIntact(wrote)
  rmSync(runLock, { force: true })
  const lockGone = !stateIntact(wrote)
  rmSync(marker, { force: true })
  const markerGone = !stateIntact(wrote)
  check('stateIntact: true only for the marker as written and a lock naming this process; a changed marker, another pid, no lock and no marker are all losses',
    intactAsWritten && markerChanged && lockNotOurs && lockGone && markerGone,
    `as written ${intactAsWritten}, marker changed ${markerChanged}, lock of another pid ${lockNotOurs}, no lock ${lockGone}, no marker ${markerGone}`)
  rmSync(stateDir, { recursive: true, force: true })

  // The run lock lasts as long as the run: clearing state and dropping a healed marker take the marker, the backups and the stashes, never the lock.
  // (Each write is preceded by its mkdir: a mutated clear that removes the directory must fail this clause, not crash the self-test before it reports.)
  const lay = () => { mkdirSync(stateDir, { recursive: true }); writeFileSync(runLock, JSON.stringify({ pid: process.pid })); writeFileSync(marker, '{}') }
  lay()
  clearActive()
  const lockSurvivedClear = existsSync(runLock) && !existsSync(marker)
  lay()
  dropState(stateDir)
  const lockSurvivedDrop = existsSync(runLock) && !existsSync(marker) && existsSync(stateDir)
  mkdirSync(stateDir, { recursive: true })
  rmSync(runLock, { force: true })
  writeFileSync(marker, '{}')
  dropState(stateDir)
  const emptyDirRemoved = !existsSync(stateDir)
  check('THE RUN LOCK OUTLIVES A CLEAR AND A HEAL: clearActive and dropState leave run.json where it is, and a directory left empty is removed',
    lockSurvivedClear && lockSurvivedDrop && emptyDirRemoved, `lock survived clearActive ${lockSurvivedClear}, survived dropState ${lockSurvivedDrop}, empty directory removed ${emptyDirRemoved}`)
  rmSync(stateDir, { recursive: true, force: true })

  // Clearing a run's state leaves what a harness run INSIDE it stranded. A child killed with a mutation applied keeps its marker in `nested`; the parent's clear used to delete it, and the
  // child's file stayed mutated with nothing to say so (measured 2026-11-05: `git status` showed the file, the state directory was gone, the next `--heal` said there was nothing to heal).
  // The next run's heal looks in `nested` first. An empty `nested` is no one's state and goes with the rest. (`force`: a clause that fails must not crash before it reports.)
  mkdirSync(join(stateDir, 'nested'), { recursive: true })
  writeFileSync(join(stateDir, 'nested', 'active.json'), '{"id":"a child\'s"}')
  writeFileSync(marker, '{}')
  clearActive()
  const childSurvivedClear = existsSync(join(stateDir, 'nested', 'active.json')) && !existsSync(marker)
  rmSync(join(stateDir, 'nested', 'active.json'), { force: true })
  mkdirSync(stateDir, { recursive: true })
  writeFileSync(marker, '{}')
  clearActive()
  const emptyNestedGone = !existsSync(join(stateDir, 'nested'))
  check('CLEARING A RUN\'S STATE LEAVES WHAT A NESTED RUN STRANDED: the nested marker survives the clear (this run\'s own marker does not), and an empty nested directory is removed with the rest',
    childSurvivedClear && emptyNestedGone, `nested marker survived ${childSurvivedClear}, empty nested directory removed ${emptyNestedGone}`)
  rmSync(stateDir, { recursive: true, force: true })

  // A live run inside a run (its lock is in the nested directory) stops this one too.
  const nestedLockDir = join(scratch, `case-${++caseNo}`)
  mkdirSync(join(nestedLockDir, 'nested'), { recursive: true })
  writeFileSync(join(nestedLockDir, 'nested', 'run.json'), JSON.stringify({ pid: process.pid, start: startOf(process.pid), startedAt: DEAD.startedAt }))
  stops.length = 0; said.length = 0
  const nestedLocked = (() => { try { healIn(nestedLockDir, options({})); return false } catch (e) { if (e.message !== 'exit') throw e; return stops[0] === 1 && /IN PROGRESS/.test(said.join('\n')) } })()
  check('A LIVE RUN INSIDE A RUN STOPS THIS ONE TOO: a lock in the nested directory is judged like the run\'s own', nestedLocked, said.join('\n'))

  // A heal that restores a file this process is built from must start again as the restored code, and has to know which files those are.
  check('a heal records the file it wrote back, which is how a run knows it restored part of itself', healedFiles.has(resolve(killed.file)), `recorded: ${[...healedFiles].join(', ')}`)
  const reach = new Set(['mutation-check.mjs'])
  const sourceDir = dirname(fileURLToPath(import.meta.url))
  for (const f of reach) for (const [, dep] of readFileSync(join(sourceDir, f), 'utf8').matchAll(/from '\.\/([\w.-]+\.mjs)'/g)) reach.add(dep)
  const unlisted = [...reach].filter(f => !SELF_SOURCES.includes(join(sourceDir, f)))
  check('THE FILES THIS HARNESS IS BUILT FROM ARE ALL LISTED: every module it reaches through ./imports is one a heal that restores it starts again for, and none listed is gone',
    unlisted.length === 0 && reach.size === SELF_SOURCES.length, `reached ${[...reach].join(', ')}; not listed ${unlisted.join(', ') || 'none'}; listed ${SELF_SOURCES.length}`)

  // The baseline runs a harness-run expectation (harness-blind, only-selects-nothing-passes) under this run's live lock, so it needs the child environment.
  // The marker below is built from two strings so that the only place the pair occurs contiguously is the baseline itself.
  const ownSource = readFileSync(fileURLToPath(import.meta.url), 'utf8')
  const baselineAt = ownSource.indexOf('const baselineOne' + ' = cmd')
  check('THE BASELINE RUNS EACH EXPECTATION IN THE CHILD ENVIRONMENT: a harness run it starts gets a state directory of its own instead of meeting this run\'s live lock and "passing" by being refused',
    baselineAt > 0 && /execSync\([^\n]*env: childEnv\(\)/.test(ownSource.slice(baselineAt, baselineAt + 1600)), baselineAt > 0 ? 'the baseline execSync carries no env: childEnv()' : 'the baseline block was not found')

  // Whose state it is (Task 2): the exit handler clears only what this process wrote.
  mkdirSync(stateDir, { recursive: true })
  writeFileSync(marker, JSON.stringify({ id: 'someone-elses', file: 'x', backup: 'y' }))
  restore()
  check('THE EXIT HANDLER LEAVES A STATE DIRECTORY IT DID NOT WRITE: a stranded marker survives a run that only started and stopped',
    existsSync(marker), 'restore() cleared a marker this process never wrote')
  claimState()
  restore()
  check('...and clears the one it did', !existsSync(marker), 'restore() left this process\'s own state behind')
  check('the self-test works in a temp directory of its own, not the real state directory',
    stateDir !== '.mutation-state' && stateDir.startsWith(tmpdir()), `stateDir is ${stateDir}`)
  check('a command this run starts gets a state directory of its own beneath this one',
    capture('node -e "process.stdout.write(process.env.MUTATION_STATE_DIR)"') === join(stateDir, 'nested'),
    'a harness run inside a harness run would share this run\'s marker')
  const staysOnDisk = MUTATIONS.filter(m => m.mutate)
  check('no world mutation keeps its stash in /tmp, and each uses the one the harness hands it',
    staysOnDisk.length > 0 && staysOnDisk.every(m => !/\/tmp\//.test(m.mutate + m.restore) && /\$STASH/.test(m.mutate) && /\$STASH/.test(m.restore)),
    staysOnDisk.filter(m => /\/tmp\//.test(m.mutate + m.restore) || !/\$STASH/.test(m.mutate + m.restore)).map(m => m.id).join(', '))

  // The REAL script. Not from inside such a run (MUTATION_SELFTEST_CHILD), or each level would start the next.
  if (!process.env.MUTATION_SELFTEST_CHILD) {
    const here = fileURLToPath(import.meta.url)
    const clean = { MUTATION_STATE_DIR: '', MUTATION_SELFTEST_CHILD: '', MUTATION_KILL_AT: '', MUTATION_KILL_SIGNAL: '', MUTATION_FAULT: '', MUTATION_REEXEC: '', MUTATION_OUTPUT_LIMIT: '' }

    // Started and stopped over a real stranded state, in a directory with no repository: --self-test, --list-ids and --anchors each leave it.
    // The state is one a heal COULD undo: the file is exactly the mutation and the backup exactly the original, so a mode that healed would put the file back and the clause below sees it.
    // (It was a file that did not exist and a backup that was not the original, which a heal refuses: a mode that healed and refused left what a mode that touched nothing left.)
    // `rebuild: false` because nothing here builds. Written by a helper, called once for the directory the modes run in and once for the control's copy of it.
    const strandedFixture = dir => {
      mkdirSync(join(dir, '.mutation-state'), { recursive: true })
      mkdirSync(join(dir, 'src'))
      writeFileSync(join(dir, 'src', 'Stranded.fs'), 'MUTATED FILE CONTENT\n')
      writeFileSync(join(dir, '.mutation-state', 'src_Stranded.fs'), 'ORIGINAL FILE CONTENT\n')
      writeFileSync(join(dir, '.mutation-state', 'active.json'), JSON.stringify({ id: 'stranded', file: 'src/Stranded.fs', backup: '.mutation-state/src_Stranded.fs', originalSha: sha('ORIGINAL FILE CONTENT\n'), mutatedSha: sha('MUTATED FILE CONTENT\n'), rebuild: false, ...DEAD }))
    }
    const stranded = join(scratch, `case-${++caseNo}`)
    strandedFixture(stranded)
    // The control: the fixture IS healable. `--heal` over a second copy puts the file back and drops the state; without this the clause below could not tell "left alone" from "could not heal".
    const healable = join(scratch, `case-${++caseNo}`)
    strandedFixture(healable)
    spawnSync(process.execPath, [here, '--heal'], { cwd: healable, encoding: 'utf8', timeout: 120_000, env: { ...process.env, ...clean, MUTATION_SELFTEST_CHILD: '1' } })
    check('THE STRANDED FIXTURE IS HEALABLE (the control for the clause below): `--heal` over a copy of it puts the file back and drops the state',
      read(join(healable, 'src', 'Stranded.fs')) === 'ORIGINAL FILE CONTENT\n' && !existsSync(join(healable, '.mutation-state', 'active.json')),
      `file reads ${JSON.stringify(read(join(healable, 'src', 'Stranded.fs')))}, marker kept ${existsSync(join(healable, '.mutation-state', 'active.json'))}`)
    const survivors = ['--self-test', '--list-ids', '--anchors'].map(mode => {
      const r = spawnSync(process.execPath, [here, mode], { cwd: stranded, encoding: 'utf8', timeout: 120_000, env: { ...process.env, ...clean, MUTATION_SELFTEST_CHILD: '1' } })
      return { mode, out: String(r.stdout), marker: existsSync(join(stranded, '.mutation-state', 'active.json')), backup: existsSync(join(stranded, '.mutation-state', 'src_Stranded.fs')), file: read(join(stranded, 'src', 'Stranded.fs')) }
    })
    check('A REAL STRANDED STATE SURVIVES THE SCRIPT BEING STARTED AND STOPPED: --self-test, --list-ids and --anchors each leave the marker, the backup and the mutated file as they were (3 modes, one healable state)',
      survivors.every(x => x.marker && x.backup && x.file === 'MUTATED FILE CONTENT\n'), survivors.map(x => `${x.mode}: marker ${x.marker}, backup ${x.backup}, file ${JSON.stringify(x.file)}`).join(' / '))
    // ...and the self-test says so, before its clauses, with the command that heals it: when the stranded file is this one, most clauses fail and name the harness.
    const noted = survivors.find(x => x.mode === '--self-test')
    check('...and the self-test NAMES a stranded state and the command that heals it, instead of failing clauses that point at the harness',
      /is a mutation a killed run left applied \(\[stranded\] on src\/Stranded\.fs\)/.test(noted.out) && /node scripts\/mutation-check\.mjs --heal/.test(noted.out), noted.out.split('\n').filter(l => /warning|stranded/i.test(l)).join(' | ').slice(0, 300))

    // `--stranded`: the refusal the pre-commit hook and the gate run first. Each clause starts the REAL script over a stranded directory and compares EVERY file in it before and
    // after, because "touched nothing" is a claim about the whole directory (the mutated source, the marker, the backup, a stale lock), not about one file. The fixture is the healable
    // one from above, so a mode that healed would be seen to: the file would come back.
    const ask = (cwd, args) => spawnSync(process.execPath, [here, ...args], { cwd, encoding: 'utf8', timeout: 120_000, env: { ...process.env, ...clean, MUTATION_SELFTEST_CHILD: '1' } })
    /** Every file below a directory with a hash of its content, sorted: two listings are equal only if nothing was added, removed or changed. */
    const listing = dir => {
      const out = []
      const walk = rel => {
        for (const e of readdirSync(join(dir, rel), { withFileTypes: true })) {
          if (e.isDirectory()) walk(join(rel, e.name))
          else if (!e.isSymbolicLink()) out.push(`${join(rel, e.name)} ${sha(readFileSync(join(dir, rel, e.name)))}`)
        }
      }
      walk('')
      return out.sort().join('\n')
    }
    const fresh = () => { const dir = join(scratch, `case-${++caseNo}`); mkdirSync(dir, { recursive: true }); return dir }
    const strandedMarkerOf = dir => join(dir, '.mutation-state', 'active.json')
    const first = r => String(r.stdout).split('\n')[0].slice(0, 220)

    const refusedDir = fresh()
    strandedFixture(refusedDir)
    const refusedBefore = listing(refusedDir)
    const refused = ask(refusedDir, ['--stranded'])
    check('`--stranded` REFUSES A REAL STRANDED STATE AND TOUCHES NOTHING: exit 1, it names the marker, the mutation and the file and says it was not undone here and a commit or a gate run would carry it, and says to run `node scripts/mutation-check.mjs --heal`; every file in the directory (the mutated source, the marker, the backup) is byte-identical afterwards (1 healable state, 3 files)',
      refused.status === 1 && /\.mutation-state\/active\.json is a mutation a killed run left applied \(\[stranded\] on src\/Stranded\.fs\)/.test(refused.stdout) && /this mode does not undo it: a commit or a gate run over this tree would carry the mutation\. Heal it first: node scripts\/mutation-check\.mjs --heal/.test(refused.stdout) && listing(refusedDir) === refusedBefore,
      `status ${refused.status}; ${first(refused)}; directory unchanged ${listing(refusedDir) === refusedBefore}`)

    const noMarker = fresh()
    const lockOnly = fresh()
    mkdirSync(join(lockOnly, '.mutation-state'))
    writeFileSync(join(lockOnly, '.mutation-state', 'run.json'), JSON.stringify(DEAD))
    const lockBefore = listing(lockOnly)
    const quiet = ask(noMarker, ['--stranded'])
    const lockOnlyRun = ask(lockOnly, ['--stranded'])
    check('`--stranded` LETS THROUGH A DIRECTORY WITH NO MARKER: exit 0 over a directory with no state at all and over one that holds only a stale run lock (a lock is not a stranded mutation), which it leaves where it is; it says it checked 3 files, `driver.json` among them, and that none holds a mutation or names a build driver (2 directories)',
      quiet.status === 0 && lockOnlyRun.status === 0 && /checked 3 files \(.*\.mutation-state\/driver\.json\); 0 hold a marker; 0 name a build driver/.test(quiet.stdout) && /checked 3 files \(.*\.mutation-state\/driver\.json\); 0 hold a marker; 0 name a build driver/.test(lockOnlyRun.stdout) && listing(lockOnly) === lockBefore,
      `empty directory: status ${quiet.status}, ${first(quiet)}; stale lock only: status ${lockOnlyRun.status}, ${first(lockOnlyRun)}; lock kept ${listing(lockOnly) === lockBefore}`)

    // A harness run inside a harness run keeps its state in `nested`: the second place a stranded marker is.
    const nestedDir = fresh()
    strandedFixture(nestedDir)
    const nestedAt = join(nestedDir, '.mutation-state', 'nested')
    mkdirSync(nestedAt)
    copyFileSync(join(nestedDir, '.mutation-state', 'src_Stranded.fs'), join(nestedAt, 'src_Stranded.fs'))
    writeFileSync(join(nestedAt, 'active.json'), JSON.stringify({ ...JSON.parse(read(strandedMarkerOf(nestedDir))), backup: '.mutation-state/nested/src_Stranded.fs' }))
    rmSync(strandedMarkerOf(nestedDir))
    rmSync(join(nestedDir, '.mutation-state', 'src_Stranded.fs'))
    const nestedBefore = listing(nestedDir)
    const nestedRun = ask(nestedDir, ['--stranded'])
    check('`--stranded` REFUSES A MARKER A NESTED RUN STRANDED TOO: with the only marker in `.mutation-state/nested`, it exits 1 naming that file, and the directory is byte-identical afterwards (1 nested state)',
      nestedRun.status === 1 && /\.mutation-state\/nested\/active\.json is a mutation a killed run left applied \(\[stranded\] on src\/Stranded\.fs\)/.test(nestedRun.stdout) && listing(nestedDir) === nestedBefore,
      `status ${nestedRun.status}; ${first(nestedRun)}; directory unchanged ${listing(nestedDir) === nestedBefore}`)
    // ...and the self-test, whose first lines name a stranded state so that the clauses it then fails point at the cause, looks there too. It read only `active.json`, and over this directory it was silent.
    const nestedNoted = ask(nestedDir, ['--self-test'])
    check('...and the self-test NAMES A MARKER A NESTED RUN STRANDED TOO: with the only marker in `.mutation-state/nested` its report says so, with the file, the mutation and the heal command, and the directory is byte-identical afterwards (1 nested state)',
      /::warning::\.mutation-state\/nested\/active\.json is a mutation a killed run left applied \(\[stranded\] on src\/Stranded\.fs\)/.test(nestedNoted.stdout) && /Heal it first: node scripts\/mutation-check\.mjs --heal/.test(nestedNoted.stdout) && listing(nestedDir) === nestedBefore,
      `${String(nestedNoted.stdout).split('\n').filter(l => /warning|stranded/i.test(l)).join(' | ').slice(0, 260) || '(no warning)'}; directory unchanged ${listing(nestedDir) === nestedBefore}`)

    // THE DIRECTORY IS THE ONE `MUTATION_STATE_DIR` NAMES, as it is for every other mode (review 7, L6): a harness run inside a harness run keeps its state in a directory the variable names, and the self-test
    // hands it to what it starts. A mode that always read `.mutation-state` would say "nothing stranded" over a state kept elsewhere, which is the one answer a refusal exists not to give. The same directory
    // is asked twice, with the variable and without it, so that the first answer is the variable's and not a marker the mode found by itself.
    const elsewhere = fresh()
    mkdirSync(join(elsewhere, 'elsewhere'))
    mkdirSync(join(elsewhere, 'src'))
    writeFileSync(join(elsewhere, 'src', 'Stranded.fs'), 'MUTATED FILE CONTENT\n')
    writeFileSync(join(elsewhere, 'elsewhere', 'src_Stranded.fs'), 'ORIGINAL FILE CONTENT\n')
    writeFileSync(join(elsewhere, 'elsewhere', 'active.json'), JSON.stringify({ id: 'stranded', file: 'src/Stranded.fs', backup: 'elsewhere/src_Stranded.fs', originalSha: sha('ORIGINAL FILE CONTENT\n'), mutatedSha: sha('MUTATED FILE CONTENT\n'), rebuild: false, ...DEAD }))
    const elsewhereBefore = listing(elsewhere)
    const askNamed = spawnSync(process.execPath, [here, '--stranded'], { cwd: elsewhere, encoding: 'utf8', timeout: 120_000, env: { ...process.env, ...clean, MUTATION_STATE_DIR: 'elsewhere', MUTATION_SELFTEST_CHILD: '1' } })
    const askUnnamed = ask(elsewhere, ['--stranded'])
    check('`--stranded` READS THE DIRECTORY `MUTATION_STATE_DIR` NAMES: with the variable naming a directory that holds a stranded marker it exits 1 naming `elsewhere/active.json` and counts it among the files it checked; over the same tree without the variable it exits 0 (the control: the marker is found by the variable and by nothing else); neither run changes the directory (1 tree, 2 runs)',
      askNamed.status === 1 && /elsewhere\/active\.json is a mutation a killed run left applied \(\[stranded\] on src\/Stranded\.fs\)/.test(askNamed.stdout) && /checked 3 files \(elsewhere\/active\.json, elsewhere\/nested\/active\.json, elsewhere\/driver\.json\); 1 hold a marker/.test(askNamed.stdout)
        && askUnnamed.status === 0 && /; 0 hold a marker; /.test(askUnnamed.stdout) && listing(elsewhere) === elsewhereBefore,
      `with the variable: status ${askNamed.status}, ${first(askNamed)}; without it: status ${askUnnamed.status}, ${String(askUnnamed.stdout).split('\n').find(l => /^checked/.test(l)) || '(no summary)'}; directory unchanged ${listing(elsewhere) === elsewhereBefore}`)

    // BOTH PLACES A MARKER CAN BE AT ONCE (review 7, L6). The clauses above put one marker in one of them; a mode that named only the first marker it found would pass each and still tell a person about half the
    // state (its exit status and its count are the same). A run that was itself running a harness run when it was killed leaves both, and each names a different mutation here.
    const bothDir = fresh()
    strandedFixture(bothDir)
    const bothNested = join(bothDir, '.mutation-state', 'nested')
    mkdirSync(bothNested)
    copyFileSync(join(bothDir, '.mutation-state', 'src_Stranded.fs'), join(bothNested, 'src_Stranded.fs'))
    writeFileSync(join(bothNested, 'active.json'), JSON.stringify({ ...JSON.parse(read(strandedMarkerOf(bothDir))), id: 'stranded-in-nested', backup: '.mutation-state/nested/src_Stranded.fs' }))
    const bothBefore = listing(bothDir)
    const bothRun = ask(bothDir, ['--stranded'])
    check('`--stranded` NAMES EVERY MARKER IT FINDS, NOT THE FIRST: with a marker in `.mutation-state` and another in `.mutation-state/nested` it exits 1, prints one message for each (`[stranded]` and `[stranded-in-nested]`), counts 2 in its summary, and changes nothing (2 markers)',
      bothRun.status === 1 && /\.mutation-state\/active\.json is a mutation a killed run left applied \(\[stranded\] on src\/Stranded\.fs\)/.test(bothRun.stdout) && /\.mutation-state\/nested\/active\.json is a mutation a killed run left applied \(\[stranded-in-nested\] on src\/Stranded\.fs\)/.test(bothRun.stdout)
        && /; 2 hold a marker; /.test(bothRun.stdout) && listing(bothDir) === bothBefore,
      `status ${bothRun.status}; messages ${String(bothRun.stdout).split('\n').filter(l => /^::error::/.test(l)).length}; ${String(bothRun.stdout).split('\n').find(l => /^checked/.test(l)) || '(no summary)'}; directory unchanged ${listing(bothDir) === bothBefore}`)

    // A run that is still going is not a killed run's, and `--heal` would refuse it: the message says to wait, and does not send a person to the heal. This self-test is that run.
    const liveDir = fresh()
    strandedFixture(liveDir)
    writeFileSync(strandedMarkerOf(liveDir), JSON.stringify({ ...JSON.parse(read(strandedMarkerOf(liveDir))), pid: process.pid, start: startOf(process.pid), startedAt: DEAD.startedAt }))
    const liveBefore = listing(liveDir)
    const liveRun = ask(liveDir, ['--stranded'])
    check('`--stranded` DOES NOT CALL A RUN THAT IS STILL GOING A KILLED ONE: over a marker naming a live pid it exits 1, says the run is IN PROGRESS, to wait for that pid or stop it (kill -9 if it ignores a plain kill, the advice the heal gives for a live run), does not offer `--heal`, and touches nothing (1 live state)',
      liveRun.status === 1 && new RegExp(`names pid ${process.pid}, which is still running: \\[stranded\\] on src/Stranded\\.fs is applied by a mutation run that is IN PROGRESS`).test(liveRun.stdout) && new RegExp(`Wait for pid ${process.pid} to finish, or stop it \\(kill -9 if it ignores a plain kill\\), and run this again\\.`).test(liveRun.stdout) && !/--heal/.test(liveRun.stdout) && listing(liveDir) === liveBefore,
      `status ${liveRun.status}; ${first(liveRun)}; directory unchanged ${listing(liveDir) === liveBefore}`)

    // ...and a pid that now belongs to ANOTHER process is not a run that is going (review 7, L6). A marker records when its process started, and `isLive` compares it; the pid alone would call a recycled one IN PROGRESS
    // and send a person to wait for a run that died. The pid below is this process's and the start time is not; `--heal` over a copy treats it as dead too (it restores the file), so the sentence is held to it.
    if (haveProc) {
      const recycledDir = fresh()
      const recycledCopy = fresh()
      for (const d of [recycledDir, recycledCopy]) {
        strandedFixture(d)
        writeFileSync(strandedMarkerOf(d), JSON.stringify({ ...JSON.parse(read(strandedMarkerOf(d))), pid: process.pid, start: 'not-when-it-started', startedAt: DEAD.startedAt }))
      }
      const recycledBefore = listing(recycledDir)
      const recycledRun = ask(recycledDir, ['--stranded'])
      const recycledHeal = ask(recycledCopy, ['--heal'])
      check('`--stranded` DOES NOT CALL A RECYCLED PID A RUN THAT IS STILL GOING: over a marker whose pid is alive but whose recorded start time is not that process\'s it exits 1 with the killed-run message, not IN PROGRESS, and changes nothing; `--heal` over a copy treats it as dead too and restores the file (1 state)',
        recycledRun.status === 1 && /is a mutation a killed run left applied \(\[stranded\] on src\/Stranded\.fs\)/.test(recycledRun.stdout) && !/IN PROGRESS|which is still running/.test(recycledRun.stdout) && listing(recycledDir) === recycledBefore
          && read(join(recycledCopy, 'src', 'Stranded.fs')) === 'ORIGINAL FILE CONTENT\n' && !existsSync(strandedMarkerOf(recycledCopy)),
        `status ${recycledRun.status}; ${first(recycledRun)}; directory unchanged ${listing(recycledDir) === recycledBefore}; heal status ${recycledHeal.status}, file ${JSON.stringify(read(join(recycledCopy, 'src', 'Stranded.fs')))}, marker kept ${existsSync(strandedMarkerOf(recycledCopy))}`)
    }

    // A MARKER WHOSE FILE IS ALREADY BACK (review 7, 2026-11-05). A run stopped by Ctrl-C or a SIGTERM while a source file was mutated puts the FILE back and keeps the marker, because its build is
    // not yet verified clean; a run killed between writing the marker and the mutation never changed the file. `--stranded` called both "a mutation a killed run left applied ... a commit or a gate
    // run over this tree would carry the mutation", which is false for the file and for any commit (build/ is not tracked). It now tells the file that is back (its hash is the original the marker
    // recorded) from the file that is still mutated, and says which. Each state is also healed on a copy, with an `npm` that logs and succeeds, so the sentence about the build is held to what the heal does.
    const npmBin = join(scratch, 'npm-bin')
    mkdirSync(npmBin)
    writeFileSync(join(npmBin, 'npm'), '#!/bin/sh\necho "$@" >> npm.log\nexit 0\n', { mode: 0o755 })
    const askHeal = (cwd, args) => spawnSync(process.execPath, [here, ...args], { cwd, encoding: 'utf8', timeout: 120_000, env: { ...process.env, ...clean, MUTATION_SELFTEST_CHILD: '1', PATH: `${npmBin}:${process.env.PATH}` } })
    const ORIGINAL = 'ORIGINAL FILE CONTENT\n'
    /** A marker whose file is back: the file and its backup are the original, the hashes are the original's and the mutation's. `nested`: the marker is a nested run's. */
    const backFixture = (rebuild, nested = false) => {
      const dir = fresh()
      const at = nested ? join(dir, '.mutation-state', 'nested') : join(dir, '.mutation-state')
      mkdirSync(at, { recursive: true })
      mkdirSync(join(dir, 'src'))
      writeFileSync(join(dir, 'src', 'Stranded.fs'), ORIGINAL)
      writeFileSync(join(at, 'src_Stranded.fs'), ORIGINAL)
      writeFileSync(join(at, 'active.json'), JSON.stringify({ id: 'stranded', file: 'src/Stranded.fs', backup: nested ? '.mutation-state/nested/src_Stranded.fs' : '.mutation-state/src_Stranded.fs', originalSha: sha(ORIGINAL), mutatedSha: sha('MUTATED FILE CONTENT\n'), rebuild, ...DEAD }))
      return dir
    }
    const backs = [['rebuild true', true, false], ['rebuild absent (an older marker)', undefined, true]].map(([why, rebuild, nested]) => {
      const dir = backFixture(rebuild, nested)
      const copy = backFixture(rebuild, nested)
      const before = listing(dir)
      const r = ask(dir, ['--stranded'])
      const healed = askHeal(copy, ['--heal'])
      return { why, nested, r, same: listing(dir) === before, healed, npmRuns: existsSync(join(copy, 'npm.log')) ? read(join(copy, 'npm.log')).split('\n').filter(Boolean).length : 0, stateKept: existsSync(join(copy, '.mutation-state', nested ? 'nested' : 'active.json')) }
    })
    check('`--stranded` TELLS A MARKER WHOSE FILE IS ALREADY BACK FROM ONE WHOSE FILE IS STILL MUTATED: it exits 1 and keeps refusing, but says the file is back as it was, that build/ may still hold the mutation (the run stopped before its build was verified), that nothing committable differs and a gate run scores build/, names `--heal` and the delete route with its cost, and does not say "would carry the mutation"; the directory is byte-identical; `--heal` over a copy, with an npm that logs, runs that build once and drops the state (2 states: rebuild true in the run\'s own directory, rebuild absent in `nested`)',
      backs.every(x => x.r.status === 1 && /is already back as it was/.test(x.r.stdout) && /build\/ may still hold the mutation/.test(x.r.stdout) && /Nothing committable differs, but a gate run scores build\//.test(x.r.stdout)
        && /Rebuild and clear it: node scripts\/mutation-check\.mjs --heal \(it runs `npm run build`\)/.test(x.r.stdout) && !/would carry the mutation|left applied/.test(x.r.stdout) && x.same
        && x.healed.status === 0 && /Nothing to heal/.test(x.healed.stdout) && x.npmRuns === 1 && !x.stateKept)
        && /deleting \.mutation-state drops the only record/.test(backs[0].r.stdout) && /deleting \.mutation-state\/nested drops the only record/.test(backs[1].r.stdout),
      backs.map(x => `${x.why}: status ${x.r.status}, ${first(x.r)}; unchanged ${x.same}; heal status ${x.healed.status}, builds ${x.npmRuns}, state kept ${x.stateKept}`).join(' / ').slice(0, 500))
    const noBuildDir = backFixture(false)
    const noBuildCopy = backFixture(false)
    const noBuildBefore = listing(noBuildDir)
    const noBuild = ask(noBuildDir, ['--stranded'])
    const noBuildHealed = askHeal(noBuildCopy, ['--heal'])
    check('...and where the marker says the mutation could not reach build/ it says nothing is applied and no build is run: `--stranded` exits 1 over a file that is back, says the run was killed before it wrote the mutation or after it undid it, and that `--heal` runs no build; `--heal` over a copy drops the state and the npm never ran (1 state)',
      noBuild.status === 1 && /is already back as it was, so nothing is applied/.test(noBuild.stdout) && /was killed before it wrote the mutation, or after it undid it and before it dropped this marker/.test(noBuild.stdout)
        && /Clear it: node scripts\/mutation-check\.mjs --heal \(it runs no build for this one\)/.test(noBuild.stdout) && !/would carry the mutation|left applied|build\/ may still/.test(noBuild.stdout) && listing(noBuildDir) === noBuildBefore
        && noBuildHealed.status === 0 && /Nothing to heal/.test(noBuildHealed.stdout) && !existsSync(join(noBuildCopy, 'npm.log')) && !existsSync(join(noBuildCopy, '.mutation-state', 'active.json')),
      `status ${noBuild.status}; ${first(noBuild)}; unchanged ${listing(noBuildDir) === noBuildBefore}; heal status ${noBuildHealed.status}, npm ran ${existsSync(join(noBuildCopy, 'npm.log'))}, state kept ${existsSync(join(noBuildCopy, '.mutation-state', 'active.json'))}`)

    // THE MESSAGE SAYS WHAT THE HEAL WILL DO (review 7, L5, 2026-11-05). `--stranded` used to say "a mutation a killed run left applied ... Heal it first: --heal" for every marker. Four classes of marker
    // are not healed at all, the heal refuses them and keeps the state, and a person who ran the command it named was told something else. The classes are `planHeal`'s, read from the marker and the file
    // alone; each is built on disk, `--stranded` is asked, and the SAME state is healed on a copy, so the sentence is held to what the heal does: a refusal for these four (exit 1, the marker kept, the heal's own
    // words), a restore for the one the old sentence was written for.
    const MUTATED = 'MUTATED FILE CONTENT\n'
    const classFixture = ({ file = MUTATED, backup = ORIGINAL, marker = {} }) => {
      const dir = fresh()
      mkdirSync(join(dir, '.mutation-state'), { recursive: true })
      if (file !== null) { mkdirSync(join(dir, 'src')); writeFileSync(join(dir, 'src', 'Stranded.fs'), file) }
      if (backup !== null) writeFileSync(join(dir, '.mutation-state', 'src_Stranded.fs'), backup)
      writeFileSync(join(dir, '.mutation-state', 'active.json'), typeof marker === 'string' ? marker : JSON.stringify({ id: 'stranded', file: 'src/Stranded.fs', backup: '.mutation-state/src_Stranded.fs', originalSha: sha(ORIGINAL), mutatedSha: sha(MUTATED), rebuild: false, ...DEAD, ...marker }))
      return dir
    }
    const refusing = [
      ['LOST', { backup: null }, /which is still exactly the mutation, but its backup \(\.mutation-state\/src_Stranded\.fs\) is gone or is not the original/, /backup is gone or is not the original/],
      ['DIVERGED', { file: 'EDITED BY A PERSON AFTER THE KILL\n' }, /that file is neither the original nor the mutation: it changed after the kill/, /neither the original nor the mutation/],
      ['LEGACY (no hashes)', { marker: { originalSha: undefined, mutatedSha: undefined } }, /was written before markers recorded what the mutation did/, /was written before markers recorded/],
      ['LEGACY (the mutation\'s hash missing)', { marker: { mutatedSha: undefined } }, /was written before markers recorded what the mutation did/, /was written before markers recorded/],
      ['LEGACY (a change made outside the source, with no record of the tree before)', { marker: { restoreCmd: 'true', stash: '.mutation-state/world/stranded' } }, /was written before markers recorded what the mutation did/, /was written before markers recorded/],
      ['UNREADABLE (cut off mid-write)', { marker: '{"id":"stran' }, /is not a marker this harness wrote \(it does not parse, or names no mutation\)/, /is not a marker this harness wrote/],
      ['UNREADABLE (parses, names no mutation)', { marker: '{"pid":1}' }, /is not a marker this harness wrote \(it does not parse, or names no mutation\)/, /is not a marker this harness wrote/],
    ]
    for (const [name, spec, says, healSays] of refusing) {
      const dir = classFixture(spec)
      const copy = classFixture(spec)
      const before = listing(dir)
      const r = ask(dir, ['--stranded'])
      const healed = ask(copy, ['--heal'])
      check(`\`--stranded\` OVER A ${name} MARKER SAYS THE HEAL REFUSES IT, NOT THAT IT HEALS IT: exit 1, it says what the marker is, it says \`--heal\` refuses this one and writes nothing, it does not say "Heal it first" or "would carry the mutation", and the directory is byte-identical; \`--heal\` over a copy refuses too (exit 1, its own words) and keeps the marker (1 state)`,
        r.status === 1 && says.test(r.stdout) && /`node scripts\/mutation-check\.mjs --heal` refuses this one and writes nothing: run it and read what it says\./.test(r.stdout) && !/Heal it first|would carry the mutation/.test(r.stdout) && listing(dir) === before
          && healed.status === 1 && healSays.test(`${healed.stdout}${healed.stderr}`) && existsSync(join(copy, '.mutation-state', 'active.json')),
        `status ${r.status}; ${first(r)}; unchanged ${listing(dir) === before}; heal status ${healed.status}, ${String(healed.stdout).split('\n').find(l => /::error::/.test(l))?.slice(0, 160) ?? '(no refusal)'}; marker kept ${existsSync(join(copy, '.mutation-state', 'active.json'))}`)
    }

    // A change made outside the source whose marker records no paths is one state in three shapes: `touched` absent (what a run killed before it recorded them leaves, E23 below), `{}` and `null`.
    // `planHeal` reads all three as "recorded none" (`hasTouched`: a non-null object with at least one key), and so must this mode, or `{}` reads as "recorded" and promises a restore the heal does not
    // make (the entry that turns `> 0` into `>= 0` survived the first version of this block, and so did one that dropped the null test, which only a `null` can tell: `Object.keys(null)` throws).
    const unrecorded = [['absent', undefined], ['an empty object', {}], ['null', null]].map(([why, touched]) => {
      const dir = classFixture({ marker: { restoreCmd: 'true', stash: '.mutation-state/world/stranded', before: {}, touched } })
      const before = listing(dir)
      const r = ask(dir, ['--stranded'])
      return { why, r, same: listing(dir) === before }
    })
    check('`--stranded` READS A WORLD MARKER THAT RECORDS NO PATHS AS ONE KILLED BEFORE IT RECORDED THEM, WHICHEVER WAY IT SAYS SO: with `touched` absent, `{}` or `null` it exits 1 and says the run was killed before it recorded which paths it touched, does not say it left a change it can restore, prints no stack trace, and the directory is byte-identical (3 shapes, as `hasTouched` reads them)',
      unrecorded.every(x => x.r.status === 1 && /whose run was killed before it recorded which paths it touched \(\[stranded\] on src\/Stranded\.fs\)/.test(x.r.stdout) && !/that a killed run left|puts the paths back/.test(x.r.stdout) && !/^\s+at |TypeError/m.test(`${x.r.stdout}${x.r.stderr}`) && x.same),
      unrecorded.map(x => `touched ${x.why}: status ${x.r.status}, ${first(x.r)}; unchanged ${x.same}`).join(' / ').slice(0, 500))

    // Above the heal and above the run lock. With `--heal` beside it a mode placed after the heal would heal; with a stale lock beside the marker a mode placed after the lock check would
    // delete the lock. Neither may happen: the directory is byte-identical, the file still mutated, the lock still there.
    const orderDir = fresh()
    strandedFixture(orderDir)
    writeFileSync(join(orderDir, '.mutation-state', 'run.json'), JSON.stringify(DEAD))
    const orderBefore = listing(orderDir)
    const ordered = ask(orderDir, ['--stranded', '--heal'])
    check('`--stranded` COMES BEFORE THE HEAL AND THE RUN LOCK: given `--heal` as well and a stale run lock beside the marker, it still only refuses (exit 1, the message) and the directory is byte-identical: the file is still mutated, the marker and backup are there, the lock was neither taken nor removed (1 state, 4 files)',
      ordered.status === 1 && /is a mutation a killed run left applied \(\[stranded\] on src\/Stranded\.fs\)/.test(ordered.stdout) && listing(orderDir) === orderBefore,
      `status ${ordered.status}; ${first(ordered)}; directory unchanged ${listing(orderDir) === orderBefore}`)

    // A BUILD DRIVER A DEAD RUN LEFT RUNNING (`driver.json`): the third thing a SIGKILL leaves, and the one `--stranded` did not read (review 7, 2026-11-05: it printed "0 hold a mutation a run left
    // applied" and exited 0 over a live `dotnet fable watch`). The mode reads the record and signals nothing. It refuses when the recorded run is dead, the record's process group is alive and the pid still
    // holds the process that was recorded: the three tests `reapDriver` makes before it stops one, which are repeated here because `reapDriver` signals and cannot be called. The refusal is run against the `--heal` that reaps (a
    // copy of the same state), and each state that is NOT an orphan against the exit and the group. The groups are REAL: a detached node process leads a group of its own, and `groupAlive` is the
    // harness's zombie-aware test (a plain signal 0 counts a zombie as running).
    const groupsStarted = []
    process.on('exit', () => { for (const pid of groupsStarted) { try { process.kill(-pid, 'SIGKILL') } catch { /* already gone */ } } })
    const startGroup = () => {
      const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' })
      child.unref()
      groupsStarted.push(child.pid)
      return child.pid
    }
    const driverDir = rec => {
      const dir = fresh()
      mkdirSync(join(dir, '.mutation-state'))
      writeFileSync(join(dir, '.mutation-state', 'driver.json'), typeof rec === 'string' ? rec : JSON.stringify(rec))
      return dir
    }
    const driverKept = dir => existsSync(join(dir, '.mutation-state', 'driver.json'))
    const thisRun = { pid: process.pid, start: startOf(process.pid), startedAt: DEAD.startedAt }
    const driverPid = startGroup()
    const orphanStart = startOf(driverPid)
    try {
      const orphanDir = driverDir({ run: DEAD, driver: { pid: driverPid, start: orphanStart } })
      const orphanCopy = driverDir({ run: DEAD, driver: { pid: driverPid, start: orphanStart } })
      const orphanBefore = listing(orphanDir)
      const orphanRun = ask(orphanDir, ['--stranded'])
      check('`--stranded` REFUSES A BUILD DRIVER A DEAD RUN LEFT RUNNING AND STOPS NOTHING: with `driver.json` naming a live process group whose recorded run is dead it exits 1, names the group, `driver.json` and `node scripts/mutation-check.mjs --heal`, says it checked `driver.json`, the group is still running afterwards and the directory is byte-identical (1 real group)',
        orphanRun.status === 1 && new RegExp(`\\.mutation-state/driver\\.json names process group ${driverPid}, a build driver`).test(orphanRun.stdout) && /Stop it first: node scripts\/mutation-check\.mjs --heal/.test(orphanRun.stdout)
          && /checked 3 files \(.*\.mutation-state\/driver\.json\); 0 hold a marker; 1 name a build driver/.test(orphanRun.stdout) && groupAlive(driverPid) && listing(orphanDir) === orphanBefore,
        `status ${orphanRun.status}; ${first(orphanRun)}; group ${driverPid} still running ${groupAlive(driverPid)}; directory unchanged ${listing(orphanDir) === orphanBefore}; ${String(orphanRun.stdout).split('\n').find(l => /^checked/.test(l)) || '(no summary line)'}`)

      // The states a driver is NOT an orphan in. `--stranded` lets each through (exit 0, the group untouched, the directory byte-identical) and the heal over a copy leaves the group running too.
      const lets = [
        ['its recorded run is still running (a live run\'s driver is that run\'s)', { run: thisRun, driver: { pid: driverPid, start: orphanStart } }],
        ...(haveProc ? [['its pid now holds a process that started at another time (a recycled pid is not ours)', { run: DEAD, driver: { pid: driverPid, start: 'not-when-it-started' } }]] : []),
        ['its group is gone', { run: DEAD, driver: { pid: 2 ** 30, start: '1' } }],
        ['it names pid 0 (the group of the kernel\'s own processes) or pid 1, which are never a build driver', { run: DEAD, driver: { pid: 0 } }],
        ['it names pid 1', { run: DEAD, driver: { pid: 1 } }],
        ['it does not parse (a write cut off by a SIGKILL)', '{"run":'],
      ]
      const letRuns = lets.map(([why, rec]) => {
        const dir = driverDir(rec)
        const before = listing(dir)
        const r = ask(dir, ['--stranded'])
        return { why, status: r.status, refused: /names process group/.test(r.stdout), same: listing(dir) === before, summary: String(r.stdout).split('\n').find(l => /^checked/.test(l)) || '' }
      })
      check(`\`--stranded\` LETS A DRIVER RECORD THROUGH WHEN IT IS NOT AN ORPHAN: exit 0 and nothing named, the group still running and the directory byte-identical, for ${lets.length} states (${lets.map(([why]) => why.split(' (')[0]).join('; ')}), each with a real or an absent group`,
        letRuns.every(x => x.status === 0 && !x.refused && x.same && /; 0 name a build driver/.test(x.summary)) && groupAlive(driverPid),
        letRuns.map(x => `${x.why}: status ${x.status}, refused ${x.refused}, unchanged ${x.same}`).join(' / ').slice(0, 400) + `; group still running ${groupAlive(driverPid)}`)
      // ...and the heal agrees with the refusal: it stops the orphan and drops its record. (Its `npm run build` after a reap fails in a directory with no package.json, so the heal exits 1 there;
      // the group and the record are what is read.)
      const reaped = ask(orphanCopy, ['--heal'])
      check('`--stranded` AND THE HEAL AGREE ON A DRIVER: `--heal` over a copy of the refused state stops the group and drops `driver.json`, so the refusal names a command that does what it says (the build that follows a reap fails in a directory with no package.json, exit 1, and is not read)',
        !groupAlive(driverPid) && !driverKept(orphanCopy) && /Stopping it before this run starts one of its own/.test(reaped.stdout),
        `group ${driverPid} still running ${groupAlive(driverPid)}; record kept ${driverKept(orphanCopy)}; heal status ${reaped.status}; ${String(reaped.stdout).split('\n').filter(l => /Stopping|::error::/.test(l)).join(' | ').slice(0, 200)}`)
    } finally {
      try { process.kill(-driverPid, 'SIGKILL') } catch { /* already gone */ }
    }

    // What a marker holds decides what the message says. A world mutation's marker names no file, and a marker cut off mid-write names nothing and does not parse: both are refused by what
    // they are, with the heal command, instead of crashing on the read or printing `undefined`.
    const worldDir = fresh()
    mkdirSync(join(worldDir, '.mutation-state'))
    writeFileSync(strandedMarkerOf(worldDir), JSON.stringify({ id: 'outbox-stub', restoreCmd: 'true', stash: '.mutation-state/world/outbox-stub', before: {}, touched: { 'outbox/x.md': { before: 'a', after: 'b' } }, head: 'h', ...DEAD }))
    const tornDir = fresh()
    mkdirSync(join(tornDir, '.mutation-state'))
    writeFileSync(strandedMarkerOf(tornDir), '{"id":"stran')
    const worldBefore = listing(worldDir)
    const tornBefore = listing(tornDir)
    const worldRun = ask(worldDir, ['--stranded'])
    const tornRun = ask(tornDir, ['--stranded'])
    check('`--stranded` NAMES A MARKER BY WHAT IT HOLDS: a world mutation\'s marker (no file) reads `[outbox-stub] on the tree`, one cut off mid-write reads `[unknown] on the tree`, both exit 1 with the heal command and no stack trace, and neither directory is touched (2 states)',
      worldRun.status === 1 && tornRun.status === 1
        && /\(\[outbox-stub\] on the tree\)/.test(worldRun.stdout) && /\(\[unknown\] on the tree\)/.test(tornRun.stdout)
        && /--heal/.test(worldRun.stdout) && /--heal/.test(tornRun.stdout) && !/undefined|^\s+at /m.test(worldRun.stdout + tornRun.stdout + worldRun.stderr + tornRun.stderr)
        && listing(worldDir) === worldBefore && listing(tornDir) === tornBefore,
      `world: status ${worldRun.status}, ${first(worldRun)}; torn: status ${tornRun.status}, ${first(tornRun)}; ${String(tornRun.stderr).split('\n')[0].slice(0, 120)}`)

    // The mode is a refusal at the door only if the door runs it, and runs it first. The hook runs an npm script and the gate runs a preflight; each is driven here over the same stranded
    // fixture, as the real thing: the script text is read from package.json and run by npm, and the gate is the real confidence.mjs started in a scratch directory (which has no
    // inventory and no rows, so a gate that is NOT stopped by the preflight is seen to go on, to the inventory, and fail there).
    const repoRoot = resolve(dirname(here), '..')
    const doorDir = fresh()
    strandedFixture(doorDir)
    writeFileSync(join(doorDir, 'package.json'), JSON.stringify({ scripts: { 'check:mutation-anchors': JSON.parse(read(join(repoRoot, 'package.json'))).scripts['check:mutation-anchors'] } }))
    execSync(`ln -s ${JSON.stringify(dirname(here))} scripts`, { cwd: doorDir })
    const doorBefore = listing(doorDir)
    const door = spawnSync('npm', ['run', '--silent', 'check:mutation-anchors'], { cwd: doorDir, encoding: 'utf8', timeout: 120_000, env: { ...process.env, ...clean, MUTATION_SELFTEST_CHILD: '1' } })
    check('THE HOOK\'S SCRIPT REFUSES A STRANDED STATE BEFORE IT DOES ANYTHING ELSE: `check:mutation-anchors` as package.json has it, run by npm over the stranded fixture, exits non-zero with the `--stranded` message and has not reached the anchor check or the self-test; the directory is byte-identical afterwards (1 state)',
      door.status !== 0 && /is a mutation a killed run left applied \(\[stranded\] on src\/Stranded\.fs\)/.test(door.stdout) && !/mutation anchors|STALE|Heal self-test/.test(door.stdout) && listing(doorDir) === doorBefore,
      `status ${door.status}; ${first(door)}; reached the anchor check or the self-test: ${/mutation anchors|STALE|Heal self-test/.test(door.stdout)}; directory unchanged ${listing(doorDir) === doorBefore}`)
    const hookText = read(join(repoRoot, '.githooks', 'pre-commit'))
    check('THE PRE-COMMIT HOOK RUNS THAT SCRIPT: `npm run --silent check:mutation-anchors` is a line of .githooks/pre-commit that is not a comment (1 hook)',
      /^npm run --silent check:mutation-anchors$/m.test(hookText), `the hook holds ${hookText.split('\n').filter(l => /mutation-anchors/.test(l)).join(' | ').slice(0, 200) || 'no such line'}`)
    // ...and the hook REACHES that line, and STOPS where it fails (review 7, L6). The clause above reads the file, so it passes with an `exit 0` above the line, which the hook then never gets to. Here the real hook runs in a
    // directory of its own with an `npm` that logs what it is asked and fails the one script it is told to: once with every script passing (the line must be asked for, once, and the hook must finish), once with
    // `check:mutation-anchors` failing (the hook must exit non-zero and ask for nothing after it).
    const hookIn = fails => {
      const dir = fresh()
      writeFileSync(join(dir, 'package.json'), '{}')
      mkdirSync(join(dir, 'bin'))
      writeFileSync(join(dir, 'bin', 'npm'), '#!/bin/sh\necho "$@" >> npm.log\n[ "$3" = "$NPM_FAILS" ] && exit 1\nexit 0\n', { mode: 0o755 })
      const r = spawnSync('bash', [join(repoRoot, '.githooks', 'pre-commit')], { cwd: dir, encoding: 'utf8', timeout: 120_000, env: { ...process.env, ...clean, PATH: `${join(dir, 'bin')}:${process.env.PATH}`, NPM_FAILS: fails } })
      return { r, asked: existsSync(join(dir, 'npm.log')) ? read(join(dir, 'npm.log')).split('\n').filter(Boolean) : [] }
    }
    const anchorsLine = 'run --silent check:mutation-anchors'
    const hookPasses = hookIn('')
    const hookFails = hookIn('check:mutation-anchors')
    check('THE HOOK ASKS FOR THAT SCRIPT AND STOPS WHEN IT FAILS: the real `.githooks/pre-commit` run with an `npm` that logs asks for `check:mutation-anchors` exactly once and finishes (exit 0, "pre-commit: ok") when every script passes; when that script fails the hook exits non-zero, does not finish, and asks for nothing after it (2 runs of the hook, `npm` stubbed)',
      hookPasses.r.status === 0 && /pre-commit: ok/.test(hookPasses.r.stdout) && hookPasses.asked.filter(l => l === anchorsLine).length === 1
        && hookFails.r.status !== 0 && !/pre-commit: ok/.test(hookFails.r.stdout) && hookFails.asked.length > 0 && hookFails.asked[hookFails.asked.length - 1] === anchorsLine,
      `passing run: status ${hookPasses.r.status}, asked ${hookPasses.asked.length} scripts, ${hookPasses.asked.filter(l => l === anchorsLine).length} for the anchors; failing run: status ${hookFails.r.status}, asked ${hookFails.asked.length}, last ${hookFails.asked[hookFails.asked.length - 1] ?? '(none)'}`)
    const gateScript = join(dirname(here), 'confidence.mjs')
    const askGate = cwd => spawnSync(process.execPath, [gateScript], { cwd, encoding: 'utf8', timeout: 120_000, env: { ...process.env, ...clean, MUTATION_SELFTEST_CHILD: '1' } })
    const gateStranded = fresh()
    strandedFixture(gateStranded)
    const gateBefore = listing(gateStranded)
    const gateClean = fresh()
    const gateRefused = askGate(gateStranded)
    const gateGoesOn = askGate(gateClean)
    check('THE GATE REFUSES TO SCORE A STRANDED TREE, AHEAD OF EVERYTHING ELSE: `confidence.mjs` over the stranded fixture exits 2 with the `--stranded` message and `Refusing to score`, runs no row, and touches nothing; over a directory with no marker it is not refused by this check, and goes on to the inventory (which a scratch directory does not have) and fails there (1 stranded directory, 1 clean one)',
      gateRefused.status === 2 && /\(\[stranded\] on src\/Stranded\.fs\)/.test(gateRefused.stdout) && /Refusing to score: `node scripts\/mutation-check\.mjs --stranded` exited 1/.test(gateRefused.stdout)
        && !/\[\s*\d+s\] (PASS|FAIL)/.test(gateRefused.stdout) && listing(gateStranded) === gateBefore
        && !/Refusing to score: `node scripts\/mutation-check\.mjs --stranded`/.test(gateGoesOn.stdout) && /gate-rows\.txt/.test(gateGoesOn.stderr),
      `stranded: status ${gateRefused.status}, ${first(gateRefused) || String(gateRefused.stdout).split('\n').find(l => l.trim()) || '(no output)'}; directory unchanged ${listing(gateStranded) === gateBefore}; clean: status ${gateGoesOn.status}, refused by the check ${/Refusing to score: `node scripts\/mutation-check\.mjs --stranded`/.test(gateGoesOn.stdout)}, stderr names the inventory ${/gate-rows\.txt/.test(gateGoesOn.stderr)}`)

    // ...and it refuses on ANY status of the check but 0, and prints what the check said on BOTH streams (review 7, L6). The real check exits 1 over a stranded state and says it on stdout, so the clause above holds
    // `!== 0` to the one status it can see: `=== 1` passes it, and so does a gate that drops the check's stderr. Here the preflight is the real `confidence.mjs`, COPIED next to a stand-in `mutation-check.mjs`
    // (the preflight finds the script by its own directory) with the three modules it imports linked in: one stand-in exits 2 after writing to both streams, one kills itself, and one exits 0.
    const gateWith = body => {
      const dir = fresh()
      mkdirSync(join(dir, 'scripts'))
      copyFileSync(gateScript, join(dir, 'scripts', 'confidence.mjs'))
      for (const f of ['gate-inventory.mjs', 'gate-checks.mjs', 'checks.mjs']) execSync(`ln -s ${JSON.stringify(join(dirname(here), f))} ${f}`, { cwd: join(dir, 'scripts') })
      writeFileSync(join(dir, 'scripts', 'mutation-check.mjs'), body)
      return spawnSync(process.execPath, [join(dir, 'scripts', 'confidence.mjs')], { cwd: dir, encoding: 'utf8', timeout: 120_000, env: { ...process.env, ...clean, MUTATION_SELFTEST_CHILD: '1' } })
    }
    const gateExit2 = gateWith("process.stdout.write('stand-in said this on stdout\\n'); process.stderr.write('stand-in said this on stderr\\n'); process.exit(2)\n")
    const gateKilled = gateWith("process.kill(process.pid, 'SIGKILL')\n")
    const gateExit0 = gateWith('process.exit(0)\n')
    check('THE GATE REFUSES ON ANY STATUS BUT 0 AND RELAYS BOTH STREAMS: with a check that exits 2 after writing to stdout and to stderr `confidence.mjs` exits 2, prints both lines and "exited 2"; with a check that kills itself it exits 2 and says the check "did not finish"; with a check that exits 0 it is not refused and goes on to the inventory, which a scratch directory does not have (3 stand-ins)',
      gateExit2.status === 2 && /stand-in said this on stdout/.test(gateExit2.stdout) && /stand-in said this on stderr/.test(gateExit2.stdout) && /Refusing to score: `node scripts\/mutation-check\.mjs --stranded` exited 2\. Nothing was run\./.test(gateExit2.stdout)
        && gateKilled.status === 2 && /Refusing to score: `node scripts\/mutation-check\.mjs --stranded` did not finish\. Nothing was run\./.test(gateKilled.stdout)
        && !/Refusing to score: `node scripts\/mutation-check\.mjs --stranded`/.test(gateExit0.stdout) && /gate-rows\.txt/.test(gateExit0.stderr),
      `exit 2: status ${gateExit2.status}, stdout relayed ${/said this on stdout/.test(gateExit2.stdout)}, stderr relayed ${/said this on stderr/.test(gateExit2.stdout)}; killed: status ${gateKilled.status}, ${String(gateKilled.stdout).split('\n').find(l => /Refusing/.test(l))?.trim().slice(0, 140) ?? '(no refusal)'}; exit 0: status ${gateExit0.status}, refused ${/Refusing to score/.test(gateExit0.stdout)}, stderr names the inventory ${/gate-rows\.txt/.test(gateExit0.stderr)}`)

    // A self-test the HARNESS starts as an expectation inherits MUTATION_STATE_DIR (a nested directory beneath its own). It must use a
    // directory of its own, and pass: it did neither, so 20 mutation entries were caught by a self-test that failed on clean source.
    const given = join(scratch, `case-${++caseNo}`, 'nested')
    mkdirSync(given, { recursive: true })
    writeFileSync(join(given, 'active.json'), '{"id":"the-harnesses-own"}')
    const nestedSelf = spawnSync(process.execPath, [here, '--self-test'], { cwd: process.cwd(), encoding: 'utf8', timeout: 120_000, env: { ...process.env, ...clean, MUTATION_STATE_DIR: given, MUTATION_SELFTEST_CHILD: '1' } })
    check('A SELF-TEST STARTED AS AN EXPECTATION PASSES ON CLEAN SOURCE AND LEAVES THE DIRECTORY IT WAS GIVEN: it does not use it',
      nestedSelf.status === 0 && existsSync(join(given, 'active.json')), `status ${nestedSelf.status}, given dir intact ${existsSync(join(given, 'active.json'))}; ${String(nestedSelf.stdout).split('\n').filter(l => /^FAIL/.test(l)).join(' | ')}`)

    // A self-test started from a git hook or a developer's shell carries that environment, and must not act on it. A decoy repository stands for the one being committed (its
    // location is exported the way a hook in a linked worktree exports it), and a home directory whose git configuration runs a failing hook on every commit stands for a
    // developer's own. Run with them, the self-test must pass, leave the decoy as it was, and not be stopped by the hook.
    const decoy = join(scratch, `case-${++caseNo}`)
    mkdirSync(decoy, { recursive: true })
    // The decoy has a commit and a staged file, so that what a stray `git add -A` / `git commit` does to its INDEX and HISTORY, and to its identity, can be seen.
    execSync('git init -q && git config user.email real@real && git config user.name real', { cwd: decoy, stdio: 'pipe' })
    writeFileSync(join(decoy, 'a.txt'), 'a\n')
    execSync('git add -A && git commit -qm decoy', { cwd: decoy, stdio: 'pipe' })
    writeFileSync(join(decoy, 'staged.txt'), 's\n')
    execSync('git add staged.txt', { cwd: decoy, stdio: 'pipe' })
    const homeHooks = join(scratch, `case-${++caseNo}`)
    mkdirSync(join(homeHooks, 'hooks'), { recursive: true })
    writeFileSync(join(homeHooks, 'hooks', 'pre-commit'), '#!/bin/sh\nexit 1\n', { mode: 0o755 })
    writeFileSync(join(homeHooks, '.gitconfig'), `[core]\n\thooksPath = ${join(homeHooks, 'hooks')}\n`)
    const decoyGit = cmd => { try { return execSync(`git ${cmd}`, { cwd: decoy, encoding: 'utf8', stdio: 'pipe' }).trim() } catch (e) { return `failed: ${String(e.message).split('\n')[0]}` } }
    // HEAD, identity, bare-ness, what is staged, and `git status` (which fails outright if the index points at objects the repository does not have).
    const decoyState = () => [decoyGit('rev-parse HEAD'), decoyGit('config user.email'), decoyGit('config core.bare'), decoyGit('ls-files -s'), decoyGit('status --porcelain')].join(' | ')
    const decoyBefore = decoyState()
    const hooked = spawnSync(process.execPath, [here, '--self-test'], { cwd: process.cwd(), encoding: 'utf8', timeout: 120_000,
      env: { ...process.env, ...clean, MUTATION_SELFTEST_CHILD: '1', HOME: homeHooks, XDG_CONFIG_HOME: join(homeHooks, 'xdg'),
        GIT_DIR: join(decoy, '.git'), GIT_INDEX_FILE: join(decoy, '.git', 'index'), GIT_WORK_TREE: decoy, GIT_OBJECT_DIRECTORY: join(decoy, '.git', 'objects') } })
    const decoyAfter = decoyState()
    check('A SELF-TEST STARTED FROM A HOOK OR A DEVELOPER\'S SHELL IGNORES THEIR GIT ENVIRONMENT: it passes, and the repository they pointed it at comes out exactly as it went in (history, identity, work tree, index, status), their configured hook never running',
      hooked.status === 0 && decoyBefore === decoyAfter && !/failed:/.test(decoyAfter),
      `status ${hooked.status}; decoy before ${decoyBefore.slice(0, 160)}; after ${decoyAfter.slice(0, 160)}; ${String(hooked.stdout).split('\n').filter(l => /^FAIL/.test(l)).join(' | ').slice(0, 200)} ${String(hooked.stderr).split('\n')[0]}`)

    // A scratch git repository with the files three real table entries act on, and the real script copied in. The runs below are real
    // processes, killed with SIGKILL at a chosen moment (MUTATION_KILL_AT), and then a second run heals.
    // The write-ups are named for a day, and the two world mutations that act on them ask `date` which day it is. A day read once here and again by the mutation went red when midnight ET
    // fell between the two (measured 2026-11-05 with a stand-in `date` that rolled the day on its second answer: 16 clauses, E3 to E24 among them). So both read one day: a constant that
    // is not today, and a `date` first on the PATH of every run `go` starts that answers the question `+%F` with it. A run that did not get the stand-in would find no write-up and fail.
    // Anything else asked of `date` (the `expect-writes-unrelated` fault asks for `+%s`) is the real one's: the stand-in drops its own directory from PATH and runs it.
    const day = '2000-01-01'
    const bin = join(scratch, 'bin')
    mkdirSync(bin)
    writeFileSync(join(bin, 'date'), `#!/bin/sh\nif [ "$#" = 1 ] && [ "$1" = "+%F" ]; then echo ${day}; exit 0; fi\nPATH=\${PATH#${bin}:}\nexec date "$@"\n`, { mode: 0o755 })
    const repo = join(scratch, 'e2e-repo')
    mkdirSync(join(repo, 'scripts'), { recursive: true })
    mkdirSync(join(repo, 'docs'))
    mkdirSync(join(repo, 'outbox'))
    for (const f of ['mutation-check.mjs', 'checks.mjs', 'mutation-lib.mjs', 'run-marker.mjs']) copyFileSync(join(dirname(here), f), join(repo, 'scripts', f))
    // The row an expectation runs. Empty, it passes; with ROW_FAILS_ON_STUB set it fails while a write-up is a stub, which makes `outbox-stub` a CAUGHT mutation (a run that ends green).
    writeFileSync(join(repo, 'scripts', 'run-row.mjs'),
      "import { readdirSync, readFileSync } from 'node:fs'\nif (process.env.ROW_FAILS_ON_STUB && readdirSync('outbox').some(f => readFileSync('outbox/' + f, 'utf8') === 'stub\\n')) process.exit(1)\n")
    // The heal of a source mutation ends in `npm run build`, and a failed build now stops the run, so the fixture has one. It records that it ran, and can be told to take its time
    // (BUILD_SLEEP_MS), which is how a second run is started while the first is still healing.
    writeFileSync(join(repo, 'package.json'), JSON.stringify({ name: 'scratch', private: true, scripts: { build: 'node scripts/fake-build.mjs' } }))
    writeFileSync(join(repo, 'scripts', 'fake-build.mjs'),
      "import { appendFileSync } from 'node:fs'\nappendFileSync('.build-log', 'build\\n')\n"
      + "if (process.env.BUILD_NOISE_MB) process.stdout.write('x'.repeat(Number(process.env.BUILD_NOISE_MB) * 1024 * 1024))\n"
      + "if (process.env.BUILD_FAIL) { console.error('fake build failed on purpose'); process.exit(1) }\n"
      + "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(process.env.BUILD_SLEEP_MS || 0))\n")
    const rows = '# THE GATE IS A CONJUNCTION.\nthe rest of the file\n'
    const writeUps = { [`outbox/cc-session-${day}-one.md`]: 'the first write-up, long enough to matter\n', [`outbox/cc-session-${day}-two.md`]: 'the second write-up\n' }
    // The real repository ignores the state directory (.gitignore); the snapshot of the tree is git's view, so the fixture has to ignore it too.
    writeFileSync(join(repo, '.gitignore'), '.mutation-state/\n.build-log\n')
    writeFileSync(join(repo, 'docs', 'gate-rows.txt'), rows)
    for (const [p, text] of Object.entries(writeUps)) writeFileSync(join(repo, p), text)
    const git = cmd => execSync(`git ${cmd}`, { cwd: repo, stdio: 'pipe', encoding: 'utf8' })
    git('init -q'); git('config user.email t@t'); git('config user.name t'); git('add -A'); git('commit -qm base')
    const reset = () => {
      rmSync(join(repo, '.mutation-state'), { recursive: true, force: true })
      rmSync(join(repo, '.build-log'), { force: true })
      git('checkout -q -- .'); git('clean -fdq')
      for (const [p, text] of Object.entries(writeUps)) writeFileSync(join(repo, p), text)
    }
    const buildsRun = () => (existsSync(join(repo, '.build-log')) ? readFileSync(join(repo, '.build-log'), 'utf8').split('\n').filter(Boolean).length : 0)
    // MUTATION_SELFTEST_CHILD for everything started here: a run that is NOT the mode it was asked for (a mutated copy that ignores `--heal` or `--only` falls into the whole
    // suite, whose baseline runs `--self-test`, whose group E starts these runs again) would otherwise recurse until the timeouts end it. Found when `no-heal-mode` did exactly that.
    const go = (args, env = {}) => spawnSync(process.execPath, ['scripts/mutation-check.mjs', ...args], { cwd: repo, encoding: 'utf8', timeout: 120_000, env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, ...clean, MUTATION_SELFTEST_CHILD: '1', ...env } })
    const text = r => `${r.stdout}${r.stderr}`
    const markerOf = () => JSON.parse(readFileSync(join(repo, '.mutation-state', 'active.json'), 'utf8'))
    const stateLeft = () => existsSync(join(repo, '.mutation-state', 'active.json'))
    const writeUpsBack = () => Object.entries(writeUps).every(([p, t]) => read(join(repo, p)) === t)
    const MUTATED_ROWS = rows.replace('# THE GATE IS A CONJUNCTION.', '# THE GATE IS A CONJUNCTION (mutated).')

    // E1: a source mutation, SIGKILLed the moment it is applied.
    reset()
    const k1 = go(['--only', 'known-survivor'], { MUTATION_KILL_AT: 'source-applied' })
    let m1 = null
    try { m1 = markerOf() } catch { m1 = null }
    let lockOf1 = null
    try { lockOf1 = JSON.parse(readFileSync(join(repo, '.mutation-state', 'run.json'), 'utf8')) } catch { lockOf1 = null }
    check('E1: A REAL SIGKILL RIGHT AFTER A SOURCE MUTATION LEAVES THE FILE MUTATED, THE BACKUP, AND A MARKER THAT RECORDS ITS HASHES AND WHO WROTE IT',
      k1.signal === 'SIGKILL' && read(join(repo, 'docs/gate-rows.txt')) === MUTATED_ROWS && m1 !== null && m1.id === 'known-survivor'
        && m1.originalSha === sha(rows) && m1.mutatedSha === sha(MUTATED_ROWS) && Number.isInteger(m1.pid) && read(m1.backup && join(repo, m1.backup)) === rows && (!haveProc || typeof m1.start === 'string')
        && lockOf1 !== null && lockOf1.pid === m1.pid,
      `signal ${k1.signal}, file mutated ${read(join(repo, 'docs/gate-rows.txt')) === MUTATED_ROWS}, marker ${JSON.stringify(m1)}`)
    const h1 = go(['--only', 'known-survivor'])
    check('E1: ...and the next run HEALS it: the file is back, NO build was run (a docs file cannot reach build/), the state is gone',
      /HEALED/.test(text(h1)) && read(join(repo, 'docs/gate-rows.txt')) === rows && !existsSync(join(repo, '.mutation-state')) && buildsRun() === 0,
      `${text(h1).split('\n').filter(l => /HEALED|::error::/.test(l)).join(' | ')}; file back ${read(join(repo, 'docs/gate-rows.txt')) === rows}; builds ${buildsRun()}`)
    // ...so a build that FAILS cannot wedge it. (It used to: the forced rebuild failed, the marker stayed, and every later run refused over a file that was already back.)
    reset()
    go(['--only', 'known-survivor'], { MUTATION_KILL_AT: 'source-applied' })
    const h1w = go(['--only', 'known-survivor'], { BUILD_FAIL: '1' })
    check('E1: ...and a build that would fail cannot wedge the heal of a file the build never reads: HEALED, the file is back, no build ran, nothing was refused, the state is gone',
      /HEALED/.test(text(h1w)) && read(join(repo, 'docs/gate-rows.txt')) === rows && !existsSync(join(repo, '.mutation-state')) && buildsRun() === 0 && !/npm run build/.test(text(h1w)),
      `${text(h1w).split('\n').filter(l => /HEALED|::error::/.test(l)).join(' | ').slice(0, 220)}; builds ${buildsRun()}`)

    // E2: the same kill, then the stranded file is edited before the next run.
    reset()
    go(['--only', 'known-survivor'], { MUTATION_KILL_AT: 'source-applied' })
    writeFileSync(join(repo, 'docs/gate-rows.txt'), `${MUTATED_ROWS}edited by a person after the kill\n`)
    const h2 = go(['--only', 'known-survivor'])
    check('E2: A FILE EDITED AFTER THE KILL IS NOT WRITTEN OVER: the next run stops, the file is untouched, the state is kept',
      h2.status === 1 && /neither the original nor the mutation/.test(text(h2)) && read(join(repo, 'docs/gate-rows.txt')) === `${MUTATED_ROWS}edited by a person after the kill\n` && stateLeft(),
      `status ${h2.status}; ${text(h2).split('\n').filter(l => /::error::/.test(l)).join(' | ').slice(0, 200)}`)

    // E3 to E5: a world mutation (the real outbox-stub entry) killed once it is applied.
    reset()
    const k3 = go(['--only', 'outbox-stub'], { MUTATION_KILL_AT: 'world-applied' })
    let m3 = null
    try { m3 = markerOf() } catch { m3 = null }
    const stash = join(repo, '.mutation-state', 'world', 'outbox-stub')
    const stashHolds = Object.keys(writeUps).every(p => read(join(stash, p.split('/').pop())) === writeUps[p])
    check('E3: A REAL SIGKILL WHILE THE WRITE-UPS ARE REPLACED BY STUBS LEAVES THEM IN A STASH INSIDE THE STATE DIRECTORY, AND A MARKER THAT NAMES THE PATHS TOUCHED AND THE COMMIT THE TREE WAS ON',
      k3.signal === 'SIGKILL' && Object.keys(writeUps).every(p => read(join(repo, p)) === 'stub\n') && stashHolds && m3 !== null
        && Object.keys(m3.touched ?? {}).sort().join() === Object.keys(writeUps).sort().join() && m3.head === git('rev-parse HEAD').trim(),
      `signal ${k3.signal}, stash holds the originals ${stashHolds}, touched ${m3 && Object.keys(m3.touched ?? {})}`)
    // `--stranded` over a world mutation that recorded its paths says the three things the heal can do with it (put them back, drop the state, refuse naming the paths) and that it needs git to say which;
    // the heal that follows (E3 below, E4) is the first of them.
    const stash3 = listing(join(repo, '.mutation-state'))
    const s3 = go(['--stranded'])
    check('E3: ...and `--stranded` over that state calls it a change made outside the source, says the heal puts the paths back from the stash if they are still as the mutation left them, drops the state if they are back and refuses naming the paths if one changed, and touches nothing: the state directory is byte-identical and the write-ups are still stubs',
      s3.status === 1 && /is a change made outside the source that a killed run left \(\[outbox-stub\] on the tree\)/.test(text(s3)) && /needs git, which this mode does not run: `node scripts\/mutation-check\.mjs --heal` puts the paths back from the stash if they are still as the mutation left them, drops the state if they are already back, and refuses, naming the paths, if one changed after the kill/.test(text(s3))
        && !/would carry the mutation|Heal it first/.test(text(s3)) && listing(join(repo, '.mutation-state')) === stash3 && Object.keys(writeUps).every(p => read(join(repo, p)) === 'stub\n'),
      `status ${s3.status}; ${text(s3).split('\n')[0].slice(0, 300)}; state directory unchanged ${listing(join(repo, '.mutation-state')) === stash3}`)
    writeFileSync(join(repo, 'unrelated-file.txt'), 'written by someone else after the kill\n')
    const h3 = go(['--only', 'known-survivor'])
    check('E3: ...and the next run HEALS it although an unrelated file appeared meanwhile: the write-ups are back byte for byte, the unrelated file is still there, the state is gone',
      /HEALED/.test(text(h3)) && writeUpsBack() && read(join(repo, 'unrelated-file.txt')) === 'written by someone else after the kill\n' && !existsSync(join(repo, '.mutation-state')) && buildsRun() === 0,
      `${text(h3).split('\n').filter(l => /HEALED|::error::/.test(l)).join(' | ').slice(0, 220)}; write-ups back ${writeUpsBack()}`)

    reset()
    go(['--only', 'outbox-stub'], { MUTATION_KILL_AT: 'world-applied' })
    writeFileSync(join(repo, `outbox/cc-session-${day}-one.md`), 'a person rewrote this write-up after the kill\n')
    const h4 = go(['--only', 'known-survivor'])
    check('E4: A WRITE-UP EDITED AFTER THE KILL IS NOT RESTORED OVER: the next run stops, runs nothing, and the stash is still there',
      h4.status === 1 && /neither as it was nor as the mutation left it/.test(text(h4)) && read(join(repo, `outbox/cc-session-${day}-one.md`)) === 'a person rewrote this write-up after the kill\n'
        && read(join(stash, `cc-session-${day}-one.md`)) === writeUps[`outbox/cc-session-${day}-one.md`] && stateLeft(),
      `status ${h4.status}; ${text(h4).split('\n').filter(l => /::error::/.test(l)).join(' | ').slice(0, 200)}`)
    check('E4: ...and its refusal does not tell a person to put the stash back over the edit: it says to put back only the paths still as the mutation left them, then to delete the state once what is still needed is out of the stash (the stash holds both write-ups, the edited one among them), and never "put it back first"',
      /only the paths that are still as the mutation left them/.test(text(h4)) && /Then delete \.mutation-state to clear this: it holds the only copy of what was moved aside, so take anything you still need out of \.mutation-state\/world first\./.test(text(h4)) && !/put it back first/.test(text(h4))
        && Object.keys(writeUps).every(p => read(join(stash, p.split('/').pop())) === writeUps[p]),
      text(h4).split('\n').filter(l => /::error::/.test(l)).join(' | ').slice(-300))

    // E5: an exception inside the window, which the handler can see: it must put the write-ups back BEFORE it clears the state.
    reset()
    const k5 = go(['--only', 'outbox-stub'], { MUTATION_KILL_AT: 'world-applied', MUTATION_KILL_SIGNAL: 'throw' })
    check('E5: AN EXCEPTION WHILE THE WRITE-UPS ARE STUBBED IS UNDONE BY THE EXIT HANDLER BEFORE THE STASH GOES: the write-ups are back and the state is gone',
      k5.status === 1 && writeUpsBack() && !existsSync(join(repo, '.mutation-state')) && /MUTATION_KILL_AT=world-applied/.test(text(k5)),
      `status ${k5.status}, write-ups back ${writeUpsBack()}, state gone ${!existsSync(join(repo, '.mutation-state'))}, the exception said ${/MUTATION_KILL_AT=world-applied/.test(text(k5))}`)

    // E6: a restore that does not work (the fault hook) must keep the state, and the next run must finish the job.
    reset()
    const k6 = go(['--only', 'outbox-stub'], { MUTATION_FAULT: 'world-restore-noop' })
    const stubbed = Object.keys(writeUps).every(p => read(join(repo, p)) === 'stub\n')
    check('E6: A RESTORE THAT DID NOT WORK IS REPORTED AND KEEPS THE STATE AND THE STASH, instead of clearing them',
      k6.status === 1 && /did not return what the mutation touched/.test(text(k6)) && stubbed && stateLeft() && stashHolds && Object.keys(writeUps).every(p => read(join(stash, p.split('/').pop())) === writeUps[p]),
      `status ${k6.status}, stubs still in place ${stubbed}, state kept ${stateLeft()}; ${text(k6).split('\n').filter(l => /::error::/.test(l)).join(' | ').slice(0, 160)}`)
    const h6 = go(['--only', 'known-survivor'])
    check('E6: ...and the next run finishes it: HEALED, the write-ups are back, and no build ran (a heal that moves write-ups has no use for one)',
      /HEALED/.test(text(h6)) && writeUpsBack() && !existsSync(join(repo, '.mutation-state')) && buildsRun() === 0, `${text(h6).split('\n').filter(l => /HEALED|::error::/.test(l)).join(' | ').slice(0, 200)}; builds ${buildsRun()}`)

    // E7: one run at a time.
    reset()
    mkdirSync(join(repo, '.mutation-state'), { recursive: true })
    writeFileSync(join(repo, '.mutation-state', 'run.json'), JSON.stringify({ pid: process.pid, start: startOf(process.pid), startedAt: DEAD.startedAt }))
    const h7 = go(['--only', 'known-survivor'])
    const untouched7 = read(join(repo, 'docs/gate-rows.txt')) === rows
    // The run that was refused must not release a lock it never held: the live holder's lock is still there, naming it.
    let heldAfter7 = null
    try { heldAfter7 = JSON.parse(readFileSync(join(repo, '.mutation-state', 'run.json'), 'utf8')) } catch { heldAfter7 = null }
    check('E7: ...and the refused run leaves the live holder\'s lock where it was, naming the holder',
      heldAfter7 !== null && heldAfter7.pid === process.pid, `lock after the refusal: ${JSON.stringify(heldAfter7)}`)
    mkdirSync(join(repo, '.mutation-state'), { recursive: true })
    writeFileSync(join(repo, '.mutation-state', 'run.json'), JSON.stringify(DEAD))
    const h7b = go(['--only', 'known-survivor'])
    check('E7: A SECOND RUN WHILE ANOTHER IS GOING STOPS BEFORE IT TOUCHES ANYTHING, and a lock left by a run that is gone does not',
      h7.status === 1 && /IN PROGRESS/.test(text(h7)) && untouched7 && /known-survivor/.test(text(h7b)) && !/IN PROGRESS/.test(text(h7b)),
      `live holder: status ${h7.status}, untouched ${untouched7}; stale lock: ran ${/known-survivor/.test(text(h7b))}`)

    // E8: an expectation that deletes the harness's own state (the test-only fault does it before the real command) is noticed AFTER the file is back.
    reset()
    const k8 = go(['--only', 'known-survivor'], { MUTATION_FAULT: 'expect-wipes-state' })
    check('E8: AN EXPECTATION THAT DELETES THE HARNESS\'S OWN STATE IS NOTICED: the file is back from memory, and the run stops and says so',
      k8.status === 1 && /deleted or changed this run's own state/.test(text(k8)) && read(join(repo, 'docs/gate-rows.txt')) === rows,
      `status ${k8.status}, file back ${read(join(repo, 'docs/gate-rows.txt')) === rows}; ${text(k8).split('\n').filter(l => /::error::/.test(l)).join(' | ').slice(0, 200)}`)
    // ...and a world mutation's expectation likewise: the stash is still there, so the write-ups are restored, and only then does the run say so.
    // (An expectation that deleted the stash too would leave the restore failing, which the run also reports, as a failed restore: that case is E6's.)
    reset()
    const k9 = go(['--only', 'outbox-stub'], { MUTATION_FAULT: 'expect-wipes-state' })
    check('E8: ...and so is a world mutation\'s: the write-ups are back from the stash, and the run stops and says so',
      k9.status === 1 && /deleted or changed this run's own state/.test(text(k9)) && writeUpsBack(),
      `status ${k9.status}; write-ups back ${writeUpsBack()}; ${text(k9).split('\n').filter(l => /::error::/.test(l)).join(' | ').slice(0, 220)}`)

    // E9: an exception while a SOURCE file is mutated. E5 is the same for a world mutation; nothing else sent the exit handler through the source half of restore().
    reset()
    const k10 = go(['--only', 'known-survivor'], { MUTATION_KILL_AT: 'source-applied', MUTATION_KILL_SIGNAL: 'throw' })
    check('E9: AN EXCEPTION WHILE A SOURCE FILE IS MUTATED IS UNDONE BY THE EXIT HANDLER: the file is back from its backup, and the state is gone',
      k10.status === 1 && read(join(repo, 'docs/gate-rows.txt')) === rows && !existsSync(join(repo, '.mutation-state')) && /MUTATION_KILL_AT=source-applied/.test(text(k10)),
      `status ${k10.status}, file back ${read(join(repo, 'docs/gate-rows.txt')) === rows}, state gone ${!existsSync(join(repo, '.mutation-state'))}`)

    // E10: killed AFTER the marker and backup are written and BEFORE the file is touched (and, for a world mutation, before anything is moved). The order of those writes is what
    // makes a kill at any later moment recoverable; a kill at 'source-applied' or 'world-applied' comes after both writes, so it cannot see the order.
    reset()
    const kp = go(['--only', 'known-survivor'], { MUTATION_KILL_AT: 'source-prepared', MUTATION_FAULT: 'build-never-verified' })
    let mp = null
    try { mp = markerOf() } catch { mp = null }
    check('E10: A KILL AFTER THE MARKER AND BACKUP ARE WRITTEN AND BEFORE THE FILE IS TOUCHED LEAVES BOTH, AND THE FILE AS IT WAS (the order those writes exist to guarantee)',
      kp.signal === 'SIGKILL' && mp !== null && mp.id === 'known-survivor' && read(join(repo, mp.backup)) === rows && read(join(repo, 'docs/gate-rows.txt')) === rows,
      `signal ${kp.signal}, marker ${JSON.stringify(mp)}, file untouched ${read(join(repo, 'docs/gate-rows.txt')) === rows}`)
    const hp = go(['--only', 'known-survivor'])
    check('E10: ...and the next run says there was nothing to heal, rebuilds once, and drops the state',
      /Nothing to heal/.test(text(hp)) && !/HEALED/.test(text(hp)) && buildsRun() === 1 && !existsSync(join(repo, '.mutation-state')) && read(join(repo, 'docs/gate-rows.txt')) === rows,
      `${text(hp).split('\n').filter(l => /Nothing to heal|HEALED|::error::/.test(l)).join(' | ').slice(0, 200)}; builds ${buildsRun()}`)
    reset()
    // A tracked file a person had already modified when the run started: it is in the marker's `before`, and the next run must read it as unchanged, not as damage.
    const DIRTY_ROWS = `${rows}a line a person had not committed yet\n`
    writeFileSync(join(repo, 'docs/gate-rows.txt'), DIRTY_ROWS)
    const kw = go(['--only', 'outbox-stub'], { MUTATION_KILL_AT: 'world-prepared' })
    let mw = null
    try { mw = markerOf() } catch { mw = null }
    check('E10: ...and a world mutation killed after its marker is written and before it has moved anything leaves the marker (no paths recorded yet), the stash directory, and every write-up as it was',
      kw.signal === 'SIGKILL' && mw !== null && mw.id === 'outbox-stub' && mw.touched === undefined && existsSync(stash) && writeUpsBack(),
      `signal ${kw.signal}, marker ${JSON.stringify(mw && { id: mw.id, touched: mw.touched })}, stash directory ${existsSync(stash)}, write-ups as they were ${writeUpsBack()}`)
    const hw = go(['--only', 'known-survivor'])
    check('E10: ...and the next run finds nothing to heal although a tracked file was already modified (the tree is as it was before the mutation: the marker recorded it), the write-ups and that file are untouched, and no build ran',
      /Nothing to heal/.test(text(hw)) && writeUpsBack() && read(join(repo, 'docs/gate-rows.txt')) === DIRTY_ROWS && !existsSync(join(repo, '.mutation-state')) && buildsRun() === 0,
      `${text(hw).split('\n').filter(l => /Nothing to heal|HEALED|::error::/.test(l)).join(' | ').slice(0, 200)}; builds ${buildsRun()}`)

    // E11: `--heal` heals and stops.
    reset()
    go(['--only', 'known-survivor'], { MUTATION_KILL_AT: 'source-applied', MUTATION_FAULT: 'build-never-verified' })
    const hh = go(['--heal'])
    const hh2 = go(['--heal'])
    check('E11: `--heal` RESTORES A STRANDED FILE AND STOPS THERE: the file is back, the build ran once, the state is gone, and no mutation was run',
      hh.status === 0 && /HEALED/.test(text(hh)) && read(join(repo, 'docs/gate-rows.txt')) === rows && buildsRun() === 1 && !existsSync(join(repo, '.mutation-state')) && !/Mutation testing/.test(text(hh)),
      `status ${hh.status}; ${text(hh).split('\n').filter(l => /HEALED|::error::|Mutation testing/.test(l)).join(' | ').slice(0, 200)}; builds ${buildsRun()}`)
    check('E11: ...and with nothing stranded it says so and exits 0',
      hh2.status === 0 && /Nothing to heal: no run left a mutation applied/.test(text(hh2)) && !/Mutation testing/.test(text(hh2)), `status ${hh2.status}; ${text(hh2).slice(0, 200)}`)

    // E12: a stranded mutation of a file the harness is built from. The run that heals it had loaded the mutated copy; it must start again as the restored one.
    const selfFile = join(repo, 'scripts', 'run-marker.mjs')
    const selfOriginal = readFileSync(selfFile, 'utf8')
    const selfMutated = `${selfOriginal}\n// MUTATED by a killed run\n`
    const strandSelf = () => {
      reset()
      mkdirSync(join(repo, '.mutation-state'), { recursive: true })
      const selfBackup = join('.mutation-state', 'scripts_run-marker.mjs')
      writeFileSync(join(repo, selfBackup), selfOriginal)
      writeFileSync(selfFile, selfMutated)
      writeFileSync(join(repo, '.mutation-state', 'active.json'), JSON.stringify({ id: 'strand-self', file: 'scripts/run-marker.mjs', backup: selfBackup, originalSha: sha(selfOriginal), mutatedSha: sha(selfMutated), ...DEAD }))
    }
    strandSelf()
    const hr = go(['--only', 'known-survivor'])
    const againLines = text(hr).split('\n').filter(l => /starts again as the restored code/.test(l)).length
    check('E12: A HEAL THAT RESTORES A FILE THE HARNESS IS BUILT FROM STARTS THE RUN AGAIN AS THE RESTORED CODE: it says so once, the file is back, and the run that follows is the whole one',
      /HEALED/.test(text(hr)) && againLines === 1 && read(selfFile) === selfOriginal && /FAIL  \[known-survivor\]/.test(text(hr)) && hr.status === 1,
      `status ${hr.status}, said it ${againLines} time(s), file back ${read(selfFile) === selfOriginal}; ${text(hr).split('\n').filter(l => /HEALED|starts again|FAIL|::error::/.test(l)).join(' | ').slice(0, 260)}`)
    // ...and the restart is a NEW PROCESS that knows it is the restart, and its fate is the run's. The clause above cannot tell a restart from the same process carrying on (the
    // stranded file differs from the original by a comment); this one kills the run that follows the heal, which a continuation would take down with it.
    strandSelf()
    const hk = go(['--only', 'known-survivor'], { MUTATION_KILL_AT: 'source-applied' })
    let mk = null
    try { mk = markerOf() } catch { mk = null }
    check('E12: ...the restart is a new process told that it is one, and when it is killed the run that started it exits 1 (it is not killed itself, and does not exit 0)',
      hk.status === 1 && hk.signal === null && /\(this run is the restored code/.test(text(hk)) && /starts again as the restored code/.test(text(hk)) && mk !== null && mk.id === 'known-survivor',
      `status ${hk.status}, signal ${hk.signal}; ${text(hk).split('\n').filter(l => /HEALED|starts again|restored code|::error::/.test(l)).join(' | ').slice(0, 260)}; marker ${JSON.stringify(mk && { id: mk.id })}`)
    // ...and a restarted run that ends GREEN ends the run that started it green: its status is passed on, not replaced by a failure (`again.status || 1` turns 0 into 1).
    strandSelf()
    const hz = go(['--only', 'outbox-stub'], { ROW_FAILS_ON_STUB: '1' })
    check('E12: ...the restart\'s own exit status is the run\'s: a restarted run that catches its mutation exits 0, and so does the run that started it',
      hz.status === 0 && /starts again as the restored code/.test(text(hz)) && /2\/2 checks passed/.test(text(hz)) && /PASS  \[outbox-stub\]/.test(text(hz)) && writeUpsBack(),
      `status ${hz.status}; ${text(hz).split('\n').filter(l => /HEALED|starts again|PASS|FAIL|checks passed|::error::/.test(l)).join(' | ').slice(0, 260)}; write-ups back ${writeUpsBack()}`)
    // ...and a run that IS the restart does not restart again, and its children do not inherit the flag (the baseline's self-test did, and could not re-exec in its own group E).
    strandSelf()
    const hg = go(['--only', 'known-survivor'], { MUTATION_REEXEC: '1', MUTATION_FAULT: 'expect-reports-env' })
    check('E12: ...a run started as the restart heals in place and does not restart again, and what it starts does not inherit the flag',
      /HEALED/.test(text(hg)) && !/starts again as the restored code/.test(text(hg)) && read(selfFile) === selfOriginal && /FAIL  \[known-survivor\]/.test(text(hg)) && read(join(repo, 'expect-env.txt')) === 'REEXEC=[]\n',
      `${text(hg).split('\n').filter(l => /HEALED|starts again|FAIL|::error::/.test(l)).join(' | ').slice(0, 200)}; the expectation saw ${JSON.stringify(read(join(repo, 'expect-env.txt')))}`)

    // E13: two runs over one stranded marker. The first heals (its build takes two seconds); the second starts while it does. It must be refused by the first's lock, and the
    // first must finish with its state intact. (With the lock taken after the heal, both healed, and the slower one's cleanup deleted the faster one's lock.)
    reset()
    go(['--only', 'known-survivor'], { MUTATION_KILL_AT: 'source-applied', MUTATION_FAULT: 'build-never-verified' })
    const runA = spawn(process.execPath, ['scripts/mutation-check.mjs', '--only', 'known-survivor'], { cwd: repo, env: { ...process.env, ...clean, MUTATION_SELFTEST_CHILD: '1', BUILD_SLEEP_MS: '2000' } })
    let outA = ''
    runA.stdout.on('data', d => { outA += d })
    runA.stderr.on('data', d => { outA += d })
    const doneA = new Promise(done => runA.on('close', (code, signal) => done({ code, signal })))
    for (let waited = 0; buildsRun() === 0 && waited < 160; waited++) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
    const startedMidHeal = buildsRun() > 0
    const runB = go(['--only', 'known-survivor'])
    const resultA = await doneA
    check('E13: A SECOND RUN STARTED WHILE THE FIRST IS HEALING IS REFUSED BY ITS LOCK, and the first finishes with its own state intact',
      startedMidHeal && runB.status === 1 && /IN PROGRESS/.test(text(runB)) && /HEALED/.test(outA) && /FAIL  \[known-survivor\]/.test(outA)
        && !/deleted or changed this run's own state/.test(outA) && resultA.code === 1 && read(join(repo, 'docs/gate-rows.txt')) === rows,
      `second run started during the first's build: ${startedMidHeal}; second: status ${runB.status}, refused ${/IN PROGRESS/.test(text(runB))}; first: code ${resultA.code}, ${outA.split('\n').filter(l => /HEALED|::error::|FAIL/.test(l)).join(' | ').slice(0, 220)}`)

    // E14: a run that ends in a handler (an exception, a catchable signal, fatal()) with a source mutation's build not yet verified clean puts the FILE back but keeps the marker, so the
    // next run rebuilds. (Test-only fault: a docs mutation is treated as one whose build is dirty, since a source one would need the Fable build.)
    reset()
    const kd = go(['--only', 'known-survivor'], { MUTATION_FAULT: 'build-never-verified', MUTATION_KILL_AT: 'source-applied', MUTATION_KILL_SIGNAL: 'throw' })
    let md = null
    try { md = markerOf() } catch { md = null }
    check('E14: A HANDLER THAT PUTS A SOURCE FILE BACK BEFORE ITS BUILD IS VERIFIED CLEAN KEEPS THE MARKER AND BACKUP: the file is back, and the marker still names it',
      kd.status === 1 && md !== null && md.id === 'known-survivor' && read(join(repo, 'docs/gate-rows.txt')) === rows && read(join(repo, md.backup)) === rows,
      `status ${kd.status}, marker ${JSON.stringify(md && { id: md.id })}, file back ${read(join(repo, 'docs/gate-rows.txt')) === rows}`)
    // ...and `--stranded` over the state a caught interrupt really leaves says the file is BACK. It called it "a mutation a killed run left applied ... a commit would carry the mutation" (review 7, C2),
    // which is false for the file and for any commit. The next clause is what the heal then does, so the sentence is held to it.
    const sd = go(['--stranded'])
    check('E14: ...and `--stranded` over that state says the file is already back as it was and that build/ may still hold the mutation, exits 1, does not say "would carry the mutation", and touches neither the file nor the marker',
      sd.status === 1 && /is already back as it was/.test(text(sd)) && /build\/ may still hold the mutation/.test(text(sd)) && /Rebuild and clear it: node scripts\/mutation-check\.mjs --heal/.test(text(sd)) && !/would carry the mutation|left applied/.test(text(sd))
        && read(join(repo, 'docs/gate-rows.txt')) === rows && stateLeft() && md !== null && JSON.stringify(markerOf()) === JSON.stringify(md),
      `status ${sd.status}; ${text(sd).split('\n')[0].slice(0, 260)}; file back ${read(join(repo, 'docs/gate-rows.txt')) === rows}, marker kept ${stateLeft()}`)
    const hd = go(['--only', 'known-survivor'])
    check('E14: ...and the next run reads "already undone", rebuilds, and drops it',
      /Nothing to heal/.test(text(hd)) && buildsRun() === 1 && !existsSync(join(repo, '.mutation-state')), `${text(hd).split('\n').filter(l => /Nothing to heal|HEALED|::error::/.test(l)).join(' | ').slice(0, 200)}; builds ${buildsRun()}`)

    // E15: a file nobody asked for, written while a world mutation is applied, is not "the restore failed".
    reset()
    const ku = go(['--only', 'outbox-stub'], { MUTATION_FAULT: 'expect-writes-unrelated' })
    // The fault writes `date +%s`. A `date` that did not run (the stand-in above exits 2 if it does not pass this question through) still leaves the file, empty: the redirect creates it.
    const unrelatedStamp = read(join(repo, 'unrelated-during-window.txt')).trim()
    check('E15: AN UNRELATED FILE WRITTEN WHILE A WORLD MUTATION IS APPLIED DOES NOT ABORT A HEALTHY RUN: the write-ups are back, the state is gone, and no restore failure is reported',
      writeUpsBack() && /^\d{10,}$/.test(unrelatedStamp) && !existsSync(join(repo, '.mutation-state')) && !/did not return what the mutation touched/.test(text(ku)) && !/deleted or changed this run's own state/.test(text(ku)),
      `write-ups back ${writeUpsBack()}, the fault wrote ${JSON.stringify(unrelatedStamp)}, state gone ${!existsSync(join(repo, '.mutation-state'))}; ${text(ku).split('\n').filter(l => /::error::|did not return/.test(l)).join(' | ').slice(0, 200)}`)
    // ...and where `date` is not GNU's. A first-on-PATH `date` that prints `%N` as the letter (BSD and busybox do; measured 2026-11-05 on a stand-in that answered `+%s%N` with `1793915440N`) failed the clause above
    // on a machine whose fault asked for nanoseconds, for a reason that has nothing to do with the harness. The fault asks for seconds, which every date answers; this runs it with that date first on the PATH.
    const bsdBin = join(scratch, 'bsd-bin')
    mkdirSync(bsdBin)
    writeFileSync(join(bsdBin, 'date'), `#!/bin/sh\na=$(printf '%s' "$1" | sed 's/%N/N/g')\nshift\nPATH=\${PATH#${bsdBin}:}\nexec date "$a" "$@"\n`, { mode: 0o755 })
    reset()
    const kbsd = go(['--only', 'outbox-stub'], { MUTATION_FAULT: 'expect-writes-unrelated', PATH: `${bsdBin}:${bin}:${process.env.PATH}` })
    const bsdStamp = read(join(repo, 'unrelated-during-window.txt')).trim()
    check('E15: ...AND SO IS THE SAME FAULT WHERE `date` IS NOT GNU\'S (it prints `%N` as the letter, as BSD and busybox do): the file holds a timestamp in digits, the write-ups are back and the state is gone (1 run)',
      /^\d{10,}$/.test(bsdStamp) && writeUpsBack() && !existsSync(join(repo, '.mutation-state')) && !/did not return what the mutation touched/.test(text(kbsd)),
      `the fault wrote ${JSON.stringify(bsdStamp)}, write-ups back ${writeUpsBack()}, state gone ${!existsSync(join(repo, '.mutation-state'))}; status ${kbsd.status}`)

    // E16: a world mutation that changes nothing is reported as a broken mutation and leaves nothing behind.
    reset()
    for (const p of Object.keys(writeUps)) rmSync(join(repo, p))
    const kn = go(['--only', 'outbox-stub'])
    check('E16: A WORLD MUTATION THAT CHANGES NOTHING IS REPORTED AS A BROKEN MUTATION, and leaves no state behind',
      kn.status === 1 && /the mutation actually applies/.test(text(kn)) && !/did not return what the mutation touched/.test(text(kn)) && !existsSync(join(repo, '.mutation-state')),
      `status ${kn.status}; ${text(kn).split('\n').filter(l => /actually applies|::error::|FAIL/.test(l)).join(' | ').slice(0, 220)}; state gone ${!existsSync(join(repo, '.mutation-state'))}`)

    // E17: a mutation that COULD reach build/ (the test-only fault marks a docs mutation as one) is rebuilt for on heal, and the build's own result decides what happens next.
    reset()
    go(['--only', 'known-survivor'], { MUTATION_FAULT: 'build-never-verified', MUTATION_KILL_AT: 'source-applied' })
    let m17 = null
    try { m17 = markerOf() } catch { m17 = null }
    const h17f = go(['--only', 'known-survivor'], { BUILD_FAIL: '1' })
    const kept17 = stateLeft()
    check('E17: A MUTATION THAT COULD REACH build/ IS REBUILT FOR ON HEAL, AND A BUILD THAT FAILS STOPS THE RUN WITH ITS OWN FAILURE: the marker says it could, the file is back, the build ran, the refusal carries what the build said, and the marker stays',
      m17 !== null && m17.rebuild === true && h17f.status === 1 && read(join(repo, 'docs/gate-rows.txt')) === rows && buildsRun() === 1 && /npm run build. failed \(exit 1: fake build failed on purpose\)/.test(text(h17f)) && kept17 && !/delete .* to clear this/.test(text(h17f)),
      `marker rebuild ${m17 && m17.rebuild}; status ${h17f.status}; builds ${buildsRun()}; kept ${kept17}; ${text(h17f).split('\n').filter(l => /::error::/.test(l)).join(' | ').slice(0, 260)}`)
    const h17 = go(['--only', 'known-survivor'])
    check('E17: ...and the next run, with a working build, reads "already undone", builds again, and drops it',
      /Nothing to heal/.test(text(h17)) && buildsRun() === 2 && !existsSync(join(repo, '.mutation-state')), `${text(h17).split('\n').filter(l => /Nothing to heal|::error::/.test(l)).join(' | ').slice(0, 200)}; builds ${buildsRun()}`)
    // A build that succeeds but PRINTS a lot is a build that succeeded (execSync's default 1 MiB would have killed it and called it failed).
    reset()
    go(['--only', 'known-survivor'], { MUTATION_FAULT: 'build-never-verified', MUTATION_KILL_AT: 'source-applied' })
    const h17n = go(['--only', 'known-survivor'], { BUILD_NOISE_MB: '2' })
    check('E17: ...and a build that prints two megabytes and succeeds is not read as failed: HEALED, the build ran once, nothing was refused, the state is gone',
      /HEALED/.test(text(h17n)) && buildsRun() === 1 && !/npm run build. failed/.test(text(h17n)) && !existsSync(join(repo, '.mutation-state')) && read(join(repo, 'docs/gate-rows.txt')) === rows,
      `${text(h17n).split('\n').filter(l => /HEALED|::error::/.test(l)).join(' | ').slice(0, 220)}; builds ${buildsRun()}`)

    // E18: a catchable signal. The handler (not SIGKILL, which no handler sees, and not `throw`, which is the exception path) must put the file back and clear the state, and the run
    // must stop THERE: a run that merely finished would have printed its verdict for the mutation.
    for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
      reset()
      const ks = go(['--only', 'known-survivor'], { MUTATION_KILL_AT: 'source-applied', MUTATION_KILL_SIGNAL: sig })
      check(`E18: A ${sig} WHILE A SOURCE FILE IS MUTATED IS HANDLED: the file is back, the state is gone, and the run exits 1 having stopped there (not killed by it, not finished)`,
        ks.status === 1 && ks.signal === null && read(join(repo, 'docs/gate-rows.txt')) === rows && !existsSync(join(repo, '.mutation-state')) && !/(PASS|FAIL)\s+\[known-survivor\]/.test(text(ks)),
        `status ${ks.status}, signal ${ks.signal}, file back ${read(join(repo, 'docs/gate-rows.txt')) === rows}, state gone ${!existsSync(join(repo, '.mutation-state'))}, finished ${/(PASS|FAIL)\s+\[known-survivor\]/.test(text(ks))}`)
    }
    reset()
    const kt = go(['--only', 'outbox-stub'], { MUTATION_KILL_AT: 'world-applied', MUTATION_KILL_SIGNAL: 'SIGTERM' })
    check('E18: ...and a SIGTERM while the write-ups are stubbed puts them back from the stash before the state goes',
      kt.status === 1 && kt.signal === null && writeUpsBack() && !existsSync(join(repo, '.mutation-state')) && !/(PASS|FAIL)\s+\[outbox-stub\]/.test(text(kt)),
      `status ${kt.status}, signal ${kt.signal}, write-ups back ${writeUpsBack()}, state gone ${!existsSync(join(repo, '.mutation-state'))}`)
    // ...and the signal is handled WHERE IT WAS SENT, before the expectation runs. `expectation()` ends in a turn of the event loop, so a signal that is only queued when the expectation
    // starts is acted on right after it, and every end state the clauses above look at (exit 1, the file back, the state gone, no verdict line) is the same either way. What differs is whether
    // the expectation RAN. The fault makes it leave a file when it does; the control run (no signal) proves the fault leaves it, so its absence after the SIGTERM means the expectation did not run.
    reset()
    go(['--only', 'known-survivor'], { MUTATION_FAULT: 'expect-writes-unrelated' })
    const ranWithoutSignal = existsSync(join(repo, 'unrelated-during-window.txt'))
    reset()
    const yieldRun = go(['--only', 'known-survivor'], { MUTATION_KILL_AT: 'source-applied', MUTATION_KILL_SIGNAL: 'SIGTERM', MUTATION_FAULT: 'expect-writes-unrelated' })
    const ranAfterSignal = existsSync(join(repo, 'unrelated-during-window.txt'))
    check('E18: ...and a SIGTERM while a source file is mutated is handled BEFORE the expectation runs, not one turn after it: with a fault that makes the expectation write a file, the file is absent after the signal and present after the same run with no signal (2 runs; the end state alone cannot tell the two orders apart)',
      ranWithoutSignal && yieldRun.status === 1 && yieldRun.signal === null && !ranAfterSignal && read(join(repo, 'docs/gate-rows.txt')) === rows && !existsSync(join(repo, '.mutation-state')),
      `control (no signal) wrote the file ${ranWithoutSignal}; after the SIGTERM: status ${yieldRun.status}, signal ${yieldRun.signal}, the expectation ran ${ranAfterSignal}, file back ${read(join(repo, 'docs/gate-rows.txt')) === rows}, state gone ${!existsSync(join(repo, '.mutation-state'))}`)

    // E19: a restore that put back SOME of what the mutation touched (a `cp` that ran out of disk part-way). It is not a restore: the stash is the only copy of the rest.
    reset()
    const kq = go(['--only', 'outbox-stub'], { MUTATION_FAULT: 'world-restore-partial' })
    const stubsLeft = Object.keys(writeUps).filter(p => read(join(repo, p)) === 'stub\n').length
    check('E19: A RESTORE THAT PUT BACK ONLY SOME OF THE WRITE-UPS IS NOT CALLED A RESTORE: the run stops and says so, one write-up is still a stub, and the state and the stash are kept',
      kq.status === 1 && /did not return what the mutation touched/.test(text(kq)) && stubsLeft === 1 && stateLeft() && Object.keys(writeUps).every(p => read(join(stash, p.split('/').pop())) === writeUps[p]),
      `status ${kq.status}, stubs left ${stubsLeft}, state kept ${stateLeft()}; ${text(kq).split('\n').filter(l => /::error::/.test(l)).join(' | ').slice(0, 160)}`)
    const hq = go(['--only', 'known-survivor'])
    check('E19: ...and the next run finishes it: HEALED, every write-up is back, and the state is gone',
      /HEALED/.test(text(hq)) && writeUpsBack() && !existsSync(join(repo, '.mutation-state')), `${text(hq).split('\n').filter(l => /HEALED|::error::/.test(l)).join(' | ').slice(0, 200)}`)

    // E21: the baseline runs each expectation once on the unmutated tree. An expectation that merely PRINTS more than a megabyte passes there, as it does in the mutation loop.
    reset()
    const kb = go(['--only', 'known-survivor'], { MUTATION_FAULT: 'baseline-prints-a-lot' })
    check('E21: AN EXPECTATION THAT PRINTS TWO MEGABYTES AND PASSES IS NOT A FAILING BASELINE',
      /baseline: ran 1 of 1 distinct expectation\(s\) from 1 mutation\(s\), 0 failing/.test(text(kb)) && !/the unmutated tree passes every expectation[^\n]*\n[^\n]*already failing/.test(text(kb)),
      `${text(kb).split('\n').filter(l => /baseline:|already failing/.test(l)).join(' | ').slice(0, 220)}`)

    // E20: a tree that cannot be read is not "nothing to heal". (GIT_DIR points nowhere for the run that heals; the stubs, the state and the stash must all still be there.)
    reset()
    go(['--only', 'outbox-stub'], { MUTATION_KILL_AT: 'world-applied' })
    const hu = go(['--only', 'known-survivor'], { GIT_DIR: join(scratch, 'no-such-git-dir') })
    check('E20: A TREE THAT CANNOT BE READ IS NOT "NOTHING TO HEAL": the run stops and says so, and the stubs, the state and the stash are all still there',
      hu.status === 1 && /could not be checked against the tree/.test(text(hu)) && Object.keys(writeUps).every(p => read(join(repo, p)) === 'stub\n') && stateLeft() && Object.keys(writeUps).every(p => read(join(stash, p.split('/').pop())) === writeUps[p]),
      `status ${hu.status}; ${text(hu).split('\n').filter(l => /::error::/.test(l)).join(' | ').slice(0, 200)}`)
    // E22: THE WATCHER A KILLED RUN LEAVES. A stand-in for `dotnet` (a shell that starts the compiler as a child and forwards TERM to it, as the real host does: measured by hand on the real
    // Fable 5.13.0, 2026-11-05, where a TERM to the host took the compiler with it) runs the stand-in watcher fixture under the REAL harness. It stands for the dotnet host and for fable.dll's
    // process, and for nothing of Fable's own output or timing, or of its running on after the harness that read its pipe is gone (seen on the real one, not asserted here). The watcher
    // is found by /proc, so none of this is asserted without it.
    if (haveProc) {
      const drepo = join(scratch, 'e22-repo')
      for (const d of ['scripts', 'src', 'bin']) mkdirSync(join(drepo, d), { recursive: true })
      for (const f of ['mutation-check.mjs', 'checks.mjs', 'mutation-lib.mjs', 'run-marker.mjs']) copyFileSync(join(dirname(here), f), join(drepo, 'scripts', f))
      copyFileSync(join(dirname(here), 'fixtures', 'fake-fable-watch.mjs'), join(drepo, 'scripts', 'fake-fable-watch.mjs'))
      const original = 'module Pickem\nlet f home away =\n        if home = away then None\n        else Some 1\n'
      writeFileSync(join(drepo, 'src', 'Pickem.fs'), original)
      // `draw`'s expectation fails while the mutation is in the source; `npm run build` records whether it succeeded and refuses the mutated source, as a mutation the compiler refuses does.
      writeFileSync(join(drepo, 'scripts', 'pickem-check.mjs'), "import { readFileSync } from 'node:fs'\nprocess.exit(readFileSync('src/Pickem.fs', 'utf8').includes('if false then None') ? 1 : 0)\n")
      writeFileSync(join(drepo, 'scripts', 'build-site.mjs'), '')
      writeFileSync(join(drepo, 'scripts', 'fake-build.mjs'),
        "import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'\nconst src = readFileSync('src/Pickem.fs', 'utf8')\nconst ok = !src.includes('if false then None') && !process.env.BUILD_FAIL\n"
        + "appendFileSync('.build-log', ok ? 'ok\\n' : 'failed\\n')\nif (!ok) { console.error(process.env.BUILD_FAIL ? 'the fake build failed on purpose' : 'the fake build refused the mutated source'); process.exit(1) }\nmkdirSync('build', { recursive: true })\nwriteFileSync('build/Out.js', 'compiled:' + src)\n")
      // The stand-in watcher dies on its first write after the harness is gone, where the real compiler was measured to run on: it ignores that.
      writeFileSync(join(drepo, 'scripts', 'keep-running.cjs'), "process.stdout.on('error', () => {}); process.stderr.on('error', () => {})\n")
      writeFileSync(join(drepo, 'package.json'), JSON.stringify({ name: 'scratch', private: true, scripts: { build: 'node scripts/fake-build.mjs' } }))
      writeFileSync(join(drepo, 'bin', 'dotnet'), '#!/bin/sh\nnode -r ./scripts/keep-running.cjs scripts/fake-fable-watch.mjs src/Pickem.fs build &\nchild=$!\ntrap \'kill $child; wait $child; exit 0\' TERM\nwait $child\n', { mode: 0o755 })
      writeFileSync(join(drepo, '.gitignore'), '.mutation-state/\n.build-log\nbuild/\n')
      const dgit = cmd => execSync(`git ${cmd}`, { cwd: drepo, stdio: 'pipe', encoding: 'utf8' })
      dgit('init -q'); dgit('config user.email t@t'); dgit('config user.name t'); dgit('add -A'); dgit('commit -qm base')
      const denv = (extra = {}) => ({ ...process.env, ...clean, MUTATION_SELFTEST_CHILD: '1', PATH: `${join(drepo, 'bin')}:${process.env.PATH}`, ...extra })
      const dgo = (args, extra) => spawnSync(process.execPath, ['scripts/mutation-check.mjs', ...args], { cwd: drepo, encoding: 'utf8', timeout: 60_000, env: denv(extra) })
      const dtext = r => `${r.stdout}${r.stderr}`
      const dread = (f, dir = drepo) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : null)
      const dbuilds = () => (dread('.build-log') ?? '').split('\n').filter(Boolean)
      const dreset = () => { rmSync(join(drepo, '.build-log'), { force: true }); rmSync(join(drepo, '.mutation-state'), { recursive: true, force: true }); dgit('checkout -q -- .') }
      // A run that was told to end mid-mutation leaves build/ holding the mutation (the marker that says so is what makes the next run rebuild, and `dreset` deleted it), and the next run refuses a
      // watcher whose first compile is not the build it finds. So a run that starts from `dreset` alone after such a run needs the clean build back, made as the stand-in build makes it.
      const cleanBuild = () => { dreset(); rmSync(join(drepo, 'build'), { recursive: true, force: true }); spawnSync(process.execPath, ['scripts/fake-build.mjs'], { cwd: drepo }); rmSync(join(drepo, '.build-log'), { force: true }) }
      // Every live process whose working directory is the scratch repository and that is the stand-in or the watcher under it (a zombie is nothing).
      const watchersIn = dir => readdirSync('/proc').filter(d => /^\d+$/.test(d)).flatMap(pid => {
        try {
          if (readlinkSync(`/proc/${pid}/cwd`) !== dir) return []
          const cmd = readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').join(' ').trim()
          const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
          return stat.slice(stat.lastIndexOf(')') + 2).startsWith('Z') || !/fake-fable-watch|bin\/dotnet/.test(cmd) ? [] : [{ pid: Number(pid), parent: !/fake-fable-watch/.test(cmd) }]
        } catch { return [] }
      })
      const watchers = () => watchersIn(drepo)
      // The copies of the repository the signal runs below use, one each, so that they can run at once. A copy's watchers are stopped with the rest.
      const copies = []
      const stopAll = () => { for (const dir of [drepo, ...copies]) for (const w of watchersIn(dir)) { try { process.kill(w.pid, 'SIGKILL') } catch { /* gone */ } } }
      const pause = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
      const waitFor = (what, ms = 8000) => { for (let waited = 0; waited < ms; waited += 10) { const v = what(); if (v) return v; pause(10) } return null }
      const recordOf = () => { try { return JSON.parse(dread('.mutation-state/driver.json')) } catch { return null } }
      // Start the harness, wait until the compiler has exec'd, then kill the harness: its watcher is left running, as a SIGKILL leaves it. The wait is for the process, not for the record,
      // so that code which writes no record still gets its watcher stranded and fails the clause for that reason (the record is written in the turn the watcher is spawned, so it is there
      // long before the compiler is; the short wait for it is for a slow disk). With `killParent` the stand-in under it is killed too, so that the compiler is left alone in its process group.
      const strand = killParent => {
        const run = spawn(process.execPath, ['scripts/mutation-check.mjs', '--only', 'draw'], { cwd: drepo, env: denv(), stdio: 'ignore' })
        waitFor(() => watchers().some(w => !w.parent))
        const recorded = waitFor(recordOf, 300)
        const markerThen = existsSync(join(drepo, '.mutation-state', 'active.json'))
        process.kill(run.pid, 'SIGKILL')
        const standIn = watchers()
        const parent = standIn.find(w => w.parent)
        if (killParent && parent) process.kill(parent.pid, 'SIGKILL')
        // Gone: the run (a zombie reads as dead, run-marker.mjs) and, if asked, the stand-in.
        waitFor(() => !isLive({ pid: run.pid, start: recorded?.run?.start }) && (!killParent || !watchers().some(w => w.parent)))
        return { run, recorded, markerThen, standIn, parent, left: watchers() }
      }
      try {
        // (1) A run killed during the watcher's FIRST compile, which is before any marker exists (the first mutation writes it), and then the PARENT of the watcher killed too, so the compiler
        // is left in its process group with nothing above it. Only the record says it is there.
        const one = strand(true)
        check('E22: A RUN KILLED DURING THE WATCHER\'S FIRST COMPILE LEAVES THE WATCHER RUNNING WITH NO MARKER, BUT WITH A RECORD NAMING ITS PARENT, ITS START TIME AND THE RUN THAT STARTED IT (and with the parent killed, the compiler is left alone in the group)',
          !one.markerThen && one.recorded !== null && one.recorded.driver?.pid === one.parent?.pid && one.recorded.run?.pid === one.run.pid && typeof one.recorded.driver?.start === 'string' && one.standIn.length === 2 && one.left.length === 1 && !one.left[0].parent,
          `marker ${one.markerThen}; record ${JSON.stringify(one.recorded)}; stand-in ${JSON.stringify(one.standIn)}; after the parent was killed ${JSON.stringify(one.left)}`)
        const healed = dgo(['--heal'])
        const said1 = dtext(healed)
        check('E22: ...and the next run stops the compiler (the whole group: the record names a parent that is gone), says so, builds once because the compile it cut off may have left build/ half written, and forgets the record',
          healed.status === 0 && watchers().length === 0 && /Stopping it before this run starts one of its own/.test(said1) && dbuilds().join() === 'ok' && dread('.mutation-state/driver.json') === null,
          `status ${healed.status}; watchers left ${JSON.stringify(watchers())}; builds ${dbuilds().join()}; record ${dread('.mutation-state/driver.json')}; ${said1.split('\n').filter(l => /Stopping|::error::/.test(l)).join(' | ').slice(0, 200)}`)
        stopAll(); dreset()

        // (2) The same, with a mutation stranded as well (the premise run's state: `MUTATION_KILL_AT=source-applied` leaves a marker, the mutated file and a live watcher; planted here, in
        // the shape sourceMarker writes, because a real kill there costs 1.5 s of every self-test), and the stand-in left running above its compiler. The mutated source does not build in this
        // fixture, as a mutation the compiler refuses does, so a build made before the heal has put the file back fails and the run refuses with a command that cannot pass.
        const two = strand(false)
        const mutatedSrc = original.replace('if home = away then None', 'if false then None')
        mkdirSync(join(drepo, '.mutation-state'), { recursive: true })
        writeFileSync(join(drepo, '.mutation-state', 'src_Pickem.fs'), original)
        writeFileSync(join(drepo, 'src', 'Pickem.fs'), mutatedSrc)
        writeFileSync(join(drepo, '.mutation-state', 'active.json'), JSON.stringify({ id: 'draw', file: 'src/Pickem.fs', backup: '.mutation-state/src_Pickem.fs', originalSha: sha(original), mutatedSha: sha(mutatedSrc), rebuild: true, ...DEAD }))
        const healB = dgo(['--heal'])
        const said2 = dtext(healB)
        const builds2 = dbuilds()
        check('E22: ...and a stranded mutation is healed by the same run: the watcher and its stand-in are both stopped, the file is back, and every build made is of the restored source (a build of the mutated one fails here)',
          two.left.length === 2 && healB.status === 0 && watchers().length === 0 && dread('src/Pickem.fs') === original && /HEALED/.test(said2) && /Stopping it before/.test(said2)
            && builds2.length >= 1 && !builds2.includes('failed') && dread('build/Out.js') === `compiled:${original}` && dread('.mutation-state/driver.json') === null && dread('.mutation-state/active.json') === null,
          `watchers before ${two.left.length}, after ${watchers().length}; status ${healB.status}; builds ${builds2.join()}; file back ${dread('src/Pickem.fs') === original}; ${said2.split('\n').filter(l => /Stopping|HEALED|::error::/.test(l)).join(' | ').slice(0, 240)}`)
        stopAll(); dreset()

        // (3) A RUN THAT IS TOLD TO END STOPS ITS OWN WATCHER, and only its exit and signal handler can: the mutation is half way through, the watcher has a process group of its own (so a
        // terminal's Ctrl-C, which goes to the foreground group, no longer reaches it), and nothing else knows it is there until the next run reaps it. `MUTATION_KILL_AT=source-applied` with
        // `MUTATION_KILL_SIGNAL` delivers the signal from inside the run at the one moment that matters: the watcher is up and has compiled the mutation. SIGTERM is a plain kill. SIGINT is what a
        // Ctrl-C sends the harness, which stays in the terminal's group: the harness's handler is how a Ctrl-C reaches the watcher (review 6, 2026-11-05, a pty on the real Fable: with the handler's
        // stop deleted the watcher was still running 15 s after the harness had gone; with it, none). SIGHUP is a closed terminal. Each signal gets a run, a copy of the repository and a stand-in
        // watcher of its own, and the three go at once (a run is 1.4 s, and this self-test runs once for each of 159 table entries). The watcher is looked for AFTER the harness has gone, for up to
        // 3 s: the stand-in's TERM handler kills its child, which takes a moment.
        cleanBuild()
        const told = await Promise.all(['SIGTERM', 'SIGINT', 'SIGHUP'].map(sig => new Promise(done => {
          const dir = `${drepo}-${sig.toLowerCase()}`
          copies.push(dir)
          spawnSync('cp', ['-a', drepo, dir])
          let said = ''
          const child = spawn(process.execPath, ['scripts/mutation-check.mjs', '--only', 'draw'], { cwd: dir, env: denv({ MUTATION_KILL_AT: 'source-applied', MUTATION_KILL_SIGNAL: sig }), stdio: ['ignore', 'pipe', 'pipe'] })
          child.stdout.on('data', b => { said += b }); child.stderr.on('data', b => { said += b })
          const timer = setTimeout(() => child.kill('SIGKILL'), 60_000)
          child.on('close', async status => {
            clearTimeout(timer)
            for (let waited = 0; waited < 3000 && watchersIn(dir).length > 0; waited += 10) await new Promise(r => setTimeout(r, 10))
            done({ sig, status, up: /build driver: watch, ready/.test(said), left: watchersIn(dir).length, record: dread('.mutation-state/driver.json', dir) !== null, fileBack: dread('src/Pickem.fs', dir) === original })
          })
        })))
        stopAll()
        check('E22: ...and a run told to end by SIGTERM, SIGINT or SIGHUP, with its watcher up and a mutation compiled, stops that watcher before it goes: status 1, the watcher and its stand-in are gone, the record is gone, and the file is back (3 signals, one run and one stand-in watcher each)',
          told.every(x => x.up && x.status === 1 && x.left === 0 && !x.record && x.fileBack),
          told.map(x => `${x.sig}: status ${x.status}, watcher was up ${x.up}, processes left ${x.left}, record kept ${x.record}, file back ${x.fileBack}`).join(' / '))
        cleanBuild()

        // (4) A watcher the reaper stopped is followed by `npm run build`, and a build that FAILS stops the run: build/ may be half written, and going on would start a watcher over it. The stand-in
        // build fails on request (BUILD_FAIL) with the source clean, so nothing but the reap's own build can be what fails; the watcher is stopped before it, so it is gone either way.
        const four = strand(false)
        const failedBuild = dgo(['--heal'], { BUILD_FAIL: '1' })
        const said4 = dtext(failedBuild)
        check('E22: ...and a build that FAILS after the reaper has stopped the watcher stops the run: exit 1, the message names the failed build and says build/ may be half written, no heal is reported, and the watcher is gone',
          four.left.length === 2 && failedBuild.status === 1 && /a build driver left by a killed run was stopped, and `npm run build` failed \(.*the fake build failed on purpose.*\), so build\/ may be half written/.test(said4)
            && !/Healed|Nothing to heal/.test(said4) && watchers().length === 0 && dread('.mutation-state/driver.json') === null,
          `watchers before ${four.left.length}, after ${watchers().length}; status ${failedBuild.status}; ${said4.split('\n').filter(l => /::error::|Healed|Nothing to heal/.test(l)).join(' | ').slice(0, 300)}`)
        stopAll(); dreset()
      } finally {
        stopAll()
      }
    } else {
      console.log('  (E22 was not asserted: /proc cannot be read here, and it finds the watcher by it)')
    }
    // E23: killed AFTER a world mutation has run and BEFORE the marker names the paths it touched (the window between the two marker writes: the mutation's own run and a snapshot of the tree, about
    // 15 ms measured 2026-11-05). The next run cannot heal it: the stubs cannot be told from a person's edit, because the hash of what the mutation left was never written. It refuses, and the stash
    // still holds everything it moved aside. (Restoring from the stash would write over a possible edit, the defect "write only over what is provably yours" exists to prevent.)
    reset()
    const kx = go(['--only', 'outbox-stub'], { MUTATION_KILL_AT: 'world-mutated' })
    let mx = null
    try { mx = markerOf() } catch { mx = null }
    const stashed = () => Object.keys(writeUps).every(p => read(join(repo, '.mutation-state', 'world', 'outbox-stub', p.split('/').pop())) === writeUps[p])
    check('E23: A KILL AFTER A WORLD MUTATION HAS RUN AND BEFORE ITS MARKER NAMES THE PATHS IT TOUCHED LEAVES THE STUBS IN PLACE, THE ORIGINALS IN THE STASH (2 of 2 write-ups, byte for byte), AND A MARKER WITH NO PATHS',
      kx.signal === 'SIGKILL' && Object.keys(writeUps).every(p => read(join(repo, p)) === 'stub\n') && stashed() && mx !== null && mx.id === 'outbox-stub' && mx.touched === undefined,
      `signal ${kx.signal}, stubs ${Object.keys(writeUps).map(p => read(join(repo, p)) === 'stub\n')}, stash holds originals ${stashed()}, marker ${JSON.stringify(mx && { id: mx.id, touched: mx.touched })}`)
    const state23 = listing(join(repo, '.mutation-state'))
    const sx = go(['--stranded'])
    check('E23: ...and `--stranded` over that state says the run was killed before it recorded which paths it touched, that the heal drops the state if the tree is unchanged since and otherwise refuses, and touches nothing: the state directory is byte-identical and the write-ups are still stubs',
      sx.status === 1 && /whose run was killed before it recorded which paths it touched \(\[outbox-stub\] on the tree\)/.test(text(sx)) && /drops the state if the tree is unchanged since, and otherwise refuses, because it cannot tell the mutation's changes from a person's, and says where the stash is/.test(text(sx))
        && !/would carry the mutation|Heal it first/.test(text(sx)) && listing(join(repo, '.mutation-state')) === state23 && Object.keys(writeUps).every(p => read(join(repo, p)) === 'stub\n'),
      `status ${sx.status}; ${text(sx).split('\n')[0].slice(0, 300)}; state directory unchanged ${listing(join(repo, '.mutation-state')) === state23}`)
    const hx = go(['--only', 'known-survivor'])
    check('E23: ...and the next run writes nothing over any path and keeps the state: it says the run was killed before it recorded the paths, names where the originals are, and the stash still holds them',
      hx.status === 1 && /killed before it recorded which paths it touched/.test(text(hx)) && text(hx).includes(join(repo, '.mutation-state', 'world', 'outbox-stub').slice(repo.length + 1)) && Object.keys(writeUps).every(p => read(join(repo, p)) === 'stub\n') && stateLeft() && stashed(),
      `status ${hx.status}; ${text(hx).split('\n').filter(l => /::error::/.test(l)).join(' | ').slice(0, 260)}`)

    // E24: a signal during an expectation (measured 2026-11-05 on the real script with an expectation that sleeps: a SIGTERM was acted on 23 s later, when the command ended and the
    // run had printed its own verdict; Ctrl-C to the process group killed the expectation and printed `PASS [known-survivor]`, exit status 0). Ctrl-C reaches the expectation (same
    // process group); a SIGTERM reaches the harness itself while the command runs synchronously. `known-survivor` is a mutation of a file, `outbox-stub` one made outside the source.
    reset()
    const ki = go(['--only', 'known-survivor'], { MUTATION_FAULT: 'expect-interrupted' })
    check('E24: AN EXPECTATION ENDED BY A SIGNAL IS NOT A CAUGHT MUTATION: the run stops with status 1 and says so, no verdict is printed for the mutation, and the file and the state are put back',
      ki.status === 1 && /ended by SIGINT/.test(text(ki)) && !/(PASS|FAIL)\s+\[known-survivor\]/.test(text(ki)) && read(join(repo, 'docs/gate-rows.txt')) === rows && !existsSync(join(repo, '.mutation-state')),
      `status ${ki.status}; ${text(ki).split('\n').filter(l => /PASS|FAIL|::error::/.test(l)).join(' | ').slice(0, 240)}`)
    reset()
    const kc = go(['--only', 'known-survivor'], { MUTATION_FAULT: 'expect-child-killed' })
    check('E24: ...and so is one whose child was killed (the OOM killer, a browser crash), which the shell reports as a status above 128 rather than as a signal',
      kc.status === 1 && /ended by status 137/.test(text(kc)) && !/(PASS|FAIL)\s+\[known-survivor\]/.test(text(kc)) && read(join(repo, 'docs/gate-rows.txt')) === rows && !existsSync(join(repo, '.mutation-state')),
      `status ${kc.status}; ${text(kc).split('\n').filter(l => /PASS|FAIL|::error::/.test(l)).join(' | ').slice(0, 240)}`)
    reset()
    const kow = go(['--only', 'outbox-stub'], { MUTATION_FAULT: 'expect-interrupted' })
    check('E24: ...and so is one of a change made outside the source: the run stops, no verdict is printed, and the write-ups it moved aside are back with the state gone',
      kow.status === 1 && /ended by SIGINT/.test(text(kow)) && !/(PASS|FAIL)\s+\[outbox-stub\]/.test(text(kow)) && writeUpsBack() && !existsSync(join(repo, '.mutation-state')),
      `status ${kow.status}; write-ups back ${writeUpsBack()}; ${text(kow).split('\n').filter(l => /PASS|FAIL|::error::/.test(l)).join(' | ').slice(0, 240)}`)
    reset()
    const kv = go(['--only', 'known-survivor'], { MUTATION_FAULT: 'expect-terms-the-run' })
    check('E24: ...and a SIGTERM that arrives while an expectation runs is acted on when it ends, even for a mutation with nothing to await: the run exits 1 with no verdict printed, and the file and the state are put back',
      kv.status === 1 && kv.signal === null && !/(PASS|FAIL)\s+\[known-survivor\]/.test(text(kv)) && read(join(repo, 'docs/gate-rows.txt')) === rows && !existsSync(join(repo, '.mutation-state')),
      `status ${kv.status}, signal ${kv.signal}; ${text(kv).split('\n').filter(l => /PASS|FAIL|::error::/.test(l)).join(' | ').slice(0, 240)}`)
    reset()
    const kbt = go(['--only', 'known-survivor'], { MUTATION_FAULT: 'baseline-terms-the-run' })
    check('E24: ...and so is one that arrives during the baseline, the longest synchronous stretch of a run: the run exits 1 before the baseline is reported or any mutation is applied',
      kbt.status === 1 && kbt.signal === null && !/baseline: ran/.test(text(kbt)) && read(join(repo, 'docs/gate-rows.txt')) === rows && !existsSync(join(repo, '.mutation-state')),
      `status ${kbt.status}, signal ${kbt.signal}; ${text(kbt).split('\n').filter(l => /baseline|PASS|FAIL|::error::/.test(l)).join(' | ').slice(0, 240)}`)
    reset()
    // ...but a command the harness ITSELF ends is not one that was killed from outside. execSync ends a command that prints past the output limit with SIGTERM and reports ENOBUFS, so the signal
    // field alone cannot tell the two apart (measured 2026-11-05 with a 400 MB flood: "ended by SIGTERM", the run stopped, exit 1; before the signal rule the same expectation was a caught mutation).
    // `expect-floods` prints 2 MiB and MUTATION_OUTPUT_LIMIT is 64 KiB, so the flood is kilobytes of work. Caught is `PASS` and exit 0: the survivor's own run (`FAIL [known-survivor]`, exit 1) is the control.
    const kfl = go(['--only', 'known-survivor'], { MUTATION_FAULT: 'expect-floods', MUTATION_OUTPUT_LIMIT: String(64 * 1024) })
    check('E24: ...but a command the harness itself ends for printing past its output limit (ENOBUFS, which execSync reports as SIGTERM) FAILED, it was not killed from outside: the mutation is caught (PASS, exit 0), nothing says it was ended by a signal, and the file and the state are put back (1 flood: 2 MiB past a 64 KiB limit)',
      kfl.status === 0 && /PASS\s+\[known-survivor\]/.test(text(kfl)) && !/ended by/.test(text(kfl)) && read(join(repo, 'docs/gate-rows.txt')) === rows && !existsSync(join(repo, '.mutation-state')),
      `status ${kfl.status}; ${text(kfl).split('\n').filter(l => /PASS|FAIL|::error::/.test(l)).join(' | ').slice(0, 240)}`)
    reset()
    // A test hook that is set is NAMED on stderr before the run does anything, and the run goes on. The three hooks below do nothing but exist (a fault that only reports the environment, a moment no
    // run reaches, a limit equal to the default), so the run is an ordinary one with three hooks set; the control is the same run with none.
    const khk = go(['--only', 'known-survivor'], { MUTATION_FAULT: 'expect-reports-env', MUTATION_KILL_AT: 'nowhere', MUTATION_OUTPUT_LIMIT: String(256 * 1024 * 1024) })
    const kno = go(['--only', 'known-survivor'])
    const announced = ['MUTATION_FAULT=expect-reports-env', 'MUTATION_KILL_AT=nowhere', `MUTATION_OUTPUT_LIMIT=${256 * 1024 * 1024}`]
    check('E24: A TEST HOOK THAT IS SET IS NAMED ON STDERR BEFORE THE RUN STARTS, AND THE RUN GOES ON: `test hook active: <name>=<value>` for each of 3 hooks (MUTATION_FAULT, MUTATION_KILL_AT, MUTATION_OUTPUT_LIMIT), none on stdout, and none in the control run that sets no hook',
      announced.every(h => khk.stderr.includes(`test hook active: ${h}\n`)) && !khk.stdout.includes('test hook active') && /Mutation testing/.test(khk.stdout) && !/test hook active/.test(text(kno)) && /Mutation testing/.test(kno.stdout),
      `with hooks: stderr ${JSON.stringify(String(khk.stderr).slice(0, 220))}, ran ${/Mutation testing/.test(khk.stdout)}; without: ${JSON.stringify(text(kno).split('\n').filter(l => /test hook/.test(l)))}`)
    reset()
    // The state-directory guard names the first four entries it found and says "..." for the rest. E27 holds two files and reaches neither bound: five files list four and the "...", exactly four list
    // four and no "...".
    const guardDir = n => {
      const dir = join(scratch, `guard-dir-${n}`)
      mkdirSync(dir, { recursive: true })
      for (const f of ['a.txt', 'b.txt', 'c.txt', 'd.txt', 'e.txt'].slice(0, n)) writeFileSync(join(dir, f), 'not the harness\'s\n')
      return dir
    }
    const g5 = go(['--only', 'known-survivor'], { MUTATION_STATE_DIR: guardDir(5) })
    const g4 = go(['--only', 'known-survivor'], { MUTATION_STATE_DIR: guardDir(4) })
    check('STATE-DIRECTORY GUARD: IT NAMES THE FIRST FOUR ENTRIES AND SAYS "..." FOR THE REST: of 5 foreign files it lists a.txt to d.txt and ", ..." and not e.txt, of exactly 4 it lists the four and no "..." (both exit 2; E27 holds two files and reaches neither bound)',
      g5.status === 2 && /already holds files this harness did not write \(a\.txt, b\.txt, c\.txt, d\.txt, \.\.\.\)/.test(text(g5)) && g4.status === 2 && /already holds files this harness did not write \(a\.txt, b\.txt, c\.txt, d\.txt\)/.test(text(g4)),
      `5 files: status ${g5.status}, ${text(g5).split('\n')[0].slice(0, 180)} / 4 files: status ${g4.status}, ${text(g4).split('\n')[0].slice(0, 180)}`)
    reset()

    // E25: a self-test that crashes leaves none of the directories it made. Git is made to fail (a stand-in first on PATH), which is how the crash was found: the crash is at the first git
    // call of the scratch repository, about 0.1 s in, with the scratch directory and the state directory (two mkdtemp calls) already made. The child's TMPDIR is an empty directory, so
    // what it leaves is all that is in it. The stand-in's own line in the report is the proof that it crashed for the reason planned.
    const crashTmp = join(scratch, 'crash-tmp')
    const noGit = join(scratch, 'no-git')
    mkdirSync(crashTmp)
    mkdirSync(noGit)
    writeFileSync(join(noGit, 'git'), '#!/bin/sh\necho "git: stand-in, fails on purpose" >&2\nexit 1\n', { mode: 0o755 })
    const crashed = spawnSync(process.execPath, [here, '--self-test'], { cwd: process.cwd(), encoding: 'utf8', timeout: 120_000, env: { ...process.env, ...clean, MUTATION_SELFTEST_CHILD: '1', TMPDIR: crashTmp, PATH: `${noGit}:${process.env.PATH}` } })
    const leftBehind = readdirSync(crashTmp)
    check('E25: A SELF-TEST THAT CRASHES LEAVES NO DIRECTORY BEHIND: it did crash (exit 1, the git stand-in named in its report), and its temp directory holds none of the 2 directories it made (heal-selftest-*, mutation-state-*)',
      crashed.status === 1 && /git: stand-in, fails on purpose/.test(String(crashed.stderr)) && leftBehind.length === 0,
      `status ${crashed.status}; left behind in its TMPDIR: ${leftBehind.join(', ') || 'nothing'}; stderr ${String(crashed.stderr).split('\n')[0].slice(0, 120)}`)
    // ...and a crash BEFORE the scratch directory exists. The state directory's removal used to be registered after that, so a throw in between left it behind (an injected throw: exit 1, and `mutation-state-*`
    // in TMPDIR). The fault is a throw placed where the scratch directory is about to be made; the state directory (1 directory) is all that exists by then.
    const crashEarlyTmp = join(scratch, 'crash-early-tmp')
    mkdirSync(crashEarlyTmp)
    const crashedEarly = spawnSync(process.execPath, [here, '--self-test'], { cwd: process.cwd(), encoding: 'utf8', timeout: 120_000, env: { ...process.env, ...clean, MUTATION_SELFTEST_CHILD: '1', MUTATION_FAULT: 'self-test-crashes-early', TMPDIR: crashEarlyTmp } })
    const leftEarly = readdirSync(crashEarlyTmp)
    check('E25: ...AND SO DOES ONE BEFORE THE SCRATCH DIRECTORY IS MADE: it did crash (exit 1, the injected fault named in its report), and its temp directory holds nothing (1 directory made by then, mutation-state-*)',
      crashedEarly.status === 1 && /MUTATION_FAULT=self-test-crashes-early/.test(String(crashedEarly.stderr)) && leftEarly.length === 0,
      `status ${crashedEarly.status}; left behind in its TMPDIR: ${leftEarly.join(', ') || 'nothing'}; stderr ${String(crashedEarly.stderr).split('\n')[0].slice(0, 120)}`)

    // E26: a harness run killed INSIDE another's expectation keeps its state beneath the parent's, and the parent's own clear must not delete it. The test-only fault starts the child
    // from the parent's expectation and kills it with its mutation applied; the parent then finishes (it catches or not: either way it clears its state), and the next run heals the child.
    reset()
    const strands = go(['--only', 'outbox-stub'], { MUTATION_FAULT: 'expect-strands-a-child' })
    const childMarker = join(repo, '.mutation-state', 'nested', 'active.json')
    const childLeft = existsSync(childMarker)
    const childFileMutated = read(join(repo, 'docs/gate-rows.txt')) === MUTATED_ROWS
    const strandedBack = writeUpsBack()
    const healsChild = go(['--heal'])
    check('E26: A CHILD RUN KILLED INSIDE ANOTHER\'S EXPECTATION KEEPS ITS MARKER WHEN THE PARENT CLEARS ITS OWN STATE (the parent put its own write-ups back), and the next run heals it: HEALED, the file is back, the state is gone',
      childLeft && childFileMutated && strandedBack && /HEALED/.test(text(healsChild)) && read(join(repo, 'docs/gate-rows.txt')) === rows && !existsSync(join(repo, '.mutation-state')),
      `after the parent (exit ${strands.status}): child marker kept ${childLeft}, its file mutated ${childFileMutated}, the parent's write-ups back ${strandedBack}; heal: ${text(healsChild).split('\n').filter(l => /HEALED|Nothing to heal|::error::/.test(l)).join(' | ').slice(0, 200)}; file back ${read(join(repo, 'docs/gate-rows.txt')) === rows}, state gone ${!existsSync(join(repo, '.mutation-state'))}`)
    // ...and the run that owns that child does not end green over it. The run above is a survivor (the fixture's row passes on a stub), so it exits 1 on its own account; with
    // ROW_FAILS_ON_STUB the row fails on a stub, `outbox-stub` is CAUGHT, and the parent is green by itself (measured 2026-11-05: `2/2 checks passed`, exit 0, docs/gate-rows.txt mutated).
    // It must then exit 1 BECAUSE of the child, name the child, the file and the heal command, and heal nothing: the marker and the mutation are still there afterwards, for a person to hear about.
    reset()
    const caughtAlone = go(['--only', 'outbox-stub'], { ROW_FAILS_ON_STUB: '1' })
    reset()
    const caughtOverChild = go(['--only', 'outbox-stub'], { MUTATION_FAULT: 'expect-strands-a-child', ROW_FAILS_ON_STUB: '1' })
    const childStillThere = existsSync(childMarker)
    const childStillMutated = read(join(repo, 'docs/gate-rows.txt')) === MUTATED_ROWS
    const parentBack = writeUpsBack()
    const healsNamed = go(['--heal'])
    check('E26: A RUN THAT IS GREEN ON ITS OWN ACCOUNT BUT HAS A KILLED CHILD\'S MUTATION LEFT IN `nested` FAILS: exit 1 where it exits 0 alone, it prints PASS for its own entry and names the child, the file and `node scripts/mutation-check.mjs --heal`; it heals nothing (the marker and the mutated file are still there, its own write-ups are back), and the command it names heals it (1 run with a stranded child, 1 control without)',
      caughtAlone.status === 0 && !/left applied/.test(text(caughtAlone))
        && caughtOverChild.status === 1 && /PASS  \[outbox-stub\]/.test(text(caughtOverChild))
        && /\.mutation-state\/nested\/active\.json is a mutation a harness run started inside this one left applied \(\[known-survivor\] on docs\/gate-rows\.txt\)/.test(text(caughtOverChild))
        && /Heal it: node scripts\/mutation-check\.mjs --heal/.test(text(caughtOverChild)) && /\d+\/\d+ checks passed/.test(text(caughtOverChild)) && !/HEALED/.test(text(caughtOverChild))
        && childStillThere && childStillMutated && parentBack
        && /HEALED/.test(text(healsNamed)) && read(join(repo, 'docs/gate-rows.txt')) === rows && !existsSync(join(repo, '.mutation-state')),
      `alone: exit ${caughtAlone.status}; over the child: exit ${caughtOverChild.status}, ${text(caughtOverChild).split('\n').filter(l => /^PASS|^FAIL|left applied/.test(l)).join(' | ').slice(0, 260)}; child marker kept ${childStillThere}, file mutated ${childStillMutated}, own write-ups back ${parentBack}; heal: ${text(healsNamed).split('\n').filter(l => /HEALED|Nothing to heal|::error::/.test(l)).join(' | ').slice(0, 120)}`)
    reset()

    // E27: a MUTATION_STATE_DIR that already holds something this harness did not write is refused, not emptied (the first clear would delete it: measured 2026-11-05, a directory with
    // two files was gone after one `--only known-survivor`). A directory that is absent, empty, or holds one of the harness's own names (a dead run's lock, a stranded nested run, a
    // dead build driver's record) is used. The refusal is a usage error (status 2) and happens before anything is touched.
    reset()
    const foreignDir = join(scratch, 'foreign-dir')
    mkdirSync(join(foreignDir, 'sub'), { recursive: true })
    writeFileSync(join(foreignDir, 'keep.txt'), 'not the harness\'s\n')
    writeFileSync(join(foreignDir, 'sub', 'also.txt'), 'nor this\n')
    const kf = go(['--only', 'known-survivor'], { MUTATION_STATE_DIR: foreignDir })
    const foreignKept = read(join(foreignDir, 'keep.txt')) === 'not the harness\'s\n' && read(join(foreignDir, 'sub', 'also.txt')) === 'nor this\n'
    check('E27: A STATE DIRECTORY THAT HOLDS FILES THE HARNESS DID NOT WRITE IS REFUSED, NOT EMPTIED: exit 2, the message names what is in it (keep.txt, sub) and what to give instead (a directory that is absent or empty), both files are still there, nothing was mutated and no run started',
      kf.status === 2 && /already holds files this harness did not write \(keep\.txt, sub\)/.test(text(kf)) && /give MUTATION_STATE_DIR one that is absent or empty\. Nothing was touched\./.test(text(kf)) && foreignKept && !/Mutation testing/.test(text(kf)) && read(join(repo, 'docs/gate-rows.txt')) === rows && !existsSync(join(repo, '.mutation-state')),
      `status ${kf.status}, files kept ${foreignKept}, ran ${/Mutation testing/.test(text(kf))}; ${text(kf).split('\n')[0].slice(0, 160)}`)
    // ...and a path that is a file, not a directory, is not one this harness can use either.
    const fileAsDir = join(scratch, 'state-is-a-file')
    writeFileSync(fileAsDir, 'a file\n')
    const kfile = go(['--only', 'known-survivor'], { MUTATION_STATE_DIR: fileAsDir })
    check('E27: ...and so is a state directory that is a file: exit 2 with the same refusal, and the file is untouched',
      kfile.status === 2 && /already holds files this harness did not write \(not a directory it can read\)/.test(text(kfile)) && read(fileAsDir) === 'a file\n' && !/Mutation testing/.test(text(kfile)),
      `status ${kfile.status}; ${text(kfile).split('\n')[0].slice(0, 160)}`)
    // The harness's own names are used: a dead run's lock, and a dead build driver's record (a run killed after it cleared a stale lock and before it finished stopping that driver
    // leaves only the record), each in a directory of its own. Both runs start, and neither refuses.
    const ownLock = join(scratch, 'own-lock')
    mkdirSync(ownLock)
    writeFileSync(join(ownLock, 'run.json'), JSON.stringify(DEAD))
    const ownDriver = join(scratch, 'own-driver')
    mkdirSync(ownDriver)
    writeFileSync(join(ownDriver, 'driver.json'), JSON.stringify({ run: DEAD, driver: { pid: 2 ** 30, start: '1' } }))
    const kown = [ownLock, ownDriver].map(d => { reset(); const r = go(['--only', 'known-survivor'], { MUTATION_STATE_DIR: d }); return { d, started: /Mutation testing/.test(text(r)), refused: /did not write/.test(text(r)), status: r.status } })
    check('E27: ...and a directory that holds only the harness\'s own entries is used, not refused: a dead run\'s lock, and a dead build driver\'s record (2 directories)',
      kown.every(x => x.started && !x.refused), kown.map(x => `${x.d.split('/').pop()}: started ${x.started}, refused ${x.refused}, status ${x.status}`).join(' / '))
    // ...and a directory that EXISTS and is EMPTY. The guard's own comment names it (absent, empty, or one of the harness's names), and it arises: the next run's checkLocks removes a stale run.json and leaves
    // the directory empty until the lock is taken again, so a kill in that gap leaves exactly this. Refusing it would wedge every later run behind a message about files that are not there.
    const emptyState = join(scratch, 'empty-state')
    mkdirSync(emptyState)
    reset()
    const kempty = go(['--only', 'known-survivor'], { MUTATION_STATE_DIR: emptyState })
    check('E27: ...and a directory that exists and is EMPTY is used, not refused (what a run killed between removing a stale lock and taking its own leaves): the run starts and nothing says the harness did not write it (1 directory)',
      /Mutation testing/.test(text(kempty)) && !/did not write/.test(text(kempty)),
      `status ${kempty.status}; started ${/Mutation testing/.test(text(kempty))}, refused ${/did not write/.test(text(kempty))}; ${text(kempty).split('\n')[0].slice(0, 160)}`)
    // ...and a directory that holds only a stash (`world`): the fifth name, the one the clauses above do not use. A run killed between making a stash directory and writing its marker, whose stale lock the next
    // run then removed before that one was killed too, leaves exactly this; the stash directory is empty then, because the mutation had not run.
    const ownWorld = join(scratch, 'own-world')
    mkdirSync(join(ownWorld, 'world', 'outbox-stub'), { recursive: true })
    reset()
    const kworld = go(['--only', 'known-survivor'], { MUTATION_STATE_DIR: ownWorld })
    check('E27: ...and a directory that holds only a stash (`world`, the name no other clause here uses) is used, not refused (1 directory)',
      /Mutation testing/.test(text(kworld)) && !/did not write/.test(text(kworld)),
      `status ${kworld.status}; started ${/Mutation testing/.test(text(kworld))}, refused ${/did not write/.test(text(kworld))}; ${text(kworld).split('\n')[0].slice(0, 160)}`)
    // ...and a directory that holds only a source mutation's BACKUP: the name is the file's path with its slashes flattened, here the backup of docs/gate-rows.txt, which the table mutates. It is what a kill
    // between writing the backup and writing the marker leaves once the next run has removed the stale lock and been killed too (the file was not yet touched, so there is nothing to heal). It was refused,
    // `--heal` included, with a sentence saying the harness did not write it (measured 2026-11-05). A file with an underscore that is NOT a backup of a table file is still foreign.
    const ownBackup = join(scratch, 'own-backup')
    mkdirSync(ownBackup)
    writeFileSync(join(ownBackup, 'docs_gate-rows.txt'), rows)
    const ownBackupHeal = join(scratch, 'own-backup-heal')
    mkdirSync(ownBackupHeal)
    writeFileSync(join(ownBackupHeal, 'docs_gate-rows.txt'), rows)
    const notABackup = join(scratch, 'not-a-backup')
    mkdirSync(notABackup)
    writeFileSync(join(notABackup, 'docs_not-a-file-in-the-table.txt'), 'x\n')
    reset()
    const kbackup = go(['--only', 'known-survivor'], { MUTATION_STATE_DIR: ownBackup })
    const kbackupHeal = go(['--heal'], { MUTATION_STATE_DIR: ownBackupHeal })
    const kunder = go(['--only', 'known-survivor'], { MUTATION_STATE_DIR: notABackup })
    check('E27: ...and a directory that holds only a source mutation\'s BACKUP (docs_gate-rows.txt) is used, not refused, by a run and by `--heal` (which says there was nothing to heal); a file that is not the backup of a file in the table (docs_not-a-file-in-the-table.txt) is still refused (3 directories)',
      /Mutation testing/.test(text(kbackup)) && !/did not write/.test(text(kbackup)) && kbackupHeal.status === 0 && /Nothing to heal/.test(text(kbackupHeal)) && !/did not write/.test(text(kbackupHeal))
        && kunder.status === 2 && /did not write \(docs_not-a-file-in-the-table\.txt\)/.test(text(kunder)),
      `run: started ${/Mutation testing/.test(text(kbackup))}, refused ${/did not write/.test(text(kbackup))}; --heal: status ${kbackupHeal.status}, ${text(kbackupHeal).split('\n').filter(l => /Nothing to heal|did not write/.test(l)).join(' | ').slice(0, 140)}; not a backup: status ${kunder.status}, ${text(kunder).split('\n')[0].slice(0, 130)}`)
    // The refusal names at most four entries and ends the list with `, ...` when there are more: five foreign entries read as the first four (sorted) and the ellipsis, exactly four read as the four and
    // none. (E27's first clause lists two, so a bound moved by one, or a slice cut short, changed nothing it could see.)
    const foreignMany = n => {
      const d = join(scratch, `foreign-${n}`)
      mkdirSync(d)
      for (const f of ['a.txt', 'b.txt', 'c.txt', 'd.txt', 'e.txt'].slice(0, n)) writeFileSync(join(d, f), 'not the harness\'s\n')
      return d
    }
    const kfive = go(['--only', 'known-survivor'], { MUTATION_STATE_DIR: foreignMany(5) })
    const kfour = go(['--only', 'known-survivor'], { MUTATION_STATE_DIR: foreignMany(4) })
    check('E27: THE REFUSAL NAMES FOUR ENTRIES AND ENDS THE LIST WITH `...` WHEN THERE ARE MORE: of 5 foreign entries it lists the first four (sorted) and `, ...`; of exactly 4 it lists the four and no ellipsis (2 directories)',
      kfive.status === 2 && /did not write \(a\.txt, b\.txt, c\.txt, d\.txt, \.\.\.\)/.test(text(kfive)) && !/e\.txt/.test(text(kfive))
        && kfour.status === 2 && /did not write \(a\.txt, b\.txt, c\.txt, d\.txt\), and it empties/.test(text(kfour)),
      `5 entries: status ${kfive.status}, ${text(kfive).split('\n')[0].slice(0, 130)} / 4 entries: status ${kfour.status}, ${text(kfour).split('\n')[0].slice(0, 130)}`)

    // E28: a lock that appears between looking for one and taking it. `checkLocks` has just found none, so the exclusive create is what stands between two runs and one state
    // directory; MUTATION_FAULT=lock-appears has a rival take the lock inside acquireRunLock, just before that create, which is the only way to put it there on a test's schedule. The rival
    // is this self-test (the run's parent), so the planted lock names a pid that is alive and is not the run's own: if the run overwrote it, or went on, the file would say so.
    reset()
    const kl = go(['--only', 'known-survivor'], { MUTATION_FAULT: 'lock-appears' })
    let heldAfterRace = null
    try { heldAfterRace = JSON.parse(readFileSync(join(repo, '.mutation-state', 'run.json'), 'utf8')) } catch { heldAfterRace = null }
    check('E28: A LOCK THAT APPEARS BETWEEN LOOKING FOR ONE AND TAKING IT REFUSES THE RUN: exit 1, it says so, no mutation run started, docs/gate-rows.txt is untouched, and the lock that appeared is still there, naming whoever took it (1 race, 1 run)',
      kl.status === 1 && /appeared while this run was starting/.test(text(kl)) && !/Mutation testing/.test(text(kl)) && read(join(repo, 'docs/gate-rows.txt')) === rows && heldAfterRace !== null && heldAfterRace.pid === process.pid,
      `status ${kl.status}; ${text(kl).split('\n').filter(l => /::error::|Mutation testing/.test(l)).join(' | ').slice(0, 200)}; lock after: ${JSON.stringify(heldAfterRace)}`)
    // ...and a lock file that is not JSON is a stale lock, not a live run: `acquireRunLock` creates it and then writes it, so a run killed between the two (or a reader that looks between
    // them) finds an empty or half-written file. Today's rule is that it names no run and is removed; a live holder caught in that gap can be mistaken for stale, which this does not fix.
    reset()
    mkdirSync(join(repo, '.mutation-state'), { recursive: true })
    writeFileSync(join(repo, '.mutation-state', 'run.json'), '{"pid": 12')
    const kj = go(['--only', 'known-survivor'])
    check('E28: ...and a lock file that is not JSON (a run killed between creating it and writing it) is a stale lock: the run goes ahead, it is not refused as live, and it does not crash on the parse (1 torn lock)',
      /Mutation testing/.test(text(kj)) && /known-survivor/.test(text(kj)) && !/IN PROGRESS/.test(text(kj)) && !/SyntaxError/.test(text(kj)),
      `status ${kj.status}; ${text(kj).split('\n').filter(l => /IN PROGRESS|SyntaxError|::error::|Mutation testing/.test(l)).join(' | ').slice(0, 200)}`)
    reset()
  } else {
    console.log('  (the real-script clauses were skipped: this self-test was started by another, and each of them would start the next)')
  }

  // THE BUILD DRIVER A DEAD RUN LEFT (reapDriver): each branch against fakes, in a directory of its own.
  {
    const dir = join(scratch, 'driver-units')
    const plant = rec => { rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, 'driver.json'), typeof rec === 'string' ? rec : JSON.stringify(rec)) }
    const rec = (pid = 4242, start = '111', run = DEAD) => ({ run, driver: { pid, start } })
    // `ends` is the signal that makes the fake group go away; `graceMs`/`killMs` are 0 so a clause that is meant to wait for nothing waits for nothing.
    const reap = async (record, { live = false, stat = () => null, ends = null } = {}) => {
      plant(record)
      const sent = []
      const logged = []
      let exited = null, up = true
      const kill = (pid, sig) => { sent.push(`${sig}@${pid}`); if (ends === sig) up = false }
      const out = await reapDriver(dir, { probes: { ...healProbes, live: () => live }, log: t => logged.push(t), kill, alive: () => up, stat, graceMs: 0, killMs: 0, exit: c => { exited = c } })
      return { out, sent, exited, logged, kept: existsSync(join(dir, 'driver.json')) }
    }
    const a = await reap(rec(), { stat: () => ({ state: 'S', start: '999' }) })
    check('REAP: a pid that now holds a process with another start time is not ours: nothing is signalled and the record is dropped',
      a.sent.length === 0 && a.out === false && !a.kept, JSON.stringify(a))
    const b = await reap(rec(), { live: true })
    check('REAP: a driver whose run is still running is that run\'s, not an orphan: nothing is signalled and the record stays',
      b.sent.length === 0 && b.out === false && b.kept, JSON.stringify(b))
    const c = await reap(rec(), { stat: () => null, ends: 'SIGTERM' })
    check('REAP: a dead parent with its child still in the group is stopped by signalling the GROUP (a negative pid), TERM only, and the record is dropped',
      JSON.stringify(c.sent) === '["SIGTERM@-4242"]' && c.out === true && !c.kept, JSON.stringify(c))
    const d = await reap(rec(), { stat: () => ({ state: 'S', start: '111' }), ends: 'SIGKILL' })
    check('REAP: a driver that ignores TERM is killed: TERM, then KILL, both to the group',
      JSON.stringify(d.sent) === '["SIGTERM@-4242","SIGKILL@-4242"]' && d.out === true && !d.kept, JSON.stringify(d))
    const e = await reap(rec(), { stat: () => ({ state: 'S', start: '111' }) })
    check('REAP: a driver that survives KILL stops the run and keeps the record (two drivers would write one build/)',
      e.exited === 1 && e.sent.length === 2 && e.kept && e.logged.some(l => /did not stop/.test(l)), JSON.stringify(e))
    const f = await reap(rec(1), { stat: () => ({ state: 'S', start: '111' }) })
    const g = await reap(rec(0))
    const h = await reap('{not json')
    check('REAP: a record that names pid 1 or 0, or does not parse (3 shapes), signals nothing (-1 is every process the user may signal) and is dropped with a warning',
      [f, g, h].every(x => x.sent.length === 0 && !x.kept && x.logged.some(l => /does not name a build driver/.test(l))), JSON.stringify({ f, g, h }))
    check('REAP: a process group is alive only while a process in it is not a zombie (4 groups)',
      groupHasLive([['S', 7], ['Z', 42], ['S', 8]], 42) === false && groupHasLive([['Z', 42], ['S', 42]], 42) === true && groupHasLive([], 42) === false && groupHasLive([['X', 42]], 42) === false, 'a group of nothing but zombies has nothing left to stop')
    rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true })
    const nothing = []
    check('REAP: a directory with no driver record has nothing to stop, and says nothing about it', (await reapDriver(dir, { log: t => nothing.push(t) })) === false && nothing.length === 0, `driver.json is absent; said ${JSON.stringify(nothing)}`)
    // The record outlives a clear and a heal (the watcher outlives a mutation), and goes when the watcher is stopped.
    writeFileSync(join(dir, 'driver.json'), '{}'); writeFileSync(join(dir, 'active.json'), '{}')
    emptyEntries(dir)
    check('REAP: clearing the state (between two mutations) keeps the driver record, because the watcher is still running',
      existsSync(join(dir, 'driver.json')) && !existsSync(join(dir, 'active.json')), `driver.json kept ${existsSync(join(dir, 'driver.json'))}, marker gone ${!existsSync(join(dir, 'active.json'))}`)
    mkdirSync(stateDir, { recursive: true })
    // A process that is NOT this one: given process.pid, the clause passed with the argument ignored, because the harness's own pid is what a record that ignored it would hold (review 6, 2026-11-05).
    const other = spawn('sleep', ['30'], { stdio: 'ignore' })
    const otherStart = startOf(other.pid)
    let written = null
    try {
      recordDriver(other.pid)
      written = JSON.parse(readFileSync(driverFile, 'utf8'))
    } finally {
      other.kill('SIGKILL')
      rmSync(driverFile, { force: true })
    }
    check('REAP: the record names the process it was given, a pid that is not the harness\'s own, with that process\'s start time, and the run that wrote it (the harness)',
      written.driver.pid === other.pid && written.driver.pid !== process.pid && written.run?.pid === process.pid && (!haveProc || written.driver.start === otherStart), JSON.stringify(written))
    // Stopping the watcher signals it, forgets the record, and leaves no empty state directory behind (the record was all that kept `releaseRunLock`'s rmdir from removing it).
    const savedBuilder = builder
    let stopped = 0
    builder = { stop: () => { stopped++ } }
    rmSync(stateDir, { recursive: true, force: true }); mkdirSync(stateDir, { recursive: true }); writeFileSync(driverFile, '{}')
    stopBuilder()
    const droppedRecord = !existsSync(driverFile)
    const droppedDir = !existsSync(stateDir)
    builder = savedBuilder
    check('REAP: stopping the watcher signals it, forgets the record, and removes the state directory the record was keeping', stopped === 1 && droppedRecord && droppedDir, `stop called ${stopped} time(s), record dropped ${droppedRecord}, directory dropped ${droppedDir}`)

    // THE TWO WAITS IN reapDriver, which every clause above sets to 0 ms: the grace a group gets to obey a TERM (10 s), the grace it gets to obey the KILL after it (2 s), and the case where nothing
    // is left to stop. The fake group goes down 150 ms after the signal it is made to obey, so a reaper that waits is told from one that does not by what it SENDS: nothing at all for a group that
    // is already gone; TERM alone for one that obeys it inside the grace; TERM and then KILL for one that obeys only the KILL. Each case has a directory of its own, and the three go at once.
    {
      const reapTimed = async (name, { down = false, termDownMs = null, killDownMs = null, graceMs = 3000, killMs = 3000 }) => {
        const at = join(scratch, `driver-timed-${name}`)
        rmSync(at, { recursive: true, force: true }); mkdirSync(at, { recursive: true })
        writeFileSync(join(at, 'driver.json'), JSON.stringify(rec()))
        const sent = []
        const logged = []
        let exited = null, up = !down
        const kill = (pid, sig) => { sent.push(`${sig}@${pid}`); const after = sig === 'SIGTERM' ? termDownMs : killDownMs; if (after !== null) setTimeout(() => { up = false }, after) }
        const lap = stopwatch()
        const out = await reapDriver(at, { probes: { ...healProbes, live: () => false }, log: t => logged.push(t), kill, alive: () => up, stat: () => ({ state: 'S', start: '111' }), graceMs, killMs, exit: c => { exited = c } })
        return { out, sent, exited, logged: logged.length, kept: existsSync(join(at, 'driver.json')), ms: lap() }
      }
      const [goneCase, graceCase, killCase] = await Promise.all([
        reapTimed('gone', { down: true }),
        reapTimed('grace', { termDownMs: 150 }),
        reapTimed('kill', { killDownMs: 150, graceMs: 50 }),
      ])
      check('REAP: a record whose group is already gone has nothing to stop: nothing is signalled, nothing is said, the record is dropped, and the answer is false (so no rebuild follows)',
        goneCase.sent.length === 0 && goneCase.logged === 0 && goneCase.out === false && !goneCase.kept && goneCase.exited === null, JSON.stringify(goneCase))
      check('REAP: a group that obeys the TERM inside its grace gets the TERM and nothing more: no KILL is sent while it is still going down (3 s grace, down after 150 ms)',
        JSON.stringify(graceCase.sent) === '["SIGTERM@-4242"]' && graceCase.out === true && !graceCase.kept && graceCase.exited === null, JSON.stringify(graceCase))
      check('REAP: a group that ignores the TERM and obeys the KILL is waited for after the KILL, and the run goes on (50 ms grace, 3 s kill grace, down 150 ms after the KILL)',
        JSON.stringify(killCase.sent) === '["SIGTERM@-4242","SIGKILL@-4242"]' && killCase.out === true && !killCase.kept && killCase.exited === null, JSON.stringify(killCase))
    }

    // THE REAL WatchBuild, started over a host that does NOT pass a TERM on. The real `dotnet` host does (probed 2026-11-05 on Fable 5.13.0: a TERM to the leader of a detached `dotnet fable
    // watch` left nothing in its group 6 s later), but that is the host's courtesy: a wedged host, or one sent KILL, cannot extend it, and the compiler under it would go on writing build/. The
    // stand-in host is `sh -c 'node fake-fable-watch.mjs ... & wait'`, which dies of a TERM and leaves the compiler it started in the group. /proc finds the group, so none of this is asserted without it.
    // The two cases go at once, each in a directory of its own. Not from inside a self-test the harness started (MUTATION_SELFTEST_CHILD): the two of those that every self-test starts would
    // each run these real processes again, and what they check (that a self-test passes inside another) does not need them.
    if (!process.env.MUTATION_SELFTEST_CHILD && haveProc) {
      const fake = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'fake-fable-watch.mjs')
      const groupSize = pgid => (procGroups() ?? []).filter(entry => groupHasLive([entry], pgid)).length
      const until = async (done, ms = 4000) => { for (let waited = 0; waited < ms && !done(); waited += 25) await new Promise(r => setTimeout(r, 25)); return done() }
      /** A real WatchBuild over that host, and the pid of every group it started (the pid the harness would write in driver.json). */
      const hostOf = (name, env = {}) => {
        const wdir = join(scratch, `watchbuild-${name}`)
        mkdirSync(wdir, { recursive: true })
        writeFileSync(join(wdir, 'Watched.fs'), 'let x = 1\n')
        const pids = []
        const wb = new WatchBuild({
          command: 'sh', args: ['-c', `node ${JSON.stringify(fake)} ${JSON.stringify(join(wdir, 'Watched.fs'))} ${JSON.stringify(join(wdir, 'out'))} & wait`],
          cwd: wdir, env: { ...process.env, ...env }, outDir: join(wdir, 'out'), extraFiles: [], assemble: () => true, settleMs: 50, startPauseMs: 10, onSpawn: pid => pids.push(pid),
        })
        return { wb, pids }
      }
      const reapGroups = pids => { for (const pid of pids) { try { process.kill(-pid, 'SIGKILL') } catch { /* gone */ } } }
      const stopCase = async () => {
        const { wb, pids } = hostOf('stop')
        try {
          await wb.start()
          const before = groupSize(pids[0])
          wb.stop()
          const gone = await until(() => groupSize(pids[0]) === 0)
          return { before, gone, left: groupSize(pids[0]) }
        } finally { reapGroups(pids) }
      }
      const retryCase = async () => {
        const { wb, pids } = hostOf('retry', { FAKE_START_MODE: 'crash-once', FAKE_START_MARK: join(scratch, 'watchbuild-retry-mark') })
        try {
          const lap = stopwatch()
          await wb.start()
          return { groups: pids.length, repeats: wb.startRepeats, firstLeft: groupSize(pids[0]), secondUp: groupSize(pids[1]), ms: lap() }
        } finally { reapGroups(pids) }
      }
      const [stopRun, retryRun] = await Promise.all([stopCase(), retryCase()])
      check('WATCHBUILD: stop() signals the watcher\'s whole process group, so a host that does not pass the TERM on leaves no compiler running (the group held 2 live processes, the shell and the compiler, before the call and 0 within 4 s after it)',
        stopRun.before >= 2 && stopRun.gone, JSON.stringify(stopRun))
      // The time is the observable that tells a group TERM from a leader-only one: the escalation to KILL signals the group too, so after the 10 s it waits for the TERM the first compiler is gone either way.
      check('WATCHBUILD: a first start that dies of a compiler crash is stopped by signalling the whole group before the second one begins, so the first compiler is gone when start() returns and the stop did not wait out its 10 s TERM grace (2 groups started, 1 retry, the first holds 0 live processes, the second at least 2, start() took under 6 s)',
        retryRun.groups === 2 && retryRun.repeats === 1 && retryRun.firstLeft === 0 && retryRun.secondUp >= 2 && retryRun.ms < 6000, JSON.stringify(retryRun))
    } else if (!process.env.MUTATION_SELFTEST_CHILD) {
      console.log('  (the WATCHBUILD clauses were not asserted: /proc cannot be read here, and they find the group by it)')
    }

    // The bound between "exactly six" and "eight" in the refusal over a world mutation's touched paths: SEVEN edited paths read as the first six and "and 1 more". An off-by-one in the bound hides a path
    // from the person deciding what to put back, and the clause that holds the bound tests 8 and 6.
    const wSevenRun = editedRun(7)
    check('THE REFUSAL COUNTS THE SEVENTH PATH: of 7 edited paths it lists the first six and "and 1 more" and does not name the seventh (the bound between exactly 6 and 8, which the clause above does not reach)',
      wSevenRun.code === 1 && wSevenRun.said.includes(`(${SIX}, and 1 more)`) && !wSevenRun.said.includes('out/p6.md'), wSevenRun.said.slice(0, 260))

    // run()'s reading of an exit status: only 129 to 159 reads as a command that was KILLED (a shell reports a killed child as 128 plus the signal). 127 (command not found), 128 (git's fatal status),
    // 160 and above are answers. The window stays: see the comment on `lastSignal`. `exit 130` here is the limit that comes with it, pinned so that it is a decision and not an accident.
    const readOf = n => { run(`exit ${n}`); return lastSignal }
    const reads = Object.fromEntries([1, 127, 128, 129, 130, 159, 160, 255].map(n => [n, readOf(n)]))
    check('RUN: ONLY 129 TO 159 READS AS A COMMAND THAT WAS KILLED: 129, 130 and 159 read as killed, and 1, 127, 128, 160 and 255 are failures that answered (8 statuses). LIMIT, kept on purpose: a command that exits 130 on its own reads as killed too',
      [1, 127, 128, 160, 255].every(n => reads[n] === null) && reads[129] === 'status 129' && reads[130] === 'status 130' && reads[159] === 'status 159', JSON.stringify(reads))

    // The signal that ended one command is not remembered by the next. `expectation` reads `lastSignal` after every `run`, and only a command that FAILS reassigns it (the catch), so one that
    // passes leaves whatever the last one left: a stale kill would stop the run for a command that did nothing wrong.
    run('kill -KILL $$')
    const afterKill = lastSignal
    const passedAfter = run('true')
    check('RUN: A COMMAND THAT ENDS BY ITSELF LEAVES NO SIGNAL BEHIND IT: after a command that killed its own shell (SIGKILL), one that exits 0 returns true and `lastSignal` is null again (2 commands)',
      afterKill === 'SIGKILL' && passedAfter === true && lastSignal === null, `after the kill ${afterKill}, the next returned ${passedAfter}, signal now ${lastSignal}`)
  }

  const fixture = [{ id: 'live', file: 'a', find: 'x', replace: 'y' }, { id: 'stale', file: 'a', find: 'gone', replace: 'y' }, { id: 'world', mutate: 'z' }]
  const probe = staleAnchors(fixture, () => 'x is here')
  check('A STALE ANCHOR IS FOUND, a live one is not, a world mutation is not counted',
    probe.checked === 2 && probe.stale.length === 1 && probe.stale[0].startsWith('stale:'), JSON.stringify(probe))
  // ...and an anchor that occurs TWICE is reported: `replace` takes the first, so the entry may be mutating something other than what its claim says (one was: the harness's own
  // `harness-reads-the-clock-twice`, whose two-space anchor was a substring of a four-space line above the one it meant). In this file only the region after the table counts.
  const twice = staleAnchors([{ id: 'twice', file: 'a', find: 'x', replace: 'y' }, { id: 'once', file: 'a', find: 'q', replace: 'y' }], () => 'x and x and q')
  const inTable = staleAnchors([{ id: 'harness', file: 'scripts/mutation-check.mjs', find: 'x', replace: 'y' }], () => 'x in the table\nconst selected = ONLY\nx after it, once')
  const inTable2 = staleAnchors([{ id: 'harness', file: 'scripts/mutation-check.mjs', find: 'x', replace: 'y' }], () => 'x in the table\nconst selected = ONLY\nx after it, and x again')
  check('AN ANCHOR THAT OCCURS TWICE IS REPORTED AS AMBIGUOUS, and one that occurs once is not; in this file only what comes after the table is counted',
    twice.stale.length === 1 && /^twice: AMBIGUOUS/.test(twice.stale[0]) && inTable.stale.length === 0 && inTable2.stale.length === 1 && /^harness: AMBIGUOUS/.test(inTable2.stale[0]),
    JSON.stringify({ twice, inTable, inTable2 }))

  check('A FULL RUN OWNS THE BASELINE ARTIFACT', ownsBaseline(null) === true,
    'the full suite is the only run whose baseline describes the whole suite')
  check('AN --only RUN DOES NOT, so it cannot overwrite the full record',
    ownsBaseline('known-survivor') === false,
    'the gate runs `--only known-survivor` straight after the full suite; if it ' +
    'writes, the committed baseline is 1 of 1 and the full one is gone')

  const ids = eligible.map(m => m.id)
  const parts = [1, 2, 3, 4, 5, 6, 7, 8].map(i => shardOf(ids, i, 8))
  check('THE SHARDS PARTITION THE TABLE: every eligible id is in exactly one of 8 shards',
    parts.flat().length === ids.length && new Set(parts.flat()).size === ids.length && ids.every(id => parts.flat().includes(id)),
    `${parts.flat().length} ids across the shards, ${new Set(parts.flat()).size} distinct, ${ids.length} in the table`)
  check('A SHARD (or an --ids list) DOES NOT WRITE THE BASELINE ARTIFACT, so eight of them cannot overwrite one record',
    writesBaseline(null, null) === true && writesBaseline(null, ['a']) === false && writesBaseline('known-survivor', null) === false,
    'only a run of the whole table writes it')
  check('every mutation has a distinct id', new Set(ids).size === ids.length, 'a repeated id would run twice in one shard and never in another')

  // The command line, run for real. Each of these exits before the baseline, so nothing is built, mutated or healed, and each has to be a usage error (status 2) that says
  // what was wrong, not a stack trace (status 1) and not a run that started anyway.
  const usage = args => {
    try { execSync(`node scripts/mutation-check.mjs ${args}`, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }); return { status: 0, err: '' } }
    catch (e) { return { status: e.status, err: String(e.stderr) } }
  }
  for (const [args, re] of [
    ['--shard 9/8', /i must be between 1 and N/],
    ['--shard 3-8', /wants i\/N/],
    ['--shard 1/8 --ids score-presence', /give one of them/],
    ['--ids nope', /selects no mutation/],
    ['--ids score-presence,nope', /names an id no mutation has \(nope\)/],
    ['--only known-survivor --shard 1/8', /cannot be combined/],
    ['--build bogus --ids score-presence', /watch or full/],
    ['--ids ""', /--ids wants a value/],
    ['--shard', /--shard wants a value/],
    ['--out', /--out wants a value/],
    ['--ids --build full', /--ids wants a value/],
  ]) {
    const r = usage(args)
    check(`MUTATION: \`${args}\` is a usage error that says why`, r.status === 2 && re.test(r.err), `status ${r.status}: ${r.err.split('\n').find(l => l.trim()) ?? '(no message)'}`)
  }

  rmSync(scratch, { recursive: true, force: true })
  clearActive()
  // The directory itself too: it is a mkdtemp of this run's own, and the pre-commit hook and every table entry that expects a self-test left three of them in tmp each time.
  rmSync(stateDir, { recursive: true, force: true })
  process.exit(summarize() === 0 ? 0 : 1)
}

// Before the baseline, not after: a stranded mutation would otherwise be
// measured as a product failure, which is precisely what happened today.
//
// THE LOCK COMES FIRST, then the heal. A heal ends in a full compile when a source file was stranded, so it is the longest phase of a start, and a lock taken after it
// left that whole phase open: two runs started over one stranded marker both healed, and the slower one's cleanup deleted the faster one's lock, marker and backup
// (reproduced in review, 2026-11-04). The heal's cleanup keeps run.json for the same reason.
// Read once and REMOVED, so nothing this run starts inherits it: the baseline's `--self-test` ran with it set in the re-executed child, and group E's own re-exec clause
// could not re-exec, so the re-executed run failed its baseline on a clean tree (review 4, 2026-11-04). A guard that is set is for this process only.
const RESTARTED = process.env.MUTATION_REEXEC === '1'
delete process.env.MUTATION_REEXEC
/** The name a source mutation's backup has in the state directory: the file's path with its slashes flattened. One definition for the run that writes it and the guard that must recognise it. */
const backupName = file => file.replace(/\//g, '_')
// The test-only hooks (a fault, a moment to be killed at, a lower output limit) are read by any run, and the self-test is the only thing that should set them. One left exported in a developer's shell
// makes a real run die or stop with a cause that does not point at the environment (review 6, 2026-11-05: MUTATION_FAULT=expect-interrupted printed only "ended by SIGINT"; MUTATION_KILL_AT=source-applied
// exited 137 with docs/gate-rows.txt left mutated). So each one that is set is named, on stderr, before anything is touched. Named and not refused: a manual kill drill on the real tree sets them on purpose.
// (MUTATION_KILL_SIGNAL is not in the list: it only chooses the signal MUTATION_KILL_AT sends, and does nothing alone.)
for (const name of ['MUTATION_FAULT', 'MUTATION_KILL_AT', 'MUTATION_OUTPUT_LIMIT']) {
  if (process.env[name]) console.error(`test hook active: ${name}=${process.env[name]}`)
}
// A state directory is the harness's to empty: clearActive() removes everything in it but the run lock, the build driver's record and a nested run's state. A MUTATION_STATE_DIR that already
// holds something this harness did not write would lose it at the first clear (measured 2026-11-05: a directory with two files was gone after one `--only known-survivor`). So only a directory
// that is absent, empty, or holds one of the five names this harness gives its own entries, or the backup of a file it mutates, is used (a child harness run's `nested` directory holds only such names).
// The backup is a name of its own: a kill between writing a source mutation's backup and writing its marker leaves a directory holding that file alone once the next run has removed the stale lock and
// been killed too, and the file was not yet touched (the marker is written before it), so there is nothing to heal and nothing to lose. It was refused, `--heal` included, with a sentence that
// said the harness did not write it (measured 2026-11-05), and only a hand-made `rm -r` got past it. The names are the table's own, so a file the harness does not mutate is still foreign.
// Lenient on purpose, and said so: ONE of those names is enough, so a person's directory that happens to hold `nested/` or `run.json` among its files would still be emptied.
{
  let holds = []
  try { holds = readdirSync(stateDir).sort() } catch (e) { if (e.code !== 'ENOENT') holds = ['not a directory it can read'] }
  const backupNames = new Set(MUTATIONS.filter(m => m.file).map(m => backupName(m.file)))
  if (holds.length > 0 && !holds.some(h => ['active.json', 'run.json', 'driver.json', 'nested', 'world'].includes(h) || backupNames.has(h))) {
    console.error(`${stateDir} already holds files this harness did not write (${holds.slice(0, 4).join(', ')}${holds.length > 4 ? ', ...' : ''}), and it empties its state directory: give MUTATION_STATE_DIR one that is absent or empty. Nothing was touched.`)
    process.exit(2)
  }
}
checkLocks(stateDir)
// A watcher a dead run left running is stopped before this run starts one of its own (two would write one build/). After checkLocks, which has refused a live run: a live run's
// watcher is that run's.
const reapedDriver = await reapDriver(stateDir)
if (!acquireRunLock()) {
  console.log(`::error::${runLock} appeared while this run was starting: another mutation run holds this state directory. It would read this run's mutated files as its own originals, so this one stops. Nothing was touched.`)
  process.exit(1)
}
const healedAny = healHeld(stateDir)
// A watcher that was stopped may have been stopped in the middle of a compile, and build/ is whole only after a full build (the same rule the heal follows for a source file:
// measured 2026-11-05, the next run's start refused with "the watched initial compile is not the build that was there"). AFTER the heal, so that the source is the original: a
// stranded mutation that does not compile would fail this build and send a person to run by hand a command that cannot pass until the heal has run.
if (reapedDriver && !run('npm run build')) {
  console.log(`::error::a build driver left by a killed run was stopped, and \`npm run build\` failed (${lastFailure}), so build/ may be half written. Run it by hand, then run this again.`)
  process.exit(1)
}
if (process.argv.includes('--heal')) {
  console.log(healedAny ? '\n  Healed. The tree is as it was before the killed run.' : '\n  Nothing to heal: no run left a mutation applied.')
  process.exit(0)
}
// A heal that restored a file THIS PROCESS IS BUILT FROM leaves the process running the copy it loaded before the restore: the mutated harness, judging everything that
// follows. (`harness-blind` stranded, then `--only known-survivor`: the healing run printed PASS and exited 0; the same run on the restored file fails, as it should.)
// So it starts again, as the restored code. MUTATION_REEXEC stops it doing so twice.
if ([...healedFiles].some(f => SELF_SOURCES.includes(f)) && !RESTARTED) {
  releaseRunLock()
  console.log('\n  The heal restored a file this harness is built from, so it starts again as the restored code.')
  const again = spawnSync(process.execPath, process.argv.slice(1), { stdio: 'inherit', env: { ...process.env, MUTATION_REEXEC: '1' } })
  process.exit(again.status ?? 1)
}
if (RESTARTED) console.log('\n  (this run is the restored code, started by the one that healed it)')

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
//
// `.every` SHORT-CIRCUITED, and that cost two different things.
//
// Measured 2026-09-05. `venue-coverage-check` had been failing since 2026-08-24,
// so this line stopped at the first failing command and never ran the other
// twenty-odd — several of them browser rows. Two consequences, both bad:
//
//   The report named ONE failing expectation when it could have named all of
//   them. "A check was already failing" is a true sentence that withholds the
//   list you need to fix it.
//
//   A RED baseline ran FASTER than a green one, which made 26m44s look like the
//   cost of a passing gate when it was the cost of a short-circuited one. The
//   45-minute job cap was then sized against that number and the next green run
//   was cancelled at 36m52s with no measurement at all.
//
// So: run every distinct expectation, collect the failures, and print the
// coverage with the verdict per Rule 91 — `22 of 22` on the way past, so a green
// baseline and a truncated red one are never again the same output. On a green
// baseline this costs nothing: `.every` already ran all of them.
const distinctExpects = [...new Set(selected.map(m => m.expect))]
// WHY AND WHAT, not just which. A failing command's name moves the question
// rather than answering it, and the output is the half nobody can get back.
const lapBaseline = stopwatch()
const baselineOne = cmd => {
  try {
    // In the child environment, like every other command this run starts (run, capture): a harness run that is an EXPECTATION (harness-blind, only-selects-nothing-passes)
    // must find a state directory of its own. Without it the baseline ran it into this run's live lock, which it refuses, and `! node …` counted the refusal as a pass:
    // the baseline of a harness that had gone blind read "0 failing" (review 2026-11-04).
    // Test-only fault: the expectation prints two megabytes first. A command that merely PRINTS a lot passes; execSync's own limit (1 MiB) would have called it failed.
    const printsALot = 'node -e "process.stdout.write(\'x\'.repeat(2 * 1024 * 1024))" && '
    execSync(process.env.MUTATION_FAULT === 'baseline-prints-a-lot' ? printsALot + cmd : process.env.MUTATION_FAULT === 'baseline-terms-the-run' ? `kill -TERM $PPID && ${cmd}` : cmd, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', env: childEnv(), maxBuffer: OUTPUT_LIMIT })
    return { cmd, passed: true }
  } catch (e) {
    // EXIT 3 IS `run-row.mjs` SAYING ITS ROW HAS NO SUBJECT ON THIS RUN: the
    // outbox row under verify-full's cron, which is not a session
    // (docs/CC-CMD-2026-10-17-verify-full-scheduled-outbox-row.md). Not a
    // failure of the unmutated tree, and not a pass either: every mutation
    // expecting it is reported below as not applicable, never as caught.
    if (e.status === 3) return { cmd, passed: false, notApplicable: true }
    // The tail, because a check's verdict is at the END of its output and the
    // head is setup noise.
    const text = `${e.stdout ?? ''}${e.stderr ?? ''}`.trimEnd()
    return { cmd, passed: false, status: e.status ?? null,
             tail: text.split("\n").slice(-30).join("\n") }
  }
}
// One turn of the loop after each: the baseline is the longest stretch of synchronous work in a run (every distinct expectation, once), and a plain kill is acted on only when the loop turns.
const baselineResults = []
for (const cmd of distinctExpects) {
  baselineResults.push(baselineOne(cmd))
  await tick()
}
const baselineMs = lapBaseline()
const notApplicableExpects = new Set(baselineResults.filter(r => r.notApplicable).map(r => r.cmd))
const baselineFailures = baselineResults.filter(r => !r.passed && !r.notApplicable).map(r => r.cmd)
const notApplicableMutations = selected.filter(m => notApplicableExpects.has(m.expect))
console.log(`  baseline: ran ${distinctExpects.length} of ${distinctExpects.length} `
  + `distinct expectation(s) from ${selected.length} mutation(s), `
  + `${baselineFailures.length} failing`
  + (notApplicableExpects.size ? `, ${notApplicableExpects.size} not applicable on this run `
      + `(${notApplicableMutations.length} mutation(s) not run: ${notApplicableMutations.map(m => m.id).join(', ')})` : ''))

// THE ARTIFACT, and it is the point of this block rather than a nicety.
//
// This number is computed on every run and has been unreadable twice. The
// detail below is printed into a log 1,300 lines deep inside a 50-minute job;
// on 2026-10-04 two verify-full runs reported `2 of 39` and `1 of 39` failing
// and NEITHER log tail reached the command list — three separate attempts to
// retrieve it failed, including running the expectations locally, where all 14
// runnable ones are ERR_MODULE_NOT_FOUND without the Fable build.
//
// A measurement that exists only in a truncated log is not a measurement
// anyone can act on. Written unconditionally, pass or fail, so a green run
// records the baseline it was green against.
//
// ONE CLOCK READ, CAPTURED. `row-confidence.mjs`'s nondeterminism scan permits a
// clock read only in the shape this repo settled on — captured once into a
// `const NAME = new Date()` and then pure — and the bare `new Date()` that used
// to sit in the object literal below is what dropped the row "breaking each
// invariant makes a check fail" from 100 to 70 on 2026-10-05. That is 901f00e,
// this block's own commit: the change that made the baseline readable broke the
// gate that scores the harness, and verify stayed red for four days on it.
const BASELINE_AT = new Date()

if (writesBaseline(ONLY, subsetIds)) {
  mkdirSync('outbox', { recursive: true })
  writeFileSync('outbox/mutation-baseline-latest.json', JSON.stringify({
    at: BASELINE_AT.toISOString(),
    scope: 'full',
    ran: distinctExpects.length,
    from_mutations: selected.length,
    failing: baselineFailures.length,
    notApplicable: [...notApplicableExpects],
    results: baselineResults,
  }, null, 2) + '\n')
  console.log('  wrote outbox/mutation-baseline-latest.json')
} else {
  console.log(`  baseline NOT written: ${ONLY ? `--only ${ONLY}` : (IDS ? '--ids' : `--shard ${SHARD}`)} covers ${distinctExpects.length} ` +
    `expectation(s) of the full suite, and the artifact is the full run's`)
}

check('the unmutated tree passes every expectation',
  baselineFailures.length === 0,
  `${baselineFailures.length} of ${distinctExpects.length} distinct expectation(s) ` +
  `already failing, so nothing below would mean anything ` +
  `(full output in outbox/mutation-baseline-latest.json):\n` +
  baselineFailures.map(c => `            $ ${c}`).join('\n'))

// --- the build driver, and a record per mutation --------------------------------------------------
//
// THE BUILD IS MADE CLEAN, AND ITS DIGEST CHECKED, BEFORE EVERY MUTATION. docs/CC-CMD-2026-11-03-gate-speed.md.
//
// Until 2026-11-03 only a mutation of `src/` or `index.html` rebuilt, and nothing rebuilt AFTER it: the file was restored and the compiled mutation stayed in
// build/ until the next source mutation overwrote it. 94 of the 94 mutations that do not rebuild (`scripts/`, `.github/`, the world ones) therefore ran on whatever
// the nearest earlier source mutation had left, so a script mutation could be "caught" by a leftover compiled one: the verdict depended on the table's ORDER, and a
// sharded run reorders it. A build made clean before every mutation fixes both, and it is also what makes the fast driver safe: a stale build between mutations
// can then only be a CLEAN build, so what it can produce is a mutation that survives (loud), never one caught by its predecessor (silent).
//
// The driver starts when the first source mutation needs it, not before: `--only known-survivor` (a docs mutation, no build) pays nothing, and the harness run
// that the `harness-blind` expectation launches inside a harness run never starts a second watcher on the same build/.
const records = []
const wall = stopwatch()
const fatal = msg => {
  console.log(`::error::${msg}`)
  process.exit(1)
}
/**
 * Run a mutation's expectation and give its verdict. TWO THINGS THE BARE `run()` DID NOT DO (measured 2026-11-05, real script, an expectation that sleeps):
 *   - A command ended by a signal is not a failed check. Ctrl-C reaches the expectation (it is in the terminal's process group) and `run()` read the death as "the check failed", so the
 *     mutation was reported CAUGHT: `PASS [known-survivor]`, exit status 0, for a mutation that survives by design. A killed expectation has given no answer, so the run stops
 *     (the exit handler puts the file back).
 *   - A signal that reaches THIS process while a synchronous command runs is queued until the event loop turns, and a mutation that is not a source file has nothing to await after its
 *     expectation: a SIGTERM was never acted on and the run went to its end (23 s later, its own verdict printed). One turn of the loop after each expectation acts on it.
 * Not fixed here: a SIGKILL of this process leaves the expectation's own children running (it needs a spawn with process groups, which `run()` being synchronous rules out).
 */
const expectation = async m => {
  const passed = run(expectOf(m))
  if (lastSignal) fatal(`[${m.id}] its expectation was ended by ${lastSignal}: a command that is killed has not failed, so the mutation is neither caught nor a survivor, and the run stops. The file and the state are put back as for any other exit.`)
  await tick()
  return passed
}
const startBuilder = async () => {
  if (builder) return
  if (process.env.MUTATION_BUILDER_ACTIVE) fatal('a harness run inside a harness run may not start a second build driver: two would write one build/')
  const existing = existsSync('build') ? digestDir('build', ['public/index.html']) : null
  builder = BUILD_MODE === 'full' ? new FullBuild({ fault: MUTATION_FAULT }) : new WatchBuild({ fault: MUTATION_FAULT, onRetry: retryNote('the build driver', 'starting'), onSpawn: recordDriver })
  try {
    const started = await builder.start(BUILD_MODE === 'watch' ? { expectDigest: existing } : {})
    console.log(`  build driver: ${BUILD_MODE}, ready in ${started.ms} ms, clean digest ${started.digest}`)
  } catch (e) {
    fatal(`the build driver did not start: ${e.message}`)
  }
  process.env.MUTATION_BUILDER_ACTIVE = '1'
}
const cleanBefore = what => {
  if (!builder) return
  try { builder.assertClean(what) } catch (e) { fatal(e.message) }
}
const retryNote = (id, what) => (n, errors) => console.log(`  RETRY [${id}] ${what}: the build failed (${String(errors?.[0] ?? '').replace(/\x1b\[[0-9;]*m/g, '').slice(0, 160)}); building again to see whether it fails the same way (${n})`)
const kindOf = m => (m.mutate ? 'world' : m.file.startsWith('src/') ? 'src' : m.file === 'index.html' ? 'html' : 'script')

for (const m of selected) {
  // Not run, and not counted as caught: the row this mutation would break is
  // not scored on this run at all. The count is printed with the baseline above.
  if (notApplicableExpects.has(m.expect)) {
    console.log(`  N/A   [${m.id}] ${m.claim} — \`${m.expect}\` is not applicable on this run`)
    records.push({ id: m.id, kind: kindOf(m), verdict: 'n/a', expect: m.expect })
    continue
  }
  // A WORLD mutation changes something outside the source — a file the check
  // reads, a workflow, an outbox entry. The outbox and history rows have their
  // logic inside gate-checks.mjs, so a source mutation there would be circular:
  // it would test the check by rewriting the check. Mutating what they MEASURE
  // is the honest version.
  if (m.mutate) {
    cleanBefore(`world mutation [${m.id}]`)
    // Marker first. A world mutation moves real files around — the outbox one
    // moves this session's write-ups aside — so being killed between
    // `mutate` and `restore` is the most expensive interruption here, not the
    // cheapest.
    //
    // The marker records WHERE the stash is and the tree before; the paths the mutation touched are added once it
    // has run. heal() restores only when every one of those paths is exactly as the mutation left it, and reads
    // them back afterwards; anything else in the tree is nobody's business. The stash lives in the state
    // directory, which a restart does not wipe, and from the moment the mutation is applied an exit undoes it
    // (see restore()) before the state goes.
    const stash = stashOf(m.id)
    claimState()
    mkdirSync(stash, { recursive: true })
    const before = treeSnapshot()
    const worldMarker = worldMarkerOf(m, stash, before)
    // (`killHere('world-prepared')` is test-only: it ends the run with the marker written and the stash made, before the mutation has moved anything.)
    writeFileSync(marker, JSON.stringify(worldMarker))
    worldApplied = { restore: m.restore, stash, before, touched: null }
    await killHere('world-prepared')

    // A WORLD MUTATION MUST PROVE IT APPLIED.
    //
    // Source mutations already do — `mutated === original` below fails as "the
    // mutation anchor still exists". World mutations had no equivalent, and the
    // gap is not theoretical: `history-boundary-moved` ran
    //
    //     sed -i 's/^e9bc4ca[0-9a-f]*  17/543a64d…  17/' docs/history-boundary.txt
    //
    // and on 2026-08-17 the boundary legitimately moved to `829f2ac … 18`. The
    // pattern then matched nothing, sed changed nothing, the check passed
    // unchanged, and this harness reported "mutation SURVIVED — nothing defends
    // this claim."
    //
    // That reading was WRONG in the most dangerous direction available to a
    // mutation harness. A mutation that cannot apply proves nothing about the
    // claim, and reporting it as an undefended invariant is a false alarm that
    // looks exactly like a true one — while the inverse, a mutation silently
    // no-oping and being counted as CAUGHT, is how a suite turns green while
    // proving nothing.
    //
    // The tree before and after is the general test, so it holds for
    // mutations that edit a file, move files aside, or overwrite them.
    run(m.mutate, { STASH: stash })
    // (`killHere('world-mutated')` is test-only: the mutation has run, and the marker does not yet say which paths it touched. A kill here leaves the stubs applied with a marker that has no
    // `touched`, which the next run refuses over and does not heal: after the kill nothing can tell the mutation's stubs from a person's edit of a path it touched.)
    await killHere('world-mutated')
    const touched = touchedBy(before, treeSnapshot())
    if (Object.keys(touched).length === 0) {
      run(m.restore, { STASH: stash })
      worldApplied = null
      clearActive()
      check(`[${m.id}] the mutation actually applies`, false,
        `\`${m.mutate.slice(0, 90)}${m.mutate.length > 90 ? '…' : ''}\` left the tree unchanged. ` +
        `Nothing was tested — this is a broken mutation, NOT an undefended claim.`)
      records.push({ id: m.id, kind: 'world', verdict: verdictOf({ anchorFound: true, applied: false }), expect: m.expect })
      continue
    }

    worldApplied.touched = touched
    const worldMarkerText = JSON.stringify({ ...worldMarker, touched })
    writeFileSync(marker, worldMarkerText)
    await killHere('world-applied')

    const lapWorld = stopwatch()
    const passed = await expectation(m)
    const worldMs = lapWorld()
    const worldIntact = stateIntact(worldMarkerText)
    // A restore that ran is not a restore that worked (`|| true` hides a missing stash), so what it touched is read back. If it is not as it
    // was, the stash is the only copy of what was moved aside: the state stays on disk through exit, and heal() will say so next run.
    if (!undoWorld()) {
      fatal(`[${m.id}] the restore did not return what the mutation touched to what it was. The exit handler tries it once more; unless that verifies, the state and the stash (${stash}) stay on disk — compare them with \`git status\`.`)
    }
    if (!worldIntact) fatal(`[${m.id}] its expectation deleted or changed this run's own state in ${stateDir}. The tree is as it was, but a kill during that expectation would have left nothing to heal from; look at what the mutation changes.`)
    clearActive()
    const caught = !passed
    check(`[${m.id}] ${m.claim}`, caught,
      `mutation SURVIVED — \`${m.expect}\` still passed. ` +
      `Nothing defends this claim.`)
    records.push({ id: m.id, kind: 'world', verdict: verdictOf({ anchorFound: true, built: true, survived: passed }), expect: m.expect, buildMs: 0, restoreMs: 0, expectMs: worldMs, digestChanged: null, cycles: 0 })
    continue
  }

  const original = readFileSync(m.file, 'utf8')
  const mutated = applyMutation(original, m)
  if (mutated === original) {
    check(`[${m.id}] the mutation anchor still exists`, false,
      `not found in ${m.file}: ${m.find.trim()}`)
    records.push({ id: m.id, file: m.file, kind: kindOf(m), verdict: verdictOf({ anchorFound: false }), expect: m.expect })
    continue
  }

  // Only source changes need recompiling. Mutating a workflow or a doc does
  // not, and rebuilding for those added a minute each for nothing.
  //
  // index.html counts as source: `build-site.mjs` COPIES it into public/, so a
  // mutation to the stylesheet there is invisible to any browser check until the
  // site is reassembled. Without this the CSS mutation below would survive for a
  // reason that has nothing to do with the claim.
  const needsRebuild = m.file.startsWith('src/') || m.file === 'index.html'
  const html = m.file === 'index.html'
  if (needsRebuild) await startBuilder()
  cleanBefore(`[${m.id}]`)

  // Backup and marker land BEFORE the file is touched. The window this closes
  // is the one that actually opened today: the process died holding a mutated
  // file with its only backup in a tmpdir that died with it.
  //
  // The marker records what the file is before and what the mutation makes it, so heal() can tell a file still holding this
  // mutation from one that has moved on, and a restore that happened from one that did not.
  //
  // The build is dirty from the moment the mutation can reach it. (Test-only: `build-never-verified` marks a mutation that does not rebuild the same way, so a docs
  // mutation killed by an exception stands in for a source one, which would need the Fable build.)
  //
  // `killHere('source-prepared')` is test-only: it ends the run with the marker and backup written and the file NOT yet touched, which is the order these writes exist to
  // guarantee. Nothing else sat between the writes and the mutation, so no kill hook could see that order.
  claimState()
  const backupPath = join(stateDir, backupName(m.file))
  writeFileSync(backupPath, original)
  const reachesBuild = needsRebuild || MUTATION_FAULT === 'build-never-verified'
  const markerText = JSON.stringify(sourceMarker(m, backupPath, original, mutated, reachesBuild))
  writeFileSync(marker, markerText)
  backups.set(m.file, backupPath)
  buildDirty = reachesBuild
  await killHere('source-prepared')

  let res = null
  try {
    // The write happens INSIDE compile(): the cycle count is read before it, so the compile waited for is the one this write caused.
    if (needsRebuild) res = await compileSteadily(builder, () => writeFileSync(m.file, mutated), { label: `[${m.id}]`, noCycle: html }, retryNote(m.id, 'applying'))
    else writeFileSync(m.file, mutated)
    await killHere('source-applied')
  } catch (e) {
    fatal(`[${m.id}] ${e.message}`)
  }
  const built = needsRebuild ? res.ok : true
  // A crash of the compiler is neither a refusal (a free pass) nor a build: the expectation is not run, and the mutation is reported as a fault of the build.
  const crashed = needsRebuild && res.crashed
  // No inversion flag. A row that passes when its command fails already encodes
  // that itself — `run-row.mjs` reports the ROW's verdict, and a shell `!` wraps
  // anything else. An `inverted` option existed here briefly and was removed
  // unused: a branch nothing exercises is precisely what this harness is for.
  const lapExpect = stopwatch()
  const survived = built && await expectation(m)
  const expectMs = lapExpect()
  const intactAfterExpect = stateIntact(markerText)

  // A WATCH SURVIVOR IS NOT FINAL until the full compiler has seen the same source (confirmFullCompile): watch re-checks the file that changed, not the files
  // after it, so a mutation that breaks only a later file builds and survives here and is refused by the full compile. The source is still mutated at this point.
  let confirmed = null
  if (BUILD_MODE === 'watch' && survived && needsRebuild && !html) {
    const confirmDir = join(tmpdir(), 'mutation-confirm-build')
    confirmed = confirmFullCompile(confirmDir)
    rmSync(confirmDir, { recursive: true, force: true })
  }

  // The file goes back, and for a source mutation so does the BUILD: restored, compiled, and its digest compared to the clean one before the marker is
  // cleared. Killed in between, the marker is still there and the next run heals both.
  let back = null
  try {
    if (needsRebuild) back = await compileSteadily(builder, () => writeFileSync(m.file, original), { restore: true, label: `restoring [${m.id}]`, noCycle: html }, retryNote(m.id, 'restoring'))
    else writeFileSync(m.file, original)
  } catch (e) {
    fatal(`restoring [${m.id}]: ${e.message}`)
  }
  // A restore that did not BUILD is a different failure from one that built something other than the clean tree, and the driver knows which: say so.
  if (back && !back.ok) fatal(`restoring [${m.id}]: the restore build failed: ${back.errors.join(' | ')}`)
  cleanBefore(`the restore of [${m.id}] was verified`)
  backups.delete(m.file)
  buildDirty = false
  // The file is back (from memory, not from the backup that may be gone); only now say the state was not.
  if (!intactAfterExpect) fatal(`[${m.id}] its expectation deleted or changed this run's own state in ${stateDir}. ${m.file} is restored, but a kill during that expectation would have left nothing to heal from; look at what the mutation changes.`)
  clearActive()

  const refusedOnConfirm = Boolean(confirmed?.refused)
  const faulted = crashed || Boolean(confirmed?.fault)
  if (faulted) {
    check(`[${m.id}] the build did not fail without a compiler diagnostic`, false,
      `the build of ${m.file} failed ${crashed ? `${res.retries + 1} time(s) in a row` : 'when the full compile confirmed the survivor'} with no diagnostic about the code. That is a fault of the build and says nothing about the claim: ` +
      `the mutation was neither refused nor tested.\n            ${(crashed ? (res.errors ?? []) : [confirmed.why]).slice(0, 2).map(e => String(e).slice(0, 300)).join('\n            ')}`)
  } else if (!built || refusedOnConfirm) {
    // The compiler refusing the mutation is a stronger result than a check
    // catching it — the invariant is enforced by the type system.
    check(`[${m.id}] ${m.claim}`, true, '')
    console.log(`      → defended by the COMPILER (the mutation does not build)`)
    // What the compiler said, so "refused by the type system" is a quotation and not a verdict taken on trust.
    if (refusedOnConfirm) console.log(`        (built under watch, which does not re-check later files; refused by the full compile)`)
    for (const line of (refusedOnConfirm ? [confirmed.why] : (res?.errors ?? [])).slice(0, 3)) console.log(`        ${String(line).slice(0, 600)}`)
  } else {
    check(`[${m.id}] ${m.claim}`, !survived,
      `mutation SURVIVED — ${m.file} was broken and \`${m.expect}\` still passed. ` +
      `Nothing defends this claim.`)
  }
  records.push({
    id: m.id, file: m.file, kind: kindOf(m), verdict: verdictOf({ anchorFound: true, built: built && !refusedOnConfirm, survived: survived && !refusedOnConfirm, crashed: faulted }), expect: m.expect,
    buildMs: res?.ms ?? 0, restoreMs: back?.ms ?? 0, expectMs, digestChanged: res ? res.digest !== builder.cleanDigest : null, cycles: res?.cycles ?? 0,
    // The compiled digest itself, not only whether it moved: `mutation-compare.mjs` needs the two drivers' digests of the SAME mutation to be equal, and a boolean cannot say that.
    digest: res?.digest ?? null,
    // Only for a mutation the compiler refused: the first lines it said.
    ...(built && !refusedOnConfirm ? {} : { errors: (refusedOnConfirm ? [confirmed.why] : (res?.errors ?? [])).slice(0, 8).map(e => String(e).slice(0, 1200)) }),
    ...(confirmed ? { confirmedByFullCompile: refusedOnConfirm ? 'refused' : confirmed.fault ? 'fault' : 'built' } : {}),
    // How many times a build of this mutation had to be repeated because the compiler crashed (see compileSteadily): the flake, measured.
    crashRetries: (res?.retries ?? 0) + (back?.retries ?? 0),
  })
}

// Leave the tree as it was found, whatever happened above. Nothing was rebuilt unless a driver started, and one that did has verified a clean build after
// every restore, so the old closing `npm run build` is redundant: its work is checked instead of repeated.
restore()
if (builder) {
  try { builder.assertClean('the end of the run') } catch (e) { check('the build is clean at the end of the run', false, e.message) }
  stopBuilder()
}

// A harness run an expectation started inside this one keeps its state in `nested`, and the clear above leaves it there on purpose: the next run heals it (healHeld looks there first). That is
// the right place for a mutation a killed child left applied and the wrong whole answer. The run that owns the child used to end green over it (measured 2026-11-05: `outbox-stub` caught, 2 of 2
// checks passed, exit 0, docs/gate-rows.txt left mutated, and only the self-test and `--anchors` said anything, the second of them blaming the table), while every entry and gate row after
// the kill had read that file. So this run FAILS, naming the child and the command that heals it. It does not heal it: a child that was killed is something a person should hear, and a
// heal here would repair the tree under verdicts already printed. (After the restore above, so the run's own files are back before it says so.)
const strandedChild = join(stateDir, 'nested', 'active.json')
if (existsSync(strandedChild)) {
  let child = null
  try { child = JSON.parse(readFileSync(strandedChild, 'utf8')) } catch { child = null }
  check('no harness run started inside this one was killed with its mutation still applied', false,
    `${strandedChild} is a mutation a harness run started inside this one left applied ([${child?.id ?? 'unknown'}] on ${child?.file ?? 'the tree'}): that run was killed, and a kill runs no handler. This run did not undo it, and every entry and gate row after the kill read a tree that holds it. Heal it: node scripts/mutation-check.mjs --heal`)
}

if (OUT) {
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify({
    at: BASELINE_AT.toISOString(),
    sha: capture('git rev-parse HEAD').trim(),
    mode: BUILD_MODE,
    shard: SHARD,
    ids: selected.map(m => m.id),
    tableSize: eligible.length,
    cleanDigest: builder?.cleanDigest ?? null,
    baseline: { ran: distinctExpects.length, failing: baselineFailures.length, notApplicable: [...notApplicableExpects], results: baselineResults },
    // The baseline is part of the shard's wall time: it runs every distinct expectation once, unmutated, and for the shard that holds the proof row that was 13 minutes the loop below never sees, until the proof checks became one batched compile (2026-11-03, docs/GATE-TIMING.md).
    baselineMs,
    wallMs: baselineMs + wall(),
    records,
  }, null, 1) + '\n')
  console.log(`  wrote ${OUT}: ${records.length} record(s), ${records.filter(r => r.verdict === 'survived').length} survived`)
}

finish(summarize())
