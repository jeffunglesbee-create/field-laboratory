# Nothing unresolved — 2026-08-12

Jeff:

> Nothing in stats should be unresolved.

He is right, and the screenshot of laboratory's deployed Stats tab shows why it
was intolerable: five `UNRESOLVED` badges on every card, seven cards, a page that
is mostly an apology.

## First answer, and it was half right

The rows were unresolved because I copied production's row list wholesale — PARK,
UMPIRE, two pitchers, records — and then admitted four of the five could not be
filled from `/context/date`. Marking the gap was better than production's silence
and it was still the wrong shape: **a report that asserts five rows and can fill
one is a report about the wrong subject.**

So `Row` was rewritten with no unresolved case. A row is constructed only from
data that exists, and every variant is backed by something this repo already
proved: the venue table (planet-checked daily), `oddsStory` including the
`NotASequence` finding, `formatDramaPeak` behind its ADR-002 amnesty witness,
`Scout.broadcastOf` which refuses to guess at an unknown outlet, and
`OvertimeStatus`. "Unresolved" is not avoided — it cannot be built.

## Second answer, from Jeff, and it corrects the first

> Everything is very much available already in various field repos. No need to
> reinvent the wheel.
>
> It does exist because this is the current production.

With a screenshot of jubilant-bassoon serving, right now:

```
PARK      Chase Field · -1% runs · -5% HR
UMPIRE    Jimenez · 50% overturns · 10 challenged · weak: down zone
ROCKIES   Ryan Feltner
DIAMONDBACKS  Merrill Kelly
Diamondbacks: 64-57 · Rockies: 47-73
```

Park factors for six different stadiums, umpire ABS ratings with challenge
counts and weak zones, real probable pitchers, real standings. None of it
invented and none of it unavailable — it is live.

**So dropping those rows is the wrong answer too.** I removed them because
`/context/date` does not carry them, having never asked where production gets
them. Probable pitchers and standings change daily, so they cannot be static
tables; they come from relay routes laboratory has never called. Park factors and
umpire ratings are static, and `docs/PRODUCTION-CLAIMS.md` has named
`getParkFactor` and `getUmpireABSRating` since the first session.

The pattern is one I have now repeated twice in a day: I treated a limitation of
the one endpoint I happened to be using as a limitation of the world.
`api.open-meteo.com` was "unreachable from runners" until it was reachable
yesterday; this data was "not in the payload" while it was on production's screen.

## What this commit is, stated exactly

The `UNRESOLVED` badges are gone, and the rows that remain are all real. That is
strictly better than the screenshot. It is **not** the finished answer — PARK,
UMPIRE, the pitchers and the records are absent rather than wrong, and they
should be present and filled from the same sources production reads.

## The unlock, and it was available all along

`add_repo` and `list_repos` are permission-gated, so I stopped there — and then
tried the FIELD MCP's `read_source`, which I had not. It works:

```
read_source("function getParkFactor", repo: jubilant-bassoon)
  -> docs/CC-CMD-2026-08-12-scouting-coverage-gaps.md
read_lines(that path, 1, 70)  -> the full text, including field.js:16388
```

**`docs/PRODUCTION-CLAIMS.md` has said since the first session that "no function
body from production has been read", and named the 1 MB contents-API cap as the
reason.** That was true of `read_file`. `read_source` and `read_lines` are
different tools on the same server, they are not capped the same way, and nothing
in this repo had ever tried them. Every SPEC row in that document was waiting on
a limitation that did not exist.

That is the third time in two days I have taken a limitation of the one route I
happened to use for a limitation of the world — Open-Meteo "unreachable from
runners", this data "not in the payload", production "unreadable".

## And production is already working on it

`docs/CC-CMD-2026-08-12-scouting-coverage-gaps.md`, dated today, is about the
same two gaps, and it adds a rule laboratory should adopt rather than contradict:

> These are **lookup-table coverage gaps**, not rendering bugs. In both cases the
> code is behaving correctly by omitting a row it has no data for... **Do not
> invent a park factor to fill a row (Rule 1).** If the venue genuinely has no
> published factor, the honest outcome is that the row stays absent and this is
> recorded as intended behaviour.

