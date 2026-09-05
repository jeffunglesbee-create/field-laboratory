# Session — the gate is a decision, not a score

**Date:** 2026-09-05
**Repo:** field-laboratory
**HEAD:** `f04b264` → this commit
**Task:** #27, approved as "all 3 approved" alongside #25 (graph WONTDO) and #26
(the README correction).

## What prompted it

The README's own closing line, unchanged since 2026-08-11:

> What would change that is building the harness in F# and seeing whether the
> failures above become unwritable — not asserting in advance that they would.

Probing before proposing changed the shape of the work twice.

**First:** `src/Verify.fs` already exists. It landed in `ba65230` at 17:24 on
2026-08-11; the README paragraph declaring that this repo's F# "has no record"
on verification is `98d000f`, 16:49 the same day. Thirty-five minutes. The
README then went twenty-five days without naming `Verify.fs` or
`docs/CHECK-PROOF.md` — a negative result kept past the evidence that retired
it. That is handled in the README commit, not here.

**Second:** the average gate is not what `Verify.fs` covers. `Verify.fs` is
about one check having teeth. The average is about how verdicts COMBINE, which
nothing in the F# half touched. So the work was real, and it was a different
piece of work than the one proposed.

## What shipped

Four types in `src/Verify.fs`, all with private cases.

| type | what the private case buys |
|---|---|
| `Row` | the only source is running a `Sealed` check. `Verdict`'s cases are public and must be — the suite reads them — which is exactly why `decide [ "everything", Held ]` has to be unwritable at the `Row` level |
| `Passing` | the witness `Passed` carries. Unbuildable outside the module, so no score, percentage or majority can mint a pass |
| `Gate` | `Passed` carries the witness; `Blocked` names which rows failed, because a count cannot say which invariant is off |
| `Score` | a percentage, for reporting. There is deliberately no function from `Score` to `Gate` anywhere in the module |

`VerifyMain` now exits on the `Gate` rather than on `failures = 0`. That
comparison was correct and was still a number standing where a decision
belongs — one edit from `failures <= 2`, which is how `confidence.mjs` acquired
its average in the first place.

## What is NOT claimed

`decide` itself could be edited into an average tomorrow. No type prevents that
in any language. The surface shrinks from "every caller, forever" to one
function inside one module; it is not eliminated. Both the source comment and
`docs/CHECK-PROOF.md` say so in their own text, before the cases rather than
after them.

Two of the README's ten verification-failure rows are now structural. **Eight
are not**, and they are the ones about the world rather than about the check: a
check that changes as the world moves under it, that changes the world it
measures, that answers about the wrong world, that agrees for the wrong reason,
four API failures rendering one sentence, and both claim-shaped rows.

## Artifacts

**Compiler half — 5 new cases in `docs/CHECK-PROOF.md`, each rejected with the
claimed code and nothing else:**

```
gate cases found: 5
baseline clean: true
PASS  case 1 claims FS1093 — compiler said: error FS1093
PASS  case 2 claims FS0001 — compiler said: error FS0001
PASS  case 3 claims FS1093 — compiler said: error FS1093
PASS  case 4 claims FS1093 — compiler said: error FS1093
PASS  case 5 claims FS0025 — compiler said: error FS0025

5/5 gate cases rejected as claimed
```

**Runtime half — `node build/VerifyMain.js`, exit 0:**

```
PASS      a suite where every row holds Passes
PASS      the passing witness counts the rows it saw
PASS      NINE OF TEN IS BLOCKED, and the score says 90
PASS      a blocked gate names the row that failed
PASS      the exit code comes from the decision, not the score
PASS      an empty suite passes with a witness of zero, not of one

  self-test: the harness can still tell the difference
110/110 checks held
```

**Mutation, both directions (Rule 90 — a check that has only ever passed has
proven nothing):**

| mutation | result |
|---|---|
| `decide` returns `Passed` at ≥90% | 3 self-test assertions red, exit 1 |
| `Passing`'s case made public | case 1 compiles cleanly, 4/5 |

Both restored.

## A defect in this session's own measuring apparatus

The five-case result above is the **second** run. The first reported 5/5 as
well, and it was worthless.

`scripts/proof-check.mjs` was still running in the background — it injects into
`src/Scoreboard.fs` and restores on exit — and a `kill` that did not take
effect let it re-inject after the tree had been restored. The five-case harness
then read that dirty file as its baseline, reported `baseline clean: false`,
**and ran anyway**. Every case built against a tree that already had errors, so
every case "failed to build" partly for reasons that had nothing to do with it:
the first run's output carried a stray `error FS0001` alongside four of the
five claimed codes, and the clean run carries the claimed code alone.

The harness now refuses on a dirty baseline instead of reporting one. That is
the same fix `proof-check.mjs` already had — its `baselineClean` check exists
for exactly this — reproduced by a script written to be quicker than it.

The count for this session is therefore one product defect (`sealedName` left
without a consumer, caught by `unused-check`) and one apparatus defect (a
harness that reported a state it had already measured as untrustworthy). Same
ratio as 2026-09-05's provenance work in the relay, and the same shape.

## Why the five-case harness exists at all

`proof-check.mjs` runs 57 cases, each a full `dotnet build`. In this
environment it accumulates roughly two and a half minutes of runtime per
session turn, so it does not finish. The five new cases were verified directly
instead — a subset, stated as a subset here per Rule 91 — and the full suite is
CI's job on this commit.

## Carry-forwards

None. The three approved items are done: this, the README correction, and
`outbox/decision-2026-09-05-laboratory-no-graph-tool.md`.
