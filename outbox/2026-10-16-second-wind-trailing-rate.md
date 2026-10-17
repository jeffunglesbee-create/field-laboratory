# Second Wind: `Fatiguing` renamed `TrailingRate` — 2026-10-16

The owner ruled on 2026-10-16 (`545b589`, CC-CMD Task 3), answering both
questions `outbox/second-wind-2026-10-16.md` raised:

1. **`PopulationRate` is retained** as the fourth case. Nothing to change: it
   was built that way.
2. **`Fatiguing` becomes `TrailingRate`**, "to keep biological and
   conditioning terms out of the `aria-label` and UI copy."

## What changed

- `src/Stamina.fs`: the union case, the verdict that mints it, its mark, and
  its accessible name, which now reads `TrailingRate state active, last third
  N attempts against E expected`. The module header says why, and that
  `SecondWind` is the question the ruling leaves open.
- `src/Suite.fs`: three row names and the one row that reads the state name
  back from the label.
- `scripts/mutation-check.mjs`: two records follow the case
  (`stamina-insufficient-is-fatiguing` is now `stamina-insufficient-is-trailing`),
  and one is new, `stamina-label-trailing-rate`: it puts the old word back in
  the label and must go red. It does (`--only`, 2/2). Records 162 -> 163.
- `docs/STAMINA-PROOF.md`: the case list names `TrailingRate` and its origin.

## Measured

`dotnet build` 0 FS/NU warnings; `node build/VerifyMain.js` 302/302, with the
three renamed rows passing under their new names; `proof-check --only
STAMINA-PROOF` 9/9; both renamed records caught through the harness.

## Not changed

`SecondWind`. The ruling names one case and says the product calls the feature
Second Wind, "which may be the intent. Owner's call." `LeadingRate` is the
symmetric name if the owner wants it; it would be the same four-file change.
