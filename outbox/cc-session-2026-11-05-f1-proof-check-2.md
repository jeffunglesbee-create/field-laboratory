# Session record: clean-source-check sees a registry probe an edit has separated from the last case

**Date:** 2026-11-05. **Scope:** review 6 fix stream F1, finding `proof-check.json` 0 point (4) (the scan must see the state the first commit of this stream keeps), and finding `proof-check.json` 1 for the part that is not already fixed. Touches `scripts/clean-source-check.mjs` and `scripts/mutation-check.mjs` (entries).

**Why this file exists.** `check:staged-outbox` wants an `outbox/` path in every commit that stages `scripts/`, and this stream may not edit existing outbox files. New file; fold it into the session document or drop it when merging.

## Finding 1, reproduced on the merged tree first (Rule 100)

The finding says `check:clean-source` passes over a stranded registry probe. On this clone at the merge point (the `proof-check.mjs` and `clean-source-check.mjs` of `git show HEAD:`), a scratch project with the real `src/Desk.fs`, a stand-in `dotnet` that sends SIGTERM to the run in the build that sees the probe:

- `node scripts/proof-check.mjs`: exit 143, `diff` of `src/Desk.fs` against the original is `+    | NHL`, `.proof-state` present.
- `node scripts/clean-source-check.mjs`: `FAIL  no source file carries injected proof code`, `→ Desk.fs — a proof-check run left this. Run node scripts/proof-check.mjs ...`, `4/5 checks passed`, exit 1.

So the adjacent probe is already caught (the earlier commit that taught the scan the probe's site); `.githooks/pre-commit` runs `check:clean-source`. Nothing is built for it. What the scan still missed is the state the first commit of this stream keeps: a sport added between the probe and the last case.

## Reproduction of the miss

The real `src/Desk.fs` with `    | NHL` and `    | MyNewSport` directly above `    | Unrecognised of raw: string` (the state the HIGH finding leaves), the real scan over a copy of all 49 `src/*.fs`: `5/5 checks passed` is what the adjacent-only scan would print (the probe is no longer directly above the last case); after this change the same tree prints `FAIL  no source file carries injected proof code` with `→ Desk.fs — ... Delete the probe case (the second line "    | NHL" in the union: ... ) ... lists both)`, `4/5 checks passed`, exit 1.

## What was built

- `probeDuplicated`: the probe's line is there twice in one top-level declaration (a line that starts in column 0 starts the next one). Same predicate as the one in `proof-check.mjs`, written out in both by eye, as the marker is.
- Files that carry the probe directly above the last case keep the earlier wording and `grep -n -B1`. Files that carry it separated get their own instruction: the second `| NHL` in the union, written directly above the last case by the run, with a line possibly between them now, and a grep that lists both lines (the `-B1` grep would show the sport that was added). A tree with both kinds gets both instructions, each naming only its own files.
- Measured on the real tree: `npm run check:clean-source` over the 49 files of `src/`: `5/5 checks passed`, so 0 false positives; `grep -c "^    | NHL$"` over them finds one line, in `src/Desk.fs`, and no declaration in any file has it twice.

## Clauses (self-test 16 before, 21 after)

A separated probe fails the scan and names its file; its no-state remedy; the same with a run state (the proof-check remedy, no checkout); a probe directly above the last case in one file and a separated one in another; and two declarations that each have an `| NHL` of their own are clean (counted per declaration, not per file).

## Red evidence (Rule 90)

Against the scan with the separated-probe detection switched off (`const moved = []`), the self-test read 17/21, four failing: the separated probe is not found, its remedy, the run-state remedy, the two-kinds remedy. The two-declarations clause passes either way; the mutant `[text].some(...)` is what it is for. Through the harness: `node scripts/mutation-check.mjs --ids <10 ids>` read `11/11 checks passed` (baseline plus 10 caught): nine new entries and one re-anchored (`clean-source-probe-not-in-dirty`, whose find named text this change moved).

## Not verified

- Only the stand-in compiler produced the stranded states; no real `dotnet build` was run on a duplicate `| NHL`.
- A separated probe where the union's own `| NHL` has also been deleted is not found by the duplicate test (one line); only the adjacent form is, as before.
