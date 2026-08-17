# Outbox — a CC-CMD is a wish with a commit sha until something checks it

**Date:** 2026-08-17
**Ships:** `scripts/cc-cmd-followup.mjs`, one daily drift-sentinel step

## The gap

Five CC-CMDs have been filed into `field-relay-nba/docs/` from here. Two carry
open asks. **Nothing checked whether any of them were acted on.** Filing was the
end of the process, which makes a CC-CMD a wish with a commit sha attached.

That is the same failure this repository keeps finding in other people's work —
a claim written down once and never re-derived — applied to its own outbound
requests.

## What it probes

The **observable consequence** of each ask, never the document. A document can be
read, agreed with, and never implemented; a route either projects a field or it
does not.

| ask | probe | landed when |
|---|---|---|
| name the scale on the flat 240 bar | `/quality/report` | a denominator or `reachable_ceiling` appears |
| expose the coverage numbers on a GET | `/quality/coverage?days=7` | the route answers with `byDay` or `era3ByType` |
| add `scoring_version` to `/archive/query` | `/archive/query?…&limit=1` | the field is present on a row |

The third is the one to watch: **Phase 2 unblocks the day it is true.** Every
stored score gains a rubric, `Attribution.Stamped` becomes constructible from
real data, and the set difference that is currently all 592 rows starts shrinking.

## Two design choices worth defending

**"Not yet" is not a failure.** It is someone else's backlog. Turning another
team's queue into a red build here is how a check gets deleted rather than
answered, and it would make this repo's CI a pressure instrument rather than a
measurement.

**"Could not tell" IS a failure.** If every probe is unreachable the script exits
non-zero, because reporting "not landed" from no data is a claim from nothing —
the exact shape of the vacuity failures this repo has spent the session finding.
Verified locally: all three probes return 403 at the agent proxy, and it exits 1
rather than reporting three pending asks.

A landed ask emits `::notice::` lines, so the day one lands it is visible in the
run summary rather than only in a log nobody opens.

## Where it runs

`drift-sentinel`, daily, `if: always()`. It adds a few seconds to a job that
already averages one minute, and the sentinel is the right home: its whole
purpose is noticing that the world moved.
