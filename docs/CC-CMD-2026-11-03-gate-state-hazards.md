# Claude Code Command — the gate's kill-recovery state can overwrite newer files or vanish before it is used

**Branch:** main — commit directly, do not create a feature branch or PR
**Repo:** field-laboratory
**Filed:** 2026-11-03, by CC, as the follow-up `docs/CC-CMD-2026-11-03-proof-check-stale-state.md` names for what its review found and it does not touch (Rule 87.4: out-of-scope work gets its own CC-CMD before the first closes)
**Confidence gate:** `npm run gate` >= 95 before any commit that lands. Tasks 1 and 2 change `scripts/mutation-check.mjs`, the command behind the gate row `breaking each invariant makes a check fail`; Task 3 changes `scripts/proof-check.mjs`.
**Status:** DONE 2026-11-04, commit `18a4165` on main (local gate 530/530, 23 of 23 rows; `verify` 41843202008, `guards` 41843201918 and `deploy` 41844095135 green; see "Gate and commit" below). Tasks 1 to 4 built, plus the world-mutation restore finding (3), and the findings of four further reviews (the second, the third, "Review 3", the fourth, "Review 4", and the fifth, "Review 5", below). `mutation-check.mjs`: a backup is applied only to a file that is exactly the mutation, a change made outside the source is undone only for the paths it touched (and with HEAD where it was) and is read back, the self-test and the exit handler no longer touch a real state directory and the self-test runs git in an environment of its own, a run lock is taken before the heal and outlives it, a heal that restored part of the harness starts the run again as a new process, the marker stays while a source mutation's build is unverified, a failed rebuild is not called healed and a heal rebuilds only for a mutation that could reach `build/`, `--anchors` also refuses an anchor that occurs twice, and `--heal` heals and stops. `proof-check.mjs`: the marker lives through the registry phase, is dropped only when both files read back as they were (a failed restore is recorded in a sentinel and in the marker, fails the run and says which file), carries the process start time, its own pid falls through to the tree check, a pid is identified by its arguments, and only a block of proof functions in the injection gap is its own. Self-tests 118/118 (mutation-check), 85/85 (proof-check) and 15/15 (row-confidence), and 444 table entries (62 `proof-` and 50 `row-scan-`), each red when run through the harness (`--ids`). `row-confidence.mjs`: the determinism scan is a character-level scanner, because the gate found its three-regular-expression version blind to the harness's own clock reads ("The gate found one" below). Real SIGKILLs on the real tree are in the session doc. Residuals found while building are in `docs/CC-CMD-2026-11-03-gate-hazard-residuals.md` (FILED). Evidence: `outbox/cc-session-2026-11-04-gate-state-hazards.md`.

---

## Related, read before building (BUILD-ON-A)

Searched 2026-11-03 by content (`heal`, `.mutation-state`, `restoreCmd`, `proof-state`, `livenessOf`, `stranded`) in `docs/CC-CMD-*.md`.

- `docs/CC-CMD-2026-11-03-proof-check-stale-state.md` (DONE): fixed the same defect class in `proof-check.mjs`'s heal. Its rule is the model here: a backup is applied only to a file that is exactly that backup plus what the script itself put there, and otherwise nothing is written.
- `docs/CC-CMD-2026-11-03-proof-check-shards.md` (DONE) keeps the heal of a killed run among proof-check's rules; Task 3 below changes that script's state handling and must keep it.
- `docs/CC-CMD-2026-11-03-gate-speed.md` (DONE) shards the mutation suite; nothing below changes its partition (the shards are computed from the table, and `THE SHARDS PARTITION THE TABLE` still holds with the larger table), but the table has more entries than it had, and Task 1 changes what a shard does at start. Its ruling that the build is made clean before every mutation is untouched.

## What was found (Rule 73)

2026-11-03, by five independent review agents over an immutable snapshot of the proof-check change, each demonstrating in scratch copies (a shim `dotnet`, planted markers, real SIGKILLs); a skeptic then tried to refute each of the findings below and could not. I did not re-run these demonstrations myself.

