# Session record: live-check step 16 names the request behind a page error (CC-CMD-2026-11-24-step16-names-the-request), Rule 67

Written 2026-11-24 on `main`. Owner direction: "Next approved" (Tue 2026-11-24 14:12 ET), to a proposal made after the owner's Sun 2026-11-22 14:59 ET message "429 should be over". The reading, the tasks and the done condition are in `docs/CC-CMD-2026-11-24-step16-names-the-request.md`. This is the lab only: no relay change, no client change.

## HEAD progression

| point | where | what |
|---|---|---|
| start | `main` `6e32367a` | step 16 ("The pitcher and records rows appear on the deployed page") printed `Failed to load resource: the server responded with a status of 429 (Too Many Requests)` and nothing else, so a red could not say which host refused. `verify` on main last green at run 45108603022 (2026-11-23T03:53Z). Published `e290b24`, behind the newest deployable commit |
| CC-CMD | `main` `18606cb7` | the CC-CMD: the reading, the premise tried against Playwright 1.62.1, the ask, Tasks 0 to 6, the done condition |
| change | `main` `77647dc1` (pushed 19:45Z) | `describeConsoleError` and a `--self-test` branch in `scripts/schedule-live-check.mjs`; the stub driver `scripts/schedule-live-check-names-request.mjs`; one step in `.github/workflows/live-check.yml`. `verify` 45473543164: FAILED at "No check script kills itself mid-write" (64 early report exits, budget 63). live-check 45473584970: step 18 success, 5/5 and 7/7 |
| fix | `main` `c67aa5cd` (pushed 20:11Z, after a rebase over three bot commits: two status refreshes and an outbox availability record) | the helper moved to `scripts/console-error-text.mjs`; the five cases became the first five checks of the stub driver; the workflow step runs one command. `verify` 45478103493: the step that failed passes, one failure that is not mine. guards 45478103404 success. live-check 45478165204: step 18 success, 12/12 |
| docs | `main`, the commit that carries this file | this record; the CC-CMD to DONE; the runner reading in `outbox/step16-page-error-names-request-2026-11-24.txt` section 7; section 6g and a wording correction in `outbox/step16-exit-drains-regression-2026-11-24.txt` |

## What was built (commit order)

1. **The CC-CMD** (`18606cb7`). Every line of "What was read" says how it was read. The premise ("the failed request's URL is on `ConsoleMessage.location()`") was tried to refute first: `outbox/step16-page-error-names-request-2026-11-24-probe.cjs` ran seven console errors through the lab's pinned Playwright against local servers, and 7 of 7 expectations held; with one expectation broken on purpose in a copy it reported 6 held, 1 not, exit 1.
2. **The change** (`77647dc1`). `describeConsoleError(text, requestUrl)` appends ` — <url>` to text that starts `Failed to load resource`, and only when the message carries a URL; the `console` handler passes `m.location()?.url`. A CORS refusal names the request already and carries the page as its location, and an app-level `console.error` carries its script, so neither is touched. The check's verdict, tolerance, retry and assertions are unchanged. The stub driver runs the real script against a page on 127.0.0.1 that fires two requests answered 429 and one app-level error, so the proof runs on the runner's own Chromium without waiting for the deploy.
3. **The fix** (`c67aa5cd`). See Incidents.

## Verified (artifact beside each)

- **Red first.** The stub check against the script before the change: 10 of 12 (the two 429 URLs are not named). On the first layout it was 5 of 7.
- **Green and stable.** `node scripts/schedule-live-check-names-request.mjs`: 12 of 12, ten runs out of ten.
- **Mutations, Rule 90.** `node outbox/step16-page-error-names-request-2026-11-24-mutate.mjs`: the control green (12/12), then seven variants, each anchor asserted unique and each mutated text asserted to differ, 0 not caught. The split: the empty-URL guard is seen only by the helper cases, the handler reading the wrong field or not calling the helper only by the run against the stub page, the other three by both. Output verbatim: `outbox/step16-exit-drains-regression-2026-11-24.txt`, section 6b.
- **On the runner, twice.** live-check 45473584970 (first layout) and 45478165204 (final layout): step 18 "Step 16 names the request behind a page error" success; both stub URLs named; Chromium 151.0.7922.34 (playwright chromium v1234), the revision the script's production run uses and the sandbox does not have. Verbatim log lines: `outbox/step16-page-error-names-request-2026-11-24.txt`, section 7.
- **`verify` on the fix** (45478103493, head `c67aa5cd`): log steps 1 to 70, 69 success and one conditional skip; log step 39, the step that failed on `77647dc1`, success (207 scripts scanned, early report exits 63 against a budget of 63, 4/4); log step 71, "The mutate scripts break a copy, never the tracked tree", FAILURE; log steps 93 to 121, 29 of 29 success.
- **Coverage of that reading (Rule 91).** Log steps 72 to 92, 21 steps, were skipped because `verify` stops at its first failure. 20 of those 21 ran locally on the fixed tree: 14 passed, 6 failed, and the same 6 fail identically on `6e32367a` (the commit before mine). The 21st, "Games are separated from each other", ran nowhere. Across the whole job, 83 of its 121 steps ran locally; the 38 that did not are 8 actions with no command, 4 install and build, 21 that need the browser, 4 that read a live endpoint and the always-last Chromium step. Of the 11 steps that fail locally on both trees, four (log steps 29, 56, 57 and 67) pass on the runner on this commit, so they fail only in this sandbox; one is the BSD step; six were not run by the runner on this commit, and why they fail locally was not established (`outbox/step16-exit-drains-regression-2026-11-24.txt`, sections 6d and 6g).
- **The red that is not mine.** The one failing step is the BSD next-goal grader's: 82 of 86, four clauses, all `bsd-next-goal-grade-core`. On run 45442481067, at `f248b808`, four commits before mine and with nothing under `scripts/`, `src/` or `.github/` between them, the step's log section is the same: 148 lines each, a diff reports 0 lines differing. This session did not read why it fails.

