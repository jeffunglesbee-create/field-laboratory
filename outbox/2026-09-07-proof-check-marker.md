# proof-check: a durable marker, and the third outcome a backup cannot give

2026-09-07 · field-laboratory · `scripts/proof-check.mjs`

## What went wrong, twice, in the same file

`proof-check.mjs` proves `docs/*-PROOF.md`'s claims by injecting code into
`src/Scoreboard.fs` and compiling for real. That is the right design and it has a
standing cost: for most of a run, a tracked source file on disk is deliberately
broken.

**2026-08-15.** A foreground timeout killed a run and `let private __proof23` was
COMMITTED to `src/Scoreboard.fs` in `217282b`. The injection compiled. It passed
the build, passed "fail on any F# compiler warning", and passed fifteen further
steps. The only thing that noticed was this script's own marker guard, ninety
seconds into the next run — and by then it could only refuse, because the backup
lived in `tmpdir()` and a fresh runner holds nothing there. `verify.yml` now runs
`check:clean-source` before the toolchain is even installed because of it.

**2026-09-07.** `npm run gate` was stopped mid-run to unblock a commit. Killing
the parent left this script orphaned and **still running**, and
`src/Scoreboard.fs` re-acquired its injection after three separate
`git checkout --` restores. The compile error moved line by line each time,
which is what finally identified it as live rather than stale.

## Why the existing repair path could not have helped either time

```js
if (readFileSync(TARGET, 'utf8').includes(MARKER)) {
  if (existsSync(BACKUP)) { /* repair */ }
  else { /* refuse, exit 1 */ }
}
const BACKUP = join(tmpdir(), 'field-laboratory-proof-check.fs')
```

Two independent gaps:

1. **The backup was in `tmpdir()`.** `mutation-check.mjs` had already reached the
   opposite conclusion and written it down — a container restart wipes tmpdir, so
   "the tree kept the mutation, the backup was gone, and nothing anywhere
   recorded that either thing had happened." This file never got the same
   treatment. That is 2026-08-15.

2. **There was no way to tell "killed" from "running".** A repair path answers
   only one question — *is the tree injected?* — and both incidents answer yes.
   In the second one, healing was actively the wrong move: restoring a file that
   a live run is about to rewrite is a race, not a fix. Three restores lost to
   exactly that.

## The fix

State moves in-repo and gitignored, and the marker carries a **pid**:

```
.proof-state/
  Scoreboard.fs.bak
  Scoreboard.fs.bak.registry
  active.json     { pid, startedAt, target, registry }
```

```js
const classifyState = ({ markerExists, pid, selfPid, alive }) => {
  if (!markerExists) return 'proceed'
  if (pid === selfPid) return 'proceed'
  return alive ? 'refuse' : 'heal'
}
```

Three outcomes, and the third is the one the last incident needed:

| state on disk | outcome | what happens |
|---|---|---|
| no marker | `proceed` | normal run (an injected tree with no marker still refuses — nothing to restore from) |
| marker, process gone | `heal` | restore both files from the durable backups, clear the state, say so |
| marker, process alive | `refuse` | exit 1 naming the pid and how to clear it, touching nothing |

`isAlive` uses `process.kill(pid, 0)`, which sends no signal and only asks.
`EPERM` counts as alive — a process owned by somebody else is still a process,
and answering "dead" to `EPERM` would be the same class of wrong answer this file
keeps having to fix.

**Write order is load-bearing.** Backups first, marker last, so a marker on disk
always has backups behind it. The reverse would leave a window where a kill
produced a marker pointing at nothing, which heals straight into the
"backup is missing" dead end.

**The refusal registers no restore handler.** It exits before
`process.on('exit', restore)` is installed, deliberately: a second run bailing
out must not clear the first run's backups on its way past.

## Verified, not asserted

### State machine — `--self-test`, now run before every real run

```
PASS  no marker means proceed
PASS  A MARKER WHOSE PROCESS IS STILL ALIVE REFUSES, it does not repair
PASS  a marker whose process is gone heals
PASS  our own marker is not somebody else's run
PASS  this process reads as alive
PASS  a pid that cannot exist reads as dead
PASS  a malformed pid reads as dead

7/7 checks passed
```

`check:proof` is now `--self-test && <real run>`, matching the convention the
other guarded scripts use.

