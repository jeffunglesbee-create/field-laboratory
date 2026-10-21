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

## Step 2 (landed): the finished-game narrative

**The ruling.** The owner chose "Yes, finished games only" and it was recorded
in two places:

- jubilant-bassoon `docs/ADR-002-CONTEXT.md`, "Amendment 2026-10-21", commit
  `31a26bb` on main. The basis is Defense 4, post-game amnesty. It is recorded
  as the owner's ruling and is not a legal opinion: counsel was not consulted.
- The empowerment CC-CMD, in a new amendment section.

**One sentence function per metric, each behind its existing witness:**

| function | witness | example (committed captures) |
|---|---|---|
| `Flow.narrative` | `Flow.Finished` | "FC Bayern München: In flow 4 times: from 13' until an opponent shot at 17' (6 shots, 0.61 xG); …" |
| `Stamina.staminaNarrative` | `Stamina.FinishedGame` | "Of 9 shot attempts in the first and last thirds of his ice time, 8 came in the last third, against 4.6 expected for a skater with his minutes. Second wind: more late attempts than chance would usually give." (Alex Ovechkin, VAN at WSH, 2025-10-19) |
| `Gravity.playNarrative` | `Gravity.Archived` | "Coverage defenders nearest each receiver, at the snap → at the throw (6 in coverage): WR1 0 → 2, WR2 3 → 2, TE 2 → 0, RB not running a route, WR3 1 → 2. The WR1 drew the most, 2 more at the throw than at the snap." |

`Gravity.receiverLabels` numbers repeated positions (WR1, WR2) so a sentence
can say which receiver. A first render said "The WR drew the most" on a
three-WR play, which did not say which one.

**The compiler refuses a sentence without its witness.** `docs/AMNESTY-PROOF.md`
N1-N4: a Flow capture, a Stamina reading, Desk's generic `AmnestyZone` and
Gravity's frames are each rejected with FS0001. `proof-check --only AMNESTY`
gives 27/27. The messages were captured from real builds and pasted in.

**Each sentence agrees with its accessible name.** A new
`metrics-render-check` predicate checks every finished row:

- **Second Wind:** the late attempts and the expected count equal the label's.
- **Gravity:** throw minus snap equals "defenders drawn", for every receiver;
  coverage equals the label's denominator; a route-less receiver matches
  NotRouteRunner.
- **Flow:** each spell's starting minute is an InFlow cell.

Results: 33/33 self-test, 17/17 live.

**Registered mutations, all caught:**
`narrative-second-wind-off-by-one`, `narrative-gravity-snap-throw-swapped`,
`narrative-flow-starts-at-first-shot`, `narrative-gravity-not-rendered`.

**Also run:** F# suite 314/314, strict build 0 warnings, `check`, `check:hard`
and `check:render-sports` 19/19 each, `check:nav` 25/25, `check:tabs` 61/61,
`check:import-purity`, `check:unused`, `check:clean-source`.

## Landed, 2026-10-21

The commits were rebased onto main and pushed as `cd6a72e` (tab strip),
`b3cd35f` (explanations) and `6984d20` (narrative). The gate-record commits
followed: `1a893de` and `e171843`. The landed tree differs from the gated tree
only in `STATUS.md`, an automated refresh.

- **Gate:** 530/530 (`verify-full` run 39658086563, at `72c43f9`).
- **Main:** `verify` 39672704001 green (dispatched by hand: the tip commit
  carries the skip directive), deploy 39673292610 success, live-check
  39673442863 success, all at `e171843`.

**iPad, in real WebKit,** in the throwaway runs 39656177678 and 39657107897
(Playwright's 12 iPad profiles, live against the fix):

- **Live, before the fix:** in all 6 portrait sizes, Metrics was entirely
  off-screen with no edge mark, and a `?tab=metrics` link left it out of view.
  That reproduces the owner's report.
- **With the fix:** all 6 portrait sizes mark and fade the edge, the link
  brings Metrics into view, and a swipe then a tap selects it. The narratives
  render (Flow 4, Gravity 12).

**Noticed, not fixed, pre-existing:** on most iPad profiles, WebKit raises an
uncaught page error when an Open-Meteo request fails, on the live site as well
as with the fix. Put to the owner as a separate question.
