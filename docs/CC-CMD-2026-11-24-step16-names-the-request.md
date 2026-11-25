# Claude Code Command — live-check step 16 prints "Failed to load resource … 429" with no URL, so a red cannot say which host refused

**Branch:** main — commit directly, do not create a feature branch or PR
**Filed from:** field-laboratory
**Ask to:** field-laboratory (`scripts/schedule-live-check.mjs`, `scripts/console-error-text.mjs`, `scripts/schedule-live-check-names-request.mjs`, `.github/workflows/live-check.yml`)
**Filed:** 2026-11-24, on the owner's "Next approved" (Tue 14:12 ET) to a proposal made after "429 should be over" (Sun 2026-11-22 14:59 ET)
**Status:** DONE 2026-11-24, landed as `18606cb7` (this CC-CMD), `77647dc1` (the change, which turned `verify` red at "No check script kills itself mid-write") and `c67aa5cd` (the fix: that step passes on `verify` 45478103493). The stub check is 12 of 12 on the runner (live-check 45478165204, step "Step 16 names the request behind a page error", Chromium 151.0.7922.34). Limit: the naming has not been seen against a real third-party 429 on the deployed page. That waits on a deploy landing and step 16 going red; see Residual, which has the command that reads it and a scheduled task armed for 2026-11-26 13:00 ET. Session doc: `outbox/cc-session-2026-11-24-step16-names-the-request.md`.

---

## What was read (2026-11-24; each line says how)

- **The failing step.** `live-check.yml` step 16, "The pitcher and records rows appear on the deployed page", runs `URL=https://field-laboratory.jeffunglesbee.workers.dev/ node scripts/schedule-live-check.mjs`. It is the script's only caller: a grep over workflows, `package.json`, `scripts/` and `docs/` finds three other scripts naming it in comments and one CC-CMD citing its header.
- **The reds.** Three runs failed at that step, with 30, 30 and 6 console errors, each exactly `Failed to load resource: the server responded with a status of 429 (Too Many Requests)`: runs 45043449054 (2026-11-22T16:22Z), 45057926734 (2026-11-22T18:56Z) and 45198474360 (2026-11-23T14:50Z). Counted from the job logs with `gh api` today; an error prints twice in a log (the check detail and its annotation echo), so 60, 60 and 12 lines. The render step of the same three runs reports 30, 30 and 6 weather requests. That is a count match and no attribution.
- **Same commit, different outcome.** Runs 45185605230 (2026-11-23T13:36Z, success) and 45198474360 (14:50Z, failure) both ran `8e5fd05e`.
- **The hosts.** `grep -rhoE 'https://[a-zA-Z0-9.-]+' src/*.fs` names three a page request can go to: `field-relay-nba.jeffunglesbee.workers.dev`, `statsapi.mlb.com` and `api.open-meteo.com`. The 429 text names none of them.
- **The browser pair.** `package.json` pins `playwright ^1.62.1` (lock 1.62.1), whose Chromium is revision 1234 (151.0.7922.34), what `npx playwright install chromium` gives the runner. The authoring sandbox has revision 1243, which the script launches by `executablePath`, so the sandbox cannot read the runner's pair.
- **The premise, tried to refute it.** Playwright 1.62.1 from the lab's `node_modules`, launched the way the script launches, against local servers: the app, a third party answering 429 with and without CORS headers, and a closed port. Seven console errors came back. `location().url` is the failed request for a 429 (same-origin and cross-origin) and for `net::ERR_CONNECTION_REFUSED` and `net::ERR_FAILED`. A CORS refusal's text already names the request and its location is the page. An app-level `console.error`'s location is the script. A first run of the same probe on the global Playwright 1.63.0 had agreed; it was not the pin, so it was run again.
- **The pipeline.** Published build `e290b24`, newest deployable commit `59af6e8` (live-check run 45395655828, step 9). `deploy.yml`'s scheduled runs conclude `success` with every step after "Does verify allow this deploy?" skipped (run 45395605778: the build, the publish and the confirmation all `skipped`), so a green deploy run is not a deploy. verify on main was last green at run 45108603022 (2026-11-23T03:53Z) and has been red since run 45223616096 (2026-11-23T17:04Z). Six live-check runs between 2026-11-22 and 2026-11-24 stopped at "The deploy landed", so step 16 did not run on them.

## The ask

When the schedule check's "no page errors" assertion fails, print each "Failed to load resource" error with the URL of the request that failed, Chromium's own text first. Nothing else about the check changes: no tolerance, no retry, no verdict, no new assertion.

## Tasks (all inside this session)

