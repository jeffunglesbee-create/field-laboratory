# CC-CMD-2026-08-21-closing-odds-capture

**Filed from:** field-laboratory
**Ask to:** field-relay-nba (AmbientDO — the pre→live game-state hook)
**Status:** WITHDRAWN AND SUPERSEDED, and the surviving ask is now HALF VERIFIED.
The original ask is closed — the hook was already landed and firing, and the real
defect (a third `closing_odds` writer in `/archive/game`) is FIXED by relay
`887c843`, `f6fa820` and `a1937eb`. **Verified 2026-08-23: 8 of 8 games carrying
both prices are a real sequence, all 8 show movement, and `OddsStory.Moved` is
reachable from production data for the first time since it shipped in June.** The
soccer half — that EPL and La Liga now carry an opening line — is NOT closed by
that aggregate and needs a per-sport split to settle; see the staged block below.
Original text kept for the record.

> **Re-file, not a status edit.** Two sessions have now flagged that this
> document should be withdrawn and re-filed as an opening-capture ask rather
> than left as a closing-odds ask with a correction stapled on — a reader who
> stops at the title acts on the wrong thing. This edit does the withdrawal;
> the surviving ask is stated in full here so nothing needs reconstructing from
> the original text below.

## THE SURVIVING ASK — capture `opening_odds` for EPL and La Liga

`Moved` is blocked two independent ways, and only one of them was the original
ask's subject:

- **MLB / WNBA — UNBLOCKED.** `887c843` produced a real open→close sequence.
  Verify on the next pre→live transition: `closing_odds.captured_at >
  opening_odds.captured_at`, and the card reads `ML X -> Y (home ±N.N implied)`
  rather than `NOT SEQUENCED`.
- **EPL / La Liga — STILL BLOCKED, and on the mirror of the original
  assumption.** Measured 2026-08-21: both carry the **closing** line and **no
  opening** one. The ask as filed assumed the opposite.

**Probe before patching.** `odds_api` opening writes cover MLB, WNBA and Ligue 1
but not EPL or La Liga. Find out why that split exists before changing a writer —
a fix aimed at the wrong half of the pair is how this document came to need a
withdrawal in the first place.

Carry-forward #1 (`_ODDS_SOURCES`) is done. #2 (team aliasing) and #3
(non-AmbientDO sports) survive.

One-liner (as filed):
```
The laboratory's line-movement rendering (OddsStory.Moved) is built and dormant:
it never fires because closing_odds is a same-instant backfill, not a real
post-open capture. Capture closing odds when a game transitions pre→live so the
open→close pair is a genuine sequence — then movement narrates itself.
```

---

## CORRECTION — what HEAD showed (relay/client execution, 2026-08-21)

The relay session probed HEAD before building and found this ask's premise stale.
Recorded here rather than quietly deleted.

**Wrong: "land (or re-activate) the pre→live hook."** It is already landed and
firing — `_captureClosingOdds` (`src/ambient-do.js:718`), wired from
`pendingStarts` (`:498–500`), deduped by `_gameStarts` (`:394–397`). **18 real
captures, 2026-07-04 → 2026-08-21**, the last two being the very cards on the desk
(Betis `19:03:03Z`, Arsenal `19:01:36Z`). Carry-forward #1 (`closing_odds_capture`
in `_ODDS_SOURCES`) was also already done (`src/brief-freshness.js:12`).

**The real defect (FIXED, `887c843`).** `.github/scripts/odds-backfill.js` wrote
one historical snapshot into **both** `opening_odds` and `closing_odds`, even for
un-kicked-off games. `_captureClosingOdds` updates `WHERE closing_odds IS NULL`,
so the batch won that race permanently and the kickoff capture could never land —
which is exactly the `NOT SEQUENCED (10:00:54Z vs 10:00:37Z)` the WNBA cards show.
Fixed with a date gate (a played game legitimately keeps the one-snapshot-in-both
behaviour; today and later, `closing_odds` stays NULL for the hook to own), guarded
by `scripts/check-closing-odds-not-prefilled.mjs`, negative-tested.

**A second defect, and a correction to THIS doc's own reading.** I filed from the
"one snapshot" text on the Arsenal/Betis cards and inferred their `closing_odds`
was NULL and the hook had not fired. Both halves were wrong. Measured: EPL and La
Liga carry the **closing** line and **no opening** one — the mirror of my
assumption. So `Moved` is blocked two independent ways:

- **MLB / WNBA** — defect 1, now unblocked (opening from the `odds_api` ~10:00
  poll, closing from the hook at kickoff = a genuine sequence).
- **EPL / La Liga** — blocked by a missing **opening** capture, which `887c843`
  does nothing about. Not patched blind: it needs its own probe into why the
  `odds_api` opening writes cover MLB/WNBA/Ligue 1 but not those two.

**The remaining real ask (re-filed):** capture `opening_odds` for EPL and La Liga.
That — not the hook — is the actual blocker for `Moved` on the marquee soccer.
Carry-forwards #2 (team-name aliasing) and #3 (non-AmbientDO sports) survive
unchanged.

**VERIFIED 2026-08-23** (was staged). Drift-sentinel runs 41 and 42 both read:

