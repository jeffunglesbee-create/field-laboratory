# Claude Code Command — a coverage collapse cannot say whether supply failed or the rows were unjoinable

**Branch:** main — commit directly, do not create a feature branch or PR
**Repo:** field-laboratory
**Confidence gate:** >= 95 before any commit
**Filed:** 2026-10-18 by chat, read from `scripts/odds-coverage.mjs` and `scripts/drift-check.mjs` at `c9f3cee`
**Status:** FILED, not dispatched.
**Scope:** an annotation on an existing alarm. The firing rule does not change.

---

## What this is, and what it is not

`odds-coverage-lost` detects a real collapse and detects it well. This adds one
fact to what the alarm carries; it does not touch when the alarm fires.

**A larger claim was made and withdrawn.** Chat first read the log line
`cov=MLS:0/9` beside `MLS:no-start-time=8` and concluded the verdict was
computed from the per-game coverage field — that it "fires whenever some sport
has 0/N coverage", and was therefore daily noise. That was wrong. The verdict
comes from `transitions(series, today)`, and `scripts/odds-coverage.mjs:121`
(`export function transitions(series, current) {`) already guards every case
that reading accused it of conflating:

- an absent sport never fires — *"A sport with no rows at all is absent from
  the slate, not starved of odds"*;
- `MIN_ROWS = 3` on both sides, derived from the committed history rather than
  chosen, with `scripts/replay-odds-coverage.mjs` re-deriving the table on
  demand;
- repeats are suppressed by `state: 'new' | 'continuing'`, with the cost of not
  doing so on record — seven red runs and 43 unexamined checks behind them.

So the mechanism is careful and this CC-CMD is small. Recorded because a
corrected misreading is worth more in the file than a quiet deletion.

## The one fact the alarm does not carry

A collapse to 0% has at least two causes that the payload cannot distinguish:

1. **Supply failed** — the rows are joinable and the odds are not there.
2. **The rows were unjoinable** — they arrived without a `start_time`, so the
   join could not be attempted.

Both land as `withOdds: 0`, because `scripts/odds-coverage.mjs:39`
(`export function censusOf(games, labelOf) {`) counts every row and increments
`withOdds` only when an opening or closing price decoded. A row with no start
time is still a row, so it pulls the rate to zero exactly like a missing price.

Measured 2026-10-18, the two causes side by side in one verdict:

| sport | rows today | no `start_time` | coverage | which cause |
|---|---|---|---|---|
| MLS | 9 | **8** | 0/9 | unjoinable |
| NFL | 12 | 0 | 0/12 | supply |
| NHL | 2 | 0 | 0/2 | supply |
| Bundesliga | 2 | 0 | 0/2 | supply |

16 of those games have joinable rows and no odds. 8 could not be joined. One
word covers both. (MLS carries 419 of 662 rows with no `start_time` overall —
63% — which is why it is usually the sport in the morning entry.)

The information already exists one field away: `scripts/drift-check.mjs:311`
(`const KEYING = ['no-start-time', 'same-utc-day', 'starts-after-date', 'starts-before-date']`)
counts it per sport and prints `MLS:no-start-time=8` on the same log line. This
moves it into the alarm so the alarm is readable on its own.

---

## TASK 0 — verify before editing

1. Re-read the three sites quoted above and confirm each still matches.
2. `node scripts/odds-coverage.mjs --self-test` — **36/36** at filing.
3. `node scripts/replay-odds-coverage.mjs` — at filing: **30 readings, 9
   alarms, every one resting on 3+ rows on both sides.** Record that number
   before changing anything; TASK 4 holds you to it.
4. Confirm `censusOf` has exactly **two** call sites — `scripts/drift-check.mjs:372`
   (`coverage = censusOf(games, g => sportMeta(g.Sport).Label)`) and the
   self-test inside `odds-coverage.mjs` itself. The signature change is cheap
   only because it is enclosed; if a third caller exists, stop and report.
5. Confirm `scripts/odds-coverage.mjs` still imports **only** `./checks.mjs`.
   That matters in TASK 1.

---

## TASK 1 — `censusOf` learns the start-time gap, without learning about `build/`

