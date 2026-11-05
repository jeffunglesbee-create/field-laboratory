# Session record: mutate-copy-check holds the mutate scripts to removing their temporary copy

**Date:** 2026-11-05. **Scope:** review 7, low L0 (assignment G1). New file because `check:staged-outbox` needs one under `outbox/` for a commit that stages `scripts/`; no existing outbox file is edited.

## Reproduction (Rule 100, run before building)

On the tree before this commit, with the exit handler `process.on('exit', () => rmSync(TMP, ...))` deleted from a copy of `mutate-run-steps.mjs` in a scratch rig, and a private `TMPDIR`:

    TMPDIR=<own dir> node scripts/mutate-copy-check.mjs --only run-steps
    -> all clauses PASS, 6/6 checks passed
    ls <own dir>
    -> mutate-run-steps-UKt6Cz  mutate-run-steps-j2dzQG        (one directory per run)

So the finding reproduces: nothing asserted that the copy is removed on exit.

## What was built

- `scripts/mutate-copy-check.mjs`: clause 7 per script. Each of the three runs of a script has a private `$TMPDIR` (behind the symlink added by the previous commit); the clause needs a write under that directory in the guard's log (so a script that keeps its copy elsewhere cannot pass by leaving `$TMPDIR` empty) AND an empty `$TMPDIR` after each of the three runs (a pass, a stop on a red copy, a stop on a silent copy). Real run 49 to 57 clauses; `--self-test` 16 to 18 clauses.
- Stand-ins: one that never removes its copy, one that removes it only when it gets past the control. Existing patterns gain a seventh character. The "writes nothing" stand-in now fails the cleanup clause as well as the wrote-elsewhere one (with no logged write under `$TMPDIR` the cleanup cannot be vouched for); the in-place stand-ins fail every clause.
- `scripts/mutation-check.mjs`: 12 entries added after the existing mutate-copy / mutate-push-lands entries: 4 on the checker (the clause vacuous, checked on the plain run only, not requiring a write, wired to another fact), expect `mutate-copy-check.mjs --self-test`; 8 on the scripts (7 deleted exit handlers, 1 python `TemporaryDirectory` replaced by `mkdtemp`), expect `mutate-copy-check.mjs --only <name>`.

## Red evidence (Rule 90)

- The deleted-handler reproduction against the new checker: `FAIL  run-steps: removes its temporary copy when it ends, whether it passes or stops (nothing is left in $TMPDIR)`, 7/8.
- All 12 added entries caught through `node scripts/mutation-check.mjs --ids ...`; none survived.

## Not verified

- No leak path other than a missing exit handler was tried against the real scripts; a script killed by SIGKILL leaves its directory by design (the premise of the whole change), and the check does not claim otherwise.
