# BDB scout rows mirrored into the laboratory

CC-CMD: `docs/CC-CMD-2026-10-18-bdb-scout-mirror.md` (the owner said "mirrored").

## Why

On 2026-10-17 and 2026-10-18 the NFL scout panel's BDB logic was built only in
jubilant-bassoon's `src/legacy/field.js`, and the owner did not know that:
- `4172d95f`: rows dropped, seasons labelled;
- `b615d5b8`: the speed floor added;
- `fa24e59c`: the double-load fix.

This repo had the type made for the job (`Vintage.fs`), and no decoder of the
six files had ever been plugged into it.

## Task 0: what the mint found before any code ran

`Vintage.decodeEnvelope` requires `sourceDataset`, and none of the six served
BDB files, nor the depth chart, carried it. They had only `source`. The lab
would have refused all of them with `NoSourceDataset`.
- **Fixed at the producer, not in the mint.** This repo's rule is "no
  fallbacks, only fixes". jubilant-bassoon `39305c07` adds `sourceDataset`
  beside `source` in `build-bdb-data.py` (six envelopes) and in
  `build-ngs-data.py` (`emit`).
- **Rebuilt:** `bdb-update.yml` run 39142923156 and `nfl-ngs-update.yml` run
  39142925192. The serve probe passed 6/6 and the values are unchanged (speed
  1648 rows).
- **Captured from the route, not the copy:** jubilant-bassoon
  `lab-bdb-capture.yml` run 39143837171. sha256 for each file is in
  `data/PROVENANCE.md`.

## What was built

- **`src/Bdb.fs`.** Decoders for speed, tendency, time-to-throw and the depth
  chart, all through `Vintage.decodeEnvelope`.
  - `SpeedFloor` has a private case. `floorText`, the only way it reaches
    text, writes "≥".
  - The name index is a pure fold over ONE file's rows, so the client's
    double-load defect (`fa24e59c`) cannot be written.
  - `starterFloors` lists the current depth chart's QB/RB/WR/TE in position
    order and never ranks them.
  - Every label is formatted from the season the caller released the data at.
- **Suite group "BDB scout":** 10 checks.
- **`docs/BDB-PROOF.md`:** 4 compile refusals.
- **Mutations:** 5 records (floor public, mark dropped, shared name kept,
  ranked by speed, label unseasoned). `verify-panel-drops-a-group` is
  re-anchored to the new last group.
- **`scripts/bdb-census.mjs` plus `bdb-census.yml`.** The census compares every
  team's line with a re-derivation of the client's algorithm over the same
  captured files.

## Verification

- `verify.yml` on the candidate (run 39143937961):
  - the build is clean with zero warnings;
  - the F# suite passes, BDB scout included;
  - the Verify panel passes;
  - the only red row was this commit's own missing outbox entry, which this
    document now supplies.
- The gate, main and the census are recorded below once run.

## What the types do not hold

- **A name match is not an identity match.** A 2023+ player who shares a name
  with a different 2022 player takes that player's floor.
- **The season is a runtime value.** `speedIndex 2026` compiles, and returns
  `None` for anything but the 2026 archive.

Both are stated in `src/Bdb.fs` and `docs/BDB-PROOF.md`.
