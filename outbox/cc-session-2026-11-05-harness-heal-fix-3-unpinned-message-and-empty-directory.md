# Session record: the HEAD-moved advice, the guard's remedy and the empty state directory are asserted

**Date:** 2026-11-05. **Scope:** review 6, lens "harness heal", finding 2 (`harness-heal.json`, n 2). Stream F3, commit 3. Touches `scripts/mutation-check.mjs` only: two new clauses, one extended, four table entries. No behaviour changed.

**Why this file exists.** `check:staged-outbox` requires an `outbox/` path in every commit that stages `scripts/`. New file, nothing existing touched; fold it into the session document or drop it when merging.

## Reproduction (Rule 100): what survived, run through the harness, in place

The four mutants were added as table entries first and run with `node scripts/mutation-check.mjs --ids ...` on the tree as it was (169 clauses), which mutates the real file, as the gate does:

| mutant | result before the clauses |
|---|---|
| Mf: delete the `Compare ... with <stash> to tell which it is` expression | `mutation SURVIVED` |
| Mg: swap `the one that matches HEAD` and `each that matches HEAD` | `mutation SURVIVED` |
| remedy text: delete `give MUTATION_STATE_DIR one that is absent or empty.` | `mutation SURVIVED` |
| D as the reviewer wrote it: delete `holds.length > 0 &&` | CAUGHT, with no new clause |
| my extra: show the Compare sentence with no path at HEAD | CAUGHT, with no new clause (an existing clause rejects any `HEAD` in an edit-only refusal) |

**D as stated is not the survivor the review saw.** Deleting `holds.length > 0 &&` refuses an ABSENT directory as well as an empty one (`readdirSync` failing with ENOENT leaves `holds` empty too), and every real-script clause starts from an absent state directory, so the harness catches it at once. The review's `156/156` came from a copy of the script placed beside the real one: the self-test's fixture repository copies `mutation-check.mjs` from its own directory, so a copy named differently is never the script the real-script clauses run. The claim behind D is still undefended, in a narrower shape: a guard that refuses a directory that EXISTS and is empty while accepting an absent one. That variant (`(holds.length > 0 || existsSync(stateDir))`) survives 169/169 on the previous commit (run by hand: previous commit's file with only that edit) and is the entry now.

Any other "survives 156/156" in the review that was measured on a copy beside the real script is open to the same reading for clauses that run the fixture; the clauses here that are in-process (the refusal wording) are unaffected, which is why Mf and Mg did survive.

## Clauses (self-test; 169 before, 171 after)

| clause | covers |
|---|---|
| the HEAD-moved refusal says how to tell a path put back from a committed stub | "Compare the one that matches HEAD with <stash> to tell which it is" for one path, "each that matches HEAD" for two, no such sentence in an edit-only refusal (three refusals), and the number of the sentences that list the paths (`a path it touched is` and `paths it touched are`, `now matches` and `now match`) in 5 refusals |
| E27: an existing empty directory is used | `MUTATION_STATE_DIR` set to a directory that exists and is empty: the run starts, nothing says the harness did not write it |
| E27 (extended, no new clause): the remedy | the refusal over foreign files also says `give MUTATION_STATE_DIR one that is absent or empty. Nothing was touched.` |

## Red evidence (Rule 90)

Through the harness with the clauses present: `5/5 checks passed` (baseline and the 4 entries caught). In place, the two number swaps that are not table entries (`a path it touched is`/`paths ... are` swapped, and `now matches`/`now match` swapped): both fail the new HEAD-moved clause (168/171 and 167/171; the other failures are clauses that start a child self-test and read its status, plus an older HEAD-moved clause for the second). The empty-directory variant on the previous commit's file: 169/169, survives.

## Not verified

Entries only for the four named mutants; the number swaps are covered by the clause and shown by hand, not entered, to keep the mutation row's cost down (each entry is one more self-test run, about 25 s).
