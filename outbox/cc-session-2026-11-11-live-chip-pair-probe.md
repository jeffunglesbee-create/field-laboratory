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
