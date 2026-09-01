# The table was regenerated, and the pin moved 31 -> 36

## What happened

`generate team colours` was dispatched to prove the outbox guard's PERMIT path on
a real runner — the guard added in `52c7bc6` had only ever been tested in a
throwaway repo. It worked: run 33563366570 committed `b625cb4` carrying
`src/TeamColours.fs` **and** `outbox/generated-team-colours-2026-09-01.md`
together, and `check:history` reports no governed violation.

That was the point of the run. What it turned up was more interesting.

## The table on main was the wrong one

`src/TeamColours.fs` on main was still the **globally collision-resolved** table:
1453 entries. The generator stopped applying that rule when the design moved to
pairwise resolution, and was never run afterwards — so the committed table was
the output of code that no longer existed.

Regenerated: **1701 entries**, every club's real colour, collisions resolved per
card at render time.

Exactly the shape `CLAUDE.md` names: `src/TeamColours.fs` is a copy. The
generator is the source. The copy was locally true and had been read as current
all day.

## The pin caught it, and reading it named the trade

`team-tint-render-check` pins the tinted count to the frozen capture rather than
to a tolerance. It failed: `31` expected, `36` measured. Diffed by rendering the
same capture against both tables:

| | cards |
|---|---|
| **gained** (8) | Bournemouth v Everton · Diamondbacks @ Giants · Elversberg v Leverkusen · Houston Dynamo FC v San Jose Earthquakes · Houston v San Jose · Lorient v Troyes · Mainz v Paderborn · Minnesota v Orlando |
| **lost** (3) | D.C. United v LAFC · Spurs v Newcastle · Union Berlin v Frankfurt |

The three losses are the correct outcome and the argument for the change.
`resolveCollisions` used to hand the second club of a colliding pair its
ALTERNATE — "THE SECOND CLUB TAKES ITS ALTERNATE, not the shared white" — which
separated those pairs by **inventing a difference**. With real colours, both
sides of each of those three genuinely are the same colour: two blacks, two
whites, two reds. A pair a reader cannot tell apart renders plain. That is what
the pairwise rule is for, and a card showing one club in its true colour beside
another in a colour it does not use would be worse than both plain.

Net +5. Every other assertion held: no card one-sided, every tint painted what it
declared, AA cleared on the card surface and on the page ground, no tint reading
as the plain text colour, tints only on matchup names.

## What the workflow does not check

`generate-team-colours.yml` runs `npm run check:verify` — the F# suite — before
committing. It does **not** run the render check, which is why a table change
that moves the rendered count can land without the count being re-measured. The
commit carries `[skip ci]`, so verify does not run on it either.

That is a real gap and it is not being papered over here: the pin caught this one
because I dispatched the workflow and then looked. The next regeneration wants
`check:team-tints` in the workflow, which needs the dev server and Playwright in
that job. Filed as the next task rather than bolted on to this commit.

## One mistake while cleaning up

`rm outbox/team-tints-2026-09-01T2*.png` was meant to remove the single
screenshot this session's render check had just written. The glob matched `20-xx`
as well as `21-xx` and deleted twenty committed screenshots. Restored with
`git checkout -- outbox/` before staging; nothing was pushed.
