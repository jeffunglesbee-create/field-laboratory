# Claude Code Command — the weather failure message cannot say whether the host's other address answers: no TLS stage, and one address of the several that exist

**Branch:** main — commit directly, do not create a feature branch or PR (a work branch is used only to run `verify-full`, and lands on `main` by merge with the run id in the message)
**Repo:** field-laboratory
**Filed:** 2026-11-14 by CC, on the owner's word ("TLS", Sat 2026-11-14 20:18 ET), as the named residual of `docs/CC-CMD-2026-11-14-weather-failure-cause.md`
**Confidence gate:** `npm run gate` >= 95 before any commit
**Status:** FILED 2026-11-14. Approved by the owner in one word ("TLS"). Premises tested before filing (Rule 100): 14 runner runs, `outbox/tls-stage-premise-2026-11-14.txt`. One scope refinement of the owner's wording is stated under "Design" and needs no answer. Build not started.

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
- **No other file changes.** `scripts/mutation-check.mjs` gains registry entries. `.github/workflows/open-meteo-egress-probe.yml` gets one guard: its Commit step pushes `HEAD:main`, so a dispatch from a branch would push that branch's commits to `main`. The guard is `github.ref == 'refs/heads/main'`. The log still carries every artifact's text.

## Task 1 — the evidence and this file (done at filing)

`outbox/tls-stage-premise-2026-11-14.txt` and this file, docs and outbox only: no CI runs on them. One pointer line is added to `docs/CC-CMD-2026-11-14-weather-failure-cause.md`.

## Task 2 — the workflow guard

Its own `ci:` commit on the work branch: `if: always() && github.ref == 'refs/heads/main'` on the Commit step of `open-meteo-egress-probe.yml`, with the reason in a comment. `npm run check:workflows` passes.

## Task 3 — the library

Probe-first and mutation-first. In `scripts/egress-path-lib.mjs`:

1. `BOUNDS` gains `dohMs`, `tlsMs`, `addresses`. `LINE_KEYS` gains the four keys. `VANTAGES`, `dohUrl`, `parseDoh`, `unionOf`, `makeTlsConnect` (and `realDeps.tlsConnect`) are new. `parseDoh` places `Status` 2, 3 and 5 by name and any other as `rcode-N`, keeps type 1 records with an IPv4 literal and drops the rest, and names a non-200, a non-JSON body and a body with no `Status`.
2. `describeEgressPath` is built on `describeEgressFacts`, which also returns the addresses and their verdicts. Its signature and its text contract (one line, never throws, never waits past the budget, every key) do not change.
3. The self-test adds: `parseDoh` on the real bytes of run 43665722193 and on must-fail inputs; `unionOf`; each line branch; the orchestration with injected dependencies (healthy, a failing DoH, an IP-literal host, a hanging `tlsConnect`, a throwing one, more addresses than the cap); a latch showing DNS and DoH start together; and `makeTlsConnect` itself on loopback (a silent listener, a closed port, a listener that sends bytes that are not TLS, and a TLS server with a certificate made for the test, with and without the CA). Its coverage line prints `checked N of N` for the described lines and for the loopback shapes.
4. One mutation per new clause in the registry, each applied by hand first and seen red, each anchor unique. The 27 existing `egress-path-*` entries stay valid.

## Task 4 — gates and landing

Locally `TZ=UTC`: the 22 rows that run here, `check:egress-path`, `check:mutation-anchors`, `check:workflows`, `check:script-orphans`, `check:import-purity`, and the status check. Then `verify-full` on the work branch (about 55 minutes, 8 shards) scored >= 95. Merge `main` into the branch first, land with `git merge --no-ff` and the run id in the message, push to `main`. `verify`, `guards`, `deploy` and `live-check` read by REST on the full SHA.

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

## What this does not establish (said before it is built)

The line describes Node's stack at a moment later than the page's window, as before. It can show, from the failing runner, that one address completes TCP and not a handshake while the other answers. It does not show that a given red was that stall: the premise runs were not the reds, and the first red after this lands is the test. It does not say why WEST advertises window 0, whether anything left the runner after the 90 printed capture lines, or what Chromium does.

## Not in scope

- Verdicts, `--tolerate-unreachable`, `attributeWeather`, `requestCapMs`, `slateDeadlineMs`, `src/WeatherView.fs`, `src/Weather.fs`, and `scripts/render-check.mjs` itself.
- A retry, a pinned address or a second host in the page or the gate. Those are the owner's, under the rulings above.
- Reporting the west node's behaviour to Open-Meteo: the owner's call.
- `probe-url.yml` pastes `${{ github.event.inputs.urls }}` into a shell script. Only users who can dispatch workflows can set it; it is recorded here and not changed.
