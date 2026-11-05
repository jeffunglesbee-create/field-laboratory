# Session record: a run that loses the marker writes nothing into the state directory, and a link at its path is called a link

**Date:** 2026-11-05. **Scope:** review 6 fix stream F1, findings `proof-check.json` 4 (a dangling link at the marker's path wedges every run with a false message) and 5 (the exclusive create does not make "two runs started together cannot both proceed" true over a stale or healable marker), and `tests-vacuity.json` 5 (the "marker written LAST" ordering is undefended and its comment overstates the harm). Touches `scripts/proof-check.mjs` and `scripts/mutation-check.mjs`.

**Why this file exists.** `check:staged-outbox` wants an `outbox/` path in every commit that stages `scripts/`, and this stream may not edit existing outbox files. New file; fold it into the session document or drop it when merging.

## Reproductions (Rule 100), on the tree before this commit

- **Finding 4.** A scratch project, `ln -s /nonexistent/elsewhere.json .proof-state/active.json`, a sentinel line in `.proof-state/Scoreboard.fs.bak`, a stand-in `dotnet` that logs its calls. Two runs in a row: both exit 1, both run 0 builds, both print `another run took .proof-state/active.json while this one was starting. Run this again once it has finished.` Afterwards `Scoreboard.fs.bak` held `module Scoreboard`, the loser's reading of the file, where the sentinel had been. The message is false (no run is involved) and "run again" can never succeed; and the loser overwrote the state's backups before failing.
- **Finding 5.** Run A holds its `rmSync` of the state directory (a preload) until run B has built, and run B is not started until A has judged the marker stale, so the interleaving is deterministic. Output: A printed `STALE STATE DISCARDED`; B printed `STALE STATE DISCARDED` and went on (8 builds started in all, between the two); A reached its baseline and its `inject` threw `Error: src/Scoreboard.fs changed while the run was going, so nothing was written to it`, because B's injection was on the file; A's exit message then said `Put src/Scoreboard.fs right by hand: delete the injected block ...`, about a file that was B's live injection. The tree ended clean (B's own restore ran last). A natural collision over a stale marker did not reproduce: 0 of 20 starts.

## Decisions

**One order: the marker first.** Findings 4 and `tests-vacuity` 5 pull in opposite directions (write the backups after the create, versus keep the marker last and test it). The marker is the lock, and a run that loses a lock must not have written into the directory it protects; with the backups first, a loser overwrote the holder's (finding 4's evidence above). The cost of marker-first is a window with a marker and no backups, and it is harmless: nothing is injected before both backups exist (the first injection is after the baseline build, which follows the backups), so a kill in the window leaves a marker over untouched files, which classifies as stale and is discarded. That is a planted state in a clause, not a kill hook: the hook would test timing in production code for a property that the state alone shows. The old comment's "dead end" (a marker pointing at nothing over an injected tree) cannot happen, and the comment now says so.

**Finding 5, not closed, and the claim corrected.** Closing it without a new lock file needs an atomic "remove this stale marker only if it is still the one I judged", which the filesystem does not give: renaming the state directory away claims whatever is at that name at that moment, the stale one or a fresh one, and a rename back leaves a window of its own. A new lock file is out of scope and would need its own dead-run rule (which is what the marker is). So the code stays, and the comment above the create now says what the create guarantees (no marker: two runs cannot both proceed) and what it does not (a stale or healable one), what was measured, and that `inject`'s guard, not the marker, is what stops two injections in that window. The subject of the commit that introduced the create ("so two runs started together cannot both proceed") overstated it.

## What was built

- The marker is created first; the two backups are written after it.
- On EEXIST the path is looked at (`lstat`): a link is called a link ("`.proof-state/active.json` is a symbolic link (to X) and this run does not write through a link, so no other run is involved. Remove it (rm .proof-state/active.json) and run this again."); anything else is another run, as before.
- Comments: the order and its reason, what the create does not make true, and the `dropState` comment that leaned on the old order.

## Clauses (self-test 118 before, 120 after)

The old marker-appears clause is now the link clause (the message, the link's target not created, the holder's backups untouched). New: a regular file planted just before the exclusive create by a preload, standing for the other run (the loser exits 1, runs no build, says another run took it, and leaves the other run's marker and both backups exactly as found); a marker with no backups behind it is stale and the next run carries on (planted).

## Red evidence (Rule 90)

With the old order and message put back (a copy, its self-test run), 118/120, both new clauses failing: the link clause `backups untouched false` and the old message; the race clause `backups untouched false`. Through the harness, `node scripts/mutation-check.mjs --ids <10 ids>`: seven new entries (the backups before the marker, the link not told from another run, the two messages swapped, no remedy, "no other run is involved" dropped, the link's target hidden, a marker without backups called no marker) and the entries on the create itself (`proof-marker-not-exclusive`, `proof-marker-collision-carries-on` re-anchored, `proof-marker-create-error-swallowed`).

## Not verified

- The forced race was run on the committed script only; the new order does not change it (both runs still read the same dead marker), which the new comment says.
- A real kill between the marker and the backups was not produced; the state it leaves is planted.
