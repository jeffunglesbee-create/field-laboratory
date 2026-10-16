# Four mutation anchors that matched nothing — 2026-10-16

**State:** fixed in `scripts/mutation-check.mjs`. Each re-anchored mutation is
caught on its own (`--only`, output below), and the full gate passes every row:
run `1b1fd5670499-93f09fbbc781` in `docs/confidence-log.jsonl`, 530/530, 3438 s,
on a tree carrying this fix plus the empowerment Task 0 files.

## What failed

Gate run on the empowerment Task 0 tree (2026-10-15 23:23 ET, 3405 s), row 16,
verbatim:

```
  FAIL   0/20  breaking each invariant makes a check fail
  510/530 points = 96/100   (bar: 95)   3405s
  1 FAILING ROW(S). Do not commit.

    $ node scripts/mutation-check.mjs
      FAIL  [red-main-softened] the mutation anchor still exists
            → not found in scripts/status.mjs: return `**${run.conclusion.toUpperCase()}** on \`${sha}\` — [run ${run.id}](${run.html_url})`
      FAIL  [stalled-run-reads-as-running] the mutation anchor still exists
            → not found in scripts/status.mjs: if (idleMs > STALL_MINUTES * 60_000) {
      FAIL  [unreadable-history-swallowed] the mutation anchor still exists
            → not found in scripts/status.mjs: return { text: `unreadable — the workflow-history API answered ${res.status}`, problem: `HTTP ${res.status}` }
      FAIL  [verify-panel-drops-a-group] the mutation anchor still exists
            → not found in src/Suite.fs: "Tennis draws", draw () ]
```

None of the four files was touched by the Task 0 work. The tree under test
differed from `main` only by three new, untracked files. That run's own record
(`1b1fd5670499-510d9ce111b4`) is not in the log: it was discarded when the tree
was restored after the mistake described at the end, so the output above is
the evidence for it.

## Why

Two commits on 2026-10-11 rewrote the code the anchors quote:

| mutation | anchor quoted | what the code says now | changed by |
|---|---|---|---|
| `red-main-softened` | one-line `return` ending `— [run …](…)` | two lines, with `${stepClause(summary)}` before the link | `d730ed6` |
| `stalled-run-reads-as-running` | `if (idleMs > STALL_MINUTES * 60_000) {` | `return idleMs > STALL_MINUTES * 60_000 ? 'unknown' : 'in-flight'` inside `mayDeploy` | `d730ed6` |
| `unreadable-history-swallowed` | `{ text, problem }` | `{ text, problem, decision: 'unknown' }` | `d730ed6` |
| `verify-panel-drops-a-group` | `"Tennis draws", draw () ]` closing the list | `"Lineups", lineups () ]` now closes it | `ec479e2` |

The harness refused to report these as survivors, which is the Rule 90
corollary working: an anchor that is not found is a FAIL, not a NOT CAUGHT.
What it costs is that the four claims went undefended, and row 16 stayed red,
until someone re-anchored them.

## What changed

Each mutation keeps its claim, its `expect`, and the same break:

- `red-main-softened`: the two-line return is replaced by `**green** on <sha>`.
- `stalled-run-reads-as-running`: the stall ternary's condition becomes `false`.
- `unreadable-history-swallowed`: `problem` becomes `null`, `decision` kept.
- `verify-panel-drops-a-group`: the last declared group (`Lineups`) is dropped.

## Proof each one bites

`node scripts/mutation-check.mjs --only <id>`, one at a time, unmutated tree
first (the harness's own baseline), local server up for the page check:

```
PASS  the unmutated tree passes every expectation
PASS  [red-main-softened] a failing verify run is reported as failing
PASS  the unmutated tree passes every expectation
PASS  [stalled-run-reads-as-running] a run stuck in progress is called stalled, not running
PASS  the unmutated tree passes every expectation
PASS  [unreadable-history-swallowed] a workflow-history read that the API rejects is reported as a problem
PASS  the unmutated tree passes every expectation
PASS  [verify-panel-drops-a-group] every check DECLARED in the suite source reaches the page
```

Each `PASS [id]` line means the mutation was applied and its expectation went
red. Coverage: these are 4 of the suite's 108 mutations; the other 104 were
not re-run in isolation, and the full gate is what covers them.

## A mistake made while doing this

Checking the edited file loaded with `import()` ran it — `mutation-check.mjs`
executes on import — and started a full mutation run in the background. It was
killed by pid. Before restoring anything, the two backups it had taken
(`.mutation-state/src_Pickem.fs`, `.proof-state/Scoreboard.fs.bak` plus the
`Desk.fs` registry copy) were compared byte for byte against `HEAD` and matched.
The tree was then restored with `git checkout --` and both state directories
removed. `node --check` is the syntax check for these scripts, not `import()`.
