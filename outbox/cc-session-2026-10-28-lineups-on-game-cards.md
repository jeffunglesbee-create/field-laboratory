# Session 2026-10-28 — a soccer card opens its own game's lineup

CC-CMD: `docs/CC-CMD-2026-10-27-lineups-on-game-cards.md`. Its relay half is DONE
(field-relay-nba `docs/CC-CMD-2026-10-27-bsd-event-id-on-game-rows.md`, deploy run
40607238843, live proof run 40608452953): a soccer row from `/context/date` carries
`bsd_event_id`, the id `/bsd/events/{id}/lineups` takes.

**Status of this document: written while the work is in progress.** Sections marked
PENDING are not claims. The final version replaces them with run ids.

## What was built

- `src/Desk.fs`: `Game.BsdEventId : string option`, decoded with
  `get.Optional.Field "bsd_event_id" Decode.string` beside `EspnEventId`. A missing key
  and a JSON null are both `None`; a number is refused by name (the row is counted in
  `Unnamed`, as every other undecodable row is).
- `src/LineupsView.fs`: `sourceForEvent pinned id` (pure) and `loadEvent mount id`.
  It resolves to the relay's per-event route, to a committed capture on a pinned page
  (`?data=`), to "no request" (a pinned page and an event with no capture, or an id
  that is not ASCII digits), and then calls the existing `load` or `renderRefusal`.
  There is no second sheet renderer.
- `src/Scoreboard.fs`: `lineupStateOf` (Joined / NotJoined / NotSoccer) and the card's
  lineup element between two markers. A joined card is a `<details data-lineup="joined">`
  that asks once, on its first open. A not-joined soccer card is a sentence,
  `data-lineup="not-joined"`, with nothing to open. A card that is not soccer carries no
  `data-lineup` at all. Click and keydown on the lineup stop at it, so a card that is
  itself a disclosure (the brief flip) does not turn over.
- `src/Laboratory.fsproj`: `LineupsView.fs` moved above `Scoreboard.fs`, which compiles
  before it and could not otherwise call it.
- `index.html`: card styles; the sheet is one column inside a card whatever the viewport.

## The capture and the probe

- `scripts/context-ids.mjs`: `join DATE` calls the relay's authenticated, idempotent
  `POST /admin/bsd-game-join` for a date outside the relay's rolling window; `coverage FILE`
  counts the soccer rows of a captured context that carry an id, prints the denominator, and
  fails below 90%, on zero soccer rows, or on an id on a row that is not soccer. Run on the
  committed 09-05 capture it reports `0 of 43` and fails, which is the point. Self-test 18/18.
- `.github/workflows/capture-context-with-ids.yml`: joins the date, captures it with the
  existing `capture-render-fixture.mjs`, and refuses to commit a capture whose soccer rows
  lack ids. No schedule; a trigger-file push or a dispatch. The commit goes to the ref that
  started the run.
- `scripts/lineups-card-probe.mjs` + `.github/workflows/lineups-card-probe.yml`: a real
  Chromium on the deployed page at 1000 and 390 px, screenshots of a joined card open and a
  not-joined card, and `outbox/lineups-card-manifest-*.json` of booleans. Self-test 14/14.

## Corrections to the CC-CMD as filed

1. **Event 220230 cannot be on a card.** It is Boyaca Chico v Cucuta Deportivo, a
   Colombian second-division match; the relay joins six soccer labels and none of them is
   that league. The pinned-capture table keeps both events because `data/PROVENANCE.md`
   records both captures, but only 5327 can occur on a row.
2. **Event 5327 is Charlotte FC v FC Dallas, 2026-10-10**, in the archive twice
   (`2026-10-10-mls-clt-dal` and `MLS_2026-10-10_e761852`), neither with an id: the relay's
   daily pass covers a rolling window and 10-10 is outside it. A capture of that day
   carries no ids until the relay joins it, so `scripts/context-ids.mjs` calls the
   relay's authenticated, idempotent join route for the date before capturing
   (`.github/workflows/capture-context-with-ids.yml`; the lab already holds
   `RELAY_SHARED_SECRET`, so no relay change was needed).
3. **A not-joined card is a sentence, not a closed `<details>`**: a disclosure that opens
   onto "there is nothing" asks for a click to say so.
4. **One real capture cannot show both states**, so the deployed-page probe uses two
   pinned pages: 2026-10-10 recaptured with ids (joined cards), and the committed
   2026-09-05, captured before the relay carried the field (every soccer card not-joined).
