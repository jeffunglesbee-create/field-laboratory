# Session record: `--stranded`, a read-only mode that refuses a tree a killed run left mutated

**Date:** 2026-11-05. **Scope:** residuals CC-CMD `docs/CC-CMD-2026-11-03-gate-hazard-residuals.md`, Task 8, the item "the gate row and the pre-commit hook do not run `--heal` first". Assignment D2, commit 1 of 2 (the mode, its clauses and its table entries; the wiring is commit 2). `scripts/mutation-check.mjs` only.

**Why this file exists.** `check:staged-outbox` requires an `outbox/` path in every commit that stages `scripts/`, and the assignment says not to edit existing outbox files. New file, nothing existing touched; fold it into the session document or drop it when merging.

**The owner's decision, 2026-11-05:** refuse, do not heal. A heal writes files, and for a source file it runs `npm run build`; a commit hook has no business rewriting the tree of the commit it is part of.

## Probes before building (Rule 100)

Both on this clone (HEAD `b05dc5a`), with the real script, 2026-11-05.

1. **Does a killed run's state pass the hook's script today?** `MUTATION_KILL_AT=world-applied node scripts/mutation-check.mjs --only outbox-stub` (SIGKILL, exit 137), then `npm run --silent check:mutation-anchors; echo $?`. Output: 46 `outbox/*.md` files modified in `git status`, `hook script exit 0`, `checked 647 of 650 mutation anchors; 0 stale`, then the self-test's `::warning::.mutation-state/active.json is a mutation a killed run left applied ([outbox-stub] on the tree)...` and 156/156. **The premise holds for a stranded change made outside the source: the hook passes.** Healed afterwards (`--heal`, exit 0, tree clean).
2. **Is a stranded source file also passed?** Same, with `MUTATION_KILL_AT=source-applied ... --only known-survivor` (`docs/gate-rows.txt` mutated). Output: `hook script exit 1`, `checked 647 of 650 mutation anchors; 1 stale`, `STALE  known-survivor: not found in docs/gate-rows.txt`. **The spec's premise is half wrong here:** the hook's anchor check already fails on a stranded source file, by accident (the file no longer holds the text the entry looks for), and names a stale table entry, which sends a reader to the wrong file. It would not fail when the replacement contains the original text, and never for a world mutation or a nested marker. The self-test half alone, run on the same state, exits 0 with only the warning (the measurement the spec was written from). Healed afterwards.

## What was built

`--stranded` in the main flow of `scripts/mutation-check.mjs`, directly after `--anchors` (before `--list-ids`, the state-directory guard, the run lock, the heal and the exit handlers). It reads `<state dir>/active.json` and `<state dir>/nested/active.json`, prints one line per marker that exists, then `checked 2 marker files (...); N hold a mutation a run left applied` (Rule 91: the denominator is in the output), and exits 1 if any exists, 0 if none.

- A marker whose run is dead: `::error::<file> is a mutation a killed run left applied ([id] on <file or "the tree">). Nothing was touched, ... Heal it first: node scripts/mutation-check.mjs --heal`.
- A marker whose run is alive (`isLive` from `run-marker.mjs`): `names pid N, which is still running: [id] on <file> is applied by a mutation run that is IN PROGRESS ... Wait for pid N to finish`. Not the heal command: `--heal` would refuse it.
- A marker that does not parse, or a world mutation's (no `file`): named `[unknown]` / `the tree`.

**The trap the previous stream found.** `stateDir`, `marker` and `healHeld` are consts defined further down; a mode that exits above them cannot call or read them (a ReferenceError, not a refusal). The block reads its own directory with the expression `stateDir` uses for a real run, and uses only imports (`join`, `existsSync`, `readFileSync`, `isLive`). Because it sits above `--self-test`'s `mkdtempSync`, `--stranded --self-test` creates no temp directory either.

