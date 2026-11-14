# live-check reds, 2026-10-09 to 2026-11-14: what 268 job logs say — 2026-11-14

**State:** read-only and finished. 268 of 268 live-check job logs in the window were read. Nothing was dispatched, and no workflow, script or source file was changed. The three newest weather reds are the page getting no answer from `api.open-meteo.com` in either request wave. Why it got none is not established. The other 73 reds in the window have other causes, listed below.

## The answer to "Live-check"

The owner's word was "Live-check" (Saturday 2026-11-14, 08:09 ET), taking up the offer to read the failing runs' logs, read-only, and name the cause.

- **The newest reds are one class.** Runs 43348342619 (2026-11-13T01:54Z), 43539102233 (2026-11-14T01:11Z) and 43587347908 (2026-11-14T10:52Z) failed at "Render the deployed page and assert on it". In each, the page asked Open-Meteo twice (a first wave about 1 s after load, a second about 9 s after), every request ran to its timeout, and none got a response. In each, 20 of the render check's 24 assertions passed; the 4 that failed are the chip assertions, which cannot pass when no chip filled.
- **Why there was no response is not established.** A fixed property of the runner image or of the region is ruled out: the same image and region answered in 30 ms 92 minutes before one of the silent runs. A change of image build, an event on the west-coast egress path, and an event at Open-Meteo each fit the logs, and the logs cannot tell them apart (section "Three explanations the logs leave open").
- **The reds are not all weather.** Of the 76 reds in the window, 3 are this silence. The other 73 fall in ten classes. Each of those ten had no recurrence in the 5 to 177 runs that ran after its last red (table below).
- **The check is strict on purpose.** `scripts/render-check.mjs` takes `--tolerate-unreachable`; `.github/workflows/verify.yml` passes it and `.github/workflows/live-check.yml` does not (0 matches for `--tolerate` in the latter). `docs/CC-CMD-2026-10-17-weather-live-http-outage.md`, section "The hazard this must not reopen", gives the reason: "if unreachable were tolerated everywhere, the check could pass forever having never run." Nothing here proposes loosening it.

## What was read, and how far it reaches

| item | value |
|---|---|
| runs listed | 300 `live-check` runs created 2026-10-09T00:03Z to 2026-11-14T10:52Z: 192 success, 76 failure, 31 skipped, 1 cancelled |
| logs read | 268 of 268 runs that ran a job (skipped and cancelled runs carry none); every one has a cloud and region read from its log header |
| classified | 76 of 76 reds carry a `fail_class` |
| made Open-Meteo requests | 214 of the 268 (38 made none, 16 never reached the weather step) |
| artifact | `outbox/live-check-census-2026-11-14.tsv`, one row per run |
| reader | `outbox/live-check-census-2026-11-14.mjs`, which reads the TSV only |
| mutation harness | `outbox/live-check-census-2026-11-14-mutate.mjs` |

