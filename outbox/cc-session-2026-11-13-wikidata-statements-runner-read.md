# CC session 2026-11-13: Task 5, the runner read of the 396 items' own statements

Session: https://claude.ai/code/session_01X1QRUKcA6Q8MCKMehmeiXX. Scope: `docs/CC-CMD-2026-11-09-venue-review-remainder.md`, Task 5, "Step A, runner read". Changed in the commit that adds the probe (`cad7da0c`): `scripts/` (the probe, and 45 entries in the mutation registry), `.github/workflows/venue-source.yml` (one mode), `outbox/` (this document). Changed in the commit that adds the analysis: `outbox/` (the analysis script, its report, record, self-test and teeth) and `docs/` (the CC-CMD's Result and Status), and in this document; nothing under `scripts/`, `src/` or `.github/`. Not changed by either: `src/`, the relay, any rule, any row, and the four protected files (`outbox/venue-source-results-latest.json`, `outbox/venue-source-cache.json`, `src/Venues.fs`, `scripts/venue-source.mjs`).

## What the owner said and what was done

| time (ET) | owner's words | read as | done |
|---|---|---|---|
| Fri 2026-11-13 08:31 | "Do the runner first" | the yes to the read-only runner read offered in the Step A report, before he chooses between Task 5's two follow-ons. No question about that reading was put to him | `02cdbf53`: the criteria, written before any data exists. `cad7da0c`: the probe, its mode on the runner, its mutation entries; the runner then ran it (run 43439848251) and committed the evidence as `d600db24`. The commit that carries this edit: the analysis of that evidence by criteria 1 to 7, with its self-test and teeth, the record, and the CC-CMD's Result. Not started, and not approved: "wire a property in place of P5624" and "remove the Wikidata roof step". Each needs his word after the read |

## HEAD progression

| commit | what |
|---|---|
| `02cdbf53` | docs: Task 5's runner read, criteria written before any data (start of this document's work) |
| `cad7da0c` | probe: `scripts/venue-wikidata-statements.mjs`, the `statements` mode, 45 mutation entries, and the first version of this document |
| `d600db24` | the runner's own commit of the evidence (`venue-source` run 43439848251): `outbox/venue-wikidata-statements-probe.json` and `.txt`, 2 files, 3706 insertions (`git show --stat d600db24`) |
| the commit that adds `outbox/venue-wikidata-statements-step-a-2026-11-13.mjs` | the analysis, its report, record, self-test and teeth, the CC-CMD's Result and Status, and this edit (`git log -1 -- outbox/venue-wikidata-statements-step-a-2026-11-13.mjs` names it; a file cannot name its own commit) |
| the commit after it | the Landing manifest, appended as the last section of this document once the runs for the pushed commit exist |

## Built

