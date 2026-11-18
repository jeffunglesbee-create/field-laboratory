# Claude Code Command — the weather failure message cannot say whether the host's other address answers: no TLS stage, and one address of the several that exist

**Branch:** main — commit directly, do not create a feature branch or PR (a work branch is used only to run `verify-full`, and lands on `main` by merge with the run id in the message)
**Repo:** field-laboratory
**Filed:** 2026-11-14 by CC, on the owner's word ("TLS", Sat 2026-11-14 20:18 ET), as the named residual of `docs/CC-CMD-2026-11-14-weather-failure-cause.md`
**Confidence gate:** `npm run gate` >= 95 before any commit
**Status:** DONE 2026-11-14. Approved by the owner in one word ("TLS"). Landed on `main` as `a25df340` (merge of `tls-stage`) after a scored `verify-full`, 43670536247, at 530 of 530 (ledger id `5c2021b01b8c-faad15047249`); `verify` 43675679692, `guards` 43675679713 and `deploy` 43676444094 (on `f30d2b99`, the landing plus five outbox files) are green. All six done conditions are met, each with its artifact in the Outcome. Two things differ from the plan and are in the Outcome: the workflow guard's form (the first, `a69191d5`, turned `check:browser-gate` red; `9ec6907c` replaced it) and Task 4's local list, which now carries `check:browser-gate`. The `live-check` after the deploy, 43676533656, is red at the brief step and not at the weather step; that step has failed 6 of 6 runs since 2026-11-14 23:06Z, which is outside this CC-CMD. The first weather red after the landing is read by a scheduled task on Monday 2026-11-16 at 08:00 ET (`trig_01P3CmptrPTdomzfyKBwv7JV`). Session record: `outbox/cc-session-2026-11-14-tls-stage.md`.

---

## What was measured

`describeEgressPath` (`scripts/egress-path-lib.mjs`) is the late node probe's text in the weather-chip failure. It resolves the host through the system resolver and makes one TCP connect to the first address. Two reds (`live-check` 43620118846 and 43631078973, both west regions) printed `dns-v4=ok 51.81.167.44`, a TCP connect that succeeded, and a `fetch` that had failed with `UND_ERR_CONNECT_TIMEOUT`. The line has no TLS stage, so it cannot say whether the handshake is what stalled, and it names one address, so it cannot say whether the host's other address answers from that runner. `docs/CC-CMD-2026-11-14-weather-failure-cause.md` recorded both as untested premises and left the choice to the owner. The owner chose this.

Fourteen runner runs on 2026-11-14 (20:22 to 21:00 ET) answered what could be answered without a red. In short, and each row below with its command:

- `api.open-meteo.com` has two A addresses and no AAAA: `51.81.167.44` (WEST) and `167.114.211.86` (EAST).
- From 11 runners in 9 regions, no TLS handshake to WEST completed (0 of 39 by Node, 0 of 24 pinned Node requests, 0 of 19 by curl). From 12 runners every one completed to EAST (42 of 42, 26 of 26, 19 of 19).
- TCP to WEST completes. The server's SYN-ACK advertises window 0.
- The zone picks the address by the client's subnet. A public resolver that is not told a subnet usually returns the address the system resolver already gave, so it does not show the other one.

## Related, read before building (BUILD-ON-A)

Searched 2026-11-14 by content (`describeEgressPath`, `egress-path-lib`, `host-silent`, `51.81.167.44`, `167.114.211.86`, `TLS stage`) in `docs/CC-CMD-*.md`. Two files match. Status, rulings and holds were read, and what this does with each:

- `docs/CC-CMD-2026-11-14-weather-failure-cause.md` (DONE 2026-11-14). This builds on it: same module, same line, same live and end-to-end proofs. Its holds stand: text only, no verdict, no tolerance. A one-line pointer to this file is added to it.
- `docs/CC-CMD-2026-11-09-venue-review-remainder.md` (DONE 2026-11-14). The ruling behind the fence: the live-slate check "must not become a quiet pass". A longer failure message is the opposite of one. Not edited.
- Rulings this must not undo, restated from the file above: `docs/CC-CMD-2026-10-17-weather-live-http-outage.md` (an outage never becomes a quiet pass; not edited), `docs/CC-CMD-2026-10-20-weather-first-call-connect.md` (a retry stays the owner's call; not edited), `docs/CC-CMD-2026-11-10-live-chip-refused-payload.md` (CLOSED 2026-11-14 on option 3: the decoder's rule is kept, nothing in `scripts/render-check.mjs` changes).
- `scripts/render-check.mjs` is not edited at all. It prints whatever `describeEgressPath` returns, and Task 3 proves the diff has no line in it.

