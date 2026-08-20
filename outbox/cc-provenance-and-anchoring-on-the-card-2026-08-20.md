# Outbox — stage 3: provenance and anchoring on the brief, and a tighter loop

**Date:** 2026-08-20
**Ships:** provenance + anchoring lines on the brief face in `src/Scoreboard.fs`,
their CSS, two flip-check assertions, one mutation, and a `timeout-minutes` guard
on `verify-full`

## What the brief face now says

Under the prose and the scoreline verdict, two footnotes about the brief itself:

- **Provenance.** "answering model not recorded (proxy silent)" — for every
  stored brief, always.
- **Anchoring.** "N of M stat sentence(s) carry a time window", by the relay's
  own Dim 8 rule.

## The provenance line is a constant, and that is the finding

A stored brief carries no `X-FIELD-Model` header — nothing in the write path
reads it — so `Journalism.answeredFrom` returns `ProxySilent` for every archived
brief. `AnsweringModel` is unconstructible from stored data, which is exactly
what Phase 3 established, and the card now says it where the brief is rather than
only in a check.

The card shows "not recorded", never the request-body model as though it
answered. Naming the fallback as the answerer would be the silent substitution
the J-layer types exist to refuse — a provenance the data does not support, shown
as fact. The mutation `card-claims-provenance-it-lacks` makes exactly that
substitution and is caught.

The `declared fallback: <model>` line, when the brief carries one, is labelled as
what it is: the model named in the request body, not the one that answered. Two
different things the topology keeps separate, kept separate on the card.

## Anchoring, per brief

`Journalism.anchoring` counts a brief's stat sentences and how many carry a time
window. Across the corpus 45.5% carry none; this is that measure on the one brief
in front of you. Zero stat sentences reads as "no stat sentences to anchor"
rather than "0 of 0", which would look like a failure instead of an absence.

## The loop is tighter now

The confidence gate is ~22 minutes and grows as the mutation suite does. Running
it locally and blocking on it before every commit was the slow part of the loop.
Two changes:

- **`verify-full` gains `timeout-minutes: 45`.** The gate runs the whole mutation
  suite; a hung browser mutation or a serve that never answers would otherwise
  burn the runner's six-hour default. 45 is roughly twice a current run — loud on
  a genuine hang, slack for normal growth.
- **The gate moves onto the runner.** The affected checks run locally (fast), the
  commit pushes, `verify.yml` runs the full push suite on the runner, and the
  confidence gate is dispatched to `verify-full` rather than blocked on locally.
  The heavy gate runs where runners are cheap and I keep moving.

This is the standing instruction applied to the gate itself: if something slow
can run on a runner, it should, rather than blocking the session.

## Verified

`brief-flip-check` 16/16 in a real browser — the provenance line reads
proxy-silent on every flippable card, and the anchoring line is present.
`check:journalism`, `check:scoreline`, `check:unused`, `check:workflows`,
`check:docs`, `check:gate-rows`, `check:secrets`, `check:import-purity` all pass
locally. Three flip/verdict/provenance mutations caught, tree clean. Build clean,
zero F# warnings. The full confidence gate runs on `verify-full`, dispatched with
this push rather than blocked on here.

## What is not in stage 3

The aggregate Briefs tab is stage 4 — the corpus-level view: how many briefs are
ProxySilent, the anchoring rate across a slate, the quality distribution against
the 245 ceiling. Stage 3 is the per-brief half of the same numbers.