The TSV's columns were filled on 2026-11-14 from the runs' job logs by scratch scripts that are not committed. The TSV is the committed artifact; re-deriving any row is `gh run view <run_id> --log` on that run. `om_class` is a duration rule on the log line `open-meteo (start+duration): …` (defined in the script's header) and reads no HTTP status. `fail_class` is assigned from the failing step's log text; the rules are the "Classes" paragraphs below.

## Script output

`node outbox/live-check-census-2026-11-14.mjs`, pasted as printed (exit 0):

```
live-check census, 2026-11-14   source: the TSV only (no logs read, no network)

COVERAGE
  rows read                     300 of 300 data rows in the TSV
  conclusions                   1 cancelled, 76 failure, 31 skipped, 192 success
  created_at window (UTC)       2026-10-09T00:03Z .. 2026-11-14T10:52Z
  ran a job (success|failure)   268 of 300   (the other 32 were skipped or cancelled and carry no log)
  ... with a cloud/region read  268 of 268
  reds with a fail_class        76 of 76
  made >= 1 Open-Meteo request  214 of 268   (none 38, step not reached 16, unclassified 0)

REDS BY CLASS (76 reds)
  fail_class                   reds  share  first (UTC)        last (UTC)         runs since last  red of those
  ---------------------------  ----  -----  -----------------  -----------------  ---------------  ------------
  brief-game_live-on-final     23    30%    2026-10-10T20:08Z  2026-11-08T22:56Z  45               9
  axis-desk-card-timeout-30s   19    25%    2026-10-09T09:16Z  2026-11-03T07:09Z  84               22
  deploy-not-landed            12    16%    2026-10-16T07:16Z  2026-11-11T22:49Z  18               4
  venue-table-covers-none      8     11%    2026-10-09T10:53Z  2026-11-09T12:03Z  42               7
  weather-partial-fill         3     4%     2026-10-24T12:44Z  2026-11-06T00:23Z  64               18
  weather-silent-whole-window  3     4%     2026-11-13T01:54Z  2026-11-14T10:52Z  0                0
  brief-card-not-rendered      2     3%     2026-10-23T01:36Z  2026-10-30T02:00Z  109              29
  fable-crash-signature        2     3%     2026-10-19T22:26Z  2026-11-13T14:16Z  5                2
  page-not-ready-30s           2     3%     2026-10-14T13:49Z  2026-10-20T13:37Z  177              49
  playwright-install-exit      1     1%     2026-11-11T16:16Z  2026-11-11T16:16Z  20               5
  state-transition-no-change   1     1%     2026-10-23T08:48Z  2026-10-23T08:48Z  156              43

REDS BY FAILING STEP
  failing step                                                     reds
  ---------------------------------------------------------------  ----
  A finished game shows the brief written after it finished        25
  The score's weight axis interpolates on the DEPLOYED page        19
  Render the deployed page and assert on it                        17
  The deploy landed (published is the newest deployable commit)    12
  Build (the venue table this check derives its expectation from)  2
  Run npx playwright install --with-deps chromium                  1

WEATHER: RUNS THAT MADE >= 1 OPEN-METEO REQUEST (214 runs), BY RUNNER IMAGE
  image                        runs  SILENT  answered
  ---------------------------  ----  ------  --------
  ubuntu-24.04@20261004.327.1  32    0       32
  ubuntu-24.04@20261012.334.1  72    0       72
  ubuntu-24.04@20261018.339.1  10    0       10
  ubuntu-26.04@20261012.163.1  9     0       9
  ubuntu-26.04@20261018.50.1   1     0       1
  ubuntu-26.04@20261025.179.1  36    0       36
  ubuntu-26.04@20261101.186.1  49    0       49
  ubuntu-26.04@20261111.196.1  3     2       1
  ubuntu-26.04@20261111.82.6   2     1       1

WEATHER: THE SAME RUNS BY CLOUD/REGION
  cloud/region           runs  SILENT  on the 20261111 build
  ---------------------  ----  ------  ---------------------
  AWS/us-east-1          1     0       0
  AWS/us-west-2  (west)  2     1       2
  Azure/canadaeast       1     0       0
  Azure/centralus        47    0       0
  Azure/eastus           35    0       0
  Azure/eastus2          15    0       0
  Azure/eastus3          3     0       0
  Azure/mexicocentral    1     0       0
  Azure/northcentralus   11    0       0
  Azure/southcentralus   10    0       0
  Azure/westcentralus    9     0       0
  Azure/westus  (west)   28    0       0
  Azure/westus2  (west)  16    1       1
  Azure/westus3  (west)  35    1       2

THE 5 RUNS ON THE 20261111 BUILD THAT MADE REQUESTS
  created (UTC)      run_id       event         cloud/region   image                        om_class  requests  max ms  conclusion
  -----------------  -----------  ------------  -------------  ---------------------------  --------  --------  ------  ----------
  2026-11-13T01:54Z  43348342619  workflow_run  Azure/westus3  ubuntu-26.04@20261111.196.1  SILENT    6         8001    failure
  2026-11-13T17:50Z  43476809362  workflow_run  Azure/westus3  ubuntu-26.04@20261111.196.1  answered  3         172     success
  2026-11-13T23:39Z  43528754615  workflow_run  AWS/us-west-2  ubuntu-26.04@20261111.82.6   answered  3         30      success
  2026-11-14T01:11Z  43539102233  workflow_run  AWS/us-west-2  ubuntu-26.04@20261111.82.6   SILENT    6         8001    failure
  2026-11-14T10:52Z  43587347908  schedule      Azure/westus2  ubuntu-26.04@20261111.196.1  SILENT    8         8001    failure

2 x 2: SILENT or not, among runs that made requests
  all regions
  20261111 build: 3 SILENT, 2 not    older builds: 0 SILENT, 209 not    Fisher exact two-sided p = 6.2e-6
  west only (westus, westus2, westus3, us-west-2; chosen after the three reds were seen)
  20261111 build: 3 SILENT, 2 not    older builds: 0 SILENT, 76 not    Fisher exact two-sided p = 1.2e-4
  The p-values are descriptive. The runs share commits and hours, so they are not independent,
  and the west grouping was chosen after the data were read. Neither 2 x 2 separates the build,
  the region and a concurrent Open-Meteo outage from one another.

LATE NODE PROBE (printed only in the failure text of a weather assertion), BY RUNNER OS
  OS            node probe                  attribution  reds
  ------------  --------------------------  -----------  ----
  ubuntu-24.04  HTTP 200                    page         2
  ubuntu-26.04  unreachable — fetch failed  host-silent  3
  ubuntu-26.04  unreachable — fetch failed  page         1
  6 reds ran the probe; 9 more printed "not probed"; 61 reds printed no attribution text.

THE REDS THAT RAN THE PROBE, ONE PER LINE
  created (UTC)      run_id       image                        cloud/region   attribution  node probe                  fail_class
  -----------------  -----------  ---------------------------  -------------  -----------  --------------------------  ---------------------------
  2026-10-24T12:44Z  40095209587  ubuntu-24.04@20261012.334.1  Azure/westus   page         HTTP 200                    weather-partial-fill
  2026-10-24T16:40Z  40112657476  ubuntu-24.04@20261012.334.1  Azure/westus   page         HTTP 200                    weather-partial-fill
  2026-11-06T00:23Z  42136439023  ubuntu-26.04@20261101.186.1  Azure/eastus   page         unreachable — fetch failed  weather-partial-fill
  2026-11-13T01:54Z  43348342619  ubuntu-26.04@20261111.196.1  Azure/westus3  host-silent  unreachable — fetch failed  weather-silent-whole-window
  2026-11-14T01:11Z  43539102233  ubuntu-26.04@20261111.82.6   AWS/us-west-2  host-silent  unreachable — fetch failed  weather-silent-whole-window
  2026-11-14T10:52Z  43587347908  ubuntu-26.04@20261111.196.1  Azure/westus2  host-silent  unreachable — fetch failed  weather-silent-whole-window

PINNED FIGURES (the numbers the record quotes): 28 of 28 match
```

## The 76 reds, class by class

Each paragraph names the failing step, the text that put the run in the class, the last-seen date, and what was not examined. The numbers come from the table above.

**`brief-game_live-on-final` (23) and `brief-card-not-rendered` (2), step "A finished game shows the brief written after it finished".** In 23 the page showed a live-phase brief on a Final card: `Milan @ Genoa: expected game_recap, shown DURING-PLAY KIND ON A FINAL GAME: game_live`. In 2 (runs 39884938972 and 40989161470) the check found no card for the game: `null @ null: expected game_recap, shown (NOT RENDERED — no card on the page shares a word with either team)`. First 2026-10-10T20:08Z, last 2026-11-08T22:56Z, none in the 45 runs since. The 2026-11-08 occurrences are noted in `outbox/cc-session-2026-11-08-epl-forecast-on-cards.md` ("Not caused by this change"). Not examined here: which brief the relay served for those games and why.

**`axis-desk-card-timeout-30s` (19), step "The score's weight axis interpolates on the DEPLOYED page".** The same text in 19 of 19: `page.waitForSelector: Timeout 30000ms exceeded.` waiting for `locator('.desk-card')` to be visible, thrown from the `waitForSelector` call in `scripts/axis-check.mjs`. First 2026-10-09T09:16Z, last 2026-11-03T07:09Z, none in the 84 runs since. Commit `8bc18311`, "live-check: pin the axis step to the committed capture", is dated 2026-11-03T02:30:39-05:00, which is 07:30:39Z, about 21 minutes after the last of those runs was created. `outbox/verify-axis-pinned-2026-10-16.md` records the same text on `verify` and the same remedy. That the pin is why the class stopped is an association of timing and mechanism with 84 clean runs; no counterfactual was run.

**`deploy-not-landed` (12), step "The deploy landed (published is the newest deployable commit)".** The check's own text: `DEPLOY NOT LANDED — published <sha> is behind the newest deployable commit <sha>.` First 2026-10-16T07:16Z, last 2026-11-11T22:49Z, none in the 18 runs since. `docs/CC-CMD-2026-10-16-deploy-landed-skip-ci.md` (Status DONE 2026-10-17) is the existing work on this check. Not examined here: for each of the 12, whether the deploy was late or had failed.

**`venue-table-covers-none` (8), step "Render the deployed page and assert on it".** The first failing assertion is `the venue table covers at least one venue on this slate`. In run 42613880170 (2026-11-09) it read `Manadon Sports Hub, U.S. Bank Stadium — none of them in the 484-entry table (11 recorded indoor arena(s) not counted)`, and the weather assertions then fail for lack of a venue to check (`0 known venue(s) on this slate … no Open-Meteo request was made at all`). First 2026-10-09T10:53Z, last 2026-11-09T12:03Z, none in the 42 runs since. The venue-review series (`docs/CC-CMD-2026-11-09-venue-review-remainder.md`, Status DONE 2026-11-14) is the work that adds those venues. Only the 2026-11-09 venue list was read; the other six reds were classed from the first failing assertion alone.

**`weather-partial-fill` (3), same step.** The page received answers and some chips did not fill within the wait. Runs 40095209587 and 40112657476 (2026-10-24, `ubuntu-24.04`, Azure/westus; in the first, `73 known venue(s) on this slate, 71 chip(s) filled … 58 request(s) received a response (200)`) and run 42136439023 (2026-11-06, `ubuntu-26.04@20261101.186.1`, Azure/eastus; `34 known venue(s) on this slate, 15 chip(s) filled … 15 request(s) received a response (200) … 19 venue(s) did not answer: Stadium of Light: signal timed out after 4400ms …`). Last 2026-11-06T00:23Z, none in the 64 runs since. `docs/CC-CMD-2026-11-10-live-chip-refused-payload.md` (Status PARTIAL) covers a different mechanism, a decoder refusing an HTTP 200 body; whether any of these three is that was not tested.

**`weather-silent-whole-window` (3).** The next section.

**`fable-crash-signature` (2), step "Build (the venue table this check derives its expectation from)".** Both logs (39335001539 on 2026-10-19T22:26Z and 43441145223 on 2026-11-13T14:16Z) carry 43 lines matching `error FSHARP: internal error: Object reference not set to an instance of an object. (code 193)`, at the same 20 locations in `build/fable_modules/Thoth.Json.10.5.1/Decode.fs` (the first at `(201,23)`), the signature recorded in `docs/CC-CMD-2026-11-03-fable-compiler-crash.md` (Status DONE 2026-11-03). 5 runs since the last.

**`page-not-ready-30s` (2), step "Render the deployed page and assert on it".** The render check threw before any assertion. Run 38575043557 (2026-10-14T13:49Z): `page.waitForFunction: Timeout 30000ms exceeded.` from the first `waitForFunction` in `scripts/render-check.mjs`. Run 39432033037 (2026-10-20T13:37Z): `state transition ran → page.goto: Timeout 30000ms exceeded.` Neither run id appears in any `docs/` or `outbox/` file. None in the 177 runs since the last. Not examined here.

**`state-transition-no-change` (1), same step.** Run 39927305845 (2026-10-23T08:48Z): `score updates on state change → Chandler Blanchet -9 -> Chandler Blanchet -9` and `status updates with it (no stale node) → Final -> Final`. Not examined here.

**`playwright-install-exit` (1), step "Run npx playwright install --with-deps chromium".** Run 43056630500 (2026-11-11T16:16Z), exit code 1. `docs/CC-CMD-2026-11-11-runner-apt-mirror-dns.md` (Status PARTIAL) names this run (its item 8) and records the cause as a runner that could not resolve the Ubuntu mirrors; why those names did not resolve is recorded there as not known.

## The three weather reds

| run | created (UTC) | event | runner | page built from | requests | `open-meteo (start+duration)` as logged | attribution | late node probe |
|---|---|---|---|---|---|---|---|---|
| 43348342619 | 2026-11-13T01:54Z | workflow_run | Azure/westus3, `ubuntu-26.04@20261111.196.1` | `78ba16b` | 6 | `1156+8000ms 1156+8001ms 1156+8001ms 9156+5999ms 9157+5999ms 9157+6000ms` | host-silent | unreachable — fetch failed |
| 43539102233 | 2026-11-14T01:11Z | workflow_run | AWS/us-west-2, `ubuntu-26.04@20261111.82.6` | `1caa76e` | 6 | `911+8000ms 911+8000ms 911+8001ms 8911+5999ms 8911+6000ms 8912+5998ms` | host-silent | unreachable — fetch failed |
| 43587347908 | 2026-11-14T10:52Z | schedule | Azure/westus2, `ubuntu-26.04@20261111.196.1` | `bd0d8e1` | 8 | `1071+8000ms ×3 1071+8001ms 9072+5998ms ×3 9072+5999ms` | host-silent | unreachable — fetch failed |

Reading the timings: each wave is 3 requests (4 in the third run). Every request of the first wave ended at the page's 8000 ms cap (`requestCapMs` in `src/WeatherView.fs`). Every request of the second wave ran about 6000 ms, which is what remains of the 14000 ms slate budget (`slateDeadlineMs`, same file). All ended on a timeout; none on a response. The attribution text, in the first run's words: `host-silent — 6 request(s) over 14001ms, none received any response (the slate's budget is 14000ms, each request's cap 8000ms)`. The check's own caveat on the node probe is `(a later moment, not evidence about the page's window)`. The three runs were built from three different page commits, so the page code is not what they share.

### Three explanations the logs leave open

| explanation | what it predicts | what the logs show | status |
|---|---|---|---|
| Open-Meteo, or the path to it, was down or refusing these runners in those windows | silence for other runners at the same minutes | StatusGator's page for Open-Meteo lists "Down" on 2026-11-12, 11-13 and 11-14 (see Provenance). Its five 11-14 rows, if they are UTC, start at 01:49, 03:29, 06:09, 09:09 and 10:04 and last 20, 11, 11, 25 and 10 minutes; the 11-14 reds' timing lines were printed at 01:13:43Z and 10:54:25Z, so their requests ran within about a minute before those times, outside all five. The 11-13 line has no times. A `verify` job on `ubuntu-26.04@20261111.196.1` (job started 01:05:10Z, finished 01:10:51Z, region not read) got Open-Meteo answers in 116 to 162 ms at some point in that span, one to eight minutes before the AWS run's requests | open |
| The `20261111` runner image build | silence on that build and not before it | 3 of the 5 runs on that build that made requests were silent; 0 of the 209 runs on the five earlier builds. Both are descriptive: the five runs fall within 33 hours, so build and time are the same variable here. Two of the five answered (43476809362, 2026-11-13T17:50Z, 172 ms; 43528754615, 2026-11-13T23:39Z, 30 ms) | not excluded as a factor; not shown to be the cause |
| An event on the west-coast egress path | silence for west-coast runners only | all 5 runs on the new build were in the west regions the script groups (`westus`, `westus2`, `westus3`, `us-west-2`), so the build and the region cannot be told apart; the 76 older west-region runs had 0 silent. The grouping was chosen after the reds were seen. Run 43528754615 and run 43539102233 are the same image (`20261111.82.6`) in the same region (AWS us-west-2), 92 minutes apart, 30 ms and silent | open |

The data fit a condition that came and went, at the host, on the path or on the runner. They do not say which. The same two runs rule out a fixed property of the image or the region on its own.

### The late node probe

The render check runs one Node `fetch` to Open-Meteo after a weather failure and prints what it saw. It appears only in the failure text of a weather assertion, so the sample is the reds that printed it (the script's last two tables):

| OS | node probe | attribution | reds |
|---|---|---|---|
| ubuntu-24.04 | HTTP 200 | page | 2 |
| ubuntu-26.04 | unreachable — fetch failed | host-silent | 3 |
| ubuntu-26.04 | unreachable — fetch failed | page | 1 |

In run 42136439023 (`ubuntu-26.04`), Chromium on the same runner received 15 HTTP 200 responses while the probe said `unreachable — fetch failed`. So on `ubuntu-26.04` the probe's `fetch failed` does not show that the runner could not reach Open-Meteo, and the three silent reds do not get that evidence from it. The sample is 6 reds. The probe's catch block in `scripts/render-check.mjs` records only `e.message` (`probeSaw = \`unreachable — ${e.message}\``), so the error's `cause` (the code that says DNS, connect timeout, reset or TLS) is dropped.