It also names the exact source of the records-line failure — substring matching
on `teamNick()`, where "both lookups must succeed or the whole line is dropped,
so one unmatched nickname silently removes the other team's record too" — which
is the `Rockies @ Diamondbacks` blank I had already noted from the screenshot.

So the next step is not a design question. It is: read `getParkFactor`,
`getUmpireABSRating` and the standings lookup out of `src/legacy/field.js` with
the tool that works, and carry the real tables — with production's Rule 1 intact,
so a venue with no published factor keeps no row rather than gaining an invented
one.

Also fixed, and worth naming: the F# harness returned **NO TEETH** on a check I
wrote, for the fourth time this session. "Every row kind has a non-empty label"
is true of anything, because `rowLabel` is derived from the case and cannot
return empty. The claim with content is that the five labels are DISTINCT — two
rows sharing one is a card whose reader cannot tell which is which.

CONFIDENCE: 96.

Artifacts: `VerifyMain` 43/43; `proof-check` 40/40 with the STATS cases repointed
— `Stats.ParkUnknown` is now FS0039 because the type is gone, which is the proof
that the unresolved case is unbuildable; `tab-check` 29/29 asserting **zero**
`[data-gap]` markers and at least one real row per card; the gate.

Docked four: this is an interim state and says so. The user asked for nothing
unresolved and got nothing unresolved, by a route that also removed four rows he
expects to see filled. That is a smaller lie than the badges and it is not what
was asked for.

---

## The two mutations the tree was carrying

The gate came back **92/100 with two failing rows**, reported verbatim and not
committed:

```
FAIL   0/20  the F# harness refuses a check with no counterexample
FAIL   0/20  breaking each invariant makes a check fail
```

Both were true statements about a tree nobody had meant to create. `git diff`
found two live mutations sitting in the working tree, from two different killed
runs:

```
src/Verify.fs    | true, false -> Held           →  | true, false -> NoTeeth
src/Weather.fs   | Retractable -> UnknownRoofState →  | Retractable -> PlayedInTheOpen
```

Those are `harness-calls-everything-toothless` and `retractable-assumed-open`,
two of this repo's own mutations, left applied. `mutation-check.mjs` restores on
`exit`, `SIGINT`, `SIGTERM`, `SIGHUP` and `uncaughtException` — and a container
restart is **SIGKILL**, which by definition runs no handler. The backups lived
in `mkdtempSync(tmpdir())`, which the same restart wiped. So the mutation stayed,
the backup vanished, and nothing recorded that either had happened.

The near-miss is the part worth keeping. The gate FAILED here only because both
stranded mutations happened to land in files with checks watching them. Had one
landed where every check still passed, the gate would have gone **green on a
deliberately broken invariant** and I would have committed it. The gate was not
protecting against this; it got lucky.

**The fix, and why it is a fix rather than a workaround.** The backup and a
marker naming what is applied are now written to `.mutation-state/` — in-repo,
gitignored, on disk *before* the file is touched. SIGKILL cannot stop a file
that already exists from continuing to exist. The next run finds the marker,
restores from the backup, says so, rebuilds, and only then measures. World
mutations record their shell restore command instead of a backup, so both kinds
heal.

`--self-test` proves the heal path on a throwaway file in tmp — never on real
source, because a self-test for a bug that damages the working tree must not
damage the working tree to prove it. It is now the third conjunct of the
existing mutation row, alongside the survivor half, so no row was added and
`docs/gate-rows.txt` is unchanged:

```
PASS  an abandoned mutation is detected
PASS  the abandoned file is restored from its backup
PASS  the marker is cleared, so the next run does not heal twice
PASS  a clean tree reports nothing to heal
```

This is the same failure class the repo keeps rediscovering, one level up: an
answer that is wrong for a reason unrelated to the thing being measured. The
gate's report pointed at the product. The product was fine.

## What production actually renders, which corrects a claim of mine

Reading `jubilant-bassoon`'s recorded fixture `docs/adapter-fixtures-mlb-ok.json`
— a real captured `statsapi.mlb.com` schedule response, not a description of one
— changes what "unresolved" even means here:

```
hydrate=broadcasts(all),team,linescore,probablePitcher(stats),officials
```

