# Scout's Pick skips finished games, so it rolls forward through the day

**Date:** 2026-11-15. **Repo:** field-laboratory. **Files:** `src/Scout.fs`, `src/PickView.fs`, `scripts/scout-coinflip-check.mjs`.
**Trigger:** owner's ruling 2026-11-15, option B: "B, and keep C for later". C (a pick per daypart) is filed as `docs/CC-CMD-2026-11-15-scout-daypart-picks.md`, HELD for the owner's design answers.

## What changed

- `chooseScoutAt (now)` leaves out qualifiers whose state is `Final` at `now`. A game under way stays in: it can still be watched. `chooseScout` is the wall-clock entry the panel uses.
- The result is a three-case `ScoutOutcome`: `Chosen`, `AllFinished n` (games qualified and every one has finished), `NoneQualify`. The two empty cases are different nights and the panel says which.
- `ScoutChoice.Finished` counts the qualifiers left out; the panel says "N qualifier(s) already finished, so the pick has moved on", and a lone remaining qualifier's basis reads "the only unfinished game that qualifies".

A game whose date has passed but which carries no score is not `Final` (`Desk.gameStateAt` needs a score for that) and so stays in. That is the existing state model, read in this session rather than assumed, and is unchanged.

## Proof

| check | result |
|---|---|
| `check:scout-coinflip` | 27/27 (5 new: Ducks finished leaves Blues alone with 1 counted; both level games finished leaves Marshall as "the only unfinished game"; all three finished is `AllFinished 3`; a game under way stays in; and that game is asserted `InProgress` at the instant so the previous check is not vacuous). State at a fixed instant, never the wall clock |
| finished games not skipped | 24/27 |
| games under way skipped too | 26/27 |
| `AllFinished` collapsed into `NoneQualify` | 26/27 |
| browser read, slate served with every game final | "Every game that qualified on this slate has finished (3). The pick moves on as games end, and none is left to watch."; no page errors |
| browser read, same slate unscored | the tie and basis as before (no game is `Final` without a score) |
| `check:tabs` 62/62, `check` / `check:hard` / `check:render-sports` 19/19, `check:pick` 24/24, `check:pickem` 33/33, `check:computed-chrome` 25/25, `check:outlet-registry` 21/21, `check:state` 11/11, `check:script-orphans`; mutation anchors on changed files 5, 0 broken | green |
