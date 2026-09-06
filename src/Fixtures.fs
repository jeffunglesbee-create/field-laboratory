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

/// The tennis capture with one set corrupted to a score no set can hold.
///
/// DERIVED FROM THE FILE, never anchored to a value in it. The first version
/// hardcoded Mensik's 6-1 second set, which was correct for the capture taken at
/// 03:49 and meaningless by 05:55 — `capture-tennis-fixture.yml` overwrote the
/// fixture with a different eight matches and that set was gone. The row went
/// NO TEETH, which is the guard below doing its job, and the suite dropped to
/// 117/119.
///
/// The lesson is not "re-anchor it". It is that a check coupled to the CONTENTS
/// of a file some workflow rewrites will break every time that workflow runs,
/// and each break looks like a defect in the thing being tested. The mutation
/// has to be a function of whatever the file happens to contain.
///
/// So: the first `"p1"` value becomes 99. A completed set of 99-n is illegal at
/// any n, and a LIVE set is capped at 7, so this is a decode error wherever in
/// the array that set sits — no matter which matches were captured.
///
/// The guard stays. If `"p1":` is not present at all, this returns the ORIGINAL
/// string, the mutated and clean inputs become identical, and the row reports NO
/// TEETH. The harness cannot be told a mutation happened when it did not.
let tennisLiveCorrupted : string =
    let anchor = "\"p1\": "
    let i = tennisLive.IndexOf(anchor)
    if i < 0 then tennisLive
    else
        let valueStart = i + anchor.Length
        // The digits of that first p1 value, however many there are.
        let mutable j = valueStart
        while j < tennisLive.Length && System.Char.IsDigit tennisLive.[j] do j <- j + 1
        if j = valueStart then tennisLive   // no digits: not the shape we think
        else tennisLive.Substring(0, valueStart) + "99" + tennisLive.Substring(j)


/// A COMPLETE slam draw, captured 2026-09-06 from
/// `/bsd/tennis/draw?tournament=77&season=2026` by
/// `scripts/capture-tennis-draw.mjs`.
///
/// Roland Garros WTA 2026: 127 main-draw matches, 126 edges joined by winner
/// identity, champion Mirra Andreeva, zero anomalies. It was chosen because it
/// is the only one of the three editions the relay's verify run checks that is
/// canonical throughout — the capture REFUSES anything with fewer than seven
/// rounds, no champion, or no edges, so this file cannot quietly become a
/// partial draw that verifies four rounds and reads as seven.
let tennisDraw : string =
    readFileSync ("data/tennis-draw.json", "utf8")

/// The captured draw with one match's round renamed to a qualifying round.
///
/// DERIVED FROM THE FILE, never anchored to a value in it — the same lesson
/// `tennisLiveCorrupted` records, learned the expensive way when a mutation
/// anchored to Mensik's 6-1 second set went NO TEETH the moment the capture
/// workflow ran again.
///
/// The first `"round": "` value, whatever it happens to be, becomes
/// `"Qualification Final"`. Qualifying is not part of the draw and `Draw.fs`
/// refuses it rather than dropping the row, so this is a decode error wherever
/// in the node list that match sits and whichever edition was captured.
///
/// The guard stays. If the anchor is absent this returns the ORIGINAL string,
/// the two inputs become identical, and the row reports NO TEETH. The harness
/// cannot be told a mutation happened when it did not.
/// INSIDE `nodes`, not the first match in the file. The first version anchored
/// on the first `"round": "` anywhere, which lands in the `rounds` SUMMARY
/// TABLE — a sibling of `nodes` that `decodeResponse` never reads. The payload
/// was mutated, the decode was unaffected, and the row reported NO TEETH.
///
/// That is the guard working exactly as designed, on exactly the mistake it was
/// written for: the mutation was applied and changed nothing the check could
/// see. A boolean would have said PASS.
let tennisDrawCorrupted : string =
    let nodesAt = tennisDraw.IndexOf("\"nodes\":")
    if nodesAt < 0 then tennisDraw
    else
        let anchor = "\"round\": \""
        let i = tennisDraw.IndexOf(anchor, nodesAt)
        if i < 0 then tennisDraw
        else
            let valueStart = i + anchor.Length
            let close = tennisDraw.IndexOf("\"", valueStart)
            if close < 0 then tennisDraw
            else tennisDraw.Substring(0, valueStart) + "Qualification Final" + tennisDraw.Substring(close)
