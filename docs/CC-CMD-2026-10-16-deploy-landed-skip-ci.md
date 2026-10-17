# Claude Code Command — `deploy-landed` counts `[skip ci]` commits as deployable

**Branch:** main — commit directly, do not create a feature branch or PR
**Repo:** field-laboratory
**Confidence gate:** `npm run gate` >= 95 before any commit
**Filed:** 2026-10-16 by chat
**Status:** FILED, not started — not dispatched.

## The failure, verbatim

`live-check` run 38986860547, HEAD `315d848`:

```
deploy-landed — is the published artifact the newest deployable commit?

  published:          8eaf5a0
  newest deployable:  c64251c
  HEAD:               315d848

DEPLOY NOT LANDED — published 8eaf5a0 is behind the newest deployable commit c64251c.
```

`c64251c` is `data: empowerment census and fixtures (run 38984743564) [skip ci]`.
It carries `[skip ci]`, so **no deploy ran for it and none ever will.**

## Why this recurs, and why it matters

The empowerment work added two scheduled producers — `empowerment-data.yml` and
`gravity-census.yml` — that commit artifacts with `[skip ci]`. **Every future
census run reproduces this failure.** A check that is red by design on a normal
Tuesday is a check that gets ignored, then deleted. This tree has that failure
recorded about count bars in `scripts/check-absence-collapse.mjs`'s own header.

The cost is not the red square. It is that `deploy-landed` exists to catch a
*real* undeployed change, and a permanently red check cannot report one.

## The fix, and the reading to avoid

`scripts/deploy-landed-check.mjs` asks *"is the published artifact the newest
**deployable** commit?"*. A commit carrying `[skip ci]` **did not deploy and
cannot deploy**. So it is not deployable, by the check's own word. Excluding it
is not a loosening; it is the definition the check already claims to use.

**Do not decide deployability by file path.** "`data/` and `outbox/` don't
count" is a second definition, maintained by hand, that drifts from the first
the moment a producer writes somewhere new — and the two then disagree
silently, which is the defect class this repo has spent the week on. Decide by
whether a deploy can run for the commit, which is exactly what `[skip ci]` says.

Walk back from HEAD to the newest commit **without** `[skip ci]`; that is the
newest deployable commit. If every commit since `published` carries it, the
deploy **has** landed and the check passes.

## TASK 0 — read before changing (blocking)

1. Read `scripts/deploy-landed-check.mjs` at HEAD and state how it currently
   picks "newest deployable".
2. Confirm how `deploy.yml` decides to run. If it skips on something **other**
   than `[skip ci]` — a paths filter, a conditional — then `[skip ci]` alone is
   not the right predicate and the two would diverge. **Match the predicate to
   what actually gates the deploy**, and say in the code which one it is.

**Stop condition:** if `deploy.yml`'s skip condition cannot be read as a
property of a single commit, stop and report. A per-commit check cannot
reproduce a decision that depends on a diff against a branch.

## TASK 1 — the change

As above, plus: the check must **say which commit it treated as newest
deployable and why the ones after it were skipped.** A line naming the skipped
shas and their reason. Silence here is how a wrong predicate survives.

## TASK 2 — make it fail on purpose

- A real undeployed change — a non-`[skip ci]` commit after `published` — still
  goes **red**. This is the regression that matters: the whole point is that the
  check keeps working.
- A `[skip ci]` commit after `published` goes **green**.
- Both commits present: **red**, on the non-`[skip ci]` one.

That third case is the one a naive fix gets wrong by walking back to the first
skippable commit and stopping.

## Done conditions

- `live-check` green on a HEAD whose newest commits are `[skip ci]`.
- All three mutations applied and caught.
- `outbox/cc-session-2026-10-16-deploy-landed-skip-ci.md` is the last task
  (Rule 87); the README's "answer so far" is updated if the result bears on it —
  this repo has no `HANDOFF.md`.

## Constraints

- Do not redeploy to clear the current red. That treats one instance and leaves
  the next census run to reproduce it.
- Do not widen to a path allow-list. See above.
