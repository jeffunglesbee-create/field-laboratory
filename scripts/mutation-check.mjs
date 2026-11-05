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
    id: 'world-refusal-offers-the-restore-command',
    file: 'scripts/mutation-check.mjs',
    claim: "the refusal for an edited path does not hand over the command that overwrites it",
    find: "its restore command would overwrite the ones listed.`)",
    replace: "its restore command would overwrite the ones listed. To undo it by hand: STASH=${m.stash} sh -c '${m.restoreCmd}'.`)",
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
    id: 'refusal-forgets-to-count-the-rest',
    file: 'scripts/mutation-check.mjs',
    claim: "a refusal over many touched paths says how many it left out of the list",
    find: "${ks.slice(0, 6).join(', ')}${ks.length > 6 ? `, and ${ks.length - 6} more` : ''}",
    replace: "${ks.slice(0, 6).join(', ')}",
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
    find: "    lastSignal = e.signal ?? (e.status > 128 && e.status < 160 ? `status ${e.status}` : null)",
    replace: "    lastSignal = null",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'killed-child-status-is-a-verdict',
    file: 'scripts/mutation-check.mjs',
    claim: "a child killed under `sh -c`, which the shell reports as a status above 128 and not as a signal, is a killed command too",
    find: "lastSignal = e.signal ?? (e.status > 128 && e.status < 160 ? `status ${e.status}` : null)",
    replace: "lastSignal = e.signal ?? null",
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
    id: 'world-mutated-hook-dropped',
    file: 'scripts/mutation-check.mjs',
    claim: "a run can be killed after a world mutation has run and before its marker names the paths it touched, so what the next run does with that state is tested",
    find: "    await killHere('world-mutated')\n",
    replace: "",
    expect: 'node scripts/mutation-check.mjs --self-test',
  },
  {
    id: 'crash-leaves-the-self-test-directories',
    file: 'scripts/mutation-check.mjs',
    claim: "a self-test that crashes removes the two temp directories it made, so a crash does not accumulate them in the temp directory",
    find: "  process.on('exit', () => { rmSync(scratch, { recursive: true, force: true }); rmSync(stateDir, { recursive: true, force: true }) })\n",
    replace: "",
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
    find: "['active.json', 'run.json', 'driver.json', 'nested', 'world'].includes(h))) {",
    replace: "[].includes(h))) {",
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
    claim: "a test-only catchable signal is handled where it was sent, not after the run has finished",
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
    find: "Heal it first: node scripts/mutation-check.mjs --heal`)\n  }",
    replace: "Heal it first: node scripts/mutation-check.mjs --heal`)\n    if (!process.env.MUTATION_STATE_DIR) healHeld(real, { rebuild: false })\n  }",
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
    file: 'scripts/row-confidence.mjs',
    claim: "a clock read in a line comment is not a clock read",
    find: "      if (c === '/' && d === '/') { while (i < n && src[i] !== '\\n') i++; continue }",
    replace: "      if (false) { while (i < n && src[i] !== '\\n') i++; continue }",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-keeps-block-comments',
    file: 'scripts/row-confidence.mjs',
    claim: "a clock read in a block comment is not a clock read",
    find: "      if (c === '/' && d === '*') { const end = src.indexOf('*/', i + 2); i = end < 0 ? n : end + 2; out += ' '; continue }",
    replace: "      if (false) { const end = src.indexOf('*/', i + 2); i = end < 0 ? n : end + 2; out += ' '; continue }",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-lets-a-quote-run-on',
    file: 'scripts/row-confidence.mjs',
    claim: "an unclosed quote ends at its line",
    find: "        while (i < n && src[i] !== c && src[i] !== '\\n') i += src[i] === '\\\\' ? 2 : 1",
    replace: "        while (i < n && src[i] !== c) i += src[i] === '\\\\' ? 2 : 1",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-ignores-string-escapes',
    file: 'scripts/row-confidence.mjs',
    claim: "an escaped quote does not end a string",
    find: "i += src[i] === '\\\\' ? 2 : 1",
    replace: "i += 1",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-reads-every-slash-as-division',
    file: 'scripts/row-confidence.mjs',
    claim: "a regular expression literal is not read as division",
    find: "        if (!regexAllowed()) { out += '/'; i++; continue }",
    replace: "        if (true) { out += '/'; i++; continue }",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-reads-every-slash-as-a-regex',
    file: 'scripts/row-confidence.mjs',
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
    file: 'scripts/row-confidence.mjs',
    claim: "a regular expression's flags go with it",
    find: "        while (i < n && /[a-z]/.test(src[i])) i++\n",
    replace: "",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-ignores-regex-escapes',
    file: 'scripts/row-confidence.mjs',
    claim: "an escaped slash does not end a regular expression",
    find: "          if (r === '\\\\') { i += 2; continue }",
    replace: "          if (false) { i += 2; continue }",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-regex-runs-past-its-line',
    file: 'scripts/row-confidence.mjs',
    claim: "an unterminated regular expression ends at its line",
    find: "        while (i < n && src[i] !== '\\n') {\n          const r = src[i]",
    replace: "        while (i < n) {\n          const r = src[i]",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-start-of-text-divides',
    file: 'scripts/row-confidence.mjs',
    claim: "a slash at the very start of the text begins a regular expression",
    find: "    if (tail === '') return true",
    replace: "    if (tail === '') return false",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-forgets-a-punctuation-mark',
    file: 'scripts/row-confidence.mjs',
    claim: "a slash after any operator or opening bracket begins a regular expression",
    find: "'(,=:[!&|?{};+-*%<>~^'.includes(tail[tail.length - 1])",
    replace: "'(,=:[!&|?{};+-*%<>~'.includes(tail[tail.length - 1])",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-forgets-a-keyword',
    file: 'scripts/row-confidence.mjs',
    claim: "a slash after any of its keywords begins a regular expression",
    find: "'do', 'yield', 'await'])\n  const n",
    replace: "'do', 'yield'])\n  const n",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-line-comment-eats-the-newline',
    file: 'scripts/row-confidence.mjs',
    claim: "a line comment ends at its newline and leaves it",
    find: "if (c === '/' && d === '/') { while (i < n && src[i] !== '\\n') i++; continue }",
    replace: "if (c === '/' && d === '/') { while (i < n && src[i] !== '\\n') i++; i++; continue }",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-block-comment-ends-on-its-opener',
    file: 'scripts/row-confidence.mjs',
    claim: "a block comment cannot end on the slash that opened it",
    find: "src.indexOf('*/', i + 2)",
    replace: "src.indexOf('*/', i + 1)",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-comment-after-an-operator',
    file: 'scripts/row-confidence.mjs',
    claim: "a comment where a regular expression could begin is still a comment",
    find: "      if (c === '/' && d === '/') {",
    replace: "      if (c === '/' && d === '/' && regexAllowed() === false) {",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-regex-leaves-no-marker',
    file: 'scripts/row-confidence.mjs',
    claim: "a regular expression leaves a marker where it was",
    find: "        out += '0'\n",
    replace: "        out += ''\n",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-template-leaves-no-marker',
    file: 'scripts/row-confidence.mjs',
    claim: "a template leaves a marker where it was",
    find: "if (c === '`') { i = skipTemplate(i + 1); out += \"''\"; continue }",
    replace: "if (c === '`') { i = skipTemplate(i + 1); continue }",
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
    file: 'scripts/row-confidence.mjs',
    claim: "a slash after `return` begins a regular expression",
    find: "    return found !== null && REGEX_AFTER.has(found[1]) && !isPropertyDot(text.slice(0, found.index).trimEnd())",
    replace: "    return false",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-divides-nothing-after-an-increment',
    file: 'scripts/row-confidence.mjs',
    claim: "a slash after a postfix `++` divides",
    find: "    if (/(\\+\\+|--)$/.test(tail)) {",
    replace: "    if (false) {",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-increment-anchor-dropped',
    file: 'scripts/row-confidence.mjs',
    claim: "only a `++` at the very end of the window makes the slash a division",
    find: "    if (/(\\+\\+|--)$/.test(tail)) {",
    replace: "    if (/(\\+\\+|--)/.test(tail)) {",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-increment-after-a-bracket',
    file: 'scripts/row-confidence.mjs',
    claim: "a slash after `a[0]++` divides",
    find: "/[\\w$)\\]]$/.test(operand)",
    replace: "/[\\w$)]$/.test(operand)",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-increment-after-a-paren',
    file: 'scripts/row-confidence.mjs',
    claim: "a slash after `(a)++` divides",
    find: "/[\\w$)\\]]$/.test(operand)",
    replace: "/[\\w$\\]]$/.test(operand)",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-increment-after-a-space',
    file: 'scripts/row-confidence.mjs',
    claim: "a slash after `n ++` divides",
    find: "const operand = before.trimEnd()",
    replace: "const operand = before",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-increment-crosses-a-line',
    file: 'scripts/row-confidence.mjs',
    claim: "a `++` that starts its statement is a prefix, and a slash after it begins a regular expression",
    find: " && !before.slice(operand.length).includes('\\n')",
    replace: "",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-increment-after-a-keyword',
    file: 'scripts/row-confidence.mjs',
    claim: "a `++` after a keyword is a prefix",
    find: " && !endsInKeyword(operand)) return false",
    replace: ") return false",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-dot-anywhere',
    file: 'scripts/row-confidence.mjs',
    claim: "a keyword is a property only when the dot is right before it",
    find: "before.endsWith('.') && !before.endsWith('...') && !/(?<![\\w$.])\\d+\\.$/.test(before)",
    replace: "before.includes('.')",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-reads-a-keyword-property-as-a-keyword',
    file: 'scripts/row-confidence.mjs',
    claim: "a property spelled like a keyword is not the keyword",
    find: " && !isPropertyDot(text.slice(0, found.index).trimEnd())",
    replace: "",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-spread-is-a-property',
    file: 'scripts/row-confidence.mjs',
    claim: "a keyword after a spread is a keyword",
    find: " && !before.endsWith('...')",
    replace: "",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-number-dot-is-a-property',
    file: 'scripts/row-confidence.mjs',
    claim: "a number's decimal point is not a property access",
    find: " && !/(?<![\\w$.])\\d+\\.$/.test(before)",
    replace: "",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-property-dot-not-trimmed',
    file: 'scripts/row-confidence.mjs',
    claim: "a dot before a space and a keyword is still a property access",
    find: "text.slice(0, found.index).trimEnd()",
    replace: "text.slice(0, found.index)",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-whitespace-window-is-the-start',
    file: 'scripts/row-confidence.mjs',
    claim: "a slash after a long run of spaces is judged by what came before them",
    find: "    if (tail === '' && out.length > raw.length) tail = out.trimEnd().slice(-64)\n",
    replace: "",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-forgets-to-trim-the-tail',
    file: 'scripts/row-confidence.mjs',
    claim: "a slash after a keyword and a space begins a regular expression",
    find: "    let tail = raw.trimEnd()",
    replace: "    let tail = raw",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-looks-back-too-little',
    file: 'scripts/row-confidence.mjs',
    claim: "the scan looks back far enough to reach a keyword through spaces",
    find: "    const raw = out.slice(-64)",
    replace: "    const raw = out.slice(-8)",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-looks-back-one-character',
    file: 'scripts/row-confidence.mjs',
    claim: "the scan looks at more than the last character",
    find: "    const raw = out.slice(-64)",
    replace: "    const raw = out.slice(-1)",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-looks-back-twenty',
    file: 'scripts/row-confidence.mjs',
    claim: "the scan reaches a dot further back than twenty characters",
    find: "    const raw = out.slice(-64)",
    replace: "    const raw = out.slice(-20)",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-captures-fieldday-nospace',
    file: 'scripts/row-confidence.mjs',
    claim: "a capture may have whitespace before the call parentheses",
    find: "(new\\s+Date\\s*\\(\\s*\\)|fieldDay\\s*\\(\\s*\\)|fieldToday",
    replace: "(new\\s+Date\\s*\\(\\s*\\)|fieldDay\\(\\s*\\)|fieldToday",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-captures-newdate-single-space',
    file: 'scripts/row-confidence.mjs',
    claim: "a capture may have any whitespace between new and Date",
    find: "(new\\s+Date\\s*\\(\\s*\\)|fieldDay\\s*\\(\\s*\\)|fieldToday",
    replace: "(new Date\\s*\\(\\s*\\)|fieldDay\\s*\\(\\s*\\)|fieldToday",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-captures-greedy',
    file: 'scripts/row-confidence.mjs',
    claim: "two captures on one line are two captures",
    find: "[^\\n])*?(new\\s+Date",
    replace: "[^\\n])*(new\\s+Date",
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
    find: "|\\)\\s*\\{|;)[^\\n])*?",
    replace: "|;)[^\\n])*?",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'cap-allows-a-statement-end',
    file: 'scripts/row-confidence.mjs',
    claim: "a clock read in the statement after a constant is not a capture of that constant",
    find: "|\\)\\s*\\{|;)[^\\n])*?",
    replace: "|\\)\\s*\\{)[^\\n])*?",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-forgets-date-now',
    file: 'scripts/row-confidence.mjs',
    claim: "Date.now() is a clock read",
    find: "Date\\s*\\.\\s*now\\s*\\(\\s*\\)|new\\s+Date",
    replace: "new\\s+Date",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-now-without-whitespace',
    file: 'scripts/row-confidence.mjs',
    claim: "Date.now( ) is a clock read",
    find: "Date\\s*\\.\\s*now\\s*\\(\\s*\\)|new\\s+Date",
    replace: "Date\\.now\\(\\)|new\\s+Date",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-reads-newdate-single-space',
    file: 'scripts/row-confidence.mjs',
    claim: "new  Date() is a clock read",
    find: "|new\\s+Date\\s*\\(\\s*\\)|fieldDay\\s*\\(\\s*\\)|fieldToday\\s*\\(\\s*\\)/g) ?? []",
    replace: "|new Date\\s*\\(\\s*\\)|fieldDay\\s*\\(\\s*\\)|fieldToday\\s*\\(\\s*\\)/g) ?? []",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-forgets-field-today',
    file: 'scripts/row-confidence.mjs',
    claim: "fieldToday() is a clock read",
    find: "|fieldDay\\s*\\(\\s*\\)|fieldToday\\s*\\(\\s*\\)/g) ?? []\n  return",
    replace: "|fieldDay\\s*\\(\\s*\\)/g) ?? []\n  return",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-forgets-field-day',
    file: 'scripts/row-confidence.mjs',
    claim: "fieldDay() is a clock read",
    find: "|new\\s+Date\\s*\\(\\s*\\)|fieldDay\\s*\\(\\s*\\)|fieldToday\\s*\\(\\s*\\)/g) ?? []",
    replace: "|new\\s+Date\\s*\\(\\s*\\)|fieldToday\\s*\\(\\s*\\)/g) ?? []",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-ends-a-regex-class-at-a-slash',
    file: 'scripts/row-confidence.mjs',
    claim: "a slash inside a regular expression's character class does not end it",
    find: "          else if (r === '/' && !inClass) break",
    replace: "          else if (r === '/') break",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-skips-no-template-expressions',
    file: 'scripts/row-confidence.mjs',
    claim: "a template literal's expressions are scanned for where they end",
    find: "      if (c === '$' && src[i + 1] === '{') {",
    replace: "      if (false) {",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-forgets-template-braces',
    file: 'scripts/row-confidence.mjs',
    claim: "braces inside a template expression are counted",
    find: "        if (c === '{') depth++",
    replace: "        if (c === '{') depth += 0",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'row-scan-ignores-template-escapes',
    file: 'scripts/row-confidence.mjs',
    claim: "an escaped backtick does not end a template",
    find: "      if (c === '\\\\') { i += 2; continue }",
    replace: "      if (false) { i += 2; continue }",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  // Template expressions are code (2026-11-05). The scan keeps each `${...}` of a template as an operand in parentheses and still hides the template text, so a clock read inside a template is
  // counted and the first slash in one begins a regular expression whatever stood before the template. One entry per half of what it emits, and one for putting the old behaviour back.
  {
    id: 'tpl-expression-hidden',
    file: 'scripts/row-confidence.mjs',
    claim: "a clock read inside a template expression is counted, as a read in any other code is",
    find: "        out += ' ('\n        i = scanCode(i + 2, true)\n        out += ') '\n",
    replace: "        const kept = out\n        i = scanCode(i + 2, true)\n        out = kept\n",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'tpl-expression-opens-no-operand',
    file: 'scripts/row-confidence.mjs',
    claim: "a slash that begins a template expression begins a regular expression, whatever stood before the template (a tag, a parenthesis, a bracket, a word)",
    find: "        out += ' ('\n",
    replace: "        out += ' '\n",
    expect: 'node scripts/row-confidence.mjs --self-test',
  },
  {
    id: 'tpl-expression-closes-nothing',
    file: 'scripts/row-confidence.mjs',
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
    find: "  if ((!targetStranded && !anchored) ||",
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
    find: '  registryInjected: probeOnRegistry(currentRegistry),',
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
    find: "      if (probeOnRegistry(currentRegistry)) strays.push(REGISTRY)",
    replace: "      if (false) strays.push(REGISTRY)",
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
    find: "Run this again once it has finished.`)\n  process.exit(1)",
    replace: "Run this again once it has finished.`)",
    expect: "node scripts/proof-check.mjs --self-test",
  },
  // A torn file is asked about per file, and before the heal (2026-11-05, residual Task 6): the target had an anchor input and the registry had none.
  {
    id: 'proof-heal-ignores-a-torn-registry',
    file: "scripts/proof-check.mjs",
    claim: "a registry with no last case, which may be torn, is not called clean or healed over, whatever the target holds",
    find: "|| (!registryStranded && !registryAnchored)) return 'diverged'",
    replace: "|| (false)) return 'diverged'",
    expect: "node scripts/proof-check.mjs --self-test",
  },
  {
    id: 'proof-torn-file-checked-after-the-heal',
    file: "scripts/proof-check.mjs",
    claim: "a torn file is found before the heal, so a stranded file beside it cannot delete the state that holds the only whole copy",
    find: "  if ((!targetStranded && !anchored) || (!registryStranded && !registryAnchored)) return 'diverged'\n  if (targetStranded || registryStranded) return 'heal'\n",
    replace: "  if (targetStranded || registryStranded) return 'heal'\n  if ((!targetStranded && !anchored) || (!registryStranded && !registryAnchored)) return 'diverged'\n",
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
  // A restore writes only over what is provably the run's own (2026-11-05, residual Task 4 and 10.17a): a file someone else changed during the run is left as found.
  {
    id: 'proof-restore-writes-whatever-is-on-disk',
    file: "scripts/proof-check.mjs",
    claim: "a restore writes only a file that is the original or a prefix of what the run last wrote, and leaves anything else as it found it",
    find: "    if (!ours(now, original, attempted.get(file))) return (file === TARGET ? now.includes(MARKER) : probeOnRegistry(now)) ? 'carrying' : 'foreign'\n",
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
    find: "(file === TARGET ? now.includes(MARKER) : probeOnRegistry(now))",
    replace: "(file === TARGET ? false : probeOnRegistry(now))",
    expect: "node scripts/proof-check.mjs --self-test",
  },
  {
    id: 'proof-restore-never-sees-a-carried-probe',
    file: "scripts/proof-check.mjs",
    claim: "a changed registry that still carries the run's probe case is told from one that carries none",
    find: "(file === TARGET ? now.includes(MARKER) : probeOnRegistry(now))",
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
const applyMutation = (source, m) => {
  const guard = guardOf(source, m)
  return source.slice(0, guard) + source.slice(guard).replace(m.find, m.replace)
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
  // A signal this process catches is not handled where it is sent: Node runs the handler when the event loop turns, and a run with no `await` in its path (a docs mutation)
  // would otherwise finish the mutation, restore and exit before the handler ever ran, which no clause could tell from a handler that was never installed. SIGKILL needs no turn.
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
  // ...or writes a file nobody asked for (another session, a build), which a world mutation must not mistake for a failed restore.
  if (process.env.MUTATION_FAULT === 'expect-writes-unrelated') return `date +%s%N > unrelated-during-window.txt && ${m.expect}`
  // ...or is ended by a signal (a Ctrl-C reaching it, a crash, the OOM killer), or sends this run a SIGTERM while it works and then passes.
  if (process.env.MUTATION_FAULT === 'expect-interrupted') return 'kill -INT $$'
  if (process.env.MUTATION_FAULT === 'expect-terms-the-run') return 'kill -TERM $PPID && sleep 0.3'
  if (process.env.MUTATION_FAULT === 'expect-child-killed') return 'sleep 5 & kill -KILL $!; wait $!'
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
// The signal that ended the last command, or null if it ended by itself (a check that fails exits non-zero: that is its answer; one that is killed has given none). `sh -c a && b` reports
// a killed `b` as exit status 128 plus the signal, so a status in that range counts too (the OOM killer and a browser crash both look like this).
let lastSignal = null
const OUTPUT_LIMIT = 256 * 1024 * 1024
const run = (cmd, extra) => {
  lastSignal = null
  try {
    execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', env: childEnv(extra), maxBuffer: OUTPUT_LIMIT })
    return true
  } catch (e) {
    lastSignal = e.signal ?? (e.status > 128 && e.status < 160 ? `status ${e.status}` : null)
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
  const stop = (text, clears = true) => {
    const how = !clears ? '' : stashHeld()
      ? ` What a world mutation moved aside is in ${join(dir, 'world')}: put it back first, because deleting ${dir} deletes the only copy.`
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
      return stop(`names [${m.id}], a change made outside the source: ${parts.join('; and ')}. Nothing was run. ${atHead.length ? `Compare ${atHead.length === 1 ? 'the one that matches HEAD' : 'each that matches HEAD'} with ${m.stash} to tell which it is. ` : ''}Put back from ${m.stash} only the paths that are still as the mutation left them; its restore command would overwrite the ones listed.`)
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
    let stranded = null
    try { stranded = JSON.parse(readFileSync(join(real, 'active.json'), 'utf8')) } catch { stranded = null }
    if (stranded !== null) console.log(`::warning::${join(real, 'active.json')} is a mutation a killed run left applied ([${stranded.id ?? 'unknown'}] on ${stranded.file ?? 'the tree'}). This self-test does not touch it, and clauses below may fail because of it. Heal it first: node scripts/mutation-check.mjs --heal`)
  }

  // Every scenario below runs the real planHeal() and healAt() in a temp directory of its own, with the process check, the tree snapshot
  // and the commands replaced by fakes where a scenario needs them: nothing reads the working tree, writes outside tmp, or builds.
  // The last group starts the REAL script in a scratch git repository and ends it in the ways a handler cannot catch.
  const scratch = mkdtempSync(join(tmpdir(), 'heal-selftest-'))
  // A crash ends in the uncaughtException handler's process.exit, and exit runs this: the two directories this self-test made (this one and its state directory, a mkdtemp of its own
  // above) do not outlive it. A normal end removes them already, at the end of the file's own cleanup; removing twice with `force` is harmless. Not in restore(): the self-test
  // calls that itself, part-way, and would lose its scratch. (A SIGKILL cannot be covered.)
  process.on('exit', () => { rmSync(scratch, { recursive: true, force: true }); rmSync(stateDir, { recursive: true, force: true }) })
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
  const wSixRun = editedRun(6)
  check('THE REFUSAL NAMES SIX PATHS AND COUNTS THE REST: of 8 edited paths it lists the first six and "and 2 more" and not the seventh; of exactly 6 it lists the six and no count',
    wEightRun.code === 1 && wEightRun.said.includes(`(${SIX}, and 2 more)`) && !wEightRun.said.includes('out/p6.md') && wSixRun.code === 1 && wSixRun.said.includes(`(${SIX})`) && !/and \d+ more/.test(wSixRun.said),
    `8 paths: ${wEightRun.said.slice(0, 260)} / 6 paths: ${wSixRun.said.slice(0, 260)}`)
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

  // A refusal over a non-empty stash must not tell a person to delete the directory the stash is in: an untracked write-up that was moved aside is not in `git status`.
  const wStashed = worldCase({})
  writeFileSync(join(wStashed.state, 'active.json'), '{not json')
  mkdirSync(join(wStashed.state, 'world', 'x'), { recursive: true })
  writeFileSync(join(wStashed.state, 'world', 'x', 'cc-session.md'), 'the only copy\n')
  const wStashedRun = attempt(wStashed.state)
  check('A REFUSAL OVER A STASH THAT HOLDS FILES DOES NOT SAY TO DELETE THE DIRECTORY: it says the originals are in the stash and to put them back first',
    stoppedFor(wStashedRun, /put it back first/) && !/delete .* to clear this/.test(wStashedRun.said) && existsSync(join(wStashed.state, 'world', 'x', 'cc-session.md')),
    wStashedRun.said)
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
    const clean = { MUTATION_STATE_DIR: '', MUTATION_SELFTEST_CHILD: '', MUTATION_KILL_AT: '', MUTATION_KILL_SIGNAL: '', MUTATION_FAULT: '', MUTATION_REEXEC: '' }

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
    // Anything else asked of `date` (the `expect-writes-unrelated` fault asks for `+%s%N`) is the real one's: the stand-in drops its own directory from PATH and runs it.
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
    const hd = go(['--only', 'known-survivor'])
    check('E14: ...and the next run reads "already undone", rebuilds, and drops it',
      /Nothing to heal/.test(text(hd)) && buildsRun() === 1 && !existsSync(join(repo, '.mutation-state')), `${text(hd).split('\n').filter(l => /Nothing to heal|HEALED|::error::/.test(l)).join(' | ').slice(0, 200)}; builds ${buildsRun()}`)

    // E15: a file nobody asked for, written while a world mutation is applied, is not "the restore failed".
    reset()
    const ku = go(['--only', 'outbox-stub'], { MUTATION_FAULT: 'expect-writes-unrelated' })
    // The fault writes `date +%s%N`. A `date` that did not run (the stand-in above exits 2 if it does not pass this question through) still leaves the file, empty: the redirect creates it.
    const unrelatedStamp = read(join(repo, 'unrelated-during-window.txt')).trim()
    check('E15: AN UNRELATED FILE WRITTEN WHILE A WORLD MUTATION IS APPLIED DOES NOT ABORT A HEALTHY RUN: the write-ups are back, the state is gone, and no restore failure is reported',
      writeUpsBack() && /^\d{10,}$/.test(unrelatedStamp) && !existsSync(join(repo, '.mutation-state')) && !/did not return what the mutation touched/.test(text(ku)) && !/deleted or changed this run's own state/.test(text(ku)),
      `write-ups back ${writeUpsBack()}, the fault wrote ${JSON.stringify(unrelatedStamp)}, state gone ${!existsSync(join(repo, '.mutation-state'))}; ${text(ku).split('\n').filter(l => /::error::|did not return/.test(l)).join(' | ').slice(0, 200)}`)

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
        "import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'\nconst src = readFileSync('src/Pickem.fs', 'utf8')\nconst ok = !src.includes('if false then None')\n"
        + "appendFileSync('.build-log', ok ? 'ok\\n' : 'failed\\n')\nif (!ok) { console.error('the fake build refused the mutated source'); process.exit(1) }\nmkdirSync('build', { recursive: true })\nwriteFileSync('build/Out.js', 'compiled:' + src)\n")
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
      const dread = f => (existsSync(join(drepo, f)) ? readFileSync(join(drepo, f), 'utf8') : null)
      const dbuilds = () => (dread('.build-log') ?? '').split('\n').filter(Boolean)
      const dreset = () => { rmSync(join(drepo, '.build-log'), { force: true }); rmSync(join(drepo, '.mutation-state'), { recursive: true, force: true }); dgit('checkout -q -- .') }
      // Every live process whose working directory is the scratch repository and that is the stand-in or the watcher under it (a zombie is nothing).
      const watchers = () => readdirSync('/proc').filter(d => /^\d+$/.test(d)).flatMap(pid => {
        try {
          if (readlinkSync(`/proc/${pid}/cwd`) !== drepo) return []
          const cmd = readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').join(' ').trim()
          const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
          return stat.slice(stat.lastIndexOf(')') + 2).startsWith('Z') || !/fake-fable-watch|bin\/dotnet/.test(cmd) ? [] : [{ pid: Number(pid), parent: !/fake-fable-watch/.test(cmd) }]
        } catch { return [] }
      })
      const stopAll = () => { for (const w of watchers()) { try { process.kill(w.pid, 'SIGKILL') } catch { /* gone */ } } }
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
    check('E27: A STATE DIRECTORY THAT HOLDS FILES THE HARNESS DID NOT WRITE IS REFUSED, NOT EMPTIED: exit 2, the message names what is in it (keep.txt, sub), both files are still there, nothing was mutated and no run started',
      kf.status === 2 && /already holds files this harness did not write \(keep\.txt, sub\)/.test(text(kf)) && foreignKept && !/Mutation testing/.test(text(kf)) && read(join(repo, 'docs/gate-rows.txt')) === rows && !existsSync(join(repo, '.mutation-state')),
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
    recordDriver(process.pid)
    const written = JSON.parse(readFileSync(driverFile, 'utf8'))
    rmSync(driverFile, { force: true })
    check('REAP: the record names the process it was given with its start time, and the run that wrote it',
      written.driver.pid === process.pid && written.run?.pid === process.pid && (!haveProc || written.driver.start === startOf(process.pid)), JSON.stringify(written))
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
// A state directory is the harness's to empty: clearActive() removes everything in it but the run lock, the build driver's record and a nested run's state. A MUTATION_STATE_DIR that already
// holds something this harness did not write would lose it at the first clear (measured 2026-11-05: a directory with two files was gone after one `--only known-survivor`). So only a directory
// that is absent, empty, or holds one of the five names this harness gives its own entries is used (a child harness run's `nested` directory holds only such names).
// Lenient on purpose, and said so: ONE of those names is enough, so a person's directory that happens to hold `nested/` or `run.json` among its files would still be emptied.
{
  let holds = []
  try { holds = readdirSync(stateDir).sort() } catch (e) { if (e.code !== 'ENOENT') holds = ['not a directory it can read'] }
  if (holds.length > 0 && !holds.some(h => ['active.json', 'run.json', 'driver.json', 'nested', 'world'].includes(h))) {
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
  const backupPath = join(stateDir, m.file.replace(/\//g, '_'))
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
