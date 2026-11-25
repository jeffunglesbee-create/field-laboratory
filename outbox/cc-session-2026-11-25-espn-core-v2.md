# CC session 2026-11-25 — the ESPN reference grade's core, version 2026-11-25.2, after the independent reader

**Task:** Task 2 of `docs/CC-CMD-2026-11-23-bsd-next-goal-independent-reference.md` (one independent reader, told to attack the premises and the harness), approved by the owner with Task 3. The reader's report and what was done with each finding: that document's "Task 2 result" section. The relay half: field-relay-nba/outbox/cc-session-2026-11-25-espn-reference-grade-v2.md.

## What changed in `scripts/espn-reference-grade-core.mjs` (RULE_VERSION 2026-11-25.1 → .2)

- **The final-score guard no longer sits idle for a capture with no full-time row.** The census says 16 of 370 gradeable calls have one (354 are in-play captures). Such a capture is now held to: its last running score must not be ahead of ESPN's final score on either side (`no full-time row, ahead of ESPN` → every call on the match is not applicable, reason `captureAhead`). Counted, and printed in the coverage line.
- **Step A compares what a cut-off capture HAS.** Fewer goals than ESPN with no full-time row and agreement on all of them is `cutShort` (or `cutShortNoGoals`), not "different in number"; a disagreement in order or minute on those goals is counted as that. More goals than ESPN, or fewer in a capture that has its full-time row, is different in number. E3 compares an own goal's row team only where the two lists still line up.
- **"No goal" and "join" are told apart.** ESPN with fewer goals than the call's score, or exactly k goals that are not that score, is a join to the wrong match; k goals that are the score is "no goal".
- **Reporting:** distinct resolving goals (and how many have a disagreeing call), the usable-timeline count T, and the guard's counts are in the line.
- `nominal` in `bsdSidesOf` was dead; removed.

## Checks

`check-espn-reference-grade-core.mjs` 84 → 119 assertions; `mutate-espn-reference-grade-core.mjs` 78 → 122 mutants, all caught. The reader's survivors (the tie-break the header called equivalent and was not; clock widths; sort multipliers; distance buckets; coverage-line pieces; the stoppage minute in the BSD-on-goal test; the E3 alignment) are each a mutant now, with the assertion that kills it. Three more survived my own first assertions and were closed (a missing clock.value, a 45'+60' multiplier case, an ambiguous own goal added up as home); one is equivalent by an identity and documented in the harness header.

## Not changed, and said so

- The guard for a capture with no full-time row is ONE-SIDED. A join to a wrong match whose capture is not ahead of ESPN's final (a k=0 call, say) is not caught by it; only step A and the distance buckets would show it. The owner's CC-CMD fixed the join as the relay's existing BSD-to-archive one; this does not add a second.
- ESPN's own-goal convention is still measured only by the run; a shootout flag in the header rows is still unmeasured.
