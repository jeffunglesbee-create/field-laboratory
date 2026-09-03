# Is "every one MLS" a fact about the archive, or about the window?

`CC-CMD-2026-09-01-mls-dual-writer-duplicate` says:

> Sweep result: 1064 rows, 170 with no event id (16.0%), 61 non-distinct groups,
> **51 invisible to the event-id watcher**, every one MLS.

That was measured over **30 days of public `/context/date`**. On 2026-09-03 the
relay's provenance census (`CC-CMD-2026-09-02-d1-write-provenance`, Task 3,
run `33713216975`) read the tables themselves:

```
  regular_season_games: 2475 row(s)
  postseason_games: 275 row(s)

  2750 id(s) classified:
     2140  underscore  e.g. AFL_2026-03-05_sydney_carlton
      591  dash        e.g. 2026-03-07-mls-ne-hou, 2026-05-09-epl-bright-wolver
       19  other       e.g. nba-ecf-2026-g1, ufl-playoffs-2026-wk9
```

**591 dash-scheme rows, and `2026-05-09-epl-bright-wolver` is not MLS.**

The two figures do not contradict each other — a 30-day served window and a
whole-table read are different scopes, and 51 pairs is not a claim about 591
rows. But the CC-CMD's scoping decisions rest on the smaller measurement, and a
fix scoped to MLS leaves anything else in place. So the archive-wide version of
the question needs its own answer.

## The instrument

`scripts/probe-archive-scheme-duplicates.mjs`, dispatched by
`.github/workflows/archive-scheme-duplicates.yml`. It reads both game tables
through `POST /d1/execute` and reports:

1. every id, classified by scheme
2. `unrecognised` rows by sport — the dual writer's output
3. same-fixture clusters that **mix** schemes — the dual-writer signature
4. those clusters by sport, and by what can be concluded about each

### It imports rather than copies, deliberately

`schemeOf` from `game-id-scheme.mjs`; `classifyPair` and `groupsFor` from
`probe-fixture-identity-duplicates.mjs`. A local copy of any of them would drift,
and the drift would be invisible — this probe and the CC-CMD would disagree with
neither obviously wrong. Two self-tests assert the imported classifier still
calls the dash shape `unrecognised` and ours `provider-composite`, so a registry
change fails here instead of quietly changing what is being measured.

### Clustering is scoped to (sport, date), and not only for speed

`sameFixture` matches on token subsets. That is what makes it able to see
`Dream` and `Atlanta Dream` as one club, and it is also what would make a global
sweep over 2750 rows pair teams that merely share a word — this session already
found `sameTeam('D.C. United', 'Atlanta United FC')` returning true. Two rows are
only candidates for one fixture if they are the same sport on the same day, which
is also the only way the defect can occur. Two self-tests hold the line: the same
teams on two dates are two fixtures, and the same names in two sports are two
fixtures.

### The predicate that does the work, with its counterexample

```js
export const mixedScheme = (rows) => new Set((rows ?? []).map(r => schemeOf(r.id))).size > 1
```

Two rows of the **same** scheme are one writer running twice — a different
defect. Counting them together would let a fix for either look like a fix for
both, so the self-test asserts both directions and a mutation that drops the
scheme check fails it (11/12).

## Three states, and the middle one is the interesting one

| verdict | reading |
|---|---|
| `CONFIRMED` | every mixed-scheme cluster is MLS. The CC-CMD's scoping holds archive-wide. |
| `WIDER THAN FILED` | other sports appear, named. A fix scoped to MLS would leave them. |
| `NOT OBSERVED` | the archive holds no mixed-scheme cluster at all — the window saw something the table no longer does, which is its own finding. |

Within a cluster, a pair carrying no event id and no start time stays
`indistinguishable`. Calling it a duplicate invents a bug; calling it distinct
invents a doubleheader. The count of those is a question, not a bug total.

## Two defects found writing it, both caught by execution rather than reading

**One.** The first version printed `12/12 checks passed` and exited 1.
`summarize()` returns the **failed count**, not a boolean, and both sibling
probes already write `summarize() === 0 ? 0 : 1`.

**Two.** The sweep ran at module scope, so `check:import-purity` — which imports
every exporting module in `scripts/` — called `process.exit(1)` on import and
reported that everything after the import never ran. The sibling guards its sweep
with `isMain(import.meta.url)` at line 155 and this one now does too.

