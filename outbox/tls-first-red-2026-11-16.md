checked 1 of 3 reds
SUPPORTS 1, REFUTES 0, UNREADABLE 2 (neither of the two is a weather red)

# TLS stage: the first weather red after the landing, read 2026-11-16

Source: scheduled task `trig_01P3CmptrPTdomzfyKBwv7JV` (set 2026-11-14 for 2026-11-16 08:00 ET), from `docs/CC-CMD-2026-11-14-weather-failure-tls-stage.md`, "What this does not establish", first bullet: the first weather red after `a25df340` is the test of the premise that the west reds were a TLS stall to the WEST address. Listing and logs read 2026-11-16 13:04Z to 13:05Z (08:04 to 08:05 ET).

## Answer

One of the three reds since the landing is a weather red: `live-check` 43862583632 (event `schedule`, `main` at `4225895d`, created 2026-11-16 11:59:49Z, Azure westus2). Its failure text shows the system resolver's address, WEST `51.81.167.44`, completing TCP in 11 ms and no TLS handshake in 3000 ms, and EAST `167.114.211.86` completing a handshake in 135 ms (EAST was named by the east-subnet DNS view only; the system, public and west views all gave WEST). That is the pair the premise names, so the class is SUPPORTS. It is one run: a fit with the premise, not a test of it.

The other two reds are not weather reds and are not counted. 43676533656 failed at the brief-phase step "A finished game shows the brief written after it finished" with all four chip checks passing (log lines 603 to 606). 43712367007 failed at "The deploy landed (published is the newest deployable commit)" with `published 58def9f is behind the newest deployable commit 8f9ba58`, so the render step was skipped and no weather check ran.

## Coverage

- Listing: `gh run list --workflow live-check.yml --limit 80`, 80 runs, 2026-11-08T18:53:08Z to 2026-11-16T11:59:49Z. The landing push (`a25df340`, 2026-11-15 04:11:43Z) is inside that span: 65 runs are older than it, 15 are at or after it.
- Descendants of `a25df340` (`git merge-base --is-ancestor`, equal or descendant): 15 of 80. Runs created at or after the push that are not descendants: 0. Runs created before the push that are descendants: 0.
- Those 15 concluded 11 `success`, 3 `failure`, 1 `skipped`. M = 3.
- Job logs read: 3 of 3 failures. The 11 successes and the skipped run were not opened: `live-check.yml` (line 177) runs `scripts/render-check.mjs` without `--tolerate-unreachable`, which only `verify.yml` passes (`scripts/render-check.mjs` lines 24 to 28), so a weather-chip failure in this workflow fails its step and the job (43862583632 is one), which is why the successes were not opened.
- Classifier: the three reds were classed by a script that reads each job log (failing step, chip checks, `dns-v4=`, `tls=`). It was run against 6 mutants of the readable log (system address completes, other address stalls too, the pair reversed, no `tls=` key, neither chip check failing, text clipped inside `tls=`) and each changed the class: `mutations: checked 6 of 6, caught 6`. One mutant (the fifth) was first written to neutralize only one of the two chip-check lines, left the other failing, and was not caught; the classifier was right and the mutant was wrong, and it now neutralizes both. The script is in the session scratchpad and is not committed; the commands under Reproduce read the same fields by hand.

## The three reds, oldest first

| run | created (UTC) | event / head | region, cloud | failed step | dns-v4 | tls= (verbatim) | class |
|---|---|---|---|---|---|---|---|
| 43676533656 | 2026-11-15T04:23:11Z | workflow_run / f30d2b99 | us-east-1, AWS | A finished game shows the brief written after it finished | none (no `egress-path:` text in the log) | none | UNREADABLE: not a weather red (brief-phase step; the four chip checks pass) |
| 43712367007 | 2026-11-15T12:09:04Z | workflow_run / 8f9ba58e | westus, Azure | The deploy landed (published is the newest deployable commit) | none (no `egress-path:` text in the log) | none | UNREADABLE: not a weather red (the render step was skipped, so no weather check ran) |
| 43862583632 | 2026-11-16T11:59:49Z | schedule / 4225895d | westus2, Azure | Render the deployed page and assert on it | `dns-v4=ok 51.81.167.44 2ms` | `51.81.167.44:443 no-tls-in-3000ms (tcp 11ms) from system,public,west ; 167.114.211.86:443 ok (tcp 67ms, handshake 135ms) from east` | SUPPORTS |

## The readable red, verbatim

Run 43862583632, job 133282924627, line 440 of the job log (the `##[error]` line 448 carries the same text). The `egress-path:` text starts at `egress-path: probe-error=`.

