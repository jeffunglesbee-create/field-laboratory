# The gate's kill recovery now writes only over what it can prove is its own

CC-CMD: `docs/CC-CMD-2026-11-03-gate-state-hazards.md` (residuals filed: `docs/CC-CMD-2026-11-03-gate-hazard-residuals.md`). Work started 2026-11-03; the gate ran and this landed 2026-11-04 (ET).
HEAD at the start of the work: `f38fc97` (the proof-check fix; `verify`, `guards`, `deploy` and `live-check` green on it). Owner's approval: "Gate hazards approved".

## What was built, and in what order

1. **First pass** of the four tasks, then **a second review** (5 lenses over an immutable snapshot, a skeptic per medium-or-higher finding): 29 findings, all 18 that went to a skeptic
   confirmed. What it showed about the first pass is why the design changed:
   - **20 table entries were caught vacuously.** Every entry whose `expect` is `mutation-check.mjs --self-test` starts that self-test as a child of the harness, which hands it
     `MUTATION_STATE_DIR`; the self-test used that directory, found the harness's own marker, and failed on clean source. "38/38 caught" had been measuring that.
   - A bare `new Date()` in the marker writer would have dropped the gate row that scores this file from 100 to 70.
   - The whole-tree digest that witnessed world mutations could not see a content change to a tracked file that was already modified, and read any unrelated change in the window
     as a failed restore, which aborted a healthy run and wedged every later one.
   - The `clear` outcome never rebuilt, so a kill between the file going back and the build going back left `build/` holding the mutation.
   - Nothing stopped a second run starting during the first one's baseline.
   - The refusal texts could not clear themselves; the live-run refusal in phase 2 named the wrong file and recommended `git checkout` of both.
2. **The redesign of `mutation-check.mjs`**, the self-test rewritten around it, the table re-anchored and extended, and the small proof-check items from that review.
3. **A real container restart** (2026-11-03, about 23:30 ET) killed the first full gate run mid-mutation. The harness healed the tree it left (`HEALED`, `scripts/mutation-check.mjs`
   back to its pre-gate hash). It also exposed a defect in a table entry: `self-test-uses-the-real-state-dir` replaced the temp directory with a bare `.mutation-state`, and the mutated
   self-test the harness ran as its expectation emptied the harness's own state directory (marker, backup, run lock) while it was running. The entry now honours
   `MUTATION_STATE_DIR`, and `stateIntact` makes a run that loses its own state stop and say so, instead of finding out at the next kill.
4. **A third review** (5 lenses, a skeptic per finding, 33 agents): 27 confirmed, 1 refuted, 20 low and not verified. Dispositions are in the CC-CMD ("Review 3"): 21 fixed, 4 mitigated
   with the remainder named (findings 1, 4, 13 and 14), 2 filed in the residuals CC-CMD (12 and 17). The ones that mattered:
   - A stranded `self-test-uses-the-real-state-dir` was erased by the next bare `--self-test` (the fix in 3 was not enough: the replacement still pointed at `.mutation-state` when no
     variable was set). The replacement is now a directory that is neither the real one nor under tmp.
   - A stub that was committed read as "already undone" and the heal deleted the stash (the snapshot lists only paths that differ from HEAD, so `null` is ambiguous once HEAD moves).
     The world marker records HEAD; a null path is `diverged` when it has moved.
   - The run lock was taken after the heal, which is the longest phase of a start; two runs over one stranded marker both healed and the slower one deleted the faster one's lock. The
     lock is taken first and the heal's cleanup keeps `run.json`.
   - A run that healed a stranded mutation of the harness's own code kept running the mutated copy it had loaded. It restarts as the restored code.
   - A catchable signal or `fatal()` cleared the marker while `build/` still held a compiled mutation. The marker now stays until the build is verified clean.
   - A heal ignored the result of its rebuild and dropped the evidence anyway.
   - proof-check dropped its fallback state even when putting the files back failed; accepted any code in the injection gap as its own; adopted a probed registry as the original
     when no state existed.
   - Several lines of the new design had no clause that could fail (Rule 90): the exit handler's source restore, the write order of marker and backup, the refused run's lock, the
     no-op world guard, the `touched` record and others. Each now has a clause and an entry.

