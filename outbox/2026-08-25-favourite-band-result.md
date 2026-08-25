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

---

# Run 2 — 60 days. The asymmetry is real, and a second defect surfaced.

```
60 date(s) read, 0 unavailable, 779 game(s)
shadow validated against favouriteAgreement on 636 judged game(s): 0 drift

THE BAND                143 game(s), 18.4%   agrees 47.6%
WHAT THE GATE JUDGES    636 game(s), 12 disagree (1.9%)

THE ASYMMETRY TEST — judged games inside 3x the vig, by which side is favoured
  home favourite    143 game(s), 9 disagree (6.3%)
  away favourite     80 game(s), 0 disagree (0.0%)
```

## 1. The disagreements are one-sided

**Nine of 143 home-favourite games. Zero of 80 away-favourite games.**

If the book's choice of which side lays `-1.5` were near-arbitrary at the
boundary, both sides would show it. Eighty away-favourite games producing zero
disagreements is not that. **The pattern is one-sided, which is the signature of
a feed or adapter artefact, not of market behaviour.**

The band stayed at 47.6% over the larger corpus — still a coin flip, so the
earlier conclusion holds: `favouriteAgreement`'s blind spot is empty. This
finding lives entirely in the part the gate *does* judge.

Every one of the nine sits between `-114` and `-126` on the home moneyline,
holding `+1.5`. It still cannot be adjudicated without the spread price;
`docs/CC-CMD-2026-08-25-spread-price-capture.md` now carries this number.

## 2. Three rows on 2026-06-28 carry odds that are not baseball

```
2026-06-28  MLB_2026-06-28_cardinals_marlins   ML -1940/+780   H +1.5  ratio 12.96
2026-06-28  MLB_2026-06-28_giants_braves       ML -1320/+640   H +1.5  ratio 12.28
2026-06-28  MLB_2026-06-28_twins_rockies       ML  -780/+462   H +1.5  ratio 11.02
```

Probed `MLB_2026-06-28_cardinals_marlins` directly:

```json
"opening_odds": {"source":"draftkings","captured_at":"2026-06-28T20:35:24.440Z",
  "moneyline":{"home":-1940,"away":780},
  "spread":{"home":1.5,"away":-1.5},
  "total":{"over":3.5,"under":3.5}}
"created_at":"2026-06-28 20:35:22", "finalized_at":"2026-06-28 20:35:22"
"home_score":2, "away_score":1
```

Three things, each sufficient on its own:

- **A total of 3.5.** MLB totals run 7 to 11. Today's slate: 7.5, 8.5, 9, 9.5,
  10.5. A 3.5 total is a soccer or hockey market.
- **`captured_at` equals `finalized_at` to within two seconds.** These are not
  opening odds. They were written at the moment the row was finalised, with the
  2-1 final already known.
- **No `_oddsProof`.** Every current row carries
  `{"adapterId":"odds-api","sourceId":"odds-api-the-odds-api"}`. These do not.

So the field named `opening_odds` on these rows holds neither opening odds nor
baseball odds. **A value whose name and measurement disagree** — the ninth
instance of that class this session, and the first found in archived data
rather than in code or prose.

Not established: which event they actually came from. That needs the relay.
Filed as `field-relay-nba docs/CC-CMD-2026-08-25-misjoined-opening-odds.md`.

## What closes and what stays open

- **Closed:** the band's blind spot. 143 games, 47.6%, twice measured.
- **Open, evidenced:** the one-sided slim-favourite pattern — 9/143 against
  0/80. Blocked on the spread price.
- **Open, new:** three rows whose `opening_odds` are from another sport and
  another moment. Blocked on the relay identifying the join.
