# Weather failure cause: the description, the wiring, and what was checked before the runner — 2026-11-14

**State:** landed on `main` (merge `7be7dd00`, after `verify-full` run 43613293578 scored it 530 of 530) and run once on a runner by the one approved probe dispatch (run 43620413444; artifacts `outbox/egress-path-{live,e2e,survey}-20261114T171939Z.txt`). The description of Node's path (`scripts/egress-path-lib.mjs`) is wired into the weather failure message in `scripts/render-check.mjs` as text only. That runner pass showed one defect of mine: every runner line said `region unreadable (no Region line)`, because the parser read lowercase keys that the runner's `.setup_info` does not have. This commit fixes it (see "The region and cloud read" below; self-test 78 of 78, 27 registered mutations each caught by a named check). Done conditions 1 to 4 of `docs/CC-CMD-2026-11-14-weather-failure-cause.md` are met. Condition 5, a runner line that carries a real region, is open until a runner prints the fixed line.

Commissioned by the owner's word "Diagnostics" (Saturday 2026-11-14, 08:48 ET), approving the proposal to record the node probe's cause code, runner image and region, egress address, and DNS and connect results per address family, so the next red names its cause.

## What changed

| file | change |
|---|---|
| `scripts/egress-path-lib.mjs` | new: `describeError`, `probeFacts`, `describeEgressPath`, `judgeE2E`, and the `--self-test`, `--live <file>` and `--judge` modes |
| `scripts/render-check.mjs` | text only: the quoted diff below; verdicts, strictness, `--tolerate-unreachable` and `attributeWeather` untouched |
| `scripts/mutation-check.mjs` | 23 entries, each with the self-test as its expectation (27 after the region fix below: four added, one re-anchored) |
| `package.json`, `.github/workflows/verify.yml` | `check:egress-path` and the verify step that runs it |
| `.github/workflows/open-meteo-egress-probe.yml` | three steps after `Probe`, each `if: always()`; nothing existing removed or reordered, no install added |

## The render-check diff (done condition 2)

`git diff -U0 HEAD -- scripts/render-check.mjs` against `4c88e743`, one file, 8 insertions and 1 deletion:

```diff
diff --git a/scripts/render-check.mjs b/scripts/render-check.mjs
index f2745d97..701db8ff 100644
--- a/scripts/render-check.mjs
+++ b/scripts/render-check.mjs
@@ -14,0 +15 @@ import { createChecks, finish } from './checks.mjs'
+import { describeEgressPath } from './egress-path-lib.mjs'
@@ -375,0 +377,4 @@ let probeSaw = 'not probed'
+// What the probe threw, and Node's own path to the host at this later moment. Text for the failure message and nothing else: `e.message`
+// is "fetch failed" whatever happened and the code is in `e.cause` (docs/CC-CMD-2026-11-14-weather-failure-cause.md).
+let probeErr = null
+let pathSaw = 'not probed'
@@ -382 +387,2 @@ if (!pinned && (waitErr !== null || filled.length < expected)) {
-  } catch (e) { openMeteoDown = true; probeSaw = `unreachable — ${e.message}` }
+  } catch (e) { openMeteoDown = true; probeSaw = `unreachable — ${e.message}`; probeErr = e }
+  pathSaw = await describeEgressPath({ host: new global.URL(forecastUrl(probe)).hostname, error: probeErr })
@@ -674,0 +681 @@ if (!pinned) {
+      `${pathSaw} (Node's own network stack at that later moment, not Chromium's). ` +
```

The 8 insertions are the import, a two-line comment and two declarations, the probe's call, and one sentence; the 1 deletion is the catch line, rewritten to keep the error. The comment was not in the CC-CMD's first list of lines; the CC-CMD now names it.

## The self-test

`node scripts/egress-path-lib.mjs --self-test`, last lines as printed at landing (exit 0; the region fix below makes it 78 of 78):

```
checked 6 of 6 described lines for all 11 keys

76/76 checks passed
```

