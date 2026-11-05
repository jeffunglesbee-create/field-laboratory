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

### 2. Task 6: a torn file is asked about per file, and before the heal

- Premise command: planted state through the real script. A target cut off before its anchor beside a registry that carries the run's probe (no `restoreFailed` in the marker) printed `HEALED` for the registry, and the state, which held the only whole target, was deleted (`state left: false`). The mirror, which the CC-CMD does not mention, was the same: a registry cut off before its last case beside a stranded target was healed and the state deleted. Only the target had an `anchored` input to the classifier. Control: the same torn target with `restoreFailed: true` already kept the state.
- Changed: `classifyState` takes `registryAnchored` as a required input (no default), and the check `a file that is not provably the injection and has no anchor is diverged` now comes before the heal, per file; the closing `return anchored ? 'stale' : 'diverged'` is `return 'stale'`. The main flow hands over `currentRegistry.includes(REGISTRY_ANCHOR)`. The diverged message names a torn file (`has no injection anchor`, `has no last case`). The generic `reasons.length === 0` fallback is gone: every way to be diverged now names a file, so the fallback could not run and no clause could fail it.
- Clauses (86 to 90): one classifier clause over 5 inputs and three real-script clauses (target cut off beside a stranded registry, registry cut off beside a stranded target, registry cut off over nothing stranded), each one planted state, said so in its label. All four fail with the production change taken out of the script and the clauses kept (86/90) and pass with it (90/90).
- Entries: two re-anchored (`proof-marker-heals-a-clean-tree` and `proof-marker-calls-a-torn-target-clean`, whose finds were the line this change rewrites) and five new (`proof-heal-ignores-a-torn-registry`, `proof-torn-file-checked-after-the-heal`, `proof-main-flow-registry-always-anchored`, `proof-diverged-omits-the-torn-target`, `proof-diverged-omits-the-torn-registry`). All seven run through the harness (`--ids`) and caught; each also fails 1 to 6 named clauses when applied to the self-test alone.
- Limit: the anchor is a weak signal. A file cut off after its anchor still passes, exactly as the target's did before.
