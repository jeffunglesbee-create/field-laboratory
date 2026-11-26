# Session record: the exit-drains budget message names both files and the direction (item G1 of CC-CMD-2026-11-06-gate-residuals-remaining), Rule 67

Written 2026-11-25 on `main`. Owner direction: "Next approved" (Wed 2026-11-25 20:28 ET), approving the step offered at the end of the F1 report: change the detail of the clause "...and the budget is not loose" in `scripts/check-exit-drains.mjs` so that it names both files that hold the budget number. The item, its evidence and its artifact are in `docs/CC-CMD-2026-11-06-gate-residuals-remaining.md`, section G (rows G1, G2, G3). The proof is `outbox/exit-budget-advice-proof-2026-11-25.txt`; the patch it applies is `outbox/exit-budget-advice-2026-11-25.patch`.

## HEAD progression

| point | where | what |
|---|---|---|
| start | `main` `28ace610` | the clause's detail was `N now, budget B — lower the budget to N` for every mismatch, and named no file |
| origin moved | `main` `d2a011cc` | three automated commits (a status refresh, a probe, a forecast run) touching `STATUS.md`, `outbox/INDEX.md` and two outbox JSON files; none a script, the hook or the budget file. The patch was compared with the diff against the new head (`cmp`, identical, 126 lines), and the check, the self-test and `--anchors` were run again on it before the commit |
| change | `main` `08c30f0a` (pushed 21:11 ET, 02:11Z) | the message, the four clauses, the five table entries, the patch, the harness, the probe, their two mutation scripts, the proof record. The hook ran on it: 13 checks, `pre-commit: ok`, 79 s |
| docs | `main`, the commit that carries this file | rows G1 to G3 of the CC-CMD, its Status and a dated Related block, this record |

## What was built (commit order)

1. **The message** (`08c30f0a`). `budgetAdvice(count, budget)` in `scripts/check-exit-drains.mjs` returns the detail by direction. Shrunk: lower the budget to N in `docs/early-exit-budget.txt`, and set `find: "N"` on the `exit-budget-loose` entry in `scripts/mutation-check.mjs`, which pins the number. Grown: remove the new early exit(s), which are among those listed above, and raising the budget to match lets the growth through. Missing: the file is missing, write the count into it. Equal: no detail. Verdicts are unchanged. Four self-test clauses (22 to 26) and five table entries, `exit-advice-*` (44 lines), each caught by exactly one of the new clauses. Callers of the function: four in the self-test, one in the live check. The split by direction is needed by the approved change: one sentence naming two files was wrong for a grown count and for a missing file.
2. **The proof** (same commit). `outbox/exit-budget-advice-proof-2026-11-25.mjs`: ten cases in four scratch trees, four of them real `git commit` attempts through the real hook. Its mutation script, the entries probe and the probe's mutation script, the patch, and the record (765 lines of text, with the probe block, premises P1 to P11, and every output verbatim).
3. **The rows, a second artifact and this record** (the docs commit). `outbox/exit-budget-advice-existing-entries-2026-11-25.txt` is the run described under Verified, "The other entries that expect this check".

## Verified (artifact beside each)

- **Red first.** The old message, verbatim, on a grown tree and on a missing budget file (record section 4): `lower the budget to 64` for a count that grew, `budget null — lower the budget to 63` for no file.
- **The final run.** "COVERAGE: 10 of 10 cases ran; 4 real git commit attempts", "RESULT: all 10 cases behaved as expected." (record section 5). A0 and A2: the two-file lowering passes the real hook (87.8 s, 88.5 s) and `exit-budget-loose` is still caught. A1: following the old advice, the budget file alone, is refused at `check:mutation-anchors` (14.2 s). A4: the hook accepts a two-file raise on a grown tree (86.8 s), measured and unchanged by this work. A3 and A3a, A5 and A5a, A6 and A6a: old and new message on a grown tree, a missing file and a clean tree.
- **The apparatus can fail (Rule 90).** The harness checks its 13 predicates on text before any tree is made (13 of 13 held), and `outbox/exit-budget-advice-proof-2026-11-25-mutate.mjs` breaks 8 of them in copies: 8 of 8 caught. The entries probe reports which clause catches each entry (5 of 5, each by exactly one), and its own mutation script ran one control and four broken inputs: 5 of 5 as expected.
- **The other entries that expect this check.** Run after the commit and not part of the proof record (`outbox/exit-budget-advice-existing-entries-2026-11-25.txt`). 17 entries have an expectation that runs this check (12 at `28ace610`, five new; counted two ways, both 17). In a scratch tree with the committed scripts, the framework's `--ids` over all 17: 17 caught, "18/18 checks passed" (11 s). The framework's own `--self-test` on the same tree: 221/221 (27 s). `--only known-survivor` still reports "mutation SURVIVED" and exits 1, so the framework can say it.
- **The check.** `--self-test` 26/26; `mutation-check.mjs --anchors` 0 stale of 2251 (2248 checked); live check 4/4, count 63 of budget 63.
- **Cost.** Three runs each, 21:02 ET: the check 1.08 to 1.33 s before and 1.12 to 1.21 s after, through npm; the self-test 0.69 to 0.75 s and 0.69 to 0.71 s. The probes before the timings did not show an idle machine (load average 1.13; the process filter hides lines containing "claude" or "mcp"), and the record says so in section 9.
- **On the runner.** `verify` 45740763182 on `08c30f0a`: success in 9 min 37 s (02:11:36Z to 02:21:13Z). Log step 39, "No check script kills itself mid-write": success, with the self-test at 26/26, 210 scripts scanned, early report exits 63 against a budget of 63, 4/4. Log step 98, "Every mutation's anchor still exists": success, "checked 2248 of 2251 mutation anchors; 0 stale". Log step 71, "The mutate scripts break a copy, never the tracked tree": success. 126 log steps: 124 success and two conditional skips (60 and 122). `guards` 45740763180: success. **Coverage (Rule 91):** `verify` does not run the mutation table, and no `exit-advice` id appears in its log, so the runner has not yet run the five new entries. `verify-full` does, and its header says to dispatch it after any change to `scripts/mutation-check.mjs`; no other commit has touched that file since its last green run (45227032815 on `5c9d1b29`, 2026-11-23). It was dispatched 21:21 ET as run 45741920014 (head `705085d3`, which holds `08c30f0a`); see Unobserved.

