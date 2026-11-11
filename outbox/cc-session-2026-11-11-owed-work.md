# Session 2026-11-11 — the work owed from the 2026-11-03 to 2026-11-10 sessions

Session: https://claude.ai/code/session_017RuhXKQdbuZ7W9Q7sR1Vrm

"What work is owed?" was answered by probing the actual state, not from memory. Five items; the owner said "fix them" for the first three.

| # | item | state found 2026-11-11 | done |
|---|---|---|---|
| 1 | `fable-crash-probe.yml` (and `mutation-ids-probe.yml`) pipe a measuring step into `tee` with no `pipefail`: a failed step reads green | still true on `main`: 9 steps in 5 workflows have it (`outbox/unguarded-pipes-2026-11-11.txt`); 3 are mine | see the next section |
| 2 | `docs/GATE-TIMING.md` heading said "the gate is 6 minutes" | stale: the latest scored gates took 2385 to 2705 s (the mutation row grew) | heading now says it was 6 minutes that day and points at the sections above |
| 3a | `proof-check` baseline build and controls have no crash repeat | still true (only the batch repeats) | added as row D5 of `docs/CC-CMD-2026-11-06-gate-residuals-remaining.md` (BUILD-ON-A: that is the open CC-CMD for proof-check residuals), with 5 of 5 scored gates since batching as the evidence and its trigger |
| 3b | `proof-check` signal handlers cannot run during a synchronous build | **resolved by another session, and my report of it as open was wrong**: Task 7 of `docs/CC-CMD-2026-11-03-gate-hazard-residuals.md` removed the handlers (a plain kill stops the run, the next run heals); `livenessOf`, the other stale pointer, is gone too | nothing owed |
| 4 | file the Fable issue | the owner's click; not visible from here | unchanged |
| 5 | the three MLS rows with no BSD event | taken on by the relay's 2026-11-07 lineup-join session (`outbox/cc-session-2026-11-07-lineup-join-and-fa-cup.md` names 2026-10-24, 10-31 and 11-05 as dates holding an unmatchable row); not re-probed here | not mine |

## A finding the check turned up, filed

Counting the steps for item 1 found that the trap is wider than my workflows: **9 `run:` steps of 337 (30 pipe into `tee`) carry nothing that preserves the left side's exit status**, and `scripts/workflow-check.mjs` has no check that would say so. Filed as `docs/CC-CMD-2026-11-11-workflow-pipes-into-tee.md` (FILED, unblocked, not started: the owner's go covered my own two workflows, and this touches four others and a shared guard). Method and output: `outbox/find-unguarded-pipes-2026-11-11.mjs`, `outbox/unguarded-pipes-2026-11-11.txt`.

## Item 1, fixed: the three unguarded steps in my own probe workflows

`fable-crash-probe.yml` ("50 builds", "The table") and `mutation-ids-probe.yml` ("What the driver said about each id") now end with `exit ${PIPESTATUS[0]}`. Nothing else in them changed (diff: 10 lines added, 1 changed). `node outbox/find-unguarded-pipes-2026-11-11.mjs .` goes from 9 steps to 6, and the six are other workflows' (`docs/CC-CMD-2026-11-11-workflow-pipes-into-tee.md`).

Premise checked before the comment saying it went into the workflow: a measured build crash does not make the probe script exit non-zero (`scripts/fable-crash-probe.mjs` records it and exits 0; its only non-zero exits are a usage error, 2, and a throw), so the fix changes the outcome only when the script itself fails.

Artifact: `outbox/pipe-fix-proof-2026-11-11.mjs`, its output `outbox/pipe-fix-proof-2026-11-11.txt`. Each step's `run:` text before the change (`git show origin/main:`) and after is run under `bash -e` with `node` replaced by a shim that exits 3: **before, all three steps exit 0 (green over a failed script); after, all three exit 3**; with a shim that exits 0 all six runs exit 0. Rule 90: with the three exit lines deleted in a copy the harness goes red (3 of 3 not as expected, exit 1); with the real fix it is green. This is the shell behaviour of the step, not a run on Actions.

## Gate for item 1

`verify-full` run 42947403479 on the branch tree `aa71d3a` (dispatched 2026-11-11T02:38Z, 39 min 20 s): **530/530**, `failing: []`, ledger `aa71d3a164ab-8ded4ed83eda`, gate step 2258 s, the proof row 20 s (batched: 14 to 28 s in every scored gate since). `main` did not move between the branch base (`a6b282a`) and the landing, so the landing is a fast-forward of the branch; this note's commit is its head, so that `verify` runs on it (the gate's own ledger commits carry the skip directive and would have suppressed it).