## Premises, and the one command that tested each (Rule 100)

Every row is read from `outbox/tls-stage-premise-2026-11-14.txt`, which opens with `checked 14 of 14 runs`; its table is counted from the verbatim output blocks by a script, not typed.

| premise | the command | what it said |
|---|---|---|
| a public resolver, asked from a west runner, shows the host's other address (my reading when the owner said "TLS") | Google `https://8.8.8.8/resolve?name=api.open-meteo.com&type=A`, no subnet, from 8 runners | refuted on 4 of 5 runners whose system resolver gave WEST: it gave WEST again (westus, westus3 twice, westus2). On westcentralus it gave EAST. On the 3 runners whose system resolver gave EAST it gave EAST |
| the zone picks the address by the client's subnet | the same call with `&edns_client_subnet=<a /24>`: four /24s taken from egress addresses that committed artifacts record (westus2, westus3, southcentralus, eastus2), from 8 runners | the two west /24s gave WEST 16 of 16 times and the two east /24s gave EAST 16 of 16 times, from every runner whatever region it ran in |
| Cloudflare's DoH JSON can be the public resolver | `…/dns-query?name=…&type=A&ct=application/dns-json` (run 43662807241), then the same with an `accept: application/dns-json` header (v2 and v3 runs) | the first: HTTP 400, 0 bytes, 3 of 3 requests. With the header: HTTP 200. It takes no subnet. Google's `/resolve` needs no header and takes one, and answered HTTP 200 in 7 to 77 ms in all 49 calls of the 8 runs that timed it |
| the stall follows the address, not the runner | Node `tls.connect` with SNI, Node `https` pinned GET, curl `--resolve` pinned GET, against both addresses | WEST: 0 of 39 handshakes, 0 of 24 requests, 0 of 19 curl requests completed, on 11 runners (westcentralus, westus, us-east-1 on AWS, westus3 twice, centralus, westus2, northcentralus, eastus, eastus2 twice). EAST: 42 of 42, 26 of 26, 19 of 19, on 12 runners |
| the stall follows the ClientHello's size (Node 22's hello is 1596 bytes, with the X25519MLKEM768 key share) | v3, 4 runners: a 366-byte classical hello (Node) and curl `--curves X25519:P-256`, both addresses | refuted: WEST stalled the same (0 of 12 and 0 of 8), EAST answered (12 of 12 and 8 of 8) |
| `tls.connect` with ALPN `http/1.1` is a fair stand-in for `fetch` | `node hello2.mjs`: both clients against a loopback listener that parses the first record (the sandbox, Node 22.23.4, not a runner) | same cipher count, extension order, SNI, ALPN, groups and key shares; record length 1596 and 1596 |
| TCP to WEST fails | v4, 3 runners: six TCP-only `net.connect` each, before and after the other tests | 18 of 18 completed, 64 to 78 ms |
| where WEST stops the exchange | v4: `tcpdump -i any "tcp port 443 and host <addr>"` beside the attempts; the first 90 of about 290 captured lines are printed | every SYN-ACK printed from WEST carries window 0 (8 of 8 in each of 3 runs; EAST: 0 of 8). The printed lines hold no client data segment for WEST. `curl -v` printed "Client hello (1573 bytes)" and then "Connection timed out" at the 10 s cap it was given (10.0026 to 10.0028 s in the three runs). Not established: that nothing left after the 90 printed lines, and why the window is 0 |
| Google's JSON for a name that does not exist, has no AAAA, or is a CNAME has a shape the parser can name | `https://8.8.8.8/resolve` for `api.open-meteo.invalid`, `api.open-meteo.com` type AAAA, `www.github.com`, and a malformed `edns_client_subnet` (run 43665722193) | `Status` 3 with no `Answer`; `Status` 0 with no `Answer`; an `Answer` holding a type 5 record then a type 1; HTTP 400 with an HTML body. These are the self-test's fixtures, byte for byte |

