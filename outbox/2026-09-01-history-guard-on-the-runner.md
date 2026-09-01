# The fourth boundary move, and the guard that could not have stopped it

`verify` went red on main for three consecutive runs (246, 247, 248) with a
message that named me:

```
FAIL  2 commit(s) changed source without an outbox entry:
      -> 304b459  generated: team colours table [skip ci]
      -> c6e8686  generated: team colours table [skip ci]
```

Both commits are real violations, correctly surfaced, and both were written by
`.github/workflows/generate-team-colours.yml` — a workflow I added the same day.

## Why the guard did not fire

`.githooks/pre-commit` runs `scripts/staged-outbox-check.mjs`, which asks exactly
this question and refuses the commit. It could not have fired. Both commits were
made by a GitHub Actions runner, and a workflow's `git commit` never consults
`core.hooksPath` — the runner is a fresh checkout that never ran
`scripts/install_pkgs.sh` and has no reason to.

The 2026-08-23 entry in `docs/history-boundary.txt` diagnosed the third move as
"an opt-in guard that nothing opted into". This is that sentence one level out:
a **local** guard cannot cover a **remote** committer, and this repo acquired its
first workflow that commits source on 2026-09-01. The guard was never bypassed.
It was never in the path.

That file also said what to do here, in advance:

> If it moves a fourth time, the guard above was bypassed or removed, and THAT
> is the thing to investigate — not the commits.

## What shipped

Three changes, in the order they matter:

1. **`scripts/generate-team-colours.mjs` writes its own outbox entry.** The
   provenance file — entry count, league count, the date the ESPN endpoints were
   read, the slate swept, and every name dropped for resolving to two colours —
   is written immediately after `src/TeamColours.fs`, from the same variables
   that produced the table. It is real provenance, not a placeholder to satisfy a
   regex. Written *after* the table deliberately: a throw inside `renderModule`
   must not leave an entry describing a table that does not exist.

2. **The workflow asks the local hook's predicate explicitly.** Before
   `git commit`, the commit step runs `node scripts/staged-outbox-check.mjs`
   against the staged set. Same script, same predicate, moved to the only place
   that can act on it in CI.

3. **`docs/history-boundary.txt` moves to `d917dc97` / 24.** Derived as 22 + 2:
   run 246 reported 22 predating commits against `c31b94e` and named exactly two
   governed violations. `d917dc97` is the first commit after them that obeys the
   rule affirmatively — it ships `src/Desk.fs`, `src/Palette.fs`,
   `src/Scoreboard.fs` and two scripts beside
   `outbox/cc-session-2026-09-01-team-tints.md`. The boundary lands on a commit
   that demonstrates the rule rather than one that merely avoids it.

## The count was derived locally, which the last two entries would have flagged

Both prior entries warned that a cloud session's clone is shallow and any local
count from it is meaningless. This clone is not shallow: `git rev-parse
--is-shallow-repository` is `false` and `git log --oneline | wc -l` is 1150,
against CI's 1139 at run 246. The rule those entries actually state is "confirm
the depth before believing a local number", and it was confirmed. CI remains the
authority if the two ever disagree.

## Teeth

The guard was proven by running the workflow's exact shell sequence in a throwaway
repository, in three states:

| staged | result |
|---|---|
| `src/TeamColours.fs` changed, no entry | **refused**, with the guard's own message |
| same, plus `outbox/generated-team-colours-*.md` | committed |
| nothing changed | `nothing to commit`, exit 0 |

The first run of that test refused for the **wrong reason**. The step originally
staged `outbox/generated-team-colours-*.md` as a glob, and a glob matching nothing
is a fatal `git add` — the step died before the guard spoke, so the transcript
read as a pass while the index was empty. The pathspec is now the `outbox`
directory, which is tracked and therefore always matches, and the refusal in the
table above is the guard's, not `git add`'s.

## One incidental change, and why it is in this commit

`scripts/generate-team-colours.mjs` contained a literal NUL byte, used as a key
separator in a template literal. Git classified the file as binary, so every diff
of it read `Bin 15502 -> 17440 bytes` — including the diff of this change, which
is the one that needed reviewing. Replaced with a `\u0000` escape: identical at
runtime, and the file is text again. The 16-check self-test covers the function
that uses it and passes unchanged.

## What to check when reviewing the next workflow that commits

Any future workflow that writes to `src/` or `scripts/` needs the same three
lines. The local hook will not cover it, and the failure is silent until
`check:history` reports a violation that is already permanent.
