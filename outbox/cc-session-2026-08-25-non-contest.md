# Session doc — the non-contest `Matchup` case (Rule 67)

**Date:** 2026-08-25
**Scope:** field-laboratory. Golf modelled as a non-contest; PGA Tour's
registry claim corrected; the probe that made both possible.
**HEAD:** `d28c02b` → `4ea140f` → `3955c6f` → this commit.

## What now works

The desk renders `golf · N` instead of `golf · N · UNMODELLED SPORT`, and a
golf card reads:

```
Bellerive Country Club
BMW Championship · R4
Wyndham Clark -17
```

Before this commit it read `BMW Championship vs R4` with a `—` scoreline —
a sentence stating that a tournament played a round, and a named leader
thrown away.

## Commits

1. **`4ea140f`** — `sport-vocabulary-check` samples the *declared*-unmodelled
   labels, not only the missing ones, and reads `SELECT *`. Since 2026-08-23
   every run reported `missing: []` and therefore `samples: null`, so the four
   labels actually waiting on evidence produced none, twice a day.
2. **`3955c6f`** — `docs/NON-CONTEST-DESIGN.md` and
   `docs/CC-CMD-2026-08-25-golf-sport-label.md`. Docs-only, no CI.
3. **this** — the build.

## The measurement that split the work

`drift-sentinel` run 48 (`outbox/sport-vocabulary-2026-08-25T01-24-34-105Z.json`):

```
sport="golf"      home="BMW Championship" away="R4" home_score=-17
                  note="Wyndham Clark -17"  espn_event_id="golf_401811963"
sport="PGA Tour"  home=null away=null home_score=-6 away_score=-6
                  espn_event_id="401811963"
```

Same ESPN event. PGA Tour is a **league within golf**, not a sport, and those
rows are the relay's generic ESPN walker writing a tour into the sport column.
Mechanism read from relay source: `src/index.js:7750` falls back to
`teams[0]`/`teams[1]` on a field of players, whose competitors carry `athlete`
and not `team` — so `-6, -6` is the top two players of round one with their
names stripped by that same lookup, not a tie between two sides.

So golf needed the `Matchup` case; PGA Tour needs the relay (Rule 60). Its
`Omission` previously claimed they shared the fix. That claim is now disproved
in the registry's own text and the correction cites the evidence.

## `orderByMatchup` → `presentByMatchup`

The rename is the substance, not cosmetics. Adding
`| NotAContest _ -> home, away` compiles and renders nothing visibly wrong on
any slate today — and hands a caller a pair when there is not one, which is the
same failure this function's own comment was written about. It now returns
`Presentation<'a>` = `Contest of first * second | Event of EventShape`, so four
call sites had to say what an event does:

| site | decision |
|---|---|
| `Desk.matchupText` | `"BMW Championship · R4"` — no separator that reads as a versus |
| `Scoreboard.scoreText` | drops the state's integer pair, reads `eventScoreText` |
| `PickemView.renderRow` | no buttons, and the reason stated |
| `Stats.sidesInHeaderOrder` | returns the decision; no golf row has been observed reaching a `ScoutingReport` |

## Two things caught while building

1. **Golf never reaches `Final`.** `gameStateAt` needs `Some h, Some a`, and
   golf's `away_score` is null — so every golf row arrives as `Scheduled` and
   would have rendered `—` forever. `scoreText`'s `Scheduled` branch checks the
   `Matchup` case. Without that, the whole feature was a no-op with green tests.
2. **A Fable union field is not a string.** `golfPres.fields[0] === 'LeaderboardSnapshot'`
   fails — the payload is itself a union that only looks like a string through
   `String()`. The guard reads `cases()[tag]` on both levels now. Caught by the
   guard going red, which is what it was for.

## Verification

- `node build/VerifyMain.js` — **68/68**, up from 64. The four added are the
  enumerated `eventScoreText` inputs, including the note-and-figure-disagree
  case that decides which column is the source of truth.
- `check:sports` — **12/12**, up from 9. Adds: golf modelled and non-contest;
  the exact rendered string; a NEGATIVE assertion that no contest separator
  survives anywhere in the line; the `Event` case read by name; and all 21
  other modelled sports enumerated as still `Contest`.
