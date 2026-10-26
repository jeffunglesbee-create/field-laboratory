# The first scheduled verify-full with the outbox row standing aside (2026-10-26)

Executes `docs/CC-CMD-2026-10-26-read-scheduled-verify-full.md`, the done conditions 3-4 of
`docs/CC-CMD-2026-10-17-verify-full-scheduled-outbox-row.md`. The scheduled follow-up fired at
17:00Z and found the run finished.

## The run

`verify-full` run 40321066992, event `schedule`, branch `main`, head `6d639e4`, started
2026-10-26T12:14Z, conclusion success, about 98 minutes. Found with `list_workflow_runs` on
`verify-full.yml` filtered to `event: schedule`: the newest, dated 2026-10-26.

## What the run recorded, against what was expected

| field | expected | read |
|---|---|---|
| `possible` | 520 | 520 |
| `earned` / `total` | 520 / 100 | 520 / 100 |
| `failing` | [] | [] |
| `skipped` | (not stated) | [] |
| `notApplicable` | ["this session wrote its outbox"] | ["this session wrote its outbox"] |
| mutation baseline `failing` | 0 | 0 |
| mutation baseline `notApplicable` | non-empty, naming the outbox row | `node scripts/run-row.mjs "this session wrote its outbox"` |

Source: the line whose `sha` is `6d639e404239537eda3de6a3263997db50e562aa` in `docs/confidence-log.jsonl`
(id `6d639e404239-a363c7b715d0`, 4624 seconds, `dirty: true` as every CI record is), and
`outbox/mutation-baseline-latest.json` (`ran 70`, `failing 0`) from the run's two record commits on main.
This is the path the 2026-10-19 change built: the outbox row is out of the score and printed, the mutation
that expects it is reported as not run, and a real cron carried it for the first time.

## The relay's baseline

field-relay-nba `docs/dead-cron-baseline.json` held `field-laboratory:.github/workflows/verify-full.yml` as
kind `dead`. The watch's streak is 3 (`DEAD_CRON_STREAK`); the last three scheduled runs are 53 (success,
10-26), 35 (success, 10-19) and 27 (failure, 10-12), so the workflow is not failing its last three. The
baseline's own rule is that an entry no longer dead is stale, so the entry was removed rather than re-dated
(field-relay-nba `fa4c75e`, a 10-line deletion; the file's other entry is untouched). Its reviewed notes,
which record the five earlier failures at the confidence gate, went with it and are in that commit message.

## Not claimed

- This reads one scheduled run. The streak rule needs three consecutive passes to be sure it stays out of
  the baseline; two are in hand since the 10-12 failure (runs 35 and 53), and the 10-19 pass was from entries
  dated that day, not from the stood-aside row, so the row's behaviour on a cron has exactly one observation.
- The relay's `silently-dead-crons` workflow has not been re-run after the deletion. It will print a stale
  note or stay green on its next scheduled run; if it names this key as new decay, the streak read above is
  wrong and the entry should be restored with a new date.
