# Session record: the weather failure message shows whether the host's other address answers — 2026-11-14

Session doc (Rule 67) for `docs/CC-CMD-2026-11-14-weather-failure-tls-stage.md`, commissioned by the owner's word "TLS" (Saturday 2026-11-14, 20:18 ET). The mutation record is `outbox/egress-path-tls-mutations-2026-11-14.txt`. The premise record, 14 runner runs made before the CC-CMD was filed, is `outbox/tls-stage-premise-2026-11-14.txt`. This file is the session's manifest.

**State:** Landed on `main` as `a25df340` at 04:11:43Z (23:11 ET), a merge of `tls-stage`. The scored `verify-full` passed 530 of 530 (3284 s, ledger id `5c2021b01b8c-faad15047249`). `verify` and `guards` are green on the landing and `deploy` is green on `f30d2b99`, which differs from it by five outbox files. A dispatch of the probe on `main` printed the new text from a real runner and passed the 14-condition assertion. Done conditions 1 to 6 are met (table below). The post-deploy `live-check` (43676533656) is red at one step, the brief check, which has failed every run that reached it since 2026-11-14 23:06Z; its weather step passed. A scheduled task reads the first weather red on Monday 2026-11-16 at 08:00 ET.

## HEAD progression

| HEAD | what it is | scored or read by |
|---|---|---|
| `c7c29272` | `main` when the CC-CMD was filed (the probe block's HEAD) | |
| `461ff944` | the CC-CMD and the premise evidence, docs and outbox only | |
| `a69191d5` | the workflow guard, on branch `tls-stage` | |
| `f3c9f80b` | the library: the TLS stage, every address, two subnet views; 41 mutations | `verify-full` 43668099984 (cancelled when the next commit's gate was dispatched), probe run 43668129783 success |
| `370da1a7` | `runLive` takes its network calls and its output as parameters; 9 checks, 7 mutations | `verify-full` 43669293494 (cancelled by the dispatch below), probe run 43669295856 success |
| `4f6fb6b7`, `154d9c92` | the two cancelled gates' recording commits (author `field-laboratory`, each carrying the skip directive in its message) | |
| `5c2021b0` | two gaps a generic operator sweep found; rebased onto the two recording commits (the first version, `298d0fe0`, was never scored) | `verify-full` 43670381109 (dispatched on the stale head `4f6fb6b7` and cancelled one minute later), `verify-full` 43670536247 (530 of 530, 100/100 against a bar of 95, 3284 s, ledger id `5c2021b01b8c-faad15047249`), `verify` 43671132728 (failed: `browser-gate` alone, the other five jobs green; see "What was wrong") |
| `34d8c0cb` to `226a9ba6` | ten commits other sessions pushed to `main` while this work was on its branch: three source changes by `FIELD CI` (`247ec332`, `2e4c205a`, `8807ffb9`), five status refreshes and two probe records | merged into the branch as `5f4b000b` (next rows) |
| `22bc4155`, `0acea8db` | the scored gate's two recording commits (author `field-laboratory`: the mutation baseline and the CI measurement, each carrying the skip directive in its message) | |
| `9ec6907c` | the workflow guard's fix (see "What was wrong"): the ref check moves into the Commit step's script and the step's `if:` is `always()` again | `browser-gate` green in `verify` 43675133674 (next row) and in 43675679692 (the landing) |
| `5f4b000b` | `main` merged into `tls-stage` (the fix, and `main`'s ten commits) | `verify` 43675133674, dispatched on this head: 6 of 6 jobs success |
| `a25df340` | the landing: `git merge --no-ff tls-stage` into `main` (parents `226a9ba6` and `5f4b000b`), pushed 04:11:43Z (23:11 ET) | `verify` 43675679692: 6 of 6 jobs success; `guards` 43675679713: success |
| `f30d2b99` | the probe dispatch's artifacts commit (author `Claude`; five files under `outbox/`), pushed by run 43675697053 | `deploy` 43676444094: success, on this SHA; `live-check` 43676533656: failure at the brief step only |
| this commit | this record and the CC-CMD's Status and Outcome; `docs/` and `outbox/` only, so `verify` does not run on it | the docs guards and the pre-commit hook before the push |

The landing is a merge commit (`git merge --no-ff`, as the CC-CMD's Task 4 says) so that the scored gate's run id is in `main`'s history. The scored gate's two recording commits (`22bc4155`, `0acea8db`) carry the skip directive in their messages, as the workflow writes them, and are in that history; neither was the head commit of a push to `main`. The head was the merge, whose message carries no skip directive, which is why `verify` (43675679692) and `guards` (43675679713) ran for it.

## What each commit did

- `a69191d5`: `.github/workflows/open-meteo-egress-probe.yml`, 4 lines. The Commit step ran only when `github.ref == 'refs/heads/main'`, written as the step's `if:` (`always() && github.ref == 'refs/heads/main'`). It ends in `git push origin HEAD:main`, so a dispatch from a branch would have put that branch's commits on `main`; on a branch every artifact is in the step logs instead. That form turned the `browser-gate` job red (see "What was wrong") and is replaced by the next entry but one.
- `f3c9f80b`: `scripts/egress-path-lib.mjs` and `scripts/mutation-check.mjs`. The description keeps its 11 keys and gains four, `public-v4`, `view-west-v4`, `view-east-v4` and `tls`, 15 in all, and every branch prints every key. New: `VANTAGES` (the `/24` of a westus2 runner, `20.80.173.0/24`, and of an eastus2 runner, `68.220.172.0/24`), `dohUrl`, `parseDoh`, `unionOf`, and `makeTlsConnect` (SNI the host, ALPN `http/1.1`, 3000 ms per handshake, one per address, in parallel). `describeEgressFacts` returns the addresses and their verdicts, and `describeEgressPath` formats them with the signature and text contract it had. `judgeE2E` requires `tls=` in the failing text. `--live` prints `addresses: N found, N with a settled TLS verdict`. The loopback checks read what the server was sent inside its `ALPNCallback`, because the client closes the moment it is done (the comment at `scripts/egress-path-lib.mjs:942`). 41 registered mutations.
- `370da1a7`: `runLive(outFile, io = liveIO, log = console.log)`. The self-test drives the whole `--live` mode on known results. 9 checks and 7 registered mutations: the address clause, each shape's binding to its expected addresses, and the two printed address lines. Why: with the address clause deleted from `runLive` the self-test still printed `138/138`.
- `5c2021b0`: a loopback check of `makeTlsConnect` with a port out of range (`tls.connect` throws synchronously with `ERR_SOCKET_BAD_PORT`; the verdict must be a named failure), a check that the real shape's address expectation passes a host with one address (found 1, probed 1, settled 1: one is enough), and the two registered mutations that a generic sweep of the new code found unkilled: `egress-path-tls-sync-throw-as-ok` and `egress-path-live-real-one-address-fails`. Lines 1 to 594 of the library (everything before the self-test) are byte-identical to `370da1a7`: `diff` of those lines exited 0.
- `9ec6907c`: `.github/workflows/open-meteo-egress-probe.yml`, 1 file, 12 insertions and 4 deletions. The Commit step's `if:` is `always()` again. The ref check is the first thing its script does: it prints `ref: <GITHUB_REF>`, and when that is not `refs/heads/main` (or is unset) it prints why and exits 0 before `git add`. The annotation above the install now says the verdict is committed on main and printed in the log on any other ref; N stays 1. Its own `ci:` commit, because it undoes part of `a69191d5` and the reason is not the TLS stage's.
- Registered `egress-path-*` mutations: 27 on `461ff944`, 77 on `5c2021b0`; by commit 41, 7 and 2.

## Verified end to end

**Verified, with the artifact that shows it**

- The new text from a real runner, twice, by dispatching the probe from the work branch (its Commit step is skipped there, so each artifact is in the run log; both were extracted and run through the assertion in Appendix A, 14 of 14 conditions each). Run 43668129783 (`f3c9f80b`, Azure westus3, 02:33:59Z): the real forecast request failed with `UND_ERR_CONNECT_TIMEOUT` after 13.6 s, and the line printed

  ```
  dns-v4=ok 51.81.167.44 3ms | public-v4=doh 8.8.8.8 ok 51.81.167.44 33ms | view-west-v4=doh 8.8.8.8 ecs 20.80.173.0/24 ok 51.81.167.44 32ms | view-east-v4=doh 8.8.8.8 ecs 68.220.172.0/24 ok 167.114.211.86 30ms | connect-v4=51.81.167.44:443 ok 34ms | tls=51.81.167.44:443 no-tls-in-3000ms (tcp 38ms) from system,public,west ; 167.114.211.86:443 ok (tcp 75ms, handshake 74ms) from east
  ```

  Run 43669295856 (`370da1a7`, Azure eastus, 02:48:44Z): HTTP 200, and

  ```
  dns-v4=ok 167.114.211.86 1ms | public-v4=doh 8.8.8.8 ok 167.114.211.86 13ms | view-west-v4=doh 8.8.8.8 ecs 20.80.173.0/24 ok 51.81.167.44 11ms | view-east-v4=doh 8.8.8.8 ecs 68.220.172.0/24 ok 167.114.211.86 12ms | connect-v4=167.114.211.86:443 ok 17ms | tls=167.114.211.86:443 ok (tcp 17ms, handshake 18ms) from system,public,east ; 51.81.167.44:443 no-tls-in-3000ms (tcp 67ms) from west
  ```

  From the failing runner the line shows the other address completing a handshake in 74 ms while the address the system resolver gave completes TCP in 38 ms and no handshake in 3000 ms; from the healthy one the same pair reads the other way round. The two subnet views gave different addresses on both runners, as the zone's steering by client subnet predicts. These are probe runs, not `live-check` reds.
- The assertion fails on the artifacts that existed before this change, and passes on the two new ones. Run from the repository root, `node assert-tls-artifacts.mjs outbox/egress-path-live-20261114T203623Z.txt outbox/egress-path-e2e-20261114T203623Z.txt` (the previous stamp, the old library) printed, exit 1:

  ```
  PASS  live: the first line is the coverage, "checked 4 of 4 shapes"
  PASS  live: the last line is "VERDICT: pass, 4 of 4 shapes as expected"
  PASS  live/real: a description line is there
  FAIL  live/real: "addresses: N found, N with a settled TLS verdict", N >= 1, every probed address settled
        → no addresses line
  FAIL  live/real: tls= carries one entry per settled address, each with a verdict and its sources
        → 0 entries: 
  FAIL  live/real: public view shows an address or a named failure
        → key missing
  FAIL  live/real: west view shows an address or a named failure
        → key missing
  FAIL  live/real: east view shows an address or a named failure
        → key missing
  PASS  live/real: when both subnet views answered they show DIFFERENT addresses (a property of the zone; if it does not hold this stays open)
  PASS  live/real: the key list is whole and the runner line is intact
  PASS  e2e: the first line is the coverage, "checked 1 of 1 end-to-end run"
  PASS  e2e: VERDICT: observed
  FAIL  e2e: the failing text carries tls= with the fault address and its verdict
        → 
  PASS  e2e: the runner line is intact, to the sentence that follows the description

  checked 14 of 14 conditions; 6 failed
  ```

  and on the two branch-probe artifacts it printed `checked 14 of 14 conditions; 0 failed` each, exit 0.
- The assertion was failed on purpose before it was trusted (Rule 90). `assert-selfcheck.mjs` (Appendix B) builds well-formed artifacts with the library itself, then makes 17 breaks, each aimed at one named condition. Printed, exit 0:

  ```
  well-formed synthetic artifacts: 14 of 14 conditions pass
  RED  live: coverage line replaced: aimed at "live: the first line is the coverage"; 1 failing
  RED  live: verdict not pass: aimed at "live: the last line is"; 1 failing
  RED  live: the real section has no description line: aimed at "a description line is there"; 6 failing, 5 stray
  RED  live: no addresses line: aimed at ""addresses: N found"; 2 failing, 1 stray
  RED  live: zero addresses found: aimed at ""addresses: N found"; 2 failing, 1 stray
  RED  live: settled fewer than found: aimed at ""addresses: N found"; 2 failing, 1 stray
  RED  live: tls= stripped: aimed at "tls= carries one entry"; 1 failing
  RED  live: public view unfinished: aimed at "public view"; 1 failing
  RED  live: west view missing: aimed at "west view"; 1 failing
  RED  live: east view missing: aimed at "east view"; 1 failing
  RED  live: both views the same address: aimed at "DIFFERENT addresses"; 1 failing
  RED  live: runner line clipped: aimed at "the key list is whole"; 1 failing
  RED  e2e: coverage line replaced: aimed at "e2e: the first line is the coverage"; 1 failing
  RED  e2e: verdict incomplete: aimed at "e2e: VERDICT: observed"; 1 failing
  RED  e2e: tls= stripped: aimed at "e2e: the failing text carries tls="; 1 failing
  RED  e2e: fault address verdict unreadable: aimed at "e2e: the failing text carries tls="; 1 failing
  RED  e2e: description clipped before runner: aimed at "e2e: the runner line is intact"; 1 failing
  breaks that turned their target condition red: 17 of 17; with stray reds beside it: 4
  conditions turned red by at least one break: 14 of 14
  the well-formed pair passes all of its 14 conditions
  ```
- **The guard that went red on the branch, red on the committed file and green on the fix.** `scripts/check-browser-gate.py` run from a scratch copy of the tree (`cp -r .github scripts package.json`), once with the workflow file as committed at `5c2021b0` and once with the fixed file. Relevant lines of the output, in that order:

  ```
  # scripts/check-browser-gate.py, run from a scratch copy of the landing tree (a25df340), on two versions of .github/workflows/open-meteo-egress-probe.yml
  # version 1: the file as committed at 5c2021b0 (the Commit step's if: is always() && github.ref == 'refs/heads/main')
    .github/workflows/open-meteo-egress-probe.yml:40  N=2  a failed install ends the job red; it skips the Build and the Probe (the probe needs the browser and the build); the runner survey, the failure shapes and the fault-injected render-check carry always() a
  FAIL: 1 problem(s):
    - .github/workflows/open-meteo-egress-probe.yml:40: 2 step(s) after the install are not certain to run when it fails and are not shown to need a browser, but the annotation says 1. A step added there may be lost when the install fails: if it matters, give th
  exit: 1

  # version 2: the file at the landing SHA (the Commit step's if: is always(); the ref check is in its script)
    .github/workflows/open-meteo-egress-probe.yml:40  N=1  a failed install ends the job red; it skips the Build and the Probe (the probe needs the browser and the build); the runner survey, the failure shapes and the fault-injected render-check carry always() a
  verdict: gated
  exit: 0

  # the guard's self-test and check:workflows on the landing tree itself:
  262/262 checks passed
  71/71 checks passed
  ```

- **The Commit step's script, run for five cases against a local bare repository standing in for origin** (Appendix C reads the script out of the workflow file and runs it under `bash -e`). A: ref is a branch, with a commit only the work side holds: nothing is staged, committed or pushed. B: ref is `main`: exactly one commit reaches origin, carrying the reading and only the reading, with the step's own record message. C: `GITHUB_REF` unset: nothing is pushed. D, the mutant, the ref check deleted from the script: the branch-only commit reaches origin's `main`, which is the hazard the check exists for, so a pass in A and C can fail. E: ref is `main`, nothing to commit: the step's earlier path is intact. What the harness printed:

  ```
  step condition read from the file: 'always()'
  mutant: the ref check removed (1 block, 4 lines)
  A. ref is a branch (refs/heads/tls-stage), the script as committed; the work side holds a commit origin does not
        | ref: refs/heads/tls-stage
        | not refs/heads/main: nothing is committed or pushed from this run; the readings are in the log above
      ok    the scratch clone has no hooks path, so no hook of the laboratory ran
      ok    exit status 0
      ok    it prints the ref it saw
      ok    it says why it did nothing
      ok    origin main is unchanged
      ok    no commit was made on the work side (HEAD is still the branch-only commit)
      ok    nothing was staged
  B. ref is main, the script as committed; the work side is main with a new reading
        | ref: refs/heads/main
        | ok — 1 staged path(s), source is paired or absent
        | [main eb313d39] probe: open-meteo egress from node vs the browser [skip ci]
        |  1 file changed, 1 insertion(+)
        |  create mode 100644 outbox/egress-path-sim-reading.txt
        | From /tmp/claude-0/-home-claude/17dcf9de-532b-5e13-b576-6123f7d6b834/scratchpad/sim-commit-step/origin
        |  * branch              main       -> FETCH_HEAD
        | Current branch main is up to date.
        | To /tmp/claude-0/-home-claude/17dcf9de-532b-5e13-b576-6123f7d6b834/scratchpad/sim-commit-step/origin.git
        |    a25df340..eb313d39  HEAD -> main
      ok    exit status 0
      ok    it prints the ref it saw
      ok    origin main moved by exactly one commit
      ok    that commit carries the reading and only the reading
      ok    its subject is the step's own record message
  C. GITHUB_REF is not set at all, the script as committed (a missing variable must not push)
        | ref: unset
        | not refs/heads/main: nothing is committed or pushed from this run; the readings are in the log above
      ok    exit status 0
      ok    it names the ref as unset
      ok    it says why it did nothing
      ok    origin main is unchanged
  D. MUTANT: ref is a branch, the ref check removed from the script; the work side holds a commit origin does not
        | ref: refs/heads/tls-stage
        | ok — 1 staged path(s), source is paired or absent
        | [main 16d4e010] probe: open-meteo egress from node vs the browser [skip ci]
        |  1 file changed, 1 insertion(+)
        |  create mode 100644 outbox/egress-path-sim-reading.txt
        | From /tmp/claude-0/-home-claude/17dcf9de-532b-5e13-b576-6123f7d6b834/scratchpad/sim-commit-step/origin
        |  * branch              main       -> FETCH_HEAD
        | Current branch main is up to date.
        | To /tmp/claude-0/-home-claude/17dcf9de-532b-5e13-b576-6123f7d6b834/scratchpad/sim-commit-step/origin.git
        |    a25df340..16d4e010  HEAD -> main
      ok    the hazard shows: origin main moved
      ok    the hazard shows: the branch-only commit is now on main
  E. ref is main and there is nothing to commit (the step's own earlier path)
        | ref: refs/heads/main
        | nothing to commit
      ok    exit status 0
      ok    it says nothing to commit
      ok    origin main is unchanged

  checked 5 of 5 cases; 21 checks passed, 0 failed
  VERDICT: pass
  ```

  This harness is a copy of the runner's behaviour. That the runner sets `GITHUB_REF` to `refs/heads/main` on a dispatch from `main` is read from the next dispatch's log, which now prints `ref: <value>` first (below).
- **The dispatch on `main`, after landing.** Run 43675697053 (`a25df340`, Azure southcentralus, created 04:11:57Z, finished 04:14:55Z, conclusion success). Its Commit step printed `ref: refs/heads/main` as its first line, so `GITHUB_REF` is `refs/heads/main` on a dispatch from `main`, which the simulation above could only assume; it then committed the reading as `f30d2b99` (`a25df34..f30d2b9  HEAD -> main` in the log). The assertion (Appendix A) on the run's two new artifacts, `outbox/egress-path-live-20261115T041303Z.txt` and `outbox/egress-path-e2e-20261115T041303Z.txt`, printed, exit 0:

  ```
  PASS  live: the first line is the coverage, "checked 4 of 4 shapes"
  PASS  live: the last line is "VERDICT: pass, 4 of 4 shapes as expected"
  PASS  live/real: a description line is there
  PASS  live/real: "addresses: N found, N with a settled TLS verdict", N >= 1, every probed address settled
  PASS  live/real: tls= carries one entry per settled address, each with a verdict and its sources
  PASS  live/real: public view shows an address or a named failure
  PASS  live/real: west view shows an address or a named failure
  PASS  live/real: east view shows an address or a named failure
  PASS  live/real: when both subnet views answered they show DIFFERENT addresses (a property of the zone; if it does not hold this stays open)
  PASS  live/real: the key list is whole and the runner line is intact
  PASS  e2e: the first line is the coverage, "checked 1 of 1 end-to-end run"
  PASS  e2e: VERDICT: observed
  PASS  e2e: the failing text carries tls= with the fault address and its verdict
  PASS  e2e: the runner line is intact, to the sentence that follows the description
  
  checked 14 of 14 conditions; 0 failed
  ```

- **After the landing, read by REST on the SHAs.** `verify` 43675679692 and `guards` 43675679713 on `a25df340`: success. `deploy` 43676444094 on `f30d2b99`: success. `live-check` 43676533656 on `f30d2b99`: failure. Its steps: "The deployed build stamp matches main" success; "The deploy landed (published is the newest deployable commit)" success (`LANDED — published f30d2b9 is a non-deployable commit on top of 9ec6907; its tree contains every deployable change`); "Render the deployed page and assert on it", the weather step, success, the page's 56 open-meteo requests answering in 16 to 53 ms; "A finished game shows the brief written after it finished" failure, 3 of 42 testable rows. That red is not a weather red and is not new (Residual). The job is red because of it.

## Observed on the way

**The weather step across the day's `live-check` runs, and the runners they ran on.** Read from the job logs (`Region:` and `Cloud:` in each header). "Weather step" is "Render the deployed page and assert on it"; "brief step" is "A finished game shows the brief written after it finished". Checked 16 of 16 `live-check` runs created since 2026-11-14 00:00Z: 13 reached the weather step and 3 did not: 2 were skipped (the run's conclusion is `skipped`; neither ran a step) and 1 (43640218241, a dispatch) failed at the deploy check and never rendered. The 13, newest first:

| run | created (UTC) | runner | weather step | brief step |
|---|---|---|---|---|
| 43676533656 | 2026-11-15 04:23Z | AWS us-east-1 | passed | failed |
| 43673414837 | 2026-11-15 03:40Z | AWS us-east-1 | passed | failed |
| 43671813126 | 2026-11-15 03:19Z | Azure eastus | passed | failed |
| 43669286520 | 2026-11-15 02:45Z | Azure eastus | passed | failed |
| 43658647710 | 2026-11-15 00:32Z | AWS us-east-1 | passed | failed |
| 43651541854 | 2026-11-14 23:06Z | Azure eastus2 | passed | failed |
| 43631078973 | 2026-11-14 19:15Z | Azure westus3 | failed | passed |
| 43627924560 | 2026-11-14 18:40Z | Azure eastus2 | passed | passed |
| 43620118846 | 2026-11-14 17:15Z | Azure westus2 | failed | passed |
| 43603906789 | 2026-11-14 14:15Z | Azure westus3 | failed | passed |
| 43587347908 | 2026-11-14 10:52Z | Azure westus2 | failed | passed |
| 43567330161 | 2026-11-14 06:38Z | Azure centralus | passed | passed |
| 43539102233 | 2026-11-14 01:11Z | AWS us-west-2 | failed | passed |

The weather step failed in 5 of the 13 and passed in 8. All 5 failures ran on a west-coast runner (westus2 (2), westus3 (2), us-west-2 (1)); the 8 passes ran on us-east-1 (3), eastus (2), eastus2 (2), centralus (1). That fits the address story the premise runs found. It is 13 runs, a split on the runner's region name and not on the address each runner was given, so it is a fit and not a test: the first weather red after this lands reads the answer from its own `tls=` entry. Two of the 5 reds (43620118846 and 43631078973) carry an `egress-path:` text, `dns-v4=ok 51.81.167.44` and a `connect-v4` that completed (12 ms and 33 ms); the other 3 predate the description. The four chip checks that fail together are `every card whose venue the table knows carries a live chip`, `every live chip carries a real roof caveat`, `every live chip reads as a temperature and nothing else` and `the chips all filled within the wait`.

The brief step passed in the 7 runs up to 2026-11-14 19:15Z and failed in the 6 from 2026-11-14 23:06Z on, the newest being the `live-check` that followed this landing's `deploy`. It is a different step with a different message and is covered under Residual.

## Done conditions

| # | printed output | status |
|---|---|---|
| 1 | `148/148 checks passed`, `checked 18 of 18 described lines for all 15 keys`, `checked 7 of 7 loopback TLS shapes` (`node scripts/egress-path-lib.mjs --self-test` at `5c2021b0`); 50 new registered mutations, each caught: `checked 50 of 50 new mutations, applied twice` (the evidence file, sections 1 to 4), and in the scored gate the eight shards ran 1582 of 1582 mutation ids (198 in six shards and 197 in two; 77 of the ids are `egress-path-*`) and the committed `outbox/mutation-baseline-latest.json` reads `"from_mutations": 1582, "failing": 0`; `node scripts/mutation-check.mjs --anchors`: `checked 1580 of 1583 mutation anchors; 0 stale` (the 3 not checked are world mutations, which carry no file anchor) | met |
| 2 | `git diff --stat a25df340^1 a25df340`: 7 files changed, 1242 insertions(+), 38 deletions(-): `.github/workflows/open-meteo-egress-probe.yml`, `scripts/egress-path-lib.mjs`, `scripts/mutation-check.mjs`, `outbox/egress-path-tls-mutations-2026-11-14.txt`, `outbox/mutation-baseline-latest.json`, `docs/confidence-log.jsonl`, `docs/scale-log.jsonl`. Paths in that diff under `src/` or equal to `scripts/render-check.mjs`: 0 (`git diff --name-only` through `grep -c` printed `0`). The relay is another repository | met |
| 3 | `outbox/egress-path-live-20261115T041303Z.txt`, from the dispatch on `main` (run 43675697053, `a25df340`). Line 1: `checked 4 of 4 shapes; node v22.23.4; 2026-11-15T04:14:13.865Z`. Last line: `VERDICT: pass, 4 of 4 shapes as expected`. In `## real`: `addresses: 2 found, 2 with a settled TLS verdict`; `public-v4=doh 8.8.8.8 ok 167.114.211.86 16ms`; `view-west-v4=doh 8.8.8.8 ecs 20.80.173.0/24 ok 51.81.167.44 21ms`; `view-east-v4=doh 8.8.8.8 ecs 68.220.172.0/24 ok 167.114.211.86 19ms` (the two views differ); `tls=167.114.211.86:443 ok (tcp 47ms, handshake 49ms) from system,public,east ; 51.81.167.44:443 no-tls-in-3000ms (tcp 58ms) from west`. Appendix A on this file: PASS on every `live` condition | met (both subnet views answered and gave different addresses, as the condition requires) |
| 4 | `outbox/egress-path-e2e-20261115T041303Z.txt`: `checked 1 of 1 end-to-end run; render-check exit 1`; the fault `api.open-meteo.com resolves to 192.0.2.1`; the last line `VERDICT: observed — the chip check's FAIL carries egress-path:, a probe-error with a cause, dns-v4= and tls=`. Its `tls=` entry: `192.0.2.1:443 no-connect-in-3000ms (tcp not completed) from system ; 167.114.211.86:443 ok (tcp 49ms, handshake 52ms) from public,east ; 51.81.167.44:443 no-tls-in-3000ms (tcp 58ms) from west`. Appendix A on this file: PASS on every `e2e` condition | met |
| 5 | `runner=image ubuntu26@20261111.196.1 region southcentralus cloud Azure` appears in 4 of 4 `egress-path:` lines of the live artifact and in the end-to-end artifact's failing text (5 of 5 occurrences, counted with `grep -o`); the assertion's two conditions on it ("the key list is whole and the runner line is intact", "the runner line is intact, to the sentence that follows the description") are PASS. The runner survey of the same dispatch is `outbox/egress-path-survey-20261115T041303Z.txt` | met |
| 6 | Scored gate 43670536247 on `5c2021b0`: `530/530 points = 100/100   (bar: 95)   3284s` and `recorded in docs/confidence-log.jsonl as run 5c2021b01b8c-faad15047249`. On the landing SHA: `verify` 43675679692 (6 of 6 jobs success), `guards` 43675679713 (success). `deploy` 43676444094: success, on `f30d2b99`, which descends from the landing and differs from it by the five outbox files of the probe's artifacts commit (`deploy` takes `main`'s head when `verify` finishes, and that commit had been pushed first) | met. `live-check` is not part of this condition; it is red at a different step (Observed on the way, Residual) |

## What was wrong, and what it cost

- **A guard I did not run.** `a69191d5` put `github.ref == 'refs/heads/main'` into the Commit step's `if:`. Its verification was `npm run check:workflows` (71 of 71). `scripts/check-browser-gate.py` counts a step whose `if` says more than `always()` as one a failed install may skip, so the file's pinned count went from 1 to 2 and the annotation said 1. Nothing local runs that guard: `.githooks/pre-commit` runs `check:workflows`, `scripts/gate-checks.mjs` has no row for it, and `verify.yml` runs on push to `main` only, so it would have gone red on `main` after landing. It was found because the plan dispatches `verify` on the branch head before landing: run 43671132728, job `browser-gate`, 22:33 ET, thirty minutes into a scored gate that this commit does not affect. Reproduced locally (`python3 scripts/check-browser-gate.py`, exit 1, the same message) before anything was changed. Cost: one more commit, one more `verify` dispatch, a landing head that differs from the scored head by this workflow file, and the wait: the fix could not be pushed while the gate ran, because a push would have cancelled it. Closed by moving the ref check out of the `if:` and into the script, because the step must run after a failed install and the main-only rule is a property of the ref, not of the install; the other way to turn the guard green was to change the annotation to 2, which would have said that a failed install may skip a step it does not.
- **A clause of my own code that no mutation covered.** The CC-CMD's Task 3.4 asks for one mutation per new clause, and the address clause of `runLive`'s pass predicate had none: deleted from a clean tree it left the self-test at `138/138`, so that clause had only ever been seen passing, on a runner. It was found while the first gate was running, before landing. Closed in `370da1a7` (parameters for the network calls and the output, 9 checks, 7 mutations). It cost a commit, and the gate that had started on `f3c9f80b` (43668099984, 15 min 55 s of run time) was cancelled to score the commit that carries the fix.
- **Two more, from a census that did not depend on what I thought to break.** A scanner found every `&&`, `||`, comparison, negation and boolean literal that is code on the lines this change added (93 of 93 mutants applied, each in its own copy). First run: 83 killed by a check, 3 crashed or hung, 7 survived. Two survivors were gaps in new code (`tls.connect` throwing synchronously was accepted as a completed handshake; a real host with only one address failed the address clause when it should pass) and are closed in `5c2021b0` with a check and a registered mutation each. Second run: 85 killed, 3 crashed or hung, 5 survived: one equivalent (`done` guards a second `settle`, and a promise resolves once) and four lines from the previous CC-CMD that this change did not write, listed under Residual. The sweep does not apply arithmetic, ternary branches, string contents, `await` or most method swaps; that is stated in the evidence file with the result.
- **A dispatch after a push that failed.** Two gates had been cancelled by dispatches, and each cancelled gate pushes a recording commit onto its branch, so `tls-stage` had moved when I pushed `5c2021b0`; the push was rejected (non-fast-forward). The command was chained with `;`, so the dispatch ran anyway, on the old head (43670381109). That dispatch and the gate before it (43669293494, 15 min 9 s of run time) were both cancelled; I waited for the branch to stop moving, rebased onto `154d9c92`, checked `git ls-remote` equal to the local HEAD, and dispatched 43670536247 at 03:02:47Z. A gate dispatch now follows a successful push with `&&` and an equality check, and the branch is not moved while a gate runs. Run time spent on gates that never scored: 32 min 4 s across 43668099984, 43669293494 and 43670381109. The owner was told 3 hours at 20:18 ET; the landing was pushed at 23:11 ET, inside that, and the proof dispatch, the reads of `deploy` and `live-check` and this record ran past it, to 23:36 ET.
- **A status message that said more than the data.** I told the owner that no ClientHello leaves the runner. The premise file and the CC-CMD say what was measured: the first 90 of about 290 captured lines show no client data segment and `curl -v` timed out at the 10 s cap it was given; that nothing left after those lines is not established. Corrected in the owner report.
- **Three numbers in this evening's chat messages that I had not read.** "4 of the last 6 runs fail at the weather step" (it is 1 of the last 6 and 5 of the last 14); a fifth runner "logged only as us" (my regex cut `us-west-2` at the hyphen); and clock times quoted without reading `date`, three of them: 11 minutes ahead of the clock (22:21 against 22:10), 5 minutes ahead (22:19 against 22:13:51) and 3 minutes ahead (22:46 against 22:43). The first two are from my notes of their corrections, made when they happened; the third is in this session's transcript (the message that corrected it). Each was found by reading the log or `date` and was corrected in chat. The table above is from the logs.
- **A flag I had not read started a mutation shard in my working tree.** To count the ids of a shard I ran `node scripts/mutation-check.mjs --shard 1/8 --list`. `--list` is not a flag of that script (`--list-ids` is, and the usage block at its head says so); an unknown flag did not stop it, so it began running the 198 mutations of shard 1 against the working tree, with my workflow edit uncommitted in it. I noticed within a minute, from the line `Mutation testing 198 invariant(s)`, and sent SIGTERM. The harness handles SIGTERM, but its handler cannot run while a synchronous child is running, and the child was a proof compile that took about a minute and a half to return; during that time `src/Scoreboard.fs` was modified by the child's injection. When the child returned the handler ran, the process ended, and `src/` was clean. Read afterwards: the tree held one modified file, the workflow, byte-identical to the patch saved before (`cmp`), `node scripts/mutation-check.mjs --stranded` said `0 hold a marker; 0 name a build driver a dead run left running`, and `.mutation-state` was gone. Nothing was committed in that window and no file of the work was lost. The count I wanted came from `--list-ids`, read-only: 1582 ids, 1582 distinct, 77 of them `egress-path-*`, which is also what the eight shards of the scored gate passed.
- **Measuring apparatus, four defects found before anything relied on it.** The sweep's scanner hung on a template-literal state that was never popped (validated afterwards against naive operator counts: logic 20 of 20, eq 44 of 44, bool 18 of 18). A generator for the evidence file left two template placeholders escaped, so they would have printed literally. One sentence in the evidence file said no other line of a body changed, and three had. And the first version of the assertion's self-check counted breaks, not conditions: three conditions had no break aimed at them, and some breaks removed more than they aimed at. The version in Appendix B names a target for each break, prints stray reds beside it, and prints `conditions turned red by at least one break: 14 of 14`. The fourth is the Commit-step harness (Appendix C): its first run cloned from a deleted working directory, so five cases ran on a tree with an empty index and failed on that; it printed 8 failures that were the harness's. It now starts every case from a stable directory, checks its own starting state (clean, full checkout, the step's two dependencies present) and refuses to run on a bad one.
- **A premise of mine, refuted before the build.** When the owner said "TLS" I read "a public resolver's address" as a way to see the host's other address from a west runner. Tested on 8 runners, it showed the other address on 1 of the 5 whose system resolver gave the west one (the CC-CMD's premise table). The design therefore asks the public resolver twice more, with a client subnet for each coast. It cost one scope refinement, stated in the CC-CMD, and no answer from the owner.

