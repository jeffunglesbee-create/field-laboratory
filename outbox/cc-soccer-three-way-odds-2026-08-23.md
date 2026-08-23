# Outbox — the relay serves soccer odds two-way; the ask, and its watcher

**Date:** 2026-08-23
**Ships:** `docs/CC-CMD-2026-08-23-soccer-three-way-odds.md` (the upstream ask),
one new OPEN entry in `scripts/cc-cmd-followup.mjs` (the automated follow-up).

## What the probe found

`/context/date/2026-08-22`, fetched through the relay self-probe (the agent
sandbox is 403 to `*.workers.dev`). Fifteen MLS games. Every one with
`opening_odds` carries a moneyline of exactly two prices and no draw:

```
2026-08-22-mls-ne-nyc   {"home":125,"away":180}     draw? false
2026-08-22-mls-atl-skc  {"home":-155,"away":340}    draw? false
2026-08-22-mls-van-dal  {"home":-215,"away":450}    draw? false
2026-08-22-mls-orl-rsl  {"home":-110,"away":220}    draw? false
2026-08-22-mls-mia-tor  {"home":-295,"away":550}    draw? false
```

Source `draftkings`, adapter `odds-api`, captured `10:01:21Z`. The same payload's
MLB game carries `moneyline{home,away}` **plus** `spread` and `total` — the
adapter projects the market shapes it is handed, and for soccer it hands through
only the two-way home/away.

## Why this matters to the laboratory

Association football is a three-outcome market. `src/Desk.fs`
`winProbabilityFrom` reads the game's own `Sport.IsSoccer`; a soccer game with no
draw price resolves to `ThreeWayDrawMissing`, and the card renders
`win prob — three-way market; no draw price served`. So on live data **every
soccer card takes the honest-refusal branch.** The win-probability surface is
built and correct (`outbox/cc-winprob-on-the-card-2026-08-23.md`); it has no
soccer data to render.

The refusal is the design working, not a gap. `src/Market.fs` makes the client's
`jubilant-bassoon` defect — `1 - homeWP` on a three-way market, folding the draw
into away — unrepresentable: `awayComplement` exists only for `TwoWay`, and a
soccer away probability can only come from `Market.ThreeWay`, which cannot be
built without the draw. `scripts/wp-check.mjs` proves the arithmetic: on a real
de-vigged three-way (home -110, draw +240, away +260), `1 - home` equals
`away + draw`, not `away`, and the discarded draw is ~0.29. Rather than show that
wrong number, the desk says the draw is not served.

## The ask

Project the draw price the Odds API already prices (h2h with a draw selection)
into `opening_odds.moneyline` for soccer markets:

```json
"moneyline": { "home": 125, "draw": 240, "away": 180 }
```

Non-soccer markets unchanged — they have no draw and must not gain a null one.
The three prices need not de-vig to 1; `Market.devigThreeWay` normalises them.
Laboratory side: nothing to build.

## The follow-up, and why it probes a moving date

A filed CC-CMD is a wish with a commit sha until something checks it. The new
`cc-cmd-followup.mjs` entry probes the **observable consequence**: a soccer
`moneyline` carrying a `draw` key. Three states, deliberately:

- **LANDED** — any soccer moneyline carries a `draw`. A draw key is unambiguous;
  only three-way markets have one, so its appearance is the signal itself.
- **not yet** — soccer moneylines are served, all still two-way.
- **no rows** — no soccer game with a moneyline this run. Observable-but-empty,
  never read as "not landed" — the vacuity failure this repo keeps catching.

It probes **yesterday (UTC)**, computed at run time, not a frozen date. The
adapter change applies to newly captured odds going forward, so a historical date
would never show it landing; opening odds are captured ~10:01Z on the game date,
so yesterday's slate is always populated whatever time the sentinel runs. The
soccer-sport set mirrors `Desk.sportMeta`'s `IsSoccer = true` labels and bounds
only the denominator — a missing league makes a game "not observable", never a
false "landed". It runs daily in `drift-sentinel`, non-fatal: an upstream backlog
is not a red build here.

## Verified

`node scripts/cc-cmd-followup.mjs --self-test` — 17/17, including the five new
draw-probe checks: the live two-way MLS shape reads NOT landed, a with-draw shape
reads landed, an MLB-only slate reads "no rows" (not "not yet"), an empty payload
reads null, and one with-draw line among two-way ones still counts as landed. The
two-way fixture is byte-identical to the real MLS moneyline, so the "not yet" it
returns is the live verdict. No laboratory source changed; `check:wp` and the
three-way render are unchanged and already green.
