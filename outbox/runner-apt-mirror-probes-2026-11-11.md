checked 10 of 10 probes: 9 red, 1 green; the three Ubuntu mirror hosts from fresh runners, 2026-11-11 15:44Z to 16:58Z, then the rerun of the verify job they were waiting for

# Runner apt mirrors: the probe record and the rerun, 2026-11-11

Task 1 of `docs/CC-CMD-2026-11-11-runner-apt-mirror-dns.md`. Its done condition, quoted: "a probe run concludes `success` (three `RESULT: HTTP 200` lines), verify run 43048578660 then reaches a conclusion on attempt 2, and both are written under `outbox/` with `checked N of N probes` on the first line (Rule 91). The F# suite's result on `7e1a7e5` is read from that attempt, not inferred from the local 370 of 370." All four parts are met below. Times are UTC. The method for every number is the GitHub REST API (`gh api`) and the job logs it serves; the commands to re-read them are at the end.

## Coverage (Rule 91)

- **10 of 10 mirror probes.** `probe-url.yml` was dispatched ten times with the three URLs below, one by hand (15:44Z) and nine by a loop. The API lists 12 `probe-url.yml` runs created 15:30Z to 17:15Z; the other two (43059481392 at 16:33Z and 43059656512 at 16:34Z) are the DNS-over-HTTPS queries recorded in `outbox/runner-dns-ubuntu-doh-2026-11-11.txt`, not mirror probes.
- **One runner per probe, three hosts per runner:** 30 host lookups, 27 unresolved and 3 answered; the three answers are all from the one green probe.
- **7 Azure regions** among the ten runners (centralus, eastus, eastus2, southcentralus, westus, westus2, westus3). All 7 appear among the 9 red probes.
- **Not covered:** the other six workflows that carry the same install line and were not read (verify, verify-full and live-check were); any runner outside these ten; the cause of the outage; whether a green probe predicts a passing install (one green probe, one install after it: 1 of 1).

The URLs, in the order the probe printed them:

```
http://azure.archive.ubuntu.com/ubuntu/dists/resolute/Release
https://security.ubuntu.com/ubuntu/dists/resolute-security/Release
https://archive.ubuntu.com/ubuntu/dists/resolute/Release
```

## How the probes ran

The first probe was dispatched by hand at 15:44Z. The other nine were a shell loop in the session's scratchpad (not committed; it changes no tracked file): dispatch `probe-url.yml`, poll the run until it concludes, print the job log's `RESULT:` lines, wait 8 minutes, repeat; on the first run that concluded `success` it posts `rerun-failed-jobs` for 43048578660 and stops. It was written to give up after nine probes and did not need to.

## The ten probes

| probe | run | job | created (UTC) | runner region | conclusion | azure.archive.ubuntu.com | security.ubuntu.com | archive.ubuntu.com |
|---|---|---|---|---|---|---|---|---|
| manual | 43051338510 | 130629018286 | 15:44:20Z | centralus | failure | unresolved | unresolved | unresolved |
| 1 | 43051864112 | 130630863500 | 15:47:30Z | westus | failure | unresolved | unresolved | unresolved |
| 2 | 43053297493 | 130635967550 | 15:56:19Z | westus3 | failure | unresolved | unresolved | unresolved |
| 3 | 43054757439 | 130641120272 | 16:05:07Z | southcentralus | failure | unresolved | unresolved | unresolved |
| 4 | 43056254585 | 130646404853 | 16:14:00Z | eastus | failure | unresolved | unresolved | unresolved |
| 5 | 43057737585 | 130651635399 | 16:22:49Z | westus2 | failure | unresolved | unresolved | unresolved |
| 6 | 43059192745 | 130656792684 | 16:31:38Z | eastus2 | failure | unresolved | unresolved | unresolved |
| 7 | 43060651631 | 130661994204 | 16:40:32Z | westus3 | failure | unresolved | unresolved | unresolved |
| 8 | 43062081302 | 130667049134 | 16:49:21Z | eastus | failure | unresolved | unresolved | unresolved |
| 9 | 43063505553 | 130672151020 | 16:58:10Z | southcentralus | success | HTTP 200, 134667 bytes | HTTP 200, 136521 bytes | HTTP 200, 134667 bytes |

