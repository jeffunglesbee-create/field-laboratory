# "Preconnect works" was wrong — that run tested the build from before it

I reported preconnect fixed the weather chips. It has not been shown to fix
anything. The run I read as proof had measured a build that did not contain it.

## The timeline, which settles it

| when | what | commit | result |
|---|---|---|---|
| 13:22:12 → 13:24:27 | verify | `f7c0248` | **success**, render step at 13:24:12 |
| **13:24:29 → 13:25:26** | **deploy** | **`f7c0248`** | **success — 17s AFTER that render step** |
| 13:26:22 → 13:28:44 | verify | `c6ceb27` | **failure**, render step at 13:28:41 |
| 13:28:46 | deploy | `c6ceb27` | skipped (scripts + outbox only) |

`check:live` targets the deployed URL. So the run that passed 22/22 in two
seconds tested the **pre-preconnect** page, and the first run that provably
tested preconnect **failed**.

This is the identical confound that produced the false start of this whole
investigation at verify run 159 this morning — verify tests the deployed site,
deploy is a separate workflow, and the two are not ordered. I diagnosed it
correctly at 02:20 and then walked into it again at 13:24, because nothing in
the check states which bytes it measured.

## What the timings actually say

```
Request timings (start+duration):
  674+8000ms   674+8000ms   674+8000ms   674+8001ms     ← wave 1, four concurrent
  8675+468ms   8675+470ms                                ← wave 2, two concurrent
```

Wave 1: four requests, all starting at t=674ms, all aborted at the 8000ms cap.
Wave 2: two requests starting the instant wave 1 gives up, both answering in
about 470ms.

**470ms is a normal request, and this page had preconnect.** So connection setup
is not the explanation — DNS, TCP and TLS were already paid during page load and
wave 1 hung anyway. The hypothesis in the previous commit is refuted by the
first run that actually tested it.

What remains true and unexplained: the first wave hangs, later waves are fine,
across three runs and two slate sizes, with and without preconnect. And the
symptom is intermittent — 13:19 failed and 13:24 passed, both on the same
pre-preconnect build.

## The change, which is not another guess

`render-check.mjs` now fetches `/version.txt` — which `build-site.mjs` already
writes and the deployed worker already serves — and reports it:

```
URL:           https://field-laboratory.jeffunglesbee.workers.dev/
built from:    55b87ad
```

Printed on every run and carried into the chip failure detail. No future reading
of these numbers has to reconstruct which build produced them, and a page change
can no longer be judged against a run that predates its deploy.

That is the actual root cause of today's wrong conclusion. It is fixed rather
than noted.

## What was NOT changed

The preconnect tag stays in `index.html`. It is refuted as *the* fix, not shown
harmful — the failure shape is identical with and without it, and removing it in
the same commit would confound the next reading exactly as this one was
confounded. `requestCapMs`, `slateDeadlineMs` and `maxInFlight` stay put.

No new theory of the first-wave hang is offered here. Three rounds of
theory-then-fix have produced two refuted hypotheses; the next move is to read
the build stamp and the timings from a run that provably tests what it claims.

## Local

`check` 17/17 (`built from: 55b87ad` printed), `check:hard` 17/17, workflows,
clean-source, docs.

Note: the first attempt at this edit silently no-op'd — the anchor
``console.log(`URL: ${URL}`)`` does not exist; the real line carries a leading
newline. The replace reported success and printed nothing. Caught by running it
rather than by trusting the edit.
