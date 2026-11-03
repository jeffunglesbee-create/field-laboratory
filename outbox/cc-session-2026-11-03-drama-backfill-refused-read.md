# CC session — 2026-11-03 — the Drama backfill stored a refused read as a score, and the check that holds the fix

CC-CMD: `docs/CC-CMD-2026-11-03-drama-backfill-error-is-not-a-score.md` in field-relay-nba (script fix `961092d8`, reset `46dcb17c`, filing `66212686`, attribution `eaa83964`). Here: the check and its mutants (LAB-FIRST-A: new checks land in the laboratory; the relay keeps the script).
HEAD: `221d808` → this commit · Branch: main.

## Why

The owner's list of what could not be verified on 2026-11-02 named "the Drama backfill 403". Measured: relay run 41235124610 (scheduled, 2026-10-31T19:37:51Z) was refused once by ESPN's side for Bayern v Dortmund, the first ESPN request of the run, and the script's `catch` wrote `drama_peak = 0` for it. The relay writes `WHERE drama_peak IS NULL` and lists only NULL rows, so that 0 can never be replaced. D1 today: `drama_peak` 0, `drama_arc` `null`, beside five Bundesliga rows of the same day that hold 52 to 70. The same request answers 200 today (427,492 bytes). Why the refusal happened is not established; what made it permanent is.

## What changed here

| file | what it is |
|---|---|
| `scripts/check-drama-backfill.py` | runs the relay's `scripts/drama-backfill.mjs` and `scripts/reset-drama-refused-read.mjs` UNMODIFIED against a local copy of the relay routes they call (missing-queue list, the guarded write, the ESPN proxy passing an upstream status through, `/d1/execute`, the two recompute posts). The stand-in answers like the relay: `cf-ray` on every response and `X-RELAY-Error: espn-summary-<status>` on a non-OK ESPN answer. 8 scenarios, 97 checks (88 before the attribution change) |
| `scripts/mutate-drama-backfill.py` | Rule 90: 20 mutants of the backfill script (D16 to D20 hold the attribution) and 4 of the reset, each on a copy in a temporary tree (`src/` linked), each required to turn the named scenarios red |
| `.github/workflows/verify.yml` | new job `drama-backfill` (own job, relay main checked out unpinned at `.relay-src`, node 22, python 3.11) |
| `scripts/probe-espn-summary-reach.py` + `.github/workflows/espn-summary-reach-probe.yml` | added after the reset was refused (below). Dispatch-only, no schedule, no credits: reads the relay's `/espn-summary` route repeatedly from the runner it is dispatched on, each event cache-busted (a live read) and plain, and records status, `X-RELAY-Error`, `cf-ray` data centre, `cf-cache-status`, body start. Writes `outbox/espn-summary-reach-probe-<UTC>.md` |

## Verified, and what was not