- `scripts/venue-wikidata-statements.mjs`: reads the `wd-roof|` keys of `outbox/venue-source-cache.json` (396, all Q-ids, the control Q1410402 among them: measured below) and asks Wikidata's Action API (`wbgetentities`, English) for every item's statements: property, value and rank of each statement, and property and value of each qualifier on it; references are not read. It then asks for the English label and description of every item that appears as a value and of every property seen. 25 items to a request, 50 labels to a request, one request a second, a User-Agent that names this repository, `retryWait` from `scripts/venue-source.mjs` for 429 and 5xx. It writes `outbox/venue-wikidata-statements-probe.json` (one item and one label to a line) and `.txt` (the report) and nothing else; `main` takes its reads, writes and network as arguments so the self-test can show that. It exits 1 unless the read is a clean measurement: every item read, every id answered by the labels request, the control found carrying Q7316894 (the verdict names the control's property, or says it was not found, which the CC-CMD calls INVALID and not NO-GO). An id Wikidata says is missing (a value that points to a deleted item) is counted and named in the report and is not a failure; an id the labels answer leaves out is a failure. When the control is not found, its own answer as the API gave it is kept in the JSON as `controlRaw`, so that a link held in a reference, which the probe does not read, can be seen without another run; when it is found, nothing is kept.
- Nothing is skipped silently: an item whose answer is missing, has no `claims` member, is for another id with no redirect, or has one statement that does not read is NOT READ with its reason, never an item with no statements. Format 1's empty map `[]` is read as empty; a non-empty array where a map belongs is a failure.
- `--self-test`: 62 checks. The first fixture is a real response, the saved page for P5833 (`action=wbgetentities&ids=P5833&props=claims`, 15 properties and 27 statements, in `outbox/venue-wikidata-roof-evidence-2026-11-12.json`), cut to 7 properties and 15 statements; for each kept property the excerpt is byte for byte what the API wrote (compared by a script, true for all 7). The rest are the shapes it does not show (somevalue, novalue, monolingual text, quantity with a unit, time, coordinate, an unknown value type, ranks), the failures above, the request shapes and batch sizes (60 items in 25, 25, 10; 121 labels in 50, 50, 21), the retry policy (429 with Retry-After, non-JSON, 404, 503 four times, a throwing request), the User-Agent, and a whole run on a fake network, including a run that reads nothing (`items read 0 of 2`) and a run whose labels fail (`labelled 0 of 7`).
- `scripts/mutation-check.mjs`: 45 entries, ids `venue-wikidata-statements-*`, each naming the claim it breaks (rank dropped, qualifiers dropped, references kept, somevalue read as a value, a missing item read as empty, absent claims read as empty, the control found without its value, the control's qualifier not read, a failed items request swallowed, a failed labels request swallowed, a missing label read as a failure and as nothing, an unanswered id passing, the control's raw answer dropped or always kept, the verdict ignoring unread items, unanswered ids, the control and an incomplete run, a batch that skips an id, the gap between requests, the User-Agent, a write to the cache, and the rest).
- `outbox/venue-wikidata-statements-step-a-2026-11-13.mjs` (the analysis; reads only committed files, writes nothing: check G6 holds its imports to a file reader, a hasher, `classifyRoof` and the check harness). It recomputes from the probe's JSON, and ties to the probe's own report only as a cross-check (T1). 22 checks: the read (R1 to R7: every one of the 396 items is a record and a read, statements well formed, every property's datatype known, every value and property labelled), the control (K1 to K3), the candidates (C3a to C3c, M1), the 9 names (N1, N2), the verdict's independence from the reading and from the rank rule (S1), P5624 by two routes (T2), the protected files' digests (G7) and its own imports (G6). `READING` is the reading of each of the 8 candidates, made after the data was seen, held by C3b and C3c and by S1, which recomputes the verdict with no candidate set aside and with every rank counted. `--self-test` doctors the inputs 33 ways (a check id, a number that must move, or a stated result) and requires 4 coverage lines to print their denominators. `record` generates the record.
- `outbox/venue-wikidata-statements-step-a-selftest-teeth-2026-11-13.mjs`: breaks 39 checks or rules one at a time in a copy of the analysis and requires its `--self-test` to exit 1 and report what the break must lose; a copy that did not print its CONTROL line is not credited with a refusal.
- Outputs, each generated from the final script: `.txt` (report), `.md` (record), `outbox/venue-wikidata-statements-step-a-selftest-2026-11-13.txt`, `outbox/venue-wikidata-statements-step-a-selftest-teeth-2026-11-13.txt`. `docs/CC-CMD-2026-11-09-venue-review-remainder.md`: the Result under Task 5's runner read, and the Status line (still PARTIAL: Task 5 is done when the owner says which follow-on follows, or neither).
- `.github/workflows/venue-source.yml`: `statements` added to the mode choice and its description; one step `if: inputs.mode == 'statements'` running the self-test and then the probe; the commit step's path list gains the two output files. The step is gated on its own mode and no other mode changes. `venue-source.yml` is dispatch-only and no script parses it (`grep -rln 'venue-source\.yml' .github scripts docs package.json` lists `scripts/venue-source.mjs`, which names it in two comments, and two CC-CMDs).

## Premises (Rule 100): the one command that would refute each, and what it said

| premise | the command | what it said |
|---|---|---|
| This shell cannot reach Wikidata, so a runner is the only route (inherited from earlier this session) | `curl -sS -m 20 'https://www.wikidata.org/w/api.php?action=wbgetentities&ids=Q1410402&props=labels&languages=en&format=json'` | `curl: (56) CONNECT tunnel failed, response 403`, HTTP 000, 0 bytes, 2026-11-13. Holds; not retried by another route |
| The saved P5833 page is an honest fixture for the shape of `claims` | parse the page, compare each kept property to the page's | page: 15 properties, 27 statements; excerpt: 7, 15; all 7 kept properties equal. It is a property's entity, so it proves the `claims` member, not an item's answer |
| The cache's `wd-roof|` keys are 396 Q-ids and include the control | `node -e` over `outbox/venue-source-cache.json` | 396 keys, all `^wd-roof\|Q[1-9]\d*$`, `wd-roof\|Q1410402` among them |
| The orphan guard would notice if the workflow did not run the new script | revert the workflow edit, run `node scripts/check-script-orphans.mjs` | Refuted: it still exited 0 (3/3). That guard checks that scripts a workflow already depends on stay reachable; it is not a check of this edit, and I did not cite it as one. The edit is held by `check:workflows` (71 of 71) and by parsing the file: 7 modes, the new step with its `if`, 10 commit paths of which 2 are new |
| The runner's commit touched only its two output files, so criterion 7's digests could not have moved | `git show --stat --format='%h %s' d600db24` | 2 files (`outbox/venue-wikidata-statements-probe.json`, `.txt`), 3706 insertions. The digests are checked by the analysis (G7, 4 of 4) as well |
| The rank rule (deprecated is no witness, preferred hides normal) hides no roof | the same scan with every statement counted | Not true as a blanket claim: counting every rank gives 11 roof-reading values and the rule leaves 10. The one it drops is a normal P18 file name on Q2739617 beside a preferred one, a name and not a roof. No candidate is added or lost (8 and 8) and the verdict is the same, now held by check S1 (I had written S1 for the reading only, and added the rank variant when I asked this) |
| The reasons for setting a candidate aside are facts the items show | read the four items' own statements (Q2739617, Q756452, Q849784, Q867160) | My first draft said the Commons category was the building's "former name, Carrier Dome". The item's statements show the label "JMA Wireless Dome", the category "Carrier Dome" and a Wolfram code reading CarrierDome, and no statement of a former name. The reasons now say only what the statements show |
| A Wikidata item's own description might decide one of the 9 names where no statement does | `classifyRoof` over the 396 English descriptions | 6 of 396 read as a roof, all on rows the lead already decides and agreeing; the 9 names' descriptions are "football stadium" or "stadium in …" or none. Reported as information with no criterion |
| "No current row's roof rests on the Wikidata step", which the CC-CMD Result first said as "the one the record supports" | `node -e` counting `roofBasis` values that match `/wikidata\|P5624/i` in `outbox/venue-source-results-latest.json` | 0 of 384 rows (364 "inferred: the lead names no roof", 17 "wikipedia lead", 3 "infobox roof"). I had written the sentence before this count; the Result now states the count and not the sentence. This is a count over the committed rows, not a run of the rule without the step: whether a row changes is the follow-on's own Done-when |

## Mistakes

1. A pinned count was wrong: the check "the shapes item reads" said 8 statements and the item has 10 (1 + 1 + 2 + 1 + 1 + 1 + 3). The self-test failed it on its first full run (58 of 59); corrected to 10. Two more hand-derived expectations for the fake run were wrong in the draft (7 statements, not 8; 5 for the control, not 6) and were recounted from the fixture before the run.
2. The first draft of the report check carried a contradictory clause (`… === false && …` on a regular expression that had to be true). It passed on its first run for the wrong reason until I read it; rewritten before any mutation was run.
3. Rule 90 caught two weak spots, not the self-test: of 40 deliberate breakages, 38 turned a named check red on the first pass, one ("qualifiers dropped") ended in a crash on a later line instead of a failed named check, and one ("verdict ignores an incomplete run") was NOT CAUGHT, because the run that tests it had other problems and exited 1 anyway. The first now fails the checks that name qualifiers; the second is held by a check that the verdict says "the run did not complete" and why. Both are caught by named checks in the repository's own harness.
4. The first quick gate run failed two rows ("this session wrote its outbox", "source changes arrive with an outbox entry"). I read the rows before saying anything about them: they require an outbox file dated today (over 1500 characters) beside any change under `scripts/` or `src/`, and my tree had none. A true failure of the commit as it stood; this document is the fix. The gate appended its line to `docs/confidence-log.jsonl` (a dirty-tree quick run, which `--quick` itself labels "NOT a pass"); I restored that file and did not commit the line, because it measures a tree that no commit holds.
5. Found by re-reading my own probe before committing, not by a check: the first draft counted a label that Wikidata answers as `missing` (a value pointing at a deleted item) with the ids that got no answer, so one deleted value would have made the run exit 1 as if the measurement had failed. The premise "every value id is a live item" was never tested, and cannot be from here. The probe now separates the two (a missing id is a counted, named fact; an id the answer leaves out is a failure), with two checks and three mutation entries. The same re-read added `controlRaw`: with the control's raw answer kept when it is not found, the INVALID case can be diagnosed from the committed file and does not cost a second dispatch.
6. The teeth script's first run refused 35 of 36 and failed one entry: its anchor for check K2 replaced only the tail of the expression, so the broken copy was not valid JavaScript and did not run. The script reported it as a failure and not as a refusal, because a refusal needs the copy's CONTROL line; I corrected the anchor to the whole comparison and re-ran (39 of 39 after the rank variant and one more entry were added).
7. The first draft of the report derived "candidates accounted for n of m" by splitting the detail string of a check. I replaced it with a number the analysis computes (`num.accounted`) before running anything on it; the self-test's coverage lines now hold that number to the denominator.
8. The first C3a name counted property ids against candidates ("checked 8 of 8 candidates" from a set of ids). Corrected to count candidates.
9. The reasons in `READING` and the rank rule's effect were the two premises I had not tested when the analysis first printed NO-GO (see Premises); both were tested before any file was committed.
10. After the push of `7b94aeff`, re-reading the committed document found its Carry-forwards paragraph still saying that the runner run and the analysis were yet to be done. I had written it before either existed and had corrected the other paragraphs that said so (the table row, the "Not verified" paragraph) without searching the whole file for the same claim. A search of the file for "remains", "remaining" and "not yet" found that paragraph and no other; it is corrected in the commit that adds the manifest. The same slip, in the CC-CMD's Result: I wrote "is the one the record supports" before counting what it rests on (0 of 384 rows name Wikidata); the count replaced the sentence before the commit (see Premises).

## Verified, and what is not

Verified on this tree (the shell, no network):

- `node scripts/venue-wikidata-statements.mjs --self-test`: 62 of 62.
- `node scripts/mutation-check.mjs --ids <the 45 ids>`: 45 records, 0 survived; the full-suite baseline file was not written (a partial run does not write it).
- `node scripts/mutation-check.mjs --anchors`: `checked 1491 of 1494 mutation anchors; 0 stale` (the 3 not checked are mutations with no anchor in a file, not mine).
- Guards: `check:workflows` 71 of 71, `check:script-orphans`, `check:import-purity`, `check:secrets`, `check:ignore-parity`, `check:network-exempt`, `check:unused`, `check:staged-outbox`, `check:harness`: each exited 0.

Verified in this commit's window (the shell, no network; every number is the script's own output on the committed files):

- `node outbox/venue-wikidata-statements-step-a-2026-11-13.mjs`: 22 of 22 checks, NO-GO; the same verdict as read, with no candidate set aside, and with no candidate set aside and every rank counted.
- `--self-test`: 33 of 33 doctored copies caught, 0 not applied, 4 of 4 coverage lines print their denominators, control green.
- The teeth script: 39 of 39 broken copies refused by their own self-test, control green (first run 35 of 36, see Mistakes 6).
- `node scripts/cc-cmd-status-check.mjs`: 5 of 5.
- The runner's evidence is read in full by the analysis: items read 396 of 396; labels answered 2807 of 2807; the control found; the four protected files unchanged (4 of 4).

Measured by the dispatch (`venue-source` run 43439848251, mode `statements`; the answers are in the committed JSON and were read by the analysis): the control is found under P1552, so the verdict is not INVALID; items read 396 of 396; every id labelled, 2807 of 2807 (33 with no English label, 0 missing on Wikidata, 0 unanswered); 0 of 396 items are keyed under a redirect; the read took 406 s in 72 calls (16 for the items, 56 for the labels) and 79 HTTP attempts. Not measured: how large a 25-item answer is (the probe does not record response sizes).

Not verified, and what verifies it: that `READING` is the reading the owner would make of the 8 candidates. The report prints the item and the statement for each, and the verdict does not depend on it (check S1). The scored gate for the commit that carries the analysis: `verify` run 43439827546 and `guards` run 43439827592 on `cad7da0c` are success; for the analysis commit the instrument is a `verify-full` run on its pushed SHA, because the full gate does not finish on this container (its mutation row runs the whole table in-process, recorded in `outbox/cc-session-2026-11-12-venue-review-counts.md`). `verify` does not run on a commit that changes only `docs/` and `outbox/` (its paths-ignore). Both are read by REST and recorded in the Landing manifest.

## Carry-forwards

None. The numbered work in the CC-CMD's runner-read section is done: (1) the runner run and its evidence (`venue-source` run 43439848251, committed by the runner as `d600db24`), (2) the analysis script over the committed files, with its self-test and teeth, and (3) the record and the CC-CMD's Result (both in `7b94aeff`). (4), the Landing manifest, is the last section below. The two follow-ons are the owner's to approve after the read, and neither is started.

## Landing manifest

Written after the push of `7b94aeff` and after its scored gate ended. Run times are UTC on 2026-11-13. Every value below was read from GitHub or computed on the pushed tree after the push.

| item | value |
|---|---|
| analysis commit | `7b94aeff2a25dd7a2db41538737e96e476f7249e`: 8 files, 1053 insertions, 7 deletions, all under `docs/` and `outbox/` (`git show --stat`); 0 files under `src/`, `scripts/` or `.github/` |
| probe commit | `cad7da0c`: `verify` 43439827546 success, `guards` 43439827592 success |
| the runner's commit | `d600db24`: `venue-source` run 43439848251 (mode `statements`, dispatched 14:08:06Z, completed 14:15:09Z, success; the probe's own report: complete, 72 calls, 79 HTTP attempts, 406 s); 2 files, 3706 insertions |
| every run GitHub holds for `7b94aeff` | 3: `guards` (push) 43445971085 success; `verify-full` (dispatched by me, on main at this SHA) 43446038484 success; `status` (schedule) 43446665338 success. No `verify`, `deploy` or `live-check` run exists for this SHA: `verify` does not watch `docs/**`, `outbox/**` or `**/*.md`, and every path of this commit matches one |
| deploy run for this work | none. Nothing under `src/`, `scripts/` or `.github/` changed |
| branch | `main` (`git branch --show-current`, read before this commit) |
| protected files (criterion 7) | the sha256 of each of the four files on the pushed tree equals the digest Step A's record prints (4 of 4); `git diff --stat 3e318ff9 7b94aeff` over those four paths lists nothing |