Premises not tested, and not claimed: that the two west reds were this stall (the premise runs are not the reds; the stage tests it on the next red), why WEST advertises window 0, and what a Chromium on the same runner does.

## Task 0 — probe block (run at filing)

```
git log --oneline -3                                    # c7c29272 (HEAD at filing, main, clean)
grep -n "const egressFamily\|const realDeps\|export async function describeEgressPath\|export const LINE_KEYS\|export const judgeE2E" scripts/egress-path-lib.mjs
grep -n "describeEgressPath" scripts/render-check.mjs   # one call, line 388
node scripts/egress-path-lib.mjs --self-test            # 78 of 78 at HEAD, coverage line "checked 6 of 6 described lines for all 11 keys"
node scripts/mutation-check.mjs --anchors               # baseline "checked 1530 of 1533"
```

## Design (what changes, and one refinement of the owner's wording)

The line keeps its 11 keys and gains four, in the order printed: `public-v4`, `view-west-v4`, `view-east-v4` (after `dns-v6`) and `tls` (after `connect-v6`). `LINE_KEYS` becomes 15, and every branch still prints every key.

- **Sources.** `system` (the `dns-v4` and `dns-v6` answers, all of them, not the first two), `public` (Google DoH JSON, no subnet), `west` and `east` (the same call with `edns_client_subnet`). Each is reported on its own line; none stands in for another.
- **TLS stage.** One handshake per address from the union, in the order first seen, parallel, 3000 ms each, SNI the host (none when the host is an IP literal), ALPN `http/1.1` as `fetch` sends. A verdict is `ok (tcp 68ms, handshake 71ms)`, `no-tls-in-3000ms (tcp 12ms)`, `no-connect-in-3000ms (tcp not completed)`, or the error's code with where it failed. Each entry ends `from <the sources that named it>`.
- **Bounds.** DNS and the three DoH calls start together (at most 3000 ms), then the handshakes (at most 3000 ms): 6000 ms inside the unchanged `budgetMs` of 8000. At most 6 addresses are probed and the rest are counted. What finished before the budget is kept and the rest prints `unreadable (not finished in …)`.
- **The refinement.** The owner's word covers "every address, the system resolver's and a public resolver's". The premise table shows a public resolver alone would have shown the other address on 1 of 5 west runners, so on 4 of 5 reds the line would have said the resolvers agree and not answered the question it was asked for. `west` and `east` are two more DoH queries, with the `/24` of a westus2 runner's egress address (`20.80.173.0/24`, from `live-check` 43620118846) and of an eastus2 runner's (`68.220.172.0/24`, probe 43638310999), both in the "Observed" table of the file this builds on. The subnet is printed in each value, so a label gone stale is visible. Deleting `VANTAGES` removes both views and leaves the literal reading. It is built both ways at once, so nothing waits on an answer.
- **Judgement.** `judgeE2E` also requires `tls=` in the failing text, so the end-to-end proof covers the new stage. `--live` prints, per shape, `addresses: N found, N with a settled TLS verdict`, read from the facts the description is built from and not from its printed text.
- **No other file changes.** `scripts/mutation-check.mjs` gains registry entries. `.github/workflows/open-meteo-egress-probe.yml` gets one guard: its Commit step pushes `HEAD:main`, so a dispatch from a branch would push that branch's commits to `main`. The guard is a check of `$GITHUB_REF` at the top of the step's script, and the step's `if:` stays `always()`. As first written the condition was in the `if:`, which `scripts/check-browser-gate.py` counts as a step a failed install may skip (the file's pinned count went from 1 to 2: see the Outcome). The log still carries every artifact's text.

## Task 1 — the evidence and this file (done at filing)

`outbox/tls-stage-premise-2026-11-14.txt` and this file, docs and outbox only: no CI runs on them. One pointer line is added to `docs/CC-CMD-2026-11-14-weather-failure-cause.md`.

## Task 2 — the workflow guard

