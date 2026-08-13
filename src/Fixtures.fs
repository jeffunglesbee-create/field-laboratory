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
