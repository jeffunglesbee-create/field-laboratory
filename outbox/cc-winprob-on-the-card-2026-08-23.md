# Outbox — a real per-card win probability, through Market

**Date:** 2026-08-23
**Ships:** win probability now renders on the desk card, derived through
`Market.fs`. The market-shape type now guards a surface the laboratory actually
shows, not only a client failure mode.

## What appears now

Each card with moneyline prices shows a `desk-card__winprob` line. On the
committed MLB capture: `win prob — Yankees 58% · Braves 42%` and `White Sox 50% ·
Guardians 50%` — devigged from the moneylines and rendered through
`Market.twoWayHome`/`twoWayAway` + `Units.toPct`. There is no bare-number path
from a market to the screen.

## The shape is enforced end to end

- `Odds` gains an optional `MoneylineDraw` (decoded from `moneyline.draw`; absent
  in every committed capture, all MLB).
- `Desk.winProbability` picks the market shape from `Sport.IsSoccer`:
  - non-soccer → `Market.TwoWay` from home/away.
  - soccer **with** a draw price → `Market.ThreeWay`.
  - soccer **without** a draw price → `ThreeWayDrawMissing`, rendered "three-way
    market; no draw price served" — **not** a two-way complement.
- The last case is the point: the client's `1 - homeWP` on a soccer game (draw
  folded into away) is unrepresentable here, because a soccer away probability
  can only come from `Market.ThreeWay`, which cannot be built without the draw.

## Verified

Build clean, no F# warnings. `check:wp` 11/11, including the guarantee that a
soccer market without a draw resolves `draw-missing`, with a draw resolves
`three-way`, and a non-soccer market resolves `two-way`. Rendered line confirmed
in a real browser on the MLB capture. render 13/13, separation 10/10, brief-flip
20/20, nav 25/25, F# suite 62/62, unused 10/10.

## Note

The committed captures are MLB-only, so the three-way branch renders no live
example yet; it is exercised by `check:wp` against real de-vigged three-way
prices. A soccer slate with a draw price will render the three-way line on its
own; a soccer slate without one will honestly say the draw is not served rather
than show a wrong two-way split.
