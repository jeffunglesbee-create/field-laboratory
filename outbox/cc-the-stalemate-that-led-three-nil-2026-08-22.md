# Outbox — the stalemate that led three–nil

**Date:** 2026-08-22
**Ships:** `Scoreline.contradictoryLevelClaim` + a fifth brief verdict in
`src/Scoreboard.fs`

## What the card said

Same slate as the cross-sport catch. Brentford v Spurs, EPL, live, a `game_live`
brief:

> Brentford leads Spurs 3-0 in the 58th minute at Gtech Community Stadium on NBC.
> … Both teams hold 0-0-0 records this season. **The game remains a 0-0-0
> stalemate in league standings.**

A side leading 3-0 in the 58th minute is not in a stalemate. The brief states the
lead and calls the game level in the same breath.

## The thing to get right: 0-0-0 is a record, not a score

The tempting wrong fix is to read "0-0-0" as a 0-0 game score and flag it against
the 3-0. It is not a score — it is a won-drawn-lost record, and treating it as a
score is the exact confusion the brief itself is making. The extractor already
refuses it: `scorelinesIn` drops any run of three or more hyphenated numbers as a
record (the same rule that keeps `6-5-6` out), so the **only** scoreline read from
this brief is the 3-0. The contradiction reported is the *word* "stalemate"
against that real 3-0 — never a record parsed as a score.

## The fix

A fifth brief verdict. `Scoreline.contradictoryLevelClaim text` fires only when
**both** signals are present:

1. a stated scoreline with a strict leader (`A <> B`, from the shared extractor),
   and
2. the word "stalemate".

When it fires, `Scoreboard.fs` renders a red chip:

```
contradiction — states a lead yet calls the game a stalemate
```

It reads the brief alone, which is the point: the game was live and its row
carried no final, so the existing scoreline verdict could only say "final not in
yet". This catch does not need the final — the two claims contradict each other.

## Why the word set is exactly one

"stalemate" is the whole set, on purpose:

- **"tie / tied / level / draw"** — excluded. They read correctly in a
  progression ("level at the half, now 3-0") and in the table ("level on points").
- **"scoreless / goalless"** — excluded. "leads 3-0 after a scoreless first half"
  is legitimate.
- **"deadlock"** — excluded. It is a scoreline cue ("1-1 deadlock"), so it belongs
  to a level scoreline, not to a separate assertion.

"stalemate" is not a scoreline cue and does not describe a half or a table, so it
never sits beside a stated lead by accident. Others join the set only when a brief
exhibits them with a disambiguation this clean.

## Verified

Build clean, zero F# warnings. `scoreline-check --self-test` 24/24 (five new: the
Brentford card is flagged; a clean lead, a genuine "1-1 deadlock", a "level at the
half" progression, and a bare 0-0-0 record are all NOT flagged). The corpus
census is unchanged (358 joined / 147 claims / 0 impossible). `unused-check`
passes — `contradictoryLevelClaim` is read by `Scoreboard.fs`. Site assembles.

## Not changed

- The two-window comparison on the same card ("3 shots this match trail
  Brentford's 37 goals this season") is a `FIELD_PROSE_STYLE` question, left to
  the relay — filed as defect 3 in
  `docs/CC-CMD-2026-08-22-brief-sport-contamination.md`.
- The relay should stop generating the contradiction; catching is not curing. The
  same CC-CMD carries that as defect 2.
