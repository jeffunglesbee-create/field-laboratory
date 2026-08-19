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
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
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
    find: '    { Max = 245<point>; Name = "relay',
    replace: '    { Max = 300<point>; Name = "relay',
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
    find: '    orderByMatchup r.Sport r.Home r.Away',
    replace: '    r.Home, r.Away',
    expect: 'node scripts/run-row.mjs "the F# harness refuses a check with no counterexample"',
  },

  {
    // The state both new panels actually shipped in: no card styling at all.
    // Restores it by neutralising the one rule that draws the boundary.
    id: 'cards-run-together',
    file: 'index.html',
    claim: 'games on a panel are drawn as separate cards',
    find: '  .st-card, .wx-row {\n    border: 1px solid #262a33;\n    border-radius: 10px;\n    padding: 1rem 1.1rem;\n    background: #161920;\n  }',
    replace: '  .st-card, .wx-row { border: 0; padding: 0; background: transparent; }',
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
    mutate: 'node -e "' +
      'const fs=require(\'fs\'),f=\'docs/history-boundary.txt\';' +
      'const t=fs.readFileSync(f,\'utf8\');' +
      'const m=/^([0-9a-f]{40})(\\s+)(\\d+)\\s*$/m.exec(t);' +
      'if(!m)process.exit(1);' +
      'const other=m[1][0]===\'a\'?\'b\':\'a\';' +
      'fs.writeFileSync(f,t.replace(m[0],other.repeat(40)+m[2]+m[3]))' +
      '"',
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
// still being there afterwards. The next run finds the marker, restores from
// the backup, and says so out loud.
const stateDir = '.mutation-state'
const marker = join(stateDir, 'active.json')
const backups = new Map()

/** Drop the marker and its backups — the tree is known-good from here. */
const clearActive = () => rmSync(stateDir, { recursive: true, force: true })

const restore = () => {
  for (const [file, path] of backups) {
    if (existsSync(path)) writeFileSync(file, readFileSync(path))
  }
  backups.clear()
  clearActive()
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
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' })
  } catch {
    return ''
  }
}

/**
 * A digest of the working tree, INCLUDING the contents of untracked files.
 *
 * The no-op detector compared `git status --porcelain` alone, which misses one
 * case exactly: a mutation that REWRITES an untracked file. Porcelain prints
 * `?? path` before and after, `git diff` never sees an untracked file at all,
 * and the comparison concludes nothing happened.
 *
 * Measured rather than theorised. `outbox-stub` overwrites today's outbox entry
 * with the word "stub". On 2026-08-19 that entry was untracked — newly written,
 * not yet committed — and the mutation was reported as broken rather than run:
 *
 *   FAIL  [outbox-stub] the mutation actually applies
 *         → … left the tree unchanged. Nothing was tested …
 *
 * It had applied perfectly. The detector could not see it, which is the detector
 * committing the error it was built to report.
 *
 * Same root cause as the exposed-secret scanner missing untracked files one day
 * earlier: a git-based view of "the tree" that only covers what git already
 * tracks. Hashing rather than concatenating keeps this cheap on a repo carrying
 * a 13k-line capture.
 */
const treeDigest = () => {
  const h = createHash('sha256').update(capture('git status --porcelain'))
  for (const f of capture('git ls-files --others --exclude-standard').split('\n').filter(Boolean)) {
    h.update(f)
    try { h.update(readFileSync(f)) } catch { h.update('<unreadable>') }
  }
  return h.digest('hex')
}

/**
 * Undo a mutation a previous run was killed before it could undo itself.
 *
 * Returns true if there was something to heal. Runs BEFORE the baseline, so
 * the baseline measures the tree as its author left it rather than as a dead
 * process left it.
 *
 * A world mutation carries a shell restore instead of a backup, so the marker
 * carries whichever applies and this heals both kinds.
 */
const heal = ({ rebuild = true } = {}) => {
  if (!existsSync(marker)) return false

  const { id, file, backup, restoreCmd } = JSON.parse(readFileSync(marker, 'utf8'))
  console.log(`\n  HEALED: a previous run was killed with [${id}] still applied.`)

  if (restoreCmd) {
    run(restoreCmd)
    console.log(`  Ran its restore command before measuring anything.`)
  } else if (existsSync(backup)) {
    writeFileSync(file, readFileSync(backup))
    console.log(`  Restored ${file} from its backup before measuring anything.`)
    // The stranded file is source more often than not, and every check below
    // reads build/ rather than src/. Healing the source and leaving the stale
    // build in place would reproduce the exact failure this is fixing.
    if (rebuild) run('npm run build')
  } else {
    // Naming it and stopping beats guessing. `git diff` will show the damage
    // and the id says which mutation to look for.
    console.log(`::error::${marker} names [${id}] on ${file}, but its backup is gone — restore that file by hand`)
    process.exit(1)
  }

  clearActive()
  return true
}