**Task 0. Probe.** Done, above.

**Task 1. Red first.** `scripts/schedule-live-check-names-request.mjs --script <copy of the script at HEAD>` runs the real script against a stub page that fires two requests answered 429 and one app-level `console.error`. Result: 5 of 7 checks held; "the first 429 is named by its URL" and "the second" both failed with `lines naming it: 0`. Done.

**Task 2. The edit.** `describeConsoleError(text, requestUrl)` appends ` — <url>` to text that starts `Failed to load resource`, and only when the message carries a URL. The `console` handler in `scripts/schedule-live-check.mjs` calls it with `m.location()?.url`. It was first built inside that script with a `--self-test` branch (five cases, no browser; red first against an identity stub: 2 of 5 failed, then 5 of 5). That branch ended in an early `process.exit(summarize() ...)` and turned `verify` red, see the regression below. The helper now lives in `scripts/console-error-text.mjs`, which imports nothing and exits nowhere, and the five cases are the first five checks of `scripts/schedule-live-check-names-request.mjs`. Done.

**Task 3. The proof.** On the final layout the combined check passes 12 of 12 on ten runs out of ten, and 10 of 12 on the script as it stood before the change (red first: the two 429 URLs are not named). A control and six mutations, each anchor asserted unique before it ran: drop the append, drop the prefix guard, put the URL first, drop the empty-URL guard, read the wrong field (`.urlx`), stop calling the helper. The control is green and all six are caught: three by the helper cases and the stub run together, the empty-URL guard only by the helper cases, the wrong field and the missing call only by the stub run. That split is why both parts exist. The matrix is in `outbox/step16-exit-drains-regression-2026-11-24.txt`, section 6b; the first layout's, with the same split, is in section 5 of `outbox/step16-page-error-names-request-2026-11-24.txt`. Done.

**Task 4. Wire it.** One live-check step, "Step 16 names the request behind a page error", before the always-last Chromium step. It runs `scripts/schedule-live-check-names-request.mjs`. It is gated on the Chromium install only and not on `steps.landed`, because it reads a stub and a stuck deploy must not keep it from running. The first source commit was gated by sixteen checks I chose by hand, and `check:exit-drains` was not among them. The fix was gated by running every non-browser step of the `verify` job that this sandbox can run (83 of 121) on the fixed tree and on the commit before mine, plus `check:browser-gate` (verdict gated) and `check:push-lands` (27 loops). Done.

**Task 5. Push, then read the runner.** Done twice, because the first push needed a fix. On 77647dc1 (the first layout) live-check dispatch 45473584970 stopped at "The deploy landed" as predicted and ran the new step: step 18, success, self-test 5/5, stub check 7/7, both stub URLs named, on Chromium 151.0.7922.34 (playwright chromium v1234). Its `verify` run, 45473543164, failed at `check:exit-drains`. On c67aa5cd (the fix) `verify` 45478103493 passes the step that had failed (log step 39: 207 scripts scanned, early report exits 63 against a budget of 63, 4/4) and fails once, at log step 71, "The mutate scripts break a copy, never the tracked tree": the BSD grader's, with the same four failing clauses and the same 82 of 86 as run 45442481067, which is four commits before mine (the two log sections are 148 lines each and a diff reports 0 lines differing). Live-check dispatch 45478165204 stopped at "The deploy landed" and ran the new step: step 18, success, 12/12, both stub URLs named, the same Chromium. Done.

**Task 6. Outbox manifest (last).** `outbox/cc-session-2026-11-24-step16-names-the-request.md` (Rule 67: the HEAD progression, what was verified and what waits), beside `outbox/step16-page-error-names-request-2026-11-24.txt` (the first layout's measurements), `outbox/step16-exit-drains-regression-2026-11-24.txt` (the regression and the final layout's numbers), and the probe and mutation files. Done.

## Done condition (probe output, not "it deployed")

1. `node scripts/schedule-live-check-names-request.mjs` prints `12/12 checks passed`, exit 0, locally and in a live-check run. In that run the step "Step 16 names the request behind a page error" has conclusion `success` and its log carries two lines of the form `Failed to load resource: the server responded with a status of 429 (Too Many Requests) — http://127.0.0.1:<port>/stub-429?venue=a` and `…venue=b`. **Met:** live-check 45478165204 (head `c67aa5cd`), step 18, 12/12, both lines present, Chromium 151.0.7922.34 (playwright chromium v1234).
2. The same check against the script as it stood before the change (`git show 18606cb7:scripts/schedule-live-check.mjs`) prints `10/12 checks passed`, and a control plus six mutations behave as the matrix says: `node outbox/step16-page-error-names-request-2026-11-24-mutate.mjs` reports the control green, 7 variants applied (the script before the change and six mutations of the helper and the handler), each anchor unique, 0 not caught. **Met locally:** `outbox/step16-exit-drains-regression-2026-11-24.txt`, section 6b.
3. On the head that carries the change, `verify`'s step "No check script kills itself mid-write" has conclusion `success` and `npm run check:exit-drains` prints `early report exits:    63  (ratchet, budget 63)`. **Met:** `verify` 45478103493, log step 39. That run's other result, the failure at "The mutate scripts break a copy, never the tracked tree", is the BSD grader's and is identical to the run before either of my commits (see Task 5).

