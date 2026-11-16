# Claude Code Command — live-check's daily beat has not observed the brief-phase rule in 20 of 20 runs: its runs arrive 5.7 to 8.5 hours after the 03:37Z cron, on the next day's empty slate

**Branch:** main — commit directly, do not create a feature branch or PR (a work branch is used only to run `verify-full`, and lands on `main` by merge with the run id in the message)
**Repo:** field-laboratory
**Filed:** 2026-11-15 by CC, found while building `docs/CC-CMD-2026-11-15-brief-phase-card-identity.md` (its Task 7 had to be re-specified because of it). The owner's order was "Brief and hook" (Sun 2026-11-15 06:53 ET); this was not part of it.
**Confidence gate:** `npm run gate` >= 95 before any commit
**Status:** FILED 2026-11-15. Not built: the option recommended below changes what the daily beat renders, and the owner's order did not cover it. It waits for the owner's word on Option B (about 45 minutes). The premises are tested and recorded in `outbox/live-check-schedule-sweep-2026-11-15.txt`.

---

## What was measured

`live-check.yml` carries a daily beat, `37 3 * * *`. Its own comment (moved there 2026-08-31, `outbox/cc-no-card-was-two-failures-2026-08-31.md`, "The daily beat was scheduled where the rule cannot run") gives the reason: 03:37Z is 22:37 ET, "with the day's early fixtures final and carrying recaps. That is the state these checks are written for."

The scheduled runs do not start then. The last 20 were created 5.70 to 8.45 hours after 03:37Z (median 7.80 h), between 09:18Z and 12:03Z, which is 05:18 to 07:03 ET (EDT until 2026-11-01). The page renders the current ET day, so each of them printed the new day's own date (17 of 17 slate lines equal the run's created date) with nothing finished on it. The brief step observed the rule in 0 of the 20: 18 printed `NOT OBSERVABLE`, and 2 failed at step 9, the deploy-landed check, and skipped the brief step. The runs that did observe it were started by a deploy in the evening: the six reds of 2026-11-14 and 15, for example run 43676533656, created 04:23Z, with 42 final games carrying both phases.

So, over the 20 runs read (back to 2026-10-27), the daily beat is a render at dawn. That is a coverage claim in the workflow's own comment that does not hold, and nothing in a green run says so: `NOT OBSERVABLE` exits 0 by design.

## Related, read before building (BUILD-ON-A)

Searched 2026-11-15 by content (`03:37`, `37 3 * * *`, `daily beat`, `NOT OBSERVABLE`, `schedule`) in `docs/CC-CMD-*.md` and `outbox/`. The only prior text is the 2026-08-31 record and the workflow's comment.

- `docs/CC-CMD-2026-11-15-brief-phase-card-identity.md` (IN PROGRESS): its Task 7 said "a `live-check` created after 2026-11-22T03:37Z" and now dispatches its own Saturday-evening run instead, for the reason measured here. This adds nothing to it and changes nothing there beyond a pointer.
- `outbox/cc-no-card-was-two-failures-2026-08-31.md`: the ruling that moved the beat to 03:37Z. Its intent, that the daily beat meets a slate with finals in it, stands. This asks for what that ruling wanted and does not undo it.
- `docs/CC-CMD-2026-11-14-weather-failure-tls-stage.md`: its follow-up task reads `live-check` runs. Unchanged by anything here.

## Premises, and the one command that tested each (Rule 100)

| premise | the command | what it said |
|---|---|---|
| the daily beat's run starts when its cron says | `gh run list --workflow live-check.yml --event schedule --limit 20 --json createdAt`, the hours after 03:37Z computed | refuted: 5.70 to 8.45 h, median 7.80. The oldest five ran 5.70 to 6.81 h late (2026-10-27 to 31), the newest fifteen 7.03 to 8.45 h (2026-11-01 to 15) |
| a run then renders the evening's slate | the `slate` line in each run's brief step | refuted: 17 of 17 print the run's own created date, none with a final game carrying both phases |
| so the daily beat observes the brief rule | the brief step's verdict in each of the 20 | refuted: 0 of 20 (18 NOT OBSERVABLE; 2 failed at the deploy-landed check and skipped the brief step) |
| evening runs that observe it exist | the same extraction on 43651541854 and 43676533656 | yes: deploy-started, created 23:06Z and 04:23Z, 16 and 42 final games carrying both phases |

