# Outbox — how FIELD differentiates when ESPN owns breadth

**Date:** 2026-08-20
**What this is:** a positioning note, written from a live side-by-side of ESPN's
Aug 20 coverage against FIELD's own relay output for the same games. It argues a
thesis, backs it with two exhibits measured from real data, and lists the builds
that follow. It is strategy, not shipped code — and it is honest that FIELD
currently *loses* on its own chosen axis in postgame, which is the whole reason
the axis is worth choosing.

## The thesis

Do not try to out-breadth ESPN. That page carries injuries, lineups,
career-vs-pitcher splits, standings, a win-probability arc, news, and tickets,
refreshed continuously. FIELD will not win that race and should not enter it.

ESPN's incentive is attention — DraftKings odds, VividSeats tickets, six lines of
gambling disclaimer on a single game page. That incentive is also its blind spot:
it renders everything at uniform confidence, including the stale and the wrong. A
"final" score beside "In progress." A matchup card that would brief a player on
the IL. A "closing" line that is a duplicate snapshot. ESPN cannot afford to say
"nothing happened here" or "we can't stand behind that."

FIELD can. The wedge is a source that **verifies, timestamps, and refuses** —
one whose product is not more data but *data you can trust and a mark on the data
you can't*. Everything below follows from that.

## Exhibit A — ESPN's postgame is honest; FIELD's is mislabeled

ESPN's postgame for Yankees–Orioles (Aug 19, final 5–3) is accurate: correct
final, a real win-probability arc, a clean scoring summary, the foul-ball
turning point named in the lede.

FIELD's own `game_recap` briefs for the same slate, pulled from
`/archive/query?date=2026-08-19`, are not. Several are `brief_type: game_recap`,
all stamped `10:02` (before kickoff), narrating a game still in progress:

- `game_recap_mls_761738`: "San Jose and LA Galaxy **remain scoreless five
  minutes into** this FS1 broadcast."
- `game_recap_mls_761736`: "Seattle and Austin **remain scoreless… through 46
  minutes**." (quality_score **191** — the highest on the slate.)
- `game_recap_mls_761729`: "Chicago **leads Orlando 2-1… in the 73rd minute**."

And a sport-label error: `epl_match_2026-08-19_espn:761725`, `sport: "EPL"`, whose
text reads "New England Revolution travel to face D.C. United tonight **in an MLS
matchup**." Labeled EPL, is MLS, and is a pregame preview filed as a match.

The "final score next to In progress" sin I would pin on ESPN is FIELD's here,
and worse — because FIELD *calls it a recap*.

## Exhibit B — the AP report is event-driven; FIELD's brief is a template

AP's recap of the same game leads with the turning point, not the score, and is
built from events: "Lombard hit a slow roller for an infield single to put New
York ahead. Then a wild pitch made it 5-3." "Rice's 34th home run went an
estimated 447 feet… landed just under the big scoreboard in right-center."
"Baltimore has lost three straight since pulling briefly ahead in the race for
the final wild card." It closes with an up-next: Cole vs Bradish for the sweep.

FIELD's best-scoring finished-game recap (761727, quality 186): "Miami and
Philadelphia finished in a 2-2 draw… Miami moves to 11-6-3… Both clubs split the
points after failing to break the deadlock." Score, records, one filler line. No
plays, no players, no turning point — a box score narrated by someone who did not
watch.

Two facts sit under this:

1. **FIELD stores the event feed it isn't using.** ESPN's summary off
   `espn_event_id` returns `keyEvents` (scoring plays, athletes, coordinates) and
   BSD returns `incidents` (goal / card / substitution with minute and score) —
   the raw material for AP texture, one join away, which FIELD templates season
   stats instead of. Measured 2026-08-21 (relay probe): **MLS `game_recap` briefs
   join at 100% (83/83), and every soccer competition is at 100%** — so
   event-grounding is unblocked for soccer today. The real join gaps are MLB
   (84%), WNBA (85%), and FIFA World Cup (73%), scoped separately. (This bullet
   was wrong twice before measurement: first it claimed "every row carries
   `espn_event_id`", then that MLS lacked it — the null ids I saw were
   future-dated schedule fixtures, not briefed rows. See
   `docs/CC-CMD-2026-08-20-brief-data-quality.md` rev 3.)

2. **`quality_score` rewards fluency over truth.** The highest-scored recap on
   the slate is a frozen, event-free, mislabeled mid-game snapshot (761736, 191).
   A metric that rates *that* a 191 is optimising for the wrong thing.
   `scoring_version` is `null` on these rows, so nothing even records which rubric
   graded them.

## What FIELD can build that ESPN and AP structurally can't

AP writes beautiful, unverifiable prose for one marquee game; ESPN renders
everything at flat confidence. Neither verifies, timestamps a claim's lineage, or
quantifies whether a game was worth watching. FIELD's substrate already can. Six
features, each on a primitive this repo already ships:

1. **Self-correcting briefs with a visible scar.** A brief amends itself when
   reality moves and shows the edit — "written 10:02 · game went final 5–3 ·
   corrected." (briefs + anchoring timestamps + verdict layer)
2. **Claims you can click.** Every sentence carries a confidence colour and
   unrolls its provenance chain — feed, capture time, check — and a shareable
   receipt keyed by the confidence-log run id. (confidence gate + provenance)
3. **The Nothing-Happened desk.** Rank the night's finished games by delivered
   drama; say which one to watch back, and which to skip. (drama_arc, sealed per
   ADR-002)
4. **The tripwire that referees the feed.** Generalise the scoreline verdict
   (Consistent / Impossible / Unsettled) to mark claims — FIELD's own and other
   outlets' — that can't be true. (scoreline verdict + `espn_event_id` join)
5. **"What did we know when."** Scrub a game's brief, odds, and win-prob back to
   any timestamp; replay the information, not just the highlights. (anchoring)
6. **The global drama exchange.** One live board ranking every game on Earth by
   how alive it is, a WNBA overtime against a UEFA qualifier. (cross-sport drama
   normalisation + the unified Sport registry)

## The roadmap the exhibits demand

Positioning is only credible if the postgame defects close. Two builds, in order:

1. **Event-grounded briefs.** Generate recaps from `keyEvents` / `incidents` off
   the `espn_event_id` join, not from season-stat templates — every claim sourced
   to a structured event, therefore checkable against the box score. This is what
   makes features 1, 2, and 4 possible at all.
2. **Recalibrate `quality_score`.** Weight event density, freshness (a recap of
   an unfinished game scores low, not high), and box-score agreement above
   fluency; stamp `scoring_version` so the rubric is recorded. Until then the
   metric points the wrong way.

Both are relay-side; filed as `docs/CC-CMD-2026-08-20-brief-data-quality.md`. The
laboratory's job is the verdict/provenance layer that turns event-grounded briefs
into the clickable, self-correcting, drama-ranked product above — the thing
neither ESPN nor AP can offer, because neither verifies and neither refuses.
