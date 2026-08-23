# Sport registry vs the relay's vocabulary — 2026-08-23

Covers `d73bbad`, `47a5e08`, `44d8e5d`.

## The defect

The drift sentinel went red on `unmodelled-sport` on ten separate days this
month — once per competition, each time on the morning that competition first
played:

| date | newly unmodelled |
|---|---|
| 08-14 | NFL |
| 08-15 | CFL, golf |
| 08-16 | La Liga, wnba |
| 08-18 | EFL Trophy |
| 08-21 | UEFA Europa Conference League Qualifying, UEFA Europa League Qualifying |
| 08-22 | Ligue 1, Serie A |

`drift-check` is right to fail on an unmodelled sport. The problem is *when it
can know*. It learns the vocabulary from **one day's slate**, so a competition
is undiscoverable until it next plays, and the first person to find out is
whoever reads a red run at 02:30 UTC.

Every one of those labels was already in the relay's games table before it
reached a slate. The information existed; nothing asked for it.

## What was built

`scripts/sport-vocabulary-check.mjs` (`npm run check:sport-vocabulary`) reads the
distinct `sport` labels from `regular_season_games` ∪ `postseason_games` and
resolves each through the same `sportOfString`/`sportMeta` the desk uses — from
the Fable build, not a second copy of the vocabulary. Three-way split, matching
the sentinel's own: modelled, declared-unmodelled with a recorded reason, or a
genuine registry gap. Only the third fails, so golf's deliberate omission cannot
read as a bug.

Briefs are deliberately **not** the source. A brief can carry a label no game row
ever had — the defect the 2026-08-23 relay migration corrected — and reading them
here would re-import noise the relay has just finished cleaning out.

**Measured gap on first run: laboratory modelled 11 of the relay's 26 labels.**

## The three that needed evidence, and what the rows said

A `Matchup` convention is not the only question a new `Sport` case answers. Golf
is the precedent: the relay packs a tournament and a round into `home`/`away`, so
those fields are not opponents, and modelling it under any `Matchup` would have
the desk state that a tournament played a round. So the probe returns three real
rows per missing label.

| label | measured | verdict |
|---|---|---|
| PGA Tour | `home=null away=null` on all three rows | **declared** — worse than golf, which at least packs strings into those columns. There are not two sides to order. |
| IPL | `Delhi Capitals v Lucknow Super Giants`, scores null | **declared** — a real contest, so the obstacle is the *convention*, not the shape. Cricket's home/away naming has not been derived here. |
| UFL | no sampled row, ever | **declared** — a case with no observed fixture is a guess wearing a type. |

**IPL is the one that went against the prior expectation.** It was assumed
modellable by analogy to the leagues already present. The row shows the contest
is real but leaves the convention open — and asserting a convention from general
knowledge is exactly what produced the AFL transposition this repository was
built around.

## Modelled (12), each from a sampled row

```
UEFA Champions League              PSG 1-1 Arsenal
UEFA Champions League Qualifying   Celtic 3-0 LASK Linz
UEFA Europa League                 SC Freiburg 0-3 Aston Villa
UEFA Europa League Qualifying      Kairat Almaty 0-3 Anderlecht
UEFA Europa Conference League      Crystal Palace 1-0 Rayo Vallecano
UEFA Europa Conf. League Qual.     Inter Turku 0-0 København
FIFA World Cup                     Spain 1-0 Argentina
EFL Trophy                         Mansfield 1-4 Man City U21
NBA, NHL                           AwayAtHome
wnba                               Connecticut Sun v New York Liberty
```

`CC-CMD-2026-08-20-uefa-club-competitions` said explicitly **not** to model the
UEFA labels while the archive showed zero rows for them. That was right then. The
rows exist now, with teams and scores, so the same rule says model them —
model-on-observation cuts both ways.

NBA and NHL take `AwayAtHome` from a statement already in `Desk.fs`: the `Matchup`
type's own doc comment names *"NFL, NBA, MLB, NHL"*. Not a convention imported
from outside the file.

`wnba` maps to the existing `WNBA` case. The relay's games table carries **both**
casings, and the 2026-08-23 migration deliberately left both alive because the
lowercase rows are real WNBA games. Second place a case fold is warranted, and
like `"epl"` it is spelled out rather than applied blanket — a blanket fold is how
two genuinely different labels silently become one sport.

## A staged item unblocked itself in the same run

```
games with both prices: 8, not sequenced: 0
8 of 8 games showed a real open/close sequence.
✓ Closed issue #2 (closing_odds is not a closing line)
```

`OddsStory.Moved` has been shipped since June and was **never once reachable from
production data**. It is now. That closes the staged verification carried in
`CC-CMD-2026-08-21-closing-odds-capture`, blocked since 2026-08-21. Nothing in
the laboratory changed to make it true — the relay's kickoff-capture fix reached
a slate.

## Verified vs not

- **VERIFIED:** the vocabulary gap, the per-label samples, and the odds sequence —
  all from CI against the live relay (run `32652611546`).
- **NOT verified locally:** the F# compile. `dotnet` is absent from this sandbox,
  which is why `scripts/install_dotnet.sh` exists. `sportMeta` is the only
  exhaustive match on `Sport` (`PickemView` matches an option, not the union), so
  a missing entry is a compile error and CI is the check.

## Open

- **IPL, UFL, PGA Tour** stay declared until there is evidence. IPL needs a
  derived cricket convention; UFL needs any observed row; PGA Tour needs the
  non-contest `Matchup` case that golf's entry has been asking for since it was
  written.
- The relay is not capturing IPL scores — both sampled rows have null scores.
  Noted here rather than filed, since it is one observation.

---

## The rule this work broke, and the gate that now catches it

`d73bbad`, `47a5e08` and `44d8e5d` all changed `scripts/` or `src/` with no
outbox entry. `check:history` failed verify run on each. This entry documents
the work, and — by that rule's own design — does **not** pair with those three
commits: the correlation is per-commit and settled at commit time.

`docs/history-boundary.txt` moved on 2026-08-17 and again on 2026-08-23 for the
same class of violation, and its last entry left an instruction for this exact
moment:

> a boundary moved twice in seven days is a mechanism being leaned on. If it
> moves a third time, the question stops being "absorb it" and starts being
> "why does source keep shipping without its entry".

**The answer, measured rather than guessed:** `.githooks/pre-commit` exists, is
fast, no-network and good, and `git config core.hooksPath .githooks` was never
set in this session. `scripts/install_pkgs.sh:38` sets it, and that script did
not run here. The gate that should have stopped the first of the three commits
was not installed — an opt-in guard that nothing opted into, not three separate
lapses of attention.

**What ships with this entry:**

- `scripts/staged-outbox-check.mjs` — the same predicate as `history-check.mjs`,
  worded identically on purpose (two guards that disagree about what a violation
  is are worse than one), asked of the **staged** files instead of of history.
  8 self-test assertions, including the exact shape that got through today: a new
  script plus the workflow that runs it, no entry.
- Wired into `.githooks/pre-commit` as `check:staged-outbox`.
- `core.hooksPath` set in this session.

`check:history` reports; this guards. The difference is that at pre-commit the
violation is still answerable — stage an entry, or split the commit — whereas
once it is in history the only remedy is the boundary.
