# Session 2026-11-03 — the patent watcher's replacement source, PPUBS, probed before it is built

CC-CMD: `docs/CC-CMD-2026-11-02-scheduled-job-skipped-every-time.md` in field-relay-nba, TASK 4b. The client side of the same work is
`outbox/cc-session-2026-11-02-patent-watch-caller.md` in jubilant-bassoon.

## Why this lives here

LAB-FIRST-A: new proofs belong in this repository. The client keeps `patent_watch.py` itself (existing client code stays where it is);
what is new is the measurement of the source it will read and the check that holds the fix, and both are built here.

## What this work is made of

Commit `140dcfa` added the three files below; the second commit extends them with the reading mode and 429 handling after run 1.

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
| the probe's judging and exit codes are right | **VERIFIED** locally | `python3 scripts/probe-ppubs-query.py --self-test`: 27/27 in the first version, 45/45 in the second, against the stand-in, whose true query forms are deliberately not the first candidates; a host answering 500, an HTML page, or `{}` makes the probe exit 1; a host that answers single terms and no conjunction makes it exit 1 |
| the self-test has teeth | **VERIFIED** | seven mutants of the probe (a verdict function that always passes, one that ignores the minimum, the foreign-assignee check, the known-guid check, exit 0 on failure, exit 0 on a failed session, `ok` that ignores the combined result) each turn it red; the last one survived the first version of the test and is why the no-conjunction host exists |
| the workflow is valid | **VERIFIED** | `actionlint` exit 0; `check:workflows`, `check:script-orphans`, `check:short-circuit`, `check:clean-source`, `check:mutation-anchors` pass; `check-push-lands.py`: 14 of 14 loops verify the push landed |
| which query forms the real host answers | **MEASURED**, run 1 | see "Run 1" below |
| `check:import-purity` | fails here on 4 scripts that import packages absent from this sandbox (`node_modules` is not installed); not touched by this work |

## Run 1 (mode forms, 2026-11-03T04:52Z, run 41580587437): what the real host answered

Report: `outbox/ppubs-query-probe-20261103T045459Z.md` and `.json`. Grant day 2026-10-27, publication day 2026-10-29, 153 s, 0 session renewals.

