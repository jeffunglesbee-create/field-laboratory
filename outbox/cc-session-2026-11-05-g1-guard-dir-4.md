# Session record: the mutate-copy guards refuse to move or remove scripts/ itself

**Date:** 2026-11-05. **Scope:** review 7, low L2 (assignment G1). New file because `check:staged-outbox` needs one under `outbox/` for a commit that stages `scripts/`; no existing outbox file is edited.

## Reproduction (Rule 100, run before building)

The two guards extracted from `scripts/mutate-copy-check.mjs` as they stood, run in a scratch root holding `scripts/{target.mjs,target.py,sub/x.py}`:

    python guard:  os.rename(scripts -> scripts.bak): ALLOWED
                   shutil.rmtree(scripts): ALLOWED         scripts exists afterwards: False
                   log: WROTE ROOT/scripts, WROTE ROOT/scripts.bak, WROTE ROOT/target.py, WROTE ROOT/target.mjs, WROTE ROOT/x.py
    node guard:    renameSync(scripts -> scripts.bak): ALLOWED   (logged WROTE ROOT/scripts)
                   rmSync(scripts, recursive): EACCES, but only because the inner unlink of sub/x.py hit the patched unlinkSync

So the finding reproduces. Python's `rmtree` unlinks relative to a directory descriptor, so the files go as unrelated `WROTE` lines (the descriptor-relative paths resolve against the current directory), and a rename of the directory is a `WROTE` line too.

## Reachable, so guarded

Moving or removing `scripts/` is a natural way to write an in-place mutate script (swap in a whole mutated tree, put the original back), not only a contrived one, and clause 4/6 of the checker would have counted the logged lines as the script "writing somewhere else". So both guards now test `under(path)`: the path is under `scripts/` or is `scripts/` itself.

## What was built

- `scripts/mutate-copy-check.mjs`: `under` in the node preload and in the python audit hook; the header says "under scripts/" includes the directory itself; one self-test clause (`--self-test` 20 to 21 clauses): both guards, in a root of their own where `scripts/` is EMPTY, must refuse a rename and a recursive removal of it and log four refusals. Empty, so that no refused write inside it can be what stops the call.
- The two `probe` runs still passed the old boolean as the fault argument (left over from the first commit of this stream); that set `MC_COPY_FAULT=false` in the probe's environment. Harmless there (no `--self-test` in the probe's argv) but wrong; the arguments are removed.
- `scripts/mutation-check.mjs`: 4 entries added after the existing mutate-copy / mutate-push-lands entries (node and python, each: directory not covered, directory covered but not paths under it), expect `mutate-copy-check.mjs --self-test`.

## Red evidence (Rule 90)

Each guard as it was, against the new self-test: `20/21 checks passed`, red clause `BOTH GUARDS REFUSE TO MOVE OR REMOVE THE scripts/ DIRECTORY ITSELF ...` (node and python). All 4 entries caught through `node scripts/mutation-check.mjs --ids ...`.

## Not verified

- `fs.rmdirSync`, `fs.mkdirSync` and `os.rmdir` / `os.mkdir` of the directory are not guarded (they are in the list of unguarded forms the next commit of this stream prints and verifies).
