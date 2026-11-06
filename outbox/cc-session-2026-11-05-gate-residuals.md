# The gate's follow-up work: 98 commits, two adversarial reviews, four rounds of fixes

CC-CMD: `docs/CC-CMD-2026-11-03-gate-hazard-residuals.md` (BUILT; its "Disposition" section is the item-by-item record). What it left: `docs/CC-CMD-2026-11-06-gate-residuals-remaining.md` (FILED, with the trigger for every item).
Work: 2026-11-05 to 2026-11-06 (UTC). HEAD at the start: `4eceb98` (the gate-state-hazards close, `verify`, `guards` and `deploy` green on it). Owner's approvals: "follow ups approved" (2026-11-05), then three decisions taken from a question card, each the recommended option: (1) the seven `scripts/mutate-*.mjs` run on a copy of `scripts/`; (2) the gate and the pre-commit hook REFUSE a tree a killed mutation run left mutated, read-only, and name `node scripts/mutation-check.mjs --heal`; (3) the network half of the determinism scan is held to a flag-keyed exemption table, with the verify-full shard wait as the one sanctioned network read of a gate row.

## How it was done

1. **Probe.** Six workflow agents, one per group of items, each ran the command that could refute the item's premise (Rule 100) on a scratch copy and wrote a spec: premise evidence, design, clauses, entries, risk, cost, verdict. 29 items were buildable without a decision, 5 were not worth building, 3 needed the owner (the three above).
2. **Build.** Three streams in scratch clones of the repo (proof-check, harness, scanner and checkers), 31 commits; then the three decisions and two clean-source findings in three more clones, 8 commits. Independent streams were merged by cherry-pick into one tree. Every commit was made through the pre-commit hook (never `--no-verify`), every new clause was run red against the code without its fix, every new table entry was run through the harness and CAUGHT (Rule 90).
3. **Review 6**: eight lenses over an immutable snapshot (a single commit at `4eceb98` plus a working tree whose diff is exactly the 31 commits), 25 agents, a skeptic per medium-or-higher finding: 16 confirmed, 1 refuted, 21 low. **Review 7**: four lenses over the 8 later commits, 12 agents: 8 confirmed, 0 refuted, 15 low. The skeptics lowered the severity of 5 of the 8 findings of review 7 and of 5 of the 16 of review 6.
4. **Fixes.** Four rounds, each in clones of the merged tree and each fix agent told to reproduce the finding first (which replaced the skeptic pass for the later lenses): 23 commits (heal, lifecycle, proof-check), 13 (mutate-copy, network), 11 (scanner, checkers, `applyMutation`), 11 (the two integration regressions, `--stranded`, the probe messages).
5. **The whole table, once, on the result.** Before the local gate, all 1131 live entries were run in eight shards on the final code (`outbox/mutation-whole-table-2026-11-06.json`). It found one survivor that was the run's doing (no network, see "Verified") and, by timing one shard alone, that the gate's wait for the shards (40 minutes) was shorter than a shard (43 minutes): the 98th commit.
6. **Documentation, gate, push:** see "Gate and CI" at the end.

## What the reviews found that mattered

- Two table entries that had been CAUGHT at `4eceb98` SURVIVED on the first merged tree (`kill-hook-does-not-yield`: a later commit made the 400 ms yield unobservable to the clause; `proof-main-flow-registry-always-intact`: a later commit left no clause on the main-flow wiring, and the mutant discards the only whole copy of a registry). Either would have failed the gate's mutation row about two hours into the single gate run. Both are fixed with clauses that fail on purpose.
- A registry probe could be left in `src/Desk.fs`, with the state deleted and the message saying "left exactly as found", when an edit separated the probe from the union's last case. The state is now kept, the message is true, the next run refuses, and `check:clean-source` sees the same state.
- `applyMutation` passed the replacement to `String.prototype.replace` as a string, so a dollar sequence in an entry was expanded: `lineups-two-prefix-characters-unread` was applied as 16,106 extra characters and caught only because the file stopped parsing. (The same bug bit this session's own documentation edit script once: a replacement holding a dollar sequence duplicated the tail of the file before anything was written, and the script's anchor check refused it. It is why the later edits used a replacer function.)
- A parent harness run ended green (exit 0) while a killed child's mutation sat in `nested/`; it now fails and names the child and the heal.
- `mutate-*` scripts failed for the wrong reason under a symlinked `TMPDIR` (the macOS default): six of seven printed NOT CAUGHT for every mutation and the positive control passed without running anything.
- The unchecked premise of the network exemption: an exempt script could gain an unconditional `fetch` and every row stayed 100. `check:network-exempt` now runs each exempt row command under a preload that closes the network.

