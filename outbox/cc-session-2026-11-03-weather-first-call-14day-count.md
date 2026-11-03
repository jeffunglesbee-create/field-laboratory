# weather-first-call-connect: the 14-day count is 0 failures in 28 runs, Task 1 not triggered

CC-CMD: `docs/CC-CMD-2026-10-20-weather-first-call-connect.md`. Written 2026-11-03. No code changed. HEAD at the read: `597b334`.
This is the scheduled close of that CC-CMD's Task 0.3 (wake `trig_01H7eoLwoZqWDj2q53XC1S8x`).

## The count (Task 0.3)

Step "Venue table and Open-Meteo, checked live" of `drift-sentinel`, every run created from 2026-10-20T17:39Z (the venue-loop retry landing) to
2026-11-03T17:39Z, read from the Actions API on 2026-11-03 at about 18:20Z:

- 28 runs (27 `schedule`, 1 `workflow_dispatch`) over 15 calendar days. The API's own `total_count` for the window is 28.
- Weather step: **28 `success`, 0 `failure`**, none skipped, cancelled or absent.
- No run was re-run. Every job is attempt 1, and the jobs were listed with `filter=all`, so no failure was overwritten by a later attempt.
- Every one of the 28 logs carries `checked N of N venues` with the same N on both sides: no venue went unanswered in any run.
- The venue table grew during the window: 109 venues in 5 runs (2026-10-20 to 10-22), 410 in 4 (10-23 to 10-24), 484 in 19 (10-25 to 11-03). The CC-CMD
  names the 109-venue table; the larger tables made more calls per run, not fewer.
- The 11 red runs failed elsewhere: "Did the filed CC-CMDs land?" in 4 and "Fail if the sentinel failed" in 7. The second is gated on
  `steps.sentinel.outputs.code`, a different step. The weather step was green in all 11.

Agreement with the earlier read: `outbox/cc-session-2026-10-27-weather-first-call-task0.md` counted 13 of 13 green through run 40378883295
(2026-10-26T18:34Z). The first 13 rows of the table below are those 13 runs, and they agree.

Task 0.2's finding (neither failed run was a first-call connect failure) is in that 2026-10-27 document. Done condition 1 asks for both in `outbox/`;
both are there.

## Could a first-call failure have hidden behind a green step? (premise test, Rule 100)

A `success` says nothing about first calls if the step tolerates them. Three checks, each one read or run on 2026-11-03:

1. **The flag.** The step runs `npm run check:weather-live`, which is `node scripts/weather-live-check.mjs --self-test && node scripts/weather-live-check.mjs`. It
   passes no `--tolerate-unreachable`. The script's header says that flag is passed by verify.yml and not by drift-sentinel.
2. **The step.** In `.github/workflows/drift-sentinel.yml` the step has `if: always()` and no `continue-on-error`. Two other steps in the file carry
   `continue-on-error`; neither is this one.
3. **The behaviour.** `node scripts/weather-live-check.mjs --self-test` prints `PASS  the same first-call 503, no flag: exit 1 (want 1)`, 16 of 16 cases
   pass, and that self-test runs first in the same npm script in every one of the 28 runs.

So a first call that did not answer, without the flag, exits 1 and reddens the step. None did, in 28 runs.

## What the count does not show

The venue loop's retry fired. In 13 of the 28 runs at least one venue did not answer its first ask: 14 venues in all, and each answered on the immediate retry
(14 of 14), out of 11,381 venue calls (0.123% per call). Cold-connect failures happen on these runners at about that rate, and the retry absorbs them.

The first call (the Fenway reading) and the two probes are asked once. That is 84 single-shot calls in the window, 3 per run. At the loop's rate the expected
number of failures among them is 0.10, so the chance of seeing none is 90%: 0 of 84 is what the loop's rate predicts whether or not those calls are as exposed
as a loop call. From 0 of 28 first calls the one-sided 95% upper bound on a first call's failure rate is 10.1%.

The count meets the CC-CMD's close condition ("If it is 0 failures, this CC-CMD may close with that count as its artifact and no code"). It does not show that a
first call cannot fail. Task 1 stays unbuilt as the CC-CMD writes it; building it anyway is the owner's call, and its self-test case and mutation are already
specified there.

