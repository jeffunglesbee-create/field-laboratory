# One failure per run is arithmetic, not luck

**Date:** 2026-08-31
**Scope:** `.github/workflows/live-check.yml`

Seven rounds this morning, each revealing exactly one new problem, each costing a
~6-minute run:

| round | step | cause |
|---|---|---|
| 1–3 | brief phase | `cards.find` took a duplicate stub |
| 4 | brief phase | AMBIGUOUS failed the rule holding twice |
| 5 | page load | empty slate thrown as a `TimeoutError` |
| 6 | pick tabs | `/Gate /` with no empty-slate branch |
| 7 | stats cards | `.st-card` with no empty-slate branch |

Rounds 5–7 are **one fact** — a slate with no games, between midnight ET and the
first fixture — meeting three assertions that had never seen one.

## Why they arrived one at a time

A failing step ends the job. `live-check` has five assertion steps about the
deployed page and **none carried an `if:`**, so every run reported the first
failure and nothing about the four behind it.

Rounds 6 and 7 were already present during round 5. The job just never got to
them.

## Five assertions, one page, no dependency between them

```yaml
if: "!cancelled() && steps.landed.outcome == 'success'"
```

`!cancelled()` rather than `always()`, because a cancelled run has nothing to
say.

**Gated on `landed`, which is the whole reason not to use `always()`.** The two
steps above these do not assert about the page — they establish *which artifact
the page is*:

- `The deployed build stamp matches main` — warns, never fails
- `The deploy landed` — `--strict`, fails when the published commit is behind
  the newest deployable one

If that gate fails, every assertion below describes some other build. Running
them anyway would produce five confident findings about the wrong bytes.
**Fail-fast is correct there and wrong below it.**

This session demonstrated the failure mode twice, both times my own doing: I
dispatched `live-check` before a deploy landed, and the gate stopped the run —
correctly. With a blanket `always()` those runs would have reported page
findings against the previous artifact instead.

## What this does not change

Any failing step still fails the job. Nothing is downgraded to a warning, no
assertion is relaxed, and the empty-slate states added in the last three commits
stay exactly as they are. The only change is **how many of the truths a single
run is allowed to tell.**

## Verified

```
npm run check:workflows    9/9
```