1. **`mutation-check.mjs` `heal()` restores from a stale marker with no liveness or still-mutated check** (high). It reads `{id, file, backup}` from `.mutation-state/active.json` and does `writeFileSync(file, readFileSync(backup))`. The marker carries no pid and nothing that says the file is still the mutated one. Reproduced with a planted marker whose backup was old and whose file was newer, and with a marker left by a real SIGKILL: the newer file was overwritten. The same defect as the proof-check incident, in the harness that runs after it.
2. **`mutation-check.mjs --self-test` deletes a real stranded marker and its backup before `heal()` can use them** (high). The self-test writes the REAL `.mutation-state/active.json` and `clearActive()` removes the whole directory. The pre-commit hook and the gate row both run it, so the next commit after a kill removes the only record of a stranded source mutation (a broken `Verify.fs` in the demonstration) while the file stays mutated; the following real run found nothing to heal.
3. **The world-mutation restore path** (medium). Restore strings use `/tmp` stashes (`/tmp/mut-outbox`, `/tmp/mut-stub`), which a container restart wipes while the marker in the repo survives: `heal()` then runs `cp ... 2>/dev/null || true`, prints "Ran its restore command" and the session document stays the stub. A stale stash also overwrote a newer document in the demonstration, and the `history-boundary` restore (`git checkout -- docs/history-boundary.txt`) discards uncommitted edits to it. Needs a likelihood caveat: a kill or restart inside the short mutate-to-restore window, plus a wiped `/tmp` for the first.
4. **proof-check's registry phase has no marker and no backup on disk** (medium, existed before the change). `restore()` removes `.proof-state/` at the end of phase 1; phase 2 then inserts the `    | NHL` probe into `src/Desk.fs` with nothing recording it. A SIGKILL there leaves the file mutated, every later run reads it as the original and fails its baseline on FS0025, and its exit `restore()` writes the mutation back; a second run started during phase 2 is not refused. Reproduced twice. The new per-file heal CAN heal a registry probe, but only if the marker is still on disk, which it is not in phase 2.
5. **A recycled pid or a zombie makes a stale marker refuse forever** (low, existed before): `process.kill(pid, 0)` cannot tell the recorded process from another one now holding the pid, and succeeds on a zombie. The refusal message then says the target "has ... injected right now" on a clean tree and recommends `kill <pid>`. And a marker whose pid equals the new run's own pid classifies `proceed` before the tree is looked at, so a stranded injection is reported as "no run state exists" with the state on disk.
6. **A comment in `proof-check.mjs` points at `livenessOf`**, which no longer exists (it is `isAlive`; removed in `6f33b8d`).

## Task 1 — `heal()` applies a backup only to a file that is still the mutation

The marker gains what the mutation did (the applied text is already in the table entry) and `heal()` restores only when the file is exactly the backup with that mutation applied; a file that is anything else is left alone and the state is kept, with a message that says where the backup is, as `proof-check.mjs` now does. A pid goes in the marker so a live run refuses. Probe first: read the marker writer and `heal()`; the artifact is a self-test case per outcome that runs the real harness against planted state in a scratch directory, and a mutation for each.

## Task 2 — the self-test must not touch the real state directory

The self-test uses its own state directory (a temp path or an override flag), never calls `clearActive()` on the real one, and the exit handler restores only the directory it created. Artifact: a case that plants a real-shaped marker and backup, runs `--self-test`, and requires both still present afterwards; it must go red on the current code first.

## Task 3 — proof-check keeps its marker through phase 2

