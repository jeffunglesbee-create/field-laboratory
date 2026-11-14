# Claude Code Command — the weather failure message names no cause: render-check's late node probe keeps `e.message` and nothing about the runner's path to Open-Meteo

**Branch:** main — commit directly, do not create a feature branch or PR
**Repo:** field-laboratory
**Filed:** 2026-11-14 by CC, on the owner's word ("Diagnostics", Sat 2026-11-14 08:48 ET), after `outbox/live-check-weather-silent-2026-11-14.md`
**Confidence gate:** `npm run gate` >= 95 before any commit
**Status:** PARTIAL 2026-11-14. Approved by the owner in one word. Landed on `main` in two commits, `7be7dd00` and `5ba3efeb`, each after a scored `verify-full` (43613293578 and 43622319008, 530 of 530 both). Done conditions 1 to 4 and 6 are met. Condition 5 is STAGED (Rule 74): the first runner pass printed `region unreadable` because my parser read the wrong keys, `5ba3efeb` fixes it, and no runner has printed the fixed line since (the `live-check` after that landing, 43627924560, was green, so its late probe did not run). Blocked by: the one dispatch of the egress probe workflow this CC-CMD was approved for is used (run 43620413444). Unblocked by: one more dispatch of `open-meteo-egress-probe.yml` on `main`, which needs the owner's word. Verify: `grep -o 'runner=image [^|(]*' outbox/egress-path-live-<stamp>.txt` prints `region southcentralus cloud Azure`. See "Outcome" and "Observed" below.

---

## What was measured

`outbox/live-check-weather-silent-2026-11-14.md` read 268 of 268 `live-check` job logs (2026-10-09 to 2026-11-14). 76 were red. Three of those are the weather chips getting no answer from Open-Meteo for the whole window (attribution `host-silent`: every request ran to its cap, none answered), on the `ubuntu-26.04` build `20261111`, in Azure westus3, AWS us-west-2 and Azure westus2. The cause was not established. The only instrument that runs after the failure is the late node probe, and it printed `unreachable — fetch failed` in each. `fetch failed` is all Node's `e.message` ever says: the code (DNS, connect, reset, timeout) is in `e.cause`, and the probe drops it.

The probe's own sample says something sharper. By the logged OS of the reds that printed it: `ubuntu-24.04` printed `HTTP 200` (2 reds), `ubuntu-26.04` printed `fetch failed` (4 reds). In run 42136439023 (`ubuntu-26.04`), Chromium on the same runner received 15 HTTP 200 responses while the probe said `fetch failed`. On that image the node probe fails where the browser does not, so its line is not evidence about the page, and nothing recorded says why Node fails. This fills that gap: Node's own path to the host, named, with the runner it ran on.

The same gap exists in another script: `docs/CC-CMD-2026-11-10-live-chip-refused-payload.md` records that 53 of 120 requests (44%) in the pair probe's first run failed as `fetch failed` with the cause not kept.

## Related, read before building (BUILD-ON-A)

Searched 2026-11-14 by content (`probeSaw`, `late node probe`, `e.cause`, `UND_ERR`, `ETIMEDOUT`, `ENOTFOUND`, `egress address`, `address famil`) in `docs/CC-CMD-*.md`. Two files mention a cause code and neither plans to record one; no open CC-CMD covers this. Status, rulings and holds were read, and what this does with each:

- `docs/CC-CMD-2026-10-17-weather-live-http-outage.md` (DONE 2026-10-20). Ruling, "The hazard this must not reopen": an outage must never become a quiet pass. This adds text to a failure and tolerates nothing. Not edited.
- `docs/CC-CMD-2026-10-20-weather-first-call-connect.md` (DONE 2026-11-03). Measured `UND_ERR_CONNECT_TIMEOUT` on a new connection from runners; one of the shapes the module must render. Its Task 1 (a retry) stays the owner's call and is not built. Not edited.
- `docs/CC-CMD-2026-11-10-live-chip-refused-payload.md` (PARTIAL 2026-11-11). Hold: `scripts/render-check.mjs` and the live-slate check are "not in scope" there "until the owner rules on option 4", and option 4 teaches the gate a tolerance. This is not option 4. No verdict, no `--tolerate-unreachable` branch, no `check` condition and no `attributeWeather` case changes; one sentence is added to a failure text, under the owner's explicit order of 2026-11-14, and Task 2 proves the diff is only that. Its wet re-run is due today, so `scripts/rain-precip-pair-probe.mjs` is not edited: an instrument must not change under a running measurement. The pair probe's missing cause is that CC-CMD's own "Seen, not this task" paragraph, so by BUILD-ON-A it is not filed again. The module is importable, and wiring that probe is a few lines once the owner says.
- `docs/CC-CMD-2026-11-09-venue-review-remainder.md` (DONE 2026-11-14). The ruling behind the fence: the live-slate check "must not become a quiet pass". A longer failure message is the opposite of that.
- `docs/CC-CMD-2026-11-11-soccer-live-scores.md` and `docs/CC-CMD-2026-11-11-runner-apt-mirror-dns.md` each restate the render-check fence for their own work. Neither is touched. The workflow extended in Task 3 keeps the apt-mirror CC-CMD's install form (`timeout --kill-after=10 180 npx playwright install chromium`, no `--with-deps`) because no install is added.
- `outbox/cc-render-check-tolerate-open-meteo-2026-08-23.md`: the precedent for a tolerance. Not extended.

## Premises, and the one command that tested each (Rule 100)

The shapes below were measured by `node outbox/node-fetch-failure-shapes-2026-11-14.mjs` (Node v22.23.4, the authoring sandbox, loopback servers it builds itself plus the reserved `.invalid` name; output in `outbox/node-fetch-failure-shapes-2026-11-14.txt`, which opens with `checked 7 of 7 shapes`).

| premise | the command | what it said |
|---|---|---|
| `fetch failed` hides the cause under `.cause` | the shapes script, shapes A, D, F, G | in each, `e.message` is `fetch failed` and the link under `cause` carries the code: `ENOTFOUND` (syscall `getaddrinfo`, with the hostname), `ECONNREFUSED` (syscall `connect`, with address and port), `UND_ERR_SOCKET` ("other side closed"), `UND_ERR_CONNECT_TIMEOUT` ("Connect Timeout Error (attempted address: …, timeout: 10000ms)") |
| a silent host also arrives as `fetch failed` | shape C: a listener that accepts and never answers, `AbortSignal.timeout(600)` | refuted. The thrown error is a `DOMException` named `TimeoutError` with no `cause`; today's `unreachable — ${e.message}` would read "The operation was aborted due to timeout" |
| the probe's 15 s abort is what ends a connect hang | shape G: a full accept queue, abort set at 14 s | refuted. undici's own connect budget ended it at 10044 ms with `UND_ERR_CONNECT_TIMEOUT`; the abort can only fire after a connection exists |
| port 1 is a usable refused fixture | shape B | refuted. undici refuses it before any network (`bad port`). Fixtures use a closed ephemeral port (shape D) |
| `localhost` gives a two-address `AggregateError` locally | shape E | refuted in the sandbox: one address, `ECONNREFUSED 127.0.0.1`. The multi-address shape has not been observed anywhere; Task 3 shows it or says it did not appear |
| something parses the failure text | `grep -rn -E "late node probe\|Attribution from the page"` over `.mjs .yml .json .py .sh` outside `build/` and `node_modules` | two hits outside render-check: `outbox/venue-us-bank-stadium-evidence-2026-11-09.mjs` strips `Attribution from the page's own window:` to the end of the line, and the committed census names the probe in a comment. Neither reads a new sentence; it goes after the existing late-probe sentence |
| the log header's `Region` and `Cloud` exist for these runs | `awk` over the census TSV | 268 of 268 read logs carry both (265 Azure, 3 AWS) |
| `ImageOS` and `ImageVersion` are set in a step | not tested here: it needs a runner | Task 3's artifact prints them. No claim before it |
| region and cloud can be read from a step, and from where | not tested here: it needs a runner | Task 3's survey lists the candidate files and the process ancestry. The module reads exactly one source, chosen from that output |
| the egress address can be read from a step | not tested here: it needs a runner | Task 3 |
| the mutation anchors into render-check survive the edit | `node scripts/mutation-check.mjs --anchors` after Task 2 | Task 2 |

## Task 0 — probe block (run at filing)

```
git log --oneline -3                      # e727a133 docs: live-check reds ... (HEAD at filing, main, clean)
node outbox/node-fetch-failure-shapes-2026-11-14.mjs
grep -n "probeSaw\|AbortSignal.timeout" scripts/render-check.mjs
```

The probe in `scripts/render-check.mjs` is one `fetch(forecastUrl(probe), { signal: AbortSignal.timeout(15_000) })` for Fenway Park, run only when the page's wait failed or a chip is unfilled on an unpinned page. It records `HTTP <status>` or `unreachable — <e.message>`, and nothing else.

## Task 1 — the module

New `scripts/egress-path-lib.mjs`, importable (`isMain` guard, so `check:import-purity` stays green) and with no import from `build/`.

- `describeError(e)`: pure. Walks `.cause` and `AggregateError.errors`, depth-bounded and cycle-safe, never throws, renders `name code syscall address:port` for each link. The message is kept (truncated) for `UND_ERR_*` codes, because undici puts the attempted addresses in it.
- `describeEgressPath({ host, error })`: live, never throws, bounded by one budget of 8 s, returns one line. Every key is always present; where a source says nothing the value is `unreadable (<reason>)`, never an omission and never a guess:

```
egress-path: probe-error=… | node=<version> autoSelectFamily=<bool> resultOrder=<order> resolvers=<list> | dns-v4=… | dns-v6=… | connect-v4=… | connect-v6=… | egress-v4=… | egress-v6=… | runner=image <ImageOS>@<ImageVersion> region <region> cloud <cloud>
```

DNS is `dns.lookup(host, { family, all: true })` because that is the call Node's `fetch` makes, with its time. Connect is a TCP connect to the first address of each family on 443, capped at 3 s, with its time. The egress address comes from one source, `https://1.1.1.1/cdn-cgi/trace` (an IP literal, so it needs no DNS) and its IPv6 twin, each capped; it is the address that endpoint sees, at that moment. Region and cloud come from the one source Task 3's survey names.

Self-test (`--self-test`, prints `checked N of N`): each fast shape built for real on loopback (a name that cannot resolve, a closed ephemeral port, a reset, a silent listener aborted); the observed hang and a two-address `AggregateError` built from real `Error` objects carrying the real property names, with their provenance in a comment; must-fail inputs (`null`, a string, a circular cause, a megabyte message, an `errors` array of a thousand); `describeEgressPath` with injected lookup, connect and fetch fakes, asserting every key is present on every branch, that a dependency that throws yields `unreadable` text and not a throw, and that the budget bounds a dependency that never returns.

Mutations (MUTATE-FIRST-A), registered in `scripts/mutation-check.mjs`, each a one-line break whose `expect` is the self-test, each seen red before the check is trusted: the cause is not walked; the `errors` array is not walked; the code is dropped; a dependency's throw escapes; the budget is not applied; an unreadable value is omitted instead of named; the two families are swapped.

## Task 2 — the wiring, text only

`scripts/render-check.mjs`. The diff is exactly: one import; `let probeErr = null` and `let pathSaw = 'not probed'` beside `probeSaw`, with a two-line comment above them; `probeErr = e` in the probe's `catch`; `pathSaw = await describeEgressPath(...)` inside the existing `if`, after the probe; and one sentence in the failing chip check's detail, after the late-probe sentence and before "The page reported:". Every existing sentence is byte-identical. `openMeteoDown`, `probeSaw`, `attributeWeather`, `TOLERATE`, every `check` condition and the `::warning::` text are untouched.

Artifact: `git diff -U0 e727a133 -- scripts/render-check.mjs`, quoted in the outbox, showing only those lines. The module's self-test reads render-check's source and asserts the four wiring facts; three registered mutations remove each in turn and must go red. `node scripts/mutation-check.mjs --anchors` stays green.

## Task 3 — the runner proof

In `.github/workflows/open-meteo-egress-probe.yml` (dispatch-only; its consumers are its own dispatch and two comments in `scripts/render-check.mjs`). No step is removed or reordered and no install is added. After the existing `Probe` step, each with `if: always()`, and each ending `exit ${PIPESTATUS[0]}` where it pipes into `tee`:

1. Survey: `find` for `.setup_info`, the `ImageOS`, `ImageVersion` and `RUNNER_*` variables (names and values; no secret is in that set), and the process ancestry, into `outbox/egress-path-survey-<stamp>.txt`.
2. `node scripts/egress-path-lib.mjs --live`: four shapes on the runner (the real forecast URL; `api.open-meteo.invalid`; `192.0.2.1:443`, a documentation address no route answers; a closed loopback port), into `outbox/egress-path-live-<stamp>.txt`, first line `checked 4 of 4 shapes`.
3. The fault-injected end to end: `192.0.2.1 api.open-meteo.com` appended to `/etc/hosts`, then `npm run check:live` unpinned against the served build the workflow already makes, expected red, into `outbox/egress-path-e2e-<stamp>.txt` with a last line saying whether the chip check's FAIL carries `egress-path:`. If the slate asked about no known ground, the verdict is `not-observable` with its reason: that is "not measured", never a pass.

One dispatch. A follow-up needed because a source read nothing (region, egress address) is a measured finding in the record and a fix commit in this CC-CMD, not a carry-forward.

## Task 4 — gates and landing

`npm run gate` >= 95 with `PW_CHROMIUM` set. Locally: `check:import-purity`, `check:mutation-anchors`, `check:workflows`, `check:script-orphans`, `check:history`, `check:citations` and the CC-CMD status check. One source commit with its outbox, pushed to `main` after `git pull --rebase origin main`. `verify`, `guards` and `live-check` read by REST on the full SHA.

## Task 5 — the manifest is last

`outbox/cc-session-2026-11-14-egress-diagnostics.md`: the commit, the verify run id, the dispatch run id, the artifacts, each done condition's printed output, and any genuine residual.

## Done conditions

1. `node scripts/egress-path-lib.mjs --self-test` prints `checked N of N`, all passing, and the registered mutations are all caught (the harness prints one line each).
2. The diff of `scripts/render-check.mjs` is the lines listed in Task 2 and no others: one file in `git diff --stat`, the quoted diff in the outbox.
3. `outbox/egress-path-live-*.txt`, first line `checked 4 of 4 shapes`: the `.invalid` shape carries `ENOTFOUND`, the closed port `ECONNREFUSED`, the documentation address a connect-stage cause (named, whichever the runner gives), the real host `HTTP 200`; every key present in each.
4. `outbox/egress-path-e2e-*.txt`: render-check's own FAIL text for the chip check contains `egress-path:`, a `probe-error=` with a code, and `dns-v4=`. A `not-observable` verdict leaves this open, not met.
5. `runner=` carries a real region string, or the survey artifact shows the measured reason it cannot be read and the record says so.
6. `npm run gate` >= 95, and `verify` green on the full SHA.

## Outcome, 2026-11-14

Two commits on `main`. `7be7dd00`, the feature: `verify-full` 43613293578 scored `ebca26e5` at 530 of 530; `verify` 43618962875, `guards` 43618962988 and `deploy` 43620027746 green on the landing SHA. `5ba3efeb`, the region fix: `verify-full` 43622319008 scored `d7a8e367` at 530 of 530; `verify` 43627238605, `guards` 43627238792 and `deploy` 43627825413 green on the landing SHA, and `live-check` 43627924560 green (105 of 105; weather chips filled, so no late probe).

| # | result | artifact |
|---|---|---|
| 1 | met: `78/78 checks passed` (76 of 76 at the first landing); 27 registered mutations (23 at the first landing), each caught by a named check | `outbox/egress-diagnostics-wiring-2026-11-14.md` |
| 2 | met: one file, 8 insertions, 1 deletion; no verdict, tolerance or attribution line touched | the same note |
| 3 | met: `checked 4 of 4 shapes`, `VERDICT: pass, 4 of 4 shapes as expected` | `outbox/egress-path-live-20261114T171939Z.txt` |
| 4 | met: `VERDICT: observed`; the chip check's FAIL carried `egress-path:`, a `probe-error=` with a code, and `dns-v4=` | `outbox/egress-path-e2e-20261114T171939Z.txt` |
| 5 | STAGED, see the Status line. The survey found the source (`.setup_info` beside `Runner.Worker`: `Region: southcentralus`, `Cloud: Azure`) | `outbox/egress-path-survey-20261114T171939Z.txt` |
| 6 | met for both commits: ids `ebca26e533b1-451a9c10e26c` and `d7a8e3676ee8-5443c49158b6` | `docs/confidence-log.jsonl` |

The first red to carry the description, `live-check` 43620118846, had the same four failing checks as the red before the change (43603906789; 101 PASS and 4 FAIL in each), so no verdict moved. The session record is `outbox/cc-session-2026-11-14-egress-diagnostics.md`.

## Observed 2026-11-14, after the description ran in a real red (premises, not findings)

Added here under BUILD-ON-A, because this is the CC-CMD that covers the description. In `live-check` 43620118846 the late node probe printed `probe-error=TypeError "fetch failed" < ConnectTimeoutError UND_ERR_CONNECT_TIMEOUT "Connect Timeout Error (attempted address: api.open-meteo.com:443, timeout: 10000ms)" | cause=UND_ERR_CONNECT_TIMEOUT stage=connect-budget`, then `dns-v4=ok 51.81.167.44 0ms` and `connect-v4=51.81.167.44:443 ok 12ms`. The probe's `fetch` ran out of undici's 10 s connect budget, and the description's own TCP connect to the one address DNS returned, made afterwards, answered in 12 ms. The description has no TLS stage and connects to the first address of each family only. Separately, two runs about six minutes apart got different single addresses for the name: `51.81.167.44` in that red, `167.114.211.86` in the probe's live artifact (run 43620413444).

Two premises, neither tested: (a) the name's A record rotates and some address is not reachable from some runner egress; (b) TCP completes and the TLS handshake stalls, because the connect budget covers lookup, connect and TLS. Tests, on a runner: resolve `api.open-meteo.com` 20 times and list the distinct addresses; for each address, time a TCP connect and a TLS handshake (`openssl s_client -connect <ip>:443 -servername api.open-meteo.com`, or `node:tls`). Putting that into every red means a TLS stage and every address in `describeEgressPath`. It was not built: it changes what the description probes beyond "DNS and connect results per address family", and it needs the owner's word and one runner dispatch to prove.

## What this does not establish (said before it is built)

The line describes Node's stack, at a moment later than the page's window. It cannot say why Chromium got no answer. What it can say is whether Node's own path was failing, at which stage and in which address family, and it gives image, region and egress address so that several reds can be set side by side. It does not rule in or out that the three silent reds were the host's.

## Not in scope

- Verdicts, `--tolerate-unreachable`, `attributeWeather`, `requestCapMs`, `slateDeadlineMs`, `src/WeatherView.fs`, `src/Weather.fs`.
- `scripts/rain-precip-pair-probe.mjs` and its running measurement.
- The retry in `docs/CC-CMD-2026-10-20-weather-first-call-connect.md` and option 4 in `docs/CC-CMD-2026-11-10-live-chip-refused-payload.md`: the owner's.
- The relay.