## Premises, and the one command that tried to refute each (Rule 100)

| premise | the command | result |
|---|---|---|
| The three reds are the page getting no answer, not a page defect | read each log's `PASS`/`FAIL` lines and its attribution text | 20 of 24 render assertions passed in each; the 4 that failed are the chip assertions; each attribution reads `host-silent`; three different page commits |
| Silence is a property of the image or the region | the five runs on the `20261111` build, from the TSV | refuted as a fixed property: AWS us-west-2 `20261111.82.6` answered in 30 ms at 2026-11-13T23:39Z and was silent at 2026-11-14T01:11Z |
| The older runs could not have shown a whole-window silence, because the page's cap differed (a 4400 ms timeout appears in run 42136439023, the cap is now 8000 ms) | `awk` over `om_max_ms` for the 209 older-build runs that made requests | 202 had a longest request under 900 ms, 5 between 900 and 3999 ms, 2 at 4000 ms or more. Under either cap a whole-window silence logs at least 4400 ms. The 2 (39015778624, 5300 ms, success; 42136439023, 4925 ms) logged `837+4514ms 838+5300ms 838+3080ms 838+4323ms 6139+1296ms 6139+2071ms` and `781+74ms 781+74ms 781+71ms 781+4841ms …`: each has requests that answered |
| The late node probe's `fetch failed` shows the runner could not reach Open-Meteo | run 42136439023 | refuted for `ubuntu-26.04`: Chromium got 15 answers on the same runner |
| Another runner saw silence at 01:05Z on 2026-11-14 | the raw timing line of `verify` run 43538395303 | refuted: `388+116ms 388+162ms 389+149ms`. An earlier pass labelled that job "first-wave-silent-then-answered" because the scratch classifier compared the whole array to 7000 instead of each element. Fixed and re-run: 9 of 9 `verify` and `verify-full` jobs with requests since 2026-11-11 answered (of 18 jobs with a live weather step: 5 made no request, 4 logged no timing line) |
| Open-Meteo had no incident | one search and two page reads (Provenance) | not refuted: a third-party monitor lists "Down" on all three days; whether it overlaps the three reds' requests is open, as the table above says |
| Weather silence explains live-check being red | the class table | refuted: 3 of 76 reds |

