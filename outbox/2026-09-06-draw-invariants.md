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

---

## The capture landed, and the mutation guard earned its keep again

`data/tennis-draw.json` — Roland Garros WTA 2026, **127 main-draw matches, 126
edges, zero anomalies, champion Mirra Andreeva**, captured from the deployed
relay. Four fixture-backed rows added; **134/134 held** (was 130).

The first version of `tennisDrawCorrupted` anchored on the first `"round": "`
anywhere in the file. That lands in the `rounds` **summary table** — a sibling of
`nodes` that `decodeResponse` never reads. The payload was mutated, the decode
was unaffected, and the row reported `NO TEETH`.

That is the guard working on exactly the mistake it exists for: the mutation
**was** applied and changed nothing the check could see. A boolean would have
said PASS. The anchor now finds `"nodes":` first and mutates the first round name
after it.

This is the second time in one session a mutation has been anchored to the wrong
thing, and both times the `NO TEETH` verdict — not review, not reading — is what
caught it.

## The relay verify, after the cancelled-row fix

**30/30, three editions, all 200:**

```
135/2025  64 31 16 8 4 2 1   123 edges, all re-derived, champion Carlos Alcaraz
                             Round of 64 declared off-canonical
 77/2026  64 32 16 8 4 2 1   126 edges, all re-derived, champion Mirra Andreeva
 14/2026  64 32 16 8 4 2 1   126 edges, all re-derived, champion Carlos Alcaraz
```

The two 409s the earlier draft of this doc left open are resolved, and the answer
was **not** the convenient one being assumed — it was measured. Six duplicate
player-rounds across five editions, six of them a `cancelled` row beside its
`finished` replacement, **zero with two live rows**. The shape names itself: the
player keeps their slot and the opponent changes, which is a withdrawal.

So the 65-and-66 first rounds were never the vendor doubling a round, and this
document's own table above — which listed them as "two extra first-round rows" —
was describing withdrawal rows without knowing it. Excluding cancelled rows puts
every edition at 127 matches, exactly what a 128 draw holds.

---

## The 128 ladder, and the tier that could not catch it

`canonicalSize` is `1 <<< (6 - roundIndex)` — a 128 draw. Correct for a slam,
wrong for everything else, and **every edition anything here had read was a
slam**: 14, 15, 76, 77, 135, 136, 101, 102.

A Masters 1000 is a **96 draw**: 32 players get a bye, so its first round holds
32 matches where the ladder says 64. Read against the deployed relay, all ten
`masters_1000` ids:

```
 63 Madrid   67 Rome   130 Cincinnati   45 Miami
693 Montreal 175 Shanghai 125 Toronto     R128=32 R64=32 R32=16 R16=8 4 2 1
 56 Monte Carlo   196 Paris               R64=24 R32=16 R16=8 4 2 1
 42 Indian Wells                          R32=16 R16=8 4 2 1
```

**Nine of ten were flagged off-canonical on their entry round, and not one was
missing a match.** Byes only ever affect the entry round, so every round after
it is exactly `2^(levels above the final)` whatever the draw size — and that
held on all ten.

The one apparent exception is why this stays a query rather than being dropped:
**Toronto 2025 serves `Round of 32 = 15` where 16 belong.** Short by exactly one,
in an *inner* round — the same shape as US Open Men 2025's `R64 = 31`. That is a
match the vendor does not have, and it is precisely what the function exists to
find. A rule that explained it away would have hidden the only true positive in
the set.

So `entryRound` is a new query, and `roundsOffCanonicalSize` excludes it.

### Three rows broke, and that was the rule working

`...and the off-canonical round is REPORTED` went red, and `the captured draw is
canonical in every round` went **NO TEETH** — both because their inputs used a
lone `Semifinals`, which is now the entry round and exempt.

Neither is a defect in the rule. Both rows had asserted, without anyone noticing,
that *an entry round reports*. The inputs are now four quarter-finals and one
semi-final — an inner round short by one, which is Toronto 2025 in miniature.

**136/136 held** (was 134). Two new rows: the entry round is never off-canonical
whatever the draw, and the entry round is the outermost round *present* — not a
fixed one, because Monte Carlo and Paris start at Round of 64 and a
mid-tournament Indian Wells started at Round of 32.

