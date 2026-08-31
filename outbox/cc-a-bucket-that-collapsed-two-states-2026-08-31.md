# A bucket that collapsed two states, and reported neither

**Date:** 2026-08-31
**Scope:** `scripts/check-doc-citations.mjs`, `docs/deleted-citation-budget.txt`

`check:citations` printed this on every run:

```
no file    172  (cross-repo or deleted — reported, never fatal)
```

Its own label names the defect. **Cross-repo or deleted** are two different
facts, folded into one number that is never fatal.

A citation naming the relay's `index.js` is correct and unremarkable — that file
lives in another repository. A citation naming a path *this* repo tracked and
then deleted is a different animal: the file it points at is gone from the tree
it was written about. The check could not tell them apart, so it said nothing
useful about either.

This is the shape that has recurred all session: two states collapsed into one,
and the collapsed state never fails.

## Measured before the split was written

Git separates them exactly — a path ever added or renamed here is in the log,
one that never existed here is not.

```
paths ever tracked in this repo: 452

no-file citations: 172 across 50 distinct path(s)
  DELETED HERE: 1 path(s)
  never here:  49 path(s)

  chrome-check.mjs  (2 citations)
      deleted: 7a85068 2026-08-26 feat: measure the chrome on the rendered
               page; delete the code that modelled the cascade

  never-here, by citation count:
    index.js (relay)              41
    journalism-quality.js (relay) 16
    shoot.mjs                     12
    legacy/field.js (client)      10
```

So the bucket really was 99% what its label's first word claimed. **The point of
splitting it is that nothing would have told you when that stopped being true.**

## Not fatal, and deliberately so

Both current deleted-here citations are accurate history:

- `2026-08-26-chrome-audit.md` records the file being wired into `verify` — true
  when written, and the file was deleted hours later the same day.
- `2026-08-26-secret-guard-three-repos.md` carries it inside captured output.

A document about a deletion has every reason to name what was deleted. Whether
such a citation is stale or archival is not mechanically decidable, so the count
is **ratcheted** rather than banned — the same treatment `bare` already gets.
Budget 1, in `docs/deleted-citation-budget.txt`.

Neither document was edited. There was nothing wrong with them.

## A shallow clone must abort, not report zero

`splitNoFile` against an empty history classifies **everything** as foreign. A
truncated log therefore switches the entire deleted-here state off and leaves the
check passing — a green tick for a question never asked.

That is not hypothetical. Two days ago in this session a jubilant-bassoon clone
grafted at 201 commits was read as the repository's history, and a conclusion was
drawn from it that had to be withdrawn. The clone was shallow and nothing said
so.

So the check aborts on `git rev-parse --is-shallow-repository`, and there is a
second guard it did not need to be given: this file now contains `git log`, which
means `check:workflows`'s own `historyReaders` detector requires `fetch-depth: 0`
on any job that runs it. Both jobs that do — `verify` and `guards` — already
carry it. The precondition is enforced at the door by a checker written for an
unrelated bug.

## Teeth

```
budget lowered to 0        →  FAIL  deleted-here citations do not grow (budget 0)
clone reads as shallow     →  FAIL  the history needed to split ... was readable
                              NOT SPLIT — the clone is SHALLOW
restored                   →  4 PASS
```

Plus three fixtures on the pure split, including the one that matters:

```
PASS  AN EMPTY HISTORY MAKES EVERYTHING LOOK FOREIGN
```

## Verified

```
node scripts/check-doc-citations.mjs --self-test   16 PASS, 0 FAIL
npm run check:workflows                             9/9
```
