# The blind spot is empty. Something else is not.

**2026-08-25.** Result of `favourite-band-census`, run 1, 45 days.

```
45 date(s) read, 0 unavailable, 621 game(s) with a comparable moneyline+handicap pair
shadow validated against favouriteAgreement on 507 judged game(s): 0 drift

THE BAND favouriteAgreement DECLINES TO JUDGE
  114 game(s), 18.4% of the corpus
  shadow agrees    56  (49.1%)
  shadow disagrees 55

WHAT THE GATE DOES JUDGE
  507 game(s): 503 agree, 4 disagree (0.8%)
```

## The question, answered

**49.1% — a coin flip.** The handicap carries no information inside the band,
which is exactly what a true pick'em looks like. There is no systematic
inversion hiding where `favouriteAgreement` declines to look.

The vig threshold is correctly conservative and its blind spot is empty. That
line of enquiry closes.

The shadow validated against the real rubric on all 507 judged games with zero
drift, so the numbers above are measured against the real function rather than
against a second copy of it.

## What the census turned up instead

Every one of the four judged disagreements in 45 days:

```
2026-08-09  MLB_2026-08-09_mariners_rays      ML -114/+106  H +1.5  ratio 2.61
2026-08-08  MLB_2026-08-08_mariners_rays      ML -121/+101  H +1.5  ratio 1.11
2026-07-25  MLB_2026-07-25_redsox_bluejays    ML -122/+101  H +1.5  ratio 1.11
2026-07-19  MLB_2026-07-19_astros_orioles     ML -122/+101  H +1.5  ratio 1.11
```

**All four are HOME favourite, in a price range spanning nine cents, all holding
`+1.5`. Zero are away favourite.** The `NotComparable` rows listed beside them
are the same shape at `-120/+100`, and today's `padres_pirates` is the same
shape at `-124/+103`.

That is not noise scattered across a season. It is concentrated at one price
band and on one side.

## Why the side matters, and what run 2 measures

Two explanations fit the four rows, and they make opposite predictions:

- **A feed or adapter artefact** — a handicap that resolves to `home: +1.5` when
  the market is near even. One-sided. Away slim favourites would NOT show the
  mirror.
- **Market behaviour at the boundary** — for a near-even game, which side the
  book lists at `-1.5` is genuinely close to arbitrary. Two-sided. Away slim
  favourites would disagree at a similar rate.

The census now reports the disagreement rate **by which side is favoured**,
among judged games inside 3× the vig. One number separates the two
explanations. Dispatch `favourite-band-census.yml` again to get it.

## And the thing that would settle it outright

`extractOddsForGame` keeps only `point`:

```js
if (h && a) out.spread = { home: h.point, away: a.point };
```

The Odds API returns `price` beside it, and the price is decisive:

- `+1.5 at -240` — the normal alternate line for a favourite. Nothing wrong.
- `+1.5 at +130` — genuinely contradictory.

Four unresolvable anomalies in 45 days, all at one price band, is the evidence
for capturing it that "it would be useful" was not. Filed as
`field-relay-nba docs/CC-CMD-2026-08-25-spread-price-capture.md`.

## Unblock criteria (Rule 74)

- **Closed:** the band's blind spot. 49.1% over 114 games.
- **Open, blocked on nothing:** the by-side rate. Re-dispatch the census.
- **Open, blocked on the relay:** the four anomalies cannot be adjudicated
  without the spread price. Verify with `curl` for a `price` key beside `point`
  in `opening_odds.spread` on any `/context/date` game after that CC-CMD lands.
