# `verify-full` on a runner, 2026-11-06 (item 10.14 of `docs/CC-CMD-2026-11-03-gate-hazard-residuals.md`)

Run 42200547950, `workflow_dispatch` on `main`, 2026-11-06 10:10:00Z to 10:56:43Z (46 min 43 s), conclusion **success**. Head `1f05aa4`: the pushed `ff9c83a` plus two bot commits that changed `STATUS.md`, `outbox/INDEX.md` and `outbox/axis-manifest-latest.json` only. Dispatched after `verify` (42199582290), `guards` (42199582323), `deploy` (42200302373) and `live-check` (42200389206) had all passed on `ff9c83a`.

## What the gate scored

Ledger line `1f05aa4cb4b3-7819400528d2` in `docs/confidence-log.jsonl` (committed by the run as `ad8340d`): 530 of 530 points, total 100, 2,705 s. The previous `verify-full` run in `docs/GATE-TIMING.md` (41680758770, 2026-11-03, branch `proof-batch`) took 7 min 5 s with a 354 s gate step.

## The eight shards

Source of the second column: the Actions API, from the start to the end of the job's one composite step "Run ./.github/actions/mutation-shard". Source of the third: `shards.wallMs` in `outbox/mutation-baseline-latest.json` as committed by the run (`dfda01c`), which is the harness's own wall time and matches the log line `end-action ... duration_ms=` for the harness step (checked for shard 4: 2,143,840 ms against 2,143,688 in the file). `from_mutations` is 1,139 and `failing` is 0 in that file; all eight jobs ended success.

| shard | job step | harness wall |
|---|---|---|
| 1 | 35 min 09 s (2,109 s) | 2,004.7 s |
| 2 | 35 min 47 s (2,147 s) | 2,087.0 s |
| 3 | 40 min 50 s (2,450 s) | 2,372.6 s |
| 4 | **46 min 07 s (2,767 s)** | 2,143.7 s |
| 5 | 29 min 43 s (1,783 s) | 1,723.0 s |
| 6 | 35 min 30 s (2,130 s) | 2,047.0 s |
| 7 | 36 min 46 s (2,206 s) | 2,143.8 s |
| 8 | 35 min 44 s (2,144 s) | 2,079.5 s |

Sum of the harness wall times: 16,601 s. The longest harness run is shard 3's, 2,372.6 s (39.5 min). The longest job is shard 4's, and the difference is setup:

| shard 4 against shard 1 | shard 4 | shard 1 |
|---|---|---|
| time before the harness starts | 622 s | 102 s |
| of which "Install Chromium" (`npx playwright install --with-deps chromium`) | 581 s | 45 s |
| the apt line in that step | `Fetched 12.3 MB in 9min 23s (21.8 kB/s)` | `Fetched 21.9 MB in 1s (24.6 MB/s)` |

Read from the two job logs (job 127834476969 and 127834476986) by a sub-agent and not re-read line by line by me, except the harness duration above. The shard 4 log shows apt ignoring requests to `azure.archive.ubuntu.com` for the font packages, with gaps of 172 s, 123 s and 96 s between lines, and fetching two of them from `archive.ubuntu.com` at the end. It shows no error text, status or timeout, so it does not say why the mirror was slow. The Chromium download itself (`cdn.playwright.dev`) took about 4.5 s on both. The same install step took 19 s in the `full` job.

Without those 535 seconds shard 4's job would have been about 37 minutes and the longest would have been shard 3's, 40 min 50 s. The gate step waited for shard 4's artifact, uploaded at 10:56:15Z, and ended at 10:56:36Z.

## Against the two budgets

| budget | set at | used in this run | margin |
|---|---|---|---|
| shard job `timeout-minutes` | 90 min | 46 min 16 s by the longest job (shard 4) | 1.95 times |
| the gate step's wait for the shards (200 polls of 30 s) | 100 min | at most 45 min 06 s: the whole gate step, 10:11:30Z to 10:56:36Z, which includes the rows that run before the wait begins | at least 2.2 times |

The rule written in `docs/GATE-TIMING.md` was "if the slowest shard is above about 70 minutes, raise `timeout-minutes` and the wait together". It is 46. Neither budget is changed.

## What it cost

Job time from the API (`started_at` to `completed_at`): shards 35.3, 35.9, 40.9, 46.3, 29.9, 35.6, 36.9 and 35.8 minutes, 295.5 in all; the `full` job 46.7. **342 minutes, 5.7 runner-hours**, which is the figure `docs/GATE-TIMING.md` estimated before the run (5.7). Rounded up to whole minutes per job it is 346. On the Monday schedule that is 4.3 runs a month, about 1,470 job-minutes. `docs/CC-CMD-2026-11-06-gate-residuals-remaining.md` A5 is the one way to lower it that was considered and not built.

## Not claimed

That a runner is always this fast: one run, eight slices, and the one stalled mirror above is the spread between the fastest and slowest job that the run itself shows. That the mirror stall repeats: it was seen once in this run.