5. **No soccer row in either committed capture has a brief**, so no real soccer card is a
   disclosure of its own. The render check routes a labelled test brief onto one row to
   test that a lineup click does not turn the card; the probe reports the flip test as not
   applicable on the real capture rather than as a pass.

## Verified locally (2026-10-28, restored tree)

- F# suite 338/338 held (327 + 11 new, each with a must-fail input).
- `lineups-render-check.mjs` 71/71 against a locally served build, with the soccer cards
  of the 09-05 capture and `bsd_event_id` ROUTED onto three rows (a routed row is weaker
  evidence than a captured one; the manifest lists which rows). 43 of 43 soccer cards
  carry `data-lineup`, 0 of 83 others; lineup requests 0 before any open, 1 after the first,
  1 after a close and re-open; a joined card shows 2 sides and 40 of 40 rows marked.
- `check-lineups-pull-only.mjs` 14/14, now also scanning the card region of `Scoreboard.fs`
  and requiring the card's relay base to equal `Program.fs`'s. Its first run found my own
  type named `EventSource` and flagged it; renamed `LineupSource`.
- Ten mutations registered in `scripts/mutation-check.mjs` (`lineup-cards-*`), each run
  through the harness against the real checks: 10 of 10 caught (a null read as an id; a
  fetch on a not-joined card; a fetch on every re-open; a click that turns the card; a
  non-soccer card with an affordance; a soccer card with none; a pinned page that goes to
  the network; an id put in a URL unchecked; the relay base moving; a timer on the card).
- Self-tests: card lib 39/39, probe 14/14, context-ids 18/18, render check 14/14,
  pull-only 25/25.
- `computed-chrome-check` (done condition 5, run before landing) 25/25 on the page `verify`
  uses. On the two multi-sport captures it fails 2 of 25: `pk-sport__count` (the sport
  filter's count, 1.76:1 at opacity 0.60) and the declared-gap ledger saying
  `contrast:sport filter` is observable there. That is the "not observable" ledger working
  (docs/not-observable.txt; outbox/2026-08-26-not-observable-is-a-number.md), not this
  change: the check lists its unique offenders and none is a `desk-card__lineup` class.
  `device-chrome-check` 8/8.

## The capture (run 40620697737, commit `8b0cde0`)

`capture-context-with-ids` joined 2026-10-10 on the relay (`pending 53, written 48, ambiguous 0,
refusedKickoff 0, unjudgedKickoff 15, upstreamPages 9`) and captured it: **53 soccer rows, 48
carrying `bsd_event_id` (90.6%, floor 90%), 0 of 72 non-soccer rows carrying one.** Event 5327 is on
`2026-10-10-mls-clt-dal`. Five rows stayed unjoined and the route named them:
Alaves v Atletico, Barcelona v Getafe (La Liga), Augsburg v Bayern, Paderborn v Stuttgart
(Bundesliga), Monaco v Toulouse (Ligue 1). A card for each shows "No lineup source for this
game". That is the relay's name resolution missing clubs outside the two dates its aliases were
derived from, a relay finding and not a lab defect; it is filed separately.

## Findings while verifying

- **The first deployed-page probe photographed the wrong card.** Selecting the first open
  `details[data-lineup="joined"]` in document order picked St. Louis v LA Galaxy (event 5333),
  which has no committed capture and so draws "No request was made", not a team sheet; the check
  passed because the verdicts were about fetches and marks, not about which card was
  photographed. Found by reading the image. The probe now photographs the card of event 5327 and
  asserts the photograph is a confirmed sheet (`photographShowsASheet`, with the wrong case as its
  must-fail input), records which game it photographed, and takes the no-capture card as its own
  named screenshot.
- **Sticky page chrome was pasted across the middle of tall card photographs.** A card taller than
  the viewport is stitched, and the tab bar and date bar were captured mid-card. Fixed and sticky
  elements are set to static for the shot and restored; the manifest records how many.

## PENDING (not claims)

- `npm run gate` score and run id; `verify` on the branch and on main, run ids.
- `computed-chrome-check` run locally before landing.
- The deployed-page probe: screenshots at 1000 and 390 px and
  `outbox/lineups-card-manifest-*.json`.

## What this does not prove

The routed render check proves this renderer's treatment of a row, not the relay's join
(which the relay's own live proof covers: 43 of 43 and 41 of 41 rows on two dates). Only
event 5327 has a committed capture, so a joined card whose event has any other id is
exercised only as "no request on a pinned page", and its live behaviour (a request to the
relay's route) is not run by any check here.
