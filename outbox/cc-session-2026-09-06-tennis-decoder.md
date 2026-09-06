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

## Status — DONE

- `data/tennis-live.json` — captured. 11 matches, 6 tournaments, all 11 carrying
  `sets_detail`. Statuses seen: `live`, `interrupted`.
- `src/Tennis.fs` — decoder and invariants. Builds with zero warnings.
- `src/Suite.fs` — 9 new rows. **119/119 held.**

## What the capture refuted

Five invariants were written down before the fixture existed. Two did not
survive contact with it, and one fact was supplied that had not been guessed.

**Refuted 1.** *"A completed set is 6-n, 7-5 or 7-6."* True of every set EXCEPT
the last, which may be in progress and legitimately 5-5, 4-3 or 2-4. The
in-progress set sits in the same array as the finished ones with nothing
marking it — `[{3,6},{6,1},{5,5}]` at 1-1 in sets. Applied to the whole array,
this invariant would have reported every live match in the fixture as corrupt.

**Refuted 2.** *"Best-of decides the ceiling: 3 sets wins a best-of-5."* There
is no best-of field, and it cannot be derived. `circuit` reads `"ATP"` on a
WOMEN'S match in the capture — UTR PTT Miami Women, `gender: "F"` — so the
obvious derivation is wrong on real rows. Not modelled. Inventing the rule
would be worse than leaving the ceiling unchecked.

**Supplied, not guessed.** `tiebreak` is an optional third key on a set, and
one of the two in the capture reads `[8,6]` — so a tiebreak is first to seven
WIN BY TWO, not a race capped at seven.

What survived: the summary-versus-list relation, the legality of sets before
the last, the tiebreak-belongs-to-7-6 rule, and that a finished match cannot be
level.

## The harness defect this produced, and how it surfaced

The row `EVERY MATCH IN THE REAL CAPTURE DECODES` first reported **NO TEETH**.

Its mutation was written inline in `Suite.fs` as a `.Replace` against
`{"p1": 6, "p2": 1}` — the shape a JSON object has when you picture one. The
capture is written by `JSON.stringify(payload, null, 1)`, so its real text is
`"p1": 6,` then a newline then four spaces. The anchor matched nothing, the
"corrupted" input was byte-identical to the clean one, and the row asserted
nothing while looking like a check.

This is exactly Rule 90's corollary: *a mutation that reports a result without
having been applied is worse than no mutation.* It was caught only because
`NoTeeth` is a verdict this suite can express. A plain boolean assertion would
have gone green and stayed green.

**The fix puts the guard in the value, not in a comment.**
`Fixtures.tennisLiveCorrupted` counts its own anchor's occurrences and returns
the ORIGINAL string unless there is exactly one. A broken anchor therefore
makes the mutated and unmutated inputs identical, the row reports NO TEETH
again, and the gate blocks. The harness cannot be told a mutation happened when
it did not.

Verified by mutating the guard itself: changing the anchor back to the
inline-JSON shape takes the suite from 119/119 to 118/119 with that row reading
NO TEETH. Restoring it returns 119/119.

## Coverage, stated where the result is read (Rule 91)

The capture carries statuses `live` and `interrupted` only. **No finished match
is in it.** `Sets.Finished` is exercised by constructed inputs, not by a
captured one, and `A FINISHED MATCH CANNOT BE LEVEL` is a claim about a shape
this fixture does not contain. Re-capture during a completed session to close
that gap.

## Not done here

Nothing in jubilant-bassoon. Replacing two hardcoded tournament windows with a
live feed is a real product change and belongs in its own scoped commit with
smoke, not appended to a probe session.

---

## Addendum — the recapture broke the suite, and that was my bug

`capture-tennis-fixture.yml` ran again at 05:55 and replaced the fixture: eleven
matches became eight, and Mensik's 6-1 second set was gone. Two rows went red.

    NO TEETH  EVERY MATCH IN THE REAL CAPTURE DECODES
    FAIL      ...and the capture is not empty, which forall would not catch
    117/119

Neither is a defect in the decoder. Both are the same authoring mistake: **I
coupled two checks to the CONTENTS of a file a workflow rewrites.** One asserted
`= 11` matches; the other's mutation was anchored to a specific set score. A
recapture is the fixture working as designed, and it must never read as a
regression in what the fixture tests.

The guard did its job. `tennisLiveCorrupted` refused to claim a mutation it had
not applied and reported NO TEETH, which is why this surfaced as an obvious red
row instead of a check quietly passing on unmutated source for weeks.

**Both fixed by making the checks functions of whatever the file holds.**

The count assertion is now "not empty", which is the actual claim — `forall` is
vacuous on an empty list, and that is the hole the row exists to close. A fixed
count added nothing and broke on every capture.

The mutation now sets the FIRST `"p1"` value to 99. A completed set of 99-n is
illegal at any n, and a live set is capped at 7, so it is a decode error
wherever that set sits in the array, for any capture. Re-proved by mutation:
making the anchor unfindable returns 118/119 with the row reading NO TEETH;
restoring it returns 119/119.

## Coverage, restated after the recapture

The 05:55 capture carries statuses `interrupted` and `live`. Still **no finished
match**, so `Sets.Finished` remains exercised by constructed inputs only. Two
captures, neither containing the shape. This is a timing problem, not a defect —
it needs a capture taken while a completed match is still in the live feed.

## Resolved this round

- **`S D P. Dev` is real.** BSD's `short_name` for `S D Prajwal Dev` (IN). The
  initials are the player's, correctly abbreviated. Not a rendering fault.
- **The probe's 6-of-7 was the probe.** `\b` before a digit cannot match when
  `textContent` glues the chip to the player name (`Ziegann0-0`). Reading the
  `.leader-chip` element instead: 8 of 8.
- **The en-dash `2-0 90'` is gone** from the card text at 05:55.
