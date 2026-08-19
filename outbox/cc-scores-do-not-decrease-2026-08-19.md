# Outbox — the plan's one "no false positives" claim was almost all false positives

**Date:** 2026-08-19
**Ships:** `src/Scoreline.fs`, `scripts/scoreline-check.mjs`, three mutations,
`check:scoreline` wired into `verify`

## What this is

The first check in this project that tests a claim in **generated prose**
against the data it was generated from. 358 briefs joined to their game rows,
147 scoreline claims extracted, every one judged against a real final.

**Zero claim a score their game could not have reached.**

## The acceptance criterion was wrong, and the data said so immediately

`docs/JLAYER-PLAN.md`, Phase 4:

> The exact check this supports has **no false positives**: a brief saying
> "Orioles lead 4-2" must **match** `home_score`/`away_score` on its game row.

The first three joined briefs disprove it:

| brief says | game row |
|---|---|
| "Detroit currently leads 4-2." | Athletics 6, Tigers 8 |
| "this 2-2 tie through three innings" | Dodgers 2, Red Sox 3 |
| "a tight 1-1 deadlock" | Angels 1, Brewers 3 |

**Briefs are written mid-game. Rows carry finals.** Requiring a match would
report all three as fabricated — not a check with no false positives, but one
that is almost entirely false positives, because most briefs are written before
the game ends.

That is the second phase whose stated acceptance criterion turned out
unreachable against real data. Phase 2's was unreachable because the set
difference was empty; this one because the relation was wrong.

## The relation that actually holds

Scores do not decrease. A side with 4 runs in the sixth cannot have 3 at the
end. So an observed score is not equal to the final — it is **dominated** by it,
per side:

```
"leads 4-2"  vs final 8-6  ->  4 <= 8, 2 <= 6   consistent
"leads 9-2"  vs final 8-6  ->  9  > 8           impossible
```

That is a law of how scoring works, not a heuristic, which is what makes it
free of false positives where matching was not.

`src/Scoreline.fs` makes `Observed` and `Final` **separate private types with no
equality between them**. The only way to compare is `dominates`. The mistake the
plan made is a compile error here rather than a paragraph asking people not to
make it.

The comparison is also **unordered** — a brief may name either side first and
the join carries no reliable way to say which, so both assignments are tried. An
ordering mistake in the prose cannot become a false accusation of fabrication.

`Unsettled` is a third case, not a pass: a row with no final settles nothing,
and `Consistent` must never absorb it.

## The extractor was wrong four times

This is the hard part and it is where the work was.

A bare `/(\d+)-(\d+)/` reports **554 "scorelines", 157 not dominated — 28.3%**.
That reads as mass fabrication. It is not. Measured:

| match | what it actually is |
|---|---|
| `5-5-7`, `8-2-6`, `10-4-3` | three-part soccer records (W-D-L); a two-number regex eats the first two |
| `an 11-6 record` | a pitcher's win-loss record |
| `(23-9)` | a team's season record in parentheses |
| `96-79 win` | a real scoreline — but WNBA, an order of magnitude larger than the baseball rows beside it |

Filtering on a scoreline **cue** and refusing record-shaped numbers left exactly
one reported finding, and it was the extractor's fourth mistake:

```
claims 8-8, final Yankees 5 / Braves 4
  …The Yankees edged the Braves 5-4 on 08-08…
```

`08-08` is a **date**. The true scoreline 5-4 was extracted correctly and the
date beside it was extracted as a second one. The discriminator is the leading
zero — nobody writes a score as "08" — stated as a rule about notation rather
than a range, because a range would have to guess how large a score can be and
this corpus holds both `1-1` and `96-79`.

Final: **554 candidates → 147 claims, 0 not dominated.**

## A filter that aggressive has to be shown to still work

Discarding three quarters of the candidates is exactly how a check goes green
while proving nothing. Two independent demonstrations:

**The self-test**, 18 cases, pins every exclusion by the measured string that
produced it — the three-part record, the pitcher record, the parenthesised
record, the date — and asserts that a basketball-sized `96-79` still survives,
so the filter is not secretly a bound on magnitude.

**A planted fabrication in the real corpus.** Rewriting one brief's "leads 4-2"
to "leads 99-98" and running the real check:

```
FAIL  no brief claims a scoreline its game could not have ended from
      → game_recap_mlb_401816358 (game_recap, MLB): claims 99-98,
        final Athletics 6 / Tigers 8 — …Detroit currently leads 99-98.…
```

The corpus was restored; `git diff` on it is empty.

## Three mutations, so the gate defends the relation

| mutation | what it reproduces |
|---|---|
| dominance → equality | the plan's own shipped criterion; every mid-game brief becomes a fabrication |
| one assignment instead of two | a brief naming the away side first is falsely accused |
| `Unsettled` counted as checked | a game with no final reads as a clean, checked brief |

All three caught.

## Two non-vacuity checks, because the headline result is a zero

"No impossible scoreline" is free when nothing was extracted, and free again
when every game was unfinished. So the check asserts separately that claims were
extracted at all (147) and that they were judged against real finals (147, none
skipped as unsettled).

## What a pass does not mean, stated plainly

Not that the briefs are truthful. A claim that never occurred but happens to sit
under the final passes. Nothing here reads player stats, standings, park factors
or the pitcher lines that make up most of the prose. It checks scorelines
against the one fact the game row settles, and the fabricated-stat check the
plan describes still needs the prompts — which still need captures produced
where the credential lives.

The measured result is worth stating as narrowly as it deserves: across 147
scoreline claims in production briefs, **not one is arithmetically impossible
given how its game ended.**

## A date rollover the gate caught, correctly

This entry was first written as `-2026-08-18`. The gate row `this session wrote
its outbox` failed, because `GATE_DAY = fieldDay()` had rolled to **2026-08-19**
— the session crossed midnight in the FIELD zone (05:08 UTC is 01:08 ET).

Two of the outbox mutations then reported as broken rather than undefended:

```
FAIL  [outbox-missing] the mutation actually applies
      → `mv outbox/cc-*$(TZ=America/New_York date +%F)*.md …` left the tree
        unchanged. Nothing was tested — this is a broken mutation, NOT an
        undefended claim.
```

Their glob is date-based, so with no entry dated today they mutated nothing.
That distinction exists because of yesterday's no-op detection; without it both
would have read as "nothing defends this claim" and sent me hunting a
non-existent gap in the outbox rules.

Renamed to the day it is actually being committed. `fieldDay()` is right and the
entry was wrong.

### And one of them was still broken after the rename

`outbox-missing` started applying again. `outbox-stub` did not — it overwrites
today's entry with the word "stub", and that entry was **untracked**, newly
written and not yet committed.

The no-op detector compared `git status --porcelain` alone. Porcelain prints
`?? path` before and after; `git diff` never sees an untracked file at all. So a
mutation that rewrote an untracked file's contents was invisible, and the
detector reported it as broken when it had applied perfectly.

**That is the detector committing the error it exists to report.** It now hashes
the porcelain output together with the bytes of every untracked file.

Second time in two days that a git-based view of "the tree" turned out to mean
"the part of the tree git already tracks" — the exposed-secret scanner had the
same blind spot on 2026-08-18 and missed a credential in its own source because
of it.

## Verified

`npm run build` clean, zero F# warnings. `scoreline-check --self-test` 18/18,
real corpus 3/3. Three mutations caught, working tree clean afterwards.
`check:gate-rows`, `check:workflows`, `check:scoreline` pass.

No score is stated; the gate has not run against this tree.
