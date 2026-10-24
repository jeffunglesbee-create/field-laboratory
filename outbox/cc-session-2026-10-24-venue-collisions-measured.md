# Which table rows serve the wrong city: measured, with the method's limit

CC-CMD: `docs/CC-CMD-2026-10-24-venue-name-collisions.md`, Tasks 0 and 1.
Built the same day it was filed (BUILD-ON-A: filing is not the work).

## What was built

`scripts/venue-collisions.mjs` sweeps the relay's `/context/date/D` for the last N
days, collects every home team seen at each table venue, and runs each
(venue, home) pair through the home-team matcher (`chooseByHome`) over that
name's Wikidata candidates. A pick away from the table row (more than 0.02
degrees) is a collision. Workflow mode `collisions` in `venue-source.yml` runs
it on a runner and commits `outbox/venue-collisions-latest.json`.

## Measured

First run on the table as it was (40122909319): 502 pairs, 37 same ground,
**1 collision** (Red Bull Arena / RB Leipzig, five games, the row 86.5 degrees
away), 10 no pick, 454 one-candidate. That collision was a stale row after a
rename (the owner's correction, then measured in the archive); fixed in
`96fae24`.

Final run on the corrected table (40127028227):
`checked 502 venue/home pairs over 396 of 433 table venues (37 not seen in 120 days)`,
120 of 120 days, 4,063 game rows, 0 unanswered: 38 same ground, **0 collisions**,
10 no pick, 454 one-candidate (not judged).

## The defect the first run had, found by reading its own result

The first run (40122553302) reported 2 collisions. The second,
American Family Field / Brewers, was the matcher's single-candidate artifact
again: one Wikidata candidate (the Brewers' Phoenix spring-training complex),
43 home games in Milwaukee where the row is. A pick among one candidate is not a
choice. `classify` now returns `single-candidate` for it, and the script prints
the count so it cannot hide in a total. Mutation
`venue-collision-judges-single-candidate` removes the guard and the self-test
fails.

## The limit, stated where it is read

Only 48 of 502 pairs had two or more candidates, which is all this method can
judge. The other 454 are not evidence of "no collision". The CC-CMD's Result
section says so in the same words; so does the script's own output line.

## Verified

- `venue-collisions.mjs --self-test` 7/7. Mutations, each caught:
  `venue-collision-always-same-ground`, `venue-collision-judges-single-candidate`.
- The run itself, on a runner, above.

## Not done

Nothing is owed. Task 2 (how a real collision would be served) stays in the
CC-CMD for the day one appears.
