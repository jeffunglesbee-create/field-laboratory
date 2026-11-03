# Session 2026-11-03 — a soccer card's lineup on the live relay path: the probe

CC-CMD: `docs/CC-CMD-2026-11-03-lineup-card-live-path.md`, filed and built the same day. It exists because
`outbox/cc-session-2026-10-28-lineups-on-game-cards.md` says, under "What this does not prove", that the card's request to the relay's
per-event route "is not run by any check here": the pinned-page probe only reaches committed captures, and only event 5327 has one.

**Status of this document: the runner run is read (below); the landing is not.** The last section names what is still open.

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

## The runner run on the deployed page (read 2026-11-03)

`lineups-live-probe` run 41575192614 (push of the trigger file on the session branch, 03:56Z, success), manifest
`outbox/lineups-live-manifest-2026-11-03T03-57-23.json`, screenshots `outbox/lineups-live-1000-2026-11-03T03-57-23.png` and
`outbox/lineups-live-390-2026-11-03T03-57-23.png`. Page `https://field-laboratory.jeffunglesbee.workers.dev`, relay as served, `routed: false`.

- **The five days** (unpinned `/?date=D`, joined soccer cards of soccer cards): 2026-11-02 (today in ET) 8 of 8; 2026-11-01 27 of 27; 2026-10-31 43
  of 46; 2026-10-30 5 of 5; 2026-11-03 (tomorrow) 0 cards. No lineup request at any page load (0 across the five).
- **The day judged:** 2026-10-31, the one with the most (43). Five cards sampled: events 5405, 5399, 5394, 5401, 5403. Each made exactly one request,
  to `https://field-relay-nba.jeffunglesbee.workers.dev/bsd/events/<its own id>/lineups`, got HTTP 200, drew `confirmed`, two sides, every row marked
  (40 of 40, 40 of 40, 40 of 40, 39 of 39, 40 of 40). The side names the sheet drew match each card's game in all five (Atlanta United and Toronto FC; Vancouver
  Whitecaps and Seattle Sounders FC; Nashville SC and New York Red Bulls; Colorado Rapids and Chicago Fire; St.Louis City and San Diego FC), which is what a
  wrong-event wiring would not produce. Recorded, not judged: the two sources spell clubs differently.
- Re-opening the first card made no further request; 0 lineup requests were unaccounted for; no page error. **Verdict PASS: 5 of 5 sampled cards
  wired, 5 drew a sheet, answers `{"confirmed":5}`.** At 390 px the card of event 5405 is wired and drew `confirmed`.
- **The screenshots were read by eye.** Atlanta United v Toronto FC at 1000 and 390 px: the confirmed sheet with both sides, substitutes and unavailable
  players, the vendor's own timestamp (2026-11-03T03:04:31Z) at the foot, no page chrome pasted across it.

## A finding, not in this CC-CMD's scope

Three soccer rows in the window carry no `bsd_event_id`, all MLS, all on 2026-10-31: Portland Timbers v Houston Dynamo FC, New England Revolution v Inter
Miami CF, Los Angeles Football Club v Minnesota United FC (D1, ARCHIVE_DB, `bsd_event_id IS NULL` over 2026-10-30 to 2026-11-02, soccer labels only: exactly these three).
Their cards say "No lineup source for this game", which is the designed state. With the two rows from the relay's alias CC-CMD (San Diego FC v Philadelphia Union
2026-09-12; Los Angeles Football Club v LA Galaxy 2026-10-24) that is five MLS games with no BSD event, on three dates, and LAFC is on three of them while its game
against Vancouver on 2026-10-10 joined (event 5332): so it is not a spelling of LAFC. Cause unknown. Whether BSD omits those events or files them under another date is
one probe of its by-date listing away and is not done here.

## Still open

- Done: `verify` on the branch tip was green (run 41576124774). Its own gate FAILED on a date: run 41576121384 scored 500/530 = 94 because the outbox row asks for an entry named with the FIELD day at gate start, 2026-11-02 at 04:06Z, and this document is dated 2026-11-03; the mutation row failed with it (the outbox row is one of its baseline expectations). It was therefore not landed on that gate: the branch was merged into `gate-speed` (with the gate-speed CC-CMD's work, `outbox/cc-session-2026-11-03-gate-speed.md`) and gated after the day rolled over: runs 41627438202 (530/530) and 41630543901 (530/530, the landed tree). The trigger file was deleted before landing.
- Still open: the MLS finding above (one probe of BSD's by-date listing).

## What this does not prove

One day's slate and five cards of it, on the day the run was made; the relay's data on that day. It shows the page makes the right request and draws what it is
given. It does not show the relay has a lineup for every game (a card that honestly draws `served-empty` or `upstream-failed` is wired, and would not have been
seen here: all five drew a sheet), and it does not show a pre-match `predicted` sheet on the live path: no sampled card drew one. The routed run proves the code, not the live claim.