It builds each fast failure shape for real on loopback (a name that cannot resolve, a closed ephemeral port, a reset, a silent listener aborted, port 1), reads the end-to-end verdict from output that `scripts/checks.mjs` itself produced rather than from a typed copy of its format, and reads the wiring from render-check's source. The two shapes that cannot be made here (a two-address `AggregateError`, a connect hang on a routed address) are built from real `Error` objects carrying the property names Node 22.23.4 uses; `outbox/node-fetch-failure-shapes-2026-11-14.txt` records the shapes it did observe (7 of 7).

## The mutations (done condition 1; Rule 90)

`node scripts/mutation-check.mjs --ids <the 23>`: `baseline: ran 1 of 1 distinct expectation(s) from 23 mutation(s), 0 failing`, `23 record(s), 0 survived`, `24/24 checks passed`. A second pass applied each mutation by hand, ran the self-test, and recorded what went red. Every one fails a NAMED check (`named 23, unnamed 0, not red 0, of 23`), and both files came back byte-identical:

| mutation | checks failed | first check that failed |
|---|---|---|
| `egress-path-cause-not-walked` | 8 | a DNS miss is named by its code, syscall and host, and the outer message is kept |
| `egress-path-errors-not-walked` | 1 | a two-address failure lists EACH attempt, the IPv6 one bracketed |
| `egress-path-code-dropped` | 4 | a DNS miss is named by its code, syscall and host, and the outer message is kept |
| `egress-path-budget-as-connect` | 2 | a connect hang is placed at connect-budget, never at connect: the budget covers lookup, connect and TLS |
| `egress-path-read-timeout-as-connect` | 1 | an ETIMEDOUT from a READ is not the connect stage |
| `egress-path-throw-escapes` | 5 | a dependency that throws synchronously yields text, not a throw, and every key stays |
| `egress-path-budget-not-applied` | 3 | a dependency that never returns is bounded by the budget |
| `egress-path-unfinished-omitted` | 1 | ...what it never returned is named as unfinished, and what did finish is kept |
| `egress-path-families-swapped` | 2 | DNS lists two addresses and counts the rest, per family |
| `egress-path-egress-wrong-family` | 1 | a v4 address answered at the v6 endpoint is refused as a v6 address |
| `egress-path-setup-info-json-unread` | 2 | Region and Cloud are read out of a JSON .setup_info |
| `egress-path-runner-root-wrong-group` | 1 | the runner root is the parent of bin/Runner.Worker |
| `egress-path-wiring-import-dropped` | 1 | render-check imports describeEgressPath from this module |
| `egress-path-wiring-error-not-kept` | 1 | the probe keeps the error it caught |
| `egress-path-wiring-not-computed` | 1 | the description is computed inside that block, from the error and the probe URL's own host |
| `egress-path-wiring-not-printed` | 1 | the failing chip check prints it, after the late-probe sentence and before "The page reported" |
| `egress-path-judge-whole-output` | 1 | a LATER check's text is not read as the chip check's |
| `egress-path-judge-any-fail` | 6 | a failing chip check that carries the description is observed |
| `egress-path-judge-cause-not-required` | 1 | a description whose probe did not fail is incomplete: it names no cause |
| `egress-path-judge-missing-ignored` | 5 | a failing chip check WITHOUT the description is incomplete, and names egress-path: |
| `egress-path-judge-no-failure-is-pass` | 5 | another check's failure, even with the description in it, is not the chip check |
| `egress-path-judge-exit-always-zero` | 2 | --judge on an incomplete run exits 1 and says so |
| `egress-path-dns-other-family-kept` | 1 | an IP literal answered for the other family is not reported as that family's address |

## The region and cloud read, after the first runner pass

**What the runner showed.** The survey step of probe run 43620413444 (`outbox/egress-path-survey-20261114T171939Z.txt`, a hosted `ubuntu-latest` runner, 2026-11-14) found `.setup_info` at `/home/runner/actions-runner/cached/2.338.2/.setup_info` through the process ancestry, as built: 761 bytes, a JSON list of objects whose keys are `Group` and `Detail`, capitalised. `Region: southcentralus` and `Cloud: Azure` are lines of the Detail of the group "Runner Image Provisioner"; the group "_internal_runner_telemetry" carries a different line, `Azure Region: southcentralus`. Every runner line that pass printed said `region unreadable (no Region line) cloud unreadable (no Cloud line)`.