5. **The first full gate on that tree** (02:06 to 02:58 ET, 510/530, 22 of 23 rows) failed one row: its full mutation run caught 335 of 336 mutations and `harness-reads-the-clock-twice` survived. Cause, found before any change: the determinism scan in `row-confidence.mjs` (comment pass, then a global quote pairing) lost sync at a `//` inside a string (first at line 111 of the committed `mutation-check.mjs`), so a clock read in the harness could sit in a region it read as a string; it had been right by parity until the table grew by 41 entries. Fixed with a character-level scanner, one clause and one table entry per branch (12), and checked against acorn's tokenizer over all 168 scripts (same clock-read counts). Not fixed, filed as residual Task 9: template-literal contents stay hidden (revealing them flags `pickem-check.mjs` and drops its row to 70), the network half of the scan cannot fire, and a regular expression after `)` or `]` is read as division (`}` before `/` is read as a regex, which is right after a block).
6. **A fourth review** of everything done since the third (the fixes and the scanner; 6 lenses, 25 agents, a skeptic per non-low finding): 19 confirmed, 0 refuted, 17 low and not verified. Dispositions are in the CC-CMD ("Review 4"); the rest is residual Task 10. The ones that mattered:
   - **The self-test could corrupt the real repository.** Run by the pre-commit hook in a linked worktree, git carries `GIT_DIR` and `GIT_INDEX_FILE` for the repository being committed, and the self-test's scratch `git init` / `git add -A` / `git commit` acted on it: `core.bare=true`, the identity overwritten, the index replaced by the scratch repository's (reproduced by the reviewer and by a skeptic). Every `GIT_*` variable is removed and global configuration is `/dev/null`; a clause starts the self-test with a decoy repository's location and a home directory whose git hook always fails. This predates the change (the base commit has the same code); the change added more git calls on top of it.
   - **A restore that failed part-way was read as stale by the next run, which deleted the only whole copy.** `proof-check.mjs` now records the failure in its marker, and the next run keeps the state when either file is not its backup and not provably its injection. A failed restore also fails the run and says which file (it ended `8/8 checks passed`, exit 0, before).
   - **A heal forced `npm run build` for a docs mutation**, and a failed build refused every later run over a file that was already back; a build that printed more than 1 MiB counted as failed. The marker records whether the mutation could reach `build/`, and the output limit is 256 MiB.
   - **`MUTATION_REEXEC` leaked into the restarted run's children**, so its baseline's self-test failed on a clean tree; the guard was unobservable. It is read once and removed, the restart prints that it is one, and E12 kills the restarted child to tell a restart from carrying on.
   - **A marker with no start time over a stranger's pid** was refused with advice to delete the state (the only backup) and to `kill -9` the stranger. A pid shown not to be a proof-check is now a dead run's, judged by the tree.
   - **The scanner**: a division after `++`/`--` or after a property spelled like a keyword was read as a regular expression, and in a template expression that hid the rest of the file. 49 of 66 mutants of the scanner passed both its self-test and the whole 23-row run; after this pass 3 survive (two change nothing the scan reports, one is the network half, which cannot fire).
   - **Rule 90 found one more in this pass's own tests**: `proof-main-flow-target-always-intact` survived the first run of the new entries, because nothing tested a torn target after a failed restore. It has a clause now.
