# proof-check heals only what it can prove is its own

CC-CMD: `docs/CC-CMD-2026-11-03-proof-check-stale-state.md` (follow-up filed: `docs/CC-CMD-2026-11-03-gate-state-hazards.md`). Written 2026-11-03.
HEAD at the start: `7bfb341`. Owner's approval: "proof check approved", after the weather close-out reported the defect.

## What was built, and in what order

1. **Tests first, on the unfixed script.** The two stale-marker cases (a classifier case and a case that runs the REAL `proof-check.mjs` in a scratch directory
   against planted state) were written before any fix: 26/28, both red, with the legitimate-heal case green. That is the evidence they can fail.
2. **The first fix** (heal only while the target still carries the injection) passed 28/28 and five mutations. It was then given to an independent review.
3. **Review: 5 lenses over an immutable snapshot, then a skeptic per medium-or-higher finding** (the `Workflow` tool, 17 agents, 2.46 M tokens, 35 minutes).
   27 findings: 2 high, 12 medium, 13 low. 12 of the 14 medium-or-higher went to a skeptic: 11 confirmed and reproduced, 1 did not hold. What it showed about the
   first fix: the new real-script cases never checked the child carried on or left the state dir; `heal` could still overwrite a file that had moved on while the
   injection stayed on it (a `git stash` / commit / `git stash pop` reproduced it); the registry was written unconditionally; a stranded registry probe was now
   discarded where the old heal restored it; a truncated target counted as clean; the refuse outcome had no real-script case; three failing clauses exit 3, which the
   mutation harness reads as "not applicable"; and my own comment named the wrong cause.
4. **The second fix**, below, then 12 mutation entries and the real-tree runs. Everything from the review that is in `proof-check.mjs` is fixed or filed.

## The rule it now enforces

A backup is applied only to a file that is exactly that backup plus what the script itself puts there: one block carrying `let private __proof` above the anchor in
`src/Scoreboard.fs`, one `    | NHL` probe case above the union's last case in `src/Desk.fs`. `classifyState` has five answers:

| marker | pid | the files | answer |
|---|---|---|---|
| none | | | `proceed` (an injected tree with no marker still exits 1) |
| yes | our own | | `proceed` |
| yes | alive | | `refuse`, unchanged |
| yes | dead | target is the backup plus an injection, and/or registry is the backup plus the probe | `heal`, each such file only |
| yes | dead | an injection is on the target that the backups do not describe | `diverged`: nothing written, state kept, exit 1 |
| yes | dead | the target has no anchor (may be torn) | `diverged` |
| yes | dead | nothing of the run's anywhere, target intact | `stale`: the state is discarded, never applied |

## Verified (this container, 2026-11-03)

| check | result |
|---|---|
| `node scripts/proof-check.mjs --self-test` | 41/41 in 1.4 s, six of them real-script runs in scratch directories |
| `node scripts/mutation-check.mjs --ids` the 14 proof-marker ids | 15/15, every mutation caught, tree restored afterwards |
| the same mutations by hand on a scratch copy | 13 of 13 red; the call-site and write-set mutations red ONLY on the real-script cases, as the comment in the table says |
| exit status with 3 clauses red, uncapped and capped | 3 and 1 |
| the original reproduction (stale marker, old backups) on the real tree | `STALE STATE DISCARDED`, 140/140, tree clean |
| a real SIGKILL mid-injection, next run | `HEALED`, 140/140, tree clean |
| the same kill, `src/Scoreboard.fs` then edited at its head, next run | exit 1, the file byte-identical to before the run, state kept; cleaned by hand as the message says |
| `check:exit-drains` | demanded `docs/early-exit-budget.txt` 61 to 60 (one early `process.exit(summarize)` is gone); done, 4/4 |
| `check:clean-source`, `check:workflows`, `check:mutation-anchors`, `check:short-circuit`, `check:import-purity`, `check:exit-truncation`, `check:script-orphans` | all pass |

One incidental observation, from the first version of the fix: in my first SIGKILL attempt the kill hit a wrapper process and not the run, which kept going; the
second run then printed `ALREADY IN PROGRESS`, the live-pid refusal working on a real process. The attempts reported above kill the pid the marker names.

## Not verified, and why

- That a stale marker existed before run 1 is inferred from the match with the reproduction, not observed. The 190-commit fast-forward just before that run touched
  neither file and the lineups commit was already in the tree, so the marker is older than that pull; the weather close-out document said otherwise and is corrected.
- The review's demonstrations of the residual defects (the mutation harness's own heal, its self-test deleting a real marker, the world-mutation restore path,
  the phase-2 window, pid reuse) were run by the review agents in scratch copies and confirmed by skeptics; I did not re-run them. They are filed, not fixed.
- The mutation entries run the self-test, which starts the script as a child process; a CI shard that cannot spawn `node` would see the real-script cases fail loudly,
  not pass.

## Gate

`npm run gate` with `PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome` (the sandbox's Chromium; `lineups-render-check` launches only through that
variable and failed the earlier run's baseline without it): **530/530, every row**, 2707 s, on HEAD `7bfb341` plus the seven files of this commit (local record
`7bfb341926ef-89d8fd3108db`, tree dirty, not committed; CI writes the log). The gate's side-effect files (`docs/confidence-log.jsonl`,
`outbox/mutation-baseline-latest.json`, `outbox/metrics-tab-latest.png`, `outbox/lineups-render-manifest.json`) were discarded, not committed. This paragraph was
written after the run; it is text in an outbox document and changes nothing the gate reads except this file's own length, which the outbox rows only floor.
The mutation row ran the 14 proof-marker entries among the rest of the table.