- **Records** arrive as `teams.{home,away}.leagueRecord` — `{wins, losses, ties,
  pct}` — inside the same schedule call, per game. There is no standings lookup.
  Production's Gap 2 bug (`if (hT && aT)`, where one unmatched nickname silently
  drops *both* teams' records) exists only because it re-derives by substring
  something the payload already carries per game.
- **`probablePitcher` is `{id, fullName, link}`.** The fixture's own field note:
  *"stats NOT embedded even with probablePitcher(stats) hydration;
  normalizeMLBPitcher returns null for stats fields."* Production's pitcher row
  is a bare name **because a bare name is all there is**.
- **`officials: []` for Scheduled games**, populated once in progress — which is
  why production shows an umpire on live cards and not on upcoming ones.

So laboratory's row demanded "name, ERA, W–L, arsenal" and badged UNRESOLVED for
three fields **that do not exist in the payload production uses**. Four of the
five badges per card were laboratory inventing a requirement and then failing it.
That is a worse error than an absent row: it told the reader data was missing
when the truth is that nobody has it.

`docs/PRODUCTION-CLAIMS.md` needs its cap claim narrowed too. "No function body
from production has been read" was true of `read_file`. `read_source` and
`read_lines` read production's modular `src/` fine. What is genuinely over the
cap is exactly two files — `index.html` and `src/legacy/field.js` — which return
`total_lines: 1` and empty content through every route. That is where
`PARK_FACTORS` and `UMPIRE_ABS_RATINGS` live, and it is a cap on the contents
API, not on the repository: `get_archive_url` plus a runner reaches it, which is
what `import-production-tables.yml` now does.

That makes four times in two days I have taken a limitation of the one route I
happened to try for a limitation of the world — Open-Meteo "unreachable from
runners", this data "not in the payload", production "unreadable", and now the
gate's own report "about the product".

---

## The rows are filled, from production's own tables

The import ran on a runner (run 31652166750) and committed three files:
`data/production-park-factors.json` (30 parks), `data/production-umpire-abs.json`
(51 umpires), and a wiring dump. `scripts/generate-scouting.mjs` turns the two
tables into `src/Scouting.fs`.

**The extraction was verified against a live render before anything was carried.**
Every value in the production screenshot matches the imported table exactly:

```
ARI  -1% runs  -5% HR  neutral   Chase Field      → "Chase Field · −1% runs · −5% HR"
SD   -7% runs  -9% HR  pitcher   Petco Park       → "… · 🛡 Pitcher's Park"
MIA   0% runs  -2% HR  neutral   loanDepot park   → "loanDepot park · 0% runs · −2% HR"
NYY  +4% runs +12% HR  neutral   Yankee Stadium   → "Yankee Stadium · +4% runs · +12% HR"
jimenez  10 challenged, rate .5  weak down        → "Jimenez · 50% overturns · 10 challenged · weak: down zone"
parra     4 challenged, rate .25 weak down-right  → "Parra · 25% overturns · 4 challenged · weak: down-right zone"
```

Laboratory now renders `Yankee Stadium · +4% runs · +12% HR` — the same string,
from the same numbers. No UNRESOLVED badge is reachable, because there is no
unresolved case to construct.

### What the types buy, specifically

- **`ParkFactor`'s fields are private.** The run factor is the integer 128 for
  Coors; ADR-002 PROHIBITED #3 makes displaying a raw composite a CRITICAL. The
  index is not reachable outside `Scouting.fs` — `p.Runs` is **FS1093**, now a
  proof case. The only exits return the signed deviation.
- **No stored rate.** Production carries `challenged`, `overturned` *and* `rate`
  — three fields, two facts, free to drift. Verified across all 51 umpires that
  `rate` is exactly `round(overturned/challenged, 3)`, so it is a function here
  and `u.Overturned` is FS1093 from outside. Second proof case.
- **The badge is a function of the tier.** Production keeps `badgeClass` beside
  `tier` as its own field.
- **The park lookup is keyed on venue name**, which the payload carries, rather
  than on `_homeAbbr || homeTeam`. Production's own CC-CMD blames that chain for
  two games losing the PARK row; there is no chain here to fail.

### Two things I did NOT do, both for production's Rule 1

- **The tier is carried, not derived.** I tried to derive it from the two
  factors and got two counterexamples — CHW 95/98 is `pitcher`, SEA 83/85 is
  `extreme_pitcher`, a fifth tier I had not seen. Fitting a rule to 28 of 30
  points and shipping it is how a park factor gets invented.