const { check, summarize } = createChecks()

// `--self-test` proves the heal path itself, and nothing else. It is a third
// half of the gate's mutation row for the same reason the row already has a
// second: a harness that cannot recover from being killed will one day report
// something untrue about a tree nobody meant to create, and that is not
// something the normal suite would ever notice about itself.
//
// Deliberately operates on a throwaway file in tmp, never on real source. The
// bug being guarded against is one that damages the working tree; a self-test
// that damaged the working tree to prove it would be its own worst example.
if (process.argv.includes('--self-test')) {
  console.log('\nHeal self-test\n')

  const victim = join(tmpdir(), 'mutation-selftest-victim.txt')
  const backup = join(tmpdir(), 'mutation-selftest-backup.txt')
  writeFileSync(backup, 'ORIGINAL')
  writeFileSync(victim, 'MUTATED')
  mkdirSync(stateDir, { recursive: true })
  writeFileSync(marker, JSON.stringify({ id: 'self-test', file: victim, backup }))

  // No rebuild: the victim is a text file in tmp, and a `npm run build` here
  // would make a self-test of the recovery path cost as much as a real run.
  const healed = heal({ rebuild: false })
  const content = existsSync(victim) ? readFileSync(victim, 'utf8') : '<missing>'

  check('an abandoned mutation is detected', healed,
    'the marker was on disk and heal() reported nothing to do')
  check('the abandoned file is restored from its backup', content === 'ORIGINAL',
    `the file still reads ${JSON.stringify(content)}`)
  check('the marker is cleared, so the next run does not heal twice',
    !existsSync(marker), 'the marker is still on disk after healing')
  check('a clean tree reports nothing to heal', heal({ rebuild: false }) === false,
    'heal() claimed to heal a tree with no marker — it would fire on every run')

  rmSync(victim, { force: true })
  rmSync(backup, { force: true })
  clearActive()
  process.exit(summarize() === 0 ? 0 : 1)
}

// Before the baseline, not after: a stranded mutation would otherwise be
// measured as a product failure, which is precisely what happened today.
heal()

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
    // Marker first. A world mutation moves real files around — the outbox one
    // moves this session's write-ups into /tmp — so being killed between
    // `mutate` and `restore` is the most expensive interruption here, not the
    // cheapest.
    mkdirSync(stateDir, { recursive: true })
    writeFileSync(marker, JSON.stringify({ id: m.id, restoreCmd: m.restore }))

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
    // The tree state before and after is the general test, so it holds for
    // mutations that edit a file, move files to /tmp, or overwrite them.
    const treeBefore = treeDigest()
    run(m.mutate)
    const treeAfter = treeDigest()
    if (treeBefore === treeAfter) {
      run(m.restore)
      clearActive()
      check(`[${m.id}] the mutation actually applies`, false,
        `\`${m.mutate.slice(0, 90)}${m.mutate.length > 90 ? '…' : ''}\` left the tree unchanged. ` +
        `Nothing was tested — this is a broken mutation, NOT an undefended claim.`)
      continue
    }

    const passed = run(m.expect)
    run(m.restore)
    clearActive()
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

  // Backup and marker land BEFORE the file is touched. The window this closes
  // is the one that actually opened today: the process died holding a mutated
  // file with its only backup in a tmpdir that died with it.
  mkdirSync(stateDir, { recursive: true })
  const backupPath = join(stateDir, m.file.replace(/\//g, '_'))
  writeFileSync(backupPath, original)
  writeFileSync(marker, JSON.stringify({ id: m.id, file: m.file, backup: backupPath }))
  backups.set(m.file, backupPath)
  writeFileSync(m.file, mutated)

  // Only source changes need recompiling. Mutating a workflow or a doc does
  // not, and rebuilding for those added a minute each for nothing.
  //
  // index.html counts as source: `build-site.mjs` COPIES it into public/, so a
  // mutation to the stylesheet there is invisible to any browser check until the
  // site is reassembled. Without this the CSS mutation below would survive for a
  // reason that has nothing to do with the claim.
  const needsRebuild = m.file.startsWith('src/') || m.file === 'index.html'
  const built = needsRebuild ? run('npm run build') : true
  // No inversion flag. A row that passes when its command fails already encodes
  // that itself — `run-row.mjs` reports the ROW's verdict, and a shell `!` wraps
  // anything else. An `inverted` option existed here briefly and was removed
  // unused: a branch nothing exercises is precisely what this harness is for.
  const survived = built && run(m.expect)

  writeFileSync(m.file, original)
  backups.delete(m.file)
  clearActive()

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
