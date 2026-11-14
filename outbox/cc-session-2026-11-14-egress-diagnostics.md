# Session record: the weather failure message names its cause — 2026-11-14

Session doc (Rule 67) for `docs/CC-CMD-2026-11-14-weather-failure-cause.md`, commissioned by the owner's word "Diagnostics" (Saturday 2026-11-14, 08:48 ET) and extended by one more probe dispatch on the owner's word "Dispatch" (15:33 ET). The detailed build and check record is `outbox/egress-diagnostics-wiring-2026-11-14.md`; this file is the session's manifest.

**State:** built, scored on a runner twice, landed in two commits, and run on a runner twice (probe runs 43620413444 and 43638310999). All six done conditions are met. Condition 5, a runner line carrying a real region, is met by run 43638310999: `checked 5 of 5 expected runner lines`, PASS, region `eastus2`. A second weather red, `live-check` 43631078973, is the first to carry the fixed line (`region westus3`); it moved no verdict and is recorded as an observation. Residual, the owner's: whether to test the three premises about the host's address, TLS and the runner's region (below). The CC-CMD's Status is DONE.

## HEAD progression

| HEAD | what it is | scored or read by |
|---|---|---|
| `e727a133` | `main` when the CC-CMD was filed | |
| `4c88e743` | the CC-CMD, docs only (09:05 ET) | |
| `ebca26e5` | the feature, on branch `egress-diagnostics` | `verify-full` 43613293578 (530 of 530, 3,578 s, run id `ebca26e533b1-451a9c10e26c`), `verify` 43613296336 |
| `7be7dd00` | merge of that branch into `main`, `--no-ff` | `verify` 43618962875 success, `guards` 43618962988 success, `deploy` 43620027746 success, `live-check` 43620118846 failure (the weather red, below) |
| `0391f380` | the probe's three artifacts, committed by the workflow's last step | probe run 43620413444 success (created 17:18:50Z, finished 17:22:03Z) |
| `d7a8e367` | the region fix, on branch `egress-region-fix` | `verify-full` 43622319008 (530 of 530, 3,080 s, run id `d7a8e3676ee8-5443c49158b6`), `verify` 43622321466 (success) |
| `5ba3efeb` | merge of that branch into `main`, `--no-ff` | `verify` 43627238605 success, `guards` 43627238792 success, `deploy` 43627825413 success, `live-check` 43627924560 success (105 of 105; the weather chips filled, so no late probe ran) |
| `cdf171a8` | docs: the UTC-only Suite check, appended to the soccer CC-CMD | |
| `eddd7e97` | docs: this CC-CMD's Status (PARTIAL) and Outcome | |
| `510c44e2` | docs: the first version of this record | `live-check` 43631078973 failure (the second weather red, and the first to carry the fixed line) |
| `c372a52d` | `main` when the second probe was dispatched (docs, on another CC-CMD: the live-chip refusal, closed on the owner's option 3) | probe run 43638310999 ran on it |
| `4acd8f07` | the second dispatch's artifacts, committed by the workflow's last step: `egress-path-{live,e2e,survey}-20261114T203623Z.txt`, the Probe step's JSON and a rewritten `outbox/open-meteo-egress-console.txt` | probe run 43638310999 success (created 20:35:35Z, finished 20:38:47Z, about 3 minutes) |
| `d06741d1` | docs: this CC-CMD's Status (DONE), the Outcome with condition 5 met, and the Observed section with the second red and the region tally | local: `check:docs` 3 of 3, `check:citations`, `check:history`, `check:outbox-row` 9 of 9, CC-CMD status check 5 of 5, the pre-commit fast gate; pushed with this record, so `guards` is read on the head commit after the push (the run id is in the owner report) |

The two merges are `--no-ff` because the commit that records a branch's CI measurement carries the skip directive in its message; a fast-forward would have made that the head commit of `main` and suppressed `verify`, `guards` and the rest for the landing SHA.

## What each commit did

- `ebca26e5`: `scripts/egress-path-lib.mjs` (new): `describeError`, `probeFacts`, `describeEgressPath`, `judgeE2E`, and the modes `--live`, `--judge`, `--self-test`. `scripts/render-check.mjs`: text only, 8 insertions and 1 deletion, one sentence added to the failing chip check; no verdict, tolerance or attribution changed. 23 mutations. `check:egress-path` in `package.json` and `verify.yml`. Three steps in `open-meteo-egress-probe.yml`.
- `d7a8e367`: `parseSetupInfo` reads the runner's `Group`/`Detail` keys and refuses any other shape; the self-test's fixture is the runner's own 761 bytes; one mutation re-anchored and four added (27 in all).
- `d06741d1`: documents only. The CC-CMD's Status goes from PARTIAL to DONE; its Outcome carries both dispatches and condition 5; its Observed section carries the four-runner table, the Node-and-Chromium agreement, the region tally and the restated premises.

## Verified end to end

**Verified, with the artifact that shows it**

- The new text appears in a real red, and the verdicts did not move: `live-check` 43620118846 (after) against 43603906789 (before). Each has 101 PASS and 4 FAIL, and the four failing checks are the same names: `the chips all filled within the wait`, `every card whose venue the table knows carries a live chip`, `every live chip reads as a temperature and nothing else`, `every live chip carries a real roof caveat`. Only the after run carries `egress-path:`. The third red, 43631078973 (the first with the fixed parser), has the same 101 PASS, the same 4 FAIL by the same names, and carries `runner=image ubuntu26@20261111.196.1 region westus3 cloud Azure`.
- The module on a runner, on the four failure shapes: `outbox/egress-path-live-20261114T171939Z.txt` and `outbox/egress-path-live-20261114T203623Z.txt`, each with first line `checked 4 of 4 shapes` and last line `VERDICT: pass, 4 of 4 shapes as expected`. The `.invalid` name gave `ENOTFOUND` at stage `dns`; the closed loopback port `ECONNREFUSED` at `connect`; the documentation address `UND_ERR_CONNECT_TIMEOUT` at `connect-budget` after 13.5 s; the real host `HTTP 200` (246 ms in the second run).
- The fault-injected end to end: `outbox/egress-path-e2e-20261114T171939Z.txt` and `outbox/egress-path-e2e-20261114T203623Z.txt`, each with last line `VERDICT: observed — the chip check's FAIL carries egress-path:, a probe-error with a cause, and dns-v4=`. The page's own window read `host-silent` (8 requests over 14,000 ms, none answered), the attribution the live reds carry.
- Where a runner keeps its region: `.setup_info` beside `Runner.Worker`, 761 bytes, keys `Group` and `Detail`; `Region: southcentralus` in `outbox/egress-path-survey-20261114T171939Z.txt`, `Region: eastus2` in `outbox/egress-path-survey-20261114T203623Z.txt`, `Cloud: Azure` in both.
- Condition 5, below.

**Condition 5, a runner printing the fixed region: verified.** Probe run 43638310999 (success, on `c372a52d`; artifacts committed in `4acd8f07`, stamp `20261114T203623Z`). The check compares each `runner=image` segment with the region and cloud that the same run's survey printed raw from `.setup_info`, so the parser is not checked against itself, and it takes its denominator (M) from the artifacts' own first lines, not from the lines it found. Saved as `cond5-assert.mjs` from the block below and run from the repository root, `node cond5-assert.mjs 20261114T203623Z` printed:

```
source (survey, raw): Region eastus2, Cloud Azure
expected runner lines: 4 (live shapes) + 1 (end-to-end) = 5; found 5
checked 5 of 5 expected runner lines
PASS
```

Exit 0. The same command on the first pass's artifacts, `node cond5-assert.mjs 20261114T171939Z`, printed the following and exited 1, for the reason the defect had:

```
source (survey, raw): Region southcentralus, Cloud Azure
expected runner lines: 4 (live shapes) + 1 (end-to-end) = 5; found 5
first one that does not match: runner=image ubuntu26@20261111.196.1 region unreadable (no Region line) cloud unreadable (no Cloud line)
checked 0 of 5 expected runner lines
FAIL
```

A second source agrees: the job log header of run 43638310999 prints `Region: eastus2` and `Cloud: Azure`, and that of run 43620413444 prints `Region: southcentralus`, each equal to its own `.setup_info` and its own survey.

The check was failed on purpose before it was trusted (Rule 90). A harness applied each mutation to a copy of the three new artifacts in a fresh temporary directory, refused to report a mutation that changed nothing, and ran the check there. Control, with no mutation: exit 0, `checked 5 of 5 expected runner lines`. Printed last line: `checked 10 of 10 mutations caught; control exit 0; not applied 0`.

| mutation | anchor, in the original | exit | printed |
|---|---|---|---|
| a wrong region on one live line | 4 occurrences, 1 changed | 1 | `checked 4 of 5` |
| a wrong cloud on one live line | 4, 1 changed | 1 | `checked 4 of 5` |
| a runner line missing from the live artifact | 4, 1 changed | 1 | `checked 4 of 5` |
| a runner line missing from the end-to-end artifact | 1, 1 changed | 1 | `checked 4 of 5` |
| an extra runner line in the live artifact | appended | 1 | `checked 6 of 5` |
| the survey's source region disagrees | 2, 1 changed | 1 | `checked 0 of 5` |
| the survey's raw line absent | 1, 1 changed | 1 | `FAIL: no raw .setup_info line in the survey artifact` |
| the shape count unreadable | 1, 1 changed | 1 | `FAIL: cannot read how many runner lines to expect (shapes NaN, end-to-end runs 1)` |
| the first pass's defect in every live line | 4, 4 changed | 1 | `checked 1 of 5` |
| the first pass's defect in the end-to-end line | 1, 1 changed | 1 | `checked 4 of 5` |

The check, as run (written in the session's scratchpad and kept here so it can be run from this repository alone; it is not in `scripts/`, because a one-off check there would be a source change with a gated landing):

```js
// Done condition 5 of docs/CC-CMD-2026-11-14-weather-failure-cause.md, as a command.
// usage: node cond5-assert.mjs <stamp>   (run from the laboratory root; reads outbox/egress-path-{live,e2e,survey}-<stamp>.txt)
import fs from 'node:fs'

const stamp = process.argv[2]
if (!stamp) { console.log('usage: node cond5-assert.mjs <stamp>'); process.exit(2) }
const read = kind => fs.readFileSync(`outbox/egress-path-${kind}-${stamp}.txt`, 'utf8')
const fail = why => { console.log(`FAIL: ${why}`); process.exit(1) }

const setupLine = read('survey').split('\n').find(l => l.startsWith('[{"Group":"Runner Image Provisioner"'))
if (!setupLine) fail(`no raw .setup_info line in the survey artifact of ${stamp}`)
const detail = JSON.parse(setupLine).map(x => x.Detail).join('\n')
const srcRegion = /^Region: (\S+)$/m.exec(detail)?.[1]
const srcCloud = /^Cloud: (\S+)$/m.exec(detail)?.[1]
if (!srcRegion || !srcCloud) fail('the survey line has no Region or Cloud')

const live = read('live'), e2e = read('e2e')
const shapes = Number(/^checked (\d+) of \d+ shapes/.exec(live)?.[1])
const runs = Number(/^checked (\d+) of \d+ end-to-end run/.exec(e2e)?.[1])
if (!(shapes > 0) || !(runs > 0)) fail(`cannot read how many runner lines to expect (shapes ${shapes}, end-to-end runs ${runs})`)
const expected = shapes + runs

const segments = text => [...text.matchAll(/runner=image [^|\n]*/g)].map(m => m[0])
const exact = new RegExp(`^runner=image \\S+ region ${srcRegion} cloud ${srcCloud}( |$)`)
const found = [...segments(live), ...segments(e2e)]
const good = found.filter(seg => exact.test(seg))
const bad = found.find(seg => !exact.test(seg))

console.log(`source (survey, raw): Region ${srcRegion}, Cloud ${srcCloud}`)
console.log(`expected runner lines: ${shapes} (live shapes) + ${runs} (end-to-end) = ${expected}; found ${found.length}`)
if (bad) console.log(`first one that does not match: ${bad.slice(0, 120)}`)
console.log(`checked ${good.length} of ${expected} expected runner lines`)
const pass = found.length === expected && good.length === expected
console.log(pass ? 'PASS' : 'FAIL')
process.exit(pass ? 0 : 1)
```

The Probe step of both runs also ran and is now read: `outbox/open-meteo-egress-2026-11-14T17-19-34-656Z.json` and `outbox/open-meteo-egress-2026-11-14T20-36-18-830Z.json` both say `verdict: reachable` (Node ok in 211 ms and 93 ms, Chromium ok in 184 ms and 91 ms, 8 of 8 of the burst answered in each).

## Done conditions

| # | printed output | status |
|---|---|---|
| 1 | `78/78 checks passed` (76/76 at landing); 27 registered `egress-path-*` mutations, each caught by a named check (`--ids`: `6/6 checks passed` for the five of the fix; by hand, 1 to 3 checks red for each) | met |
| 2 | render-check diff: 1 file, 8 insertions, 1 deletion; no verdict, tolerance or attribution line touched | met |
| 3 | `checked 4 of 4 shapes` ... `VERDICT: pass, 4 of 4 shapes as expected` (both stamps) | met |
| 4 | `VERDICT: observed` (both stamps) | met |
| 5 | `checked 5 of 5 expected runner lines`, `PASS`, exit 0 on stamp `20261114T203623Z`, region `eastus2`; `checked 0 of 5 expected runner lines`, `FAIL`, exit 1 on the first pass's stamp; 10 of 10 mutations caught | met |
| 6 | the gate scored on a runner: 530 of 530 for `ebca26e5` (43613293578) and 530 of 530 for `d7a8e367` (43622319008); `verify` green on the landing SHAs | met |

## What was wrong, and what it cost

- **A figure I had not read.** I told the owner the local gate takes "about 52 minutes". That number is the wait in CI, recorded in `docs/GATE-TIMING.md` and `outbox/cc-session-2026-11-12-venue-review-counts.md`. The local run does not finish on this container: the mutation row has 1,528 entries (1,532 now), 246 of them (a count of the entries whose expectation is the harness's own self-test) run it, at 32 to 52 s each at the three entries I timed, and `docs/GATE-TIMING.md` puts that at about 2.5 hours serial. I stopped it after 4,697 s at about entry 176. The cost was 78 minutes of wall time and a correction to the owner. The lab's own method (Task 9 of the soccer CC-CMD) was in the repository: 22 rows locally, `verify-full` on a work branch, land with the run id.
- **A parser written from a guess.** The first runner pass printed `region unreadable (no Region line)` on every line, because I read lowercase keys from a fixture I had written; the runner's keys are `Group` and `Detail`. Rule 100's table has the same shape. Fixed in `d7a8e367`; the full account is in the wiring note.
- **A verify command written from one sample.** The first version of this record, and the CC-CMD's Status, expected `region southcentralus cloud Azure`: the one region the first survey had printed. The second probe run read `eastus2` and the reds' job-log headers read `westus2` and `westus3`, so that command would have failed on a correct line. The check that replaced it takes the expected region from the same run's raw `.setup_info`. It is the shape of Rule 100's table again: a premise from n = 1, published as an expectation.
- **A check that could not fail, then one that could not see a missing line.** The first version of the condition 5 check counted `0 of 0` (it required a single token after `region`, and the line prints several), so its FAIL was for the wrong reason. The second took its denominator from the lines it found, so a runner line that never printed lowered nothing. The version above takes the denominator from the artifacts' own first lines. The ten mutations above were run against it.
- **A sentence I drafted and did not commit.** The CC-CMD text I first wrote for the second red said region against red "cannot be tested on this data". It could be: the job log's header prints `Region:` for every run, and the census note had already tallied it. The scratch files of that census, which I had in this session's own scratchpad, showed it; I read them before the commit, so the committed text carries the tally. The mistake is the order: the claim was written before the one command that tests it.
- **A stop signal sent to the wrong process.** The driver that stops the in-process mutation suite matched its `sh -c` wrapper. Nothing was lost; checked by sha256, `--stranded` and the state directory.
- **A local gate that failed under this shell's time zone.** `TZ=America/New_York` fails one F# check that passes under `TZ=UTC`; the finding is added to `docs/CC-CMD-2026-11-11-soccer-live-scores.md`, which owns the check. Local gates are run as `TZ=UTC npm run gate`.

## Not established

These are not findings; each is a premise with the command that would test it. The full table is in the CC-CMD's "Observed" section.

- **Why Chromium got no answer in the silent reds.** The description cannot say; it names Node's path at a later moment. On every runner in the table Node and Chromium agreed (both reached the host in the two probe runs, both got nothing in the two reds).
- **Which of three things decides a red, if any of them does.** (a) The address DNS hands the runner: `51.81.167.44` in both reds, `167.114.211.86` in both probe runs (n = 4). (b) A TLS stall after a completed TCP connect: the reds' TCP connects to `51.81.167.44` answered in 12 ms and 33 ms, but they were made after the `fetch` had failed, and the description has no TLS stage. (c) The runner's region: on the `20261111` build, the runs that made requests were, west 6 silent and 2 answered, not west 0 silent and 3 answered (coverage: 5 of 5 census rows, 4 of 4 `live-check` runs since the census, 2 of 2 probe runs). The west grouping was chosen after the first reds were seen, the three non-west runs are the first it did not select, and the census's own result stands that region and image are not a fixed property (the same image and region answered in 30 ms 92 minutes before a silent run). Address, region and outcome are one split on the four runners that carry a DNS answer, so the data cannot tell them apart. Tests: from a runner, for each of the two addresses, 10 attempts of `curl -sS -m 15 --resolve api.open-meteo.com:443:<ip> -o /dev/null -w '%{time_connect} %{time_appconnect} %{http_code}\n' '<the forecast URL>'`; and the `dns-v4` answer by region over more runs. The first is a pinned step in `open-meteo-egress-probe.yml` and a dispatch, or a TLS stage and every address in `describeEgressPath` (a source change through the gate). Neither is built.
- **A count from the rain/precipitation pair probe.** `outbox/rain-precip-pair-2026-11-14-2026-11-14T14-22-21.jsonl` has 1,680 records, 407 of them mention `UND_ERR_CONNECT_TIMEOUT`, from a runner. The file records no addresses, so it cannot separate (a) from (b).

## Residual

- The owner's choice, not deferred work: a TLS stage and every address in `describeEgressPath`, or a pinned per-address step in the egress workflow and one dispatch. The approval covered DNS and connect per address family and two dispatches, and both are used.
- The remote branches `egress-diagnostics` (merged) and `egress-region-fix` (merged) remain. This session's proxy refuses ref deletion (403 on `git push --delete` and on REST `DELETE /git/refs`), and I did not look for another route. From a machine with a token: `gh api -X DELETE repos/jeffunglesbee-create/field-laboratory/git/refs/heads/egress-diagnostics`, and the same for `egress-region-fix`.
- `outbox/live-check-weather-silent-2026-11-14.md` is unchanged: it is a pinned census, and its west-region premise is extended in the CC-CMD's "Observed" section instead.
- Cosmetic, left alone under TOUCH-ONLY-A: the survey step prints the runner directory listing twice; `forecastUrl(probe)` is evaluated a second time in `render-check.mjs`, outside the `try`, and is a pure function of a constant.
