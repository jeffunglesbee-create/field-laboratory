# An illegal tiebreak named the half of the row that was fine

2026-09-07 · field-laboratory · `src/Tennis.fs`, `src/Suite.fs`

## What happened

The Draw panel rendered for the first time and printed, in its header:

```
Scoreline refused, so no numbers are printed for it:
match 36028 — set 2 is 6-4, which is not a score a set ends on
```

6-4 ends sets all day. The message was wrong about its own finding.

## The real defect, which is in the vendor's data

Match 36028 of `data/tennis-draw.json` — Roland Garros WTA 2026, Round of 16 —
carries:

```json
"sets": [
  { "p1": 4, "p2": 6 },
  { "p1": 6, "p2": 4, "tiebreak": [40, 15] },
  { "p1": 6, "p2": 0 }
]
```

`[40, 15]` is a GAME score. It is on a 6-4 set, which cannot have a tiebreak at
all: a tiebreak is played at 6-6 and only there. `completedSet` already refused
this correctly — `tiebreakOk` requires `hi = 7 && lo = 6` — so the type system
caught a real thing the client's bracket would have printed.

## Why the message was wrong

`completedSet` answers with an `option`. The three refusal sites in `decode` and
`decodeFinal` turned every `None` into `IllegalCompletedSet(i, a, b)`, which
carries the games and not the tiebreak. One error case was covering two defects,
so the report named whichever half the case happened to hold.

This was invisible until the panel printed it out loud. The suite row
"...and every match it refuses is refused for a stated reason" was green
throughout — `IllegalCompletedSet` IS a stated reason, and the row was asking
whether one existed, not whether it was the right one.

## The fix

A fifth case, and an exact test rather than a heuristic:

```fsharp
| IllegalTiebreak of index: int * p1: int * p2: int * breakerP1: int * breakerP2: int

let private completedSetError (i: int) (a: int) (b: int) (tb: (int * int) option) =
    match tb, completedSet a b None with
    | Some(x, y), Some _ -> IllegalTiebreak(i, a, b, x, y)
    | _ -> IllegalCompletedSet(i, a, b)
```

If the games alone would have made a completed set, the tiebreak is what was
refused. Asked in one place, so the three sites cannot drift apart about it.

`DecodeError` is matched exhaustively by `DrawView.refusalWhy` and FS0025 is an
error in this project, so the new case could not be added without the renderer
being made to say something about it.

## Two rows, both directions

A classifier that had stopped distinguishing would satisfy whichever row was
written first, so both directions are asserted and each is the other's
counterexample:

| row | must hold | must fail |
|---|---|---|
| an illegal tiebreak on a LEGAL set score is reported as a tiebreak | `6-4` with `[40,15]` | `4-3` with `[40,15]` |
| ...and an illegal set score with no tiebreak stays a set-score refusal | `4-3`, no tiebreak | `6-4` with `[40,15]` |

## Mutation-tested before being trusted (Rule 90)

```
PASS  [tiebreak-not-distinguished] an illegal tiebreak on a legal set score
      is reported as a tiebreak
PASS  [everything-a-tiebreak] an illegal set score with no tiebreak stays a
      set-score refusal
```

Both anchors confirmed unique in `src/Tennis.fs` before the run.

## The row that went red, and why that was correct

`...and every match it refuses is refused for a stated reason` allowed only
`IllegalCompletedSet` and failed the moment the split landed — on the real
capture, whose one refusal is now `IllegalTiebreak`. The row was widened to
accept both. That is the row doing its job: it noticed the vocabulary changed
under it rather than agreeing silently.

## Measured

- `node build/VerifyMain.js` — 144/144 before, **146/146** after.
- The panel now prints: *match 36028 — set 2 is 6-4 carrying a tiebreak of
  40-15, and a tiebreak is played at 6-6 and only there*.

## Residual

None. The other three non-standard set scores in the capture — 35384 (4-5),
35152 (4-1), 35142 (2-1) — are the retirements `Tennis.fs` already models as
`Retired`, and they decode cleanly.
