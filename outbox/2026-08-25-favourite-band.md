# The band `favouriteAgreement` declines to judge

**2026-08-25.** Follows the `favourite-mismatch` the drift sentinel reported on
`MLB_2026-08-25_padres_pirates`.

## The gap

`Desk.favouriteAgreement` returns `NotComparable` when the two moneyline prices
separate by less than the book's own overround. That threshold is right and it
is derived rather than tuned — the function's own comment records
`MLB_2026-08-10_cardinals_phillies` at `-113/-107`, separating by 0.0136 against
a vig of 0.0474. There is no favourite there.

It also means a slice of every slate is **unjudged**. On 2026-08-25 that was 3
of 14 MLB games carrying odds — 21%. A handicap orientation that was
systematically wrong for CLOSE games would live in that slice permanently,
because nothing looks.

## What the census does

`scripts/favourite-band-census.mjs` reads N past `/context/date` payloads
through the **real compiled decoders**, calls the **real `favouriteAgreement`**,
and additionally computes a shadow verdict without the vig gate — purely to fill
the band the real function declines.

**The shadow is validated against the real function before any number is
reported.** Wherever `favouriteAgreement` says `Agrees` or `Disagrees`, the
shadow must say the same. One mismatch and the script prints `CENSUS VOID` and
exits non-zero, because a shadow that has drifted from the rubric measures
nothing. There is no second copy of the rubric in this file.

## How to read the result

- **~50% agreement in the band** — the handicap carries no information there,
  which is exactly what a true pick'em looks like. Nothing to fix; the gate is
  correctly conservative.
- **Far below 50%** — a systematic inversion living inside the band, invisible
  to the gate. That would be a relay-side finding.
- **Any disagreement in the JUDGED set** — each one is a real anomaly like the
  Padres row, and the census lists them widest-separation-first.

## One thing already visible from the self-test

```
shadowVerdict(-113, -107, 1.5, -1.5) === 'disagree'
```

The 2026-08-10 near-pick'em that motivated the vig threshold has the **same
shape** as the 2026-08-25 Padres row: home is the (slim) moneyline favourite and
holds `+1.5`. Two for two, in the only two cases anyone has looked at. That is
the reason to run a census rather than reason from two games.

## Run it

```
gh workflow run favourite-band-census.yml -f days=45
```

Dispatch-only. The sandbox 403s `*.workers.dev` at the proxy, and there is no
reason to schedule it — the question is answered by a census, not monitored.
Output commits to `outbox/favourite-band-census-<timestamp>.txt`.

## Unblock criteria (Rule 74)

- **Blocked on:** nothing. It runs on demand.
- **Verify:** the committed census file exists and its `shadow validated …: 0
  drift` line is present. If it reads `CENSUS VOID`, the finding is that the
  shadow and the rubric have diverged, and that is reported rather than worked
  around.
- **Then:** if band agreement is far below 50%, file a relay CC-CMD against the
  odds adapter's handicap orientation. If it is near 50%, record that the gate's
  blind spot is empty and close this line of enquiry.