## The gate behind this commit

`npm run gate` with `PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, on HEAD `597b334` plus the two documents in this commit: **530/530, every row**,
2713 s (local record `597b33491224-761a0ae39ca0`, tree dirty, not committed; CI writes the log). The gate's side-effect files (`docs/confidence-log.jsonl`,
`outbox/mutation-baseline-latest.json`, `outbox/metrics-tab-latest.png`, `outbox/lineups-render-manifest.json`) were discarded, not committed. This section was
written after that run; it is text in an outbox document and changes nothing the gate reads except this file's own length, which the outbox rows only floor.

Two earlier runs on the same tree failed, and neither was this change:

1. **Run 1, 92/100**, rows "doc claims are compiler-verified" and "breaking each invariant" red with `error FS0039: The record label 'BsdEventId' is not defined`.
   At the end of the run `src/Desk.fs` (13 lines fewer) and `src/Scoreboard.fs` (70 fewer) matched committed versions from before the lineups feature: Desk.fs
   equal to `7505a58` (2026-10-20), Scoreboard.fs equal to `0a8100e` (2026-09-21, the newest commit with that content). Both were rewritten in the same
   millisecond and `.proof-state/` was gone. **Reproduced on purpose:** `scripts/proof-check.mjs` heals a "killed run" (`case 'heal'`) by writing
   `.proof-state/Scoreboard.fs.bak` and `.bak.registry` over `src/Scoreboard.fs` and `src/Desk.fs` whenever a marker exists and its pid is dead, and it does not check
   that the target still carries the injection (`injectedNow` is read, and used only in the `proceed` case). A marker with dead pid 999999 and those two old versions
   as backups, planted in a clean tree at HEAD, printed `proof-check: HEALED — a previous run (pid 999999) was killed with src/Scoreboard.fs injected`, left Desk.fs
   at 13 lines fewer and Scoreboard.fs at 70 fewer, and failed the baseline compile with the same FS0039. That a stale `.proof-state/` existed before run 1 is
   **inferred from that match, not observed**: this checkout was in use through at least 2026-10-22 (its stash holds a WIP on `8f65f4f`, dated 10-22).
   **Corrected the same day** (`docs/CC-CMD-2026-11-03-proof-check-stale-state.md`): this paragraph first said the checkout "was fast-forwarded 190 commits today,
   which would leave an old backup behind the new files". It was not that pull: those 190 commits touched neither `Desk.fs` nor `Scoreboard.fs`, and the lineups
   commit `11b781d` was already in the tree before it, brought in by the 2026-10-28 `pull --rebase --autostash` runs. The marker is older than that.
   **Fixed** by that CC-CMD, in a stricter form than the guard first proposed here ("heal only while `TARGET` still contains `MARKER`" would still have overwritten a
   file that had moved on with the injection left on it): a backup is now applied only to a file that is exactly that backup plus what the script itself injects.
2. **Run 2, 96/100**, one row ("breaking each invariant"): the harness's baseline found `node scripts/lineups-render-check.mjs` already failing,
   `browserType.launch: Executable doesn't exist at /opt/pw-browsers/chromium_headless_shell-1234/...`. That script launches Chromium only through the opt-in
   `PW_CHROMIUM` variable, where `tab-check`, `pickem-check`, `render-check` and `separation-check` fall back to the session's Chromium by themselves. With
   `PW_CHROMIUM` set it passes 71 of 71, and run 3 is that run. Run 2's other 21 rows passed, including the proof row run 1 had failed.

## Coverage (Rule 91)

28 of 28 runs of the workflow in the window; each run's jobs read with `filter=all`; each of the 28 logs read for the `checked` line and for the script's two
retry lines. A row with `0 / 0` in the last column is a log that carries `checked N of N venues` and neither retry line. Calendar days: 2026-10-20 has one
run (the dispatch), 10-21 to 11-02 have two each, 11-03 has one. The 11-03 afternoon run, which earlier days started between 15:43Z and 21:37Z, had not been
created at the read, so it is not counted. A run created after 17:39Z falls outside the 14 days either way.