## Checks on the checks (Rule 90)

`node outbox/live-check-census-2026-11-14.mjs --self-test`, pasted as printed (exit 0):

```
PASS  Fisher [[3,1],[1,3]] two-sided = 34/70
PASS  Fisher [[1,9],[11,3]] two-sided = 0.0027594
PASS  Fisher [[5,0],[0,5]] two-sided = 2/252
PASS  Fisher is symmetric in rows
PASS  Fisher of an even split is 1
PASS  a deliberately wrong expectation (0.5 for the tea table) is REJECTED
PASS  rows = 7
PASS  ran = 6 (the skipped row is not a run)
PASS  ran with a cloud = 6 of 6
PASS  reds = 2, both with a class
PASS  runs that made requests = 4
PASS  on the new build: 2 runs (ids 3 and 4), 1 SILENT
PASS  on older builds: 2 runs, 0 SILENT
PASS  west runs on the new build = 2; west runs on older builds = 1
PASS  "runs since last" for the weather class = 3 runs that ran after 2026-11-03 (ids 4, 6, 7), 1 red
PASS  no run falls outside the four om_class values
PASS  a run in no defined om_class is counted as unclassified
PASS  a TSV missing required columns is refused
PASS  the pinned-figure check reports a figure that is off by one

self-test: 19 of 19 checks passed
```

