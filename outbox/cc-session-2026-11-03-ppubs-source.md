# Session 2026-11-03 — the patent watcher's replacement source, PPUBS: probed, then built and held by a check

CC-CMD: `docs/CC-CMD-2026-11-02-scheduled-job-skipped-every-time.md` in field-relay-nba, TASK 4b. The client side of the same work is
`outbox/cc-session-2026-11-02-patent-watch-caller.md` in jubilant-bassoon.

## Why this lives here

LAB-FIRST-A: new proofs belong in this repository. The client keeps `patent_watch.py` itself (existing client code stays where it is);
what is new is the measurement of the source it will read and the check that holds the fix, and both are built here.

## What this work is made of

Commit `140dcfa` added the three files below; the second commit extends them with the reading mode and 429 handling after run 1; the third corrects the reading of the response counters after run 2 and adds the fourth file; the fourth (this one) builds the watcher's side, rows 5 to 9, and extends the stand-in with seven modes those need (`no_phrase`, `phrase_lossy`, `flaky500`, `date_loose`, `no_guid`, `json_list`, `error_field`) and a log of the queries it was asked.

| file | what it is |
|---|---|
| `scripts/probe-ppubs-query.py` | judges candidate PPUBS query forms for a publication date and for an assignee against a known answer, then reads the real week for every watchlist term |
| `scripts/ppubs_stand_in.py` | the anonymous half of ppubs.uspto.gov, served locally from a corpus the test supplies, so the probe and the watcher can be run in seconds instead of on a runner |
| `scripts/mutate-ppubs-probe.py` | breaks the probe's counter checks one at a time on a copy and requires its self-test to go red each time |
| `.github/workflows/ppubs-query-probe.yml` | dispatch-only runner for the probe; commits `outbox/ppubs-query-probe-<stamp>.json` and `.md` |
| `scripts/check-patent-watch.py` | runs jubilant-bassoon's `.github/scripts/patent_watch.py` unmodified against the stand-in: 32 scenarios, 206 checks. A week it could not read ends red with no manifest and no `GITHUB_OUTPUT` in each of 33 cases (counted as the `writes no manifest` assertions of a run); a week it read says what it read |
| `scripts/mutate-patent-watch.py` | breaks the watcher 38 ways and the rehearsal tool 6 ways, on copies, and requires the check to go red for each |
| `scripts/patent-watch-rehearsal.py` | runs the client's watcher on the real host with the Actions environment removed, so nothing is filed or chained, and keeps each week's log and manifest in `outbox/patent-watch-rehearsal-<stamp>.md` |
| `.github/workflows/patent-watch-rehearsal.yml` | dispatch-only runner for the rehearsal; commits the evidence |
| `.github/workflows/verify.yml`, job `patent-watch` | the mutation harness and then the check, on every push to this repository, with jubilant-bassoon checked out unpinned into `.client-src` |

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
| the probe's judging and exit codes are right | **VERIFIED** locally | `python3 scripts/probe-ppubs-query.py --self-test`: 27/27 in the first version, 45/45 in the second, 56/56 in the third (and again at 2026-11-03T06:22Z, after the stand-in grew the modes above), against the stand-in, whose true query forms are deliberately not the first candidates; a host answering 500, an HTML page, or `{}` makes the probe exit 1; a host that answers single terms and no conjunction makes it exit 1; so does a host whose counters break the measured contract (below) |
| the counter checks have teeth | **VERIFIED** locally | `python3 scripts/mutate-ppubs-probe.py`: 14 of 14 mutants caught (about 6 minutes; again after the stand-in grew the modes above). A first draft of the checks had 7 survivors out of 13, each for the same reason: two clauses guarding one fault, or a clause no stand-in mode could reach; the duplicates were removed and four stand-in modes added (`docs_short`, `no_families`, `zero_date_page`, `bare_patents`) |
| the self-test has teeth | **VERIFIED** | seven mutants of the probe (a verdict function that always passes, one that ignores the minimum, the foreign-assignee check, the known-guid check, exit 0 on failure, exit 0 on a failed session, `ok` that ignores the combined result) each turn it red; the last one survived the first version of the test and is why the no-conjunction host exists |
| the workflows are valid | **VERIFIED** | `actionlint` exit 0 on `ppubs-query-probe.yml`, `verify.yml` and `patent-watch-rehearsal.yml`; `check:workflows`, `check:script-orphans`, `check:short-circuit`, `check:clean-source`, `check:mutation-anchors` pass; `check-push-lands.py`: 15 of 15 loops verify the push landed |
| the watcher keeps its rule on the stand-in | **VERIFIED** locally | `python3 scripts/check-patent-watch.py --real-watchlist <the client's watchlist>`: 206/206 in 32 scenarios, 47 s |
| the check has teeth | **VERIFIED** locally | `python3 scripts/mutate-patent-watch.py`: 44 of 44 caught, 38 of the watcher and 6 of the rehearsal tool, 86 s on 2 CPUs. A first run of the 38 caught all 38, which is a reason to read the list, not to stop: it does not cover the 3 s pacing, the Retry-After parsing (the test uses 0), the 401/403 session renewal or the prime request |
| the watcher reads the real host | **NOT YET MEASURED** when this was written | the rehearsal workflow had not run; see "What is open" below |
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