Its own `ci:` commit on the work branch: the Commit step of `open-meteo-egress-probe.yml` prints `ref: $GITHUB_REF` and exits 0 unless it is `refs/heads/main`, with the reason in a comment; its `if:` stays `always()`. `npm run check:workflows` and `npm run check:browser-gate` pass. First written as `if: always() && github.ref == 'refs/heads/main'` (`a69191d5`), with only the first of those two run; `check:browser-gate` went red on it and the fix is `9ec6907c` (see the Outcome).

## Task 3 — the library

Probe-first and mutation-first. In `scripts/egress-path-lib.mjs`:

1. `BOUNDS` gains `dohMs`, `tlsMs`, `addresses`. `LINE_KEYS` gains the four keys. `VANTAGES`, `dohUrl`, `parseDoh`, `unionOf`, `makeTlsConnect` (and `realDeps.tlsConnect`) are new. `parseDoh` places `Status` 2, 3 and 5 by name and any other as `rcode-N`, keeps type 1 records with an IPv4 literal and drops the rest, and names a non-200, a non-JSON body and a body with no `Status`.
2. `describeEgressPath` is built on `describeEgressFacts`, which also returns the addresses and their verdicts. Its signature and its text contract (one line, never throws, never waits past the budget, every key) do not change.
3. The self-test adds: `parseDoh` on the real bytes of run 43665722193 and on must-fail inputs; `unionOf`; each line branch; the orchestration with injected dependencies (healthy, a failing DoH, an IP-literal host, a hanging `tlsConnect`, a throwing one, more addresses than the cap); a latch showing DNS and DoH start together; and `makeTlsConnect` itself on loopback (a silent listener, a closed port, a listener that sends bytes that are not TLS, and a TLS server with a certificate made for the test, with and without the CA). Its coverage line prints `checked N of N` for the described lines and for the loopback shapes.
4. One mutation per new clause in the registry, each applied by hand first and seen red, each anchor unique. The 27 existing `egress-path-*` entries stay valid.

## Task 4 — gates and landing

Locally `TZ=UTC`: the 22 rows that run here, `check:egress-path`, `check:mutation-anchors`, `check:workflows`, `check:browser-gate`, `check:script-orphans`, `check:import-purity`, and the status check. Then `verify-full` on the work branch (about 55 minutes, 8 shards) scored >= 95. Merge `main` into the branch first, land with `git merge --no-ff` and the run id in the message, push to `main`. `verify`, `guards`, `deploy` and `live-check` read by REST on the full SHA.

## Task 5 — the runner proof

One dispatch of `open-meteo-egress-probe.yml` on `main`. Before it, the assertion below is run against the previous stamp's artifacts and must fail there (those lack `tls=`). Then it is run against the new ones.

## Task 6 — the manifest is last

`outbox/cc-session-2026-11-14-tls-stage.md`: the commits, the `verify-full` and dispatch run ids, each done condition's printed output, and any genuine residual.

## Done conditions

1. `node scripts/egress-path-lib.mjs --self-test` prints `checked N of N` with all passing, and each registered mutation is caught (`node scripts/mutation-check.mjs --ids <id>` prints one line each).
2. `git diff --stat` of the landing shows `scripts/egress-path-lib.mjs`, `scripts/mutation-check.mjs`, `.github/workflows/open-meteo-egress-probe.yml` and docs and outbox files. No line of `scripts/render-check.mjs`, `src/` or the relay is in it.
3. `outbox/egress-path-live-<stamp>.txt`, first line `checked 4 of 4 shapes`, `VERDICT: pass`; its `## real` section carries a `tls=` entry for every address (`addresses: N found, N with a settled TLS verdict`, N >= 1) and `public-v4=`, `view-west-v4=` and `view-east-v4=` each showing an address or a named failure. If both views answered they show different addresses: that is a property of the zone at that moment, so if it does not hold the artifact says so and this condition stays open, with the lines as the evidence.
4. `outbox/egress-path-e2e-<stamp>.txt`, `VERDICT: observed`, whose excerpt carries `tls=` (the verdict now requires it). A `not-observable` verdict leaves this open.
5. `runner=image … region … cloud …` is intact in both artifacts.
6. `npm run gate` >= 95, `verify-full` scored, and `verify`, `guards` and `deploy` green on the landing SHA.

