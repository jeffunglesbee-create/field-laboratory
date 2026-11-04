# Claude Code Command — hazards the gate-state-hazards work found and did not touch

**Branch:** main — commit directly, do not create a feature branch or PR
**Repo:** field-laboratory
**Filed:** 2026-11-03, by CC, as the follow-up `docs/CC-CMD-2026-11-03-gate-state-hazards.md` names (Rule 87.4: out-of-scope work gets its own CC-CMD before the first closes)
**Confidence gate:** `npm run gate` >= 95 before any commit that lands. Tasks 1, 3 and 6 to 10 change gate infrastructure (`scripts/mutation-check.mjs`, `scripts/mutation-lib.mjs`, `scripts/clean-source-check.mjs`, `scripts/proof-check.mjs`, `scripts/row-confidence.mjs`, `scripts/pickem-check.mjs`) beyond what the owner approved ("Gate hazards approved" covered the four tasks of that CC-CMD).
**Status:** FILED 2026-11-03, extended 2026-11-04 with Tasks 4 to 8 from the third review of the gate-state-hazards change, Task 9 from the gate run that followed it, and Task 10 from the fourth and fifth reviews. Nothing here is built; it waits for an instruction. (Some items were narrowed or closed by those reviews' fixes; each says so where it does.)

---

## Related, read before building (BUILD-ON-A)

Searched 2026-11-03 by content (`fable watch`, `orphan`, `mutbak`, `mutate-`) in `docs/CC-CMD-*.md`. Only one document touches the watcher.

- `docs/CC-CMD-2026-11-03-gate-state-hazards.md` (DONE): the state, marker and heal design Task 1 below extends. Nothing it ruled is undone here.
- `docs/CC-CMD-2026-11-03-gate-speed.md` (DONE) built the watch driver Task 1 concerns (`mutation-check.mjs --build watch`, the default). Its rulings stand: the build is made clean before every mutation and its digest is checked.

## What was found (Rule 73)

All three measured on 2026-11-03, in this checkout, on the tree of the gate-state-hazards change.

1. **A SIGKILLed harness leaves `dotnet fable watch` running.** `MUTATION_KILL_AT=source-applied node scripts/mutation-check.mjs --only draw`, killed by the hook; 15 seconds later `ps` showed `dotnet fable watch src/Laboratory.fsproj -c Release --outDir build` with parent pid 1, and its `fable.dll watch` child. I killed both by hand. The heal in the next run then restored `src/Pickem.fs` and rebuilt. What the next run does if the orphan is still alive when it starts its own driver on the same `build/` is **not measured**: the heal ran after I had killed the orphan.
2. **Six of the seven `scripts/mutate-*.mjs` hold the original in memory only.** `grep -n "process.on"` over the seven returns nothing; `mutate-claim-check`, `mutate-deploy-gate`, `mutate-deploy-landed`, `mutate-odds-coverage`, `mutate-odds-shape-census` and `mutate-run-steps` read the file, write the mutation, and write the original back with no backup on disk and no signal handler. `mutate-replay-odds-coverage` copies the file to `<file>.mutbak` first and copies it back at the end of the run (and when its positive control fails), with no signal handler either; nothing reads that backup on the next start. A kill between the writes leaves a mutated tracked file, and nothing that says so but a `.mutbak` beside it in one case. A review agent of 2026-11-03 reported that running `mutate-replay-odds-coverage` again over that stranded file copies the mutated file over the backup and then deletes it, so the original is gone; I did not re-run that demonstration. Not measured: what runs these scripts, or whether the gate does.
3. **`clean-source-check.mjs` recommends `git checkout -- <files>` for a file that carries injected proof code.** That also discards every uncommitted edit to the file. `proof-check.mjs` now restores exactly the file that still carries its own injection and nothing else, and its refusal no longer recommends the checkout; this message still does.

### Added 2026-11-04: what the third review found that the change did not fix

A third adversarial review of the change (five lenses over an immutable snapshot, a skeptic per finding; 27 findings confirmed, 20 low and not verified, 1 refuted) confirmed what is fixed in `docs/CC-CMD-2026-11-03-gate-state-hazards.md` ("Review 3") and left these. Each was demonstrated by the reviewer in a scratch copy; I did not re-run them unless a line says so. Pre-existing means the base commit has the same behaviour.

4. **proof-check puts both files back from memory at the end of every phase, whatever is on disk** (medium, pre-existing). A stand-in `dotnet` that appended a line to `src/Scoreboard.fs` while phase 2 ran saw it gone after the run. The gate's own rule is "no repo edits during a gate run", which is why this was not fixed here: the alternative (write only a file that is provably this script's injection) leaves a half-written injection after a full disk, which the blind write repairs today.
5. **proof-check's marker is not created exclusively** (low). Two runs started within a few milliseconds both proceed (0 ms gap: 4 of 10 trials; 5 ms and wider: 0 of 10). `writeFileSync(..., { flag: 'wx' })` and a re-classification on `EEXIST` closes it. Not reachable at human timescales.
6. **proof-check's torn-file guard covers only the target, and only when the registry is not stranded** (low). A target cut off before the anchor plus a registry carrying the run's probe is classified `heal`: the registry is restored and the state, which holds the only whole copy of the target, is deleted. `anchored` should be an input per file, checked before the `heal` return. **Narrowed 2026-11-04 (review 4):** a run whose own restore failed now records that in its marker, and the next run keeps the state when either file is not its backup and not provably an injection (`restoreFailed` in `classifyState`). What is left is a torn file that no failed restore of ours explains (a kill part-way through a write that was not ours).
7. **proof-check's SIGINT/SIGTERM/SIGHUP handlers cannot run until the whole run is over** (low, pre-existing). The script is one synchronous module with no `await`, so a plain `kill` is not acted on at all while it runs (measured in review 4, 2026-11-04: SIGTERM sent mid-run, seven builds still ran and the handler never did; the earlier wording here, "not delivered until the build ends", understated it) and Ctrl-C reaches only the `dotnet` child. The refusal text says `kill -9` and the comments say why; the handlers are untouched. Either remove them (the next run heals) or run the builds with an async `spawn`.
8. **Smaller items in the harness** (the clock-scan item is closed by the scanner described under Task 9), each reproduced by the reviewer: the stale-lock takeover is not atomic (two runs starting within microseconds over one stale `run.json` can both take it); the parent's `clearActive()` deletes a nested child's stranded marker; `MUTATION_STATE_DIR` pointing at an existing non-empty directory is emptied and removed; `planHeal` reads a marker with `touched: {}` as `restore` and runs the restore command blind; E3 to E6 and E8 of the self-test read the ET day once and the mutation reads it again, so they go red if the self-test straddles midnight ET; `row-confidence.mjs`'s old clock scan did not see about a third of `mutation-check.mjs` (fixed 2026-11-04, below, and what remains of it is Task 9); the `(asserted: …)` labels exist only in `proof-check.mjs`'s clauses; the gate row and the pre-commit hook do not run `--heal` first (the self-test now names a stranded state and the command, but a person runs it; the row's text is mirrored in `.github/workflows/verify.yml` and asserted by `sharded-row-check.mjs`).

## Task 1 — the harness records its watcher and the next run deals with it

Probe first: run `ps` as in finding 1 to see the orphan, then the next `mutation-check.mjs` run with the orphan alive and read what the driver does. Then: the marker records the driver's pid and start time (`run-marker.mjs` exists for this), and the heal stops a driver whose recorded run is dead before it starts its own. Artifact: a self-test case that starts the real script with the stand-in `dotnet` shim used in `proof-check.mjs --self-test`, kills it, and requires no process of the shim left, plus a mutation for it that goes red.

## Task 2 — the `mutate-*.mjs` scripts stop leaving a mutated file with no record

For each of the seven: either it is covered by a table entry in `mutation-check.mjs` and is deleted, or it uses the harness's marker and state directory. Probe first: what runs each (`grep -rn "mutate-" .github package.json scripts docs`). Artifact: for each kept script, a real SIGKILL between the writes that the next run heals, as in `mutation-check.mjs --self-test` group E.

## Task 3 — the clean-source remedy names the heal, not a checkout

Change the failure detail to say `node scripts/proof-check.mjs` restores the injection it can prove is its own and refuses otherwise, and to name the backup directory. Artifact: the detail text asserted in `clean-source-check.mjs`'s own self-test (it has none; add the case) and a mutation that restores the old text.

## Task 4 — proof-check restores a file only if it is provably its own injection, and says when it is not

Probe first: the stand-in `dotnet` in `proof-check.mjs --self-test` (`twoPhase`) extended to append a line to the file that is not injected during the phase. Then: `restoreFiles` writes a file only when it equals the source or `strandedTarget` / `strandedRegistry` says it is the injection, and a full-disk half-write is handled by the same predicates (a truncated injection is a prefix of one). Artifact: the stand-in's appended line survives the run, and a mutation that restores the blind write goes red.

## Task 5 — proof-check's marker is created exclusively

`wx` on the marker, a re-classification on `EEXIST`. Artifact: two runs started in the same tick (the 0 ms case above) never both reach their baseline; a mutation that drops the flag goes red.

## Task 6 — proof-check's torn-file guard covers both files

`anchored` per file, checked before the `heal` outcome. Artifact: target cut off plus registry stranded gives `diverged`, state kept; a mutation that restores the old order goes red.

## Task 7 — proof-check can be stopped

Remove the handlers or run the builds asynchronously, so a plain `kill` and Ctrl-C stop the run and the next one heals. Artifact: `kill -TERM` of the real script mid-build exits within a second and the next run prints HEALED.

## Task 8 — the smaller harness items

One commit each, as listed under finding 8. `--heal` first in the gate row means changing `gate-checks.mjs`, the mirrored text in `verify.yml` and `sharded-row-check.mjs` together.

## Task 9 — what the determinism scan still cannot see

The scan under the gate row "every gate row has teeth and is deterministic" (`row-confidence.mjs`) was three regular-expression passes. On 2026-11-04 the gate's mutation row failed on `harness-reads-the-clock-twice`: the comment pass cut a line at a `//` inside a string (`'http://…'`, `"URL='http://…' node …"`) and took the closing quote with it, so every quote after the first such line (line 111 of `mutation-check.mjs` as committed, in its table; measured by listing the quote pairs that span more than six lines) paired with the wrong one, and the file's code and strings traded places. The scan had held up by parity; 41 added table entries flipped it, and the baseline-writing line fell inside a region it read as a string. Measured 2026-11-04 on this tree: the old scan saw 1 clock read and 1 capture in the harness both as it is and with the mutation applied; the true counts are 2 reads and 2 captures, and 3 and 2. It is now a character-level scanner (`stripNonCode`, one clause per branch of it and 12 `row-scan-*` mutation entries), and over all 168 scripts it counts the same clock reads as acorn's tokenizer does (a one-off comparison through `node --expose-internals`, not a test in the repo). Four things it does not do:

1. **A template literal's contents are hidden, as before.** `scripts/pickem-check.mjs` has `new Date(\`${fieldDay()}T12:00:00Z\`)`, a clock read inside a template; revealing templates flags it (measured: 22 of 23 rows at or above 95, the row "pick'em grades only finished games" below). Fix the script (capture the day once at the top) and then reveal templates in the scanner. Probe first: `grep -rn 'fieldDay()\|new Date()' scripts/*.mjs` inside `${…}`.
2. **The network half cannot fire.** It looks for `https://` in the text left after comments and strings are removed, and a URL is always in a string or a comment. Measured over all 168 scripts: no script flagged under any variant of the scan. A row that reached the network would score as deterministic. Fix: look for network use as calls (`fetch(`, `http.request`, `new WebSocket(`) in code, and for URLs in the strings that are arguments to them.
3. **A `/` after `)` or `]` is read as division.** Wrong for `if (x) /re/.test(y)`; the repo does not use that shape. (A `/` after `}` is read as the start of a regular expression, which is right after a block and wrong after an object literal, `{a: 1} / 2`; the first version of this item said `}` divided, which is the opposite of what the code does.)
4. **Nothing tests the scan on the other scripts a row reaches**, only on the harness and on snippets. A script whose clock read the scan cannot see would still score 100.

Artifact for each: a clause that fails on the old behaviour, and a mutation entry that reverts the fix.

## Task 10 — what the fourth review found and the change did not fix

Review 4 (`wf_206c6ee9-ad4`, six lenses over an immutable snapshot, a skeptic per non-low finding): 19 confirmed, 0 refuted, 17 low and not verified. 18 of the 19 are fixed in `docs/CC-CMD-2026-11-03-gate-state-hazards.md` ("Review 4"); the 19th is item 1 below. These are the rest; each was shown by the reviewer in a scratch copy, and I re-ran none of them unless a line says so.

1. **A function that re-reads the clock on every call passes the scan as a capture** (`const NOW = () => new Date()` has a capital name and a `new Date()` on its line; anything after a `const NAME =` on the same line counts too). The skeptic found the reviewer's proposed fix wrong; it was rated low. The scan needs the right-hand side to BE the read, not to contain one.
2. **Clock reads are matched as text.** After Review 5 the pattern allows whitespace inside and around `Date.now()`, `new Date()`, `fieldDay()` and `fieldToday()` (`new  Date()` and `new\nDate()` are reads) and `globalThis.Date.now()` was always one. Still invisible: `new Date` with no parentheses, `Date['now']()`, `performance.now()`, `process.hrtime()` and anything reached through an alias (`const d = Date; d.now()`).
3. **A template expression that begins with a regular expression** is scanned with the context from before the template. Measured in Review 5: `${/x/.test(y)}` after a bare `=` is scanned correctly (the same counts as acorn), and goes wrong only after a tag, `)`, `]` or a word before the template (`tag\`${/"/.test(y)}\` + Date.now()` gives 0 reads where there are 2).
4. **Scan time is quadratic in the number of slashes** (`out.slice(-64)` on a growing string). 306 KB takes 27 ms, so nothing reaches it; a 1.3 MB file of nothing but divisions would.
5. **The scanner's harness clause fails on a legitimate refactor** that collapses `BASELINE_AT` into one capture, and its message does not say why (it says the counts differ). Anchor the clause on the property (a bare read is seen) rather than on the exact count.
6. **A SIGKILL between a world mutation running and its second marker write** leaves the stubs applied with a marker that has no `touched` list, which the next run reports as `diverged` and cannot heal. The window is the time `treeSnapshot()` takes. There is a hook before the mutation (`world-prepared`) and one after the second write (`world-applied`), and none between.
7. **The HEAD-moved rule refuses a tree that is provably restored** when HEAD moved and a path now matches HEAD, and its message says the paths are "neither as it was nor as the mutation left it". The stash is still correct; the message is not.
8. **The refusal advises `kill -9`, which orphans the dead run's child processes**, and a heal's own `npm run build` is one of them. `kill` first, `kill -9` if it persists, is what the message should say; the harness cannot catch SIGTERM during a synchronous expectation either, so this needs the Task 7 treatment as well.
9. **'A REAL STRANDED STATE SURVIVES'** (self-test, real-script group) uses a fixture the heal cannot heal, so "heal and refuse" cannot be told from "do not touch". A healable fixture whose heal is observable (the file comes back) and a run that must not do it would separate them.
10. **The race refusal in the main flow and the torn-lock case are untested**: `if (!acquireRunLock())` can have its exit code flipped, and `catch { held = null }` in `checkLockAt` can be changed, with the self-test green. E7 tests the stale lock and the live lock; the lock that appears between `checkLocks` and `acquireRunLock` needs the fault hook the other races got.
11. **Several message branches assert nothing**: the stray-paths list and the 'moved' text in the diverged refusal, the `kill -9` text in the live refusal, and one clause label.
12. **A crash leaves the self-test's temp directories behind** (`heal-selftest-*`, `mutation-state-*` in `$TMPDIR`) when git fails in a scratch repository. Not a correctness problem; a handler that removes them on `uncaughtException` would.
13. **The scanner does not handle**: a comment or string ended by CR, U+2028 or U+2029, a backslash-CRLF line continuation in a string, and `default`, `instanceof` and `extends` before a regular expression. No file in the repo contains any of these (169 files checked against acorn). A leading `#!` line is different: 23 scripts begin with one, the scan reads `/usr/bin/env` as a regular expression that ends at its line, and removing the line from each of the 23 changes no count. They are the next differences if one is ever added.
14. **`docs/GATE-TIMING.md` records the cost of the new entries as measured in the dev container, not on a runner.** The top section there has the figures. What is open is the runner measurement: the slowest shard and the gate step of `verify-full`, which the first CI run after this lands records.
15. **`E3` to `E6` and `E8` are not the only clauses that read the ET day once and let the mutation read it again**: the world half of `E10`, `E15` and `E16` use the same `outbox-stub` and go red the same way if the self-test straddles midnight ET (read from the code, not simulated). One environment override read by both would close all of them.
16. **The property rule is textual.** Private names (`#new`, `#in`, `#do`), identifiers named `of`, `yield` or `await` where they are identifiers, and names ending in a non-ASCII letter still read a division as a regular expression; one such line hides the rest of a file. No file in the repo has one (7,639 files checked by the fifth review).
17. **proof-check: smaller items from Review 5.** The `catch { return true }` in the list of files that did not come back has no clause; a failed restore on the signal path (which cannot run during the synchronous run, item 7 above) would print the message twice now that its guard is gone; `GIT_CONFIG_NOSYSTEM` is asserted on the environment it builds, not by a system file (one cannot be planted without privileges), in either script.
18. **The review tooling leaves runaway processes.** Five `row-confidence.mjs` runs from the fourth review's scanner mutants burned 68% CPU each for 3.7 hours (cwd: a reviewer's copy, `review4/w3`; some parented to pid 1, some to a shell; why their timeouts did not end them was not established). They were killed by hand on 2026-11-04. A battery should run its mutants in their own process group, with a timeout that kills the group.
19. **`scripts/check-exit-drains.mjs` loses sync on code that nests quotes, backticks and slashes, and then cannot see the exits after it.** Its `codeOnly` blanks comments and strings with five regular-expression passes over the whole text (block comments, line comments, single quotes, double quotes, backticks); a double-quoted string that holds a single quote pairs the single quote with a later one, and from there the backtick pass pairs the wrong ends. This is the defect `row-confidence.mjs` had in its own scan, in another checker. Found 2026-11-04 when the count fell from 60 to 59 with nothing changed in what the scripts do: the scanner clauses added to `row-confidence.mjs` flipped the parity and hid the self-test's `process.exit(summarize() ...)`. Contained here by moving those clauses to a hoisted function at the end of `row-confidence.mjs` (the budget stays 60, which is the true count), not fixed: any script with a fixture like that can hide an exit, and the ratchet then lets one grow. The fix is a character-level stripper that keeps newlines (`stripNonCode` in `row-confidence.mjs` is one without the newline guarantee), after which the budget has to be re-counted and may rise.

Equivalent mutants, so that nothing here is read as a gap (Rule 91): of the 66 mutants of `stripNonCode` and `clockCounts` the reviewer applied, 63 are now caught by the self-test; `expr-return-i` (returning the index of the closing brace instead of the one after it) and `captures-greedy` (a greedy instead of a lazy gap in the capture pattern) change nothing the scan reports, and `network-always-false` cannot be caught because the network half cannot fire (Task 9, item 2).

## Not covered, on purpose

Where `/proc` cannot be read (not Linux), a recycled pid cannot be told from the recorded run and the signal's answer stands; `scripts/run-marker.mjs` says so and the self-tests print which clauses were not asserted. Nothing to build until the harness runs on such a platform.

## Done conditions

1. Each task's artifact exists and each case was red before its change.
2. `npm run gate` >= 95 with `PW_CHROMIUM` set, on the tree of the commit.
3. The Status of this document set to DONE, with the commit.
