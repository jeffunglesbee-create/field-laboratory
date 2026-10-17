# Claude Code Command — three comments assert a relay keying that has now been measured, and one of them is wrong

**Branch:** main — commit directly, do not create a feature branch or PR
**Repo:** field-laboratory
**Confidence gate:** >= 95 before any commit
**Filed:** 2026-10-16 by chat, read from `src/Program.fs` (blob `c5fc49e`) and `src/Desk.fs` (blob `d4b3f53`) at `70b8bd6`
**Status:** FILED, not started — not dispatched.
**Companion:** `field-relay-nba/docs/CC-CMD-2026-10-16-cfl-archive-date-keying.md` — the data fix. This CC-CMD is comments only and does not depend on that one landing first.

Comments only, in `src/*.fs`. No behaviour changes. Note that `src/**` is not in
`verify.yml`'s `paths-ignore`, so this costs one `verify` run; the three
corrections are bundled into one commit for that reason.

---

## What was measured

This repo's `Desk.fs` states the relay's `date` keying as a measurement from an
18-game slate. That measurement has now been re-run against the whole
`field-archive` table (`regular_season_games`, re-probed 2026-10-17T14:10Z),
per-row, against both candidate keyings rather than as an inequality:

| sport | rows where UTC day ≠ ET day | `date` = ET day | `date` = UTC day |
|---|---|---|---|
| MLB | 333 | 333 | 0 |
| MLS | 133 | 133 | 0 |
| WNBA | 104 | 104 | 0 |
| CFB | 100 | 100 | 0 |
| NHL | 76 | 76 | 0 |
| NBA | 35 | 35 | 0 |
| NFL | 34 | 34 | 0 |
| **CFL** | **13** | **0** | **13** |
| FIFA World Cup | 6 | 6 | 0 |

821 ET, 13 UTC, 0 ambiguous. The CFL rows are stamped one day ahead, primary
key included, by a writer that slices the vendor's UTC timestamp
(`field-relay-nba/src/index.js:8947`). They are being migrated under the
companion CC-CMD.

**The UTC count is a dated observation, not a constant.** It was 12 at
2026-10-16 and 13 at 2026-10-17: the writer is unfixed and accrues one row per
CFL game kicking off after 20:00 ET. Every comment below is therefore written
to name the mechanism and the measurement date, never a bare count that the
next late CFL kickoff falsifies. If the re-probe in TASK 0 returns a different
number, that is expected — what must hold is the shape: all UTC-keyed rows CFL,
none keyed as neither.

Separately: of 138 AFL rows, **138 have an empty `start_time`.**

---

## CORRECTION 1 — `src/Program.fs:48`–`49`, `viewedDate`

Current, verbatim:

```fsharp
/// The date being viewed. `?date=YYYY-MM-DD` makes any day linkable and
/// reloadable; today in UTC otherwise, matching how the relay keys its slates.
let private viewedDate () =
    queryParam "date" |> Option.defaultValue (Desk.fieldDayIso (Desk.fieldToday ()))
```

Both halves of the second clause are false.

1. **"today in UTC"** — the code calls `Desk.fieldToday ()`, which is ET via
   `dayInFieldZone`. The comment predates the `FieldDay` change that replaced
   `todayUtc()` and was not updated with it. The comment now describes the
   defect `FieldDay` was introduced to remove, directly above the line that
   removed it.
2. **"matching how the relay keys its slates"** — the relay does not key its
   slates in UTC, so even as a claim about the old code this was wrong. It keys
   on the ET day for 821 of 834 discriminating rows and on UTC for 13 (2026-10-17).

Replace with:

```fsharp
/// The date being viewed. `?date=YYYY-MM-DD` makes any day linkable and
/// reloadable; the FIELD-zone day otherwise.
///
/// Said "today in UTC" until 2026-10-16, which was wrong twice over: this line
/// has called `fieldToday ()` (ET) since `FieldDay` replaced `todayUtc()`, and
/// the relay it claimed to match does not key in UTC either. A comment naming
/// the exact zone the code below had stopped using survived because nothing
/// reads a comment. Verified against the relay's own data, not its source:
/// 821 of 834 archive rows whose UTC and ET days differ carry the ET day
/// (measured 2026-10-17).
let private viewedDate () =
    queryParam "date" |> Option.defaultValue (Desk.fieldDayIso (Desk.fieldToday ()))
```

