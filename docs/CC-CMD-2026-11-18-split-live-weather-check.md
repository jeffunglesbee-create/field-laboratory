# Claude Code Command — split the live weather check: correctness against recorded Open-Meteo bodies (gating), availability of the live host (reported, never gating)

**Branch:** main — commit directly, do not create a feature branch or PR (a branch is used only to carry a scored `verify-full`)
**Repo:** field-laboratory
**Filed:** 2026-11-18 by CC, on the owner's word ("Split the check", 2026-11-18), after a Rule 42 analysis and the per-round egress run
**Confidence gate:** `npm run gate` >= 95 before any commit
**Status:** DONE 2026-11-19. Landed on main `7d46564c` (verify-full 44405492528, 530/530) and `cfa9b7f8` (the reporter's budget, verify-full 44418656458, 530/530); all four done conditions read on main, below. Approved by the owner ("Split the check").

---

## Why (Rule 42)

Seven attempts since 2026-08-15 each fixed or described one symptom of the live weather chips failing on GitHub
runners: the fan-out bound (`217282b1`), the `--tolerate-unreachable` branch (`outbox/cc-render-check-tolerate-open-meteo-2026-08-23.md`),
the egress probe (2026-09-01), `docs/CC-CMD-2026-10-17-weather-live-http-outage.md`,
`docs/CC-CMD-2026-10-20-weather-first-call-connect.md`, `docs/CC-CMD-2026-11-10-live-chip-refused-payload.md`, and
`docs/CC-CMD-2026-11-14-weather-failure-cause.md` with its TLS stage. None found a defect in the page's weather code.

The per-round run of 2026-11-18 (`docs/CC-CMD-2026-11-14-weather-failure-tls-stage.md`, "Observed 2026-11-18") put the
failure on Open-Meteo's WEST address for a window of minutes: TLS to it stalled while TLS to EAST completed from the same
runner, and every unanswered request fell in that window. The shared assumption of every attempt was that CI must prove
the page's weather against the live host from a runner. This splits what the check proves.

## Every live weather call that can fail a workflow (Rule 39, mapped at filing)

| where | step | judged | after this |
|---|---|---|---|
| `verify.yml` (~1381) | `npm run check:live -- --tolerate-unreachable` (render-check, live slate, live weather) | gating, tolerant | live slate, **recorded weather**, strict; no tolerance flag |
| `live-check.yml` (~177) | render-check on the deployed page | gating, strict | deployed page, **recorded weather**, strict |
| `verify.yml` (~1422) | `weather-live-check.mjs --tolerate-unreachable` | gating, tolerant | **availability**: reported to the ledger, never gating |
| `drift-sentinel.yml` (~114) | `check:weather-live` | strict sentinel | unchanged (a sentinel, not the deploy gate) |
| `venue-source.yml` (~112) | `weather-live-check.mjs` | strict, dispatch | unchanged |

Not changed: render-check's default live mode (`npm run check:live` with no flag), which
`open-meteo-egress-probe.yml`'s fault-injected run depends on; the pinned render-checks (`check`, `check:hard`,
`check:render-sports`, `check:peak`), which do not reach the weather branch (`if (!pinned)`).

## Rulings and holds this touches (BUILD-ON-A)

- `docs/CC-CMD-2026-10-20-live-slate-venue-coverage.md`: the check "must not turn 'the table covers nothing on this
  slate' into a quiet pass". Kept: the venue-coverage assertion is independent of Open-Meteo and stays exactly as is,
  on the live slate.
- `docs/CC-CMD-2026-11-10-live-chip-refused-payload.md` option 4 was fenced as "needs the owner's explicit ruling"; the
  owner's "Split the check" is that ruling for `scripts/render-check.mjs`, recorded here.
- The same CC-CMD's option 3 ruling ("keep the rule and count the re-runs"): unchanged, and nothing here asks to change it.
  The decoder rule (`src/Weather.fs`, `rain > total + 0.001<mm>`) is untouched and is now also exercised on every run by a
  recorded refused body. A live refusal still reds the two jobs that run the live check strictly, `drift-sentinel.yml`
  (`check:weather-live`, daily) and `venue-source.yml`, through `the transcribed decoder reads the REAL response`
  (`scripts/weather-live-check.mjs`); those are re-run and counted in that CC-CMD's table as the ruling says. In verify a
  live refusal no longer reds anything, so there is no re-run there; its count is the `refused` field of
  `outbox/weather-availability.jsonl`. (Corrected 2026-11-18: an earlier draft said a live refusal reds nothing any more
  and asked the owner to confirm moving the count; `drift-sentinel.yml:114` and `venue-source.yml:112` refute that.)
- `src/Weather.fs`, `src/WeatherView.fs`, `attributeWeather`, `requestCapMs`, `slateDeadlineMs`: not touched.

## Premises, and the one command that tests each (Rule 100)

| premise | command | expected |
|---|---|---|
| The page's requests can be answered from recorded bodies in the browser without changing the page | a Playwright `page.route('https://api.open-meteo.com/v1/forecast**')` fulfil, run on the built page | chips fill from the recorded values |
| A recorded body from the page's own URL decodes as the page decodes live ones | the bodies in the pair probe's `.jsonl` were fetched with `forecastUrl` unchanged | 1,575 of them on 2026-11-18, all decoded by the probe's reader |
| A refused body leaves that venue without a chip and says so, without breaking the others | route one venue to a body with rain above precipitation | that chip empty, the page's account names the decoder's message, every other chip fills |