## Incidents during the session (facts, for the next reader)

- **The disk filled** (154 MB free of the per-session allowance) at about 23:40 UTC on 2026-11-05, from scratch clones and review copies (about 25 GB under the scratchpad). One agent's commit failed once with `ENOSPC` and was re-made unchanged. Old review directories and finished clones were deleted to get back to 9 GB free (that cleanup also removed a scratch rig an agent was still using; it rebuilt it). Keep clones to the ones in use.
- **The container restarted** at 00:55 UTC on 2026-11-06 and killed one workflow mid-work. A harness run inside it had been killed with a mutation applied to `scripts/mutation-check.mjs`. The hashes in its marker matched the backup and the mutated file exactly, and the harness's own `--heal` restored the file and removed the state. That is the first time the heal was used on a real kill and it did what it says.
- **Fable's project cache holds absolute paths.** Copies made with `cp -a` of a tree that had been built elsewhere fail `dotnet fable watch` with "'//' is not a common base directory" until `build/fable_modules/project_cracked.json` (and the one under `public/build/`) is deleted. A fresh checkout is not affected. The whole-table run's clones needed it.
- **Raw U+2028 in tool input.** A ` ` typed into a command or a commit message reached Python and git as the raw character; one landed in a regular expression and one in a commit message and note, both fixed before landing. All changed files and all 97 messages were checked for raw U+2028 and U+2029 (0 found).


## The 98 commits

Named by subject: a hash does not survive the rebase onto the bot commits that `origin/main` gained meanwhile (21 of them, `STATUS.md` and `outbox/` only), a subject does. The hashes that landed are in "Gate and CI" below. Every commit carries its own note in `outbox/` (82 files; `check:staged-outbox` requires one with any commit that stages `scripts/` or `src/`).
### Build: proof-check, harness lifecycle and heal, scanner and checkers, clean-source (three streams, 31 commits)

