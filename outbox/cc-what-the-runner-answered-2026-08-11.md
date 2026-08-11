# What the runner answered — 2026-08-11

The previous entry was docked to 95 for one thing: `status-live-check.mjs` had
not itself run on a runner. It has now. Verify run
[31509536617](https://github.com/jeffunglesbee-create/field-laboratory/actions/runs/31509536617)
on `090397c`, step 32, `ubuntu-latest`:

```
  Reading verify history for jeffunglesbee-create/field-laboratory from api.github.com

  real token   -> **running** on `090397c`
  bad token    -> unreadable — the workflow-history API answered 401
  missing repo -> unreadable — the workflow-history API answered 404
  no token     -> unreadable — this step ran without `GITHUB_TOKEN`/`GITHUB_REPOSITORY`

  8/8 checks passed
```

## What that settles

**The fetch works, and so does its failure.** Four calls to api.github.com from
a runner, four distinct answers, and the good read and the bad read disagree.
This is the direction that could not be simulated: an injected fetch proves the
code branches on `res.ok` and says nothing about what GitHub returns for a
malformed bearer token.

**The hedge I wrote down was a hedge.** The assertion reads
`/\b(401|403|404)\b/` because I did not know which status a corrupted token
draws. The answer is 401 for a bad token and 404 for a repository the token
cannot see. Both landed inside the alternation, which is luck rather than
knowledge — the alternation is exactly where the uncertainty was recorded, and
now it can be narrowed to what the service actually does.

**And the whole run was green**, 32 steps, gate included. `status.yml` then read
that conclusion and wrote it to main on `f06f009`:

> **green** on `090397c`

No stale warning, because for the first time today the newest verify run is
`main` HEAD. Six hours ago I asserted that sentence from a local run while CI was
red and nothing in the repo could contradict me. It is now written by the runner,
into the tree, on the commit it describes.

## The remaining gap, stated

The **STALLED** branch has never rendered live. Run 31501321990 is genuinely
stuck — `in_progress` since 14:24, `updated_at` frozen at 14:24:25 — but it was
never main's newest run, so `STATUS.md` never had cause to render it. The logic
is covered by fixtures and the mutation `stalled-run-reads-as-running` proves the
row notices when it is disabled. That is teeth, not a live rendering.

It is a branch that by construction only fires when something else is broken, so
waiting for a live instance means waiting for a fault. Named here rather than
called covered.

CONFIDENCE: 97.

Artifacts: verify run 31509536617 — success, 32 steps, step 32 `8/8` with the
four real API answers quoted above; `STATUS.md` on `f06f009` reading **green** on
`090397c` with no stale qualifier; the gate at 460/460 on the runner, twenty
rows, nothing skipped.

Three points off for the STALLED rendering above, subtracted whether or not it
is convenient — the rule this session had to restate is that a gap counts even
when I am the one who noticed and named it.
