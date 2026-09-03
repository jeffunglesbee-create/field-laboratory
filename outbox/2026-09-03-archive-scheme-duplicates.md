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

## Result

Pending the first dispatch. This section is filled in from the run, not from the
expectation.
