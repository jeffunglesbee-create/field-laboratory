# 2026-09-06 — the tennis decoder, and the fixture it is written against

## What prompted this

Two measurements from field-relay-nba the same day.

**One.** `/bsd/tennis/matches/live` and `/bsd/tennis/matches/{id}` have existed
in the relay with zero consumers. `grep -c "bsd/tennis"` across
jubilant-bassoon's `src/legacy/field.js` returns 0. Two routes, no callers.

**Two.** The client's only tennis is two hardcoded tournament windows:

    field.js:8900   Italian Open     2026-05-06 -> 2026-05-17
    field.js:37733  Roland Garros    2026-05-24 -> 2026-06-07

Today is 2026-09-06. Both gates evaluate false, so no Tennis section is pushed,
so `fetchATPLiveScores()` returns at its first line —
`if(!document.querySelector('.sport-section[data-sport="Tennis"]')) return` —
and nothing polls. The ATP poller is wired, live, and unreachable. Tennis
renders nothing while the US Open is playing.

The competition census run the same morning put **636 tournaments** on BSD's
tennis surface against 83 on football. The largest surface the vendor serves is
the one FIELD shows nothing from.

## Why laboratory and not the client

A tennis scoreline is a shape nothing in this repo can express. Every `Sport`
case modelled here resolves to a two-number scoreline under `HomeVersusAway` or
`AwayAtHome`. A tennis match is an array of per-set pairs with the match score
derived from it, and that array carries invariants a two-number score has none
of: a completed set cannot be 4-3, a tiebreak set is 7-6, and the count of sets
won must agree with the sets listed.

That is laboratory's job — the place a new shape gets a decoder and an
invariant before it reaches a client that renders 34,000 lines from one file.

## Order of work, and why this order

1. **Capture the fixture first.** `scripts/capture-tennis-fixture.mjs`, run on
   a runner because the sandbox 403s `*.workers.dev`.
2. **Read the real shape.** Not the 700-character truncated sample in
   `field-relay-nba/outbox/bsd-api-probe-latest.json` — that is a copy, and a
   truncated one.
3. **Then write the decoder**, against what the capture actually contains.

The repo rule this follows verbatim: *a cross-boundary fact is not verified by
reading*. The discriminating question — *is this the source, or a copy of the
source?* — answers itself here. The probe sample is a copy. The captured
payload is what the relay serves.

## The two refusals in the capture script

Zero live matches is the obvious one.

The one that matters: **a payload where no match carries `sets_detail` is
refused**, not accepted as a smaller fixture. That array is the entire reason
tennis is being modelled. An off-hours capture would satisfy any bare
row-count floor while leaving the decoder verified against a shape the fixture
does not contain — a fixture that looks captured and proves nothing, which is
this session's recurring defect in a new costume.

## Status

- `scripts/capture-tennis-fixture.mjs` — written, refusals in place.
- `.github/workflows/capture-tennis-fixture.yml` — dispatch-only, no schedule.
- `data/tennis-live.json` — NOT YET CAPTURED. The decoder is not written until
  it exists.
- Decoder and invariants — pending the fixture.

Unblock criteria (Rule 74): dispatch `capture tennis fixture` while play is on;
the fixture lands at `data/tennis-live.json` with a `data/PROVENANCE.md` entry
naming the row count, tournament count and how many rows carry `sets_detail`.

## Not done here

Nothing in jubilant-bassoon. Replacing two hardcoded tournament windows with a
live feed is a real product change and belongs in its own scoped commit with
smoke, not appended to a probe session.