## Not established

These are not findings; each is a premise with the command that would test it.

- **That the west reds are this stall.** The premise runs and the two branch probes are not reds. The first weather red after this lands is the test: read the `tls=` entry of its `egress-path:` line. If the address the system resolver gave reads `no-tls-in-3000ms` and the other reads `ok`, that supports it; if both complete, or both fail, it refutes it. Command: `gh run list --workflow live-check.yml --limit 30`, then `gh run view <id> --log | grep -o 'tls=.*'` on the failing ones.
- **Why the west address advertises a TCP window of 0, whether anything left the runner after the 90 printed capture lines, and what a Chromium on the same runner does.** Unchanged from the premise file.
- **That the two subnets remain good vantages.** `20.80.173.0/24` and `68.220.172.0/24` were taken from two committed artifacts of this evening. The zone may steer differently later. The subnet is printed in each value, so a stale label is visible, and deleting `VANTAGES` removes both views and leaves the literal reading.
- **Anything about the page's own window.** The line describes Node's stack at a later moment, as before, and the two readings above are two runs.
- **Whether west-coast users' browsers meet the same stall.** Untested. It is not a property of this gate's runner.

## Residual

- The remote branches `tls-premise`, `tls-stage` (merged), `egress-diagnostics` and `egress-region-fix` remain. This session's proxy refused ref deletion earlier (403) and again at 23:25 ET, when `tls-stage` was tried once (`gh api -X DELETE repos/jeffunglesbee-create/field-laboratory/git/refs/heads/tls-stage`): `Write access to this GitHub API path is not permitted through this proxy.` `tls-stage` (tip `5f4b000b101fe04967fa8fc68da7945b8f3c87a0`) has 0 commits that are not on `main`, so deleting it from the web loses nothing. `tls-premise` (tip `beb318918637fdcb8d9a09ce65100135629cbf0c`) has 4 commits that are not on `main` (`493d8d88`, `0fca629f`, `33a21783`, `beb31891`: the four versions of `.github/workflows/probe-url.yml` that the premise runs were made from), and `outbox/tls-stage-premise-2026-11-14.txt` (lines 4 and 1460) names that branch as the source of the probes. Deleting it removes the only copy of those scripts, so it stays until the owner says. `egress-diagnostics` and `egress-region-fix` belong to earlier sessions and were not touched.
- **Follow-up, scheduled, not a carry-forward.** Scheduled task `trig_01P3CmptrPTdomzfyKBwv7JV` ("TLS stage: read the first weather red") fires once at 2026-11-16T13:00:00Z (Monday 08:00 ET), in this session. It lists the `live-check` runs whose head descends from `a25df340`, takes M as the number that concluded `failure`, reads each failing job's log, and classifies each red: SUPPORTS (the system resolver's address reads `no-tls-in-3000ms` and the other reads `ok`), REFUTES (both complete or both fail) or UNREADABLE (no `tls=` text, or the red is the brief step alone). It prints `checked N of M reds`, writes `outbox/tls-first-red-<date>.md` and commits it to `main`. With no red it re-arms once for 24 hours and then stops.
- **Adjacent, found while waiting, left alone (Rule 69).** The `live-check` step "A finished game shows the brief written after it finished" failed in every run that reached it from 2026-11-14 23:06Z on, 6 of 6 (43651541854, 43658647710, 43669286520, 43671813126, 43673414837 and 43676533656, the one after this landing's `deploy`), and passed in all 7 earlier runs that reached it. The first red ran on `2bb25935`, before any commit of this session reached `main`, and the landing's diffstat has no path under `src/` or equal to `scripts/render-check.mjs`. It is the class `brief-game_live-on-final` of `outbox/live-check-weather-silent-2026-11-14.md` (23 runs between 2026-10-10, a Saturday, and 2026-11-08, a Sunday; "not examined here: which brief the relay served for those games and why"). No CC-CMD names it: 0 of 70 `docs/CC-CMD-*.md` match the check's file name, its verdict function, its step name or the class (grep, 2026-11-14). In the logs of 43669286520 and 43676533656, 3 of 42 testable rows are red, the same three (`Alabama @ Vanderbilt`, `Michigan @ Oregon`, `California @ Virginia`; the check prints at most 5, so these are all of them). For each, the payload carries both a `game_live` and a `game_recap` brief, and the row's own first matching card reads `status="Final" kind="game_recap"`. The verdict (`verdictForCards`) fails a row when ANY card in its `matching` set shows a during-play kind, and `matching` is `cards.filter(c => c.teams.includes(g.away) || c.teams.includes(g.home))`, a substring test on either team. Both logs also show `Troy @ South Alabama` and `Stanford @ Virginia Tech` (both "Start time passed, no score served"), `Washington @ Michigan St`, `Oregon St @ Boise St` and `Kansas @ West Virginia`, each sharing a word with a red row. That is consistent with a collision of names, and it is not shown: the log prints no kind for those other cards. The test is one change to the check's evidence block, printing `matching.map(c => [c.teams, c.status, c.kind])` for a failing row, on a runner. Not filed: the owner's word was "TLS". One word, "brief", files it and builds the test.
- **Adjacent, from the guard miss (Rule 69).** No local check runs `scripts/check-browser-gate.py`: `.githooks/pre-commit` has no mention of it, `scripts/gate-checks.mjs` has none, and `verify.yml` runs on push to `main` only (plus `pull_request` and `workflow_dispatch`). A workflow edit that turns it red is found by `verify` after landing unless someone dispatches `verify` on the branch first. It runs in 1.1 s (2.5 s with its self-test) on this machine. Not changed: the hook's own header says what belongs in it ("a pre-commit that ran all of it is one nobody keeps enabled"), the guard's origin CC-CMD (`docs/CC-CMD-2026-11-11-runner-apt-mirror-dns.md`, PARTIAL) does not mention the hook, and I did not find a ruling there on where the guard runs, and the owner's word was "TLS". The change is one line in the hook, run when a workflow file is staged; the owner's call, one word: "hook".
- **Adjacent, from the sweep (Rule 69).** Four pre-existing lines survive their operator changes: the real shape's `ok: r => r.status === 200 || r.facts.stage !== 'unclassified'` (line 504; `r.status` is never set, the status is under `r.got`, so the first disjunct is dead and the predicate passes whenever `probeFacts(null).stage` is not `unclassified`, which means an HTTP 500 from the real host would pass; the `real` section's "as expected" is therefore weak on the status, and the new address clause is what makes it mean something), the `&&` of the `nxdomain` and `refused` shapes (lines 507 and 513: no input in the self-test separates their two clauses) and the `observed:` line of the live artifact (line 529: no check reads it).
- **Not covered by a mutation, said here so that a green list does not read as complete:** the default values of `runLive`'s parameters (`liveIO`, `console.log`) and `realDeps`, which the self-test replaces on purpose (the evidence file, section 3).
- `probe-url.yml` pastes `${{ github.event.inputs.urls }}` into a shell script. Only users who can dispatch workflows can set it. It is recorded in the CC-CMD and not changed.
- Reporting the west address's behaviour to Open-Meteo is the owner's call.

