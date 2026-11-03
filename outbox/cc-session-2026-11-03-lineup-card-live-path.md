# Session 2026-11-03 — a soccer card's lineup on the live relay path: the probe

CC-CMD: `docs/CC-CMD-2026-11-03-lineup-card-live-path.md`, filed and built the same day. It exists because
`outbox/cc-session-2026-10-28-lineups-on-game-cards.md` says, under "What this does not prove", that the card's request to the relay's
per-event route "is not run by any check here": the pinned-page probe only reaches committed captures, and only event 5327 has one.

**Status of this document: written while the work is in progress.** The runner run on the deployed page is not done; the section for it says
so and is not a claim.

## What was built

- `scripts/lineups-live-lib.mjs`: the pure verdicts. `candidateDates` (today in ET, three back, tomorrow), `pickDate` (most joined soccer
  cards; the earlier day wins a tie; none is no day), `pickSample` (joined soccer cards, one per event, document order, at most five),
  `cardVerdict` (exactly one request, to `https://field-relay-nba.jeffunglesbee.workers.dev/bsd/events/<that card's event>/lineups`, one of the nine
  `data-answer` values and not the pinned page's `not-requested`, and a sheet is two-sided with a mark on every row), `reopenVerdict` and
  `aggregate` (PASS only when every sampled card is wired, the re-open is quiet, nothing is unaccounted for AND at least one card drew a sheet;
  WIRED-NO-SHEET, FAIL and NOTHING-TO-JUDGE are not passes). Self-test 35 of 35, a must-fail input for every clause.
- `scripts/lineups-live-probe.mjs`: the browser half. Counts the joined soccer cards on each of the five days of the unpinned page
  (`/?date=D`), judges the richest, opens up to five of its cards one at a time, records per card the request URLs, HTTP status, `data-answer`,
  sides, rows and the team names the sheet drew beside the card's own game (recorded, not judged: the two sources spell clubs differently),
  closes and re-opens the first, and photographs the first card that drew a sheet at 1000 and 390 px. Self-test 6 of 6.
  `--routed` runs the same code against a local build with the relay answered from committed fixtures: development only.
- `.github/workflows/lineups-live-probe.yml`: a push of `outbox/.trigger-lineups-live-probe` or a dispatch; no schedule; commits the manifest and
  screenshots to the ref that started it; fails the job unless the verdict is PASS. A step in `verify` runs the two self-tests
  (`npm run check:lineups-live`).

## Verified locally (routed; not the CC-CMD's artifact)

- Against a local build with the relay's context and lineup routes answered from committed captures (5327 confirmed, the first other event
  predicted, the rest a 502): PASS, 14 of 14 checks, 5 of 5 sampled cards wired, answers `{"predicted":1,"upstream-failed":4}`, no request at page
  load, no request on the re-open, and the 390 px pass wired.
- **The check can go red, twice.** (1) `--mutate-double-request` makes the script itself request a card's route again during the re-open: FAIL,
  "5 requests before the re-open, 6 after", exit 1. (2) The page itself broken: `src/Scoreboard.fs`'s registered mutation
  `lineup-cards-fetch-on-every-open` (`if isOpen && not asked.Value then` → `if isOpen then`) applied, rebuilt, probe run: FAIL on the same
  check, "5 requests before the re-open, 6 after", exit 1. The source was restored and rebuilt; `git status` shows no change under `src/`.
- A routed screenshot, read by eye, showed St. Louis CITY SC v LA Galaxy with a sheet for Boyacá Chicó v Cúcuta Deportivo: the routed fixture is
  event 220230's capture answering event 5333. That is a property of the routing, and it is the reason the live manifest records the side
  names beside the card's game: a wrong-event wiring would look exactly like this, and the probe's URL check (the request names the card's own
  event) is what judges it.

## PENDING (not claims)

- The runner run on the deployed page: `outbox/lineups-live-manifest-*.json`, the screenshots, the verdict, the answers by kind.
- `verify` on the landing commit and a gate on the landing tree.

## What this does not prove

One day's slate and up to five cards; the relay's data on that day. It will prove the page makes the right request and draws what it is given,
not that the relay has a lineup for every game. The routed run proves the code, not the live claim.
