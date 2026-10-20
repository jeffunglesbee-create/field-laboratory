# Claude Code Command — verify's weather step fails on an Open-Meteo 503

**Branch:** main — commit directly, do not create a feature branch or PR
**Repo:** field-laboratory
**Filed:** 2026-10-17, by CC, from a measured failure (below)
**Confidence gate:** `npm run gate` must score >= 95 before any commit
**Status:** **DONE 2026-10-20**, landed as `31901c0`, `d13c4b3`, `264d3c1`
(main). Done conditions: (1) Task 0's count is in
`outbox/cc-session-2026-10-20-weather-live-every-call.md`; (2) a 16-case
`--self-test`, with 5 registered mutations, all caught; (3) gate 530/530
(`verify-full` run 39489924109, record `06b11f4a1411-6eb31c4ec647`); (4)
`verify` green on main, run 39503750847, and `drift-sentinel` green with no
flag, run 39504314648 (its weather step runs the self-test's no-flag cases
first). Remaining gap: the first calls have no retry, filed as
`docs/CC-CMD-2026-10-20-weather-first-call-connect.md`.

---

## What happened

`verify` run 38984732123 (commit `5e65e87`) failed at "Weather against the LIVE
Open-Meteo API", which runs `node scripts/weather-live-check.mjs
--tolerate-unreachable`. Its annotation:

```
Coors Field: HTTP 503
      → Yankee Stadium: request failed — fetch failed
```

Nothing in `5e65e87` or its parent `b6f1fcf` touches weather. The next push's
`verify` (run 38995263400, commit `db75760`) passed the same step. The failure
was Open-Meteo's, and it turned `verify` red on a commit it said nothing about.

It recurred on `d9f2cce` (run 39003023704), a rename inside `src/Stamina.fs`:
17 venues answered 503 or failed to connect. The same outage also failed a
second step, "Render check against the LIVE slate":

```
The page reported: 1 venue(s) did not answer: Dignity Health Sports Park:
signal timed out after 8000ms.
```

Whether that step is meant to fail on a weather outage is not established here;
Task 0 reads it before deciding.

## Why the flag did not cover it

The script's own header states the intent: verify answers "is this commit
correct?", and "a third party being down is not evidence about the commit". It
cites `pick-live-check`'s rule as the model: "an HTTP failure is reported and
not fatal; a 200 the decoder cannot read is fatal, which is the actual
assertion".

The code does less than that. `TOLERATE` is read in exactly one place, the
`catch` around the FIRST request, so it covers a request that throws and
nothing else:

- a first request that answers non-200 fails `check('Open-Meteo answers 200')`;
- in the per-venue loop, `!res.ok` and a thrown `fetch` both become a named
  mismatch, and `check('every venue resolves to the IANA zone it declares')`
  fails on them, flag or no flag.

Run 38984732123 is the second case: the first request succeeded, then one
venue drew a 503 and the next a connection failure.

## The hazard this must not reopen

The same header names it: "if unreachable were tolerated everywhere, the check
could pass forever having never run." The fix must keep both properties that
hold today:

1. drift-sentinel, which passes no flag, stays fatal on every outage;
2. verify, under the flag, never reports a tolerated outage as a pass in
   silence: it prints `::warning::` and says how many venues it did not check.

A venue that answered 200 and resolved to the WRONG zone is a real finding in
both jobs, always. Only "did not answer" may be tolerated.

## Task 0 — probe

1. `git log --oneline -5`; read `scripts/weather-live-check.mjs` whole.
2. Count, in the last 30 `verify` runs, how often this step failed and with
   which annotation (GitHub API, `check-runs/{id}/annotations`). A step that
   failed once in 30 is a different decision from one failing weekly.
3. Read the "Render check against the LIVE slate" step and the script it runs,
   and state whether a venue whose weather did not answer is meant to fail it.
   If it is not, it gets the same treatment as Task 1; if it is, say why.

## Task 1 — the fix

Under `--tolerate-unreachable` only: a non-200 or a thrown request, on the
first call or on any venue, is UNREACHABLE for that call. Report each one by
name with `::warning::`, keep checking the venues that did answer, and assert
on those. If no venue answered, say so and exit 0 under the flag, exit 1
without it. The coverage line prints `checked N of M venues`, M the table's length (SAMPLE-COVERAGE-A,
`field-relay-nba/CLAUDE.md`).

## Task 2 — mutations (MUTATE-FIRST-A, `field-relay-nba/CLAUDE.md`)

Through a stub server, or an injected fetch, with each case seen to fail first:

- under the flag, a 503 on one venue: exit 0, a warning naming that venue,
  `checked M-1 of M`;
- without the flag, the same 503: exit 1;
- under the flag, one venue answering 200 with the wrong zone: exit 1;
- under the flag, every venue unreachable: exit 0 with `checked 0 of M`, and
  without it exit 1.

## Done conditions

1. Task 0's count is in `outbox/`.
2. The four cases above are self-tests that ran red before the fix and green
   after.
3. `npm run gate` >= 95.
4. One `verify` run green on the fixed commit, and one drift-sentinel run
   showing the flagless path still fatal on an injected outage (its
   self-test, since a real outage cannot be scheduled).

## Recurrence observed 2026-10-20

`verify` run 39454054451 (main, `7505a58`, 16:05Z) failed this CC-CMD's step,
"Weather against the LIVE Open-Meteo API", for the shape described above, at a
different place in it:

```
FAIL  every venue resolves to the IANA zone it declares
      → Fenway Park: request failed — fetch failed
11/12 checks passed
```

The first call had answered (the step got past the reading and the latitude
probes), then a per-venue zone request threw. Every other check in that step
passed. So `--tolerate-unreachable` does not cover "reachable on call 1,
unreachable on a later call", which is the case Task 1 above already names ("on
the first call or on any venue"). Earlier the same day, run 39437657525
(14:18Z) hit the other half: the first call failed and was tolerated. Two
occurrences in one day, one on each side of the gap. Task 0's count over the
last 30 runs is still the first thing to do.

That run also failed "Render check against the LIVE slate", which is a separate
defect: `docs/CC-CMD-2026-10-20-live-slate-venue-coverage.md`.
