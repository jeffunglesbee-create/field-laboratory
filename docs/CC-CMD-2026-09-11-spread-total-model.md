# Claude Code Command — Model `spread` and `total`, and measure odds sport coverage

**Date:** 2026-09-11
**Repo:** field-laboratory
**Branch:** main — commit directly, do not create a feature branch or PR
**Type:** C (feature)

**Status:** FILED, not started. Blocked on `guards` being green in this repo.
Coverage figures below are dated 2026-09-11; re-probe before relying on them.

## CONTEXT

`docs/ODDS-PROOF.md` closes with an explicit limit:

> Nothing about `spread` or `total`, which are decoded by nobody. Only the
> moneyline is modelled.

That is the largest unmodelled surface in the odds layer. It matters for the
reason the doc already gives about moneyline shapes: `TwoNumbers` and
`Unbalanced` exist because handling only the shape the data currently takes
does not compile (`FS0025`), and the alternative is "a card rendering something
quietly wrong". `spread` and `total` have no such protection at all.

## MEASURED 2026-09-11 — odds coverage is a sport map, not a budget cap

Via `/context/date/{date}`, `games.regular`:

```
2026-09-10   MLS 9 rows / 0 odds      UCL 6 / 0     MLB 5 / 5
             NFL 1 / 0                CFB 1 / 0
2026-09-06   MLB 15 / 14              MLS 8 / 0     La Liga 4 / 3 (draw 3)
             Serie A 4 / 3 (draw 3)   Ligue 1 3 / 3 (draw 3)
             EPL 2 / 2 (draw 2)       Bundesliga 2 / 0
             CFB 3 / 0                CFL 1 / 1 (draw 0, correct — CFL has no draw)
```

Two findings worth carrying into the design:

1. **Three-way is correct wherever odds arrive.** Every European soccer row
   carrying odds carries a draw. The 2026-08-23 two-way finding no longer
   reproduces for La Liga / Serie A / Ligue 1 / EPL.
2. **MLS has gone from two-way to NO odds at all** — 0 of 17 rows across both
   dates. Bundesliga is 0 of 2 while four other European leagues get full
   three-way on the same date.

**CAUSE IS UNDIAGNOSED. Four hypotheses have been tested and killed:**

| hypothesis | status |
|---|---|
| map divergence starves MLS | **DEAD** — `ambient-do.js` holds `mls: 'soccer_usa_mls'` and has since `043f4d6`; the relay's own `odds-sport-keys.js` header says so |
| vendor does not cover it | **DEAD** — `/v4/sports` (zero-credit) lists `soccer_usa_mls` active, 88 of 88 sports active |
| quota exhaustion | **DEAD** — Odds API dashboard showed 44,235 of 100,000 credits used |
| game rows do not exist when the snapshot runs | **DEAD** — MLS has the LONGEST forward horizon of any sport (20 rows on 2026-09-12, 10 on 09-20, 15 on 09-26) and still gets zero |

**Do not assume a cause.** Untested candidates: `ambient-do.js:572` gates on
`info.state !== 'live'` so odds are fetched only for games already in progress;
the `_getOddsCooldown` low tier (180s, MLS is named in it); or
`/context/date` reading a different table than the ambient path writes to.

A chat session reported three different mechanisms as the cause before the
dashboard screenshot killed the third. **A mechanism that fits the evidence is
not a cause.** Diagnose before fixing; this CC-CMD does not depend on the answer.

## TASK 0 — PROBE (read from HEAD, do not trust this document)

1. Read the current `Odds` module and `ODDS-PROOF.md`. Confirm the moneyline
   model's actual case names before extending anything — do not assume
   `OneLine` / `TwoNumbers` / `Unbalanced` are current.
2. Sample real `opening_odds` payloads across at least three sports and record
   the ACTUAL shapes `spread` and `total` take, verbatim. Do not model from this
   document's description or from the API's documentation.
3. Re-run the coverage table above for two fresh dates and record real numbers.

## TASK 1 — Model the shapes that exist, and the ones that would break

Model `spread` and `total` as unions covering every shape Task 0.2 actually
observed, PLUS the degenerate shapes that would otherwise render silently wrong
— absent side, unbalanced pair, zero line, missing price. Follow the moneyline
precedent: a consumer handling only the common shape must fail to compile.

Add the `<!-- proof: FSxxxx -->` case to `ODDS-PROOF.md` demonstrating that
incomplete handling is rejected, and verify it via `scripts/proof-check.mjs`
rather than asserting it in prose.

## TASK 2 — Make sport coverage visible

The sentinel reports odds shape. It does not report which SPORTS get odds.
Add a per-sport coverage census to the drift sentinel log: rows, rows-with-odds,
rows-with-draw, per sport, per probed date.

Alarm condition: a sport that carried odds on a previous probe date and carries
none on a later one. MLS going 2-way -> none is exactly that transition and
nothing caught it.

Do NOT alarm on a sport that has never carried odds — that is a coverage
decision, not a regression, and an alarm that can never be cleared trains
people to ignore the next one.

## TASK 3 — Verification (inside this session)

Paste the real observed shapes from Task 0.2, the proof-check output for the
new FS case, and the per-sport census for two distinct dates.

## DONE CONDITION

- `spread` and `total` unions exist, covering observed and degenerate shapes.
- New proof case compiles-and-fails as claimed, verified by `proof-check.mjs`.
- Per-sport census pasted for two distinct dates.
- MLS appears with 0 odds, and the sentinel's transition alarm is demonstrated
  (or its absence explained).

## TASK 4 — Outbox manifest (last task)

`outbox/cc-session-2026-09-11-spread-total-model.md` with Task 0 shapes verbatim,
the census, the commit SHA, and an explicit statement of what remains unmodelled.
