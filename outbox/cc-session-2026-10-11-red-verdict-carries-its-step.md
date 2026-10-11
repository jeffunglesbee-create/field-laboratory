# CC session — a red verdict names its failing step

**Date:** 2026-10-11
**Repo:** field-laboratory, branch `main`
**Spec:** `docs/CC-CMD-2026-10-10-red-verdict-carries-its-step.md` — 4 tasks, 3 stop conditions
**Outcome:** all four done conditions met. No stop condition hit.

## What a red `STATUS.md` says now

Before, for a red main, the whole of it:

```
**FAILURE** on `2000641` — [run 37931213343](…)
```

After, the four states it can be in:

```
KNOWN       **FAILURE** on `2000641` at "Doc citations are anchored"
              — 27 of 30 steps did not run behind it — [run …]
CLEAN TAIL  **FAILURE** on `2000641` at "Build"
              — nothing was skipped behind it — [run …]
UNREADABLE  **FAILURE** on `2000641`
              — failing step unknown: the run's steps could not be read — [run …]
NO LOOKUP   **FAILURE** on `2000641` — [run …]
```

The measurement already existed. `run-steps.mjs` computed the failing step and
its skip tail, and `grep -rn run-steps scripts/ .github/` returned exactly one
importer — `red-main-issue.mjs` — so it landed in a private GitHub issue and
never in the file a session opens. Twice in two days a session hit a red main,
confirmed the cascade was correct, and could not name the step.

## The three states, and why the third is not zero

`stepSummary`'s own header already draws this line: *"A run whose steps cannot
be read reports `null`, never zero. 'Nothing was skipped' and 'I could not tell'
are different claims."* Carrying the summary into the verdict is worth nothing
if the rendering flattens them, so `stepClause` takes three inputs and gives
three different sentences:

| input | meaning | rendering |
|---|---|---|
| `undefined` | no lookup attempted | clause omitted |
| `null` | looked up, unreadable | *failing step unknown: the run's steps could not be read* |
| object | read | step name + tail |

**A fourth shape is real and not hypothetical.** A job can fail with no step
marked `failure` — a cancellation, a runner loss — leaving `failedStep` null
while `skipped` is a genuine count. That names the tail without claiming a step:
*failing step unknown — 44 of 44 steps did not run behind it*.

## Verified

- `status-verdict-check.mjs`: **39/39**, nine of them new, covering all four
  states plus three assertions on the clause in isolation so a template change
  cannot hide a state change.
- The named mutation — the unreadable state rendering as a zero — is
  **applied and caught**:

```
Mutation testing 1 invariant(s)
PASS  the unmutated tree passes every expectation
PASS  [unreadable-step-list-renders-as-zero] an unreadable step list says so,
      and never prints a skip count of zero
```

- `check:status`, `check:status-state`, `check:import-purity`,
  `check:script-orphans`, `check:red-main-issue` all pass.

## The three stop conditions, each checked rather than assumed

1. **`red-main-issue.mjs` untouched.** Not edited; `check:red-main-issue`
   passes. This adds a second consumer of `worstFailure`, which is what the spec
   asked for.
2. **No wall-clock field in `STATUS.md`.** None added. A failing step name
   changes only when the failure does, so the commit stays quiet on a stable
   red — which is the property `status.yml`'s commit step was built for.
3. **No permission widened.** `status.yml` already declares `actions: read`, for
   the verify-conclusion read directly above this one, and `red-main-issue.mjs`
   already makes this exact jobs request in the same job under the same token.
   Checked before writing the fetch, because the spec says to stop and report
   rather than widen.

## One design note worth keeping

`verifyVerdict` stays **pure** — the caller fetches, the function renders. That
is the reason `status-verdict-check.mjs` can exercise every branch offline from
a sandbox with no route to api.github.com, which is the same reason the function
was made pure in the first place.

`readStepSummary` returns `null` on *every* failure path — a throw, a non-200,
an unparseable body, a run with no failing job. All four are "I could not tell",
and returning `{skipped: 0}` from any of them would be a claim from no data.

## Carry-forwards

**None.**
