# Session record: the self-test removes its state directory from the line that makes it

**Date:** 2026-11-05. **Scope:** review 6, lens "harness heal", finding 5 (`harness-heal.json`, n 5). Stream F3, commit 7 (the last). Touches `scripts/mutation-check.mjs` only: where two exit handlers are registered, one test-only fault, one clause, three table entries in place of one.

**Why this file exists.** `check:staged-outbox` requires an `outbox/` path in every commit that stages `scripts/`. New file, nothing existing touched; fold it into the session document or drop it when merging.

## Reproduction (Rule 100)

A copy of the previous commit's script with `throw new Error('injected')` inserted after `const real = process.env.MUTATION_STATE_DIR || '.mutation-state'` in the self-test, run as `TMPDIR=<empty dir> node scripts/mutation-check.mjs --self-test`: exit 1, and the TMPDIR held `mutation-state-YDzUZy`. Reproduced as the reviewer reported (theirs: `mutation-state-MpP87T`). The same throw on the new code leaves the TMPDIR empty.

## What was built

- The state directory's removal is registered on the line after the `mkdtemp` that makes it (module level, only for `--self-test`; the real state directory is never touched by it). It used to be registered after the scratch directory was made, so anything that threw in between leaked a directory per run.
- The scratch directory's removal is registered on the line after its `mkdtemp`.
- A test-only fault, `MUTATION_FAULT=self-test-crashes-early`, throws where the scratch directory is about to be made (after the state directory exists, before the scratch directory does): the window the review found.

## Clause (self-test; 176 before, 177 after)

E25, next to the existing crash clause: the self-test started with that fault and an empty TMPDIR exits 1 with the fault named in its report and leaves nothing in the TMPDIR (1 directory made by then).

## Red evidence (Rule 90) and entries

The old combined entry `crash-leaves-the-self-test-directories` anchored on the one handler that no longer exists, so it is replaced by three, each run through the harness: `crash-leaves-the-self-test-scratch-directory` and `crash-leaves-the-self-test-state-directory` (each registration deleted; caught by the existing E25 clause, as the review found for the old entry) and `self-test-state-directory-removal-registered-late` (a throw point placed before the registration, which is "the handler moved back": caught only by the new clause). The old id is named in `outbox/cc-session-2026-11-05-harness-heal-1-selftest-crash-dirs.md`; that note is not edited. Through the harness with two neighbours that anchor on the lines around (`self-test-uses-the-real-state-dir`, `self-test-honours-the-env-var`): `6/6 checks passed`, tree restored. In place, the `registered late` mutant alone fails exactly the new E25 clause (176/177). All run `--self-test`.

## Not verified

A SIGKILL cannot be covered by any handler and is not claimed to be. The reviewer's other three injection points (after `let caseNo`, after the day constant, after the decoy) were already clean on the previous commit and are not re-run.
