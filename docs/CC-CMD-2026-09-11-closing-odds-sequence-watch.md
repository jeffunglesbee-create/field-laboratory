# Claude Code Command — Automate closing-odds sequence verification

**Date:** 2026-09-11
**Repo:** field-laboratory
**Branch:** main — commit directly, do not create a feature branch or PR
**Type:** C (feature — automated verification)
**Why a CC-CMD:** `scripts/` is not in this repo's WRITE_ALLOWLIST (`docs/`,
`HANDOFF.md`, `CODE_MAP.json`). Chat cannot edit the sentinel directly.

## CONTEXT — what was measured, and what is not yet watched

`docs/ODDS-PROOF.md` records that on 2026-08-09 `closing_odds` was not a closing
line: the "closing" snapshot was captured ~22 seconds BEFORE the "opening" one,
from the same adapter, identical across moneyline, spread and total. One
snapshot written to two columns.

The relay has since fixed this. `src/ambient-do.js` `_captureClosingOdds` fires
on the pre->live transition and `UPDATE`s `WHERE closing_odds IS NULL`, so a real
close cannot be overwritten.

Measured live on 2026-09-11 via `/context/date/{date}`, `games.regular`:

| date | rows | both odds | identical ML | different ML | opening only | no odds |
|---|---|---|---|---|---|---|
| 2026-09-10 | 22 | 5 | 3 | 2 | 0 | 17 |
| 2026-09-08 | 28 | 14 | 10 | 4 | 0 | 14 |
| 2026-09-06 | 42 | 19 | 14 | 5 | 7 | 16 |

`captured_at` now separates correctly: `10:01:27Z` opening vs `11:55:36Z`
closing. Real movement observed, e.g. `MLB_2026-09-10_e401816887`
`-131/109 -> -126/105`.

**Nothing watches this.** If the capture regresses to writing one snapshot to two
columns, or `_captureClosingOdds` silently stops firing, the only signal would be
someone re-running this measurement by hand.

## THE TRAP THIS MUST NOT FALL INTO

`outbox/2026-08-27-closing-odds-promoted-on-a-second-date.md` records the exact
failure this check could repeat: two consecutive sentinel runs both read LANDED
and both probed the SAME date, because `cc-cmd-followup.mjs` uses
`yesterdayUTC()` and the 01:30Z and 12:00Z runs resolve to the same yesterday,
while `opening_odds` freeze at capture.

**Two reads of a frozen snapshot is one observation.** Any criterion here must be
satisfied by two DISTINCT probe DATES, not two runs.

Also recorded there: the cron is `30 1 * * *` and `0 12 * * *`, NOT the "~02:30Z"
that observed run times suggested — GitHub delays the 01:30 cron by up to ~93
minutes. Do not write a timing assumption into this check.

## TASK 0 — PROBE (read from HEAD, do not trust this document)

1. Read `scripts/cc-cmd-followup.mjs`. Record how `ASKS` and `LANDED` entries are
   shaped, how a probe is declared, and how the self-test looks entries up.
2. Confirm whether the self-test lookup uses `[...ASKS, ...LANDED].find` at EVERY
   call site. The 2026-08-27 outbox records that the soccer ask used the combined
   lookup (line 548) while closing-odds still used `ASKS.find` (line 487), and
   promoting an entry without fixing that "would have left `co` undefined and
   thrown — or worse, silently stopped exercising eight checks". Verify this
   is now uniform; if any site still uses `ASKS.find`, report it.
3. Re-run the measurement above for two distinct recent dates and record real
   numbers. Do not reuse this document's table as evidence.

## TASK 1 — Add the sequence check

Add an entry to the sentinel that, for each probed date, classifies every
`games.regular` row with BOTH `opening_odds` and `closing_odds` into exactly
three states — and reports all three counts, never a single pass/fail:

- `SEQUENCE` — `captured_at` differs and closing is LATER than opening
- `UNCHANGED` — `captured_at` differs correctly, moneyline identical
  (a true observation, NOT a defect)
- `NOT_A_SEQUENCE` — closing `captured_at` is missing, equal to, or EARLIER
  than opening (this is the 2026-08-09 defect returning)

The alarm condition is `NOT_A_SEQUENCE > 0`, not "identical moneyline".
`UNCHANGED` is the majority state (27 of 38 paired rows across the three dates
measured) and must never alarm.

Report `no odds` and `opening only` counts alongside, so a capture that stops
firing entirely shows up as paired rows going to zero rather than as silence.

## TASK 2 — Make the criterion date-distinct

The check is satisfied only when `NOT_A_SEQUENCE = 0` across **two distinct probe
dates**. Encode that explicitly; do not rely on run count.

## TASK 3 — Verification (inside this session)

Run the sentinel. Paste the real three-state census for both dates verbatim.
If `NOT_A_SEQUENCE > 0` on any row, name the game id rather than reporting a
count — the 2026-08-10 invariant bug was settled by naming the game.

## DONE CONDITION (verifiable probe output)

- Three-state census pasted for two distinct dates.
- Task 0.2 finding stated explicitly (uniform lookup, or the sites that are not).
- Commit SHA recorded.

## TASK 4 — Outbox manifest (last task)

`outbox/cc-session-2026-09-11-closing-odds-sequence-watch.md` with the Task 0
probe output, the census for both dates, the commit SHA, and an explicit
statement of what the check will and will not catch.
