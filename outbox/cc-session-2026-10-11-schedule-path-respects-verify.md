# CC session — the hourly deploy now respects verify

**Date:** 2026-10-11
**Repo:** field-laboratory, branch `main`
**Spec:** `docs/CC-CMD-2026-10-10-schedule-path-respects-verify.md` — 7 tasks, 4 stop conditions, 7 done conditions
**Outcome:** all seven done conditions met. No stop condition hit.
**Ran second, deliberately** — its Task 3 needs the failing-step summary that
`CC-CMD-2026-10-10-red-verdict-carries-its-step.md` added. Run first, the red
skip would have said "verify is red" and nothing about which check.

## The defect

`deploy.yml`'s job gate reads
`github.event_name != 'workflow_run' || …conclusion == 'success'`. On a
`schedule` event the first clause is true, so the job ran unconditionally.

| | 2026-10-09 | 2026-10-10 |
|---|---|---|
| main | red | red |
| trigger that fired | `workflow_run` | `schedule` |
| deploy | **skipped** | **deployed `7a9f48f`** |
| then | site 5 commits stale | `live-check` failed on it |

Same red main, opposite outcomes, decided by which trigger happened to fire.

## One predicate, two renderings

`mayDeploy(run, now) -> 'go' | 'red' | 'in-flight' | 'unknown'`, consumed by
**both** `verifyVerdict` (which renders STATUS.md's prose) and the gate (which
decides). The spec forbids parsing the prose, and the reason is that a parsed
string can drift from the decision silently — the line says one thing, the gate
does another, and nothing compares them.

**`unknown` is not `red` and it is not `go`.** A run nobody could read tells you
nothing about the code, and both other answers are claims.

The stall window decides where `in-flight` ends and `unknown` begins, and
`STALL_MINUTES` is imported rather than re-derived: run 31501321990 *finished
successfully* at 14:40:55 while the runs endpoint reported it `in_progress` with
`updated_at` frozen at 14:24:25 for over ninety minutes. Past that window,
"still running" is a stale answer, not a running job.

## Four outcomes, three of them skips, none of them silent

| verdict | action | what the summary says |
|---|---|---|
| success | deploy | *verify is green on `abc1234`* |
| red | skip | *verify is RED* + **the failing step and its skip tail** |
| in flight | skip | *still running — not red: in flight* |
| unreadable | skip | *could NOT BE READ* + the cause, and in capitals that it is **neither green nor red** |

The last two are the point. An unreadable verdict rendered as a quiet skip
looks like a healthy site forever.

## `&head_sha=` — measured before being relied on

The spec's fourth stop condition says to STOP if it does not filter, because
BSD's tennis date parameters are the standing lesson: four names returned
HTTP 200 with the same unfiltered page, *"accepted and silently dropped."*

Measured both directions, 2026-10-11:

```
head_sha=f86292b…   total_count=1, the matching run
head_sha=79565c2…   total_count=0   (docs-only commit — verify never ran)
head_sha=000000…    total_count=0
```

It filters, and it returns an empty list rather than falling back.

## Two defects found while wiring, neither in the spec

**1. `deploy.yml` had no `permissions:` block at all.** It ran on whatever the
repository default happens to be. `live-check.yml`'s own block carries the note
this follows — *an undeclared default is a setting, not a design*. Now
`contents: read` + `actions: read`, which is narrow and correct: the deploy
authenticates to Cloudflare with a **secret**, not with this token, and makes no
git write.

**2. The checkout was shallow, and a shallow checkout would have reintroduced
the exact defect.** `newestDeployableCommit()` walks `git log`; at depth 1 it
returns `null`; a null sha passed to `verifyRunsUrl` **drops the head_sha
filter** and answers about whatever verify ran last — a verdict about different
code, which is what this whole document exists to prevent.

Fixed twice over: `fetch-depth: 0` on the checkout so it does not happen, and a
guard in the gate that refuses to query without a sha and says the history was
probably shallow. The workflow makes it unnecessary; the script refuses to guess
if it ever stops being true.

