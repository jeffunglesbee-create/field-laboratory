# Claude Code Command — a red verdict must name its failing step in the tree

**Date:** 2026-10-10
**Repo:** field-laboratory
**Branch:** main — commit directly, do not create a feature branch or PR
**Type:** B (gap) — a measurement that exists and cannot be read
**Status:** DONE 2026-10-11. All four tasks, all four done conditions, no stop
condition hit. Session doc:
`outbox/cc-session-2026-10-11-red-verdict-carries-its-step.md`.

One scope note the document did not anticipate: it says the summary arrives via
"the same `RED_MAIN_RUN_ID` already in `status.yml`'s env". That variable is on
the SENTINEL step, not the render step. Rather than widen the render step's env,
`readStepSummary` takes the run id from the run object `readVerify` already
holds — which also fixes the case the env var cannot cover, since
`RED_MAIN_RUN_ID` is empty on the daily backstop and on a manual dispatch.

## Why this exists

`STATUS.md` is the one artifact in this tree that reports CI health, and for a
red main it says this and nothing more:

```
**FAILURE** on `2000641` — [run 37931213343](…)
```

That is `verifyVerdict` in `scripts/status.mjs`, whose red branch is a single
template: conclusion, short sha, run link.

**The failing step's name and the skip tail behind it are already computed, in
the same job, by the same token.** `scripts/run-steps.mjs` exports
`worstFailure` and `costLine`, and `stepSummary` returns
`{total, ran, skipped, failedStep, failedNumber}` with the three-state
discipline its header spells out: *"A run whose steps cannot be read reports
`null`, never zero. 'Nothing was skipped' and 'I could not tell' are different
claims."*

`grep -rn run-steps scripts/ .github/` returns exactly one importer:
`red-main-issue.mjs`. So the measurement lands only in a private GitHub issue.
`status.mjs` never imports it.

## The cost, measured twice in two days

- **2026-10-09.** `deploy` and `live-check` both skipped on `e1303e6`. A session
  established the cascade was correct, could not name the failing step, and
  could not reach the run log — `runs/<id>/logs` answers with a redirect to blob
  storage that the authoring sandbox's GitHub client refuses, which
  `live-check.yml` already records as the reason the axis manifest is committed
  to `outbox/`.
- **2026-10-10.** `live-check` failed on `7a9f48f`. A session reproduced five of
  the eight assertions green against the deployed page, ruled the sixth invalid
  (`statsapi.mlb.com:443` and `api.open-meteo.com:443` are 403 at the authoring
  gateway — the proxy's own failure log confirms it, and
  `schedule-live-check.mjs`'s header predicts it), and could not reach the other
  three because they need `build/`. **`.NET installs in that sandbox; Fable does
  not** — `api.nuget.org:443` is gateway-denied, so `dotnet tool restore` cannot
  run there at all. The failing step was again unnameable.

`run-steps.mjs`'s own header already argues this case from a bigger instance:
*"`verify` step 25 was red for seven consecutive runs on one ungated `:hover`.
Forty-four steps were skipped behind it every time. Two of those forty-four were
real defects that had shipped."* The fix it proposed was to put the bill in the
notification a human opens. The notification a *session* opens is this file.

## Tasks

**Task 1 — carry the summary into the verdict.** `verifyVerdict` takes the step
summary and renders, on a red run:

```
**FAILURE** on `2000641` at "Doc citations are anchored" — 27 steps skipped behind it — [run …]
```

Same job, same `GITHUB_TOKEN`, same `RED_MAIN_RUN_ID` already in
`status.yml`'s env. No new API call class — `red-main-issue.mjs` makes this read
today.

**Task 2 — three states, and the third is not zero.** `stepSummary` returns
`null` when the steps cannot be read. The verdict must then say the step is
unknown, NOT omit the clause and not print "0 skipped". Rule 99: absence is a
sibling of the value. `status.mjs`'s own `STALL_MINUTES` branch is the local
precedent — it exists because `**running**` read as neutral for a run that had
actually finished, and the fix was to name the state rather than fall back to a
harmless-looking default.

**Task 3 — extend `status-verdict-check.mjs`.** It imports `verifyVerdict` and
is the reason that function is pure. The signature changes, so the check must
change with it, and must cover all three states — failing step known, steps
unreadable, and green (where there is no step to name). A fourth case worth a
row: a run whose failing step is `null` while `skipped` is a real number.

**Task 4 — mutate it.** Rule 90. The mutation that must fail: the unreadable
state rendering as "0 steps skipped". If that mutation survives, the check is
asserting the template rather than the distinction, and the distinction is the
entire point of the change.

## Stop conditions

- Do not change `red-main-issue.mjs`'s behaviour. It works; this adds a second
  consumer of the same function.
- Do not add a wall-clock field to `STATUS.md`. `status.yml`'s commit step is
  deliberately quiet — "its git history should read as a log of things
  happening, not one commit a day saying nothing" — and a timestamp would make
  every run commit. A failing step name only changes when the failure does.
- If the steps endpoint needs a permission `status.yml` lacks, STOP and report
  the scope rather than widening it. `live-check.yml`'s `permissions` block
  carries a comment about exactly this: an undeclared default is a setting, not
  a design.

## Done conditions

1. A red `STATUS.md` names the failing step and the skipped count.
2. A run whose steps cannot be read says so, and does not print a zero.
3. `status-verdict-check.mjs` covers the three states plus the mixed case.
4. The "unreadable renders as zero" mutation is caught.