The self-test includes a deliberately wrong expectation (0.5 for the tea-tasting table) that it must reject. The script's default run ends by checking the 28 figures this record quotes against the TSV (`PINNED FIGURES … 28 of 28 match`, in the output above). `outbox/live-check-census-2026-11-14-mutate.mjs` breaks the script and the data on purpose, pasted as printed (exit 0):

```
unmutated: self-test exit 0, default exit 0
CAUGHT    M1 Fisher keeps the likelier tables: self-test exit 1 (4 FAIL), default exit 1 (1 MISMATCH)
CAUGHT    M2 a skipped run counts as a run: self-test exit 1 (3 FAIL), default exit 1 (2 MISMATCH)
CAUGHT    M3 a run with 0 requests counts as asking: self-test exit 1 (2 FAIL), default exit 1 (6 MISMATCH)
CAUGHT    M4 the build generation reads the wrong field: self-test exit 1 (3 FAIL), default exit 1 (7 MISMATCH)
CAUGHT    M5 SILENT is read as answered: self-test exit 1 (1 FAIL), default exit 1 (2 MISMATCH)
CAUGHT    M6 "runs since last" includes the red itself: self-test exit 1 (1 FAIL), default exit 0 (0 MISMATCH)
CAUGHT    M7 the unclassified count is blinded: self-test exit 1 (1 FAIL), default exit 0 (0 MISMATCH)
CAUGHT    T1 one data row deleted: default exit 1 (8 MISMATCH)
CAUGHT    T2 one fail_class relabelled: default exit 1 (2 MISMATCH)
CAUGHT    T3 one SILENT run read as answered: default exit 1 (2 MISMATCH)

10 caught, 0 invalid, of 10 mutations
```

