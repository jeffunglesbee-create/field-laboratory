# Outbox — two steps were the whole job

**Date:** 2026-08-17
**Ships:** `.github/workflows/verify-full.yml`, `verify.yml` trimmed

## The measurement that decided it

Step timings from `9d66cf6`, a 36-minute green run:

| | |
|---|---|
| setup, build, decoders, browser checks, every pure-JS check | **1m45s** |
| `check:proof` | **2m29s** |
| the confidence gate (runs the mutation suite inside it) | **17m14s** |

Two steps were the job. Everything else — 37 steps including a real Chromium and
eight browser-driven checks — costs under two minutes combined.

## The split

`verify.yml` keeps its name, because `deploy.yml` triggers on
`workflows: [verify]` and renaming would silently break the deploy chain.
It now runs everything cheap, on every push, in about two minutes.

`verify-full.yml` runs `check:proof` and the gate, weekly plus
`workflow_dispatch`.

Weekly rather than daily, deliberately: daily is ~20 minutes × 15 days ≈ 300
minutes, which is roughly the entire remaining budget. Weekly is ~40.

## What is lost, stated plainly

**The confidence gate no longer runs per commit.** That is a real reduction, not
a reorganisation. "Every row must pass" was previously asserted against every
push; it is now asserted weekly and on demand, so a gate failure can land on main
and sit for up to a week unless someone dispatches the workflow.

The mitigation is real but partial: every command the gate runs also runs
locally, and the practice in this repo is already to run the offline suite before
pushing. `verify-full` is the independent confirmation of that rather than the
only place it happens. "Independent confirmation, weekly" is weaker than
"independent confirmation, per commit", and pretending otherwise would be the
kind of quiet downgrade this repository exists to catch.

**When to dispatch instead of waiting**, recorded in the workflow header: before
declaring a phase complete, before anything cited as evidence, and after any
change to `mutation-check.mjs`, `gate-checks.mjs` or `confidence.mjs`.

## Checked before pushing

- `check:workflows` 6/6 — `verify-full` builds before running build-dependent
  scripts, and checks out at `fetch-depth: 0` because the gate's history rows
  walk to the root.
- `npm run gate` now appears in exactly one workflow, `verify-full`.
- `npm run check:proof` likewise. A `grep -l` initially suggested
  `drift-sentinel.yml` also invoked it; it does not — the string appears inside a
  printed remediation message. Counted per-file rather than trusting the first
  grep, because the two greps disagreed and one of them had to be wrong.
- The `check:proof` reference left in `verify.yml` is a comment recording where
  the step went, not an invocation.

## Projected effect

Per push: ~36 minutes becomes ~2. Weekly: one ~20-minute full run. Against ~30
pushes and two weeks remaining, roughly 1,080 minutes becomes roughly 100.
