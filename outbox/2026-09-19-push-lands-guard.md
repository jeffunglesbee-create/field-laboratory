# The push-retry loops are guarded here now

**Commit:** this one. **Ports:** field-relay-nba `d831565`.
**Fixed here earlier:** `5b240ac`, 3 loops.

## What the defect was

    for i in 1 2 3; do
      git pull --rebase --autostash origin main && git push origin main && break
      sleep $((i * 5))
    done

When every attempt fails, the loop's last command is `sleep`, so the loop
exits 0, the step is GREEN, and the artifact is silently lost. `set -e` does
not catch it: a failing `&&` list is a *tested* command, so `-e` is
suppressed. Verified under the exact Actions shell, `bash -e -o pipefail`,
which returned 0.

107 instances across four repos. 3 of them here — `capture-render-fixture`,
`capture-tennis-draw`, `capture-tennis-fixture`, all three the fixture
captures this repo's render budget checks read from.

## Why a guard and not just the fix

A run that fails this way leaves a green check and **no artifact**. The
evidence of the failure is the absence of evidence, so there is no run count,
commit census or timestamp correlation that can measure the past damage or
notice a regression. Three attempts at measuring it are recorded in
field-relay-nba's session doc; all three failed for that reason. That is what
moved the recommendation from "guard only" to "fix all 107, then guard".

## What the check does, and what it deliberately does not

It checks that a landing verification **follows** each push-retry loop. It
does **not** police the loop's shape.

The 2026-09-19 sweep found five shapes by having its matcher REFUSE rather
than guess: a 4-attempt loop, a different sleep multiplier, a one-liner, an
`echo "retrying…"` between push and sleep, and one file that pushes first and
pulls last. The header predicted a sixth. The sixth arrived the same day —
ported to jubilant-bassoon, this check found **two loops the sweep itself had
missed**, both pushing to a full token URL rather than to `origin`. Its count
there is 84, not the 82 the sweep believed.

Enumerating shapes has now proved incomplete six times. Checking for the
guard's position is the thing that does not need the enumeration.

## Where it is wired, and why not guards.yml

`verify.yml`, in the `verify` job, after the credential-literal check.

`guards.yml`'s paths are `docs/**`, `outbox/**`, `**/*.md`. It does **not**
fire on `.github/workflows/**`. A new or copied workflow is the one change
class this check exists to catch, so hosting it there would mean it never ran
on the commit that needs it. `verify.yml`'s `paths-ignore` is the exact
complement of `guards.yml`'s `paths`, so it does fire. This is the same
reasoning `guards.yml`'s own script-orphans comment records for the opposite
direction.

It adds a step to a run that already happens rather than a new run: about a
second, no additional Actions minutes, which the 90%-consumed budget note in
CLAUDE.md makes worth stating.

## Python, not .mjs

286 `.mjs` to 7 `.py` in this tree, and this is one of the 7. It parses
workflow YAML; node has no yaml module; `extract-commit-loop.py` is the
existing precedent for exactly this.

## Verification

| what | result |
|---|---|
| `check-push-lands.py --self-test` | 12/12 |
| `mutate-push-lands.py` | 6/6 |
| live scan | 28 workflows, 3 loops, **0 unguarded** |
| `npm run check:workflows` | 9/9 |
| `check-script-orphans.mjs` | 3/3, both new scripts reachable |

**Proved red on real pre-fix content, not a fixture.**
`capture-tennis-draw.yml` restored from `5b240ac^` — a 9-line diff, so the
revert was not a no-op — took the check to **exit 1**, naming
`capture / Commit the fixture`. Restoring the file returned 3 guarded / 0
unguarded and left it byte-identical.

That last detail is not ceremony. The same proof was attempted in
field-relay-nba against `HEAD~1`, and bot commits had landed after the fix, so
`HEAD~1` already carried the guard: the revert was a no-op that reported 0
unguarded and looked exactly like a pass.

The mutation that matters is **P3** — make the guard count when it appears
anywhere in the step rather than after the loop. Every file in this repo would
pass with all three loops still silent.

## Residual

None deferred. The check is repo-local by design; the other three repos each
carry their own copy (field-relay-nba `d831565`, jubilant-bassoon `f9bd55d4`,
field-playground has zero loops and nothing to guard).

---

## Correction, same session: the first wiring never ran

The guard was first wired as step 46 of `verify.yml`'s single 68-step
`verify` job. It did not execute once.

Step 24 — "The chrome, measured on the rendered page" — was already red on
run 309, the commit immediately before. GitHub skips every subsequent step in
a job after a failure, so steps 25 through 68 were all `skipped`, including
the credential-literal guard that has lived there for weeks. Run 310 carried
the new step into the same position behind the same red step.

**A gate that cannot run is not a gate.** Same class as the placement
argument already made above — a check whose trigger does not cover its input
— one layer down: a check whose *job* does not reach it.

Measured rather than inferred: of the last ten `verify` runs, five failed and
one was cancelled. Parking a cheap invariant behind a dotnet build, a Chromium
install and twenty render checks means it runs only when everything else
already passed, which is when it is least needed.

`push-lands` is now its own job in the same workflow. Checkout plus python3,
no build, no node install, no browser. It runs in parallel with `verify` in a
few seconds and nothing in that job can block it.

The chrome-check failure itself is untouched and unexplained here — it
predates this work and is not this change's to fix. It cannot be reproduced
locally: the check drives a page at `localhost:8080` and the local run dies on
`ERR_CONNECTION_REFUSED` before reaching any assertion.
