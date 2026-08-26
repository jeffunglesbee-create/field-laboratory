# "Not observable" was a shrug. It is a number now.

**2026-08-26.** `computed-chrome-check.mjs` + `docs/not-observable.txt`.

## The gap

Three of this check's assertions run against elements the default fixture does
not render, or renders only once. The check reported that honestly:

```
      sport filter: distinguishable via a cloned sibling — color, borderLeftColor
      note: 1 modifier(s) restate their base but were never seen applied — .pk-side--none
      .briefs-stat    not observable (0 rendered)
```

Honest, and where it stopped. A line of prose on an otherwise-green run costs
nothing, so none of the three ever got fixed. The three-state discipline this
repo insists on — `true` / `false` / `null`, never conflated — had become two
states plus a shrug.

## What changed

`null` is a number. Every gap the run finds must be declared in
`docs/not-observable.txt` with the corpus that would close it:

```
contrast:sport filter    a capture whose slate spans two or more sports, so two
                         real .pk-sport chips render with different --on states
rows:.briefs-stat        a capture with two or more joined briefs — both
                         committed render fixtures carry briefs: []
state:.pk-side--none     a pick fixture where a side is genuinely absent AND the
                         span also carries .pk-side, which PickemView does not
                         currently emit
```

Two assertions, both ratchets:

1. **A new gap fails.** An assertion that quietly stops being exercised — a
   fixture change, a renderer change — now has to be written down.
2. **A gap that CLOSES also fails**, until its line is deleted in the commit
   that closed it. An entry nobody removes is how a ledger becomes decoration.

The `needs` column names a fixture that can actually be built. An unbuildable
requirement is the same shrug in a longer form.

## The entry that would otherwise have been missed

**A cloned sibling is a gap.** `.pk-sport--on` is measured against a clone of
itself with the modifier stripped, because this slate renders one sport. That
fallback is sound and it is *not* an observation: it proves the CSS differs, not
that a reader ever sees the two states side by side. It passes its assertion,
prints `via a cloned sibling`, and now also appears in the ledger.

The pick button is *not* a gap — it is measured against two genuinely rendered
siblings. The distinction is the point.

## Evidence

Both new assertions mutation-tested:

```
# ledger line removed
FAIL  every gap this run found is declared in docs/not-observable.txt
      → rows:.briefs-stat (0 rendered) — add a line naming the corpus that would close it

# bogus line added
FAIL  every gap declared in docs/not-observable.txt is still a gap
      → rows:.nonexistent is observable now — delete its line in the commit that closed it
```

Clean run: **13/13**, up from 11/11.

## Known exposure, fixed next

`verify.yml` carries `paths-ignore: docs/**`, and this check now READS a file
under `docs/`. Editing the ledger alone does not re-run the check that consumes
it — the same defect `guards.yml` was written for in field-relay-nba, in this
repo. Deleting a closed entry is safe (it rides with the source commit that
closed it); adding a bogus entry alone is not caught. Next commit.
