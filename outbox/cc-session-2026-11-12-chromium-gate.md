# Session note: the verify job's browser steps wait for the Chromium install, and nothing else does (2026-11-12)

**Branch:** `option1-chromium-gate`, stacked on `e1-citations-head` (`2ff620c`). **Owning CC-CMD:** `docs/CC-CMD-2026-11-11-runner-apt-mirror-dns.md`, option 1 ("isolate the failure"), the part of that CC-CMD the owner did not choose on 2026-11-11 and then asked to move toward completing on 2026-11-12 ("while moving towards completion of root of the problem"). **Scope:** the `verify` job of `.github/workflows/verify.yml` only. The `full` job of `verify-full.yml` and the composite mutation-shard action also install a browser and are not changed.

## What was wrong

On 2026-11-11 a three-hour Ubuntu mirror outage made `Install Chromium` fail and GitHub skipped every later step of the `verify` job: 63 steps, among them the F# suite and about sixty checks that never needed a browser. The commit was reported unverified for a reason that said nothing about the commit. Options 2 and 3 (no apt, a three-minute limit) shrank the exposure; this is the structural half.

## What was built

- `verify.yml`: `Install Chromium` gains `id: chromium` and `continue-on-error: true`; the 20 steps that need a browser carry `if: steps.chromium.outcome == 'success'` (the one in the tail, "Render check against the LIVE slate", extends its existing `if`); a final step, `always()` and `steps.chromium.outcome != 'success'`, fails the job, so it is never green over skipped steps. It tests `!= 'success'` and not `== 'failure'`: a step killed by `timeout-minutes` may conclude as something other than `failure`. A new job `browser-gate` runs the guard.
- `scripts/check-browser-gate.py` (Python and PyYAML, the repo's precedent for parsing workflow YAML): classifies each step from the scripts it runs and checks the five rules in its header (id and `continue-on-error`; every browser step gated; no browser-free step gated; the exact final step; every `steps.<id>` an `if` names exists). Its `if` parser reads `&&`-joined clauses from an allow-list, so `|| true` and `&& false` are not gates. `npm run check:browser-gate` runs it.

## How a step is classified, and the measurement behind it

By the entry script the step starts (`node <entry>`, directly or through `npm run`), flag-aware: a `--self-test` invocation never launches, and an imported module never runs (import-purity). A mechanical read that followed imports called 9 steps browser steps that independent readers did not.

**Independent verification (Rule 89):** `outbox/verify-step-browser-classification-2026-11-12.json`. Workflow `verify-step-browser-classification`: two verifiers per slice of 8 of the 90 steps after the install, who read the sources and were told not to read the mechanical table; 86 agreed, 4 went to a judge. 20 steps need Chromium, 70 do not. No browser-free step depends on the output of an earlier step other than `Build`. The guard agrees with the independent verdict on 90 of 90; the import-level read disagreed on 8.

## Verified so far

- Red before, green after: on the unedited workflow the guard reported 23 problems (the id, `continue-on-error`, 20 ungated browser steps, no final step); on the edited one `verdict: gated`. Self-test 48 of 48.
- The guard can fail: `outbox/browser-gate-sweep-2026-11-12.txt` (from `outbox/browser-gate-sweep-2026-11-12.mjs`): 48 mutations, 32 of its code and 16 of a copy of the real `verify.yml` (drop a gate, drop `continue-on-error`, gate the F# suite, add an ungated browser step, weaken the final step...), each anchor unique and applied, the unmutated copy run first on both paths, a crash not counted; 48 of 48 caught. The sweep found three defects in the first version of the guard and its self-test, all fixed: a floor test that read the constants it tested, two fixtures that could not tell a joined continuation line from a split one, and a guard that accepted `... && false` on the final step.
- The other workflow checks pass on the edited file: `check:workflows` 71/71, `check:script-orphans`, `check:ignore-parity`, `check:import-purity`, `check:citations`, `check-push-lands.py` (26 guarded).

## Not yet done at the time of writing

The failure path on a runner (a throwaway branch with the install broken: the 20 browser steps skipped, the 70 others run, the F# suite among them, the job red), a scored `verify-full`, independent review, landing, and the CC-CMD status. This note is completed after them.
