# verify's weather step: the flag now reaches every call

CC-CMD: `docs/CC-CMD-2026-10-17-weather-live-http-outage.md`.
Files: `scripts/weather-live-check.mjs`, `scripts/mutation-check.mjs` (3
entries), `package.json` (`check:weather-live`), `.github/workflows/verify.yml`
(one `run:` line). Base: main `87292ed`.

## TASK 0, probed before editing

**0.2, the count.** The last 30 `verify` runs (oldest 2026-10-11T18:22Z,
newest run 39454054451, 2026-10-20T16:03Z), step conclusions read from
`actions/runs/{id}/jobs`:

| step | success | failure | skipped |
|---|---|---|---|
| Weather against the LIVE Open-Meteo API | 26 | 2 | 2 |
| Render check against the LIVE slate | 25 | 3 | 2 |

The two weather failures, with their annotations (`check-runs/{id}/annotations`):

| run | commit | created | annotation |
|---|---|---|---|
| 38984732123 | `5e65e87` | 2026-10-17T00:05Z | `Yankee Stadium: request failed — fetch failed` (the CC-CMD also quotes `Coors Field: HTTP 503` from the same run) |
| 39454054451 | `7505a58` | 2026-10-20T16:03Z | `Fenway Park: request failed — fetch failed` |

Both are in the venue loop, after the first call answered. Run 39437657525
(10-20, 14:16Z) hit the first-call case, and the flag tolerated it: that run's
weather step is one of the 26 successes. So 2 of 28 runs that reached the step
went red on Open-Meteo, about one in fourteen. Neither failing commit touched
weather. The 2 skips are runs whose build did not succeed.

The three render-check failures (39454054451, 39446347687, 39437657525) are all
the 2026-10-20 slate's venue coverage
(`docs/CC-CMD-2026-10-20-live-slate-venue-coverage.md`), not weather. **0 of
the 30** failed the render step on a weather outage.

**0.3, the render check.** `scripts/render-check.mjs`, under the same flag,
tolerates only `HOST_SILENT`: every Open-Meteo request the page made got no
response at all (`attributeWeather`, line ~233). If any request was answered
(`answered.length`), the verdict is `page`, and the step fails. That is
deliberate and written down: "a 429 is the host TALKING, not the host silent",
enforced by its enumerated `ATTRIB_CASES`. So a partial outage (one venue timed
out, the rest answered: the 10-17 `d9f2cce` shape, "Dignity Health Sports Park:
signal timed out after 8000ms") is meant to fail the render step. It was
**left unchanged**: in the last 30 runs it happened 0 times, and loosening it
would let "the host answered and a chip did not fill", the page regression
that branch exists to catch, through whenever any other venue was slow. If it
recurs, it gets its own CC-CMD with the count, not a change here.

## What was built

1. **Every call goes through one classifier.** A thrown request, a 429 or a 5xx
   is "did not answer". Under `--tolerate-unreachable` that call prints
   `::warning::Open-Meteo did not answer <what> (<why>)` and is not asserted;
   without the flag it is a failed check. This covers the first call, the
   out-of-range latitude probe, each venue, and the sign-flipped probe. Before,
   only a throw on the first call was covered.
2. **One deliberate departure from the CC-CMD's wording.** Task 1 says "a
   non-200 or a thrown request". That was narrowed to throw, 429 or 5xx. A 400
   or a 404 is the service answering that the request is wrong, which is
   evidence about the commit. Tolerating it would let a broken `forecastUrl`
   (400 on every venue) print `checked 0 of 45` and exit 0 for ever, which is
   the exact hazard the CC-CMD says must not reopen. A self-test case and a
   registered mutation pin this.
3. **The coverage line.** `checked N of M venues` is printed on every run, with M
   the table's length (SAMPLE-COVERAGE-A). When N is 0 under the flag the zone
   check is replaced by `::warning::no venue answered — checked 0 of M venues`,
   and the run exits 0. Without the flag the same run exits 1.
4. **The bad-latitude probe no longer passes on a 503.** "Not answered 200" was
   satisfied by a 503. A 503 there is now "did not answer", not a pass.
5. **`--self-test`**, with no network: a stub service answering by URL with the
   transcribed current block from `Suite.fs`. It runs ahead of the live check in
   both places: `verify.yml` (flag set) and `npm run check:weather-live`, which
   is what `drift-sentinel.yml` runs (no flag).

## The self-test (14 cases, all PASS)

```
PASS  healthy service, flag set: exit 0 (want 0)
PASS  healthy service, no flag: exit 0 (want 0)
PASS  a 503 on one venue, flag set: exit 0 (want 0)
PASS  the same 503, no flag: exit 1 (want 1)
PASS  one venue answering 200 with the WRONG zone, flag set: exit 1 (want 1)
PASS  a 400 on one venue is the service ANSWERING, flag set: exit 1 (want 1)
PASS  a 503 on the first call (Fenway), flag set: exit 0 (want 0)
PASS  the same first-call 503, no flag: exit 1 (want 1)
PASS  a 503 on the out-of-range latitude probe, flag set: exit 0 (want 0)
PASS  the same probe 503, no flag: exit 1 (want 1)
PASS  the sign-flipped probe unreachable, flag set: exit 0 (want 0)
PASS  the same sign-flipped probe, no flag: exit 1 (want 1)
PASS  every call unreachable, flag set: exit 0 (want 0)
PASS  every call unreachable, no flag: exit 1 (want 1)
```

The CC-CMD's four cases are rows 3, 4, 5 and 13/14. The 503-on-one-venue case
also asserts the warning names the venue and the line reads `checked 44 of 45`.

## Mutations (MUTATE-FIRST-A)

Run from a scratch harness that asserts each anchor occurs exactly once before
mutating. 8 of 8 were caught. The first run caught 6 of 7. **`no-flag
unreachable tolerated` survived:** every no-flag case still failed on the venue
loop alone. The probe and first-call cases above were added for that, and the
mutation was then caught.

| mutation | caught by |
|---|---|
| the old behaviour: the venue loop ignores the flag | a 503 on one venue, flag set |
| the old behaviour: a first-call 503 is a check failure | a 503 on one venue, flag set |
| loosened: every non-200 is "did not answer" | healthy, no flag; a 400 on one venue |
| loosened: a wrong zone tolerated | one venue with the WRONG zone |
| loosened: no-flag unreachable tolerated | the probe/first-call no-flag cases |
| the first call: unanswered replaced by a failed check | a 503 on the first call, flag set |
| the coverage line removed | 4 cases |
| the zero-coverage warning removed | every call unreachable, flag set |

Three of them are registered in `scripts/mutation-check.mjs`
(`weather-tolerance-first-call-only`, `weather-tolerates-any-non-200`,
`weather-unreachable-tolerated-without-flag`), and each `--only` run printed
PASS, so the suite re-runs them.

## Not verifiable here

This sandbox's proxy refuses `api.open-meteo.com` (`connect_rejected`,
measured this session). The live half runs on the runner. The done-condition
artifacts (the gate, the `verify` run on this commit, and a `drift-sentinel`
run) are recorded below as they land.

