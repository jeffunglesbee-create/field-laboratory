# CC session 2026-11-13: Task 5, Step B, wire P1552 in place of P5624 in the roof rule

Session: https://claude.ai/code/session_01X1QRUKcA6Q8MCKMehmeiXX. Scope: `docs/CC-CMD-2026-11-09-venue-review-remainder.md`, Task 5, "Step B, wire P1552" (the specification is commit `14178acc`: criteria W1 to W8, the premises and the order). It is edited by each commit of the work and its Landing manifest is the last section, added last. First version: with the commit that changes the rule (item 2 of the spec's order). Second: with the commit that adds the replay tool and its offline output (item 3).

## What the owner said and what was done

| time (ET) | owner's words | read as | done |
|---|---|---|---|
| Fri 2026-11-13 19:07 | "Wire" | the answer to the Step A report's question, "remove", "wire" or "neither" | not acted on at once: it contradicted Step A's record (no candidate property passes criteria 1 to 7), so one question was put back, with that stated |
| the same evening, after the question | "Wire P1552" | approval of the first follow-on only: the roof rule's Wikidata step reads P1552 "has characteristic" in place of P5624. The second follow-on, removing the Wikidata step, is not approved and is not started | `14178acc`: the specification. This commit: the rule change (item 2) |

The time of the second answer is not recorded here because it was not read from a timestamp.

## HEAD progression

| commit | what |
|---|---|
| `14178acc` | docs: the Step B specification (start of this work; pushed) |
| `1caa76eb` | the rule change: `scripts/venue-source.mjs`, its two readers of the cache kind, the registry, the mutation harness's extension, its output and the first version of this document (pushed; its `verify` and `guards` runs are read in the Landing manifest) |
| the commit that adds the second version of this document | the tool that replays the committed run offline and judges the runner's fill (`outbox/venue-wikidata-p1552-2026-11-13.mjs`), its self-test and teeth, and the offline `predict` output (item 3 of the spec's order) |
| later | the runner's fill (item 4), the comparison and the table check (item 5), then the gate, the Result and the manifest (item 6) |

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

`predict` reads the working tree's files and prints the digests of the three inputs, with no clock and no git, so it reproduces on the commit that adds its output and while the cache still holds the old kind's answers. After the fill it is a record of the prediction made before it; `compare` is the live judge.

## Premises (Rule 100): the one command that would refute each, and what it said