7. **A fifth review of the delta since the fourth** (4 lenses, 14 agents, a skeptic per non-low finding): 10 confirmed (none high), 0 refuted, 14 low. Dispositions are in the CC-CMD ("Review 5"). It found tests that could not fail, not defects in the recovery itself, and two things worth saying plainly:
   - **The hooked-environment clause was blind to the index.** Narrowing the scrub so that `GIT_INDEX_FILE` survived left the self-test 115/115 while the caller's staged files were replaced; the clause only looked at identity and commit count. It now compares HEAD, identity, bare-ness, staged files and `git status` of a decoy that has a commit and a staged file.
   - **A fix of mine had a regression**, found by the scanner lens and confirmed against acorn: a prefix `++`/`--` after a newline or a keyword (`a`, newline, `++/re/`) read as a postfix, and a `.` that ends `...` or a number read as property access. Fixed, with pairs for each and an 88-mutant battery of the final scanner (85 caught, 3 known).
   - `--anchors` said it checked uniqueness and did not. It does now, and the first anchor it found twice was `harness-reads-the-clock-twice`: its two-space anchor was a substring of a four-space line above the one it meant, so that entry had been mutating the baseline artifact's line, not the one its claim named.
   - **A guard dropped a count for the wrong reason.** After the fixes `check:exit-drains` read 59 early exits against a budget of 60 ("the budget is not loose": lower it). Investigated first: the new scanner fixtures in `row-confidence.mjs` nest quotes, backticks and slashes, the guard's five regular-expression passes lost sync on them and blanked the self-test's `process.exit(summarize() ...)`, so the count fell with nothing changed in what the scripts do. Lowering the budget would have recorded a blind spot as progress. The clauses moved to a hoisted function at the end of the file, the count is 60, and the stripper is residual Task 10 item 19.
   - **Runaway processes from review scratch copies** (five `row-confidence.mjs` runs at 68% CPU each for 3.7 hours, from the fourth review's mutants of the scanner) were running when I took the first set of timings; load average 5.4. They were killed and the figures re-taken at idle (load 0.7 to 1.0). Every timing in GATE-TIMING is from the second round.

## Gate

`npm run gate` on the final tree (12:49 to 13:57 UTC on 2026-11-04, `PW_CHROMIUM` set): **23 of 23 rows, 530/530, 4,077 s, "Gate passed — every row, not a passing average"**, run `6a2e444b3880-d47e6f8651da` in `docs/confidence-log.jsonl` (tree dirty; that file and the other three the gate rewrites were discarded, not committed). The row "breaking each invariant makes a check fail" took 3,967 s and passed: the full mutation run caught every mutation it ran (the table has 444 entries; the gate's own artifact for the count was one of the files discarded), including `harness-reads-the-clock-twice`, the one that survived the first gate. The first gate (on the tree before the scanner fix) was 22 of 23, 510/530.

## The rule it now enforces

**`mutation-check.mjs`.** A marker says a run was killed; it does not say the tree is still as that run left it. So the marker records what the mutation did and the heal (a pure
`planHeal` with seven outcomes) writes only when the evidence matches:

| mutation | the marker holds | restore happens only if |
|---|---|---|
| a source file | hash before, hash after, the backup, pid and process start time | the file hashes to "after" and the backup is the original; "before" means already undone (rebuild, write nothing); a file that is neither is `diverged` whether or not its backup survived; the backup gone with the file still the mutation is `lost` |
| a change outside the source | the stash path, the tree before, the commit it was on, the paths the mutation touched with their hashes before and after, pid and start time | every touched path is as the mutation left it (or a restore was cut short); a path edited since is `diverged` and named; with HEAD moved, a path that reads like "put back" is `diverged`; the restore is READ BACK |

Also: the stash is in the state directory (handed to the mutation as `$STASH`), not `/tmp`; the self-test works in a temp directory of its own and removes it; the exit handler clears
only what the process itself wrote, and keeps the marker while a source mutation's build is unverified; a harness run inside a harness run keeps its state beneath its parent's and
runs its baseline in that environment; `run.json` is taken before the heal and outlives it; a heal that restored part of the harness starts the run again; `--heal` heals and stops, and
`--self-test` names a stranded state and that command before its clauses; a refusal over a stash that holds files does not say to delete the directory; and an uncaught exception prints
before the handler exits.

**`proof-check.mjs`.** The marker and backups live until the whole run is over; they are dropped only when both files read back as they were. A block above the anchor is the script's own
only if every line of it is blank, indented, or a proof header. An injected target or a probed registry with no state is refused. The marker carries the process start time
(`scripts/run-marker.mjs`: field 22 of `/proc/<pid>/stat`; zombie and torn-down states read as dead), a marker naming our own pid falls through to the tree check, and a refusal shows what
the pid is running and says `kill -9`.

## Verified (this container, 2026-11-04)

| check | result |
|---|---|
| `node scripts/mutation-check.mjs --self-test` | 118/118 in 13.2 s at idle (it was 96/96 in 8.9 s, 68/68 in 4.5 s and 21/21 in 0.57 s at the earlier trees: GATE-TIMING); 41 clauses (E1 to E21) start the real script in a scratch git repository, with SIGKILL, SIGTERM, SIGINT or SIGHUP at a chosen moment, an exception, a fault hook, a planted lock, a broken git directory, a restarted run, or two runs at once; 4 more start it elsewhere (two in a directory with no repository, two as nested self-tests, one of them under a decoy's git environment) |
| `node scripts/proof-check.mjs --self-test` | 85/85 in 5.8 s at idle |
| `node scripts/row-confidence.mjs --self-test` | 15/15 in 0.14 s (86 exact-output pairs, 24 clock-read spellings); `node scripts/row-confidence.mjs`: 23/23 rows at or above 95, none flagged |
| the scanner battery (88 mutants of the final `stripNonCode` and `clockCounts`: the fourth review's battery re-anchored to the final code and extended for the new rules, each run against the self-test and the full 23-row scorer, in a copy) | 85 caught, 3 alive: `expr-return-i` and `keyword-null-ok` change nothing the scan reports, `network-always-false` is the network half, which cannot fire (residual Task 9). `captures-greedy`, declared equivalent in Review 4, is killed by a two-capture line |
| the 135 table entries touched in Review 5 (`proof-`, `row-scan-`, `restart-`, `baseline-`, `anchors-`, `self-test-`, `rebuild-`, `child-output-limit-` and the three scanner-row entries), run through the harness (`--ids`) | 135 of 135 caught, a clean baseline, tree restored |
| Review 4's 32 mutation-check entries and 84 proof-check and scanner entries, run through the harness | 32 of 32; 83 of 84 on the first run (`proof-main-flow-target-always-intact` survived, a clause was added), all caught on the re-run |
| (Review 3's pass, by hand, kept for the record) the 64 harness-recovery mutations, applied by hand to a scratch copy (`scripts` in the scratchpad: each applied after the harness's own guard, parse-checked, then `--self-test` run in the copy) | 64 of 64 red, none crashed, none survived; the clauses that fail are printed per mutation (30 of the 64 are new in this pass, and 6 of the older ones were re-anchored) |
| (the same) the 33 proof-marker mutations, applied by hand to a scratch copy | 33 of 33 red (none crashed, none survived; 11 are new in this pass) |
| (the same) the 12 row-scan mutations, applied by hand to a scratch copy of `scripts/` | 12 of 12 red, after two clauses that let their mutation survive (a block comment that the regex path swallowed anyway; template braces whose early return paired up by coincidence) were given snippets that tell them apart |
| `harness-reads-the-clock-twice` against the real tree after the scanner | PASS (it survived in the gate run), file restored byte-identical |
| `node scripts/mutation-check.mjs --anchors` | 441 of 444 anchors checked, 0 stale and none ambiguous (the other 3 are world mutations, which have none) |
| real tree, a planted stale marker over a newer file | exit 1, "neither the original nor the mutation", state kept, tree unchanged |
| real tree, `--self-test`, `--list-ids`, `--anchors` over a planted stranded marker | marker and backup survive all three |
| real tree (HEAD `6a2e444` plus the uncommitted change), SIGKILL after a source mutation (`docs/gate-rows.txt`), then the next run, 2026-11-04 on the final scripts | exit 137, file mutated, the marker records `"rebuild":false`; the next run `HEALED` in 0.05 s with no build (a docs file cannot reach `build/`: E1; the earlier version of this row said the real `npm run build` ran, which stopped being true when the marker learned that), tree byte-identical to the start |
| real tree, SIGKILL while the day's write-ups are stubs (1 write-up on this ET day: this one), then the next run | exit 137, stubbed; next run `HEALED`, tree byte-identical |
| real tree, `proof-check.mjs` SIGKILLed the moment `src/Desk.fs` carries the probe, then the next run | probe on disk with marker, `start` recorded; next run `HEALED`, 140/140 checks, tree byte-identical, `.proof-state` gone |

Coverage (Rule 91): the real-tree checks are 7 checks over 4 kill-and-heal or planted-state scenarios for the mutation harness (one tree, HEAD `6a2e444` plus the uncommitted change, re-run 2026-11-04 on the final scripts) and 1 kill-and-heal pair for proof-check; they exercise one
source mutation (`known-survivor`), one of the 3 world mutations (`outbox-stub`), and the phase-2 kill. The other 2 world mutations and the other table entries are not killed one by one;
they run through the same code. The by-hand runs apply every entry of the two blocks they name (64 and 33) to a copy and run only the self-test that entry names; the harness's own pass
over the whole table, including the rows the entries' other expectations cover, is the gate's mutation row.

## Measured while building (Rule 73)

- **The old clock scan's failure was parity, not content.** Listing the quote pairs that span more than six lines in the committed `mutation-check.mjs` gives 65, the first at line 111 (`"URL='http://…' node …"`); in the delivered file the first `//` inside a string is at line 118 (`grep -n "URL='http://"`; the count of spanning pairs was measured on the earlier trees only). The scan's counts for the harness were 1 read and 1 capture as it is and with the entry applied; the true counts are 2 and 2, and 3 and 2 (2026-11-04).
- **`String.replace` with a replacement string containing `$'`** expanded it into the rest of the file when I inserted table entries; the result did not parse. Restored from a copy and inserted by slicing, as `proof-check.mjs`'s own comment already warned (2026-11-04).
- **A zombie answers signal 0 as alive** and shows state `Z` in `/proc/<pid>/stat`. A Node process can make one: spawn a child that exits at once and keep the event loop from turning;
  `proof-check.mjs --self-test` does this (2026-11-04, this Linux). The earlier note here, that a Node test cannot make a zombie, was wrong.
- **A SIGKILLed harness orphans `dotnet fable watch`**: 15 s after the kill it was still running with parent pid 1, with its `fable.dll watch` child (2026-11-03). Filed as residual
  Task 1. What the next run does with a live orphan on the same `build/` is not measured.
- **A mutated harness that ignores `--heal` ran the whole suite inside a scratch repository, whose baseline runs `--self-test`, whose group E ran it again: a recursion that held
  the machine for minutes** (2026-11-04, found by applying `no-heal-mode` by hand). Every run the self-test starts now carries `MUTATION_SELFTEST_CHILD`, which ends the recursion
  at the second level.
- **A container restart is a SIGKILL as far as the harness can tell**, and the heal worked on the tree it left (2026-11-03). A SIGTERM before it would have run the exit handler.

## Not verified, and why

- **The Review 5 fixes have not had a review of their own** (the sentinel, the argument-based pid identification, the ASI and number rules in the scanner, the anchor-uniqueness check, the hooked-environment clause). Each has clauses that were red first and entries run through the harness; the gate is the next check.
- On a platform with no readable `/proc`, a recycled pid cannot be told from the run. The clauses that need it say `asserted:` in their name and pass vacuously there; nothing was run on
  such a platform. (Only `proof-check.mjs`'s clauses carry the label; `mutation-check.mjs`'s three that compare start times do not.)
- The seven `scripts/mutate-*.mjs`, the orphaned watcher, proof-check's blind restore and its non-exclusive marker, and the items in residual Task 8 are filed, not fixed.
- `--heal` is not in the gate row or the pre-commit hook: the row's text is mirrored in `.github/workflows/verify.yml` and asserted by `sharded-row-check.mjs`. The self-test names the
  command; a person runs it.
