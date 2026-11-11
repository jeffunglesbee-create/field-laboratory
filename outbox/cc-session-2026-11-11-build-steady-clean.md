# Session note: the repeat of a crashed build compiled nothing (2026-11-11)

**Branch:** `pipes-guard` (carried with the pipes guard; its own commit). **Owning CC-CMD:** `docs/CC-CMD-2026-11-03-fable-compiler-crash.md`, last section (BUILD-ON-A: added there, not filed again). **Ruling respected:** the repeat stays bounded, announced and counted (`docs/CC-CMD-2026-11-03-gate-speed.md`); nothing widened.

## What happened

The scored `verify-full` for the pipes guard (run 42967615166, `0d3df2e`) failed 510 of 530: only the mutation row. Shard 4's log: baseline "10 failing" of 39, then "the build driver did not start: the watched initial compile (101c68b36acaf790) is not the build that was there (a3a4384c87a58ef3)". A second session's gate (run 42964147134, shard 6: 9 of 36 failing, `build/` `6c7e241c10841b3c`) failed the same way on a tree without my changes. First read as environmental; that was wrong, and the logs said so.

## Cause (read, then reproduced)

In the `Build` step of each failing shard: `RETRY build 1: ... internal error: Object reference not set to an instance of an object. (code 193)`, then the repeat printed `Skipped compilation because all generated files are up-to-date!` and `build: worked after 1 repeat(s)`. The known Fable crash hit the first build; `scripts/build-steady.mjs` repeated it; Fable trusts the files a crashed build leaves, so the repeat compiled nothing and `build/` stayed the crashed output. The shard's baseline then ran against it. The driver's digest check caught the wrong `build/` and stopped the shard. Local reproduction with the real compiler (Fable 5.13.0, SDK 10.0.113): fresh compile `65589a71d73b4b8d`; one generated file overwritten and the same command again: `Skipped compilation`, digest `3b6887ebf48d1c46`; directory removed and again: compiles, `65589a71d73b4b8d`.

## Built (one commit)

- `scripts/mutation-lib.mjs`: `buildSteadily` takes a `clean` function, run before every repeat and never before the first build.
- `scripts/build-steady.mjs`: passes `build` for the default command, `--clean <dir>` when given, nothing for another `--cmd`; the RETRY line says `clearing build/`; 6 new self-test checks (16/16).
- `docs/CC-CMD-2026-11-03-fable-compiler-crash.md`: last section, with the evidence and the artifacts.

## Verified

| claim | artifact |
|---|---|
| the self-test passes and covers the defect, the fix, first-build and per-repeat clearing, the directory choice and the command line | `node scripts/build-steady.mjs --self-test`: 16/16; `npm run check:mutation-parts`: all six suites pass |
| the self-test fails when the fix is broken | `outbox/build-steady-clean-sweep-2026-11-11.txt`: 7 of 7 breakages caught (anchor asserted once each) |
| with the real compiler the fix ends on the good build and the old behaviour does not | `outbox/build-steady-real-fable-proof-2026-11-11.txt`: with clearing `65589a71d73b4b8d` = good; without, `433ffb910996eb7d` after `Skipped compilation` |

## Not verified here (STAGED)

That a crashed first build on a runner now ends on a good build. A crash cannot be summoned (about 1 in 9 builds in the last hour's runs, 1 in 100 in the earlier probe; neither rate is established). Unblocked by: any scored `verify-full` whose shard log shows `RETRY build` followed by a `Build` step that compiles (no `Skipped compilation`). Verify: read the shard step log of the gate that lands this; absence of a crash in that gate proves nothing and is not claimed.

## Read, not changed

`confirmFullCompile` (`scripts/mutation-lib.mjs`) repeats into one throwaway directory; it runs only for watch survivors (0 on a green gate). `verify.yml`, `deploy.yml`, `live-check.yml` run a plain `npm run build` with no repeat. Both recorded in the CC-CMD section.

## Carry-forwards

None owed. The pipes guard (`docs/CC-CMD-2026-11-11-workflow-pipes-into-tee.md`) still needs its green scored gate, which this fix is meant to make reachable; its session note is `outbox/cc-session-2026-11-11-pipes-guard.md`.

## The scored gate (added before landing)

Run 42971457634 (`125e28d`, which carries this fix): 530/530, ledger `125e28def6ff-954295b1b0f5`, gate 2281 s. All 8 shards' baselines: **309 of 309 expectations, 0 failing** (42, 41, 40, 39, 38, 36, 38, 35), against 10 of 39 and 9 of 36 in the two red shards.

**What this gate does and does not show about the fix.** I read the job logs of all 9 jobs (the 8 shards in full; the `full` job's last 900 lines, which do not reach its Build step). The 8 shard Build steps show **0 `RETRY build` lines and 0 `Skipped compilation` lines**: no first build crashed in this run, so the fix was not exercised by it. Absence of a crash proves nothing about the fix and none is claimed. What the gate does show: the change did not break `build-steady` or `buildSteadily` on the normal path (8 builds, 0 repeats, all green) and the 16-check self-test is in the gate. The full job's Build step took 23 s, which is the length of a build with no repeat; that is consistent with no repeat and is not proof. The proof that the fix recompiles is `outbox/build-steady-real-fable-proof-2026-11-11.txt`.

**STAGED.** Unblocked by: any later `verify-full` or other gate whose shard Build step prints `RETRY build`. Verify: in that step's log the line after `RETRY build N` must not be `Skipped compilation`, and the line before it must be the repeat's `clearing build/ and building again`.
