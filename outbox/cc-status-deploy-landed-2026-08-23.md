# Outbox — STATUS answers "did the deploy land?", and a latent import bug fixed

**Date:** 2026-08-23
**Ships:** the deploy-landed verdict folded into STATUS.md, a shared
`deployable.mjs`, and an import-purity fix in `relay-brief-watch.mjs`.

## The follow-up: STATUS now answers the real question

`STATUS.md`'s "Serving commit" cell said only "(behind `main`)" whenever the
published commit differed from HEAD — which is the EXPECTED state when docs or
`[skip ci]` commits sit on top, so it could not tell a correct deploy from a
failed one. That was the exact symptom the cross-repo comparison flagged.

It now reports the deployable verdict: **"newest deployable ✓"** when the
published artifact is the newest deployable commit, or **"behind newest
deployable `<sha>` (deploy not landed)"** when it genuinely lagged. The
`deploy-landed-check` live assertion and this STATUS line now share one
definition of "deployable" — `scripts/deployable.mjs` — kept identical to
`verify.yml`'s `paths-ignore`, so the two cannot drift.

## The bug this turn surfaced

Running `check:import-purity` locally caught `relay-brief-watch.mjs` executing —
and calling `process.exit` — at import time: it exports helpers for its self-test
AND ran its live path at the top level, so importing it terminated the caller.
It shipped under `[skip ci]`, so `verify` never ran import-purity on it. Fixed by
gating the self-test and live path behind `isMain(import.meta.url)`; the exported
helpers stay pure. import-purity 2/2, its self-test 10/10.

## Verified

`deploy-landed` self-test 6/6 and live report correct; `deployedCell` renders
landed / behind / fallback; `status.mjs` runs clean; `check:status` 23/23;
`check:workflows` 6/6; `check:import-purity` 2/2. The pre-commit gate ran on this
commit.

## Screenshot analysis (both parts) is separate

The two-part cross-repo UI/contract analysis is answered in chat, not here — it
is assessment, and the two CC-CMDs it proposes (`a515-direction-split`,
`contract-field-coverage`) are the other session's to write.
