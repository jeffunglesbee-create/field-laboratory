# CC-CMD-2026-08-21-closing-odds-capture

**Filed from:** field-laboratory
**Ask to:** field-relay-nba (AmbientDO — the pre→live game-state hook)
**Status:** open

One-liner:
```
The laboratory's line-movement rendering (OddsStory.Moved) is built and dormant:
it never fires because closing_odds is a same-instant backfill, not a real
post-open capture. Capture closing odds when a game transitions pre→live so the
open→close pair is a genuine sequence — then movement narrates itself.
```

---

## Probe block — run first, from HEAD (Rule 87)

```bash
git log --oneline -5
# The defect, live: closing captured at/BEFORE opening, identical values.
curl -s "$RELAY/context/date/2026-08-21" | node -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8"));
  for (const g of d.games.regular.filter(x=>x.opening_odds&&x.closing_odds)) {
    const o=JSON.parse(g.opening_odds), c=JSON.parse(g.closing_odds);
    console.log(g.id, "open", o.captured_at, "close", c.captured_at,
      "seq?", new Date(c.captured_at) > new Date(o.captured_at),
      "same?", JSON.stringify(o.moneyline)===JSON.stringify(c.moneyline));
  }'
# Confirm the AmbientDO hook: is _captureClosingOdds wired and firing?
grep -n "_captureClosingOdds\|_gameStarts\|pendingStarts\|odds-backfill" src/ambient-do.js
```

## The evidence

**The laboratory can already narrate line movement — it has nothing to narrate.**
`src/Desk.fs` models `OddsStory.Moved of opening * closing * homeShift:
float<implied>` and `Unmoved`; `src/Scoreboard.fs` renders the card line
(`ML X -> Y (home +N.N pts implied)`) and `src/StatsView.fs` the Stats-tab row
(`line moved N.N% in implied terms`), all in devigged implied-probability terms
(`src/Units.fs`). Spec: Drive *The Odds Story Spec* v1→v3 (June 2026).

Every branch except `Moved`/`Unmoved` fires on real data. Measured on
`/context/date/2026-08-21`: each game's `closing_odds.captured_at` is at or
before its `opening_odds.captured_at` (e.g. WNBA `10:00:54.720Z` "open" vs
`10:00:36.300Z` "close") and the two are byte-identical. They are one snapshot
written to two columns — the `.github/scripts/odds-backfill.js` batch — not a
sequence. So the laboratory correctly renders `open/close NOT SEQUENCED (…)` and
refuses to invent a move. `OddsStory.Moved` has never been reachable from
production data. This is the drift-sentinel's open **issue #2** ("closing_odds is
not a closing line").

## The ask

Make `closing_odds` a genuine post-open capture. The design already exists — Drive
*Game State Transition Hook — Closing Odds Capture on pre→live* (2026-06-21):
AmbientDO detects `pre→live` inside the existing `scoreChanged` gate, dedupes via
a `_gameStarts` Set (mirroring `_finals`), and calls `_captureClosingOdds` to
fetch the Odds API line at kickoff and `UPDATE … WHERE closing_odds IS NULL`,
capped at 30 captures/day (Rule 78, ~1% of the 2700 ceiling).

The ask is to land (or re-activate) that hook so that, for a game that actually
went live, `closing_odds` is the line as of kickoff — captured strictly after
`opening_odds`, and different when the market moved. Nothing in the laboratory
changes; the `Moved`/`Unmoved` render is already shipped.

**Artifact:** on a game that transitioned pre→live, `closing_odds.captured_at >
opening_odds.captured_at`, and where the market moved the moneylines differ. The
laboratory's `oddsStory` then yields `Moved` (or `Unmoved` on a real no-move
pair) instead of `NotASequence`, and the card reads `ML X -> Y (home ±N.N pts
implied)`. Observable end to end: at least one `/context/date` game whose rendered
odds line is a movement, not `NOT SEQUENCED`.

## Carry-forwards named in the spec (do not re-derive)

- `_captureClosingOdds` writes `change_log` with `source='closing_odds_capture'`;
  the Brief Freshness Guard's materiality table does not yet recognise that
  source for the `favorite_flipped` check. Add it to `_ODDS_SOURCES` in the same
  pass or a fast follow.
- Team-name matching against the Odds API's canonical names (Türkiye / Czechia /
  DR Congo) uses the client's alias table today; port it relay-side if the hook
  produces >5% "no match" warns.
- Non-AmbientDO sports (CFL, AFL, …) still get `closing_odds` from the external CI
  job; unifying under the reconciler is the spec's phase 2, out of scope here.

## Scope boundary

- Laboratory: nothing. The line-movement layer is built and verified; this ask is
  purely about feeding it a real sequence.
- Not the live in-play odds path (`_fetchLiveOdds`) — that is unchanged.
- Rule 78 cap stays; a 30/day ceiling is the point, not a limitation to lift.