1. fix: proof-check creates its run marker exclusively, so two runs started together cannot both proceed
2. fix: proof-check asks each file whether it is torn before it heals, so a stranded file cannot delete the only whole copy of the other
3. fix: proof-check writes a file only when it is provably this run's own, so an edit made during a run is no longer lost
4. fix: proof-check registers no signal handler, so a kill, Ctrl-C or a hangup stops the run at once and the next run heals
5. test: the system git configuration is asked of git itself, so a variable name wrong in code and clause together cannot pass
6. fix: a harness killed with SIGKILL no longer leaves its build watcher running, and the next run stops it
7. fix: an expectation ended by a signal is no longer counted as a caught mutation, and a plain kill is acted on while the harness runs synchronous work
8. test: a kill between a world mutation running and its marker naming the paths it touched can now be placed, and what the next run does is pinned
9. fix: a self-test that crashes no longer leaves its two temp directories behind
10. fix: the self-test reads the ET day once, so a midnight between its two reads no longer turns 16 clauses red
11. fix: a heal over a marker that records no touched path no longer runs its restore command blind
12. fix: clearing a parent harness run's state no longer deletes the marker a killed child run left in it
13. fix: a state directory that holds files the harness did not write is refused, not emptied
14. fix: the harness's HEAD-moved refusal no longer calls a path that matches HEAD "neither as it was nor as the mutation left it"
15. test: the harness's refusal messages are now asserted where they said nothing: the six-path list and its count, "changed after the kill", and the kill advice in both live-run refusals
16. test: the real-stranded-state clause now uses a state a heal could undo, so "healed and refused" can no longer pass for "touched nothing"
17. test: the race refusal in the main flow and the torn run lock are now asserted, with a fault hook that puts a rival's lock where the race happens
18. test: the clock scan is checked by bracket balance over the scripts a row names, and its harness clause stands on the property, not the count
19. fix: pickem-check reads the FIELD day once, so revealing template text in the clock scan will not drop its row
20. test: the clock scan reads the expressions inside template literals as code, and a slash that begins one begins a regular expression
21. test: a clock capture in the determinism scan must BE the read, not a function or a later statement that holds one
22. test: the clock scan counts new Date with no parentheses, Date.now as a value, Date['now'](), and a Date that is passed on
23. test: the clock scan reads a slash after an if, while, for or with header as a regular expression, and a slash after a division sign too
24. test: the clock scan ends a line at a carriage return, U+2028 and U+2029, continues a string over a backslash and CR LF, and reads a regular expression after instanceof, extends and default
25. test: the clock scan does not read a private name, an identifier named of, or a name with a keyword after a non-ASCII letter as the keyword
26. test: the clock scan moves to scripts/strip-non-code.mjs, unchanged, so check-exit-drains can share it
27. fix: check-exit-drains blanks with the shared scanner, so three early exits it could not see are counted and the budget is 63
28. fix: short-circuit-check blanks comments with the shared scanner, so a /* in a string or a line comment no longer hides the lines after it
29. fix: check-script-orphans blanks comments with the shared scanner, so edges after a /* in a string are kept and a comment after code is not an edge
30. fix: check-lineups-pull-only reads F# comments with a scanner, so a // or (* inside a string no longer hides a timer after it
31. fix: clean-source-check names the heal or the lines, not a checkout that discards uncommitted edits

### Build: the three owner decisions and two clean-source findings (8 commits)

32. fix: the seven mutate-*.mjs break a copy of scripts/ and never write the tracked file
33. test: 37 table entries prove the mutate-copy check and the seven converted scripts
34. fix: mutate-push-lands.py breaks a copy of check-push-lands.py and the check holds it to that
35. fix: proof-check's no-state refusal tells a person to delete the lines, not to check the file out
36. fix: clean-source-check sees a stranded registry probe, and tells a reader which lines to delete for each kind
37. fix: mutation-check --stranded, a read-only mode that refuses a tree a killed run left mutated
38. fix: the pre-commit hook and the gate refuse a tree a killed mutation run left mutated
39. fix: the determinism scan's network half can fire, and the three row scripts that reach the network are held to a flag-keyed exemption table

### Fix round 1, from the first four lenses of review 6: heal, lifecycle, proof-check (23 commits)

40. fix: a harness run that owns a killed child's mutation fails instead of ending green over it
41. fix: the refusal over a path changed after the kill no longer ends by telling a person to put the stash back first
42. test: the HEAD-moved advice, the guard's remedy and an existing empty state directory are asserted
43. test: the guard's name list and two numbers, the nested heal order and the seventh path are asserted
44. fix: a state directory that holds only a source mutation's backup is used, and `--heal` is not refused over it
45. fix: E15's fault asks `date` for seconds, which every date answers, and a clause runs it where date is not GNU's
46. fix: the self-test removes its state directory on a crash from the line that makes it, not from after the scratch directory
47. fix: a command the harness ends for printing past its output limit is a failed command, not an external kill
48. fix: a test hook that is set announces itself on stderr before the run starts
49. test: the exit and signal handler's stop of the build watcher is asserted for SIGTERM, SIGINT and SIGHUP
50. fix: WatchBuild stops the watcher's process group, and its real stop() is under test
51. test: the reaper's already-gone branch, its TERM and KILL waits, and a rebuild that fails after a reap are asserted
52. test: the refusal's seventh path, the edges of the status window, and the state-directory guard's bounds are asserted
53. test: recordDriver is given a pid that is not the harness's own, so a record that ignored its argument is red
54. test: run() clears the signal of the command before it, and a pass after a kill leaves none behind
55. fix: proof-check keeps the state, and says the probe is still in the file, when an edit separates the probe from the union's last case
56. fix: clean-source-check sees a registry probe an edit has separated from the union's last case
57. fix: proof-check asks a file about its anchor only when the file is not its own backup, so a whole file with no anchor no longer blocks the heal of the stranded one beside it
58. test: four proof-check assertions that could not fail now can: the prefix rule of ours, the non-EEXIST marker create, the four-space proof body, and what inject throws
59. fix: a run that loses the proof-check marker writes nothing into the state directory, a link at the marker's path is called a link, and the comment says what the exclusive create does not guarantee
60. test: proof-check's heal of two stranded files is exercised, so breaking either write can no longer pass
61. test: how a pid is told to be a proof-check is tested against the real /proc, and the two lookalikes its anchors exist for are tried
62. test: clean-source-check's run-state clause forbids any git command, not the one spelling it named

### Fix round 2: the mutate-copy and network findings of review 7 (13 commits)

63. fix: the mutate scripts work with a symlinked TMPDIR and their positive control needs a run, not an exit status
64. test: mutate-copy-check asserts that each mutate script removes its temporary copy when it ends
65. test: two surviving mutants of mutate-copy-check.mjs are killed by stand-ins
66. fix: the mutate-copy guards refuse to move or remove the scripts/ directory itself, not only a path under it
67. fix: the coverage mutate-copy-check prints is a list its self-test proves, and what it says about cpSync is a dated measurement
68. fix: mutate-copy-check derives the scripts it checks from scripts/mutate-*, so a ninth in-place script cannot pass
69. fix: the scorer reads the scripts a row runs from its code, not from its comments
70. fix: whether a row passes the exempt flag is read from the whole command and the whole row
71. fix: the network scan does not count a declaration of fetch or an assignment to it as use
72. test: pin the network detector's guards from both sides, and the spaced spellings its patterns allow
73. test: the network detector's NOT COVERED list says what it misses, and each spelling in it is pinned
74. test: sharded-row-check reads verify-full.yml for GATE_MUTATION_SHARDS, so the sanction's workflow half is checked
75. fix: the network exemptions are run, not only read: a check under a preload that closes the network, wired into verify

### Fix round 2: the scanner, checker and table findings of review 6 (11 commits)

76. fix: applyMutation applies an entry's replace as written, so a dollar sequence in it is no longer expanded
77. fix: the scanner's header rule reads its keyword as every other keyword is read, so a call that only looks like a header no longer turns a division into a regular expression
78. fix: the scanner reads a slash after a spread and after the of of a for-of header as a regular expression
79. fix: a block comment that holds a line terminator is a line feed in the scanner's stripped text, so a ++ after it is a prefix
80. fix: a capture's own line ends at a carriage return, U+2028 and U+2029 as it does at a line feed
81. fix: the clock-read pattern no longer counts a name that merely ends in Date or fieldDay, and no longer misses f(...Date)
82. fix: the clock-read pattern counts any computed member of Date, the global reached through an object, and new Date with a spread
83. test: pin the two scanner branches no clause defended, an empty block comment and blankComments' regular expressions
84. fix: the harness clause puts its bare clock read at every place a lost scan could hide it, not at one place three quarters down the file
85. fix: a script the scan cannot finish drops its row with a message that names the limit, and the scanner's cost is documented with a measurement
86. fix: the lineups guard's F# scan reads a double-backtick identifier as text, so a (* or a // in one no longer hides a timer after it

### Fix round 3: the integration regressions of review 6, the --stranded and probe-message findings of review 7 (11 commits)

87. test: proof-check's registry has a clause for "moved on but still has its last case" after a failed restore
88. fix: clean-source's checkout sentence is plural for an injection in two files, and the hook comment quotes no timing
89. fix: the printed git checkout says it changes nothing once the injection is staged, which is the state the pre-commit hook sees
90. fix: the greps the probe remedies print find the line on a tree with CRLF line ends
91. fix: the injected block's instruction gives its real extent, so deleting it restores the file
92. fix: a union that really ends in NHL is told how to get past the probe scan, and the scan no longer claims proof-check refuses
93. test: the E18 kill-hook yield is observed again: a SIGTERM at source-applied must be handled before the expectation runs
94. fix: --stranded reads the build driver's record, so a watcher a dead run left running is refused and named
95. fix: --stranded says which state the marker is in and what --heal will do with it, instead of "left applied ... Heal it first" for every marker
96. fix: the gate preflight's comment no longer claims it finds the check from another directory
97. test: seven mutants of the new --stranded and preflight code that survived the self-test now fail a clause each

### Found by running the whole table on the result (1 commit)

98. fix: the gate's wait for the mutation shards outlasts the longest a shard job may run


## Counts, before and after

Idle timings: the 4-core dev container, load average 0.35 to 0.7 at the start of each run, two repetitions interleaved (base, final, base, final), 2026-11-06. `4eceb98` was exported with `git archive` and run beside the final tree. Where the two repetitions differ the table gives both.

| | `4eceb98` | final (`b9f8997`) |
|---|---|---|
| table entries (anchors the check could read) | 444 (441) | 1132 (1129) |
| of them eligible for a live run (the rest are `selfTestOnly`, expected to survive) | 443 | 1131 |
| `mutation-check.mjs --self-test` | 118 clauses, 13.7 s and 12.8 s | 213 clauses, 30.8 s and 27.8 s |
| `proof-check.mjs --self-test` | 85 clauses, 5.7 s and 5.4 s | 127 clauses, 10.1 s and 9.8 s |
| `mutation-lib.mjs --self-test` | 81 clauses, 27.7 s and 27.5 s | 81 clauses, 27.5 s and 27.1 s |
| `row-confidence.mjs --self-test` | 15 clauses, 0.1 s | 30 clauses, 1.0 s and 1.1 s |
| `clean-source-check.mjs --self-test` | 3 clauses, under 0.1 s | 25 clauses, 1.0 s and 1.1 s |
| `check-exit-drains.mjs --self-test` | 18 clauses, 0.1 s | 22 clauses, 0.6 s |
| `npm run check:mutate-copy` (new) | none | 11.2 s and 10.8 s |
| `npm run check:network-exempt` (new) | none | 3.9 s and 4.2 s |

Entries by what they run (final, from the eight shard records): the `mutation-check` self-test 246 (94 at `4eceb98`), the `proof-check` self-test 142 (62), the `row-confidence` self-test 251 (50), the `mutate-copy-check` self-test 66 and 46 more entries on its other forms (none), the `clean-source-check` self-test 48 (none), `network-exempt-check` 39 (none), `node build/VerifyMain.js` 74 (74). Kinds of entry: 965 `script`, 161 `src`, 3 `world`, 2 `html`.

Serial self-test work in the mutation row, from the means above: 246 x 29.3 s + 142 x 9.95 s + 251 x 1.05 s + 48 x 1.05 s = 8,935 s, plus the 66 `mutate-copy-check` and 39 `network-exempt-check` entries and the 74 `VerifyMain` entries, against about 27 minutes at `4eceb98` (94 x 13.3 s + 62 x 5.55 s + 50 x 0.1 s = 1,599 s). The figure that matters is the slowest of the eight CI shards, which is not known until the first run (see "Not verified" below).

## Verified, and by what

Each line names the command or file that shows it.

1. **No commit bypassed the hook.** `git log --format=%B 4eceb98..HEAD | grep -c -i no-verify` prints 0; all 98 messages carry both trailers; a scan of all 98 messages for the commit-skip directives (the bracketed forms and `skip-checks:`) finds 0.
2. **Every table entry that exists was run on the final code.** `outbox/mutation-whole-table-2026-11-06.json`: 1131 of the table's 1132 entries ran (the one not run is `selfTestOnly`, which is expected to survive and is exercised by the harness self-test), in eight shards of `--shard i/8`, on the code of the final tree before the documentation commit. First run: 1130 CAUGHT, 1 SURVIVED. The survivor is `pin-goes-quiet`, and the cause is the run, not the code: each clone ran in a private network namespace with loopback only, `scripts/check-adhd-pin-reports.mjs` reaches the skill's source on the network, and with none it reports "unreachable ... an unmeasured run" and passes. Shown two ways: `node scripts/mutation-check.mjs --ids pin-goes-quiet` with the network open, CAUGHT; and shard 8 run again alone with the network open, recorded in the same file. The entry predates this work (it is filed as C10 in the second CC-CMD).
3. **The cheap checks on the tree of the 98th commit with the documentation staged** (the local gate repeats them): `--anchors` 1137 of 1140, 0 stale; `mutation-check` self-test 213/213; `mutation-lib` 81/81; `proof-check` 127/127; `row-confidence` 30/30 and 23 of 23 rows at or above 95; `sharded-row-check` 18/18; `mutation-await` 27/27; `check:mutate-copy` 58/58 and `check:network-exempt` 5/5; and the other `check:*` scripts of the battery (exit-drains, import-purity, script-orphans, unused, clean-source, citations with a budget of 0, short-circuit, harness, mutation-parts, docs, workflows, outbox-row, gate-rows, staged-verifier, history, boundary, setup-script, unnamed, prose). All exit 0.
4. **The heal worked on a real kill.** At 00:55 UTC on 2026-11-06 the container restarted with a harness run in progress and left a mutation applied to `scripts/mutation-check.mjs`. `node scripts/mutation-check.mjs --heal` read the marker, matched the hashes of the file and its backup, restored the file and removed the state. This is the first real use of the heal and it did what its message says.
5. **Review coverage.** Review 6 read the first 31 commits through eight lenses and review 7 read the 8 commits after them through four. The 23 + 13 + 11 + 11 commits that fixed their findings were not read by a third review; each was made by an agent told to reproduce the finding first and was put through the hook, the table and the cheap checks above. That is a smaller guarantee than the first two rounds had, and the Rule 59 reader should treat those 58 commits as the ones to audit first.

## Not verified (Rule 74)

- **What the mutation row costs on a CI runner (item 10.14): measured after this was written.** It was blocked by no runner having run this tree; `verify-full` run 42200547950 has now, and "Gate and CI", item 5, gives the numbers (this bullet as committed named a wait of 80 polls of 30 s; the 98th commit, which precedes it, had raised that to 200).
- **Whether the stability of the self-tests under a loaded machine holds on a runner: seen once, not shown.** Each self-test starts real subprocesses and kills some of them on a timer. Here they were run with all four CPUs busy (see "Gate and CI"). On the runner the eight shard jobs, which run those self-tests as the expectation of 780 table entries, and the `verify` job all ended successful in one run; that is one run, not a measure of how often one flakes.

## Known inaccuracies in the committed notes

The 82 notes were written by the agents that made the commits and were not edited afterwards. I read them for the claims named here (by `grep` and by reading the commits' own tests), not line by line, so this list is the inaccuracies that are known, and says nothing about the rest.

- `docs/CC-CMD-2026-11-03-gate-hazard-residuals.md` item 19 said the early-exit budget "stays 60, which is the true count". It is 63, and was 63 (recorded as 61 against a true 64) from the day the budget file was created. `outbox/cc-followups-scanner-stream.md` says so; the Disposition table and "Corrections to the text above" in that CC-CMD carry it.
- The subject of the first commit (`proof-check creates its run marker exclusively, so two runs started together cannot both proceed`) says more than the code guarantees over a stale marker: the stale and heal branches remove the state directory before the exclusive create. Filed as D1.
- The commit that held the network half of the scan to a flag-keyed exemption table ("the determinism scan's network half can fire, and the three row scripts that reach the network are held to a flag-keyed exemption table") reads as if the exemptions were checked. The table was read by the scorer and never compared with what the scripts do; `scripts/network-exempt-check.mjs` records that its premise had been checked once, by hand, with stand-ins, and review 7 found it unchecked. The commit "the network exemptions are run, not only read" is what checks it.
- The CC-CMD's figures for the quadratic cost of the scanner (item 4) were an order of magnitude too low; the corrected figures are in the second CC-CMD, row C2, and in the commit "a script the scan cannot finish drops its row with a message that names the limit, and the scanner's cost is documented with a measurement".
- Notes record the clause counts of their own commit. The counts in "Counts, before and after" above are the final ones.

## Gate and CI

1. **The whole table:** under "Verified", item 2, and `outbox/mutation-whole-table-2026-11-06.json`.
2. **The self-tests on a loaded machine.** With four busy loops holding all four CPUs, seven self-tests ran twice each in series: 14 runs, 14 exits of 0, every clause passing (`outbox/self-tests-under-load-2026-11-06.txt`). `mutation-check` 213/213 in 48.7 s and 49.7 s (29.3 s at idle: 1.7 times), `proof-check` 127/127 in 19.0 s and 19.3 s (9.95 s: 1.9 times), `mutate-copy-check` 26/26 in 7.5 s and 7.6 s, `row-confidence` 30/30, `clean-source-check` 25/25, `sharded-row-check` 18/18, `mutation-await` 27/27. Two repetitions of each is a smaller sample than the gate will take: the mutation row runs `mutation-check`'s self-test 246 times, once per entry, and once more for the baseline. The whole-table run above is the larger sample under load: four clones at once on four cores, and every shard's baseline (each distinct expectation on the unmutated tree) passed (0 failing in all eight).
3. **The idle timings** that `docs/GATE-TIMING.md` and "Counts" use: `outbox/self-test-idle-timing-2026-11-06.txt`.
4. **The shard wait** (the 98th commit): `outbox/cc-session-2026-11-06-shard-wait.md`.
5. **The local gate, the push and CI** (all run on 2026-11-06; this item is what the commit whose subject begins "docs: the gate-residuals session's gate result" adds).
   - **The local gate** on the tree of `2795b53`, from the real checkout, with `PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome` and no edit to the repository during the run: 04:29:35Z to 09:55:52Z, **530 of 530 points, 100/100 against a bar of 95, all 23 rows PASS**, 19,575 s, of which the mutation row was 19,453 s (it ran the whole table in one process; the per-entry times recorded by the pre-gate shard run predicted 19,092 s, and it took 1.9% more). Output, verbatim: `outbox/gate-local-2026-11-06.txt`. The four files the gate rewrites were discarded afterwards, as always, so its ledger line (`2795b539d5f4-be82ff9881c7`, "tree dirty") is not in the history.
   - **After the gate:** `git pull --rebase origin main` put the 99 commits over 28 bot commits (no file in common). The rebased tree differs from the gated one by those commits' seven files only (`STATUS.md`, `outbox/INDEX.md`, `outbox/axis-manifest-latest.json`, `outbox/drift-log.md`, `outbox/forecast-dry-run-latest.json`, `outbox/odds-coverage-series.json` and `outbox/sport-vocabulary-2026-11-05T19-47-27-352Z.json`), so the cheap-check battery was run on it: 28 checks, all exit 0 (`outbox/post-rebase-battery-2026-11-06.txt`). That battery is not a second gate and is not claimed as one.
   - **The identity:** a Stop hook reported that the 99 commits' committer email was `claude@field.dev` and that GitHub would show them as Unverified, and asked for `noreply@anthropic.com`. They were rewritten, author and committer, with `git filter-branch --env-filter`. A `rebase --exec` amend was started first and abandoned at 6 of 99: each amend ran the pre-commit hook (about 35 s), 99 of them would have taken about an hour, and it was aborted with `git rebase --abort`, after which `HEAD` and the tree hash were the ones from before. After the rewrite the author dates, commit dates and subjects of all 99 are identical to before, the tree hash is the same, and no script or hook reads the author (grep of `scripts/` and `.githooks/`; the only hits are test fixtures). The rewrite is why the pushed hashes are not the ones the rebase made.
   - **The push:** `44c3ab7..ff9c83a` to `main`. CI on `ff9c83a`: `verify` 42199582290 success (5 min 26 s); `guards` 42199582323 success; `deploy` 42200302373 success; `live-check` 42200389206 success; `status` 42200302295 skipped, which is by design (it runs after `verify` only when `verify` fails, per `status.yml`).
   - **`verify-full`** (item 10.14): run 42200547950 on `main` at `1f05aa4` (the pushed commit plus two bot commits), success; the numbers, with their sources, are in `outbox/verify-full-runner-timing-2026-11-06.md` and `docs/GATE-TIMING.md`. In short: the gate scored 530/530 on the runner in 2,705 s; the slowest shard job took 46 min 07 s, of which 581 s was a slow package mirror during the Chromium install; 342 job-minutes in all, as estimated; `timeout-minutes` and the wait stay as they are.
   - **A red that is not from this work:** the scheduled `drift-sentinel` run 42185163882 (08:05Z, on `3358979`, before the push) failed at "Did the filed CC-CMDs land?" with `REGRESSED CC-CMD-2026-08-21-closing-odds-capture (surviving ask)`. This session's commits touch neither the step nor `scripts/cc-cmd-followup.mjs` (0 files). It is a reading of the relay's data on one date and was not investigated; the facts, and what is not known, are appended to `docs/CC-CMD-2026-08-21-closing-odds-capture.md` under BUILD-ON-A.
