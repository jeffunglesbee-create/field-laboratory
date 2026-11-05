# Session record: a test hook that is set announces itself

**Date:** 2026-11-05. **Scope:** fix stream F2, review 6, finding harness-lifecycle 3. Commit 2 of 8. New file for `check:staged-outbox`; existing outbox files are not edited.

## Reproduction (Rule 100), on the code of d4bcd69, in a scratch repository

Run on a frozen copy of the scripts of d4bcd69, in a scratch git repository, **after this commit had been made** (the commit message first said "first"; they were not run before it, and they reproduce):

```
MUTATION_FAULT=expect-interrupted node scripts/mutation-check.mjs --only known-survivor
  -> ::error::[known-survivor] its expectation was ended by SIGINT: a command that is killed has not failed ...   exit 1, no mention of the variable
MUTATION_KILL_AT=source-applied  node scripts/mutation-check.mjs --only known-survivor
  -> exit 137, no message; docs/gate-rows.txt left mutated, with the marker and the run lock in .mutation-state
node scripts/mutation-check.mjs --heal   (the next run)
  -> HEALED: a previous run was killed with [known-survivor] still applied. Restored docs/gate-rows.txt from its backup
```

Both hooks are read by any run; the self-test is the only thing that should set them. No workflow sets either, so the hazard is a leftover `export` in a developer shell: the result is red, never green, with a cause that does not point at the environment.

## What was built

- One start-up line per hook that is set, on stderr, before the state-directory guard, the locks and the heal: `test hook active: <name>=<value>`. The three hooks are `MUTATION_FAULT`, `MUTATION_KILL_AT` and `MUTATION_OUTPUT_LIMIT` (commit 1's override). Truthiness decides, because the self-test hands its children `''` for each. `MUTATION_KILL_SIGNAL` is left out: it only chooses the signal `MUTATION_KILL_AT` sends and does nothing alone.
- Named and not refused: a manual kill drill on the real tree sets these on purpose.
- One self-test clause after the E24 group: a run with all three hooks set (a fault that only reports the environment, a moment no run reaches, a limit equal to the default) prints the three lines on stderr, none on stdout, and still starts (`Mutation testing`); the control run with no hook prints none.
- Table: `test-hook-announces-nothing`.

## Red evidence (Rule 90)

Five mutants of the line, each run on a copy of the tree with the clause present (`167/167` unmutated):

| mutant | result |
|---|---|
| the announcement deleted | `166/167`, the new clause is the only FAIL |
| `console.log` instead of `console.error` | `166/167`, the new clause is the only FAIL |
| `MUTATION_OUTPUT_LIMIT` left out of the list | `166/167`, the new clause is the only FAIL |
| `MUTATION_FAULT` left out of the list | `166/167`, the new clause is the only FAIL |
| the announcement followed by `process.exit(2)` (a refusal) | `121/167`, 46 FAIL lines, the new clause among them |

Through the harness, `node scripts/mutation-check.mjs --ids test-hook-announces-nothing`: `PASS [test-hook-announces-nothing]`, `2/2 checks passed`.

## Not verified

The line was not run from a real interactive shell with a leftover export; the clause starts the real script with the variables in its environment, which is the same path.
