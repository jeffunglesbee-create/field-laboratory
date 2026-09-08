module SuiteView

open Browser.Types
open Browser
open Fable.Core
open Fetch

// The Verify panel: the 146-row F# suite, on the page, with the counterexample
// that gives each row its teeth.
//
// WHY THIS IS THE SURFACE THIS REPO SHOULD HAVE HAD FIRST
//
// Every dashboard on the internet can show a green badge. What this repo has
// that they do not is `Verify.fs`: a check cannot be DECLARED without an input
// that must fail, so "146 passed" here means something structurally different
// from "146 passed" anywhere else. That difference was invisible — the suite ran
// under node, printed to a terminal, and landed in an outbox file, while a
// visitor to the laboratory saw a scoreboard.
//
// So the claim is not made, it is shown. Every row carries the input that must
// fail, and a reader can FEED it to the predicate and watch a false come back.
//
// TWO PHASES, AND THE ORDER IS THE ARGUMENT — the same order `VerifyMain` uses
// under node, for the same reason. Phase 1 hands the runner a check that is
// toothless on purpose and shows it caught. A suite whose harness has been shown
// blind is not evidence of anything, so a page reporting one would be a green
// light standing in for evidence. Phase 2 is the real suite.
//
// WHAT IS NOT CLAIMED. That a row's subject is worth checking. The harness
// proves a check CAN fail; whether it asks the right question is a human's
// judgement and no type reaches it.

let private el (tag: string) (className: string) (text: string) : HTMLElement =
    let node = document.createElement tag
    if className <> "" then node.className <- className
    if text <> "" then node.textContent <- text
    node

let private child (parent: HTMLElement) (node: HTMLElement) =
    parent.appendChild node |> ignore
    node

/// The three verdicts, as a word and a class.
///
/// Total over `Verify.Verdict`, and FS0025 is an error in this project, so a
/// fourth verdict added to `Verify.fs` is a compile error here rather than a row
/// that renders blank. NO TEETH is styled apart from both others deliberately:
/// it is neither a pass nor an ordinary failure, and the whole file exists for
/// it.
let private verdictOf (v: Verify.Verdict) : string * string =
    match v with
    | Verify.Held -> "held", "sv-verdict--held"
    | Verify.Broke -> "broke", "sv-verdict--broke"
    | Verify.NoTeeth -> "no teeth", "sv-verdict--noteeth"

// --- phase 1: the harness, shown catching a blind check ----------------------

/// Three checks built here and run in the browser, one per verdict.
///
/// CONSTRUCTED, not described. `"a check that also holds on its counterexample
/// reports NO TEETH"` as a sentence is the prose this repo distrusts; as three
/// `Verify.create` calls whose verdicts are read back live, it is the runner
/// demonstrating itself on the page the reader is looking at.
let private selfTestRows () =
    [ "a genuine check holds",
      Verify.run (Verify.create "positive" (fun n -> n > 0) 1 -1),
      Verify.Held
      "a check whose counterexample ALSO passes has no teeth",
      Verify.run (Verify.create "vacuous" (fun _ -> true) 1 2),
      Verify.NoTeeth
      "a check that fails its own must-hold input breaks",
      Verify.run (Verify.create "never" (fun _ -> false) 1 2),
      Verify.Broke ]

let private renderSelfTest (mount: HTMLElement) =
    let section = child mount (el "section" "sv-selftest" "")
    child section (el "h3" "sv-selftest__title" "First, the runner") |> ignore
    child section
        (el "p" "sv-selftest__what"
            "Three checks built and run in this browser, one per outcome. The middle one is \
             toothless on purpose. A suite whose runner has been shown blind is not evidence \
             of anything, so this comes before the 146 below rather than after them.")
    |> ignore
    let rows = child section (el "div" "sv-selftest__rows" "")
    let mutable agreed = 0
    for (label, got, expected) in selfTestRows () do
        let row = child rows (el "div" "sv-selftest__row" "")
        let word, cls = verdictOf got
        let pill = child row (el "span" ("sv-verdict " + cls) word)
        pill.setAttribute ("data-verdict", word)
        child row (el "span" "sv-selftest__label" label) |> ignore
        if got = expected then agreed <- agreed + 1
        else row.setAttribute ("data-disagrees", "true")
    let line = child section (el "p" "sv-selftest__verdict" "")
    line.setAttribute ("data-agreed", string agreed)
    line.textContent <-
        if agreed = 3 then
            "The runner told all three apart. The suite below is read on that basis."
        else
            sprintf "THE RUNNER AGREED ON %d OF 3. Nothing below can be trusted until that is fixed."
                agreed

// --- phase 2: the suite ------------------------------------------------------