Both are the same shape as this repo's probe-first rule: the simulation said
pass, the execution said otherwise. Neither was visible in the code.

## Result — WIDER THAN FILED, and the CC-CMD's number was exactly right

Run `33775532885`, 2777 rows across both tables.

```
WIDER THAN FILED  the CC-CMD says "every one MLS". Archive-wide there are
                  53 mixed-scheme cluster(s) across 2 sport(s):
                  WNBA, MLS. The non-MLS ones are WNBA.
                  A fix scoped to MLS would leave those in place.
```

**51 MLS, 2 WNBA.** The CC-CMD's count is correct to the row; its scope claim is
off by two, and the two are the interesting ones.

| | MLS | WNBA |
|---|---|---|
| clusters | 51 | 2 |
| schemes | `provider-composite + unrecognised` | `provider-composite + sport-prefixed-external` |
| verdict | `indistinguishable` ×51 | **`duplicate` ×2** |

### The WNBA pairs are a different defect wearing the same shape

```
WNBA 2026-06-20 duplicate  provider-composite + sport-prefixed-external
    wnba_2026-06-20_atlantadre_indianafev
    WNBA_2026-06-20_dream_fever

WNBA 2026-06-20 duplicate  provider-composite + sport-prefixed-external
    wnba_2026-06-20_phoenixmer_seattlesto
    WNBA_2026-06-20_mercury_storm
```

Three things separate these from the 51:

1. **A third id scheme**, not the dash one. Lowercase sport prefix, underscore
   separators, ten-character team truncations (`atlantadre`, `indianafev`) —
   `sport-prefixed-external`, and the CC-CMD's writer hunt is not looking for it.
2. **They classify as `duplicate`, not `indistinguishable`.** `classifyPair`
   only returns `duplicate` on evidence: two rows sharing an event id, or two
   rows sharing a start time. The 51 MLS pairs carry neither and stay a question.
   These two are answered.
3. **They are therefore fixable now.** A pair with a shared discriminator can be
   merged without deciding whether it might be a doubleheader.

### What the sweep says about the 1007 `unrecognised` rows

`unrecognised` spans **22 sports** and 1007 rows:

```
MLS 520 · FIFA World Cup 103 · MLB 61 · EFL Cup 57 · UEFA ECL Qualifying 48
La Liga 41 · EPL 26 · UEFA EL Qualifying 24 · Ligue 1 21 · Serie A 20 · WNBA 19
PGA Tour 14 · UCL Qualifying 11 · NHL 9 · Bundesliga 9 · EFL Trophy 9 · NBA 8
IPL 2 · UFL 2 · UCL 1 · UEL 1 · UECL 1
```

**Only MLS produces mixed-scheme clusters.** So for the other ~487 `unrecognised`
rows, the non-standard writer is the *only* writer for that fixture — those are
not duplicates and merging is not the question there. That is a materially
different situation from the MLS 520, and nothing in the CC-CMD distinguishes
them.

### Two counts that look contradictory and are not

The relay census reported **591 dash-scheme**; this reports **1007
`unrecognised`**. Different predicates over the same rows:

- relay `idScheme`: `dash` requires a leading ISO date AND no underscore anywhere.
- laboratory `schemeOf`: `unrecognised` is everything matching none of seven
  known shapes.

`unrecognised` ⊇ `dash`. The 416 difference is rows in neither the dash shape nor
any recognised one — worth its own look, and not this probe's question.

Row count also moved: 2750 at 03:40 UTC, **2777 at 15:55**. Twenty-seven rows in
twelve hours. The writer is live, which is what
`CC-CMD-2026-09-01-mls-dual-writer-duplicate` Task 1 already concluded.

### What this changes

- **`CC-CMD-2026-09-01-mls-dual-writer-duplicate`'s title and scope.** Not
  MLS-only, and not one dual writer — two scheme pairs in two sports.
- **Its Task 3** (a shared upsert key) has two cases, not one, and the WNBA case
  needs no writer identification: the rows carry a discriminator.
- **`relay-duplicate-fixture-watch.mjs` is blind to both**, for the reason the
  CC-CMD already gives — it groups on `espn_event_id` and skips rows lacking one.
