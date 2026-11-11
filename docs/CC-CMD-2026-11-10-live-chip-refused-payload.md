# Claude Code Command — verify's live-slate step went red on an HTTP 200 whose body the weather decoder refused

**Branch:** main — commit directly, do not create a feature branch or PR
**Repo:** field-laboratory
**Filed:** 2026-11-10 by CC, found when the verify run for `faa831d` failed on "Render check against the LIVE slate"
**Confidence gate:** `npm run gate` >= 95 before any commit
**Status:** PARTIAL 2026-11-11. Task 1 is approved (owner, 2026-11-11), built and landed (`e23288f`, gate verify-full 43020056001 530/530, on main by fast-forward `5f1ace27`), and run once: the run was `not-observable-dry`, so the three questions are not yet answered. The wet re-run is scheduled for Saturday 2026-11-14 (below, "Run 1"). The choice under "Options" still waits on a wet result and on the owner. The red itself was cleared by re-running the failed job (attempt 2 green; `deploy` run 42867015300 and `live-check` run 42867186531 green). The re-run is not a fix and is recorded here so it cannot read as a quiet pass.

---

## What was measured

Everything below is quoted, with run and job ids, in `outbox/live-chip-rain-refusal-2026-11-10.txt` (Rule 73: dates, methods and conditions are stated beside each block there).

On 2026-11-10 verify run 42863538303 (head `faa831d`, attempt 1) failed at one step, "Render check against the LIVE slate", at 17:23:08Z. The page asked Open-Meteo 16 times, one per ground the table knows on that day's slate. All 16 answered HTTP 200. Two bodies were refused by the decoder:

```
FAIL  every card whose venue the table knows carries a live chip
      → 16 known venue(s) on this slate, 14 chip(s) filled. ... The page reported: 2 venue(s) did not answer: The Kassam Stadium: Error at: `$`
The following `failure` occurred with the decoder: rain 0.1 exceeds precipitation 0 after 75ms, Broadfield Stadium: Error at: `$`
The following `failure` occurred with the decoder: rain 0.6 exceeds precipitation 0.3 after 74ms.
```

`The Kassam Stadium` is one of the nine rows `faa831d` added. `Broadfield Stadium` is not: it is an unchanged row, and the run before (`722e101`, 15 requests at 17:12:00Z) filled every chip with it in the set.

The same 16 requests, from a runner (`probe-url` run 42865237075, created 17:28:02Z), returned consistent pairs: 0 of 16 with `rain` above `precipitation`. The URLs equal the page's `forecastUrl` apart from `&format=csv`, 16 of 16. Broadfield read precipitation 0.30 and rain 0.30. The failed job re-run at 17:33:02Z passed the step at 17:37:54Z with 16 requests, and `live-check` on the deployed page passed it again at 17:41:05Z with 16.

Counted since the rule was written (2026-08-11), over every failing attempt of every run. The run lists equal the API's `total_count` (`verify` 425, `live-check` 1187), and a log the API no longer serves is counted as not readable, not as clean:

| step that failed | failing attempts | logs read | carrying the refusal | expired (HTTP 410) |
|---|---|---|---|---|
| `verify`, "Render check against the LIVE slate" | 44 | 44 | 1, this run | 0 |
| `verify`, "Weather against the LIVE Open-Meteo API" (`scripts/weather-live-check.mjs`, which decodes a real payload with the same rule) | 10 | 8 | 0 | 2 |
| `live-check`, "Render the deployed page and assert on it" | 109 | 100 | 0 | 9 |

That is a count of failures, not a rate. How many weather requests all runs made, passing runs included, was not counted.

## Related, read before building (BUILD-ON-A)

Searched 2026-11-10 by content (`exceeds precipitation`, `did not answer`, `carries a live chip`, `tolerate-unreachable`, `decodeReading`) in `docs/` and `outbox/`. No open CC-CMD covers a refused 200. Nothing here undoes a ruling or a hold of any of these:

- `docs/CC-CMD-2026-10-20-live-slate-venue-coverage.md` (DONE): the check must not become a quiet pass. Not touched.
- `docs/CC-CMD-2026-10-17-weather-live-http-outage.md` and `docs/CC-CMD-2026-10-20-weather-first-call-connect.md` (DONE): the node-side `weather-live-check` and HTTP failures. A refused 200 is neither.
- `outbox/cc-render-check-tolerate-open-meteo-2026-08-23.md`: the precedent. A third-party condition turned verify red ("A re-run went green."), and the answer was a narrow tolerance for a probe that proved Open-Meteo unreachable, in verify only. Not extended here without the owner.
- `docs/WEATHER-PROOF.md`, "Precipitation and rain cannot be compared as bare numbers": why the two are bound into one type. It says nothing about the values the API returns.
- `src/WeatherView.fs`, the comment above `maxInFlight`: a 429 was fixed by bounding the page's own requests, "rather than tolerating the 429". The same principle applies to the options below.

## Premises, and the one command that tested each (Rule 100)

| premise | the command | what it said |
|---|---|---|
| The red is `faa831d`'s change | `git show --stat --format= faa831d`; `git show b266e5f:src/Venues.fs \| grep -c 'at "Broadfield Stadium"'`; the `722e101` run's log | four files, none of them `src/Weather.fs`; 1 (a row before the commit); 15 requests, all filled, at 17:12:00Z |
| Open-Meteo's `current` block always has `rain` no larger than `precipitation` | the page's own decode at 17:23Z; 16 runner requests created 17:28:02Z | the decoder reported `rain` above `precipitation` twice (0.1 against 0, 0.6 against 0.3; the raw bodies were not captured); 0 of 16 five minutes later |
| The refusal is rare | the counts in "What was measured" | 1 of 44 failing attempts at `verify`'s live-slate step, 0 of 8 read at its weather step, 0 of 100 read at `live-check`'s render step. A count of failures, not a rate: the requests made by passing runs were not counted, and how many grounds a slate asks about depends on the slate (2026-11-10 asked about 16 of its 33 venue names) |
| The rule was a measured fact | `git show 8fc40c3` | the rule (`elif rain > total + 0.001<mm> then None`) arrived with `src/Weather.fs` on 2026-08-11 and its message gives a modelling reason ("Precipitation as one fact with rain contained in total"). It cites no measurement of how `rain` and `precipitation` relate in real payloads; it does describe `scripts/weather-live-check.mjs`, which decodes a real payload on a runner and carries the invariant. Whether a measurement exists in `field-playground` was not searched |