/// One row, and the demonstration folded into it.
///
/// The two buttons run the REAL predicate against the REAL inputs — they are
/// `Verify.sealedOnMustHold` and `sealedOnMustFail`, which close over the same
/// predicate `run` uses. A page that re-implemented "apply the predicate to the
/// counterexample" would be a page that could disagree with the suite.
///
/// Nothing runs until the reader asks. The result is what they caused, not a
/// number that was already on screen when they arrived.
let private renderRow (mount: HTMLElement) (index: int) (c: Verify.Sealed, verdict: Verify.Verdict) =
    let name = Verify.sealedName c
    let word, cls = verdictOf verdict

    let row = child mount (el "details" "sv-row" "")
    row.setAttribute ("data-verdict", word)
    row.setAttribute ("data-row", string index)

    let head = child row (el "summary" "sv-row__head" "")
    let pill = child head (el "span" ("sv-verdict " + cls) word)
    pill.setAttribute ("data-verdict", word)
    child head (el "span" "sv-row__name" name) |> ignore

    let body = child row (el "div" "sv-row__body" "")

    // The counterexample, printed whether or not anyone presses anything. A
    // reader who never expands a row still learns that one exists; a reader who
    // does can watch it work.
    let inputs = child body (el "dl" "sv-inputs" "")
    child inputs (el "dt" "sv-inputs__term" "must hold") |> ignore
    child inputs (el "dd" "sv-inputs__value" (Verify.sealedShownMustHold c)) |> ignore
    child inputs (el "dt" "sv-inputs__term" "must fail") |> ignore
    let ce = child inputs (el "dd" "sv-inputs__value sv-inputs__value--counterexample"
                              (Verify.sealedShownMustFail c))
    ce.setAttribute ("data-counterexample", "true")

    let controls = child body (el "div" "sv-run" "")
    let result = child body (el "p" "sv-run__result" "Nothing has been fed to this predicate yet.")
    result.setAttribute ("data-fed", "none")

    let feed (label: string) (expected: bool) (go: unit -> bool) =
        let button = child controls (el "button" "sv-run__button" label)
        // Inside no form, but stated anyway: the default is `submit`, and a
        // future wrapper would make every one of these navigate.
        button.setAttribute ("type", "button")
        button.addEventListener ("click", fun _ ->
            let got = go ()
            result.setAttribute ("data-fed", (if expected then "must-hold" else "must-fail"))
            result.setAttribute ("data-returned", (if got then "true" else "false"))
            result.setAttribute ("data-as-expected", (if got = expected then "true" else "false"))
            result.className <-
                if got = expected then "sv-run__result sv-run__result--expected"
                else "sv-run__result sv-run__result--surprising"
            result.textContent <-
                if got = expected then
                    sprintf "Fed the input that %s: the predicate returned %b. That is the answer this row claims."
                        (if expected then "must hold" else "must fail") got
                else
                    sprintf "Fed the input that %s: the predicate returned %b, and this row claims %b."
                        (if expected then "must hold" else "must fail") got expected)

    feed "feed it the input that must hold" true (fun () -> Verify.sealedOnMustHold c)
    feed "feed it the counterexample" false (fun () -> Verify.sealedOnMustFail c)

let private renderGroup (mount: HTMLElement) (startIndex: int) (title: string)
                        (rows: (Verify.Sealed * Verify.Verdict) list) =
    let section = child mount (el "section" "sv-group" "")
    section.setAttribute ("data-group", title)
    let header = child section (el "header" "sv-group__head" "")
    child header (el "h3" "sv-group__title" title) |> ignore
    child header (el "p" "sv-group__count" (sprintf "%d checks" (List.length rows))) |> ignore
    let body = child section (el "div" "sv-group__rows" "")
    rows |> List.iteri (fun i c -> renderRow body (startIndex + i) c)
    startIndex + List.length rows

// --- the panel ---------------------------------------------------------------

let renderIdle (mount: HTMLElement) =
    mount.innerHTML <- ""
    let panel = child mount (el "div" "sv-panel" "")
    child panel (el "h2" "" "Verify") |> ignore
    child panel (el "p" "sv-idle" "Loading the captures the suite runs on…") |> ignore

let renderError (mount: HTMLElement) (message: string) =
    mount.innerHTML <- ""
    let panel = child mount (el "div" "sv-panel" "")
    child panel (el "h2" "" "Verify") |> ignore
    let p = child panel (el "p" "sv-error" message)
    p.setAttribute ("data-state", "error")

