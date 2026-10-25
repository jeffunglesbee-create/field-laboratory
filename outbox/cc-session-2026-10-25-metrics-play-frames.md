# Play frames in the Metrics tab (2026-10-25)

Owner: "the plays should be in the metric tab." Built as a fifth section of the
Metrics tab, over the existing binary decoder, after a proposal file
(`FieldLaboratorySurface.fs`, branch `jeffunglesbee-create-patch-1`) was compiled
here and found not to build under Fable.

## What the owner's file did under the real compiler

Measured with dotnet 10.0.113 and Fable 5.13.0 on a copy of main (the SDK comes from
apt via `scripts/install_dotnet.sh`; `dot.net` redirects to a host the proxy denies).

| construct | result |
|---|---|
| `Feliz`, `Html`, `SolidComponent` | FS0039, not defined: the project references only `Fable.Solid` |
| `open System.Buffers.Binary` | `dotnet build` passes, Fable fails: namespace not defined |
| `StructLayout` / `FieldOffset` | an FS0009 warning, and Fable emits a plain Record class with no layout |
| `inref`, `Math.Clamp` | compiled; not a blocker, corrected from an earlier claim |

## What was built

| file | change |
|---|---|
| `src/LaboratorySurface.fs` (new) | pure projection over `PlayFrame.Frame`: one tile per state, plus a constructed exhibit of six payloads |
| `src/MetricsView.fs` | section `play-frames`, with the two plain-English heads every section carries |
| `src/Laboratory.fsproj` | `PlayFrame.fs` compiled above `MetricsView.fs`; the file itself untouched |
| `src/Suite.fs` | six checks, each with a counterexample (one was NO TEETH on first run and was rewritten to compare against hand-written text) |
| `index.html` | edge styles: solid = decoded play, double = shootout play, dashed = refused payload, dotted = quiet |
| `scripts/metrics-render-check.mjs` | predicate "Play frames draws every state the decoder names, each with its own edge", its mutation, `play-frames` in EXPLAINED |
| `scripts/mutation-check.mjs` | five records, each run with `--only`: baseline `0 failing`, each mutation caught |

## What it does not claim

- No live frame exists. The tiles are CONSTRUCTED in `LaboratorySurface.fs` through
  `PlayFrame.Wire`, and the section's provenance line and its first paragraph say so.
  The producer is the open decision at the end of
  `docs/CC-CMD-2026-08-27-relay-per-play-epa.md` (PlayId is 64-bit, ESPN's id a string).
- A scoring-flag byte of 2 meaning "shootout" is the owner's proposal. No writer on main
  emits a 2; the exhibit writes it. `PlayFrame.fs` stays frozen at `6f23c76`; reading it
  from a consumer is one of the three unfreeze conditions in
  `outbox/2026-08-27-playframe-frozen-and-the-days-accounting.md`.
- Left out on purpose: the leverage index (no producer anywhere, and a weight driven by
  it would be a mark saying "this play mattered") and FPS, buffer and signal (a frame
  carries none of them).

## Verified, with the artifact

| check | result |
|---|---|
| `node build/VerifyMain.js` | 327/327 held, 326 before this change plus the six new rows minus none |
| `node scripts/metrics-render-check.mjs --self-test` | 35/35 |
| `URL=http://localhost:8125/ node scripts/metrics-render-check.mjs` against the built page | 18/18 passed |
| screenshot | `outbox/metrics-play-frames-2026-10-25.png` and the refreshed `outbox/metrics-tab-latest.png` |

## The gate

`verify-full` run 40223744723 on `claude/bsd-list-caller-search-5jd70z` at `3d120b4`
(main `ce98a2b` plus this change): **530 of 530, total 100, failing [], skipped [],
notApplicable []**, 5515 seconds. The runner's own record lines (confidence id
`3d120b4bc4ab-3cd5dd881737`, and the scale line) and its mutation baseline are carried
onto main by union-append in the landing commit, so the ledger holds the record of the
tree that was gated. The gated tree equals the landed tree: the landing commit adds
only those ledger lines and this paragraph on top of the files that run measured.