```
games with both prices: 8, not sequenced: 0
8 of 8 games showed a real open/close sequence.
✓ Closed issue #2 (closing_odds is not a closing line)
```

Drift-log row, same run: `both=8 notseq=0 moved=8 unmoved=0`.

Every game carrying both prices is now a genuine sequence, and all eight show
**movement** rather than a repeated snapshot. `887c843` + `f6fa820` + `a1937eb`
did what they claimed.

**`OddsStory.Moved` has been reachable from production data since 2026-08-23,
and was not before.** It shipped in June and every branch except `Moved` and
`Unmoved` had fired on real data; this is the first day the desk could narrate a
line movement without inventing one. Nothing in the laboratory changed to make
it true — the relay's kickoff capture reached a slate.

The sentinel closed issue #2 itself, which is the mechanism working as designed:
the issue was filed by a run and retired by a run, with no human deciding when
the claim stopped holding.

---

## UPDATE — the EPL/La Liga opening blocker was an alias gap, and it is FIXED (relay/client, 2026-08-21)

The re-filed ask ("capture `opening_odds` for EPL and La Liga") assumed the
opening line was never *written* for those two. Probed from source, the real
cause was narrower and the ask as I framed it was still slightly wrong: the
opening line was written, it just never *joined*. The odds join keys on
`resolveTeamKey(home)|resolveTeamKey(away)`, and `src/identity-resolver.js` had
alias sections for WC/International, EPL, MLS, WNBA, MLB, NBA and Ligue 1 — **and
none at all for La Liga**. A club stored one way in D1 and another by the feed
never matches, so the row keeps a NULL opening line permanently.

**Coverage, past dates only (the honest denominator — future fixtures have no
opening line yet and must be excluded):**

| sport | played rows | with opening | rate |
|-------|-------------|--------------|------|
| MLB | 807 | 704 | 87.2% |
| WNBA | 183 | 138 | 75.4% |
| MLS | 222 | 108 | 48.6% |
| **EPL** | 26 | 6 | **23.1%** |
| **La Liga** | 17 | 2 | **11.8%** |

This also **corrects an earlier laboratory number**: I had called MLS "the volume
case" at ~20% (108/548). That 548 included 326 future fixtures; past-dates-only
MLS is 48.6%. The real gaps are La Liga and EPL, not MLS.

**Shipped (relay `e4ad440`, `0faf37f`, `bb04fc8`):** a La Liga alias section; the
Spanish short-form convention (unqualified "Real" = Real Madrid, "Sociedad" = Real
Sociedad, "Betis" = Real Betis); all three promoted 2026-27 clubs (Coventry,
Ipswich, Hull); and Spanish nicknames. Guarded by
`scripts/check-team-identity-collisions.mjs` (7th deploy gate), negative-tested
three ways — a missing alias is a miss, but a *collision* attaches one club's line
to another club's game, which is why bare "Real" must never resolve to Betis.

**Still open (one decision, flagged not silently included):** `La Real` (a common
Real Sociedad form) is deliberately NOT aliased — under this convention any future
article-stripping turns `La Real` → `Real` → Real Madrid. If the feeds use it, it
needs an explicit entry *plus* a guard that it never resolves to Real Madrid.

**VERIFIED 2026-08-23 — and it had been verified for six hours before anyone
read it.** The relay's own probe (`scripts/verify-staged-items.mjs` check 2,
artifact `outbox/staged-verification-20260823T063649Z.json`) measured, past-dates
only:

| sport | played | with opening | rate | pre-fix baseline |
|-------|--------|--------------|------|------------------|
| EPL | 5 | 4 | **80.0%** | 23.1% |
| La Liga | 3 | 2 | **66.7%** | 11.8% |
| Ligue 1 | 5 | 3 | 60.0% | — |
| MLS | 8 | 6 | 75.0% | — |

`status: PASS — improved for EPL`. La Liga is flagged `below_floor (2/3)` — the
probe's `min_games_for_rate: 4` refusing to call 66.7% settled on three games,
which is the right answer and one a coarser check would have missed.

## Why this sat stale, and what changed so the next one cannot

**The blocker expired and nothing re-read it.** "Blocked by a soccer slate
running after `bb04fc8`" was true when written on 08-21. Soccer played on 08-22
and 08-23 — EPL, La Liga, Ligue 1 and Serie A were all on the slate. A Rule 74
staged item whose unblock condition is a **future event** goes stale silently:
nothing re-evaluates whether the event happened, so it can only be corrected by a
human noticing.

**The first plan to close it was the wrong instrument, and repeated a mistake
made the same morning.** That plan was to split the drift sentinel's
`both/notseq/moved/unmoved` aggregate by sport. The sentinel reads ONE DAY'S
SLATE. Coverage is a property of a population, so it is a table question — and
`check:sport-vocabulary`, built hours earlier that day, exists precisely because
slate-based measurement cannot answer population questions. Proposing it again
one item later is the error worth recording, not the fix.

**The measurement already existed and was better.** The relay's check is
past-dates-only, per-sport, against the measured baseline, with a min-games
floor. A second measurement in the laboratory would have been free to disagree
with it — the divergence class `CONTRACTS.md` exists to prevent.

