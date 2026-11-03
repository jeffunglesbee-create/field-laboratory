# Session 2026-11-03 — the compiler-crash probe

CC-CMD: `docs/CC-CMD-2026-11-03-fable-compiler-crash.md`, Task 1 (filed earlier the same day by `docs/CC-CMD-2026-11-03-gate-speed.md`).

## What was built

`scripts/fable-crash-probe.mjs` (12-check self-test: the runner's real crash line, the flake's mixed shape counted as a crash because the source is known good, a real diagnostic as a refusal, the Wilson interval for 0 of
50 (about 7%, not 0), the parts of a cell summed with their denominator, a four-build run that finds the one that crashed) and `.github/workflows/fable-crash-probe.yml` (trigger file or dispatch; four cells, each two
jobs of 50 builds, so a bad runner is not a whole cell). `npm run check:fable-probe` runs the self-test in `verify`.

## What it found (run 41649197891, branch `crash-probe`; the table is `outbox/fable-crash-probe-latest.json`)

400 builds, 1 crash: SDK 10.0.113 with a fresh output directory, part 1, build 14, `Thoth.Json.10.5.1/Types.fs(33,1): internal error: Object reference not set`. The other three cells had none.
The SDK version is not the cause (it crashed on 10.0.113); the probe cannot rank the SDKs (1 in 100 against 0 in 100); the rate on an idle runner is 0.25% (0.04% to 1.4%), inside the
roughly 1% seen interleaved with browser checks in the harness runs, so it neither confirms nor refutes that the surrounding job matters. **The "reuse" cells are uninformative**: an unchanged source in a
reused output directory is a cache hit (0.8 to 0.9 s a build), so each held 2 real compiles. That is a flaw of this probe, kept in the record and not rerun.

## Decision

Nothing is pinned and the repeat stays (`scripts/build-steady.mjs`, the harness; every repeat counted in the merge line). A probe that could separate 1% from 0.1% would need about 1,500 builds per cell with a source
change between them; the CC-CMD records that instead of spending the runner hours now. The upstream report is drafted in `outbox/fable-crash-upstream-report.md` and NOT filed: it posts outside this repository.

## Landing

Landed as `fcb8556` (a merge of the probe branch into `main`; the push started `guards`, `verify` and `forecast-run`, no probe run, because the branch carries no trigger file). The probe adds a workflow, a script, a `verify` step and an npm script, so it was gated on the landing tree first: run 41652648922, 530/530, ledger `bf487aab59f5-45f06491eb07`, the gate step 975 s, the run 17 min 45 s. `verify` run 41655707008: success in 4 min 40 s, including `The compiler-crash probe counts what it should`; deploy run 41656472547: success.
