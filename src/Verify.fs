module Verify

// The check harness, in F#, with the failure this repo keeps having designed out
// of it.
//
// WHY
//
// `scripts/checks.mjs` offers `check(name, pass, detail)`. `pass` is a bare
// boolean, so nothing anywhere requires that any input could ever make it false.
// Every one of these got through it:
//
//   outboxToday        passed on any dated file, not on a documented commit
//   zone-check         16/16 green while a broken UTC-4 build also passed 11/11
//   outboxAccompanies  the PASS direction was never run; it ate a character
//   gate-inventory     tested fixtures standalone, never the real files
//   spark-check        every-Nth sampling proved nothing on the one real arc
//
// `scripts/mutation-check.mjs` finds these AFTERWARDS, by breaking the source and
// seeing whether anything objects, and `scripts/row-confidence.mjs` scores a row
// on whether such a mutation exists. Both are detection. This is the same
// property moved to construction: a check here carries an input that MUST hold
// and an input that MUST fail, and there is no way to write one that does not.
//
// WHAT IS AND IS NOT GUARANTEED — stated before the code, because the last thing
// this repo needs is another proof doc claiming more than it holds:
//
//   GUARANTEED BY THE COMPILER.  A check cannot be declared without a
//   counterexample. The record is private, so the only constructor is `create`,
//   which takes four arguments; a partial application is a function, not a
//   Check, and does not type-check where a Check is wanted. A suite holds
//   `Sealed` values, whose case is also private, so nothing can enter a suite
//   that was not built this way — in particular not a bare bool.
//
//   GUARANTEED BY THE RUNNER, NOT THE COMPILER.  That the counterexample really
//   is one. `create name p goodValue goodValue` compiles. It returns `NoTeeth`
//   when run, and `runAll` counts that as a failure. No type can decide this —
//   it depends on what the predicate does at runtime.
//
// So: the SHAPE is a compile error, the CONTENT is a runtime failure. That is
// strictly more than JavaScript enforces, and less than "a toothless check is
// unwritable". docs/CHECK-PROOF.md compiles the first half; runAll's own
// self-test exercises the second.

/// What running a check found. Three cases, and FS0025 is an error in this
/// project, so a fourth cannot be added without every reader handling it.
type Verdict =
    /// Held on the input that must hold, failed on the input that must fail.
    /// The only outcome that is a pass.
    | Held
    /// Did not hold on the input that must hold. An ordinary failure.
    | Broke
    /// ALSO held on the input that must fail. The check cannot fail, so its
    /// passing says nothing. This is the outcome the whole file exists for.
    | NoTeeth

/// A named claim about a predicate, carrying both directions.
///
/// The fields are private. `{ Name = ...; Predicate = ... }` outside this module
/// is FS1093, which is what stops a caller assembling one with `MustFail` set to
/// something that passes — or, more to the point, from writing a variant record
/// with no `MustFail` field at all.
type Check<'input> =
    private
        { Name: string
          Predicate: 'input -> bool
          MustHold: 'input
          MustFail: 'input }

/// A check with its input type erased, so one suite can hold checks over
/// different types — F# lists are homogeneous and real suites are not.
///
/// The case is private on purpose. If it were public, `Sealed("looks fine", fun
/// () -> Held)` would compile and would be a check that passes unconditionally
/// with no predicate and no inputs, which is precisely the JavaScript harness's
/// hole re-opened one level up.
type Sealed = private Sealed of name: string * run: (unit -> Verdict)

/// The only constructor. Four arguments, no overloads, no optional parameters.
let create (name: string) (predicate: 'input -> bool) (mustHold: 'input) (mustFail: 'input) : Check<'input> =
    { Name = name; Predicate = predicate; MustHold = mustHold; MustFail = mustFail }

/// Run both directions.
let run (c: Check<'input>) : Verdict =
    match c.Predicate c.MustHold, c.Predicate c.MustFail with
    | true, false -> Held
    | false, _ -> Broke
    | true, true -> NoTeeth

/// Erase the input type so the check can join a suite.
let seal (c: Check<'input>) : Sealed = Sealed(c.Name, fun () -> run c)

/// Build and seal in one step — the shape every suite uses.
let check name predicate mustHold mustFail : Sealed = seal (create name predicate mustHold mustFail)

let verdictLabel =
    function
    | Held -> "PASS"
    | Broke -> "FAIL"
    | NoTeeth -> "NO TEETH"

let verdictDetail =
    function
    | Held -> ""
    | Broke -> "the predicate did not hold on the input that must hold"
    | NoTeeth -> "the predicate ALSO held on the input that must fail — this check cannot fail"

let sealedName (Sealed(name, _)) = name

/// Run a suite, print it, and return the number of results that are not `Held`.
///
/// `NoTeeth` counts as a failure and is labelled differently from `Broke`. A
/// harness that folded the two together would report a toothless check as a
/// broken one, and the fix for those is not the same: one means the code is
/// wrong, the other means the check is worthless.
let runAll (title: string) (suite: Sealed list) : int =
    printfn ""
    printfn "%s" title
    printfn ""
    let results = suite |> List.map (fun (Sealed(name, go) as s) -> sealedName s, go ())
    for name, verdict in results do
        printfn "%-9s %s" (verdictLabel verdict) name
        if verdict <> Held then printfn "          → %s" (verdictDetail verdict)
    let bad = results |> List.filter (fun (_, v) -> v <> Held)
    printfn ""
    printfn "%d/%d checks held" (List.length results - List.length bad) (List.length results)
    List.length bad
