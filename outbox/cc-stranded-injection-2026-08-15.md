# Outbox — I committed a proof harness's injected code to main

**Date:** 2026-08-15
**Ships:** `src/Scoreboard.fs` restored, `scripts/clean-source-check.mjs`,
one verify step placed first

## What happened

`verify` failed on `217282b` in **92 seconds**:

```
proof-check: src/Scoreboard.fs contains injected proof code and no backup exists.
Restore it (git checkout) before re-running.
```

`proof-check.mjs` proves its claims by injecting code into a real source file
and requiring the build to fail with a stated error code. A foreground
two-minute timeout killed it mid-run while I was sweeping the suite, leaving

```fsharp
let private __proof23 (g: Game) =
    match g.Sport with
    | Sport.AFL -> "afl"
    | Sport.MLB -> "mlb"
```

in `src/Scoreboard.fs`. `git add -A` committed it. It reached main.

This is the third time this session that a harness which edits source in place
has stranded a mutation, and the second time I have written down that exact
hazard and then walked into it. `cc-prose-units-2026-08-14.md` says it plainly:
*"a harness that edits source in place is not safe to run concurrently with
anything that builds."* It was not concurrency this time; it was a timeout. Same
class, different trigger.

## Why nothing caught it

This is the part worth keeping.

**The injection compiled.** It passed the build. It passed "fail on any F#
compiler warning". It passed fifteen further verify steps. `Sport` has exactly
the cases the injected match lists, so the incomplete-match error that makes it
a proof case never fired in the baseline tree — the code was simply a private
function nobody called.

The only thing that noticed was **proof-check's own marker guard**, at step 17,
and by then it could not fix it: the backup lives in `tmpdir()`, so on a fresh CI
runner the backup can never exist and repair is impossible by construction. It
correctly refused to run rather than report against a mutated tree.

So the failure was not missing signal handling — proof-check already traps
SIGINT, SIGTERM and SIGHUP and restores on `exit`. The failure was that **a
stranded injection is silent everywhere except the one place that cannot repair
it.**

## The fix

`scripts/clean-source-check.mjs`: scan every `src/*.fs` for the marker
proof-check injects. No build, no browser, no network — it fails in milliseconds
and names the file plus the restore command.

It runs **first** in `verify`, before `setup-dotnet` and before `npm ci`, so a
mutated tree costs seconds instead of ninety seconds of a forty-minute job.

Two things in it are load-bearing:

- **It asserts its own marker against proof-check's source.** If proof-check
  renames the injection, a naive scanner would look for a string nobody writes
  and pass on every mutated tree — vacuously green, the failure shape this repo
  keeps finding elsewhere. So the check greps `scripts/proof-check.mjs` for
  `const MARKER = 'let private __proof'` and fails if it moved.
- **It does not repair.** Auto-running `git checkout -- <file>` would fix CI,
  where the tree is clean, and destroy uncommitted work locally, where it is
  not. Repair needs the backup and belongs to proof-check; this only has to make
  the state impossible to miss.

Teeth measured: with `let private __proof99` re-stranded in `Scoreboard.fs` the
check reports **2/3, exit 1**, naming `Scoreboard.fs` and the exact
`git checkout` to run; restored, **3/3, exit 0**.

`check:proof` then run to completion rather than timed out: **48/48**, and the
tree verified clean afterwards.

## What this cost, stated plainly

`217282b` carried a real fix (the weather burst bound) and a broken tree. Main
was red for roughly half an hour while I reported `verify` as "still running" —
I was waiting on a sleep timer instead of checking the run, and the run had
already failed. The status was available the whole time; I did not look.

The lesson is not about the timeout. It is that "I am waiting for X" is a claim
about the world that has to be re-checked, not a state to sit in.
