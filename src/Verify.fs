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
/// WHAT IT CARRIES, AND WHY IT GREW ON 2026-09-08.
///
/// It held a name and a thunk, which is everything a RUNNER needs and not enough
/// for a reader. A page rendering "146 passed" is the same green badge every
/// project on the internet has; what this repo has that they do not is a
/// counterexample per check, and it was unreachable — `seal` erased the input
/// type and the `MustFail` value with it.
///
/// So a sealed check also carries a RENDERING of both inputs, and the predicate
/// pointed at each one separately. The renderings let the page show the input
/// that must fail; the separate thunks let a reader FEED it and watch the
/// predicate return false, which is the difference between a claim and a
/// demonstration.
///
/// The case stays private, and that is untouched. `Sealed("looks fine", fun ()
/// -> Held)` is still FS1093 — the arity is irrelevant when the access check
/// fires first — so docs/CHECK-PROOF.md's case 5 still compiles to the error it
/// claims.
type Sealed =
    private
    | Sealed of
        name: string *
        run: (unit -> Verdict) *
        /// The predicate applied to the input that MUST HOLD. True is correct.
        onMustHold: (unit -> bool) *
        /// The predicate applied to the input that MUST FAIL. False is correct.
        onMustFail: (unit -> bool) *
        shownMustHold: string *
        shownMustFail: string

