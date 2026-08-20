# Outbox — stage 4: the Briefs tab, the aggregate of everything stages 1–3 show per card

**Date:** 2026-08-20
**Ships:** `src/BriefsView.fs`, a `Briefs` tab in `index.html` + Program wiring,
its CSS, tab-check updated for the seventh tab, browser assertions and a mutation
in `brief-flip-check`

## What it is

The last stage of surfacing the journalism work: a tab that states, for the
whole slate, the numbers each card shows for one brief. Four aggregates, each a
restatement of a finding that already has a per-brief form and a check behind it:

| aggregate | the finding it restates |
|---|---|
| N / N record no answering model (proxy silent) | `AnsweringModel` unconstructible — Phase 3 |
| N / M stat sentences carry no time window | 45.5% unanchored — Journalism |
| N / N carry no `scoring_version` | the rubric is unrecorded — Phase 2, Corpus |
| mean quality / 245 | the reachable ceiling, not the nominal 300 — Ceiling |

Nothing is asserted here that is not also measured elsewhere. The tab is the
view a single card cannot give — the shape of the whole slate's briefs — over the
exact same `payload.Briefs` the cards flip to reveal. No fetch, no generation.

On a live scheduled slate the payload carries no briefs, and the tab says "No
briefs on this slate" rather than drawing an empty frame — the same honest state
the cards show by simply not flipping.

## Why the quality line names 245, not 300

The `quality_score` is nominally 0–300, but the relay's own scorer cannot reach
300 — `Ceiling.relayReachable` is 245, the finding the bar-scale CC-CMD landed
against. The mean is shown against the reachable ceiling, so a brief scoring 200
reads as most of the way up the scale the scorer can actually use, not two-thirds
of a ceiling it can never touch.

## The tighter loop caught the tab-count pin before the gate

`tab-check` pins the tab count — "six top-level tabs exist" — and drives
End-jumps-to-last. Adding a seventh tab broke three of its assertions. That is
the check working: the count is pinned precisely so a tab added or dropped is a
visible, deliberate change rather than a silent one. Updated to seven, with
Briefs as the new last tab and an ArrowRight step to reach it.

Running the full browser suite locally before committing surfaced this in
seconds, where the old loop would have found it 22 minutes into a gate run. That
is the loop change from stage 3 paying off on its first real regression.

## Verified

`brief-flip-check` 20/20 — the four flip stages plus the Briefs tab: the panel
reveals, the four text briefs aggregate (not the empty-text or no-brief games),
the `scoring_version` and proxy-silent findings restate at slate level, and the
anchoring and quality-vs-245 lines are present. `tab-check` 30/30 after the
seventh-tab update. The full browser suite — `check`, `check:hard`, `check:nav`,
`check:tabs`, `check:pickem`, `check:spark`, `check:pick`, `check:outlet-scan` —
passes. `check:journalism/unused/workflows/docs/gate-rows` pass. The
`briefs-tab-counts-empty` mutation — counting a text-less brief in the aggregates
— is caught. Build clean, zero F# warnings.

The confidence gate runs on `verify-full`, dispatched with this push, after the
affected and browser checks passed locally.

## The journalism UI, end to end

Stage 1 flips the card to the brief. Stage 2 badges its scoreline against the
final. Stage 3 states its provenance and anchoring. Stage 4 aggregates all of it
for the slate. Every layer renders a decode the desk was already doing and
throwing away, run through the F# journalism modules already built and checked —
and every layer says nothing rather than invent something when the brief, or the
slate, has nothing to show.
