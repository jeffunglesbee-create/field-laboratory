# Claude Code Command — `Install Chromium` fails after ten minutes when a runner cannot resolve the Ubuntu mirrors, and the verify job then skips the F# suite

**Branch:** main — commit directly, do not create a feature branch or PR
**Repo:** field-laboratory
**Filed:** 2026-11-11 by CC, found when the verify run for `7e1a7e5` (the Manadon Sports Hub row) failed at "Install Chromium"
**Confidence gate:** `npm run gate` >= 95 before any commit
**Status:** FILED 2026-11-11. Nothing here is built and no option below is approved. The failure was still present at 16:05Z (the third probe of the loop under Task 1); the verify run it killed is waiting on it. Task 1 is unblocked, changes no tracked file, and is running.

---

## What was measured

Dates are UTC, 2026-11-11. Method for every line is the GitHub REST API (`gh api`), the job logs it serves, or a `probe-url.yml` runner probe; the sandbox shell reaches neither the runners nor GitHub's status feed.

1. **The red.** verify run 43048578660 (attempt 1, head `7e1a7e5`, push, created 15:27:42Z). Job `verify` (130619153946): 40 steps succeeded, 2 failed, 63 were skipped. The step `Install Chromium` (`npx playwright install --with-deps chromium`) ran 15:28:39Z to 15:38:45Z, 606 s, and failed: apt could not resolve `azure.archive.ubuntu.com`, `archive.ubuntu.com` or `security.ubuntu.com` ("Temporary failure resolving", 52 lines) while it resolved `packages.microsoft.com` at 15:28:40Z. Nine `E: Failed to fetch` lines end the step, and all nine packages are fonts (`fonts-ipafont-gothic`, `fonts-freefont-ttf`, `fonts-tlwg-loma-otf`, `fonts-unifont`, `fonts-wqy-zenhei`, `xfonts-encodings`, `xfonts-utils`, `xfonts-cyrillic`, `xfonts-scalable`). With no browser, the step `Render check against the LIVE slate` failed 15:40:41Z to 15:41:02Z on "browserType.launch: Executable doesn't exist", and every step without an `if:` after `Install Chromium` was skipped, **including `The F# suite, on the F# harness`**. Its build step and "Fail on any F# compiler warning" had passed; `deploy` (43050963610) and `live-check` (43051002729) concluded `skipped`, so nothing deployed. Runner image `ubuntu-26.04`, version 20261101.186.1, runner 2.338.2.
2. **Not one run.** verify-full run 43034161652, `workflow_dispatch` at 13:59:30Z on head `42ff5544` (not `7e1a7e5`): attempt 1 failed at `Install Chromium` in the `full` job, and all eight mutation shards failed in `Run ./.github/actions/mutation-shard`, seven of them about ten minutes in and one at about twenty (shard 1 in attempt 1, shard 7 in attempt 2; why those two ran longer was not read); attempt 2 (14:21:08Z to 14:42:42Z) failed the same way. The logs of attempt 2's `full` job and of its shard 3 each hold 52 "Temporary failure resolving" lines (the other seven shards were not read).
3. **Onset.** Before 13:11Z every `Install Chromium` step of the day passed in 15 to 39 s: 14 steps from 05:12Z to 13:10Z across verify, verify-full and live-check (the API's list of every run created 04:00Z to 16:10Z whose workflow installs Chromium; it shows only the latest attempt of a run, so attempt 1 of the 13:59Z run is not in it). The last success is 13:10:55Z (verify-full run 43026721724, 16 s). So the failure began between 13:11Z and 13:59Z.
4. **Still there.** `probe-url.yml` on the three `Release` URLs (`http://azure.archive.ubuntu.com/ubuntu/dists/resolute/Release`, `https://security.ubuntu.com/ubuntu/dists/resolute-security/Release`, `https://archive.ubuntu.com/ubuntu/dists/resolute/Release`), fresh `ubuntu-26.04` runners: runs 43051338510 (15:44Z), 43051864112 (15:47Z), 43053297493 (15:56Z) and 43054757439 (16:05Z) each answered `curl: (6) Could not resolve host` for all three. From the session sandbox at 15:45:57Z, `curl` got HTTP 200 for `http://archive.ubuntu.com/ubuntu/dists/resolute/Release` and for the `security.ubuntu.com` file above, through the sandbox proxy, and `azure.archive.ubuntu.com` did not resolve there.
5. **GitHub's status page**, read through the Exa fetch tool at about 15:47Z (the tool does not stamp reads): Actions "Operational", "No incidents reported today" for Nov 11; Nov 9 and Nov 10 list Actions incidents, the last resolved 17:55Z on the 10th. It was not re-read.
6. **How often the step is slow.** The API's page of the last 100 completed `verify.yml` runs (it reaches back to at least 2026-10-22), 80 of them with the step: median 21 s, p90 29 s, maximum 606 s (today's failure); over 120 s: 410 s on 2026-10-25 (run 40223436421), 171 s on 2026-11-09 (run 42678114036) and today's. `verify-full.yml`, 77 `full`-job steps: median 23 s; 457 s on 2026-10-24 (run 40121594305) and 604 s today (run 43034161652 attempt 2). Inside the mutation shards the install is a composite-action step the API shows as one, so the census cannot see it; `outbox/verify-full-runner-timing-2026-11-06.md` read one such stall by hand, 581 s with apt "Fetched 12.3 MB in 9min 23s", and wrote "That the mirror stall repeats: it was seen once in this run." It has repeated. `live-check.yml` runs the same install as an unnamed step (`run: npx playwright install --with-deps chromium`), so the census did not match it; it is not in the 80 and 77 above.