## Added after the venue table grew: one deferred retry

The venue commit took the table from 45 to 109 entries
(`outbox/cc-session-2026-10-20-venue-coverage.md`). Its first runner run with
this fix (verify run 39461805616, session branch) was green under the flag. It
also warned that 3 venues did not answer: Harbour Town Golf Links, TPC
Scottsdale and Muirfield Village Golf Club (table positions 99-101). A run
without this fix (39460984386) failed on the same three. Same names twice
looked venue-specific, so it was probed before anything was changed:

- `probe-url.yml` could not answer it. Its loop expands the URL list unquoted,
  so the `&` in an Open-Meteo query string backgrounds the command. It failed
  on Fenway too (runs 39462577622, 39462595315, 39462610425, 39462625259). That
  is a defect in that workflow, noted here and not fixed in this commit.
- A throwaway diagnostic on the session branch (run 39462746747, never on main)
  fetched the four venues alone, then all 109 in reverse order:
  - **Alone:** Fenway, Harbour Town, TPC Scottsdale and Muirfield each answered
    HTTP 200 with the declared zone, in 23-155 ms.
  - **Reversed:** a *different* 8 did not answer, in two clusters (#4-#7,
    #30-#34), all `UND_ERR_CONNECT_TIMEOUT` or a 20 s abort. **0 zone
    mismatches** among the 101 that answered.

So it is a transient connection window from the runner, not a venue, and not
an outage. 2 of 2 runs with 109 venues hit one. Without the flag (the
drift-sentinel), every such run would be red.

**The fix:** a venue that does not answer is asked once more, after
`retryPauseMs` (30 s; 0 in the self-test), when the first pass is done. If it
answers, it is checked like any other. If it does not, it is unanswered as
before, and the reason ends `, twice`. A full outage fails both passes, so the
sentinel still reports it. The run prints `retried N, M answered on the retry`.

Self-test: 16 cases. Two new ones: a venue refused once that answers the retry,
with no flag (exit 0, `checked 45 of 45`); and a venue whose retry answers with
the wrong zone (exit 1). Two more mutations were registered and caught:
`weather-retry-drops-deferred` and `weather-retry-unassessed`. The anchor of
`weather-tolerance-first-call-only` moved with the code and was updated; it
was re-run and caught.
