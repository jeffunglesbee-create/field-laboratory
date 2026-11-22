# Session 2026-11-22: the seasonal alias-coverage check (Task 2 of field-relay-nba's EPL identity CC-CMD), built here

Session: https://claude.ai/code/session_01CggeNbCfJwZGqP88Ttq7r2
Spec: field-relay-nba `docs/CC-CMD-2026-09-11-epl-identity-resolve.md`, Task 2, carried forward on the owner's word ("Carry forward", 2026-11-22) and placed in this repo under LAB-FIRST-A. The relay half (Defect 2) and the findings that shaped it are in that repo's `outbox/cc-session-2026-11-22-epl-identity-carry-forward.md`.

## What it is

`scripts/epl-alias-coverage-check.mjs`, run daily by the drift sentinel. It compares the 20 clubs of the ESPN standings with the names FPL and the archive (current season only) use for them, through the relay's own resolver (a read-only checkout of the public relay repo at `.relay-src`; nothing is copied). An ORPHAN (a feed name that reaches no league club) or an FPL club with no name is a gap; a feed it could not read is NOT MEASURED; both are red. It reads three public relay routes, so it needs no secret and spends no Odds credit.

"Absent from any alias path" is read as "reached by no feed's spelling", not as "has no CANONICAL entry": a club every feed spells identically needs no alias, and the failure that matters is a spelling that reaches no club (the archive's `C Palace`).

## Verified, and how

- Self-test 42/42, offline, injected resolver and fetch. Mutations 31 of 31, each red by its named check; `check:mutate-copy` 9/9.
- The real script with the relay's real resolver against a local stub serving recorded real names (the 20 standings clubs and 20 FPL names from `outbox/epl-substrate-probe-latest.json`, 2026-10-04; 34 archive spellings from a read-only SELECT of `field-archive`, 2026-11-22): covered, exit 0. With the relay's real resolver from just before the `C Palace` alias (`7191291f^`): exit 1, `C Palace` an orphan, `Crystal Palace` unseen: the CC-CMD's Defect 1, reproduced by the real thing. FPL route down: NOT MEASURED, exit 1. No resolver: exit 2.
- `check:workflows`, `check:script-orphans`, `check:import-purity`, `check:ignore-parity`, `check:secrets`, `check:harness`, `check:citations` pass. The browser guard's pin moved 72 -> 73 (the new self-test is a counted command) with its tests and its own mutation.

## An independent review found four things in this half, all fixed

The review was 40 agents: four read-only lenses, two skeptics per finding. In the laboratory half it confirmed:
1. The live path and the exit status were under no mutation (`process.exit(0)` in place of the verdict's exit left the self-test and all 19 mutations green). `main` is now a function with every dependency injected and tested (exit 0, 1 and 2; annotations; the step summary), and 12 mutations cover it and `live()`'s wiring, including a wrong league URL and the season not reaching the archive read.
2. A red run left no annotation: the gap names were only in the runner log. In Actions each is now an `::error` annotation (ten at most, the last saying how many were left out) and the step summary carries the run.
3. **A summer-long false red.** The archive window opens 1 July but the first archived match is weeks later, so once ESPN's standings flip to the new season the archive leg was NOT MEASURED, and the sentinel would have been red daily. It is now PENDING (reported, not red) when, and only when, the standings show every club on 0 games played and the archive answered with rows from earlier seasons; a missing figure, an empty archive, or any club having played keeps it red. While feeds disagree about which clubs are in the league (FPL on the new season, ESPN on the old) the names reach no club, and that stays red on purpose.
4. Test routes matched by suffix, so a wrong path passed; they now match the exact URL.

## A defect of my own, caught by reading the diff

Moving the browser guard's pin, a regex rewrote a history comment on `scripts/no-launch-check.mjs` line 51 ("72 with `check-same-fixture.mjs`" became 73) and, separately, missed the "pin plus one" fixture, so the guard's own self-test failed 57/58. Both were found from the diff and the failing assertion, not the green summary, and fixed: the comment is restored with this change's entry added, and the fixtures moved 73 -> 74 for the pin-plus-one case.

## STAGED, with unblock criteria (Rule 74)

The check has not run against the live routes: this sandbox cannot reach workers.dev. Unblock: dispatch `drift-sentinel` after this lands, or wait for its next scheduled run. Done when the step "The relay's resolver reaches every club in the league" prints `VERDICT: covered` with `checked 20 of 20 league clubs against 2 feed(s)`. If it prints anything else, that is the finding, not a defect to tune away.

## Not done

Not built: the client inverse, the stale `Wolves` and `West Ham` entries in `jubilant-bassoon` `src/legacy/field.js:20277`. The CC-CMD says report, do not fix, in a different repo; it is reported in the relay CC-CMD.
