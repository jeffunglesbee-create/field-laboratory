# CC-CMD-2026-08-23-soccer-three-way-odds

**Filed from:** field-laboratory
**Ask to:** field-relay-nba (the `odds-api` adapter — the moneyline projection)
**Status:** OPEN. Laboratory side is built and shipped; this is purely an
upstream data-shape ask. Automated follow-up wired (see below).

One-liner:
```
The relay serves soccer (MLS/EPL/La Liga) moneyline as a TWO-WAY {home, away}
with no draw price. The laboratory refuses to fake a three-way split from it, so
every soccer card shows "three-way market; no draw price served" instead of a
win probability. Pass through the draw price the Odds API already carries for
association-football markets so the desk can render a real home/draw/away split.
```

---

## Probe block — run first, from HEAD (Rule 87)

```bash
# Every soccer game's moneyline, and whether it carries a draw price.
curl -s "$RELAY/context/date/2026-08-22" | node -e '
  const d = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const soccer = new Set(["MLS", "EPL", "La Liga", "EFL Cup"]);
  for (const g of d.games.regular) {
    if (!soccer.has(g.sport) || !g.opening_odds) continue;
    const o = JSON.parse(g.opening_odds);
    console.log(g.id, JSON.stringify(o.moneyline), "draw?", "draw" in (o.moneyline || {}));
  }'
# Expected today: every line prints  {"home":N,"away":N} draw? false
```

## The evidence (measured 2026-08-23, /context/date/2026-08-22)

Fifteen MLS games on the slate. Every one with `opening_odds` carries a moneyline
of exactly two prices and no draw:

| game | moneyline | draw served |
|---|---|---|
| ne-nyc | `{home:125, away:180}` | no |
| atl-skc | `{home:-155, away:340}` | no |
| van-dal | `{home:-215, away:450}` | no |
| orl-rsl | `{home:-110, away:220}` | no |
| mia-tor | `{home:-295, away:550}` | no |

Source `draftkings`, adapter `odds-api` (`odds-api-the-odds-api`), captured
`10:01:21Z`. `closing_odds` is null for all MLS. For contrast, the same payload's
MLB game carries `moneyline{home,away}` **plus** `spread` and `total` — the
adapter projects the market shapes it is given, and for soccer it is given (or
keeps) only the two-way home/away.

Association football is a three-outcome market: home win, draw, away win. A
two-price moneyline is not a reduced soccer market — it is a different market. The
Odds API's soccer feed prices all three outcomes (h2h with a draw selection); the
draw price is being dropped somewhere between the feed and `opening_odds.moneyline`.

## Why the laboratory shows nothing rather than a wrong number

`src/Market.fs` models `TwoWay` and `ThreeWay` as distinct types with
private constructors. `awayComplement` (`1 - home`) exists **only** for `TwoWay`;
there is no three-way counterpart, because on a three-way market `1 - home` folds
the draw into away — the exact misassignment shipped in the client's
`jubilant-bassoon`. `src/Desk.fs` `winProbabilityFrom` reads the game's own
`Sport.IsSoccer`:

- non-soccer → `TwoWay` from home/away → the card renders `win prob — X% · Y%`.
- soccer **with** a draw price → `ThreeWay` → `X% · draw Z% · Y%`.
- soccer **without** a draw price → `ThreeWayDrawMissing` → the card renders
  `win prob — three-way market; no draw price served`.

The third branch is not a placeholder — it is the type refusing to invent a draw
probability it was never given. `scripts/wp-check.mjs` proves it against real
de-vigged three-way prices (home -110, draw +240, away +260): `1 - home` equals
`away + draw`, not `away`, and the draw is a real ~0.29 the two-way path would
discard. So today, on live data, every soccer card takes the honest-refusal
branch. **The win-probability surface exists and is correct; it has no soccer
data to render.**

## The ask

Project the draw price into `opening_odds.moneyline` (and `closing_odds` when the
kickoff hook fires) for association-football markets:

```json
"moneyline": { "home": 125, "draw": 240, "away": 180 }
```

American odds, same convention and sign as the existing home/away prices, from the
same `odds-api` h2h selection. Non-soccer markets are unchanged — they have no
draw and must not gain a null one. The three prices need not de-vig to 1; the
laboratory de-vigs them (`Market.devigThreeWay`, proportional normalisation).

## Artifact — the observable consequence

At least one soccer game on `/context/date/<date>` whose
`opening_odds.moneyline` contains a `draw` key. The laboratory's
`winProbability` then yields `ThreeWayWP` and the card renders
`win prob — Home X% · draw Z% · Away Y%` instead of the draw-missing line. No
laboratory change is needed — the three-way branch and its renderer are shipped
(`outbox/cc-winprob-on-the-card-2026-08-23.md`).

## Automated follow-up (this repo)

`scripts/cc-cmd-followup.mjs` gains an OPEN ask that probes a recent
`/context/date`, restricts the denominator to soccer games carrying a moneyline,
and reports:

- **LANDED** — any soccer moneyline carries a `draw` key.
- **not yet** — soccer moneylines are served, none carries a draw.
- **no rows** — no soccer game with a moneyline this run (not observable; never
  read as "not landed").

It runs daily in `drift-sentinel`; the day the draw price appears it emits a
`::notice::LANDED` line. Non-fatal — an upstream backlog is not a red build here.

## Scope boundary

- Laboratory: nothing. `Market.ThreeWay`, `winProbabilityFrom`, the renderer,
  and `check:wp` are built and verified.
- Not the spread/total projection — soccer has neither in this feed and this ask
  adds neither.
- Not a laboratory-side synthesis of a draw price from the two-way line. That is
  precisely the fabrication `Market.fs` is built to make unrepresentable; the
  draw must come from the market or not at all.