### The scored gate

`verify-full` run 43446038484 on `7b94aeff2a25dd7a2db41538737e96e476f7249e`, dispatched 14:47:05Z, completed 15:39:48Z (52 min 43 s): conclusion `success`, and every one of its 9 jobs `success` (the `full` job and the 8 mutation shards; the last shard ended 15:39:15Z). The run recorded its measurement to main as `97345065`: ledger line `7b94aeff2a25-9178552ba340`, **`530/530 points = 100/100 (bar: 95)`**, 3088 s, `dirty: true` as on the lines before it, `failing`, `skipped` and `notApplicable` all empty, 23 rows timed. It recorded the mutation baseline as `a14b3cf2` (`ran` 103 of `from_mutations` 1493, `failing` 0; 102 and 1444 on the previous baseline, written 2026-11-12; the baseline gained the row `node scripts/venue-wikidata-statements.mjs --self-test`).

### Done-condition probe output

Run on a fresh `git archive` of `7b94aeff` extracted to an empty directory with the repository's `node_modules` linked in (the archive carries none, and `scripts/venue-source.mjs` imports `@xmldom/xmldom`). The report, the record, the self-test output and the teeth output are byte-equal to the committed files (`cmp`: 4 of 4), each run exiting 0 with nothing on stderr. The working tree was clean at the push (`git status --short` listed 0 lines), so the archive and the tree hold the same files.

