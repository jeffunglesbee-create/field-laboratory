# Session record: the exit and signal handler's stop of the build watcher is asserted

**Date:** 2026-11-05. **Scope:** fix stream F2, review 6, finding harness-lifecycle 0. Commit 3 of 8. New file for `check:staged-outbox`; existing outbox files are not edited.

## Reproduction (Rule 100), on a frozen copy of this clone at d4bcd69, before this stream's first commit

The mutant: delete `stopBuilder();` from the exit and signal handler (the line `restore(); stopBuilder(); if (signal !== 'exit') process.exit(1)`, one occurrence in the code). On the copy, `node scripts/mutation-check.mjs --self-test`: **165/165 checks passed** (the self-test of d4bcd69 held 165 clauses). No table entry's find string targeted that line. So nothing in the self-test or the table fails if the handler stops stopping the watcher.

## The Ctrl-C question

The watcher was given a process group of its own (`detached: true`), so a terminal's Ctrl-C, which goes to the foreground group, no longer reaches it. The review showed on a pty with the real Fable that the harness stays in the foreground group, receives the SIGINT, and its handler stops the watcher (no process left 0.05 s after the harness had gone); with the handler's stop deleted the watcher was still running 15 s later. So nothing needs forwarding and the spawn mode is not changed: the property to pin is that the handler stops it, and the clause pins it for SIGINT, SIGTERM and SIGHUP.

## What was built

- One self-test clause in the E22 group (the one that has the stand-in `dotnet`): for each of SIGTERM, SIGINT and SIGHUP a real harness run in a stand-in repository, the signal delivered from inside the run by `MUTATION_KILL_AT=source-applied` with `MUTATION_KILL_SIGNAL`, which is the moment the watcher is up and has compiled the mutation. After the harness has gone (polling up to 3 s) it asserts: status 1, the watcher and its stand-in both gone, `driver.json` gone, the mutated file back, and that the watcher really was up (the run printed `build driver: watch, ready`), so a run that never started one cannot pass. The three runs go at once, each in a copy of the stand-in repository (a run is 1.4 s here, and the self-test runs once for each of 159 table entries).
- E22's helpers: `watchers` takes the directory, `dread` takes a directory, the stand-in repository gets a `cleanBuild` (a run ended mid-mutation leaves `build/` holding the mutation, and the next run refuses a watcher whose first compile is not the build it finds: found when the first version of this clause ran its signals one after another).
- Table: `signal-handler-leaves-the-watcher`, whose find is that handler line.

## Red evidence (Rule 90)

The entry's mutation, applied to a copy with the clause present: `167/168 checks passed`, one FAIL, with its detail `SIGTERM: status 1, watcher was up true, processes left 2, record kept true, file back true / SIGINT: ... processes left 2, record kept true ... / SIGHUP: ... processes left 2, record kept true ...`. Unmutated: `168/168`. Through the harness, `node scripts/mutation-check.mjs --ids signal-handler-leaves-the-watcher`: `PASS [signal-handler-leaves-the-watcher]`.

## Not verified

The stand-in forwards TERM to its compiler, as the real host does (probed 2026-11-05 on Fable 5.13.0: a TERM to the leader of a detached `dotnet fable watch` left nothing in the group after 6 s). A host that does not forward is commit 4's. No pty run of a real Ctrl-C was repeated here; the review's is the evidence.