**Not known, and not claimed:** what the two refused bodies contained (the page reports the decoder's message, not the body; Task 1 records raw bodies); why the pair was inconsistent; whether it is per request, per location or per minute; whether the page's own request (it names no `models`, so which model supplies each variable is Open-Meteo's choice) is what permits it; what the page does on a later cycle after a refusal. Read: `src/WeatherView.fs` files a refusal as `Refused` and retries only `NeverAnswered` within one load (the comment above `retryTargets`: "A `Refused` is the host talking, and asking a 429 again is the burst bug wearing a different hat"), and `put` in `src/Weather.fs` caches only a `Reading`. Not read: whether a later render asks again.

## Task 1 — measure the pair over time, on a runner (unblocked, not approved)

Open-Meteo is unreachable from the session (403 at the proxy), so this runs on a runner, as `open-meteo-egress-probe.yml` does. A dispatch-only workflow and a script with a `--self-test` and registered mutations, each red by a named check (Rule 90). Imports `forecastUrl` and the venue table from `build/`, so the URL is the page's. Every 60 seconds for 30 minutes it requests every ground of a named slate date, records `time`, `precipitation` and `rain`, and on a violation (`rain` above `precipitation` by more than 0.001) records what a request with `models` set says for the same ground. Whether `current` accepts `models`, and what shape it answers, is the first command run before anything is written (Rule 68). Verdicts, none of them silent: `refusal-observed`, `none-observed-while-wet`, `not-observable-dry` (no ground reads any precipitation at the start; that is "not measured", not a pass).

**Done when:** the samples are in `outbox/` with `checked N of M expected samples` in the file's first line (Rule 91), the verdict is printed in it, and a paragraph under this task answers three things from the file: the per-request rate, whether a location stays inconsistent or flips, and which source supplied `rain` and `precipitation` in each violation. Cost: about 35 runner minutes and no change to `src/`.

### Task 1, run 1 (2026-11-11): dry, not measured

`rain-precip-pair-probe.yml` run 43026392230, slate 2026-11-11, 13:08:49Z to 13:38:00Z,
`outbox/rain-precip-pair-2026-11-11-2026-11-11T13-08-49.txt` and its `.jsonl` (every raw body):

```
checked 67 of 120 expected samples
VERDICT: not-observable-dry
slate 2026-11-11; 4 ground(s) x 30 round(s) every 60s
per-request rate of rain > precipitation + 0.001: 0 of 67 read responses (0.00%)
wet at the start: no; wet samples overall: 0
```

The four grounds were Oakwell, Scheumann Stadium, Kelly/Shorts Stadium and the Glass Bowl. Every read
response had 0 for both values, so **the three questions are not answered by this run**: a rate of 0
on dry readings says nothing about wet ones, no ground had anything to flip, and no violation needed
attributing.

**Seen, not this task:** 53 of the 120 requests (44%) failed before an answer (`fetch failed`, recorded
as status 0), spread across the whole half hour (per round: from 0 of 4 to 4 of 4) and across all
four grounds (7 to 17 each). That is a runner-to-Open-Meteo connection failure rate, not a decoder
refusal, and the probe kept only `e.message`, not `e.cause`, so its cause is not recorded. Whether it
is per-host rate limiting, a DNS or IPv6 path, or something else is not known. It is relevant to the
live-slate step's earlier reds in the 2026-10-17 and 2026-10-20 weather CC-CMDs, and is reported to
the owner rather than filed, because no cause was measured.

**Run 2:** Saturday 2026-11-14, the full English slate (most kickoffs 15:00 UK), dispatched at 14:20Z so
the 30 minutes fall before and around kickoff. Scheduled as this session's own follow-up.

## Options, for the owner, after Task 1

1. **Fix the request**, if the pair comes from mixed models: name the model so the body is internally consistent. A change to `forecastUrl` and its tests.
2. **State the rule the data obeys**, if the disagreement is real and bounded: replace `rain > total + 0.001` with the measured bound, and say in `docs/WEATHER-PROOF.md` where the bound comes from.
3. **Keep the rule and count the re-runs.** Each occurrence is about 7 minutes of runner time and a delayed deploy.
4. **Teach the gate** that a 200 refused as physically inconsistent is a third-party condition, as `--tolerate-unreachable` does for an unreachable host. A change to `scripts/render-check.mjs`, fenced off by the 2026-11-09 CC-CMD for the quiet-pass reason; it needs the owner's explicit ruling and a probe that proves the condition, as 2026-08-23 did.
5. **Retry a refused 200 body once**, if Task 1 shows a location's pair flips back within seconds. `WeatherView.fs` retries only `NeverAnswered` and gives the 429 as the reason a `Refused` is not retried. A refused 200 body is a different case, but the line is drawn at `Refused`, so this changes that ruling and is the owner's. The measurement is what would make it a fix rather than a fallback, as it was for the connect failures.

The recommendation is Task 1 first, because options 1, 2 and 5 each depend on a number nobody has, and 4 should not be chosen without it.

## Not in scope

- `scripts/render-check.mjs` and the live-slate check, until the owner rules on option 4.
- `src/Weather.fs`, until Task 1's result is in.
- The venue table and any sourcing work.
- The relay.
