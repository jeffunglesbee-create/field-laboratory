# The 2 WNBA pairs — same machinery, one scope change

The archive-wide sweep found 53 mixed-scheme clusters: 51 MLS, merged
2026-09-03, and **2 WNBA under a third id scheme**.

```
wnba_2026-06-20_atlantadre_indianafev  ||  WNBA_2026-06-20_dream_fever
wnba_2026-06-20_phoenixmer_seattlesto  ||  WNBA_2026-06-20_mercury_storm
```

`sport-prefixed-external` — lower-case sport prefix, underscore separators,
ten-character team truncations. Not the dash shape the MLS pairs used.

## The machinery was never MLS-specific, and the name had stopped being true

`mixedScheme` compares schemes without naming them. `pickSurvivor` asks which row
is `provider-composite`, and the WNBA loser is lower-case-prefixed, so the
upper-case row is still the only one — **the rule resolves this pair without
being told the scheme exists.** That is now a self-test rather than a claim.

Only two things were MLS-specific: the SQL filter and the slate URL. So
`merge-mls-duplicate-pairs.mjs` is now `merge-duplicate-pairs.mjs`, renamed
rather than left with a name that had stopped being true.

## `--sport` is required and has no default

Neither the script nor the workflow input defaults it. A merge that picked its
own scope could delete rows in a league nobody was looking at, and *"it defaulted
to MLS"* is not a thing to discover from an execute run. The script exits 1 with
that sentence if the flag is absent.

The v2 slate names sports in lower case (`/v2/games?sport=mls` answered 200 on
2026-09-03) while the archive labels them upper (`MLS`), so the slate sport is
derived by lowering — measured on the MLS run, not assumed.

## What is different about these two, and what it means

The MLS pairs were `indistinguishable` — no shared event id, no shared start
time — and needed the slate to settle them. **These two already classify as
`duplicate`**, meaning `classifyPair` found a real discriminator. The slate is
still consulted, because the same evidence standard should apply to both and
re-asking costs one fetch.

## Dry run — run `33788096001`, exit 0

```
sport WNBA   planned 2   refused 0   executed False

2026-06-20  key=401857006
   keep   WNBA_2026-06-20_dream_fever
   delete wnba_2026-06-20_atlantadre_indianafev
   absorb streams, opening_odds
   refs   {}          survivor: {briefs.game_id: 1}

2026-06-20  key=401857007
   keep   WNBA_2026-06-20_mercury_storm
   delete wnba_2026-06-20_phoenixmer_seattlesto
   absorb streams, opening_odds
   refs   {}          survivor: {briefs.game_id: 1}
```

**Nothing references either loser.** No repoints, no drops — the whole reference
apparatus the MLS merge needed does nothing here, which is what a correctly
scoped gate looks like when the condition it guards is absent.

Each survivor carries **one brief**, and keeps it: briefs attach to the survivor,
which is the row that stays. Had the brief been on the loser the gate would have
blocked, as it did for `change_log` on MLS.

Each survivor absorbs `streams` and `opening_odds` from the loser — real data
that would have been lost by a plain delete.

Two distinct merge keys, `401857006` and `401857007`.

### Blast radius

| action | rows |
|---|---|
| absorb `streams`, `opening_odds` | 2 |
| delete duplicate row | 2 |

**Four writes.** Against 212 for MLS.

## EXECUTED — run `33788211815`

```
executed True   results 2
losers gone:        True
survivors present:  True
dangling:           0

wnba_2026-06-20_atlantadre_indianafev -> WNBA_2026-06-20_dream_fever    401857006
wnba_2026-06-20_phoenixmer_seattlesto -> WNBA_2026-06-20_mercury_storm  401857007
```

## The archive is clean — sweep `33788288716`

```
rows 2724   clusters 129   MIXED 0
mixed_by_sport: {}
by_scheme: {unrecognised: 956, sport-prefixed-external: 156, provider-composite: 1612}
```

**Zero mixed-scheme clusters anywhere in the archive.** 53 at the start of the
day.

| | start | after MLS | after WNBA |
|---|---|---|---|
| mixed-scheme clusters | 53 | 2 | **0** |
| rows in both game tables | 2777 | 2726 | 2724 |
| same-fixture clusters | 182 | 131 | 129 |
| `unrecognised` | 1007 | 956 | **956** |
| `sport-prefixed-external` | 158 | 158 | **156** |

The last two rows are the check that matters. The WNBA losers were
`sport-prefixed-external`, **not** the dash shape — so that count had to fall by
2 and `unrecognised` had to stay still. Both did. A merge that had deleted the
wrong rows would have moved the wrong counter, and the totals alone would not
have shown it.

## What this does NOT fix

**956 `unrecognised` rows remain across 22 sports**, and they are not duplicates:
only MLS ever produced mixed-scheme clusters, so for those the non-standard
writer is the *only* writer for that fixture. Merging is not the question there.

**The external writer is still running.** This merged the rows that existed.
`CC-CMD-2026-09-02-d1-write-provenance`'s instrumentation went live in `17ec554`
and is watching for the next one.
