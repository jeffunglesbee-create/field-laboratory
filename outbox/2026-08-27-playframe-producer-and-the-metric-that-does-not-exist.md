# The PlayFrame producer, and the metric the brief named that does not exist

`PlayFrame.Wire` gains `Outgoing`, `writeRecord` and `encode`. The F# suite goes
79 → 80: a frame the producer encoded now reads back field-by-field through the
reader.

## What the producer is

```fsharp
let encode (plays: Outgoing list) : ArrayBuffer
```

`Outgoing` is a record and it allocates, deliberately. Producing is not the hot
path — a frame is built once and read many times, and the zero-allocation claim
is about the READ side. The type is named for the direction it serves so it does
not drift onto the read path and undo the accessors.

The new check drives `encode` with three records and reads every field of every
record back. The single-record checks could not see a stride error — record 2
landing at the wrong offset — and this one can. Its counterexample is `0.1`,
which fails on float32 precision rather than on plumbing; a counterexample that
broke both would prove neither.

## The metric that does not exist, and what it cost to find out

The architecture brief specified `LivePlayState` with `WinProbability`,
`ExpectedPointsAdded` and `LeverageIndex`, and described the pipeline as
computing "Win Probability Volatility".

**No FIELD repository computes win probability volatility.** The thing it most
resembles is `getVolatilityIndex`
(`jubilant-bassoon/src/legacy/field.js:6986`), and that computes the variance of
the **drama score**. Its build spec is unambiguous (Drive
`1FS71I5gJV0OJVY6i6IKKxLrmIvHX_mu4XO_gZfZ7q98`, 2026-05-19): *"Volatility =
variance in drama score samples over recent polling window."* The implementation
matches the spec's formula and narrows its three tiers to two labels, returning
`null` in between.

**`LeverageIndex` does not exist either.** Every "leverage" hit across the three
repositories is journalism prose or a comment.

**`ExpectedPointsAdded` does exist** — `jubilant-bassoon/src/js/epa.js`, 242
lines, an nflfastR-derived EP lookup, with a test file beside it. Client-side.

## Rule 73: the spec was 100 days old, so it was re-verified forward

Two later documents bear on it, and one changed the answer.

- **`CC-CMD-2026-08-02-ruwt-baseline-audit`** (Drive `1Jo9jHPPBqf3...`,
  2026-08-03) is the newest governing read. It states the two-part test
  explicitly — *"Both tests (Rule F content, Rule A delivery) must
  independently hold — passing one doesn't clear the other"* — and confirms by
  grep that `dramaScoreLive` / `computeWatchValue` / `preGameScore` are **not**
  computed or served by any production relay route today. A future relay-side
  migration is permitted under Rule C, subject to A and B.
- **`FIELD — Wow Features: CFB + NFL`** (Drive `1h5YPOiXt1Qz...`, 2026-08-02)
  proposes a "RANKING VOLATILITY FLAG" for CFB poll churn. Unbuilt, and an
  entirely different quantity. Recorded so the name collision is on the record
  before someone wires the wrong one into this layout.

**This corrected a claim I had already written into the module.** The first
draft said a field carrying drama-derived volatility "would not be" relay-safe.
That is wrong, and the audit is what showed it. Precisely:

- `WinProbability` and `ExpectedPointsAdded` are commodity — ESPN and nflfastR
  publish both, and Rule F's own worked example is `soccer-wp.js` running
  Poisson + Dixon-Coles relay-side. Relay-safe, on pull.
- A volatility **index** — a bare variance — is a scalar of the same class as
  the drama score it derives from. Rules B and C permit that relay-side subject
  to Rule A: served on pull, never wired to an autonomous push. Not
  automatically barred.
- A volatility **label** is barred. `getVolatilityLabel` returns "chaotic" or
  "locked in" only when volatility and smoothed drama clear thresholds
  together — a value whose receipt answers "should I watch this game?", which
  is Rule F regardless of the field's name.

That classification is now in the module header, at the layout it governs,
rather than in a doc nobody opens while editing offsets.

## Open item, narrowed

Still no producer of real frames — `encode` is the surface, and what feeds it
does not exist. The nearest real source is `epa.js`, which is client-side and
emits JS objects downstream of relay JSON. Wiring it would mean introducing a
binary hop where none exists today, and per the classification above that hop
must not carry a volatility label.

## Local

`check:verify` 80/80 held, `check:proof` 71/71, `check` 17/17, `check:hard`
17/17, computed-chrome 13/13, unused, clean-source, import-purity, glyph.

One note for the next session: `npm run check` failed with
`ERR_CONNECTION_REFUSED` mid-session because `scripts/serve.mjs` had been killed
as collateral when a stranded `proof-check` process tree was cleaned up. Not a
code failure. `node scripts/serve.mjs &` and re-run.
