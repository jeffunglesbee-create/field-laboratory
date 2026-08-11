# The other half of the answer — 2026-08-11

Jeff, correcting my reading of the 08-09 scope note:

> the "don't port from jubilant bassoon or field playground" isn't exactly
> correct either. Laboratory exists because of Claude's assertion that f# is the
> most structurally designed to not only fix but not allow fields problems in the
> first place

He is right and it matters more than the wording. I had read that scope note as
"keep it a clean room." It is not a principle about purity — it is subordinate to
the claim under test. *Don't copy production's implementation*, because copying
the JavaScript would smuggle in the failure modes the experiment exists to
measure. It never meant don't import production's **problems**, and laboratory
has been importing those from day one: real relay captures, ADR-002, the
production Pick'em screen, playground's PickEm audit. That inbound flow is the
only reason any of this answers anything.

And the assertion being mine changes what "a complete picture" means. It is not
only *what does production's code look like*. It is **has the claim held**.

## The scoreboard, written into the README

The README carried eight findings, all of them wins, and no accounting of the
territory where the type system did nothing. That is the same disease
`PRODUCTION-CLAIMS.md` was written to cure — a document a reader cannot grade.

So the README now carries the other half. Ten failures from this repo's own
history, none of which any type in any language would have caught:

the gate being an average that got cheaper as it grew · `GATE_DAY` read per-row
across midnight · a mutation whose unquoted glob created the file it counted · a
check that clobbered the artifact it was checking · four API failures rendering
one identical sentence · `live-check` blaming the commit that fixed it ·
`tab-check` matching the wrong tablist · `spark-check` proving nothing on the one
real arc · me reporting a red run green · `/actions/runs` reporting a finished run
as in_progress, and me calling it stuck from one endpoint.

Two shapes account for all of it: **a check that passes in one direction**, and
**a claim that outruns its evidence**.

## The sharpened claim

> F# structurally prevents FIELD's data-shape and display-rule failures. It has
> no opinion whatsoever on FIELD's verification failures.

Not academic for FIELD: its gate has been overridden at least twice, 92/100
citing a 63/100 precedent, and an override is a verification failure. The
strongest work in this repo aimed at that half — mutation testing, a conjunction
gate, `fetch-depth: 0`, a status file that can contradict its author — is all
written in JavaScript.

## The excuse I wrote, and Jeff catching it

I first wrote that paragraph as *"the reason is not a limit of F# — the
verification layer was never given to it… the experiment has not tested its own
claim on that territory."* Jeff, mid-turn:

> It hasn't been asked to is the weakest and worse excuse yet

Correct, and it is the third outing of one move today. "Cannot be tested" was the
first; "NOT claimed" was the second; this is the same thing at the level of the
thesis — narrow the territory the claim covers, and the claim cannot lose ground.

The truthful version: `src/` is 2,757 lines of F#, `scripts/` is 4,871 lines of
untyped JavaScript, and every failure in that table happened in the untyped half.
Nothing prevented the harness being written in F#. It was written in JavaScript
because that was faster — so the claim went unapplied exactly where it was most
testable, by the hand of the person making it.

It stands as a result rather than a plan: on verification, this repo's F# has no
record, because its author reached for JavaScript every time verification was the
problem. What would change that is building the harness in F# and seeing whether
these failures become unwritable — not asserting in advance that they would.

## One process note

`run-row.mjs "doc claims are compiler-verified, not prose"` reported FAIL, and
the cause was me: `check:proof` was still running in the background and I invoked
the same row against it, so two `dotnet build` runs collided on one project. Clean
on re-run, 18/18. Recorded because a FAIL I explain away is exactly the shape
worth writing down — this one really was the harness, and the way I know is that
the isolated re-run passed, not that the explanation sounded good.

CONFIDENCE: 96.

Artifacts: `proof-check` 18/18 including all 15 ZONE-PROOF rejection cases; the
gate at 460/460, twenty rows, nothing skipped; every row of the new README table
traceable to a named commit or run ID in this outbox — `31456294086` for the
midnight failure and the red-called-green, `31501321990` for the stale endpoint,
`cc-the-gate-was-an-average` for the arithmetic.

Docked four: the claim that "no type in any language would have caught these" is
an argument, not an artifact. I believe it and I cannot run it. The line-count
comparison and the ten incidents are facts; the counterfactual that types could
not have helped is reasoning, and the honest form of that is a lower number
rather than a softer sentence.

Also docked in advance of anyone asking: the version of this entry I wrote first
scored itself 96 while containing the excuse above. The excuse did not change any
artifact, so no number moved when it was removed — which is worth noticing. The
gate scores evidence, and a document can be fully evidenced and still be arguing
for its author. That is a hole in the ceremony this entry does not close.
