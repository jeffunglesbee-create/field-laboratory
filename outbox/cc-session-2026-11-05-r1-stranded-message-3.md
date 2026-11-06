# Session record: `--stranded` says what state the marker is in and what the heal will do (review 7, C2 and L5)

**Date:** 2026-11-05. **Scope:** `scripts/mutation-check.mjs`, the `--stranded` block, its clauses and table entries. Fix stream R1, commit 3 (continuation after the container restart: the first agent's uncommitted work was re-run, not trusted). C2 and L5 are one commit because the fix for both is the same rewrite of the same expression (the message): the `back` kind is C2, the other kinds are L5, and both are branches of one `kindOf` and one switch.

**Why this file exists.** `check:staged-outbox` requires an `outbox/` path in every commit that stages `scripts/`, and the assignment says not to edit existing outbox files. New file, nothing existing touched; fold it into the session document or drop it when merging.

## Reproduction (Rule 100), on this clone before the change

Seven states built on disk in scratch directories, `--stranded` asked, and the same state healed on a copy:

| state | `--stranded` said | `--heal` then did |
|---|---|---|
| source marker, file never touched (rebuild false) | "a mutation a killed run left applied ... would carry the mutation. Heal it first" | exit 0, "Nothing to heal: already undone" |
| file back, rebuild true (what a caught Ctrl-C leaves) | the same | "already undone", then `npm run build` failed here (no package.json), exit 1, marker kept |
| file edited by a person after the kill | the same | exit 1, "neither the original nor the mutation", marker kept |
| mutated file, backup gone | the same | exit 1, "backup is gone or is not the original", marker kept |
| marker without hashes | the same | exit 1, "was written before markers recorded what the mutation did" |
| marker cut off mid-write | the same | exit 1, "is not a marker this harness wrote" |
| the healable state | the same | exit 0, HEALED |

Both findings reproduce: six of seven states were told "Heal it first" and "would carry the mutation" while the heal said something else. The live branch said only "Wait for pid N", where the heal's own live refusal also says how to stop a run that hangs.

## What was built

- `kindOf(m)` inside the `--stranded` block classifies a marker by `planHeal`'s names and in its order (unreadable, live, legacy, world, back, diverged, lost, applied), from the marker and the file alone: `planHeal` also reads the tree through git for a change made outside the source, and this mode runs nothing. It reads the file with `createHash` from the import, because `sha` and `shaOfFile` are consts defined further down (the trap the mode's comment names).
- One message per kind. `back` (C2): "already back as it was", with `build/ may still hold the mutation` when the marker could reach build/ (`rebuild` not false) and `nothing is applied ... runs no build` when it could not; it keeps refusing (the skeptic's ruling: the gate scores build/), names `--heal`, says nothing committable differs but a gate run scores build/, and names the delete route with its cost (deleting the directory drops the only record that build/ may be stale, so only after a build has run by hand). The four refusing kinds (unreadable, legacy, diverged, lost) say the heal refuses this one and writes nothing, and to read what it says. The two kinds of change made outside the source say what the heal does with each. The live kind adds the stop advice. `applied` keeps the old sentence, because it is true there.
- A world marker that records no paths is one state in three shapes (`touched` absent, `{}`, `null`); `planHeal` reads all three as "recorded none" (`hasTouched`) and so does `kindOf`. The first version of this block did not have a clause for `{}` or `null`: the entry that turns `> 0` into `>= 0` SURVIVED the first agent's 25 entries (found by re-running them), which is why the third shape got a clause of its own.
- Not built, from the skeptic's list: naming `--no-verify` in the message. The rebuild-failed refusal of the heal itself is not touched (the assignment excludes the heal's messages); the `--stranded` message for the back state carries the delete route instead.
- The summary line says "hold a marker" where it said "hold a mutation a run left applied", since a marker is no longer always a mutation.

## Self-test and entries

- 194 -> 207 clauses: two for `back` (rebuild true / absent in `nested`, and rebuild false), each also healed on a copy with an `npm` that logs, so "it runs `npm run build`" and "it runs no build" are held to what the heal does; seven refusing kinds (lost, diverged, three legacy shapes, two unreadable shapes), each healed on a copy, which must refuse; one for the three shapes of a world marker with no paths; three clauses over REAL producers inside the scratch-repository group (a caught SIGINT with the build unverified, a world mutation killed once applied, one killed before it recorded its paths); the live clause also asserts the wait sentence and the stop advice.
- 26 new table entries, plus `stranded-mode-reads-a-live-run-as-killed` re-anchored to the live branch's new place (its old find line no longer exists).
- Four existing entries (`heal-writes-over-a-moved-file`, `heal-applies-a-marker-it-cannot-check`, `heal-reads-an-unreadable-marker`, `live-refusal-drops-the-kill-advice`) went AMBIGUOUS when `kindOf` first repeated `planHeal`'s lines word for word. The new code is worded differently so the heal stream's entries stay as they were.

## Red evidence

- With the old message block put back (everything else as built) `--self-test` gives 193/207 and 14 clauses fail: the live clause, both `back` clauses, the seven refusing kinds, the three-shapes clause, and E3, E14 and E23.
- Each new entry applied alone to a copy of the tree and the failing clause read: every one fails the clause it was written for (203/206 to 205/206 depending on how many clauses share the sentence); the exception was `stranded-kind-unrecorded-called-recorded`, which passed 206/206 until the three-shapes clause was added (then 206/207).
- All 49 entries of the group (the 26 new, the re-anchored one, the 15 existing `stranded-*` entries, `no-stranded-mode`, `self-test-heals-a-stranded-state` and the four heal neighbours) through the real harness, in three copies of the tree, one `--ids` call each: 18/18, 17/17, 17/17 checks passed.

## Not verified

- Where `npm run build` really succeeds and fails: the clauses use an `npm` stand-in that logs and exits 0, and the real `npm` failing in a directory with no package.json.
- A world mutation's `--stranded` text is checked against the real producers (E3, E23) and the heal's behaviour for those is asserted by E3, E4, E10 and E23, not re-run per sentence.
- The self-test's own warning over a stranded state (the `::warning::` line it prints before its clauses) still says "a mutation a killed run left applied ... Heal it first" for every kind of marker. It is a sibling of this message, outside the `--stranded` block, and was left alone (Rule 69).
