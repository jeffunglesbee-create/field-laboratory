# The live pick route, on a runner — and an accidental ET proof — 2026-08-10

`data/pick-2026-07-07.json` was transcribed from a Drive document, not fetched:
this sandbox has no route to the relay. `scripts/pick-live-check.mjs` exists so
that transcription meets the real route somewhere that does. It ran on a GitHub
Actions runner for the first time in verify run `31445754393`, job
`93639495941`, step 23.

Verbatim from the job log:

```
GET https://field-relay-nba.jeffunglesbee.workers.dev/analytics/newspaper/2026-08-10

  outcome: Passed
PASS  the live newspaper bundle decodes
PASS  the outcome is one of the three modelled cases
PASS  the transcribed fixture still decodes to a Picked board

3/3 checks passed
```

## Three things that are now known rather than assumed

**The route is live and returned 200.** The check was written to treat an HTTP
failure as reportable-but-not-fatal, because the analytics bundle genuinely may
not exist for a given date. It did not need that allowance. The decoder ran
against real, current relay output.

**A second outcome case has now been observed in real data.** The response was
`Passed` — the analytics engine ran for 2026-08-10 and declined to pick. That
branch was modelled from the production code's `type: 'pass'` description
without ever having seen one. It decoded correctly on first contact.

Two of three modelled outcomes are now evidence-backed rather than inferred:

| Case | Status |
| --- | --- |
| `Picked` | seen — the transcribed 2026-07-07 response |
| `Passed` | **seen live, 2026-08-10** |
| `NoPickSection` | still only inferred, from the fact that `ranked` post-dates the pick feature |

That last row stays honest rather than quietly promoted.

**Collapsing `Passed` into `NoPickSection` would have been wrong today.** The
panel now says "Passed on tonight" rather than "no pick section in this
payload", and those are different statements about a working pipeline versus an
absent one. Tonight the pipeline worked and declined. A single "no pick" case
would have reported a false problem.

## The accidental part

The check asks for a date, and it gets it from `fieldDay()` — the FIELD-zone
helper written this morning during the ET/UTC work, which has nothing to do
with picks.

The step ran at **00:25:04 UTC on 2026-08-11**. That is 20:25 EDT on the 10th —
inside the 00:00–04:00 UTC divergence window, the four hours where ET and UTC
disagree about what day it is.

It requested `2026-08-10`. A `new Date().toISOString().slice(0, 10)` would have
requested `2026-08-11` — tomorrow's slate, which does not exist yet, and the
check would have reported an unreachable route and passed anyway while proving
nothing.

Nobody arranged that. `scripts/window-check.mjs` was built this morning
precisely because the divergence window is hard to observe and every scheduled
job in this repo runs outside it. A check written hours later, for an unrelated
feature, landed inside the window on its first run and asked for the right day.

Two notes on how much that is worth. It is a **demonstration, not a proof** —
one favourable timestamp, where `zone-check.mjs`'s 16 fixed-instant assertions
are the actual guarantee. And it is only visible because the log prints the
requested URL. Had it printed `outcome: Passed` alone, the run would have looked
identical whichever day it asked for.

## Still not verified

The **shape** of a live `Picked` board. Today's response passed, so the
`ranked`/`brief`/tie assertions did not execute against live data — they ran
against the transcription. Those assertions exist and will fire on the first
night the relay picks. Until then, the ranked-list handling is verified against
a transcribed capture and nothing more, which is what
`data/pick-2026-07-07.json`'s `_provenance` block already says.

No source changed in this entry. It records a result.
