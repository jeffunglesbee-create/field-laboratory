# Outbox — One null side blanked the whole slate

**Date:** 2026-08-13
**Trigger:** `live-check` red on the deployed page, runs at `fc11e4f`, `3c1e1bd`, `8629021`, `f248d33`

## What was failing

```
Error at: `$.games.regular.[18].away`
Expecting a string but instead got: null
FAIL  card count matches decoded game count
      → decoded NaN, rendered 0
FAIL  the venue table covers at least one venue on this slate
      → no cards with a venue — none of them in the 37-entry table
FAIL  every card whose venue the table knows carries a live chip
      → 0 known venue(s) on this slate, 0 chip(s) filled
11/18 checks passed
```

`Desk.fs` decoded both game lists with `Decode.list gameDecoder`, which is
all-or-nothing, and `gameDecoder` took `home` and `away` as
`Required.Field ... Decode.string`. One row on the live slate arrived with
`away: null`, so the entire payload failed to decode, **zero cards rendered**,
and the four checks after it failed against a page with nothing on it.

The row is not malformed. PGA Tour rows carry NULL for both sides because a golf
event has no two teams — the relay's own duplicate-cleanup outbox records the
same fact from the other direction, noting that a dedupe on
`(sport, date, home, away)` would false-merge PGA rows precisely because both
sides are NULL.

So a correct row that this scoreboard cannot draw took down every row it could.

## Why neither obvious fix

**Crash on one** was the behaviour. A payload is a set of independent rows; one
row this desk cannot draw is not a reason to draw none of them.

**Invent a name** is what `Pick.fs:160` already does —
`Optional.Field "home" |> Option.defaultValue "—"`. That renders a card for a
matchup that does not exist, with a dash where a team should be, and nothing
records that it was made up. It is the fabrication this repo exists to refuse,
and it is worse than the crash because it looks like it worked. It was not
copied, and it is now a known defect on the Pick path rather than a pattern.

## The fix

Decode what can be decoded; **count** what cannot. `Decode.oneOf [ gameDecoder
|> Decode.map Some; Decode.succeed None ]` accepts an un-drawable row without
understanding it, and the count travels with the payload as `DeskPayload.Unnamed`.

`Program.fs` appends it to `decode-status` whenever it is non-zero — *"decoded 18
game(s) for 2026-08-13 · 1 row(s) not drawn — sides not named"*. Appended, never
folded into the game count, because `decoded N` is what every check parses and
turning a blank page into a wrong number is harder to notice than the blank page
was.

## What the check actually asserts

The failure mode of this fix is a **silent skip** — rows vanish and the page
looks healthy. So the assertion is not "it doesn't crash", it is the conservation
law:

```
rows submitted === games decoded + rows counted unnamed
```

`scripts/unnamed-check.mjs`, five slates across that law plus four specific
regressions. Two of them exist because the law alone is too weak: an
implementation that counts EVERY row as unnamed satisfies it and renders the
blank page again through the new code path, and an implementation that hardcodes
`Unnamed = 1` satisfies it on the failing case only. Postseason is asserted
separately because the original bug was in `regular`, and a fix applied to one
list and not the other would pass everything else.

## Teeth, measured

The pre-fix decoder was restored in place, rebuilt, and the check re-run:

```
old decoder: 3/9 checks passed
new decoder: 9/9 checks passed
```

Recorded because a check that has only ever run against the fixed code proves
nothing, and this repo's history is largely a catalogue of checks that passed
without testing what they claimed to.

One check — "a clean slate counts zero unnamed" — passes on both, because the
old code had no counter and `undefined === 0` was not what it compared. It is
kept: it is the assertion that stops the count becoming furniture that is always
on the page and therefore never read.

## Not fixed here

- **`Pick.fs`'s `defaultValue "—"`** invents team names on the pick path. Same
  payload, same NULL sides, different and worse handling. Left alone rather than
  changed in a commit about the desk decoder; it needs its own pass and a
  decision about what a pick card should do with an event that has no two sides.
- **Whether a golf event should render at all.** Counting it as un-drawable is
  correct for a scoreboard keyed on two teams. Whether the desk should grow a
  representation for field events is a design question, not a regression.

## Correction — the check's exit code was inverted

The first push of this work took `verify` red on `bd62427`, and the cause was in
the check, not the decoder.

`createChecks()`'s `summarize()` returns the **failure count** — 0 means
everything passed — and takes no arguments. The last line of
`unnamed-check.mjs` read:

```js
process.exit(summarize('Rows this desk cannot name') ? 0 : 1)
```

