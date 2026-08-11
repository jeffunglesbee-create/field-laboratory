# The harness, in F# — 2026-08-11

Jeff:

> Build the check harness in F# and prove it. And this brings up an important
> point, everything should be built In F# in laboratory.

The previous commit's README says on verification this repo's F# has no record,
because its author reached for JavaScript every time verification was the
problem. This is the first entry against that.

## What was built

`src/Verify.fs`. A check carries an input that MUST hold and an input that MUST
fail, and there is no way to write one that does not.

```fsharp
type Check<'input> =
    private
        { Name: string; Predicate: 'input -> bool
          MustHold: 'input; MustFail: 'input }

type Sealed = private Sealed of name: string * run: (unit -> Verdict)
```

`Verdict` is `Held | Broke | NoTeeth`. `NoTeeth` is the outcome the file exists
for: the predicate held on the input that was supposed to break it, so the check
passing says nothing.

The chain is closed. Fields private, so the only constructor is `create` with
four arguments. `Sealed`'s case private, so the only way into a suite is `seal`
on a real `Check` — a bare bool cannot enter, which is the entire signature of
`scripts/checks.mjs`.

## What it does NOT guarantee, said before the evidence

`Verify.create "positive" (fun n -> n > 0) 1 2` compiles. Whether `2` fails the
predicate is a runtime question and no type decides it.

So: **the shape is a compile error, the content is a runtime failure.** More than
JavaScript enforces, less than "a toothless check is unwritable". Writing it the
other way would be this repo's oldest mistake — `AMNESTY-PROOF.md` claiming a
seal was complete while the arc was still open.

Both halves are executable. Neither is prose.

## The compile half

`docs/CHECK-PROOF.md`, seven cases, each injected into a real source file and
built, passing only if the build fails with the stated code. `proof-check` picks
up new `*-PROOF.md` automatically, so it needed no registration.

| Case | Refused with |
| --- | --- |
| assembling a `Check` field by field | FS1093 |
| `create` with three arguments, as a `Check` | FS0001 |
| the same, sealed into a suite | FS0001 |
| a bare `bool` in a `Sealed list` | FS0001 |
| fabricating `Sealed("looks fine", fun () -> Held)` | FS1093 |
| reading `.MustFail` back out | FS1093 |
| a `Verdict` match missing a case | FS0025 |

`proof-check` went 18/18 to **25/25**.

## The runtime half

`src/VerifyMain.fs` runs under node from the Fable output. Two phases, and the
order is the point: the harness's self-test runs FIRST, and the suite is skipped
entirely if it fails. Every detector in this repo needed that — blind
`mutation-check` and all 32 mutations pass; blind `row-confidence` and all 21
rows score 100 — and a harness whose whole claim is "a toothless check is caught"
reporting 16/16 would otherwise mean only that it ran.

The self-test asserts `create "positive" (fun n -> n > 0) 1 2` comes back
`NoTeeth`, that `fun _ -> true` comes back `NoTeeth`, that `runAll` COUNTS both
bad outcomes rather than only printing them, and both ordinary directions.

`src/Suite.fs` is sixteen real checks ported from the JavaScript ones. Not new
assertions — existing claims restated with the counterexample made compulsory,
and in most cases **the counterexample is the bug this repo shipped**:

- the ET day at 00:30 UTC, with the UTC answer written down as the must-fail —
  `zone-check.mjs` was 16/16 green while a broken fixed-offset build passed 11/11
- `Sydney v Collingwood`, with `Collingwood @ Sydney` as the must-fail
- the score ordering, with the transposition that arrived *with* that fix
- a drawn game yielding no verdict
- `devig` on the real market, with a reversed favourite as the must-fail

## The harness found two things on its first run

**One in the suite.** I wrote "an absent start time is not read as 'already
started'" asserting `Scheduled`. It failed immediately. `notYetStartedAt` is
documented as returning false for an absent start time — *"an unknown start time
is not evidence that a game has not begun"* — so reading a missing field as "not
started" is the guess that rule exists to refuse. The check now states the rule
instead of my assumption about it. Fifteen passed and the sixteenth was mine.

**One in my own first draft.** I wrote "toPct and toProb are inverses" and left
the counterexample for later. There isn't one: the round trip holds for every
finite float, so the predicate is true of anything. In JavaScript that is a
green check forever. Here it would have come back `NoTeeth`, and the claim with
actual content — that the scale is exactly 100 — has a counterexample that can be
written down, a missing factor of ten.

That second one is the whole argument in one line. The old harness would have
accepted it, reported PASS, and been wrong in a way nothing could see.

## Two mutations, both directions

- `harness-accepts-toothless` — `| true, true -> Held`. Killed.
- `harness-calls-everything-toothless` — `| true, false -> NoTeeth`. Killed.

The second exists because the first alone would be satisfied by a harness that
called *everything* toothless, which is the one-directional failure arriving
inside the thing built to prevent it.

Gate row `the F# harness refuses a check with no counterexample`, weight 20:
detection is lost, which is what a toothless check costs. Twenty-one rows now.

## On "everything should be built in F#"

Agreed, and this is one file's worth of it, not the thing itself. `scripts/` is
still 4,900 lines of JavaScript. What is now true is that the pattern exists and
is proven, so the rest is porting rather than designing.

Honest order, cheapest and most valuable first — the pure ones move directly onto
`Suite.fs`: `pickem-check`, `state-check`, `units-check`, `zone-check`,
`pick-check` and `spark-check` are all pure functions over committed captures.
The ones that shell out, drive a browser or read git — `mutation-check`,
`history-check`, `workflow-check`, `status.mjs` — need Fable bindings for
`child_process` and `fs` first, and that is a real piece of work rather than a
port. It is also where the interesting question sits, because those are exactly
the files every failure in the README's table came from.

CONFIDENCE: 96.

Artifacts: `proof-check` 25/25 with the seven new rejection cases named above;
`node build/VerifyMain.js` 16/16 after the self-test passes, exit 0; both new
mutations killed; `check:rows` 21/21; `check:workflows` 6/6; `check:gate-rows`
7/7; the gate at 480/480 across twenty-one rows, nothing skipped.

Docked four: `VerifyMain.js` has not run on a runner. The step is new in
verify.yml and the run that exercises it is the one this commit triggers — the
same gap as the last commit, still open, and named rather than talked around.
