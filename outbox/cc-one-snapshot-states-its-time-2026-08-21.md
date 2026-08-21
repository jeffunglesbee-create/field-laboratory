# Outbox — a one-snapshot odds line states when it was taken

**Date:** 2026-08-21
**Ships:** the `SingleSnapshot` branch of `oddsText` in `src/Scoreboard.fs`

## What was inconsistent

On the same board, two odds lines got two different levels of honesty:

- A two-capture game that is not a real sequence:
  `draftkings ML +140 / -166 · H +3.5 · O/U 162.5 — open/close NOT SEQUENCED
  (2026-08-21T10:00:54Z vs …:36Z)` — states what it is and *when* both captures
  landed.
- A one-capture game:
  `fanduel ML -650 / +1200 (one snapshot)` — a bare price with no timestamp.

On the 3-0 Arsenal v Coventry final, `fanduel ML -650 / +1200 (one snapshot)`
reads like a live or settled price. It is neither: it is a single pre-kickoff
capture. The one piece of context that says so — the capture time — was the one
thing the `SingleSnapshot` branch dropped, while the `NotASequence` branch right
below it carried exactly that.

## The fix

`SingleSnapshot` now appends its `RawCapturedAt`, the same field and the same
treatment the `NotASequence` line already uses:

```
fanduel ML -650 / +1200 (one snapshot, 2026-08-21T10:00:54.720Z)
```

No open/close label is claimed — with one snapshot there is no sequence to name,
and the relay's open/close labels are the thing `NotASequence` exists to distrust
in the first place. The timestamp alone is the honest context: a price, and when
it was observed.

## Why this is the same principle, not a new one

The odds layer already refuses to narrate movement it did not observe twice
(`OddsStory.NotASequence`, `docs/ODDS-PROOF.md`). A price with no stated capture
time is the quieter version of the same overclaim — it lets the reader assume the
number is current when it is a single stale snapshot. Stating the time is the
minimum that stops the assumption, and it makes every odds line on the board —
sequenced, not-sequenced, or single — say when it was taken.

## Verified

Build clean, zero F# warnings. `render-check`'s odds assertions pass ("every card
fills its odds slot", "every NOT SEQUENCED card really is out of sequence"); the
five failing checks are all the weather-chip path failing on
`ERR_TUNNEL_CONNECTION_FAILED` (Open-Meteo is proxy-blocked in this sandbox, the
same environmental limit the weather-live check documents), not the odds change.
`brief-flip-check` 20/20. No test pinned the old `(one snapshot)` string, so
nothing regressed; the change is a single string append on one branch.

## Not changed

The `SingleSnapshot` type still carries one `Odds`, not which column it came
from. Naming it "opening" or "closing" would repeat the relay's unreliable
open/close label — the same label the not-sequenced case proves lies — so the
render states the time and declines to name the side. If a future need arises to
distinguish them, that is a type change (carry the source column), filed then.
