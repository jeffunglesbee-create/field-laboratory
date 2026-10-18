# Claude Code Command — mirror the NFL BDB scout logic into the laboratory

**Branch:** main — commit directly, do not create a feature branch or PR
**Repo:** field-laboratory (plus one producer field in jubilant-bassoon)
**Confidence gate:** `npm run gate` >= 95 before any commit to main
**Filed:** 2026-10-18 by CC, at the owner's request ("mirrored")
**Status:** IN PROGRESS

## Why

The NFL scout panel's BDB logic was built only in jubilant-bassoon's
`src/legacy/field.js`, between 2026-10-17 and 2026-10-18:
- `4172d95f` dropped the player-keyed rows and labelled the team rows with
  their season;
- `b615d5b8` added the speed floor;
- `fa24e59c` fixed the double-load bug in the speed floor.

The owner did not know it lived only in the client. The laboratory has the type
built for exactly this case: `Vintage.fs`, whose header says "the six-file
retrofit plugs its own decoder into `decodeEnvelope`". Nothing has plugged one in.

The mirror also makes the laboratory's question concrete. Each of the client's
three defects in this work has a typed counterpart that cannot be written:

| client defect | typed counterpart |
|---|---|
| a 2022 row read as current | `Vintage.Tracked`; released only with a named season |
| a speed shown without "≥" | `SpeedFloor`: private case, one renderer, which writes "≥" |
| ambiguity computed against a shared mutable table, so a second load blanked all 1626 names | `indexByName` is pure over one file's rows; there is no shared table to read |

## Premises, each with the command that would refute it (Rule 100)

1. **The six served files carry no `sourceDataset`, so `decodeEnvelope` refuses
   them (`NoSourceDataset`).**
   - Refuting command: read the envelope keys of `outbox/nfl/bdb_*.json`.
   - Measured: `updated, season, targetYear, source, metric`. No
     `sourceDataset`. **Holds.**
2. **The depth chart, needed for the join, has the same gap.**
   - Measured, `outbox/nfl/depth-charts.json`:
     `updated, season, targetYear, source`. **Holds.**
3. **The fix belongs at the producer, not in the mint.** The laboratory's
   standing instruction is "no fallbacks, only fixes". A mint that accepts
   `source` OR `sourceDataset` is a fallback on the one decoder whose purpose is
   to refuse.

## Tasks

0. **Producer** (jubilant-bassoon). `scripts/build-bdb-data.py` (six envelopes)
   and `scripts/build-ngs-data.py` (`emit`) write `sourceDataset` beside the
   existing `source`. Nothing is removed: the client reads `season` only.
   Run both builders, then verify the served envelopes carry the field.
1. **Captures.** Copy the served `bdb_speed`, `bdb_tendency_fingerprint`,
   `bdb_time_to_throw` and `depth-charts` into `data/`, each with a PROVENANCE
   entry.
2. **`src/Bdb.fs`.**
   - Decoders for the three BDB files and the depth chart, through
     `Vintage.decodeEnvelope`.
   - `SpeedFloor`, with a private case and one renderer.
   - `indexByName`: pure; a name two rows share maps to no value.
   - `starterFloors`: the current depth chart's QB/RB/WR/TE in position order,
     unranked.
   - Team rows labelled with the season the caller names.
3. **Suite.** Inline envelopes, following the convention of the gravity-well
   block. Cover:
   - ambiguity within one file;
   - idempotence (building the index twice from the same rows gives the same
     index);
   - the floor marker;
   - the season label;
   - a missing `sourceDataset` refused by name.
   Plus a census over the committed captures: 1626 named values, Josh Allen
   and Lamar Jackson absent, coverage of 71 of 128 skill starters.
4. **Proofs.** `docs/BDB-PROOF.md` compiles the refusals:
   - building a `SpeedFloor` by hand;
   - rendering one without the renderer;
   - releasing a speed without naming its season.
5. **Mutations.** `scripts/mutation-check.mjs` entries, each one caught:
   - ambiguity dropped;
   - the floor marker dropped;
   - ranking by speed;
   - season unnamed.
6. **Gate, main, session doc.**

## Done condition

- `npm run gate` >= 95 on a runner, on the commit fast-forwarded to main.
- The census prints `named 1626 · ambiguous 11 · starters with a floor 71/128`
  and agrees with jubilant-bassoon's live probe (run 39139761152:
  `T.Lawrence ≥19.4` for JAX).
- Every mutation in Task 5 is caught.