```text
$ node outbox/venue-wikidata-statements-step-a-2026-11-13.mjs
22/22 checks passed
NO-GO. The control holds and the read is complete (items read 396 of 396; labels answered 2807 of 2807). Criterion 3 lists 8 candidate properties by the rule's own patterns: 7 set aside by reading the item (a name, an address, an identifier, another venue's name) and 1 retained. P1552 "has characteristic" carries a roof on 1 of 396 items, agrees with 1 of 1 rows the lead or the infobox decides, and decides 0 of the 9 names. None passes criterion 6: the names decided are 0 of 9 by a retained candidate and 0 of 9 if no candidate were set aside. The choice between the follow-ons, or neither, is the owner's.
$ node outbox/venue-wikidata-statements-step-a-2026-11-13.mjs --self-test
33 of 33 doctored copies caught by the check or number aimed at them; 0 not applied; 4 of 4 coverage lines print their denominators; control green
$ node outbox/venue-wikidata-statements-step-a-selftest-teeth-2026-11-13.mjs
39 of 39 broken copies refused by their own self-test, each naming what the break must lose; control green
```

What each number is out of (the report's own coverage block, Rule 91):

```text
items read 396 of 396 (the wd-roof| keys of the cache); records 396 of 396; redirected 0
statements 10313 (ranks: normal 10099, preferred 142, deprecated 72); qualifier values 2618; properties in use 332
labels answered 2807 of 2807 (missing on Wikidata 0; no English label 33, read as no witness)
control Q1410402: statements read 54; found 1 P1552 rank normal
candidates accounted for 8 of 8 (retained 1, set aside 7); values that match only the wider word list 44, counted for nothing
retained candidates: items with a roof 1 of 396; rows the lead or the infobox decides that they meet 1, agree 1, disagree 0
the 9 names whose roof is unsettled: read 9 of 9; decided by a retained candidate 0 of 9; decided if no candidate were set aside 0 of 9 (Step 1's record counts 9)
the verdict by variant: as read NO-GO; no candidate set aside NO-GO; none set aside and every statement counted whatever its rank NO-GO (roof-reading values 10 under the rank rule, 11 counting every rank; candidates 8 and 8)
information only, no criterion: item descriptions that read as a roof 6 of 396; on rows the lead or the infobox decides 6, agree 6; on the 9 names 0
P5624, the property the rule reads today: on 0 of 396 items' statements; the cache's query found a roof for 0 of 396
protected files unchanged 4 of 4
```

### Residual

None from this work. Task 5's Done-when waits for the owner's answer on which follow-on follows, or neither (an owner decision, not deferred work). The commit that adds this section cannot name itself, and its `guards` run does not exist until the commit is pushed, so neither is in this file: `git log -1 -- outbox/cc-session-2026-11-13-wikidata-statements-runner-read.md` names the commit, and the owner report carries the run.