`unresolved` stands for `RESULT: unreachable — curl: (6) Could not resolve host: <that host>`. All 27 red cells match that form with the right host in the right position, and the 3 green cells match `RESULT: HTTP 200, <n> bytes`; the script that wrote this table asserts both, and that each run's conclusion agrees with its cells, before it writes anything. It stopped on each of three doctored copies of the logs (a host renamed, a 200 changed to 503, a fourth `RESULT:` line) and wrote the same file from the restored ones. The script and the logs are in the session's scratchpad and are not committed; the job logs are on GitHub.

The green probe's three lines, verbatim, in the order of the URLs above:

```
RESULT: HTTP 200, 134667 bytes
RESULT: HTTP 200, 136521 bytes
RESULT: HTTP 200, 134667 bytes
```

## The rerun

- 16:58:36Z the loop read probe 9 as `success`. At 16:58:37Z `POST /repos/jeffunglesbee-create/field-laboratory/actions/runs/43048578660/rerun-failed-jobs` answered `HTTP/1.1 201 Created`.
- **Attempt 2** of run 43048578660, head `7e1a7e5`: started 16:58:37Z, `success` at 17:04:23Z. Job `verify` (130672415439) 16:58:41Z to 17:04:22Z: 104 steps succeeded, 1 was skipped (`Keep the screenshot when the tints check fails`), 0 failed. Attempt 1, for comparison, had 40 succeeded, 2 failed and 63 skipped. The attempt 1 runner was in southcentralus and the attempt 2 runner in eastus2.
- **`Install Chromium`:** attempt 1 ran 15:28:39Z to 15:38:45Z (606 s) and failed with 52 lines containing "Temporary failure resolving" and exit code 100; attempt 2 ran 16:59:33Z to 16:59:53Z (20 s) and succeeded with 0 such lines.
- **`Render check against the LIVE slate`:** attempt 1 failed at 15:40:41Z with `browserType.launch: Executable doesn't exist at /home/runner/.cache/ms-playwright/chromium_headless_shell-1234/...`, the missing browser and not a second fault; attempt 2 passed it (`24/24 checks passed`, including `PASS  the venue table covers at least one venue on this slate`, `PASS  the chips all filled within the wait` and `PASS  every card whose venue the table knows carries a live chip`).
- **The F# suite on `7e1a7e5`, read from the attempt:** step `The F# suite, on the F# harness` succeeded 17:01:56Z to 17:01:57Z. Its log has `node build/VerifyMain.js`, then the harness's own deliberate `FAIL      broken` and `1/3 checks held` (its self-test, printed in every run), then `370/370 checks held` at 17:01:57Z. The page in that job was built from `commit 7e1a7e5` (`build-site: public/ assembled (index.html 64366 bytes, commit 7e1a7e5)`, 16:59:20Z).
- **What the success released.** verify's `success` triggers `deploy` and then `live-check`: `deploy` run 43064540575 (17:04:26Z to 17:05:15Z, success) built main HEAD `e5acdec` (`7e1a7e5` plus six docs-only commits) and uploaded 3 changed files; the live `version.txt` read `4210c884…` before it and `e5acdec11aea…` after. `live-check` run 43064687662 (17:05:18Z to 17:06:58Z, success): deployed stamp equals main, `deploy-landed` passed (newest deployable commit `7e1a7e5`), render check `24/24 checks passed`. The Manadon row's own record is `outbox/cc-session-2026-11-11-manadon-row.md`.

## A third workflow, observed failing during the outage

