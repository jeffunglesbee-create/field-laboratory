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
