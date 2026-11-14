# Session record: the weather failure message names its cause — 2026-11-14

Session doc (Rule 67) for `docs/CC-CMD-2026-11-14-weather-failure-cause.md`, commissioned by the owner's word "Diagnostics" (Saturday 2026-11-14, 08:48 ET). The detailed build and check record is `outbox/egress-diagnostics-wiring-2026-11-14.md`; this file is the session's manifest.

**State:** built, scored on a runner twice, landed in two commits, and run once on a runner. Done conditions 1 to 4 and 6 are met. Condition 5, a runner line carrying a real region, is STAGED: the first runner pass read nothing because of a defect of mine, the fix landed in `5ba3efeb`, and no runner has printed the fixed line yet (unblock criteria below).

## HEAD progression

| HEAD | what it is | scored or read by |
|---|---|---|
| `e727a133` | `main` when the CC-CMD was filed | |
| `4c88e743` | the CC-CMD, docs only (09:05 ET) | |
| `ebca26e5` | the feature, on branch `egress-diagnostics` | `verify-full` 43613293578 (530 of 530, 3,578 s, run id `ebca26e533b1-451a9c10e26c`), `verify` 43613296336 |
| `7be7dd00` | merge of that branch into `main`, `--no-ff` | `verify` 43618962875 success, `guards` 43618962988 success, `deploy` 43620027746 success, `live-check` 43620118846 failure (the weather red, below) |
| `0391f380` | the probe's three artifacts, committed by the workflow's last step | probe run 43620413444 success |
| `d7a8e367` | the region fix, on branch `egress-region-fix` | `verify-full` 43622319008 (530 of 530, 3,080 s, run id `d7a8e3676ee8-5443c49158b6`), `verify` 43622321466 (success) |
| `5ba3efeb` | merge of that branch into `main`, `--no-ff` | `verify` 43627238605 success, `guards` 43627238792 success, `deploy` 43627825413 success, `live-check` 43627924560 success (105 of 105; the weather chips filled, so no late probe ran) |
| `cdf171a8` | docs: the UTC-only Suite check, appended to the soccer CC-CMD | |
| `eddd7e97` | docs: this CC-CMD's Status (PARTIAL) and Outcome | |

The two merges are `--no-ff` because the commit that records a branch's CI measurement carries the skip directive in its message; a fast-forward would have made that the head commit of `main` and suppressed `verify`, `guards` and the rest for the landing SHA.

## What each commit did

- `ebca26e5`: `scripts/egress-path-lib.mjs` (new): `describeError`, `probeFacts`, `describeEgressPath`, `judgeE2E`, and the modes `--live`, `--judge`, `--self-test`. `scripts/render-check.mjs`: text only, 8 insertions and 1 deletion, one sentence added to the failing chip check; no verdict, tolerance or attribution changed. 23 mutations. `check:egress-path` in `package.json` and `verify.yml`. Three steps in `open-meteo-egress-probe.yml`.
- `d7a8e367`: `parseSetupInfo` reads the runner's `Group`/`Detail` keys and refuses any other shape; the self-test's fixture is the runner's own 761 bytes; one mutation re-anchored and four added (27 in all).

## Verified end to end, and what is staged

**Verified, with the artifact that shows it**

- The new text appears in a real red, and the verdicts did not move: `live-check` 43620118846 (after) against 43603906789 (before). Each has 101 PASS and 4 FAIL, and the four failing checks are the same names: `the chips all filled within the wait`, `every card whose venue the table knows carries a live chip`, `every live chip reads as a temperature and nothing else`, `every live chip carries a real roof caveat`. Only the after run carries `egress-path:`.
- The module on a runner, on the four failure shapes: `outbox/egress-path-live-20261114T171939Z.txt`, first line `checked 4 of 4 shapes`, last line `VERDICT: pass, 4 of 4 shapes as expected`. The `.invalid` name gave `ENOTFOUND` at stage `dns`; the closed loopback port `ECONNREFUSED` at `connect`; the documentation address `UND_ERR_CONNECT_TIMEOUT` at `connect-budget` after 13.5 s; the real host `HTTP 200`.
- The fault-injected end to end: `outbox/egress-path-e2e-20261114T171939Z.txt`, last line `VERDICT: observed — the chip check's FAIL carries egress-path:, a probe-error with a cause, and dns-v4=`. The page's own window read `host-silent` (8 requests over 14,000 ms, none answered), the attribution the live reds carry.
- Where a runner keeps its region: `outbox/egress-path-survey-20261114T171939Z.txt`, `.setup_info` beside `Runner.Worker`, 761 bytes, keys `Group` and `Detail`, `Region: southcentralus`, `Cloud: Azure`.