### And the mirror, found minutes later on the live page

`tennis_draw_probe` ran against the deployed page right after the entry-round
fix and came back PASS — with the anomaly line still showing:

```
136 US Open, Women 2026
R128=64  R64=32  R32=16  R16=8  QF=1
→ "Quarterfinals holds 1 matches where 4 make a full round"
```

Three quarter-finals were not missing. **They had not been played yet.**

Same class of error, opposite edge. The test for still-being-played is the
Final: a draw whose Final exists **and has a winner** is finished. A Final that
is merely present is scheduled, not played — which is its own suite row.

Both exemptions are about the edges of what is known — **the outer edge shaped by
byes, the inner edge by the calendar.** Everything between them stays checked,
which is the point: US Open Men 2025's `R64=31` and Toronto 2025's `R32=15` are
interior, real, and still found.

**138/138 held.** The relay carries `complete` and `openInnermostRound`, and
`verify-tennis-draw` gained a guard on the guard: all four editions must read as
complete, because if the Final's winner stopped being read every canonical
figure would quietly go null and the other assertions would pass by being about
nothing.

---

## Session close-out

**HEAD** `1073600` → `2b96b9c` · **branch** `main` throughout · **144/144 held**
(was 119 at session start).

> Corrected 2026-09-07: this header read `6c474d3` and `138/138`, which was
> true when it was written and false by the time the section it heads was
> finished. The subsections below keep their own counts on purpose — each
> records what held at that point — but a close-out header is a summary of
> the end state and this one had been left at the middle.

### What this repo holds now

`src/Draw.fs` — the knockout draw as a type. 15 rows in `Suite.fs`, plus
`data/tennis-draw.json`, a captured Roland Garros WTA 2026: 127 main-draw
matches, 126 edges, champion Mirra Andreeva, zero anomalies.

| refused — a `Draw` cannot exist with it | reported — a query on a valid draw |
|---|---|
| same player twice in one round | `roundsOffCanonicalSize` |
| winner not one of the two players | `playersFromNowhere` |
| two matches sharing an id | `entryRound`, `isComplete` |
| a round name outside the seven | |

### What the type found that nothing else did

**`AmbiguousEdge` was unreachable.** The case was written for the condition the
relay returns 409 on, and no input could reach it: a winner can only appear in
two next-round matches if that player appears twice in that round, which
`PlayerTwiceInRound` refuses first. Deleted here; the relay keeps both, because
the reverse does not hold — two unplayed rows sharing a player produce no edge
at all.

The row did not merely pass. **It could not be written, and the reason was a
fact about the design.**

### Three rows broke, and each break was the rule working

| row | what happened | why |
|---|---|---|
| `...the off-canonical round is REPORTED` | went red | its input used a lone `Semifinals`, now the entry round |
| `the captured draw is canonical` | went **NO TEETH** | same cause |
| `tennisDrawCorrupted` | went **NO TEETH** | anchored on the `rounds` summary table, which `decodeResponse` never reads |

None was a defect in the rule. Two had been asserting, unnoticed, *that an entry
round reports*. The third mutated a payload and changed nothing the check could
see — **a boolean would have said PASS.**

### Carry-forwards

- ~~`Sets.Finished` has no captured match behind it~~ — **closed below.**

## `Sets.Finished`, and two things the data knew that the model did not

The live capture comes from `/bsd/tennis/matches/live`, which by construction
carries only matches in progress — both captures hold `live` and `interrupted`
and nothing else. So the branch modelling a **completed** match was exercised by
constructed inputs alone.

`data/tennis-draw.json` closes it without a new workflow: a finished Roland
Garros, 127 matches, every one played out. And the set shape is identical — the
relay passes `sets_detail` through untouched, so `setDecoder` already reads it.
`decodeDrawNodes` feeds them to a new `decodeFinal`, which is given a match
known to have ended and so has no summary to reconcile.

Running it against the real capture refuted the model twice.

### Retirement is a third state

Three of 127 refused, all `status: finished`, all stopping mid-set:

```
35384  R64   4-5
35152  R128  3-6 6-0 4-1
35142  R128  7-6 2-1
```

