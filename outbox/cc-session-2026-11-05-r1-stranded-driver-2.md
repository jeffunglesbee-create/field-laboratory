# Session record: `--stranded` reads the build driver's record (review 7, C1)

**Date:** 2026-11-05. **Scope:** `scripts/mutation-check.mjs`, the `--stranded` block, its usage header, its clauses and table entries. Fix stream R1, commit 2.

**Why this file exists.** `check:staged-outbox` requires an `outbox/` path in every commit that stages `scripts/`, and the assignment says not to edit existing outbox files. New file, nothing existing touched; fold it into the session document or drop it when merging.

## Reproduction (Rule 100), on this clone

A scratch directory with `.mutation-state/driver.json` naming a live `setsid` process group (`{"run":{"pid":999999,"start":"1"},"driver":{"pid":<group>,"start":"<its /proc start>"}}`), then `node scripts/mutation-check.mjs --stranded` from it:

    checked 2 marker files (.mutation-state/active.json, .mutation-state/nested/active.json); 0 hold a mutation a run left applied
    exit=0
    (ps afterwards: the group is still there, state Ss)

The finding reproduces. The reviewer also asked that `--stranded` refuse on a live run lock (`run.json`); the skeptic rejected that and so do I: a live run is not a stranded one, every start already refuses on its lock, and a hook that refused on it would block every unrelated commit made while any mutation run is going. That half is documented in the usage header and in the comment of the mode, and not built.

## The decision the assignment asked for

Build the reader, or document the gap. Built, because the helper code the reader needs could be moved without the ReferenceError trap the earlier commit note describes: `groupHasLive`, `procGroups` and `groupAlive` use only imports (`readdirSync`, `readFileSync`), so they now sit ABOVE the `--stranded` block, with a comment saying why. `reapDriver` (further down) still uses the same three. A clause with a real process group runs the mode at that position, so a later move back down is a crash in the clause, not a silent refusal.

## What was built

- `--stranded` also reads `<state dir>/driver.json`, without signalling anything. It refuses (exit 1, names the group, the file and `node scripts/mutation-check.mjs --heal`) when the record names a pid above 1, the recorded run is not live, the pid still holds the process that was recorded (start time), and the process group is alive by the harness's own zombie-aware test. These are the three tests `reapDriver` makes before it signals; they are repeated, not shared, because `reapDriver` signals and moving its internals would re-anchor table entries in a region this stream does not own.
- The summary line prints the denominator: `checked 3 files (.mutation-state/active.json, .mutation-state/nested/active.json, .mutation-state/driver.json); N hold a mutation a run left applied; M name a build driver a dead run left running`.
- Three new clauses and one updated: a real detached node process group with a dead recorded run is refused, the group is still running afterwards and the directory is byte-identical; six states that are not orphans (recorded run live, recycled pid, group gone, pid 0, pid 1, torn record) are let through; `--heal` over a copy of the refused state stops the group and drops the record (so the refusal names a command that does what it says); the no-marker clause (updated) counts 3 files. Self-test 191 -> 194 clauses.
- Nine new table entries (one replaced after the first run, see below) and three existing ones re-anchored (`stranded-mode-exit-inverted`, `stranded-mode-refuses-a-directory-with-no-marker`, `stranded-mode-heals`). All 15 run through the harness in one `--ids` call: `16/16 checks passed`.

## Red evidence

Each entry was applied alone to the clause set (`--self-test`, 194 clauses with the fix) and the failing clause read:

- `stranded-driver-orphan-passes` (exit ignores the orphan): 193/194, the refusal clause fails.
- `stranded-driver-live-run-refused`, `-recycled-pid-refused`, `-gone-group-refused`, `-torn-record-refuses`: 193/194 each, the let-through clause fails.
- `stranded-driver-not-in-the-count`: 192/194 (the count in the refusal and in the no-marker clause).
- `stranded-driver-stopped-by-the-mode` (the mode TERMs the group): 191/194, the refusal clause (group still running) and the clauses after it.
- `stranded-driver-refusal-without-the-heal`: 193/194.
- The pid guard: the first mutant, `d.pid > 0`, SURVIVED (194/194). On this machine pid 1 has process group 0 (`/proc/1/stat` field 5), so a record naming pid 1 is not refused even without the guard, which made the mutant equivalent here. The guard is now held by pid 0 (99 processes here have group 0, and kernel threads do on any Linux): the mutant `d.pid >= 0` fails the let-through clause (193/194). The clause keeps both pid 0 and pid 1.

## Not verified

- The reader was not run against a real `dotnet fable watch` (no Fable dependencies in this container); the groups in the clauses are detached node processes. `groupAlive` and the start-time test are the ones `reapDriver` uses on the real watcher, whose clauses use a real WatchBuild over a stand-in host.
- `/proc`-less machines: `groupAlive` falls back to signal 0 (which counts a zombie), as `reapDriver` does; the recycled-pid state is not asserted where /proc cannot give a start time.