| finding | evidence |
|---|---|
| anonymous session works from a runner; `"10846193".pn.` returns US-10846193-B2 | phase 0 |
| date forms that return 100 documents all dated the target day, on USPAT and on US-PGPUB: `@PD="20261027"`, `@PD=20261027`, `@PD>="20261027"<="20261027"`, `@PD>=20261027<=20261027`, `20261027.pd.`, `"20261027".pd.`, `(20261027).pd.`, `@PD>="20261027" AND @PD<="20261027"`, `@pd="20261027"`, `20261027.PD.` | phase 1 and 1b |
| **ISO dates answer 200 with zero documents**: `@PD="2026-10-27"` and `"2026-10-27".pd.` | phase 1: the silent-zero shape the probe exists to catch |
| assignee forms that return US-10328326-B2 and only RUWT documents: `"RUWT".as.`, `RUWT.as.`, `(RUWT).as.`, `"RUWT".asnm.`, `RUWT.asnm.` | phase 2 |
| **`"RUWT".asg.` answers 200 with zero documents; `@AS="RUWT"` answers HTTP 500** | phase 2 |
| `"RUWT".as. AND @PD="20190625"` returns exactly US-10328326-B2; so do the other seven combined spellings that ran before the first 429. Of 16 combined queries 11 returned the known patent and 5 (queries 9, 10, 11, 12 and 16) got 429 on the search and read as zero documents, so the report's list of passing combined forms is a floor | phase 3 |
| a whole grant day has 5,835 documents: the counts call returns `numResults: 5835` for `@PD="20261027"` on USPAT | phase 1 counts body |
| the search response holds `numFound`, `perPage`, `page`, `totalPages`, `hlSnippets`, `sort`, `query`, `duration`, `highlightingTime`, `cursorMarker`, `totalResults`, `numberOfFamilies`, `error`, `patents` and `qtime`. `numFound` is the page size (100 on a 100-document page, 500 on a 500 page); `totalResults` is an int whose value run 1 did not record | phases 0, 1, 5 |
| **a page can hold more documents than its `numFound`**: `start` 500 with `pageCount` 500 returned `numFound` 500 and 504 entries in `patents` (2.25 MB in 560 ms). The endpoint is `searchWithBeFamily`; the four extra are not explained by anything in run 1, so a count taken as `len(patents)` can exceed the page size | phase 5 |
| US-PGPUB holds 10,085 documents for 2026-10-29 (counts `numResults`), against 5,835 USPAT documents for 2026-10-27 | phase 1b |
| document fields used by `patent_fetch.py` are real: `guid`, `type`, `datePublished` (`2020-11-24T00:00:00Z`), `assigneeName` (list), `inventionTitle`; `applicantName` also exists | phase 0 sample document |
| **PPUBS rate-limits: HTTP 429 with body `{"message": "Too many requests"}`**. The first was the search call of the 9th combined query: the 39th query and the 78th call of the run, at 0.5 s between calls. Counted over the whole report: phase 3, 4 of 16 counts calls and 5 of 16 search calls; phase 4, 33 of 64 counts and 40 of 64 search; phase 5, 1 of 2 and 1 of 2; the closing number control got 429 on its search, so that control did not run | phases 3 to 6 |
| one phase-4 query that did get through found a document the assignee field does not hold: `"New Relic" AND @PD="20261029"` on US-PGPUB returned US-20260339771-A1 ("Techniques for proactive automatic program repair integrated into code review...") with an EMPTY assignee, while `"New Relic".as.` for the same day returned zero. The all-fields phrase reaches text the assignee field does not | phase 4 |

What run 1 did NOT establish: the real week's reading (almost every phase-4 query was 429, and a 429 is recorded as zero documents, which is why the probe now counts unrecovered 429s as failures), whether the counts call is needed, whether one OR query equals fifteen single-term queries, how many hits the assignee field and the phrase each produce per week, and a known answer on US-PGPUB.

## Run 2 (mode reading): what it measures, and the self-test that holds it

The probe now backs off on 429 (waits the `Retry-After` header if numeric, else 20 s, up to three retries per call, recording each event's headers), paces at 3 s, and in mode reading runs the watcher's own flow: the newest documents per watchlist term and database since 2019 (known answers), the production form (`"{term}".as. AND @PD="{day}"`) and the OR form on each known answer, eight weeks of date totals on both databases (counts call against search `totalResults`), eight weeks of assignee-field and all-fields OR queries, and the OR query against the union of fifteen single-term queries for the newest week. It fails if any 429 is unrecovered, if a day has fewer than 500 documents, or if OR and union differ.

`--self-test` is 45/45 against the stand-in (re-run 2026-11-03T05:11Z, 14 s), which now models the measured shapes (`numResults`, `totalResults`, page-sized `numFound`, 429 with `Retry-After`) and ten broken-host modes. The v2 checks were mutation-tested in the session that wrote them, and the one mutant that stayed green, removing the explicit "run was truncated" clause, is equivalent (a truncated run also fails the OR-versus-union completeness check). That mutant harness was run inline and is not committed, so this document records no mutant count; the first version's seven mutants are the table row above.

## The stand-in's limits

Its document shape comes from the key names `patent_fetch.py` reads (`patents`, `docs`, `guid`, `type`, `datePublished`, `assigneeName`,
`inventionTitle`), and since run 1 its counts and search envelopes follow what the real host returned (`numResults`, `totalResults`,
a page-sized `numFound`, 429 with a message body). It does not model a page whose `patents` list is longer than `numFound` (504 against
500 in run 1), `cursorMarker`, or `numberOfFamilies`. Everything it proves is about the probe's and the watcher's logic, nothing about
the real host's behaviour.
