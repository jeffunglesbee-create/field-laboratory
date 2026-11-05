# Session record — table entries for the mutate-copy check (residuals Task 2, commit 2 of 2)

Date 2026-11-05. Scope: `scripts/mutation-check.mjs`, table entries only. They prove
the clauses of `scripts/mutate-copy-check.mjs` and the seven converted scripts
(`docs/CC-CMD-2026-11-03-gate-hazard-residuals.md`, Task 2). Nothing else changed.

## Premise commands, run first
- `node scripts/mutation-check.mjs --anchors` before the entries: `checked 647 of 650
  mutation anchors; 0 stale`. After: `checked 684 of 687 mutation anchors; 0 stale`
  (37 new anchors, each unique in its file: the generator asserted it).
- the targets exist at the commit the entries were written against (615d5f4), and
  `--ids` baseline over the 8 distinct expectations: `ran 8 of 8 ... 0 failing`.

## Built: 37 entries
- 7 `mutate-<name>-writes-the-tracked-file`: the loop writes `F` again instead of the
  copy. Expectation `node scripts/mutate-copy-check.mjs --only <name>`.
- 7 `mutate-<name>-positive-control-deleted`: the control and its printed line are
  both removed.
- 7 `mutate-<name>-positive-control-unenforced`: only the enforcing line is removed,
  the printed line stays. This one is not in the CC-CMD's design; it is what the
  fifth clause (a second run in which every copy is red) exists to catch.
- 16 `mutate-copy-check-<id>` on the checker, expectation `--self-test`: the guard
  never blocks, logs no BLOCKED line, protects the wrong root, judges a copy by its
  source, judges a rename by one end, drops `truncateSync`; the tree, tally, print,
  wrote-elsewhere and enforcement clauses each made vacuous (the last also with
  its status half and its message half dropped in turn); the second run made inert;
  a verdict wired to the wrong fact.

## Red evidence
All 37 through the harness: `node scripts/mutation-check.mjs --ids <the 37>` printed
`PASS` for each and `38/38 checks passed` (37 plus the unmutated-tree line), 54.7 s
wall on a machine shared by three streams. For the reason each is red, each find was
applied by hand in a scratch copy of the tree and its expectation run there:
the 7 write entries fail `runs to the end` and `calls none of the 7 guarded fs write
functions`; the 7 deleted entries fail `prints the positive control` and `a copy that
cannot run stops it`; the 7 unenforced entries fail only the second. The 16 checker
entries fail between 1 and 8 clauses of `--self-test`, never zero; the two that
isolate one half of the enforcement clause (`refuses-ignores-status`,
`refuses-ignores-message`) are each caught by a different single stand-in.

## Not verified
- 21 of the 37 entries run the real mutate scripts (about 1.4 s each); 16 run the
  checker's own `--self-test` (about 1.4 s each). Timings are from a shared 4-core
  container, not a runner, and not an idle figure.