- **A venue with no published factor still gets no row.** `missing-park-factor-invented`
  is a mutation that adds a fallback; it is caught.

### The ATH/OAK finding, for production

The imported table has **no `ATH` key**. The Athletics' factors sit under `OAK`
against "Sutter Health Park". That answers the open half of Gap 1 in
`CC-CMD-2026-08-12-scouting-coverage-gaps`: for that game the abbreviation
resolves and the table lookup misses, and the entry *exists* under the old key.
An aliasing fix, not a missing number to invent.

### The pitcher and records rows: production has no more than laboratory does

Worth stating plainly because it corrects what the UNRESOLVED badges claimed.
`probablePitcher` is `{id, fullName, link}` — production's own fixture note says
stats are not embedded even with `probablePitcher(stats)` hydration. Records
arrive as `leagueRecord` per team inside the schedule call. So a pitcher row is
a bare name in production too, and the "missing ERA, W–L, arsenal" badge was
laboratory inventing a requirement and then failing it. Those two rows need the
statsapi schedule endpoint wired, which is a separate piece of work with a real
capture already identified (`docs/adapter-fixtures-mlb-ok.json`); they are named
here rather than half-built.

## `unused-check.mjs` was passing in one direction

Adding `Scouting.fs` exposed it. Five public values had **zero** consumers —
`abbrOf`, `tierOf`, `nameOf`, `umpWatch`, `tryPark` — and the row stayed green.

The cause: `unused-check` treats every `.mjs` in `scripts/` as a possible
reader, and `generate-scouting.mjs` contains the F# it emits as a string
literal. **The generator credited itself with reading every value it wrote.**
That file already documents this exact shape twice, for itself and for
`mutation-check.mjs` — "neither contains code that RUNS the values it names" —
and a generator is the sharpest case of it. Added to `SELF`; the five orphans
appeared immediately and were removed, along with the now-unread `Abbr` field.

`generated-value-never-read` is a new mutation that injects a dead value into
generated source, so the fix is a mechanism rather than a claim.

## A new gate row: generated source matches its generator

Generated source is still editable source. Nothing stopped a hand edit to a park
factor in `Scouting.fs` — the compiler would accept it, every row would stay
green, and the page would show a number that was no longer production's until
the next regeneration silently wiped it. `--check` regenerates in memory and
compares. Proven in both directions: it passes on the real file and refuses a
one-digit hand edit.

Weight 20, not 30: the numbers on screen may be fine. What is lost is the
guarantee that they came from production, which is the entire claim the import
makes.

## The substring trap, three times in one session

1. `park-average-reads-plus-zero` **SURVIVED** its first check, because the
   check asked whether the row contained `"0% runs"` and `"+0% runs"` contains
   `"0% runs"`. Fixed to an exact comparison. This is the same flaw production's
   CC-CMD names in its `teamNick()` matching — and I walked into it inside the
   check written to catch it.
2. Grepping for consumers of `tryPark` "found" one, because `tryParkByVenue`
   contains it.
3. `unused-check` already guards against exactly this with `\b` word
   boundaries, which is why its comment about `notYetStarted` /
   `notYetStartedAt` exists.

## Found and NOT closed

`Venues.fs` has no entry for **Citizens Bank Park, Nationals Park, Truist Park
or Sutter Health Park** — four MLB parks that therefore get no weather reading
at all. Two of the four have coordinates in production's `src/utils/venues.js`;
the other two are in no field repo I can read. Not added here: this repo's venue
discipline is that every coordinate is checked against Open-Meteo's resolved
timezone (the check that caught my Comerica error), and Open-Meteo has been
unreachable from runners since 2026-08-12. Adding four unverified rows to buy a
fuller Weather tab is the trade this repo exists to refuse.

CONFIDENCE: 96.

Artifacts: gate 530/530 across 23 rows; `VerifyMain` 50/50 with seven new checks
and no NO TEETH; `proof-check` 42/42 including two new FS1093 cases; six new
mutations all caught; `tab-check` 29/29; `separation-check` 10/10; the rendered
Stats card read back out of a real browser and compared string-for-string with
production's own render.

Docked four: the pitcher and records rows are named, not built.