**Cause, mine.** `parseSetupInfo` read `get(x, 'detail')`. The self-test's fixture was a file I had written from a guess, with lowercase keys, so it agreed with the parser and said nothing about the shape a runner has. The description named the miss in words (the `unreadable (reason)` form) instead of printing a wrong region, which is why the first pass showed the defect. The parser also accepted plain `Key: value` lines when the text was not JSON, a shape no one had observed.

**The fix**, `scripts/egress-path-lib.mjs` only: the key is `Detail`, as the runner writes it. Text that is not JSON reads `unreadable (not JSON: SyntaxError)` and JSON that is not a list reads `unreadable (JSON but not a list)`; no other shape is read, so there is no second path to disagree with the first. The self-test's fixture is now the runner's own 761 bytes. A script compared the string in the self-test with the artifact's line: `fixture bytes: 761 | artifact lines matching: 1 | artifact line bytes: 761 | identical: true`, and the fixed parser on that line returns `{"region":"southcentralus","cloud":"Azure"}`. The whole-description check feeds the same bytes through `describeEgressPath` (it had read a second invented fixture, `westus2`) and expects `region southcentralus cloud Azure`.

**Failed on purpose, then passed**, each run printed here:

| step | command | printed |
|---|---|---|
| the real-bytes check written first, parser unfixed | `node scripts/egress-path-lib.mjs --self-test` | `75/77 checks passed`; FAIL on `Region and Cloud are read out of the runner's own .setup_info, the bytes captured on a runner` with `{"region":"unreadable (no Region line)","cloud":"unreadable (no Cloud line)"}`; the second FAIL, `the runner line carries image, version, region and cloud`, read `unreadable (ReferenceError reading /home/runner/runners/2.338.2/.setup_info)`, which was my own edit: the deleted fixture's variable was still named by the stub |
| the rest of the new checks written, parser still unfixed | the same | `73/78 checks passed`; five FAIL lines: the real-bytes check, `a file that is not JSON is named as such…`, `JSON that is not a list is named as such`, `a .setup_info with no Cloud line says so, and still reads the Region`, and the runner line |
| parser fixed | the same | `checked 6 of 6 described lines for all 11 keys`, `78/78 checks passed`, exit 0 |

