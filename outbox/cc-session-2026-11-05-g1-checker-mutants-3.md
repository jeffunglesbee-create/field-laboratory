# Session record: two surviving mutants of mutate-copy-check.mjs are killed

**Date:** 2026-11-05. **Scope:** review 7, low L4 (assignment G1). New file because `check:staged-outbox` needs one under `outbox/` for a commit that stages `scripts/`; no existing outbox file is edited.

## Reproduction (Rule 100, run before building)

The two mutants, applied one at a time to a scratch copy of `scripts/mutate-copy-check.mjs` on the tree after the two previous commits of this stream:

| mutant | `--self-test` | `--only claim-check` |
|---|---|---|
| `controlled: /^positive control: the unmutated copy passes$/m.test(a.out)` to `/positive control/.test(a.out)` | 18/18 checks passed | 8/8 checks passed |
| `completes: a.status === 0 && ...` with `a.status === 0 &&` removed | 18/18 checks passed | 8/8 checks passed |

Both survive, as the review said.

## What was built

- Two stand-ins in `scripts/mutate-copy-check.mjs`: one whose "control" is only near misses (another verdict, the sentence with a prefix, the sentence with a suffix: three lines, so that dropping the start anchor, the end anchor or the whole sentence each reads one as the control), pattern `TFTTTTT`; one that prints `1 of 1 mutations caught.` and then exits 1, pattern `FTTTTTT`. `--self-test` 18 to 20 clauses.
- `scripts/mutation-check.mjs`: 4 entries added after the existing mutate-copy / mutate-push-lands entries (the reviewer's two mutants, plus the two single-anchor variants of the first that the near-miss stand-in also kills), expect `mutate-copy-check.mjs --self-test`.

## Red evidence (Rule 90)

Each mutant against the new self-test, in a scratch rig: the reviewer's first mutant `19/20`, red clause `A COPY-BASED STAND-IN WHOSE CONTROL LINES ARE ONLY NEAR MISSES ... FAILS ONLY THE PRINT CLAUSE`; both anchor variants the same; the second `19/20`, red clause `A COPY-BASED STAND-IN THAT PRINTS N of N AND THEN EXITS NON-ZERO FAILS ONLY THE COMPLETION CLAUSE`. All four entries caught through `node scripts/mutation-check.mjs --ids ...`.

## Not built

The review also lists three greens it calls equivalent or dead (an fd filter in the python hook, `len(argv) > 1`, redundant count conjuncts). They are not findings and were not probed here, so this record does not vouch that they are equivalent.
