module Fixtures

open Fable.Core

// Real captures, read from disk at run time rather than embedded as literals.
//
// An embedded copy is a second source of truth that drifts silently: the file
// on disk is what every other check decodes, and a literal pasted in here would
// go on passing after that file changed. `generate-scouting.mjs --check` exists
// because generated source can be hand-edited; this is the same hazard with the
// direction reversed.
//
// Node-only. Nothing in the browser bundle imports this module — it sits below
// `Program.fs` and is reached solely from `Suite.fs` under `VerifyMain`, the
// same arrangement the suite itself uses.

[<Import("readFileSync", "node:fs")>]
let private readFileSync (path: string, encoding: string) : string = jsNative

/// Production's recorded statsapi schedule response.
///
/// VERIFIED BYTE-IDENTICAL to the upstream blob (sha aba791bd…) rather than
/// trusted as transcribed — `git hash-object` on this file reproduces the sha
/// the relay reports for `docs/adapter-fixtures-mlb-ok.json` in
/// jubilant-bassoon. Transcription is how the Comerica timezone error got in;
/// a hash comparison is what makes it safe to do at all.
let statsapiSchedule : string =
    readFileSync ("data/statsapi-schedule-2026-06-29.json", "utf8")

/// The same games, in the envelope the LIVE endpoint actually returns.
///
/// statsapi nests under `dates[].games`; the recorded fixture is of the
/// normalised form with `games` at the top level. Built here by re-wrapping the
/// real games array rather than by hand, so the nested test runs on the same
/// real data as the flat one and cannot quietly diverge from it.
[<Emit("JSON.stringify({ dates: [ { games: JSON.parse($0).games } ] })")>]
let private nestGames (json: string) : string = jsNative

let statsapiNested : string = nestGames statsapiSchedule

/// The nested envelope carrying a CHANGED record, so "these two decode to the
/// same thing" has an input for which it is false.
let statsapiNestedAltered : string =
    nestGames (statsapiSchedule.Replace("\"wins\": 39", "\"wins\": 40"))

/// A real live tennis payload, captured 2026-09-06 from
/// `/bsd/tennis/matches/live` by `scripts/capture-tennis-fixture.mjs`.
///
/// 11 matches across US Open Men, an ATP Challenger and four UTR events; two
/// statuses (`live`, `interrupted`); two sets carrying a `tiebreak` array. The
/// capture REFUSES a payload where no match carries `sets_detail`, so this file
/// cannot become one that exercises the decoder against a shape it lacks.
let tennisLive : string =
    readFileSync ("data/tennis-live.json", "utf8")

/// The tennis capture with ONE completed set changed to a score no set can end
/// on: Menšik's 6-1 second set becomes 5-1.
///
/// WHY THIS IS A FUNCTION AND NOT A `.Replace` AT THE CALL SITE. The first
/// version of this mutation was written inline in `Suite.fs` against
/// `{"p1": 6, "p2": 1}` — the shape a JSON object has when you picture one. The
/// capture is written with `JSON.stringify(payload, null, 1)`, so its real text
/// is `"p1": 6,` then a newline then four spaces. The anchor matched nothing,
/// the "corrupted" input was byte-identical to the clean one, and the row
/// reported NO TEETH.
///
/// That is precisely the harness failure Rule 90's corollary names: a mutation
/// that reports a result without having been applied is worse than no mutation.
/// It was caught here only because `NoTeeth` is a verdict this suite can
/// express — a boolean assertion would have gone green.
///
/// So the guard is IN the value rather than in a comment asking the author to
/// check. If the anchor is not present exactly once, this returns the ORIGINAL
/// string, the mutated and unmutated inputs become identical, and the row that
/// uses it reports NO TEETH again. The harness cannot be told a mutation
/// happened when it did not.
let tennisLiveCorrupted : string =
    // Four-space indent: sets_detail entries nest two levels inside the array.
    let anchor = "\"p1\": 6,\n    \"p2\": 1"
    let corrupt = "\"p1\": 5,\n    \"p2\": 1"
    let occurrences =
        (tennisLive.Length - tennisLive.Replace(anchor, "").Length) / anchor.Length
    if occurrences = 1 then tennisLive.Replace(anchor, corrupt) else tennisLive