| claim | status | evidence |
|---|---|---|
| a refused read (403, 429, 500, 503, dropped connection, body that is not JSON) writes nothing, is fetched once, and is scored by the next run | **VERIFIED** locally | check 97/97 on the fixed script, scenarios `refused_read` (40 checks) and `next_run_scores_it` |
| only a 404 or 410 stores the 0 mark, through the soccer, MLB and WNBA readers | **VERIFIED** locally | scenario `absent_event` |
| the check can be made to fail | **VERIFIED** locally | on the ORIGINAL script it is red with the 10-31 failure reproduced: `('...e4001', 0, None, 'stored')`; and 24 of 24 mutants caught (20 of the backfill, 4 of the reset), 79 s. The attribution assertions were red on the script before `eaa83964` (3 scenarios) and green after |
| the reset touches nothing unless the row is exactly the stored refusal, ESPN answers now, one row changes, and the row reads back NULL | **VERIFIED** locally | scenario `reset_row` and R01 to R04 |
| the workflows are valid | **VERIFIED** | `actionlint` exit 0 on `verify.yml` and on the relay's `reset-drama-refused-read.yml` |
| a missing ESPN event is a 404 through the relay | **MEASURED**, probe 2026-11-03 | `/espn-summary/sports/soccer/fifa.world/summary?event=1` and the MLB path both answered 404, body `espn-summary returned 404` |
| the lab check is part of CI and green | **VERIFIED** | `verify` run 41593904470 on `2a2119c`: jobs `verify`, `push-lands`, `claim-sweep`, `drama-backfill`, `patent-watch` all `success` (`gh run view --json jobs`) |
| the reset on the real row | **REFUSED BY DESIGN, 2026-11-03 ~07:05Z** | relay run 41593921289 printed `RESET ERROR: ESPN summary for 401884754 answers HTTP 403 through the relay: a reset now would only be refused again; not resetting`. D1 read 07:13:26Z: the row is unchanged (`drama_peak` 0, `drama_arc` `null`). At that moment the dev sandbox and the MCP probe tool got 200 for the same URL |
| the reset on the real row, second dispatch | **DONE, 2026-11-03 07:17:14Z** | relay run 41595295738: `[proof] ESPN summary 200 through the relay, 40 key events`, `[reset] changes=1`, `[after]` NULL / NULL. D1 read independently at 07:17:34Z: `drama_peak` NULL, `drama_arc` NULL |
| the relay's route and cache, as read | **READ FROM SOURCE** (relay `46dcb17c`) | `/espn-summary` forwards the query string to ESPN and allow-lists the path only; `relayFetch` (`src/cache-helpers.js`) caches successful ESPN answers only, 25 s, per data centre, keyed by the full URL; a non-OK answer is returned fresh as `espn-summary returned N` with `X-RELAY-Error: espn-summary-N`. So a 200 can be a copy and cannot show a live refusal; a cache-busted read can |
| the probe works | **MEASURED** from the sandbox, 07:12-07:13Z | 4 of 4 requests answered: cache-busted event 401884754 200 / 427,600 bytes / data centre IAD (so ESPN ignores the extra parameter there, and the event is not refused for every caller); no-such-event 404 with `X-RELAY-Error: espn-summary-404`; `/v2/games` 200 |
| the probe from a runner | **MEASURED**, run 41595006871, 07:14:35 to 07:15:54Z, image `ubuntu26 20261026.180.1` | 48 of 48 requests answered as expected, every one through data centre IAD (the sandbox's too): event 401884754 200 / 427,600 bytes in all 12 reads (6 cache-busted, 6 plain of which 3 were cache hits); the other two events 200; no-such-event 404 with `X-RELAY-Error: espn-summary-404` x6; `/v2/games` 200 x6. 39 of the 48 were live reads. No status other than 200 and 404 appeared |
| why the refusal happened | **NOT ESTABLISHED**: it is intermittent | refused 2026-10-31 19:37Z (first ESPN request of the run) and 2026-11-03 ~07:05Z (first ESPN request of the reset); answered at 07:12Z (sandbox), 07:14-07:15Z (runner, 9 live reads of the event), 07:17Z (reset, 40 key events). Neither refused request recorded `X-RELAY-Error` or the data centre, so whether ESPN, the relay or Cloudflare in front of it refused is unknown. Not a stable property of the event, of the runner, or of the data centre IAD |
| the next refusal can be attributed | **VERIFIED** locally; **NOT YET OBSERVED** live | relay `eaa83964`: the error line carries `X-RELAY-Error: ...; data centre: ...`; check and mutants D16 to D20 hold it. No refusal has happened since |
| the scoring run after the reset | **VERIFIED**, 2026-11-03 07:17:51Z | relay run 41595362453 (dispatch): `[ok] Bundesliga \| Bayern vs Dortmund (2026-10-31) [event=401884754] → drama_peak=62`, `0 errors, 0 deferred`. D1 read 07:18:13Z: `drama_peak` 62, `drama_arc` 64 characters starting `[52,52,52,52,52,52,52,52,37`. The run also marked two NHL/NBA games `[skip] → 0`, the existing rule for sports the script does not score (all 307 NHL and 174 NBA rows hold 0 or NULL, none scored) |
| the mutants after the relay's ratchet fix | **VERIFIED** | relay `72bbd45c` replaced the `\|\| ''` fallbacks in `servedBy` with explicit null tests: relay Repo guards on `eaa83964` (run 41596652432) failed the step "No absence-collapse site appears beyond the baseline", and on `72bbd45c` (run 41597429853) the job passed. D19 and D20 were anchored on the old expressions, so lab `4e3981d` re-anchored them. 24 of 24 caught against relay `72bbd45c`; lab `verify` run 41597443741, job `drama-backfill` `success` |
| `4e3981d` shipped without an outbox entry | **FAILED, mine** | `check:history` names it in `verify` run 41597443741 and `guards` run 41597663155, the one failed step in each. This row is the record the rule wanted; by the rule's design it does not pair with the commit. Cause measured in `docs/history-boundary.txt` (entry of 2026-11-03): the clone had no pre-commit gate installed. Moved past by the seventh boundary move |
| a scheduled run that meets a refusal leaves the game NULL | **NOT OBSERVED** | the stand-in proves the script; no real refusal has happened since the fix |
| the AFL reader | **NOT HELD** | it fetches ESPN directly; no scenario reaches it. It raises the same status error, and its failures are deferred by the same rule |

## Seen, not fixed (Rule 69)

- 35 other rows with `drama_peak = 0` in sports the script scores (MLB 30, WNBA 3, AFL 2): the stored 0 is the same for an unsupported sport, an empty reading, an AFL no-match and an error, so nothing proves them wrong. Listed in the relay CC-CMD.
- Serie A is soccer and `classifySport` returns `other` for it (100 rows at 0). Carried forward.
- A push to the relay alone does not run this job; the next laboratory push reads relay main.