## Outcome, 2026-11-14

One landing on `main`: `a25df340`, `git merge --no-ff tls-stage` (parents `226a9ba6` and `5f4b000b`), pushed 04:11:43Z (23:11 ET). The branch's commits: `a69191d5` (the workflow guard, first form), `f3c9f80b` (the library), `370da1a7` (`runLive` takes its network calls and its output as parameters), `5c2021b0` (two gaps a generic operator sweep found), `9ec6907c` (the guard's fix). `verify-full` 43670536247 scored `5c2021b01b8c-faad15047249` at 530 of 530 in 3284 s. Three earlier gates (43668099984, 43669293494, 43670381109) were cancelled, 32 min 4 s of run time in all. On the landing SHA `verify` 43675679692 and `guards` 43675679713 are green; `deploy` 43676444094 is green on `f30d2b99`, which is the landing plus the five outbox files of the probe's artifacts commit.

One dispatch of `open-meteo-egress-probe.yml` on `main`: run 43675697053 (created 04:11:57Z, success at 04:14:55Z, Azure southcentralus, stamp `20261115T041303Z`); the workflow committed its artifacts as `f30d2b99`. Two dispatches from the branch read the new text before landing: 43668129783 (`f3c9f80b`, Azure westus3), where the real forecast request failed with `UND_ERR_CONNECT_TIMEOUT` and the line showed the address the system resolver gave completing TCP and no handshake while the other address completed a handshake in 74 ms, and 43669295856 (`370da1a7`, Azure eastus), where the same pair read the other way round. Those two are probe runs and not `live-check` reds.

| # | result | artifact |
|---|---|---|
| 1 | met: `148/148 checks passed`, `checked 18 of 18 described lines for all 15 keys`, `checked 7 of 7 loopback TLS shapes`; 50 new registered mutations (27 to 77 `egress-path-*`), each caught; `--anchors`: `checked 1580 of 1583 mutation anchors; 0 stale`; the eight shards of the scored gate ran 1582 of 1582 ids | `outbox/egress-path-tls-mutations-2026-11-14.txt` |
| 2 | met: 7 files, 1242 insertions, 38 deletions; no path under `src/` and none equal to `scripts/render-check.mjs` | `git diff --stat a25df340^1 a25df340` |
| 3 | met: `checked 4 of 4 shapes`, `VERDICT: pass, 4 of 4 shapes as expected`, `addresses: 2 found, 2 with a settled TLS verdict`; the west and east views gave different addresses (`51.81.167.44` and `167.114.211.86`) | `outbox/egress-path-live-20261115T041303Z.txt` |
| 4 | met: `VERDICT: observed`; the failing text carries `tls=` with the fault address and both real addresses | `outbox/egress-path-e2e-20261115T041303Z.txt` |
| 5 | met: `runner=image ubuntu26@20261111.196.1 region southcentralus cloud Azure` in 5 of 5 places | the same two files |
| 6 | met: 530/530 against a bar of 95; `verify`, `guards` and `deploy` green | `docs/confidence-log.jsonl`, run `5c2021b01b8c-faad15047249` |

What the real runner read (southcentralus, run 43675697053): the system resolver gave EAST `167.114.211.86`, which completed in 49 ms (tcp 47 ms, handshake 49 ms); the west subnet view gave WEST `51.81.167.44`, which completed TCP in 58 ms and no handshake in 3000 ms. In the end-to-end text the injected address `192.0.2.1` read `no-connect-in-3000ms (tcp not completed)` and the two real addresses read as in the live artifact (EAST `ok`, WEST `no-tls-in-3000ms`).

Differences from the plan.

