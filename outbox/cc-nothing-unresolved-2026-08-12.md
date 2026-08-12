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
