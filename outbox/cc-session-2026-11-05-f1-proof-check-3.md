# Session record: proof-check asks about a file's anchor only when the file is not its own backup

**Date:** 2026-11-05. **Scope:** review 6 fix stream F1, finding `proof-check.json` 2 (the per-file anchor guard ignores the intact flags). Touches `scripts/proof-check.mjs` (the classifier and its clauses) and `scripts/mutation-check.mjs` (entries).

**Why this file exists.** `check:staged-outbox` wants an `outbox/` path in every commit that stages `scripts/`, and this stream may not edit existing outbox files. New file; fold it into the session document or drop it when merging.

## Reproduction (Rule 100), on the merged tree

The reviewer's technique: a scratch project with the real `src/Scoreboard.fs` and `src/Desk.fs`, `Desk.fs` with its last union case renamed (no `    | Unrecognised of raw: string`), so byte for byte its own backup and without the anchor. A stand-in `dotnet` sends SIGTERM to the run in the first injected build (3 `let private __proof` blocks left in `Scoreboard.fs`), then a second run with a stand-in that exits 0:

- the script of the first commit of this stream: `proof-check: a previous run ... did not finish cleanly ... src/Desk.fs has no last case, so it may be torn. ... nothing was written.` Blocks left in `Scoreboard.fs`: 3; `.proof-state` kept. The refusal names the file that is whole, and the injection that matters stays.
- the script with this change: `proof-check: HEALED — a previous run was killed with src/Scoreboard.fs injected. Restored it before measuring anything.` Blocks left: 0; `.proof-state` gone.

## What was built

`classifyState` asks a file about its anchor only when the file is not provably whole: `(!targetStranded && !targetIntact && !anchored) || (!registryStranded && !registryIntact && !registryAnchored)`. The main flow already computed both intact flags (a file exactly equal to its backup, backup present); the rule never read them. A file cut off before its anchor is not its backup, so it is still asked, and the existing torn clauses (a torn target beside a stranded registry, the mirror, a torn registry over nothing stranded) are unchanged in what they plant and what they expect; only their classifier-level inputs now say `*Intact: false`, because a torn file is by construction not its backup.

## Clauses (self-test 113 before, 116 after)

- Classifier level: five inputs that are whole without an anchor (stale over nothing stranded, both ways; healed beside a stranded file, both ways; neither anchored is stale). The torn clause now feeds `*Intact: false` for the torn files, so the same missing anchor reads differently on a file that is its backup and on one that is not.
- The real script on planted states: a stranded target is healed beside a registry with no last case that is its backup (the registry untouched and not named, the state gone), and the mirror (a stranded registry beside a target with no anchor that is its backup).

## Red evidence (Rule 90)

With the guard line put back as it was (a copy of the script, the self-test run on the copy), 113/116, three failing: the classifier clause read `got diverged,diverged,diverged,diverged,diverged`; both planted states read `state left true, carried on false` and a refusal. With the change: 116/116. Through the harness, `node scripts/mutation-check.mjs --ids <9 ids>`: six new entries (the two terms each dropped, each inverted, and the two main-flow inputs forced to false) and the three existing entries on this line, re-anchored because their finds named the old text.

## Not verified

- The case the review names as a second symptom (a stale marker over a registry whose anchor changed since a pull) is not changed: such a registry is not its backup and has no anchor, so it is still asked and still refused, as a torn file is. The classifier cannot tell the two apart.
- Only planted states and the stand-in compiler; a real tear (a full disk) was not produced.
