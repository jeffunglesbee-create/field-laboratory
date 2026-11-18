# Session 2026-11-18: the live weather check, split into correctness (gating) and availability (reported)

Session: https://claude.ai/code/session_01CggeNbCfJwZGqP88Ttq7r2
Task: the owner's "Split the check" (2026-11-18), after the Rule 42 analysis and the per-round egress run
(`outbox/cc-session-2026-11-18-egress-per-round.md`). Spec: `docs/CC-CMD-2026-11-18-split-live-weather-check.md`.

## Why

Seven attempts since 2026-08-15 each fixed or described one symptom of the live chips failing on runners; none found a
defect in the page's weather code. Probe run 44241127086 put the failure on Open-Meteo's WEST address stalling at TLS for
two minutes while EAST answered the same runner. A third party's network window is not evidence about a commit, so the
gate stops asking it, and the question moves to a ledger.

## What was built (branch `split-live-weather`)

| piece | what it does |
|---|---|
| `test/open-meteo-recorded.json` | 60 real bodies from the pair probe's `.jsonl` (the page's URL, HTTP 200), keyed `latitude,longitude`, a default, and one refused body (precipitation 0.3, rain 0.6) |
| `outbox/open-meteo-fixture-build-2026-11-18.mjs` | the one-off builder of that file; every body names its source file and time |
| `scripts/render-check.mjs --recorded-weather` | routes the page's Open-Meteo requests to the fixture; four chip checks strict; four new checks (0 live requests, temperature per chip, refused location empty, the page names the refusal) |
| `scripts/render-check.mjs --recorded-slate` | the relay's slate from a committed capture, so the mutation gate has a slate with two known locations |
| `scripts/weather-availability.mjs` | every table location once, the page's way; one record: answered, refused (decoder message), not answered by cause, region, system address and TLS to it; exit 0 on any network outcome, 1 if the record cannot be written |
| `scripts/mutate-weather-availability.mjs` | 11 mutations, each red by its named self-test check |
| `verify.yml` | live-slate step uses recorded weather (no tolerance flag); availability step plus a gating step for the reporter's own checks; a `weather-availability` job (main only, `contents: write`) commits the record |
| `live-check.yml` | the deployed page's render step uses recorded weather |

## Checks run here

- `render-check --recorded-weather` on the built page: all four new checks PASS, `live Open-Meteo requests: 0`, refused location
  S.C.G. The one FAIL, `no page or console errors`, is this sandbox's proxy refusing the relay, `statsapi.mlb.com` and the
  newspaper route (named by a `requestfailed` listener); the runner reaches them.
- Seven render-check mutations, run by hand here before registering, each red by the check it targets: route removed (live-host
  check), every location refused (chip count), refusal not served (refused-location check), wrong temperature (temperature
  check), live count blind (live-host check), decoder rule off in `src/Weather.fs` (refused-location check, after a rebuild),
  refusal message dropped (the page-names-the-refusal check, after a rebuild). Source restored and rebuilt after.
- `mutation-check --anchors`: 1987 of 1990 checked, 0 stale. Reporter self-test 18/18; mutations 11 of 11;
  `check:mutate-copy --only weather-availability` 9/9; `check:workflows` 71/71; `check:script-orphans` 3/3;
  `check:import-purity` 3/3; `check-push-lands.py` 27 loops OK; `check:citations` PASS.

Two defects were found in my own work by mutation, not by reading. First, the reporter's self-test printed only at its end, so a
request that threw crashed it before R4 could be read: R4 now runs first and the test stops there. Second, no case had a
refusal without an unanswered request, so "a refusal is not a warning" was not caught: O5 was added.

## Not yet

The scored `verify-full` on this branch, the fast-forward to main, then the done conditions read on main: `verify` and
`live-check` with the recorded-weather lines, a fault-injected run (Open-Meteo resolved to 192.0.2.1), and the first record
in `outbox/weather-availability.jsonl`.

The owner is asked one thing: a live refusal is now counted in the availability ledger instead of the 11-10 CC-CMD's re-runs
table. That is my reading of option 3, and it needs confirming.

## The first gate went red on my own commit (verify-full 44393366037, cancelled)

Five mutation shards stopped at their baseline: `2 of 54 distinct expectation(s) already failing`, namely
`egress-path-lib.mjs --self-test` and `no-launch-check.mjs --self-test`. Both read files this branch changed, and neither is in
the pre-commit hook, which is why the commit passed locally:

- `egress-path-lib.mjs` finds render-check's late-probe block by its exact text, and that line gained `!RECORDED`. The anchor
  now names the new line; 148/148.
- `no-launch-check.mjs` pins the browser guard's command count at 70. `weather-availability.mjs --self-test` is a 71st, and
  the pin says to change it with the step that adds one: `EXPECTED_COMMANDS = 71`, the self-test's literals tied to the
  constant moved with it (58/58), and the pin's own mutation (`no-launch-check-pin-constant-stale`) moved 70 to 71 / 69 to 70.
  The real check: `checked 71 of 71 commands`.

The run was cancelled once five shards had failed, to stop spending Actions minutes. Before the next dispatch, every one of the
113 distinct expectations in `mutation-check.mjs` is run here on this branch, and any that fails is rerun on main to tell a
regression of mine from this sandbox's network.
