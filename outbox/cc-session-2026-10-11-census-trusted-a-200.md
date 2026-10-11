# CC session — the census trusted a 200, and a degraded run became a baseline

**Date:** 2026-10-11
**Repo:** field-laboratory (the fix) and field-relay-nba (the corrected document)
**Asked for:** dispatch the census → then: correct done condition 3

---

## What happened

A census was dispatched to settle whether the misjoined-opening-odds count had
grown. It returned a number ten times the previous one, and the previous one
turned out to be the broken reading.

| | baseline `38145971449` | new `38164136622` |
|---|---|---|
| dates read | 120 | 120 |
| unavailable | **0** | **0** |
| games with a comparable pair | **140** | **1341** |
| captured at finalisation | 120 of 140 | **158 of 1341** |

**94 MLB games across 120 days.** No MLB season produces that. Every response
was a 200, so `r.ok` was true 120 times and the census reported `0 unavailable`.

`scripts/favourite-band-census.mjs` is byte-identical between the two runs —
`git diff 7200e55 0b9b0ea` over that path is empty — so the difference is
entirely in what the relay served.

### Why the relay served it

```
14:07:33Z  deploy FAILURE  efcf893
14:08:24Z  census run 38145971449   <- the baseline
14:12:44Z  deploy FAILURE  9c136d0
14:16:56Z  deploy success  c078a70
```

The baseline ran between two failed relay deploys.

**Causation is not proven and is not claimed.** The relay as it stood at 14:08Z
cannot be re-queried. What is measured: the bracketing deploy failures, the
identical script, and a game count no season produces.

---

## The answer the census was dispatched for

**158 flagged rows of 1341 games over 120 days**, and the distribution settles it:

```
total flagged                               158
inside the document's window 06-23..07-11   155
after it                                      3   (08-15 x1, 09-02 x2)
latest flagged date                  2026-09-02
```

**155 in-window is the document's own figure, reached a third way.** Its Step 1
D1 census said 155 at finalisation from the archive endpoint; this says 155 from
`/context/date` over a window six times longer. Three rows fall outside, the
last on 2026-09-02 — 39 days before this reading, and nothing since the finality
condition deployed.

`docs/CC-CMD-2026-08-25-misjoined-opening-odds.md` done condition 3 now carries
these numbers and the failed-deploy timeline, replacing `120 of 140`.

---

## The fix: three states, not two

`scripts/probe-epl-substrate.mjs` in this repo already says it:

> `/soccer-fbref/epl.json` returns HTTP 200 with `teams: {}` — the
> `empty`-not-`present` case. A boolean 'reachable' check calls both successes.

The census was the boolean. It counted `fetched++` for any date that decoded,
whether or not the payload carried a single game.

Now:

| state | meaning |
|---|---|
| `failed` | non-200, or the payload would not decode |
| `empty` | **200, and zero games served** |
| `present` | 200 with games |

and `gamesSeen` is counted **before** the comparable-pair filter — a date whose
games carry no moneyline+handicap pair is `present`, not `empty`. Conflating
those would have swapped one blind spot for another.

All three print where the result is read, not in a comment.

### The ratchet, and why it is a comparison rather than a floor

`collapsedSince(prev, now)` compares **games per present date** against the
previous census. A fixed threshold cannot answer "is 140 a lot" — that depends
on the window and the season. It can answer "did it fall off a cliff", which is
what a relay serving a tenth of its archive looks like.

The floor is half. On the real numbers: 11.18 games a date before, 1.17 after.

**A refused run does not write the reference.** That is the half that matters:
the old baseline became the baseline because nothing stopped it, and a run that
cannot be trusted must not become the thing the next run trusts.

A shorter window is not a collapse — the ratio is per present date, so
`--days 45` after `--days 120` reads as normal. That has its own test.

---

## Verification

| | |
|---|---|
| census self-tests | 20 → **34** |
| mutations added | **2**, both caught |
| the real collapse, as a test case | 11.18 → 1.17, from the two runs |

The two mutations each restore the defect: deleting the comparison, and
loosening the floor to a tenth so the collapse that actually happened would pass
while the guard still looked present.

## Not covered

- **The first run after this change is unguarded.** There is no reference file
  yet, and a first run cannot collapse by definition. The reference was NOT
  seeded from the healthy run: that artifact predates the `present`/`empty`
  split, so its `present` count is unknown and writing `120` would have recorded
  an assumption as a measurement. The next census writes the first real one.
- **One failure mode, not all of them.** A relay serving half its archive
  consistently, from the first reference onward, would never trip a comparison
  against itself. The check catches a change, not a steady-state lie.

---

## The ratchet shipped without its reference, and the first run proved it

Census `38164854448`, the first on the fixed script:

```
120 date(s) read, 0 unavailable, 1341 game(s) with a comparable moneyline+handicap pair
  served games: 120 date(s) present, 0 EMPTY (200 with no games), 3562 game(s) seen before the comparable-pair filter
```

The three states print. **On a healthy relay all 120 dates are `present` and
none is `empty`** — which is the shape the degraded run could not have had.

Then `outbox/favourite-band-census-latest.json` did not appear in the commit.
The workflow's commit step stages `outbox/favourite-band-census-*.txt` and
nothing else, so the reference the ratchet needs was written on the runner and
thrown away with it.

**Every run would have been a first run**, and a first run cannot collapse by
definition — so the guard would have reported nothing, forever, while looking
present. That is the same failure as the original: a mechanism that exists and
measures nothing.

Caught by looking for the file rather than by trusting the green run. Fixed by
adding the `.json` to the step's `git add`.
