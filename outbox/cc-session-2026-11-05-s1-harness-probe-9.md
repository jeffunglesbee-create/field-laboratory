# Session record: the harness clause probes more than one place (stream S1, finding scanner-diff 6)

Rule 67 record for one commit. Date 2026-11-05.

## Reproduction

The clause "the harness: every clock read in it is a capture, and a bare read put after its table is seen" put one bare read at the start of `applyMutation`. On this tree that is a little under three quarters of the way down a file of 10,036 lines; the harness's two real clock reads (`RUN_STARTED_AT`, `BASELINE_AT`, both captures) and everything after the table's end lie past it. Three mutants of the harness were applied and the clause run as it was:

    harness-first-capture-hidden    a block comment opened on the line before RUN_STARTED_AT      exit 0 (survived)
    harness-second-capture-hidden   the same before BASELINE_AT                                   exit 0 (survived)
    harness-end-of-text-hidden      a block comment opened before the last statement of the file   exit 0 (survived)

Each is a place where a scan that had lost its place would see nothing, and the clause could not tell.

The reviewer's other point, that two captured reads pass the clause, is the scorer's documented rule and not changed: reads over captures, and "how many captures a script may have is not limited" (the comment above `nondeterminism`). A third captured read would pass; the clause's label now says so. A limit of one capture would take the harness itself, which captures twice, below the bar, and is a decision for the owner.

## What was built

- The clause splices the same bare read at every place it can name: after the table (as before), before each line of the harness that holds a capture on its own (found by asking the pattern about each line, 2 today), and at the end of the text. Every one must give one read more and the same captures. The label prints the denominator (4 places) and what is not covered.
- Three table entries, each a harness with a construct that hides the scan's place at one of those points: `harness-first-capture-hidden`, `harness-second-capture-hidden`, `harness-end-of-text-hidden`. The last one does not parse; it is only read by the clause.

## Red evidence

Against the clause as it was, the three mutants survive (exit 0, above). With the change each is CAUGHT by this clause: `a bare read was not seen ... at 1 of 3 places: before const RUN_STARTED_AT`, `... before const BASELINE_AT`, `... at the end of the text`. The four harness-clock entries that existed (`harness-reads-the-clock-twice`, `-by-hand`, `harness-anchor-renamed`, `harness-bare-read-after-the-table-unseen`) are still CAUGHT: 8 of 8 through the harness. The self-test is still 26 clauses and takes 0.6 s.
