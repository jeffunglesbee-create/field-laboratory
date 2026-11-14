# CC session 2026-11-13: Task 5, Step B, wire P1552 in place of P5624 in the roof rule

Session: https://claude.ai/code/session_01X1QRUKcA6Q8MCKMehmeiXX. Scope: `docs/CC-CMD-2026-11-09-venue-review-remainder.md`, Task 5, "Step B, wire P1552" (the specification is commit `14178acc`: criteria W1 to W8, the premises and the order). This is the first version of this document, written with the commit that changes the rule (item 2 of the spec's order). It is edited by each later commit of the work, and its Landing manifest is the last section, added last.

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
| the commit that adds this document | the rule change: `scripts/venue-source.mjs`, its two readers of the cache kind, the registry, the mutation harness's extension, its output and this document |
| the commit after it | the tool that replays the committed run offline and judges the runner's fill (`outbox/venue-wikidata-p1552-2026-11-13.mjs`), its self-test and teeth, and the offline `predict` output (items 3 of the spec's order) |
| later | the runner's fill (item 4), the comparison and the table check (item 5), then the gate, the Result and the manifest (item 6) |

## Built in this commit

- `scripts/venue-source.mjs`: `roofOf` asks Wikidata for `wdt:P1552` with no `LIMIT` and reads every row of the answer (the old query was `wdt:P5624` with a limit of one row). `decideRoof` takes the list of labels (an array, or null; a string from a caller that predates this still reads). Only a label `classifyRoof` reads as a closed roof is a witness, so "tourist attraction" is none, and `open` is never read from Wikidata. Closed labels naming different classes are review (`wikidata names different roofs: …`); a closed label against a lead or an infobox naming another class is review (`sources disagree: …`); the basis reads `wikidata P1552 "retractable roof"`. The branches for a Wikidata label read as `open` are gone, because no input of the new rule reaches them. The cache kind is `wd-roof-p1552`: the 396 `wd-roof` answers answered another question, and a kind that is not in `CACHE_KINDS` is dropped on load, so they cannot be read as P1552 answers.
- `scripts/venue-infobox.mjs`: `titleOf` reads the article's title from the cached `wd-roof-p1552|qid` answer, and its reason text names that kind.
- `scripts/venue-wikidata-statements.mjs`: the population ("the items the roof rule asks about") is the cache's `wd-roof-p1552|` keys, with a fixture that holds an old-kind key it must not read.
- `scripts/mutation-check.mjs`: 12 new entries, 10 on the rule (`venue-source-p1552-*`), 1 on each reader; 2 existing entries re-anchored (their anchors named text this change rewrites: the basis line that read P5624 and the `decideRoof` call in `roofOf`) and the claim of one reworded for the new kind's name (`wd-roof|` to `wd-roof-p1552|`). `--anchors`: `checked 1503 of 1506 mutation anchors; 0 stale` (1491 of 1494 before; the 3 not checked are entries with no anchor in a file, not mine).
- `outbox/venue-source-roof-field-mutation-2026-11-09.mjs`: the harness takes an entry prefix as an argument (no argument is the group it always ran), and runs an entry on a script that has its own self-test (`expect` equal to `node FILE --self-test`) against that script's own self-test on a twin beside the original, with the twin's own unmutated control. Before this the harness could only prove the rule's entries and the reader of the infobox; the two new reader entries are the reason for the change, and W4 asks that each be red by a named check.
- `outbox/venue-source-p1552-mutation-2026-11-13.txt`: the harness output, five commands, each exiting 0.

Not in this commit: the offline replay tool and its output, the runner's fill, the table check. The Wikidata step is not removed. No file under `src/` or `.github/` changes.

## Premises (Rule 100): the one command that would refute each, and what it said

