# Session record: the pre-commit hook runs check:exit-drains (item F1 of CC-CMD-2026-11-06-gate-residuals-remaining), Rule 67

Written 2026-11-24 on `main`. Owner direction: "Hook" (Tue 2026-11-24 21:16 ET), approving F1 as filed during the step-16 session (`outbox/cc-session-2026-11-24-step16-names-the-request.md`). The item, its evidence and its artifact are in `docs/CC-CMD-2026-11-06-gate-residuals-remaining.md`, section F. The proof is `outbox/hook-runs-exit-drains-proof-2026-11-24.txt`. This is the lab only: no relay change, no client change.

## HEAD progression

| point | where | what |
|---|---|---|
| start | `main` `178458de` | `.githooks/pre-commit` ran twelve checks; `check:exit-drains` ran only in `verify.yml` (step 38 of the job, log step 39). `77647dc1` had passed the hook with the 64th early exit and turned `verify` red at that step (45473543164) |
| change | `main` `a2fe413e` (pushed 21:46 ET, 02:46Z) | the hook line and its dated comment; the patch the proof applies; the harness; the mutation script for the harness's predicates; the proof record. `verify` 45535289999: failed at log step 71, the BSD grader's, not at step 39. `guards` 45535289988: success. No `deploy` run exists for this head |
| docs | `main`, the commit that carries this file | F1's row to BUILT with the runner reading, the step-16 CC-CMD's pointer, a one-line update in the step-16 session record, this record |

## What was built (commit order)

1. **The line** (`a2fe413e`). `npm run --silent check:exit-drains` after `check:push-lands`, on every commit, with a dated comment of the kind the other lines carry. Mode 100755 unchanged, 12 to 13 `npm run` lines, 11 lines added. The hook ran the new line on its own commit: 22/22, early report exits 63 (ratchet, budget 63), 4/4, `pre-commit: ok`, 1 m 17.9 s.
2. **The proof** (same commit). `outbox/hook-runs-exit-drains-proof-2026-11-24.mjs`: five real `git commit` attempts in scratch worktrees with the real hook and the real npm. `outbox/hook-runs-exit-drains-2026-11-24.patch` is the hook text it applies. `outbox/hook-runs-exit-drains-proof-2026-11-24-mutate.mjs` breaks four of the harness's own predicates in copies of it.

## Verified (artifact beside each)

- **Red first.** The harness's final run: C1, the hook without the line, let the tree of `77647dc1` through (exit 0, 75.4 s). C2, the hook with the line, refused it at the line (exit 1, `early report exits:    64  (ratchet, budget 63)`, 77.2 s). C3 let the tree of `c67aa5cd` through (count 63). C4 let a clean `178458de` through (count 63). C5 shows which line of the hook as it stands refuses a budget-only edit. `RESULT: all 5 cases behaved as expected`, `COVERAGE: 5 of 5 cases ran`, exit 0. Verbatim: proof record, section 5.
- **The apparatus can fail (Rule 90).** Seven predicate tests run before any commit is attempted. The mutation script breaks four of the predicates in copies of the harness: 4 of 4 caught, each anchor unique, each copy parsed, each stop naming its clause and coming before any case. Verbatim: proof record, section 3.
- **Cost.** The line alone, three runs at 21:42 ET with nothing else running: 1.024, 1.049 and 1.105 s through npm. The whole hook, one run each: 75.4 s without the line, 77.2, 77.9 and 77.5 s with it.
- **On the runner.** `verify` 45535289999 on `a2fe413e`: log step 39, "No check script kills itself mid-write", success (207 scripts scanned, early report exits 63 against a budget of 63, 4/4). Log steps 1 to 70: 69 success and one conditional skip (60, as before). Log step 71, "The mutate scripts break a copy, never the tracked tree": failure at 82 of 86, four clauses, all `bsd-next-goal-grade-core`. Log steps 72 to 92 skipped, 21 of them, as on 45442481067 and 45478103493, the two earlier runs in which that step failed. Log steps 93 to 121: 29 of 29 success. The other jobs of the run (browser-gate, drama-backfill, push-lands, claim-sweep, patent-watch, weather-availability) succeeded. `guards` 45535289988 success.
- **Coverage of that reading (Rule 91).** The 21 steps the runner skipped cannot be read there. They were replayed locally on the tree of `a2fe413e` with the non-browser step runner: 43 steps ran (YAML steps 38 to 90 of the job, those the earlier red runs had skipped or failed; a log step is its YAML step plus one), and all 43 exit with the same code as on the earlier fixed tree. Ten exit non-zero here, the same ten as before (YAML steps 55, 56, 66, 70, 73, 74, 75, 76, 78 and 90). Of the 21 skipped steps (YAML 71 to 91) 20 were replayed, and one, "Games are separated from each other", needs a browser and ran nowhere. Nine rows were listed and not run: eight that need a browser and the always-last Chromium step. Why the ten fail in this sandbox was not established here (`outbox/step16-exit-drains-regression-2026-11-24.txt`, sections 6d and 6g, has what was read).