/// The only constructor. Four arguments, no overloads, no optional parameters.
let create (name: string) (predicate: 'input -> bool) (mustHold: 'input) (mustFail: 'input) : Check<'input> =
    { Name = name; Predicate = predicate; MustHold = mustHold; MustFail = mustFail }

/// Run both directions.
let run (c: Check<'input>) : Verdict =
    match c.Predicate c.MustHold, c.Predicate c.MustFail with
    | true, false -> Held
    | false, _ -> Broke
    | true, true -> NoTeeth

/// How an input is shown to a reader.
///
/// TRUNCATED, AND IT SAYS SO. Most inputs in this suite are whole captured
/// payloads — `data/tennis-draw.json` is 127 matches — and a page that pasted
/// one in would bury the row it belongs to. A silent truncation would be worse:
/// a reader comparing two renderings that differ only past the cut would see
/// them as identical, which is the "check whose subject is chosen by the check"
/// shape this repo keeps finding. So the cut is marked and the full length is
/// printed with it.
let private shown (value: 'input) : string =
    let text = sprintf "%A" value
    let oneLine = text.Replace("\n", " ").Replace("\r", "")
    if oneLine.Length <= 160 then oneLine
    else sprintf "%s… (%d chars)" (oneLine.Substring(0, 160)) oneLine.Length

/// Erase the input type so the check can join a suite.
///
/// The two extra thunks close over the SAME predicate and the SAME inputs `run`
/// uses. They are not a second copy of the check: `onMustFail ()` is literally
/// the second half of `run`'s match, exposed so a reader can trigger it alone.
/// A page that re-implemented "apply the predicate to the counterexample" would
/// be a page that could disagree with the suite.
let seal (c: Check<'input>) : Sealed =
    Sealed(
        c.Name,
        (fun () -> run c),
        (fun () -> c.Predicate c.MustHold),
        (fun () -> c.Predicate c.MustFail),
        shown c.MustHold,
        shown c.MustFail)

// --- reading a sealed check, for a renderer ---------------------------------
//
// Projections OUT. None of them is a way back in: there is no function anywhere
// taking these values and producing a `Sealed`, a `Row` or a `Gate`, so the
// construction guarantees at the top of this file are exactly as strong as they
// were before the page existed.

let sealedName (Sealed(name, _, _, _, _, _)) = name

// There is deliberately NO `sealedRun`. It existed for one afternoon and was
// removed the same day: a renderer using it ran every predicate a second time
// and showed that second verdict beside a gate built from the first. `runRows`
// is the only source of `Row`, so the only honest way to label a row is to read
// the run that produced the gate — `rowPairs` below.

/// Apply the predicate to the input that must hold. `true` is correct.
let sealedOnMustHold (Sealed(_, _, holds, _, _, _)) = holds ()

/// Apply the predicate to the input that must fail. `false` is correct, and a
/// reader watching this return false is the whole point of the surface.
let sealedOnMustFail (Sealed(_, _, _, fails, _, _)) = fails ()

let sealedShownMustHold (Sealed(_, _, _, _, shownHold, _)) = shownHold
let sealedShownMustFail (Sealed(_, _, _, _, _, shownFail)) = shownFail

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

// --- the gate: how row verdicts COMBINE -------------------------------------
//
// Everything above is about ONE check. This is about the other half, and it is
// the half the README's failure table is mostly made of: correct about every
// row, wrong about how they combine.
//
// `scripts/confidence.mjs` scored `earned / possible` until 2026-08-10, so a
// failing row was affordable whenever enough other rows passed, and every row
// ADDED made the next failure cheaper:
//
//     the same 10-point row failing, at different suite sizes
//     120 pts -> 92   blocked
//     190 pts -> 95   PASSES
//     225 pts -> 96   PASSES
//
// At 225 points TEN of seventeen rows could fail alone and still clear the bar,
// including "build is clean" and "decoders still REJECT the corrupted fixture".
// No commit introduced that. Growing the suite weakened it.
//
// It is fixed in JavaScript, and the fix is a line — `if (failedRows.length > 0)
// … process.exit(1)`. Nothing in that language stops the next edit turning it
// back into an average, and nothing did stop it the first time: the average was
// there from the start and survived every review the file got.
//
// So the question this repo exists to ask, applied to itself: can the average be
// made UNWRITABLE rather than merely fixed?
//
// WHAT IS AND IS NOT GUARANTEED — stated before the code, same as above.
//
//   GUARANTEED BY THE COMPILER. Outside this module a passing gate cannot be
//   manufactured. `Passing`'s case is private, so `Passed` has no reachable
//   argument; `Row`'s case is private, so a caller cannot hand `decide` a list
//   of fabricated Held rows; and `Score` cannot become a `Gate`, because no
//   function in this module maps one to the other. A caller holding a 96% score
//   and a strong opinion has nothing to do with either.
//
//   NOT GUARANTEED BY THE COMPILER. That `decide` itself stays a conjunction.
//   It is eleven lines inside this module and an edit could make it an average
//   tomorrow. No type prevents that, in any language. What the types do is
//   collapse the surface from "every caller, forever" to one function that
//   docs/CHECK-PROOF.md compiles violations against — which is a smaller thing
//   to guard, not an eliminated one.
//
// Saying that plainly is the point. The previous proof document in this repo
// claimed more than it held, and this file's own header exists because of it.

/// One row's outcome, tied to the check that produced it.
///
/// The case is private, and that is the load-bearing part. `Verdict`'s cases are
/// public — they have to be, the suite reads them — so if `decide` took a plain
/// `(string * Verdict) list` then `decide [ "everything", Held ]` would compile
/// and would be a passing gate built from nothing at all. The only way to obtain
/// a `Row` is to RUN a `Sealed` check.
type Row = private Row of name: string * verdict: Verdict

/// Proof that a gate had no failing row.
///
/// Private case, so this value cannot be built from a number, a percentage, a
/// majority, or a conviction. `decide` is the only thing that can mint one, and
/// it mints one only when the failing list is empty.
type Passing = private Passing of rowsHeld: int

/// A gate's decision.
type Gate =
    /// Every row held. The witness says how many, and cannot be forged.
    | Passed of Passing
    /// At least one row did not. Carries WHICH — a count could not name the
    /// invariant that is off, and `scripts/gate-checks.mjs` has the scar to
    /// prove it: a row failed after fourteen minutes and reported nothing but
    /// its own name, which is a shrug rather than a signal.
    | Blocked of failing: (string * Verdict) list

/// A percentage, for reporting only.
///
/// It exists because the CC-CMD ceremony asks for a number, and it decides
/// nothing. There is deliberately NO function from `Score` to `Gate` anywhere in
/// this module, and adding one is the single edit that would undo this file.
type Score = private Score of held: int * total: int

/// Run every check in a suite. The only source of `Row` values.
let runRows (suite: Sealed list) : Row list =
    suite |> List.map (fun (Sealed(name, go, _, _, _, _)) -> Row(name, go ()))

/// The conjunction. Every row, not a passing average.
let decide (rows: Row list) : Gate =
    let failing =
        rows
        |> List.choose (fun (Row(name, verdict)) ->
            if verdict = Held then None else Some(name, verdict))
    match failing with
    | [] -> Passed(Passing(List.length rows))
    | bad -> Blocked bad

/// A row's name and what it did.
///
/// The projection a renderer needs, and the reason it exists rather than the
/// renderer re-running each check: `runRows` is the ONLY source of `Row`, so a
/// page that called `sealedRun` again for the pill beside each name would be
/// running every predicate twice and displaying the SECOND result beside a gate
/// built from the first. Two runs cannot disagree today — nothing in this suite
/// is nondeterministic — and "cannot disagree today" is the shape of claim this
/// repo keeps having to retract. One run, read twice.
///
/// It is not a way back in. `Row`'s case stays private and there is no function
/// anywhere from a pair to a `Row`, so `decide [ "everything", Held ]` is as
/// impossible as it was.
let rowPairs (rows: Row list) : (string * Verdict) list =
    rows |> List.map (fun (Row(name, verdict)) -> name, verdict)

let heldCount (Passing n) = n

let score (rows: Row list) : Score =
    let held = rows |> List.filter (fun (Row(_, v)) -> v = Held) |> List.length
    Score(held, List.length rows)

let percent (Score(held, total)) = if total = 0 then 0 else (held * 100) / total

/// The exit code, derived from the decision and never from the score.
let exitCode (gate: Gate) : int =
    match gate with
    | Passed _ -> 0
    | Blocked _ -> 1

/// Run a suite, print it, and return the DECISION.
let runGate (title: string) (suite: Sealed list) : Gate =
    printfn ""
    printfn "%s" title
    printfn ""
    let rows = runRows suite
    rows
    |> List.iter (fun (Row(name, verdict)) ->
        printfn "%-9s %s" (verdictLabel verdict) name
        if verdict <> Held then printfn "          → %s" (verdictDetail verdict))
    let gate = decide rows
    let (Score(held, total)) = score rows
    printfn ""
    printfn "%d/%d checks held" held total
    match gate with
    | Passed _ -> ()
    | Blocked bad ->
        // Printed AFTER the fraction and phrased so the fraction cannot be read
        // as the verdict. `confidence.mjs` learned to do this the same way.
        printfn ""
        printfn "  %d FAILING ROW(S). The %d%% above is not the pass condition —"
            (List.length bad) (percent (score rows))
        printfn "  every row must hold."
    gate

/// Run a suite, print it, and return the number of results that are not `Held`.
///
/// `NoTeeth` counts as a failure and is labelled differently from `Broke`. A
/// harness that folded the two together would report a toothless check as a
/// broken one, and the fix for those is not the same: one means the code is
/// wrong, the other means the check is worthless.
let runAll (title: string) (suite: Sealed list) : int =
    match runGate title suite with
    | Passed _ -> 0
    | Blocked failing -> List.length failing
