module VerifyMain

open Fable.Core

// The F# suite's entry point, run under node from the Fable output:
//
//     dotnet fable src/Laboratory.fsproj --outDir build && node build/VerifyMain.js
//
// Two phases, and the ORDER matters.
//
// Phase 1 is the harness proving it can still tell the difference. Every
// detector in this repo has needed this and one of them shipped without it:
// blind `mutation-check`'s expectation matching and all 30 mutations "pass";
// blind `row-confidence`'s teeth detection and all 20 rows score 100. A harness
// whose whole claim is "a toothless check is caught" has to demonstrate catching
// one, or its 20/20 means only that it ran.
//
// The self-test is deliberately built from a check that is toothless ON PURPOSE.
// `create` will not stop it — that is the documented boundary in Verify.fs, the
// line between what the compiler holds and what the runner does — so this is
// where the runner's half gets shown working.
//
// Phase 2 is the real suite. It runs only if phase 1 passed: a suite whose
// harness has been shown blind is not evidence of anything, so reporting it
// would be the "green light standing in for evidence" move again.

[<Emit("process.exit($0)")>]
let private exit (code: int) : unit = jsNative

// --- phase 1: can the harness still tell the difference? --------------------

let private selfTest () =
    let mutable failures = 0
    let assertVerdict label expected actual =
        if expected = actual then
            printfn "PASS      %s" label
        else
            failures <- failures + 1
            printfn "FAIL      %s" label
            printfn "          → expected %s, got %s"
                (Verify.verdictLabel expected) (Verify.verdictLabel actual)

    // The gate assertions below are about a Gate, not a Verdict, and folding
    // them through `assertVerdict` would have meant encoding "did it block?" as
    // a Verdict — which is the "check that agrees for the wrong reason" shape
    // this repo already has a scar from.
    let assertTrue label condition =
        if condition then
            printfn "PASS      %s" label
        else
            failures <- failures + 1
            printfn "FAIL      %s" label

    printfn ""
    printfn "Harness self-test"
    printfn ""

    // A real check: holds on one input, fails on the other.
    Verify.create "positive" (fun n -> n > 0) 1 -1
    |> Verify.run
    |> assertVerdict "a genuine check Holds" Verify.Held

    // Toothless: the counterexample is not one. This compiles, and must not
    // pass. This single case is the entire reason the file exists.
    Verify.create "positive" (fun n -> n > 0) 1 2
    |> Verify.run
    |> assertVerdict "a check whose counterexample also passes has NO TEETH" Verify.NoTeeth

    // Broken: the thing that must hold does not.
    Verify.create "positive" (fun n -> n > 0) -1 -2
    |> Verify.run
    |> assertVerdict "a check that fails its own MustHold Breaks" Verify.Broke

    // A predicate that ignores its input entirely — `fun _ -> true` is the
    // shape of every vacuous assertion in the JavaScript suite, and it cannot
    // survive here because both directions run through the same predicate.
    Verify.create "vacuous" (fun _ -> true) 1 2
    |> Verify.run
    |> assertVerdict "a predicate that always holds has NO TEETH" Verify.NoTeeth

    // ...and one that always fails, which the old harness would have reported
    // as a single ordinary failure rather than as a broken check.
    Verify.create "always false" (fun _ -> false) 1 2
    |> Verify.run
    |> assertVerdict "a predicate that never holds Breaks" Verify.Broke

    // runAll must COUNT the bad ones rather than only print them. An earlier
    // JavaScript summarizer returned the total instead of the failures and every
    // run looked identical.
    let counted =
        Verify.runAll "  (counting probe — one of each, two must be counted)"
            [ Verify.check "holds" (fun n -> n > 0) 1 -1
              Verify.check "toothless" (fun n -> n > 0) 1 2
              Verify.check "broken" (fun n -> n > 0) -1 -2 ]
    assertVerdict "runAll counts both bad outcomes"
        Verify.Held
        (if counted = 2 then Verify.Held else Verify.Broke)

    // --- the gate: does a majority still get vetoed? ------------------------
    //
    // Rule 90's own rule, applied here: these assert the gate can BLOCK, not
    // only that it can pass. A gate that has only ever been shown passing is
    // the average all over again, one level up.

    let allHold =
        [ Verify.check "a" (fun n -> n > 0) 1 -1
          Verify.check "b" (fun n -> n > 0) 2 -2 ]

    // Nine hold, one has no teeth. 90% — comfortably past any bar anyone would
    // write — and it must not pass, because none of these rows is a matter of
    // degree.
    let nineOfTen =
        [ for i in 1..9 -> Verify.check (sprintf "row %d" i) (fun n -> n > 0) i -i ]
        @ [ Verify.check "toothless row" (fun n -> n > 0) 1 2 ]

    assertTrue "a suite where every row holds Passes"
        (match Verify.decide (Verify.runRows allHold) with
         | Verify.Passed _ -> true
         | Verify.Blocked _ -> false)

    assertTrue "the passing witness counts the rows it saw"
        (match Verify.decide (Verify.runRows allHold) with
         | Verify.Passed w -> Verify.heldCount w = 2
         | Verify.Blocked _ -> false)

    assertTrue "NINE OF TEN IS BLOCKED, and the score says 90"
        (Verify.percent (Verify.score (Verify.runRows nineOfTen)) = 90
         && (match Verify.decide (Verify.runRows nineOfTen) with
             | Verify.Blocked _ -> true
             | Verify.Passed _ -> false))

    assertTrue "a blocked gate names the row that failed"
        (match Verify.decide (Verify.runRows nineOfTen) with
         | Verify.Blocked [ (name, Verify.NoTeeth) ] -> name = "toothless row"
         | _ -> false)

    assertTrue "the exit code comes from the decision, not the score"
        (Verify.exitCode (Verify.decide (Verify.runRows nineOfTen)) = 1
         && Verify.exitCode (Verify.decide (Verify.runRows allHold)) = 0)

    // An empty suite. `decide []` returns Passed, and that is deliberate — it is
    // the vacuous truth "no row failed" — but it must not be reachable as a
    // silent pass, so the witness says zero and the caller can see it.
    assertTrue "an empty suite passes with a witness of zero, not of one"
        (match Verify.decide (Verify.runRows []) with
         | Verify.Passed w -> Verify.heldCount w = 0
         | Verify.Blocked _ -> false)

    printfn ""
    printfn "  self-test: %s" (if failures = 0 then "the harness can still tell the difference"
                               else sprintf "%d SELF-TEST FAILURES" failures)
    failures

// --- phase 2: the real suite ------------------------------------------------

let private blind = selfTest ()

// The exit code is the GATE's, not a count compared against zero.
//
// `exit (if failures = 0 then 0 else 1)` was correct and was still a number
// standing where a decision belongs — one edit from `failures <= 2`, which is
// how `confidence.mjs` acquired its average in the first place. `Verify.exitCode`
// takes a `Gate`, and a `Gate` cannot be built from a score.
let private code =
    if blind > 0 then
        printfn ""
        printfn "Suite NOT run: the harness failed its own self-test, so its verdicts mean nothing."
        1
    else
        Verify.exitCode (Verify.runGate "F# suite" Suite.all)

exit code
