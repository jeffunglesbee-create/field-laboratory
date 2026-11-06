# The gate's wait for the mutation shards, against how long a shard takes

2026-11-06. Continues `docs/CC-CMD-2026-11-03-gate-hazard-residuals.md` (BUILT) and `docs/CC-CMD-2026-11-03-gate-speed.md` (DONE, the shard topology). One commit.

## The premise that was tested

"The gate's wait for the shards (`scripts/mutation-await.mjs`, 80 polls of 30 s, 40 minutes) is long enough." Nothing had tested it since the table grew from 444 entries to 1132 and the harness's own self-test from 13 s to 29 s.

The command that could refute it: one shard alone on the idle container, network open, nothing else running.

```
node scripts/mutation-check.mjs --shard 8/8 --out shard-8.json
```

Result, recorded in `outbox/mutation-whole-table-2026-11-06.json` under `soloReRunOfShard8`: 141 entries, all CAUGHT, 2,591 s of wall time (43 minutes), of which 197 s was the baseline. Under the four-way load of the whole-table run the same shard took 2,861 s. The other seven shards took 2,343 to 2,779 s in that run.

Why 43 minutes is a problem for a wait of 40: the shard jobs start with the `full` job, and the wait is counted from the `full` job's mutation row, which comes after its setup and its other rows. So the wait ends 40 minutes plus whatever the `full` job spent before that row after the jobs began (not measured), and the slowest shard ends 43 minutes of work plus its own setup (not measured either) after it began. The two are within a few minutes of each other, and on a runner as fast as this container either could come first. If the wait does, the gate gives up on a shard that is still inside its 90-minute cap and reports it as never uploaded: a red `verify-full` with nothing wrong. A runner may be faster (the 2026-11-03 section of `docs/GATE-TIMING.md` measured a failing compile at 5.8 s on a runner against 12 to 14 s here) or slower, and nothing in the repository says which. A budget that sits inside the measured time with no margin is not one to leave to the first CI run.

## What changed

- `scripts/mutation-await.mjs`: `DEFAULT_ATTEMPTS` is 200 (it was 80), so the wait is 100 minutes, longer than the 90 minutes a shard job may run. The options are read by an exported pure function, `optionsOf`, which the command uses and which the check reads. Header and usage text say the same.
- `scripts/sharded-row-check.mjs`: `shardJobCap` reads the shard job's own `timeout-minutes` from `.github/workflows/verify-full.yml`, `waitOutlastsShards` compares it with the wait, and the self-test has three new clauses: nine stand-in workflows, the real file with the options the command really uses, and the flags overriding the defaults (18 clauses, were 15).
- `.github/workflows/verify-full.yml`: only the comment above `timeout-minutes: 90`, which said the shards "are a fraction of the old 90+ minute row". It now carries the 43-minute figure and names the check.

The cap is not raised. 90 minutes is 2.1 times the solo figure here. If the first runner measurement is above about 70, raise it, and the check will fail until the wait is raised with it.

## Rule 90: the check fails on purpose

Before the default was changed, the new real-file clause was run against `DEFAULT_ATTEMPTS = 80` and was red: "the gate gives up on the shards after 40 minutes (80 polls of 30 s) but a shard job may run for 90". After the change it passes. Eight table entries, each run through the harness with `--ids` and each CAUGHT (9 of 9 checks passed, the ninth being the unmutated tree):

| entry | what it breaks |
|---|---|
| `shard-wait-default-shorter-than-the-cap` | the default back to 80 |
| `shard-wait-command-ignores-the-default` | the command reads 80 instead of the default the check compares |
| `shard-wait-cap-compared-strictly` | `>=` becomes `>` (a wait exactly the cap) |
| `shard-wait-cap-read-from-the-whole-file` | the cap is the first `timeout-minutes` in the file (the `full` job's 240) |
| `shard-wait-no-cap-passes` | a shard job with no timeout reads as outlasted |
| `shard-wait-cap-in-a-comment-counts` | a commented `timeout-minutes` counts |
| `shard-wait-cap-on-a-step-counts` | a step's `timeout-minutes` counts |
| `shard-wait-two-shard-jobs-take-the-first` | two jobs named "mutation shard" resolve to the first |

`node scripts/mutation-check.mjs --anchors`: 1137 of 1140 anchors, 0 stale (it was 1129 of 1132).

## Not verified

The runner's shard time. Verify after the push: dispatch `verify-full` and read `outbox/mutation-baseline-latest.json` (`wallMs` per shard) and the gate step's duration. Expected from this container: the slowest shard near 43 minutes. If it is above 70, raise `timeout-minutes` and the wait together; if the gate step still gives up, the shards are slower than the cap allows.