## Unobserved (Rule 74)

- **What:** the naming against a real third-party 429 on the deployed page. Every reading above is a stub on 127.0.0.1.
- **Blocked by:** step 16 runs only after "The deploy landed" passes. Published is `e290b24`; live-check 45478165204 step 9 reads "DEPLOY NOT LANDED — published e290b24 is behind the newest deployable commit c67aa5c". The deploy holds while `verify` on main is red.
- **Unblocked when:** `verify` on main is green, the scheduled deploy publishes, and a live-check run reaches step 16 and fails it on a 429.
- **Read it with:** the command in the CC-CMD's Residual section (`gh api … /logs | sed … | grep -oE 'status of 429 \(Too Many Requests\) — https?://[^/ ]+' | … | uniq -c`; counts read double because an error prints twice in a log). Checked on a synthetic log: it printed 4 for two Open-Meteo errors and 2 for one relay error.
- **Armed:** a scheduled task, Thu 2026-11-26 13:00 ET (18:00Z), approval mode auto, read back from the account on 2026-11-24 after this session wrote it. It reads every live-check run created after 2026-11-24T19:45Z, reports verbatim, and arms one more 48 hours out if none has reached step 16, until 2026-12-08, after which it writes `outbox/step16-host-read-unreached-2026-12-08.md` and stops. Its first finding to read is a stub-check failure in any run.

## Integration state (Rule 65)

- **Relay contract:** none touched.
- **Client consumer:** none touched. The script reads the deployed page and prints what it saw; nothing consumes its output but a person reading a red.
- **Status:** VERIFIED on the runner against a stub; UNOBSERVED against a real 429 (above).
- **Known mismatches:** none. The authoring sandbox's Chromium (revision 1243) is not the runner's (1234); the stub run in the live-check workflow is what reads the runner's.

## Carry-forwards

None unowned.

- **The hook.** `.githooks/pre-commit` runs twelve checks and not `check:exit-drains`, which is the check `77647dc1` broke. It is item F1 of `docs/CC-CMD-2026-11-06-gate-residuals-remaining.md` (BUILD-ON-A: added to that open CC-CMD). Trigger: observed once on 2026-11-24; built when the owner agrees that this check belongs in the hook. Artifact: one `npm run --silent check:exit-drains` line after `check:push-lands`, red first on the tree of `77647dc1`. Cost 0.6 s against a hook of 44 to 48 s.
- **Main's red `verify` and the stuck deploy** are the BSD grader session's. Nothing here edits its files or its CC-CMDs. One consequence is measured: every `verify` run on main since 45108603022 (six runs) skipped the same 21 steps, so no run has executed on a runner, in that job, the steps after the BSD one, "The F# suite, on the F# harness" among them (`outbox/step16-exit-drains-regression-2026-11-24.txt`, section 6g). Whether another workflow runs that suite meanwhile was not read.

## Incidents (Rule 77)

- **`77647dc1` turned `verify` red, and my gates did not see it.** The `--self-test` branch ended in `process.exit(summarize() === 0 ? 0 : 1)`, an early report exit by the definition in `scripts/check-exit-drains.mjs`: the 64th against a ratchet of 63. I took the shape from `scripts/brief-phase-live-check.mjs`, which holds three of the 63, because `finish()` sets `process.exitCode` and does not stop, and the branch must not fall into the browser launch. I had not run the check that counts the choice. Reproduced in an isolated worktree before anything was changed (64 against 63; the same step on the commit before mine passes). Why it got through: the sixteen gates I ran were chosen by hand; the hook does not run `check:exit-drains`; the confidence gate has no row for it (quick mode scores 230/270, 85/100, on `77647dc1` and on `6e32367a` alike). Not done: the budget was not raised to 64, the exit was not re-spelled so the pattern misses it, `finish()` was not used in place. The fix removed the exit by moving the cases out of the script. Full record: `outbox/step16-exit-drains-regression-2026-11-24.txt`.
- **A wrong date in my own record, found before closing.** The regression record I committed in `c67aa5cd` said the BSD step had been red on main "since run 45223616096". The step each of the six red runs stopped at, read from the API on 2026-11-24: that run and the next two stopped at log step 69, "No script a workflow depends on became unreachable"; the BSD step was first seen red on 45442481067. So it is seen red on two runs, and on the three before them it did not run. Corrected in sections 1 and 6d and recorded in 6g. The CC-CMD's sentence that `verify` has been red since 45223616096 is about the job as a whole and stands: six of six runs failed.
- **Drafting claims corrected before they were committed.** "Four lines added, one changed" became the measured 5 insertions and 1 deletion against `18606cb7`. "The commit passed the hook twice" became the accurate account: its first attempt was refused by `check:staged-outbox`, its second passed. "Quick mode on the broken tree would have scored 85" was checked by running quick mode on `77647dc1`.
- **A detached waiter was not tracked by the harness.** I stopped it and restarted it as a tracked background command. Nothing was lost.

## Gates run before the docs commit

`node scripts/cc-cmd-status-check.mjs`, `npm run --silent check:citations`, `check:docs`, the hook's twelve checks on the commit itself, and the skip-directive scan on the commit message (0 matches). `check:docs` fails locally with "docs/JLAYER-PLAN.md: sports.modelled says 26, actual 25", as it does on `6e32367a`. The runner's step for it (log step 67, "Every claim a document makes is still true") passed on `c67aa5cd`, so the local failure depends on this sandbox and not on the tree. Nothing here touches that document.
