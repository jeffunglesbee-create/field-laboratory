# CC session 2026-11-13: Task 5, Step B, wire P1552 in place of P5624 in the roof rule

Session: https://claude.ai/code/session_01X1QRUKcA6Q8MCKMehmeiXX. Scope: `docs/CC-CMD-2026-11-09-venue-review-remainder.md`, Task 5, "Step B, wire P1552" (the specification is commit `14178acc`: criteria W1 to W8, the premises and the order). It is edited by each commit of the work and its Landing manifest is the last section, added last. First version: with the commit that changes the rule (item 2 of the spec's order). Second: with the commit that adds the replay tool and its offline output (item 3). Third: with the docs commit that records the runner's fill, `compare`'s verdict and the Result (items 4 and 5). Fourth (this one): with the commit that adds the reproduction record and the Landing manifest, the last section, written after `verify-full` ended (item 6).

## What the owner said and what was done

| time (ET) | owner's words | read as | done |
|---|---|---|---|
| Fri 2026-11-13 19:07 | "Wire" | the answer to the Step A report's question, "remove", "wire" or "neither" | not acted on at once: it contradicted Step A's record (no candidate property passes criteria 1 to 7), so one question was put back, with that stated |
| the same evening, after the question | "Wire P1552" | approval of the first follow-on only: the roof rule's Wikidata step reads P1552 "has characteristic" in place of P5624. The second follow-on, removing the Wikidata step, is not approved and is not started | `14178acc`: the specification; `1caa76eb`: the rule change; `9e593078`: the replay tool; `69b2f9cc`: the runner's fill; the docs commit that carries this version: the comparison and the Result |

The time of the second answer is not recorded here because it was not read from a timestamp. The second follow-on, removing the Wikidata step, has not been approved and has not been touched.

## HEAD progression

