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
import { createChecks, finish } from './checks.mjs'

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
    mutate: 'mkdir -p /tmp/mut-outbox && mv outbox/*$(TZ=America/New_York date +%F)*.md /tmp/mut-outbox/ 2>/dev/null || true',
    restore: 'mv /tmp/mut-outbox/*.md outbox/ 2>/dev/null || true; rmdir /tmp/mut-outbox 2>/dev/null || true',
    expect: 'node scripts/run-row.mjs "this session wrote its outbox"',
  },
  {
    id: 'outbox-stub',
    claim: 'an empty stub does not count as a write-up',
    // Widened with `outbox-missing` above, and for the same reason.
    mutate: 'mkdir -p /tmp/mut-stub && cp outbox/*$(TZ=America/New_York date +%F)*.md /tmp/mut-stub/ 2>/dev/null; for f in outbox/*$(TZ=America/New_York date +%F)*.md; do [ -e "$f" ] || continue; echo stub > "$f"; done',
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
    claim: "the harness captures its one clock read, so the scorer's own row stays at 100",
    find: '  at: BASELINE_AT.toISOString(),',
    replace: '  at: new Date().toISOString(),',
    expect: 'node scripts/row-confidence.mjs',
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
    id: 'proof-marker-always-heals',
    file: 'scripts/proof-check.mjs',
    claim: 'a marker whose process is still alive refuses rather than repairing',
    find: "  return alive ? 'refuse' : 'heal'",
    replace: "  return 'heal'",
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
    id: "flow-census-counts-every-row",
    file: "src/Flow.fs",
    claim: "the census counts every shotmap row once, read or not",
    find: "      Shots = List.length c.Raws\n",
    replace: "      Shots = List.length c.Raws + 1\n",
    expect: 'node build/VerifyMain.js',
  },
  {
    // flow-full-time-at-90 loosens the marker; this removes the route it opens.
    id: "flow-full-time-route-records",
    file: "src/Flow.fs",
    claim: "a seen full-time marker records the clock past the last shot, up to 90'",
    find: "|| (sawFullTime c && at < periodEnd SecondHalf))",
    replace: "|| false)",
    expect: 'node build/VerifyMain.js',
  },
  {
    // The one sanctioned string form, checked minute by minute on the real capture.
    id: "flow-label-two-decimals",
    file: "src/Flow.fs",
    claim: "an InFlow accessible name carries sequential xG to two decimals and no more",
    find: "sprintf \"InFlow state active, sequential xG %.2f\"",
    replace: "sprintf \"InFlow state active, sequential xG %.3f\"",
    expect: 'node build/VerifyMain.js',
  },
  {
    // A renderer reading only the opacity would show nothing while the name said InFlow.
    id: "flow-pulse-draws-inflow",
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
    id: "vintage-cases-public",
    file: "src/Vintage.fs",
    claim: "a Vintage cannot be built outside the decoder, so an archive cannot be relabelled current",
    find: "type Vintage = private Archive of int<season> | Current of int<season>",
    replace: "type Vintage = Archive of int<season> | Current of int<season>",
    expect: "node scripts/proof-check.mjs --only VINTAGE-PROOF",
  },
  {
    // bdb-frame-types Task 6, second direction: the default that made six files' staleness invisible.
    id: "vintage-missing-season-defaults",
    file: "src/Vintage.fs",
    claim: "an envelope with no season is refused, never stamped with the current year",
    find: "        | Ok(None, _) -> Error NoSeason",
    replace: "        | Ok(None, _) -> (match Decode.fromString payload text with Ok value -> Ok(Tracked(value, Current current)) | Error e -> Error(Malformed e))",
    expect: "node build/VerifyMain.js",
  },
  {
    // A blank provenance string is not a provenance.
    id: "vintage-blank-source-accepted",
    file: "src/Vintage.fs",
    claim: "a missing or blank sourceDataset is refused",
    find: "            match source |> Option.filter (fun s -> s.Trim() <> \"\") with",
    replace: "            match source with",
    expect: "node build/VerifyMain.js",
  },
  {
    // Thoth's integer decoder parses "2022"; the guard in front of it is the only thing refusing a string season.
    id: "vintage-season-string-accepted",
    file: "src/Vintage.fs",
    claim: "a season written as a JSON string is refused, not parsed into a stamp",
    find: "        if Decode.Helpers.isNumber value then Decode.int path value",
    replace: "        if true then Decode.int path value",
    expect: "node build/VerifyMain.js",
  },
  {
    // A season from the future stamped current is the same defect as a missing one, from the other side.
    id: "vintage-future-season-stamped-current",
    file: "src/Vintage.fs",
    claim: "a season later than the current one is refused, not stamped current",
    find: "    if stated > current then Error(FutureSeason(stated, current))",
    replace: "    if stated > current then Ok(Current stated)",
    expect: "node build/VerifyMain.js",
  },
  {
    // The witness route. Admitting a current season here hands Gravity's projections a live season's wells.
    id: "vintage-archive-granted-to-current",
    file: "src/Vintage.fs",
    claim: "only an archive season yields the archive value, and so the gravity witness",
    find: "    | Tracked(value, Archive s) when s = displaying -> Some value",
    replace: "    | Tracked(value, (Archive s | Current s)) when s = displaying -> Some value",
    expect: "node build/VerifyMain.js",
  },
  {
    // A receiver level with the snapper is not past the line; inclusive, he becomes a route runner on no route.
    id: "gridiron-past-line-inclusive",
    file: "src/Gridiron.fs",
    claim: "past the line means strictly beyond the snapper at the snap",
    find: "let pastLine (p: Position<Scrimmage, 'Instant>) : bool = yardsPast p > 0.0<yd>",
    replace: "let pastLine (p: Position<Scrimmage, 'Instant>) : bool = yardsPast p >= 0.0<yd>",
    expect: "node build/VerifyMain.js",
  },
  {
    // Conservation. The snap counterfactual must assign the same defenders as the release, or drawn
    // stops summing to zero and a receiver "draws" a defender nobody lost.
    id: "gravity-snap-counts-a-defender-twice",
    file: "src/Gravity.fs",
    claim: "the snap counterfactual assigns the same defenders as the release, so drawn cancels within a play",
    find: "    (c.Defenders |> List.map (fun p -> p.NflId, c.SnapAt.[p.NflId]))",
    replace: "    (c.Defenders @ [ List.head c.Defenders ] |> List.map (fun p -> p.NflId, c.SnapAt.[p.NflId]))",
    expect: "node build/VerifyMain.js",
  },
  {
    // The sign. A zero is Level; counted as Drawing, every unchanged receiver reads as drawing coverage.
    id: "gravity-drawing-at-zero",
    file: "src/Gravity.fs",
    claim: "a receiver who drew nothing beyond his alignment is Level, not Drawing",
    find: "    if drawn > 0 then Drawing pull",
    replace: "    if drawn >= 0 then Drawing pull",
    expect: "node build/VerifyMain.js",
  },
  {
    // Rule 99 at the layer that reaches the DOM: a measured zero drawn as nothing is an absence.
    id: "gravity-level-drawn-as-absence",
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
    id: "stamina-chart-total-checked",
    file: "src/Stamina.fs",
    claim: "a shift chart whose total disagrees with its own rows is refused",
    find: "        if total <> List.length rows then",
    replace: "        if false then",
    expect: 'node build/VerifyMain.js',
  },
  {
    // The committed game went past regulation; the row requires an attempt there.
    id: "stamina-overtime-counted",
    file: "src/Stamina.fs",
    claim: "attempts past regulation are counted, not dropped",
    find: "BeyondRegulation = pbp.Attempts |> List.filter (fun a -> a.AttemptPeriod > 3) |> List.length",
    replace: "BeyondRegulation = 0",
    expect: 'node build/VerifyMain.js',
  },
  {
    // Without the shift the +600 s control covers as much as the real clock, and the row has no control.
    id: "stamina-coverage-clock-shift",
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

  check('A FULL RUN OWNS THE BASELINE ARTIFACT', ownsBaseline(null) === true,
    'the full suite is the only run whose baseline describes the whole suite')
  check('AN --only RUN DOES NOT, so it cannot overwrite the full record',
    ownsBaseline('known-survivor') === false,
    'the gate runs `--only known-survivor` straight after the full suite; if it ' +
    'writes, the committed baseline is 1 of 1 and the full one is gone')

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
const baselineResults = distinctExpects.map(cmd => {
  try {
    execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' })
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
})
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

if (ownsBaseline(ONLY)) {
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
  console.log(`  baseline NOT written: --only ${ONLY} covers ${distinctExpects.length} ` +
    `expectation(s) of the full suite, and the artifact is the full run's`)
}

check('the unmutated tree passes every expectation',
  baselineFailures.length === 0,
  `${baselineFailures.length} of ${distinctExpects.length} distinct expectation(s) ` +
  `already failing, so nothing below would mean anything ` +
  `(full output in outbox/mutation-baseline-latest.json):\n` +
  baselineFailures.map(c => `            $ ${c}`).join('\n'))

for (const m of selected) {
  // Not run, and not counted as caught: the row this mutation would break is
  // not scored on this run at all. The count is printed with the baseline above.
  if (notApplicableExpects.has(m.expect)) {
    console.log(`  N/A   [${m.id}] ${m.claim} — \`${m.expect}\` is not applicable on this run`)
    continue
  }
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

finish(summarize())