**A regression caught on the way (`--anchors`, not a clause).** The first version of the message ended `...--heal\`)` and a newline and two spaces and `}`, which is exactly the anchor of the existing entry `self-test-heals-a-stranded-state`; `--anchors` reported it AMBIGUOUS, and the entry would have mutated the new block instead of the self-test's warning. The message is built into a variable and logged on its own line, and `--anchors` is back to 0 stale / none ambiguous (656 of 659 checked; the other 3 are world mutations).

## Clauses (self-test, real-script group; 156 before, 162 after)

Each starts the real script in a scratch directory and compares EVERY file in it (content hash) before and after, because "touched nothing" is a claim about the whole directory.

| clause | covers |
|---|---|
| refuses a real stranded state and touches nothing | the healable fixture from the previous commit: exit 1, id, file, `--heal`; 3 files byte-identical |
| lets through a directory with no marker | empty directory, and one holding only a stale run lock (left in place); `checked 2 marker files` |
| refuses a marker a nested run stranded | only `nested/active.json` present |
| does not call a live run a killed one | marker naming the self-test's own pid: IN PROGRESS, no `--heal` |
| comes before the heal and the run lock | `--stranded --heal` over a marker plus a stale lock: refuses, 4 files byte-identical |
| names a marker by what it holds | world marker `[outbox-stub] on the tree`, torn marker `[unknown] on the tree`, no `undefined`, no stack |

## Red evidence (Rule 90)

**Without the mode** (`no-stranded-mode`, `if (false) {` in place of the condition, run by hand): `156/162 checks passed`, six FAIL lines, one per clause above. **With it:** `162/162` (19.8 s, not an idle figure: three streams share this machine). By hand, the clauses that fail per entry: `stranded-mode-exit-inverted` 6; `stranded-mode-refuses-a-directory-with-no-marker` 1 (the no-marker clause); `stranded-mode-heals` 4 (refusal, nested, live, order); `stranded-mode-skips-a-nested-marker` 2 (nested, and the no-marker clause's `checked 2`); `stranded-mode-reads-a-live-run-as-killed` 1; `stranded-mode-waits-for-the-heal` 1 (order); `stranded-mode-prints-undefined` 1; `stranded-mode-crashes-on-a-torn-marker` 1 (a `SyntaxError` stack, exit 1, no message).

**Placement below the run lock** (the block moved after `checkLocks`, by hand, not a table entry): `160/162`, the no-marker clause and the order clause fail (the stale lock is removed).

**Through the harness**, `node scripts/mutation-check.mjs --ids <the 9 ids>`: `10/10 checks passed` (baseline plus 9 of 9 caught), 4 m 07 s, tree restored. Nine entries, every one's `expect` is `--self-test`; at 20 to 60 s each this is the gate-time cost of the commit (about 2.5 minutes of the mutation row, not an idle figure).

## Not verified, and not covered

- A kill during one of this mode's own entries leaves the mode itself mutated, so the refusal can be absent exactly when needed. `--heal` has the same limit (it lives in the same file), and `git status` shows the file.
- A marker's pid that is alive but is not a harness run (a recycled pid with no readable `/proc`) reads as IN PROGRESS: `isLive` falls back to the signal there (`run-marker.mjs` says so).
- **The self-test's own tail can be lost when its stdout is a pipe, and this change did not cause it.** Batches of the nine entries through a `spawnSync` consumer printed no summary line for 1 of 9 entries in one batch and 2 of 9 in the next (their FAIL lines and exit codes were intact; the output simply ended inside the last group of usage clauses). Measured on the UNMUTATED tree: `--self-test` through `spawnSync`, 12 runs, three at a time, 1 lost its tail (159 of 168 lines, no summary, exit 0). It is the `process.exit(summarize...)` at the end of the self-test with a pipe behind it, the phenomenon `scripts/check-exit-drains.mjs` documents. Not fixed (Rule 69). The new mode's own output was measured the same way: `--stranded` over the stranded fixture, 600 runs four at a time through `spawnSync`, 0 lost lines and 0 wrong statuses.
- Nothing here wires `--stranded` into the hook or the gate: commit 2.