## Unobserved (Rule 74)

- **What:** the line refusing a real commit in a live session. The five cases replay history in scratch worktrees; on its own commit the line only passed.
- **Blocked by:** nothing has committed a tree past the budget since `c67aa5cd`.
- **Unblocked when:** a session's commit adds an early `process.exit(summarize(...))`, or the budget is edited, with the hook enabled.
- **Read it with:** that commit's own output, which prints `early report exits:    N  (ratchet, budget 63)` and then `FAIL  early report exits do not grow`, and no commit exists.

## Integration state (Rule 65)

- **Relay contract:** none touched.
- **Client consumer:** none touched. The hook's only consumer is a person committing in a session with `core.hooksPath` set.
- **Status:** VERIFIED in scratch worktrees and on the commit's own hook run; UNOBSERVED against a real refusal (above).
- **Known mismatches:** none. Two figures in earlier documents read differently on 2026-11-24: the check's 0.6 s (`docs/GATE-TIMING.md`) measured 1.0 to 1.1 s, and the hook's 44 to 48 s (`docs/CC-CMD-2026-11-15-hook-runs-the-workflow-guards.md`) measured 75 to 78 s. They are dated measurements and were not edited.

## Carry-forwards

None unowned.

- **Main's red `verify` and the stuck deploy** are the BSD grader session's. Nothing here edits its files or its CC-CMDs. `verify` 45535289999 is the third run on main in which log step 71 fails with the same four clauses (after 45442481067 and 45478103493), and the deploy holds while it does.
- **The scheduled step-16 host read** (Thu 2026-11-26 18:00Z) is unchanged and unrelated to this work.

## Incidents (Rule 77)

- **A premise reached a comment before it was tried.** The first draft of the hook comment said a docs-only edit of the budget was a gap the line closes, citing two cases that did not yet exist. The harness's second run refuted it: the hook as it stands already refuses a budget-only edit, at `check:mutation-anchors`, because the mutation entry `exit-budget-loose` pins the budget's text (`find: "63"`). The comment was rewritten before any commit and the two cases became one that records which line refuses the edit. The draft never left the working tree: the premise was written into a comment before the command that refutes it had run, and the run caught it before any commit.
- **Three faults in my own apparatus, each found by a control or an expectation.** Run 1 stopped at C1 because a scratch worktree has no `node_modules` and `check:import-purity` refused on `@xmldom/xmldom`. Run 2 reported C2's refusal as NOT AS EXPECTED because the success predicate was a substring test and a clause name printed by `check:mutation-anchors` quotes `pre-commit: ok`. The same run's C5 control refuted the budget premise above. Each was fixed in the harness, the predicates now have a self-test and a mutation script, and the earlier runs are kept verbatim in the proof record. The three runs took 13 s, 5 min 34 s and 5 min 34 s; the final one is the record's section 5.

## Gates run before the docs commit

`node scripts/cc-cmd-status-check.mjs`, `npm run --silent check:citations`, `npm run --silent check:docs`, the hook's thirteen checks on the commit itself, and the skip-directive scan on the commit message (0 matches). `check:docs` fails locally with "docs/JLAYER-PLAN.md: sports.modelled says 26, actual 25", as on `6e32367a` and on the earlier fixed tree; the runner's step for it (log step 67) passed on `a2fe413e`, so the local failure depends on this sandbox and not on the tree.
