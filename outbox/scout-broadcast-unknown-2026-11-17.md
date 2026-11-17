# A game whose broadcast cannot be told is never Scout's or Deep Cuts' pick

**Date:** 2026-11-17. **Repo:** field-laboratory. **Files:** `src/Scout.fs`, `src/PickView.fs`, `scripts/scout-coinflip-check.mjs`.
**Trigger:** the owner's ruling, 2026-11-17: "Block picks when broadcast is cannot tell".

## Why

On 2026-11-16 Deep Cuts' 7:30pm pick was Rockets @ Heat, qualified by the coin-flip gate (Heat 47.7% de-vigged from -120 / +101). Its `streams` was null, so Gate 0 answered "cannot tell", which was not a veto. Its US channel could not be found.

## What changed

- `ScoutVerdict.BroadcastUnknown`: another gate qualifies the game but Gate 0 is unanswerable (no outlet listed, or an outlet the registry does not know). It is not chosen, and it stays distinguishable from `Indeterminate` (nothing qualified).
- `ScoutOutcome.AllHeldOnBroadcast n`: nothing could be chosen and n games were held back only for that reason. Added last, so the existing outcome tags keep their numbers.
- Scout's Pick says "No pick: 1 game would qualify, but its broadcast cannot be told from this payload, so whether it is on national TV is not known."; a Deep Cuts window says "No deep cut in this window: 1 game would qualify, but its broadcast cannot be told." A held game never blocks another qualifier.

## Proof

| check | result |
|---|---|
| `check:scout-coinflip` | 31/31 (4 new, on the real Rockets @ Heat row: held back; an unknown outlet held back too; a window of only held games reads AllHeldOnBroadcast 1; beside Ducks, Ducks is chosen alone) |
| cannot-tell qualifies again | 28/31 |
| the held count ignored | 30/31 |
| browser read, the Rockets @ Heat row served as the 2026-11-16 slate | both sentences above, verbatim; no page errors |
| `check:deep-cuts` 28/28, `check:outlet-registry` 35/35, `check:pick` 24/24, `check:tabs` 66/66, `check` / `check:hard` / `check:render-sports` 19/19; mutation anchors on changed files 5, 0 broken | green |