## Appendix A: the artifact assertion

Kept here so it can be run from this repository alone; it is not in `scripts/`, because a one-off check there would be a source change with a gated landing. Saved as `assert-tls-artifacts.mjs` and run from the repository root: `node assert-tls-artifacts.mjs <live artifact> <e2e artifact>`.

```js
// docs/CC-CMD-2026-11-14-weather-failure-tls-stage.md, done conditions 3, 4 and 5, as one command (Rule 89: the artifact that proves it, and a check that has failed on purpose).
//   node assert-tls-artifacts.mjs <outbox/egress-path-live-STAMP.txt> <outbox/egress-path-e2e-STAMP.txt>
// Prints every condition as PASS or FAIL with what it read, then `checked N of N conditions`, and exits 1 if any failed.
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const sectionOf = (lines, id) => {
  const start = lines.findIndex(l => l.startsWith(`## ${id}:`))
  if (start < 0) return []
  const end = lines.findIndex((l, i) => i > start && (l.startsWith('## ') || l.startsWith('VERDICT:')))
  return lines.slice(start, end < 0 ? lines.length : end)
}
const valueOf = (desc, key) => (new RegExp(`(?:^|[ |])${key}=([^|]*?)(?: \\| |$)`).exec(desc) ?? [])[1]
const firstV4 = v => (/ ok (\d+\.\d+\.\d+\.\d+)/.exec(v ?? '') ?? [])[1]
const NAMED_FAILURE = /^doh 8\.8\.8\.8( ecs \S+)? (HTTP-\d+|not-JSON|no-Status|NXDOMAIN|SERVFAIL|REFUSED|rcode-\d+|no-answer-in-\d+ms|[A-Z][A-Z0-9_]+) \d+ms$/