The first version of this Done condition named a `--self-test` flag, 5/5 and 7/7. That layout turned `verify` red; the condition above is the one the final layout meets.

## Regression found in the same session, and its fix

`77647dc1`, the first source commit, turned `verify` red at "No check script kills itself mid-write". Its `--self-test` branch ended in `process.exit(summarize() …)`, an early report exit: the 64th against a ratchet of 63 (`docs/early-exit-budget.txt`). The sixteen gates I ran before that commit were chosen by hand, and `check:exit-drains` was not among them; the pre-commit hook does not run it either, so the commit passed the hook and the failure appeared on the runner. `c67aa5cd` moves the helper into `scripts/console-error-text.mjs` and its five cases into the stub driver, so nothing in the script exits early. The budget was not raised and the exit was not re-spelled to dodge the pattern. The record, with the reproduction, the fix and the runner's reading: `outbox/step16-exit-drains-regression-2026-11-24.txt`.

The hook's gap is item F1 of `docs/CC-CMD-2026-11-06-gate-residuals-remaining.md` (BUILD-ON-A: added to that open CC-CMD, not filed again). Its trigger read "built when the owner agrees that this check belongs in the hook". The owner's word came the same evening ("Hook", Tue 2026-11-24 21:16 ET) and F1 is built: `a2fe413e`, with the proof in `outbox/hook-runs-exit-drains-proof-2026-11-24.txt`.

## Not in scope

- `scripts/render-check.mjs` and `scripts/brief-phase-live-check.mjs`: the owner's hold on attribution changes there stands. Nothing in them was edited.
- A tally by host, a retry, a tolerance, or reading a 429 as a pass.
- Reporting anything to Open-Meteo: the owner's call.
- The red verify and the stuck deploy: another session's CC-CMDs (the BSD next-goal grader). Not touched.
- `docs/CC-CMD-2026-11-10-live-chip-refused-payload.md` (CLOSED on option 3), `docs/CC-CMD-2026-10-17-weather-live-http-outage.md` and `docs/CC-CMD-2026-10-20-weather-first-call-connect.md` (DONE): read for their rulings and not edited. This task changes what step 16 prints and decides nothing they ruled.

## Residual

The attribution has not been seen against a real third-party 429 on the deployed page, because step 16 has not run since the change and cannot until a deploy lands. No work is deferred; this is a reading that waits on an event.

- **Blocked by:** step 16 is gated on "The deploy landed" (published is the newest deployable commit). Published is `e290b24`; the newest deployable commit is `c67aa5c`. `deploy.yml` holds its deploy while `verify` on main is red, and `verify` is red at the BSD grader's step (Task 5).
- **Unblocked when:** `verify` on main goes green, the scheduled deploy publishes, and a live-check run then reaches step 16 and fails it on a 429.
- **Armed:** a scheduled task, Thu 2026-11-26 13:00 ET (18:00Z), runs the command below over every live-check run created after 2026-11-24T19:45Z, reports verbatim, and arms one more 48 hours out if none has reached step 16, until 2026-12-08.
- **Read it with:** when step 16 next goes red, the hosts are one command away:

```
gh api repos/jeffunglesbee-create/field-laboratory/actions/jobs/<job id>/logs | sed -E 's/^[0-9T:.-]+Z //; s/\x1b\[[0-9;]*m//g' | grep -oE 'status of 429 \(Too Many Requests\) — https?://[^/ ]+' | sed -E 's/.* — //' | sort | uniq -c
```

Each error prints twice in a log, so the counts read double. Run on a synthetic log of two Open-Meteo errors and one relay error, each printed twice, it printed `4 https://api.open-meteo.com` and `2 https://field-relay-nba.jeffunglesbee.workers.dev`. A red whose "Failed to load resource" lines carry no URL after ` — ` would mean the runner's Chromium differs from the one measured here, which the stub check in the same run would have reported first.
