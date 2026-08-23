# CC-CMD-2026-08-23-soccer-near-miss-enrichment

**Filed from:** field-laboratory
**Ask to:** field-relay-nba (`src/context-assembler.js`, source `match_events`)
**Status:** open
**Parent:** `CC-CMD-2026-08-20-brief-data-quality` ask 5, which shipped as relay
`644d7f6` covering scoring plays only. This is the one piece of ask 5's stated
scope that was not built. Filed as its own command rather than left as a line in
the parent, per Rule 87 — deferred work needs a second CC-CMD, not a sentence.

One-liner:
```
A soccer recap grounded only in goals describes a 1-0 as though nothing else
happened. ESPN's `commentary` carries the shots off target, the woodwork and the
fouls that `keyEvents` does not contain at all — measured available on ~60% of
fixtures. Read them into the same [MATCH EVENTS] block, and degrade to
goals-only on the rest.
```

---

## Probe block — run first, from HEAD (Rule 87)

```bash
git log --oneline -5
grep -n "_EVENT_CONTAINER\|formatMatchEvents\|selectScoringPlays" src/context-assembler.js
node scripts/match-events-check.mjs   # 25 assertions, must stay green
```

Then, against a real finalized EPL fixture whose id comes from the archive (the
scoreboard path 403s — `espnSummaryAllowed()` permits `/sports/{a}/{b}/summary`
and nothing else):

```bash
curl -s "$RELAY/archive/query?sport=EPL&brief_type=game_recap&limit=6" \
  | node -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8"));
    console.log((d.results||[]).map(r=>r.game_id).filter(id=>/^\d{6,}$/.test(id)))'
curl -s "$RELAY/espn-summary/sports/soccer/eng.1/summary?event=EVENT_ID" \
  | node -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8"));
    const c=d.commentary||[];
    console.log("commentary items:", c.length, "-> tier:", c.length>=60?"rich":"sparse");
    const types=[...new Set(c.map(x=>x.play?.type?.text).filter(Boolean))];
    console.log("play types present:", types.join(" | "));'
```

The second command is the one that populates the spec. Do not write the type
filter from the list below — read it from that output, because the list below is
a claim from 2026-08-21 and Rule 72 makes it a hypothesis until re-probed.

## What is already measured (2026-08-21, CONTRACTS.md)

Rule 73 conditions: 20 completed soccer fixtures, via `/espn-summary`.

- `commentary` carries `Shot Off Target`, `Shot Hit Woodwork` and `Foul` items
  that `keyEvents` **does not contain at all**.
- Availability is cleanly bimodal with nothing in between: **12 rich fixtures
  (98–129 commentary items, 5–16 near-misses), 8 sparse (18–29 items, 0
  near-misses)**. So `commentary.length >= 60` identifies a rich fixture before
  parsing anything.
- `keyEvents` and `commentary` **overlap and neither is a superset** — verified
  by per-item id join across 6 fixtures. `keyEvents` uniquely holds
  substitutions and period markers; `commentary` uniquely holds near-misses.
  All goal items appear in both (0 missing across 6), so the existing goal read
  path is unaffected by anything done here.

## The ask

Extend `buildMatchEventsContext` / `formatMatchEvents` so a soccer fixture's
block carries near-misses alongside its goals, without changing what the other
five sports emit.

1. **Fetch nothing extra.** `commentary` is in the summary payload
   `buildMatchEventsContext` already retrieves. This must not add a request —
   Rule 78, and the parent ask's own cost analysis depends on one fetch per game
   at finalization.
2. **Tier before parsing.** `commentary.length >= 60` → rich, enrich. Below →
   sparse, emit goals only. The threshold is measured, not chosen; re-derive it
   from the probe if the bimodal split has moved.
3. **Keep the budget honest.** `match_events` declares 200 tokens and the
   assembler skips any block over `budget * 1.5`. Near-misses make soccer blocks
   longer, so measure the enriched worst case and raise the declared budget to
   fit it — an over-budget block is dropped **silently**, which presents as a
   brief with no events rather than a long one.
4. **Say what tier the block is.** A recap built from goals only, on a fixture
   where near-misses were unavailable, must not read as a full account. The
   block already states its own truncation for the volume case; state the tier
   the same way, in the block, where the generator reads it.

## Scope boundary

- **Soccer only.** MLB, WNBA, NBA, NHL and NFL blocks must be byte-identical
  before and after. `scripts/match-events-check.mjs` has 25 assertions covering
  them; all 25 stay green, and that is the regression proof.
- **EPL slug only.** `sports/soccer/eng.1` is the one domestic slug verified
  reachable (2026-08-23). Do not infer La Liga, Serie A, Bundesliga or Ligue 1
  slugs from it — probe each, or leave it unmapped so it emits nothing.
- **Not the FPL path.** `buildFPLMatchEventsContext` is a separate source at a
  separate priority and is authoritative for bonus points and saves per
  CONTRACTS.md. Do not move fields between them.
- **No participant-field reading.** CONTRACTS.md records that soccer
  `participants[]` has no role field and disagrees with the prose on names. Use
  `text`, per the parent ask.

## Done condition (Rule 89 — an artifact, not "verify it works")

1. `node scripts/match-events-check.mjs` passes with **more** assertions than 25
   and none removed, the new ones covering: a rich fixture emits at least one
   near-miss line; a sparse fixture emits none and says so; the enriched
   worst-case block is within the declared budget; the five non-soccer sports
   produce byte-identical blocks to the pre-change output.
2. `CONTRACTS.md` updated **byte-identically in both repos** with the tier
   threshold and the enriched block shape — `contracts-identity-check` fires
   from either side.
3. Check 4 of `scripts/verify-staged-items.mjs` still reports PASS or PARTIAL
   for EPL rows, never FAIL — a regression there means the enrichment pushed the
   block over budget and the assembler is dropping it.

## Why this is worth its own session

The parent ask is closed and its verification is on a schedule. This is a
distinct data source, a distinct failure mode (a silent budget drop rather than a
missing join), and a change that must prove five other sports did not move. Rule
69 — it does not hitchhike.
