# Spread-price landed on a second date; two soccer-odds asks regressed on it

**2026-08-28** · drift-sentinel run `33173538945`, probing `/context/date/2026-08-27`

## The scheduled question, answered

`CC-CMD-2026-08-25-spread-price-capture` reads **LANDED** on `/context/date/2026-08-27`
— a second **distinct probe date**, which was the whole criterion.

| observation | run | probe date |
|---|---|---|
| first | `33035197618` | `2026-08-26` |
| second | `33173538945` | `2026-08-27` |

The first was deliberately left open. 2026-08-26 is the first date the relay
could serve `homePrice`/`awayPrice` at all (`b3aae99`), so it was one
observation of a fact one day old. And two RUNS would not have been two
observations: `cc-cmd-followup.mjs` probes `yesterdayUTC()`, so the 01:30Z and
12:00Z runs on one day re-read one frozen snapshot — the substitution recorded
in `outbox/2026-08-26-two-runs-is-one-observation.md`.

Promoted `ASKS` → `LANDED`, `landed:` renamed to `holds:`, three-state predicate
and `mustFailOn` preserved verbatim. A regression is now **fatal** rather than
merely noted.

**The self-test was checked, not assumed.** Both
`CC-CMD-2026-08-25-spread-price-capture: declares a negative control` and
`: rejects its own negative control` still appear by name in `--self-test`
output after the move — 50/50. That check exists because on 2026-08-27 a
check-in claimed the lookup spanned both lists and it did so for the soccer ask
and **not** for closing-odds, which was still `ASKS.find` and silently stopped
being exercised. Spread-price is reached only by the generic
`for (const a of [...ASKS, ...LANDED])` loop at line 498, which spans both, so
this move could not repeat that.

## The bigger finding: two landed asks stopped holding on the same date

```
REGRESSED  CC-CMD-2026-08-23-soccer-three-way-odds
           landed 2026-08-26 — no longer holds on /context/date/2026-08-27
REGRESSED  CC-CMD-2026-08-21-closing-odds-capture (surviving ask)
           landed 2026-08-27 — no longer holds on /context/date/2026-08-27
```

Both are fatal entries, so the sentinel now fails every run.

**This is not an off-day.** Both predicates are three-state by design and return
`null` when no soccer moneyline is served at all, precisely so a Monday cannot
read as a regression. They returned `false`, which means soccer WAS served and
none of it carried what the ask promised.

The 2026-08-27 slate, from the sentinel's own line:

```
55 games — UEFA Europa Conference League Qualifying:23, UEFA Europa League
Qualifying:12, MLB:7, NFL:4, MLS:3, EFL Cup:2, La Liga:2, WNBA:2
spreads=9  both=0  notseq=0  moved=0  unmoved=0
```

**42 soccer games and 9 spreads across the whole slate.** So the odds capture
covered a small minority of a soccer-heavy day, and none of the soccer.

### What I have NOT established, and will not assert

Why. Three candidates, none measured:

1. **Coverage.** 35 of the 42 soccer games are UEFA qualifying. A book may not
   price those, in which case a soccer-heavy day is not an odds-heavy day and
   the predicate's phrasing — "any soccer game carries an opening line" — is
   too coarse for a slate dominated by a competition nobody prices.
2. **Budget.** The Odds API key was removed on 2026-08-25 (`0607526`) and the
   relay runs a shared daily ceiling. If the cron exhausted it before reaching
   soccer, this is a cost failure, not a code one.
3. **A real capture regression** in the relay's opening-odds path.

Candidate 1 would mean the ASK is fine and the PREDICATE is wrong — it would be
reading "the books did not price UEFA qualifying" as "the relay stopped
capturing soccer odds". That distinction decides whether anything needs fixing,
and guessing it is the failure this repository documents most often.

**Not fixed here, and not rationalised away either.** The sandbox cannot reach
`*.workers.dev`, so the next step is a probe that reads
`/context/date/2026-08-27` and reports, per soccer competition, how many games
carried an `opening_odds` blob at all. That is one CI run and it separates
candidate 1 from candidates 2 and 3 by itself.

Until then the two entries stay fatal and stay red. Downgrading them to make the
run green would be the exact move Rule 77 forbids.
