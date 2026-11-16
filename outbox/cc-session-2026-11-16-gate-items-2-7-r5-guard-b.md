# Round 5 of items 2 to 7, the Chromium guard, part B: B0 B8 B9 A21 A22 A23 (session note, 2026-11-16)

Branch `proof-r5-guard-b`, from `proof-r5-guard-a` (674c5f99, which holds part A). Files: `scripts/check-browser-gate.py`, the mutation table in `scripts/mutation-check.mjs` (entries
`browser-gate-heads-*`, inserted before the `venue sourcing` header) and, for one consequence of A23 (below), the two ledger steps of `.github/workflows/verify-full.yml`. The record being
answered is `outbox/review-round-5-findings-2026-11-16.md`. One commit per cluster closed by one construction.

Method for every clause: the fixture is written in the guard's own `--self-test` (literal lists asserted equal to the constant), then the clause is broken by ONE find/replace (anchor
asserted to occur exactly once and to change the file) and the break is shown red twice: by `node scripts/mutation-check.mjs --only <id>` (`PASS [<id>]` = the mutated tree's self-test
failed) and by running the mutated COPY's self-test to count its FAIL lines (so a crash is not mistaken for a catch).

Baselines at the start of this branch (its base is part A, not 9043fa75, so the self-test count is 812, not 715):
`python3 scripts/check-browser-gate.py --self-test` 812/812; `python3 scripts/check-browser-gate.py` `verdict: gated`, `--plain-commands` 70 commands.

## Classification (Rule 77: what an ordinary edit would do)

| item | class | why |
|---|---|---|
| B0, B8 (a `;` `|` `&` `(` in an echo message, or in a trailing comment, on an unreadable always() line) | REACHABLE | `echo "tried 3 times; giving up at $(date)"` and `echo "at $(date) (utc)"` are ordinary log lines; two real steps of this repo's .github flipped from kept to refused (drift-sentinel `Append to the drift log` and font-dependence-probe `Commit`) |
| A21 (a launcher after a case pattern's `)`) | CONTRIVED as an input, closed BY CONSTRUCTION | a launcher in a case arm on a line that also holds a quoted substitution; one more position in COMMAND_HEAD closes it |
| A22 (a launcher after a leading redirect) | CONTRIVED as an input, closed BY CONSTRUCTION | `>/dev/null timeout 5 ./x.sh` is unusual; the same table of positions closes it |
| A23 (`sed`, `awk`, `sort`, `tee`, `rm`, `cp`, `mv`, `uniq` read as "runs no other command") | REACHABLE for the writers (`tee`, `cp`, `mv`, `rm`: an ordinary cleanup or log line), CONTRIVED for the exec forms (`awk system()`, `sed e`); one whitelist change closes both | |
| B9 (the vacuous `xargs -r` fixture) | REACHABLE in the sense that matters: a fixture that cannot fail pins nothing | |

## Commit 1: the two ledger steps of verify-full strip the diff's `+` with `cut`, not `sed` (the real tree difference of A23)

A23 removes `sed` from BENIGN_HEADS (below), and `sed` IS used by an audited job: the `full` job of `.github/workflows/verify-full.yml` has two `if: always()` steps the guard keeps
as opaque (`not read, always() (kept): 2`), and both read the ledger's new line back with `git diff -- "$LEDGER" | grep '^+' | grep -v '^+++' | sed 's/^+//'`:

| step | line | before | after the A23 change alone |
|---|---|---|---|
| `Keep the mutation baseline` | 325 | kept | refused (`sed` can run a command: `e`, `s///e`) |
| `Record this measurement` | 384 | kept | refused |

The real tree would have stopped saying `verdict: gated` (6 problems, `could not be read (refused): 2`). Rule: the list is not weakened. The two steps are rewritten with `cut -c2-`, which
is in the list for what it does (it prints). It is the same edit: `grep '^+'` keeps only lines that start with `+`, `grep -v '^+++'` drops the diff header, and `sed 's/^+//'` removes the
first character of each; `cut -c2-` removes the first character of each. Proved, not argued:

- `node scripts/gate-ledger-step-check.mjs` runs the REAL text of the two steps against a bare origin and a racing clone: 6/6 checks passed before the edit and 6/6 after (5 scenarios,
  quiet branch, branch moved, other file dirty, no confidence line, every push refused).
- `cmp` of the two pipelines over a 7-line diff sample (unicode, an empty record, a tab, leading spaces, a `+++` header, a context and a removed line): identical bytes under
  `LC_ALL=C`, `C.UTF-8` and `en_US.UTF-8`.

This commit is on its own so it can be taken or dropped with the A23 commit that needs it (it does not depend on it: `cut` is in the list today, the real tree is `gated` with and
without it).
