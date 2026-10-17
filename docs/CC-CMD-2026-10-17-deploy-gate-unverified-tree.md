# Claude Code Command — the hourly deploy gate on a tree verify never saw

**Branch:** main — commit directly, do not create a feature branch or PR
**Repo:** field-laboratory
**Confidence gate:** `npm run gate` >= 95 before any commit
**Filed:** 2026-10-17 by CC, from `docs/CC-CMD-2026-10-16-deploy-landed-skip-ci.md`
(Rule 87.4: its one residual, which needs an owner decision)
**Status:** FILED, not started — needs the owner's ruling below first.

## The behaviour

`scripts/deploy-gate.mjs` asks verify for its verdict on
`newestDeployableCommit()`, the newest commit that changes the published tree
(path-only). A scheduled census commit (`data/…`, carrying the skip directive)
is such a commit, and verify never runs on it. Until the next verified commit
lands, every hourly deploy reports:

> Deploy skipped — verify's verdict for `<sha>` could NOT BE READ

This is safe: nothing unverified is published. The census data does not reach
the site until a later commit is verified, and that verify run covers the
census bytes in its tree. It is also noisy. The gate's own text says "If this
repeats every hour, the cause above is the thing to fix", and with two
scheduled producers it now repeats by design.

`deploy-landed-check.mjs` was changed on 2026-10-17 to the LANDABLE predicate
(`deployable.mjs`) and no longer goes red on this. The gate was deliberately
left alone.

## The ruling needed (owner)

1. **Keep publishing only verified trees** (current). Make the skip honest:
   when the newest tree change carries the skip directive, report it as its own
   outcome ("waiting for a verified commit, census data held back"), not as an
   unreadable verdict. No behaviour change.
2. **Publish census data unverified.** Use the landable predicate in the gate,
   so the hourly run vouches with the newest verified commit and ships HEAD,
   census bytes included. Behaviour change: data reaches the site without
   verify having seen it.
3. **Verify the census commits.** The producers drop the skip directive, so
   verify runs on each census commit. Costs one verify run per census run,
   against the Actions budget.

Recommendation: 1. It changes words, not what ships, and it keeps "nothing
unverified is published", which the gate exists for.

## Done condition (for option 1)

On a HEAD whose newest tree change carries the skip directive, the gate's step
summary heading names that commit and says the data is held for a verified
commit. The "could NOT BE READ" heading still appears for a genuinely
unreadable verdict. The gate's self-test asserts the two headings differ, and a
mutation that merges them is caught.