## Tasks

0. **Fixture.** `test/open-meteo-recorded.json`: real bodies from `outbox/rain-precip-pair-*.jsonl` (page URL,
   status 200), one per venue where recorded, a default for any other venue, and one real-shaped refused body
   (rain above precipitation). The file says where every body came from.
1. **render-check `--recorded-weather <file>`.** Route Open-Meteo to the fixture. The four chip checks run strictly
   (no `TOLERATE` branch in this mode), plus: every chip's temperature equals the one its routed body implies, and
   the venue routed to the refused body carries no chip while every other one does. Default mode unchanged.
2. **Workflows.** `verify.yml` live-slate step and `live-check.yml` render step pass `--recorded-weather`; the
   `--tolerate-unreachable` flag is dropped from the live-slate step.
3. **Availability.** `verify.yml`'s weather step becomes a report: it runs the live check, appends one record to
   `outbox/weather-availability.jsonl` (time, runner region, answered of asked, refused bodies with their message,
   unanswered by cause), writes the step summary and a `::warning::` when anything went unanswered or was refused, and
   exits 0 on any network outcome. A broken reporter (it cannot write its record) still fails the step.
4. **Mutations** for every new check (the laboratory's registry), each caught by a named check.
5. **Gate and landing:** scored `verify-full` on a branch, fast-forward, then the first `verify` and `live-check` on
   `main` read for the new lines.

## Done conditions

1. `verify` and `live-check` on `main` pass with the live-slate step printing the recorded-weather source and the chip
   checks PASS, on a run whose live host was not consulted (the step's own count of live Open-Meteo requests is 0).
2. A fault-injected run (Open-Meteo resolved to `192.0.2.1`, as `open-meteo-egress-probe.yml` already does) leaves the
   recorded-weather checks green and the availability record showing every request unanswered with its cause.
3. Removing the route (a mutation) makes the recorded-weather checks fail by name; routing a wrong temperature fails
   the temperature check; routing every venue to the refused body fails the chip-count check.
4. `outbox/weather-availability.jsonl` holds one record per `verify` run from the landing on.

## Built (2026-11-18)

- Task 0: `test/open-meteo-recorded.json`, 60 locations from `outbox/rain-precip-pair-*.jsonl` (page URL, HTTP 200), a default,
  and one refused body (precipitation 0.3, rain 0.6, the second refusal of verify 42863538303). Built by
  `outbox/open-meteo-fixture-build-2026-11-18.mjs`.
- Task 1: `scripts/render-check.mjs --recorded-weather <file>` (and `--recorded-slate <file>`, for the mutation gate only).
  Four new checks: no request reached the live host; each chip shows its recorded body's temperature (half to even,
  written independently of Fable's `round`); the refused location carries no chip; the page names the refusal and its venue
  in the decoder's words. The refused location is the first known card in page order, chosen only when the slate has two or
  more known locations; with one, a `::warning::` says the refusal was not exercised. The late node probe never runs in this
  mode. Default live mode unchanged.
- Task 2: `verify.yml` live-slate step and `live-check.yml` render step pass `--recorded-weather test/open-meteo-recorded.json`;
  `--tolerate-unreachable` is gone from the live-slate step.
- Task 3: `scripts/weather-availability.mjs`, reported, never gating; a `weather-availability` job in `verify.yml` (main only,
  `contents: write`) appends the record to `outbox/weather-availability.jsonl`. The `verify` job keeps `contents: read`.
- Task 4: seven `mutation-check.mjs` entries against `?date=2026-05-15` with `data/context-2026-05-15.json` (two known
  locations, S.C.G. and Marrara Oval), each run here first and red by its named check; `scripts/mutate-weather-availability.mjs`,
  11 of 11.

## Done conditions, read on main (2026-11-19)

1. verify 44415866628 (`7d46564c`) and 44428423540 (`cfa9b7f8`), live-slate step: `recorded weather:
   test/open-meteo-recorded.json ... live Open-Meteo requests: 0`, the four new checks PASS. MET.
2. open-meteo-egress-probe 44428435103 (`cfa9b7f8`, api.open-meteo.com resolved to 192.0.2.1): recorded-weather checks
   GREEN (0 live requests); the reporter, bounded, wrote `asked 32 of 552 ... 32 not answered; 520 not asked, the 60000ms
   budget spent`, cause `TimeoutError 32` (`outbox/weather-availability-fault-20261119T002309Z.jsonl`); the step took 70 s.
   MET. The first attempt, 44415881767 on `7d46564c`, kept the recorded checks green but the unbounded reporter hit the
   step's 10-minute timeout; that was a defect of this build, fixed by the budget.
3. Mutations: the seven `mutation-check.mjs` entries are scored in both gates; `mutate-weather-availability.mjs` 14 of 14.
   MET.
4. `outbox/weather-availability.jsonl`: one record per verify run on main from the landing, two so far (44415866628,
   44428423540), both southcentralus, 552 of 552 answered. MET, and it accrues by construction.

Observed, not concluded: in 44428423540 all 552 requests were answered, yet the egress read after them recorded TLS to the
system address (EAST, 167.114.211.86) as `stall`. One reading; the ledger will show whether it recurs.
