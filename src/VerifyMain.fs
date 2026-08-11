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

    printfn ""
    printfn "  self-test: %s" (if failures = 0 then "the harness can still tell the difference"
                               else sprintf "%d SELF-TEST FAILURES" failures)
    failures

// --- phase 2: the real suite ------------------------------------------------

let private blind = selfTest ()

let private failures =
    if blind > 0 then
        printfn ""
        printfn "Suite NOT run: the harness failed its own self-test, so its verdicts mean nothing."
        blind
    else
        Verify.runAll "F# suite" Suite.all

exit (if failures = 0 then 0 else 1)
