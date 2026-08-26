# The asymmetry test came back 10–0, and three rows settle it without the price

**2026-08-26 18:57Z.** `favourite-band-census.yml` run 4, 60 days, 796 games.
Closes the "open, blocked on nothing" line in
`outbox/2026-08-25-favourite-band-result.md`.

## The number the last run was built to get

```
THE ASYMMETRY TEST — judged games inside 3x the vig, by which side is favoured
  home favourite    146 game(s), 10 disagree (6.8%)
  away favourite     82 game(s), 0 disagree (0.0%)
```

The census states its own decision rule beside the figures: *"A one-sided rate
is a feed or adapter artefact. A matching rate is the market behaving the same
way on both sides near the boundary."*

**Ten to zero.** Over 82 away-favourite games near the price boundary, not one
disagreement. The market-behaviour explanation predicts a matching rate on both
sides and it did not survive.

## And three rows settle it outright, which was supposed to need the price

The previous run said the spread **price** was what would decide it — `+1.5 at
-240` is a favourite's ordinary alternate line, `+1.5 at +130` is a
contradiction. Widening from 45 days to 60 turned up three rows that need no
price at all:

```
2026-06-28  MLB_2026-06-28_cardinals_marlins   ML -1940/ 780  H  1.5  ratio 12.96
2026-06-28  MLB_2026-06-28_giants_braves       ML -1320/ 640  H  1.5  ratio 12.28
2026-06-28  MLB_2026-06-28_twins_rockies       ML  -780/ 462  H  1.5  ratio 11.02
```

`mh`/`ma` are the home and away moneylines and `sh` is the **home** handicap
(`favourite-band-census.mjs:266`). A −1940 home favourite is not taking +1.5
runs at any price. Neither is −1320 or −780. Three of them, all on one date, all
home, all `+1.5`.

The nine-cent price band the 45-day run described (−114 to −122) was an artefact
of the window, not of the defect. **Every one of the 13 disagreements in 60 days
is `H 1.5` and every one is home.** Thirteen for thirteen.

## What this is and is not

It is evidence that something in the path resolves the home handicap to `+1.5`
independent of the market. It is **not** yet the identification of where — feed,
adapter, or decoder — and this write-up does not name one.

It is also **not** licence to correct the rows. There is no source to correct
them from, and inventing plausible odds is the fabrication this project refuses.

## Unblock criteria (Rule 74)

- **Closed:** the band's blind spot. 47.3% over 146 games at 60 days,
  consistent with 49.1% over 114 at 45.
- **Closed:** the by-side rate. 6.8% home / 0.0% away, n=146/82. One-sided.
- **Open, and no longer blocked on the relay for the mechanism:** the three
  June-28 rows are self-evidently contradictory without a price. What the price
  is still needed for is the *thin* band (ratio 1.1–1.4), where a legitimate
  alternate line and an artefact look identical. Verify with a `curl` for a
  `price` key beside `point` in `opening_odds.spread` on any `/context/date`
  game captured after `field-relay-nba b3aae99` (deploy 878, 2026-08-26).
  Games captured before it will never carry one.
- **Open:** which layer writes the `+1.5`. Needs a run against the raw Odds API
  payload beside the stored `opening_odds` for the same game — the relay change
  above makes that comparison possible for new captures.

Artifact: `outbox/favourite-band-census-20260826T185716Z.txt`, 207 lines.