## Unobserved (Rule 74)

- **What:** the full mutation table on the runner with the five new entries and the changed check: `verify-full` run 45741920014, dispatched 2026-11-25 21:21 ET (the last six runs took 72 to 79 minutes).
- **Blocked by:** the run itself.
- **Unblocked when:** it completes, about 22:40 ET. A read is scheduled into this session for 22:47 ET; the result goes into row G1 and this record in a docs-only commit.
- **Read with:** `gh api repos/jeffunglesbee-create/field-laboratory/actions/runs/45741920014 --jq '[.status,.conclusion]|@tsv'`, then the eight shard jobs of that run.
- **What:** the message on a real refusal in a live session. The cases replay it in scratch trees; on its own commit the check only passed.
- **Blocked by:** nothing has changed the count or the budget since.
- **Unblocked when:** a session's commit changes the number of early exits or edits `docs/early-exit-budget.txt`, with the hook enabled.
- **Read it with:** that commit's output, the line under `FAIL  ...and the budget is not loose`, which starts `N now, budget B —`.
- **Also not established** (record section 10): the words "write the count into it" and "which are among those listed above" are not pinned by a clause; a drop of more than one (count 61 against 63) was not run; the scratch trees use the main tree's `node_modules` after the package files were shown identical; `git commit --no-verify` skips the hook and so this message.

## Integration state (Rule 65)

- **Relay contract:** none touched.
- **Client consumer:** none touched. The message is read by a person looking at a refused commit or a red `verify` step. The F1 harness reads only the clause's name, which is unchanged.
- **Status:** VERIFIED in scratch trees and on the commit's own hook run; UNOBSERVED against a real refusal (above).
- **Known mismatches:** one, in an earlier document. The F1 record (`outbox/hook-runs-exit-drains-proof-2026-11-24.txt`, section 7a) and the F1 report said the old message "names only the first" of the two files. It named neither (record P1). The F1 record is a dated measurement and was not edited; the correction is in G1's evidence and here.

## Carry-forwards

None unowned.

- **G2** (the budget number is held twice): filed with the scratch test that shows a value-independent anchor works (record section 8). Waiting on the owner's word, because it changes which check refuses a budget-only edit.
- **G3** (a shrunk count is told to lower the budget whatever made it shrink): filed from `docs/CC-CMD-2026-11-03-gate-state-hazards.md`, line 137. Trigger in its row.

## Incidents (Rule 77)

- **The estimate.** The step was offered at 10 minutes. The estimate counted the edit and not the proof Rules 90 and 100 ask for. The code commit was pushed 43 minutes after the approval (20:28 to 21:11 ET), and this docs commit was started at 21:22 ET, 54 minutes after it, with the full-table run on the runner still going.
- **Three premises in my first wording were false and were caught by reading, before any commit.** "Named above" for the new exit (the list holds every early exit), "turns the ratchet off" for a raised budget (the ratchet holds at the new number), and "see the line above" for a missing file (the instruction is two lines higher). The harness's predicates had passed all three, because they test tokens and not whether a sentence is true. Record section 7c.
- **A gap in my proof, found at close-out.** The proof ran the five new entries and `exit-budget-loose` through the framework and did not run the 11 older entries that expect the same check, nor the framework's own self-test after the table grew. Both were run after the commit (Verified, above) and passed. The premise was not on my list in Rule 100's sense: the older entries call the same script I changed, and one command would have refuted it.
- **A claim about the old message was wrong in my own earlier report** (above, Known mismatches). Found by probing premise P1.
- **My apparatus, four faults.** The harness's count guard stopped run 2 at A2 (it said four entries; there were five). A probe-block command put `-A6` after the revision and `git grep` refused it. A count of `--list-ids` made by splitting on commas gave 1801 and 2001, and was replaced by parsing the JSON (2245 and 2250). My first fail-on-purpose helper for the entries probe read the wrong argv index, applied no edit, and its output was not read as a result.
- **Two statements corrected before the commit, found by checking them against the record.** The cost block said "with nothing else running", which the process filter does not show. The first draft of the commit message said each of the harness's 13 predicates was broken on purpose; 8 were, and the 13 are checks on text.
- **A guard of mine caught the literal skip token** inside two automated commit subjects that a `git log --oneline -5` probe printed into the record; the lines now say "[the skip directive]" and the command line says so.

## Gates run before the docs commit

`node scripts/cc-cmd-status-check.mjs`, `npm run --silent check:citations`, `npm run --silent check:docs`, the hook's thirteen checks on the commit itself, and the skip-directive scan on the commit message and on every file written (0 matches). `check:docs` fails locally with "docs/JLAYER-PLAN.md: sports.modelled says 26, actual 25", as on the F1 docs commit; it passes on the runner.