---

## CORRECTION 2 — `src/Desk.fs:53`–`57`, the ZONE-PROOF measurement

Current, verbatim (the comment containing `Measured, not assumed: across a live 18-game slate`):

```fsharp
///   1. What zone does the relay's `date` column use? A property of the data.
///      Measured, not assumed: across a live 18-game slate, 8 games start on a
///      LATER UTC day than their `date` and none start earlier. The date runs
///      behind UTC, never ahead — Western-hemisphere keying, consistent with
///      ET and inconsistent with UTC.
```

The measurement is true and was correctly labelled as measured. Its conclusion
over-reaches: **it cannot see a UTC-keyed row.** A UTC-keyed row has
`date` = the UTC day of its own `start_time`, so it scores *equal*, not
*earlier* — and equal is also what correct ET keying produces for every game
that does not cross UTC midnight. "None start earlier" is therefore satisfied by
ET keying, by UTC keying, and by any mixture of the two. Twelve CFL rows were
UTC-keyed the whole time this comment stood.

Keep the measurement. Append what it establishes and what it does not:

```fsharp
///   1. What zone does the relay's `date` column use? A property of the data.
///      Measured, not assumed: across a live 18-game slate, 8 games start on a
///      LATER UTC day than their `date` and none start earlier. The date runs
///      behind UTC, never ahead — Western-hemisphere keying, consistent with
///      ET and inconsistent with UTC.
///
///      What that test CANNOT see, found 2026-10-16: a UTC-keyed row. Its
///      `date` equals the UTC day of its own `start_time`, so it scores EQUAL
///      rather than earlier, and equal is also what correct ET keying gives
///      every game that does not cross UTC midnight. "None earlier" holds under
///      ET keying, under UTC keying, and under a mixture — so it bounds the
///      direction of the offset and says nothing about which keying any single
///      row used.
///
///      The discriminating form compares each row against BOTH candidates:
///      `date = ET-day(start_time)` versus `date = UTC-day(start_time)`, over
///      the rows where those two differ. Run that way over the whole archive:
///      821 ET, 13 UTC, 0 ambiguous at 2026-10-17. Every UTC-keyed row was
///      CFL, 100% of CFL's
///      discriminating rows, from a writer that sliced the vendor's UTC
///      timestamp. Fixed under
///      field-relay-nba CC-CMD-2026-10-16-cfl-archive-date-keying, which also
///      adds the per-row guard this comment's test could not be.
```

---

## CORRECTION 3 — `src/Desk.fs:103`–`106`, `fieldDayOfIso`'s assertion

Current, verbatim:

```fsharp
/// This ASSERTS the relay's `date` is a FIELD-zone day, which the measurement
/// above supports for every sport observed with a start time. It is not proven
/// for the AFL: an Australian fixture lands in the small hours UTC either way,
/// so the test cannot discriminate there. Recorded rather than glossed.
```

Two problems, and the second is the more interesting one.

1. **"supports for every sport observed with a start time" is now falsified.**
   CFL rows carry a start time, were observed, and were UTC-keyed. The claim was
   true of the 18-game slate and was written as though true of the table.
2. **The AFL caveat gives a reason that is not the real one.** The stated reason
   is zone geometry — an Australian fixture lands in the small hours UTC either
   way. The actual reason is simpler and stronger: **all 138 AFL rows in
   `regular_season_games` have an empty `start_time`.** There is nothing to
   compare, for any fixture, at any hour. The zone-geometry argument would be
   the obstacle *if* the column were populated; it is not the obstacle today.

Replace with:

```fsharp
/// This ASSERTS the relay's `date` is a FIELD-zone day. Measured per row over
/// the whole archive on 2026-10-17: true for 821 of 834 rows whose UTC and ET
/// days differ, and FALSE for 13 — all CFL, stamped from the vendor's UTC
/// timestamp, primary key included, fixed under field-relay-nba
/// CC-CMD-2026-10-16-cfl-archive-date-keying. Until that migration lands this
/// function returns a day that is one ahead for a CFL game kicking off after
/// 20:00 ET.
///
/// The previous note here said the measurement supported this "for every sport
/// observed with a start time", which was true of the 18-game slate it came
/// from and not of the table.
///
/// Still unproven for the AFL, and the reason is not the one previously
/// recorded. It was given as zone geometry — an Australian fixture lands in the
/// small hours UTC either way. The real reason is that all 138 AFL rows have an
/// EMPTY `start_time`, so there is nothing to compare for any fixture at any
/// hour. Zone geometry would be the obstacle if the column were populated.
/// Recorded rather than glossed, and corrected rather than left plausible.
```

