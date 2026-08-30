# The rehearsal found the bug it was written to rule out

**Date:** 2026-08-30
**Scope:** `scripts/red-main-rehearsal.mjs` — diagnostic pass

Rehearsal run `33325017952`, the first one, failed 8/13. The log:

```
1. RED, nothing open
  verify: RED on rehears | sentinel issue: none | action: open
  opened #6
2. STILL RED, that issue open
  verify: RED on rehears | sentinel issue: none | action: open
  opened #7
```

**#6 was open, carried the marker, and was 400ms old. The lookup did not see
it, and the sentinel opened a duplicate.**

That is the precise failure the stateful design exists to prevent, and the
precise failure I switched away from `/search/issues` to avoid four hours
earlier. The reasoning for that switch — that the search index lags writes — was
sound. The replacement is broken in the same way, and the self-test's recording
fake could never have shown it: the fake returns the array I hand it.

It stayed invisible at +1.2s and +1.5s as well (steps 3 and 4 both read `none`).
An unauthenticated probe minutes later returned both #6 and #7 with their
bodies.

## Not calling it replica lag

"The GET is served from a replica" is the obvious story, which is exactly why it
is the one not to tell. Rule 77: *"That's expected because..." is not
investigation. It prevents investigation.*

Two candidate causes fit every observation so far and have **different fixes**:

1. The response does not contain the issue → a consistency problem, and polling
   or a different endpoint is the fix.
2. The response contains it and `findSentinel` does not match → a matching
   problem, and neither of those fixes would help.

Nothing in the run distinguishes them, because the run printed the verdict and
not the evidence. So the next run prints the evidence: the raw list response,
three times over three seconds, with each issue's number, state, `pull_request`
flag, and whether its body contains the marker.

## Cleanup

#6 and #7 closed as `not_planned`. Both carried `REHEARSAL_MARKER`, never the
live one, so the live sentinel was never able to see them — the isolation
assertion held while the lookup did not.

---

## The answer: `len:0`

Run `33325161310`, with the diagnostic:

```
[diag +0ms]    array:true len:0 (empty)
[diag +1000ms] array:true len:0 (empty)
[diag +2000ms] array:true len:0 (empty)
...
17:24:23.95   verify: green on rehears | sentinel issue: #8 open | action: close
```

**Hypothesis 1.** The issue is absent from the response, not present-and-unmatched.
`GET /repos/{owner}/{repo}/issues` is eventually consistent, and the write became
visible between +4s and +5s.

The same run shows both halves of the consequence. Step 2, at +4.2s, still read
`none` and opened a duplicate #9. Step 4, at +6.7s, still saw #8 as open after
step 3 had closed it, and closed it a second time.

So the endpoint lags in both directions: a write is invisible for a few seconds,
and a delete-shaped write stays visible for a few seconds.

## The defect underneath

This is the identical mistake, one layer down. I moved off `/search/issues`
because its index lags writes — correctly — and then asserted, from memory
rather than from a probe, that the list endpoint is read-after-write consistent.
The repo's own rule names it:

> **Is this the source, or a copy of the source?**

"REST list endpoints are strongly consistent" was not read from anything. It was
a belief about how an API ought to behave, which is the weakest kind of copy.

## Why not just rely on the gap between runs

`status.yml` has `concurrency: group: status, cancel-in-progress: true`, and its
jobs measured 13s, 16s, 16s. Two sentinel executions therefore cannot land
inside a 5s window today, and the production duplicate risk is near zero.

That argument is true and was not accepted as the fix. It is a **2.6× margin
resting on one measurement of someone else's replication lag**, and it
disappears silently the day the job gets faster.

## The fix

`settle(api, repo, marker, want)` polls the same lookup the next run will use,
and the write paths do not return until the list agrees with them:

- **open** → wait until the new issue is visible. Without this the next run
  opens another.
- **close** → wait until it is gone. Without this the next run comments on a
  closed issue.

It reports `settled: false` past a 20s bound rather than pretending, and the
log line carries the measured latency either way. Three states, not two.

## The fake was rewritten to lag

The recording fake returned whatever array I handed it, which is a fake of an
API that does not exist — and the duplicate lived exactly in the gap between
that fake and the real thing. It now models the lag: a write becomes visible
after N list reads.

```
PASS  THE OPEN PATH WAITS FOR ITS OWN WRITE TO BECOME VISIBLE
PASS  ...and it polled the list more than once to establish that
PASS  THE CLOSE PATH WAITS FOR THE ISSUE TO DISAPPEAR
PASS  a write that never becomes visible is reported as unsettled, not as settled
```

### One of those was vacuous, and mutation caught it

`THE CLOSE PATH WAITS` first read `laggedClose.settled === true` alone. The
mutant that deleted the close path's settle entirely — replacing it with a
hardcoded `{ settled: true }` — **passed 29/29**. The check read a field the
mutation supplies.

That is the sixth instance of this shape in this session. Rewritten to assert
the poll count, which is evidence a wait happened:

```
open path settle deleted   -> 28/29
close path settle deleted  -> 28/29   (was 29/29 before the rewrite)
restored                   -> 29/29
```

## Cleanup is now the rehearsal's job

`33325017952` left #6 and #7 open because the duplicate it created was never in
a variable to clean up. The rehearsal now sweeps every open issue carrying
`REHEARSAL_MARKER` at the end and asserts none remain. #6, #7 and #9 closed as
`not_planned` by hand this once.
