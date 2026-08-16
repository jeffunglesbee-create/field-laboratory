# Outbox — 90% of the Actions budget, and half of `verify` was one command twice

**Date:** 2026-08-16
**Ships:** the duplicate mutation step deleted from `verify.yml`, `status.yml`
cadence cut from 3-hourly to daily

## The constraint

90% of the month's GitHub Actions budget consumed with roughly fifteen days
left. This is a spend problem, and I had been answering a latency question.

## Measured, not assumed

Runner-minutes computed from run timestamps. The API caps each query at 30 runs,
so every figure is a **floor**:

| workflow | returned | of total | minutes | avg |
|---|---|---|---|---|
| **verify** | 30, all since Aug 1 | 84 | **782** | 26.1 |
| live-check | 30 | 184 | 58 | 1.9 |
| status | 30, spanning only **Aug 15–16** | 263 | 30 | 1.0 |
| drift-sentinel | 22 | 22 | 22 | 1.0 |

This repository's history begins around Aug 9, so all 84 `verify` runs are
almost certainly August: **~1,700–2,200 minutes on `verify` alone.** It is
roughly three quarters of the spend.

## What was actually being paid for

Half of a green `verify` was **one command executed twice**. Step 32 ran
`node scripts/mutation-check.mjs`. The confidence gate's
`breaking each invariant makes a check fail` row runs:

```js
ok('node scripts/mutation-check.mjs --self-test') &&
ok('node scripts/mutation-check.mjs') &&          // ← step 32, exactly
fails('node scripts/mutation-check.mjs --only known-survivor')
```

Measured on `9d66cf6`: step 32 **13m53s**, gate **17m14s**, whole job 36 minutes.

Step 32 is deleted. Coverage is unchanged — the gate still runs that command,
plus the two halves step 32 never ran. What is lost is **earliness**: a surviving
mutation now surfaces at the gate rather than ~14 minutes sooner. That trade only
became reasonable at `4608884`, when the gate started reporting *why* a row
failed rather than only its name. Before that, step 32 was the only place a
survivor was ever named, and deleting it would have traded 14 minutes for a
silent failure.

`status.yml`'s schedule went from `33 */3 * * *` to `33 6 * * *`. It is a
**backstop** — the `workflow_run` triggers keep STATUS.md current within a minute
of any real change, and the schedule exists only for changes made outside CI,
which are rare and not urgent. Eight runs a day to catch "someone added a secret"
is paying a subscription for a doorbell. ~240 runs/month becomes ~30, and the
event-driven freshness costs nothing.

## A correction

An hour before this I recommended disabling `cancel-in-progress` on main, so that
consecutive pushes stop cancelling each other's evidence. Under a minutes budget
that is **exactly backwards**: the six cancelled runs consumed 101 minutes where
completion would have cost ~210. Cancellation has been saving ~110 minutes.
Withdrawn; the setting stays.

My ranking of alternatives inverts for the same reason. I rated self-hosted
runners lowest on the grounds of maintenance cost. On a minutes budget they are
the strongest option available, because GitHub does not bill self-hosted minutes
at all.

## What was verified before pushing

Both files carry mutation anchors and both mutations still fire:

- `workflow-cannot-run-step` anchors on `- name: Regenerate the outbox index` in
  `status.yml` — my edit is confined to the `on:` block, anchor intact, mutation
  caught.
- `workflow-shallow-history` anchors on `fetch-depth: 0` in `verify.yml` — my
  edit is elsewhere, anchor intact, mutation caught.

`check:workflows` 6/6. Nothing else in the repo referenced the deleted step.

## Payback

This commit itself costs one `verify` run — now ~21 minutes rather than ~36. It
pays for itself on the second push after it, and the `status` change pays back
roughly 210 minutes over a month regardless of push volume.

## Not done, and why

The larger structural cut — splitting `verify` into a ~9-minute push job and a
daily full job, moving the mutation suite off per-push entirely — is the biggest
remaining lever (~28 of 37 minutes in a green run). It is a design change rather
than waste removal, so it waits for a decision after these two are measured.
