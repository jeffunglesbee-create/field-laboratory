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

## Result

Pending the dry run.