- Task 2's guard. As first written (`a69191d5`: `if: always() && github.ref == 'refs/heads/main'` on the Commit step) `scripts/check-browser-gate.py` counted 2 steps a failed install may skip against the annotation's 1, and `verify` 43671132728, dispatched on the branch, went red at `browser-gate`. The workflow check run on that commit was `check:workflows` (71 of 71); `check:browser-gate` was not run. `9ec6907c` moves the ref check into the step's script and leaves the `if:` as `always()`, and N stays 1. The Design bullet and Task 2 above now say that, and Task 4's local list carries `check:browser-gate`. Proof: the guard red on the committed file and green on the fix, a five-case simulation of the step with a mutant, and the step's own log on the real dispatch from `main` printing `ref: refs/heads/main` (all in the session record).
- Gates and time. Three gates were cancelled before the scored one: a mutation gap in `runLive`, found while the first gate ran, and a dispatch that went out after a rejected push. The landing came at 23:11 ET against the three hours stated at 20:18 ET; the proof reads and the record ran later.
- `live-check` 43676533656 on `f30d2b99` is red at the step "A finished game shows the brief written after it finished". That step failed in 6 of 6 runs that reached it since 2026-11-14 23:06Z and passed in the 7 before, and its first red ran before any commit of this work reached `main`. Its weather step passed. It is described, with the one-change test, in the session record under Residual and is not changed here.

The first weather red after the landing is the test of the first bullet under "What this does not establish". Scheduled task `trig_01P3CmptrPTdomzfyKBwv7JV` reads it on Monday 2026-11-16 at 08:00 ET and writes `outbox/tls-first-red-<date>.md`. The session record is `outbox/cc-session-2026-11-14-tls-stage.md`.

## Observed 2026-11-18: the same facts every minute for half an hour, on one runner (premises, not findings)

Added under BUILD-ON-A by session `01CggeNb` (owner: "Run the DNS test"). `scripts/probe-rain-precip-pair.mjs` now calls
`describeEgressFacts` at the start of each of its 30 rounds and groups that round's unanswered requests by TLS to the
system's address (landed `dffa3b98` after verify-full 44233265188, 530 of 530). One run: `rain-precip-pair-probe.yml`
44241127086, runner `westus2`, egress `4.155.149.103` throughout, 55 grounds, 05:00:48Z to 05:31:20Z,
`outbox/rain-precip-pair-2026-11-14-2026-11-18T05-00-48.txt` and its `.jsonl` (every `egress-path:` line kept).

| rounds | system address | TLS to it | TLS to the other address | unanswered |
|---|---|---|---|---|
| 0 (05:00:51Z) and 1 (05:03:21Z) | WEST `51.81.167.44` | `no-tls-in-3000ms` (tcp 10 to 11 ms) | EAST `167.114.211.86` ok, handshake 133 to 135 ms | 75 of 110 |
| 2 to 29 (05:04:18Z on) | WEST `51.81.167.44` | ok, handshake about 12 to 14 ms | EAST ok | 0 of 1,540 |

What it adds to the premises above, on this one runner: (a) "the address decides the outcome" does not hold as stated:
the system gave WEST in all 30 rounds and the outcome changed. (b) TCP completing and TLS stalling does hold, and only
for WEST, while EAST completed TLS from the same runner and egress address: so the runner's own TLS was working, and the
stall was particular to WEST (the host behind it, or the path to it) for a window of a few minutes. Every unanswered
request of the run fell inside that window. Not shown: why WEST stalled, how often such windows come, whether they come
mostly at a runner's start (this one did; the pair probe's 2026-11-14 run on another westus2 runner lost requests in
waves across its whole half hour, with no address recorded), and anything about Chromium.

## What this does not establish (said before it is built)

The line describes Node's stack at a moment later than the page's window, as before. It can show, from the failing runner, that one address completes TCP and not a handshake while the other answers. It does not show that a given red was that stall: the premise runs were not the reds, and the first red after this lands is the test. It does not say why WEST advertises window 0, whether anything left the runner after the 90 printed capture lines, or what Chromium does.

## Not in scope

- Verdicts, `--tolerate-unreachable`, `attributeWeather`, `requestCapMs`, `slateDeadlineMs`, `src/WeatherView.fs`, `src/Weather.fs`, and `scripts/render-check.mjs` itself.
- A retry, a pinned address or a second host in the page or the gate. Those are the owner's, under the rulings above.
- Reporting the west node's behaviour to Open-Meteo: the owner's call.
- `probe-url.yml` pastes `${{ github.event.inputs.urls }}` into a shell script. Only users who can dispatch workflows can set it; it is recorded here and not changed.
