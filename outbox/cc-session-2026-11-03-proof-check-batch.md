# Session 2026-11-03 — proof-check: one batched compile (IN PROGRESS, branch `proof-batch`)

Snapshot, not a landing. `docs/CC-CMD-2026-11-03-proof-check-shards.md` is IN PROGRESS and this file is finished when it is marked DONE.

## Where it stands

- Task 0 changed the design: one compile of all 133 cases (14 s) replaces one per case (776 s). Sharding is not built.
- ORACLE, run: the old method (one build per case) over all 133 cases in a throwaway copy, recording each case's SET of error codes, against the batch's set for the same case: **identical for 133 of 133**, the stated code present 133 of 133 both ways, 6 cases carrying more than one code. (`outbox/proof-check-oracle-2026-11-03.json` holds the 133 sets of the old method.)
- First review (45 agents, 5 dimensions): 1 finding survived two skeptics (a done condition named the wrong workflow); 19 were refuted as "no wrong verdict", of which these were still right and are fixed: a quiet fallback to serial speed (a real case that only passed when compiled alone went green, in 1030 s with the cap left at its default), controls that did not check WHY they failed, a `Scoreboard.fs` suffix match, three comments that were false.
- Pure sweep (Rule 90): 18 mutations of the self-test's clauses, 18 caught.
- Live sweep v2 (15 mutations of the changed script): all as expected; sweep v3 (dead batch, sharper controls, `--out` failure) running. Artifact: `outbox/proof-check-sweeps-2026-11-03.txt`.
- Second review (47 agents): 17 findings confirmed, mostly false sentences; fixed, plus three behaviours worth fixing (a dead batch compile showed only 133 identical failures; `--out` JSON said `ok` for a failed case; `--only` still fell back to the full suite silently).
- Parse-error premise measured: an unclosed expression in one injected function hides the next function's type error (only FS0058/FS0010/FS3156/FS3118 came back).
- Not yet done: live sweep result, second review of the delta, quiet timing, `docs/GATE-TIMING.md`, scored `verify-full`, landing on main.

Branch only: `verify` runs on pushes to main, so this push triggers nothing.
- Three stale cost comments corrected (mutation-await.mjs, mutation-check.mjs, verify-full.yml): the proof checks are no longer 13 minutes.
- Sweep v3 (dead batch once / twice, sharper controls, --out failure): 7 of 7 as expected; kept in outbox/proof-check-sweeps-2026-11-03.txt.
