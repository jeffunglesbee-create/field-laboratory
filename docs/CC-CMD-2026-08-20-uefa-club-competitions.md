# CC-CMD-2026-08-20-uefa-club-competitions

**Filed from:** field-laboratory
**Ask to:** field-relay-nba (the relay's `V2_LEAGUES` config)
**Status:** open — the relay does not currently emit any UEFA club competition.

One-liner:
```
Add UEFA Champions League, Europa League, and Conference League to the relay's
V2_LEAGUES so their fixtures appear in /context/date, AND declare the exact
`sport`/`league` label each will carry so the laboratory can match it verbatim.
```

---

## The observation

The relay's soccer coverage is uneven in a way that shows on the desk. It emits
MLS, Leagues Cup, La Liga, and the EFL competitions, but not the three UEFA club
competitions — the marquee midweek football:

- **Champions League** — Tuesday and Wednesday.
- **Europa League** — Thursday.
- **Conference League** — Thursday.

Measured, not assumed:

- `/context/date/2026-08-19` (a Wednesday in the CL playoff-round window): 49
  games, `MLS=30 MLB=15 WNBA=2 EFL Trophy=1 La Liga=1`. No Champions League.
- `/context/date/2026-08-20` and `/2026-08-27` (Thursdays): the soccer is MLS and
  Leagues Cup only. No Europa or Conference League.
- `/archive/query?sport=Champions%20League`, `…=UEFA%20Champions%20League`, and
  `…=Europa%20League` each return `count: 0`. The relay has never stored a UEFA
  club-competition game under any of those labels. `…=La%20Liga` returns a real
  row, so the archive route and the probe are sound — the absence is real.

The EFL *Trophy* — an English lower-league cup — is picked up, while the
Champions League is not. That is the asymmetry worth closing.

## Why this is entirely a config addition

From `FIELD — Soccer Data Source Migration: API-Sports → ESPN + BSD`
(June 26 2026), the data sources already cover all three. Nothing new needs
building; the endpoints exist, free:

| competition       | ESPN slug           | BSD lid | note                                   |
| ----------------- | ------------------- | ------- | -------------------------------------- |
| Champions League  | `uefa.champions`    | 7       | all stages incl. qualifying / playoff  |
| Europa League     | `uefa.europa`       | 8       | —                                      |
| Conference League | `uefa.europa.conf`  | 8       | shares BSD lid 8 with Europa           |

The same doc's migration pattern: add `espnLeague` (and `bsdLeagueId`) to the
`V2_LEAGUES` entry; the existing `cfg.espnLeague` path in `handleV2Games` already
handles the early-return, the same path `wc26` uses. Its own words: *"The WC
pipeline IS the club pipeline. Same code, different config."*

BSD lid 7 is confirmed live via PSG vs Arsenal (UCL final, id 206718) and lid 8
via Freiburg vs Aston Villa (Europa, id 206891) in that doc's league-ID census.

## The ask has two parts, and the second is the one the laboratory needs

1. **Add the three competitions to `V2_LEAGUES`** with the slugs and lids above,
   so their fixtures appear in `/context/date` on their matchdays.

2. **Declare the exact `sport` label — and whether a `league` field is used —
   that each competition will carry in the payload.** This is not a formality.
   The laboratory's `sportOfString` matches the relay's label *verbatim*, by
   design: a normaliser is where two spellings silently become one sport, which
   is the failure `Rule 53` records. The relay's existing convention is not
   self-consistent enough to infer from:

   - La Liga arrives as `sport: "La Liga"` — the competition is its own sport.
   - Leagues Cup arrives as `sport: "MLS", league: "Leagues Cup"` — a league
     field under a parent sport.

   So the laboratory cannot know whether the Champions League will be
   `sport: "Champions League"`, `sport: "UEFA Champions League"`, or
   `sport: "…", league: "Champions League"` — and it must not guess. Whichever
   the relay chooses is correct; it just has to be stated, once, here.

   Suggested (matches the La Liga / EFL Trophy "competition common name"
   convention, no org prefix beyond the governing body):
   `"Champions League"`, `"Europa League"`, `"Conference League"`.

## What the laboratory does on each side of this

- **Until it lands:** these render honestly. An unmodelled soccer competition
  falls to `UnknownConvention`, which is home-first with a neutral separator —
  correct for association football — and is flagged `UNMODELLED SPORT` on the
  card. The drift-sentinel files the same unmodelled-sport issue it already files
  for EFL Trophy. Nothing renders wrong; it renders flagged.

- **When it lands:** the drift-sentinel observes the real label on the first
  matchday and the laboratory adds three `Sport` cases — `HomeVersusAway`,
  `IsSoccer = true`, `Modelled = true` — keyed on the declared label, each citing
  that observation as its evidence, exactly as `La Liga` was added on 2026-08-16
  after the sentinel first reported it. The modelling is one evidence-backed line
  per competition, and it is deliberately not written before the label is
  observed, because an entry with no observed evidence is the thing this repo's
  `sport-registry-check` ("against the sports production actually serves")
  refuses.

## The observable consequence, for follow-up

Once the relay declares the label, register this ask in
`scripts/cc-cmd-followup.mjs` with a probe against the declared string, e.g.
`/archive/query?sport=<declared-label>&limit=1` landing when
`results.length > 0`. It is left unregistered until then rather than guessed at,
for the same reason the modelling is: a `landed` predicate keyed on a label the
relay has not chosen is a claim from no data.

## Explicitly not in scope for the relay side

- No new endpoint, adapter, or analytics work — `adaptESPNSoccer` and the BSD
  enrichment already cover club football. This is `V2_LEAGUES` entries and a
  stated label, nothing more.
