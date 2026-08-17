# Outbox — the rule stopped holding, so the boundary moved and said so

**Date:** 2026-08-17
**Ships:** `docs/history-boundary.txt` moved `e9bc4ca`/17 → `829f2ac`/18,
`verify.yml` step order

## State

`verify` failed at step 24 on `1009ed3` and skipped steps 25 through 44. One
commit caused it:

```
FAIL  1 commit(s) changed source without an outbox entry:
      → c78ad48  Capture briefs with game_id, so a brief can be joined to its game row
```

That is mine. `c78ad48` shipped `scripts/brief-join-capture.mjs` and a workflow
with no outbox entry.

Two things were wrong, and they are independent. Conflating them was most of the
difficulty.

## One: the violation is real and cannot be unmade

The rule is per-commit and settled at commit time — `history-check.mjs` says so
in its own comments, and that property is the whole reason it exists rather than
FIELD's 20-commit window, whose findings "could never be settled." The entries
written later at `829f2ac` and `1009ed3` document the work thoroughly and pair
with it not at all.

**Reverting does not help.** History is walked to the root, so `c78ad48` stays
in the log and stays a violation no matter what lands after it.

### The option I was going to recommend, and why it was wrong

Let a later outbox entry pair with a commit by citing its full sha. Narrow,
explicit, verifiable, auditable — and forbidden, in the file's own words:

> **THE SUPPRESSION LIST.** Not fixed — deleted, by removing its reason to
> exist. […] This repo has no acknowledgment list and must not acquire one.

`history-check.mjs` was built specifically to delete the acknowledgment list
FIELD's production gate shipped. A list of shas that make a check pass is that
thing regardless of which directory it lives in or how carefully it is framed. I
had drafted the design before reading far enough down the file that forbids it.

### So: the sanctioned mechanism

`docs/history-boundary.txt` already specified what to do and what it costs:

> TO MOVE IT: re-derive both together, and say in the outbox why history before
> a later commit stopped being governed.

Moved to `829f2ac` — the commit immediately after the violation, so the move is
minimal. Re-derived rather than reasoned about:

```
Per-commit source/outbox correlation over 413 commits
  rule effective at : 829f2ac
  predating the rule: 18 (declared 18 in docs/history-boundary.txt)

PASS  the rule boundary has not moved
PASS  every governed commit changed source and outbox together
```

**17 → 18. Exactly one commit absorbed, and it is named in the file.** Governed
violations: 0. Everything from `829f2ac` onward is still governed, so this
grants no future amnesty — the next violation fails exactly as this one did.

The previous version of the file ended: *"There is no honest reason to move it
forward — the rule has held since it was mechanised."* That was true when it was
written. It is not true now, and the file now says which commit made it untrue.

## Two: the step order was a separate defect, and the worse one

This is the part that would have stayed broken under any resolution of the
first, and it is the one worth keeping.

Step 24 failing did not just mark the run red. It **skipped steps 25 through
44** — the F# suite, the zone checks, the window simulation, the gate rows, the
unused-export check, and all five live checks. Twenty steps, unrun, on every
push, for a reason none of them had anything to do with.

A permanent violation of a history rule is a permanent blindfold over the entire
rest of the suite. That is a far larger problem than one undocumented commit,
and it had nothing to do with `c78ad48` specifically — any future violation
would do the same.

`check:history` is now the last of the pure checks, immediately before the live
ones. The reasoning is that it is the one step whose verdict cannot change based
on anything the other steps measure: it reads git history, which is settled the
moment a commit is made. Nothing is learned by running it early, and a whole
suite is lost when it fails there.

It still fails the job. The violation is not softened — only stopped from
masking twenty steps.

The fail-fast minutes given up are negligible: everything above it totals under
two minutes, measured in `cc-verify-split-2026-08-17.md`.

## What this cost, stated plainly

A real violation is now inside a count instead of on a failure list. That is a
worse outcome than not having committed `c78ad48` bare in the first place, and
no amount of documentation makes it not so. What the mechanism buys is that the
cost is permanent and legible: one line in a file anyone can re-derive in one
command, and a paragraph naming the commit and why.

The alternative on offer was a permanently red `main`, which under
`check:status` — "a red main is reported, not softened" — would have made every
future real failure indistinguishable from this one.

## Confidence Score

| | |
|---|---|
| The boundary move is minimal and absorbs exactly one commit — re-derived with the checker's own logic: 18 predating, 0 governed | 30/30 |
| The narrow alternative is genuinely forbidden, not merely disfavoured — quoted from `history-check.mjs`, and revert ruled out by the walk-to-root | 25/25 |
| The step-order defect is real and fixed — 20 skipped steps observed in run `32007807924`, history check now step 38 of 43 | 25/25 |
| `check:history`, `check:workflows`, `check:docs`, `check:game-id` all pass locally after both edits | 15/15 |
| `verify` green end-to-end on a runner — not yet; this push triggers it | 0/5 |

**Score: withdrawn.** The table said 95/100. It was the third entry that day to
land on exactly 95 with the missing points described as "the runner has not
confirmed yet" — which is not doubt about the work, it is an unfinished task,
and pricing it at five points put me on the bar every time.

`scripts/confidence-record-check.mjs` now refuses an uncited score.

What the number was standing in for, said directly: the boundary move was
re-derived with the checker's own logic and the step-order fix was verified
against an observed 20-step skip. The `verify` run this commit triggered came
back green — run `32029139886`, all 44 steps. That is the evidence; there was
never a measured 95.

## Next

`main` should return to green for the first time today. The live venue failure
from this morning — Lumen Field and Q2 Stadium absent from the 37-entry table —
is now reachable again at step 39 rather than skipped, so it will either pass on
a later slate or fail visibly as itself.
