# CC-CMD-2026-08-23-soccer-three-way-odds

**Filed from:** field-laboratory
**Ask to:** field-relay-nba (the `odds-api` adapter — the moneyline projection)
**Status:** **CLOSED 2026-08-26.** Built 2026-08-24 (relay `5a2bacc`, deploy run
874), observed live 2026-08-26.

**The artifact, which the follow-up produced on its own without a human asking:**

```
drift-sentinel run 32923712900, 2026-08-26T02:42:51Z, probing /context/date/2026-08-25

  ##[notice]LANDED CC-CMD-2026-08-23-soccer-three-way-odds:
           project the draw price into opening_odds.moneyline for soccer markets
```

That slate — 2026-08-25, carrying EFL Cup 17, UEFA Champions League Qualifying 3,
EFL Trophy 2, La Liga 1, MLS 1 — is the **first** one captured against the
deployed adapter. `opening_odds` freeze at capture (~10:01Z on the game date), so
runs #46 and #47 on the 24th read pre-deploy rows and could not have shown it.
Neither was a failure; both were the ask not yet being observable.

**Promoted from open to landed** in `scripts/cc-cmd-followup.mjs`, which changes
what a future false reading means. As an open ask, "not landed" was someone
else's backlog and non-fatal. As a landed fact, a soccer moneyline that STOPS
carrying a draw is a regression against something this repository was told it
could rely on — `winProbability` renders a three-way market, and without the draw
it falls back to `ThreeWayDrawMissing` and the card reads "no draw price served".

`null` is preserved for a slate with no soccer moneyline at all. An off-day is
not a regression, and the fatal list must not fire on a Monday.

**Where the draw was going.** `extractOddsForGame` (relay `src/index.js`) matched
h2h outcomes against `home` and `away` and nothing else, so soccer's third
selection matched neither predicate. It was never dropped — no code path ever
referred to it.

**Identified by POSITION, not by name.** `o.name === 'Draw'` is the obvious fix
and the wrong one: an unverifiable string literal, and a renamed selection would
silently drop the price again. On a three-outcome market the entry that is
neither team IS the draw, by construction. Asserted against `Tie`, `Empate`, `X`,
`DRAW` and `""`.

**No sport check, deliberately.** The ask requires non-soccer markets not to gain
a null draw. A branch on sport could be wrong about which competitions draw; a
two-outcome h2h has no third entry, so the SHAPE enforces it. Four outcomes, a
null third price, a missing team and an empty array all yield nothing.

Rule 78: zero new requests — the draw was already in the payload. The rule lives
in `src/odds-shape.js` so a deploy gate can exercise it without the worker's
puppeteer dependency; `scripts/three-way-odds-check.mjs`, 15 assertions, is that
gate. Laboratory side unchanged, as scoped.

**The artifact is not yet observable** and this is not a partial build: the draw
appears on `/context/date` only after the opening-odds cron next captures a
soccer game against the deployed adapter. The follow-up below reports LANDED the
day it does, and distinguishes "no rows" from "not yet" so a quiet slate is never
read as a failure.

**PREMISE VERIFIED 2026-08-24T23:48Z**, which it had not been when the fix
shipped. This document asserts the feed prices all three outcomes and the relay
change was built on that sentence — an inherited claim (Rule 72), and the
sandbox 403s `*.workers.dev`, so it went to CI:
`.github/workflows/odds-h2h-shape-probe.yml`, artifact
`outbox/odds-h2h-shape-20260824T234850Z.json` in field-relay-nba.

```
PREMISE HOLDS — every one of 10 sampled soccer h2h markets prices three outcomes.

soccer_usa_mls  30 games  Chicago Fire @ Seattle Sounders  {home 170, away 120, Draw 285}
soccer_epl      20 games  Man City @ Crystal Palace        {home 400, away -165, Draw 320}
```

Ten of ten: `outcome_count: 3`, `third_selection: "Draw"`. So the draw was
genuinely being dropped downstream — by `extractOddsForGame` matching two names
and nothing else — and `drawPriceFrom` will fire on real data rather than being
correct and inert.

The feed **does** call it `"Draw"` today, so a name match would have worked. The
position rule costs nothing extra and survives a rename; the probe records the
name so a reader learns it without the code depending on it.

This narrows what a `false` from the follow-up would mean. The premise is no
longer a candidate explanation: if a slate whose odds were captured post-deploy
still shows no draw key, the fault is between the adapter and `/context/date`,
not upstream of it.

Cost (Rule 78): routed through the relay's own `/odds` proxy and its 3600s edge
cache rather than `api.the-odds-api.com` directly — at most two credits, zero on
a cache hit. This repo burned 19,999 of 20,000 credits in one June sitting on
two uncached helpers.

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