```
1 known venue(s) on this slate, 0 chip(s) filled. Attribution from the page's own window: host-silent — 2 request(s) over 13999ms, none received any response (the slate's budget is 14000ms, each request's cap 8000ms). A late node probe saw: unreachable — fetch failed (a later moment, not evidence about the page's window). egress-path: probe-error=TypeError "fetch failed" < ConnectTimeoutError UND_ERR_CONNECT_TIMEOUT "Connect Timeout Error (attempted address: api.open-meteo.com:443, timeout: 10000ms)" | cause=UND_ERR_CONNECT_TIMEOUT stage=connect-budget | node=v22.23.4 autoSelectFamily=true attemptTimeout=250ms resultOrder=verbatim resolvers=127.0.0.100,127.0.0.53,168.63.129.16 | dns-v4=ok 51.81.167.44 2ms | dns-v6=ENOTFOUND 36ms | public-v4=doh 8.8.8.8 ok 51.81.167.44 51ms | view-west-v4=doh 8.8.8.8 ecs 20.80.173.0/24 ok 51.81.167.44 65ms | view-east-v4=doh 8.8.8.8 ecs 68.220.172.0/24 ok 167.114.211.86 48ms | connect-v4=51.81.167.44:443 ok 11ms | connect-v6=not attempted (no v6 address: ENOTFOUND) | tls=51.81.167.44:443 no-tls-in-3000ms (tcp 11ms) from system,public,west ; 167.114.211.86:443 ok (tcp 67ms, handshake 135ms) from east | egress-v4=4.155.244.132 | egress-v6=unreadable (ENETUNREACH) | runner=image ubuntu26@20261111.196.1 region westus2 cloud Azure (Node's own network stack at that later moment, not Chromium's). The page reported: Weather is unavailable: all 1 venue requests failed. | Reported: M&T Bank Stadium: signal timed out after 8000ms. Request timings (start+duration): 949+8001ms 8949+5999ms. Page built from: 231dde7
```

The key fields, copied from the line above (`runner=` is cut before its parenthetical):

```
dns-v4=ok 51.81.167.44 2ms
public-v4=doh 8.8.8.8 ok 51.81.167.44 51ms
view-west-v4=doh 8.8.8.8 ecs 20.80.173.0/24 ok 51.81.167.44 65ms
view-east-v4=doh 8.8.8.8 ecs 68.220.172.0/24 ok 167.114.211.86 48ms
tls=51.81.167.44:443 no-tls-in-3000ms (tcp 11ms) from system,public,west ; 167.114.211.86:443 ok (tcp 67ms, handshake 135ms) from east
runner=image ubuntu26@20261111.196.1 region westus2 cloud Azure
```

## What this does not establish

1. One run. A single readable red fits the premise and cannot confirm it. No verdict is read into it; with one or two reds the reading is "a fit, not a test".
2. Node, at a later moment. The `tls=` entries come from Node's network stack after the page's window had closed, and the failure text says so itself ("a later moment, not evidence about the page's window"). The page's window, Chromium, read `host-silent`: 2 requests over 13999 ms, none received any response. This run does not show what Chromium sent or received in that window, or whether its requests stalled at TLS.
3. The earlier evidence was not reds. As recorded in the CC-CMD (Outcome, and What was measured), the three runs that read the stage before this were probe dispatches (43668129783 westus3, 43669295856 eastus, 43675697053 southcentralus), and the two earlier west reds (43620118846, 43631078973) predate the stage, so their text could not carry a TLS verdict. This is the first weather red with a TLS verdict, and the only one so far. These run ids are the CC-CMD's; their logs were not opened here.
4. Cause. Nothing here says why WEST would stall. The three logs contain no packet capture (0 mentions of `tcpdump`), so the SYN-ACK window of 0 on WEST that the CC-CMD records is neither supported nor contradicted by this run.
5. Region. One runner, westus2. It does not show that an east runner cannot red for the same reason, or that every west runner reds.

## Reproduce

```
gh run list --workflow live-check.yml --limit 80 --json databaseId,conclusion,createdAt,headSha,event
git merge-base --is-ancestor a25df3408a54a32a6f245c0a6983b74933b50e6c <headSha>   # exit 0 = equal or descendant
gh api repos/jeffunglesbee-create/field-laboratory/actions/runs/43862583632/jobs --jq '.jobs[] | {id, name, conclusion}'
gh api repos/jeffunglesbee-create/field-laboratory/actions/jobs/133282924627/logs | grep -aE 'Region:|Cloud:|egress-path:'
```

Expected: 15 of the 80 listed runs descend from `a25df340`; the last command prints `Region: westus2`, `Cloud: Azure` and two lines that carry `egress-path:` (the `→` line and the `##[error]` line). For the other two reds the last command prints their region and cloud and no `egress-path:` line (job 132697797108 for 43676533656, job 132806516671 for 43712367007).
