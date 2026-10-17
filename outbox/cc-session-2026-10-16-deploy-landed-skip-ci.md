# deploy-landed: what a deploy can actually publish

CC-CMD: `docs/CC-CMD-2026-10-16-deploy-landed-skip-ci.md`
Base: `e654f81` · Branch: main

## Task 0 — what gates a deploy, measured

1. **How `deploy-landed-check.mjs` picked "newest deployable" at `e654f81`:**
   `newestDeployableCommit()` in `scripts/deployable.mjs` walked back from HEAD
   to the first commit touching anything outside verify's `paths-ignore`
   (`docs/**`, `outbox/**`, `**/*.md`). Paths only. The commit message was never
   read, so `c64251c` (`data/…`, carrying the skip directive) counted as
   deployable.

2. **`deploy.yml` does not skip on the skip directive, or on any property of
   the commit message.** It has three triggers:
   - `workflow_run` on **verify**, `if: conclusion == 'success'`.
   - hourly `schedule`, gated by `scripts/deploy-gate.mjs`, which needs verify's
     verdict on `newestDeployableCommit()` (path-only) and skips as "could NOT BE
     READ" when there is none.
   - `workflow_dispatch`, ungated.

   What stops a skip-directive commit deploying is **verify not running on it**.
   verify runs on a push unless the push touches only its `paths-ignore` or the
   push carries the directive. So the predicate is "would verify run on this
   commit": path-deployable AND no skip directive.

3. **Stop condition, assessed against the measurement:** verify's rule is
   per *push*, not per commit. Measured over the 46 commits back to verify's
   oldest listed push run, prediction matched 45:
   - verify ran on all 5 path-deployable, un-skipped push heads;
   - on none of the 34 carrying the directive;
   - on none of the 6 docs-only commits;
   - **not on `d99bf50`**: a path-deployable, un-skipped commit that was the
     first of a three-commit push (`d99bf50`, `7a5ff89`, `c0c6e0c`, 37 s apart)
     whose single verify run is on `c0c6e0c`.

   I did not stop. The per-commit reading errs in one direction only. A code
   commit stranded under a skipped push head still reads landable, so the check
   goes red on code that genuinely did not deploy. It never reports a stranded
   un-skipped code change as landed. Recorded in the code.

4. **The motivating red was not only the skip directive.** Replaying the walk at
   the failing HEAD `315d848`:
   - old predicate: newest deployable `c64251c`;
   - new predicate: newest landable `5e65e87` (walked past `315d848` docs-only,
     `c64251c` skip directive, `85db9fe` and `72d1c92` docs-only). Published
     `8eaf5a0` does not contain it, so the check is **still red**.

   It is correct to be: verify on `5e65e87` concluded **failure**, and its
   deploy was skipped. Real code was not live. The old check gave the right
   verdict and named the wrong commit. `db75760` later went green and live-check
   passed on `d2aed99`. The fix still matters: with verify green, every census
   commit would otherwise make a correct site read DEPLOY NOT LANDED.

## Task 1 — the change

- `scripts/deployable.mjs` gains the LANDABLE predicate: `notLandableBecause`,
  `newestLandable` (pure) and `newestLandableCommit` (git walk). Only the
  spelling measured in this repo is honoured: 40 of the last 400 messages carry
  it and no other form appears. Any other skip-like spelling is named as a
  warning rather than honoured. The docs host is unreachable from the sandbox,
  so GitHub's full list was not read and is not assumed.
- `deploy-landed-check.mjs` and `status.mjs` use it, so the two still agree.
  The check prints the commits it walked past, each with its reason.
- `deploy-gate.mjs` is **unchanged and stays path-only, deliberately.** It asks
  verify about the newest change to the published *tree*. A skip-directive data
  commit is in that tree with no verdict, and the landable predicate there
  would let the hourly deploy publish bytes verify never saw.
- No path allow-list was added. The path half is the existing `isIgnored`,
  which `check-ignore-parity.mjs` already ties to verify.yml.
- No redeploy.

## Task 2 — fails on purpose

Self-test cases (13/13): (1) a non-skip code commit after published → `behind`;
(2) a skip-directive data commit after published → landed; (3) both → `behind`,
and the newest landable is the code commit. Plus "skipped commits are named
with their reason" and "an unmeasured spelling is not honoured".

`scripts/mutate-deploy-landed.mjs`, wired into verify.yml's deploy-landed step,
5 of 5 caught:
- L1: nothing is landable, so case 1 can never go red.
- L2: the naive stop at the first skipped commit, so case 3 goes green.
- L3: the directive is ignored, which is the original defect.
- L4: the walked-past commits are not recorded.
- L5: every skip-like spelling is honoured.

## Gate and verification

RUNNER_RESULTS_PENDING

## Residual, recorded not deferred

On a commit carrying the directive, `deploy-gate.mjs` reads "could NOT BE READ"
every hour until the next verified commit. That is safe, because nothing
unverified ships, but it is noisy. Changing it means deciding whether unverified
data may publish. That is an owner decision, so it is not taken here.
