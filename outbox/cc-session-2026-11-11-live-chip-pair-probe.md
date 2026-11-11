# Session 2026-11-11 — live-chip Task 1: the rain/precipitation pair, sampled on a runner

Session: https://claude.ai/code/session_01CggeNbCfJwZGqP88Ttq7r2
Task: the owner's "approve live-chip Task 1" for `docs/CC-CMD-2026-11-10-live-chip-refused-payload.md`.

## Task 0 first (Rule 68): does `current` accept `models`, and what does it answer?

Run before anything was written, on a runner, because Open-Meteo is unreachable from the dev
sandbox (curl from the sandbox returned `000` on 2026-11-11T05:00Z, the CC-CMD's 403 still holds).
`probe-url` run 42963031074 (2026-11-11T05:01:55Z), Broadfield Stadium (51.0996, -0.1948):

| request | HTTP | `current` |
|---|---|---|
| the page's `forecastUrl` | 200 | 599 bytes, the seven variables the page asks for (body cut at 400 bytes by the workflow) |
| `current=precipitation,rain,showers&models=best_match` | 200 | precipitation 0.00, rain 0.00, **showers 0.20** |
| `...&models=ecmwf_ifs025` | 200 | 0.30 / 0.30 / 0.00, grid 51.0, -0.25 |
| `...&models=icon_seamless` | 200 | 0.10 / 0.10 / 0.00, grid 51.0947, -0.1863 |
| `...&models=gfs_seamless,ukmo_seamless` | 200 | 0.00 / 0.00 / 0.00, ONE set of values for two models |

So: `current` accepts `models` and answers the same shape; each model answers from its own grid
point; two models in one request answered one set, so the probe asks each model alone. The default
body that morning had `showers` (0.20) larger than the `precipitation` it is part of (0.00). That is
one body, a lead for "the default mixes models per variable", not a finding.

A first `probe-url` dispatch (run 42962900857) failed at `bash` before any request: the workflow
splices `${{ github.event.inputs.urls }}` into the script, so an unquoted `&` in a URL is a shell
operator. The 2026-11-10 session got through by quoting each URL inside the input, as did the second
run. Recorded, not changed: interpolating a dispatch input into `run:` is also a script-injection
shape, for whoever can dispatch.

## What was built

- `scripts/probe-rain-precip-pair.mjs`. The grounds are the slate's game venues (relay
  `/context/date/<date>`, the `venue` field `Desk.fs` decodes) that the venue table knows by exact
  name, with render-check's placeholder set excluded. Each request is `forecastUrl(Where)` from
  `build/Weather.js`, in waves of 4 (`maxInFlight` in `src/WeatherView.fs`). Every 60 s for 30 min it
  records `time`, `precipitation`, `rain` and the raw body of every response to a `.jsonl`; on a
  violation (`rain > precipitation + 0.001`, the decoder's own rule) it asks five models alone for the
  same ground and records which models' values equal the default's (a match, not a proof). The
  summary's first line is `checked N of M expected samples`; the verdict is one of
  `refusal-observed`, `none-observed-while-wet`, `not-observable-dry`.
- `scripts/mutate-probe-rain-precip-pair.mjs`: 12 mutations, each required to be red by a NAMED
  check of the self-test, on a copy (the laboratory's mutate-* pattern).
- `.github/workflows/rain-precip-pair-probe.yml`: dispatch only, inputs `date` and `minutes`; builds,
  runs the self-test and the mutations, samples, commits the two files with a landing check.

## Checks, run here

- self-test 25/25. Two of them read `src/Weather.fs` and `src/WeatherView.fs`, so the tolerance and
  the wave size are tied to the page's source, not copied from it.
- mutations 12 of 12, each caught by its named check. The first run said 0 of 12: the harness kept
  the self-test's output only when the child threw, and a self-test that exits 1 without throwing
  was read as "red, but not by the named check". Two mutations were then genuinely NOT CAUGHT (P4, a
  non-200 read, and P9, attribution against the wrong value), because their tests could not tell;
  both tests were strengthened.
- `check:mutate-copy --only probe-rain-precip-pair` 9/9, after matching its three conventions (the
  control line, the `N of N mutations caught` tally, a temp path through `realpathSync`, and the
  `UNMUTATED` word in the stop line).
- `check:workflows`, `check:script-orphans`, `check:secrets`, `check:harness`, `check:ignore-parity`:
  pass. `check:import-purity` (2/3) and `check:network-exempt` (0/5) fail identically on HEAD with
  these files stashed, and neither names them: they need a build or network this sandbox lacks.

## Not yet

The scored gate (`verify-full`, needs .NET and a browser) and the live run, then the three answers
under Task 1 in the CC-CMD.

## The gate went red for a reason outside this branch, and the harness hid which expectations failed

verify-full run 42964147134 (this branch, 116bb3c) and run 42967615166 (another session's
pipes-guard, without this commit) failed the same way: a mutation shard's baseline reported
`9 failing` / `10 failing` expectations on the unmutated tree, then `the build driver did not start:
the watched initial compile (101c68b36acaf790) is not the build that was there (...)`. The full job
scored 510/530 with the mutation row the only failure. Same runner image, runner, node, dotnet and
Fable as the last green gate (42947403479, aa71d3a, 02:38Z), and main gained no source change since.
Locally (no network, served build) shard 6's 36 expectations: 34 pass, 2 crash on this sandbox's
Playwright path.

Neither log names the failing commands: `mutation-check.mjs` records them only in a check printed at
the summary, and the driver failure calls `fatal()` first. Branch `gate-baseline-names` prints each
failing baseline command and its output tail immediately after the baseline line (7 lines), proved
here: one mutation whose expectation fails in this sandbox now prints
`baseline FAILING: $ node scripts/lineups-render-check.mjs (exit 1)` before the driver starts;
`--anchors` reads 0 stale. It is dispatched as a diagnostic gate after the other session's run ends.

**Cause, found by the other session and confirmed here from the shard 6 log (lines 230, 258, 261):**
not anything live, as I had suspected. The shard's first build hit Fable's known internal error
(`Thoth.Json.10.5.1/Types.fs(33,1) ... Object reference not set to an instance of an object`), and
the repeat printed `Skipped compilation because all generated files are up-to-date!` and
`build: worked after 1 repeat(s)`: it trusted the crashed output, so the baseline ran against a
broken build/ and the driver's digest check fired. Fixed on main in 4f0da01 (`build/` is cleared
before each repeat). With that base, this branch's gate (verify-full 43020056001 on 7ee50ba) scored
530/530 and landed on main by fast-forward (5f1ace27).

## Run 1 of the probe (2026-11-11): dry, so not yet an answer

Probe run 43026392230 on main 5f1ace27, slate 2026-11-11, 13:08:49Z to 13:38:00Z:
`checked 67 of 120 expected samples`, `VERDICT: not-observable-dry`, 0 violations in 67 read
responses, and every one of them read 0 for both rain and precipitation. Four grounds (Oakwell,
Scheumann Stadium, Kelly/Shorts Stadium, Glass Bowl). That is the verdict the probe exists to give
instead of a false pass: the three questions need a wet slate.

Also measured, not this task: 53 of 120 requests failed before an answer (`fetch failed`), spread over
the half hour and all four grounds. The probe kept `e.message` only, so the cause is not recorded.
Reported to the owner, not filed.

Run 2 is scheduled for Saturday 2026-11-14 at 14:20Z (the full English slate, kickoffs 15:00 UK).
