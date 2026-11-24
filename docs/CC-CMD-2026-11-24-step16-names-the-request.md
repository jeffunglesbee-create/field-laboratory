# Claude Code Command — live-check step 16 prints "Failed to load resource … 429" with no URL, so a red cannot say which host refused

**Branch:** main — commit directly, do not create a feature branch or PR
**Filed from:** field-laboratory
**Ask to:** field-laboratory (`scripts/schedule-live-check.mjs`, `scripts/schedule-live-check-names-request.mjs`, `.github/workflows/live-check.yml`)
**Filed:** 2026-11-24, on the owner's "Next approved" (Tue 14:12 ET) to a proposal made after "429 should be over" (Sun 2026-11-22 14:59 ET)
**Status:** IN PROGRESS 2026-11-24. Tasks 0 to 4 are done and gated in the working tree; the push (Task 5) and the outbox manifest (Task 6) are next.

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

**Task 2. The edit.** `describeConsoleError(text, requestUrl)` in `scripts/schedule-live-check.mjs` appends ` — <url>` to text that starts `Failed to load resource`, and only when the message carries a URL. The `console` handler calls it with `m.location()?.url`. `--self-test` (five cases, no browser) was run red first against an identity stub: 2 of 5 failed, then 5 of 5 after the real body. Done.

**Task 3. The proof.** The stub check passes 10 of 10 runs on the edited script. Six mutations, each with an anchor asserted unique before it ran: drop the append, drop the prefix guard, put the URL first, drop the empty-URL guard, read the wrong field (`.urlx`), stop calling the helper. All six are caught. Three by both the self-test and the stub check; the empty-URL guard only by the self-test; the wrong field and the missing call only by the stub check. That split is why both exist. Done.

**Task 4. Wire it.** One live-check step, "Step 16 names the request behind a page error", before the always-last Chromium step. It runs the self-test and then the stub check. It is gated on the Chromium install only and not on `steps.landed`, because it reads a stub and a stuck deploy must not keep it from running. Gates run locally, all exit 0: `check:browser-gate` (verdict gated), `check:workflows` 71/71, `check:push-lands` (27 loops), `check:import-purity` 3/3, `check:short-circuit` 9/9, `check:script-orphans` 3/3, `check:clean-source` 5/5, `check:citations`, `check:harness` 11/11, `check:no-launch`, `check:gate-rows` 7/7, `check:mutation-anchors` 221/221, `check:staged-outbox`, `check:staged-verifier`, `check:boundary`, `check:setup-script`. Done.

**Task 5. Push, then read the runner.** Push to main. Dispatch live-check on main. It will stop at "The deploy landed" while the deploy is stuck; the new step is not behind that, so it runs on the runner's Chromium revision 1234. Read its conclusion and its log with `gh api`.

**Task 6. Outbox manifest (last).** `outbox/step16-page-error-names-request-2026-11-24.txt`: the commits, the dispatch run id, the red-first and green outputs, the mutation matrix and the runner reading. The stub check is committed beside it as `scripts/schedule-live-check-names-request.mjs`.

## Done condition (probe output, not "it deployed")

1. `node scripts/schedule-live-check.mjs --self-test` prints `5/5 checks passed`, exit 0.
2. `node scripts/schedule-live-check-names-request.mjs` prints `7/7 checks passed`, exit 0, locally and in the live-check run of Task 5. In that run the step "Step 16 names the request behind a page error" has conclusion `success` and its log carries two lines of the form `Failed to load resource: the server responded with a status of 429 (Too Many Requests) — http://127.0.0.1:<port>/stub-429?venue=a` and `…venue=b`.
3. The same stub check against the script at HEAD prints `5/7 checks passed`, and the six mutations are caught (both recorded in the manifest).

## Not in scope

- `scripts/render-check.mjs` and `scripts/brief-phase-live-check.mjs`: the owner's hold on attribution changes there stands. Nothing in them was edited.
- A tally by host, a retry, a tolerance, or reading a 429 as a pass.
- Reporting anything to Open-Meteo: the owner's call.
- The red verify and the stuck deploy: another session's CC-CMDs (the BSD next-goal grader). Not touched.
- `docs/CC-CMD-2026-11-10-live-chip-refused-payload.md` (CLOSED on option 3), `docs/CC-CMD-2026-10-17-weather-live-http-outage.md` and `docs/CC-CMD-2026-10-20-weather-first-call-connect.md` (DONE): read for their rulings and not edited. This task changes what step 16 prints and decides nothing they ruled.

## Residual

The attribution has not been seen against a real third-party 429 on the deployed page, because step 16 has not run since the change and cannot until a deploy lands. No work is deferred; this is a reading that waits on an event. When step 16 next goes red, the hosts are one command away:

```
gh api repos/jeffunglesbee-create/field-laboratory/actions/jobs/<job id>/logs | sed -E 's/^[0-9T:.-]+Z //; s/\x1b\[[0-9;]*m//g' | grep -oE 'status of 429 \(Too Many Requests\) — https?://[^/ ]+' | sed -E 's/.* — //' | sort | uniq -c
```

Each error prints twice in a log, so the counts read double. Run on a synthetic log of two Open-Meteo errors and one relay error, each printed twice, it printed `4 https://api.open-meteo.com` and `2 https://field-relay-nba.jeffunglesbee.workers.dev`. A red whose "Failed to load resource" lines carry no URL after ` — ` would mean the runner's Chromium differs from the one measured here, which the stub check in the same run would have reported first.
