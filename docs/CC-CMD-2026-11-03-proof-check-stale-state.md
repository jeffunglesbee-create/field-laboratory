# Claude Code Command — proof-check heals a killed run by writing its backups over files that have moved on

**Branch:** main — commit directly, do not create a feature branch or PR
**Repo:** field-laboratory
**Filed:** 2026-11-03, by CC, from a failed local gate run (92/100) that `docs/CC-CMD-2026-10-20-weather-first-call-connect.md`'s close-out hit; approved by the owner ("proof check approved")
**Confidence gate:** `npm run gate` >= 95 before any commit that lands. Changes `scripts/proof-check.mjs` (the command behind the gate row `doc claims are compiler-verified, not prose`; the row's name, weight and command line are unchanged) and the mutation table in `scripts/mutation-check.mjs`.
**Status:** DONE 2026-11-03. A backup is now applied only to a file that is exactly that backup plus what `proof-check` itself injects; a marker over nothing of the run's is discarded, an injection the file has moved on from is refused with nothing written. Self-test 41/41 including six cases that run the REAL script in a scratch directory; 12 new mutation entries, each caught, by the harness and independently by hand; the original reproduction, a real SIGKILL and a real edit-after-kill all behave as designed on the real tree; adversarial review by 5 lenses (27 findings), the 12 of medium severity or higher each put to a skeptic (11 confirmed, 1 not), every confirmed one either fixed here or filed (below). Residuals the review found and this change does not touch are filed as `docs/CC-CMD-2026-11-03-gate-state-hazards.md`. Session doc: `outbox/cc-session-2026-11-03-proof-check-stale-state.md`.

---

## Related, read before building (BUILD-ON-A)

Searched 2026-11-03 by content (`proof-state`, `HEALED`, `classifyState`, `heal`, `killed run`, `stranded`) in `docs/CC-CMD-*.md`.

- `docs/CC-CMD-2026-11-03-proof-check-shards.md` (DONE): its Status keeps "the heal of a killed run" among proof-check's own rules, "each written after an incident, all kept". This change keeps it: a run that really left its injection is still healed from its backups, and a live run still refuses. It narrows WHEN the heal may write.
- `docs/CC-CMD-2026-11-03-gate-speed.md` (DONE): names the self-test as cheap and runs it from each shard. The new cases add about a second to it (measured 1.4 s for 41 checks).
- No other CC-CMD rules on the heal. The 2026-09-07 incident is recorded in `outbox/2026-09-07-proof-check-marker.md`; the live-pid refusal it introduced is untouched and now has a real-script case.

## What was measured (Rule 73)

2026-11-03, a local `npm run gate` on a checkout of field-laboratory at `597b334`:

1. Run 1 scored 92/100: "doc claims are compiler-verified" and "breaking each invariant" red with `error FS0039: The record label 'BsdEventId' is not defined`. At the end of the run `src/Desk.fs` was 13 lines shorter and `src/Scoreboard.fs` 70 shorter, each equal to a committed version from before the lineups feature (`7505a58`, 2026-10-20; `0a8100e`, 2026-09-21), rewritten in the same millisecond, and `.proof-state/` was gone.
2. Reproduced on purpose with a planted marker (dead pid 999999) and those two versions as backups: the same two files, the same line counts, the same compile error.
3. Cause, from the code: `proof-check.mjs`'s `case 'heal'` wrote `.proof-state/Scoreboard.fs.bak` and `.bak.registry` over `src/Scoreboard.fs` and `src/Desk.fs` whenever a marker existed and its pid was dead. `injectedNow`, read on the line above the switch, was used only in `case 'proceed'`.
4. That a marker was already on disk before run 1 is INFERRED from the match, not observed. The 190-commit fast-forward that came just before the run touched neither file, and the lineups commit was in the tree before it (the 2026-10-28 `pull --rebase --autostash` runs brought it in), so the marker is older than that pull. An earlier version of the weather close-out document said otherwise and is corrected.

## What changed

`scripts/proof-check.mjs`:

- `strandedTarget(current, backup)` and `strandedRegistry(current, backup)`: is `current` exactly the backup with ONE block inserted, at `ANCHOR` carrying `MARKER` for the target, at the union's last case being the probe case for the registry. Built on `layout()` and a new `probeRegistry()`, which the registry phase now uses too, so the shape the heal recognises is the shape the script writes.
- `classifyState` gains inputs `injected`, `anchored`, `targetStranded`, `registryStranded` and two outcomes: `stale` (nothing of the run's is on either file and the target is intact: the state is discarded, never applied) and `diverged` (an injection the backups do not describe, or a target with no anchor, which may be torn: nothing written, state kept, exit 1, and the message says where the file as the run found it is). `heal` now writes each file only if that file is provably the run's own, and not the other one.
- The self-test ends `finish(ss()); process.exit()`, not `process.exit(ss())`: the bare count is the exit status, and exactly three failing clauses exit 3, which `mutation-check.mjs` reads as "this row has no subject" and skips. Measured on the same mutant: 3 clauses red exit 3 before, 1 after. `docs/early-exit-budget.txt` goes 61 to 60, which `check:exit-drains` demanded.

`scripts/mutation-check.mjs`: 12 entries beside the two existing proof-marker ones (one re-anchored), one per way this goes wrong.

## Verification (Rule 90: a check that has only passed proves nothing)

| artifact | result |
|---|---|
| the two stale-marker cases, written BEFORE the fix, on the unfixed script | 26/28, both red, the legitimate-heal case green |
| `node scripts/proof-check.mjs --self-test`, fixed | 41/41, 1.4 s; six cases run the real script in a scratch directory (stale, killed in phase 1, killed in phase 2, injection on a moved file, torn target, live pid) |
| `node scripts/mutation-check.mjs --ids <the 14 proof-marker ids>` | 15/15, every mutation caught, tree restored |
| the same mutations applied by hand to a scratch copy, anchor unique and parse checked | 13 of 13 red, each on the clauses it should be; the call-site and write-set ones only on the real-script cases |
| the original incident, planted stale marker on the real tree | `STALE STATE DISCARDED`, files untouched, 140/140 |
| a real `SIGKILL` mid-injection, next run | `HEALED`, 140/140, tree clean |
| the same kill, the file edited at its head afterwards, next run | exit 1, `src/Scoreboard.fs` byte-identical to before the run, state kept |
| `npm run gate` with `PW_CHROMIUM` set | 530/530, every row, 2707 s |

## Review (5 lenses, 12 verifiers; the repo was read-only to them)

Five independent lenses (states and kill points, test teeth, callers and cost, sibling defects, factual claims) reported 27 findings: 2 high, 12 medium, 13 low. Twelve of the 14 rated medium or higher went to a skeptic told to refute it (the workflow caps that at 3 per lens; the two beyond the cap were siblings-lens restatements of findings the states lens had already put to one): 11 confirmed and reproduced, 1 did not hold (a surviving mutant that is equivalent on every state the script could produce; the per-file heal below makes the question moot). Of the 13 low findings, 9 are fixed here (one only partly: two older documents quote the self-test's then-measured time and clause count, and are left as dated records) and 4 are filed.

Confirmed and fixed here: the new real-script cases did not check the child carried on after the repair or that it left the state dir, and the comment said its baseline "fails" when it passes (fixed: `carriedOn`, `stateLeft`, comment); the heal could still overwrite a file that had moved on while the injection stayed on it (a stash pop reproduced it), and wrote the registry unconditionally (fixed: per-file, content-checked); `stale` read one file and would have discarded a stranded registry probe, a regression from the old heal (fixed: `strandedRegistry`); a truncated target classified as clean and its only whole copy was discarded (fixed: `anchored`, `diverged`); the refuse outcome had no real-script case, so `alive: false` at the call site survived (fixed: case and mutation); exit status 3 collision (fixed); the comment tied the loss to a 190-commit pull that touched neither file (fixed, and the earlier outbox document corrected).

Confirmed and NOT fixed here, filed in `docs/CC-CMD-2026-11-03-gate-state-hazards.md`: the same heal defect in `mutation-check.mjs`, its self-test deleting a real stranded marker, the world-mutation restore path, the phase-2 window in `proof-check.mjs`, pid reuse, a dangling `livenessOf` comment.

## Done conditions

1. MET. `node scripts/proof-check.mjs --self-test` 41/41; the two stale cases were red on the unfixed script and the legitimate heal stayed green throughout.
2. MET. 12 new mutation entries, all caught by the harness and by hand; each hazard the review named has an entry or a real-script case that fails without the fix.
3. MET. The three real-tree runs above, with the outputs in the session doc.
4. MET. `npm run gate` with `PW_CHROMIUM` set: 530/530, every row, on HEAD `7bfb341` plus this change's files (details in the session doc).
