# CC session 2026-11-26 — the grade re-run after the UEFA labels and the EFL Championship joined (laboratory half)

**Task:** record the effect, in the laboratory's own spec, of what field-relay-nba built on the owner's "build both next" (`field-relay-nba` `outbox/cc-session-2026-11-25-uefa-efl-join.md` is the main session doc; its spec is `docs/CC-CMD-2026-10-27-bsd-event-id-on-game-rows.md`, "Addendum 2026-11-25"). Nothing under `scripts/` changed in this repository: the grader core is still `2026-11-25.2`, 119 assertions, 122 mutants; the re-run used it as it was.

## What was done here

- `docs/CC-CMD-2026-11-23-bsd-next-goal-independent-reference.md`: new section "UEFA and EFL Championship result (2026-11-26)", the status line, and "Not in scope" brought to what is true (the three population-raising items are done; League One, League Two, EFL Cup, EFL Trophy named as not done).
- The re-run itself: relay `espn-task0.yml` (`parts` = `reach`) run 45726587782, then `espn-reference-grade.yml` run 45726584274 with `lab_ref` `b1f6bcad9785bb7d6e976c8191d298f898de7619`; after the relay's reach reasons were made measured (`0a26c17`), the reach again (run 45729798975).

## Result (counts only, as the artifacts print them)

graded 382 of 387 calls on 250 matches, agree 382, disagree 0, not applicable 5; 246 of 250 matches with a usable ESPN timeline; step A 217 identical, 29 cut short, 0 different. Was 268 of 382 on 246 matches, 170 timelines. By directory: eflchamp 25 of 25, ucl 60 of 64, europa 29 of 30, the six leagues and MLS all of theirs.

## What it does not say

E5 stands: no difference between ESPN's list and BSD's capture on 246 matches, so independence is not shown. The 4 unreached matches (3 ucl, 1 europa) have, by the relay's measured reason, no archive row of their labels on the call days; whether that is only the newest matchday not yet archived is not established (counts-only artifact).

## STAGED (Rule 74)

- **The 4 matches:** blocked by the artifact holding counts only; unblocked by the next archive cycle; verify with `espn-task0.yml` `parts` = `reach`, `node -e` on `outbox/bsd-e2-reach-latest.json` in field-relay-nba: `reach.bySlug.ucl.zero + reach.bySlug.europa.zero` equals 0, or the same 4 with the same reason after two cycles (then the archive's coverage of those matches is the next question).

## Errors, matter-of-fact

- The first grade of this re-run printed "outside the join's sports" for 5 calls that the join covered. Cause: a reason written as a fact without a command behind it (`zeroReason` in the relay's `espn-task0-lib.mjs`). Fixed there and measured; the first artifact is left as it was written.
