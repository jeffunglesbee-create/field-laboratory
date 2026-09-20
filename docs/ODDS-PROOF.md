# The Odds Story: what the data actually says

This layer was built to narrate line movement between opening and closing
prices. It found that the relay's `closing_odds` is not a closing line.

This is the laboratory's first finding about the **data** rather than about a
type. The type system's contribution was to make it impossible to ignore.

## The evidence

From `data/games-2026-08-09.json`, a verbatim live capture:

```
MLB_2026-08-09_yankees_braves
  opening_odds.captured_at = 2026-08-09T10:01:24.241Z   moneyline {home: -142, away: 132}
  closing_odds.captured_at = 2026-08-09T10:01:00.322Z   moneyline {home: -142, away: 132}

MLB_2026-08-09_whitesox_guardians
  opening_odds.captured_at = 2026-08-09T10:01:24.241Z   moneyline {home: -102, away: -105}
  closing_odds.captured_at = 2026-08-09T10:01:03.737Z   moneyline {home: -102, away: -105}
```

The "closing" snapshot was captured **~22 seconds before** the "opening" one, in
both games. Both come from the same adapter (`odds-api`,
`odds-api-the-odds-api`). And the two are identical across every market, not
just the moneyline:

```
moneyline  open={home: -1.5 ...}  close=identical
spread     open={home: -1.5, away: 1.5}  close=identical
total      open={over: 8.5, under: 8.5}  close=identical
```

They are one snapshot written to two columns. Sample of two, and the sentinel
now measures it daily across the live slate (see below) rather than
generalising from two games.

## Why this matters more than a missing feature

A narrative layer built on this data without checking would have rendered **"line
unchanged"** on every card — a true-sounding statement about a market that was
never observed twice. That is worse than rendering nothing, because it invents a
finding.

The relevant field is `captured_at`, which the decoder previously discarded. It
is decoded now for exactly one reason: it is the only way to test whether an
"opening" and a "closing" price are actually a sequence.

## The model

```fsharp
type OddsStory =
    | NoPrices
    | SingleSnapshot of Odds
    | NotASequence of opening: Odds * closing: Odds
    | Unmoved of Odds
    | Moved of opening: Odds * closing: Odds * homeShift: float<implied>
```

`NotASequence` is not defensive padding — it is the case the committed data
actually takes, on every game that carries both prices. The card says so:

```
draftkings ML -142 / +132 — open/close NOT SEQUENCED
                            (2026-08-09T10:01:24.241Z vs 2026-08-09T10:01:00.322Z)
```

Two design choices worth stating:

- **Equal timestamps are also `NotASequence`.** Two snapshots from the same
  instant cannot show movement either.
- **Absent timestamps are `NotASequence`.** Assuming the sequence holds when it
  cannot be checked is precisely the assumption this case exists to prevent
  being made silently.

## The units guard

Line movement is only meaningful in probability terms, and a moneyline's implied
probability is **not** a win probability. `-142 / +132` implies 0.587 and 0.431,
which sum to **1.018**. That 1.8% is the book's margin.

Both numbers are plain floats in the 0–1 range. Nothing but a type separates
"what this price implies" from "the chance this team wins".

<!-- proof: FS0001 -->
```fsharp
match g.OpeningOdds with
| Decoded o ->
    match o.MoneylineHome |> Option.bind impliedOfMoneyline with
    | Some i -> formatWinProbability i
    | None -> ""
| _ -> ""
```
```
error FS0001: Type mismatch. Expecting a    'float<prob>'
              but given a    'float<implied>'
              The unit of measure 'prob' does not match the unit of measure 'implied'
```

`devig` is the only sanctioned route from `implied` to `prob`. It normalises the
pair proportionally — a standard method and an *assumption* about how the margin
is distributed, applied in exactly one place so the assumption has one home.

This is the same failure the `prob`/`pct` split already guards, one level
deeper: not a scale mismatch but a meaning mismatch at the same scale. It is
also the first time the units of measure in this repo have had a real consumer
rather than a demo value.

## The spread and the total

Same treatment, and the total produced a second structural finding.

**`spread` is a symmetric handicap.** The relay serves `{home, away}`, and a
handicap is one number, so the pair must be exact opposites to describe one
line. Every observed game satisfies it:

```
{home: -1.5, away: 1.5}      {home: 1.5, away: -1.5}
```

`Spread` is therefore `Balanced of homeHandicap` or `Unbalanced of home * away`.
It is stated relative to **home**, not to "the favourite", deliberately: this
repo has already shipped one bug from a number whose referent was implicit —
every fixture rendered away-first because `%s @ %s` carried no convention with
it (`docs/SPORT-PROOF.md`). A signed handicap with an unstated side is the same
mistake waiting.

**`total` is one line written twice.** The field reads as two prices and is not:

```
total = {over: 8.5, under: 8.5}      # every game, both snapshots
```

`over` and `under` hold the *same number*. This is the line, duplicated — there
is no over price and no under price anywhere in the payload. `TotalLine` models
it as `OneLine of line`, with `TwoNumbers of over * under` for the shape the
field's name implies and which has never been observed.

Neither the spread nor the total carries any price. The moneyline is the only
priced market in this payload, which is why it is the only one the implied-
probability work touches.

### A cross-field invariant

The side giving points on the handicap should be the side priced shorter on the
moneyline. That is checkable, and both fields agree on every observed game:

| game | moneyline | handicap | agree |
| --- | --- | --- | --- |
| yankees_braves | home -142 (home favoured) | home -1.5 (home gives) | yes |
| whitesox_guardians | away -105 (away favoured) | home +1.5 (home receives) | yes |

`FavouriteAgreement` makes a disagreement a first-class case rather than a card
that merely looks odd, and the sentinel fails on it.

### The invariant was wrong, and the live data said so within one run

Shipped, the rule was: any moneyline difference names a favourite. The first
live sentinel run flagged two mismatches, and naming the game settled it:

```
MLB_2026-08-10_cardinals_phillies: ML -113/-107, H +1.5/-1.5
```

| | implied | overround | separation | |
| --- | --- | --- | --- | --- |
| cardinals_phillies | 0.5305 / 0.5169 | 0.0474 | **0.0136** | pick-em |
| whitesox_guardians | 0.5050 / 0.5122 | 0.0171 | **0.0072** | pick-em |
| yankees_braves | 0.5868 / 0.4310 | 0.0178 | 0.1557 | real favourite |

At -113/-107 the two sides are separated by less than a third of the book's own
margin. There is no favourite there, and which side carries the -1.5 runline is
not determined by a difference smaller than the vig. **The data was consistent;
the invariant was too strict.**

Worth noting the second row: `whitesox_guardians`, in the committed capture, was
also inside the vig. It had been passing the check by luck rather than because
the check was working — a false negative sitting next to the false positive, and
neither visible until real data with a wider spread of prices arrived.

The rule now requires the separation to exceed the overround, computed from the
same two prices. That is not a constant tuned until the check passed — there is
no constant. A market that does not separate the sides by more than its own
margin has not named a favourite.

Still has teeth: flipping `yankees_braves`' handicap (separation 0.1557 against
an overround of 0.0178) still fails the check. What changed is that pick-ems
stopped being asked a question they cannot answer — comparisons on the committed
capture dropped from 4 to 2, and both remaining ones are genuine.

### The shape anomalies cannot be dropped

<!-- proof: FS0025 -->
```fsharp
match totalOf { g with Sport = g.Sport } with
| Some (OneLine line) -> sprintf "%.1f" line
| None -> ""
```
```
error FS0025: Incomplete pattern matches on this expression. For example, the
value 'Some (TwoNumbers (_, _))' may indicate a case not covered by the pattern(s).
```

Handling only the shape the data currently takes does not compile. That is the
whole point of modelling `TwoNumbers` and `Unbalanced` at all: they are the
cases that would otherwise be discovered by a card rendering something quietly
wrong.

## ADR-002 position

Clean, and worth stating rather than assuming, since this renders numbers next
to games.

A bookmaker's price is the textbook case of Rule F's permitted category —
"anything a neutral data vendor could plausibly publish". The layer renders no
composite score, no threshold, no tier and no recommendation, so it is nowhere
near the interest-level line the drama gate exists to hold. Implied probability
is the same class as win probability, which ADR-002 explicitly clears
("Shows P(win), a statistical measure. Not an interest/excitement level").

Movement is reported as a factual shift in implied percentage points, not as a
signal that a game became worth watching. That distinction is the whole of Rule
F's labelling-independent test.

## Automated follow-up

The drift sentinel now measures the odds shape on every run and carries it in
the log:

```
odds: both=2 not-sequenced=2 moved=0 unmoved=0 single=0 none=0
```

If **every** game carrying both prices is `NotASequence`, it files an issue
recording that, updating the same issue rather than opening one daily. On the
first run where any game shows a real sequence, it closes the issue by itself —
because that would mean the relay was fixed upstream, and an issue that outlives
its cause trains people to ignore the next one.

## What this does not claim

- Not that the relay is broken. `closing_odds` may be populated correctly for
  other sports, other days, or other adapters. The claim is bounded: on every
  sample observed so far, it is not a closing line.
- Not that line movement never happens. `Moved` is unreachable in the committed
  captures and is therefore the one branch here with no real-data coverage —
  recorded as untested rather than presented as working.
- ~~Nothing about `spread` or `total`, which are decoded by nobody. Only the
  moneyline is modelled.~~ **FALSE WHEN WRITTEN, corrected 2026-09-20.** Both
  are modelled 127 lines above this one, and have been since `85afee8`
  (2026-08-10): `Spread` is `Balanced`/`Unbalanced`, `TotalLine` is
  `OneLine`/`TwoNumbers`, `spreadOf`/`totalOf`/`favouriteAgreement` decode them,
  `src/Scoreboard.fs:171` (`spreadOf`) renders them, `scripts/drift-check.mjs:222`
  (`spreadOf`) asserts on them, and the `<!-- proof: FS0025 -->` case above is the
  compiler rejecting a consumer that handles only `OneLine`.

  **This line cost a month.** `docs/CC-CMD-2026-09-11-spread-total-model.md`
  quotes it as its entire justification — "that is the largest unmodelled
  surface in the odds layer" — and specifies building what already existed. It
  was filed 32 days after the work shipped, by a reader who trusted a document's
  closing summary over its own body.

  What IS still unmodelled, and is the real remainder: neither market carries a
  price (see above), so there is no implied-probability path for either; and the
  sentinel reports line SHAPE across the whole slate without reporting which
  SPORTS carry odds at all.

  The bounded claims above this one stayed true because each names the sample it
  rests on. This one named nothing, so nothing contradicted it.