Not a probe, but found while reading the runs around them: `live-check` run 43056630500 (workflow_run, head `eabb568c`, 16:16:09Z) failed at its unnamed step `npx playwright install --with-deps chromium`, 16:16:24Z to 16:26:28Z (604 s), runner region eastus, with the same signature as verify attempt 1: 52 lines containing "Temporary failure resolving" (13 for `azure.archive.ubuntu.com`, 13 for `archive.ubuntu.com`, 26 for `security.ubuntu.com`) and `Installation process exited with code: 100`. Every later step was skipped. It was triggered by the hourly scheduled `deploy` run 43056589291 (16:15:55Z, success), which deployed nothing: the gate in its step "Does verify allow this deploy?" printed "Deploy skipped — verify is RED on 7e1a7e5" and every step from "Is the live site already on this commit?" through "Confirm the deployed page actually serves" was `skipped`. So the live site stayed on `4210c884…` until 17:05Z, and `live-check` runs after every `deploy` run, including one that did nothing.

## What this shows

- From 15:44Z to 16:49Z every fresh runner asked (nine, in seven regions) could not resolve any of the three Ubuntu hosts. At 16:58Z a fresh runner in southcentralus, a region that had answered red at 16:05Z, resolved all three and fetched all three `Release` files (HTTP 200). The change happened between the creation of probe 8 (16:49:21Z) and probe 9 (16:58:10Z).
- The install then passed in 20 s on a runner in eastus2 with no resolution failure, and verify attempt 2 concluded `success`.
- Failures were observed on runners at 13:59Z to 14:42Z (the two attempts of verify-full run 43034161652), 15:28Z to 15:38Z (verify attempt 1), 15:44Z to 16:49Z (every probe) and 16:16Z to 16:26Z (live-check). Nothing was observed between 14:42Z and 15:27Z, so that the failure was continuous from 13:59Z to 16:49Z is not established.

## What this does not show

- **The cause.** `outbox/runner-dns-ubuntu-doh-2026-11-11.txt` found Google Public DNS also unable to reach the `ubuntu.com` name servers for some lookups at 16:33Z to 16:34Z. The runner's own resolver was not asked, and nothing was measured between 16:49Z and 16:58Z that would say what changed.
- **That it is over.** One green probe and one green install. The zone answered some lookups and not others in that Google test, so a second outage is not excluded by this record.
- **The other six workflows** that run the install line (`client-sections-probe`, `forecast-live-probe`, `lineups-card-probe`, `lineups-live-probe`, `metrics-screenshot`, `open-meteo-egress-probe`).
- **Any of the three options** in the CC-CMD. They stay the owner's.

## Re-run these (Rule 89)

```
R=repos/jeffunglesbee-create/field-laboratory/actions
# 1. the ten mirror probes: 9 failure, 1 success (43063505553)
for id in 43051338510 43051864112 43053297493 43054757439 43056254585 43057737585 43059192745 43060651631 43062081302 43063505553; do gh api $R/runs/$id --jq '[.id,.conclusion]|@tsv'; done
# 2. attempt 2: completed success 7e1a7e5
gh api $R/runs/43048578660/attempts/2 --jq '[.status,.conclusion,.head_sha[0:7]]|@tsv'
# 3. the two steps: both success
gh api $R/runs/43048578660/attempts/2/jobs --jq '.jobs[] | select(.name=="verify") | .steps[] | select(.name|test("Install Chromium|F# suite")) | [.name,.conclusion]|@tsv'
# 4. attempt 2's log: 1 line of 370/370, 0 resolution failures
gh api $R/jobs/130672415439/logs | grep -c '370/370 checks held'
gh api $R/jobs/130672415439/logs | grep -c 'Temporary failure resolving'
# 5. the same two greps on attempt 1 (job 130619153946) must differ: 0 and 52
gh api $R/jobs/130619153946/logs | grep -c '370/370 checks held'
gh api $R/jobs/130619153946/logs | grep -c 'Temporary failure resolving'
# 6. the live-check that failed in the outage (job 130647694969): 52
gh api $R/jobs/130647694969/logs | grep -c 'Temporary failure resolving'
```

GitHub keeps job logs for a limited time (the repository's retention setting, which was not read), and that bounds these commands; the table above is the copy that outlives them.