- `check:unnamed`, `check:pick`, `check:state`, `check:scoreline`, `check:docs`,
  `check:rows`, `check:gate-rows`, `check:workflows`, `check:staged-verifier`,
  `check:secrets`, `check:import-purity` — all green locally.
- `check:pickem` cannot run here (playwright not installed in this sandbox); CI
  runs it. `check:history` reports a local figure this repo's own
  `docs/history-boundary.txt` documents as meaningless on a shallow clone —
  189 commits here against CI's 699+.

## Not done, and why

- **`Program.fs:195`** still renders `"N row(s) not drawn — sides not named"`.
  Once golf is modelled the remaining count is PGA Tour shells, and rewording it
  is gated on `docs/CC-CMD-2026-08-25-golf-sport-label.md` landing. Rewording it
  now would describe a state that has not happened yet.
- **`Sport.PGATour` still exists as a case.** Deleting it would send
  `sportOfString "PGA Tour"` to `Unrecognised`, whose `Omission` is `None` — a
  daily drift-sentinel alarm for a decision that IS recorded. It goes when the
  rows stop, which its `Omission` now names as its unblock criterion.
- **`"E"` for even par** is not rendered. Universal golf notation, general
  knowledge, not measured here; both sampled rows carried `note`, so the branch
  is barely reachable. Stated in the code rather than left implicit.

## Carry-forward

One, and it has its own CC-CMD as Rule 87 requires:
`docs/CC-CMD-2026-08-25-golf-sport-label.md`, with a probe block, a done
condition that is a D1 count rather than a green deploy, and step 4 explicitly
withholding the archive DELETE pending human approval.

---

## Follow-up: verify run 135 went red, and it was right to

`b131aa6` failed `check:live`. **The feature worked** — the live desk rendered
the card exactly as designed:

```
golf_2026-08-24_bmwchampionship_r4
  BMW Championship · R4   Wyndham Clark -17   [Scheduled — no start time]
```

The failing assertion was `render-check.mjs`'s *every card has a real score or
an explicit scheduled dash*, whose test is `/\d+–\d+/.test(score) || score ===
'—'`. `Wyndham Clark -17` is neither. That check encoded the exact premise the
`NotAContest` case exists to break, and it caught the change the moment it
shipped. A correct gate, on a premise that moved.

**Widening it to `|| anything` would have deleted the check.** It is split
instead, and the half that matters is the negative one:

- *every contest card has a real score or an explicit scheduled dash* — the old
  rule, unchanged, on the cards it was written for.
- *no event card shows a contest scoreline* — an `N–N` in an event's score slot
  would be a fabricated tie between two sides that do not exist, since
  `home_score`/`away_score` on a PGA Tour row are the top two players of a
  leaderboard.
- *every card resolved the sport of its section* — the classification under
  test before anything is asserted through it. `closest('.sport-group')`
  returning null would give every card an undefined sport, which
  `NON_CONTEST.has` reports as false, silently reclassifying the golf card as a
  contest and making the split prove nothing.

## And a second defect the same run exposed

`[Scheduled — no start time]` on a round that finished. **A non-contest never
reaches `Final`** — `gameStateAt` needs both scores and an event carries one —
so the contest state machine reports every golf row as `Scheduled` and
`statusText` read that faithfully.

The session doc above already recorded "golf never reaches Final" as a finding.
It was acted on for the SCORE line and not for the STATUS line, and nothing in
the first round of guards would have noticed: every one of them asserted on the
score. The card was half-fixed and fully green.

`Desk.eventStatusText` settles it from `finalized_at`, which is the only column
that can — golf rows carry no `start_time` at all, so there is no clock to
compare and the date comparison `gameStateAt` uses has nothing to work with
either. `None` renders "No completion recorded", not "Scheduled": absent
completion is absent knowledge, and the row may be mid-round or may not have
started.

`statusText` now branches on the `Matchup` case BEFORE reading `state`, because
reading `state` first is what produced the bug.

**VerifyMain 70/70** (was 68). The two added enumerate both `eventStatusText`
inputs, each with the wrong answer as its counterexample.
