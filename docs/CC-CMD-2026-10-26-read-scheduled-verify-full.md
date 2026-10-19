# Claude Code Command — read the first scheduled verify-full run after the outbox row stood aside

**Branch:** main — commit directly, do not create a feature branch or PR
**Repos:** field-laboratory (this CC-CMD's record), field-relay-nba (`docs/dead-cron-baseline.json`)
**Filed:** 2026-10-19 by CC, as done conditions 3-4 of
`docs/CC-CMD-2026-10-17-verify-full-scheduled-outbox-row.md`, which cannot run
until the cron fires
**Status:** FILED. Due 2026-10-26, after verify-full's `0 6 * * 1` run (recent
scheduled runs started 11:47Z to 14:25Z and took about 98 minutes). A
self-follow-up is scheduled for 2026-10-26T17:00Z.

## Why

Option 1 landed on 2026-10-19: on a `schedule` run, "this session wrote its
outbox" is NOT APPLICABLE. It is out of `possible`, printed, and recorded as
`notApplicable`, and the mutations that expect it are reported N/A, not caught.
Nothing has exercised that path on a real cron yet. Only the 10-26 run can.

## Tasks

1. Find the run: the GitHub MCP `actions_list` → `list_workflow_runs`,
   resource `verify-full.yml`, filter `event: schedule`, take the newest. It
   must be dated 2026-10-26 and `head_branch: main`.
2. Read its score from `docs/confidence-log.jsonl` on main (the run commits
   `Record CI measurement of <sha>`): the line whose `sha` is the run's
   `head_sha`.
   - **Expected:** `possible: 520`, `notApplicable: ["this session wrote its outbox"]`,
     `failing: []`, `total: 100`.
   - Any other `failing` row is a real failure to investigate under Rule 77.
     It is not this CC-CMD's to excuse.
3. Read `outbox/mutation-baseline-latest.json` from the run's record commit.
   - **Expected:** `failing: 0` and a non-empty `notApplicable` naming the
     outbox row's command.
4. field-relay-nba `docs/dead-cron-baseline.json`: resolve the
   `field-laboratory:.github/workflows/verify-full.yml` entry, citing the run
   id and its score, if tasks 2-3 hold. If they do not, re-date it with the
   run id as its reason. Commit to the relay's `main`.
5. Mark this CC-CMD and the 10-17 CC-CMD DONE, with the run id.

## Done condition

The scheduled run's record line shows `possible: 520`, `failing: []`, and
`notApplicable` naming the outbox row. The relay baseline entry is resolved or
re-dated, citing that run id.