## Run 2 result (2026-11-03T05:12Z, run 41582509434, 169 calls, 540.7 s): what the real host answered

Report: `outbox/ppubs-query-probe-20261103T052138Z.md` and `.json`. Grant day 2026-10-27, publication day 2026-10-29. **0 rate-limit events in 169 calls and 0 session renewals at 3 s between calls**, against 11 of 16 combined queries limited at 0.5 s in run 1.

| finding | evidence |
|---|---|
| the number form works with the counts call and without it; **search alone is enough** | phase 0: both variants return US-10846193-B2 |
| the production form `"{term}".as. AND @PD="{day}"` and the OR over all fifteen terms both find every known answer, 6 on USPAT and 6 on US-PGPUB, and return nothing else | phase 2: 12 of 12 pass, `foreign_docs` empty in all 12. Known answers: USPAT Dynatrace US-12730857-B2 (2026-09-08), Akamai US-12771637-B2 (2026-10-20), Datadog US-12724686-B2 (2026-09-01); US-PGPUB Dynatrace US-20260332641-A1 (2026-10-22), Akamai US-20260259982-A1 (2026-09-03), Datadog US-20260119842-A1 (2026-04-30) |
| the RUWT control through a range form (`"RUWT".as. AND @PD>="20190101"<="20261027"`) returns US-10328326-B2 | phase 1 |
| one OR query equals the union of fifteen single-term queries, for the newest week, on both databases and both kinds | phase 5: 4 of 4 equal (3 of them the empty set, which is why the known answers above matter) |
| a whole day is thousands of documents: 8 grant Tuesdays 5,835 to 9,337, 8 publication Thursdays 8,904 to 11,595 | phase 3, counts `numResults` |
| **the counters** | see the contract below |
| weekly volume, eight weeks (2026-09-08 to 2026-10-29) | assignee field: USPAT 5 documents in 5 families, US-PGPUB 5 in 5, at most 2 a week on either. All-fields phrase: USPAT 28 in 28, US-PGPUB 34 in 32, at most 7 a week. Of the 62 phrase documents, 10 name a watchlist term in the assignee field and 52 do not: they mention the term in the text |

**The contract, measured on 152 parsed search responses with no exception** (the counts relation on the 17 that had a counts call), and the mistake it replaced. Run 2's verdict was red because the probe, and the stand-in written from run 1's key list, read `totalResults` as the total. It is not:

| field | what it is |
|---|---|
| `numberOfFamilies` | the total number of matching **families** |
| `numFound` | the families on **this page** = `max(0, min(pageCount, numberOfFamilies - start))` |
| `patents` | every matching document of those families, so it can be longer than `numFound` (US-PGPUB 2026-09-24: 7 documents in 5 families) |
| `totalResults` | the documents on **this page**, equal to `len(patents)` in all 152 responses |
| counts `numResults` | the **documents** matching; `numberOfFamilies` was never above it in the 17 responses that had a counts call |
| `perPage`, `page` | the page size asked for, and `start // pageCount`; `totalPages` is 0 whatever matches, `error` is null |

The two things the watcher needs follow from the first two rows: a result set is complete when it was read from `start` 0 up to `numberOfFamilies`, and a page the server silently cut short shows as `numFound < min(pageCount, numberOfFamilies - start)`. The probe now checks the five relations in the table on every parsed response (`search_contract`; the counts relation where a counts call was made), reads a whole day at page size 100 on both databases, and goes red on any violation. The old R3 compared the counts call with `totalResults`, which is 1 on a one-document page, so 16 of 16 days failed.

What run 2 did not establish: whether Tuesday's grants are searchable at the watcher's Wednesday 16:00 UTC (the probe read Tuesdays a week old); The watcher reads a day only after the day's population passes the same floor the probe uses (500 families) and reports a day below it as not read; it is built (next section), and whether Tuesday's grants are indexed by Wednesday 16:00 UTC is still not established.

