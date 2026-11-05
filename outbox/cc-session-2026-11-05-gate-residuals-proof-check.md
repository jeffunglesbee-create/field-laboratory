# proof-check follow-ups from the gate-hazard residuals: Tasks 5, 6, 4 with 10.17a, 7, 10.17c

CC-CMD: `docs/CC-CMD-2026-11-03-gate-hazard-residuals.md` (the approved work, Tasks 1 to 10). This stream builds the `scripts/proof-check.mjs` items only; the other items are built by other streams in their own copies.
HEAD at the start: `4eceb98`. Built in a scratch clone with no remote; nothing is pushed from here.

## Why this file exists

`.githooks/pre-commit` runs `check:staged-outbox`, which refuses a commit that stages a path under `scripts/` or `src/` and no path under `outbox/`. This stream was told not to edit the existing outbox files and not to use `--no-verify`, so the one way left to pass the hook is a new file with a name no other stream uses. This is it. It is the Rule 67 session record for these commits, and the owner session can fold it into the merged session document or drop it.

## What was built, one commit per item

Each item: the premise command that was run on this tree before anything was built (Rule 100), what changed, and the red evidence for every new clause and table entry (Rule 90).

### 1. Task 5: the run marker is created exclusively

- Premise command: a dangling link planted at `.proof-state/active.json`. `existsSync` follows the link and finds nothing, so the run classifies `proceed`; the committed script then ran 7 builds and wrote its marker through the link into the link's target. The probabilistic race (two runs begun in the same tick) reached both baselines in 4 of 20 trials in the probe and in 0 of 10 on a re-run the same day on a busy machine, so the plant is the premise and the race stays a probe.
- Changed: the marker write is `{ flag: 'wx' }`; on `EEXIST` the run prints `another run took .proof-state/active.json` and exits 1 before injecting anything. Its exit handler is registered later, so it restores nothing.
- Clause: `A MARKER THAT APPEARS BETWEEN THE CHECK AND THE WRITE IS REFUSED` (1 run, the `EEXIST` branch, in its label). Without the fix the self-test ends 85/86 with only that clause failing; with it, 86/86.
- Entries: `proof-marker-not-exclusive` and `proof-marker-collision-carries-on`, both run through the harness (`--ids`) and both caught.
