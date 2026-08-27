# The spread price reaches the census, and 0 of 13 can be settled with it

**2026-08-27.** `src/Desk.fs`, `scripts/favourite-band-census.mjs`.

## What was open

Thirteen disagreements over sixty days between the moneyline favourite and the
handicap. **All thirteen home. All thirteen holding `+1.5`.** Three of them at
ML −1940 / −1320 / −780, where a favourite taking a run and a half is not a real
market.

The 45-day run said the spread **price** would settle it — `+1.5 at −240` is a
favourite's ordinary alternate line, `+1.5 at +130` is a contradiction, and
`point` alone cannot tell them apart. The relay has served that price since
**2026-08-26** (`field-relay-nba b3aae99`, `spreadFrom` in `src/odds-shape.js`).
Nothing read it.

## What shipped

`OpeningOdds` carries `SpreadHomePrice` and `SpreadAwayPrice`, decoded from
`spread.homePrice` / `spread.awayPrice` — optional, because every capture before
2026-08-26 has none and always will.

The census adjudicates each disagreement, **and invents no threshold**:

```js
const ph = impliedProb(shp), pa = impliedProb(sap)
const mlHomeFavoured = mh < ma, spHomeFavoured = ph > pa
return mlHomeFavoured === spHomeFavoured ? 'agrees on price' : 'contradicted by price'
```

Both sides become implied probabilities and are compared **to each other** —
the same comparison `favouriteAgreement` already makes on the moneyline. A
verdict of `no price` is returned rather than a guess whenever either side is
absent, which is the whole historical corpus.

Six self-test cases, folded into `--self-test` so CI runs them: agreement,
contradiction, missing prices on one side and both, the implied-probability
conversion against hand values, and an even price named rather than forced to a
side.

## The honest answer today

**0 of 13.** Every disagreement in the corpus predates the capture, so none can
be settled yet, and the census now prints that in those words rather than
leaving the reader to infer it. The number rises as new disagreements accrue.

That is the finding: the mechanism is in place and the data is not, which is a
different state from "blocked" and worth naming as such.

## Unblock criteria (Rule 74)

- **Closed:** the price is decoded and read. Verify: `node
  scripts/favourite-band-census.mjs --self-test` shows the six adjudication
  cases passing.
- **Open, blocked on time only:** an adjudicated verdict. Unblocked by the first
  disagreement captured after 2026-08-26. Verify: dispatch
  `favourite-band-census.yml` and read `ADJUDICABLE BY PRICE: N of M` — N > 0
  means the question is answerable.
- **Open, unchanged:** which LAYER writes the `+1.5`. Adjudication says whether
  a row is contradictory; it does not say whether the feed, the adapter or the
  decoder produced it. That needs the raw Odds API payload beside the stored
  `opening_odds` for one game, and the Odds API key is exhausted.