### Mutation-tested before being trusted (Rule 90)

```
PASS  [proof-marker-always-heals]   a marker whose process is still alive
      refuses rather than repairing
PASS  [proof-marker-never-proceeds] no marker on disk means there is nothing
      to heal or refuse
```

Both directions, because "always heal" and "never proceed" are different bugs a
one-sided check could not tell apart. Both anchors confirmed unique in
`scripts/proof-check.mjs` before the run.

### The real paths, end to end — because a passing pure function is not wiring

Rule 90's own lesson is that the wrappers worked and the measuring apparatus
failed. `classifyState` being right says nothing about whether the marker is
written, whether the backups sit behind it, or whether `restore` clears it. So
both paths were driven against the real script.

**REFUSE** — a marker carrying a live pid (`serve.mjs`, 1900):

```
proof-check: a proof run is ALREADY IN PROGRESS as pid 1900, started
2026-09-07T20:00:00.000Z.
It has src/Scoreboard.fs injected right now. Starting a second run would
inject on top of it and neither could restore the original.
Wait for it, or: kill 1900 && rm -rf .proof-state && git checkout --
src/Scoreboard.fs src/Desk.fs
exit=1
```

`.proof-state/` still held all three files afterwards — the refusal did not
clear the other run's state, which is the property the handler ordering exists
for.

**HEAL** — a marker carrying an unreachable pid, with `__proof99` injected:

```
injected? 1
proof-check: HEALED — a previous run (pid 1073741824) was killed with
src/Scoreboard.fs injected. Restored it before measuring anything.
injected after? 0
state dir: cleared
git status src/Scoreboard.fs src/Desk.fs: (empty)
```

**A REAL RUN, with the marker live throughout** — `check:proof --only CHECK-PROOF`,
12 of 73 cases across 1 of 18 docs (the subset states its own denominator, Rule
91). Every case is one real `dotnet build`:

```
docs/*-PROOF.md: 12 claimed rejection(s), each compiled for real

PASS  baseline tree compiles
PASS  CHECK-PROOF.md case 1 rejected with FS1093 ... (12 cases)
PASS  adding a Sport case without the registry does not compile

15/15 checks passed
=== state after: cleared
git status src/Scoreboard.fs src/Desk.fs: (empty)
```

So the marker is written, survives a full run's worth of injections and
restores, and is cleared on the way out — which is the half the pure function
cannot speak to.

## What this does not fix

An injected tree with **no** state at all — the pre-2026-09-07 world, where the
kill also took the state directory. Nothing can restore from that without
guessing, and guessing would mean discarding whatever else is uncommitted in
those two files. It still refuses and names the exact `git checkout` to run. The
change makes that case rare rather than routine; it does not make it impossible.

Pid reuse is the other honest limit. A stale marker whose pid was recycled by an
unrelated process refuses until a human clears it. The refusal prints the exact
command, so it is a visible dead end rather than a silent one — which is the
trade this file has repeatedly chosen and should keep choosing.

## Residual

None. `.proof-state/` is gitignored alongside `.mutation-state/`, which now
carries the same durability property for the same reason.

---

## Follow-up, 30 minutes later: the marker's timestamp cost a gate row

`guards` went red on `24bd739`, ten seconds into the run:

```
FAIL  every gate row is at or above 95
      → doc claims are compiler-verified, not prose = 70
```

`row-confidence.mjs` scores a row `(hasTeeth ? 70 : 0) + (hasClock ? 0 : 30)`.
This row has teeth — the two new mutations above, plus the existing
`proof-doc-drift`. What it lost was the determinism half: the marker recorded

```js
startedAt: new Date().toISOString(),
```

at the point of use. That scanner's rule is not "never read the clock", it is
**capture it once into a top-level constant**, because a script calling
`new Date()` where the value is used can straddle midnight between two lines —
which is how CI run 31456294086 failed, with `outboxToday` asking about a
different day than the one the run started in.

Fixed by hoisting:

```js
const STARTED_AT = new Date()
```

`23/23 rows at or above 95`.

Worth recording for its shape rather than its size: a durability fix whose whole
subject is "state that survives being interrupted" reached for the wall clock
without capturing it, and the guard that noticed had already been written for
exactly that mistake. It cost ten seconds of CI and one line, because the rule
was standing and enforced rather than remembered.