`0 ? 0 : 1` is 1. So the script exited **1 on a clean run and 0 on a broken
one**: it would have failed the build while the code was fine, and passed it
while the code was broken. It printed `9/9 checks passed` on the line directly
above the non-zero exit.

That is the same defect class this file's own header is about — a check that
returns a confident answer without testing what it claims — arriving in the exit
line while every assertion above it was sound. It also means the teeth
measurement recorded earlier (3/9 vs 9/9) was reading printed counts, which were
correct, while the pass/fail semantics underneath them were inverted.

Fixed to `summarize() === 0 ? 0 : 1`, matching `state-check.mjs` and
`zone-check.mjs`, and re-proven on the exit code rather than the output:

```
exit on GOOD code:    0
exit on BROKEN code:  1
exit after restore:   0
```

The passing count is not the contract. The exit code is.

## Second correction — the fix removed teeth from an existing check

`verify` failed again on `bd6ed5d`, and this one was a real regression the
mutation harness caught within a single run of the change:

```
FAIL  [decoder-rejects-real] the decoders actually accept the real captures
      → mutation SURVIVED — src/Desk.fs was broken and
        `run-row.mjs "decoders accept both real captures"` still passed.
        Nothing defends this claim.
```

Making the game list fault-tolerant made `payload decodes` a much weaker claim
than it used to be. Before, breaking `gameDecoder` failed the whole
`Decode.list` and `drift-check` reported it. After, every row maps to `None`,
the payload decodes fine with **zero games**, and every count downstream reports
cheerfully over an empty set. Demonstrated directly:

```
PASS  payload decodes                                  <- with a wholly broken decoder
FAIL  every game row in the capture is accepted as a game
      → 2 row(s) in the file, 0 decoded, 2 un-nameable
```

`payload decodes` still passes. That is precisely why the mutation survived.

**The conservation law is not enough here, and it is worth stating why.** A
broken decoder maps every row to `None`, so `games + unnamed === rows` balances
perfectly at zero games. Both captures were hand-checked (2 rows each, none
null-sided) so the assertion added to `drift-check.mjs` is the strict form: every
row accepted as a game, none counted un-nameable.

It also un-vacuums the rest of that script. `every spread is a balanced
handicap`, `no malformed nested payloads` and six others all PASSED over the
empty set above. They are only meaningful because something now guarantees the
set is non-empty.

### A counterexample that proved nothing, caught before it was recorded

The first attempt at the teeth measurement mutated `Id` to
`Decode.int |> string`. It gave exit 1 — and for the wrong reason: Fable's
`int32ToString` threw a `TypeError` on null and the process crashed before any
assertion ran. Had that been recorded as the measurement, it would have "proven"
the teeth of a check that never executed.

Redone with `Required.Field "id_absent"`, which makes rows reject cleanly and
actually exercises the `Decode.oneOf` fallthrough. Exit 1 from the assertion,
exit 0 restored.

This is the third time in one change that the check, not the code, was the
defect: an inverted exit code, a weakened existing assertion, and a
counterexample that crashed instead of failing. The code change itself was
right the first time.

## Third correction — the fix reached a step that had never run

With the decoder fixed, `live-check` got past render, grouping and the tab
checks for the first time, and failed at the last step instead:

```
page.goto: Timeout 30000ms exceeded.
  - navigating to "https://field-laboratory.jeffunglesbee.workers.dev/",
    waiting until "networkidle"
  at scripts/schedule-live-check.mjs:40
```

`schedule-live-check` had **never actually run against a rendered page**. Every
earlier live-check failed upstream, on a slate that decoded to zero cards, and
the job never reached this step. A blank page issues no per-card requests, so
`networkidle` would have settled instantly had it ever been reached.

Now the slate renders in full and every card with a known venue fires its own
weather fetch, so "500ms with no connections" became a much harder condition —
and it was never the condition this script cares about. It already does a
bounded `waitForSelector` for the records row, with a comment arguing exactly
that; the `goto` was left waiting on the network anyway. Changed to
`domcontentloaded`.

**Left open rather than declared benign.** `render-check.mjs:32` and
`live-grouping-check.mjs:24` use `networkidle` against the same URL and both
passed in the same run, which is evidence the page does reach idle rather than
polling forever. Evidence, not proof. Whether the live page reliably reaches
network-idle now that it fetches per card is a real question about the page, not
about the check, and this change does not answer it. If those two steps start
flaking, that is the answer arriving.

This is the fourth thing in one change where the check, not the code, was the
defect — an inverted exit code, a weakened existing assertion, a counterexample
that crashed instead of failing, and a wait condition that only ever held
because the page was empty. The decoder change itself has needed no revision.
