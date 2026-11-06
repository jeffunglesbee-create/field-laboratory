# Session record: eight survivors of the new `--stranded` and preflight code get a clause each (review 7, L6)

**Date:** 2026-11-05. **Scope:** `scripts/mutation-check.mjs` (self-test clauses and table entries). Fix stream R1, commit 5. No behaviour changes: every mutant below is a one-line change to code that was already right, and every clause is new coverage. This file exists because `check:staged-outbox` requires an `outbox/` path in every commit that stages `scripts/`.

## Reproduction (Rule 100)

Each of the reviewer's eight mutants applied alone to a copy of the tree (scripts, package.json and the hook, a throwaway git repository around them) and `--self-test` run there. Before this commit, on the tree with the message rewrite of commit 3 (206/206 clauses):

| mutant | self-test result | survived? |
|---|---|---|
| G1: preflight `status !== 0` -> `status === 1` | 206/206 | yes |
| G2: preflight drops the check's stderr | 206/206 | yes |
| S5: `--stranded` ignores `MUTATION_STATE_DIR` | 206/206 | yes |
| S6: `isLive({ pid })`, no start time | 206/206 | yes |
| S10: the "Wait for pid N" sentence deleted | 205/206 | no, commit 3's live clause asserts the sentence now (at the commit the review looked at, it did not) |
| M13: the "would carry the mutation" middle of the applied message deleted | 206/206 | yes |
| H1: `exit 0` inserted above the hook's `check:mutation-anchors` line | 206/206 | yes |
| M16: only the first marker reported | 206/206 | yes (not equivalent: the second marker's message is missing, only the exit status and the count are the same) |

Seven survive, S10 was closed by the message commit. None is an equivalent mutant.

## What was built

Five clauses and one extension, each next to the group it extends:

- **S5**: `--stranded` over a tree whose state sits in `elsewhere/`, asked with `MUTATION_STATE_DIR=elsewhere` (must refuse, name `elsewhere/active.json`, count it) and without it (must exit 0, the control that the variable and nothing else finds the marker). Directory byte-identical both times.
- **M16**: markers in `.mutation-state` and in `.mutation-state/nested` at once, with different ids: one message each, "2 hold a marker".
- **S6**: a marker whose pid is alive (this process) and whose recorded start time is not: the killed-run message, not IN PROGRESS; `--heal` over a copy restores the file, so the sentence agrees with the heal. Built only where /proc is readable (the start time cannot be told otherwise).
- **M13**: the existing "REFUSES A REAL STRANDED STATE" clause now also asserts the sentence "this mode does not undo it: a commit or a gate run over this tree would carry the mutation. Heal it first".
- **H1**: the real `.githooks/pre-commit` run in a directory of its own with an `npm` stand-in that logs and can be told to fail one script: with all passing it must ask for `check:mutation-anchors` exactly once and finish; with that script failing it must exit non-zero, not finish and ask for nothing after it. The existing clause only reads the file for the line, which `exit 0` above it leaves in place.
- **G1 and G2**: the real `confidence.mjs` copied next to a stand-in `mutation-check.mjs` (the preflight finds the check by its own directory), with the three modules it imports linked in: a check that exits 2 after writing to both streams (gate exits 2, both lines printed, "exited 2"), one that kills itself ("did not finish"), one that exits 0 (not refused; goes on to the inventory, which the scratch directory lacks).

Self-test 207 -> 212 clauses. Eight new table entries, one per mutant above plus `gate-preflight-calls-a-killed-check-an-exit` (the null-status label the kill stand-in also holds): `stranded-live-ignores-the-start-time`, `stranded-mode-names-only-the-first-marker`, `stranded-mode-ignores-the-state-dir-variable`, `stranded-applied-without-the-consequence`, `gate-preflight-refuses-only-status-one`, `gate-preflight-drops-the-checks-stderr`, `gate-preflight-calls-a-killed-check-an-exit`, `hook-exits-before-the-mutation-anchors-line`. All eight `expect` a self-test.

## Red evidence

Each entry applied alone to a copy and the failing clause read (211/212 each, the one clause that fails is the one written for it): the recycled-pid clause, the state-directory clause, the both-markers clause, the "REFUSES A REAL STRANDED STATE" clause, the hook clause, and the gate stand-in clause (three entries). Then the 17 entries of this group (the 8 new, the 6 existing preflight and hook entries, and 3 neighbours) through the real harness in two copies of the tree: 10/10 and 9/9 checks passed, baselines included.

## Not verified

- G1 and G2 are held against a stand-in check, not against a real `--stranded` that exits 2 or crashes; the preflight's behaviour is a function of the child's status and streams only, which is what the stand-ins set.
- The hook clause runs the hook with `npm` stubbed: it shows the hook reaches the line and stops at its failure, not that `npm run check:mutation-anchors` passes (the commit itself does that).