## Re-check

```
gh api "repos/jeffunglesbee-create/field-laboratory/actions/workflows/330727236/runs?created=>=2026-10-20T17:39:00Z" --jq '.total_count'
gh api "repos/jeffunglesbee-create/field-laboratory/actions/runs/<run>/jobs?filter=all" --jq '.jobs[].steps[] | select(.name=="Venue table and Open-Meteo, checked live") | .conclusion'
node scripts/weather-live-check.mjs --self-test | grep "first-call"
```

The first command prints 28 as of this read and grows with every later run; the rows below are the 28.

## Per-run table

| run | created (UTC) | event | run | weather step | venues | not answered on 1st ask / on retry |
|---|---|---|---|---|---|---|
| 39504314648 | 2026-10-20 21:56:12 | workflow_dispatch | success | success | 109 of 109 | 0 / 0 |
| 39553758544 | 2026-10-21 06:10:03 | schedule | failure | success | 109 of 109 | 0 / 0 |
| 39639786154 | 2026-10-21 16:59:53 | schedule | failure | success | 109 of 109 | 1 / 1 |
| 39732664716 | 2026-10-22 06:13:55 | schedule | success | success | 109 of 109 | 1 / 1 |
| 39818685995 | 2026-10-22 16:59:15 | schedule | success | success | 109 of 109 | 2 / 2 |
| 39909707060 | 2026-10-23 06:08:24 | schedule | failure | success | 410 of 410 | 1 / 1 |
| 39990185130 | 2026-10-23 16:51:04 | schedule | failure | success | 410 of 410 | 1 / 1 |
| 40068700179 | 2026-10-24 06:03:44 | schedule | success | success | 410 of 410 | 1 / 1 |
| 40108307584 | 2026-10-24 15:43:53 | schedule | success | success | 410 of 410 | 1 / 1 |
| 40168879083 | 2026-10-25 06:22:50 | schedule | failure | success | 484 of 484 | 1 / 1 |
| 40209164962 | 2026-10-25 15:54:38 | schedule | failure | success | 484 of 484 | 0 / 0 |
| 40280444008 | 2026-10-26 06:32:38 | schedule | success | success | 484 of 484 | 1 / 1 |
| 40378883295 | 2026-10-26 18:34:09 | schedule | success | success | 484 of 484 | 1 / 1 |
| 40461353098 | 2026-10-27 06:28:54 | schedule | success | success | 484 of 484 | 1 / 1 |
| 40554236765 | 2026-10-27 17:49:44 | schedule | success | success | 484 of 484 | 0 / 0 |
| 40647043560 | 2026-10-28 06:57:41 | schedule | success | success | 484 of 484 | 0 / 0 |
| 40743176731 | 2026-10-28 18:14:05 | schedule | success | success | 484 of 484 | 0 / 0 |
| 40834629712 | 2026-10-29 07:18:51 | schedule | failure | success | 484 of 484 | 0 / 0 |
| 40929762806 | 2026-10-29 18:19:49 | schedule | failure | success | 484 of 484 | 0 / 0 |
| 41019602785 | 2026-10-30 07:21:37 | schedule | success | success | 484 of 484 | 0 / 0 |
| 41102328215 | 2026-10-30 17:54:27 | schedule | success | success | 484 of 484 | 0 / 0 |
| 41179497452 | 2026-10-31 07:09:48 | schedule | success | success | 484 of 484 | 1 / 1 |
| 41222959662 | 2026-10-31 17:07:15 | schedule | success | success | 484 of 484 | 0 / 0 |
| 41285871526 | 2026-11-01 07:42:45 | schedule | failure | success | 484 of 484 | 0 / 0 |
| 41333484636 | 2026-11-01 17:50:08 | schedule | success | success | 484 of 484 | 1 / 1 |
| 41408815673 | 2026-11-02 07:49:50 | schedule | failure | success | 484 of 484 | 0 / 0 |
| 41529990896 | 2026-11-02 21:37:09 | schedule | failure | success | 484 of 484 | 0 / 0 |
| 41600742027 | 2026-11-03 08:05:44 | schedule | success | success | 484 of 484 | 0 / 0 |