export const assertArtifacts = (liveText, e2eText) => {
  const results = []
  const cond = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail: String(detail ?? '').slice(0, 300) })
  const live = String(liveText).trimEnd().split('\n')
  const e2e = String(e2eText).trimEnd().split('\n')
  cond('live: the first line is the coverage, "checked 4 of 4 shapes"', /^checked 4 of 4 shapes; /.test(live[0]), live[0])
  cond('live: the last line is "VERDICT: pass, 4 of 4 shapes as expected"', live[live.length - 1] === 'VERDICT: pass, 4 of 4 shapes as expected', live[live.length - 1])
  const real = sectionOf(live, 'real')
  const desc = real.map(l => l.trim()).find(l => l.startsWith('egress-path:')) ?? ''
  cond('live/real: a description line is there', desc !== '', real.length ? `${real.length} lines in the section` : 'no "## real:" section')
  const n = /addresses: (\d+) found, (\d+) with a settled TLS verdict(?: \((\d+) probed\))?/.exec(real.join('\n'))
  cond('live/real: "addresses: N found, N with a settled TLS verdict", N >= 1, every probed address settled', n && +n[1] >= 1 && +n[2] === (n[3] ? +n[3] : +n[1]), n ? n[0] : 'no addresses line')
  const tls = valueOf(desc, 'tls') ?? ''
  const entries = tls.split(' ; ').filter(e => /:443 /.test(e) && / from /.test(e))
  cond('live/real: tls= carries one entry per settled address, each with a verdict and its sources', n && entries.length === +n[2] && entries.every(e => !/unreadable/.test(e)), `${entries.length} entries: ${tls.slice(0, 200)}`)
  const views = { public: valueOf(desc, 'public-v4'), west: valueOf(desc, 'view-west-v4'), east: valueOf(desc, 'view-east-v4') }
  for (const [k, v] of Object.entries(views)) cond(`live/real: ${k} view shows an address or a named failure`, v && (firstV4(v) || NAMED_FAILURE.test(v)) && !/not finished/.test(v), v ?? 'key missing')
  const w = firstV4(views.west)
  const e = firstV4(views.east)
  cond('live/real: when both subnet views answered they show DIFFERENT addresses (a property of the zone; if it does not hold this stays open)', !(w && e) || w !== e, `west ${w ?? 'no address'}, east ${e ?? 'no address'}`)
  cond('live/real: the key list is whole and the runner line is intact', /\| runner=image \S+ region \S+ cloud \S+$/.test(desc), desc.slice(-120))
  cond('e2e: the first line is the coverage, "checked 1 of 1 end-to-end run"', /^checked 1 of 1 end-to-end run; /.test(e2e[0]), e2e[0])
  cond('e2e: VERDICT: observed', /^VERDICT: observed — /.test(e2e[e2e.length - 1]), e2e[e2e.length - 1])
  const line = e2e.find(l => l.includes('egress-path:')) ?? ''
  const tlsE = valueOf(line.slice(line.indexOf('egress-path:')), 'tls') ?? ''
  cond('e2e: the failing text carries tls= with the fault address and its verdict', /192\.0\.2\.1:443 \S+ \(tcp not completed\) from system/.test(tlsE), tlsE.slice(0, 200))
  cond('e2e: the runner line is intact, to the sentence that follows the description', /runner=image \S+ region \S+ cloud \S+ \(Node's own network stack/.test(line), line.slice(-160))
  return results
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [liveFile, e2eFile] = process.argv.slice(2)
  if (!liveFile || !e2eFile) { console.error('usage: node assert-tls-artifacts.mjs <live artifact> <e2e artifact>'); process.exit(2) }
  const results = assertArtifacts(fs.readFileSync(liveFile, 'utf8'), fs.readFileSync(e2eFile, 'utf8'))
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `\n      → ${r.detail}`}`)
  const failed = results.filter(r => !r.ok).length
  console.log(`\nchecked ${results.length} of ${results.length} conditions; ${failed} failed`)
  process.exit(failed ? 1 : 0)
}
```

## Appendix B: the assertion's self-check

Saved beside Appendix A as `assert-selfcheck.mjs`, with the library's path changed to the repository's own (`./scripts/egress-path-lib.mjs`) when run from the repository root. Its output is the block under "Verified end to end".

```js
// The assertion has to fail on purpose before its pass on the runner means anything (Rule 90): synthetic artifacts made by the library itself (injected dependencies shaped like the runner's), then one break per condition.
// Each break names the condition it is aimed at. A break that does not turn THAT condition red is a miss; a break that turns others red as well is printed as `stray`, so a dirty break cannot pass for a clean one.
//   node assert-selfcheck.mjs      (needs assert-tls-artifacts.mjs beside it, and the laboratory at /home/claude/field-laboratory)
import { describeEgressFacts, addressesLine } from '/home/claude/field-laboratory/scripts/egress-path-lib.mjs'
import { assertArtifacts } from './assert-tls-artifacts.mjs'
const WEST = '51.81.167.44', EAST = '167.114.211.86'
const doh = a => ({ status: 200, text: JSON.stringify({ Status: 0, Answer: [{ name: 'x.', type: 1, TTL: 1, data: a }] }) })
const deps = (sys, tlsFn) => ({
  now: () => Date.now(),
  lookup: async (_h, { family }) => { if (family === 6) { const e = new Error('x'); e.code = 'ENOTFOUND'; throw e } return sys.map(a => ({ address: a, family: 4 })) },
  connect: async () => ({ ok: true, ms: 70 }),
  fetchText: async url => url.includes('8.8.8.8') ? (url.includes('20.80') ? doh(WEST) : url.includes('68.220') ? doh(EAST) : doh(WEST)) : { status: 200, text: 'ip=20.1.2.3\n' },
  tlsConnect: async a => tlsFn(a),
  nodeFacts: () => ({ version: 'v22.23.4', autoSelectFamily: true, attemptTimeoutMs: 250, resultOrder: 'verbatim', resolvers: ['127.0.0.53'] }),
  ancestry: () => [{ pid: 1, args: '/home/runner/runners/2.338.2/bin/Runner.Worker spawnclient 1 2' }],
  readFile: () => JSON.stringify([{ Group: 'x', Detail: 'Region: westus2\nCloud: Azure' }]),
})
const err = new TypeError('fetch failed', { cause: Object.assign(new Error('Connect Timeout Error (attempted address: api.open-meteo.com:443, timeout: 10000ms)'), { name: 'ConnectTimeoutError', code: 'UND_ERR_CONNECT_TIMEOUT' }) })
const env = { ImageOS: 'ubuntu26', ImageVersion: '20261111.196.1' }
const stall = a => (a.host === WEST ? { ok: false, code: 'no-tls-in-3000ms', tcpMs: 70 } : a.host === '192.0.2.1' ? { ok: false, code: 'no-connect-in-3000ms' } : { ok: true, tcpMs: 31, tlsMs: 72 })
const real = await describeEgressFacts({ host: 'api.open-meteo.com', error: null, env, deps: deps([WEST], stall) })
const fault = await describeEgressFacts({ host: 'api.open-meteo.com', error: err, env, deps: deps(['192.0.2.1'], stall) })
const liveText = ['checked 4 of 4 shapes; node v22.23.4; 2026-11-15T03:00:00.000Z', '', '## real: as expected (900ms)', '   expected: x', '   observed: HTTP 200', '   expected addresses: x', `   ${addressesLine(real.addresses)}`, `   ${real.line}`, '', '## nxdomain: as expected (50ms)', '', 'VERDICT: pass, 4 of 4 shapes as expected'].join('\n')
const e2eText = ['checked 1 of 1 end-to-end run; render-check exit 1; node v22.23.4; 2026-11-15T03:00:00.000Z', 'fault: api.open-meteo.com resolves to 192.0.2.1', '', 'FAIL  every card whose venue the table knows carries a live chip', `      → 56 known venue(s) on this slate, 0 chip(s) filled. A late node probe saw: unreachable — fetch failed. ${fault.line} (Node's own network stack at that later moment, not Chromium's). The page reported: nothing`, '', 'VERDICT: observed — the chip check\'s FAIL carries egress-path:, a probe-error with a cause, dns-v4= and tls='].join('\n')

// Remove ` | key=value` and nothing else: up to, not including, the next ` | ` (or the end of the value). Keeps every other key's boundary intact, so a break aimed at one key cannot break its neighbour's.
const dropKey = (text, key) => text.replace(new RegExp(` \\| ${key}=.*?(?= \\| | \\(Node's own|$)`, 'm'), '')

const base = assertArtifacts(liveText, e2eText)
console.log(`well-formed synthetic artifacts: ${base.filter(r => r.ok).length} of ${base.length} conditions pass`)
for (const r of base.filter(r => !r.ok)) console.log(`  FAIL ${r.name} -> ${r.detail}`)

// [what is broken, how, a substring of the ONE condition it is aimed at]
const breaks = [
  ['live: coverage line replaced', () => [liveText.replace('checked 4 of 4 shapes', 'checked 3 of 4 shapes'), e2eText], 'live: the first line is the coverage'],
  ['live: verdict not pass', () => [liveText.replace('VERDICT: pass, 4 of 4', 'VERDICT: FAIL, 1 of 4'), e2eText], 'live: the last line is'],
  ['live: the real section has no description line', () => [liveText.replace(/ {3}egress-path: .*\n/, ''), e2eText], 'a description line is there'],
  ['live: no addresses line', () => [liveText.replace(/ {3}addresses: .*\n/, ''), e2eText], '"addresses: N found'],
  ['live: zero addresses found', () => [liveText.replace(/addresses: \d+ found, \d+ with/, 'addresses: 0 found, 0 with'), e2eText], '"addresses: N found'],
  ['live: settled fewer than found', () => [liveText.replace(/addresses: 2 found, 2 with/, 'addresses: 2 found, 1 with'), e2eText], '"addresses: N found'],
  ['live: tls= stripped', () => [dropKey(liveText, 'tls'), e2eText], 'tls= carries one entry'],
  ['live: public view unfinished', () => [liveText.replace(/public-v4=[^|]*/, 'public-v4=unreadable (not finished in 8000ms) '), e2eText], 'public view'],
  ['live: west view missing', () => [dropKey(liveText, 'view-west-v4'), e2eText], 'west view'],
  ['live: east view missing', () => [dropKey(liveText, 'view-east-v4'), e2eText], 'east view'],
  ['live: both views the same address', () => [liveText.replace(/view-east-v4=doh 8\.8\.8\.8 ecs 68\.220\.172\.0\/24 ok 167\.114\.211\.86/, 'view-east-v4=doh 8.8.8.8 ecs 68.220.172.0/24 ok 51.81.167.44'), e2eText], 'DIFFERENT addresses'],
  ['live: runner line clipped', () => [liveText.replace(/ \| runner=.*$/m, ' | runne'), e2eText], 'the key list is whole'],
  ['e2e: coverage line replaced', () => [liveText, e2eText.replace('checked 1 of 1 end-to-end run', 'checked 0 of 1 end-to-end run')], 'e2e: the first line is the coverage'],
  ['e2e: verdict incomplete', () => [liveText, e2eText.replace('VERDICT: observed', 'VERDICT: incomplete')], 'e2e: VERDICT: observed'],
  ['e2e: tls= stripped', () => [liveText, dropKey(e2eText, 'tls')], 'e2e: the failing text carries tls='],
  ['e2e: fault address verdict unreadable', () => [liveText, e2eText.replace('192.0.2.1:443 no-connect-in-3000ms (tcp not completed) from system', '192.0.2.1:443 unreadable (TypeError) from system')], 'e2e: the failing text carries tls='],
  ['e2e: description clipped before runner', () => [liveText, e2eText.replace(/ \| runner=image.*?\(Node's own network stack/, '…')], 'e2e: the runner line is intact'],
]
let onTarget = 0, stray = 0
const everRed = new Set()
for (const [name, make, target] of breaks) {
  const [l, e] = make()
  const failed = assertArtifacts(l, e).filter(x => !x.ok)
  failed.forEach(x => everRed.add(x.name))
  const hit = failed.some(x => x.name.includes(target))
  const others = failed.filter(x => !x.name.includes(target)).length
  if (hit) onTarget++
  if (hit && others) stray++
  console.log(`${hit ? 'RED ' : 'NOT CAUGHT'} ${name}: aimed at "${target}"; ${failed.length} failing${others ? `, ${others} stray` : ''}`)
}
console.log(`breaks that turned their target condition red: ${onTarget} of ${breaks.length}; with stray reds beside it: ${stray}`)
const neverRed = base.filter(r => !everRed.has(r.name))
console.log(`conditions turned red by at least one break: ${base.length - neverRed.length} of ${base.length}`)
for (const r of neverRed) console.log(`  NEVER RED: ${r.name}`)
console.log(`the well-formed pair passes ${base.every(r => r.ok) ? 'all' : 'NOT all'} of its ${base.length} conditions`)
process.exit(onTarget === breaks.length && neverRed.length === 0 && base.every(r => r.ok) ? 0 : 1)
```

## Appendix C: the Commit step's simulation

```bash
#!/usr/bin/env bash
# The Commit step of open-meteo-egress-probe.yml, run on its own: its script is read out of the workflow file and run under `bash -e` (the runner's default shell, no pipefail)
# against a local bare repository standing in for origin, once per case. What is read is where origin's main ends up.
#   bash sim-commit-step.sh [workflow-file]
# Case D is the one that has to fail on purpose (Rule 90): the same script with its ref check removed must push a branch's own commit to main. If it does not, the
# simulation cannot see the hazard the check exists for, and cases A and C passing would say nothing.
set -uo pipefail
S=/tmp/claude-0/-home-claude/17dcf9de-532b-5e13-b576-6123f7d6b834/scratchpad
LAB=/home/claude/field-laboratory
WF="${1:-$LAB/.github/workflows/open-meteo-egress-probe.yml}"
SIM=$S/sim-commit-step
rm -rf "$SIM"; mkdir -p "$SIM"

python3 - "$WF" "$SIM/step.sh" "$SIM/step-no-ref-check.sh" <<'PY'
import re, sys, yaml
doc = yaml.safe_load(open(sys.argv[1]))
steps = [s for s in doc['jobs']['probe']['steps'] if s.get('name') == 'Commit the reading']
assert len(steps) == 1, f'{len(steps)} steps are named "Commit the reading"'
run = steps[0]['run']
open(sys.argv[2], 'w').write(run)
print('step condition read from the file:', repr(steps[0].get('if')))
pat = re.compile(r'if \[ "\$GITHUB_REF" != "refs/heads/main" \]; then\n.*?\n\s*exit 0\n\s*fi\n', re.S)
found = pat.findall(run)
assert len(found) == 1, f'the ref check was found {len(found)} times, not once: the mutant would be a copy of the original or a different change'
mutant = pat.sub('', run)
assert mutant != run and 'refs/heads/main' not in mutant, 'the mutant still holds the comparison'
open(sys.argv[3], 'w').write(mutant)
print('mutant: the ref check removed (1 block, %d lines)' % found[0].count('\n'))
PY
[ $? -eq 0 ] || { echo "FAIL: could not read the step out of $WF"; exit 2; }

pass=0; fail=0; cases=0
ok()   { pass=$((pass+1)); echo "    ok    $1"; }
bad()  { fail=$((fail+1)); echo "    FAIL  $1"; }
check() { if eval "$2"; then ok "$1"; else bad "$1"; fi; }

# A fresh clone of the laboratory at its current head; origin is a local bare repo whose main is that head. With $1 = branch, the work side then gets one commit origin
# does not have (it stands for the branch's own code commits). Either way a new reading is left in outbox/ for the step to find, unless $2 = none.
seed() {
  # Not from inside the directory about to be deleted: a clone started from a deleted cwd left an index with no entries (every file read as a staged deletion), and
  # the first run of this harness failed on that, not on the step.
  cd "$SIM" || exit 2
  rm -rf "$SIM/origin.git" "$SIM/work"
  git init -q --bare "$SIM/origin.git"
  git clone -q "$LAB" "$SIM/work" || { echo "SEED FAILED: the clone"; exit 2; }
  cd "$SIM/work" || exit 2
  # the apparatus checks its own starting state: a full tree, nothing staged, the step's two dependencies present
  [ "$(git status --short | wc -l)" -eq 0 ] && [ -f scripts/staged-outbox-check.mjs ] && [ -d outbox ] || { echo "SEED FAILED: the clone is not a clean full checkout ($(git status --short | wc -l) status lines)"; exit 2; }
  git remote set-url origin "$SIM/origin.git"
  git push -q origin HEAD:refs/heads/main 2>/dev/null || { echo "SEED FAILED: seeding origin's main"; exit 2; }
  SEED=$(git rev-parse HEAD)
  if [ "$1" = branch ]; then
    echo "branch-only change" > branch-only.txt
    git add branch-only.txt
    git -c user.name=branch -c user.email=branch@example.invalid commit -q -m "branch-only commit (stands for the branch's code commits)"
    BRANCH_SHA=$(git rev-parse HEAD)
    [ "$(git show --name-only --format= "$BRANCH_SHA")" = "branch-only.txt" ] || { echo "SEED FAILED: the branch-only commit is not just branch-only.txt"; exit 2; }
  fi
  [ "${2:-}" = none ] || { mkdir -p outbox; echo "a reading $(date -u +%s%N)" > outbox/egress-path-sim-reading.txt; }
}
origin_main() { git -C "$SIM/origin.git" rev-parse main; }

run_step() {  # $1 = script, $2 = ref value or UNSET
  cd "$SIM/work" || exit 2
  if [ "$2" = UNSET ]; then env -u GITHUB_REF bash -e "$1" > "$SIM/out.txt" 2>&1; else GITHUB_REF="$2" bash -e "$1" > "$SIM/out.txt" 2>&1; fi
  RC=$?
  sed 's/^/      | /' "$SIM/out.txt" | cut -c1-220
}

cases=$((cases+1)); echo "A. ref is a branch (refs/heads/tls-stage), the script as committed; the work side holds a commit origin does not"
seed branch; run_step "$SIM/step.sh" refs/heads/tls-stage
check "the scratch clone has no hooks path, so no hook of the laboratory ran" '[ -z "$(git -C "$SIM/work" config core.hooksPath)" ]'
check "exit status 0" '[ $RC -eq 0 ]'
check "it prints the ref it saw" 'grep -qx "      | ref: refs/heads/tls-stage" <(sed "s/^/      | /" "$SIM/out.txt")'
check "it says why it did nothing" 'grep -q "^not refs/heads/main: nothing is committed or pushed" "$SIM/out.txt"'
check "origin main is unchanged" '[ "$(origin_main)" = "$SEED" ]'
check "no commit was made on the work side (HEAD is still the branch-only commit)" '[ "$(git -C "$SIM/work" rev-parse HEAD)" = "$BRANCH_SHA" ]'
check "nothing was staged" 'git -C "$SIM/work" diff --staged --quiet'

cases=$((cases+1)); echo "B. ref is main, the script as committed; the work side is main with a new reading"
seed main; run_step "$SIM/step.sh" refs/heads/main
check "exit status 0" '[ $RC -eq 0 ]'
check "it prints the ref it saw" 'grep -qx "ref: refs/heads/main" "$SIM/out.txt"'
check "origin main moved by exactly one commit" '[ "$(git -C "$SIM/origin.git" rev-list --count "$SEED..main")" = 1 ]'
check "that commit carries the reading and only the reading" '[ "$(git -C "$SIM/origin.git" show --name-only --format= main)" = "outbox/egress-path-sim-reading.txt" ]'
check "its subject is the step's own record message" '[ "$(git -C "$SIM/origin.git" log -1 --format=%s main)" = "probe: open-meteo egress from node vs the browser [skip ci]" ]'

cases=$((cases+1)); echo "C. GITHUB_REF is not set at all, the script as committed (a missing variable must not push)"
seed branch; run_step "$SIM/step.sh" UNSET
check "exit status 0" '[ $RC -eq 0 ]'
check "it names the ref as unset" 'grep -qx "ref: unset" "$SIM/out.txt"'
check "it says why it did nothing" 'grep -q "^not refs/heads/main: nothing is committed or pushed" "$SIM/out.txt"'
check "origin main is unchanged" '[ "$(origin_main)" = "$SEED" ]'

cases=$((cases+1)); echo "D. MUTANT: ref is a branch, the ref check removed from the script; the work side holds a commit origin does not"
seed branch; run_step "$SIM/step-no-ref-check.sh" refs/heads/tls-stage
check "the hazard shows: origin main moved" '[ "$(origin_main)" != "$SEED" ]'
check "the hazard shows: the branch-only commit is now on main" 'git -C "$SIM/origin.git" merge-base --is-ancestor "$BRANCH_SHA" main'

cases=$((cases+1)); echo "E. ref is main and there is nothing to commit (the step's own earlier path)"
seed main none; run_step "$SIM/step.sh" refs/heads/main
check "exit status 0" '[ $RC -eq 0 ]'
check "it says nothing to commit" 'grep -q "nothing to commit" "$SIM/out.txt"'
check "origin main is unchanged" '[ "$(origin_main)" = "$SEED" ]'

echo
echo "checked $cases of 5 cases; $pass checks passed, $fail failed"
[ "$fail" -eq 0 ] && [ "$cases" -eq 5 ] && { echo "VERDICT: pass"; exit 0; }
echo "VERDICT: FAIL"; exit 1
```
