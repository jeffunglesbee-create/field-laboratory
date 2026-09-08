module Fixtures

open Fable.Core

// Real captures, read at run time rather than embedded as literals.
//
// An embedded copy is a second source of truth that drifts silently: the file
// on disk is what every other check decodes, and a literal pasted in here would
// go on passing after that file changed. `generate-scouting.mjs --check` exists
// because generated source can be hand-edited; this is the same hazard with the
// direction reversed.
//
// WHY THE BYTES ARE HANDED IN RATHER THAN READ HERE
//
// This module used to call `readFileSync` from `node:fs` directly, which made it
// node-only, which made `Suite.fs` node-only, which is why the suite compiled
// BELOW `Program.fs` and could never appear on the page. 146 checks, each
// carrying a counterexample, ran in a terminal and landed in an outbox file; a
// visitor to the laboratory saw a scoreboard.
//
// The import is the only thing that was node-specific. Everything else here is
// string arithmetic. So the read is inverted: a host LOADS the bytes and this
// module reads them from the registry below. `FixturesNode.fs` fills it with
// `readFileSync` for `VerifyMain`; `SuiteView.fs` fills it with `fetch` for the
// browser — the SAME files either way, `data/*.json`, which `build-site.mjs`
// copies to `public/data/`. The principle in the paragraph above is unchanged:
// still read at run time, still one source of truth, still no literal here.
//
// The fixtures are FUNCTIONS rather than values for the same reason. A
// module-level `let x = read "..."` evaluates when the module is imported, and
// in a browser that is before any fetch has resolved.

/// The captures, by path. Empty until a host fills it.
let mutable private loaded : Map<string, string> = Map.empty

/// Every file this module needs. A host loads these and no others; naming them
/// here rather than at each call site means a host cannot fill three of four and
/// discover the fourth only when a row throws.
let paths =
    [ "data/statsapi-schedule-2026-06-29.json"
      "data/tennis-live.json"
      "data/tennis-draw.json" ]

/// Hand this module a file's bytes.
let load (path: string) (text: string) = loaded <- Map.add path text loaded

/// THROWS rather than returning "" for a file nobody loaded.
///
/// An empty string decodes to nothing, every row over it reports a clean
/// failure, and the suite would read as 146 real results about a payload that
/// was never there. This repo has shipped three blank artifacts on exactly that
/// shape. A thrown error names the file.
let private read (path: string) : string =
    match Map.tryFind path loaded with
    | Some text -> text
    | None ->
        failwithf "fixture not loaded: %s — a host must call Fixtures.load for every path in Fixtures.paths before the suite runs" path

/// Production's recorded statsapi schedule response.
///
/// VERIFIED BYTE-IDENTICAL to the upstream blob (sha aba791bd…) rather than
/// trusted as transcribed — `git hash-object` on this file reproduces the sha
/// the relay reports for `docs/adapter-fixtures-mlb-ok.json` in
/// jubilant-bassoon. Transcription is how the Comerica timezone error got in;
/// a hash comparison is what makes it safe to do at all.
let statsapiSchedule () : string = read "data/statsapi-schedule-2026-06-29.json"

/// The same games, in the envelope the LIVE endpoint actually returns.
///
/// statsapi nests under `dates[].games`; the recorded fixture is of the
/// normalised form with `games` at the top level. Built here by re-wrapping the
/// real games array rather than by hand, so the nested test runs on the same
/// real data as the flat one and cannot quietly diverge from it.
[<Emit("JSON.stringify({ dates: [ { games: JSON.parse($0).games } ] })")>]
let private nestGames (json: string) : string = jsNative

let statsapiNested () : string = nestGames (statsapiSchedule ())

/// The nested envelope carrying a CHANGED record, so "these two decode to the
/// same thing" has an input for which it is false.
let statsapiNestedAltered () : string =
    nestGames ((statsapiSchedule ()).Replace("\"wins\": 39", "\"wins\": 40"))

/// A real live tennis payload, captured 2026-09-06 from
/// `/bsd/tennis/matches/live` by `scripts/capture-tennis-fixture.mjs`.
///
/// 11 matches across US Open Men, an ATP Challenger and four UTR events; two
/// statuses (`live`, `interrupted`); two sets carrying a `tiebreak` array. The
/// capture REFUSES a payload where no match carries `sets_detail`, so this file
/// cannot become one that exercises the decoder against a shape it lacks.
let tennisLive () : string = read "data/tennis-live.json"

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
let tennisLiveCorrupted () : string =
    // Shadowed so the derivation below reads exactly as it did when this was a
    // value. The guard it documents is unchanged.
    let tennisLive = tennisLive ()
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
let tennisDraw () : string = read "data/tennis-draw.json"

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
let tennisDrawCorrupted () : string =
    let tennisDraw = tennisDraw ()
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


/// The captured draw with EVERY completed set changed to a score no set can end
/// on.
///
/// Different anchor from `tennisDrawCorrupted`, and deliberately so. That one
/// renames a round to break `Draw.decodeResponse`; this one corrupts SCORES to
/// break `Tennis.decodeDrawNodes`. One file feeds two decoders and each needs a
/// mutation its own decoder can see — a renamed round leaves every scoreline
/// intact and would go NO TEETH here.
///
/// EVERY set, not one, and the reason is a real row in the capture. The suite
/// row this falsifies asserts that MOST matches decode, not all: node 36028
/// carries `"tiebreak": [40, 15]` on a 6-4 set, and 40 and 15 are game points,
/// not a breaker. One vendor row is not a scoreline, `completedSet` refuses it
/// correctly, and a row asserting "all 127 decode" would be asserting something
/// false. So the assertion is a proportion — and a proportion cannot be
/// falsified by corrupting one set out of 127.
///
/// DERIVED FROM THE FILE. Every `"p1": n` after the `"sets"` key becomes 9: no
/// completed set ends at 9, and a live set is capped at 7, so it is illegal
/// wherever it sits. Anchored past `"sets"` so it cannot land in the `rounds`
/// summary table — the exact mistake `tennisDrawCorrupted` made and reported as
/// NO TEETH.
///
/// The guard stays. If the anchor is absent this returns the ORIGINAL string,
/// the two inputs become identical, and the row reports NO TEETH.
let tennisDrawSetCorrupted () : string =
    let tennisDraw = tennisDraw ()
    let setsAt = tennisDraw.IndexOf("\"sets\":")
    if setsAt < 0 then tennisDraw
    else
        let head = tennisDraw.Substring(0, setsAt)
        let tail = tennisDraw.Substring(setsAt)
        let anchor = "\"p1\": "
        let sb = System.Text.StringBuilder()
        let mutable i = 0
        let mutable hits = 0
        while i < tail.Length do
            if i + anchor.Length <= tail.Length && tail.Substring(i, anchor.Length) = anchor then
                let vs = i + anchor.Length
                let mutable j = vs
                while j < tail.Length && System.Char.IsDigit tail.[j] do j <- j + 1
                if j > vs then
                    sb.Append(anchor).Append("9") |> ignore
                    hits <- hits + 1
                    i <- j
                else
                    sb.Append(tail.[i]) |> ignore
                    i <- i + 1
            else
                sb.Append(tail.[i]) |> ignore
                i <- i + 1
        if hits = 0 then tennisDraw else head + sb.ToString()
