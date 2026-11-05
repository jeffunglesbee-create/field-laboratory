# Session record: proof-check keeps the state when an edit separates the probe from the last case

**Date:** 2026-11-05. **Scope:** review 6 fix stream F1, finding `proof-check.json` 0 (HIGH), plus the two message survivors of finding 3 that this commit rewrote (the "Put X right by hand" list and the "also carries" note). Touches `scripts/proof-check.mjs` and `scripts/mutation-check.mjs` (clauses and entries).

**Why this file exists.** `check:staged-outbox` wants an `outbox/` path in every commit that stages `scripts/`, and this stream may not edit existing outbox files. New file; fold it into the session document or drop it when merging.

## Reproduction (Rule 100), on this clone before any change

A scratch project holding the real `src/Scoreboard.fs` and `src/Desk.fs`, and a stand-in `dotnet` that, in the build that sees the probe (a second `    | NHL` line), runs `sed` to add `    | MyNewSport` directly above `    | Unrecognised of raw: string`, as the repo's own recipe says to add a sport. `node scripts/proof-check.mjs`:

- exit 1, stderr only `src/Desk.fs changed while the run was going and was left exactly as found (nothing was written over it). This run's result is not to be trusted.`
- `ls .proof-state`: no such file. `diff` of `src/Desk.fs` against the original: `+    | NHL` and `+    | MyNewSport`.
- The next run proceeded over that file: `baseline tree compiles` was printed, the probe having been adopted as the original.

Cause: the restore called a changed registry "carrying" with `probeOnRegistry`, which looks for the probe directly above the last case. The edit had just stopped that being true, so the file was called someone else's with none of the run's code in it, and the state (the only whole copy) was dropped. The same test fed the classifier, so a kill (not a failed restore) with the same file on disk was discarded as stale: a planted state (dead pid, no `restoreFailed` flag, backups that predate the probe) printed `STALE STATE DISCARDED` and went on.

## What was built

- `carriesProbe` (new): a registry carries the probe when the probe is directly above the last case, or when its line is there twice in one top-level declaration. A union cannot have a case twice, so two are the probe wherever an edit put it. It is stateless on purpose: "more `| NHL` lines than the backup" mis-fires on a backup older than the tree (the stale case; three existing stale clauses failed on exactly that when it was tried first).
- Used by the restore (`carrying` vs `foreign`), by the classifier's `registryInjected` input, by the `diverged` reasons, and by the no-state guard, which proceeded over a separated probe and then failed its baseline on the duplicate case.
- The message of a restore that leaves a file carrying the run's code now says which file still carries what (`src/Desk.fs still carries this run's probe case, with what was changed meanwhile, which is not in them`) and which lines to delete, with a grep that lists both `| NHL` lines (the D-stream's `-B1` grep would show the sport that was added, not the probe).
- The no-state refusal keeps its wording for a probe directly above the last case and uses the new wording for a separated one.

## After the change, the same scenario (real files, stand-in compiler)

1. Run 1: exit 1; `.proof-state` kept (`active.json`, both backups, `restore-pending`); `active.json` says `restoreFailed`; stderr names `src/Desk.fs`, says it still carries this run's probe case and which line to delete.
2. Run 2: exit 1, writes nothing, runs no build: `src/Desk.fs carries the probe case and has changed since; src/Desk.fs is not what that run backed up, and its restore did not read back, so it may be torn. ... nothing was written.`
3. The person deletes the second `    | NHL` and runs `rm -rf .proof-state`, as the message says. Run 3 printed `PASS  baseline tree compiles`, left `src/Desk.fs` as the person had it, and left no state.

Without `rm -rf .proof-state` the run after a hand fix still refuses (the marker says the restore failed, and a file that is not its backup may be torn). That is the same protocol every other kept state has; a run that proceeds on its own after a hand fix would have to tell a hand fix from a tear, which the marker cannot say.

## Clauses (self-test 106 before, 113 after)

New: the separated sport keeps the state and the message is exact; the next run refuses, and after the hand fix the run after it proceeds (3 runs); the person took the probe out themselves (the registry is theirs, state dropped, message does not say the probe is in); a killed run with a separated probe is not stale (planted); the no-state guard over a separated probe (planted); a target that cannot be restored beside a registry that carries the probe (the list names both, lines only for the registry); `carriesProbe` itself on six sources, the committed `src/Desk.fs` among them. Three existing clauses now also pin the message text (target, probe, unreadable file).

## Red evidence (Rule 90)

Against the unchanged code, the clauses written first: 107/110, three failing: the sport added between the probe and the last case (`backup is the original false, marker null`), the next run (`registry as found false, state kept false`), the killed-run planted state (`STALE STATE DISCARDED ... carried on true`). The no-state clause, added later, failed on the unchanged guard (`→ ` and nothing else: it proceeded). The "person took the probe out" clause passes before and after; it is there for the mutant that calls any `| NHL` a probe.

Through the harness: `node scripts/mutation-check.mjs --ids <23 ids>` read `24/24 checks passed` (baseline plus 23 caught): 18 new entries and 5 re-anchored (their finds named the text this change moved). Every new find was applied to a copy with `--anchors` reporting 0 stale and 0 ambiguous (one find was ambiguous at first, because the self-test lives in the same file as the code, and was lengthened).

## Not verified

- A real `dotnet build` of a duplicate union case was not run; the claim that the build rejects it is the language's rule, and the baseline failure the no-state guard used to run into was reasoned, not measured.
- Only the stand-in compiler was used; a real kill or a real edit during a real phase 2 was not.