/// Render the whole panel. Fixtures must already be loaded.
///
/// THE SUITE RUNS EXACTLY ONCE. `Verify.runRows` is the only source of `Row`, so
/// the gate must come from it; reading each row's verdict back out with
/// `rowPairs` is what stops the pill beside a name being a SECOND run's answer
/// displayed beside the first run's gate.
let render (mount: HTMLElement) =
    mount.innerHTML <- ""
    let panel = child mount (el "div" "sv-panel" "")

    let groups = Suite.groups ()

    // MEASURED AROUND THE WORK, which the first version was not: it computed
    // `Date.now () - started` as an ARGUMENT to this function, so the subtraction
    // happened before a single check had run and the page said "146 checks ran in
    // this browser in 0ms". A timing claim taken where it cannot see the work is
    // this repo's own recurring defect, printed as a fast number.
    let started = JS.Constructors.Date.now ()
    let ran = groups |> List.map (fun (title, checks) -> title, checks, Verify.runRows checks)
    let elapsedMs = JS.Constructors.Date.now () - started

    let allRows = ran |> List.collect (fun (_, _, rows) -> rows)
    let gate = Verify.decide allRows
    let total = List.length allRows

    let head = child panel (el "header" "sv-head" "")
    child head (el "h2" "sv-head__title" "Verify") |> ignore
    child head
        (el "p" "sv-head__what"
            "Every check below carries an input that MUST hold and an input that MUST fail. \
             That is a compile-time property, not a convention: the record is private, so the \
             only constructor takes both, and a check with no counterexample does not type-check.")
    |> ignore

    renderSelfTest head

    let score = child head (el "p" "sv-head__score" "")
    score.setAttribute ("data-total", string total)
    match gate with
    | Verify.Passed witness ->
        score.setAttribute ("data-gate", "passed")
        score.setAttribute ("data-held", string (Verify.heldCount witness))
        score.className <- "sv-head__score sv-head__score--passed"
        score.textContent <-
            sprintf "%d of %d held. Every row, not a passing average — the gate is a conjunction \
                     and there is no function anywhere from a percentage to a pass."
                (Verify.heldCount witness) total
    | Verify.Blocked failing ->
        score.setAttribute ("data-gate", "blocked")
        score.setAttribute ("data-held", string (total - List.length failing))
        score.className <- "sv-head__score sv-head__score--blocked"
        score.textContent <-
            failing
            |> List.map (fun (name, v) -> sprintf "%s (%s)" name (fst (verdictOf v)))
            |> String.concat "; "
            |> sprintf "BLOCKED. %d of %d held; these did not: %s" (total - List.length failing) total

    let timing = child head (el "p" "sv-head__timing" "")
    timing.setAttribute ("data-elapsed-ms", string (int elapsedMs))
    timing.textContent <-
        sprintf "%d checks ran in this browser in %dms. Nothing here is a recorded result."
            total (int elapsedMs)

    let body = child panel (el "div" "sv-groups" "")
    body.setAttribute ("data-groups", string (List.length groups))
    let mutable index = 0
    for (title, checks, rows) in ran do
        // Zipped, so a row's pill is the verdict of the check printed beside it
        // and not of whatever sits at the same position in another list.
        let paired = List.zip checks (Verify.rowPairs rows |> List.map snd)
        index <- renderGroup body index title paired

// --- loading the captures ----------------------------------------------------

/// Fetch one capture and hand it to `Fixtures`.
///
/// The SAME files the node run reads — `data/*.json`, which `build-site.mjs`
/// copies to `public/data/`. Not a browser-shaped copy of them: a copy is what
/// `Fixtures.fs`'s header refuses, and a second source of truth would let the
/// page report on a payload the terminal never saw.
let private loadOne (path: string) : JS.Promise<Result<unit, string>> =
    promise {
        try
            let! res = fetch ("./" + path) []
            if res.Ok then
                let! text = res.text ()
                Fixtures.load path text
                return Ok()
            else
                return Error(sprintf "HTTP %d for %s" res.Status path)
        with e ->
            return Error(sprintf "%s: %s" path e.Message)
    }

/// Load every capture, then render.
///
/// EVERY path in `Fixtures.paths`, and a failure on any one stops the render. A
/// partial load would throw inside a row instead, which reads as a suite failure
/// rather than a wiring one — and this repo has shipped three blank artifacts on
/// exactly the shape where a missing input looked like a real result.
let load (mount: HTMLElement) : JS.Promise<unit> =
    promise {
        renderIdle mount
        let! results = Promise.Parallel(Fixtures.paths |> List.map loadOne |> Array.ofList)
        let failures = results |> Array.choose (fun r -> match r with Error e -> Some e | Ok() -> None)
        if failures.Length > 0 then
            renderError mount
                (sprintf "The suite's captures did not load, so nothing below would be a real \
                          result: %s" (String.concat "; " failures))
        else
            try
                render mount
            with e ->
                renderError mount (sprintf "The suite threw while running: %s" e.Message)
    }