`4-5` is not a set anyone won. **The player retired.** The match is over with a
set unplayed out — neither `Finished` nor `InPlay`.

So `Sets` gains `Retired of completed * abandoned`, a third case rather than a
flag, for the same reason `LiveSet` is not a `CompletedSet`: the abandoned set is
not one a completed-set rule may be applied to, and now it cannot be. FS0025 is
an error here, so every reader had to handle it — `currentSet` answers `None` (a
retirement has no current set; `abandonedSet` is the different question), and
`endedLevel` answers `false`, because a retirement at one set all is normal and
flagging it would call every retirement corrupt.

### One vendor row is not a scoreline

The last failure was `IllegalCompletedSet(index 1, 6-4)` — and 6-4 is legal. The
guard fired on the **tiebreak**:

```
node 36028  R16   4-6  6-4(40:15)  6-0
```

`tiebreak: [40, 15]`. Those are **game points**, not a breaker. `completedSet`
allows a tiebreak only on a 7-6 and refused it, correctly.

**Not repaired.** Inventing a rule to drop a tiebreak that looks wrong is the
smoothing this repo refuses. The suite row asserts a **proportion** — nine tenths
decode — because asserting all 127 would assert something false about the data.
A second row requires every refusal to be an `IllegalCompletedSet`, so a decoder
that simply gave up would not pass.

The falsifier corrupts **every** set rather than one: a proportion cannot be
falsified by breaking a single match out of 127.

**142/142 held** (was 138).
- ~~`check:window` is red on main~~ — **fixed below.**

## `check:window`: it had not found a difference, it had failed to look

Red on main, and not from this work. It took **tomorrow's** 02:00 UTC once
today's had passed, so it compared two days that have not happened:

```
2026-09-07: 0 games
2026-09-08: 0 games
FAIL  the two days return different slates
      → both returned 0 identical games — the zone choice made no difference
```

A future day has no slate. The check had not found a difference; it had failed
to look somewhere one could exist, and reported the second as the first.

**The fix.** Candidates are now 02:00 UTC on each of the last 10 days, newest
first and all in the past, starting at yesterday — today's 02:00 may not have
passed, and a day still being played is the empty case being avoided. It takes
the first pair where the two days differ **and at least one carries a slate**.
Days are cached, because one candidate's ET reading is the next one's UTC
reading.

**Three states, not two.**

| state | meaning | exit |
|---|---|---|
| the slates differ | the zone choice changes the answer | 0 |
| identical non-empty slates | a real failure | 1 |
| no usable candidate | **UNPROVEN** — it does not assert | 0 |

And one new check that cannot pass vacuously: **every candidate empty on both
days** is a source that has stopped answering, not a quiet week. Ten in a row is
not an off day, and it is the only place that would notice — the other two
checks pass on nothing.

Demonstrated failing, not asserted: run from the sandbox, where relay egress is
403, it reports `HTTP 403` on both days, fails the new check by name, and exits
1.

### Two dead public values, and a floor picked by eye

`check:unused` had been masked: it runs after `check:window` in the same chain,
and window's failure exited first. With window fixed, it named two:

```
src/Draw.fs: pathOf
src/Tennis.fs: completedPair
```

`pathOf` was mine and had never had a caller. `completedPair` was
**unreachable** — the `Sets` cases are private, so nothing outside could obtain a
`CompletedSet` to pass it.

Both now have real consumers rather than deletions, because a bracket prints
exactly these two things:

- **`setScores`** — every completed set of a match, as game pairs. The one way
  out of `Sets`. Completed only: a live set is not a score anyone won and a
  retired match's abandoned set is not either, and each has its own accessor so
  no caller can mistake one for a result.
- **the champion's path** — one match per round, every one won, no round twice,
  which is the premise the winner-join rests on.

**The set-score row failed first, on a number I picked by eye.** It asserted more
than 300 completed sets; the capture holds **284 across 126 matches**. A floor
guessed from the shape of the data fails on the next capture, so it now asserts
**more sets than matches** — true of any real tennis, since the shortest
completed match is two sets, and false of a read that returned nothing.

**144/144 held.**