The first run of that harness reported the three data mutations caught because the script threw a parse error, not because a pinned figure failed: the harness had read the TSV with `trimEnd()`, which strips the trailing tabs of blank columns off the last row. The harness now rejects a non-zero exit with no `MISMATCH` line as INVALID. The re-run above is the second.

## Options for the owner

These are decisions. None is started.

1. **Diagnostics at the moment of failure.** A new CC-CMD that builds on `docs/CC-CMD-2026-10-17-weather-live-http-outage.md` and `docs/CC-CMD-2026-10-20-weather-first-call-connect.md` (both DONE) and edits neither. It adds text to the weather failure message in `scripts/render-check.mjs`: the node probe's `e.cause?.code`, the runner's image version and region, its egress address, and a DNS lookup and connect timing per address family at the moment of failure. The verdicts stay as they are. It costs a `verify` run, because the script is gate-covered. It answers DNS versus connect versus TLS versus host the next time a red happens, and it says nothing until one does.
2. **A scheduled probe on `ubuntu-latest` and `ubuntu-24.04` side by side**, logging the same facts every few minutes, so the three explanations can be separated without waiting for a red. It is a new scheduled workflow, so it needs the owner's decision on Actions minutes; its cost was not measured.
3. **Dispatch `open-meteo-egress-probe.yml` once.** It exists (last run 2026-09-01), takes about three minutes and records node and Chromium results. It does not record image version, egress address, DNS family or error causes (no match for `ImageVersion`, `ImageOS`, an egress-address lookup or an address family in the script or workflow; its only DNS content is a request to a synthetic unresolvable host, and it does not read `e.cause`), and one run cannot catch a transient.
4. **Leave it until it recurs.**

