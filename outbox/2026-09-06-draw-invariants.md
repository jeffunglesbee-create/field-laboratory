# The knockout draw as a type, and one case the type deleted

2026-09-06. `src/Draw.fs`, 11 rows in `Suite.fs`, 130/130 held (was 119).

## What this is

`Tennis.fs` models a scoreline — what happened inside one match. `Draw.fs`
models the shape — which match feeds which. They fail differently, and the
difference is why they are separate modules:

- a wrong scoreline shows a **wrong number** beside two correct names
- a wrong join shows a **correct number** beside a player who was not there

## Where the edges come from

BSD serves no bracket. The 2026-09-06 schema census read 217 declared paths;
the tennis surface carries matches, h2h, point-by-point, players, rankings,
tournaments and predictions, with no `/draw/` and no `/bracket/`. There is also
no parent-link field on a match row — the key census read exactly `id`,
`tournament`, `player1`, `player2`, `is_doubles`, `home_pair`, `away_pair`,
`match_date`, `status`, `round_name`, `player1_sets`, `player2_sets`,
`sets_detail`, `winner_id`, `odds_player1`, `odds_player2`.

The edge is read anyway, because in single elimination the **winner is the
link**: a player appears in at most one match per round, so an R64 winner
appears in exactly one R32 match. Measured against a real slam edition:

```
YES — 126 edges resolve to exactly one next match by winner identity,
0 ambiguous; no parent-link field, and none needed
```

The alternative — pairing match 1 with match 2 by draw position — is what this
module exists to make impossible. It produces a complete-looking bracket out of
an ordering nobody promised.

## The split: refused versus reported

Decided by reading six real slam editions on 2026-09-06, not by taste.

| edition | ladder | |
|---|---|---|
| Roland Garros Women 2026 | 64 32 16 8 4 2 1 | canonical |
| Australian Open ATP 2026 | 66 32 16 8 4 2 1 | two extra first-round rows |
| Australian Open WTA 2026 | 65 32 16 8 4 2 1 | one extra |
| Roland Garros ATP 2026 | 66 32 16 8 4 2 1 | two extra |
| US Open Men 2025 | 65 31 16 8 4 2 1 | one extra, one **missing** |
| US Open Women 2026 | 65 32 16 8 | in progress |

**One of six is canonical.** So "rounds halve" cannot be a construction law: as
a law it rejects five real slams and passes on the tidy one. That is the shape
of every apparatus defect this repo has counted, and it was written down here
before it was made rather than after.

**Refused** — a `Draw` value cannot exist with these, because each renders a
wrong bracket rather than an incomplete one:

- the same player twice in one round
- a winner who is not one of the two players in their own match
- two matches sharing an id
- a round name outside the seven the draw has

**Reported** — queryable on a valid draw, because both are the data:

- `roundsOffCanonicalSize` — five of six editions
- `playersFromNowhere` — US Open Men 2025 serves 31 second-round matches where
  32 exist, so a player reaches Round of 32 with no winning row behind them

## The deleted case

An `AmbiguousEdge` error was written for the condition the relay returns 409 on:
a winner appearing in two next-round matches. Its suite row could not be given
an input that reached it.

For a winner to appear in two next-round matches, that player must appear twice
in that round — and `PlayerTwiceInRound` refuses first. The ambiguity check is
**strictly subsumed**: every draw it would reject is one the player-twice law
rejects earlier, and the reverse does not hold (two unplayed first-round rows
sharing a player produce no edge at all, and are still not a draw).

So the case is gone, rather than left standing as an unreachable refusal that
reads exactly like an enforced one.

The relay's 409 **stays, and is reachable there**: `/bsd/tennis/draw` performs
the join with no player-twice law, so ambiguity is the only guard at the
boundary where the vendor's rows arrive. A follow-up commit adds the stronger
law to the relay as well.

This is the type doing the work the suite was built for. The row did not merely
pass — it could not be written, and the reason it could not be written was a
fact about the design.

## Coverage, stated where the result is read (Rule 91)

The 11 rows use four-player mini draws (two semi-finals and a final), not a
captured 127-match edition. A mutation has to be readable to be trustworthy —
see the `NO TEETH` the tennis fixture row earned when its mutation was anchored
to a set score the next capture overwrote. Two rows decode a real relay payload
shape; **no captured slam edition is in the fixture set yet**, and the capture
that would add one is a follow-up, wired in the same session.

---

## Follow-up, same session: a captured slam draw

`scripts/capture-tennis-draw.mjs` + `capture-tennis-draw.yml` (dispatch-only).

The eleven rows above use four-player mini draws, deliberately — a mutation has
to be readable to be trustworthy. That leaves one thing unproven: that `Draw.fs`
decodes an actual slam. This captures one.

**Roland Garros WTA 2026, BSD tournament id 77.** Measured 2026-09-06 by
`scripts/verify-tennis-draw.mjs` against the deployed route, it is the only one
of the three editions checked that answers 200 and is canonical throughout:

```
 77/2026   64 32 16 8 4 2 1   126 edges, all re-derived, 0 anomalies,
                              champion Mirra Andreeva
135/2025   409 — a player in two Round of 128 rows
 14/2026   409 — two players in two Round of 128 rows each
```

The two 409s are the relay's new player-twice guard firing, and **why they fire
is being measured, not assumed** — `bsd-tennis-duplicate-rows` prints both rows
of every duplicate across five editions. Either two editions leaked past the
season partition (the guard is right, the partition is wrong) or a cancelled
fixture sits beside its replacement (the guard is too strict). The second is the
likely reading and also the convenient one, which is the reason to measure it.

**Four refusals in the capture**, each naming what it protects:

| refusal | what it protects |
|---|---|
| not HTTP 200 | an unreachable relay is not an empty draw |
| fewer than 7 rounds | a partial draw verifies four rounds and reads as seven |
| no Final winner | `champion()` is one of two read paths this fixture exists to run |
| zero edges | every `List.forall` in the suite is vacuous on nothing |