Keep `.proof-state/` and the registry backup until the very end, and let `classifyState`'s inputs already added cover the probe in phase 2 (they do; only the marker's lifetime is missing). Add a pid-start fingerprint (the process's start time) so a recycled pid or a zombie does not read as the recorded run, and let the own-pid collision fall through to the tree check. Artifact: a real-script case for a kill in phase 2, and one for a recycled pid.

## Task 4 — the dangling comment

Change `see \`livenessOf\` below` to name `isAlive` in the header comment of `proof-check.mjs`.

## What was built, against each finding

1. **Finding 1** (stale marker, no check). The marker records the hash of the file before and after the mutation, the process and its start time. The heal is a pure `planHeal` with seven outcomes (refuse, restore, clear, diverged, lost, legacy, unreadable); it writes only when the file is exactly what the mutation made it, and says where the backup is otherwise. A file that is neither the original nor the mutation is `diverged` whether or not its backup survived.
2. **Finding 2** (the self-test erased a real marker). The self-test works in a temp directory of its own whatever `MUTATION_STATE_DIR` says; the exit handler clears only what the process itself wrote; a harness run inside a harness run keeps its state in a nested directory. A self-test the harness starts as an expectation used to inherit the variable and fail on clean source, so about 20 table entries were reported caught by a self-test that was red before any mutation: that is fixed and covered by its own clause and mutation (`self-test-honours-the-env-var`).
3. **Finding 3** (world mutations). The stash is in the state directory (the harness hands it over as `$STASH`), not `/tmp`. The marker holds a snapshot of every changed file by path and content hash, so a change elsewhere in the tree is nobody's business and a hand edit to a file that was already modified is seen. The restore is read back; one that did not work stops the run with the state kept. `history-boundary-moved` no longer restores with `git checkout`.
4. **Finding 4** (phase 2 had no marker). `proof-check.mjs` keeps the marker and backups until the whole run is over; a registry probe the backups do not describe is `diverged`, not discarded.
5. **Finding 5** (pid reuse, zombie). `scripts/run-marker.mjs` reads the start time from `/proc` and treats a zombie as dead; a marker naming our own pid is judged by the tree. Where `/proc` cannot be read the signal's answer stands (the self-test says which clauses were not asserted).
6. **Finding 6** (dangling comment). Names `isLive` in `run-marker.mjs`.

## Review 3 (2026-11-04): the third adversarial review, finding by finding

Five lenses over an immutable snapshot (kill windows, heal correctness, proof-check and the marker, test vacuity, claims), a skeptic per finding. 27 confirmed, 1 refuted (the healing run being itself the stranded mutant: real, but the gate row's first command fails first, so it cannot go green on it), 20 low and not verified. Each fix below has a clause that failed first (Rule 90) and a table entry that is red when applied by hand.

| # | finding | disposition |
|---|---|---|
| 0 | a stranded `self-test-uses-the-real-state-dir` is erased by the next `--self-test` | fixed: the entry's replacement names a directory that is neither the real one nor under tmp |
| 1 | the gate row cannot heal a stranded harness mutation (`--self-test` fails first, `&&`) | mitigated: `--heal` heals and stops; `--self-test` names a stranded state and that command first. The row and the hook do not run it (Task 8 of the residuals) |
| 2 | a signal or `fatal()` clears the marker while `build/` holds the mutation | fixed: the marker stays until the build is verified clean (E14) |
| 3 | the healing run carries on as the mutated code | fixed: it starts again as the restored code (E12) |
| 4 | SIGKILL between a world mutation and its touched record is refused with a false message | the message is fixed (it no longer blames a person, names the stash, offers no restore line); the window itself (milliseconds) remains |
| 5 | HEAD moved: a committed stub reads "already undone", the stash is deleted | fixed: the marker records HEAD; with it moved, a null path is `diverged` |
| 6 | the run lock is taken after the heal; the slower run deletes the faster one's lock | fixed: lock first, the heal's cleanup keeps `run.json` (E13). Stale-lock takeover is still not atomic (residual Task 8) |
| 7 | five load-bearing lines have no clause | fixed: E9, E7, the lock clauses, E10 |
| 8 | refusals say to delete the state over a non-empty stash | fixed |
| 9 | the heal ignores a failed rebuild and drops the evidence | fixed: the marker stays, the run stops |
| 10 | proof-check's restore drops its fallback even when the files did not go back | fixed: dropped only when both files read back as they were; a throwing write and a write that lands nowhere are both tested |
| 11 | the injection gap accepts any code that carries the marker | fixed: only blank, indented and proof-header lines |
| 12 | proof-check's marker is not created exclusively | filed (residual Task 5): 0 of 10 at 5 ms, 4 of 10 at 0 ms |
| 13 | proof-check's signal handlers cannot run during a synchronous build; `kill <pid>` does nothing | the advice says `kill -9` and the comment says why; the handlers are filed (Task 7). Updated 2026-11-06: Task 7 is built, the handlers are removed, so a plain kill stops the run and the next run heals; the advice no longer says `kill -9` |
| 14 | a marker with no start is judged by the pid alone | the refusal shows what the pid is running, says the marker records no start, and says it may be deleted |
| 15 | the `proceed` branch is untested for the target and absent for the registry | fixed: both refused, both tested |
| 16 | `EPERM` and state `X` in `isLive` have no assertion | fixed, plus a real zombie |
| 17 | proof-check's end-of-run restore overwrites edits made during the run | filed (residual Task 4, pre-existing) |
| 18 | the write order marker and backup before the file is pinned by no clause | fixed: `source-prepared` and `world-prepared` kill hooks, E10 |
| 19 | the exit handler's source restore has no clause | fixed: E9 |
| 20 | the baseline is vacuous for the nested-harness expectations | fixed: the baseline runs in the child environment |
| 21 | an unrelated change during a world mutation is not tested | fixed: E15 |
| 22 | `npm run check:proof` stops before the heal after a phase-2 kill | fixed: the clause reads the committed registry |
| 23 | the no-op world mutation guard has no clause | fixed: E16 |
| 24 | the live-run refusal's text is untested | fixed: it says to wait, not to delete |
| 25 | the refusal for an edited world path prints a command that overwrites it | fixed: the path is named and the command is not offered |
| 26 | an edit made after the kill with the backup gone is called "lost" damage | fixed: judged before the backup |

Of the 20 lows: the temp directories the self-test left (three per run, 2,500 in this container's /tmp), the silent skip of group E in a child, the stale comments and claims, the counts in this document and the session doc, the "Node cannot make a zombie" claim and the run-marker header, and the coverage statement were fixed here; the rest are in the residuals document (Task 8). The count of clauses and entries above is regenerated from the final tree, not carried from the earlier drafts.

## The gate found one: a clock scan that had lost sync

The first full gate on the tree of Review 3 (2026-11-04, 02:06 to 02:58 ET, 51 minutes) passed 22 of 23 rows and 510 of 530 points. The failing row was "breaking each invariant makes a check fail", and its only failing conjunct was the full mutation run: 335 of 336 mutations caught, `harness-reads-the-clock-twice` SURVIVED. That entry adds a bare `new Date()` to `mutation-check.mjs` and expects `row-confidence.mjs` to notice. Investigation (Rule 77, before any fix): the scan under that row removed `//` comments line by line and then paired quotes across the whole file, and the two disagree about a `//` inside a string, which the table has from line 111 on. The pairing between that line and the baseline-writing line had been right by parity; the 41 entries this change added to the table moved it, and the bare read fell inside a region the scan read as a string. The same defect was in the committed file (the reviewer had flagged it as low finding 10), and the entry's claim had been defended only by luck. Fix: a character-level scanner (`stripNonCode`) in place of the three passes; a clause per branch of it; 12 table entries, one per branch, each red by hand; the entry itself caught again (`--only harness-reads-the-clock-twice`: PASS). What it still cannot see (templates, the network half, a regular expression after `)` or `]`, which reads as division) is residual Task 9, with the measurement that makes revealing templates a separate change (`pickem-check.mjs` reads the clock inside one).

## Review 4 (2026-11-04): the fourth adversarial review, finding by finding

Six lenses (scanner-fuzz, scanner-review, heal-flow, proof-and-marker, tests-vacuity, integration) over an immutable git snapshot whose diff was exactly the change since Review 3, a skeptic per non-low finding. 19 confirmed, 0 refuted, 17 low and not verified. The skeptics re-rated several (the REEXEC leak, the rebuild wedge and the scanner division from high to medium; the silent restore and the unreadable-tree refusal stayed medium; the torn restore stayed high, and so did the git environment). Each fix has a clause that was red before it (Rule 90) and a table entry that is red when applied through the harness.

| # | finding | disposition |
|---|---|---|
| 0 | a division after `++`/`--` or after a property named like a keyword (`c.new / c.total`) is read as a regular expression; inside a template expression it hides the rest of the file | fixed: `regexAllowed` ignores a keyword after a `.` and treats `++`/`--` after an operand as ending it; the self-test asserts the exact text the scanner leaves for 71 inputs (86 after Review 5), and the three shapes the reviewer reproduced |
| 1, 3 | most of the scanner's branches could be broken with every check green (49 of 66 mutants of it passed the self-test and the 23-row run) | fixed: the 66 mutants re-run against the final scanner leave 3 alive: two change nothing the scan reports (`expr-return-i`, `captures-greedy`) and one is the network half, which cannot fire (residual Task 9). the scanner has 50 table entries now (12 before Review 4), one per branch family; Review 5 re-ran the battery after its own fixes |
| 2 | `const NAME = () => new Date()` counts as a capture | filed (residual Task 10): the skeptic found the proposed fix wrong |
| 4 | no clause asserts `Date.now()`, `fieldDay()` or `fieldToday()` is counted | fixed: 13 spellings, each with its reads and captures |
| 5 | `MUTATION_REEXEC` leaks into every child; the restarted run fails its own baseline; the guard is unobservable | fixed: read once and deleted; the restart prints that it is one; E12 kills the restarted child, checks the parent's exit status and that the flag does not reach what the run starts |
| 6 | a heal rebuilds for a docs mutation, and a build that prints more than 1 MiB is read as failed; either wedges every later run | fixed: the marker records whether the mutation could reach `build/`; the output limit is 256 MiB; the refusal carries the build's own failure (E1, E17) |
| 7 | a restore that fails part-way keeps its state, and the next run calls the torn file stale and deletes it | fixed: the marker records that the restore failed; the next run keeps the state when either file is not its backup and not provably an injection |
| 8 | a failed end-of-run restore exits 0 and says `8/8 checks passed` | fixed: it says which files, sets the exit status, and the stand-in compiler in the self-test passes every check first |
| 9 | the refusal over a legacy marker tells a person to delete the state and `kill -9` a pid it has just called a stranger | fixed: a pid shown not to be a proof-check is a dead run's and the tree decides; one nobody can identify is to be looked at, never killed or its state deleted |
| 10 | four pieces of recovery code have no clause that can fail | fixed: a marker-less insertion, the registry's restore read-back, the committed-registry reader (against a scratch repository), the refusal shapes |
| 11, 12, 13, 15, 16 | a partial world restore, an unreadable tree, a catchable signal, the marker's recorded `before`, and a world heal running `npm run build` are all untested | fixed: `world-restore-partial` fault, E10 on a dirty tree, E18 (SIGTERM, SIGINT, SIGHUP, and a SIGTERM during a world mutation, each stopping where it was sent), E19, E20 and unit clauses |
| 14 | E12 cannot tell a restart from carrying on in-process | fixed (see 5) |
| 17 | the self-test runs git with the caller's environment: the pre-commit hook in a linked worktree set the real repository bare and replaced its index | fixed: every `GIT_*` variable is removed, global configuration is `/dev/null`; a clause starts the self-test with a decoy repository's location and a home directory whose git hook always fails (Review 5 made the clause see the index, not only the identity: see its row 0) |
| 18 | a developer's global git configuration (signing, hooks, autocrlf) crashes or fails the self-test | fixed with 17 (the temp directories a crash leaves are residual Task 10) |

Of the 17 lows: the wrong `}` claim, the misplaced JSDoc, the regex marker, the "line 100" (measured 111), the plain-kill wording, the residual's ET-day clauses, the `--heal` usage text and the stale residual wording were fixed here; the rest are residual Task 10.

## Review 5 (2026-11-04): the fifth adversarial review, finding by finding

Four lenses (the mutation-check delta, the proof-check delta, the scanner delta, and the claims in four documents plus the rest of the gate) over an immutable snapshot whose diff was exactly the change since Review 4, a skeptic per non-low finding. 10 confirmed (none high), 0 refuted, 14 low and not verified. The skeptics re-rated three of the ten to low (the anchors header, the pid-by-substring finding and the flag-write finding); none was refuted. Every fix has a clause that was red first, and every new or changed table entry was run through the harness (`--ids`: 135 of 135 caught, with a clean baseline).

| # | finding | disposition |
|---|---|---|
| 0 | the hooked-environment clause could not see the caller's git index replaced: narrowing the scrub to `GIT_DIR` and friends left 115/115 | fixed: the decoy has a commit and a staged file; the clause compares its HEAD, identity, bare-ness, staged files and `git status` before and after, with `GIT_WORK_TREE` and `GIT_OBJECT_DIRECTORY` exported too; three entries narrow the scrub three ways |
| 1 | the restart's exit-0 propagation is untested: `again.status \|\| 1` passed | fixed: E12 ends a restarted run green (the fixture's row fails while a write-up is a stub, so `outbox-stub` is caught) and asserts the parent's status 0; entry `restart-turns-green-into-red` |
| 2 | `--anchors` is documented as checking uniqueness and does not | fixed by making it true: an anchor that occurs twice is reported as AMBIGUOUS and fails the check; `harness-reads-the-clock-twice` was one (its two-space anchor was a substring of a four-space line above the one it meant) and is re-anchored |
| 3 | proof-check's git isolation has no clause | fixed: `scrubbedGitEnv` is a pure function with a clause, and the scratch repository is made under a hostile environment (a decoy's location, a home whose hook always fails); three entries |
| 4 | a heal after a failed restore had no test that could fail; the classifier's defaults hid it | fixed: the classifier takes no defaults, a stranded file is not intact in the test helper, and sandboxes heal a flagged injected target, a flagged probed registry and a sentinel-only target; entries for each alternative |
| 5 | a pid was identified by a substring, and an empty command line was called unreadable (kernel threads) | fixed: a node process with `proof-check.mjs` among its arguments is the run; an empty command is a command that is not one; the unidentified-pid advice no longer says to stop the process, it says how to mark the marker dead (`"pid": 0`) |
| 6 | the restoreFailed flag is written in the fault domain of the restore it records | fixed: a sentinel (`restore-pending`) is created BEFORE the restore, so a failure, a kill in the middle of it, or an unwritable marker is still remembered; when nothing can be recorded the message says so |
| 7 | the new `++`/`--` and dot rules had branches no clause defended | fixed: 15 more exact-output pairs (86 in all) and 11 more spellings of a clock read (24 in all), and an 88-mutant battery of the final scanner leaves 3 alive (two equivalent, one the dead network half); 26 entries |
| 8 | GATE-TIMING's base column was the wrong tree and its alarm threshold was half of what the table implied | fixed: re-measured for four trees at idle; the first round of figures had been taken at load 5.4 with five runaway processes from review copies running, and was about 50% high |
| 9 | the `}` claim was wrong in three documents | fixed |

Lows fixed here: the baseline's output limit (E21), the unguarded advice flag after a restore (assertions in the unit clause and E17, and an entry), the clause that failed under a long script path, a prefix `++`/`--` after a newline or a keyword, a `.` that ends `...` or a number, a window of nothing but whitespace read as the start of the text, `captures-greedy` (an input kills it; it was declared equivalent), the JSDoc and clause titles, the Status and count lines, the real-tree evidence row that predated the rebuild flag, the `#!` claim, the hook comments (the hook takes about 21 s, not seconds), the counts that did not reproduce, and the stale claim string. The rest are residual Task 10 (items 16 to 19).

One thing the review did not find and the guards did, after its fixes: `check:exit-drains` read 59 early exits against a budget of 60 ("the budget is not loose"). Investigated before anything was changed (Rule 77): the new scanner fixtures in `row-confidence.mjs` put quotes, backticks and slashes inside each other, and the guard's regular-expression stripper lost sync and blanked the self-test's `process.exit(summarize() ...)` line, so the count had dropped for the wrong reason. The budget was not lowered to match. The clauses now sit in a hoisted function at the end of the file, the count is 60 again, and the stripper's fragility is residual Task 10 item 19.

## Done conditions

1. Each task's artifact exists and each case was red before its change. (Met; the by-hand runs are in the session doc.)
2. `npm run gate` >= 95 with `PW_CHROMIUM` set (`lineups-render-check` needs it in this sandbox), on the tree of the commit. (See "Gate and commit".)
3. The Status of this document set to DONE, with the commit. (Set in the docs-only commit that records the hash and the CI runs.)

## Gate and commit

**Gate:** `PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run gate` on the final tree, 2026-11-04, 12:49 to 13:57 UTC: **23 of 23 rows, 530/530 = 100/100 (bar 95), 4,077 s** ("Gate passed — every row, not a passing average"), recorded as run `6a2e444b3880-d47e6f8651da` (tree dirty, as it is before the commit). The mutation row took 3,967 s of it. The first gate, on the tree of Review 3, had passed 22 of 23 (510/530); its one failing row is "The gate found one" above. The four files a gate run rewrites (`docs/confidence-log.jsonl`, `outbox/mutation-baseline-latest.json`, `outbox/metrics-tab-latest.png`, `outbox/lineups-render-manifest.json`) were discarded, not committed.

**Before the gate, on the same tree:** the three self-tests (118/118, 85/85, 15/15), `--anchors` (441 of 444, 0 stale, none ambiguous), 135 of 135 touched table entries through the harness, the 88-mutant scanner battery (85 caught, 3 known), the seven real-tree kill-and-heal checks and the real `proof-check` kill-and-heal, and every non-browser `check:*` guard (the one that failed, `check:exit-drains`, is under Review 5 above). **Not done:** a review of the Review 5 fixes themselves.

**Commit and CI:** commit `18a4165` on main, pushed 2026-11-04 13:59 UTC (rebased over four automated status and drift commits that touch none of its files). `verify` run 41843202008, `guards` run 41843201918 and `deploy` run 41844095135 all completed with success; the `status` workflow run that followed was skipped (why was not investigated). The scheduled `live-check` has not yet run on this commit and is not claimed. Not run: the runner-side timing of the new self-tests (residual Task 10 item 14), and a review of the Review 5 fixes.
