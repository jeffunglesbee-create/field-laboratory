# Claude Code Command — the hourly deploy must respect verify, as the push path already does

**Date:** 2026-10-10
**Repo:** field-laboratory
**Branch:** main — commit directly, do not create a feature branch or PR
**Type:** B (correctness) — one gate that applies on one trigger and not the others
**Status:** FILED, not started.

**Owner decision, taken 2026-10-10:** the schedule path SHOULD respect verify.
A current site does not beat a verified one. This document implements that and
nothing wider.

## The defect, as it actually happened today

`deploy.yml`'s job gate:

```yaml
if: >-
  github.event_name != 'workflow_run' ||
  github.event.workflow_run.conclusion == 'success'
```

On a `schedule` event the first clause is true, so the job runs unconditionally.
The cron is `'17 * * * *'`, and its stated purpose is to "re-check for the
secret, and re-publish if the live site is behind main."

Measured, 2026-10-10:

| | |
|---|---|
| `verify` | **FAILURE** on `2000641`, run 37931213343 |
| `deploy` | **success** on `7a9f48f`, trigger `schedule`, 20:08:44Z |
| `live-check` | **failure** on `7a9f48f`, 20:09:54Z |

And on 2026-10-09, with main equally red, `deploy` **skipped** — because that
day's trigger was `workflow_run` from a failed verify, and the site sat five
commits stale at `2cced76`.

**Same red main, opposite outcomes, decided by which trigger happened to fire.**
That is not a policy; it is an accident of the condition's shape.

## THE KEYSTONE — why this gate can be exact rather than approximate

`scripts/deployable.mjs:15`:

```js
export const isIgnored = f => f.startsWith('docs/') || f.startsWith('outbox/') || f.endsWith('.md')
```

`verify.yml`'s `paths-ignore`: `docs/**`, `outbox/**`, `**/*.md`.

**Those are the same set.** So a commit is deployable if and only if verify runs
on it, and for every deployable commit a verify run exists or is in flight.
The gate therefore does not need to guess: it asks verify's verdict for the
newest DEPLOYABLE commit, which is exactly the commit whose code is about to be
published.

This equivalence is load-bearing and currently undefended — editing either side
alone silently changes what the gate means. **Task 5 defends it.**

## Why "verify's latest run" is the WRONG question

`verifyRunsUrl` (`scripts/status.mjs:145`) is
`…/workflows/verify.yml/runs?branch=main&per_page=1` — newest run on main, no
sha filter. A docs commit on top of a deployable one does not trigger verify, so
the newest run can be about an older commit than `GITHUB_SHA`. Gating on it
would sometimes consult a verdict about different code, which is this
repository's recorded Bundesliga failure in a new place: behaviour read off one
artifact and attributed to another.

The runs endpoint accepts `&head_sha=<sha>`. Use it.

## Tasks

**Task 1 — a predicate, not a parsed string.** `verifyVerdict` returns rendered
prose for `STATUS.md`. **Do not parse it to make a decision.** Factor the
classification into a pure predicate — `mayDeploy(run, now) -> 'go' | 'red' |
'unknown'` or equivalent — and have BOTH `verifyVerdict` and the gate consume
it, so the string and the decision cannot disagree. One measurement, two
renderings, which is the rule `CONTRACTS.md` and
`nfl-epa-transcription-check.mjs` exist to enforce.

**Task 2 — read verify for the newest deployable commit.** `newestDeployableCommit()`
already walks history for the sha; extend `verifyRunsUrl` to take an optional
`head_sha` and reuse `readVerify`, whose classification already names every
failure cause and is injectable via `fetchImpl` for offline exercise. Do not
write a second reader.

**Task 3 — FOUR outcomes, and the fourth is not "go".**

| verify, for the newest deployable commit | action | summary |
|---|---|---|
| success | deploy | normal |
| failure / cancelled / timed_out | **skip** | name the failing step, per `CC-CMD-2026-10-10-red-verdict-carries-its-step.md` |
| still running | **skip**, retry next hour | say "in flight", not "red" |
| verdict unreadable (no run for that sha, no token, API error) | **skip**, retry next hour | say which cause, from `readVerify`'s own classification |

