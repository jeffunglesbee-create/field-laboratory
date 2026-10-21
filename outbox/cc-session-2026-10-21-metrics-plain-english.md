# The Metrics tab in plain English

Owner, 2026-10-21, with screenshots from an iPad: the tab "shows but none of
these display in plain English. Only labels, not insightful data brought into
plain English." Then: "if there's no way to display a full narrative in plain
English then the features are largely, perhaps completely, useless."

## Step 1 (this commit): explanations and legends, inside the 2026-10-15 ruling

The first question put to the owner was which of three ways to go. Visible text
on this tab was limited by the 2026-10-15 ruling
(`docs/CC-CMD-2026-10-15-empowerment-metrics.md`, "No narrative strings";
enforced by `metrics-render-check`). The owner chose "explain, within the
rule". Built:

- **Every section:** a "What it measures" and a "How to read it" block
  (Tactical Lock: "Why nothing is drawn"). These are definitions and legends,
  the same for every row. They never say which state a named player or team
  is in.
- **Flow:** the home and away team names, read from each match's own BSD event
  row.
- **Second Wind:** rows read `Nick Foligno (CHI), CHI at FLA, 2025-10-07`, from
  the game's own play-by-play (`rosterSpots`, `awayTeam`, `homeTeam`,
  `gameDate`), instead of `Game 2025020001, player 8473422`. The census is
  rewritten as a sentence.
- **Gravity Well:** rows read `KC offense v LAC, play 118`, from the frames'
  own `team` and `side`, followed by the receivers' positions in mark order.

**Claims checked before shipping, three caught on reread:**

- "A tight end usually pulls fewer defenders than a running back." Supported,
  with the source now cited: `outbox/gravity-census-latest.json` gives
  meanDrawn TE −0.415 and RB +0.485.
- A causal "because" about Second Wind's ice-time bands had no source. Removed.
- Tactical Lock's first wording, "a window has to start and stop at a restart",
  was wrong. The documented reason is dead time: stoppages must be excluded or
  they count as suppression, and the feed records no throw-in, goal kick or
  uncarded foul (empowerment CC-CMD, around line 497). Rewritten to say that.

**Checks:** `metrics-render-check` gains two predicates, each with a self-test
mutation it refuses:

- every section says what it measures and how to read it;
- rows name players, teams and positions rather than bare ids.

Results: 31/31 self-test, 16/16 live render. Registered source mutations
`metrics-gravity-unexplained` and `metrics-second-wind-bare-ids`; both ran
`--only` and both were caught. The strict build shows 0 warnings.

## Step 2 (next): the owner amended the ruling

The second question showed the owner that ADR-002-CONTEXT itself puts
post-game content outside the RUWT patents, and that every metric here is
already gated to finished or archived games. The owner ruled, 2026-10-21:
**narrative is permitted for finished games only, behind the existing witness;
live stays visual-only.** That work follows in its own commits and is recorded
below when it lands.