---

## TASK 0 — verify before editing (Rule 87, and this repo's probe-first rule)

The three comment bodies above are quoted from `70b8bd6`. **Re-read all three
sites** and confirm each quoted block still matches byte for byte. If any has
moved or changed, stop and report verbatim rather than editing by line number —
the line numbers here are from `70b8bd6` and are the first thing that goes
stale.

Then re-run the measurement the new comments assert, against live
`field-archive` (`cc49101c-0569-4d41-8e7a-be139cde4f26`):

```sql
-- shape, not count: every UTC-keyed row CFL, keyed_ET+keyed_UTC = the row
-- count for each sport, nothing keyed as neither. 821/13/0 at 2026-10-17.
SELECT sport,
  COUNT(*) AS discriminating_rows,
  SUM(CASE WHEN date = date(start_time,'-4 hours') THEN 1 ELSE 0 END) AS keyed_ET,
  SUM(CASE WHEN date = date(start_time)            THEN 1 ELSE 0 END) AS keyed_UTC
FROM regular_season_games
WHERE start_time IS NOT NULL AND start_time <> ''
  AND date >= '2026-03-09' AND date <= '2026-10-31'
  AND date(start_time) <> date(start_time,'-4 hours')
GROUP BY sport;

-- expect 138 / 138
SELECT COUNT(*) AS afl_rows,
       SUM(CASE WHEN start_time IS NULL OR start_time = '' THEN 1 ELSE 0 END) AS afl_no_start
FROM regular_season_games WHERE sport = 'AFL';
```

**If the companion relay CC-CMD has already landed**, `keyed_UTC` will be 0 and
the set will be migrated. That does not make these comments wrong — they
are written as history with a pointer to the fix — but CORRECTION 3's closing
sentence ("Until that migration lands…") must then be changed to past tense.
Check `field-relay-nba` HEAD for that CC-CMD's commits before deciding, and say
in the commit message which state you found.

`-4 hours` is sound for this probe only: every row in the table that has a
`start_time` falls inside the 2026 EDT band (table `date` range 2026-03-05 to
2026-11-07; rows outside 2026-03-08..2026-11-01 with a non-empty `start_time`
number zero). Do not carry that offset into any code.

---

## FORBIDDEN

- **No behaviour changes.** Not to `viewedDate`, not to `fieldDayAt`,
  `fieldToday`, `dayInFieldZone` or `fieldDayOfIso`. The mis-keyed rows are
  the relay's data defect and are fixed there. Adding a CFL special case, a
  tolerance, or a retry-on-adjacent-day here would hide a defect this repo does
  not own.
- **Do not add a 4am rollover to `fieldDayAt`.** The relay's `getFieldDateKey()`
  does roll back before 4am ET, which looked like a divergence worth closing.
  It is not reachable on the `date` column: the only writer that calls it sits
  inside a dead-hour gate (`isLiveHours = UTC hour >= 10 || <= 2`) whose dead
  band, UTC 3–9, contains the entire ET 00:00–03:59 rollback window under both
  EDT and EST. On this path the relay's keying is a plain ET day, which is what
  `fieldDayAt` already computes. Full trace in the companion CC-CMD.
- **Do not delete the 18-game measurement.** It was right about direction and
  honest about being a measurement. CORRECTION 2 adds its limit; it does not
  retract it.
- No PR. Commit to `main`. One commit for all three corrections.

---

## Why these three and not a lint rule

All three comments were accurate when written and became wrong without anyone
touching them: one was outlived by the code beneath it, one generalised a sample
to a table, one supplied a plausible reason for a real gap. None is a style
problem and no linter would flag any of them. What they share is a
cross-boundary claim — what *another repo's* column contains — recorded from
reading or from one sample, in a file that cannot execute against it. This
repo's own rule covers exactly that case: a cross-boundary fact is not verified
by reading. The companion CC-CMD's guard is where the check belongs, because
it is the only side that can run it.