The last two are the ones that matter. They must be **distinguishable from each
other and from a healthy no-op**, because an unreadable verdict that renders as
a quiet skip looks like a healthy site forever. Rule 99: absence is a sibling of
the value.

They also must not fail closed permanently. The cron retries hourly, so a
transient blip costs at most an hour — which preserves the self-healing property
the file's header is built around ("the moment the secret is added the site
deploys on its own"). The property that changes is only this: self-healing now
means *verified* self-healing.

**Task 4 — reuse the stall guard; an in-progress reading can be a lie.**
`STALL_MINUTES = 45` exists because run 31501321990 **finished successfully**
at 14:40:55 while the runs endpoint this code reads reported it `in_progress`
with `updated_at` frozen at 14:24:25 for over ninety minutes. So "still running"
past the stall window is not "still running" — it is unreadable, and belongs in
row four, not row three. Import the constant; do not re-derive it.

**Task 5 — defend the keystone.** A check asserting that `isIgnored`'s path set
and `verify.yml`'s `paths-ignore` still describe the same set. If they diverge,
the gate consults a verdict that may not exist for the commit being deployed,
silently. `verify.yml` already carries a job (`push-lands`) that parses workflow
YAML in Python for exactly this reason, and `check-push-lands.py` is the
precedent for reading a workflow's own declarations rather than a copy of them.

**Task 6 — skip, do not fail.** The file's header is explicit: "Skipping rather
than failing is deliberate. An unconfigured deploy is not a broken build, and a
workflow that goes red on every push until someone pastes a secret trains you to
ignore red." A verify-red deploy is the same shape — the red already exists, on
verify, where it belongs. Report the skip loudly in `$GITHUB_STEP_SUMMARY` and
exit 0.

**Task 7 — leave `workflow_dispatch` ungated, and say so in the file.** A human
asking for a deploy is a human overriding this gate deliberately, and the
dispatch is recorded in the run history. Gating it would remove the only manual
route to publishing a known-red commit, which is sometimes the right thing to do
and should stay possible.

## The consequence the owner is choosing, stated plainly

`verify` is red on `2000641` as this is filed. The first effect of this change
is that the hourly deploy **stops refreshing the site** until main is green.
That is yesterday's state — a correct page, several commits stale — and it is
the deliberate cost of the decision. Nothing here makes main green; the three
documents that bear on that are
`CC-CMD-2026-10-10-red-verdict-carries-its-step.md` (so the failing step is
nameable at all), `outbox/cc-session-2026-10-09-verify-green.md` (the
`check:history` boundary question, unresolved and governance-level), and
`outbox/cc-session-2026-10-09-claim-control-anchor.md`.

## Stop conditions

- Do not touch the `workflow_run` branch of the condition. It is correct.
- Do not parse `verifyVerdict`'s output. If the predicate is awkward to factor,
  STOP and report — a parsed string is the thing this project forbids.
- Do not make the gate consult `live-check`. A red post-deploy check describes
  the artifact already live and says nothing about whether the next one should
  ship; conflating them would wedge the site shut on a stale-artifact failure.
- If `&head_sha=` does not filter as expected, STOP and report. Silently
  falling back to the newest run reintroduces the exact defect this fixes, and
  BSD's tennis date parameters are the standing lesson: four parameter names
  returned HTTP 200 with the same unfiltered page, "accepted and silently
  dropped."

## Done conditions

1. A `schedule` run with verify red on the newest deployable commit skips, and
   the summary names the failing step.
2. A `schedule` run with verify green on that commit deploys as before.
3. In-flight, stalled, and unreadable verdicts are three distinct summaries, all
   skips, none of them indistinguishable from a healthy no-op.
4. `workflow_dispatch` still deploys regardless, documented in the file.
5. One predicate backs both `STATUS.md`'s wording and the gate's decision.
6. A check fails if `isIgnored` and `verify.yml`'s `paths-ignore` diverge.
7. The mutation that must be caught: an unreadable verdict treated as `go`.
