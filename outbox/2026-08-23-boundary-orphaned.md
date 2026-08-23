# The boundary named a commit that its own push deleted

## Five red runs, one stale sha

`STATUS.md` read **FAILURE**, and had since 17:01. Five consecutive `verify`
runs, every one with the same error:

```
Error: RULE_EFFECTIVE a4d500c is not in this history. If history was rewritten,
re-derive the boundary and the count together in docs/history-boundary.txt.
```

| run | commit |
|---|---|
| 32653520408 | `7c8021d` docs: move the history boundary a third time |
| 32655361280 | `80f2e12` feat: register the closing-odds ask |
| 32655620054 | `1bba8a9` fix: the cessation probe could never have observed a cessation |
| 32656167637 | `3226819` feat: a staged claim must name a verifier that exists |
| 32656510299 | `a5c7510` feat: every verifier must reject a known-bad payload |

Nothing was wrong with any of those five commits.

## What actually happened

```
a4d500c  17:01:03  feat: guard the outbox rule at commit time, ...
c31b94e  17:01:45  feat: guard the outbox rule at commit time, ...   ← in history
7c8021d  17:01:45  docs: move the history boundary a third time, ...
```

`git diff --stat` is byte-identical between `a4d500c` and `c31b94e`: the same
five files, the same 252 insertions. `c31b94e` is the parent of `7c8021d` — the
commit that *set* `a4d500c` as the boundary.

The push that recorded `a4d500c` as the boundary is the push that rebased
`a4d500c` into `c31b94e`. The file named the pre-rebase sha and shipped inside
the operation that invalidated it. `a4d500c` still exists as a git object; it is
simply no longer an ancestor of anything.

`git merge-base --is-ancestor a4d500c HEAD` → false.
`git merge-base --is-ancestor c31b94e HEAD` → true.

## Why the error sent me the wrong way first

"is not in this history" plus "if history was rewritten, re-derive the boundary
**and the count** together" reads as the shallow-clone case. The first thing it
suggests is checking `fetch-depth` — which is already `0`, with a comment in
`verify.yml` explaining at length why it must be. So the error appeared to
contradict the workflow.

And the advice is wrong for this failure. Re-deriving the count would have moved
a number that had not changed. A rebase renamed one commit; it added, removed
and reordered nothing relative to the boundary, so the set of commits predating
it is the same set. **22 stands.**

`scripts/history-check.mjs` now asks git which case it is and says so:

- `known && !ancestor` → **orphaned**. "The content is not lost: find the commit
  with the same subject that IS in history and point the file at it. The count
  does not change when a commit is only renamed."
- `!known` → shallow clone, wrong repo, or a genuine rewrite. Names
  `git log --oneline | wc -l` and `fetch-depth: 0` first, because a shallow
  clone is the ordinary case in a cloud session — this clone is 135 commits
  against CI's 699.

Four self-test cases cover both branches and require the two to render
differently. One message for two actions was the defect.

## The guard

`scripts/boundary-reachable-check.mjs`, wired into `.githooks/pre-commit` as
`check:boundary`. Same relationship as `check:staged-outbox` beside it:
`check:history` **reports**, this **guards**, and the difference is the moment.
A rebase has just happened, and the fix is one edit.

**It fails only on the orphan.** `known && !ancestor` is unambiguous — git is
holding the object, so it was renamed, not lost. `!known` passes with state
`unverifiable`, because a shallow clone is normal here and a gate that fires on
the normal case is one somebody turns off.

Five assertions; three are controls against overshoot (reachable passes, unknown
passes, and the three states must not read alike). The negative control is the
exact 2026-08-23 state:

```
PASS  an orphaned boundary fails
```

## A second defect, found on the way

`npm run check:import-purity` failed — on a different file:

```
FAIL  importing a module never runs it or exits the process
      → scripts/staged-outbox-check.mjs: the import terminated the
        process (exit 0) — code after the import never ran
```

`staged-outbox-check.mjs` shipped this morning to guard the outbox rule at the
door. Its bottom half ran at module scope and called `process.exit(0)`, so
importing it killed the importing process. That is exactly the class
`check:import-purity` exists to catch, in a file written to guard a rule.

Guarded with `isMain(import.meta.url)`, matching every other check in this repo.
`--self-test` gained the same guard. Import purity is 2/2.

This was found because `boundary-reachable-check.mjs` imports
`explainMissingBoundary` from `history-check.mjs`, which made me run the purity
check before committing. Nothing else would have surfaced it until the next
module tried to import it.

## Status

| | |
|---|---|
| boundary | `c31b94e075ee098c2248c9fa3b3d2c59f2b22ae4  22` — same commit, count unchanged |
| `check:boundary` | 5/5, orphan case demonstrated failing |
| `check:history` self-test | 11/11 (was 7/7) |
| `check:import-purity` | 2/2 (was 1/2) |
| `check:history` on main | **CI is the authority.** This clone is 135 commits and prints "predating: 4", which is meaningless. The line that matters locally is `PASS every governed commit changed source and outbox together` — the boundary resolves and zero governed violations. |

If CI reports a predating count other than 22, that number is real and this file
is wrong; correct it there.

## Files

- `docs/history-boundary.txt` — re-pointed, with an entry stating it is not a
  fourth move
- `scripts/history-check.mjs` — `explainMissingBoundary`, exported and
  self-tested
- `scripts/boundary-reachable-check.mjs` — new
- `scripts/staged-outbox-check.mjs` — `isMain` guard
- `package.json`, `.githooks/pre-commit` — `check:boundary`
