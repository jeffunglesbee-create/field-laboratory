# Bundesliga modelled, on a sampled row

**2026-08-28** · `src/Desk.fs` · closes drift-sentinel issue #5

The sentinel observed `Bundesliga` on 2026-08-28 and filed
`unmodelled: Bundesliga`. It was the last of the big five European leagues
without a `Sport` case — MLS, EFL Cup, La Liga, EPL, Ligue 1 and Serie A were
all already there.

## The evidence, sampled not assumed

`scripts/sport-vocabulary-check.mjs`, artifact
`outbox/sport-vocabulary-2026-08-29T00-47-21-350Z.json`:

```json
{ "id": "Bundesliga_2026-08-28_bayern_stuttgart",
  "home": "Bayern", "away": "Stuttgart", "home_score": 5, "away_score": 1,
  "venue": "Allianz Arena" }
```

**Allianz Arena is Bayern's ground, so home is the ground's owner.** The relay
does not transpose the sides. That is the same test the Ligue 1 and Serie A
entries are read off — *"Home is the ground's owner in both"* — and the same one
the original AFL transposition failed.

The convention itself needed no new argument. The entry above those two already
settles it: applying the soccer convention to a soccer competition is not the
AFL mistake; that was applying an American convention to a non-American sport.

`Label = "Bundesliga"`, matched verbatim, no case fold — the same rule every
other soccer entry follows.

`npm run check:proof` — **71/71** against the real F# compiler, including
*"adding a Sport case without the registry does not compile"*.

## Incidental: last turn's fix reported clean

The same probe run carried `"sample_errors": {}`. That field did not exist
before today: `sport-vocabulary-check.mjs` used to merge a network failure, a
non-200 from `/d1/execute`, and a genuine zero-row answer into `null` and then
`[]`. An empty sample is now distinguishable from a query that never ran, and
this run says every query ran.
