# Session 2026-11-03 — the patent watcher's replacement source, PPUBS, probed before it is built

CC-CMD: `docs/CC-CMD-2026-11-02-scheduled-job-skipped-every-time.md` in field-relay-nba, TASK 4b. The client side of the same work is
`outbox/cc-session-2026-11-02-patent-watch-caller.md` in jubilant-bassoon.

## Why this lives here

LAB-FIRST-A: new proofs belong in this repository. The client keeps `patent_watch.py` itself (existing client code stays where it is);
what is new is the measurement of the source it will read and the check that holds the fix, and both are built here.

## What is in this commit

| file | what it is |
|---|---|
| `scripts/probe-ppubs-query.py` | judges candidate PPUBS query forms for a publication date and for an assignee against a known answer, then reads the real week for every watchlist term |
| `scripts/ppubs_stand_in.py` | the anonymous half of ppubs.uspto.gov, served locally from a corpus the test supplies, so the probe and the watcher can be run in seconds instead of on a runner |
| `.github/workflows/ppubs-query-probe.yml` | dispatch-only runner for the probe; commits `outbox/ppubs-query-probe-<stamp>.json` and `.md` |

## Why the probe exists

The watcher read `bulkdata.uspto.gov`, whose DNS record is gone, and exited 0 on every fetch it failed. Its replacement reads PPUBS, the
backend `patent_fetch.py` already uses to pull claims by patent NUMBER. That path worked in June: `patent-fulltext.yml` dispatches ended
`success` on 2026-06-04 and 2026-06-09 (latest 27241140960), and `outbox/patents/US*.json` carries `_source: "ppubs"`; those runs' logs
are past retention, so nothing here says it still works today, which the probe's first and last query answer. Nothing has ever searched PPUBS by assignee or by
date range, and its query syntax is undocumented. A form the server does not understand answers 200 with zero documents, which a watcher
would report as "no matches this week". So no form is accepted for what it fails to return:

- a date form passes only if it returns at least 20 documents and every one carries that publication date;
- an assignee form passes only if it returns the known patent (US10328326, assignee "RUWT, LLC", granted 2019-06-25, from the client's own
  PPUBS output) and every document it returns names the assignee;
- a combined form must return that patent for that assignee on that date;
- the `"10846193".pn.` form the client already uses runs first and last, so a broken session cannot pass as a working syntax.

## Verified so far

| claim | status | evidence |
|---|---|---|
| the probe's judging and exit codes are right | **VERIFIED** locally | `python3 scripts/probe-ppubs-query.py --self-test`: 27/27 against the stand-in, whose true query forms are deliberately not the first candidates; a host answering 500, an HTML page, or `{}` makes the probe exit 1; a host that answers single terms and no conjunction makes it exit 1 |
| the self-test has teeth | **VERIFIED** | seven mutants of the probe (a verdict function that always passes, one that ignores the minimum, the foreign-assignee check, the known-guid check, exit 0 on failure, exit 0 on a failed session, `ok` that ignores the combined result) each turn it red; the last one survived the first version of the test and is why the no-conjunction host exists |
| the workflow is valid | **VERIFIED** | `actionlint` exit 0; `check:workflows`, `check:script-orphans`, `check:short-circuit`, `check:clean-source`, `check:mutation-anchors` pass; `check-push-lands.py`: 14 of 14 loops verify the push landed |
| which query forms the real host answers | **NOT YET MEASURED** | the sandbox cannot reach ppubs.uspto.gov; the dispatch is the next step and its report is appended below |
| `check:import-purity` | fails here on 4 scripts that import packages absent from this sandbox (`node_modules` is not installed); not touched by this work |

## The stand-in's limits

Its response shapes come from the key names `patent_fetch.py` reads (`patents`, `docs`, `guid`, `type`, `datePublished`,
`assigneeName`, `inventionTitle`); `numFound` and the counts shape are guesses. Everything it proves is about the probe's logic, nothing
about the real host's behaviour.
