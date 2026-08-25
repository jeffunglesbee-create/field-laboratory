# The D1 blocker was stated, not measured

**2026-08-25.** `CC-CMD-2026-08-25-misjoined-opening-odds` step 1 asks for a
credentialled `POST /d1/execute` to count how many rows carry another sport's
odds.

**It is not needed.** `/context/date` serves `opening_odds` verbatim and
publicly — which is how the three rows were found in the first place. The
blocker was written down, never checked.

Added as a second pass to `favourite-band-census`, so one workflow run answers
both questions over the same payloads.

## Two signals, and the range is derived

**Totals, against their own sport's median.** A row outside
`[median/2, median*2]` is an outlier by its sport's own distribution. Writing
"MLB totals are 5 to 15" would be a constant chosen to make the known-bad rows
fail — the shape this project refuses. The comparison comes from the data in
front of it, the same way `favouriteAgreement`'s threshold is the book's own
overround.

Per-sport is doing real work: `169.5` is normal for WNBA and a wild outlier
against MLB's `8.5`. A single global range would flag every basketball row.

**`captured_at` at finalisation, which needs no threshold at all.** An
`opening_odds` written at the instant the row was finalised is not an opening
line by definition, whatever the numbers say. One minute of slack covers the
write ordering between the odds fetch and the row update; it is not a knob.

## A zone bug the self-test caught

`finalized_at` is stored `2026-06-28 20:35:22` — space-separated, no zone.
`Date.parse` reads that as **local time** and shifts it by the runner's offset,
so a genuine match reads as hours apart and the signal vanishes on any runner
not set to UTC. Normalised to ISO-with-Z before parsing, with a self-test case
asserting the two spellings agree.

## Thirteen new self-test cases

Including the real values from both sides:

- `isTotalOutlier(3.5, 8.5)` → true — the 2026-06-28 rows
- `isTotalOutlier(10.5, 8.5)` → false — the high end of a real slate
- `capturedAtFinalisation('2026-06-28T20:35:24.440Z', '2026-06-28 20:35:22')` → true
- `capturedAtFinalisation('2026-08-09T10:01:24.241Z', '2026-08-09 20:16:03')` → false

The false cases outnumber the true ones on purpose: this reports rows as
suspect, and a false positive accuses good data.

## Unblock criteria (Rule 74)

- **Was blocked on:** a credentialled D1 query. That was wrong.
- **Now blocked on:** nothing. Dispatch `favourite-band-census.yml`.
- **Verify:** the committed census file carries an `ODDS PLAUSIBILITY` section
  with a count for both signals and every flagged row listed by id.
- **Then:** the CC-CMD's step 1 is answered without credentials, and its step 2
  (identify the writer) is the only part still needing the relay.
