# live-check called a correct deploy "NOT LANDED" — 2026-08-23

**Commit:** `1db425b` · **Branch:** main · **Session:** relay/laboratory cross-repo, 2026-08-23

## The failure

`live-check` run `32612440650`, head `765549e`:

```
deployed: 765549e1539…      main: 765549e1539…
  published:          765549e
  newest deployable:  06c37db
  HEAD:               765549e
##[error]DEPLOY NOT LANDED — published 765549e is behind the newest deployable commit 06c37db.
```

The step directly above the error printed `deployed == main`. The site was
serving HEAD. `765549e` is `status: refresh [skip ci]`, touching `STATUS.md` and
`outbox/INDEX.md` only, and `06c37db` is its parent — so the published tree
contained every deployable change. The deploy had landed. The check was wrong.

## Root cause

`verdict()` tested `published === deployable`.

The deploy stamps the commit it **ran on**, not the newest deployable one. A
non-deployable commit landing on top means `version.txt` names that commit while
its tree still contains every deployable change. Equality reads that correct
state as staleness — and this repo generates non-deployable commits constantly
(`status: refresh [skip ci]` after every run), so the false positive is the
common case, not an edge one.

## The self-test asserted the bug

```js
newestDeployable([{sha:'a',files:['STATUS.md']}, {sha:'b',files:['outbox/n.md']},
                  {sha:'c',files:['src/x.fs']}]) === 'c'
check('published is behind the newest deployable → behind', verdict('a','c') === 'behind')
```

`'a'` is the newest commit in that fixture and `'c'` an older deployable one: a
descendant asserted to be stale. That is precisely the live case, written down
as expected behavior. It is why `deploy-landed --self-test` passed 6/6 while
`live-check` went red on a correct site — the check and its test agreed with
each other and disagreed with reality.

## The fix

`deployable.containsCommit(ancestor, descendant)` — one shared helper, which is
what `deployable.mjs` exists for:

- `published === deployable` → `landed`
- published **contains** the newest deployable commit → `landed-newer` (pass)
- published does not contain it → `behind` (the real failure)
- either sha unknown to the clone → `null` → `unknown`, never `behind`

The third case is not hypothetical: this repo's `main` was rewritten earlier the
same night, so a stamp naming a commit that no longer exists is reachable. Not
knowing is not the same as being stale, and a check that cannot tell the
difference should say so rather than accuse.

`status.mjs:23` carried the identical predicate and would have printed
"(deploy not landed)" on the same correct state. Fixed with the same helper.

## Verification

- `deploy-landed --self-test`: 6/6 → **8/8**, both directions covered separately.
- `check:status` 23/23, `check:workflows` 6/6, `check:import-purity` 2/2.
- Against the exact failing pair: `containsCommit(06c37db, 765549e) === true`,
  verdict moves `behind` → `landed-newer`.
- The live path could not run in-sandbox — egress 403s `*.workers.dev`, so
  `published` came back null and the check reported `unknown` rather than
  guessing. CI has the egress.

## The Rule 67 violation this entry answers

`1db425b` shipped three `scripts/` changes with no outbox entry, and
`check:history` failed `verify` run 115 by name. The rule is per-commit and
settled at commit time, so this entry does not retroactively pair with it —
the violation stands and needs the boundary mechanism in
`docs/history-boundary.txt` or nothing. That decision is deliberately not taken
here; it is named in the session report instead, because moving the boundary
costs the count a point and that file a paragraph, permanently and by name.