| premise | the command | what it said |
|---|---|---|
| Only `source` mode calls `roofOf`, and only `roofOf` calls `decideRoof` | `grep -n 'await roofOf\|decideRoof(' scripts/venue-source.mjs`, and the same over `scripts src .github` | one call site of `roofOf` (line 846, `source` mode); `decideRoof` is called at lines 779 and 812, both in `roofOf`; the other files name them only in comments and registry strings (`venue-infobox.mjs`: 2 comment lines) |
| The old kind is read by `roofOf`, `titleOf` and the statements probe's population, and by nothing else outside `outbox/` | `grep -rln 'wd-roof' --include='*.mjs' --include='*.yml' --include='*.fs' --include='*.json' .` outside `node_modules` and `outbox/` | `scripts/venue-source.mjs`, `scripts/venue-infobox.mjs`, `scripts/venue-wikidata-statements.mjs` and the registry (`scripts/mutation-check.mjs`); no workflow, no `src/` file |
| No gate, hook, workflow or registry entry runs a dated outbox tool | the names of all nine tools that mention `wd-roof` searched in `.github .githooks package.json scripts`; `grep -c "expect: 'node outbox/" scripts/mutation-check.mjs` | 2 of the 9 names appear, each in a comment (`scripts/mutation-check.mjs:550`, `scripts/venue-source.mjs:734`); 0 registry entries run an outbox tool (the registry's commands are all under `scripts/` or `build/`) |
| The nine dated tools that name `wd-roof` are records that stop reproducing only when the fill replaces the cache (the specification's sentence, written from a grep of their text) | each tool run in a clean tree at `14178acc` and in a copy of the working tree, exit code and output compared (the table below) | Refuted in part: 6 of 15 runs differ at the rule commit, before any fill, in 4 of the 9 tools |
| The fill asks 396 items (the specification's W5, "396 of 396") | `node outbox/venue-wikidata-p1552-2026-11-13.mjs predict` on the working tree | 391 distinct items are asked by the 393 roof-stage rows of 459; 5 of the 396 items the old cache answered have no roof-stage row. W5's denominator is 391. Corrected in the docs commit that records the Result |

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
4. A background run was read before it finished. The task wrapper ended at once (the job was started with `&` inside a background command), the completion notice was for the wrapper, and the output file was half written. The missing exit file showed it; the committed teeth output (next commit) is from the finished run.

## Verified, and what is not

Verified on this tree (the shell, no network; every number is the script's own output):

- `node scripts/venue-source.mjs --self-test`: 94 of 94 (80 before the change).
- `node scripts/venue-infobox.mjs --self-test`: 36 of 36. `node scripts/venue-wikidata-statements.mjs --self-test`: 62 of 62.
- `node scripts/mutation-check.mjs --anchors`: 1503 of 1506, 0 stale.
- The harness, five commands (`outbox/venue-source-p1552-mutation-2026-11-13.txt`): control 94 PASS 0 FAIL; rule group 10 of 10, infobox reader 2 of 2, statements reader 1 of 1, the old group 22 of 22; each mutation red by a named check, none by a crash and none left green.

Not verified here, and what verifies it: the registry's whole table is not run by this commit's shell (the full run is `verify-full`, which the Landing manifest records on the final head); the rule against the live Wikidata endpoint (the runner's fill, item 4); whether the 4 changed dated tools' records are the ones the owner wants kept as they are (they are not edited; the Done-when says so).

## Work remaining inside this session, in the spec's order

1. Push this commit and read `verify` and `guards` for it by REST until they end; do not go on while either is red (Rule 77).
2. The replay tool (`outbox/venue-wikidata-p1552-2026-11-13.mjs`), its self-test and teeth and the offline `predict` output: W1 and W2, with every changed row named before anything is dispatched.
3. The runner fill: `venue-source.yml`, mode `source`, list `data/venue-source-candidates.json`, dispatched on main after items 1 and 2 and before 2026-11-21 (the oldest cache entries date from 2026-10-22 and expire on a 30-day TTL).
4. `compare` on the old and the new run (W5, W6) and the table check (W7); if a table-relevant change appears, nothing is written and the owner decides.
5. `verify-full` on the final head, the fresh-archive reproduction, the docs commit (Result, Status, the W5 and dated-tool corrections), and the Landing manifest as this document's last section.