## The watcher, and the check that holds it

jubilant-bassoon's `.github/scripts/patent_watch.py` is rewritten on PPUBS (its own session doc is in that repository). The rule it keeps: **a week is either read completely or the run is red and no manifest is written.** Every path that cannot say "I read it" raises `Unread`, and `main()` turns that into exit 1 with `NOT READ:` in the log and the step summary.

| part | what it does |
|---|---|
| days | grants: the last Tuesday, database USPAT. Applications: the Thursday five days before it, US-PGPUB. The old rule, Tuesday + 2, named a Thursday that had not happened when the Wednesday job ran |
| queries | per term and day, two: `"<term>".as. AND @PD="<day>"` (assignee) and `"<term>" AND @PD="<day>"` (text). Each hit carries the channel that found it. A document in the assignee answer but not in the text answer for the same term is red (held in all 16 weeks measured, 7 of which had an assignee hit) |
| controls | five known answers in the forms the weeks use, before any week: the number form, assignee + date and text + date on both databases. A form that stops returning its known patent is red |
| day floor | a day is read only if it holds at least 500 families (5,827 to 11,466 measured); below that it is "not published or indexed yet, or the date form stopped working", and red |
| counters | every response is held to the measured contract above; a page the server cut, or a counter that changed meaning, is red |
| size | more than 500 families for one term and day is refused, not truncated |
| pacing | 3 s between calls; a 429 or 5xx is waited out (`Retry-After`, else 20 s) up to 3 times, then red; one 401 or 403 opens a new session |
| issues | one per scan with hits. Under Actions, hits with no `GH_TOKEN`/`GH_REPO`, or a failed issue call, are red: the owner cannot miss them while the manifest says the week is done |
| chain | only utility grants (`US-<digits>-B<n>`) go to `patent-fulltext.yml`, at most 20; design patents and reissues are listed in the issue only |
| manifest | `read_complete`, `controls`, `scanned` (database, day, families on the day, queries) and `matches` with `basis` and `terms` |

**What the check does not hold.** The real host. The stand-in answers the shapes measured so far, so a shape not yet seen is not tested, and the 3 s pacing, the `Retry-After` parsing, the session renewal and the prime request have no mutant. A push to jubilant-bassoon does not run the check: the job runs on pushes to this repository, on pull requests and on dispatch, so a client change is judged at the next lab push.

## What is open

1. **The real host has not been read by this watcher.** The probe measured the text form `"<term>" AND @PD="<day>"` for every watchlist term over eight weeks, but two of the watcher's five controls are queries no report contains: `"RUWT" AND @PD="20190625"` on USPAT and `"Dynatrace LLC" AND @PD="20261022"` on US-PGPUB (`grep` of both probe reports: absent; their assignee-form twins are present). If either does not return its patent on the real host, the watcher is red on a clean week and the control is wrong, not the host. `patent-watch-rehearsal.yml` answers this, with no token, so nothing is filed.
2. **Whether Tuesday's grants are searchable by Wednesday 16:00 UTC.** The same workflow reads the upcoming Tuesday (2026-11-03); a day below 500 families is reported as not read, and a rerun on Wednesday morning is the direct test.
3. **A client push is not checked until the next lab push.** No client workflow runs this check; closing that needs a cross-repository trigger and a token this work did not add.

## The stand-in's limits

Its document shape comes from the key names `patent_fetch.py` reads (`patents`, `docs`, `guid`, `type`, `datePublished`, `assigneeName`,
`inventionTitle`). Since run 2 its search envelope has every key the real host returned and the measured relations between them,
including a page whose `patents` list is longer than `numFound` (a corpus entry's `family` puts documents in one family). It does not
know how the real host decides two documents share a family, what a page holds when one family has members in both databases, or what
`hlSnippets` and `cursorMarker` contain; those keys are present with inert values. Its broken-host modes (`http500`, `html`, `empty`, `json_list`, `error_field`, `bare_patents`, `no_families`, `fam_off`, `fam_off_or`, `total_is_total`, `docs_short`, `page_cap:N`, `zero_date_page`, `no_phrase`, `phrase_lossy`, `date_loose`, `no_guid`, `flaky500`, `rate429`, `rate429_always`, `rate429_all:a|b`, `or_zero`, `or_loses`, `counts_low`, `no_and`) are shapes someone thought of, not shapes seen. Everything it proves is about the probe's and the
watcher's logic, nothing about the real host's behaviour.
