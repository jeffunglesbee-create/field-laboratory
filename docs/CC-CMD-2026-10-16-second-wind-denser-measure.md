# Claude Code Command — Second Wind on a denser measure (on-ice shot attempts per 60)

**Branch:** main — commit directly, do not create a feature branch or PR
**Repo:** field-laboratory
**Filed:** 2026-10-16, by CC, from empowerment Task 3 (Rule 87.4: work found out of scope is filed, not carried)
**Confidence gate:** `npm run gate` must score >= 95 before any commit
**Status:** FILED, not started. An owner decision comes first (below).

## Why

Task 3 of `docs/CC-CMD-2026-10-15-empowerment-metrics.md` is built on
individual shot attempts credited by name (`src/Stamina.fs`). That measure was
chosen because it never asks who was on the ice, so the end-exclusive on-ice
join's failures (goals 23/101, penalties 0/133 in Task 0) cannot reach it.

Its cost is power. Over the 2025-26 reference season (field-relay-nba run
38962367310, `outbox/empowerment-premises-latest.json` key `nhl`) the first and
last thirds of a skater's regulation ice together hold 24567 credited attempts
over 11807 skater-games: about 2.1 per skater-game. A reading needs 6 to leave
`Insufficient` in every band. So most readings will be `Insufficient`, which is
the honest answer for that measure and the reason this command exists.

On-ice shot attempts for and against (CF and CA per 60 of the skater's own ice
time) count every attempt while he is on the ice, not only his own. Derived
from the same counts, not measured: about 57 regulation attempts per team per
game (37606 over 656 team-games) and a median skater on the ice for 989 of
3600 regulation seconds put roughly 31 for-and-against attempts in his game,
against about 3.2 of his own; that assumes attempts spread evenly over the
game, which they do not. It needs on-ice membership, which is exactly what Task 0
found broken at stoppages, so it is a different metric with a different risk,
not a tuning of the current one.

## The owner decision this needs first

1. Is Second Wind about what a skater does himself (the current measure), or
   about what happens while he is on the ice (CF/60)? They answer different
   questions; the second credits a skater for his linemates' shots.
2. If CF/60: is the denominator CF/(CF+CA) per third, or CF per 60 alone?

Do not build until both are answered.

## Probe block (run first, against HEAD)

```bash
git log --oneline -5
grep -n "staminaCoverage\|InstantInNoInterval\|StartInclusive" src/Stamina.fs | head
node -e 'const d=require("./outbox/second-wind-population-latest.json");console.log(JSON.stringify(d.premises.credited_coverage,null,1));console.log(JSON.stringify(d.states))'
```

The last line reads the population run Task 3 dispatches. It must exist and
show `credited_coverage` for goals, other attempts and penalties at 0 s and
+600 s before this command can say anything about membership at stoppages.

## Task (only after the ruling)

1. Measure membership at the stoppage instant, per class, from
   `staminaCoverage`'s output: the share of goals and penalties whose named
   player is inside his own shift under (a,b] but not [a,b). If (a,b] covers
   goals at the rate it covers other attempts, the on-ice set at a goal is the
   set at T-1, and a membership rule can be written; if not, stop and report.
2. Add an on-ice measure beside the current one, not in place of it: a new
   function in `src/Stamina.fs` that counts CF and CA per skater per third, with
   the same period guard and the measured boundary rule from step 1.
3. Re-run `scripts/second-wind-population.mjs` with the new measure added to
   the artifact, and report the share of skater-games that leave
   `Insufficient` under each measure.

## Done condition

`outbox/second-wind-population-latest.json` carries both measures, each with
its skater-games readable beyond `Insufficient` as a count; the Suite gains a
row per new boundary with a hard-coded counterexample; `npm run gate` >= 95.