Give `censusOf` a third parameter: a predicate that answers "does this game
lack a start time". **Do not import `dateKeying` into `odds-coverage.mjs`.**
That file is build-free today, which is why its 36 checks run without a Fable
compile; importing from `../build/Desk.js` would make its self-test depend on a
build, and in this sandbox that is a dependency on a NuGet fetch that is
blocked. The predicate is supplied by the caller:
`drift-check.mjs` already has `dateKeying` and already knows `no-start-time` is
tag 0.

The census entry gains `noStart`.

### The distinction that must survive

**When no predicate is supplied, `noStart` must be ABSENT — not `0`.** The
self-test's own call site passes two arguments, and "nobody asked" is not the
same fact as "no row lacked a start time". Defaulting to `0` would make an
unmeasured census indistinguishable from a clean one, which is the precise
failure this repo names Rule 99, inside the function being changed to report a
Rule 99 problem.

---

## TASK 2 — the alarm carries it, and says when it does not know

The payload from `transitions` gains `nowNoStart` and `lastNoStart`. Each may be
absent, and absent must render differently from zero.

`lastNoStart` will be absent for a long time, and that is expected, not a bug:
**all 30 committed readings in `outbox/odds-coverage-series.json` predate the
field.** Their sport entries are `{rows, withOdds, withDraw}`. `mergeSeries`
writes whatever the census holds, so new readings carry `noStart` from the
first run after this lands and historical ones never will.

**Do not backfill the series.** The readings are observations; editing them to
add a number nobody measured would be inventing data, and
`replay-odds-coverage.mjs` reads the committed file through
`git show HEAD:outbox/odds-coverage-series.json` precisely so a local run
cannot change the answer.

`scripts/odds-coverage.mjs:190` (`export const alarmLine = a =>`) appends the
annotation when known. Three renderings must be distinguishable:

- known and non-zero — the collapse coincides with an unjoinable slate;
- known and zero — the rows were joinable, so this is supply;
- not recorded — this reading predates the field.

---

## TASK 3 — the firing rule does not change

`MIN_ROWS`, `WAS_COVERED` and `COLLAPSED_TO` keep their values, and the
condition keeps its shape. **This annotation must not become a trigger.**

The reason is specific: `MIN_ROWS = 3` is pinned by a replay over the committed
history, and La Liga's `3/3` is the row that pins it — at 4 that alarm
disappears. Adding a dimension to the firing rule would invalidate the
derivation that number rests on, and the number is the file's own defence
against being red forever.

If the annotation suggests the rule should change, that is a separate CC-CMD
with its own replay. Report it; do not act on it here.

---

## TASK 4 — the regression that matters

**The alarm SET must be unchanged: 9 alarms over 30 readings, every one on 3+
rows both sides.** Only the payload is richer. `replay-odds-coverage.mjs` is
the test, and it must produce the same alarms before and after.

One trap when reading it: `odds-coverage.mjs`'s own header documents **six**
alarms over **16** readings — the state when `MIN_ROWS = 3` was derived. There
are 30 readings and 9 alarms now. The header is a derivation record, not a
current count, and anyone diffing the replay against it will think this change
added three alarms. Either leave the header alone and say so in the session
doc, or add one line distinguishing the derivation's 16/6 from today's 30/9.

### Also to update, because it will break

The self-test at `odds-coverage.mjs:286` asserts an exact rendered string
(`/18\/21 \(86%\) on 2026-09-05, now 2\/11 \(18%\)/`). Changing `alarmLine`'s
output breaks it. Update it deliberately and add a case for each of the three
renderings in TASK 2, including one asserting that **not recorded does not
render as zero** — the mutation that would otherwise pass.

---

## FORBIDDEN

- **Do not change when the alarm fires.** No new trigger, no threshold edits.
- **Do not import from `build/` into `odds-coverage.mjs`.** Its self-test runs
  without a compile and must keep doing so.
- **Do not default `noStart` to `0`.**
- **Do not backfill the 30 historical readings.**
- **Do not rename `odds-coverage-lost`.** The verdict word is in 30 committed
  readings and in the drift log's history; renaming it breaks the series a
  reader uses to see change over time. The annotation makes the word readable;
  it does not need replacing.
- No PR. Commit to `main`.

## Done condition

1. `odds-coverage.mjs --self-test` passes with the new cases, including the
   not-recorded-is-not-zero case, and still imports only `./checks.mjs`.
2. `replay-odds-coverage.mjs` reports the same 9 alarms on the same 30
   readings.
