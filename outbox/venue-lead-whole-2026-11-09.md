# Task 2: the Wikipedia lead read whole, measured on all 442 rows and stopped (2026-11-09)

`docs/CC-CMD-2026-11-09-venue-review-remainder.md`, Task 2. Owner's go: "Task 2 approved", Mon 2026-11-09 10:43 ET, with the CC-CMD's recommended
fix (read the summary's `extract` whole instead of cutting it at the first full stop). The CC-CMD's own stop rule applies: if the widening produces a wrong
roof for any row, do not commit the table, report verbatim and stop. It did: 2 of the 4 rows it changed are not safe. Nothing was committed to the table.

## Result

| | |
|---|---|
| Rows compared, old results (git `0d3875c`) against new (git `76d6b45`, runner run 42651498788) | 442 of 442, by name; only in old 0, only in new 0 |
| Premise "a re-run before the first cache expiry changes only the lead" | held: `lat`, `lon`, `zone`, `qid`, `agreeing`, `via` equal on 442 of 442 rows |
| Rows whose status or roof changed | 4 of 442 (2 review to accepted, 2 open to dome); same status and roof with a different basis: 0 |
| Rows whose text classifies differently, first sentence against the whole extract | 4 of 383 with an extract: the same 4. 17 first sentences classify as not open, 21 whole extracts do |
| Changes that are not safe, among the 4 | 2: Center Parc Stadium is contradicted by its own paragraph ("an outdoor stadium"); Joan C. Edwards Stadium is not supported by its article (the only "indoor" in the full Wikipedia article is about its suites, read 2026-11-09) |

## The four rows, each read against its whole extract

| Row | Before | After | The words that decided it | Verdict |
|---|---|---|---|---|
| U.S. Bank Stadium | review, roof unknown (lead `"U.S."`, body mentions "retractable roof") | accepted, dome | "U.S. Bank Stadium is an indoor stadium in Minneapolis, Minnesota, U.S." | right |
| Parken Stadium | review, roof unknown (lead names no roof, body mentions "retractable roof") | accepted, retractable | "The stadium, which features a retractable roof, currently has a capacity of 38,190" | right: the roof is the stadium's own |
| Center Parc Stadium | accepted, open | accepted, dome | "Center Parc Stadium is an outdoor stadium in Atlanta, Georgia. ... replacing the Georgia Dome which had served as their home stadium" | WRONG: the paragraph says outdoor; `\bdome\b` matched another stadium's name |
| Joan C. Edwards Stadium | accepted, open | accepted, dome | "includes twenty deluxe, indoor suites, 300 wheelchair-accessible seating" | UNSUPPORTED: neither the paragraph nor the full article states a roof for the stadium; `\bindoor\b` matched a part of the building |

The whole extracts are in `outbox/venue-lead-whole-diff-2026-11-09.json` (the four rows) and `outbox/venue-lead-whole-extracts-2026-11-09.json` (all 383 rows that have
an article, with the old first sentence, the paragraph, and the row before and after).

## Why, and why no narrower reading is available

`classifyRoof` is a keyword test: retractable first, then `dome`, `domed`, `fixed roof`, `enclosed stadium`, `indoor`, else open. On one sentence it rarely meets a word
that is about something else. On a paragraph it does: another stadium's proper name (Georgia Dome) and a part of the building (indoor suites). This is the reason the
script's own comment (`BODY_ROOF`) gives for reading the lead and not the body: the text "describes proposals and other stadiums". The CC-CMD left "whether a
paragraph is still 'the lead' in that sense" to the owner; the measurement says it is not. The narrower reading, the first sentence properly delimited, is a sentence
parser, and the owner's standing instruction rules that out.

## The stub rows, which the CC-CMD asked to be named with their roof before and after

The CC-CMD's count ("9 of 442 are 14 characters or fewer, 8 accepted as open") reproduces exactly (probe criterion A). The boundary was itself a premise, and a cut at an
initial does not stop at 14 characters:

| Probe criterion (`outbox/venue-lead-whole-probe-2026-11-09.txt`, results at `268140d`) | Rows | Accepted as open on "inferred" |
|---|---|---|
| A. lead of 14 characters or fewer (the CC-CMD's) | 9 | 8 |
| B. lead with no is/are/was/were in it, any length | 19 | 18 (one, DKR-Texas Memorial Stadium, is a complete sentence with no verb; 17 are cut) |
| C. lead that ends like a name but has a verb (cut or complete; the cached text cannot say) | 14 | 10 |

The 8 rows the CC-CMD names, roof before and after the paragraph read: Amon G. Carter Stadium open to open; Doak Campbell Stadium open to open; Doyt L. Perry Stadium
open to open; Elliott T. Bowers Stadium open to open; Gerald J. Ford Stadium open to open; St. James' Park open to open; Williams Stadium (VA) open to open; **Joan C. Edwards
Stadium open to dome (unsupported, above)**. Over all 33 stub-class rows (B or C) with an extract, 2 changed: Joan C. Edwards (unsupported) and U.S. Bank (right).

What the paragraph says for the 17 cut-lead rows that are accepted as open: 2 say outdoor or open-air (Amon G. Carter Stadium "open-air", H. A. Chapman Stadium "outdoor"), 1 says
"indoor" of its suites (Joan C. Edwards), and 14 name no roof word. So "open" stays an inference on those 14, and nothing in the text contradicts it. That is a measurement of the
text, not a statement about the buildings.

## What is on main

| Commit | What | State |
|---|---|---|
| `0d3875c` | the fix: `summaryAnswer` reads the extract whole, cache kind `wp-summary`, self-test 57 to 62, two registered mutations (both caught), probe record | verify run 42650313057 green |
| `76d6b45` | the runner's commit of the re-run (results 374 accepted / 68 review, was 372 / 70); left `check:venue-sourced` red on main, 4 of 6 | red until the restore |
| `a6f99c2` | restores `scripts/venue-source.mjs`, `scripts/mutation-check.mjs` to `268140d` and the results and cache to `0d3875c`, byte for byte; adds the probe, the diff tool with 15 controls, the diff, and the extracts | see the CC-CMD Status for verify |

The table (`src/Venues.fs`) was never changed in this task. The U.S. Bank Stadium row is still the hand row from Task 1, and the owner's decision on it (confirm, or revert) is still open.

## Options for the owner

1. **Leave it as it was.** The sourcing rule reads the first sentence, as before. The U.S. Bank hand row stays or goes by the Task 1 decision. The cut-lead blind spot is recorded above with its measured size. Nothing to build.
2. **Allow one exception to "never parse": a sentence reader that does not stop at an initial or an abbreviation.** It is a parser, so it needs the owner's word. The whole extracts of 383 rows are committed, so what it would do to every row can be computed offline, with no runner, before anything is built.
3. **Add a second, structured source for the roof.** Wikipedia's infobox has a Roof field (U.S. Bank Stadium reads "Skylight", as read through the fetch tool on 2026-11-09 and recorded in `outbox/venue-us-bank-stadium-2026-11-09.md`). Reading a template parameter is not reading prose, but it is a new source with its own failure modes (template names, free-text values), unmeasured, and it needs a runner probe first.

## Verification artifacts

| Claim | Artifact | Command |
|---|---|---|
| the cut leads, any length, and the cache ages | `outbox/venue-lead-whole-probe-2026-11-09.txt` | `node outbox/venue-lead-whole-probe-2026-11-09.mjs 268140d`; self-test 10/10, five mutations each red |
| the old and new results, row by row | `outbox/venue-lead-whole-diff-2026-11-09.txt` and `.json` | `node outbox/venue-lead-whole-diff-2026-11-09.mjs 0d3875c 76d6b45`; self-test 15/15, eleven mutations each red |
| the whole extracts | `outbox/venue-lead-whole-extracts-2026-11-09.json` | written by the same command: 383 of 442 rows (the rest have no article) |
| main is consistent again | `node scripts/venue-sourced-check.mjs` | 6/6 at `a6f99c2` |

## Not done, and why

- Step 6 (`--write`), the hand-row deletion, the mutation re-anchoring and Step 7 (`calibrate`) follow a re-run that was accepted; none was. `calibrate` reads coordinates only and never calls the roof rule, so it could not have tested this change in any case.
- The runner took 35 minutes against an estimate of about 10. The job log is not readable from the authoring sandbox, so the cause is not known. This sandbox cannot reach Wikipedia (the proxy answers 403 on CONNECT) and WebFetch refuses the host, so the measurement had to run on a runner.