**What shipped instead:** the ask is registered in `scripts/cc-cmd-followup.mjs`,
which re-evaluates every sentinel run and prints landed / not-yet. Three states,
six self-tests: a soccer game carrying an opening line reads LANDED; soccer
served with none reads NOT-LANDED (the pre-fix condition returning); an off-day
or empty slate reads `null`, so a Monday cannot report the fix as broken. The
relay's probe stays authoritative for the *rate*; this answers the daily question
of whether the relay is still doing it.

**Laboratory side of the render: nothing to build** — `oddsStory` already yields
`SingleSnapshot` on a lone capture and `Moved`/`Unmoved` on a real pair. Only the
measurement needs sharpening.

---

## Probe block — run first, from HEAD (Rule 87)

```bash
git log --oneline -5
# The defect, live: closing captured at/BEFORE opening, identical values.
curl -s "$RELAY/context/date/2026-08-21" | node -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8"));
  for (const g of d.games.regular.filter(x=>x.opening_odds&&x.closing_odds)) {
    const o=JSON.parse(g.opening_odds), c=JSON.parse(g.closing_odds);
    console.log(g.id, "open", o.captured_at, "close", c.captured_at,
      "seq?", new Date(c.captured_at) > new Date(o.captured_at),
      "same?", JSON.stringify(o.moneyline)===JSON.stringify(c.moneyline));
  }'
# Confirm the AmbientDO hook: is _captureClosingOdds wired and firing?
grep -n "_captureClosingOdds\|_gameStarts\|pendingStarts\|odds-backfill" src/ambient-do.js
```

## The evidence

**The laboratory can already narrate line movement — it has nothing to narrate.**
`src/Desk.fs` models `OddsStory.Moved of opening * closing * homeShift:
float<implied>` and `Unmoved`; `src/Scoreboard.fs` renders the card line
(`ML X -> Y (home +N.N pts implied)`) and `src/StatsView.fs` the Stats-tab row
(`line moved N.N% in implied terms`), all in devigged implied-probability terms
(`src/Units.fs`). Spec: Drive *The Odds Story Spec* v1→v3 (June 2026).

Every branch except `Moved`/`Unmoved` fires on real data. Measured on
`/context/date/2026-08-21`: each game's `closing_odds.captured_at` is at or
before its `opening_odds.captured_at` (e.g. WNBA `10:00:54.720Z` "open" vs
`10:00:36.300Z` "close") and the two are byte-identical. They are one snapshot
written to two columns — the `.github/scripts/odds-backfill.js` batch — not a
sequence. So the laboratory correctly renders `open/close NOT SEQUENCED (…)` and
refuses to invent a move. `OddsStory.Moved` has never been reachable from
production data. This is the drift-sentinel's open **issue #2** ("closing_odds is
not a closing line").

## The ask

Make `closing_odds` a genuine post-open capture. The design already exists — Drive
*Game State Transition Hook — Closing Odds Capture on pre→live* (2026-06-21):
AmbientDO detects `pre→live` inside the existing `scoreChanged` gate, dedupes via
a `_gameStarts` Set (mirroring `_finals`), and calls `_captureClosingOdds` to
fetch the Odds API line at kickoff and `UPDATE … WHERE closing_odds IS NULL`,
capped at 30 captures/day (Rule 78, ~1% of the 2700 ceiling).

The ask is to land (or re-activate) that hook so that, for a game that actually
went live, `closing_odds` is the line as of kickoff — captured strictly after
`opening_odds`, and different when the market moved. Nothing in the laboratory
changes; the `Moved`/`Unmoved` render is already shipped.

**Artifact:** on a game that transitioned pre→live, `closing_odds.captured_at >
opening_odds.captured_at`, and where the market moved the moneylines differ. The
laboratory's `oddsStory` then yields `Moved` (or `Unmoved` on a real no-move
pair) instead of `NotASequence`, and the card reads `ML X -> Y (home ±N.N pts
implied)`. Observable end to end: at least one `/context/date` game whose rendered
odds line is a movement, not `NOT SEQUENCED`.

## Carry-forwards named in the spec (do not re-derive)

- `_captureClosingOdds` writes `change_log` with `source='closing_odds_capture'`;
  the Brief Freshness Guard's materiality table does not yet recognise that
  source for the `favorite_flipped` check. Add it to `_ODDS_SOURCES` in the same
  pass or a fast follow.
- Team-name matching against the Odds API's canonical names (Türkiye / Czechia /
  DR Congo) uses the client's alias table today; port it relay-side if the hook
  produces >5% "no match" warns.
- Non-AmbientDO sports (CFL, AFL, …) still get `closing_odds` from the external CI
  job; unifying under the reconciler is the spec's phase 2, out of scope here.

## Scope boundary

- Laboratory: nothing. The line-movement layer is built and verified; this ask is
  purely about feeding it a real sequence.
- Not the live in-play odds path (`_fetchLiveOdds`) — that is unchanged.
- Rule 78 cap stays; a 30/day ceiling is the point, not a limitation to lift.
