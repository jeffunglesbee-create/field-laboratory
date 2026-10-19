# The no-build pre-commit hook passes without a build, honestly

CC-CMD: `docs/CC-CMD-2026-10-19-precommit-hook-needs-build.md`. The owner said
"go with Claude's best recommendations".

## Task 0: what was actually failing

The CC-CMD said eight modules import `../build/*.js`. **Measured: four do**
(`bdb-census`, `favourite-band-census`, `forecast-run`,
`second-wind-population`), failing with `ERR_MODULE_NOT_FOUND` on `build/`.
The other four (`brief-phase-live-check`, `lineups-render-check`,
`team-tint-render-check`, `viewport-overflow-check`) failed on the npm package
`playwright`: this checkout had never run `npm ci`. That is missing setup, not
a code defect. `npm ci` fixed it, and those four now pass the probe.

## The decision, as recommended

- **New state, "needs a build".** An import that fails only because a module
  under `build/` is missing is named as needing a build. It is never reported
  as "terminated the process".
- **Excused only where no build is possible.** It is unchecked, and the hook
  passes, only when `build/` is entirely absent AND the run is not CI. The
  modules are listed with the denominator: "N checked, 4 not checked here
  (need build/)".
- **A failure everywhere else.** On CI (which always builds first) or with a
  partial `build/`, it is a failure: a module nobody imported was not checked.

**Why not refuse in the hook instead:** in a checkout with no .NET, refusing
leaves `--no-verify` as the only way to commit, and that skips every hook row,
not just this one. The lab-first commit (`80aed21`) needed exactly that.

## Verification

- `--self-test`: **16/16** (was 9). The new cases:
  - a missing-build import is named as needing a build;
  - a real exit is never mistaken for one;
  - it is unchecked only with no `build/` and not on CI;
  - it is a failure with `build/` present, and a failure on CI;
  - with `build/` present, a module that imports it and then exits is caught.
- **Mutation, caught:** excusing it on CI (`excused = r => r.needsBuild`) fails
  two self-test rows. Recorded as `import-purity-needs-build-excused-on-ci` in
  `scripts/mutation-check.mjs`.
- **Local real run** (no `build/`): 3/3 PASS, with the four named as not
  checked here.
- **With `CI=true`:** FAIL, the four named, exit 1.
- **This commit went through the hook**, with no `--no-verify`.

## Gate and landing

- `verify` run 39184244485: green on `d611f34`. Its "Importing a module never
  runs it" step ran after the build, on CI, where needing a build is a
  failure, so all 76 modules were checked.
- `verify-full` run 39184242507: **530/530 (100)**, 5198 s.
- On main as `be1b361`, a fast-forward with no skip directive, then the gate's
  two record commits. `d611f34` on the session branch is a merge of that
  branch's older history, already on main by patch-id. It has the same tree
  as `be1b361`.
- The mutation harness runs the new record on its own
  (`--only import-purity-needs-build-excused-on-ci`) and reports it caught.
