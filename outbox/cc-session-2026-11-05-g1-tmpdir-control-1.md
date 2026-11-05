# Session record: the mutate scripts work through a symlinked TMPDIR, and their control needs a run

**Date:** 2026-11-05. **Scope:** review 7, finding C0 (seven mutate scripts, assignment G1). New file because `check:staged-outbox` needs one under `outbox/` for a commit that stages `scripts/`; no existing outbox file is edited.

## Reproduction (Rule 100, run before building)

Setup: a real directory and a symlink to it, `TMPDIR` pointed at the symlink. Each of the seven `.mjs` scripts, unchanged tree:

| script | positive control line | verdicts | exit |
|---|---|---|---|
| claim-check, deploy-gate, odds-coverage, odds-shape-census, run-steps, replay-odds-coverage | printed | `NOT CAUGHT` for every mutation | 1 |
| deploy-landed | printed | `CAUGHT` | 0 |

Cause, shown directly: the same copied `claim-check.mjs --self-test` run from the repo directory printed 0 bytes and exited 0 when started by its symlinked path, and printed 1469 bytes by its real path. Node resolves `import.meta.url` to the real path and leaves `process.argv[1]` as the symlinked one, so `isMain()` is false and the self-test block is skipped. The old control (`exit 0`) read that as a pass.
`TMPDIR=<symlink> node scripts/mutate-copy-check.mjs --only claim-check` printed `FAIL  claim-check: runs to the end and every mutation is caught`, 5/6.
`deploy-landed` is unaffected because `deploy-landed-check.mjs` is not gated on `isMain`; `push-lands.py` has no `isMain`. Neither gets a temp-directory change, because no check could tell it from its absence.

## What was built

- Six scripts (`claim-check`, `deploy-gate`, `odds-coverage`, `odds-shape-census`, `run-steps`, `replay-odds-coverage`): `TMP` is `realpathSync(mkdtempSync(...))`.
- All eight scripts: the helper that runs `--self-test` returns true only for exit 0 AND the tally line a run prints when every check passed (`N/N checks passed`, `PASS  N/N self-tests` for replay, `self-test: N/N` for push-lands). A self-test that never ran prints nothing, so the control stops the script with its existing FAIL line. The control line, the FAIL line and the verdict lines are unchanged; the eight scripts' stdout is byte-identical to the previous tree's with a real `TMPDIR` and with a symlinked one (diffed).
- `scripts/mutate-copy-check.mjs`: every script run now has `TMPDIR` behind a symlink to a directory of its own (clause 1 therefore holds the six to the resolved directory), and a third run in which every copy's `--self-test` exits 0 printing nothing must stop the script (new clause 4). The checker went from five clauses per script to six; real run 41 to 49 clauses; `--self-test` 13 to 16 clauses (stand-ins: a copy whose temporary directory is not resolved, a control that is an exit status alone, in node and in python). The stand-in target prints its tally only when reached by its real path, as an `isMain`-gated self-test does.
- `scripts/mutation-check.mjs`: 4 entries re-anchored (the red-copy preload, the python red-copy preload, two push-lands control entries); 21 entries added after the existing mutate-copy / mutate-push-lands entries (7 on the checker, expect `mutate-copy-check.mjs --self-test`; 6 `tmp-not-resolved` and 8 `control-accepts-silence` on the scripts, expect `mutate-copy-check.mjs --only <name>`).

## Red evidence (Rule 90)

- The new checker over the OLD scripts (HEAD versions in a scratch rig): `35/49 checks passed`; `FAIL` on clause 1 for the six symlink-affected scripts, and `FAIL  <name>: a copy whose self-test never ran stops it too` for all eight.
- One entry survived its first run: `mutate-copy-check-py-silent-copy-exits-1` (the python third run exiting 1 instead of 0). No python stand-in accepted silence, so nothing observed the difference. Added `accepts-silence.py`; the entry is now caught.
- All 21 added and 4 re-anchored entries caught through `node scripts/mutation-check.mjs --ids ...`.

## Not verified

- No macOS run. The symlink is a Linux symlink to a real directory, which takes the same code path (`os.tmpdir()` from `$TMPDIR`, `argv[1]` unresolved).
- The mutation-check full table was not run (the owner runs the gate once).
