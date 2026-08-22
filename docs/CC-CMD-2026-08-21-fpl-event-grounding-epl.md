# CC-CMD-2026-08-21-fpl-event-grounding-epl

**Filed from:** field-laboratory
**Ask to:** field-relay-nba (journalism cron) — wire the already-available FPL
per-player endpoint into EPL brief generation
**Status:** open

One-liner:
```
EPL is now modelled and on the desk, but its briefs are season-stat templates
("both sides holding 0 points through 0 matches"). The relay already proxies the
FPL per-player live endpoint (goals, assists, cards, bonus) and it is "not wired
yet". Wire it so EPL recaps name what happened — "Saka scored in the 34th" — not
what the table says.
```

---

## Probe block — run first, from HEAD (Rule 87)

```bash
git log --oneline -5
# The endpoint exists and is allow-listed (Drive: FPL Relay Session, 2026-05-17).
curl -s "$RELAY/fpl/bootstrap-static" | node -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8"));
  console.log("current GW:", (d.events||[]).find(e=>e.is_current)?.id, "teams:", (d.teams||[]).length);'
curl -s "$RELAY/fpl/event/1/live/" | head -c 400   # per-player: goals_scored, assists, minutes, bonus, modified
# Confirm EPL is being served and briefed today.
curl -s "$RELAY/archive/query?sport=EPL&limit=3"
```

## Why now

EPL landed on the desk today — Arsenal v Coventry 3-0, modelled, rendering a
`game_live` brief. But the brief is a template: *"Arsenal hosts Coventry at
Emirates Stadium with both sides holding 0 points through 0 matches this
season… Coventry struggled to generate more than 3 shots"* — season records and
a generic line, no goalscorers, no assists, no minute of the goals. That is the
same season-stat-template gap `CC-CMD-2026-08-20-brief-data-quality` ask 5 exists
to close, now visible on the marquee competition.

The material to fix it is already reachable. Drive *FPL Relay Session*
(2026-05-17) shipped `/fpl/*` proxying `fantasy.premierleague.com/api`, and the
per-player endpoint is live and allow-listed:

```
/fpl/event/{gw}/live/  → per-player: goals_scored, assists, yellow_cards,
                          red_cards, minutes, saves, bonus, modified
```

The session doc's own words: *"Not wired yet — buildable in a future journalism
session. Relay endpoint: already available, no additional worker changes
needed."* This is that session.

**The season-stat fallback must be the right stat, too.** Event grounding is the
fix; where a brief still cites season context (a fixture with no events yet, an
early-match `game_live`), that context for European soccer is **table position
and competition advancement** — points, rank, European/relegation stakes — not a
won-drawn-lost record. The observed "0 points through 0 matches" / "0-0-0
records" lines are the wrong stat *and* vacuous in the opening weeks, when every
side's record is 0-0-0 but the table already separates them on goal difference.
Cite record only where it discriminates (mid-season, behind points/position).
Carried in full as defect 2 of `CC-CMD-2026-08-22-brief-sport-contamination`.

## The ask

For EPL games, ground the brief in the FPL per-player events rather than season
stats:

1. **Resolve the gameweek** from `/fpl/bootstrap-static` (`events[].is_current`),
   then pull `/fpl/event/{gw}/live/` and `/fpl/fixtures?event={gw}`.
2. **Join FPL → the game.** FPL fixtures key on `team_h`/`team_a` FPL ids;
   `bootstrap-static` maps id → team name. Resolve that name through the relay's
   `resolveTeamKey` (`src/identity-resolver.js`), NOT through a second alias table
   — see the Rule 60 note below; the identity resolver already carries the EPL
   section and the promoted-club aliases (Coventry/Ipswich/Hull) and is covered by
   the collision guard.
3. **Name the events in the brief** — goalscorers with minute, assists, cards —
   so an EPL recap reads "Saka opened the scoring in the 34th, Ødegaard assisting"
   instead of "0 goals through 0 games played."

## Rule 60 — one identity resolver, not two (relay/client flag, 2026-08-21)

The original draft said to "reuse the client's `FPL_SHORT_NAME_MAP` (Spurs →
Tottenham Hotspur, Wolves → Wolverhampton) so the join does not drop the ambiguous
names." The relay session flagged that as a Rule 60 problem: `FPL_SHORT_NAME_MAP`
is a **second** club-alias table, in the other repo, for the same clubs
`src/identity-resolver.js` now covers (it gained a La Liga section, the Spanish
short-form convention, and the promoted 2026-27 EPL clubs today, all under the
`check-team-identity-collisions.mjs` guard). Two tables that can disagree is
exactly the divergence `CONTRACTS.md` exists to prevent — the same shape as the
173-line drift found earlier today.

**The relay owns team identity.** The FPL → game join should resolve through
`resolveTeamKey` like every other join, and `FPL_SHORT_NAME_MAP` should be treated
as a *source of variants to fold into `identity-resolver.js`* — not stood up as a
parallel resolver. Any FPL spelling that is missing belongs in the identity
resolver, where the collision guard covers it. Do this before the join is written,
or the second table ossifies.

## Relationship to brief-data-quality ask 5

Ask 5 grounds recaps in ESPN `keyEvents` (soccer) / BSD `incidents`. FPL
`event/{gw}/live/` is a **third source for EPL specifically**, and the sources are
complementary, not redundant:

- ESPN `keyEvents` / BSD `incidents` — the general soccer event feed ask 5 uses.
- FPL `event/live` — adds the fantasy-native layer ESPN does not carry: **bonus
  points**, saves, and the `modified` flag for cheap incremental polling.

State in `CONTRACTS.md` which is authoritative for the shared fields (goals,
assists) so two sources cannot disagree in one brief — ESPN/BSD for the match
narrative, FPL for the fantasy overlay is the natural split. Do not let this ask
and ask 5 each independently name the same goal from a different feed.

**Artifact:** an EPL `game_recap`/`game_live` brief for a finished match names at
least one goalscorer (and, where present, an assister) that appears in the joined
`/fpl/event/{gw}/live/` payload — an enumerated pass/fail per row, not a prose
judgement. Coventry's 3-0 loss to Arsenal is a same-day test case.

## Not in scope (yet)

- **Fantasy price / ownership** (`bootstrap-static` player prices, transfers in/out)
  is a richer FPL-stats layer — a fantasy panel on the EPL card — and is its own
  build once event grounding lands. Flagged so "FPL stats" is not read as only
  this.
- **Non-EPL soccer.** FPL only covers the Premier League; La Liga / Ligue 1 event
  grounding stays on the ESPN/BSD path from ask 5.
- **Laboratory rendering.** The desk already renders whatever brief text arrives;
  if EPL later gains a structured player-events section (not just prose), that is
  a separate laboratory change filed then.
