# The drama sparkline, with both of its bugs designed out — 2026-08-10

A 30-bar row under a finished game's card, captioned `drama over time (peak N)`,
plotting `drama_arc`. Built from the production write-up, which describes two
fixes; both are treated here as things the code should be unable to do again
rather than things to remember.

## The two bugs

**Normalising to the series maximum.** Bars were scaled against that game's own
tallest sample, so the tallest was always 100%. A real 821-sample arc spanning
44–74 rendered as a 59–100% wall, and a game peaking at 20 drew the same
silhouette as one peaking at 95.

The committed capture is the same shape — `MLB_2026-08-09_yankees_braves`, 504
samples, range **51–81**, which max-normalisation would draw as 63–100%.

Fixed by a fixed 0–100 domain, so a bar's height in percent **is** the drama
value. Structurally that means there is no function in `Desk.fs` that takes the
maximum of the series. Not a rule to follow — an absent capability.

**Every-Nth downsampling.** Taking every Nth sample can step over a spike. With
504 samples in 30 buckets, 474 are never looked at, so the peak named in the
caption can be invisible in the chart beneath it.

Fixed by bucketed max, which carries a property worth asserting rather than
describing: **the maximum of the output equals the maximum of the input.**

## The check nearly proved nothing, and said so

First version tested every-Nth against the single committed arc. It **kept the
peak** — 81 happens to sit at an index every-Nth samples — so the row passed
while demonstrating nothing about the difference between the two strategies.

That is this session's recurring failure again, and it was caught only because
the failure message was written to say what a pass would mean.

Rewritten to exercise the property over **465 real series** — every prefix of
the real arc — driving the actual F# through its public API (decode a payload,
take the `SealedArc`, call `sparklineBars`, read the style strings). Not a JS
re-implementation, which is the mistake `zone-check` made this morning.

```
over 465 real series: bucketed max kept the peak 465 times,
                      every-Nth lost it 110 times
```

Both rows are now discriminating: bucketed max must keep the peak on every
series, and every-Nth must lose it on at least one, or the comparison is
untested and says so.

## What could not be sealed, stated exactly

`SealedDrama` and `SealedArc` keep the composite out of the program. A bar
height cannot work that way: **the number must reach the DOM, or there is no
chart.**

So the claim is narrower than the peak's, and `docs/AMNESTY-PROOF.md` now says
so. `barHeightStyle` returns the CSS length rather than the int, and requires
the same `AmnestyZone` witness as `formatDramaPeak`:

```fsharp
let barHeightStyle (_zone: AmnestyZone) (DramaBar value) : string =
    sprintf "height: %d%%" value
```

The number leaves the module only as a style string, and only post-game. Two
violations compiled for real:

```
barHeightStyle bar
  -> FS0001: This expression was expected to have type 'AmnestyZone'
     but here has type 'DramaBar'

| DramaBar v -> sprintf "height: %d%%" v
  -> FS1093: The union cases or fields of the type 'DramaBar' are not
     accessible from this code location
```

A live game therefore cannot have a sparkline for the same reason it cannot have
a printed peak — not a conditional, an unobtainable witness. `spark-check`
asserts it from the DOM as well: no card whose status is not Final has bars.

## Smaller decisions

- **44px track**, the GLYPH minimum. Production shipped 24px, at which a
  30-point spread is about seven pixels and every card looks alike.
- **Out-of-domain values are reported, not silently clamped.** `arcOutOfDomain`
  names any sample outside 0–100 — a 150 in a "0–100 closeness score" is
  upstream drift. The bars are still clamped, because a 150%-tall bar is a
  layout bug on top of a data bug.
- **`aria-hidden` on the bar row.** The caption already states the peak; thirty
  unlabelled boxes read aloud are noise.
- **Last bucket ends exactly at the sample count**, so no trailing samples are
  dropped. That is another way a peak goes missing.

## An honest gap

The sparkline is appended when the game is final **at render time**. The text
drama slot is a `stateNode` and recomputes when the state signal changes, so a
game finishing while the page is open starts showing its peak; the chart does
not — it appears on the next render.

Stated because it is a real gap rather than a design. The fix is a reactive
chart node, which is more machinery than one row of divs deserves until someone
has actually watched a game end on this page.

## Verification

| | |
| --- | --- |
| `check:spark` | 15/15 |
| `check:proof` — two new compiled rejections | 18/18, 15 rejections |
| mutations `spark-normalise`, `spark-every-nth` | both killed |
| build warnings | zero |