**Mutations** (done condition 1 again, for the new code). Four entries added and the one that read the old line re-anchored, all in `scripts/mutation-check.mjs` with the self-test as the expectation: `node scripts/mutation-check.mjs --anchors` printed `checked 1530 of 1533 mutation anchors; 0 stale` (the three it does not count are world mutations with no file anchor, `staleAnchors`' own skip). `node scripts/mutation-check.mjs --ids <the 5>` printed `baseline: ran 1 of 1 distinct expectation(s) from 5 mutation(s), 0 failing` and `6/6 checks passed`. Each was then applied by hand, the self-test run, and the file restored (`cmp` identical to the copy taken before):

| mutation | checks failed | which |
|---|---|---|
| `egress-path-setup-info-json-unread` (re-anchored) | 3 of 78 | the real-bytes check, `…no Cloud line says so…`, the runner line |
| `egress-path-setup-info-keys-lowercased` (new) | 3 of 78 | the same three |
| `egress-path-setup-info-region-unanchored` (new) | 2 of 78 | `the telemetry group's "Azure Region:" line is not taken for Region`, `Region is not read out of a longer key (Subregion: x)` |
| `egress-path-setup-info-not-json-guessed` (new; puts the plain-text path back) | 1 of 78 | `a file that is not JSON is named as such…` |
| `egress-path-setup-info-not-list-unchecked` (new) | 1 of 78 | `JSON that is not a list is named as such` |

Two of those checks (`…Azure Region…` and `…Subregion…`) passed against the unfixed parser too, for the wrong reason: it read nothing at all, so they could not fail. They carry weight only on the fixed parser, which is why the unanchoring mutation is in the table.

**One premise tried and refuted before it became a claim.** I suspected `Region:` with an empty value followed by `Cloud: Azure` would read `Cloud:` as the region, because the pattern's `\s*` crosses a newline. `parseSetupInfo` on `[{"Group":"g","Detail":"Region:\nCloud: Azure"}]` returned `{"region":"unreadable (no Region line)","cloud":"Azure"}`. Nothing to fix.

**Not verified by this commit.** That a runner prints the fixed line. The replay above runs the fixed parser on the runner's bytes on this machine; the runner line is built from the same parser, the process ancestry and the environment, and the first two of those worked on the runner. Done condition 5 stays open until a runner prints `runner=image ubuntu26@… region southcentralus cloud Azure`: the next `live-check` red prints it on its own, or the probe is dispatched once more on `main`.

## Defects in my own instrument, found by running it

- **The `.setup_info` parser read a shape I had guessed.** Found by the first runner pass, not by anything on this machine. Written up in "The region and cloud read" above: a fixture I wrote with lowercase keys, agreeing with a parser that read lowercase keys, against a file whose keys are `Group` and `Detail`. The self-test was green at 76 of 76 the whole time. Rule 100's table has the same shape: a premise (what the file looks like) that one command on a runner would have refuted, and that I carried into a fixture instead.

- **Two mutations were red without a named check.** `egress-path-throw-escapes` killed the self-test with an uncaught exception and `egress-path-budget-not-applied` made it exit 13 on an unsettled await, because the guard timer I had written was unref'd and could not fire. Both counted as "caught" by the harness and neither named a check, so the checks after the crash never ran. Every description in the self-test now goes through one guard that turns a throw into a `<<THREW: …>>` text and a hang into `<<HUNG: …>>` after 3 s with a real timer that is cleared when the call settles. Both are now caught by named checks.
- **A test input the child process refused.** The first version of the megabyte check passed 200 KB as a command-line argument, which Linux refuses above 128 KB, so the judge was handed nothing and the check failed for that reason; it also asserted 1800 characters where `clip` keeps 1800 and appends one ellipsis. The input is now built by replacing a marker in real output, and the bound is 1801.
- **An IP literal was reported as an IPv6 answer.** Running `--live` on this machine printed `dns-v6=ok 192.0.2.1 0ms` for the documentation-address shape, because Node returns an IP literal as it is whatever family is asked (the new self-test asserts that premise against the real `dns.lookup`). The description now keeps only addresses of the family asked for; the same line reads `dns-v6=ok no address of this family (the lookup returned 192.0.2.1) 0ms`, and `egress-path-dns-other-family-kept` removes the filter and is caught.

- **The harness read one of my registry strings as an import.** The mutation harness's own self-test scans its source for import specifiers to learn which modules it is built from. The entry that drops render-check's import carried that import line as its search text, so the scan counted the egress path module among the harness's modules and `THE FILES THIS HARNESS IS BUILT FROM ARE ALL LISTED` failed. The first attempt at a fix put the same pattern in an explanatory comment, which made the self-test throw ENOENT on a file that does not exist. The search text is now two string literals joined, the comment avoids the pattern, and the harness self-test is 213 of 213.

- **My stop signal went to the wrong process.** The driver that stops the in-process mutation suite found it with `pgrep -f "node scripts/mutation-check.mjs$"`, which also matches the `/bin/sh -c node scripts/mutation-check.mjs` wrapper the gate starts it through. The signal went to the wrapper and the harness kept running; I saw it only because the next read of the process list showed both pids. Nothing was lost (see the gate section), and a driver for this should match the process whose parent is the wrapper.

## The runner steps, tested here with stubs

Each step's script was taken from the parsed YAML and run under `bash -e`, as the runner runs it. `check:workflows` first failed on the E2E step (a pipe into `tee` with no `PIPESTATUS`); the `/etc/hosts` append is now a here-string and the check is 71 of 71.

| step | stubbed | observed here |
|---|---|---|
| Survey the runner | none | exit 0; four sections written; `STAMP` written to the env file; on this machine no `.setup_info` exists and no ancestor is a runner agent, which the artifact says in words |
| Fault-injected render-check, render-check fails with the description | `sudo`, `curl`, `getent`, `npm` | exit 0; artifact last line `VERDICT: observed — the chip check's FAIL carries egress-path:, a probe-error with a cause, and dns-v4=`; the hosts file was restored by the trap |
| Fault-injected render-check, render-check passes with no known ground | the same | exit 1; last line `VERDICT: not-observable — the chip check did not fail (render-check exited 0); its warning says why, above`; the hosts file was restored |

`--live` ran here once. All four shapes came out as expected on this machine (`checked 4 of 4 shapes`, `VERDICT: pass`). The real host is a DNS failure here, the documentation address is refused at once (on a runner it may hang or be refused), and the egress source reads `unreadable (ERR_TLS_CERT_ALTNAME_INVALID)` because this sandbox's proxy answers for the IP literal. Those are properties of this machine, not findings about a runner.

## The gate

Two local runs of `npm run gate` on this change. Both ran on a dirty tree, so neither line is committed to `docs/confidence-log.jsonl`, which holds CI measurements of pushed trees (the call the 2026-11-13 session made for its own dirty run). The values are the gate's printed lines.

| run id | score | seconds | failing rows |
|---|---|---|---|
| `4c88e743e857-f343dc997978` | 92 of 100 | 127 | 2: the first run, below |
| `4c88e743e857-b1cc96657495` | 96 of 100 | 4,791 | 1: the mutation row, stopped by me, below |

**First run.** Two rows failed, and neither was the code under review:

- **breaking each invariant makes a check fail**: the harness self-test failure described above.
- **the F# harness refuses a check with no counterexample**: `node build/VerifyMain.js` held 476 of 477 under this shell's `TZ=America/New_York` (`/etc/timezone` says Etc/UTC). The check is `before kickoff the status is 'Scheduled <raw> (parsed HH:mm)', byte for byte`, added in `5a1f98bb` on 2026-11-11: it expects `parsed 23:05` for `23:05:00Z`, which holds only when the process's zone is UTC. `TZ=UTC node build/VerifyMain.js` on the same build held 477 of 477, and `TZ=America/New_York` failed it again. No F# file is touched by this change. The check is not changed here: it belongs to `docs/CC-CMD-2026-11-11-soccer-live-scores.md`, which is open. `outbox/cc-session-2026-11-12-venue-review-counts.md` had already recorded it as another session's finding, and the soccer CC-CMD gets the finding in the docs-only commit that closes this work.

**Second run, under `TZ=UTC`.** 22 of 23 rows PASS: rows 1 to 15 and 17 to 23, the same 22 rows Task 9 of the soccer CC-CMD runs locally. The 16th row, "breaking each invariant makes a check fail", runs `node scripts/mutation-check.mjs` in one process: 1,528 entries, and the entries whose expectation is the harness's own self-test took 32, 52 and 48 seconds each at the three consecutive entries I timed (a sample every 2 seconds). I stopped it after 4,697 seconds at about entry 176, with its baseline already printed (`ran 104 of 104 distinct expectation(s) from 1528 mutation(s), 0 failing`). It does not finish on this container, and CI runs it as eight shards. `docs/GATE-TIMING.md` puts the self-test work in that row at about 2.5 hours serial, and `outbox/cc-session-2026-11-12-venue-review-counts.md` records that the gate does not finish locally. I had quoted "about 52 minutes" for the local run without reading either: that figure is the CI wait, and the 3,000-second lines in the log are `Record CI measurement` commits.

The stop was SIGINT to the harness. It put its file back within 36 seconds: `scripts/mutation-check.mjs` has the sha256 its marker recorded before the run, and `node scripts/mutation-check.mjs --stranded` exits 0 with no marker and no build driver left. `git status` then listed this change's eight files and the six files the rows regenerate (four screenshots, the mutation baseline and the log); those six were put back with `git checkout`, because the baseline is the full run's artifact and a stopped run is not one.

**What stands in for the 16th row, locally.** `node scripts/mutation-check.mjs --ids` on the 23 new entries and the one existing entry that runs `render-check.mjs` (`arena-predicate-ignored`): checked 24 of 1,528 mutations, 24 caught, baseline 2 of 2 distinct expectations. `npm run check:mutation-anchors` passes (`checked 1526 of 1529 mutation anchors; 0 stale`, self-test 213 of 213), and so do `check:egress-path`, `check:import-purity`, `check:workflows`, `check:script-orphans`, `check:history`, `check:citations`, `check:docs` and the CC-CMD status check. None of that is the whole table.

**The region fix's local run.** `npm run gate` under `TZ=UTC` on the tree with the fix: run `0391f380bdc3-9b45aa1c8ed5`, tree dirty, so not committed to `docs/confidence-log.jsonl`. 510 of 530, 96 of 100, 291 s: 22 of 23 rows PASS, and the 16th, the in-process mutation suite, stopped by me at 195 s with `Mutation testing 1532 invariant(s)` printed (1528 plus the four entries added). The gate's own words are `1 FAILING ROW(S). Do not commit.`, and 96 is not the pass condition. The scored run is `verify-full` on the branch. The checks that stand in for the 16th row are the five mutations through `--ids` (6 of 6) and by hand (the table above), `check:mutation-anchors` (`checked 1530 of 1533 mutation anchors; 0 stale`, self-test 213 of 213), and `check:egress-path`, `check:import-purity`, `check:workflows` (71 of 71), `check:script-orphans`, `check:history`, `check:citations`, `check:docs`, `check:outbox-row` and the CC-CMD status check, all exit 0.

My driver's first SIGINT went to the `sh -c` wrapper that `pgrep -f` matched, not to the node harness, which ran on until a second SIGINT to its own pid stopped it. When I looked, its state directory held `run.json` and no `active.json`, and its output ended at the `Mutation testing 1532 invariant(s)` header with no baseline line, so no mutation was active when the second signal stopped it. After the stop: the sha256 of the three changed files identical to before the run, `.mutation-state` gone, `node scripts/mutation-check.mjs --stranded` exit 0 (`0 hold a marker`), and the two files the rows regenerate (`docs/confidence-log.jsonl`, `outbox/metrics-tab-latest.png`) put back with `git checkout`.

**The scored gate** for the whole table is `verify-full` on a work branch before the commit lands on `main`, as Task 9 of the soccer CC-CMD did. Its run id is in `outbox/cc-session-2026-11-14-egress-diagnostics.md`, not here: a note committed with the code cannot name the score that gated the commit.

## What is not established

- **That a runner prints the fixed region and cloud.** Where they can be read is established: the survey of run 43620413444 found `.setup_info` beside the runner agent (761 bytes, `Group` and `Detail` keys; `Region: southcentralus`, `Cloud: Azure`), and the five runner lines of that pass reached it and printed `unreadable (no Region line)`. The parser is fixed here and replayed on those 761 bytes on this machine; no runner has printed the result yet (done condition 5).
- **That `ImageOS` and `ImageVersion` are set in a step.** They are read from the environment; the survey prints them.
- **That `https://1.1.1.1/cdn-cgi/trace` answers from a runner.** It is one source for the egress address; the live artifact shows what it gave.
- **That poisoning `/etc/hosts` is honoured by Chromium as well as Node.** The fault-injected step reports `observed`, `incomplete` or `not-observable`; only the first is met, and a slate with no known ground is not-observable.
- **The whole mutation table on this tree.** Not run locally (it does not finish here); 24 of 1,528 entries ran. The scored `verify-full` run covers the rest.
- **The cause of the three silent reds.** The description names Node's path at a later moment than the page's window; it cannot say why Chromium got no answer.

## Next

The region fix is one source commit with this note on the work branch `egress-region-fix`: `git fetch origin`, a rebase onto `origin/main`, push the branch, dispatch `verify-full` on it and read the run by REST on the full SHA. If every row passes, it lands on `main` directly with the run id in the message, and `verify`, `guards`, `deploy` and `live-check` are read on the landing SHA. A runner prints the fixed line at the next `live-check` red, or from one more dispatch of `open-meteo-egress-probe.yml` on `main`; the one dispatch the owner approved is used, so a second needs the owner's word. The probe is dispatched on `main` and not on a branch because its last step runs `git push origin HEAD:main`, which from a branch would land the unscored commit. `outbox/cc-session-2026-11-14-egress-diagnostics.md` is written last.