| premise | the command | what it said |
|---|---|---|
| Only `source` mode calls `roofOf`, and only `roofOf` calls `decideRoof` | `grep -n 'await roofOf\|decideRoof(' scripts/venue-source.mjs`, and the same over `scripts src .github` | one call site of `roofOf` (line 846, `source` mode); `decideRoof` is called at lines 779 and 812, both in `roofOf`; the other files name them only in comments and registry strings (`venue-infobox.mjs`: 2 comment lines) |
| The old kind is read by `roofOf`, `titleOf` and the statements probe's population, and by nothing else outside `outbox/` | `grep -rln 'wd-roof' --include='*.mjs' --include='*.yml' --include='*.fs' --include='*.json' .` outside `node_modules` and `outbox/` | `scripts/venue-source.mjs`, `scripts/venue-infobox.mjs`, `scripts/venue-wikidata-statements.mjs` and the registry (`scripts/mutation-check.mjs`); no workflow, no `src/` file |
| No gate, hook, workflow or registry entry runs a dated outbox tool | the names of all nine tools that mention `wd-roof` searched in `.github .githooks package.json scripts`; `grep -c "expect: 'node outbox/" scripts/mutation-check.mjs` | 2 of the 9 names appear, each in a comment (`scripts/mutation-check.mjs:550`, `scripts/venue-source.mjs:734`); 0 registry entries run an outbox tool (the registry's commands are all under `scripts/` or `build/`) |
| The nine dated tools that name `wd-roof` are records that stop reproducing only when the fill replaces the cache (the specification's sentence, written from a grep of their text) | each tool run in a clean tree at `14178acc` and in a copy of the working tree, exit code and output compared (the table below) | Refuted in part: 6 of 15 runs differ at the rule commit, before any fill, in 4 of the 9 tools |
| The fill asks 396 items (the specification's W5, "396 of 396") | `node outbox/venue-wikidata-p1552-2026-11-13.mjs predict` on the working tree | 391 distinct items are asked by the 393 roof-stage rows of 459; 5 of the 396 items the old cache answered have no roof-stage row. W5's denominator is 391. Corrected in the docs commit that records the Result |
| A cache entry is read as written, whatever its age | the first self-test run, whose live fixture wrote entries with `at: 1` | Refuted: `cached()` treats an entry past the 30-day TTL as a miss, so every row read as unanswered and 3 live checks failed. The fixtures now carry the current time |
| The spec's premise 1 (4 of 396 items carry a P1552 statement, 1 closed roof among them), read again through the replay tool's own parse of the probe | `predict`, which prints the values it read | Holds: 4 values on 4 of 396 items, 3 "tourist attraction" (Q123017, Q619558, Q1144973) and 1 "retractable roof" (Q1410402); unlabelled 0, not an item 0. One row can change |
| `compare` reads revisions through git and judges the fill | the pre-flight on two synthetic revisions in a scratch clone (below) | as predicted: exit 0 and AS PREDICTED; with one doctored answer: exit 1 and NOT AS PREDICTED naming the item |

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

The causes are the change itself and nothing else: two tools replay the rule against a cache that holds the old kind, and two print or hold the digest of the rule's file. Nothing in the repository runs any of them (the premises table), so no gate turns red; they are records of the run they name and are not edited here (the CC-CMD's Done-when keeps Step A's records and the earlier documents as they are). The same comparison is run again against the runner's fill, because the fill moves the cache and the results as well.

## Mistakes

1. The specification's W5 said "396 of 396" for the live read. The rule asks only the items of rows that reach the roof stage, 391 of them; the number was carried over from the old cache's key count, and the one command that tests it (`predict`) was not run before the criterion was written. Corrected in the docs commit.
2. The specification said the dated tools that read the old kind "reproduce on the commit they name and not on a head after the fill", from a grep of their text. That is reading. Running them shows 4 of the 9 change at the rule commit already. The sentence stays wrong until the docs commit corrects it with the measurement above.
3. The harness extension's first edit used a header-comment anchor that did not exist (anchor count 0, nothing written); the corrected anchor is unique. A prefix argument equal to a whole id matches no entry, because the pattern needs at least one more character; the runs use the group prefixes.
4. A background run was read before it finished. The task wrapper ended at once (the job was started with `&` inside a background command), the completion notice was for the wrapper, and the output file was half written. The missing exit file showed it; the committed teeth output is from the finished run (108 of 108, 10.5 s).

5. The first self-test's live fixture wrote cache entries with `at: 1`, which `cached()` reads as expired, so every row came back unanswered and 3 live checks failed on the first run (see Premises). The fixtures use the current time.
6. The teeth script's first run refused 105 of 108 and named three: A2 (the self-test crashed on a dropped article instead of failing a named check), B4c (no fixture where the cache asks about an item the probe lacks) and RP6 (in the fixture the compared rows equal the old rows, and `predict` can never differ, so the break equalled the original). Each was fixed in the self-test and not in the teeth: a check that tolerates a missing article, a fixture that deletes an item from the probe, and a live report with a row only in the old results (6 of 7 rows). Two fixtures were added because a break would otherwise survive on the real data: a second row on one item (asked against staged) and a row with no article. Two clauses that no break could change (a restatement of the compared count, the "reproduces N of N" text) were removed as redundant, not given a mutation that cannot fail.
7. The scratch clone for the `compare` pre-flight had no `node_modules` (`ERR_MODULE_NOT_FOUND` for `@xmldom/xmldom`); the repository's was linked in and the run repeated.

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

Not verified here, and what verifies it: the registry's whole table is not run by this commit's shell (the full run is `verify-full`, which the Landing manifest records on the final head); the rule against the live Wikidata endpoint (the runner's fill, item 4); whether the 4 changed dated tools' records are the ones the owner wants kept as they are (they are not edited; the Done-when says so).

## Work remaining inside this session, in the spec's order

1. Read `verify` and `guards` for `1caa76eb` by REST until they end (both were still running when this version was written); do not push further or dispatch while either is red (Rule 77).
2. Push the commit that carries this version, with the tool and its offline output (done in the working tree; W1 and W2 met offline, every changed row named before anything is dispatched).
3. The runner fill: `venue-source.yml`, mode `source`, list `data/venue-source-candidates.json`, dispatched on main after items 1 and 2 and before 2026-11-21 (the oldest cache entries date from 2026-10-22 and expire on a 30-day TTL).
4. `compare` on the old and the new run (W5, W6) and the table check (W7); if a table-relevant change appears, nothing is written and the owner decides.
5. `verify-full` on the final head, the fresh-archive reproduction, the docs commit (Result, Status, the W5 and dated-tool corrections), and the Landing manifest as this document's last section.