Not offered: tolerating host-silence in `live-check.yml`, which the 10-17 CC-CMD's hazard section rules out. The first-call retry in `docs/CC-CMD-2026-10-20-weather-first-call-connect.md` (its Task 1, "Building Task 1 anyway is the owner's call") would not have helped these three: the second wave, which is the retry, was also silent in all three.

## Provenance (Rule 73)

All times UTC unless a time zone is written. Every claim about the runs rests on the job logs of completed runs, listed and downloaded on 2026-11-14 through the GitHub REST API (`actions/workflows/live-check.yml/runs`, `actions/jobs/<id>/logs`) by scratch scripts. Skipped and cancelled runs have no log. The `verify` and `verify-full` jobs were listed the same way for runs created since 2026-11-11 (33 runs, 234 jobs, 18 with a live weather step, 0 logs unreadable).

Web sources, read on 2026-11-14 after 08:09 ET, by a summarizing fetch (so second-hand) unless stated:

- [StatusGator's page for Open-Meteo](https://statusgator.com/services/open-meteo), read twice with consistent results. History lines: "November 12, 2026 Down for 54 Minutes", "November 13, 2026 Down for 3 Hours and 41 Minutes", "November 14, 2026 Down for 1 Hour and 16 Minutes". Its "recent outages" table lists only 2026-11-14: Major incident, Down, 10m at 10:04 AM, 25m at 9:09 AM, 11m at 6:09 AM, 11m at 3:29 AM, 20m at 1:49 AM. The time zone of those rows is not on the page; its last-checked line reads "November 14, 2026 at 11:39 AM UTC". The page says it uses the official Open-Meteo status page.
- `https://status.open-meteo.com`, through the Exa fetch tool: a StatusCake public report that states "All times reported in the UTC timezone"; its uptime table came back empty (the page renders in a script). The summarizing fetch refused this URL as not on the session's allowlist.
- GitHub's incident history (`https://www.githubstatus.com/history`), through the Exa fetch tool: boilerplate only, no incident list. Nothing is known here about GitHub Actions incidents in the three windows.

## Manifest

| item | value |
|---|---|
| commit | the one that adds this file; `git log -1 -- outbox/live-check-weather-silent-2026-11-14.md` names it (a commit cannot name itself) |
| gates | `guards` on that commit; its run id is in the owner report, not here, because the run does not exist until the push |
| done condition | `node outbox/live-check-census-2026-11-14.mjs` exits 0 and prints `PINNED FIGURES (the numbers the record quotes): 28 of 28 match`; `--self-test` prints `19 of 19 checks passed`; the mutation harness prints `10 caught, 0 invalid, of 10 mutations` |
| changed | `outbox/` only: this file, the TSV, the script and the harness |
| dispatched | nothing |
| residual | the cause of the three silent runs (explanations above); the options above are owner decisions, not deferred work |