## The keystone, defended

`isIgnored` and `verify.yml`'s `paths-ignore` describe the same set, and that is
what lets the gate ask an exact question rather than an approximate one. It was
undefended — editing either side alone silently changes what the gate means.

`check-ignore-parity.mjs` compares them **behaviourally**, not textually: it
translates the workflow's own globs into predicates and asserts agreement across
**699 paths** — 687 tracked files plus 18 edge cases a corpus of real files
cannot contain (`docsentry.fs`, `a.md.fs`, `src/x.md`). A string compare would
pass on `docs/**` vs `docs/` and fail on a reordering.

## Verified

- `deploy-gate` **15/15**, `ignore-parity` **9/9 + 3/3 live**, `status-verdict`
  **39/39**.
- `check:status`, `check:status-state`, `check:import-purity`,
  `check:script-orphans`, `check:workflows`, `check:short-circuit` all pass.
- **Three mutations, each applied and caught:**
  - `unreadable-verdict-treated-as-go` — done condition 7
  - `in-flight-verdict-treated-as-go` — the other half of the distinction
  - `ignore-parity-drifts-unnoticed` — one glob dropped from `isIgnored`

## The consequence the owner chose, stated plainly

With verify red, the hourly deploy **stops refreshing the site**. That is a
correct page, several commits stale, and it is the deliberate cost. Nothing here
makes main green.

What changed is only this: self-healing now means *verified* self-healing.

**Correction, measured after the push.** The paragraph above was written while
`verify` was red on `2000641`, and it did not survive contact. Main went green
before this landed, so the hourly deploy did not stop refreshing anything — the
gate's first live exercise was an **allow**. The cost described above is real
and will be paid the next time main is red; it was simply not paid today, and
saying otherwise would be a prediction reported as an outcome.

## Carry-forwards

**None.**

## Manifest (Rule 87.5)

| | |
|---|---|
| commit | `d730ed6` — *the hourly deploy respects verify, as the push path already does* |
| verify | run **38101153916**, `completed success` on `d730ed6` |
| deploy | run **38101307573**, event `workflow_run`, `completed success` on `d730ed6` |
| close-out | this doc + the CC-CMD's own `Status:` block |

**Done-condition probe output — the two new checks running in CI, not just
locally:**

```
success  isIgnored and paths-ignore still describe the same set
success  The deploy gate can still refuse
```

**The gate, live, in the deploy run's own step list:**

```
 3. success  Is deployment configured?
 4. success  Does verify allow this deploy?     ← new
 5. success  Is the live site already on this commit?
```

### Coverage of the done conditions, with the denominator (Rule 91)

| | proven by |
|---|---|
| 2 — green verdict deploys | **live**, run 38101307573 |
| 4 — `workflow_dispatch` ungated | **source**, `gateApplies(e) => e === 'schedule'`, plus the comment in the file |
| 5 — one predicate backs both | **source + check**, `mayDeploy` imported by `verifyVerdict` and the gate; `status-verdict-check` 39/39 |
| 6 — parity check fails on divergence | **live mutation**, `ignore-parity-drifts-unnoticed` caught; 699 paths, 0 disagreements |
| 7 — unreadable treated as `go` is caught | **live mutation**, caught |
| 1 — red verdict skips and names the step | **self-test + mutation only.** No live red run has exercised it. |
| 3 — in-flight / stalled / unreadable are three distinct summaries | **self-test + mutation only**, same reason |

**Two of seven are not yet proven against a real failing run.** The next red
main proves them for free, since the gate runs on every scheduled deploy. Not
filed as a carry-forward: nothing is deferred, there is simply no red run to
read yet, and manufacturing one would mean breaking main on purpose.

## Residual

**None deferred.** Two defects the spec did not anticipate were found and fixed
in the same commit (`deploy.yml` had no `permissions:` block; its checkout was
shallow, which would have dropped the `head_sha` filter and reintroduced the
defect). Both are described in the CC-CMD's `Status:` block.