**Staged (Rule 74): a runner printing the fixed region.** Staged: `runner=image ubuntu26@… region southcentralus cloud Azure` printed by a runner. Blocked by: no runner has run `egress-path-lib.mjs` with the fixed parser since it landed; the one probe dispatch the owner approved is used (run 43620413444), and the late probe only runs when the page's weather chips fail. Unblocked by: the next `live-check` red, or the owner's word for one more dispatch of `open-meteo-egress-probe.yml` on `main`. Verify: `gh run view <live-check run id> --log | grep -o 'runner=image[^|(]*'` must print a line that contains `region southcentralus cloud Azure`; or, after a dispatch, `grep -o 'runner=.*' outbox/egress-path-live-<stamp>.txt`. The `live-check` after the landing (43627924560) was green, so its late probe did not run and printed no `runner=` line.

## Done conditions

| # | printed output | status |
|---|---|---|
| 1 | `78/78 checks passed` (76/76 at landing); 27 registered `egress-path-*` mutations, each caught by a named check (`--ids`: `6/6 checks passed` for the five of the fix; by hand, 1 to 3 checks red for each) | met |
| 2 | render-check diff: 1 file, 8 insertions, 1 deletion; no verdict, tolerance or attribution line touched | met |
| 3 | `checked 4 of 4 shapes` ... `VERDICT: pass, 4 of 4 shapes as expected` | met |
| 4 | `VERDICT: observed` | met |
| 5 | `runner=` carries a real region string | STAGED (Rule 74), see above |
| 6 | the gate scored on a runner: 530 of 530 for `ebca26e5` (43613293578) and 530 of 530 for `d7a8e367` (43622319008); `verify` green on the landing SHAs | met |

## What was wrong, and what it cost

- **A figure I had not read.** I told the owner the local gate takes "about 52 minutes". That number is the wait in CI, recorded in `docs/GATE-TIMING.md` and `outbox/cc-session-2026-11-12-venue-review-counts.md`. The local run does not finish on this container: the mutation row has 1,528 entries (1,532 now), 246 of them (a count of the entries whose expectation is the harness's own self-test) run it, at 32 to 52 s each at the three entries I timed, and `docs/GATE-TIMING.md` puts that at about 2.5 hours serial. I stopped it after 4,697 s at about entry 176. The cost was 78 minutes of wall time and a correction to the owner. The lab's own method (Task 9 of the soccer CC-CMD) was in the repository: 22 rows locally, `verify-full` on a work branch, land with the run id.
- **A parser written from a guess.** The first runner pass printed `region unreadable (no Region line)` on every line, because I read lowercase keys from a fixture I had written; the runner's keys are `Group` and `Detail`. Rule 100's table has the same shape. Fixed in `d7a8e367`; the full account is in the wiring note.
- **A stop signal sent to the wrong process.** The driver that stops the in-process mutation suite matched its `sh -c` wrapper. Nothing was lost; checked by sha256, `--stranded` and the state directory.
- **A local gate that failed under this shell's time zone.** `TZ=America/New_York` fails one F# check that passes under `TZ=UTC`; the finding is added to `docs/CC-CMD-2026-11-11-soccer-live-scores.md`, which owns the check. Local gates are run as `TZ=UTC npm run gate`.

## Not established

These are not findings; each is a premise with the command that would test it.

- **Why Chromium got no answer in the silent reds.** The description cannot say; it names Node's path at a later moment.
- **One measurement the description cannot yet explain.** In `live-check` 43620118846 the late node probe's `fetch` failed with `UND_ERR_CONNECT_TIMEOUT` (`attempted address: api.open-meteo.com:443, timeout: 10000ms`), and the description's own TCP connect to the one address DNS returned, `51.81.167.44:443`, then answered in 12 ms. The description has no TLS stage and connects only to the first address of each family. Hypotheses, both untested: (a) the host's A record rotates (the probe run's live artifact saw `167.114.211.86`, this red `51.81.167.44`) and one address is not reachable from some runner egress; (b) TCP completes and the TLS handshake stalls, because undici's connect budget covers lookup, connect and TLS. Tests, on a runner: resolve the name 20 times and list the distinct addresses; for each address, a TCP connect and a TLS handshake with their times (`openssl s_client -connect <ip>:443 -servername api.open-meteo.com`, or `node:tls`). Extending `describeEgressPath` with a TLS stage and every address would put that in each red; it was not built, because the approval covered DNS and connect per family.
- **A count from the rain/precipitation pair probe.** `outbox/rain-precip-pair-2026-11-14-2026-11-14T14-22-21.jsonl` has 1,680 records, 407 of them mention `UND_ERR_CONNECT_TIMEOUT`, from a runner. The file records no addresses, so it cannot separate (a) from (b).

## Residual

- The remote branches `egress-diagnostics` (merged) and, after landing, `egress-region-fix` (merged) remain. This session's proxy refuses ref deletion (403 on `git push --delete` and on REST `DELETE /git/refs`), and I did not look for another route. From a machine with a token: `gh api -X DELETE repos/jeffunglesbee-create/field-laboratory/git/refs/heads/egress-diagnostics`, and the same for `egress-region-fix`.
- Cosmetic, left alone under TOUCH-ONLY-A: the survey step prints the runner directory listing twice; `forecastUrl(probe)` is evaluated a second time in `render-check.mjs`, outside the `try`, and is a pure function of a constant.
