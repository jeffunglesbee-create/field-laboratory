# The run was not stuck — 2026-08-11

Correcting the record on something I put in two commit messages and an outbox
entry within the last hour.

I wrote that run 31501321990 (`771cf8e`) was **stuck** — `in_progress` since
14:24, `updated_at` frozen at 14:24:25, still live at 15:22 — and that
`concurrency: cancel-in-progress` should have ended it.

I went to cancel it and got:

```
409 Cannot cancel a workflow run that is completed
```

The jobs endpoint says why. Job 93811751301: `completed`, `success`, finished
**14:40:55**, all 30 steps green including the gate at 460/460 and the three live
checks.

**The run finished successfully. The runs endpoint reported it in_progress with a
frozen `updated_at` for more than ninety minutes afterwards.**

## Why this makes the guard more necessary, not less

The stale answer is on `/actions/workflows/verify.yml/runs` — the endpoint
`status.mjs` reads, and the only one it reads.

So the STALLED branch does not guard against a run that hangs. It guards against
the status file's own source of truth going stale underneath it. And the damage
runs the opposite way from what I assumed: `STATUS.md` would have sat on
"**running**" indefinitely for a run that was **green**. It would have withheld a
true pass rather than concealed a failure.

That is still a 30 on this repo's rubric — the reader is told something that is
not so — but it is a different failure, and a guard whose stated purpose is wrong
is a guard nobody will maintain correctly.

## How I got it wrong

I read one endpoint and asserted a conclusion the other endpoint contradicted,
without asking it. `/runs` said in_progress; `/jobs` said completed at 14:40:55.
I never called `/jobs`.

That is this session's own recurring failure — one source, one direction — and it
arrived while I was writing the fix for a different instance of it. The
correction came from trying to *act* on the claim rather than from re-reading it:
the 409 is what disagreed with me. Nothing I wrote would have.

Worth stating plainly because the same shape has now appeared in the checks, in
the gate, in the deployed page, and here in my own reasoning about a run: **a
claim confirmed by exactly one lookup is a claim with no second opinion.**

## What changed

Comments only — the behaviour was already right, for a reason I had misstated.
`status.mjs` and `status-verdict-check.mjs` now say what the branch actually
defends against, and that it was found by an API refusal rather than by review.

CONFIDENCE: 98.

Artifacts: the 409 response; job 93811751301 reporting `completed`/`success` at
14:40:55 against run 31501321990 reporting `in_progress` at 15:22 —
the two endpoints disagreeing, which is the whole finding; `check:status` 23/23
unchanged, since no behaviour moved.

Two points off: the disagreement window is bounded by my observations
(14:40:55 completion, seen in_progress at 15:22 and 16:15), not by a measurement
of when the runs endpoint caught up. The 45-minute threshold is comfortably
inside that window either way, but "how stale does that endpoint get" is
answered by two data points and not by a study.