## Task 0 — probe block

```
git log --oneline -3
git branch --show-current
gh run list --workflow live-check.yml --event schedule --limit 5 --json createdAt --jq '.[].createdAt'
sed -n '/MOVED 2026-08-31/,/- cron/p' .github/workflows/live-check.yml
```

Expected at filing: the branch `main` at or after the landing of the brief CC-CMD; five `createdAt` values between 09:00Z and 13:00Z; the comment's "03:37 UTC is 23:37 EDT and 22:37 EST" and the cron line `37 3 * * *`.

## The options (the owner chooses; B is recommended)

- **A. Move the cron so the late run lands in the evening.** For the 20 runs read, a nominal time between 17:18Z and 20:03Z puts every arrival between 23:00Z and 04:30Z (18:00 to 23:30 EST): `37 18 * * *` would have arrived 00:19Z to 03:04Z. It restores every step that needs a slate with finals, if the delay stays inside what was measured. The delay grew across the sample and nothing says why, so this is a bet on a number nobody controls.
- **B. A `schedule` run that starts before noon ET renders the previous ET day in the brief step**, through the `BRIEF_DATE` input the brief CC-CMD adds. It does not depend on the delay. The step then sees finished games with both phases, in their finalised state and not in the evening's. The other steps are unchanged.
- **C. Both.**
- **D. A scheduled task dispatches the run at a fixed evening hour.** One agent session a day. Rejected on cost.

Recommendation: B. It is the smallest change, it is independent of the delay, and it makes the daily beat observe the rule. The workflow's comment names two other things the schedule never tested, live-grouping and the schedule rows. They are not measured here and B does not touch them; whether they need A is a second question.

## Task 1 — the test first, and it fails on purpose (Rule 90), if B is approved

The rule as a function of the event, the input and the clock, with a self-test of hostile clocks: a `schedule` run at 11:27Z (06:27 ET) gives the previous ET day; at 11:59 ET the previous day and at 12:00 ET the same day; the two DST changes of 2026 (03-08 and 11-01); UTC midnight; a non-empty input always wins; every event other than `schedule` with an empty input stays empty. It is red against the current workflow, which passes the empty input through. Each mutant asserts its anchor is unique and applied before it reports. **Artifact:** the red run and `caught K of K`.

## Task 2 — the change

One rule in one place, called by the workflow's brief step and by the self-test (Rule 63). No other step of `live-check.yml` changes.

## Task 3 — gates and landing

`verify` and `guards` green on the landing. A scored `verify-full` only if a gate row or a registered mutation is added. **Artifact:** the run ids.

## Task 4 — the follow-up is a task, not a note

A scheduled task reads the first `schedule` run created after the landing: its slate line must print the previous day's date, `final games carrying BOTH ...: N` must have N above 0, and the verdict is PASS or FAIL. `NOT OBSERVABLE` on a day that had games is a finding and not a pass. **Artifact:** the task's id in the Status line.

## Task 5 — the manifest is last

`outbox/cc-session-<date>-live-check-daily-beat.md`: commit hashes, run ids, the premise results, what was verified and what was not.

## Done conditions

1. Task 1's check is red against the current workflow, green against the change, and `caught K of K` for its mutants.
2. The landing's `verify` and `guards` are green.
3. The Task 4 task exists, is named in the Status line, and its reading of the first scheduled run shows N above 0.

## What this does not establish (said before it is built)

- Why the scheduled runs are late, or that they stay inside 5.70 to 8.45 h. GitHub gives no reason in the run, and the range moved between the oldest five and the newest fifteen.
- That a replay of a finished day equals the evening's state, with partners still in play. That is what Task 7 of `docs/CC-CMD-2026-11-15-brief-phase-card-identity.md` reads, on its own dispatch.
- That deploy-started runs observe the rule on every deploy. They observe it when a deploy lands while a slate has finals.
- That live-grouping and the schedule rows are blind on the schedule in the same way. The workflow's comment says so; it was not measured here.

## Not in scope

The cron's other steps, the relay, `scripts/render-check.mjs`, and moving the brief self-test into `verify.yml`.
