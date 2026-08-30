# Three branches that would first run during the outage

**Date:** 2026-08-30
**Scope:** `scripts/red-main-issue.mjs`, `scripts/red-main-rehearsal.mjs` (new),
`.github/workflows/red-main-rehearsal.yml` (new)

## The gap, from the run that proved the other half

The red-main sentinel shipped as `919e92f` and ran on a real runner four minutes
later. Its log line, from status run `33323829305`:

```
20/20 checks passed
  verify: green on 919e92f | sentinel issue: none | action: none
  nothing to do
```

That proves a great deal: the self-test runs on the runner, `readVerify` was
read successfully, the issue list API call was made and returned nothing, and
the decision was `none`.

It proves exactly **one of four branches**.

`open`, `comment` and `close` all write. Every one of them requires main to be
red, which means the first time they execute would be during the incident they
exist to report, with nobody watching. A missing `issues: write`, a body GitHub
rejects, a `state_reason` value it does not accept — each surfaces as a failed
step in a run nobody is reading, and the alert that was supposed to arrive
simply does not.

"It will be proven the next time main breaks" is a carry-forward. Rule 87 calls
that a spec failure, and it is the same shape as the standing instruction that
"cannot be tested" is not a valid excuse.

## Two layers, and the second one is not optional

### A recording fake, in the self-test

`run()` was extracted from the straight-line `isMain` block so the branches are
callable at all, with `api` injected. Five new fixtures drive it against a fake
that records the HTTP calls:

```
PASS  RED with nothing open POSTs a new issue
PASS  ...and the issue it POSTs carries the marker
PASS  RED with one open POSTs a COMMENT and no second issue
PASS  GREEN with one open comments THEN patches it closed
PASS  GREEN with nothing open WRITES NOTHING
```

The ordering assertion earns its place: commenting *after* the close would land
on a closed issue and read as a reopening. The last one earns its place too —
that path runs on **every green deploy**, so any write on it is noise per
deploy.

Mutation-proven, both:

```
close path reordered (PATCH before the comment)  -> 24/25, FAIL on the ordering fixture
comment branch made unreachable                  -> 24/25, FAIL on the comment fixture
restored                                         -> 25/25
```

### And that is still a copy of the API

A fake proves the calls are **issued**. It cannot prove GitHub **accepts** them.
That is a cross-boundary fact, and this repo's own rule is explicit about what
happens next:

> A cross-boundary fact is not verified by reading. If one command answers it,
> not running that command is the defect, however obvious the reading looks.
>
> **Is this the source, or a copy of the source?**

The fake is a copy. It returns `{ number: 42 }` for everything because that is
what I wrote it to return. It would have happily accepted a `state_reason` that
GitHub rejects.

## The rehearsal

`scripts/red-main-rehearsal.mjs` drives the same `run()` against the real API on
a marker no live sentinel can carry, and asserts against **GitHub's own view of
the issue** after each transition rather than against `run`'s return value — a
function reporting what it believes it did is the thing under test.

```
1. red,   nothing open  -> open     read back: state open, body carries the marker
2. red,   that issue    -> comment  read back: still open, comments >= 1
3. green, that issue    -> close    read back: state closed, comments >= 2
4. green, nothing open  -> none     the closed issue is not found again
```

Step 4 is the one that is easy to leave out and matters most: a close that the
lookup still matches would comment on a closed issue forever.

### Isolation is asserted, not assumed

`REHEARSAL_MARKER` is deliberately **not** a superstring of `MARKER`. If it
contained the live marker, `findOpen(MARKER)` would match the rehearsal issue,
and a genuinely red main during a rehearsal would comment on a rehearsal instead
of opening its own alert. `isolated()` checks containment in both directions and
has its own fixtures, including one that confirms the detector catches a
superstring.

The rehearsal also closes any leftover issue from an interrupted run before
starting. Without that, step 1 would comment rather than open, and the run would
report a pass for the wrong reason.

## `fetch-depth: 0`, and check:workflows insisted

The first version of the workflow used a shallow checkout with a comment saying
"this reads no git history." `check:workflows` failed it:

```
FAIL  no job runs a build-dependent script without building
      → red-main-rehearsal.yml:rehearse runs scripts/deployable.mjs
        — which read git history — without fetch-depth: 0
```

It is right. The rehearsal imports `run` from `red-main-issue.mjs`, which imports
`readVerify` from `status.mjs`, which reaches `deployable.mjs` — a history
reader. My comment was a claim about **runtime** ("that import is never called
on this path"), and the checker sees **static reachability**. The runtime claim
is one refactor away from false.

A full clone costs seconds on a dispatch-only workflow. Weakening the detector
to accept a shallow one would cost the next job that really does read history,
which is the mistake it was written for.

## Cost

`workflow_dispatch` only. No schedule, no push trigger. It fires when someone
asks it to and never on its own — against a budget recorded in `status.yml`'s
header as 90% consumed with two weeks of the month left, a rehearsal that fires
by itself would be worse than no rehearsal.

## Verified

```
node scripts/red-main-issue.mjs --self-test       25/25
node scripts/red-main-rehearsal.mjs --self-test    3/3
npm run check:workflows                            6/6
npm run check:script-orphans                       3/3
npm run check:import-purity                        2/2
```

The dispatched run's output is the artifact for the write paths, and it is
recorded below this line once the run lands.

## What this does not do

It does not prove the sentinel fires on a genuinely red main — the trigger, not
the script, decides that, and the trigger is `status.yml`'s gate, which has its
own truth table exercised in
`outbox/cc-status-went-quiet-when-it-had-something-to-say-2026-08-29.md`.

It also does not run itself on a schedule, which means the rehearsal can rot: a
future change to `run()` breaks the write paths and nothing notices until
someone dispatches it. The self-test's fake covers that case at the pre-commit
door, which is the cheap half; the expensive half stays on demand deliberately.
