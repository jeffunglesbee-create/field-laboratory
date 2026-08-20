# Outbox — the relay picks up the EFL Trophy but not the Champions League

**Date:** 2026-08-20
**Ships:** `docs/CC-CMD-2026-08-20-uefa-club-competitions.md` — an ask to the
relay, and a decision to NOT model the competitions laboratory-side yet

## The question

Jeff noticed the schedule carries the EFL Trophy but not the Champions League on
its Tuesday/Wednesday matchdays, and asked whether Europa/Conference League can
be picked up for Thursday.

## Where the gap is

Relay-side, not laboratory. The desk renders whatever `/context/date` returns,
and the relay's `V2_LEAGUES` config decides which competitions it fetches. The
three UEFA club competitions are simply not in it. Measured:

- `/context/date/2026-08-19` (Wednesday, CL playoff window): 49 games, none
  Champions League.
- `/context/date/2026-08-20` and `/2026-08-27` (Thursdays): MLS and Leagues Cup
  only.
- `/archive/query?sport=Champions League` / `UEFA Champions League` /
  `Europa League` → `count: 0` each. `La Liga` → a real row. The relay has never
  emitted a UEFA club game under any label.

## Can it be picked up — yes, it is a config addition

`FIELD — Soccer Data Source Migration` (Drive) has the exact mapping: ESPN
`uefa.champions` / `uefa.europa` / `uefa.europa.conf`, BSD lids 7 / 8 / 8, both
free and already integrated for club football. "The WC pipeline IS the club
pipeline. Same code, different config." The ask is three `V2_LEAGUES` entries.

## Why the laboratory side is deliberately NOT modelled yet

The instinct — and the initially-agreed plan — was to model UCL/Europa/Conference
in the `Sport` registry now so they render clean when they arrive. Three findings
say that would break this repo's own discipline:

1. **`sportOfString` matches the relay's label verbatim.** The relay's soccer
   labels are its own config strings — `"La Liga"`, `"EFL Trophy"` — not ESPN's.
   And the convention is not even self-consistent: Leagues Cup arrives as
   `sport: "MLS", league: "Leagues Cup"`, a league under a parent sport, while
   La Liga is its own sport. So the emit label for the Champions League is
   unknowable until the relay defines it. Guessing it is exactly the normaliser
   `Rule 53` forbids.

2. **The archive proves zero evidence.** `count: 0` for every UEFA label variant.
   Every existing entry cites its evidence — La Liga's comment names the corpus
   fixture and the sentinel date it was first observed. There is no equivalent
   sentence to write for a competition never served.

3. **`sport-registry-check` is scoped to "the sports production actually
   serves."** Its `SEEN` list and its "exactly two soccer competitions" assertion
   are about observed sports. La Liga was added on 2026-08-16 AFTER the sentinel
   reported it, not before. Model-on-observation is the pattern.

So a wrong guess here is *safe* — soccer renders home-first under
`UnknownConvention` regardless, and only the `UNMODELLED` flag stays — but it is
still an evidence-free entry the repo refuses on principle. The honest sequence
is: file the ask, let the relay define the label, and model on first observation.

## The follow-up is already automated

No new wiring needed. The drift-sentinel already files an unmodelled-sport issue
the moment a new `sport` string appears — it does this today for EFL Trophy. When
the relay ships the config, the first UEFA matchday trips that same alarm with
the real label attached, and the modelling becomes one evidence-backed line per
competition. The `cc-cmd-followup` registration is likewise left until the label
exists, rather than keyed on a guess.

## What landed here

The ask, filed with the exact config and — the part the laboratory actually needs
— a request that the relay declare the emit label. Applying it to the relay's
config (and placing the CC-CMD in `field-relay-nba/docs/`) is relay-repo work,
outside this session's scope.

## Correction — what the relay session found at HEAD

The relay session (jubilant-bassoon) probed HEAD before acting and corrected two
things in this entry. Recorded here rather than quietly edited away.

- **"The relay has no UEFA" was half wrong.** The three competitions have been in
  `V2_LEAGUES` since the June 26 migration, with the exact slugs and BSD lids,
  plus qualifying variants. `/v2/games?sport=ucl` fetched them on demand the
  whole time. The real gap was a *third* table: `/context/date` reads only
  `ARCHIVE_DB`, the archive is written by the journalism cron iterating a
  `LEAGUES` table, and that table had no UEFA row — so nothing was ever
  persisted. The title's "no UEFA" is true only of the archive, not the fetch.

- **The archive `count: 0` evidence probed the wrong table.** `/archive/query?
  sport=…` reads the *briefs* table, not `regular_season_games`; `count: 0` there
  proves no journalism brief exists, not that no game rows do. The `/context/date`
  measurements in this entry are the sound half; the archive-query line was
  measuring the wrong thing. The correct probe is a `/d1/execute` count against
  `regular_season_games WHERE sport LIKE 'UEFA%'`.

- **The no-guess decision was vindicated exactly.** The real labels are
  `"UEFA Champions League"` / `"UEFA Europa League"` / `"UEFA Europa Conference
  League"` (sport and league carry the same string), plus `… Qualifying`
  variants. The label this ask *suggested* — no `UEFA` prefix — appears nowhere
  in the relay. Had the laboratory modelled on that guess, it would have been
  wrong. And August is the qualifying round, so the three main entries alone
  would have rendered zero games on the cited date.

Relay session shipped six `LEAGUES` rows and a pre-deploy label-contract guard.
Open, tracked relay-side: whether the rows actually land live (~60% at hand-off).
The laboratory modelling stays deferred to first observation, now against the
confirmed labels. Full correction in `docs/CC-CMD-2026-08-20-uefa-club-competitions.md`.