| commit | what |
|---|---|
| `14178acc` | docs: the Step B specification (start of this work; pushed) |
| `1caa76eb` | the rule change: `scripts/venue-source.mjs`, its two readers of the cache kind, the registry, the mutation harness's extension, its output and the first version of this document (pushed; `verify` run 43538395303, `guards` run 43538395286 and the `deploy` run 43538991561 that followed it, all success, read by REST on the full SHA) |
| `9e593078` | the tool that replays the committed run offline and judges the runner's fill (`outbox/venue-wikidata-p1552-2026-11-13.mjs`), its self-test and teeth, the offline `predict` output and the second version of this document (item 3 of the spec's order; pushed; `guards` run 43539060559 green) |
| `69b2f9cc` | the runner's data commit from `venue-source` run 43539312250 (item 4): `outbox/venue-source-cache.json` and `outbox/venue-source-results-latest.json`, nothing else (pushed by the runner) |
| the docs commit that carries this version | `outbox/venue-wikidata-p1552-compare-2026-11-13.txt` (`compare`'s output, as generated), this document, and the corrections and the Result in `docs/CC-CMD-2026-11-09-venue-review-remainder.md` (item 5) |
| `8afcd248`, `2d863411` | the ledger commits `verify-full` made on its own run (`docs/confidence-log.jsonl`, `docs/scale-log.jsonl`, `outbox/mutation-baseline-latest.json`), pushed by the workflow |
| the commit that adds the Landing manifest | `outbox/venue-wikidata-p1552-reproduction-2026-11-13.txt`, the Landing manifest below, and the Result's and the Status's W8 lines in the CC-CMD (item 6); docs only, so it cannot change what `verify-full` measured |

## Built

### In `1caa76eb`, the rule change

- `scripts/venue-source.mjs`: `roofOf` asks Wikidata for `wdt:P1552` with no `LIMIT` and reads every row of the answer (the old query was `wdt:P5624` with a limit of one row). `decideRoof` takes the list of labels (an array, or null; a string from a caller that predates this still reads). Only a label `classifyRoof` reads as a closed roof is a witness, so "tourist attraction" is none, and `open` is never read from Wikidata. Closed labels naming different classes are review (`wikidata names different roofs: …`); a closed label against a lead or an infobox naming another class is review (`sources disagree: …`); the basis reads `wikidata P1552 "retractable roof"`. The branches for a Wikidata label read as `open` are gone, because no input of the new rule reaches them. The cache kind is `wd-roof-p1552`: the 396 `wd-roof` answers answered another question, and a kind that is not in `CACHE_KINDS` is dropped on load, so they cannot be read as P1552 answers.
- `scripts/venue-infobox.mjs`: `titleOf` reads the article's title from the cached `wd-roof-p1552|qid` answer, and its reason text names that kind.
- `scripts/venue-wikidata-statements.mjs`: the population ("the items the roof rule asks about") is the cache's `wd-roof-p1552|` keys, with a fixture that holds an old-kind key it must not read.
- `scripts/mutation-check.mjs`: 12 new entries, 10 on the rule (`venue-source-p1552-*`), 1 on each reader; 2 existing entries re-anchored (their anchors named text this change rewrites: the basis line that read P5624 and the `decideRoof` call in `roofOf`) and the claim of one reworded for the new kind's name (`wd-roof|` to `wd-roof-p1552|`). `--anchors`: `checked 1503 of 1506 mutation anchors; 0 stale` (1491 of 1494 before; the 3 not checked are entries with no anchor in a file, not mine).
- `outbox/venue-source-roof-field-mutation-2026-11-09.mjs`: the harness takes an entry prefix as an argument (no argument is the group it always ran), and runs an entry on a script that has its own self-test (`expect` equal to `node FILE --self-test`) against that script's own self-test on a twin beside the original, with the twin's own unmutated control. Before this the harness could only prove the rule's entries and the reader of the infobox; the two new reader entries are the reason for the change, and W4 asks that each be red by a named check.
- `outbox/venue-source-p1552-mutation-2026-11-13.txt`: the harness output, five commands, each exiting 0.

The Wikidata step is not removed. No file under `src/` or `.github/` changes.

### In the commit that adds the second version of this document, the replay tool

- `outbox/venue-wikidata-p1552-2026-11-13.mjs` (447 lines), three modes. `predict` runs offline: the real `roofOf` is called once per roof-stage row (393 of the 459 rows) on a cache built from the committed one, once with Wikidata silent (the control: the old answers' articles and no P1552 value) and once with the statements probe's P1552 labels (the treatment; the `wdt:` rule is applied to the probe's statements, so a deprecated statement is left out and, when any is preferred, only the preferred remain). `fetch` is a stub that refuses and counts, every entry's age is set to now so none has expired, and the rows are compared with the committed ones by name through `compare` of `outbox/venue-lead-whole-diff-2026-11-09.mjs`, the diff Task 2 used. The one change the Task 5 record predicts is held in `EXPECTED` and also derived from the data (the rows whose item carries a closed label), so the expectation is not a string alone. A P1552 value with no English label, or one that is not an item, is not predictable: the run fails and says so, and nothing is filled in. `compare OLD_REV NEW_REV` judges the runner's fill from two git revisions: every asked item answered in the new cache, the closed labels equal the probe's, the articles equal the old answer's, no old-kind entry left, `src/Venues.fs` the same blob, the rows compared by name, only the expected basis changed. `--self-test`: 41 checks, each with an input that must fail it.
- `outbox/venue-wikidata-p1552-teeth-2026-11-13.mjs`: 108 broken copies of the tool, each applied once to a copy (the anchor must occur exactly once), each required to exit 1, to finish, and to fail every check it was aimed at; the control copy must pass first; a check of the self-test with no break aimed at it fails the run.
- Outputs, each from the final tree: `outbox/venue-wikidata-p1552-predict-2026-11-13.txt`, `…-selftest-2026-11-13.txt`, `…-teeth-2026-11-13.txt`. Regenerated after the last edit of the tool (a header sentence) and byte-equal to the first generation, 3 of 3.

`predict` reads the working tree's files and prints the digests of the three inputs, with no clock and no git, so it reproduces on the commit that adds its output and while the cache still holds the old kind's answers. After the fill it is a record of the prediction made before it; `compare` is the live judge. Run on `69b2f9cc` it exits 1 and says why on every line that fails (`roofOf replayed for 0 of 459 rows`, `the probe's items are not the cache's: … 396 the probe has and the cache does not`, `nothing was replayed`): the cache no longer holds the old kind it replays. `--self-test` on the same head is byte-equal to the committed output (41 of 41).

### The runner's fill (item 4), and what it changed

Dispatched once, on main, at 2026-11-14T01:13:56Z (Friday 2026-11-13, 20:13 ET), before 2026-11-21: `venue-source.yml`, mode `source`, list `data/venue-source-candidates.json`; run 43539312250, success at 01:17:00Z. It ran on head `10ad186a`, a bot's status commit on top of `9e593078`: no file under `scripts/`, `src/`, `.github/` or `data/` differs between the two, and the list's blob is the same (`96084774e82e`). The gates it followed had ended green: `verify` and `guards` for `1caa76eb`, the `deploy` run that followed, and `guards` for `9e593078` (the last two at 01:11:57Z). The `live-check` run that deploy started (43539102233) was still finishing when the fill was dispatched and failed; it is read below. The fill's commit step pushed two files as `69b2f9cc` and nothing else. The 391 `wd-roof-p1552|` answers were written between 01:14:09Z and 01:16:54Z (20:14 to 20:16 ET).

Before the dispatch, an end-to-end dry run of the real `source` path (not just `roofOf`) was made on a scratch archive of `9e593078`, with a stub in place of `fetch` that answered the rule's P1552 question from answers built from the statements probe, logged every request and answered 404 to all others, to see that the code path and its request pattern were the ones expected: 391 requests, one per distinct item, and 459 rows sourced (384 accepted, 75 to review). Its scripts are scratch, are not in the repository and are not evidence. Its rows equal the runner's rows, 459 of 459 by list and whole object. It was a rehearsal; the live read is judged by `compare`, below.

What the fill changed in the cache, by key (`git show REV:outbox/venue-source-cache.json` at `9e593078` and at `69b2f9cc`, every key compared):

| | keys |
|---|---|
| removed | 396, all `wd-roof\|` (the old kind, dropped on load because it is no longer in `CACHE_KINDS`) |
| added | 394: 391 `wd-roof-p1552\|` and 3 for the page `Martin_Stadium_(Washington)` (`wp-lead`, `wp-bodyroof`, `wp-infobox`, one each; see Q2409690 below) |
| kept | 4298, and none of them differs in content |

4694 − 396 + 394 = 4692, the entry count at `69b2f9cc`. The 391 answers are all `ok` (391 of 391); the labels they carry are "tourist attraction" on 3 items and "retractable roof" on 1; the most rows in any one answer is 1. The results file has 0 occurrences of `wikidata unanswered`.

Rows, by a second route that is not the tool's (the two results files' `accepted` and `review` lists read by name, each row compared as a whole JSON object and by the list it sits in): 458 of 459 identical, 1 differs, 0 on one side only. The one is Decathlon Arena - Stade Pierre-Mauroy, field `roofBasis` only, accepted in both. Of the file's top-level fields only `at` and `run` differ.

### In the docs commit that carries this version

`outbox/venue-wikidata-p1552-compare-2026-11-13.txt`, which is `node outbox/venue-wikidata-p1552-2026-11-13.mjs compare 9e593078 69b2f9cc` as it printed (exit 1, quoted below); this document; and the corrections to the specification and the Result under Task 5 in `docs/CC-CMD-2026-11-09-venue-review-remainder.md`. Nothing under `scripts/`, `src/` or `.github/` changes, so `verify` does not run on it.

## Premises (Rule 100): the one command that would refute each, and what it said

| premise | the command | what it said |
|---|---|---|
| Only `source` mode calls `roofOf`, and only `roofOf` calls `decideRoof` | `grep -n 'await roofOf\|decideRoof(' scripts/venue-source.mjs`, and the same over `scripts src .github` | one call site of `roofOf` (line 846, `source` mode); `decideRoof` is called at lines 779 and 812, both in `roofOf`; the other files name them only in comments and registry strings (`venue-infobox.mjs`: 2 comment lines) |
| The old kind is read by `roofOf`, `titleOf` and the statements probe's population, and by nothing else outside `outbox/` | `grep -rln 'wd-roof' --include='*.mjs' --include='*.yml' --include='*.fs' --include='*.json' .` outside `node_modules` and `outbox/` | `scripts/venue-source.mjs`, `scripts/venue-infobox.mjs`, `scripts/venue-wikidata-statements.mjs` and the registry (`scripts/mutation-check.mjs`); no workflow, no `src/` file |
| No gate, hook, workflow or registry entry runs a dated outbox tool | the names of all nine tools that mention `wd-roof` searched in `.github .githooks package.json scripts`; `grep -c "expect: 'node outbox/" scripts/mutation-check.mjs` | 2 of the 9 names appear, each in a comment (`scripts/mutation-check.mjs:550`, `scripts/venue-source.mjs:734`); 0 registry entries run an outbox tool (the registry's commands are all under `scripts/` or `build/`) |
| The nine dated tools that name `wd-roof` are records that stop reproducing only when the fill replaces the cache (the specification's sentence, written from a grep of their text) | each tool run in a clean tree at `14178acc` and in a copy of the working tree, exit code and output compared (the table below) | Refuted in part: 6 of 15 runs differ at the rule commit, before any fill, in 4 of the 9 tools; after the fill 7 of 15 differ from the rule commit's tree, in 5 tools; between `14178acc` and `69b2f9cc` 9 of 15 runs differ, in 5 of the 9 tools, and the other 4 tools reproduce in all three states (both tables below) |
| The fill asks 396 items (the specification's W5, "396 of 396") | `node outbox/venue-wikidata-p1552-2026-11-13.mjs predict` on the working tree | 391 distinct items are asked by the 393 roof-stage rows of 459; 5 of the 396 items the old cache answered have no roof-stage row. W5's denominator is 391. The fill asked 391 (391 requests in the dry run, 391 answers in the cache). Corrected in the docs commit that carries this version |
| A cache entry is read as written, whatever its age | the first self-test run, whose live fixture wrote entries with `at: 1` | Refuted: `cached()` treats an entry past the 30-day TTL as a miss, so every row read as unanswered and 3 live checks failed. The fixtures now carry the current time |
| The spec's premise 1 (4 of 396 items carry a P1552 statement, 1 closed roof among them), read again through the replay tool's own parse of the probe | `predict`, which prints the values it read | Holds: 4 values on 4 of 396 items, 3 "tourist attraction" (Q123017, Q619558, Q1144973) and 1 "retractable roof" (Q1410402); unlabelled 0, not an item 0. One row can change |
| `compare` reads revisions through git and judges the fill | the pre-flight on two synthetic revisions in a scratch clone (below) | as predicted: exit 0 and AS PREDICTED; with one doctored answer: exit 1 and NOT AS PREDICTED naming the item |
| The article each live answer names equals the old answer's on every item (the specification's W5, second clause) | `node outbox/venue-wikidata-p1552-2026-11-13.mjs compare 9e593078 69b2f9cc` | Refuted on 1 item of 391: Q2409690, the Wikipedia page of Martin Stadium (Washington State), moved after the old answer was cached (section "Q2409690" below). The premise was written as a criterion without reading the cache's dates: the oldest answers are from 2026-10-22 |
| The fill adds and removes only what the rule change replaces | every key of `outbox/venue-source-cache.json` at `9e593078` compared with the same file at `69b2f9cc` | Holds, with 3 additions that follow from the item above: 396 `wd-roof\|` keys removed, 391 `wd-roof-p1552\|` added, `wp-lead`, `wp-bodyroof` and `wp-infobox` added for `Martin_Stadium_(Washington)`; 4298 kept keys, none differing in content |
| No row moves except the predicted one | the two results files read by name and each row compared as a whole JSON object, by a script of its own and not by `compare` | Holds: 458 of 459 identical, 1 differs (`roofBasis` of Decathlon Arena - Stade Pierre-Mauroy), 0 on one side only |
| The red `live-check` after `9e593078` is not a consequence of this change | the failing job's log (run 43539102233), `git rev-parse 14178acc:src/Venues.fs HEAD:src/Venues.fs`, and the workflow's earlier runs | Not a consequence: the failing assertion is the weather chips (`3 known venue(s) on this slate, 0 chip(s) filled`, `host-silent — 6 request(s) over 14000ms, none received any response`); the table is the same blob at both revisions (`5029632cdef7`); run 43348342619 on 2026-11-13T01:54Z, over 22 hours before the first commit of this work, failed with the same assertion text |

### Measured: the dated tools, before and after the rule change

Each run is `node outbox/<tool>.mjs <args>` with the repository root as the working directory, in a clean tree extracted from `14178acc` (before) and in a copy of the working tree (after), with the repository's `node_modules` linked. Exit codes are before/after; "same" means exit code and every byte of output equal. 15 runs, 6 differ.

| tool | args | exit | output |
|---|---|---|---|
| venue-hand-rows-2026-11-12 | (none) | 0/0 | same |
| venue-hand-rows-2026-11-12 | `--self-test` | 0/0 | same |
| venue-infobox-effect-2026-11-09 | (none) | 1/1 | same. It already exits 1 at `14178acc`: its no-infobox control reproduces 390 of 393 rows, because 3 committed rows (Johan Cruijff Arena, U.S. Bank Stadium, Wembley Stadium) now rest on the infobox |
| venue-infobox-effect-2026-11-09 | `--self-test` | 0/1 | differs: the check "the control: every row with a roof stage is replayed and reproduces the roof, basis and status" fails |
| venue-infobox-rule-replay-2026-11-09 | (none) | 1/1 | differs: 0 requests became 393 (the new rule asks for the new kind, which the old cache does not hold). It already exits 1 at `14178acc`, for the same three rows as the effect tool |
| venue-infobox-rule-replay-2026-11-09 | `--self-test` | 0/1 | differs: "the replay reaches both rows, makes no request, and reproduces the no-infobox control" fails |
| venue-infobox-stepa-assert-2026-11-09 | (none) | 0/0 | same |
| venue-infobox-stepa-assert-2026-11-09 | `--self-test` | 0/0 | same |
| venue-lead-whole-diff-2026-11-09 | `--selftest` | 0/0 | same |
| venue-lead-whole-probe-2026-11-09 | `--selftest` | 0/0 | same |
| venue-wikidata-roof-step-a-2026-11-12 | (none) | 0/0 | differs in one line: the sha256 it prints for `scripts/venue-source.mjs` |
| venue-wikidata-roof-step-a-2026-11-12 | `--self-test` | 0/0 | same |
| venue-wikidata-roof-step-a-selftest-teeth-2026-11-12 | (none) | 0/0 | same |
| venue-wikidata-statements-step-a-2026-11-13 | (none) | 0/1 | differs in 9 lines: check G7 reads "same 3 of 4" for "same 4 of 4" and names `scripts/venue-source.mjs`, one of the four protected files whose digests Step A's record printed, and the totals and the printed digest follow (22/22 to 21/22 checks; protected files unchanged 4 to 3 of 4) |
| venue-wikidata-statements-step-a-2026-11-13 | `--self-test` | 0/1 | differs: the control passes 21 of 22, G7 failing |

The causes are the change itself and nothing else: two tools replay the rule against a cache that holds the old kind, and two print or hold the digest of the rule's file. Nothing in the repository runs any of them (the premises table), so no gate turns red; they are records of the run they name and are not edited here (the CC-CMD's Done-when keeps Step A's records and the earlier documents as they are). The same comparison was then run against the runner's fill, because the fill moves the cache and the results as well.

### Measured: the same tools, before and after the fill

The same 15 runs, the same way, in clean trees extracted from `9e593078` (before; the rule change in place, the old cache) and from `69b2f9cc` (after; the fill's two data files), with the repository's `node_modules` linked, 2026-11-13 20:19 to 20:23 ET (the script is scratch and is not committed). Exit codes are before/after. 15 runs, 7 differ.

| tool | args | exit | output |
|---|---|---|---|
| venue-hand-rows-2026-11-12 | (none) | 0/0 | same |
| venue-hand-rows-2026-11-12 | `--self-test` | 0/0 | same |
| venue-infobox-effect-2026-11-09 | (none) | 1/1 | differs: "roof stage replayed for 393 of 459 rows" becomes "0 of 459" (7 lines become 14) |
| venue-infobox-effect-2026-11-09 | `--self-test` | 1/1 | same (it already exits 1 at `9e593078`) |
| venue-infobox-rule-replay-2026-11-09 | (none) | 1/1 | differs: "roofOf replayed for 393 of 459 rows" becomes "0 of 459" (1566 lines become 19) |
| venue-infobox-rule-replay-2026-11-09 | `--self-test` | 1/1 | same (it already exits 1 at `9e593078`) |
| venue-infobox-stepa-assert-2026-11-09 | (none) | 0/0 | same |
| venue-infobox-stepa-assert-2026-11-09 | `--self-test` | 0/0 | same |
| venue-lead-whole-diff-2026-11-09 | `--selftest` | 0/0 | same |
| venue-lead-whole-probe-2026-11-09 | `--selftest` | 0/0 | same |
| venue-wikidata-roof-step-a-2026-11-12 | (none) | 0/1 | differs: "every retained candidate was read over all 396 items" becomes "all 0 items" |
| venue-wikidata-roof-step-a-2026-11-12 | `--self-test` | 0/1 | differs: "CONTROL: the undoctored inputs pass every check (24 of 24)" becomes "(22 of 24): C2b, C2e" |
| venue-wikidata-roof-step-a-selftest-teeth-2026-11-12 | (none) | 0/1 | differs: "CONTROL: the unbroken copy's self-test exits 0" becomes "exits 1 (it must exit 0)" |
| venue-wikidata-statements-step-a-2026-11-13 | (none) | 1/1 | differs: check R1, "the read holds a record for each of the 396 items the cache holds a wd-roof answer for", goes from PASS to FAIL |
| venue-wikidata-statements-step-a-2026-11-13 | `--self-test` | 1/1 | differs: the control's "(21 of 22): G7" becomes "(20 of 22): R1, G7" |

The cause is the fill and nothing else: it replaces the cache's 396 `wd-roof|` answers with 391 `wd-roof-p1552|` ones, and every one of these tools counts, replays or lists the old kind. Taken with the first table: 9 of the 15 runs, in 5 of the 9 tools (infobox-effect, infobox-rule-replay, roof-step-a, roof-step-a-selftest-teeth, statements-step-a), differ between `14178acc` and `69b2f9cc`; the 6 runs of the other 4 tools are the same in all three states. The specification said these tools "reproduce on the commit they name and not on a head after the fill". For the fill that is what was measured; for the rule commit it was wrong, because 4 of the 5 changed before any fill. Nothing in the repository runs any of them (premises table), so no gate is affected, and none of them is edited: each is a record of the state it names, and the CC-CMD's Done-when keeps Step A's records as they are.

## Q2409690: the one clause of W5 that is not met

`compare 9e593078 69b2f9cc` (exit 1; the committed output is `outbox/venue-wikidata-p1552-compare-2026-11-13.txt`) printed everything the specification asked for except one number:

```text
COVERAGE: 391 distinct items asked by the 393 roof-stage rows of 459; answered in the new cache 391 of 391; 5 of the 396 items the old cache answered about are not asked (no roof-stage row)
CLOSED LABELS equal the probe's: 391 of 391; all labels equal: 391 of 391
ARTICLES equal the old answer's: 390 of 391
OLD KIND (wd-roof) entries left in the new cache: 0
TABLE: src/Venues.fs is the same blob at both revs (5029632cdef7)
COMPARED with the old results by name: 459 of 459 rows (new 459); only in old 0, only in new 0; moved 0
CHANGED (status, roof or review reason): 0 of 459; same status and roof, different basis only: 1
  Decathlon Arena - Stade Pierre-Mauroy: "wikipedia lead" -> "wikidata P1552 \"retractable roof\""
NOT AS PREDICTED:
  the article differs from the old answer's on 1 item(s): Q2409690
```

What differs. Q2409690 is the row "Martin Stadium" (home Washington St, CFB; accepted, roof `open`, basis "inferred: the lead names no roof"). The old answer, cached 2026-10-24T18:09:10Z, names the article `https://en.wikipedia.org/wiki/Martin_Stadium_(Pullman)`; the live answer, cached 2026-11-14T01:15:33Z, names `https://en.wikipedia.org/wiki/Martin_Stadium_(Washington)`.

What was read to explain it (Rule 73: read 2026-11-14 UTC, Friday 2026-11-13 evening ET, with the Exa page-fetch tool because the shell cannot reach Wikipedia or Wikidata; live public pages, so what follows is as of that read and is not saved in the repository):

- The revision history of "Martin Stadium (Washington)" lists three page moves, quoted from the page: "21:27, 13 October 2026 … MathMan4 moved page Martin Stadium to Martin Stadium (Pullman): Not primary Martin Stadium"; "19:51, 6 November 2026 … BDD moved page Martin Stadium (Pullman) to Martin Stadium (Pullman, Washington): No WP:PTOPIC for Pullman…"; "00:33, 8 November 2026 … Red0ctober22 moved page Martin Stadium (Pullman, Washington) to Martin Stadium (Washington): Remove unnecessary parentheses/disambiguator…".
- The page at `…title=Martin_Stadium_(Pullman)&redirect=no` is a redirect to "Martin Stadium (Washington)" carrying the text "From a page move: This is a redirect from a page that has been moved (renamed)."
- Wikidata's `Special:EntityData/Q2409690.json` reads `"modified":"2026-11-08T00:33:50Z"`, the minute of the last move.

So the old answer was right when it was cached (after the 13 October move, before the two in November) and the live answer is right now. Nothing in the rule changed the article; Wikipedia did. The fill therefore read Wikipedia for the new title (3 cache keys added, above), and the row's whole JSON object, `lead` included, is unchanged.

The criterion is not met in its letter: 390 of 391. It is not in the stop rules (W2 or W6 failing, a `wikidata unanswered`, a closed label that differs from the probe's), so the work did not stop; it is also not adjusted. The text of W5 is changed in its denominator only (396 to 391, a counting error, mistake 1) and not in what the clause demands, and the tool's verdict, NOT AS PREDICTED, stands as printed. What the clause was for, that every cached Wikipedia answer is still the one the rule reads, holds for 390 of 391 items and, for the 391st, the rule reads the page's current title. Restoring the two data files from `9e593078`, the specification's recovery, would put the old answer back and would not move the page: a later run reads `(Washington)` whatever the cache holds. Whether Step B stands with this one named exception, or not, is the owner's decision, and the Done-when of Step B is not claimed as met until he gives it.

## Mistakes

1. The specification's W5 said "396 of 396" for the live read. The rule asks only the items of rows that reach the roof stage, 391 of them; the number was carried over from the old cache's key count, and the one command that tests it (`predict`) was not run before the criterion was written. Corrected in the docs commit.
2. The specification said the dated tools that read the old kind "reproduce on the commit they name and not on a head after the fill", from a grep of their text. That is reading. Running them shows 4 of the 9 change at the rule commit already. The sentence stays wrong until the docs commit corrects it with the measurement above.
3. The harness extension's first edit used a header-comment anchor that did not exist (anchor count 0, nothing written); the corrected anchor is unique. A prefix argument equal to a whole id matches no entry, because the pattern needs at least one more character; the runs use the group prefixes.
4. A background run was read before it finished. The task wrapper ended at once (the job was started with `&` inside a background command), the completion notice was for the wrapper, and the output file was half written. The missing exit file showed it; the committed teeth output is from the finished run (108 of 108, 10.5 s).

5. The first self-test's live fixture wrote cache entries with `at: 1`, which `cached()` reads as expired, so every row came back unanswered and 3 live checks failed on the first run (see Premises). The fixtures use the current time.
6. The teeth script's first run refused 105 of 108 and named three: A2 (the self-test crashed on a dropped article instead of failing a named check), B4c (no fixture where the cache asks about an item the probe lacks) and RP6 (in the fixture the compared rows equal the old rows, and `predict` can never differ, so the break equalled the original). Each was fixed in the self-test and not in the teeth: a check that tolerates a missing article, a fixture that deletes an item from the probe, and a live report with a row only in the old results (6 of 7 rows). Two fixtures were added because a break would otherwise survive on the real data: a second row on one item (asked against staged) and a row with no article. Two clauses that no break could change (a restatement of the compared count, the "reproduces N of N" text) were removed as redundant, not given a mutation that cannot fail.
7. The scratch clone for the `compare` pre-flight had no `node_modules` (`ERR_MODULE_NOT_FOUND` for `@xmldom/xmldom`); the repository's was linked in and the run repeated.
8. W5's second clause, "the article each answer names equals the old `wd-roof|` answer's", was a premise written as a criterion (Rule 100). The old answers were between 3.3 and 22.4 days old when the fill ran (the `wd-roof|` entries date from 2026-10-22T15:17Z to 2026-11-10T17:12Z; Q2409690's, 2026-10-24, was 20.3 days old), and a Wikipedia page can be renamed in that time; the clause states a certainty about the world from a cache. One command run before writing it, over the cache's `at` fields, shows the age; the clause should have named the exception (an item whose page moved after its answer was cached, each named) or compared against a read made in the same run. The live read found the one place the world had moved. Recorded in the section above, not adjusted.
9. The specification's count of the dated tools, "7 files", is wrong: `git grep -l 'wd-roof' 14178acc -- 'outbox/*.mjs'` lists 9. It was written from a count nobody ran, in the same sentence as mistake 2.
## Verified, and what is not

Verified on this tree (the shell, no network; every number is the script's own output):

- `node scripts/venue-source.mjs --self-test`: 94 of 94 (80 before the change).
- `node scripts/venue-infobox.mjs --self-test`: 36 of 36. `node scripts/venue-wikidata-statements.mjs --self-test`: 62 of 62.
- `node scripts/mutation-check.mjs --anchors`: 1503 of 1506, 0 stale.
- `node outbox/venue-wikidata-p1552-2026-11-13.mjs --self-test`: 41 of 41. The teeth script: 108 of 108 broken copies refused, each losing the checks it was aimed at, control green, `COVERAGE: 41 of 41 checks of the self-test have a break aimed at them and lost`, exit 0.
- `check:unused`, `check:venue-sourced` (6 of 6) and `check:staged-outbox` (8 of 8): each exited 0 on the tree.
- The harness, five commands (`outbox/venue-source-p1552-mutation-2026-11-13.txt`): control 94 PASS 0 FAIL; rule group 10 of 10, infobox reader 2 of 2, statements reader 1 of 1, the old group 22 of 22; each mutation red by a named check, none by a crash and none left green.

The offline prediction (`node outbox/venue-wikidata-p1552-2026-11-13.mjs predict`, exit 0; the committed output is `outbox/venue-wikidata-p1552-predict-2026-11-13.txt`), with what each number is out of:

```text
INPUTS: outbox/venue-source-results-latest.json sha256 5685d6dfcdf3; outbox/venue-source-cache.json sha256 fb2c96e580c0; outbox/venue-wikidata-statements-probe.json sha256 3861e48c7720 (run 43439848251)
COVERAGE: roofOf replayed for 393 of 459 rows; 66 never reach the roof stage; 391 distinct items asked of the 396 the cache answered about under the old kind; not computable: 0
NETWORK: 0 request(s) made by 786 roofOf calls (the stub refuses and counts)
CONTROL (Wikidata silent): 393 of 393 rows reproduce the committed roof, basis, lead, status and review reason
TREATMENT (the probe's values): rows whose item carries a closed P1552 label: 1
  Decathlon Arena - Stade Pierre-Mauroy
COMPARED with the committed results by name: 459 of 459 rows (new 459); only in old 0, only in new 0; moved 0
CHANGED (status, roof or review reason): 0 of 459; same status and roof, different basis only: 1
  Decathlon Arena - Stade Pierre-Mauroy: "wikipedia lead" -> "wikidata P1552 \"retractable roof\""
AS PREDICTED: no row changes status, roof or review reason, and the basis text changes on exactly 1 row (Decathlon Arena - Stade Pierre-Mauroy); the Wikidata-silent control reproduces all 393 committed roof-stage rows
```

That is W1 (393 of 393 reproduce) and W2 (exactly one row differs, by basis text only) met offline. It says nothing yet about what the live query answers.

The `compare` pre-flight. `compare` reads two git revisions, so its path was run end to end on two synthetic revisions in a scratch clone of this repository (not committed, not in the repository): `14178acc` as OLD, and as NEW a commit holding the results and cache the prediction implies (`06c86d69`, as predicted) and one holding the same with a single cache answer doctored (`639ca313`: item Q123017's P1552 label set to "retractable roof"). The builder that wrote those two files is a scratch script and is not committed; it uses the tool's own `cachesOf`, `replay` and `resultsAfter`, so the synthetic fill equals the prediction by construction. The pre-flight shows that the git reading and the verdicts work, and not that the live fill is right.

```text
$ node outbox/venue-wikidata-p1552-2026-11-13.mjs compare 14178acc 06c86d69      (exit 0)
COVERAGE: 391 distinct items asked by the 393 roof-stage rows of 459; answered in the new cache 391 of 391; 5 of the 396 items the old cache answered about are not asked (no roof-stage row)
CLOSED LABELS equal the probe's: 391 of 391; all labels equal: 391 of 391
ARTICLES equal the old answer's: 391 of 391
OLD KIND (wd-roof) entries left in the new cache: 0
TABLE: src/Venues.fs is the same blob at both revs (5029632cdef7)
COMPARED with the old results by name: 459 of 459 rows (new 459); only in old 0, only in new 0; moved 0
CHANGED (status, roof or review reason): 0 of 459; same status and roof, different basis only: 1
AS PREDICTED: no row changes status, roof or review reason, and the basis text changes on exactly 1 row (Decathlon Arena - Stade Pierre-Mauroy)
$ node outbox/venue-wikidata-p1552-2026-11-13.mjs compare 14178acc 639ca313      (exit 1)
CLOSED LABELS equal the probe's: 390 of 391; all labels equal: 390 of 391
  labels differ Q123017: live ["retractable roof"], probe ["tourist attraction"]
NOT AS PREDICTED:
  closed labels differ from the probe's on 1 item(s): Q123017 live ["retractable roof"] probe []
```

(The second block shows only the lines that differ from the first; the full output of each run was read.)

### Criteria W1 to W8, as measured

| | the criterion | measured | by |
|---|---|---|---|
| W1 | the control reproduces 393 of 393 roof-stage rows | met, offline before the fill: 393 of 393 | `predict` (committed output) |
| W2 | exactly 1 row differs, Q1410402, basis only | met offline, and in the fill: 1 of 459 rows differs, that row, field `roofBasis` only, `wikipedia lead` to `wikidata P1552 "retractable roof"`; its roof `retractable` and status `accepted` are unchanged | `predict`, `compare`, and a second route (the whole-object comparison above) |
| W3 | the rule's self-test with a case for each listed behaviour, each with an input that must fail it | met: 94 of 94 (80 before) | `node scripts/venue-source.mjs --self-test`; the harness |
| W4 | each registry entry red by a named check, 0 stale anchors, the two P5624 entries re-anchored | met: harness, five commands each exit 0; `checked 1503 of 1506 mutation anchors; 0 stale` | `outbox/venue-source-p1552-mutation-2026-11-13.txt` |
| W5 | the fill answers every item; the closed labels equal the probe's; the articles equal the old answers'; 0 `wikidata unanswered` | answers 391 of 391 (the specification said 396; corrected), all `ok`; 0 `wikidata unanswered`; closed labels equal the probe's 391 of 391; **articles equal 390 of 391: not met in the letter** (Q2409690, above) | `compare`; `grep -c 'wikidata unanswered'` over the results file |
| W6 | 459 of 459 compared by name: exactly the W2 row differs; 0 moved, 0 on one side only, 0 changed in status or roof | met: 459 of 459, 1 differs (basis only), 0 moved, 0 on one side only, 0 changed in status or roof | `compare`; the second route: 458 of 459 identical as whole objects |
| W7 | `src/Venues.fs` byte-identical, `npm run check:venue-sourced` green with no `--write` | met: the same blob at `14178acc` and `69b2f9cc` (`5029632cdef7`), `git diff --stat` over it empty; `check:venue-sourced` 6 of 6 on this tree; `--write` was not run | `compare`, the two commands |
| W8 | `verify` green on the rule commit, `guards` green on each docs commit, `verify-full` green on the final head, each new tool's output byte-equal on a fresh `git archive`, n of n | met: `verify` 43538395303 green on `1caa76eb`; `guards` green on `14178acc` (43534002257), `1caa76eb` (43538395286), `9e593078` (43539060559) and `f4619de9` (43541142761); `verify-full` run 43541210130 green on `f4619de9` (9 of 9 jobs, the gate 530 of 530, total 100, no failing or skipped row); the new tool's committed outputs reproduce byte for byte on fresh `git archive` trees, 4 of 4 output files and the harness file's command blocks 5 of 5 | REST, by full SHA; `outbox/venue-wikidata-p1552-reproduction-2026-11-13.txt` |

Gates, as read by REST: `verify` 43538395303 (success), `guards` 43538395286, 43539060559 and 43541142761 (success), `deploy` 43538991561 (success), and `verify-full` 43541210130 on `f4619de9` (success, 9 of 9 jobs, 01:32:35Z to 02:30:48Z; its ledger line reads gate 530 of 530, total 100, `failing` and `skipped` empty, 3390 s; `dirty: true` is on the earlier lines too). `live-check` run 43539102233, the one the deploy started, failed in "Render the deployed page and assert on it" with `3 known venue(s) on this slate, 0 chip(s) filled … host-silent`; it is not a consequence of this work (premises table). Of the workflow's last 8 runs, 3 are red for 2 different reasons: this one and run 43348342619 (2026-11-13T01:54Z) for the weather chips, and run 43441145223 (2026-11-13T14:16Z, on the runner's statements-probe commit `d600db24`) at the step "Build (the venue table this check derives its expectation from)" with `Compilation failed`, which was not read further here.

Not verified, and what would verify it: whether the owner accepts Step B with the one named exception to W5 (his decision, below); whether he wants the five changed dated tools' records kept as they are (they are not edited; the CC-CMD's Done-when says so). No card has been rendered with this change, because nothing in it reaches the page: `src/Venues.fs`, the table the page is built from, is the same blob.

## Work remaining inside this session

None of the specification's six items is open. Done, in its order: (1) the specification; (2) the rule change, with `verify`, `guards` and `deploy` green; (3) the offline prediction, W1 and W2; (4) the runner's fill; (5) `compare`, W5 and W6, and the table check, W7; (6) `verify-full` on the head that carries the Result, the fresh-archive reproduction, the Result and the Status in the CC-CMD, and the manifest below.

Not mine to do: the owner's decision on the one clause of W5 that is not met in its letter (Q2409690), which decides whether Step B's Done-when is met. The second follow-on, removing the Wikidata step, is not approved and is not started.

## Landing manifest

Written last, after `verify-full` ended. The commit that adds it is docs only, so it cannot change what `verify-full` measured, and it cannot name its own hash or the `guards` run that commit starts; `git log -1 --format=%h -- outbox/cc-session-2026-11-13-wire-p1552.md` gives the hash.

### Commits, all on `main` (`git branch --show-current` printed `main` before each push)

| commit | what |
|---|---|
| `14178acc` | docs: the Step B specification |
| `1caa76eb` | the rule change, its two readers, the registry entries, the harness extension, this document's first version |
| `9e593078` | the replay tool, its self-test and teeth, the offline `predict` output, this document's second version |
| `69b2f9cc` | the runner's data commit (`venue-source` run 43539312250) |
| `f4619de9` | docs: the fill compared, the Result, the corrections, this document's third version |
| `8afcd248`, `2d863411` | the ledger commits `verify-full` made |
| the commit that adds this section | the reproduction record, this manifest, the W8 lines of the CC-CMD |

### Runs, read by REST on the full SHA

| run | what | conclusion |
|---|---|---|
| 43538395303 | `verify` on `1caa76eb` | success |
| 43538991561 | `deploy`, started by it | success |
| 43534002257, 43538395286, 43539060559, 43541142761 | `guards` on `14178acc`, `1caa76eb`, `9e593078`, `f4619de9` | success |
| 43539312250 | `venue-source`, mode `source`, the fill (data commit `69b2f9cc`) | success |
| 43541210130 | `verify-full` on `f4619de9` | success: 9 of 9 jobs, gate 530 of 530, total 100 |
| 43539102233 | `live-check`, started by the rule commit's deploy | failure, the weather chips (`host-silent`); not a consequence of this work (premises table) |

### Done-condition output

The Done-when's own lines, from the committed files, with the commands that print them, run on this head (the head `verify-full` ran on plus its two ledger commits):

```text
$ git branch --show-current
main
$ git diff --stat f4619de9 HEAD | cat   # what the two ledger commits that verify-full made changed
 docs/confidence-log.jsonl            |  1 +
 docs/scale-log.jsonl                 |  1 +
 outbox/mutation-baseline-latest.json | 24 ++++++++++++------------
 3 files changed, 14 insertions(+), 12 deletions(-)
$ git rev-parse 14178acc:src/Venues.fs HEAD:src/Venues.fs
5029632cdef772494659b28273cc276e34c84c15
5029632cdef772494659b28273cc276e34c84c15
$ git diff --stat 14178acc HEAD -- src/Venues.fs | wc -l
0
$ npm run -s check:venue-sourced | tail -1
6/6 checks passed
$ node scripts/venue-source.mjs --self-test | tail -1
94/94 checks passed
$ node scripts/venue-infobox.mjs --self-test | tail -1
36/36 checks passed
$ node scripts/venue-wikidata-statements.mjs --self-test | tail -1
62/62 checks passed
$ node scripts/mutation-check.mjs --anchors | tail -1
checked 1503 of 1506 mutation anchors; 0 stale
$ grep -F -e 'CONTROL (Wikidata silent)' -e 'rows whose item carries a closed P1552 label' -e 'CHANGED' -e 'AS PREDICTED' outbox/venue-wikidata-p1552-predict-2026-11-13.txt
CONTROL (Wikidata silent): 393 of 393 rows reproduce the committed roof, basis, lead, status and review reason
TREATMENT (the probe's values): rows whose item carries a closed P1552 label: 1
CHANGED (status, roof or review reason): 0 of 459; same status and roof, different basis only: 1
AS PREDICTED: no row changes status, roof or review reason, and the basis text changes on exactly 1 row (Decathlon Arena - Stade Pierre-Mauroy); the Wikidata-silent control reproduces all 393 committed roof-stage rows
$ grep -v '^INPUTS\|^venue P1552' outbox/venue-wikidata-p1552-compare-2026-11-13.txt
COVERAGE: 391 distinct items asked by the 393 roof-stage rows of 459; answered in the new cache 391 of 391; 5 of the 396 items the old cache answered about are not asked (no roof-stage row)
CLOSED LABELS equal the probe's: 391 of 391; all labels equal: 391 of 391
ARTICLES equal the old answer's: 390 of 391
OLD KIND (wd-roof) entries left in the new cache: 0
TABLE: src/Venues.fs is the same blob at both revs (5029632cdef7)
COMPARED with the old results by name: 459 of 459 rows (new 459); only in old 0, only in new 0; moved 0
CHANGED (status, roof or review reason): 0 of 459; same status and roof, different basis only: 1
  Decathlon Arena - Stade Pierre-Mauroy: "wikipedia lead" -> "wikidata P1552 \"retractable roof\""
NOT AS PREDICTED:
  the article differs from the old answer's on 1 item(s): Q2409690
```

Every clause of the Done-when is met except `ARTICLES equal the old answer's: 391 of 391`, which printed 390 of 391 (Q2409690, above).

### Reproduction (W8)

`outbox/venue-wikidata-p1552-reproduction-2026-11-13.txt`: the new tool's self-test and teeth outputs on a fresh `git archive` of `f4619de9`, `predict`'s on a fresh archive of `9e593078` and `compare`'s in the clone, 4 of 4 output files byte-equal, and the harness file's command blocks 5 of 5, each from one pass of one script, with a negative control in the same file that fails as it must (the comparison, pointed at a file it must not equal, and at the right file with one character changed, reports DIFFERENT). `predict` is not reproduced on this head, by design: the cache no longer holds the old kind it replays, and it exits 1.

### Protected files (Step A's four)

`node outbox/venue-wikidata-statements-step-a-2026-11-13.mjs` prints `protected files unchanged 1 of 4` on this head and `3 of 4` on a fresh archive of `9e593078`. The three that differ do so by design: `scripts/venue-source.mjs` (the rule change, `1caa76eb`) and `outbox/venue-source-cache.json` and `outbox/venue-source-results-latest.json` (the fill, `69b2f9cc`). `src/Venues.fs` is the one that is the same.

### Integration state (Rule 65)

- Relay contract: none; no relay file changed (the relay is a separate repository and was not touched).
- Client consumer: none. `grep -rl roofBasis --include='*.mjs' --include='*.fs' --include='*.js' --include='*.yml' --include='*.json' --include='*.py' .` outside `outbox/`, `node_modules`, `build/` and `public/` lists `scripts/venue-source.mjs` (the producer) and `scripts/venue-infobox.mjs` (a probe); `src/Venues.fs` is the same blob, so nothing reaches the page.
- Status: VERIFIED for the data path, Wikidata to the rule to the results file to the table check, by the fill and by the table check. No card was rendered, because nothing in the change reaches the page.
- Known mismatches: W5's article clause, 390 of 391, one item (Q2409690).

### Residual

One: W5's article clause, which is the owner's decision (above) and not deferred work. Read, and not caused by this work: 5 of the 9 dated record tools differ between `14178acc` and `69b2f9cc` (nothing runs them; none is edited, as the CC-CMD says), and `live-check` is red on the weather chips and was red the same way on 2026-11-13T01:54Z, before this work began. The Wikidata step is still in the rule: the second follow-on is not approved.
