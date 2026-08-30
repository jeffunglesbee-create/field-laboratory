# The rehearsal is on a clock, and the clock is checked

**Date:** 2026-08-30
**Scope:** `.github/workflows/drift-sentinel.yml`, `scripts/workflow-check.mjs`

## What was left rotting

`red-main-rehearsal.yml` proves the sentinel's `open`, `comment` and `close`
paths against the real API. Run `33325350486`: 16/16, with the endpoint's
consistency lag measured at 3215ms and 1938ms.

It is `workflow_dispatch` only, and the previous entry said what that costs:

> It also does not run itself on a schedule, which means the rehearsal can rot:
> a future change to `run()` breaks the write paths and nothing notices until
> someone dispatches it.

A proof that only runs when remembered is a proof with a human dependency, which
is what this repo's standing instruction to automate follow-ups is aimed at.

## Where it went, and what it does not cost

Into `drift-sentinel.yml`, as a step — **not a new workflow and not a new cron.**

drift-sentinel is daily, on two crons (`0 12 * * *` and `30 1 * * *`). It
already carries `issues: write` for its own follow-up filing, already checks out
the repo, already runs Node. The rehearsal is ~20 seconds inside a job that runs
anyway.

A third weekly cron would have started a whole extra drift-sentinel job — dotnet
restore, a Fable build, four live probes — to run twenty seconds of rehearsal.
Against a budget the status workflow's own header records as 90% consumed, that
is the wrong shape.

**Cost: zero additional workflow runs. ~20s once a week, on the six other days
nothing.**

## Two gates, and the second one was a bug I wrote and caught

```yaml
if: always() && github.event.schedule == '0 12 * * *'
```
```bash
if [ "$(date -u +%u)" != "7" ]; then ... exit 0; fi
```

The first version had only `github.event_name == 'schedule'` plus the day test.
That fires on **both** daily crons, so Sundays would have rehearsed twice and
opened two issues. `github.event.schedule` carries the literal cron string that
triggered the run, which distinguishes them.

`%u` is 1..7 with Sunday == 7, verified rather than recalled:

```
2026-08-30 -> %u=7 Sunday
2026-08-31 -> %u=1 Monday
2026-09-05 -> %u=6 Saturday
```

An off-by-one there rehearses on the wrong day and nobody notices, because the
rehearsal passes either way.

## The gate is a string that must match a cron four lines away

That is a coupling with a silent failure mode. Retime the cron — a new hour, a
minute offset to spread load — and the guard matches nothing. The step never
runs again, **the workflow stays green**, and the only symptom is a rehearsal
that quietly stopped happening. Exactly the rot it was scheduled to prevent,
reintroduced by the scheduling.

So the coupling is checked rather than commented. `check:workflows` gained
`danglingScheduleGuards`: every `github.event.schedule == 'X'` in a workflow
must match one of that workflow's own declared crons.

Proven against the real file, not a fixture:

```
cron retimed 12:00 -> 13:00, gate left at 12:00:
  FAIL  drift-sentinel.yml gates a step on github.event.schedule == '0 12 * * *',
        which is not one of its crons ('0 13 * * *', '30 1 * * *')
        — that step can never run
  8/9
restored: 9/9
```

## Fatal, unlike its neighbours

drift-sentinel's cross-repo steps are `continue-on-error` because they report on
someone else's backlog and must not redden this repo's run. The rehearsal is
not one of those: it tests this repo's own code, and the GitHub issues API is
the delivery channel the entire notification depends on. If that API is
unreachable, the notification does not work, and that is the finding rather than
the noise.

## `fetch-depth: 0`

drift-sentinel's checkout was shallow. `check:workflows` flagged it as soon as
the step was added — the job now reaches `deployable.mjs`, a history reader,
through `red-main-issue.mjs`. The job also rebases and pushes at the end, so
full history is the right default here regardless of the import graph.

## Cadence and what it writes

52 rehearsals a year. Each opens one issue, comments on it, closes it, and
sweeps any stray carrying `REHEARSAL_MARKER` before finishing — so the steady
state is zero open issues and a closed one per week, titled
`[rehearsal, ignore] …`.

## Verified

```
npm run check:workflows                            9/9
node scripts/red-main-rehearsal.mjs --self-test    3/3
node scripts/red-main-issue.mjs --self-test      29/29
```

The gated step's schedule path first fires Sunday 2026-09-06 at 12:00 UTC. Until
then the on-demand workflow is the surface, and it is green as of
`33325350486`.

---

## A postscript, because the guard broke its own detector

Adding `export` to `workflow-check.mjs` made it an exporting module that does
its work at import time, which terminates whatever imports it.
`check:import-purity` caught it at the pre-commit door — the third file this
session, and the second where the export arrived long after the module-scope
code.

The fix was to wrap the runtime half in `if (isMain(import.meta.url)) { … }`.
The first attempt also **indented it by two spaces**, which is normally
cosmetic. Here it was not: two of the detector's teeth tests are YAML inside
template literals, and `jobsOf` identifies a job as a key at *exactly* two
spaces under `jobs:`. Two extra spaces made every fixture job invisible:

```
FAIL  the detector still catches the original mistake
      → a build-less job running check:window was NOT flagged — the detector has no teeth
FAIL  the detector catches a history reader on a shallow checkout
      → a git-log script on a default checkout was NOT flagged
```

Read quickly, that says the detector lost its teeth. It says the opposite: the
detector was handed nothing to detect. A teeth test failing because its fixture
became empty is vacuity in the direction that usually hides — and it was only
visible because those two tests assert the detector goes RED. The three tests
asserting it stays green all passed on the corrupted fixtures.

Braces, no reindent. 9/9.