## Related, read before building (BUILD-ON-A)

Searched 2026-11-11 by content (`package mirror`, `azure.archive`, `mirror stall`, `apt line`, `Install Chromium`, `with-deps`) in `docs/CC-CMD-*.md` and `docs/GATE-TIMING.md`. Two documents touch it: item 10.14 of `docs/CC-CMD-2026-11-03-gate-hazard-residuals.md` (BUILT; recorded the 2026-11-06 stall as "a slow package mirror") and `docs/GATE-TIMING.md` (the same run). Neither plans anything for it, and `docs/CC-CMD-2026-11-06-gate-residuals-remaining.md` has no item for it. `.github/workflows/verify.yml` carries the reasoning this CC-CMD applies, in the comment under "EVERY REPORT BELOW RUNS, EVEN AFTER ONE FAILS": a failing step ends the job and hides what is behind it, and "each round cost a full run". That comment covers the last thirteen reports; the F# suite sits before it. Nine workflows run the same install line (`verify`, `verify-full`, `live-check`, `client-sections-probe`, `forecast-live-probe`, `lineups-card-probe`, `lineups-live-probe`, `metrics-screenshot`, `open-meteo-egress-probe`). A scan of the file names changed under `docs/` and `outbox/` on main in the last six hours found none about it.

## Premises, and the one command that tested each (Rule 100)

| premise | the command | result |
|---|---|---|
| The failure is name resolution on the runner, not the Ubuntu hosts being down | `probe-url.yml` with the three `Release` URLs, four runs; `curl -sS -m 12 -o /dev/null -w '%{http_code}'` on the same URLs from the sandbox at 15:45:57Z | runners: `Could not resolve host` for all three, four times of four; sandbox: HTTP 200 for `archive.ubuntu.com` and `security.ubuntu.com` |
| It is not caused by `7e1a7e5` | the verify-full dispatch of 13:59Z on head `42ff5544`, and the last good step at 13:10:55Z | the same failure on a different head, and the last success before the push |
| apt fetches only the nine font packages at that step | the `E: Failed to fetch` lines of job 130619153946 | nine lines, all fonts; every other dependency was already on the image, because a missing one would have been fetched and would have failed in the same list |
| The step has no time limit | read `.github/workflows/verify.yml`: the `verify` job and the step `Install Chromium` | neither carries `timeout-minutes`; the 606 s is apt's own giving up |
| GitHub reports no incident for today | the status page, 15:47Z | none listed for Nov 11 |

