# The client-sections probe ran its browser on import

`scripts/client-sections-probe.mjs` was moved here at `e12a44a` (2026-10-24
17:31Z, from jubilant-bassoon). Its self-test guard was a bare `if (argv ...)`,
and everything after it, including launching Chromium, ran at module top level.

## Measured

- `check:import-purity` on clean `origin/main` (5a4e113), before:
  `FAIL importing a module never runs it or exits the process` naming this file,
  `2/3 checks passed`. verify run 40116546191 (e12a44a) failed the same step; the
  pre-commit hook runs the same check, so it blocked every commit from then on.
- After wrapping the body in `if (isMain(import.meta.url))`: `3/3 checks passed`.

## Verified

- Imported: exports `parseSectionLabels, verdictFor`, prints nothing, exits 0.
- `--self-test`: 14/14, unchanged.
- Run directly it still starts the probe: with an unreachable `FIELD_URL` it got
  as far as `browserType.launch` and failed there, on this sandbox's missing
  Chromium binary, not silently with exit 0. The probe's own run on a runner (a
  real browser against the live page) was not repeated; no probe logic changed,
  only the condition under which it runs.

## Not fixed here, and why

verify 40116546191 has two other red steps on `e12a44a`:

- `Source and outbox changed together, every commit`: `e12a44a` changed
  `scripts/` with no `outbox/` file. `scripts/history-check.mjs` settles each
  commit permanently and carries no suppression list by design; the only
  sanctioned clearing is moving `docs/history-boundary.txt`, which is the owner's
  call. Asked of the owner, not done.
- `Render check against the LIVE slate`: 73 known venues, 71 chips filled in the
  20 s wait, `page.waitForFunction` timeout, the page reporting nothing. Not
  reproduced or diagnosed here.
