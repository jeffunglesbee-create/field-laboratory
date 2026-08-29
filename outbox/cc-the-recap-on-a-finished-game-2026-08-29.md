# A finished game now shows the brief written after it finished

**Date:** 2026-08-29
**Scope:** `src/Journalism.fs` (new `BriefPhase`), `src/Desk.fs` (`briefsByGame`)

## The measurement this rests on, and the one it replaces

An earlier entry in this session
(`cc-two-clients-two-briefs-2026-08-29.md`) reported that `Desk.fs`'s
`List.tryFind` picked the live-state brief on **10 of 10** final games. That
number was taken from a truncated capture — `/archive/query` clamped `limit` to
50 and the capture asked for 100, so six of seven dates were short.

With paging landed (relay `e1b7ed1`), the same window holds **667 briefs, not
336**. 2026-08-27 alone has 143, not 50. Re-measured on complete input:

```
FINAL games carrying both a during-play and an after-play brief: 199

  payload order (tryFind, today)  picks the after-brief: 188 / 199
  newest created_at               picks the after-brief: 190 / 199
  newest updated_at               picks the after-brief:   0 / 199
```

Two corrections fall out of that:

1. **Today's behaviour was 94.5% right, not 0% right.** The 10/10 reading was a
   truncated sample.
2. **`updated_at` is the worst possible key, not the fix.** It was the column
   this session went and taught the relay to serve, on the reasoning that
   `created_at` never moves on rewrite. It does move — 602 of 667 rows have
   moved — and that is exactly why it fails here: a `game_live` row is rewritten
   in place on every cron tick while play continues, so its last-written time
   overtakes the recap's and stays ahead. Sorting by it picks the live brief
   every single time.

## So this is not an ordering key

Every one of the 199 carries **exactly one** after-play brief:

```
how many after-play briefs each of the 199 carries: { '1': 199 }
```

There is no tie to break. The rule is: on a finished game, prefer the after-play
brief; otherwise, payload order, unchanged.

## What is phased, and what deliberately is not

`BriefPhase` classifies only the three types the measurement covered:

| | |
|---|---|
| `DuringPlay` | `pre_game`, `game_live` |
| `AfterPlay` | `game_recap` |
| `NotPhased` | everything else, including `Unmodelled` |

`mlb_game` and `night_owl` look like obvious after-play types. They are not
classified, because **neither carries a `game_id` that joins to a game row** in
this capture — they never reach this selection, and giving them a phase would be
a guess wearing a fact's clothes. `game_brief` appears 9 times on final games
and its prose does not separate cleanly, so it stays unphased too.

`NotPhased` is the safe answer rather than the ignorant one: an unphased brief
is neither preferred nor demoted, so those types behave exactly as they do
today.

## The artifact (Rule 90)

Measured through the real decoders and the real `briefsByGame`, on
`data/brief-recency-corpus.json`, by stashing the change and rebuilding:

```
BEFORE   239 final games | game_recap 189 | game_live/pre_game 40 | unphased 10
AFTER    239 final games | game_recap 200 | game_live/pre_game 38 | unphased  1
```

**+11**, matching the 11 games identified as misses. The 38 that still show a
during-play brief are finals with no `game_recap` among their matches at all —
there is nothing better to show, and the fallback is correct.

### A harness that lied three times first

The first three attempts at this measurement returned `0` for everything.
`briefsByGame` takes F# lists; `Array.from(...)` handed it JS arrays, and
Fable's `filter`/`choose` return empty on those without erroring. The compiled
`build/Desk.js` is what settled it — `filter((brief) => briefKeyMatches(g,
brief), usable)` is a list function, and `briefKeyMatches` called directly in a
plain loop matched 271 of 310 games while the same data through `briefsByGame`
matched none. Reading the compiled output, not the F#, is what separated "my
change is broken" from "my harness is broken."

## Verify

```
npm run check              17/17    npm run check:nav          25/25
npm run check:hard         17/17    npm run check:brief-flip   20/20
npm run check:render-sports 17/17   npm run check:journalism   31/31
npm run check:unnamed       9/9     npm run check:scoreline     3/3
```

`briefsByGame` has one caller — `Scoreboard.fs:541`.