**Not known, and not claimed.** Why names under `ubuntu.com` do not resolve on the runner while `packages.microsoft.com`, `github.com` and `api.open-meteo.com` do (the runner's resolver, Azure, or the zone itself); when it ends; whether the other eight workflows fail the same way (only verify, verify-full and the probes were read); whether the render checks measure the same with the nine font packages absent (never measured, and a font fallback can change a bounding box). Public incident pages for the same two hosts exist for 2026-05-04 (DNS resolution failures, about two hours, resolved) and 2026-09-11 (apt connection failures); none is dated today, and neither says anything about this one.

## Task 1 — know when it is over, and rerun what it killed (unblocked, running)

It changes no tracked file. Probe, from a fresh runner, until all three hosts answer, then rerun only the failed job:

```
gh api -X POST repos/jeffunglesbee-create/field-laboratory/actions/workflows/probe-url.yml/dispatches -f ref=main -f 'inputs[urls]=http://azure.archive.ubuntu.com/ubuntu/dists/resolute/Release https://security.ubuntu.com/ubuntu/dists/resolute-security/Release https://archive.ubuntu.com/ubuntu/dists/resolute/Release'
gh api -X POST repos/jeffunglesbee-create/field-laboratory/actions/runs/43048578660/rerun-failed-jobs
```

The first costs about one billed runner-minute per probe; a rerun into the same outage costs the ten minutes again, which is why it waits. **Done when:** a probe run concludes `success` (three `RESULT: HTTP 200` lines), verify run 43048578660 then reaches a conclusion on attempt 2, and both are written under `outbox/` with `checked N of N probes` on the first line (Rule 91). The F# suite's result on `7e1a7e5` is read from that attempt, not inferred from the local 370 of 370.

## Options, for the owner

Each is a fix. Retrying until a mirror answers, or pointing apt at another mirror, is a fallback and is not offered.

1. **Isolate the failure.** Let the F# suite and every other row that needs no browser run when `Install Chromium` fails, with the gate the tail already uses (`!cancelled() && steps.build.outcome == 'success'`), or move the install behind them. Today that would have run the F# suite on `7e1a7e5` in this run instead of leaving it unrun. Cost: a workflow edit that has to classify the 63 steps this run skipped as needing a browser or not; a step wrongly left ungated would fail for a reason that says nothing about the commit.
2. **Remove the runtime dependency on apt.** `npx playwright install chromium` without `--with-deps` fetches the browser from Playwright's own host (its documented behaviour; not tested here), and the only things apt was still fetching were the nine fonts. Cost and unknown: the fonts would have to come from somewhere that does not depend on `ubuntu.com`, and whether the render checks' boxes and the screenshots hold without them has to be measured first, on a runner, before anything is changed.
3. **Bound the stall.** A step-level `timeout-minutes` of about 3 makes an outage end in three minutes where today it ends in ten. It fixes nothing else, shortens every red by about seven minutes of runner time, and would also fail the slow installs that did finish (457 s on 2026-10-24, 410 s on 2026-10-25).

Options 1 and 2 are independent; 1 alone would have answered today's question about the suite. Nine workflows carry the install line, and a change to any of them is a change to infrastructure (Rule 39): the dependency map above is the start of it, and the consumers still have to be audited.

## Not in scope

Deploying `7e1a7e5` around the red (`deploy.yml`'s verify gate skips a red commit on purpose, and a manual dispatch for a known-red commit is not done); editing any workflow, `scripts/render-check.mjs` or `src/Weather.fs`; the 2026-11-06 timing record, which stays as it was written.