3. One live or replayed drift run shows an alarm line that names its cause, and
   one that says the cause is not recorded.
4. `npm run gate` unchanged or better — a regression condition, not the
   deliverable.
5. Session doc last (Rule 87, SELF-COMPLETE-A).

## Why this is worth one small change

The sentinel's own comments say twice that a signal nobody can act on becomes
wallpaper, and they cost that lesson seven red runs. This alarm is actionable
today only by cross-referencing a second field in the same line. Moving that
field into the alarm is the difference between "coverage collapsed" and
"coverage collapsed because the rows arrived unjoinable" — and the second is a
sentence someone can do something about.

---

## Evidence added 2026-11-02

Measured at `origin/main` `bc2f72f` by the read of the client, relay and laboratory outbox files. Nothing above is edited and the Status line is unchanged: this is evidence for the CC-CMD, not a start on it.

**1. The baseline in TASK 0 step 3 and TASK 4 is stale: re-record it before building.** `node scripts/replay-odds-coverage.mjs` now reads **45 readings and 12 alarms**, every one resting on 3+ rows on both sides, against 30 and 9 at filing. Reading 30 is 2026-10-18; the nine alarms of the filing (09-05 twice, 09-20, 09-27, 10-07, 10-11, 10-14, 10-15, 10-18) are the ones dated up to that day, and the three added since are all MLS: 10-25 (`1/8`), 10-29 (`0/9`) and 11-02 (`0/3`). TASK 4's condition is "the same alarms before and after, on the same readings". A builder who compares against 9 will see three alarms this change did not add, which is the trap TASK 4 already warns about for the header's 16/6. `odds-coverage.mjs --self-test` is still 36/36.

**2. TASK 0 steps 1, 4 and 5 hold on this commit.** The sites the CC-CMD quotes (`transitions`, `censusOf`, `alarmLine`, the asserted string in the self-test, `KEYING` and the `censusOf` call in `drift-check.mjs`) are at the lines it cites. `censusOf` of this module has exactly two callers: `drift-check.mjs` and the self-test inside `odds-coverage.mjs`. The other hits for the name are different functions (`censusOfField` in `odds-shape-census.mjs`, a private F# function in `src/Gravity.fs`). `odds-coverage.mjs` imports only `./checks.mjs`. No reading in the series has a `noStart` field yet.

**3. Both causes the CC-CMD names occur, and the drift log shows how often.** `outbox/drift-log.md` has 193 rows; 31 carry the status `odds-coverage-lost`. `drift-check.mjs` sets that status for any coverage alarm, new or continuing, and fails the run only for a new one. For each of the 31, the sports with 3+ rows and a rate under 0.31 were set against that sport's `no-start-time` count in the same row:

| runs | rows | what they are |
|---|---|---|
| 05:46 to 07:50 UTC | **19** | every one a slate of MLS games only, `cov=MLS:0/N`, with `MLS:no-start-time=N`: every row unjoinable (19 of 19). The latest: 2026-10-31 `0/15`, 2026-11-01 `0/5`, 2026-11-02 `0/3`. Supply was the cause in none of them |
| 15:43 to 21:38 UTC | 12 | 29 sport-instances (a superset of the sports that alarmed, since the rule also needs an earlier covered reading): **20 supply** (no row lacks a start time: NHL, NFL, CFB, La Liga and others at `0/N`), **5 mixed** (for example MLS `1/8` with 7 unjoinable), **4 fully unjoinable** (MLS `0/15`, `0/9`, `0/9`, `0/3`) |

So one status word covers a slate that never was joinable and a slate whose odds are missing, and the only thing that tells them apart is a second field on the same row. That is this CC-CMD's premise, measured fifteen days on.

**4. A firing-rule observation, reported and not acted on (TASK 3).** 19 of the 31 `odds-coverage-lost` rows are runs whose entire slate is unjoinable MLS rows. A census that left out rows without a start time would leave those 19 with no rows, below the 3-row floor (`measurable` needs `rows >= MIN_ROWS`), and they would not have alarmed. That is a change to when the alarm fires, which this CC-CMD forbids; TASK 3 sends it to a separate CC-CMD with its own replay. It cannot be replayed from the series, because no reading has `noStart` and TASK 1 adds it only for future readings. The drift log does carry `no-start-time` per sport per run, so a replay over the log is possible. Nothing more is proposed here.
