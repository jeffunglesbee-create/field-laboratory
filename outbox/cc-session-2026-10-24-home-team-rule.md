# Venue sourcing: the home team picks among ambiguous names (23 more rows)

CC-CMD: `docs/CC-CMD-2026-10-20-outdoor-venue-sourcing.md` (continues
`outbox/cc-session-2026-10-22-outdoor-venue-sourcing.md`, which landed 301 rows).
Follow-up filed from this work: `docs/CC-CMD-2026-10-24-venue-name-collisions.md`.

## What changed

36 candidates were refused as "ambiguous name": one search returned several
Wikidata stadiums more than 0.5 degrees apart ("Celtic Park" is three grounds).
The game that named the venue also names its home team, and Wikidata lists who
plays at each candidate (P466, and each club's own P115). `chooseByHome` picks
the candidate listing that team, **within the Wikidata family only**:
OpenStreetMap must still agree with the point, so the home team never stands in
for corroboration.

Matching, in order: tier 1, the same name once club affixes (FC, AS, S.L.) are
dropped from both sides; tier 2, the home name is the start or end of an
occupant's ("Washington" in "Washington Huskies", "Lions" in "Detroit Lions"),
allowed only when the home name carried no affix of its own. Several matching
entities are one answer when they are one place (Highmark Stadium and its former
name); in different places they pick nothing.

Result (venue-source run 40119286792): 324 accepted (was 301), 118 in review
(was 141). All 23 new rows are in `src/Venues.fs`'s generated block. Ambiguous
names fell from 36 to 7.

## Premises, and the one command that tested each (Rule 100)

| premise | command | result |
|---|---|---|
| Wikidata lists occupants for these stadiums | `--occupants`, run 40118565902 | 27 of 36 had an entity listing a team the matcher could read |
| the home name will not collide with club names | prototype over the probe | "Celtic" is inside "Castlebar Celtic F.C." and "Derry Celtic F.C."; exact-first fixed it. "Paris FC" minus FC is "Paris", the start of "Paris Saint-Germain"; affix gating fixed it |
| it picks the right ground | `--calibrate` over 155 venue/home pairs for the 109 hand-reviewed venues (homes from field-archive D1, queried 2026-10-24), run 40119203719 | below |
| the table's name is one ground | D1: every home at the 23 new names | 21 have one home; Nissan Stadium (Ole Miss) and Estadio Banorte (Club América, World Cup teams) are one ground each |

### Calibration (run 40119203719), coverage in its own output

`home-team matcher: checked 155 of 155 venue/home pairs`

- Matcher alone: 90 right, 1 wrong, 61 abstained, 2 no candidates, 1 named collision.
- **As production decides it** (the home pick, plus OpenStreetMap agreeing): 88
  accepted, **88 right, 0 wrong**.
- The one matcher-level wrong is American Family Field / Brewers, which picked
  the Brewers' Phoenix spring-training complex because the search returned only
  that candidate. Production consults the home team only when a name is
  ambiguous (two or more candidates), so this cannot occur there, and OpenStreetMap
  said Milwaukee, so the full decision did not accept it.
- Neutral-site national teams (Switzerland, Germany at BMO Field and Gillette) all
  abstained, as they should.

**What this does and does not show.** Of the 88, only 7 pairs (Chase Field,
Soldier Field, Stadium of Light, Toyota Stadium) were names that were genuinely
ambiguous; those are the independent test of the disambiguation, and all 7 were
right. The other 81 show the rule does not break names that were never
ambiguous. Seven pairs over four venues is a small sample for the claim "the
rule picks the right ground among look-alikes"; the 23 new rows were audited by
coordinates one by one instead (Celtic Park 55.85,-4.21 Glasgow; Rose Bowl
34.16,-118.17 Pasadena; Husky Stadium 47.65,-122.30 Seattle; Ford Field read as
a dome; Weserstadion's two entries collapsing to Bremen), and all were right.

## A defect the calibration found that is not in the rule

`Red Bull Arena` is one table row (Harrison NJ), and the archive files RB
Leipzig home games under the same string. The rule correctly picks Leipzig for
those. So a Leipzig game shows New Jersey weather today. Listed as a named
collision in `data/venue-homes-table.json`, excluded from the right/wrong count
and counted separately; the fix is a keying decision, filed as
`docs/CC-CMD-2026-10-24-venue-name-collisions.md`.

## Verified

- `venue-source.mjs --self-test` 39/39 (adds 10 for the matcher).
- Mutations, each caught: `venue-home-affix-loosened`,
  `venue-home-far-apart-picked`, `venue-home-exact-not-first`.
- F# suite 314/314 on the 324-row table; `check:venue-sourced` 5/5.
- Strict weather check, whole table, no flag (run 40119749386): `checked 433 of
  433 venues`, 12/12.
- Calibration, original rule on all 410 prior rows: 0 accepted wrong (same run).

## Not verified

- Done condition 2 of the parent CC-CMD (a green verify on a UEFA-and-CFB-only
  day) still waits for such a day.
- A future game at one of these 23 names played at a different ground would get
  this ground's weather (the Red Bull Arena class). The archive shows none today.
