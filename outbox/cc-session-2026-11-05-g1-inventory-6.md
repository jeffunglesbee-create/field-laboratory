# Session record: mutate-copy-check's inventory of scripts is the directory, not a list

**Date:** 2026-11-05. **Scope:** review 7, low L1 (assignment G1). New file because `check:staged-outbox` needs one under `outbox/` for a commit that stages `scripts/`; no existing outbox file is edited.

## Reproduction (Rule 100, run before building)

A scratch rig (a copy of `scripts/`) with a ninth script `scripts/mutate-zzz.mjs` written in the pre-change form (it writes `scripts/odds-coverage.mjs` and restores it), run through the checker as it stood:

    13 files named scripts/mutate-* in the rig
    checked 8 of 8 mutate scripts; 67 of 67 mutations caught inside them
    57/57 checks passed

So it reproduces: nothing looked at the directory, and the eight names were a literal. What the workflows run, by `grep` over `.github/workflows`: seven `node scripts/mutate-*.mjs` lines and four `python3 scripts/mutate-*.py` lines, 11 distinct, none of which the old list was derived from.

## What was built

- `scripts/mutate-copy-check.mjs`: the scripts to run are every file in `scripts/` named `mutate-*` except an `EXEMPT` table of four, each with a measured reason. `inventory(root)` also returns the files it cannot launch (an extension other than `.mjs` or `.py`), the workflow run lines (`node|python3 scripts/...mutate...` in `.github/workflows/*.yml`) that name a file the glob does not see (`scripts/mutate_x.mjs`, `scripts/sub/mutate-x.py`), and exemptions that name no file. One clause in the real run fails on any of the three, and the count printed with the verdict is `checked N of N mutate scripts (M files named scripts/mutate-*, K exempt)` followed by each exemption and its reason. Real run 57 to 58 clauses, now 8 checked + 4 exempt = 12 files and 11 distinct workflow run lines. `--self-test` 25 to 26 clauses: five directories of their own (clean; a ninth script; a file it cannot launch; run lines the glob does not see; an exemption naming no file), each put to the very `inventoryClause` function the real run applies.
- The four exemptions, with what was run to find the reason (2026-11-05, this tree): `mutate-copy-check.mjs` is this file. `mutate-patent-watch.py` printed `FAIL: no watcher at .../.client-src/.github/scripts/patent_watch.py` and `mutate-drama-backfill.py` printed `FAIL: no script at .../.relay-src/scripts/drama-backfill.mjs` (their verify.yml jobs check those repos out). `mutate-ppubs-probe.py` had not finished in 200 s natively, nor in 300 s under the python guard (1251 logged writes, none refused). Their sources write only inside a `tempfile.TemporaryDirectory`, but this check does not run them, so that is a reading and not a measurement.
- `scripts/mutation-check.mjs`: 12 entries added after the existing mutate-copy / mutate-push-lands entries (python not launchable, glob `.mjs` only, exempt scripts run, no stray, no unreachable, run lines compared by the wrong path, no stale exemption, run-line regex missing python, the clause vacuous or ignoring each of its three conjuncts), expect `mutate-copy-check.mjs --self-test`.

## Red evidence (Rule 90)

The new checker over the same rig with the ninth script: `checked 9 of 9 mutate scripts (13 files named scripts/mutate-*, 4 exempt)`, `FAIL  zzz: ...` on all seven clauses, `58/65 checks passed`, and `scripts/odds-coverage.mjs` byte-identical afterwards (the guard refused the write). With a workflow run line `node scripts/mutate_x.mjs` added to a private copy of the workflows: `FAIL  EVERY scripts/mutate-* FILE IS CHECKED OR EXEMPT WITH A REASON, AND EVERY WORKFLOW RUN LINE NAMES ONE (9 checked + 4 exempt = 13 files; 12 distinct run lines in .github/workflows)`. All 12 entries caught through `node scripts/mutation-check.mjs --ids ...`.

## Not verified

- The three python exemptions are not run by this check. A regression of one of them to an in-place write would pass here; they are run by their own workflows, which test their own verdicts, not that they leave the tree alone.
